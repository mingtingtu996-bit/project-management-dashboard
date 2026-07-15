import { describe, expect, it } from 'vitest'

import {
  getProjectDisplayDescription,
  getProjectDisplayName,
  isUnreadableProjectText,
} from '../projectDisplay'

describe('projectDisplay', () => {
  it('replaces question-mark-only project names with a readable fallback', () => {
    expect(isUnreadableProjectText('??????????')).toBe(true)
    expect(getProjectDisplayName('??????????')).toBe('未命名项目')
  })

  it('keeps normal project names and descriptions unchanged', () => {
    expect(getProjectDisplayName('示例医院项目')).toBe('示例医院项目')
    expect(getProjectDisplayDescription('门诊医技综合楼')).toBe('门诊医技综合楼')
  })
})
