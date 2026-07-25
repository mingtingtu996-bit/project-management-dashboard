import { Router } from 'express'
import { z } from 'zod'
import { getProjectPermissionLevel } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import {
  buildSyncBatchLimitError,
  REQUEST_TIMEOUT_BUDGETS,
  runWithRequestBudget,
} from '../services/requestBudgetService.js'
import {
  ManualDurationCorrectionService,
  type ManualDurationCorrectionEstimate,
} from '../services/manualDurationCorrectionService.js'
import { executeSQLOne } from '../services/dbService.js'
import { query as rawQuery } from '../database.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
router.use(authenticate)

const manualDurationCorrectionService = new ManualDurationCorrectionService()
const CURRENT_DURATION_FORECAST_BATCH_CACHE_TTL_MS = Number(process.env.CURRENT_DURATION_FORECAST_BATCH_CACHE_TTL_MS ?? 120_000)
const DURATION_TASK_PERMISSION_CACHE_TTL_MS = Number(process.env.DURATION_TASK_PERMISSION_CACHE_TTL_MS ?? 120_000)
const currentDurationForecastBatchCache = new Map<string, { expiresAt: number; data: any[] }>()
const currentDurationForecastBatchInFlight = new Map<string, Promise<any[]>>()
const currentDurationForecastByTaskCache = new Map<string, { expiresAt: number; data: any | null }>()
const durationTaskPermissionCache = new Map<string, { expiresAt: number; allowed: boolean; projectIds: string[] }>()

const externalParentDurationTruthInput = {
  parentStandardWorkCode: null,
  parentTaskTitle: null,
  parentDurationBoundaryPolicy: null,
  parentDurationPolicySource: null,
  parentReferenceDurationDays: null,
  packageChildRhythmWindowStartDay: null,
  packageChildRhythmWindowEndDay: null,
  packageChildRhythmWindowDurationDays: null,
  packageChildRhythmWindowRole: null,
}

async function readTaskProjectId(taskId: string) {
  if (process.env.NODE_ENV === 'test') {
    const row = await executeSQLOne<{ project_id?: string | null }>(
      'SELECT project_id FROM tasks WHERE id = ? LIMIT 1',
      [taskId],
    )
    return row?.project_id ?? undefined
  }

  const result = await rawQuery('SELECT project_id FROM public.tasks WHERE id = $1 LIMIT 1', [taskId])
  return (result.rows[0] as { project_id?: string | null } | undefined)?.project_id ?? undefined
}

const correctDurationBodySchema = z.object({
  task_id: z.string().trim().min(1),
  corrected_duration: z.coerce.number().positive(),
  correction_reason: z.string().trim().optional(),
  approved_by: z.string().trim().optional(),
}).passthrough()

const durationBatchBodySchema = z.object({
  task_ids: z.array(z.string().trim().min(1)).min(1),
  project_id: z.string().trim().optional(),
}).passthrough()

const delayRiskBodySchema = z.object({
  task_id: z.string().trim().min(1),
}).passthrough()

