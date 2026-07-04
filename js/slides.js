/**
 * slides.js — the PowerPoint-like tab. Layout templates + theme palettes
 * instead of free-form drag/drop, which keeps this "light" while still
 * looking art-directed. Present mode and PDF/PPTX export reuse the same
 * slide-render function used for editing.
 */
import { exportSlidesPPTX, exportSlidesPDF } from "./export.js";

const LAYOUT_ROLES = {
  title: ["title", "subtitle"],
  "title-content": ["title", "body"],
  "two-content": ["title", "body", "body2"],
  section: ["title"],
  blank: ["body"],
};
const LAYOUT_LABELS = {
  title: "Title",
  "title-content": "Title + content",
  "two-content": "Two content",
  section: "Section",
  blank: "Blank",
};
const PLACEHOLDER = {
  title: "Click to add title",
  subtitle: "Click to add subtitle",
  body: "Click to add text",
  body2: "Click to add text",
};

export const THEMES = {
  aurora: { bg: "linear-gradient(135deg,#1E2A78,#4F46E5 60%,#7C6CFF)", text: "#FFFFFF", muted: "rgba(255,255,255,.78)" },
  sunset: { bg: "linear-gradient(135deg,#3A1220,#B83A2A 55%,#F2542D)", text: "#FFF6F1", muted: "rgba(255,246,241,.8)" },
  ocean: { bg: "linear-gradient(135deg,#0B3B36,#0E8F6F 60%,#34C9A3)", text: "#EAFFF9", muted: "rgba(234,255,249,.8)" },
  midnight: { bg: "linear-gradient(135deg,#0B0D13,#14171F 55%,#262B38)", text: "#F3F4F8", muted: "rgba(243,244,248,.75)" },
  paper: { bg: "#FCFCFD", text: "#14171F", muted: "#585F70" },
};

function uid() { return "e_" + Math.random().toString(36).slice(2, 9); }

