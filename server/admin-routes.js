// BiteShark Standalone Administration, Onboarding, Invitations, Moderation & Issues Router
//
// Enforces server-side authentication, row-locked transactional RBAC (`Customer`, `Vendor Staff`,
// `Vendor Owner`, `Admin: Mod`, `Admin: Top`), CSRF verification, rate limits, magic-byte evidence
// validation, last-Top protection, session revocation on role/status changes, and redacted audit logs.

import { auth } from 'hatchable';
import {
  UUID_RE,
  ROLE_LABELS,
  loadAccessContext,
  reverifyModeratorInTx,
  reverifyPlatformAdminInTx,
  reverifyVendorMembershipInTx,
  recordAuditLog,
  inspectWritePauseConfig,
  evaluateEffectiveVendorRestrictions,
  normalizeAdminLevel
} from '../lib/authz.js';
import { withTransaction } from '../lib/db-tx.js';
import { extractClientRateKey } from '../lib/pager-notifications.js';
import { inspectNotificationRuntimeConfig } from '../lib/pager-notifications.js';
import { inspectAdminEmailReadiness } from '../lib/standalone-auth.js';
import {
  buildAgeAssessmentRequiredPayload,
  daysInGregorianMonth,
  resolvePacificCalendarDateParts
} from '../lib/age-policy.js';
import {
  INVITATION_TTL_MS,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_PER_APPLICATION,
  MAX_MOD_TEMP_RESTRICTION_HOURS,
  INVITATION_ROLE_LABELS,
  sha256Hex,
  generateOpaqueToken,
  normalizeEmailStrict,
  normalizeOptionalIdempotencyKey,
  parseBoundedPagination,
  sanitizeFilename,
  verifyEvidenceBufferAndMime,
  validateOptionalHttpUrl,
  validateProposedSlug,
  computeIssueSlaDueAt,
  recordTestSafeNotificationInTx,
  consumeGovernanceRateLimit
} from '../lib/admin-governance.js';

export const EVIDENCE_UPLOAD_MAX_JSON_BYTES = 900 * 1024; // 900 KiB JSON envelope for <= 512 KiB base64 file

const GOVERNANCE_PATHS = new Set([
  '/api/account/context',
  '/api/invitations/inspect',
  '/api/invitations/accept',
  '/api/vendor/members',
  '/api/vendor/staff-invitations',
  '/api/onboarding/applications',
  '/api/onboarding/evidence',
  '/api/community/report',
  '/api/issues',
  '/api/issues/reply',
  '/api/admin/overview',
  '/api/admin/email-readiness',
  '/api/admin/vendor-preview',
  '/api/admin/applications',
  '/api/admin/applications/decision',
  '/api/admin/vendors',
  '/api/admin/vendors/update',
  '/api/admin/accounts',
  '/api/admin/accounts/role',
  '/api/admin/accounts/status',
  '/api/admin/invitations',
  '/api/admin/invitations/create',
  '/api/admin/invitations/decision',
  '/api/admin/moderation',
  '/api/admin/moderation/decision',
  '/api/admin/issues',
  '/api/admin/issues/update',
  '/api/admin/readiness',
  '/api/admin/readiness/note',
  '/api/admin/readiness/update',
  '/api/admin/audit'
]);