const durationSuggestionQuerySchema = z.object({
  taskId: z.string().trim().optional(),
  task_id: z.string().trim().optional(),
  suggestionPurpose: z.string().trim().optional(),
  suggestion_purpose: z.string().trim().optional(),
  templateNodeId: z.string().trim().optional(),
  template_node_id: z.string().trim().optional(),
  wbsNodeType: z.string().trim().optional(),
  wbs_node_type: z.string().trim().optional(),
  scope: z.string().trim().optional(),
  projectId: z.string().trim().optional(),
  project_id: z.string().trim().optional(),
  engineeringCategoryId: z.string().trim().optional(),
  engineering_category_id: z.string().trim().optional(),
  standardWorkCode: z.string().trim().optional(),
  standard_work_code: z.string().trim().optional(),
  standardWorkName: z.string().trim().optional(),
  standard_work_name: z.string().trim().optional(),
  taskTitle: z.string().trim().optional(),
  task_title: z.string().trim().optional(),
  engineeringObjectId: z.string().trim().optional(),
  engineering_object_id: z.string().trim().optional(),
  plannedStartDate: z.string().trim().optional(),
  planned_start_date: z.string().trim().optional(),
  plannedEndDate: z.string().trim().optional(),
  planned_end_date: z.string().trim().optional(),
  currentProgress: z.union([z.string(), z.number()]).optional(),
  current_progress: z.union([z.string(), z.number()]).optional(),
  targetProgress: z.union([z.string(), z.number()]).optional(),
  target_progress: z.union([z.string(), z.number()]).optional(),
  projectTypeCode: z.string().trim().optional(),
  project_type_code: z.string().trim().optional(),
  structureTypeCode: z.string().trim().optional(),
  structure_type_code: z.string().trim().optional(),
  methodVariantCodes: z.string().trim().optional(),
  method_variant_codes: z.string().trim().optional(),
  methodVariantSource: z.string().trim().optional(),
  method_variant_source: z.string().trim().optional(),
  elementVariantCodes: z.string().trim().optional(),
  element_variant_codes: z.string().trim().optional(),
  elementVariantSource: z.string().trim().optional(),
  element_variant_source: z.string().trim().optional(),
  buildingObjectId: z.string().trim().optional(),
  building_object_id: z.string().trim().optional(),
  floorObjectId: z.string().trim().optional(),
  floor_object_id: z.string().trim().optional(),
  physicalZoneObjectId: z.string().trim().optional(),
  physical_zone_object_id: z.string().trim().optional(),
  functionalAreaObjectId: z.string().trim().optional(),
  functional_area_object_id: z.string().trim().optional(),
  coveredBuildingIds: z.string().trim().optional(),
  covered_building_ids: z.string().trim().optional(),
  coveredFloorIds: z.string().trim().optional(),
  covered_floor_ids: z.string().trim().optional(),
  responsibleUnitId: z.string().trim().optional(),
  responsible_unit_id: z.string().trim().optional(),
  acceptanceRequired: z.union([z.string(), z.boolean()]).optional(),
  acceptance_required: z.union([z.string(), z.boolean()]).optional(),
  materialRequired: z.union([z.string(), z.boolean()]).optional(),
  material_required: z.union([z.string(), z.boolean()]).optional(),
  taskQuantity: z.union([z.string(), z.number()]).optional(),
  task_quantity: z.union([z.string(), z.number()]).optional(),
  taskQuantityUnit: z.string().trim().optional(),
  task_quantity_unit: z.string().trim().optional(),
  defaultQuantity: z.union([z.string(), z.number()]).optional(),
  default_quantity: z.union([z.string(), z.number()]).optional(),
  defaultQuantityUnit: z.string().trim().optional(),
  default_quantity_unit: z.string().trim().optional(),
  childTaskCount: z.union([z.string(), z.number()]).optional(),
  child_task_count: z.union([z.string(), z.number()]).optional(),
  parentStandardWorkCode: z.string().trim().optional(),
  parent_standard_work_code: z.string().trim().optional(),
  parentTaskTitle: z.string().trim().optional(),
  parent_task_title: z.string().trim().optional(),
  parentDurationBoundaryPolicy: z.string().trim().optional(),
  parent_duration_boundary_policy: z.string().trim().optional(),
  parentDurationPolicySource: z.string().trim().optional(),
  parent_duration_policy_source: z.string().trim().optional(),
  parentReferenceDurationDays: z.union([z.string(), z.number()]).optional(),
  parent_reference_duration_days: z.union([z.string(), z.number()]).optional(),
}).passthrough()

async function resolveTaskProjectId(taskId?: string) {
  const normalizedTaskId = String(taskId ?? '').trim()
  if (!normalizedTaskId) return undefined
  return await readTaskProjectId(normalizedTaskId)
}

async function ensureTaskProjectMatches(taskId: string, projectId?: string | null) {
  const actualProjectId = await resolveTaskProjectId(taskId)
  if (!actualProjectId) {
    throw new Error('Task not found')
  }
  if (projectId && actualProjectId !== projectId) {
    throw new Error('Task does not belong to the requested project')
  }
  return actualProjectId
}

async function ensureCanReadProject(req: any, projectId?: string | null) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return true

  const permission = await getProjectPermissionLevel(req.user?.id ?? '', normalizedProjectId, getRequestCompanyId(req))
  return permission !== null
}

