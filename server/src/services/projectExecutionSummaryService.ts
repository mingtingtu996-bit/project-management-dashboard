import { executeSQL, getProject, getProjects, getRisks, getTasks } from './dbService.js'
import { calculateProjectHealth } from './projectHealthService.js'
import { logger } from '../middleware/logger.js'
import type {
  DelayRequest,
  MonthlyPlan,
  Notification,
  PlanningGovernanceState,
  Project,
  Risk,
  Task,
} from '../types/db.js'
import {
  FAILED_ACCEPTANCE_STATUSES as FAILED_ACCEPTANCE_STATUS_VALUES,
  IN_PROGRESS_ACCEPTANCE_STATUSES as IN_PROGRESS_ACCEPTANCE_STATUS_VALUES,
  PASSED_ACCEPTANCE_STATUSES as PASSED_ACCEPTANCE_STATUS_VALUES,
  normalizeAcceptanceStatus,
} from '../utils/acceptanceStatus.js'

type TaskConditionRow = {
  id: string
  project_id?: string | null
  task_id?: string | null
  is_satisfied?: boolean | number | null
  status?: string | null
}

type TaskObstacleRow = {
  id: string
  project_id?: string | null
  task_id?: string | null
  is_resolved?: boolean | number | null
  status?: string | null
}

type PreMilestoneRow = {
  id: string
  project_id?: string | null
  status?: string | null
}

type AcceptancePlanRow = {
  id: string
  project_id?: string | null
  status?: string | null
}

type ConstructionDrawingRow = {
  id: string
  project_id?: string | null
  status?: string | null
  review_status?: string | null
}

type DelayRequestRow = Pick<DelayRequest, 'id' | 'project_id' | 'task_id' | 'status' | 'created_at' | 'updated_at'>

type MonthlyPlanRow = Pick<MonthlyPlan, 'id' | 'project_id' | 'status' | 'month' | 'closeout_at' | 'created_at' | 'updated_at'>

type NotificationRow = Pick<Notification, 'id' | 'project_id' | 'severity' | 'level' | 'title' | 'content' | 'status' | 'is_read' | 'created_at'>

export type MonthlyCloseStatus = '未开始' | '进行中' | '已完成' | '已超期'
export type WarningSignalLevel = 'info' | 'warning' | 'critical' | null

async function loadPlanningGovernanceStates(projectId?: string): Promise<PlanningGovernanceState[]> {
  if (projectId) {
    return await executeSQL<PlanningGovernanceState>(
      'SELECT * FROM planning_governance_states WHERE project_id = ? ORDER BY created_at DESC',
      [projectId],
    )
  }

  return await executeSQL<PlanningGovernanceState>(
    'SELECT * FROM planning_governance_states ORDER BY created_at DESC',
  )
}

type NextMilestoneSummary = {
  id: string
  name: string
  targetDate: string
  status: string
  daysRemaining: number
}

type MilestoneLifecycleStatus = 'completed' | 'overdue' | 'soon' | 'upcoming'

export interface MilestoneOverviewItem {
  id: string
  name: string
  description: string
  targetDate: string | null
  progress: number
  status: MilestoneLifecycleStatus
  statusLabel: string
  updatedAt: string
}

export interface MilestoneOverviewStats {
  total: number
  pending: number
  completed: number
  overdue: number
  upcomingSoon: number
  completionRate: number
}

export interface MilestoneOverview {
  items: MilestoneOverviewItem[]
  stats: MilestoneOverviewStats
}

export interface ProjectExecutionSummary {
  id: string
  name: string
  status: string
  statusLabel: string
  plannedEndDate: string | null
  daysUntilPlannedEnd: number | null
  totalTasks: number
  leafTaskCount: number
  completedTaskCount: number
  inProgressTaskCount: number
  delayedTaskCount: number
  delayDays: number
  delayCount: number
  overallProgress: number
  taskProgress: number
  totalMilestones: number
  completedMilestones: number
  milestoneProgress: number
  riskCount: number
  activeRiskCount: number
  pendingConditionCount: number
  pendingConditionTaskCount: number
  activeObstacleCount: number
  activeObstacleTaskCount: number
  preMilestoneCount: number
  completedPreMilestoneCount: number
  activePreMilestoneCount: number
  overduePreMilestoneCount: number
  acceptancePlanCount: number
  passedAcceptancePlanCount: number
  inProgressAcceptancePlanCount: number
  failedAcceptancePlanCount: number
  constructionDrawingCount: number
  issuedConstructionDrawingCount: number
  reviewingConstructionDrawingCount: number
  attentionRequired: boolean
  scheduleVarianceDays: number
  activeDelayRequests: number
  activeObstacles: number
  monthlyCloseStatus: MonthlyCloseStatus
  closeoutOverdueDays: number
  unreadWarningCount: number
  highestWarningLevel: WarningSignalLevel
  highestWarningSummary: string | null
  shiftedMilestoneCount: number
  criticalPathAffectedTasks: number
  healthScore: number
  healthStatus: '健康' | '亚健康' | '预警' | '危险'
  nextMilestone: NextMilestoneSummary | null
  milestoneOverview: MilestoneOverview
  planningGovernance: GovernanceStateSummary
}

