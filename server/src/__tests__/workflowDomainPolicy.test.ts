import { describe, expect, it } from 'vitest'

import {
  PROTECTED_ISSUE_SOURCE_TYPES,
  buildIssueConfirmClosePatch,
  buildIssueKeepProcessingPatch,
  buildRiskPendingManualClosePatch,
  computeDynamicIssuePriority,
} from '../services/workflowDomainPolicy.js'

describe('workflow domain policy', () => {
  const closureOutcome = {
    resultCode: 'resolved' as const,
    resultSummary: 'Corrective action completed and verified.',
    effectiveness: 'resolved' as const,
    evidenceRefs: ['inspection:inspection-1'],
    causeAttributionId: null,
  }

  it('protects obstacle_escalated and condition_expired issues from hard delete', () => {
    expect(PROTECTED_ISSUE_SOURCE_TYPES.has('obstacle_escalated')).toBe(true)
    expect(PROTECTED_ISSUE_SOURCE_TYPES.has('condition_expired')).toBe(true)
  })

  it('raises dynamic issue priority every 7 untreated days and caps after 35 days', () => {
    const createdAt = '2026-03-01T00:00:00.000Z'

    expect(computeDynamicIssuePriority({
      source_type: 'condition_expired',
      severity: 'critical',
      created_at: createdAt,
      status: 'open',
      priority: 16,
    }, { now: new Date('2026-03-01T00:00:00.000Z') })).toBe(16)

    expect(computeDynamicIssuePriority({
      source_type: 'condition_expired',
      severity: 'critical',
      created_at: createdAt,
      status: 'open',
      priority: 16,
    }, { now: new Date('2026-03-15T00:00:00.000Z') })).toBe(19)

    expect(computeDynamicIssuePriority({
      source_type: 'condition_expired',
      severity: 'critical',
      created_at: createdAt,
      status: 'open',
      priority: 16,
    }, { now: new Date('2026-05-01T00:00:00.000Z') })).toBe(24)
  })

  it('returns dedicated pending_manual_close action patches', () => {
    expect(buildIssueConfirmClosePatch(closureOutcome, 'user-1')).toMatchObject({
      status: 'closed',
      pending_manual_close: false,
      closed_reason: 'manual_confirmed_close',
      closure_result_code: 'resolved',
      closed_by: 'user-1',
    })
    expect(buildIssueKeepProcessingPatch()).toMatchObject({
      status: 'investigating',
      pending_manual_close: false,
    })
    expect(buildRiskPendingManualClosePatch()).toMatchObject({
      status: 'mitigating',
      pending_manual_close: true,
    })
  })
})
