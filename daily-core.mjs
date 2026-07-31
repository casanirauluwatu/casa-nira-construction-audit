// Daily report (laporan harian) data source. Serves the bundled labour snapshot
// unless DAILY_FEED points at the Daily Mapping Labour Apps Script web app
// (apps-script/daily-labour.gs), in which case that wins.
//
// The feed only knows what the labour sheet knows — head-count, trades, status.
// Villa type, batch and Drive photo folder live here in daily-data.mjs and are
// merged in, so that metadata stays in one place instead of being duplicated
// into the spreadsheet.
//
// Shared by the Node server and the Vercel function. Node 18+, zero deps.
import { DAILY } from "./daily-data.mjs";

const TIMEOUT_MS = 20000;   // Apps Script cold reads run ~7s; the function allows 30s
const TRIES = 2;            // one retry: a warm serverless instance can abort spuriously
const META = new Map(DAILY.units.map((u) => [u.id, u]));
const isVilla = (id) => /^[A-D]\d+$/.test(String(id || ""));

// Feed labour + local metadata. Feed values win, except for the fields the feed
// never sends (type/batch/folder), which fall back to the bundled metadata.
function mergeUnit(u) {
  const m = META.get(u.id);
  if (!m) return { block: String(u.id || "").charAt(0), type: "", batch: "", ...u };
  return { ...m, ...u, type: u.type || m.type, batch: u.batch || m.batch, folder: u.folder || m.folder };
}

function fromFeed(data) {
  const units = (data.units || []).filter((u) => isVilla(u.id)).map(mergeUnit);
  return {
    ...DAILY,          // project name, photosFolder, labourSource defaults
    ...data,           // date, sheet, totals, series, months, flags from the feed
    units,
    other: data.other || [],
    // Never inherit the bundled snapshot's series/months here: they describe one
    // fixed day in July and villa-only totals, so blending them with live labour
    // would put a chart and a scorecard that disagree on the same screen. A feed
    // running an older daily-labour.gs simply reports no series.
    series: data.series || null,
    months: data.months || null,
    live: true,
  };
}

// A requested date the snapshot can't answer: say so rather than silently
// serving the one day it does have.
function offline(note, date) {
  const out = { ...DAILY, live: false };
  if (note) out.note = note;
  if (date && date !== DAILY.date) {
    out.requestedDate = date;
    out.unavailableDate = true;
  }
  return out;
}

// One fetch with an explicit controller. AbortSignal.timeout() has been seen
// firing almost immediately on a reused serverless instance, which surfaced as a
// "timeout" 0.5s into a call the feed answers in ~7s — an explicit timer plus a
// retry rides that out.
async function fetchFeed(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const started = Date.now();
  try {
    return { res: await fetch(url, { signal: ctl.signal }) };
  } catch (err) {
    const aborted = err.name === "AbortError" || err.name === "TimeoutError";
    const elapsed = Date.now() - started;
    // Distinguish a real timeout from an abort that fired far too early.
    const why = aborted ? (elapsed < ms * 0.5 ? `aborted after ${elapsed}ms` : "timeout") : err.message || "fetch failed";
    return { why };
  } finally {
    clearTimeout(timer);
  }
}

// Common-area photo folders on Drive. Unlike the villa Rekap folders these are
// flat — pictures dropped straight in, no per-date subfolder — so the daily
// photo feed never sees them. They are public ("anyone with the link"), which
// lets the embedded folder view be read without credentials or an API key.
const AREA_FOLDERS = {
  amenities: "1MxvIsuPzEoVMHqoATrMB-SrMKpdLbtsS",
  furniture: "1NeJoy-314xldnEb2DvuRo7qaUYg4xKul",
  communal: "10qb-SF-dz5cZZAcfu4yFargvgdDirrm9",
};

