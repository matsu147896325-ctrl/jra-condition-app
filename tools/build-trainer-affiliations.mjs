import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PDFS = [
  "https://jra.jp/news/202402/pdf/020601_01.pdf",
  "https://jra.jp/news/202502/pdf/021101_01.pdf",
  "https://jra.jp/news/202602/pdf/021001_01.pdf",
];

const outDir = path.resolve("data", "reference");
const outputPath = path.resolve("trainer-affiliations.js");
const map = new Map();

fs.mkdirSync(outDir, { recursive: true });

for (const url of PDFS) {
  const fileName = path.join(outDir, path.basename(url));
  if (!fs.existsSync(fileName)) {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!response.ok) {
      console.warn(`skip=${response.status} ${url}`);
      continue;
    }
    fs.writeFileSync(fileName, Buffer.from(await response.arrayBuffer()));
  }

  const text = extractPdfText(fileName);
  for (const [name, affiliation] of parseAffiliations(text)) {
    map.set(normalizeName(name), affiliation);
  }
}

const object = Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b, "ja")));
fs.writeFileSync(outputPath, `window.TRAINER_AFFILIATIONS = ${JSON.stringify(object, null, 2)};\n`, "utf8");

console.log(`trainer_affiliations=${Object.keys(object).length}`);
console.log(`output=${outputPath}`);

function extractPdfText(fileName) {
  const code = [
    "from pypdf import PdfReader",
    "import sys",
    "r=PdfReader(sys.argv[1])",
    "print('\\n'.join(p.extract_text() or '' for p in r.pages))",
  ].join(";");
  const result = spawnSync(
    "C:\\Users\\matsu\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe",
    ["-c", code, fileName],
    { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
  );
  if (result.status !== 0) throw new Error(result.stderr || `PDF extraction failed: ${fileName}`);
  return result.stdout;
}

function parseAffiliations(text) {
  const pairs = [];
  let buffer = [];

  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (token === "美浦" || token === "栗東") {
      const name = normalizeName(buffer.join(""));
      if (isLikelyName(name)) pairs.push([name, token]);
      buffer = [];
    } else {
      buffer.push(token);
    }
  }

  return pairs;
}

function normalizeName(name) {
  return name
    .replace(/[　\s]/g, "")
    .replace(/[髙髙]/g, "高")
    .replace(/[隆]/g, "隆")
    .replace(/[邊]/g, "辺")
    .replace(/[齋]/g, "斉")
    .replace(/[齊]/g, "斉")
    .replace(/[關]/g, "関")
    .replace(/[濱]/g, "浜")
    .replace(/[實]/g, "実")
    .replace(/[德]/g, "徳")
    .replace(/[]/g, "高")
    .replace(/[㔟]/g, "勢");
}

function isLikelyName(name) {
  if (!name || name.length < 2 || name.length > 8) return false;
  if (/[0-9０-９]/.test(name)) return false;
  if (/年度|中央|競馬|氏名|所属|合格|調教師|免許|試験|日本/.test(name)) return false;
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name);
}
