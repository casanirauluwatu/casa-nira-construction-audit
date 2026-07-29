// Zero-dependency audit core: fetch each villa's construction "Time Schedule"
// feed, parse the S-curve, and compute the per-unit audit row. Shared by the
// CLI (audit-cli.mjs) and the standalone server (server.mjs). Node 18+ only.

const TIMEOUT_MS = 15000;

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
function num(v) {
  let s = clean(v);
  if (s === "" || s === "-" || /^#?N\/?A$/i.test(s)) return null;
  const neg = /^\(/.test(s);
  s = s.replace(/%/g, "").replace(/,/g, "").replace(/[()]/g, "");
  const f = parseFloat(s);
  return Number.isNaN(f) ? null : neg ? -f : f;
}
const isDate = (s) => /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(clean(s));
const MONI = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function parseWk(lbl) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(clean(lbl));
  if (!m) return null;
  let y = +m[3];
  if (y < 100) y += 2000;
  const mo = MONI[m[2].toLowerCase()];
  if (mo == null) return null;
  return new Date(Date.UTC(y, mo, +m[1]));
}
const fmtSheetDate = (d) => `${d.getUTCDate()}-${MON[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
function weekEndOf(lbl) {
  const s = parseWk(lbl);
  if (!s) return null;
  const e = new Date(s.getTime());
  e.setUTCDate(e.getUTCDate() + 6);
  return e;
}
const daysBetween = (a, b) => Math.round((a.getTime() - b.getTime()) / 86400000);

function parseSchedule(rows) {
  const planned = rows.find((r) => clean(r[0]) === "B2");
  const actual = rows.find((r) => clean(r[0]) === "C2");
  const dateRow = rows.find((r) => /URAIAN/i.test(clean(r[1])));
  if (!planned || !actual || !dateRow) return null;
  const cols = [];
  for (let c = 0; c < dateRow.length; c++) if (isDate(dateRow[c])) cols.push(c);
  if (!cols.length) return null;
  const weeks = cols.map((c) => ({ date: clean(dateRow[c]), planned: num(planned[c]) ?? 0, actual: num(actual[c]) }));
  let nowIndex = -1;
  weeks.forEach((w, i) => { if (w.actual != null) nowIndex = i; });
  if (nowIndex < 0) nowIndex = 0;
  return { weeks, nowIndex };
}

async function fetchFeed(url, tries = 3) {
  let last = "fetch failed";
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status >= 500) last = `HTTP ${res.status}`;
      else if (!res.ok) return { error: `HTTP ${res.status}` };
      else return { data: await res.json() };
    } catch (err) {
      last = err.name === "TimeoutError" ? "timeout" : err.message || "fetch failed";
    }
    if (i < tries) await new Promise((r) => setTimeout(r, 500 * i));
  }
  return { error: last };
}

function computeRow(unit, data, now, trailWeeks) {
  const rows = data?.tabs?.schedule?.rows;
  if (!Array.isArray(rows)) return { unit, ok: false, note: "no schedule rows" };
  const p = parseSchedule(rows);
  if (!p) return { unit, ok: false, note: "schedule unparseable" };
  const weeks = p.weeks;
  const ni = p.nowIndex;
  const w = weeks[ni];
  const we = weekEndOf(w.date);
  const actual = w.actual ?? 0;
  const planned = w.planned;

  const idxs = [];
  for (let i = ni; i >= 0 && idxs.length < 4; i--) if (weeks[i].actual != null) idxs.push(i);
  const val = (k) => (idxs[k] != null ? weeks[idxs[k]].actual : null);
  const delta = (a, b) => {
    const x = val(a);
    const y = val(b);
    return x != null && y != null ? x - y : null;
  };
  const d0 = delta(0, 1) ?? (idxs.length === 1 ? val(0) : null);

  let di = weeks.findIndex((x) => x.planned >= 99.5);
  if (di < 0) di = weeks.length - 1;
  const twe = weekEndOf(weeks[di].date);
  const targetInWeeks = twe ? Math.round(daysBetween(twe, now) / 7) : null;

  let startIdx = Math.max(0, ni - trailWeeks);
  while (startIdx < ni && weeks[startIdx].actual == null) startIdx++;
  const span = ni - startIdx;
  const pace = span > 0 ? (actual - (weeks[startIdx].actual ?? 0)) / span : 0;
  let projDate = null;
  let projInWeeks = null;
  if (actual >= 100) projDate = "done";
  else if (pace > 0) {
    const wk = Math.ceil((100 - actual) / pace);
    if (wk <= 260 && we) {
      const pj = new Date(we.getTime());
      pj.setUTCDate(pj.getUTCDate() + wk * 7);
      projDate = fmtSheetDate(pj);
      projInWeeks = Math.round(daysBetween(pj, now) / 7);
    } else projDate = ">5y";
  }

  const reqPace = actual >= 100 ? 0 : targetInWeeks && targetInWeeks > 0 ? (100 - actual) / targetInWeeks : null;

  return {
    unit,
    ok: true,
    week: `${ni + 1}/${weeks.length}`,
    lastReported: we ? fmtSheetDate(we) : w.date,
    lastAgeDays: we ? daysBetween(now, we) : null,
    actual,
    planned,
    deviation: actual - planned,
    d0,
    d1: delta(1, 2),
    d2: delta(2, 3),
    reqPace,
    target: twe ? fmtSheetDate(twe) : weeks[di].date,
    targetInWeeks,
    projDate,
    projInWeeks,
  };
}

/** Fetch + compute every villa in the feeds map. Returns the payload the
 *  report page and CLI both render. */
export async function auditAll(feeds, { staleDays = 10, trailWeeks = 6 } = {}) {
  const now = new Date();
  const units = Object.keys(feeds);
  const rows = await Promise.all(
    units.map(async (u) => {
      const { data, error } = await fetchFeed(feeds[u]);
      if (error) return { unit: u, ok: false, note: error };
      try {
        return computeRow(u, data, now, trailWeeks);
      } catch (e) {
        return { unit: u, ok: false, note: `parse error: ${e.message}` };
      }
    })
  );
  return { generatedAt: now.toISOString(), staleDays, trailWeeks, rows };
}

export function feedsFromEnv() {
  const raw = process.env.CONSTRUCTION_FEEDS;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
