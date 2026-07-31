import { getAreaPhotos } from "../../daily-core.mjs";

// Photos in the fixed common-area Drive folders (Amenities, Communal) for the
// Client Report. These folders are flat — no per-date subfolder — so they are
// read directly rather than through the daily photo feed. They change rarely;
// hold them at the edge for an hour.
export const maxDuration = 30;

export default async function handler(req, res) {
  const fresh = (req.query || {}).fresh != null;
  const data = await getAreaPhotos();
  res.setHeader(
    "cache-control",
    !fresh && data.ok && !data.errors
      ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
      : "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
  );
  res.status(200).json(data);
}
