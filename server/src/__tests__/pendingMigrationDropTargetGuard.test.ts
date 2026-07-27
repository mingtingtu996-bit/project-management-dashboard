import { describe, expect, it, vi } from 'vitest'

import {
  evaluatePendingMigrationDropTargets,
  targetExists,
  type PendingMigrationSource,
} from '../scripts/check-pending-migration-drop-targets.js'

describe('pending migration DROP target guard', () => {
  it('passes only when an idempotent DROP is a no-op on the current target', async () => {
    const migrations: PendingMigrationSource[] = [{
      filename: '298_extended_schema_drift_reconciliation.sql',
      sql: 'DROP FUNCTION IF EXISTS public.has_project_edit_permission(UUID, UUID);',
    }]

    const result = await evaluatePendingMigrationDropTargets(migrations, async () => false)

    expect(result.status).toBe('pass')
    expect(result.reasonCodes).toEqual([])
    expect(result.targets).toEqual([expect.objectContaining({
      objectName: 'public.has_project_edit_permission(UUID, UUID)',
      targetState: 'absent_noop',
    })])
  })

  it('blocks when the target currently exists and therefore needs governed drop evidence', async () => {
    const migrations: PendingMigrationSource[] = [{
      filename: '298_extended_schema_drift_reconciliation.sql',
      sql: 'DROP MATERIALIZED VIEW IF EXISTS public.mv_project_dashboard;',
    }]

    const result = await evaluatePendingMigrationDropTargets(migrations, async () => true)

    expect(result.status).toBe('blocked')
    expect(result.reasonCodes).toContain('existing_drop_target_requires_governed_evidence')
    expect(result.targets[0]).toEqual(expect.objectContaining({
      targetState: 'existing_requires_evidence',
    }))
  })

  it('allows an existing target only for an explicitly approved pending migration', async () => {
    const filename = '300_runtime_legacy_compatibility_cleanup.sql'
    const migrations: PendingMigrationSource[] = [{
      filename,
      sql: 'ALTER TABLE public.tasks DROP COLUMN IF EXISTS phase_id;',
    }]

    const result = await evaluatePendingMigrationDropTargets(
      migrations,
      async () => true,
      { explicitlyApprovedMigrations: new Set([filename]) },
    )

    expect(result.status).toBe('pass')
    expect(result.reasonCodes).toEqual([])
    expect(result.explicitlyApprovedMigrations).toEqual([filename])
    expect(result.targets[0]).toEqual(expect.objectContaining({
      objectType: 'column',
      objectName: 'public.tasks.phase_id',
      targetState: 'existing_explicitly_approved',
    }))
  })

  it('checks column targets through the PostgreSQL catalog', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ exists: true }] })

    const exists = await targetExists({ query } as never, {
      migrationFile: '300_runtime_legacy_compatibility_cleanup.sql',
      objectType: 'column',
      objectName: 'public.tasks.phase_id',
      line: 1,
      ifExists: true,
    })

    expect(exists).toBe(true)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM pg_attribute'), [
      'public',
      'tasks',
      'phase_id',
    ])
  })

  it('blocks an absent target when an earlier pending migration can recreate it', async () => {
    const migrations: PendingMigrationSource[] = [
      {
        filename: '297_recreate_legacy_dashboard.sql',
        sql: 'CREATE MATERIALIZED VIEW public.mv_project_dashboard AS SELECT 1 AS id;',
      },
      {
        filename: '298_extended_schema_drift_reconciliation.sql',
        sql: 'DROP MATERIALIZED VIEW IF EXISTS public.mv_project_dashboard;',
      },
    ]

    const result = await evaluatePendingMigrationDropTargets(migrations, async () => false)

    expect(result.status).toBe('blocked')
    expect(result.reasonCodes).toContain('earlier_pending_migration_recreates_drop_target')
    expect(result.targets[0]).toEqual(expect.objectContaining({
      targetState: 'pending_recreate_requires_evidence',
      recreatedBy: '297_recreate_legacy_dashboard.sql',
    }))
  })

  it('blocks a non-idempotent DROP even when the target is currently absent', async () => {
    const migrations: PendingMigrationSource[] = [{
      filename: '298_extended_schema_drift_reconciliation.sql',
      sql: 'DROP TRIGGER update_task_conditions_updated_at ON public.task_conditions;',
    }]

    const result = await evaluatePendingMigrationDropTargets(migrations, async () => false)

    expect(result.status).toBe('blocked')
    expect(result.reasonCodes).toContain('non_idempotent_drop_target_absent')
  })
})
