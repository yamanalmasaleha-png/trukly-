import { db } from "hatchable";
import {
  validateCoordinates,
  loadDiscoveryCatalog,
  applyDiscoveryCacheHeaders
} from "../../lib/discovery.js";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  const id = String(req.params?.id || req.query?.id || "").trim();
  if (!id || !/^[a-z0-9-]{2,64}$/.test(id)) {
    return res.status(404).json({ error: "Truck detail not found", catalog_route: "/api/trucks" });
  }

  const coords = validateCoordinates(req.query?.lat, req.query?.lng);
  if (!coords.ok) {
    return res.status(400).json({ error: coords.error });
  }

  const now = req._testNow instanceof Date ? req._testNow : new Date();
  const freshRequested = req.query?.fresh === "1";

  try {
    const { listings, catalogVersion, localDate, timezone } = await loadDiscoveryCatalog(db, {
      now,
      userCoords: coords.hasCoords ? coords : null
    });

    const item = listings.find(entry => entry.id === id);
    if (!item) {
      return res.status(404).json({ error: "Truck detail not found", catalog_route: "/api/trucks" });
    }

    const etag = applyDiscoveryCacheHeaders(res, catalogVersion, {
      freshRequested,
      personalized: coords.hasCoords,
      variantKey: `truck:${id}`
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

    return res.json({
      ...item,
      type: item.listing_type,
      catalog_version: catalogVersion,
      local_date: localDate,
      timezone
    });
  } catch {
    return res.status(503).json({
      error: "Vendor detail is temporarily unavailable.",
      code: "DISCOVERY_DB_UNAVAILABLE",
      retryable: true
    });
  }
}
