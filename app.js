"use strict";

const STORAGE_KEY = "motivapp.data.v1";
const TIMER_MODES = ["stopwatch", "interval", "countdown"];
const MODE_LABELS = {
  stopwatch: "Stopper",
  interval: "Munka / pihenő",
  countdown: "Visszaszámláló"
};
const TIMER_MODE_ANGLES = [0, 32, 64];
const PROGRESS_TABS = ["chart", "results", "medals"];
const defaults = {
  profile: { name: "" },
  workouts: [],
  recentWorkoutNames: [],
  sessions: [],
  results: [],
  medals: []
};

function freshData() {
  return { profile: { ...defaults.profile }, workouts: [], recentWorkoutNames: [], sessions: [], results: [], medals: [] };
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
  updateConnection();
  renderAll();
  renderBottomTabs("training");
  addRound();
  renderTimer();

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

function showScreen(screenName) {
  const validScreens = ["training", "competitions", "progress", "profile"];
  if (!validScreens.includes(screenName)) return;
  $$(".screen").forEach((screen) => { screen.hidden = screen.id !== `screen-${screenName}`; });
  const mainScreen = screenName === "profile" ? lastMainScreen : screenName;
  if (screenName !== "profile") lastMainScreen = screenName;
  renderBottomTabs(screenName === "profile" ? "profile" : screenName);
  closeMenu();
  if (screenName === "progress") renderProgress();
}

function closeMenu() {
  $("#menu-panel").hidden = true;
  $("#menu-button").setAttribute("aria-expanded", "false");
  $("#menu-button").setAttribute("aria-label", "Menü megnyitása");
}

$("#menu-button").addEventListener("click", () => {
  const open = $("#menu-panel").hidden;
  $("#menu-panel").hidden = !open;
  $("#menu-button").setAttribute("aria-expanded", String(open));
  $("#menu-button").setAttribute("aria-label", open ? "Menü bezárása" : "Menü megnyitása");
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("#menu-panel, #menu-button") && !$("#menu-panel").hidden) closeMenu();
  const navTarget = event.target.closest("[data-screen]");
  if (navTarget) {
    event.preventDefault();
    showScreen(navTarget.dataset.screen);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

const BOTTOM_TABS = {
  training: [
    { key: "timer", label: "Stopper", icon: '<circle cx="12" cy="13" r="8" /><path d="M9 2h6m-3 0v3m6.6.4 1.5-1.5M12 9v4l2.5 2" />' },
    { key: "workouts", label: "Edzéseim", icon: '<circle cx="12" cy="12" r="9" /><path d="M12 8v8m-4-4h8" />' }
  ],
  progress: [
    { key: "chart", label: "Grafikon", icon: '<path d="M3 3v18h18M7 14l4-4 3 3 6-7m0 0h-5m5 0v5" />' },
    { key: "results", label: "Eredmények", icon: '<path d="M8 3h8v3a4 4 0 0 1-8 0V3Zm0 2H5v2a4 4 0 0 0 4 4m7-6h3v2a4 4 0 0 1-4 4m-3 0v5m-4 4h8m-7-4h6v4H9z" />' },
    { key: "medals", label: "Érmek", icon: '<circle cx="12" cy="9" r="5" /><path d="m9 13-1 8 4-2 4 2-1-8M10 9l1.2 1.2L14 7" />' }
  ]
};

function renderBottomTabs(screen) {
  const nav = $("#bottom-nav");
  if (screen !== "training" && screen !== "progress") {
    nav.hidden = true;
    nav.innerHTML = "";
    return;
  }
  const isTraining = screen === "training";
  const tabs = BOTTOM_TABS[screen];
  const selectedTab = isTraining ? currentTrainingTab : currentProgressTab;
  const selectedIndex = tabs.findIndex((tab) => tab.key === selectedTab);
  nav.hidden = false;
  nav.setAttribute("aria-label", isTraining ? "Edzési eszközök" : "Fejlődési nézetek");
  nav.style.setProperty("--segments", String(tabs.length));
  nav.style.setProperty("--segment", String(Math.max(0, selectedIndex)));
  nav.innerHTML = `<span class="segment-pill" aria-hidden="true"></span>${tabs.map((tab) => `
    <button class="segment-button bottom-tab${tab.key === selectedTab ? " active" : ""}" type="button" data-bottom-tab="${tab.key}" aria-label="${tab.label}" aria-pressed="${tab.key === selectedTab}" title="${tab.label}">
      <svg class="segment-icon" viewBox="0 0 24 24" aria-hidden="true">${tab.icon}</svg>
    </button>`).join("")}`;
  if (isTraining) {
    $("#timer-panel").hidden = currentTrainingTab !== "timer";
    $("#workouts-panel").hidden = currentTrainingTab !== "workouts";
  } else {
    PROGRESS_TABS.forEach((tab) => { $(`#progress-${tab}`).hidden = tab !== currentProgressTab; });
  }
}

$("#bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-bottom-tab]");
  if (!button) return;
  const { bottomTab } = button.dataset;
  const currentScreen = lastMainScreen;
  const tabs = BOTTOM_TABS[currentScreen];
  const selectedIndex = tabs?.findIndex((tab) => tab.key === bottomTab) ?? -1;
  if (selectedIndex < 0) return;
  $("#bottom-nav").style.setProperty("--segment", String(selectedIndex));
  $$(".bottom-tab", $("#bottom-nav")).forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  if (currentScreen === "training") {
    currentTrainingTab = bottomTab;
    $("#timer-panel").hidden = bottomTab !== "timer";
    $("#workouts-panel").hidden = bottomTab !== "workouts";
  } else {
    currentProgressTab = bottomTab;
    PROGRESS_TABS.forEach((tab) => { $(`#progress-${tab}`).hidden = tab !== bottomTab; });
    if (bottomTab === "chart") renderProgress();
  }
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

function updateConnection() {
  const online = navigator.onLine;
  const indicator = $(".connection-indicator");
  indicator.classList.toggle("is-offline", !online);
  $("#connection-label").textContent = online ? "Online" : "Offline mód";
  $("#competition-status").innerHTML = `<span class="connection-dot"></span> ${online ? "Online kapcsolat" : "Nincs kapcsolat"}`;
  $("#competition-message").textContent = online ? "Az online versenyekhez még hiányzik a kiszolgáló." : "Nincs internetkapcsolat";
  $("#competition-description").textContent = online
    ? "Az internetkapcsolat aktív. Az online versenyek megjelenítéséhez a versenyadatokat szolgáltató kapcsolat beállítása is szükséges."
    : "A versenyek megtekintéséhez csatlakozz az internethez. Az edzéseid és a fejlődésed addig is elérhető offline.";
  $("#retry-connection").textContent = online ? "Kapcsolat újraellenőrzése" : "Újrapróbálás";
}

window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);
$("#retry-connection").addEventListener("click", () => {
  updateConnection();
  showToast(navigator.onLine ? "Van internetkapcsolat. A versenyszolgáltatás még nincs beállítva." : "Még mindig nincs internetkapcsolat.");
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
  const modeIndex = TIMER_MODES.indexOf(timerMode);
  $("#timer-dial").style.setProperty("--mode-angle", `${TIMER_MODE_ANGLES[modeIndex]}deg`);
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
    ? '<span class="play-icon">Ⅱ</span> Szünet'
    : `<span class="play-icon">▶</span> ${timerElapsed || (timerMode === "interval" && phaseRemaining < getPhaseDuration()) ? "Folytatás" : "Indítás"}`;
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
    if (delta > 0) advanceTimer(delta);
  }, 50);
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
      <div class="mini-field"><span>Gól</span>${createWheelPicker("goals", 0, "gól", 0, 99999, 1)}</div>
      <div class="mini-field"><span>Ismétlés</span>${createWheelPicker("reps", 10, "ism.", 0, 99999, 1)}</div>
      <div class="mini-field"><span>Táv</span>${createWheelPicker("distance", 0, "km", 0, 999999, 0.1)}</div>
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
      <div class="workout-card-top"><div><h3>${escapeHTML(workout.name)}</h3><p class="card-meta">${details.join(" · ")}</p></div><svg class="workout-icon runner-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="16.5" cy="4.5" r="2" /><path d="m13.5 8-3 4.5 3.5 2 3.5 4M10.5 12.5l-4 2.5m7.5-7 4 1.5 2.5 3M12 14.5l-2 5m7-2 3 3" /></svg></div>
      <div class="card-actions"><button class="small-action" type="button" data-complete-workout="${escapeHTML(workout.id)}">✓ Edzés elvégzése</button><button class="small-action delete-action" type="button" data-delete-workout="${escapeHTML(workout.id)}">Törlés</button></div>
    </article>`;
  }).join("");
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
      <button class="round-action secondary-action" type="button" data-delete-result="${escapeHTML(result.id)}" aria-label="Eredmény törlése: ${escapeHTML(result.name)}" style="width:34px;height:34px;font-size:16px">×</button>
    </article>`).join("");
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
        <summary><span class="medal-art" aria-hidden="true">✧</span><span class="medal-name">${escapeHTML(medal.name)}</span><span class="medal-meta">${dateLabel(medal.date, { year: "numeric", month: "short", day: "numeric" })}</span></summary>
        <div class="medal-location">${escapeHTML(medal.event)}<br>${escapeHTML(medal.location)}</div>
      </details>
      <button class="small-action delete-action medal-delete" type="button" data-delete-medal="${escapeHTML(medal.id)}">Érem törlése</button>
    </article>`).join("");
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
  data.profile.name = $("#profile-name").value.trim().slice(0, 40);
  saveData(data.profile.name ? `Szia, ${data.profile.name}! Elmentettük a profilodat.` : "Elmentettük a beállításaidat.");
});

function renderAll() {
  renderWorkouts();
  renderTimer();
  renderProgress();
}

initialize();
