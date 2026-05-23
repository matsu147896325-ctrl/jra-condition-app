import fs from "node:fs";

const csvPath = "data/jra-results-actual.csv";
const CONCURRENCY = 8;
const REQUEST_RETRIES = 6;

const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
const headers = rows.shift();
const sourceIndex = headers.indexOf("source");
const classIndex = headers.indexOf("raceClass");
const missingSources = [...new Set(rows.filter((row) => row[classIndex] === "未分類").map((row) => row[sourceIndex]))];
const classBySource = new Map();
let cursor = 0;
let done = 0;

console.log(`missing_sources=${missingSources.length}`);

async function worker() {
  while (cursor < missingSources.length) {
    const index = cursor;
    cursor += 1;
    const source = missingSources[index];

    try {
      const html = await fetchShiftJis(source);
      classBySource.set(source, parseRaceClass(html));
    } catch (error) {
      console.warn(`class_fix_failed=${source} ${error.message}`);
    }

    done += 1;
    if (done % 250 === 0) console.log(`class_fix_pages=${done}/${missingSources.length}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

let changed = 0;
for (const row of rows) {
  if (row[classIndex] !== "未分類") continue;
  const fixed = classBySource.get(row[sourceIndex]);
  if (fixed && fixed !== "未分類") {
    row[classIndex] = fixed;
    changed += 1;
  }
}

fs.writeFileSync(
  csvPath,
  [headers.join(","), ...rows.map((row) => row.map(csvCell).join(",")), ""].join("\n"),
  "utf8",
);

console.log(`fixed_rows=${changed}`);

async function fetchShiftJis(url) {
  const response = await fetchWithRetry(url, {}, url);
  return new TextDecoder("shift_jis").decode(await response.arrayBuffer());
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

function parseRaceClass(html) {
  const raceNameHtml = html.match(/<span class="race_name">([\s\S]*?)<\/span>/)?.[1] || "";
  const raceName = textOf(raceNameHtml);
  const classText = textOf(html.match(/<div class="cell class">([\s\S]*?)<\/div>/)?.[1]);
  const grade = extractGradeLabel(raceNameHtml);
  return classifyRace(raceName, classText, grade);
}

function extractGradeLabel(html) {
  const label = html.match(/class="grade_icon[\s\S]*?alt="([^"]+)"/)?.[1] || "";
  return decodeHtml(label).replace(/\s+/g, "");
}

function classifyRace(raceName, classText, grade) {
  if (grade.includes("GⅠ")) return "GⅠ";
  if (grade.includes("GⅡ")) return "GⅡ";
  if (grade.includes("GⅢ")) return "GⅢ";
  if (grade.includes("リステッド")) return "リステッド";

  const text = `${raceName} ${classText}`;
  if (/新馬|未勝利/.test(text)) return "新馬・未勝利";
  if (/3勝クラス/.test(text)) return "3勝クラス";
  if (/2勝クラス/.test(text)) return "2勝クラス";
  if (/1勝クラス/.test(text)) return "1勝クラス";
  if (/1600万円以下/.test(text)) return "3勝クラス";
  if (/1000万円以下/.test(text)) return "2勝クラス";
  if (/500万円以下/.test(text)) return "1勝クラス";
  if (/オープン/.test(text)) return "オープン特別";
  return "未分類";
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