const COMPLETED_STATUSES = new Set(['completed', 'done', '已完成'])
const IN_PROGRESS_STATUSES = new Set(['in_progress', 'active', '进行中'])
const CLOSED_RISK_STATUSES = new Set(['resolved', 'closed', 'mitigated', '已解决'])
const SATISFIED_CONDITION_STATUSES = new Set(['completed', 'satisfied', 'confirmed', '已满足', '已确认'])
const RESOLVED_OBSTACLE_STATUSES = new Set(['resolved', 'closed', '已解决'])

const COMPLETED_PRE_MILESTONE_STATUSES = new Set(['已取得', '已完成', '已批复', 'issued', 'voided', 'approved'])
const ACTIVE_PRE_MILESTONE_STATUSES = new Set(['待申请', '办理中', 'pending', 'preparing_documents', 'internal_review', 'external_submission', 'supplement_required'])
const OVERDUE_PRE_MILESTONE_STATUSES = new Set(['已过期', '需延期', 'expired'])
const PASSED_ACCEPTANCE_STATUSES = new Set(PASSED_ACCEPTANCE_STATUS_VALUES)
const IN_PROGRESS_ACCEPTANCE_STATUSES = new Set(IN_PROGRESS_ACCEPTANCE_STATUS_VALUES)
const FAILED_ACCEPTANCE_STATUSES = new Set(FAILED_ACCEPTANCE_STATUS_VALUES)
const ISSUED_DRAWING_STATUSES = new Set(['已通过', '已出图'])
const REVIEWING_DRAWING_STATUSES = new Set(['编制中', '审图中', '审查中', '未提交', '需修改'])

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isCompletedTask(task: Partial<Task>): boolean {
  return COMPLETED_STATUSES.has(normalizeStatus(task.status)) || Number(task.progress ?? 0) >= 100
}

function isInProgressTask(task: Partial<Task>): boolean {
  return IN_PROGRESS_STATUSES.has(normalizeStatus(task.status))
}

function isCompletedMilestone(task: Partial<Task>): boolean {
  return Boolean(task.is_milestone) && isCompletedTask(task)
}

function isActiveRisk(risk: Partial<Risk>): boolean {
  return !CLOSED_RISK_STATUSES.has(normalizeStatus(risk.status))
}

function isPendingCondition(condition: TaskConditionRow): boolean {
  if (condition.is_satisfied !== undefined && condition.is_satisfied !== null) {
    return !Boolean(condition.is_satisfied)
  }
  return !SATISFIED_CONDITION_STATUSES.has(normalizeStatus(condition.status))
}

function isActiveObstacle(obstacle: TaskObstacleRow): boolean {
  if (obstacle.is_resolved !== undefined && obstacle.is_resolved !== null) {
    return !Boolean(obstacle.is_resolved)
  }
  return !RESOLVED_OBSTACLE_STATUSES.has(normalizeStatus(obstacle.status))
}

function getProjectStatusLabel(status?: string | null): string {
  switch (normalizeStatus(status)) {
    case 'completed':
    case '已完成':
      return '已完成'
    case 'archived':
    case 'paused':
    case '已暂停':
      return '已暂停'
    case 'active':
    case 'in_progress':
    case '进行中':
      return '进行中'
    default:
      return '未开始'
  }
}

function getHealthStatus(score: number): ProjectExecutionSummary['healthStatus'] {
  if (score >= 80) return '健康'
  if (score >= 60) return '亚健康'
  if (score >= 40) return '预警'
  return '危险'
}

function getLeafTasks(tasks: Task[]): Task[] {
  const parentIds = new Set(tasks.map((task) => task.parent_id).filter(Boolean))
  const leafTasks = tasks.filter((task) => !parentIds.has(task.id))
  return leafTasks.length > 0 ? leafTasks : tasks
}

function getPlannedEndDate(task: Partial<Task>): string | null {
  return task.planned_end_date || task.end_date || null
}

function getActualEndDate(task: Partial<Task>): string | null {
  return task.actual_end_date || null
}

