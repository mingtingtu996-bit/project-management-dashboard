import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  notificationRows: [] as any[],
  stateRows: [] as any[],
}))

function createThenableQuery(resultFactory: () => { data: any[]; error: any }) {
  const query: any = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    in: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => Promise.resolve(resultFactory()).then(resolve, reject),
  }
  return query
}

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

const { getNotificationAnalytics } = await import('../services/notificationAnalyticsService.js')

describe('notificationAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.notificationRows = [
      {
        id: 'n-1',
        type: 'risk',
        notification_type: 'risk_warning',
        touchpoint_type: 'business_warning',
        lifecycle_status: 'active',
        dedupe_key: 'risk:1',
        metadata: {
          projection_rule_version: 'v1.4.13-attention-governance',
          producer_contract_version: 'v1.4.13-producer-closure',
        },
      },
      {
        id: 'n-2',
        type: 'risk',
        notification_type: 'risk_warning',
        touchpoint_type: 'business_warning',
        lifecycle_status: 'active',
        dedupe_key: 'risk:1',
        metadata: {
          projection_rule_version: 'v1.4.13-attention-governance',
          producer_contract_version: 'v1.4.13-producer-closure',
        },
      },
      {
        id: 'n-3',
        type: 'todo',
        notification_type: 'flow_reminder',
        touchpoint_type: null,
        lifecycle_status: null,
        dedupe_key: null,
        metadata: { projection_rule_version: 'legacy' },
      },
    ]
    mocks.stateRows = [
      { notification_id: 'n-1', is_read: true, is_acknowledged: true, is_muted: false, is_hidden: false },
      { notification_id: 'n-2', is_read: true, is_acknowledged: false, is_muted: true, is_hidden: false },
      { notification_id: 'n-3', is_read: false, is_acknowledged: false, is_muted: false, is_hidden: true },
    ]
    mocks.from.mockImplementation((tableName: string) => {
      if (tableName === 'notifications') {
        return createThenableQuery(() => ({ data: mocks.notificationRows, error: null }))
      }
      if (tableName === 'notification_user_states') {
        return createThenableQuery(() => ({ data: mocks.stateRows, error: null }))
      }
      return createThenableQuery(() => ({ data: [], error: null }))
    })
  })

  it('summarizes touchpoints, lifecycle status, dedupe coverage, and user state rates', async () => {
    const summary = await getNotificationAnalytics({ companyId: 'company-1', projectId: 'project-1', since: '2026-05-01', limit: 100 })

    expect(summary.totalCount).toBe(3)
    expect(summary.byTouchpointType).toMatchObject({
      business_warning: 2,
      persistent: 1,
    })
    expect(summary.byLifecycleStatus).toMatchObject({
      active: 3,
    })
    expect(summary.byProjectionRuleVersion).toMatchObject({
      'v1.4.13-attention-governance': 2,
      legacy: 1,
    })
    expect(summary.byProducerContractVersion).toMatchObject({
      'v1.4.13-producer-closure': 2,
      unknown: 1,
    })
    expect(summary.dedupeKeyCount).toBe(1)
    expect(summary.dedupeCoverageRate).toBe(33)
    expect(summary.duplicateDedupeKeyRate).toBe(100)
    expect(summary.readRate).toBe(67)
    expect(summary.acknowledgedRate).toBe(33)
    expect(summary.muteRate).toBe(33)
    expect(summary.hiddenRate).toBe(33)
    expect(summary.metricValues).toMatchObject({
      notification_total_count: 3,
      notification_read_rate: 67,
      notification_action_conversion_rate: 33,
      notification_projection_rule_version_count: 2,
      notification_producer_contract_version_count: 2,
    })
  })
})