// One embedded-folder-view read, split into files and subfolders. A folder
// entry's link points at /drive/folders/, a file's at /file/d/ — that is the
// only reliable tell the view offers. Drive rate-limits this endpoint with
// stray 503s, so retry with a short pause.
async function listDriveFolder(folderId) {
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
  let res, why;
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, 700 * i));
    ({ res, why } = await fetchFeed(url, TIMEOUT_MS));
    if (!why && res.ok) break;
  }
  if (why || !res.ok) throw new Error(why || `HTTP ${res.status}`);
  const html = await res.text();
  const out = { files: [], folders: [] };
  const re = /id="entry-([-\w]+)"[\s\S]*?href="([^"]+)"[\s\S]*?flip-entry-title">([^<]*)</g;
  let m;
  while ((m = re.exec(html)) && out.files.length + out.folders.length < 300) {
    (m[2].includes("/folders/") ? out.folders : out.files).push({ id: m[1], name: m[3] });
  }
  return out;
}

/** Current photos in the fixed common-area folders (Amenities, Communal). */
export async function getAreaPhotos() {
  const out = { ok: true, areas: {}, folders: { ...AREA_FOLDERS } };
  await Promise.all(Object.entries(AREA_FOLDERS).map(async ([key, folderId]) => {
    try {
      const top = await listDriveFolder(folderId);
      const shots = [...top.files];
      // Pictures are sometimes grouped one level down ("Pohon palem",
      // "Signage") — flatten those in, keeping the subfolder name as `group`
      // so the report can use the human-written label as a default caption.
      await Promise.all(top.folders.slice(0, 12).map(async (f) => {
        try {
          const sub = await listDriveFolder(f.id);
          shots.push(...sub.files.map((s) => ({ ...s, group: f.name })));
        } catch { /* an unreadable subfolder skips; the rest still show */ }
      }));
      out.areas[key] = shots.slice(0, 200);
    } catch (e) {
      out.areas[key] = [];
      out.errors = { ...(out.errors || {}), [key]: e.message };
    }
  }));
  return out;
}

/** Site photos for one day. Same feed, `?photos=YYYY-MM-DD`. */
export async function getPhotos({ date, fresh = false } = {}) {
  const feed = process.env.DAILY_FEED;
  if (!feed) return { ok: false, date, error: "DAILY_FEED not set", photos: {} };
  const url = new URL(feed);
  url.searchParams.set("photos", date);
  if (fresh) url.searchParams.set("nocache", "1");
  const { res, why } = await fetchFeed(url, TIMEOUT_MS);
  if (why) return { ok: false, date, error: why, photos: {} };
  if (!res.ok) return { ok: false, date, error: `HTTP ${res.status}`, photos: {} };
  try {
    const data = await res.json();
    if (data && data.error) return { ok: false, date, error: data.error, photos: {} };
    // An older daily-labour.gs ignores ?photos= and answers with the day's labour
    // instead. That is a stale deployment, not a day without photos — say so.
    if (!data || typeof data.photos !== "object" || data.photos === null) {
      return { ok: false, date, photos: {}, error: `feed has no photo support (scriptVersion ${data?.scriptVersion || "unknown"})` };
    }
    return { ok: true, ...data, photos: data.photos };
  } catch (err) {
    return { ok: false, date, error: `bad JSON (${err.message})`, photos: {} };
  }
}

export async function getDaily({ date = null, month = null, fresh = false } = {}) {
  const feed = process.env.DAILY_FEED;
  if (!feed) return offline(null, date || month);
  const url = new URL(feed);
  if (date) url.searchParams.set("date", date);
  else if (month) url.searchParams.set("month", month);
  if (fresh) url.searchParams.set("nocache", "1");

  let last = "fetch failed";
  for (let i = 1; i <= TRIES; i++) {
    const { res, why } = await fetchFeed(url, TIMEOUT_MS);
    if (why) { last = why; continue; }
    if (!res.ok) { last = `HTTP ${res.status}`; if (res.status < 500) break; continue; }
    try {
      const data = await res.json();
      // The Apps Script reports its own failures as {error}, with HTTP 200.
      if (data && data.error) return offline(`feed: ${data.error}`, date || month);
      if (!Array.isArray(data?.units) || !data.units.some((u) => isVilla(u.id))) {
        return offline("feed returned no villa rows", date || month);
      }
      return fromFeed(data);
    } catch (err) {
      last = `bad JSON (${err.message})`;
    }
  }
  return offline(`feed ${last}`, date || month);
}
