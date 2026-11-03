/**
 * Casa Nira — Batch Export Laporan Klien → PDFs in Drive.
 *
 * Renders one owner-facing progress-report PDF per unit and files them all in
 * a NEW Drive folder per run, so nobody prints 19 reports by hand. Which units
 * run, and the date range each unit's photos cover, live on a dedicated
 * Google Sheet ("Casa Nira — Batch Export Laporan Klien") — ops edit the
 * ranges there, the dashboard's "Batch Export → Drive" button does the rest.
 *
 * DIVISION OF LABOUR — this script renders, it does not gather. The dashboard
 * already knows how to read the audit feeds and the per-day photo listings, so
 * the browser collects everything (stats, S-curve series, photo ids, the
 * captions + highlights typed on that device) and POSTs one JSON payload per
 * unit. This script turns each payload into a Google Doc, exports it as PDF
 * into the run folder, and trashes the temp Doc. Photo bytes are the one thing
 * fetched here: the ids point at Drive files this account can read.
 *
 * CONFIG SHEET (tab "Batch") — a LOG that grows downward, one row per unit per
 * period; each week ops append fresh rows for the units below the old ones and
 * never delete anything:
 *   A Tanggal Mulai · B Tanggal Akhir · C Unit · D Highlights · E Lowlights
 *   Tanggal Akhir is required; an empty Tanggal Mulai means the 7 days ending
 *   on Akhir. Highlights / Lowlights print on that unit's PDF (green / amber).
 *   The batch runs the NEWEST row per unit — latest Tanggal Akhir, bottom-most
 *   row on a tie — so the dates alone decide what exports; older rows are the
 *   archive. There is no include/exclude column.
 *
 * DEPLOY (same recipe as daily-labour.gs)
 *   Open the batch sheet → Extensions → Apps Script, paste this file, Save.
 *   Deploy → New deployment → Web app
 *     Execute as:      Me
 *     Who has access:  Anyone     (the dashboard calls it server-side)
 *   Copy the /exec URL → set BATCH_FEED to it on the dashboard (Vercel env).
 *   First run asks for Drive + Docs + external-request authorisation.
 *
 * RE-DEPLOYING AFTER AN EDIT — saving does NOT update a live /exec URL:
 *   Deploy → Manage deployments → ✏️ Edit → Version: "New version" → Deploy.
 *   Verify with /exec?pretty=1 — `scriptVersion` should read the value below.
 *
 * ENDPOINTS
 *   GET  /exec                   { ok, script, scriptVersion }  (health check)
 *   GET  /exec?action=config     newest row per unit, date defaults resolved
 *   POST /exec  {action:"start"}                    → creates the run folder
 *   POST /exec  {action:"unit", folderId, unit, …}  → renders one PDF into it
 *   POST /exec  {action:"finish", folderId}         → zips the PDFs into ONE
 *        archive in the parent folder and trashes the run folder — the
 *        deliverable is the ZIP, not a folder of loose files.
 */

// Leave blank to use the spreadsheet this script is bound to.
var SHEET_ID = '1mPOm4EtN2j93cMwx4BRVWXQLiNjRwExuad2V-KWIZvA';
var SHEET_TAB = 'Batch';
// All run folders are created inside this one (made in My Drive on first run).
// Set PARENT_FOLDER_ID to pin an existing folder instead of finding by name.
var PARENT_FOLDER_NAME = 'Casa Nira — Client Reports';
var PARENT_FOLDER_ID = '';
var TZ = 'Asia/Makassar'; // WITA — the clock the ranges and run names use
var DEFAULT_RANGE_DAYS = 7;
var MAX_RANGE_DAYS = 62; // a runaway range would fetch months of photos
var PHOTO_WIDTH_PX = 800; // thumbnail size fetched from Drive (HEIC → JPEG)
var SCRIPT_VERSION = 'v3-para-fix';

// Palette — same inks as the dashboard, so the PDFs read as the same report.
var C_GOLD = '#a9822f', C_OLIVE = '#6f7043', C_INK = '#2b2620',
    C_MUTED = '#8f887c', C_RED = '#b4472e', C_GREEN = '#3f7d4f',
    C_AMBER = '#b5842c', C_LINE = '#e6dfd1';

var MON_EN = ['January','February','March','April','May','June',
              'July','August','September','October','November','December'];
