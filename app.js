const COURSE_OPTIONS = [
  "札幌",
  "函館",
  "福島",
  "新潟",
  "東京",
  "中山",
  "中京",
  "京都",
  "阪神",
  "小倉",
];

const SURFACE_OPTIONS = ["芝", "ダート", "障害"];

const DISTANCE_OPTIONS = [
  1000,
  1200,
  1400,
  1600,
  1800,
  2000,
  2200,
  2400,
  2500,
  3000,
  3200,
];

const RACE_CLASS_OPTIONS = [
  "GⅠ",
  "GⅡ",
  "GⅢ",
  "リステッド",
  "オープン特別",
  "3勝クラス",
  "2勝クラス",
  "1勝クラス",
  "新馬・未勝利",
];

const SUMMARY_DATA_URLS = ["data/jra-condition-summary.csv", "jra-condition-summary.csv"];
const DEFAULT_DATA_URLS = ["data/jra-results-actual.csv", "jra-results-actual.csv"];

const state = {
  races: [],
  summary: [],
};

const fields = {
  course: document.querySelector("#course"),
  surface: document.querySelector("#surface"),
  distance: document.querySelector("#distance"),
  years: document.querySelector("#years"),
  minStarts: document.querySelector("#minStarts"),
  allClasses: document.querySelector("#allClasses"),
  raceClassOptions: document.querySelector("#raceClassOptions"),
};

const outputs = {
  dataCount: document.querySelector("#dataCount"),
  meetingCount: document.querySelector("#meetingCount"),
  raceCount: document.querySelector("#raceCount"),
  dateRange: document.querySelector("#dateRange"),
  conditionLabel: document.querySelector("#conditionLabel"),
  dataWarning: document.querySelector("#dataWarning"),
  jockeyWins: document.querySelector("#jockeyWins"),
  jockeyRate: document.querySelector("#jockeyRate"),
  trainerWins: document.querySelector("#trainerWins"),
  trainerRate: document.querySelector("#trainerRate"),
  horseNumberRows: document.querySelector("#horseNumberRows"),
  jockeyWinsTitle: document.querySelector("#jockeyWinsTitle"),
  jockeyRateTitle: document.querySelector("#jockeyRateTitle"),
  trainerWinsTitle: document.querySelector("#trainerWinsTitle"),
  trainerRateTitle: document.querySelector("#trainerRateTitle"),
};

document.querySelector("#loadSample").addEventListener("click", () => {
  loadDefaultData();
});

document.querySelector("#csvInput").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const text = await file.text();
  state.races = normalizeRows(parseCsv(text));
  state.summary = [];
  hydrateFilters();
  render();
  event.target.value = "";
});

Object.values(fields)
  .filter((field) => field instanceof HTMLElement && !["raceClassOptions", "allClasses"].includes(field.id))
  .forEach((field) => field.addEventListener("change", render));

fields.allClasses.addEventListener("change", () => {
  if (fields.allClasses.checked) {
    getRaceClassCheckboxes().forEach((checkbox) => {
      checkbox.checked = false;
    });
  }
  render();
});

hydrateFilters();
render();
loadDefaultData();

async function loadDefaultData() {
  outputs.dataWarning.textContent = "実データを読み込み中です。";
  try {
    if (window.SUMMARY_ROWS) {
      state.summary = normalizeSummaryRows(window.SUMMARY_ROWS);
    } else {
      const text = await fetchFirstAvailable(SUMMARY_DATA_URLS);
      state.summary = normalizeSummaryRows(parseCsv(text));
    }
    state.races = [];
  } catch (error) {
    try {
      const text = await fetchFirstAvailable(DEFAULT_DATA_URLS);
      state.races = normalizeRows(parseCsv(text));
      state.summary = [];
    } catch (fallbackError) {
      state.races = [];
      state.summary = [];
      outputs.dataWarning.textContent =
        "実データを読み込めませんでした。ページを再読み込みするか、CSV読み込みを使ってください。";
    }
  }
  hydrateFilters();
  render();
}

async function fetchFirstAvailable(urls) {
  const errors = [];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors.join(" / "));
}

function hydrateFilters() {
  fillSelect(fields.course, COURSE_OPTIONS);
  fillSelect(fields.surface, SURFACE_OPTIONS);
  fillSelect(fields.distance, DISTANCE_OPTIONS, formatDistance);
  fillRaceClassOptions();
}

