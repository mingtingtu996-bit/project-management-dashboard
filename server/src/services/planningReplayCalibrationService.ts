import {
  evaluateAlgorithmAssetReplay,
  type AlgorithmAssetReplayEvaluation,
  type AlgorithmAssetReplaySample,
} from './algorithmAssetReplayService.js'
import {
  persistAlgorithmAssetReplayEvaluation,
  type AlgorithmAssetGovernanceQueryExec,
} from './algorithmAssetGovernancePersistenceService.js'
import { query as rawQuery } from '../database.js'

export type PlanningReplaySurface =
  | 'baseline_generation'
  | 'monthly_plan_generation'

export type PlanningReplayCalibrationSample = {
  sampleId: string
  companyId?: string | null
  projectId?: string | null
  surface: PlanningReplaySurface
  standardWorkCode?: string | null
  standardWorkName?: string | null
  engineeringCategoryId?: string | null
  originalPrediction: number
  actual: number
  replayPrediction: number
  projectType?: string | null
  buildingPatternCode?: string | null
  climateZone?: string | null
  buildingId?: string | null
  floorId?: string | null
  zoneId?: string | null
}

export type PlanningReplayCalibrationRejectedReason =
  | 'missing_coarse_process_identity'

export type PlanningReplayCalibrationRejectedSample = {
  sampleId: string
  reason: PlanningReplayCalibrationRejectedReason
}

export type PlanningReplayCalibrationTarget =
  | 'e1_duration_adjustment'
  | 'e2_residual_correction'
  | 'seed_weight_adjustment'
  | 'capacity_parameter_adjustment'
  | 'priority_weight_adjustment'
  | 'e2_target_discount_adjustment'

export type PlanningReplayCalibrationSuggestion = {
  calibrationKey: string
  target: PlanningReplayCalibrationTarget
  direction: 'increase' | 'decrease' | 'hold'
  magnitudeDays: number
  writePolicy: 'candidate_overlay_only_no_fact_mutation'
  inputSurfaces: PlanningReplaySurface[]
  basis: {
    acceptedSampleCount: number
    originalMae: number | null
    replayMae: number | null
    maeImprovement: number | null
    biasDays: number
  }
}

export type PlanningReplayCalibrationGroup = {
  coarseProcessKey: string
  standardWorkCode?: string
  standardWorkName?: string
  engineeringCategoryId?: string
  sourceSurfaces: PlanningReplaySurface[]
  sampleIds: string[]
  acceptedSampleCount: number
  sampleGate: 'passed' | 'blocked'
  calibrationScope: {
    level: 'coarse_process'
    deferredFineSplits: Array<'project_type' | 'building_pattern' | 'climate_zone' | 'building' | 'floor' | 'zone'>
  }
  replay: AlgorithmAssetReplayEvaluation
  suggestions: PlanningReplayCalibrationSuggestion[]
}

export type PlanningReplayCalibrationMutationPolicy = {
  writesRuntimeDirectly: false
  writesFactsDirectly: false
  writesSeedsDirectly: false
  forbiddenWriteTargets: string[]
}

export type PlanningReplayCalibrationReport = {
  status: 'planning_replay_calibration_ready' | 'planning_replay_calibration_needs_more_samples'
  policy: {
    calibrationLoop: 'shared_baseline_and_monthly_plan'
    writePolicy: 'candidate_overlay_only_no_fact_mutation'
    groupingPolicy: 'coarse_process_first_no_project_type_building_climate_split_until_sample_depth'
  }
  consumerCoverage: {
    unifiedMachine: true
    servedSurfaces: PlanningReplaySurface[]
    baselineSampleCount: number
    monthlyPlanSampleCount: number
  }
  mutationPolicy: PlanningReplayCalibrationMutationPolicy
  groups: PlanningReplayCalibrationGroup[]
  rejectedSamples: PlanningReplayCalibrationRejectedSample[]
}

export type PlanningReplayCalibrationInput = {
  companyId?: string | null
  projectId?: string | null
  samples: PlanningReplayCalibrationSample[]
  minAcceptedSamplesPerProcess?: number
  maxOvercompensationRate?: number
  minMaeImprovement?: number
  rollbackTarget?: string | null
  conflictFree?: boolean
}

export type PlanningReplayCalibrationPersistenceResult = {
  persistedGroupCount: number
  persistedReplayResultCount: number
  failedGroupCount: number
  failures: Array<{
    coarseProcessKey: string
    error: string
  }>
}