async function ensureCanReadTasks(req: any, taskIds: string[]): Promise<string[] | null> {
  const normalizedTaskIds = [...new Set(taskIds.map((taskId) => String(taskId ?? '').trim()).filter(Boolean))]
  if (normalizedTaskIds.length === 0) return null
  const permissionCacheKey = [
    req.user?.id ?? '',
    getRequestCompanyId(req) ?? '',
    normalizedTaskIds.slice().sort().join('|'),
  ].join(':')
  const cachedPermission = durationTaskPermissionCache.get(permissionCacheKey)
  if (cachedPermission && cachedPermission.expiresAt > Date.now()) {
    return cachedPermission.allowed ? cachedPermission.projectIds : null
  }

  const projectIds = new Set<string>()
  const resolvedTaskIds = new Set<string>()

  if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    try {
      const result = await rawQuery(
        'SELECT id::text AS id, project_id::text AS project_id FROM public.tasks WHERE id = ANY($1::uuid[])',
        [normalizedTaskIds],
      )
      for (const row of result.rows as Array<{ id?: string | null; project_id?: string | null }>) {
        if (row.id) resolvedTaskIds.add(row.id)
        if (row.project_id) projectIds.add(row.project_id)
      }
    } catch (error) {
      logger.warn('[duration-suggestions] batch task project lookup failed; falling back to per-task lookup', { error })
    }
  }

  if (resolvedTaskIds.size < normalizedTaskIds.length) {
    for (const taskId of normalizedTaskIds.filter((id) => !resolvedTaskIds.has(id))) {
      const projectId = await resolveTaskProjectId(taskId)
      if (projectId) {
        resolvedTaskIds.add(taskId)
        projectIds.add(projectId)
      }
    }
  }

  if (resolvedTaskIds.size !== normalizedTaskIds.length || projectIds.size === 0) {
    durationTaskPermissionCache.set(permissionCacheKey, {
      expiresAt: Date.now() + DURATION_TASK_PERMISSION_CACHE_TTL_MS,
      allowed: false,
      projectIds: [],
    })
    return null
  }

  for (const projectId of projectIds) {
    if (!await ensureCanReadProject(req, projectId)) {
      durationTaskPermissionCache.set(permissionCacheKey, {
        expiresAt: Date.now() + DURATION_TASK_PERMISSION_CACHE_TTL_MS,
        allowed: false,
        projectIds: [],
      })
      return null
    }
  }

  durationTaskPermissionCache.set(permissionCacheKey, {
    expiresAt: Date.now() + DURATION_TASK_PERMISSION_CACHE_TTL_MS,
    allowed: true,
    projectIds: [...projectIds],
  })
  return [...projectIds]
}

async function loadCurrentDurationForecastBatch(taskIds: string[], visibleProjectIds: string[]) {
  const uniqueTaskIds = [...new Set(taskIds.map((taskId) => String(taskId ?? '').trim()).filter(Boolean))]
  const cacheKey = `${visibleProjectIds.slice().sort().join(',')}::${uniqueTaskIds.slice().sort().join('|')}`
  const now = Date.now()
  const cached = currentDurationForecastBatchCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.data
  }

  const taskCachedRows = uniqueTaskIds.map((taskId) => currentDurationForecastByTaskCache.get(taskId))
  if (taskCachedRows.length === uniqueTaskIds.length && taskCachedRows.every((entry) => entry && entry.expiresAt > now)) {
    const data = taskCachedRows
      .map((entry) => entry!.data)
      .filter((item): item is NonNullable<typeof item> => item !== null)
    currentDurationForecastBatchCache.set(cacheKey, {
      expiresAt: now + CURRENT_DURATION_FORECAST_BATCH_CACHE_TTL_MS,
      data,
    })
    return data
  }

  const pending = currentDurationForecastBatchInFlight.get(cacheKey)
  if (pending) return pending

  const promise = (async () => {
    const { listCurrentTaskDurationForecasts } = await import('../services/taskDurationForecastService.js')
    const results = await listCurrentTaskDurationForecasts(uniqueTaskIds, { visibleProjectIds })
    return results.map(serializeTaskDurationForecast)
  })()

  currentDurationForecastBatchInFlight.set(cacheKey, promise)
  try {
    const data = await promise
    const returnedTaskIds = new Set<string>()
    for (const item of data) {
      const record = item as Record<string, unknown>
      const taskId = String(record.task_id ?? record.taskId ?? '').trim()
      if (!taskId) continue
      returnedTaskIds.add(taskId)
      currentDurationForecastByTaskCache.set(taskId, {
        expiresAt: Date.now() + CURRENT_DURATION_FORECAST_BATCH_CACHE_TTL_MS,
        data: item,
      })
    }
    for (const taskId of uniqueTaskIds) {
      if (returnedTaskIds.has(taskId)) continue
      currentDurationForecastByTaskCache.set(taskId, {
        expiresAt: Date.now() + CURRENT_DURATION_FORECAST_BATCH_CACHE_TTL_MS,
        data: null,
      })
    }
    currentDurationForecastBatchCache.set(cacheKey, {
      expiresAt: Date.now() + CURRENT_DURATION_FORECAST_BATCH_CACHE_TTL_MS,
      data,
    })
    return data
  } finally {
    currentDurationForecastBatchInFlight.delete(cacheKey)
  }
}

