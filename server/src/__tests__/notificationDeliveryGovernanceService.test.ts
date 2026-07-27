import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyNotificationDeliveryGovernance,
  clearNotificationDeliveryGovernanceStateForTests,
} from '../services/notificationDeliveryGovernanceService.js'

describe('notificationDeliveryGovernanceService', () => {
  beforeEach(() => {
    clearNotificationDeliveryGovernanceStateForTests()
  })

  it('rate-limits bursty same-type actionable notifications', () => {
    const base = {
      company_id: 'company-1',
      project_id: 'project-1',
      notification_type: 'business-warning',
      touchpoint_type: 'dashboard_todo',
      type: 'burst_warning',
      severity: 'warning',
      metadata: {},
    }

    for (let index = 0; index < 5; index += 1) {
      const allowed = applyNotificationDeliveryGovernance({
        ...base,
        source_entity_id: `source-${index}`,
      }, { now: new Date('2026-05-27T02:00:00.000Z') })
      expect(allowed.touchpoint_type).toBe('dashboard_todo')
    }

    const limited = applyNotificationDeliveryGovernance({
      ...base,
      source_entity_id: 'source-6',
    }, { now: new Date('2026-05-27T02:01:00.000Z') })

    expect(limited.notification_type).toBe('system-exception')
    expect(limited.touchpoint_type).toBe('system_record')
    expect(limited.metadata).toMatchObject({
      delivery_governance_decision: 'rate_limited',
      delivery_rate_limited: true,
    })
  })

  it('defers disruptive visual touchpoints during quiet hours without removing ordinary todos', () => {
    const quietPopup = applyNotificationDeliveryGovernance({
      notification_type: 'business-warning',
      touchpoint_type: 'popup',
      type: 'night_popup',
      severity: 'warning',
      metadata: {},
    }, { now: new Date('2026-05-26T15:30:00.000Z') })

    const quietTodo = applyNotificationDeliveryGovernance({
      notification_type: 'flow-reminder',
      touchpoint_type: 'dashboard_todo',
      type: 'night_todo',
      severity: 'warning',
      metadata: {},
    }, { now: new Date('2026-05-26T15:30:00.000Z') })

    expect(quietPopup.touchpoint_type).toBe('persistent')
    expect(quietPopup.metadata).toMatchObject({
      delivery_quiet_hours_applied: true,
      delivery_governance_decision: 'quiet_hours_deferred',
    })
    expect(quietTodo.touchpoint_type).toBe('dashboard_todo')
  })
})
