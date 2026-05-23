import fs from "node:fs";
import path from "node:path";

const ROOT = "https://www.jra.go.jp";
const csvPath = path.resolve("data", "jra-results-actual.csv");
const raceCachePath = path.resolve("data", "race-extra-cache.json");
const horseCachePath = path.resolve("data", "horse-pedigree-cache.json");
const RACE_CONCURRENCY = 8;
const HORSE_CONCURRENCY = 10;
const REQUEST_RETRIES = 6;

const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
const headers = rows.shift();
const sourceIndex = headers.indexOf("source");
const horseNumberIndex = headers.indexOf("horseNumber");
const horseIndex = headers.indexOf("horse");

const raceCache = loadJson(raceCachePath, {});
const horseCache = loadJson(horseCachePath, {});
const sources = [...new Set(rows.map((row) => row[sourceIndex]).filter(Boolean))];

console.log(`sources=${sources.length}`);
await fetchRaceExtras(sources);

const horseUrls = [
  ...new Set(
    Object.values(raceCache)
      .flatMap((extra) => Object.values(extra.horseUrls || {}))
      .filter(Boolean),
  ),
];

console.log(`horse_urls=${horseUrls.length}`);
await fetchHorsePedigrees(horseUrls);

const nextHeaders = ensureHeaders(headers, [
  "trackCondition",
  "raceCondition",
  "finalOdds",
  "oddsBand",
  "sire",
  "damsire",
]);
const headerIndex = Object.fromEntries(nextHeaders.map((header, index) => [header, index]));
const outputRows = rows.map((row) => {
  const next = Array.from({ length: nextHeaders.length }, (_, index) => row[index] ?? "");
  const source = row[sourceIndex];
  const horseNumber = row[horseNumberIndex];
  const raceExtra = raceCache[source] || {};
  const horseUrl = raceExtra.horseUrls?.[horseNumber] || "";
  const pedigree = horseCache[horseUrl] || {};
  const finalOdds = raceExtra.odds?.[horseNumber] || "";

  next[headerIndex.trackCondition] = raceExtra.trackCondition || "";
  next[headerIndex.raceCondition] = raceExtra.raceCondition || "";
  next[headerIndex.finalOdds] = finalOdds;
  next[headerIndex.oddsBand] = oddsBand(finalOdds);
  next[headerIndex.sire] = pedigree.sire || "";
  next[headerIndex.damsire] = pedigree.damsire || "";
  return next;
});

fs.writeFileSync(
  csvPath,
  [nextHeaders.join(","), ...outputRows.map((row) => row.map(csvCell).join(",")), ""].join("\n"),
  "utf8",
);

console.log(`enriched_rows=${outputRows.length}`);

async function fetchRaceExtras(sourceList) {
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < sourceList.length) {
      const index = cursor;
      cursor += 1;
      const source = sourceList[index];

      if (!raceCache[source]) {
        try {
          const html = await fetchShiftJis(source);
          const extra = parseRaceExtra(html);
          if (extra.oddsCname) {
            try {
              const oddsHtml = await postCname("/JRADB/accessO.html", extra.oddsCname);
              extra.odds = parseOdds(oddsHtml);
            } catch (error) {
              console.warn(`odds_failed=${source} ${error.message}`);
            }
          }
          delete extra.oddsCname;
          raceCache[source] = extra;
        } catch (error) {
          console.warn(`race_extra_failed=${source} ${error.message}`);
        }
      }

      done += 1;
      if (done % 250 === 0) {
        saveJson(raceCachePath, raceCache);
        console.log(`race_extra_pages=${done}/${sourceList.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: RACE_CONCURRENCY }, worker));
  saveJson(raceCachePath, raceCache);
}

async function fetchHorsePedigrees(urls) {
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor;
      cursor += 1;
      const url = urls[index];

      if (!horseCache[url]) {
        try {
          const html = await fetchShiftJis(url);
          horseCache[url] = parsePedigree(html);
        } catch (error) {
          console.warn(`horse_failed=${url} ${error.message}`);
        }
      }

      done += 1;
      if (done % 500 === 0) {
        saveJson(horseCachePath, horseCache);
        console.log(`horse_pages=${done}/${urls.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: HORSE_CONCURRENCY }, worker));
  saveJson(horseCachePath, horseCache);
}

