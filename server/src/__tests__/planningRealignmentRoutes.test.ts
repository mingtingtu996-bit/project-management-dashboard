import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type TableName =
  | 'task_baselines'
  | 'task_baseline_items'
  | 'monthly_plans'
  | 'monthly_plan_items'
  | 'task_conditions'
  | 'task_obstacles'
  | 'tasks'
  | 'milestones'

type Row = Record<string, any>

const state = vi.hoisted(() => {
  const tables: Record<TableName, Row[]> = {
    task_baselines: [],
    task_baseline_items: [],
    monthly_plans: [],
    monthly_plan_items: [],
    task_conditions: [],
    task_obstacles: [],
    tasks: [],
    milestones: [],
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
    private mode: 'select' | 'update' | 'insert' | 'upsert' = 'select'
    private payload: any = null
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

    order() {
      return this
    }

    limit(count: number) {
      this.limitCount = count
      return this
    }

    update(payload: any) {
      this.mode = 'update'
      this.payload = payload
      return this
    }

    insert(payload: any) {
      this.mode = 'insert'
      this.payload = payload
      return this
    }

    upsert(payload: any) {
      this.mode = 'upsert'
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
      if (this.mode === 'update') {
        const matched = rows.filter((row) => matchesFilters(row, this.filters))
        const updated = matched.map((row) => Object.assign(row, clone(this.payload)))
        return { data: updated.map((row) => clone(row)), error: null }
      }

      if (this.mode === 'insert') {
        const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => clone(row))
        state.tables[this.table].push(...inserted)
        return {
          data: inserted.map((row) => clone(row)),
          error: null,
        }
      }

      if (this.mode === 'upsert') {
        const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => clone(row))
        const touched: Row[] = []
        for (const item of incoming) {
          const existingIndex = rows.findIndex((row) => row.id === item.id)
          if (existingIndex >= 0) {
            rows[existingIndex] = { ...rows[existingIndex], ...item }
            touched.push(rows[existingIndex])
          } else {
            rows.push(item)
            touched.push(item)
          }
        }
        return {
          data: touched.map((row) => clone(row)),
          error: null,
        }
      }

      let selected = rows.filter((row) => matchesFilters(row, this.filters)).map((row) => clone(row))
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
    startProjectReorderSession: vi.fn(async ({ projectId, reorderMode, note }: any) => ({
      id: 'manual-reorder-1',
      project_id: projectId,
      category: 'reorder',
      kind: 'manual_reorder_session',
      status: 'active',
      severity: 'info',
      title: '主动重排进行中',
      detail: '已启动主动重排。',
      payload: { reorder_mode: reorderMode ?? 'mixed', note: note ?? null },
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })),
    finishProjectReorderSession: vi.fn(async ({ projectId, note }: any) => ({
      id: 'manual-reorder-1',
      project_id: projectId,
      category: 'reorder',
      kind: 'manual_reorder_session',
      status: 'resolved',
      severity: 'info',
      title: '主动重排已结束',
      detail: '已完成主动重排。',
      payload: { completion_note: note ?? null },
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T01:00:00.000Z',
    })),
  }
})

const baselineGovernanceMocks = vi.hoisted(() => ({
  resolveMonthlyPlanGenerationSource: vi.fn(),
  hasMonthlyPlanVersion: vi.fn(async () => false),
  annotateBaselineCriticalItems: vi.fn(async (_baseline: any, items: any[]) => items),
  syncBaselineCriticalFlagsToTasks: vi.fn(async () => 0),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'owner-1' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  requestLogger: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/validation.js', () => ({
  validateIdParam: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: state.writeLog,
}))

vi.mock('../services/planningRevisionPoolService.js', () => ({
  evaluateBaselinePublishReadiness: vi.fn(() => ({
    totalItems: 1,
    scheduledItems: 1,
    mappedItems: 1,
    scheduledRatio: 1,
    mappedRatio: 1,
    isReady: true,
  })),
  evaluateProjectBaselineValidity: vi.fn(() => ({
    comparedTaskCount: 0,
    deviatedTaskCount: 0,
    deviatedTaskRatio: 0,
    shiftedMilestoneCount: 0,
    averageMilestoneShiftDays: 0,
    totalDurationDeviationRatio: 0,
    triggeredRules: [],
    state: 'valid',
    isValid: true,
  })),
  listRevisionPoolCandidates: vi.fn(async () => ({ items: [], total: 0 })),
  PlanningRevisionPoolServiceError: class extends Error {
    code = 'VALIDATION_ERROR'
    statusCode = 400
  },
  startRevisionFromBaseline: vi.fn(),
  submitObservationPoolItems: vi.fn(),
}))

