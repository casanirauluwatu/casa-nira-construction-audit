import { getPhotos } from "../../daily-core.mjs";

// Site photos for one day, from the Rekap Drive folder via the Apps Script.
// Fetched separately from the labour report so a slow Drive lookup never holds
// up the numbers; the page fills the cards in when this arrives.
export const maxDuration = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Site time is WITA (UTC+8, no DST) — the same clock the Drive folders are named in.
const todayWita = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

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
  // Only a finished day that already has photos may be held for hours. Today is
  // still being uploaded to, and an empty day usually means "not yet" — pinning
  // either at the edge would hide a photo added minutes later.
  const shots = Object.values(data.counts || {}).reduce((a, b) => a + (b || 0), 0);
  const settled = data.ok && shots > 0 && date < todayWita();
  res.setHeader(
    "cache-control",
    !fresh && settled
      ? "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400"
      : "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
  );
  res.status(200).json(data);
}
