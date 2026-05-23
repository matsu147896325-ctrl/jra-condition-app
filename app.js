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

const TRACK_CONDITION_OPTIONS = ["良", "稍重", "重", "不良"];

const RACE_CONDITION_OPTIONS = [
  "古馬混合",
  "牝馬限定",
  "3歳限定",
  "3歳牝馬限定",
  "2歳限定",
  "2歳牝馬限定",
];

const ODDS_BAND_OPTIONS = [
  "1倍台",
  "2倍台",
  "3倍台",
  "4倍台",
  "5倍台",
  "6倍台",
  "7倍台",
  "8倍台",
  "9倍台",
  "10倍台",
  "20倍台",
  "30倍〜50倍台",
  "51〜99倍台",
  "100倍台以上",
];

const SUMMARY_META = window.SUMMARY_META || {};
const DATA_START_DATE = SUMMARY_META.startDate || "2016-01-01";
const DATA_END_DATE = SUMMARY_META.endDate || "2026-05-23";
const DATA_START_YEAR = Number(DATA_START_DATE.slice(0, 4));
const DATA_END_YEAR = Number(DATA_END_DATE.slice(0, 4));

const SUMMARY_DATA_URLS = ["data/jra-condition-summary.csv", "jra-condition-summary.csv"];
const DEFAULT_DATA_URLS = ["data/jra-results-actual.csv", "jra-results-actual.csv"];

const state = {
  races: [],
  summary: [],
  loadError: "",
  sorts: {
    jockeyWins: { key: "wins", direction: "desc" },
    jockeyRate: { key: "rate", direction: "desc" },
    trainerWins: { key: "wins", direction: "desc" },
    trainerRate: { key: "rate", direction: "desc" },
    horseNumberRows: { key: "horseNumber", direction: "asc" },
    sireWins: { key: "wins", direction: "desc" },
    sireRate: { key: "rate", direction: "desc" },
    damsireWins: { key: "wins", direction: "desc" },
    damsireRate: { key: "rate", direction: "desc" },
    oddsBandRows: { key: "oddsBand", direction: "asc" },
  },
};

