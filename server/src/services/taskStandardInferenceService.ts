import { logger } from '../middleware/logger.js'
import type { Task } from '../types/db.js'
import {
  expandTitleWeakStandardWorkSearchTextFromResolver,
  inferTitleWeakStandardWorkCodesFromResolver,
  inferTitleWeakStandardWorkMatchesFromResolver,
  resolveStandardWorkDurationSeed,
} from './algorithmSeedResolver.js'
import { getTitleWeakRecognizability } from '../seeds/v1472TitleWeakRecognitionSeed.js'
import { supabase } from './dbService.js'

type TaskWritePayload = Record<string, unknown>

type EngineeringCategoryRow = {
  id?: string | null
  project_id?: string | null
  category_name?: string | null
  category_type?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  enabled?: boolean | null
}

type EngineeringObjectRow = {
  id?: string | null
  object_type?: string | null
  object_code?: string | null
  object_name?: string | null
  parent_id?: string | null
  status?: string | null
}

export type TaskStandardInferenceResult = {
  standardMapped: boolean
  scopeCoverageMapped: boolean
}

export type TitleWeakFalsePositiveFeedback = {
  detected: boolean
  previousStandardWorkCode: string | null
  correctedStandardWorkCode: string | null
  previousRuleId: string | null
}

const OVERALL_BUILDING_PATTERNS = [
  /全部楼栋/,
  /所有楼栋/,
  /各栋/,
  /全楼/,
  /全区/,
  /整体/,
  /全部/,
]

const OVERALL_FLOOR_PATTERNS = [
  /全部楼层/,
  /所有楼层/,
  /各层/,
  /整栋/,
  /整层/,
  /全楼/,
  /整体/,
  /全部/,
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {}
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean)))
}

function writeMetadata(payload: TaskWritePayload, metadata: Record<string, unknown>) {
  payload.standard_task_metadata = metadata
}

function mergeExistingAndPatch(existingTask: Partial<Task> | null | undefined, payload: TaskWritePayload) {
  return {
    ...(existingTask ? existingTask as Record<string, unknown> : {}),
    ...payload,
  }
}

function hasStandardClassification(record: Record<string, unknown>) {
  return Boolean(
    normalizeId(record.engineering_category_id)
    || normalizeId(record.template_node_id)
    || normalizeId(record.standard_work_code)
  )
}

