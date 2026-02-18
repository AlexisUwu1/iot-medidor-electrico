const API_BASE = "https://698a177bc04d974bc6a1535b.mockapi.io/api/v1/Circuito";
const TICK_MS = 2000;

const chartsRow = document.getElementById("chartsRow");
const historyBody = document.getElementById("historyBody");
const statusBar = document.getElementById("statusBar");
const endpointLabel = document.getElementById("endpointLabel");
const lastTickEl = document.getElementById("lastTick");
const btnReload = document.getElementById("btnReload");

// Toast
const toastEl = document.getElementById("appToast");
const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
const toastTitle = document.getElementById("toastTitle");
const toastBody = document.getElementById("toastBody");
const toastTime = document.getElementById("toastTime");

let circuits = [];
let chartsById = new Map();     // id -> Chart
let historyById = new Map();    // id -> array (max 10)
let timer = null;
let isTicking = false;

function showStatus(message, type = "info") {
  statusBar.className = `alert alert-${type}`;
  statusBar.textContent = message;
  statusBar.classList.remove("d-none");
}
function hideStatus() {
  statusBar.classList.add("d-none");
}
function notify(title, message) {
  toastTitle.textContent = title;
  toastBody.textContent = message;
  toastTime.textContent = "ahora";
  toast.show();
}

function normalizeLoad(value) {
  const v = String(value || "").toLowerCase().trim();
  if (["baja", "media", "alta"].includes(v)) return v;
  return "media";
}
function safeNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}
function nowISO() {
  return new Date().toISOString();
}
function timeHHMMSS() {
  return new Date().toLocaleTimeString();
}
function rand(min, max) {
  return +(Math.random() * (max - min) + min).toFixed(2);
}
function getCurrentByLoad(load) {
  if (load === "baja") return rand(1, 3);
  if (load === "media") return rand(4, 7);
  return rand(8, 12);
}

// ===== API =====
async function apiGetAll() {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error(`GET ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function apiUpdate(id, patch) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PUT ${res.status}`);
  return res.json();
}

// ===== UI: Charts =====
function ensureChartCard(c) {
  const id = String(c.id);
  if (document.getElementById(`chart-card-${id}`)) return;

  const col = document.createElement("div");
  col.className = "col-12 col-md-6 col-xl-4";
  col.innerHTML = `
    <div id="chart-card-${id}" class="card glass border-0 shadow-sm h-100">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="text-secondary small">ID: ${id}</div>
            <h5 class="mb-1">${c.name || "—"}</h5>
            <div class="d-flex gap-2 align-items-center">
              <span id="badge-state-${id}" class="badge text-bg-secondary">—</span>
              <span class="badge text-bg-secondary">${normalizeLoad(c.load)}</span>
            </div>
          </div>
          <div class="small text-secondary text-end">
            <div>Límite: <span class="fw-semibold">${safeNumber(c.limit, 0)}</span> W</div>
            <div>ON: <span class="fw-semibold">${c.active ? "Sí" : "No"}</span></div>
          </div>
        </div>

        <div class="mt-3">
          <canvas id="chart-${id}" height="160"></canvas>
        </div>

        <div class="mt-3 small text-secondary">
          Potencia actual: <span class="fw-semibold" id="pwr-${id}">—</span> W
          · Energía: <span class="fw-semibold" id="eng-${id}">—</span> Wh
        </div>
      </div>
    </div>
  `;
  chartsRow.appendChild(col);

  const ctx = document.getElementById(`chart-${id}`).getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Potencia (W)",
        data: [],
        tension: 0.35,
      }]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 5 } }
      }
    }
  });

  chartsById.set(id, chart);
}

function updateChartAndBadges(c) {
  const id = String(c.id);
  const chart = chartsById.get(id);
  if (!chart) return;

  const badge = document.getElementById(`badge-state-${id}`);
  const pwrEl = document.getElementById(`pwr-${id}`);
  const engEl = document.getElementById(`eng-${id}`);

  const potencia = safeNumber(c.potencia, 0);
  const energia = safeNumber(c.energia, 0);
  const estado = String(c.estado || "normal").toLowerCase();

  // badge
  badge.className = "badge " + (estado === "alerta" ? "text-bg-danger" : "text-bg-success");
  badge.textContent = estado === "alerta" ? "ALERTA" : "NORMAL";

  // text
  pwrEl.textContent = potencia.toFixed(2);
  engEl.textContent = energia.toFixed(4);

  // chart push (guardamos últimos 12 puntos aprox)
  const label = timeHHMMSS();
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(potencia);

  if (chart.data.labels.length > 12) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }

  chart.update();
}

