import crypto from "node:crypto";
import { db, auth } from "hatchable";
import { BOOKING_PACKAGES } from "../../lib/catalog.js";
import {
  resolveIdentity,
  isWritePaused,
  applyPrivateNoStoreHeaders,
  evaluateEffectiveVendorRestrictions
} from "../../lib/authz.js";
import { validateFuturePacificDate, normalizeCalendarDate } from "../../lib/dates.js";
import { withTransaction } from "../../lib/db-tx.js";

export const access = "user";
export const methods = ["POST"];

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

function parseStrictGuestCount(raw) {
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) ? raw : NaN;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isSafeInteger(n) ? n : NaN;
  }
  return NaN;
}

function extractIdempotencyKey(req, body) {
  const headerVal = req?.headers?.["idempotency-key"] ?? req?.headers?.["Idempotency-Key"];
  const bodyVal = body?.idempotency_key;

  const h = headerVal === undefined || headerVal === null ? "" : String(headerVal).trim();
  const b = bodyVal === undefined || bodyVal === null ? "" : String(bodyVal).trim();

  if (h && b && h !== b) {
    return { ok: false, error: "Conflicting Idempotency-Key header and body idempotency_key." };
  }
  const chosen = h || b;
  if (!chosen) return { ok: true, key: null };
  if (!IDEMPOTENCY_KEY_RE.test(chosen)) {
    return { ok: false, error: "idempotency_key must be 8–128 ASCII token characters." };
  }
  return { ok: true, key: chosen };
}