function getDelayMetrics(tasks: Task[]): {
  delayedTaskCount: number
  delayDays: number
  delayCount: number
} {
  const today = new Date()
  let delayedTaskCount = 0
  let delayDays = 0
  let delayCount = 0

  for (const task of tasks) {
    const plannedEnd = getPlannedEndDate(task)
    if (!plannedEnd) continue

    const plannedEndDate = new Date(plannedEnd)
    if (Number.isNaN(plannedEndDate.getTime())) continue

    const actualEnd = getActualEndDate(task)

    if (isCompletedTask(task) && actualEnd) {
      const actualEndDate = new Date(actualEnd)
      if (!Number.isNaN(actualEndDate.getTime()) && actualEndDate.getTime() > plannedEndDate.getTime()) {
        delayedTaskCount += 1
        delayDays += Math.ceil((actualEndDate.getTime() - plannedEndDate.getTime()) / 86400000)
      }
      continue
    }

    if (!isCompletedTask(task) && plannedEndDate.getTime() < today.getTime()) {
      delayedTaskCount += 1
      delayDays += Math.ceil((today.getTime() - plannedEndDate.getTime()) / 86400000)
    }

    delayCount += Number((task as any).delay_count ?? 0)
  }

  if (delayCount === 0) {
    delayCount = delayedTaskCount
  }

  return { delayedTaskCount, delayDays, delayCount }
}

function isPendingDelayRequest(request: DelayRequestRow): boolean {
  return normalizeStatus(request.status) === 'pending'
}

function getCurrentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getCurrentMonthlyPlan(plans: MonthlyPlanRow[], now = new Date()): MonthlyPlanRow | null {
  const currentMonth = getCurrentMonthKey(now)
  const currentPlans = plans
    .filter((plan) => String(plan.month ?? '').trim() === currentMonth)
    .sort((left, right) => {
      const leftTime = new Date(String(left.updated_at || left.created_at || '')).getTime()
      const rightTime = new Date(String(right.updated_at || right.created_at || '')).getTime()
      return rightTime - leftTime
    })

  return currentPlans[0] ?? null
}

function getCloseoutOverdueDays(states: PlanningGovernanceState[] = []): number {
  let maxOverdueDays = 0

  for (const state of states) {
    if (state.status !== 'active') continue
    if (!['closeout_overdue_signal', 'closeout_force_unlock'].includes(String(state.kind ?? ''))) continue

    const overdueDays = Number((state.payload as Record<string, unknown> | null | undefined)?.overdue_days ?? 0)
    if (Number.isFinite(overdueDays) && overdueDays > maxOverdueDays) {
      maxOverdueDays = overdueDays
    }
  }

  return maxOverdueDays
}

export function deriveMonthlyCloseStatus(
  plans: MonthlyPlanRow[] = [],
  governanceStates: PlanningGovernanceState[] = [],
  now = new Date(),
): MonthlyCloseStatus {
  const overdueDays = getCloseoutOverdueDays(governanceStates)
  if (overdueDays > 0) {
    return '已超期'
  }

  const currentPlan = getCurrentMonthlyPlan(plans, now)
  if (!currentPlan) {
    return '未开始'
  }

  if (currentPlan.closeout_at || normalizeStatus(currentPlan.status) === 'closed') {
    return '已完成'
  }

  return '进行中'
}

function isShiftedMilestone(task: Partial<Task>): boolean {
  if (!task.is_milestone) return false

  const plannedEnd = getPlannedEndDate(task)
  if (!plannedEnd) return false
  const plannedTime = new Date(plannedEnd).getTime()
  if (Number.isNaN(plannedTime)) return false

  const actualEnd = getActualEndDate(task)
  if (actualEnd) {
    const actualTime = new Date(actualEnd).getTime()
    return Number.isFinite(actualTime) && actualTime > plannedTime
  }

  return !isCompletedTask(task) && plannedTime < Date.now()
}

function getShiftedMilestoneCount(tasks: Task[]): number {
  return tasks.filter((task) => isShiftedMilestone(task)).length
}

function getCriticalPathAffectedTaskCount(
  tasks: Task[],
  pendingConditions: TaskConditionRow[],
  activeObstacles: TaskObstacleRow[],
): number {
  const pendingConditionTaskIds = new Set(pendingConditions.map((item) => String(item.task_id ?? '')).filter(Boolean))
  const activeObstacleTaskIds = new Set(activeObstacles.map((item) => String(item.task_id ?? '')).filter(Boolean))

  return tasks.filter((task) => {
    if (!task.is_critical) return false

    const plannedEnd = getPlannedEndDate(task)
    const plannedTime = plannedEnd ? new Date(plannedEnd).getTime() : Number.NaN
    const isDelayed =
      Number.isFinite(plannedTime)
      && ((isCompletedTask(task) && Boolean(getActualEndDate(task)) && new Date(getActualEndDate(task) as string).getTime() > plannedTime)
        || (!isCompletedTask(task) && plannedTime < Date.now()))

    return (
      isDelayed
      || pendingConditionTaskIds.has(task.id)
      || activeObstacleTaskIds.has(task.id)
    )
  }).length
}

function getWarningLevelRank(level: WarningSignalLevel): number {
  switch (level) {
    case 'critical':
      return 3
    case 'warning':
      return 2
    case 'info':
      return 1
    default:
      return 0
  }
}

function normalizeWarningLevel(notification: NotificationRow): WarningSignalLevel {
  const normalized = normalizeStatus(notification.severity || notification.level)
  if (normalized === 'critical') return 'critical'
  if (normalized === 'warning') return 'warning'
  if (normalized === 'info') return 'info'
  return null
}

