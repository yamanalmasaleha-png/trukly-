// BiteShark Style Guide Admin Workspace, Persistent Change/Overwrite Guard,
// Hosted Doc Renderer & Branch-Aware GitHub Uploader (`lib/style-guide-admin.js`)
//
// Responsibilities:
//   1. Serves the structured 15-category / 29-component / 773-question Style Guide workspace to `/admin`.
//   2. Persists draft/approved/N-A answers and optional notes atomically in durable host storage
//      (`BITESHARK_STYLE_GUIDE_STORAGE_DIR`: `/var/lib/truckly-staging/style-guide` on primary staging,
//      `/var/lib/biteshark-staging2/style-guide` on secondary staging2) with live writeability probes
//      and bounded rolling revision history snapshots (`history/rev-*.json`) so answers survive
//      deployments, restarts, and symlink rollbacks.
//   3. Recognizes newly written vs rewritten/overwritten vs cleared entries and enforces explicit
//      Confirm / Deny (`confirm_overwrite: true`) before overwriting existing saved answers or
//      concurrent administrator revisions.
//   4. Immediately populates all 18 hosted Style Guide Markdown sections (`README.md`,
//      `COMPLETION-REMINDER.md`, `ui-element-inventory.md`, and all 15 `<topic>.md` files) on save.
//   5. Uploads `docs/engineering/style-guide/decisions.json` + all 18 generated `.md` files atomically
//      to each staging server's respective GitHub branch (`working/biteshark-vps` on staging,
//      `testing/yaman-staging2` on staging2) with rich feedback on newly written, rewritten/changed,
//      UI elements touched, files modified, and questions/elements remaining.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction } from './db-tx.js';
import {
  reverifyModeratorInTx,
  reverifyPlatformAdminInTx,
  recordAuditLog,
  isWritePaused
} from './authz.js';
import { readEnvCompat, EnvAliasConflictError } from './env-compat.js';
import { getPacificToday } from './dates.js';
import {
  STYLE_GUIDE_SCHEMA_REL_PATH,
  STYLE_GUIDE_DECISIONS_REL_PATH,
  STYLE_GUIDE_DIR_REL_PATH,
  validateStyleGuideData,
  renderStyleGuideMarkdownFiles
} from './style-guide-core.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RELEASE_ROOT = path.resolve(MODULE_DIR, '..');
const MAX_HISTORY_SNAPSHOTS = 20;
const VALID_DECISION_STATUSES = new Set(['unanswered', 'draft', 'approved', 'not_applicable']);

export class StyleGuideAdminError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'StyleGuideAdminError';
    this.status = status;
    this.code = code;
  }
}

const workspaceLocksByDir = new Map();

function withWorkspaceLock(storageDir, fn) {
  const key = path.resolve(storageDir);
  const prev = workspaceLocksByDir.get(key) || Promise.resolve();
  let releaseNext;
  const gate = new Promise(resolve => {
    releaseNext = resolve;
  });
  const chained = prev.then(() => gate, () => gate);
  workspaceLocksByDir.set(key, chained);
  return prev.then(
    async () => {
      try {
        return await fn();
      } finally {
        releaseNext();
        if (workspaceLocksByDir.get(key) === chained) {
          workspaceLocksByDir.delete(key);
        }
      }
    },
    async () => {
      try {
        return await fn();
      } finally {
        releaseNext();
        if (workspaceLocksByDir.get(key) === chained) {
          workspaceLocksByDir.delete(key);
        }
      }
    }
  );
}

let memoizedRenderEntry = null;

function renderStyleGuideMarkdownFilesMemoized(mergedData, cacheKey) {
  if (memoizedRenderEntry && memoizedRenderEntry.key === cacheKey) {
    return memoizedRenderEntry.rendered;
  }
  const rendered = renderStyleGuideMarkdownFiles(mergedData);
  memoizedRenderEntry = { key: cacheKey, rendered };
  return rendered;
}

function readStyleGuideEnv(suffix, defaultValue = '') {
  try {
    return readEnvCompat(suffix, { securityCritical: true, defaultValue });
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      throw new StyleGuideAdminError(
        500,
        'ENV_ALIAS_CONFLICT',
        `Conflicting BITESHARK_${suffix} and TRUCKLY_${suffix} environment configuration.`
      );
    }
    throw err;
  }
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

function cloneJson(val) {
  return JSON.parse(JSON.stringify(val));
}

function isStaging2Runtime() {
  const cwd = String(process.cwd() || '');
  const pubOrigin = readStyleGuideEnv('PUBLIC_ORIGIN', '');
  const explicitStorage = readStyleGuideEnv('STYLE_GUIDE_STORAGE_DIR', '');
  const port = String(process.env.PORT || '');
  return (
    cwd.includes('biteshark-staging2') ||
    explicitStorage.includes('biteshark-staging2') ||
    pubOrigin.includes('staging2.') ||
    port === '4102'
  );
}

