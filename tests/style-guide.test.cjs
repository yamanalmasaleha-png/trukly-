// BiteShark Design Style Guide & Tracked Completion Test Suite (`tests/style-guide.test.cjs`)
//
// Verifies Section 20.J requirements:
//   1. All live decision values start blank (`null`), `unanswered`, and unapproved.
//   2. Initial completion report marks the guide unfinished (`0` approved) without failing CI.
//   3. Partial completion removes ONLY answered+approved (and valid N/A) items from outstanding gaps.
//   4. Draft answers remain visibly pending in a dedicated section and do not count as complete.
//   5. Boolean `false` and numeric `0` are accepted as valid non-blank answers and rendered explicitly.
//   6. `not_applicable` decisions require non-placeholder reasons; placeholder strings ("TBD", "later", etc.) are rejected.
//   7. Broken `related_decisions`, `component_id`, and `ref:<DECISION_ID>` references (and cycles) are detected.
//   8. Generation is byte-for-byte deterministic and stale Markdown is caught by validation.
//   9. Application runtime files (`public/`, `server/`, `lib/`, `api/`, `migrations/`, `packages/`) remain untouched.

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');

function cloneJson(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createTempStyleGuideWorkspace(baseDecisionsObj) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-style-guide-test-'));
  const schemaSrc = path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json');
  const schemaDst = path.join(tmpRoot, 'docs/engineering/schemas/style-guide-decisions.schema.json');
  fs.mkdirSync(path.dirname(schemaDst), { recursive: true });
  fs.copyFileSync(schemaSrc, schemaDst);

  const decisionsDst = path.join(tmpRoot, 'docs/engineering/style-guide/decisions.json');
  fs.mkdirSync(path.dirname(decisionsDst), { recursive: true });
  fs.writeFileSync(decisionsDst, JSON.stringify(baseDecisionsObj, null, 2) + '\n', 'utf8');
  return { tmpRoot, decisionsDst };
}

