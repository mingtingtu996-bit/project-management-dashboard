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
  classification: 'governed_learnable' | 'frozen'
  owner: string
  reason: string
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

// The source guard discovers this manifest independently. Missing registry keys are frozen, never implicit live tuning.
const TUNABLE_PARAMETER_SOURCE_INVENTORY: readonly AlgorithmAssetTunableParameterSourceInventoryEntry[] = [
  {
    inventoryKey: 'forecast.candidate_weights',
    classification: 'governed_learnable',
    owner: 'taskDurationForecastService',
    reason: 'Candidate weights map only to the registered L0/L1/L2 candidate parameters.',
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
    owner: 'taskDurationForecastService',
    reason: 'Progress-curve multipliers map only to the registered forecast progress-curve parameter.',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_PROGRESS_CURVE_POLICIES'],
    registryParameterKeys: ['forecast.progress_curve_multiplier'],
  },
  {
    inventoryKey: 'forecast.residual_overlay_limits',
    classification: 'frozen',
    owner: 'taskDurationForecastService',
    reason: 'Residual overlay admission and correction limits remain fixed source policy.',
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
    classification: 'frozen',
    owner: 'taskDurationForecastService',
    reason: 'Earliest-start fallback rules have no registered live-tuning path.',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_EARLIEST_START_RULE_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.default_model_profile',
    classification: 'frozen',
    owner: 'taskDurationForecastService',
    reason: 'The default forecast model profile remains a reviewed source baseline.',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_FORECAST_MODEL_PROFILE'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.trigger_context_defaults',
    classification: 'frozen',
    owner: 'taskDurationForecastService',
    reason: 'Forecast and trigger-context defaults remain fixed source configuration.',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_FORECAST_OPTIONS', 'TRIGGER_CONTEXT_DEFAULTS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.stuck_finishing_policy',
    classification: 'frozen',
    owner: 'taskDurationForecastService',
    reason: 'Stuck-finishing behavior has no registered live-tuning path.',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: ['DEFAULT_STUCK_FINISHING_POLICIES'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.factor_multiplier_caps',
    classification: 'frozen',
    owner: 'durationContextService',
    reason: 'Context factor caps are source-controlled safety limits.',
    sourcePath: 'server/src/services/durationContextService.ts',
    sourceSymbols: ['FACTOR_MULTIPLIER_CAP_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.site_capacity_pressure_policy',
    classification: 'frozen',
    owner: 'durationContextService',
    reason: 'Default site-capacity pressure policy remains a fixed cold-start baseline.',
    sourcePath: 'server/src/services/durationContextService.ts',
    sourceSymbols: ['DEFAULT_SITE_CAPACITY_PRESSURE_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.site_pressure_runtime_parameter',
    classification: 'governed_learnable',
    owner: 'durationContextService',
    reason: 'Site-pressure tuning may be considered only through its registered parameter and canary boundary.',
    sourcePath: 'server/src/services/durationContextService.ts',
    sourceSymbols: ['SITE_PRESSURE_MULTIPLIER_CANARY_BOUNDARY'],
    registryParameterKeys: ['duration.context.site_pressure_multiplier'],
  },
  {
    inventoryKey: 'duration.context.synthesis_safety_bounds',
    classification: 'frozen',
    owner: 'durationContextFactorSynthesisService',
    reason: 'Synthesis safety bounds and neutral fallback remain fixed defense-in-depth controls.',
    sourcePath: 'server/src/services/durationContextFactorSynthesisService.ts',
    sourceSymbols: [
      'DURATION_CONTEXT_FACTOR_SYNTHESIS_MULTIPLIER_SAFETY_MAX',
      'DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MIN',
      'DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MAX',
      'resolveDurationContextInterferenceMatrix.multiplier',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.network_monte_carlo_defaults',
    classification: 'frozen',
    owner: 'durationNetworkMonteCarloService',
    reason: 'Network simulation count and correlation defaults remain source-controlled model settings.',
    sourcePath: 'server/src/services/durationNetworkMonteCarloService.ts',
    sourceSymbols: ['DEFAULT_SIMULATION_COUNT', 'DEFAULT_SCENARIO_CORRELATION'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.residual_overlay_service_thresholds',
    classification: 'frozen',
    owner: 'algorithmAssetForecastResidualOverlayService',
    reason: 'Residual-overlay admission floors remain source-controlled until a registered release path exists.',
    sourcePath: 'server/src/services/algorithmAssetForecastResidualOverlayService.ts',
    sourceSymbols: [
      'FORECAST_RESIDUAL_OVERLAY_MIN_PROJECT_SAMPLE_COUNT',
      'FORECAST_RESIDUAL_OVERLAY_MIN_COMPANY_SAMPLE_COUNT',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'algorithm.intervention_evaluation_defaults',
    classification: 'frozen',
    owner: 'algorithmInterventionEvaluationService',
    reason: 'Intervention cohort and publication limits are fixed evaluation policy.',
    sourcePath: 'server/src/services/algorithmInterventionEvaluationService.ts',
    sourceSymbols: ['DEFAULT_MINIMUM_COHORT_SIZE', 'DEFAULT_PUBLICATION_LIMIT'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'algorithm.seed_auto_governance_distribution_bounds',
    classification: 'frozen',
    owner: 'algorithmSeedAutoGovernanceService',
    reason: 'Seed distribution quality bounds are frozen governance acceptance criteria.',
    sourcePath: 'server/src/services/algorithmSeedAutoGovernanceService.ts',
    sourceSymbols: ['STANDARD_DURATION_STRICT_P50_WINDOW_RATIO', 'STANDARD_DURATION_WIDE_DISTRIBUTION_RATIO'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'algorithm.seed_candidate_discovery_defaults',
    classification: 'frozen',
    owner: 'algorithmSeedCandidateDiscoveryService',
    reason: 'Candidate discovery sample and distribution limits are conservative source-level admission policy.',
    sourcePath: 'server/src/services/algorithmSeedCandidateDiscoveryService.ts',
    sourceSymbols: [
      'DEFAULT_MAX_SAMPLES',
      'DEFAULT_PROJECT_MIN_SAMPLES',
      'DEFAULT_COMPANY_MIN_SAMPLES',
      'STANDARD_DURATION_STRICT_P50_WINDOW_RATIO',
      'STANDARD_DURATION_WIDE_DISTRIBUTION_RATIO',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'algorithm.seed_governance_quality_policy',
    classification: 'frozen',
    owner: 'algorithmSeedGovernancePolicyService',
    reason: 'Seed governance thresholds and weights require policy review before runtime change.',
    sourcePath: 'server/src/services/algorithmSeedGovernancePolicyService.ts',
    sourceSymbols: ['DEFAULT_THRESHOLDS', 'DEFAULT_QUALITY_WEIGHTS', 'QUALITY_WEIGHT_OVERRIDES'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'algorithm.seed_resolver_defaults',
    classification: 'frozen',
    owner: 'algorithmSeedResolver',
    reason: 'Resolver read timeout remains fixed cold-start behavior.',
    sourcePath: 'server/src/services/algorithmSeedResolver.ts',
    sourceSymbols: ['DEFAULT_ALGORITHM_SEED_RESOLVER_READ_TIMEOUT_MS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.accuracy_engine_defaults',
    classification: 'frozen',
    owner: 'durationAlgorithmAccuracyService',
    reason: 'Accuracy-engine empty-baseline defaults are fixed reporting semantics.',
    sourcePath: 'server/src/services/durationAlgorithmAccuracyService.ts',
    sourceSymbols: ['ENGINE_ACCURACY_DEFAULTS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.process_constraint_caps',
    classification: 'frozen',
    owner: 'durationContextProcessConstraintFactorService',
    reason: 'Process-constraint multiplier caps are source-controlled safety limits.',
    sourcePath: 'server/src/services/durationContextProcessConstraintFactorService.ts',
    sourceSymbols: ['PROCESS_CONSTRAINT_MULTIPLIER_CAP_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.external_readiness_scoring_policy',
    classification: 'frozen',
    owner: 'durationContextExternalReadinessFactorService',
    reason: 'External-readiness scoring weights and bounds remain fixed source policy.',
    sourcePath: 'server/src/services/durationContextExternalReadinessFactorService.ts',
    sourceSymbols: ['EXTERNAL_READINESS_SCORING_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.progress_quality_policy',
    classification: 'frozen',
    owner: 'durationContextProgressQualityFactorService',
    reason: 'Progress-quality scoring weights and bounds remain fixed source policy.',
    sourcePath: 'server/src/services/durationContextProgressQualityFactorService.ts',
    sourceSymbols: ['PROGRESS_QUALITY_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.context.weather_runtime_parameter',
    classification: 'governed_learnable',
    owner: 'durationContextWeatherForecastImpactFactorService',
    reason: 'Weather tuning may be considered only through its registered parameter and canary boundary.',
    sourcePath: 'server/src/services/durationContextWeatherForecastImpactFactorService.ts',
    sourceSymbols: ['WEATHER_MULTIPLIER_CANARY_BOUNDARY'],
    registryParameterKeys: ['duration.context.weather_multiplier'],
  },
  {
    inventoryKey: 'duration.live_evidence_reader_defaults',
    classification: 'frozen',
    owner: 'durationLiveLearningProductionEvidenceReaderService',
    reason: 'Production evidence read bounds are fixed operational policy.',
    sourcePath: 'server/src/services/durationLiveLearningProductionEvidenceReaderService.ts',
    sourceSymbols: ['DEFAULT_MAX_ROWS_PER_SOURCE_TABLE'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.suggestion_fallback',
    classification: 'frozen',
    owner: 'durationSuggestionService',
    reason: 'The no-evidence duration fallback remains a fixed cold-start baseline.',
    sourcePath: 'server/src/services/durationSuggestionService.ts',
    sourceSymbols: ['DEFAULT_DURATION_FALLBACK'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.project_remaining_network_options',
    classification: 'frozen',
    owner: 'projectRemainingDurationForecastService',
    reason: 'Project-remaining Monte Carlo options have no registered live-tuning path.',
    sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
    sourceSymbols: ['buildNetworkProbability.simulationCount', 'buildNetworkProbability.scenarioCorrelation'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.scoped_runtime_cache_age',
    classification: 'frozen',
    owner: 'scopedDurationForecastRuntimeService',
    reason: 'Scoped forecast freshness age is fixed runtime cache policy.',
    sourcePath: 'server/src/services/scopedDurationForecastRuntimeService.ts',
    sourceSymbols: ['DEFAULT_SCOPED_FORECAST_MAX_AGE_MS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.scoped_network_options',
    classification: 'frozen',
    owner: 'scopedDurationForecastService',
    reason: 'Scoped Monte Carlo simulation count and scenario correlation have no registered live-tuning path.',
    sourcePath: 'server/src/services/scopedDurationForecastService.ts',
    sourceSymbols: ['buildGroupForecast.simulationCount', 'buildGroupForecast.scenarioCorrelation'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.seed_quality_distribution_bounds',
    classification: 'frozen',
    owner: 'standardWorkDurationSeedQualityAuditService',
    reason: 'Seed quality distribution bounds are fixed audit acceptance criteria.',
    sourcePath: 'server/src/services/standardWorkDurationSeedQualityAuditService.ts',
    sourceSymbols: ['STRICT_P50_WINDOW_RATIO', 'WIDE_DISTRIBUTION_RATIO'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.seed_replay_governance_limit',
    classification: 'frozen',
    owner: 'standardWorkDurationSeedReplayGovernanceService',
    reason: 'Replay sample capacity is fixed governance execution policy.',
    sourcePath: 'server/src/services/standardWorkDurationSeedReplayGovernanceService.ts',
    sourceSymbols: ['DEFAULT_MAX_REPLAY_SAMPLES'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.seed_replay_acceptance_defaults',
    classification: 'frozen',
    owner: 'standardWorkDurationSeedReplayService',
    reason: 'Replay sample and tolerance criteria require reviewed source changes.',
    sourcePath: 'server/src/services/standardWorkDurationSeedReplayService.ts',
    sourceSymbols: [
      'DEFAULT_MIN_SAMPLES_PER_CODE',
      'DEFAULT_TOLERANCE_RATIO',
      'DEFAULT_TRUSTED_WITHIN_TOLERANCE_RATIO',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.task_refresh_and_cap_defaults',
    classification: 'frozen',
    owner: 'taskDurationForecastService',
    reason: 'Forecast refresh budgets, freshness, and remaining-day cap are fixed runtime policy.',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    sourceSymbols: [
      'DEFAULT_DAILY_FORECAST_REFRESH_LIMIT',
      'DEFAULT_DAILY_FORECAST_REFRESH_BATCH_SIZE',
      'DEFAULT_DAILY_FORECAST_REFRESH_MAX_RUNTIME_MS',
      'DEFAULT_DAILY_FORECAST_FRESHNESS_SLO_MS',
      'capTaskRemainingForecastDays.multiplier',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.template_governance_defaults',
    classification: 'frozen',
    owner: 'templateDurationGovernanceService',
    reason: 'Template sample and override thresholds are fixed governance criteria.',
    sourcePath: 'server/src/services/templateDurationGovernanceService.ts',
    sourceSymbols: [
      'DEFAULT_MIN_SAMPLE_COUNT',
      'DEFAULT_MIN_OVERRIDE_SAMPLE_COUNT',
      'DEFAULT_OVERRIDE_DEVIATION_RATIO',
      'DEFAULT_MAX_SAMPLES',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'forecast.weather_impact_defaults',
    classification: 'frozen',
    owner: 'weatherForecastImpactService',
    reason: 'Weather impact multipliers remain source-controlled defaults.',
    sourcePath: 'server/src/services/weatherForecastImpactService.ts',
    sourceSymbols: [
      'DEFAULT_WEATHER_IMPACT_MULTIPLIERS',
      'classifyWeatherForecastImpacts.multiplier#1',
      'classifyWeatherForecastImpacts.multiplier#2',
      'classifyWeatherForecastImpacts.multiplier#3',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'acceptance.policy_replay_calibration_limits',
    classification: 'frozen',
    owner: 'acceptancePolicyReplayCalibrationService',
    reason: 'Acceptance-policy replay sample capacity remains fixed calibration execution policy.',
    sourcePath: 'server/src/services/acceptancePolicyReplayCalibrationService.ts',
    sourceSymbols: ['DEFAULT_SAMPLE_LIMIT'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'acceptance.template_policy_source_fetch_timeout',
    classification: 'frozen',
    owner: 'acceptanceTemplatePolicyUpdateService',
    reason: 'Acceptance-policy source fetch timeout remains fixed operational policy.',
    sourcePath: 'server/src/services/acceptanceTemplatePolicyUpdateService.ts',
    sourceSymbols: ['DEFAULT_ACCEPTANCE_POLICY_SOURCE_FETCH_TIMEOUT_MS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'building_pattern.schedule_calibration_thresholds',
    classification: 'frozen',
    owner: 'buildingPatternScheduleCalibrationService',
    reason: 'Building-pattern schedule calibration thresholds require reviewed source changes.',
    sourcePath: 'server/src/services/buildingPatternScheduleCalibrationService.ts',
    sourceSymbols: ['BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'certificate.policy_replay_calibration_limits',
    classification: 'frozen',
    owner: 'certificatePolicyReplayCalibrationService',
    reason: 'Certificate-policy replay sample capacity remains fixed calibration execution policy.',
    sourcePath: 'server/src/services/certificatePolicyReplayCalibrationService.ts',
    sourceSymbols: ['DEFAULT_SAMPLE_LIMIT'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'commercial.foundation_project_limits',
    classification: 'frozen',
    owner: 'commercialFoundationService',
    reason: 'Commercial active-project and tier limits are fixed entitlement policy, not learnable parameters.',
    sourcePath: 'server/src/services/commercialFoundationService.ts',
    sourceSymbols: ['DEFAULT_ACTIVE_PROJECT_LIMIT', 'DEFAULT_TIER_PROJECT_LIMITS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'construction.dependency_promotion_evidence_thresholds',
    classification: 'frozen',
    owner: 'constructionDependencyReplayCalibrationPersistenceService',
    reason: 'Dependency calibration promotion evidence thresholds remain fixed publication gates.',
    sourcePath: 'server/src/services/constructionDependencyReplayCalibrationPersistenceService.ts',
    sourceSymbols: ['PROMOTION_EVIDENCE_THRESHOLDS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'construction.dependency_replay_calibration_thresholds',
    classification: 'frozen',
    owner: 'constructionDependencyReplayCalibrationService',
    reason: 'Dependency replay sample, zero-lag review, and acceptance thresholds require reviewed source changes.',
    sourcePath: 'server/src/services/constructionDependencyReplayCalibrationService.ts',
    sourceSymbols: [
      'DEFAULT_MAX_SAMPLES',
      'DEFAULT_ZERO_LAG_REVIEW_THRESHOLD_DAYS',
      'DEPENDENCY_RULE_ACCEPTED_SAMPLE_THRESHOLD',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'construction.organization_materialization_review_limits',
    classification: 'frozen',
    owner: 'constructionOrganizationMaterializationReviewPackageService',
    reason: 'Construction-organization review list limits remain fixed administrative query bounds.',
    sourcePath: 'server/src/services/constructionOrganizationMaterializationReviewPackageService.ts',
    sourceSymbols: ['DEFAULT_ADMIN_LIST_LIMIT', 'DEFAULT_ADMIN_LIST_MAX_LIMIT'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'construction.organization_plan_network_limits',
    classification: 'frozen',
    owner: 'constructionOrganizationPlanNetworkDraftService',
    reason: 'Plan-network administrative limits remain fixed materialization bounds.',
    sourcePath: 'server/src/services/constructionOrganizationPlanNetworkDraftService.ts',
    sourceSymbols: ['DEFAULT_PLAN_NETWORK_ADMIN_LIMIT', 'DEFAULT_PLAN_NETWORK_MAX_LIMIT'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'data_quality.scoring_policy',
    classification: 'frozen',
    owner: 'dataQualityService',
    reason: 'Data-confidence thresholds and score weights remain fixed scoring policy.',
    sourcePath: 'server/src/services/dataQualityService.ts',
    sourceSymbols: ['DATA_CONFIDENCE_LOW_THRESHOLD', 'DATA_CONFIDENCE_MEDIUM_THRESHOLD', 'DEFAULT_WEIGHTS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'planning.default_master_plan_row_volume_strategies',
    classification: 'frozen',
    owner: 'defaultMasterPlanRowVolumePolicy',
    reason: 'Default master-plan row-volume strategies remain fixed cold-start planning policy.',
    sourcePath: 'server/src/services/defaultMasterPlanRowVolumePolicy.ts',
    sourceSymbols: ['DEFAULT_MASTER_PLAN_ROW_VOLUME_STRATEGIES'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'drawing.package_experience_iteration_thresholds',
    classification: 'frozen',
    owner: 'drawingPackageExperienceIterationService',
    reason: 'Drawing-package collection and calibration sample thresholds remain fixed iteration policy.',
    sourcePath: 'server/src/services/drawingPackageExperienceIterationService.ts',
    sourceSymbols: [
      'DEFAULT_COLLECT_SAMPLE_LIMIT',
      'DEFAULT_MINIMUM_CALIBRATED_SAMPLES',
      'DEFAULT_MINIMUM_OVER_GENERATED_OBSERVATIONS',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'drawing.package_templates',
    classification: 'frozen',
    owner: 'drawingPackageService',
    reason: 'Built-in drawing-package templates remain source-controlled product baselines.',
    sourcePath: 'server/src/services/drawingPackageService.ts',
    sourceSymbols: ['DEFAULT_DRAWING_PACKAGE_TEMPLATES'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'drawing.package_template_application_defaults',
    classification: 'frozen',
    owner: 'drawingPackageTemplateService',
    reason: 'Template-application completeness initialization remains fixed workflow semantics.',
    sourcePath: 'server/src/services/drawingPackageTemplateService.ts',
    sourceSymbols: ['applyDrawingPackageTemplate.completeness_ratio'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'synthetic_stress.policy_defaults',
    classification: 'frozen',
    owner: 'highFidelitySyntheticStressService',
    reason: 'Synthetic business matrix, productivity safety cap, and prewarm threshold remain fixed stress policy.',
    sourcePath: 'server/src/services/highFidelitySyntheticStressService.ts',
    sourceSymbols: [
      'DEFAULT_BUSINESS_TYPE_MATRIX',
      'PRODUCTIVITY_OUTPUT_SAFETY_MAX',
      'REPRESENTATIVE_PREWARM_CASE_THRESHOLD',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'jobs.runtime_defaults',
    classification: 'frozen',
    owner: 'jobRuntime',
    reason: 'Job retry, retention, timeout, and backoff defaults remain fixed execution policy.',
    sourcePath: 'server/src/services/jobRuntime.ts',
    sourceSymbols: [
      'DEFAULT_BASE_DELAY_MS',
      'DEFAULT_FAILURE_RETENTION_DAYS',
      'DEFAULT_JOB_TIMEOUT_MS',
      'DEFAULT_MAX_ATTEMPTS',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'jobs.persistent_schedule_defaults',
    classification: 'frozen',
    owner: 'persistentJobScheduleService',
    reason: 'Persistent scheduler catch-up, concurrency, and stale-job defaults remain fixed operational policy.',
    sourcePath: 'server/src/services/persistentJobScheduleService.ts',
    sourceSymbols: ['DEFAULT_CATCH_UP', 'DEFAULT_CATCH_UP_CONCURRENCY', 'DEFAULT_STALE_AFTER_MS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'planning.governance_thresholds',
    classification: 'frozen',
    owner: 'planningGovernanceService',
    reason: 'Planning closeout and reorder thresholds remain fixed governance policy.',
    sourcePath: 'server/src/services/planningGovernanceService.ts',
    sourceSymbols: ['GOVERNANCE_CLOSEOUT_THRESHOLDS', 'GOVERNANCE_REORDER_THRESHOLDS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'policy_ops.auto_publish_gate_thresholds',
    classification: 'frozen',
    owner: 'policyOpsAutoPublishGateService',
    reason: 'Policy parse and source coverage minimums remain fixed auto-publish gates.',
    sourcePath: 'server/src/services/policyOpsAutoPublishGateService.ts',
    sourceSymbols: ['DEFAULT_MIN_POLICY_PARSE_HIT_RATE', 'DEFAULT_MIN_SOURCE_COVERAGE_RATE'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'duration.progress_velocity_sample_weights',
    classification: 'frozen',
    owner: 'progressVelocityLearningService',
    reason: 'Cross-project and project-local sample weights are learning-input policy, not the registered runtime velocity multiplier.',
    sourcePath: 'server/src/services/progressVelocityLearningService.ts',
    sourceSymbols: ['buildProjectProgressVelocityLearning.weightMultiplier', 'CROSS_PROJECT_SAMPLE_WEIGHT'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'project.health_policy',
    classification: 'frozen',
    owner: 'projectHealthService',
    reason: 'Project-health score weights, read timeout, and concurrency remain fixed scoring and operational policy.',
    sourcePath: 'server/src/services/projectHealthService.ts',
    sourceSymbols: [
      'DEFAULT_PROJECT_HEALTH_OPTIONAL_READ_TIMEOUT_MS',
      'DEFAULT_PROJECT_HEALTH_READ_CONCURRENCY',
      'HEALTH_WEIGHTS',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'project.productivity_compensation_policy',
    classification: 'frozen',
    owner: 'projectProductivityCompensationService',
    reason: 'Productivity compensation thresholds and factors remain fixed source policy.',
    sourcePath: 'server/src/services/projectProductivityCompensationService.ts',
    sourceSymbols: ['PRODUCTIVITY_COMPENSATION_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'project.schedule_state_defaults',
    classification: 'frozen',
    owner: 'projectScheduleStateService',
    reason: 'Project schedule-state calculation options remain fixed service defaults.',
    sourcePath: 'server/src/services/projectScheduleStateService.ts',
    sourceSymbols: ['DEFAULT_OPTIONS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'read_model.warmup_defaults',
    classification: 'frozen',
    owner: 'readModelWarmupService',
    reason: 'Read-model warmup delay and row limits remain fixed startup policy.',
    sourcePath: 'server/src/services/readModelWarmupService.ts',
    sourceSymbols: ['DEFAULT_WARMUP_DELAY_MS', 'DEFAULT_WARMUP_PROJECT_LIMIT', 'DEFAULT_WARMUP_TASK_LIMIT'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'schedule_acceleration.runtime_defaults',
    classification: 'frozen',
    owner: 'scheduleAccelerationRuntimeService',
    reason: 'Schedule-acceleration read, suggestion, and forecast-age bounds remain fixed runtime policy.',
    sourcePath: 'server/src/services/scheduleAccelerationRuntimeService.ts',
    sourceSymbols: [
      'DEFAULT_RUNTIME_OPTIONAL_READ_TIMEOUT_MS',
      'DEFAULT_RUNTIME_ROWS_READ_TIMEOUT_MS',
      'DEFAULT_RUNTIME_SUGGESTION_TIMEOUT_MS',
      'DEFAULT_RUNTIME_TASK_FORECAST_MAX_AGE_MS',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'attribution.structured_cause_quality_policy',
    classification: 'frozen',
    owner: 'structuredCauseAttributionService',
    reason: 'Structured-cause sample and revision thresholds remain fixed attribution quality policy.',
    sourcePath: 'server/src/services/structuredCauseAttributionService.ts',
    sourceSymbols: [
      '<module>.minimumSampleCount',
      '<module>.otherRateRevisionThresholdPercent',
      '<module>.prefillModificationRateRevisionThresholdPercent',
      'STRUCTURED_CAUSE_QUALITY_POLICY',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'planning.t2_rhythm_replay_thresholds',
    classification: 'frozen',
    owner: 't2RhythmTemplateReplayAcceptanceService',
    reason: 'T2 rhythm replay acceptance thresholds remain fixed governance criteria.',
    sourcePath: 'server/src/services/t2RhythmTemplateReplayAcceptanceService.ts',
    sourceSymbols: ['T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'task.attribution_health_thresholds',
    classification: 'frozen',
    owner: 'taskAttributionSummaryService',
    reason: 'Task-attribution health thresholds remain fixed summary semantics.',
    sourcePath: 'server/src/services/taskAttributionSummaryService.ts',
    sourceSymbols: ['HEALTH_THRESHOLDS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'jobs.task_write_outbox_age_gate',
    classification: 'frozen',
    owner: 'taskWriteFinalizationOutboxService',
    reason: 'Task-write finalization backlog age gate remains fixed outbox policy.',
    sourcePath: 'server/src/services/taskWriteFinalizationOutboxService.ts',
    sourceSymbols: ['DEFAULT_BACKLOG_AGE_GATE_MS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'warnings.notification_write_concurrency',
    classification: 'frozen',
    owner: 'upgradeChainService',
    reason: 'Warning-notification write concurrency remains a fixed operational bound.',
    sourcePath: 'server/src/services/upgradeChainService.ts',
    sourceSymbols: ['DEFAULT_WARNING_NOTIFICATION_WRITE_CONCURRENCY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'warnings.impact_signal_policy',
    classification: 'frozen',
    owner: 'warningImpactSignalService',
    reason: 'Warning impact-signal thresholds and weights remain fixed source policy.',
    sourcePath: 'server/src/services/warningImpactSignalService.ts',
    sourceSymbols: ['DEFAULT_WARNING_IMPACT_SIGNAL_POLICY'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'warnings.impact_signal_governance_minimums',
    classification: 'frozen',
    owner: 'warningService',
    reason: 'Warning impact-signal governance sample minimums remain fixed publication evidence policy.',
    sourcePath: 'server/src/services/warningService.ts',
    sourceSymbols: [
      'recordImpactSignalGovernanceArtifacts.minSampleCount#1',
      'recordImpactSignalGovernanceArtifacts.minSampleCount#2',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'wbs.reconciliation_similarity_threshold',
    classification: 'frozen',
    owner: 'wbsReconciliationService',
    reason: 'WBS reconciliation similarity threshold remains fixed matching policy.',
    sourcePath: 'server/src/services/wbsReconciliationService.ts',
    sourceSymbols: ['SIMILARITY_THRESHOLD'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'wbs.reference_days_sample_threshold',
    classification: 'frozen',
    owner: 'wbsTemplateFeedback',
    reason: 'WBS reference-day acceptance sample threshold remains fixed feedback policy.',
    sourcePath: 'server/src/services/wbsTemplateFeedback.ts',
    sourceSymbols: ['WBS_REFERENCE_DAYS_ACCEPTED_SAMPLE_THRESHOLD'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'wbs.golden_benchmark_thresholds',
    classification: 'frozen',
    owner: 'wbsTemplateGoldenBenchmarkGateService',
    reason: 'WBS golden-benchmark thresholds remain fixed release gate policy.',
    sourcePath: 'server/src/services/wbsTemplateGoldenBenchmarkGateService.ts',
    sourceSymbols: ['WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS'],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'weather.impact_signal_read_model_defaults',
    classification: 'frozen',
    owner: 'weatherImpactSignalReadModelService',
    reason: 'Weather impact multipliers and neutral read-model fallbacks remain fixed source defaults.',
    sourcePath: 'server/src/services/weatherImpactSignalReadModelService.ts',
    sourceSymbols: [
      'classifyWeatherForecastImpacts.multiplier#1',
      'classifyWeatherForecastImpacts.multiplier#2',
      'classifyWeatherForecastImpacts.multiplier#3',
      'DEFAULT_WEATHER_IMPACT_MULTIPLIERS',
    ],
    registryParameterKeys: [],
  },
  {
    inventoryKey: 'wizard.generation_recovery_defaults',
    classification: 'frozen',
    owner: 'wizardGenerationRecoveryService',
    reason: 'Wizard recovery batch and stale-window defaults remain fixed operational policy.',
    sourcePath: 'server/src/services/wizardGenerationRecoveryService.ts',
    sourceSymbols: ['DEFAULT_RECOVERY_LIMIT', 'DEFAULT_STALE_WINDOW_MS'],
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
