/**
 * Casa Nira — daily site photos from the "Rekap" Drive folder.
 *
 * ADD THIS TO THE SAME Apps Script project as daily-labour.gs (as a second file).
 * It has no doGet of its own — daily-labour.gs routes `?photos=YYYY-MM-DD` here,
 * so there is still one deployment and one DAILY_FEED URL to look after.
 *
 * SETUP — one extra step:
 *   Apps Script editor → Services (+) → "Drive API" → v3 → Add.
 *   Without it, `Drive` below is undefined and photo requests return an error
 *   saying exactly that.
 *
 * FOLDER LAYOUT it reads:
 *   Rekap / <UNIT> / <MM YYYY> / <DD MM YYYY> / *.jpg|*.heic
 *   e.g.  Rekap / A1 / 07 2026 / 30 07 2026 / IMG_8893.HEIC
 *
 * WHY IT IS BATCHED
 *   Walking 22 units three levels deep with DriveApp is ~66 round trips and takes
 *   tens of seconds. Four Drive.Files.list queries resolve the whole day instead,
 *   because every unit's date folder shares one name: ask for all folders called
 *   "30 07 2026" whose parent is one of the month folders, in a single call.
 *
 * SHARING
 *   This script reads as the deploying account, so it lists photos whatever the
 *   sharing is. The browser is what needs access to render a thumbnail: with the
 *   folder shared to the aurum-dev.com domain, images load for signed-in staff
 *   and not for anyone else. Share "anyone with the link" if outsiders need them.
 */

var REKAP_FOLDER_ID = '1x_VL0b99xelLk5ON9jaRR5tbo8S1lhfl';
var PHOTO_CACHE_SEC = 21600;   // 6h, same as the labour answers
var MAX_PER_UNIT = 12;         // cards show a handful; keep the payload small

// The Drive folder names that do not match the spreadsheet's block names.
// "Infra" holds both Infrastruktur and Fabrikasi work.
var FOLDER_ALIAS = { Infrastruktur: 'Infra', Fabrikasi: 'Infra' };

/** `photos=YYYY-MM-DD` -> { date, photos: {unit: [{id,name}]}, ... } */
function photosFor(dateParam) {
  var want = parseYMD(dateParam);
  if (!want) throw new Error('bad date "' + dateParam + '" — use YYYY-MM-DD');
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw new Error('Drive API service not enabled — Apps Script editor → Services (+) → Drive API v3 → Add');
  }

  var monthName = pad(want.m) + ' ' + want.y;                      // "07 2026"
  var dayName = pad(want.d) + ' ' + pad(want.m) + ' ' + want.y;    // "30 07 2026"

  // 1. unit folders under Rekap
  var units = listChildren_("'" + REKAP_FOLDER_ID + "' in parents", { folders: true });
  if (!units.length) return { date: ymd(want), photos: {}, folders: {}, note: 'Rekap folder is empty' };
  var unitById = {};
  units.forEach(function (f) { unitById[f.id] = f.name; });

  // 2. that month's folder inside each unit
  var months = listChildren_(parentsClause_(units), { folders: true, name: monthName });
  var unitOfMonth = {};
  months.forEach(function (f) { unitOfMonth[f.id] = unitById[(f.parents || [])[0]]; });

  // 3. that day's folder inside each month
  var daysF = months.length ? listChildren_(parentsClause_(months), { folders: true, name: dayName }) : [];
  var unitOfDay = {};
  daysF.forEach(function (f) { unitOfDay[f.id] = unitOfMonth[(f.parents || [])[0]]; });

  // 4. the images themselves
  var photos = {}, files = daysF.length ? listChildren_(parentsClause_(daysF), { images: true }) : [];
  files.forEach(function (f) {
    var unit = unitOfDay[(f.parents || [])[0]];
    if (!unit) return;
    (photos[unit] = photos[unit] || []).push({ id: f.id, name: f.name, mime: f.mimeType });
  });
  Object.keys(photos).forEach(function (u) {
    photos[u].sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    if (photos[u].length > MAX_PER_UNIT) photos[u] = photos[u].slice(0, MAX_PER_UNIT);
  });

  return {
    date: ymd(want),
    scriptVersion: SCRIPT_VERSION,
    rekapFolder: REKAP_FOLDER_ID,
    alias: FOLDER_ALIAS,
    folders: unitById,          // unit -> folder id, so a card can link to Drive
    dayFolders: invert_(unitOfDay),
    photos: photos,
    counts: countOf_(photos),
    generatedAt: new Date().toISOString(),
  };
}

/** One Drive query for every child of a set of parents. */
function listChildren_(parentClause, opt) {
  var q = [parentClause, 'trashed = false'];
  if (opt.folders) q.push("mimeType = 'application/vnd.google-apps.folder'");
  if (opt.images) q.push("(mimeType contains 'image/' or mimeType contains 'video/')");
  if (opt.name) q.push("name = '" + String(opt.name).replace(/'/g, "\\'") + "'");
  var out = [], token = null, guard = 0;
  do {
    var r = Drive.Files.list({
      q: q.join(' and '),
      fields: 'nextPageToken, files(id,name,mimeType,parents)',
      pageSize: 1000,
      pageToken: token || undefined,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    (r.files || []).forEach(function (f) { out.push(f); });
    token = r.nextPageToken;
  } while (token && ++guard < 10);
  return out;
}

function parentsClause_(items) {
  return '(' + items.map(function (f) { return "'" + f.id + "' in parents"; }).join(' or ') + ')';
}
function invert_(map) {
  var out = {};
  Object.keys(map).forEach(function (id) { if (map[id]) out[map[id]] = id; });
  return out;
}
function countOf_(photos) {
  var out = {};
  Object.keys(photos).forEach(function (u) { out[u] = photos[u].length; });
  return out;
}
