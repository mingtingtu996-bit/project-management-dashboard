import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQLOne: vi.fn(),
  executeSQL: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQLOne: mocks.executeSQLOne,
  executeSQL: mocks.executeSQL,
}))

const { AIDurationService } = await import('../services/aiDurationService.js')

describe('AIDurationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an estimate when the ai_duration_estimates table is missing', async () => {
    mocks.executeSQLOne
      .mockResolvedValueOnce({
        id: 'task-1',
        task_type: '其他',
      })
      .mockResolvedValueOnce({
        id: 'project-1',
        total_area: 12000,
        building_count: 1,
        province: '上海',
        city: '上海',
      })

    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tasks')) return []
      if (sql.includes('INSERT INTO ai_duration_estimates')) {
        throw new Error("Could not find the table 'public.ai_duration_estimates' in the schema cache")
      }
      return []
    })

    const service = new AIDurationService()
    const estimate = await service.estimateDuration({
      task_id: 'task-1',
      project_id: 'project-1',
      historical_data: true,
    })

    expect(estimate.task_id).toBe('task-1')
    expect(estimate.project_id).toBe('project-1')
    expect(estimate.estimated_duration).toBeGreaterThan(0)
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_duration_estimates'),
      expect.any(Array),
    )
  })

  it('returns null confidence when the ai_duration_estimates table is missing', async () => {
    mocks.executeSQLOne.mockRejectedValue(
      new Error("Could not find the table 'public.ai_duration_estimates' in the schema cache"),
    )

    const service = new AIDurationService()
    await expect(service.getConfidence('task-1')).resolves.toBeNull()
  })
})
