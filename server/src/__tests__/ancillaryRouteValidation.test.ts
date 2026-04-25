import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

type PreMilestoneConditionRow = {
  id: string
  pre_milestone_id: string
  condition_type: string
  condition_name: string
  description: string | null
  status: string
  created_at: string
}

type PreMilestoneDependencyRow = {
  id: string
  project_id: string | null
  source_milestone_id: string
  target_milestone_id: string
  dependency_kind: string
  created_at: string
}

type PreMilestoneRow = {
  id: string
  project_id: string
  name: string
  milestone_type: string
  status: string
}

const state = vi.hoisted(() => {
  const preMilestoneConditions: PreMilestoneConditionRow[] = []
  const preMilestoneDependencies: PreMilestoneDependencyRow[] = []
  const preMilestones: PreMilestoneRow[] = []

  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()
  const includesSql = (sql: string, fragment: string) => sql.includes(fragment)
  const clone = <T>(row: T | undefined) => (row ? JSON.parse(JSON.stringify(row)) as T : null)

  const reset = () => {
    preMilestoneConditions.splice(0, preMilestoneConditions.length)
    preMilestoneDependencies.splice(0, preMilestoneDependencies.length)
    preMilestones.splice(0, preMilestones.length)

    preMilestoneConditions.push({
      id: 'condition-1',
      pre_milestone_id: 'pre-1',
      condition_type: 'document',
      condition_name: '营业执照',
      description: null,
      status: '待处理',
      created_at: '2026-04-10T00:00:00.000Z',
    })

    preMilestones.push(
      {
        id: 'pre-1',
        project_id: 'project-1',
        name: '施工许可证',
        milestone_type: 'permit',
        status: '进行中',
      },
      {
        id: 'pre-2',
        project_id: 'project-1',
        name: '用地规划许可',
        milestone_type: 'permit',
        status: '待处理',
      },
    )

    preMilestoneDependencies.push({
      id: 'dependency-1',
      project_id: 'project-1',
      source_milestone_id: 'pre-1',
      target_milestone_id: 'pre-2',
      dependency_kind: 'hard',
      created_at: '2026-04-10T00:00:00.000Z',
    })
  }

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (includesSql(normalized, 'from pre_milestone_conditions where id = ? limit 1')) {
      return clone(preMilestoneConditions.find((row) => row.id === String(params[0] ?? '')))
    }

    if (includesSql(normalized, 'from pre_milestone_dependencies where id = ? limit 1')) {
      return clone(preMilestoneDependencies.find((row) => row.id === String(params[0] ?? '')))
    }

    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized === 'select * from pre_milestone_conditions where pre_milestone_id = ? order by created_at asc') {
      return preMilestoneConditions
        .filter((row) => row.pre_milestone_id === String(params[0] ?? ''))
        .map((row) => clone(row))
        .filter(Boolean)
    }

    if (normalized === 'select id, name, milestone_type, status from pre_milestones where project_id = ?') {
      return preMilestones
        .filter((row) => row.project_id === String(params[0] ?? ''))
        .map((row) => clone(row))
        .filter(Boolean)
    }

    if (includesSql(normalized, 'from pre_milestone_dependencies where source_milestone_id in (')) {
      const milestoneIds = params.map((item) => String(item ?? ''))
      return preMilestoneDependencies
        .filter((row) => milestoneIds.includes(row.source_milestone_id))
        .map((row) => clone(row))
        .filter(Boolean)
    }

    return []
  })

  return {
    executeSQL,
    executeSQLOne,
    preMilestoneConditions,
    preMilestoneDependencies,
    preMilestones,
    reset,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
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
  getTask: vi.fn(async () => null),
  updateTask: vi.fn(async () => null),
}))

const { default: preMilestoneConditionsRouter } = await import('../routes/pre-milestone-conditions.js')
const { default: preMilestoneDependenciesRouter } = await import('../routes/pre-milestone-dependencies.js')
const { errorHandler } = await import('../middleware/errorHandler.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/pre-milestone-conditions', preMilestoneConditionsRouter)
  app.use('/api/pre-milestone-dependencies', preMilestoneDependenciesRouter)
  app.use(errorHandler)
  return app
}

describe('ancillary route validation hardening', () => {
  beforeEach(() => {
    state.reset()
    vi.clearAllMocks()
  })

  it('accepts pre-milestone condition alias query without breaking existing reads', async () => {
    const response = await supertest(buildApp())
      .get('/api/pre-milestone-conditions')
      .query({ pre_milestone_id: 'pre-1' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]).toMatchObject({
      id: 'condition-1',
      pre_milestone_id: 'pre-1',
      condition_name: '营业执照',
    })
  })

  it('keeps pre-milestone condition batch validation on required arrays', async () => {
    const response = await supertest(buildApp())
      .post('/api/pre-milestone-conditions/batch')
      .send({ pre_milestone_id: 'pre-1' })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns pre-milestone dependency graph for project reads', async () => {
    const response = await supertest(buildApp())
      .get('/api/pre-milestone-dependencies/project/project-1')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(2)
    expect(response.body.data[0].dependencies).toHaveLength(1)
    expect(response.body.data[0].dependencies[0]).toMatchObject({
      id: 'dependency-1',
      source_milestone_id: 'pre-1',
      target_milestone_id: 'pre-2',
    })
  })

  it('keeps pre-milestone dependency create validation on required milestone ids', async () => {
    const response = await supertest(buildApp())
      .post('/api/pre-milestone-dependencies')
      .send({ source_milestone_id: 'pre-1' })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })
})