function fillRaceClassOptions() {
  if (fields.raceClassOptions.children.length) return;

  RACE_CLASS_OPTIONS.forEach((raceClass) => {
    const label = document.createElement("label");
    label.className = "check-pill";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = raceClass;
    checkbox.addEventListener("change", () => {
      fields.allClasses.checked = !getRaceClassCheckboxes().some((item) => item.checked);
      render();
    });

    const text = document.createElement("span");
    text.textContent = raceClass;

    label.append(checkbox, text);
    fields.raceClassOptions.append(label);
  });
}

function fillSelect(select, values, labelFormatter = String) {
  const selected = select.value;
  const firstLabel = select.querySelector("option").textContent;
  select.replaceChildren(new Option(firstLabel, ""));
  values.forEach((value) => select.append(new Option(labelFormatter(value), String(value))));
  if (values.map(String).includes(selected)) select.value = selected;
}

function render() {
  if (state.summary.length) {
    renderSummaryMode();
    return;
  }

  const filtered = filterRaces();
  const jockeyStats = buildStats(filtered, "jockey");
  const trainerStats = buildStats(filtered, "trainer");
  const horseNumberStats = buildStats(filtered, "horseNumber").filter((row) => Number(row.name) > 0);
  const raceCount = countUniqueRaces(filtered);

  outputs.dataCount.textContent = state.races.length.toLocaleString("ja-JP");
  outputs.meetingCount.textContent = raceCount.toLocaleString("ja-JP");
  outputs.raceCount.textContent = filtered.length.toLocaleString("ja-JP");
  outputs.dateRange.textContent = dateRange(filtered);
  outputs.conditionLabel.textContent = conditionLabel();
  outputs.dataWarning.textContent = dataWarning(filtered, raceCount);
  updateRateTitles();

  renderRows(outputs.jockeyWins, sortByWins(jockeyStats), "jockey", "wins", "jockey");
  renderRows(outputs.jockeyRate, sortByRate(jockeyStats), "jockey", "rate", "jockey");
  renderRows(outputs.trainerWins, sortByWins(trainerStats), "trainer", "wins", "trainer");
  renderRows(outputs.trainerRate, sortByRate(trainerStats), "trainer", "rate", "trainer");
  renderHorseNumberRows(outputs.horseNumberRows, sortByHorseNumber(horseNumberStats));
}

function renderSummaryMode() {
  const filtered = filterSummaryRows();
  const conditionRows = filtered.filter((row) => row.kind === "condition");
  const starts = conditionRows.reduce((sum, row) => sum + row.starts, 0);
  const raceCount = conditionRows.reduce((sum, row) => sum + row.raceCount, 0);
  const dates = conditionRows.flatMap((row) => [row.minDate, row.maxDate]).filter(Boolean).sort();
  const jockeyStats = buildSummaryStats(filtered, "jockey");
  const trainerStats = buildSummaryStats(filtered, "trainer");
  const horseNumberStats = buildSummaryStats(filtered, "horseNumber");

  outputs.dataCount.textContent = starts.toLocaleString("ja-JP");
  outputs.meetingCount.textContent = raceCount.toLocaleString("ja-JP");
  outputs.raceCount.textContent = starts.toLocaleString("ja-JP");
  outputs.dateRange.textContent = dates.length ? `${dates[0]} - ${dates[dates.length - 1]}` : "-";
  outputs.conditionLabel.textContent = conditionLabel();
  outputs.dataWarning.textContent = dataWarningByCounts(starts, raceCount);
  updateRateTitles();

  renderRows(outputs.jockeyWins, sortByWins(jockeyStats), "jockey", "wins", "jockey");
  renderRows(outputs.jockeyRate, sortByRate(jockeyStats), "jockey", "rate", "jockey");
  renderRows(outputs.trainerWins, sortByWins(trainerStats), "trainer", "wins", "trainer");
  renderRows(outputs.trainerRate, sortByRate(trainerStats), "trainer", "rate", "trainer");
  renderHorseNumberRows(outputs.horseNumberRows, sortByHorseNumber(horseNumberStats));
}

function filterRaces() {
  const cutoff = getCutoffDate();
  return state.races.filter((race) => {
    if (fields.course.value && race.course !== fields.course.value) return false;
    if (fields.surface.value && race.surface !== fields.surface.value) return false;
    if (fields.distance.value && String(race.distance) !== fields.distance.value) return false;
    if (!matchesSelectedRaceClasses(race.raceClass)) return false;
    if (cutoff && race.date < cutoff) return false;
    return true;
  });
}

function filterSummaryRows() {
  return state.summary.filter((row) => {
    if (fields.course.value && row.course !== fields.course.value) return false;
    if (fields.surface.value && row.surface !== fields.surface.value) return false;
    if (fields.distance.value && String(row.distance) !== fields.distance.value) return false;
    if (!matchesSelectedRaceClasses(row.raceClass)) return false;
    return true;
  });
}