export async function warmCurrentDurationForecastBatchCache(taskIds: string[], projectId: string) {
  return loadCurrentDurationForecastBatch(taskIds, [projectId])
}

function readPlainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeDurationSourceBreakdown(
  rawValue: unknown,
  fallback: {
    forecastSource: unknown
    benchmarkKey: unknown
    confidenceLevel: unknown
    durationCalibrationSource: unknown
    durationProvenance: unknown
    factorSummary: unknown
  },
) {
  const raw = readPlainObject(rawValue) ?? {}
  return {
    forecastSource: raw.forecastSource ?? fallback.forecastSource,
    benchmarkKey: raw.benchmarkKey ?? fallback.benchmarkKey,
    confidenceLevel: raw.confidenceLevel ?? fallback.confidenceLevel,
    durationCalibrationSource: raw.durationCalibrationSource ?? fallback.durationCalibrationSource,
    durationProvenance: raw.durationProvenance ?? fallback.durationProvenance,
    factorSummary: raw.factorSummary ?? fallback.factorSummary,
  }
}

function serializeDurationSuggestion(suggestion: any) {
  const durationOutputCode = suggestion?.durationOutputCode ?? null
  const durationOutputSemanticFieldName = suggestion?.durationOutputSemanticFieldName ?? null
  const planReferenceDays = suggestion?.planReferenceDays ?? null
  const contextualReferenceDays = suggestion?.contextualReferenceDays ?? null
  const remainingForecastDays = suggestion?.remainingForecastDays ?? null
  const normalizedOutputCode = String(durationOutputCode ?? '').trim()
  const semanticReferenceDays = normalizedOutputCode === 'contextual_reference'
    ? contextualReferenceDays
    : normalizedOutputCode === 'plan_reference'
      ? planReferenceDays
      : normalizedOutputCode === 'remaining_forecast'
        ? remainingForecastDays
        : null
  const conservativeDurationDays = semanticReferenceDays == null ? null : suggestion?.conservativeDurationDays ?? null
  const confidenceLevel = suggestion?.confidenceLevel ?? null
  const confidenceScore = suggestion?.confidenceScore ?? null
  const forecastSource = suggestion?.forecastSource ?? null
  const durationCalibrationSource = suggestion?.durationCalibrationSource ?? null
  const durationProvenance = suggestion?.durationProvenance ?? null
  const businessReason = suggestion?.businessReason ?? null
  const businessReasonCode = suggestion?.businessReasonCode ?? null
  const businessReasonCodes = suggestion?.businessReasonCodes ?? null
  const businessReasonParams = suggestion?.businessReasonParams ?? null
  const displaySummary = suggestion?.displaySummary ?? null
  const sourceBreakdown = normalizeDurationSourceBreakdown(suggestion?.sourceBreakdown, {
    forecastSource,
    benchmarkKey: suggestion?.benchmarkKey ?? null,
    confidenceLevel,
    durationCalibrationSource,
    durationProvenance,
    factorSummary: suggestion?.factorSummary ?? null,
  })

  return {
    durationOutputCode,
    durationOutputSemanticFieldName,
    planReferenceDays,
    contextualReferenceDays,
    remainingForecastDays,
    conservativeDurationDays,
    confidenceLevel,
    confidenceScore,
    confidence: confidenceScore,
    sampleSize: suggestion?.sampleSize ?? null,
    sourceBreakdown,
    businessReason,
    businessReasonCode,
    businessReasonCodes,
    businessReasonParams,
    displaySummary,
    forecastSource,
    durationCalibrationSource,
    durationProvenance,
    dataMaturity: suggestion?.dataMaturity ?? null,
    dataMaturityReasons: suggestion?.dataMaturityReasons ?? null,
    dataUpgradePath: suggestion?.dataUpgradePath ?? null,
    dataUpgradeBlockedBy: suggestion?.dataUpgradeBlockedBy ?? null,
    factorAvailability: suggestion?.factorAvailability ?? null,
    durationBoundaryRole: suggestion?.durationBoundaryRole ?? null,
    parentDurationBoundaryPolicy: suggestion?.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: suggestion?.nonAdditiveWithParentDuration ?? null,
    parentReferenceDurationDays: suggestion?.parentReferenceDurationDays ?? null,
    parentTaskTitle: suggestion?.parentTaskTitle ?? null,
    independentReferenceDurationDays: suggestion?.independentReferenceDurationDays ?? businessReasonParams?.independentReferenceDurationDays ?? null,
    packageChildPlanDurationDays: suggestion?.packageChildPlanDurationDays ?? businessReasonParams?.packageChildPlanDurationDays ?? null,
    planDurationTruthSource: suggestion?.planDurationTruthSource ?? businessReasonParams?.planDurationTruthSource ?? null,
    forecastFinishDate: suggestion?.forecastFinishDate ?? null,
    forecastDelayDays: suggestion?.forecastDelayDays ?? null,
    delayRiskIndex: suggestion?.delayRiskIndex ?? null,
    topFactors: suggestion?.topFactors ?? null,
  }
}

