export type LifecycleStatus = '未开始' | '进行中' | '已完成' | '已延期' | '已取消'

export const LIFECYCLE_STATUS_OPTIONS: Array<{ value: LifecycleStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: '未开始', label: '未开始' },
  { value: '进行中', label: '进行中' },
  { value: '已完成', label: '已完成' },
  { value: '已延期', label: '已延期' },
  { value: '已取消', label: '已取消' },
]

const clean = (value?: string | null) => String(value ?? '').trim()

export function normalizeLicenseLifecycleStatus(status?: string | null): LifecycleStatus {
  switch (clean(status)) {
    case '待申请':
    case '未开始':
    case '待办':
      return '未开始'
    case '办理中':
    case '进行中':
      return '进行中'
    case '已获取':
    case '已通过':
    case '已出图':
    case '已完成':
      return '已完成'
    case '已过期':
    case '需修改':
    case '已驳回':
      return '已延期'
    case '已取消':
    case '已作废':
      return '已取消'
    default:
      return '未开始'
  }
}

export function normalizeDrawingLifecycleStatus(
  status?: string | null,
  reviewStatus?: string | null,
): LifecycleStatus {
  const review = clean(reviewStatus)
  if (review === '已驳回' || review === '需修改') return '已延期'
  if (review === '已通过') return '已完成'
  if (review === '审查中') return '进行中'
  if (review === '未提交') return clean(status) === '已作废' ? '已取消' : '未开始'

  switch (clean(status)) {
    case '编制中':
    case '审图中':
      return '进行中'
    case '已通过':
    case '已出图':
      return '已完成'
    case '已驳回':
    case '需修改':
      return '已延期'
    case '已作废':
      return '已取消'
    default:
      return normalizeLicenseLifecycleStatus(status)
  }
}

export function matchesLifecycleStatus(filter: string, status: LifecycleStatus): boolean {
  return filter === 'all' || filter === status
}

export function countLifecycleStatuses(statuses: LifecycleStatus[]) {
  const base = {
    totalCount: statuses.length,
    completedCount: 0,
    inProgressCount: 0,
    notStartedCount: 0,
    delayedCount: 0,
    canceledCount: 0,
  }

  for (const status of statuses) {
    if (status === '已完成') base.completedCount += 1
    else if (status === '进行中') base.inProgressCount += 1
    else if (status === '未开始') base.notStartedCount += 1
    else if (status === '已延期') base.delayedCount += 1
    else if (status === '已取消') base.canceledCount += 1
  }

  return {
    ...base,
    completionRate: base.totalCount > 0 ? Math.round((base.completedCount / base.totalCount) * 100) : 0,
  }
}
