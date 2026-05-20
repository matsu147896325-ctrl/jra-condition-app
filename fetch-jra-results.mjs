import fs from "node:fs";
import path from "node:path";

const ROOT = "https://www.jra.go.jp";
const ACCESS_PATH = "/JRADB/accessS.html";
const START_DATE = "2023-05-19";
const END_DATE = "2026-05-19";
const CURRENT_YEAR = Number(END_DATE.slice(0, 4));
const RACE_FETCH_CONCURRENCY = 8;

const outDir = path.resolve("data");
const csvPath = path.join(outDir, "jra-results-actual.csv");
const manifestPath = path.join(outDir, "jra-results-manifest.json");

const checkDigits = await loadMonthlyCheckDigits();
const monthCnames = buildMonthCnames(START_DATE, END_DATE, checkDigits);

console.log(`months=${monthCnames.length}`);

const raceLinks = await discoverRaceLinks(monthCnames);
console.log(`race_links=${raceLinks.length}`);

const rows = await fetchRaceRows(raceLinks);
rows.sort(compareRows);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(csvPath, toCsv(rows), "utf8");
fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(buildManifest(rows, raceLinks), null, 2)}\n`,
  "utf8",
);

console.log(`rows=${rows.length}`);
console.log(`races=${new Set(rows.map((row) => row.source)).size}`);
console.log(`csv=${csvPath}`);

async function loadMonthlyCheckDigits() {
  const html = await postCname("pw01skl00999999/B3");
  return Object.fromEntries(
    [...html.matchAll(/objParam\["(\d{4})"\]="([0-9A-F]{2})"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function buildMonthCnames(startDate, endDate, digits) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const yyyymm = `${year}${String(month).padStart(2, "0")}`;
    const yymm = yyyymm.slice(2);
    const digit = digits[yymm];

    if (!digit) throw new Error(`No JRA check digit for ${yyyymm}`);

    const primaryPrefix = year === CURRENT_YEAR ? "00" : "10";
    const fallbackPrefix = primaryPrefix === "00" ? "10" : "00";
    months.push({
      label: yyyymm,
      cnames: [`pw01skl${primaryPrefix}${yyyymm}/${digit}`, `pw01skl${fallbackPrefix}${yyyymm}/${digit}`],
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

async function discoverRaceLinks(months) {
  const srlCnames = new Set();
  const raceLinks = new Set();

  for (const month of months) {
    let html = "";
    let cnameUsed = "";

    for (const cname of month.cnames) {
      const candidate = await postCname(cname);
      if (!isParameterError(candidate)) {
        html = candidate;
        cnameUsed = cname;
        break;
      }
    }

    if (!html) {
      console.warn(`month_skipped=${month.label}`);
      continue;
    }

    const monthSrls = extractActionCnames(html, "pw01srl");
    monthSrls.forEach((cname) => srlCnames.add(cname));
    console.log(`month=${month.label} srl=${monthSrls.length} cname=${cnameUsed}`);
  }

  let done = 0;
  for (const cname of srlCnames) {
    const html = await postCname(cname);
    extractRaceResultLinks(html).forEach((link) => raceLinks.add(link));
    done += 1;
    if (done % 100 === 0) console.log(`race_day_pages=${done}/${srlCnames.size}`);
  }

  return [...raceLinks];
}

async function fetchRaceRows(links) {
  const rows = [];
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < links.length) {
      const index = cursor;
      cursor += 1;

      const url = links[index];
      try {
        const html = await fetchShiftJis(url);
        rows.push(...parseRace(url, html));
      } catch (error) {
        console.warn(`race_failed=${url} ${error.message}`);
      }

      done += 1;
      if (done % 250 === 0) console.log(`race_pages=${done}/${links.length}`);
    }
  }

  await Promise.all(Array.from({ length: RACE_FETCH_CONCURRENCY }, worker));
  return rows.filter((row) => row.date >= START_DATE && row.date <= END_DATE);
}

async function postCname(cname) {
  const response = await fetch(`${ROOT}${ACCESS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `cname=${cname}`,
  });
  if (!response.ok) throw new Error(`${response.status} ${cname}`);
  return decodeShiftJis(await response.arrayBuffer());
}

async function fetchShiftJis(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return decodeShiftJis(await response.arrayBuffer());
}

function decodeShiftJis(buffer) {
  return new TextDecoder("shift_jis").decode(buffer);
}

function isParameterError(html) {
  return /<title>パラメータエラー/.test(html);
}

function extractActionCnames(html, token) {
  return [...html.matchAll(/doAction\('\/JRADB\/accessS\.html', '([^']+)'\)/g)]
    .map((match) => match[1])
    .filter((cname) => cname.includes(token));
}

function extractRaceResultLinks(html) {
  return [...html.matchAll(/href="([^"]*accessS\.html\?CNAME=[^"]*pw01sde[^"]+)"/g)].map((match) =>
    normalizeUrl(match[1].replaceAll("&amp;", "&")),
  );
}