var MON3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  var pretty = p.pretty != null;
  try {
    if (p.action === 'config') return out_(config_(), pretty);
    return out_({ ok: true, script: 'batch-export', scriptVersion: SCRIPT_VERSION,
      usage: 'GET ?action=config · POST {action:"start"} · POST {action:"unit",…}' }, pretty);
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err), scriptVersion: SCRIPT_VERSION }, pretty);
  }
}

function doPost(e) {
  var body = null;
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  if (!body || !body.action) return out_({ ok: false, error: 'POST a JSON body with an "action"' });
  try {
    if (body.action === 'start') return out_(startRun_());
    if (body.action === 'unit') return out_(renderUnit_(body));
    if (body.action === 'finish') return out_(finishRun_(body));
    return out_({ ok: false, error: 'unknown action "' + body.action + '"' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err), unit: body.unit || null,
      scriptVersion: SCRIPT_VERSION });
  }
}

function out_(o, pretty) {
  o.scriptVersion = o.scriptVersion || SCRIPT_VERSION;
  return ContentService
    .createTextOutput(pretty ? JSON.stringify(o, null, 2) : JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==================== config sheet ==================== */

function sheet_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_TAB);
  if (!sh) throw new Error('tab "' + SHEET_TAB + '" not found on the batch sheet');
  return sh;
}

var ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function isoOf_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v))
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v).trim();
  return ISO_RE.test(s) ? s : null; // null = present but unreadable
}
function todayIso_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function shiftIso_(iso, by) {
  var d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
function spanDays_(a, b) { return Math.round((new Date(b) - new Date(a)) / 864e5) + 1; }

// The newest row per unit, dates resolved. The tab is an append-only log, so
// "newest" is the latest Tanggal Akhir — and on a tie the bottom-most row,
// because further down means added later. Rows that can't run (no unit, no
// Tanggal Akhir, unreadable dates) are returned under `invalid` with their row
// number, so the dashboard can say exactly which line to fix.
function config_() {
  var sh = sheet_();
  var vals = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 5).getValues();
  var newest = {}, order = [], invalid = [];
  for (var i = 0; i < vals.length; i++) {
    var rowNo = i + 2;
    var start = isoOf_(vals[i][0]), end = isoOf_(vals[i][1]);
    var unit = String(vals[i][2] || '').trim().toUpperCase();
    if (!unit && !start && !end) continue; // genuinely blank line
    var bad = null;
    if (!unit) bad = 'kolom Unit kosong';
    else if (start === null || end === null) bad = 'tanggal tidak terbaca — pakai YYYY-MM-DD';
    else if (!end) bad = 'Tanggal Akhir kosong';
    else {
      start = start || shiftIso_(end, -(DEFAULT_RANGE_DAYS - 1));
      if (start > end) bad = 'Tanggal Mulai setelah Tanggal Akhir';
      else if (spanDays_(start, end) > MAX_RANGE_DAYS) bad = 'rentang lebih dari ' + MAX_RANGE_DAYS + ' hari';
    }
    if (bad) { invalid.push({ row: rowNo, unit: unit || '?', error: bad }); continue; }
    var row = { unit: unit, start: start, end: end, row: rowNo,
      highlights: String(vals[i][3] || '').trim(), lowlights: String(vals[i][4] || '').trim() };
    if (!newest[unit]) order.push(unit);
    if (!newest[unit] || row.end >= newest[unit].end) newest[unit] = row;
  }
  var rows = [];
  for (var j = 0; j < order.length; j++) rows.push(newest[order[j]]);
  return { ok: true, rows: rows, invalid: invalid, sheet: SHEET_TAB, today: todayIso_() };
}

/* ==================== run folder ==================== */

function parentFolder_() {
  if (PARENT_FOLDER_ID) return DriveApp.getFolderById(PARENT_FOLDER_ID);
  var root = DriveApp.getRootFolder();
  var it = root.getFoldersByName(PARENT_FOLDER_NAME);
  return it.hasNext() ? it.next() : root.createFolder(PARENT_FOLDER_NAME);
}

function startRun_() {
  var name = 'Batch ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH.mm');
  var folder = parentFolder_().createFolder(name);
  return { ok: true, folderId: folder.getId(), folderUrl: folder.getUrl(), folderName: name };
}

/* ==================== one unit → one PDF ==================== */

