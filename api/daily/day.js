// Build stamp 2026-09-15: Vercel keys a function's cached bundle on this entry
// file, so shared-module fixes only ship when this file changes too.
import handleDaily from "../../daily-api.mjs";

// The day's labour snapshot plus the month's series. This path exists because a
// cached build of api/daily/report.js kept answering without ?date=/?month=
// support long after the source changed; a new filename gets a fresh bundle.
// report.js still works and shares this exact handler.
export const maxDuration = 30;
export default handleDaily;
