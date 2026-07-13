import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  listTaskProgressSnapshotsByTaskIds: vi.fn(),
  getCriticalPathTaskIds: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  listTaskProgressSnapshotsByTaskIds: state.listTaskProgressSnapshotsByTaskIds,
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  getCriticalPathTaskIds: state.getCriticalPathTaskIds,
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: vi.fn(async () => []),
}))

vi.mock('../services/milestoneIntegrityService.js', () => ({
  evaluateMilestoneIntegrityRows: vi.fn((projectId: string) => ({
    project_id: projectId,
    summary: { total: 0, aligned: 0, needs_attention: 0, missing_data: 0, blocked: 0 },
    items: [],
  })),
}))

vi.mock('../services/systemAnomalyService.js', () => ({
  detectPassiveReorderWindows: vi.fn((projectId: string) => ({ project_id: projectId, windows: [] })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

const { PlanningIntegrityService } = await import('../services/planningIntegrityService.js')

describe('planning integrity runtime safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.executeSQL.mockResolvedValue([])
    state.listTaskProgressSnapshotsByTaskIds.mockResolvedValue([])
    state.getCriticalPathTaskIds.mockResolvedValue(new Set<string>())
  })

  it('reads only task fields used by integrity evaluation', async () => {
    await new PlanningIntegrityService().scanProjectIntegrity('project-1')

    const taskQuery = String(
      state.executeSQL.mock.calls.find(([query]) => String(query).includes('FROM tasks WHERE project_id = ?'))?.[0],
    )
    expect(taskQuery).not.toContain('SELECT *')
    expect(taskQuery).toContain('participant_unit_id')
    expect(taskQuery).toContain('specialty_type')
    expect(taskQuery).toContain('phase_id')
  })

  it('serializes database reads within a project scan', async () => {
    let active = 0
    let maxActive = 0
    const tracked = async <T>(value: T): Promise<T> => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return value
    }

    state.executeSQL.mockImplementation(async () => tracked([]))
    state.listTaskProgressSnapshotsByTaskIds.mockImplementation(async () => tracked([]))
    state.getCriticalPathTaskIds.mockImplementation(async () => tracked(new Set<string>()))

    await new PlanningIntegrityService().scanProjectIntegrity('project-1')

    expect(maxActive).toBe(1)
  })
})