function isUnreadNotification(notification: NotificationRow): boolean {
  if (Boolean(notification.is_read)) return false

  const normalizedStatus = normalizeStatus(notification.status)
  if (['read', 'resolved', 'archived'].includes(normalizedStatus)) {
    return false
  }

  return true
}

export function summarizeUnreadWarningSignals(notifications: NotificationRow[] = []): {
  unreadWarningCount: number
  highestWarningLevel: WarningSignalLevel
  highestWarningSummary: string | null
} {
  const unreadNotifications = notifications.filter(isUnreadNotification)

  if (unreadNotifications.length === 0) {
    return {
      unreadWarningCount: 0,
      highestWarningLevel: null,
      highestWarningSummary: null,
    }
  }

  const sorted = [...unreadNotifications].sort((left, right) => {
    const severityDiff = getWarningLevelRank(normalizeWarningLevel(right)) - getWarningLevelRank(normalizeWarningLevel(left))
    if (severityDiff !== 0) return severityDiff

    const leftTime = new Date(String(left.created_at ?? '')).getTime()
    const rightTime = new Date(String(right.created_at ?? '')).getTime()
    return rightTime - leftTime
  })

  const topNotification = sorted[0]
  const summary = String(topNotification?.title || topNotification?.content || '').trim()

  return {
    unreadWarningCount: unreadNotifications.length,
    highestWarningLevel: normalizeWarningLevel(topNotification),
    highestWarningSummary: summary || null,
  }
}

function calculateOverallProgress(tasks: Task[]): number {
  const leafTasks = getLeafTasks(tasks)
  if (leafTasks.length === 0) return 0
  const totalProgress = leafTasks.reduce((sum, task) => sum + Number(task.progress ?? 0), 0)
  return Math.round(totalProgress / leafTasks.length)
}

function getNextMilestone(tasks: Task[]): NextMilestoneSummary | null {
  const now = new Date()
  const pendingMilestones = tasks
    .filter((task) => task.is_milestone && !isCompletedMilestone(task))
    .map((task) => {
      const targetDate = getPlannedEndDate(task)
      return {
        task,
        targetDate,
      }
    })
    .filter((item) => item.targetDate)
    .sort((left, right) => {
      return new Date(left.targetDate as string).getTime() - new Date(right.targetDate as string).getTime()
    })

  if (pendingMilestones.length === 0) {
    return null
  }

  const next = pendingMilestones[0]
  const targetDate = new Date(next.targetDate as string)
  const daysRemaining = Math.ceil((targetDate.getTime() - now.getTime()) / 86400000)

  return {
    id: next.task.id,
    name: next.task.title || next.task.description || '未命名里程碑',
    targetDate: next.targetDate as string,
    status: next.task.status,
    daysRemaining,
  }
}

function getMilestoneTargetDate(task: Pick<Task, 'planned_end_date' | 'end_date'>): string | null {
  return String(task.planned_end_date || task.end_date || '').trim() || null
}

function getMilestoneLifecycleStatus(
  task: Pick<Task, 'status' | 'planned_end_date' | 'end_date'>,
  now = Date.now(),
): MilestoneLifecycleStatus {
  if (isCompletedTask(task)) return 'completed'

  const targetDate = getMilestoneTargetDate(task)
  if (!targetDate) return 'upcoming'

  const targetTime = new Date(targetDate).getTime()
  if (Number.isNaN(targetTime)) return 'upcoming'

  const daysUntil = Math.ceil((targetTime - now) / 86400000)
  if (daysUntil < 0) return 'overdue'
  if (daysUntil <= 7) return 'soon'
  return 'upcoming'
}

function getMilestoneStatusLabel(status: MilestoneLifecycleStatus): string {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'overdue':
      return '已逾期'
    case 'soon':
      return '即将到期'
    default:
      return '待完成'
  }
}

export function buildMilestoneOverview(tasks: Task[] = []): MilestoneOverview {
  const items = tasks
    .filter((task) => task.is_milestone)
    .map((task) => {
      const status = getMilestoneLifecycleStatus(task)
      const targetDate = getMilestoneTargetDate(task)

      return {
        id: String(task.id ?? ''),
        name: String(task.title || '未命名里程碑').trim() || '未命名里程碑',
        description: String(task.description || '').trim(),
        targetDate,
        progress: isCompletedTask(task) ? 100 : Math.max(0, Math.min(100, Number(task.progress ?? 0))),
        status,
        statusLabel: getMilestoneStatusLabel(status),
        updatedAt: String(task.updated_at || task.created_at || '').trim(),
      }
    })
    .sort((left, right) => {
      const statusOrder: Record<MilestoneLifecycleStatus, number> = {
        overdue: 0,
        soon: 1,
        upcoming: 2,
        completed: 3,
      }

      const statusDiff = statusOrder[left.status] - statusOrder[right.status]
      if (statusDiff !== 0) return statusDiff

      const toTime = (value: string | null) => {
        if (!value) return Number.POSITIVE_INFINITY
        const time = new Date(value).getTime()
        return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
      }

      const dateDiff = toTime(left.targetDate) - toTime(right.targetDate)
      if (dateDiff !== 0) return dateDiff

      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    })

  const completed = items.filter((item) => item.status === 'completed').length
  const overdue = items.filter((item) => item.status === 'overdue').length
  const upcomingSoon = items.filter((item) => item.status === 'soon').length
  const pending = items.length - completed

  return {
    items,
    stats: {
      total: items.length,
      pending,
      completed,
      overdue,
      upcomingSoon,
      completionRate: items.length > 0 ? Math.round((completed / items.length) * 100) : 0,
    },
  }
}

