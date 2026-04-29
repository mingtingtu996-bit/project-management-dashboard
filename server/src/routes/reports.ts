import { Router } from 'express'

import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { supabase } from '../services/dbService.js'
import { getProjectExecutionSummary } from '../services/projectExecutionSummaryService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router({ mergeParams: true })

router.use(authenticate)

type ProjectReportRow = {
  id: string
  planned_start_date?: string | null
  start_date?: string | null
  actual_start_date?: string | null
  planned_end_date?: string | null
  end_date?: string | null
}

type SnapshotRow = {
  snapshot_date: string
  overall_progress: number | null
}

type SCurvePoint = {
  date: string
  planned_cumulative: number
  actual_cumulative: number
}

function dateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

function addDays(key: string, days: number): string {
  const date = dateFromKey(key)
  date.setUTCDate(date.getUTCDate() + days)
  return dateKey(date) ?? key
}

function compareDateKey(left: string, right: string): number {
  return dateFromKey(left).getTime() - dateFromKey(right).getTime()
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, roundMetric(value)))
}

function plannedProgressForDate(date: string, start: string, plannedEnd: string): number {
  const startTime = dateFromKey(start).getTime()
  const endTime = dateFromKey(plannedEnd).getTime()
  const currentTime = dateFromKey(date).getTime()

  if (endTime <= startTime) return currentTime >= startTime ? 100 : 0
  if (currentTime <= startTime) return 0
  if (currentTime >= endTime) return 100

  return clampProgress(((currentTime - startTime) / (endTime - startTime)) * 100)
}

async function loadProject(projectId: string): Promise<ProjectReportRow | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, planned_start_date, start_date, actual_start_date, planned_end_date, end_date')
    .eq('id', projectId)
    .limit(1)

  if (error) {
    throw new Error(`读取项目失败: ${error.message}`)
  }

  return Array.isArray(data) ? (data[0] as ProjectReportRow | undefined) ?? null : null
}

async function loadSnapshotRows(projectId: string, from: string, to: string): Promise<SnapshotRow[]> {
  const { data, error } = await supabase
    .from('project_daily_snapshot')
    .select('snapshot_date, overall_progress')
    .eq('project_id', projectId)
    .gte('snapshot_date', from)
    .lte('snapshot_date', to)
    .order('snapshot_date', { ascending: true })

  if (error) {
    throw new Error(`读取 project_daily_snapshot 失败: ${error.message}`)
  }

  return Array.isArray(data) ? data as SnapshotRow[] : []
}

function buildSCurvePoints(options: {
  start: string
  to: string
  plannedEnd: string
  actualByDate: Map<string, number>
}): SCurvePoint[] {
  const points: SCurvePoint[] = []
  let cursor = options.start
  let actualCarry = 0

  while (compareDateKey(cursor, options.to) <= 0) {
    const actual = options.actualByDate.get(cursor)
    if (typeof actual === 'number' && Number.isFinite(actual)) {
      actualCarry = clampProgress(actual)
    }

    points.push({
      date: cursor,
      planned_cumulative: plannedProgressForDate(cursor, options.start, options.plannedEnd),
      actual_cumulative: actualCarry,
    })

    cursor = addDays(cursor, 1)
  }

  return points
}

router.get(
  '/s-curve',
  requireProjectMember(req => req.params.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()
    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const today = dateKey(new Date()) ?? new Date().toISOString().slice(0, 10)
    const project = await loadProject(projectId)
    if (!project) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const projectStart = dateKey(project.planned_start_date)
      ?? dateKey(project.start_date)
      ?? dateKey(project.actual_start_date)
      ?? today
    const from = compareDateKey(projectStart, today) > 0 ? today : projectStart
    const plannedEnd = dateKey(project.planned_end_date) ?? dateKey(project.end_date) ?? today
    const normalizedPlannedEnd = compareDateKey(plannedEnd, from) < 0 ? from : plannedEnd

    logger.info('Fetching reports S-curve', { projectId, from, to: today, plannedEnd: normalizedPlannedEnd })

    const [snapshots, summary] = await Promise.all([
      loadSnapshotRows(projectId, from, today),
      getProjectExecutionSummary(projectId),
    ])

    const actualByDate = new Map<string, number>()
    for (const row of snapshots) {
      const snapshotDate = dateKey(row.snapshot_date)
      if (!snapshotDate) continue
      const progress = Number(row.overall_progress ?? 0)
      if (Number.isFinite(progress)) {
        actualByDate.set(snapshotDate, clampProgress(progress))
      }
    }

    if (summary && typeof summary.overallProgress === 'number') {
      actualByDate.set(today, clampProgress(summary.overallProgress))
    }

    const points = buildSCurvePoints({
      start: from,
      to: today,
      plannedEnd: normalizedPlannedEnd,
      actualByDate,
    })

    const response: ApiResponse<SCurvePoint[]> = {
      success: true,
      data: points,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

export default router
