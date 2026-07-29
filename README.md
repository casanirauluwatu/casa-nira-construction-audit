# Casa Nira — Construction Feed Audit

A standalone audit of the Casa Nira Uluwatu construction **Time Schedule** feeds
across all villas — progress, weekly pace, and target-vs-projected delivery.
**Zero dependencies** (Node 18+). Reads the same `CONSTRUCTION_FEEDS` the main
dashboard uses, so figures match.

Three ways to run it: **CLI**, a **plain Node server**, or **Vercel**.

## The one variable it needs

`CONSTRUCTION_FEEDS` — a JSON map of villa → Apps Script `/exec` URL. Keep it out
of git (those URLs are effectively credentials). See `.env.example`.

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

Deploy. Vercel serves `public/index.html` at `/` and runs
`api/construction/audit.js` as a serverless function. Open the site root — the
page pulls every feed and re-pulls on **Refresh data**. No token required.

> The report shows every unit and is public to anyone with the URL. If you want
> it locked down, put it behind Vercel's password protection (Project → Settings
> → Deployment Protection) or a reverse proxy.


## Caching

Construction data moves ~weekly, so the audit is cached rather than refetched on every open:

- **Vercel** — responses carry `s-maxage=21600` (6h edge cache) + stale-while-revalidate, so most opens are served from the CDN without invoking the function.
- **Node server** — an in-memory cache (`CACHE_TTL_MIN`, default 360 = 6h).

The **Refresh data** button requests `?fresh=1`, which bypasses both and re-pulls all feeds.

## Column reference

| Column | Meaning |
| --- | --- |
| **Last reported** | End date of the latest week with an actual filled in (Sunday close). |
| **Δ this wk / −1w / −2w** | Actual progress in each of the last three reported weeks. |
| **Req Δ/wk** | Weekly progress now required to still hit the target date (remaining ÷ weeks to target). Red = faster than last week's pace. |
| **Target delivery** | Planned completion (S-curve hits 100%), at week-end. |
| **Projected (recent pace)** | Completion extrapolated from the average weekly gain over the last 6 weeks. |
