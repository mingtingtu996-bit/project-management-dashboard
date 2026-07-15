import { apiGet, apiPost } from '@/lib/apiClient'

export type DurationConfidenceLevel = 'high' | 'medium' | 'low' | 'unavailable' | 'data_pending' | string
export type DurationDataMaturityLevel = 'L0' | 'L1' | 'L2' | string
export type DurationQuantitySource =
  | 'explicit_task_quantity'
  | 'task_saved_quantity'
  | 'engineering_object_proxy'
  | 'scope_proxy'
  | 'seed_default_quantity'
  | 'none'
  | string
export type DurationQuantityConfidence = 'high' | 'medium' | 'low' | 'unavailable' | string

export interface TaskDurationForecast {
  taskId?: string | null
  durationOutputCode?: string | null
  durationOutputSemanticFieldName?: string | null
  remainingForecastDays?: number | null
  conservativeDurationDays: number | null
  forecastFinishDate: string | null
  forecastDelayDays: number | null
  delayRiskIndex?: number | null
  confidenceLevel: DurationConfidenceLevel | null
  confidenceScore: number | null
  forecastSource: string | null
  durationCalibrationSource?: string | null
  durationProvenance?: string | null
  businessReason: string | null
  businessReasonCode?: string | null
  businessReasonCodes?: string[] | null
  businessReasonParams?: Record<string, unknown> | null
  displaySummary?: string | null
  durationBoundaryRole?: string | null
  parentDurationBoundaryPolicy?: string | null
  nonAdditiveWithParentDuration?: boolean | null
  parentReferenceDurationDays?: number | null
  parentTaskTitle?: string | null
  independentReferenceDurationDays?: number | null
  packageChildPlanDurationDays?: number | null
  packageChildRhythmWindowStartDay?: number | null
  packageChildRhythmWindowEndDay?: number | null
  packageChildRhythmWindowRole?: string | null
  planDurationTruthSource?: string | null
  dataMaturity?: DurationDataMaturityLevel | null
  quantitySource?: DurationQuantitySource | null
  quantityConfidence?: DurationQuantityConfidence | null
  topFactors?: string[] | null
  businessFactorBadges?: Array<{
    type: string
    label: string
    severity: 'low' | 'medium' | 'high' | string
  }> | null
}

function normalizeTaskDurationForecast(raw: any): TaskDurationForecast {
  const remainingForecastDays = raw?.remainingForecastDays ?? null
  const durationOutputCode = raw?.durationOutputCode ?? null
  const normalizedOutputCode = String(durationOutputCode ?? '').trim()
  const semanticReferenceDays = normalizedOutputCode === 'remaining_forecast'
    ? remainingForecastDays
    : null
  return {
    taskId: raw?.taskId ?? null,
    durationOutputCode,
    durationOutputSemanticFieldName: raw?.durationOutputSemanticFieldName ?? null,
    remainingForecastDays,
    conservativeDurationDays: semanticReferenceDays == null ? null : raw?.conservativeDurationDays ?? null,
    forecastFinishDate: raw?.forecastFinishDate ?? null,
    forecastDelayDays: raw?.forecastDelayDays ?? null,
    delayRiskIndex: raw?.delayRiskIndex ?? null,
    confidenceLevel: raw?.confidenceLevel ?? null,
    confidenceScore: raw?.confidenceScore ?? null,
    forecastSource: raw?.forecastSource ?? null,
    businessReason: raw?.businessReason ?? null,
    businessReasonCode: raw?.businessReasonCode ?? null,
    businessReasonCodes: raw?.businessReasonCodes ?? null,
    businessReasonParams: raw?.businessReasonParams ?? null,
    displaySummary: raw?.displaySummary ?? null,
    durationBoundaryRole: raw?.durationBoundaryRole ?? null,
    parentDurationBoundaryPolicy: raw?.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: raw?.nonAdditiveWithParentDuration ?? null,
    parentReferenceDurationDays: raw?.parentReferenceDurationDays ?? null,
    parentTaskTitle: raw?.parentTaskTitle ?? null,
    independentReferenceDurationDays: raw?.independentReferenceDurationDays ?? raw?.businessReasonParams?.independentReferenceDurationDays ?? null,
    packageChildPlanDurationDays: raw?.packageChildPlanDurationDays ?? raw?.businessReasonParams?.packageChildPlanDurationDays ?? null,
    packageChildRhythmWindowStartDay: raw?.packageChildRhythmWindowStartDay ?? raw?.businessReasonParams?.rhythmWindowStartDay ?? null,
    packageChildRhythmWindowEndDay: raw?.packageChildRhythmWindowEndDay ?? raw?.businessReasonParams?.rhythmWindowEndDay ?? null,
    packageChildRhythmWindowRole: raw?.packageChildRhythmWindowRole ?? raw?.businessReasonParams?.rhythmWindowRole ?? null,
    planDurationTruthSource: raw?.planDurationTruthSource ?? raw?.businessReasonParams?.planDurationTruthSource ?? null,
    dataMaturity: raw?.dataMaturity ?? null,
    quantitySource: raw?.quantitySource ?? null,
    quantityConfidence: raw?.quantityConfidence ?? null,
    topFactors: raw?.topFactors ?? null,
    businessFactorBadges: raw?.businessFactorBadges ?? null,
  }
}