export interface SupplementaryProjectSummary {
  preMilestoneCount: number
  completedPreMilestoneCount: number
  activePreMilestoneCount: number
  overduePreMilestoneCount: number
  acceptancePlanCount: number
  passedAcceptancePlanCount: number
  inProgressAcceptancePlanCount: number
  failedAcceptancePlanCount: number
  constructionDrawingCount: number
  issuedConstructionDrawingCount: number
  reviewingConstructionDrawingCount: number
}

export function summarizePlanningGovernanceStates(states: PlanningGovernanceState[] = []): GovernanceStateSummary {
  const activeStates = states.filter((state) => state.status === 'active')
  return {
    activeCount: activeStates.length,
    closeoutOverdueSignalCount: activeStates.filter((state) => state.kind === 'closeout_overdue_signal').length,
    closeoutForceUnlockCount: activeStates.filter((state) => state.kind === 'closeout_force_unlock').length,
    reorderReminderCount: activeStates.filter((state) => state.kind === 'reorder_reminder').length,
    reorderEscalationCount: activeStates.filter((state) => state.kind === 'reorder_escalation').length,
    reorderSummaryCount: states.filter((state) => state.kind === 'reorder_summary').length,
    adHocReminderCount: activeStates.filter((state) => state.kind === 'ad_hoc_cross_month_reminder').length,
    dashboardCloseoutOverdue: activeStates.some((state) => state.kind === 'closeout_overdue_signal' && state.dashboard_signal),
    dashboardForceUnlockAvailable: activeStates.some((state) => state.kind === 'closeout_force_unlock'),
    hasActiveGovernanceSignal: activeStates.length > 0,
  }
}

function isInSet(value: unknown, candidates: Set<string>): boolean {
  return candidates.has(normalizeStatus(value))
}

function isAcceptanceStatusInSet(value: unknown, candidates: Set<string>): boolean {
  return candidates.has(normalizeAcceptanceStatus(String(value ?? '')).trim().toLowerCase())
}

export function summarizeSupplementaryProjectData(input: {
  preMilestones: PreMilestoneRow[]
  acceptancePlans: AcceptancePlanRow[]
  constructionDrawings: ConstructionDrawingRow[]
}): SupplementaryProjectSummary {
  const preMilestoneCount = input.preMilestones.length
  const completedPreMilestoneCount = input.preMilestones.filter((item) => isInSet(item.status, COMPLETED_PRE_MILESTONE_STATUSES)).length
  const overduePreMilestoneCount = input.preMilestones.filter((item) => isInSet(item.status, OVERDUE_PRE_MILESTONE_STATUSES)).length
  const activePreMilestoneCount =
    input.preMilestones.filter((item) => isInSet(item.status, ACTIVE_PRE_MILESTONE_STATUSES)).length ||
    Math.max(0, preMilestoneCount - completedPreMilestoneCount - overduePreMilestoneCount)

  const acceptancePlanCount = input.acceptancePlans.length
  const passedAcceptancePlanCount = input.acceptancePlans.filter((item) => isAcceptanceStatusInSet(item.status, PASSED_ACCEPTANCE_STATUSES)).length
  const inProgressAcceptancePlanCount = input.acceptancePlans.filter((item) => isAcceptanceStatusInSet(item.status, IN_PROGRESS_ACCEPTANCE_STATUSES)).length
  const failedAcceptancePlanCount = input.acceptancePlans.filter((item) => isAcceptanceStatusInSet(item.status, FAILED_ACCEPTANCE_STATUSES)).length

  const constructionDrawingCount = input.constructionDrawings.length
  const issuedConstructionDrawingCount = input.constructionDrawings.filter(
    (item) => isAcceptanceStatusInSet(item.review_status, PASSED_ACCEPTANCE_STATUSES),
  ).length
  const reviewingConstructionDrawingCount = input.constructionDrawings.filter(
    (item) => REVIEWING_DRAWING_STATUSES.has(String(item.status ?? '')) ||
      isAcceptanceStatusInSet(item.review_status, IN_PROGRESS_ACCEPTANCE_STATUSES),
  ).length

  return {
    preMilestoneCount,
    completedPreMilestoneCount,
    activePreMilestoneCount,
    overduePreMilestoneCount,
    acceptancePlanCount,
    passedAcceptancePlanCount,
    inProgressAcceptancePlanCount,
    failedAcceptancePlanCount,
    constructionDrawingCount,
    issuedConstructionDrawingCount,
    reviewingConstructionDrawingCount,
  }
}

