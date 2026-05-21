import fs from "node:fs";

const input = "data/jra-condition-summary.csv";
const output = "summary-data.js";

const rows = parseCsv(fs.readFileSync(input, "utf8").trim());
const headers = rows.shift();

fs.writeFileSync(
  output,
  [
    `window.SUMMARY_HEADERS = ${JSON.stringify(headers)};`,
    `window.SUMMARY_ROWS = ${JSON.stringify(rows)};`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(`summary_js_rows=${rows.length}`);
console.log(`summary_js_bytes=${fs.statSync(output).size}`);

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
