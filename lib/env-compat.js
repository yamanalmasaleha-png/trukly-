// Environment variable transition & compatibility helper (`BITESHARK_*` primary + `TRUCKLY_*` legacy alias).
//
// Precedence & safety rules:
//   1. If only `BITESHARK_<SUFFIX>` is non-empty -> returns `BITESHARK_<SUFFIX>`.
//   2. If only `TRUCKLY_<SUFFIX>` is non-empty -> returns `TRUCKLY_<SUFFIX>` (seamless backward compatibility).
//   3. If both are non-empty and trimmed values are identical -> returns that value.
//   4. If both are non-empty and trimmed values differ:
//      - When `securityCritical: true`: throws `EnvAliasConflictError` (never logs secret values) so callers fail closed.
//      - When `securityCritical: false`: `BITESHARK_<SUFFIX>` takes explicit precedence over `TRUCKLY_<SUFFIX>`.

export class EnvAliasConflictError extends Error {
  constructor(suffix) {
    super(
      `Conflicting values supplied for BITESHARK_${suffix} and legacy alias TRUCKLY_${suffix}; align or remove the duplicate variable.`
    );
    this.name = 'EnvAliasConflictError';
    this.code = 'ENV_ALIAS_CONFLICT';
    this.suffix = suffix;
  }
}

export const SECURITY_CRITICAL_ENV_SUFFIXES = Object.freeze([
  'ENV',
  'PUBLIC_ORIGIN',
  'TRUST_PROXY',
  'PLATFORM_ADMIN_IDS',
  'PAUSE_WRITES',
  'AUTH_SECRET',
  'AUTH_DELIVERY_MODE',
  'ALLOW_TEST_MAILBOX_IN_TESTS',
  'ALLOW_REMOTE_STAGING_MAILBOX',
  'STAGING_MAILBOX_SECRET',
  'STAGING_ALLOWED_EMAIL_DOMAINS',
  'STAGING_ALLOWED_EMAILS',
  'AUTH_EMAIL_API_KEY',
  'AUTH_EMAIL_FROM',
  'AUTH_EMAIL_API_URL',
  'NOTIFICATION_WORKER_SECRET',
  'ALLOW_REMOTE_WORKER',
  'PUSH_PROVIDER_MODE',
  'ALLOW_TEST_PUSH_MODES',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'DISABLE_SUBSCRIPTIONS',
  'DISABLE_NOTIFICATION_DELIVERY',
  'PUSH_ALLOWED_HOSTS',
  'ENABLE_NATIVE_PUSH',
  'ENABLE_STAGING_PROBE',
  'STAGING_PROBE_TOKEN'
]);

export function readEnvCompat(suffix, { securityCritical = false, defaultValue = '', envObj = process.env } = {}) {
  const env = envObj || {};
  const bsRaw = env[`BITESHARK_${suffix}`];
  const trRaw = env[`TRUCKLY_${suffix}`];

  const bsVal = bsRaw === undefined || bsRaw === null ? '' : String(bsRaw).trim();
  const trVal = trRaw === undefined || trRaw === null ? '' : String(trRaw).trim();

  if (bsVal !== '' && trVal !== '' && bsVal !== trVal) {
    if (securityCritical) {
      throw new EnvAliasConflictError(suffix);
    }
    return bsVal;
  }

  if (bsVal !== '') return bsVal;
  if (trVal !== '') return trVal;
  return defaultValue;
}

export function findSecurityEnvConflicts(envObj = process.env) {
  const conflicts = [];
  for (const suffix of SECURITY_CRITICAL_ENV_SUFFIXES) {
    try {
      readEnvCompat(suffix, { securityCritical: true, envObj });
    } catch (err) {
      if (err instanceof EnvAliasConflictError) {
        conflicts.push(suffix);
      } else {
        throw err;
      }
    }
  }
  return conflicts;
}

export function assertNoSecurityEnvConflicts(envObj = process.env) {
  const conflicts = findSecurityEnvConflicts(envObj);
  if (conflicts.length > 0) {
    const first = conflicts[0];
    const err = new EnvAliasConflictError(first);
    err.conflicts = conflicts;
    throw err;
  }
}