function serializeTaskDurationForecast(forecast: any) {
  const durationOutputCode = forecast?.durationOutputCode ?? null
  const durationOutputSemanticFieldName = forecast?.durationOutputSemanticFieldName ?? null
  const remainingDuration = forecast?.remainingDuration ?? null
  const remainingForecastDays = remainingDuration?.availability === 'available'
    && remainingDuration?.unit === 'construction_production_day'
    && Number.isFinite(Number(remainingDuration?.value))
    ? Number(remainingDuration.value)
    : null
  const normalizedOutputCode = String(durationOutputCode ?? '').trim()
  const semanticReferenceDays = normalizedOutputCode === 'remaining_forecast' ? remainingForecastDays : null
  return {
    taskId: forecast?.taskId ?? null,
    durationOutputCode,
    durationOutputSemanticFieldName,
    remainingForecastDays,
    remainingDuration,
    conservativeDurationDays: semanticReferenceDays == null ? null : forecast?.conservativeDurationDays ?? null,
    forecastFinishDate: forecast?.forecastFinishDate ?? null,
    forecastDelayDays: forecast?.forecastDelayDays ?? 0,
    delayRiskIndex: forecast?.delayRiskIndex ?? null,
    confidenceLevel: forecast?.confidenceLevel ?? null,
    confidenceScore: forecast?.confidenceScore ?? null,
    businessReason: forecast?.businessReason ?? null,
    dataMaturity: forecast?.dataMaturity ?? null,
    topFactors: forecast?.topFactors ?? null,
    businessFactorBadges: forecast?.businessFactorBadges ?? null,
  }
}

function readNullableText(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
  }
  return null
}

function readPositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readProgressNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null
}

function readCodeList(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (!text) continue
    return [...new Set(text.split(/[,\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))]
  }
  return []
}

function readStringList(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const items = value.map((item) => String(item ?? '').trim()).filter(Boolean)
      if (items.length > 0) return [...new Set(items)]
    }
    const text = String(value ?? '').trim()
    if (!text) continue
    const items = text.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean)
    if (items.length > 0) return [...new Set(items)]
  }
  return []
}

function readNullableBoolean(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    if (typeof value === 'boolean') return value
    const text = String(value).trim().toLowerCase()
    if (!text) continue
    if (['1', 'true', 'yes', 'y', '是'].includes(text)) return true
    if (['0', 'false', 'no', 'n', '否'].includes(text)) return false
  }
  return null
}

