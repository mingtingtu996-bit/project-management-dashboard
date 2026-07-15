import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

type PlanRow = {
  id: string
  project_id: string
  acceptance_name: string
  planned_date: string
  status: string
  actual_date?: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

type RequirementRow = {
  id: string
  project_id: string | null
  plan_id: string
  requirement_type: string
  source_entity_type: string
  source_entity_id: string
  drawing_package_id: string | null
  description: string | null
  status: string
  is_required: boolean
  is_satisfied: boolean
  created_at: string
  updated_at: string
}

type DependencyRow = {
  id: string
  project_id: string | null
  source_plan_id: string
  target_plan_id: string
  dependency_kind: string
  status: string
  created_at: string
  updated_at: string
}

type RecordRow = {
  id: string
  project_id: string | null
  plan_id: string
  record_type: string
  content: string
  operator: string | null
  record_date: string | null
  attachments: unknown[] | null
  created_at: string
  updated_at: string
}

type TaskRow = {
  id: string
  project_id: string
}

const state = vi.hoisted(() => {
  const plans: PlanRow[] = []
  const dependencies: DependencyRow[] = []
  const requirements: RequirementRow[] = []
  const records: RecordRow[] = []
  const tasks: TaskRow[] = []

  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()
  const includesSql = (sql: string, fragment: string) => sql.includes(fragment)
  const clone = <T>(row: T | undefined) => (row ? JSON.parse(JSON.stringify(row)) as T : null)

  const reset = () => {
    plans.splice(0, plans.length)
    dependencies.splice(0, dependencies.length)
    requirements.splice(0, requirements.length)
    records.splice(0, records.length)
    tasks.splice(0, tasks.length)

    tasks.push({ id: 'task-1', project_id: 'project-1' })
    tasks.push({ id: 'task-2', project_id: 'project-1' })
    tasks.push({ id: 'task-other-project', project_id: 'project-2' })

    plans.push({
      id: 'plan-source',
      project_id: 'project-1',
      acceptance_name: '前置验收',
      planned_date: '2026-04-20',
      status: 'passed',
      actual_date: '2026-04-20',
      created_at: '2026-04-14T08:00:00.000Z',
      updated_at: '2026-04-14T08:30:00.000Z',
    })

    plans.push({
      id: 'plan-1',
      project_id: 'project-1',
      acceptance_name: '主体结构验收',
      planned_date: '2026-05-01',
      status: 'preparing',
      actual_date: null,
      created_at: '2026-04-15T08:00:00.000Z',
      updated_at: '2026-04-15T08:30:00.000Z',
    })

    plans.push({
      id: 'plan-other-project',
      project_id: 'project-2',
      acceptance_name: 'other project acceptance',
      planned_date: '2026-05-02',
      status: 'preparing',
      actual_date: null,
      created_at: '2026-04-16T08:00:00.000Z',
      updated_at: '2026-04-16T08:30:00.000Z',
    })

    requirements.push({
      id: 'requirement-1',
      project_id: 'project-1',
      plan_id: 'plan-1',
      requirement_type: 'drawing',
      source_entity_type: 'drawing_package',
      source_entity_id: 'drawing-1',
      drawing_package_id: 'drawing-1',
      description: 'drawing package not archived',
      status: 'open',
      is_required: true,
      is_satisfied: false,
      created_at: '2026-04-15T08:00:00.000Z',
      updated_at: '2026-04-15T08:00:00.000Z',
    })

    records.push({
      id: 'record-1',
      project_id: 'project-1',
      plan_id: 'plan-1',
      record_type: 'note',
      content: '待补资料',
      operator: 'user-1',
      record_date: '2026-04-15',
      attachments: null,
      created_at: '2026-04-15T08:00:00.000Z',
      updated_at: '2026-04-15T08:00:00.000Z',
    })

    dependencies.push({
      id: 'dependency-1',
      project_id: 'project-1',
      source_plan_id: 'plan-source',
      target_plan_id: 'plan-1',
      dependency_kind: 'hard',
      status: 'active',
      created_at: '2026-04-15T07:00:00.000Z',
      updated_at: '2026-04-15T07:00:00.000Z',
    })
  }

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized === 'select project_id from acceptance_plans where id = ? limit 1') {
      const plan = plans.find((row) => row.id === String(params[0] ?? ''))
      return plan ? { project_id: plan.project_id } : null
    }

    if (includesSql(normalized, 'from acceptance_plans where id = ? and project_id = ? limit 1')) {
      const id = String(params[0] ?? '')
      const projectId = String(params[1] ?? '')
      return clone(plans.find((row) => row.id === id && row.project_id === projectId))
    }

    if (includesSql(normalized, 'from acceptance_plans where id = ? limit 1')) {
      return clone(plans.find((row) => row.id === String(params[0] ?? '')))
    }

    if (includesSql(normalized, 'from acceptance_requirements where project_id = ? and id = ?')) {
      return clone(requirements.find((row) => (
        row.project_id === String(params[0] ?? '')
        && row.id === String(params[1] ?? '')
      )))
    }

    if (includesSql(normalized, 'from acceptance_requirements where id = ?')) {
      return clone(requirements.find((row) => row.id === String(params[0] ?? '')))
    }

    if (includesSql(normalized, 'from acceptance_records where id = ?')) {
      return clone(records.find((row) => row.id === String(params[0] ?? '')
        && (!includesSql(normalized, 'and project_id = ?') || row.project_id === String(params[1] ?? ''))))
    }

    if (normalized === 'select id from users where id = ? limit 1') {
      const id = String(params[0] ?? '')
      return id ? { id } : null
    }

    if (includesSql(normalized, "from engineering_objects where id = ? and object_type = 'building' and project_id = ? limit 1")) {
      const id = String(params[0] ?? '')
      const projectId = String(params[1] ?? '')
      if (id === 'building-1' && projectId === 'project-1') {
        return { object_code: 'B-001', object_name: 'Building 1' }
      }
      return null
    }

    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (includesSql(normalized, 'from acceptance_requirements where project_id = ? and plan_id = ? order by created_at asc')) {
      return requirements
        .filter((row) => (
          row.project_id === String(params[0] ?? '')
          && row.plan_id === String(params[1] ?? '')
        ))
        .map((row) => clone(row))
        .filter(Boolean)
    }

    if (includesSql(normalized, 'from acceptance_catalog where project_id = ? order by created_at asc')) {
      return []
    }

    if (includesSql(normalized, 'from acceptance_plans where project_id = ? order by planned_date asc, created_at asc')) {
      return plans
        .filter((row) => row.project_id === String(params[0] ?? ''))
        .map((row) => clone(row))
        .filter(Boolean)
    }

    if (includesSql(normalized, 'from acceptance_dependencies where project_id = ? order by created_at asc')) {
      return dependencies
        .filter((row) => row.project_id === String(params[0] ?? ''))
        .map((row) => clone(row))
        .filter(Boolean)
    }

    if (includesSql(normalized, 'from acceptance_requirements where project_id = ? order by created_at asc')) {
      return requirements
        .filter((row) => row.project_id === String(params[0] ?? ''))
        .map((row) => clone(row))
        .filter(Boolean)
    }

    if (includesSql(normalized, 'from acceptance_records where project_id = ? order by created_at asc')) {
      return records
        .filter((row) => row.project_id === String(params[0] ?? ''))
        .map((row) => clone(row))
        .filter(Boolean)
    }

    if (normalized.startsWith('select id, project_id from tasks where id in (')) {
      const ids = new Set(params.map((param) => String(param ?? '')))
      return tasks
        .filter((row) => ids.has(row.id))
        .map((row) => clone(row))
        .filter(Boolean)
    }

    if (normalized === 'delete from acceptance_requirements where id = ?'
      || normalized === 'delete from acceptance_requirements where id = ? and project_id = ?') {
      const id = String(params[0] ?? '')
      const projectId = String(params[1] ?? '')
      const index = requirements.findIndex((row) => row.id === id && (!projectId || row.project_id === projectId))
      if (index !== -1) requirements.splice(index, 1)
      return []
    }

    if (normalized === 'delete from acceptance_records where id = ?'
      || normalized === 'delete from acceptance_records where id = ? and project_id = ?') {
      const id = String(params[0] ?? '')
      const projectId = String(params[1] ?? '')
      const index = records.findIndex((row) => row.id === id && (!projectId || row.project_id === projectId))
      if (index !== -1) records.splice(index, 1)
      return []
    }

    if (
      normalized.startsWith('update acceptance_plans set ')
      && (
        normalized.endsWith(' where id = ?')
        || normalized.endsWith(' where id = ? and project_id = ?')
        || normalized.endsWith(' where id = ? and project_id = ? and status = ?')
        || normalized.endsWith(' where id = ? and project_id = ? and status = ? returning id')
      )
    ) {
      const hasReturning = normalized.endsWith(' returning id')
      const normalizedWithoutReturning = hasReturning ? normalized.slice(0, -' returning id'.length) : normalized
      const suffix = normalizedWithoutReturning.endsWith(' where id = ? and project_id = ? and status = ?')
        ? ' where id = ? and project_id = ? and status = ?'
        : normalizedWithoutReturning.endsWith(' where id = ? and project_id = ?')
          ? ' where id = ? and project_id = ?'
          : ' where id = ?'
      const setClause = normalizedWithoutReturning.slice('update acceptance_plans set '.length, -suffix.length)
      const fields = setClause.split(', ').map((fragment) => fragment.replace(' = ?', ''))
      const guardedByStatus = normalizedWithoutReturning.endsWith(' where id = ? and project_id = ? and status = ?')
      const guardedByProject = guardedByStatus || normalizedWithoutReturning.endsWith(' where id = ? and project_id = ?')
      const values = guardedByStatus ? params.slice(0, -3) : guardedByProject ? params.slice(0, -2) : params.slice(0, -1)
      const id = String(params[params.length - (guardedByStatus ? 3 : guardedByProject ? 2 : 1)] ?? '')
      const projectId = guardedByProject ? String(params[params.length - (guardedByStatus ? 2 : 1)] ?? '') : null
      const expectedStatus = guardedByStatus ? String(params[params.length - 1] ?? '') : null
      const plan = plans.find((row) => (
        row.id === id
        && (!projectId || row.project_id === projectId)
        && (!expectedStatus || row.status === expectedStatus)
      ))

      if (plan) {
        fields.forEach((field, index) => {
          ;(plan as Record<string, unknown>)[field] = values[index] ?? null
        })
        return [clone(plan)]
      }
      return []
    }

    if (normalized.startsWith('insert into acceptance_plans (')) {
      const match = normalized.match(/^insert into acceptance_plans \((.+)\) values \((.+)\)$/)
      if (match) {
        const fields = match[1].split(', ').map((field) => field.trim())
        const row = fields.reduce<Record<string, unknown>>((acc, field, index) => {
          acc[field] = params[index] ?? null
          return acc
        }, {})
        plans.push(row as PlanRow)
      }
      return []
    }

    return []
  })

  return {
    plans,
    dependencies,
    requirements,
    records,
    tasks,
    executeSQL,
    executeSQLOne,
    syncCanonicalTaskFromAcceptancePlan: vi.fn(async () => undefined),
    reset,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', role: 'owner', globalRole: 'company_admin' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../database.js')>()
  return {
    ...actual,
    withDatabaseTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
  getMembers: vi.fn(async () => []),
  getTask: vi.fn(async () => null),
  updateTask: vi.fn(async () => null),
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: vi.fn(async () => null),
}))

