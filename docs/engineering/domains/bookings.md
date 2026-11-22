# Domain Map — Event Catering Inquiries & Bookings

## 1. Current Behavior
Enables signed-in `14+` customers to check vendor date availability and submit **non-binding event catering inquiries** (`#bookingModal` -> `POST /api/bookings/create`) using curated `BOOKING_PACKAGES` (`lib/catalog.js`), and lets verified `Vendor Owner`s review and `accept` or `decline` pending inquiries on `#ownerScreen` (`GET|POST /api/owner/requests`). BiteShark processes zero payments.

## 2. Entry Points & Key Symbols
- **Server**: [api/bookings/create.js](../../../api/bookings/create.js), [api/bookings/list.js](../../../api/bookings/list.js), [api/trucks/availability.js](../../../api/trucks/availability.js), [api/owner/requests.js](../../../api/owner/requests.js), `getPacificDateYYYYMMDD` ([lib/dates.js](../../../lib/dates.js)), `BOOKING_PACKAGES` ([lib/catalog.js](../../../lib/catalog.js)).
- **Browser**: `openBooking`, `submitBooking`, `renderBookings`, `loadOwnerRequests`, `decideRequest` ([public/app.js](../../../public/app.js)); `#bookingModal`, `#bookingsScreen`, `#ownerScreen`.

## 3. HTTP APIs & Database Tables
- **APIs**: `GET /api/trucks/availability`, `POST /api/bookings/create` (`201`, supports `Idempotency-Key` / `idempotency_key` `8..128` chars), `GET /api/bookings/list`, `GET|POST /api/owner/requests`, `GET /api/owner/bookings` (used by `public/app.js#loadOwnerRequests` for non-pending filter views).
- **Tables**: `bookings` (`id BIGSERIAL`, `truck_id`, `event_date DATE`, `guest_count`, `package_id`, `package_name`, `package_price`, `status` in `pending|accepted|declined|cancelled`, `idempotency_key`; serialized via `pg_advisory_xact_lock` on `(truck_id, event_date)` and `(requester_id, idempotency_key)`). Note: `bookings` has **no RLS** — always filter by `requester_id` or authorized `truck_id` in SQL!

## 4. Permissions, Flags & Tests
- **Permissions**: Customer `14+` for own inquiries; `Vendor Staff` can `view_bookings`, **only `Vendor Owner`** (or `Admin: Top` AoB) can `decide_booking`. Blocked when `vendors.bookings_restricted = true`.
- **Feature Flags**: `event_inquiries` (`enabled` | `paused` | `hidden`, `all` | `staff_beta`), overridden by `BITESHARK_PAUSE_WRITES=bookings|all`. Pausing blocks new `POST /api/bookings/create` while preserving `GET /api/bookings/list` and owner review of existing inquiries!
- **Tests**: `tests/backend-hardening.integration.cjs`, `tests/feature-controls.integration.cjs`.
- **Safe Extension Points**: Always validate `event_date` in `America/Los_Angeles` via `lib/dates.js` and preserve `pg.types` OID `1082` raw `YYYY-MM-DD` parsing.
