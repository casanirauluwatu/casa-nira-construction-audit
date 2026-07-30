# Daily Mapping Labour → JSON web app

`daily-labour.gs` publishes the labour sheet as JSON so the **Laporan Harian** tab
reads live head-counts instead of the snapshot committed in `daily-data.mjs`.
Same pattern as the construction "Time Schedule" feeds.

## Deploy

1. Open **Daily Mapping Labour on Site** → **Extensions › Apps Script**.
2. Delete the placeholder `Code.gs` contents, paste **`daily-labour.gs`**, Save.
   (`SHEET_ID` is already set; leave it blank to use whichever sheet the script is
   bound to.)
3. **Deploy › New deployment › Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone** — required, the dashboard calls it server-side
     with no Google session.
4. Authorise when prompted, then copy the **`/exec`** URL.
5. Test it in a browser: `<exec-url>?pretty=1` — you should see today's JSON.
6. Set it on the dashboard as **`DAILY_FEED`**:
   - Vercel → Project → Settings → Environment Variables → `DAILY_FEED` = the
     `/exec` URL → **Redeploy** (env changes need one).
   - Locally: add `DAILY_FEED=…` to `.env`.

### Re-deploying after an edit

**Saving the code does not update a live `/exec` URL** — the URL is pinned to a
version. To publish an edit to the *same* URL:

> **Deploy › Manage deployments › ✏️ Edit › Version: `New version` › Deploy**

Do **not** use *New deployment*: that mints a **different** `/exec` URL and leaves
the old one serving the old code — which looks exactly like the re-deploy did
nothing. If you already did, either point `DAILY_FEED` at the new URL or publish a
new version of the original deployment.

Check which code is actually live:

```
<exec-url>?pretty=1
```

`scriptVersion` should read **`v3-series-months`**, and `series` / `months` should
be present. If they're missing, the URL is still on old code.

Also make sure the project holds only **one** copy of this script — a leftover
`Code.gs` with an older `doGet()` can win over a newly added file.

## Site photos

Photo support lives in the same `daily-labour.gs` — **one file, one paste**.
Nothing to enable in the editor: `driveList_()` uses the advanced Drive service
when it happens to be on, and otherwise calls the Drive REST API with the
script's own OAuth token. `forceDriveScope_()` is never executed; it exists so
Apps Script's static scan puts Drive on the authorisation prompt.

You will be asked to **re-authorise** on first run, because the script now wants
Drive read access. That is expected.

It reads `Rekap / <UNIT> / <MM YYYY> / <DD MM YYYY> / *`, e.g.
`Rekap / A1 / 07 2026 / 30 07 2026 / IMG_8893.HEIC`. Folder names that differ from
the sheet's block names are mapped in `FOLDER_ALIAS` — `Infra` covers both
*Infrastruktur* and *Fabrikasi*.

Walking 22 units three levels deep would be ~66 Drive round trips. Instead four
`Drive.Files.list` queries resolve a whole day, because every unit's date folder
shares one name: ask for all folders called `30 07 2026` whose parent is one of
the month folders, in a single call. Cached 6h.

**Sharing:** the script reads as the deploying account, so it lists photos
whatever the sharing is — but the *browser* renders the thumbnail. With the Rekap
folder set to **anyone with the link → Viewer**, photos load for everyone; with
domain sharing they load only for signed-in `aurum-dev.com` staff and the card
falls back to a "buka folder" link for anyone else.

HEIC is fine: `drive.google.com/thumbnail?id=…` transcodes to JPEG, so phone
photos display. The file itself would not — never link it directly.

## Endpoints

| URL | Returns |
| --- | --- |
| `/exec` | Today (Bali time). If today isn't filled in yet, the most recent day that has numbers, flagged with `usedLatestWithData: true`. |
| `/exec?date=2026-07-30` | That exact day. Honoured even if empty (`hasData: false`) — no silent substitution. |
| `/exec?month=2026-05` | The newest day **with data** in that month — so picking a month lands somewhere useful instead of an empty 1st. |
| `/exec?pretty=1` | Indented JSON for eyeballing. |
| `/exec?photos=2026-07-30` | Site photos for that day from the Rekap folder (needs `daily-photos.gs`). |
| `/exec?nocache=1` | Skip the cache and re-read the sheet. The dashboard's **Refresh data** sends this. |

## Response

