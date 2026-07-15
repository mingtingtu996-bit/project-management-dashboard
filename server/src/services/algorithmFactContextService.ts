import { readProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'

export type AlgorithmFactContextPhase =
  | 'plan_creation'
  | 'baseline_generation'
  | 'new_task_reference'
  | 'monthly_plan'
  | 'duration_context'
  | 'runtime_forecast'
  | 'runtime_delay_recovery'

export type RuntimeExecutionFacts = {
  factVersion?: 'v1.4.22.1-runtime-execution-facts' | string
  progressCompletionRatio?: number | null
  inProgressTaskCount?: number | null
  blockedTaskCount?: number | null
  hardBlockerCount?: number | null
  resourcePressureScore?: number | null
  parallelDensityRatio?: number | null
  milestonePressureScore?: number | null
  forecastDelayDays?: number | null
  baselineDeviationDays?: number | null
  criticalOrNearCriticalTaskCount?: number | null
  floatingTaskCount?: number | null
  scheduleState?: string | null
  localAccelerationFactor?: number | null
  evidenceCodes?: string[]
  evidenceObjects?: RuntimeExecutionEvidenceObject[]
  runtimeInferenceSummary?: RuntimeExecutionInferenceSummary
}

export type RuntimeExecutionEvidenceStrength = 'direct' | 'derived' | 'inferred' | 'low_confidence'

export type RuntimeExecutionEvidenceContribution = {
  code: string
  label: string
  weight: number
  value?: number | string | boolean | null
  sourceType?: string
}

export type RuntimeExecutionEvidenceObject = {
  code: string
  factType: 'direct' | 'derived' | 'inferred'
  strength: RuntimeExecutionEvidenceStrength
  sourceType: string
  sourceIds: string[]
  scope: {
    type: string
    id: string
  }
  windowDays: number
  confidence: number
  value?: number | string | boolean | null
  contributions: RuntimeExecutionEvidenceContribution[]
  boundaryPolicy: string[]
}

export type RuntimeExecutionInferenceSummary = {
  factType: 'inferred'
  sourcePolicy: 'existing_execution_state_only'
  confidence: number
  readinessStatus: 'commercial_ready' | 'advisory_only' | 'low_confidence'
  impactBoundary: 'runtime_adjustment_allowed' | 'candidate_only' | 'confidence_only'
  sourceWindowDays: number
  inferredSignalCodes: string[]
}

export type RuntimeFactInputStrength =
  | 'none'
  | 'direct_runtime_fact'
  | 'controlled_runtime_inference'
  | 'advisory_runtime_inference'
  | 'low_confidence_runtime_inference'

export type AlgorithmFactScheduleContext = {
  scenario?: 'baseline_target_alignment' | 'runtime_delay_recovery' | string
  projectTypeCodes?: string[]
  methodVariantCodes?: string[]
  climateSignals?: string[]
  weatherImpactBands?: string[]
  runtime?: RuntimeExecutionFacts | null
}

export type AlgorithmFactContextRow = {
  values?: Record<string, unknown>
}

export type AlgorithmFactContext = {
  phase: AlgorithmFactContextPhase
  primaryLayer: 'projectGenerationFacts' | 'runtimeExecutionFacts'
  weights: {
    projectGenerationFacts: number
    runtimeExecutionFacts: number
  }
  projectGenerationFacts: Record<string, unknown>
  runtimeExecutionFacts: RuntimeExecutionFacts | null
  runtimeFactInputStrength: RuntimeFactInputStrength
  scheduleAccelerationContext: AlgorithmFactScheduleContext
  boundaryPolicy: string[]
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readOptionalNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  const parsed = parseMaybeJson(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  const parsed = parseMaybeJson(value)
  return Array.isArray(parsed) ? parsed : []
}

function uniqueStringArray(values: string[]) {
  return [...new Set(values.map((item) => normalizeText(item)).filter(Boolean))]
}

function readRowMetadata(row: AlgorithmFactContextRow) {
  const values = readRecord(row.values)
  return readRecord(values.standard_task_metadata ?? values.metadata)
}

function readRowsProjectGenerationFacts(rows: AlgorithmFactContextRow[]) {
  for (const row of rows) {
    const facts = readProjectGenerationFactsSnapshot(readRowMetadata(row))
    if (Object.keys(facts).length > 0) return facts as Record<string, unknown>
  }
  return {}
}

function normalizeRuntimeExecutionFacts(input?: RuntimeExecutionFacts | null): RuntimeExecutionFacts | null {
  if (!input) return null
  const normalized: RuntimeExecutionFacts = {
    factVersion: input.factVersion ?? 'v1.4.22.1-runtime-execution-facts',
  }
  const numberKeys: Array<keyof RuntimeExecutionFacts> = [
    'progressCompletionRatio',
    'inProgressTaskCount',
    'blockedTaskCount',
    'hardBlockerCount',
    'resourcePressureScore',
    'parallelDensityRatio',
    'milestonePressureScore',
    'forecastDelayDays',
    'baselineDeviationDays',
    'criticalOrNearCriticalTaskCount',
    'floatingTaskCount',
    'localAccelerationFactor',
  ]
  for (const key of numberKeys) {
    const value = readOptionalNumber(input[key])
    if (value !== null) {
      ;(normalized as Record<string, unknown>)[key] = value
    }
  }
  const scheduleState = normalizeText(input.scheduleState)
  if (scheduleState) normalized.scheduleState = scheduleState
  const evidenceCodes = uniqueStringArray(readArray(input.evidenceCodes).map((item) => normalizeText(item)))
  if (evidenceCodes.length > 0) normalized.evidenceCodes = evidenceCodes
  const evidenceObjects = readArray(input.evidenceObjects).filter((item): item is RuntimeExecutionEvidenceObject => (
    Boolean(item && typeof item === 'object' && !Array.isArray(item))
  ))
  if (evidenceObjects.length > 0) normalized.evidenceObjects = evidenceObjects
  if (input.runtimeInferenceSummary && typeof input.runtimeInferenceSummary === 'object') {
    normalized.runtimeInferenceSummary = input.runtimeInferenceSummary
  }
  return Object.keys(normalized).length > 1 ? normalized : null
}

function runtimeFactsCanDrivePrimary(strength: RuntimeFactInputStrength) {
  return strength === 'direct_runtime_fact' || strength === 'controlled_runtime_inference'
}

function resolveRuntimeFactInputStrength(runtimeExecutionFacts: RuntimeExecutionFacts | null): RuntimeFactInputStrength {
  if (!runtimeExecutionFacts) return 'none'
  const summary = runtimeExecutionFacts.runtimeInferenceSummary
  if (!summary) return 'direct_runtime_fact'
  if (summary.readinessStatus === 'commercial_ready' && summary.impactBoundary === 'runtime_adjustment_allowed') {
    return 'controlled_runtime_inference'
  }
  if (summary.readinessStatus === 'low_confidence') return 'low_confidence_runtime_inference'
  return 'advisory_runtime_inference'
}

function resolveWeights(phase: AlgorithmFactContextPhase, runtimeFactInputStrength: RuntimeFactInputStrength) {
  const hasRuntimeFacts = runtimeFactInputStrength !== 'none'
  const runtimeCanDrivePrimary = runtimeFactsCanDrivePrimary(runtimeFactInputStrength)
  if (hasRuntimeFacts && !runtimeCanDrivePrimary) {
    return runtimeFactInputStrength === 'low_confidence_runtime_inference'
      ? { projectGenerationFacts: 0.85, runtimeExecutionFacts: 0.15 }
      : { projectGenerationFacts: 0.65, runtimeExecutionFacts: 0.35 }
  }
  if (phase === 'runtime_forecast' || phase === 'runtime_delay_recovery') {
    return { projectGenerationFacts: 0.25, runtimeExecutionFacts: 0.75 }
  }
  if (phase === 'duration_context') {
    return { projectGenerationFacts: 0.3, runtimeExecutionFacts: 0.7 }
  }
  if (phase === 'monthly_plan') {
    return hasRuntimeFacts
      ? { projectGenerationFacts: 0.4, runtimeExecutionFacts: 0.6 }
      : { projectGenerationFacts: 0.7, runtimeExecutionFacts: 0.3 }
  }
  if (phase === 'new_task_reference') {
    return hasRuntimeFacts
      ? { projectGenerationFacts: 0.65, runtimeExecutionFacts: 0.35 }
      : { projectGenerationFacts: 1, runtimeExecutionFacts: 0 }
  }
  return { projectGenerationFacts: 1, runtimeExecutionFacts: 0 }
}

function isRuntimePrimary(phase: AlgorithmFactContextPhase, runtimeFactInputStrength: RuntimeFactInputStrength) {
  if (!runtimeFactsCanDrivePrimary(runtimeFactInputStrength)) return false
  return phase === 'monthly_plan'
    || phase === 'duration_context'
    || phase === 'runtime_forecast'
    || phase === 'runtime_delay_recovery'
}

export function buildAlgorithmFactContext(params: {
  phase: AlgorithmFactContextPhase
  rows?: AlgorithmFactContextRow[]
  projectGenerationFacts?: Record<string, unknown> | null
  runtimeExecutionFacts?: RuntimeExecutionFacts | null
  context?: AlgorithmFactScheduleContext
}): AlgorithmFactContext {
  const runtimeExecutionFacts = normalizeRuntimeExecutionFacts(params.runtimeExecutionFacts ?? params.context?.runtime ?? null)
  const runtimeFactInputStrength = resolveRuntimeFactInputStrength(runtimeExecutionFacts)
  const weights = resolveWeights(params.phase, runtimeFactInputStrength)
  const projectGenerationFacts = {
    ...readRowsProjectGenerationFacts(params.rows ?? []),
    ...(params.projectGenerationFacts ?? {}),
  }
  const primaryLayer = isRuntimePrimary(params.phase, runtimeFactInputStrength)
    ? 'runtimeExecutionFacts'
    : 'projectGenerationFacts'

  return {
    phase: params.phase,
    primaryLayer,
    weights,
    projectGenerationFacts,
    runtimeExecutionFacts,
    runtimeFactInputStrength,
    scheduleAccelerationContext: {
      ...params.context,
      scenario: primaryLayer === 'runtimeExecutionFacts' ? 'runtime_delay_recovery' : params.context?.scenario,
      runtime: runtimeExecutionFacts ?? params.context?.runtime,
    },
    boundaryPolicy: [
      'project_generation_facts_describe_project_static_identity',
      'runtime_execution_facts_describe_current_execution_state',
      primaryLayer === 'runtimeExecutionFacts'
        ? 'runtime_execution_facts_override_static_facts_for_forecast_recovery_context_and_monthly_commitment'
        : 'project_generation_facts_dominate_plan_creation_and_baseline_seed_context',
      runtimeFactInputStrength === 'controlled_runtime_inference'
        ? 'runtime_execution_inference_commercial_ready_may_drive_runtime_adjustment'
        : runtimeFactInputStrength === 'direct_runtime_fact'
          ? 'direct_runtime_facts_may_drive_runtime_forecast_context'
          : runtimeFactInputStrength === 'advisory_runtime_inference' || runtimeFactInputStrength === 'low_confidence_runtime_inference'
            ? 'runtime_execution_inference_confidence_only_cannot_override_static_project_facts'
            : 'runtime_execution_facts_absent',
      'project_generation_facts_bound_template_and_reference_duration_scale',
    ],
  }
}

export function summarizeAlgorithmFactContext(context: AlgorithmFactContext) {
  const projectGenerationFactKeys = Object.keys(context.projectGenerationFacts).sort()
  const runtimeExecutionFactKeys = context.runtimeExecutionFacts
    ? Object.keys(context.runtimeExecutionFacts).sort()
    : []
  return {
    phase: context.phase,
    primaryLayer: context.primaryLayer,
    weights: context.weights,
    runtimeFactInputStrength: context.runtimeFactInputStrength,
    projectFactsRole: context.primaryLayer === 'projectGenerationFacts' ? 'primary' : 'background',
    runtimeFactsRole: context.primaryLayer === 'runtimeExecutionFacts' ? 'primary' : 'background',
    hasProjectGenerationFacts: projectGenerationFactKeys.length > 0,
    hasRuntimeExecutionFacts: Boolean(context.runtimeExecutionFacts),
    projectGenerationFactKeys,
    runtimeExecutionFactKeys,
    boundaryPolicy: context.boundaryPolicy,
  }
}
