// Build stamp 2026-09-15: Vercel keys a function's cached bundle on this entry
// file, so shared-module fixes only ship when this file changes too.
import handleDaily from "../../daily-api.mjs";

// Original path for the daily report, kept so existing links keep working.
// /api/daily/day is what the page calls; both share one handler.
export const maxDuration = 30;
export default handleDaily;
