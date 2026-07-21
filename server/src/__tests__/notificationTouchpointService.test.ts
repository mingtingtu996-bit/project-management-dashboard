import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findNotification: vi.fn(),
  insertNotification: vi.fn(),
  updateNotificationById: vi.fn(),
  from: vi.fn(),
  clearAttentionSummaryCache: vi.fn(),
  registerDatabasePostCommitEffect: vi.fn(async (_label: string, effect: () => Promise<void>) => effect()),
}))

vi.mock('../services/notificationStore.js', () => ({
  findNotification: mocks.findNotification,
  insertNotification: mocks.insertNotification,
  updateNotificationById: mocks.updateNotificationById,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../services/todoTouchpointService.js', () => ({
  clearAttentionSummaryCache: mocks.clearAttentionSummaryCache,
}))

vi.mock('../database.js', () => ({
  registerDatabasePostCommitEffect: mocks.registerDatabasePostCommitEffect,
}))

const { notificationTouchpointService } = await import('../services/notificationTouchpointService.js')
const { clearNotificationDeliveryGovernanceStateForTests } = await import('../services/notificationDeliveryGovernanceService.js')
const {
  NOTIFICATION_TOUCHPOINT_RULE_REGISTRY,
  TOUCHPOINT_PROJECTION_RULE_VERSION,
  buildNotificationDedupeKey,
} = await import('../services/notificationTouchpointRules.js')

