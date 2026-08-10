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

  let transactionSnapshot: Record<TableName, Row[]> | null = null
  const clientQuery = vi.fn(async (sql: string, values: unknown[] = []) => {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalizedSql === 'begin') {
      transactionSnapshot = clone(tables)
      return { rows: [], rowCount: 0 }
    }
    if (normalizedSql === 'commit') {
      transactionSnapshot = null
      return { rows: [], rowCount: 0 }
    }
    if (normalizedSql === 'rollback') {
      if (transactionSnapshot) {
        for (const table of Object.keys(tables) as TableName[]) {
          tables[table].splice(0, tables[table].length, ...clone(transactionSnapshot[table]))
        }
      }
      transactionSnapshot = null
      return { rows: [], rowCount: 0 }
    }
    if (normalizedSql.startsWith('select pg_advisory_xact_lock')) {
      return { rows: [], rowCount: 1 }
    }
    if (
      normalizedSql.startsWith('select * from public.task_baselines')
      && normalizedSql.includes('where id = $1')
      && normalizedSql.includes('project_id = $2')
    ) {
      const [id, projectId] = values
      const baseline = tables.task_baselines.find((row) => row.id === id && row.project_id === projectId)
      return { rows: baseline ? [clone(baseline)] : [], rowCount: baseline ? 1 : 0 }
    }
    if (
      normalizedSql.startsWith('select * from public.task_baseline_items')
      && normalizedSql.includes('baseline_version_id = $1')
      && normalizedSql.includes('project_id = $2')
    ) {
      const [baselineId, projectId] = values
      const items = tables.task_baseline_items
        .filter((row) => row.baseline_version_id === baselineId && row.project_id === projectId)
        .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
      return { rows: clone(items), rowCount: items.length }
    }
    if (
      normalizedSql.startsWith('select count(*)::int as item_count from public.task_baseline_items')
      && normalizedSql.includes('baseline_version_id = $1')
      && normalizedSql.includes('project_id = $2')
    ) {
      const [baselineId, projectId] = values
      const itemCount = tables.task_baseline_items.filter(
        (row) => row.baseline_version_id === baselineId && row.project_id === projectId,
      ).length
      return { rows: [{ item_count: itemCount }], rowCount: 1 }
    }
    if (normalizedSql.startsWith('update public.revision_pool_candidates')) {
      const [projectId, baselineId, candidateIds, timestamp] = values as [string, string, string[], string]
      const updated = tables.revision_pool_candidates.filter(
        (row) => row.project_id === projectId
          && row.baseline_version_id === baselineId
          && candidateIds.includes(String(row.id))
          && row.status === 'open',
      )
      for (const row of updated) {
        Object.assign(row, { status: 'submitted', submitted_at: timestamp, updated_at: timestamp })
      }
      return { rows: updated.map((row) => clone(row)), rowCount: updated.length }
    }
    return { rows: [], rowCount: 0 }
  })
  const clientRelease = vi.fn()
  const insertRowsReturning = vi.fn(async (
    _client: unknown,
    tableName: TableName,
    rows: Row[],
    _options?: { jsonColumns?: readonly string[] },
  ) => {
    const inserted = clone(rows)
    tables[tableName].push(...inserted)
    return inserted
  })

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
      if (this.table === 'task_baseline_items' && state.hideBaselineItemsFromRest) {
        selected = []
      }
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
    getClient: vi.fn(async () => ({ query: clientQuery, release: clientRelease })),
    clientQuery,
    clientRelease,
    insertRowsReturning,
    writeLog: vi.fn(),
    hideBaselineItemsFromRest: false,
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
}))

vi.mock('../database.js', () => ({
  getClient: state.getClient,
}))

vi.mock('../services/transactionInsertService.js', () => ({
  insertRowReturning: vi.fn(async (client: unknown, tableName: TableName, row: Row) => {
    const rows = await state.insertRowsReturning(client, tableName, [row])
    return rows[0]
  }),
  insertRowsReturning: state.insertRowsReturning,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: state.writeLog,
}))

const planningRevisionPoolService = await import('../services/planningRevisionPoolService.js')

const {
  evaluateBaselinePublishReadiness,
  evaluateBaselineConfirmationGate,
  evaluateProjectBaselineValidity,
  listRevisionPoolCandidates,
  PlanningRevisionPoolServiceError,
  startRevisionFromBaseline,
  submitObservationPoolItems,
} = planningRevisionPoolService

