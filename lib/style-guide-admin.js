// BiteShark Style Guide Admin Workspace, Hosted Doc Renderer & GitHub Repo Pusher
// (`lib/style-guide-admin.js`)
//
// Responsibilities:
//   1. Serves the structured 15-category / 29-component / 773-question Style Guide workspace to `/admin`.
//   2. Persists draft/approved/N-A answers and optional notes atomically in persistent host storage
//      (`BITESHARK_STYLE_GUIDE_STORAGE_DIR`) so answers survive deployments and symlink rollbacks
//      without requiring cross-branch SQL migration numbering changes.
//   3. Immediately populates all 18 hosted Style Guide Markdown sections (`README.md`,
//      `COMPLETION-REMINDER.md`, `ui-element-inventory.md`, and all 15 `<topic>.md` files) on save.
//   4. Pushes `docs/engineering/style-guide/decisions.json` + all 18 generated `.md` files atomically
//      to GitHub via the Git Data API (`Admin: Top` only, audited in `audit_logs`, zero token persistence).

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction } from './db-tx.js';
import {
  reverifyModeratorInTx,
  reverifyPlatformAdminInTx,
  recordAuditLog
} from './authz.js';
import { readEnvCompat } from './env-compat.js';
import { getPacificToday } from './dates.js';
import {
  STYLE_GUIDE_SCHEMA_REL_PATH,
  STYLE_GUIDE_DECISIONS_REL_PATH,
  STYLE_GUIDE_DIR_REL_PATH,
  validateStyleGuideData,
  computeCompletionStats,
  renderStyleGuideMarkdownFiles
} from './style-guide-core.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RELEASE_ROOT = path.resolve(MODULE_DIR, '..');

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

function cloneJson(val) {
  return JSON.parse(JSON.stringify(val));
}

function isStaging2Runtime() {
  const cwd = String(process.cwd() || '');
  const pubOrigin = readEnvCompat('PUBLIC_ORIGIN', { securityCritical: false, defaultValue: '' });
  const port = String(process.env.PORT || '');
  return (
    cwd.includes('biteshark-staging2') ||
    pubOrigin.includes('staging2.') ||
    port === '4102'
  );
}

export function resolveStyleGuideReleaseRoot() {
  const custom = readEnvCompat('STYLE_GUIDE_RELEASE_ROOT', {
    securityCritical: false,
    defaultValue: ''
  }).trim();
  if (custom) return path.resolve(custom);
  return DEFAULT_RELEASE_ROOT;
}

export function resolveStyleGuideStorageDir() {
  const explicit = readEnvCompat('STYLE_GUIDE_STORAGE_DIR', {
    securityCritical: false,
    defaultValue: ''
  }).trim();
  if (explicit) {
    return path.resolve(explicit);
  }

  const envName = readEnvCompat('ENV', { securityCritical: false, defaultValue: 'local' }).toLowerCase();
  if (envName === 'staging' || envName === 'production') {
    const preferredParent = isStaging2Runtime()
      ? '/var/lib/biteshark-staging2'
      : '/var/lib/truckly-staging';
    try {
      if (fs.existsSync(preferredParent)) {
        const target = path.join(preferredParent, 'style-guide');
        fs.mkdirSync(target, { recursive: true, mode: 0o700 });
        return target;
      }
    } catch {
      // Fall back to process-isolated temp dir in non-VPS test environments that set BITESHARK_ENV=staging
    }
  }

  const fallback = path.join(
    os.tmpdir(),
    isStaging2Runtime() ? 'biteshark-style-guide-stg2' : 'biteshark-style-guide-workspace'
  );
  fs.mkdirSync(fallback, { recursive: true, mode: 0o700 });
  return fallback;
}

export function resolveGitHubPushConfig() {
  const repo =
    readEnvCompat('STYLE_GUIDE_GITHUB_REPO', {
      securityCritical: false,
      defaultValue: 'yamanalmasaleha-png/trukly-'
    }).trim() || 'yamanalmasaleha-png/trukly-';

  const defaultBranchFallback = isStaging2Runtime()
    ? 'testing/yaman-staging2'
    : 'working/biteshark-vps';
  const defaultBranch =
    readEnvCompat('STYLE_GUIDE_GITHUB_BRANCH', {
      securityCritical: false,
      defaultValue: defaultBranchFallback
    }).trim() || defaultBranchFallback;

  const apiUrl =
    readEnvCompat('STYLE_GUIDE_GITHUB_API_URL', {
      securityCritical: false,
      defaultValue: 'https://api.github.com'
    })
      .trim()
      .replace(/\/+$/, '') || 'https://api.github.com';

  const serverToken = readEnvCompat('STYLE_GUIDE_GITHUB_TOKEN', {
    securityCritical: false,
    defaultValue: ''
  }).trim();

  return {
    repo,
    defaultBranch,
    apiUrl,
    serverTokenConfigured: serverToken.length >= 10,
    serverToken
  };
}