function normalizeUrl(url) {
  return (url.startsWith("http") ? url : `${ROOT}${url}`).replace("%2F", "/");
}

function parseRace(url, html) {
  const dateLine = textOf(html.match(/<div class="cell date">([\s\S]*?)<\/div>/)?.[1]);
  const courseLine = dateLine.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[\s\S]*?(\d+)回(.+?)(\d+)日/);
  const courseInfo = textOf(html.match(/<div class="cell course">([\s\S]*?)<\/div>/)?.[1]);
  const raceName = textOf(html.match(/<span class="race_name">([\s\S]*?)<\/span>/)?.[1]);
  const courseMatch = courseInfo.match(/([\d,]+)\s*メートル\s*（(芝|ダート|障害)/);
  const raceMatch = html.match(/race_number_main\/race_num_(\d+)\.png/);

  if (!courseLine || !courseMatch || !raceMatch) return [];

  const [, year, month, day, meeting, course, dayNo] = courseLine;
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const distance = Number(courseMatch[1].replaceAll(",", ""));
  const surface = raceName.includes("障害") ? "障害" : courseMatch[2];
  const race = Number(raceMatch[1]);
  const winPayouts = parseWinPayouts(html);
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  if (!tbody) return [];

  return [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((match) => parseRunner(match[1]))
    .filter(Boolean)
    .map((runner) => ({
      date,
      course,
      surface,
      distance,
      race,
      meeting: Number(meeting),
      day: Number(dayNo),
      finish: runner.finish,
      horseNumber: runner.horseNumber,
      horse: runner.horse,
      jockey: runner.jockey,
      trainer: runner.trainer,
      winPayout: winPayouts.get(runner.horseNumber) || 0,
      source: url,
    }));
}

function parseRunner(rowHtml) {
  const finishText = textOf(cell(rowHtml, "place"));
  if (!/^\d+$/.test(finishText)) return null;

  return {
    finish: Number(finishText),
    horseNumber: Number(textOf(cell(rowHtml, "num"))),
    horse: textOf(cell(rowHtml, "horse")),
    jockey: normalizeName(textOf(cell(rowHtml, "jockey"))),
    trainer: normalizeName(textOf(cell(rowHtml, "trainer"))),
  };
}

function parseWinPayouts(html) {
  const result = new Map();
  const winBlock = html.match(/<li class="win">([\s\S]*?)<\/li>/)?.[1] || "";

  for (const match of winBlock.matchAll(
    /<div class="line">[\s\S]*?<div class="num">([\s\S]*?)<\/div>[\s\S]*?<div class="yen">([\s\S]*?)<\/div>/g,
  )) {
    const number = Number(textOf(match[1]));
    const yen = Number(textOf(match[2]).replace(/[^\d]/g, ""));
    if (number && yen) result.set(number, yen);
  }

  return result;
}

function cell(rowHtml, className) {
  return rowHtml.match(new RegExp(`<td class="${className}">([\\s\\S]*?)<\\/td>`))?.[1] ?? "";
}

function textOf(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(name) {
  return name.replace(/^[▲△☆◇★]+/, "").replace(/\s+/g, "");
}

function compareRows(a, b) {
  const raceA = `${a.date}-${a.course}-${String(a.race).padStart(2, "0")}-${String(a.finish).padStart(2, "0")}`;
  const raceB = `${b.date}-${b.course}-${String(b.race).padStart(2, "0")}-${String(b.finish).padStart(2, "0")}`;
  return raceA.localeCompare(raceB, "ja");
}

function toCsv(items) {
  const headers = [
    "date",
    "course",
    "surface",
    "distance",
    "race",
    "meeting",
    "day",
    "finish",
    "horseNumber",
    "horse",
    "jockey",
    "trainer",
    "winPayout",
    "source",
  ];
  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvCell(item[header])).join(",")),
    "",
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildManifest(rows, raceLinks) {
  const countBy = (key) =>
    Object.fromEntries(
      Object.entries(rows.reduce((acc, row) => ((acc[row[key]] = (acc[row[key]] || 0) + 1), acc), {})).sort(
        ([a], [b]) => String(a).localeCompare(String(b), "ja"),
      ),
    );

  return {
    generatedAt: new Date().toISOString(),
    source: "JRA official race result HTML",
    startDate: START_DATE,
    endDate: END_DATE,
    raceLinks: raceLinks.length,
    rows: rows.length,
    races: new Set(rows.map((row) => row.source)).size,
    winners: rows.filter((row) => row.finish === 1).length,
    winnersWithWinPayout: rows.filter((row) => row.finish === 1 && row.winPayout > 0).length,
    courses: countBy("course"),
    surfaces: countBy("surface"),
    distances: countBy("distance"),
  };
}
