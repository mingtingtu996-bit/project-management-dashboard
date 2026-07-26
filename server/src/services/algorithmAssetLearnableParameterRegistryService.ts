import type {
  AlgorithmAssetAutomationMaturity,
  AlgorithmAssetLearningMaturity,
  AlgorithmAssetLearningTarget,
  AlgorithmAssetPublishAnchor,
} from './algorithmAssetGovernanceProtocolService.js'
import { query as rawQuery } from '../database.js'

export type AlgorithmAssetParameterScopePolicy =
  | 'project'
  | 'company'
  | 'segment_baseline'
  | 'industry_baseline'
  | 'system'

export type AlgorithmAssetParameterRiskLevel = 'low' | 'medium' | 'high'

export type AlgorithmAssetLearnableParameterEvidenceRequirement = {
  minSampleCount: number
  replayRequired: boolean
  conflictFreeRequired: boolean
  rollbackRequired: boolean
  crossCompanyReplayRequired?: boolean
  maxOvercompensationRate?: number
  minMaeImprovement?: number
}

export type AlgorithmAssetLearnableParameter = {
  parameterKey: string
  ownerAlgorithm: string
  currentValue: number | string | boolean | Record<string, unknown>
  defaultValue: number | string | boolean | Record<string, unknown>
  learningMaturity: AlgorithmAssetLearningMaturity
  learningTarget: AlgorithmAssetLearningTarget
  publishAnchor: AlgorithmAssetPublishAnchor
  automationMaturity: AlgorithmAssetAutomationMaturity
  scopePolicy: AlgorithmAssetParameterScopePolicy
  evidenceRequired: AlgorithmAssetLearnableParameterEvidenceRequirement
  maxDeltaPerRelease: number
  rollbackTarget: string
  riskLevel: AlgorithmAssetParameterRiskLevel
  description: string
}

export type AlgorithmAssetTunableParameterSourceInventoryEntry = {
  inventoryKey: string
  classification: 'governed_learnable' | 'frozen_constant'
  sourcePath: string
  sourceSymbols: string[]
  registryParameterKeys: string[]
}

export type AlgorithmAssetParameterRuntimeUseEvidence = {
  sampleCount?: number | null
  replayPassed?: boolean | null
  conflictFree?: boolean | null
  rollbackTarget?: string | null
  crossCompanyReplayPassed?: boolean | null
  maeImprovement?: number | null
  overcompensationRate?: number | null
}

export type AlgorithmAssetParameterRuntimeUseInput = {
  parameterKey: string
  currentValue?: number | null
  proposedValue?: number | null
  scopeType?: AlgorithmAssetParameterScopePolicy | null
  companyId?: string | null
  projectId?: string | null
  evidence?: AlgorithmAssetParameterRuntimeUseEvidence
}

export type AlgorithmAssetParameterRuntimeUseStatus =
  | 'runtime_consumable'
  | 'review_required'
  | 'governed_candidate_only'
  | 'frozen_constant'

export type AlgorithmAssetParameterRuntimeUseDecision = {
  parameter: AlgorithmAssetLearnableParameter | null
  status: AlgorithmAssetParameterRuntimeUseStatus
  runtimeConsumable: boolean
  effectiveLearningMaturity: AlgorithmAssetLearningMaturity
  reasons: string[]
}

export type AlgorithmAssetLearnableParameterRegistryValidation = {
  status: 'pass' | 'block'
  missingFields: Array<{
    parameterKey: string
    fields: string[]
  }>
  duplicateParameterKeys: string[]
}

export type AlgorithmAssetLearnableParameterRegistryQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type PersistAlgorithmAssetLearnableParameterRegistryInput = {
  queryExec?: AlgorithmAssetLearnableParameterRegistryQueryExec
}

export type PersistAlgorithmAssetLearnableParameterRegistryResult = {
  persisted: true
  parameterCount: number
}

