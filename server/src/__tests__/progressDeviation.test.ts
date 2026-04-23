import express from 'express'
import supertest from 'supertest'
import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

type TableName =
  | 'task_baselines'
  | 'task_baseline_items'
  | 'monthly_plans'
  | 'monthly_plan_items'
  | 'tasks'
  | 'task_progress_snapshots'
  | 'planning_draft_locks'
  | 'milestones'
  | 'task_conditions'
  | 'task_obstacles'
  | 'delay_requests'
  | 'projects'
  | 'project_members'
  | 'notifications'

type Store = Record<TableName, Array<Record<string, unknown>>>

const state = vi.hoisted(() => {
  const tables: Store = {
    task_baselines: [],
    task_baseline_items: [],
    monthly_plans: [],
    monthly_plan_items: [],
    tasks: [],
    task_progress_snapshots: [],
    planning_draft_locks: [],
    milestones: [],
    task_conditions: [],
    task_obstacles: [],
    delay_requests: [],
    projects: [],
    project_members: [],
    notifications: [],
  }

  function normalizeTableName(table: string): TableName {
    if (!(table in tables)) {
      throw new Error(`Unsupported table in test mock: ${table}`)
    }
    return table as TableName
  }

  function matchesFilters(row: Record<string, unknown>, filters: Array<[string, unknown]>) {
    return filters.every(([column, value]) => {
      if (Array.isArray(value)) {
        return value.includes(row[column])
      }
      return row[column] === value
    })
  }

  function uniqueLockKey(row: Record<string, unknown>) {
    return [row.project_id, row.draft_type, row.resource_id].join('::')
  }

  function upsertRow(table: TableName, payload: Record<string, unknown>) {
    const rows = tables[table]
    if (table === 'planning_draft_locks') {
      const key = uniqueLockKey(payload)
      const index = rows.findIndex((row) => uniqueLockKey(row) === key)
      if (index >= 0) {
        rows[index] = { ...rows[index], ...payload }
        return rows[index]
      }
      rows.push({ ...payload })
      return rows[rows.length - 1]
    }

    const id = String(payload.id ?? '')
    const index = rows.findIndex((row) => String(row.id ?? '') === id)
    if (index >= 0) {
      rows[index] = { ...rows[index], ...payload }
      return rows[index]
    }
    rows.push({ ...payload })
    return rows[rows.length - 1]
  }

  function buildResult(
    table: TableName,
    filters: Array<[string, unknown]>,
    operation: 'select' | 'upsert' | 'insert' | 'update',
    payload: any,
    limitCount: number | null,
  ) {
    if (operation === 'upsert') {
      const records = Array.isArray(payload) ? payload : [payload]
      const rows = records.map((record) => upsertRow(table, record as Record<string, unknown>))
      return { data: rows, error: null }
    }

    if (operation === 'insert') {
      const rows = (Array.isArray(payload) ? payload : [payload]).map((record) => {
        const next = { ...(record as Record<string, unknown>) }
        tables[table].push(next)
        return next
      })
      return { data: rows, error: null }
    }

    if (operation === 'update') {
      const updated = tables[table]
        .filter((row) => matchesFilters(row, filters))
        .map((row) => Object.assign(row, payload as Record<string, unknown>))
      return { data: updated, error: null }
    }

    const rows = tables[table].filter((row) => matchesFilters(row, filters))
    return {
      data: limitCount === null ? rows : rows.slice(0, limitCount),
      error: null,
    }
  }

  class QueryBuilder {
    private table: TableName
    private filters: Array<[string, unknown]> = []
    private operation: 'select' | 'upsert' | 'insert' | 'update' = 'select'
    private payload: any = null
    private limitCount: number | null = null

    constructor(table: string) {
      this.table = normalizeTableName(table)
    }

    select() {
      return this
    }

    eq(column: string, value: unknown) {
      this.filters.push([column, value])
      return this
    }

    in(column: string, value: unknown[]) {
      this.filters.push([column, value])
      return this
    }

    limit(count: number) {
      this.limitCount = count
      return this
    }

    order() {
      return this
    }

    upsert(payload: any) {
      this.operation = 'upsert'
      this.payload = payload
      return this
    }

    insert(payload: any) {
      this.operation = 'insert'
      this.payload = payload
      return this
    }

    update(payload: any) {
      this.operation = 'update'
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
      return buildResult(this.table, this.filters, this.operation, this.payload, this.limitCount)
    }

    private executeSingle() {
      const result = this.execute()
      if (Array.isArray(result.data)) {
        return { data: result.data[0] ?? null, error: null }
      }
      return result
    }
  }

  const supabase = {
    from: vi.fn((table: string) => new QueryBuilder(table)),
  }

  return { tables, supabase }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  requestLogger: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
  SupabaseService: vi.fn(() => state.supabase),
}))

