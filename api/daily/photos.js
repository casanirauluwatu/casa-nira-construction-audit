import { getPhotos } from "../../daily-core.mjs";

// Site photos for one day, from the Rekap Drive folder via the Apps Script.
// Fetched separately from the labour report so a slow Drive lookup never holds
// up the numbers; the page fills the cards in when this arrives.
export const maxDuration = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  const q = req.query || {};
  const fresh = q.fresh != null;
  const date = typeof q.date === "string" && DATE_RE.test(q.date) ? q.date : null;
  if (!date) {
    res.setHeader("cache-control", "no-store");
    res.status(400).json({ error: "date required — YYYY-MM-DD" });
    return;
  }
  const data = await getPhotos({ date, fresh });
  res.setHeader(
    "cache-control",
    fresh || !data.ok ? "public, max-age=0, s-maxage=60" : "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400"
  );
  res.status(200).json(data);
}
