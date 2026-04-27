import { describe, expect, it } from 'vitest'
import { isActiveIssue } from '../issueStatus.js'

describe('issueStatus utilities', () => {
  it('treats resolved and closed issue statuses as inactive', () => {
    expect(isActiveIssue({ status: 'open' })).toBe(true)
    expect(isActiveIssue({ status: 'resolved' })).toBe(false)
    expect(isActiveIssue({ status: 'closed' })).toBe(false)
    expect(isActiveIssue({ status: '已解决' })).toBe(false)
    expect(isActiveIssue({ status: '已关闭' })).toBe(false)
  })
})
