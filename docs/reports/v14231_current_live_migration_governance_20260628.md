# v1.4.23.1 Current-Live Migration Governance Closeout - 2026-06-28

## Scope

This report records the current live/admin migration closeout for the WorkBuddy Supabase project `wwdrkjnbvcbfytwnnyvs`. It closes the MG-01 through MG-07 migration-governance gate for the current run only. It does not authorize old-object physical drops, nor does it turn unrelated C-18.L concurrency, pressure, PoC, or product closeout items into `production-ready`.

## Privileged Probe

- Migration connection shape: direct PostgreSQL host `db.wwdrkjnbvcbfytwnnyvs.supabase.co:5432`, database `postgres`, user `postgres`.
- Runtime connection remains separated from the migration connection and uses `workbuddy_runtime_login`.
- Probe result: `current_user=postgres`, `session_user=postgres`, `rolbypassrls=true`, `pg_is_in_recovery=false`.
- `public.schema_migrations` exists and the closeout readback records `263` rows.

This supersedes the older planning-note assumption that `public.schema_migrations` was still `0` rows.

## Applied And Ledgered Migrations

The live closeout evidence records these key migrations as local-present, ledgered, and included in `CLEAN_MIGRATION_V4.sql`:

- `245_v14231_algorithm_asset_registry_view_acl_hardening.sql`
- `246_v14231_advisor_public_rls_closeout.sql`
- `247_v14231_users_active_session_guard_columns.sql`
- `248_v14231_migration_drift_closeout.sql`
- `249_v14231_data_lineage_global_reference_auth_predicate.sql`

The current classification for the MG closeout-required rows is `applied_and_ledgered` with handling action `applied_and_ledgered_keep_under_closeout_readback`; `245` is also present in the current ledger readback.

## Advisor Public RLS Readback

The known Advisor public RLS closeout tables now read back with RLS, FORCE RLS, and policies:

- `project_key_node_snapshots`: RLS enabled, FORCE RLS enabled, `3` policies.
- `task_constraint_snapshots`: RLS enabled, FORCE RLS enabled, `3` policies.
- `data_lineage_entity_types`: RLS enabled, FORCE RLS enabled, `2` policies.
- `data_lineage_relation_rules`: RLS enabled, FORCE RLS enabled, `2` policies.

This closes the previously current blocker where 246 had not landed and the four known Advisor tables still had no RLS/FORCE/policy. It remains scoped to the objects covered by the evidence; future newly exposed public catalog objects still need the normal RLS/policy guard path.

## Migration Safety State

Final validation results for this run:

- `npm.cmd run migrate:production-governance --workspace=server -- --evidence-file ../artifacts/test-runs/20260628-migration-governance-current-live/production-migration-governance-current-live.json`: `status=closed`, MG-01 through MG-07 all `pass`.
- `npm.cmd run migrate:check --workspace=server`: `status=pass`, `pendingMigrations=[]`, `checksumMismatches=[]`, `orphanLedgerRows=[]`.
- `npm.cmd run migrate:diagnose --workspace=server`: `status=ready_for_schema_drift_check`, `pending=0`, `checksumMismatch=0`, `orphanLedgerRow=0`, `duplicateVersion=0`.
- `npm.cmd run migrate:drift --workspace=server`: `status=pass`, `blockingDrift=[]`.

Historical checksum differences remain listed as reconciled baseline rows by the safety scripts. They are not current blocking checksum mismatches.

## Evidence Files

- `artifacts/test-runs/20260628-migration-governance/production-migration-governance-evidence.json`
- `artifacts/test-runs/20260628-migration-governance-current-live/production-migration-governance-current-live.json`
- `artifacts/test-runs/20260628-migration-governance-current-live/production-migration-governance-gate-output.clean.json`
- `artifacts/test-runs/20260628-migration-governance-current-live/migration-governance-live-readback-248.json`
- `artifacts/test-runs/20260628-migration-governance-current-live/c18-l01-l04-rls-proacl-post-migration.json`
- `artifacts/test-runs/20260628-migration-governance-current-live/c18-l04-execute-sql-anon-poc-post-migration.json`

## Remaining Boundary

No old-object physical drop is authorized by this report. Old tables or compatibility objects still require MG-06 style object-level dependency scanning, structure export, row-count readback, rollback path, controlled drop migration, and post-drop smoke/readback before removal.

The final migration-governance closeout reports `allowValidate=true`, `allowWarmup=true`, and `allowScheduler=true`. Those booleans only govern migration-governance scope and do not override unrelated product, live-concurrency, pressure-test, release-governance, manual approval, monitoring, rollback, or old-object physical-drop blockers.
