// Daily report (laporan harian) data source. Serves the bundled labour snapshot
// unless DAILY_FEED points at an Apps Script /exec URL returning the same shape,
// in which case that wins. Shared by the Node server and the Vercel function.
// Node 18+ only, zero dependencies.
import { DAILY } from "./daily-data.mjs";

const TIMEOUT_MS = 15000;

export async function getDaily() {
  const feed = process.env.DAILY_FEED;
  if (!feed) return { ...DAILY, live: false };
  try {
    const res = await fetch(feed, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ...DAILY, live: false, note: `feed HTTP ${res.status}` };
    const data = await res.json();
    if (!Array.isArray(data?.units) || !data.units.length) {
      return { ...DAILY, live: false, note: "feed returned no units" };
    }
    return { ...data, live: true };
  } catch (err) {
    const why = err.name === "TimeoutError" ? "timeout" : err.message || "fetch failed";
    return { ...DAILY, live: false, note: `feed ${why}` };
  }
}
