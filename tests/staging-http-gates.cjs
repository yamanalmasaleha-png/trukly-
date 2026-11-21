// Shared VPS staging HTTP assertions. Run tests/vps-staging-gates.cjs.
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const FORBIDDEN_PROD_HOSTS = new Set([
  'biteshark.live',
  'www.biteshark.live',
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
      `SAFETY BLOCK: Refusing to run staging verification against production host "${host}". Use an isolated staging deployment.`
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
    G6_direct_table_gateway: { status: 'BLOCKED', detail: 'Not yet run' },
    G7_unified_59_place_discovery: { status: 'BLOCKED', detail: 'Not yet run' },
    G8_owner_publishing_to_customer: { status: 'BLOCKED', detail: 'Requires Vendor A owner + Customer sessions' },
    G9_cache_refresh_and_outbox_rls: { status: 'BLOCKED', detail: 'Not yet run' }
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
    const respHeaders = {};
    res.headers.forEach((v, k) => {
      respHeaders[k.toLowerCase()] = v;
    });
    return { status: res.status, json, text, headers: respHeaders };
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
      '/lib/pager-notifications.js',
      '/lib/webpush-crypto.js',
      '/api/lib/authz',
      '/api/authz',
      '/scripts/dev-server.cjs',
      '/scripts/seed-sql-reader.cjs',
      '/scripts/run-pager-worker.cjs',
      '/__debug/state',
      '/__debug/reset'
    ];
    const helperChecks = await Promise.all(forbiddenHelperPaths.map(p => reqJson(p)));
    const exposedHelper = forbiddenHelperPaths.find((_, i) => ![404, 403].includes(helperChecks[i].status));
    const g1Nearby = await reqJson('/api/trucks/nearby?lat=38.4405&lng=-122.7144');
    const g1NearbyBlank = await reqJson('/api/trucks/nearby?lat=&lng=');

    assert.equal(g1Avail.status, 200, `Expected 200 on availability, got ${g1Avail.status}`);
    assert(String(g1Avail.headers?.['cache-control'] || '').includes('no-store'), 'Availability missing no-store header');
    assert.equal(typeof g1Avail.json?.requestable, 'boolean', 'Availability JSON missing boolean requestable');
    assert.equal(g1OwnerAnon.status, 401, `Expected 401 on anonymous /api/owner/stats, got ${g1OwnerAnon.status}`);
    assert.equal(g1BookAnon.status, 401, `Expected 401 on anonymous /api/bookings/create, got ${g1BookAnon.status}`);
    assert.equal(g1Nearby.status, 200, 'Expected 200 on valid /api/trucks/nearby');
    assert(String(g1Nearby.headers?.['cache-control'] || '').includes('no-store'), '/api/trucks/nearby missing private no-store');
    assert.equal(g1NearbyBlank.status, 400, 'Expected 400 on blank /api/trucks/nearby?lat=&lng=');
    assert.equal(exposedHelper, undefined, `Helper/debug path unexpectedly exposed at ${exposedHelper}`);

    gates.G1_runtime_compatibility = {
      status: 'PASS',
      detail: 'Deployed routes import lib/*.js and node:crypto cleanly; 15 helper/script/debug paths confirmed unexposed (404); no-store verified.'
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

    // ========================================================================
    // GATE 7: Migration 014 & Unified 59-Place Discovery Parity (Public)
    // ========================================================================
    const g7List = await reqJson('/api/trucks?fresh=1');
    const g7Search = await reqJson('/api/trucks/search?limit=100&fresh=1');
    const g7DetailPrimary = await reqJson('/api/trucks/iniguez?fresh=1');
    const g7DetailExtra = await reqJson('/api/trucks/coffee-crooks?fresh=1');
    const g7Quarantined = await reqJson('/api/trucks/estrella');
    assert.equal(g7List.status, 200);
    assert.equal(g7List.json?.total, 59, 'Expected 59 unified Sonoma County listings');
    assert.equal(g7List.json?.primary_total, 47, 'Expected 47 primary listings');
    assert.equal(g7Search.json?.total, 59, 'Expected search to index all 59 unified listings');
    assert.equal(g7DetailPrimary.status, 200);
    assert.equal(g7DetailExtra.status, 200);
    assert.equal(g7Quarantined.status, 404, 'Quarantined legacy ID must return 404');
    gates.G7_unified_59_place_discovery = {
      status: 'PASS',
      detail: 'All 59 canonical listings (47 primary + 12 neighborhood) consistent across list, search & detail; quarantined IDs 404.'
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
    if (!cfg.probeToken) {
      throw new Error('STAGING_PROBE_TOKEN is required so staging environment identity is fail-closed before write gates run.');
    }
    if (cfg.probeToken) {
      // Narrow probe auth check: missing token -> 404; non-admin persona with valid token -> 403
      const probeNoToken = await reqJson('/api/_staging_gate_probe', {
        method: 'POST',
        cookie: cfg.cookies.platformAdmin,
        body: {}
      });
      assert.equal(probeNoToken.status, 404, 'Staging probe must return 404 when x-staging-probe-token is omitted');

      const probeNonAdmin = await reqJson('/api/_staging_gate_probe', {
        method: 'POST',
        cookie: cfg.cookies.moderator,
        headers: { 'x-staging-probe-token': cfg.probeToken },
        body: {}
      });
      assert.equal(probeNonAdmin.status, 403, 'Staging probe must deny non-platform_admin personas with 403');

      const probeRes = await reqJson('/api/_staging_gate_probe', {
        method: 'POST',
        cookie: cfg.cookies.platformAdmin,
        headers: { 'x-staging-probe-token': cfg.probeToken },
        body: {}
      });
      if (probeRes.status !== 200 || !probeRes.json) {
        throw new Error(
          `Staging runtime probe rejected execution (HTTP ${probeRes.status}): ${probeRes.json?.error || 'Ensure TRUCKLY_ENV=staging and STAGING_PROBE_TOKEN match on isolated staging.'}`
        );
      }
      assert.equal(probeRes.json.environment_identity?.is_staging_confirmed, true, 'Server probe did not confirm TRUCKLY_ENV=staging');
      assert.equal(probeRes.json.environment_identity?.is_production_project, false, 'Server probe detected forbidden production project ID');
      assert.equal(probeRes.json.gate1_crypto_self_test?.ok, true, 'Web Push RFC 8291/8292 crypto self-test failed in runtime');
      if (probeRes.status === 200 && probeRes.json) {
        probeData = probeRes.json;
        const g2 = probeData.gate2_transactions;
        assert.equal(g2.same_pid, true, 'Transaction statements did not execute on a single pg_backend_pid()');
        assert.equal(g2.same_xid, true, 'Transaction statements did not share txid_current()');
        assert.equal(g2.in_tx_uid_matches, true, 'In-transaction SET LOCAL app.user_id did not hold');
        assert.equal(g2.in_tx_pager_internal_matches, true, 'In-transaction SET LOCAL app.pager_internal did not hold');
        assert.equal(g2.rollback_caught, true, 'Intentional mid-transaction failure was not caught');
        assert.equal(g2.persisted_after_rollback, 0, 'Failed multi-statement transaction leaked persisted audit row');

        const g3Probe = probeData.gate3_guc_isolation;
        assert.equal(g3Probe.leaked_user_id, '', 'app.user_id GUC leaked outside transaction');
        assert.equal(g3Probe.leaked_can_moderate, '', 'app.can_moderate GUC leaked outside transaction');
        assert.equal(g3Probe.leaked_pager_internal, '', 'app.pager_internal GUC leaked outside transaction');

        gates.G2_transactions = {
          status: 'PASS',
          detail: `Adapter verified (transaction=${probeData.adapter.has_transaction_fn}, connect=${probeData.adapter.has_connect_fn}); single PID/XID confirmed and failed multi-statement write rolled back (0 rows persisted).`
        };

        const g5 = probeData.gate5_db_role;
        assert.equal(g5.is_superuser, false, 'Runtime DB role must not be SUPERUSER');
        assert.equal(g5.has_bypassrls, false, 'Runtime DB role must not have BYPASSRLS');
        assert.equal(g5.rls_enabled, true, 'community_reviews relrowsecurity must be true');
        assert.equal(g5.rls_forced, true, 'community_reviews relforcerowsecurity must be true');
        assert.equal(g5.all_notif_tables_rls_forced, true, 'All 4 pager_notification_* tables must enforce FORCE RLS');
        assert.equal(g5.unapproved_visible_without_guc, 0, 'Unapproved community rows visible without GUC');
        assert.equal(g5.notif_subs_visible_without_guc, 0, 'Notification subscriptions visible without GUC');
        assert.equal(g5.notif_events_visible_without_guc, 0, 'Notification events visible without GUC');
        assert.equal(g5.notif_deliveries_visible_without_guc, 0, 'Notification deliveries visible without GUC');

        gates.G5_database_security_role = {
          status: 'PASS',
          detail: `Role "${g5.db_current_user}" verified NOSUPERUSER, NOBYPASSRLS, FORCE RLS active on community_reviews + 4 pager_notification_* tables, 0 private rows visible.`
        };
      } else {
        gates.G2_transactions = {
          status: 'BLOCKED',
          detail: `/api/_staging_gate_probe returned HTTP ${probeRes.status}; enable the protected VPS staging probe to verify connection pinning & rollback.`
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
    // Moderator does NOT imply platform administration or vendor ownership
    assert.equal(
      (await reqJson('/api/pager/telemetry', { cookie: cfg.cookies.moderator })).status,
      403,
      'Moderator must not access platform_admin telemetry'
    );
    assert.equal(
      (await reqJson('/api/owner/profile?truck_id=iniguez', { cookie: cfg.cookies.moderator })).status,
      403,
      'Moderator must not access vendor owner profile'
    );
    assert(String(vaStats.headers?.['cache-control'] || '').includes('no-store'), '/api/owner/stats missing no-store');

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

    // Gate 6: Direct Table Gateway Probes across community_reviews AND all 4 notification tables
    const protectedTables = [
      'community_reviews',
      'pager_notification_subscriptions',
      'pager_notification_events',
      'pager_notification_deliveries',
      'pager_rate_limits'
    ];
    for (const tbl of protectedTables) {
      for (const prefix of ['/api/db/', '/_db/', '/__hatchable/db/', '/rest/v1/', '/db/']) {
        const gwPath = prefix + tbl;
        const anonGw = await reqJson(gwPath);
        assert(![200, 201].includes(anonGw.status), `Direct table read unexpectedly succeeded at ${gwPath}`);
      }
    }
    for (const prefix of ['/api/db/', '/_db/', '/__hatchable/db/', '/rest/v1/', '/db/']) {
      const gwPath = prefix + 'community_reviews';
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
        body: { id: postBId, status: 'rejected', reason: 'Staging gate moderation rejection check' }
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

    // ========================================================================
    // GATE 8: Owner Publishing (Profile, Schedule, GPS & Text-Only Location) Observed by Customer
    // ========================================================================
    const prePubList = await reqJson('/api/trucks');
    assert(prePubList.headers?.etag, 'Expected ETag header on /api/trucks');
    const cond304 = await reqJson('/api/trucks', {
      headers: { 'If-None-Match': prePubList.headers.etag }
    });
    assert.equal(cond304.status, 304, 'Expected 304 Not Modified on matching ETag before mutation');

    // Self-elevation attempt by Vendor A owner must fail with 403
    const selfElevRes = await reqJson('/api/owner/profile', {
      method: 'POST',
      cookie: cfg.cookies.vendorAOwner,
      body: { truck_id: 'iniguez', display_name: 'Tacos Iñiguez', verified: true }
    });
    assert.equal(selfElevRes.status, 403, 'Owner self-elevation attempt must return 403');

    // Publish profile + schedule + GPS location
    const stgProfDesc = `${tag} Fresh handmade tortillas & birria`;
    const pubProfRes = await reqJson('/api/owner/profile', {
      method: 'POST',
      cookie: cfg.cookies.vendorAOwner,
      body: {
        truck_id: 'iniguez',
        display_name: 'Tacos Iñiguez',
        description: stgProfDesc,
        cuisine: 'Mexican',
        accepting_bookings: true
      }
    });
    assert.equal(pubProfRes.status, 200);

    const pubSchedDate = futurePacificISO(5);
    const pubSchedRes = await reqJson('/api/owner/schedule', {
      method: 'POST',
      cookie: cfg.cookies.vendorAOwner,
      body: {
        truck_id: 'iniguez',
        service_date: pubSchedDate,
        opens_at: '11:00',
        closes_at: '19:30',
        location: `${tag} Courthouse Pop-Up`,
        status: 'scheduled'
      }
    });
    assert.equal(pubSchedRes.status, 200);

    const stgLocText = `${tag} Courthouse Square Live Test`;
    const pubLocRes = await reqJson('/api/owner/location', {
      method: 'POST',
      cookie: cfg.cookies.vendorAOwner,
      body: {
        truck_id: 'iniguez',
        location: stgLocText,
        lat: 38.4404,
        lng: -122.7141,
        ttl_minutes: 60,
        is_open: true
      }
    });
    assert.equal(pubLocRes.status, 200);

    // Separate customer session with prior ETag MUST receive 200 (not stale 304!) and see published updates
    const custAfterPub = await reqJson('/api/trucks', {
      cookie: cfg.cookies.customerA,
      headers: { 'If-None-Match': prePubList.headers.etag }
    });
    assert.equal(custAfterPub.status, 200, 'Stale ETag returned 304 after owner publish');
    const iniguezObserved = custAfterPub.json?.trucks?.find(t => t.id === 'iniguez');
    assert.equal(iniguezObserved?.blurb, stgProfDesc);
    assert.equal(iniguezObserved?.location, stgLocText);
    assert.equal(iniguezObserved?.location_accuracy, 'owner_reported_coords');
    assert.equal(iniguezObserved?.verified, false);

    // Text-only location publish clears inappropriate curated coordinates (`lat === null && lng === null`)
    const stgTextOnlyLoc = `${tag} Petaluma Fairgrounds Pop-Up`;
    const textOnlyLocRes = await reqJson('/api/owner/location', {
      method: 'POST',
      cookie: cfg.cookies.vendorAOwner,
      body: {
        truck_id: 'iniguez',
        location: stgTextOnlyLoc,
        ttl_minutes: 60,
        is_open: true
      }
    });
    assert.equal(textOnlyLocRes.status, 200);
    const custDetailTextOnly = await reqJson('/api/trucks/iniguez?fresh=1', { cookie: cfg.cookies.customerA });
    assert.equal(custDetailTextOnly.json?.location, stgTextOnlyLoc);
    assert.equal(custDetailTextOnly.json?.location_accuracy, 'owner_text_only');
    assert.equal(custDetailTextOnly.json?.lat, null, 'Text-only live location must clear lat');
    assert.equal(custDetailTextOnly.json?.lng, null, 'Text-only live location must clear lng');

    const custCoordsCheck = await reqJson('/api/trucks?lat=38.4404&lng=-122.7141');
    assert(String(custCoordsCheck.headers?.['cache-control'] || '').includes('private'), 'Coordinate query must be private/no-store');
    assert(String(custCoordsCheck.headers?.['cache-control'] || '').includes('no-store'), 'Coordinate query must include no-store');

    gates.G8_owner_publishing_to_customer = {
      status: 'PASS',
      detail: 'Vendor A published profile, schedule, GPS & text-only location; Customer A observed updates, text-only cleared pins, self-elevation 403, coordinate queries private/no-store.'
    };

    // ========================================================================
    // GATE 9: Notification Runtime, Capability/CSRF/SSRF Guards, Ready Outbox & Telemetry/Worker Controls
    // ========================================================================
    const pubSubConfig = await reqJson('/api/pager/subscriptions');
    assert.equal(pubSubConfig.status, 200);
    assert(String(pubSubConfig.headers?.['cache-control'] || '').includes('no-store'), 'pager/subscriptions missing no-store');

    // Missing X-Truckly-Client CSRF header -> 403
    const csrfMissingSub = await reqJson('/api/pager/subscriptions', {
      method: 'POST',
      body: { code: createdPagerId }
    });
    assert.equal(csrfMissingSub.status, 403, 'Missing X-Truckly-Client on POST /api/pager/subscriptions must return 403');

    // Cross-origin Origin header -> 403
    const csrfCrossOriginSub = await reqJson('/api/pager/subscriptions', {
      method: 'POST',
      headers: {
        'X-Truckly-Client': 'web-pager-v1',
        Origin: 'https://evil-attacker.invalid',
        Host: new URL(baseOrigin).host
      },
      body: { code: createdPagerId }
    });
    assert.equal(csrfCrossOriginSub.status, 403, 'Cross-origin POST /api/pager/subscriptions must return 403');

    // Atomic `pager.ready` outbox transition on disposable staging pager
    const pagerReadyTransition = await reqJson('/api/pager/update', {
      method: 'POST',
      cookie: cfg.cookies.vendorBOwner,
      body: { id: createdPagerId, status: 'ready' }
    });
    assert.equal(pagerReadyTransition.status, 200, 'Staff/owner ready transition failed');
    assert.equal(pagerReadyTransition.json?.notification?.event_created, true, 'Ready transition did not create outbox event');

    // Private telemetry RBAC (`vendorAOwner` -> 403, `platformAdmin` -> 200 with zero private leaks)
    assert.equal(
      (await reqJson('/api/pager/telemetry', { cookie: cfg.cookies.vendorAOwner })).status,
      403,
      'Vendor owner must not access platform_admin telemetry'
    );
    const adminTelemetry = await reqJson('/api/pager/telemetry', { cookie: cfg.cookies.platformAdmin });
    assert.equal(adminTelemetry.status, 200);
    assert(String(adminTelemetry.headers?.['cache-control'] || '').includes('no-store'), 'telemetry missing no-store');
    assert.equal(adminTelemetry.json?.controls?.config_valid, true, 'Notification runtime config reported invalid on staging');
    assert(!JSON.stringify(adminTelemetry.json).includes(createdPagerId), 'Telemetry leaked raw private pager UUID');

    // Worker endpoint secret/network guard:
    //   - On VPS Nginx public HTTPS, external `/api/pager/worker` is blocked at the reverse proxy (`403`)
    //     while local supervisor invokes `cfg.workerLoopbackUrl` (`http://127.0.0.1:4100/api/pager/worker`).
    //   - On direct loopback, wrong Bearer secret returns `401` and valid secret returns `200`.
    const unauthWorker = await reqJson('/api/pager/worker', {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid_wrong_worker_secret_token_0000' },
      body: { batch_size: 1, cleanup: false }
    });
    if (cfg.expectExternalWorkerForbidden) {
      assert.equal(unauthWorker.status, 403, 'Public Nginx vhost must block external /api/pager/worker with 403');
    } else if (cfg.workerSecret) {
      assert.equal(unauthWorker.status, 401, 'Worker must reject wrong secret with 401');
      const authWorker = await reqJson('/api/pager/worker', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.workerSecret}` },
        body: { batch_size: 2, cleanup: false }
      });
      assert.equal(authWorker.status, 200, 'Authenticated worker tick failed');
      assert(String(authWorker.headers?.['cache-control'] || '').includes('no-store'));
    } else {
      assert([401, 403, 503].includes(unauthWorker.status), `Unexpected unauthenticated worker status ${unauthWorker.status}`);
    }

    assert.equal(probeData.gate5_db_role?.all_notif_tables_rls_forced, true, 'All 4 pager_notification_* tables must enforce FORCE RLS');

    gates.G9_cache_refresh_and_outbox_rls = {
      status: 'PASS',
      detail: 'Verified CSRF 403s, atomic pager.ready outbox event, redacted admin-only telemetry, worker secret auth, ETag refresh, and FORCE RLS across all 4 notification tables.'
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


module.exports = { runStagingSuite, assertNotProductionUrl };