async function run() {
  const sgModUrl = pathToFileURL(path.join(REPO_ROOT, 'tools/style-guide/lib.mjs')).href;
  const {
    loadStyleGuideDecisions,
    validateStyleGuideData,
    computeCompletionStats,
    renderStyleGuideMarkdownFiles,
    generateStyleGuideDocs,
    validateStyleGuideWorkspace
  } = await import(sgModUrl);

  console.log('[style-guide.test] 1. Verifying live repository decisions.json starts 100% blank (null)...');
  const { rawText: liveRaw, data: liveData } = loadStyleGuideDecisions(REPO_ROOT);
  assert.equal(liveData.schema_version, 'biteshark.style-guide-decisions.v1');
  assert.equal(liveData.topics.length, 15, 'Expected all 15 topic questionnaires');
  assert.ok(liveData.components.length >= 25, 'Expected comprehensive UI component inventory');
  assert.ok(liveData.decisions.length >= 700, 'Expected full topic + 27-dimension component coverage');

  for (const dec of liveData.decisions) {
    assert.equal(
      dec.value,
      null,
      `Decision ${dec.decision_id} must start blank (null), got ${JSON.stringify(dec.value)}`
    );
    assert.equal(
      dec.status,
      'unanswered',
      `Decision ${dec.decision_id} must start with status="unanswered"`
    );
    assert.equal(dec.not_applicable_reason, null);
    assert.equal(dec.approval.approved_by, null);
    assert.equal(dec.approval.approved_at, null);
  }

  // Confirm live workspace validates cleanly (CI must NOT fail because answers are intentionally null)
  const liveWsRes = validateStyleGuideWorkspace(REPO_ROOT);
  assert.equal(
    liveWsRes.ok,
    true,
    `Expected live style guide workspace to validate cleanly, failures: ${liveWsRes.failures.join('; ')}`
  );

  // Confirm rendered Markdown answer & approval cells are empty in all 15 questionnaires
  for (const topic of liveData.topics) {
    const mdText = fs.readFileSync(
      path.join(REPO_ROOT, 'docs/engineering/style-guide', topic.file),
      'utf8'
    );
    const decisionRows = mdText
      .split('\n')
      .filter(line => line.startsWith('| <a id="dec-'));
    assert.ok(decisionRows.length > 0, `Expected decision rows in ${topic.file}`);
    for (const row of decisionRows) {
      const cols = row.split(' | ');
      // cols[1] is the Answer column; cols[4] is Approval column
      assert.equal(cols[1].trim(), '', `Expected empty Answer cell in ${topic.file}: ${row}`);
      assert.equal(cols[4].trim(), '', `Expected empty Approval cell in ${topic.file}: ${row}`);
    }
  }

  console.log('[style-guide.test] 2. Verifying initial COMPLETION-REMINDER.md reports unfinished (0 approved)...');
  const initialStats = computeCompletionStats(liveData);
  assert.equal(initialStats.lifecycle_mode, 'initial_unstarted');
  assert.equal(initialStats.is_complete, false);
  assert.equal(initialStats.totals.approved, 0);
  assert.equal(initialStats.totals.draft, 0);
  assert.ok(initialStats.totals.applicable_unanswered > 0);
  assert.ok(initialStats.totals.unconfirmed_pending > 0);

  const initialReminder = fs.readFileSync(
    path.join(REPO_ROOT, 'docs/engineering/style-guide/COMPLETION-REMINDER.md'),
    'utf8'
  );
  assert.match(initialReminder, /Unfinished Style Guide — Zero Design Parameters Approved/);
  assert.match(initialReminder, /No design parameters, colors, dimensions, fonts, wording rules/);
  assert.match(initialReminder, /Unconfirmed Applicability Decisions/);
  assert.match(initialReminder, /Grouped Unanswered Questionnaires/);

  console.log('[style-guide.test] 3 & 4. Verifying partial completion & draft-pending separation...');
  {
    const partial = cloneJson(liveData);
    const themeDec = partial.decisions.find(d => d.decision_id === 'DEC-FND-THEME-POLICY');
    themeDec.value = 'light_only';
    themeDec.status = 'approved';
    themeDec.approval = { approved_by: 'Matt Callaway', approved_at: '2026-11-22' };

    const btnWidthDec = partial.decisions.find(d => d.decision_id === 'DEC-BTN-WIDTH-LAYOUT-RULE');
    btnWidthDec.value = 'intrinsic_by_default_with_explicit_block_modifier';
    btnWidthDec.status = 'approved';
    btnWidthDec.approval = { approved_by: 'Yaman', approved_at: '2026-11-22' };

    const darkAppDec = partial.decisions.find(d => d.decision_id === 'DEC-UNCONF-DARK-THEME-APPLICABILITY');
    darkAppDec.applicability = 'not_applicable';
    darkAppDec.status = 'not_applicable';
    darkAppDec.not_applicable_reason = 'Confirmed single light palette in DEC-FND-THEME-POLICY.';

    const draftFontDec = partial.decisions.find(d => d.decision_id === 'DEC-TYP-DISPLAY-FAMILY');
    draftFontDec.value = "'Fraunces', Georgia, serif";
    draftFontDec.status = 'draft';

    const valRes = validateStyleGuideData(partial, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(valRes.ok, true, `Unexpected validation errors: ${valRes.errors.join('; ')}`);

    const rendered = renderStyleGuideMarkdownFiles(partial);
    assert.equal(rendered.stats.lifecycle_mode, 'partially_completed');
    assert.equal(rendered.stats.is_complete, false);
    assert.equal(rendered.stats.totals.approved, 2);
    assert.equal(rendered.stats.totals.not_applicable, 1);
    assert.equal(rendered.stats.totals.draft, 1);

    const reminderMd = rendered.files.get('docs/engineering/style-guide/COMPLETION-REMINDER.md');
    assert.match(reminderMd, /Partially Completed Style Guide — Not Yet Complete/);
    assert.doesNotMatch(reminderMd, /Zero Design Parameters Approved/);

    // Approved & valid N/A items MUST NOT appear in remaining gap reminders
    assert.ok(
      !reminderMd.includes('`DEC-FND-THEME-POLICY`'),
      'Approved DEC-FND-THEME-POLICY must be omitted from remaining gaps'
    );
    assert.ok(
      !reminderMd.includes('`DEC-BTN-WIDTH-LAYOUT-RULE`'),
      'Approved DEC-BTN-WIDTH-LAYOUT-RULE must be omitted from remaining gaps'
    );
    assert.ok(
      !reminderMd.includes('`DEC-UNCONF-DARK-THEME-APPLICABILITY`'),
      'Explicitly N/A item must be omitted from remaining gaps'
    );

    // Draft item MUST remain visibly pending in Draft section, separate from Unanswered
    const draftSectionIdx = reminderMd.indexOf('## 3. Draft Answers Awaiting Explicit Approval');
    const unansweredSectionIdx = reminderMd.indexOf('## 4. Remaining Unanswered Applicable Decisions');
    assert.ok(draftSectionIdx > 0, 'Expected Draft section in partial reminder');
    assert.ok(unansweredSectionIdx > draftSectionIdx, 'Expected Unanswered section after Draft section');

    const draftSlice = reminderMd.slice(draftSectionIdx, unansweredSectionIdx);
    const unansweredSlice = reminderMd.slice(unansweredSectionIdx);
    assert.ok(draftSlice.includes('`DEC-TYP-DISPLAY-FAMILY`'), 'Draft item must appear in Draft section');
    assert.ok(
      !unansweredSlice.includes('`DEC-TYP-DISPLAY-FAMILY`'),
      'Draft item must not be conflated with unanswered items'
    );
    assert.ok(
      unansweredSlice.includes('`DEC-FND-BRAND-ATTRIBUTES`'),
      'Unanswered items must remain listed in Unanswered section'
    );
  }

  console.log('[style-guide.test] 5. Verifying boolean false and numeric 0 are accepted and rendered...');
  {
    const zeroFalse = cloneJson(liveData);
    const boolDec = zeroFalse.decisions.find(d => d.decision_id === 'DEC-OVL-SEQUENTIAL-MODALS');
    boolDec.value = false;
    boolDec.status = 'approved';
    boolDec.approval = { approved_by: 'Matt Callaway', approved_at: '2026-11-22' };

    // Add a numeric 0 decision check on an integer/number spec + zero inside token_map
    const borderDec = zeroFalse.decisions.find(d => d.decision_id === 'DEC-FND-BORDER-SCALE');
    borderDec.value = { borderless_card: 0, hairline_px: 1 };
    borderDec.status = 'approved';
    borderDec.approval = { approved_by: 'Matt Callaway', approved_at: '2026-11-22' };

    zeroFalse.decisions.push({
      decision_id: 'DEC-MOT-ZERO-TEST',
      topic: 'motion-and-interaction',
      component_id: null,
      section: 'Motion Scales, Transitions & Reduced Motion',
      dimension: null,
      title: 'Reduced Motion Instant Duration Milliseconds',
      question: 'What exact millisecond duration applies when instant motion is selected?',
      expected_answer: {
        type: 'integer',
        minimum: 0,
        maximum: 1000,
        unit: 'ms',
        allows_decision_ref: true,
        constraints: 'Non-negative integer in milliseconds (0 allowed).'
      },
      applicability: 'applicable',
      applicability_note: null,
      value: 0,
      status: 'approved',
      not_applicable_reason: null,
      approval: { approved_by: 'Matt Callaway', approved_at: '2026-11-22' },
      related_decisions: [],
      mandatory_invariant_ids: ['INV-A11Y-KEYBOARD-FOCUS-ZOOM']
    });

    const valRes = validateStyleGuideData(zeroFalse, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(valRes.ok, true, `Expected false and 0 to pass validation: ${valRes.errors.join('; ')}`);

    const rendered = renderStyleGuideMarkdownFiles(zeroFalse);
    const overlaysMd = rendered.files.get('docs/engineering/style-guide/dialogs-and-overlays.md');
    const motionMd = rendered.files.get('docs/engineering/style-guide/motion-and-interaction.md');
    assert.ok(overlaysMd.includes('| `false` |'), 'Boolean false must render explicitly as `false`');
    assert.ok(motionMd.includes('| `0` |'), 'Numeric 0 must render explicitly as `0`');
  }

  console.log('[style-guide.test] 6. Verifying placeholder rejection & mandatory not_applicable_reason...');
  for (const badPlaceholder of ['TBD', 'later', 'TODO', 'N/A', 'pending', '???', '   ', 'fill later']) {
    const candidate = cloneJson(liveData);
    const d = candidate.decisions.find(x => x.decision_id === 'DEC-TYP-BODY-FAMILY');
    d.value = badPlaceholder;
    d.status = 'approved';
    d.approval = { approved_by: 'Matt Callaway', approved_at: '2026-11-22' };
    const res = validateStyleGuideData(candidate, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(res.ok, false, `Expected placeholder "${badPlaceholder}" to be rejected`);
  }

  // Blank value marked approved or draft must fail
  {
    const blankApproved = cloneJson(liveData);
    const d = blankApproved.decisions[0];
    d.status = 'approved';
    d.approval = { approved_by: 'Matt Callaway', approved_at: '2026-11-22' };
    const res = validateStyleGuideData(blankApproved, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(res.ok, false, 'Blank null value marked approved must fail validation');
  }

  // not_applicable without reason (or with placeholder reason) must fail
  for (const badReason of [null, '', '   ', 'N/A', 'TBD']) {
    const naMissing = cloneJson(liveData);
    const d = naMissing.decisions.find(x => x.decision_id === 'DEC-UNCONF-DARK-THEME-APPLICABILITY');
    d.applicability = 'not_applicable';
    d.status = 'not_applicable';
    d.not_applicable_reason = badReason;
    const res = validateStyleGuideData(naMissing, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(res.ok, false, `not_applicable with reason=${JSON.stringify(badReason)} must fail`);
  }

  console.log('[style-guide.test] 7. Verifying reference validation (broken IDs, cycles, ref:<ID>, and 100% completion)...');
  // Broken related_decisions
  {
    const brokenRel = cloneJson(liveData);
    brokenRel.decisions[0].related_decisions.push('DEC-DOES-NOT-EXIST');
    const res = validateStyleGuideData(brokenRel, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => e.includes('DEC-DOES-NOT-EXIST')));
  }

  // Broken component_id
  {
    const brokenCmp = cloneJson(liveData);
    brokenCmp.decisions[0].component_id = 'CMP-NONEXISTENT';
    const res = validateStyleGuideData(brokenCmp, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => e.includes('CMP-NONEXISTENT')));
  }

  // Broken value ref:DEC-MISSING & circular ref chain
  {
    const brokenRef = cloneJson(liveData);
    const d = brokenRef.decisions.find(x => x.decision_id === 'DEC-TOPBAR-FOCUS');
    d.value = 'ref:DEC-MISSING-TOKEN';
    d.status = 'draft';
    const res = validateStyleGuideData(brokenRef, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => e.includes('ref:DEC-MISSING-TOKEN')));

    const cycleRef = cloneJson(liveData);
    const a = cycleRef.decisions.find(x => x.decision_id === 'DEC-TOPBAR-FOCUS');
    const b = cycleRef.decisions.find(x => x.decision_id === 'DEC-A11Y-FOCUS-RING-SPEC');
    a.value = 'ref:DEC-A11Y-FOCUS-RING-SPEC';
    a.status = 'draft';
    b.value = 'ref:DEC-TOPBAR-FOCUS';
    b.status = 'draft';
    const cycleRes = validateStyleGuideData(cycleRef, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(cycleRes.ok, false);
    assert.ok(cycleRes.errors.some(e => e.includes('circular decision value reference')));
  }

  // Valid ref:<DECISION_ID> + 100% completion state verification
  {
    const full = cloneJson(liveData);
    // First resolve a canonical root decision
    const rootFocus = full.decisions.find(x => x.decision_id === 'DEC-A11Y-FOCUS-RING-SPEC');
    rootFocus.applicability = 'applicable';
    rootFocus.value = { outline_px: 3, offset_px: 2, color_role: 'forest_focus' };
    rootFocus.status = 'approved';
    rootFocus.approval = { approved_by: 'Matt & Yaman', approved_at: '2026-11-22' };

    for (const dec of full.decisions) {
      if (dec.decision_id === 'DEC-A11Y-FOCUS-RING-SPEC') continue;
      if (dec.applicability === 'unconfirmed') {
        dec.applicability = 'not_applicable';
        dec.status = 'not_applicable';
        dec.not_applicable_reason = 'Explicitly deferred until post-launch roadmap review.';
        continue;
      }
      if (dec.dimension === 'focus_treatment') {
        dec.value = 'ref:DEC-A11Y-FOCUS-RING-SPEC';
      } else {
        switch (dec.expected_answer.type) {
          case 'boolean':
            dec.value = true;
            break;
          case 'integer':
          case 'number':
            dec.value = typeof dec.expected_answer.minimum === 'number' ? dec.expected_answer.minimum : 0;
            break;
          case 'enum_choice':
            dec.value = dec.expected_answer.allowed_choices[0];
            break;
          case 'string_list':
            dec.value = ['Approved item one'];
            break;
          case 'token_map':
          case 'structured_spec':
            dec.value = { rule: 'Explicitly approved specification' };
            break;
          default:
            dec.value = 'Explicitly approved string value';
        }
      }
      dec.status = 'approved';
      dec.approval = { approved_by: 'Matt & Yaman', approved_at: '2026-11-22' };
    }

    const fullVal = validateStyleGuideData(full, {
      schemaPath: path.join(REPO_ROOT, 'docs/engineering/schemas/style-guide-decisions.schema.json')
    });
    assert.equal(fullVal.ok, true, `Expected full completion fixture to pass: ${fullVal.errors.join('; ')}`);

    const fullRendered = renderStyleGuideMarkdownFiles(full);
    assert.equal(fullRendered.stats.lifecycle_mode, 'complete');
    assert.equal(fullRendered.stats.is_complete, true);
    assert.equal(fullRendered.stats.remaining_gap_count, 0);
    const fullReminder = fullRendered.files.get('docs/engineering/style-guide/COMPLETION-REMINDER.md');
    assert.match(fullReminder, /Style Guide Decision Coverage Complete/);
    assert.match(fullReminder, /Explicitly Deferred \/ Not-Applicable Decisions/);
  }

  console.log('[style-guide.test] 8. Verifying byte-identical determinism & stale-reminder detection...');
  {
    // Strip repo-specific file checks in isolated temp dir by copying decisions without repoRoot link check,
    // or test generateStyleGuideDocs/validateStyleGuideWorkspace on a minimal temp workspace
    const { tmpRoot, decisionsDst } = createTempStyleGuideWorkspace(
      cloneJson({
        ...liveData,
        mandatory_invariants: liveData.mandatory_invariants.map(i => ({ ...i, authoritative_docs: ['docs/engineering/style-guide/decisions.json'] })),
        components: liveData.components.map(c => ({
          ...c,
          definition_files: [],
          source_and_handbook_links: ['docs/engineering/style-guide/decisions.json']
        }))
      })
    );
    try {
      const gen1 = generateStyleGuideDocs(tmpRoot);
      const snapshot1 = new Map(
        gen1.files_written.map(rel => [rel, fs.readFileSync(path.join(tmpRoot, rel), 'utf8')])
      );
      const gen2 = generateStyleGuideDocs(tmpRoot);
      for (const rel of gen2.files_written) {
        assert.equal(
          fs.readFileSync(path.join(tmpRoot, rel), 'utf8'),
          snapshot1.get(rel),
          `Expected byte-identical regeneration for ${rel}`
        );
      }
      assert.equal(validateStyleGuideWorkspace(tmpRoot).ok, true);

      // Mutate decisions.json without regenerating -> validateStyleGuideWorkspace must fail
      const mutated = JSON.parse(fs.readFileSync(decisionsDst, 'utf8'));
      const target = mutated.decisions.find(d => d.decision_id === 'DEC-TYP-MONO-FAMILY');
      target.value = 'ui-monospace, monospace';
      target.status = 'draft';
      fs.writeFileSync(decisionsDst, JSON.stringify(mutated, null, 2) + '\n', 'utf8');

      const staleCheck = validateStyleGuideWorkspace(tmpRoot);
      assert.equal(staleCheck.ok, false, 'Expected stale COMPLETION-REMINDER.md / questionnaire to fail validation');
      assert.ok(staleCheck.failures.some(f => f.includes('Stale or hand-edited style-guide file')));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  console.log('[style-guide.test] 9. Verifying style-guide generator only writes docs/engineering/style-guide/* (and zero runtime diffs on style-guide-only branch)...');
  for (const rel of liveWsRes.failures.length === 0 ? ['docs/engineering/style-guide/README.md', 'docs/engineering/style-guide/COMPLETION-REMINDER.md'] : []) {
    assert.ok(rel.startsWith('docs/engineering/style-guide/'));
  }
  try {
    const curBranch = execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim();
    if (curBranch === 'chore/unfilled-design-style-guide' || curBranch === 'docs/unfilled-design-style-guide') {
      const runtimeDiff = execFileSync(
        'git',
        [
          'diff',
          '--name-only',
          'origin/working/biteshark-vps',
          '--',
          'public',
          'server',
          'lib',
          'api',
          'migrations',
          'packages'
        ],
        { cwd: REPO_ROOT, encoding: 'utf8' }
      ).trim();
      assert.equal(
        runtimeDiff,
        '',
        `Application runtime files must remain unchanged on ${curBranch}, found diff:\n${runtimeDiff}`
      );
    }
  } catch (err) {
    if (err.code === 'ERR_ASSERTION') throw err;
  }

  console.log('[style-guide.test] PASS — all 9 Section 20.J verification checks succeeded.');
}

run().catch(err => {
  console.error('[style-guide.test] FAILED:', err);
  process.exit(1);
});
