// Zero-dependency server for the Casa Nira report page (Construction Audit +
// Laporan Harian tabs). Serves everything in public/ plus two JSON endpoints:
// /api/construction/audit and /api/daily/report. Construction data moves
// ~weekly and labour once a day, so both are cached in memory (CACHE_TTL_MIN,
// default 360 = 6h); `?fresh=1` (the Refresh button) recomputes. No auth.
// Node 18+ only.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import { auditAll, feedsFromEnv } from "./audit-core.mjs";
import { getDaily, getPhotos } from "./daily-core.mjs";
import { getWeather } from "./weather-core.mjs";

const PORT = Number(process.env.PORT || 3000);
const STALE_DAYS = Number(process.env.STALE_DAYS || 10);
const TTL_MS = Number(process.env.CACHE_TTL_MIN || 360) * 60000;
const __dir = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dir, "public");
const CACHE = new Map(); // key -> { at, body }

const TYPES = {
  ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".json": "application/json", ".css": "text/css", ".js": "text/javascript",
};

// Serve a cached JSON endpoint. compute() runs on miss (or when ?fresh is set).
// ttlFor(data) may shorten the hold for an answer that is still changing.
async function serveJson(res, key, fresh, compute, ttlFor = null) {
  if (!fresh) {
    const hit = CACHE.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": `public, max-age=${Math.floor(hit.ttl / 1000)}`, "x-cache": "HIT" }).end(hit.body);
      return;
    }
  }
  const data = await compute();
  const ttl = ttlFor ? ttlFor(data) : TTL_MS;
  const body = JSON.stringify(data);
  if (!fresh) CACHE.set(key, { at: Date.now(), body, ttl });
  res.writeHead(200, {
    "content-type": "application/json",
    "cache-control": fresh ? "no-store" : `public, max-age=${Math.floor(ttl / 1000)}`,
    "x-cache": fresh ? "BYPASS" : "MISS",
  }).end(body);
}

// Site time is WITA (UTC+8, no DST) — the clock the Drive day folders are named in.
const todayWita = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

// Photos keep arriving through the day, and an empty answer usually means "not
// uploaded yet" — hold those for a minute, not six hours.
function photoTtl(date, data) {
  const shots = Object.values(data?.counts || {}).reduce((a, b) => a + (b || 0), 0);
  return data?.ok && shots > 0 && date < todayWita() ? TTL_MS : 60000;
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }
  const fresh = url.searchParams.has("fresh");

  if (url.pathname === "/api/construction/audit") {
    const feeds = feedsFromEnv();
    if (!feeds || !Object.keys(feeds).length) {
      res.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" }).end('{"error":"CONSTRUCTION_FEEDS not set"}');
      return;
    }
    await serveJson(res, "audit", fresh, () => auditAll(feeds, { staleDays: STALE_DAYS }));
    return;
  }
  if (url.pathname === "/api/daily/day" || url.pathname === "/api/daily/report") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") || "") ? url.searchParams.get("date") : null;
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : null;
    await serveJson(res, `daily:${date || month || "today"}`, fresh, () => getDaily({ date, month, fresh }));
    return;
  }

  if (url.pathname === "/api/daily/photos") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") || "") ? url.searchParams.get("date") : null;
    if (!date) { res.writeHead(400, { "content-type": "application/json" }).end('{"error":"date required"}'); return; }
    await serveJson(res, `photos:${date}`, fresh, () => getPhotos({ date, fresh }), (d) => photoTtl(date, d));
    return;
  }

  if (url.pathname === "/api/weather") {
    await serveJson(res, "weather", fresh, getWeather);
    return;
  }

  // Static files out of public/. Legacy path kept so old links still resolve.
  let rel = url.pathname === "/" || url.pathname === "/construction-audit.html" ? "index.html" : url.pathname.slice(1);
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
server.listen(PORT, () => console.log(`Casa Nira report → http://localhost:${PORT}/  (cache ${TTL_MS / 60000}m)`));
