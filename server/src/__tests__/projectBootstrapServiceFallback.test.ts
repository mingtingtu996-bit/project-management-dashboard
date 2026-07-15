import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  getProject: vi.fn(),
  getTasks: vi.fn(),
  getRisks: vi.fn(),
  getIssues: vi.fn(),
  listTaskProgressSnapshotsByTaskIds: vi.fn(),
  rawQuery: vi.fn(),
  logger: {
    warn: vi.fn(),
  },
  readActiveWarnings: vi.fn(),
  loadAcknowledgedWarningsForUser: vi.fn(),
  applyWarningAcknowledgments: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  getProject: mocks.getProject,
  getTasks: mocks.getTasks,
  getRisks: mocks.getRisks,
  getIssues: mocks.getIssues,
  listTaskProgressSnapshotsByTaskIds: mocks.listTaskProgressSnapshotsByTaskIds,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => ({
    readActiveWarnings: mocks.readActiveWarnings,
  })),
}))

vi.mock('../services/upgradeChainService.js', () => ({
  applyWarningAcknowledgments: mocks.applyWarningAcknowledgments,
  loadAcknowledgedWarningsForUser: mocks.loadAcknowledgedWarningsForUser,
}))

const { getProjectBootstrap, clearProjectBootstrapCache } = await import('../services/projectBootstrapService.js')

describe('projectBootstrapService read-path fallbacks', () => {
  const projectId = 'project-1'

  beforeEach(() => {
    vi.clearAllMocks()
    clearProjectBootstrapCache()
    mocks.getProject.mockResolvedValue({ id: projectId, name: '项目 A', status: '进行中' })
    mocks.getTasks.mockResolvedValue([{ id: 'task-1', project_id: projectId, title: '任务 A' }])
    mocks.getRisks.mockResolvedValue([])
    mocks.getIssues.mockResolvedValue([])
    mocks.listTaskProgressSnapshotsByTaskIds.mockResolvedValue([])
    mocks.readActiveWarnings.mockResolvedValue([])
    mocks.loadAcknowledgedWarningsForUser.mockResolvedValue([])
    mocks.applyWarningAcknowledgments.mockReturnValue([])
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_conditions')) return []
      if (sql.includes('task_obstacles')) {
        throw new Error('Query read timeout')
      }
      return []
    })
  })

  it('keeps the bootstrap payload usable when optional obstacle reads time out', async () => {
    const payload = await getProjectBootstrap(projectId, 'user-1')

    expect(payload).toMatchObject({
      project: { id: projectId },
      tasks: [{ id: 'task-1' }],
      obstacles: [],
    })
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[projectBootstrap] obstacle read skipped',
      expect.objectContaining({
        projectId,
        error: 'Query read timeout',
      }),
    )
  })
})
