import { isCompletedTask, isCompletedTaskStatus, isInProgressTask } from '../utils/taskStatus.js'

export const ExecutionFactIntent = {
  TaskCommit: 'task_commit',
  TaskApiUpdate: 'task_api_update',
  TaskReopen: 'task_reopen',
  AcceptancePass: 'acceptance_pass',
  SystemBackfill: 'system_backfill',
} as const

export type ExecutionFactIntent = typeof ExecutionFactIntent[keyof typeof ExecutionFactIntent]

export type ExecutionFactContext = {
  intent: ExecutionFactIntent
  previousTask: {
    status?: string | null
    progress?: number | null
    actual_start_date?: string | null
    actual_end_date?: string | null
    first_progress_at?: string | null
  }
  patch: Record<string, unknown>
  now?: string
  eventDate?: string | null
  allowManualActualDates?: boolean
}

export type ExecutionFactGovernanceResult = {
  patch: Record<string, unknown>
  generatedFields: string[]
  strippedFields: string[]
}

export const EXECUTION_FACT_MANAGED_FIELDS = [
  'actual_start_date',
  'actual_end_date',
  'first_progress_at',
] as const

function normalizeTimestamp(value?: string | null) {
  const text = String(value ?? '').trim()
  return text || new Date().toISOString()
}

function toDateOnly(value?: string | null) {
  return normalizeTimestamp(value).slice(0, 10)
}

function readProgress(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function hasOwn(source: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function stripManagedFields(patch: Record<string, unknown>) {
  const strippedFields: string[] = []
  const sanitized = { ...patch }

  for (const field of EXECUTION_FACT_MANAGED_FIELDS) {
    if (hasOwn(sanitized, field)) {
      strippedFields.push(field)
      delete sanitized[field]
    }
  }

  return { sanitized, strippedFields }
}

export function stripExecutionFactManagedFields(patch: Record<string, unknown>) {
  return stripManagedFields(patch)
}

export function applyExecutionFactGovernance(context: ExecutionFactContext): ExecutionFactGovernanceResult {
  const nowTs = normalizeTimestamp(context.now)
  const eventDate = toDateOnly(context.eventDate ?? nowTs)
  const { sanitized, strippedFields } = context.allowManualActualDates
    ? { sanitized: { ...context.patch }, strippedFields: [] as string[] }
    : stripManagedFields(context.patch)

  const previous = context.previousTask
  const previousProgress = readProgress(previous.progress, 0)
  const nextStatus = hasOwn(sanitized, 'status') ? String(sanitized.status ?? '') : String(previous.status ?? '')
  let nextProgress = hasOwn(sanitized, 'progress')
    ? readProgress(sanitized.progress, previousProgress)
    : previousProgress
  const patchHasManualActualStart = context.allowManualActualDates && hasOwn(sanitized, 'actual_start_date')
  const patchHasManualActualEnd = context.allowManualActualDates && hasOwn(sanitized, 'actual_end_date')
  const patchHasManualFirstProgress = context.allowManualActualDates && hasOwn(sanitized, 'first_progress_at')

  const generated: Record<string, unknown> = {}
  const statusCompletesTask = isCompletedTaskStatus(nextStatus)
  if (statusCompletesTask && nextProgress < 100) {
    nextProgress = 100
    generated.progress = 100
  }

  const firstProgress = previousProgress <= 0 && nextProgress > 0
  const transitionedToInProgress = !isInProgressTask(previous) && isInProgressTask({ status: nextStatus, progress: nextProgress })
  if (!previous.actual_start_date && !patchHasManualActualStart && (firstProgress || transitionedToInProgress)) {
    generated.actual_start_date = eventDate
  }

  if (!previous.first_progress_at && !patchHasManualFirstProgress && nextProgress > 0) {
    generated.first_progress_at = nowTs
  }

  const wasCompleted = isCompletedTask(previous)
  const nextCompleted = isCompletedTask({ status: nextStatus, progress: nextProgress })
  if (context.intent === ExecutionFactIntent.TaskReopen) {
    generated.actual_end_date = null
  } else if (wasCompleted && !nextCompleted && !patchHasManualActualEnd) {
    generated.actual_end_date = null
  } else if (!previous.actual_end_date && !patchHasManualActualEnd && nextCompleted) {
    generated.actual_end_date = eventDate
  }

  return {
    patch: {
      ...sanitized,
      ...generated,
    },
    generatedFields: Object.keys(generated),
    strippedFields,
  }
}
