export const USER_FACING_TERMS = {
  revisionPool: '计划修订候选',
  monthlyFulfillment: '月度完成情况',
  closeoutTodo: '月末待处理事项',
  criticalPath: '关键路径',
} as const

export function formatCriticalPathCount(count: number) {
  return `${USER_FACING_TERMS.criticalPath} ${count} 项`
}
