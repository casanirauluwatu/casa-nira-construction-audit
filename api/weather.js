import { getWeather } from "../weather-core.mjs";

// Field weather for the Laporan Harian tab. Served from here rather than fetched
// by each visitor so it is cached once at the edge and still works on networks
// that block third-party calls. Conditions move slowly enough that 15 minutes is
// plenty, and a failure is cached only briefly.
export const maxDuration = 15;

export default async function handler(req, res) {
  const fresh = req.query && req.query.fresh != null;
  const data = await getWeather();
  res.setHeader(
    "cache-control",
    fresh || !data.ok ? "public, max-age=0, s-maxage=60" : "public, max-age=300, s-maxage=900, stale-while-revalidate=3600"
  );
  res.status(data.ok ? 200 : 503).json(data);
}
