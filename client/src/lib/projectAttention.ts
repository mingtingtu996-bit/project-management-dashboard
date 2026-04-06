import { normalizeAcceptanceStatus, type AcceptancePlan } from '@/types/acceptance'
import type { Risk, Task, TaskCondition, TaskObstacle } from '@/lib/supabase'
import { buildProjectTaskProgressSnapshot, isActiveRisk, normalizeStatus } from './taskBusinessStatus'

export type ProjectAttentionSnapshot = {
  delayedTaskCount: number
  highRiskCount: number
  activeRiskCount: number
  pendingConditionTaskCount: number
  activeObstacleTaskCount: number
  pendingAcceptanceCount: number
  totalAttentionCount: number
}

function getScopedTasks(projectId: string | null | undefined, tasks: Task[]): Task[] {
  if (!projectId) return tasks
  return tasks.filter((task) => task.project_id === projectId)
}

function getScopedRisks(projectId: string | null | undefined, risks: Risk[]): Risk[] {
  if (!projectId) return risks
  return risks.filter((risk) => risk.project_id === projectId)
}

function getScopedAcceptancePlans(projectId: string | null | undefined, plans: AcceptancePlan[]): AcceptancePlan[] {
  if (!projectId) return plans
  return plans.filter((plan) => plan.project_id === projectId)
}

function getScopedTaskIds(tasks: Task[]): Set<string> {
  return new Set(tasks.map((task) => task.id).filter(Boolean) as string[])
}

function getScopedConditions(taskIds: Set<string>, conditions: TaskCondition[]): TaskCondition[] {
  return conditions.filter((condition) => condition.task_id && taskIds.has(condition.task_id))
}

function getScopedObstacles(taskIds: Set<string>, obstacles: TaskObstacle[]): TaskObstacle[] {
  return obstacles.filter((obstacle) => obstacle.task_id && taskIds.has(obstacle.task_id))
}

export function buildProjectAttentionSnapshot(
  projectId: string | null | undefined,
  tasks: Task[],
  risks: Risk[],
  conditions: TaskCondition[],
  obstacles: TaskObstacle[],
  acceptancePlans: AcceptancePlan[],
): ProjectAttentionSnapshot {
  const scopedTasks = getScopedTasks(projectId, tasks)
  const taskIds = getScopedTaskIds(scopedTasks)
  const scopedConditions = getScopedConditions(taskIds, conditions)
  const scopedObstacles = getScopedObstacles(taskIds, obstacles)
  const scopedRisks = getScopedRisks(projectId, risks)
  const scopedAcceptancePlans = getScopedAcceptancePlans(projectId, acceptancePlans)

  const taskSnapshot = buildProjectTaskProgressSnapshot(scopedTasks, scopedConditions, scopedObstacles)
  const activeRisks = scopedRisks.filter(isActiveRisk)
  const highRiskCount = activeRisks.filter((risk) => normalizeStatus(risk.level) === 'high').length
  const pendingAcceptanceCount = scopedAcceptancePlans.filter(
    (plan) => normalizeAcceptanceStatus(plan.status ?? '') !== 'passed',
  ).length

  return {
    delayedTaskCount: taskSnapshot.delayedTaskCount,
    highRiskCount,
    activeRiskCount: activeRisks.length,
    pendingConditionTaskCount: taskSnapshot.pendingConditionTaskCount,
    activeObstacleTaskCount: taskSnapshot.activeObstacleTaskCount,
    pendingAcceptanceCount,
    totalAttentionCount:
      taskSnapshot.delayedTaskCount +
      highRiskCount +
      taskSnapshot.pendingConditionTaskCount +
      taskSnapshot.activeObstacleTaskCount +
      pendingAcceptanceCount,
  }
}
