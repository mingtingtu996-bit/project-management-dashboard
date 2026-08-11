import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

import {
  readDurationContextActiveTaskDependencies,
  readDurationContextProgressTrendSnapshotRows,
  readDurationContextProgressQualityFindings,
  readDurationContextResourceConflictTaskRows,
  readDurationContextResourceReadinessRows,
  readDurationContextResponsibleUnitHistoryRows,
  readDurationContextTaskContextRow,
  readDurationContextTaskMaterialRows,
  readDurationContextTaskProgressSnapshotRows,
  readDurationContextTaskReadinessRows,
  readDurationContextTaskReadinessSignalRows,
} from '../services/durationContextFactReadModelService.js'

type QueryCall = {
  table: string
  select?: string
  eq: Array<[string, unknown]>
  in: Array<[string, unknown[]]>
  not: Array<[string, string, unknown]>
  order: Array<[string, unknown]>
  limit?: number
  maybeSingle?: boolean
}

const calls: QueryCall[] = []
let rowsByTable = new Map<string, Record<string, unknown>[]>()
let rejectTables = new Set<string>()

function createQuery(table: string) {
  const call: QueryCall = { table, eq: [], in: [], not: [], order: [] }
  calls.push(call)
  const query = {
    select(fields: string) {
      call.select = fields
      return query
    },
    eq(column: string, value: unknown) {
      call.eq.push([column, value])
      return query
    },
    in(column: string, value: unknown[]) {
      call.in.push([column, value])
      return query
    },
    not(column: string, operator: string, value: unknown) {
      call.not.push([column, operator, value])
      return query
    },
    order(column: string, options?: unknown) {
      call.order.push([column, options])
      return query
    },
    limit(count: number) {
      call.limit = count
      return query
    },
    maybeSingle() {
      call.maybeSingle = true
      return query
    },
    then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) {
      if (rejectTables.has(table)) {
        return Promise.resolve(reject?.(new Error(`blocked ${table}`)))
      }
      const rows = rowsByTable.get(table) ?? []
      return Promise.resolve(resolve({ data: call.maybeSingle ? rows[0] ?? null : rows, error: null }))
    },
  }
  return query
}

beforeEach(() => {
  calls.length = 0
  rowsByTable = new Map()
  rejectTables = new Set()
  mocks.supabaseFrom.mockReset()
  mocks.supabaseFrom.mockImplementation(createQuery)
})