router.get(
  '/',
  validate(durationSuggestionQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const taskId = readNullableText(req.query.taskId, req.query.task_id)
    let projectId = readNullableText(req.query.projectId, req.query.project_id)
    if (taskId) {
      projectId = await ensureTaskProjectMatches(taskId, projectId)
    }

    if (projectId && !await ensureCanReadProject(req, projectId)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' }, timestamp: new Date().toISOString() })
    }

    const { getTaskDurationSuggestion } = await import('../services/durationSuggestionService.js')
    const suggestion = await getTaskDurationSuggestion({
      suggestionPurpose: readNullableText(req.query.suggestionPurpose, req.query.suggestion_purpose) as any,
      taskId,
      templateNodeId: readNullableText(req.query.templateNodeId, req.query.template_node_id),
      wbsNodeType: readNullableText(req.query.wbsNodeType, req.query.wbs_node_type) ?? 'process',
      engineeringCategoryId: readNullableText(req.query.engineeringCategoryId, req.query.engineering_category_id),
      standardWorkCode: readNullableText(req.query.standardWorkCode, req.query.standard_work_code),
      standardWorkName: readNullableText(req.query.standardWorkName, req.query.standard_work_name),
      ...externalParentDurationTruthInput,
      taskTitle: readNullableText(req.query.taskTitle, req.query.task_title),
      engineeringObjectId: readNullableText(req.query.engineeringObjectId, req.query.engineering_object_id),
      plannedStartDate: readNullableText(req.query.plannedStartDate, req.query.planned_start_date),
      plannedEndDate: readNullableText(req.query.plannedEndDate, req.query.planned_end_date),
      currentProgress: readProgressNumber(req.query.currentProgress ?? req.query.current_progress),
      targetProgress: readProgressNumber(req.query.targetProgress ?? req.query.target_progress),
      buildingObjectId: readNullableText(req.query.buildingObjectId, req.query.building_object_id),
      floorObjectId: readNullableText(req.query.floorObjectId, req.query.floor_object_id),
      zoneObjectId: readNullableText(
        req.query.physicalZoneObjectId,
        req.query.physical_zone_object_id,
        req.query.functionalAreaObjectId,
        req.query.functional_area_object_id,
      ),
      coveredBuildingIds: readStringList(req.query.coveredBuildingIds, req.query.covered_building_ids),
      coveredFloorIds: readStringList(req.query.coveredFloorIds, req.query.covered_floor_ids),
      responsibleUnitId: readNullableText(req.query.responsibleUnitId, req.query.responsible_unit_id),
      projectTypeCode: readNullableText(req.query.projectTypeCode, req.query.project_type_code),
      structureTypeCode: readNullableText(req.query.structureTypeCode, req.query.structure_type_code),
      methodVariantCodes: readCodeList(req.query.methodVariantCodes, req.query.method_variant_codes),
      methodVariantSource: readNullableText(req.query.methodVariantSource, req.query.method_variant_source),
      elementVariantCodes: readCodeList(req.query.elementVariantCodes, req.query.element_variant_codes),
      elementVariantSource: readNullableText(req.query.elementVariantSource, req.query.element_variant_source),
      taskQuantity: readPositiveNumber(req.query.taskQuantity ?? req.query.task_quantity),
      taskQuantityUnit: readNullableText(req.query.taskQuantityUnit, req.query.task_quantity_unit),
      defaultQuantity: readPositiveNumber(req.query.defaultQuantity ?? req.query.default_quantity),
      defaultQuantityUnit: readNullableText(req.query.defaultQuantityUnit, req.query.default_quantity_unit),
      childTaskCount: readPositiveNumber(req.query.childTaskCount ?? req.query.child_task_count),
      acceptanceRequired: readNullableBoolean(req.query.acceptanceRequired, req.query.acceptance_required),
      materialRequired: readNullableBoolean(req.query.materialRequired, req.query.material_required),
      projectId,
    })

    res.json({ success: true, data: serializeDurationSuggestion(suggestion), timestamp: new Date().toISOString() })
  }),
)

