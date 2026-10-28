const KEY_SETTINGS = "orelavoro_settings";
const KEY_DAYS = "orelavoro_days";
const KEY_FERIE = "orelavoro_ferie";

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

function ferie() {
  return loadJSON(KEY_FERIE, []);
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
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h ${String(m).padStart(2, "0")}m`;
}

function isFerie(key) {
  return ferie().includes(key);
}

function baseMinutes() {
  const s = settings();
  if (!s) return 0;
  return minutesBetween(s.start, s.end, s.break);
}

function calculateBalances() {
  const all = days();
  const base = baseMinutes();
  const keys = Object.keys(all).sort();

  let recoveryDebt = 0;
  let overtime = 0;
  const result = {};

  for (const key of keys) {
    const record = all[key];
    const worked = minutesBetween(record.in, record.out, 0);
    const difference = worked - base;

    if (difference < 0) {
      recoveryDebt += Math.abs(difference);
      result[key] = { difference, usedForRecovery: 0, overtimeMinutes: 0 };
    } else {
      let usedForRecovery = 0;

      if (difference > 0 && recoveryDebt > 0 && record.allocation === "recupero") {
        usedForRecovery = Math.min(difference, recoveryDebt);
        recoveryDebt -= usedForRecovery;
      }

      const overtimeMinutes = difference - usedForRecovery;
      overtime += overtimeMinutes;

      result[key] = { difference, usedForRecovery, overtimeMinutes };
    }
  }

  return { result, recoveryDebt, overtime };
}

function nextFerie() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const future = ferie()
    .map(date => new Date(date + "T00:00:00"))
    .filter(date => date.getTime() >= today.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  return future[0] || null;
}

function daysUntilNextFerie() {
  const next = nextFerie();
  if (!next) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const difference = next.getTime() - today.getTime();
  return Math.round(difference / (24 * 60 * 60 * 1000));
}

function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
  }

  const s = settings();
  if (!s) {
    showSettings();
  } else {
    document.getElementById("baseStart").value = s.start;
    document.getElementById("baseEnd").value = s.end;
    document.getElementById("baseBreak").value = s.break;
  }

  const today = new Date();
  const todayKey = dateKey(today);

  document.getElementById("todayDate").textContent =
    today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const saved = days()[todayKey] || {};
  document.getElementById("clockIn").value = saved.in || "";
  document.getElementById("clockOut").value = saved.out || "";
  document.getElementById("abbinamento").checked = !!saved.abbinamento;
  document.getElementById("allocation").value = saved.allocation || "straordinario";

  renderCalendar();
  renderSummary();
  renderTodayResult();
  renderRecovery();
  renderFerie();
}

function showSettings() {
  document.getElementById("setup").classList.remove("hidden");
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
  renderRecovery();
}

function saveDay() {
  const key = dateKey();
  const inTime = document.getElementById("clockIn").value;
  const outTime = document.getElementById("clockOut").value;
  const abbinamento = document.getElementById("abbinamento").checked;
  const allocation = document.getElementById("allocation").value;

  if (!inTime || !outTime) return alert("Inserisci entrata e uscita.");

  const all = days();
  all[key] = { in: inTime, out: outTime, abbinamento, allocation };
  saveJSON(KEY_DAYS, all);

  renderCalendar();
  renderSummary();
  renderTodayResult();
  renderRecovery();
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
  renderRecovery();
}

function loadDayToEdit() {
  const key = document.getElementById("editDate").value;
  const result = document.getElementById("editResult");

  if (!key) {
    result.textContent = "";
    return;
  }

  const record = days()[key];

  if (!record) {
    document.getElementById("editIn").value = "";
    document.getElementById("editOut").value = "";
    document.getElementById("editAbbinamento").checked = false;
    document.getElementById("editAllocation").value = "straordinario";
    result.textContent = "Non ci sono ore registrate in questa data. Puoi inserirle ora.";
    return;
  }

  document.getElementById("editIn").value = record.in || "";
  document.getElementById("editOut").value = record.out || "";
  document.getElementById("editAbbinamento").checked = !!record.abbinamento;
  document.getElementById("editAllocation").value = record.allocation || "straordinario";
  result.textContent = "Giornata caricata. Modifica i dati e salva.";
}

function saveEditedDay() {
  const key = document.getElementById("editDate").value;
  const inTime = document.getElementById("editIn").value;
  const outTime = document.getElementById("editOut").value;

  if (!key) return alert("Scegli prima la data da correggere.");
  if (!inTime || !outTime) return alert("Inserisci entrata e uscita.");

  const all = days();
  all[key] = {
    in: inTime,
    out: outTime,
    abbinamento: document.getElementById("editAbbinamento").checked,
    allocation: document.getElementById("editAllocation").value
  };

  saveJSON(KEY_DAYS, all);
  renderCalendar();
  renderSummary();
  renderRecovery();
  renderTodayResult();
  alert("Giornata aggiornata.");
}

function deleteEditedDay() {
  const key = document.getElementById("editDate").value;
  if (!key) return alert("Scegli prima la data da correggere.");

  const all = days();
  delete all[key];
  saveJSON(KEY_DAYS, all);

  document.getElementById("editIn").value = "";
  document.getElementById("editOut").value = "";
  document.getElementById("editAbbinamento").checked = false;

  renderCalendar();
  renderSummary();
  renderRecovery();
  renderTodayResult();
  alert("Giornata eliminata.");
}

function renderTodayResult() {
  const s = settings();
  const box = document.getElementById("dayResult");
  const allocationBox = document.getElementById("allocationBox");

  if (!s) {
    box.textContent = "Imposta prima l’orario base.";
    return;
  }

  const inTime = document.getElementById("clockIn").value;
  const outTime = document.getElementById("clockOut").value;

  if (!inTime || !outTime) {
    box.textContent = "Inserisci entrata e uscita per calcolare le ore.";
    allocationBox.classList.add("hidden");
    return;
  }

  const worked = minutesBetween(inTime, outTime, 0);
  const base = baseMinutes();
  const difference = worked - base;
  const { recoveryDebt } = calculateBalances();

  if (difference < 0) {
    allocationBox.classList.add("hidden");
    box.innerHTML = `
      Ore registrate: <b>${formatHours(worked)}</b><br>
      Orario base: <b>${formatHours(base)}</b><br>
      Ore da recuperare oggi: <b class="warn">${formatHours(Math.abs(difference))}</b><br>
      Totale da recuperare: <b class="warn">${formatHours(recoveryDebt + Math.abs(difference))}</b>
    `;
    return;
  }

  if (difference === 0) {
    allocationBox.classList.add("hidden");
    box.innerHTML = `
      Ore registrate: <b>${formatHours(worked)}</b><br>
      Orario base: <b>${formatHours(base)}</b><br>
      Nessuna differenza rispetto all’orario base.
    `;
    return;
  }

  allocationBox.classList.remove("hidden");

  if (recoveryDebt > 0) {
    box.innerHTML = `
      Ore registrate: <b>${formatHours(worked)}</b><br>
      Orario base: <b>${formatHours(base)}</b><br>
      Ore extra oggi: <b class="ok">${formatHours(difference)}</b><br>
      Hai <b class="warn">${formatHours(recoveryDebt)}</b> da recuperare.<br>
      Scegli se considerarle <b>straordinario</b> oppure <b>recupero ore</b>.
    `;
  } else {
    box.innerHTML = `
      Ore registrate: <b>${formatHours(worked)}</b><br>
      Orario base: <b>${formatHours(base)}</b><br>
      Straordinario oggi: <b class="ok">${formatHours(difference)}</b>
    `;
  }
}

function renderRecovery() {
  const { recoveryDebt, overtime } = calculateBalances();
  document.getElementById("recoveryBox").innerHTML = `
    <p>Ore totali da recuperare: <b class="${recoveryDebt > 0 ? "warn" : "ok"}">${formatHours(recoveryDebt)}</b></p>
    <p>Straordinari totali: <b class="ok">${formatHours(overtime)}</b></p>
  `;
}

function addFerie() {
  const date = document.getElementById("ferieDate").value;
  if (!date) return alert("Scegli una data.");

  const list = ferie();
  if (!list.includes(date)) list.push(date);

  saveJSON(KEY_FERIE, list.sort());
  document.getElementById("ferieDate").value = "";
  renderFerie();
  renderCalendar();
  renderSummary();
}

function removeFerie(date) {
  saveJSON(KEY_FERIE, ferie().filter(item => item !== date));
  renderFerie();
  renderCalendar();
  renderSummary();
}

function renderFerie() {
  const list = ferie();
  const box = document.getElementById("ferieList");

  if (!list.length) {
    box.innerHTML = `<p class="small">Nessun giorno di ferie inserito.</p>`;
    return;
  }

  box.innerHTML = list.map(date => `
    <div class="row" style="margin-top:8px">
      <div style="align-self:center">${new Date(date + "T00:00:00").toLocaleDateString("it-IT")}</div>
      <button class="secondary" onclick="removeFerie('${date}')">Rimuovi</button>
    </div>
  `).join("");
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
  const startColumn = (first.getDay() + 6) % 7;

  for (let i = 0; i < startColumn; i++) calendar.insertAdjacentHTML("beforeend", "<div></div>");

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day));
    const record = all[key];
    const holiday = isFerie(key);

    calendar.insertAdjacentHTML("beforeend", `
      <div class="day ${record ? "work" : ""} ${holiday ? "ferie" : ""} ${key === todayKey ? "today" : ""}">
        <div><b>${day}</b></div>
        ${holiday ? `<div class="small">FERIE</div>` : ""}
        ${record ? `<div class="small">${record.abbinamento ? "🚚" : ""}<br>${formatHours(minutesBetween(record.in, record.out, 0))}</div>` : ""}
      </div>
    `);
  }
}

function renderSummary() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const all = days();
  const { recoveryDebt, overtime } = calculateBalances();

  let worked = 0;
  let workDays = 0;
  let abbinamenti = 0;
  let ferieCount = 0;

  for (const [key, record] of Object.entries(all)) {
    const d = new Date(key);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;

    worked += minutesBetween(record.in, record.out, 0);
    workDays++;
    if (record.abbinamento) abbinamenti++;
  }

  for (const date of ferie()) {
    const d = new Date(date + "T00:00:00");
    if (d.getFullYear() === year && d.getMonth() === month) ferieCount++;
  }

  const daysToNextFerie = daysUntilNextFerie();
  const ferieMessage = daysToNextFerie === null
    ? `<p class="small">Non hai inserito ferie future.</p>`
    : `<p class="warn">Ti mancano ${daysToNextFerie} giorni alle ferie!!!</p>`;

  document.getElementById("summary").innerHTML = `
    ${ferieMessage}
    <p>Giornate lavorate: <b>${workDays}</b></p>
    <p>Ore lavorate: <b>${formatHours(worked)}</b></p>
    <p>Straordinari: <b class="ok">${formatHours(overtime)}</b></p>
    <p>Ore da recuperare: <b class="${recoveryDebt > 0 ? "warn" : "ok"}">${formatHours(recoveryDebt)}</b></p>
    <p>Abbinamenti: <b>${abbinamenti}</b></p>
    <p>Ferie in questo mese: <b>${ferieCount}</b></p>
  `;
}

function exportData() {
  const data = {
    app: "OreLavoro",
    exportedAt: new Date().toISOString(),
    settings: settings(),
    days: days(),
    ferie: ferie()
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
      saveJSON(KEY_FERIE, data.ferie || []);
      init();
      alert("Backup importato correttamente.");
    } catch {
      alert("File di backup non valido.");
    }
  };
  reader.readAsText(file);
}

init();
