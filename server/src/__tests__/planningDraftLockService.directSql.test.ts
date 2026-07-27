import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getClient: vi.fn(),
  clientQuery: vi.fn(),
  clientRelease: vi.fn(),
  emit: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
  getClient: mocks.getClient,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => {
      throw new Error('Supabase REST must not be used by request-scoped draft lock mutations')
    }),
  },
}))

vi.mock('../services/notificationTouchpointService.js', () => ({
  notificationTouchpointService: { emit: mocks.emit },
}))

const {
  PlanningDraftLockService,
  PlanningDraftLockServiceError,
} = await import('../services/planningDraftLockService.js')

const baseLock = {
  id: '8a489af8-2244-47bb-8cad-7ec8257b3bc0',
  project_id: '244a3e71-b4c0-4868-b698-47da1909440d',
  draft_type: 'baseline',
  resource_id: '3e022d5f-89fa-489e-a370-e800b3189070',
  locked_by: 'eab27932-f354-4eb5-8aeb-1722bfe722ce',
  locked_at: '2026-07-13T10:00:00.000Z',
  lock_expires_at: '2099-07-13T10:30:00.000Z',
  reminder_sent_at: null,
  released_at: null,
  released_by: null,
  release_reason: null,
  is_locked: true,
  version: 4,
  created_at: '2026-07-13T10:00:00.000Z',
  updated_at: '2026-07-13T10:00:00.000Z',
}

describe('planning draft lock request-scoped SQL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClient.mockResolvedValue({
      query: mocks.clientQuery,
      release: mocks.clientRelease,
    })
    mocks.emit.mockResolvedValue(undefined)
  })

  it('creates a lock in one scoped transaction without Supabase REST', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (sql.includes('FOR UPDATE')) return { rows: [] }
      if (sql.includes('INSERT INTO public.planning_draft_locks')) {
        return { rows: [{ ...baseLock, version: 1 }] }
      }
      throw new Error(`unexpected SQL: ${sql}`)
    })

    const lock = await new PlanningDraftLockService().acquireDraftLock({
      projectId: baseLock.project_id,
      draftType: 'baseline',
      resourceId: baseLock.resource_id,
      actorUserId: baseLock.locked_by,
    })

    expect(lock).toEqual(expect.objectContaining({
      project_id: baseLock.project_id,
      resource_id: baseLock.resource_id,
      version: 1,
    }))
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [`${baseLock.project_id}:baseline:${baseLock.resource_id}`],
    )
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE project_id = \$1[\s\S]*draft_type = \$2[\s\S]*resource_id = \$3[\s\S]*FOR UPDATE/),
      [baseLock.project_id, 'baseline', baseLock.resource_id],
    )
    expect(mocks.clientQuery).toHaveBeenCalledWith('COMMIT')
    expect(mocks.clientRelease).toHaveBeenCalledOnce()
  })

  it('rejects a current lock held by another editor and rolls back before mutation', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (sql.includes('FOR UPDATE')) return { rows: [baseLock] }
      if (sql === 'ROLLBACK') return { rows: [] }
      throw new Error(`unexpected mutation SQL: ${sql}`)
    })

    await expect(new PlanningDraftLockService().acquireDraftLock({
      projectId: baseLock.project_id,
      draftType: 'baseline',
      resourceId: baseLock.resource_id,
      actorUserId: '59ca44cc-e928-48d8-a535-75a7bf7fb886',
    })).rejects.toEqual(expect.objectContaining<Partial<InstanceType<typeof PlanningDraftLockServiceError>>>({
      code: 'LOCK_HELD',
      statusCode: 409,
    }))

    expect(mocks.clientQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mocks.clientQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.planning_draft_locks'),
      expect.anything(),
    )
    expect(mocks.clientRelease).toHaveBeenCalledOnce()
  })

  it('renews the same editor lock with an id and project-scoped update', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (sql.includes('FOR UPDATE')) return { rows: [baseLock] }
      if (sql.includes('UPDATE public.planning_draft_locks')) {
        expect(values?.[0]).toBe(baseLock.id)
        expect(values?.[1]).toBe(baseLock.project_id)
        return { rows: [{ ...baseLock, version: 5 }] }
      }
      throw new Error(`unexpected SQL: ${sql}`)
    })

    const lock = await new PlanningDraftLockService().acquireDraftLock({
      projectId: baseLock.project_id,
      draftType: 'baseline',
      resourceId: baseLock.resource_id,
      actorUserId: baseLock.locked_by,
    })

    expect(lock.version).toBe(5)
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE public\.planning_draft_locks[\s\S]*WHERE id = \$1[\s\S]*project_id = \$2[\s\S]*RETURNING \*/),
      expect.arrayContaining([baseLock.id, baseLock.project_id]),
    )
  })

  it('rolls back and releases the connection when a lock write fails', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (sql.includes('FOR UPDATE')) return { rows: [] }
      if (sql.includes('INSERT INTO public.planning_draft_locks')) throw new Error('write failed')
      if (sql === 'ROLLBACK') return { rows: [] }
      throw new Error(`unexpected SQL: ${sql}`)
    })

    await expect(new PlanningDraftLockService().acquireDraftLock({
      projectId: baseLock.project_id,
      draftType: 'baseline',
      resourceId: baseLock.resource_id,
      actorUserId: baseLock.locked_by,
    })).rejects.toThrow('write failed')

    expect(mocks.clientQuery).toHaveBeenCalledWith('ROLLBACK')
    expect(mocks.clientRelease).toHaveBeenCalledOnce()
  })
})
