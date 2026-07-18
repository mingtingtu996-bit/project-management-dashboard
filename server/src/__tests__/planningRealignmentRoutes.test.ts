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
  | 'duration_experience_samples'

type Row = Record<string, any>

const CANDIDATE_DEFAULT_MASTER_PLAN_REVIEW_BLOCKERS = [
  'PROJECT_MANAGER_REVIEW_REQUIRED',
  'DURATION_EVIDENCE_NOT_RUNTIME_CALIBRATED',
  'PRODUCTION_DEPENDENCY_WRITER_NOT_APPLIED',
  'RUNTIME_PUBLICATION_EVIDENCE_MISSING',
  'POST_PUBLISH_SMOKE_ROLLBACK_EVIDENCE_MISSING',
]

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
    duration_experience_samples: [],
  }

  function clone<T>(value: T): T {
    if (value instanceof Date) {
      return new Date(value.getTime()) as T
    }
    if (Array.isArray(value)) {
      return value.map((item) => clone(item)) as T
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Row).map(([key, entry]) => [key, clone(entry)]),
      ) as T
    }
    return value
  }

  function matchesFilters(row: Row, filters: Array<{ type: 'eq' | 'in'; column: string; value: unknown }>) {
    return filters.every((filter) => {
      if (filter.type === 'eq') {
        return row[filter.column] === filter.value
      }
      return Array.isArray(filter.value) && filter.value.includes(row[filter.column])
    })
  }

  let transactionSnapshot: Record<TableName, Row[]> | null = null
  const clientQuery = vi.fn(async (
    queryInput: string | { text: string; values?: unknown[] },
    inputValues: unknown[] = [],
  ) => {
    const sql = typeof queryInput === 'string' ? queryInput : queryInput.text
    const values = typeof queryInput === 'string' ? inputValues : queryInput.values ?? inputValues
    const normalizedSql = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    if (normalizedSql === 'begin') {
      transactionSnapshot = Object.fromEntries(
        Object.entries(tables).map(([table, rows]) => [table, clone(rows)]),
      ) as Record<TableName, Row[]>
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
    if (normalizedSql.startsWith('select company_id from public.projects')) {
      return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
    }
    if (
      normalizedSql.startsWith('select * from public.task_baselines')
      && normalizedSql.includes('where id = $1')
      && normalizedSql.includes('project_id = $2')
      && normalizedSql.endsWith('for update')
    ) {
      const [id, projectId] = values
      const baseline = tables.task_baselines.find((row) => row.id === id && row.project_id === projectId)
      return { rows: baseline ? [clone(baseline)] : [], rowCount: baseline ? 1 : 0 }
    }
    if (normalizedSql.startsWith('select coalesce(max(version), 0)::int as latest_version')) {
      const [projectId, ignoredId, statuses] = values as [string, string, string[]]
      const latestVersion = tables.task_baselines
        .filter((row) => row.project_id === projectId && row.id !== ignoredId && statuses.includes(row.status))
        .reduce((max, row) => Math.max(max, Number(row.version ?? 0)), 0)
      return { rows: [{ latest_version: latestVersion }], rowCount: 1 }
    }
    if (
      normalizedSql.startsWith('select * from public.task_baselines')
      && normalizedSql.includes('id <> $2')
      && normalizedSql.includes('status = any($3::text[])')
    ) {
      const [projectId, keepId, statuses] = values as [string, string, string[]]
      const rows = tables.task_baselines.filter(
        (row) => row.project_id === projectId && row.id !== keepId && statuses.includes(row.status),
      )
      return { rows: rows.map((row) => clone(row)), rowCount: rows.length }
    }
    if (
      normalizedSql.startsWith('update public.task_baselines')
      && normalizedSql.includes('set version = $3')
    ) {
      const [id, projectId, version, status, confirmedAt, confirmedBy, governanceMetadata, oldStatus, oldVersion] = values
      const baseline = tables.task_baselines.find(
        (row) => row.id === id
          && row.project_id === projectId
          && row.status === oldStatus
          && (row.version ?? null) === (oldVersion ?? null),
      )
      if (!baseline) return { rows: [], rowCount: 0 }
      Object.assign(baseline, {
        version,
        status,
        confirmed_at: confirmedAt,
        confirmed_by: confirmedBy,
        governance_metadata: JSON.parse(String(governanceMetadata)),
        updated_at: confirmedAt,
      })
      return { rows: [clone(baseline)], rowCount: 1 }
    }
    if (
      normalizedSql.startsWith('update public.task_baselines')
      && normalizedSql.includes("set status = 'archived'")
    ) {
      const [projectId, keepId, updatedAt, statuses] = values as [string, string, string, string[]]
      const archived = tables.task_baselines.filter(
        (row) => row.project_id === projectId && row.id !== keepId && statuses.includes(row.status),
      )
      for (const baseline of archived) {
        Object.assign(baseline, { status: 'archived', updated_at: updatedAt })
      }
      return { rows: archived.map((row) => clone(row)), rowCount: archived.length }
    }
    if (normalizedSql.startsWith('update public.task_baselines')) {
      const [id, projectId, title, description, effectiveFrom, effectiveTo, updatedAt] = values
      const baseline = tables.task_baselines.find((row) => row.id === id && row.project_id === projectId)
      if (!baseline) return { rows: [], rowCount: 0 }
      Object.assign(baseline, {
        title,
        description,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        updated_at: updatedAt,
      })
      return { rows: [clone(baseline)], rowCount: 1 }
    }
    if (normalizedSql.startsWith('delete from public.task_baseline_items')) {
      const [baselineId, projectId] = values
      const retained = tables.task_baseline_items.filter(
        (row) => row.baseline_version_id !== baselineId || row.project_id !== projectId,
      )
      const deletedCount = tables.task_baseline_items.length - retained.length
      tables.task_baseline_items.splice(0, tables.task_baseline_items.length, ...retained)
      return { rows: [], rowCount: deletedCount }
    }

    return { rows: [], rowCount: 0 }
  })
  const clientRelease = vi.fn()

  class QueryBuilder {
    private table: TableName
    private filters: Array<{ type: 'eq' | 'in'; column: string; value: unknown }> = []
    private mode: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select'
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

    delete() {
      this.mode = 'delete'
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

      if (this.mode === 'delete') {
        const deleted = rows.filter((row) => matchesFilters(row, this.filters))
        const remaining = rows.filter((row) => !matchesFilters(row, this.filters))
        rows.splice(0, rows.length, ...remaining)
        return {
          data: deleted.map((row) => clone(row)),
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
    getClient: vi.fn(async () => ({
      query: clientQuery,
      release: clientRelease,
    })),
    clientQuery,
    clientRelease,
    insertRowsReturning: vi.fn(async (_client: unknown, tableName: string, rows: object[]) => {
      const inserted = rows.map((row) => clone(row as Row))
      tables[tableName as TableName].push(...inserted)
      return inserted
    }),
    recordMonthlySnapshotLineage: vi.fn(async () => ({ batchId: 'lineage-batch-1', linkCount: 1 })),
    recordBaselineSnapshotLineage: vi.fn(async () => ({ batchId: 'baseline-lineage-batch-1', linkCount: 1 })),
    supabase: {
      from: vi.fn((table: string) => new QueryBuilder(table)),
    },
    writeLog: vi.fn(),
    recordBaselinePublicationStructuredCause: vi.fn(async () => ({
      changeLogId: 'change-log-baseline-1',
      attribution: { id: 'cause-baseline-1', status: 'confirmed' },
    })),
    startProjectReorderSession: vi.fn(async ({ projectId, reorderMode, note }: any) => ({
      id: 'manual-reorder-1',
      project_id: projectId,
      category: 'reorder',
      kind: 'manual_reorder_session',
      status: 'active',
      severity: 'info',
      title: '主动重排进行',
      detail: '已启动主动重排',
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
      title: '主动重排已结',
      detail: '已完成主动重排',
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

const wbsGenerationMocks = vi.hoisted(() => ({
  generateWbsTemplateRows: vi.fn(),
}))

const wbsTemplateCandidateEventMocks = vi.hoisted(() => ({
  recordWbsTemplateCandidateEvent: vi.fn(async () => undefined),
}))

const scopeValidationMocks = vi.hoisted(() => ({
  validateScopeObjectTypes: vi.fn(async () => null),
  validateTaskScopeConsistency: vi.fn(async () => null),
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

vi.mock('../database.js', () => ({
  getClient: state.getClient,
}))

vi.mock('../services/transactionInsertService.js', () => ({
  insertRowReturning: vi.fn(async (client: unknown, tableName: string, row: object) => {
    const rows = await state.insertRowsReturning(client, tableName, [row])
    return rows[0]
  }),
  insertRowsReturning: state.insertRowsReturning,
}))

vi.mock('../services/planningSnapshotService.js', () => ({
  attachTaskFactSnapshots: vi.fn(async (_projectId: string, items: any[]) => items.map((item) => ({
    ...item,
    task_fact_snapshot: item.task_fact_snapshot ?? {},
    snapshot_source: item.snapshot_source ?? 'current_execution_fact',
  }))),
  inheritSnapshotFieldsFromBaselineItem: vi.fn((item: any) => ({
    scope_snapshot: item.scope_snapshot ?? {},
    wbs_snapshot: item.wbs_snapshot ?? {},
    task_code_snapshot: item.task_code_snapshot ?? null,
    status_snapshot: item.status_snapshot ?? {},
    snapshot_source: item.snapshot_source ?? 'baseline_commitment_snapshot',
  })),
  inheritSnapshotFieldsFromMonthlyPlanItem: vi.fn((item: any) => ({
    scope_snapshot: item.scope_snapshot ?? {},
    wbs_snapshot: item.wbs_snapshot ?? {},
    task_code_snapshot: item.task_code_snapshot ?? null,
    status_snapshot: item.status_snapshot ?? {},
    snapshot_source: item.snapshot_source ?? 'monthly_commitment_snapshot',
  })),
  recordMonthlySnapshotLineage: state.recordMonthlySnapshotLineage,
  recordBaselineSnapshotLineage: state.recordBaselineSnapshotLineage,
}))

vi.mock('../services/dataLineageService.js', () => ({
  createLineageBatch: vi.fn(async (_projectId: string, _batchType: string, links: any[]) => ({
    batchId: 'lineage-batch-1',
    linkCount: links.length,
  })),
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: state.writeLog,
}))

vi.mock('../services/structuredCauseAttributionService.js', () => ({
  STRUCTURED_CAUSE_TAXONOMY: [
    { code: 'design_change' },
    { code: 'workflow_sequence' },
    { code: 'other' },
  ],
  recordBaselinePublicationStructuredCause: state.recordBaselinePublicationStructuredCause,
}))

vi.mock('../services/planningRevisionPoolService.js', () => ({
  evaluateBaselineConfirmationGate: vi.fn(() => ({
    isReady: true,
    blockers: [],
  })),
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
  },
}))

vi.mock('../services/planningGovernanceService.js', () => ({
  planningGovernanceService: {
    scanProjectGovernance: vi.fn(),
    startProjectReorderSession: state.startProjectReorderSession,
    finishProjectReorderSession: state.finishProjectReorderSession,
  },
}))

vi.mock('../services/planningIntegrityService.js', () => ({
  PlanningIntegrityService: class {
    async scanProjectIntegrity(projectId: string) {
      return {
        project_id: projectId,
        data_integrity: {
          total_tasks: 0,
          missing_participant_unit_count: 0,
          missing_scope_dimension_count: 0,
          missing_progress_snapshot_count: 0,
        },
        mapping_integrity: {
          baseline_pending_count: 0,
          baseline_merged_count: 0,
          monthly_carryover_count: 0,
        },
        milestone_integrity: {
          items: [],
        },
        system_consistency: {
          inconsistent_milestones: 0,
          stale_snapshot_count: 0,
        },
        passive_reorder: {
          active: false,
        },
      }
    }
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
  hasMonthlyPlanVersion: baselineGovernanceMocks.hasMonthlyPlanVersion,
  annotateBaselineCriticalItems: baselineGovernanceMocks.annotateBaselineCriticalItems,
  syncBaselineCriticalFlagsToTasks: baselineGovernanceMocks.syncBaselineCriticalFlagsToTasks,
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  getCriticalPathTaskIds: vi.fn(async () => new Set<string>()),
}))

vi.mock('../services/monthlyPlanGenerationService.js', () => ({
  resolveMonthlyPlanGenerationSourceV1474: baselineGovernanceMocks.resolveMonthlyPlanGenerationSource,
}))

vi.mock('../services/wbsTemplateGenerationService.js', async () => {
  const actual = await vi.importActual<typeof import('../services/wbsTemplateGenerationService.js')>('../services/wbsTemplateGenerationService.js')
  return {
    ...actual,
    generateWbsTemplateRows: wbsGenerationMocks.generateWbsTemplateRows,
  }
})

vi.mock('../services/wbsTemplateCandidateEventService.js', () => ({
  buildSpecialWorkDurationCandidateNodes: vi.fn(() => []),
  recordWbsTemplateCandidateEvent: wbsTemplateCandidateEventMocks.recordWbsTemplateCandidateEvent,
}))

vi.mock('../services/engineeringObjectService.js', () => ({
  validateScopeObjectTypes: scopeValidationMocks.validateScopeObjectTypes,
  validateTaskScopeConsistency: scopeValidationMocks.validateTaskScopeConsistency,
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
    wbsGenerationMocks.generateWbsTemplateRows.mockResolvedValue({
      generationBatchId: 'batch-1',
      templateId: 'china-gb55032-2022',
      generationDepth: 'item_work',
      scopeCombos: [],
      rows: [],
    })
    scopeValidationMocks.validateScopeObjectTypes.mockResolvedValue(null)
    scopeValidationMocks.validateTaskScopeConsistency.mockResolvedValue(null)
    state.recordBaselinePublicationStructuredCause.mockResolvedValue({
      changeLogId: 'change-log-baseline-1',
      attribution: { id: 'cause-baseline-1', status: 'confirmed' },
    })
  })

  it('rejects baseline publication when the controlled cause and original wording are missing', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-cause-required',
      project_id: 'project-1',
      version: null,
      status: 'draft',
      title: '待发布项目基线',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push({
      id: 'baseline-cause-required-item',
      project_id: 'project-1',
      baseline_version_id: 'baseline-cause-required',
      title: '主体结构施工',
      planned_start_date: '2026-08-01',
      planned_end_date: '2026-08-31',
      sort_order: 1,
      mapping_status: 'mapped',
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/baseline-cause-required/publish')
      .send({ version: null })

    expect(response.status, JSON.stringify(response.body)).toBe(400)
    expect(response.body.error?.code).toBe('BASELINE_CHANGE_CAUSE_REQUIRED')
    expect(state.tables.task_baselines[0]?.status).toBe('draft')
    expect(state.recordBaselinePublicationStructuredCause).not.toHaveBeenCalled()
  })

  it('rejects an unknown baseline publication cause without entering the write transaction', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-cause-invalid',
      project_id: 'project-1',
      version: null,
      status: 'draft',
      title: '待发布项目基线',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/baseline-cause-invalid/publish')
      .send({
        version: null,
        cause_code: 'free_text_only',
        change_reason: '任意自由文本分类不得直接进入聚合。',
      })

    expect(response.status, JSON.stringify(response.body)).toBe(400)
    expect(response.body.error?.code).toBe('BASELINE_CHANGE_CAUSE_INVALID')
    expect(state.tables.task_baselines[0]?.status).toBe('draft')
    expect(state.clientQuery).not.toHaveBeenCalledWith('BEGIN')
    expect(state.recordBaselinePublicationStructuredCause).not.toHaveBeenCalled()
  })

  it('rolls back baseline publication when the transactional structured cause write fails', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-cause-rollback',
      project_id: 'project-1',
      version: null,
      status: 'draft',
      title: '待发布项目基线',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push({
      id: 'baseline-cause-rollback-item',
      project_id: 'project-1',
      baseline_version_id: 'baseline-cause-rollback',
      title: '主体结构施工',
      planned_start_date: '2026-08-01',
      planned_end_date: '2026-08-31',
      sort_order: 1,
      mapping_status: 'mapped',
    })
    state.recordBaselinePublicationStructuredCause.mockRejectedValueOnce(new Error('structured cause write failed'))

    const response = await supertest(buildApp())
      .post('/api/task-baselines/baseline-cause-rollback/publish')
      .send({
        version: null,
        cause_code: 'design_change',
        change_reason: '设计变更确认后调整节点工期。',
      })

    expect(response.status).toBe(500)
    expect(state.tables.task_baselines[0]).toEqual(expect.objectContaining({
      status: 'draft',
      version: null,
    }))
    expect(state.clientQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(state.clientQuery).not.toHaveBeenCalledWith('COMMIT')
  })

  it('returns row-level baseline diffs for the current-version drawer', async () => {
    state.tables.task_baselines.push(
      {
        id: 'baseline-current',
        project_id: 'project-1',
        version: 6,
        status: 'confirmed',
        title: '项目基线 v6',
        confirmed_at: '2026-05-01T00:00:00.000Z',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'baseline-draft',
        project_id: 'project-1',
        version: null,
        status: 'draft',
        title: '项目基线草',
        source_version_id: 'baseline-current',
        created_at: '2026-05-08T00:00:00.000Z',
        updated_at: '2026-05-08T00:00:00.000Z',
      },
    )
    state.tables.task_baseline_items.push(
      {
        id: 'current-root',
        project_id: 'project-1',
        baseline_version_id: 'baseline-current',
        title: '主体工程',
        sort_order: 0,
        mapping_status: 'mapped',
      },
      {
        id: 'current-task-1',
        project_id: 'project-1',
        baseline_version_id: 'baseline-current',
        parent_item_id: 'current-root',
        source_task_id: 'task-1',
        title: '一层主体结构施',
        planned_start_date: '2026-04-20',
        planned_end_date: '2026-07-04',
        sort_order: 1,
        mapping_status: 'mapped',
      },
      {
        id: 'current-removed',
        project_id: 'project-1',
        baseline_version_id: 'baseline-current',
        parent_item_id: 'current-root',
        source_task_id: 'task-removed',
        title: '临时支护拆除',
        planned_start_date: '2026-07-05',
        planned_end_date: '2026-07-08',
        sort_order: 2,
        mapping_status: 'mapped',
      },
      {
        id: 'draft-root',
        project_id: 'project-1',
        baseline_version_id: 'baseline-draft',
        title: '主体工程',
        sort_order: 0,
        mapping_status: 'mapped',
      },
      {
        id: 'draft-task-1',
        project_id: 'project-1',
        baseline_version_id: 'baseline-draft',
        parent_item_id: 'draft-root',
        source_task_id: 'task-1',
        title: '一层主体结构施',
        planned_start_date: '2026-04-20',
        planned_end_date: '2026-07-18',
        sort_order: 1,
        mapping_status: 'mapped',
      },
      {
        id: 'draft-new',
        project_id: 'project-1',
        baseline_version_id: 'baseline-draft',
        parent_item_id: 'draft-root',
        source_task_id: 'task-new',
        title: '新增幕墙施工',
        planned_start_date: '2026-08-01',
        planned_end_date: '2026-08-20',
        sort_order: 2,
        mapping_status: 'pending',
      },
    )

    const response = await supertest(buildApp())
      .get('/api/task-baselines/baseline-draft/diff')
      .query({ compareTo: 'baseline-current' })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      baselineId: 'baseline-draft',
      compareToBaselineId: 'baseline-current',
      fromVersionLabel: 'v6',
      toVersionLabel: 'editing',
      counts: {
        total: 3,
        modified: 1,
        added: 1,
        removed: 1,
      },
    })
    expect(response.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'modified',
        title: '一层主体结构施',
        rowId: 'draft-task-1',
        sourceRowId: 'current-task-1',
        field: 'end',
        note: expect.stringContaining('planned_end_date: 2026-07-04'),
      }),
      expect.objectContaining({
        kind: 'added',
        title: '新增幕墙施工',
        rowId: 'draft-new',
      }),
      expect.objectContaining({
        kind: 'removed',
        title: '临时支护拆除',
        sourceRowId: 'current-removed',
      }),
    ]))
  })

  it('summarizes baseline date windows chronologically when database rows contain Date objects', async () => {
    const app = buildApp()
    state.tables.task_baselines.push({
      id: 'baseline-date-summary',
      project_id: 'project-1',
      version: null,
      status: 'draft',
      title: '日期汇总草稿',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push(
      {
        id: 'item-early',
        project_id: 'project-1',
        baseline_version_id: 'baseline-date-summary',
        title: 'early item',
        planned_start_date: new Date('2025-04-30T16:00:00.000Z'),
        planned_end_date: new Date('2025-05-15T16:00:00.000Z'),
        sort_order: 1,
        mapping_status: 'pending',
      },
      {
        id: 'item-late',
        project_id: 'project-1',
        baseline_version_id: 'baseline-date-summary',
        title: 'late item',
        planned_start_date: new Date('2026-11-29T16:00:00.000Z'),
        planned_end_date: new Date('2026-12-30T16:00:00.000Z'),
        sort_order: 2,
        mapping_status: 'pending',
      },
    )

    const response = await supertest(app).get('/api/task-baselines/baseline-date-summary?project_id=project-1')

    expect(response.status).toBe(200)
    expect(response.body.data.summary.planned_start_date).toBe('2025-04-30T16:00:00.000Z')
    expect(response.body.data.summary.planned_end_date).toBe('2026-12-30T16:00:00.000Z')
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
      .send({
        version: 2,
        cause_code: 'workflow_sequence',
        change_reason: '复核修订内容后确认新版执行基线。',
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
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
      expect.objectContaining({ query: expect.any(Function) }),
    )
    expect(baselineGovernanceMocks.syncBaselineCriticalFlagsToTasks).not.toHaveBeenCalled()
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: 'baseline-old',
        old_value: 'confirmed',
        new_value: 'archived',
      }),
    )
  })

  it('passes source baseline items into the confirmation gate for compression-cap validation', async () => {
    state.tables.task_baselines.push(
      {
        id: 'baseline-old',
        project_id: 'project-1',
        version: 1,
        status: 'confirmed',
        title: 'baseline v1',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'baseline-new',
        project_id: 'project-1',
        version: 2,
        status: 'revising',
        title: 'baseline v2',
        source_version_id: 'baseline-old',
        created_at: '2026-04-10T00:00:00.000Z',
        updated_at: '2026-04-10T00:00:00.000Z',
      },
    )
    state.tables.task_baseline_items.push(
      {
        id: 'old-span',
        project_id: 'project-1',
        baseline_version_id: 'baseline-old',
        title: 'Old long span',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-07-31',
        sort_order: 1,
        mapping_status: 'mapped',
      },
      {
        id: 'new-span',
        project_id: 'project-1',
        baseline_version_id: 'baseline-new',
        title: 'New compressed span',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-20',
        sort_order: 1,
        mapping_status: 'mapped',
      },
    )

    const response = await supertest(buildApp())
      .post('/api/task-baselines/baseline-new/confirm')
      .send({
        version: 2,
        cause_code: 'workflow_sequence',
        change_reason: '复核压缩工期影响后确认新版执行基线。',
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(planningRevisionPoolService.evaluateBaselineConfirmationGate).toHaveBeenCalledWith(expect.objectContaining({
      baselineItems: expect.arrayContaining([
        expect.objectContaining({ id: 'new-span' }),
      ]),
      sourceItems: expect.arrayContaining([
        expect.objectContaining({ id: 'old-span' }),
      ]),
    }))
  })

  it('publishes and confirms wizard-generated default master-plan drafts without PM governance evidence', async () => {
    for (const endpoint of ['publish', 'confirm']) {
      const baselineId = `candidate-${endpoint}`
      state.tables.task_baselines.push({
        id: baselineId,
        project_id: 'project-1',
        version: null,
        status: 'draft',
        title: '候选默认主计划',
        source_version_label: 'residential_master_plan_v2',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      })
      state.tables.task_baseline_items.push({
        id: `${baselineId}-item-1`,
        project_id: 'project-1',
        baseline_version_id: baselineId,
        title: '1#楼主体结构标准层循环',
        planned_start_date: '2026-08-01',
        planned_end_date: '2027-02-28',
        sort_order: 1,
        mapping_status: 'mapped',
        generation_metadata: {
          source: 'residential_master_plan_v2',
          candidateOnly: true,
          writesTasks: false,
          writesTaskDependencies: false,
          writesCriticalPathFacts: false,
          durationSuggestion: {
            planDurationTruthSource: 'candidate_default_master_plan_baseline',
            dataUpgradeBlockedBy: ['GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'],
          },
        },
      })

      const response = await supertest(buildApp())
        .post(`/api/task-baselines/${baselineId}/${endpoint}`)
        .send({
          version: null,
          cause_code: 'workflow_sequence',
          change_reason: '复核向导生成结果后确认执行基线。',
        })

      expect(response.status, `${endpoint}: ${JSON.stringify(response.body)}`).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.status).toBe('confirmed')
      expect(response.body.data.candidate_governance_review).toBeUndefined()
      expect(state.tables.task_baselines.find((row) => row.id === baselineId)?.status).toBe('confirmed')
    }
  })

  it('ignores the legacy PM acknowledgement boolean when publishing a generated plan', async () => {
    state.tables.task_baselines.push({
      id: 'candidate-legacy-boolean',
      project_id: 'project-1',
      version: null,
      status: 'draft',
      title: '旧确认方式候选默认主计划',
      source_version_label: 'managed_frontier_default_master_plan',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push({
      id: 'candidate-legacy-boolean-item-1',
      project_id: 'project-1',
      baseline_version_id: 'candidate-legacy-boolean',
      title: '医疗专项系统调试与卫生专项验收',
      planned_start_date: '2027-05-01',
      planned_end_date: '2027-06-30',
      sort_order: 1,
      mapping_status: 'mapped',
      generation_metadata: {
        source: 'managed_frontier_default_master_plan',
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
        writesCriticalPathFacts: false,
        durationSuggestion: {
          planDurationTruthSource: 'candidate_default_master_plan_baseline',
          dataUpgradeBlockedBy: ['GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'],
        },
      },
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/candidate-legacy-boolean/publish')
      .send({
        version: null,
        candidate_governance_reviewed: true,
        cause_code: 'workflow_sequence',
        change_reason: '复核向导生成结果后确认执行基线。',
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.candidate_governance_review).toBeUndefined()
    expect(state.tables.task_baselines.find((row) => row.id === 'candidate-legacy-boolean')?.status).toBe('confirmed')
  })

  it('publishes a generated-plan draft even when legacy metadata marks it as candidate-only', async () => {
    state.tables.task_baselines.push({
      id: 'candidate-governance-only',
      project_id: 'project-1',
      version: null,
      status: 'draft',
      title: '治理元数据候选默认主计划',
      source_version_label: 'manual_review_copy',
      governance_metadata: {
        source: 'default_master_plan_candidate_baseline_draft',
        candidateOnly: true,
        productionReady: false,
        candidateGovernance: {
          status: 'candidate_review_required',
          production_ready: false,
        },
      },
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push({
      id: 'candidate-governance-only-item-1',
      project_id: 'project-1',
      baseline_version_id: 'candidate-governance-only',
      title: '候选主计划条目',
      planned_start_date: '2026-08-01',
      planned_end_date: '2026-08-31',
      sort_order: 1,
      mapping_status: 'mapped',
      generation_metadata: {},
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/candidate-governance-only/publish')
      .send({
        version: null,
        cause_code: 'workflow_sequence',
        change_reason: '复核候选计划后确认执行基线。',
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.candidate_governance_review).toBeUndefined()
    expect(state.tables.task_baselines.find((row) => row.id === 'candidate-governance-only')?.status).toBe('confirmed')
  })

  it('ignores legacy PM governance packages instead of persisting them as runtime approval evidence', async () => {
    state.tables.task_baselines.push({
      id: 'candidate-reviewed',
      project_id: 'project-1',
      version: null,
      status: 'draft',
      title: '已复核候选默认主计划',
      source_version_label: 'managed_frontier_default_master_plan',
      governance_metadata: {
        source: 'default_master_plan_candidate_baseline_draft',
        productionReady: false,
        durationAssetUtilizationSummary: {
          source: 'default_master_plan_duration_asset_utilization_summary',
          scheduleRowCount: 16,
          rowsMissingDurationAssetCount: 0,
          productionWritePolicy: 'candidate_only_no_task_dependencies_write',
        },
        candidateNetworkEvaluation: {
          source: 'generated_wbs_row_candidate_network_cpm',
          projectedNetworkSpanDays: 326,
          previewEdgeCount: 12,
          processConstraintRoutingCandidateEdgeCount: 2,
          writesTaskDependencies: false,
          writesCriticalPathFacts: false,
        },
      },
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push({
      id: 'candidate-reviewed-item-1',
      project_id: 'project-1',
      baseline_version_id: 'candidate-reviewed',
      title: '医疗专项系统调试与卫生专项验收',
      planned_start_date: '2027-05-01',
      planned_end_date: '2027-06-30',
      sort_order: 1,
      mapping_status: 'mapped',
      generation_metadata: {
        source: 'managed_frontier_default_master_plan',
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
        writesCriticalPathFacts: false,
        durationSuggestion: {
          planDurationTruthSource: 'candidate_default_master_plan_baseline',
          dataUpgradeBlockedBy: ['GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'],
        },
      },
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/candidate-reviewed/publish')
      .send({
        version: null,
        cause_code: 'workflow_sequence',
        change_reason: '复核候选计划后确认执行基线。',
        candidate_governance_review: {
          decision: 'accepted_for_baseline',
          reviewed_item_ids: ['candidate-reviewed-item-1'],
          acknowledged_blockers: CANDIDATE_DEFAULT_MASTER_PLAN_REVIEW_BLOCKERS,
          review_notes: '项目经理已逐项复核候选主计划，可作为当前基线发布；production-ready 仍按后续 runtime 门禁执行。',
        },
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('confirmed')
    expect(response.body.data.candidate_governance_review).toBeUndefined()
    const persistedBaseline = state.tables.task_baselines.find((row) => row.id === 'candidate-reviewed')
    expect(persistedBaseline?.status).toBe('confirmed')
    expect(persistedBaseline?.governance_metadata).not.toHaveProperty('candidate_governance_review')
    expect(state.clientQuery).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE public\.task_baselines[\s\S]+WHERE id = \$1[\s\S]+project_id = \$2[\s\S]+RETURNING \*/i),
      expect.arrayContaining(['candidate-reviewed', 'project-1', 'confirmed']),
    )
    expect(state.writeLog).not.toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'baseline',
      entity_id: 'candidate-reviewed',
      field_name: 'candidate_default_master_plan_review',
    }))
  })

  it('saves a revision draft in place and remaps client temporary hierarchy ids', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-draft',
      project_id: 'project-1',
      version: null,
      status: 'revising',
      title: 'baseline draft',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push({
      id: 'old-item',
      project_id: 'project-1',
      baseline_version_id: 'baseline-draft',
      title: 'old item',
      sort_order: 0,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .put('/api/task-baselines/baseline-draft')
      .send({
        title: 'baseline draft saved',
        items: [
          {
            id: 'client-root',
            title: 'division work',
            planned_start_date: '2026-05-01',
            planned_end_date: '2026-05-10',
            sort_order: 0,
          },
          {
            id: 'client-child',
            parent_item_id: 'client-root',
            title: 'subdivision work',
            planned_start_date: '2026-05-02',
            planned_end_date: '2026-05-08',
            sort_order: 1,
          },
        ],
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('revising')
    expect(response.body.data.version).toBeNull()
    expect(response.body.data.business_version_label).toBe('editing')
    expect(response.body.data.items).toHaveLength(2)

    const root = response.body.data.items.find((item: Row) => item.title === 'division work')
    const child = response.body.data.items.find((item: Row) => item.title === 'subdivision work')
    expect(root?.id).toBeTruthy()
    expect(root?.id).not.toBe('client-root')
    expect(child?.parent_item_id).toBe(root?.id)
    expect(state.tables.task_baseline_items.filter((row) => row.baseline_version_id === 'baseline-draft')).toHaveLength(2)
    expect(state.tables.task_baselines.find((row) => row.id === 'baseline-draft')?.title).toBe('baseline draft saved')
    expect(state.getClient).toHaveBeenCalledTimes(1)
    expect(state.clientQuery).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE public\.task_baselines[\s\S]+WHERE id = \$1[\s\S]+project_id = \$2/i),
      expect.arrayContaining(['baseline-draft', 'project-1']),
    )
    expect(state.clientQuery).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM public\.task_baseline_items[\s\S]+baseline_version_id = \$1[\s\S]+project_id = \$2/i),
      ['baseline-draft', 'project-1'],
    )
    expect(state.clientQuery).toHaveBeenLastCalledWith('COMMIT')
    expect(state.clientRelease).toHaveBeenCalledTimes(1)
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: 'baseline-draft',
        field_name: 'draft_saved',
        old_value: '1',
        new_value: '2',
      }),
    )
  })

  it('commits baseline draft edits without publishing or archiving active baselines', async () => {
    state.tables.task_baselines.push(
      {
        id: 'baseline-active',
        project_id: 'project-1',
        version: 2,
        status: 'confirmed',
        title: 'active baseline',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'baseline-draft',
        project_id: 'project-1',
        version: null,
        status: 'revising',
        title: 'baseline draft',
        source_version_id: 'baseline-active',
        created_at: '2026-05-02T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z',
      },
    )
    state.tables.task_baseline_items.push({
      id: 'draft-item-1',
      project_id: 'project-1',
      baseline_version_id: 'baseline-draft',
      title: 'old draft item',
      planned_start_date: '2026-05-10',
      planned_end_date: '2026-05-12',
      sort_order: 0,
      created_at: '2026-05-02T00:00:00.000Z',
      updated_at: '2026-05-02T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/baseline-draft/commit')
      .send({
        projectId: 'project-1',
        surface: 'baseline',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'draft-item-1',
            field: 'title',
            value: 'committed draft item',
          },
        ],
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.data.surface).toBe('baseline')
    expect(response.body.data.realtimeEvents).toContain('planning.table.changed')
    expect(response.body.data.governanceSummary.changedRowCount).toBe(1)
    expect(state.tables.task_baselines).toHaveLength(2)
    expect(state.tables.task_baselines.find((row) => row.id === 'baseline-active')?.status).toBe('confirmed')
    expect(state.tables.task_baselines.find((row) => row.id === 'baseline-draft')).toMatchObject({
      status: 'revising',
      version: null,
    })
    expect(state.tables.task_baseline_items).toEqual([
      expect.objectContaining({
        baseline_version_id: 'baseline-draft',
        title: 'committed draft item',
      }),
    ])
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'baseline',
        entity_id: 'baseline-draft',
        field_name: 'draft_committed',
        old_value: '1',
        new_value: '1',
        action_type: 'baseline_commit',
        action_group: 'edit',
        metadata: expect.objectContaining({
          source: 'baseline_commit',
          operationCount: 1,
          governanceSummary: expect.objectContaining({
            changedRowCount: 1,
          }),
          mergeGroupSummary: expect.objectContaining({
            identity: expect.objectContaining({
              fields: ['title'],
            }),
          }),
        }),
      }),
    )
  })

  it('commits oversized baseline template generations as a render-budget concern instead of a hard row limit', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-draft',
      project_id: 'project-1',
      version: null,
      status: 'revising',
      title: 'baseline draft',
      created_at: '2026-05-02T00:00:00.000Z',
      updated_at: '2026-05-02T00:00:00.000Z',
    })
    const rows = Array.from({ length: 501 }, (_, index) => ({
      clientRowId: `batch-baseline-large:row-${index + 1}`,
      parentClientRowId: null,
      parentRowId: null,
      sortOrder: index,
      predecessorClientRowIds: [],
      predecessorDependencies: [],
      values: {
        title: `Baseline generated item ${index + 1}`,
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-02',
        target_progress: 0,
        mapping_status: 'pending',
        wbs_node_type: 'item_work',
        template_node_id: `SITE-ROW-${index + 1}`,
      },
    }))
    wbsGenerationMocks.generateWbsTemplateRows.mockResolvedValue({
      generationBatchId: 'batch-baseline-large',
      templateId: 'china-building-site-management',
      generationDepth: 'item_work',
      scopeCombos: [],
      rowLimit: 500,
      rowLimitPolicy: 'single_batch',
      generationBatches: [{
        batchId: 'batch-baseline-large',
        scopeIndexes: [0],
        rowCount: 501,
        rowLimit: 500,
        rowLimitExceeded: true,
        templateIds: ['china-building-site-management'],
      }],
      rows,
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/baseline-draft/commit')
      .send({
        projectId: 'project-1',
        surface: 'baseline',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'template_generate',
            generationBatchId: 'batch-baseline-large',
            templateId: 'china-building-site-management',
            selectedNodeIds: ['SITE-01-01-01'],
            rowLimitPolicy: 'single_batch',
            generationBatches: [{
              batchId: 'batch-baseline-large',
              scopeIndexes: [0],
              rowCount: 501,
              rowLimit: 500,
              rowLimitExceeded: true,
            }],
          },
        ],
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.data.governanceSummary.createdRowCount).toBe(501)
    expect(response.body.data.tempIdMap['batch-baseline-large:row-501']).toEqual(expect.any(String))
    expect(state.tables.task_baseline_items).toHaveLength(501)
    expect(state.tables.task_baseline_items[500]).toEqual(expect.objectContaining({
      baseline_version_id: 'baseline-draft',
      title: 'Baseline generated item 501',
    }))
  })

  it('carries default master-plan duration asset utilization summary into baseline candidate event metadata', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-draft',
      project_id: 'project-1',
      version: null,
      status: 'revising',
      title: 'baseline draft',
      created_at: '2026-05-02T00:00:00.000Z',
      updated_at: '2026-05-02T00:00:00.000Z',
    })
    const durationAssetUtilizationSummary = {
      source: 'default_master_plan_duration_asset_utilization_summary',
      evidenceLevel: 'candidate_duration_asset_utilization_l1',
      mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
      scheduleRowCount: 1,
      standardWorkDurationSeedRowCount: 1,
      t2RhythmTemplateRowCount: 1,
      projectScaleQuantityProxyRowCount: 1,
      dependencyAssetConsumedRowCount: 1,
      dependencyTimingAssetConsumedRowCount: 1,
      processSeasonalDurationAssetRowCount: 0,
      runtimeReferenceDaysRowCount: 0,
      constructionCalendarRowCount: 1,
      rowsMissingDurationAssetCount: 0,
      rowsMissingT2RhythmTemplateCount: 0,
      uniqueStandardWorkDurationSeedStableCodes: ['cast_in_place_formwork'],
      uniqueT2RhythmTemplateIds: ['t2-residential-standard-floor-rhythm-v1'],
      uniqueDependencyAssetStableCodes: ['asset_backed_residential_trade_interleave'],
      durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
      productionWritePolicy: 'candidate_only_no_task_dependencies_write',
    }
    wbsGenerationMocks.generateWbsTemplateRows.mockResolvedValue({
      generationBatchId: 'batch-duration-assets',
      templateId: 'managed-frontier-default-master-plan',
      generationDepth: 'managed_frontier',
      scopeCombos: [],
      durationAssetUtilizationSummary,
      rows: [{
        clientRowId: 'batch-duration-assets:row-1',
        parentClientRowId: null,
        parentRowId: null,
        sortOrder: 0,
        predecessorClientRowIds: [],
        predecessorDependencies: [],
        values: {
          title: '1#楼主体结构标准层循环',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-12-31',
          target_progress: 0,
          mapping_status: 'pending',
          wbs_node_type: 'item_work',
          template_node_id: 'RMP-04-01-02',
        },
      }],
    })

    const response = await supertest(buildApp())
      .post('/api/task-baselines/baseline-draft/commit')
      .send({
        projectId: 'project-1',
        surface: 'baseline',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'template_generate',
            generationBatchId: 'batch-duration-assets',
            templateId: 'managed-frontier-default-master-plan',
            selectedNodeIds: ['RMP-04-01-02'],
          },
        ],
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(wbsTemplateCandidateEventMocks.recordWbsTemplateCandidateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        surface: 'baseline',
        metadata: expect.objectContaining({
          source: 'baseline_commit',
          durationAssetUtilizationSummary,
        }),
      }),
    )
  })

  it('creates baseline items with non-null json defaults for runtime schema constraints', async () => {
    const response = await supertest(buildApp())
      .post('/api/task-baselines')
      .send({
        project_id: 'project-1',
        title: 'baseline with default metadata',
        items: [
          {
            title: 'item without explicit metadata',
            planned_start_date: '2026-05-01',
            planned_end_date: '2026-05-02',
          },
        ],
      })

    expect(response.status, JSON.stringify(response.body)).toBe(201)
    expect(response.body.data.items).toHaveLength(1)
    expect(state.tables.task_baseline_items[0]).toEqual(expect.objectContaining({
      generation_metadata: {},
      manual_override_fields: {},
      seed_versions: [],
    }))
  })

  it('generates baseline drafts from the current task list through the authoritative generate endpoint', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-generate-source',
      project_id: 'project-1',
      version: 3,
      status: 'confirmed',
      title: 'active baseline',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push({
      id: 'baseline-generate-item-1',
      project_id: 'project-1',
      baseline_version_id: 'baseline-generate-source',
      source_task_id: 'task-generate-1',
      title: 'old task title',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-04',
      sort_order: 0,
      mapping_status: 'mapped',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })
    state.tables.tasks.push(
      {
        id: 'task-generate-1',
        project_id: 'project-1',
        title: 'Generated baseline task',
        planned_start_date: '2026-05-02',
        planned_end_date: '2026-05-06',
        progress: 15,
        sort_order: 1,
        status: 'in_progress',
        is_critical: true,
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'task-generate-closed',
        project_id: 'project-1',
        title: 'Closed task excluded from baseline generation',
        planned_start_date: '2026-05-02',
        planned_end_date: '2026-05-06',
        progress: 100,
        sort_order: 2,
        status: 'closed',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    )

    const response = await supertest(buildApp())
      .post('/api/task-baselines/generate')
      .send({ projectId: 'project-1' })

    expect(response.status, JSON.stringify(response.body)).toBe(201)
    expect(response.body.data).toMatchObject({
      project_id: 'project-1',
      status: 'draft',
      version: null,
      source_version_id: 'baseline-generate-source',
    })
    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        project_id: 'project-1',
        baseline_version_id: response.body.data.id,
        source_task_id: 'task-generate-1',
        title: 'Generated baseline task',
        planned_start_date: '2026-05-02',
        planned_end_date: '2026-05-06',
        mapping_status: 'mapped',
      }),
    ])
    expect(response.body.data.items[0]).toEqual(expect.objectContaining({
      snapshot_source: 'current_execution_fact',
      source_chip: 'site',
      source_reason: 'Dates updated from current task schedule.',
      manual_override_fields: {},
      seed_versions: expect.arrayContaining([
        expect.objectContaining({
          algorithm: 'baseline_generation',
          version: 'v1.4.7.4',
          frozenCommitment: false,
          requiresUserReview: true,
        }),
      ]),
    }))
    expect(state.tables.task_baselines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: response.body.data.id,
          project_id: 'project-1',
          status: 'draft',
          source_version_id: 'baseline-generate-source',
        }),
      ]),
    )
    expect(state.tables.task_baseline_items.some((item) => item.source_task_id === 'task-generate-closed')).toBe(false)
    expect(state.recordBaselineSnapshotLineage).toHaveBeenCalledWith(
      'project-1',
      expect.any(Array),
      'owner-1',
      expect.any(Object),
    )
  })

  it('returns generation candidate signals without creating a draft baseline', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-candidate-source',
      project_id: 'project-1',
      version: 4,
      status: 'confirmed',
      title: 'candidate source baseline',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })
    state.tables.task_baseline_items.push(
      {
        id: 'baseline-candidate-item-1',
        project_id: 'project-1',
        baseline_version_id: 'baseline-candidate-source',
        source_task_id: 'task-candidate-1',
        title: 'candidate milestone',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-04',
        sort_order: 0,
        is_milestone: true,
        mapping_status: 'mapped',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'baseline-candidate-removed',
        project_id: 'project-1',
        baseline_version_id: 'baseline-candidate-source',
        source_task_id: 'task-candidate-removed',
        title: 'removed candidate task',
        planned_start_date: '2026-05-02',
        planned_end_date: '2026-05-05',
        sort_order: 1,
        mapping_status: 'mapped',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    )
    state.tables.tasks.push(
      {
        id: 'task-candidate-1',
        project_id: 'project-1',
        title: 'candidate milestone',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-19',
        progress: 20,
        sort_order: 1,
        is_milestone: true,
        status: 'in_progress',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'task-candidate-new',
        project_id: 'project-1',
        title: 'new candidate task',
        planned_start_date: '2026-05-06',
        planned_end_date: '2026-05-25',
        progress: 0,
        sort_order: 2,
        status: 'todo',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    )

    const response = await supertest(buildApp())
      .get('/api/task-baselines/baseline-candidate-source/generation-candidate')

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.data).toMatchObject({
      baselineId: 'baseline-candidate-source',
      projectId: 'project-1',
      sourceVersionLabel: 'baseline v4',
      candidateVersionLabel: 'new baseline draft',
      recommended: true,
    })
    expect(response.body.data.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'milestone_shift' }),
        expect.objectContaining({ code: 'finish_shift' }),
        expect.objectContaining({ code: 'scope_structure_changed' }),
        expect.objectContaining({ code: 'planned_dates_changed' }),
      ]),
    )
    expect(response.body.data.diffCounts).toMatchObject({
      total: 3,
      added: 1,
      modified: 0,
      removed: 1,
      milestone_changed: 1,
    })
    expect(response.body.data.diffItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'milestone_changed',
          title: 'candidate milestone',
          note: 'Milestone date changed.',
        }),
        expect.objectContaining({ kind: 'added', title: 'new candidate task' }),
        expect.objectContaining({ kind: 'removed', title: 'removed candidate task' }),
      ]),
    )
    expect(state.tables.task_baselines).toHaveLength(1)
    expect(state.tables.task_baseline_items).toHaveLength(2)
  })

  it('rejects generation candidates for non-latest effective baselines', async () => {
    state.tables.task_baselines.push(
      {
        id: 'baseline-old-source',
        project_id: 'project-1',
        version: 3,
        status: 'confirmed',
        title: 'old baseline',
        confirmed_at: '2026-05-01T00:00:00.000Z',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'baseline-latest-source',
        project_id: 'project-1',
        version: 4,
        status: 'confirmed',
        title: 'latest baseline',
        confirmed_at: '2026-05-10T00:00:00.000Z',
        created_at: '2026-05-10T00:00:00.000Z',
        updated_at: '2026-05-10T00:00:00.000Z',
      },
    )

    const response = await supertest(buildApp())
      .get('/api/task-baselines/baseline-old-source/generation-candidate')

    expect(response.status, JSON.stringify(response.body)).toBe(409)
    expect(response.body.error.code).toBe('LATEST_BASELINE_REQUIRED')
  })

  it('rejects direct save on a frozen baseline', async () => {
    state.tables.task_baselines.push({
      id: 'baseline-confirmed',
      project_id: 'project-1',
      version: 3,
      status: 'confirmed',
      title: 'confirmed baseline',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .put('/api/task-baselines/baseline-confirmed')
      .send({
        title: 'should not save',
        items: [],
      })

    expect(response.status).toBe(409)
    expect(response.body.error?.code).toBe('INVALID_STATE')
    expect(state.tables.task_baselines.find((row) => row.id === 'baseline-confirmed')?.title).toBe('confirmed baseline')
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
      .send({
        version: 5,
        cause_code: 'workflow_sequence',
        change_reason: '调整计划后申请确认执行基线。',
      })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('REQUIRES_REALIGNMENT')
    expect(response.body.error.message).toContain('realignment threshold')
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

  it('routes monthly batch edits through the shared commit endpoint instead of legacy direct endpoints', async () => {
    state.tables.monthly_plans.push({
      id: 'plan-batch-1',
      project_id: 'project-1',
      version: 5,
      status: 'draft',
      month: '2026-04',
      title: '2026-04 monthly plan',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.tables.monthly_plan_items.push(
      {
        id: 'batch-item-1',
        project_id: 'project-1',
        monthly_plan_version_id: 'plan-batch-1',
        title: 'structure 1',
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
        title: 'structure 2',
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
    expect(scopeResponse.status).toBe(404)

    const shiftResponse = await request
      .post('/api/monthly-plans/plan-batch-1/items/batch-shift-dates')
      .send({ shift_days: 2, item_ids: ['batch-item-2'], reason: 'weather' })
    expect(shiftResponse.status).toBe(404)

    const progressResponse = await request
      .post('/api/monthly-plans/plan-batch-1/items/batch-target-progress')
      .send({ target_progress: 65, scope: 'all', reason: 'team sync' })
    expect(progressResponse.status).toBe(404)
    expect(state.tables.monthly_plan_items.find((item) => item.id === 'batch-item-1')?.commitment_status).toBe('planned')
    expect(state.tables.monthly_plan_items.find((item) => item.id === 'batch-item-2')?.planned_start_date).toBe('2026-04-16')
    expect(state.tables.monthly_plan_items.every((item) => Number(item.target_progress) !== 65)).toBe(true)
  })

  it('commits monthly draft edits without confirming or creating another formal version', async () => {
    state.tables.monthly_plans.push({
      id: 'plan-draft-commit',
      project_id: 'project-1',
      version: 6,
      status: 'draft',
      month: '2026-05',
      title: '2026-05 monthly draft',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })
    state.tables.monthly_plan_items.push({
      id: 'monthly-item-1',
      project_id: 'project-1',
      monthly_plan_version_id: 'plan-draft-commit',
      title: 'monthly draft item',
      planned_start_date: '2026-05-03',
      planned_end_date: '2026-05-08',
      target_progress: 20,
      sort_order: 0,
      manual_override_fields: {},
      generation_metadata: { generation_reasons: ['task_schedule_overlap'] },
      last_generated_at: '2026-05-01T00:00:00.000Z',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .post('/api/monthly-plans/plan-draft-commit/commit')
      .send({
        projectId: 'project-1',
        surface: 'monthly_plan',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'monthly-item-1',
            field: 'progress',
            value: 80,
          },
        ],
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.data.surface).toBe('monthly_plan')
    expect(response.body.data.realtimeEvents).toContain('planning.table.changed')
    expect(response.body.data.governanceSummary.changedRowCount).toBe(1)
    expect(response.body.data.governanceSummary.progressAdjustmentCount).toBe(1)
    expect(state.tables.monthly_plans).toHaveLength(1)
    expect(state.tables.monthly_plans[0]).toMatchObject({
      id: 'plan-draft-commit',
      status: 'draft',
      version: 6,
    })
    expect(state.tables.monthly_plans[0].confirmed_snapshot_at).toBeUndefined()
    expect(state.tables.monthly_plan_items).toEqual([
      expect.objectContaining({
        id: 'monthly-item-1',
        monthly_plan_version_id: 'plan-draft-commit',
        target_progress: 80,
        manual_override_fields: { target_progress: true },
        generation_metadata: { generation_reasons: ['task_schedule_overlap'] },
        last_generated_at: '2026-05-01T00:00:00.000Z',
      }),
    ])
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'monthly_plan',
        entity_id: 'plan-draft-commit',
        field_name: 'draft_committed',
        old_value: '1',
        new_value: '1',
        action_type: 'monthly_plan_commit',
        action_group: 'edit',
        metadata: expect.objectContaining({
          source: 'monthly_plan_commit',
          operationCount: 1,
          governanceSummary: expect.objectContaining({
            changedRowCount: 1,
            progressAdjustmentCount: 1,
          }),
          mergeGroupSummary: expect.objectContaining({
            progress_status: expect.objectContaining({
              fields: ['progress'],
            }),
          }),
        }),
      }),
    )
  })

  it('confirms monthly plans by writing a confirmed snapshot timestamp', async () => {
    state.tables.monthly_plans.push({
      id: 'plan-confirm',
      project_id: 'project-1',
      version: 6,
      status: 'draft',
      month: '2026-05',
      title: '2026-05 monthly draft',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })
    state.tables.monthly_plan_items.push({
      id: 'monthly-confirm-item-1',
      project_id: 'project-1',
      monthly_plan_version_id: 'plan-confirm',
      title: 'confirmed monthly item',
      planned_start_date: '2026-05-03',
      planned_end_date: '2026-05-08',
      target_progress: 80,
      sort_order: 0,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .post('/api/monthly-plans/plan-confirm/confirm')
      .send({
        version: 6,
        month: '2026-05',
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.data).toMatchObject({
      id: 'plan-confirm',
      status: 'confirmed',
      confirmed_by: 'owner-1',
    })
    expect(response.body.data.confirmed_snapshot_at).toEqual(expect.any(String))
    expect(state.tables.monthly_plans[0]).toMatchObject({
      id: 'plan-confirm',
      status: 'confirmed',
      confirmed_by: 'owner-1',
    })
    expect(state.tables.monthly_plans[0].confirmed_snapshot_at).toEqual(expect.any(String))
    expect(state.tables.monthly_plan_items).toHaveLength(1)
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'monthly_plan',
        entity_id: 'plan-confirm',
        field_name: 'status',
        old_value: 'draft',
        new_value: 'confirmed',
      }),
    )
  })

  it('closes monthly plans without rewriting the confirmed snapshot', async () => {
    state.tables.monthly_plans.push({
      id: 'plan-close',
      project_id: 'project-1',
      version: 6,
      status: 'confirmed',
      month: '2026-05',
      title: '2026-05 confirmed monthly plan',
      confirmed_at: '2026-05-10T00:00:00.000Z',
      confirmed_snapshot_at: '2026-05-10T00:00:00.000Z',
      closeout_at: null,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-10T00:00:00.000Z',
    })
    state.tables.monthly_plan_items.push({
      id: 'monthly-close-item-1',
      project_id: 'project-1',
      monthly_plan_version_id: 'plan-close',
      title: 'closed monthly item',
      planned_start_date: '2026-05-03',
      planned_end_date: '2026-05-08',
      target_progress: 100,
      sort_order: 0,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-10T00:00:00.000Z',
    })

    const response = await supertest(buildApp())
      .post('/api/monthly-plans/plan-close/close')
      .send({
        version: 6,
        month: '2026-05',
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.data).toMatchObject({
      id: 'plan-close',
      status: 'closed',
      confirmed_snapshot_at: '2026-05-10T00:00:00.000Z',
      carryover_item_count: 1,
      pending_closeout_count: 0,
      data_confidence_score: 91,
      data_confidence_flag: 'high',
      data_confidence_note: 'test',
    })
    expect(response.body.data.closeout_at).toEqual(expect.any(String))
    expect(state.tables.monthly_plans[0]).toMatchObject({
      id: 'plan-close',
      status: 'closed',
      confirmed_snapshot_at: '2026-05-10T00:00:00.000Z',
      carryover_item_count: 1,
      pending_closeout_count: 0,
      data_confidence_score: 91,
      data_confidence_flag: 'high',
      data_confidence_note: 'test',
    })
    expect(state.tables.monthly_plans[0].closeout_at).toEqual(expect.any(String))
    expect(state.tables.monthly_plan_items[0]).toMatchObject({
      id: 'monthly-close-item-1',
      commitment_status: 'carried_over',
      generation_metadata: expect.objectContaining({
        closeout_classification: expect.objectContaining({
          category: 'carryover',
          commitmentStatus: 'carried_over',
        }),
      }),
    })
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'monthly_plan',
        entity_id: 'plan-close',
        field_name: 'status',
        old_value: 'confirmed',
        new_value: 'closed',
      }),
    )
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

  it('generates monthly draft plans through the authoritative generate endpoint', async () => {
    state.tables.task_baseline_items.push({
      id: 'baseline-monthly-source-item',
      project_id: 'project-1',
      baseline_version_id: 'baseline-monthly-source',
      source_task_id: 'task-monthly-source',
      title: 'baseline monthly source item',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-10',
      sort_order: 0,
      mapping_status: 'mapped',
      scope_snapshot: { building: 'A' },
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    })
    baselineGovernanceMocks.resolveMonthlyPlanGenerationSource.mockResolvedValue({
      mode: 'mixed',
      baselineVersionId: 'baseline-monthly-source',
      sourceVersionId: 'baseline-monthly-source',
      sourceVersionLabel: 'baseline v3',
      baselineStatus: 'confirmed',
      autoSwitched: false,
      items: [
        {
          baseline_item_id: 'baseline-monthly-source-item',
          carryover_from_item_id: null,
          source_task_id: 'task-monthly-source',
          title: 'generated monthly item',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-10',
          target_progress: 60,
          current_progress: 20,
          sort_order: 0,
          is_milestone: false,
          is_critical: true,
          commitment_status: 'carried_over',
          notes: null,
          manual_override_fields: {},
          generation_metadata: {
            inclusion_score: 80,
            generation_reasons: ['baseline_overlap', 'carryover_unfinished'],
            merged_sources: ['baseline', 'carryover'],
          },
        },
      ],
      generationSummary: {
        algorithmVersion: 'v1.4.7.4',
        sourceMode: 'mixed',
        sourceVersionLabel: 'baseline v3',
      },
    })

    const response = await supertest(buildApp())
      .post('/api/monthly-plans/generate')
      .send({
        projectId: 'project-1',
        month: '2026-05',
        title: '2026-05 monthly generated draft',
      })

    expect(response.status, JSON.stringify(response.body)).toBe(201)
    expect(response.body.data).toMatchObject({
      project_id: 'project-1',
      version: 1,
      status: 'draft',
      month: '2026-05',
      baseline_version_id: 'baseline-monthly-source',
      source_version_id: 'baseline-monthly-source',
      source_mode: 'mixed',
      temporary_without_baseline: false,
      carryover_item_count: 1,
    })
    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        project_id: 'project-1',
        monthly_plan_version_id: response.body.data.id,
        baseline_item_id: 'baseline-monthly-source-item',
        source_task_id: 'task-monthly-source',
        title: 'generated monthly item',
        commitment_status: 'carried_over',
        scope_snapshot: { building: 'A' },
        manual_override_fields: {},
        generation_metadata: expect.objectContaining({
          inclusion_score: 80,
          merged_sources: ['baseline', 'carryover'],
        }),
        last_generated_at: expect.any(String),
      }),
    ])
    expect(state.tables.monthly_plans).toEqual([
      expect.objectContaining({
        id: response.body.data.id,
        project_id: 'project-1',
        status: 'draft',
        source_mode: 'mixed',
      }),
    ])
    expect(state.recordMonthlySnapshotLineage).toHaveBeenCalledWith(
      'project-1',
      expect.any(Array),
      'owner-1',
      expect.any(Object),
    )
  })

  it('auto switches monthly plan generation to current schedule when baseline needs realignment', async () => {
    baselineGovernanceMocks.resolveMonthlyPlanGenerationSource.mockResolvedValue({
      mode: 'schedule',
      baselineVersionId: null,
      sourceVersionId: null,
      sourceVersionLabel: '当前任务列表（基线待重整，已自动切换',
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
            title: '鏃у熀绾挎潯鐩?',
          },
        ],
      })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data.baseline_version_id).toBeNull()
    expect(response.body.data.source_mode).toBe('schedule')
    expect(response.body.data.temporary_without_baseline).toBe(true)
    expect(response.body.data.source_version_label).toContain('自动切换')
    expect(state.tables.monthly_plan_items[0]).toMatchObject({
      source_task_id: 'task-live-1',
      title: '现场纠偏任务',
      is_critical: true,
    })
  })

})