const { default: progressDeviationRouter } = await import('../routes/progress-deviation.js')
const {
  acquireBaselineVersionLock,
  baselineVersionLockContracts,
  buildBaselineVersionLockResourceId,
  getBaselineVersionLock,
} = await import('../services/baselineVersionLock.js')
const {
  getProgressDeviationAnalysis,
  getProgressDeviationAnalysisOrThrow,
  progressDeviationContracts,
} = await import('../services/progressDeviationService.js')

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/progress-deviation', progressDeviationRouter)
  return app
}

function seedAnalysisFixtures() {
  const projectId = 'project-0001'
  const baselineVersionId = 'baseline-v7'
  const monthlyPlanVersionId = 'monthly-v4'

  state.tables.task_baselines.push({
    id: baselineVersionId,
    project_id: projectId,
    version: 7,
    status: 'confirmed',
    title: 'Baselines v7',
    source_type: 'current_schedule',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  })

  state.tables.task_baseline_items.push(
    {
      id: 'baseline-item-1',
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      title: '基础施工',
      target_progress: 50,
      planned_end_date: '2026-04-10',
      source_task_id: 'task-1',
      sort_order: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'baseline-item-2',
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      title: '主体结构',
      target_progress: 100,
      planned_end_date: '2026-04-12',
      source_task_id: 'task-2',
      sort_order: 2,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
  )

  state.tables.monthly_plans.push({
    id: monthlyPlanVersionId,
    project_id: projectId,
    version: 4,
    status: 'confirmed',
    month: '2026-04',
    title: '2026-04 月度计划',
    baseline_version_id: baselineVersionId,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  })

  state.tables.monthly_plan_items.push(
    {
      id: 'monthly-item-1',
      project_id: projectId,
      monthly_plan_version_id: monthlyPlanVersionId,
      baseline_item_id: 'baseline-item-1',
      source_task_id: 'task-1',
      title: '基础施工',
      target_progress: 60,
      current_progress: 35,
      planned_end_date: '2026-04-11',
      commitment_status: 'carried_over',
      sort_order: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'monthly-item-2',
      project_id: projectId,
      monthly_plan_version_id: monthlyPlanVersionId,
      baseline_item_id: 'baseline-item-2',
      source_task_id: 'task-2',
      title: '主体结构',
      target_progress: 100,
      current_progress: 100,
      planned_end_date: '2026-04-12',
      commitment_status: 'planned',
      sort_order: 2,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
  )

  state.tables.tasks.push(
    {
      id: 'task-1',
      project_id: projectId,
      title: '基础施工',
      status: 'in_progress',
      progress: 40,
      planned_end_date: '2026-04-10',
      actual_end_date: null,
      updated_at: '2026-04-10T12:00:00.000Z',
      baseline_item_id: 'baseline-item-1',
      monthly_plan_item_id: 'monthly-item-1',
      version: 1,
    },
    {
      id: 'task-2',
      project_id: projectId,
      title: '主体结构',
      status: 'completed',
      progress: 100,
      planned_end_date: '2026-04-12',
      actual_end_date: '2026-04-12',
      updated_at: '2026-04-12T18:00:00.000Z',
      baseline_item_id: 'baseline-item-2',
      monthly_plan_item_id: 'monthly-item-2',
      version: 1,
    },
    {
      id: 'task-3',
      project_id: projectId,
      title: '机电预埋',
      status: 'in_progress',
      progress: 20,
      planned_end_date: '2026-04-20',
      actual_end_date: null,
      updated_at: '2026-04-08T08:00:00.000Z',
      version: 1,
    },
  )

  state.tables.task_progress_snapshots.push(
    {
      id: 'snapshot-1',
      task_id: 'task-1',
      progress: 30,
      snapshot_date: '2026-04-08',
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      planning_source_type: 'execution',
      created_at: '2026-04-08T00:00:00.000Z',
    },
    {
      id: 'snapshot-2',
      task_id: 'task-2',
      progress: 100,
      snapshot_date: '2026-04-12',
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      planning_source_type: 'execution',
      created_at: '2026-04-12T00:00:00.000Z',
    },
    {
      id: 'snapshot-3',
      task_id: 'task-3',
      progress: 10,
      snapshot_date: '2026-04-08',
      planning_source_type: 'execution',
      created_at: '2026-04-08T00:00:00.000Z',
    },
  )

  state.tables.milestones.push(
    {
      id: 'milestone-1',
      project_id: projectId,
      title: 'M1 拿地',
      milestone_order: 1,
      baseline_date: '2026-04-05',
      current_plan_date: '2026-04-06',
      actual_date: '2026-04-06',
      status: 'completed',
    },
    {
      id: 'milestone-2',
      project_id: projectId,
      title: 'M2 开工',
      milestone_order: 2,
      baseline_date: '2026-04-12',
      current_plan_date: '2026-04-12',
      actual_date: '2026-04-13',
      status: 'completed',
    },
  )

  state.tables.task_conditions.push({
    id: 'condition-1',
    project_id: projectId,
    task_id: 'task-1',
    condition_name: '设计图纸会签',
    due_date: '2026-04-09',
    status: 'open',
    is_satisfied: false,
  })

  state.tables.task_obstacles.push({
    id: 'obstacle-1',
    project_id: projectId,
    task_id: 'task-1',
    description: '现场临设未完成',
    severity: 'high',
    status: 'open',
    expected_resolution_date: '2026-04-15',
  })

  state.tables.delay_requests.push({
    id: 'delay-1',
    project_id: projectId,
    task_id: 'task-1',
    reason: '材料晚到',
    delay_reason: 'supplier_delay',
    status: 'submitted',
    delayed_date: '2026-04-11',
  })

  return { projectId, baselineVersionId, monthlyPlanVersionId }
}

function seedBoundaryCompensationFixtures() {
  const projectId = 'project-0200'
  const baselineVersionId = 'baseline-v7'
  const switchVersionId = 'baseline-v8'
  const monthlyPlanVersionId = 'monthly-v4'

  state.tables.task_baselines.push(
    {
      id: baselineVersionId,
      project_id: projectId,
      version: 7,
      status: 'confirmed',
      title: 'Baseline v7',
      source_type: 'current_schedule',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: switchVersionId,
      project_id: projectId,
      version: 8,
      status: 'confirmed',
      title: 'Baseline v8',
      source_type: 'current_schedule',
      created_at: '2026-04-15T00:00:00.000Z',
      updated_at: '2026-04-15T00:00:00.000Z',
    },
  )

  state.tables.task_baseline_items.push(
    {
      id: 'baseline-parent-1',
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      title: '里程碑拆分父项',
      target_progress: 100,
      planned_end_date: '2026-04-12',
      source_task_id: 'task-split-parent',
      sort_order: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'baseline-child-1',
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      parent_item_id: 'baseline-parent-1',
      title: '子里程碑 A',
      target_progress: 50,
      planned_end_date: '2026-04-10',
      source_task_id: 'task-split-child-1',
      sort_order: 2,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'baseline-child-2',
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      parent_item_id: 'baseline-parent-1',
      title: '子里程碑 B',
      target_progress: 100,
      planned_end_date: '2026-04-14',
      source_task_id: 'task-split-child-2',
      sort_order: 3,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'baseline-merge-1',
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      title: '合并项 A',
      target_progress: 50,
      planned_end_date: '2026-04-18',
      source_task_id: 'task-merge',
      mapping_status: 'merged',
      sort_order: 4,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'baseline-merge-2',
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      title: '合并项 B',
      target_progress: 50,
      planned_end_date: '2026-04-18',
      source_task_id: 'task-merge',
      mapping_status: 'merged',
      sort_order: 5,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'baseline-plain-1',
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      title: '常规项',
      target_progress: 40,
      planned_end_date: '2026-04-18',
      source_task_id: 'task-plain',
      sort_order: 6,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
  )

  state.tables.monthly_plans.push({
    id: monthlyPlanVersionId,
    project_id: projectId,
    version: 4,
    status: 'confirmed',
    month: '2026-04',
    title: '2026-04 月度计划',
    baseline_version_id: baselineVersionId,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
    confirmed_at: '2026-04-15T00:00:00.000Z',
  })

  state.tables.monthly_plan_items.push(
    {
      id: 'monthly-item-1',
      project_id: projectId,
      monthly_plan_version_id: monthlyPlanVersionId,
      baseline_item_id: 'baseline-plain-1',
      source_task_id: 'task-plain',
      title: '常规项',
      target_progress: 40,
      current_progress: 35,
      planned_end_date: '2026-04-18',
      commitment_status: 'planned',
      sort_order: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    },
  )

  state.tables.tasks.push(
    {
      id: 'task-split-child-1',
      project_id: projectId,
      title: '子里程碑 A',
      status: 'completed',
      progress: 100,
      planned_end_date: '2026-04-10',
      actual_end_date: '2026-04-10',
      updated_at: '2026-04-10T18:00:00.000Z',
      baseline_item_id: 'baseline-child-1',
      version: 1,
    },
    {
      id: 'task-split-child-2',
      project_id: projectId,
      title: '子里程碑 B',
      status: 'completed',
      progress: 100,
      planned_end_date: '2026-04-14',
      actual_end_date: '2026-04-16',
      updated_at: '2026-04-16T18:00:00.000Z',
      baseline_item_id: 'baseline-child-2',
      version: 1,
    },
    {
      id: 'task-merge',
      project_id: projectId,
      title: '合并项',
      status: 'in_progress',
      progress: 60,
      planned_end_date: '2026-04-18',
      actual_end_date: null,
      updated_at: '2026-04-12T10:00:00.000Z',
      version: 1,
    },
    {
      id: 'task-plain',
      project_id: projectId,
      title: '常规项',
      status: 'completed',
      progress: 40,
      planned_end_date: '2026-04-18',
      actual_end_date: '2026-04-18',
      updated_at: '2026-04-18T08:00:00.000Z',
      baseline_item_id: 'baseline-plain-1',
      monthly_plan_item_id: 'monthly-item-1',
      version: 1,
    },
    {
      id: 'task-switch',
      project_id: projectId,
      title: '切换事件任务',
      status: 'in_progress',
      progress: 20,
      planned_end_date: '2026-04-20',
      actual_end_date: null,
      updated_at: '2026-04-15T08:00:00.000Z',
      version: 1,
    },
  )

  state.tables.task_progress_snapshots.push(
    {
      id: 'snapshot-split-1',
      project_id: projectId,
      task_id: 'task-split-child-1',
      progress: 100,
      snapshot_date: '2026-04-10',
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      planning_source_type: 'baseline',
      created_at: '2026-04-10T00:00:00.000Z',
    },
    {
      id: 'snapshot-split-2',
      project_id: projectId,
      task_id: 'task-split-child-2',
      progress: 100,
      snapshot_date: '2026-04-16',
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      planning_source_type: 'baseline',
      created_at: '2026-04-16T00:00:00.000Z',
    },
    {
      id: 'snapshot-merge',
      project_id: projectId,
      task_id: 'task-merge',
      progress: 60,
      snapshot_date: '2026-04-12',
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      planning_source_type: 'baseline',
      created_at: '2026-04-12T00:00:00.000Z',
    },
    {
      id: 'snapshot-plain',
      project_id: projectId,
      task_id: 'task-plain',
      progress: 40,
      snapshot_date: '2026-04-18',
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      planning_source_type: 'monthly_plan',
      created_at: '2026-04-18T00:00:00.000Z',
    },
    {
      id: 'snapshot-switch',
      project_id: projectId,
      task_id: 'task-switch',
      progress: 20,
      snapshot_date: '2026-04-15',
      baseline_version_id: switchVersionId,
      planning_source_type: 'execution',
      created_at: '2026-04-15T00:00:00.000Z',
    },
  )

  state.tables.milestones.push(
    {
      id: 'milestone-b1',
      project_id: projectId,
      title: 'M1 基线拆分',
      milestone_order: 1,
      baseline_date: '2026-04-10',
      current_plan_date: '2026-04-10',
      actual_date: '2026-04-10',
      status: 'completed',
    },
    {
      id: 'milestone-b2',
      project_id: projectId,
      title: 'M2 基线切换',
      milestone_order: 2,
      baseline_date: '2026-04-14',
      current_plan_date: '2026-04-15',
      actual_date: null,
      status: 'in_progress',
    },
  )

  state.tables.task_conditions.push({
    id: 'condition-merge',
    project_id: projectId,
    task_id: 'task-merge',
    condition_name: '确认合并映射',
    due_date: '2026-04-17',
    status: 'pending',
    is_satisfied: false,
  })

  return { projectId, baselineVersionId, monthlyPlanVersionId, switchVersionId }
}

beforeEach(() => {
  for (const table of Object.keys(state.tables) as TableName[]) {
    state.tables[table].splice(0, state.tables[table].length)
  }
  vi.clearAllMocks()
})

describe('progress deviation backend contract', () => {
  it('locks the query contract, mainline shape and runtime route registration', () => {
    const indexSource = readServerFile('src', 'index.ts')

    expect(progressDeviationContracts).toMatchObject({
      method: 'GET',
      path: '/api/progress-deviation',
    })
    expect(progressDeviationContracts.requestShape).toContain('project_id: string')
    expect(progressDeviationContracts.requestShape).toContain('baseline_version_id: string')
    expect(progressDeviationContracts.requestShape).toContain('lock?: boolean')
    expect(progressDeviationContracts.responseShape).toContain('version_lock?: BaselineVersionLock | null')
    expect(progressDeviationContracts.responseShape).toContain('mainlines: [...]')
    expect(progressDeviationContracts.responseShape).toContain('mapping_monitoring')
    expect(progressDeviationContracts.responseShape).toContain('trend_events')
    expect(progressDeviationContracts.responseShape).toContain('child_group')
    expect(progressDeviationContracts.responseShape).toContain('merged_into')
    expect(progressDeviationContracts.responseShape).toContain('mapping_status')
    expect(progressDeviationContracts.errorCodes).toEqual(
      expect.arrayContaining(['NOT_FOUND', 'DEVIATION_ANALYSIS_UNAVAILABLE', 'LOCK_HELD', 'LOCK_EXPIRED', 'VALIDATION_ERROR'])
    )

    expect(baselineVersionLockContracts).toMatchObject({
      method: 'GET',
      path: '/api/progress-deviation/lock',
    })
    expect(baselineVersionLockContracts.responseShape).toContain('BaselineVersionLock | null')

    expect(indexSource).toContain("import progressDeviationRouter from './routes/progress-deviation.js'")
    expect(indexSource).toContain("app.use('/api/progress-deviation', progressDeviationRouter)")
  })

  it('acquires and reuses a baseline version lock namespace', async () => {
    const { projectId, baselineVersionId } = seedAnalysisFixtures()

    const lock = await acquireBaselineVersionLock({
      projectId,
      baselineVersionId,
      actorUserId: 'analyst-1',
    })

    expect(lock).toMatchObject({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      resource_id: buildBaselineVersionLockResourceId(projectId, baselineVersionId),
      locked_by: 'analyst-1',
      is_locked: true,
    })

    const readBack = await getBaselineVersionLock(projectId, baselineVersionId)
    expect(readBack).toMatchObject({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      resource_id: buildBaselineVersionLockResourceId(projectId, baselineVersionId),
      locked_by: 'analyst-1',
      is_locked: true,
    })

    await expect(
      acquireBaselineVersionLock({
        projectId,
        baselineVersionId,
        actorUserId: 'analyst-2',
      })
    ).rejects.toMatchObject({
      code: 'LOCK_HELD',
    })
  })

  it('serves the dedicated lock read route with a nullable payload shape', async () => {
    const { projectId, baselineVersionId } = seedAnalysisFixtures()
    const request = supertest(buildApp())

    await acquireBaselineVersionLock({
      projectId,
      baselineVersionId,
      actorUserId: 'analyst-1',
    })

    const response = await request.get('/api/progress-deviation/lock').query({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.lock).toMatchObject({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      locked_by: 'analyst-1',
      is_locked: true,
    })
  })

  it('builds three deviation mainlines with version locking support', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      lock: true,
      actorUserId: 'analyst-1',
    })

    expect(report).toMatchObject({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })
    expect(report.mainlines).toHaveLength(3)
    expect(report.mainlines.map((line) => line.key)).toEqual(['baseline', 'monthly_plan', 'execution'])
    expect(report.mainlines[0].rows).toHaveLength(2)
    expect(report.mainlines[1].rows).toHaveLength(2)
    expect(report.mainlines[2].rows).toHaveLength(3)
    expect(report.summary).toMatchObject({
      baseline_items: 2,
      monthly_plan_items: 2,
      execution_items: 3,
      total_items: 7,
      carryover_items: 1,
    })
    expect(report.version_lock).toMatchObject({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      locked_by: 'analyst-1',
    })
    expect(report.m1_m9_consistency?.summary.total).toBe(2)
    expect(report.m1_m9_consistency?.summary.blocked).toBe(1)

    const baselineRow = report.mainlines[0].rows.find((row) => row.id === 'baseline-item-1')
    expect(baselineRow).toMatchObject({
      status: 'delayed',
      planned_progress: 50,
      actual_progress: 40,
    })
    expect(baselineRow?.attribution).toMatchObject({
      blocking_conditions: [
        expect.objectContaining({ id: 'condition-1', title: '设计图纸会签' }),
      ],
      active_obstacles: [
        expect.objectContaining({ id: 'obstacle-1', description: '现场临设未完成' }),
      ],
      delay_reasons: [
        expect.objectContaining({ id: 'delay-1', reason: '材料晚到' }),
      ],
    })
    expect(baselineRow?.data_completeness).toMatchObject({
      has_snapshot: true,
      has_actual_progress: true,
      has_planning_link: true,
      has_attribution: true,
    })

    const monthlyCarryoverRow = report.mainlines[1].rows.find((row) => row.id === 'monthly-item-1')
    expect(monthlyCarryoverRow).toMatchObject({
      status: 'carried_over',
    })
  })

  it('compensates split and merge boundaries and emits version switch trend events', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedBoundaryCompensationFixtures()

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      lock: false,
      actorUserId: 'analyst-2',
    })

    expect(report.mainlines[0].rows).toHaveLength(3)
    expect(report.summary.baseline_items).toBe(3)
    expect(report.mapping_monitoring).toMatchObject({
      mapping_pending_count: 1,
      merged_count: 2,
    })
    expect(report.mapping_monitoring.split_groups).toHaveLength(1)
    expect(report.mapping_monitoring.merge_groups).toHaveLength(1)

    const splitRow = report.mainlines[0].rows.find((row) => row.id === 'baseline-parent-1')
    expect(splitRow).toMatchObject({
      mapping_status: 'mapped',
      actual_date: '2026-04-16',
      status: 'delayed',
    })
    expect(splitRow?.child_group).toMatchObject({
      group_id: 'baseline-parent-1',
      child_count: 2,
      last_completed_date: '2026-04-16',
    })

    const mergeRow = report.mainlines[0].rows.find((row) => row.id === 'baseline-merge-1')
    expect(mergeRow).toMatchObject({
      mapping_status: 'mapping_pending',
      reason: 'mapping pending',
      merged_into: {
        group_id: 'task-merge',
        target_item_id: 'baseline-merge-1',
        title: '合并项 A',
        item_ids: ['baseline-merge-1', 'baseline-merge-2'],
      },
    })
    expect(mergeRow?.attribution).toMatchObject({
      blocking_conditions: [
        expect.objectContaining({ id: 'condition-merge', title: '确认合并映射' }),
      ],
    })

    expect(report.trend_events).toHaveLength(1)
    expect(report.trend_events[0]).toMatchObject({
      event_type: 'baseline_version_switch',
      marker_type: 'vertical_line',
      switch_date: '2026-04-15',
      from_version: 'v7',
      to_version: 'v8',
    })
    expect(report.trend_events[0].explanation).toContain('2026-04-15 before v7')
    expect(report.trend_events[0].explanation).toContain('2026-04-15 after v8')
  })

  it('serves the progress-deviation route with the expected response structure', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()
    const request = supertest(buildApp())

    const response = await request.get('/api/progress-deviation').query({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      lock: 'true',
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })
    expect(response.body.data.mainlines).toHaveLength(3)
    expect(response.body.data.version_lock).toMatchObject({
      baseline_version_id: baselineVersionId,
      locked_by: 'system',
    })
  })

  it('surfaces validation errors for missing identifiers', async () => {
    const request = supertest(buildApp())
    const response = await request.get('/api/progress-deviation').query({
      project_id: '',
      baseline_version_id: '',
    })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('can be used as a pure service contract without the route wrapper', async () => {
    const { projectId, baselineVersionId } = seedAnalysisFixtures()
    const report = await getProgressDeviationAnalysisOrThrow({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      lock: false,
      actorUserId: 'observer-1',
    })

    expect(report.mainlines).toHaveLength(3)
    expect(report.version_lock).toBeNull()
  })
})
