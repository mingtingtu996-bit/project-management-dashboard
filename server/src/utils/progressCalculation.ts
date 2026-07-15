import { inclusiveDurationDays } from './durationDays.js'

export type ProgressTaskLike = {
  id?: string | null
  parent_id?: string | null
  progress?: number | null
  status?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
  // v1.4.17: standard task model fields for active predicate
  is_executable?: boolean | null
  is_wbs_summary?: boolean | null
  progress_method?: string | null
}

const EXCLUDED_PROGRESS_STATUSES = new Set([
  'cancelled',
  'canceled',
  'deleted',
  'removed',
  'archived',
  'inactive',
  'void',
  'voided',
  '已取消',
  '已删除',
  '已移除',
  '已归档',
  '停用',
  '作废',
])

export type ProgressMetricResult = {
  currentProgress: number
  plannedProgress: number | null
  targetProgress: number
  progressDeviation: number | null
  leafTaskCount: number
  datedLeafTaskCount: number
  totalWeight: number
}

function normalizeDate(value?: string | null): Date | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeProgress(value?: number | null): number {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, parsed))
}

function isProgressStatusIncluded(task: ProgressTaskLike): boolean {
  const status = String(task.status ?? '').trim().toLowerCase()
  return !EXCLUDED_PROGRESS_STATUSES.has(status)
}

// v1.4.17: active predicate per v1.4.3/v1.4.5
// Only executable non-summary tasks count toward execution progress denominator
export function isExecutableTask(task: ProgressTaskLike): boolean {
  const isExecutable = task.is_executable !== false // default true for backward compat
  const isSummary = task.is_wbs_summary === true
  const isQuantityMethod = String(task.progress_method ?? '').trim().toLowerCase() === 'quantity'
  // Quantity-based tasks are valid executable tasks; they just use different progress calculation
  return isProgressStatusIncluded(task) && isExecutable && !isSummary
}

export function getLeafTasks<T extends ProgressTaskLike>(tasks: T[]): T[] {
  const parentIds = new Set(tasks.map((task) => task.parent_id).filter(Boolean))
  const leafTasks = tasks.filter((task) => !parentIds.has(task.id ?? '') && isExecutableTask(task))
  return leafTasks.length > 0 ? leafTasks : tasks.filter(t => isExecutableTask(t))
}

export function getStructureRowCount<T extends ProgressTaskLike>(tasks: T[]): number {
  return tasks.filter(t => t.is_wbs_summary === true).length
}

export function getExecutableTaskCount<T extends ProgressTaskLike>(tasks: T[]): number {
  return tasks.filter(t => isExecutableTask(t)).length
}

// v1.4 unified task execution progress.
// This is the authoritative current-progress denominator for task trees:
// executable, non-summary, active leaf rows only.
export function calculateWeightedProgress(tasks: ProgressTaskLike[]): number {
  const leafTasks = getLeafTasks(tasks)
  if (leafTasks.length === 0) return 0

  let totalWeightedProgress = 0
  let totalWeight = 0

  for (const task of leafTasks) {
    const progress = normalizeProgress(task.progress)
    const weight = getTaskProgressWeight(task)

    totalWeightedProgress += progress * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return 0
  return Math.round(totalWeightedProgress / totalWeight)
}

// Legacy alias kept for older routes/tests. Do not add new formulas here.
// New consumers that need current/planned/deviation should use calculateProgressMetrics.
export function calculateOverallProgress(tasks: ProgressTaskLike[]): number {
  return calculateWeightedProgress(tasks)
}

export function getTaskProgressWeight(task: ProgressTaskLike): number {
  const start = normalizeDate(task.planned_start_date || task.start_date)
  const end = normalizeDate(task.planned_end_date || task.end_date)
  return inclusiveDurationDays(start, end) ?? 1
}

export function calculateTaskPlannedProgress(task: ProgressTaskLike, asOf = new Date()): number | null {
  const start = normalizeDate(task.planned_start_date || task.start_date)
  const end = normalizeDate(task.planned_end_date || task.end_date)
  if (!start || !end) return null

  const asOfDate = normalizeDate(asOf.toISOString().slice(0, 10)) ?? asOf
  const startTime = start.getTime()
  const endTime = end.getTime()
  const currentTime = asOfDate.getTime()

  if (endTime <= startTime) return currentTime >= startTime ? 100 : 0
  if (currentTime <= startTime) return 0
  if (currentTime >= endTime) return 100

  return Math.round(((currentTime - startTime) / (endTime - startTime)) * 100)
}

// v1.4 unified planned/should-be progress for task trees.
// Returns null when task-level dates are missing, so callers can explicitly
// mark low confidence or use a visible fallback rather than treating it as truth.
export function calculateWeightedPlannedProgress(tasks: ProgressTaskLike[], asOf = new Date()): number | null {
  const leafTasks = getLeafTasks(tasks)
  if (leafTasks.length === 0) return null

  let totalWeightedProgress = 0
  let totalWeight = 0

  for (const task of leafTasks) {
    const plannedProgress = calculateTaskPlannedProgress(task, asOf)
    if (plannedProgress === null) continue

    const weight = getTaskProgressWeight(task)
    totalWeightedProgress += plannedProgress * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return null
  return Math.round(totalWeightedProgress / totalWeight)
}

// Preferred entry point for Dashboard, Reports, health, summaries and deviation.
export function calculateProgressMetrics(tasks: ProgressTaskLike[], asOf = new Date()): ProgressMetricResult {
  const leafTasks = getLeafTasks(tasks)
  const currentProgress = calculateWeightedProgress(tasks)
  const plannedProgress = calculateWeightedPlannedProgress(tasks, asOf)
  const datedLeafTaskCount = leafTasks.filter((task) => calculateTaskPlannedProgress(task, asOf) !== null).length
  const totalWeight = leafTasks.reduce((sum, task) => sum + getTaskProgressWeight(task), 0)

  return {
    currentProgress,
    plannedProgress,
    targetProgress: plannedProgress ?? 0,
    progressDeviation: plannedProgress === null ? null : currentProgress - plannedProgress,
    leafTaskCount: leafTasks.length,
    datedLeafTaskCount,
    totalWeight,
  }
}
