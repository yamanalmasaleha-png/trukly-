// Explicit 30-route manifest for Truckly's standalone Node HTTP server.
// Keep static `/api/trucks/*` routes ahead of dynamic `/api/trucks/:id`.

import * as bookingsCreate from '../api/bookings/create.js';
import * as bookingsList from '../api/bookings/list.js';
import * as catalogCities from '../api/catalog/cities.js';
import * as catalogCuisines from '../api/catalog/cuisines.js';
import * as catalogFeatured from '../api/catalog/featured.js';
import * as communityList from '../api/community/list.js';
import * as communityMine from '../api/community/mine.js';
import * as communityModerate from '../api/community/moderate.js';
import * as communityPost from '../api/community/post.js';
import * as favoritesList from '../api/favorites/list.js';
import * as favoritesToggle from '../api/favorites/toggle.js';
import * as notificationsSettings from '../api/notifications/settings.js';
import * as ownerBookings from '../api/owner/bookings.js';
import * as ownerLocation from '../api/owner/location.js';
import * as ownerProfile from '../api/owner/profile.js';
import * as ownerRequests from '../api/owner/requests.js';
import * as ownerSchedule from '../api/owner/schedule.js';
import * as ownerStats from '../api/owner/stats.js';
import * as pagerStaff from '../api/pager/staff.js';
import * as pagerStatus from '../api/pager/status.js';
import * as pagerSubscriptions from '../api/pager/subscriptions.js';
import * as pagerTelemetry from '../api/pager/telemetry.js';
import * as pagerUpdate from '../api/pager/update.js';
import * as pagerWorker from '../api/pager/worker.js';
import * as scheduleToday from '../api/schedule/today.js';
import * as trucksRoot from '../api/trucks.js';
import * as trucksAvailability from '../api/trucks/availability.js';
import * as trucksNearby from '../api/trucks/nearby.js';
import * as trucksSearch from '../api/trucks/search.js';
import * as trucksById from '../api/trucks/[id].js';

function defineRoute(pattern, mod, extra = {}) {
  if (!mod || typeof mod.default !== 'function') {
    throw new Error(`Route ${pattern} is missing a default handler export.`);
  }
  const methods = Array.isArray(mod.methods) ? mod.methods.map(m => String(m).toUpperCase()) : [];
  if (!methods.length) {
    throw new Error(`Route ${pattern} must export a non-empty methods array.`);
  }
  const access = mod.access === 'user' ? 'user' : mod.access === 'public' ? 'public' : null;
  if (!access) {
    throw new Error(`Route ${pattern} must export access = "public" or "user".`);
  }
  return Object.freeze({
    pattern,
    methods: Object.freeze(methods),
    access,
    handler: mod.default,
    loopbackWorkerOnly: Boolean(extra.loopbackWorkerOnly),
    exemptFromCookieCsrf: Boolean(extra.exemptFromCookieCsrf)
  });
}

export const STATIC_API_ROUTES = new Map([
  ['/api/bookings/create', defineRoute('/api/bookings/create', bookingsCreate)],
  ['/api/bookings/list', defineRoute('/api/bookings/list', bookingsList)],
  ['/api/catalog/cities', defineRoute('/api/catalog/cities', catalogCities)],
  ['/api/catalog/cuisines', defineRoute('/api/catalog/cuisines', catalogCuisines)],
  ['/api/catalog/featured', defineRoute('/api/catalog/featured', catalogFeatured)],
  ['/api/community/list', defineRoute('/api/community/list', communityList)],
  ['/api/community/mine', defineRoute('/api/community/mine', communityMine)],
  ['/api/community/moderate', defineRoute('/api/community/moderate', communityModerate)],
  ['/api/community/post', defineRoute('/api/community/post', communityPost)],
  ['/api/favorites/list', defineRoute('/api/favorites/list', favoritesList)],
  ['/api/favorites/toggle', defineRoute('/api/favorites/toggle', favoritesToggle)],
  ['/api/notifications/settings', defineRoute('/api/notifications/settings', notificationsSettings)],
  ['/api/owner/bookings', defineRoute('/api/owner/bookings', ownerBookings)],
  ['/api/owner/location', defineRoute('/api/owner/location', ownerLocation)],
  ['/api/owner/profile', defineRoute('/api/owner/profile', ownerProfile)],
  ['/api/owner/requests', defineRoute('/api/owner/requests', ownerRequests)],
  ['/api/owner/schedule', defineRoute('/api/owner/schedule', ownerSchedule)],
  ['/api/owner/stats', defineRoute('/api/owner/stats', ownerStats)],
  ['/api/pager/staff', defineRoute('/api/pager/staff', pagerStaff)],
  ['/api/pager/status', defineRoute('/api/pager/status', pagerStatus)],
  ['/api/pager/subscriptions', defineRoute('/api/pager/subscriptions', pagerSubscriptions)],
  ['/api/pager/telemetry', defineRoute('/api/pager/telemetry', pagerTelemetry)],
  ['/api/pager/update', defineRoute('/api/pager/update', pagerUpdate)],
  [
    '/api/pager/worker',
    defineRoute('/api/pager/worker', pagerWorker, {
      loopbackWorkerOnly: true,
      exemptFromCookieCsrf: true
    })
  ],
  ['/api/schedule/today', defineRoute('/api/schedule/today', scheduleToday)],
  ['/api/trucks', defineRoute('/api/trucks', trucksRoot)],
  ['/api/trucks/availability', defineRoute('/api/trucks/availability', trucksAvailability)],
  ['/api/trucks/nearby', defineRoute('/api/trucks/nearby', trucksNearby)],
  ['/api/trucks/search', defineRoute('/api/trucks/search', trucksSearch)]
]);

export const DYNAMIC_TRUCK_BY_ID_ROUTE = defineRoute('/api/trucks/:id', trucksById);

export const REGISTERED_DOMAIN_ROUTE_COUNT = STATIC_API_ROUTES.size + 1;

if (REGISTERED_DOMAIN_ROUTE_COUNT !== 30) {
  throw new Error(`Expected exact 30 domain API routes, registered ${REGISTERED_DOMAIN_ROUTE_COUNT}.`);
}

export function matchDomainApiRoute(pathname) {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const staticHit = STATIC_API_ROUTES.get(normalized);
  if (staticHit) {
    return { route: staticHit, params: {} };
  }

  const prefix = '/api/trucks/';
  if (normalized.startsWith(prefix)) {
    const rest = normalized.slice(prefix.length);
    if (rest && !rest.includes('/')) {
      try {
        const decodedId = decodeURIComponent(rest);
        if (!decodedId || decodedId === '.' || decodedId === '..' || decodedId.includes('\0')) {
          return { invalidParam: true };
        }
        return {
          route: DYNAMIC_TRUCK_BY_ID_ROUTE,
          params: { id: decodedId }
        };
      } catch {
        return { invalidParam: true };
      }
    }
  }

  return null;
}
