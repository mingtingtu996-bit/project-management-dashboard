export type TaskProgressSnapshotComparable = {
  progress?: unknown
  status?: unknown
  actual_start_date?: unknown
  actual_end_date?: unknown
  first_progress_at?: unknown
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeDateOnly(value: unknown) {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }
  const text = normalizeText(value)
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (dateOnly) return dateOnly[1]
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10)
}

function normalizeInstant(value: unknown) {
  if (value == null || value === '') return ''
  const parsed = value instanceof Date ? value : new Date(normalizeText(value))
  return Number.isNaN(parsed.getTime()) ? normalizeText(value) : parsed.toISOString()
}

export function shouldRecordTaskProgressSnapshot(
  previousTask?: TaskProgressSnapshotComparable | null,
  nextTask?: TaskProgressSnapshotComparable | null,
) {
  if (!nextTask) return false
  if (!previousTask) return true

  return Number(previousTask.progress ?? 0) !== Number(nextTask.progress ?? 0)
    || normalizeText(previousTask.status) !== normalizeText(nextTask.status)
    || normalizeDateOnly(previousTask.actual_start_date) !== normalizeDateOnly(nextTask.actual_start_date)
    || normalizeDateOnly(previousTask.actual_end_date) !== normalizeDateOnly(nextTask.actual_end_date)
    || normalizeInstant(previousTask.first_progress_at) !== normalizeInstant(nextTask.first_progress_at)
}
