import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const mocks = vi.hoisted(() => {
  let conditionWarnings: any[] = []
  let obstacleWarnings: any[] = []
  let acceptanceWarnings: any[] = []
  let delayExceededWarnings: any[] = []
  let preMilestoneWarnings: any[] = []
  let persistedWarningRecord: any = null

  const warningServiceInstance = {
    scanConditionWarnings: vi.fn(async () => conditionWarnings),
    scanObstacleWarnings: vi.fn(async () => obstacleWarnings),
    scanAcceptanceWarnings: vi.fn(async () => acceptanceWarnings),
    scanDelayExceededWarnings: vi.fn(async () => delayExceededWarnings),
    scanPreMilestoneWarnings: vi.fn(async () => preMilestoneWarnings),
    acknowledgeWarning: vi.fn(async () => ({ id: 'warning-1' })),
    muteWarning: vi.fn(async () => ({ id: 'warning-1' })),
    confirmWarningAsRisk: vi.fn(async () => ({ id: 'risk-1' })),
    syncConditionExpiredIssues: vi.fn(async () => undefined),
    syncAcceptanceExpiredIssues: vi.fn(async () => undefined),
    autoEscalateWarnings: vi.fn(async () => undefined),
    autoEscalateRisksToIssues: vi.fn(async () => undefined),
    syncActiveWarnings: vi.fn(async () => [
      ...conditionWarnings,
      ...obstacleWarnings,
      ...acceptanceWarnings,
      ...delayExceededWarnings,
      ...preMilestoneWarnings,
    ]),
    generateNotifications: vi.fn(async () => []),
  }

  return {
    warningServiceInstance,
    setConditionWarnings(list: any[]) {
      conditionWarnings = list
    },
    setObstacleWarnings(list: any[]) {
      obstacleWarnings = list
    },
    setAcceptanceWarnings(list: any[]) {
      acceptanceWarnings = list
    },
    setDelayExceededWarnings(list: any[]) {
      delayExceededWarnings = list
    },
    setPreMilestoneWarnings(list: any[]) {
      preMilestoneWarnings = list
    },
    executeSQL: vi.fn(async () => []),
    executeSQLOne: vi.fn(async () => ({ cnt: 0 })),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    upgradeChain: {
      applyWarningAcknowledgments: vi.fn((warnings: any[]) => warnings),
      isProtectedWarning: vi.fn(() => false),
      loadAcknowledgedWarningsForUser: vi.fn(async () => []),
      closeWarningNotification: vi.fn(async (id: string) => (
        persistedWarningRecord
          ? { ...persistedWarningRecord, id, status: 'closed', resolved_source: 'manual_closed' }
          : null
      )),
    },
    setPersistedWarningRecord(record: any) {
      persistedWarningRecord = record
    },
    getPersistedWarningRecord() {
      return persistedWarningRecord
    },
  }
})

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => mocks.warningServiceInstance),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => {
      const filters = new Map<string, unknown>()
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          filters.set(column, value)
          return builder
        }),
        in: vi.fn(() => builder),
        upsert: vi.fn(async () => ({ data: null, error: null })),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
      }

      builder.single = vi.fn(async () => {
        const persisted = mocks.getPersistedWarningRecord()
        if (!persisted) {
          return { data: null, error: { code: 'PGRST116' } }
        }
        const matches = Array.from(filters.entries()).every(([column, value]) => persisted?.[column] === value)
        return matches
          ? { data: { ...persisted }, error: null }
          : { data: null, error: { code: 'PGRST116' } }
      })

      return builder
    }),
  },
  SupabaseService: vi.fn(),
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  getProjects: vi.fn(async () => []),
  getProject: vi.fn(async () => null),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getRisks: vi.fn(async () => []),
  getRisk: vi.fn(async () => null),
  createRisk: vi.fn(),
  updateRisk: vi.fn(),
  deleteRisk: vi.fn(),
  getTasks: vi.fn(async () => []),
  getTask: vi.fn(async () => null),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getMilestones: vi.fn(async () => []),
  getMilestone: vi.fn(async () => null),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  getMembers: vi.fn(async () => []),
  createMember: vi.fn(),
  updateMember: vi.fn(),
  deleteMember: vi.fn(),
  getInvitations: vi.fn(async () => []),
  createInvitation: vi.fn(),
  updateInvitation: vi.fn(),
  deleteInvitation: vi.fn(),
  validateInvitation: vi.fn(),
}))

vi.mock('../services/upgradeChainService.js', () => ({
  applyWarningAcknowledgments: mocks.upgradeChain.applyWarningAcknowledgments,
  isProtectedWarning: mocks.upgradeChain.isProtectedWarning,
  loadAcknowledgedWarningsForUser: mocks.upgradeChain.loadAcknowledgedWarningsForUser,
  closeWarningNotification: mocks.upgradeChain.closeWarningNotification,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: vi.fn((_req: any, _res: any, next: any) => next()),
}))