function writeAtomicUtf8(targetPath, text) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = path.join(
    dir,
    `.tmp-sg-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
  );
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'wx', 0o600);
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

function loadBaselineDataAndSchema() {
  const releaseRoot = resolveStyleGuideReleaseRoot();
  const decisionsPath = path.join(releaseRoot, STYLE_GUIDE_DECISIONS_REL_PATH);
  const schemaPath = path.join(releaseRoot, STYLE_GUIDE_SCHEMA_REL_PATH);
  if (!fs.existsSync(decisionsPath)) {
    throw new Error(`Style guide decisions.json is missing at ${decisionsPath}`);
  }
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Style guide JSON schema is missing at ${schemaPath}`);
  }
  const baselineRaw = fs.readFileSync(decisionsPath, 'utf8').replace(/\r\n/g, '\n');
  const baselineData = JSON.parse(baselineRaw);
  const baselineDigest = sha256Hex(baselineRaw);
  return { releaseRoot, decisionsPath, schemaPath, baselineRaw, baselineData, baselineDigest };
}

function readWorkspaceState(storageDir) {
  const statePath = path.join(storageDir, 'workspace-state.json');
  if (!fs.existsSync(statePath)) {
    return {
      revision: 1,
      updated_at: null,
      updated_by_id: null,
      updated_by_label: null,
      last_pushed_digest: null,
      last_pushed_commit_sha: null,
      last_pushed_commit_url: null,
      last_pushed_branch: null,
      last_pushed_at: null,
      overrides_by_id: {}
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
      revision: Number.isInteger(parsed.revision) && parsed.revision >= 1 ? parsed.revision : 1,
      updated_at: parsed.updated_at || null,
      updated_by_id: parsed.updated_by_id || null,
      updated_by_label: parsed.updated_by_label || null,
      last_pushed_digest: parsed.last_pushed_digest || null,
      last_pushed_commit_sha: parsed.last_pushed_commit_sha || null,
      last_pushed_commit_url: parsed.last_pushed_commit_url || null,
      last_pushed_branch: parsed.last_pushed_branch || null,
      last_pushed_at: parsed.last_pushed_at || null,
      overrides_by_id:
        parsed.overrides_by_id && typeof parsed.overrides_by_id === 'object'
          ? parsed.overrides_by_id
          : {}
    };
  } catch {
    return {
      revision: 1,
      updated_at: null,
      updated_by_id: null,
      updated_by_label: null,
      last_pushed_digest: null,
      last_pushed_commit_sha: null,
      last_pushed_commit_url: null,
      last_pushed_branch: null,
      last_pushed_at: null,
      overrides_by_id: {}
    };
  }
}

function mergeBaselineWithOverrides(baselineData, overridesById = {}) {
  const merged = cloneJson(baselineData);
  for (const dec of merged.decisions) {
    const ov = overridesById[dec.decision_id];
    if (!ov || typeof ov !== 'object') continue;
    if ('applicability' in ov && typeof ov.applicability === 'string') {
      dec.applicability = ov.applicability;
    }
    if ('status' in ov && typeof ov.status === 'string') {
      dec.status = ov.status;
    }
    if ('value' in ov) {
      dec.value = ov.value;
    }
    if ('not_applicable_reason' in ov) {
      dec.not_applicable_reason = ov.not_applicable_reason ?? null;
    }
    if ('approval' in ov && ov.approval && typeof ov.approval === 'object') {
      dec.approval = {
        approved_by: ov.approval.approved_by ?? null,
        approved_at: ov.approval.approved_at ?? null
      };
    }
    if ('notes' in ov) {
      const cleanNote = typeof ov.notes === 'string' ? ov.notes.trim() : '';
      if (cleanNote.length > 0) {
        dec.notes = cleanNote;
      } else {
        delete dec.notes;
      }
    }
  }
  return merged;
}

function materializeHostedFilesOnDisk({ storageDir, releaseRoot, rendered }) {
  const hostedGuideDir = path.join(storageDir, 'hosted', STYLE_GUIDE_DIR_REL_PATH);
  fs.mkdirSync(hostedGuideDir, { recursive: true, mode: 0o700 });

  writeAtomicUtf8(path.join(hostedGuideDir, 'decisions.json'), rendered.canonical_json_text);
  for (const [relPath, mdText] of rendered.files.entries()) {
    const fileName = path.posix.basename(relPath);
    writeAtomicUtf8(path.join(hostedGuideDir, fileName), mdText);
  }

  // When running locally in development mode with a writable checkout, keep repo docs/engineering/style-guide synced too
  const envName = readEnvCompat('ENV', { securityCritical: false, defaultValue: 'local' }).toLowerCase();
  const syncRepo = readEnvCompat('SYNC_REPO_STYLE_GUIDE', {
    securityCritical: false,
    defaultValue: ''
  }).trim();
  if (
    (envName === 'local' || envName === 'development') &&
    process.env.NODE_ENV !== 'test' &&
    syncRepo === '1'
  ) {
    try {
      const repoGuideDir = path.join(releaseRoot, STYLE_GUIDE_DIR_REL_PATH);
      if (fs.existsSync(repoGuideDir)) {
        writeAtomicUtf8(path.join(repoGuideDir, 'decisions.json'), rendered.canonical_json_text);
        for (const [relPath, mdText] of rendered.files.entries()) {
          const fileName = path.posix.basename(relPath);
          writeAtomicUtf8(path.join(repoGuideDir, fileName), mdText);
        }
      }
    } catch {
      // Ignore read-only checkout errors
    }
  }
}