// payload: { folderId, unit, type, start, end,
//            stats: { actual, planned, deviation, target, committed, bare } | null,
//            series: [ { d:"YYYY-MM-DD", p, a } ],
//            photos: [ { id, day:"YYYY-MM-DD", caption } ],
//            highlights, lowlights }   ← both come from the sheet's row
function renderUnit_(p) {
  if (!p.folderId) throw new Error('folderId missing — call action:"start" first');
  if (!p.unit) throw new Error('unit missing');
  var folder = DriveApp.getFolderById(p.folderId);
  var period = fmtEn_(p.start) + ' – ' + fmtEn_(p.end);
  var name = 'Casa Nira ' + p.unit + ' Progress Report - ' + period;

  var doc = DocumentApp.create('[batch tmp] ' + name);
  try {
    var body = doc.getBody();
    body.setPageWidth(595.28).setPageHeight(841.89); // A4 portrait, points
    body.setMarginTop(40).setMarginBottom(40).setMarginLeft(46).setMarginRight(46);

    // Header strip — same wording as the printed klien report.
    para_(body, 'CASA NIRA ULUWATU · PROGRESS REPORT', { size: 9, bold: true, color: C_GOLD, after: 2 }, true);
    para_(body, p.unit + (p.type ? '  —  ' + String(p.type) : ''), { size: 19, bold: true, color: C_INK, after: 2 });
    para_(body, 'Period ' + period, { size: 9.5, color: C_MUTED, after: 8 });

    if (p.stats) statsTable_(body, p.stats);

    var inserted = 0, skipped = 0;
    if (p.series && p.series.length) {
      para_(body, 'PROGRESS S-CURVE', { size: 8.5, bold: true, color: C_MUTED, before: 10, after: 4 });
      try {
        var img = body.appendImage(curveChart_(p.series, !!(p.stats && p.stats.bare)));
        sizeImage_(img, 500);
        var st = p.stats || {};
        para_(body, (st.bare
          ? 'Solid olive = actual.' : 'Dashed gold = plan · solid olive = actual.')
          + (st.actual != null ? ' Actual ' + st.actual.toFixed(1) + '%' : '')
          + (!st.bare && st.planned != null ? ' vs plan ' + st.planned.toFixed(1) + '%' : '')
          + (st.target ? ' · target ' + st.target : '') + '.',
          { size: 8, color: C_MUTED, after: 4 });
      } catch (err) {
        para_(body, 'S-curve chart unavailable (' + String(err && err.message || err) + ').', { size: 8.5, color: C_MUTED, after: 4 });
      }
    }

    if (p.highlights) noteBlock_(body, 'HIGHLIGHTS', p.highlights, C_GREEN);
    if (p.lowlights) noteBlock_(body, 'LOWLIGHTS', p.lowlights, C_AMBER);

    var photos = p.photos || [];
    para_(body, 'PHOTO DOCUMENTATION' + (photos.length ? ' · ' + photos.length : ''),
      { size: 8.5, bold: true, color: C_MUTED, before: 12, after: 4 });
    if (!photos.length) {
      para_(body, 'No photos were uploaded for this unit in this period.', { size: 9, color: C_MUTED });
    } else {
      var res = photoTable_(body, photos);
      inserted = res.inserted; skipped = res.skipped;
    }

    para_(body, 'Generated ' + Utilities.formatDate(new Date(), TZ, 'd MMM yyyy HH:mm') + ' WITA · Casa Nira construction dashboard',
      { size: 7.5, color: C_MUTED, before: 10 });

    doc.saveAndClose();
    // Export via DriveApp, not doc.getAs: the Drive copy is guaranteed flushed
    // once saveAndClose returns.
    var pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(name + '.pdf');
    var file = folder.createFile(pdf);
    return { ok: true, unit: p.unit,
      file: { id: file.getId(), url: file.getUrl(), name: file.getName() },
      photos: inserted, skippedPhotos: skipped };
  } finally {
    // The Doc is scaffolding — only the PDF should remain.
    try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (err) {}
  }
}

// Zip the run: every PDF the units produced becomes ONE archive in the parent
// folder, and the working folder is trashed — the deliverable is the ZIP, not
// a folder of loose files. If zipping fails (Apps Script caps a blob around
// 50 MB — roughly a dozen very photo-heavy units), the folder is kept and the
// answer says so: the PDFs are safe either way.
function finishRun_(p) {
  if (!p.folderId) throw new Error('folderId missing — call action:"start" first');
  var folder = DriveApp.getFolderById(p.folderId);
  var blobs = [], seen = {}, n = 0;
  var it = folder.getFilesByType(MimeType.PDF);
  while (it.hasNext()) {
    var b = it.next().getBlob();
    var nm = b.getName();
    if (seen[nm]) b.setName(nm.replace(/\.pdf$/i, '') + ' (' + seen[nm] + ').pdf');
    seen[nm] = (seen[nm] || 0) + 1;
    blobs.push(b); n++;
  }
  if (!n) return { ok: false, error: 'no PDFs in the run folder to zip', folderUrl: folder.getUrl() };
  var name = folder.getName() + '.zip';
  try {
    var file = parentFolder_().createFile(Utilities.zip(blobs, name));
    folder.setTrashed(true);
    return { ok: true, zip: { id: file.getId(), url: file.getUrl(), name: name }, files: n };
  } catch (err) {
    return { ok: false, folderUrl: folder.getUrl(), files: n,
      error: 'zip failed (' + String(err && err.message || err) + ') — the PDFs are still in the run folder' };
  }
}