function computeBookingHash(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function formatBookingResponse(row, replay = false) {
  const out = {
    id: row.id,
    truck_id: row.truck_id,
    truck_name: row.truck_name,
    event_type: row.event_type,
    event_date: normalizeCalendarDate(row.event_date),
    guest_count: row.guest_count,
    location: row.location,
    package_id: row.package_id,
    package_name: row.package_name,
    package_price: row.package_price,
    status: row.status,
    created_at: row.created_at
  };
  if (replay) out.idempotent_replay = true;
  return out;
}

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);
  if (isWritePaused("bookings")) {
    return res.status(503).json({ error: "New event booking inquiries are temporarily paused for maintenance." });
  }

  const user = await resolveIdentity(req, auth);
  if (!user) {
    return res.status(401).json({ error: "Sign in to submit an event booking request." });
  }

  const b = req.body && typeof req.body === "object" ? req.body : {};

  if (typeof b.truck_id !== "string" || !b.truck_id.trim() || b.truck_id.trim().length > 80) {
    return res.status(400).json({ error: "Choose an eligible food truck for your event." });
  }
  const truckId = b.truck_id.trim();

  if (typeof b.package_id !== "string" || !Object.prototype.hasOwnProperty.call(BOOKING_PACKAGES, b.package_id.trim())) {
    return res.status(400).json({ error: "Choose a valid booking package." });
  }
  const pkg = BOOKING_PACKAGES[b.package_id.trim()];

  if (typeof b.event_type !== "string" || b.event_type.trim().length < 2 || b.event_type.trim().length > 80) {
    return res.status(400).json({ error: "Include a valid event type (2–80 characters)." });
  }
  const eventType = b.event_type.trim();

  if (typeof b.location !== "string" || b.location.trim().length < 3 || b.location.trim().length > 240) {
    return res.status(400).json({ error: "Include a valid event location (3–240 characters)." });
  }
  const location = b.location.trim();

  if (b.note !== undefined && b.note !== null && typeof b.note !== "string") {
    return res.status(400).json({ error: "Event note must be plain text." });
  }
  const rawNote = typeof b.note === "string" ? b.note.trim() : "";
  if (rawNote.length > 1000) {
    return res.status(400).json({ error: "Event note cannot exceed 1,000 characters." });
  }
  const note = rawNote || null;

  const guestCount = parseStrictGuestCount(b.guest_count);
  if (!Number.isInteger(guestCount) || guestCount < 10) {
    return res.status(400).json({ error: "Guest count must be a whole number of at least 10 guests." });
  }
  if (guestCount > pkg.max) {
    return res.status(400).json({ error: "Guest count exceeds this package. Choose a larger package." });
  }

  const now = req._now instanceof Date ? req._now : new Date();
  const dateCheck = validateFuturePacificDate(b.event_date, now);
  if (!dateCheck.ok) {
    return res.status(400).json({ error: dateCheck.error });
  }
  const eventDate = dateCheck.date;

  const idem = extractIdempotencyKey(req, b);
  if (!idem.ok) {
    return res.status(400).json({ error: idem.error });
  }
  const idempotencyKey = idem.key;

  const requestHash = computeBookingHash({
    truck_id: truckId,
    package_id: pkg.id,
    event_type: eventType,
    event_date: eventDate,
    guest_count: guestCount,
    location,
    note: note || ""
  });

  try {
    const outcome = await withTransaction(db, async tx => {
      if (idempotencyKey) {
        const { rows: prevRows } = await tx.query(
          `SELECT id, truck_id, truck_name, event_type,
                  to_char(event_date, 'YYYY-MM-DD') AS event_date,
                  guest_count, location,
                  package_id, package_name, package_price, status, created_at, request_hash
           FROM bookings
           WHERE requester_user_id = $1 AND idempotency_key = $2
           FOR UPDATE`,
          [user.id, idempotencyKey]
        );
        if (prevRows.length) {
          const prev = prevRows[0];
          if (prev.request_hash !== requestHash) {
            return {
              status: 409,
              body: { error: "Idempotency key was already used with different booking details." }
            };
          }
          return { status: 200, body: formatBookingResponse(prev, true) };
        }
      }

      let vendorRows;
      try {
        ({ rows: vendorRows } = await tx.query(
          `SELECT
             v.id,
             v.is_active,
             v.event_bookable,
             v.hidden_from_discovery,
             v.bookings_restricted,
             v.vendor_access_suspended,
             v.restriction_authority,
             v.temp_restriction_expires_at,
             COALESCE(op.display_name, v.canonical_name) AS canonical_name,
             COALESCE(op.accepting_bookings, true) AS accepting_bookings
           FROM vendors v
           LEFT JOIN owner_profiles op ON op.truck_id = v.id
           WHERE v.id = $1
           FOR SHARE OF v`,
          [truckId]
        ));
      } catch (colErr) {
        if (colErr?.code !== "42703") throw colErr;
        ({ rows: vendorRows } = await tx.query(
          `SELECT
             v.id,
             v.is_active,
             v.event_bookable,
             COALESCE(op.display_name, v.canonical_name) AS canonical_name,
             COALESCE(op.accepting_bookings, true) AS accepting_bookings
           FROM vendors v
           LEFT JOIN owner_profiles op ON op.truck_id = v.id
           WHERE v.id = $1
           FOR SHARE OF v`,
          [truckId]
        ));
      }

      if (!vendorRows.length) {
        return { status: 400, body: { error: "Selected food truck was not found." } };
      }

      const effRestr = evaluateEffectiveVendorRestrictions(vendorRows[0], now.getTime());
      if (effRestr.hidden_from_discovery) {
        return { status: 400, body: { error: "Selected listing is not currently available for event bookings." } };
      }

      const { rows: lockedProfile } = await tx.query(
        "SELECT accepting_bookings, display_name FROM owner_profiles WHERE truck_id = $1 FOR SHARE",
        [truckId]
      );
      const vendor = {
        ...vendorRows[0],
        canonical_name: lockedProfile[0]?.display_name || vendorRows[0].canonical_name,
        accepting_bookings: lockedProfile.length ? lockedProfile[0].accepting_bookings !== false : vendorRows[0].accepting_bookings
      };

      if (!vendor.is_active || !vendor.event_bookable) {
        return { status: 400, body: { error: "Selected listing is not eligible for event bookings." } };
      }

      if (!vendor.accepting_bookings || effRestr.bookings_restricted || effRestr.vendor_access_suspended) {
        return { status: 409, body: { error: "This food truck is not currently accepting event bookings." } };
      }

      const { rows: schedRows } = await tx.query(
        "SELECT status FROM owner_schedule WHERE truck_id = $1 AND service_date = $2 FOR SHARE",
        [truckId, eventDate]
      );
      if (schedRows[0]?.status === "unavailable") {
        return { status: 409, body: { error: "This food truck is unavailable on the selected date." } };
      }

      const canonicalTruckName = String(vendor.canonical_name).slice(0, 120);

      if (idempotencyKey) {
        const { rows: inserted } = await tx.query(
          `INSERT INTO bookings (
             truck_id, truck_name, event_type, event_date, guest_count, location, note,
             requester, requester_user_id, requester_email,
             package_id, package_name, package_price,
             idempotency_key, request_hash
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $10, $11, $12, $13, $14)
           ON CONFLICT (requester_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
           DO NOTHING
           RETURNING id, truck_id, truck_name, event_type,
                     to_char(event_date, 'YYYY-MM-DD') AS event_date,
                     guest_count, location,
                     package_id, package_name, package_price, status, created_at`,
          [
            truckId,
            canonicalTruckName,
            eventType,
            eventDate,
            guestCount,
            location,
            note,
            user.email || null,
            user.id,
            pkg.id,
            pkg.name,
            pkg.price,
            idempotencyKey,
            requestHash
          ]
        );

        if (!inserted.length) {
          const { rows: raced } = await tx.query(
            `SELECT id, truck_id, truck_name, event_type,
                    to_char(event_date, 'YYYY-MM-DD') AS event_date,
                    guest_count, location,
                    package_id, package_name, package_price, status, created_at, request_hash
             FROM bookings
             WHERE requester_user_id = $1 AND idempotency_key = $2`,
            [user.id, idempotencyKey]
          );
          if (raced.length) {
            if (raced[0].request_hash !== requestHash) {
              return {
                status: 409,
                body: { error: "Idempotency key was already used with different booking details." }
              };
            }
            return { status: 200, body: formatBookingResponse(raced[0], true) };
          }
          throw new Error("Idempotent insert race failed to resolve.");
        }

        return { status: 201, body: formatBookingResponse(inserted[0], false) };
      }

      const { rows: inserted } = await tx.query(
        `INSERT INTO bookings (
           truck_id, truck_name, event_type, event_date, guest_count, location, note,
           requester, requester_user_id, requester_email,
           package_id, package_name, package_price,
           idempotency_key, request_hash
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $10, $11, $12, NULL, $13)
         RETURNING id, truck_id, truck_name, event_type,
                   to_char(event_date, 'YYYY-MM-DD') AS event_date,
                   guest_count, location,
                   package_id, package_name, package_price, status, created_at`,
        [
          truckId,
          canonicalTruckName,
          eventType,
          eventDate,
          guestCount,
          location,
          note,
          user.email || null,
          user.id,
          pkg.id,
          pkg.name,
          pkg.price,
          requestHash
        ]
      );

      return { status: 201, body: formatBookingResponse(inserted[0], false) };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch {
    return res.status(503).json({ error: "Booking request could not be verified or saved right now. Please try again." });
  }
}
