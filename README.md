# Casa Nira — Construction Report

Two tabs on one page for the Casa Nira Uluwatu build:

- **Construction Audit** — the **Time Schedule** feeds across all villas:
  progress, weekly pace, deviation, and target-vs-projected delivery. Reads the
  same `CONSTRUCTION_FEEDS` the main dashboard uses, so figures match.
- **Laporan Harian** — the daily site report: field weather (live from
  Open-Meteo), head-count per unit vs plan, per-block attendance, photo links,
  and auto-generated notes.

**Zero dependencies** (Node 18+). Three ways to run it: **CLI** (audit only), a
**plain Node server**, or **Vercel**.

### One source per figure

Progress percentages, deviation, target and projected dates live **only** in the
audit tab — they are never restated in the daily report. Where the daily report
needs a unit's progress (the photo cards), it reads the audit data already loaded
in the page, so the two tabs cannot disagree. The daily report owns labour,
weather, photos and notes; the audit owns everything schedule-derived.

## Variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `CONSTRUCTION_FEEDS` | yes | JSON map of villa → Apps Script `/exec` URL. Keep it out of git — those URLs are effectively credentials. |
| `DAILY_FEED` | no | Apps Script `/exec` URL for the labour sheet — deploy `apps-script/daily-labour.gs`, see [`apps-script/README.md`](apps-script/README.md). Unset = serve the snapshot committed in `daily-data.mjs`. |
| `STALE_DAYS` | no | Staleness threshold in days (default 10). |
| `CACHE_TTL_MIN` | no | Node-server in-memory cache, minutes (default 360). |

See `.env.example`.

## Updating the daily labour numbers

Two options:

- **Live (recommended)** — deploy `apps-script/daily-labour.gs` on the *Daily
  Mapping Labour on Site* sheet as a web app and set `DAILY_FEED` to its `/exec`
  URL. The dashboard then follows the sheet with no redeploys.
  See [`apps-script/README.md`](apps-script/README.md).
- **Snapshot** — without `DAILY_FEED`, head-counts come from `daily-data.mjs`
  (`plan`, `workers`, `comp` per unit, plus `date`). Edit and redeploy.

Either way the page says which source it used, and an unreachable or erroring
feed falls back to the snapshot rather than showing an empty site.

Villa **type**, **batch** and **Drive photo folder** always come from
`daily-data.mjs` — the labour sheet doesn't carry them, so `daily-core.mjs`
merges them onto the feed rows. Add a villa there when one is added to the sheet.

The 19 villas are reported separately from the sheet's non-villa blocks
(Utilities / Infrastruktur / Fabrikasi), which appear as a "Total lapangan" line
so the report reconciles with the spreadsheet's own Total row.

## CLI

```bash
cp .env.example .env          # fill in CONSTRUCTION_FEEDS
set -a; . ./.env; set +a

npm run audit                 # print the audit table
npm run audit -- 14 8         # stale threshold 14 days, 8-week pace window
npm run audit:html            # also write docs/construction-audit.html
```

## Plain Node server (Render, Railway, a VPS, a container)

```bash
set -a; . ./.env; set +a
npm run serve                 # http://localhost:3000
```

Set `CONSTRUCTION_FEEDS` in the host's environment and run `npm run serve`.

## Vercel

Import this repo as a Vercel project and add one Environment Variable:

- **`CONSTRUCTION_FEEDS`** = the JSON map (paste the `{…}` only, no quotes).

Deploy. Vercel serves `public/index.html` at `/` and runs the two serverless
functions, `api/construction/audit.js` and `api/daily/report.js`. Open the site
root — the page pulls the feeds and re-pulls on **Refresh data**. No token
required. Deep links: `/#audit` and `/#harian`.

> The report shows every unit — including the Drive photo-folder links — and is
> public to anyone with the URL. If you want it locked down, put it behind
> Vercel's password protection (Project → Settings → Deployment Protection) or a
> reverse proxy.

## Caching

Construction data moves ~weekly and labour once a day, so both endpoints are
cached rather than refetched on every open:

- **Vercel** — responses carry `s-maxage=21600` (6h edge cache) + stale-while-revalidate, so most opens are served from the CDN without invoking the function.
- **Node server** — an in-memory cache per endpoint (`CACHE_TTL_MIN`, default 360 = 6h).

The **Refresh data** button requests `?fresh=1` for the active tab, which
bypasses both and re-pulls. Weather is fetched by the browser directly from
Open-Meteo (no key, no proxy) and degrades to a clear "unavailable" state offline
— the rest of the daily report still renders.

## Column reference

| Column | Meaning |
| --- | --- |
| **Last reported** | End date of the latest week with an actual filled in (Sunday close). |
| **Δ this wk / −1w / −2w** | Actual progress in each of the last three reported weeks. |
| **Req Δ/wk** | Weekly progress now required to still hit the target date (remaining ÷ weeks to target). Red = faster than last week's pace. |
| **Target delivery** | Planned completion (S-curve hits 100%), at week-end. |
| **Projected (recent pace)** | Completion extrapolated from the average weekly gain over the last 6 weeks. |
