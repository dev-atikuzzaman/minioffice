/**
 * export.js — turns Folio content into real files: .pdf, .docx, .xlsx, .csv, .pptx.
 * Libraries are fetched from a CDN on first use only (not on page load) so the
 * app stays fast and light until someone actually needs to export.
 */

const CDN = {
  jspdf: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  html2canvas: "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  htmlDocx: "https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js",
  pptxgen: "https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
};

const loaded = new Map();
function loadScript(url) {
  if (loaded.has(url)) return loaded.get(url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Could not load " + url));
    document.head.appendChild(s);
  });
  loaded.set(url, p);
  return p;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeName(title) {
  return (title || "Untitled").replace(/[\\/:*?"<>|]+/g, "_").trim() || "Untitled";
}

/* ---------------- Docs ---------------- */

export async function exportDocText({ title, html }) {
  const div = document.createElement("div");
  div.innerHTML = html;
  const blob = new Blob([div.innerText], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, safeName(title) + ".txt");
}

export async function exportDocWord({ title, html }) {
  await loadScript(CDN.htmlDocx);
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  const blob = window.htmlDocx.asBlob(fullHtml);
  downloadBlob(blob, safeName(title) + ".docx");
}

export async function exportDocPDF({ title, sourceEl }) {
  await loadScript(CDN.html2canvas);
  await loadScript(CDN.jspdf);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  await pdf.html(sourceEl, {
    margin: [40, 40, 40, 40],
    autoPaging: "text",
    width: 515,
    windowWidth: sourceEl.scrollWidth || 800,
  });
  pdf.save(safeName(title) + ".pdf");
}

/* ---------------- Sheets ---------------- */

export async function exportSheetXLSX({ title, grid }) {
  await loadScript(CDN.xlsx);
  const ws = window.XLSX.utils.aoa_to_sheet(grid);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  window.XLSX.writeFile(wb, safeName(title) + ".xlsx");
}

export async function exportSheetCSV({ title, grid }) {
  const csv = grid
    .map((row) =>
      row
        .map((cell) => {
          const v = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        })
        .join(",")
    )
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, safeName(title) + ".csv");
}

/* ---------------- Slides ---------------- */

const THEME_COLORS = {
  aurora: { bg: "1E2A78", accent: "6C7BFF", text: "FFFFFF" },
  sunset: { bg: "3A1220", accent: "F2542D", text: "FFF7F2" },
  ocean: { bg: "0B3B36", accent: "0E8F6F", text: "F1FFFC" },
  midnight: { bg: "14171F", accent: "9AA5FF", text: "F5F6FA" },
  paper: { bg: "FCFCFD", accent: "2E4CE0", text: "14171F" },
};

export async function exportSlidesPPTX({ title, slides, theme }) {
  await loadScript(CDN.pptxgen);
  const pres = new window.PptxGenJS();
  pres.defineLayout({ name: "WIDE", width: 10, height: 5.63 });
  pres.layout = "WIDE";
  const colors = THEME_COLORS[theme] || THEME_COLORS.aurora;

  slides.forEach((s) => {
    const slide = pres.addSlide();
    slide.background = { color: colors.bg };
    (s.elements || []).forEach((el) => {
      const isTitle = el.role === "title";
      const plain = stripHtml(el.content);
      slide.addText(plain || "", {
        x: 0.6,
        y: isTitle ? 0.7 : el.role === "subtitle" ? 2.0 : 1.6,
        w: 8.8,
        h: isTitle ? 1.2 : el.role === "subtitle" ? 0.8 : 3.2,
        fontSize: isTitle ? 32 : el.role === "subtitle" ? 18 : 16,
        bold: isTitle,
        color: colors.text,
        align: s.layout === "title" ? "center" : "left",
        fontFace: "Arial",
      });
    });
  });

  await pres.writeFile({ fileName: safeName(title) + ".pptx" });
}

export async function exportSlidesPDF({ title, slideEls }) {
  await loadScript(CDN.html2canvas);
  await loadScript(CDN.jspdf);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: [960, 540], orientation: "landscape" });
  for (let i = 0; i < slideEls.length; i++) {
    const canvas = await window.html2canvas(slideEls[i], { scale: 2, useCORS: true });
    const img = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0) pdf.addPage([960, 540], "landscape");
    pdf.addImage(img, "JPEG", 0, 0, 960, 540);
  }
  pdf.save(safeName(title) + ".pdf");
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.innerText;
}
