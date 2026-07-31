# PRD — Tab "Laporan Klien" (Client-facing Laporan Harian)

**Status:** Approved for build · **Owner:** Casa Nira ops · **Doc date:** 2026-07-31

> **Rev 2 (2026-07-31):** client feedback — no labour/manpower data anywhere in
> the client report (no worker counts on the cover, summary table, or unit
> headers). The per-unit "Pekerjaan hari ini" summary is replaced by an
> editable **Highlight & Lowlight** section. Unit pages carry: progress stats,
> S-curve, Highlight/Lowlight, photos.
>
> **Rev 4 (2026-07-31):** the Client Report tab is **entirely in English**
> (tab name, toolbar, report content, chart annotations — "today",
> "HANDOVER" — dates, placeholders; internal tabs stay Indonesian). The two
> editable blocks are **Highlights** and **Next Week Focus** (replacing
> Highlight/Lowlight); the print button reads **"Print for Owner"**.
>
> **Rev 3 (2026-07-31):** unit selection is a **dropdown** ("Semua unit" + one
> entry per unit, mirroring the audit tab's chart selector), not multi-select
> chips. No cover page. The report is **one compact page per unit**: a project
> strip (Casa Nira · Laporan Harian · date), unit id/type with inline stats
> (Progres, Rencana, Deviasi, Δ minggu ini, Serah terima/Target), a compact
> S-curve, Highlight/Lowlight, then photos (3-up in print). The print button is
> **"Cetak untuk Owner"**. Selecting one unit prints one A4 page; "Semua unit"
> prints one page per unit for distributing to each owner.

## 1. Background

The dashboard already has two tabs:

- **Construction Audit** — internal pace/deviation analytics per unit.
- **Laporan Harian** — internal daily ops report (manpower, weather, small photo
  contact sheet).

Neither is suitable to hand to a **client**. The internal daily tab buries the
photos (thumbnails, six-up contact sheet on print), mixes in internal machinery
(cache notes, feed diagnostics, attendance colour codes), and shows *every*
unit — a client who bought unit B2 does not need A1–D1.

## 2. Goal

A third tab, **Laporan Klien**, that generates a clean, client-ready daily
report whose primary output is an **exported PDF**, with:

1. **Photos front and centre** — large photos per unit, each with an editable
   description (caption), plus an editable Highlight & Lowlight section per
   unit.
2. **Progress per unit as an S-curve** — planned vs actual, target, projection,
   committed due date.
3. **Unit selection** — the person generating the report chooses exactly which
   unit(s) go into the PDF.

## 3. Non-goals

- No new backend endpoints, storage, or dependencies (repo is zero-dep; data
  already exists in `/api/daily/day`, `/api/daily/photos`,
  `/api/construction/audit`).
- No server-side PDF rendering. Export = browser print dialog → "Save as PDF",
  driven by a dedicated print stylesheet. This keeps the repo dependency-free
  and works on desktop and mobile.
- No captions synced across devices. Captions/descriptions persist in
  `localStorage` on the device that writes them (v1). Cross-device caption
  storage is a possible v2 (would need a write endpoint).
- Non-villa areas (Utilities, Infra, Fabrikasi) are out of scope for the
  client report.
- Internal metrics (attendance %, colour bands, manpower chart, weather,
  cache/feed diagnostics) stay out of this tab — it is client-facing.

## 4. Users & primary flow

Site admin / project manager, daily:

1. Open **Laporan Klien** tab → pick the date (defaults to the day already
   loaded in Laporan Harian; both tabs share one date).
2. Tick the unit(s) the report is for (selection remembered per device).
3. Optionally click any photo caption or the per-unit work summary and edit the
   text in place.
4. Click **Export PDF** → print dialog → save → send to client.

## 5. Functional spec

### 5.1 Tab & toolbar

- New tab button **"Laporan Klien"** after "Laporan Harian"; deep-linkable via
  `#klien`.
- Toolbar (screen only, never printed):
  - **Tanggal** date input — changing it reloads the shared daily data
    (`loadDaily`), so Laporan Harian and Laporan Klien always agree on the day.
  - **Unit chips** — one toggle chip per villa (from the daily feed), showing
    that unit's photo count for the day. Checked = included in the report.
  - **Semua / Kosongkan** — select all / none.
  - **Export PDF** — calls `window.print()`.
- Selection persists in `localStorage` (`klienUnits`); default = all units.

### 5.2 Report body (screen = same layout the PDF gets)

**Cover block** (PDF page 1):

- Eyebrow "Casa Nira Uluwatu", title "Laporan Harian Proyek", full Indonesian
  date, count of selected units and photo count. **No labour figures.**
- Summary table of the selected units: Unit · Tipe · Progres % · Rencana % ·
  Deviasi · Target selesai (committed due date wins over the feed's
  extrapolated target when one exists).

**Per selected unit** (each starts a fresh PDF page):

- Header: unit id, villa type, committed hand-over date, and inline stats —
  Progres, Rencana, Deviasi (green/red). **No worker counts.**
- **Kurva-S**: planned (dashed gold) vs actual (solid olive), target diamond,
  projected completion, today marker, committed due line — same visual language
  as the audit tab, rendered standalone per unit. One-line summary underneath
  ("Aktual X% vs rencana Y% … Z minggu di depan/di belakang target").
- **Highlight & Lowlight**: two editable text blocks side by side — Highlight
  (green accent, "capaian penting hari ini") and Lowlight (amber accent,
  "kendala / perlu perhatian"). Both start empty; an empty block is omitted
  from the PDF, and when both are empty the whole section (heading included)
  is omitted.
- **Dokumentasi foto**: every photo for that unit and date, large (grid,
  2-up in PDF), each with an editable caption. Caption defaults to the Drive
  file name (cleaned: extension stripped, separators → spaces); empty captions
  show a placeholder on screen and are omitted from the PDF.

### 5.3 Editable descriptions

- Captions and Highlight/Lowlight entries are `contenteditable` regions, saved on input to
  `localStorage` keyed by date (`kcap:<date>`), photo id / unit id inside.
- Revisiting the same date restores the saved text; other dates are unaffected.

### 5.4 PDF export format

- A4, matching the existing `@page` margins.
- Hidden in print: toolbar, notes, global page header (the cover carries the
  title), Drive links, edit affordances, empty-caption placeholders.
- Cover = page 1; each unit `break-before: page`; photos `break-inside: avoid`.
- Photos print 2-up (~85 mm wide) — a documentation record, not a contact sheet.

### 5.5 Data / edge cases

| Case | Behaviour |
|---|---|
| Audit feed not loaded / unit has no schedule feed | Unit section shows "Data S-curve belum tersedia"; photos still print. |
| No photos for a unit that day | "Belum ada foto untuk tanggal ini" placeholder (kept small in PDF). |
| Photos still loading | "Memuat foto…" placeholder; report re-renders when they arrive. |
| Snapshot mode (no `DAILY_FEED`) | Works for the bundled day; date picker limited exactly as in Laporan Harian. |
| No unit selected | Friendly empty state, Export still allowed (prints cover only). |
| Photo thumbnail blocked | Same two-host fallback + placeholder as Laporan Harian (`shotImg`). |

### 5.6 Refresh

The global **Refresh data** button on this tab refreshes both the daily data
(numbers + photos) and the audit data (S-curves).

## 6. Technical design

All changes live in `public/index.html` (single-file app, no build step):

- Reuse the existing globals/loaders: `DAILY`, `PHOTOS`, `AUDIT`, `loadDaily`,
  `loadPhotos`, `shotsFor`, `shotImg`, `commitOf`, and the chart helpers
  (`pW`, `poly`, `diamond`, `monthTicks`).
- New: `renderKlien()` (renders cover + unit sections from the shared state),
  `kcurve(row)` (standalone S-curve SVG string), caption store helpers,
  selection store helpers.
- Hooks: `renderKlien()` re-runs after audit render, after `paintPhotos`
  (covers daily load + photo arrival), and on tab open. `setTab` gains the
  third tab; `beforeprint` tags `<body>` with `print-klien` so print CSS can
  hide the global header only for this tab.

## 7. Acceptance criteria

1. Tab "Laporan Klien" exists, deep-links via `#klien`, and renders from the
   same date the Laporan Harian tab shows.
2. Unticking a unit removes it from screen and PDF; selection survives reload.
3. Every photo of a selected unit appears large with an editable caption;
   edits survive reload on the same device and date.
4. Each selected unit shows its S-curve with target/projection/due markers when
   audit data is available, and a graceful note when not.
5. Export PDF yields: cover page with summary table, then one page-block per
   unit, no toolbars/notes/links/screen furniture, photos 2-up and unclipped.
6. No new dependencies; no backend changes; existing tabs unaffected.
