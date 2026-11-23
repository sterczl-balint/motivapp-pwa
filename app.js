"use strict";

const STORAGE_KEY = "motivapp.data.v1";
const TIMER_MODES = ["stopwatch", "interval", "countdown"];
const MODE_LABELS = {
  stopwatch: "Stopper",
  interval: "Munka / pihenő",
  countdown: "Visszaszámláló"
};
const PROGRESS_TABS = ["chart", "results", "medals"];
const SPORTS = [
  "Foci",
  "Jégkorong",
  "Síkvízi kajak-kenu",
  "Evezés",
  "Vízilabda",
  "Szlalom kajak-kenu",
  "Kajakpóló"
];
const SPORT_OPTIONS = {
  "Foci": { label: "Foci", icon: "goal", source: "football" },
  "Jégkorong": { label: "Jégkorong", icon: "goal", source: "hockey" },
  "Síkvízi kajak-kenu": { label: "Kajak", icon: "sailboat", source: "canoe" },
  "Evezés": { label: "Evezés", icon: "sailboat", source: "rowing" },
  "Vízilabda": { label: "Vízilabda", icon: "waves", source: "water-polo" },
  "Szlalom kajak-kenu": { label: "Szlalom", icon: "sailboat", source: "canoe" },
  "Kajakpóló": { label: "Kajakpóló", icon: "sailboat", source: "canoe" }
};
const COMPETITION_SOURCES = {
  football: {
    name: "MLSZ · OTP Bank Liga",
    url: "https://adatbank.mlsz.hu/",
    readerUrl: "https://r.jina.ai/http://adatbank.mlsz.hu/"
  },
  hockey: {
    name: "MJSZ versenynaptár",
    url: "https://www.jegkorongszovetseg.hu/versenynaptar",
    readerUrl: "https://r.jina.ai/http://www.jegkorongszovetseg.hu/versenynaptar"
  },
  canoe: {
    name: "Magyar Kajak-Kenu Szövetség",
    url: "https://kajakkenusport.hu/naptar",
    readerUrl: "https://r.jina.ai/http://kajakkenusport.hu/naptar"
  },
  rowing: {
    name: "Magyar Evezős Szövetség",
    url: "https://www.hunrowing.hu/verseny/lista/",
    readerUrl: "https://r.jina.ai/http://www.hunrowing.hu/verseny/lista/?ical=1"
  },
  "water-polo": {
    name: "Magyar Vízilabda Szövetség",
    url: "https://waterpolo.hu/",
    readerUrl: "https://r.jina.ai/http://waterpolo.hu/"
  }
};
const COMPETITION_CACHE_DURATION = 15 * 60 * 1000;
const defaults = {
  profile: {
    email: "",
    name: "",
    club: "",
    gender: "",
    notifications: "all",
    language: "hu"
  },
  workouts: [],
  recentWorkoutNames: [],
  sports: [],
  sessions: [],
  results: [],
  medals: []
};

function freshData() {
  return { profile: { ...defaults.profile }, workouts: [], recentWorkoutNames: [], sports: [], sessions: [], results: [], medals: [] };
}

function readData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return freshData();
    const parsed = JSON.parse(saved);
    return {
      profile: { ...defaults.profile, ...(parsed.profile || {}) },
      workouts: Array.isArray(parsed.workouts) ? parsed.workouts : [],
      recentWorkoutNames: Array.isArray(parsed.recentWorkoutNames)
        ? parsed.recentWorkoutNames.filter((name) => typeof name === "string")
        : [],
      sports: Array.isArray(parsed.sports) ? parsed.sports.filter((sport) => SPORTS.includes(sport)) : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      results: Array.isArray(parsed.results) ? parsed.results : [],
      medals: Array.isArray(parsed.medals) ? parsed.medals : []
    };
  } catch (error) {
    console.error("A helyi adatok beolvasása nem sikerült.", error);
    return freshData();
  }
}

const data = readData();
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
let toastTimeout;
let internetAvailable = navigator.onLine;
let connectionCheckId = 0;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2800);
}

function saveData(message = "") {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (message) showToast(message);
    return true;
  } catch (error) {
    console.error("Az adatok mentése nem sikerült.", error);
    showToast("Nem sikerült menteni. Ellenőrizd az eszköz tárhelyét.");
    return false;
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderLucide() {
  window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
}

function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function dateLabel(value, options = { month: "short", day: "numeric" }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ismeretlen dátum";
  return new Intl.DateTimeFormat("hu-HU", options).format(date);
}

function todayISO() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function initialize() {
  const now = new Date();
  $("#today-label").textContent = new Intl.DateTimeFormat("hu-HU", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  }).format(now);
  $("#result-date").value = todayISO();
  $("#medal-date").value = todayISO();
  $("#profile-name").value = data.profile.name;
  $("#profile-email").value = data.profile.email;
  $("#profile-club").value = data.profile.club;
  $("#profile-gender").value = data.profile.gender;
  $("#profile-notifications").value = data.profile.notifications;
  $("#profile-language").value = data.profile.language;
  updateConnection();
  renderAll();
  renderBottomTabs("training");
  renderScreenTabs("training");
  renderSports();
  renderProfile();
  addRound();
  renderTimer();
  renderLucide();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.error("Az offline működés beállítása nem sikerült.", error);
        showToast("Az offline mód beállítása nem sikerült. Frissítsd az oldalt.");
      });
    });
  }
}

let lastMainScreen = "training";
let currentTrainingTab = "timer";
let currentProgressTab = "chart";
let currentCompetitionTab = "add-sport";
let competitionRequestId = 0;
const competitionCache = new Map();
const competitionLoads = new Map();

function showScreen(screenName) {
  const validScreens = ["home", "training", "competitions", "progress", "profile"];
  if (!validScreens.includes(screenName)) return;
  $$(".screen").forEach((screen) => { screen.hidden = screen.id !== `screen-${screenName}`; });
  if (screenName !== "profile") lastMainScreen = screenName;
  renderBottomTabs(lastMainScreen);
  renderScreenTabs(screenName === "profile" ? null : screenName);
  if (screenName === "progress") renderProgress();
  if (screenName === "competitions") renderCompetitionState();
}

document.addEventListener("click", (event) => {
  const navTarget = event.target.closest("[data-screen]");
  if (navTarget) {
    event.preventDefault();
    showScreen(navTarget.dataset.screen);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSportPicker();
  }
});

const BOTTOM_TABS = {
  training: [
    { key: "timer", label: "Stopper", icon: "timer" },
    { key: "workouts", label: "Edzéseim", icon: "dumbbell" }
  ],
  progress: [
    { key: "chart", label: "Grafikon", icon: "chart-no-axes-combined" },
    { key: "results", label: "Eredmények", icon: "trophy" },
    { key: "medals", label: "Érmek", icon: "medal" }
  ],
  competitions: [{ key: "add-sport", label: "Sportág hozzáadása", icon: "plus" }]
};

function getBottomTabs(screen) {
  if (screen === "competitions") {
    return [
      ...data.sports.map((sport) => ({
        key: `sport:${sport}`,
        label: SPORT_OPTIONS[sport].label,
        accessibleLabel: sport,
        icon: SPORT_OPTIONS[sport].icon
      })),
      { key: "add-sport", label: "", accessibleLabel: "Sportág hozzáadása", icon: "plus" }
    ];
  }
  return BOTTOM_TABS[screen] || [];
}

function renderBottomTabs(screen) {
  const nav = $("#bottom-nav");
  const tabs = [
    { key: "home", label: "Home", icon: "house" },
    { key: "training", label: "Edzések", icon: "dumbbell" },
    { key: "competitions", label: "Versenyek", icon: "flag-triangle-right" },
    { key: "progress", label: "Fejlődés", icon: "chart-no-axes-combined" }
  ];
  const selectedIndex = tabs.findIndex((tab) => tab.key === screen);
  nav.hidden = false;
  nav.setAttribute("aria-label", "Fő navigáció");
  nav.style.setProperty("--segments", String(tabs.length));
  nav.style.setProperty("--segment", String(Math.max(0, selectedIndex)));
  nav.innerHTML = `<div class="bottom-nav-track"><span class="segment-pill" aria-hidden="true"></span>${tabs.map((tab) => `
    <button class="segment-button bottom-tab${tab.key === screen ? " active" : ""}" type="button" data-screen="${tab.key}" aria-label="${escapeHTML(tab.label)}" aria-pressed="${tab.key === screen}" title="${escapeHTML(tab.label)}">
      <i class="segment-icon" data-lucide="${tab.icon}" aria-hidden="true"></i><span>${escapeHTML(tab.label)}</span>
    </button>`).join("")}</div>`;
  renderLucide(nav);
}

