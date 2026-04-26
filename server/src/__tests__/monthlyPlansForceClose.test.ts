import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type TableName = 'monthly_plans' | 'monthly_plan_items' | 'planning_governance_states' | 'projects' | 'project_members'
type Row = Record<string, any>

const state = vi.hoisted(() => {
  const tables: Record<TableName, Row[]> = {
    monthly_plans: [],
    monthly_plan_items: [],
    planning_governance_states: [],
    projects: [],
    project_members: [],
  }

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value))
  }

  function matchesFilters(row: Row, filters: Array<{ column: string; value: unknown }>) {
    return filters.every((filter) => row[filter.column] === filter.value)
  }

  class QueryBuilder {
    private table: TableName
    private filters: Array<{ column: string; value: unknown }> = []
    private mode: 'select' | 'update' | 'delete' = 'select'
    private payload: any = null
    private limitCount: number | null = null

    constructor(table: string) {
      this.table = table as TableName
    }

    select() {
      return this
    }

    eq(column: string, value: unknown) {
      this.filters.push({ column, value })
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
      const rows = state.tables[this.table] ?? []
      if (this.mode === 'update') {
        const matched = rows.filter((row) => matchesFilters(row, this.filters))
        const updated = matched.map((row) => Object.assign(row, clone(this.payload)))
        return { data: updated.map((row) => clone(row)), error: null }
      }

      if (this.mode === 'delete') {
        const removed = rows.filter((row) => matchesFilters(row, this.filters))
        state.tables[this.table] = rows.filter((row) => !matchesFilters(row, this.filters))
        return { data: removed.map((row) => clone(row)), error: null }
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
    projectRole: 'owner',
    currentUserId: 'owner-1',
    existingLock: null as Record<string, any> | null,
    acquiredLock: null as Record<string, any> | null,
    unlockedLock: null as Record<string, any> | null,
    draftLockError: null as Error | null,
    supabase: {
      from: vi.fn((table: string) => new QueryBuilder(table)),
    },
    syncProjectDataQuality: vi.fn(async () => ({
      confidence: {
        score: 91,
        flag: 'high',
        note: 'smoke-test',
      },
    })),
    writeLog: vi.fn(),
    scanProjectGovernance: vi.fn(),
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: state.currentUserId }
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

vi.mock('../services/planningGovernanceService.js', () => ({
  planningGovernanceService: {
    scanProjectGovernance: state.scanProjectGovernance,
  },
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: {
    syncProjectDataQuality: state.syncProjectDataQuality,
  },
}))

vi.mock('../services/planningDraftLockService.js', () => ({
  PlanningDraftLockServiceError: class extends Error {
    code: string
    statusCode: number

    constructor(code: 'LOCK_HELD' | 'LOCK_EXPIRED' | 'FORBIDDEN' | 'NOT_FOUND', message: string, statusCode = 409) {
      super(message)
      this.code = code
      this.statusCode = statusCode
    }
  },
  PlanningDraftLockService: class {
    async getProjectRole() {
      return state.projectRole
    }
    async getDraftLock() {
      return state.existingLock
    }
    async acquireDraftLock() {
      if (state.draftLockError) throw state.draftLockError
      return state.acquiredLock
    }
    async releaseDraftLock() {
      if (state.draftLockError) throw state.draftLockError
      return state.unlockedLock
    }
    async forceUnlockDraftLock() {
      if (state.draftLockError) throw state.draftLockError
      return state.unlockedLock
    }
    async cleanupMonthlyPlanDraft() {
      return
    }
  },
}))

const { PlanningDraftLockServiceError } = await import('../services/planningDraftLockService.js')
const { default: monthlyPlansRouter } = await import('../routes/monthly-plans.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/monthly-plans', monthlyPlansRouter)
  return app
}

describe('monthly plan force-close route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.projectRole = 'owner'
    state.currentUserId = 'owner-1'
    state.existingLock = null
    state.acquiredLock = null
    state.unlockedLock = null
    state.draftLockError = null
    for (const table of Object.keys(state.tables) as TableName[]) {
      state.tables[table].splice(0, state.tables[table].length)
    }

    state.tables.monthly_plans.push({
      id: 'plan-1',
      project_id: 'project-1',
      version: 6,
      status: 'confirmed',
      month: '2026-04',
      title: '2026-04 月度计划',
      closeout_at: null,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.tables.projects.push({
      id: 'project-1',
      owner_id: 'owner-1',
    })
    state.tables.monthly_plan_items.push({
      id: 'plan-item-1',
      project_id: 'project-1',
      monthly_plan_version_id: 'plan-1',
      title: '收尾事项',
      sort_order: 1,
    })
    state.tables.planning_governance_states.push({
      id: 'gov-1',
      project_id: 'project-1',
      kind: 'closeout_force_unlock',
      status: 'active',
      source_entity_id: 'plan-1',
    })
  })

  it('allows owners to force-close when the governance unlock is active', async () => {
    const response = await supertest(buildApp()).post('/api/monthly-plans/plan-1/force-close')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: 'plan-1',
      status: 'closed',
    })
    expect(state.tables.monthly_plans[0].status).toBe('closed')
    expect(state.writeLog).toHaveBeenCalled()
    expect(state.scanProjectGovernance).toHaveBeenCalledWith('project-1')
  })

  it('rejects force-close for non-owner users', async () => {
    state.projectRole = 'pm'
    state.currentUserId = 'member-1'

    const response = await supertest(buildApp()).post('/api/monthly-plans/plan-1/force-close')

    expect(response.status).toBe(403)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('rejects force-close before the unlock threshold is reached', async () => {
    state.tables.planning_governance_states.splice(0, state.tables.planning_governance_states.length)

    const response = await supertest(buildApp()).post('/api/monthly-plans/plan-1/force-close')

    expect(response.status).toBe(409)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('INVALID_STATE')
  })

  it('returns the current draft lock and supports force-unlock through the monthly plan routes', async () => {
    state.existingLock = {
      id: 'lock-1',
      project_id: 'project-1',
      draft_type: 'monthly_plan',
      resource_id: 'plan-1',
      is_locked: true,
    }
    state.unlockedLock = {
      id: 'lock-1',
      project_id: 'project-1',
      draft_type: 'monthly_plan',
      resource_id: 'plan-1',
      is_locked: false,
      release_reason: 'manual_release',
    }

    const request = supertest(buildApp())
    const lockResponse = await request.get('/api/monthly-plans/plan-1/lock')
    expect(lockResponse.status).toBe(200)
    expect(lockResponse.body.data.lock).toMatchObject({
      id: 'lock-1',
      resource_id: 'plan-1',
      is_locked: true,
    })

    const unlockResponse = await request
      .post('/api/monthly-plans/plan-1/force-unlock')
      .send({ reason: 'manual_release' })
    expect(unlockResponse.status).toBe(200)
    expect(unlockResponse.body.data.lock).toMatchObject({
      id: 'lock-1',
      is_locked: false,
      release_reason: 'manual_release',
    })
  })

  it('maps draft lock service conflicts and batch guard failures to validation responses', async () => {
    state.draftLockError = new PlanningDraftLockServiceError('LOCK_HELD', '草稿锁被其他成员占用', 409)

    const request = supertest(buildApp())
    const lockResponse = await request.post('/api/monthly-plans/plan-1/lock')
    expect(lockResponse.status).toBe(409)
    expect(lockResponse.body.error.code).toBe('LOCK_HELD')

    state.tables.monthly_plans[0].status = 'draft'
    const batchResponse = await request
      .post('/api/monthly-plans/plan-1/items/batch-target-progress')
      .send({ target_progress: 65 })
    expect(batchResponse.status).toBe(400)
    expect(batchResponse.body.error.code).toBe('VALIDATION_ERROR')
    expect(batchResponse.body.error.message).toContain('未命中任何月度计划条目')
  })

  it('revokes draft monthly plans through the new revoke route and removes the draft rows', async () => {
    state.tables.monthly_plans.push({
      id: 'plan-draft',
      project_id: 'project-1',
      version: 7,
      status: 'draft',
      month: '2026-05',
      title: '2026-05 月度计划',
      created_at: '2026-04-10T00:00:00.000Z',
      updated_at: '2026-04-10T00:00:00.000Z',
    })
    state.tables.monthly_plan_items.push(
      {
        id: 'plan-draft-item-1',
        project_id: 'project-1',
        monthly_plan_version_id: 'plan-draft',
        title: '临建收尾',
        sort_order: 1,
      },
      {
        id: 'plan-draft-item-2',
        project_id: 'project-1',
        monthly_plan_version_id: 'plan-draft',
        title: '资料补录',
        sort_order: 2,
      },
    )

    const response = await supertest(buildApp())
      .post('/api/monthly-plans/plan-draft/revoke')
      .send({ version: 7, reason: '重新生成草稿' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: 'plan-draft',
      status: 'revoked',
      version: 7,
      removed_item_count: 2,
    })
    expect(state.tables.monthly_plans.some((row) => row.id === 'plan-draft')).toBe(false)
    expect(state.tables.monthly_plan_items.some((row) => row.monthly_plan_version_id === 'plan-draft')).toBe(false)
    expect(state.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: 'plan-draft',
        old_value: 'draft',
        new_value: 'revoked',
        change_reason: '重新生成草稿',
      }),
    )
  })

  it('keeps a void alias for revoke and blocks confirmed plans from using it', async () => {
    state.tables.monthly_plans.push({
      id: 'plan-revising',
      project_id: 'project-1',
      version: 8,
      status: 'revising',
      month: '2026-06',
      title: '2026-06 月度计划修订',
      created_at: '2026-04-10T00:00:00.000Z',
      updated_at: '2026-04-10T00:00:00.000Z',
    })

    const request = supertest(buildApp())
    const aliasResponse = await request
      .post('/api/monthly-plans/plan-revising/void')
      .send({ version: 8 })
    expect(aliasResponse.status).toBe(200)
    expect(aliasResponse.body.data.status).toBe('revoked')

    const blockedResponse = await request
      .post('/api/monthly-plans/plan-1/revoke')
      .send({ version: 6 })
    expect(blockedResponse.status).toBe(409)
    expect(blockedResponse.body.error.code).toBe('INVALID_STATE')
  })
})
