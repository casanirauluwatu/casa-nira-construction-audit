// Build stamp 2026-11-03: Vercel keys a function's cached bundle on this entry
// file, so shared-module fixes only ship when this file changes too.
import { handleBatch } from "../../batch-core.mjs";

// Batch export for the Client Report tab: forwards to the batch-export Apps
// Script (BATCH_FEED). GET ?action=config&date=… reads the batch sheet rows
// containing that day; POST {action:"unit",…} renders one unit's PDF and
// answers it base64 for the browser to zip and download. Rendering a
// photo-heavy unit takes tens of seconds, hence the long budget.
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  let body = null;
  if (req.method === "POST") {
    body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = null; }
    }
  }
  const q = req.query || {};
  const out = await handleBatch({
    method: req.method,
    action: typeof q.action === "string" ? q.action : "",
    date: typeof q.date === "string" && DATE_RE.test(q.date) ? q.date : "",
    body,
  });
  res.setHeader("cache-control", "no-store");
  res.status(out.status).json(out.data);
}
