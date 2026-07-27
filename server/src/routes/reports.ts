import { Router, type Response } from 'express'
import rateLimit from 'express-rate-limit'

import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { query as rawQuery } from '../database.js'
import { supabase } from '../services/dbService.js'
import { getProjectExecutionSummary } from '../services/projectExecutionSummaryService.js'
import {
  buildOwnerMonthlyReportExport,
  buildProjectReportExport,
  normalizeReportExportFormat,
} from '../services/projectReportExportService.js'
import { calculateProgressMetrics } from '../utils/progressCalculation.js'
import { toBusinessDateKey } from '../utils/businessDate.js'
import type { ApiResponse } from '../types/index.js'

const router = Router({ mergeParams: true })
const REPORTS_S_CURVE_CACHE_TTL_MS = 15_000
const PDF_EXPORT_RATE_LIMIT_MAX = Number(process.env.PDF_EXPORT_RATE_LIMIT_MAX ?? 10)
type PlannedCurveSource = 'project_daily_snapshot' | 'linear_fallback_no_snapshot'
type SCurveApiResponse = ApiResponse<SCurvePoint[]> & { plannedCurveSource: PlannedCurveSource }
const reportsSCurveCache = new Map<string, {
  expiresAt: number
  payload: SCurvePoint[]
  plannedCurveSource: PlannedCurveSource
}>()

router.use(authenticate)

const pdfExportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.isFinite(PDF_EXPORT_RATE_LIMIT_MAX) && PDF_EXPORT_RATE_LIMIT_MAX > 0
    ? PDF_EXPORT_RATE_LIMIT_MAX
    : 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id ?? 'authenticated-user'),
  skip: (req) => String(req.query.format ?? '').trim().toLowerCase() !== 'pdf',
  message: {
    success: false,
    error: {
      code: 'PDF_EXPORT_RATE_LIMITED',
      message: 'PDF export requests are too frequent; retry later',
    },
  },
})

type ProjectReportRow = {
  id: string
  planned_start_date?: string | null
  start_date?: string | null
  actual_start_date?: string | null
  planned_end_date?: string | null
  end_date?: string | null
}

type ReportTaskRow = {
  id: string
  parent_id?: string | null
  progress?: number | null
  status?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
  is_executable?: boolean | null
  is_wbs_summary?: boolean | null
  progress_method?: string | null
}

