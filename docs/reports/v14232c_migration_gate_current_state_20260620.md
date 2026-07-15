# v1.4.23.2-C migration gate current state - 2026-06-20

## Current gate result

- `migrate:check`: pass.
- Blocking reason codes: none.
- Pending migrations: 0.
- Blocking checksum mismatches: 0.
- Reconciled checksum mismatches: 14. These rows are explicitly reported as `reconciledChecksumMismatches`; they are audit evidence, not release blockers by themselves.
- Orphan ledger rows: 0.
- Adopted baseline ledger rows: 10.
- Duplicate versions: 0.
- Unsafe baseline replay risk: false.
- `migrate:diagnose`: `status=ready_for_schema_drift_check`, `safeToEvaluateDrift=true`, `safeToApplyPending=false`, `nextAction=run_schema_drift_check`.
- `migrate:drift`: pass for the declared coverage scope, with `blockingDrift=[]`.
- Coverage backlog remains explicit and outside the `drift=0` claim: `trigger`, `function`, `view`, `enum`, `extension`, `grant`.

The structural migration gate and declared-coverage schema drift gate are now green. The correct release wording is: **release-ready for declared coverage**. It is not yet a claim that every PostgreSQL object class is covered by drift detection.

## Reconciliation applied

Forward migration `server/migrations/225_v14232c_schema_drift_reconciliation.sql` has been applied. It reconciles the declared coverage without mutating historical migration files or overwriting `schema_migrations.checksum`.

Key reconciliation decisions:

- Added missing canonical columns such as `acceptance_requirements.drawing_package_id`, `tasks.preceding_task_id`, and `wbs_templates.template_data`.
- Adopted live-canonical production columns for projects, job execution logs, task conditions, task obstacles, and related runtime tables.
- Copied the legacy `pre_milestones.document_no` value into `certificate_no` before dropping `document_no`.
- Retired empty legacy scope-object columns, indexes, and foreign keys that are outside the current v1.4 engineering-object boundary.
- Reconciled default, nullability, type, constraint, index, and RLS policy differences inside the declared coverage scope.
- Migrated `task_critical_overrides.mode='force_critical'` into the canonical `manual_attention/manual_insert` model.
- Retired old browser-side RLS policy expectations and kept current backend-service-role mediated policies where they are the chosen canonical model.

Because 225 is already applied, future schema corrections must use a new forward migration. Do not edit 225 to chase later drift.

## Adopted baseline ledger rows

These rows are historical ledger entries whose corresponding migration file was later renamed or split into suffixed canonical files. They are explicitly registered in `server/migrations/adopted-baseline-ledger-rows.json`, so they are not silently ignored.

| Ledger row | Current canonical evidence |
| --- | --- |
| `083_lock_down_public_rls.sql` | `083a_lock_down_public_rls.sql` |
| `086_preserve_task_snapshot_events.sql` | `086a_preserve_task_snapshot_events.sql` |
| `087_create_job_failures.sql` | `087a_create_job_failures.sql` |
| `087_create_revision_pool_candidates.sql` | `087b_create_revision_pool_candidates.sql` |
| `088_v2_hardening_drawings_dependencies_indexes.sql` | `088a_v2_hardening_drawings_dependencies_indexes.sql` |
| `091_remove_legacy_compatibility_bridges.sql` | `091a_remove_legacy_compatibility_bridges.sql` |
| `093_mainline_c_drawings_licenses_hardening.sql` | `093a_mainline_c_drawings_licenses_hardening.sql` |
| `098_create_project_materials.sql` | `100a_create_project_materials.sql` |
| `100_create_project_materials.sql` | `100a_create_project_materials.sql` |
| `131_v147_v1411_closure_fixups.sql` | `131a_v147_v1411_closure_fixups.sql` |

## Reconciled checksum mismatch classification

Do not repair historical checksum differences by overwriting `schema_migrations.checksum` with current file hashes. The current gate passes because the remaining 14 rows have explicit reconciliation evidence and are separated from blocking `checksumMismatches`.

