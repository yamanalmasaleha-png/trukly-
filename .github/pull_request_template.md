## Summary

- **Target branch & environment scope**: *(e.g. `working/biteshark-vps`, `staging`, `staging2` — confirm no unintended cross-branch feature merges)*
- **What changed & why**:

## Shared Engineering Handbook & Contract Checklist

- [ ] Inspected existing symbols, callers, routes, and CSS cascade (`npm run registry:locate -- <name>`) before adding new helpers or overrides.
- [ ] Preserved backend security invariants (server RBAC, `14+` age gate, CSRF, rate limits, `withTransaction` session locks, `FORCE ROW LEVEL SECURITY` `app.*` GUCs, and response envelopes in `docs/engineering/contracts/shared-api-envelopes.md`).
- [ ] SQL migrations (if any) are strictly additive, unedited once applied, and free of sequence-prefix collisions across active branches (`docs/engineering/MIGRATIONS.md`).
- [ ] Updated maintained docs/contracts (`docs/engineering/**`, `docs/engineering/contracts/configuration-keys.json`) if routes, tables, feature flags, or `BITESHARK_*` config variables changed.
- [ ] Regenerated and validated the code registry (`npm run registry:docs && npm run registry:validate && npm run test:registry`).
- [ ] Reviewed change-impact classification (`npm run registry:compare -- --base origin/working/biteshark-vps --head HEAD --merge-base`).
- [ ] Zero secrets, `.env` values, session cookies, or private customer data committed or logged.

## Verification Executed

```text
# Paste exact test commands executed and actual results (never claim unrun hosted/device checks passed):
```