const PERSIST_LEARNABLE_PARAMETER_REGISTRY_SQL = `
      INSERT INTO public.algorithm_learnable_parameter_registry (
        parameter_key,
        owner_algorithm,
        scope_level,
        company_id,
        project_id,
        learning_target,
        learning_maturity,
        publish_anchor,
        automation_maturity,
        current_value,
        default_value,
        evidence_required,
        max_delta_per_release,
        rollback_target,
        risk_level
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11::jsonb,
        $12::jsonb,
        $13,
        $14::jsonb,
        $15
      )
      ON CONFLICT (
        parameter_key,
        scope_level,
        (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        (COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
      DO UPDATE SET
        owner_algorithm = EXCLUDED.owner_algorithm,
        learning_target = EXCLUDED.learning_target,
        learning_maturity = EXCLUDED.learning_maturity,
        publish_anchor = EXCLUDED.publish_anchor,
        automation_maturity = EXCLUDED.automation_maturity,
        current_value = EXCLUDED.current_value,
        default_value = EXCLUDED.default_value,
        evidence_required = EXCLUDED.evidence_required,
        max_delta_per_release = EXCLUDED.max_delta_per_release,
        rollback_target = EXCLUDED.rollback_target,
        risk_level = EXCLUDED.risk_level,
        updated_at = NOW()
    `

