import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  let transactionActive = false
  let failFacts = false
  const workItems: Array<Record<string, any>> = []
  const dependencies: Array<Record<string, any>> = []
  const factTransactionStates: boolean[] = []
  const recordChangedExecutionFacts = vi.fn(async () => {
    factTransactionStates.push(transactionActive)
    if (failFacts) throw new Error('execution fact persistence failed')
    return []
  })
  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)
    if (normalized.includes('from certificate_work_items where id = ?')) {
      return workItems.find((item) => item.id === params[0] && item.project_id === params[1]) ?? null
    }
    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized.startsWith('select id from pre_milestones')) return [{ id: 'cert-1' }]

    if (normalized.startsWith('select * from certificate_work_item_atomic')) {
      return []
    }

    if (normalized.startsWith('select * from create_certificate_work_item_atomic')) {
      const [id, projectId, itemCode, itemName, itemStage, status, plannedFinishDate, actualFinishDate,
        approvingAuthority, isShared, nextAction, nextActionDueDate, isBlocked, blockReason,
        sortOrder, notes, latestRecordAt, certificateIds] = params
      const row = {
        id,
        project_id: projectId,
        item_code: itemCode,
        item_name: itemName,
        item_stage: itemStage,
        status,
        planned_finish_date: plannedFinishDate,
        actual_finish_date: actualFinishDate,
        approving_authority: approvingAuthority,
        is_shared: isShared,
        next_action: nextAction,
        next_action_due_date: nextActionDueDate,
        is_blocked: isBlocked,
        block_reason: blockReason,
        sort_order: sortOrder,
        notes,
        latest_record_at: latestRecordAt,
        certificate_ids: Array.isArray(certificateIds) ? certificateIds : [],
        created_at: '2026-07-24T00:00:00.000Z',
        updated_at: '2026-07-24T00:00:00.000Z',
      }
      workItems.push(row)
      for (const certificateId of row.certificate_ids) {
        dependencies.push({
          id: `dep-${String(certificateId)}-${String(id)}`,
          project_id: projectId,
          predecessor_type: 'certificate',
          predecessor_id: certificateId,
          successor_type: 'work_item',
          successor_id: id,
          dependency_kind: 'hard',
        })
      }
      return [row]
    }

    if (normalized === 'select * from certificate_dependencies where project_id = ? and predecessor_type = ? and successor_type = ?') {
      return dependencies.filter((dependency) => (
        dependency.project_id === params[0]
        && dependency.predecessor_type === params[1]
        && dependency.successor_type === params[2]
      ))
    }

    if (normalized.startsWith('select * from certificate_work_items where project_id = ? and id in (')) {
      const ids = new Set(params.slice(1).map(String))
      return workItems.filter((item) => item.project_id === params[0] && ids.has(String(item.id)))
    }

    if (normalized.startsWith('update certificate_work_items set ')) {
      const targetId = params[params.length - 2]
      const targetProjectId = params[params.length - 1]
      const target = workItems.find((item) => item.id === targetId && item.project_id === targetProjectId)
      if (target) {
        const setClause = normalized.slice('update certificate_work_items set '.length, normalized.lastIndexOf(' where id = ?'))
        for (const [index, clause] of setClause.split(',').map((value) => value.trim()).entries()) {
          const field = clause.split('=')[0]?.trim()
          if (field) target[field] = params[index]
        }
      }
      return []
    }

    if (normalized.startsWith('delete from certificate_dependencies')) {
      for (let index = dependencies.length - 1; index >= 0; index -= 1) {
        if (dependencies[index]?.successor_id === params[3] || dependencies[index]?.successor_id === params[2]) {
          dependencies.splice(index, 1)
        }
      }
      return []
    }

    if (normalized.startsWith('insert into certificate_dependencies')) {
      dependencies.push({
        id: params[0],
        project_id: params[1],
        predecessor_type: params[2],
        predecessor_id: params[3],
        successor_type: params[4],
        successor_id: params[5],
        dependency_kind: params[6],
      })
      return []
    }

    return []
  })

  const withDatabaseTransaction = vi.fn(async (work: () => Promise<unknown>) => {
    const workItemsSnapshot = workItems.map((item) => ({ ...item }))
    const dependenciesSnapshot = dependencies.map((dependency) => ({ ...dependency }))
    const wasActive = transactionActive
    transactionActive = true
    try {
      return await work()
    } catch (error) {
      workItems.splice(0, workItems.length, ...workItemsSnapshot)
      dependencies.splice(0, dependencies.length, ...dependenciesSnapshot)
      throw error
    } finally {
      transactionActive = wasActive
    }
  })

  return {
    workItems,
    dependencies,
    executeSQL,
    executeSQLOne,
    withDatabaseTransaction,
    recordChangedExecutionFacts,
    factTransactionStates,
    setFailure(value: boolean) { failFacts = value },
    reset() {
      workItems.splice(0)
      dependencies.splice(0)
      factTransactionStates.splice(0)
      failFacts = false
      transactionActive = false
    },
    supabase: { rpc: vi.fn() },
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
  supabase: state.supabase,
}))

