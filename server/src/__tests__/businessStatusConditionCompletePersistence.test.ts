import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

const { BusinessStatusService } = await import('../services/businessStatusService.js')

describe('BusinessStatusService condition completion persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes a PostgreSQL boolean instead of an integer sentinel', async () => {
    mocks.executeSQLOne
      .mockResolvedValueOnce({
        id: 'condition-1',
        project_id: 'project-1',
        is_satisfied: false,
      })
      .mockResolvedValueOnce({
        id: 'condition-1',
        project_id: 'project-1',
        is_satisfied: true,
      })
    mocks.executeSQL.mockResolvedValueOnce([])

    await expect(BusinessStatusService.completeCondition({
      id: 'condition-1',
      project_id: 'project-1',
      confirmed_by: 'user-1',
    })).resolves.toMatchObject({ id: 'condition-1', is_satisfied: true })

    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('SET is_satisfied = ?'),
      [true, 'user-1', expect.any(String), 'condition-1', 'project-1'],
    )
  })
})