function getAllowedHostedFilenames(data) {
  const set = new Set([
    'decisions.json',
    'README.md',
    'COMPLETION-REMINDER.md',
    'ui-element-inventory.md'
  ]);
  for (const t of data.topics || []) {
    set.add(t.file);
  }
  return set;
}

export function loadCurrentWorkspaceSnapshot() {
  const { releaseRoot, schemaPath, baselineData, baselineDigest } = loadBaselineDataAndSchema();
  const storageDir = resolveStyleGuideStorageDir();
  const wsState = readWorkspaceState(storageDir);
  const mergedData = mergeBaselineWithOverrides(baselineData, wsState.overrides_by_id);
  const rendered = renderStyleGuideMarkdownFiles(mergedData);

  // Ensure hosted files directory is materialized
  const hostedCheck = path.join(storageDir, 'hosted', STYLE_GUIDE_DIR_REL_PATH, 'README.md');
  if (!fs.existsSync(hostedCheck)) {
    try {
      materializeHostedFilesOnDisk({ storageDir, releaseRoot, rendered });
    } catch {}
  }

  const referenceDigest = wsState.last_pushed_digest || baselineDigest;
  const hasUnpushedChanges = rendered.decisions_digest_sha256 !== referenceDigest;

  return {
    releaseRoot,
    schemaPath,
    storageDir,
    wsState,
    baselineData,
    baselineDigest,
    mergedData,
    rendered,
    hasUnpushedChanges
  };
}

function validateAllowedGitHubApiUrl(apiUrl) {
  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error('Invalid BITESHARK_STYLE_GUIDE_GITHUB_API_URL.');
  }
  if (parsed.protocol === 'https:' && parsed.hostname === 'api.github.com') {
    return parsed.origin;
  }
  const envName = readEnvCompat('ENV', { securityCritical: false, defaultValue: 'local' }).toLowerCase();
  const isTestEnv = process.env.NODE_ENV === 'test' || envName === 'test';
  if (
    isTestEnv &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
    (parsed.protocol === 'http:' || parsed.protocol === 'https:')
  ) {
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
  }
  throw new Error('GitHub API URL must be https://api.github.com in non-test environments.');
}