vi.mock('../database.js', () => ({
  withDatabaseTransaction: state.withDatabaseTransaction,
}))

vi.mock('../services/executionFactGovernanceService.js', () => ({
  recordChangedExecutionFacts: state.recordChangedExecutionFacts,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: vi.fn(async () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
}))

vi.mock('../services/projectLinkingService.js', () => ({
  listActiveEntityLinksForEntity: vi.fn(async () => []),
}))

vi.mock('../services/preMilestoneReadCache.js', () => ({
  markPreMilestoneProjectChanged: vi.fn(),
}))

vi.mock('../services/businessCompletionSampleHealthAdapterService.js', () => ({
  buildCertificateMilestoneCompletionSamples: vi.fn(() => []),
  buildAndPersistBusinessCompletionSampleHealthReport: vi.fn(async () => undefined),
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  enforceRetentionOrBlock: vi.fn(async () => ({ blocked: false, reason: null, result: null })),
  buildRetentionBlockedApiError: vi.fn(),
  buildRetentionBlockedHttpStatus: vi.fn(() => 409),
}))

vi.mock('../services/requestBudgetService.js', () => ({
  REQUEST_TIMEOUT_BUDGETS: { batchWriteMs: 1000 },
  buildSyncBatchLimitError: vi.fn(),
  runWithRequestBudget: vi.fn(async (_options: unknown, work: () => Promise<unknown>) => work()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { default: certificateWorkItemsRouter } = await import('../routes/certificate-work-items.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/certificate-work-items', certificateWorkItemsRouter)
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) } })
  })
  return app
}

describe('certificate work item execution facts', () => {
  beforeEach(() => {
    state.reset()
    vi.clearAllMocks()
  })

  it('records forced initial status and finish facts inside the POST transaction', async () => {
    const response = await supertest(buildApp())
      .post('/api/projects/project-1/certificate-work-items')
      .send({ item_name: 'Permit package', item_stage: 'external_submission', status: 'approved', actual_finish_date: '2026-07-24' })

    expect(response.status).toBe(201)
    expect(state.withDatabaseTransaction).toHaveBeenCalledTimes(1)
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'certificate_work_item',
      entityId: response.body.data.id,
      changes: expect.arrayContaining([
        expect.objectContaining({ factType: 'certificate_work_item.status', force: true }),
        expect.objectContaining({ factType: 'certificate_work_item.actual_finish_date', force: true, nextValue: '2026-07-24' }),
      ]),
    }))
    expect(state.factTransactionStates).toEqual([true])
  })

  it('records changed PATCH facts and rolls back the projection when fact persistence fails', async () => {
    state.workItems.push({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      project_id: 'project-1',
      item_name: 'Permit package',
      item_stage: 'external_submission',
      status: 'pending',
      actual_finish_date: null,
      created_at: '2026-07-20T00:00:00.000Z',
      updated_at: '2026-07-20T00:00:00.000Z',
    })
    state.setFailure(true)

    const response = await supertest(buildApp())
      .patch('/api/projects/project-1/certificate-work-items/cccccccc-cccc-4ccc-8ccc-cccccccccccc')
      .send({ status: 'approved', actual_finish_date: '2026-07-24' })

    expect(response.status).toBe(500)
    expect(state.workItems[0]).toMatchObject({ status: 'pending', actual_finish_date: null })
    expect(state.factTransactionStates).toEqual([true])
  })

  it('records one status fact stream per item inside a batch PATCH transaction', async () => {
    state.workItems.push(
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', project_id: 'project-1', item_name: 'A', item_stage: 'external_submission', status: 'pending', actual_finish_date: null, created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z' },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', project_id: 'project-1', item_name: 'B', item_stage: 'external_submission', status: 'pending', actual_finish_date: null, created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z' },
    )

    const response = await supertest(buildApp())
      .patch('/api/projects/project-1/certificate-work-items/batch')
      .send({ ids: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'], updates: { status: 'approved' } })

    expect(response.status).toBe(200)
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledTimes(2)
    expect(state.factTransactionStates).toEqual([true, true])
  })
})
