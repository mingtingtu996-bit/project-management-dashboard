import { beforeEach, describe, expect, it, vi } from 'vitest'

type TableName = 'task_baselines' | 'task_baseline_items' | 'revision_pool_candidates'
type Row = Record<string, any>

const state = vi.hoisted(() => {
  const tables: Record<TableName, Row[]> = {
    task_baselines: [],
    task_baseline_items: [],
    revision_pool_candidates: [],
  }

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value))
  }

  function matchesFilters(row: Row, filters: Array<{ type: 'eq' | 'in'; column: string; value: unknown }>) {
    return filters.every((filter) => {
      if (filter.type === 'eq') {
        return row[filter.column] === filter.value
      }
      return Array.isArray(filter.value) && filter.value.includes(row[filter.column])
    })
  }

  class QueryBuilder {
    private table: TableName
    private filters: Array<{ type: 'eq' | 'in'; column: string; value: unknown }> = []
    private mode: 'select' | 'insert' | 'update' = 'select'
    private payload: any = null
    private orderBy: { column: string; ascending: boolean } | null = null
    private limitCount: number | null = null

    constructor(table: string) {
      this.table = table as TableName
    }

    select() {
      return this
    }

    eq(column: string, value: unknown) {
      this.filters.push({ type: 'eq', column, value })
      return this
    }

    in(column: string, value: unknown[]) {
      this.filters.push({ type: 'in', column, value })
      return this
    }

    order(column: string, options?: { ascending?: boolean }) {
      this.orderBy = { column, ascending: options?.ascending !== false }
      return this
    }

    limit(count: number) {
      this.limitCount = count
      return this
    }

    insert(payload: any) {
      this.mode = 'insert'
      this.payload = payload
      return this
    }

    update(payload: any) {
      this.mode = 'update'
      this.payload = payload
      return this
    }

    single() {
      return Promise.resolve(this.executeSingle())
    }

    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(this.execute()).then(resolve, reject)
    }

    private execute() {
      const rows = state.tables[this.table]
      if (this.mode === 'insert') {
        const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => {
          const copy = clone(row)
          rows.push(copy)
          return copy
        })
        return { data: inserted, error: null }
      }

      if (this.mode === 'update') {
        const matched = rows.filter((row) => matchesFilters(row, this.filters))
        const updated = matched.map((row) => Object.assign(row, clone(this.payload)))
        return { data: updated.map((row) => clone(row)), error: null }
      }

      let selected = rows.filter((row) => matchesFilters(row, this.filters)).map((row) => clone(row))
      if (this.orderBy) {
        const { column, ascending } = this.orderBy
        selected.sort((left, right) => {
          const leftValue = left[column]
          const rightValue = right[column]
          if (leftValue === rightValue) return 0
          if (leftValue === undefined || leftValue === null) return ascending ? -1 : 1
          if (rightValue === undefined || rightValue === null) return ascending ? 1 : -1
          return ascending
            ? String(leftValue).localeCompare(String(rightValue))
            : String(rightValue).localeCompare(String(leftValue))
        })
      }
      if (this.limitCount !== null) {
        selected = selected.slice(0, this.limitCount)
      }
      return { data: selected, error: null }
    }

    private executeSingle() {
      const result = this.execute()
      return {
        data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
        error: null,
      }
    }
  }

  return {
    tables,
    supabase: {
      from: vi.fn((table: string) => new QueryBuilder(table)),
    },
    writeLog: vi.fn(),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: state.writeLog,
}))

const {
  evaluateBaselinePublishReadiness,
  evaluateProjectBaselineValidity,
  listRevisionPoolCandidates,
  PlanningRevisionPoolServiceError,
  startRevisionFromBaseline,
  submitObservationPoolItems,
} = await import('../services/planningRevisionPoolService.js')