vi.mock('../services/acceptanceTaskSyncService.js', () => ({
  syncCanonicalTaskFromAcceptancePlan: state.syncCanonicalTaskFromAcceptancePlan,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: vi.fn(async (projectId: string) => (projectId ? 'company-1' : null)),
  getVisibleProjectIds: vi.fn(async () => null),
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  enforceRetentionOrBlock: vi.fn(async () => ({ blocked: false, reason: null, result: null })),
  buildRetentionBlockedApiError: vi.fn((reason: string, result: Record<string, unknown>) => ({
    code: result?.requiresUserConfirmation ? 'RETENTION_CONFIRMATION_REQUIRED' : 'RETENTION_REJECTED',
    message: reason,
    details: result,
  })),
  buildRetentionBlockedHttpStatus: vi.fn((result: Record<string, unknown>) => (
    result?.requiresUserConfirmation ? 409 : 422
  )),
}))

const { default: acceptanceDependenciesRouter } = await import('../routes/acceptance-dependencies.js')
const { default: acceptanceRequirementsRouter } = await import('../routes/acceptance-requirements.js')
const { default: acceptanceRecordsRouter } = await import('../routes/acceptance-records.js')
const { default: acceptancePlansRouter } = await import('../routes/acceptance-plans.js')
const { clearAcceptanceFlowSnapshotCache } = await import('../services/acceptanceFlowService.js')
const { errorHandler } = await import('../middleware/errorHandler.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/acceptance-dependencies', acceptanceDependenciesRouter)
  app.use('/api/acceptance-requirements', acceptanceRequirementsRouter)
  app.use('/api/acceptance-records', acceptanceRecordsRouter)
  app.use('/api/acceptance-plans', acceptancePlansRouter)
  app.use(errorHandler)
  return app
}

