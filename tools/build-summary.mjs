import fs from "node:fs";
import path from "node:path";

const inputPath = path.resolve("data", "jra-results-actual.csv");
const outputPath = path.resolve("data", "jra-condition-summary.csv");

const rows = parseCsv(fs.readFileSync(inputPath, "utf8"));
const entities = new Map();
const conditions = new Map();

for (const row of rows) {
  const year = row.date.slice(0, 4);
  const raceClass = row.raceClass || "未分類";
  const baseKey = [year, row.course, row.surface, row.distance, raceClass].join("|");
  const condition = conditions.get(baseKey) || {
    kind: "condition",
    year,
    course: row.course,
    surface: row.surface,
    distance: row.distance,
    raceClass,
    name: "__all__",
    starts: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    winReturn: 0,
    raceIds: new Set(),
    minDate: row.date,
    maxDate: row.date,
  };
  condition.starts += 1;
  condition.wins += row.finish === "1" ? 1 : 0;
  condition.seconds += row.finish === "2" ? 1 : 0;
  condition.thirds += row.finish === "3" ? 1 : 0;
  condition.winReturn += Number(row.winPayout) || 0;
  condition.raceIds.add(row.source);
  condition.minDate = row.date < condition.minDate ? row.date : condition.minDate;
  condition.maxDate = row.date > condition.maxDate ? row.date : condition.maxDate;
  conditions.set(baseKey, condition);

  for (const kind of ["jockey", "trainer", "horseNumber"]) {
    const name = kind === "horseNumber" ? row.horseNumber : row[kind];
    if (!name) continue;
    const entityKey = [kind, year, row.course, row.surface, row.distance, raceClass, name].join("|");
    const entity = entities.get(entityKey) || {
      kind,
      year,
      course: row.course,
      surface: row.surface,
      distance: row.distance,
      raceClass,
      name,
      starts: 0,
      wins: 0,
      seconds: 0,
      thirds: 0,
      winReturn: 0,
      raceIds: new Set(),
      minDate: row.date,
      maxDate: row.date,
    };
    entity.starts += 1;
    entity.wins += row.finish === "1" ? 1 : 0;
    entity.seconds += row.finish === "2" ? 1 : 0;
    entity.thirds += row.finish === "3" ? 1 : 0;
    entity.winReturn += Number(row.winPayout) || 0;
    entity.raceIds.add(row.source);
    entity.minDate = row.date < entity.minDate ? row.date : entity.minDate;
    entity.maxDate = row.date > entity.maxDate ? row.date : entity.maxDate;
    entities.set(entityKey, entity);
  }
}

const output = [...conditions.values(), ...entities.values()].map((row) => ({
  ...row,
  raceCount: row.raceIds.size,
}));

const headers = [
  "kind",
  "year",
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
  "minDate",
  "maxDate",
];

fs.writeFileSync(
  outputPath,
  [headers.join(","), ...output.map((row) => headers.map((header) => csvCell(row[header])).join(",")), ""].join("\n"),
  "utf8",
);

console.log(`summary_rows=${output.length}`);
console.log(`summary=${outputPath}`);

function parseCsv(text) {
  const arrays = csvToArrays(text.trim());
  const headers = arrays.shift();
  return arrays.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function csvToArrays(text) {
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
  const text = value instanceof Set ? String(value.size) : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
