const API_BASE = "https://698a177bc04d974bc6a1535b.mockapi.io/api/v1/Circuito";
const TICK_MS = 2000;

const HISTORY_MAX = 10;      // últimos 10 estados por dispositivo
const CHART_MAX = 10;        // gráfica últimos 10 puntos

const chartsRow = document.getElementById("chartsRow");
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
let historyById = new Map();    // id -> array
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
function timeHHMMSS() {
  return new Date().toLocaleTimeString();
}

// ===== Simulación (sin guardar en API) =====
function rand(min, max) {
  return +(Math.random() * (max - min) + min).toFixed(2);
}
function getCurrentByLoad(load) {
  if (load === "baja") return rand(1, 3);
  if (load === "media") return rand(4, 7);
  return rand(8, 12);
}
function simulateReading(c) {
  // Si está apagado, no cambia nada
  if (!c.active) return c;

  const load = normalizeLoad(c.load);
  const voltaje = safeNumber(c.voltaje, 127);
  const limit = safeNumber(c.limit, 0);

  const corriente = getCurrentByLoad(load);
  const potencia = +(voltaje * corriente).toFixed(2);
  const estado = limit > 0 && potencia > limit ? "alerta" : "normal";

  const energiaPrev = safeNumber(c.energia, 0);
  const energia = +(energiaPrev + potencia * (TICK_MS / 1000 / 3600)).toFixed(4);

  return { ...c, corriente, potencia, energia, estado };
}

// ===== API (solo lectura) =====
async function apiGetAll() {
  const res = await fetch(API_BASE);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET ${res.status} ${res.statusText} :: ${txt}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ===== UI: Chart Card + Mini Table =====
function ensureChartCard(c) {
  const id = String(c.id);
  if (document.getElementById(`chart-card-${id}`)) return;

  const col = document.createElement("div");
  col.className = "col-12 col-xl-6";
  col.innerHTML = `
    <div id="chart-card-${id}" class="card glass border-0 shadow-sm h-100 chart-card">
      <div class="card-body">

        <div class="d-flex justify-content-between align-items-start gap-3">
          <div>
            <div class="text-secondary small">ID: ${id}</div>
            <h5 class="card-title mb-1">${c.name || "—"}</h5>
            <div class="mini-badges">
              <span id="badge-state-${id}" class="badge text-bg-secondary">—</span>
              <span class="badge text-bg-secondary">${normalizeLoad(c.load)}</span>
            </div>
          </div>

          <div class="small text-secondary text-end">
            <div>Límite: <span class="fw-semibold">${safeNumber(c.limit, 0)}</span> W</div>
            <div>ON: <span class="fw-semibold" id="on-${id}">${c.active ? "Sí" : "No"}</span></div>
          </div>
        </div>

        <div class="card-split mt-3">
          <div class="chart-wrap">
            <canvas id="chart-${id}" height="170"></canvas>
            <div class="chart-foot">
              Potencia actual: <span class="fw-semibold" id="pwr-${id}">—</span> W
              · Energía: <span class="fw-semibold" id="eng-${id}">—</span> Wh
            </div>
          </div>

          <div class="mini-table-wrap">
            <div class="mini-table-head">
              <div class="title"><i class="bi bi-clock-history me-2"></i>Últimos 10</div>
              <div class="meta">solo activo</div>
            </div>

            <div class="mini-scroll">
              <table class="mini-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>W</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody id="miniBody-${id}">
                  <tr><td colspan="3" class="text-secondary">Sin lecturas…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
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
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
      }]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxTicksLimit: 5 } } }
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
  const onEl = document.getElementById(`on-${id}`);

  const potencia = safeNumber(c.potencia, 0);
  const energia = safeNumber(c.energia, 0);
  const estado = String(c.estado || "normal").toLowerCase();

  // badge estado
  if (!c.active) {
    badge.className = "badge text-bg-secondary";
    badge.textContent = "OFFLINE";
  } else {
    badge.className = "badge " + (estado === "alerta" ? "text-bg-danger" : "text-bg-success");
    badge.textContent = estado === "alerta" ? "ALERTA" : "NORMAL";
  }

  // texts
  pwrEl.textContent = potencia.toFixed(2);
  engEl.textContent = energia.toFixed(4);
  if (onEl) onEl.textContent = c.active ? "Sí" : "No";

  // ✅ si está OFF, NO agregamos puntos nuevos
  if (!c.active) {
    chart.update();
    return;
  }

  // push chart point (solo ON)
  const label = timeHHMMSS();
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(potencia);

  while (chart.data.labels.length > CHART_MAX) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }

  chart.update();
}

// ===== Mini history per circuit =====
function pushHistory(c) {
  const id = String(c.id);
  const list = historyById.get(id) || [];

  const row = {
    time: new Date().toLocaleTimeString(),
    potencia: safeNumber(c.potencia, 0),
    estado: String(c.estado || "normal").toLowerCase(),
  };

  list.unshift(row);
  while (list.length > HISTORY_MAX) list.pop();
  historyById.set(id, list);
}

function renderMiniTable(id) {
  const list = historyById.get(id) || [];
  const body = document.getElementById(`miniBody-${id}`);
  if (!body) return;

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="3" class="text-secondary">Sin lecturas…</td></tr>`;
    return;
  }

  body.innerHTML = list.map(h => {
    const badge = h.estado === "alerta"
      ? `<span class="badge badge-alert">ALERTA</span>`
      : `<span class="badge badge-ok">NORMAL</span>`;

    return `
      <tr>
        <td class="text-secondary">${h.time}</td>
        <td class="text-secondary">${h.potencia.toFixed(2)}</td>
        <td>${badge}</td>
      </tr>
    `;
  }).join("");
}

// ===== Tick (cada 2s) =====
async function tick() {
  if (isTicking) return;
  isTicking = true;

  try {
    circuits = await apiGetAll();

    for (const c of circuits) ensureChartCard(c);

    // ✅ actualiza usando simulación (sin guardar en API)
    for (const c of circuits) {
      const id = String(c.id);
      const view = simulateReading(c);

      updateChartAndBadges(view);
      if (view.active) pushHistory(view);
      renderMiniTable(id);
    }

    lastTickEl.textContent = new Date().toLocaleTimeString();
    hideStatus();
  } catch (e) {
    console.error("MONITOR ERROR =>", e.message || e);
    showStatus(`Error en monitoreo: ${e.message || e}`, "danger");
    notify("Error", "No se pudo actualizar el monitoreo.");
  } finally {
    isTicking = false;
  }
}

function start() {
  endpointLabel.textContent = API_BASE;
  showStatus("Iniciando monitoreo…", "info");
  tick();
  timer = setInterval(tick, TICK_MS);
}

btnReload.addEventListener("click", tick);
start();