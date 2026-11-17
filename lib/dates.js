// Strict calendar date & America/Los_Angeles future-date policy utilities.
//
// Date-only Contract:
// 1. SQL queries returning PostgreSQL DATE columns (`event_date`, `service_date`) MUST
//    project `to_char(<col>, 'YYYY-MM-DD') AS <col>` so PostgreSQL emits canonical
//    timezone-independent TEXT rather than driver-specific Date objects.
// 2. `normalizeCalendarDate(value)` enforces `YYYY-MM-DD` output across both string
//    values and JavaScript Date objects returned by database adapters (supporting both
//    node-postgres local-midnight Dates and UTC-midnight Dates without shifting days,
//    while rejecting arbitrary non-midnight timestamps).

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export const MAX_BOOKING_DAYS_AHEAD = 365;

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function isValidCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_RE.exec(value.trim());
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/**
 * Normalizes a calendar-date value from SQL/adapter output to strict `YYYY-MM-DD`
 * without shifting the calendar day across timezones.
 */
export function normalizeCalendarDate(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isValidCalendarDate(trimmed)) return trimmed;
    throw new TypeError(`Invalid calendar date string: expected YYYY-MM-DD, received "${trimmed.slice(0, 32)}"`);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const isLocalMidnight =
      value.getHours() === 0 &&
      value.getMinutes() === 0 &&
      value.getSeconds() === 0 &&
      value.getMilliseconds() === 0;

    if (isLocalMidnight) {
      const formatted = `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
      if (isValidCalendarDate(formatted)) return formatted;
    }

    const isUtcMidnight =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;

    if (isUtcMidnight) {
      const formatted = `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
      if (isValidCalendarDate(formatted)) return formatted;
    }

    throw new TypeError('Ambiguous non-midnight Date passed where a date-only YYYY-MM-DD value is required.');
  }

  throw new TypeError('Unsupported calendar date value type; expected YYYY-MM-DD string or midnight Date.');
}

export function getPacificToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function daysBetweenISO(startIso, endIso) {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const a = Date.UTC(sy, sm - 1, sd);
  const b = Date.UTC(ey, em - 1, ed);
  return Math.round((b - a) / 86400000);
}

/**
 * Validates that dateStr is a real calendar date strictly after today in America/Los_Angeles
 * (at least tomorrow Pacific time, and within MAX_BOOKING_DAYS_AHEAD days).
 */
export function validateFuturePacificDate(dateStr, now = new Date()) {
  const trimmed = typeof dateStr === 'string' ? dateStr.trim() : '';
  if (!isValidCalendarDate(trimmed)) {
    return { ok: false, error: 'Enter a valid calendar date in YYYY-MM-DD format.' };
  }
  const pacificToday = getPacificToday(now);
  const deltaDays = daysBetweenISO(pacificToday, trimmed);
  if (deltaDays <= 0) {
    return {
      ok: false,
      pacificToday,
      error: `Event date must be a future date in Pacific time (after ${pacificToday}).`
    };
  }
  if (deltaDays > MAX_BOOKING_DAYS_AHEAD) {
    return {
      ok: false,
      pacificToday,
      error: `Event date cannot be more than ${MAX_BOOKING_DAYS_AHEAD} days in advance.`
    };
  }
  return { ok: true, date: trimmed, pacificToday, daysAhead: deltaDays };
}

export function isValidTimeValue(value) {
  if (typeof value !== 'string') return false;
  return TIME_RE.test(value.trim());
}