// ===== UI: History =====
function pushHistory(c) {
  const id = String(c.id);
  const list = historyById.get(id) || [];
  const row = {
    name: c.name || "—",
    time: new Date().toLocaleTimeString(),
    voltaje: safeNumber(c.voltaje, 127),
    corriente: safeNumber(c.corriente, 0),
    potencia: safeNumber(c.potencia, 0),
    energia: safeNumber(c.energia, 0),
    estado: String(c.estado || "normal").toLowerCase(),
  };
  list.unshift(row);
  if (list.length > 10) list.pop();
  historyById.set(id, list);
}

function renderHistoryTable() {
  // Flatten: mostramos 10 por circuito, agrupado por circuito
  const circuitsSorted = [...circuits].sort((a, b) => String(a.name||"").localeCompare(String(b.name||"")));
  const rows = [];

  for (const c of circuitsSorted) {
    const id = String(c.id);
    const list = historyById.get(id) || [];
    if (list.length === 0) continue;

    for (const h of list) {
      const badge = h.estado === "alerta"
        ? `<span class="badge text-bg-danger">ALERTA</span>`
        : `<span class="badge text-bg-success">NORMAL</span>`;

      rows.push(`
        <tr>
          <td class="fw-semibold">${h.name}</td>
          <td class="text-secondary">${h.time}</td>
          <td class="text-secondary">${h.voltaje.toFixed(0)}</td>
          <td class="text-secondary">${h.corriente.toFixed(2)}</td>
          <td class="text-secondary">${h.potencia.toFixed(2)}</td>
          <td class="text-secondary">${h.energia.toFixed(4)}</td>
          <td>${badge}</td>
        </tr>
      `);
    }
  }

  historyBody.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="7" class="text-center text-secondary py-4">
        <i class="bi bi-inbox"></i> Aún no hay lecturas. Enciende algún circuito en Control.
       </td></tr>`;
}

// ===== Simulation Tick (cada 2s) =====
async function tick() {
  if (isTicking) return;
  isTicking = true;

  try {
    circuits = await apiGetAll();

    // crear cards/charts si faltan
    for (const c of circuits) ensureChartCard(c);

    // Para cada circuito:
    // - si active = true, genera lectura y hace PUT
    // - si active = false, solo muestra lo actual (y no mete historial)
    const updates = [];

    for (const c of circuits) {
      const id = String(c.id);

      if (!c.active) {
        // aun así actualizamos UI con lo que haya
        updateChartAndBadges(c);
        continue;
      }

      const load = normalizeLoad(c.load);
      const voltaje = safeNumber(c.voltaje, 127);
      const limit = safeNumber(c.limit, 0);

      const corriente = getCurrentByLoad(load);
      const potencia = +(voltaje * corriente).toFixed(2);
      const estado = potencia > limit ? "alerta" : "normal";

      const energiaPrev = safeNumber(c.energia, 0);
      const energia = +(energiaPrev + potencia * (TICK_MS / 1000 / 3600)).toFixed(4);

      updates.push(
        apiUpdate(id, {
          voltaje,
          corriente,
          potencia,
          energia,
          estado,
          update: nowISO(),
        })
      );
    }

    // Ejecuta updates
    if (updates.length) await Promise.allSettled(updates);

    // Relee para UI exacta (opcional pero deja consistente)
    circuits = await apiGetAll();

    for (const c of circuits) {
      updateChartAndBadges(c);
      if (c.active) pushHistory(c); // historial solo cuando está activo
    }

    renderHistoryTable();
    lastTickEl.textContent = new Date().toLocaleTimeString();
    hideStatus();
  } catch (e) {
    console.error(e);
    showStatus("Error en monitoreo. Revisa conexión/endpoint.", "danger");
    notify("Error", "No se pudo actualizar el monitoreo.");
  } finally {
    isTicking = false;
  }
}

function start() {
  endpointLabel.textContent = API_BASE;
  showStatus("Iniciando monitoreo…", "info");
  tick(); // primer tick inmediato
  timer = setInterval(tick, TICK_MS);
}

btnReload.addEventListener("click", tick);

// Init
start();