async function githubApiJson(baseUrl, endpointPath, token, { method = 'GET', body = undefined } = {}) {
  const url = `${baseUrl}${endpointPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'BiteShark-Admin-StyleGuide/1.0',
        ...(body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, rawText: text.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeGitHubErrMessage(resObj, fallback) {
  const raw = String(resObj?.json?.message || fallback || 'GitHub API request failed.');
  return raw
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, '[REDACTED_TOKEN]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED_TOKEN]')
    .slice(0, 220);
}

export async function handleAdminStyleGuideRoute({
  normPath,
  method,
  req,
  query = {},
  body = {},
  ctx,
  dbAdapter,
  sendJson
}) {
  if (!ctx?.authenticated || !ctx?.user) {
    return sendJson(401, { ok: false, error: 'Sign in is required.', code: 'AUTH_REQUIRED' });
  }
  if (!ctx.isModAdmin) {
    return sendJson(403, {
      ok: false,
      error: 'Moderator or platform administrator access is required.',
      code: 'MODERATOR_REQUIRED'
    });
  }

  // 1. GET /api/admin/style-guide — Load complete Style Guide workspace, categories, components & stats
  if (normPath === '/api/admin/style-guide') {
    if (method !== 'GET') {
      return sendJson(405, { ok: false, error: 'Method not allowed.' }, { Allow: 'GET' });
    }
    const authCheck = await withTransaction(dbAdapter, async tx => reverifyModeratorInTx(tx, ctx));
    if (!authCheck.ok) {
      return sendJson(authCheck.status, { ok: false, error: authCheck.error });
    }

    const snap = loadCurrentWorkspaceSnapshot();
    const ghCfg = resolveGitHubPushConfig();
    const allowedFiles = [...getAllowedHostedFilenames(snap.mergedData)];

    return sendJson(200, {
      ok: true,
      revision: snap.wsState.revision,
      baseline_digest_sha256: snap.baselineDigest,
      current_digest_sha256: snap.rendered.decisions_digest_sha256,
      has_unpushed_changes: snap.hasUnpushedChanges,
      override_count: Object.keys(snap.wsState.overrides_by_id || {}).length,
      updated_at: snap.wsState.updated_at,
      updated_by_label: snap.wsState.updated_by_label,
      permissions: {
        can_save_draft_and_notes: true,
        can_approve: Boolean(ctx.isTopAdmin),
        can_reset: Boolean(ctx.isTopAdmin),
        can_push_repo: Boolean(ctx.isTopAdmin)
      },
      github_push: {
        repo: ghCfg.repo,
        default_branch: ghCfg.defaultBranch,
        suggested_branches: [
          'working/biteshark-vps',
          'testing/yaman-staging2',
          'antigravity/staging2-latest'
        ],
        server_token_configured: ghCfg.serverTokenConfigured,
        last_pushed_commit_sha: snap.wsState.last_pushed_commit_sha,
        last_pushed_commit_url: snap.wsState.last_pushed_commit_url,
        last_pushed_branch: snap.wsState.last_pushed_branch,
        last_pushed_at: snap.wsState.last_pushed_at
      },
      stats: {
        lifecycle_mode: snap.rendered.stats.lifecycle_mode,
        is_complete: snap.rendered.stats.is_complete,
        remaining_gap_count: snap.rendered.stats.remaining_gap_count,
        resolved_count: snap.rendered.stats.resolved_count,
        with_notes_count: snap.rendered.stats.with_notes_count,
        totals: snap.rendered.stats.totals,
        by_topic: snap.rendered.stats.by_topic
      },
      hosted_files: allowedFiles,
      guide_title: snap.mergedData.guide_title,
      mandatory_invariants: snap.mergedData.mandatory_invariants,
      topics: snap.mergedData.topics,
      component_dimensions_catalog: snap.mergedData.component_dimensions_catalog,
      components: snap.mergedData.components,
      decisions: snap.mergedData.decisions
    });
  }

  // 2. GET /api/admin/style-guide/doc?file=<filename> — Inspect live populated hosted Style Guide file
  if (normPath === '/api/admin/style-guide/doc') {
    if (method !== 'GET') {
      return sendJson(405, { ok: false, error: 'Method not allowed.' }, { Allow: 'GET' });
    }
    const authCheck = await withTransaction(dbAdapter, async tx => reverifyModeratorInTx(tx, ctx));
    if (!authCheck.ok) {
      return sendJson(authCheck.status, { ok: false, error: authCheck.error });
    }

    const requestedFile = String(query.file || 'README.md').trim();
    const snap = loadCurrentWorkspaceSnapshot();
    const allowedFiles = getAllowedHostedFilenames(snap.mergedData);
    if (!allowedFiles.has(requestedFile)) {
      return sendJson(400, {
        ok: false,
        error: 'Invalid style-guide file name.',
        code: 'INVALID_STYLE_GUIDE_FILE'
      });
    }

    const content =
      requestedFile === 'decisions.json'
        ? snap.rendered.canonical_json_text
        : snap.rendered.files.get(`${STYLE_GUIDE_DIR_REL_PATH}/${requestedFile}`) || '';

    return sendJson(200, {
      ok: true,
      file: requestedFile,
      repo_path: `${STYLE_GUIDE_DIR_REL_PATH}/${requestedFile}`,
      decisions_digest_sha256: snap.rendered.decisions_digest_sha256,
      updated_at: snap.wsState.updated_at,
      content
    });
  }

  // 3. POST /api/admin/style-guide/save — Save batch of decision answers and/or optional notes
  if (normPath === '/api/admin/style-guide/save') {
    if (method !== 'POST') {
      return sendJson(405, { ok: false, error: 'Method not allowed.' }, { Allow: 'POST' });
    }

    const rawUpdates = Array.isArray(body?.updates) ? body.updates : null;
    if (!rawUpdates || rawUpdates.length === 0 || rawUpdates.length > 200) {
      return sendJson(400, {
        ok: false,
        error: 'Provide between 1 and 200 decision updates per save request.',
        code: 'INVALID_UPDATES_PAYLOAD'
      });
    }

    const needsTopForApproval = rawUpdates.some(
      u => u && (u.status === 'approved' || u.status === 'not_applicable')
    );

    const authCheck = await withTransaction(dbAdapter, async tx => {
      if (needsTopForApproval) {
        return reverifyPlatformAdminInTx(tx, ctx);
      }
      return reverifyModeratorInTx(tx, ctx);
    });
    if (!authCheck.ok) {
      return sendJson(authCheck.status, {
        ok: false,
        error: needsTopForApproval
          ? 'Marking style-guide decisions as Approved or Not Applicable requires Admin: Top.'
          : authCheck.error,
        code: needsTopForApproval ? 'TOP_ADMIN_REQUIRED_FOR_APPROVAL' : 'UNAUTHORIZED'
      });
    }

    const snap = loadCurrentWorkspaceSnapshot();
    if (
      body.expected_revision !== undefined &&
      body.expected_revision !== null &&
      Number(body.expected_revision) !== snap.wsState.revision
    ) {
      return sendJson(409, {
        ok: false,
        error:
          'Another administrator saved Style Guide updates more recently. Refresh the workspace to merge your changes.',
        code: 'REVISION_CONFLICT',
        current_revision: snap.wsState.revision
      });
    }

    const baselineById = new Map(snap.baselineData.decisions.map(d => [d.decision_id, d]));
    const nextOverrides = cloneJson(snap.wsState.overrides_by_id || {});
    const todayPacific = getPacificToday(new Date());
    const defaultApprover =
      String(ctx.user.email || '')
        .split('@')[0]
        .replace(/[^A-Za-z0-9 ._-]/g, '')
        .trim() || 'Admin: Top';

    const touchedIds = [];
    for (const item of rawUpdates) {
      if (!item || typeof item !== 'object') continue;
      const decId = String(item.decision_id || '').trim();
      const baseDec = baselineById.get(decId);
      if (!baseDec) {
        return sendJson(400, {
          ok: false,
          error: `Unknown style-guide decision_id "${decId}".`,
          code: 'UNKNOWN_DECISION_ID'
        });
      }

      const prevDec =
        snap.mergedData.decisions.find(d => d.decision_id === decId) || cloneJson(baseDec);

      let nextStatus = typeof item.status === 'string' ? item.status.trim() : prevDec.status;
      let nextApplicability =
        typeof item.applicability === 'string'
          ? item.applicability.trim()
          : prevDec.applicability;
      let nextValue = 'value' in item ? item.value : prevDec.value;
      let nextNaReason =
        'not_applicable_reason' in item
          ? item.not_applicable_reason
          : prevDec.not_applicable_reason;
      const nextNotesRaw = 'notes' in item ? item.notes : prevDec.notes ?? null;
      const nextNotes =
        typeof nextNotesRaw === 'string' && nextNotesRaw.trim().length > 0
          ? nextNotesRaw.trim().slice(0, 2000)
          : null;

      // Normalize status/applicability transitions cleanly
      if (nextStatus === 'not_applicable') {
        nextApplicability = 'not_applicable';
        nextValue = null;
        nextNaReason = typeof nextNaReason === 'string' ? nextNaReason.trim() : null;
      } else if (nextStatus === 'unanswered') {
        if (nextApplicability === 'not_applicable') {
          nextApplicability = baseDec.applicability === 'unconfirmed' ? 'unconfirmed' : 'applicable';
        }
        nextValue = null;
        nextNaReason = null;
      } else if (nextStatus === 'draft' || nextStatus === 'approved') {
        nextApplicability = 'applicable';
        nextNaReason = null;
      }

      let nextApproval = { approved_by: null, approved_at: null };
      if (nextStatus === 'approved') {
        const suppliedBy =
          typeof item.approved_by === 'string' && item.approved_by.trim().length >= 2
            ? item.approved_by.trim().slice(0, 80)
            : prevDec.approval?.approved_by || defaultApprover;
        const suppliedAt =
          typeof item.approved_at === 'string' && item.approved_at.trim().length >= 10
            ? item.approved_at.trim().slice(0, 32)
            : prevDec.approval?.approved_at || todayPacific;
        nextApproval = {
          approved_by: suppliedBy,
          approved_at: suppliedAt
        };
      }

      // If entry matches baseline 100% and has no notes, prune override; else store override
      const matchesBaseline =
        nextStatus === baseDec.status &&
        nextApplicability === baseDec.applicability &&
        JSON.stringify(nextValue) === JSON.stringify(baseDec.value) &&
        nextNaReason === baseDec.not_applicable_reason &&
        nextApproval.approved_by === baseDec.approval.approved_by &&
        nextApproval.approved_at === baseDec.approval.approved_at &&
        nextNotes === null;

      if (matchesBaseline) {
        delete nextOverrides[decId];
      } else {
        nextOverrides[decId] = {
          applicability: nextApplicability,
          status: nextStatus,
          value: nextValue,
          not_applicable_reason: nextNaReason,
          approval: nextApproval,
          notes: nextNotes
        };
      }
      touchedIds.push(decId);
    }

    const candidateMerged = mergeBaselineWithOverrides(snap.baselineData, nextOverrides);
    const validation = validateStyleGuideData(candidateMerged, { schemaPath: snap.schemaPath });
    if (!validation.ok) {
      return sendJson(400, {
        ok: false,
        error: validation.errors[0] || 'Style guide validation failed.',
        errors: validation.errors.slice(0, 15),
        code: 'STYLE_GUIDE_VALIDATION_FAILED'
      });
    }

    const rendered = renderStyleGuideMarkdownFiles(candidateMerged);
    const nowIso = new Date().toISOString();
    const nextRevision = snap.wsState.revision + 1;
    const actorLabel = ctx.isTopAdmin ? 'Admin: Top' : 'Admin: Mod';

    const nextWsState = {
      ...snap.wsState,
      revision: nextRevision,
      updated_at: nowIso,
      updated_by_id: ctx.user.id,
      updated_by_label: actorLabel,
      overrides_by_id: nextOverrides
    };

    writeAtomicUtf8(
      path.join(snap.storageDir, 'workspace-state.json'),
      JSON.stringify(nextWsState, null, 2) + '\n'
    );
    materializeHostedFilesOnDisk({
      storageDir: snap.storageDir,
      releaseRoot: snap.releaseRoot,
      rendered
    });

    await withTransaction(dbAdapter, async tx => {
      const rev = await reverifyModeratorInTx(tx, ctx);
      if (!rev.ok) throw new Error(rev.error);
      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: rev.actorRole,
        targetType: 'style_guide',
        targetId: 'decisions.json',
        action: 'style_guide_decisions_saved',
        metadata: {
          revision: nextRevision,
          updated_count: touchedIds.length,
          sample_decision_ids: touchedIds.slice(0, 10),
          decisions_digest_sha256: rendered.decisions_digest_sha256,
          totals: rendered.stats.totals,
          with_notes_count: rendered.stats.with_notes_count
        }
      });
    });

    const refDigest = nextWsState.last_pushed_digest || snap.baselineDigest;
    const updatedDecisions = candidateMerged.decisions.filter(d => touchedIds.includes(d.decision_id));

    return sendJson(200, {
      ok: true,
      revision: nextRevision,
      updated_at: nowIso,
      current_digest_sha256: rendered.decisions_digest_sha256,
      has_unpushed_changes: rendered.decisions_digest_sha256 !== refDigest,
      override_count: Object.keys(nextOverrides).length,
      stats: {
        lifecycle_mode: rendered.stats.lifecycle_mode,
        is_complete: rendered.stats.is_complete,
        remaining_gap_count: rendered.stats.remaining_gap_count,
        resolved_count: rendered.stats.resolved_count,
        with_notes_count: rendered.stats.with_notes_count,
        totals: rendered.stats.totals,
        by_topic: rendered.stats.by_topic
      },
      updated_decisions: updatedDecisions
    });
  }

  // 4. POST /api/admin/style-guide/reset — Reset a single decision or all workspace overrides (`Admin: Top`)
  if (normPath === '/api/admin/style-guide/reset') {
    if (method !== 'POST') {
      return sendJson(405, { ok: false, error: 'Method not allowed.' }, { Allow: 'POST' });
    }
    const authCheck = await withTransaction(dbAdapter, async tx =>
      reverifyPlatformAdminInTx(tx, ctx)
    );
    if (!authCheck.ok) {
      return sendJson(authCheck.status, {
        ok: false,
        error: 'Resetting style-guide entries requires Admin: Top.',
        code: 'TOP_ADMIN_REQUIRED'
      });
    }

    const snap = loadCurrentWorkspaceSnapshot();
    const nextOverrides = cloneJson(snap.wsState.overrides_by_id || {});
    let resetScope = '';

    if (body?.reset_all === true) {
      if (body?.confirm_reset !== true) {
        return sendJson(400, {
          ok: false,
          error: 'Explicit confirm_reset: true is required to clear all workspace overrides.',
          code: 'CONFIRM_RESET_REQUIRED'
        });
      }
      for (const k of Object.keys(nextOverrides)) delete nextOverrides[k];
      resetScope = 'all_overrides';
    } else if (typeof body?.decision_id === 'string' && body.decision_id.trim()) {
      const id = body.decision_id.trim();
      delete nextOverrides[id];
      resetScope = id;
    } else {
      return sendJson(400, {
        ok: false,
        error: 'Provide decision_id or reset_all: true.',
        code: 'INVALID_RESET_PAYLOAD'
      });
    }

    const candidateMerged = mergeBaselineWithOverrides(snap.baselineData, nextOverrides);
    const rendered = renderStyleGuideMarkdownFiles(candidateMerged);
    const nowIso = new Date().toISOString();
    const nextRevision = snap.wsState.revision + 1;

    const nextWsState = {
      ...snap.wsState,
      revision: nextRevision,
      updated_at: nowIso,
      updated_by_id: ctx.user.id,
      updated_by_label: 'Admin: Top',
      overrides_by_id: nextOverrides
    };

    writeAtomicUtf8(
      path.join(snap.storageDir, 'workspace-state.json'),
      JSON.stringify(nextWsState, null, 2) + '\n'
    );
    materializeHostedFilesOnDisk({
      storageDir: snap.storageDir,
      releaseRoot: snap.releaseRoot,
      rendered
    });

    await withTransaction(dbAdapter, async tx => {
      const rev = await reverifyPlatformAdminInTx(tx, ctx);
      if (!rev.ok) throw new Error(rev.error);
      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'style_guide',
        targetId: resetScope,
        action: 'style_guide_decisions_reset',
        metadata: {
          revision: nextRevision,
          reset_scope: resetScope
        }
      });
    });

    const refDigest = nextWsState.last_pushed_digest || snap.baselineDigest;
    return sendJson(200, {
      ok: true,
      revision: nextRevision,
      current_digest_sha256: rendered.decisions_digest_sha256,
      has_unpushed_changes: rendered.decisions_digest_sha256 !== refDigest,
      override_count: Object.keys(nextOverrides).length,
      stats: {
        lifecycle_mode: rendered.stats.lifecycle_mode,
        is_complete: rendered.stats.is_complete,
        remaining_gap_count: rendered.stats.remaining_gap_count,
        resolved_count: rendered.stats.resolved_count,
        with_notes_count: rendered.stats.with_notes_count,
        totals: rendered.stats.totals,
        by_topic: rendered.stats.by_topic
      },
      decisions: candidateMerged.decisions
    });
  }

  // 5. POST /api/admin/style-guide/push — Push decisions.json + 18 generated .md files to GitHub repo (`Admin: Top`)
  if (normPath === '/api/admin/style-guide/push') {
    if (method !== 'POST') {
      return sendJson(405, { ok: false, error: 'Method not allowed.' }, { Allow: 'POST' });
    }
    const authCheck = await withTransaction(dbAdapter, async tx =>
      reverifyPlatformAdminInTx(tx, ctx)
    );
    if (!authCheck.ok) {
      return sendJson(authCheck.status, {
        ok: false,
        error: 'Pushing Style Guide updates to GitHub requires Admin: Top.',
        code: 'TOP_ADMIN_REQUIRED'
      });
    }

    const snap = loadCurrentWorkspaceSnapshot();
    const validation = validateStyleGuideData(snap.mergedData, { schemaPath: snap.schemaPath });
    if (!validation.ok) {
      return sendJson(400, {
        ok: false,
        error: `Cannot push invalid style guide: ${validation.errors[0]}`,
        errors: validation.errors.slice(0, 10),
        code: 'STYLE_GUIDE_VALIDATION_FAILED'
      });
    }

    const ghCfg = resolveGitHubPushConfig();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(ghCfg.repo)) {
      return sendJson(500, {
        ok: false,
        error: 'Configured GitHub repository slug is invalid.',
        code: 'INVALID_GITHUB_REPO'
      });
    }

    let apiBase;
    try {
      apiBase = validateAllowedGitHubApiUrl(ghCfg.apiUrl);
    } catch (err) {
      return sendJson(500, {
        ok: false,
        error: err.message,
        code: 'INVALID_GITHUB_API_URL'
      });
    }

    const oneTimeToken = typeof body?.github_token === 'string' ? body.github_token.trim() : '';
    const effectiveToken = ghCfg.serverToken || oneTimeToken;
    if (!effectiveToken || effectiveToken.length < 10) {
      return sendJson(400, {
        ok: false,
        error:
          'A GitHub Personal Access Token (Contents: Read & Write on yamanalmasaleha-png/trukly-) is required. Enter a one-time token in the Push dialog or configure BITESHARK_STYLE_GUIDE_GITHUB_TOKEN in staging.env.',
        code: 'GITHUB_TOKEN_REQUIRED'
      });
    }

    const targetBranch = String(body?.branch || ghCfg.defaultBranch).trim();
    if (
      !/^[A-Za-z0-9._/-]{2,120}$/.test(targetBranch) ||
      targetBranch.includes('..') ||
      targetBranch.startsWith('/') ||
      targetBranch.endsWith('/')
    ) {
      return sendJson(400, {
        ok: false,
        error: 'Invalid target Git branch name.',
        code: 'INVALID_GIT_BRANCH'
      });
    }

    const createBranch = Boolean(body?.create_branch);
    const baseBranch = String(body?.base_branch || ghCfg.defaultBranch).trim();
    if (createBranch && !/^[A-Za-z0-9._/-]{2,120}$/.test(baseBranch)) {
      return sendJson(400, {
        ok: false,
        error: 'Invalid base Git branch name.',
        code: 'INVALID_BASE_BRANCH'
      });
    }

    const totals = snap.rendered.stats.totals;
    const defaultCommitMsg = `docs(style-guide): update style guide answers (${totals.approved} approved, ${totals.draft} draft, ${totals.not_applicable} N/A)`;
    const commitMessage =
      typeof body?.commit_message === 'string' && body.commit_message.trim().length >= 5
        ? body.commit_message.trim().slice(0, 240)
        : defaultCommitMsg;

    const authorName =
      typeof body?.author_name === 'string' && body.author_name.trim().length >= 2
        ? body.author_name.trim().slice(0, 80)
        : 'Matt Callaway';
    const authorEmail =
      typeof body?.author_email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.author_email.trim())
        ? body.author_email.trim().slice(0, 120)
        : 'mattcallawaysemail@gmail.com';

    // 5a. Resolve parent commit & base tree SHA from GitHub
    const refLookupBranch = createBranch ? baseBranch : targetBranch;
    const encodedLookupRef = refLookupBranch.split('/').map(encodeURIComponent).join('/');
    const refRes = await githubApiJson(
      apiBase,
      `/repos/${ghCfg.repo}/git/ref/heads/${encodedLookupRef}`,
      effectiveToken
    );
    if (!refRes.ok || !refRes.json?.object?.sha) {
      return sendJson(refRes.status === 401 || refRes.status === 403 ? 502 : 400, {
        ok: false,
        error: `GitHub branch lookup failed for "${refLookupBranch}": ${sanitizeGitHubErrMessage(refRes, 'Check token permissions and branch name.')}`,
        code: 'GITHUB_REF_LOOKUP_FAILED'
      });
    }

    const parentCommitSha = String(refRes.json.object.sha);
    const commitLookup = await githubApiJson(
      apiBase,
      `/repos/${ghCfg.repo}/git/commits/${encodeURIComponent(parentCommitSha)}`,
      effectiveToken
    );
    if (!commitLookup.ok || !commitLookup.json?.tree?.sha) {
      return sendJson(502, {
        ok: false,
        error: `GitHub parent commit lookup failed: ${sanitizeGitHubErrMessage(commitLookup)}`,
        code: 'GITHUB_COMMIT_LOOKUP_FAILED'
      });
    }
    const baseTreeSha = String(commitLookup.json.tree.sha);

    // 5b. Assemble strict 19-file bundle under `docs/engineering/style-guide/*` ONLY
    const filesToCommit = [
      {
        path: STYLE_GUIDE_DECISIONS_REL_PATH,
        content: snap.rendered.canonical_json_text
      }
    ];
    for (const [relPath, mdText] of snap.rendered.files.entries()) {
      if (!relPath.startsWith(`${STYLE_GUIDE_DIR_REL_PATH}/`)) {
        throw new Error(`Refusing to commit path outside style-guide directory: ${relPath}`);
      }
      filesToCommit.push({ path: relPath, content: mdText });
    }

    // Create blobs in bounded parallel batches of 5 to avoid GitHub secondary rate limits
    const treeEntries = [];
    for (let i = 0; i < filesToCommit.length; i += 5) {
      const chunk = filesToCommit.slice(i, i + 5);
      const blobResults = await Promise.all(
        chunk.map(async fileObj => {
          const bRes = await githubApiJson(
            apiBase,
            `/repos/${ghCfg.repo}/git/blobs`,
            effectiveToken,
            {
              method: 'POST',
              body: {
                content: fileObj.content,
                encoding: 'utf-8'
              }
            }
          );
          return { fileObj, bRes };
        })
      );
      for (const { fileObj, bRes } of blobResults) {
        if (!bRes.ok || !bRes.json?.sha) {
          return sendJson(502, {
            ok: false,
            error: `GitHub blob upload failed for ${fileObj.path}: ${sanitizeGitHubErrMessage(bRes)}`,
            code: 'GITHUB_BLOB_UPLOAD_FAILED'
          });
        }
        treeEntries.push({
          path: fileObj.path,
          mode: '100644',
          type: 'blob',
          sha: String(bRes.json.sha)
        });
      }
    }

    // 5c. Create Git tree
    const treeRes = await githubApiJson(
      apiBase,
      `/repos/${ghCfg.repo}/git/trees`,
      effectiveToken,
      {
        method: 'POST',
        body: {
          base_tree: baseTreeSha,
          tree: treeEntries
        }
      }
    );
    if (!treeRes.ok || !treeRes.json?.sha) {
      return sendJson(502, {
        ok: false,
        error: `GitHub tree creation failed: ${sanitizeGitHubErrMessage(treeRes)}`,
        code: 'GITHUB_TREE_CREATE_FAILED'
      });
    }

    // 5d. Create Git commit
    const newCommitRes = await githubApiJson(
      apiBase,
      `/repos/${ghCfg.repo}/git/commits`,
      effectiveToken,
      {
        method: 'POST',
        body: {
          message: commitMessage,
          tree: String(treeRes.json.sha),
          parents: [parentCommitSha],
          author: {
            name: authorName,
            email: authorEmail,
            date: new Date().toISOString()
          }
        }
      }
    );
    if (!newCommitRes.ok || !newCommitRes.json?.sha) {
      return sendJson(502, {
        ok: false,
        error: `GitHub commit creation failed: ${sanitizeGitHubErrMessage(newCommitRes)}`,
        code: 'GITHUB_COMMIT_CREATE_FAILED'
      });
    }
    const newCommitSha = String(newCommitRes.json.sha);

    // 5e. Advance or create target ref
    let refUpdateRes;
    if (createBranch) {
      refUpdateRes = await githubApiJson(
        apiBase,
        `/repos/${ghCfg.repo}/git/refs`,
        effectiveToken,
        {
          method: 'POST',
          body: {
            ref: `refs/heads/${targetBranch}`,
            sha: newCommitSha
          }
        }
      );
    } else {
      const encodedTargetRef = targetBranch.split('/').map(encodeURIComponent).join('/');
      refUpdateRes = await githubApiJson(
        apiBase,
        `/repos/${ghCfg.repo}/git/refs/heads/${encodedTargetRef}`,
        effectiveToken,
        {
          method: 'PATCH',
          body: {
            sha: newCommitSha,
            force: false
          }
        }
      );
    }
    if (!refUpdateRes.ok) {
      return sendJson(502, {
        ok: false,
        error: `GitHub branch update failed for "${targetBranch}": ${sanitizeGitHubErrMessage(refUpdateRes)}`,
        code: 'GITHUB_REF_UPDATE_FAILED'
      });
    }

    const commitUrl = `https://github.com/${ghCfg.repo}/commit/${newCommitSha}`;
    const pushedAtIso = new Date().toISOString();
    const nextWsState = {
      ...snap.wsState,
      last_pushed_digest: snap.rendered.decisions_digest_sha256,
      last_pushed_commit_sha: newCommitSha,
      last_pushed_commit_url: commitUrl,
      last_pushed_branch: targetBranch,
      last_pushed_at: pushedAtIso
    };
    writeAtomicUtf8(
      path.join(snap.storageDir, 'workspace-state.json'),
      JSON.stringify(nextWsState, null, 2) + '\n'
    );

    await withTransaction(dbAdapter, async tx => {
      const rev = await reverifyPlatformAdminInTx(tx, ctx);
      if (!rev.ok) throw new Error(rev.error);
      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'style_guide',
        targetId: `${ghCfg.repo}@${targetBranch}`,
        action: 'style_guide_pushed_to_github',
        metadata: {
          repo: ghCfg.repo,
          branch: targetBranch,
          create_branch: createBranch,
          commit_sha: newCommitSha,
          parent_commit_sha: parentCommitSha,
          files_committed_count: filesToCommit.length,
          decisions_digest_sha256: snap.rendered.decisions_digest_sha256,
          totals
        }
      });
    });

    return sendJson(200, {
      ok: true,
      repo: ghCfg.repo,
      branch: targetBranch,
      commit_sha: newCommitSha,
      commit_url: commitUrl,
      pushed_at: pushedAtIso,
      files_committed_count: filesToCommit.length,
      has_unpushed_changes: false
    });
  }

  return sendJson(404, { ok: false, error: 'Style guide endpoint not found.' });
}
