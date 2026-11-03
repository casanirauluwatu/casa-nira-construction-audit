// Build stamp 2026-11-03: Vercel keys a function's cached bundle on this entry
// file, so shared-module fixes only ship when this file changes too.
import { renderPdf } from "../../render-core.mjs";

// HTML → PDF for the Client Report batch export, rendered by headless
// Chromium — the same engine behind the browser's own "Print for Owner", so a
// batch PDF is EXACTLY the printed report. The dashboard posts the unit
// section's HTML (with the page's full stylesheet inline); this prints it
// against the print media rules (@page A4, 10mm) and answers the PDF bytes.
//
// This function is the repo's one exception to "zero dependencies":
// puppeteer-core + @sparticuz/chromium, pinned in package.json.
export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST {html} only" });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const html = body && typeof body.html === "string" ? body.html : null;
  if (!html || html.length > 2e6) {
    res.status(400).json({ ok: false, error: "html required (JSON {html}, ≤ 2 MB)" });
    return;
  }
  const out = await renderPdf(html);
  res.setHeader("cache-control", "no-store");
  if (!out.ok) {
    res.status(500).json(out);
    return;
  }
  if (out.pdf.length > 4400000) {
    // A Vercel response caps at ~4.5 MB — name the cause instead of letting
    // the platform cut the body off mid-transfer.
    res.status(413).json({ ok: false, error: `PDF is ${(out.pdf.length / 1e6).toFixed(1)} MB — too large for the proxy. Fewer photos in the window, or print this unit manually.` });
    return;
  }
  res.setHeader("content-type", "application/pdf");
  res.status(200).send(Buffer.from(out.pdf));
}