router.post(
  '/correct-duration',
  validate(correctDurationBodySchema),
  requireProjectEditor((req) => resolveTaskProjectId(req.body?.task_id)),
  asyncHandler(async (req, res) => {
    const estimate = await manualDurationCorrectionService.correctDuration(req.body)
    const response: ApiResponse<ManualDurationCorrectionEstimate> = {
      success: true,
      data: estimate,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post('/task', asyncHandler(async (req, res) => {
  const taskId = String(req.body?.task_id ?? '').trim() || null
  let projectId = String(req.body?.project_id ?? '').trim() || null
  if (taskId && !projectId) {
    projectId = await resolveTaskProjectId(taskId) ?? null
  }
  if (projectId && !await ensureCanReadProject(req, projectId)) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' }, timestamp: new Date().toISOString() })
  }

  const { getTaskDurationSuggestion } = await import('../services/durationSuggestionService.js')
  const suggestion = await getTaskDurationSuggestion({
    suggestionPurpose: (req.body?.suggestion_purpose ?? req.body?.suggestionPurpose ?? null) as any,
    taskId,
    templateNodeId: req.body?.template_node_id ?? null,
    wbsNodeType: req.body?.wbs_node_type ?? 'process',
    engineeringCategoryId: req.body?.engineering_category_id ?? null,
    standardWorkCode: req.body?.standard_work_code ?? null,
    standardWorkName: req.body?.standard_work_name ?? null,
    ...externalParentDurationTruthInput,
    taskTitle: req.body?.task_title ?? req.body?.title ?? null,
    engineeringObjectId: req.body?.engineering_object_id ?? req.body?.engineeringObjectId ?? null,
    plannedStartDate: req.body?.planned_start_date ?? null,
    plannedEndDate: req.body?.planned_end_date ?? null,
    currentProgress: req.body?.current_progress ?? req.body?.currentProgress ?? null,
    targetProgress: req.body?.target_progress ?? req.body?.targetProgress ?? null,
    buildingObjectId: req.body?.building_object_id ?? req.body?.buildingObjectId ?? null,
    floorObjectId: req.body?.floor_object_id ?? req.body?.floorObjectId ?? null,
    zoneObjectId: req.body?.physical_zone_object_id ?? req.body?.physicalZoneObjectId ?? req.body?.functional_area_object_id ?? req.body?.functionalAreaObjectId ?? null,
    coveredBuildingIds: readStringList(req.body?.covered_building_ids, req.body?.coveredBuildingIds),
    coveredFloorIds: readStringList(req.body?.covered_floor_ids, req.body?.coveredFloorIds),
    responsibleUnitId: req.body?.responsible_unit_id ?? req.body?.responsibleUnitId ?? null,
    projectTypeCode: req.body?.project_type_code ?? req.body?.projectTypeCode ?? null,
    structureTypeCode: req.body?.structure_type_code ?? req.body?.structureTypeCode ?? null,
    methodVariantCodes: Array.isArray(req.body?.method_variant_codes) ? req.body.method_variant_codes : req.body?.methodVariantCodes ?? null,
    methodVariantSource: req.body?.method_variant_source ?? req.body?.methodVariantSource ?? null,
    elementVariantCodes: Array.isArray(req.body?.element_variant_codes) ? req.body.element_variant_codes : req.body?.elementVariantCodes ?? null,
    elementVariantSource: req.body?.element_variant_source ?? req.body?.elementVariantSource ?? null,
    taskQuantity: req.body?.task_quantity ?? req.body?.taskQuantity ?? null,
    taskQuantityUnit: req.body?.task_quantity_unit ?? req.body?.taskQuantityUnit ?? null,
    defaultQuantity: req.body?.default_quantity ?? req.body?.defaultQuantity ?? null,
    defaultQuantityUnit: req.body?.default_quantity_unit ?? req.body?.defaultQuantityUnit ?? null,
    childTaskCount: req.body?.child_task_count ?? req.body?.childTaskCount ?? null,
    acceptanceRequired: readNullableBoolean(req.body?.acceptance_required, req.body?.acceptanceRequired),
    materialRequired: readNullableBoolean(req.body?.material_required, req.body?.materialRequired),
    projectId,
  })
  res.json({ success: true, data: serializeDurationSuggestion(suggestion), timestamp: new Date().toISOString() })
}))

router.post('/delay-risk/task', validate(delayRiskBodySchema), asyncHandler(async (req, res) => {
  const taskId = String(req.body?.task_id ?? '').trim()
  const visibleProjectIds = await ensureCanReadTasks(req, [taskId])
  if (!visibleProjectIds) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' }, timestamp: new Date().toISOString() })
  }

  const { analyzeTaskDelayRiskWithDurationForecast } = await import('../services/taskDurationForecastService.js')
  const analysis = await analyzeTaskDelayRiskWithDurationForecast(taskId, { visibleProjectIds })
  res.json({
    success: true,
    data: analysis?.duration_forecast
      ? {
          ...analysis,
          duration_forecast: serializeTaskDurationForecast(analysis.duration_forecast),
        }
      : analysis,
    timestamp: new Date().toISOString(),
  })
}))

router.post('/current-batch', validate(durationBatchBodySchema), asyncHandler(async (req, res) => {
  const taskIds: string[] = Array.isArray(req.body?.task_ids) ? req.body.task_ids.map(String) : []
  if (taskIds.length > 100) {
    const error = buildSyncBatchLimitError(taskIds.length, { operation: 'duration_suggestion.current_batch' })
    return res.status(error.statusCode ?? 413).json({
      success: false,
      error: {
        code: error.code ?? 'BATCH_ASYNC_REQUIRED',
        message: error.message,
        details: error.details,
      },
      timestamp: new Date().toISOString(),
    })
  }
  const visibleProjectIds = await ensureCanReadTasks(req, taskIds)
  if (!visibleProjectIds) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' }, timestamp: new Date().toISOString() })
  }

  const results = await runWithRequestBudget(
    {
      operation: 'duration_suggestion.current_batch',
      timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
    },
    () => loadCurrentDurationForecastBatch(taskIds, visibleProjectIds),
  )
  res.json({ success: true, data: results, timestamp: new Date().toISOString() })
}))

router.post('/batch', validate(durationBatchBodySchema), asyncHandler(async (req, res) => {
  const taskIds: string[] = Array.isArray(req.body?.task_ids) ? req.body.task_ids.map(String) : []
  if (taskIds.length > 100) {
    const error = buildSyncBatchLimitError(taskIds.length, { operation: 'duration_suggestion.batch' })
    return res.status(error.statusCode ?? 413).json({
      success: false,
      error: {
        code: error.code ?? 'BATCH_ASYNC_REQUIRED',
        message: error.message,
        details: error.details,
      },
      timestamp: new Date().toISOString(),
    })
  }
  const visibleProjectIds = await ensureCanReadTasks(req, taskIds)
  if (!visibleProjectIds) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' }, timestamp: new Date().toISOString() })
  }

  const results = await runWithRequestBudget(
    {
      operation: 'duration_suggestion.batch',
      timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
    },
    async () => {
      const { forecastBatchTasks } = await import('../services/taskDurationForecastService.js')
      return await forecastBatchTasks(taskIds, { visibleProjectIds })
    },
  )
  res.json({ success: true, data: results.map(serializeTaskDurationForecast), timestamp: new Date().toISOString() })
}))