describe('planning revision pool service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const table of Object.keys(state.tables) as TableName[]) {
      state.tables[table].splice(0, state.tables[table].length)
    }
    state.tables.task_baselines.push({
      id: 'baseline-1',
      project_id: 'project-1',
      version: 3,
      status: 'confirmed',
      title: '2026-04 基线',
      description: 'baseline',
      source_type: 'current_schedule',
      source_version_id: null,
      source_version_label: null,
      effective_from: '2026-04-01',
      effective_to: '2026-04-30',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push(
      {
        id: 'item-1',
        project_id: 'project-1',
        baseline_version_id: 'baseline-1',
        title: '基础施工',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-05',
        mapping_status: 'mapped',
        sort_order: 1,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'item-2',
        project_id: 'project-1',
        baseline_version_id: 'baseline-1',
        title: '主体结构',
        planned_start_date: '2026-04-06',
        planned_end_date: '2026-04-10',
        mapping_status: 'mapped',
        sort_order: 2,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    )
  })

  it('evaluates baseline publish readiness against schedule and mapping thresholds', () => {
    expect(
      evaluateBaselinePublishReadiness([
        { planned_start_date: '2026-04-01', mapping_status: 'mapped' },
        { planned_end_date: '2026-04-02', mapping_status: 'mapped' },
        { planned_end_date: null, mapping_status: 'pending' },
        { planned_end_date: null, mapping_status: 'missing' },
      ] as any)
    ).toMatchObject({
      totalItems: 4,
      scheduledItems: 2,
      mappedItems: 2,
      isReady: false,
    })

    expect(
      evaluateBaselinePublishReadiness([
        { planned_start_date: '2026-04-01', mapping_status: 'mapped' },
        { planned_end_date: '2026-04-02', mapping_status: 'mapped' },
        { planned_end_date: '2026-04-03', mapping_status: 'mapped' },
        { planned_end_date: '2026-04-04', mapping_status: 'reviewed' },
      ] as any)
    ).toMatchObject({
      totalItems: 4,
      scheduledItems: 4,
      mappedItems: 4,
      isReady: true,
    })
  })

  it('evaluates project baseline validity with deviation thresholds instead of coverage ratios', () => {
    const validity = evaluateProjectBaselineValidity({
      baselineItems: [
        {
          id: 'baseline-1',
          project_id: 'project-1',
          baseline_version_id: 'baseline-version-1',
          source_task_id: 'task-1',
          source_milestone_id: 'milestone-1',
          planned_start_date: '2026-04-01',
          planned_end_date: '2026-04-10',
          title: '基础施工',
          sort_order: 1,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'baseline-2',
          project_id: 'project-1',
          baseline_version_id: 'baseline-version-1',
          source_task_id: 'task-2',
          source_milestone_id: 'milestone-2',
          planned_start_date: '2026-04-02',
          planned_end_date: '2026-04-12',
          title: '主体结构',
          sort_order: 2,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'baseline-3',
          project_id: 'project-1',
          baseline_version_id: 'baseline-version-1',
          source_task_id: 'task-3',
          source_milestone_id: 'milestone-3',
          planned_start_date: '2026-04-03',
          planned_end_date: '2026-04-13',
          title: '机电穿插',
          sort_order: 3,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
      ] as any,
      tasks: [
        { id: 'task-1', planned_start_date: '2026-04-05', planned_end_date: '2026-04-28' },
        { id: 'task-2', planned_start_date: '2026-04-06', planned_end_date: '2026-04-30' },
        { id: 'task-3', planned_start_date: '2026-04-07', planned_end_date: '2026-05-02' },
      ] as any,
      milestones: [
        { id: 'milestone-1', baseline_date: '2026-04-10', current_plan_date: '2026-05-20' },
        { id: 'milestone-2', baseline_date: '2026-04-12', current_plan_date: '2026-05-23' },
        { id: 'milestone-3', baseline_date: '2026-04-13', current_plan_date: '2026-05-25' },
      ] as any,
    })

    expect(validity).toMatchObject({
      comparedTaskCount: 3,
      deviatedTaskCount: 3,
      deviatedTaskRatio: 1,
      shiftedMilestoneCount: 3,
      averageMilestoneShiftDays: 41,
      state: 'needs_realign',
      isValid: false,
    })
    expect(validity.triggeredRules).toEqual(
      expect.arrayContaining(['task_deviation_ratio', 'milestone_shift', 'duration_deviation']),
    )
  })

  it('submits observation pool candidates and reads them back', async () => {
    const baseline = state.tables.task_baselines[0] as any
    const submitted = await submitObservationPoolItems({
      baseline,
      payload: {
        project_id: 'project-1',
        baseline_version_id: 'baseline-1',
        items: [
          {
            title: '补充观测项',
            reason: '发现跨月偏差',
            source_type: 'manual',
            severity: 'high',
          },
        ],
      },
    })

    expect(submitted.submitted_count).toBe(1)
    expect(submitted.candidate_ids).toHaveLength(1)

    const listed = await listRevisionPoolCandidates('baseline-1')
    expect(listed.total).toBe(1)
    expect(listed.items[0]).toMatchObject({
      baseline_version_id: 'baseline-1',
      title: '补充观测项',
      status: 'open',
    })
  })

  it('rejects invalid observation pool severity and source type before insert', async () => {
    const baseline = state.tables.task_baselines[0] as any

    await expect(
      submitObservationPoolItems({
        baseline,
        payload: {
          project_id: 'project-1',
          baseline_version_id: 'baseline-1',
          items: [
            {
              title: '非法严重级别',
              reason: '用于验证 422',
              source_type: 'manual',
              severity: 'warning' as any,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 422,
    })

    await expect(
      submitObservationPoolItems({
        baseline,
        payload: {
          project_id: 'project-1',
          baseline_version_id: 'baseline-1',
          items: [
            {
              title: '非法来源类型',
              reason: '用于验证 422',
              source_type: 'signal' as any,
              severity: 'high',
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 422,
    })
  })

  it('starts a revision from an open observation pool and clones baseline rows', async () => {
    const baseline = state.tables.task_baselines[0] as any
    await submitObservationPoolItems({
      baseline,
      payload: {
        project_id: 'project-1',
        baseline_version_id: 'baseline-1',
        items: [
          {
            title: '重排修订',
            reason: '关键链发生偏移',
            source_type: 'manual',
            severity: 'medium',
          },
        ],
      },
    })

    const result = await startRevisionFromBaseline({
      baseline,
      actorUserId: 'owner-1',
      reason: '治理触发修订',
    })

    expect(result.status).toBe('revising')
    expect(result.source_version_id).toBe('baseline-1')

    const clonedBaseline = state.tables.task_baselines.find((row) => row.id === result.revision_id)
    expect(clonedBaseline).toMatchObject({
      project_id: 'project-1',
      version: 4,
      status: 'revising',
      source_version_id: 'baseline-1',
    })
    expect(
      state.tables.task_baseline_items.filter((row) => row.baseline_version_id === result.revision_id)
    ).toHaveLength(2)
    expect(state.tables.revision_pool_candidates.every((row) => row.status === 'submitted')).toBe(true)
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        entity_id: result.revision_id,
        old_value: 'confirmed',
        new_value: 'revising',
      }),
    )
  })

  it('rejects revision start when the observation pool is empty', async () => {
    const baseline = state.tables.task_baselines[0] as any

    await expect(
      startRevisionFromBaseline({
        baseline,
        actorUserId: 'owner-1',
        reason: 'empty',
      }),
    ).rejects.toMatchObject({
      code: 'OBSERVATION_POOL_EMPTY',
      statusCode: 409,
    })
  })
})
