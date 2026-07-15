import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  emit: vi.fn(),
}))

function emptyQuery() {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    single: vi.fn(async () => ({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    })),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null })),
  }
  return query
}

vi.mock('../services/dbService.js', () => ({
  createIssue: vi.fn(),
  getIssue: vi.fn(),
  getRisk: vi.fn(),
  getMembers: vi.fn(async () => []),
  updateIssue: vi.fn(),
  updateRisk: vi.fn(),
  supabase: {
    from: vi.fn(() => emptyQuery()),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}))

vi.mock('../services/notificationTouchpointService.js', () => ({
  notificationTouchpointService: {
    emit: state.emit,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { syncWarningNotifications } = await import('../services/upgradeChainService.js')

describe('syncWarningNotifications touchpoint persistence', () => {
  it('uses the persisted notification returned by a deduped touchpoint emit', async () => {
    state.emit.mockResolvedValueOnce({
      id: 'persisted-notification-1',
      project_id: 'project-1',
      task_id: 'task-1',
      type: 'progress_trend_delay',
      category: 'progress_trend_delay',
      severity: 'warning',
      title: 'Progress trend warning',
      content: 'Progress trend warning details',
      source_entity_type: 'warning',
      source_entity_id: 'stable-warning-signature',
      warning_signature: 'stable-warning-signature',
      warning_lifecycle_status: 'active',
      status: 'active',
      first_seen_at: '2026-07-14T00:00:00.000Z',
      created_at: '2026-07-14T00:00:00.000Z',
      updated_at: '2026-07-14T00:00:00.000Z',
    })

    const result = await syncWarningNotifications([
      {
        id: 'candidate-warning-1',
        project_id: 'project-1',
        task_id: 'task-1',
        warning_type: 'progress_trend_delay',
        warning_level: 'warning',
        title: 'Progress trend warning',
        description: 'Progress trend warning details',
        is_acknowledged: false,
        created_at: '2026-07-14T00:00:00.000Z',
      },
    ] as any, 'project-1')

    expect(state.emit).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('persisted-notification-1')
  })
})
