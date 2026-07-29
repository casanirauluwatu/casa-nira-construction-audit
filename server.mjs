// Zero-dependency server for the construction audit report. Serves the report
// page and a token-gated /api/construction/audit endpoint that pulls every
// villa's feed live — so the page's Refresh button works standalone, without
// the Next dashboard. Node 18+ only.
//
//   CONSTRUCTION_FEEDS='{"C3":"https://…/exec",…}' AUDIT_TOKEN=secret npm run serve
//   → open http://localhost:3000/?token=secret
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auditAll, feedsFromEnv } from "./audit-core.mjs";

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.AUDIT_TOKEN || "";
const STALE_DAYS = Number(process.env.STALE_DAYS || 10);
const __dir = dirname(fileURLToPath(import.meta.url));

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }

  if (url.pathname === "/api/construction/audit") {
    if (!TOKEN || url.searchParams.get("token") !== TOKEN) {
      res.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
      return;
    }
    const feeds = feedsFromEnv();
    if (!feeds) {
      res.writeHead(500, { "content-type": "application/json" }).end('{"error":"CONSTRUCTION_FEEDS not set"}');
      return;
    }
    const data = await auditAll(feeds, { staleDays: STALE_DAYS });
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(data));
    return;
  }

  if (url.pathname === "/" || url.pathname === "/construction-audit.html") {
    try {
      const html = await readFile(join(__dir, "public", "construction-audit.html"), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
    } catch {
      res.writeHead(500).end("report page missing");
    }
    return;
  }

  res.writeHead(404).end("not found");
});

server.listen(PORT, () => {
  console.log(`Construction audit → http://localhost:${PORT}/?token=…  (token ${TOKEN ? "set" : "MISSING — set AUDIT_TOKEN"})`);
});
