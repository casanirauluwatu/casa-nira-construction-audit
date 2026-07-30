/**
 * Casa Nira — Daily Mapping Labour on Site → JSON web app.
 *
 * Publishes the daily head-count per unit as JSON so the Laporan Harian tab can
 * read it live (set DAILY_FEED to this deployment's /exec URL). Same idea as the
 * construction "Time Schedule" feeds, applied to the labour sheet.
 *
 * SHEET LAYOUT this reads (verified against Daily Mapping Labour on Site):
 *   row 3        real Date cells every 3rd column starting at D — one per day.
 *                Non-date junk in that row (stray 0 values) is ignored.
 *   row 4        repeating [Jumlah Rencana, Jumlah Aktual, Status] under each date.
 *   row 5        "Total" (col C) — includes non-villa categories.
 *   col B / C    B = block number (only on unit rows), C = unit or trade name.
 *   unit blocks  a row with a NUMBER in col B and a name in col C starts a block
 *                (A1…D1, then Utilities / Infrastruktur / Fabrikasi). The block
 *                row carries the unit's own plan/actual; the rows beneath it,
 *                until the next numbered row, are its trades (STR, ARS Sipil, …).
 *   tabs         one per month ("Juli 2026"). Months can be missing (there is no
 *                "Juni 2026"), so the month tab is only ever a first guess — if
 *                it is absent or renamed this falls back to scanning every tab.
 *
 * SPEED — a cold read opens the workbook and costs seconds, so:
 *   1. responses are cached in CacheService for 6h (10 min while a day is still
 *      empty, so the first entries show up promptly). A hit skips the
 *      spreadsheet entirely and answers in milliseconds.
 *   2. the month tab is tried by name first, so the usual request reads one
 *      tab's header row instead of all of them.
 *   3. only the first MAX_SCAN_ROWS rows are pulled (blocks end around row 320,
 *      the sheet runs to ~1200), re-reading wider only if a block starts near
 *      the bottom of that window.
 *   4. run installWarmup() once to refresh the cache hourly in the background,
 *      so visitors effectively never pay the cold cost.
 * Add ?nocache=1 to bypass the cache (the dashboard's Refresh button does this).
 *
 * DEPLOY
 *   Extensions → Apps Script, paste this file, Save.
 *   Deploy → New deployment → Web app
 *     Execute as:      Me
 *     Who has access:  Anyone            (required — the dashboard calls it server-side)
 *   Copy the /exec URL → set DAILY_FEED to it on the dashboard.
 *
 * RE-DEPLOYING AFTER AN EDIT — saving does NOT update a live /exec URL.
 *   Deploy → Manage deployments → pencil (Edit) → Version: "New version" → Deploy.
 *   Keep the SAME deployment: "New deployment" mints a DIFFERENT /exec URL and
 *   leaves the old one serving old code, which looks exactly like nothing changed.
 *   Verify with /exec?pretty=1 — `scriptVersion` should read the value below.
 *   Also make sure this is the only copy of the script in the project: a second
 *   file still holding an old doGet() can win.
 *
 * ENDPOINTS
 *   /exec                     today (Bali time), or the latest day that has data
 *   /exec?date=2026-07-30     one specific day
 *   /exec?month=2026-05       newest day with data in that month
 *   /exec?nocache=1           skip the cache and re-read the sheet
 *   /exec?pretty=1            indented JSON, for eyeballing in a browser
 */

// Leave blank to use the spreadsheet this script is bound to (slightly faster).
var SHEET_ID = '1i9dq7BTK69Bz-2sUg5isBFyC48a6jgAEDGNSVgEqQFM';

