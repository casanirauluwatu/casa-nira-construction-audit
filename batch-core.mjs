// Proxy to the batch-export Apps Script web app (apps-script/batch-export.gs).
// BATCH_FEED holds its /exec URL — kept server-side like DAILY_FEED and the
// construction feeds, because an /exec URL is effectively a credential: this
// one can write PDFs into the owner's Drive.
//
// Nothing is cached: every call is a command (read the batch sheet, create the
// run folder, render one unit), not a data pull.
//
// Shared by the Node server and the Vercel function. Node 18+, zero deps.

// Rendering one unit fetches each photo from Drive and builds a Doc — ~1s per
// photo — so this waits far longer than the data proxies do. The serverless
// function's own maxDuration must stay above this.
const TIMEOUT_MS = 55000;

export async function callBatchFeed({ method = "GET", search = "", body = null } = {}) {
  const base = process.env.BATCH_FEED;
  if (!base) {
    return {
      status: 500,
      data: { ok: false, error: "BATCH_FEED not set — deploy apps-script/batch-export.gs as a web app and set BATCH_FEED to its /exec URL." },
    };
  }
  const url = base + (search ? (base.includes("?") ? "&" : "?") + search : "");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // Apps Script answers a POST with a 302 to a one-time result URL; the
    // doPost has already run by then, so following the redirect (as a GET,
    // per fetch semantics) is how the response is meant to be read.
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: ctl.signal,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try {
      return { status: 200, data: JSON.parse(text) };
    } catch {
      // An HTML answer is Apps Script's own error/login page — the URL is
      // wrong, the deployment is not "Anyone", or the script threw before
      // doPost could reply.
      return { status: 502, data: { ok: false, error: `batch feed answered non-JSON (HTTP ${res.status}) — check the BATCH_FEED deployment` } };
    }
  } catch (e) {
    const timedOut = e && (e.name === "AbortError" || e.name === "TimeoutError");
    return {
      status: 504,
      data: {
        ok: false,
        // Apps Script keeps executing after the client gives up, so a
        // timed-out unit render usually still lands its PDF in the folder.
        error: timedOut
          ? "batch feed timeout — the PDF may still appear in the Drive folder"
          : "batch feed unreachable: " + (e && e.message ? e.message : String(e)),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// One entry point for both servers: GET forwards ?action=…, POST forwards the
// JSON body (which carries its own action).
export async function handleBatch({ method, action, body }) {
  if (method === "POST") {
    if (!body || typeof body !== "object") {
      return { status: 400, data: { ok: false, error: "POST a JSON body with an \"action\"" } };
    }
    return callBatchFeed({ method: "POST", body });
  }
  return callBatchFeed({ search: "action=" + encodeURIComponent(action || "") });
}
