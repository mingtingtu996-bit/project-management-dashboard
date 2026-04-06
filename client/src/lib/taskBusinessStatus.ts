type TaskLike = {
  id?: string | null
  status?: string | null
  progress?: number | null
  planned_end_date?: string | null
  end_date?: string | null
  parent_id?: string | null
}

type TaskConditionLike = {
  task_id?: string | null
  is_satisfied?: boolean | number | null
  status?: string | null
}

type TaskObstacleLike = {
  task_id?: string | null
  is_resolved?: boolean | number | null
  status?: string | null
}

type RiskLike = {
  status?: string | null
  level?: string | null
}

export type TaskConditionSummary = {
  total: number
  satisfied: number
}

export type TaskBusinessStatusCode =
  | 'completed'
  | 'blocked'
  | 'pending_conditions'
  | 'ready'
  | 'in_progress'
  | 'pending'

export type TaskBusinessStatus = {
  code: TaskBusinessStatusCode
  label: string
}

export type ProjectTaskProgressSnapshot = {
  totalTasks: number
  leafTaskCount: number
  progressBaseTaskCount: number
  completedTaskCount: number
  inProgressTaskCount: number
  delayedTaskCount: number
  delayDays: number
  overallProgress: number
  pendingConditionCount: number
  pendingConditionTaskCount: number
  activeObstacleCount: number
  activeObstacleTaskCount: number
  readyToStartTaskCount: number
  taskConditionMap: Record<string, TaskConditionSummary>
  obstacleCountMap: Record<string, number>
}

const COMPLETED_STATUSES = new Set(['completed', 'done', '已完成'])
const IN_PROGRESS_STATUSES = new Set(['in_progress', 'active', '进行中'])
const TODO_STATUSES = new Set(['todo', 'pending', '未开始', 'not_started'])
const BLOCKED_STATUSES = new Set(['blocked', '受阻', 'obstacle', 'obstructed'])
const SATISFIED_CONDITION_STATUSES = new Set(['completed', 'satisfied', 'confirmed', '已满足', '已确认'])
const RESOLVED_OBSTACLE_STATUSES = new Set(['resolved', 'closed', '已解决', '无法解决'])
const CLOSED_RISK_STATUSES = new Set(['resolved', 'closed', 'mitigated', '已解决'])

export function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

export function isCompletedTask(task: TaskLike): boolean {
  return COMPLETED_STATUSES.has(normalizeStatus(task.status)) || Number(task.progress ?? 0) >= 100
}

export function isInProgressTask(task: TaskLike): boolean {
  return IN_PROGRESS_STATUSES.has(normalizeStatus(task.status))
}

export function isTodoTask(task: TaskLike): boolean {
  const status = normalizeStatus(task.status)
  return status === '' || TODO_STATUSES.has(status)
}

export function isPendingCondition(condition: TaskConditionLike): boolean {
  if (condition.is_satisfied !== undefined && condition.is_satisfied !== null) {
    return !isTruthyFlag(condition.is_satisfied)
  }

  return !SATISFIED_CONDITION_STATUSES.has(normalizeStatus(condition.status))
}

export function isActiveObstacle(obstacle: TaskObstacleLike): boolean {
  if (obstacle.is_resolved !== undefined && obstacle.is_resolved !== null) {
    return !isTruthyFlag(obstacle.is_resolved)
  }

  return !RESOLVED_OBSTACLE_STATUSES.has(normalizeStatus(obstacle.status))
}

export function isActiveRisk(risk: RiskLike): boolean {
  return !CLOSED_RISK_STATUSES.has(normalizeStatus(risk.status))
}

export function getLeafTasks<T extends TaskLike>(tasks: T[]): T[] {
  const parentIds = new Set(tasks.map((task) => task.parent_id).filter(Boolean))
  const leafTasks = tasks.filter((task) => !parentIds.has(task.id ?? ''))
  return leafTasks.length > 0 ? leafTasks : tasks
}

export function isDelayedTask(task: TaskLike): boolean {
  if (isCompletedTask(task)) return false

  const plannedEnd = task.planned_end_date || task.end_date
  if (!plannedEnd) return false

  const plannedEndTime = new Date(plannedEnd).getTime()
  if (Number.isNaN(plannedEndTime)) return false

  return plannedEndTime < Date.now()
}

export function buildTaskConditionSummary(
  conditions: TaskConditionLike[],
): Record<string, TaskConditionSummary> {
  const summaryMap: Record<string, TaskConditionSummary> = {}

  for (const condition of conditions) {
    const taskId = condition.task_id
    if (!taskId) continue

    const current = summaryMap[taskId] ?? { total: 0, satisfied: 0 }
    current.total += 1
    if (!isPendingCondition(condition)) {
      current.satisfied += 1
    }
    summaryMap[taskId] = current
  }

  return summaryMap
}