var DATE_ROW = 3;         // row holding the per-day Date cells
var FIRST_ROW = 5;        // "Total" row; unit blocks start below it
var NO_COL = 2;           // col B — block number (only unit rows have it); C follows
var TZ = 'Asia/Makassar'; // WITA
var MAX_LOOKBACK = 45;    // days to walk back when today has no data yet
var MAX_SCAN_ROWS = 420;  // rows pulled per read; blocks end ~320
var BLOCK_TAIL = 20;      // if a block starts this close to the window end, re-read wider
var CACHE_SEC = 21600;    // 6h — matches the dashboard's edge cache
var EMPTY_CACHE_SEC = 600;// 10min while the requested day still has no numbers
var CACHE_VER = 'v3';     // bump to invalidate every cached entry
// Shown in every response as `scriptVersion`, so you can tell at a glance which
// code the /exec URL is actually serving after a re-deploy.
var SCRIPT_VERSION = 'v3-series-months';
var MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  var skip = (p.nocache != null) || (p.fresh != null);
  try {
    var key = cacheKey(p.date, p.month);
    var cache = tryCache();
    if (cache && !skip) {
      var hit = cache.get(key);
      // generatedAt in the payload shows how old a cached answer is.
      if (hit) return out(hit, p.pretty);
    }
    var data = build(p.date, p.month);
    var body = JSON.stringify(data);
    if (cache) {
      try { cache.put(key, body, data.hasData ? CACHE_SEC : EMPTY_CACHE_SEC); } catch (ignore) {}
    }
    return out(body, p.pretty);
  } catch (err) {
    return out(JSON.stringify({ error: String((err && err.message) || err) }), p.pretty);
  }
}

/** Install once (or run from the editor) to keep the cache warm hourly. */
function installWarmup() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'warmup') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('warmup').timeBased().everyHours(1).create();
  return 'warmup trigger installed (hourly)';
}

/** Refreshes the cached "today" answer in the background. */
function warmup() {
  var data = build(null);
  var cache = tryCache();
  if (cache) cache.put(cacheKey(null), JSON.stringify(data), data.hasData ? CACHE_SEC : EMPTY_CACHE_SEC);
  return data.date + ' warmed (' + data.totals.villaWorkers + '/' + data.totals.villaPlan + ')';
}

/**
 * MAINTENANCE — blank the `Jumlah Aktual` cells for days that haven't happened.
 * Tabs created by copying a previous month arrive pre-filled with that month's
 * numbers; this clears them so the sheet says "not yet recorded" rather than
 * carrying figures forward.
 *
 * Run previewClearFutureActuals() first — it only logs what it would touch.
 * clearFutureActuals() then writes. This EDITS THE SPREADSHEET: check the
 * preview, and note that Apps Script edits are undoable in the sheet (Ctrl+Z)
 * only in the same session, so take File → Version history first if unsure.
 */
function previewClearFutureActuals() { return sweepFuture_(true); }
function clearFutureActuals() { return sweepFuture_(false); }

function sweepFuture_(dryRun) {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var tKey = key(todayYMD()), log = [], cleared = 0;
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s], ds = datesOf(sh);
    if (!ds.length) continue;
    var lastRow = sh.getLastRow(), n = Math.min(lastRow - FIRST_ROW + 1, MAX_SCAN_ROWS);
    if (n <= 0) continue;
    var names = sh.getRange(FIRST_ROW, ID_COL_C, n, 1).getValues();
    var perSheet = 0;
    for (var i = 0; i < ds.length; i++) {
      if (key(ds[i]) <= tKey) continue;                 // already happened — leave it
      var colA = ds[i].col + 1;                          // Jumlah Aktual
      var vals = sh.getRange(FIRST_ROW, colA, n, 1).getValues();
      var hits = 0, blank = [];
      for (var r = 0; r < n; r++) {
        var named = String(names[r][0] == null ? '' : names[r][0]).trim() !== '';
        var v = vals[r][0];
        if (named && v !== '' && v !== null) { hits++; blank.push(['']); } else blank.push([v]);
      }
      if (!hits) continue;
      perSheet += hits; cleared += hits;
      if (!dryRun) sh.getRange(FIRST_ROW, colA, n, 1).setValues(blank);
    }
    if (perSheet) log.push(sh.getName() + ': ' + perSheet + ' cell(s)');
  }
  if (cache_()) cache_().removeAll(['daily:' + CACHE_VER + ':today:' + ymd(todayYMD())]);
  var msg = (dryRun ? 'WOULD clear ' : 'Cleared ') + cleared + ' future actual cell(s) — ' + (log.join(' · ') || 'nothing to do');
  Logger.log(msg);
  return msg;
}
function cache_() { return tryCache(); }
var ID_COL_C = 3;   // col C — unit / trade name

