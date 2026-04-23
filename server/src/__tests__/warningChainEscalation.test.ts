import { describe, expect, it } from 'vitest'
import {
  escalateObstacleSeverity,
  resolvePendingDelayWarningSeverity,
  shouldSkipAutoUpgrade,
} from '../services/warningChainService.js'

describe('warning chain escalation boundaries', () => {
  it('keeps auto-upgrade paused when acknowledged or muted', () => {
    expect(shouldSkipAutoUpgrade({ acknowledged_at: '2026-04-13T08:00:00.000Z' })).toBe(true)
    expect(
      shouldSkipAutoUpgrade({
        muted_until: '2026-04-14T08:00:00.000Z',
        now: '2026-04-13T08:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('downgrades pending delay warnings to info while the request is pending', () => {
    expect(
      resolvePendingDelayWarningSeverity({
        warning_level: 'critical',
        has_pending_request: true,
      }),
    ).toEqual({
      severity: 'info',
      note: '延期审批中',
      escalated: false,
    })
  })

  it('escalates overdue unresolved obstacles to critical once', () => {
    expect(
      escalateObstacleSeverity({
        severity: 'warning',
        status: '处理中',
        expected_resolution_date: '2026-04-10T08:00:00.000Z',
        now: '2026-04-13T08:00:00.000Z',
      }),
    ).toEqual({
      severity: 'critical',
      escalated: true,
    })

    expect(
      escalateObstacleSeverity({
        severity: 'critical',
        status: '处理中',
        expected_resolution_date: '2026-04-10T08:00:00.000Z',
        now: '2026-04-13T08:00:00.000Z',
      }),
    ).toEqual({
      severity: 'critical',
      escalated: false,
    })
  })
})