describe('planning revision pool service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.hideBaselineItemsFromRest = false
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
        scope_snapshot: { building: 'A' },
        wbs_snapshot: { path: ['A', '01'] },
        task_fact_snapshot: { progress: 0 },
        status_snapshot: { status: 'pending' },
        seed_versions: [{ seed_version_id: 'seed-1' }],
        manual_override_fields: ['planned_end_date'],
        generation_metadata: { source: 'wizard' },
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
      asOf: '2026-05-25',
    })

    expect(validity).toMatchObject({
      comparedTaskCount: 3,
      deviatedTaskCount: 3,
      deviatedTaskRatio: 1,
      shiftedMilestoneCount: 3,
      averageMilestoneShiftDays: 41,
      averageMilestoneShift: {
        value: 41,
        unit: 'calendar_day',
        calendarRef: 'gregorian',
        calendarVersion: 'ISO-8601',
        timezone: 'Asia/Shanghai',
        asOf: '2026-05-25',
        availability: 'available',
        unavailableReason: null,
      },
      state: 'needs_realign',
      isValid: false,
    })
    expect(validity.triggeredRules).toEqual(
      expect.arrayContaining(['task_deviation_ratio', 'milestone_shift', 'duration_deviation']),
    )
  })

  it('accepts a valid leap-day milestone comparison as a Gregorian calendar-day fact', () => {
    const validity = evaluateProjectBaselineValidity({
      baselineItems: [
        {
          id: 'baseline-leap',
          source_milestone_id: 'milestone-leap',
        },
      ] as any,
      tasks: [],
      milestones: [
        { id: 'milestone-leap', baseline_date: '2024-02-29', current_plan_date: '2024-03-01' },
      ] as any,
      asOf: '2024-03-01',
    })

    expect(validity.shiftedMilestoneCount).toBe(1)
    expect(validity.averageMilestoneShiftDays).toBe(1)
    expect(validity.averageMilestoneShift).toEqual({
      value: 1,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      timezone: 'Asia/Shanghai',
      asOf: '2024-03-01',
      availability: 'available',
      unavailableReason: null,
    })
  })

  it('keeps a real zero-day milestone shift available instead of treating zero as missing', () => {
    const validity = evaluateProjectBaselineValidity({
      baselineItems: [
        {
          id: 'baseline-same-day',
          source_milestone_id: 'milestone-same-day',
        },
      ] as any,
      tasks: [],
      milestones: [
        { id: 'milestone-same-day', baseline_date: '2024-02-29', current_plan_date: '2024-02-29' },
      ] as any,
      asOf: '2024-02-29',
    })

    expect(validity.averageMilestoneShift).toMatchObject({
      value: 0,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'available',
    })
    expect(validity.averageMilestoneShiftDays).toBe(0)
  })

  it.each([
    ['an impossible date', '2026-02-30'],
    ['a missing date', null],
  ])('fails average milestone shift closed for %s', (_label, currentPlanDate) => {
    const validity = evaluateProjectBaselineValidity({
      baselineItems: [
        {
          id: 'baseline-invalid',
          source_milestone_id: 'milestone-invalid',
        },
      ] as any,
      tasks: [],
      milestones: [
        { id: 'milestone-invalid', baseline_date: '2026-02-28', current_plan_date: currentPlanDate },
      ] as any,
      asOf: '2026-03-02',
    })

    expect(validity.averageMilestoneShift).toMatchObject({
      value: null,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'unavailable',
      unavailableReason: 'duration_value_missing',
    })
    expect(validity.averageMilestoneShiftDays).toBeNull()
    expect(validity.triggeredRules).not.toContain('milestone_shift')
  })

  it('builds structured validity details and never formats unavailable shift as zero days', () => {
    const averageMilestoneShift = {
      value: null,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      timezone: 'Asia/Shanghai',
      asOf: '2026-03-02',
      availability: 'unavailable',
      unavailableReason: 'duration_value_missing',
    } as const
    const validity = {
      comparedTaskCount: 3,
      deviatedTaskCount: 2,
      deviatedTaskRatio: 0.67,
      shiftedMilestoneCount: 0,
      averageMilestoneShift,
      averageMilestoneShiftDays: null,
      totalDurationDeviationRatio: 0.2,
      triggeredRules: ['task_deviation_ratio', 'duration_deviation'],
      state: 'needs_realign',
      isValid: false,
    } as const

    const details = (planningRevisionPoolService as any).buildProjectBaselineValidityDetails(validity)
    const message = (planningRevisionPoolService as any).buildProjectBaselineValidityMessage(validity)

    expect(details).toEqual({
      validity: {
        deviatedTaskRatio: 0.67,
        shiftedMilestoneCount: 0,
        averageMilestoneShift,
        averageMilestoneShiftDays: null,
        totalDurationDeviationRatio: 0.2,
        triggeredRules: ['task_deviation_ratio', 'duration_deviation'],
      },
    })
    expect(message).toContain('calendar-day metric unavailable')
    expect(message).not.toContain('average 0 days')
  })

  it('blocks baseline confirmation on milestone order, resource cap, compression, and mutually exclusive process conflicts', () => {
    const gate = evaluateBaselineConfirmationGate({
      baselineItems: [
        {
          id: 'milestone-late',
          title: '结构封顶',
          planned_start_date: '2026-06-10',
          planned_end_date: '2026-06-10',
          is_milestone: true,
          sort_order: 1,
        },
        {
          id: 'milestone-early',
          title: '基础验收',
          planned_start_date: '2026-05-10',
          planned_end_date: '2026-05-10',
          is_milestone: true,
          sort_order: 2,
        },
        {
          id: 'tower-1',
          title: 'A楼混凝土浇筑',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          is_milestone: false,
          sort_order: 3,
          generation_metadata: {
            resource_class: 'tower_crane',
            resourceClass: 'tower_crane',
            resource_limits: { sameBuildingDailyLimit: 1, parallelCapacity: 1 },
            scope_key: { building: 'A' },
          },
        },
        {
          id: 'tower-2',
          title: 'A楼钢构吊装',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-01',
          is_milestone: false,
          sort_order: 4,
          generation_metadata: {
            resource_class: 'tower_crane',
            resource_limits: { sameBuildingDailyLimit: 1, parallelCapacity: 1 },
            scope_keys: { building: 'A' },
          },
        },
        {
          id: 'waterproof',
          title: '卫生间防水',
          planned_start_date: '2026-05-02',
          planned_end_date: '2026-05-04',
          is_milestone: false,
          sort_order: 5,
          generation_metadata: {
            process_constraint: {
              stableCode: 'bathroom_waterproof_to_tile_room_overlap',
              source: 'v1474ProcessConstraintSeed',
              overlapAllowed: false,
              scope_key: 'room-101',
            },
          },
        },
        {
          id: 'tile',
          title: '卫生间铺贴',
          planned_start_date: '2026-05-03',
          planned_end_date: '2026-05-05',
          is_milestone: false,
          sort_order: 6,
          generation_metadata: {
            process_constraint: {
              stableCode: 'bathroom_waterproof_to_tile_room_overlap',
              source: 'v1474ProcessConstraintSeed',
              overlapAllowed: false,
              scope_key: 'room-101',
            },
          },
        },
      ] as any,
      sourceItems: [
        {
          id: 'old-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-07-30',
          is_milestone: false,
        },
      ] as any,
      maxCompressionRatio: 0.2,
    })

    expect(gate.isReady).toBe(false)
    expect(gate.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
      'milestone_order_reversed',
      'resource_peak_over_limit',
      'total_duration_compression_over_cap',
      'mutually_exclusive_process_overlap',
    ]))
    expect(gate.blockers.find((blocker) => blocker.code === 'resource_peak_over_limit')?.detail).toContain('tower_crane')
    expect(gate.blockers.find((blocker) => blocker.code === 'mutually_exclusive_process_overlap')?.detail).toContain('v1474ProcessConstraintSeed')
  })

  it('blocks resource peak conflicts on partially overlapping daily windows', () => {
    const gate = evaluateBaselineConfirmationGate({
      baselineItems: [
        {
          id: 'tower-window-a',
          title: 'Tower crane work A',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-03',
          is_milestone: false,
          sort_order: 1,
          generation_metadata: {
            resource_class: 'tower_crane',
            resource_limits: { sameBuildingDailyLimit: 1 },
            scope_keys: { building: 'A' },
          },
        },
        {
          id: 'tower-window-b',
          title: 'Tower crane work B',
          planned_start_date: '2026-05-02',
          planned_end_date: '2026-05-04',
          is_milestone: false,
          sort_order: 2,
          generation_metadata: {
            resource_class: 'tower_crane',
            resource_limits: { sameBuildingDailyLimit: 1 },
            scope_keys: { building: 'A' },
          },
        },
      ] as any,
    })

    expect(gate.isReady).toBe(false)
    expect(gate.blockers.map((blocker) => blocker.code)).toContain('resource_peak_over_limit')
    expect(gate.blockers.find((blocker) => blocker.code === 'resource_peak_over_limit')?.detail)
      .toContain('2026-05-02')
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

    const listed = await listRevisionPoolCandidates('baseline-1', 'project-1')
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
      version: null,
      status: 'revising',
      source_version_id: 'baseline-1',
      source_version_label: 'v3',
    })
    expect(
      state.tables.task_baseline_items.filter((row) => row.baseline_version_id === result.revision_id)
    ).toHaveLength(2)
    expect(state.tables.revision_pool_candidates.every((row) => row.status === 'submitted')).toBe(true)
    expect(state.clientQuery).toHaveBeenCalledWith('BEGIN')
    expect(state.clientQuery).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE public\.revision_pool_candidates[\s\S]+project_id = \$1[\s\S]+baseline_version_id = \$2/i),
      expect.arrayContaining(['project-1', 'baseline-1']),
    )
    expect(state.insertRowsReturning).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      'task_baseline_items',
      expect.arrayContaining([
        expect.objectContaining({ baseline_version_id: result.revision_id, project_id: 'project-1' }),
      ]),
      {
        jsonColumns: [
          'scope_snapshot',
          'wbs_snapshot',
          'task_fact_snapshot',
          'status_snapshot',
          'seed_versions',
          'manual_override_fields',
          'generation_metadata',
        ],
      },
    )
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        entity_id: result.revision_id,
        old_value: 'confirmed',
        new_value: 'revising',
      }),
    )
  })

  it('clones source baseline rows through the scoped transaction when REST cannot see them', async () => {
    state.hideBaselineItemsFromRest = true
    const baseline = state.tables.task_baselines[0] as any

    const result = await startRevisionFromBaseline({
      baseline,
      actorUserId: 'owner-1',
      reason: 'REST visibility regression',
      idempotencyKey: 'revision-direct-source-read',
    })

    expect(
      state.tables.task_baseline_items.filter((row) => row.baseline_version_id === result.revision_id),
    ).toHaveLength(2)
    expect(state.clientQuery).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT \*\s+FROM public\.task_baseline_items[\s\S]+baseline_version_id = \$1[\s\S]+project_id = \$2/i),
      ['baseline-1', 'project-1'],
    )
  })

  it('starts a direct revision draft when the observation pool is empty', async () => {
    const baseline = state.tables.task_baselines[0] as any

    const result = await startRevisionFromBaseline({
      baseline,
      actorUserId: 'owner-1',
      reason: '常规修订',
      sourceCandidateIds: [],
    })

    expect(result.status).toBe('revising')
    expect(result.source_version_id).toBe('baseline-1')
    expect(state.tables.revision_pool_candidates).toHaveLength(0)
    expect(
      state.tables.task_baseline_items.filter((row) => row.baseline_version_id === result.revision_id),
    ).toHaveLength(2)
  })

  it('reuses the same completed revision on an idempotent retry without cloning rows again', async () => {
    const baseline = state.tables.task_baselines[0] as any
    const input = {
      baseline,
      actorUserId: 'owner-1',
      reason: 'idempotent revision',
      sourceCandidateIds: [],
      idempotencyKey: 'revision-op-1',
    }

    const first = await startRevisionFromBaseline(input)
    const second = await startRevisionFromBaseline(input)

    expect(second).toEqual(first)
    expect(state.tables.task_baselines.filter((row) => row.id === first.revision_id)).toHaveLength(1)
    expect(state.tables.task_baseline_items.filter((row) => row.baseline_version_id === first.revision_id)).toHaveLength(2)
    expect(state.writeLog).toHaveBeenCalledTimes(1)
  })

  it('rejects revision start when selected candidates do not belong to the baseline', async () => {
    const baseline = state.tables.task_baselines[0] as any

    await expect(
      startRevisionFromBaseline({
        baseline,
        actorUserId: 'owner-1',
        reason: 'invalid candidates',
        sourceCandidateIds: ['missing-candidate'],
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 422,
    })
  })
})
