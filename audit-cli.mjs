#!/usr/bin/env node
// CLI for the construction feed audit. Reads CONSTRUCTION_FEEDS (a JSON map of
// villa -> feed URL) and prints a table; pass --html [path] to also write a
// styled static report (default docs/construction-audit.html). Node 18+ only.
//
//   CONSTRUCTION_FEEDS='{"C3":"https://…/exec",…}' node audit-cli.mjs
//   node audit-cli.mjs 10 6           # stale-days, trailing-weeks
//   node audit-cli.mjs --html
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { auditAll, feedsFromEnv } from "./audit-core.mjs";

const argv = process.argv.slice(2);
const htmlFlag = argv.indexOf("--html");
const HTML_PATH = htmlFlag >= 0 ? (argv[htmlFlag + 1] && !argv[htmlFlag + 1].startsWith("-") ? argv[htmlFlag + 1] : "docs/construction-audit.html") : null;
const nums = argv.filter((a) => /^\d+$/.test(a));
const STALE_DAYS = Number(nums[0] || 10);
const TRAIL_WEEKS = Number(nums[1] || 6);

const sgn = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function statusOf(r, staleDays) {
  if (!r.ok) return "unreachable";
  if ((r.lastAgeDays ?? 0) > staleDays) return "stale";
  if (r.actual != null && r.actual >= 100) return "complete";
  if (r.targetInWeeks == null || r.targetInWeeks <= 0) return "behind";
  const slip = (r.projInWeeks == null ? 999 : r.projInWeeks) - r.targetInWeeks;
  return slip <= 2 ? "on-track" : "behind";
}

function printTable(data) {
  const pad = (s, n) => String(s).padEnd(n);
  const { rows, staleDays } = data;
  console.log(`Construction feed audit — ${data.generatedAt.slice(0, 10)} · ${rows.length} feed(s) · stale ${staleDays}d\n`);
  console.log(pad("UNIT", 6) + pad("WEEK", 9) + pad("LAST REP", 13) + pad("ACT/PLAN", 20) + pad("ΔTHIS", 8) + pad("Δ-1W", 8) + pad("Δ-2W", 8) + pad("REQ Δ/WK", 10) + pad("TARGET", 22) + pad("PROJECTED", 22) + "STATUS");
  console.log("-".repeat(150));
  for (const r of rows) {
    if (!r.ok) { console.log(pad(r.unit, 6) + pad(r.note || "unreachable", 40) + "UNREACHABLE"); continue; }
    const ap = `${r.actual.toFixed(1)}/${r.planned.toFixed(1)} (${sgn(r.deviation)})`;
    const tw = r.targetInWeeks;
    const target = `${r.target}${tw == null ? "" : tw < 0 ? ` (${-tw}w od)` : ` (+${tw}w)`}`;
    const proj = r.projDate == null ? "—" : r.projDate + (r.projInWeeks == null ? "" : ` (+${r.projInWeeks}w)`);
    const req = r.reqPace == null ? "past due" : `${r.reqPace.toFixed(1)}/wk`;
    console.log(pad(r.unit, 6) + pad(r.week, 9) + pad(r.lastReported, 13) + pad(ap, 20) + pad(sgn(r.d0), 8) + pad(sgn(r.d1), 8) + pad(sgn(r.d2), 8) + pad(req, 10) + pad(target, 22) + pad(proj, 22) + statusOf(r, staleDays));
  }
  const okA = rows.filter((r) => r.ok);
  const overall = okA.length ? okA.reduce((s, r) => s + r.actual, 0) / okA.length : 0;
  const okD = rows.filter((r) => r.ok && r.d0 != null);
  const avgD = okD.length ? okD.reduce((s, r) => s + r.d0, 0) / okD.length : 0;
  console.log(`\nWhole complex: ${overall.toFixed(1)}% complete (avg of ${okA.length}) · avg Δ this week ${sgn(avgD)}pp`);
}

