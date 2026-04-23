import { describe, expect, it } from 'vitest'

import { resolveResponsibilityWatchStatus } from '../services/responsibilityInsightService.js'

describe('resolveResponsibilityWatchStatus', () => {
  it('keeps cleared watches cleared during the same abnormal cycle', () => {
    expect(
      resolveResponsibilityWatchStatus({
        rowStateLevel: 'abnormal',
        currentStatus: 'cleared',
        previousAlertLevel: 'abnormal',
      }),
    ).toEqual({
      watchStatus: 'cleared',
      suggestRecoveryConfirmation: false,
    })
  })

  it('re-activates a cleared watch when the subject becomes abnormal again after recovery', () => {
    expect(
      resolveResponsibilityWatchStatus({
        rowStateLevel: 'abnormal',
        currentStatus: 'cleared',
        previousAlertLevel: 'healthy',
      }),
    ).toEqual({
      watchStatus: 'active',
      suggestRecoveryConfirmation: false,
    })
  })

  it('suggests recovery confirmation when an active watch becomes healthy', () => {
    expect(
      resolveResponsibilityWatchStatus({
        rowStateLevel: 'healthy',
        currentStatus: 'active',
        previousAlertLevel: 'abnormal',
      }),
    ).toEqual({
      watchStatus: 'suggested_to_clear',
      suggestRecoveryConfirmation: true,
    })
  })
})