const LEARNABLE_PARAMETERS: readonly AlgorithmAssetLearnableParameter[] = [
  {
    parameterKey: 'duration.project_progress_velocity_multiplier',
    ownerAlgorithm: 'durationContextService',
    currentValue: 1,
    defaultValue: 1,
    learningMaturity: 'guarded_live_tuning',
    learningTarget: 'base_duration',
    publishAnchor: 'guarded_runtime_auto_publish',
    automationMaturity: 'auto_canary',
    scopePolicy: 'project',
    evidenceRequired: {
      minSampleCount: 20,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      maxOvercompensationRate: 0.08,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.15,
    rollbackTarget: 'duration.project_progress_velocity_multiplier.default',
    riskLevel: 'medium',
    description: 'Project-level duration multiplier learned from governed outcomes and consumed only through scoped runtime publication.',
  },
  {
    parameterKey: 'duration.benchmark_blend_weight',
    ownerAlgorithm: 'durationSuggestionService',
    currentValue: 0.55,
    defaultValue: 0.5,
    learningMaturity: 'guarded_live_tuning',
    learningTarget: 'base_duration',
    publishAnchor: 'guarded_runtime_auto_publish',
    automationMaturity: 'auto_publish',
    scopePolicy: 'company',
    evidenceRequired: {
      minSampleCount: 30,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      maxOvercompensationRate: 0.2,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.1,
    rollbackTarget: 'duration.benchmark_blend_weight.default',
    riskLevel: 'low',
    description: 'Blend weight between standard duration and company/project benchmark observations.',
  },
  {
    parameterKey: 'duration.p50_p75_blend_ratio',
    ownerAlgorithm: 'durationSuggestionService',
    currentValue: 0.5,
    defaultValue: 0.5,
    learningMaturity: 'guarded_live_tuning',
    learningTarget: 'base_duration',
    publishAnchor: 'guarded_runtime_auto_publish',
    automationMaturity: 'auto_canary',
    scopePolicy: 'company',
    evidenceRequired: {
      minSampleCount: 30,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      maxOvercompensationRate: 0.2,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.15,
    rollbackTarget: 'duration.p50_p75_blend_ratio.default',
    riskLevel: 'medium',
    description: 'Controlled P50/P75 blend ratio for base duration convergence.',
  },
  {
    parameterKey: 'forecast.L0.candidate_weight',
    ownerAlgorithm: 'taskDurationForecastService',
    currentValue: 0.2,
    defaultValue: 0.2,
    learningMaturity: 'governed_candidate',
    learningTarget: 'candidate_weight',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    scopePolicy: 'system',
    evidenceRequired: {
      minSampleCount: 200,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      crossCompanyReplayRequired: true,
      maxOvercompensationRate: 0.1,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.05,
    rollbackTarget: 'forecast.L0.candidate_weight.default',
    riskLevel: 'high',
    description: 'Forecast model L0 candidate weight; high-risk because it changes model structure weighting.',
  },
  {
    parameterKey: 'forecast.L1.candidate_weight',
    ownerAlgorithm: 'taskDurationForecastService',
    currentValue: 0.35,
    defaultValue: 0.35,
    learningMaturity: 'governed_candidate',
    learningTarget: 'candidate_weight',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    scopePolicy: 'system',
    evidenceRequired: {
      minSampleCount: 200,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      crossCompanyReplayRequired: true,
      maxOvercompensationRate: 0.1,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.05,
    rollbackTarget: 'forecast.L1.candidate_weight.default',
    riskLevel: 'high',
    description: 'Forecast model L1 candidate weight; high-risk because it changes model structure weighting.',
  },
  {
    parameterKey: 'forecast.L2.candidate_weight',
    ownerAlgorithm: 'taskDurationForecastService',
    currentValue: 0.42,
    defaultValue: 0.42,
    learningMaturity: 'governed_candidate',
    learningTarget: 'candidate_weight',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    scopePolicy: 'system',
    evidenceRequired: {
      minSampleCount: 200,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      crossCompanyReplayRequired: true,
      maxOvercompensationRate: 0.1,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.05,
    rollbackTarget: 'forecast.L2.candidate_weight.default',
    riskLevel: 'high',
    description: 'Forecast model L2 candidate weight; high-risk because it changes model structure weighting.',
  },
  {
    parameterKey: 'forecast.progress_curve_multiplier',
    ownerAlgorithm: 'taskDurationForecastService',
    currentValue: {
      front_heavy: [1.6, 1.35, 0.95, 1],
      back_heavy: [1.5, 1.25, 1.1],
      s_curve: [1.15, 1.15, 0.95, 1],
      linear: [1],
    },
    defaultValue: {
      front_heavy: [1.6, 1.35, 0.95, 1],
      back_heavy: [1.5, 1.25, 1.1],
      s_curve: [1.15, 1.15, 0.95, 1],
      linear: [1],
    },
    learningMaturity: 'governed_candidate',
    learningTarget: 'candidate_weight',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    scopePolicy: 'system',
    evidenceRequired: {
      minSampleCount: 200,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      crossCompanyReplayRequired: true,
      maxOvercompensationRate: 0.1,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.05,
    rollbackTarget: 'forecast.progress_curve_multiplier.default',
    riskLevel: 'high',
    description: 'Progress curve multipliers for remaining-duration forecasts; high-risk because they alter model structure and tail behavior.',
  },
  {
    parameterKey: 'forecast.confidence_penalty',
    ownerAlgorithm: 'taskDurationForecastService',
    currentValue: 0.12,
    defaultValue: 0.12,
    learningMaturity: 'governed_candidate',
    learningTarget: 'confidence',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    scopePolicy: 'system',
    evidenceRequired: {
      minSampleCount: 200,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      crossCompanyReplayRequired: true,
      maxOvercompensationRate: 0.1,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.03,
    rollbackTarget: 'forecast.confidence_penalty.default',
    riskLevel: 'high',
    description: 'Confidence penalty formula coefficient; remains governed candidate until model-level gates pass.',
  },
  {
    parameterKey: 'forecast.confidence_weight_multiplier',
    ownerAlgorithm: 'taskDurationForecastService',
    currentValue: 1,
    defaultValue: 1,
    learningMaturity: 'guarded_live_tuning',
    learningTarget: 'confidence',
    publishAnchor: 'guarded_runtime_auto_publish',
    automationMaturity: 'auto_canary',
    scopePolicy: 'company',
    evidenceRequired: {
      minSampleCount: 60,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      maxOvercompensationRate: 0.15,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.15,
    rollbackTarget: 'forecast.confidence_weight_multiplier.default',
    riskLevel: 'medium',
    description: 'Scoped multiplier for remaining-duration forecast confidence weight; it may tune confidence only and must not alter task facts or seed durations.',
  },
  {
    parameterKey: 'duration.context.weather_multiplier',
    ownerAlgorithm: 'durationContextPolicyLearningService',
    currentValue: 1.05,
    defaultValue: 1,
    learningMaturity: 'guarded_live_tuning',
    learningTarget: 'context_factor',
    publishAnchor: 'guarded_runtime_auto_publish',
    automationMaturity: 'auto_canary',
    scopePolicy: 'company',
    evidenceRequired: {
      minSampleCount: 20,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      maxOvercompensationRate: 0.2,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.12,
    rollbackTarget: 'duration.context.weather_multiplier.default',
    riskLevel: 'medium',
    description: 'Weather factor multiplier; canary/live only in scoped company or project boundaries.',
  },
  {
    parameterKey: 'duration.context.site_pressure_multiplier',
    ownerAlgorithm: 'durationContextPolicyLearningService',
    currentValue: 1.08,
    defaultValue: 1,
    learningMaturity: 'guarded_live_tuning',
    learningTarget: 'context_factor',
    publishAnchor: 'guarded_runtime_auto_publish',
    automationMaturity: 'auto_canary',
    scopePolicy: 'company',
    evidenceRequired: {
      minSampleCount: 20,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      maxOvercompensationRate: 0.2,
      minMaeImprovement: 0,
    },
    maxDeltaPerRelease: 0.12,
    rollbackTarget: 'duration.context.site_pressure_multiplier.default',
    riskLevel: 'medium',
    description: 'Site pressure multiplier; canary/live only in scoped company or project boundaries.',
  },
  {
    parameterKey: 'governance.canary_stop_conditions',
    ownerAlgorithm: 'policyOpsAutoPublishGateService',
    currentValue: { maxOvercompensationRate: 0.2, maxRegressionRate: 0.05 },
    defaultValue: { maxOvercompensationRate: 0.2, maxRegressionRate: 0.05 },
    learningMaturity: 'frozen_constant',
    learningTarget: 'governance_report',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'manual_required',
    scopePolicy: 'system',
    evidenceRequired: {
      minSampleCount: 500,
      replayRequired: true,
      conflictFreeRequired: true,
      rollbackRequired: true,
      crossCompanyReplayRequired: true,
    },
    maxDeltaPerRelease: 0,
    rollbackTarget: 'governance.canary_stop_conditions.default',
    riskLevel: 'high',
    description: 'Canary stop conditions are governance parameters and cannot be self-mutated by business algorithms.',
  },
]

// This lists every source-defined setting that changes the core duration and forecast decision paths.
// A missing registry key is intentional only for a frozen constant; it is never an implicit live-tuning gap.
const TUNABLE_PARAMETER_SOURCE_INVENTORY: readonly AlgorithmAssetTunableParameterSourceInventoryEntry[] = [
  {
    inventoryKey: 'forecast.candidate_weights',
    classification: 'governed_learnable',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_CANDIDATE_WEIGHTS'],
    registryParameterKeys: [
      'forecast.L0.candidate_weight',
      'forecast.L1.candidate_weight',
      'forecast.L2.candidate_weight',
    ],
  },
  {
    inventoryKey: 'forecast.progress_curve_policy',
    classification: 'governed_learnable',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_PROGRESS_CURVE_POLICIES'],
    registryParameterKeys: ['forecast.progress_curve_multiplier'],
  },
  {
    inventoryKey: 'forecast.residual_overlay_limits',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: [
      'RESIDUAL_OVERLAY_MIN_PROJECT_SAMPLE_COUNT',
      'RESIDUAL_OVERLAY_MIN_COMPANY_SAMPLE_COUNT',
      'PROJECT_FORECAST_OVERLAY_MIN_SAMPLE_COUNT',
      'MAX_RUNTIME_RESIDUAL_OVERCOMPENSATION_RATIO',
      'MAX_RUNTIME_RESIDUAL_CORRECTION_DAYS',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.earliest_start_rule_policy',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_EARLIEST_START_RULE_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.default_model_profile',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_FORECAST_MODEL_PROFILE'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.trigger_context_defaults',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_FORECAST_OPTIONS', 'TRIGGER_CONTEXT_DEFAULTS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.stuck_finishing_policy',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_STUCK_FINISHING_POLICIES'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.factor_multiplier_caps',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/durationContextService.ts',
    sourceSymbols: ['FACTOR_MULTIPLIER_CAP_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.site_capacity_pressure_policy',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/durationContextService.ts',
    sourceSymbols: ['DEFAULT_SITE_CAPACITY_PRESSURE_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.site_pressure_runtime_parameter',
    classification: 'governed_learnable',
    sourcePath: 'server/src/services/durationContextService.ts',
    sourceSymbols: ['SITE_PRESSURE_MULTIPLIER_PARAMETER_KEY'],
    registryParameterKeys: ['duration.context.site_pressure_multiplier'],
  },
  {
    inventoryKey: 'duration.context.application_safety_bounds',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/durationContextService.ts',
    sourceSymbols: [
      'DURATION_MULTIPLIER_SAFETY_MAX',
      'DURATION_CONTEXT_CONFIDENCE_DELTA_MIN',
      'DURATION_CONTEXT_CONFIDENCE_DELTA_MAX',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.synthesis_safety_bounds',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/durationContextFactorSynthesisService.ts',
    sourceSymbols: [
      'DURATION_CONTEXT_FACTOR_SYNTHESIS_MULTIPLIER_SAFETY_MAX',
      'DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MIN',
      'DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MAX',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.network_monte_carlo_defaults',
    classification: 'frozen_constant',
    sourcePath: 'server/src/services/durationNetworkMonteCarloService.ts',
    sourceSymbols: ['DEFAULT_SIMULATION_COUNT', 'DEFAULT_SCENARIO_CORRELATION'],
    registryParameterKeys: [],
  },
]

function normalizeKey(value: string) {
  return value.trim()
}

function hasScope(input: AlgorithmAssetParameterRuntimeUseInput, parameter: AlgorithmAssetLearnableParameter) {
  if (!input.scopeType) return false
  if (parameter.scopePolicy === 'company') return Boolean(input.companyId) && (input.scopeType === 'company' || input.scopeType === 'project')
  if (parameter.scopePolicy === 'project') return Boolean(input.projectId) && input.scopeType === 'project'
  return input.scopeType === parameter.scopePolicy
}

function readNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null
}

function deltaFor(input: AlgorithmAssetParameterRuntimeUseInput, parameter: AlgorithmAssetLearnableParameter) {
  const currentValue = readNumber(input.currentValue)
  const proposedValue = readNumber(input.proposedValue)
  if (currentValue === null || proposedValue === null) return null
  return Math.abs(proposedValue - currentValue)
}

function evidenceReasons(
  parameter: AlgorithmAssetLearnableParameter,
  input: AlgorithmAssetParameterRuntimeUseInput,
): string[] {
  const evidence = input.evidence ?? {}
  const reasons: string[] = []
  if (!hasScope(input, parameter)) reasons.push('parameter_scope_required')
  if ((evidence.sampleCount ?? 0) < parameter.evidenceRequired.minSampleCount) reasons.push('sample_count_below_parameter_threshold')
  if (parameter.evidenceRequired.replayRequired && evidence.replayPassed !== true) reasons.push('replay_evidence_required')
  if (parameter.evidenceRequired.conflictFreeRequired && evidence.conflictFree !== true) reasons.push('conflict_clearance_required')
  if (parameter.evidenceRequired.rollbackRequired && !evidence.rollbackTarget) reasons.push('rollback_target_required')
  if (parameter.evidenceRequired.crossCompanyReplayRequired && evidence.crossCompanyReplayPassed !== true) reasons.push('cross_company_replay_required')
  if (
    typeof parameter.evidenceRequired.minMaeImprovement === 'number'
    && typeof evidence.maeImprovement === 'number'
    && evidence.maeImprovement < parameter.evidenceRequired.minMaeImprovement
  ) {
    reasons.push('mae_improvement_below_parameter_threshold')
  }
  if (
    typeof parameter.evidenceRequired.maxOvercompensationRate === 'number'
    && typeof evidence.overcompensationRate === 'number'
    && evidence.overcompensationRate > parameter.evidenceRequired.maxOvercompensationRate
  ) {
    reasons.push('overcompensation_rate_exceeds_parameter_threshold')
  }
  const delta = deltaFor(input, parameter)
  if (delta === null) reasons.push('numeric_current_and_proposed_values_required')
  if (delta !== null && delta > parameter.maxDeltaPerRelease) reasons.push('delta_exceeds_max_delta_per_release')
  return reasons
}

function runtimeAllowedByRegistration(parameter: AlgorithmAssetLearnableParameter) {
  return parameter.learningMaturity === 'guarded_live_tuning'
    && parameter.publishAnchor === 'guarded_runtime_auto_publish'
    && (parameter.automationMaturity === 'auto_canary' || parameter.automationMaturity === 'auto_publish')
}

function duplicateKeys(parameters: readonly AlgorithmAssetLearnableParameter[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const parameter of parameters) {
    if (seen.has(parameter.parameterKey)) duplicates.add(parameter.parameterKey)
    seen.add(parameter.parameterKey)
  }
  return [...duplicates].sort()
}

function missingFieldsFor(parameter: AlgorithmAssetLearnableParameter) {
  const missing: string[] = []
  if (!parameter.parameterKey) missing.push('parameterKey')
  if (!parameter.ownerAlgorithm) missing.push('ownerAlgorithm')
  if (!parameter.learningMaturity) missing.push('learningMaturity')
  if (!parameter.learningTarget) missing.push('learningTarget')
  if (!parameter.publishAnchor) missing.push('publishAnchor')
  if (!parameter.automationMaturity) missing.push('automationMaturity')
  if (!parameter.scopePolicy) missing.push('scopePolicy')
  if (!parameter.riskLevel) missing.push('riskLevel')
  if (!parameter.rollbackTarget) missing.push('rollbackTarget')
  if (!Number.isFinite(parameter.maxDeltaPerRelease)) missing.push('maxDeltaPerRelease')
  if (!parameter.evidenceRequired) missing.push('evidenceRequired')
  return missing
}

export function listAlgorithmAssetLearnableParameters() {
  return [...LEARNABLE_PARAMETERS]
}

export function listAlgorithmAssetTunableParameterSourceInventory() {
  return TUNABLE_PARAMETER_SOURCE_INVENTORY.map((entry) => ({
    ...entry,
    sourceSymbols: [...entry.sourceSymbols],
    registryParameterKeys: [...entry.registryParameterKeys],
  }))
}

export function getAlgorithmAssetLearnableParameter(parameterKey: string) {
  const key = normalizeKey(parameterKey)
  return LEARNABLE_PARAMETERS.find((parameter) => parameter.parameterKey === key) ?? null
}

export function validateAlgorithmAssetLearnableParameterRegistry(): AlgorithmAssetLearnableParameterRegistryValidation {
  const missingFields = LEARNABLE_PARAMETERS
    .map((parameter) => ({ parameterKey: parameter.parameterKey, fields: missingFieldsFor(parameter) }))
    .filter((entry) => entry.fields.length > 0)
  const duplicateParameterKeys = duplicateKeys(LEARNABLE_PARAMETERS)
  return {
    status: missingFields.length > 0 || duplicateParameterKeys.length > 0 ? 'block' : 'pass',
    missingFields,
    duplicateParameterKeys,
  }
}

export async function persistAlgorithmAssetLearnableParameterRegistry(
  input: PersistAlgorithmAssetLearnableParameterRegistryInput = {},
): Promise<PersistAlgorithmAssetLearnableParameterRegistryResult> {
  const parameters = listAlgorithmAssetLearnableParameters()

  for (const parameter of parameters) {
    await persistLearnableParameterRegistryWithRawQuery([
      parameter.parameterKey,
      parameter.ownerAlgorithm,
      'system',
      null,
      null,
      parameter.learningTarget,
      parameter.learningMaturity,
      parameter.publishAnchor,
      parameter.automationMaturity,
      { value: parameter.currentValue },
      { value: parameter.defaultValue },
      {
        ...parameter.evidenceRequired,
        declaredScopePolicy: parameter.scopePolicy,
      },
      parameter.maxDeltaPerRelease,
      { rollbackTarget: parameter.rollbackTarget },
      parameter.riskLevel,
    ], input.queryExec)
  }

  return {
    persisted: true,
    parameterCount: parameters.length,
  }
}

// workspace-isolation-system-boundary-approved: learnable parameter definitions are a global system registry, not company-owned runtime values.
async function persistLearnableParameterRegistryWithRawQuery(
  params: unknown[],
  queryExec?: AlgorithmAssetLearnableParameterRegistryQueryExec,
) {
  if (queryExec) {
    await queryExec(PERSIST_LEARNABLE_PARAMETER_REGISTRY_SQL, params)
    return
  }

  await rawQuery(`
      INSERT INTO public.algorithm_learnable_parameter_registry (
        parameter_key,
        owner_algorithm,
        scope_level,
        company_id,
        project_id,
        learning_target,
        learning_maturity,
        publish_anchor,
        automation_maturity,
        current_value,
        default_value,
        evidence_required,
        max_delta_per_release,
        rollback_target,
        risk_level
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11::jsonb,
        $12::jsonb,
        $13,
        $14::jsonb,
        $15
      )
      ON CONFLICT (
        parameter_key,
        scope_level,
        (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        (COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
      DO UPDATE SET
        owner_algorithm = EXCLUDED.owner_algorithm,
        learning_target = EXCLUDED.learning_target,
        learning_maturity = EXCLUDED.learning_maturity,
        publish_anchor = EXCLUDED.publish_anchor,
        automation_maturity = EXCLUDED.automation_maturity,
        current_value = EXCLUDED.current_value,
        default_value = EXCLUDED.default_value,
        evidence_required = EXCLUDED.evidence_required,
        max_delta_per_release = EXCLUDED.max_delta_per_release,
        rollback_target = EXCLUDED.rollback_target,
        risk_level = EXCLUDED.risk_level,
        updated_at = NOW()
    `, params as any[])
}

export function evaluateAlgorithmAssetParameterRuntimeUse(
  input: AlgorithmAssetParameterRuntimeUseInput,
): AlgorithmAssetParameterRuntimeUseDecision {
  const parameter = getAlgorithmAssetLearnableParameter(input.parameterKey)
  if (!parameter) {
    return {
      parameter: null,
      status: 'frozen_constant',
      runtimeConsumable: false,
      effectiveLearningMaturity: 'frozen_constant',
      reasons: ['unregistered_parameter_defaults_to_frozen_constant'],
    }
  }

  const reasons = evidenceReasons(parameter, input)
  if (!runtimeAllowedByRegistration(parameter)) {
    reasons.push('parameter_learning_maturity_does_not_allow_runtime_consumption')
    if (parameter.publishAnchor === 'manual_governance_required' || parameter.publishAnchor === 'system_curated_publish') {
      reasons.push('manual_or_system_curated_publish_anchor_requires_governance_package')
    }
    return {
      parameter,
      status: parameter.learningMaturity === 'frozen_constant' ? 'frozen_constant' : 'governed_candidate_only',
      runtimeConsumable: false,
      effectiveLearningMaturity: parameter.learningMaturity,
      reasons,
    }
  }

  if (reasons.length > 0) {
    return {
      parameter,
      status: 'review_required',
      runtimeConsumable: false,
      effectiveLearningMaturity: parameter.learningMaturity,
      reasons,
    }
  }

  return {
    parameter,
    status: 'runtime_consumable',
    runtimeConsumable: true,
    effectiveLearningMaturity: parameter.learningMaturity,
    reasons,
  }
}