function selectedRaceClasses() {
  if (fields.allClasses.checked) return [];
  return getRaceClassCheckboxes()
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
}

function getRaceClassCheckboxes() {
  return [...fields.raceClassOptions.querySelectorAll('input[type="checkbox"]')];
}

function matchesSelectedRaceClasses(raceClass) {
  const classes = selectedRaceClasses();
  return !classes.length || classes.includes(raceClass);
}

function getCutoffDate() {
  const years = Number(fields.years.value);
  if (!years) return null;

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return cutoff.toISOString().slice(0, 10);
}

function conditionLabel() {
  const parts = [
    fields.course.value || "全競馬場",
    fields.surface.value || "全コース",
    fields.distance.value ? `${formatDistance(fields.distance.value)}` : "全距離",
    raceClassLabel(),
    fields.years.options[fields.years.selectedIndex].text,
  ];
  return parts.join(" / ");
}

function raceClassLabel() {
  const classes = selectedRaceClasses();
  if (!classes.length) return "全クラス";
  if (classes.length <= 3) return classes.join("・");
  return `${classes.length}クラス選択`;
}

function buildStats(races, key) {
  const stats = new Map();
  races.forEach((race) => {
    const name = race[key] || "不明";
    const current = stats.get(name) || {
      name,
      wins: 0,
      seconds: 0,
      thirds: 0,
      starts: 0,
      rate: 0,
      quinellaRate: 0,
      showRate: 0,
      winReturn: 0,
      roi: 0,
    };
    current.starts += 1;
    if (race.finish === 1) current.wins += 1;
    if (race.finish === 2) current.seconds += 1;
    if (race.finish === 3) current.thirds += 1;
    current.winReturn += race.winPayout || 0;
    current.rate = current.starts ? current.wins / current.starts : 0;
    current.quinellaRate = current.starts ? (current.wins + current.seconds) / current.starts : 0;
    current.showRate = current.starts ? (current.wins + current.seconds + current.thirds) / current.starts : 0;
    current.roi = current.starts ? current.winReturn / (current.starts * 100) : 0;
    stats.set(name, current);
  });
  return [...stats.values()];
}

function buildSummaryStats(rows, kind) {
  const stats = new Map();
  rows
    .filter((row) => row.kind === kind)
    .forEach((row) => {
      const current = stats.get(row.name) || {
        name: row.name,
        wins: 0,
        seconds: 0,
        thirds: 0,
        starts: 0,
        rate: 0,
        quinellaRate: 0,
        showRate: 0,
        winReturn: 0,
        roi: 0,
      };
      current.starts += row.starts;
      current.wins += row.wins;
      current.seconds += row.seconds;
      current.thirds += row.thirds;
      current.winReturn += row.winReturn;
      current.rate = current.starts ? current.wins / current.starts : 0;
      current.quinellaRate = current.starts ? (current.wins + current.seconds) / current.starts : 0;
      current.showRate = current.starts ? (current.wins + current.seconds + current.thirds) / current.starts : 0;
      current.roi = current.starts ? current.winReturn / (current.starts * 100) : 0;
      stats.set(row.name, current);
    });
  return [...stats.values()];
}

function countUniqueRaces(races) {
  return new Set(races.map((race) => race.raceId)).size;
}

function dateRange(races) {
  if (!races.length) return "-";
  const dates = races.map((race) => race.date).sort();
  return `${dates[0]} - ${dates[dates.length - 1]}`;
}

function dataWarning(races, raceCount) {
  if (!races.length) return "この条件に一致する実データがありません。";
  if (raceCount < 5) return "対象レースが5未満です。勝率ランキングはかなりブレます。";
  if (races.length < 50) return "対象出走が50未満です。勝率ランキングは参考値として見てください。";
  return "";
}

function dataWarningByCounts(starts, raceCount) {
  if (!starts) return "この条件に一致する実データがありません。";
  if (raceCount < 5) return "対象レースが5未満です。勝率ランキングはかなりブレます。";
  if (starts < 50) return "対象出走が50未満です。勝率ランキングは参考値として見てください。";
  return "";
}

function sortByWins(rows) {
  return filterByMinStarts(rows)
    .sort((a, b) => b.wins - a.wins || b.rate - a.rate || b.starts - a.starts)
    .slice(0, 10);
}

function sortByRate(rows) {
  return filterByMinStarts(rows)
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins || b.starts - a.starts)
    .slice(0, 10);
}

function sortByHorseNumber(rows) {
  return [...rows].sort((a, b) => Number(a.name) - Number(b.name));
}

