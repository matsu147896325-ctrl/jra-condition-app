import fs from "node:fs";

const input = "data/jra-condition-summary.csv";
const output = "summary-data.js";
const chunkPrefix = "summary-data-rows-";
const chunkSize = 50000;

const rows = parseCsv(fs.readFileSync(input, "utf8").trim());
const headers = rows.shift();
const encodedColumns = ["kind", "course", "surface", "raceClass", "trackCondition", "raceCondition", "name"];
const dictionaries = Object.fromEntries(encodedColumns.map((column) => [column, []]));
const dictionaryMaps = Object.fromEntries(encodedColumns.map((column) => [column, new Map()]));
const compactHeaders = [
  "year",
  "kind",
  "course",
  "surface",
  "distance",
  "raceClass",
  "trackCondition",
  "raceCondition",
  "name",
  "starts",
  "wins",
  "seconds",
  "thirds",
  "winReturn",
  "raceCount",
];

const objects = rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
const meta = {
  startDate: objects.reduce((min, row) => row.minDate && row.minDate < min ? row.minDate : min, "9999-99-99"),
  endDate: objects.reduce((max, row) => row.maxDate && row.maxDate > max ? row.maxDate : max, ""),
};
const compactRows = objects.map((row) => [
  Number(row.year),
  dictionaryIndex("kind", row.kind),
  dictionaryIndex("course", row.course),
  dictionaryIndex("surface", row.surface),
  Number(row.distance),
  dictionaryIndex("raceClass", row.raceClass),
  dictionaryIndex("trackCondition", row.trackCondition),
  dictionaryIndex("raceCondition", row.raceCondition),
  dictionaryIndex("name", row.name),
  Number(row.starts),
  Number(row.wins),
  Number(row.seconds),
  Number(row.thirds),
  Number(row.winReturn),
  Number(row.raceCount),
]);

for (const file of fs.readdirSync(".")) {
  if (file.startsWith(chunkPrefix) && file.endsWith(".js")) fs.rmSync(file);
}

const chunkFiles = [];
for (let index = 0; index < compactRows.length; index += chunkSize) {
  const chunkNo = Math.floor(index / chunkSize) + 1;
  const file = `${chunkPrefix}${String(chunkNo).padStart(3, "0")}.js`;
  const rowsChunk = compactRows.slice(index, index + chunkSize);
  fs.writeFileSync(
    file,
    [
      `window.SUMMARY_ROWS = window.SUMMARY_ROWS.concat(${JSON.stringify(rowsChunk)});`,
      "",
    ].join("\n"),
    "utf8",
  );
  chunkFiles.push(file);
}

const version = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
fs.writeFileSync(
  output,
  [
    `window.SUMMARY_HEADERS = ${JSON.stringify(compactHeaders)};`,
    `window.SUMMARY_META = ${JSON.stringify(meta)};`,
    `window.SUMMARY_DICTIONARIES = ${JSON.stringify(dictionaries)};`,
    `window.SUMMARY_ROWS = [];`,
    `window.SUMMARY_CHUNKS = ${JSON.stringify(chunkFiles)};`,
    `window.SUMMARY_VERSION = ${JSON.stringify(version)};`,
    `window.SUMMARY_LOAD_ERROR = "";`,
    `window.SUMMARY_READY = window.SUMMARY_CHUNKS.reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {`,
    `  const script = document.createElement("script");`,
    `  script.src = src + "?v=" + window.SUMMARY_VERSION;`,
    `  script.onload = resolve;`,
    `  script.onerror = () => {`,
    `    window.SUMMARY_LOAD_ERROR = src + " を読み込めませんでした。summary-data.js と summary-data-rows-*.js を同じ場所にアップロードしてください。";`,
    `    reject(new Error(window.SUMMARY_LOAD_ERROR));`,
    `  };`,
    `  document.head.append(script);`,
    `})), Promise.resolve());`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(`summary_js_rows=${compactRows.length}`);
console.log(`summary_js_bytes=${fs.statSync(output).size}`);
console.log(`summary_js_chunks=${chunkFiles.length}`);
console.log(`summary_js_largest_chunk=${Math.max(...chunkFiles.map((file) => fs.statSync(file).size))}`);

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
