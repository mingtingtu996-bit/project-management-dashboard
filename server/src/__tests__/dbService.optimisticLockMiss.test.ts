import { afterEach, describe, expect, it, vi } from 'vitest'

import { supabase, updateProject, updateTask } from '../services/dbService.js'

function createSelectChain(row: unknown) {
  const chain = {
    eq: vi.fn(),
    single: vi.fn(async () => ({ data: row, error: null })),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  }
  chain.eq.mockReturnValue(chain)
  return chain
}

function createOptimisticMissUpdateChain() {
  const chain = {
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  }
  chain.eq.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  return chain
}

describe('dbService optimistic lock miss handling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws VERSION_MISMATCH when task optimistic update matches no row', async () => {
    const taskRow = {
      id: 'task-1',
      project_id: 'project-1',
      title: '原始任务',
      status: 'in_progress',
      progress: 35,
      version: 2,
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-30',
      actual_start_date: '2026-04-20',
      actual_end_date: null,
      first_progress_at: '2026-04-20T00:00:00.000Z',
      dependencies: [],
      is_milestone: false,
    }

    const selectChain = createSelectChain(taskRow)
    const updateChain = createOptimisticMissUpdateChain()

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table !== 'tasks') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: vi.fn(() => selectChain),
        update: vi.fn(() => updateChain),
      } as never
    })

    await expect(
      updateTask('task-1', { title: '本地旧版本修改' }, 1),
    ).rejects.toThrow('VERSION_MISMATCH')
  })

  it('throws VERSION_MISMATCH when project optimistic update matches no row', async () => {
    const projectRow = {
      id: 'project-1',
      name: '原始项目',
      status: 'active',
      version: 2,
    }

    const selectChain = createSelectChain(projectRow)
    const updateChain = createOptimisticMissUpdateChain()

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table !== 'projects') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: vi.fn(() => selectChain),
        update: vi.fn(() => updateChain),
      } as never
    })

    await expect(
      updateProject('project-1', { name: '本地旧版本项目修改' }, 1),
    ).rejects.toThrow('VERSION_MISMATCH')
  })
})