export function isGovernanceApiPath(pathname) {
  const norm = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return GOVERNANCE_PATHS.has(norm);
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [local, dom] = email.split('@');
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${dom}`;
}

const READINESS_STATUS_CATALOG = Object.freeze([
  { code: 'not_assessed', label: 'Not assessed' },
  { code: 'decision_pending', label: 'Decision pending' },
  { code: 'proposed', label: 'Proposed' },
  { code: 'implemented_verification_pending', label: 'Implemented — verification pending' },
  { code: 'verified_internally', label: 'Verified internally' },
  { code: 'submitted_for_legal_review', label: 'Submitted for legal review' },
  { code: 'changes_requested', label: 'Changes requested' },
  { code: 'legally_approved', label: 'Legally approved for specified scope/version' },
  { code: 'not_applicable', label: 'Not applicable — with explanation' },
  { code: 'needs_re_review', label: 'Needs re-review' }
]);

const VALID_READINESS_STATUSES = new Set(READINESS_STATUS_CATALOG.map(s => s.code));

const LAUNCH_INCOMPLETE_REMINDER_TEXT =
  'Legal review and launch readiness remain incomplete. Draft policies are not approved for public rollout.';

const DEPLOYMENT_PORTAL_REMINDER_NOTE =
  'Governance reminder only: deployment automation (deploy/install-staging-release.sh) runs via operator SSH/CLI and is not technically blocked by this dashboard flag.';

function validateIsoCalendarDate(raw, { allowFuture = true } = {}) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: true, value: null };
  }
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    return { ok: false, error: 'Date must use YYYY-MM-DD format.' };
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const maxD = daysInGregorianMonth(year, month);
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > maxD) {
    return { ok: false, error: 'Enter an actual Gregorian calendar date (YYYY-MM-DD).' };
  }
  if (!allowFuture) {
    const today = resolvePacificCalendarDateParts();
    if (s > today.iso) {
      return { ok: false, error: 'Legal review date cannot be in the future.' };
    }
  }
  return { ok: true, value: s };
}

function serializeReadinessItemForActor(row, actorRole, historyRows = []) {
  const canViewCounsel = actorRole === 'top' || row.mod_counsel_access_granted === true;
  return {
    item_key: row.item_key,
    sort_order: row.sort_order,
    category: row.category,
    topic: row.topic,
    is_launch_critical: Boolean(row.is_launch_critical),
    mod_visible: Boolean(row.mod_visible),
    mod_counsel_access_granted: Boolean(row.mod_counsel_access_granted),
    current_practice: row.current_practice,
    unresolved_questions: row.unresolved_questions || null,
    status: row.status,
    not_applicable_explanation: row.not_applicable_explanation || null,
    stages: {
      decision_recorded: Boolean(row.decision_recorded),
      implemented_recorded: Boolean(row.implemented_recorded),
      tested_recorded: Boolean(row.tested_recorded),
      legally_reviewed: row.status === 'legally_approved'
    },
    decision_recorded: Boolean(row.decision_recorded),
    implemented_recorded: Boolean(row.implemented_recorded),
    tested_recorded: Boolean(row.tested_recorded),
    owner_label: row.owner_label,
    next_action: row.next_action,
    target_review_date: row.target_review_date || null,
    policy_version: row.policy_version || null,
    supporting_evidence: row.supporting_evidence || null,
    operational_notes: row.operational_notes || null,
    confidential_counsel_notes: canViewCounsel ? row.confidential_counsel_notes || null : null,
    confidential_counsel_redacted: !canViewCounsel && Boolean(row.confidential_counsel_notes),
    approved_doc_version: row.approved_doc_version || null,
    approved_jurisdiction_scope: row.approved_jurisdiction_scope || null,
    legal_reviewer_name: row.legal_reviewer_name || null,
    legal_reviewed_at: row.legal_reviewed_at || null,
    dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    updated_by: row.updated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    history: historyRows
  };
}

async function enableAdminTxGuards(tx, ctx) {
  await tx.query(
    `SELECT
       set_config('app.admin_portal', 'true', true),
       set_config('app.can_moderate', 'true', true),
       set_config('app.auth_internal', 'true', true),
       set_config('app.user_id', $1, true),
       set_config('app.user_email', $2, true)`,
    [ctx?.user?.id || '', ctx?.user?.email || '']
  );
}

export async function handleGovernanceApiRequest({
  pathname,
  method,
  req,
  query,
  body,
  dbAdapter,
  sendJson,
  rawRes
}) {
  const normPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const ctx = await loadAccessContext(req, auth, dbAdapter);

  // =========================================================================
  // 1. Account & Role Context (`GET /api/account/context`)
  // =========================================================================
  if (normPath === '/api/account/context') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    if (!ctx.authenticated || !ctx.user) {
      return sendJson(200, {
        authenticated: false,
        user: null,
        role_labels: [],
        admin: null,
        admin_level: null,
        admin_label: null,
        capabilities: {
          can_access_admin_portal: false,
          can_act_on_behalf: false,
          is_top_admin: false
        },
        memberships: [],
        vendor_memberships: [],
        my_applications_count: 0,
        my_open_issues_count: 0
      });
    }

    let myAppsCount = 0;
    let myIssuesCount = 0;
    let ageEligibilityStatus = 'not_assessed';
    let agePolicyVersion = null;
    try {
      await withTransaction(dbAdapter, async tx => {
        await tx.query(
          "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
          [ctx.user.id]
        );
        const ageRes = await tx.query(
          'SELECT age_eligibility_status, age_policy_version FROM auth_users WHERE id = $1',
          [ctx.user.id]
        );
        if (ageRes.rows[0]) {
          ageEligibilityStatus = ageRes.rows[0].age_eligibility_status || 'not_assessed';
          agePolicyVersion = ageRes.rows[0].age_policy_version || null;
        }
        if (ageEligibilityStatus === 'eligible_14_plus') {
          const appsRes = await tx.query(
            'SELECT count(*)::int AS c FROM vendor_applications WHERE applicant_user_id = $1',
            [ctx.user.id]
          );
          const issRes = await tx.query(
            "SELECT count(*)::int AS c FROM support_issues WHERE reporter_user_id = $1 AND status IN ('open', 'in_progress', 'waiting')",
            [ctx.user.id]
          );
          myAppsCount = appsRes.rows[0]?.c || 0;
          myIssuesCount = issRes.rows[0]?.c || 0;
        }
      });
    } catch {}

    const requiresAgeAssessment = ageEligibilityStatus !== 'eligible_14_plus';
    if (requiresAgeAssessment) {
      // Data minimization on exempt bootstrap endpoint: expose ONLY minimum session info needed
      // to render the one-time age assessment; withhold memberships, roles, admin flags, and counts.
      return sendJson(200, {
        authenticated: true,
        user: {
          id: ctx.user.id,
          email: ctx.user.email,
          age_eligibility_status: ageEligibilityStatus,
          requires_age_assessment: true
        },
        age_eligibility_status: ageEligibilityStatus,
        age_policy_version: agePolicyVersion,
        requires_age_assessment: true,
        assessment_url: '/login.html?assess=1',
        role_labels: [],
        admin_level: null,
        admin_label: null,
        capabilities: {
          can_access_admin_portal: false,
          can_act_on_behalf: false,
          is_top_admin: false
        },
        admin: null,
        memberships: [],
        vendor_memberships: [],
        my_applications_count: 0,
        my_open_issues_count: 0
      });
    }

    const memList = Array.from(ctx.memberships.values());
    return sendJson(200, {
      authenticated: true,
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        age_eligibility_status: ageEligibilityStatus,
        requires_age_assessment: requiresAgeAssessment
      },
      age_eligibility_status: ageEligibilityStatus,
      age_policy_version: agePolicyVersion,
      requires_age_assessment: requiresAgeAssessment,
      role_labels: ctx.roleLabels,
      admin_level: ctx.adminLevel,
      admin_label: ctx.adminLabel,
      capabilities: {
        can_access_admin_portal: ctx.isModAdmin,
        can_act_on_behalf: ctx.isTopAdmin,
        is_top_admin: ctx.isTopAdmin
      },
      admin: ctx.isModAdmin
        ? {
            is_admin: true,
            level: ctx.adminLevel,
            label: ctx.adminLabel,
            can_act_on_behalf: ctx.isTopAdmin,
            portal_url: '/admin'
          }
        : null,
      memberships: memList,
      vendor_memberships: memList,
      my_applications_count: myAppsCount,
      my_open_issues_count: myIssuesCount
    });
  }

  // =========================================================================
  // 2. Invitation Inspection & Verified Acceptance (`/api/invitations/*`)
  // =========================================================================
  if (normPath === '/api/invitations/inspect') {
    if (method !== 'GET' && method !== 'POST') {
      return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
    }
    const rawToken = typeof (query.token || body?.token) === 'string' ? String(query.token || body.token).trim() : '';
    if (rawToken.length < 24 || rawToken.length > 128) {
      return sendJson(404, { error: 'Invitation not found or expired.' });
    }
    const tokenHash = sha256Hex(rawToken);
    const out = await withTransaction(dbAdapter, async tx => {
      await tx.query("SELECT set_config('app.admin_portal', 'true', true)");
      const { rows } = await tx.query(
        `SELECT id, email_normalized, requested_role, vendor_id, status, expires_at, consumed_at, revoked_at
         FROM account_invitations
         WHERE token_sha256 = $1`,
        [tokenHash]
      );
      if (!rows.length) return null;
      const inv = rows[0];
      const expired = inv.expires_at && new Date(inv.expires_at).getTime() <= Date.now();
      if (inv.status !== 'issued' || inv.consumed_at || inv.revoked_at || expired) {
        return { valid: false, status: expired ? 'expired' : inv.status };
      }
      let vendorName = null;
      if (inv.vendor_id) {
        const vr = await tx.query('SELECT canonical_name FROM vendors WHERE id = $1', [inv.vendor_id]);
        vendorName = vr.rows[0]?.canonical_name || null;
      }
      const masked = maskEmail(inv.email_normalized);
      const roleLabel = INVITATION_ROLE_LABELS[inv.requested_role] || inv.requested_role;
      return {
        valid: true,
        invitation_id: inv.id,
        email_hint: masked,
        requested_role: inv.requested_role,
        requested_role_label: roleLabel,
        vendor_id: inv.vendor_id,
        vendor_name: vendorName,
        expires_at: inv.expires_at,
        invitation: {
          id: inv.id,
          masked_email: masked,
          requested_role: inv.requested_role,
          role_label: roleLabel,
          vendor_id: inv.vendor_id,
          vendor_name: vendorName,
          expires_at: inv.expires_at
        }
      };
    });
    if (!out || !out.valid) {
      return sendJson(404, { error: 'Invitation is invalid, already used, or expired.' });
    }
    return sendJson(200, out);
  }

  if (normPath === '/api/invitations/accept') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated || !ctx.user?.id || !ctx.user?.email) {
      return sendJson(401, {
        error: 'Sign in and verify ownership of the invited email address before accepting an invitation.',
        code: 'EMAIL_VERIFICATION_REQUIRED'
      });
    }
    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
    if (rawToken.length < 24 || rawToken.length > 128) {
      return sendJson(400, { error: 'A valid invitation token is required.' });
    }
    const tokenHash = sha256Hex(rawToken);
    const userEmailNorm = normalizeEmailStrict(ctx.user.email);

    const outcome = await withTransaction(dbAdapter, async tx => {
      await enableAdminTxGuards(tx, ctx);
      const rl = await consumeGovernanceRateLimit(tx, {
        scope: 'invite_accept',
        subjectKey: ctx.user.id,
        maxHits: 12,
        windowSeconds: 900
      });
      if (!rl.allowed) {
        return { status: 429, body: { error: 'Too many invitation attempts. Try again shortly.' } };
      }

      // Enforce 14+ minimum-age eligibility check before any invitation can be redeemed
      const ageRes = await tx.query(
        'SELECT age_eligibility_status FROM auth_users WHERE id = $1 FOR SHARE',
        [ctx.user.id]
      );
      if (!ageRes.rows.length || ageRes.rows[0].age_eligibility_status !== 'eligible_14_plus') {
        return {
          status: 403,
          body: {
            error:
              'Complete the minimum account age check (14+) on your BiteShark account before accepting an invitation.',
            code: 'AGE_ASSESSMENT_REQUIRED'
          }
        };
      }

      const { rows } = await tx.query(
        `SELECT *
         FROM account_invitations
         WHERE token_sha256 = $1
         FOR UPDATE`,
        [tokenHash]
      );
      if (!rows.length) {
        return { status: 404, body: { error: 'Invitation not found or expired.' } };
      }
      const inv = rows[0];
      if (inv.status !== 'issued' || inv.consumed_at || inv.revoked_at) {
        return { status: 409, body: { error: 'This invitation is no longer active.', code: 'INVITATION_INACTIVE' } };
      }
      if (!inv.expires_at || new Date(inv.expires_at).getTime() <= Date.now()) {
        await tx.query("UPDATE account_invitations SET status = 'expired', updated_at = now() WHERE id = $1", [inv.id]);
        return { status: 410, body: { error: 'This invitation has expired.' } };
      }
      if (!userEmailNorm || inv.email_normalized !== userEmailNorm) {
        return {
          status: 403,
          body: {
            error: 'Signed-in account email does not match the invited email address.',
            code: 'INVITATION_EMAIL_MISMATCH'
          }
        };
      }

      // Enforce privilege provenance check before granting Mod/Top
      if (inv.requested_role === 'mod' || inv.requested_role === 'top') {
        if (inv.initiator_role === 'mod' && (!inv.approved_by || inv.approved_by === inv.initiated_by)) {
          return { status: 403, body: { error: 'Privileged invitation lacks Admin: Top approval.' } };
        }
        await tx.query(
          `INSERT INTO platform_roles (user_id, role, granted_by, notes, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (user_id) DO UPDATE
             SET role = CASE
               WHEN platform_roles.role IN ('top', 'platform_admin') AND EXCLUDED.role = 'mod' THEN platform_roles.role
               ELSE EXCLUDED.role
             END,
             granted_by = EXCLUDED.granted_by,
             updated_at = now()`,
          [ctx.user.id, inv.requested_role, inv.approved_by || inv.initiated_by, 'Accepted verified invitation']
        );
        if (inv.requested_role === 'top') {
          await tx.query('DELETE FROM platform_role_revocations WHERE user_id = $1', [ctx.user.id]);
        }
      } else if (inv.requested_role === 'vendor_staff') {
        if (!inv.vendor_id) {
          return { status: 400, body: { error: 'Staff invitation is missing target vendor.' } };
        }
        await tx.query("SELECT set_config('app.is_platform_admin', 'true', true)");
        await tx.query(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
           VALUES ($1, $2, 'staff', $3)
           ON CONFLICT (vendor_id, user_id) DO NOTHING`,
          [inv.vendor_id, ctx.user.id, inv.initiated_by]
        );
      } else if (inv.requested_role === 'vendor_owner') {
        // Vendor owner invitations NEVER bypass vendor onboarding review & Top approval!
        let prefillName = 'Prospective Sonoma Vendor';
        let prefillCity = 'Santa Rosa';
        let prefillCuisine = 'Mexican';
        let prefillKind = 'food_truck';
        if (inv.vendor_id) {
          const vr = await tx.query('SELECT canonical_name, city, cuisine, listing_kind FROM vendors WHERE id = $1', [
            inv.vendor_id
          ]);
          if (vr.rows[0]) {
            prefillName = vr.rows[0].canonical_name;
            prefillCity = vr.rows[0].city;
            prefillCuisine = vr.rows[0].cuisine;
            prefillKind = vr.rows[0].listing_kind;
          }
        }
        const existingApp = await tx.query(
          `SELECT id FROM vendor_applications
           WHERE applicant_user_id = $1 AND status IN ('draft', 'submitted', 'needs_info')
           LIMIT 1`,
          [ctx.user.id]
        );
        if (!existingApp.rows.length) {
          const genSlug = inv.vendor_id ? null : `vendor-${ctx.user.id.slice(-8).toLowerCase()}`;
          await tx.query(
            `INSERT INTO vendor_applications (
               applicant_user_id, applicant_email, claim_type, target_vendor_id, proposed_slug,
               business_name, city, cuisine, listing_kind, service_area,
               contact_name, contact_email, permit_or_license_summary, ownership_statement, status
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Sonoma County', 'Invited Applicant', $2,
                     'Pending applicant permit details', 'Invited vendor claim — complete details and submit for Admin: Top review.', 'draft')`,
            [
              ctx.user.id,
              userEmailNorm,
              inv.vendor_id ? 'existing_listing' : 'new_listing',
              inv.vendor_id || null,
              genSlug,
              prefillName,
              prefillCity,
              prefillCuisine,
              prefillKind
            ]
          );
        }
      }

      await tx.query(
        `UPDATE account_invitations
         SET status = 'consumed',
             consumed_by_user_id = $2,
             consumed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [inv.id, ctx.user.id]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'invite_recipient',
        vendorId: inv.vendor_id || null,
        targetType: 'account_invitation',
        targetId: inv.id,
        action: 'invitation.accept',
        metadata: {
          requested_role: inv.requested_role,
          initiated_by: inv.initiated_by
        }
      });

      return {
        status: 200,
        body: {
          ok: true,
          accepted_role: inv.requested_role,
          accepted_role_label: INVITATION_ROLE_LABELS[inv.requested_role],
          vendor_id: inv.vendor_id,
          requires_vendor_application_review: inv.requested_role === 'vendor_owner'
        }
      };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // =========================================================================
  // 3. Approved Vendor Owner Team Management (`/api/vendor/*`)
  // =========================================================================
  if (normPath === '/api/vendor/members') {
    if (!ctx.authenticated) return sendJson(401, { error: 'Sign in is required.' });
    const vendorId = String(query.vendor_id || body?.vendor_id || '').trim();
    if (!vendorId) return sendJson(400, { error: 'vendor_id is required.' });

    if (method === 'GET') {
      const mem = ctx.memberships.get(vendorId);
      if ((!mem || mem.role !== 'owner' || mem.restrictions?.vendor_access_suspended) && !ctx.isTopAdmin) {
        return sendJson(403, { error: 'Approved Vendor Owner permission is required.' });
      }
      const out = await withTransaction(dbAdapter, async tx => {
        await tx.query("SELECT set_config('app.auth_internal', 'true', true), set_config('app.admin_portal', 'true', true)");
        const { rows } = await tx.query(
          `SELECT m.user_id, m.role, m.created_at, au.email_normalized
           FROM vendor_memberships m
           LEFT JOIN auth_users au ON au.id = m.user_id
           WHERE m.vendor_id = $1
           ORDER BY m.role ASC, m.created_at ASC`,
          [vendorId]
        );
        return rows.map(r => ({
          user_id: r.user_id,
          email: r.email_normalized || null,
          role: r.role,
          role_label: r.role === 'owner' ? ROLE_LABELS.owner : ROLE_LABELS.staff,
          created_at: r.created_at
        }));
      });
      return sendJson(200, { vendor_id: vendorId, members: out });
    }

    if (method === 'DELETE') {
      const targetUserId = String(body?.user_id || query.user_id || '').trim();
      if (!targetUserId) return sendJson(400, { error: 'user_id is required.' });
      const outcome = await withTransaction(dbAdapter, async tx => {
        const verified = await reverifyVendorMembershipInTx(tx, ctx, vendorId, 'owner');
        if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
        const { rows } = await tx.query(
          'SELECT role FROM vendor_memberships WHERE vendor_id = $1 AND user_id = $2 FOR UPDATE',
          [vendorId, targetUserId]
        );
        if (!rows.length) return { status: 404, body: { error: 'Member not found on this vendor.' } };
        if (rows[0].role === 'owner' && !ctx.isTopAdmin) {
          return { status: 403, body: { error: 'Only Admin: Top can remove a Vendor Owner membership.' } };
        }
        await tx.query('DELETE FROM vendor_memberships WHERE vendor_id = $1 AND user_id = $2', [
          vendorId,
          targetUserId
        ]);
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId,
          targetType: 'vendor_membership',
          targetId: `${vendorId}:${targetUserId}`,
          action: 'vendor.member_remove',
          metadata: { removed_role: rows[0].role }
        });
        return { status: 200, body: { ok: true } };
      });
      return sendJson(outcome.status, outcome.body);
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, DELETE' });
  }

  if (normPath === '/api/vendor/staff-invitations') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated) return sendJson(401, { error: 'Sign in is required.' });
    const vendorId = String(body.vendor_id || '').trim();
    const emailNorm = normalizeEmailStrict(body.email);
    const idem = normalizeOptionalIdempotencyKey(body.idempotency_key);
    if (!vendorId || !emailNorm) {
      return sendJson(400, { error: 'Valid vendor_id and staff email address are required.' });
    }
    if (!idem.ok) return sendJson(400, { error: idem.error });

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyVendorMembershipInTx(tx, ctx, vendorId, 'owner');
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await tx.query(
        "SELECT set_config('app.admin_portal', 'true', true), set_config('app.user_id', $1, true)",
        [ctx.user.id]
      );
      const rl = await consumeGovernanceRateLimit(tx, {
        scope: 'vendor_staff_invite',
        subjectKey: ctx.user.id,
        maxHits: 10,
        windowSeconds: 3600
      });
      if (!rl.allowed) return { status: 429, body: { error: 'Too many invitations sent recently.' } };

      const { rawToken, tokenSha256 } = generateOpaqueToken(32);
      const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
      const { rows } = await tx.query(
        `INSERT INTO account_invitations (
           email_normalized, requested_role, vendor_id, status, token_sha256,
           initiated_by, initiator_role, idempotency_key, expires_at
         )
         VALUES ($1, 'vendor_staff', $2, 'issued', $3, $4, 'vendor_owner', $5, $6)
         ON CONFLICT (initiated_by, idempotency_key) WHERE idempotency_key IS NOT NULL
         DO NOTHING
         RETURNING id, email_normalized, requested_role, vendor_id, status, expires_at`,
        [emailNorm, vendorId, tokenSha256, ctx.user.id, idem.value, expiresAt]
      );
      if (!rows.length && idem.value) {
        const existing = await tx.query(
          `SELECT id, email_normalized, requested_role, vendor_id, status, expires_at
           FROM account_invitations
           WHERE initiated_by = $1 AND idempotency_key = $2`,
          [ctx.user.id, idem.value]
        );
        return { status: 200, body: { invitation: existing.rows[0], idempotent_replay: true } };
      }
      await recordTestSafeNotificationInTx(tx, {
        recipientEmail: emailNorm,
        eventKind: 'invitation.vendor_staff',
        subject: 'BiteShark Vendor Staff Invitation',
        summary: `Invited to join vendor ${vendorId} as Vendor Staff (expires ${expiresAt}).`
      });
      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'owner',
        vendorId,
        targetType: 'account_invitation',
        targetId: rows[0].id,
        action: 'invitation.create_vendor_staff',
        metadata: { requested_role: 'vendor_staff' }
      });
      return {
        status: 201,
        body: {
          invitation: rows[0],
          accept_path: `/#accept-invite=${rawToken}`
        }
      };
    });
    return sendJson(outcome.status, outcome.body);
  }

  // =========================================================================
  // 4. Vendor Onboarding & Sensitive Evidence (`/api/onboarding/*`)
  // =========================================================================
  if (normPath === '/api/onboarding/applications') {
    if (!ctx.authenticated || !ctx.user?.id) {
      return sendJson(401, { error: 'Sign in to submit or track a vendor ownership application.' });
    }

    if (method === 'GET') {
      const out = await withTransaction(dbAdapter, async tx => {
        await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
        const { rows: apps } = await tx.query(
          `SELECT
             id, claim_type, target_vendor_id, proposed_slug, business_name, city, cuisine,
             listing_kind, service_area, contact_name, contact_email, contact_phone,
             website_or_menu_url, permit_or_license_summary, ownership_statement,
             status, applicant_feedback, decided_at, decision_reason, approved_vendor_id,
             revision_count, submitted_at, created_at, updated_at
           FROM vendor_applications
           WHERE applicant_user_id = $1
           ORDER BY updated_at DESC
           LIMIT 20`,
          [ctx.user.id]
        );
        const appIds = apps.map(a => a.id);
        let evMap = new Map();
        if (appIds.length) {
          const { rows: evs } = await tx.query(
            `SELECT id, application_id, original_filename, mime_type, byte_size, evidence_kind, retention_expires_at, created_at
             FROM vendor_application_evidence
             WHERE application_id = ANY($1::uuid[]) AND deleted_at IS NULL
             ORDER BY created_at ASC`,
            [appIds]
          );
          for (const ev of evs) {
            if (!evMap.has(ev.application_id)) evMap.set(ev.application_id, []);
            evMap.get(ev.application_id).push(ev);
          }
        }
        const { rows: unclaimed } = await tx.query(
          `SELECT id, canonical_name, city, cuisine, listing_kind
           FROM vendors
           WHERE is_active = true AND ownership_status = 'unclaimed'
           ORDER BY canonical_name ASC`
        );
        return {
          applications: apps.map(a => ({ ...a, evidence: evMap.get(a.id) || [] })),
          unclaimed_listings: unclaimed
        };
      });
      return sendJson(200, out);
    }

    if (method === 'POST') {
      const rawAppId = body.id || body.application_id;
      const appId = typeof rawAppId === 'string' && rawAppId.trim() ? rawAppId.trim() : null;
      if (appId && !UUID_RE.test(appId)) {
        return sendJson(400, { error: 'Invalid application UUID.' });
      }
      const action = body.submit === true || body.action === 'submit' ? 'submit' : 'save_draft';
      const rawClaimType = body.claim_type || body.application_type;
      const claimType = rawClaimType === 'new_listing' ? 'new_listing' : 'existing_listing';
      const targetVendorId =
        claimType === 'existing_listing' && typeof body.target_vendor_id === 'string'
          ? body.target_vendor_id.trim()
          : null;
      const proposedSlug = claimType === 'new_listing' ? validateProposedSlug(body.proposed_slug) : null;

      if (claimType === 'existing_listing' && (!targetVendorId || targetVendorId.length > 80)) {
        return sendJson(400, { error: 'Select the existing Sonoma County directory listing you are claiming.' });
      }
      if (claimType === 'new_listing' && !proposedSlug) {
        return sendJson(400, {
          error: 'Provide a lowercase proposed_slug (2–63 alphanumeric/hyphen characters) for a new listing.'
        });
      }

      const businessName = typeof body.business_name === 'string' ? body.business_name.trim() : '';
      const rawCity = body.city || body.primary_town;
      const city = typeof rawCity === 'string' && rawCity.trim() ? rawCity.trim() : 'Santa Rosa';
      const cuisine = typeof body.cuisine === 'string' && body.cuisine.trim() ? body.cuisine.trim() : 'Mexican';
      const rawKind = typeof (body.listing_kind || body.category) === 'string' ? String(body.listing_kind || body.category).trim().toLowerCase() : 'food_truck';
      const listingKind = ['food_truck', 'venue', 'market_stall', 'farm_stand', 'cafe', 'popup'].includes(rawKind)
        ? rawKind
        : rawKind.includes('coffee') || rawKind.includes('cafe')
          ? 'cafe'
          : rawKind.includes('market')
            ? 'market_stall'
            : rawKind.includes('farm')
              ? 'farm_stand'
              : rawKind.includes('pop')
                ? 'popup'
                : 'food_truck';
      const rawServiceArea = body.service_area || body.public_summary || city;
      const serviceArea = typeof rawServiceArea === 'string' ? rawServiceArea.trim() : '';
      const contactName = typeof body.contact_name === 'string' ? body.contact_name.trim() : '';
      const contactEmail = normalizeEmailStrict(body.contact_email || ctx.user.email);
      const contactPhone = typeof body.contact_phone === 'string' && body.contact_phone.trim() ? body.contact_phone.trim().slice(0, 40) : null;
      const urlCheck = validateOptionalHttpUrl(body.website_or_menu_url || body.website_url);
      const rawPermit = body.permit_or_license_summary || body.ownership_statement;
      const permitSummary = typeof rawPermit === 'string' ? rawPermit.trim().slice(0, 400) : '';
      const ownershipStatement = typeof body.ownership_statement === 'string' ? body.ownership_statement.trim() : '';

      if (!urlCheck.ok) return sendJson(400, { error: urlCheck.error });
      if (
        businessName.length < 2 ||
        businessName.length > 120 ||
        serviceArea.length < 2 ||
        serviceArea.length > 160 ||
        contactName.length < 2 ||
        contactName.length > 100 ||
        !contactEmail ||
        permitSummary.length < 4 ||
        permitSummary.length > 400 ||
        ownershipStatement.length < 10 ||
        ownershipStatement.length > 800
      ) {
        return sendJson(400, {
          error:
            'Complete business_name (2–120), service_area (2–160), contact_name (2–100), valid contact_email, permit_or_license_summary (4–400), and ownership_statement (10–800).'
        });
      }
      if (!['food_truck', 'venue', 'market_stall', 'farm_stand', 'cafe', 'popup'].includes(listingKind)) {
        return sendJson(400, { error: 'Invalid listing_kind.' });
      }

      // Reject client self-approval / moderation field tampering
      for (const forbidden of ['status', 'verified', 'mod_recommendation', 'decided_by', 'internal_notes']) {
        if (
          Object.prototype.hasOwnProperty.call(body, forbidden) &&
          !(forbidden === 'status' && ['draft', 'submitted'].includes(body.status))
        ) {
          return sendJson(403, { error: `Field "${forbidden}" cannot be set by the applicant.` });
        }
      }

      const outcome = await withTransaction(dbAdapter, async tx => {
        await tx.query(
          "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
          [ctx.user.id]
        );
        const rl = await consumeGovernanceRateLimit(tx, {
          scope: 'vendor_app_write',
          subjectKey: ctx.user.id,
          maxHits: 12,
          windowSeconds: 3600
        });
        if (!rl.allowed) return { status: 429, body: { error: 'Too many application updates. Please wait and retry.' } };

        if (claimType === 'existing_listing') {
          const vr = await tx.query('SELECT id, is_active FROM vendors WHERE id = $1', [targetVendorId]);
          if (!vr.rows.length || !vr.rows[0].is_active) {
            return { status: 400, body: { error: 'Target directory listing does not exist or is inactive.' } };
          }
        }

        const nextStatus = action === 'submit' ? 'submitted' : 'draft';

        if (appId) {
          const { rows: existing } = await tx.query(
            'SELECT * FROM vendor_applications WHERE id = $1 AND applicant_user_id = $2 FOR UPDATE',
            [appId, ctx.user.id]
          );
          if (!existing.length) {
            return { status: 404, body: { error: 'Application not found.' } };
          }
          const cur = existing[0];
          if (!['draft', 'needs_info'].includes(cur.status)) {
            return {
              status: 409,
              body: {
                error: `Application in "${cur.status}" state cannot be edited. Wait for review or request follow-up.`
              }
            };
          }
          const isResubmit = cur.status === 'needs_info' && nextStatus === 'submitted';
          const { rows: updated } = await tx.query(
            `UPDATE vendor_applications
             SET claim_type = $2,
                 target_vendor_id = $3,
                 proposed_slug = $4,
                 business_name = $5,
                 city = $6,
                 cuisine = $7,
                 listing_kind = $8,
                 service_area = $9,
                 contact_name = $10,
                 contact_email = $11,
                 contact_phone = $12,
                 website_or_menu_url = $13,
                 permit_or_license_summary = $14,
                 ownership_statement = $15,
                 status = $16,
                 revision_count = revision_count + $17,
                 submitted_at = CASE WHEN $16 = 'submitted' THEN now() ELSE submitted_at END,
                 updated_at = now()
             WHERE id = $1
             RETURNING id, claim_type, target_vendor_id, proposed_slug, business_name, status, revision_count, submitted_at, updated_at`,
            [
              appId,
              claimType,
              targetVendorId,
              proposedSlug,
              businessName,
              city,
              cuisine,
              listingKind,
              serviceArea,
              contactName,
              contactEmail,
              contactPhone,
              urlCheck.value,
              permitSummary,
              ownershipStatement,
              nextStatus,
              isResubmit ? 1 : 0
            ]
          );
          await recordAuditLog(tx, {
            actorId: ctx.user.id,
            actorRole: 'customer',
            vendorId: targetVendorId,
            targetType: 'vendor_application',
            targetId: appId,
            action: isResubmit ? 'vendor_application.resubmit' : `vendor_application.${nextStatus}`,
            metadata: { claim_type: claimType, revision_count: updated[0].revision_count }
          });
          return { status: 200, body: { application: updated[0] } };
        }

        const { rows: recentCount } = await tx.query(
          "SELECT count(*)::int AS c FROM vendor_applications WHERE applicant_user_id = $1 AND created_at > now() - interval '24 hours'",
          [ctx.user.id]
        );
        if ((recentCount[0]?.c || 0) >= 5) {
          return { status: 429, body: { error: 'Maximum of 5 new vendor applications per 24 hours.' } };
        }

        const { rows: created } = await tx.query(
          `INSERT INTO vendor_applications (
             applicant_user_id, applicant_email, claim_type, target_vendor_id, proposed_slug,
             business_name, city, cuisine, listing_kind, service_area,
             contact_name, contact_email, contact_phone, website_or_menu_url,
             permit_or_license_summary, ownership_statement, status, submitted_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                   CASE WHEN $17 = 'submitted' THEN now() ELSE NULL END)
           RETURNING id, claim_type, target_vendor_id, proposed_slug, business_name, status, revision_count, submitted_at, created_at`,
          [
            ctx.user.id,
            ctx.user.email || contactEmail,
            claimType,
            targetVendorId,
            proposedSlug,
            businessName,
            city,
            cuisine,
            listingKind,
            serviceArea,
            contactName,
            contactEmail,
            contactPhone,
            urlCheck.value,
            permitSummary,
            ownershipStatement,
            nextStatus
          ]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'customer',
          vendorId: targetVendorId,
          targetType: 'vendor_application',
          targetId: created[0].id,
          action: `vendor_application.create_${nextStatus}`,
          metadata: { claim_type: claimType }
        });
        return { status: 201, body: { application: created[0] } };
      });

      return sendJson(outcome.status, outcome.body);
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  if (normPath === '/api/onboarding/evidence') {
    if (!ctx.authenticated || !ctx.user?.id) {
      return sendJson(401, { error: 'Sign in is required.' });
    }

    if (method === 'GET') {
      const evId = typeof query.id === 'string' ? query.id.trim() : '';
      if (!UUID_RE.test(evId)) return sendJson(400, { error: 'Valid evidence UUID is required.' });

      const out = await withTransaction(dbAdapter, async tx => {
        if (ctx.isModAdmin) {
          const verifiedMod = await reverifyModeratorInTx(tx, ctx);
          if (!verifiedMod.ok) return { status: verifiedMod.status, error: verifiedMod.error };
          await tx.query("SELECT set_config('app.admin_portal', 'true', true)");
        } else {
          await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
        }
        const { rows } = await tx.query(
          `SELECT e.id, e.uploaded_by, e.original_filename, e.mime_type, e.byte_size, e.file_bytes, e.deleted_at, a.applicant_user_id
           FROM vendor_application_evidence e
           JOIN vendor_applications a ON a.id = e.application_id
           WHERE e.id = $1`,
          [evId]
        );
        if (!rows.length || rows[0].deleted_at) {
          return { status: 404, error: 'Evidence file not found.' };
        }
        const ev = rows[0];
        if (!ctx.isModAdmin && ev.applicant_user_id !== ctx.user.id) {
          return { status: 403, error: 'Not authorized to access this evidence file.' };
        }
        return { status: 200, ev };
      });

      if (out.status !== 200) {
        return sendJson(out.status, { error: out.error });
      }
      const safeName = sanitizeFilename(out.ev.original_filename);
      rawRes.statusCode = 200;
      rawRes.setHeader('Content-Type', out.ev.mime_type);
      rawRes.setHeader('Content-Length', out.ev.file_bytes.length);
      rawRes.setHeader('Content-Disposition', `attachment; filename="evidence-${safeName}"`);
      rawRes.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      rawRes.setHeader('X-Content-Type-Options', 'nosniff');
      rawRes.setHeader('Cache-Control', 'private, no-store, max-age=0');
      rawRes.end(out.ev.file_bytes);
      return;
    }

    if (method === 'POST') {
      const appId = typeof body.application_id === 'string' ? body.application_id.trim() : '';
      const rawEvKind = typeof body.evidence_kind === 'string' ? body.evidence_kind.trim() : 'other';
      const evidenceKind = rawEvKind === 'ownership_proof' ? 'business_license' : rawEvKind;
      const rawFilename = sanitizeFilename(body.filename || 'document.pdf');
      const rawB64 = typeof body.data_base64 === 'string' ? body.data_base64.trim() : '';

      if (!UUID_RE.test(appId)) return sendJson(400, { error: 'Valid application_id is required.' });
      if (!['health_permit', 'business_license', 'menu_or_signage', 'venue_authorization', 'other'].includes(evidenceKind)) {
        return sendJson(400, { error: 'Invalid evidence_kind.' });
      }
      if (!rawB64 || rawB64.length > Math.ceil((MAX_EVIDENCE_BYTES * 4) / 3) + 128) {
        return sendJson(413, { error: 'Evidence file must be non-empty and at most 512 KiB.' });
      }
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(rawB64)) {
        return sendJson(400, { error: 'data_base64 must be valid standard base64.' });
      }

      const fileBuf = Buffer.from(rawB64, 'base64');
      const verifiedFile = verifyEvidenceBufferAndMime(fileBuf, body.mime_type);
      if (!verifiedFile.ok) {
        return sendJson(400, { error: verifiedFile.error, code: 'UNSAFE_EVIDENCE_FILE' });
      }

      const outcome = await withTransaction(dbAdapter, async tx => {
        await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
        const { rows: appRows } = await tx.query(
          'SELECT id, status FROM vendor_applications WHERE id = $1 AND applicant_user_id = $2 FOR UPDATE',
          [appId, ctx.user.id]
        );
        if (!appRows.length) return { status: 404, body: { error: 'Application not found.' } };
        if (!['draft', 'submitted', 'needs_info'].includes(appRows[0].status)) {
          return { status: 409, body: { error: 'Cannot upload evidence to a finalized application.' } };
        }
        const { rows: countRows } = await tx.query(
          'SELECT count(*)::int AS c FROM vendor_application_evidence WHERE application_id = $1 AND deleted_at IS NULL',
          [appId]
        );
        if ((countRows[0]?.c || 0) >= MAX_EVIDENCE_PER_APPLICATION) {
          return {
            status: 409,
            body: { error: `At most ${MAX_EVIDENCE_PER_APPLICATION} evidence attachments are permitted per application.` }
          };
        }

        const { rows: inserted } = await tx.query(
          `INSERT INTO vendor_application_evidence (
             application_id, uploaded_by, original_filename, mime_type, byte_size, sha256_hex, evidence_kind, file_bytes
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, application_id, original_filename, mime_type, byte_size, sha256_hex, evidence_kind, retention_expires_at, created_at`,
          [
            appId,
            ctx.user.id,
            rawFilename,
            verifiedFile.mimeType,
            verifiedFile.byteSize,
            verifiedFile.sha256Hex,
            evidenceKind,
            fileBuf
          ]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'customer',
          targetType: 'vendor_application_evidence',
          targetId: inserted[0].id,
          action: 'onboarding.evidence_upload',
          metadata: {
            application_id: appId,
            mime_type: verifiedFile.mimeType,
            byte_size: verifiedFile.byteSize,
            evidence_kind: evidenceKind
          }
        });
        return { status: 201, body: { evidence: inserted[0] } };
      });
      return sendJson(outcome.status, outcome.body);
    }

    if (method === 'DELETE') {
      const evId = typeof (body?.id || query.id) === 'string' ? String(body?.id || query.id).trim() : '';
      if (!UUID_RE.test(evId)) return sendJson(400, { error: 'Valid evidence UUID is required.' });

      const outcome = await withTransaction(dbAdapter, async tx => {
        if (ctx.isTopAdmin) {
          await enableAdminTxGuards(tx, ctx);
        } else {
          await tx.query("SELECT set_config('app.user_id', $1, true)", [ctx.user.id]);
        }
        const { rows } = await tx.query(
          `SELECT e.id, e.uploaded_by, e.deleted_at, a.status
           FROM vendor_application_evidence e
           JOIN vendor_applications a ON a.id = e.application_id
           WHERE e.id = $1
           FOR UPDATE OF e`,
          [evId]
        );
        if (!rows.length || rows[0].deleted_at) {
          return { status: 404, body: { error: 'Evidence file not found.' } };
        }
        if (!ctx.isTopAdmin && rows[0].uploaded_by !== ctx.user.id) {
          return { status: 403, body: { error: 'Not authorized to delete this evidence file.' } };
        }
        // Scrub raw bytes on deletion per retention/deletion policy
        await tx.query(
          `UPDATE vendor_application_evidence
           SET deleted_at = now(),
               deleted_by = $2,
               file_bytes = ''::bytea
           WHERE id = $1`,
          [evId, ctx.user.id]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: ctx.isTopAdmin ? 'top' : 'customer',
          targetType: 'vendor_application_evidence',
          targetId: evId,
          action: 'onboarding.evidence_delete'
        });
        return { status: 200, body: { ok: true } };
      });
      return sendJson(outcome.status, outcome.body);
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST, DELETE' });
  }

  // =========================================================================
  // 5. Community Content Reporting & Customer/Vendor Support Issues
  // =========================================================================
  if (normPath === '/api/community/report') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated || !ctx.user?.id) {
      return sendJson(401, { error: 'Sign in to report a community post.' });
    }
    const postId = typeof body.post_id === 'string' ? body.post_id.trim() : '';
    const rawReasonCat = typeof body.reason_category === 'string' ? body.reason_category.trim() : '';
    const reasonCategory = rawReasonCat === 'privacy' ? 'harassment' : rawReasonCat;
    const details = typeof body.details === 'string' && body.details.trim() ? body.details.trim().slice(0, 500) : null;

    if (!UUID_RE.test(postId) || !['spam', 'inaccurate', 'harassment', 'off_topic', 'other'].includes(reasonCategory)) {
      return sendJson(400, { error: 'Valid post_id and reason_category are required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      await tx.query(
        `SELECT
           set_config('app.user_id', $1, true),
           set_config('app.auth_internal', 'true', true),
           set_config('app.community_report', 'true', true)`,
        [ctx.user.id]
      );
      const rl = await consumeGovernanceRateLimit(tx, {
        scope: 'community_report',
        subjectKey: ctx.user.id,
        maxHits: 10,
        windowSeconds: 3600
      });
      if (!rl.allowed) return { status: 429, body: { error: 'Too many reports submitted recently.' } };

      const { rows: postRows } = await tx.query(
        "SELECT id, place_id, status FROM community_reviews WHERE id = $1 AND status = 'approved' FOR UPDATE",
        [postId]
      );
      if (!postRows.length) {
        return { status: 404, body: { error: 'Published community post not found.' } };
      }

      const { rows: ins } = await tx.query(
        `INSERT INTO community_reports (post_id, reporter_user_id, reason_category, details)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (post_id, reporter_user_id) DO NOTHING
         RETURNING id, status, created_at`,
        [postId, ctx.user.id, reasonCategory, details]
      );
      if (!ins.length) {
        return {
          status: 200,
          body: { ok: true, already_reported: true, message: 'Your report for this post is already in the moderation queue.' }
        };
      }

      await tx.query(
        `UPDATE community_reviews
         SET report_count = report_count + 1,
             last_reported_at = now()
         WHERE id = $1`,
        [postId]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'customer',
        vendorId: postRows[0].place_id || null,
        targetType: 'community_review',
        targetId: postId,
        action: 'community.report',
        metadata: { reason_category: reasonCategory }
      });

      return {
        status: 201,
        body: { ok: true, report_id: ins[0].id, message: 'Report submitted for moderator review.' }
      };
    });
    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/issues') {
    if (!ctx.authenticated || !ctx.user?.id) {
      return sendJson(401, { error: 'Sign in to view or submit support issues.' });
    }

    if (method === 'GET') {
      const singleId = typeof query.issue_id === 'string' && UUID_RE.test(query.issue_id.trim()) ? query.issue_id.trim() : '';
      const out = await withTransaction(dbAdapter, async tx => {
        await tx.query(
          "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
          [ctx.user.id]
        );
        const ageRes = await tx.query(
          'SELECT age_eligibility_status FROM auth_users WHERE id = $1',
          [ctx.user.id]
        );
        const isEligible = ageRes.rows[0]?.age_eligibility_status === 'eligible_14_plus';

        // Unassessed accounts may view ONLY narrow privacy/accessibility/account-access support tickets,
        // never historical operational/booking/vendor dispute records.
        const scopeSql = isEligible
          ? ''
          : " AND category = 'account_access' AND vendor_id IS NULL AND related_booking_id IS NULL AND related_review_id IS NULL";

        const { rows: issues } = await tx.query(
          `SELECT
             id, reporter_context, category, severity, status, vendor_id,
             related_booking_id, related_review_id, subject, description,
             resolution_reason, created_at, updated_at, resolved_at
           FROM support_issues
           WHERE reporter_user_id = $1${scopeSql}
           ORDER BY updated_at DESC
           LIMIT 30`,
          [ctx.user.id]
        );
        const ids = issues.map(i => i.id);
        const notesMap = new Map();
        if (ids.length) {
          // RLS strictly filters `visibility = 'reporter_visible'`; explicit WHERE reinforces defense in depth
          const { rows: notes } = await tx.query(
            `SELECT id, issue_id, author_role, body, created_at
             FROM support_issue_notes
             WHERE issue_id = ANY($1::uuid[]) AND visibility = 'reporter_visible'
             ORDER BY created_at ASC`,
            [ids]
          );
          for (const n of notes) {
            if (!notesMap.has(n.issue_id)) notesMap.set(n.issue_id, []);
            notesMap.get(n.issue_id).push(n);
          }
        }
        const enriched = issues.map(i => ({ ...i, responses: notesMap.get(i.id) || [], notes: notesMap.get(i.id) || [] }));
        if (singleId) {
          const match = enriched.find(i => i.id === singleId);
          return { single: match || null };
        }
        return { list: enriched };
      });
      if (singleId) {
        if (!out.single) return sendJson(404, { error: 'Issue not found.' });
        return sendJson(200, { issue: out.single, notes: out.single.notes });
      }
      return sendJson(200, { issues: out.list });
    }

    if (method === 'POST') {
      const rawCat = typeof body.category === 'string' ? body.category.trim() : '';
      const catAlias = {
        booking_issue: 'booking_dispute',
        vendor_dispute: 'vendor_conduct',
        safety_concern: 'vendor_conduct',
        privacy_request: 'account_access',
        accessibility_support: 'account_access'
      };
      const category = catAlias[rawCat] || rawCat;
      const isNarrowSupportCategory = ['account_access', 'privacy_request', 'accessibility_support'].includes(rawCat);
      const severity = typeof body.severity === 'string' && body.severity.trim() ? body.severity.trim() : 'normal';
      const reporterContext = body.reporter_context === 'vendor' && ctx.memberships.size > 0 ? 'vendor' : 'customer';
      const vendorId = typeof body.vendor_id === 'string' && body.vendor_id.trim() ? body.vendor_id.trim() : null;
      const bookingId = typeof body.related_booking_id === 'string' && body.related_booking_id.trim() ? body.related_booking_id.trim() : null;
      const reviewId = typeof body.related_review_id === 'string' && body.related_review_id.trim() ? body.related_review_id.trim() : null;
      const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const idem = normalizeOptionalIdempotencyKey(body.idempotency_key);

      if (!idem.ok) return sendJson(400, { error: idem.error });
      if (
        !['listing_accuracy', 'booking_dispute', 'pager_issue', 'vendor_conduct', 'account_access', 'abuse_report', 'other'].includes(category) ||
        !['low', 'normal', 'high', 'urgent'].includes(severity) ||
        subject.length < 5 ||
        subject.length > 140 ||
        description.length < 15 ||
        description.length > 1500
      ) {
        return sendJson(400, {
          error: 'Provide a valid category, severity, subject (5–140 chars), and description (15–1500 chars).'
        });
      }
      if (bookingId && !UUID_RE.test(bookingId)) return sendJson(400, { error: 'Invalid related_booking_id.' });
      if (reviewId && !UUID_RE.test(reviewId)) return sendJson(400, { error: 'Invalid related_review_id.' });

      const outcome = await withTransaction(dbAdapter, async tx => {
        await tx.query(
          "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
          [ctx.user.id]
        );
        const ageRes = await tx.query(
          'SELECT age_eligibility_status FROM auth_users WHERE id = $1 FOR SHARE',
          [ctx.user.id]
        );
        const isEligible = ageRes.rows[0]?.age_eligibility_status === 'eligible_14_plus';
        if (!isEligible) {
          if (!isNarrowSupportCategory || vendorId || bookingId || reviewId || body.reporter_context === 'vendor') {
            return {
              status: 403,
              body: buildAgeAssessmentRequiredPayload('/')
            };
          }
        }
        const effectiveReporterContext = isEligible ? reporterContext : 'customer';

        const rl = await consumeGovernanceRateLimit(tx, {
          scope: 'issue_create',
          subjectKey: ctx.user.id,
          maxHits: 8,
          windowSeconds: 86400
        });
        if (!rl.allowed) {
          return { status: 429, body: { error: 'Issue submission rate limit reached (max 8 per 24 hours).' } };
        }

        if (vendorId) {
          const vr = await tx.query('SELECT id FROM vendors WHERE id = $1', [vendorId]);
          if (!vr.rows.length) return { status: 400, body: { error: 'Unknown vendor_id.' } };
        }

        if (bookingId) {
          const br = await tx.query('SELECT id, requester_user_id, truck_id FROM bookings WHERE id = $1', [bookingId]);
          if (!br.rows.length) return { status: 400, body: { error: 'Related booking not found.' } };
          const ownsBooking =
            br.rows[0].requester_user_id === ctx.user.id ||
            (br.rows[0].truck_id && ctx.memberships.has(br.rows[0].truck_id));
          if (!ownsBooking && !ctx.isModAdmin) {
            return { status: 403, body: { error: 'Not authorized to link this booking.' } };
          }
        }

        const slaDueAt = computeIssueSlaDueAt(severity);
        const { rows } = await tx.query(
          `INSERT INTO support_issues (
             reporter_user_id, reporter_email, reporter_context, category, severity,
             vendor_id, related_booking_id, related_review_id, subject, description,
             sla_due_at, idempotency_key
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (reporter_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
           DO NOTHING
           RETURNING id, category, severity, status, vendor_id, subject, created_at`,
          [
            ctx.user.id,
            ctx.user.email || null,
            effectiveReporterContext,
            category,
            severity,
            vendorId,
            bookingId,
            reviewId,
            subject,
            description,
            slaDueAt,
            idem.value
          ]
        );
        if (!rows.length && idem.value) {
          const prev = await tx.query(
            `SELECT id, category, severity, status, vendor_id, subject, created_at
             FROM support_issues
             WHERE reporter_user_id = $1 AND idempotency_key = $2`,
            [ctx.user.id, idem.value]
          );
          return { status: 200, body: { issue: prev.rows[0], idempotent_replay: true } };
        }

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: effectiveReporterContext,
          vendorId,
          targetType: 'support_issue',
          targetId: rows[0].id,
          action: 'issue.create',
          metadata: { category, severity }
        });
        return { status: 201, body: { issue: rows[0] } };
      });
      return sendJson(outcome.status, outcome.body);
    }

    return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  if (normPath === '/api/issues/reply') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!ctx.authenticated || !ctx.user?.id) return sendJson(401, { error: 'Sign in is required.' });
    const issueId = typeof body.issue_id === 'string' ? body.issue_id.trim() : '';
    const replyBody = typeof (body.body ?? body.message) === 'string' ? String(body.body ?? body.message).trim() : '';
    if (!UUID_RE.test(issueId) || replyBody.length < 2 || replyBody.length > 1500) {
      return sendJson(400, { error: 'Valid issue_id and message (2–1500 chars) are required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      await tx.query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.auth_internal', 'true', true)",
        [ctx.user.id]
      );
      const ageRes = await tx.query(
        'SELECT age_eligibility_status FROM auth_users WHERE id = $1 FOR SHARE',
        [ctx.user.id]
      );
      const isEligible = ageRes.rows[0]?.age_eligibility_status === 'eligible_14_plus';

      const { rows } = await tx.query(
        'SELECT id, status, reporter_context, category, vendor_id, related_booking_id FROM support_issues WHERE id = $1 AND reporter_user_id = $2 FOR UPDATE',
        [issueId, ctx.user.id]
      );
      if (!rows.length) return { status: 404, body: { error: 'Issue not found.' } };
      if (!isEligible && (rows[0].category !== 'account_access' || rows[0].vendor_id || rows[0].related_booking_id)) {
        return { status: 403, body: buildAgeAssessmentRequiredPayload('/') };
      }
      if (rows[0].status === 'closed') {
        return { status: 409, body: { error: 'Closed issues cannot receive new replies. Open a new issue if needed.' } };
      }
      await tx.query(
        `INSERT INTO support_issue_notes (issue_id, author_user_id, author_role, visibility, body)
         VALUES ($1, $2, $3, 'reporter_visible', $4)`,
        [issueId, ctx.user.id, rows[0].reporter_context, replyBody]
      );
      await tx.query(
        `UPDATE support_issues
         SET status = CASE WHEN status = 'waiting' THEN 'open' ELSE status END,
             updated_at = now()
         WHERE id = $1`,
        [issueId]
      );
      return { status: 201, body: { ok: true } };
    });
    return sendJson(outcome.status, outcome.body);
  }

  // =========================================================================
  // 6. Administration Portal Endpoints (`/api/admin/*`) — `Admin: Mod` & `Admin: Top`
  // =========================================================================
  if (!normPath.startsWith('/api/admin/')) {
    return sendJson(404, { error: 'Not found' });
  }

  if (!ctx.authenticated || !ctx.user?.id) {
    return sendJson(401, { error: 'Sign in is required.', login_url: '/login.html?next=/admin' });
  }
  if (!ctx.isModAdmin) {
    return sendJson(403, { error: 'Administrator access (Admin: Mod or Admin: Top) is required.' });
  }

  // -------------------------------------------------------------------------
  // 6A. Overview & Safe Operational Health (`GET /api/admin/overview`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/overview') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);
      await tx.query("SELECT set_config('app.pager_internal', 'true', true)");

      const appsQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status = 'submitted')::int AS pending_submitted,
            count(*) FILTER (WHERE status = 'needs_info')::int AS needs_info,
            count(*) FILTER (WHERE status = 'submitted' AND mod_recommendation <> 'none')::int AS awaiting_top_decision
          FROM vendor_applications
        `);
      const invQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status = 'pending_top_approval')::int AS pending_privileged,
            count(*) FILTER (WHERE status = 'issued' AND expires_at > now())::int AS active_issued
          FROM account_invitations
        `);
      const commQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status = 'pending')::int AS pending_comments,
            count(*) FILTER (WHERE status = 'approved' AND report_count > 0)::int AS flagged_approved_comments,
            count(*) FILTER (WHERE status = 'hidden')::int AS hidden_comments
          FROM community_reviews
        `);
      const repQ = await tx.query(`SELECT count(*) FILTER (WHERE status = 'open')::int AS open_reports FROM community_reports`);
      const issQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status IN ('open', 'in_progress', 'waiting'))::int AS open_issues,
            count(*) FILTER (WHERE status IN ('open', 'in_progress', 'waiting') AND sla_due_at < now())::int AS overdue_issues,
            count(*) FILTER (WHERE status IN ('open', 'in_progress', 'waiting') AND severity IN ('high', 'urgent'))::int AS high_priority_issues
          FROM support_issues
        `);
      const vendQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE is_active = true)::int AS active_vendors,
            count(*) FILTER (WHERE ownership_status = 'approved_owner')::int AS claimed_vendors,
            count(*) FILTER (
              WHERE is_active = false
                 OR vendor_access_suspended = true
                 OR hidden_from_discovery = true
                 OR bookings_restricted = true
                 OR pager_restricted = true
                 OR needs_info_correction = true
            )::int AS restricted_or_suspended_vendors
          FROM vendors
          WHERE id NOT LIKE 'estrella%' AND id <> 'owner-truck'
        `);
      const delivQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE status = 'queued')::int AS outbox_queued,
            count(*) FILTER (WHERE status = 'retry_scheduled')::int AS outbox_retrying,
            count(*) FILTER (WHERE status = 'failed_permanent')::int AS outbox_failed_permanent
          FROM pager_notification_deliveries
        `);
      const readinessQ = await tx.query(`
          SELECT
            count(*) FILTER (WHERE is_launch_critical = true AND status NOT IN ('legally_approved', 'not_applicable'))::int AS unresolved_launch_critical,
            count(*) FILTER (WHERE status = 'legally_approved')::int AS legally_approved_count,
            count(*) FILTER (WHERE status = 'needs_re_review')::int AS needs_re_review_count,
            count(*)::int AS total_items,
            COALESCE(bool_or(item_key = 'final_legal_launch_gate' AND status = 'legally_approved'), false) AS final_launch_approved
          FROM compliance_readiness_items
        `);

      const notifCfg = inspectNotificationRuntimeConfig();
      const writePause = inspectWritePauseConfig();

      const appsRow = appsQ.rows[0] || {};
      const invRow = invQ.rows[0] || {};
      const commRow = commQ.rows[0] || {};
      const repCount = repQ.rows[0]?.open_reports || 0;
      const issRow = issQ.rows[0] || {};
      const vendRow = vendQ.rows[0] || {};
      const delivRow = delivQ.rows[0] || {};
      const readinessRow = readinessQ.rows[0] || {};
      const unresolvedCritical = readinessRow.unresolved_launch_critical || 0;
      const launchReady = Boolean(readinessRow.final_launch_approved) && unresolvedCritical === 0;

      return {
        actor: {
          id: ctx.user.id,
          email: ctx.user.email,
          level: verified.actorRole,
          label: verified.actorRole === 'top' ? ROLE_LABELS.top : ROLE_LABELS.mod
        },
        counts: {
          pending_applications: (appsRow.pending_submitted || 0) + (appsRow.needs_info || 0),
          mod_recommended_applications: appsRow.awaiting_top_decision || 0,
          pending_privileged_invitations: invRow.pending_privileged || 0,
          pending_comments: commRow.pending_comments || 0,
          reported_comments: Math.max(commRow.flagged_approved_comments || 0, repCount),
          open_issues: issRow.open_issues || 0,
          overdue_issues: issRow.overdue_issues || 0,
          suspended_vendors: vendRow.restricted_or_suspended_vendors || 0,
          restricted_vendors: vendRow.restricted_or_suspended_vendors || 0,
          unresolved_launch_critical: unresolvedCritical,
          needs_re_review_items: readinessRow.needs_re_review_count || 0
        },
        launch_readiness: {
          launch_ready: launchReady,
          launch_readiness_incomplete: !launchReady,
          unresolved_launch_critical: unresolvedCritical,
          legally_approved_count: readinessRow.legally_approved_count || 0,
          needs_re_review_count: readinessRow.needs_re_review_count || 0,
          total_items: readinessRow.total_items || 0,
          reminder_banner: LAUNCH_INCOMPLETE_REMINDER_TEXT,
          deployment_portal_notice: DEPLOYMENT_PORTAL_REMINDER_NOTE
        },
        queues: {
          vendor_applications: appsRow,
          invitations: invRow,
          moderation: {
            ...commRow,
            open_reports: repCount
          },
          issues: issRow,
          vendors: vendRow
        },
        operational_health: {
          push_delivery_enabled: Boolean(notifCfg.push_enabled),
          push_provider_mode: notifCfg.provider_mode,
          subscriptions_paused: Boolean(notifCfg.subscriptions_paused),
          delivery_paused: Boolean(notifCfg.delivery_paused),
          write_pause_active: writePause.active,
          write_pause_scopes: writePause.scopes,
          write_pause: { active: writePause.active, scopes: writePause.scopes },
          outbox: delivRow,
          outbox_queue: {
            pending: delivRow.outbox_queued || 0,
            retrying: delivRow.outbox_retrying || 0,
            dead_letter: delivRow.outbox_failed_permanent || 0,
            oldest_pending_age_sec: 0
          }
        },
        observed_at: new Date().toISOString()
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  // -------------------------------------------------------------------------
  // 6A-Email. Authentication Email Delivery & Domain Readiness (`GET /api/admin/email-readiness`) — `Admin: Top` ONLY
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/email-readiness') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const accessCheck = await withTransaction(dbAdapter, async tx => {
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) return { denied: verifiedTop };
      return { ok: true };
    });
    if (accessCheck.denied) {
      return sendJson(accessCheck.denied.status, {
        error: accessCheck.denied.error || 'Only Admin: Top may inspect authentication email readiness.',
        code: 'TOP_ADMIN_REQUIRED'
      });
    }
    const report = await inspectAdminEmailReadiness(dbAdapter);
    return sendJson(200, report);
  }

  // -------------------------------------------------------------------------
  // 6B. Read-Only Vendor Viewpoint Projection (`GET /api/admin/vendor-preview`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/vendor-preview') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const vendorId = typeof query.vendor_id === 'string' ? query.vendor_id.trim() : '';
    if (!vendorId || vendorId.length > 80) return sendJson(400, { error: 'vendor_id is required.' });

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      const { rows: vRows } = await tx.query(
        `SELECT
           v.id, v.canonical_name, v.city, v.cuisine, v.listing_kind, v.event_bookable, v.is_active,
           v.ownership_status, v.verified, v.photo_rights_verified,
           v.hidden_from_discovery, v.bookings_restricted, v.vendor_access_suspended,
           v.pager_restricted, v.needs_info_correction, v.correction_note, v.restriction_reason,
           v.restriction_authority, v.temp_restriction_expires_at,
           op.display_name, op.description, op.cuisine AS op_cuisine, op.accepting_bookings,
           ts.location AS live_location, ts.lat AS live_lat, ts.lng AS live_lng, ts.is_open AS live_is_open
         FROM vendors v
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         LEFT JOIN truck_settings ts ON ts.truck_id = v.id
         WHERE v.id = $1`,
        [vendorId]
      );
      if (!vRows.length) return { notFound: true };
      const v = vRows[0];
      await enableAdminTxGuards(tx, ctx);
      const statsRes = await tx.query(
        `SELECT
           count(*)::int AS total_requests,
           count(*) FILTER (WHERE status = 'pending')::int AS pending,
           count(*) FILTER (WHERE status = 'accepted')::int AS accepted
         FROM bookings
         WHERE truck_id = $1`,
        [vendorId]
      );
      const schedRes = await tx.query(
        `SELECT to_char(service_date, 'YYYY-MM-DD') AS service_date, opens_at, closes_at, location, status
         FROM owner_schedule
         WHERE truck_id = $1 AND service_date >= CURRENT_DATE - 1
         ORDER BY service_date ASC
         LIMIT 10`,
        [vendorId]
      );
      const pagersRes = await tx.query(
        `SELECT count(*)::int AS active_pagers
         FROM pickup_pagers
         WHERE vendor_id = $1 AND expires_at > now() AND status NOT IN ('collected', 'cancelled')`,
        [vendorId]
      );
      const memRes = await tx.query(
        `SELECT vm.user_id, vm.role, au.email_normalized AS email
         FROM vendor_memberships vm
         LEFT JOIN auth_users au ON au.id = vm.user_id
         WHERE vm.vendor_id = $1
         ORDER BY vm.role ASC`,
        [vendorId]
      );
      const histRes = await tx.query(
        `SELECT id, vendor_id, actor_id, actor_role, action, reason, before_state, after_state, created_at
         FROM vendor_status_history
         WHERE vendor_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [vendorId]
      );

      const effRestr = evaluateEffectiveVendorRestrictions(v);
      const statsRow = statsRes.rows[0] || { total_requests: 0, pending: 0, accepted: 0 };
      const activePagersCount = pagersRes.rows[0]?.active_pagers || 0;

      return {
        preview_read_only: true,
        admin_actor: {
          id: ctx.user.id,
          email: ctx.user.email,
          level: verified.actorRole,
          label: verified.actorRole === 'top' ? ROLE_LABELS.top : ROLE_LABELS.mod,
          can_act_on_behalf: verified.actorRole === 'top'
        },
        vendor: {
          id: v.id,
          canonical_name: v.canonical_name,
          display_name: v.display_name || v.canonical_name,
          city: v.city,
          town: v.city,
          cuisine: v.op_cuisine || v.cuisine,
          description: v.description || null,
          summary: v.description || null,
          listing_kind: v.listing_kind,
          category: v.listing_kind,
          event_bookable: v.event_bookable,
          booking_enabled: v.event_bookable,
          accepting_bookings: v.accepting_bookings !== false,
          is_active: v.is_active,
          ownership_status: v.ownership_status,
          verified: v.verified,
          verified_status: v.verified,
          photo_rights_verified: v.photo_rights_verified,
          photo_rights_confirmed: v.photo_rights_verified,
          restrictions: effRestr,
          effective_restrictions: effRestr,
          live_location: v.live_location || null,
          live_lat: v.live_lat,
          live_lng: v.live_lng,
          live_is_open: v.live_is_open
        },
        customer_impact: {
          open_bookings: (statsRow.pending || 0) + (statsRow.accepted || 0),
          active_pagers: activePagersCount
        },
        members: memRes.rows,
        status_history: histRes.rows,
        stats: statsRow,
        schedule: schedRes.rows,
        active_pagers_count: activePagersCount
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    if (out.notFound) return sendJson(404, { error: 'Vendor not found.' });
    return sendJson(200, out);
  }

  // -------------------------------------------------------------------------
  // 6C. Vendor Applications Review Queue (`/api/admin/applications*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/applications') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const statusFilter = typeof query.status === 'string' && query.status.trim() ? query.status.trim() : '';
    const rawRec = query.mod_recommendation || query.recommendation || '';
    const recFilter =
      typeof rawRec === 'string' && rawRec.trim()
        ? rawRec.trim() === 'unreviewed'
          ? 'none'
          : rawRec.trim()
        : '';
    const conflictsOnly = query.conflicts_only === '1' || query.conflicts_only === 'true';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ['1=1'];
      const params = [];
      if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        conds.push(`a.status = $${params.length}`);
      }
      if (recFilter && recFilter !== 'all') {
        params.push(recFilter);
        conds.push(`a.mod_recommendation = $${params.length}`);
      }
      if (qText) {
        params.push(qText);
        conds.push(
          `(a.business_name ILIKE $${params.length} OR a.applicant_email ILIKE $${params.length} OR COALESCE(a.target_vendor_id, a.proposed_slug, '') ILIKE $${params.length} OR a.city ILIKE $${params.length})`
        );
      }
      if (conflictsOnly) {
        conds.push(`(
          (a.target_vendor_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM vendor_memberships vm WHERE vm.vendor_id = a.target_vendor_id AND vm.role = 'owner'
          ))
          OR (a.target_vendor_id IS NOT NULL AND (
            SELECT count(*) FROM vendor_applications a2
            WHERE a2.target_vendor_id = a.target_vendor_id AND a2.status IN ('submitted', 'needs_info')
          ) > 1)
        )`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM vendor_applications a WHERE ${whereSql}`, params);

      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           a.*,
           v.canonical_name AS target_canonical_name,
           v.ownership_status AS target_ownership_status,
           EXISTS (
             SELECT 1 FROM vendor_memberships vm
             WHERE vm.vendor_id = a.target_vendor_id AND vm.role = 'owner'
           ) AS target_already_has_owner,
           (
             SELECT count(*)::int FROM vendor_applications a2
             WHERE a2.target_vendor_id IS NOT NULL
               AND a2.target_vendor_id = a.target_vendor_id
               AND a2.id <> a.id
               AND a2.status IN ('submitted', 'needs_info')
           ) AS competing_open_claims
         FROM vendor_applications a
         LEFT JOIN vendors v ON v.id = a.target_vendor_id
         WHERE ${whereSql}
         ORDER BY
           CASE a.status WHEN 'submitted' THEN 0 WHEN 'needs_info' THEN 1 ELSE 2 END ASC,
           a.updated_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const appIds = rows.map(r => r.id);
      const evMap = new Map();
      if (appIds.length) {
        const { rows: evs } = await tx.query(
          `SELECT id, application_id, original_filename, mime_type, byte_size, evidence_kind, retention_expires_at, created_at
           FROM vendor_application_evidence
           WHERE application_id = ANY($1::uuid[]) AND deleted_at IS NULL
           ORDER BY created_at ASC`,
          [appIds]
        );
        for (const ev of evs) {
          if (!evMap.has(ev.application_id)) evMap.set(ev.application_id, []);
          evMap.get(ev.application_id).push(ev);
        }
      }

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        applications: rows.map(r => {
          const evList = (evMap.get(r.id) || []).map(ev => ({ ...ev, byte_length: ev.byte_size }));
          const conflictCount = Number(r.competing_open_claims || 0) + (r.target_already_has_owner && r.status !== 'approved' ? 1 : 0);
          return {
            ...r,
            application_type: r.claim_type === 'new_listing' ? 'new_listing' : 'claim_existing',
            existing_vendor_name: r.target_canonical_name || null,
            existing_ownership_status: r.target_ownership_status || null,
            primary_town: r.city,
            category: r.listing_kind,
            public_summary: r.service_area,
            website_url: r.website_or_menu_url,
            open_conflict_claims: conflictCount,
            has_ownership_conflict: conflictCount > 0,
            evidence: evList
          };
        })
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/applications/decision') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const appId = typeof body.application_id === 'string' ? body.application_id.trim() : '';
    const rawAction = typeof body.action === 'string' ? body.action.trim() : '';
    const action = rawAction === 'save_internal_note' ? 'add_internal_note' : rawAction;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const internalNote =
      typeof (body.internal_note ?? body.internal_notes) === 'string'
        ? String(body.internal_note ?? body.internal_notes).trim()
        : '';
    const expectedStatus = typeof body.expected_status === 'string' && body.expected_status.trim() ? body.expected_status.trim() : null;
    const expectedUpdatedAt =
      typeof body.expected_updated_at === 'string' && body.expected_updated_at.trim()
        ? body.expected_updated_at.trim()
        : null;

    if (!UUID_RE.test(appId)) return sendJson(400, { error: 'Valid application_id is required.' });
    if (
      ![
        'add_internal_note',
        'request_info',
        'recommend_approve',
        'recommend_reject',
        'approve',
        'reject',
        'suspend'
      ].includes(action)
    ) {
      return sendJson(400, { error: 'Invalid application decision action.' });
    }
    if (action !== 'add_internal_note' && (reason.length < 4 || reason.length > 600)) {
      return sendJson(400, { error: 'A clear reason (4–600 characters) is required for this decision.' });
    }
    if (action === 'add_internal_note' && (internalNote.length < 2 || internalNote.length > 1800)) {
      return sendJson(400, { error: 'Internal note must be between 2 and 1800 characters.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const isTop = verified.actorRole === 'top';
      if (['approve', 'reject', 'suspend'].includes(action) && !isTop) {
        return {
          status: 403,
          body: {
            error: 'Admin: Top authorization is required for final vendor approval, rejection, or suspension. Admin: Mod may request corrections or record a recommendation.',
            code: 'TOP_APPROVAL_REQUIRED'
          }
        };
      }

      const { rows } = await tx.query('SELECT * FROM vendor_applications WHERE id = $1 FOR UPDATE', [appId]);
      if (!rows.length) return { status: 404, body: { error: 'Application not found.' } };
      const app = rows[0];

      if (expectedStatus && app.status !== expectedStatus) {
        return {
          status: 409,
          body: {
            error: `Application state changed concurrently (currently "${app.status}", expected "${expectedStatus}"). Refresh before deciding.`,
            code: 'STALE_APPLICATION_STATE'
          }
        };
      }
      if (expectedUpdatedAt && app.updated_at) {
        const expMs = new Date(expectedUpdatedAt).getTime();
        const curMs = new Date(app.updated_at).getTime();
        if (Number.isFinite(expMs) && Number.isFinite(curMs) && Math.abs(expMs - curMs) > 5) {
          return {
            status: 409,
            body: {
              error: 'Application was modified concurrently by another actor. Refresh and review the latest state.',
              code: 'STALE_APPLICATION_STATE'
            }
          };
        }
      }

      if (app.applicant_user_id === ctx.user.id && action !== 'add_internal_note') {
        return {
          status: 403,
          body: { error: 'Administrators cannot recommend or decide their own vendor application.', code: 'SELF_DECISION_FORBIDDEN' }
        };
      }

      if (action === 'add_internal_note') {
        const stamped = `[${new Date().toISOString()} · ${ctx.user.email || ctx.user.id} (${verified.actorRole.toUpperCase()})] ${internalNote}`;
        const combined = app.internal_notes ? `${app.internal_notes}\n${stamped}`.slice(-2000) : stamped.slice(0, 2000);
        const { rows: u } = await tx.query(
          'UPDATE vendor_applications SET internal_notes = $2, updated_at = now() WHERE id = $1 RETURNING *',
          [appId, combined]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId: app.target_vendor_id || app.approved_vendor_id || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.internal_note'
        });
        return { status: 200, body: { application: u[0] } };
      }

      if (action === 'request_info') {
        if (!['submitted', 'needs_info'].includes(app.status)) {
          return { status: 409, body: { error: `Cannot request info on an application in "${app.status}" status.` } };
        }
        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET status = 'needs_info',
               applicant_feedback = $2,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, reason]
        );
        await recordTestSafeNotificationInTx(tx, {
          recipientUserId: app.applicant_user_id,
          recipientEmail: app.applicant_email,
          eventKind: 'vendor_application.needs_info',
          subject: 'BiteShark Vendor Application — Additional Information Needed',
          summary: reason
        });
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId: app.target_vendor_id || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.request_info'
        });
        return { status: 200, body: { application: u[0] } };
      }

      if (action === 'recommend_approve' || action === 'recommend_reject') {
        if (app.status !== 'submitted') {
          return { status: 409, body: { error: 'Recommendations can only be recorded on submitted applications.' } };
        }
        const recVal = action === 'recommend_approve' ? 'recommend_approve' : 'recommend_reject';
        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET mod_recommendation = $2,
               mod_recommended_by = $3,
               mod_recommended_at = now(),
               mod_recommendation_reason = $4,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, recVal, ctx.user.id, reason]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId: app.target_vendor_id || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: `vendor_application.${action}`,
          metadata: { recommendation: recVal }
        });
        return { status: 200, body: { application: u[0] } };
      }

      if (action === 'reject') {
        if (!['submitted', 'needs_info'].includes(app.status)) {
          return { status: 409, body: { error: `Application is already "${app.status}".` } };
        }
        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET status = 'rejected',
               decided_by = $2,
               decided_role = 'top',
               decided_at = now(),
               decision_reason = $3,
               applicant_feedback = $3,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, ctx.user.id, reason]
        );
        await recordTestSafeNotificationInTx(tx, {
          recipientUserId: app.applicant_user_id,
          recipientEmail: app.applicant_email,
          eventKind: 'vendor_application.rejected',
          subject: 'BiteShark Vendor Application Decision',
          summary: reason
        });
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'top',
          vendorId: app.target_vendor_id || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.reject'
        });
        return { status: 200, body: { application: u[0] } };
      }

      if (action === 'approve') {
        if (app.status !== 'submitted') {
          return { status: 409, body: { error: `Only "submitted" applications can be approved (currently "${app.status}").` } };
        }

        let resolvedVendorId = app.target_vendor_id;
        if (app.claim_type === 'existing_listing') {
          const { rows: vRows } = await tx.query('SELECT * FROM vendors WHERE id = $1 FOR UPDATE', [resolvedVendorId]);
          if (!vRows.length) return { status: 400, body: { error: 'Target vendor listing no longer exists.' } };
          const { rows: existingOwners } = await tx.query(
            "SELECT user_id FROM vendor_memberships WHERE vendor_id = $1 AND role = 'owner' FOR UPDATE",
            [resolvedVendorId]
          );
          if (existingOwners.some(o => o.user_id !== app.applicant_user_id)) {
            return {
              status: 409,
              body: {
                error:
                  'Ownership conflict: this listing already has an active approved Vendor Owner. Resolve or revoke existing ownership before approving a competing claim.',
                code: 'OWNERSHIP_CONFLICT_ALREADY_CLAIMED'
              }
            };
          }
          await tx.query(
            `UPDATE vendors
             SET ownership_status = 'approved_owner',
                 updated_at = now()
             WHERE id = $1`,
            [resolvedVendorId]
          );
        } else {
          resolvedVendorId = app.proposed_slug;
          const { rows: slugCollision } = await tx.query('SELECT id FROM vendors WHERE id = $1 FOR UPDATE', [
            resolvedVendorId
          ]);
          if (slugCollision.length) {
            return {
              status: 409,
              body: {
                error: `Vendor slug "${resolvedVendorId}" already exists in the catalog.`,
                code: 'VENDOR_SLUG_CONFLICT'
              }
            };
          }
          // Create new vendor listing with conservative defaults: `verified = false`, `photo_rights_verified = false`
          await tx.query(
            `INSERT INTO vendors (
               id, canonical_name, city, cuisine, listing_kind, event_bookable, is_active,
               ownership_status, verified, verification_status, photo_rights_verified,
               curated_location, curated_location_source, curated_location_accuracy, blurb
             )
             VALUES ($1, $2, $3, $4, $5, $6, true, 'approved_owner', false, 'needs_review', false,
                     $7, 'curated_illustrative', 'illustrative_pin', $8)`,
            [
              resolvedVendorId,
              app.business_name,
              app.city,
              app.cuisine,
              app.listing_kind,
              app.listing_kind === 'food_truck' || app.listing_kind === 'venue',
              `${app.service_area}, ${app.city}`,
              `Local ${app.cuisine} vendor in ${app.city}. Confirm current hours and menu directly.`
            ]
          );
        }

        await tx.query("SELECT set_config('app.is_platform_admin', 'true', true)");
        await tx.query(
          `INSERT INTO vendor_memberships (vendor_id, user_id, role, granted_by)
           VALUES ($1, $2, 'owner', $3)
           ON CONFLICT (vendor_id, user_id) DO UPDATE SET role = 'owner', granted_by = EXCLUDED.granted_by`,
          [resolvedVendorId, app.applicant_user_id, ctx.user.id]
        );

        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET status = 'approved',
               approved_vendor_id = $2,
               decided_by = $3,
               decided_role = 'top',
               decided_at = now(),
               decision_reason = $4,
               applicant_feedback = $4,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, resolvedVendorId, ctx.user.id, reason]
        );

        await tx.query(
          `INSERT INTO vendor_status_history (vendor_id, actor_id, actor_role, action, reason, before_state, after_state)
           VALUES ($1, $2, 'top', 'vendor.ownership_approved', $3, $4::jsonb, $5::jsonb)`,
          [
            resolvedVendorId,
            ctx.user.id,
            reason,
            JSON.stringify({ application_id: appId, claim_type: app.claim_type }),
            JSON.stringify({ approved_owner_user_id: app.applicant_user_id, verified: false })
          ]
        );

        await recordTestSafeNotificationInTx(tx, {
          recipientUserId: app.applicant_user_id,
          recipientEmail: app.applicant_email,
          eventKind: 'vendor_application.approved',
          subject: 'BiteShark Vendor Ownership Approved',
          summary: `Approved to manage listing "${app.business_name}" (${resolvedVendorId}).`
        });

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'top',
          vendorId: resolvedVendorId,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.approve',
          metadata: { applicant_user_id: app.applicant_user_id, claim_type: app.claim_type }
        });

        return { status: 200, body: { application: u[0], approved_vendor_id: resolvedVendorId } };
      }

      if (action === 'suspend') {
        if (app.status !== 'approved') {
          return { status: 409, body: { error: 'Only approved applications can be suspended.' } };
        }
        const vid = app.approved_vendor_id || app.target_vendor_id;
        if (vid) {
          await tx.query(
            `UPDATE vendors
             SET vendor_access_suspended = true,
                 ownership_status = 'suspended',
                 restriction_reason = $2,
                 restricted_by = $3,
                 restriction_authority = 'top',
                 restricted_at = now(),
                 updated_at = now()
             WHERE id = $1`,
            [vid, reason, ctx.user.id]
          );
        }
        const { rows: u } = await tx.query(
          `UPDATE vendor_applications
           SET status = 'suspended',
               decided_by = $2,
               decided_role = 'top',
               decided_at = now(),
               decision_reason = $3,
               applicant_feedback = $3,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [appId, ctx.user.id, reason]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'top',
          vendorId: vid || null,
          targetType: 'vendor_application',
          targetId: appId,
          action: 'vendor_application.suspend'
        });
        return { status: 200, body: { application: u[0] } };
      }
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6D. Vendor Directory Governance & Granular Restrictions (`/api/admin/vendors*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/vendors') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 25, 60);
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
    const townFilter = typeof query.town === 'string' ? query.town.trim() : '';
    const ownerFilter = typeof query.ownership === 'string' ? query.ownership.trim() : '';
    const verifFilter = typeof (query.verification || query.verified) === 'string' ? String(query.verification || query.verified).trim() : '';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ["v.id NOT LIKE 'estrella%'", "v.id <> 'owner-truck'"];
      const params = [];

      if (statusFilter === 'active') {
        conds.push(
          'v.is_active = true AND v.hidden_from_discovery = false AND v.vendor_access_suspended = false AND v.bookings_restricted = false AND v.pager_restricted = false'
        );
      } else if (statusFilter === 'restricted') {
        conds.push(
          '(v.is_active = false OR v.hidden_from_discovery = true OR v.vendor_access_suspended = true OR v.bookings_restricted = true OR v.pager_restricted = true)'
        );
      } else if (statusFilter === 'suspended' || statusFilter === 'access_suspended') {
        conds.push('v.vendor_access_suspended = true');
      } else if (statusFilter === 'hidden') conds.push('v.hidden_from_discovery = true');
      else if (statusFilter === 'bookings_restricted') conds.push('v.bookings_restricted = true');
      else if (statusFilter === 'pager_restricted') conds.push('v.pager_restricted = true');
      else if (statusFilter === 'needs_correction') conds.push('v.needs_info_correction = true');
      else if (statusFilter === 'inactive') conds.push('v.is_active = false');

      if (townFilter && townFilter !== 'all') {
        params.push(townFilter);
        conds.push(`v.city ILIKE $${params.length}`);
      }
      if (ownerFilter && ownerFilter !== 'all') {
        params.push(ownerFilter);
        conds.push(`v.ownership_status = $${params.length}`);
      }
      if (verifFilter === 'verified') conds.push('v.verified = true');
      else if (verifFilter === 'needs_review' || verifFilter === 'unverified') conds.push('v.verified = false');
      else if (verifFilter === 'photo_rights') conds.push('v.photo_rights_verified = true');

      if (qText) {
        params.push(qText);
        conds.push(
          `(v.id ILIKE $${params.length} OR v.canonical_name ILIKE $${params.length} OR COALESCE(op.display_name, '') ILIKE $${params.length} OR v.city ILIKE $${params.length})`
        );
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(
        `SELECT count(*)::int AS total
         FROM vendors v
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         WHERE ${whereSql}`,
        params
      );

      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           v.id, v.canonical_name, v.city, v.cuisine, v.listing_kind, v.event_bookable, v.is_active,
           v.ownership_status, v.verified, v.verification_status, v.photo_rights_verified,
           v.hidden_from_discovery, v.bookings_restricted, v.vendor_access_suspended,
           v.pager_restricted, v.needs_info_correction, v.correction_note, v.restriction_reason,
           v.restricted_by, v.restriction_authority, v.restricted_at, v.temp_restriction_expires_at,
           v.updated_at,
           op.display_name, op.description, op.accepting_bookings AS owner_accepting_bookings,
           (
             SELECT count(*)::int FROM bookings b
             WHERE b.truck_id = v.id AND b.status IN ('pending', 'accepted')
           ) AS open_bookings_count,
           (
             SELECT count(*)::int FROM pickup_pagers p
             WHERE p.vendor_id = v.id AND p.expires_at > now() AND p.status NOT IN ('collected', 'cancelled')
           ) AS active_pagers_count,
           COALESCE(
             (
               SELECT json_agg(json_build_object('user_id', vm.user_id, 'role', vm.role, 'email', au.email_normalized))
               FROM vendor_memberships vm
               LEFT JOIN auth_users au ON au.id = vm.user_id
               WHERE vm.vendor_id = v.id
             ),
             '[]'::json
           ) AS members
         FROM vendors v
         LEFT JOIN owner_profiles op ON op.truck_id = v.id
         WHERE ${whereSql}
         ORDER BY v.sort_order ASC NULLS LAST, v.id ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const historyVendorId = typeof query.history_vendor_id === 'string' ? query.history_vendor_id.trim() : '';
      let history = [];
      if (historyVendorId) {
        const hr = await tx.query(
          `SELECT id, vendor_id, actor_id, actor_role, action, reason, before_state, after_state, created_at
           FROM vendor_status_history
           WHERE vendor_id = $1
           ORDER BY created_at DESC
           LIMIT 25`,
          [historyVendorId]
        );
        history = hr.rows;
      }

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        vendors: rows.map(r => ({
          ...r,
          display_name: r.display_name || r.canonical_name,
          town: r.city,
          category: r.listing_kind,
          verified_status: r.verified,
          photo_rights_confirmed: r.photo_rights_verified,
          effective_restrictions: evaluateEffectiveVendorRestrictions(r)
        })),
        selected_vendor_history: history
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/vendors/update') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const vendorId = typeof body.vendor_id === 'string' ? body.vendor_id.trim() : '';
    const action = typeof (body.action || body.operation) === 'string' ? String(body.action || body.operation).trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!vendorId || vendorId.length > 80) return sendJson(400, { error: 'vendor_id is required.' });
    if (reason.length < 4 || reason.length > 600) {
      return sendJson(400, { error: 'A clear audit reason (4–600 characters) is required for vendor changes.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const isTop = verified.actorRole === 'top';
      const { rows } = await tx.query('SELECT * FROM vendors WHERE id = $1 FOR UPDATE', [vendorId]);
      if (!rows.length) return { status: 404, body: { error: 'Vendor not found.' } };
      const cur = rows[0];

      const beforeSnap = {
        is_active: cur.is_active,
        event_bookable: cur.event_bookable,
        verified: cur.verified,
        photo_rights_verified: cur.photo_rights_verified,
        hidden_from_discovery: cur.hidden_from_discovery,
        bookings_restricted: cur.bookings_restricted,
        vendor_access_suspended: cur.vendor_access_suspended,
        pager_restricted: cur.pager_restricted,
        needs_info_correction: cur.needs_info_correction
      };

      // Admin: Mod is strictly limited to temporary safety restrictions (<= 72h) & correction flags
      if (!isTop) {
        if (action !== 'mod_temp_restriction') {
          return {
            status: 403,
            body: {
              error:
                'Admin: Mod may apply only temporary safety restrictions (up to 72h) or listing correction flags. Permanent suspension, profile edits, and verification require Admin: Top.',
              code: 'TOP_REQUIRED_FOR_VENDOR_ACTION'
            }
          };
        }
        if (
          cur.restriction_authority === 'top' &&
          (cur.vendor_access_suspended || cur.hidden_from_discovery || cur.bookings_restricted || cur.pager_restricted)
        ) {
          return {
            status: 403,
            body: { error: 'Admin: Mod cannot override an active Admin: Top vendor restriction.' }
          };
        }
        if (body.vendor_access_suspended !== undefined || body.is_active !== undefined || body.verified !== undefined) {
          return {
            status: 403,
            body: { error: 'Admin: Mod cannot suspend vendor account access or modify verification flags.' }
          };
        }

        const durationHours = Math.max(
          1,
          Math.min(MAX_MOD_TEMP_RESTRICTION_HOURS, Number(body.duration_hours) || 24)
        );
        const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
        const nextHidden = body.hidden_from_discovery === true;
        const nextBookingsRestr = body.bookings_restricted === true;
        const nextPagerRestr = body.pager_restricted === true;
        const nextNeedsCorr = body.needs_info_correction === true;
        const corrNote =
          typeof body.correction_note === 'string' && body.correction_note.trim()
            ? body.correction_note.trim().slice(0, 500)
            : null;

        const { rows: u } = await tx.query(
          `UPDATE vendors
           SET hidden_from_discovery = $2,
               bookings_restricted = $3,
               pager_restricted = $4,
               needs_info_correction = $5,
               correction_note = $6,
               restriction_reason = $7,
               restricted_by = $8,
               restriction_authority = 'mod',
               restricted_at = now(),
               temp_restriction_expires_at = $9,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            vendorId,
            nextHidden,
            nextBookingsRestr,
            nextPagerRestr,
            nextNeedsCorr,
            corrNote,
            reason,
            ctx.user.id,
            nextHidden || nextBookingsRestr || nextPagerRestr ? expiresAt : null
          ]
        );

        await tx.query(
          `INSERT INTO vendor_status_history (vendor_id, actor_id, actor_role, action, reason, before_state, after_state)
           VALUES ($1, $2, 'mod', 'vendor.mod_temp_restriction', $3, $4::jsonb, $5::jsonb)`,
          [
            vendorId,
            ctx.user.id,
            reason,
            JSON.stringify(beforeSnap),
            JSON.stringify({
              hidden_from_discovery: nextHidden,
              bookings_restricted: nextBookingsRestr,
              pager_restricted: nextPagerRestr,
              needs_info_correction: nextNeedsCorr,
              temp_restriction_expires_at: expiresAt
            })
          ]
        );

        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'mod',
          vendorId,
          targetType: 'vendor',
          targetId: vendorId,
          action: 'vendor.mod_temp_restriction',
          metadata: { duration_hours: durationHours }
        });

        return { status: 200, body: { vendor: u[0] } };
      }

      // Admin: Top comprehensive governance & profile update (supports flat or nested profile/eligibility/restrictions)
      const profObj = body.profile && typeof body.profile === 'object' ? body.profile : {};
      const eligObj = body.eligibility && typeof body.eligibility === 'object' ? body.eligibility : {};
      const restrObj = body.restrictions && typeof body.restrictions === 'object' ? body.restrictions : {};
      const clearAll = restrObj.clear_restrictions === true || body.clear_restrictions === true;

      const pickBool = (a, b, fallback) => (typeof a === 'boolean' ? a : typeof b === 'boolean' ? b : fallback);

      const nextIsActive = pickBool(body.is_active, eligObj.is_active, cur.is_active);
      const nextBookable = pickBool(
        body.event_bookable,
        eligObj.booking_enabled ?? eligObj.event_bookable,
        cur.event_bookable
      );
      const nextVerified = pickBool(body.verified, eligObj.verified_status ?? eligObj.verified, cur.verified);
      const nextPhotoRights = pickBool(
        body.photo_rights_verified,
        eligObj.photo_rights_confirmed ?? eligObj.photo_rights_verified,
        cur.photo_rights_verified
      );
      const nextHidden = clearAll ? false : pickBool(body.hidden_from_discovery, restrObj.hidden_from_discovery, cur.hidden_from_discovery);
      const nextBookingsRestr = clearAll ? false : pickBool(body.bookings_restricted, restrObj.bookings_restricted, cur.bookings_restricted);
      const nextAccessSusp = clearAll ? false : pickBool(body.vendor_access_suspended, restrObj.vendor_access_suspended, cur.vendor_access_suspended);
      const nextPagerRestr = clearAll ? false : pickBool(body.pager_restricted, restrObj.pager_restricted, cur.pager_restricted);
      const nextNeedsCorr = clearAll ? false : pickBool(body.needs_info_correction, restrObj.needs_info_correction, cur.needs_info_correction);
      const rawCorrIn = body.correction_note !== undefined ? body.correction_note : restrObj.correction_note;
      const corrNote = clearAll
        ? null
        : rawCorrIn !== undefined
          ? rawCorrIn
            ? String(rawCorrIn).trim().slice(0, 500)
            : null
          : cur.correction_note;

      const anyRestriction =
        !nextIsActive || nextHidden || nextBookingsRestr || nextAccessSusp || nextPagerRestr || nextNeedsCorr;

      const { rows: u } = await tx.query(
        `UPDATE vendors
         SET is_active = $2,
             event_bookable = $3,
             verified = $4,
             verification_status = CASE WHEN $4 = true THEN 'business_confirmed' ELSE 'needs_review' END,
             photo_rights_verified = $5,
             hidden_from_discovery = $6,
             bookings_restricted = $7,
             vendor_access_suspended = $8,
             pager_restricted = $9,
             needs_info_correction = $10,
             correction_note = $11,
             restriction_reason = CASE WHEN $12 = true THEN $13 ELSE NULL END,
             restricted_by = CASE WHEN $12 = true THEN $14 ELSE NULL END,
             restriction_authority = CASE WHEN $12 = true THEN 'top' ELSE NULL END,
             restricted_at = CASE WHEN $12 = true THEN now() ELSE NULL END,
             temp_restriction_expires_at = NULL,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          vendorId,
          nextIsActive,
          nextBookable,
          nextVerified,
          nextPhotoRights,
          nextHidden,
          nextBookingsRestr,
          nextAccessSusp,
          nextPagerRestr,
          nextNeedsCorr,
          corrNote,
          anyRestriction,
          reason,
          ctx.user.id
        ]
      );

      const inDispName = body.display_name ?? profObj.display_name;
      const inDesc = body.description ?? profObj.summary ?? profObj.description;
      const inCuisine = body.cuisine ?? profObj.cuisine;
      const inAccepting = eligObj.accepting_bookings;
      if (inDispName !== undefined || inDesc !== undefined || inCuisine !== undefined || typeof inAccepting === 'boolean') {
        const dName =
          typeof inDispName === 'string' && inDispName.trim().length >= 2
            ? inDispName.trim().slice(0, 120)
            : cur.canonical_name;
        const dDesc =
          typeof inDesc === 'string' && inDesc.trim()
            ? inDesc.trim().slice(0, 500)
            : null;
        const dCuis =
          typeof inCuisine === 'string' && inCuisine.trim()
            ? inCuisine.trim().slice(0, 60)
            : cur.cuisine;
        await tx.query(
          `INSERT INTO owner_profiles (truck_id, display_name, description, cuisine, accepting_bookings, updated_at)
           VALUES ($1, $2, $3, $4, COALESCE($5::boolean, true), now())
           ON CONFLICT (truck_id) DO UPDATE
             SET display_name = EXCLUDED.display_name,
                 description = COALESCE(EXCLUDED.description, owner_profiles.description),
                 cuisine = EXCLUDED.cuisine,
                 accepting_bookings = COALESCE($5::boolean, owner_profiles.accepting_bookings),
                 updated_at = now()`,
          [vendorId, dName, dDesc, dCuis, typeof inAccepting === 'boolean' ? inAccepting : null]
        );
      }

      // Notify vendor owners via test-safe outbox when restrictions change
      const { rows: owners } = await tx.query(
        `SELECT vm.user_id, au.email_normalized
         FROM vendor_memberships vm
         LEFT JOIN auth_users au ON au.id = vm.user_id
         WHERE vm.vendor_id = $1 AND vm.role = 'owner'`,
        [vendorId]
      );
      for (const o of owners) {
        await recordTestSafeNotificationInTx(tx, {
          recipientUserId: o.user_id,
          recipientEmail: o.email_normalized,
          eventKind: 'vendor.governance_updated',
          subject: `BiteShark Listing Status Updated (${cur.canonical_name})`,
          summary: reason
        });
      }

      const afterSnap = {
        is_active: u[0].is_active,
        event_bookable: u[0].event_bookable,
        verified: u[0].verified,
        photo_rights_verified: u[0].photo_rights_verified,
        hidden_from_discovery: u[0].hidden_from_discovery,
        bookings_restricted: u[0].bookings_restricted,
        vendor_access_suspended: u[0].vendor_access_suspended,
        pager_restricted: u[0].pager_restricted,
        needs_info_correction: u[0].needs_info_correction
      };

      await tx.query(
        `INSERT INTO vendor_status_history (vendor_id, actor_id, actor_role, action, reason, before_state, after_state)
         VALUES ($1, $2, 'top', $3, $4, $5::jsonb, $6::jsonb)`,
        [vendorId, ctx.user.id, action || 'vendor.admin_update', reason, JSON.stringify(beforeSnap), JSON.stringify(afterSnap)]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        vendorId,
        targetType: 'vendor',
        targetId: vendorId,
        action: action || 'vendor.admin_update',
        metadata: afterSnap
      });

      return { status: 200, body: { vendor: u[0] } };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6E. Accounts, Role Management & Privileged Invitations (`/api/admin/accounts*`, `/api/admin/invitations*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/accounts') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const roleFilter = typeof query.role === 'string' ? query.role.trim() : '';
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ['1=1'];
      const params = [];
      if (roleFilter === 'top') conds.push("pr.role IN ('top', 'platform_admin')");
      else if (roleFilter === 'mod') conds.push("pr.role IN ('mod', 'moderator')");
      else if (roleFilter === 'vendor' || roleFilter === 'vendor_owner' || roleFilter === 'vendor_staff') {
        if (roleFilter === 'vendor') {
          conds.push('EXISTS (SELECT 1 FROM vendor_memberships vm WHERE vm.user_id = au.id)');
        } else {
          const mRole = roleFilter === 'vendor_owner' ? 'owner' : 'staff';
          params.push(mRole);
          conds.push(`EXISTS (SELECT 1 FROM vendor_memberships vm WHERE vm.user_id = au.id AND vm.role = $${params.length})`);
        }
      } else if (roleFilter === 'suspended') {
        conds.push('au.disabled_at IS NOT NULL');
      }
      if (statusFilter === 'suspended') conds.push('au.disabled_at IS NOT NULL');
      else if (statusFilter === 'active') conds.push('au.disabled_at IS NULL');

      if (qText) {
        params.push(qText);
        conds.push(`(au.email_normalized ILIKE $${params.length} OR au.id ILIKE $${params.length})`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(
        `SELECT count(*)::int AS total
         FROM auth_users au
         LEFT JOIN platform_roles pr ON pr.user_id = au.id
         WHERE ${whereSql}`,
        params
      );

      params.push(pageSize, offset);
      // Strictly project ONLY safe identity & role fields — NEVER secrets, hashes, tokens, or IP digests
      const { rows } = await tx.query(
        `SELECT
           au.id,
           au.email_normalized,
           au.disabled_at IS NOT NULL AS is_disabled,
           au.disabled_at,
           au.last_login_at,
           au.created_at,
           pr.role AS raw_platform_role,
           COALESCE(
             (
               SELECT json_agg(json_build_object('vendor_id', vm.vendor_id, 'role', vm.role))
               FROM vendor_memberships vm
               WHERE vm.user_id = au.id
             ),
             '[]'::json
           ) AS vendor_memberships
         FROM auth_users au
         LEFT JOIN platform_roles pr ON pr.user_id = au.id
         WHERE ${whereSql}
         ORDER BY
           CASE WHEN pr.role IN ('top', 'platform_admin') THEN 0 WHEN pr.role IN ('mod', 'moderator') THEN 1 ELSE 2 END ASC,
           au.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        can_manage_roles: verified.actorRole === 'top',
        accounts: rows.map(r => {
          const lvl = normalizeAdminLevel(r.raw_platform_role);
          const labels = [ROLE_LABELS.customer];
          if (Array.isArray(r.vendor_memberships)) {
            if (r.vendor_memberships.some(m => m.role === 'owner')) labels.push(ROLE_LABELS.owner);
            if (r.vendor_memberships.some(m => m.role === 'staff')) labels.push(ROLE_LABELS.staff);
          }
          if (lvl === 'mod') labels.push(ROLE_LABELS.mod);
          if (lvl === 'top') labels.push(ROLE_LABELS.top);
          return {
            id: r.id,
            // Mods see masked customer emails unless viewing admin/vendor members or exact lookup; Top sees full email
            email: verified.actorRole === 'top' || lvl || (r.vendor_memberships || []).length > 0
              ? r.email_normalized
              : maskEmail(r.email_normalized),
            account_status: r.is_disabled ? 'suspended' : 'active',
            is_disabled: r.is_disabled,
            disabled_at: r.disabled_at,
            last_login_at: r.last_login_at,
            created_at: r.created_at,
            updated_at: r.created_at,
            admin_level: lvl,
            admin_label: lvl ? ROLE_LABELS[lvl] : null,
            platform_role: lvl,
            platform_role_label: lvl ? ROLE_LABELS[lvl] : null,
            role_labels: labels,
            vendor_memberships: r.vendor_memberships
          };
        })
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/accounts/role') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const nextRole = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const expectedRole = body.expected_role !== undefined ? (body.expected_role ? String(body.expected_role).toLowerCase() : null) : undefined;

    if (!targetUserId || !['none', 'mod', 'top'].includes(nextRole) || reason.length < 4 || reason.length > 500) {
      return sendJson(400, { error: 'Valid user_id, role ("none" | "mod" | "top"), and reason (4–500 chars) are required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) return { status: verifiedTop.status, body: { error: verifiedTop.error } };
      await enableAdminTxGuards(tx, ctx);

      if (targetUserId === ctx.user.id) {
        return {
          status: 403,
          body: { error: 'Administrators cannot modify their own platform role.', code: 'SELF_ROLE_CHANGE_FORBIDDEN' }
        };
      }

      const { rows: userRows } = await tx.query('SELECT id, email_normalized, disabled_at FROM auth_users WHERE id = $1 FOR UPDATE', [
        targetUserId
      ]);
      if (!userRows.length) return { status: 404, body: { error: 'Target account not found.' } };

      // Lock ALL `platform_roles` rows so concurrent Top demotions strictly serialize
      const { rows: allRoleRows } = await tx.query(
        `SELECT pr.user_id, pr.role, au.disabled_at
         FROM platform_roles pr
         LEFT JOIN auth_users au ON au.id = pr.user_id
         FOR UPDATE OF pr`
      );
      const curRow = allRoleRows.find(r => r.user_id === targetUserId);
      const curLevel = normalizeAdminLevel(curRow?.role || null);

      if (expectedRole !== undefined && curLevel !== expectedRole) {
        return {
          status: 409,
          body: {
            error: `Account role changed concurrently (currently "${curLevel || 'none'}"). Refresh and retry.`,
            code: 'STALE_ROLE_STATE'
          }
        };
      }

      if (curLevel === 'top' && nextRole !== 'top') {
        const otherActiveTops = allRoleRows.filter(
          r => r.user_id !== targetUserId && normalizeAdminLevel(r.role) === 'top' && !r.disabled_at
        );
        if (otherActiveTops.length < 1) {
          return {
            status: 409,
            body: {
              error: 'Cannot remove or demote the last active Admin: Top account.',
              code: 'LAST_TOP_ADMIN_PROTECTED'
            }
          };
        }
      }

      if (nextRole === 'none') {
        await tx.query('DELETE FROM platform_roles WHERE user_id = $1', [targetUserId]);
        await tx.query(
          `INSERT INTO platform_role_revocations (user_id, revoked_by, reason, revoked_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (user_id) DO UPDATE
             SET revoked_by = EXCLUDED.revoked_by, reason = EXCLUDED.reason, revoked_at = now()`,
          [targetUserId, ctx.user.id, reason]
        );
      } else {
        await tx.query(
          `INSERT INTO platform_roles (user_id, role, granted_by, notes, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (user_id) DO UPDATE
             SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, notes = EXCLUDED.notes, updated_at = now()`,
          [targetUserId, nextRole, ctx.user.id, reason]
        );
        if (nextRole === 'top') {
          await tx.query('DELETE FROM platform_role_revocations WHERE user_id = $1', [targetUserId]);
        } else {
          // Demoting to `mod` also suppresses any static `PLATFORM_ADMIN_IDS` env override
          await tx.query(
            `INSERT INTO platform_role_revocations (user_id, revoked_by, reason, revoked_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id) DO UPDATE
               SET revoked_by = EXCLUDED.revoked_by, reason = EXCLUDED.reason, revoked_at = now()`,
            [targetUserId, ctx.user.id, reason]
          );
        }
      }

      // Immediately revoke active sessions so role transitions take effect cleanly without stale cookie expectations
      await tx.query(
        'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [targetUserId]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'platform_role',
        targetId: targetUserId,
        action: `account.role_${nextRole}`,
        metadata: { from_role: curLevel || 'none', to_role: nextRole, reason }
      });

      return {
        status: 200,
        body: {
          ok: true,
          user_id: targetUserId,
          admin_level: nextRole === 'none' ? null : nextRole,
          admin_label: nextRole === 'none' ? null : ROLE_LABELS[nextRole]
        }
      };
    });

    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/admin/accounts/status') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const rawStatusOrAction = typeof (body.action || body.account_status) === 'string' ? String(body.action || body.account_status).trim() : '';
    const action = rawStatusOrAction === 'suspended' ? 'suspend' : rawStatusOrAction === 'active' ? 'reactivate' : rawStatusOrAction;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!targetUserId || !['suspend', 'reactivate'].includes(action) || reason.length < 4 || reason.length > 500) {
      return sendJson(400, { error: 'Valid user_id, action ("suspend" | "reactivate"), and reason (4–500 chars) are required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verifiedTop = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verifiedTop.ok) return { status: verifiedTop.status, body: { error: verifiedTop.error } };
      await enableAdminTxGuards(tx, ctx);

      if (targetUserId === ctx.user.id) {
        return { status: 403, body: { error: 'Administrators cannot suspend their own account.' } };
      }

      const { rows: targetRows } = await tx.query('SELECT id, disabled_at FROM auth_users WHERE id = $1 FOR UPDATE', [
        targetUserId
      ]);
      if (!targetRows.length) return { status: 404, body: { error: 'Account not found.' } };

      if (action === 'suspend') {
        const { rows: allTops } = await tx.query(
          `SELECT pr.user_id, au.disabled_at
           FROM platform_roles pr
           JOIN auth_users au ON au.id = pr.user_id
           WHERE pr.role IN ('top', 'platform_admin')
           FOR UPDATE OF pr, au`
        );
        const targetIsTop = allTops.some(r => r.user_id === targetUserId);
        if (targetIsTop) {
          const remainingActiveTops = allTops.filter(r => r.user_id !== targetUserId && !r.disabled_at);
          if (remainingActiveTops.length < 1) {
            return {
              status: 409,
              body: {
                error: 'Cannot suspend the last active Admin: Top account.',
                code: 'LAST_TOP_ADMIN_PROTECTED'
              }
            };
          }
        }

        await tx.query('UPDATE auth_users SET disabled_at = now(), updated_at = now() WHERE id = $1', [targetUserId]);
        await tx.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
          targetUserId
        ]);
      } else {
        await tx.query('UPDATE auth_users SET disabled_at = NULL, updated_at = now() WHERE id = $1', [targetUserId]);
      }

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'auth_user',
        targetId: targetUserId,
        action: `account.${action}`,
        metadata: { reason }
      });

      return { status: 200, body: { ok: true, user_id: targetUserId, is_disabled: action === 'suspend' } };
    });

    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/admin/invitations') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
    const roleFilter = typeof (query.requested_role || query.role) === 'string' ? String(query.requested_role || query.role).trim() : '';

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ['1=1'];
      const params = [];
      if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        conds.push(`status = $${params.length}`);
      }
      if (roleFilter && roleFilter !== 'all') {
        params.push(roleFilter);
        conds.push(`requested_role = $${params.length}`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM account_invitations WHERE ${whereSql}`, params);
      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           id, email_normalized, requested_role, vendor_id, status,
           initiated_by, initiator_role, approved_by, approved_at, approval_reason,
           rejected_by, rejected_at, rejection_reason, consumed_by_user_id, consumed_at,
           invite_note, expires_at, created_at, updated_at
         FROM account_invitations
         WHERE ${whereSql}
         ORDER BY
           CASE status WHEN 'pending_top_approval' THEN 0 WHEN 'issued' THEN 1 ELSE 2 END ASC,
           created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        invitations: rows.map(r => ({
          ...r,
          email: r.email_normalized,
          note: r.invite_note,
          role_label: INVITATION_ROLE_LABELS[r.requested_role] || r.requested_role,
          requested_role_label: INVITATION_ROLE_LABELS[r.requested_role] || r.requested_role
        }))
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/invitations/create') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const emailNorm = normalizeEmailStrict(body.email);
    const requestedRole = typeof body.requested_role === 'string' ? body.requested_role.trim() : '';
    const vendorId = typeof body.vendor_id === 'string' && body.vendor_id.trim() ? body.vendor_id.trim() : null;
    const inviteNote = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    const idem = normalizeOptionalIdempotencyKey(body.idempotency_key);

    if (!idem.ok) return sendJson(400, { error: idem.error });
    if (!emailNorm || !['customer', 'vendor_owner', 'vendor_staff', 'mod', 'top'].includes(requestedRole)) {
      return sendJson(400, {
        error: 'Valid email and requested_role ("customer" | "vendor_owner" | "vendor_staff" | "mod" | "top") are required.'
      });
    }
    if (requestedRole === 'vendor_staff' && !vendorId) {
      return sendJson(400, { error: 'vendor_id is required when inviting Vendor Staff.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const rl = await consumeGovernanceRateLimit(tx, {
        scope: 'admin_invite_create',
        subjectKey: ctx.user.id,
        maxHits: 25,
        windowSeconds: 3600
      });
      if (!rl.allowed) return { status: 429, body: { error: 'Invitation rate limit reached.' } };

      const actorEmailNorm = normalizeEmailStrict(ctx.user.email || '');
      if (actorEmailNorm && actorEmailNorm === emailNorm && ['mod', 'top'].includes(requestedRole)) {
        return {
          status: 403,
          body: { error: 'Administrators cannot invite their own email address to a privileged role.', code: 'SELF_ELEVATION_FORBIDDEN' }
        };
      }

      if (vendorId) {
        const vr = await tx.query('SELECT id FROM vendors WHERE id = $1', [vendorId]);
        if (!vr.rows.length) return { status: 400, body: { error: 'Selected vendor_id was not found.' } };
      }

      const initiatorRole = verified.actorRole; // 'mod' | 'top'
      const requiresTopApproval = initiatorRole === 'mod' && (requestedRole === 'mod' || requestedRole === 'top');

      let rawToken = null;
      let tokenSha256 = null;
      let expiresAt = null;
      let initialStatus = 'pending_top_approval';
      let approvedBy = null;

      if (!requiresTopApproval) {
        const generated = generateOpaqueToken(32);
        rawToken = generated.rawToken;
        tokenSha256 = generated.tokenSha256;
        expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
        initialStatus = 'issued';
        if (initiatorRole === 'top') approvedBy = ctx.user.id;
      }

      const { rows } = await tx.query(
        `INSERT INTO account_invitations (
           email_normalized, requested_role, vendor_id, status, token_sha256,
           initiated_by, initiator_role, approved_by, approved_at,
           idempotency_key, invite_note, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 CASE WHEN $8::text IS NOT NULL THEN now() ELSE NULL END,
                 $9, $10, $11)
         ON CONFLICT (initiated_by, idempotency_key) WHERE idempotency_key IS NOT NULL
         DO NOTHING
         RETURNING id, email_normalized, requested_role, vendor_id, status, initiator_role, expires_at, created_at`,
        [
          emailNorm,
          requestedRole,
          vendorId,
          initialStatus,
          tokenSha256,
          ctx.user.id,
          initiatorRole,
          approvedBy,
          idem.value,
          inviteNote,
          expiresAt
        ]
      );

      if (!rows.length && idem.value) {
        const prev = await tx.query(
          `SELECT id, email_normalized, requested_role, vendor_id, status, initiator_role, expires_at, created_at
           FROM account_invitations
           WHERE initiated_by = $1 AND idempotency_key = $2`,
          [ctx.user.id, idem.value]
        );
        return { status: 200, body: { invitation: prev.rows[0], idempotent_replay: true } };
      }

      if (initialStatus === 'issued') {
        await recordTestSafeNotificationInTx(tx, {
          recipientEmail: emailNorm,
          eventKind: `invitation.issued_${requestedRole}`,
          subject: `BiteShark ${INVITATION_ROLE_LABELS[requestedRole]} Invitation`,
          summary: `Verify ownership of ${emailNorm} via 6-digit code to redeem single-use invitation.`
        });
      }

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: initiatorRole,
        vendorId,
        targetType: 'account_invitation',
        targetId: rows[0].id,
        action: requiresTopApproval ? 'invitation.initiate_pending_top' : 'invitation.issue',
        metadata: { requested_role: requestedRole, status: initialStatus }
      });

      return {
        status: 201,
        body: {
          invitation: {
            ...rows[0],
            email: rows[0].email_normalized,
            role_label: INVITATION_ROLE_LABELS[requestedRole],
            requested_role_label: INVITATION_ROLE_LABELS[requestedRole]
          },
          pending_top_approval: requiresTopApproval,
          requires_top_approval: requiresTopApproval,
          ...(rawToken ? { accept_path: `/#accept-invite=${rawToken}` } : {})
        }
      };
    });

    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/admin/invitations/decision') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const invId = typeof body.invitation_id === 'string' ? body.invitation_id.trim() : '';
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!UUID_RE.test(invId) || !['approve', 'reject', 'revoke'].includes(action)) {
      return sendJson(400, { error: 'Valid invitation_id and action ("approve" | "reject" | "revoke") are required.' });
    }
    if (reason.length < 3 || reason.length > 500) {
      return sendJson(400, { error: 'Reason (3–500 characters) is required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const isTop = verified.actorRole === 'top';
      if ((action === 'approve' || action === 'reject') && !isTop) {
        return {
          status: 403,
          body: { error: 'Only Admin: Top can approve or reject privileged invitations.', code: 'TOP_APPROVAL_REQUIRED' }
        };
      }

      const { rows } = await tx.query('SELECT * FROM account_invitations WHERE id = $1 FOR UPDATE', [invId]);
      if (!rows.length) return { status: 404, body: { error: 'Invitation not found.' } };
      const inv = rows[0];

      if (action === 'revoke') {
        if (!isTop && inv.initiated_by !== ctx.user.id) {
          return { status: 403, body: { error: 'Admin: Mod may revoke only invitations they initiated.' } };
        }
        if (!['pending_top_approval', 'issued'].includes(inv.status)) {
          return { status: 409, body: { error: `Invitation is already "${inv.status}".` } };
        }
        await tx.query(
          `UPDATE account_invitations
           SET status = 'revoked', revoked_by = $2, revoked_at = now(), token_sha256 = NULL, updated_at = now()
           WHERE id = $1`,
          [invId, ctx.user.id]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          targetType: 'account_invitation',
          targetId: invId,
          action: 'invitation.revoke',
          metadata: { reason }
        });
        return { status: 200, body: { ok: true, status: 'revoked' } };
      }

      if (inv.status !== 'pending_top_approval') {
        return { status: 409, body: { error: `Invitation is already "${inv.status}".` } };
      }

      const actorEmailNorm = normalizeEmailStrict(ctx.user.email || '');
      if (
        (inv.initiator_role === 'mod' && inv.initiated_by === ctx.user.id) ||
        (actorEmailNorm && inv.email_normalized === actorEmailNorm)
      ) {
        return {
          status: 403,
          body: { error: 'Administrators cannot approve their own elevation invitation.', code: 'SELF_ELEVATION_FORBIDDEN' }
        };
      }

      if (action === 'reject') {
        await tx.query(
          `UPDATE account_invitations
           SET status = 'rejected', rejected_by = $2, rejected_at = now(), rejection_reason = $3, updated_at = now()
           WHERE id = $1`,
          [invId, ctx.user.id, reason]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: 'top',
          targetType: 'account_invitation',
          targetId: invId,
          action: 'invitation.reject',
          metadata: { requested_role: inv.requested_role, reason }
        });
        return { status: 200, body: { ok: true, status: 'rejected' } };
      }

      // action === 'approve'
      const { rawToken, tokenSha256 } = generateOpaqueToken(32);
      const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
      const { rows: u } = await tx.query(
        `UPDATE account_invitations
         SET status = 'issued',
             token_sha256 = $2,
             approved_by = $3,
             approved_at = now(),
             approval_reason = $4,
             expires_at = $5,
             updated_at = now()
         WHERE id = $1
         RETURNING id, email_normalized, requested_role, status, approved_by, approved_at, expires_at`,
        [invId, tokenSha256, ctx.user.id, reason, expiresAt]
      );

      await recordTestSafeNotificationInTx(tx, {
        recipientEmail: inv.email_normalized,
        eventKind: `invitation.approved_${inv.requested_role}`,
        subject: `BiteShark ${INVITATION_ROLE_LABELS[inv.requested_role]} Invitation Approved`,
        summary: `Approved by Admin: Top. Verify ownership of ${inv.email_normalized} via 6-digit code to redeem.`
      });

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'account_invitation',
        targetId: invId,
        action: 'invitation.approve',
        metadata: { requested_role: inv.requested_role, initiated_by: inv.initiated_by, reason }
      });

      return {
        status: 200,
        body: {
          invitation: u[0],
          accept_path: `/#accept-invite=${rawToken}`
        }
      };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6F. Extended Community Moderation (`/api/admin/moderation*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/moderation') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const queue = typeof query.queue === 'string' ? query.queue.trim() : 'pending';
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
    const vendorFilter = typeof query.vendor_id === 'string' ? query.vendor_id.trim() : '';
    const authorFilter = typeof query.author_id === 'string' ? query.author_id.trim() : '';
    const reasonFilter = typeof query.reason_category === 'string' ? query.reason_category.trim() : '';
    const dateFrom = typeof query.date_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date_from.trim())
      ? query.date_from.trim()
      : '';
    const dateTo = typeof query.date_to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date_to.trim())
      ? query.date_to.trim()
      : '';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const conds = ['1=1'];
      const params = [];

      if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        conds.push(`cr.status = $${params.length}`);
      } else if (queue === 'pending') {
        conds.push("cr.status = 'pending'");
      } else if (queue === 'reported') {
        conds.push(
          "(cr.report_count > 0 OR EXISTS (SELECT 1 FROM community_reports rp WHERE rp.post_id = cr.id AND rp.status = 'open'))"
        );
      } else if (queue === 'history') {
        conds.push("cr.status IN ('approved', 'rejected', 'hidden')");
      }

      if (vendorFilter) {
        params.push(vendorFilter);
        conds.push(`cr.place_id = $${params.length}`);
      }
      if (authorFilter) {
        params.push(authorFilter);
        conds.push(`cr.author_id = $${params.length}`);
      }
      if (reasonFilter) {
        params.push(reasonFilter, `%${reasonFilter.slice(0, 60)}%`);
        conds.push(
          `(EXISTS (SELECT 1 FROM community_reports rp WHERE rp.post_id = cr.id AND rp.reason_category = $${params.length - 1}) OR cr.moderation_reason ILIKE $${params.length})`
        );
      }
      if (dateFrom) {
        params.push(`${dateFrom}T00:00:00.000Z`);
        conds.push(`cr.created_at >= $${params.length}::timestamptz`);
      }
      if (dateTo) {
        params.push(`${dateTo}T23:59:59.999Z`);
        conds.push(`cr.created_at <= $${params.length}::timestamptz`);
      }
      if (qText) {
        params.push(qText);
        conds.push(`(cr.title ILIKE $${params.length} OR cr.body ILIKE $${params.length} OR cr.place_name ILIKE $${params.length})`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM community_reviews cr WHERE ${whereSql}`, params);

      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           cr.*,
           COALESCE(
             (
               SELECT json_agg(json_build_object(
                 'id', rp.id,
                 'reason_category', rp.reason_category,
                 'details', rp.details,
                 'status', rp.status,
                 'created_at', rp.created_at
               ) ORDER BY rp.created_at DESC)
               FROM community_reports rp
               WHERE rp.post_id = cr.id
             ),
             '[]'::json
           ) AS reports,
           COALESCE(
             (
               SELECT json_agg(json_build_object(
                 'action', mh.action,
                 'actor_id', mh.actor_id,
                 'actor_role', mh.actor_role,
                 'from_status', mh.from_status,
                 'to_status', mh.to_status,
                 'reason', mh.reason,
                 'created_at', mh.created_at
               ) ORDER BY mh.created_at DESC)
               FROM community_moderation_history mh
               WHERE mh.post_id = cr.id
             ),
             '[]'::json
           ) AS moderation_history
         FROM community_reviews cr
         WHERE ${whereSql}
         ORDER BY
           CASE WHEN cr.status = 'pending' THEN 0 WHEN cr.report_count > 0 THEN 1 ELSE 2 END ASC,
           COALESCE(cr.moderated_at, cr.created_at) DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        posts: rows
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/moderation/decision') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const postId = typeof body.post_id === 'string' ? body.post_id.trim() : '';
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const internalNote =
      typeof body.internal_note === 'string' && body.internal_note.trim()
        ? body.internal_note.trim().slice(0, 1000)
        : null;

    if (!UUID_RE.test(postId) || !['approve', 'reject', 'hide', 'restore', 'dismiss_reports'].includes(action)) {
      return sendJson(400, {
        error: 'Valid post_id and action ("approve" | "reject" | "hide" | "restore" | "dismiss_reports") are required.'
      });
    }
    if (['reject', 'hide', 'restore'].includes(action) && (reason.length < 3 || reason.length > 600)) {
      return sendJson(400, { error: 'A clear moderation reason (3–600 characters) is required.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const { rows } = await tx.query('SELECT * FROM community_reviews WHERE id = $1 FOR UPDATE', [postId]);
      if (!rows.length) return { status: 404, body: { error: 'Community submission not found.' } };
      const post = rows[0];

      if (action === 'dismiss_reports') {
        await tx.query(
          `UPDATE community_reports
           SET status = 'dismissed', reviewed_by = $2, reviewed_at = now()
           WHERE post_id = $1 AND status = 'open'`,
          [postId, ctx.user.id]
        );
        await tx.query(
          `INSERT INTO community_moderation_history (post_id, actor_id, actor_role, action, from_status, to_status, reason, internal_note)
           VALUES ($1, $2, $3, 'dismiss_reports', $4, $4, $5, $6)`,
          [postId, ctx.user.id, verified.actorRole, post.status, reason || 'Reports reviewed and dismissed', internalNote]
        );
        await recordAuditLog(tx, {
          actorId: ctx.user.id,
          actorRole: verified.actorRole,
          vendorId: post.place_id || null,
          targetType: 'community_review',
          targetId: postId,
          action: 'community.dismiss_reports'
        });
        return { status: 200, body: { ok: true, status: post.status } };
      }

      let nextStatus = post.status;
      if (action === 'approve') {
        if (post.status !== 'pending') {
          return { status: 409, body: { error: `Post is already "${post.status}". Use "restore" if hidden/rejected.` } };
        }
        nextStatus = 'approved';
      } else if (action === 'reject') {
        if (post.status !== 'pending') {
          return { status: 409, body: { error: `Only pending posts can be rejected (use "hide" on approved posts).` } };
        }
        nextStatus = 'rejected';
      } else if (action === 'hide') {
        if (post.status !== 'approved') {
          return { status: 409, body: { error: 'Only approved public posts can be hidden.' } };
        }
        nextStatus = 'hidden';
      } else if (action === 'restore') {
        if (!['hidden', 'rejected'].includes(post.status)) {
          return { status: 409, body: { error: 'Only hidden or rejected posts can be restored.' } };
        }
        nextStatus = 'approved';
      }

      const { rows: u } = await tx.query(
        `UPDATE community_reviews
         SET status = $2,
             moderated_at = now(),
             moderated_by = $3,
             moderation_reason = COALESCE($4, moderation_reason),
             moderation_internal_note = COALESCE($5, moderation_internal_note),
             hidden_at = CASE WHEN $2 = 'hidden' THEN now() ELSE hidden_at END,
             hidden_by = CASE WHEN $2 = 'hidden' THEN $3 ELSE hidden_by END,
             restored_at = CASE WHEN $6 = 'restore' THEN now() ELSE restored_at END,
             restored_by = CASE WHEN $6 = 'restore' THEN $3 ELSE restored_by END
         WHERE id = $1
         RETURNING id, status, moderated_at, moderated_by, moderation_reason`,
        [postId, nextStatus, ctx.user.id, reason || null, internalNote, action]
      );

      await tx.query(
        `UPDATE community_reports
         SET status = 'reviewed', reviewed_by = $2, reviewed_at = now()
         WHERE post_id = $1 AND status = 'open'`,
        [postId, ctx.user.id]
      );

      await tx.query(
        `INSERT INTO community_moderation_history (post_id, actor_id, actor_role, action, from_status, to_status, reason, internal_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [postId, ctx.user.id, verified.actorRole, action, post.status, nextStatus, reason || null, internalNote]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verified.actorRole,
        vendorId: post.place_id || null,
        targetType: 'community_review',
        targetId: postId,
        action: `community.${action}`,
        metadata: { from_status: post.status, to_status: nextStatus, reason: reason || undefined }
      });

      return { status: 200, body: { post: u[0] } };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6G. Admin Support & Issue Management (`/api/admin/issues*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/issues') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 20, 50);
    const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
    const severityFilter = typeof query.severity === 'string' ? query.severity.trim() : '';
    const categoryFilter = typeof query.category === 'string' ? query.category.trim() : '';
    const vendorFilter = typeof query.vendor_id === 'string' ? query.vendor_id.trim() : '';
    const singleIssueId = typeof query.issue_id === 'string' && UUID_RE.test(query.issue_id.trim()) ? query.issue_id.trim() : '';
    const overdueOnly = query.overdue_only === '1' || query.overdue_only === 'true' || query.overdue === '1';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      if (singleIssueId) {
        const { rows: sRows } = await tx.query(
          `SELECT si.*, (si.status IN ('open', 'in_progress', 'waiting') AND si.sla_due_at < now()) AS is_overdue
           FROM support_issues si WHERE si.id = $1`,
          [singleIssueId]
        );
        if (!sRows.length) return { notFound: true };
        const { rows: sNotes } = await tx.query(
          `SELECT id, issue_id, author_user_id, author_role, visibility, body, created_at
           FROM support_issue_notes WHERE issue_id = $1 ORDER BY created_at ASC`,
          [singleIssueId]
        );
        const r = sRows[0];
        return {
          issue: {
            ...r,
            reporter_email: verified.actorRole === 'top' ? r.reporter_email : maskEmail(r.reporter_email || ''),
            reporter_role: r.reporter_context,
            assigned_to: r.assignee_user_id,
            booking_id: r.related_booking_id,
            community_post_id: r.related_review_id
          },
          notes: sNotes
        };
      }

      const conds = ['1=1'];
      const params = [];
      if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        conds.push(`si.status = $${params.length}`);
      }
      if (severityFilter && severityFilter !== 'all') {
        params.push(severityFilter);
        conds.push(`si.severity = $${params.length}`);
      }
      if (categoryFilter && categoryFilter !== 'all') {
        params.push(categoryFilter);
        conds.push(`si.category = $${params.length}`);
      }
      if (vendorFilter) {
        params.push(vendorFilter);
        conds.push(`si.vendor_id = $${params.length}`);
      }
      if (overdueOnly) {
        conds.push("si.status IN ('open', 'in_progress', 'waiting') AND si.sla_due_at < now()");
      }
      if (qText) {
        params.push(qText);
        conds.push(`(si.subject ILIKE $${params.length} OR si.description ILIKE $${params.length})`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM support_issues si WHERE ${whereSql}`, params);

      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT
           si.*,
           (si.status IN ('open', 'in_progress', 'waiting') AND si.sla_due_at < now()) AS is_overdue
         FROM support_issues si
         WHERE ${whereSql}
         ORDER BY
           CASE WHEN si.status IN ('open', 'in_progress', 'waiting') AND si.sla_due_at < now() THEN 0
                WHEN si.status IN ('open', 'in_progress') THEN 1
                ELSE 2 END ASC,
           si.sla_due_at ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const ids = rows.map(r => r.id);
      const notesMap = new Map();
      if (ids.length) {
        const { rows: notes } = await tx.query(
          `SELECT id, issue_id, author_user_id, author_role, visibility, body, created_at
           FROM support_issue_notes
           WHERE issue_id = ANY($1::uuid[])
           ORDER BY created_at ASC`,
          [ids]
        );
        for (const n of notes) {
          if (!notesMap.has(n.issue_id)) notesMap.set(n.issue_id, []);
          notesMap.get(n.issue_id).push(n);
        }
      }

      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        issues: rows.map(r => ({
          ...r,
          reporter_email: verified.actorRole === 'top' ? r.reporter_email : maskEmail(r.reporter_email || ''),
          reporter_role: r.reporter_context,
          assigned_to: r.assignee_user_id,
          booking_id: r.related_booking_id,
          community_post_id: r.related_review_id,
          notes: notesMap.get(r.id) || []
        }))
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    if (out.notFound) return sendJson(404, { error: 'Issue not found.' });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/issues/update') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const issueId = typeof body.issue_id === 'string' ? body.issue_id.trim() : '';
    const nextStatus = typeof body.status === 'string' && body.status.trim() ? body.status.trim() : null;
    const nextSeverity = typeof body.severity === 'string' && body.severity.trim() ? body.severity.trim() : null;
    const rawAssignee = body.assignee_user_id !== undefined ? body.assignee_user_id : body.assigned_to;
    const assigneeId =
      rawAssignee !== undefined
        ? rawAssignee
          ? String(rawAssignee).trim().slice(0, 128)
          : null
        : undefined;
    const resolutionReason =
      typeof body.resolution_reason === 'string' && body.resolution_reason.trim()
        ? body.resolution_reason.trim().slice(0, 800)
        : null;
    const noteBody = typeof body.note_body === 'string' && body.note_body.trim() ? body.note_body.trim() : null;
    const noteVisibility = body.note_visibility === 'reporter_visible' ? 'reporter_visible' : 'internal';

    if (!UUID_RE.test(issueId)) return sendJson(400, { error: 'Valid issue_id is required.' });
    if (nextStatus && !['open', 'in_progress', 'waiting', 'resolved', 'closed'].includes(nextStatus)) {
      return sendJson(400, { error: 'Invalid issue status.' });
    }
    if (nextSeverity && !['low', 'normal', 'high', 'urgent'].includes(nextSeverity)) {
      return sendJson(400, { error: 'Invalid issue severity.' });
    }
    if ((nextStatus === 'resolved' || nextStatus === 'closed') && (!resolutionReason || resolutionReason.length < 4)) {
      return sendJson(400, { error: 'A resolution_reason (at least 4 characters) is required when resolving or closing an issue.' });
    }
    if (noteBody && (noteBody.length < 2 || noteBody.length > 1500)) {
      return sendJson(400, { error: 'Note body must be 2–1500 characters.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
      await enableAdminTxGuards(tx, ctx);

      const { rows } = await tx.query('SELECT * FROM support_issues WHERE id = $1 FOR UPDATE', [issueId]);
      if (!rows.length) return { status: 404, body: { error: 'Issue not found.' } };
      const cur = rows[0];

      const effStatus = nextStatus || cur.status;
      const effSeverity = nextSeverity || cur.severity;
      const effAssignee = assigneeId !== undefined ? assigneeId : cur.assignee_user_id;
      const effResReason = resolutionReason || cur.resolution_reason;

      const { rows: u } = await tx.query(
        `UPDATE support_issues
         SET status = $2,
             severity = $3,
             assignee_user_id = $4,
             resolution_reason = $5,
             resolved_at = CASE WHEN $2 IN ('resolved', 'closed') AND resolved_at IS NULL THEN now() ELSE resolved_at END,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [issueId, effStatus, effSeverity, effAssignee, effResReason]
      );

      if (noteBody) {
        await tx.query(
          `INSERT INTO support_issue_notes (issue_id, author_user_id, author_role, visibility, body)
           VALUES ($1, $2, $3, $4, $5)`,
          [issueId, ctx.user.id, verified.actorRole, noteVisibility, noteBody]
        );
        if (noteVisibility === 'reporter_visible') {
          await recordTestSafeNotificationInTx(tx, {
            recipientUserId: cur.reporter_user_id,
            recipientEmail: cur.reporter_email,
            eventKind: 'issue.response',
            subject: `BiteShark Support Update: ${cur.subject}`,
            summary: noteBody.slice(0, 400)
          });
        }
      }

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verified.actorRole,
        vendorId: cur.vendor_id || null,
        targetType: 'support_issue',
        targetId: issueId,
        action: 'issue.admin_update',
        metadata: {
          from_status: cur.status,
          to_status: effStatus,
          note_added: Boolean(noteBody),
          note_visibility: noteBody ? noteVisibility : undefined
        }
      });

      return { status: 200, body: { issue: u[0] } };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6G-Readiness. Business & Compliance Readiness Checklist (`/api/admin/readiness*`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/readiness') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const categoryFilter = typeof query.category === 'string' && query.category.trim() ? query.category.trim() : '';
    const statusFilter = typeof query.status === 'string' && query.status.trim() ? query.status.trim() : '';
    const criticalOnly = query.critical_only === '1' || query.critical_only === 'true';
    const itemKeyFilter = typeof query.item_key === 'string' && query.item_key.trim() ? query.item_key.trim() : '';
    const qText = typeof query.q === 'string' && query.q.trim() ? `%${query.q.trim().slice(0, 80)}%` : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };
      await enableAdminTxGuards(tx, ctx);

      const summaryRes = await tx.query(`
        SELECT
          count(*)::int AS total_items,
          count(*) FILTER (WHERE is_launch_critical = true)::int AS total_launch_critical,
          count(*) FILTER (WHERE is_launch_critical = true AND status NOT IN ('legally_approved', 'not_applicable'))::int AS unresolved_launch_critical,
          count(*) FILTER (WHERE status = 'legally_approved')::int AS legally_approved_count,
          count(*) FILTER (WHERE status = 'needs_re_review')::int AS needs_re_review_count,
          count(*) FILTER (WHERE status IN ('not_assessed', 'decision_pending'))::int AS unassessed_or_pending_count,
          COALESCE(bool_or(item_key = 'final_legal_launch_gate' AND status = 'legally_approved'), false) AS final_launch_approved
        FROM compliance_readiness_items
      `);

      const conds = ['1=1'];
      const params = [];
      if (verified.actorRole !== 'top') {
        conds.push('i.mod_visible = true');
      }
      if (categoryFilter && categoryFilter !== 'all') {
        params.push(categoryFilter);
        conds.push(`i.category = $${params.length}`);
      }
      if (statusFilter && statusFilter !== 'all') {
        params.push(statusFilter);
        conds.push(`i.status = $${params.length}`);
      }
      if (criticalOnly) {
        conds.push('i.is_launch_critical = true');
      }
      if (itemKeyFilter) {
        params.push(itemKeyFilter);
        conds.push(`i.item_key = $${params.length}`);
      }
      if (qText) {
        params.push(qText);
        conds.push(
          `(i.topic ILIKE $${params.length} OR i.current_practice ILIKE $${params.length} OR COALESCE(i.unresolved_questions, '') ILIKE $${params.length} OR i.owner_label ILIKE $${params.length})`
        );
      }

      const whereSql = conds.join(' AND ');
      const { rows } = await tx.query(
        `SELECT i.*
         FROM compliance_readiness_items i
         WHERE ${whereSql}
         ORDER BY i.sort_order ASC, i.item_key ASC`,
        params
      );

      const itemKeys = rows.map(r => r.item_key);
      const historyByItem = new Map();
      if (itemKeys.length) {
        const { rows: histRows } = await tx.query(
          `SELECT id, item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata, created_at
           FROM compliance_readiness_history
           WHERE item_key = ANY($1::text[])
           ORDER BY created_at DESC`,
          [itemKeys]
        );
        for (const h of histRows) {
          if (!historyByItem.has(h.item_key)) historyByItem.set(h.item_key, []);
          const arr = historyByItem.get(h.item_key);
          if (arr.length < 25) {
            arr.push(h);
          }
        }
      }

      const sum = summaryRes.rows[0] || {};
      const launchReady = Boolean(sum.final_launch_approved) && (sum.unresolved_launch_critical || 0) === 0;

      return {
        actor: {
          id: ctx.user.id,
          email: ctx.user.email,
          level: verified.actorRole,
          label: verified.actorRole === 'top' ? ROLE_LABELS.top : ROLE_LABELS.mod
        },
        launch_ready: launchReady,
        launch_readiness_incomplete: !launchReady,
        reminder_banner: LAUNCH_INCOMPLETE_REMINDER_TEXT,
        deployment_portal_notice: DEPLOYMENT_PORTAL_REMINDER_NOTE,
        summary: {
          total_items: sum.total_items || 0,
          visible_items: rows.length,
          total_launch_critical: sum.total_launch_critical || 0,
          unresolved_launch_critical: sum.unresolved_launch_critical || 0,
          legally_approved_count: sum.legally_approved_count || 0,
          needs_re_review_count: sum.needs_re_review_count || 0,
          unassessed_or_pending_count: sum.unassessed_or_pending_count || 0
        },
        statuses_catalog: READINESS_STATUS_CATALOG,
        items: rows.map(r => serializeReadinessItemForActor(r, verified.actorRole, historyByItem.get(r.item_key) || []))
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  if (normPath === '/api/admin/readiness/note') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const itemKey = typeof body.item_key === 'string' ? body.item_key.trim() : '';
    if (!/^[a-z0-9_]{3,64}$/.test(itemKey)) {
      return sendJson(400, { error: 'Valid item_key is required.' });
    }

    const forbiddenModKeys = [
      'status',
      'decision_recorded',
      'implemented_recorded',
      'tested_recorded',
      'policy_version',
      'current_practice',
      'unresolved_questions',
      'owner_label',
      'next_action',
      'target_review_date',
      'approved_doc_version',
      'approved_jurisdiction_scope',
      'legal_reviewer_name',
      'legal_reviewed_at',
      'confidential_counsel_notes',
      'mod_counsel_access_granted',
      'not_applicable_explanation'
    ];

    const noteText = typeof body.note === 'string' ? body.note.trim() : '';
    const hasEvidenceUpdate = body.supporting_evidence !== undefined;
    const nextEvidence =
      hasEvidenceUpdate && body.supporting_evidence !== null && String(body.supporting_evidence).trim()
        ? String(body.supporting_evidence).trim().slice(0, 1000)
        : hasEvidenceUpdate
          ? null
          : undefined;

    if (!noteText && !hasEvidenceUpdate) {
      return sendJson(400, { error: 'Provide an operational note or supporting_evidence reference.' });
    }
    if (noteText && (noteText.length < 3 || noteText.length > 800)) {
      return sendJson(400, { error: 'Operational note must be 3–800 characters.' });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { status: verified.status, body: { error: verified.error } };

      if (verified.actorRole !== 'top') {
        for (const k of forbiddenModKeys) {
          if (body[k] !== undefined) {
            return {
              status: 403,
              body: {
                error:
                  'Admin: Mod may add operational notes and supporting evidence only; readiness status, governing policies, counsel notes, and legal approvals require Admin: Top.',
                code: 'MOD_READINESS_FORBIDDEN'
              }
            };
          }
        }
      }

      await enableAdminTxGuards(tx, ctx);
      const { rows } = await tx.query('SELECT * FROM compliance_readiness_items WHERE item_key = $1 FOR UPDATE', [
        itemKey
      ]);
      if (!rows.length) return { status: 404, body: { error: 'Readiness item not found.' } };
      const cur = rows[0];

      if (verified.actorRole !== 'top' && (!cur.mod_visible || cur.item_key === 'final_legal_launch_gate')) {
        return {
          status: 403,
          body: {
            error: 'Admin: Mod does not have access to modify this governance item.',
            code: 'MOD_READINESS_FORBIDDEN'
          }
        };
      }

      const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z';
      const appendedNotes = noteText
        ? [cur.operational_notes, `[${stamp} · ${verified.actorRole.toUpperCase()}] ${noteText}`]
            .filter(Boolean)
            .join('\n')
            .slice(-2000)
        : cur.operational_notes;
      const effEvidence = nextEvidence !== undefined ? nextEvidence : cur.supporting_evidence;

      const { rows: updatedRows } = await tx.query(
        `UPDATE compliance_readiness_items
         SET operational_notes = $2,
             supporting_evidence = $3,
             updated_by = $4,
             updated_at = now()
         WHERE item_key = $1
         RETURNING *`,
        [itemKey, appendedNotes, effEvidence, ctx.user.id]
      );

      const summary = noteText
        ? `Operational note added: ${noteText.slice(0, 180)}`
        : 'Supporting evidence reference updated';

      await tx.query(
        `INSERT INTO compliance_readiness_history
           (item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata)
         VALUES ($1, $2, $3, 'mod_operational_note', $4, $4, $5, $6::jsonb)`,
        [
          itemKey,
          ctx.user.id,
          verified.actorRole,
          cur.status,
          summary,
          JSON.stringify({
            note_added: Boolean(noteText),
            evidence_updated: hasEvidenceUpdate
          })
        ]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: verified.actorRole,
        targetType: 'compliance_readiness_item',
        targetId: itemKey,
        action: 'readiness.note_added',
        metadata: {
          status: cur.status,
          note_added: Boolean(noteText),
          evidence_updated: hasEvidenceUpdate
        }
      });

      const { rows: histRows } = await tx.query(
        `SELECT id, item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata, created_at
         FROM compliance_readiness_history
         WHERE item_key = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [itemKey]
      );

      return {
        status: 200,
        body: {
          item: serializeReadinessItemForActor(updatedRows[0], verified.actorRole, histRows)
        }
      };
    });

    return sendJson(outcome.status, outcome.body);
  }

  if (normPath === '/api/admin/readiness/update') {
    if (method !== 'POST') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const itemKey = typeof body.item_key === 'string' ? body.item_key.trim() : '';
    if (!/^[a-z0-9_]{3,64}$/.test(itemKey)) {
      return sendJson(400, { error: 'Valid item_key is required.' });
    }

    if (body.status !== undefined && !VALID_READINESS_STATUSES.has(String(body.status).trim())) {
      return sendJson(400, { error: 'Unrecognized readiness status value.' });
    }

    const targetDateCheck =
      body.target_review_date !== undefined
        ? validateIsoCalendarDate(body.target_review_date, { allowFuture: true })
        : { ok: true, value: undefined };
    if (!targetDateCheck.ok) {
      return sendJson(400, { error: `target_review_date: ${targetDateCheck.error}` });
    }

    const legalDateCheck =
      body.legal_reviewed_at !== undefined
        ? validateIsoCalendarDate(body.legal_reviewed_at, { allowFuture: false })
        : { ok: true, value: undefined };
    if (!legalDateCheck.ok) {
      return sendJson(400, { error: `legal_reviewed_at: ${legalDateCheck.error}` });
    }

    const outcome = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyPlatformAdminInTx(tx, ctx);
      if (!verified.ok) {
        return {
          status: verified.status,
          body: {
            error:
              'Only Admin: Top may modify readiness statuses, governing policies, confidential counsel notes, or legal-review approvals.',
            code: 'TOP_ADMIN_REQUIRED'
          }
        };
      }

      await enableAdminTxGuards(tx, ctx);
      const { rows } = await tx.query('SELECT * FROM compliance_readiness_items WHERE item_key = $1 FOR UPDATE', [
        itemKey
      ]);
      if (!rows.length) return { status: 404, body: { error: 'Readiness item not found.' } };
      const cur = rows[0];

      if (body.expected_updated_at) {
        const expMs = new Date(body.expected_updated_at).getTime();
        const curMs = new Date(cur.updated_at).getTime();
        if (Number.isFinite(expMs) && Math.abs(expMs - curMs) > 5) {
          return {
            status: 409,
            body: {
              error: 'This readiness item was modified concurrently. Refresh before saving.',
              code: 'CONCURRENT_UPDATE_CONFLICT'
            }
          };
        }
      }

      const cleanOptStr = (val, maxLen) => {
        if (val === undefined) return undefined;
        if (val === null) return null;
        const s = String(val).trim();
        return s ? s.slice(0, maxLen) : null;
      };

      const effPractice =
        body.current_practice !== undefined ? String(body.current_practice || '').trim() : cur.current_practice;
      if (effPractice.length < 4 || effPractice.length > 2000) {
        return { status: 400, body: { error: 'current_practice must be 4–2000 characters.' } };
      }

      const effOwner = body.owner_label !== undefined ? String(body.owner_label || '').trim() : cur.owner_label;
      if (effOwner.length < 2 || effOwner.length > 120) {
        return { status: 400, body: { error: 'owner_label must be 2–120 characters.' } };
      }

      const effNextAction = body.next_action !== undefined ? String(body.next_action || '').trim() : cur.next_action;
      if (effNextAction.length < 4 || effNextAction.length > 600) {
        return { status: 400, body: { error: 'next_action must be 4–600 characters.' } };
      }

      const effUnresolved =
        body.unresolved_questions !== undefined
          ? cleanOptStr(body.unresolved_questions, 2000)
          : cur.unresolved_questions;
      const effPolicyVersion =
        body.policy_version !== undefined ? cleanOptStr(body.policy_version, 80) : cur.policy_version;
      const effEvidence =
        body.supporting_evidence !== undefined ? cleanOptStr(body.supporting_evidence, 1000) : cur.supporting_evidence;
      const effOpNotes =
        body.operational_notes !== undefined ? cleanOptStr(body.operational_notes, 2000) : cur.operational_notes;
      const effCounselNotes =
        body.confidential_counsel_notes !== undefined
          ? cleanOptStr(body.confidential_counsel_notes, 2000)
          : cur.confidential_counsel_notes;
      const effModCounselAccess =
        body.mod_counsel_access_granted !== undefined
          ? Boolean(body.mod_counsel_access_granted)
          : Boolean(cur.mod_counsel_access_granted);
      const effTargetDate =
        targetDateCheck.value !== undefined ? targetDateCheck.value : cur.target_review_date;

      // Stage flags remain independent — selecting a policy decision never auto-marks implemented/tested/approved
      const effDecision =
        body.decision_recorded !== undefined ? Boolean(body.decision_recorded) : Boolean(cur.decision_recorded);
      const effImplemented =
        body.implemented_recorded !== undefined
          ? Boolean(body.implemented_recorded)
          : Boolean(cur.implemented_recorded);
      const effTested =
        body.tested_recorded !== undefined ? Boolean(body.tested_recorded) : Boolean(cur.tested_recorded);

      let requestedStatus = body.status !== undefined ? String(body.status).trim() : cur.status;
      const effNaExplanation =
        body.not_applicable_explanation !== undefined
          ? cleanOptStr(body.not_applicable_explanation, 600)
          : cur.not_applicable_explanation;

      let effApprovedDocVersion =
        body.approved_doc_version !== undefined
          ? cleanOptStr(body.approved_doc_version, 80)
          : cur.approved_doc_version;
      let effApprovedScope =
        body.approved_jurisdiction_scope !== undefined
          ? cleanOptStr(body.approved_jurisdiction_scope, 240)
          : cur.approved_jurisdiction_scope;
      let effReviewerName =
        body.legal_reviewer_name !== undefined
          ? cleanOptStr(body.legal_reviewer_name, 160)
          : cur.legal_reviewer_name;
      let effReviewedAt =
        legalDateCheck.value !== undefined ? legalDateCheck.value : cur.legal_reviewed_at;

      const policyVersionChanged = (effPolicyVersion || null) !== (cur.policy_version || null);
      const practiceChanged = effPractice !== cur.current_practice;
      const materialPolicyChanged = policyVersionChanged || practiceChanged;

      // Determine whether caller supplied a brand-new legal sign-off alongside a material change
      const freshApprovalProvided =
        body.status === 'legally_approved' &&
        Boolean(body.approved_doc_version && String(body.approved_doc_version).trim() !== (cur.approved_doc_version || '')) &&
        Boolean(body.legal_reviewer_name) &&
        Boolean(body.legal_reviewed_at);

      let autoTransitionedToReReview = false;
      if (cur.status === 'legally_approved' && materialPolicyChanged && !freshApprovalProvided) {
        requestedStatus = 'needs_re_review';
        autoTransitionedToReReview = true;
      }

      if (requestedStatus === 'not_applicable') {
        if (!effNaExplanation || effNaExplanation.length < 8) {
          return {
            status: 400,
            body: {
              error: 'Marking an item "not_applicable" requires a clear explanation (at least 8 characters).',
              code: 'NA_EXPLANATION_REQUIRED'
            }
          };
        }
      }

      if (requestedStatus === 'legally_approved') {
        if (
          !effApprovedDocVersion ||
          effApprovedDocVersion.length < 2 ||
          !effApprovedScope ||
          effApprovedScope.length < 3 ||
          !effReviewerName ||
          effReviewerName.length < 3 ||
          !effReviewedAt
        ) {
          return {
            status: 400,
            body: {
              error:
                'Legal approval requires approved_doc_version, approved_jurisdiction_scope, legal_reviewer_name, and legal_reviewed_at (YYYY-MM-DD). Generic checkbox approval is forbidden.',
              code: 'LEGAL_APPROVAL_EVIDENCE_REQUIRED'
            }
          };
        }
      }

      if (
        itemKey === 'final_legal_launch_gate' &&
        (requestedStatus === 'legally_approved' || requestedStatus === 'not_applicable')
      ) {
        const depRes = await tx.query(
          `SELECT count(*)::int AS unresolved_count
           FROM compliance_readiness_items
           WHERE item_key <> 'final_legal_launch_gate'
             AND is_launch_critical = true
             AND status NOT IN ('legally_approved', 'not_applicable')`
        );
        const unresolvedDeps = depRes.rows[0]?.unresolved_count || 0;
        if (unresolvedDeps > 0) {
          return {
            status: 409,
            body: {
              error: `Cannot mark final_legal_launch_gate complete while ${unresolvedDeps} launch-critical readiness item(s) remain unresolved.`,
              code: 'UNRESOLVED_LAUNCH_DEPENDENCIES',
              unresolved_launch_critical: unresolvedDeps
            }
          };
        }
      }

      const { rows: updatedRows } = await tx.query(
        `UPDATE compliance_readiness_items
         SET current_practice = $2,
             unresolved_questions = $3,
             status = $4,
             not_applicable_explanation = $5,
             decision_recorded = $6,
             implemented_recorded = $7,
             tested_recorded = $8,
             owner_label = $9,
             next_action = $10,
             target_review_date = $11,
             policy_version = $12,
             supporting_evidence = $13,
             operational_notes = $14,
             confidential_counsel_notes = $15,
             mod_counsel_access_granted = $16,
             approved_doc_version = $17,
             approved_jurisdiction_scope = $18,
             legal_reviewer_name = $19,
             legal_reviewed_at = $20,
             updated_by = $21,
             updated_at = now()
         WHERE item_key = $1
         RETURNING *`,
        [
          itemKey,
          effPractice,
          effUnresolved,
          requestedStatus,
          effNaExplanation,
          effDecision,
          effImplemented,
          effTested,
          effOwner,
          effNextAction,
          effTargetDate,
          effPolicyVersion,
          effEvidence,
          effOpNotes,
          effCounselNotes,
          effModCounselAccess,
          effApprovedDocVersion,
          effApprovedScope,
          effReviewerName,
          effReviewedAt,
          ctx.user.id
        ]
      );

      let changeKind = 'top_update';
      let summaryText =
        typeof body.change_summary === 'string' && body.change_summary.trim()
          ? body.change_summary.trim().slice(0, 400)
          : `Updated readiness item (${cur.status} -> ${requestedStatus})`;

      const histMeta = {
        decision_recorded: effDecision,
        implemented_recorded: effImplemented,
        tested_recorded: effTested,
        policy_version: effPolicyVersion
      };

      if (autoTransitionedToReReview) {
        changeKind = 'auto_needs_re_review';
        summaryText = `Material policy/practice update automatically marked prior approval (${cur.approved_doc_version || 'unspecified'}) as Needs re-review.`;
        histMeta.changed_fields = [
          ...(policyVersionChanged ? ['policy_version'] : []),
          ...(practiceChanged ? ['current_practice'] : [])
        ];
        histMeta.prior_approval = {
          approved_doc_version: cur.approved_doc_version,
          approved_jurisdiction_scope: cur.approved_jurisdiction_scope,
          legal_reviewer_name: cur.legal_reviewer_name,
          legal_reviewed_at: cur.legal_reviewed_at
        };
      } else if (requestedStatus === 'legally_approved') {
        changeKind = 'legal_approval_recorded';
        summaryText = `Legal review recorded for ${effApprovedDocVersion} (${effApprovedScope}) by ${effReviewerName} on ${effReviewedAt}.`;
        histMeta.approval = {
          approved_doc_version: effApprovedDocVersion,
          approved_jurisdiction_scope: effApprovedScope,
          legal_reviewer_name: effReviewerName,
          legal_reviewed_at: effReviewedAt
        };
      }

      await tx.query(
        `INSERT INTO compliance_readiness_history
           (item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata)
         VALUES ($1, $2, 'top', $3, $4, $5, $6, $7::jsonb)`,
        [itemKey, ctx.user.id, changeKind, cur.status, requestedStatus, summaryText, JSON.stringify(histMeta)]
      );

      await recordAuditLog(tx, {
        actorId: ctx.user.id,
        actorRole: 'top',
        targetType: 'compliance_readiness_item',
        targetId: itemKey,
        action: autoTransitionedToReReview
          ? 'readiness.auto_needs_re_review'
          : requestedStatus === 'legally_approved'
            ? 'readiness.legal_approval_recorded'
            : 'readiness.update',
        metadata: {
          from_status: cur.status,
          to_status: requestedStatus,
          policy_version: effPolicyVersion,
          approved_doc_version: requestedStatus === 'legally_approved' ? effApprovedDocVersion : undefined,
          approved_jurisdiction_scope: requestedStatus === 'legally_approved' ? effApprovedScope : undefined,
          legal_reviewer_name: requestedStatus === 'legally_approved' ? effReviewerName : undefined,
          legal_reviewed_at: requestedStatus === 'legally_approved' ? effReviewedAt : undefined
        }
      });

      const { rows: histRows } = await tx.query(
        `SELECT id, item_key, actor_id, actor_role, change_kind, from_status, to_status, summary, metadata, created_at
         FROM compliance_readiness_history
         WHERE item_key = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [itemKey]
      );

      return {
        status: 200,
        body: {
          auto_needs_re_review: autoTransitionedToReReview,
          item: serializeReadinessItemForActor(updatedRows[0], 'top', histRows)
        }
      };
    });

    return sendJson(outcome.status, outcome.body);
  }

  // -------------------------------------------------------------------------
  // 6H. Redacted Audit & Activity History (`GET /api/admin/audit`)
  // -------------------------------------------------------------------------
  if (normPath === '/api/admin/audit') {
    if (method !== 'GET') return sendJson(405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    const { page, pageSize, offset } = parseBoundedPagination(query, 30, 60);
    const actionFilter = typeof query.action === 'string' && query.action.trim() ? `${query.action.trim().slice(0, 40)}%` : null;
    const vendorFilter = typeof query.vendor_id === 'string' && query.vendor_id.trim() ? query.vendor_id.trim() : null;
    const actorFilter = typeof query.actor_id === 'string' && query.actor_id.trim() ? query.actor_id.trim() : null;

    const out = await withTransaction(dbAdapter, async tx => {
      const verified = await reverifyModeratorInTx(tx, ctx);
      if (!verified.ok) return { denied: verified };

      const conds = ['1=1'];
      const params = [];
      // Scope `Admin: Mod` audit view to moderation, vendor review, issue, invitation, and Mod readiness-note actions
      if (verified.actorRole !== 'top') {
        conds.push(
          "(action LIKE 'community.%' OR action LIKE 'vendor_application.%' OR action LIKE 'vendor.%' OR action LIKE 'issue.%' OR action LIKE 'invitation.%' OR action LIKE 'onboarding.%' OR action = 'readiness.note_added')"
        );
      }
      if (actionFilter) {
        params.push(actionFilter);
        conds.push(`action ILIKE $${params.length}`);
      }
      if (vendorFilter) {
        params.push(vendorFilter);
        conds.push(`vendor_id = $${params.length}`);
      }
      if (actorFilter) {
        params.push(actorFilter);
        conds.push(`actor_id = $${params.length}`);
      }

      const whereSql = conds.join(' AND ');
      const totalRes = await tx.query(`SELECT count(*)::int AS total FROM audit_logs WHERE ${whereSql}`, params);
      params.push(pageSize, offset);
      const { rows } = await tx.query(
        `SELECT id, actor_id, actor_role, vendor_id, target_type, target_id, action, metadata, created_at
         FROM audit_logs
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return {
        page,
        page_size: pageSize,
        total: totalRes.rows[0]?.total || 0,
        entries: rows
      };
    });
    if (out.denied) return sendJson(out.denied.status, { error: out.denied.error });
    return sendJson(200, out);
  }

  return sendJson(404, { error: 'Not found' });
}
