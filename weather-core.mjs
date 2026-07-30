// Field weather for the Laporan Harian tab, from Open-Meteo (no API key).
//
// Served from our own endpoint rather than fetched by each visitor's browser, so
// it is cached once at the edge, works on networks that block third parties, and
// every viewer sees the same reading.
//
// Classification is by RAINFALL, not by weather code alone. Open-Meteo reports
// code 51 ("light drizzle") for any trace of precipitation, so classifying on the
// code alone labelled 23 of 31 July days as rain when only 5 saw 2mm or more —
// badly misleading on a report where rain means concrete pours stop.

// Casa Nira Uluwatu — Jl. Pura Selonding, Pecatu, Kuta Sel., Badung, Bali 80361.
// Open-Meteo snaps to a ~11km grid, so the cell it answers from is reported in
// the payload as `grid` rather than left implicit.
const LAT = -8.8383801, LON = 115.1208256;
const TZ = "Asia/Makassar";                 // WITA
const TIMEOUT_MS = 12000;

// Thresholds in mm/day. Light drizzle does not stop outdoor work; 2mm does start
// to, and 10mm reliably does.
const MM_DRIZZLE = 0.2, MM_RAIN = 2, MM_HEAVY = 10;

export const COND = {
  cerah:   { label: "Cerah",         colour: "#a9822f" },
  berawan: { label: "Cerah Berawan", colour: "#c2a05c" },
  mendung: { label: "Mendung",       colour: "#8f887c" },
  gerimis: { label: "Gerimis",       colour: "#8aa0ab" },
  hujan:   { label: "Hujan",         colour: "#5f7d8c" },
};
const ICON = { cerah: "sun", berawan: "partly", mendung: "cloud", gerimis: "rain", hujan: "rain" };

/** WMO code + measured rainfall -> one of COND. */
export function classify(code, mm) {
  const c = Number(code);
  const r = Number(mm);
  if (Number.isFinite(r)) {
    if (r >= MM_RAIN) return "hujan";
    if (r >= MM_DRIZZLE) return "gerimis";
  }
  if (c >= 95) return "hujan";              // thunderstorm
  if (c >= 61) return "hujan";              // rain / showers
  if (c >= 51) return Number.isFinite(r) && r < MM_DRIZZLE ? "berawan" : "gerimis";
  if (c === 3 || c === 45 || c === 48) return "mendung";
  if (c === 2) return "berawan";
  return "cerah";
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function workability(code, todayMm, todayProb, nowPrecip) {
  const storm = Number(code) >= 95;
  const mm = Number(todayMm) || 0;
  if (storm) return { work: "bad", note: "Hujan petir — hentikan pekerjaan luar & pengecoran" };
  if (mm >= MM_HEAVY) return { work: "bad", note: `Hujan lebat (${mm.toFixed(1)}mm) — pengecoran & pekerjaan luar dihentikan` };
  if (mm >= MM_RAIN || Number(nowPrecip) > 0) return { work: "warn", note: `Hujan (${mm.toFixed(1)}mm hari ini) — pengecoran & pekerjaan luar berisiko tertunda` };
  if (Number(todayProb) >= 60) return { work: "warn", note: `Peluang hujan ${Math.round(todayProb)}% — siapkan penutup untuk pekerjaan luar` };
  return { work: "ok", note: "Kondisi baik untuk pekerjaan luar & pengecoran" };
}

/**
 * One request covers current conditions, today's hours and the whole calendar
 * month. past_days/forecast_days is used rather than a date range so days beyond
 * the forecast horizon come back absent instead of the call being rejected.
 */
export async function getWeather(now = new Date()) {
  const y = now.getFullYear(), m0 = now.getMonth(), dnum = now.getDate();
  const last = new Date(y, m0 + 1, 0).getDate();
  const past = Math.min(92, dnum - 1);
  const fwd = Math.min(16, last - dnum + 1);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&timezone=${encodeURIComponent(TZ)}`
    + `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation`
    + `&hourly=temperature_2m,weather_code,precipitation`
    + `&daily=weather_code,precipitation_sum,precipitation_probability_max`
    + `&past_days=${past}&forecast_days=${fwd}`;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let j;
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return { ok: false, error: `Open-Meteo HTTP ${res.status}` };
    j = await res.json();
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "Open-Meteo timeout" : err.message || "Open-Meteo unreachable" };
  } finally {
    clearTimeout(timer);
  }

  // Calendar month
  const days = new Array(last).fill(null);
  const rainMm = new Array(last).fill(null);
  const dt = j.daily?.time || [];
  dt.forEach((iso, i) => {
    if (+iso.slice(0, 4) !== y || +iso.slice(5, 7) !== m0 + 1) return;
    const d = +iso.slice(8, 10);
    if (d < 1 || d > last) return;
    const mm = (j.daily.precipitation_sum || [])[i];
    days[d - 1] = classify((j.daily.weather_code || [])[i], mm);
    rainMm[d - 1] = Number.isFinite(mm) ? mm : null;
  });

  // Today's three checkpoints
  const todayISO = ymd(now);
  const ht = j.hourly?.time || [], hT = j.hourly?.temperature_2m || [], hC = j.hourly?.weather_code || [], hP = j.hourly?.precipitation || [];
  const slotAt = (hh) => {
    const i = ht.findIndex((t) => t.startsWith(todayISO) && t.slice(11, 13) === hh);
    if (i < 0) return null;
    const c = classify(hC[i], hP[i]);
    return { temp: Math.round(hT[i]), cond: COND[c].label, icon: ICON[c], precip: hP[i] ?? 0 };
  };
  const slots = [];
  for (const [name, hh] of [["Pagi", "07"], ["Siang", "13"], ["Sore", "16"]]) {
    const s = slotAt(hh);
    if (s) slots.push({ name, ...s });
  }

  const cur = j.current || {};
  const ti = dt.indexOf(todayISO);
  const todayMm = ti >= 0 ? (j.daily.precipitation_sum || [])[ti] : null;
  const todayProb = ti >= 0 ? (j.daily.precipitation_probability_max || [])[ti] : null;
  const nowCond = classify(cur.weather_code, cur.precipitation);
  const { work, note } = workability(cur.weather_code, todayMm, todayProb, cur.precipitation);

  return {
    ok: true,
    source: "Open-Meteo",
    legend: COND,          // key -> {label, colour}, so the page has one source
    location: "Casa Nira Uluwatu, Pecatu",
    grid: { lat: j.latitude, lon: j.longitude, elevation: j.elevation },
    updated: cur.time || null,
    now: {
      temp: Math.round(cur.temperature_2m), cond: COND[nowCond].label, icon: ICON[nowCond],
      humidity: Math.round(cur.relative_humidity_2m), wind: Math.round(cur.wind_speed_10m),
      precip: cur.precipitation ?? 0, rainToday: Number.isFinite(todayMm) ? todayMm : null,
      rainChance: Number.isFinite(todayProb) ? Math.round(todayProb) : null,
    },
    work, workNote: note,
    slots,
    month: { year: y, month0: m0, days: last, today: dnum, conds: days, rainMm },
  };
}
