const API_BASE = "https://698a177bc04d974bc6a1535b.mockapi.io/api/v1/Circuito";
const TICK_MS = 2000;

const HISTORY_MAX = 10;  // últimos 10 estados por dispositivo
const CHART_MAX = 10;    // últimos 10 puntos en gráfica

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
let chartsById = new Map();   // id -> Chart
let historyById = new Map();  // id -> [{time,potencia,estado}]
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
  return (["baja", "media", "alta"].includes(v)) ? v : "media";
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

// ✅ Esto evita el bug de active guardado como string ("true", "Sí", etc)
function isActiveValue(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v).toLowerCase().trim();
  return (s === "true" || s === "1" || s === "si" || s === "sí" || s === "on");
}

function getCurrentByLoad(load) {
  if (load === "baja") return rand(1, 3);
  if (load === "media") return rand(4, 7);
  return rand(8, 12);
}

// ===== API =====
async function apiGetAll() {
  const res = await fetch(API_BASE);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET ${res.status} ${res.statusText} :: ${txt}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function apiUpdate(id, patch) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PUT ${id} ${res.status} ${res.statusText} :: ${txt}`);
  }
  return res.json();
}

// ===== UI: Card =====
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
            <h5 class="card-title mb-1 device-name">${c.name || "—"}</h5>
            <div class="mini-badges">
              <span id="badge-state-${id}" class="badge text-bg-secondary">—</span>
              <span class="badge text-bg-secondary">${normalizeLoad(c.load)}</span>
            </div>
          </div>

          <div class="small text-secondary text-end">
            <div>Límite: <span class="fw-semibold">${safeNumber(c.limit, 0)}</span> W</div>
            <div>ON: <span class="fw-semibold">${isActiveValue(c.active) ? "Sí" : "No"}</span></div>
          </div>
        </div>

        <div class="card-split mt-3">
          <div class="chart-wrap">
            <canvas id="chart-${id}" height="170"></canvas>
            <div class="chart-foot">
              Potencia: <span class="fw-semibold" id="pwr-${id}">—</span> W
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
    data: { labels: [], datasets: [{ data: [], tension: 0.35, borderWidth: 2, pointRadius: 2 }] },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 5 } },
        y: { beginAtZero: true }
      }
    }
  });

  chartsById.set(id, chart);
}

function updateChartAndBadges(view) {
  const id = String(view.id);
  const chart = chartsById.get(id);
  if (!chart) return;

  const badge = document.getElementById(`badge-state-${id}`);
  const pwrEl = document.getElementById(`pwr-${id}`);
  const engEl = document.getElementById(`eng-${id}`);

  const potencia = safeNumber(view.potencia, 0);
  const energia = safeNumber(view.energia, 0);
  const estado = String(view.estado || "normal").toLowerCase();

  // ✅ Estado por ACTIVE primero (si no está activo, no es OFFLINE, es APAGADO)
  const active = isActiveValue(view.active);

  if (!active) {
    badge.className = "badge text-bg-secondary";
    badge.textContent = "APAGADO";
  } else {
    badge.className = "badge " + (estado === "alerta" ? "text-bg-danger" : "text-bg-success");
    badge.textContent = (estado === "alerta") ? "ALERTA" : "NORMAL";
  }

  pwrEl.textContent = potencia.toFixed(2);
  engEl.textContent = energia.toFixed(4);

  // ✅ Solo empuja punto si está activo (si no, la gráfica no se mueve)
  if (active) {
    chart.data.labels.push(timeHHMMSS());
    chart.data.datasets[0].data.push(potencia);

    while (chart.data.labels.length > CHART_MAX) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update();
  }
}

// ===== Mini history =====
function pushHistory(view) {
  const id = String(view.id);
  const list = historyById.get(id) || [];

  list.unshift({
    time: timeHHMMSS(),
    potencia: safeNumber(view.potencia, 0),
    estado: String(view.estado || "normal").toLowerCase(),
  });

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
    const badge = (h.estado === "alerta")
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

// ===== Tick =====
let putEvery = 0;

async function tick() {
  if (isTicking) return;
  isTicking = true;

  try {
    circuits = await apiGetAll();
    for (const c of circuits) ensureChartCard(c);

    // ✅ Mandamos PUT cada 4 segundos para evitar límite
    putEvery++;
    const allowPut = (putEvery % 2 === 0);

    const updates = [];
    const predicted = new Map();

    for (const c of circuits) {
      const id = String(c.id);
      const active = isActiveValue(c.active);

      if (!active) {
        // solo muestra lo actual
        updateChartAndBadges(c);
        renderMiniTable(id);
        continue;
      }

      const load = normalizeLoad(c.load);
      const voltaje = safeNumber(c.voltaje, 120);
      const limit = safeNumber(c.limit, 0);

      const corriente = getCurrentByLoad(load);
      const potencia = +(voltaje * corriente).toFixed(2);
      const estado = (limit > 0 && potencia > limit) ? "alerta" : "normal";

      const energiaPrev = safeNumber(c.energia, 0);
      const energia = +(energiaPrev + potencia * (TICK_MS / 1000 / 3600)).toFixed(4);

      const patch = { voltaje, corriente, potencia, energia, estado, update: nowISO() };
      predicted.set(id, { ...c, ...patch });

      if (allowPut) updates.push(apiUpdate(id, patch));
    }

    const results = updates.length ? await Promise.allSettled(updates) : [];
    const failed = results.filter(r => r.status === "rejected").length;

    // ✅ UI sin re-GET extra
    for (const c of circuits) {
      const id = String(c.id);
      const view = predicted.get(id) || c;

      updateChartAndBadges(view);

      if (isActiveValue(view.active)) {
        pushHistory(view);
      }
      renderMiniTable(id);
    }

    lastTickEl.textContent = timeHHMMSS();

    if (failed) showStatus(`Aviso: ${failed} actualización(es) fallaron (límite de MockAPI).`, "warning");
    else hideStatus();

  } catch (e) {
    console.error("MONITOR ERROR =>", e);
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