import { getDaily } from "../../daily-core.mjs";

// Vercel serverless function for the Laporan Harian tab: the day's labour
// snapshot per villa, plus the month's day-by-day series for the manpower chart.
// Cached at the edge like the audit — labour changes once a day at most, and each
// requested date caches separately. `?fresh=1` (the page's Refresh button)
// bypasses this cache and the Apps Script's own.
export const maxDuration = 30;

// Stamped into every response. Vercel can serve current static files alongside a
// stale function bundle, which looks like the page ignoring the date picker —
// this says which function build is actually answering.
const API_VERSION = "v2-date-month";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function handler(req, res) {
  const q = req.query || {};
  const fresh = q.fresh != null;
  const date = typeof q.date === "string" && DATE_RE.test(q.date) ? q.date : null;
  const month = typeof q.month === "string" && MONTH_RE.test(q.month) ? q.month : null;
  if ((q.date && !date) || (q.month && !month)) {
    res.setHeader("cache-control", "no-store");
    res.status(400).json({ error: "bad date — use YYYY-MM-DD or YYYY-MM" });
    return;
  }
  const data = await getDaily({ date, month, fresh });
  res.setHeader(
    "cache-control",
    fresh ? "no-store" : "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400"
  );
  res.status(200).json({ ...data, apiVersion: API_VERSION });
}