type SnapshotRow = {
  snapshot_date: string
  overall_progress: number | null
  planned_cumulative: number | null
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

function sendReportAttachment(res: Response, result: {
  buffer: Buffer
  contentType: string
  fileName: string
}) {
  res.setHeader('Content-Type', result.contentType)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`)
  res.setHeader('Content-Length', String(result.buffer.length))
  res.end(result.buffer)
}

function parseRouteReportExportFormat(value: unknown) {
  const normalized = normalizeReportExportFormat(value)
  if (normalized !== 'xlsx' && normalized !== 'pdf') {
    throw new Error(`Unsupported report export format: ${normalized || 'empty'}`)
  }
  return normalized
}

function normalizeRow<T>(row: Record<string, unknown> | null | undefined): T | null {
  if (!row) return null
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as T
}

function normalizeRows<T>(rows: Array<Record<string, unknown>>): T[] {
  return rows.map((row) => normalizeRow<T>(row)).filter((row): row is T => Boolean(row))
}

// Display fallback only. Historical planned S-curve values are authored by
// project_daily_snapshot.planned_cumulative after deployment.
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
  try {
    const { rows } = await rawQuery(
      `
        SELECT id, planned_start_date, start_date, actual_start_date, planned_end_date, end_date
        FROM public.projects
        WHERE id::text = $1
        LIMIT 1
      `,
      [projectId],
    )
    return normalizeRow<ProjectReportRow>(rows[0] as Record<string, unknown> | undefined)
  } catch (error) {
    logger.warn('Direct report project query failed, falling back to Supabase REST', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

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
  try {
    const { rows } = await rawQuery(
      `
        SELECT snapshot_date, overall_progress, planned_cumulative
        FROM public.project_daily_snapshot
        WHERE project_id::text = $1
          AND snapshot_date >= $2::date
          AND snapshot_date <= $3::date
        ORDER BY snapshot_date ASC
      `,
      [projectId, from, to],
    )
    return normalizeRows<SnapshotRow>(rows as Array<Record<string, unknown>>)
  } catch (error) {
    logger.warn('Direct report snapshot query failed, falling back to Supabase REST', {
      projectId,
      from,
      to,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const { data, error } = await supabase
    .from('project_daily_snapshot')
    .select('snapshot_date, overall_progress, planned_cumulative')
    .eq('project_id', projectId)
    .gte('snapshot_date', from)
    .lte('snapshot_date', to)
    .order('snapshot_date', { ascending: true })

  if (error) {
    throw new Error(`读取 project_daily_snapshot 失败: ${error.message}`)
  }

  return Array.isArray(data) ? data as SnapshotRow[] : []
}

async function loadTaskRows(projectId: string): Promise<ReportTaskRow[]> {
  try {
    const { rows } = await rawQuery(
      `
        SELECT id, parent_id, progress, status, planned_start_date, planned_end_date,
               start_date, end_date, is_executable, is_wbs_summary, progress_method
        FROM public.tasks
        WHERE project_id::text = $1
      `,
      [projectId],
    )
    return normalizeRows<ReportTaskRow>(rows as Array<Record<string, unknown>>)
  } catch (error) {
    logger.warn('Direct report task query failed, falling back to Supabase REST', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('id, parent_id, progress, status, planned_start_date, planned_end_date, start_date, end_date, is_executable, is_wbs_summary, progress_method')
    .eq('project_id', projectId)

  if (error) {
    throw new Error(`读取任务进度口径失败: ${error.message}`)
  }

  return Array.isArray(data) ? data as ReportTaskRow[] : []
}

function buildSCurvePoints(options: {
  start: string
  to: string
  plannedEnd: string
  actualByDate: Map<string, number>
  plannedByDate: Map<string, number>
}): SCurvePoint[] {
  const points: SCurvePoint[] = []
  let cursor = options.start
  let actualCarry = 0
  let plannedCarry = 0
  const hasSnapshotPlannedLine = options.plannedByDate.size > 0

  while (compareDateKey(cursor, options.to) <= 0) {
    const actual = options.actualByDate.get(cursor)
    if (typeof actual === 'number' && Number.isFinite(actual)) {
      actualCarry = clampProgress(actual)
    }
    const planned = options.plannedByDate.get(cursor)
    if (typeof planned === 'number' && Number.isFinite(planned)) {
      plannedCarry = clampProgress(planned)
    }

    points.push({
      date: cursor,
      planned_cumulative: hasSnapshotPlannedLine
        ? plannedCarry
        : plannedProgressForDate(cursor, options.start, options.plannedEnd),
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

    const today = toBusinessDateKey()
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
    const cacheKey = [projectId, from, today, normalizedPlannedEnd].join(':')
    const cached = reportsSCurveCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      const response: SCurveApiResponse = {
        success: true,
        data: cached.payload,
        plannedCurveSource: cached.plannedCurveSource,
        timestamp: new Date().toISOString(),
      }
      return res.json(response)
    }

    const [snapshots, tasks, summary] = await Promise.all([
      loadSnapshotRows(projectId, from, today),
      loadTaskRows(projectId),
      getProjectExecutionSummary(projectId).catch((error) => {
        logger.warn('Report S-curve summary fallback unavailable', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }),
    ])

    const actualByDate = new Map<string, number>()
    const plannedByDate = new Map<string, number>()
    for (const row of snapshots) {
      const snapshotDate = dateKey(row.snapshot_date)
      if (!snapshotDate) continue
      const progress = Number(row.overall_progress ?? 0)
      if (Number.isFinite(progress)) {
        actualByDate.set(snapshotDate, clampProgress(progress))
      }
      const planned = row.planned_cumulative == null ? null : Number(row.planned_cumulative)
      if (planned != null && Number.isFinite(planned)) {
        plannedByDate.set(snapshotDate, clampProgress(planned))
      }
    }

    const summaryProgress = Number((summary as { overallProgress?: unknown } | null)?.overallProgress)
    actualByDate.set(
      today,
      clampProgress(Number.isFinite(summaryProgress)
        ? summaryProgress
        : calculateProgressMetrics(tasks, dateFromKey(today)).currentProgress),
    )

    const points = buildSCurvePoints({
      start: from,
      to: today,
      plannedEnd: normalizedPlannedEnd,
      actualByDate,
      plannedByDate,
    })
    const plannedCurveSource: PlannedCurveSource = plannedByDate.size > 0
      ? 'project_daily_snapshot'
      : 'linear_fallback_no_snapshot'
    reportsSCurveCache.set(cacheKey, {
      expiresAt: Date.now() + REPORTS_S_CURVE_CACHE_TTL_MS,
      payload: points,
      plannedCurveSource,
    })

    const response: SCurveApiResponse = {
      success: true,
      data: points,
      plannedCurveSource,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.get(
  '/export',
  pdfExportLimiter,
  requireProjectMember(req => req.params.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()
    let format: ReturnType<typeof normalizeReportExportFormat>
    try {
      format = parseRouteReportExportFormat(req.query.format)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'UNSUPPORTED_EXPORT_FORMAT',
          message: error instanceof Error ? error.message : '不支持的导出格式',
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const result = await buildProjectReportExport({
      projectId,
      format,
      view: String(req.query.view ?? '').trim() || null,
    })
    sendReportAttachment(res, result)
  }),
)

router.get(
  '/owner-monthly',
  pdfExportLimiter,
  requireProjectMember(req => req.params.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()
    let format: ReturnType<typeof normalizeReportExportFormat>
    try {
      format = parseRouteReportExportFormat(req.query.format)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'UNSUPPORTED_EXPORT_FORMAT',
          message: error instanceof Error ? error.message : '不支持的导出格式',
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const result = await buildOwnerMonthlyReportExport({
      projectId,
      format,
      period: String(req.query.period ?? '').trim() || null,
    })
    sendReportAttachment(res, result)
  }),
)

export default router
