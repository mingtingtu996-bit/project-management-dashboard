import { describe, expect, it } from 'vitest'

import {
  extractPhysicalDropStatements,
  runLegacyObjectDropGuardCheck,
} from '../scripts/check-legacy-object-drop-guard.js'

describe('check-legacy-object-drop-guard script', () => {
  it('fails closed when no candidates file is provided', async () => {
    const outputs: string[] = []

    const result = await runLegacyObjectDropGuardCheck([], {
      writeOutput: (message) => outputs.push(message),
    })

    expect(result.exitCode).toBe(1)
    expect(result.report).toEqual({
      status: 'blocked',
      reasons: ['row_count_zero_not_sufficient'],
      candidates: [],
    })
    expect(outputs.join('\n')).toContain('row_count_zero_not_sufficient')
  })

  it('allows CI to run a read-only no-drop-candidates guard without authorizing drops', async () => {
    const result = await runLegacyObjectDropGuardCheck(['--ci-no-drop-candidates-ok'])

    expect(result.exitCode).toBe(0)
    expect(result.report).toEqual({
      status: 'blocked',
      reasons: ['row_count_zero_not_sufficient'],
      candidates: [],
    })
  })

  it('writes the guard report to --output-file while preserving stdout output', async () => {
    const outputs: string[] = []
    const writtenFiles: Array<{ path: string, text: string }> = []

    const result = await runLegacyObjectDropGuardCheck([
      '--ci-no-drop-candidates-ok',
      '--output-file',
      'artifacts/legacy-object-drop.json',
    ], {
      writeOutput: (message) => outputs.push(message),
      writeTextFile: async (path, text) => {
        writtenFiles.push({ path, text })
      },
    })

    expect(result.exitCode).toBe(0)
    expect(outputs.join('\n')).toContain('row_count_zero_not_sufficient')
    expect(writtenFiles).toHaveLength(1)
    expect(writtenFiles[0].path).toBe('artifacts/legacy-object-drop.json')
    expect(JSON.parse(writtenFiles[0].text)).toEqual(result.report)
  })

  it('blocks scanned post-baseline physical DROP migrations even when CI no-candidates mode is enabled', async () => {
    const result = await runLegacyObjectDropGuardCheck([
      '--ci-no-drop-candidates-ok',
      '--scan-migration-drops',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '247',
    ], {
      listMigrationFiles: async () => ['248_drop_legacy_scope_surface.sql'],
      readMigrationFile: async () => 'DROP TABLE IF EXISTS public.legacy_scope_surface CASCADE;',
    })

    expect(result.exitCode).toBe(1)
    expect(result.report.status).toBe('blocked')
    expect(result.report.reasons).toContain('migration_drop_candidate_evidence_required')
    expect(result.report.candidates).toEqual([
      {
        objectName: 'public.legacy_scope_surface',
        status: 'blocked',
        reasons: ['migration_drop_candidate_evidence_required'],
      },
    ])
  })

  it('defers only idempotent migration drops to the mandatory target-catalog preflight', async () => {
    const deferred = await runLegacyObjectDropGuardCheck([
      '--ci-no-drop-candidates-ok',
      '--scan-migration-drops',
      '--allow-target-catalog-preflight',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '247',
    ], {
      listMigrationFiles: async () => ['298_extended_schema_drift_reconciliation.sql'],
      readMigrationFile: async () => 'DROP MATERIALIZED VIEW IF EXISTS public.mv_project_dashboard;',
    })

    expect(deferred.exitCode).toBe(0)
    expect(deferred.report.status).toBe('needs_gating')
    expect(deferred.report.candidates).toEqual([{
      objectName: 'public.mv_project_dashboard',
      status: 'needs_gating',
      reasons: ['migration_drop_candidate_evidence_required'],
    }])

    const nonIdempotent = await runLegacyObjectDropGuardCheck([
      '--ci-no-drop-candidates-ok',
      '--scan-migration-drops',
      '--allow-target-catalog-preflight',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '247',
    ], {
      listMigrationFiles: async () => ['298_extended_schema_drift_reconciliation.sql'],
      readMigrationFile: async () => 'DROP MATERIALIZED VIEW public.mv_project_dashboard;',
    })

    expect(nonIdempotent.exitCode).toBe(1)
    expect(nonIdempotent.report.status).toBe('blocked')
  })

  it('extracts broad physical drop and alter-table drop statements from multiline SQL', () => {
    const drops = extractPhysicalDropStatements(`
      DROP INDEX IF EXISTS public.idx_legacy_scope_surface;
      DROP TRIGGER IF EXISTS trigger_legacy_scope ON public.legacy_scope_surface;
      DROP POLICY IF EXISTS legacy_scope_policy ON public.legacy_scope_surface;
      DROP RULE IF EXISTS legacy_scope_rule ON public.legacy_scope_surface;
      DROP TABLE IF EXISTS
        public.legacy_scope_surface,
        public.legacy_scope_archive
        CASCADE;
      ALTER TABLE public.tasks
        DROP COLUMN IF EXISTS legacy_scope_id,
        DROP CONSTRAINT IF EXISTS tasks_legacy_scope_id_fkey;
    `, '248_drop_legacy_scope_surface.sql')

    expect(drops).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectType: 'index', objectName: 'public.idx_legacy_scope_surface' }),
      expect.objectContaining({ objectType: 'trigger', objectName: 'public.legacy_scope_surface.trigger_legacy_scope' }),
      expect.objectContaining({ objectType: 'policy', objectName: 'public.legacy_scope_surface.legacy_scope_policy' }),
      expect.objectContaining({ objectType: 'rule', objectName: 'public.legacy_scope_surface.legacy_scope_rule' }),
      expect.objectContaining({ objectType: 'table', objectName: 'public.legacy_scope_surface' }),
      expect.objectContaining({ objectType: 'table', objectName: 'public.legacy_scope_archive' }),
      expect.objectContaining({ objectType: 'column', objectName: 'public.tasks.legacy_scope_id' }),
      expect.objectContaining({ objectType: 'constraint', objectName: 'public.tasks.tasks_legacy_scope_id_fkey' }),
    ]))
  })

  it('does not treat same-migration trigger, policy, or constraint recreation as legacy object drop candidates', () => {
    const drops = extractPhysicalDropStatements(`
      DROP INDEX IF EXISTS public.idx_tasks_basement_object_id;
      CREATE INDEX idx_tasks_basement_object_id
        ON public.tasks (basement_object_id)
        WHERE basement_object_id IS NOT NULL;

      DROP TRIGGER IF EXISTS trigger_tasks_updated_at ON public.tasks;
      CREATE TRIGGER trigger_tasks_updated_at
        BEFORE UPDATE ON public.tasks
        FOR EACH ROW
        EXECUTE FUNCTION public.set_updated_at();

      ALTER TABLE public.recommendation_actions
        DROP CONSTRAINT IF EXISTS recommendation_actions_action_type_check;

      ALTER TABLE public.recommendation_actions
        ADD CONSTRAINT recommendation_actions_action_type_check
        CHECK (action_type IN ('open', 'dismiss'));

      DROP POLICY IF EXISTS project_key_node_snapshots_auth_read_policy
        ON public.project_key_node_snapshots;

      CREATE POLICY project_key_node_snapshots_auth_read_policy
        ON public.project_key_node_snapshots
        FOR SELECT
        USING (true);

      DROP TABLE IF EXISTS public.legacy_scope_surface;
    `, '248_v14231_migration_drift_closeout.sql')

    expect(drops).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: 'index',
        objectName: 'public.idx_tasks_basement_object_id',
      }),
      expect.objectContaining({
        objectType: 'constraint',
        objectName: 'public.recommendation_actions.recommendation_actions_action_type_check',
      }),
      expect.objectContaining({
        objectType: 'policy',
        objectName: 'public.project_key_node_snapshots.project_key_node_snapshots_auth_read_policy',
      }),
    ]))
    expect(drops).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: 'trigger',
        objectName: 'public.tasks.trigger_tasks_updated_at',
      }),
    ]))
    expect(drops).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectType: 'table', objectName: 'public.legacy_scope_surface' }),
    ]))
  })

  it('does not require old-object physical-drop evidence for governed security and replay drift migration replacements', async () => {
    const result = await runLegacyObjectDropGuardCheck([
      '--ci-no-drop-candidates-ok',
      '--scan-migration-drops',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '247',
    ], {
      listMigrationFiles: async () => [
        '259_v14231_supabase_advisor_security_closeout.sql',
        '263_v14232_migration_replay_drift_closeout.sql',
      ],
      readMigrationFile: async (path) => {
        if (path.includes('259_v14231_supabase_advisor_security_closeout.sql')) {
          return `
            DROP POLICY IF EXISTS health_history_select ON public.project_health_history;
            DROP POLICY IF EXISTS health_history_insert ON public.project_health_history;
            DROP POLICY IF EXISTS health_history_update ON public.project_health_history;
          `
        }
        return `
          ALTER TABLE public.tasks
            DROP CONSTRAINT IF EXISTS fk_tasks_milestone_id,
            DROP CONSTRAINT IF EXISTS tasks_milestone_id_fkey;
        `
      },
    })

    expect(result.exitCode).toBe(0)
    expect(result.report).toEqual({
      status: 'blocked',
      reasons: ['row_count_zero_not_sufficient'],
      candidates: [],
    })
  })

  it('recognizes the dedicated retirement contracts for migrations 316 and 321', async () => {
    const result = await runLegacyObjectDropGuardCheck([
      '--ci-no-drop-candidates-ok',
      '--scan-migration-drops',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '310',
    ], {
      listMigrationFiles: async () => [
        '316_task_fact_write_integrity.sql',
        '321_retire_duplicate_t2_schedule_runtime.sql',
      ],
      readMigrationFile: async (path) => path.includes('316_task_fact_write_integrity.sql')
        ? `
            DROP TRIGGER IF EXISTS trigger_auto_record_snapshot ON public.tasks;
            DROP FUNCTION IF EXISTS public.auto_record_progress_snapshot();
          `
        : `
            DROP TABLE public.t2_rhythm_schedule_runtime_events;
            DROP TABLE public.t2_rhythm_schedule_runtime_publications;
          `,
    })

    expect(result.exitCode).toBe(0)
    expect(result.report).toEqual({
      status: 'blocked',
      reasons: ['row_count_zero_not_sufficient'],
      candidates: [],
    })
  })

  it('blocks scanned post-baseline alter-table drops unless candidate evidence is complete', async () => {
    const result = await runLegacyObjectDropGuardCheck([
      '--ci-no-drop-candidates-ok',
      '--scan-migration-drops',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '247',
    ], {
      listMigrationFiles: async () => ['248_drop_legacy_task_columns.sql'],
      readMigrationFile: async () => `
        ALTER TABLE public.tasks
          DROP COLUMN IF EXISTS legacy_scope_id,
          DROP CONSTRAINT IF EXISTS tasks_legacy_scope_id_fkey;
      `,
    })

    expect(result.exitCode).toBe(1)
    expect(result.report.status).toBe('blocked')
    expect(result.report.candidates).toEqual(expect.arrayContaining([
      {
        objectName: 'public.tasks.legacy_scope_id',
        status: 'blocked',
        reasons: ['migration_drop_candidate_evidence_required'],
      },
      {
        objectName: 'public.tasks.tasks_legacy_scope_id_fkey',
        status: 'blocked',
        reasons: ['migration_drop_candidate_evidence_required'],
      },
    ]))
  })

  it('allows scanned post-baseline physical DROP only when the matching candidate evidence is complete', async () => {
    const result = await runLegacyObjectDropGuardCheck([
      '--scan-migration-drops',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '247',
      '--candidates-file',
      'candidates.json',
    ], {
      listMigrationFiles: async () => ['248_drop_superseded_empty_table.sql'],
      readMigrationFile: async () => 'DROP TABLE IF EXISTS public.superseded_empty_table CASCADE;',
      readTextFile: async () => JSON.stringify({
        candidates: [
          {
            objectName: 'public.superseded_empty_table',
            classification: 'obsolete_or_superseded',
            rowCount: 0,
            dependencyScan: { pass: true },
            structureExport: { path: 'artifacts/superseded_empty_table.sql' },
            migrationPlan: { path: 'artifacts/plan-drop-superseded-empty-table.md' },
            rollbackPlan: { path: 'artifacts/rollback-superseded-empty-table.md' },
            controlledDropMigration: { filename: '248_drop_superseded_empty_table.sql' },
            postDropReadback: { required: true, pass: true },
            catalogReadback: { pass: true, path: 'artifacts/catalog-readback.json' },
            dependencyReadback: { pass: true, path: 'artifacts/dependency-readback.json' },
            postDropApiSmoke: { pass: true, path: 'artifacts/post-drop-api-smoke.json' },
            approvalRef: 'approval://legacy-drop/superseded_empty_table',
          },
        ],
      }),
    })

    expect(result.exitCode).toBe(0)
    expect(result.report.status).toBe('drop_ready')
  })

  it('requires function DROP evidence to match the same canonical function signature in the same migration file', async () => {
    const allowed = await runLegacyObjectDropGuardCheck([
      '--scan-migration-drops',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '247',
      '--candidates-file',
      'candidates.json',
    ], {
      listMigrationFiles: async () => ['248_drop_legacy_rollup_fn.sql'],
      readMigrationFile: async () => 'DROP FUNCTION IF EXISTS public.legacy_rollup(text, integer);',
      readTextFile: async () => JSON.stringify({
        candidates: [
          {
            objectName: 'public.legacy_rollup(text, integer)',
            classification: 'obsolete_or_superseded',
            rowCount: 0,
            dependencyScan: { pass: true },
            structureExport: { path: 'artifacts/legacy_rollup.sql' },
            migrationPlan: { path: 'artifacts/plan-drop-legacy-rollup.md' },
            rollbackPlan: { path: 'artifacts/rollback-legacy-rollup.md' },
            controlledDropMigration: { filename: '248_drop_legacy_rollup_fn.sql' },
            postDropReadback: { required: true, pass: true },
            catalogReadback: { pass: true, path: 'artifacts/catalog-readback.json' },
            dependencyReadback: { pass: true, path: 'artifacts/dependency-readback.json' },
            postDropApiSmoke: { pass: true, path: 'artifacts/post-drop-api-smoke.json' },
            approvalRef: 'approval://legacy-drop/legacy_rollup',
          },
        ],
      }),
    })

    expect(allowed.exitCode).toBe(0)
    expect(allowed.report.status).toBe('drop_ready')

    const blocked = await runLegacyObjectDropGuardCheck([
      '--scan-migration-drops',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '247',
      '--candidates-file',
      'candidates.json',
    ], {
      listMigrationFiles: async () => ['248_drop_legacy_rollup_fn.sql'],
      readMigrationFile: async () => 'DROP FUNCTION IF EXISTS public.legacy_rollup(text, integer);',
      readTextFile: async () => JSON.stringify({
        candidates: [
          {
            objectName: 'public.legacy_rollup(uuid)',
            classification: 'obsolete_or_superseded',
            rowCount: 0,
            dependencyScan: { pass: true },
            structureExport: { path: 'artifacts/legacy_rollup.sql' },
            migrationPlan: { path: 'artifacts/plan-drop-legacy-rollup.md' },
            rollbackPlan: { path: 'artifacts/rollback-legacy-rollup.md' },
            controlledDropMigration: { filename: '248_drop_legacy_rollup_fn.sql' },
            postDropReadback: { required: true, pass: true },
          },
        ],
      }),
    })

    expect(blocked.exitCode).toBe(1)
    expect(blocked.report.status).toBe('blocked')
    expect(blocked.report.reasons).toContain('migration_drop_candidate_evidence_required')
    expect(blocked.report.candidates).toEqual(expect.arrayContaining([
      {
        objectName: 'public.legacy_rollup(text, integer)',
        status: 'blocked',
        reasons: ['migration_drop_candidate_evidence_required'],
      },
    ]))
  })

  it('blocks scanned physical DROP when candidate evidence names a different controlled migration file', async () => {
    const result = await runLegacyObjectDropGuardCheck([
      '--scan-migration-drops',
      '--migrations-dir',
      'migrations',
      '--migration-drop-baseline-version',
      '247',
      '--candidates-file',
      'candidates.json',
    ], {
      listMigrationFiles: async () => ['249_drop_superseded_empty_table.sql'],
      readMigrationFile: async () => 'DROP TABLE IF EXISTS public.superseded_empty_table CASCADE;',
      readTextFile: async () => JSON.stringify({
        candidates: [
          {
            objectName: 'public.superseded_empty_table',
            classification: 'obsolete_or_superseded',
            rowCount: 0,
            dependencyScan: { pass: true },
            structureExport: { path: 'artifacts/superseded_empty_table.sql' },
            migrationPlan: { path: 'artifacts/plan-drop-superseded-empty-table.md' },
            rollbackPlan: { path: 'artifacts/rollback-superseded-empty-table.md' },
            controlledDropMigration: { filename: '248_drop_superseded_empty_table.sql' },
            postDropReadback: { required: true, pass: true },
          },
        ],
      }),
    })

    expect(result.exitCode).toBe(1)
    expect(result.report.status).toBe('blocked')
    expect(result.report.reasons).toContain('migration_drop_candidate_evidence_required')
    expect(result.report.candidates).toEqual(expect.arrayContaining([
      {
        objectName: 'public.superseded_empty_table',
        status: 'blocked',
        reasons: ['migration_drop_candidate_evidence_required'],
      },
    ]))
  })

  it('bridges retired-object disposition summaries into fail-closed drop candidates from the CLI', async () => {
    const result = await runLegacyObjectDropGuardCheck(['--from-retired-object-audit'], {
      auditRetiredObjectReferences: () => ({
        status: 'pass',
        objectSummaries: [
          {
            token: 'legacy_runtime_table',
            occurrenceCount: 1,
            runtimeSurfaceCount: 0,
            buckets: { migration_history_or_drop: 1 },
            disposition: 'historical_evidence_only',
            deletionReadiness: 'physical_delete_candidate_after_migration_ledger_review',
          },
        ],
      }),
    })

    expect(result.exitCode).toBe(1)
    expect(result.report.status).toBe('blocked')
    expect(result.report.candidates[0]).toEqual(expect.objectContaining({
      objectName: 'legacy_runtime_table',
      status: 'blocked',
      reasons: expect.arrayContaining([
        'row_count_unknown',
        'dependency_scan_not_passed',
        'missing_structure_export',
      ]),
    }))
  })

  it('fails closed when the candidates file cannot be parsed', async () => {
    const result = await runLegacyObjectDropGuardCheck(['--candidates-file', 'bad.json'], {
      readTextFile: async () => '{',
    })

    expect(result.exitCode).toBe(1)
    expect(result.report).toEqual(expect.objectContaining({
      status: 'blocked',
      reasons: ['row_count_zero_not_sufficient'],
    }))
  })

  it('allows drop readiness only when every physical-drop evidence item is present', async () => {
    const result = await runLegacyObjectDropGuardCheck(['--candidates-file', 'candidates.json'], {
      readTextFile: async () => JSON.stringify({
        candidates: [
          {
            objectName: 'superseded_empty_table',
            classification: 'obsolete_or_superseded',
            rowCount: 0,
            dependencyScan: { pass: true },
            structureExport: { path: 'artifacts/superseded_empty_table.sql' },
            migrationPlan: { path: 'artifacts/plan-drop-superseded-empty-table.md' },
            rollbackPlan: { path: 'artifacts/rollback-superseded-empty-table.md' },
            controlledDropMigration: { filename: '202606280002_drop_superseded_empty_table.sql' },
            postDropReadback: { required: true, pass: true },
            catalogReadback: { pass: true, path: 'artifacts/catalog-readback.json' },
            dependencyReadback: { pass: true, path: 'artifacts/dependency-readback.json' },
            postDropApiSmoke: { pass: true, path: 'artifacts/post-drop-api-smoke.json' },
            approvalRef: 'approval://legacy-drop/superseded_empty_table',
          },
        ],
      }),
    })

    expect(result.exitCode).toBe(0)
    expect(result.report).toEqual({
      status: 'drop_ready',
      candidates: [
        {
          objectName: 'superseded_empty_table',
          status: 'drop_ready',
          reasons: [],
        },
      ],
    })
  })

  it('fails closed when a candidates file lists frontend, job, seed, migration, or policy dependencies', async () => {
    const result = await runLegacyObjectDropGuardCheck(['--candidates-file', 'candidates.json'], {
      readTextFile: async () => JSON.stringify({
        candidates: [
          {
            objectName: 'legacy_scope_surface',
            classification: 'obsolete_or_superseded',
            rowCount: 0,
            dependencyScan: { pass: true },
            structureExport: { path: 'artifacts/legacy_scope_surface.sql' },
            migrationPlan: { path: 'artifacts/plan-drop-legacy-scope-surface.md' },
            rollbackPlan: { path: 'artifacts/rollback-legacy-scope-surface.md' },
            controlledDropMigration: { filename: '202606280004_drop_legacy_scope_surface.sql' },
            postDropReadback: { required: true, pass: true },
            dependencies: {
              frontend: ['client/src/pages/GanttView.tsx'],
              job: ['deletionRetentionCleanupJob'],
              seed: ['legacy_scope_seed'],
              migration: ['019_add_wbs_task_fields.sql.bak'],
              policy: ['legacy_scope_rls_policy'],
            },
          },
        ],
      }),
    })

    expect(result.exitCode).toBe(1)
    expect(result.report.status).toBe('blocked')
    expect(result.report.candidates[0]).toEqual(expect.objectContaining({
      objectName: 'legacy_scope_surface',
      status: 'blocked',
      reasons: expect.arrayContaining(['dependency_detected']),
    }))
  })

  it('requires archived evidence files before accepting physical drop readiness', async () => {
    const result = await runLegacyObjectDropGuardCheck([
      '--require-archived-evidence',
      '--candidates-file',
      'candidates.json',
    ], {
      fileExists: async () => false,
      readTextFile: async () => JSON.stringify({
        candidates: [
          {
            objectName: 'superseded_empty_table',
            classification: 'obsolete_or_superseded',
            rowCount: 0,
            dependencyScan: { pass: true, evidencePath: 'artifacts/dependency-readback.json' },
            structureExport: { path: 'artifacts/superseded_empty_table.sql' },
            migrationPlan: { path: 'artifacts/plan-drop-superseded-empty-table.md' },
            rollbackPlan: { path: 'artifacts/rollback-superseded-empty-table.md' },
            controlledDropMigration: { filename: '202606280002_drop_superseded_empty_table.sql' },
            postDropReadback: { required: true, pass: true, evidencePath: 'artifacts/post-drop-readback.json' },
            catalogReadback: { pass: true, path: 'artifacts/catalog-readback.json' },
            dependencyReadback: { pass: true, path: 'artifacts/live-dependency-readback.json' },
            postDropApiSmoke: { pass: true, path: 'artifacts/post-drop-api-smoke.json' },
            approvalRef: 'approval://legacy-drop/superseded_empty_table',
          },
        ],
      }),
    })

    expect(result.exitCode).toBe(1)
    expect(result.report.status).toBe('blocked')
    expect(result.report.candidates[0]).toEqual(expect.objectContaining({
      objectName: 'superseded_empty_table',
      status: 'blocked',
      reasons: expect.arrayContaining([
        'dependency_scan_not_passed',
        'missing_structure_export',
        'missing_migration_plan',
        'missing_rollback_plan',
        'missing_controlled_drop_migration',
        'post_drop_readback_not_passed',
      ]),
    }))
  })

  it('accepts physical drop readiness only when archived evidence and the controlled migration file exist', async () => {
    const existingFiles = new Set([
      'artifacts/dependency-readback.json',
      'artifacts/superseded_empty_table.sql',
      'artifacts/plan-drop-superseded-empty-table.md',
      'artifacts/rollback-superseded-empty-table.md',
      'migrations/202606280002_drop_superseded_empty_table.sql',
      'artifacts/post-drop-readback.json',
      'artifacts/catalog-readback.json',
      'artifacts/live-dependency-readback.json',
      'artifacts/post-drop-api-smoke.json',
    ])

    const result = await runLegacyObjectDropGuardCheck([
      '--require-archived-evidence',
      '--migrations-dir',
      'migrations',
      '--candidates-file',
      'candidates.json',
    ], {
      fileExists: async (path) => existingFiles.has(path.replace(/\\/g, '/')),
      readTextFile: async () => JSON.stringify({
        candidates: [
          {
            objectName: 'superseded_empty_table',
            classification: 'obsolete_or_superseded',
            rowCount: 0,
            dependencyScan: { pass: true, evidencePath: 'artifacts/dependency-readback.json' },
            structureExport: { path: 'artifacts/superseded_empty_table.sql' },
            migrationPlan: { path: 'artifacts/plan-drop-superseded-empty-table.md' },
            rollbackPlan: { path: 'artifacts/rollback-superseded-empty-table.md' },
            controlledDropMigration: { filename: '202606280002_drop_superseded_empty_table.sql' },
            postDropReadback: { required: true, pass: true, evidencePath: 'artifacts/post-drop-readback.json' },
            catalogReadback: { pass: true, path: 'artifacts/catalog-readback.json' },
            dependencyReadback: { pass: true, path: 'artifacts/live-dependency-readback.json' },
            postDropApiSmoke: { pass: true, path: 'artifacts/post-drop-api-smoke.json' },
            approvalRef: 'approval://legacy-drop/superseded_empty_table',
          },
        ],
      }),
    })

    expect(result.exitCode).toBe(0)
    expect(result.report).toEqual({
      status: 'drop_ready',
      candidates: [
        {
          objectName: 'superseded_empty_table',
          status: 'drop_ready',
          reasons: [],
        },
      ],
    })
  })
})
