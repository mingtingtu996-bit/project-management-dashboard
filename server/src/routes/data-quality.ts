import { Router } from 'express'
import { authenticate, requireProjectEditor, requireProjectMember, requireProjectOwner } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { dataQualityService } from '../services/dataQualityService.js'
import type { DataQualityProjectSummary, DataQualityWeights } from '../services/dataQualityService.js'
import { supabase } from '../services/dbService.js'
import { evaluateV14AssetAdmissionAutomationForTypes } from '../services/v14AssetAdmissionAutomationService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()

router.use(authenticate)

const DATA_QUALITY_PROJECT_SUMMARY_CACHE_TTL_MS = Number(process.env.DATA_QUALITY_PROJECT_SUMMARY_CACHE_TTL_MS ?? 300_000)
const dataQualityProjectSummaryCache = new Map<string, { expiresAt: number; summary: DataQualityProjectSummary }>()

const FALLBACK_DATA_QUALITY_WEIGHTS: DataQualityWeights = {
  timeliness: 0.3,
  anomaly: 0.25,
  consistency: 0.2,
  jumpiness: 0.1,
  coverage: 0.15,
}

router.get('/admission-automation', asyncHandler(async (_req, res) => {
  const response: ApiResponse = {
    success: true,
    data: evaluateV14AssetAdmissionAutomationForTypes(['data_admission_asset']),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

function normalizeMonth(value?: string | null) {
  const trimmed = String(value ?? '').trim()
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed
  return new Date().toISOString().slice(0, 7)
}

function buildProjectSummaryCacheKey(projectId: string, month?: string | null) {
  return `${projectId}:${normalizeMonth(month)}`
}

function clearProjectSummaryCache(projectId: string) {
  const prefix = `${projectId}:`
  for (const key of dataQualityProjectSummaryCache.keys()) {
    if (key.startsWith(prefix)) dataQualityProjectSummaryCache.delete(key)
  }
}

export async function warmDataQualityProjectSummaryCache(projectId: string, month?: string | null) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return null

  const cacheKey = buildProjectSummaryCacheKey(normalizedProjectId, month)
  const cached = dataQualityProjectSummaryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.summary
  }

  let summary: DataQualityProjectSummary
  try {
    summary = await dataQualityService.buildProjectSummary(normalizedProjectId, month ?? undefined)
  } catch (error) {
    if (!isBackendReadUnavailable(error)) throw error
    logger.warn('[data-quality] warmup degraded because backend reads are unavailable', {
      projectId: normalizedProjectId,
      month: month ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
    summary = buildUnavailableProjectSummary(normalizedProjectId, month ?? undefined)
  }

  dataQualityProjectSummaryCache.set(cacheKey, {
    expiresAt: Date.now() + DATA_QUALITY_PROJECT_SUMMARY_CACHE_TTL_MS,
    summary,
  })
  return summary
}

function isBackendReadUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return [
    'timed out after',
    'Query read timeout',
    'timeout expired',
    'circuit is open',
    'Connection terminated',
    'This operation was aborted',
  ].some((part) => message.includes(part))
}

function buildUnavailableProjectSummary(projectId: string, month?: string): DataQualityProjectSummary {
  const resolvedMonth = normalizeMonth(month)
  const dimensions = Object.entries(FALLBACK_DATA_QUALITY_WEIGHTS).map(([key, weight]) => ({
    key,
    label: key,
    score: 0,
    weight,
    maxContribution: Math.round(weight * 10000) / 100,
    actualContribution: 0,
    lossContribution: Math.round(weight * 10000) / 100,
    lossShare: weight,
  }))

  return {
    projectId,
    month: resolvedMonth,
    confidence: {
      score: 0,
      flag: 'low',
      note: 'Data quality summary is temporarily unavailable because backend data reads are unavailable.',
      timelinessScore: 0,
      anomalyScore: 0,
      consistencyScore: 0,
      coverageScore: 0,
      jumpinessScore: 0,
      activeFindingCount: 0,
      trendWarningCount: 0,
      anomalyFindingCount: 0,
      crossCheckFindingCount: 0,
      weights: FALLBACK_DATA_QUALITY_WEIGHTS,
      dimensions,
    },
    prompt: {
      count: 0,
      summary: 'Data quality summary is temporarily unavailable.',
      items: [],
    },
    ownerDigest: {
      shouldNotify: false,
      severity: 'info',
      scopeLabel: null,
      findingCount: 0,
      summary: 'Data quality summary is temporarily unavailable.',
    },
    findings: [],
    extendedDimensions: [],
    extendedConfidenceScore: 0,
    extendedRules: [],
  }
}

async function validateTaskInProject(projectId: string, taskId?: string | null) {
  const normalizedTaskId = String(taskId ?? '').trim()
  if (!normalizedTaskId) return null

  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', normalizedTaskId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) throw error
  if (data) return null

  return {
    success: false,
    error: { code: 'TASK_PROJECT_MISMATCH', message: '任务不属于当前项目，无法进行数据质量预检' },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse
}

router.get(
  '/settings',
  requireProjectMember((req) => req.query.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.projectId ?? '').trim()

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const settings = await dataQualityService.getProjectSettings(projectId)
    const response: ApiResponse<typeof settings> = {
      success: true,
      data: settings,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.put(
  '/settings',
  requireProjectOwner((req) => req.body?.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const weights = req.body?.weights

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (!weights || typeof weights !== 'object') {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_WEIGHTS', message: '数据质量权重不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const settings = await dataQualityService.updateProjectSettings(projectId, weights, req.user?.id ?? null)
    clearProjectSummaryCache(projectId)
    const response: ApiResponse<typeof settings> = {
      success: true,
      data: settings,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.get(
  '/project-summary',
  requireProjectMember((req) => req.query.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.projectId ?? '').trim()
    const month = String(req.query.month ?? '').trim() || undefined

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    let summary: DataQualityProjectSummary
    try {
      const cacheKey = buildProjectSummaryCacheKey(projectId, month)
      const cached = dataQualityProjectSummaryCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        summary = cached.summary
      } else {
        summary = await dataQualityService.buildProjectSummary(projectId, month)
        dataQualityProjectSummaryCache.set(cacheKey, {
          expiresAt: Date.now() + DATA_QUALITY_PROJECT_SUMMARY_CACHE_TTL_MS,
          summary,
        })
      }
    } catch (error) {
      if (!isBackendReadUnavailable(error)) throw error
      logger.warn('[data-quality] project summary degraded because backend reads are unavailable', {
        projectId,
        month: month ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
      summary = buildUnavailableProjectSummary(projectId, month)
    }
    const response: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/live-check',
  requireProjectMember((req) => req.body?.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const taskId = String(req.body?.taskId ?? '').trim() || undefined
    const draft = req.body?.draft

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (!draft || typeof draft !== 'object') {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_DRAFT', message: '任务草稿不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const taskProjectError = await validateTaskInProject(projectId, taskId ?? (draft as Record<string, unknown>).id as string | undefined)
    if (taskProjectError) return res.status(400).json(taskProjectError)

    const summary = await dataQualityService.previewTaskLiveCheck(projectId, draft, taskId)
    const response: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/recompute-snapshot',
  requireProjectOwner((req) => req.body?.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const month = String(req.body?.month ?? '').trim() || undefined

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: 'projectId is required' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    clearProjectSummaryCache(projectId)
    const summary = await dataQualityService.syncProjectDataQuality(projectId, month)
    dataQualityProjectSummaryCache.set(buildProjectSummaryCacheKey(projectId, month), {
      expiresAt: Date.now() + DATA_QUALITY_PROJECT_SUMMARY_CACHE_TTL_MS,
      summary,
    })
    const response: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/resolve-source-deleted',
  requireProjectOwner((req) => req.body?.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const findingIds = Array.isArray(req.body?.findingIds)
      ? req.body.findingIds.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
      : []
    const entityType = String(req.body?.entityType ?? '').trim()
    const entityId = String(req.body?.entityId ?? '').trim()

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: 'projectId is required' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (findingIds.length === 0 && (!entityType || !entityId)) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_RESOLUTION_TARGET', message: 'findingIds or entity target is required' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    let query = supabase
      .from('data_quality_findings')
      .update({
        status: 'resolved',
        resolved_type: 'source_deleted',
        resolved_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
      .in('status', ['active', 'ignored'])

    if (findingIds.length > 0) {
      query = query.in('id', findingIds)
    } else {
      query = query.eq('entity_type', entityType).eq('entity_id', entityId)
    }

    const { data, error } = await query.select('id, entity_type, entity_id, resolved_type')
    if (error) throw error
    clearProjectSummaryCache(projectId)

    const response: ApiResponse = {
      success: true,
      data: {
        projectId,
        resolvedCount: Array.isArray(data) ? data.length : 0,
        findings: data ?? [],
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/scan',
  requireProjectEditor((req) => req.body?.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const month = String(req.body?.month ?? '').trim() || undefined

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const summary = await dataQualityService.syncProjectDataQuality(projectId, month)
    const response: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

export default router
