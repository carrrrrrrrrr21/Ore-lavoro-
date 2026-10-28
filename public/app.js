const KEY_SETTINGS = "orelavoro_settings";
const KEY_DAYS = "orelavoro_days";

let viewDate = new Date();

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function settings() {
  return loadJSON(KEY_SETTINGS, null);
}

function days() {
  return loadJSON(KEY_DAYS, {});
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function minutesBetween(start, end, breakMinutes) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes - (breakMinutes || 0));
}

function formatHours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
  }

  const s = settings();
  if (!s) {
    document.getElementById("setup").classList.remove("hidden");
  } else {
    document.getElementById("baseStart").value = s.start;
    document.getElementById("baseEnd").value = s.end;
    document.getElementById("baseBreak").value = s.break;
  }

  const today = new Date();
  document.getElementById("todayDate").textContent =
    today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const saved = days()[dateKey(today)] || {};
  document.getElementById("clockIn").value = saved.in || "";
  document.getElementById("clockOut").value = saved.out || "";
  document.getElementById("abbinamento").checked = !!saved.abbinamento;

  renderCalendar();
  renderSummary();
  renderTodayResult();
}

function saveSettings() {
  const start = document.getElementById("baseStart").value;
  const end = document.getElementById("baseEnd").value;
  const pause = Number(document.getElementById("baseBreak").value || 0);

  if (!start || !end) return alert("Inserisci ora di inizio e fine.");

  saveJSON(KEY_SETTINGS, { start, end, break: pause });
  document.getElementById("setup").classList.add("hidden");
  renderCalendar();
  renderSummary();
  renderTodayResult();
}

function saveDay() {
  const key = dateKey();
  const inTime = document.getElementById("clockIn").value;
  const outTime = document.getElementById("clockOut").value;
  const abbinamento = document.getElementById("abbinamento").checked;

  if (!inTime || !outTime) return alert("Inserisci entrata e uscita.");

  const all = days();
  all[key] = { in: inTime, out: outTime, abbinamento };
  saveJSON(KEY_DAYS, all);

  renderCalendar();
  renderSummary();
  renderTodayResult();
}

function clearDay() {
  const all = days();
  delete all[dateKey()];
  saveJSON(KEY_DAYS, all);

  document.getElementById("clockIn").value = "";
  document.getElementById("clockOut").value = "";
  document.getElementById("abbinamento").checked = false;

  renderCalendar();
  renderSummary();
  renderTodayResult();
}

function renderTodayResult() {
  const s = settings();
  const box = document.getElementById("dayResult");
  if (!s) {
    box.textContent = "Imposta prima l’orario base.";
    return;
  }

  const inTime = document.getElementById("clockIn").value;
  const outTime = document.getElementById("clockOut").value;

  if (!inTime || !outTime) {
    box.textContent = "Inserisci entrata e uscita per calcolare le ore.";
    return;
  }

  const worked = minutesBetween(inTime, outTime, 0);
  const base = minutesBetween(s.start, s.end, s.break);
  const extra = Math.max(0, worked - base);

  box.innerHTML = `
    Ore registrate: <b>${formatHours(worked)}</b><br>
    Orario base: <b>${formatHours(base)}</b><br>
    Straordinari: <b class="${extra > 0 ? "ok" : ""}">${formatHours(extra)}</b>
  `;
}

function changeMonth(delta) {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
  renderCalendar();
  renderSummary();
}

function renderCalendar() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const all = days();
  const todayKey = dateKey();

  document.getElementById("monthTitle").textContent =
    viewDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const calendar = document.getElementById("calendar");
  calendar.innerHTML = ["L", "M", "M", "G", "V", "S", "D"].map(d => `<div class="small">${d}</div>`).join("");

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startColumn = (first.getDay() + 6) % 7;

  for (let i = 0; i < startColumn; i++) calendar.insertAdjacentHTML("beforeend", "<div></div>");

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day));
    const record = all[key];
    calendar.insertAdjacentHTML("beforeend", `
      <div class="day ${record ? "work" : ""} ${key === todayKey ? "today" : ""}">
        <div><b>${day}</b></div>
        ${record ? `<div class="small">${record.abbinamento ? "🚚" : ""}<br>${formatHours(minutesBetween(record.in, record.out, 0))}</div>` : ""}
      </div>
    `);
  }
}

function renderSummary() {
  const s = settings();
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const all = days();

  let worked = 0;
  let overtime = 0;
  let workDays = 0;
  let abbinamenti = 0;

  for (const [key, record] of Object.entries(all)) {
    const d = new Date(key);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;

    const minutes = minutesBetween(record.in, record.out, 0);
    const base = s ? minutesBetween(s.start, s.end, s.break) : 0;

    worked += minutes;
    overtime += Math.max(0, minutes - base);
    workDays++;
    if (record.abbinamento) abbinamenti++;
  }

  document.getElementById("summary").innerHTML = `
    <p>Giornate registrate: <b>${workDays}</b></p>
    <p>Ore lavorate: <b>${formatHours(worked)}</b></p>
    <p>Straordinari: <b class="${overtime > 0 ? "ok" : ""}">${formatHours(overtime)}</b></p>
    <p>Abbinamenti: <b>${abbinamenti}</b></p>
  `;
}

function exportData() {
  const data = {
    app: "OreLavoro",
    exportedAt: new Date().toISOString(),
    settings: settings(),
    days: days()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `orelavoro-backup-${dateKey()}.json`;
  link.click();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.days) throw new Error();

      if (data.settings) saveJSON(KEY_SETTINGS, data.settings);
      saveJSON(KEY_DAYS, data.days);
      init();
      alert("Backup importato correttamente.");
    } catch {
      alert("File di backup non valido.");
    }
  };
  reader.readAsText(file);
}

init();
