import handleDaily from "../../daily-api.mjs";

// Original path for the daily report, kept so existing links keep working.
// /api/daily/day is what the page calls; both share one handler.
export const maxDuration = 30;
export default handleDaily;