function parseRaceExtra(html) {
  const raceNameHtml = html.match(/<span class="race_name">([\s\S]*?)<\/span>/)?.[1] || "";
  const raceName = textOf(raceNameHtml);
  const category = textOf(html.match(/<div class="cell category">([\s\S]*?)<\/div>/)?.[1]);
  const classText = textOf(html.match(/<div class="cell class">([\s\S]*?)<\/div>/)?.[1]);
  const rule = textOf(html.match(/<div class="cell rule">([\s\S]*?)<\/div>/)?.[1]);
  const trackCondition = parseTrackCondition(html);
  const oddsCname = html.match(/doAction\('\/JRADB\/accessO\.html', '([^']+)'/)?.[1] || "";
  const horseUrls = {};
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";

  for (const match of tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const rowHtml = match[1];
    const horseNumber = Number(textOf(cell(rowHtml, "num")));
    const horseHref = rowHtml.match(/<td class="horse">[\s\S]*?<a href="([^"]+)"/)?.[1] || "";
    if (horseNumber && horseHref) horseUrls[String(horseNumber)] = normalizeUrl(horseHref);
  }

  return {
    trackCondition,
    raceCondition: classifyRaceCondition(raceName, category, classText, rule),
    horseUrls,
    oddsCname,
    odds: {},
  };
}

function parseTrackCondition(html) {
  const baba = html.match(/<div class="cell baba">([\s\S]*?)<\/div>/)?.[1] || "";
  const conditions = [...baba.matchAll(/<li class="(?!weather)[^"]+">[\s\S]*?<span class="txt">([\s\S]*?)<\/span>/g)]
    .map((match) => textOf(match[1]))
    .filter(Boolean);
  return conditions[0] || "不明";
}

function classifyRaceCondition(raceName, category, classText, rule) {
  const text = `${raceName} ${category} ${classText} ${rule}`;
  const female = /牝/.test(text);

  if (/2歳/.test(category)) return female ? "2歳牝馬限定" : "2歳限定";
  if (/3歳/.test(category) && !/3歳以上/.test(category)) return female ? "3歳牝馬限定" : "3歳限定";
  if (female) return "牝馬限定";
  return "古馬混合";
}

function parseOdds(html) {
  const odds = {};
  const table = html.match(/<table class="basic narrow-xy tanpuku">([\s\S]*?)<\/table>/)?.[1] || "";

  for (const match of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const rowHtml = match[1];
    const horseNumber = Number(textOf(cell(rowHtml, "num")));
    const value = Number(textOf(cell(rowHtml, "odds_tan")).replace(/[^\d.]/g, ""));
    if (horseNumber && value) odds[String(horseNumber)] = value.toFixed(1);
  }

  return odds;
}

function parsePedigree(html) {
  return {
    sire: profileValue(html, "父"),
    damsire: profileValue(html, "母の父"),
  };
}

function profileValue(html, label) {
  const pattern = new RegExp(`<dt>${label}<\\/dt>\\s*<dd>([\\s\\S]*?)<\\/dd>`);
  return textOf(html.match(pattern)?.[1] || "");
}

function oddsBand(value) {
  const odds = Number(value);
  if (!odds) return "不明";
  if (odds < 2) return "1倍台";
  if (odds < 3) return "2倍台";
  if (odds < 4) return "3倍台";
  if (odds < 5) return "4倍台";
  if (odds < 6) return "5倍台";
  if (odds < 7) return "6倍台";
  if (odds < 8) return "7倍台";
  if (odds < 9) return "8倍台";
  if (odds < 10) return "9倍台";
  if (odds < 20) return "10倍台";
  if (odds < 30) return "20倍台";
  if (odds <= 50.9) return "30倍〜50倍台";
  if (odds < 100) return "51〜99倍台";
  return "100倍台以上";
}

async function postCname(pathname, cname) {
  const response = await fetchWithRetry(`${ROOT}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `cname=${cname}`,
  }, cname);
  return decodeShiftJis(await response.arrayBuffer());
}

async function fetchShiftJis(url) {
  const response = await fetchWithRetry(url, {}, url);
  return decodeShiftJis(await response.arrayBuffer());
}

async function fetchWithRetry(url, options, label) {
  let lastError;

  for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${label}`);
      if (![429, 500, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
    }

    const waitMs = Math.min(2000 * attempt, 12000);
    console.warn(`retry=${attempt}/${REQUEST_RETRIES} wait=${waitMs}ms target=${label}`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw lastError;
}

function decodeShiftJis(buffer) {
  return new TextDecoder("shift_jis").decode(buffer);
}

function normalizeUrl(url) {
  return (url.startsWith("http") ? url : `${ROOT}${url}`).replace("%2F", "/");
}

function cell(rowHtml, className) {
  return rowHtml.match(new RegExp(`<td class="${className}">([\\s\\S]*?)<\\/td>`))?.[1] ?? "";
}

function textOf(html = "") {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(text = "") {
  return text
    .replace(/&#8544;/g, "Ⅰ")
    .replace(/&#8545;/g, "Ⅱ")
    .replace(/&#8546;/g, "Ⅲ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function ensureHeaders(existing, additions) {
  const result = [...existing];
  additions.forEach((header) => {
    if (!result.includes(header)) result.push(header);
  });
  return result;
}

function loadJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