vi.mock('../services/planningDraftLockService.js', () => ({
  PlanningDraftLockServiceError: class extends Error {
    statusCode = 409
    code = 'LOCK_HELD'
  },
  PlanningDraftLockService: class {
    async getProjectRole() {
      return 'owner'
    }
    async getDraftLock() {
      return null
    }
    async acquireDraftLock() {
      return null
    }
    async forceUnlockDraftLock() {
      return null
    }
  },
}))

vi.mock('../services/planningGovernanceService.js', () => ({
  planningGovernanceService: {
    scanProjectGovernance: vi.fn(),
    startProjectReorderSession: state.startProjectReorderSession,
    finishProjectReorderSession: state.finishProjectReorderSession,
  },
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: {
    syncProjectDataQuality: vi.fn(async () => ({
      confidence: { score: 91, flag: 'high', note: 'test' },
    })),
  },
}))

vi.mock('../services/baselineGovernanceService.js', () => ({
  resolveMonthlyPlanGenerationSource: baselineGovernanceMocks.resolveMonthlyPlanGenerationSource,
  hasMonthlyPlanVersion: baselineGovernanceMocks.hasMonthlyPlanVersion,
  annotateBaselineCriticalItems: baselineGovernanceMocks.annotateBaselineCriticalItems,
  syncBaselineCriticalFlagsToTasks: baselineGovernanceMocks.syncBaselineCriticalFlagsToTasks,
}))

const { default: taskBaselinesRouter } = await import('../routes/task-baselines.js')
const { default: monthlyPlansRouter } = await import('../routes/monthly-plans.js')
const { default: planningGovernanceRouter } = await import('../routes/planning-governance.js')
const planningRevisionPoolService = await import('../services/planningRevisionPoolService.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/task-baselines', taskBaselinesRouter)
  app.use('/api/monthly-plans', monthlyPlansRouter)
  app.use('/api/planning-governance', planningGovernanceRouter)
  return app
}

