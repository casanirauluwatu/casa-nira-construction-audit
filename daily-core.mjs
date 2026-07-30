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

const TIMEOUT_MS = 15000;
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
    ...data,           // date, sheet, totals, flags from the feed
    units,
    other: data.other || [],
    live: true,
  };
}

export async function getDaily() {
  const feed = process.env.DAILY_FEED;
  if (!feed) return { ...DAILY, live: false };
  try {
    const res = await fetch(feed, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ...DAILY, live: false, note: `feed HTTP ${res.status}` };
    const data = await res.json();
    // The Apps Script reports its own failures as {error}, with HTTP 200.
    if (data && data.error) return { ...DAILY, live: false, note: `feed: ${data.error}` };
    if (!Array.isArray(data?.units) || !data.units.some((u) => isVilla(u.id))) {
      return { ...DAILY, live: false, note: "feed returned no villa rows" };
    }
    return fromFeed(data);
  } catch (err) {
    const why = err.name === "TimeoutError" ? "timeout" : err.message || "fetch failed";
    return { ...DAILY, live: false, note: `feed ${why}` };
  }
}