export function resolveStyleGuideReleaseRoot() {
  const custom = readStyleGuideEnv('STYLE_GUIDE_RELEASE_ROOT', '').trim();
  if (custom) return path.resolve(custom);
  return DEFAULT_RELEASE_ROOT;
}

export function resolveStyleGuideStorageDir() {
  const explicit = readStyleGuideEnv('STYLE_GUIDE_STORAGE_DIR', '').trim();
  if (explicit) {
    const resolved = path.resolve(explicit);
    try {
      fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
    } catch {
      // Handled by persistence health check if unwritable
    }
    return resolved;
  }

  const envName = readStyleGuideEnv('ENV', 'local').toLowerCase();
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

export function inspectPersistenceHealth(storageDir, wsState = null) {
  const normStorage = path.resolve(storageDir);
  const normTmp = path.resolve(os.tmpdir());
  const isTempFallback =
    normStorage === normTmp || normStorage.startsWith(normTmp + path.sep);
  const durable = !isTempFallback;

  let writable = false;
  const probePath = path.join(
    normStorage,
    `.probe-sg-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  );
  try {
    fs.mkdirSync(normStorage, { recursive: true, mode: 0o700 });
    fs.writeFileSync(probePath, 'ok', { encoding: 'utf8', mode: 0o600 });
    fs.unlinkSync(probePath);
    writable = true;
  } catch {
    try {
      fs.unlinkSync(probePath);
    } catch {}
    writable = false;
  }

  let historyCount = 0;
  try {
    const histDir = path.join(normStorage, 'history');
    if (fs.existsSync(histDir)) {
      historyCount = fs
        .readdirSync(histDir)
        .filter(f => f.startsWith('rev-') && f.endsWith('.json')).length;
    }
  } catch {
    historyCount = 0;
  }

  const stateFilePresent = fs.existsSync(path.join(normStorage, 'workspace-state.json'));
  return {
    durable,
    writable,
    storage_mode: durable ? 'persistent_host_volume' : 'ephemeral_temp_dir',
    environment_target: isStaging2Runtime() ? 'staging2' : 'staging',
    state_file_present: stateFilePresent,
    revision: wsState?.revision || 1,
    history_snapshots_count: historyCount,
    updated_at: wsState?.updated_at || null,
    updated_by_label: wsState?.updated_by_label || null
  };
}

export function resolveGitHubPushConfig() {
  const repo =
    readStyleGuideEnv('STYLE_GUIDE_GITHUB_REPO', 'yamanalmasaleha-png/trukly-').trim() ||
    'yamanalmasaleha-png/trukly-';

  const defaultBranchFallback = isStaging2Runtime()
    ? 'testing/yaman-staging2'
    : 'working/biteshark-vps';
  const defaultBranch =
    readStyleGuideEnv('STYLE_GUIDE_GITHUB_BRANCH', defaultBranchFallback).trim() ||
    defaultBranchFallback;

  const apiUrl =
    readStyleGuideEnv('STYLE_GUIDE_GITHUB_API_URL', 'https://api.github.com')
      .trim()
      .replace(/\/+$/, '') || 'https://api.github.com';

  const serverToken = readStyleGuideEnv('STYLE_GUIDE_GITHUB_TOKEN', '').trim();

  return {
    repo,
    defaultBranch,
    environmentRole: isStaging2Runtime() ? 'staging2' : 'staging',
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

function saveHistorySnapshotBeforeChange(storageDir, prevWsState, reasonLabel) {
  try {
    const prevOverridesCount = Object.keys(prevWsState?.overrides_by_id || {}).length;
    if (prevOverridesCount === 0 && !prevWsState?.updated_at) return;
    const histDir = path.join(storageDir, 'history');
    fs.mkdirSync(histDir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const revNum = String(prevWsState.revision || 1).padStart(5, '0');
    const fileName = `rev-${revNum}-${stamp}.json`;
    writeAtomicUtf8(
      path.join(histDir, fileName),
      JSON.stringify(
        {
          archived_at: new Date().toISOString(),
          reason: reasonLabel,
          previous_state: prevWsState
        },
        null,
        2
      ) + '\n'
    );

    const files = fs
      .readdirSync(histDir)
      .filter(f => f.startsWith('rev-') && f.endsWith('.json'))
      .sort();
    if (files.length > MAX_HISTORY_SNAPSHOTS) {
      const toRemove = files.slice(0, files.length - MAX_HISTORY_SNAPSHOTS);
      for (const oldFile of toRemove) {
        try {
          fs.unlinkSync(path.join(histDir, oldFile));
        } catch {}
      }
    }
  } catch {
    // Best-effort snapshot history; primary atomic state write still runs
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
  const emptyState = {
    revision: 1,
    updated_at: null,
    updated_by_id: null,
    updated_by_label: null,
    last_pushed_digest: null,
    last_pushed_commit_sha: null,
    last_pushed_commit_url: null,
    last_pushed_branch: null,
    last_pushed_at: null,
    last_pushed_overrides_by_id: null,
    overrides_by_id: {}
  };
  let rawText;
  try {
    rawText = fs.readFileSync(statePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return emptyState;
    }
    throw new StyleGuideAdminError(
      500,
      'STYLE_GUIDE_STATE_UNREADABLE',
      'Style Guide persistent workspace state could not be read from disk.'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new StyleGuideAdminError(
      500,
      'STYLE_GUIDE_STATE_CORRUPT',
      'Style Guide persistent workspace state is corrupt. Inspect or restore workspace-state.json from history backups before saving.'
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StyleGuideAdminError(
      500,
      'STYLE_GUIDE_STATE_CORRUPT',
      'Style Guide persistent workspace state has an invalid root object.'
    );
  }
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
    last_pushed_overrides_by_id:
      parsed.last_pushed_overrides_by_id && typeof parsed.last_pushed_overrides_by_id === 'object'
        ? parsed.last_pushed_overrides_by_id
        : null,
    overrides_by_id:
      parsed.overrides_by_id && typeof parsed.overrides_by_id === 'object'
        ? parsed.overrides_by_id
        : {}
  };
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

export function hasSavedDecisionContent(dec) {
  if (!dec || typeof dec !== 'object') return false;
  if (dec.status && dec.status !== 'unanswered') return true;
  if (dec.value !== null && dec.value !== undefined) return true;
  if (typeof dec.not_applicable_reason === 'string' && dec.not_applicable_reason.trim().length > 0) {
    return true;
  }
  if (typeof dec.notes === 'string' && dec.notes.trim().length > 0) return true;
  return false;
}

export function summarizeDecisionValuePreview(dec) {
  if (!dec || typeof dec !== 'object') return 'Unanswered (blank)';
  if (dec.status === 'not_applicable') {
    return `N/A (${String(dec.not_applicable_reason || '').slice(0, 90)})`;
  }
  const v = dec.value;
  if (v === null || v === undefined) {
    if (typeof dec.notes === 'string' && dec.notes.trim()) {
      return `Unanswered [Note: ${dec.notes.trim().slice(0, 70)}]`;
    }
    return 'Unanswered (blank)';
  }
  if (typeof v === 'boolean' || typeof v === 'number') {
    return String(v);
  }
  if (typeof v === 'string') {
    return v.length > 100 ? `${v.slice(0, 97)}…` : v;
  }
  if (Array.isArray(v)) {
    const joined = v.join(', ');
    return `[${v.length} item${v.length === 1 ? '' : 's'}: ${joined.slice(0, 85)}${joined.length > 85 ? '…' : ''}]`;
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v);
    const previewPairs = entries
      .slice(0, 3)
      .map(([k, val]) => `${k}: ${typeof val === 'string' ? val : JSON.stringify(val)}`)
      .join('; ');
    return `{${entries.length} field${entries.length === 1 ? '' : 's'}: ${previewPairs.slice(0, 90)}${previewPairs.length > 90 ? '…' : ''}}`;
  }
  return String(v);
}

function decisionsCoreAnswerEqual(a, b) {
  return (
    (a?.status || 'unanswered') === (b?.status || 'unanswered') &&
    (a?.applicability || 'applicable') === (b?.applicability || 'applicable') &&
    JSON.stringify(a?.value ?? null) === JSON.stringify(b?.value ?? null) &&
    (a?.not_applicable_reason ?? null) === (b?.not_applicable_reason ?? null)
  );
}

function decisionsNotesEqual(a, b) {
  const na = typeof a?.notes === 'string' ? a.notes.trim() : '';
  const nb = typeof b?.notes === 'string' ? b.notes.trim() : '';
  return na === nb;
}

export function computeStyleGuideChangeReport({
  referenceData,
  candidateData,
  referenceRendered = null,
  candidateRendered = null,
  referenceLabel = 'reference'
}) {
  const refById = new Map((referenceData?.decisions || []).map(d => [d.decision_id, d]));
  const candRendered = candidateRendered || renderStyleGuideMarkdownFiles(candidateData);
  const refRendered = referenceRendered || renderStyleGuideMarkdownFiles(referenceData);

  let newlyWrittenCount = 0;
  let rewrittenCount = 0;
  let clearedCount = 0;
  let notesOnlyChangedCount = 0;
  let notesChangedTotalCount = 0;
  let unchangedCount = 0;

  const touchedComponentIds = new Set();
  const touchedTopicSlugs = new Set();
  const changedItems = [];
  const overwrittenItems = [];

  for (const cand of candidateData.decisions || []) {
    const ref = refById.get(cand.decision_id) || {
      decision_id: cand.decision_id,
      status: 'unanswered',
      applicability: cand.applicability,
      value: null,
      not_applicable_reason: null
    };

    const coreSame = decisionsCoreAnswerEqual(ref, cand);
    const notesSame = decisionsNotesEqual(ref, cand);
    const approvalSame =
      (ref?.approval?.approved_by ?? null) === (cand?.approval?.approved_by ?? null) &&
      (ref?.approval?.approved_at ?? null) === (cand?.approval?.approved_at ?? null);

    if (coreSame && notesSame && approvalSame) {
      unchangedCount += 1;
      continue;
    }

    if (!notesSame) notesChangedTotalCount += 1;
    if (cand.component_id) touchedComponentIds.add(cand.component_id);
    if (cand.topic) touchedTopicSlugs.add(cand.topic);

    const refHadAnswer =
      (ref.status && ref.status !== 'unanswered') ||
      (ref.value !== null && ref.value !== undefined) ||
      Boolean(ref.not_applicable_reason);
    const candHasAnswer =
      (cand.status && cand.status !== 'unanswered') ||
      (cand.value !== null && cand.value !== undefined) ||
      Boolean(cand.not_applicable_reason);
    const refHadAnySaved = hasSavedDecisionContent(ref);
    const candHasAnySaved = hasSavedDecisionContent(cand);

    let changeType = 'rewritten';
    let isOverwrite = false;

    if (!refHadAnySaved && candHasAnySaved) {
      if (candHasAnswer) {
        changeType = 'newly_written';
        newlyWrittenCount += 1;
      } else {
        changeType = 'notes_updated';
        notesOnlyChangedCount += 1;
      }
    } else if (refHadAnySaved && !candHasAnySaved) {
      changeType = 'cleared';
      clearedCount += 1;
      isOverwrite = true;
    } else if (coreSame && approvalSame && !notesSame) {
      changeType = 'notes_updated';
      notesOnlyChangedCount += 1;
      if (typeof ref.notes === 'string' && ref.notes.trim().length > 0) {
        isOverwrite = true;
      }
    } else if (!refHadAnswer && candHasAnswer) {
      // Previously only had an optional note, now filling in the actual answer
      changeType = 'newly_written';
      newlyWrittenCount += 1;
      if (!notesSame && typeof ref.notes === 'string' && ref.notes.trim().length > 0) {
        isOverwrite = true;
      }
    } else {
      changeType = 'rewritten';
      rewrittenCount += 1;
      isOverwrite = true;
    }

    const itemRecord = {
      decision_id: cand.decision_id,
      title: cand.title,
      topic: cand.topic,
      component_id: cand.component_id || null,
      change_type: changeType,
      is_overwrite: isOverwrite,
      previous_status: ref.status || 'unanswered',
      next_status: cand.status || 'unanswered',
      previous_preview: summarizeDecisionValuePreview(ref),
      next_preview: summarizeDecisionValuePreview(cand),
      previous_notes: typeof ref.notes === 'string' ? ref.notes : null,
      next_notes: typeof cand.notes === 'string' ? cand.notes : null
    };

    changedItems.push(itemRecord);
    if (isOverwrite) {
      overwrittenItems.push(itemRecord);
    }
  }

  // Compute UI element (`CMP-*`) completion & remaining counts
  const components = candidateData.components || [];
  let elementsCompletedCount = 0;
  let elementsInProgressCount = 0;
  let elementsUntouchedCount = 0;
  for (const cmp of components) {
    const cmpDecs = (candidateData.decisions || []).filter(d => d.component_id === cmp.component_id);
    if (cmpDecs.length === 0) {
      elementsCompletedCount += 1;
      continue;
    }
    const doneCnt = cmpDecs.filter(
      d => d.status === 'approved' || d.status === 'not_applicable'
    ).length;
    const draftCnt = cmpDecs.filter(d => d.status === 'draft').length;
    if (doneCnt === cmpDecs.length) {
      elementsCompletedCount += 1;
    } else if (doneCnt > 0 || draftCnt > 0) {
      elementsInProgressCount += 1;
    } else {
      elementsUntouchedCount += 1;
    }
  }

  // Compute category (`topic`) completion & remaining counts
  const byTopic = candRendered.stats.by_topic || [];
  const categoriesTotal = (candidateData.topics || []).length;
  const categoriesCompletedCount = byTopic.filter(
    t =>
      Number(t.applicable_unanswered || 0) +
        Number(t.unconfirmed_pending || 0) +
        Number(t.draft || 0) ===
        0 && Number(t.total || 0) > 0
  ).length;

  // Compute exact repository file changes (out of 19 style-guide files)
  const changedPaths = [];
  if (refRendered.canonical_json_text !== candRendered.canonical_json_text) {
    changedPaths.push(STYLE_GUIDE_DECISIONS_REL_PATH);
  }
  for (const [relPath, mdText] of candRendered.files.entries()) {
    if (refRendered.files.get(relPath) !== mdText) {
      changedPaths.push(relPath);
    }
  }
  const bundleTotal = 1 + candRendered.files.size;

  const tot = candRendered.stats.totals;
  const doneCount = tot.approved + tot.not_applicable;
  const filledTotal = doneCount + tot.draft;
  const leftUnanswered = tot.applicable_unanswered + tot.unconfirmed_pending;
  const completionPct = tot.total > 0 ? Math.round((doneCount / tot.total) * 1000) / 10 : 0;
  const filledPct = tot.total > 0 ? Math.round((filledTotal / tot.total) * 1000) / 10 : 0;

  return {
    reference_label: referenceLabel,
    counts: {
      newly_written_count: newlyWrittenCount,
      rewritten_count: rewrittenCount,
      cleared_count: clearedCount,
      notes_only_changed_count: notesOnlyChangedCount,
      notes_changed_total_count: notesChangedTotalCount,
      overwrite_total_count: overwrittenItems.length,
      total_changed_decisions: changedItems.length,
      unchanged_decisions: unchangedCount
    },
    questions: {
      total: tot.total,
      done: doneCount,
      approved: tot.approved,
      not_applicable: tot.not_applicable,
      draft: tot.draft,
      filled_total: filledTotal,
      left_unanswered: leftUnanswered,
      applicable_unanswered: tot.applicable_unanswered,
      unconfirmed_left: tot.unconfirmed_pending,
      with_notes: candRendered.stats.with_notes_count,
      completion_percent: completionPct,
      filled_percent: filledPct
    },
    elements: {
      total: components.length,
      touched_count: touchedComponentIds.size,
      touched_ids: [...touchedComponentIds],
      completed_count: elementsCompletedCount,
      in_progress_count: elementsInProgressCount,
      untouched_count: elementsUntouchedCount,
      left_count: Math.max(0, components.length - elementsCompletedCount)
    },
    categories: {
      total: categoriesTotal,
      touched_count: touchedTopicSlugs.size,
      touched_slugs: [...touchedTopicSlugs],
      completed_count: categoriesCompletedCount,
      left_count: Math.max(0, categoriesTotal - categoriesCompletedCount)
    },
    files: {
      bundle_total: bundleTotal,
      changed_count: changedPaths.length,
      unchanged_count: Math.max(0, bundleTotal - changedPaths.length),
      changed_paths: changedPaths
    },
    changed_items: changedItems.slice(0, 120),
    overwritten_items: overwrittenItems.slice(0, 120)
  };
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
  const envName = readStyleGuideEnv('ENV', 'local').toLowerCase();
  const syncRepo = readStyleGuideEnv('SYNC_REPO_STYLE_GUIDE', '').trim();
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
  const renderCacheKey = `${baselineDigest}:${wsState.revision}:${sha256Hex(JSON.stringify(wsState.overrides_by_id || {}))}`;
  const rendered = renderStyleGuideMarkdownFilesMemoized(mergedData, renderCacheKey);

  const referenceData = wsState.last_pushed_overrides_by_id
    ? mergeBaselineWithOverrides(baselineData, wsState.last_pushed_overrides_by_id)
    : baselineData;
  const referenceLabel = wsState.last_pushed_branch
    ? `last pushed (${wsState.last_pushed_branch})`
    : 'deployed repo baseline';
  const repoDiff = computeStyleGuideChangeReport({
    referenceData,
    candidateData: mergedData,
    candidateRendered: rendered,
    referenceLabel
  });

  // Ensure hosted files directory is materialized
  const hostedCheck = path.join(storageDir, 'hosted', STYLE_GUIDE_DIR_REL_PATH, 'README.md');
  if (!fs.existsSync(hostedCheck)) {
    try {
      materializeHostedFilesOnDisk({ storageDir, releaseRoot, rendered });
    } catch {}
  }

  const referenceDigest = wsState.last_pushed_digest || baselineDigest;
  const hasUnpushedChanges = rendered.decisions_digest_sha256 !== referenceDigest;
  const persistence = inspectPersistenceHealth(storageDir, wsState);

  return {
    releaseRoot,
    schemaPath,
    storageDir,
    wsState,
    persistence,
    baselineData,
    baselineDigest,
    referenceData,
    mergedData,
    rendered,
    repoDiff,
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
  const envName = readStyleGuideEnv('ENV', 'local').toLowerCase();
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
      redirect: 'error',
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

async function fetchRemoteBranchDecisionsIfAvailable(apiBase, repo, commitSha, token) {
  try {
    const contentsRes = await githubApiJson(
      apiBase,
      `/repos/${repo}/contents/${STYLE_GUIDE_DECISIONS_REL_PATH}?ref=${encodeURIComponent(commitSha)}`,
      token
    );
    if (contentsRes.ok && typeof contentsRes.json?.content === 'string') {
      const decoded = Buffer.from(contentsRes.json.content.replace(/\s+/g, ''), 'base64').toString(
        'utf8'
      );
      const parsed = JSON.parse(decoded);
      if (parsed && Array.isArray(parsed.decisions)) {
        return parsed;
      }
    }
  } catch {
    // Fall back cleanly if remote branch doesn't have decisions.json yet or mock API omits /contents
  }
  return null;
}

export async function handleAdminStyleGuideRoute(args) {
  try {
    return await handleAdminStyleGuideRouteInner(args);
  } catch (err) {
    if (err instanceof StyleGuideAdminError) {
      return args.sendJson(err.status, { ok: false, error: err.message, code: err.code });
    }
    throw err;
  }
}

async function handleAdminStyleGuideRouteInner({
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
  if (method === 'POST' && !(normPath === '/api/admin/style-guide/push' && body?.dry_run === true)) {
    if (isWritePaused('style_guide')) {
      return sendJson(503, {
        ok: false,
        error: 'Style Guide writes are temporarily paused by operator maintenance.',
        code: 'WRITES_PAUSED'
      });
    }
  }

  // 1. GET /api/admin/style-guide — Load complete Style Guide workspace, persistence health, diff & stats
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
      persistence: snap.persistence,
      repo_diff: snap.repoDiff,
      permissions: {
        can_save_draft_and_notes: true,
        can_approve: Boolean(ctx.isTopAdmin),
        can_reset: Boolean(ctx.isTopAdmin),
        can_push_repo: Boolean(ctx.isTopAdmin)
      },
      github_push: {
        repo: ghCfg.repo,
        environment_role: ghCfg.environmentRole,
        default_branch: ghCfg.defaultBranch,
        suggested_branches: ghCfg.environmentRole === 'staging2'
          ? ['testing/yaman-staging2', 'antigravity/staging2-latest', 'working/biteshark-vps']
          : ['working/biteshark-vps', 'testing/yaman-staging2', 'antigravity/staging2-latest'],
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

  // 3. POST /api/admin/style-guide/save — Save batch with change recognition & overwrite Confirm/Deny
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

    for (const item of rawUpdates) {
      if (!item || typeof item !== 'object') {
        return sendJson(400, {
          ok: false,
          error: 'Each update item must be an object.',
          code: 'INVALID_UPDATES_PAYLOAD'
        });
      }
      if ('status' in item && item.status !== undefined && item.status !== null) {
        const cleanSt = typeof item.status === 'string' ? item.status.trim() : '';
        if (!VALID_DECISION_STATUSES.has(cleanSt)) {
          return sendJson(400, {
            ok: false,
            error: `Invalid style-guide status "${String(item.status)}".`,
            code: 'INVALID_DECISION_STATUS'
          });
        }
      }
    }

    const storageDirForLock = resolveStyleGuideStorageDir();
    return withWorkspaceLock(storageDirForLock, async () => {
      const snap = loadCurrentWorkspaceSnapshot();
      const prevById = new Map(snap.mergedData.decisions.map(d => [d.decision_id, d]));

      const needsTopForApproval = rawUpdates.some(u => {
        const cleanSt = typeof u?.status === 'string' ? u.status.trim() : null;
        if (cleanSt === 'approved' || cleanSt === 'not_applicable') return true;
        const decId = String(u?.decision_id || '').trim();
        const prevDec = prevById.get(decId);
        if (
          prevDec &&
          (prevDec.status === 'approved' || prevDec.status === 'not_applicable')
        ) {
          return true;
        }
        return false;
      });

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
            ? 'Creating, editing, or changing Approved or Not Applicable style-guide decisions requires Admin: Top.'
            : authCheck.error,
          code: needsTopForApproval ? 'TOP_ADMIN_REQUIRED_FOR_APPROVAL' : 'UNAUTHORIZED'
        });
      }

      const confirmOverwrite = body?.confirm_overwrite === true;

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

        const prevDec = prevById.get(decId) || cloneJson(baseDec);

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
          const cleanSuppliedBy =
            typeof item.approved_by === 'string'
              ? item.approved_by.replace(/[^A-Za-z0-9 ._@+-]/g, '').trim()
              : '';
          const suppliedBy =
            cleanSuppliedBy.length >= 2
              ? cleanSuppliedBy.slice(0, 80)
              : prevDec.approval?.approved_by || defaultApprover;
          const suppliedAt =
            typeof item.approved_at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.approved_at.trim())
              ? item.approved_at.trim().slice(0, 32)
              : prevDec.approval?.approved_at || todayPacific;
          nextApproval = {
            approved_by: suppliedBy,
            approved_at: suppliedAt
          };
        }

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
      const saveDiff = computeStyleGuideChangeReport({
        referenceData: snap.mergedData,
        candidateData: candidateMerged,
        referenceRendered: snap.rendered,
        candidateRendered: rendered,
        referenceLabel: 'current saved workspace'
      });

      // Guard 1: Concurrent revision mismatch requires explicit Confirm / Deny overwrite
      if (
        !confirmOverwrite &&
        body.expected_revision !== undefined &&
        body.expected_revision !== null &&
        Number(body.expected_revision) !== snap.wsState.revision
      ) {
        return sendJson(409, {
          ok: false,
          requires_confirmation: true,
          conflict_kind: 'concurrent_revision',
          error:
            'Another administrator saved Style Guide updates since you loaded this page. Confirm to overwrite with your changes or Deny to reload the latest saved state.',
          code: 'REVISION_CONFLICT',
          current_revision: snap.wsState.revision,
          updated_at: snap.wsState.updated_at,
          updated_by_label: snap.wsState.updated_by_label,
          save_diff: saveDiff
        });
      }

      // Guard 2: Overwriting or clearing any previously saved answer/note requires explicit Confirm / Deny
      if (!confirmOverwrite && saveDiff.counts.overwrite_total_count > 0) {
        return sendJson(409, {
          ok: false,
          requires_confirmation: true,
          conflict_kind: 'existing_answers',
          error: `This save rewrites or clears ${saveDiff.counts.overwrite_total_count} previously saved Style Guide item(s). Confirm to overwrite or Deny to keep the existing saved values.`,
          code: 'OVERWRITE_CONFIRMATION_REQUIRED',
          current_revision: snap.wsState.revision,
          save_diff: saveDiff
        });
      }

      if (saveDiff.counts.overwrite_total_count > 0) {
        saveHistorySnapshotBeforeChange(snap.storageDir, snap.wsState, 'overwrite_confirmed_save');
      }

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

      const repoDiff = computeStyleGuideChangeReport({
        referenceData: snap.referenceData,
        candidateData: candidateMerged,
        candidateRendered: rendered,
        referenceLabel: nextWsState.last_pushed_branch
          ? `last pushed (${nextWsState.last_pushed_branch})`
          : 'deployed repo baseline'
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
            newly_written_count: saveDiff.counts.newly_written_count,
            rewritten_count: saveDiff.counts.rewritten_count,
            cleared_count: saveDiff.counts.cleared_count,
            confirm_overwrite: confirmOverwrite,
            sample_decision_ids: touchedIds.slice(0, 10),
            decisions_digest_sha256: rendered.decisions_digest_sha256,
            totals: rendered.stats.totals,
            questions_left_unanswered: saveDiff.questions.left_unanswered,
            with_notes_count: rendered.stats.with_notes_count
          }
        });
      });

      const refDigest = nextWsState.last_pushed_digest || snap.baselineDigest;
      const updatedDecisions = candidateMerged.decisions.filter(d => touchedIds.includes(d.decision_id));
      const persistence = inspectPersistenceHealth(snap.storageDir, nextWsState);

      return sendJson(200, {
        ok: true,
        revision: nextRevision,
        updated_at: nowIso,
        updated_by_label: actorLabel,
        current_digest_sha256: rendered.decisions_digest_sha256,
        has_unpushed_changes: rendered.decisions_digest_sha256 !== refDigest,
        override_count: Object.keys(nextOverrides).length,
        persistence,
        save_diff: saveDiff,
        repo_diff: repoDiff,
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

    const storageDirForLock = resolveStyleGuideStorageDir();
    return withWorkspaceLock(storageDirForLock, async () => {
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
        const baselineIds = new Set(snap.baselineData.decisions.map(d => d.decision_id));
        if (!baselineIds.has(id)) {
          return sendJson(400, {
            ok: false,
            error: `Unknown style-guide decision_id "${id}".`,
            code: 'UNKNOWN_DECISION_ID'
          });
        }
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
      const validation = validateStyleGuideData(candidateMerged, { schemaPath: snap.schemaPath });
      if (!validation.ok) {
        return sendJson(400, {
          ok: false,
          error: validation.errors[0] || 'Cannot reset entry while another decision still references it.',
          errors: validation.errors.slice(0, 10),
          code: 'STYLE_GUIDE_VALIDATION_FAILED'
        });
      }

      saveHistorySnapshotBeforeChange(snap.storageDir, snap.wsState, `reset_${resetScope}`);

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

      const repoDiff = computeStyleGuideChangeReport({
        referenceData: snap.referenceData,
        candidateData: candidateMerged,
        candidateRendered: rendered,
        referenceLabel: nextWsState.last_pushed_branch
          ? `last pushed (${nextWsState.last_pushed_branch})`
          : 'deployed repo baseline'
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
        persistence: inspectPersistenceHealth(snap.storageDir, nextWsState),
        repo_diff: repoDiff,
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
    });
  }

  // 5. POST /api/admin/style-guide/push — Upload current version to respective GitHub branch with diff/remaining feedback
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
          'A GitHub Personal Access Token (Contents: Read & Write on yamanalmasaleha-png/trukly-) is required. Enter a one-time token in the Upload dialog or configure BITESHARK_STYLE_GUIDE_GITHUB_TOKEN in staging.env.',
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

    // 5b. Compare against live remote `decisions.json` on `refLookupBranch` when available
    const remoteDecisionsData = await fetchRemoteBranchDecisionsIfAvailable(
      apiBase,
      ghCfg.repo,
      parentCommitSha,
      effectiveToken
    );
    const comparisonRefData = remoteDecisionsData || snap.referenceData;
    const comparisonLabel = remoteDecisionsData
      ? `remote ${refLookupBranch} @ ${parentCommitSha.slice(0, 8)}`
      : snap.repoDiff.reference_label;

    const uploadReport = computeStyleGuideChangeReport({
      referenceData: comparisonRefData,
      candidateData: snap.mergedData,
      candidateRendered: snap.rendered,
      referenceLabel: comparisonLabel
    });

    // If `dry_run: true`, return the exact remote diff & remaining report without committing
    if (body?.dry_run === true) {
      return sendJson(200, {
        ok: true,
        dry_run: true,
        repo: ghCfg.repo,
        branch: targetBranch,
        parent_commit_sha: parentCommitSha,
        remote_decisions_inspected: Boolean(remoteDecisionsData),
        upload_report: uploadReport
      });
    }

    // If remote branch has existing saved answers that this upload rewrites or clears, require confirm_overwrite!
    const confirmRemoteOverwrite = body?.confirm_overwrite === true;
    if (
      remoteDecisionsData &&
      !confirmRemoteOverwrite &&
      uploadReport.counts.overwrite_total_count > 0
    ) {
      return sendJson(409, {
        ok: false,
        requires_confirmation: true,
        conflict_kind: 'remote_branch_overwrite',
        code: 'REMOTE_OVERWRITE_CONFIRMATION_REQUIRED',
        error: `Branch "${targetBranch}" on GitHub already has ${uploadReport.counts.overwrite_total_count} Style Guide entry/entries that will be rewritten or cleared by this upload. Confirm to overwrite on GitHub or Deny to cancel.`,
        branch: targetBranch,
        parent_commit_sha: parentCommitSha,
        upload_report: uploadReport
      });
    }

    const totals = snap.rendered.stats.totals;
    const defaultCommitMsg = `docs(style-guide): sync style guide (${uploadReport.counts.newly_written_count} written, ${uploadReport.counts.rewritten_count} rewritten, ${uploadReport.questions.left_unanswered} left)`;
    const commitMessage =
      typeof body?.commit_message === 'string' && body.commit_message.trim().length >= 5
        ? body.commit_message.trim().slice(0, 240)
        : defaultCommitMsg;

    const actorEmailFallback =
      typeof ctx.user?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ctx.user.email.trim())
        ? ctx.user.email.trim().slice(0, 120)
        : 'admin@biteshark.invalid';
    const actorNameFallback =
      actorEmailFallback
        .split('@')[0]
        .replace(/[^A-Za-z0-9 ._-]/g, '')
        .trim() || 'BiteShark Top Admin';

    const authorName =
      typeof body?.author_name === 'string' && body.author_name.trim().length >= 2
        ? body.author_name.trim().slice(0, 80)
        : actorNameFallback;
    const authorEmail =
      typeof body?.author_email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.author_email.trim())
        ? body.author_email.trim().slice(0, 120)
        : actorEmailFallback;

    // 5c. Assemble strict 19-file bundle under `docs/engineering/style-guide/*` ONLY
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

    // 5d. Create Git tree
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

    // 5e. Create Git commit
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

    // 5f. Advance or create target ref
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
    const { postPushRepoDiff, stillHasUnpushedChanges } = await withWorkspaceLock(
      snap.storageDir,
      async () => {
        const latestWsState = readWorkspaceState(snap.storageDir);
        const nextWsState = {
          ...latestWsState,
          last_pushed_digest: snap.rendered.decisions_digest_sha256,
          last_pushed_commit_sha: newCommitSha,
          last_pushed_commit_url: commitUrl,
          last_pushed_branch: targetBranch,
          last_pushed_at: pushedAtIso,
          last_pushed_overrides_by_id: cloneJson(snap.wsState.overrides_by_id || {})
        };
        writeAtomicUtf8(
          path.join(snap.storageDir, 'workspace-state.json'),
          JSON.stringify(nextWsState, null, 2) + '\n'
        );

        const latestMerged = mergeBaselineWithOverrides(
          snap.baselineData,
          latestWsState.overrides_by_id
        );
        const latestRendered = renderStyleGuideMarkdownFiles(latestMerged);
        const diff = computeStyleGuideChangeReport({
          referenceData: snap.mergedData,
          candidateData: latestMerged,
          candidateRendered: latestRendered,
          referenceLabel: `last pushed (${targetBranch})`
        });
        return {
          postPushRepoDiff: diff,
          stillHasUnpushedChanges:
            latestRendered.decisions_digest_sha256 !== snap.rendered.decisions_digest_sha256
        };
      }
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
          files_changed_count: uploadReport.files.changed_count,
          newly_written_count: uploadReport.counts.newly_written_count,
          rewritten_count: uploadReport.counts.rewritten_count,
          cleared_count: uploadReport.counts.cleared_count,
          elements_touched_count: uploadReport.elements.touched_count,
          questions_left_unanswered: uploadReport.questions.left_unanswered,
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
      files_changed_count: uploadReport.files.changed_count,
      upload_report: uploadReport,
      repo_diff: postPushRepoDiff,
      has_unpushed_changes: stillHasUnpushedChanges
    });
  }

  return sendJson(404, { ok: false, error: 'Style guide endpoint not found.' });
}
