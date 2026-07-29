# Casa Nira — Construction Feed Audit

A standalone audit of the Casa Nira Uluwatu construction **Time Schedule** feeds
across all villas — progress, weekly pace, and target-vs-projected delivery.
**Zero dependencies** (Node 18+ only). Two ways to use it:

- **CLI** — print a table (and optionally a static HTML report).
- **Server** — serve a live report page with a **Refresh data** button.

It reads the same `CONSTRUCTION_FEEDS` the main dashboard uses, so figures match.

## Setup

```bash
cp .env.example .env      # then fill in CONSTRUCTION_FEEDS and AUDIT_TOKEN
```

`CONSTRUCTION_FEEDS` is a JSON map of villa → Apps Script `/exec` URL. Keep `.env`
out of git (it's gitignored) — those URLs are effectively credentials.

## CLI

```bash
# load .env into the shell, then run
set -a; . ./.env; set +a

npm run audit            # print the audit table
npm run audit -- 14 8    # stale threshold 14 days, 8-week pace window
npm run audit:html       # also write docs/construction-audit.html
```

Columns: week reached, last-reported week (period end), actual vs planned, the
last 3 weeks' progress deltas, required pace to hit target, target delivery, and
a recent-pace projected delivery.

## Server (live report + Refresh button)

```bash
set -a; . ./.env; set +a
npm run serve            # http://localhost:3000
```

Open **`http://localhost:3000/?token=<AUDIT_TOKEN>`**. The page pulls every feed
live via `GET /api/construction/audit?token=…` and re-pulls on **Refresh data**.
Without a valid token the endpoint returns 401.

### Deploy

Any Node host works (Render, Railway, Fly, a VPS, or a container). Set
`CONSTRUCTION_FEEDS` and `AUDIT_TOKEN` in the host's environment and run
`npm run serve`. Then share `https://<host>/?token=<AUDIT_TOKEN>` — treat that
URL as sensitive, since it shows every unit.

## Column reference

| Column | Meaning |
| --- | --- |
| **Last reported** | End date of the latest week with an actual filled in (Sunday close). |
| **Δ this wk / −1w / −2w** | Actual progress in each of the last three reported weeks. |
| **Req Δ/wk** | Weekly progress now required to still hit the target date (remaining ÷ weeks to target). Red = faster than last week's pace. |
| **Target delivery** | Planned completion (S-curve hits 100%), at week-end. |
| **Projected (recent pace)** | Completion extrapolated from the average weekly gain over the last 6 weeks. |
