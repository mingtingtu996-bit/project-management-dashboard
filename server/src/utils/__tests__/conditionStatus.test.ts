import { describe, expect, it } from 'vitest'
import { isPendingCondition } from '../conditionStatus.js'

describe('conditionStatus utilities', () => {
  it('uses explicit satisfied flags before status labels', () => {
    expect(isPendingCondition({ is_satisfied: 1, status: 'pending' })).toBe(false)
    expect(isPendingCondition({ is_satisfied: 0, status: 'satisfied' })).toBe(true)
  })

  it('treats completed, satisfied, confirmed, and Chinese labels as not pending', () => {
    expect(isPendingCondition({ status: 'pending' })).toBe(true)
    expect(isPendingCondition({ status: 'completed' })).toBe(false)
    expect(isPendingCondition({ status: 'satisfied' })).toBe(false)
    expect(isPendingCondition({ status: 'confirmed' })).toBe(false)
    expect(isPendingCondition({ status: '已满足' })).toBe(false)
    expect(isPendingCondition({ status: '已确认' })).toBe(false)
  })
})