describe('durationContextFactReadModelService', () => {
  it('reads a single task context row without leaking tasks query construction to durationContextService', async () => {
    rowsByTable.set('tasks', [{ id: 'task-context-1', project_id: 'project-1' }])

    const result = await readDurationContextTaskContextRow({ taskId: 'task-context-1' })

    expect(result).toEqual({
      data: { id: 'task-context-1', project_id: 'project-1' },
      error: null,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      table: 'tasks',
      eq: [['id', 'task-context-1']],
      maybeSingle: true,
    }))
    expect(calls[0].select).toContain('standard_task_metadata')
  })

  it('reads task readiness rows with explicit material ids through the fact read model', async () => {
    rowsByTable.set('task_conditions', [{ id: 'condition-1' }])
    rowsByTable.set('task_obstacles', [{ id: 'obstacle-1' }])
    rowsByTable.set('project_materials', [{ id: 'material-1' }])

    const rows = await readDurationContextTaskReadinessRows({
      taskId: 'task-1',
      projectId: 'project-1',
      explicitMaterialIds: ['material-1', 'material-1', ''],
    })

    expect(rows.conditions).toEqual([{ id: 'condition-1' }])
    expect(rows.obstacles).toEqual([{ id: 'obstacle-1' }])
    expect(rows.materials).toEqual([{ id: 'material-1' }])
    expect(calls.map((call) => call.table)).toEqual([
      'task_conditions',
      'task_obstacles',
      'project_materials',
    ])
    expect(calls[0].eq).toContainEqual(['task_id', 'task-1'])
    expect(calls[1].eq).toContainEqual(['task_id', 'task-1'])
    expect(calls[2].in).toContainEqual(['id', ['material-1']])
  })

  it('scopes task material reads to the supplied project', async () => {
    rowsByTable.set('task_conditions', [{ id: 'condition-1' }])
    rowsByTable.set('task_obstacles', [{ id: 'obstacle-1' }])
    rowsByTable.set('project_materials', [{ id: 'material-1' }])

    await readDurationContextTaskReadinessRows({
      taskId: 'task-1',
      projectId: 'project-1',
      explicitMaterialIds: ['material-1'],
    })

    expect(calls.find((call) => call.table === 'task_conditions')?.eq).toContainEqual(['task_id', 'task-1'])
    expect(calls.find((call) => call.table === 'task_obstacles')?.eq).toContainEqual(['task_id', 'task-1'])
    expect(calls.find((call) => call.table === 'project_materials')?.eq).toContainEqual(['project_id', 'project-1'])
  })

  it('scopes direct task material reads to the supplied project', async () => {
    rowsByTable.set('project_materials', [{ id: 'material-1' }])

    await readDurationContextTaskMaterialRows({
      taskId: 'task-1',
      projectId: 'project-1',
      explicitMaterialIds: ['material-1'],
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].eq).toContainEqual(['project_id', 'project-1'])
    expect(calls[0].in).toContainEqual(['id', ['material-1']])
  })

  it('fails closed when direct task material reads lack a project scope', async () => {
    rowsByTable.set('project_materials', [{ id: 'material-1' }])

    const rows = await readDurationContextTaskMaterialRows({
      taskId: 'task-1',
      projectId: '',
      explicitMaterialIds: ['material-1'],
    })

    expect(rows).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('preserves task-scoped readiness signals without project scope while omitting materials', async () => {
    rowsByTable.set('task_conditions', [{ id: 'condition-legacy', task_id: 'task-1' }])
    rowsByTable.set('task_obstacles', [{ id: 'obstacle-legacy', task_id: 'task-1' }])
    rowsByTable.set('project_materials', [{ id: 'material-legacy' }])

    const rows = await readDurationContextTaskReadinessRows({ taskId: 'task-1' })

    expect(rows).toEqual({
      conditions: [{ id: 'condition-legacy', task_id: 'task-1' }],
      obstacles: [{ id: 'obstacle-legacy', task_id: 'task-1' }],
      materials: [],
    })
    expect(calls.map((call) => call.table)).toEqual(['task_conditions', 'task_obstacles'])
  })

  it('merges canonical task condition material references with explicit material ids', async () => {
    rowsByTable.set('task_conditions', [
      {
        id: 'condition-material-1',
        task_id: 'task-1',
        condition_type: 'material',
        source_type: 'project_material',
        source_ref_id: 'material-condition',
      },
      {
        id: 'condition-drawing-1',
        task_id: 'task-1',
        condition_type: 'drawing',
        source_type: 'drawing_package',
        source_ref_id: 'drawing-1',
      },
    ])
    rowsByTable.set('project_materials', [
      { id: 'material-explicit' },
      { id: 'material-condition' },
    ])

    const rows = await readDurationContextTaskReadinessRows({
      taskId: 'task-1',
      projectId: 'project-1',
      explicitMaterialIds: ['material-explicit'],
    })

    expect(rows.materials).toEqual([
      { id: 'material-explicit' },
      { id: 'material-condition' },
    ])
    expect(calls.filter((call) => call.table === 'project_materials')).toHaveLength(1)
    expect(calls.find((call) => call.table === 'project_materials')?.in).toContainEqual([
      'id',
      ['material-explicit', 'material-condition'],
    ])
  })

  it('selects only columns that exist in the deployed readiness schema', async () => {
    await readDurationContextTaskReadinessRows({
      taskId: 'task-schema-1',
      projectId: 'project-1',
      explicitMaterialIds: ['material-1'],
    })

    const conditionSelect = calls.find((call) => call.table === 'task_conditions')?.select ?? ''
    const obstacleSelect = calls.find((call) => call.table === 'task_obstacles')?.select ?? ''
    const materialSelect = calls.find((call) => call.table === 'project_materials')?.select ?? ''

    expect(conditionSelect).not.toMatch(/(?:^|, )title(?:,|$)/)
    expect(conditionSelect).not.toMatch(/planned_date|expected_date|due_date/)
    expect(obstacleSelect).not.toMatch(/(?:^|, )title(?:,|$)/)
    expect(obstacleSelect).not.toContain('source_entity_type')
    expect(materialSelect).not.toContain('linked_task_id')
  })

  it('resolves resource material rows through task condition material references', async () => {
    rowsByTable.set('task_conditions', [
      { task_id: 'task-1', condition_type: 'material', source_ref_id: 'material-1' },
      { task_id: 'task-2', condition_type: 'material', source_entity_type: 'project_material', source_entity_id: 'material-2' },
    ])
    rowsByTable.set('project_materials', [{ id: 'material-1' }, { id: 'material-2' }])

    const rows = await readDurationContextResourceReadinessRows({
      projectId: 'project-1',
      taskIds: ['task-1', 'task-2'],
    })

    expect(rows.materials).toEqual([
      { id: 'material-1', linked_task_id: 'task-1' },
      { id: 'material-2', linked_task_id: 'task-2' },
    ])
    expect(calls.find((call) => call.table === 'project_materials')?.in).toContainEqual(['id', ['material-1', 'material-2']])
  })

  it('fails closed without querying materials when no explicit material ids exist', async () => {
    const rows = await readDurationContextTaskMaterialRows({ taskId: 'task-2', projectId: 'project-1' })

    expect(rows).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('can read only task readiness signal rows without material fallback queries', async () => {
    rowsByTable.set('task_conditions', [{ id: 'condition-2' }])
    rowsByTable.set('task_obstacles', [{ id: 'obstacle-2' }])

    const rows = await readDurationContextTaskReadinessSignalRows({ taskId: 'task-3' })

    expect(rows).toEqual({
      conditions: [{ id: 'condition-2' }],
      obstacles: [{ id: 'obstacle-2' }],
    })
    expect(calls.map((call) => call.table)).toEqual(['task_conditions', 'task_obstacles'])
  })

  it('does not infer material links when task conditions have no material reference', async () => {
    rowsByTable.set('task_conditions', [{ task_id: 'task-1' }])
    rowsByTable.set('task_obstacles', [{ task_id: 'task-2' }])

    const rows = await readDurationContextResourceReadinessRows({
      projectId: 'project-1',
      taskIds: ['task-1', 'task-2', 'task-1'],
    })

    expect(rows.conditions).toEqual([{ task_id: 'task-1' }])
    expect(rows.obstacles).toEqual([{ task_id: 'task-2' }])
    expect(rows.materials).toEqual([])
    expect(calls[0].eq).toContainEqual(['project_id', 'project-1'])
    expect(calls[0].in).toContainEqual(['task_id', ['task-1', 'task-2']])
    expect(calls.map((call) => call.table)).toEqual(['task_conditions', 'task_obstacles'])
  })

  it('reads task progress snapshots with ordering and caller-selected fields', async () => {
    rowsByTable.set('task_progress_snapshots', [{ progress: 50 }])

    const rows = await readDurationContextTaskProgressSnapshotRows({
      taskId: 'task-4',
      select: 'progress, snapshot_date, created_at, notes, event_source',
      limit: 20,
    })

    expect(rows).toEqual([{ progress: 50 }])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      table: 'task_progress_snapshots',
      select: 'progress, snapshot_date, created_at, notes, event_source',
      eq: [['task_id', 'task-4']],
      order: [['created_at', { ascending: true }]],
      limit: 20,
    }))
  })

  it('reads progress trend snapshots for a deduped task set', async () => {
    rowsByTable.set('task_progress_snapshots', [{ task_id: 'task-1', progress: 20 }])

    const rows = await readDurationContextProgressTrendSnapshotRows({
      taskIds: ['task-1', 'task-2', 'task-1'],
    })

    expect(rows).toEqual([{ task_id: 'task-1', progress: 20 }])
    expect(calls).toHaveLength(1)
    expect(calls[0].select).toBe('task_id, progress, snapshot_date, created_at')
    expect(calls[0].in).toContainEqual(['task_id', ['task-1', 'task-2']])
  })

  it('reads progress quality findings for scoped rule codes', async () => {
    rowsByTable.set('data_quality_findings', [{ id: 'finding-1' }])

    const rows = await readDurationContextProgressQualityFindings({
      taskId: 'task-5',
      ruleCodes: ['RULE_A', 'RULE_A', ''],
    })

    expect(rows).toEqual([{ id: 'finding-1' }])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      table: 'data_quality_findings',
      select: 'id, rule_code, status, severity, resolved_type, resolved_at, details_json',
      eq: [['task_id', 'task-5']],
      in: [['rule_code', ['RULE_A']]],
    }))
  })

  it('reads active task dependencies for workflow context', async () => {
    rowsByTable.set('task_dependencies', [{ id: 'dependency-1', status: 'active' }])

    const rows = await readDurationContextActiveTaskDependencies({ taskId: 'task-6' })

    expect(rows).toEqual([{ id: 'dependency-1', status: 'active' }])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      table: 'task_dependencies',
      select: 'id, dependency_task_id, dependency_type, lag_days, status',
      eq: [['task_id', 'task-6'], ['status', 'active']],
    }))
  })

  it('reads responsible-unit completed task history from the tasks fact read model', async () => {
    rowsByTable.set('tasks', [{ id: 'history-task-1' }])

    const rows = await readDurationContextResponsibleUnitHistoryRows({
      projectId: 'project-1',
      responsibleUnitId: 'unit-1',
    })

    expect(rows).toEqual([{ id: 'history-task-1' }])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      table: 'tasks',
      select: 'id, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date',
      eq: [['project_id', 'project-1'], ['participant_unit_id', 'unit-1']],
      not: [['actual_end_date', 'is', null]],
      limit: 80,
    }))
  })

  it('reads resource-conflict task candidates while excluding the current task and closed statuses', async () => {
    rowsByTable.set('tasks', [{ id: 'overlap-task-1' }])

    const rows = await readDurationContextResourceConflictTaskRows({
      projectId: 'project-1',
      excludedTaskId: 'task-current',
    })

    expect(rows).toEqual([{ id: 'overlap-task-1' }])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      table: 'tasks',
      eq: [['project_id', 'project-1']],
      not: [
        ['id', 'eq', 'task-current'],
        ['status', 'in', '(completed,cancelled,closed,deleted)'],
      ],
    }))
    expect(calls[0].select).toContain('standard_task_metadata')
  })

  it('fails closed to empty rows when an underlying table read rejects', async () => {
    rowsByTable.set('task_conditions', [{ id: 'condition-1' }])
    rowsByTable.set('project_materials', [{ id: 'material-1' }])
    rejectTables.add('task_obstacles')

    const rows = await readDurationContextTaskReadinessRows({
      taskId: 'task-1',
      projectId: 'project-1',
      explicitMaterialIds: ['material-1'],
    })

    expect(rows).toEqual({
      conditions: [{ id: 'condition-1' }],
      obstacles: [],
      materials: [{ id: 'material-1' }],
    })
  })
})
