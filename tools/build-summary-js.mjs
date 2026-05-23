import fs from "node:fs";

const input = "data/jra-condition-summary.csv";
const output = "summary-data.js";

const rows = parseCsv(fs.readFileSync(input, "utf8").trim());
const headers = rows.shift();
const encodedColumns = ["kind", "course", "surface", "raceClass", "name"];
const dictionaries = Object.fromEntries(encodedColumns.map((column) => [column, []]));
const dictionaryMaps = Object.fromEntries(encodedColumns.map((column) => [column, new Map()]));
const compactHeaders = [
  "year",
  "kind",
  "course",
  "surface",
  "distance",
  "raceClass",
  "name",
  "starts",
  "wins",
  "seconds",
  "thirds",
  "winReturn",
  "raceCount",
];

const objects = rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
const compactRows = objects.map((row) => [
  Number(row.year),
  dictionaryIndex("kind", row.kind),
  dictionaryIndex("course", row.course),
  dictionaryIndex("surface", row.surface),
  Number(row.distance),
  dictionaryIndex("raceClass", row.raceClass),
  dictionaryIndex("name", row.name),
  Number(row.starts),
  Number(row.wins),
  Number(row.seconds),
  Number(row.thirds),
  Number(row.winReturn),
  Number(row.raceCount),
]);

fs.writeFileSync(
  output,
  [
    `window.SUMMARY_HEADERS = ${JSON.stringify(compactHeaders)};`,
    `window.SUMMARY_DICTIONARIES = ${JSON.stringify(dictionaries)};`,
    `window.SUMMARY_ROWS = ${JSON.stringify(compactRows)};`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(`summary_js_rows=${compactRows.length}`);
console.log(`summary_js_bytes=${fs.statSync(output).size}`);

function dictionaryIndex(column, value) {
  const text = String(value ?? "");
  const map = dictionaryMaps[column];
  if (map.has(text)) return map.get(text);

  const index = dictionaries[column].length;
  dictionaries[column].push(text);
  map.set(text, index);
  return index;
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
