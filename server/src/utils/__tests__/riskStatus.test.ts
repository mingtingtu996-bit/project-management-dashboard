import { describe, expect, it } from 'vitest'
import { isActiveRisk } from '../riskStatus.js'

describe('riskStatus utilities', () => {
  it('treats only closed risk statuses as inactive', () => {
    expect(isActiveRisk({ status: 'open' })).toBe(true)
    expect(isActiveRisk({ status: 'mitigating' })).toBe(true)
    expect(isActiveRisk({ status: 'closed' })).toBe(false)
    expect(isActiveRisk({ status: '已关闭' })).toBe(false)
  })
})