router.get('/tasks/:taskId/duration-forecast', asyncHandler(async (req, res) => {
  const taskId = String(req.params.taskId ?? '').trim()
  const projectId = await resolveTaskProjectId(taskId)
  if (!projectId) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' }, timestamp: new Date().toISOString() })
  }
  if (projectId && !await ensureCanReadProject(req, projectId)) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' }, timestamp: new Date().toISOString() })
  }

  const { forecastTaskDuration } = await import('../services/taskDurationForecastService.js')
  const forecast = await forecastTaskDuration(taskId, { projectId })
  res.json({ success: true, data: serializeTaskDurationForecast(forecast), timestamp: new Date().toISOString() })
}))

router.post('/tasks/:taskId/duration-forecast/refresh', asyncHandler(async (req, res) => {
  const taskId = String(req.params.taskId ?? '').trim()
  const projectId = await resolveTaskProjectId(taskId)
  if (!projectId) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' }, timestamp: new Date().toISOString() })
  }
  if (projectId && !await ensureCanReadProject(req, projectId)) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' }, timestamp: new Date().toISOString() })
  }

  const { forecastTaskDuration } = await import('../services/taskDurationForecastService.js')
  const forecast = await forecastTaskDuration(taskId, { projectId, triggerContext: 'user_clicked_refresh' })
  res.json({ success: true, data: serializeTaskDurationForecast(forecast), timestamp: new Date().toISOString() })
}))

export default router
