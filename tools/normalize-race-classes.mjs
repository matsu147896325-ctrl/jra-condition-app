import fs from "node:fs";

const csvPath = "data/jra-results-actual.csv";
const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
const headers = rows.shift();
const raceNameIndex = headers.indexOf("raceName");
const raceClassIndex = headers.indexOf("raceClass");
let changed = 0;

for (const row of rows) {
  const before = row[raceClassIndex];
  const after = normalizeRaceClass(row[raceNameIndex], before);
  if (before !== after) {
    row[raceClassIndex] = after;
    changed += 1;
  }
}

fs.writeFileSync(
  csvPath,
  [headers.join(","), ...rows.map((row) => row.map(csvCell).join(",")), ""].join("\n"),
  "utf8",
);

console.log(`normalized_rows=${changed}`);

function normalizeRaceClass(raceName, raceClass) {
  if (raceClass !== "未分類") return raceClass;
  if (/1600万円以下/.test(raceName)) return "3勝クラス";
  if (/1000万円以下/.test(raceName)) return "2勝クラス";
  if (/500万円以下/.test(raceName)) return "1勝クラス";
  return raceClass;
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
