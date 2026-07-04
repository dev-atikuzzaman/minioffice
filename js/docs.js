/**
 * docs.js — the Word-like tab. A contenteditable "paper" canvas with a
 * formatting toolbar, autosave, live word count, and PDF/Word/Text export.
 */
import { exportDocPDF, exportDocWord, exportDocText } from "./export.js";

const ICONS = {
  bold: '<path d="M6 4h6a3.5 3.5 0 0 1 0 7H6zM6 11h7a3.5 3.5 0 0 1 0 7H6z"/>',
  italic: '<path d="M11 4h6M5 18h6M13 4 9 18"/>',
  underline: '<path d="M6 4v6a5 5 0 0 0 10 0V4M5 20h12"/>',
  strike: '<path d="M5 12h12M8 6.5c.7-1 2-1.5 3.6-1.5 2.4 0 4 1.1 4 2.7 0 1-.5 1.7-1.6 2.3M8 17c.7 1 2 1.6 3.8 1.6 2.4 0 4.2-1.1 4.2-2.9 0-.9-.5-1.6-1.4-2.1"/>',
  ul: '<circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/>',
  ol: '<path d="M9 6h11M9 12h11M9 18h11M4 4.5h1v3M4 7.5h1.6M4.2 13.3c0-.8.7-1.3 1.3-1.3.8 0 1.3.5 1.3 1.1 0 .5-.3.8-.7 1.1l-1.6 1.4h2.3"/>',
  left: '<path d="M4 6h16M4 12h10M4 18h14"/>',
  center: '<path d="M4 6h16M7 12h10M5 18h14"/>',
  right: '<path d="M4 6h16M10 12h10M6 18h14"/>',
  justify: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  link: '<path d="M9 15 15 9M8 12l-2.5 2.5a3 3 0 1 0 4.2 4.2L12 16M12 8l2.3-2.3a3 3 0 1 1 4.2 4.2L16 12"/>',
  clear: '<path d="M4 7h16M9 7 8 4h8l-1 3M6 7l1 13h10l1-13"/>',
  undo: '<path d="M7 8H4V5M4 8a8 8 0 1 1 2 5.3"/>',
  redo: '<path d="M17 8h3V5M20 8a8 8 0 1 0-2 5.3"/>',
};

