import { applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import { validateCoordinates } from "../../lib/discovery.js";

export const access = "public";
export const methods = ["GET"];

const hubs = [
  { city: "Santa Rosa", lat: 38.4405, lng: -122.7144 },
  { city: "Rohnert Park", lat: 38.3396, lng: -122.7011 },
  { city: "Cotati", lat: 38.3269, lng: -122.7072 },
  { city: "Petaluma", lat: 38.2324, lng: -122.6367 },
  { city: "Sonoma", lat: 38.2919, lng: -122.458 }
];

function miles(a, b, c, d) {
  const r = Math.PI / 180;
  const x = (c - a) * r;
  const y = (d - b) * r;
  const z = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
  return 3959 * 2 * Math.atan2(Math.sqrt(z), Math.sqrt(1 - z));
}

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);

  const coords = validateCoordinates(req.query?.lat, req.query?.lng);
  if (!coords.ok || !coords.hasCoords) {
    return res.status(400).json({
      error: coords.ok ? "lat and lng are required" : coords.error
    });
  }

  return res.json({
    nearest_hubs: hubs
      .map(h => ({ ...h, distance_miles: +miles(coords.lat, coords.lng, h.lat, h.lng).toFixed(1) }))
      .sort((a, b) => a.distance_miles - b.distance_miles)
  });
}
