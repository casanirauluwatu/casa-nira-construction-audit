// Build stamp 2026-11-03: Vercel keys a function's cached bundle on this entry
// file, so shared-module fixes only ship when this file changes too.
import { handleBatch } from "../../batch-core.mjs";

// Batch export for the Client Report tab: forwards to the batch-export Apps
// Script (BATCH_FEED). GET ?action=config reads the batch sheet; POST
// {action:"start"} creates the run folder in Drive; POST {action:"unit",…}
// renders one unit's PDF into it. Rendering a photo-heavy unit takes tens of
// seconds, hence the long budget.
export const maxDuration = 60;

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
    body,
  });
  res.setHeader("cache-control", "no-store");
  res.status(out.status).json(out.data);
}