function buildRuleRawText(record: Record<string, unknown>, parentTask?: Partial<Task> | null) {
  const parentRecord = parentTask as Record<string, unknown> | null | undefined
  return [
    record.title,
    record.name,
    record.description,
    record.engineering_category_name,
    record.engineering_category_type,
    record.standard_work_name,
    record.standard_work_code,
    record.wbs_node_type,
    record.specialty_type,
    record.profession,
    record.professional_name,
    record.professional_object_name,
    record.phase_name,
    record.section_name,
    record.building_name,
    record.floor_name,
    record.zone_name,
    parentTask?.title,
    parentTask?.standard_work_name,
    parentTask?.standard_work_code,
    parentRecord?.engineering_category_name,
    parentRecord?.engineering_category_type,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function buildRuleTitleText(record: Record<string, unknown>) {
  return [
    record.title,
    record.name,
    record.description,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function buildRuleContextKeywords(record: Record<string, unknown>, parentTask?: Partial<Task> | null) {
  const parentRecord = parentTask as Record<string, unknown> | null | undefined
  return [
    record.engineering_category_name,
    record.engineering_category_type,
    record.standard_work_name,
    record.standard_work_code,
    record.wbs_node_type,
    record.specialty_type,
    record.profession,
    record.professional_name,
    record.professional_object_name,
    record.phase_name,
    record.section_name,
    record.building_name,
    record.floor_name,
    record.zone_name,
    parentTask?.title,
    parentTask?.standard_work_name,
    parentTask?.standard_work_code,
    parentRecord?.engineering_category_name,
    parentRecord?.engineering_category_type,
  ].map(normalizeText).filter(Boolean)
}

function writeUnmatchedStandardMapping(
  payload: TaskWritePayload,
  merged: Record<string, unknown>,
  rawMatchText: string,
  reason: string,
  weakStandardWorkCodes: string[] = [],
  extras: Record<string, unknown> = {},
) {
  const normalized = normalizeText(rawMatchText)
  if (!normalized) return

  const metadata = readMetadata(merged.standard_task_metadata)
  writeMetadata(payload, {
    ...metadata,
    backendStandardMapping: {
      source: 'algorithm_seed_unmatched',
      status: 'unmatched',
      reason,
      rawTitle: normalizeText(merged.title),
      candidateText: normalized.slice(0, 500),
      weakStandardWorkCodes,
      inferredAt: new Date().toISOString(),
      ...extras,
    },
  })
}

function writeTitleQualityGateMapping(
  payload: TaskWritePayload,
  merged: Record<string, unknown>,
  rawMatchText: string,
  reason: string,
) {
  const metadata = readMetadata(merged.standard_task_metadata)
  writeMetadata(payload, {
    ...metadata,
    backendStandardMapping: {
      source: 'title_quality_gate',
      status: 'unrecognizable',
      reason,
      dataQualityIssue: 'title_unrecognizable',
      rawTitle: normalizeText(merged.title),
      candidateText: normalizeText(rawMatchText).slice(0, 500),
      inferredAt: new Date().toISOString(),
    },
  })
}

function readBackendStandardMapping(record: Record<string, unknown>) {
  return readMetadata(readMetadata(record.standard_task_metadata).backendStandardMapping)
}

export function buildTitleWeakFalsePositiveFeedback(params: {
  previousTask?: Partial<Task> | null
  nextRecord: Record<string, unknown>
}): TitleWeakFalsePositiveFeedback | null {
  const previous = params.previousTask as Record<string, unknown> | null | undefined
  if (!previous) return null
  const previousMapping = readBackendStandardMapping(previous)
  const source = normalizeText(previousMapping.source)
  if (source !== 'algorithm_seed_rule') return null
  const previousStandardWorkCode = normalizeId(previousMapping.standardWorkCode)
    ?? normalizeId(previous.standard_work_code)
  const correctedStandardWorkCode = normalizeId(params.nextRecord.standard_work_code)
  if (!previousStandardWorkCode || !correctedStandardWorkCode || previousStandardWorkCode === correctedStandardWorkCode) {
    return null
  }
  return {
    detected: true,
    previousStandardWorkCode,
    correctedStandardWorkCode,
    previousRuleId: normalizeId(previousMapping.matchRuleId) ?? normalizeId(previousMapping.seedCode),
  }
}

export function attachTitleWeakFalsePositiveFeedback(params: {
  payload: TaskWritePayload
  merged: Record<string, unknown>
  feedback: TitleWeakFalsePositiveFeedback
}) {
  const metadata = readMetadata(params.merged.standard_task_metadata)
  const mapping = readMetadata(metadata.backendStandardMapping)
  writeMetadata(params.payload, {
    ...metadata,
    backendStandardMapping: {
      ...mapping,
      source: 'user_corrected_standard_work',
      status: 'corrected',
      feedbackType: 'false_positive',
      predictedStandardWorkCode: params.feedback.previousStandardWorkCode,
      correctedStandardWorkCode: params.feedback.correctedStandardWorkCode,
      previousMatchRuleId: params.feedback.previousRuleId,
      correctedAt: new Date().toISOString(),
    },
  })
}

function readSeedStandardWorkCode(seed: Record<string, unknown>) {
  const codes = readStringArray(seed.standardWorkCodes ?? seed.standard_work_codes)
  return normalizeId(codes[0])
    ?? normalizeId(seed.standardWorkCode)
    ?? normalizeId(seed.standard_work_code)
    ?? normalizeId(seed.stableCode)
    ?? normalizeId(seed.__stableCode)
}

function readSeedStandardWorkName(seed: Record<string, unknown>, fallbackCode: string) {
  return normalizeId(seed.standardWorkName)
    ?? normalizeId(seed.standard_work_name)
    ?? normalizeId(seed.name)
    ?? fallbackCode
}

async function findCategoryByStandardWorkCode(
  projectId: string,
  standardWorkCode: string,
  wbsNodeType?: string | null,
) {
  const { data, error } = await (supabase as any)
    .from('engineering_categories')
    .select('id, project_id, category_name, category_type, standard_work_code, standard_work_name, enabled')
    .eq('standard_work_code', standardWorkCode)
    .eq('enabled', true)

  if (error) {
    logger.warn('[taskStandardInferenceService] failed to resolve engineering category for standard work', {
      projectId,
      standardWorkCode,
      error,
    })
    return null
  }

  const rows = Array.isArray(data) ? data as EngineeringCategoryRow[] : []
  const usable = rows.filter((row) => !row.project_id || String(row.project_id) === projectId)
  const nodeType = normalizeLower(wbsNodeType)
  usable.sort((a, b) => {
    const projectScoreA = a.project_id ? 10 : 0
    const projectScoreB = b.project_id ? 10 : 0
    const typeScoreA = nodeType && normalizeLower(a.category_type) === nodeType ? 2 : 0
    const typeScoreB = nodeType && normalizeLower(b.category_type) === nodeType ? 2 : 0
    return (projectScoreB + typeScoreB) - (projectScoreA + typeScoreA)
  })
  return usable[0] ?? null
}

async function inferStandardMapping(params: {
  projectId: string
  payload: TaskWritePayload
  merged: Record<string, unknown>
  parentTask?: Partial<Task> | null
}) {
  if (hasStandardClassification(params.merged)) return false

  const rawMatchText = buildRuleRawText(params.merged, params.parentTask)
  const recognizability = getTitleWeakRecognizability(buildRuleTitleText(params.merged))
  if (!recognizability.recognizable) {
    writeTitleQualityGateMapping(params.payload, params.merged, rawMatchText, recognizability.reason)
    return false
  }

  const contextKeywords = buildRuleContextKeywords(params.merged, params.parentTask)
  const matchText = await expandTitleWeakStandardWorkSearchTextFromResolver(rawMatchText, {
    projectId: params.projectId,
    contextKeywords,
  })
  if (!matchText) return false
  const weakStandardWorkCodes = await inferTitleWeakStandardWorkCodesFromResolver(rawMatchText, {
    projectId: params.projectId,
    contextKeywords,
  })
  const weakStandardWorkMatches = await inferTitleWeakStandardWorkMatchesFromResolver(rawMatchText, {
    projectId: params.projectId,
    contextKeywords,
  })
  const bestWeakMatch = weakStandardWorkMatches[0]

  const seed = await resolveStandardWorkDurationSeed(matchText, {
    projectId: params.projectId,
    standardWorkCodes: weakStandardWorkCodes,
    applicableGranularity: normalizeLower(params.merged.wbs_node_type) === 'summary' ? 'summary' : 'task',
  }) as Record<string, unknown> | null

  const standardWorkCode = seed ? readSeedStandardWorkCode(seed) : null
  if (!seed || !standardWorkCode) {
    writeUnmatchedStandardMapping(
      params.payload,
      params.merged,
      rawMatchText,
      !seed ? 'no_standard_work_duration_seed_match' : 'standard_work_code_missing_in_seed',
      weakStandardWorkCodes,
      {
        matchScore: bestWeakMatch?.score ?? null,
        matchQuality: bestWeakMatch?.quality ?? null,
        matchRuleId: bestWeakMatch?.ruleId ?? null,
        weakStandardWorkMatches: weakStandardWorkMatches.slice(0, 5),
      },
    )
    return false
  }

  const standardWorkName = readSeedStandardWorkName(seed, standardWorkCode)
  const category = await findCategoryByStandardWorkCode(
    params.projectId,
    standardWorkCode,
    normalizeId(params.merged.wbs_node_type),
  )

  if (category?.id) {
    params.payload.engineering_category_id = category.id
    params.payload.engineering_category_name = category.category_name ?? standardWorkName
    params.payload.engineering_category_type = category.category_type ?? params.merged.wbs_node_type ?? null
    if (!normalizeId(params.payload.wbs_node_type) && category.category_type) {
      params.payload.wbs_node_type = category.category_type
    }
  }

  params.payload.standard_work_code = category?.standard_work_code ?? standardWorkCode
  params.payload.standard_work_name = category?.standard_work_name ?? category?.category_name ?? standardWorkName

  const metadata = readMetadata(params.merged.standard_task_metadata)
  writeMetadata(params.payload, {
    ...metadata,
    backendStandardMapping: {
      source: 'algorithm_seed_rule',
      seedCode: normalizeId(seed.__stableCode) ?? normalizeId(seed.stableCode) ?? standardWorkCode,
      standardWorkCode,
      standardWorkName: params.payload.standard_work_name,
      engineeringCategoryId: category?.id ?? null,
      confidence: normalizeId(seed.confidence) ?? 'medium',
      matchScore: bestWeakMatch?.score ?? null,
      matchQuality: bestWeakMatch?.quality ?? null,
      matchRuleId: bestWeakMatch?.ruleId ?? null,
      matchedTerms: bestWeakMatch?.matchedTerms ?? [],
      inferredAt: new Date().toISOString(),
    },
  })

  return true
}

function hasAnyOverallPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function inferNumberRange(text: string, unitPattern: string) {
  const pattern = new RegExp(`(\\d+)\\s*(?:#|号)?\\s*(?:${unitPattern})?\\s*[-~至到]\\s*(\\d+)\\s*(?:#|号)?\\s*(?:${unitPattern})?`)
  const match = text.match(pattern)
  if (!match) return []
  const from = Number(match[1])
  const to = Number(match[2])
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 200) return []
  return Array.from({ length: to - from + 1 }, (_, index) => String(from + index))
}

function objectMatchesNumber(row: EngineeringObjectRow, numberText: string) {
  const values = [row.object_code, row.object_name].map(normalizeLower)
  return values.some((value) => {
    if (!value) return false
    return value.includes(`${numberText}#`)
      || value.includes(`${numberText}号`)
      || value.includes(`${numberText}栋`)
      || value.includes(`${numberText}楼`)
      || value === numberText
  })
}

async function listActiveEngineeringObjects(projectId: string, objectType: 'building' | 'floor') {
  const { data, error } = await (supabase as any)
    .from('engineering_objects')
    .select('id, object_type, object_code, object_name, parent_id, status')
    .eq('project_id', projectId)
    .eq('object_type', objectType)
    .eq('status', 'active')

  if (error) {
    logger.warn('[taskStandardInferenceService] failed to load engineering objects for scope inference', {
      projectId,
      objectType,
      error,
    })
    return []
  }
  return Array.isArray(data) ? data as EngineeringObjectRow[] : []
}

function pickExplicitRangeObjects(rows: EngineeringObjectRow[], rangeNumbers: string[]) {
  if (rangeNumbers.length === 0) return []
  return rows.filter((row) => rangeNumbers.some((numberText) => objectMatchesNumber(row, numberText)))
}

async function inferScopeCoverage(params: {
  projectId: string
  payload: TaskWritePayload
  merged: Record<string, unknown>
}) {
  const metadata = readMetadata(params.merged.standard_task_metadata)
  const existingBuildings = readStringArray(metadata.coveredBuildingIds ?? metadata.covered_building_ids)
  const existingFloors = readStringArray(metadata.coveredFloorIds ?? metadata.covered_floor_ids)
  if (existingBuildings.length > 1 || existingFloors.length > 1) return false

  const text = [
    params.merged.title,
    params.merged.description,
    params.merged.standard_work_name,
  ].map(normalizeText).filter(Boolean).join(' ')
  if (!text) return false

  const coveredBuildingIds = new Set(existingBuildings)
  const coveredFloorIds = new Set(existingFloors)
  const reasons: string[] = []

  const buildingRows = await listActiveEngineeringObjects(params.projectId, 'building')
  const explicitBuildingRange = inferNumberRange(text, '楼|栋')
  const explicitBuildings = pickExplicitRangeObjects(buildingRows, explicitBuildingRange)
  if (explicitBuildings.length > 1) {
    explicitBuildings.forEach((row) => row.id && coveredBuildingIds.add(row.id))
    reasons.push(`matched_building_range:${explicitBuildingRange.join('-')}`)
  } else if (!normalizeId(params.merged.building_object_id) && hasAnyOverallPattern(text, OVERALL_BUILDING_PATTERNS) && buildingRows.length > 1) {
    buildingRows.forEach((row) => row.id && coveredBuildingIds.add(row.id))
    reasons.push('matched_overall_building_scope')
  }

  const floorRows = await listActiveEngineeringObjects(params.projectId, 'floor')
  const explicitFloorRange = inferNumberRange(text, 'f|F|层|楼层')
  const explicitFloors = pickExplicitRangeObjects(floorRows, explicitFloorRange)
  if (explicitFloors.length > 1) {
    explicitFloors.forEach((row) => row.id && coveredFloorIds.add(row.id))
    reasons.push(`matched_floor_range:${explicitFloorRange.join('-')}`)
  } else if (hasAnyOverallPattern(text, OVERALL_FLOOR_PATTERNS) && floorRows.length > 1) {
    const buildingId = normalizeId(params.merged.building_object_id)
    const scopedFloors = buildingId
      ? floorRows.filter((row) => normalizeId(row.parent_id) === buildingId)
      : floorRows
    if (scopedFloors.length > 1) {
      scopedFloors.forEach((row) => row.id && coveredFloorIds.add(row.id))
      reasons.push(buildingId ? 'matched_building_all_floors' : 'matched_overall_floor_scope')
    }
  }

  if (coveredBuildingIds.size <= 1 && coveredFloorIds.size <= 1) return false

  writeMetadata(params.payload, {
    ...metadata,
    scopeCoverageMode: 'package',
    coveredBuildingIds: Array.from(coveredBuildingIds),
    coveredFloorIds: Array.from(coveredFloorIds),
    backendScopeInference: {
      source: 'engineering_object_title_rule',
      confidence: 'medium',
      reasons,
      inferredAt: new Date().toISOString(),
    },
  })

  return true
}

async function loadParentTask(projectId: string, parentId?: unknown) {
  const normalizedParentId = normalizeId(parentId)
  if (!normalizedParentId) return null

  const { data, error } = await (supabase as any)
    .from('tasks')
    .select('id, title, standard_work_code, standard_work_name, engineering_category_id, engineering_category_name, engineering_category_type, wbs_node_type')
    .eq('id', normalizedParentId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    logger.warn('[taskStandardInferenceService] failed to load parent task for standard inference', {
      projectId,
      parentId: normalizedParentId,
      error,
    })
    return null
  }

  return data as Partial<Task> | null
}

export async function applyTaskStandardInferenceForWrite(params: {
  projectId: string
  payload: TaskWritePayload
  existingTask?: Partial<Task> | null
}): Promise<TaskStandardInferenceResult> {
  const projectId = normalizeId(params.projectId)
  if (!projectId) return { standardMapped: false, scopeCoverageMapped: false }

  try {
    const merged = mergeExistingAndPatch(params.existingTask, params.payload)
    const parentTask = await loadParentTask(projectId, merged.parent_id)
    const standardMapped = await inferStandardMapping({
      projectId,
      payload: params.payload,
      merged,
      parentTask,
    })
    const mergedAfterStandard = mergeExistingAndPatch(params.existingTask, params.payload)
    const scopeCoverageMapped = await inferScopeCoverage({
      projectId,
      payload: params.payload,
      merged: mergedAfterStandard,
    })
    return { standardMapped, scopeCoverageMapped }
  } catch (error) {
    logger.warn('[taskStandardInferenceService] task standard inference skipped', {
      projectId,
      error,
    })
    return { standardMapped: false, scopeCoverageMapped: false }
  }
}