describe('notificationTouchpointService governance metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearNotificationDeliveryGovernanceStateForTests()
    mocks.findNotification.mockResolvedValue(null)
    mocks.insertNotification.mockImplementation(async (row) => row)
    mocks.from.mockReturnValue({
      upsert: vi.fn(async () => ({ error: null })),
    })
    mocks.registerDatabasePostCommitEffect.mockImplementation(async (_label: string, effect: () => Promise<void>) => effect())
  })

  it('defers recipient state writes and attention cache invalidation until commit', async () => {
    const postCommitEffects: Array<() => Promise<void>> = []
    mocks.registerDatabasePostCommitEffect.mockImplementation(async (_label, effect) => {
      postCommitEffects.push(effect)
    })

    await notificationTouchpointService.emit({
      company_id: 'company-1',
      project_id: 'project-1',
      type: 'drawing_version_updated',
      notification_type: 'flow-reminder',
      source_entity_type: 'drawing_version',
      source_entity_id: 'drawing-version-1',
      title: 'Drawing updated',
      content: 'Drawing D-001 is now version 2.0',
      recipients: ['user-1'],
    })

    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.clearAttentionSummaryCache).not.toHaveBeenCalled()
    expect(postCommitEffects).toHaveLength(1)

    await postCommitEffects[0]?.()

    expect(mocks.from).toHaveBeenCalledWith('notification_user_states')
    expect(mocks.clearAttentionSummaryCache).toHaveBeenCalledTimes(1)
  })

  it('adds projection version/source and dedupe governance metadata when emitting a touchpoint', async () => {
    await notificationTouchpointService.emit({
      company_id: 'company-1',
      project_id: 'project-1',
      type: 'risk_warning',
      notification_type: 'business-warning',
      source_entity_type: 'risk',
      source_entity_id: 'risk-1',
      title: 'Risk',
      content: 'Risk needs attention',
      metadata: {
        existing: true,
      },
    })

    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      touchpoint_type: 'dashboard_todo',
      dedupe_key: 'company-1:project-1:risk:risk-1:risk_warning',
      metadata: expect.objectContaining({
        existing: true,
        touchpoint_source: 'notification_touchpoint_service',
        projection_source: 'notification_touchpoint_service',
        projection_rule_version: 'v1.4.13-attention-governance',
        dedupe_strategy: 'source_entity',
        dedupe_required: true,
        dedupe_missing: false,
      }),
    }))
  })

  it('derives a stable content fingerprint for actionable touchpoints without source identity', async () => {
    await notificationTouchpointService.emit({
      company_id: 'company-1',
      project_id: 'project-1',
      type: 'manual_warning',
      notification_type: 'business-warning',
      title: 'Manual warning',
      content: 'Manual warning without source identity',
    })

    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      touchpoint_type: 'dashboard_todo',
      dedupe_key: expect.stringMatching(/^content:[a-f0-9]{32}$/),
      metadata: expect.objectContaining({
        dedupe_strategy: 'content_fingerprint',
        dedupe_required: true,
        dedupe_missing: false,
      }),
    }))
  })

  it('downgrades candidate-only algorithm signals to system records instead of today todos', async () => {
    await notificationTouchpointService.emit({
      company_id: 'company-1',
      project_id: 'project-1',
      type: 'duration_context_candidate',
      notification_type: 'business-warning',
      touchpoint_type: 'dashboard_todo',
      source_entity_type: 'algorithm_seed',
      source_entity_id: 'seed-1',
      title: 'Candidate signal',
      content: 'Candidate signal should not interrupt users',
      metadata: {
        actionPolicy: 'candidate_only',
        sourceAlgorithm: 'duration_context',
      },
    })

    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      notification_type: 'system-exception',
      touchpoint_type: 'system_record',
      metadata: expect.objectContaining({
        producer_contract_version: 'v1.4.13-producer-closure',
        producer_action_policy: 'candidate_only',
        producer_touchpoint_decision: 'downgraded_to_system_record',
        producer_boundary_reason: 'non_actionable_algorithm_signal',
      }),
    }))
  })

  it('keeps owner-confirmation signals actionable when a user decision is required', async () => {
    await notificationTouchpointService.emit({
      company_id: 'company-1',
      project_id: 'project-1',
      type: 'delay_uncertainty_owner_confirmation',
      notification_type: 'business-warning',
      touchpoint_type: 'dashboard_todo',
      source_entity_type: 'warning_owner_confirmation',
      source_entity_id: 'confirmation-1',
      title: 'Owner confirmation',
      content: 'Owner confirmation requires a decision',
      metadata: {
        reviewTier: 'owner_confirmation',
        actionPolicy: 'owner_confirmation',
      },
    })

    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      notification_type: 'business-warning',
      touchpoint_type: 'dashboard_todo',
      metadata: expect.objectContaining({
        producer_contract_version: 'v1.4.13-producer-closure',
        producer_action_policy: 'owner_confirmation',
        producer_touchpoint_decision: 'allowed_actionable',
      }),
    }))
  })

  it('projects action due date from explicit input or metadata when creating actionable todos', async () => {
    await notificationTouchpointService.emit({
      company_id: 'company-1',
      project_id: 'project-1',
      type: 'condition_due',
      notification_type: 'flow-reminder',
      source_entity_type: 'task_condition',
      source_entity_id: 'condition-1',
      title: 'Condition due',
      content: 'Condition needs action',
      metadata: {
        due_at: '2026-05-26T09:00:00.000Z',
      },
    })

    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      action_due_at: '2026-05-26T09:00:00.000Z',
    }))
  })

  it('applies delivery governance before inserting bursty notifications', async () => {
    for (let index = 0; index < 6; index += 1) {
      await notificationTouchpointService.emit({
        company_id: 'company-1',
        project_id: 'project-1',
        type: 'burst_warning',
        notification_type: 'business-warning',
        touchpoint_type: 'dashboard_todo',
        source_entity_type: 'warning',
        source_entity_id: `warning-${index}`,
        title: 'Burst warning',
        content: 'Burst warning',
      })
    }

    const lastCall = mocks.insertNotification.mock.calls.at(-1)?.[0]
    expect(lastCall).toMatchObject({
      notification_type: 'system-exception',
      touchpoint_type: 'system_record',
      metadata: expect.objectContaining({
        delivery_governance_decision: 'rate_limited',
      }),
    })
  })

  it('retries unique-conflict inserts by reloading and updating the active dedupe row', async () => {
    const existing = {
      id: 'notification-1',
      company_id: 'company-1',
      project_id: 'project-1',
      user_id: null,
      type: 'risk_warning',
      notification_type: 'business-warning',
      title: 'Old risk',
      content: 'Old content',
      status: 'unread',
      touchpoint_type: 'dashboard_todo',
      scope_type: 'project',
      dedupe_key: 'company-1:project-1:risk:risk-1:risk_warning',
      lifecycle_status: 'active',
      created_at: '2026-05-25T00:00:00.000Z',
      updated_at: '2026-05-25T00:00:00.000Z',
    }
    const duplicateError = new Error('duplicate key value violates unique constraint "uq_notifications_active_touchpoint_dedupe"') as Error & { code?: string }
    duplicateError.code = '23505'

    mocks.findNotification
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing)
    mocks.insertNotification.mockRejectedValueOnce(duplicateError)

    const result = await notificationTouchpointService.emit({
      company_id: 'company-1',
      project_id: 'project-1',
      type: 'risk_warning',
      notification_type: 'business-warning',
      source_entity_type: 'risk',
      source_entity_id: 'risk-1',
      title: 'New risk',
      content: 'New content',
    })

    expect(result.id).toBe('notification-1')
    expect(mocks.updateNotificationById).toHaveBeenCalledWith('notification-1', expect.objectContaining({
      title: 'New risk',
      content: 'New content',
      dedupe_key: 'company-1:project-1:risk:risk-1:risk_warning',
      lifecycle_status: 'active',
    }), expect.objectContaining({ id: 'notification-1', project_id: 'project-1' }))
  })

  it('exports a canonical touchpoint rule registry used by dedupe and analytics', () => {
    expect(TOUCHPOINT_PROJECTION_RULE_VERSION).toBe('v1.4.13-attention-governance')
    expect(NOTIFICATION_TOUCHPOINT_RULE_REGISTRY.touchpoints.dashboard_todo.contributesToTodayTodo).toBe(true)
    expect(NOTIFICATION_TOUCHPOINT_RULE_REGISTRY.dedupe.activeUniqueIndex).toBe('uq_notifications_active_touchpoint_dedupe')
    expect(buildNotificationDedupeKey({
      company_id: 'company-1',
      project_id: 'project-1',
      source_entity_type: 'risk',
      source_entity_id: 'risk-1',
      type: 'risk_warning',
    })).toBe('company-1:project-1:risk:risk-1:risk_warning')
  })
})