const fields = {
  course: document.querySelector("#course"),
  surface: document.querySelector("#surface"),
  distance: document.querySelector("#distance"),
  years: document.querySelector("#years"),
  minStarts: document.querySelector("#minStarts"),
  allClasses: document.querySelector("#allClasses"),
  raceClassOptions: document.querySelector("#raceClassOptions"),
  allTrackConditions: document.querySelector("#allTrackConditions"),
  trackConditionOptions: document.querySelector("#trackConditionOptions"),
  allRaceConditions: document.querySelector("#allRaceConditions"),
  raceConditionOptions: document.querySelector("#raceConditionOptions"),
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
  sireWins: document.querySelector("#sireWins"),
  sireRate: document.querySelector("#sireRate"),
  damsireWins: document.querySelector("#damsireWins"),
  damsireRate: document.querySelector("#damsireRate"),
  oddsBandRows: document.querySelector("#oddsBandRows"),
  jockeyWinsTitle: document.querySelector("#jockeyWinsTitle"),
  jockeyRateTitle: document.querySelector("#jockeyRateTitle"),
  trainerWinsTitle: document.querySelector("#trainerWinsTitle"),
  trainerRateTitle: document.querySelector("#trainerRateTitle"),
  sireWinsTitle: document.querySelector("#sireWinsTitle"),
  sireRateTitle: document.querySelector("#sireRateTitle"),
  damsireWinsTitle: document.querySelector("#damsireWinsTitle"),
  damsireRateTitle: document.querySelector("#damsireRateTitle"),
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
  .filter(
    (field) =>
      field instanceof HTMLElement &&
      ![
        "raceClassOptions",
        "allClasses",
        "trackConditionOptions",
        "allTrackConditions",
        "raceConditionOptions",
        "allRaceConditions",
      ].includes(field.id),
  )
  .forEach((field) => field.addEventListener("change", render));

fields.allClasses.addEventListener("click", () => {
  setAllButtonActive(fields.allClasses, fields.raceClassOptions);
  render();
});

fields.allTrackConditions.addEventListener("click", () => {
  setAllButtonActive(fields.allTrackConditions, fields.trackConditionOptions);
  render();
});

fields.allRaceConditions.addEventListener("click", () => {
  setAllButtonActive(fields.allRaceConditions, fields.raceConditionOptions);
  render();
});

initSortableHeaders();
hydrateFilters();
render();
loadDefaultData();

async function loadDefaultData() {
  outputs.dataWarning.textContent = "実データを読み込み中です。";
  try {
    if (window.SUMMARY_READY) await window.SUMMARY_READY;
    if (window.SUMMARY_ROWS?.length) {
      state.summary = normalizeSummaryRows(window.SUMMARY_ROWS);
    } else {
      const text = await fetchFirstAvailable(SUMMARY_DATA_URLS);
      state.summary = normalizeSummaryRows(parseCsv(text));
    }
    state.races = [];
    state.loadError = "";
  } catch (error) {
    const summaryError = window.SUMMARY_LOAD_ERROR || error.message;
    try {
      const text = await fetchFirstAvailable(DEFAULT_DATA_URLS);
      state.races = normalizeRows(parseCsv(text));
      state.summary = [];
      state.loadError = "";
    } catch (fallbackError) {
      state.races = [];
      state.summary = [];
      state.loadError =
        summaryError || "実データを読み込めませんでした。ページを再読み込みするか、CSV読み込みを使ってください。";
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
  fillButtonOptions(fields.raceClassOptions, RACE_CLASS_OPTIONS, fields.allClasses);
  fillButtonOptions(fields.trackConditionOptions, TRACK_CONDITION_OPTIONS, fields.allTrackConditions);
  fillButtonOptions(fields.raceConditionOptions, RACE_CONDITION_OPTIONS, fields.allRaceConditions);
  updatePeriodOptions();
}

function initSortableHeaders() {
  const tableSorts = {
    jockeyWins: ["name", "wins", "starts", "rate", "quinellaRate", "showRate", "roi"],
    jockeyRate: ["name", "rate", "wins", "starts", "quinellaRate", "showRate", "roi"],
    trainerWins: ["name", "wins", "starts", "rate", "quinellaRate", "showRate", "roi"],
    trainerRate: ["name", "rate", "wins", "starts", "quinellaRate", "showRate", "roi"],
    horseNumberRows: ["horseNumber", "wins", "starts", "rate", "quinellaRate", "showRate", "roi"],
    sireWins: ["name", "wins", "starts", "rate", "quinellaRate", "showRate", "roi"],
    sireRate: ["name", "rate", "wins", "starts", "quinellaRate", "showRate", "roi"],
    damsireWins: ["name", "wins", "starts", "rate", "quinellaRate", "showRate", "roi"],
    damsireRate: ["name", "rate", "wins", "starts", "quinellaRate", "showRate", "roi"],
    oddsBandRows: ["oddsBand", "wins", "starts", "rate", "quinellaRate", "showRate", "roi"],
  };

  Object.entries(tableSorts).forEach(([tableId, keys]) => {
    const headers = document.querySelector(`#${tableId}`).closest("table").querySelectorAll("th");
    headers.forEach((header, index) => {
      const key = keys[index];
      const button = document.createElement("button");
      button.className = "sort-button";
      button.type = "button";
      button.dataset.sortTable = tableId;
      button.dataset.sortKey = key;
      button.textContent = header.textContent;
      button.addEventListener("click", () => {
        setSort(tableId, key);
        render();
      });
      header.replaceChildren(button);
    });
  });
}

function fillButtonOptions(container, values, allButton) {
  if (container.children.length) return;

  values.forEach((value) => {
    const button = document.createElement("button");
    button.className = "class-button";
    button.type = "button";
    button.value = value;
    button.textContent = value;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      button.classList.toggle("is-active");
      button.setAttribute("aria-pressed", button.classList.contains("is-active") ? "true" : "false");
      syncAllButton(allButton, container);
      render();
    });
    container.append(button);
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
  const sireStats = buildStats(filtered, "sire").filter((row) => row.name !== "不明");
  const damsireStats = buildStats(filtered, "damsire").filter((row) => row.name !== "不明");
  const oddsBandStats = buildStats(filtered, "oddsBand").filter((row) => ODDS_BAND_OPTIONS.includes(row.name));
  const raceCount = countUniqueRaces(filtered);

  outputs.dataCount.textContent = state.races.length.toLocaleString("ja-JP");
  outputs.meetingCount.textContent = raceCount.toLocaleString("ja-JP");
  outputs.raceCount.textContent = filtered.length.toLocaleString("ja-JP");
  outputs.dateRange.textContent = dateRange(filtered);
  outputs.conditionLabel.textContent = conditionLabel();
  outputs.dataWarning.textContent = dataWarning(filtered, raceCount);
  updateRateTitles();
  updateSortHeaders();

  renderRows(outputs.jockeyWins, sortForTable(jockeyStats, "jockeyWins", true), "jockey", "wins", "jockey");
  renderRows(outputs.jockeyRate, sortForTable(jockeyStats, "jockeyRate", true), "jockey", "rate", "jockey");
  renderRows(outputs.trainerWins, sortForTable(trainerStats, "trainerWins", true), "trainer", "wins", "trainer");
  renderRows(outputs.trainerRate, sortForTable(trainerStats, "trainerRate", true), "trainer", "rate", "trainer");
  renderHorseNumberRows(outputs.horseNumberRows, sortForTable(horseNumberStats, "horseNumberRows", false));
  renderRows(outputs.sireWins, sortForTable(sireStats, "sireWins", true), "sire", "wins", "sire");
  renderRows(outputs.sireRate, sortForTable(sireStats, "sireRate", true), "sire", "rate", "sire");
  renderRows(outputs.damsireWins, sortForTable(damsireStats, "damsireWins", true), "damsire", "wins", "damsire");
  renderRows(outputs.damsireRate, sortForTable(damsireStats, "damsireRate", true), "damsire", "rate", "damsire");
  renderBandRows(outputs.oddsBandRows, sortForTable(oddsBandStats, "oddsBandRows", false), "oddsBand");
}

function renderSummaryMode() {
  const filtered = filterSummaryRows();
  const conditionRows = filtered.filter((row) => row.kind === "condition");
  const starts = conditionRows.reduce((sum, row) => sum + row.starts, 0);
  const raceCount = conditionRows.reduce((sum, row) => sum + row.raceCount, 0);
  const period = getPeriodRange();
  const jockeyStats = buildSummaryStats(filtered, "jockey");
  const trainerStats = buildSummaryStats(filtered, "trainer");
  const horseNumberStats = buildSummaryStats(filtered, "horseNumber");
  const sireStats = buildSummaryStats(filtered, "sire").filter((row) => row.name !== "不明");
  const damsireStats = buildSummaryStats(filtered, "damsire").filter((row) => row.name !== "不明");
  const oddsBandStats = buildSummaryStats(filtered, "oddsBand").filter((row) => ODDS_BAND_OPTIONS.includes(row.name));

  outputs.dataCount.textContent = starts.toLocaleString("ja-JP");
  outputs.meetingCount.textContent = raceCount.toLocaleString("ja-JP");
  outputs.raceCount.textContent = starts.toLocaleString("ja-JP");
  outputs.dateRange.textContent = `${period.start} - ${period.end}`;
  outputs.conditionLabel.textContent = conditionLabel();
  outputs.dataWarning.textContent = dataWarningByCounts(starts, raceCount);
  updateRateTitles();
  updateSortHeaders();

  renderRows(outputs.jockeyWins, sortForTable(jockeyStats, "jockeyWins", true), "jockey", "wins", "jockey");
  renderRows(outputs.jockeyRate, sortForTable(jockeyStats, "jockeyRate", true), "jockey", "rate", "jockey");
  renderRows(outputs.trainerWins, sortForTable(trainerStats, "trainerWins", true), "trainer", "wins", "trainer");
  renderRows(outputs.trainerRate, sortForTable(trainerStats, "trainerRate", true), "trainer", "rate", "trainer");
  renderHorseNumberRows(outputs.horseNumberRows, sortForTable(horseNumberStats, "horseNumberRows", false));
  renderRows(outputs.sireWins, sortForTable(sireStats, "sireWins", true), "sire", "wins", "sire");
  renderRows(outputs.sireRate, sortForTable(sireStats, "sireRate", true), "sire", "rate", "sire");
  renderRows(outputs.damsireWins, sortForTable(damsireStats, "damsireWins", true), "damsire", "wins", "damsire");
  renderRows(outputs.damsireRate, sortForTable(damsireStats, "damsireRate", true), "damsire", "rate", "damsire");
  renderBandRows(outputs.oddsBandRows, sortForTable(oddsBandStats, "oddsBandRows", false), "oddsBand");
}

function filterRaces() {
  const period = getPeriodRange();
  return state.races.filter((race) => {
    if (fields.course.value && race.course !== fields.course.value) return false;
    if (fields.surface.value && race.surface !== fields.surface.value) return false;
    if (fields.distance.value && String(race.distance) !== fields.distance.value) return false;
    if (!matchesSelectedRaceClasses(race.raceClass)) return false;
    if (!matchesSelectedTrackConditions(race.trackCondition)) return false;
    if (!matchesSelectedRaceConditions(race.raceCondition)) return false;
    if (race.date < period.start || race.date > period.end) return false;
    return true;
  });
}

function filterSummaryRows() {
  return state.summary.filter((row) => {
    if (fields.course.value && row.course !== fields.course.value) return false;
    if (fields.surface.value && row.surface !== fields.surface.value) return false;
    if (fields.distance.value && String(row.distance) !== fields.distance.value) return false;
    if (!matchesSelectedRaceClasses(row.raceClass)) return false;
    if (!matchesSelectedTrackConditions(row.trackCondition)) return false;
    if (!matchesSelectedRaceConditions(row.raceCondition)) return false;
    if (!selectedYears().includes(row.year)) return false;
    return true;
  });
}

function selectedRaceClasses() {
  return selectedButtons(fields.allClasses, fields.raceClassOptions);
}

function selectedTrackConditions() {
  return selectedButtons(fields.allTrackConditions, fields.trackConditionOptions);
}

function selectedRaceConditions() {
  return selectedButtons(fields.allRaceConditions, fields.raceConditionOptions);
}

function selectedButtons(allButton, container) {
  if (allButton.classList.contains("is-active")) return [];
  return [...container.querySelectorAll("button")]
    .filter((button) => button.classList.contains("is-active"))
    .map((button) => button.value);
}

function setAllButtonActive(allButton, container) {
  allButton.classList.add("is-active");
  allButton.setAttribute("aria-pressed", "true");
  [...container.querySelectorAll("button")].forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-pressed", "false");
  });
}

function syncAllButton(allButton, container) {
  const hasSelected = [...container.querySelectorAll("button")].some((button) => button.classList.contains("is-active"));
  allButton.classList.toggle("is-active", !hasSelected);
  allButton.setAttribute("aria-pressed", hasSelected ? "false" : "true");
}

function matchesSelectedRaceClasses(raceClass) {
  const classes = selectedRaceClasses();
  return !classes.length || classes.includes(raceClass);
}

function matchesSelectedTrackConditions(trackCondition) {
  const conditions = selectedTrackConditions();
  return !conditions.length || conditions.includes(trackCondition);
}

function matchesSelectedRaceConditions(raceCondition) {
  const conditions = selectedRaceConditions();
  return !conditions.length || conditions.includes(raceCondition);
}

function getPeriodRange() {
  const value = fields.years.value;
  if (value === "all") {
    return {
      start: `${DATA_START_YEAR}-01-01`,
      end: DATA_END_DATE,
    };
  }
  if (value === "current") {
    return {
      start: `${DATA_END_YEAR}-01-01`,
      end: DATA_END_DATE,
    };
  }
  if (value === "previous") {
    return {
      start: `${DATA_END_YEAR - 1}-01-01`,
      end: `${DATA_END_YEAR - 1}-12-31`,
    };
  }

  const years = Number(value) || 10;
  const startYear = Math.max(DATA_START_YEAR, DATA_END_YEAR - years + 1);
  return {
    start: `${startYear}-01-01`,
    end: DATA_END_DATE,
  };
}

function updatePeriodOptions() {
  const currentYearLabel = DATA_END_DATE.endsWith("-12-31") ? String(DATA_END_YEAR) : `${DATA_END_YEAR}途中`;
  const labels = {
    all: `全期間（${DATA_START_YEAR}-${currentYearLabel}）`,
    10: `過去10年（${Math.max(DATA_START_YEAR, DATA_END_YEAR - 9)}-${currentYearLabel}）`,
    5: `過去5年（${Math.max(DATA_START_YEAR, DATA_END_YEAR - 4)}-${currentYearLabel}）`,
    3: `過去3年（${Math.max(DATA_START_YEAR, DATA_END_YEAR - 2)}-${currentYearLabel}）`,
    current: `今年（${currentYearLabel}）`,
    previous: `前年（${DATA_END_YEAR - 1}）`,
  };

  [...fields.years.options].forEach((option) => {
    if (labels[option.value]) option.textContent = labels[option.value];
  });
}

function selectedYears() {
  const period = getPeriodRange();
  const startYear = Number(period.start.slice(0, 4));
  const years = [];
  for (let year = startYear; year <= DATA_END_YEAR; year += 1) {
    years.push(String(year));
  }
  return years;
}

function conditionLabel() {
  const parts = [
    fields.course.value || "全競馬場",
    fields.surface.value || "全コース",
    fields.distance.value ? `${formatDistance(fields.distance.value)}` : "全距離",
    raceClassLabel(),
    trackConditionLabel(),
    raceConditionLabel(),
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

function trackConditionLabel() {
  const conditions = selectedTrackConditions();
  if (!conditions.length) return "全馬場";
  return conditions.join("・");
}

function raceConditionLabel() {
  const conditions = selectedRaceConditions();
  if (!conditions.length) return "全条件";
  if (conditions.length <= 3) return conditions.join("・");
  return `${conditions.length}条件選択`;
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
  if (state.loadError) return state.loadError;
  if (!races.length) return "この条件に一致する実データがありません。";
  if (raceCount < 5) return "対象レースが5未満です。勝率ランキングはかなりブレます。";
  if (races.length < 50) return "対象出走が50未満です。勝率ランキングは参考値として見てください。";
  return "";
}

function dataWarningByCounts(starts, raceCount) {
  if (state.loadError) return state.loadError;
  if (!starts) return "この条件に一致する実データがありません。";
  if (raceCount < 5) return "対象レースが5未満です。勝率ランキングはかなりブレます。";
  if (starts < 50) return "対象出走が50未満です。勝率ランキングは参考値として見てください。";
  return "";
}

function setSort(tableId, key) {
  const current = state.sorts[tableId];
  const defaultDirection = key === "name" || key === "horseNumber" || key === "oddsBand" ? "asc" : "desc";
  state.sorts[tableId] = {
    key,
    direction: current.key === key ? (current.direction === "asc" ? "desc" : "asc") : defaultDirection,
  };
}

function sortForTable(rows, tableId, limitRows) {
  const sort = state.sorts[tableId];
  const filtered = ["horseNumberRows", "oddsBandRows"].includes(tableId) ? [...rows] : filterByMinStarts(rows);
  const sorted = filtered.sort((a, b) => compareBySort(a, b, sort));
  return limitRows ? sorted.slice(0, 10) : sorted;
}

function compareBySort(a, b, sort) {
  const aValue = sortValue(a, sort.key);
  const bValue = sortValue(b, sort.key);
  const direction = sort.direction === "asc" ? 1 : -1;
  const result =
    typeof aValue === "string"
      ? aValue.localeCompare(bValue, "ja")
      : aValue - bValue;
  if (result) return result * direction;
  return b.wins - a.wins || b.starts - a.starts || String(a.name).localeCompare(String(b.name), "ja");
}

function sortValue(row, key) {
  if (key === "horseNumber") return Number(row.name);
  if (key === "oddsBand") return ODDS_BAND_OPTIONS.indexOf(row.name);
  if (key === "name") return String(row.name);
  return Number(row[key]) || 0;
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
  outputs.sireWinsTitle.textContent = `勝利数 上位（${label}）`;
  outputs.sireRateTitle.textContent = `勝率 上位（${label}）`;
  outputs.damsireWinsTitle.textContent = `勝利数 上位（${label}）`;
  outputs.damsireRateTitle.textContent = `勝率 上位（${label}）`;
}

function updateSortHeaders() {
  document.querySelectorAll(".sort-button").forEach((button) => {
    const sort = state.sorts[button.dataset.sortTable];
    const active = sort.key === button.dataset.sortKey;
    button.classList.toggle("is-sorted", active);
    button.dataset.direction = active ? sort.direction : "";
  });
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

function renderBandRows(target, rows) {
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
      row.name,
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
      year: String(row.date || "").slice(0, 4),
      course: String(row.course || "").trim(),
      surface: String(row.surface || "").trim(),
      distance: Number(String(row.distance || "").replaceAll(",", "")),
      raceClass: normalizeRaceClass(row.raceClass),
      trackCondition: String(row.trackCondition || "").trim(),
      raceCondition: String(row.raceCondition || "").trim(),
      race: Number(row.race) || 0,
      horseNumber: Number(row.horseNumber) || 0,
      horse: String(row.horse || "").trim(),
      jockey: String(row.jockey || "").trim(),
      trainer: String(row.trainer || "").trim(),
      winPayout: Number(row.winPayout) || 0,
      finalOdds: Number(row.finalOdds) || 0,
      oddsBand: String(row.oddsBand || "").trim(),
      sire: String(row.sire || "").trim(),
      damsire: String(row.damsire || "").trim(),
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
  const dictionaries = window.SUMMARY_DICTIONARIES || {};
  return rows
    .map((row) =>
      Array.isArray(row)
        ? decodeSummaryArray(headers, dictionaries, row)
        : row,
    )
    .map((row) => ({
      kind: String(row.kind || "").trim(),
      year: String(row.year || "").trim(),
      course: String(row.course || "").trim(),
      surface: String(row.surface || "").trim(),
      distance: Number(String(row.distance || "").replaceAll(",", "")),
      raceClass: normalizeRaceClass(row.raceClass),
      trackCondition: String(row.trackCondition || "").trim(),
      raceCondition: String(row.raceCondition || "").trim(),
      name: String(row.name || "").trim(),
      starts: Number(row.starts) || 0,
      wins: Number(row.wins) || 0,
      seconds: Number(row.seconds) || 0,
      thirds: Number(row.thirds) || 0,
      winReturn: Number(row.winReturn) || 0,
      raceCount: Number(row.raceCount) || 0,
    }))
    .filter(
      (row) =>
        row.kind &&
        row.year &&
        row.course &&
        row.surface &&
        row.distance &&
        row.raceClass &&
        row.trackCondition &&
        row.raceCondition &&
        row.name,
    );
}

function decodeSummaryArray(headers, dictionaries, row) {
  const decoded = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
  ["kind", "course", "surface", "raceClass", "trackCondition", "raceCondition", "name"].forEach((column) => {
    if (dictionaries[column]) decoded[column] = dictionaries[column][decoded[column]];
  });
  return decoded;
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
