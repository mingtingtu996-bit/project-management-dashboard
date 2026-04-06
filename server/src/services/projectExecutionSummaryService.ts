import { executeSQL, getProject, getProjects, getRisks, getTasks } from './dbService.js'
import type { Project, Risk, Task } from '../types/db.js'

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
  healthScore: number
  healthStatus: '健康' | '亚健康' | '预警' | '危险'
  nextMilestone: NextMilestoneSummary | null
  milestoneOverview: MilestoneOverview
}

const COMPLETED_STATUSES = new Set(['completed', 'done', '已完成'])
const IN_PROGRESS_STATUSES = new Set(['in_progress', 'active', '进行中'])
const CLOSED_RISK_STATUSES = new Set(['resolved', 'closed', 'mitigated', '已解决'])
const SATISFIED_CONDITION_STATUSES = new Set(['completed', 'satisfied', 'confirmed', '已满足', '已确认'])
const RESOLVED_OBSTACLE_STATUSES = new Set(['resolved', 'closed', '已解决', '无法解决'])

const COMPLETED_PRE_MILESTONE_STATUSES = new Set(['已取得', '已完成'])
const ACTIVE_PRE_MILESTONE_STATUSES = new Set(['待申请', '办理中'])
const OVERDUE_PRE_MILESTONE_STATUSES = new Set(['已过期', '需延期'])
const PASSED_ACCEPTANCE_STATUSES = new Set(['passed', '已通过'])
const IN_PROGRESS_ACCEPTANCE_STATUSES = new Set(['pending', 'in_progress', '待验收', '验收中'])
const FAILED_ACCEPTANCE_STATUSES = new Set(['failed', 'needs_revision', '已驳回', '未通过', '需补充'])
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

function calculateHealthScore(input: {
  completedTaskCount: number
  completedMilestones: number
  delayDays: number
  activeRisks: Risk[]
}): { score: number; status: ProjectExecutionSummary['healthStatus'] } {
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

  const totalScore = Math.max(
    0,
    Math.min(
      100,
      50 + input.completedTaskCount * 2 + input.completedMilestones * 5 - Math.min(input.delayDays, 30) + riskPenalty,
    ),
  )

  return {
    score: totalScore,
    status: getHealthStatus(totalScore),
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

function isInSet(value: unknown, candidates: Set<string>): boolean {
  return candidates.has(normalizeStatus(value))
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
  const passedAcceptancePlanCount = input.acceptancePlans.filter((item) => isInSet(item.status, PASSED_ACCEPTANCE_STATUSES)).length
  const inProgressAcceptancePlanCount = input.acceptancePlans.filter((item) => isInSet(item.status, IN_PROGRESS_ACCEPTANCE_STATUSES)).length
  const failedAcceptancePlanCount = input.acceptancePlans.filter((item) => isInSet(item.status, FAILED_ACCEPTANCE_STATUSES)).length

  const constructionDrawingCount = input.constructionDrawings.length
  const issuedConstructionDrawingCount = input.constructionDrawings.filter(
    (item) => isInSet(item.status, ISSUED_DRAWING_STATUSES) || isInSet(item.review_status, PASSED_ACCEPTANCE_STATUSES),
  ).length
  const reviewingConstructionDrawingCount = input.constructionDrawings.filter(
    (item) => isInSet(item.status, REVIEWING_DRAWING_STATUSES) || isInSet(item.review_status, IN_PROGRESS_ACCEPTANCE_STATUSES),
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
  supplementary: SupplementaryProjectSummary,
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
  const { delayedTaskCount, delayDays, delayCount } = getDelayMetrics(leafTasks)
  const health = calculateHealthScore({
    completedTaskCount,
    completedMilestones,
    delayDays,
    activeRisks,
  })
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
    healthScore: health.score,
    healthStatus: health.status,
    nextMilestone: getNextMilestone(tasks),
    milestoneOverview,
  }
}

export async function getProjectExecutionSummary(projectId: string): Promise<ProjectExecutionSummary | null> {
  const project = await getProject(projectId)
  if (!project) return null

  const [tasks, risks, conditions, obstacles, preMilestones, acceptancePlans, constructionDrawings] = await Promise.all([
    getTasks(projectId),
    getRisks(projectId),
    executeSQL<TaskConditionRow>('SELECT * FROM task_conditions WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    executeSQL<TaskObstacleRow>('SELECT * FROM task_obstacles WHERE project_id = ? ORDER BY created_at DESC', [projectId]),
    executeSQL<PreMilestoneRow>('SELECT id, project_id, status FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    executeSQL<AcceptancePlanRow>('SELECT id, project_id, status FROM acceptance_plans WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
    executeSQL<ConstructionDrawingRow>('SELECT id, project_id, status, review_status FROM construction_drawings WHERE project_id = ? ORDER BY created_at ASC', [projectId]),
  ])

  return calculateSummaryForProject(
    project,
    tasks,
    risks,
    conditions,
    obstacles,
    summarizeSupplementaryProjectData({
      preMilestones,
      acceptancePlans,
      constructionDrawings,
    }),
  )
}

export async function getAllProjectExecutionSummaries(): Promise<ProjectExecutionSummary[]> {
  const [projects, tasks, risks, conditions, obstacles, preMilestones, acceptancePlans, constructionDrawings] = await Promise.all([
    getProjects(),
    getTasks(),
    getRisks(),
    executeSQL<TaskConditionRow>('SELECT * FROM task_conditions ORDER BY created_at ASC'),
    executeSQL<TaskObstacleRow>('SELECT * FROM task_obstacles ORDER BY created_at DESC'),
    executeSQL<PreMilestoneRow>('SELECT id, project_id, status FROM pre_milestones ORDER BY created_at ASC'),
    executeSQL<AcceptancePlanRow>('SELECT id, project_id, status FROM acceptance_plans ORDER BY created_at ASC'),
    executeSQL<ConstructionDrawingRow>('SELECT id, project_id, status, review_status FROM construction_drawings ORDER BY created_at ASC'),
  ])

  const tasksByProject = new Map<string, Task[]>()
  const risksByProject = new Map<string, Risk[]>()
  const conditionsByProject = new Map<string, TaskConditionRow[]>()
  const obstaclesByProject = new Map<string, TaskObstacleRow[]>()
  const preMilestonesByProject = new Map<string, PreMilestoneRow[]>()
  const acceptancePlansByProject = new Map<string, AcceptancePlanRow[]>()
  const constructionDrawingsByProject = new Map<string, ConstructionDrawingRow[]>()

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

  return projects.map((project) =>
    calculateSummaryForProject(
      project,
      tasksByProject.get(project.id) || [],
      risksByProject.get(project.id) || [],
      conditionsByProject.get(project.id) || [],
      obstaclesByProject.get(project.id) || [],
      summarizeSupplementaryProjectData({
        preMilestones: preMilestonesByProject.get(project.id) || [],
        acceptancePlans: acceptancePlansByProject.get(project.id) || [],
        constructionDrawings: constructionDrawingsByProject.get(project.id) || [],
      }),
    ),
  )
}