describe('planning realignment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const table of Object.keys(state.tables) as TableName[]) {
      state.tables[table].splice(0, state.tables[table].length)
    }
    baselineGovernanceMocks.hasMonthlyPlanVersion.mockResolvedValue(false)
    baselineGovernanceMocks.annotateBaselineCriticalItems.mockImplementation(async (_baseline: any, items: any[]) => items)
    baselineGovernanceMocks.resolveMonthlyPlanGenerationSource.mockResolvedValue({
      mode: 'schedule',
      baselineVersionId: null,
      sourceVersionId: null,
      sourceVersionLabel: '当前任务列表',
      baselineStatus: null,
      autoSwitched: false,
      items: [],
    })
  })

  it('archives the previously active baseline when a newer revision is confirmed', async () => {
    state.tables.task_baselines.push(
      {
        id: 'baseline-old',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
        title: '项目基线 v1',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'baseline-new',
        project_id: 'project-1',
        version: 2,
        status: 'revising',
        title: '项目基线 v2',
        source_version_id: 'baseline-old',
        created_at: '2026-04-10T00:00:00.000Z',
        updated_at: '2026-04-10T00:00:00.000Z',
      },
    )
    state.tables.task_baseline_items.push({
      id: 'item-1',
      project_id: 'project-1',
      baseline_version_id: 'baseline-new',
      title: '基础施工',
      sort_order: 1,
      created_at: '2026-04-10T00:00:00.000Z',
      updated_at: '2026-04-10T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/baseline-new/confirm')
      .send({ version: 2 })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('confirmed')
    expect(state.tables.task_baselines.find((row) => row.id === 'baseline-old')?.status).toBe('archived')
    expect(state.tables.task_baselines.find((row) => row.id === 'baseline-new')?.status).toBe('confirmed')
    expect(baselineGovernanceMocks.annotateBaselineCriticalItems).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'baseline-new',
        project_id: 'project-1',
      }),
      expect.arrayContaining([
        expect.objectContaining({
          baseline_version_id: 'baseline-new',
        }),
      ]),
    )
    expect(baselineGovernanceMocks.syncBaselineCriticalFlagsToTasks).toHaveBeenCalledWith(
      'project-1',
      expect.arrayContaining([
        expect.objectContaining({
          baseline_version_id: 'baseline-new',
        }),
      ]),
      'owner-1',
    )
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: 'baseline-old',
        old_value: 'confirmed',
        new_value: 'archived',
      }),
    )
  })

  it('queues and resolves baseline realignment through runtime endpoints', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-1',
      project_id: 'project-1',
      version: 3,
      status: 'confirmed',
      title: '项目基线 v3',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })

    const request = supertest(buildApp())

    const queued = await request
      .post('/api/task-baselines/baseline-1/queue-realignment')
      .send({ version: 3 })
    expect(queued.status).toBe(200)
    expect(queued.body.data.status).toBe('pending_realign')

    const resolved = await request
      .post('/api/task-baselines/baseline-1/resolve-realignment')
      .send({ version: 3 })
    expect(resolved.status).toBe(200)
    expect(resolved.body.data.status).toBe('confirmed')
  })

  it('rejects baseline confirmation when validity thresholds require realignment', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-invalid',
      project_id: 'project-1',
      version: 5,
      status: 'draft',
      title: '项目基线 v5',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push({
      id: 'baseline-item-1',
      project_id: 'project-1',
      baseline_version_id: 'baseline-invalid',
      source_task_id: 'task-1',
      source_milestone_id: 'milestone-1',
      title: '基础施工',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-10',
      sort_order: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.tables.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
      title: '基础施工',
      status: 'in_progress',
      priority: 'high',
      planned_start_date: '2026-04-20',
      planned_end_date: '2026-05-10',
      progress: 35,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      version: 1,
    })
    state.tables.milestones.push({
      id: 'milestone-1',
      project_id: 'project-1',
      name: '结构封顶',
      target_date: '2026-04-10',
      baseline_date: '2026-04-10',
      current_plan_date: '2026-05-20',
      status: 'in_progress',
      completion_rate: 0,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      version: 1,
    })

    const validitySpy = vi.mocked(planningRevisionPoolService.evaluateProjectBaselineValidity)
    validitySpy.mockReturnValue({
      comparedTaskCount: 1,
      deviatedTaskCount: 1,
      deviatedTaskRatio: 1,
      shiftedMilestoneCount: 1,
      averageMilestoneShiftDays: 40,
      totalDurationDeviationRatio: 0.5,
      triggeredRules: ['task_deviation_ratio', 'duration_deviation'],
      state: 'needs_realign',
      isValid: false,
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/baseline-invalid/confirm')
      .send({ version: 5 })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('REQUIRES_REALIGNMENT')
    expect(response.body.error.message).toContain('待重整阈值')
    expect(validitySpy).toHaveBeenCalled()
    expect(state.tables.task_baselines.find((row) => row.id === 'baseline-invalid')?.status).toBe('draft')
  })

  it('queues and resolves monthly plan realignment through runtime endpoints', async () => {
    state.tables.monthly_plans.push({
      id: 'plan-1',
      project_id: 'project-1',
      version: 4,
      status: 'confirmed',
      month: '2026-04',
      title: '2026-04 月度计划',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.tables.monthly_plan_items.push({
      id: 'plan-item-1',
      project_id: 'project-1',
      monthly_plan_version_id: 'plan-1',
      title: '主体结构',
      sort_order: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })

    const request = supertest(buildApp())

    const queued = await request
      .post('/api/monthly-plans/plan-1/queue-realignment')
      .send({ version: 4 })
    expect(queued.status).toBe(200)
    expect(queued.body.data.status).toBe('pending_realign')

    const resolved = await request
      .post('/api/monthly-plans/plan-1/resolve-realignment')
      .send({ version: 4 })
    expect(resolved.status).toBe(200)
    expect(resolved.body.data.status).toBe('confirmed')
  })

  it('applies monthly plan batch operations through dedicated endpoints', async () => {
    state.tables.monthly_plans.push({
      id: 'plan-batch-1',
      project_id: 'project-1',
      version: 5,
      status: 'draft',
      month: '2026-04',
      title: '2026-04 月度计划',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.tables.monthly_plan_items.push(
      {
        id: 'batch-item-1',
        project_id: 'project-1',
        monthly_plan_version_id: 'plan-batch-1',
        title: '主体结构',
        planned_start_date: '2026-04-10',
        planned_end_date: '2026-04-15',
        target_progress: 30,
        commitment_status: 'planned',
        sort_order: 1,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'batch-item-2',
        project_id: 'project-1',
        monthly_plan_version_id: 'plan-batch-1',
        title: '二次结构',
        planned_start_date: '2026-04-16',
        planned_end_date: '2026-04-20',
        target_progress: 40,
        commitment_status: 'planned',
        sort_order: 2,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    )

    const request = supertest(buildApp())

    const scopeResponse = await request
      .post('/api/monthly-plans/plan-batch-1/items/batch-scope')
      .send({ action: 'move_out', item_ids: ['batch-item-1'], reason: 'scope trim' })
    expect(scopeResponse.status).toBe(200)
    expect(scopeResponse.body.data.touched_count).toBe(1)
    expect(state.tables.monthly_plan_items.find((item) => item.id === 'batch-item-1')?.commitment_status).toBe('cancelled')

    const shiftResponse = await request
      .post('/api/monthly-plans/plan-batch-1/items/batch-shift-dates')
      .send({ shift_days: 2, item_ids: ['batch-item-2'], reason: 'weather' })
    expect(shiftResponse.status).toBe(200)
    expect(shiftResponse.body.data.shift_days).toBe(2)
    expect(state.tables.monthly_plan_items.find((item) => item.id === 'batch-item-2')?.planned_start_date).toBe('2026-04-18')
    expect(state.tables.monthly_plan_items.find((item) => item.id === 'batch-item-2')?.planned_end_date).toBe('2026-04-22')

    const progressResponse = await request
      .post('/api/monthly-plans/plan-batch-1/items/batch-target-progress')
      .send({ target_progress: 65, scope: 'all', reason: 'team sync' })
    expect(progressResponse.status).toBe(200)
    expect(progressResponse.body.data.touched_count).toBe(2)
    expect(state.tables.monthly_plan_items.every((item) => Number(item.target_progress) === 65)).toBe(true)
  })

  it('starts and ends project reorder sessions through planning governance endpoints', async () => {
    const request = supertest(buildApp())

    const started = await request
      .post('/api/planning-governance/project-1/start-reorder')
      .send({ reorder_mode: 'sequence', note: 'manual governance session' })
    expect(started.status).toBe(201)
    expect(started.body.data.status).toBe('active')
    expect(state.startProjectReorderSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      reorderMode: 'sequence',
      note: 'manual governance session',
    }))

    const finished = await request
      .post('/api/planning-governance/project-1/end-reorder')
      .send({ note: 'done' })
    expect(finished.status).toBe(200)
    expect(finished.body.data.status).toBe('resolved')
    expect(state.finishProjectReorderSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      note: 'done',
    }))
  })

  it('auto switches monthly plan generation to current schedule when baseline needs realignment', async () => {
    baselineGovernanceMocks.resolveMonthlyPlanGenerationSource.mockResolvedValue({
      mode: 'schedule',
      baselineVersionId: null,
      sourceVersionId: null,
      sourceVersionLabel: '当前任务列表（基线待重整，已自动切换）',
      baselineStatus: 'pending_realign',
      autoSwitched: true,
      items: [
        {
          baseline_item_id: null,
          carryover_from_item_id: null,
          source_task_id: 'task-live-1',
          title: '现场纠偏任务',
          planned_start_date: '2026-04-20',
          planned_end_date: '2026-04-28',
          target_progress: 35,
          current_progress: 35,
          sort_order: 0,
          is_milestone: false,
          is_critical: true,
          commitment_status: 'planned',
          notes: null,
        },
      ],
    })

    const response = await supertest(buildApp())
      .post('/api/monthly-plans')
      .send({
        project_id: 'project-1',
        month: '2026-04',
        title: '2026-04 月度计划',
        baseline_version_id: 'baseline-pending',
        source_version_id: 'baseline-pending',
        source_version_label: '基线 v6',
        items: [
          {
            source_task_id: 'stale-baseline-item',
            title: '旧基线条目',
          },
        ],
      })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data.baseline_version_id).toBeNull()
    expect(response.body.data.source_version_label).toContain('自动切换')
    expect(state.tables.monthly_plan_items[0]).toMatchObject({
      source_task_id: 'task-live-1',
      title: '现场纠偏任务',
      is_critical: true,
    })
  })
})