function renderHtml(data) {
  const { rows, staleDays } = data;
  const gen = data.generatedAt.slice(0, 10);
  const okA = rows.filter((r) => r.ok);
  const overall = okA.length ? okA.reduce((s, r) => s + r.actual, 0) / okA.length : 0;
  const okD = rows.filter((r) => r.ok && r.d0 != null);
  const avgD = okD.length ? okD.reduce((s, r) => s + r.d0, 0) / okD.length : 0;
  const onTrack = rows.filter((r) => ["on-track", "complete"].includes(statusOf(r, staleDays))).length;
  const BADGE = { "on-track": "On track", behind: "Behind", stale: "Stale", unreachable: "Unreachable", complete: "Complete" };
  const card = (n, l, cls = "") => `<div class="card"><div class="card-n ${cls}">${n}</div><div class="card-l">${l}</div></div>`;
  const dcell = (v) => (v == null ? '<td class="mono dim">—</td>' : `<td class="mono ${v >= 0 ? "pos" : "neg"}">${sgn(v)}</td>`);
  const body = rows.map((r) => {
    const st = statusOf(r, staleDays);
    if (!r.ok) return `<tr class="row-down"><td class="u">${esc(r.unit)}</td><td colspan="11" class="down-note">${esc(r.note || "unreachable")}</td><td><span class="badge unreachable">Unreachable</span></td></tr>`;
    const reqCls = r.reqPace == null ? "req-risk" : r.d0 != null && r.reqPace > r.d0 ? "req-risk" : "req-ok";
    const reqTxt = r.reqPace == null ? "past due" : r.reqPace.toFixed(1);
    const tw = r.targetInWeeks, tSub = tw == null ? "" : tw < 0 ? `${-tw}w overdue` : `+${tw}w`;
    const pMain = r.projDate == null ? "—" : r.projDate, pSub = r.projInWeeks == null ? "" : `+${r.projInWeeks}w`;
    return `<tr class="row-${st}"><td class="u">${esc(r.unit)}</td><td class="mono dim">${r.week}</td><td class="mono">${r.lastReported}</td><td class="mono">${r.actual.toFixed(1)}</td><td class="mono dim">${r.planned.toFixed(1)}</td><td class="mono ${r.deviation < 0 ? "neg" : "pos"}">${sgn(r.deviation)}</td>${dcell(r.d0)}${dcell(r.d1)}${dcell(r.d2)}<td class="mono ${reqCls}">${reqTxt}</td><td>${r.target}${tSub ? ` <span class="sub">${tSub}</span>` : ""}</td><td>${pMain}${pSub ? ` <span class="sub">${pSub}</span>` : ""}</td><td><span class="badge ${st}">${BADGE[st]}</span></td></tr>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Casa Nira — Construction Feed Audit</title><style>
:root{color-scheme:light;--bg:#f5f2ea;--card:#fffdf8;--ink:#2b2620;--muted:#8f887c;--line:#e6dfd1;--olive:#6f7043;--gold:#a9822f;--green:#3f7d4f;--red:#b4472e;--amber:#b5842c;}
*{box-sizing:border-box;}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
.wrap{max-width:1180px;margin:0 auto;padding:40px 24px 64px;}.eyebrow{font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);}
h1{margin:10px 0 6px;font-size:30px;font-weight:600;}.sub-h{color:var(--muted);font-size:13.5px;margin:0;}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:22px 0 26px;}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;}.card-n{font-size:26px;font-weight:600;line-height:1;}.card-l{margin-top:6px;font:600 10.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card);}table{border-collapse:collapse;width:100%;min-width:1080px;font-size:13.5px;}
thead th{position:sticky;top:0;background:#efe9dd;color:#5f594e;font:600 10.5px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;text-align:right;padding:12px;border-bottom:1px solid var(--line);white-space:nowrap;}thead th.l{text-align:left;}
tbody td{padding:11px 12px;text-align:right;border-bottom:1px solid #f0eadd;white-space:nowrap;}tbody tr:last-child td{border-bottom:none;}td.u{text-align:left;font-weight:600;}.mono{font-family:ui-monospace,Menlo,monospace;}.dim{color:var(--muted);}.pos{color:var(--green);}.neg{color:var(--red);}.req-ok{color:var(--green);}.req-risk{color:var(--red);font-weight:600;}.sub{font:600 10.5px ui-monospace,Menlo,monospace;color:var(--muted);}
.badge{display:inline-block;padding:3px 9px;border-radius:999px;font:600 11px/1.4 -apple-system,sans-serif;}.badge.on-track,.badge.complete{background:#e7f1e9;color:var(--green);}.badge.behind{background:#f7e8e1;color:var(--red);}.badge.stale{background:#f6ecd6;color:var(--amber);}.badge.unreachable{background:#eee;color:#777;}tr.row-stale{background:#fdf7ea;}tr.row-down{background:#faf3f0;}.down-note{text-align:left;color:var(--red);font-family:ui-monospace,Menlo,monospace;}
</style></head><body><div class="wrap"><div class="eyebrow">Casa Nira Uluwatu · Build Progress</div><h1>Construction Feed Audit</h1><p class="sub-h">Generated ${gen} · ${rows.length} villa feeds · stale ${staleDays}d</p>
<div class="cards">${card(overall.toFixed(1) + "%", "Overall complete")}${card(sgn(avgD), "Avg Δ this week", avgD >= 0 ? "pos" : "neg")}${card(rows.length, "Feeds")}${card(onTrack, "On track", "pos")}</div>
<div class="tbl-wrap"><table><thead><tr><th class="l">Unit</th><th>Week</th><th>Last reported</th><th>Actual %</th><th>Planned %</th><th>Behind (pp)</th><th>Δ this wk</th><th>Δ −1w</th><th>Δ −2w</th><th>Req Δ/wk</th><th class="l">Target delivery</th><th class="l">Projected (recent pace)</th><th class="l">Status</th></tr></thead><tbody>
${body}
</tbody></table></div></div></body></html>`;
}

const feeds = feedsFromEnv();
if (!feeds || !Object.keys(feeds).length) {
  console.error("CONSTRUCTION_FEEDS is not set (a JSON map of villa -> feed URL).\nSee .env.example.");
  process.exit(2);
}
const data = await auditAll(feeds, { staleDays: STALE_DAYS, trailWeeks: TRAIL_WEEKS });
printTable(data);
if (HTML_PATH) {
  try { mkdirSync(dirname(HTML_PATH), { recursive: true }); } catch { /* exists */ }
  writeFileSync(HTML_PATH, renderHtml(data));
  console.log(`\nHTML report written to ${HTML_PATH}`);
}
