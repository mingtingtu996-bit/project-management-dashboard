import { describe, expect, it } from 'vitest'

import {
  applyNotificationProducerContract,
  evaluateNotificationProducerContract,
} from '../services/notificationProducerContract.js'

describe('notificationProducerContract', () => {
  it('treats seed-style candidate suffix policies as non-actionable', () => {
    const result = applyNotificationProducerContract({
      notification_type: 'business-warning',
      touchpoint_type: 'dashboard_todo',
      source_entity_type: 'algorithm_seed',
      metadata: {
        actionPolicy: 'candidate_only_until_review',
      },
    })

    expect(result.notification_type).toBe('system-exception')
    expect(result.touchpoint_type).toBe('system_record')
    expect(result.metadata).toMatchObject({
      producer_action_policy: 'candidate_only_until_review',
      producer_touchpoint_decision: 'downgraded_to_system_record',
    })
  })

  it('recognizes owner-confirmation suffix policies as actionable review tasks', () => {
    const evaluation = evaluateNotificationProducerContract({
      notification_type: 'business-warning',
      touchpoint_type: 'dashboard_todo',
      metadata: {
        reviewTier: 'uncertain_risk_owner_confirmation',
        actionPolicy: 'confidence_only',
      },
    })

    expect(evaluation.shouldDowngrade).toBe(false)
    expect(evaluation.actionPolicy).toBe('uncertain_risk_owner_confirmation')
    expect(evaluation.decision).toBe('allowed_actionable')
  })

  it('keeps candidate-warning and manual-review signals out of today todo', () => {
    const result = applyNotificationProducerContract({
      notification_type: 'business-warning',
      touchpoint_type: 'dashboard_todo',
      metadata: {
        governanceSignal: {
          promotionStatus: 'warning_candidate',
        },
        thresholdDecision: {
          reviewTier: 'manual_review',
        },
      },
    })

    expect(result.notification_type).toBe('system-exception')
    expect(result.touchpoint_type).toBe('system_record')
    expect(result.metadata).toMatchObject({
      producer_action_policy: 'warning_candidate',
      producer_touchpoint_decision: 'downgraded_to_system_record',
    })
  })
})