function build(dateParam, monthParam) {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('spreadsheet not found — set SHEET_ID');

  // ?month=YYYY-MM — the newest day that has numbers in that month, so picking a
  // month lands on a useful day instead of an empty 1st.
  if (monthParam && !dateParam) {
    var mw = parseYM(monthParam);
    if (!mw) throw new Error('bad month "' + monthParam + '" — use YYYY-MM');
    var mdays = daysInMonth(ss, mw);
    if (!mdays.length) throw new Error('no columns for ' + monthParam);
    var mgot = pickWithData(mdays, mdays[mdays.length - 1]);
    if (mgot) return payload(ss, mgot.day, mgot.data, monthParam, false);
    return payload(ss, mdays[0], readDay(mdays[0], mdays), monthParam, false);
  }

  if (dateParam) {
    var want = parseYMD(dateParam);
    if (!want) throw new Error('bad date "' + dateParam + '" — use YYYY-MM-DD');
    var days = daysFor(ss, want);
    var day = findDay(days, want);
    if (!day) {
      var all = days.full ? days : allDays(ss);
      day = findDay(all, want);
      if (!day) {
        if (!all.length) throw new Error('no date cells found on row ' + DATE_ROW + ' of any tab');
        throw new Error('no column for ' + dateParam + ' — sheet covers ' +
          ymd(all[0]) + ' to ' + ymd(all[all.length - 1]));
      }
    }
    return payload(ss, day, readDay(day, sameMonth(days, day)), dateParam, false);
  }

  // No date given: today, else the most recent day that actually has numbers —
  // called before the sheet is filled in, reporting an empty site would be wrong.
  var today = todayYMD();
  var list = daysFor(ss, today);
  var got = pickWithData(list, today);
  if (!got && !list.full) { list = allDays(ss); got = pickWithData(list, today); }
  if (got) return payload(ss, got.day, got.data, null, got.fellBack);

  // Nothing in range has numbers — answer for today's column (or the last one).
  if (!list.length) list = allDays(ss);
  if (!list.length) throw new Error('no date cells found on row ' + DATE_ROW + ' of any tab');
  var at = lastIndexNotAfter(list, today);
  if (at < 0) at = list.length - 1;
  return payload(ss, list[at], readDay(list[at], sameMonth(list, list[at])), null, false);
}

function payload(ss, day, d, requested, fellBack) {
  return {
    project: 'Casa Nira Uluwatu',
    scriptVersion: SCRIPT_VERSION,
    date: ymd(day),
    labourSource: 'Daily Mapping Labour on Site',
    sheet: day.sheet.getName(),
    requestedDate: requested || null,
    isToday: sameYMD(day, todayYMD()),
    usedLatestWithData: !!fellBack,
    hasData: d.hasData,
    generatedAt: new Date().toISOString(),
    units: d.units,          // villas: A1…D1
    other: d.other,          // Utilities / Infrastruktur / Fabrikasi
    totals: d.totals,        // villa-only, other-only, and the sheet's own Total row
    series: d.series || null,// day-by-day manpower for the month, for the chart
    months: tabNames(ss),    // month tabs available, for the date picker
  };
}

/** Every day column belonging to one calendar month. */
function daysInMonth(ss, mw) {
  var sh = ss.getSheetByName(MONTHS_ID[mw.m - 1] + ' ' + mw.y);
  var pool = sh ? datesOf(sh) : allDays(ss);
  var out = [];
  for (var i = 0; i < pool.length; i++) if (pool[i].y === mw.y && pool[i].m === mw.m) out.push(pool[i]);
  if (!out.length && sh) {   // tab exists but holds another month — scan everything
    pool = allDays(ss);
    for (var j = 0; j < pool.length; j++) if (pool[j].y === mw.y && pool[j].m === mw.m) out.push(pool[j]);
  }
  out.sort(function (a, b) { return a.col - b.col; });
  return out;
}

/** The day entries that live on the same tab as `day` (one month's columns). */
function sameMonth(days, day) {
  var name = day.sheet.getName(), out = [];
  for (var i = 0; i < days.length; i++) if (days[i].sheet.getName() === name) out.push(days[i]);
  out.sort(function (a, b) { return a.col - b.col; });
  return out.length ? out : [day];
}

function tabNames(ss) {
  var out = [], sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) out.push(sheets[i].getName());
  return out;
}

