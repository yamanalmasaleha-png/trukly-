import { db } from "@biteshark/runtime-adapter";
import {
  CATALOG_SECTIONS,
  validateCoordinates,
  loadDiscoveryCatalog,
  computeSectionCounts,
  applyDiscoveryCacheHeaders
} from "../lib/discovery.js";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  const coords = validateCoordinates(req.query?.lat, req.query?.lng);
  if (!coords.ok) {
    return res.status(400).json({ error: coords.error });
  }

  const now = req._testNow instanceof Date ? req._testNow : new Date();
  const freshRequested = req.query?.fresh === "1";
  const isSummary = req.query?.summary === "1";
  const variantKey = isSummary ? "trucks:summary=1" : "trucks:full";

  try {
    const { listings, catalogVersion, localDate, timezone, updatedAt } = await loadDiscoveryCatalog(db, {
      now,
      userCoords: coords.hasCoords ? coords : null
    });

    const counts = computeSectionCounts(listings);
    const primaryTotal = listings.filter(item => !item.extra).length;
    const etag = applyDiscoveryCacheHeaders(res, catalogVersion, {
      freshRequested,
      personalized: coords.hasCoords,
      variantKey
    });

    if (
      etag &&
      !freshRequested &&
      !coords.hasCoords &&
      req.headers?.["if-none-match"] === etag &&
      typeof res.end === "function"
    ) {
      return res.status(304).end();
    }

    if (isSummary) {
      return res.json({
        ok: CATALOG_SECTIONS.every(section => counts[section] >= 5),
        total: listings.length,
        primary_total: primaryTotal,
        counts,
        cities: [...new Set(listings.map(item => item.city))],
        catalog_version: catalogVersion,
        local_date: localDate,
        timezone
      });
    }

    return res.json({
      updated_at: updatedAt,
      catalog_version: catalogVersion,
      local_date: localDate,
      timezone,
      source: "unified_postgres_catalog",
      total: listings.length,
      primary_total: primaryTotal,
      trucks: listings,
      sections: CATALOG_SECTIONS,
      counts
    });
  } catch {
    return res.status(503).json({
      error: "Live discovery catalog is temporarily unavailable.",
      code: "DISCOVERY_DB_UNAVAILABLE",
      retryable: true
    });
  }
}