/* ---------- building blocks ---------- */

function para_(body, text, o, reuseFirst) {
  // A fresh Doc starts with one empty paragraph; the first write reuses it so
  // the PDF doesn't open with a blank line. Paragraph.setText() returns void
  // (unlike most Document setters), so it must never be chained from.
  var pg;
  if (reuseFirst && body.getNumChildren() === 1 && body.getChild(0).asParagraph().getText() === '') {
    pg = body.getChild(0).asParagraph();
    pg.setText(text);
  } else {
    pg = body.appendParagraph(text);
  }
  var at = {};
  at[DocumentApp.Attribute.FONT_SIZE] = o.size || 10;
  at[DocumentApp.Attribute.BOLD] = !!o.bold;
  at[DocumentApp.Attribute.FOREGROUND_COLOR] = o.color || C_INK;
  at[DocumentApp.Attribute.FONT_FAMILY] = 'Arial';
  pg.setAttributes(at);
  pg.setSpacingBefore(o.before || 0).setSpacingAfter(o.after || 0).setLineSpacing(1.15);
  return pg;
}

function fmtEn_(iso) {
  var d = new Date(iso + 'T00:00:00Z');
  return d.getUTCDate() + ' ' + MON_EN[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

// Progress · Plan · Deviation · Target · Hand-over, labels over values — the
// same inline stats the klien unit header shows, as a bordered strip.
function statsTable_(body, st) {
  var cols = [['PROGRESS', st.actual == null ? '—' : st.actual.toFixed(1) + '%', C_INK]];
  if (!st.bare) {
    cols.push(['PLAN', st.planned == null ? '—' : st.planned.toFixed(1) + '%', C_INK]);
    cols.push(['DEVIATION', st.deviation == null ? '—' : (st.deviation >= 0 ? '+' : '') + st.deviation.toFixed(1) + ' pp',
      st.deviation == null ? C_INK : st.deviation < 0 ? C_RED : C_GREEN]);
  }
  if (st.target) cols.push(['TARGET', String(st.target), C_INK]);
  if (st.committed) cols.push(['HAND-OVER (COMMITTED)', String(st.committed), '#d9791a']);
  var t = body.appendTable([cols.map(function (c) { return c[0]; }), cols.map(function (c) { return c[1]; })]);
  t.setBorderWidth(0.5).setBorderColor(C_LINE);
  for (var i = 0; i < cols.length; i++) {
    styleCell_(t.getRow(0).getCell(i), { size: 7, bold: true, color: C_MUTED });
    styleCell_(t.getRow(1).getCell(i), { size: 11, bold: true, color: cols[i][2] });
  }
}

function styleCell_(cell, o) {
  cell.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(6).setPaddingRight(6);
  var at = {};
  at[DocumentApp.Attribute.FONT_SIZE] = o.size;
  at[DocumentApp.Attribute.BOLD] = !!o.bold;
  at[DocumentApp.Attribute.FOREGROUND_COLOR] = o.color;
  at[DocumentApp.Attribute.FONT_FAMILY] = 'Arial';
  cell.setAttributes(at);
}

function noteBlock_(body, label, text, color) {
  para_(body, label, { size: 8, bold: true, color: color, before: 8, after: 1 });
  para_(body, String(text), { size: 9.5, color: C_INK, after: 4 });
}

// Plan-vs-actual line chart, rendered server-side by the Charts service. The
// dashboard's SVG S-curve can't travel in a JSON payload, but the same series
// can — colours match, so the PDF chart reads as the same curve.
function curveChart_(series, bare) {
  // An actual-only unit (renegotiated schedule) gets no Plan column at all —
  // a column of nulls is worse than an absent one.
  var dt = Charts.newDataTable().addColumn(Charts.ColumnType.STRING, '');
  if (!bare) dt.addColumn(Charts.ColumnType.NUMBER, 'Plan');
  dt.addColumn(Charts.ColumnType.NUMBER, 'Actual');
  var step = Math.max(1, Math.ceil(series.length / 110));
  var n = 0;
  for (var i = 0; i < series.length; i++) {
    if (i % step && i !== series.length - 1) continue;
    var w = series[i], d = new Date(w.d + 'T00:00:00Z');
    var label = isNaN(d) ? String(w.d) : MON3[d.getUTCMonth()] + " '" + String(d.getUTCFullYear()).slice(-2);
    var row = [label];
    if (!bare) row.push(w.p == null ? null : w.p);
    row.push(w.a == null ? null : w.a);
    dt.addRow(row);
    n++;
  }
  return Charts.newLineChart()
    .setDataTable(dt)
    .setDimensions(900, 300)
    .setColors(bare ? [C_OLIVE] : [C_GOLD, C_OLIVE])
    .setOption('vAxis', { minValue: 0, maxValue: 100, gridlines: { color: C_LINE } })
    .setOption('hAxis', { showTextEvery: Math.max(1, Math.ceil(n / 10)), textStyle: { fontSize: 10 } })
    .setOption('legend', { position: 'bottom' })
    .setOption('chartArea', { left: 45, top: 12, width: '90%', height: '72%' })
    .setOption('backgroundColor', '#ffffff')
    .build()
    .getAs('image/png');
}

// Photos 2-up with their captions — the layout the printed klien report uses.
function photoTable_(body, photos) {
  var table = body.appendTable();
  table.setBorderWidth(0.5).setBorderColor(C_LINE);
  var inserted = 0, skipped = 0;
  for (var i = 0; i < photos.length; i += 2) {
    var row = table.appendTableRow();
    for (var j = i; j < i + 2; j++) {
      var cell = row.appendTableCell();
      cell.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(4).setPaddingRight(4);
      if (j >= photos.length) { cell.setText(''); continue; }
      var sh = photos[j];
      var blob = photoBlob_(sh.id);
      var pg = cell.getChild(0).asParagraph();
      if (blob) {
        try { sizeImage_(pg.appendInlineImage(blob), 228); inserted++; }
        catch (err) { pg.setText('[photo could not be embedded]'); skipped++; }
      } else { pg.setText('[photo could not be fetched]'); skipped++; }
      var cap = (sh.day ? dayEn_(sh.day) : '') + (sh.caption ? (sh.day ? ' — ' : '') + String(sh.caption) : '');
      if (cap) {
        var cp = cell.appendParagraph(cap);
        var at = {};
        at[DocumentApp.Attribute.FONT_SIZE] = 8;
        at[DocumentApp.Attribute.FOREGROUND_COLOR] = sh.caption ? C_INK : C_MUTED;
        at[DocumentApp.Attribute.FONT_FAMILY] = 'Arial';
        cp.setAttributes(at);
        cp.setSpacingBefore(2).setSpacingAfter(0);
      }
    }
  }
  return { inserted: inserted, skipped: skipped };
}

function dayEn_(iso) {
  var d = new Date(iso + 'T00:00:00Z');
  return isNaN(d) ? String(iso) : d.getUTCDate() + ' ' + MON3[d.getUTCMonth()];
}

// Insert first, then scale: the InlineImage knows its intrinsic size only once
// it is in the document, and setting width alone would stretch it.
function sizeImage_(img, targetW) {
  var w = img.getWidth(), h = img.getHeight();
  if (w > 0 && h > 0) img.setWidth(targetW).setHeight(Math.round(h * targetW / w));
  return img;
}

// Drive's thumbnail endpoint transcodes HEIC to JPEG at the requested width —
// the same two hosts the dashboard's <img> uses, same order, then DriveApp's
// own (small) thumbnail as the last resort.
function photoBlob_(id) {
  var urls = [
    'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + PHOTO_WIDTH_PX,
    'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=w' + PHOTO_WIDTH_PX,
  ];
  for (var i = 0; i < urls.length; i++) {
    try {
      var res = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true, followRedirects: true });
      var hdr = res.getHeaders();
      var type = String(hdr['Content-Type'] || hdr['content-type'] || '');
      if (res.getResponseCode() === 200 && type.indexOf('image/') === 0) return res.getBlob();
    } catch (err) {}
  }
  try { return DriveApp.getFileById(id).getThumbnail(); } catch (err) {}
  return null;
}