/** Walk back from `today` to the newest day that has numbers. */
function pickWithData(days, today) {
  var at = lastIndexNotAfter(days, today);
  if (at < 0) return null;
  for (var i = at, n = 0; i >= 0 && n < MAX_LOOKBACK; i--, n++) {
    var data = readDay(days[i], sameMonth(days, days[i]));
    if (data.hasData) return { day: days[i], data: data, fellBack: i !== at };
  }
  return null;
}

/** Dates on one tab's row 3. */
function datesOf(sh) {
  var out = [], lastCol = sh.getLastColumn();
  if (lastCol < 4) return out;
  var row = sh.getRange(DATE_ROW, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < row.length; c++) {
    var v = row[c];
    // Only real Date cells — row 3 also holds stray numeric junk past the month.
    if (v instanceof Date && !isNaN(v.getTime()) && v.getFullYear() > 2000) {
      out.push({ sheet: sh, col: c + 1, y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() });
    }
  }
  return out;
}

/** Try the tab named for that month ("Juli 2026") before reading every tab. */
function daysFor(ss, want) {
  if (want) {
    var sh = ss.getSheetByName(MONTHS_ID[want.m - 1] + ' ' + want.y);
    if (sh) {
      var ds = datesOf(sh);
      if (findDay(ds, want)) return ds;   // not .full — caller may escalate
    }
  }
  return allDays(ss);
}

/** Every (tab, date) pair across the workbook, sorted by date. */
function allDays(ss) {
  var out = [], sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var ds = datesOf(sheets[s]);
    for (var i = 0; i < ds.length; i++) out.push(ds[i]);
  }
  out.sort(function (a, b) { return key(a) - key(b); });
  out.full = true;
  return out;
}

/**
 * Read one day, plus the whole month's day-by-day series for the manpower chart.
 * Both come out of a single wide getValues covering every day column on the tab —
 * one read for 31 days beats 31 reads, and the series is then free.
 */
function readDay(day, monthDays) {
  var avail = day.sheet.getLastRow() - FIRST_ROW + 1;
  if (avail <= 0) return { units: [], other: [], totals: empties(), hasData: false, series: null };
  var days = monthDays && monthDays.length ? monthDays : [day];
  var n = Math.min(avail, MAX_SCAN_ROWS);
  var got = scan(day.sheet, day, days, n);
  // A block starting near the bottom of the window means there may be more below.
  if (n < avail && got.lastStart >= n - BLOCK_TAIL) got = scan(day.sheet, day, days, avail);
  return got.data;
}