function renderScreenTabs(screen) {
  const navs = {
    training: $("#training-tabs"),
    competitions: $("#competition-tabs"),
    progress: $("#progress-tabs")
  };
  Object.entries(navs).forEach(([name, nav]) => {
    nav.hidden = name !== screen || (name === "competitions" && !internetAvailable);
  });
  if (!screen || !navs[screen] || navs[screen].hidden) return;

  const tabs = getBottomTabs(screen);
  const selectedTab = screen === "training" ? currentTrainingTab
    : screen === "progress" ? currentProgressTab : currentCompetitionTab;
  const nav = navs[screen];
  nav.style.setProperty("--segments", String(tabs.length));
  nav.style.setProperty("--segment", String(Math.max(0, tabs.findIndex((tab) => tab.key === selectedTab))));
  nav.innerHTML = `<div class="screen-tabs-track">${tabs.map((tab) => `
    <button class="screen-tab${tab.key === selectedTab ? " active" : ""}" type="button" data-view-tab="${escapeHTML(tab.key)}" aria-label="${escapeHTML(tab.accessibleLabel || tab.label)}" aria-pressed="${tab.key === selectedTab}" title="${escapeHTML(tab.accessibleLabel || tab.label)}">
      <span class="screen-tab-icon"><i data-lucide="${tab.icon}" aria-hidden="true"></i></span><span>${escapeHTML(tab.label)}</span>
    </button>`).join("")}</div>`;
  renderLucide(nav);
  const activeTab = $(".screen-tab.active", nav);
  if (activeTab) nav.scrollLeft = Math.max(0, activeTab.offsetLeft - (nav.clientWidth - activeTab.offsetWidth) / 2);

  if (screen === "training") {
    $("#timer-panel").hidden = currentTrainingTab !== "timer";
    $("#workouts-panel").hidden = currentTrainingTab !== "workouts";
  } else if (screen === "progress") {
    PROGRESS_TABS.forEach((tab) => { $(`#progress-${tab}`).hidden = tab !== currentProgressTab; });
  }
}

$("#main-content").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view-tab]");
  if (!button) return;
  const { viewTab } = button.dataset;
  const currentScreen = lastMainScreen;
  const validTab = getBottomTabs(currentScreen).some((tab) => tab.key === viewTab);
  if (!validTab) return;

  if (currentScreen === "training") currentTrainingTab = viewTab;
  else if (currentScreen === "progress") currentProgressTab = viewTab;
  else if (currentScreen === "competitions") {
    if (viewTab === "add-sport") {
      openSportPicker();
      return;
    }
    currentCompetitionTab = viewTab;
  }
  renderScreenTabs(currentScreen);
  if (currentScreen === "progress" && viewTab === "chart") renderProgress();
  if (currentScreen === "competitions") renderCompetitionState();
});

function renderSports() {
  const activeSport = data.sports.find((sport) => `sport:${sport}` === currentCompetitionTab);
  if (!activeSport) currentCompetitionTab = data.sports.length ? `sport:${data.sports[0]}` : "add-sport";
  $("#sport-chips").innerHTML = data.sports.map((sport) => `
    <span class="selected-sport-chip">
      <button class="sport-chip-select${currentCompetitionTab === `sport:${sport}` ? " active" : ""}" type="button" data-select-sport="${escapeHTML(sport)}" aria-pressed="${currentCompetitionTab === `sport:${sport}`}">
        <i data-lucide="${SPORT_OPTIONS[sport].icon}" aria-hidden="true"></i>${escapeHTML(sport)}
      </button>
      <button class="sport-chip-remove" type="button" data-remove-sport="${escapeHTML(sport)}" aria-label="${escapeHTML(sport)} eltávolítása"><i data-lucide="x"></i></button>
    </span>`).join("");
  $("#sport-chips").hidden = data.sports.length === 0;
  $("#selected-sports-label").hidden = data.sports.length === 0;
  const available = SPORTS.filter((sport) => !data.sports.includes(sport));
  $("#sport-picker-list").innerHTML = available.length
    ? available.map((sport) => `
      <button class="sport-option" type="button" data-add-sport="${escapeHTML(sport)}">
        <i data-lucide="${SPORT_OPTIONS[sport].icon}" aria-hidden="true"></i><span>${escapeHTML(sport)}</span><i data-lucide="plus" aria-hidden="true"></i>
      </button>`).join("")
    : '<p class="sport-picker-empty">Minden sportág hozzá van adva.</p>';
  renderLucide($("#sport-chips"));
  renderLucide($("#sport-picker-list"));
  renderCompetitionState();
  if (lastMainScreen === "competitions") renderScreenTabs("competitions");
}

function openSportPicker() {
  $("#sport-sheet-backdrop").hidden = false;
  document.body.classList.add("sheet-open");
  renderSports();
}

function closeSportPicker() {
  $("#sport-sheet-backdrop").hidden = true;
  document.body.classList.remove("sheet-open");
}

$("#close-sport-picker").addEventListener("click", closeSportPicker);
$("#sport-sheet-backdrop").addEventListener("click", (event) => {
  if (event.target === $("#sport-sheet-backdrop")) closeSportPicker();
});
let sheetTouchStartY = null;
$("#sport-picker").addEventListener("touchstart", (event) => {
  sheetTouchStartY = event.touches[0]?.clientY ?? null;
}, { passive: true });
$("#sport-picker").addEventListener("touchend", (event) => {
  if (sheetTouchStartY !== null && event.changedTouches[0].clientY - sheetTouchStartY > 80) closeSportPicker();
  sheetTouchStartY = null;
}, { passive: true });
$("#sport-picker-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-sport]");
  if (!button) return;
  const sport = button.dataset.addSport;
  if (!SPORTS.includes(sport) || data.sports.includes(sport)) return;
  data.sports.push(sport);
  currentCompetitionTab = `sport:${sport}`;
  saveData(`${sport} hozzáadva.`);
  closeSportPicker();
  renderSports();
});

$("#sport-chips").addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-sport]");
  if (removeButton) {
    data.sports = data.sports.filter((sport) => sport !== removeButton.dataset.removeSport);
    saveData("Sportág eltávolítva.");
  } else {
    const selectButton = event.target.closest("[data-select-sport]");
    if (!selectButton) return;
    currentCompetitionTab = `sport:${selectButton.dataset.selectSport}`;
  }
  renderSports();
});

let pendingInstall;
const installButton = $("#install-button");
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  pendingInstall = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!pendingInstall) return;
  await pendingInstall.prompt();
  pendingInstall = null;
  installButton.hidden = true;
});
window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  showToast("A Motivapp telepítve lett.");
});

function applyConnectionState(online) {
  const indicator = $(".connection-indicator");
  indicator.classList.toggle("is-offline", !online);
  $("#connection-label").textContent = online ? "Online" : "Offline mód";
  $("#competition-state").hidden = online;
  if (!online) {
    $("#competition-message").textContent = "Nincs internetkapcsolat";
    $("#competition-description").textContent = "Csatlakozz az internethez a versenyek megtekintéséhez.";
  }
  if (!online) closeSportPicker();
  if (lastMainScreen === "competitions") renderScreenTabs("competitions");
  renderCompetitionState();
}

