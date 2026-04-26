const normalizeStatus = (value: unknown): string => String(value ?? '').trim().toLowerCase()

export const isCompletedTask = (task: any): boolean => {
  const status = normalizeStatus(task?.status)
  return status === '已完成' || status === 'completed' || Number(task?.progress) === 100
}

export const isInProgressTask = (task: any): boolean => {
  const status = normalizeStatus(task?.status)
  return status === '进行中' || status === 'in_progress'
}

export const isDelayedTask = (task: any): boolean => {
  const endDate = task?.planned_end_date || task?.end_date
  if (!endDate || isCompletedTask(task)) return false
  return new Date(endDate).getTime() < Date.now() && Number(task?.progress) !== 100
}

export const isBlockedTask = (task: any): boolean => {
  const status = normalizeStatus(task?.status)
  return ['受阻', 'blocked', 'obstacle', 'obstructed'].includes(status)
}

export const getTaskDisplayStatus = (task: any): 'pending' | 'in_progress' | 'blocked' | 'completed' => {
  if (isCompletedTask(task)) return 'completed'
  if (isBlockedTask(task)) return 'blocked'
  if (isInProgressTask(task)) return 'in_progress'
  return 'pending'
}

export const isActiveObstacle = (obstacle: any): boolean => {
  const status = normalizeStatus(obstacle?.status)
  return !['已解决', 'resolved', 'closed'].includes(status)
}

export const isPendingCondition = (condition: any): boolean => {
  if (condition?.is_satisfied !== undefined && condition?.is_satisfied !== null) {
    return !condition.is_satisfied
  }

  const status = normalizeStatus(condition?.status)
  return !['已满足', 'satisfied', 'completed'].includes(status)
}

export const isActiveRisk = (risk: any): boolean => {
  const status = normalizeStatus(risk?.status)
  return !['closed', '已关闭'].includes(status)
}

export const isCompletedMilestone = (milestone: any): boolean => {
  const status = normalizeStatus(milestone?.status)
  return status === '已完成' || status === 'completed'
}
