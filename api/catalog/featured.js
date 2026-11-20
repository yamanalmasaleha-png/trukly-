import { db } from "@biteshark/runtime-adapter";
import { loadDiscoveryCatalog, applyDiscoveryCacheHeaders } from "../../lib/discovery.js";

export const access = "public";
export const methods = ["GET"];

export default async function(req, res) {
  const now = req._testNow instanceof Date ? req._testNow : new Date();
  const freshRequested = req.query?.fresh === "1";

  try {
    const { listings, catalogVersion, localDate, timezone } = await loadDiscoveryCatalog(db, { now });
    const featured = listings.filter(item => item.featured === true);

    const etag = applyDiscoveryCacheHeaders(res, catalogVersion, {
      freshRequested,
      variantKey: "catalog:featured"
    });

    if (etag && !freshRequested && req.headers?.["if-none-match"] === etag && typeof res.end === "function") {
      return res.status(304).end();
    }

    return res.json({
      featured_ids: featured.map(item => item.id),
      featured: featured.map(item => ({
        id: item.id,
        name: item.name,
        cuisine: item.cuisine,
        city: item.city,
        location: item.location,
        open: item.open,
        is_confirmed_service: item.is_confirmed_service,
        verified: item.verified
      })),
      catalog_version: catalogVersion,
      local_date: localDate,
      timezone,
      updated_for: "Sonoma County corridor"
    });
  } catch {
    return res.status(503).json({
      error: "Featured catalog is temporarily unavailable.",
      code: "DISCOVERY_DB_UNAVAILABLE",
      retryable: true
    });
  }
}
