import { describe, expect, it } from 'vitest'

import { auditNotificationProducerSources } from '../services/notificationProducerAuditService.js'

describe('notificationProducerAuditService', () => {
  it('audits notification producers for source identity, dedupe, target route, and due hints', () => {
    const report = auditNotificationProducerSources([
      {
        file: 'good.ts',
        content: `
          await notificationTouchpointService.emit({
            project_id: projectId,
            type: 'condition_due',
            notification_type: 'flow-reminder',
            touchpoint_type: 'dashboard_todo',
            source_entity_type: 'task_condition',
            source_entity_id: condition.id,
            dedupe_key: 'condition:' + condition.id,
            action_due_at: condition.due_at,
            target_route: '/projects/1/gantt',
            title: 'Condition due',
            content: 'Condition due',
          })
        `,
      },
      {
        file: 'weak.ts',
        content: `
          await notificationTouchpointService.emit({
            project_id: projectId,
            type: 'candidate_signal',
            notification_type: 'business-warning',
            touchpoint_type: 'dashboard_todo',
            title: 'Candidate signal',
            content: 'Candidate signal',
          })
        `,
      },
    ])

    expect(report.totalEmitCalls).toBe(2)
    expect(report.summary.missingSourceIdentityCount).toBe(1)
    expect(report.summary.missingDedupeCount).toBe(1)
    expect(report.summary.missingTargetRouteCount).toBe(1)
    expect(report.summary.missingActionDueForTodoCount).toBe(1)
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'weak.ts',
        missing: expect.arrayContaining(['source_identity', 'dedupe_key', 'target_route', 'action_due_at']),
      }),
    ]))
  })
})
