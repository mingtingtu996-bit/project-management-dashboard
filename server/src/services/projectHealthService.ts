/**
 * Project health score service.
 *
 * The dashboard now treats health as a business execution signal, not as a
 * planning-data lint score. Keep the legacy detail fields as aliases so older
 * summaries and tests can continue to read a stable shape.
 */

import { logger } from '../middleware/logger.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { getIssues, getProject, getRisks, getTasks, supabase } from './dbService.js'
import { isPendingCondition } from '../utils/conditionStatus.js'
import { isActiveIssue } from '../utils/issueStatus.js'
import { isActiveObstacle } from '../utils/obstacleStatus.js'
import { calculateOverallProgress, getLeafTasks } from '../utils/progressCalculation.js'
import { isActiveRisk } from '../utils/riskStatus.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import type { Issue, Project, Risk, Task } from '../types/db.js'

export type HealthStatus = '健康' | '亚健康' | '预警' | '危险'

type ConditionRow = {
  id: string
  task_id?: string | null
  is_satisfied?: boolean | number | null
  status?: string | null
}

type ObstacleRow = {
  id: string
  task_id?: string | null
  is_resolved?: boolean | number | null
  status?: string | null
}

type DelayRequestRow = {
  id: string
  task_id?: string | null
  status?: string | null
}

export interface HealthDetails {
  progressDeliveryScore: number
  taskExecutionScore: number
  milestoneDeliveryScore: number
  riskControlScore: number
  dataTrustScore: number
  scoreBeforeCaps: number
  capReasons: string[]
  totalScore: number
  healthStatus: HealthStatus
  overallProgress: number
  plannedProgress: number | null
  delayedTaskCount: number
  delayedTaskDays: number
  overdueMilestoneCount: number
  criticalPathAffectedTasks: number
  activeRiskCount: number
  activeIssueCount: number
  activeObstacleCount: number
  pendingConditionTaskCount: number
  activeDelayRequestCount: number

  // Legacy aliases retained for consumers that still expect the old shape.
  dataIntegrityScore: number
  mappingIntegrityScore: number
  systemConsistencyScore: number
  milestoneIntegrityScore: number
  passiveReorderPenalty: number
}

