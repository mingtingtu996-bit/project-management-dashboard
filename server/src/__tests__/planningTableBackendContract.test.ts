import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildPlanningConflictFieldGroups,
  canAutoMergePlanningUpdate,
  detectPlanningTableConflicts,
} from '../services/planningTableConflictService.js'
import { validatePlanningTableCommitRequest } from '../services/planningTableValidationService.js'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('planning table backend contract', () => {
  it('keeps v1.4.7.6 backend files and routes wired through shared services', () => {
    const indexSource = readServerFile('src', 'index.ts')
    const baselineRouteSource = readServerFile('src', 'routes', 'task-baselines.ts')
    const monthlyRouteSource = readServerFile('src', 'routes', 'monthly-plans.ts')
    const taskRouteSource = readServerFile('src', 'routes', 'tasks.ts')
    const realtimeServiceSource = readServerFile('src', 'services', 'planningRealtimeEventService.ts')

    expect(indexSource).toContain("app.use('/api/planning', planningFieldRegistryRouter)")
    expect(baselineRouteSource).toContain('buildPlanningTableCommitResponse')
    expect(baselineRouteSource).toContain('validatePlanningTableCommitRequest')
    expect(monthlyRouteSource).toContain('buildPlanningTableCommitResponse')
    expect(monthlyRouteSource).toContain('validatePlanningTableCommitRequest')
    expect(taskRouteSource).toContain('buildPlanningTableCommitResponse')
    expect(taskRouteSource).toContain('validatePlanningTableCommitRequest')
    expect(baselineRouteSource).toContain('broadcastPlanningTableChanged')
    expect(monthlyRouteSource).toContain('broadcastPlanningTableChanged')
    expect(taskRouteSource).toContain('broadcastPlanningTableChanged')
    expect(realtimeServiceSource).toContain("type: 'planning.table.changed'")
    expect(realtimeServiceSource).toContain('changedRowIds')
    expect(realtimeServiceSource).toContain('deletedRowIds')
    expect(readServerFile('src', 'services', 'planningTableValidationService.ts')).toContain('validatePlanningTableCommitRequest')
    expect(readServerFile('src', 'services', 'planningTableConflictService.ts')).toContain('detectPlanningTableConflicts')
    expect(readServerFile('src', 'services', 'planningTableCommitService.ts')).toContain('fieldRegistryVersion: PLANNING_FIELD_REGISTRY_VERSION')
    expect(readServerFile('src', 'services', 'planningTableCommitService.ts')).toContain('summarizePlanningTableRealtimeRows')
    expect(readServerFile('src', 'services', 'planningTableCommitService.ts')).toContain('summarizePlanningTableMergeGroups')
    expect(readServerFile('src', 'types', 'planningTable.ts')).toContain('PlanningTableCommitRequest')

    const changeAuditMigration = readServerFile('migrations', '133_v1414_change_audit_governance.sql')
    expect(changeAuditMigration).toContain("'task_list_commit'")
    expect(changeAuditMigration).toContain("'baseline_commit'")
    expect(changeAuditMigration).toContain("'monthly_plan_commit'")
  })

  it('validates the shared planning-table commit envelope before route-specific writes', () => {
    const result = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'progress',
            value: 35,
          },
        ],
      },
      { expectedSurface: 'task_list', validateFieldAccess: true },
    )

    expect(result.ok).toBe(true)
    expect(result.request?.operations).toHaveLength(1)

    const monthlyTargetProgress = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'monthly_plan',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'item-1',
            field: 'target_progress',
            value: 80,
          },
        ],
      },
      { expectedSurface: 'monthly_plan', validateFieldAccess: true },
    )

    expect(monthlyTargetProgress.ok).toBe(true)

    const invalid = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'baseline',
        fieldRegistryVersion: 'v1.4.7',
        operations: [
          {
            type: 'update_cell',
            rowId: 'row-1',
            field: 'progress',
            value: 10,
          },
        ],
      },
      { expectedSurface: 'baseline', validateFieldAccess: true },
    )

    expect(invalid.ok).toBe(false)
    expect(invalid.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'FIELD_REGISTRY_STALE',
      'PLANNING_FIELD_NOT_EDITABLE',
    ]))

    const invalidOperation = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'monthly_plan',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [null],
      },
      { expectedSurface: 'monthly_plan', allowEmptyOperations: true },
    )

    expect(invalidOperation.ok).toBe(false)
    expect(invalidOperation.issues).toEqual([
      expect.objectContaining({
        code: 'PLANNING_OPERATION_INVALID',
        operationIndex: 0,
      }),
    ])
  })

  it('routes WBS parent-child rollup validation through the shared commit validator', () => {
    const invalidRollup = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'child-1',
            field: 'planned_end_date',
            value: '2026-05-01',
          },
        ],
        clientContext: {
          rollupRows: [
            {
              id: 'root-1',
              wbs_node_type: 'division',
              planned_start_date: '2026-05-01',
              planned_end_date: '2026-05-10',
              smart_reference_days: 10,
              duration_contribution_mode: 'duration_bearing',
            },
            {
              id: 'child-1',
              parent_id: 'child-1',
              wbs_node_type: 'process',
              planned_start_date: '2026-05-05',
              planned_end_date: '2026-05-01',
              smart_reference_days: 2,
              duration_contribution_mode: 'invalid-mode',
            },
          ],
        },
      },
      { expectedSurface: 'task_list', validateFieldAccess: true },
    )

    expect(invalidRollup.ok).toBe(false)
    expect(invalidRollup.request).toBeNull()
    expect(invalidRollup.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'WBS_ROLLUP_SELF_PARENT',
        severity: 'block_save',
        rowId: 'child-1',
        field: 'parent_id',
        details: expect.objectContaining({ source: 'wbsPlanRollupService' }),
      }),
      expect.objectContaining({
        code: 'WBS_ROLLUP_INVALID_PLANNED_DATE',
        severity: 'block_save',
        rowId: 'child-1',
        field: 'planned_end_date',
      }),
      expect.objectContaining({
        code: 'WBS_ROLLUP_INVALID_DURATION_CONTRIBUTION_MODE',
        severity: 'block_save',
        rowId: 'child-1',
        field: 'duration_contribution_mode',
      }),
    ]))
  })

  it('blocks shared planning-table commits when new WBS rows omit durationContributionMode', () => {
    const missingMode = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'planned_end_date',
            value: '2026-05-03',
          },
        ],
        clientContext: {
          rollupRows: [
            {
              id: 'task-1',
              wbs_node_type: 'process',
              planned_start_date: '2026-05-01',
              planned_end_date: '2026-05-03',
              smart_reference_days: 3,
            },
          ],
        },
      },
      { expectedSurface: 'task_list', validateFieldAccess: true },
    )

    expect(missingMode.ok).toBe(false)
    expect(missingMode.request).toBeNull()
    expect(missingMode.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'WBS_ROLLUP_MISSING_DURATION_CONTRIBUTION_MODE',
        severity: 'block_save',
        rowId: 'task-1',
        field: 'duration_contribution_mode',
      }),
    ]))
  })

  it('keeps non-blocking WBS rollup diagnostics in edit-state validation instead of blocking commits', () => {
    const warningOnly = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'baseline',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [],
        clientContext: {
          rollupRows: [
            {
              id: 'orphan-1',
              parent_item_id: 'missing-parent',
              wbs_node_type: 'process',
              planned_start_date: '',
              planned_end_date: '2026-05-03',
              smart_reference_days: 3,
              standard_task_metadata: {
                durationContributionMode: 'duration_bearing',
              },
            },
          ],
        },
      },
      {
        expectedSurface: 'baseline',
        allowEmptyOperations: true,
        validateFieldAccess: true,
      },
    )

    expect(warningOnly.ok).toBe(true)
    expect(warningOnly.request).toMatchObject({
      projectId: 'project-1',
      surface: 'baseline',
    })
    expect(warningOnly.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'WBS_ROLLUP_MISSING_PARENT_ROW',
        severity: 'confirm',
        rowId: 'orphan-1',
        field: 'parent_id',
      }),
      expect.objectContaining({
        code: 'WBS_ROLLUP_MISSING_PLANNED_DATE',
        severity: 'confirm',
        rowId: 'orphan-1',
        field: 'planned_start_date',
      }),
    ]))
  })

  it('applies field-registry validators before route-specific writes', () => {
    const outOfRange = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'progress',
            value: 120,
          },
        ],
      },
      { expectedSurface: 'task_list', validateFieldAccess: true },
    )

    expect(outOfRange.ok).toBe(false)
    expect(outOfRange.issues).toEqual([
      expect.objectContaining({
        code: 'PLANNING_FIELD_VALUE_OUT_OF_RANGE',
        field: 'progress',
        rowId: 'task-1',
      }),
    ])

    const invalidDates = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'baseline',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_row',
            rowId: 'row-1',
            values: {
              planned_start_date: '2026-05-10',
              planned_end_date: '2026-05-01',
            },
          },
        ],
      },
      { expectedSurface: 'baseline', validateFieldAccess: true },
    )

    expect(invalidDates.ok).toBe(false)
    expect(invalidDates.issues).toEqual([
      expect.objectContaining({
        code: 'PLANNING_FIELD_VALUE_DATE_ORDER',
        field: 'planned_end_date',
      }),
    ])

    const executableMissingDate = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'create_row',
            clientRowId: 'local-1',
            values: {
              title: '新增工序',
              wbs_node_type: 'process',
              planned_start_date: '',
              planned_end_date: '2026-05-20',
            },
          },
        ],
      },
      { expectedSurface: 'task_list', validateFieldAccess: true },
    )

    expect(executableMissingDate.ok).toBe(false)
    expect(executableMissingDate.issues.map((issue) => issue.code)).toContain(
      'PLANNING_FIELD_VALUE_REQUIRED_FOR_EXECUTABLE',
    )
  })

  it('guards cross-system fields through the shared field registry access rules', () => {
    const assigneeText = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_row',
            rowId: 'task-1',
            values: {
              assignee_name: 'Free text assignee',
              participant_unit_id: 'unit-1',
              engineering_object_id: 'object-1',
            },
          },
          {
            type: 'set_predecessors',
            rowId: 'task-1',
            predecessorTaskIds: ['task-0'],
          },
        ],
      },
      { expectedSurface: 'task_list', validateFieldAccess: true },
    )

    expect(assigneeText.ok).toBe(true)

    const readonlyDerived = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_row',
            rowId: 'task-1',
            values: {
              acceptance_impact_summary: [{ id: 'acceptance-1' }],
              actual_start_date: '2026-05-01',
              is_critical: true,
              validation_hint: 'missing owner',
            },
          },
        ],
      },
      { expectedSurface: 'task_list', validateFieldAccess: true },
    )

    expect(readonlyDerived.ok).toBe(false)
    expect(readonlyDerived.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PLANNING_FIELD_NOT_EDITABLE', field: 'acceptance_impact_summary' }),
      expect.objectContaining({ code: 'PLANNING_FIELD_NOT_EDITABLE', field: 'actual_start_date' }),
      expect.objectContaining({ code: 'PLANNING_FIELD_NOT_EDITABLE', field: 'is_critical' }),
      expect.objectContaining({ code: 'PLANNING_FIELD_NOT_EDITABLE', field: 'validation_hint' }),
    ]))

    const monthlyTaskOnlyFields = validatePlanningTableCommitRequest(
      {
        projectId: 'project-1',
        surface: 'monthly_plan',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_row',
            rowId: 'item-1',
            values: {
              participant_unit_id: 'unit-1',
              predecessor_task_ids: ['task-0'],
            },
          },
        ],
      },
      { expectedSurface: 'monthly_plan', validateFieldAccess: true },
    )

    expect(monthlyTaskOnlyFields.ok).toBe(false)
    expect(monthlyTaskOnlyFields.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PLANNING_FIELD_NOT_EDITABLE', field: 'participant_unit_id' }),
      expect.objectContaining({ code: 'PLANNING_FIELD_NOT_EDITABLE', field: 'predecessor_task_ids' }),
    ]))
  })

  it('uses registry merge groups to distinguish auto-mergeable edits from conflicts', () => {
    const fieldGroups = buildPlanningConflictFieldGroups([
      { key: 'title', mergeGroup: 'identity' },
      { key: 'planned_start_date', mergeGroup: 'schedule' },
      { key: 'planned_end_date', mergeGroup: 'schedule' },
      { key: 'participant_unit_id', mergeGroup: 'participant_unit' },
    ])

    expect(canAutoMergePlanningUpdate(
      { title: 'Task', planned_start_date: '2026-05-01', planned_end_date: '2026-05-03' },
      { title: 'Task A' },
      { title: 'Task', planned_start_date: '2026-05-02', planned_end_date: '2026-05-03' },
      { fieldGroups },
    )).toBe(true)

    const conflicts = detectPlanningTableConflicts(
      [{ id: 'row-1', title: 'Task', planned_start_date: '2026-05-01', planned_end_date: '2026-05-03' }],
      [{ id: 'row-1', title: 'Task', planned_start_date: '2026-05-04', planned_end_date: '2026-05-03' }],
      [{ id: 'row-1', title: 'Task', planned_start_date: '2026-05-02', planned_end_date: '2026-05-03' }],
      { fieldGroups },
    )

    expect(conflicts).toEqual([
      expect.objectContaining({
        rowId: 'row-1',
        label: 'Task',
        fields: ['planned_start_date'],
        mergeGroups: ['planned_start_date+planned_end_date'],
      }),
    ])
  })
})
