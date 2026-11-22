# PostgreSQL Migration Rules & Two-Developer Coordination

Migrations live in `migrations/NNN_<description>.sql` and are executed by [scripts/run-migrations.cjs](../../scripts/run-migrations.cjs).

For the complete migration ledger (`001`–`029` on `feature/private-profiles-greatest-hits`; `001`–`028` on `working/biteshark-vps`; `001`–`026` on `staging2` branches prior to exploration merge), see [SCHEMA-INVENTORY.md](generated/SCHEMA-INVENTORY.md).

---

## 1. Execution & Checksum Invariants (`scripts/run-migrations.cjs`)

1. **Lexical Execution Order**: Applies `^\d+_.*\.sql$` files sorted lexicographically inside individual `BEGIN ... COMMIT` transactions.
2. **Immutable SHA-256 Checksums**: Normalized LF content is hashed and stored in `public.schema_migrations (filename PRIMARY KEY, checksum_sha256, applied_at)`. Modifying **any** character of an already-applied migration aborts deployment immediately (`Checksum mismatch for applied migration`).
3. **Automatic Runtime Role Grants & Revokes**: When `--app-role <role>` (`BITESHARK_DB_APP_ROLE`) is supplied:
   - Grants `USAGE ON SCHEMA public`, `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`, and `USAGE, SELECT ON ALL SEQUENCES` to `<appRole>`.
   - Explicitly runs `REVOKE INSERT, UPDATE, DELETE ON schema_migrations` and `REVOKE UPDATE, DELETE` on all protected append-only audit/history tables.

---

## 2. Mandatory Rules for Writing a New Migration

1. **Additive & Forward-Compatible Only**:
   - Symlink release rollback (`install-staging-release.sh --rollback`) rolls back Node code, **not** PostgreSQL DDL! Never drop or rename columns/tables still queried by the currently deployed release (`N-1` compatibility).
2. **Enable & Force RLS on Sensitive/User Tables**:
   - Every new user-, vendor-, or admin-scoped table must include `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY; ALTER TABLE <table> FORCE ROW LEVEL SECURITY;` and explicit `CREATE POLICY` statements keyed to `current_setting('app.*', true)`.
3. **Prevent Cross-Branch Number Collisions**:
   - Before choosing `NNN_`, inspect **both** staging branches (`git fetch origin` and check `migrations/` across `working/biteshark-vps`, `feature/customer-exploration-journal-trails`, `testing/yaman-staging2`, `antigravity/staging2-latest`).
   - Note: **`027` (`027_customer_exploration_foundation.sql`), `028` (`028_exploration_photo_reconciliation.sql`), and `029` (`029_customer_profiles_collections_and_sharing.sql`)** are allocated (`027`–`028` on `working/biteshark-vps`; `029` on `feature/private-profiles-greatest-hits`). Any subsequent migration must start at `030_` or coordinate numbering before merging (`npm run registry:validate` flags `MIGRATION_SEQUENCE_COLLISION` automatically).
4. **Update Test Assertions When Adding a Migration**:
   - Note that several integration tests assert exact `newly_applied` counts on fresh test DBs (`29` on `feature/private-profiles-greatest-hits`, `28` on `working/biteshark-vps`). Run the full integration suite after adding a migration, and run `npm run registry:docs` to refresh [SCHEMA-INVENTORY.md](generated/SCHEMA-INVENTORY.md).