export interface HealthScoreResult {
  score: number
  details: HealthDetails
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function roundScore(value: number) {
  return Math.round(clamp(value))
}

function mapHealthStatus(score: number): HealthStatus {
  if (score >= 80) return '健康'
  if (score >= 60) return '亚健康'
  if (score >= 40) return '预警'
  return '危险'
}

function toDate(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function diffDays(later: Date, earlier: Date) {
  return Math.ceil((later.getTime() - earlier.getTime()) / 86400000)
}

function getPlannedEndDate(task: Partial<Task>) {
  return toDate(task.planned_end_date || task.end_date || null)
}

function getActualEndDate(task: Partial<Task>) {
  return toDate(task.actual_end_date || null)
}

function isTaskDelayed(task: Partial<Task>, asOf = new Date()) {
  const plannedEnd = getPlannedEndDate(task)
  if (!plannedEnd) return false

  if (isCompletedTask(task)) {
    const actualEnd = getActualEndDate(task)
    return Boolean(actualEnd && actualEnd.getTime() > plannedEnd.getTime())
  }

  return plannedEnd.getTime() < asOf.getTime()
}

function getTaskDelayDays(task: Partial<Task>, asOf = new Date()) {
  const plannedEnd = getPlannedEndDate(task)
  if (!plannedEnd) return 0

  const compareEnd = isCompletedTask(task) ? getActualEndDate(task) : asOf
  if (!compareEnd || compareEnd.getTime() <= plannedEnd.getTime()) return 0
  return Math.max(0, diffDays(compareEnd, plannedEnd))
}

function getPlannedProgress(project: Project | null, tasks: Task[], asOf = new Date()): number | null {
  const projectStart = toDate(project?.planned_start_date || project?.start_date || null)
  const projectEnd = toDate(project?.planned_end_date || project?.end_date || null)

  if (projectStart && projectEnd && projectEnd.getTime() > projectStart.getTime()) {
    const elapsed = asOf.getTime() - projectStart.getTime()
    const total = projectEnd.getTime() - projectStart.getTime()
    return roundScore((elapsed / total) * 100)
  }

  const datedTasks = tasks
    .map((task) => ({
      start: toDate(task.planned_start_date || task.start_date || null),
      end: toDate(task.planned_end_date || task.end_date || null),
    }))
    .filter((item): item is { start: Date; end: Date } => Boolean(item.start && item.end && item.end.getTime() > item.start.getTime()))

  if (datedTasks.length === 0) return null

  const start = new Date(Math.min(...datedTasks.map((item) => item.start.getTime())))
  const end = new Date(Math.max(...datedTasks.map((item) => item.end.getTime())))
  if (end.getTime() <= start.getTime()) return null

  return roundScore(((asOf.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100)
}

function isHighSeveritySignal(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase()
  return ['critical', 'high', '严重', '高'].includes(text)
}

async function loadProjectScopedRows<T>(table: string, projectId: string, select = '*'): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq('project_id', projectId)

  if (error) {
    logger.warn('[projectHealthService] optional health input unavailable', {
      table,
      projectId,
      error: error.message,
    })
    return []
  }

  return (data ?? []) as T[]
}

function calculateDataTrustScore(project: Project | null, leafTasks: Task[], milestones: Task[]) {
  let score = 100

  if (!project) score -= 40
  if (!project?.planned_end_date && !project?.end_date) score -= 10
  if (leafTasks.length === 0) score -= 45

  const tasksMissingPlan = leafTasks.filter((task) => !getPlannedEndDate(task)).length
  if (leafTasks.length > 0) {
    score -= (tasksMissingPlan / leafTasks.length) * 35
  }

  const milestonesMissingPlan = milestones.filter((task) => !getPlannedEndDate(task)).length
  if (milestones.length > 0) {
    score -= (milestonesMissingPlan / milestones.length) * 25
  }

  const invalidProgress = leafTasks.filter((task) => !Number.isFinite(Number(task.progress ?? 0))).length
  if (leafTasks.length > 0) {
    score -= (invalidProgress / leafTasks.length) * 15
  }

  return roundScore(score)
}

export async function calculateProjectHealth(projectId: string): Promise<HealthScoreResult> {
  const now = new Date()
  const [
    project,
    tasks,
    risks,
    issues,
    conditions,
    obstacles,
    delayRequests,
    criticalTaskIds,
  ] = await Promise.all([
    getProject(projectId),
    getTasks(projectId),
    getRisks(projectId),
    getIssues(projectId),
    loadProjectScopedRows<ConditionRow>('task_conditions', projectId, 'id, task_id, is_satisfied, status'),
    loadProjectScopedRows<ObstacleRow>('task_obstacles', projectId, 'id, task_id, is_resolved, status'),
    loadProjectScopedRows<DelayRequestRow>('delay_requests', projectId, 'id, task_id, status'),
    getCriticalPathTaskIds(projectId).catch((error) => {
      logger.warn('[projectHealthService] critical path input unavailable', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
      return new Set<string>()
    }),
  ])

  const leafTasks = getLeafTasks(tasks)
  const milestones = tasks.filter((task) => task.is_milestone)
  const completedTasks = leafTasks.filter(isCompletedTask)
  const delayedTasks = leafTasks.filter((task) => isTaskDelayed(task, now))
  const delayedTaskDays = delayedTasks.reduce((sum, task) => sum + getTaskDelayDays(task, now), 0)
  const activeRisks = risks.filter(isActiveRisk)
  const activeIssues = issues.filter(isActiveIssue)
  const activeObstacles = obstacles.filter(isActiveObstacle)
  const pendingConditions = conditions.filter(isPendingCondition)
  const activeDelayRequests = delayRequests.filter((request) => String(request.status ?? '').trim().toLowerCase() === 'pending')
  const pendingConditionTaskIds = new Set(pendingConditions.map((condition) => String(condition.task_id ?? '')).filter(Boolean))
  const activeObstacleTaskIds = new Set(activeObstacles.map((obstacle) => String(obstacle.task_id ?? '')).filter(Boolean))

  const criticalPathAffectedTasks = leafTasks.filter((task) => {
    if (!criticalTaskIds.has(task.id)) return false
    return isTaskDelayed(task, now) || pendingConditionTaskIds.has(task.id) || activeObstacleTaskIds.has(task.id)
  }).length

  const overdueMilestones = milestones.filter((task) => !isCompletedTask(task) && isTaskDelayed(task, now))
  const shiftedMilestones = milestones.filter((task) => isTaskDelayed(task, now))
  const overallProgress = roundScore(calculateOverallProgress(tasks))
  const plannedProgress = getPlannedProgress(project, tasks, now)
  const progressGap = plannedProgress === null ? 0 : Math.max(0, plannedProgress - overallProgress)
  const progressDeliveryScore = roundScore(100 - progressGap * 1.4 - Math.min(25, delayedTaskDays * 1.2))

  const delayedTaskRatio = leafTasks.length > 0 ? delayedTasks.length / leafTasks.length : 1
  const blockedTaskRatio = leafTasks.length > 0
    ? new Set([...pendingConditionTaskIds, ...activeObstacleTaskIds]).size / leafTasks.length
    : 1
  const ownerMissingRatio = leafTasks.length > 0
    ? leafTasks.filter((task) => !String(task.assignee || task.assignee_name || task.assignee_unit || task.participant_unit_id || '').trim()).length / leafTasks.length
    : 1
  const taskExecutionScore = roundScore(100 - delayedTaskRatio * 45 - blockedTaskRatio * 25 - ownerMissingRatio * 10)

  const milestoneCompletionRate = milestones.length > 0
    ? (milestones.filter(isCompletedTask).length / milestones.length) * 100
    : 70
  const overdueMilestoneRatio = milestones.length > 0 ? overdueMilestones.length / milestones.length : 0
  const shiftedMilestoneRatio = milestones.length > 0 ? shiftedMilestones.length / milestones.length : 0
  const milestoneDeliveryScore = roundScore(
    (milestones.length > 0 ? 65 : 70)
    + milestoneCompletionRate * 0.35
    - overdueMilestoneRatio * 55
    - shiftedMilestoneRatio * 20,
  )

  const highSeverityRisks = activeRisks.filter((risk) => isHighSeveritySignal((risk as Risk & { severity?: string | null }).severity || risk.level)).length
  const highSeverityIssues = activeIssues.filter((issue) => isHighSeveritySignal((issue as Issue & { severity?: string | null }).severity)).length
  const riskControlScore = roundScore(
    100
    - activeRisks.length * 6
    - activeIssues.length * 10
    - activeObstacles.length * 10
    - pendingConditionTaskIds.size * 4
    - criticalPathAffectedTasks * 12
    - (highSeverityRisks + highSeverityIssues) * 8,
  )

  const dataTrustScore = calculateDataTrustScore(project, leafTasks, milestones)

  const scoreBeforeCaps = roundScore(
    progressDeliveryScore * 0.3
    + taskExecutionScore * 0.25
    + milestoneDeliveryScore * 0.2
    + riskControlScore * 0.15
    + dataTrustScore * 0.1,
  )

  let cap = 100
  const capReasons: string[] = []

  if (leafTasks.length === 0) {
    cap = Math.min(cap, 55)
    capReasons.push('缺少可评估任务')
  }
  if (overdueMilestones.length > 0) {
    cap = Math.min(cap, 70)
    capReasons.push(`${overdueMilestones.length} 个里程碑已逾期`)
  }
  if (criticalPathAffectedTasks > 0) {
    cap = Math.min(cap, 65)
    capReasons.push(`${criticalPathAffectedTasks} 个关键路径任务受影响`)
  }
  if (highSeverityRisks + highSeverityIssues > 0) {
    cap = Math.min(cap, 75)
    capReasons.push(`${highSeverityRisks + highSeverityIssues} 个高等级风险/问题`)
  }
  if (activeObstacles.length > 0) {
    cap = Math.min(cap, 80)
    capReasons.push(`${activeObstacles.length} 个未解除阻碍`)
  }
  if (dataTrustScore < 60) {
    cap = Math.min(cap, 70)
    capReasons.push('核心数据可信度不足')
  }

  const totalScore = Math.min(scoreBeforeCaps, cap)
  const healthStatus = mapHealthStatus(totalScore)

  return {
    score: totalScore,
    details: {
      progressDeliveryScore,
      taskExecutionScore,
      milestoneDeliveryScore,
      riskControlScore,
      dataTrustScore,
      scoreBeforeCaps,
      capReasons,
      totalScore,
      healthStatus,
      overallProgress,
      plannedProgress,
      delayedTaskCount: delayedTasks.length,
      delayedTaskDays,
      overdueMilestoneCount: overdueMilestones.length,
      criticalPathAffectedTasks,
      activeRiskCount: activeRisks.length,
      activeIssueCount: activeIssues.length,
      activeObstacleCount: activeObstacles.length,
      pendingConditionTaskCount: pendingConditionTaskIds.size,
      activeDelayRequestCount: activeDelayRequests.length,
      dataIntegrityScore: dataTrustScore,
      mappingIntegrityScore: milestoneDeliveryScore,
      systemConsistencyScore: taskExecutionScore,
      milestoneIntegrityScore: milestoneDeliveryScore,
      passiveReorderPenalty: 0,
    },
  }
}

async function persistProjectHealth(projectId: string, result: HealthScoreResult) {
  const { error } = await supabase
    .from('projects')
    .update({
      health_score: result.score,
      health_status: result.details.healthStatus,
    })
    .eq('id', projectId)

  if (error) {
    throw new Error(`Failed to update project health: ${error.message}`)
  }

  return result
}

export async function updateProjectHealth(projectId: string): Promise<HealthScoreResult> {
  const result = await calculateProjectHealth(projectId)
  await persistProjectHealth(projectId, result)

  logger.info('[projectHealthService] project health refreshed', {
    projectId,
    score: result.score,
    status: result.details.healthStatus,
  })

  return result
}

export async function updateAllProjectsHealth(): Promise<number> {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id')

  if (error) {
    throw new Error(`Failed to load projects: ${error.message}`)
  }

  if (!projects || projects.length === 0) {
    return 0
  }

  let updatedCount = 0
  for (const project of projects) {
    try {
      await updateProjectHealth(project.id)
      updatedCount += 1
    } catch (error) {
      logger.warn('[projectHealthService] failed to refresh project health', {
        projectId: project.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return updatedCount
}

export function enqueueProjectHealthUpdate(projectId: string, trigger = 'event') {
  if (!projectId) return

  void updateProjectHealth(projectId).catch((error) => {
    logger.warn('[projectHealthService] async health refresh failed', {
      projectId,
      trigger,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}
