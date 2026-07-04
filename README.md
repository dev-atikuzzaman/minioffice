# Folio — Docs, Sheets & Slides in one light PWA

A single installable web app that replaces the "which Office tool do I open" decision
with three tabs: **Docs**, **Sheets**, **Slides**. No build step, no login, no server —
everything is saved on-device and the whole app installs like a native app.

## Why it's built this way (the 80/20 read)

Word, Excel and PowerPoint each have hundreds of menu items; almost nobody uses more
than a handful day to day. Folio implements the ~20% of each tool that covers ~80% of
real use, and skips the rest deliberately:

| Tab | Included (the 20% that matters) | Deliberately left out |
|---|---|---|
| **Docs** | Headings, bold/italic/underline/strike, lists, alignment, colors, links, undo/redo, word count, export to PDF/Word/text | Footnotes, tables, track changes, comments |
| **Sheets** | A real formula engine (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ROUND`, `ABS`, `IF`, `CONCAT`, arithmetic), cell styling, number formats, CSV/XLSX export | Pivot tables, charts, multi-cell drag-select, cross-sheet refs |
| **Slides** | 5 layout templates, 5 themes, present mode, PDF/PPTX export | Free-form drag/resize, animations/transitions, media embeds |

This keeps the codebase small enough to actually read and extend, per the brief.

## Architecture

- **No build step.** Plain ES modules loaded directly by the browser (`<script type="module">`).
  Open `index.html` on any static host and it runs.
- **Local-first "database."** `js/db.js` wraps IndexedDB — a real transactional
  browser database — so every file survives refreshes and works fully offline.
  There's no server in the loop for normal use.
- **Lazy-loaded export engines.** `js/export.js` only fetches SheetJS / jsPDF /
  html-docx-js / PptxGenJS from a CDN the first time you actually export something,
  so the app stays light on first load. `service-worker.js` caches them after first
  use so exporting keeps working offline too.
- **One formula engine, one file.** `js/formulas.js` is a small hand-rolled
  tokenizer/parser/evaluator — no spreadsheet dependency to keep in sync.
- **PWA basics.** `manifest.json` + `service-worker.js` make it installable on
  desktop and mobile, with an app-shell cache-first strategy.

```
officepwa/
├─ index.html            # shell: fonts, Tailwind CDN config, boot
├─ manifest.json         # PWA install metadata
├─ service-worker.js     # offline caching
├─ css/styles.css        # design tokens + components
├─ js/
│  ├─ app.js             # dashboard, router, toasts, install prompt
│  ├─ db.js              # IndexedDB data layer
│  ├─ formulas.js        # spreadsheet formula engine
│  ├─ docs.js            # Docs tab
│  ├─ sheets.js          # Sheets tab
│  ├─ slides.js          # Slides tab
│  └─ export.js          # PDF / Word / Excel / CSV / PPTX export
├─ icons/                # generated app icons
└─ supabase/schema.sql   # optional cloud-sync schema (see below)
```

## Running it

No install needed — but browsers block `fetch`/modules from `file://`, so serve it
over HTTP:

```bash
cd officepwa
python3 -m http.server 8080
# or: npx serve .
```

Then open `http://localhost:8080`. To install as an app, use the browser's
"Install app" / "Add to Home Screen" option, or the in-app **Install app** button
that appears once the browser fires its install prompt.

## Deploying (Vercel)

It's static, so there's no framework config needed:

```bash
npm i -g vercel   # if you don't have it
cd officepwa
vercel
```

Or drag the folder into the Vercel dashboard. Since this is plain HTML/CSS/JS,
there's no `REACT_APP_*` env setup required unless you wire up Supabase (below).

## Adding cloud sync (optional)

Folio works entirely offline by default. If you want files to follow you across
devices — using the same Supabase workflow as your other projects — the pieces are
already scaffolded:

1. Run `supabase/schema.sql` in your Supabase project's SQL editor.
2. Add Supabase auth (magic link or OAuth) and the `@supabase/supabase-js` CDN script
   to `index.html`.
3. In `js/db.js`, after each local `Files.update`/`create`/`remove`, push the same
   record to `supabase.from('files').upsert(...)` — the `files` table's columns
   (`id, type, title, content, updated_at`) intentionally match the local record
   shape, so this is a straight mapping, not a rewrite.
4. On load, pull remote rows newer than the local `updatedAt` and merge (last-write-wins,
   same as the persistent-storage pattern used elsewhere).

This is left as an opt-in step rather than wired up by default, since it needs your
own Supabase URL/anon key and an auth flow decision (magic link vs. OAuth) that's
worth making deliberately rather than defaulting for you.

## Known limitations / roadmap

- Sheets: single-cell selection only (no drag-to-select ranges); formulas can still
  reference ranges by typing them (e.g. `=SUM(A1:A10)`).
- Sheets: recalculates the whole grid on every edit — fine at "light" sizes (tens of
  columns, hundreds of rows); a dependency graph would be the next step for larger sheets.
- Slides: layouts are templated rather than freeform drag/resize, by design (see the
  80/20 table above).
- Rich text uses `document.execCommand`, which is officially deprecated but still
  broadly supported; it was the pragmatic choice for a dependency-free "light" editor.
- Export libraries require an internet connection the first time; after that they're
  cached by the service worker.

## Browser support

Current Chrome, Edge, Safari, and Firefox. Present mode uses the Fullscreen API;
installability depends on each browser's PWA support (Chrome/Edge on desktop and
Android are the most complete; Safari supports "Add to Home Screen" with a subset
of manifest features).
