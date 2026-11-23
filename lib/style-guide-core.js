// BiteShark Design Style Guide & Tracked Completion Engine (`lib/style-guide-core.js`)
//
// Shared zero-dependency runtime & CLI engine used by:
//   - `tools/style-guide/lib.mjs` (`npm run style-guide:generate`, `npm run style-guide:validate`)
//   - `lib/style-guide-admin.js` (`/admin` Style Guide Workspace, live hosted Markdown rendering, and GitHub push)
//
// Maintains strict separation between:
//   1. Observed UI Inventory (code-grounded selectors, DOM IDs, files, symbols, roles, variants, states)
//   2. Unanswered / Draft / Approved Design Decisions (`decisions.json` -> deterministic questionnaires + `COMPLETION-REMINDER.md`)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateJsonWithSchemaFile } from './json-schema-lite.js';

export const STYLE_GUIDE_GENERATOR_VERSION = '1.0.0';
export const STYLE_GUIDE_SCHEMA_REL_PATH = 'docs/engineering/schemas/style-guide-decisions.schema.json';
export const STYLE_GUIDE_DECISIONS_REL_PATH = 'docs/engineering/style-guide/decisions.json';
export const STYLE_GUIDE_DIR_REL_PATH = 'docs/engineering/style-guide';

function asciiCompare(a, b) {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

const PLACEHOLDER_NORMALIZED_SET = new Set([
  '',
  'tbd',
  'todo',
  'to be determined',
  'to be decided',
  'later',
  'decide later',
  'fill later',
  'fill in later',
  'come back later',
  'pending',
  'pending review',
  'n/a',
  'na',
  'not applicable',
  'unk',
  'unknown',
  '?',
  '??',
  '???',
  '-',
  '--',
  '---',
  'none yet',
  'wip',
  'work in progress',
  'placeholder',
  'unanswered',
  'blank',
  'null',
  'undefined',
  'same as css',
  'keep current css',
  'use existing css'
]);

const ISO_DATE_OR_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
const DECISION_REF_RE = /^ref:(DEC-[A-Z0-9-]+)$/;

export function normalizePlaceholderCandidate(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[\s"'`[\]().,:;!]+|[\s"'`[\]().,:;!]+$/g, '')
    .replace(/\s+/g, ' ');
}

export function isPlaceholderString(val) {
  if (typeof val !== 'string') return false;
  if (val.trim().length === 0) return true;
  const norm = normalizePlaceholderCandidate(val);
  return PLACEHOLDER_NORMALIZED_SET.has(norm);
}

export function containsPlaceholderOrBlankLeaf(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return isPlaceholderString(val);
  if (typeof val === 'boolean') return false;
  if (typeof val === 'number') return !Number.isFinite(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return true;
    return val.some(item => containsPlaceholderOrBlankLeaf(item));
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length === 0) return true;
    return keys.some(k => isPlaceholderString(k) || containsPlaceholderOrBlankLeaf(val[k]));
  }
  return true;
}

export function anchorSlug(idOrText) {
  return String(idOrText || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtmlAnglesOutsideBackticks(raw) {
  return String(raw ?? '')
    .split(/(`[^`]*`)/g)
    .map((segment, idx) =>
      idx % 2 === 1 ? segment : segment.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    )
    .join('');
}

function escapeMdCell(raw) {
  return escapeHtmlAnglesOutsideBackticks(raw)
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

export function formatDecisionValueCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return `\`${value}\``;
  if (typeof value === 'number') return `\`${value}\``;
  if (typeof value === 'string') {
    const refMatch = DECISION_REF_RE.exec(value.trim());
    if (refMatch) return `\`${value.trim()}\``;
    return escapeMdCell(value);
  }
  return `\`${escapeMdCell(JSON.stringify(value))}\``;
}

export function formatExpectedAnswerSummary(expected) {
  if (!expected || typeof expected !== 'object') return '';
  const parts = [`**Type**: \`${expected.type}\``];
  if (Array.isArray(expected.allowed_choices) && expected.allowed_choices.length > 0) {
    parts.push(`**Allowed**: ${expected.allowed_choices.map(c => `\`${escapeMdCell(c)}\``).join(', ')}`);
  }
  const bounds = [];
  if (typeof expected.minimum === 'number') bounds.push(`min \`${expected.minimum}\``);
  if (typeof expected.maximum === 'number') bounds.push(`max \`${expected.maximum}\``);
  if (expected.unit) bounds.push(`unit \`${escapeMdCell(expected.unit)}\``);
  if (bounds.length > 0) parts.push(`(${bounds.join(', ')})`);
  if (expected.allows_decision_ref !== false) {
    parts.push(`*(or \`ref:DEC-...\`)*`);
  }
  parts.push(`— ${escapeMdCell(expected.constraints)}`);
  return parts.join(' ');
}

function extractRepoPathFromLinkTarget(rawLink) {
  const clean = String(rawLink || '').split('#')[0].trim();
  return clean;
}

function loadFeatureControlKeysIfPresent(repoRoot) {
  if (!repoRoot) return null;
  const fcPath = path.join(repoRoot, 'lib', 'feature-controls.js');
  if (!fs.existsSync(fcPath)) return null;
  const text = fs.readFileSync(fcPath, 'utf8');
  const keys = new Set();
  for (const m of text.matchAll(/key:\s*'([a-z0-9_]+)'/g)) {
    keys.add(m[1]);
  }
  return keys.size > 0 ? keys : null;
}

export function validateValueAgainstExpectedSpec(value, expected, decisionId) {
  const errs = [];
  if (typeof value === 'string') {
    const refMatch = DECISION_REF_RE.exec(value.trim());
    if (refMatch) {
      if (expected.allows_decision_ref === false) {
        errs.push(`Decision ${decisionId}: decision reference "${value}" is not permitted for this field.`);
      }
      return { errs, refTargetId: refMatch[1] };
    }
  }

  switch (expected.type) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        errs.push(`Decision ${decisionId}: expected boolean (true or false), got ${JSON.stringify(value)}.`);
      }
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errs.push(`Decision ${decisionId}: expected finite number, got ${JSON.stringify(value)}.`);
      } else {
        if (typeof expected.minimum === 'number' && value < expected.minimum) {
          errs.push(`Decision ${decisionId}: numeric value ${value} is below minimum ${expected.minimum}.`);
        }
        if (typeof expected.maximum === 'number' && value > expected.maximum) {
          errs.push(`Decision ${decisionId}: numeric value ${value} exceeds maximum ${expected.maximum}.`);
        }
      }
      break;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errs.push(`Decision ${decisionId}: expected integer, got ${JSON.stringify(value)}.`);
      } else {
        if (typeof expected.minimum === 'number' && value < expected.minimum) {
          errs.push(`Decision ${decisionId}: integer value ${value} is below minimum ${expected.minimum}.`);
        }
        if (typeof expected.maximum === 'number' && value > expected.maximum) {
          errs.push(`Decision ${decisionId}: integer value ${value} exceeds maximum ${expected.maximum}.`);
        }
      }
      break;
    case 'string':
      if (typeof value !== 'string') {
        errs.push(`Decision ${decisionId}: expected non-empty string, got ${JSON.stringify(value)}.`);
      } else if (isPlaceholderString(value)) {
        errs.push(
          `Decision ${decisionId}: blank or placeholder string ${JSON.stringify(value)} is not a valid answer.`
        );
      }
      break;
    case 'enum_choice':
      if (typeof value !== 'string') {
        errs.push(`Decision ${decisionId}: expected enum_choice string, got ${JSON.stringify(value)}.`);
      } else if (isPlaceholderString(value)) {
        errs.push(
          `Decision ${decisionId}: blank or placeholder string ${JSON.stringify(value)} is not a valid enum_choice.`
        );
      } else if (
        Array.isArray(expected.allowed_choices) &&
        expected.allowed_choices.length > 0 &&
        !expected.allowed_choices.includes(value)
      ) {
        errs.push(
          `Decision ${decisionId}: value ${JSON.stringify(value)} is not one of allowed_choices [${expected.allowed_choices.join(', ')}].`
        );
      }
      break;
    case 'string_list':
      if (!Array.isArray(value) || value.length === 0) {
        errs.push(`Decision ${decisionId}: expected non-empty string_list array.`);
      } else {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] !== 'string' || isPlaceholderString(value[i])) {
            errs.push(
              `Decision ${decisionId}: string_list[${i}] (${JSON.stringify(value[i])}) must be a non-placeholder string.`
            );
          }
        }
      }
      break;
    case 'token_map':
    case 'structured_spec':
      if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
        errs.push(`Decision ${decisionId}: expected non-empty ${expected.type} object.`);
      } else if (containsPlaceholderOrBlankLeaf(value)) {
        errs.push(
          `Decision ${decisionId}: ${expected.type} object contains blank, null, or placeholder values.`
        );
      }
      break;
    default:
      errs.push(`Decision ${decisionId}: unsupported expected_answer.type "${expected.type}".`);
  }

  return { errs, refTargetId: null };
}