function scan(sh, pick, days, n) {
  var ids = sh.getRange(FIRST_ROW, NO_COL, n, 2).getValues();          // [B, C]
  // A day after today cannot have a recorded actual. Some tabs are pre-filled by
  // copying a previous month, so those cells hold placeholder numbers — report
  // them as absent instead of passing them off as measurements.
  var tKey = key(todayYMD());
  var fut = [];
  for (var fi = 0; fi < days.length; fi++) fut.push(key(days[fi]) > tKey);
  var pickFuture = key(pick) > tKey;
  var actOf = function (row, off, isFut) { return isFut ? 0 : num(row[off + 1]); };
  var first = days[0].col;
  var width = days[days.length - 1].col + 2 - first + 1;
  var grid = sh.getRange(FIRST_ROW, first, n, width).getValues();      // every day on this tab
  var at = pick.col - first;                                          // picked day's offset

  // Block starts: a number in col B plus a name in col C.
  var starts = [];
  for (var r = 0; r < n; r++) {
    var name = String(ids[r][1] == null ? '' : ids[r][1]).trim();
    if (isNum(ids[r][0]) && name) starts.push({ r: r, id: name });
  }

  var units = [], other = [], hasData = false;
  var sDates = [], sTotalP = [], sTotalA = [], sUnits = {};
  for (var k = 0; k < days.length; k++) { sDates.push(ymd(days[k])); sTotalP.push(0); sTotalA.push(0); }

  for (var i = 0; i < starts.length; i++) {
    var st = starts[i];
    var end = (i + 1 < starts.length) ? starts[i + 1].r : n;
    var plan = num(grid[st.r][at]), workers = actOf(grid[st.r], at, pickFuture);
    var status = pickFuture ? '' : String(grid[st.r][at + 2] == null ? '' : grid[st.r][at + 2]).trim();
    var villa = isVilla(st.id);

    var comp = [], trades = [];
    for (var r2 = st.r + 1; r2 < end; r2++) {
      var tname = String(ids[r2][1] == null ? '' : ids[r2][1]).trim();
      if (!tname) continue;
      var tp = num(grid[r2][at]), ta = actOf(grid[r2], at, pickFuture);
      if (tp === 0 && ta === 0) continue;
      trades.push({ name: tname, plan: tp, workers: ta });
      if (ta > 0) comp.push(tname + ' ' + ta);
    }
    if (workers > 0) hasData = true;

    // Day-by-day head-count for this block, straight off the wide read.
    var sp = [], sa = [];
    for (var k2 = 0; k2 < days.length; k2++) {
      var o = days[k2].col - first;
      var dp = num(grid[st.r][o]), da = actOf(grid[st.r], o, fut[k2]);
      sp.push(dp); sa.push(da);
      // Totals span every block, so they line up with the sheet's own Total row.
      sTotalP[k2] += dp; sTotalA[k2] += da;
    }

    var row = {
      id: st.id, plan: plan, workers: workers,
      comp: comp.join(' · '), status: status, trades: trades,
    };
    if (villa) { row.block = st.id.charAt(0); units.push(row); }
    else other.push(row);
    sUnits[st.id] = { plan: sp, workers: sa, villa: villa };
  }

  return {
    lastStart: starts.length ? starts[starts.length - 1].r : -1,
    data: {
      units: units, other: other, hasData: hasData,
      totals: {
        villaPlan: sum(units, 'plan'), villaWorkers: sum(units, 'workers'),
        otherPlan: sum(other, 'plan'), otherWorkers: sum(other, 'workers'),
        // The sheet's own "Total" row (row 5) — villas + Utilities/Infrastruktur/Fabrikasi.
        sheetPlan: num(grid[0][at]), sheetWorkers: actOf(grid[0], at, pickFuture),
      },
      // Daily manpower for the month on this tab. `total` covers every block so it
      // matches the sheet's Total row; `units` carries each block, villa or not.
      series: { month: sh.getName(), dates: sDates, total: { plan: sTotalP, workers: sTotalA }, units: sUnits,
                future: fut, today: ymd(todayYMD()) },
    },
  };
}

/* ---------- helpers ---------- */
function isVilla(id) { return /^[A-D]\d+$/.test(id); }
function isNum(v) { return typeof v === 'number' && !isNaN(v); }
function num(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var s = String(v == null ? '' : v).trim().replace(/,/g, '');
  if (s === '') return 0;
  var f = parseFloat(s);
  return isNaN(f) ? 0 : f;
}
function sum(arr, k) { var t = 0; for (var i = 0; i < arr.length; i++) t += arr[i][k] || 0; return t; }
function empties() { return { villaPlan: 0, villaWorkers: 0, otherPlan: 0, otherWorkers: 0, sheetPlan: 0, sheetWorkers: 0 }; }
function key(o) { return o.y * 10000 + o.m * 100 + o.d; }
function pad(x) { return (x < 10 ? '0' : '') + x; }
function ymd(o) { return o.y + '-' + pad(o.m) + '-' + pad(o.d); }
function sameYMD(a, b) { return key(a) === key(b); }
function parseYMD(s) {
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s).trim());
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
function todayYMD() { return parseYMD(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')); }
function findDay(days, want) {
  for (var i = 0; i < days.length; i++) if (sameYMD(days[i], want)) return days[i];
  return null;
}
function lastIndexNotAfter(days, want) {
  var at = -1, k = key(want);
  for (var i = 0; i < days.length; i++) if (key(days[i]) <= k) at = i;
  return at;
}
function cacheKey(dateParam, monthParam) {
  if (dateParam) return 'daily:' + CACHE_VER + ':d:' + dateParam;
  if (monthParam) return 'daily:' + CACHE_VER + ':m:' + monthParam;
  return 'daily:' + CACHE_VER + ':today:' + ymd(todayYMD());
}
function parseYM(s) {
  var m = /^(\d{4})-(\d{1,2})$/.exec(String(s).trim());
  return m ? { y: +m[1], m: +m[2] } : null;
}
function tryCache() {
  try { return CacheService.getScriptCache(); } catch (ignore) { return null; }
}
function out(body, pretty) {
  var text = body;
  if (pretty) { try { text = JSON.stringify(JSON.parse(body), null, 2); } catch (ignore) {} }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
