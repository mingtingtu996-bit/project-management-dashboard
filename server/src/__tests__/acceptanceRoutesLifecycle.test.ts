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

const state = vi.hoisted(() => {
  const plans: PlanRow[] = []
  const dependencies: DependencyRow[] = []
  const requirements: RequirementRow[] = []
  const records: RecordRow[] = []

  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()
  const includesSql = (sql: string, fragment: string) => sql.includes(fragment)
  const clone = <T>(row: T | undefined) => (row ? JSON.parse(JSON.stringify(row)) as T : null)

  const reset = () => {
    plans.splice(0, plans.length)
    dependencies.splice(0, dependencies.length)
    requirements.splice(0, requirements.length)
    records.splice(0, records.length)

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

    requirements.push({
      id: 'requirement-1',
      project_id: 'project-1',
      plan_id: 'plan-1',
      requirement_type: 'drawing',
      source_entity_type: 'drawing_package',
      source_entity_id: 'drawing-1',
      drawing_package_id: 'drawing-1',
      description: '施工图尚未归档',
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

    if (includesSql(normalized, 'from acceptance_plans where id = ? limit 1')) {
      return clone(plans.find((row) => row.id === String(params[0] ?? '')))
    }

    if (includesSql(normalized, 'from acceptance_requirements where id = ? limit 1')) {
      return clone(requirements.find((row) => row.id === String(params[0] ?? '')))
    }

    if (includesSql(normalized, 'from acceptance_records where id = ? limit 1')) {
      return clone(records.find((row) => row.id === String(params[0] ?? '')))
    }

    if (normalized === 'select id from users where id = ? limit 1') {
      const id = String(params[0] ?? '')
      return id ? { id } : null
    }

    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (includesSql(normalized, 'from acceptance_requirements where plan_id = ? order by created_at asc')) {
      return requirements
        .filter((row) => row.plan_id === String(params[0] ?? ''))
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

    if (normalized === 'delete from acceptance_requirements where id = ?') {
      const id = String(params[0] ?? '')
      const index = requirements.findIndex((row) => row.id === id)
      if (index !== -1) requirements.splice(index, 1)
      return []
    }

    if (normalized === 'delete from acceptance_records where id = ?') {
      const id = String(params[0] ?? '')
      const index = records.findIndex((row) => row.id === id)
      if (index !== -1) records.splice(index, 1)
      return []
    }

    if (normalized.startsWith('update acceptance_plans set ') && normalized.endsWith(' where id = ?')) {
      const setClause = normalized.slice('update acceptance_plans set '.length, -' where id = ?'.length)
      const fields = setClause.split(', ').map((fragment) => fragment.replace(' = ?', ''))
      const values = params.slice(0, -1)
      const id = String(params[params.length - 1] ?? '')
      const plan = plans.find((row) => row.id === id)

      if (plan) {
        fields.forEach((field, index) => {
          ;(plan as Record<string, unknown>)[field] = values[index] ?? null
        })
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
    executeSQL,
    executeSQLOne,
    reset,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', role: 'owner', globalRole: 'company_admin' }
    next()
  }),
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

const { default: acceptanceDependenciesRouter } = await import('../routes/acceptance-dependencies.js')
const { default: acceptanceRequirementsRouter } = await import('../routes/acceptance-requirements.js')
const { default: acceptanceRecordsRouter } = await import('../routes/acceptance-records.js')
const { default: acceptancePlansRouter } = await import('../routes/acceptance-plans.js')
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
    vi.clearAllMocks()
  })

  function findTargetPlanStatus() {
    return state.plans.find((plan) => plan.id === 'plan-1')?.status
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
    expect(response.body.error.message).toContain('前置条件未满足')
    expect(response.body.error.message).toContain('已申报')
    expect(findTargetPlanStatus()).toBe('preparing')
  })

  it('blocks PUT status progression to ready_to_submit when acceptance requirements are still unmet', async () => {
    const response = await supertest(buildApp())
      .put('/api/acceptance-plans/plan-1')
      .send({ status: 'ready_to_submit' })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('PRECONDITION_NOT_MET')
    expect(response.body.error.message).toContain('前置条件未满足')
    expect(response.body.error.message).toContain('待申报')
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
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
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
        content: '旧字段不再兼容',
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
})
