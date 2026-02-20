const API_BASE = "https://698a177bc04d974bc6a1535b.mockapi.io/api/v1/Circuito";

const cards = document.getElementById("cards");
const statusBar = document.getElementById("statusBar");
const endpointLabel = document.getElementById("endpointLabel");
const btnReload = document.getElementById("btnReload");

// Toast
const toastEl = document.getElementById("appToast");
const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
const toastTitle = document.getElementById("toastTitle");
const toastBody = document.getElementById("toastBody");
const toastTime = document.getElementById("toastTime");

let allItems = [];
let isSaving = false;

// ===== Realismo =====
const REFRESH_SECONDS = 2;

// MX: 115–125V (normal)
const V_MIN = 115;
const V_MAX = 125;

// Corriente por carga (A)
const I_RANGES = {
  baja: [0.4, 2.0],
  media: [2.0, 7.0],
  alta: [7.0, 12.0],
};

// Factor de potencia realista
const PF_MIN = 0.85;
const PF_MAX = 0.99;

// Frecuencia MX
const FREQ = 60;

// Límites sugeridos si vienen mal
const DEFAULT_LIMIT_BY_LOAD = {
  baja: 300,
  media: 900,
  alta: 1800,
};

// Prealerta a 80%
const DEFAULT_WARN = 0.8;

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
function rand(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return +val.toFixed(decimals);
}

function getVoltage() {
  return rand(V_MIN, V_MAX, 1);
}
function getPF() {
  return rand(PF_MIN, PF_MAX, 2);
}
function getCurrentByLoad(load) {
  const [a, b] = I_RANGES[load] || I_RANGES.media;
  return rand(a, b, 2);
}
function computePowerW(v, i, pf) {
  // Potencia real aproximada: V * I * PF
  return +(v * i * pf).toFixed(2);
}
function accumulateEnergyWh(prevWh, pW, deltaSeconds) {
  const ePrev = safeNumber(prevWh, 0);
  const addWh = pW * (deltaSeconds / 3600);
  return +(ePrev + addWh).toFixed(4);
}

function computeEstado(potencia, limit, warn = DEFAULT_WARN, active = true) {
  if (!active) return "apagado";
  const lim = safeNumber(limit, 0);
  if (lim <= 0) return "normal";

  const pct = potencia / lim;
  if (pct >= 1) return "alerta";
  if (pct >= warn) return "prealerta";
  return "normal";
}

// ===== UI =====
function badgeEstado(estado) {
  const e = String(estado || "normal").toLowerCase();
  if (e === "alerta") return `<span class="badge text-bg-danger">ALERTA</span>`;
  if (e === "prealerta") return `<span class="badge text-bg-warning text-dark">PREALERTA</span>`;
  if (e === "offline") return `<span class="badge text-bg-secondary">OFFLINE</span>`;
  if (e === "apagado") return `<span class="badge text-bg-dark">APAGADO</span>`;
  return `<span class="badge text-bg-success">NORMAL</span>`;
}

function cardHtml(item) {
  const id = item.id;
  const name = item.name || "—";
  const load = normalizeLoad(item.load);
  const active = !!item.active;

  // si limit viene raro, usamos default por carga
  const limit = safeNumber(item.limit, DEFAULT_LIMIT_BY_LOAD[load]);

  const voltaje = safeNumber(item.voltaje, 0);
  const corriente = safeNumber(item.corriente, 0);
  const pf = safeNumber(item.pf, 0);
  const potencia = safeNumber(item.potencia, 0);
  const energia = safeNumber(item.energia, 0);

  const estado = String(item.estado || "normal").toLowerCase();
  const warn = safeNumber(item.thresholdWarn, DEFAULT_WARN);

  return `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="card glass border-0 shadow-sm h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-3">
            <div>
              <div class="text-secondary small">ID: ${id}</div>
              <h5 class="mb-1 text-light">${name}</h5>
              <div class="d-flex gap-2 align-items-center flex-wrap">
                ${badgeEstado(estado)}
                <span class="badge text-bg-secondary">${load}</span>
              </div>
            </div>

            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" role="switch"
                data-action="toggleActive" data-id="${id}" ${active ? "checked" : ""}>
              <label class="form-check-label small text-secondary">ON/OFF</label>
            </div>
          </div>

          <hr class="border-white border-opacity-10">

          <div class="row g-3">
            <div class="col-6">
              <div class="text-secondary small">Límite (W)</div>
              <div class="fw-semibold text-light">${limit}</div>
              <div class="text-secondary small">Warn: ${(warn * 100).toFixed(0)}%</div>
            </div>

            <div class="col-6">
              <div class="text-secondary small">Voltaje (V)</div>
              <div class="fw-semibold text-light">${voltaje}</div>
              <div class="text-secondary small">Freq: ${safeNumber(item.frecuencia, FREQ)} Hz</div>
            </div>

            <div class="col-6">
              <div class="text-secondary small">Corriente (A)</div>
              <div class="fw-semibold text-light">${corriente}</div>
            </div>

            <div class="col-6">
              <div class="text-secondary small">Potencia (W)</div>
              <div class="fw-semibold text-light">${potencia}</div>
              <div class="text-secondary small">PF: ${pf ? pf : "—"}</div>
            </div>

            <div class="col-12">
              <div class="text-secondary small">Energía (Wh)</div>
              <div class="fw-semibold text-light">${energia}</div>
            </div>
          </div>

          <div class="mt-3 d-flex gap-2 flex-wrap align-items-center">
            <select class="form-select form-select-sm w-auto"
              data-action="changeLoad" data-id="${id}">
              <option value="baja" ${load === "baja" ? "selected" : ""}>baja</option>
              <option value="media" ${load === "media" ? "selected" : ""}>media</option>
              <option value="alta" ${load === "alta" ? "selected" : ""}>alta</option>
            </select>

            <button class="btn btn-outline-light btn-sm"
              data-action="forceReading" data-id="${id}">
              <i class="bi bi-lightning-charge"></i> Forzar lectura
            </button>

            <button class="btn btn-outline-warning btn-sm"
              data-action="fixLimit" data-id="${id}">
              <i class="bi bi-wrench-adjustable"></i> Arreglar límite
            </button>
          </div>

          <div class="text-secondary small mt-3">
            Update: ${item.update ? new Date(item.update).toLocaleString() : "—"} ·
            lastSeen: ${item.lastSeen ? new Date(item.lastSeen).toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>
    </div>
  `;
}

