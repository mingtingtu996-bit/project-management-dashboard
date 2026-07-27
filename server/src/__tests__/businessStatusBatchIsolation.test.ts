import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

describe('BusinessStatusService batch isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tasks')) {
        return [{
          id: 'task-a',
          project_id: 'project-a',
          status: '未开始',
          progress: 0,
          ready_for_start: true,
          blocked_for_progress: false,
        }]
      }
      return []
    })
  })

  it('requires a project scope and never queries child facts for foreign task ids', async () => {
    const { BusinessStatusService } = await import('../services/businessStatusService.js')

    const result = await BusinessStatusService.calculateBatchBusinessStatus(
      'project-a',
      ['task-a', 'task-foreign'],
    )

    expect(result.has('task-a')).toBe(true)
    const calls = mocks.executeSQL.mock.calls as Array<[string, unknown[]]>
    expect(calls[0][0]).toMatch(/FROM tasks[\s\S]*WHERE project_id = \?[\s\S]*id IN/)
    expect(calls[0][1]).toEqual(['project-a', 'task-a', 'task-foreign'])
    for (const [sql, params] of calls.slice(1)) {
      if (!sql.includes('task_conditions') && !sql.includes('task_obstacles')) continue
      expect(params).toEqual(['task-a'])
      expect(params).not.toContain('task-foreign')
    }
  })
})
