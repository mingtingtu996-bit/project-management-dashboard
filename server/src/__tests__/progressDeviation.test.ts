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
  | 'task_duration_forecasts'
  | 'task_dependencies'
  | 'planning_draft_locks'
  | 'milestones'
  | 'task_conditions'
  | 'task_obstacles'
  | 'project_schedule_states'
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
    task_duration_forecasts: [],
    task_dependencies: [],
    planning_draft_locks: [],
    milestones: [],
    task_conditions: [],
    task_obstacles: [],
    project_schedule_states: [],
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
      if (value && typeof value === 'object' && !Array.isArray(value) && '__not' in value) {
        return row[column] !== (value as { __not: unknown }).__not
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

    neq(column: string, value: unknown) {
      this.filters.push([column, { __not: value }])
      return this
    }

    or() {
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

  function normalizeSql(sql: string) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase()
  }

  function rowsByTaskIds(table: TableName, projectId: unknown, taskIds: unknown) {
    const ids = new Set(Array.isArray(taskIds) ? taskIds.map(String) : [])
    return tables[table].filter((row) => {
      if (!ids.has(String(row.task_id ?? ''))) return false
      if (row.project_id !== undefined) return row.project_id === projectId
      const task = tables.tasks.find((candidate) => candidate.id === row.task_id)
      return task?.project_id === projectId
    })
  }

  function readDirectSqlRows(sql: string, params: unknown[]) {
    const normalized = normalizeSql(sql)
    if (normalized.includes('from public.projects p')) {
      const project = tables.projects.find((row) => row.id === params[0])
      const member = tables.project_members.find((row) => (
        row.project_id === params[0] && row.user_id === params[1]
      ))
      return project ? [{ ...project, permission_level: member?.permission_level ?? null }] : []
    }
    if (normalized.includes('from public.projects')) {
      return tables.projects.filter((row) => row.id === params[0])
    }
    if (normalized.includes('from public.project_members')) {
      return tables.project_members.filter((row) => row.project_id === params[0])
    }
    if (normalized.includes('from public.monthly_plans')) {
      return tables.monthly_plans.filter((row) => (
        row.project_id === params[0] && (params.length < 2 || row.id === params[1])
      ))
    }
    if (normalized.includes('from public.task_baselines')) {
      return tables.task_baselines.filter((row) => (
        row.project_id === params[0] && (params.length < 2 || row.id === params[1])
      ))
    }
    if (normalized.includes('from public.task_baseline_items')) {
      return tables.task_baseline_items.filter((row) => (
        row.baseline_version_id === params[0] && row.project_id === params[1]
      ))
    }
    if (normalized.includes('from public.monthly_plan_items')) {
      return tables.monthly_plan_items.filter((row) => (
        row.monthly_plan_version_id === params[0] && row.project_id === params[1]
      ))
    }
    if (normalized.includes('from public.task_progress_snapshots')) {
      return rowsByTaskIds('task_progress_snapshots', params[0], params[1])
    }
    if (normalized.includes('from public.task_duration_forecasts')) {
      return rowsByTaskIds('task_duration_forecasts', params[0], params[1])
    }
    if (normalized.includes('from public.task_conditions')) {
      return rowsByTaskIds('task_conditions', params[0], params[1])
    }
    if (normalized.includes('from public.task_obstacles')) {
      return rowsByTaskIds('task_obstacles', params[0], params[1])
    }
    if (normalized.includes('from public.task_dependencies')) {
      return rowsByTaskIds('task_dependencies', params[0], params[1])
    }
    if (normalized.includes('from public.project_schedule_states')) {
      return tables.project_schedule_states.filter((row) => row.project_id === params[0])
    }
    if (normalized.includes('from public.tasks') && normalized.includes('is_milestone is true')) {
      return tables.milestones.filter((row) => row.project_id === params[0])
    }
    if (normalized.includes('from public.tasks')) {
      return tables.tasks.filter((row) => row.project_id === params[0])
    }
    if (normalized.includes('from public.planning_draft_locks')) {
      return tables.planning_draft_locks.filter((row) => (
        row.project_id === params[0]
        && row.draft_type === params[1]
        && row.resource_id === params[2]
      ))
    }
    throw new Error(`Unsupported direct SQL in progress deviation test: ${sql}`)
  }

  const databaseQuery = vi.fn(async (sql: string, params: unknown[] = []) => ({
    rows: readDirectSqlRows(sql, params),
  }))
  const databaseClientQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)
    if (
      normalized === 'begin'
      || normalized === 'commit'
      || normalized === 'rollback'
      || normalized.includes('pg_advisory_xact_lock')
    ) {
      return { rows: [] }
    }
    if (normalized.includes('from public.planning_draft_locks')) {
      return { rows: readDirectSqlRows(sql, params) }
    }
    if (normalized.includes('insert into public.planning_draft_locks')) {
      const row = {
        id: params[0],
        project_id: params[1],
        draft_type: params[2],
        resource_id: params[3],
        locked_by: params[4],
        locked_at: params[5],
        lock_expires_at: params[6],
        reminder_sent_at: null,
        released_at: null,
        released_by: null,
        release_reason: null,
        is_locked: true,
        version: 1,
        created_at: params[5],
        updated_at: params[5],
      }
      tables.planning_draft_locks.push(row)
      return { rows: [row] }
    }
    if (normalized.includes('update public.planning_draft_locks')) {
      const row = tables.planning_draft_locks.find((candidate) => (
        candidate.id === params[0]
        && candidate.project_id === params[1]
        && candidate.draft_type === params[2]
        && candidate.resource_id === params[3]
      ))
      if (!row) return { rows: [] }
      Object.assign(row, {
        locked_by: params[4],
        locked_at: params[5],
        lock_expires_at: params[6],
        reminder_sent_at: null,
        released_at: null,
        released_by: null,
        release_reason: null,
        is_locked: true,
        version: Number(row.version ?? 0) + 1,
        updated_at: params[5],
      })
      return { rows: [row] }
    }
    throw new Error(`Unsupported transaction SQL in progress deviation test: ${sql}`)
  })
  const databaseClientRelease = vi.fn()
  const getClient = vi.fn(async () => ({
    query: databaseClientQuery,
    release: databaseClientRelease,
  }))

  return {
    tables,
    supabase,
    databaseQuery,
    databaseClientQuery,
    databaseClientRelease,
    getClient,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
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

vi.mock('../database.js', () => ({
  query: state.databaseQuery,
  getClient: state.getClient,
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: vi.fn(async () => []),
  updateNotificationById: vi.fn(async (_id: string, payload: Record<string, unknown>) => ({
    id: _id,
    ...payload,
  })),
}))

vi.mock('../services/notificationTouchpointService.js', () => ({
  notificationTouchpointService: {
    emit: vi.fn(async (payload: Record<string, unknown>) => payload),
  },
}))

vi.mock('../services/constructionCalendar.js', async () => {
  const actual = await vi.importActual<typeof import('../services/constructionCalendar.js')>('../services/constructionCalendar.js')
  return {
    ...actual,
    resolveConstructionCalendarContext: vi.fn(async () => ({
      basis: 'calendar_day',
      windows: [],
    })),
  }
})

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
      standard_task_metadata: { durationContributionMode: 'duration_bearing' },
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
      standard_task_metadata: { durationContributionMode: 'record_only' },
      planned_end_date: '2026-04-20',
      actual_end_date: null,
      updated_at: '2026-04-08T08:00:00.000Z',
      version: 1,
    },
  )

  state.tables.task_duration_forecasts.push(
    {
      id: 'forecast-1-old',
      project_id: projectId,
      task_id: 'task-1',
      forecast_delay_days: 30,
      remaining_duration_days: 20,
      confidence_level: 'high',
      factor_summary: {
        contextVersion: 'v1.4.7.4',
        factors: [
          {
            key: 'seasonal_productivity',
            label: 'old seasonal pressure',
            multiplier: 1.5,
            extraDays: 30,
            confidenceDelta: -0.1,
            actionPolicy: 'superseded',
            reason: 'old forecast should not be selected over current forecast',
            source: 'old_seed',
          },
        ],
      },
      generated_at: '2026-04-20T00:00:00.000Z',
      created_at: '2026-04-20T00:00:00.000Z',
      is_current: false,
    },
    {
      id: 'forecast-1',
      project_id: projectId,
      task_id: 'task-1',
      forecast_delay_days: 6,
      remaining_duration_days: 12,
      confidence_level: 'medium',
      factor_summary: {
        contextVersion: 'v1.4.7.4',
        factors: [
          {
            key: 'resource_conflict',
            label: 'resource pressure',
            multiplier: 1.18,
            extraDays: 4,
            confidenceDelta: -0.08,
            actionPolicy: 'candidate_only',
            reason: 'same responsible unit and workface overlap in planned window',
            source: 'v1.4.7.4_seed',
          },
          {
            key: 'workflow_sequence',
            label: 'workflow sequence',
            multiplier: 1.08,
            extraDays: 1,
            confidenceDelta: -0.03,
            actionPolicy: 'confidence_only',
            reason: 'same floor sequence is tighter than execution rhythm',
            source: 'v1.4.7.4_seed',
          },
        ],
        businessReasons: ['site pressure'],
      },
      generated_at: '2026-04-11T00:00:00.000Z',
      created_at: '2026-04-11T00:00:00.000Z',
      is_current: true,
    },
    {
      id: 'forecast-3',
      project_id: projectId,
      task_id: 'task-3',
      forecast_delay_days: 5,
      remaining_duration_days: 8,
      confidence_level: 'medium',
      factor_summary: {
        contextVersion: 'v1.4.7.4',
        factors: [
          {
            key: 'resource_conflict',
            label: 'resource pressure',
            multiplier: 1.2,
            extraDays: 3,
            confidenceDelta: -0.08,
            actionPolicy: 'candidate_only',
            reason: 'record-only row should not become pressure cause',
            source: 'v1.4.7.4_seed',
          },
        ],
        businessReasons: ['record only pressure ignored'],
      },
      generated_at: '2026-04-11T00:00:00.000Z',
      created_at: '2026-04-11T00:00:00.000Z',
      is_current: true,
    },
  )

  state.tables.tasks.push(
    {
      id: 'task-4',
      project_id: projectId,
      title: 'quality gate review',
      status: 'in_progress',
      progress: 10,
      standard_task_metadata: { durationContributionMode: 'quality_gate' },
      planned_end_date: '2026-04-09',
      actual_end_date: null,
      updated_at: '2026-04-12T08:00:00.000Z',
      version: 1,
    },
    {
      id: 'task-5',
      project_id: projectId,
      title: 'external inspection wait',
      status: 'in_progress',
      progress: 5,
      standard_task_metadata: { durationContributionMode: 'external_wait' },
      planned_end_date: '2026-04-09',
      actual_end_date: null,
      updated_at: '2026-04-13T08:00:00.000Z',
      version: 1,
    },
    {
      id: 'task-6',
      project_id: projectId,
      title: 'handover package signoff',
      status: 'in_progress',
      progress: 5,
      standard_task_metadata: { durationContributionMode: 'handover_marker' },
      planned_end_date: '2026-04-09',
      actual_end_date: null,
      updated_at: '2026-04-14T08:00:00.000Z',
      version: 1,
    },
    {
      id: 'task-7',
      project_id: projectId,
      title: 'embedded check record',
      status: 'in_progress',
      progress: 5,
      standard_task_metadata: { durationContributionMode: 'embedded_check' },
      planned_end_date: '2026-04-09',
      actual_end_date: null,
      updated_at: '2026-04-15T08:00:00.000Z',
      version: 1,
    },
  )

  state.tables.task_duration_forecasts.push(
    {
      id: 'forecast-4',
      project_id: projectId,
      task_id: 'task-4',
      forecast_delay_days: 4,
      remaining_duration_days: 6,
      confidence_level: 'high',
      factor_summary: {
        contextVersion: 'v1.4.7.4',
        factors: [
          { key: 'resource_conflict', label: 'ignored pressure', multiplier: 1.2, extraDays: 3, confidenceDelta: -0.08, actionPolicy: 'candidate_only', reason: 'quality gate should not become pressure cause', source: 'v1.4.7.4_seed' },
          { key: 'process_constraint', label: 'gate constraint', multiplier: 1.05, extraDays: 2, confidenceDelta: -0.02, actionPolicy: 'candidate_only', reason: 'quality gate is waiting for required inspection', source: 'v1.4.7.4_seed' },
        ],
      },
      generated_at: '2026-04-11T00:00:00.000Z',
      created_at: '2026-04-11T00:00:00.000Z',
      is_current: true,
    },
    {
      id: 'forecast-5',
      project_id: projectId,
      task_id: 'task-5',
      forecast_delay_days: 5,
      remaining_duration_days: 7,
      confidence_level: 'medium',
      factor_summary: {
        contextVersion: 'v1.4.7.4',
        factors: [
          { key: 'resource_conflict', label: 'ignored pressure', multiplier: 1.2, extraDays: 3, confidenceDelta: -0.08, actionPolicy: 'candidate_only', reason: 'external wait should not become pressure cause', source: 'v1.4.7.4_seed' },
          { key: 'external_readiness', label: 'external readiness', multiplier: 1.1, extraDays: 4, confidenceDelta: -0.02, actionPolicy: 'candidate_only', reason: 'external test report is not ready', source: 'v1.4.7.4_seed' },
        ],
      },
      generated_at: '2026-04-11T00:00:00.000Z',
      created_at: '2026-04-11T00:00:00.000Z',
      is_current: true,
    },
    {
      id: 'forecast-6',
      project_id: projectId,
      task_id: 'task-6',
      forecast_delay_days: 5,
      remaining_duration_days: 7,
      confidence_level: 'medium',
      factor_summary: {
        contextVersion: 'v1.4.7.4',
        factors: [
          { key: 'resource_conflict', label: 'ignored pressure', multiplier: 1.2, extraDays: 3, confidenceDelta: -0.08, actionPolicy: 'candidate_only', reason: 'handover marker should not become pressure cause', source: 'v1.4.7.4_seed' },
          { key: 'external_readiness', label: 'handover readiness', multiplier: 1.1, extraDays: 3, confidenceDelta: -0.02, actionPolicy: 'candidate_only', reason: 'handover package is not signed', source: 'v1.4.7.4_seed' },
        ],
      },
      generated_at: '2026-04-11T00:00:00.000Z',
      created_at: '2026-04-11T00:00:00.000Z',
      is_current: true,
    },
    {
      id: 'forecast-7',
      project_id: projectId,
      task_id: 'task-7',
      forecast_delay_days: 5,
      remaining_duration_days: 7,
      confidence_level: 'medium',
      factor_summary: {
        contextVersion: 'v1.4.7.4',
        factors: [
          { key: 'resource_conflict', label: 'ignored pressure', multiplier: 1.2, extraDays: 3, confidenceDelta: -0.08, actionPolicy: 'candidate_only', reason: 'embedded check should not become pressure cause', source: 'v1.4.7.4_seed' },
          { key: 'external_readiness', label: 'ignored readiness', multiplier: 1.1, extraDays: 3, confidenceDelta: -0.02, actionPolicy: 'candidate_only', reason: 'embedded check should not become external wait cause', source: 'v1.4.7.4_seed' },
        ],
      },
      generated_at: '2026-04-11T00:00:00.000Z',
      created_at: '2026-04-11T00:00:00.000Z',
      is_current: true,
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
    { id: 'snapshot-4', task_id: 'task-4', progress: 10, snapshot_date: '2026-04-09', planning_source_type: 'execution', created_at: '2026-04-09T00:00:00.000Z' },
    { id: 'snapshot-5', task_id: 'task-5', progress: 5, snapshot_date: '2026-04-09', planning_source_type: 'execution', created_at: '2026-04-09T00:00:00.000Z' },
    { id: 'snapshot-6', task_id: 'task-6', progress: 5, snapshot_date: '2026-04-09', planning_source_type: 'execution', created_at: '2026-04-09T00:00:00.000Z' },
    { id: 'snapshot-7', task_id: 'task-7', progress: 5, snapshot_date: '2026-04-09', planning_source_type: 'execution', created_at: '2026-04-09T00:00:00.000Z' },
  )

  state.tables.milestones.push(
    {
      id: 'milestone-1',
      project_id: projectId,
      title: 'M1 鎷垮湴',
      milestone_order: 1,
      baseline_date: '2026-04-05',
      current_plan_date: '2026-04-06',
      actual_date: '2026-04-06',
      status: 'completed',
    },
    {
      id: 'milestone-2',
      project_id: projectId,
      title: 'M2 start',
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
    description: 'site setup incomplete',
    severity: 'high',
    status: 'open',
    expected_resolution_date: '2026-04-15',
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
      title: 'split parent',
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
      title: '合并A',
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
      title: '合并B',
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
      title: 'plain item',
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
      title: 'plain item',
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
      title: 'merged item',
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
      title: 'plain item',
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
    expect(progressDeviationContracts.responseShape).toContain('cause_chain')
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

  it('keeps direct read SQL on code-owned fixed query branches', () => {
    const source = readServerFile('src', 'services', 'progressDeviationService.ts')

    expect(source).not.toContain('rawQuery(sql')
    expect(source).not.toContain("public.' + safeTable")
    expect(source).not.toContain("' WHERE ' + safeColumn")
    expect(source).toContain('PROGRESS_DEVIATION_DIRECT_READS')
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
    expect(report.mainlines[2].rows).toHaveLength(7)
    expect(report.summary).toMatchObject({
      baseline_items: 2,
      monthly_plan_items: 2,
      execution_items: 7,
      total_items: 11,
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
        expect.objectContaining({ id: 'obstacle-1', description: 'site setup incomplete' }),
      ],
      delay_reasons: [
        expect.objectContaining({
          reason: '\u73b0\u573a\u627f\u8f7d\u538b\u529b',
          reason_type: 'site_capacity_pressure',
          source: 'task_duration_forecasts.factor_summary',
          impact_days: 4,
          priority: 90,
          responsibility_basis: 'site_capacity',
        }),
        expect.objectContaining({
          reason: '\u6d41\u6c34\u8282\u594f\u504f\u5dee',
          reason_type: 'workflow_sequence',
        }),
      ],
    })
    expect(baselineRow?.attribution?.delay_reasons ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ reason_type: 'calendar_productivity', impact_days: 30 })])
    )
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

    const recordOnlyExecutionRow = report.mainlines[2].rows.find((row) => row.id === 'task-3')
    expect(recordOnlyExecutionRow?.duration_contribution_mode).toBe('record_only')
    expect(recordOnlyExecutionRow?.attribution?.delay_reasons ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: '\u73b0\u573a\u627f\u8f7d\u538b\u529b' })])
    )
    const qualityGateRow = report.mainlines[2].rows.find((row) => row.id === 'task-4')
    expect(qualityGateRow?.attribution?.delay_reasons ?? []).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason_type: 'process_constraint', responsibility_basis: 'quality_gate' })])
    )
    expect(qualityGateRow?.attribution?.delay_reasons ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ reason_type: 'site_capacity_pressure' })])
    )
    const externalWaitRow = report.mainlines[2].rows.find((row) => row.id === 'task-5')
    expect(externalWaitRow?.attribution?.delay_reasons ?? []).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason_type: 'external_readiness', responsibility_basis: 'external_wait' })])
    )
    expect(externalWaitRow?.attribution?.delay_reasons ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ reason_type: 'site_capacity_pressure' })])
    )
    const handoverRow = report.mainlines[2].rows.find((row) => row.id === 'task-6')
    expect(handoverRow?.attribution?.delay_reasons ?? []).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason_type: 'external_readiness', responsibility_basis: 'external_wait' })])
    )
    expect(handoverRow?.attribution?.delay_reasons ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ reason_type: 'site_capacity_pressure' })])
    )
    const embeddedCheckRow = report.mainlines[2].rows.find((row) => row.id === 'task-7')
    expect(embeddedCheckRow?.attribution?.delay_reasons ?? []).toEqual([])
    expect(report.top_deviation_causes).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: '\u73b0\u573a\u627f\u8f7d\u538b\u529b', impact_days: expect.any(Number), score: expect.any(Number) })])
    )
    const taskOneContribution = report.responsibility_contribution?.find((entry) => entry.task_ids.includes('task-1'))
    expect(taskOneContribution?.count).toBe(1)
    expect(taskOneContribution).toMatchObject({ basis: 'site_capacity', confidence: expect.any(Number) })
  }, 30_000)

  it('does not treat legacy scheduled end_date as a real actual finish date in deviation rows', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()
    const task = state.tables.tasks.find((row) => row.id === 'task-2')
    if (!task) throw new Error('task-2 fixture missing')
    task.actual_end_date = null
    task.end_date = '2026-04-20'
    task.updated_at = '2026-04-21T08:00:00.000Z'

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    for (const mainline of report.mainlines) {
      const row = mainline.rows.find((item) => item.source_task_id === 'task-2')
      if (!row) continue
      expect(row.actual_date).toBeNull()
      expect(row.deviation_days).toBe(0)
      expect(row.status).not.toBe('delayed')
      expect(row.reason).not.toBe('completion date exceeds plan')
    }
  })

  it('routes dependency-caused deviation responsibility to the upstream accountable owner', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push(
      {
        id: 'task-upstream-owner-a',
        project_id: projectId,
        title: 'Owner A upstream prerequisite',
        status: 'in_progress',
        progress: 60,
        participant_unit_id: 'unit-owner-a',
        participant_unit_name: 'Owner A',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-18',
        actual_end_date: null,
        updated_at: '2026-04-17T08:00:00.000Z',
        version: 1,
      },
      {
        id: 'task-downstream-owner-b',
        project_id: projectId,
        title: 'Owner B downstream work',
        status: 'in_progress',
        progress: 10,
        participant_unit_id: 'unit-owner-b',
        participant_unit_name: 'Owner B',
        planned_start_date: '2026-04-12',
        planned_end_date: '2026-04-15',
        preceding_task_id: 'task-upstream-owner-a',
        actual_end_date: null,
        updated_at: '2026-04-18T08:00:00.000Z',
        version: 1,
      },
    )
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-downstream-owner-b',
      project_id: projectId,
      task_id: 'task-downstream-owner-b',
      progress: 10,
      snapshot_date: '2026-04-18',
      planning_source_type: 'execution',
      created_at: '2026-04-18T00:00:00.000Z',
    })
    state.tables.task_dependencies.push({
      id: 'dep-downstream-upstream',
      project_id: projectId,
      task_id: 'task-downstream-owner-b',
      dependency_task_id: 'task-upstream-owner-a',
      dependency_type: 'FS',
      lag_days: 0,
      required_for_start: true,
      status: 'active',
      source_type: 'manual',
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-downstream-owner-b',
      project_id: projectId,
      task_id: 'task-downstream-owner-b',
      forecast_delay_days: 4,
      remaining_duration_days: 9,
      confidence_level: 'high',
      factor_summary: {
        contextVersion: 'v1.4.8',
        factors: [
          {
            key: 'workflow_sequence',
            label: 'dependency wait',
            multiplier: 1.1,
            extraDays: 1,
            confidenceDelta: -0.02,
            actionPolicy: 'candidate_only',
            reason: 'downstream start is blocked by unfinished upstream prerequisite',
            source: 'task_dependencies',
          },
        ],
      },
      calculation_context: {
        remaining_duration_forecast: {
          dependencyPropagation: {
            count: 1,
            maxWaitDays: 4,
            blockingDependencies: [
              {
                dependencyTaskId: 'task-upstream-owner-a',
                dependencyType: 'FS',
                constraintType: 'start',
                waitDays: 4,
                floorRemainingDays: 9,
                expectedFinishDate: '2026-04-19',
                availableStartDate: '2026-04-19',
                source: 'task_dependencies',
              },
            ],
          },
        },
      },
      metadata: {
        forecastSources: {
          dependencyPropagation: {
            count: 1,
            maxWaitDays: 4,
            blockingDependencies: [
              {
                dependencyTaskId: 'task-upstream-owner-a',
                dependencyType: 'FS',
                constraintType: 'start',
                waitDays: 4,
                floorRemainingDays: 9,
                expectedFinishDate: '2026-04-19',
                availableStartDate: '2026-04-19',
                source: 'task_dependencies',
              },
            ],
          },
        },
      },
      generated_at: '2026-04-18T00:00:00.000Z',
      created_at: '2026-04-18T00:00:00.000Z',
      is_current: true,
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const downstreamRow = report.mainlines[2].rows.find((row) => row.id === 'task-downstream-owner-b')
    const causeChain = (downstreamRow?.attribution as any)?.cause_chain ?? []
    expect(causeChain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cause_type: 'dependency_wait',
          affected_task_id: 'task-downstream-owner-b',
          upstream_task_id: 'task-upstream-owner-a',
          impacted_owner: 'Owner B',
          impacted_owner_id: 'unit-owner-b',
          accountable_owner: 'Owner A',
          accountable_owner_id: 'unit-owner-a',
          responsibility_basis: 'upstream_dependency',
          impact_days: 4,
          evidence_source: expect.stringContaining('task_duration_forecasts'),
        }),
      ]),
    )

    const responsibilityContribution = report.responsibility_contribution as unknown as Array<Record<string, unknown>>
    expect(responsibilityContribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'Owner A',
          owner_id: 'unit-owner-a',
          basis: 'upstream_dependency',
          responsibility_role: 'accountable_subject',
          task_ids: expect.arrayContaining(['task-downstream-owner-b']),
          causal_task_ids: expect.arrayContaining(['task-upstream-owner-a']),
          impact_days: 4,
          weighted_count: 1,
          evidence_sources: expect.arrayContaining([expect.stringContaining('task_duration_forecasts')]),
        }),
      ]),
    )
    expect(responsibilityContribution).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'Owner B',
          basis: 'upstream_dependency',
          responsibility_role: 'accountable_subject',
        }),
      ]),
    )
  }, 60_000)

  it('routes dependency accountability from dependency facts when forecast propagation evidence is absent', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push(
      {
        id: 'task-fact-only-upstream-a',
        project_id: projectId,
        title: 'Owner A fact-only prerequisite',
        status: 'in_progress',
        progress: 50,
        participant_unit_id: 'unit-owner-a',
        participant_unit_name: 'Owner A',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-18',
        actual_end_date: null,
        updated_at: '2026-04-18T08:00:00.000Z',
        version: 1,
      },
      {
        id: 'task-fact-only-downstream-b',
        project_id: projectId,
        title: 'Owner B fact-only downstream work',
        status: 'in_progress',
        progress: 10,
        participant_unit_id: 'unit-owner-b',
        participant_unit_name: 'Owner B',
        planned_start_date: '2026-04-12',
        planned_end_date: '2026-04-15',
        preceding_task_id: 'task-fact-only-upstream-a',
        actual_end_date: null,
        updated_at: '2026-04-18T08:00:00.000Z',
        version: 1,
      },
    )
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-fact-only-downstream-b',
      project_id: projectId,
      task_id: 'task-fact-only-downstream-b',
      progress: 10,
      snapshot_date: '2026-04-18',
      planning_source_type: 'execution',
      created_at: '2026-04-18T00:00:00.000Z',
    })
    state.tables.task_dependencies.push({
      id: 'dep-fact-only-downstream-upstream',
      project_id: projectId,
      task_id: 'task-fact-only-downstream-b',
      dependency_task_id: 'task-fact-only-upstream-a',
      dependency_type: 'FS',
      lag_days: 0,
      required_for_start: true,
      status: 'active',
      source_type: 'manual',
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const downstreamRow = report.mainlines[2].rows.find((row) => row.id === 'task-fact-only-downstream-b')
    const dependencyCause = ((downstreamRow?.attribution as any)?.cause_chain ?? [])
      .find((chain: Record<string, unknown>) => chain.cause_type === 'dependency_wait')
    expect(dependencyCause).toMatchObject({
      affected_task_id: 'task-fact-only-downstream-b',
      upstream_task_id: 'task-fact-only-upstream-a',
      impacted_owner: 'Owner B',
      accountable_owner: 'Owner A',
      accountable_owner_id: 'unit-owner-a',
      responsibility_basis: 'upstream_dependency',
      confidence: 'high',
      evidence_source: expect.stringContaining('task_dependencies'),
      evidence: expect.objectContaining({
        dependency_relation_id: 'dep-fact-only-downstream-upstream',
        required_for_start: true,
        relation_status: 'active',
      }),
    })
    expect(Number(dependencyCause?.impact_days)).toBeGreaterThan(0)

    const responsibilityContribution = report.responsibility_contribution as unknown as Array<Record<string, unknown>>
    expect(responsibilityContribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'Owner A',
          owner_id: 'unit-owner-a',
          basis: 'upstream_dependency',
          responsibility_role: 'accountable_subject',
          task_ids: expect.arrayContaining(['task-fact-only-downstream-b']),
          causal_task_ids: expect.arrayContaining(['task-fact-only-upstream-a']),
        }),
      ]),
    )
    expect(responsibilityContribution).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'Owner B',
          basis: 'upstream_dependency',
          responsibility_role: 'accountable_subject',
        }),
      ]),
    )
  }, 30_000)

  it('does not reconstruct dependency accountability from a retired task field', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push(
      {
        id: 'task-legacy-preceding-owner-a',
        project_id: projectId,
        title: 'Owner A legacy prerequisite',
        status: 'in_progress',
        progress: 45,
        participant_unit_id: 'unit-owner-a',
        participant_unit_name: 'Owner A',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-18',
        actual_end_date: null,
        updated_at: '2026-04-18T08:00:00.000Z',
        version: 1,
      },
      {
        id: 'task-legacy-preceding-downstream-b',
        project_id: projectId,
        title: 'Owner B legacy downstream work',
        status: 'in_progress',
        progress: 10,
        participant_unit_id: 'unit-owner-b',
        participant_unit_name: 'Owner B',
        planned_start_date: '2026-04-12',
        planned_end_date: '2026-04-15',
        preceding_task_id: 'task-legacy-preceding-owner-a',
        actual_end_date: null,
        updated_at: '2026-04-18T08:00:00.000Z',
        version: 1,
      },
    )
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-legacy-preceding-downstream-b',
      project_id: projectId,
      task_id: 'task-legacy-preceding-downstream-b',
      progress: 10,
      snapshot_date: '2026-04-18',
      planning_source_type: 'execution',
      created_at: '2026-04-18T00:00:00.000Z',
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const downstreamRow = report.mainlines[2].rows.find((row) => row.id === 'task-legacy-preceding-downstream-b')
    const dependencyCause = ((downstreamRow?.attribution as any)?.cause_chain ?? [])
      .find((chain: Record<string, unknown>) => chain.cause_type === 'dependency_wait')
    expect(dependencyCause).toBeUndefined()
  }, 30_000)

  it('traces multi-level dependency chains to root cause and weights critical-path accountability', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push(
      {
        id: 'task-chain-root-a',
        project_id: projectId,
        title: 'Owner A root prerequisite',
        status: 'in_progress',
        progress: 40,
        participant_unit_id: 'unit-owner-a',
        participant_unit_name: 'Owner A',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-18',
        actual_end_date: null,
        updated_at: '2026-04-20T08:00:00.000Z',
        version: 1,
      },
      {
        id: 'task-chain-middle-b',
        project_id: projectId,
        title: 'Owner B transmission work',
        status: 'in_progress',
        progress: 10,
        participant_unit_id: 'unit-owner-b',
        participant_unit_name: 'Owner B',
        planned_start_date: '2026-04-06',
        planned_end_date: '2026-04-16',
        actual_end_date: null,
        updated_at: '2026-04-20T08:00:00.000Z',
        version: 1,
      },
      {
        id: 'task-chain-downstream-c',
        project_id: projectId,
        title: 'Owner C critical downstream work',
        status: 'in_progress',
        progress: 5,
        participant_unit_id: 'unit-owner-c',
        participant_unit_name: 'Owner C',
        planned_start_date: '2026-04-12',
        planned_end_date: '2026-04-15',
        actual_end_date: null,
        updated_at: '2026-04-20T08:00:00.000Z',
        is_critical: true,
        baseline_is_critical: true,
        total_float_days: 0,
        free_float_days: 0,
        version: 1,
      },
    )
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-chain-downstream-c',
      project_id: projectId,
      task_id: 'task-chain-downstream-c',
      progress: 5,
      snapshot_date: '2026-04-20',
      planning_source_type: 'execution',
      created_at: '2026-04-20T00:00:00.000Z',
    })
    state.tables.task_dependencies.push(
      {
        id: 'dep-chain-b-a',
        project_id: projectId,
        task_id: 'task-chain-middle-b',
        dependency_task_id: 'task-chain-root-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
        source_type: 'manual',
      },
      {
        id: 'dep-chain-c-b',
        project_id: projectId,
        task_id: 'task-chain-downstream-c',
        dependency_task_id: 'task-chain-middle-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
        source_type: 'manual',
      },
    )

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const downstreamRow = report.mainlines[2].rows.find((row) => row.id === 'task-chain-downstream-c')
    const dependencyCause = ((downstreamRow?.attribution as any)?.cause_chain ?? [])
      .find((chain: Record<string, unknown>) => chain.cause_type === 'dependency_wait')
    expect(dependencyCause).toMatchObject({
      affected_task_id: 'task-chain-downstream-c',
      upstream_task_id: 'task-chain-middle-b',
      direct_blocker_owner: 'Owner B',
      root_cause_task_id: 'task-chain-root-a',
      root_cause_owner: 'Owner A',
      accountable_owner: 'Owner A',
      accountable_owner_id: 'unit-owner-a',
      causal_depth: 2,
      causal_path_task_ids: ['task-chain-root-a', 'task-chain-middle-b', 'task-chain-downstream-c'],
      responsibility_basis: 'upstream_dependency',
      responsibility_role: 'primary_accountable_subject',
      critical_path_impact: expect.objectContaining({
        is_critical: true,
        total_float_days: 0,
        free_float_days: 0,
        weight: expect.any(Number),
      }),
    })

    const responsibilityContribution = report.responsibility_contribution as unknown as Array<Record<string, unknown>>
    const ownerAContribution = responsibilityContribution.find((entry) => entry.owner === 'Owner A')
    expect(ownerAContribution).toMatchObject({
      owner_id: 'unit-owner-a',
      basis: 'upstream_dependency',
      responsibility_role: 'accountable_subject',
      adjudication_role: 'primary_accountable_subject',
      task_ids: expect.arrayContaining(['task-chain-downstream-c']),
      causal_task_ids: expect.arrayContaining(['task-chain-root-a']),
      transmission_task_ids: expect.arrayContaining(['task-chain-middle-b']),
      critical_path_weight: expect.any(Number),
      priority_score: expect.any(Number),
    })
    expect(Number(ownerAContribution?.priority_score)).toBeGreaterThan(Number(ownerAContribution?.impact_days))
  }, 30_000)

  it('splits accountable-subject contribution by cause impact weight when one task has multiple causes', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push(
      {
        id: 'task-upstream-weighted-a',
        project_id: projectId,
        title: 'Owner A weighted upstream prerequisite',
        status: 'in_progress',
        progress: 40,
        participant_unit_id: 'unit-owner-a',
        participant_unit_name: 'Owner A',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-18',
        actual_end_date: null,
        updated_at: '2026-04-17T08:00:00.000Z',
        version: 1,
      },
      {
        id: 'task-weighted-downstream-b',
        project_id: projectId,
        title: 'Owner B weighted downstream work',
        status: 'in_progress',
        progress: 10,
        participant_unit_id: 'unit-owner-b',
        participant_unit_name: 'Owner B',
        planned_start_date: '2026-04-12',
        planned_end_date: '2026-04-15',
        preceding_task_id: 'task-upstream-weighted-a',
        actual_end_date: null,
        updated_at: '2026-04-18T08:00:00.000Z',
        version: 1,
      },
    )
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-weighted-downstream-b',
      project_id: projectId,
      task_id: 'task-weighted-downstream-b',
      progress: 10,
      snapshot_date: '2026-04-18',
      planning_source_type: 'execution',
      created_at: '2026-04-18T00:00:00.000Z',
    })
    state.tables.task_dependencies.push({
      id: 'dep-weighted-downstream-upstream',
      project_id: projectId,
      task_id: 'task-weighted-downstream-b',
      dependency_task_id: 'task-upstream-weighted-a',
      dependency_type: 'FS',
      lag_days: 0,
      required_for_start: true,
      status: 'active',
      source_type: 'manual',
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-weighted-downstream-b',
      project_id: projectId,
      task_id: 'task-weighted-downstream-b',
      forecast_delay_days: 6,
      remaining_duration_days: 9,
      confidence_level: 'high',
      calculation_context: {
        dependencyPropagation: {
          count: 1,
          maxWaitDays: 6,
          blockingDependencies: [
            {
              dependencyTaskId: 'task-upstream-weighted-a',
              dependencyType: 'FS',
              waitDays: 6,
              floorRemainingDays: 9,
            },
          ],
        },
      },
      generated_at: '2026-04-18T00:00:00.000Z',
      created_at: '2026-04-18T00:00:00.000Z',
      is_current: true,
    })
    state.tables.task_conditions.push({
      id: 'condition-weighted-owner-c',
      project_id: projectId,
      task_id: 'task-weighted-downstream-b',
      condition_name: 'Secondary permit approval',
      condition_type: 'external_approval',
      is_satisfied: false,
      status: 'pending',
      responsible_unit: 'Owner C',
      participant_unit_id: 'unit-owner-c',
      participant_unit_name: 'Owner C',
      responsible_person: 'Owner C PM',
      due_date: '2026-04-14',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const weightedRow = report.mainlines[2].rows.find((row) => row.id === 'task-weighted-downstream-b')
    expect((weightedRow?.attribution as any)?.cause_chain ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountable_owner: 'Owner A',
          accountable_owner_id: 'unit-owner-a',
          impact_days: 6,
        }),
        expect.objectContaining({
          accountable_owner: 'Owner C',
          accountable_owner_id: 'unit-owner-c',
          impact_days: 4,
        }),
      ]),
    )

    const responsibilityContribution = report.responsibility_contribution as unknown as Array<Record<string, unknown>>
    expect(responsibilityContribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'Owner A',
          owner_id: 'unit-owner-a',
          task_ids: expect.arrayContaining(['task-weighted-downstream-b']),
          impact_days: 6,
          weighted_count: 0.6,
        }),
        expect.objectContaining({
          owner: 'Owner C',
          owner_id: 'unit-owner-c',
          task_ids: expect.arrayContaining(['task-weighted-downstream-b']),
          impact_days: 4,
          weighted_count: 0.4,
        }),
      ]),
    )
  }, 30_000)

  it('routes blocking condition and active obstacle responsibility to accountable subjects', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push(
      {
        id: 'task-condition-blocked',
        project_id: projectId,
        title: 'Owner B waiting for permit',
        status: 'in_progress',
        progress: 15,
        participant_unit_name: 'Owner B',
        planned_start_date: '2026-04-10',
        planned_end_date: '2026-04-12',
        updated_at: '2026-04-18T08:00:00.000Z',
        version: 1,
      },
      {
        id: 'task-obstacle-blocked',
        project_id: projectId,
        title: 'Owner B blocked by site issue',
        status: 'in_progress',
        progress: 20,
        participant_unit_name: 'Owner B',
        planned_start_date: '2026-04-10',
        planned_end_date: '2026-04-12',
        updated_at: '2026-04-18T08:00:00.000Z',
        version: 1,
      },
    )
    state.tables.task_conditions.push({
      id: 'condition-owner-c',
      project_id: projectId,
      task_id: 'task-condition-blocked',
      condition_name: 'Permit approval',
      condition_type: 'external_approval',
      is_satisfied: false,
      status: 'pending',
      responsible_unit: 'Owner C',
      participant_unit_id: 'unit-owner-c',
      participant_unit_name: 'Owner C',
      responsible_person: 'Owner C PM',
      due_date: '2026-04-11',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
    })
    state.tables.task_obstacles.push({
      id: 'obstacle-owner-d',
      project_id: projectId,
      task_id: 'task-obstacle-blocked',
      description: 'Site access issue',
      obstacle_type: 'site_access',
      severity: 'high',
      status: 'active',
      responsible_unit: 'Owner D',
      participant_unit_id: 'unit-owner-d',
      participant_unit_name: 'Owner D',
      responsible_person: 'Owner D coordinator',
      estimated_resolve_date: '2026-04-20',
      created_at: '2026-04-12T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const conditionRow = report.mainlines[2].rows.find((row) => row.id === 'task-condition-blocked')
    expect((conditionRow?.attribution as any)?.cause_chain ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cause_type: 'blocking_condition',
          affected_task_id: 'task-condition-blocked',
          impacted_owner: 'Owner B',
          accountable_owner: 'Owner C',
          accountable_owner_id: 'unit-owner-c',
          responsibility_basis: 'external_wait',
          impact_days: 7,
          evidence_source: 'task_conditions.participant_unit_name',
        }),
      ]),
    )

    const obstacleRow = report.mainlines[2].rows.find((row) => row.id === 'task-obstacle-blocked')
    expect((obstacleRow?.attribution as any)?.cause_chain ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cause_type: 'active_obstacle',
          affected_task_id: 'task-obstacle-blocked',
          impacted_owner: 'Owner B',
          accountable_owner: 'Owner D',
          accountable_owner_id: 'unit-owner-d',
          responsibility_basis: 'obstacle_owner',
          impact_days: 6,
          evidence_source: 'task_obstacles.participant_unit_name',
          evidence: expect.objectContaining({
            expected_resolution_date: '2026-04-20',
          }),
        }),
      ]),
    )

    const responsibilityContribution = report.responsibility_contribution as unknown as Array<Record<string, unknown>>
    expect(responsibilityContribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'Owner C',
          owner_id: 'unit-owner-c',
          basis: 'external_wait',
          responsibility_role: 'accountable_subject',
          task_ids: expect.arrayContaining(['task-condition-blocked']),
          impact_days: 7,
        }),
        expect.objectContaining({
          owner: 'Owner D',
          owner_id: 'unit-owner-d',
          basis: 'obstacle_owner',
          responsibility_role: 'accountable_subject',
          task_ids: expect.arrayContaining(['task-obstacle-blocked']),
          impact_days: 6,
        }),
      ]),
    )
  }, 30_000)

  it('treats confidence-only duration factors as confidence evidence instead of quantified delay causes', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push({
      id: 'task-confidence-only',
      project_id: projectId,
      title: 'Owner B confidence-only sequencing signal',
      status: 'in_progress',
      progress: 5,
      participant_unit_id: 'unit-owner-b',
      participant_unit_name: 'Owner B',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-12',
      actual_end_date: '2026-04-25',
      updated_at: '2026-04-25T08:00:00.000Z',
      standard_task_metadata: { durationContributionMode: 'duration_bearing' },
      version: 1,
    })
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-confidence-only',
      project_id: projectId,
      task_id: 'task-confidence-only',
      progress: 5,
      snapshot_date: '2026-04-25',
      planning_source_type: 'execution',
      created_at: '2026-04-25T00:00:00.000Z',
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-confidence-only',
      project_id: projectId,
      task_id: 'task-confidence-only',
      forecast_delay_days: 9,
      remaining_duration_days: 11,
      confidence_level: 'medium',
      factor_summary: {
        factors: [
          {
            key: 'workflow_sequence',
            label: 'workflow sequence confidence signal',
            multiplier: 1.12,
            extraDays: 9,
            confidenceDelta: -0.2,
            actionPolicy: 'confidence_only',
            reason: 'sequence rhythm is suspicious but not quantified as delay',
          },
        ],
      },
      generated_at: '2026-04-25T00:00:00.000Z',
      created_at: '2026-04-25T00:00:00.000Z',
      is_current: true,
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const row = report.mainlines[2].rows.find((item) => item.id === 'task-confidence-only')
    const workflowReason = row?.attribution?.delay_reasons
      .find((reason) => reason.reason_type === 'workflow_sequence')
    expect(workflowReason).toMatchObject({
      impact_days: 0,
      quantification_basis: 'confidence_only',
      attribution_role: 'confidence_adjustment',
    })
    expect(report.top_deviation_causes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: '\u6d41\u6c34\u8282\u594f\u504f\u5dee' })]),
    )
    const ownerBContribution = report.responsibility_contribution?.find((entry) => entry.task_ids.includes('task-confidence-only'))
    expect(ownerBContribution).toMatchObject({
      owner: 'Owner B',
      basis: 'owner_scope',
      responsibility_role: 'execution_owner',
    })
  }, 30_000)

  it('keeps quantified delay factors when confidence-only evidence shares the same cause', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push({
      id: 'task-shared-factor-cause',
      project_id: projectId,
      title: 'Owner B mixed workflow evidence',
      status: 'in_progress',
      progress: 15,
      participant_unit_id: 'unit-owner-b',
      participant_unit_name: 'Owner B',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-12',
      updated_at: '2026-04-20T08:00:00.000Z',
      standard_task_metadata: { durationContributionMode: 'duration_bearing' },
      version: 1,
    })
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-shared-factor-cause',
      project_id: projectId,
      task_id: 'task-shared-factor-cause',
      progress: 15,
      snapshot_date: '2026-04-20',
      planning_source_type: 'execution',
      created_at: '2026-04-20T00:00:00.000Z',
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-shared-factor-cause',
      project_id: projectId,
      task_id: 'task-shared-factor-cause',
      forecast_delay_days: 8,
      remaining_duration_days: 12,
      confidence_level: 'medium',
      factor_summary: {
        factors: [
          {
            key: 'workflow_sequence',
            label: 'workflow confidence evidence',
            multiplier: 1.4,
            extraDays: 12,
            confidenceDelta: -0.25,
            actionPolicy: 'confidence_only',
            reason: 'workflow rhythm confidence adjustment',
          },
          {
            key: 'workflow_sequence',
            label: 'workflow quantified delay',
            multiplier: 1.05,
            extraDays: 3,
            confidenceDelta: -0.05,
            actionPolicy: 'candidate_only',
            reason: 'workflow rhythm quantified delay',
          },
        ],
      },
      generated_at: '2026-04-20T00:00:00.000Z',
      created_at: '2026-04-20T00:00:00.000Z',
      is_current: true,
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const row = report.mainlines[2].rows.find((item) => item.id === 'task-shared-factor-cause')
    const workflowReason = row?.attribution?.delay_reasons
      .find((reason) => reason.reason_type === 'workflow_sequence')
    expect(workflowReason).toMatchObject({
      impact_days: 3,
      quantification_basis: 'factor_extra_days',
      attribution_role: 'quantified_delay_signal',
      evidence: expect.objectContaining({
        raw_extra_days: 3,
        action_policy: 'candidate_only',
      }),
    })
  }, 30_000)

  it('uses forecast uncertainty only for confidence and review evidence, not as a standalone responsibility cause', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push({
      id: 'task-uncertain-factor',
      project_id: projectId,
      title: 'Owner B uncertain capacity signal',
      status: 'in_progress',
      progress: 10,
      participant_unit_id: 'unit-owner-b',
      participant_unit_name: 'Owner B',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-12',
      updated_at: '2026-04-20T08:00:00.000Z',
      standard_task_metadata: { durationContributionMode: 'duration_bearing' },
      version: 1,
    })
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-uncertain-factor',
      project_id: projectId,
      task_id: 'task-uncertain-factor',
      progress: 10,
      snapshot_date: '2026-04-20',
      planning_source_type: 'execution',
      created_at: '2026-04-20T00:00:00.000Z',
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-uncertain-factor',
      project_id: projectId,
      task_id: 'task-uncertain-factor',
      forecast_delay_days: 6,
      remaining_duration_days: 10,
      confidence_level: 'high',
      confidence_score: 35,
      delay_risk_index: 0.82,
      factor_summary: {
        factors: [
          {
            key: 'resource_conflict',
            label: 'resource conflict',
            multiplier: 1.15,
            extraDays: 3,
            confidenceDelta: -0.22,
            actionPolicy: 'candidate_only',
            reason: 'capacity signal is weak and needs review',
          },
        ],
      },
      metadata: {
        probabilityDuration: {
          p50: 10,
          p80: 16,
        },
      },
      calculation_context: {
        delay_uncertainty_index: 0.7,
      },
      generated_at: '2026-04-20T00:00:00.000Z',
      created_at: '2026-04-20T00:00:00.000Z',
      is_current: true,
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const row = report.mainlines[2].rows.find((item) => item.id === 'task-uncertain-factor')
    const capacityReason = row?.attribution?.delay_reasons
      .find((reason) => reason.reason_type === 'site_capacity_pressure') as any
    expect(capacityReason).toMatchObject({
      confidence: 'low',
      review_status: 'needs_review',
      evidence: expect.objectContaining({
        confidence_score: 35,
        delay_risk_index: 0.82,
        delay_uncertainty_index: 0.7,
        probability_duration: expect.objectContaining({ p50: 10, p80: 16 }),
      }),
    })
    expect((row?.attribution as any)?.cause_chain ?? []).toEqual([])
    const contribution = report.responsibility_contribution?.find((entry) => entry.task_ids.includes('task-uncertain-factor'))
    expect(contribution).toMatchObject({
      owner: 'Owner B',
      responsibility_role: 'execution_owner',
    })
  }, 30_000)

  it('attaches external readiness forecast evidence only to existing factual blockers before accountability', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push(
      {
        id: 'task-readiness-fact',
        project_id: projectId,
        title: 'Owner B waiting for readiness fact',
        status: 'in_progress',
        progress: 12,
        participant_unit_id: 'unit-owner-b',
        participant_unit_name: 'Owner B',
        planned_start_date: '2026-04-10',
        planned_end_date: '2026-04-12',
        updated_at: '2026-04-18T08:00:00.000Z',
        standard_task_metadata: { durationContributionMode: 'external_wait' },
        version: 1,
      },
      {
        id: 'task-readiness-forecast-only',
        project_id: projectId,
        title: 'Owner B forecast-only readiness label',
        status: 'in_progress',
        progress: 12,
        participant_unit_id: 'unit-owner-b',
        participant_unit_name: 'Owner B',
        planned_start_date: '2026-04-10',
        planned_end_date: '2026-04-12',
        updated_at: '2026-04-18T08:00:00.000Z',
        standard_task_metadata: { durationContributionMode: 'external_wait' },
        version: 1,
      },
    )
    state.tables.task_progress_snapshots.push(
      {
        id: 'snapshot-readiness-fact',
        project_id: projectId,
        task_id: 'task-readiness-fact',
        progress: 12,
        snapshot_date: '2026-04-18',
        planning_source_type: 'execution',
        created_at: '2026-04-18T00:00:00.000Z',
      },
      {
        id: 'snapshot-readiness-forecast-only',
        project_id: projectId,
        task_id: 'task-readiness-forecast-only',
        progress: 12,
        snapshot_date: '2026-04-18',
        planning_source_type: 'execution',
        created_at: '2026-04-18T00:00:00.000Z',
      },
    )
    state.tables.task_conditions.push({
      id: 'condition-readiness-owner-c',
      project_id: projectId,
      task_id: 'task-readiness-fact',
      condition_name: 'Design approval package',
      condition_type: 'external_approval',
      is_satisfied: false,
      status: 'pending',
      responsible_unit: 'Owner C',
      participant_unit_id: 'unit-owner-c',
      participant_unit_name: 'Owner C',
      due_date: '2026-04-13',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
    })
    for (const taskId of ['task-readiness-fact', 'task-readiness-forecast-only']) {
      state.tables.task_duration_forecasts.push({
        id: `forecast-${taskId}`,
        project_id: projectId,
        task_id: taskId,
        forecast_delay_days: 5,
        remaining_duration_days: 8,
        confidence_level: 'medium',
        factor_summary: {
          factors: [
            {
              key: 'external_readiness',
              label: 'external readiness',
              multiplier: 1.1,
              extraDays: 5,
              confidenceDelta: -0.08,
              actionPolicy: 'candidate_only',
              reason: 'external readiness evidence should not assign owner without facts',
            },
          ],
        },
        calculation_context: {
          remaining_duration_forecast: {
            externalReadiness: {
              missingDesignApproval: 1,
              materialArrivalPending: 0,
            },
            externalReadinessImpactDays: 5,
            impactModeBreakdown: {
              externalReadiness: 5,
            },
          },
        },
        generated_at: '2026-04-18T00:00:00.000Z',
        created_at: '2026-04-18T00:00:00.000Z',
        is_current: true,
      })
    }

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const factRow = report.mainlines[2].rows.find((item) => item.id === 'task-readiness-fact')
    const conditionCause = ((factRow?.attribution as any)?.cause_chain ?? [])
      .find((chain: Record<string, unknown>) => chain.cause_type === 'blocking_condition')
    expect(conditionCause).toMatchObject({
      accountable_owner: 'Owner C',
      evidence_source: expect.stringContaining('task_conditions.participant_unit_name'),
      evidence: expect.objectContaining({
        forecast_external_readiness_impact_days: 5,
        forecast_external_readiness: expect.objectContaining({
          missingDesignApproval: 1,
        }),
      }),
    })

    const forecastOnlyRow = report.mainlines[2].rows.find((item) => item.id === 'task-readiness-forecast-only')
    const forecastOnlyReason = forecastOnlyRow?.attribution?.delay_reasons
      .find((reason) => reason.reason_type === 'external_readiness')
    expect(forecastOnlyReason).toMatchObject({
      impact_days: 0,
      quantification_basis: 'forecast_only_external_readiness',
      attribution_role: 'evidence_candidate',
      review_status: 'needs_fact_anchor',
    })
    expect((forecastOnlyRow?.attribution as any)?.cause_chain ?? []).toEqual([])
    expect(report.responsibility_contribution).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'Owner C',
          task_ids: expect.arrayContaining(['task-readiness-forecast-only']),
          responsibility_role: 'accountable_subject',
        }),
      ]),
    )
    const forecastOnlyContribution = report.responsibility_contribution
      ?.find((entry) => entry.task_ids.includes('task-readiness-forecast-only'))
    expect(forecastOnlyContribution).toMatchObject({
      owner: 'Owner B',
      basis: 'owner_scope',
      responsibility_role: 'execution_owner',
    })
  }, 30_000)

  it('downweights unstarted overdue evidence with unknown blockers instead of assigning a responsible subject', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push({
      id: 'task-unstarted-unknown',
      project_id: projectId,
      title: 'Owner B not started but blocker unknown',
      status: 'not_started',
      progress: 0,
      participant_unit_id: 'unit-owner-b',
      participant_unit_name: 'Owner B',
      planned_start_date: '2026-04-05',
      planned_end_date: '2026-04-12',
      updated_at: '2026-04-20T08:00:00.000Z',
      standard_task_metadata: { durationContributionMode: 'duration_bearing' },
      version: 1,
    })
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-unstarted-unknown',
      project_id: projectId,
      task_id: 'task-unstarted-unknown',
      progress: 0,
      snapshot_date: '2026-04-20',
      planning_source_type: 'execution',
      created_at: '2026-04-20T00:00:00.000Z',
    })
    state.tables.task_duration_forecasts.push({
      id: 'forecast-unstarted-unknown',
      project_id: projectId,
      task_id: 'task-unstarted-unknown',
      forecast_delay_days: 8,
      remaining_duration_days: 12,
      confidence_level: 'medium',
      calculation_context: {
        remaining_duration_forecast: {
          unstartedOverdueRule: {
            earliestStartDate: '2026-04-06',
            missedWindowWorkdays: 6,
            plannedStartOverdueWorkdays: 10,
            plannedEndOverdueWorkdays: 8,
            unknownBlockerCount: 2,
            riskComponents: {
              unknownPrerequisite: 1,
            },
          },
        },
      },
      generated_at: '2026-04-20T00:00:00.000Z',
      created_at: '2026-04-20T00:00:00.000Z',
      is_current: true,
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const row = report.mainlines[2].rows.find((item) => item.id === 'task-unstarted-unknown')
    const unstartedReason = row?.attribution?.delay_reasons
      .find((reason) => reason.reason_type === 'unstarted_overdue_window') as any
    expect(unstartedReason).toMatchObject({
      confidence: 'low',
      impact_days: 0,
      responsibility_basis: 'data_quality',
      quantification_basis: 'unknown_blocker_downweight',
      attribution_role: 'evidence_completion_prompt',
      review_status: 'needs_evidence',
      evidence: expect.objectContaining({
        unknown_blocker_count: 3,
        missed_window_workdays: 6,
      }),
    })
    expect((row?.attribution as any)?.cause_chain ?? []).toEqual([])
    const contribution = report.responsibility_contribution?.find((entry) => entry.task_ids.includes('task-unstarted-unknown'))
    expect(contribution).toMatchObject({
      owner: 'Owner B',
      basis: 'owner_scope',
      responsibility_role: 'execution_owner',
    })
  }, 30_000)

  it('computes deviation days from shared signed date-only deltas', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()
    const baselineItem = state.tables.task_baseline_items.find((row) => row.id === 'baseline-item-1')
    const task = state.tables.tasks.find((row) => row.id === 'task-1')

    Object.assign(baselineItem ?? {}, {
      planned_end_date: '2026-04-10T23:30:00+08:00',
    })
    Object.assign(task ?? {}, {
      status: 'completed',
      progress: 100,
      actual_end_date: '2026-04-12T00:30:00+08:00',
      updated_at: '2026-04-12T08:00:00.000Z',
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const baselineRow = report.mainlines[0].rows.find((row) => row.id === 'baseline-item-1')
    expect(baselineRow?.deviation_days).toBe(2)
  })

  it('keeps execution live planned progress separate from committed baseline and monthly targets', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()
    const task = state.tables.tasks.find((row) => row.id === 'task-1')
    const baselineItem = state.tables.task_baseline_items.find((row) => row.id === 'baseline-item-1')
    const monthlyItem = state.tables.monthly_plan_items.find((row) => row.id === 'monthly-item-1')
    Object.assign(task ?? {}, {
      planned_start_date: '2099-01-01',
      planned_end_date: '2099-01-10',
      progress: 40,
    })
    Object.assign(baselineItem ?? {}, { target_progress: 80 })
    Object.assign(monthlyItem ?? {}, { target_progress: 65 })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const baselineRow = report.mainlines[0].rows.find((row) => row.id === 'baseline-item-1')
    const monthlyRow = report.mainlines[1].rows.find((row) => row.id === 'monthly-item-1')
    const executionRow = report.mainlines[2].rows.find((row) => row.id === 'task-1')

    expect(baselineRow).toMatchObject({
      planned_progress: 80,
      actual_progress: 40,
      deviation_rate: -40,
    })
    expect(monthlyRow).toMatchObject({
      planned_progress: 65,
      actual_progress: 40,
      deviation_rate: -25,
    })
    expect(executionRow).toMatchObject({
      planned_progress: 0,
      actual_progress: 40,
      deviation_rate: 40,
    })
  })

  it('keeps execution rows anchored to task planned end date when snapshot date differs', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const executionRow = report.mainlines[2].rows.find((row) => row.id === 'task-1')

      expect(executionRow).toMatchObject({
        planned_date: '2026-04-10',
        actual_date: null,
        deviation_days: 0,
        status: 'on_track',
      })
  }, 30_000)

  it('does not treat snapshot, planned end, or updated_at as baseline/monthly actual dates', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push({
      id: 'task-plan-date-only',
      project_id: projectId,
      title: 'plan date only task',
      status: 'in_progress',
      progress: 35,
      planned_end_date: '2026-04-09',
      end_date: '2026-04-21',
      actual_end_date: null,
      updated_at: '2026-04-22T08:00:00.000Z',
      baseline_item_id: 'baseline-plan-date-only',
      monthly_plan_item_id: 'monthly-plan-date-only',
      version: 1,
    })
    state.tables.task_baseline_items.push({
      id: 'baseline-plan-date-only',
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      title: 'plan date only task',
      target_progress: 70,
      planned_end_date: '2026-04-09',
      source_task_id: 'task-plan-date-only',
      sort_order: 99,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.tables.monthly_plan_items.push({
      id: 'monthly-plan-date-only',
      project_id: projectId,
      monthly_plan_version_id: monthlyPlanVersionId,
      baseline_item_id: 'baseline-plan-date-only',
      source_task_id: 'task-plan-date-only',
      title: 'plan date only task',
      target_progress: 65,
      current_progress: 35,
      planned_end_date: '2026-04-09',
      commitment_status: 'planned',
      sort_order: 99,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.tables.task_progress_snapshots.push({
      id: 'snapshot-plan-date-only',
      project_id: projectId,
      task_id: 'task-plan-date-only',
      progress: 35,
      snapshot_date: '2026-04-20',
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      planning_source_type: 'execution',
      created_at: '2026-04-20T00:00:00.000Z',
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const baselineRow = report.mainlines[0].rows.find((row) => row.id === 'baseline-plan-date-only')
    const monthlyRow = report.mainlines[1].rows.find((row) => row.id === 'monthly-plan-date-only')

    expect(baselineRow).toMatchObject({
      actual_date: null,
      deviation_days: 0,
      status: 'delayed',
      reason: 'actual progress below planned target',
    })
    expect(monthlyRow).toMatchObject({
      actual_date: null,
      deviation_days: 0,
      status: 'delayed',
      reason: 'actual progress below planned target',
    })
  }, 30_000)

  it('does not treat updated_at as execution actual or turn early completion into delay impact', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()

    state.tables.tasks.push(
      {
        id: 'task-updated-only',
        project_id: projectId,
        title: 'updated only execution row',
        status: 'in_progress',
        progress: 10,
        planned_end_date: '2026-04-10',
        actual_end_date: null,
        updated_at: '2026-04-20T08:00:00.000Z',
        version: 1,
      },
      {
        id: 'task-early-with-manual-reason',
        project_id: projectId,
        title: 'early completion with manual reason',
        status: 'completed',
        progress: 10,
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-20',
        actual_end_date: '2026-04-18',
        updated_at: '2026-04-18T08:00:00.000Z',
        delay_reason: 'manual note should not become delay impact',
        participant_unit_name: 'Early Owner',
        version: 1,
      },
    )

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
    })

    const executionRows = report.mainlines[2].rows
    const updatedOnlyRow = executionRows.find((row) => row.id === 'task-updated-only')
    expect(updatedOnlyRow).toMatchObject({
      planned_date: '2026-04-10',
      actual_date: null,
      deviation_days: 0,
    })

    const earlyRow = executionRows.find((row) => row.id === 'task-early-with-manual-reason')
    expect(earlyRow).toMatchObject({
      actual_date: '2026-04-18',
      deviation_days: -2,
      status: 'delayed',
    })

    const earlyContribution = report.responsibility_contribution?.find((entry) => entry.task_ids.includes('task-early-with-manual-reason'))
    expect(earlyContribution).toMatchObject({
      owner: 'Early Owner',
      impact_days: 0,
      priority_score: 1,
    })
  })

  it('adds project schedule state as business deviation explanation without rewriting rows', async () => {
    const { projectId, baselineVersionId, monthlyPlanVersionId } = seedAnalysisFixtures()
    state.tables.project_schedule_states.push({
      project_id: projectId,
      scope_type: 'building',
      scope_id: 'building-1',
      state: 'accelerating',
      confidence_score: 0.86,
      window_end_date: '2026-04-20',
    })

    const report = await getProgressDeviationAnalysis({
      project_id: projectId,
      baseline_version_id: baselineVersionId,
      monthly_plan_version_id: monthlyPlanVersionId,
      lock: false,
      actorUserId: 'analyst-1',
    })

    expect(report.top_deviation_causes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: '主动赶工或局部赶工正在抵消偏差',
          count: 9,
          percentage: 86,
        }),
      ])
    )
    expect(report.mainlines.map((line) => line.rows.length)).toEqual([2, 2, 7])
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
        title: '合并A',
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
