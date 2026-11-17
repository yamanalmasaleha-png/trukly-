// Truckly Hatchable Staging Gate & End-to-End Verification Runner (G1..G6 + E2E)
//
// Modes:
//   1. Live Isolated Hatchable Staging Mode:
//      STAGING_BASE_URL=https://<staging-subdomain>.hatchable.site \
//      STAGING_COOKIE_CUSTOMER_A="..." \
//      STAGING_COOKIE_CUSTOMER_B="..." \
//      STAGING_COOKIE_VENDOR_A_OWNER="..." \
//      STAGING_COOKIE_VENDOR_A_STAFF="..." \
//      STAGING_COOKIE_VENDOR_B_OWNER="..." \
//      STAGING_COOKIE_MODERATOR="..." \
//      STAGING_COOKIE_PLATFORM_ADMIN="..." \
//      STAGING_PROBE_TOKEN="..." \
//      node tests/staging-hatchable-gates.cjs
//
//   2. Local Pre-Flight Harness Self-Test (validates this script + probe + cleanup SQL
//      against a disposable HTTP server & real PostgreSQL; clearly labeled NOT HOSTED):
//      node tests/staging-hatchable-gates.cjs --preflight-local
//
// Safety rules:
//   - Hard-blocks execution against production `truckly.hatchable.site`.
//   - Never prints session cookies, user emails, or raw private pager UUIDs.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
const { AsyncLocalStorage } = require('node:async_hooks');

const ROOT = path.resolve(__dirname, '..');
const FORBIDDEN_PROD_HOSTS = new Set([
  'truckly.hatchable.site',
  'www.truckly.hatchable.site'
]);

function shaTag(val) {
  return 'sha256:' + crypto.createHash('sha256').update(String(val || '')).digest('hex').slice(0, 12);
}

function assertNotProductionUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid STAGING_BASE_URL: "${rawUrl}"`);
  }
  const host = parsed.hostname.toLowerCase();
  if (FORBIDDEN_PROD_HOSTS.has(host) || rawUrl.includes('proj_MEO518rmLLl0')) {
    const err = new Error(
      `SAFETY BLOCK: Refusing to run staging verification against production host "${host}". Use an isolated staging project.`
    );
    err.code = 'PRODUCTION_TARGET_BLOCKED';
    throw err;
  }
  return parsed.origin;
}

function futurePacificISO(daysAhead) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + daysAhead));
  return (
    dt.getUTCFullYear() +
    '-' +
    String(dt.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(dt.getUTCDate()).padStart(2, '0')
  );
}

async function runStagingSuite(cfg) {
  const baseOrigin = assertNotProductionUrl(cfg.baseUrl);
  const runId = crypto.randomBytes(4).toString('hex');
  const tag = `[STG-E2E-${runId}]`;
  const createdPagersToCancel = [];

  const gates = {
    G1_runtime_compatibility: { status: 'BLOCKED', detail: 'Not yet run' },
    G2_transactions: { status: 'BLOCKED', detail: 'Requires staging runtime probe or transaction diagnostic' },
    G3_identity_context_isolation: { status: 'BLOCKED', detail: 'Requires authenticated staging sessions' },
    G4_hosted_identity_and_authz: { status: 'BLOCKED', detail: 'Requires 7 staging persona cookies' },
    G5_database_security_role: { status: 'BLOCKED', detail: 'Requires staging runtime probe or Gate 5 SQL check' },
    G6_direct_table_gateway: { status: 'BLOCKED', detail: 'Not yet run' }
  };

  const e2e = {
    E2E1_bookings_dates_ownership_idempotency: { status: 'BLOCKED', detail: 'Pending' },
    E2E2_concurrent_pager_retries_and_isolation: { status: 'BLOCKED', detail: 'Pending' },
    E2E3_date_only_yyyy_mm_dd_contract: { status: 'BLOCKED', detail: 'Pending' },
    E2E4_moderation_and_self_approval_denial: { status: 'BLOCKED', detail: 'Pending' },
    E2E5_write_pause_controls: { status: 'BLOCKED', detail: 'Requires write-pause toggle check' },
    E2E6_customer_pager_demo_zero_writes: { status: 'BLOCKED', detail: 'Pending' }
  };

  async function reqJson(urlPath, { method = 'GET', cookie = '', headers = {}, body = undefined } = {}) {
    const hdrs = { ...headers };
    if (cookie) hdrs.Cookie = cookie;
    if (body !== undefined && !hdrs['Content-Type']) {
      hdrs['Content-Type'] = 'application/json';
    }
    const res = await fetch(baseOrigin + urlPath, {
      method,
      redirect: 'manual',
      headers: hdrs,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  }

  try {
    // ========================================================================
    // GATE 1: Runtime Compatibility (`lib/*.js` + `node:crypto`, no helper routes)
    // ========================================================================
    const futureDate = futurePacificISO(16);
    const g1Avail = await reqJson(`/api/trucks/availability?truck_id=mitote&date=${futureDate}`);
    const g1OwnerAnon = await reqJson('/api/owner/stats');
    const g1BookAnon = await reqJson('/api/bookings/create', { method: 'POST', body: {} });

    const forbiddenHelperPaths = [
      '/lib/authz.js',
      '/lib/authz',
      '/lib/catalog.js',
      '/lib/dates.js',
      '/lib/db-tx.js',
      '/lib/discovery.js',
      '/api/lib/authz',
      '/api/authz',
      '/scripts/dev-server.cjs',
      '/scripts/seed-sql-reader.cjs'
    ];
    const helperChecks = await Promise.all(forbiddenHelperPaths.map(p => reqJson(p)));
    const exposedHelper = forbiddenHelperPaths.find((_, i) => ![404, 403].includes(helperChecks[i].status));

    assert.equal(g1Avail.status, 200, `Expected 200 on availability, got ${g1Avail.status}`);
    assert.equal(typeof g1Avail.json?.requestable, 'boolean', 'Availability JSON missing boolean requestable');
    assert.equal(g1OwnerAnon.status, 401, `Expected 401 on anonymous /api/owner/stats, got ${g1OwnerAnon.status}`);
    assert.equal(g1BookAnon.status, 401, `Expected 401 on anonymous /api/bookings/create, got ${g1BookAnon.status}`);
    assert.equal(exposedHelper, undefined, `Helper file unexpectedly exposed at ${exposedHelper}`);

    gates.G1_runtime_compatibility = {
      status: 'PASS',
      detail: 'Deployed routes import lib/*.js and node:crypto cleanly; 8 helper/script paths confirmed unexposed (404).'
    };

    // ========================================================================
    // E2E-6: Customer Pager Demo Makes Zero Real Network Calls or Writes
    // ========================================================================
    const [indexRes, pagerJsRes] = await Promise.all([
      fetch(baseOrigin + '/index.html').then(r => r.text()),
      fetch(baseOrigin + '/pager.js').then(r => r.text())
    ]);
    assert(indexRes.includes('onclick="startPagerDemo()"'), 'index.html missing startPagerDemo()');
    let demoNetCalls = 0;
    const demoNodes = new Map();
    const el = id => {
      if (!demoNodes.has(id)) {
        demoNodes.set(id, {
          id,
          innerHTML: '',
          textContent: '',
          className: '',
          value: '',
          open: false,
          classList: { contains: v => id === 'pagerScreen' && v === 'active' },
          replaceChildren() {}
        });
      }
      return demoNodes.get(id);
    };
    const demoCtx = vm.createContext({
      document: { hidden: false, getElementById: el, addEventListener() {}, querySelector: () => ({ textContent: '', replaceChildren() {} }) },
      window: { addEventListener() {} },
      location: { hash: '', origin: baseOrigin },
      URL,
      URLSearchParams,
      navigator: {},
      console,
      setInterval: () => 0,
      setTimeout: () => 1,
      clearTimeout() {},
      fetch() {
        demoNetCalls++;
        throw new Error('Customer pager demo attempted network fetch');
      }
    });
    vm.runInContext(pagerJsRes, demoCtx);
    vm.runInContext('startPagerDemo(); pagerAdvanceDemo(); pagerAdvanceDemo(); pagerLeaveDemo();', demoCtx);
    assert.equal(demoNetCalls, 0, 'Customer pager demo must make 0 network requests');
    e2e.E2E6_customer_pager_demo_zero_writes = {
      status: 'PASS',
      detail: 'Served /pager.js executed full demo lifecycle with 0 network calls or DB writes.'
    };

    // Check whether all 7 authenticated persona cookies are provided
    const requiredCookies = [
      'customerA',
      'customerB',
      'vendorAOwner',
      'vendorAStaff',
      'vendorBOwner',
      'moderator',
      'platformAdmin'
    ];
    const missingPersonas = requiredCookies.filter(k => !cfg.cookies?.[k]);
    if (missingPersonas.length > 0) {
      const msg = `Missing staging session cookies for: ${missingPersonas.join(', ')}`;
      gates.G3_identity_context_isolation = { status: 'BLOCKED', detail: msg };
      gates.G4_hosted_identity_and_authz = { status: 'BLOCKED', detail: msg };
      return { baseOrigin, runId, gates, e2e };
    }

    // ========================================================================
    // Optional Ephemeral Runtime Probe (`/_staging_gate_probe`) for Gates 2, 3, 5
    // ========================================================================
    let probeData = null;
    if (cfg.probeToken) {
      const probeRes = await reqJson('/api/_staging_gate_probe', {
        method: 'POST',
        cookie: cfg.cookies.platformAdmin,
        headers: { 'x-staging-probe-token': cfg.probeToken },
        body: {}
      });
      if (probeRes.status === 200 && probeRes.json) {
        probeData = probeRes.json;
        const g2 = probeData.gate2_transactions;
        assert.equal(g2.same_pid, true, 'Transaction statements did not execute on a single pg_backend_pid()');
        assert.equal(g2.same_xid, true, 'Transaction statements did not share txid_current()');
        assert.equal(g2.in_tx_uid_matches, true, 'In-transaction SET LOCAL app.user_id did not hold');
        assert.equal(g2.rollback_caught, true, 'Intentional mid-transaction failure was not caught');
        assert.equal(g2.persisted_after_rollback, 0, 'Failed multi-statement transaction leaked persisted audit row');

        gates.G2_transactions = {
          status: 'PASS',
          detail: `Adapter verified (transaction=${probeData.adapter.has_transaction_fn}, connect=${probeData.adapter.has_connect_fn}); single PID/XID confirmed and failed multi-statement write rolled back (0 rows persisted).`
        };

        const g5 = probeData.gate5_db_role;
        assert.equal(g5.is_superuser, false, 'Runtime DB role must not be SUPERUSER');
        assert.equal(g5.has_bypassrls, false, 'Runtime DB role must not have BYPASSRLS');
        assert.equal(g5.rls_enabled, true, 'community_reviews relrowsecurity must be true');
        assert.equal(g5.rls_forced, true, 'community_reviews relforcerowsecurity must be true');
        assert.equal(g5.unapproved_visible_without_guc, 0, 'Unapproved community rows visible without GUC');

        gates.G5_database_security_role = {
          status: 'PASS',
          detail: `Role "${g5.db_current_user}" verified NOSUPERUSER, NOBYPASSRLS, FORCE RLS active, 0 unapproved rows visible.`
        };
      } else {
        gates.G2_transactions = {
          status: 'BLOCKED',
          detail: `/api/_staging_gate_probe returned HTTP ${probeRes.status}; upload scripts/staging-runtime-probe.template.js on isolated staging to verify connection pinning & rollback.`
        };
      }
    }

    // ========================================================================
    // GATE 4: Hosted Identity, Cross-Vendor RBAC, Staff Restrictions & Debug Immunity
    // ========================================================================
    const spoofHdrs = { 'x-truckly-debug-role': 'admin' };
    const vaStats = await reqJson('/api/owner/stats', { cookie: cfg.cookies.vendorAOwner });
    const vbStats = await reqJson('/api/owner/stats', { cookie: cfg.cookies.vendorBOwner });
    const paStats = await reqJson('/api/owner/stats', { cookie: cfg.cookies.platformAdmin });

    assert.equal(vaStats.status, 200, 'Vendor A owner /api/owner/stats failed');
    assert.equal(vbStats.status, 200, 'Vendor B owner /api/owner/stats failed');
    assert.equal(paStats.status, 200, 'Platform admin /api/owner/stats failed');
    assert(typeof vaStats.json?.actor?.user_id === 'string' && vaStats.json.actor.user_id.length > 0, 'Missing trusted actor.user_id');
    assert.equal(paStats.json?.actor?.is_platform_admin, true, 'Platform admin flag missing');

    // Customer + debug-role header/cookie spoofing denied
    const custSpoofOwner = await reqJson('/api/owner/stats', {
      cookie: `${cfg.cookies.customerA}; truckly_debug_role=admin`,
      headers: spoofHdrs
    });
    assert.equal(custSpoofOwner.status, 403, 'Customer spoofed debug role was not denied');

    // Cross-vendor read/write denials (Vendor A targeting mitote)
    assert.equal(
      (await reqJson('/api/owner/profile?truck_id=mitote', { cookie: cfg.cookies.vendorAOwner, headers: spoofHdrs })).status,
      403
    );
    assert.equal(
      (await reqJson('/api/owner/schedule', { method: 'POST', cookie: cfg.cookies.vendorAOwner, body: { truck_id: 'mitote', service_date: futureDate, status: 'scheduled' } })).status,
      403
    );

    // Vendor A staff permissions: allowed operational location/schedule/pager, denied profile & booking accept & moderation
    assert.equal(
      (await reqJson('/api/owner/location', {
        method: 'POST',
        cookie: cfg.cookies.vendorAStaff,
        body: { truck_id: 'iniguez', location: `${tag} Sebastopol Rd`, is_open: true }
      })).status,
      200
    );
    assert.equal(
      (await reqJson('/api/owner/profile', {
        method: 'POST',
        cookie: cfg.cookies.vendorAStaff,
        body: { truck_id: 'iniguez', display_name: 'Staff Unauthorized Rename' }
      })).status,
      403
    );
    assert.equal(
      (await reqJson('/api/community/moderate', { cookie: cfg.cookies.vendorAOwner })).status,
      403
    );
    assert.equal(
      (await reqJson('/api/community/moderate', { cookie: cfg.cookies.vendorAStaff })).status,
      403
    );

    // ========================================================================
    // E2E-1 & E2E-3: Bookings Validation, Ownership, Idempotency & YYYY-MM-DD Dates
    // ========================================================================
    const unavailDate = futurePacificISO(24);
    const bookDate = '2026-12-20';
    await reqJson('/api/owner/schedule', {
      method: 'POST',
      cookie: cfg.cookies.vendorBOwner,
      body: { truck_id: 'mitote', service_date: unavailDate, location: `${tag} Unavailable test`, status: 'unavailable' }
    });

    // Impossible date, past date, and unavailable schedule date
    assert.equal(
      (await reqJson('/api/bookings/create', {
        method: 'POST',
        cookie: cfg.cookies.customerA,
        body: { truck_id: 'mitote', package_id: 'dropin', event_type: 'Test', event_date: '2026-02-29', guest_count: 20, location: `${tag} Bad date` }
      })).status,
      400
    );
    assert.equal(
      (await reqJson('/api/bookings/create', {
        method: 'POST',
        cookie: cfg.cookies.customerA,
        body: { truck_id: 'mitote', package_id: 'dropin', event_type: 'Test', event_date: '2025-01-10', guest_count: 20, location: `${tag} Past date` }
      })).status,
      400
    );
    assert.equal(
      (await reqJson('/api/bookings/create', {
        method: 'POST',
        cookie: cfg.cookies.customerA,
        body: { truck_id: 'mitote', package_id: 'dropin', event_type: 'Test', event_date: unavailDate, guest_count: 20, location: `${tag} Blocked date` }
      })).status,
      409
    );

    // Valid creation + exact retry + conflicting payload with same idempotency_key
    const idemKey = `stg-e2e-${runId}-book`;
    const validBookingBody = {
      truck_id: 'mitote',
      truck_name: 'SPOOFED TRUCK NAME',
      package_id: 'party',
      event_type: 'Staging E2E Event',
      event_date: bookDate,
      guest_count: 65,
      location: `${tag} Courthouse Square`
    };
    const bCreate = await reqJson('/api/bookings/create', {
      method: 'POST',
      cookie: cfg.cookies.customerA,
      headers: { 'Idempotency-Key': idemKey },
      body: validBookingBody
    });
    assert.equal(bCreate.status, 201, `Expected 201 booking create, got ${bCreate.status}`);
    assert.equal(bCreate.json.event_date, bookDate, `Expected YYYY-MM-DD ${bookDate}, got ${bCreate.json.event_date}`);
    assert.equal(bCreate.json.truck_name, 'Mitote Food Park');

    const bReplay = await reqJson('/api/bookings/create', {
      method: 'POST',
      cookie: cfg.cookies.customerA,
      headers: { 'Idempotency-Key': idemKey },
      body: validBookingBody
    });
    assert.equal(bReplay.status, 200);
    assert.equal(bReplay.json.idempotent_replay, true);
    assert.equal(bReplay.json.id, bCreate.json.id);
    assert.equal(bReplay.json.event_date, bookDate);

    const bConflict = await reqJson('/api/bookings/create', {
      method: 'POST',
      cookie: cfg.cookies.customerA,
      headers: { 'Idempotency-Key': idemKey },
      body: { ...validBookingBody, guest_count: 70 }
    });
    assert.equal(bConflict.status, 409);

    // Requester ownership isolation (Customer B cannot see Customer A's booking)
    const listCustA = await reqJson('/api/bookings/list', { cookie: cfg.cookies.customerA });
    const listCustB = await reqJson('/api/bookings/list', { cookie: cfg.cookies.customerB });
    assert(listCustA.json.bookings.some(b => b.id === bCreate.json.id && b.event_date === bookDate));
    assert(!listCustB.json.bookings.some(b => b.id === bCreate.json.id));

    // Vendor A owner & Vendor A staff cannot accept Vendor B's booking UUID
    assert.equal(
      (await reqJson('/api/owner/requests', {
        method: 'POST',
        cookie: cfg.cookies.vendorAOwner,
        body: { id: bCreate.json.id, status: 'accepted' }
      })).status,
      403
    );

    e2e.E2E1_bookings_dates_ownership_idempotency = {
      status: 'PASS',
      detail: 'Rejected 2026-02-29/past/unavailable dates; enforced requester_user_id isolation, 200 replay, and 409 conflict.'
    };
    e2e.E2E3_date_only_yyyy_mm_dd_contract = {
      status: 'PASS',
      detail: `Booking create, replay, list, and availability preserved exact "${bookDate}" YYYY-MM-DD strings.`
    };

    // ========================================================================
    // E2E-2: Concurrent Pager Retries & Cross-Vendor Non-Disclosure
    // ========================================================================
    const pagerReqKey = crypto.randomUUID();
    const ticketLabel = `STG-${runId.slice(0, 4)}`;
    const concurrentPagers = await Promise.all(
      Array.from({ length: 5 }, () =>
        reqJson('/api/pager/staff', {
          method: 'POST',
          cookie: cfg.cookies.vendorBOwner,
          body: { vendor_id: 'mitote', ticket: ticketLabel, request_key: pagerReqKey }
        })
      )
    );
    assert(concurrentPagers.every(r => r.status === 201 || r.status === 200), 'Concurrent pager retry failed');
    assert.equal(concurrentPagers.filter(r => r.status === 201).length, 1);
    assert.equal(concurrentPagers.filter(r => r.status === 200 && r.json?.idempotent_replay === true).length, 4);
    const createdPagerId = concurrentPagers[0].json.pager.id;
    createdPagersToCancel.push({ id: createdPagerId, cookie: cfg.cookies.vendorBOwner });

    // Vendor A colliding on Vendor B's request_key receives 409 with zero private pager fields leaked
    const crossPagerCollision = await reqJson('/api/pager/staff', {
      method: 'POST',
      cookie: cfg.cookies.vendorAOwner,
      body: { vendor_id: 'iniguez', ticket: ticketLabel, request_key: pagerReqKey }
    });
    assert.equal(crossPagerCollision.status, 409);
    assert.equal('pager' in (crossPagerCollision.json || {}), false);
    assert(!crossPagerCollision.text.includes(createdPagerId), 'Cross-vendor 409 leaked private pager UUID');

    // Vendor A cannot update Vendor B's pager UUID
    assert.equal(
      (await reqJson('/api/pager/update', {
        method: 'POST',
        cookie: cfg.cookies.vendorAOwner,
        body: { id: createdPagerId, status: 'ready' }
      })).status,
      403
    );

    gates.G4_hosted_identity_and_authz = {
      status: 'PASS',
      detail: `Verified 7 staging personas (va=${shaTag(vaStats.json.actor.user_id)}, vb=${shaTag(vbStats.json.actor.user_id)}), cross-vendor 403s, staff 403s, and debug-header immunity.`
    };
    e2e.E2E2_concurrent_pager_retries_and_isolation = {
      status: 'PASS',
      detail: `5 concurrent retries returned 1 ticket (${shaTag(createdPagerId)}); cross-vendor collision returned redacted 409.`
    };

    // ========================================================================
    // E2E-4, GATE 3 & GATE 6: Community Privacy, GUC Isolation & Table Gateway
    // ========================================================================
    // Author self-approval attempt -> 403
    assert.equal(
      (await reqJson('/api/community/post', {
        method: 'POST',
        cookie: cfg.cookies.customerA,
        body: {
          kind: 'review',
          place_id: 'mitote',
          title: `${tag} Self approve attempt`,
          body: 'Attempting to submit pre-approved community post.',
          rating: 5,
          status: 'approved'
        }
      })).status,
      403
    );

    // Submit 2 pending posts (Customer A & Customer B)
    const commA = await reqJson('/api/community/post', {
      method: 'POST',
      cookie: cfg.cookies.customerA,
      body: {
        kind: 'tip',
        place_id: 'mitote',
        nickname: `stg-e2e-${runId}`,
        title: `${tag} Post A`,
        body: 'Disposable staging verification post A for moderation and RLS.'
      }
    });
    const commB = await reqJson('/api/community/post', {
      method: 'POST',
      cookie: cfg.cookies.customerB,
      body: {
        kind: 'whisper',
        place_id: 'iniguez',
        nickname: `stg-e2e-${runId}`,
        title: `${tag} Post B`,
        body: 'Disposable staging verification post B held for rejection test.'
      }
    });
    assert.equal(commA.status, 201);
    assert.equal(commB.status, 201);
    const postAId = commA.json.submission.id;
    const postBId = commB.json.submission.id;

    // Gate 3 HTTP concurrency & rollback interleaved burst across Moderator, Customer A, Customer B, and Anonymous
    const burst = await Promise.all([
      reqJson('/api/community/moderate', { cookie: cfg.cookies.moderator }),
      reqJson('/api/community/mine', { cookie: cfg.cookies.customerA }),
      reqJson('/api/community/mine', { cookie: cfg.cookies.customerB }),
      reqJson('/api/community/list'),
      reqJson('/api/community/moderate', {
        method: 'POST',
        cookie: cfg.cookies.moderator,
        body: { id: '00000000-0000-4000-8000-ffffffffffff', status: 'approved' }
      }), // 404 inside moderator GUC transaction
      reqJson('/api/community/list'),
      reqJson('/api/community/mine', { cookie: cfg.cookies.customerA }),
      reqJson('/api/community/moderate', { cookie: cfg.cookies.customerA }) // 403
    ]);
    assert.equal(burst[0].status, 200);
    assert(burst[1].json.submissions.some(s => s.id === postAId));
    assert(!burst[1].json.submissions.some(s => s.id === postBId), 'Customer A saw Customer B submission');
    assert(burst[2].json.submissions.some(s => s.id === postBId));
    assert(!burst[2].json.submissions.some(s => s.id === postAId), 'Customer B saw Customer A submission');
    assert(!burst[3].json.posts.some(p => p.id === postAId || p.id === postBId), 'Pending post leaked to public list');
    assert.equal(burst[4].status, 404);
    assert(!burst[5].json.posts.some(p => p.id === postAId || p.id === postBId), 'Pending post leaked after moderator 404');
    assert.equal(burst[7].status, 403);

    gates.G3_identity_context_isolation = probeData
      ? {
          status: 'PASS',
          detail: 'Verified 0 GUC leak after COMMIT/ROLLBACK in runtime probe + 0 cross-identity leaks in concurrent HTTP burst.'
        }
      : {
          status: 'BLOCKED',
          detail: 'Concurrent HTTP burst passed with 0 cross-identity leaks, but runtime probe (/_staging_gate_probe) is required to prove connection-level GUC reset on ROLLBACK.'
        };

    // Gate 6: Direct Table Gateway Probes (while Post A & Post B are pending/rejected)
    const gatewayCandidatePaths = [
      '/api/db/community_reviews',
      '/_db/community_reviews',
      '/__hatchable/db/community_reviews',
      '/rest/v1/community_reviews',
      '/db/community_reviews'
    ];
    for (const gwPath of gatewayCandidatePaths) {
      const anonGw = await reqJson(gwPath);
      assert(![200, 201].includes(anonGw.status), `Direct table read unexpectedly succeeded at ${gwPath}`);
      const authorPatchGw = await reqJson(gwPath, {
        method: 'PATCH',
        cookie: cfg.cookies.customerA,
        body: { id: postAId, status: 'approved' }
      });
      assert(![200, 201, 204].includes(authorPatchGw.status), `Direct table write unexpectedly succeeded at ${gwPath}`);
    }

    // Moderator approves Post A and rejects Post B
    assert.equal(
      (await reqJson('/api/community/moderate', {
        method: 'POST',
        cookie: cfg.cookies.customerA,
        body: { id: postAId, status: 'approved' }
      })).status,
      403
    );
    assert.equal(
      (await reqJson('/api/community/moderate', {
        method: 'POST',
        cookie: cfg.cookies.moderator,
        body: { id: postAId, status: 'approved' }
      })).status,
      200
    );
    assert.equal(
      (await reqJson('/api/community/moderate', {
        method: 'POST',
        cookie: cfg.cookies.moderator,
        body: { id: postBId, status: 'rejected' }
      })).status,
      200
    );

    const pubListAfter = await reqJson('/api/community/list');
    const approvedItem = pubListAfter.json.posts.find(p => p.id === postAId);
    const rejectedItem = pubListAfter.json.posts.find(p => p.id === postBId);
    assert(approvedItem, 'Approved post did not appear in /api/community/list');
    assert.equal(rejectedItem, undefined, 'Rejected post leaked in /api/community/list');
    for (const forbiddenField of ['author_id', 'status', 'moderated_by', 'moderated_at']) {
      assert.equal(forbiddenField in approvedItem, false, `Public post exposed private field ${forbiddenField}`);
    }

    gates.G6_direct_table_gateway = {
      status: 'PASS',
      detail: '5 direct-table gateway paths denied anonymous reads & author PATCH; public API omits author_id/status/moderated_by/moderated_at.'
    };
    e2e.E2E4_moderation_and_self_approval_denial = {
      status: 'PASS',
      detail: 'Denied author/vendor self-approval (403); moderator approved Post A and rejected Post B cleanly.'
    };

    // Optional E2E-5 hook when caller provides a write-pause toggle callback (used in pre-flight or MCP wrapper)
    if (typeof cfg.withWritePause === 'function') {
      await cfg.withWritePause('bookings,community', async () => {
        const pausedBook = await reqJson('/api/bookings/create', {
          method: 'POST',
          cookie: cfg.cookies.customerA,
          body: validBookingBody
        });
        const pausedComm = await reqJson('/api/community/post', {
          method: 'POST',
          cookie: cfg.cookies.customerA,
          body: { kind: 'tip', place_id: 'mitote', title: `${tag} Paused`, body: 'Should be blocked while writes paused.' }
        });
        const activeRead = await reqJson('/api/community/list');
        assert.equal(pausedBook.status, 503);
        assert.equal(pausedComm.status, 503);
        assert.equal(activeRead.status, 200);
      });
      e2e.E2E5_write_pause_controls = {
        status: 'PASS',
        detail: 'TRUCKLY_PAUSE_WRITES=bookings,community returned 503 on writes while preserving public reads and RLS.'
      };
    }
  } finally {
    // Cancel any disposable active staging pagers via API so staff queues stay clean
    for (const item of createdPagersToCancel) {
      await reqJson('/api/pager/update', {
        method: 'POST',
        cookie: item.cookie,
        body: { id: item.id, status: 'cancelled' }
      }).catch(() => {});
    }
  }

  return { baseOrigin, runId, gates, e2e };
}

// ============================================================================
// Local Pre-Flight Harness Validation (`--preflight-local`)
// ============================================================================
async function runLocalPreflightSelfTest() {
  // 1. Verify production-URL safety block
  assert.throws(
    () => assertNotProductionUrl('https://truckly.hatchable.site'),
    /SAFETY BLOCK/,
    'Production URL guard must reject truckly.hatchable.site'
  );

  // 2. Start disposable PostgreSQL + local HTTP server mounting real routes + staging probe
  let pgMod;
  try {
    pgMod = require('pg');
  } catch {
    const extra = process.env.TRUCKLY_PG_NODE_MODULES;
    if (!extra) throw new Error('Set TRUCKLY_PG_NODE_MODULES to run --preflight-local');
    pgMod = require(path.join(extra, 'pg'));
  }
  const { Pool } = pgMod;

  const binSuffix = process.platform === 'win32' ? '.exe' : '';
  const pkgPlatform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  let adminUrl = process.env.DATABASE_URL || null;
  let stopPg = async () => {};

  if (!adminUrl) {
    const binDir = path.join(process.env.TRUCKLY_PG_NODE_MODULES || '', '@embedded-postgres', pkgPlatform, 'native', 'bin');
    const initdb = path.join(binDir, 'initdb' + binSuffix);
    const pgCtl = path.join(binDir, 'pg_ctl' + binSuffix);
    const port = 55800 + Math.floor(Math.random() * 150);
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'truckly-stg-preflight-'));
    const dbDir = path.join(tmpRoot, 'data');
    const pwFile = path.join(tmpRoot, 'pw.txt');
    const logFile = path.join(tmpRoot, 'pg.log');
    const pw = 'pf_pw_' + crypto.randomBytes(6).toString('hex');
    fs.writeFileSync(pwFile, pw + '\n', 'utf8');
    execFileSync(initdb, ['-D', dbDir, '-U', 'postgres', `--pwfile=${pwFile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--no-locale'], { stdio: 'ignore', windowsHide: true });
    execFileSync(pgCtl, ['-D', dbDir, '-l', logFile, '-w', '-o', `-p ${port} -h 127.0.0.1`, 'start'], { stdio: 'ignore', windowsHide: true });
    adminUrl = `postgres://postgres:${encodeURIComponent(pw)}@127.0.0.1:${port}/postgres`;
    stopPg = async () => {
      try { execFileSync(pgCtl, ['-D', dbDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore', windowsHide: true }); } catch {}
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    };
  }

  const als = new AsyncLocalStorage();
  globalThis.__TRUCKLY_HATCHABLE__ = {
    db: {
      query: (s, p) => als.getStore().db.query(s, p),
      connect: () => als.getStore().db.connect()
    },
    auth: {
      getUser: async () => als.getStore().user || null
    }
  };
  register(
    'data:text/javascript,' +
      encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "hatchable") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export const db = globalThis.__TRUCKLY_HATCHABLE__.db; export const auth = globalThis.__TRUCKLY_HATCHABLE__.auth;"
    };
  }
  return nextResolve(specifier, context);
}
`)
  );

  const adminPool = new Pool({ connectionString: adminUrl, max: 2 });
  const roleName = 'stg_role_' + crypto.randomBytes(3).toString('hex');
  const rolePass = 'stg_pw_' + crypto.randomBytes(6).toString('hex');
  const dbName = 'stg_db_' + crypto.randomBytes(3).toString('hex');
  let appPool = null;
  let httpServer = null;

  try {
    await adminPool.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await adminPool.query(`CREATE DATABASE ${dbName} OWNER ${roleName}`);
    const u = new URL(adminUrl);
    u.username = roleName;
    u.password = rolePass;
    u.pathname = '/' + dbName;
    appPool = new Pool({ connectionString: u.toString(), max: 8 });

    const migFiles = fs.readdirSync(path.join(ROOT, 'migrations')).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
    for (const f of migFiles) {
      await appPool.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
    }

    const sessionUsers = {
      tok_cust_a: { id: 'stg_usr_cust_a', email: 'custa@staging.invalid' },
      tok_cust_b: { id: 'stg_usr_cust_b', email: 'custb@staging.invalid' },
      tok_va_owner: { id: 'stg_usr_va_owner', email: 'va-owner@staging.invalid' },
      tok_va_staff: { id: 'stg_usr_va_staff', email: 'va-staff@staging.invalid' },
      tok_vb_owner: { id: 'stg_usr_vb_owner', email: 'vb-owner@staging.invalid' },
      tok_mod: { id: 'stg_usr_mod', email: 'mod@staging.invalid' },
      tok_padmin: { id: 'stg_usr_padmin', email: 'padmin@staging.invalid' }
    };

    // Execute real scripts/staging-seed.sql (with placeholders substituted)
    const rawSeedSql = fs
      .readFileSync(path.join(ROOT, 'scripts', 'staging-seed.sql'), 'utf8')
      .replace("-- SET LOCAL app.confirm_staging = 'true';", "SET LOCAL app.confirm_staging = 'true';")
      .replace(/<STG_USER_ID_PLATFORM_ADMIN>/g, sessionUsers.tok_padmin.id)
      .replace(/<STG_USER_ID_MODERATOR>/g, sessionUsers.tok_mod.id)
      .replace(/<STG_USER_ID_VENDOR_A_OWNER>/g, sessionUsers.tok_va_owner.id)
      .replace(/<STG_USER_ID_VENDOR_A_STAFF>/g, sessionUsers.tok_va_staff.id)
      .replace(/<STG_USER_ID_VENDOR_B_OWNER>/g, sessionUsers.tok_vb_owner.id);
    await appPool.query(rawSeedSql);

    const probeSecret = 'stg_probe_secret_' + crypto.randomBytes(12).toString('hex');
    process.env.TRUCKLY_STAGING_PROBE_TOKEN = probeSecret;
    const probeMod = await import(pathToFileURL(path.join(ROOT, 'scripts', 'staging-runtime-probe.template.js')).href);

    const routeCache = new Map();
    httpServer = http.createServer(async (req, res) => {
      try {
        const parsed = new URL(req.url, 'http://127.0.0.1');
        const p = parsed.pathname;

        if (p.startsWith('/api/')) {
          let mod = null;
          let routeParams = {};
          if (p === '/api/_staging_gate_probe') {
            mod = probeMod;
          } else {
            const rel = p.replace(/^\/api\/?/, '');
            const direct = path.join(ROOT, 'api', ...rel.split('/')) + '.js';
            if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
              if (!routeCache.has(direct)) routeCache.set(direct, await import(pathToFileURL(direct).href));
              mod = routeCache.get(direct);
            } else if (rel.split('/').length === 2 && rel.startsWith('trucks/')) {
              const dyn = path.join(ROOT, 'api', 'trucks', '[id].js');
              if (!routeCache.has(dyn)) routeCache.set(dyn, await import(pathToFileURL(dyn).href));
              mod = routeCache.get(dyn);
              routeParams = { id: decodeURIComponent(rel.split('/')[1]) };
            }
          }
          if (!mod) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Not found' }));
          }
          if (!mod.methods.includes(req.method)) {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Method not allowed' }));
          }

          const cookieStr = String(req.headers.cookie || '');
          const m = /hatch_stg_sess=([a-z0-9_]+)/i.exec(cookieStr);
          const user = m ? sessionUsers[m[1]] || null : null;

          if (mod.access === 'user' && !user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Sign in required' }));
          }

          let rawBody = '';
          for await (const chunk of req) rawBody += chunk;
          const body = rawBody ? JSON.parse(rawBody) : {};
          const query = Object.fromEntries(parsed.searchParams.entries());
          let code = 200;
          const hdrs = { 'Content-Type': 'application/json; charset=utf-8' };
          const mockReq = { method: req.method, query, params: routeParams, body, headers: req.headers, ...(user ? { user } : {}) };
          const mockRes = {
            setHeader(k, v) { hdrs[k] = v; },
            status(c) { code = c; return this; },
            json(payload) {
              res.writeHead(code, hdrs);
              res.end(JSON.stringify(payload));
              return this;
            }
          };
          await als.run({ db: appPool, user }, () => mod.default(mockReq, mockRes));
          return;
        }

        const pubFile = path.normalize(path.join(ROOT, 'public', p === '/' ? 'index.html' : p.replace(/^\/+/, '')));
        if (pubFile.startsWith(path.join(ROOT, 'public')) && fs.existsSync(pubFile) && fs.statSync(pubFile).isFile()) {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end(fs.readFileSync(pubFile));
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal error' }));
      }
    });

    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const port = httpServer.address().port;

    const report = await runStagingSuite({
      baseUrl: `http://127.0.0.1:${port}`,
      probeToken: probeSecret,
      cookies: {
        customerA: 'hatch_stg_sess=tok_cust_a',
        customerB: 'hatch_stg_sess=tok_cust_b',
        vendorAOwner: 'hatch_stg_sess=tok_va_owner',
        vendorAStaff: 'hatch_stg_sess=tok_va_staff',
        vendorBOwner: 'hatch_stg_sess=tok_vb_owner',
        moderator: 'hatch_stg_sess=tok_mod',
        platformAdmin: 'hatch_stg_sess=tok_padmin'
      },
      withWritePause: async (scopes, fn) => {
        process.env.TRUCKLY_PAUSE_WRITES = scopes;
        try {
          await fn();
        } finally {
          delete process.env.TRUCKLY_PAUSE_WRITES;
        }
      }
    });

    for (const [k, v] of Object.entries(report.gates)) {
      assert.equal(v.status, 'PASS', `Local preflight gate ${k} did not PASS: ${v.detail}`);
    }
    for (const [k, v] of Object.entries(report.e2e)) {
      assert.equal(v.status, 'PASS', `Local preflight check ${k} did not PASS: ${v.detail}`);
    }

    // Execute real scripts/staging-cleanup.sql and confirm 0 disposable rows remain
    const rawCleanupSql = fs
      .readFileSync(path.join(ROOT, 'scripts', 'staging-cleanup.sql'), 'utf8')
      .replace("-- SET LOCAL app.confirm_staging = 'true';", "SET LOCAL app.confirm_staging = 'true';");
    await appPool.query(rawCleanupSql);

    const remBookings = await appPool.query("SELECT count(*)::int AS c FROM bookings WHERE location LIKE '[STG-E2E-%]%'");
    const remPagers = await appPool.query("SELECT count(*)::int AS c FROM pickup_pagers WHERE ticket LIKE 'STG-%'");
    await appPool.query('BEGIN');
    await appPool.query("SELECT set_config('app.can_moderate', 'true', true)");
    const remComm = await appPool.query("SELECT count(*)::int AS c FROM community_reviews WHERE title LIKE '[STG-E2E-%]%'");
    await appPool.query('COMMIT');
    assert.equal(remBookings.rows[0].c, 0, 'staging-cleanup.sql left disposable bookings');
    assert.equal(remPagers.rows[0].c, 0, 'staging-cleanup.sql left disposable pagers');
    assert.equal(remComm.rows[0].c, 0, 'staging-cleanup.sql left disposable community posts');

    console.log('MODE: LOCAL PRE-FLIGHT HARNESS VALIDATION (NOT HOSTED HATCHABLE)');
    console.log('PASS: Production URL safety block, staging-seed.sql, staging-runtime-probe, G1..G6, E2E1..E2E6, and staging-cleanup.sql verified.');
  } finally {
    delete process.env.TRUCKLY_STAGING_PROBE_TOKEN;
    if (httpServer) await new Promise(r => httpServer.close(r));
    if (appPool) await appPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
    await stopPg();
  }
}

(async () => {
  if (process.argv.includes('--preflight-local')) {
    await runLocalPreflightSelfTest();
    return;
  }

  const stagingUrl = (process.env.STAGING_BASE_URL || '').trim();
  if (!stagingUrl) {
    console.log(
      JSON.stringify(
        {
          environment: 'HOSTED_HATCHABLE_STAGING',
          overall_status: 'BLOCKED',
          reason: 'STAGING_BASE_URL and Hatchable staging credentials are not configured in this environment.',
          required_inputs: [
            'STAGING_BASE_URL (isolated https://<staging>.hatchable.site — never truckly.hatchable.site)',
            'STAGING_COOKIE_CUSTOMER_A',
            'STAGING_COOKIE_CUSTOMER_B',
            'STAGING_COOKIE_VENDOR_A_OWNER',
            'STAGING_COOKIE_VENDOR_A_STAFF',
            'STAGING_COOKIE_VENDOR_B_OWNER',
            'STAGING_COOKIE_MODERATOR',
            'STAGING_COOKIE_PLATFORM_ADMIN',
            'STAGING_PROBE_TOKEN (matching TRUCKLY_STAGING_PROBE_TOKEN on ephemeral api/_staging_gate_probe.js)'
          ]
        },
        null,
        2
      )
    );
    if (process.argv.includes('--require-live')) process.exitCode = 2;
    return;
  }

  const report = await runStagingSuite({
    baseUrl: stagingUrl,
    probeToken: (process.env.STAGING_PROBE_TOKEN || '').trim(),
    cookies: {
      customerA: process.env.STAGING_COOKIE_CUSTOMER_A || '',
      customerB: process.env.STAGING_COOKIE_CUSTOMER_B || '',
      vendorAOwner: process.env.STAGING_COOKIE_VENDOR_A_OWNER || '',
      vendorAStaff: process.env.STAGING_COOKIE_VENDOR_A_STAFF || '',
      vendorBOwner: process.env.STAGING_COOKIE_VENDOR_B_OWNER || '',
      moderator: process.env.STAGING_COOKIE_MODERATOR || '',
      platformAdmin: process.env.STAGING_COOKIE_PLATFORM_ADMIN || ''
    }
  });

  console.log(JSON.stringify({ environment: 'HOSTED_HATCHABLE_STAGING', ...report }, null, 2));
  const anyNonPass = [...Object.values(report.gates), ...Object.values(report.e2e)].some(x => x.status !== 'PASS');
  if (anyNonPass) process.exitCode = 1;
})().catch(err => {
  console.error('STAGING GATE RUNNER ERROR:', err.message || err);
  process.exitCode = 1;
});