export type PlanningReplayCalibrationReadbackRejectedReason =
  | 'source_mismatch'
  | 'result_not_passed'
  | 'payload_policy_mismatch'
  | 'sample_gate_not_met'
  | 'mae_not_improved'
  | 'overcompensation_guardrail_exceeded'
  | 'coarse_process_mismatch'

export type PlanningReplayCalibrationReadback = {
  status: 'ready' | 'unavailable'
  coarseProcessKey: string | null
  evidenceRefs: string[]
  writePolicy: 'candidate_overlay_only_no_fact_mutation'
  acceptedSampleCount: number
  originalMae: number | null
  replayMae: number | null
  maeImprovement: number | null
  overcompensationRate: number | null
  e1DurationAdjustmentDays: number | null
  e2ResidualCorrectionDays: number | null
  capacityBudgetFactor: number | null
  priorityWeightAdjustment: number | null
  e2TargetDiscountFactor: number | null
  rejectedEvidence: Array<{
    candidateEventId: string | null
    replayRunId: string | null
    reason: PlanningReplayCalibrationReadbackRejectedReason
  }>
}

export type PlanningReplayCalibrationReadbackInput = {
  projectId?: string | null
  standardWorkCode?: string | null
  standardWorkName?: string | null
  engineeringCategoryId?: string | null
  minAcceptedSamples?: number
  maxOvercompensationRate?: number
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

const BASELINE_TARGETS: PlanningReplayCalibrationTarget[] = [
  'e1_duration_adjustment',
  'e2_residual_correction',
  'seed_weight_adjustment',
]

const MONTHLY_PLAN_TARGETS: PlanningReplayCalibrationTarget[] = [
  'capacity_parameter_adjustment',
  'priority_weight_adjustment',
  'e2_target_discount_adjustment',
]

const SURFACE_ORDER: PlanningReplaySurface[] = ['baseline_generation', 'monthly_plan_generation']

const MUTATION_POLICY: PlanningReplayCalibrationMutationPolicy = {
  writesRuntimeDirectly: false,
  writesFactsDirectly: false,
  writesSeedsDirectly: false,
  forbiddenWriteTargets: [
    'task_baselines',
    'monthly_plans',
    'monthly_plan_items',
    'tasks',
    'task_dependencies',
    'critical_path_snapshots',
    'actual_duration_outcomes',
    'progress_snapshots',
    'algorithm_seed_records',
    'algorithm_seed_versions',
    'algorithm_seed_overrides',
    'duration_forecast_residual_overlays',
  ],
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function buildReadbackIdentity(input: PlanningReplayCalibrationReadbackInput) {
  const standardWorkCode = normalizeText(input.standardWorkCode)
  if (standardWorkCode) return `standard_work:${standardWorkCode}`
  const standardWorkName = normalizeText(input.standardWorkName)
  if (standardWorkName) return `standard_work_name:${standardWorkName.toLowerCase()}`
  const engineeringCategoryId = normalizeText(input.engineeringCategoryId)
  if (engineeringCategoryId) return `engineering_category:${engineeringCategoryId}`
  return null
}

function emptyReadback(
  coarseProcessKey: string | null,
  rejectedEvidence: PlanningReplayCalibrationReadback['rejectedEvidence'] = [],
): PlanningReplayCalibrationReadback {
  return {
    status: 'unavailable',
    coarseProcessKey,
    evidenceRefs: [],
    writePolicy: 'candidate_overlay_only_no_fact_mutation',
    acceptedSampleCount: 0,
    originalMae: null,
    replayMae: null,
    maeImprovement: null,
    overcompensationRate: null,
    e1DurationAdjustmentDays: null,
    e2ResidualCorrectionDays: null,
    capacityBudgetFactor: null,
    priorityWeightAdjustment: null,
    e2TargetDiscountFactor: null,
    rejectedEvidence,
  }
}

function uniqueOrderedSurfaces(samples: readonly PlanningReplayCalibrationSample[]) {
  const surfaceSet = new Set(samples.map((sample) => sample.surface))
  return SURFACE_ORDER.filter((surface) => surfaceSet.has(surface))
}

function coarseProcessIdentity(sample: PlanningReplayCalibrationSample) {
  const standardWorkCode = normalizeText(sample.standardWorkCode)
  if (standardWorkCode) {
    return {
      key: `standard_work:${standardWorkCode}`,
      standardWorkCode,
      standardWorkName: normalizeText(sample.standardWorkName) || undefined,
      engineeringCategoryId: normalizeText(sample.engineeringCategoryId) || undefined,
    }
  }

  const standardWorkName = normalizeText(sample.standardWorkName)
  if (standardWorkName) {
    return {
      key: `standard_work_name:${standardWorkName.toLowerCase()}`,
      standardWorkName,
      engineeringCategoryId: normalizeText(sample.engineeringCategoryId) || undefined,
    }
  }

  const engineeringCategoryId = normalizeText(sample.engineeringCategoryId)
  if (engineeringCategoryId) {
    return {
      key: `engineering_category:${engineeringCategoryId}`,
      engineeringCategoryId,
    }
  }

  return null
}

function replaySampleFor(sample: PlanningReplayCalibrationSample): AlgorithmAssetReplaySample {
  return {
    sampleId: sample.sampleId,
    companyId: sample.companyId,
    projectId: sample.projectId,
    originalPrediction: sample.originalPrediction,
    actual: sample.actual,
    overlayPrediction: sample.replayPrediction,
  }
}

function mean(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function commonScopeValue(values: ReadonlyArray<string | null | undefined>) {
  const normalized = Array.from(new Set(values.map(normalizeText).filter(Boolean)))
  return normalized.length === 1 ? normalized[0] : undefined
}

function directionForBias(biasDays: number): PlanningReplayCalibrationSuggestion['direction'] {
  if (Math.abs(biasDays) < 0.001) return 'hold'
  return biasDays > 0 ? 'increase' : 'decrease'
}

function suggestionTargetsFor(surfaces: readonly PlanningReplaySurface[]) {
  const targets = new Set<PlanningReplayCalibrationTarget>()
  if (surfaces.includes('baseline_generation')) {
    for (const target of BASELINE_TARGETS) targets.add(target)
  }
  if (surfaces.includes('monthly_plan_generation')) {
    for (const target of MONTHLY_PLAN_TARGETS) targets.add(target)
  }
  return [...targets]
}

function buildSuggestions(params: {
  coarseProcessKey: string
  surfaces: PlanningReplaySurface[]
  replay: AlgorithmAssetReplayEvaluation
  samples: PlanningReplayCalibrationSample[]
}): PlanningReplayCalibrationSuggestion[] {
  if (!params.replay.summary.replayPassed) return []

  const biasDays = mean(params.samples.map((sample) => sample.actual - sample.originalPrediction))
  const direction = directionForBias(biasDays)
  return suggestionTargetsFor(params.surfaces).map((target) => ({
    calibrationKey: `${params.coarseProcessKey}:${target}`,
    target,
    direction,
    magnitudeDays: Number(Math.abs(biasDays).toFixed(3)),
    writePolicy: 'candidate_overlay_only_no_fact_mutation',
    inputSurfaces: params.surfaces,
    basis: {
      acceptedSampleCount: params.replay.summary.acceptedSampleCount,
      originalMae: params.replay.summary.originalMae,
      replayMae: params.replay.summary.overlayMae,
      maeImprovement: params.replay.summary.maeImprovement,
      biasDays: Number(biasDays.toFixed(3)),
    },
  }))
}

function candidatePayloadFor(params: {
  coarseProcessKey: string
  standardWorkCode?: string
  standardWorkName?: string
  engineeringCategoryId?: string
  sourceSurfaces: PlanningReplaySurface[]
  minAcceptedSamples: number
}) {
  return {
    calibrationLoop: 'shared_baseline_and_monthly_plan',
    coarseProcessKey: params.coarseProcessKey,
    standardWorkCode: params.standardWorkCode ?? null,
    standardWorkName: params.standardWorkName ?? null,
    engineeringCategoryId: params.engineeringCategoryId ?? null,
    sourceSurfaces: params.sourceSurfaces,
    minAcceptedSamples: params.minAcceptedSamples,
    groupingPolicy: 'coarse_process_first_no_project_type_building_climate_split_until_sample_depth',
    writePolicy: 'candidate_overlay_only_no_fact_mutation',
    forbiddenWriteTargets: MUTATION_POLICY.forbiddenWriteTargets,
  }
}

function sortedGroups(groups: Map<string, PlanningReplayCalibrationSample[]>) {
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

export function evaluatePlanningReplayCalibration(
  input: PlanningReplayCalibrationInput,
): PlanningReplayCalibrationReport {
  const minAcceptedSamples = input.minAcceptedSamplesPerProcess ?? 5
  const groups = new Map<string, PlanningReplayCalibrationSample[]>()
  const groupIdentities = new Map<string, NonNullable<ReturnType<typeof coarseProcessIdentity>>>()
  const rejectedSamples: PlanningReplayCalibrationRejectedSample[] = []

  for (const sample of input.samples) {
    const identity = coarseProcessIdentity(sample)
    if (!identity) {
      rejectedSamples.push({ sampleId: sample.sampleId, reason: 'missing_coarse_process_identity' })
      continue
    }
    groupIdentities.set(identity.key, {
      ...groupIdentities.get(identity.key),
      ...identity,
    })
    const current = groups.get(identity.key) ?? []
    current.push(sample)
    groups.set(identity.key, current)
  }

  const evaluatedGroups = sortedGroups(groups).map(([coarseProcessKey, samples]): PlanningReplayCalibrationGroup => {
    const identity = groupIdentities.get(coarseProcessKey)
    const sourceSurfaces = uniqueOrderedSurfaces(samples)
    const companyId = normalizeText(input.companyId) || commonScopeValue(samples.map((sample) => sample.companyId))
    const projectId = normalizeText(input.projectId) || commonScopeValue(samples.map((sample) => sample.projectId))
    const replay = evaluateAlgorithmAssetReplay({
      candidate: {
        assetKey: `planning_replay_calibration:${coarseProcessKey}`,
        sourceSystem: 'planningReplayCalibrationService',
        assetType: 'calibration',
        companyId,
        projectId,
        candidatePayload: candidatePayloadFor({
          coarseProcessKey,
          standardWorkCode: identity?.standardWorkCode,
          standardWorkName: identity?.standardWorkName,
          engineeringCategoryId: identity?.engineeringCategoryId,
          sourceSurfaces,
          minAcceptedSamples,
        }),
        learningTarget: 'candidate_weight',
        learningMaturity: 'governed_candidate',
        publishAnchor: 'manual_governance_required',
        automationMaturity: 'auto_review_package',
        requestedRuntimeEffect: 'bounded_calibration',
      },
      samples: samples.map(replaySampleFor),
      minAcceptedSamples,
      maxOvercompensationRate: input.maxOvercompensationRate,
      minMaeImprovement: input.minMaeImprovement,
      rollbackTarget: input.rollbackTarget,
      conflictFree: input.conflictFree,
    })

    const sampleGate = replay.summary.acceptedSampleCount >= minAcceptedSamples ? 'passed' : 'blocked'
    if (sampleGate === 'blocked') {
      replay.candidateEvent.governanceDecision.reasons.push(
        'planning_replay_coarse_process_sample_gate_not_met',
      )
    }

    const suggestions = buildSuggestions({
      coarseProcessKey,
      surfaces: sourceSurfaces,
      replay,
      samples,
    })
    replay.candidateEvent.candidatePayload = {
      ...(replay.candidateEvent.candidatePayload as Record<string, unknown>),
      acceptedSampleCount: replay.summary.acceptedSampleCount,
      originalMae: replay.summary.originalMae,
      replayMae: replay.summary.overlayMae,
      maeImprovement: replay.summary.maeImprovement,
      overcompensationRate: replay.summary.overcompensationRate,
      sampleGate,
      calibrationTargets: suggestions.map((suggestion) => suggestion.target),
    }

    return {
      coarseProcessKey,
      standardWorkCode: identity?.standardWorkCode,
      standardWorkName: identity?.standardWorkName,
      engineeringCategoryId: identity?.engineeringCategoryId,
      sourceSurfaces,
      sampleIds: samples.map((sample) => sample.sampleId),
      acceptedSampleCount: replay.summary.acceptedSampleCount,
      sampleGate,
      calibrationScope: {
        level: 'coarse_process',
        deferredFineSplits: ['project_type', 'building_pattern', 'climate_zone', 'building', 'floor', 'zone'],
      },
      replay,
      suggestions,
    }
  })

  const servedSurfaces = uniqueOrderedSurfaces(input.samples)
  const hasReadyGroup = evaluatedGroups.some((group) => group.suggestions.length > 0)
  return {
    status: hasReadyGroup
      ? 'planning_replay_calibration_ready'
      : 'planning_replay_calibration_needs_more_samples',
    policy: {
      calibrationLoop: 'shared_baseline_and_monthly_plan',
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      groupingPolicy: 'coarse_process_first_no_project_type_building_climate_split_until_sample_depth',
    },
    consumerCoverage: {
      unifiedMachine: true,
      servedSurfaces,
      baselineSampleCount: input.samples.filter((sample) => sample.surface === 'baseline_generation').length,
      monthlyPlanSampleCount: input.samples.filter((sample) => sample.surface === 'monthly_plan_generation').length,
    },
    mutationPolicy: MUTATION_POLICY,
    groups: evaluatedGroups,
    rejectedSamples,
  }
}

export async function persistPlanningReplayCalibrationReport(params: {
  report: PlanningReplayCalibrationReport
  runKey: string
  queryExec?: AlgorithmAssetGovernanceQueryExec
}): Promise<PlanningReplayCalibrationPersistenceResult> {
  const result: PlanningReplayCalibrationPersistenceResult = {
    persistedGroupCount: 0,
    persistedReplayResultCount: 0,
    failedGroupCount: 0,
    failures: [],
  }

  for (const [index, group] of params.report.groups.entries()) {
    try {
      const persistence = await persistAlgorithmAssetReplayEvaluation({
        runKey: `${params.runKey}:${index + 1}:${group.coarseProcessKey}`,
        evaluation: group.replay,
        queryExec: params.queryExec,
      })
      result.persistedGroupCount += 1
      result.persistedReplayResultCount += persistence.replayResultCount
    } catch (error) {
      result.failedGroupCount += 1
      result.failures.push({
        coarseProcessKey: group.coarseProcessKey,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export async function readPlanningReplayCalibrationReadback(
  input: PlanningReplayCalibrationReadbackInput,
): Promise<PlanningReplayCalibrationReadback> {
  const coarseProcessKey = buildReadbackIdentity(input)
  if (!coarseProcessKey) return emptyReadback(null)

  const params = [normalizeText(input.projectId) || null, coarseProcessKey]
  const rows = input.queryExec
    ? await input.queryExec<{
      candidate_event_id?: string | null
      replay_run_id?: string | null
      asset_key?: string | null
      source_module?: string | null
      result_status?: string | null
      sample_count?: number | string | null
      replay_summary?: unknown
      candidate_payload?: unknown
      created_at?: string | null
    }>(`
      SELECT
        c.id AS candidate_event_id,
        r.id AS replay_run_id,
        r.asset_key,
        r.source_module,
        rr.result_status,
        r.sample_count,
        r.replay_summary,
        c.candidate_payload,
        r.created_at
      FROM public.algorithm_asset_replay_runs r
      JOIN public.algorithm_asset_candidate_events c ON c.id = (
        SELECT candidate_event_id
        FROM public.algorithm_asset_replay_results rr2
        WHERE rr2.replay_run_id = r.id
        ORDER BY rr2.created_at DESC
        LIMIT 1
      )
      LEFT JOIN public.algorithm_asset_replay_results rr ON rr.replay_run_id = r.id
      WHERE r.source_module = 'planningReplayCalibrationService'
        AND r.asset_key = ('planning_replay_calibration:' || $2)
        AND ($1::text IS NULL OR r.project_id::text = $1::text)
      ORDER BY r.created_at DESC
      LIMIT 20
    `, params)
    : (await rawQuery(`
      SELECT
        c.id AS candidate_event_id,
        r.id AS replay_run_id,
        r.asset_key,
        r.source_module,
        rr.result_status,
        r.sample_count,
        r.replay_summary,
        c.candidate_payload,
        r.created_at
      FROM public.algorithm_asset_replay_runs r
      JOIN public.algorithm_asset_candidate_events c ON c.id = (
        SELECT candidate_event_id
        FROM public.algorithm_asset_replay_results rr2
        WHERE rr2.replay_run_id = r.id
        ORDER BY rr2.created_at DESC
        LIMIT 1
      )
      LEFT JOIN public.algorithm_asset_replay_results rr ON rr.replay_run_id = r.id
      WHERE r.source_module = 'planningReplayCalibrationService'
        AND r.asset_key = ('planning_replay_calibration:' || $2)
        AND ($1::text IS NULL OR r.project_id::text = $1::text)
      ORDER BY r.created_at DESC
      LIMIT 20
    `, params as any[])).rows as Array<{
    candidate_event_id?: string | null
    replay_run_id?: string | null
    asset_key?: string | null
    source_module?: string | null
    result_status?: string | null
    sample_count?: number | string | null
    replay_summary?: unknown
    candidate_payload?: unknown
    created_at?: string | null
  }>

  const rejectedEvidence: PlanningReplayCalibrationReadback['rejectedEvidence'] = []
  const minAcceptedSamples = input.minAcceptedSamples ?? 5
  const maxOvercompensationRate = input.maxOvercompensationRate ?? 0.25
  let selectedReadback: PlanningReplayCalibrationReadback | null = null

  for (const row of rows) {
    const replaySummary = readRecord(row.replay_summary)
    const payload = readRecord(row.candidate_payload)
    const candidateEventId = normalizeText(row.candidate_event_id) || null
    const replayRunId = normalizeText(row.replay_run_id) || null
    const reject = (reason: PlanningReplayCalibrationReadbackRejectedReason) => {
      rejectedEvidence.push({ candidateEventId, replayRunId, reason })
    }

    if (normalizeText(row.source_module) !== 'planningReplayCalibrationService') {
      reject('source_mismatch')
      continue
    }
    if (normalizeText(row.asset_key) !== `planning_replay_calibration:${coarseProcessKey}`) {
      reject('coarse_process_mismatch')
      continue
    }
    if (normalizeText(row.result_status) !== 'replay_passed' || replaySummary.replayPassed !== true) {
      reject('result_not_passed')
      continue
    }
    if (payload.writePolicy !== 'candidate_overlay_only_no_fact_mutation' || payload.sampleGate !== 'passed') {
      reject('payload_policy_mismatch')
      continue
    }
    const acceptedSampleCount = readNumber(payload.acceptedSampleCount)
      ?? readNumber(replaySummary.acceptedSampleCount)
      ?? readNumber(row.sample_count)
      ?? 0
    const rowMinSamples = readNumber(payload.minAcceptedSamples) ?? minAcceptedSamples
    if (acceptedSampleCount < Math.max(minAcceptedSamples, rowMinSamples)) {
      reject('sample_gate_not_met')
      continue
    }
    const maeImprovement = readNumber(payload.maeImprovement) ?? readNumber(replaySummary.maeImprovement)
    if (maeImprovement == null || maeImprovement <= 0) {
      reject('mae_not_improved')
      continue
    }
    const overcompensationRate = readNumber(payload.overcompensationRate) ?? readNumber(replaySummary.overcompensationRate) ?? 0
    if (overcompensationRate > maxOvercompensationRate) {
      reject('overcompensation_guardrail_exceeded')
      continue
    }

    const targets = Array.isArray(payload.calibrationTargets)
      ? payload.calibrationTargets.map((target) => normalizeText(target)).filter(Boolean)
      : []
    const boundedDays = Number(clamp(maeImprovement, 0, 7).toFixed(3))
    const boundedRatio = clamp(maeImprovement / Math.max(readNumber(replaySummary.originalMae) ?? maeImprovement, 1), 0, 0.1)
    const budgetFactor = Number(clamp(1 - boundedRatio, 0.9, 1.1).toFixed(3))
    const targetDiscountFactor = Number(clamp(1 - boundedRatio, 0.85, 1).toFixed(3))

    const readback: PlanningReplayCalibrationReadback = {
      status: 'ready',
      coarseProcessKey,
      evidenceRefs: [
        candidateEventId ? `algorithm_asset_candidate_events:${candidateEventId}` : null,
        replayRunId ? `algorithm_asset_replay_runs:${replayRunId}` : null,
      ].filter((value): value is string => Boolean(value)),
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      acceptedSampleCount,
      originalMae: readNumber(replaySummary.originalMae),
      replayMae: readNumber(replaySummary.overlayMae),
      maeImprovement,
      overcompensationRate,
      e1DurationAdjustmentDays: targets.includes('e1_duration_adjustment') ? boundedDays : null,
      e2ResidualCorrectionDays: targets.includes('e2_residual_correction') ? boundedDays : null,
      capacityBudgetFactor: targets.includes('capacity_parameter_adjustment') ? budgetFactor : null,
      priorityWeightAdjustment: targets.includes('priority_weight_adjustment') ? Number(boundedRatio.toFixed(3)) : null,
      e2TargetDiscountFactor: targets.includes('e2_target_discount_adjustment') ? targetDiscountFactor : null,
      rejectedEvidence,
    }
    if (!selectedReadback) selectedReadback = readback
  }

  if (selectedReadback) {
    selectedReadback.rejectedEvidence = rejectedEvidence
    return selectedReadback
  }

  return emptyReadback(coarseProcessKey, rejectedEvidence)
}
