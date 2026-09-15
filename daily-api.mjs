import { getDaily } from "./daily-core.mjs";

// Shared handler for the Laporan Harian endpoints. Lives outside api/ so it is
// not itself routed, and so both endpoint files stay one line each.
//
// Stamped into every response: Vercel can serve current static files while
// reusing a cached build of a function, which presents as the page ignoring the
// date picker. apiVersion says which function build actually answered.
// v3: nothing in the API changed — the bump (with the entry-file stamps in
// api/) forces Vercel to rebuild the function bundles. Prod was caught serving
// a bundle frozen at 2f88702, with the pre-27d89c9 daily-core inside: its
// spurious-abort bug read as random "feed timeout", which dropped the page to
// the snapshot and disabled the date pickers while the feed itself was fine.
export const API_VERSION = "v3-fn-rebuild";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function handleDaily(req, res) {
  const q = req.query || {};
  const fresh = q.fresh != null;
  const date = typeof q.date === "string" && DATE_RE.test(q.date) ? q.date : null;
  const month = typeof q.month === "string" && MONTH_RE.test(q.month) ? q.month : null;
  if ((q.date && !date) || (q.month && !month)) {
    res.setHeader("cache-control", "no-store");
    res.status(400).json({ error: "bad date — use YYYY-MM-DD or YYYY-MM", apiVersion: API_VERSION });
    return;
  }
  const data = await getDaily({ date, month, fresh });
  // Only cache a real answer. A snapshot fallback cached for 6h would pin the
  // wrong data at the edge long after the feed recovered.
  const cache = fresh ? "no-store"
    : data.live ? "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400"
    : "public, max-age=0, s-maxage=60";
  res.setHeader("cache-control", cache);
  res.status(200).json({ ...data, apiVersion: API_VERSION });
}
