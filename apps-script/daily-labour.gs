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
 *   unit blocks  a row with a NUMBER in col B and a name in col C starts a block
 *                (A1…D1, then Utilities / Infrastruktur / Fabrikasi). The block
 *                row carries the unit's own plan/actual; the rows beneath it,
 *                until the next numbered row, are its trades (STR, ARS Sipil, …).
 *   tabs         one per month ("Juli 2026"). Months can be missing — this scans
 *                every tab's row 3 for the date rather than trusting tab names.
 *
 * DEPLOY
 *   Extensions → Apps Script, paste this file, Save.
 *   Deploy → New deployment → Web app
 *     Execute as:      Me
 *     Who has access:  Anyone            (required — the dashboard calls it server-side)
 *   Copy the /exec URL → set DAILY_FEED to it on the dashboard.
 *   Re-deploy (Manage deployments → edit → Deploy) after editing this script.
 *
 * ENDPOINTS
 *   /exec                     today (Bali time), or the latest day that has data
 *   /exec?date=2026-07-30     one specific day
 *   /exec?pretty=1            indented JSON, for eyeballing in a browser
 */

// Leave blank to use the spreadsheet this script is bound to.
var SHEET_ID = '1i9dq7BTK69Bz-2sUg5isBFyC48a6jgAEDGNSVgEqQFM';

var DATE_ROW = 3;        // row holding the per-day Date cells
var FIRST_ROW = 5;       // "Total" row; unit blocks start below it
var ID_COL = 3;          // col C — unit / trade name
var NO_COL = 2;          // col B — block number (only unit rows have it)
var TZ = 'Asia/Makassar';// WITA
var MAX_LOOKBACK = 45;   // days to walk back when today has no data yet

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    return json(build(p.date), p.pretty);
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, p.pretty);
  }
}

function build(dateParam) {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('spreadsheet not found — set SHEET_ID');

  var days = indexDays(ss);
  if (!days.length) throw new Error('no date cells found on row ' + DATE_ROW + ' of any tab');

  var want = dateParam ? parseYMD(dateParam) : null;
  if (dateParam && !want) throw new Error('bad date "' + dateParam + '" — use YYYY-MM-DD');

  var picked, fellBack = false;
  if (want) {
    picked = findDay(days, want);
    if (!picked) {
      throw new Error('no column for ' + dateParam + ' — sheet covers ' +
        ymd(days[0]) + ' to ' + ymd(days[days.length - 1]));
    }
    picked.data = readDay(picked);
  } else {
    // Prefer today; before the sheet is filled in, fall back to the most recent
    // day that actually has numbers rather than reporting a site of zero people.
    var today = todayYMD();
    var at = lastIndexNotAfter(days, today);
    if (at < 0) at = days.length - 1;
    for (var i = at, n = 0; i >= 0 && n < MAX_LOOKBACK; i--, n++) {
      var cand = days[i];
      cand.data = readDay(cand);
      if (cand.data.hasData) { picked = cand; fellBack = (i !== at); break; }
      if (!picked) picked = cand;   // keep the first (today) as a last resort
    }
    if (!picked.data) picked.data = readDay(picked);
    fellBack = fellBack || !picked.data.hasData;
  }

  var d = picked.data;
  return {
    project: 'Casa Nira Uluwatu',
    date: ymd(picked),
    labourSource: 'Daily Mapping Labour on Site',
    sheet: picked.sheet.getName(),
    requestedDate: dateParam || null,
    isToday: sameYMD(picked, todayYMD()),
    usedLatestWithData: fellBack,
    hasData: d.hasData,
    generatedAt: new Date().toISOString(),
    units: d.units,          // villas: A1…D1
    other: d.other,          // Utilities / Infrastruktur / Fabrikasi
    totals: d.totals,        // villa-only, other-only, and the sheet's own Total row
  };
}

/** Every (tab, date) pair on row 3, sorted by date. */
function indexDays(ss) {
  var out = [], sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s], lastCol = sh.getLastColumn();
    if (lastCol < 4 || sh.getLastRow() < FIRST_ROW) continue;
    var row = sh.getRange(DATE_ROW, 1, 1, lastCol).getValues()[0];
    for (var c = 0; c < row.length; c++) {
      var v = row[c];
      // Only real Date cells — row 3 also holds stray numeric junk past the month.
      if (v instanceof Date && !isNaN(v.getTime()) && v.getFullYear() > 2000) {
        out.push({ sheet: sh, col: c + 1, y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() });
      }
    }
  }
  out.sort(function (a, b) { return key(a) - key(b); });
  return out;
}

/** Read one day: [plan, actual, status] at col..col+2 for every block. */
function readDay(day) {
  var sh = day.sheet;
  var lastRow = sh.getLastRow();
  var n = lastRow - FIRST_ROW + 1;
  if (n <= 0) return { units: [], other: [], totals: empties(), hasData: false };

  var ids = sh.getRange(FIRST_ROW, NO_COL, n, 2).getValues();      // [B, C]
  var vals = sh.getRange(FIRST_ROW, day.col, n, 3).getValues();     // [plan, actual, status]

  // Block starts: a number in col B plus a name in col C.
  var starts = [];
  for (var r = 0; r < n; r++) {
    var name = String(ids[r][1] == null ? '' : ids[r][1]).trim();
    if (isNum(ids[r][0]) && name) starts.push({ r: r, id: name });
  }

  var units = [], other = [], hasData = false;
  for (var i = 0; i < starts.length; i++) {
    var st = starts[i];
    var end = (i + 1 < starts.length) ? starts[i + 1].r : n;
    var plan = num(vals[st.r][0]), workers = num(vals[st.r][1]);
    var status = String(vals[st.r][2] == null ? '' : vals[st.r][2]).trim();

    var comp = [], trades = [];
    for (var r2 = st.r + 1; r2 < end; r2++) {
      var tname = String(ids[r2][1] == null ? '' : ids[r2][1]).trim();
      if (!tname) continue;
      var tp = num(vals[r2][0]), ta = num(vals[r2][1]);
      if (tp === 0 && ta === 0) continue;
      trades.push({ name: tname, plan: tp, workers: ta });
      if (ta > 0) comp.push(tname + ' ' + ta);
    }
    if (workers > 0) hasData = true;

    var row = {
      id: st.id, plan: plan, workers: workers,
      comp: comp.join(' · '), status: status, trades: trades,
    };
    if (isVilla(st.id)) { row.block = st.id.charAt(0); units.push(row); }
    else other.push(row);
  }

  return {
    units: units, other: other, hasData: hasData,
    totals: {
      villaPlan: sum(units, 'plan'), villaWorkers: sum(units, 'workers'),
      otherPlan: sum(other, 'plan'), otherWorkers: sum(other, 'workers'),
      // The sheet's own "Total" row (row 5) — villas + Utilities/Infrastruktur/Fabrikasi.
      sheetPlan: num(vals[0][0]), sheetWorkers: num(vals[0][1]),
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
function todayYMD() {
  var s = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  return parseYMD(s);
}
function findDay(days, want) {
  for (var i = 0; i < days.length; i++) if (sameYMD(days[i], want)) return days[i];
  return null;
}
function lastIndexNotAfter(days, want) {
  var at = -1, k = key(want);
  for (var i = 0; i < days.length; i++) if (key(days[i]) <= k) at = i;
  return at;
}
function json(obj, pretty) {
  var body = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
