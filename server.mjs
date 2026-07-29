// Zero-dependency server for the construction audit report. Serves the report
// page and /api/construction/audit. Construction data moves ~weekly, so audit
// results are cached in memory (CACHE_TTL_MIN, default 360 = 6h); `?fresh=1`
// (the Refresh button) recomputes. No auth. Node 18+ only.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auditAll, feedsFromEnv } from "./audit-core.mjs";

const PORT = Number(process.env.PORT || 3000);
const STALE_DAYS = Number(process.env.STALE_DAYS || 10);
const TTL_MS = Number(process.env.CACHE_TTL_MIN || 360) * 60000;
const __dir = dirname(fileURLToPath(import.meta.url));
let CACHE = null; // { at, body }

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }
  if (url.pathname === "/api/construction/audit") {
    const feeds = feedsFromEnv();
    if (!feeds || !Object.keys(feeds).length) {
      res.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" }).end('{"error":"CONSTRUCTION_FEEDS not set"}');
      return;
    }
    const fresh = url.searchParams.has("fresh");
    if (!fresh && CACHE && Date.now() - CACHE.at < TTL_MS) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": `public, max-age=${Math.floor(TTL_MS / 1000)}`, "x-cache": "HIT" }).end(CACHE.body);
      return;
    }
    const body = JSON.stringify(await auditAll(feeds, { staleDays: STALE_DAYS }));
    if (!fresh) CACHE = { at: Date.now(), body };
    res.writeHead(200, { "content-type": "application/json", "cache-control": fresh ? "no-store" : `public, max-age=${Math.floor(TTL_MS / 1000)}`, "x-cache": fresh ? "BYPASS" : "MISS" }).end(body);
    return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/construction-audit.html") {
    try {
      const html = await readFile(join(__dir, "public", "index.html"), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
    } catch {
      res.writeHead(500).end("report page missing");
    }
    return;
  }
  res.writeHead(404).end("not found");
});
server.listen(PORT, () => console.log(`Construction audit → http://localhost:${PORT}/  (cache ${TTL_MS / 60000}m)`));