function calculateSummaryForProject(
  project: Project,
  tasks: Task[],
  risks: Risk[],
  conditions: TaskConditionRow[],
  obstacles: TaskObstacleRow[],
  delayRequests: DelayRequestRow[],
  monthlyPlans: MonthlyPlanRow[],
  notifications: NotificationRow[],
  supplementary: SupplementaryProjectSummary,
  governanceStates: PlanningGovernanceState[] = [],
  health: { score: number; status: ProjectExecutionSummary['healthStatus'] },
): ProjectExecutionSummary {
  const leafTasks = getLeafTasks(tasks)
  const completedTaskCount = leafTasks.filter(isCompletedTask).length
  const inProgressTaskCount = leafTasks.filter(isInProgressTask).length
  const overallProgress = calculateOverallProgress(tasks)
  const milestoneOverview = buildMilestoneOverview(tasks)
  const completedMilestones = milestoneOverview.stats.completed
  const milestoneProgress = milestoneOverview.stats.completionRate
  const activeRisks = risks.filter(isActiveRisk)
  const pendingConditions = conditions.filter(isPendingCondition)
  const activeObstacles = obstacles.filter(isActiveObstacle)
  const pendingConditionTaskCount = new Set(pendingConditions.map((item) => item.task_id).filter(Boolean)).size
  const activeObstacleTaskCount = new Set(activeObstacles.map((item) => item.task_id).filter(Boolean)).size
  const activeDelayRequests = delayRequests.filter(isPendingDelayRequest).length
  const { delayedTaskCount, delayDays, delayCount } = getDelayMetrics(leafTasks)
  const planningGovernance = summarizePlanningGovernanceStates(governanceStates)
  const attentionRequired = health.score < 60 || milestoneOverview.stats.overdue > 0
  const monthlyCloseStatus = deriveMonthlyCloseStatus(monthlyPlans, governanceStates)
  const closeoutOverdueDays = getCloseoutOverdueDays(governanceStates)
  const warningSignals = summarizeUnreadWarningSignals(notifications)
  const shiftedMilestoneCount = getShiftedMilestoneCount(tasks)
  const criticalPathAffectedTasks = getCriticalPathAffectedTaskCount(leafTasks, pendingConditions, activeObstacles)
  const plannedEndDate = project.planned_end_date || project.end_date || null
  const daysUntilPlannedEnd = plannedEndDate
    ? Math.ceil((new Date(plannedEndDate).getTime() - Date.now()) / 86400000)
    : null

  return {
    id: project.id,
    name: project.name,
    status: project.status,
    statusLabel: getProjectStatusLabel(project.status),
    plannedEndDate,
    daysUntilPlannedEnd,
    totalTasks: tasks.length,
    leafTaskCount: leafTasks.length,
    completedTaskCount,
    inProgressTaskCount,
    delayedTaskCount,
    delayDays,
    delayCount,
    overallProgress,
    taskProgress: overallProgress,
    totalMilestones: milestoneOverview.stats.total,
    completedMilestones,
    milestoneProgress,
    riskCount: activeRisks.length,
    activeRiskCount: activeRisks.length,
    pendingConditionCount: pendingConditions.length,
    pendingConditionTaskCount,
    activeObstacleCount: activeObstacles.length,
    activeObstacleTaskCount,
    preMilestoneCount: supplementary.preMilestoneCount,
    completedPreMilestoneCount: supplementary.completedPreMilestoneCount,
    activePreMilestoneCount: supplementary.activePreMilestoneCount,
    overduePreMilestoneCount: supplementary.overduePreMilestoneCount,
    acceptancePlanCount: supplementary.acceptancePlanCount,
    passedAcceptancePlanCount: supplementary.passedAcceptancePlanCount,
    inProgressAcceptancePlanCount: supplementary.inProgressAcceptancePlanCount,
    failedAcceptancePlanCount: supplementary.failedAcceptancePlanCount,
    constructionDrawingCount: supplementary.constructionDrawingCount,
    issuedConstructionDrawingCount: supplementary.issuedConstructionDrawingCount,
    reviewingConstructionDrawingCount: supplementary.reviewingConstructionDrawingCount,
    attentionRequired,
    scheduleVarianceDays: delayDays,
    activeDelayRequests,
    activeObstacles: activeObstacles.length,
    monthlyCloseStatus,
    closeoutOverdueDays,
    unreadWarningCount: warningSignals.unreadWarningCount,
    highestWarningLevel: warningSignals.highestWarningLevel,
    highestWarningSummary: warningSignals.highestWarningSummary,
    shiftedMilestoneCount,
    criticalPathAffectedTasks,
    healthScore: health.score,
    healthStatus: health.status,
    nextMilestone: getNextMilestone(tasks),
    milestoneOverview,
    planningGovernance,
  }
}

