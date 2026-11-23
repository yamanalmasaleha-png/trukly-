#!/usr/bin/env node
// Off-Host Deterministic Linux Release Tarball Builder for BiteShark (`working/biteshark-vps`)
//
// Produces a clean `biteshark-<sha12>.tar.gz` and `<tarball>.sha256` from an exact Git commit
// using `git archive` (honoring `.gitattributes` `export-ignore` so tests, CI workflows, and
// local simulator/debug workbench files are excluded and zero host `node_modules` or `.env`
// files ever enter the archive).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = {
    ref: 'HEAD',
    outDir: path.join(os.tmpdir(), 'biteshark-release-artifacts')
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--ref' && argv[i + 1]) opts.ref = argv[++i];
    else if (argv[i] === '--out-dir' && argv[i + 1]) opts.outDir = path.resolve(argv[++i]);
  }
  return opts;
}

const opts = parseArgs(process.argv);
const fullSha = execFileSync('git', ['rev-parse', '--verify', `${opts.ref}^{commit}`], {
  cwd: ROOT,
  encoding: 'utf8'
}).trim();

if (!/^[0-9a-f]{40}$/.test(fullSha)) {
  throw new Error(`Invalid resolved commit SHA: ${fullSha}`);
}

fs.mkdirSync(opts.outDir, { recursive: true });
const shortSha = fullSha.slice(0, 12);
const baseName = `biteshark-${shortSha}.tar.gz`;
const tarballPath = path.join(opts.outDir, baseName);
const sha256Path = `${tarballPath}.sha256`;

execFileSync('git', ['archive', '--format=tar.gz', `--output=${tarballPath}`, fullSha], {
  cwd: ROOT,
  stdio: 'inherit'
});

// Inspect archived member list via `git archive --list` or `tar -tzf` to guarantee zero forbidden paths
const archivedEntries = execFileSync('tar', ['-tzf', tarballPath], {
  cwd: ROOT,
  encoding: 'utf8'
})
  .split(/\r?\n/)
  .filter(Boolean);

const forbiddenMatches = archivedEntries.filter(
  entry =>
    /(^|\/)\.env(\.|$)/i.test(entry) ||
    entry.startsWith('node_modules/') ||
    entry.startsWith('.github/') ||
    entry.startsWith('tests/') ||
    entry.startsWith('docs/archive/') ||
    entry.startsWith('docs/code-audit/') ||
    entry === 'hatchable.toml' ||
    entry === 'truckly-v63.zip' ||
    entry === 'truckly-data.sql.gz' ||
    entry.includes('debug-admin.') ||
    entry.includes('dev-server.cjs')
);

if (forbiddenMatches.length > 0) {
  fs.rmSync(tarballPath, { force: true });
  throw new Error(`Forbidden files found in release archive: ${forbiddenMatches.join(', ')}`);
}

for (const requiredEntry of [
  'package.json',
  'package-lock.json',
  'server/index.js',
  'server/app.js',
  'server/admin-routes.js',
  'server/customer-exploration-routes.js',
  'server/customer-profile-routes.js',
  'lib/admin-governance.js',
  'lib/admin-test-customer.js',
  'lib/age-policy.js',
  'lib/diagnostics.js',
  'lib/support-tickets.js',
  'lib/feature-controls.js',
  'lib/customer-exploration.js',
  'lib/customer-profile.js',
  'lib/editorial-stories.js',
  'lib/photo-storage.js',
  'lib/map-config.js',
  'lib/request-context.js',
  'public/index.html',
  'public/diagnostics-client.js',
  'public/exploration-client.js',
  'public/admin.html',
  'public/admin.js',
  'public/admin-style-guide.js',
  'public/admin-style-guide.css',
  'lib/json-schema-lite.js',
  'lib/style-guide-core.js',
  'lib/style-guide-admin.js',
  'docs/engineering/schemas/style-guide-decisions.schema.json',
  'docs/engineering/style-guide/decisions.json',
  'public/role-experience.js',
  'public/policies/index.html',
  'public/policies/terms.html',
  'public/policies/privacy.html',
  'public/policies/vendor-terms.html',
  'public/policies/community-moderation.html',
  'public/policies/advertising-sponsored.html',
  'public/policies/accessibility.html',
  'public/policies/cookies-storage.html',
  'public/policies/policies.css',
  'public/manifest.json',
  'public/icon-192.png',
  'public/icon-512.png',
  'public/apple-touch-icon.png',
  'migrations/018_admin_portal_onboarding_moderation_issues.sql',
  'migrations/019_age_eligibility_and_compliance_readiness.sql',
  'migrations/020_age_gate_allowlist_and_precise_wording.sql',
  'migrations/021_auth_diagnostics_and_email_readiness.sql',
  'migrations/022_feature_controls.sql',
  'migrations/023_invitation_delivery_and_lifecycle.sql',
  'migrations/024_diagnostics_and_reliability.sql',
  'migrations/025_support_feedback_and_diagnostic_links.sql',
  'migrations/026_urgent_pilot_security_hardening.sql',
  'migrations/027_customer_exploration_foundation.sql',
  'migrations/028_exploration_photo_reconciliation.sql',
  'migrations/029_customer_profiles_collections_and_sharing.sql',
  'migrations/030_audit_security_and_rls_hardening.sql',
  'scripts/run-migrations.cjs',
  'scripts/bootstrap-top-admin.cjs',
  'scripts/operator-read-my-otp.cjs',
  'scripts/manage-feature-controls.cjs',
  'scripts/run-pager-worker.cjs',
  'deploy/install-staging-release.sh'
]) {
  if (!archivedEntries.includes(requiredEntry)) {
    throw new Error(`Required release file missing from archive: ${requiredEntry}`);
  }
}

const bytes = fs.readFileSync(tarballPath);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(sha256Path, `${sha256}  ${baseName}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      ok: true,
      commit_sha: fullSha,
      tarball_name: baseName,
      tarball_path: tarballPath,
      sha256_path: sha256Path,
      sha256,
      size_bytes: bytes.length,
      entry_count: archivedEntries.length
    },
    null,
    2
  )
);