function filterByMinStarts(rows) {
  const minStarts = Number(fields.minStarts.value) || 0;
  return [...rows].filter((row) => row.starts >= minStarts);
}

function updateRateTitles() {
  const minStarts = Number(fields.minStarts.value) || 0;
  const label = minStarts ? `${minStarts.toLocaleString("ja-JP")}以上` : "全て";
  outputs.jockeyWinsTitle.textContent = `勝利数 上位（${label}）`;
  outputs.jockeyRateTitle.textContent = `勝率 上位（${label}）`;
  outputs.trainerWinsTitle.textContent = `勝利数 上位（${label}）`;
  outputs.trainerRateTitle.textContent = `勝率 上位（${label}）`;
}

function renderRows(target, rows, nameKey, mode, entityType) {
  target.replaceChildren();
  if (!rows.length) {
    const emptyRow = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "empty";
    cell.colSpan = 7;
    cell.textContent = "対象データがありません";
    emptyRow.append(cell);
    target.append(emptyRow);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const displayName = entityType === "trainer" ? formatTrainerName(row.name) : row.name;
    const cells =
      mode === "wins"
        ? [
            displayName,
            row.wins,
            row.starts,
            formatRate(row.rate),
            formatRate(row.quinellaRate),
            formatRate(row.showRate),
            formatRate(row.roi),
          ]
        : [
            displayName,
            formatRate(row.rate),
            row.wins,
            row.starts,
            formatRate(row.quinellaRate),
            formatRate(row.showRate),
            formatRate(row.roi),
          ];
    cells.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    });
    target.append(tr);
  });
}

function renderHorseNumberRows(target, rows) {
  target.replaceChildren();
  if (!rows.length) {
    const emptyRow = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "empty";
    cell.colSpan = 7;
    cell.textContent = "対象データがありません";
    emptyRow.append(cell);
    target.append(emptyRow);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const cells = [
      `${Number(row.name)}番`,
      row.wins,
      row.starts,
      formatRate(row.rate),
      formatRate(row.quinellaRate),
      formatRate(row.showRate),
      formatRate(row.roi),
    ];
    cells.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    });
    target.append(tr);
  });
}

function formatRate(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatDistance(distance) {
  return `${Number(distance).toLocaleString("ja-JP")}m`;
}

function formatTrainerName(name) {
  const affiliation = window.TRAINER_AFFILIATIONS?.[name] || "その他";
  return `${name}（${affiliation}）`;
}

function normalizeRows(rows) {
  return rows
    .map((row) => ({
      date: String(row.date || "").trim(),
      course: String(row.course || "").trim(),
      surface: String(row.surface || "").trim(),
      distance: Number(String(row.distance || "").replaceAll(",", "")),
      raceClass: normalizeRaceClass(row.raceClass),
      race: Number(row.race) || 0,
      horseNumber: Number(row.horseNumber) || 0,
      horse: String(row.horse || "").trim(),
      jockey: String(row.jockey || "").trim(),
      trainer: String(row.trainer || "").trim(),
      winPayout: Number(row.winPayout) || 0,
      source: String(row.source || "").trim(),
      finish: Number(row.finish),
    }))
    .filter((row) => row.date && row.course && row.surface && row.distance && row.jockey && row.trainer && row.finish)
    .map((row) => ({
      ...row,
      raceId: [row.date, row.course, row.race || row.source || row.horse].join("|"),
    }));
}

function normalizeSummaryRows(rows) {
  const headers = window.SUMMARY_HEADERS || [];
  return rows
    .map((row) =>
      Array.isArray(row)
        ? Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
        : row,
    )
    .map((row) => ({
      kind: String(row.kind || "").trim(),
      course: String(row.course || "").trim(),
      surface: String(row.surface || "").trim(),
      distance: Number(String(row.distance || "").replaceAll(",", "")),
      raceClass: normalizeRaceClass(row.raceClass),
      name: String(row.name || "").trim(),
      starts: Number(row.starts) || 0,
      wins: Number(row.wins) || 0,
      seconds: Number(row.seconds) || 0,
      thirds: Number(row.thirds) || 0,
      winReturn: Number(row.winReturn) || 0,
      raceCount: Number(row.raceCount) || 0,
      minDate: String(row.minDate || "").trim(),
      maxDate: String(row.maxDate || "").trim(),
    }))
    .filter((row) => row.kind && row.course && row.surface && row.distance && row.raceClass && row.name);
}

function normalizeRaceClass(value) {
  return String(value || "未分類").trim();
}

function parseCsv(text) {
  const rows = csvToArrays(text.trim());
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
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
