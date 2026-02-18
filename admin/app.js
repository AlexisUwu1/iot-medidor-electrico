// ====== Config ======
const API_BASE = "https://698a177bc04d974bc6a1535b.mockapi.io/api/v1/Circuito";

// ====== DOM ======
const tbody = document.getElementById("tbody");
const statusBar = document.getElementById("statusBar");
const countBadge = document.getElementById("countBadge");
const endpointLabel = document.getElementById("endpointLabel");

const btnNew = document.getElementById("btnNew");
const btnReload = document.getElementById("btnReload");

const searchInput = document.getElementById("searchInput");
const btnClearSearch = document.getElementById("btnClearSearch");
const filterLoad = document.getElementById("filterLoad");

// Modal/Form
const deviceModalEl = document.getElementById("deviceModal");
const deviceModal = new bootstrap.Modal(deviceModalEl);
const modalTitle = document.getElementById("modalTitle");

const deviceForm = document.getElementById("deviceForm");
const idInput = document.getElementById("id");
const nameInput = document.getElementById("name");
const limitInput = document.getElementById("limit");
const activeCheck = document.getElementById("active");
const loadSelect = document.getElementById("load");
const updateInput = document.getElementById("update");

// Toast
const toastEl = document.getElementById("appToast");
const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
const toastTitle = document.getElementById("toastTitle");
const toastBody = document.getElementById("toastBody");
const toastTime = document.getElementById("toastTime");

// ====== State ======
let allItems = [];
let isSaving = false;

// ====== Helpers ======
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
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function toLocalDatetimeValue(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function normalizeLoad(value) {
  const v = String(value || "").toLowerCase().trim();
  if (["baja", "media", "alta"].includes(v)) return v;
  return "media";
}

function getFilteredItems() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const load = filterLoad.value;

  return allItems.filter(item => {
    const okLoad = load ? normalizeLoad(item.load) === load : true;
    const okQ = q
      ? (
          String(item.id).toLowerCase().includes(q) ||
          String(item.name || "").toLowerCase().includes(q) ||
          String(item.load || "").toLowerCase().includes(q)
        )
      : true;
    return okLoad && okQ;
  });
}

function render() {
  const items = getFilteredItems();
  countBadge.textContent = items.length;
  tbody.innerHTML = "";

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-secondary py-4">
          <i class="bi bi-inbox"></i> No hay registros para mostrar.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const limit = item.limit ?? "—";
    const load = normalizeLoad(item.load);
    const active = !!item.active;
    const upd = item.update ? new Date(item.update).toLocaleString() : "—";

    return `
      <tr>
        <td class="text-secondary">${escapeHtml(item.id)}</td>
        <td class="fw-semibold">${escapeHtml(item.name || "—")}</td>
        <td class="text-secondary">${escapeHtml(limit)}</td>
        <td><span class="badge text-bg-secondary">${escapeHtml(load)}</span></td>
        <td>
          <span class="badge ${active ? "text-bg-success" : "text-bg-danger"}">
            ${active ? "Activo" : "Inactivo"}
          </span>
        </td>
        <td class="text-secondary">${escapeHtml(upd)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-light me-2" data-action="edit" data-id="${escapeHtml(item.id)}">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${escapeHtml(item.id)}">
            <i class="bi bi-trash3"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

// ====== API Calls ======
async function apiGetAll() {
  showStatus("Cargando circuitos…", "info");
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error(`Error GET: ${res.status}`);
    const data = await res.json();
    allItems = Array.isArray(data) ? data : [];
    hideStatus();
    render();
    notify("Listo", "Circuitos cargados.");
  } catch (err) {
    console.error(err);
    showStatus("No se pudieron cargar los datos. Revisa endpoint o conexión.", "danger");
  }
}
async function apiCreate(payload) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Error POST: ${res.status}`);
  return res.json();
}
async function apiUpdate(id, payload) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Error PUT: ${res.status}`);
  return res.json();
}
async function apiDelete(id) {
  const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Error DELETE: ${res.status}`);
  return res.json();
}

// ====== Modal logic ======
function openCreateModal() {
  modalTitle.textContent = "Nuevo circuito";
  idInput.value = "";

  nameInput.value = "";
  limitInput.value = 800;
  loadSelect.value = "media";
  activeCheck.checked = true;
  updateInput.value = toLocalDatetimeValue(new Date());

  deviceModal.show();
}
function openEditModal(item) {
  modalTitle.textContent = `Editar circuito #${item.id}`;
  idInput.value = item.id;

  nameInput.value = item.name ?? "";
  limitInput.value = item.limit ?? 800;
  loadSelect.value = normalizeLoad(item.load);
  activeCheck.checked = !!item.active;
  updateInput.value = toLocalDatetimeValue(item.update ?? new Date());

  deviceModal.show();
}

function getFormPayload() {
  // Solo admin (CRUD). Los campos de medición se usarán en control/monitoreo.
  const name = nameInput.value.trim();
  const limit = Number(limitInput.value);
  const active = !!activeCheck.checked;
  const load = normalizeLoad(loadSelect.value);
  const update = new Date(updateInput.value).toISOString();

  return { name, limit, active, load, update };
}
function validateForm(payload) {
  if (!payload.name) return "El nombre del circuito es obligatorio.";
  if (!Number.isFinite(payload.limit) || payload.limit <= 0) return "El límite debe ser un número mayor a 0.";
  if (!["baja", "media", "alta"].includes(payload.load)) return "Selecciona una carga válida.";
  if (!payload.update) return "La fecha/hora es obligatoria.";
  return null;
}

// ====== Events ======
btnNew.addEventListener("click", openCreateModal);
btnReload.addEventListener("click", apiGetAll);

btnClearSearch.addEventListener("click", () => {
  searchInput.value = "";
  render();
});
searchInput.addEventListener("input", render);
filterLoad.addEventListener("change", render);

deviceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isSaving) return;

  const payload = getFormPayload();
  const error = validateForm(payload);
  if (error) {
    notify("Validación", error);
    return;
  }

  try {
    isSaving = true;
    const id = idInput.value.trim();
    showStatus("Guardando…", "info");

    if (!id) {
      await apiCreate(payload);
      notify("Creado", "Circuito creado.");
    } else {
      await apiUpdate(id, payload);
      notify("Actualizado", "Circuito actualizado.");
    }

    deviceModal.hide();
    await apiGetAll();
    hideStatus();
  } catch (err) {
    console.error(err);
    showStatus("No se pudo guardar. Revisa consola/endpoint.", "danger");
    notify("Error", "No se pudo guardar el registro.");
  } finally {
    isSaving = false;
  }
});

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  const item = allItems.find(x => String(x.id) === String(id));
  if (!item) return;

  if (action === "edit") openEditModal(item);

  if (action === "delete") {
    const ok = confirm(`¿Seguro que quieres eliminar el circuito #${id}?`);
    if (!ok) return;

    try {
      showStatus("Eliminando…", "info");
      await apiDelete(id);
      notify("Eliminado", "Circuito eliminado.");
      await apiGetAll();
      hideStatus();
    } catch (err) {
      console.error(err);
      showStatus("No se pudo eliminar. Revisa consola/endpoint.", "danger");
      notify("Error", "No se pudo eliminar el registro.");
    }
  }
});

// ====== Init ======
endpointLabel.textContent = API_BASE;
apiGetAll();