function render() {
  if (!allItems.length) {
    cards.innerHTML = `
      <div class="col-12">
        <div class="text-center text-secondary py-5">
          <i class="bi bi-inbox"></i> No hay circuitos.
        </div>
      </div>
    `;
    return;
  }
  cards.innerHTML = allItems.map(cardHtml).join("");
}

// ===== API =====
async function apiGetAll() {
  showStatus("Cargando circuitos…", "info");
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error(`GET ${res.status}`);
    allItems = await res.json();
    hideStatus();
    render();
  } catch (e) {
    console.error(e);
    showStatus("Error cargando. Revisa el endpoint o conexión.", "danger");
  }
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

// ===== Actions =====
async function toggleActive(id, checked) {
  if (isSaving) return;
  try {
    isSaving = true;
    showStatus("Actualizando…", "info");

    const active = !!checked;

    await apiUpdate(id, {
      active,
      update: nowISO(),
      lastSeen: nowISO(),
      ...(active
        ? { estado: "normal" }
        : { corriente: 0, potencia: 0, estado: "apagado" }),
    });

    notify("Listo", "Estado actualizado.");
    await apiGetAll();
    hideStatus();
  } catch (e) {
    console.error(e);
    showStatus("No se pudo actualizar.", "danger");
    notify("Error", "No se pudo actualizar.");
  } finally {
    isSaving = false;
  }
}

async function changeLoad(id, value) {
  if (isSaving) return;
  try {
    isSaving = true;
    showStatus("Actualizando carga…", "info");

    const load = normalizeLoad(value);

    await apiUpdate(id, {
      load,
      limit: DEFAULT_LIMIT_BY_LOAD[load],
      thresholdWarn: DEFAULT_WARN,
      update: nowISO(),
      lastSeen: nowISO(),
    });

    notify("Listo", "Carga actualizada.");
    await apiGetAll();
    hideStatus();
  } catch (e) {
    console.error(e);
    showStatus("No se pudo cambiar la carga.", "danger");
    notify("Error", "No se pudo cambiar la carga.");
  } finally {
    isSaving = false;
  }
}

async function fixLimit(id) {
  if (isSaving) return;
  const item = allItems.find(x => String(x.id) === String(id));
  if (!item) return;

  try {
    isSaving = true;
    showStatus("Arreglando límite…", "info");

    const load = normalizeLoad(item.load);
    await apiUpdate(id, {
      limit: DEFAULT_LIMIT_BY_LOAD[load],
      thresholdWarn: DEFAULT_WARN,
      update: nowISO(),
      lastSeen: nowISO(),
    });

    notify("OK", "Límite ajustado a un valor realista.");
    await apiGetAll();
    hideStatus();
  } catch (e) {
    console.error(e);
    showStatus("No se pudo ajustar el límite.", "danger");
    notify("Error", "No se pudo ajustar el límite.");
  } finally {
    isSaving = false;
  }
}

async function forceReading(id) {
  if (isSaving) return;
  const item = allItems.find(x => String(x.id) === String(id));
  if (!item) return;

  if (!item.active) {
    notify("Aviso", "El circuito está apagado. Enciéndelo para generar lectura.");
    return;
  }

  try {
    isSaving = true;
    showStatus("Generando lectura…", "info");

    const load = normalizeLoad(item.load);
    const limit = safeNumber(item.limit, DEFAULT_LIMIT_BY_LOAD[load]);
    const warn = safeNumber(item.thresholdWarn, DEFAULT_WARN);

    const voltaje = getVoltage();
    const corriente = getCurrentByLoad(load);
    const pf = getPF();

    const potencia = computePowerW(voltaje, corriente, pf);
    const energia = accumulateEnergyWh(item.energia, potencia, REFRESH_SECONDS);

    const estado = computeEstado(potencia, limit, warn, true);

    await apiUpdate(id, {
      voltaje,
      corriente,
      pf,
      frecuencia: FREQ,
      potencia,
      energia,
      estado,
      limit,
      thresholdWarn: warn,
      update: nowISO(),
      lastSeen: nowISO(),
    });

    notify("Lectura", `P=${potencia}W | ${estado.toUpperCase()}`);
    await apiGetAll();
    hideStatus();
  } catch (e) {
    console.error(e);
    showStatus("No se pudo generar la lectura.", "danger");
    notify("Error", "No se pudo generar la lectura.");
  } finally {
    isSaving = false;
  }
}

// ===== Events delegation =====
cards.addEventListener("change", (e) => {
  const el = e.target;
  const action = el.dataset.action;
  const id = el.dataset.id;
  if (!action || !id) return;

  if (action === "toggleActive") toggleActive(id, el.checked);
  if (action === "changeLoad") changeLoad(id, el.value);
});

cards.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "forceReading") forceReading(id);
  if (action === "fixLimit") fixLimit(id);
});

btnReload.addEventListener("click", apiGetAll);

// Init
endpointLabel.textContent = API_BASE;
apiGetAll();