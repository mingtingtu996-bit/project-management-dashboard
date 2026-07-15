import { supabase } from './dbService.js'
import type { TaskBaseline } from '../types/db.js'

const CURRENT_EXECUTION_BASELINE_STATUSES = new Set(['confirmed', 'pending_realign'])

export type TaskBaselineProjection = {
  baseline_item_id: string | null
  baseline_start: string | null
  baseline_end: string | null
  baseline_is_critical: boolean | null
}

type BaselineProjectionItemRow = {
  id?: string | null
  source_task_id?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  is_baseline_critical?: boolean | null
}

function normalizeDate(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (direct) return direct[1]
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function numericVersion(version: unknown): number | null {
  const parsed = Number(version)
  return Number.isFinite(parsed) ? parsed : null
}

function baselineSortValue(baseline: Pick<TaskBaseline, 'confirmed_at' | 'updated_at' | 'created_at'>): string {
  return String(baseline.confirmed_at ?? baseline.updated_at ?? baseline.created_at ?? '')
}

function chooseLatestCurrentExecutionBaseline(baselines: TaskBaseline[]): TaskBaseline | null {
  return baselines
    .filter((baseline) => CURRENT_EXECUTION_BASELINE_STATUSES.has(String(baseline.status ?? '').trim()))
    .filter((baseline) => numericVersion(baseline.version) != null)
    .sort((left, right) => {
      const versionDiff = (numericVersion(right.version) ?? 0) - (numericVersion(left.version) ?? 0)
      if (versionDiff !== 0) return versionDiff
      return baselineSortValue(right).localeCompare(baselineSortValue(left))
    })[0] ?? null
}

export async function loadBaselineProjectionMap(baselineVersionId: string): Promise<Map<string, TaskBaselineProjection>> {
  const normalizedBaselineVersionId = normalizeText(baselineVersionId)
  if (!normalizedBaselineVersionId) return new Map()

  const { data, error } = await supabase
    .from('task_baseline_items')
    .select('id, source_task_id, planned_start_date, planned_end_date, is_baseline_critical')
    .eq('baseline_version_id', normalizedBaselineVersionId)

  if (error) throw error

  return new Map(
    ((data ?? []) as BaselineProjectionItemRow[])
      .filter((row) => normalizeText(row.source_task_id))
      .map((row) => [
        normalizeText(row.source_task_id) as string,
        {
          baseline_item_id: normalizeText(row.id),
          baseline_start: normalizeDate(row.planned_start_date),
          baseline_end: normalizeDate(row.planned_end_date),
          baseline_is_critical: row.is_baseline_critical ?? null,
        },
      ]),
  )
}

export async function loadCurrentExecutionBaselineByProjectIds(projectIds: string[]): Promise<Map<string, TaskBaseline>> {
  const normalizedProjectIds = [...new Set(projectIds.map((id) => normalizeText(id)).filter((id): id is string => Boolean(id)))]
  if (normalizedProjectIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('task_baselines')
    .select('id, project_id, status, version, confirmed_at, updated_at, created_at')
    .in('project_id', normalizedProjectIds)

  if (error) throw error

  const grouped = new Map<string, TaskBaseline[]>()
  for (const baseline of (data ?? []) as TaskBaseline[]) {
    const projectId = normalizeText(baseline.project_id)
    if (!projectId) continue
    grouped.set(projectId, [...(grouped.get(projectId) ?? []), baseline])
  }

  const latestByProject = new Map<string, TaskBaseline>()
  for (const [projectId, baselines] of grouped.entries()) {
    const latest = chooseLatestCurrentExecutionBaseline(baselines)
    if (latest) latestByProject.set(projectId, latest)
  }
  return latestByProject
}

export async function attachCurrentBaselineProjectionToTasks<
  T extends {
    id?: string | null
    project_id?: string | null
    baseline_item_id?: string | null
    baseline_start?: string | null
    baseline_end?: string | null
    baseline_is_critical?: boolean | null
  },
>(tasks: T[]): Promise<T[]> {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks

  const projectIds = [...new Set(tasks.map((task) => normalizeText(task.project_id)).filter((id): id is string => Boolean(id)))]
  const baselineByProjectId = await loadCurrentExecutionBaselineByProjectIds(projectIds)
  const projectionByBaselineId = new Map<string, Map<string, TaskBaselineProjection>>()

  await Promise.all([...baselineByProjectId.values()].map(async (baseline) => {
    const baselineId = normalizeText(baseline.id)
    if (!baselineId || projectionByBaselineId.has(baselineId)) return
    projectionByBaselineId.set(baselineId, await loadBaselineProjectionMap(baselineId))
  }))

  return tasks.map((task) => {
    const projectId = normalizeText(task.project_id)
    const baseline = projectId ? baselineByProjectId.get(projectId) : null
    const baselineId = baseline ? normalizeText(baseline.id) : null
    const projection = baselineId ? projectionByBaselineId.get(baselineId)?.get(String(task.id ?? '').trim()) : null
    return {
      ...task,
      baseline_item_id: projection?.baseline_item_id ?? null,
      baseline_start: projection?.baseline_start ?? null,
      baseline_end: projection?.baseline_end ?? null,
      baseline_is_critical: projection?.baseline_is_critical ?? null,
    }
  })
}
