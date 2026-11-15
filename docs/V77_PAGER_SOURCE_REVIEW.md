# Truckly v77 source / pager demo — review and migration checklist

**Status:** isolated GitHub review branch, not a production deployment. Created from the then-current GitHub `main` commit after photo/menu PR #1 was merged. Text source was read from the Hatchable Truckly project (`proj_MEO518rmLLl0`) while the **pager experience was saved as an undeployed draft**. The live site remains on the last confirmed deployment until Hatchable deploy is executed.

## What was mirrored
- **27/27 Hatchable API functions**, including `api/pager/status.js` (public read via private UUID), `api/pager/staff.js` (admin-only ticket creation/queue), `api/pager/update.js` (admin-only status), and newer community APIs.
- **10/10 database migration scripts**, including pager and community tables.
- All **27 text files under `public/`** plus `hatchable.toml` (65/68 nonvirtual project files in total).
- The current HTML/JS/CSS pager draft: `public/index.html`, `public/pager.js`, `public/pager.css`, and new `public/pager-experience.css`.
- Source comparison and safety checks: `tests/pager-demo.test.cjs`, `.github/workflows/truckly-source-review.yml`.

**Not mirrored:** three pre-existing binary JPEG files: `public/assets/mitote.jpg`, `public/assets/oak-hill-guide.jpg`, and `public/assets/retrograde-roasting.jpg`. Those need a permitted binary export/upload plus image-rights review. The virtual platform-generated `AGENTS.md` is intentionally not copied because it must not be edited and can be regenerated from Hatchable.

## Pager experience

The customer pager screen now starts with a big **Try sample order** action. A pretend order for two smash burgers and fries demonstrates **Cooking → Almost ready → Ready → Picked up** with:
- a visible four-stage progress roadmap;
- a pretend kitchen action to advance manually;
- auto-advance every ~4.7 seconds, with a Pause/Resume button;
- optional ready chime, animated ready state and replay;
- a clear **SAMPLE / NOT A REAL ORDER** label throughout;
- real private-link input kept in a collapsible secondary section;
- no demo fetch calls, database writes, orders, payment or staff alerts.

Owner Mode also has a **Try customer demo** entry, but the real kitchen remains restricted to owner/admin as defined by API access declarations. The backend ticket flow is not changed by these demo-only enhancements.

## Important compatibility and security review

This is a **source snapshot for review**, not a safe automatic replacement for the GitHub `main` photo/menu patch. Several v77 files are older/different from the GitHub improvements, and replacing them as-is could undo photo verification changes introduced by the preceding PR:
1. `api/trucks.js` may still default many listings to `verified: true`, has placeholder coordinates, and uses old venue data. Review against `docs/PHOTO_MENU_VERIFICATION.md`.
2. `public/app.js` contains newer local-guide features but differs from the prior GitHub photo-matching and illustrative-fallback changes. Preserve both feature sets when reconciling.
3. `public/index.html` in this snapshot does not load the previous `public/listing-highlights.js`. That earlier file is retained on the branch from main, but the feature is **not currently wired in this snapshot**.
4. Real pickup ticket links contain private UUIDs. Do not write them to public logs, documentation or sample URL fixtures.
5. API route access intentionally differs by endpoint: public pickup-code lookup versus admin-only ticket create/update. Confirm credentials and rate limits before production.
6. Check the three missing JPEG assets and their redistribution permissions.
7. The source snapshot did not copy the hosted database's contents, environment secrets, production data or deployment configuration outside `hatchable.toml`; none should be committed casually.

## GitHub checks

GitHub Actions runs:
- parser/syntax checks for all `api/**/*.js` modules;
- parser/syntax checks for all `public/**/*.js` scripts;
- `node tests/pager-demo.test.cjs`: simulated one-tap example, kitchen steps, pause, replay and **no network calls**;
- `node tests/listing-verification.cjs`: previous catalog safety checks. **A failure here is a blocker**, not something to suppress, because v77 is not reconciled with the GitHub photo-verification patch.

Local checks: `node tests/pager-demo.test.cjs` and `node tests/listing-verification.cjs`.

## Deployment and review gate

- [ ] Matt Callaway reviews the PR and the pager demo interaction.
- [ ] Reconcile source versions; keep both v77 additions and the previous main branch's photo/menu verification changes.
- [ ] Confirm the three binary assets and photo rights.
- [ ] Run CI with all checks passing, and mobile browser/VoiceOver checks.
- [ ] Confirm no fake order or staff notification is created in demo.
- [ ] Run Hatchable dry-run validation; record any intentionally public endpoints.
- [ ] Publish Hatchable separately only after quality checks; record deployed version and URL.
- [ ] Merge the reconciled source into `main` only after review.

**GitHub review is not a Hatchable deployment**. Do not call this PR a complete tested v78 release.
