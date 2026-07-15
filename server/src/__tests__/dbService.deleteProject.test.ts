import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const clientQuery = vi.fn()
  const release = vi.fn()
  const getClient = vi.fn(async () => ({ query: clientQuery, release }))
  const from = vi.fn()
  return { clientQuery, release, getClient, from }
})

vi.mock('../database.js', () => ({
  getClient: state.getClient,
  query: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: state.from })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('dbService deleteProject', () => {
  const auditContext = {
    actorUserId: 'user-1',
    actorUsername: 'owner-1',
    companyId: 'company-1',
    confirmation: {
      action: 'delete-project' as const,
      resourceId: 'project-1',
      source: 'explicit_request_header' as const,
    },
    requestPath: '/api/projects/project-1',
  }

  beforeEach(() => {
    state.clientQuery.mockReset()
    state.clientQuery.mockResolvedValue({ rows: [], rowCount: 1 })
    state.release.mockReset()
    state.getClient.mockClear()
    state.from.mockReset()
  })

  it('deletes project-scoped rows and the project in one transaction', async () => {
    const { deleteProject } = await import('../services/dbService.js')

    await deleteProject('project-1', auditContext)

    expect(state.getClient).toHaveBeenCalledTimes(1)
    const statements = state.clientQuery.mock.calls.map(([sql]) => String(sql))
    expect(statements).toEqual([
      'BEGIN',
      'DELETE FROM public.task_conditions WHERE project_id = $1',
      'DELETE FROM public.task_obstacles WHERE project_id = $1',
      'DELETE FROM public.task_timeline_events WHERE project_id = $1',
      'DELETE FROM public.notifications WHERE project_id = $1',
      'DELETE FROM public.risks WHERE project_id = $1',
      'DELETE FROM public.issues WHERE project_id = $1',
      'DELETE FROM public.tasks WHERE project_id = $1',
      'DELETE FROM public.projects WHERE id = $1',
      expect.stringContaining('INSERT INTO public.operation_logs'),
      'COMMIT',
    ])
    const auditCall = state.clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.operation_logs'))
    expect(auditCall?.[1]?.slice(0, 4)).toEqual([
      'user-1',
      'owner-1',
      'project-1',
      '/api/projects/project-1',
    ])
    expect(JSON.parse(String(auditCall?.[1]?.[4]))).toMatchObject({
      companyId: 'company-1',
      confirmation: auditContext.confirmation,
      auditPolicy: 'same_transaction_as_project_delete',
    })
    expect(state.release).toHaveBeenCalledTimes(1)
    expect(state.from).not.toHaveBeenCalled()
  })

  it('rolls back all earlier deletes when a later cleanup step fails', async () => {
    state.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'DELETE FROM public.issues WHERE project_id = $1') {
        throw new Error('injected cleanup failure')
      }
      return { rows: [], rowCount: 1 }
    })
    const { deleteProject } = await import('../services/dbService.js')

    await expect(deleteProject('project-1', auditContext)).rejects.toThrow('injected cleanup failure')

    const statements = state.clientQuery.mock.calls.map(([sql]) => sql)
    expect(statements).toContain('BEGIN')
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('DELETE FROM public.tasks WHERE project_id = $1')
    expect(statements).not.toContain('DELETE FROM public.projects WHERE id = $1')
    expect(statements).not.toContain('COMMIT')
    expect(state.release).toHaveBeenCalledTimes(1)
  })

  it('rolls back the physical deletion when its confirmation audit cannot be persisted', async () => {
    state.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO public.operation_logs')) {
        throw new Error('injected audit failure')
      }
      return { rows: [], rowCount: 1 }
    })
    const { deleteProject } = await import('../services/dbService.js')

    await expect(deleteProject('project-1', auditContext)).rejects.toThrow('injected audit failure')

    const statements = state.clientQuery.mock.calls.map(([sql]) => String(sql))
    expect(statements).toContain('DELETE FROM public.projects WHERE id = $1')
    expect(statements.some((sql) => sql.includes('INSERT INTO public.operation_logs'))).toBe(true)
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
  })
})