```json
{
  "date": "2026-07-30",
  "sheet": "Juli 2026",
  "isToday": true,
  "usedLatestWithData": false,
  "hasData": true,
  "units": [
    { "id": "A1", "block": "A", "plan": 21, "workers": 4,
      "comp": "ARS Sipil 2 · MEP Elektrikal 2",
      "status": "Tidak Memenuhi",
      "trades": [ { "name": "ARS Sipil", "plan": 4, "workers": 2 } ] }
  ],
  "other": [ { "id": "Utilities", "plan": 7, "workers": 6, "comp": "STR 6" } ],
  "totals": { "villaPlan": 310, "villaWorkers": 112,
              "otherPlan": 15, "otherWorkers": 11,
              "sheetPlan": 325, "sheetWorkers": 123 },
  "series": {
    "month": "Juli 2026",
    "dates": ["2026-07-01", "…"],
    "total": { "plan": [195, "…"], "workers": [0, 67, "…"] },
    "units": { "A1": { "plan": [12, "…"], "workers": [0, 5, "…"] } }
  },
  "months": ["April 2026", "Mei 2026", "Juli 2026", "Agustus 2026"]
}
```

`series` is the whole month's day-by-day head-count, feeding the Manpower Harian
chart and its unit selector; `months` fills the date picker's hint. Both come out
of the same read as the day itself, so they cost nothing extra. `series.total`
spans **every** block so it equals the sheet's Total row, and `series.units`
carries each block with a `villa` flag.

## Days that haven't happened

A date after today cannot have a recorded actual, so `Jumlah Aktual` is reported
as 0 for those columns and `Status` blank — the plan is still returned. This
matters because a month tab created by copying the previous month arrives
pre-filled: the *Agustus 2026* tab held non-zero actuals on 23 future days.

To clear those cells in the sheet itself, run **`previewClearFutureActuals()`**
from the editor (logs what it would touch, changes nothing), then
**`clearFutureActuals()`**. It only blanks the actual column of dates after today,
only on named rows, and never touches plan, status or a past day. Take
File → Version history first if you want a way back.

`units` is the 19 villas (`A1`…`D1`); `other` is Utilities / Infrastruktur /
Fabrikasi, split out so the villa figures stay clean while
`villa* + other* == sheet*` still reconciles with the sheet's own Total row.

Villa **type**, **batch** and **Drive folder** are *not* in this response — they
live in `daily-data.mjs` and are merged in by `daily-core.mjs`, so that metadata
stays in one place.

## What it reads

| Where | What |
| --- | --- |
| row 3 | one real `Date` cell every 3rd column from **D**. Stray non-date values in that row are ignored. |
| row 4 | repeating `Jumlah Rencana` / `Jumlah Aktual` / `Status` under each date. |
| row 5 | the sheet's `Total` (includes non-villa categories). |
| unit blocks | a row with a **number in col B** and a name in **col C** starts a block; the rows beneath it until the next numbered row are its trades. |
| tabs | one per month (`Juli 2026`). Tabs are found by **scanning row 3 for the date**, not by name — so a missing month (there's no *Juni 2026*) or a renamed tab won't break it. |

Verified against the workbook: all 123 dated columns across the four tabs parse,
and 30 Jul 2026 reproduces 310 planned / 112 actual across 19 villas.

## Speed

A cold read opens the workbook and takes seconds, so:

| | Effect |
| --- | --- |
| **CacheService**, 6h (10 min while a day is still empty) | a hit answers in milliseconds and never touches the spreadsheet |
| **month tab tried by name first** | reads one tab's header row instead of all of them |
| **row window capped at `MAX_SCAN_ROWS`** (420; blocks end ~320, the sheet runs to ~1200) | ~3x fewer cells, re-reading wider only if a block starts near the window edge |
| **one wide read** for the day *and* the month series | 1 read instead of 31 |

Measured against the previous version on the real workbook: **17 → 8 API calls
and 6,523 → 2,202 cells** on a cold bare `/exec`, with byte-identical output
across all 128 date cases. A cache hit is **1 call, 0 cells**.

**Run `installWarmup()` once** (open it in the editor, press Run) to add an
hourly trigger that refreshes the cached answer in the background — after that
visitors effectively never pay the cold cost. Remove it under Triggers (clock
icon) if you'd rather not.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `{"error":"no column for … — sheet covers …"}` | That date has no column — e.g. a month tab doesn't exist yet. |
| `{"error":"spreadsheet not found — set SHEET_ID"}` | Wrong `SHEET_ID`, or the deploying account can't open it. |
| Dashboard still shows the snapshot | `DAILY_FEED` unset, or set but not redeployed. The page's note line says which source it used. |
| Edited the sheet but the JSON is stale | The 6h cache. Hit **Refresh data** (sends `?nocache=1`), or wait it out. |
| `hasData: false` | The day's `Jumlah Aktual` column is genuinely empty. |
| Re-deployed but `series` / `months` still missing | The `/exec` URL is on an old version — see [Re-deploying after an edit](#re-deploying-after-an-edit). Check `scriptVersion` in the response. |
| Only one month in the dropdown, no chart | Same cause: an older script sends no `months` / `series`. Typing a date still works. |
| Months listed but selecting one does nothing | The **Vercel function** is stale, not the script — it drops `?date=`/`?month=`. Check `apiVersion` in `/api/daily/report`; it should read `v2-date-month`. Redeploy on Vercel with **Use existing Build Cache** unchecked. |