export interface GovernanceStateSummary {
  activeCount: number
  closeoutOverdueSignalCount: number
  closeoutForceUnlockCount: number
  reorderReminderCount: number
  reorderEscalationCount: number
  reorderSummaryCount: number
  adHocReminderCount: number
  dashboardCloseoutOverdue: boolean
  dashboardForceUnlockAvailable: boolean
  hasActiveGovernanceSignal: boolean
}

function getPersistedProjectHealth(project: Pick<Project, 'health_score' | 'health_status'>): {
  score: number
  status: ProjectExecutionSummary['healthStatus']
} {
  const score = Number(project.health_score ?? 0)
  const normalizedScore = Number.isFinite(score) ? score : 0
  const status = String(project.health_status ?? '').trim()

  if (status === '健康' || status === '亚健康' || status === '预警' || status === '危险') {
    return { score: normalizedScore, status }
  }

  return {
    score: normalizedScore,
    status: getHealthStatus(normalizedScore),
  }
}

async function resolveSummaryHealth(
  project: Pick<Project, 'id' | 'health_score' | 'health_status'>,
  options?: { preferPersisted?: boolean },
): Promise<{
  score: number
  status: ProjectExecutionSummary['healthStatus']
}> {
  const persisted = getPersistedProjectHealth(project)

  if (options?.preferPersisted) {
    return persisted
  }

  try {
    const health = await calculateProjectHealth(project.id)
    return {
      score: health.score,
      status: health.details.healthStatus,
    }
  } catch (error) {
    logger.warn('[projectExecutionSummaryService] failed to recalculate project health, fallback to persisted summary value', {
      projectId: project.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return persisted
  }
}

export async function getProjectExecutionSummary(projectId: string): Promise<ProjectExecutionSummary | null> {
  const project = await getProject(projectId)
  if (!project) return null

  const [
    tasks,
    risks,
    conditions,
    obstacles,
    delayRequests,
    monthlyPlans,
    notifications,
    preMilestones,
    acceptancePlans,
    constructionDrawings,
    governanceStates,
  ] = await Promise.all([
    getTasks(projectId),
    getRisks(projectId),
    executeSQL<TaskConditionRow>('SELECT * FROM task_conditions WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    executeSQL<TaskObstacleRow>('SELECT * FROM task_obstacles WHERE project_id = ? ORDER BY created_at DESC', [projectId]),
    executeSQL<DelayRequestRow>('SELECT id, project_id, task_id, status, created_at, updated_at FROM delay_requests WHERE project_id = ? ORDER BY created_at DESC', [projectId]),
    executeSQL<MonthlyPlanRow>('SELECT id, project_id, status, month, closeout_at, created_at, updated_at FROM monthly_plans WHERE project_id = ? ORDER BY month DESC, updated_at DESC, created_at DESC', [projectId]),
    executeSQL<NotificationRow>('SELECT id, project_id, severity, level, title, content, status, is_read, created_at FROM notifications WHERE project_id = ? ORDER BY created_at DESC', [projectId]),
    executeSQL<PreMilestoneRow>('SELECT id, project_id, status FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    executeSQL<AcceptancePlanRow>('SELECT id, project_id, status FROM acceptance_plans WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    executeSQL<ConstructionDrawingRow>('SELECT id, project_id, status, review_status FROM construction_drawings WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    loadPlanningGovernanceStates(projectId),
  ])
  const health = await resolveSummaryHealth(project)

  return calculateSummaryForProject(
    project,
    tasks,
    risks,
    conditions,
    obstacles,
    delayRequests,
    monthlyPlans,
    notifications,
    summarizeSupplementaryProjectData({
      preMilestones,
      acceptancePlans,
      constructionDrawings,
    }),
    governanceStates,
    health,
  )
}

export async function getAllProjectExecutionSummaries(): Promise<ProjectExecutionSummary[]> {
  const [
    projects,
    tasks,
    risks,
    conditions,
    obstacles,
    delayRequests,
    monthlyPlans,
    notifications,
    preMilestones,
    acceptancePlans,
    constructionDrawings,
    governanceStates,
  ] = await Promise.all([
    getProjects(),
    getTasks(),
    getRisks(),
    executeSQL<TaskConditionRow>('SELECT * FROM task_conditions ORDER BY created_at ASC'),
    executeSQL<TaskObstacleRow>('SELECT * FROM task_obstacles ORDER BY created_at DESC'),
    executeSQL<DelayRequestRow>('SELECT id, project_id, task_id, status, created_at, updated_at FROM delay_requests ORDER BY created_at DESC'),
    executeSQL<MonthlyPlanRow>('SELECT id, project_id, status, month, closeout_at, created_at, updated_at FROM monthly_plans ORDER BY month DESC, updated_at DESC, created_at DESC'),
    executeSQL<NotificationRow>('SELECT id, project_id, severity, level, title, content, status, is_read, created_at FROM notifications ORDER BY created_at DESC'),
    executeSQL<PreMilestoneRow>('SELECT id, project_id, status FROM pre_milestones ORDER BY created_at ASC'),
    executeSQL<AcceptancePlanRow>('SELECT id, project_id, status FROM acceptance_plans ORDER BY created_at ASC'),
    executeSQL<ConstructionDrawingRow>('SELECT id, project_id, status, review_status FROM construction_drawings ORDER BY created_at ASC'),
    loadPlanningGovernanceStates(),
  ])

  const tasksByProject = new Map<string, Task[]>()
  const risksByProject = new Map<string, Risk[]>()
  const conditionsByProject = new Map<string, TaskConditionRow[]>()
  const obstaclesByProject = new Map<string, TaskObstacleRow[]>()
  const delayRequestsByProject = new Map<string, DelayRequestRow[]>()
  const monthlyPlansByProject = new Map<string, MonthlyPlanRow[]>()
  const notificationsByProject = new Map<string, NotificationRow[]>()
  const preMilestonesByProject = new Map<string, PreMilestoneRow[]>()
  const acceptancePlansByProject = new Map<string, AcceptancePlanRow[]>()
  const constructionDrawingsByProject = new Map<string, ConstructionDrawingRow[]>()
  const governanceStatesByProject = new Map<string, PlanningGovernanceState[]>()

  for (const task of tasks) {
    const list = tasksByProject.get(task.project_id) || []
    list.push(task)
    tasksByProject.set(task.project_id, list)
  }

  for (const risk of risks) {
    const list = risksByProject.get(risk.project_id) || []
    list.push(risk)
    risksByProject.set(risk.project_id, list)
  }

  for (const condition of conditions) {
    const projectId = condition.project_id
    if (!projectId) continue
    const list = conditionsByProject.get(projectId) || []
    list.push(condition)
    conditionsByProject.set(projectId, list)
  }

  for (const obstacle of obstacles) {
    const projectId = obstacle.project_id
    if (!projectId) continue
    const list = obstaclesByProject.get(projectId) || []
    list.push(obstacle)
    obstaclesByProject.set(projectId, list)
  }

  for (const request of delayRequests) {
    const projectId = request.project_id
    if (!projectId) continue
    const list = delayRequestsByProject.get(projectId) || []
    list.push(request)
    delayRequestsByProject.set(projectId, list)
  }

  for (const plan of monthlyPlans) {
    const projectId = plan.project_id
    if (!projectId) continue
    const list = monthlyPlansByProject.get(projectId) || []
    list.push(plan)
    monthlyPlansByProject.set(projectId, list)
  }

  for (const notification of notifications) {
    const projectId = notification.project_id
    if (!projectId) continue
    const list = notificationsByProject.get(projectId) || []
    list.push(notification)
    notificationsByProject.set(projectId, list)
  }

  for (const row of preMilestones) {
    const projectId = row.project_id
    if (!projectId) continue
    const list = preMilestonesByProject.get(projectId) || []
    list.push(row)
    preMilestonesByProject.set(projectId, list)
  }

  for (const row of acceptancePlans) {
    const projectId = row.project_id
    if (!projectId) continue
    const list = acceptancePlansByProject.get(projectId) || []
    list.push(row)
    acceptancePlansByProject.set(projectId, list)
  }

  for (const row of constructionDrawings) {
    const projectId = row.project_id
    if (!projectId) continue
    const list = constructionDrawingsByProject.get(projectId) || []
    list.push(row)
    constructionDrawingsByProject.set(projectId, list)
  }

  for (const row of governanceStates) {
    const projectId = row.project_id
    if (!projectId) continue
    const list = governanceStatesByProject.get(projectId) || []
    list.push(row)
    governanceStatesByProject.set(projectId, list)
  }

  const healthResults = await Promise.all(
    projects.map(async (project) => {
      const health = await resolveSummaryHealth(project, { preferPersisted: true })
      return [project.id, health] as const
    }),
  )
  const healthByProject = new Map(healthResults)

  return projects.map((project) =>
    calculateSummaryForProject(
      project,
      tasksByProject.get(project.id) || [],
      risksByProject.get(project.id) || [],
      conditionsByProject.get(project.id) || [],
      obstaclesByProject.get(project.id) || [],
      delayRequestsByProject.get(project.id) || [],
      monthlyPlansByProject.get(project.id) || [],
      notificationsByProject.get(project.id) || [],
      summarizeSupplementaryProjectData({
        preMilestones: preMilestonesByProject.get(project.id) || [],
        acceptancePlans: acceptancePlansByProject.get(project.id) || [],
        constructionDrawings: constructionDrawingsByProject.get(project.id) || [],
      }),
      governanceStatesByProject.get(project.id) || [],
      healthByProject.get(project.id) || getPersistedProjectHealth(project),
    ),
  )
}
