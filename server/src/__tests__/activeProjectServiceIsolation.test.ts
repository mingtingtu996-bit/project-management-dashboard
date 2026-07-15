import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(async () => [
    { id: '00000000-0000-0000-0000-000000000001', status: 'active' },
    { id: '00000000-0000-0000-0000-000000000002', status: 'active' },
  ]),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

const { listActiveProjectIds } = await import('../services/activeProjectService.js')

describe('active project service isolation', () => {
  beforeEach(() => {
    mocks.executeSQL.mockClear()
  })

  it('pushes an explicit project scope into the database query', async () => {
    const projectId = '00000000-0000-0000-0000-000000000001'

    const result = await listActiveProjectIds([projectId])

    expect(result).toEqual([projectId])
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringMatching(/where\s+id\s*=\s*any\(\?::uuid\[\]\)/i),
      [[projectId]],
    )
  })

  it('short-circuits an explicitly empty scope without reading all projects', async () => {
    await expect(listActiveProjectIds([])).resolves.toEqual([])
    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })
})
