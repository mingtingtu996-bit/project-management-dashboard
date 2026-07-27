import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  listTaskProgressSnapshotsByTaskIds: vi.fn(),
  rawQuery: vi.fn(),
  getCriticalPathTaskIds: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  listTaskProgressSnapshotsByTaskIds: mocks.listTaskProgressSnapshotsByTaskIds,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  getCriticalPathTaskIds: mocks.getCriticalPathTaskIds,
}))

import { PlanningIntegrityService } from '../services/planningIntegrityService.js'

describe('PlanningIntegrityService database concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listTaskProgressSnapshotsByTaskIds.mockResolvedValue([])
    mocks.getCriticalPathTaskIds.mockResolvedValue(new Set<string>())
  })

  it('loads one project sequentially so a four-connection pool keeps spare capacity', async () => {
    let active = 0
    let maxActive = 0

    mocks.executeSQL.mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return []
    })

    await new PlanningIntegrityService().scanProjectIntegrity('project-1')

    expect(mocks.executeSQL).toHaveBeenCalledTimes(5)
    expect(maxActive).toBe(1)
    const taskQuery = String(
      mocks.executeSQL.mock.calls.find((call) => /from\s+tasks\s+where\s+project_id/i.test(String(call[0])))?.[0] ?? '',
    )
    expect(taskQuery).not.toMatch(/select\s+\*/i)
    expect(taskQuery).toContain('participant_unit_id')
    expect(taskQuery).toContain('duration_contribution_mode')
    expect(taskQuery).toContain('functional_area_object_id')
  })
})
