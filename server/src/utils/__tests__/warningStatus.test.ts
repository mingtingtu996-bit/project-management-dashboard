import { describe, expect, it } from 'vitest'
import { isActiveWarning } from '../warningStatus.js'

describe('warningStatus utilities', () => {
  it('treats resolved and closed warning statuses as inactive', () => {
    expect(isActiveWarning({ status: 'warning' })).toBe(true)
    expect(isActiveWarning({ status: 'resolved' })).toBe(false)
    expect(isActiveWarning({ status: 'closed' })).toBe(false)
    expect(isActiveWarning({ status: '已解决' })).toBe(false)
    expect(isActiveWarning({ status: '已关闭' })).toBe(false)
  })
})