export interface DurationSuggestion {
  durationOutputCode?: string | null
  durationOutputSemanticFieldName?: string | null
  planReferenceDays?: number | null
  contextualReferenceDays?: number | null
  remainingForecastDays?: number | null
  riskP20DurationDays?: number | null
  riskP50DurationDays?: number | null
  riskP80DurationDays?: number | null
  durationRiskRange?: {
    source?: string | null
    evidenceLevel?: string | null
    p20Days?: number | null
    p50Days?: number | null
    p80Days?: number | null
    p20_days?: number | null
    p50_days?: number | null
    p80_days?: number | null
    uncertaintyBandDays?: number | null
    mutationBoundary?: string | null
    mutation_boundary?: string | null
    [key: string]: unknown
  } | null
  conservativeDurationDays: number | null
  confidenceLevel: DurationConfidenceLevel | null
  confidenceScore: number | null
  confidence?: number | null
  forecastSource: string | null
  durationCalibrationSource?: string | null
  durationProvenance?: string | null
  businessReason: string | null
  businessReasonCode?: string | null
  businessReasonCodes?: string[] | null
  businessReasonParams?: Record<string, unknown> | null
  displaySummary?: string | null
  durationBoundaryRole?: string | null
  parentDurationBoundaryPolicy?: string | null
  nonAdditiveWithParentDuration?: boolean | null
  parentReferenceDurationDays?: number | null
  parentTaskTitle?: string | null
  independentReferenceDurationDays?: number | null
  packageChildPlanDurationDays?: number | null
  packageChildRhythmWindowStartDay?: number | null
  packageChildRhythmWindowEndDay?: number | null
  packageChildRhythmWindowRole?: string | null
  planDurationTruthSource?: string | null
  sampleSize?: number | null
  sourceBreakdown?: Record<string, unknown> | null
  dataMaturity?: DurationDataMaturityLevel | null
  dataMaturityReasons?: string[] | null
  dataUpgradePath?: string[] | null
  dataUpgradeBlockedBy?: string[] | null
  factorAvailability?: Record<string, boolean> | null
  quantitySource?: DurationQuantitySource | null
  quantityConfidence?: DurationQuantityConfidence | null
}

export interface DurationSuggestionQuery {
  suggestionPurpose?: 'new_task_reference' | 'execution_reference' | 'monthly_commitment_window' | string | null
  taskId?: string | null
  templateNodeId?: string | null
  wbsNodeType?: string | null
  projectId?: string | null
  engineeringCategoryId?: string | null
  standardWorkCode?: string | null
  standardWorkName?: string | null
  taskTitle?: string | null
  engineeringObjectId?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  currentProgress?: number | string | null
  targetProgress?: number | string | null
  buildingObjectId?: string | null
  floorObjectId?: string | null
  zoneObjectId?: string | null
  coveredBuildingIds?: string[] | null
  coveredFloorIds?: string[] | null
  taskQuantity?: number | string | null
  taskQuantityUnit?: string | null
  defaultQuantity?: number | string | null
  defaultQuantityUnit?: string | null
  childTaskCount?: number | string | null
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  methodVariantCodes?: string[] | null
  methodVariantSource?: string | null
  elementVariantCodes?: string[] | null
  elementVariantSource?: string | null
  responsibleUnitId?: string | null
  acceptanceRequired?: boolean | null
  materialRequired?: boolean | null
  parentStandardWorkCode?: string | null
  parentTaskTitle?: string | null
  parentDurationBoundaryPolicy?: string | null
  parentDurationPolicySource?: string | null
  parentReferenceDurationDays?: number | string | null
}

