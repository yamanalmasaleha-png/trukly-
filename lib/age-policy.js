// BiteShark Preliminary Minimum-Age Eligibility Policy (`lib/age-policy.js`)
//
// STATUS: PROPOSED PRODUCT POLICY — PENDING LEGAL REVIEW (NOT APPROVED LEGAL ADVICE)
//
// Proposed Rule:
//   - Users aged 13 and younger CANNOT create accounts.
//   - Minimum account age is 14 (`PROPOSED_MIN_ACCOUNT_AGE = 14`).
//   - Customer account eligibility (14+) does NOT establish contractual capacity to enter
//     vendor agreements, commercial representation, or paid transactions.
//
// Timezone & Calendar Boundary Policy:
//   - Age is evaluated server-side against the current civil calendar date (`YYYY-MM-DD`) in
//     `America/Los_Angeles` (Pacific Time — Sonoma County local calendar).
//   - Leap-day (`02-29`) rule: A person born on February 29 reaches their Nth birthday on
//     February 29 in leap years, and on March 1 (`03-01`) in non-leap years (they are still
//     age N - 1 on February 28 of a non-leap year).
//
// Data Minimization Policy:
//   - BiteShark NEVER stores raw date of birth, birth year, birth month, or birth day in
//     PostgreSQL, logs, cookies, URLs, analytics, or API responses.
//   - Only derived eligibility metadata (`eligible_14_plus`, `AGE_POLICY_VERSION`, timestamp,
//     and self-reported assessment basis) is persisted for eligible accounts.
//   - Rejected signups create zero accounts, zero OTP challenges, and zero retained DOB/PII.

export const PROPOSED_MIN_ACCOUNT_AGE = 14;
export const AGE_POLICY_VERSION = 'draft-14plus-v0.1';
export const AGE_BOUNDARY_TIMEZONE = 'America/Los_Angeles';
export const MIN_PLAUSIBLE_BIRTH_YEAR = 1900;

export function isGregorianLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInGregorianMonth(year, month) {
  if (month === 2) return isGregorianLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  if (month >= 1 && month <= 12) return 31;
  return 0;
}

/**
 * Resolves the `YYYY-MM-DD` civil calendar date in `America/Los_Angeles` for a given `Date`.
 */
export function resolvePacificCalendarDateParts(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid reference timestamp for age evaluation.');
  }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: AGE_BOUNDARY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const year = Number(parts.find(p => p.type === 'year')?.value);
  const month = Number(parts.find(p => p.type === 'month')?.value);
  const day = Number(parts.find(p => p.type === 'day')?.value);
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, iso };
}

/**
 * Accepts either `{ dob: "YYYY-MM-DD" }` or structured `{ dob_year, dob_month, dob_day }`
 * and validates that it represents a real Gregorian calendar date not in the future.
 * Never echoes the raw input in error codes or loggable fields.
 */
export function parseAndValidateDobInput(input = {}, now = new Date()) {
  if (!input || typeof input !== 'object') {
    return { provided: false, valid: false };
  }

  let rawStr = typeof input.dob === 'string' ? input.dob.trim() : '';
  const hasParts =
    input.dob_year !== undefined || input.dob_month !== undefined || input.dob_day !== undefined;

  if (!rawStr && !hasParts) {
    return { provided: false, valid: false };
  }

  let year;
  let month;
  let day;

  if (rawStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawStr);
    if (!m) {
      return {
        provided: true,
        valid: false,
        reason: 'malformed_format',
        error: 'Enter a valid calendar date of birth (Month, Day, and 4-digit Year).'
      };
    }
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    const yStr = String(input.dob_year ?? '').trim();
    const mStr = String(input.dob_month ?? '').trim();
    const dStr = String(input.dob_day ?? '').trim();
    if (!/^\d{4}$/.test(yStr) || !/^\d{1,2}$/.test(mStr) || !/^\d{1,2}$/.test(dStr)) {
      return {
        provided: true,
        valid: false,
        reason: 'malformed_parts',
        error: 'Select your birth month and enter a valid calendar day and 4-digit birth year.'
      };
    }
    year = Number(yStr);
    month = Number(mStr);
    day = Number(dStr);
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return {
      provided: true,
      valid: false,
      reason: 'non_integer',
      error: 'Enter a valid calendar date of birth.'
    };
  }

  if (month < 1 || month > 12) {
    return {
      provided: true,
      valid: false,
      reason: 'invalid_month',
      error: 'Birth month must be between January (01) and December (12).'
    };
  }

  const maxDay = daysInGregorianMonth(year, month);
  if (day < 1 || day > maxDay) {
    return {
      provided: true,
      valid: false,
      reason: 'impossible_calendar_date',
      error: 'That day does not exist in the selected month and year. Enter an actual calendar date.'
    };
  }

  const ref = resolvePacificCalendarDateParts(now);

  // Reject future dates strictly
  if (
    year > ref.year ||
    (year === ref.year && month > ref.month) ||
    (year === ref.year && month === ref.month && day > ref.day)
  ) {
    return {
      provided: true,
      valid: false,
      reason: 'future_date',
      error: 'Date of birth cannot be in the future.'
    };
  }

  if (year < MIN_PLAUSIBLE_BIRTH_YEAR) {
    return {
      provided: true,
      valid: false,
      reason: 'before_min_year',
      error: `Enter a valid 4-digit birth year (${MIN_PLAUSIBLE_BIRTH_YEAR} or later).`
    };
  }

  return {
    provided: true,
    valid: true,
    birthParts: { year, month, day },
    refParts: ref
  };
}

/**
 * Computes completed full years of age on `refParts` (`America/Los_Angeles` civil date).
 * Leap-day (`02-29`) births reach their birthday on `02-29` in leap years and `03-01` in non-leap years.
 */
export function computeCompletedYearsOfAge(birthParts, refParts) {
  let age = refParts.year - birthParts.year;
  const hasHadBirthdayThisYear =
    refParts.month > birthParts.month ||
    (refParts.month === birthParts.month && refParts.day >= birthParts.day);
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}

/**
 * Evaluates BiteShark's proposed 14+ minimum account age policy without retaining raw DOB.
 */
export function evaluateMinimumAgeEligibility(input = {}, now = new Date()) {
  const parsed = parseAndValidateDobInput(input, now);
  if (!parsed.provided) {
    return {
      provided: false,
      valid: false,
      eligible: false,
      status: 400,
      code: 'DOB_REQUIRED',
      error: 'Enter your date of birth to verify minimum account age eligibility (14+).'
    };
  }
  if (!parsed.valid) {
    return {
      provided: true,
      valid: false,
      eligible: false,
      status: 400,
      code: 'INVALID_DOB',
      reason: parsed.reason,
      error: parsed.error
    };
  }

  const completedYears = computeCompletedYearsOfAge(parsed.birthParts, parsed.refParts);
  const assessedAtIso = (now instanceof Date ? now : new Date(now)).toISOString();

  if (completedYears < PROPOSED_MIN_ACCOUNT_AGE) {
    // Neutral, non-coaching refusal: never invites or hints at entering a different birth date
    return {
      provided: true,
      valid: true,
      eligible: false,
      status: 403,
      code: 'AGE_INELIGIBLE',
      error:
        'Accounts on BiteShark require users to be at least 14 years old under our proposed account policy. Registration cannot be completed.'
    };
  }

  return {
    provided: true,
    valid: true,
    eligible: true,
    status: 200,
    eligibilityMetadata: {
      age_eligibility_status: 'eligible_14_plus',
      age_policy_version: AGE_POLICY_VERSION,
      age_assessed_at: assessedAtIso
    }
  };
}
