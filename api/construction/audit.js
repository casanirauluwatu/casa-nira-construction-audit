import { auditAll, feedsFromEnv } from "../../audit-core.mjs";

// Vercel serverless function. Reads CONSTRUCTION_FEEDS and returns the audit.
// Construction data moves ~weekly, so responses are cached at the Vercel edge
// (s-maxage) — most page opens are served from cache without re-fetching the 19
// feeds. `?fresh=1` (the page's Refresh button) bypasses the cache.
export const maxDuration = 30;

export default async function handler(req, res) {
  const feeds = feedsFromEnv();
  if (!feeds || !Object.keys(feeds).length) {
    res.setHeader("cache-control", "no-store");
    res.status(500).json({ error: "CONSTRUCTION_FEEDS not set" });
    return;
  }
  const fresh = req.query && req.query.fresh != null;
  const data = await auditAll(feeds, { staleDays: Number(process.env.STALE_DAYS || 10) });
  res.setHeader(
    "cache-control",
    fresh ? "no-store" : "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400"
  );
  res.status(200).json(data);
}
