import { getDaily } from "../../daily-core.mjs";

// Vercel serverless function for the Laporan Harian tab: the day's labour
// snapshot per villa. Cached at the edge like the audit — labour changes once a
// day at most. `?fresh=1` (the page's Refresh button) bypasses the cache.
export const maxDuration = 15;

export default async function handler(req, res) {
  const fresh = req.query && req.query.fresh != null;
  const data = await getDaily();
  res.setHeader(
    "cache-control",
    fresh ? "no-store" : "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400"
  );
  res.status(200).json(data);
}