function icon(name, cls = "w-4 h-4") {
  return `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function btn(cmd, iconName, title, extra = "") {
  return `<button type="button" data-cmd="${cmd}" ${extra} title="${title}"
    class="doc-tool-btn">${icon(iconName)}</button>`;
}

export function mount(container, file, ctx) {
  container.innerHTML = `
    <div class="h-full flex flex-col bg-paper">
      <div class="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-mist/70 bg-white/70 backdrop-blur">
        <button data-back class="icon-btn" title="Back to Home">
          <svg class="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 6 10l6 6"/></svg>
        </button>
        <input data-title class="doc-title-input" value="${escapeAttr(file.title)}" spellcheck="false" />
        <span data-status class="save-pill">Saved</span>
        <div class="flex-1"></div>
        <div class="relative">
          <button data-export-toggle class="btn-cobalt-outline">Export ▾</button>
          <div data-export-menu class="export-menu hidden">
            <button data-export="pdf">PDF document</button>
            <button data-export="word">Word (.docx)</button>
            <button data-export="text">Plain text</button>
          </div>
        </div>
      </div>

      <div class="doc-toolbar">
        <select data-cmd="formatBlock" class="doc-select" title="Style">
          <option value="P">Paragraph</option>
          <option value="H1">Heading 1</option>
          <option value="H2">Heading 2</option>
          <option value="H3">Heading 3</option>
          <option value="BLOCKQUOTE">Quote</option>
        </select>
        <span class="tool-divider"></span>
        ${btn("bold", "bold", "Bold (Ctrl+B)")}
        ${btn("italic", "italic", "Italic (Ctrl+I)")}
        ${btn("underline", "underline", "Underline (Ctrl+U)")}
        ${btn("strikeThrough", "strike", "Strikethrough")}
        <span class="tool-divider"></span>
        <label class="doc-tool-btn cursor-pointer" title="Text color">
          <span class="text-[13px] font-serif italic font-bold">A</span>
          <input data-cmd="foreColor" type="color" class="sr-only" value="#14171f" />
        </label>
        <label class="doc-tool-btn cursor-pointer" title="Highlight">
          <span class="w-3.5 h-3.5 rounded-sm" style="background:#FDE68A"></span>
          <input data-cmd="hiliteColor" type="color" class="sr-only" value="#fde68a" />
        </label>
        <span class="tool-divider"></span>
        ${btn("insertUnorderedList", "ul", "Bulleted list")}
        ${btn("insertOrderedList", "ol", "Numbered list")}
        <span class="tool-divider"></span>
        ${btn("justifyLeft", "left", "Align left")}
        ${btn("justifyCenter", "center", "Align center")}
        ${btn("justifyRight", "right", "Align right")}
        ${btn("justifyFull", "justify", "Justify")}
        <span class="tool-divider"></span>
        ${btn("createLink", "link", "Insert link")}
        ${btn("removeFormat", "clear", "Clear formatting")}
        <span class="tool-divider"></span>
        ${btn("undo", "undo", "Undo (Ctrl+Z)")}
        ${btn("redo", "redo", "Redo (Ctrl+Y)")}
      </div>

      <div class="flex-1 overflow-auto doc-scroll">
        <div class="doc-page-wrap">
          <div data-page class="doc-page" contenteditable="true" spellcheck="true">${file.content.html}</div>
        </div>
      </div>

      <div class="doc-statusbar" data-status-bar></div>
    </div>
  `;

  const page = container.querySelector("[data-page]");
  const titleInput = container.querySelector("[data-title]");
  const statusEl = container.querySelector("[data-status]");
  const statusBar = container.querySelector("[data-status-bar]");
  const exportToggle = container.querySelector("[data-export-toggle]");
  const exportMenu = container.querySelector("[data-export-menu]");

  let saveTimer = null;
  function markDirty() {
    statusEl.textContent = "Saving…";
    statusEl.classList.add("save-pill-busy");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await ctx.Files.update(file.id, { content: { html: page.innerHTML } });
      statusEl.textContent = "Saved";
      statusEl.classList.remove("save-pill-busy");
      ctx.onFileChanged?.();
    }, 500);
  }

  function updateWordCount() {
    const text = page.innerText.trim();
    const words = text ? text.split(/\s+/).length : 0;
    statusBar.textContent = `${words} word${words === 1 ? "" : "s"} · ${text.length} characters`;
  }

  page.addEventListener("input", () => { markDirty(); updateWordCount(); });
  updateWordCount();

  container.querySelectorAll(".doc-tool-btn[data-cmd], .doc-select[data-cmd]").forEach((el) => {
    const cmd = el.dataset.cmd;
    if (el.tagName === "SELECT") {
      el.addEventListener("change", () => {
        page.focus();
        document.execCommand("formatBlock", false, `<${el.value}>`);
        markDirty();
      });
    } else if (el.querySelector('input[type="color"]')) {
      const colorInput = el.querySelector("input");
      colorInput.addEventListener("input", () => {
        page.focus();
        document.execCommand(cmd, false, colorInput.value);
        markDirty();
      });
    } else {
      el.addEventListener("click", () => {
        page.focus();
        if (cmd === "createLink") {
          const url = prompt("Link URL:", "https://");
          if (url) document.execCommand(cmd, false, url);
        } else {
          document.execCommand(cmd, false, null);
        }
        markDirty();
      });
    }
  });

  titleInput.addEventListener("input", () => {
    clearTimeout(titleInput._t);
    titleInput._t = setTimeout(async () => {
      await ctx.Files.update(file.id, { title: titleInput.value || "Untitled document" });
      ctx.onFileChanged?.();
    }, 400);
  });

  exportToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", closeMenu);
  function closeMenu() { exportMenu.classList.add("hidden"); }

  exportMenu.querySelectorAll("[data-export]").forEach((b) => {
    b.addEventListener("click", async () => {
      exportMenu.classList.add("hidden");
      const title = titleInput.value;
      ctx.showToast("Preparing your export…");
      try {
        if (b.dataset.export === "pdf") await exportDocPDF({ title, sourceEl: page });
        if (b.dataset.export === "word") await exportDocWord({ title, html: page.innerHTML });
        if (b.dataset.export === "text") await exportDocText({ title, html: page.innerHTML });
        ctx.showToast("Exported " + title);
      } catch (err) {
        ctx.showToast("Export failed — check your connection", true);
      }
    });
  });

  container.querySelector("[data-back]").addEventListener("click", () => ctx.onBack());
  if (file.title === "Untitled document") titleInput.select();

  return {
    destroy() {
      document.removeEventListener("click", closeMenu);
      clearTimeout(saveTimer);
    },
  };
}

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}
