import { describe, expect, it } from 'vitest'

import { evaluateLegacyObjectDropCandidates } from '../services/legacyObjectDropGuardService.js'

describe('legacy object drop guard', () => {
  it('blocks rowCount-only candidates because empty data is not sufficient evidence', () => {
    const [result] = evaluateLegacyObjectDropCandidates([
      {
        objectName: 'old_project_summary',
        classification: 'obsolete_or_superseded',
        rowCount: 0,
      },
    ])

    expect(result).toMatchObject({
      objectName: 'old_project_summary',
      status: 'blocked',
    })
    expect(result.reasons).toContain('row_count_zero_not_sufficient')
  })

  it('blocks candidates with runtime dependencies even when rowCount is zero', () => {
    const [result] = evaluateLegacyObjectDropCandidates([
      {
        objectName: 'legacy_runtime_view',
        classification: 'obsolete_or_superseded',
        rowCount: 0,
        dependencyScan: { pass: true },
        structureExport: { path: 'artifacts/legacy_runtime_view.sql' },
        rollbackPlan: { path: 'artifacts/rollback-legacy-runtime-view.md' },
        controlledDropMigration: { filename: '202606280001_drop_legacy_runtime_view.sql' },
        postDropReadback: { required: true },
        dependencies: {
          runtime: ['projectExecutionSummaryService'],
        },
      },
    ])

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain('dependency_detected')
  })

  it('blocks every documented dependency class before approving physical deletion', () => {
    const [result] = evaluateLegacyObjectDropCandidates([
      {
        objectName: 'legacy_surface_with_non_runtime_dependencies',
        classification: 'obsolete_or_superseded',
        rowCount: 0,
        dependencyScan: { pass: true },
        structureExport: { path: 'artifacts/legacy_surface_with_non_runtime_dependencies.sql' },
        rollbackPlan: { path: 'artifacts/rollback-legacy-surface.md' },
        controlledDropMigration: { filename: '202606280003_drop_legacy_surface.sql' },
        postDropReadback: { required: true, pass: true },
        dependencies: {
          frontend: ['client/src/pages/GanttView.tsx'],
          job: ['deletionRetentionCleanupJob'],
          seed: ['algorithm_seed:legacy_scope'],
          migration: ['019_add_wbs_task_fields.sql.bak'],
          policy: ['legacy_rls_policy'],
        },
      },
    ])

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain('dependency_detected')
  })

  it('retains compatibility candidates instead of approving a physical drop', () => {
    const [result] = evaluateLegacyObjectDropCandidates([
      {
        objectName: 'legacy_compatibility_bridge',
        classification: 'compatibility',
        rowCount: 0,
      },
    ])

    expect(result).toMatchObject({
      objectName: 'legacy_compatibility_bridge',
      status: 'retain_compatibility',
      reasons: ['compatibility_surface'],
    })
  })

  it('blocks candidates when post-drop readback is required but has not passed', () => {
    const [result] = evaluateLegacyObjectDropCandidates([
      {
        objectName: 'superseded_empty_table',
        classification: 'obsolete_or_superseded',
        rowCount: 0,
        dependencyScan: { pass: true },
        structureExport: { path: 'artifacts/superseded_empty_table.sql' },
        rollbackPlan: { path: 'artifacts/rollback-superseded-empty-table.md' },
        controlledDropMigration: { filename: '202606280002_drop_superseded_empty_table.sql' },
        postDropReadback: { required: true, pass: false },
      },
    ])

    expect(result).toMatchObject({
      objectName: 'superseded_empty_table',
      status: 'blocked',
    })
    expect(result.reasons).toContain('post_drop_readback_not_passed')
  })

  it('blocks physical deletion until a migration plan is archived', () => {
    const [result] = evaluateLegacyObjectDropCandidates([
      {
        objectName: 'superseded_empty_table',
        classification: 'obsolete_or_superseded',
        rowCount: 0,
        dependencyScan: { pass: true },
        structureExport: { path: 'artifacts/superseded_empty_table.sql' },
        rollbackPlan: { path: 'artifacts/rollback-superseded-empty-table.md' },
        controlledDropMigration: { filename: '202606280002_drop_superseded_empty_table.sql' },
        postDropReadback: { required: true, pass: true },
      },
    ])

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain('missing_migration_plan')
  })

  it('marks otherwise complete candidates as needs_gating until real post-drop readback passes', () => {
    const [result] = evaluateLegacyObjectDropCandidates([
      {
        objectName: 'superseded_empty_table',
        classification: 'obsolete_or_superseded',
        rowCount: 0,
        dependencyScan: { pass: true },
        structureExport: { path: 'artifacts/superseded_empty_table.sql' },
        migrationPlan: { path: 'artifacts/plan-drop-superseded-empty-table.md' },
        rollbackPlan: { path: 'artifacts/rollback-superseded-empty-table.md' },
        controlledDropMigration: { filename: '202606280002_drop_superseded_empty_table.sql' },
        postDropReadback: { required: true, pass: false },
      },
    ])

    expect(result).toEqual({
      objectName: 'superseded_empty_table',
      status: 'needs_gating',
      reasons: ['post_drop_readback_not_passed'],
    })
  })

  it('blocks otherwise complete physical deletion candidates until live readback, API smoke, and approval are archived', () => {
    const [result] = evaluateLegacyObjectDropCandidates([
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
      },
    ])

    expect(result).toEqual({
      objectName: 'superseded_empty_table',
      status: 'blocked',
      reasons: expect.arrayContaining([
        'missing_catalog_readback',
        'dependency_readback_not_passed',
        'post_drop_api_smoke_not_passed',
        'missing_approval_ref',
        'row_count_zero_not_sufficient',
      ]),
    })
  })

  it('marks a candidate drop_ready only when every required evidence item is present and post-drop readback passed', () => {
    const [result] = evaluateLegacyObjectDropCandidates([
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
    ])

    expect(result).toEqual({
      objectName: 'superseded_empty_table',
      status: 'drop_ready',
      reasons: [],
    })
  })
})
