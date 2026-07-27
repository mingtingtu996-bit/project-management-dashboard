import { describe, expect, it } from 'vitest'
import {
  buildFieldRegistryStaleResponse,
  buildPlanningTableCommitResponse,
  isPlanningFieldRegistryVersionCurrent,
  summarizePlanningTableGovernanceCounts,
  summarizePlanningTableMergeGroups,
  summarizePlanningTableRealtimeRows,
} from '../services/planningTableCommitService.js'

describe('planning table commit service', () => {
  it('treats field registry version as a hard commit precondition', () => {
    expect(isPlanningFieldRegistryVersionCurrent('v1.4.7.6')).toBe(true)
    expect(isPlanningFieldRegistryVersionCurrent('v1.4.7')).toBe(false)
    expect(isPlanningFieldRegistryVersionCurrent(undefined)).toBe(false)

    expect(buildFieldRegistryStaleResponse('v1.4.7')).toMatchObject({
      success: false,
      error: {
        code: 'FIELD_REGISTRY_STALE',
        details: {
          expectedVersion: 'v1.4.7.6',
          receivedVersion: 'v1.4.7',
        },
      },
    })
  })

  it('builds one shared commit response shape for all planning tables', () => {
    const response = buildPlanningTableCommitResponse({
      surface: 'task_list',
      resourceId: null,
      revision: 42,
      rows: [{ id: 'task-1', title: 'Task' }],
      operations: [
        { type: 'update_cell', rowId: 'task-1', field: 'progress', value: 50 },
        { type: 'set_predecessors', rowId: 'task-1', predecessorTaskIds: ['task-0'] },
      ],
      createdRowCount: 1,
      deletedRowCount: 1,
      changedRowCount: 3,
      tempIdMap: new Map([['tmp-1', 'task-1']]),
      realtimeEvents: ['project.tasks.changed'],
      deletionResults: [{ rowId: 'task-2', action: 'deleted' }],
      validationIssues: [{ code: 'WBS_ROLLUP_MISSING_PLANNED_DATE', severity: 'confirm', rowId: 'task-1' }],
    })

    expect(response).toMatchObject({
      success: true,
      surface: 'task_list',
      resourceId: null,
      revision: 42,
      fieldRegistryVersion: 'v1.4.7.6',
      governanceSummary: {
        changedRowCount: 3,
        createdRowCount: 1,
        updatedRowCount: 1,
        deletedRowCount: 1,
        progressAdjustmentCount: 1,
        dependencyChangeCount: 1,
      },
      realtimeEvents: ['project.tasks.changed'],
      tempIdMap: { 'tmp-1': 'task-1' },
      validationIssues: [
        { code: 'WBS_ROLLUP_MISSING_PLANNED_DATE', severity: 'confirm', rowId: 'task-1' },
      ],
    })
    expect(response.rows).toHaveLength(1)
    expect(response.deletionResults).toEqual([{ rowId: 'task-2', action: 'deleted' }])
  })

  it('summarizes governance counts from commit operations', () => {
    expect(summarizePlanningTableGovernanceCounts([
      { type: 'update_cell', rowId: 'row-1', field: 'planned_start_date', value: '2026-05-01' },
      { type: 'update_row', rowId: 'row-1', values: { target_progress: 80, is_milestone: true } },
      { type: 'mark_milestone', rowId: 'row-2', isMilestone: true },
      { type: 'set_predecessors', rowId: 'row-3', predecessorTaskIds: ['row-1'] },
    ])).toEqual({
      dateAdjustmentCount: 1,
      progressAdjustmentCount: 1,
      milestoneChangeCount: 2,
      dependencyChangeCount: 1,
    })
  })

  it('summarizes commit changes by backend field registry merge groups', () => {
    expect(summarizePlanningTableMergeGroups([
      {
        type: 'create_row',
        tempId: 'tmp-1',
        values: {
          title: 'New',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-02',
        },
      },
      { type: 'update_cell', rowId: 'row-1', field: 'progress', value: 50 },
      { type: 'move_row', rowId: 'row-1', parentId: 'parent-1', sortOrder: 2 },
      { type: 'set_predecessors', rowId: 'row-1', predecessorTaskIds: ['row-0'] },
    ])).toEqual({
      dependency: {
        operationCount: 1,
        fieldCount: 1,
        fields: ['predecessor_task_ids'],
      },
      identity: {
        operationCount: 1,
        fieldCount: 1,
        fields: ['title'],
      },
      node_control: {
        operationCount: 1,
        fieldCount: 1,
        fields: ['sort_order'],
      },
      progress_status: {
        operationCount: 1,
        fieldCount: 1,
        fields: ['progress'],
      },
      schedule: {
        operationCount: 1,
        fieldCount: 2,
        fields: ['planned_end_date', 'planned_start_date'],
      },
    })
  })

  it('summarizes changed and deleted row ids for planning table realtime events', () => {
    const summary = summarizePlanningTableRealtimeRows(
      [
        { type: 'create_row', tempId: 'tmp-1', values: { title: 'New' } },
        { type: 'update_cell', rowId: 'row-1', field: 'title', value: 'Edited' },
        { type: 'move_row', rowId: 'row-2', sortOrder: 3 },
        { type: 'delete_row', rowId: 'row-2' },
      ],
      new Map([['tmp-1', 'real-row-1']]),
    )

    expect(summary).toEqual({
      changedRowIds: ['real-row-1', 'row-1'],
      deletedRowIds: ['row-2'],
    })
  })
})