| Group | Files | Current gate meaning |
| --- | --- | --- |
| Reconciled historical checksum rows | `002_add_phase1_tables.sql`, `068_normalize_acceptance_flow_model.sql`, `084a_reconcile_live_schema_after_baseline_adoption.sql`, `103_patch_schema_gaps_e4.sql` | Historical applied SQL differs from current file hashes, but the mismatch is registered as reconciled evidence rather than a silent ledger rewrite. |
| Reconciled untracked-at-HEAD / historical source rows | `120_create_engineering_objects.sql`, `121_add_wbs_engineering_categories.sql`, `122_create_construction_task_standard_model.sql`, `123_create_task_code_rules.sql`, `136_v1472_wbs_template_generation.sql`, `136a_v1472_wbs_template_candidates.sql`, `137_company_workspace_isolation.sql`, `139a_v1421_material_lifecycle_fields.sql`, `140_v1418_duration_experience_tables.sql`, `143_v1420_workspace_tables.sql` | These still appear in diagnostic evidence as `reconciledChecksumMismatches`; they no longer block `migrate:check`, but any future schema change must still be made by forward migration. |

## Schema drift state

- `migrate:drift`: pass for declared coverage.
- Blocking drift count: 0.
- `blockingDrift`: `[]`.
- Coverage backlog remains explicit and not counted as full PostgreSQL coverage: `trigger`, `function`, `view`, `enum`, `extension`, `grant`.

This replaces the earlier 209-row drift state. Those rows were reconciled through canonical schema decisions, forward migration 225, and parser/normalizer hardening. The remaining backlog is coverage scope, not a current blocking drift row.

The drift pass must be described precisely:

- Allowed: “declared coverage 下 schema drift gate 通过，blockingDrift=0。”
- Not allowed: “所有 PostgreSQL 对象 drift=0。”
- Not allowed: “coverage backlog 已解决。”

## Execution hardening added

- `run-pending-migrations.ts` reuses `evaluateMigrationCheck` with `allowPendingMigrations: true` before it applies any SQL. Direct script calls, local runs, or external runners cannot bypass checksum/orphan/duplicate/baseline safety by skipping the CI pre-check.
- `applyMigration` inserts new `schema_migrations` rows without `ON CONFLICT DO UPDATE`; existing ledger rows remain immutable and checksum conflicts surface as blocking errors instead of being silently overwritten.
- `migrate:diagnose` is a read-only release-readiness diagnostic that emits `safeToApplyPending`, `safeToEvaluateDrift`, `nextAction`, and structural blocker counts before anyone attempts pending application.
- `schemaDriftExpectedSchemaParser` applies later `DROP TABLE`, `DROP INDEX`, and later `CREATE INDEX` statements in SQL order, so retired objects are not incorrectly kept and recreated indexes are preserved.
- `normalizeDefaultExpression` now treats PostgreSQL display-equivalent defaults as equivalent where appropriate, including reordered JSONB defaults, `CURRENT_TIMESTAMP` vs `now()`, and JSON literal casts, while preserving scalar text defaults as text.
- Contract tests cover these protections: `migrate:pending` must pass through the safety gate, migration application must not rewrite existing ledger checksums, the read-only diagnostic must remain exposed, drift introspection must use PostgreSQL catalog formatted types, and single-client migration/drift probes must stay sequential.

## Remaining release path

1. Keep the declared-coverage gates green: `migrate:check`, `migrate:diagnose`, and `migrate:drift`.
2. Treat 225 as immutable applied history. Any future database correction must be a new forward migration.
3. Expand coverage backlog one object class at a time: `trigger`, `function`, `view`, `enum`, `extension`, `grant`.
4. For each coverage expansion, add parser/introspection/comparison tests before using it as a release blocker.
5. If declared coverage ever produces non-empty `blockingDrift`, production deploy must block again.
6. If production release depends on manual break-glass skip instead of verified migration/drift gates, downgrade the migration domain back to `needs-gating`.

## Verification evidence

- `cd server && npm run migrate:check`: pass.
- `cd server && npm run migrate:diagnose`: `ready_for_schema_drift_check`, `safeToEvaluateDrift=true`.
- `cd server && npm run migrate:drift`: pass, `blockingDrift=[]`, coverage backlog = `trigger`, `function`, `view`, `enum`, `extension`, `grant`.
- `npx vitest run --config server/vitest.config.ts server/src/__tests__/schemaDriftExpectedSchemaParser.test.ts server/src/__tests__/migrationSafetyGateService.test.ts server/src/__tests__/deployWorkflowContract.test.ts --reporter=basic`: 3 files / 46 tests passed.
- `npx tsc -p server/tsconfig.json --noEmit --pretty false`: pass.