export function validateStyleGuideData(data, { repoRoot = null, schemaPath = null } = {}) {
  const errors = [];
  const resolvedSchemaPath =
    schemaPath || (repoRoot ? path.join(repoRoot, STYLE_GUIDE_SCHEMA_REL_PATH) : null);

  if (resolvedSchemaPath) {
    const schemaErrs = validateJsonWithSchemaFile(data, resolvedSchemaPath);
    for (const e of schemaErrs) {
      errors.push(`Schema error ${e}`);
    }
    if (schemaErrs.length > 0) {
      return { ok: false, errors };
    }
  }

  const invariantIds = new Set();
  for (const inv of data.mandatory_invariants || []) {
    if (invariantIds.has(inv.invariant_id)) {
      errors.push(`Duplicate mandatory invariant_id "${inv.invariant_id}".`);
    }
    invariantIds.add(inv.invariant_id);
    if (repoRoot) {
      for (const docRel of inv.authoritative_docs || []) {
        const cleanRel = extractRepoPathFromLinkTarget(docRel);
        if (!cleanRel || !fs.existsSync(path.join(repoRoot, cleanRel))) {
          errors.push(`Invariant ${inv.invariant_id}: authoritative_doc "${docRel}" does not exist.`);
        }
      }
    }
  }

  const topicsBySlug = new Map();
  const topicFiles = new Set();
  for (const t of data.topics || []) {
    if (topicsBySlug.has(t.slug)) {
      errors.push(`Duplicate topic slug "${t.slug}".`);
    }
    if (topicFiles.has(t.file)) {
      errors.push(`Duplicate topic file "${t.file}".`);
    }
    topicsBySlug.set(t.slug, t);
    topicFiles.add(t.file);
    for (const invId of t.mandatory_invariant_ids || []) {
      if (!invariantIds.has(invId)) {
        errors.push(`Topic "${t.slug}": unknown mandatory_invariant_id "${invId}".`);
      }
    }
  }

  const requiredDimensionKeys = new Set();
  for (const dim of data.component_dimensions_catalog || []) {
    if (requiredDimensionKeys.has(dim.key)) {
      errors.push(`Duplicate component dimension key "${dim.key}".`);
    }
    requiredDimensionKeys.add(dim.key);
  }

  const knownFeatureKeys = loadFeatureControlKeysIfPresent(repoRoot);
  const componentsById = new Map();
  for (const cmp of data.components || []) {
    if (componentsById.has(cmp.component_id)) {
      errors.push(`Duplicate component_id "${cmp.component_id}".`);
    }
    componentsById.set(cmp.component_id, cmp);

    if (!topicsBySlug.has(cmp.topic)) {
      errors.push(`Component ${cmp.component_id}: unknown topic "${cmp.topic}".`);
    }
    if (cmp.applicability === 'unconfirmed' && isPlaceholderString(cmp.applicability_note || '')) {
      errors.push(
        `Component ${cmp.component_id}: unconfirmed applicability requires a meaningful applicability_note.`
      );
    }
    if (knownFeatureKeys) {
      for (const fk of cmp.related_feature_keys || []) {
        if (!knownFeatureKeys.has(fk)) {
          errors.push(
            `Component ${cmp.component_id}: related_feature_key "${fk}" is not registered in lib/feature-controls.js.`
          );
        }
      }
    }
    if (repoRoot) {
      if (cmp.evidence_level !== 'unconfirmed_future_or_branch') {
        for (const defFile of cmp.definition_files || []) {
          const cleanRel = extractRepoPathFromLinkTarget(defFile).split(':')[0];
          if (!cleanRel || !fs.existsSync(path.join(repoRoot, cleanRel))) {
            errors.push(
              `Component ${cmp.component_id}: definition_file "${defFile}" does not exist in workspace.`
            );
          }
        }
      }
      for (const linkRel of cmp.source_and_handbook_links || []) {
        const cleanRel = extractRepoPathFromLinkTarget(linkRel);
        if (!cleanRel || !fs.existsSync(path.join(repoRoot, cleanRel))) {
          errors.push(
            `Component ${cmp.component_id}: source_and_handbook_link "${linkRel}" does not exist in workspace.`
          );
        }
      }
    }
  }

  const decisionsById = new Map();
  const dimensionsByComponent = new Map();
  const refTargetsByDecision = new Map();

  for (const dec of data.decisions || []) {
    if (decisionsById.has(dec.decision_id)) {
      errors.push(`Duplicate decision_id "${dec.decision_id}".`);
    }
    decisionsById.set(dec.decision_id, dec);

    if (!topicsBySlug.has(dec.topic)) {
      errors.push(`Decision ${dec.decision_id}: unknown topic "${dec.topic}".`);
    }
    if (dec.component_id !== null) {
      const cmp = componentsById.get(dec.component_id);
      if (!cmp) {
        errors.push(`Decision ${dec.decision_id}: unknown component_id "${dec.component_id}".`);
      } else if (cmp.topic !== dec.topic) {
        errors.push(
          `Decision ${dec.decision_id}: topic "${dec.topic}" does not match component ${cmp.component_id} topic "${cmp.topic}".`
        );
      }
    }
    if (dec.dimension !== null) {
      if (!requiredDimensionKeys.has(dec.dimension)) {
        errors.push(`Decision ${dec.decision_id}: unknown component dimension "${dec.dimension}".`);
      } else if (dec.component_id) {
        if (!dimensionsByComponent.has(dec.component_id)) {
          dimensionsByComponent.set(dec.component_id, new Set());
        }
        dimensionsByComponent.get(dec.component_id).add(dec.dimension);
      }
    }

    for (const invId of dec.mandatory_invariant_ids || []) {
      if (!invariantIds.has(invId)) {
        errors.push(`Decision ${dec.decision_id}: unknown mandatory_invariant_id "${invId}".`);
      }
    }

    if (dec.applicability === 'unconfirmed' && isPlaceholderString(dec.applicability_note || '')) {
      errors.push(
        `Decision ${dec.decision_id}: applicability="unconfirmed" requires a non-empty applicability_note.`
      );
    }

    // Optional `notes` validation: never required, allowed on any status, max 2000 chars if non-null
    if (dec.notes !== undefined && dec.notes !== null) {
      if (typeof dec.notes !== 'string') {
        errors.push(`Decision ${dec.decision_id}: optional notes must be a string or null.`);
      } else if (dec.notes.length > 2000) {
        errors.push(`Decision ${dec.decision_id}: optional notes cannot exceed 2000 characters.`);
      }
    }

    // Enforce status, applicability, value, reason, and approval consistency (`Section 20.G`)
    if (dec.status === 'not_applicable' || dec.applicability === 'not_applicable') {
      if (dec.status !== 'not_applicable' || dec.applicability !== 'not_applicable') {
        errors.push(
          `Decision ${dec.decision_id}: status ("${dec.status}") and applicability ("${dec.applicability}") must both be "not_applicable" when marking a decision not applicable.`
        );
      }
      if (dec.value !== null) {
        errors.push(`Decision ${dec.decision_id}: status="not_applicable" must keep value=null.`);
      }
      if (
        typeof dec.not_applicable_reason !== 'string' ||
        isPlaceholderString(dec.not_applicable_reason) ||
        dec.not_applicable_reason.trim().length < 8
      ) {
        errors.push(
          `Decision ${dec.decision_id}: not_applicable requires a meaningful not_applicable_reason (>= 8 chars, non-placeholder).`
        );
      }
    } else if (dec.status === 'unanswered') {
      if (dec.value !== null) {
        errors.push(
          `Decision ${dec.decision_id}: status="unanswered" has a non-null value; set status to "draft" or "approved" when recording an answer.`
        );
      }
      if (dec.not_applicable_reason !== null) {
        errors.push(
          `Decision ${dec.decision_id}: status="unanswered" must have not_applicable_reason=null.`
        );
      }
      if (dec.approval.approved_by !== null || dec.approval.approved_at !== null) {
        errors.push(
          `Decision ${dec.decision_id}: status="unanswered" cannot carry approval metadata.`
        );
      }
    } else if (dec.status === 'draft') {
      if (dec.applicability !== 'applicable') {
        errors.push(
          `Decision ${dec.decision_id}: confirm applicability="applicable" before setting status="draft" (current applicability="${dec.applicability}").`
        );
      }
      if (dec.value === null) {
        errors.push(`Decision ${dec.decision_id}: status="draft" cannot have a blank (null) value.`);
      } else {
        const { errs, refTargetId } = validateValueAgainstExpectedSpec(
          dec.value,
          dec.expected_answer,
          dec.decision_id
        );
        errors.push(...errs);
        if (refTargetId) refTargetsByDecision.set(dec.decision_id, refTargetId);
      }
      if (dec.not_applicable_reason !== null) {
        errors.push(`Decision ${dec.decision_id}: status="draft" must have not_applicable_reason=null.`);
      }
      if (dec.approval.approved_by !== null || dec.approval.approved_at !== null) {
        errors.push(
          `Decision ${dec.decision_id}: status="draft" must leave approved_by and approved_at null until approved.`
        );
      }
    } else if (dec.status === 'approved') {
      if (dec.applicability !== 'applicable') {
        errors.push(
          `Decision ${dec.decision_id}: status="approved" requires applicability="applicable" (got "${dec.applicability}").`
        );
      }
      if (dec.value === null) {
        errors.push(`Decision ${dec.decision_id}: status="approved" cannot have a blank (null) value.`);
      } else {
        const { errs, refTargetId } = validateValueAgainstExpectedSpec(
          dec.value,
          dec.expected_answer,
          dec.decision_id
        );
        errors.push(...errs);
        if (refTargetId) refTargetsByDecision.set(dec.decision_id, refTargetId);
      }
      if (dec.not_applicable_reason !== null) {
        errors.push(`Decision ${dec.decision_id}: status="approved" must have not_applicable_reason=null.`);
      }
      if (
        typeof dec.approval.approved_by !== 'string' ||
        isPlaceholderString(dec.approval.approved_by) ||
        dec.approval.approved_by.trim().length < 2
      ) {
        errors.push(
          `Decision ${dec.decision_id}: status="approved" requires a valid approval.approved_by owner.`
        );
      }
      if (
        typeof dec.approval.approved_at !== 'string' ||
        !ISO_DATE_OR_TIMESTAMP_RE.test(dec.approval.approved_at.trim())
      ) {
        errors.push(
          `Decision ${dec.decision_id}: status="approved" requires an ISO-8601 approval.approved_at date (e.g. YYYY-MM-DD).`
        );
      }
    }
  }

  for (const dec of data.decisions || []) {
    for (const relId of dec.related_decisions || []) {
      if (relId === dec.decision_id) {
        errors.push(`Decision ${dec.decision_id}: related_decisions cannot reference itself.`);
      } else if (!decisionsById.has(relId)) {
        errors.push(
          `Decision ${dec.decision_id}: broken related_decisions reference "${relId}" (decision does not exist).`
        );
      }
    }

    const refTarget = refTargetsByDecision.get(dec.decision_id);
    if (refTarget) {
      if (refTarget === dec.decision_id) {
        errors.push(`Decision ${dec.decision_id}: value cannot self-reference "ref:${refTarget}".`);
      } else if (!decisionsById.has(refTarget)) {
        errors.push(
          `Decision ${dec.decision_id}: broken value reference "ref:${refTarget}" (target decision does not exist).`
        );
      } else {
        const visited = new Set([dec.decision_id]);
        let cursor = refTarget;
        let hasCycle = false;
        while (cursor) {
          if (visited.has(cursor)) {
            hasCycle = true;
            break;
          }
          visited.add(cursor);
          cursor = refTargetsByDecision.get(cursor) || null;
        }
        if (hasCycle) {
          errors.push(
            `Decision ${dec.decision_id}: circular decision value reference chain detected starting at "ref:${refTarget}".`
          );
        } else if (dec.status === 'approved') {
          const targetDec = decisionsById.get(refTarget);
          if (targetDec.status !== 'approved') {
            errors.push(
              `Decision ${dec.decision_id}: cannot be "approved" while referenced target "${refTarget}" has status="${targetDec.status}".`
            );
          }
        }
      }
    }
  }

  for (const cmp of data.components || []) {
    if (cmp.applicability !== 'applicable') continue;
    const covered = dimensionsByComponent.get(cmp.component_id) || new Set();
    const missingDims = [...requiredDimensionKeys].filter(k => !covered.has(k));
    if (missingDims.length > 0) {
      errors.push(
        `Component ${cmp.component_id} (${cmp.implementation_name}) is missing required decision dimensions: ${missingDims.join(', ')}.`
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

export function computeCompletionStats(data) {
  const topicsOrdered = [...data.topics].sort((a, b) => a.order - b.order || asciiCompare(a.slug, b.slug));
  const byTopic = new Map();
  for (const t of topicsOrdered) {
    byTopic.set(t.slug, {
      topic: t,
      total: 0,
      applicable_unanswered: 0,
      unconfirmed_pending: 0,
      draft: 0,
      approved: 0,
      not_applicable: 0
    });
  }

  const totals = {
    total: 0,
    applicable_unanswered: 0,
    unconfirmed_pending: 0,
    draft: 0,
    approved: 0,
    not_applicable: 0
  };

  let withNotesCount = 0;
  const unansweredApplicable = [];
  const unconfirmedPending = [];
  const draftPending = [];
  const approvedItems = [];
  const notApplicableItems = [];

  for (const dec of data.decisions) {
    const bucket = byTopic.get(dec.topic);
    totals.total += 1;
    if (bucket) bucket.total += 1;
    if (typeof dec.notes === 'string' && dec.notes.trim().length > 0) {
      withNotesCount += 1;
    }

    if (dec.status === 'not_applicable') {
      totals.not_applicable += 1;
      if (bucket) bucket.not_applicable += 1;
      notApplicableItems.push(dec);
    } else if (dec.status === 'approved') {
      totals.approved += 1;
      if (bucket) bucket.approved += 1;
      approvedItems.push(dec);
    } else if (dec.status === 'draft') {
      totals.draft += 1;
      if (bucket) bucket.draft += 1;
      draftPending.push(dec);
    } else if (dec.applicability === 'unconfirmed') {
      totals.unconfirmed_pending += 1;
      if (bucket) bucket.unconfirmed_pending += 1;
      unconfirmedPending.push(dec);
    } else {
      totals.applicable_unanswered += 1;
      if (bucket) bucket.applicable_unanswered += 1;
      unansweredApplicable.push(dec);
    }
  }

  const remainingGapCount =
    totals.applicable_unanswered + totals.unconfirmed_pending + totals.draft;
  const resolvedCount = totals.approved + totals.not_applicable;

  let lifecycleMode = 'partially_completed';
  if (remainingGapCount === 0) {
    lifecycleMode = 'complete';
  } else if (resolvedCount === 0 && totals.draft === 0) {
    lifecycleMode = 'initial_unstarted';
  }

  return {
    lifecycle_mode: lifecycleMode,
    is_complete: remainingGapCount === 0,
    remaining_gap_count: remainingGapCount,
    resolved_count: resolvedCount,
    with_notes_count: withNotesCount,
    totals,
    by_topic: topicsOrdered.map(t => byTopic.get(t.slug)),
    unanswered_applicable: unansweredApplicable,
    unconfirmed_pending: unconfirmedPending,
    draft_pending: draftPending,
    approved_items: approvedItems,
    not_applicable_items: notApplicableItems
  };
}

function toStyleGuideRelLink(repoRelativeTarget) {
  const [filePart, hashPart] = String(repoRelativeTarget).split('#');
  const suffix = hashPart ? `#${hashPart}` : '';
  if (filePart.startsWith('docs/engineering/style-guide/')) {
    return `${filePart.slice('docs/engineering/style-guide/'.length)}${suffix}`;
  }
  if (filePart.startsWith('docs/engineering/')) {
    return `../${filePart.slice('docs/engineering/'.length)}${suffix}`;
  }
  return `../../../${filePart}${suffix}`;
}

function renderGeneratedBanner(decisionsDigest) {
  return [
    `> [!NOTE]`,
    `> **Generated from Structured Source ([decisions.json](decisions.json))** — Do not edit answers directly in Markdown.`,
    `> Update \`docs/engineering/style-guide/decisions.json\` and run \`npm run style-guide:generate\` (verified by \`npm run style-guide:validate\`).`,
    `> - **Generator**: \`biteshark-style-guide@${STYLE_GUIDE_GENERATOR_VERSION}\` (\`biteshark.style-guide-decisions.v1\`)`,
    `> - **Decisions Source Digest**: \`${decisionsDigest}\``
  ].join('\n');
}

function renderReadmeMarkdown(data, stats, decisionsDigest) {
  const lines = [
    `# BiteShark Design Style Guide & Decision Questionnaire`,
    ``,
    `> [!WARNING]`,
    `> **Persistent Assistant & Developer Reminder**:`,
    `> The design style guide is intentionally unfinished. Do not invent approved style decisions or fill blank fields from existing CSS. Before work affected by this guide, inspect its completion report ([COMPLETION-REMINDER.md](COMPLETION-REMINDER.md)). Remind Matt and Yaman of the unanswered decisions relevant to the current task. After explicit answers are recorded, refresh the reminder so it lists the remaining unanswered or unapproved items.`,
    ``,
    renderGeneratedBanner(decisionsDigest),
    ``,
    `---`,
    ``,
    `## 1. Purpose & Two-Layer Architecture`,
    ``,
    `This directory is a **structured design decision questionnaire and UI inventory** for Matt and Yaman to complete incrementally alongside the [Shared Engineering Handbook](../README.md). Its initial blank state (\`null\` machine-readable values and empty answer cells) is **intentional**:`,
    ``,
    `1. **Layer 1 — Observed UI Inventory ([ui-element-inventory.md](ui-element-inventory.md))**:`,
    `   - Records BiteShark's actual UI components, selectors, DOM IDs, source files/symbols, screens, user roles (\`Anonymous Visitor\`, \`Customer\`, \`Vendor Staff\`, \`Vendor Owner\`, \`Admin: Mod\`, \`Admin: Top\`), existing variants/states, feature keys, handbook links, evidence levels, and unresolved CSS/DOM issues.`,
    `   - Observed implementation facts describe what current code on \`${data.source_branch_context}\` does today — they are **not** approved design specifications.`,
    `   - Capabilities that exist only on unmerged branches or represent potential future scope are marked \`unconfirmed\` rather than implied as active.`,
    `2. **Layer 2 — Blank / Tracked Design Decisions ([decisions.json](decisions.json) & Topic Questionnaires)**:`,
    `   - Single structured source of truth in [decisions.json](decisions.json) validated against [style-guide-decisions.schema.json](../schemas/style-guide-decisions.schema.json).`,
    `   - Every unanswered value is \`null\` in JSON and rendered as an empty **Answer** cell in Markdown.`,
    `   - Shared tokens or upstream choices can be referenced with \`ref:<DECISION_ID>\` instead of duplicating values.`,
    ``,
    `---`,
    ``,
    `## 2. Mandatory Requirements That Remain Active At All Times`,
    ``,
    `> [!IMPORTANT]`,
    `> **Blank design choices never suspend mandatory security, privacy, accessibility, or truthful-content rules.**`,
    `> Do not treat unanswered style-guide fields as permission to weaken existing obligations, and never label unanswered accessibility fields as accessibility compliance.`,
    ``,
    `| Invariant ID | Category | Non-Optional Requirement | Authoritative Docs |`,
    `|---|---|---|---|`
  ];

  for (const inv of data.mandatory_invariants) {
    const docLinks = inv.authoritative_docs
      .map(d => `[${path.posix.basename(d.split('#')[0])}](${toStyleGuideRelLink(d)})`)
      .join(', ');
    lines.push(
      `| \`${inv.invariant_id}\` | \`${inv.category}\` | **${escapeMdCell(inv.title)}** — ${escapeMdCell(inv.summary)} | ${docLinks} |`
    );
  }

  lines.push(
    ``,
    `---`,
    ``,
    `## 3. Coding Assistant Protocol (Before, During & After Partial Completion)`,
    ``,
    `Any coding assistant (Antigravity, GPT / Codex, or CLI agent) working on UI, frontend markup, styles, copy, or UX flows **must**:`,
    ``,
    `1. **Inspect actual decision state**: Check [COMPLETION-REMINDER.md](COMPLETION-REMINDER.md) and the relevant topic file(s) before proposing or implementing UI changes.`,
    `2. **Identify task-relevant gaps only**: Note unanswered (\`unanswered\`), unapproved (\`draft\`), or \`unconfirmed\` decisions that directly affect the current task. Keep reminders concise; never dump the entire unfinished guide into routine responses or block backend/security fixes over unrelated style questions.`,
    `3. **Ask when work materially depends on an unanswered choice**: Request an explicit decision from Matt or Yaman when layout, visual treatment, copy, or interaction materially depends on a blank field.`,
    `4. **Continue independent work**: Proceed with backend, database, security, test, or orthogonal UI work that does not depend on the unanswered design choice. Preserve existing UI conventions ([UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md)) for routine maintenance until new decisions are approved, and clearly label any temporary UI choice as unapproved.`,
    `5. **Record only explicit team answers**: Write answers to [decisions.json](decisions.json) **only** when explicitly supplied or approved by Matt or Yaman (\`status: "draft"\` when proposed/recorded without final sign-off; \`status: "approved"\` with \`approved_by\` and \`approved_at\` only when explicitly approved; \`status: "not_applicable"\` only with an explicit \`not_applicable_reason\`).`,
    `6. **Refresh generated files after authorized edits**: Run \`npm run style-guide:generate && npm run style-guide:validate\` (and \`npm run registry:docs && npm run registry:validate\` when handbook indexes change) so [COMPLETION-REMINDER.md](COMPLETION-REMINDER.md) reflects the exact remaining gaps.`,
    `7. **Read-only sessions**: If operating in a read-only sandbox where files cannot be updated, report clearly if [COMPLETION-REMINDER.md](COMPLETION-REMINDER.md) is stale instead of silently editing files.`,
    `8. **Never infer approval**: Never infer an approved design decision from existing CSS declarations, mockups, screenshots, or assistant-generated suggestions.`,
    ``,
    `---`,
    ``,
    `## 4. Questionnaires & Live Completion Snapshot`,
    ``,
    `- **Current Lifecycle State**: \`${stats.lifecycle_mode}\` (**${stats.totals.approved}** approved · **${stats.totals.not_applicable}** explicitly not applicable · **${stats.totals.draft}** draft awaiting approval · **${stats.totals.applicable_unanswered}** applicable unanswered · **${stats.totals.unconfirmed_pending}** unconfirmed applicability · **${stats.totals.total}** total)`,
    `- **[Completion Reminder & Outstanding Gaps (\`COMPLETION-REMINDER.md\`)](COMPLETION-REMINDER.md)**`,
    `- **[Observed UI Element Inventory (\`ui-element-inventory.md\`)](ui-element-inventory.md)**`,
    ``,
    `| # | Questionnaire | Scope | Applicable Unanswered | Unconfirmed | Draft | Approved | N/A | Total |`,
    `|---:|---|---|---:|---:|---:|---:|---:|---:|`
  );

  for (const row of stats.by_topic) {
    const t = row.topic;
    lines.push(
      `| ${t.order} | [${escapeMdCell(t.title)}](${t.file}) | ${escapeMdCell(t.scope_summary)} | ${row.applicable_unanswered} | ${row.unconfirmed_pending} | ${row.draft} | ${row.approved} | ${row.not_applicable} | ${row.total} |`
    );
  }

  lines.push(
    ``,
    `---`,
    ``,
    `## 5. How to Record Answers & Refresh the Guide`,
    ``,
    `1. Use the **Admin Portal -> 🎨 Style Guide** workspace (\`/admin#style-guide\`) to fill in answers, add optional notes, view populated hosted Markdown sections, and push directly to the repository — or edit \`docs/engineering/style-guide/decisions.json\` for the target \`DEC-*\` entry:`,
    `   - **Draft answer (awaiting sign-off)**: set \`"applicability": "applicable"\`, \`"status": "draft"\`, and \`"value": <answer or "ref:DEC-...">\`.`,
    `   - **Approved answer**: set \`"applicability": "applicable"\`, \`"status": "approved"\`, \`"value": <answer or "ref:DEC-...">\`, and \`"approval": { "approved_by": "<Name>", "approved_at": "YYYY-MM-DD" }\`.`,
    `   - **Explicitly not applicable**: set \`"applicability": "not_applicable"\`, \`"status": "not_applicable"\`, \`"value": null\`, and \`"not_applicable_reason": "<clear explanation>"\`.`,
    `   - Placeholder strings (\`"TBD"\`, \`"later"\`, \`"TODO"\`, \`"N/A"\`) are rejected by validation; \`0\` and \`false\` are valid where numeric/boolean types apply.`,
    `2. Regenerate Markdown questionnaires and \`COMPLETION-REMINDER.md\`:`,
    `   \`\`\`bash`,
    `   npm run style-guide:generate`,
    `   npm run style-guide:validate`,
    `   \`\`\``,
    `3. If also updating shared handbook pages or before opening a PR, refresh and validate the full handbook:`,
    `   \`\`\`bash`,
    `   npm run registry:docs`,
    `   npm run registry:validate`,
    `   \`\`\``
  );

  return lines.join('\n') + '\n';
}

function renderGroupedGapList(items, topicsBySlug, componentsById, { showDraftValue = false, showApplicabilityNote = false } = {}) {
  const lines = [];
  const byTopic = new Map();
  for (const dec of items) {
    if (!byTopic.has(dec.topic)) byTopic.set(dec.topic, []);
    byTopic.get(dec.topic).push(dec);
  }

  const orderedTopics = [...byTopic.keys()].sort((a, b) => {
    const ta = topicsBySlug.get(a);
    const tb = topicsBySlug.get(b);
    return (ta?.order ?? 99) - (tb?.order ?? 99) || asciiCompare(a, b);
  });

  for (const topicSlug of orderedTopics) {
    const topic = topicsBySlug.get(topicSlug);
    const topicItems = byTopic.get(topicSlug);
    lines.push(`### [${topic.title}](${topic.file}) (${topicItems.length})`);
    lines.push(``);

    const byGroup = new Map();
    for (const dec of topicItems) {
      const gKey = dec.component_id || '__TOPIC__';
      if (!byGroup.has(gKey)) byGroup.set(gKey, []);
      byGroup.get(gKey).push(dec);
    }

    for (const [gKey, gItems] of byGroup.entries()) {
      if (gKey === '__TOPIC__') {
        lines.push(`- **Topic-Level Decisions (${gItems.length})**:`);
      } else {
        const cmp = componentsById.get(gKey);
        const cmpAnchor = anchorSlug(gKey);
        lines.push(
          `- **\`${gKey}\` — [${cmp ? escapeMdCell(cmp.implementation_name) : gKey}](${topic.file}#${cmpAnchor}) (${gItems.length})**:`
        );
      }
      for (const dec of gItems) {
        const decAnchor = anchorSlug(dec.decision_id);
        let extra = '';
        if (showDraftValue) {
          extra = ` — *Draft value*: ${formatDecisionValueCell(dec.value)} *(awaiting approval)*`;
        } else if (showApplicabilityNote && dec.applicability_note) {
          extra = ` — *Confirm applicability*: ${escapeMdCell(dec.applicability_note)}`;
        }
        lines.push(
          `  - [\`${dec.decision_id}\`](${topic.file}#${decAnchor}) — **${escapeMdCell(dec.title)}**${extra}`
        );
      }
    }
    lines.push(``);
  }

  return lines;
}

function renderCompletionReminderMarkdown(data, stats, decisionsDigest) {
  const topicsBySlug = new Map(data.topics.map(t => [t.slug, t]));
  const componentsById = new Map(data.components.map(c => [c.component_id, c]));

  const lines = [
    `# Design Style Guide — Completion Reminder & Gap Report`,
    ``,
    renderGeneratedBanner(decisionsDigest),
    ``
  ];

  if (stats.lifecycle_mode === 'initial_unstarted') {
    lines.push(
      `> [!WARNING]`,
      `> **Unfinished Style Guide — Zero Design Parameters Approved (\`0 / ${stats.totals.total}\`)**`,
      `> **No design parameters, colors, dimensions, fonts, wording rules, or interaction behaviors in this style guide have been approved yet.**`,
      `> Every field in [decisions.json](decisions.json) is intentionally \`null\` for Matt and Yaman to answer and approve.`,
      `> - **Do not** invent approved values or copy existing CSS values into blank decision fields.`,
      `> - Before starting UI-related work, check the relevant topic below and remind Matt and Yaman only of the unanswered choices that materially affect the current task.`,
      `> - Preserve mandatory security, privacy, accessibility, and Sonoma truthfulness invariants ([README.md](README.md#2-mandatory-requirements-that-remain-active-at-all-times)) at all times.`,
      ``,
      `## 1. Initial Unanswered Summary by Topic`,
      ``,
      `| Topic Questionnaire | Applicable Unanswered | Unconfirmed Applicability | Draft (Unapproved) | Approved | Explicitly N/A | Total |`,
      `|---|---:|---:|---:|---:|---:|---:|`
    );
    for (const row of stats.by_topic) {
      const t = row.topic;
      lines.push(
        `| [${escapeMdCell(t.title)}](${t.file}) | **${row.applicable_unanswered}** | **${row.unconfirmed_pending}** | ${row.draft} | ${row.approved} | ${row.not_applicable} | ${row.total} |`
      );
    }
    lines.push(
      `| **Total** | **${stats.totals.applicable_unanswered}** | **${stats.totals.unconfirmed_pending}** | **${stats.totals.draft}** | **${stats.totals.approved}** | **${stats.totals.not_applicable}** | **${stats.totals.total}** |`,
      ``,
      `---`,
      ``,
      `## 2. Unconfirmed Applicability Decisions (${stats.unconfirmed_pending.length})`,
      ``,
      `Confirm whether each item below applies to BiteShark (set \`applicability: "applicable"\` to answer, or set \`status: "not_applicable"\` + \`applicability: "not_applicable"\` with an explicit \`not_applicable_reason\`):`,
      ``
    );
    lines.push(
      ...renderGroupedGapList(stats.unconfirmed_pending, topicsBySlug, componentsById, {
        showApplicabilityNote: true
      }),
      `---`,
      ``,
      `## 3. Grouped Unanswered Questionnaires`,
      ``,
      `All **${stats.totals.applicable_unanswered}** applicable decisions currently have \`status: "unanswered"\` and \`value: null\`. Open the relevant questionnaire directly:`,
      ``
    );
    for (const row of stats.by_topic) {
      const t = row.topic;
      const topicCmps = data.components.filter(c => c.topic === t.slug && c.applicability === 'applicable');
      const cmpLinks = topicCmps
        .map(c => `[\`${c.component_id}\`](${t.file}#${anchorSlug(c.component_id)})`)
        .join(', ');
      lines.push(
        `- **[${escapeMdCell(t.title)} (\`${t.file}\`)](${t.file})** — **${row.applicable_unanswered}** applicable unanswered${row.unconfirmed_pending ? `, **${row.unconfirmed_pending}** unconfirmed` : ''}${cmpLinks ? ` · Components: ${cmpLinks}` : ''}`
      );
    }
    lines.push(
      ``,
      `Refresh command after recording explicit answers in [decisions.json](decisions.json):`,
      `\`\`\`bash`,
      `npm run style-guide:generate && npm run style-guide:validate`,
      `\`\`\``
    );
    return lines.join('\n') + '\n';
  }

  if (stats.lifecycle_mode === 'partially_completed') {
    lines.push(
      `> [!IMPORTANT]`,
      `> **Partially Completed Style Guide — Not Yet Complete (${stats.remaining_gap_count} Remaining Gap${stats.remaining_gap_count === 1 ? '' : 's'})**`,
      `> - **Completed & omitted from reminders below**: **${stats.totals.approved}** approved, **${stats.totals.not_applicable}** explicitly not applicable.`,
      `> - **Still pending**: **${stats.totals.applicable_unanswered}** unanswered applicable, **${stats.totals.draft}** draft awaiting approval, **${stats.totals.unconfirmed_pending}** unconfirmed applicability.`,
      `> - Coding assistants: remind Matt and Yaman **only** about pending items below that affect the current task; **do not** repeat completed/approved decisions, and **do not** treat \`draft\` items as approved.`,
      ``,
      `## 1. Progress Summary by Topic`,
      ``,
      `| Topic Questionnaire | Unanswered | Draft (Pending Approval) | Unconfirmed Applicability | Approved | Explicitly N/A | Total |`,
      `|---|---:|---:|---:|---:|---:|---:|`
    );
    for (const row of stats.by_topic) {
      const t = row.topic;
      lines.push(
        `| [${escapeMdCell(t.title)}](${t.file}) | ${row.applicable_unanswered} | ${row.draft} | ${row.unconfirmed_pending} | ${row.approved} | ${row.not_applicable} | ${row.total} |`
      );
    }
    lines.push(
      `| **Total** | **${stats.totals.applicable_unanswered}** | **${stats.totals.draft}** | **${stats.totals.unconfirmed_pending}** | **${stats.totals.approved}** | **${stats.totals.not_applicable}** | **${stats.totals.total}** |`,
      ``
    );

    if (stats.unconfirmed_pending.length > 0) {
      lines.push(
        `---`,
        ``,
        `## 2. Missing Applicability Decisions (${stats.unconfirmed_pending.length})`,
        ``,
        `These items require an explicit applicability decision before design completion can be claimed:`,
        ``,
        ...renderGroupedGapList(stats.unconfirmed_pending, topicsBySlug, componentsById, {
          showApplicabilityNote: true
        })
      );
    }

    if (stats.draft_pending.length > 0) {
      lines.push(
        `---`,
        ``,
        `## 3. Draft Answers Awaiting Explicit Approval (${stats.draft_pending.length})`,
        ``,
        `These items have recorded draft values in [decisions.json](decisions.json) but are **not yet approved** (\`approval.approved_by\` / \`approval.approved_at\` still unset):`,
        ``,
        ...renderGroupedGapList(stats.draft_pending, topicsBySlug, componentsById, {
          showDraftValue: true
        })
      );
    }

    if (stats.unanswered_applicable.length > 0) {
      lines.push(
        `---`,
        ``,
        `## 4. Remaining Unanswered Applicable Decisions (${stats.unanswered_applicable.length})`,
        ``,
        `Only remaining \`unanswered\` items are listed below (approved and valid \`not_applicable\` items are omitted):`,
        ``,
        ...renderGroupedGapList(stats.unanswered_applicable, topicsBySlug, componentsById)
      );
    }

    lines.push(
      `---`,
      ``,
      `Refresh command after recording or approving answers in [decisions.json](decisions.json):`,
      `\`\`\`bash`,
      `npm run style-guide:generate && npm run style-guide:validate`,
      `\`\`\``
    );
    return lines.join('\n') + '\n';
  }

  lines.push(
    `> [!TIP]`,
    `> **Style Guide Decision Coverage Complete**`,
    `> All **${stats.totals.total}** tracked style-guide items have been explicitly resolved: **${stats.totals.approved}** approved and **${stats.totals.not_applicable}** marked explicitly not applicable with recorded reasons. **0** unanswered, **0** unapproved drafts, and **0** unconfirmed applicability items remain.`,
    ``,
    `## 1. Final Resolution Summary by Topic`,
    ``,
    `| Topic Questionnaire | Approved | Explicitly N/A | Remaining Gaps | Total |`,
    `|---|---:|---:|---:|---:|`
  );
  for (const row of stats.by_topic) {
    const t = row.topic;
    const gaps = row.applicable_unanswered + row.draft + row.unconfirmed_pending;
    lines.push(
      `| [${escapeMdCell(t.title)}](${t.file}) | ${row.approved} | ${row.not_applicable} | ${gaps} | ${row.total} |`
    );
  }
  lines.push(
    `| **Total** | **${stats.totals.approved}** | **${stats.totals.not_applicable}** | **0** | **${stats.totals.total}** |`,
    ``
  );

  lines.push(
    `---`,
    ``,
    `## 2. Explicitly Deferred / Not-Applicable Decisions (${stats.not_applicable_items.length})`,
    ``
  );
  if (stats.not_applicable_items.length === 0) {
    lines.push(`No decisions were marked \`not_applicable\`; all ${stats.totals.approved} items carry approved values.`);
  } else {
    lines.push(`| Decision ID | Topic | Component | Title | Recorded Reason |`);
    lines.push(`|---|---|---|---|---|`);
    for (const dec of stats.not_applicable_items) {
      const t = topicsBySlug.get(dec.topic);
      lines.push(
        `| [\`${dec.decision_id}\`](${t.file}#${anchorSlug(dec.decision_id)}) | [${escapeMdCell(t.title)}](${t.file}) | ${dec.component_id ? `\`${dec.component_id}\`` : 'Topic-level'} | ${escapeMdCell(dec.title)} | ${escapeMdCell(dec.not_applicable_reason)} |`
      );
    }
  }
  lines.push(``);
  return lines.join('\n') + '\n';
}

function renderComponentObservedCardLines(cmp, topicsBySlug, { includeQuestionnaireLink = false } = {}) {
  const topic = topicsBySlug.get(cmp.topic);
  const lines = [
    `### <a id="${anchorSlug(cmp.component_id)}"></a>\`${cmp.component_id}\` — ${escapeHtmlAnglesOutsideBackticks(cmp.implementation_name)}`,
    ``
  ];
  if (cmp.applicability === 'unconfirmed') {
    lines.push(
      `> [!NOTE]`,
      `> **Unconfirmed Applicability (\`unconfirmed\`)**: ${escapeHtmlAnglesOutsideBackticks(cmp.applicability_note)} *(Not implied as active on \`working/biteshark-vps\`.)*`,
      ``
    );
  }
  if (includeQuestionnaireLink && topic) {
    lines.push(
      `- **Design Questionnaire**: [${topic.title} (\`${topic.file}\`)](${topic.file}#${anchorSlug(cmp.component_id)})`
    );
  }
  lines.push(
    `- **Applicability**: \`${cmp.applicability}\` · **Evidence Level**: \`${cmp.evidence_level}\``,
    `- **Screens / Surfaces**: ${cmp.screens.map(s => `\`${s}\``).join(', ')}`,
    `- **User Roles**: ${cmp.user_roles.map(r => `\`${r}\``).join(', ')}`,
    `- **Selectors**: ${cmp.selectors.length ? cmp.selectors.map(s => `\`${s}\``).join(', ') : '*(none — unconfirmed / not present on active branch)*'}`,
    `- **DOM IDs**: ${cmp.dom_ids.length ? cmp.dom_ids.map(d => `\`${d}\``).join(', ') : '*(dynamic or none)*'}`,
    `- **Definition Files**: ${cmp.definition_files.length ? cmp.definition_files.map(f => `\`${f}\``).join(', ') : '*(unconfirmed)*'}`,
    `- **Definition Symbols**: ${cmp.definition_symbols.length ? cmp.definition_symbols.map(s => `\`${s}\``).join(', ') : '*(declarative HTML/CSS only or unconfirmed)*'}`,
    `- **Observed Existing Variants**: ${cmp.existing_variants.length ? escapeHtmlAnglesOutsideBackticks(cmp.existing_variants.join('; ')) : '*(none observed)*'}`,
    `- **Observed Existing States**: ${cmp.existing_states.length ? escapeHtmlAnglesOutsideBackticks(cmp.existing_states.join('; ')) : '*(none observed)*'}`,
    `- **Related Feature Keys**: ${cmp.related_feature_keys.length ? cmp.related_feature_keys.map(k => `\`${k}\``).join(', ') : '*(always-on / not feature-gated)*'}`,
    `- **Source & Handbook Records**: ${cmp.source_and_handbook_links.map(l => `[${path.posix.basename(l.split('#')[0])}](${toStyleGuideRelLink(l)})`).join(', ')}`,
    `- **Unresolved References & Known Cascade/DOM Caveats**: ${cmp.unresolved_references.length ? escapeHtmlAnglesOutsideBackticks(cmp.unresolved_references.join(' | ')) : 'None flagged.'}`,
    ``
  );
  return lines;
}

function renderUiInventoryMarkdown(data, decisionsDigest) {
  const topicsBySlug = new Map(data.topics.map(t => [t.slug, t]));
  const activeCmps = data.components.filter(c => c.applicability === 'applicable');
  const unconfirmedCmps = data.components.filter(c => c.applicability === 'unconfirmed');
  const naCmps = data.components.filter(c => c.applicability === 'not_applicable');

  const lines = [
    `# Observed UI Element Inventory (Code-Grounded Layer 1)`,
    ``,
    renderGeneratedBanner(decisionsDigest),
    ``,
    `> [!IMPORTANT]`,
    `> **Implementation Facts vs. Design Decisions**:`,
    `> Everything in this inventory records **observed code facts** from BiteShark's HTML, CSS, and JavaScript modules on \`${data.source_branch_context}\` (cross-referenced with [FRONTEND-INVENTORY.md](../generated/FRONTEND-INVENTORY.md), [FRONTEND-MAP.md](../FRONTEND-MAP.md), and [UI-AND-CONTENT-GUIDE.md](../UI-AND-CONTENT-GUIDE.md)).`,
    `> Existing implementation values are **not** approved style-guide decisions; blank decision fields live in the linked topic questionnaires.`,
    ``,
    `---`,
    ``,
    `## 1. Component Catalog Overview (${data.components.length} Total: ${activeCmps.length} Applicable, ${unconfirmedCmps.length} Unconfirmed${naCmps.length ? `, ${naCmps.length} N/A` : ''})`,
    ``,
    `| Component ID | Implementation Name | Topic Questionnaire | Applicability | Evidence Level | Roles |`,
    `|---|---|---|---|---|---|`
  ];

  for (const cmp of data.components) {
    const t = topicsBySlug.get(cmp.topic);
    lines.push(
      `| [\`${cmp.component_id}\`](#${anchorSlug(cmp.component_id)}) | ${escapeMdCell(cmp.implementation_name)} | [${escapeMdCell(t.title)}](${t.file}#${anchorSlug(cmp.component_id)}) | \`${cmp.applicability}\` | \`${cmp.evidence_level}\` | ${cmp.user_roles.map(r => `\`${r}\``).join(', ')} |`
    );
  }

  lines.push(
    ``,
    `---`,
    ``,
    `## 2. Active Reusable Components Observed in Code (${activeCmps.length})`,
    ``
  );
  for (const cmp of activeCmps) {
    lines.push(...renderComponentObservedCardLines(cmp, topicsBySlug, { includeQuestionnaireLink: true }));
  }

  if (unconfirmedCmps.length > 0) {
    lines.push(
      `---`,
      ``,
      `## 3. Unconfirmed Branch-Specific or Future Candidate Components (${unconfirmedCmps.length})`,
      ``,
      `The items below are **not** active on \`working/biteshark-vps\` (or are behind disabled/preview-only flags). Their applicability is recorded as \`unconfirmed\` until Matt and Yaman decide whether to include or mark them \`not_applicable\`:`,
      ``
    );
    for (const cmp of unconfirmedCmps) {
      lines.push(...renderComponentObservedCardLines(cmp, topicsBySlug, { includeQuestionnaireLink: true }));
    }
  }

  return lines.join('\n') + '\n';
}

function renderDecisionTableLines(decisions, allDecisionsMap, topicsBySlug) {
  const lines = [
    `| Decision ID & Question | Answer | Expected Type & Constraints | Applicability & Status | Approval (\`approved_by\` / \`approved_at\`) | Related |`,
    `|---|---|---|---|---|---|`
  ];

  for (const dec of decisions) {
    const anchor = `<a id="${anchorSlug(dec.decision_id)}"></a>`;
    const dimBadge = dec.dimension ? ` *(\`${dec.dimension}\`)*` : '';
    const appNote =
      dec.applicability === 'unconfirmed' && dec.applicability_note
        ? `<br>*Applicability note*: ${escapeMdCell(dec.applicability_note)}`
        : '';
    const naNote =
      dec.status === 'not_applicable' && dec.not_applicable_reason
        ? `<br>*N/A reason*: ${escapeMdCell(dec.not_applicable_reason)}`
        : '';
    const userNote =
      typeof dec.notes === 'string' && dec.notes.trim().length > 0
        ? `<br>*Notes*: ${escapeMdCell(dec.notes.trim())}`
        : '';
    const questionCol = `${anchor}**\`${dec.decision_id}\` — ${escapeMdCell(dec.title)}**${dimBadge}<br>${escapeMdCell(dec.question)}${appNote}${naNote}${userNote}`;
    const answerCol = formatDecisionValueCell(dec.value);
    const expectedCol = formatExpectedAnswerSummary(dec.expected_answer);
    const statusCol = `\`${dec.applicability}\` / **\`${dec.status}\`**`;
    const approvalCol =
      dec.approval.approved_by && dec.approval.approved_at
        ? `${escapeMdCell(dec.approval.approved_by)} (${escapeMdCell(dec.approval.approved_at)})`
        : '';
    const relatedCol = (dec.related_decisions || [])
      .map(rid => {
        const target = allDecisionsMap.get(rid);
        if (!target) return `\`${rid}\``;
        const targetTopic = topicsBySlug.get(target.topic);
        const prefix = target.topic === dec.topic ? '' : targetTopic.file;
        return `[\`${rid}\`](${prefix}#${anchorSlug(rid)})`;
      })
      .join(', ');

    lines.push(
      `| ${questionCol} | ${answerCol} | ${expectedCol} | ${statusCol} | ${approvalCol} | ${relatedCol} |`
    );
  }

  lines.push(``);
  return lines;
}

function renderTopicMarkdown(topic, data, decisionsDigest) {
  const topicsBySlug = new Map(data.topics.map(t => [t.slug, t]));
  const invariantsById = new Map(data.mandatory_invariants.map(i => [i.invariant_id, i]));
  const allDecisionsMap = new Map(data.decisions.map(d => [d.decision_id, d]));

  const topicDecisions = data.decisions.filter(d => d.topic === topic.slug);
  const systemDecisions = topicDecisions.filter(d => d.component_id === null);
  const topicComponents = data.components.filter(c => c.topic === topic.slug);

  const unansweredCount = topicDecisions.filter(
    d => d.status === 'unanswered' && d.applicability === 'applicable'
  ).length;
  const unconfirmedCount = topicDecisions.filter(
    d => d.status !== 'not_applicable' && d.applicability === 'unconfirmed'
  ).length;
  const draftCount = topicDecisions.filter(d => d.status === 'draft').length;
  const approvedCount = topicDecisions.filter(d => d.status === 'approved').length;
  const naCount = topicDecisions.filter(d => d.status === 'not_applicable').length;

  const lines = [
    `# Style Guide Questionnaire — ${topic.title}`,
    ``,
    renderGeneratedBanner(decisionsDigest),
    ``,
    `- **Navigation**: [Style Guide README](README.md) · [Completion Reminder](COMPLETION-REMINDER.md) · [UI Element Inventory](ui-element-inventory.md)`,
    `- **Scope**: ${escapeHtmlAnglesOutsideBackticks(topic.scope_summary)}`,
    `- **Topic Status**: **${approvedCount}** approved · **${naCount}** N/A · **${draftCount}** draft · **${unansweredCount}** applicable unanswered · **${unconfirmedCount}** unconfirmed (**${topicDecisions.length}** total)`,
    ``,
    `> [!IMPORTANT]`,
    `> **Mandatory Constraints Preserved**: Blank answers below leave visual/editorial parameters open for Matt and Yaman to decide; they **never** relax the mandatory requirements below:`,
    ...(topic.mandatory_invariant_ids || []).map(id => {
      const inv = invariantsById.get(id);
      const links = inv.authoritative_docs
        .map(d => `[${path.posix.basename(d.split('#')[0])}](${toStyleGuideRelLink(d)})`)
        .join(', ');
      return `> - **\`${inv.invariant_id}\` (${escapeHtmlAnglesOutsideBackticks(inv.title)})**: ${escapeHtmlAnglesOutsideBackticks(inv.summary)} (${links})`;
    }),
    ``
  ];

  if (systemDecisions.length > 0) {
    lines.push(`---`, ``, `## Topic-Level Design Decisions (${systemDecisions.length})`, ``);
    const bySection = new Map();
    for (const d of systemDecisions) {
      if (!bySection.has(d.section)) bySection.set(d.section, []);
      bySection.get(d.section).push(d);
    }
    for (const [secTitle, secDecs] of bySection.entries()) {
      lines.push(`### ${escapeHtmlAnglesOutsideBackticks(secTitle)}`, ``);
      lines.push(...renderDecisionTableLines(secDecs, allDecisionsMap, topicsBySlug));
    }
  }

  if (topicComponents.length > 0) {
    lines.push(`---`, ``, `## Component Design Questionnaires (${topicComponents.length})`, ``);
    for (const cmp of topicComponents) {
      const cmpDecs = topicDecisions.filter(d => d.component_id === cmp.component_id);
      lines.push(...renderComponentObservedCardLines(cmp, topicsBySlug, { includeQuestionnaireLink: false }));
      lines.push(
        `#### Blank Design Decisions for \`${cmp.component_id}\` (${cmpDecs.length})`,
        ``
      );
      lines.push(...renderDecisionTableLines(cmpDecs, allDecisionsMap, topicsBySlug));
    }
  }

  return lines.join('\n') + '\n';
}

export function renderStyleGuideMarkdownFiles(data, rawJsonText = null) {
  const canonicalJson = rawJsonText ?? JSON.stringify(data, null, 2) + '\n';
  const normalizedJson = canonicalJson.replace(/\r\n/g, '\n');
  const decisionsDigest = sha256Text(normalizedJson);
  const stats = computeCompletionStats(data);

  const files = new Map();
  files.set(
    `${STYLE_GUIDE_DIR_REL_PATH}/README.md`,
    renderReadmeMarkdown(data, stats, decisionsDigest)
  );
  files.set(
    `${STYLE_GUIDE_DIR_REL_PATH}/COMPLETION-REMINDER.md`,
    renderCompletionReminderMarkdown(data, stats, decisionsDigest)
  );
  files.set(
    `${STYLE_GUIDE_DIR_REL_PATH}/ui-element-inventory.md`,
    renderUiInventoryMarkdown(data, decisionsDigest)
  );

  const orderedTopics = [...data.topics].sort((a, b) => a.order - b.order || asciiCompare(a.slug, b.slug));
  for (const topic of orderedTopics) {
    files.set(
      `${STYLE_GUIDE_DIR_REL_PATH}/${topic.file}`,
      renderTopicMarkdown(topic, data, decisionsDigest)
    );
  }

  return {
    decisions_digest_sha256: decisionsDigest,
    canonical_json_text: normalizedJson,
    stats,
    files
  };
}

export function loadStyleGuideDecisions(repoRoot, customDecisionsPath = null) {
  const absPath = customDecisionsPath
    ? path.resolve(repoRoot, customDecisionsPath)
    : path.join(repoRoot, STYLE_GUIDE_DECISIONS_REL_PATH);
  const rawText = fs.readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n');
  const data = JSON.parse(rawText);
  return { absPath, rawText, data };
}

export function generateStyleGuideDocs(repoRoot, { customDecisionsPath = null } = {}) {
  const { rawText, data } = loadStyleGuideDecisions(repoRoot, customDecisionsPath);
  const validation = validateStyleGuideData(data, { repoRoot });
  if (!validation.ok) {
    const err = new Error(
      `Style guide validation failed (${validation.errors.length} error(s)):\n- ${validation.errors.join('\n- ')}`
    );
    err.validationErrors = validation.errors;
    throw err;
  }

  const rendered = renderStyleGuideMarkdownFiles(data, rawText);
  const writtenPaths = [];
  for (const [relPath, content] of rendered.files.entries()) {
    const absTarget = path.join(repoRoot, relPath);
    fs.mkdirSync(path.dirname(absTarget), { recursive: true });
    fs.writeFileSync(absTarget, content, 'utf8');
    writtenPaths.push(relPath);
  }

  return {
    ok: true,
    decisions_digest_sha256: rendered.decisions_digest_sha256,
    lifecycle_mode: rendered.stats.lifecycle_mode,
    is_complete: rendered.stats.is_complete,
    totals: rendered.stats.totals,
    files_written: writtenPaths
  };
}

export function validateStyleGuideWorkspace(repoRoot, { customDecisionsPath = null } = {}) {
  const failures = [];
  const decisionsPath = customDecisionsPath
    ? path.resolve(repoRoot, customDecisionsPath)
    : path.join(repoRoot, STYLE_GUIDE_DECISIONS_REL_PATH);

  if (!fs.existsSync(decisionsPath)) {
    return {
      ok: false,
      failures: [`Missing ${STYLE_GUIDE_DECISIONS_REL_PATH}.`]
    };
  }

  let rawText = '';
  let data = null;
  try {
    rawText = fs.readFileSync(decisionsPath, 'utf8').replace(/\r\n/g, '\n');
    data = JSON.parse(rawText);
  } catch (err) {
    return {
      ok: false,
      failures: [`Failed to parse ${STYLE_GUIDE_DECISIONS_REL_PATH}: ${err.message}`]
    };
  }

  const dataValidation = validateStyleGuideData(data, { repoRoot });
  failures.push(...dataValidation.errors);
  if (!dataValidation.ok) {
    return {
      ok: false,
      failures
    };
  }

  const render1 = renderStyleGuideMarkdownFiles(data, rawText);
  const render2 = renderStyleGuideMarkdownFiles(data, rawText);

  for (const [relPath, expectedContent] of render1.files.entries()) {
    if (render2.files.get(relPath) !== expectedContent) {
      failures.push(`Non-deterministic style-guide render detected for ${relPath}.`);
    }
    const absFile = path.join(repoRoot, relPath);
    if (!fs.existsSync(absFile)) {
      failures.push(
        `Missing generated style-guide file ${relPath} (run \`npm run style-guide:generate\`).`
      );
    } else {
      const actualContent = fs.readFileSync(absFile, 'utf8').replace(/\r\n/g, '\n');
      if (actualContent !== expectedContent) {
        failures.push(
          `Stale or hand-edited style-guide file ${relPath} does not match ${STYLE_GUIDE_DECISIONS_REL_PATH} (run \`npm run style-guide:generate\`).`
        );
      }
    }
  }

  return {
    ok: failures.length === 0,
    decisions_digest_sha256: render1.decisions_digest_sha256,
    lifecycle_mode: render1.stats.lifecycle_mode,
    is_complete: render1.stats.is_complete,
    totals: render1.stats.totals,
    failures
  };
}