describe('acceptance ancillary routes', () => {
  beforeEach(() => {
    state.reset()
    clearAcceptanceFlowSnapshotCache()
    vi.clearAllMocks()
    state.syncCanonicalTaskFromAcceptancePlan.mockResolvedValue(undefined)
  })

  function findTargetPlanStatus() {
    return state.plans.find((plan) => plan.id === 'plan-1')?.status
  }

  function executeSqlCalls(): Array<[unknown, unknown[] | undefined]> {
    return state.executeSQL.mock.calls as unknown as Array<[unknown, unknown[] | undefined]>
  }

  function joinedSqlText() {
    return executeSqlCalls().map(([sql]) => String(sql).toLowerCase()).join('\n')
  }

  it('deletes acceptance requirements through the route and service chain', async () => {
    const response = await supertest(buildApp())
      .delete('/api/acceptance-requirements/requirement-1')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.id).toBe('requirement-1')
    expect(state.requirements).toHaveLength(0)
  })

  it('deletes acceptance records through the route and service chain', async () => {
    const response = await supertest(buildApp())
      .delete('/api/acceptance-records/record-1')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.id).toBe('record-1')
    expect(state.records).toHaveLength(0)
  })

  it('blocks PATCH status progression to submitted when acceptance requirements are still unmet', async () => {
    const response = await supertest(buildApp())
      .patch('/api/acceptance-plans/plan-1/status')
      .send({ status: 'submitted' })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('PRECONDITION_NOT_MET')
    expect(response.body.error.message).toBeTruthy()
    expect(String(response.body.error.message)).toContain('drawing package not archived')
    expect(findTargetPlanStatus()).toBe('preparing')
  })

  it('blocks PUT status progression to ready_to_submit when acceptance requirements are still unmet', async () => {
    const response = await supertest(buildApp())
      .put('/api/acceptance-plans/plan-1')
      .send({ status: 'ready_to_submit' })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('PRECONDITION_NOT_MET')
    expect(response.body.error.message).toBeTruthy()
    expect(String(response.body.error.message)).toContain('drawing package not archived')
    expect(findTargetPlanStatus()).toBe('preparing')
  })

  it('rejects legacy requirement payload aliases after compatibility cleanup', async () => {
    const response = await supertest(buildApp())
      .post('/api/acceptance-requirements')
      .send({
        acceptance_plan_id: 'plan-1',
        requirement_type: 'drawing',
        source_module: 'drawing_package',
        source_entity_id: 'drawing-2',
      })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('LINEAGE_FIELD_FORBIDDEN')
  })

  it('rejects legacy dependency_type payloads after compatibility cleanup', async () => {
    const response = await supertest(buildApp())
      .post('/api/acceptance-dependencies')
      .send({
        project_id: 'project-1',
        source_plan_id: 'plan-source',
        target_plan_id: 'plan-1',
        dependency_type: 'strong',
      })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects legacy record payload aliases after compatibility cleanup', async () => {
    const response = await supertest(buildApp())
      .post('/api/acceptance-records')
      .send({
        acceptance_plan_id: 'plan-1',
        action_type: 'note',
        content: 'legacy fields are not supported',
        action_date: '2026-04-16',
      })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('allows status progression after all acceptance requirements are met', async () => {
    state.requirements[0].status = 'met'
    state.requirements[0].is_satisfied = true

    const response = await supertest(buildApp())
      .patch('/api/acceptance-plans/plan-1/status')
      .send({ status: 'submitted' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('submitted')
    expect(findTargetPlanStatus()).toBe('submitted')
  })

  it('returns conflict when PATCH status is stale after a concurrent acceptance transition', async () => {
    state.requirements[0].status = 'met'
    state.requirements[0].is_satisfied = true
    state.executeSQL.mockImplementationOnce(async () => {
      const plan = state.plans.find((row) => row.id === 'plan-1')!
      plan.status = 'submitted'
      return []
    })

    const response = await supertest(buildApp())
      .patch('/api/acceptance-plans/plan-1/status')
      .send({ status: 'submitted' })
      .expect(409)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('ACCEPTANCE_STATUS_CONFLICT')
  })

  it('returns conflict when PATCH status carries a stale expected status even if the target status is already current', async () => {
    const plan = state.plans.find((row) => row.id === 'plan-1')!
    plan.status = 'preparing'

    const response = await supertest(buildApp())
      .patch('/api/acceptance-plans/plan-1/status')
      .send({ status: 'preparing', expected_status: 'draft' })
      .expect(409)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('ACCEPTANCE_STATUS_CONFLICT')
    expect(findTargetPlanStatus()).toBe('preparing')
  })

  it('keeps PATCH status successful when post-commit task sync fails', async () => {
    state.requirements[0].status = 'met'
    state.requirements[0].is_satisfied = true
    state.syncCanonicalTaskFromAcceptancePlan.mockRejectedValueOnce(new Error('task sync failed after status write'))

    const response = await supertest(buildApp())
      .patch('/api/acceptance-plans/plan-1/status')
      .send({ status: 'submitted' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('submitted')
    expect(findTargetPlanStatus()).toBe('submitted')
  })

  it('returns conflict when PUT status is stale after a concurrent acceptance transition', async () => {
    state.requirements[0].status = 'met'
    state.requirements[0].is_satisfied = true
    state.executeSQL.mockImplementationOnce(async () => {
      const plan = state.plans.find((row) => row.id === 'plan-1')!
      plan.status = 'ready_to_submit'
      return []
    })

    const response = await supertest(buildApp())
      .put('/api/acceptance-plans/plan-1')
      .send({ status: 'ready_to_submit' })
      .expect(409)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('ACCEPTANCE_STATUS_CONFLICT')
  })

  it('records rectifying acceptance pass as quality rectification sample health only', async () => {
    const plan = state.plans.find((row) => row.id === 'plan-1')!
    plan.status = 'rectifying'
    plan.actual_date = null
    state.requirements[0].status = 'met'
    state.requirements[0].is_satisfied = true

    const response = await supertest(buildApp())
      .patch('/api/acceptance-plans/plan-1/status')
      .send({ status: 'passed', actual_date: '2026-05-08' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('passed')

    const sampleHealthInserts = executeSqlCalls().filter(([sql]) =>
      String(sql).toLowerCase().includes('insert into public.algorithm_sample_health_events')
    )
    expect(sampleHealthInserts).toHaveLength(1)
    expect(sampleHealthInserts[0]?.[1]).toEqual([
      'quality_rectification:plan-1',
      'business_completion.sample_health',
      'businessCompletionSampleHealthAdapterService',
      'project',
      'company-1',
      'project-1',
      'governance_report',
      'governed_candidate',
      'accepted',
      null,
      null,
      expect.objectContaining({
        workCode: 'quality_rectification:主体结构验收',
        benchmarkEligible: false,
        candidateEvidenceEligible: true,
        nonDurationBusinessCompletionSample: true,
        domain: 'quality_rectification',
        businessCode: '主体结构验收',
        rectificationId: 'plan-1',
        rectificationCode: '主体结构验收',
        acceptancePlanId: 'plan-1',
        sourceRoute: 'acceptance-plans.patch-status',
        previousStatus: 'rectifying',
        nextStatus: 'passed',
      }),
      [],
    ])

    const sqlText = joinedSqlText()
    expect(sqlText).not.toContain('standard_work_duration')
    expect(sqlText).not.toContain('algorithm_seed_records')
    expect(sqlText).not.toContain('algorithm_seed_overrides')
    expect(sqlText).not.toContain('algorithm_learnable_parameter_runtime_publications')
    expect(sqlText).not.toContain('policy_template_entity_runtime_publications')
  })

  it('requires building_object_id for building scoped acceptance plans', async () => {
    const response = await supertest(buildApp())
      .post('/api/acceptance-plans')
      .send({
        project_id: 'project-1',
        acceptance_name: '楼栋验收',
        type_id: 'pre_acceptance',
        type_name: 'pre acceptance',
        planned_date: '2026-05-02',
        scope_level: 'building',
        building_id: 'manual-building-code',
        status: 'draft',
      })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('BUILDING_OBJECT_REQUIRED')
  })

  it('backfills building_id from the selected building object', async () => {
    const response = await supertest(buildApp())
      .post('/api/acceptance-plans')
      .send({
        project_id: 'project-1',
        acceptance_name: '楼栋验收',
        type_id: 'pre_acceptance',
        type_name: 'pre acceptance',
        planned_date: '2026-05-02',
        scope_level: 'building',
        building_id: 'manual-building-code',
        building_object_id: 'building-1',
        status: 'draft',
      })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      acceptance_name: '楼栋验收',
      scope_level: 'building',
      building_object_id: 'building-1',
      building_id: 'B-001',
    })
  })

  it('rejects acceptance task references outside the current project', async () => {
    const response = await supertest(buildApp())
      .post('/api/acceptance-plans')
      .send({
        project_id: 'project-1',
        acceptance_name: 'linked task acceptance',
        type_id: 'pre_acceptance',
        type_name: 'pre acceptance',
        planned_date: '2026-05-03',
        covered_task_ids: ['task-1', 'task-other-project'],
        status: 'draft',
      })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('TASK_PROJECT_MISMATCH')
    expect(response.body.error.details.invalidTaskIds).toContain('task-other-project')
  })

  it('rejects acceptance dependencies that reference plans outside the current project', async () => {
    const response = await supertest(buildApp())
      .post('/api/acceptance-dependencies')
      .send({
        project_id: 'project-1',
        source_plan_id: 'plan-source',
        target_plan_id: 'plan-other-project',
        dependency_kind: 'hard',
      })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('PLAN_PROJECT_MISMATCH')
    expect(response.body.error.details.invalidPlanIds).toContain('plan-other-project')
  })

  it('rejects acceptance requirements that reference plans outside the current project', async () => {
    const response = await supertest(buildApp())
      .post('/api/acceptance-requirements')
      .send({
        project_id: 'project-1',
        plan_id: 'plan-other-project',
        requirement_type: 'drawing',
      })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('PLAN_PROJECT_MISMATCH')
    expect(response.body.error.details.invalidPlanIds).toContain('plan-other-project')
  })

  it('rejects acceptance records that reference plans outside the current project', async () => {
    const response = await supertest(buildApp())
      .post('/api/acceptance-records')
      .send({
        project_id: 'project-1',
        plan_id: 'plan-other-project',
        record_type: 'note',
        content: 'cross project record',
      })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('PLAN_PROJECT_MISMATCH')
  })

  it('filters acceptance list by overlay tag using the normalized flow model', async () => {
    const response = await supertest(buildApp())
      .get('/api/acceptance-plans')
      .query({ projectId: 'project-1', overlayTag: '资料缺失' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]).toMatchObject({
      id: 'plan-1',
    })
    expect(response.body.data[0].overlay_tags).toContain('资料缺失')
  })

  it('exposes the shared flow snapshot route for frontend consumption', async () => {
    const response = await supertest(buildApp())
      .get('/api/acceptance-plans/flow-snapshot')
      .query({ projectId: 'project-1' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.plans).toHaveLength(2)
    expect(response.body.data.dependencies).toHaveLength(1)
    expect(response.body.data.requirements).toHaveLength(1)
    expect(response.body.data.records).toHaveLength(1)
    expect(response.body.data.dependencies[0]).toMatchObject({
      source_plan_id: 'plan-source',
      target_plan_id: 'plan-1',
      dependency_kind: 'hard',
    })
  })

  it('invalidates the shared flow snapshot after acceptance plan status changes', async () => {
    state.requirements[0].status = 'met'
    state.requirements[0].is_satisfied = true
    const app = buildApp()

    const before = await supertest(app)
      .get('/api/acceptance-plans/flow-snapshot')
      .query({ projectId: 'project-1' })
      .expect(200)

    expect(before.body.data.plans.find((plan: PlanRow) => plan.id === 'plan-1')).toMatchObject({
      status: 'preparing',
    })

    await supertest(app)
      .patch('/api/acceptance-plans/plan-1/status')
      .send({ status: 'submitted' })
      .expect(200)

    const after = await supertest(app)
      .get('/api/acceptance-plans/flow-snapshot')
      .query({ projectId: 'project-1' })
      .expect(200)

    expect(after.body.data.plans.find((plan: PlanRow) => plan.id === 'plan-1')).toMatchObject({
      status: 'submitted',
    })
  })
})