export function mount(container, file, ctx) {
  const content = file.content;
  let current = 0;
  let saveTimer = null;

  container.innerHTML = `
    <div class="h-full flex flex-col bg-paper">
      <div class="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-mist/70 bg-white/70 backdrop-blur">
        <button data-back class="icon-btn" title="Back to Home">
          <svg class="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 6 10l6 6"/></svg>
        </button>
        <input data-title class="doc-title-input" value="${escapeAttr(file.title)}" spellcheck="false" />
        <span data-status class="save-pill save-pill-ember">Saved</span>
        <div class="flex-1"></div>
        <button data-present class="btn-ember">▶ Present</button>
        <div class="relative">
          <button data-export-toggle class="btn-ember-outline">Export ▾</button>
          <div data-export-menu class="export-menu hidden">
            <button data-export="pptx">PowerPoint (.pptx)</button>
            <button data-export="pdf">PDF</button>
          </div>
        </div>
      </div>

      <div class="slide-toolbar">
        <span class="tool-label">Layout</span>
        <select data-layout class="doc-select">
          ${Object.entries(LAYOUT_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
        </select>
        <span class="tool-divider"></span>
        <span class="tool-label">Theme</span>
        <div class="flex gap-1.5" data-theme-swatches>
          ${Object.keys(THEMES).map((k) => `<button data-theme="${k}" class="theme-swatch" style="background:${THEMES[k].bg}" title="${k}"></button>`).join("")}
        </div>
      </div>

      <div class="flex-1 flex min-h-0">
        <div class="slide-rail" data-rail></div>
        <div class="flex-1 flex flex-col items-center justify-center p-6 overflow-auto slide-stage-wrap">
          <div class="slide-actions">
            <button data-add class="btn-ghost-sm">+ Slide</button>
            <button data-dup class="btn-ghost-sm">Duplicate</button>
            <button data-del class="btn-ghost-sm text-red-600">Delete</button>
          </div>
          <div class="slide-stage" data-stage></div>
        </div>
      </div>
    </div>

    <div class="present-overlay hidden" data-present-overlay>
      <button class="present-exit" data-present-exit>✕</button>
      <div class="present-slide" data-present-slide></div>
      <div class="present-counter" data-present-counter></div>
    </div>
  `;

  const rail = container.querySelector("[data-rail]");
  const stage = container.querySelector("[data-stage]");
  const layoutSelect = container.querySelector("[data-layout]");
  const titleInput = container.querySelector("[data-title]");
  const statusEl = container.querySelector("[data-status]");
  const exportToggle = container.querySelector("[data-export-toggle]");
  const exportMenu = container.querySelector("[data-export-menu]");
  const presentOverlay = container.querySelector("[data-present-overlay]");
  const presentSlide = container.querySelector("[data-present-slide]");
  const presentCounter = container.querySelector("[data-present-counter]");

  function ensureElements(slide) {
    const roles = LAYOUT_ROLES[slide.layout] || LAYOUT_ROLES.blank;
    roles.forEach((role) => {
      if (!slide.elements.find((e) => e.role === role)) {
        slide.elements.push({ id: uid(), role, content: "" });
      }
    });
  }
  content.slides.forEach(ensureElements);

  function getEl(slide, role) {
    return slide.elements.find((e) => e.role === role) || { content: "" };
  }

  function slideBodyHTML(slide, { editable }) {
    const theme = THEMES[content.theme] || THEMES.aurora;
    const editAttr = editable ? 'contenteditable="true"' : "";
    const t = getEl(slide, "title"), sub = getEl(slide, "subtitle"), body = getEl(slide, "body"), body2 = getEl(slide, "body2");

    const styleVars = `color:${theme.text};`;
    if (slide.layout === "title") {
      return `<div class="slide-inner slide-layout-title" style="${styleVars}">
        <div class="slide-el slide-el-title" data-role="title" data-placeholder="${PLACEHOLDER.title}" ${editAttr}>${t.content}</div>
        <div class="slide-el slide-el-subtitle" data-role="subtitle" data-placeholder="${PLACEHOLDER.subtitle}" style="color:${theme.muted}" ${editAttr}>${sub.content}</div>
      </div>`;
    }
    if (slide.layout === "section") {
      return `<div class="slide-inner slide-layout-section" style="${styleVars}">
        <div class="slide-el slide-el-section-title" data-role="title" data-placeholder="${PLACEHOLDER.title}" ${editAttr}>${t.content}</div>
      </div>`;
    }
    if (slide.layout === "two-content") {
      return `<div class="slide-inner slide-layout-two-content" style="${styleVars}">
        <div class="slide-el slide-el-heading" data-role="title" data-placeholder="${PLACEHOLDER.title}" ${editAttr}>${t.content}</div>
        <div class="slide-two-cols">
          <div class="slide-el slide-el-body" data-role="body" data-placeholder="${PLACEHOLDER.body}" style="color:${theme.muted}" ${editAttr}>${body.content}</div>
          <div class="slide-el slide-el-body" data-role="body2" data-placeholder="${PLACEHOLDER.body2}" style="color:${theme.muted}" ${editAttr}>${body2.content}</div>
        </div>
      </div>`;
    }
    if (slide.layout === "blank") {
      return `<div class="slide-inner slide-layout-blank" style="${styleVars}">
        <div class="slide-el slide-el-body-lg" data-role="body" data-placeholder="${PLACEHOLDER.body}" style="color:${theme.text}" ${editAttr}>${body.content}</div>
      </div>`;
    }
    // title-content (default)
    return `<div class="slide-inner slide-layout-title-content" style="${styleVars}">
      <div class="slide-el slide-el-heading" data-role="title" data-placeholder="${PLACEHOLDER.title}" ${editAttr}>${t.content}</div>
      <div class="slide-el slide-el-body" data-role="body" data-placeholder="${PLACEHOLDER.body}" style="color:${theme.muted}" ${editAttr}>${body.content}</div>
    </div>`;
  }
  function slideBg() {
    const theme = THEMES[content.theme] || THEMES.aurora;
    return theme.bg;
  }

  function renderRail() {
    rail.innerHTML = content.slides
      .map((s, i) => `
        <div class="rail-item ${i === current ? "is-active" : ""}" data-rail-index="${i}">
          <div class="rail-sprockets"></div>
          <div class="rail-thumb" style="background:${slideBg()}">
            <span style="color:${THEMES[content.theme].text}">${i + 1}</span>
          </div>
          <div class="rail-sprockets"></div>
        </div>`)
      .join("");
    rail.querySelectorAll("[data-rail-index]").forEach((el) => {
      el.addEventListener("click", () => { saveCurrentSlideEdits(); current = parseInt(el.dataset.railIndex, 10); renderStage(); renderRail(); });
    });
  }

  function renderStage() {
    const slide = content.slides[current];
    layoutSelect.value = slide.layout;
    stage.style.background = slideBg();
    stage.innerHTML = slideBodyHTML(slide, { editable: true });
    stage.querySelectorAll("[data-role]").forEach((el) => {
      el.addEventListener("input", () => {
        const roleEl = getEl(slide, el.dataset.role);
        roleEl.content = el.innerHTML;
        if (!slide.elements.includes(roleEl)) slide.elements.push(roleEl);
        markDirty();
      });
    });
  }

  function saveCurrentSlideEdits() {
    // content already mutated live via input listeners; nothing extra needed.
  }

  function markDirty() {
    statusEl.textContent = "Saving…";
    statusEl.classList.add("save-pill-busy");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await ctx.Files.update(file.id, { content });
      statusEl.textContent = "Saved";
      statusEl.classList.remove("save-pill-busy");
      ctx.onFileChanged?.();
    }, 500);
  }

  layoutSelect.addEventListener("change", () => {
    content.slides[current].layout = layoutSelect.value;
    ensureElements(content.slides[current]);
    renderStage();
    markDirty();
  });

  container.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      content.theme = btn.dataset.theme;
      renderStage();
      renderRail();
      markDirty();
    });
  });

  container.querySelector("[data-add]").addEventListener("click", () => {
    const fresh = { id: uid(), layout: "title-content", elements: [] };
    ensureElements(fresh);
    content.slides.splice(current + 1, 0, fresh);
    current += 1;
    renderStage(); renderRail(); markDirty();
  });
  container.querySelector("[data-dup]").addEventListener("click", () => {
    const copy = JSON.parse(JSON.stringify(content.slides[current]));
    copy.id = uid();
    copy.elements.forEach((e) => (e.id = uid()));
    content.slides.splice(current + 1, 0, copy);
    current += 1;
    renderStage(); renderRail(); markDirty();
  });
  container.querySelector("[data-del]").addEventListener("click", () => {
    if (content.slides.length <= 1) { ctx.showToast("A deck needs at least one slide", true); return; }
    content.slides.splice(current, 1);
    current = Math.max(0, current - 1);
    renderStage(); renderRail(); markDirty();
  });

  titleInput.addEventListener("input", () => {
    clearTimeout(titleInput._t);
    titleInput._t = setTimeout(async () => {
      await ctx.Files.update(file.id, { title: titleInput.value || "Untitled presentation" });
      ctx.onFileChanged?.();
    }, 400);
  });

  exportToggle.addEventListener("click", (e) => { e.stopPropagation(); exportMenu.classList.toggle("hidden"); });
  document.addEventListener("click", closeMenu);
  function closeMenu() { exportMenu.classList.add("hidden"); }

  exportMenu.querySelectorAll("[data-export]").forEach((b) => {
    b.addEventListener("click", async () => {
      exportMenu.classList.add("hidden");
      const title = titleInput.value;
      ctx.showToast("Preparing your export…");
      try {
        if (b.dataset.export === "pptx") {
          await exportSlidesPPTX({ title, slides: content.slides, theme: content.theme });
        } else {
          const offscreen = buildOffscreenSlides();
          await exportSlidesPDF({ title, slideEls: offscreen.els });
          offscreen.cleanup();
        }
        ctx.showToast("Exported " + title);
      } catch {
        ctx.showToast("Export failed — check your connection", true);
      }
    });
  });

  function buildOffscreenSlides() {
    const holder = document.createElement("div");
    holder.style.position = "fixed";
    holder.style.left = "-99999px";
    holder.style.top = "0";
    document.body.appendChild(holder);
    const els = content.slides.map((s) => {
      const el = document.createElement("div");
      el.style.width = "960px";
      el.style.height = "540px";
      el.style.background = slideBg();
      el.innerHTML = slideBodyHTML(s, { editable: false });
      holder.appendChild(el);
      return el;
    });
    return { els, cleanup: () => holder.remove() };
  }

  // Present mode
  let presentIndex = 0;
  function openPresent() {
    presentIndex = current;
    renderPresent();
    presentOverlay.classList.remove("hidden");
    presentOverlay.requestFullscreen?.().catch(() => {});
  }
  function renderPresent() {
    const slide = content.slides[presentIndex];
    presentSlide.style.background = slideBg();
    presentSlide.innerHTML = slideBodyHTML(slide, { editable: false });
    presentCounter.textContent = `${presentIndex + 1} / ${content.slides.length}`;
  }
  function closePresent() {
    presentOverlay.classList.add("hidden");
    if (document.fullscreenElement) document.exitFullscreen?.();
  }
  container.querySelector("[data-present]").addEventListener("click", openPresent);
  container.querySelector("[data-present-exit]").addEventListener("click", closePresent);
  presentOverlay.addEventListener("click", (e) => {
    if (e.target === presentOverlay) closePresent();
  });
  function presentKeyHandler(e) {
    if (presentOverlay.classList.contains("hidden")) return;
    if (e.key === "ArrowRight" || e.key === " ") { presentIndex = Math.min(presentIndex + 1, content.slides.length - 1); renderPresent(); }
    if (e.key === "ArrowLeft") { presentIndex = Math.max(presentIndex - 1, 0); renderPresent(); }
    if (e.key === "Escape") closePresent();
  }
  document.addEventListener("keydown", presentKeyHandler);

  container.querySelector("[data-back]").addEventListener("click", () => ctx.onBack());
  if (file.title === "Untitled presentation") titleInput.select();

  renderRail();
  renderStage();

  return {
    destroy() {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", presentKeyHandler);
      clearTimeout(saveTimer);
    },
  };
}

function escapeAttr(s) { return String(s || "").replace(/"/g, "&quot;"); }
