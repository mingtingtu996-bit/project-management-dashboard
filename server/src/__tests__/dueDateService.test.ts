import { describe, expect, it } from 'vitest'

import { calculateDueStatus } from '../services/dueDateService.js'

describe('dueDateService business-date handling', () => {
  it('treats an Asia/Shanghai early-morning timestamp as the same business day', () => {
    const result = calculateDueStatus('2026-06-25', {
      asOfDate: '2026-06-25T00:30:00+08:00',
    })

    expect(result.days_until_due).toBe(0)
    expect(result.due_status).toBe('urgent')
    expect(result.due_label).toBe('今天到期')
  })

  it('does not misclassify same-day due timestamps as overdue after UTC normalization', () => {
    const result = calculateDueStatus('2026-06-25T00:30:00+08:00', {
      asOfDate: '2026-06-25T20:00:00+08:00',
    })

    expect(result.days_until_due).toBe(0)
    expect(result.due_status).toBe('urgent')
    expect(result.due_label).toBe('今天到期')
  })
})
