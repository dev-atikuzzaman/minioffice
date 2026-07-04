/**
 * sheets.js — the Excel-like tab. A scrollable grid backed by a compact
 * formula engine (formulas.js). Recalculation is whole-sheet-on-edit,
 * which keeps the code simple and is plenty fast at "light" sheet sizes.
 */
import { evaluate, indexToCol, colToIndex, parseRef } from "./formulas.js";
import { exportSheetXLSX, exportSheetCSV } from "./export.js";

export function mount(container, file, ctx) {
  const content = file.content;
  let selected = "A1";
  let saveTimer = null;

  container.innerHTML = `
    <div class="h-full flex flex-col bg-paper">
      <div class="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-mist/70 bg-white/70 backdrop-blur">
        <button data-back class="icon-btn" title="Back to Home">
          <svg class="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 6 10l6 6"/></svg>
        </button>
        <input data-title class="doc-title-input" value="${escapeAttr(file.title)}" spellcheck="false" />
        <span data-status class="save-pill save-pill-ledger">Saved</span>
        <div class="flex-1"></div>
        <div class="relative">
          <button data-export-toggle class="btn-ledger-outline">Export ▾</button>
          <div data-export-menu class="export-menu hidden">
            <button data-export="xlsx">Excel (.xlsx)</button>
            <button data-export="csv">CSV</button>
          </div>
        </div>
      </div>

      <div class="sheet-toolbar">
        ${sBtn("bold", "B", "font-bold")}
        ${sBtn("italic", "I", "italic")}
        ${sBtn("underline", "U", "underline")}
        <span class="tool-divider"></span>
        ${sBtn("alignLeft", "⟸", "")}
        ${sBtn("alignCenter", "⟺", "")}
        ${sBtn("alignRight", "⟹", "")}
        <span class="tool-divider"></span>
        <label class="doc-tool-btn cursor-pointer" title="Text color">
          <span class="text-[13px] font-bold">A</span>
          <input data-color="text" type="color" class="sr-only" value="#14171f" />
        </label>
        <label class="doc-tool-btn cursor-pointer" title="Fill color">
          <span class="w-3.5 h-3.5 rounded-sm border border-mist" style="background:#DCFCE7"></span>
          <input data-color="fill" type="color" class="sr-only" value="#dcfce7" />
        </label>
        <span class="tool-divider"></span>
        <select data-format class="doc-select" title="Number format">
          <option value="general">General</option>
          <option value="number">Number</option>
          <option value="currency">Currency</option>
          <option value="percent">Percent</option>
        </select>
        <span class="tool-divider"></span>
        <button data-add-row class="btn-ghost-sm">+ Row</button>
        <button data-add-col class="btn-ghost-sm">+ Column</button>
      </div>

      <div class="formula-bar">
        <span data-cell-ref class="cell-ref-badge">A1</span>
        <input data-formula-input class="formula-input" spellcheck="false" placeholder="Enter a value or formula, e.g. =SUM(A1:A5)" />
      </div>

      <div class="flex-1 overflow-auto sheet-scroll" data-grid-wrap></div>
      <div class="doc-statusbar" data-status-bar>Select a cell to see details</div>
    </div>
  `;

  const gridWrap = container.querySelector("[data-grid-wrap]");
  const cellRefBadge = container.querySelector("[data-cell-ref]");
  const formulaInput = container.querySelector("[data-formula-input]");
  const statusEl = container.querySelector("[data-status]");
  const statusBar = container.querySelector("[data-status-bar]");
  const titleInput = container.querySelector("[data-title]");
  const exportToggle = container.querySelector("[data-export-toggle]");
  const exportMenu = container.querySelector("[data-export-menu]");
  const formatSelect = container.querySelector("[data-format]");

  function cellData(ref) {
    return content.cells[ref] || {};
  }

  function computeValue(ref, stack = new Set()) {
    const c = cellData(ref);
    if (c.f) {
      if (stack.has(ref)) return "#CIRCULAR!";
      stack.add(ref);
      const result = evaluate(c.f.slice(1), {
        getCell: (r) => {
          const v = computeValue(r, stack);
          return typeof v === "number" ? v : v === "" ? null : isNaN(parseFloat(v)) ? v : parseFloat(v);
        },
        getRange: (a, b) => rangeValues(a, b, stack),
      });
      stack.delete(ref);
      return result;
    }
    if (c.v === undefined || c.v === null || c.v === "") return "";
    return c.v;
  }

  function rangeValues(a, b, stack) {
    const ra = parseRef(a), rb = parseRef(b);
    if (!ra || !rb) return [];
    const out = [];
    for (let r = Math.min(ra.row, rb.row); r <= Math.max(ra.row, rb.row); r++) {
      for (let cc = Math.min(ra.col, rb.col); cc <= Math.max(ra.col, rb.col); cc++) {
        out.push(computeValue(indexToCol(cc) + (r + 1), stack));
      }
    }
    return out;
  }

  function formatDisplay(ref, raw) {
    const style = cellData(ref).style || {};
    if (typeof raw !== "number" || !style.format || style.format === "general") return raw;
    if (style.format === "number") return raw.toFixed(2);
    if (style.format === "currency") return "$" + raw.toFixed(2);
    if (style.format === "percent") return (raw * 100).toFixed(1) + "%";
    return raw;
  }

  function cellStyleAttr(ref) {
    const s = cellData(ref).style || {};
    let css = "";
    if (s.bold) css += "font-weight:700;";
    if (s.italic) css += "font-style:italic;";
    if (s.underline) css += "text-decoration:underline;";
    if (s.align) css += `text-align:${s.align};`;
    if (s.color) css += `color:${s.color};`;
    if (s.fill) css += `background-color:${s.fill};`;
    return css;
  }

  function buildTable() {
    const cols = content.cols, rows = content.rows;
    let html = '<table class="sheet-table"><thead><tr><th class="corner-cell"></th>';
    for (let c = 0; c < cols; c++) html += `<th class="col-head">${indexToCol(c)}</th>`;
    html += "</tr></thead><tbody>";
    for (let r = 0; r < rows; r++) {
      html += `<tr><th class="row-head">${r + 1}</th>`;
      for (let c = 0; c < cols; c++) {
        const ref = indexToCol(c) + (r + 1);
        html += `<td data-cell="${ref}" class="sheet-cell"></td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    gridWrap.innerHTML = html;
    attachCellEvents();
    refreshValues();
  }

  // Updates every cell's displayed value/style in place, without touching
  // DOM node identity. This matters: rebuilding innerHTML on every keystroke
  // would destroy and recreate the very <td> a click might be mid-flight on
  // (e.g. clicking cell B while committing cell A's edit), silently losing
  // that click. Only buildTable() (row/column count changes) needs a rebuild.
  function refreshValues() {
    gridWrap.querySelectorAll("[data-cell]").forEach((td) => {
      const ref = td.dataset.cell;
      const raw = computeValue(ref);
      const display = formatDisplay(ref, raw);
      const isErr = typeof raw === "string" && raw.startsWith("#");
      td.textContent = display === null || display === undefined ? "" : String(display);
      td.classList.toggle("cell-error", isErr);
      td.style.cssText = cellStyleAttr(ref);
    });
    highlightSelected();
  }

  function attachCellEvents() {
    gridWrap.querySelectorAll("[data-cell]").forEach((td) => {
      td.addEventListener("click", () => selectCell(td.dataset.cell));
      td.addEventListener("dblclick", () => { selectCell(td.dataset.cell); formulaInput.focus(); formulaInput.select(); });
    });
  }

  function selectCell(ref) {
    selected = ref;
    cellRefBadge.textContent = ref;
    const c = cellData(ref);
    formulaInput.value = c.f || (c.v ?? "");
    highlightSelected();
    const s = c.style || {};
    formatSelect.value = s.format || "general";
    statusBar.textContent = `${ref} · ${typeof computeValue(ref) === "number" ? "Number" : "Text"}`;
  }

  function highlightSelected() {
    gridWrap.querySelectorAll(".sheet-cell.is-selected").forEach((el) => el.classList.remove("is-selected"));
    const td = gridWrap.querySelector(`[data-cell="${selected}"]`);
    if (td) td.classList.add("is-selected");
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

  function commitValue(ref, raw) {
    if (raw === "" || raw === undefined) {
      delete content.cells[ref];
    } else {
      const existingStyle = cellData(ref).style;
      if (String(raw).startsWith("=")) {
        content.cells[ref] = { f: raw, style: existingStyle };
      } else {
        content.cells[ref] = { v: raw, style: existingStyle };
      }
    }
    refreshValues();
    selectCell(ref);
    markDirty();
  }

  function move(ref, dRow, dCol) {
    const p = parseRef(ref);
    if (!p) return ref;
    const row = Math.min(Math.max(p.row + dRow, 0), content.rows - 1);
    const col = Math.min(Math.max(p.col + dCol, 0), content.cols - 1);
    return indexToCol(col) + (row + 1);
  }

  formulaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      commitValue(selected, formulaInput.value);
      const next = move(selected, 1, 0);
      selectCell(next);
      formulaInput.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      commitValue(selected, formulaInput.value);
      const next = move(selected, 0, 1);
      selectCell(next);
      formulaInput.focus();
    } else if (e.key === "Escape") {
      selectCell(selected);
    }
  });
  formulaInput.addEventListener("blur", () => commitValue(selected, formulaInput.value));

  function sheetKeyHandler(e) {
    if (!document.body.contains(gridWrap)) return; // this sheet is no longer mounted
    if (document.activeElement === formulaInput || document.activeElement === titleInput) return;
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault();
      selectCell(move(selected, ...arrows[e.key]));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      commitValue(selected, "");
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      formulaInput.value = e.key;
      formulaInput.focus();
    }
  }
  document.addEventListener("keydown", sheetKeyHandler);

  function applyStyle(patch) {
    const c = cellData(selected);
    c.style = { ...(c.style || {}), ...patch };
    content.cells[selected] = c;
    refreshValues();
    selectCell(selected);
    markDirty();
  }

  container.querySelectorAll("[data-style]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.style;
      const c = cellData(selected).style || {};
      if (["bold", "italic", "underline"].includes(key)) applyStyle({ [key]: !c[key] });
      else applyStyle({ align: key.replace("align", "").toLowerCase() });
    });
  });
  container.querySelectorAll("[data-color]").forEach((input) => {
    input.addEventListener("input", () => {
      applyStyle(input.dataset.color === "text" ? { color: input.value } : { fill: input.value });
    });
  });
  formatSelect.addEventListener("change", () => applyStyle({ format: formatSelect.value }));

  container.querySelector("[data-add-row]").addEventListener("click", () => {
    content.rows += 10;
    buildTable();
    markDirty();
  });
  container.querySelector("[data-add-col]").addEventListener("click", () => {
    content.cols += 4;
    buildTable();
    markDirty();
  });

  titleInput.addEventListener("input", () => {
    clearTimeout(titleInput._t);
    titleInput._t = setTimeout(async () => {
      await ctx.Files.update(file.id, { title: titleInput.value || "Untitled spreadsheet" });
      ctx.onFileChanged?.();
    }, 400);
  });

  exportToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", closeMenu);
  function closeMenu() { exportMenu.classList.add("hidden"); }

  function buildGridArray() {
    const grid = [];
    for (let r = 0; r < content.rows; r++) {
      const row = [];
      for (let c = 0; c < content.cols; c++) {
        row.push(computeValue(indexToCol(c) + (r + 1)));
      }
      grid.push(row);
    }
    return grid;
  }

  exportMenu.querySelectorAll("[data-export]").forEach((b) => {
    b.addEventListener("click", async () => {
      exportMenu.classList.add("hidden");
      const title = titleInput.value;
      ctx.showToast("Preparing your export…");
      try {
        const grid = buildGridArray();
        if (b.dataset.export === "xlsx") await exportSheetXLSX({ title, grid });
        if (b.dataset.export === "csv") await exportSheetCSV({ title, grid });
        ctx.showToast("Exported " + title);
      } catch {
        ctx.showToast("Export failed — check your connection", true);
      }
    });
  });

  container.querySelector("[data-back]").addEventListener("click", () => ctx.onBack());
  if (file.title === "Untitled spreadsheet") titleInput.select();

  buildTable();
  selectCell("A1");

  return {
    destroy() {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", sheetKeyHandler);
      clearTimeout(saveTimer);
    },
  };
}

function sBtn(styleKey, label, cls) {
  return `<button type="button" data-style="${styleKey}" class="sheet-tool-btn ${cls}">${label}</button>`;
}
function escapeAttr(s) { return String(s || "").replace(/"/g, "&quot;"); }
