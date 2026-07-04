/**
 * app.js — entry point. Renders the dashboard, opens files into the right
 * editor module, and owns the small cross-cutting bits: toasts, autosave
 * status plumbing, PWA install prompt, and service worker registration.
 */
import { Files, storageEstimate } from "./db.js";
import * as Docs from "./docs.js";
import * as Sheets from "./sheets.js";
import * as Slides from "./slides.js";

const root = document.getElementById("app");
let activeModule = null;
let deferredInstallPrompt = null;

const TYPE_META = {
  doc: { label: "Document", accent: "cobalt", verb: "Docs" },
  sheet: { label: "Spreadsheet", accent: "ledger", verb: "Sheets" },
  slide: { label: "Presentation", accent: "ember", verb: "Slides" },
};

function showToast(message, isError = false) {
  const host = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " toast-error" : "");
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast-in"));
  setTimeout(() => {
    el.classList.remove("toast-in");
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

function relTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function iconFor(type) {
  if (type === "doc")
    return '<path d="M6 3.5h6.5L17 8v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M12.5 3.5V8H17" stroke-linejoin="round"/><path d="M8 12.5h8M8 15.5h8M8 18.5h5"/>';
  if (type === "sheet")
    return '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><path d="M4.5 9.8h15M4.5 14.8h15M9.8 4.5v15M14.8 4.5v15"/>';
  return '<rect x="3.5" y="5.5" width="17" height="11" rx="1.3"/><path d="M8 20h8M12 16.5V20" stroke-linejoin="round"/>';
}

async function renderDashboard() {
  activeModule?.destroy?.();
  activeModule = null;

  const [docs, sheets, slidesF] = await Promise.all([Files.list("doc"), Files.list("sheet"), Files.list("slide")]);
  const all = [...docs, ...sheets, ...slidesF].sort((a, b) => b.updatedAt - a.updatedAt);
  const usage = await storageEstimate();

  root.innerHTML = `
    <div class="min-h-full flex flex-col">
      <header class="app-header">
        <div class="flex items-center gap-3">
          <div class="wordmark-mark"></div>
          <div>
            <h1 class="wordmark">Folio</h1>
            <p class="wordmark-tag">Docs · Sheets · Slides, together</p>
          </div>
        </div>
        <div class="flex-1 max-w-md mx-4">
          <input data-search type="search" placeholder="Search your files" class="search-input" />
        </div>
        <button data-install class="btn-cobalt-outline hidden">Install app</button>
      </header>

      <main class="flex-1 px-4 sm:px-8 py-8 max-w-6xl w-full mx-auto">
        <section class="mb-10">
          <h2 class="section-title">Start something new</h2>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <button data-create="doc" class="create-tile create-tile-doc">
              <span class="create-tile-icon">${svgIcon(iconFor("doc"))}</span>
              <span class="create-tile-label">New Document</span>
              <span class="create-tile-sub">Write &amp; format, export to Word or PDF</span>
            </button>
            <button data-create="sheet" class="create-tile create-tile-sheet">
              <span class="create-tile-icon">${svgIcon(iconFor("sheet"))}</span>
              <span class="create-tile-label">New Spreadsheet</span>
              <span class="create-tile-sub">Formulas built in, export to Excel</span>
            </button>
            <button data-create="slide" class="create-tile create-tile-slide">
              <span class="create-tile-icon">${svgIcon(iconFor("slide"))}</span>
              <span class="create-tile-label">New Presentation</span>
              <span class="create-tile-sub">Themed layouts, present or export</span>
            </button>
          </div>
        </section>

        <section>
          <div class="flex items-center justify-between">
            <h2 class="section-title">Recent files</h2>
            <span class="text-xs text-slate-400" data-storage-line>${all.length} file${all.length === 1 ? "" : "s"} stored on this device${usage ? " · " + prettyBytes(usage) : ""}</span>
          </div>
          <div class="mt-4" data-file-grid>
            ${all.length ? "" : emptyState()}
          </div>
        </section>
      </main>

      <footer class="app-footer">
        Everything is saved privately on this device. No account, no upload — the Docs/Sheets/Slides you make here never leave your browser unless you export them.
      </footer>
    </div>
  `;

  const fileGrid = root.querySelector("[data-file-grid]");
  if (all.length) renderFileGrid(fileGrid, all);

  root.querySelector("[data-search]").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = q ? all.filter((f) => f.title.toLowerCase().includes(q)) : all;
    fileGrid.innerHTML = filtered.length ? "" : (q ? '<p class="empty-note">No files match your search.</p>' : emptyState());
    if (filtered.length) renderFileGrid(fileGrid, filtered);
  });

  root.querySelectorAll("[data-create]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const rec = await Files.create(btn.dataset.create);
      openFile(rec);
    });
  });

  if (deferredInstallPrompt) root.querySelector("[data-install]").classList.remove("hidden");
  root.querySelector("[data-install]")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });
}

function renderFileGrid(gridEl, files) {
  gridEl.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3";
  gridEl.innerHTML = files
    .map((f) => {
      const meta = TYPE_META[f.type];
      return `
      <div class="file-card file-card-${meta.accent}" data-file-id="${f.id}">
        <div class="file-card-top">
          <span class="file-card-icon">${svgIcon(iconFor(f.type))}</span>
          <div class="file-card-menu">
            <button data-action="rename" title="Rename">✎</button>
            <button data-action="duplicate" title="Duplicate">⧉</button>
            <button data-action="delete" title="Delete">🗑</button>
          </div>
        </div>
        <div class="file-card-title">${escapeHtml(f.title)}</div>
        <div class="file-card-meta">${meta.label} · ${relTime(f.updatedAt)}</div>
      </div>`;
    })
    .join("");

  gridEl.querySelectorAll(".file-card").forEach((card) => {
    const id = card.dataset.fileId;
    card.addEventListener("click", async () => openFile(await Files.get(id)));
    card.querySelector('[data-action="rename"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      const rec = await Files.get(id);
      const next = prompt("Rename file", rec.title);
      if (next && next.trim()) {
        await Files.update(id, { title: next.trim() });
        renderDashboard();
      }
    });
    card.querySelector('[data-action="duplicate"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      await Files.duplicate(id);
      showToast("Duplicated");
      renderDashboard();
    });
    card.querySelector('[data-action="delete"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      const rec = await Files.get(id);
      if (confirm(`Delete "${rec.title}"? This can't be undone.`)) {
        await Files.remove(id);
        showToast("Deleted");
        renderDashboard();
      }
    });
  });
}

function emptyState() {
  return `<div class="empty-note">Nothing here yet — create your first document, spreadsheet, or slide deck above.</div>`;
}

async function openFile(rec) {
  if (!rec) return;
  activeModule?.destroy?.();
  root.innerHTML = `<div id="editor-host" class="h-full"></div>`;
  const host = document.getElementById("editor-host");
  const mod = rec.type === "doc" ? Docs : rec.type === "sheet" ? Sheets : Slides;
  activeModule = mod.mount(host, rec, {
    Files,
    onBack: renderDashboard,
    showToast,
    onFileChanged: () => {},
  });
}

function svgIcon(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
}
function prettyBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById("install-fallback")?.remove();
  root.querySelector("[data-install]")?.classList.remove("hidden");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

document.documentElement.style.setProperty("--vh", `${window.innerHeight}px`);
window.addEventListener("resize", () => document.documentElement.style.setProperty("--vh", `${window.innerHeight}px`));

renderDashboard();
