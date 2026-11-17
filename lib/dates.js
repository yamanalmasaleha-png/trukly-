// Strict calendar date & America/Los_Angeles future-date policy utilities.

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export const MAX_BOOKING_DAYS_AHEAD = 365;

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
