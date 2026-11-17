import { db } from "hatchable";
import {
  validateCoordinates,
  loadDiscoveryCatalog,
  applyDiscoveryCacheHeaders,
  foldSearchText
} from "../../lib/discovery.js";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  const coords = validateCoordinates(req.query?.lat, req.query?.lng);
  if (!coords.ok) {
    return res.status(400).json({ error: coords.error });
  }

  const raw = String(req.query?.q || "").trim();
  const q = foldSearchText(raw);
  const limit = Math.max(1, Math.min(100, Number(req.query?.limit) || 20));
  const includeExtra = req.query?.include_extra !== "0";
  const now = req._testNow instanceof Date ? req._testNow : new Date();
  const freshRequested = req.query?.fresh === "1";

  try {
    const { listings, catalogVersion, localDate, timezone } = await loadDiscoveryCatalog(db, {
      now,
      userCoords: coords.hasCoords ? coords : null
    });

    const pool = includeExtra ? listings : listings.filter(item => !item.extra);
    const matched = q
      ? pool.filter(item =>
          foldSearchText(
            [
              item.name,
              item.canonical_name,
              item.cuisine,
              item.kind || "",
              ...(item.tags || []),
              item.city,
              item.location,
              item.blurb
            ].join(" ")
          ).includes(q)
        )
      : pool;

    applyDiscoveryCacheHeaders(res, catalogVersion, freshRequested);
    return res.json({
      query: raw.toLowerCase(),
      catalog_version: catalogVersion,
      local_date: localDate,
      timezone,
      total: matched.length,
      results: matched.slice(0, limit).map(item => ({
        id: item.id,
        name: item.name,
        cuisine: item.cuisine,
        city: item.city,
        location: item.location,
        location_source: item.location_source,
        location_accuracy: item.location_accuracy,
        location_is_live: item.location_is_live,
        distance: item.distance,
        open: item.open,
        is_confirmed_service: item.is_confirmed_service,
        extra: item.extra,
        kind: item.kind || null,
        verified: item.verified
      }))
    });
  } catch {
    return res.status(503).json({
      error: "Catalog search is temporarily unavailable.",
      code: "DISCOVERY_DB_UNAVAILABLE",
      retryable: true
    });
  }
}
