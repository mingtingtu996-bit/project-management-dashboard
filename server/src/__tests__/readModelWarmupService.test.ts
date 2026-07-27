import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  query: vi.fn(),
  listActiveProjectIds: vi.fn(async () => ['project-1']),
  warmAcceptanceFlowSnapshot: vi.fn(async () => ({ projectId: 'project-1' })),
  legacyListActiveProjectIds: vi.fn(async () => ['legacy-project']),
  legacyAcceptanceFlowSnapshot: vi.fn(async () => ({ projectId: 'legacy-project' })),
  legacyExecuteSQL: vi.fn(async () => []),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../database.js', () => ({
  query: state.query,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: state.logger,
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: state.legacyListActiveProjectIds,
}))

vi.mock('../services/acceptanceFlowService.js', () => ({
  getAcceptanceFlowSnapshot: state.legacyAcceptanceFlowSnapshot,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.legacyExecuteSQL,
}))

describe('readModelWarmupService composition adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VITEST', 'false')
    vi.stubEnv('READ_MODEL_WARMUP_ENABLED', 'true')
    vi.stubEnv('READ_MODEL_WARMUP_PROJECT_LIMIT', '1')
    vi.stubEnv('READ_MODEL_WARMUP_TASK_LIMIT', '1')
    vi.stubEnv('READ_MODEL_WARMUP_PROJECT_IDS', '')
    vi.stubEnv('PROJECT_ID', '')

    state.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM public.projects')) throw new Error('project lookup unavailable')
      if (sql.includes('FROM public.tasks')) return { rows: [] }
      throw new Error(`Unexpected query: ${sql}`)
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses composition-root adapters for business project and acceptance reads', async () => {
    const {
      registerReadModelWarmupAdapters,
      runReadModelWarmup,
    } = await import('../services/readModelWarmupService.js')

    registerReadModelWarmupAdapters({
      listActiveProjectIds: state.listActiveProjectIds,
      warmAcceptanceFlowSnapshot: state.warmAcceptanceFlowSnapshot,
    } as any)

    await runReadModelWarmup()

    expect(state.listActiveProjectIds).toHaveBeenCalledTimes(1)
    expect(state.warmAcceptanceFlowSnapshot).toHaveBeenCalledWith('project-1')
    expect(state.legacyListActiveProjectIds).not.toHaveBeenCalled()
    expect(state.legacyAcceptanceFlowSnapshot).not.toHaveBeenCalled()
    expect(state.legacyExecuteSQL).not.toHaveBeenCalled()
  })
})