async function updateConnection() {
  const checkId = ++connectionCheckId;
  if (!navigator.onLine) {
    internetAvailable = false;
    applyConnectionState(false);
    return false;
  }
  $("#connection-label").textContent = "Kapcsolat ellenőrzése";
  $("#competition-state").hidden = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  let connected = false;
  try {
    const response = await fetch(`./manifest.webmanifest?connectivity-check=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal
    });
    connected = response.ok;
  } catch {
    connected = false;
  } finally {
    clearTimeout(timeout);
  }
  if (checkId !== connectionCheckId) return internetAvailable;
  internetAvailable = connected;
  applyConnectionState(internetAvailable);
  return internetAvailable;
}

function renderCompetitionState() {
  if (!$("#competition-empty")) return;
  $("#competition-state").hidden = internetAvailable;
  $("#competition-events").hidden = true;
  $("#competition-status").hidden = true;
  $("#competition-retry").hidden = true;
  if (!internetAvailable) {
    competitionRequestId += 1;
    $("#competition-empty").hidden = true;
    return;
  }
  if (data.sports.length === 0) {
    competitionRequestId += 1;
    $("#competition-empty").hidden = false;
    $("#competition-empty").textContent = "Még nincsenek sportok kiválasztva.";
    return;
  }
  $("#competition-empty").hidden = true;
  if (lastMainScreen !== "competitions") return;
  const activeSport = data.sports.find((sport) => `sport:${sport}` === currentCompetitionTab) || data.sports[0];
  if (currentCompetitionTab !== `sport:${activeSport}`) currentCompetitionTab = `sport:${activeSport}`;
  loadCompetitionEvents(activeSport);
}

function getReaderDate(monthName, day, year, hour = 0, minute = 0) {
  const monthAliases = {
    jan: 0, január: 0, januar: 0,
    feb: 1, febr: 1, február: 1, februar: 1,
    márc: 2, március: 2, marcius: 2,
    ápr: 3, április: 3, aprilis: 3,
    máj: 4, május: 4, majus: 4,
    jún: 5, június: 5, junius: 5,
    júl: 6, július: 6, julius: 6,
    aug: 7, augusztus: 7,
    szept: 8, szeptember: 8,
    okt: 9, október: 9, oktober: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };
  const month = monthAliases[monthName.toLocaleLowerCase("hu-HU").replace(/\.$/, "")];
  if (month === undefined) return null;
  const date = new Date(year, month, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferCalendarYear(month, day) {
  const now = new Date();
  return month < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
}

function decodeCalendarText(value) {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\([\\,;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function safeCompetitionUrl(value, source) {
  try {
    const url = new URL(value || source.url, source.url);
    if (url.protocol !== "https:" || url.hostname !== new URL(source.url).hostname) return source.url;
    return url.href;
  } catch {
    return source.url;
  }
}

function keepUpcomingEvents(events) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return events
    .filter((event) => event.date instanceof Date && !Number.isNaN(event.date.getTime()))
    .filter((event) => event.allDay ? event.date.getTime() >= startOfToday : event.date.getTime() >= now.getTime())
    .sort((a, b) => a.date - b.date);
}

function parseCanoeEvents(text, source) {
  const events = [];
  const entries = [...text.matchAll(/\[([^\]]*?)###\s*([^\]]+)\]\((https?:\/\/[^)]+\/naptar\/(\d{4})\/[^)]+)\)/g)];
  for (const entry of entries) {
    const [metadata, title, path, yearText] = entry.slice(1);
    const year = Number(yearText);
    const dateMatch = metadata.match(/([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+)\s+(\d{1,2})\./);
    if (!dateMatch) continue;
    const date = getReaderDate(dateMatch[1], dateMatch[2], year);
    if (!date) continue;
    events.push({
      title: title.trim(),
      date,
      allDay: true,
      location: metadata.slice(dateMatch.index + dateMatch[0].length).trim(),
      url: safeCompetitionUrl(path, source)
    });
  }
  if (!events.length) throw new Error("A kajak-kenu naptárból nem sikerült eseményeket beolvasni.");
  return keepUpcomingEvents(events);
}

function parseRowingEvents(text, source) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events = [];
  for (const match of unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)) {
    const block = match[1];
    const start = block.match(/^DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{6})Z?)?/m);
    const summary = block.match(/^SUMMARY(?:;[^:]*)?:(.*)$/m);
    if (!start || !summary) continue;
    const date = new Date(
      Number(start[1].slice(0, 4)),
      Number(start[1].slice(4, 6)) - 1,
      Number(start[1].slice(6, 8)),
      start[2] ? Number(start[2].slice(0, 2)) : 0,
      start[2] ? Number(start[2].slice(2, 4)) : 0
    );
    const location = block.match(/^LOCATION(?:;[^:]*)?:(.*)$/m)?.[1] || "";
    const url = block.match(/^URL(?:;[^:]*)?:(\S+)/m)?.[1] || source.url;
    events.push({
      title: decodeCalendarText(summary[1]),
      date,
      allDay: !start[2],
      location: decodeCalendarText(location),
      url: safeCompetitionUrl(url, source)
    });
  }
  return keepUpcomingEvents(events);
}

function parseWaterPoloEvents(text, source) {
  const section = text.match(/##\s*KÖVETKEZŐ MÉRKŐZÉSEK([\s\S]*?)(?:##\s*KÖZVETÍTÉSEK|$)/i)?.[1];
  if (!section) throw new Error("A vízilabda-oldalon nem található a következő mérkőzések listája.");
  const datePattern = /([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+)\.\s*(\d{1,2})\.(?:(\d{1,2}):(\d{2}))?/g;
  const dates = [...section.matchAll(datePattern)];
  if (!dates.length) throw new Error("A vízilabda mérkőzések dátuma nem olvasható.");
  return keepUpcomingEvents(dates.map((match, index) => {
    const block = section.slice(match.index, dates[index + 1]?.index ?? section.length);
    const month = getReaderDate(match[1], match[2], new Date().getFullYear())?.getMonth();
    if (month === undefined) return null;
    const year = inferCalendarYear(month, Number(match[2]));
    const date = new Date(Date.UTC(year, month, Number(match[2]), Number(match[3] || 0), Number(match[4] || 0)));
    const teams = block.match(/!\[[^\]]*(?:Hazai|home)[^\]]*\]\([^)]+\)\s*\n\s*([^\n]+)\s*\n\s*!\[[^\]]*(?:Vendég|away)[^\]]*\]\([^)]+\)\s*\n\s*([^\n]+)/i);
    const competition = block.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const venue = block.match(/\]\(https:\/\/maps\.google\.com\/maps\?q=[^)]+\)([^\r\n]+)/i)?.[1]?.trim() || "";
    const home = teams?.[1].trim();
    const away = teams?.[2].trim();
    const hasTeams = Boolean(home && away);
    return {
      title: hasTeams ? `${home} – ${away}` : competition?.[1] || "Vízilabda-mérkőzés",
      subtitle: hasTeams ? competition?.[1] || "" : "",
      date,
      timeZone: "Europe/Budapest",
      allDay: !match[3],
      location: venue,
      url: safeCompetitionUrl(competition?.[2], source)
    };
  }).filter(Boolean));
}

function parseFootballEvents(text, source) {
  const section = text.match(/Következő forduló műsora([\s\S]*?)(?:\n\s*Tabella|\n\s*\[Részletes tabella|$)/i)?.[1];
  if (!section) throw new Error("Az MLSZ-oldalon nem található a következő forduló műsora.");
  const datePattern = /(\d{1,2})\.\s*(\d{1,2})\s+(\d{1,2}):(\d{2})/g;
  const dates = [...section.matchAll(datePattern)];
  if (!dates.length) throw new Error("Az MLSZ mérkőzések dátuma nem olvasható.");
  const markdownLinks = (value) => [...value.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)]
    .filter((match) => value[match.index - 1] !== "!");
  return keepUpcomingEvents(dates.map((match, index) => {
    const before = section.slice(0, match.index);
    const after = section.slice(match.index + match[0].length, dates[index + 1]?.index ?? section.length);
    const homeLinks = markdownLinks(before);
    const away = markdownLinks(after)[0];
    const month = Number(match[1]) - 1;
    const date = getReaderDate(
      ["jan", "feb", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec"][month],
      match[2],
      inferCalendarYear(month, Number(match[2])),
      match[3],
      match[4]
    );
    const home = homeLinks[homeLinks.length - 1];
    return {
      title: home && away ? `${home[1]} – ${away[1]}` : "OTP Bank Liga mérkőzés",
      subtitle: "OTP Bank Liga",
      date,
      allDay: false,
      location: "",
      url: source.url
    };
  }));
}

function dateTimeAttribute(date, allDay) {
  if (!allDay) return date.toISOString();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function fetchCompetitionReader(source) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source.readerUrl, {
      cache: "no-store",
      headers: { Accept: "text/plain" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`A naptárközvetítő hibát jelzett (${response.status}).`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCompetitionSource(sourceKey) {
  if (sourceKey === "hockey") {
    throw new Error("A jégkorong szövetségi naptára beágyazott, hozzáférés-védett adatforrást használ.");
  }
  const source = COMPETITION_SOURCES[sourceKey];
  const text = await fetchCompetitionReader(source);
  if (sourceKey === "canoe") return parseCanoeEvents(text, source);
  if (sourceKey === "rowing") return parseRowingEvents(text, source);
  if (sourceKey === "water-polo") return parseWaterPoloEvents(text, source);
  if (sourceKey === "football") return parseFootballEvents(text, source);
  throw new Error("Ehhez a sportághoz még nincs beállított hivatalos naptár.");
}

async function getCompetitionEvents(sourceKey, forceRefresh = false) {
  const cached = competitionCache.get(sourceKey);
  if (!forceRefresh && cached && Date.now() - cached.loadedAt < COMPETITION_CACHE_DURATION) return cached.events;
  if (!forceRefresh && competitionLoads.has(sourceKey)) return competitionLoads.get(sourceKey);
  const request = loadCompetitionSource(sourceKey)
    .then((events) => {
      competitionCache.set(sourceKey, { events, loadedAt: Date.now() });
      return events;
    })
    .finally(() => competitionLoads.delete(sourceKey));
  competitionLoads.set(sourceKey, request);
  return request;
}

function renderCompetitionEvents(sport, events) {
  const source = COMPETITION_SOURCES[SPORT_OPTIONS[sport].source];
  const list = $("#competition-events");
  if (!events.length) {
    $("#competition-empty").hidden = false;
    $("#competition-empty").innerHTML = `Nincsenek közelgő versenyek.<br><a href="${escapeHTML(source.url)}" target="_blank" rel="noopener">Hivatalos naptár megnyitása</a>`;
    list.hidden = true;
    return;
  }
  $("#competition-empty").hidden = true;
  list.hidden = false;
  list.innerHTML = `<a class="competition-source" href="${escapeHTML(source.url)}" target="_blank" rel="noopener">${escapeHTML(source.name)} · Hivatalos naptár <i data-lucide="external-link" aria-hidden="true"></i></a>
    ${events.map((event) => {
      const dateOptions = { month: "short", day: "numeric", weekday: "short" };
      const timeOptions = { hour: "2-digit", minute: "2-digit" };
      if (event.timeZone) {
        dateOptions.timeZone = event.timeZone;
        timeOptions.timeZone = event.timeZone;
      }
      return `
      <article class="competition-card neumorph-card">
        <time datetime="${escapeHTML(dateTimeAttribute(event.date, event.allDay))}">${escapeHTML(dateLabel(event.date, dateOptions))}${event.allDay ? "" : ` · ${escapeHTML(new Intl.DateTimeFormat("hu-HU", timeOptions).format(event.date))}`}</time>
        <h2>${escapeHTML(event.title)}</h2>
        ${event.subtitle ? `<p class="competition-subtitle">${escapeHTML(event.subtitle)}</p>` : ""}
        ${event.location ? `<p class="competition-location"><i data-lucide="map-pin" aria-hidden="true"></i>${escapeHTML(event.location)}</p>` : ""}
        <a class="competition-card-link" href="${escapeHTML(event.url)}" target="_blank" rel="noopener">Részletek <i data-lucide="arrow-up-right" aria-hidden="true"></i></a>
      </article>`;
    }).join("")}`;
  renderLucide(list);
}

async function loadCompetitionEvents(sport, forceRefresh = false) {
  const requestId = ++competitionRequestId;
  const source = COMPETITION_SOURCES[SPORT_OPTIONS[sport].source];
  $("#competition-empty").hidden = true;
  $("#competition-events").hidden = true;
  $("#competition-retry").hidden = true;
  $("#competition-status").hidden = false;
  $("#competition-status").textContent = `${source.name} versenyeinek betöltése…`;
  try {
    const events = await getCompetitionEvents(SPORT_OPTIONS[sport].source, forceRefresh);
    if (requestId !== competitionRequestId || lastMainScreen !== "competitions" || !internetAvailable) return;
    $("#competition-status").hidden = true;
    renderCompetitionEvents(sport, events);
  } catch (error) {
    console.error(`${source.name} naptárának betöltése nem sikerült.`, error);
    if (requestId !== competitionRequestId || lastMainScreen !== "competitions" || !internetAvailable) return;
    const message = SPORT_OPTIONS[sport].source === "hockey"
      ? "A jégkorong-szövetség naptára hozzáférés-védett, ezért itt nem olvasható."
      : "A hivatalos naptár most nem érhető el.";
    $("#competition-status").innerHTML = `${message} <a href="${escapeHTML(source.url)}" target="_blank" rel="noopener">Megnyitás</a>`;
    $("#competition-retry").hidden = false;
  }
}

window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);
$("#competition-retry").addEventListener("click", () => {
  const sport = data.sports.find((item) => `sport:${item}` === currentCompetitionTab);
  if (sport) loadCompetitionEvents(sport, true);
});
$("#retry-connection").addEventListener("click", () => {
  updateConnection().then((online) => {
    showToast(online ? "Van internetkapcsolat." : "Még mindig nincs internetkapcsolat.");
  });
});

let timerMode = "stopwatch";
let timerRunning = false;
let timerInterval = null;
let timerElapsed = 0;
let loggedTimerElapsed = 0;
let workElapsed = 0;
let phaseRemaining = 45;
let isWorkPhase = true;
let countdownSeconds = 300;
let workSeconds = 45;
let restSeconds = 15;
let intervalRounds = 4;
let intervalRound = 1;
let timerLaps = [];
let timerAudioContext = null;

function getPhaseDuration() {
  if (timerMode === "interval") return isWorkPhase ? workSeconds : restSeconds;
  return countdownSeconds;
}

function renderTimerSettings() {
  const settings = $("#timer-settings");
  const show = timerMode !== "stopwatch";
  settings.hidden = !show;
  if (!show) {
    settings.innerHTML = "";
    return;
  }
  settings.innerHTML = timerMode === "interval"
    ? `<label class="timer-setting">Munka (másodperc)<input id="work-seconds" type="number" min="5" max="5999" step="5" value="${workSeconds}"${timerRunning ? " disabled" : ""}></label>
       <label class="timer-setting">Pihenő (másodperc)<input id="rest-seconds" type="number" min="5" max="5999" step="5" value="${restSeconds}"${timerRunning ? " disabled" : ""}></label>
       <label class="timer-setting">Körök<input id="interval-rounds" type="number" min="1" max="99" step="1" value="${intervalRounds}"${timerRunning ? " disabled" : ""}></label>`
    : `<label class="timer-setting">Visszaszámlálás (másodperc)<input id="countdown-seconds" type="number" min="5" max="59999" step="5" value="${countdownSeconds}"${timerRunning ? " disabled" : ""}></label>`;
  $("#work-seconds")?.addEventListener("change", (event) => {
    workSeconds = clampInteger(event.target.value, 5, 5999, 45);
    event.target.value = workSeconds;
    if (!timerRunning && isWorkPhase) phaseRemaining = workSeconds;
    renderTimer();
  });
  $("#rest-seconds")?.addEventListener("change", (event) => {
    restSeconds = clampInteger(event.target.value, 5, 5999, 15);
    event.target.value = restSeconds;
    if (!timerRunning && !isWorkPhase) phaseRemaining = restSeconds;
    renderTimer();
  });
  $("#interval-rounds")?.addEventListener("change", (event) => {
    intervalRounds = clampInteger(event.target.value, 1, 99, 4);
    intervalRound = 1;
    event.target.value = intervalRounds;
    if (!timerRunning) {
      isWorkPhase = true;
      phaseRemaining = workSeconds;
      timerElapsed = 0;
      loggedTimerElapsed = 0;
      workElapsed = 0;
    }
    renderTimer();
  });
  $("#countdown-seconds")?.addEventListener("change", (event) => {
    countdownSeconds = clampInteger(event.target.value, 5, 59999, 300);
    event.target.value = countdownSeconds;
    if (!timerRunning) {
      timerElapsed = 0;
      loggedTimerElapsed = 0;
    }
    renderTimer();
  });
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function renderTimer() {
  $$(".dial-mode-label").forEach((label) => {
    const active = label.dataset.mode === timerMode;
    label.classList.toggle("active", active);
    label.disabled = timerRunning;
    label.setAttribute("aria-pressed", String(active));
  });
  renderTimerSettings();
  const dial = $("#timer-dial");
  dial.classList.toggle("is-working", timerMode === "interval" && isWorkPhase);
  dial.classList.toggle("is-resting", timerMode === "interval" && !isWorkPhase);
  dial.closest(".timer-card").classList.toggle("is-working", timerMode === "interval" && isWorkPhase);
  dial.closest(".timer-card").classList.toggle("is-resting", timerMode === "interval" && !isWorkPhase);
  let seconds;
  let ratio;
  let phase;
  let caption;
  if (timerMode === "countdown") {
    seconds = Math.max(0, countdownSeconds - timerElapsed);
    ratio = Math.min(1, timerElapsed / Math.max(1, countdownSeconds));
    phase = timerRunning ? "HAJRÁ!" : seconds === 0 ? "KÉSZ VAGY!" : "VISSZASZÁMLÁLÁS";
    caption = "A KITARTÁSOD VELED MARAD";
  } else if (timerMode === "interval") {
    seconds = phaseRemaining;
    ratio = 1 - phaseRemaining / Math.max(1, getPhaseDuration());
    phase = timerRunning ? `${isWorkPhase ? "MUNKA" : "PIHENŐ"} · ${intervalRound}/${intervalRounds}` : `MUNKA / PIHENŐ · ${intervalRounds} KÖR`;
    caption = isWorkPhase ? "ADJ BELE, AMENNYIT MA TUDSZ" : "VEGYÉL EGY MÉLY LEVEGŐT";
  } else {
    seconds = timerElapsed;
    ratio = (timerElapsed % 60) / 60;
    phase = timerRunning ? "MÁRIS JÓL HALADSZ" : "KÉSZEN ÁLLSZ?";
    caption = timerElapsed ? "MINDEN MÁSODPERC SZÁMÍT" : "MÁR AZ IS SZÁMÍT, HOGY ITT VAGY";
  }
  $("#timer-display").textContent = formatDuration(seconds);
  $("#timer-phase").textContent = phase;
  $("#timer-caption").textContent = caption;
  const circumference = 2 * Math.PI * 96;
  $("#timer-progress-circle").style.strokeDashoffset = String(circumference * (1 - Math.max(0, Math.min(1, ratio))));
  $("#timer-toggle").innerHTML = timerRunning
    ? '<i data-lucide="pause"></i> Szünet'
    : `<i data-lucide="play"></i> ${timerElapsed || (timerMode === "interval" && phaseRemaining < getPhaseDuration()) ? "Folytatás" : "Indítás"}`;
  renderLucide($("#timer-toggle"));
  $("#timer-lap").hidden = timerMode !== "stopwatch";
  $("#timer-lap").disabled = timerMode !== "stopwatch" || timerElapsed < 1;
  const laps = $("#timer-laps");
  laps.hidden = timerMode !== "stopwatch" || timerLaps.length === 0;
  laps.innerHTML = timerLaps.slice(-3).reverse().map((lap, index) =>
    `<li><span>Kör ${timerLaps.length - index}</span><strong>${formatDuration(lap)}</strong></li>`
  ).join("");
  $("#last-session").textContent = data.sessions.length
    ? `Legutóbbi edzés: ${formatDuration(data.sessions[0].seconds)} · ${dateLabel(data.sessions[0].endedAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
    : "";
}

function advanceTimer(delta) {
  timerElapsed += delta;
  if (timerMode === "interval") {
    let remaining = delta;
    while (remaining > 0) {
      if (phaseRemaining <= remaining) {
        if (isWorkPhase) workElapsed += phaseRemaining;
        remaining -= phaseRemaining;
        if (isWorkPhase) {
          isWorkPhase = false;
        } else if (intervalRound >= intervalRounds) {
          timerElapsed -= remaining;
          phaseRemaining = 0;
          intervalRound = intervalRounds + 1;
          timerRunning = false;
          clearInterval(timerInterval);
          timerInterval = null;
          recordSession(workElapsed, MODE_LABELS.interval);
          loggedTimerElapsed = timerElapsed;
          showToast("Minden kör kész — szép munka!");
          remaining = 0;
          break;
        } else {
          intervalRound += 1;
          isWorkPhase = true;
        }
        phaseRemaining = getPhaseDuration();
        showToast(isWorkPhase ? "Vége a pihenőnek — jöhet a következő kör!" : "Szép munka! Pihenő következik.");
      } else {
        if (isWorkPhase) workElapsed += remaining;
        phaseRemaining -= remaining;
        remaining = 0;
      }
    }
  }
  if (timerMode === "countdown" && timerElapsed >= countdownSeconds) {
    const completed = countdownSeconds - loggedTimerElapsed;
    timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    recordSession(completed, "Visszaszámláló");
    loggedTimerElapsed = countdownSeconds;
    showToast("Lejárt az időzítő. Szép munka!");
  }
  renderTimer();
}

function startTimer() {
  resumeTimerAudio();
  if (timerMode === "countdown" && timerElapsed >= countdownSeconds) {
    timerElapsed = 0;
    loggedTimerElapsed = 0;
  }
  if (timerMode === "interval" && intervalRound > intervalRounds) {
    timerElapsed = 0;
    loggedTimerElapsed = 0;
    workElapsed = 0;
    intervalRound = 1;
    isWorkPhase = true;
    phaseRemaining = workSeconds;
  }
  if (timerMode === "interval" && phaseRemaining <= 0) phaseRemaining = getPhaseDuration();
  timerRunning = true;
  let lastTick = performance.now();
  renderTimer();
  timerInterval = window.setInterval(() => {
    const now = performance.now();
    const delta = Math.min(1, (now - lastTick) / 1000);
    lastTick = now;
    if (delta > 0) {
      const previousPhaseRemaining = phaseRemaining;
      const previousWorkPhase = isWorkPhase;
      advanceTimer(delta);
      if (timerMode === "interval" && timerRunning) {
        if (isWorkPhase !== previousWorkPhase) {
          playIntervalBeep(true);
        } else {
          const previousSecond = Math.ceil(previousPhaseRemaining);
          const currentSecond = Math.ceil(phaseRemaining);
          for (let second = Math.min(3, previousSecond - 1); second >= Math.max(1, currentSecond); second -= 1) {
            playIntervalBeep();
          }
        }
      }
    }
  }, 50);
}

function resumeTimerAudio() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;
  try {
    if (!timerAudioContext) timerAudioContext = new AudioContextConstructor();
    if (timerAudioContext.state === "suspended") {
      timerAudioContext.resume().catch((error) => console.error("Az időzítő hangja nem indítható el.", error));
    }
  } catch (error) {
    console.error("Az időzítő hangja nem indítható el.", error);
  }
}

function playIntervalBeep(isPhaseChange = false) {
  if (!timerAudioContext || timerAudioContext.state !== "running") return;
  const playTone = (frequency, startTime, duration) => {
    const oscillator = timerAudioContext.createOscillator();
    const volume = timerAudioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    volume.gain.setValueAtTime(0.0001, startTime);
    volume.gain.exponentialRampToValueAtTime(0.5, startTime + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(volume);
    volume.connect(timerAudioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  };
  const now = timerAudioContext.currentTime;
  if (isPhaseChange) {
    playTone(523.25, now, 0.18);
    playTone(1046.5, now + 0.2, 0.24);
  } else {
    playTone(880, now, 0.16);
  }
}

function pauseTimer(save = true) {
  if (!timerRunning) return;
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  const completedSeconds = timerMode === "interval" ? workElapsed : timerElapsed - loggedTimerElapsed;
  if (save && completedSeconds >= 5) {
    recordSession(completedSeconds, MODE_LABELS[timerMode]);
    if (timerMode !== "interval") loggedTimerElapsed = timerElapsed;
  }
  workElapsed = 0;
  renderTimer();
}

function resetTimer() {
  pauseTimer(true);
  timerElapsed = 0;
  loggedTimerElapsed = 0;
  workElapsed = 0;
  isWorkPhase = true;
  intervalRound = 1;
  phaseRemaining = workSeconds;
  timerLaps = [];
  renderTimer();
}

$("#timer-toggle").addEventListener("click", () => {
  if (timerRunning) pauseTimer(true);
  else startTimer();
});
$("#timer-reset").addEventListener("click", resetTimer);
$("#timer-lap").addEventListener("click", () => {
  if (timerMode !== "stopwatch" || timerElapsed < 1) return;
  timerLaps.push(Math.floor(timerElapsed));
  renderTimer();
});
function selectTimerMode(nextIndex) {
  if (timerRunning) return;
  const nextMode = TIMER_MODES[(nextIndex + TIMER_MODES.length) % TIMER_MODES.length];
  if (nextMode === timerMode) return;
  timerMode = nextMode;
  timerElapsed = 0;
  loggedTimerElapsed = 0;
  workElapsed = 0;
  isWorkPhase = true;
  intervalRound = 1;
  phaseRemaining = workSeconds;
  timerLaps = [];
  renderTimer();
}

$$(".dial-mode-label").forEach((label) => {
  label.addEventListener("click", () => selectTimerMode(TIMER_MODES.indexOf(label.dataset.mode)));
});

function recordSession(seconds, name) {
  if (!Number.isFinite(seconds) || seconds < 1) return;
  data.sessions.unshift({ id: makeId(), name, seconds: Math.floor(seconds), endedAt: new Date().toISOString() });
  data.sessions.length = Math.min(data.sessions.length, 500);
  saveData("Az edzés bekerült a naplóba.");
  renderAll();
}

function addRound() {
  const container = $("#round-list");
  const number = container.children.length + 1;
  const row = document.createElement("div");
  row.className = "round-editor";
  row.innerHTML = `
    <div class="round-topline"><span>${number}. kör</span><button class="round-remove" type="button" aria-label="Kör törlése">Törlés</button></div>
    <div class="round-fields">
      <div class="mini-field time-field" role="group" aria-label="Idő">
        <div class="time-wheel-units" aria-hidden="true"><span>h</span><span>min</span><span>sec</span></div>
        <div class="time-wheel-columns">
          ${createWheelPicker("time-hours", 0, "óra", 0, 99, 1)}
          ${createWheelPicker("time-minutes", 1, "perc", 0, 59, 1)}
          ${createWheelPicker("time-seconds", 0, "másodperc", 0, 59, 1)}
        </div>
      </div>
      <div class="mini-field"><span>Gól</span>${createWheelPicker("goals", 0, "gól", 0, 99, 1)}</div>
      <div class="mini-field"><span>Ismétlés</span>${createWheelPicker("reps", 10, "ism.", 0, 99, 1)}</div>
      <div class="mini-field"><span>Táv</span>${createWheelPicker("distance", 0, "km", 0, 99, 0.1)}</div>
      <label class="mini-field"><span>Cél / megjegyzés</span><input class="text-field" data-field="goal" type="text" maxlength="60" placeholder="Opcionális cél"></label>
    </div>`;
  container.append(row);
  updateRoundNumbers();
}

function formatWheelValue(value, step) {
  return Number(value).toLocaleString("hu-HU", {
    minimumIntegerDigits: 1,
    minimumFractionDigits: step < 1 ? 1 : 0,
    maximumFractionDigits: step < 1 ? 1 : 0
  });
}

function formatTimeWheelValue(value) {
  return String(Math.trunc(value)).padStart(2, "0");
}

function createWheelPicker(field, value, unit, minimum, maximum, step) {
  const label = {
    goals: "Gól", reps: "Ismétlés", distance: "Távolság",
    "time-hours": "Óra", "time-minutes": "Perc", "time-seconds": "Másodperc"
  }[field];
  return `<div class="wheel-picker" data-wheel="${field}" data-unit="${unit}" data-min="${minimum}" data-max="${maximum}" data-step="${step}" data-value="${value}" data-unmeasured="false" role="spinbutton" tabindex="0" aria-label="${label}" aria-valuemin="${minimum}" aria-valuemax="${maximum}" aria-valuenow="${value}">
    <div class="wheel-track" aria-hidden="true">
      <button class="wheel-row" type="button" data-offset="-1" tabindex="-1"></button>
      <button class="wheel-row current-wheel-value" type="button" data-offset="0" tabindex="-1"></button>
      <button class="wheel-row" type="button" data-offset="1" tabindex="-1"></button>
    </div>
    <input type="hidden" data-field="${field}" value="${value}">
  </div>`;
}

function updateWheelPicker(picker) {
  const value = Number(picker.dataset.value);
  const minimum = Number(picker.dataset.min);
  const maximum = Number(picker.dataset.max);
  const step = Number(picker.dataset.step);
  const unmeasured = picker.dataset.unmeasured === "true";
  $$("[data-offset]", picker).forEach((button) => {
    const offset = Number(button.dataset.offset);
    const next = unmeasured
      ? (offset < 0 ? maximum : offset > 0 ? minimum : null)
      : value + offset * step;
    const unavailable = next !== null && (next < minimum || next > maximum);
    button.disabled = false;
    button.textContent = next === null || unavailable
      ? "⊘"
      : picker.dataset.wheel.startsWith("time-") ? formatTimeWheelValue(next) : formatWheelValue(next, step);
  });
  $("[data-field]", picker).value = unmeasured ? "" : String(value);
  picker.setAttribute("aria-valuenow", String(unmeasured ? minimum : value));
  picker.setAttribute("aria-valuetext", unmeasured
    ? "Nem mérhető"
    : `${picker.dataset.wheel.startsWith("time-") ? formatTimeWheelValue(value) : formatWheelValue(value, step)} ${picker.dataset.unit}`);
}

function setWheelValue(picker, value) {
  if (value === null) {
    picker.dataset.unmeasured = "true";
    updateWheelPicker(picker);
    return;
  }
  const minimum = Number(picker.dataset.min);
  const maximum = Number(picker.dataset.max);
  const step = Number(picker.dataset.step);
  const bounded = Math.min(maximum, Math.max(minimum, value));
  const precision = step < 1 ? 1 : 0;
  picker.dataset.value = String(Number(bounded.toFixed(precision)));
  picker.dataset.unmeasured = "false";
  updateWheelPicker(picker);
}

function getWheelValue(picker) {
  return picker.dataset.unmeasured === "true" ? null : Number(picker.dataset.value);
}

function setWheelBySteps(picker, startValue, startUnmeasured, steps) {
  if (steps === 0) {
    setWheelValue(picker, startUnmeasured ? null : startValue);
    return;
  }
  const minimum = Number(picker.dataset.min);
  const maximum = Number(picker.dataset.max);
  const step = Number(picker.dataset.step);
  const firstValue = startUnmeasured ? (steps > 0 ? minimum : maximum) : startValue;
  const adjustedSteps = startUnmeasured ? steps - Math.sign(steps) : steps;
  const next = firstValue + adjustedSteps * step;
  setWheelValue(picker, next < minimum || next > maximum ? null : next);
}

function handleWheelGesture(event) {
  const picker = event.target.closest(".wheel-picker");
  if (!picker) return;
  const row = event.target.closest("[data-offset]");
  if (!row) return;
  event.preventDefault();
  setWheelBySteps(
    picker,
    Number(picker.dataset.value),
    picker.dataset.unmeasured === "true",
    Number(row.dataset.offset)
  );
}

let activeWheelDrag = null;
let wheelInertiaFrame = 0;
let suppressWheelClick = false;
$("#round-list").addEventListener("pointerdown", (event) => {
  const picker = event.target.closest(".wheel-picker");
  if (!picker || event.button > 0) return;
  event.preventDefault();
  if (wheelInertiaFrame) cancelAnimationFrame(wheelInertiaFrame);
  wheelInertiaFrame = 0;
  const track = $(".wheel-track", picker);
  track.setPointerCapture(event.pointerId);
  const now = performance.now();
  activeWheelDrag = {
    picker,
    pointerId: event.pointerId,
    startY: event.clientY,
    startValue: Number(picker.dataset.value),
    startUnmeasured: picker.dataset.unmeasured === "true",
    lastSteps: 0,
    lastY: event.clientY,
    lastMoveAt: now,
    maxDistance: 0,
    samples: [{ y: event.clientY, time: now }]
  };
});

$("#round-list").addEventListener("pointermove", (event) => {
  if (!activeWheelDrag || event.pointerId !== activeWheelDrag.pointerId) return;
  const steps = Math.trunc((activeWheelDrag.startY - event.clientY) / 25);
  if (steps !== activeWheelDrag.lastSteps) {
    activeWheelDrag.lastSteps = steps;
    setWheelBySteps(activeWheelDrag.picker, activeWheelDrag.startValue, activeWheelDrag.startUnmeasured, steps);
  }
  const now = performance.now();
  activeWheelDrag.maxDistance = Math.max(activeWheelDrag.maxDistance, Math.abs(event.clientY - activeWheelDrag.startY));
  activeWheelDrag.lastY = event.clientY;
  activeWheelDrag.lastMoveAt = now;
  activeWheelDrag.samples.push({ y: event.clientY, time: now });
  activeWheelDrag.samples = activeWheelDrag.samples.filter((sample) => now - sample.time <= 120);
});

function finishWheelDrag(event, allowInertia = true) {
  if (!activeWheelDrag || (event && event.pointerId !== activeWheelDrag.pointerId)) return;
  const drag = activeWheelDrag;
  activeWheelDrag = null;
  if (drag.maxDistance > 8) {
    suppressWheelClick = true;
    window.setTimeout(() => { suppressWheelClick = false; }, 350);
  }
  if (!allowInertia || performance.now() - drag.lastMoveAt > 110 || drag.samples.length < 2) return;
  const first = drag.samples[0];
  const last = drag.samples[drag.samples.length - 1];
  const elapsed = last.time - first.time;
  if (elapsed < 1) return;
  const velocity = (first.y - last.y) / elapsed / 25;
  if (Math.abs(velocity) < 0.003) return;
  const duration = Math.min(900, Math.max(100, Math.abs(velocity) * 25 * 1600));
  const totalSteps = velocity * duration / 2;
  const startedAt = performance.now();
  let appliedSteps = 0;
  const animateInertia = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const nextSteps = totalSteps * (1 - (1 - progress) ** 2);
    const stepChange = Math.trunc(nextSteps) - Math.trunc(appliedSteps);
    if (stepChange !== 0) {
      drag.lastSteps += stepChange;
      setWheelBySteps(drag.picker, drag.startValue, drag.startUnmeasured, drag.lastSteps);
    }
    appliedSteps = nextSteps;
    if (progress < 1) wheelInertiaFrame = requestAnimationFrame(animateInertia);
    else wheelInertiaFrame = 0;
  };
  wheelInertiaFrame = requestAnimationFrame(animateInertia);
}
$("#round-list").addEventListener("pointerup", (event) => finishWheelDrag(event));
$("#round-list").addEventListener("pointercancel", (event) => finishWheelDrag(event, false));

$("#round-list").addEventListener("keydown", (event) => {
  if (!event.target.matches(".wheel-picker") || !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const picker = event.target;
  const step = Number(picker.dataset.step);
  if (event.key === "Home") setWheelValue(picker, Number(picker.dataset.min));
  else if (event.key === "End") setWheelValue(picker, Number(picker.dataset.max));
  else {
    const stepCount = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : event.key === "PageUp" ? 10 : -10;
    setWheelBySteps(picker, Number(picker.dataset.value), picker.dataset.unmeasured === "true", stepCount);
  }
});

function updateRoundNumbers() {
  $$(".round-editor", $("#round-list")).forEach((row, index) => {
    $(".round-topline span", row).textContent = `${index + 1}. kör`;
    $$(".wheel-picker", row).forEach(updateWheelPicker);
  });
}

$("#add-round-button").addEventListener("click", addRound);
$("#round-list").addEventListener("click", (event) => {
  if (suppressWheelClick && event.target.closest(".wheel-picker [data-offset]")) {
    event.preventDefault();
    suppressWheelClick = false;
    return;
  }
  handleWheelGesture(event);
  const row = event.target.closest(".round-editor");
  if (!row) return;
  if (event.target.closest(".round-remove")) {
    if ($("#round-list").children.length === 1) {
      showToast("Legalább egy kört hagyj az edzésben.");
      return;
    }
    row.remove();
    updateRoundNumbers();
    return;
  }
});

function roundSeconds(row) {
  const hours = getWheelValue($('.wheel-picker[data-wheel="time-hours"]', row));
  const minutes = getWheelValue($('.wheel-picker[data-wheel="time-minutes"]', row));
  const seconds = getWheelValue($('.wheel-picker[data-wheel="time-seconds"]', row));
  return hours === null || minutes === null || seconds === null
    ? null
    : hours * 3600 + minutes * 60 + seconds;
}

function renderWorkoutNameSuggestions() {
  const query = $("#workout-name").value.trim().toLocaleLowerCase("hu-HU");
  const recentWorkouts = data.workouts
    .map((workout, index) => ({ workout, index, created: Date.parse(workout.createdAt || "") }))
    .sort((a, b) => {
      const aCreated = Number.isFinite(a.created) ? a.created : -a.index;
      const bCreated = Number.isFinite(b.created) ? b.created : -b.index;
      return bCreated - aCreated;
    })
    .map(({ workout }) => workout.name);
  const names = query
    ? recentWorkouts.filter((name) => String(name).toLocaleLowerCase("hu-HU").includes(query))
    : data.recentWorkoutNames.length ? data.recentWorkoutNames : recentWorkouts;
  const uniqueNames = [];
  const seen = new Set();
  for (const name of names) {
    const key = String(name).trim().toLocaleLowerCase("hu-HU");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueNames.push(String(name).trim());
    if (uniqueNames.length === 3) break;
  }
  $("#workout-name-suggestions").innerHTML = uniqueNames
    .map((name) => `<option value="${escapeHTML(name)}"></option>`).join("");
}

$("#workout-name").addEventListener("focus", renderWorkoutNameSuggestions);
$("#workout-name").addEventListener("input", renderWorkoutNameSuggestions);

$("#workout-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#workout-name").value.trim();
  const rows = $$(".round-editor", $("#round-list"));
  const rounds = rows.map((row) => ({
    seconds: roundSeconds(row),
    goals: getWheelValue($('.wheel-picker[data-wheel="goals"]', row)),
    reps: getWheelValue($('.wheel-picker[data-wheel="reps"]', row)),
    distance: getWheelValue($('.wheel-picker[data-wheel="distance"]', row)),
    goal: $('[data-field="goal"]', row).value.trim()
  }));
  if (!name) {
    showToast("Adj nevet az edzésnek.");
    return;
  }
  data.workouts.unshift({ id: makeId(), name, rounds, createdAt: new Date().toISOString() });
  data.recentWorkoutNames = [name, ...data.recentWorkoutNames.filter((recent) => recent !== name)].slice(0, 3);
  saveData("Elmentettük az új edzésedet.");
  $("#workout-form").reset();
  $("#round-list").innerHTML = "";
  addRound();
  $("#workout-form").hidden = true;
  renderWorkouts();
});

$("#add-workout-button").addEventListener("click", () => {
  $("#workout-form").hidden = false;
  renderWorkoutNameSuggestions();
});
$("#close-workout-form").addEventListener("click", () => { $("#workout-form").hidden = true; });

function renderWorkouts() {
  const list = $("#workout-list");
  $("#workout-empty").hidden = data.workouts.length > 0;
  list.innerHTML = data.workouts.map((workout) => {
    const roundCount = workout.rounds.length;
    const totalMeasured = (field) => {
      const values = workout.rounds.map((round) => round[field]).filter((value) => Number.isFinite(value));
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const totalTime = totalMeasured("seconds");
    const goals = totalMeasured("goals");
    const reps = totalMeasured("reps");
    const distance = totalMeasured("distance");
    const details = [
      `${roundCount} kör`,
      totalTime === null ? "—" : formatDuration(totalTime),
      `${goals === null ? "—" : goals} gól`,
      `${reps === null ? "—" : reps} ism.`
    ];
    if (distance !== null) details.push(`${distance.toLocaleString("hu-HU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`);
    return `<article class="workout-card">
      <div class="workout-card-top"><div><h3>${escapeHTML(workout.name)}</h3><p class="card-meta">${details.join(" · ")}</p></div><i class="workout-icon" data-lucide="list-checks" aria-hidden="true"></i></div>
      <div class="card-actions"><button class="small-action" type="button" data-complete-workout="${escapeHTML(workout.id)}"><i data-lucide="check"></i> Edzés elvégzése</button><button class="small-action delete-action" type="button" data-delete-workout="${escapeHTML(workout.id)}"><i data-lucide="trash-2"></i> Törlés</button></div>
    </article>`;
  }).join("");
  renderLucide($("#workout-list"));
}

$("#workout-list").addEventListener("click", (event) => {
  const complete = event.target.closest("[data-complete-workout]");
  if (complete) {
    const workout = data.workouts.find((item) => item.id === complete.dataset.completeWorkout);
    if (!workout) return;
    const seconds = workout.rounds.reduce((sum, round) => sum + (Number(round.seconds) || 0), 0);
    recordSession(seconds, workout.name);
    showScreen("progress");
    return;
  }
  const remove = event.target.closest("[data-delete-workout]");
  if (remove) {
    data.workouts = data.workouts.filter((item) => item.id !== remove.dataset.deleteWorkout);
    saveData("Töröltük az edzést.");
    renderWorkouts();
  }
});

function renderProgress() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
  const totals = dates.map((date) => data.sessions.reduce((sum, session) => {
    const sessionDate = new Date(session.endedAt);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === date.getTime() ? sum + (Number(session.seconds) || 0) : sum;
  }, 0));
  const previousTotals = dates.map((date) => {
    const previousDate = new Date(date);
    previousDate.setDate(previousDate.getDate() - 7);
    return data.sessions.reduce((sum, session) => {
      const sessionDate = new Date(session.endedAt);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === previousDate.getTime() ? sum + (Number(session.seconds) || 0) : sum;
    }, 0);
  });
  const maxMinutes = Math.max(1, ...totals.map((seconds) => seconds / 60));
  const labels = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
  const todayIndex = (today.getDay() + 6) % 7;
  const chartPoints = totals.map((seconds, index) => {
    const minutes = seconds / 60;
    const x = 32 + index * 96;
    const y = 235 - (minutes / maxMinutes) * 180;
    return { x, y, index, label: labels[index], minutes, date: dateLabel(dates[index], { weekday: "long", day: "numeric" }) };
  });
  const linePoints = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  $("#chart-container").innerHTML = `<svg class="line-chart" viewBox="0 0 640 300" role="img" aria-label="E heti edzésidő napokra bontva, percben">
    <defs><linearGradient id="chart-area-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ff8748" stop-opacity=".3" /><stop offset="100%" stop-color="#ff8748" stop-opacity="0" /></linearGradient></defs>
    <g class="chart-guides" aria-hidden="true"><path d="M24 55H616M24 145H616M24 235H616" /></g>
    <polygon class="chart-area" points="${linePoints} 608,235 32,235" />
    <polyline class="chart-line" points="${linePoints}" />
    ${chartPoints.map((point) => `<g class="chart-point${point.index === todayIndex ? " today" : ""}"><title>${point.date}: ${Math.round(point.minutes)} perc</title><circle cx="${point.x}" cy="${point.y}" r="9" /></g>`).join("")}
    ${chartPoints.map((point) => `<text class="chart-day${point.index === todayIndex ? " today" : ""}" x="${point.x}" y="280" text-anchor="middle">${point.label}</text>`).join("")}
  </svg>`;
  const weeklySeconds = totals.reduce((sum, seconds) => sum + seconds, 0);
  const previousWeeklySeconds = previousTotals.reduce((sum, seconds) => sum + seconds, 0);
  const chartChange = $("#chart-change");
  if (previousWeeklySeconds > 0) {
    const change = Math.round(((weeklySeconds - previousWeeklySeconds) / previousWeeklySeconds) * 100);
    chartChange.textContent = `${change > 0 ? "+" : ""}${change}%`;
    chartChange.className = `chart-change${change > 0 ? " is-better" : change < 0 ? " is-worse" : " is-steady"}`;
    chartChange.setAttribute("aria-label", `${change > 0 ? "Javulás" : change < 0 ? "Visszaesés" : "Változatlan"} az előző héthez képest`);
  } else {
    chartChange.textContent = weeklySeconds > 0 ? "Új adat" : "—";
    chartChange.className = "chart-change is-steady";
    chartChange.setAttribute("aria-label", "Nincs összehasonlítható előző heti adat");
  }
  $("#chart-total").textContent = String(Math.round(weeklySeconds / 60));
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const weeklySessions = data.sessions.filter((session) => {
    const sessionDate = new Date(session.endedAt);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate >= weekStart && sessionDate < nextWeekStart;
  });
  $("#stat-minutes").textContent = String(Math.round(weeklySeconds / 60 / 7));
  $("#stat-sessions").textContent = String(weeklySessions.length);
  $("#activity-empty").hidden = data.sessions.length > 0;
  $("#activity-list").innerHTML = data.sessions.slice(0, 8).map((session) => `
    <article class="activity-card">
      <div><h3>${escapeHTML(session.name || "Edzés")}</h3><p class="card-meta">${dateLabel(session.endedAt, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div>
      <span class="activity-time">${formatDuration(session.seconds)}</span>
    </article>`).join("");
  renderResults();
  renderMedals();
}

function renderResults() {
  const results = [...data.results].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  $("#result-empty").hidden = results.length > 0;
  $("#result-list").innerHTML = results.map((result) => `
    <article class="activity-card">
      <div><h3>${escapeHTML(result.name)}</h3><p class="card-meta">${escapeHTML(result.place)} · ${dateLabel(result.date, { year: "numeric", month: "short", day: "numeric" })}</p></div>
      <button class="round-action secondary-action" type="button" data-delete-result="${escapeHTML(result.id)}" aria-label="Eredmény törlése: ${escapeHTML(result.name)}" style="width:34px;height:34px"><i data-lucide="x"></i></button>
    </article>`).join("");
  renderLucide($("#result-list"));
}

$("#result-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-result]");
  if (!button) return;
  data.results = data.results.filter((result) => result.id !== button.dataset.deleteResult);
  saveData("Töröltük az eredményt.");
  renderResults();
});

function renderMedals() {
  $("#medal-empty").hidden = data.medals.length > 0;
  $("#medal-list").innerHTML = data.medals.map((medal) => `
    <article class="medal-card">
      <details class="medal-details">
        <summary><span class="medal-art" aria-hidden="true"><i data-lucide="medal"></i></span><span class="medal-name">${escapeHTML(medal.name)}</span><span class="medal-meta">${dateLabel(medal.date, { year: "numeric", month: "short", day: "numeric" })}</span></summary>
        <div class="medal-location">${escapeHTML(medal.event)}<br>${escapeHTML(medal.location)}</div>
      </details>
      <button class="small-action delete-action medal-delete" type="button" data-delete-medal="${escapeHTML(medal.id)}">Érem törlése</button>
    </article>`).join("");
  renderLucide($("#medal-list"));
}

$("#medal-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-medal]");
  if (!button) return;
  data.medals = data.medals.filter((medal) => medal.id !== button.dataset.deleteMedal);
  saveData("Töröltük az érmet.");
  renderMedals();
});