export function buildTaskObstacleSummary(
  obstacles: TaskObstacleLike[],
): Record<string, number> {
  const countMap: Record<string, number> = {}

  for (const obstacle of obstacles) {
    if (!isActiveObstacle(obstacle) || !obstacle.task_id) continue
    countMap[obstacle.task_id] = (countMap[obstacle.task_id] ?? 0) + 1
  }

  return countMap
}

export function getTaskBusinessStatus(
  task: TaskLike,
  options: {
    conditionSummary?: TaskConditionSummary
    activeObstacleCount?: number
  } = {},
): TaskBusinessStatus {
  const conditionSummary = options.conditionSummary ?? { total: 0, satisfied: 0 }
  const activeObstacleCount = options.activeObstacleCount ?? 0

  if (isCompletedTask(task)) {
    return { code: 'completed', label: '已完成' }
  }

  if (isInProgressTask(task)) {
    if (activeObstacleCount > 0 || BLOCKED_STATUSES.has(normalizeStatus(task.status))) {
      return { code: 'blocked', label: '进行中(有阻碍)' }
    }

    return { code: 'in_progress', label: '进行中' }
  }

  if (activeObstacleCount > 0 || BLOCKED_STATUSES.has(normalizeStatus(task.status))) {
    return { code: 'blocked', label: '受阻' }
  }

  if (conditionSummary.total > 0 && conditionSummary.satisfied < conditionSummary.total) {
    return { code: 'pending_conditions', label: '待开工' }
  }

  if (isTodoTask(task)) {
    return { code: 'ready', label: '可开工' }
  }

  return { code: 'pending', label: '未开始' }
}

export function buildProjectTaskProgressSnapshot(
  tasks: TaskLike[],
  conditions: TaskConditionLike[] = [],
  obstacles: TaskObstacleLike[] = [],
): ProjectTaskProgressSnapshot {
  const taskConditionMap = buildTaskConditionSummary(conditions)
  const obstacleCountMap = buildTaskObstacleSummary(obstacles)
  const leafTasks = getLeafTasks(tasks)
  const progressBaseTaskCount = leafTasks.length > 0 ? leafTasks.length : tasks.length
  const completedTaskCount = leafTasks.filter(isCompletedTask).length
  const inProgressTaskCount = leafTasks.filter(isInProgressTask).length

  let delayedTaskCount = 0
  let delayDays = 0
  let readyToStartTaskCount = 0

  for (const task of leafTasks) {
    const businessStatus = getTaskBusinessStatus(task, {
      conditionSummary: taskConditionMap[task.id ?? ''],
      activeObstacleCount: obstacleCountMap[task.id ?? ''] ?? 0,
    })

    if (businessStatus.code === 'ready') {
      readyToStartTaskCount += 1
    }

    if (!isDelayedTask(task)) continue

    delayedTaskCount += 1
    const plannedEnd = task.planned_end_date || task.end_date
    if (!plannedEnd) continue

    const plannedEndTime = new Date(plannedEnd).getTime()
    if (Number.isNaN(plannedEndTime)) continue

    delayDays += Math.ceil((Date.now() - plannedEndTime) / 86400000)
  }

  const totalProgress = leafTasks.reduce((sum, task) => sum + Number(task.progress ?? 0), 0)
  const overallProgress =
    progressBaseTaskCount > 0 ? Math.round(totalProgress / progressBaseTaskCount) : 0

  const pendingConditions = conditions.filter(isPendingCondition)
  const activeObstacles = obstacles.filter(isActiveObstacle)
  const pendingConditionTaskCount = new Set(
    pendingConditions.map((condition) => condition.task_id).filter(Boolean),
  ).size
  const activeObstacleTaskCount = new Set(
    activeObstacles.map((obstacle) => obstacle.task_id).filter(Boolean),
  ).size

  return {
    totalTasks: tasks.length,
    leafTaskCount: leafTasks.length,
    progressBaseTaskCount,
    completedTaskCount,
    inProgressTaskCount,
    delayedTaskCount,
    delayDays,
    overallProgress,
    pendingConditionCount: pendingConditions.length,
    pendingConditionTaskCount,
    activeObstacleCount: activeObstacles.length,
    activeObstacleTaskCount,
    readyToStartTaskCount,
    taskConditionMap,
    obstacleCountMap,
  }
}

export function calculateProjectHealthScore(input: {
  completedTaskCount: number
  completedMilestones: number
  delayDays: number
  activeRisks: RiskLike[]
}): number {
  const riskPenalty = input.activeRisks.reduce((total, risk) => {
    switch (normalizeStatus(risk.level)) {
      case 'critical':
      case 'high':
        return total - 10
      case 'medium':
        return total - 5
      case 'low':
        return total - 2
      default:
        return total
    }
  }, 0)

  return Math.max(
    0,
    Math.min(
      100,
      50 + input.completedTaskCount * 2 + input.completedMilestones * 5 - Math.min(input.delayDays, 30) + riskPenalty,
    ),
  )
}