vi.mock('../middleware/auditLogger.js', () => ({
  auditLogger: vi.fn((_req: any, _res: any, next: any) => next()),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: 'user-1' }
    next()
  }),
  optionalAuthenticate: vi.fn((_req: any, _res: any, next: any) => next()),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  requireProjectOwner: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  checkResourceAccess: vi.fn((_req: any, _res: any, next: any) => next()),
}))

const { request } = await import('./testSetup.js')

describe('warnings route merge', () => {
  const projectId = 'project-1'

  beforeEach(() => {
    mocks.setConditionWarnings([])
    mocks.setObstacleWarnings([])
    mocks.setAcceptanceWarnings([])
    mocks.setDelayExceededWarnings([])
    mocks.setPreMilestoneWarnings([])
    mocks.setPersistedWarningRecord(null)
    vi.clearAllMocks()
  })

  it('includes pre-milestone warnings in the main warnings feed', async () => {
    mocks.setPreMilestoneWarnings([
      {
        id: 'permit-1',
        project_id: projectId,
        task_id: 'pre-1',
        warning_type: 'permit_expiry',
        warning_level: 'critical',
        title: '证照即将过期',
        description: '证照快到期了',
        is_acknowledged: false,
        created_at: '2026-04-13T08:00:00.000Z',
      },
    ])

    const res = await request.get(`/api/warnings?projectId=${projectId}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      warning_type: 'permit_expiry',
      task_id: 'pre-1',
    })
    expect(mocks.warningServiceInstance.syncActiveWarnings).toHaveBeenCalledWith(projectId)
    expect(mocks.warningServiceInstance.syncAcceptanceExpiredIssues).toHaveBeenCalledWith(projectId)
  })

  it('exposes a dedicated pre-milestone warning endpoint', async () => {
    mocks.setPreMilestoneWarnings([
      {
        id: 'permit-2',
        project_id: projectId,
        task_id: 'pre-2',
        warning_type: 'permit_expiry',
        warning_level: 'warning',
        title: '前置证照提醒',
        description: '还有 7 天到期',
        is_acknowledged: false,
        created_at: '2026-04-13T08:00:00.000Z',
      },
    ])

    const res = await request.get(`/api/warnings/pre-milestones?projectId=${projectId}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      warning_type: 'permit_expiry',
      task_id: 'pre-2',
    })
    expect(mocks.warningServiceInstance.scanPreMilestoneWarnings).toHaveBeenCalledWith(projectId)
  })

  it('accepts project_id alias and include_resolved alias in warning queries', async () => {
    mocks.setConditionWarnings([
      {
        id: 'warning-resolved-2',
        project_id: projectId,
        task_id: 'task-2',
        warning_type: 'condition_due',
        warning_level: 'warning',
        title: '别名查询',
        description: '别名路径',
        status: 'resolved',
        resolved_source: 'condition_satisfied',
        is_acknowledged: false,
        created_at: '2026-04-13T08:00:00.000Z',
      },
    ])

    const res = await request.get(`/api/warnings?project_id=${projectId}&include_resolved=1`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(1)
    expect(mocks.warningServiceInstance.syncActiveWarnings).toHaveBeenCalledWith(projectId)
  })

  it('rejects unsupported mute durations before calling the warning service', async () => {
    const res = await request.put('/api/warnings/warning-1/mute').send({ mute_hours: 2 })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(mocks.warningServiceInstance.muteWarning).not.toHaveBeenCalled()
  })

  it('keeps resolved_source in the warnings api payload for resolved warnings', async () => {
    mocks.setConditionWarnings([
      {
        id: 'warning-resolved-1',
        project_id: projectId,
        task_id: 'task-1',
        warning_type: 'condition_due',
        warning_level: 'warning',
        title: '条件已恢复',
        description: '来源已解除',
        status: 'resolved',
        resolved_source: 'condition_satisfied',
        is_acknowledged: true,
        created_at: '2026-04-13T08:00:00.000Z',
      },
    ])

    const res = await request.get(`/api/warnings?projectId=${projectId}&includeResolved=1`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      id: 'warning-resolved-1',
      status: 'resolved',
      resolved_source: 'condition_satisfied',
    })
  })

  it('closes warnings through the upgrade-chain close action so resolved_source is recorded', async () => {
    mocks.setPersistedWarningRecord({
      id: 'warning-close-1',
      project_id: projectId,
      source_entity_type: 'warning',
      status: 'active',
    })

    const res = await request.delete('/api/warnings/warning-close-1')

    expect(res.status).toBe(200)
    expect(mocks.upgradeChain.closeWarningNotification).toHaveBeenCalledWith('warning-close-1')
  })
})