function normalizeDurationSuggestion(raw: any): DurationSuggestion {
  const durationOutputCode = raw?.durationOutputCode ?? null
  const planReferenceDays = raw?.planReferenceDays ?? null
  const contextualReferenceDays = raw?.contextualReferenceDays ?? null
  const remainingForecastDays = raw?.remainingForecastDays ?? null
  return {
    durationOutputCode,
    durationOutputSemanticFieldName: raw?.durationOutputSemanticFieldName ?? null,
    planReferenceDays,
    contextualReferenceDays,
    remainingForecastDays,
    riskP20DurationDays: raw?.riskP20DurationDays ?? raw?.risk_p20_duration_days ?? null,
    riskP50DurationDays: raw?.riskP50DurationDays ?? raw?.risk_p50_duration_days ?? null,
    riskP80DurationDays: raw?.riskP80DurationDays ?? raw?.risk_p80_duration_days ?? null,
    durationRiskRange: raw?.durationRiskRange ?? raw?.duration_risk_range ?? null,
    conservativeDurationDays: raw?.conservativeDurationDays ?? null,
    confidenceLevel: raw?.confidenceLevel ?? null,
    confidenceScore: raw?.confidenceScore ?? raw?.confidence ?? null,
    confidence: raw?.confidence ?? raw?.confidenceScore ?? null,
    forecastSource: raw?.forecastSource ?? null,
    durationCalibrationSource: raw?.durationCalibrationSource ?? null,
    durationProvenance: raw?.durationProvenance ?? null,
    businessReason: raw?.businessReason ?? null,
    businessReasonCode: raw?.businessReasonCode ?? null,
    businessReasonCodes: raw?.businessReasonCodes ?? null,
    businessReasonParams: raw?.businessReasonParams ?? null,
    displaySummary: raw?.displaySummary ?? null,
    durationBoundaryRole: raw?.durationBoundaryRole ?? null,
    parentDurationBoundaryPolicy: raw?.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: raw?.nonAdditiveWithParentDuration ?? null,
    parentReferenceDurationDays: raw?.parentReferenceDurationDays ?? null,
    parentTaskTitle: raw?.parentTaskTitle ?? null,
    independentReferenceDurationDays: raw?.independentReferenceDurationDays ?? raw?.businessReasonParams?.independentReferenceDurationDays ?? null,
    packageChildPlanDurationDays: raw?.packageChildPlanDurationDays ?? raw?.businessReasonParams?.packageChildPlanDurationDays ?? null,
    packageChildRhythmWindowStartDay: raw?.packageChildRhythmWindowStartDay ?? raw?.businessReasonParams?.rhythmWindowStartDay ?? null,
    packageChildRhythmWindowEndDay: raw?.packageChildRhythmWindowEndDay ?? raw?.businessReasonParams?.rhythmWindowEndDay ?? null,
    packageChildRhythmWindowRole: raw?.packageChildRhythmWindowRole ?? raw?.businessReasonParams?.rhythmWindowRole ?? null,
    planDurationTruthSource: raw?.planDurationTruthSource ?? raw?.businessReasonParams?.planDurationTruthSource ?? null,
    sampleSize: raw?.sampleSize ?? null,
    sourceBreakdown: raw?.sourceBreakdown ?? null,
    dataMaturity: raw?.dataMaturity ?? null,
    dataMaturityReasons: raw?.dataMaturityReasons ?? null,
    dataUpgradePath: raw?.dataUpgradePath ?? null,
    dataUpgradeBlockedBy: raw?.dataUpgradeBlockedBy ?? null,
    factorAvailability: raw?.factorAvailability ?? null,
    quantitySource: raw?.quantitySource ?? null,
    quantityConfidence: raw?.quantityConfidence ?? null,
  }
}

export async function getTaskDurationForecast(taskId: string, options?: RequestInit) {
  const raw = await apiGet<any>(
    `/api/duration-suggestions/tasks/${encodeURIComponent(taskId)}/duration-forecast`,
    options,
  )
  return normalizeTaskDurationForecast(raw)
}

export async function getTaskDurationForecasts(taskIds: string[], options?: RequestInit) {
  const uniqueTaskIds = [...new Set(taskIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (uniqueTaskIds.length === 0) return []
  const raw = await apiPost<any[]>('/api/duration-suggestions/batch', { task_ids: uniqueTaskIds }, options)
  return raw.map(normalizeTaskDurationForecast)
}

export async function getCurrentTaskDurationForecasts(taskIds: string[], options?: RequestInit) {
  const uniqueTaskIds = [...new Set(taskIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (uniqueTaskIds.length === 0) return []
  const raw = await apiPost<any[]>('/api/duration-suggestions/current-batch', { task_ids: uniqueTaskIds }, options)
  return raw.map(normalizeTaskDurationForecast)
}

export async function getDurationSuggestion(query: DurationSuggestionQuery, options?: RequestInit) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === '') return
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','))
      return
    }
    params.set(key, String(value))
  })

  const raw = await apiGet<any>(`/api/duration-suggestions${params.toString() ? `?${params.toString()}` : ''}`, options)
  return normalizeDurationSuggestion(raw)
}
