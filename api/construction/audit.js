import { auditAll, feedsFromEnv } from "../../audit-core.mjs";

// Vercel serverless function. Reads CONSTRUCTION_FEEDS from the project's
// environment and returns the whole-complex audit as JSON. No auth — the page
// calls this directly. Increase maxDuration if 19 feeds are slow to fetch.
export const maxDuration = 30;

export default async function handler(req, res) {
  const feeds = feedsFromEnv();
  if (!feeds || !Object.keys(feeds).length) {
    res.status(500).json({ error: "CONSTRUCTION_FEEDS not set" });
    return;
  }
  const data = await auditAll(feeds, { staleDays: Number(process.env.STALE_DAYS || 10) });
  res.setHeader("cache-control", "no-store");
  res.status(200).json(data);
}