function setFormVisible(buttonId, formId) {
  $(`#${buttonId}`).addEventListener("click", () => {
    const form = $(`#${formId}`);
    form.hidden = !form.hidden;
  });
}

document.addEventListener("focusin", (event) => {
  if (event.target.matches("input, textarea, select")) document.body.classList.add("keyboard-open");
});
document.addEventListener("focusout", () => {
  window.setTimeout(() => {
    if (!document.activeElement?.matches("input, textarea, select")) {
      document.body.classList.remove("keyboard-open");
    }
  }, 0);
});
setFormVisible("add-result-button", "result-form");
setFormVisible("add-medal-button", "medal-form");

$$("[data-close-form]").forEach((button) => {
  button.addEventListener("click", () => { $(`#${button.dataset.closeForm}`).hidden = true; });
});

$("#result-form").addEventListener("submit", (event) => {
  event.preventDefault();
  data.results.unshift({
    id: makeId(),
    name: $("#result-name").value.trim(),
    place: $("#result-place").value.trim(),
    date: $("#result-date").value
  });
  saveData("Elmentettük az eredményedet.");
  event.currentTarget.reset();
  $("#result-date").value = todayISO();
  event.currentTarget.hidden = true;
  renderResults();
});

$("#medal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  data.medals.unshift({
    id: makeId(),
    name: $("#medal-name").value.trim(),
    event: $("#medal-event").value.trim(),
    location: $("#medal-place").value.trim(),
    date: $("#medal-date").value
  });
  saveData("Az érmet hozzáadtuk a gyűjteményedhez.");
  event.currentTarget.reset();
  $("#medal-date").value = todayISO();
  event.currentTarget.hidden = true;
  renderMedals();
});

$("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  data.profile.email = $("#profile-email").value.trim().slice(0, 120);
  data.profile.name = $("#profile-name").value.trim().slice(0, 40);
  data.profile.club = $("#profile-club").value.trim().slice(0, 80);
  data.profile.gender = $("#profile-gender").value;
  data.profile.notifications = $("#profile-notifications").value;
  data.profile.language = $("#profile-language").value;
  saveData("Elmentettük a profilbeállításaidat.");
  renderProfile();
});

function renderProfile() {
  const name = data.profile.name.trim();
  document.title = name ? `Motivapp · ${name}` : "Motivapp — Edzés a saját ritmusodban";
}

function renderAll() {
  renderWorkouts();
  renderTimer();
  renderProgress();
}

initialize();
