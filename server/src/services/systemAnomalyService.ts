import { supabase } from './dbService.js'
import type { PassiveReorderDetectionReport, PassiveReorderWindowResult } from '../types/planning.js'
import { isProjectActiveStatus } from '../utils/projectStatus.js'

export interface PassiveReorderLogRow {
  entity_id?: string | null
  field_name?: string | null
  old_value?: string | null
  new_value?: string | null
  changed_at?: string | null
  created_at?: string | null
  project_id?: string | null
  entity_type?: string | null
}

const PASSIVE_REORDER_FIELDS = ['planned_end_date', 'current_plan_date', 'actual_end_date', 'start_date', 'end_date']
const PASSIVE_REORDER_WINDOWS = [3, 5, 7] as const
const DAY_MS = 24 * 60 * 60 * 1000

function toTimestamp(value?: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function toOffsetDays(row: PassiveReorderLogRow): number {
  const oldTime = toTimestamp(row.old_value)
  const newTime = toTimestamp(row.new_value)

  if (oldTime === null || newTime === null) return 0

  return Math.abs(newTime - oldTime) / DAY_MS
}

export function detectPassiveReorderWindows(
  projectId: string,
  rows: PassiveReorderLogRow[],
  now: Date = new Date(),
  options: { keyTaskIds?: string[] } = {},
): PassiveReorderDetectionReport {
  const relevantRows = rows.filter((row) =>
    row.project_id === projectId &&
    row.entity_type === 'task' &&
    PASSIVE_REORDER_FIELDS.includes(String(row.field_name ?? '')),
  )
  const keyTaskSet = new Set(options.keyTaskIds ?? [])

  const windows = PASSIVE_REORDER_WINDOWS.map((windowDays) => {
    const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000
    const windowRows = relevantRows.filter((row) => {
      const eventAt = toTimestamp(row.changed_at ?? row.created_at ?? null)
      return eventAt !== null && eventAt >= cutoff
    })
    const offsetSamples = windowRows.map((row) => toOffsetDays(row)).filter((value) => Number.isFinite(value))
    const averageOffsetDays = offsetSamples.length > 0
      ? offsetSamples.reduce((sum, value) => sum + value, 0) / offsetSamples.length
      : 0
    const keyTaskCount = new Set(
      windowRows
        .map((row) => row.entity_id)
        .filter((entityId): entityId is string => Boolean(entityId && keyTaskSet.has(entityId))),
    ).size
    const triggered = (windowRows.length >= 10 && averageOffsetDays >= 7) || keyTaskCount >= 3

    return {
      window_days: windowDays,
      event_count: windowRows.length,
      affected_task_count: new Set(windowRows.map((row) => row.entity_id).filter(Boolean)).size,
      cumulative_event_count: windowRows.length,
      triggered,
      average_offset_days: Number(averageOffsetDays.toFixed(2)),
      key_task_count: keyTaskCount,
    } satisfies PassiveReorderWindowResult
  })

  return {
    project_id: projectId,
    detected_at: now.toISOString(),
    total_events: relevantRows.length,
    windows,
  }
}

export class SystemAnomalyService {
  async scanProjectPassiveReorder(projectId: string, now: Date = new Date()): Promise<PassiveReorderDetectionReport> {
    const { data, error } = await supabase
      .from('change_logs')
      .select('project_id, entity_id, entity_type, field_name, old_value, new_value, changed_at')
      .eq('project_id', projectId)
      .eq('entity_type', 'task')
      .in('field_name', PASSIVE_REORDER_FIELDS)

    if (error) throw new Error(error.message)

    return detectPassiveReorderWindows(projectId, (data ?? []) as PassiveReorderLogRow[], now)
  }

  async scanAllProjectPassiveReorder(): Promise<PassiveReorderDetectionReport[]> {
    const { data, error } = await supabase.from('projects').select('id, status')

    if (error) {
      throw new Error(error.message)
    }

    const reports: PassiveReorderDetectionReport[] = []
    for (const project of ((data ?? []) as Array<{ id: string; status?: string | null }>).filter((item) =>
      isProjectActiveStatus(item.status),
    )) {
      reports.push(await this.scanProjectPassiveReorder(project.id))
    }

    return reports
  }

  enqueuePassiveReorderDetection(projectId: string, now: Date = new Date()) {
    void this.scanProjectPassiveReorder(projectId, now).catch((error) => {
      console.warn('[systemAnomalyService] passive reorder scan failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
}
