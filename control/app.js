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

// ===== Reglas de simulación =====
const REFRESH_SECONDS = 2;

// Voltaje típico doméstico (MX): 110–127V
const V_MIN = 110;
const V_MAX = 127;

// Rangos de corriente por carga (A)
const I_RANGES = {
  baja:  [0.2, 2.0],
  media: [2.0, 8.0],
  alta:  [8.0, 15.0],
};

// Si el voltaje cae fuera de esto: sensor raro
const SENSOR_MIN = 80;
const SENSOR_MAX = 140;

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

function nowISO() {
  return new Date().toISOString();
}

function safeNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function rand(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return +val.toFixed(decimals);
}

// Voltaje realista: si no viene, lo generamos en rango
function getVoltageRealistic(prevV) {
  const v = safeNumber(prevV, NaN);
  if (Number.isFinite(v) && v >= V_MIN && v <= V_MAX) return +v.toFixed(1);
  return rand(V_MIN, V_MAX, 1);
}

// Corriente según carga
function getCurrentByLoad(load) {
  const [minI, maxI] = I_RANGES[load] || I_RANGES.media;
  return rand(minI, maxI, 2);
}

function computePower(voltaje, corriente) {
  return +(voltaje * corriente).toFixed(2);
}

function computeStatusByLimit(potencia, limit) {
  const lim = safeNumber(limit, 0);
  if (lim <= 0) return "normal"; // si no hay límite definido, no marcamos alerta
  return potencia > lim ? "alerta" : "normal";
}

function isSensorOk(voltaje) {
  return voltaje >= SENSOR_MIN && voltaje <= SENSOR_MAX;
}

// Wh acumulada por tiempo (Δt en segundos)
function accumulateEnergyWh(energiaPrev, potenciaW, deltaSeconds) {
  const ePrev = safeNumber(energiaPrev, 0);
  const addWh = potenciaW * (deltaSeconds / 3600);
  return +(ePrev + addWh).toFixed(4);
}

// ===== UI =====
function cardHtml(item) {
  const id = item.id;
  const name = item.name || "—";
  const load = normalizeLoad(item.load);
  const limit = safeNumber(item.limit, 0);
  const active = !!item.active;

  const voltaje = safeNumber(item.voltaje, 0);
  const corriente = safeNumber(item.corriente, 0);
  const potencia = safeNumber(item.potencia, 0);
  const energia = safeNumber(item.energia, 0);
  const estado = (item.estado || "normal").toLowerCase();

  let estadoBadge = `<span class="badge text-bg-success">NORMAL</span>`;
  if (estado === "alerta") estadoBadge = `<span class="badge text-bg-danger">ALERTA</span>`;
  if (estado === "falla_sensor") estadoBadge = `<span class="badge text-bg-danger">FALLA</span>`;

  return `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="card glass border-0 shadow-sm h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div class="text-secondary small">ID: ${id}</div>
              <h5 class="mb-1">${name}</h5>
              <div class="d-flex gap-2 align-items-center">
                ${estadoBadge}
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

          <div class="row g-2">
            <div class="col-6">
              <div class="small text-secondary">Límite (W)</div>
              <div class="fw-semibold">${limit}</div>
            </div>
            <div class="col-6">
              <div class="small text-secondary">Voltaje (V)</div>
              <div class="fw-semibold">${voltaje}</div>
            </div>

            <div class="col-6">
              <div class="small text-secondary">Corriente (A)</div>
              <div class="fw-semibold">${corriente}</div>
            </div>
            <div class="col-6">
              <div class="small text-secondary">Potencia (W)</div>
              <div class="fw-semibold">${potencia}</div>
            </div>

            <div class="col-12">
              <div class="small text-secondary">Energía (Wh)</div>
              <div class="fw-semibold">${energia}</div>
            </div>
          </div>

          <div class="mt-3 d-flex gap-2 flex-wrap">
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
          </div>

          <div class="small text-secondary mt-3">
            Update: ${item.update ? new Date(item.update).toLocaleString() : "—"}
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
          <i class="bi bi-inbox"></i> No hay circuitos. Crea 3 en la app de administración.
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

    // Si se apaga: corriente/potencia a 0 (energía se conserva)
    await apiUpdate(id, {
      active: !!checked,
      update: nowISO(),
      ...(checked ? {} : { corriente: 0, potencia: 0, estado: "normal" }),
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

    await apiUpdate(id, {
      load: normalizeLoad(value),
      update: nowISO(),
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
    const limit = safeNumber(item.limit, 0);

    // 1) Voltaje realista
    const voltaje = getVoltageRealistic(item.voltaje);

    // 2) Validación sensor
    if (!isSensorOk(voltaje)) {
      await apiUpdate(id, {
        voltaje,
        corriente: 0,
        potencia: 0,
        estado: "falla_sensor",
        update: nowISO(),
      });
      notify("Sensor", "Voltaje fuera de rango. Marcado como FALLA.");
      await apiGetAll();
      hideStatus();
      return;
    }

    // 3) Corriente por carga
    const corriente = getCurrentByLoad(load);

    // 4) Potencia calculada
    const potencia = computePower(voltaje, corriente);

    // 5) Estado por límite
    const estado = computeStatusByLimit(potencia, limit);

    // 6) Energía acumulada por tiempo (2s)
    const energia = accumulateEnergyWh(item.energia, potencia, REFRESH_SECONDS);

    await apiUpdate(id, {
      voltaje,
      corriente,
      potencia,
      energia,
      estado,
      update: nowISO(),
    });

    notify("Lectura", `Potencia: ${potencia}W | Estado: ${estado.toUpperCase()}`);
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
});

btnReload.addEventListener("click", apiGetAll);

// Init
endpointLabel.textContent = API_BASE;
apiGetAll();