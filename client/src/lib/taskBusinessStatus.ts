type TaskLike = {
  id?: string | null
  status?: string | null
  progress?: number | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  end_date?: string | null
  parent_id?: string | null
  is_critical?: boolean | null
  lagLevel?: 'none' | 'mild' | 'moderate' | 'severe' | null
  lagStatus?: '正常' | '轻度滞后' | '中度滞后' | '严重滞后' | null
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

export type TaskLagLevel = 'none' | 'mild' | 'moderate' | 'severe'
export type TaskLagStatus = '正常' | '轻度滞后' | '中度滞后' | '严重滞后'

export type TaskBusinessStatusCode =
  | 'completed'
  | 'lagging_severe'
  | 'lagging_moderate'
  | 'lagging_mild'
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
  laggedTaskCount: number
  taskConditionMap: Record<string, TaskConditionSummary>
  obstacleCountMap: Record<string, number>
}

export const TASK_STATUS_THEME = {
  completed: {
    code: 'completed',
    label: '\u5df2\u5b8c\u6210',
    cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  },
  lagging_severe: {
    code: 'lagging_severe',
    label: '严重滞后',
    cls: 'bg-orange-100 text-orange-700 border border-orange-200',
  },
  lagging_moderate: {
    code: 'lagging_moderate',
    label: '中度滞后',
    cls: 'bg-amber-100 text-amber-700 border border-amber-200',
  },
  lagging_mild: {
    code: 'lagging_mild',
    label: '轻度滞后',
    cls: 'bg-amber-50 text-amber-600 border border-amber-200',
  },
  pending_conditions: {
    code: 'pending_conditions',
    label: '\u5f85\u5f00\u5de5',
    cls: 'bg-orange-100 text-orange-700 border border-orange-200',
  },
  ready: {
    code: 'ready',
    label: '\u53ef\u5f00\u5de5',
    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  in_progress: {
    code: 'in_progress',
    label: '\u8fdb\u884c\u4e2d',
    cls: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
  pending: {
    code: 'pending',
    label: '\u672a\u5f00\u59cb',
    cls: 'bg-slate-100 text-slate-600 border border-slate-200',
  },
} as const

const COMPLETED_STATUSES = new Set(['completed', 'done', '\u5df2\u5b8c\u6210'])
const IN_PROGRESS_STATUSES = new Set(['in_progress', 'blocked'])
const TODO_STATUSES = new Set(['todo'])
const SATISFIED_CONDITION_STATUSES = new Set(['completed', 'satisfied', 'confirmed', '\u5df2\u6ee1\u8db3', '\u5df2\u786e\u8ba4'])
const RESOLVED_OBSTACLE_STATUSES = new Set(['resolved', 'closed', '\u5df2\u89e3\u51b3'])
const CLOSED_RISK_STATUSES = new Set(['closed', '\u5df2\u5173\u95ed'])

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

export function isBlockedTask(task: TaskLike): boolean {
  const status = normalizeStatus(task.status)
  return ['blocked', '受阻', 'obstacle', 'obstructed'].includes(status)
}

export function getTaskDisplayStatus(task: TaskLike): 'pending' | 'in_progress' | 'blocked' | 'completed' {
  if (isCompletedTask(task)) {
    return 'completed'
  }

  if (isBlockedTask(task)) {
    return 'blocked'
  }

  if (isInProgressTask(task)) {
    return 'in_progress'
  }

  return 'pending'
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

function normalizeLagLevel(value: unknown): TaskLagLevel | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  switch (normalized) {
    case 'none':
    case 'normal':
    case '正常':
      return 'none'
    case 'mild':
    case '轻度滞后':
      return 'mild'
    case 'moderate':
    case '中度滞后':
      return 'moderate'
    case 'severe':
    case '严重滞后':
      return 'severe'
    default:
      return null
  }
}

function normalizeLagStatus(value: unknown): TaskLagStatus | null {
  const normalized = String(value ?? '').trim()
  switch (normalized) {
    case '正常':
      return '正常'
    case '轻度滞后':
      return '轻度滞后'
    case '中度滞后':
      return '中度滞后'
    case '严重滞后':
      return '严重滞后'
    default:
      return null
  }
}

function calculateLegacyLagLevel(task: TaskLike): TaskLagLevel | null {
  const status = normalizeStatus(task.status)
  if (status !== 'in_progress' && status !== 'blocked') return null
  if (!task.planned_start_date || !task.planned_end_date) return null

  const start = new Date(task.planned_start_date).getTime()
  const end = new Date(task.planned_end_date).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null

  const duration = Math.round((end - start) / 86400000)
  if (duration <= 3) return null

  const now = Date.now()
  if (now >= end) return null

  const elapsed = Math.max(0, Math.round((now - start) / 86400000))
  const timeRatio = elapsed / duration
  if (timeRatio <= 0) return null

  const progress = Number(task.progress ?? 0)
  const biasRatio = (progress / 100) / timeRatio
  const remaining = Math.round((end - now) / 86400000)
  const threshold = task.is_critical ? 0.8 : 0.7

  if (biasRatio < 0.5 && remaining < 3) return 'severe'
  if (biasRatio < 0.5) return 'moderate'
  if (biasRatio < threshold) return 'mild'
  return null
}

export function getTaskLagLevel(task: TaskLike): TaskLagLevel | null {
  const explicitLagLevel = normalizeLagLevel(task.lagLevel)
  if (explicitLagLevel !== null) {
    return explicitLagLevel === 'none' ? null : explicitLagLevel
  }

  const explicitLagStatus = normalizeLagStatus(task.lagStatus)
  if (explicitLagStatus) {
    switch (explicitLagStatus) {
      case '轻度滞后':
        return 'mild'
      case '中度滞后':
        return 'moderate'
      case '严重滞后':
        return 'severe'
      default:
        return null
    }
  }

  return calculateLegacyLagLevel(task)
}

export function getTaskLagStatus(task: TaskLike): TaskLagStatus {
  const explicitLagStatus = normalizeLagStatus(task.lagStatus)
  if (explicitLagStatus) {
    return explicitLagStatus
  }

  const lagLevel = getTaskLagLevel(task) ?? 'none'
  switch (lagLevel) {
    case 'mild':
      return '轻度滞后'
    case 'moderate':
      return '中度滞后'
    case 'severe':
      return '严重滞后'
    default:
      return '正常'
  }
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

export type LaggingLevel = 'lagging_severe' | 'lagging_moderate' | 'lagging_mild'

export function isLaggingTask(task: TaskLike): LaggingLevel | null {
  const lagLevel = getTaskLagLevel(task)
  if (!lagLevel) return null

  switch (lagLevel) {
    case 'mild':
      return 'lagging_mild'
    case 'moderate':
      return 'lagging_moderate'
    case 'severe':
      return 'lagging_severe'
    default:
      return null
  }
}

export function getTaskBusinessStatus(
  task: TaskLike,
  options: {
    conditionSummary?: TaskConditionSummary
    activeObstacleCount?: number
  } = {},
): TaskBusinessStatus {
  const conditionSummary = options.conditionSummary ?? { total: 0, satisfied: 0 }

  if (isCompletedTask(task)) {
    return TASK_STATUS_THEME.completed
  }

  const laggingLevel = isLaggingTask(task)
  if (laggingLevel) {
    return TASK_STATUS_THEME[laggingLevel]
  }

  if (isInProgressTask(task)) {
    return TASK_STATUS_THEME.in_progress
  }

  if (conditionSummary.total > 0 && conditionSummary.satisfied < conditionSummary.total) {
    return TASK_STATUS_THEME.pending_conditions
  }

  if (isTodoTask(task)) {
    return TASK_STATUS_THEME.ready
  }

  return TASK_STATUS_THEME.pending
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
  const laggedTaskCount = leafTasks.filter((task) => getTaskLagLevel(task) !== null).length

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
    laggedTaskCount,
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

