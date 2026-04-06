import { describe, expect, it } from 'vitest'

import {
  countLifecycleStatuses,
  matchesLifecycleStatus,
  normalizeDrawingLifecycleStatus,
  normalizeLicenseLifecycleStatus,
} from '../preMilestonesLifecycle'

describe('preMilestonesLifecycle', () => {
  it('normalizes licenses and drawings into the same lifecycle buckets', () => {
    expect(normalizeLicenseLifecycleStatus('待申请')).toBe('未开始')
    expect(normalizeLicenseLifecycleStatus('办理中')).toBe('进行中')
    expect(normalizeLicenseLifecycleStatus('已获取')).toBe('已完成')
    expect(normalizeLicenseLifecycleStatus('已过期')).toBe('已延期')

    expect(normalizeDrawingLifecycleStatus('编制中', '未提交')).toBe('未开始')
    expect(normalizeDrawingLifecycleStatus('审图中', '审查中')).toBe('进行中')
    expect(normalizeDrawingLifecycleStatus('已出图', '已通过')).toBe('已完成')
    expect(normalizeDrawingLifecycleStatus('已驳回', '需修改')).toBe('已延期')
  })

  it('counts lifecycle statuses and matches the shared filter', () => {
    const summary = countLifecycleStatuses(['未开始', '进行中', '已完成', '已延期', '已取消'])

    expect(summary.totalCount).toBe(5)
    expect(summary.notStartedCount).toBe(1)
    expect(summary.inProgressCount).toBe(1)
    expect(summary.completedCount).toBe(1)
    expect(summary.delayedCount).toBe(1)
    expect(summary.canceledCount).toBe(1)
    expect(summary.completionRate).toBe(20)

    expect(matchesLifecycleStatus('all', '已完成')).toBe(true)
    expect(matchesLifecycleStatus('已完成', '已完成')).toBe(true)
    expect(matchesLifecycleStatus('已延期', '进行中')).toBe(false)
  })
})
