import type { TaskNode } from './criticalPath'
import { calculateCriticalPathAnalysis } from './criticalPathFallback'

export { type TaskNode }

export interface CPMResult {
  criticalPath: string[]
  criticalTasks: TaskNode[]
  earliestStart: Map<string, number>
  earliestFinish: Map<string, number>
  latestStart: Map<string, number>
  latestFinish: Map<string, number>
  float: Map<string, number>
  projectDuration: number
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function daysBetween(start: Date, end: Date): number {
  const diffTime = end.getTime() - start.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

export function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return Number.isNaN(date.getTime()) ? null : date
}

export function calculateCPM(tasks: TaskNode[], projectStart: Date = new Date()): CPMResult {
  void projectStart

  const analysis = calculateCriticalPathAnalysis(tasks)
  const criticalPathSet = new Set(analysis.autoTaskIds)
  const criticalTasks = analysis.orderedTaskIds
    .filter((taskId) => criticalPathSet.has(taskId))
    .map((taskId) => analysis.taskMap.get(taskId)!)

  return {
    criticalPath: analysis.autoTaskIds,
    criticalTasks,
    earliestStart: analysis.earliestStart,
    earliestFinish: analysis.earliestFinish,
    latestStart: analysis.latestStart,
    latestFinish: analysis.latestFinish,
    float: analysis.float,
    projectDuration: analysis.projectDurationDays,
  }
}

export function isCriticalTask(taskId: string, cpmResult: CPMResult): boolean {
  return cpmResult.criticalPath.includes(taskId)
}

export function getTaskBuffer(taskId: string, cpmResult: CPMResult): number {
  const float = cpmResult.float.get(taskId) || 0
  const duration = cpmResult.earliestFinish.get(taskId)! - cpmResult.earliestStart.get(taskId)!
  if (duration === 0) return 0
  return (float / duration) * 100
}

export function getCriticalPathSummary(cpmResult: CPMResult): string {
  if (cpmResult.criticalPath.length === 0) {
    return '无关键路径'
  }

  return `${cpmResult.criticalPath.length}个关键任务，工期 ${cpmResult.projectDuration} 天`
}

export function calculateDelayImpact(
  taskId: string,
  delayDays: number,
  cpmResult: CPMResult,
): number {
  const float = cpmResult.float.get(taskId) || 0

  if (float >= delayDays) {
    return 0
  }

  return delayDays - float
}
