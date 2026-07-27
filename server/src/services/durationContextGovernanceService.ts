import type { DurationContextFactorKey } from '../types/durationContext.js'

export type ForecastDaysConsumption =
  | 'none'
  | 'extra_days'
  | 'multiplier'
  | 'extra_days_and_multiplier_cap'
  | 'confidence_only'

export interface DurationContextFactorConsumptionMatrixEntry {
  factorKey: DurationContextFactorKey
  factorLabel: string
  sourceLayer: 'climate' | 'execution' | 'workflow' | 'compensation' | 'calibration' | 'schedule_state'
  forecastDaysConsumption: ForecastDaysConsumption
  productivityConsumption: string
  confidenceConsumption: 'none' | 'direct_delta' | 'quality_guardrail'
  primaryConsumers: string[]
  runtimeEffect: string
  requiresPublishedCalibrationForRuntimeOverlay: boolean
  governancePriority: 'P0' | 'P1' | 'P2'
  notes: string[]
  forecastOnlySubRules?: DurationContextForecastOnlySubRule[]
}

export interface DurationContextForecastOnlySubRule {
  code: string
  parentFactorKey: DurationContextFactorKey
  sourceTables: string[]
  owningService: string
  primaryConsumers: string[]
  consumptionMode: 'forecast_only'
  runtimeAuthority: 'extra_days_bridge_only'
  duplicateCountPolicy: string
  notes: string[]
}

export interface DurationContextNonFactorGovernanceSignal {
  code: string
  label: string
  owningService: string
  sourceServices: string[]
  primaryConsumers: string[]
  frontendExposurePolicy: 'backend_admin_api_only'
  runtimeAuthority: 'suggestion_buffer_only'
  governancePriority: 'P0' | 'P1' | 'P2'
  notes: string[]
}

export interface DurationContextInputCoverageAuditEntry {
  domainCode: string
  label: string
  canonicalRuntimePath:
    | 'runtime_factor'
    | 'external_readiness.forecast_only'
    | 'project_schedule_state'
    | 'suggestion_buffer_only'
    | 'governance_only'
  coverageStatus: 'direct' | 'bridged' | 'governance_only' | 'not_runtime_authority'
  sourceTables: string[]
  owningService: string
  runtimeBoundary: string
  notes: string[]
}

export interface DurationContextRuntimePromotionGateway {
  sourceDomain: 'risk_issue_warning' | 'change_log'
  defaultRuntimeAuthority: 'governance_only'
  promotionRequired: true
  allowedRuntimeTargets: string[]
  promotionPolicy: string
  owningService: string
  notes: string[]
}

export type DurationContextAutomationRiskTier = 'low' | 'medium' | 'high'

export type DurationContextAutomationStage =
  | 'candidate_discovery'
  | 'shadow_run'
  | 'audit_replay'
  | 'threshold_evolution_candidate'
  | 'canary_publish'
  | 'runtime_auto_publish'
  | 'rollback_monitor'
  | 'governance_report'

export interface DurationContextFactorAutomationPolicy {
  factorKey: DurationContextFactorKey
  riskTier: DurationContextAutomationRiskTier
  allowedAutomationStages: DurationContextAutomationStage[]
  runtimeAutoPublishEligible: boolean
  runtimeActivationBoundary:
    | 'published_only_runtime_consumption'
    | 'candidate_or_canary_before_manual_publish'
    | 'manual_runtime_promotion_required'
  rollbackRequired: boolean
  guardrails: string[]
  notes: string[]
}

export interface DurationContextExplainPackageContract {
  version: 'duration_context_explain_v1'
  frontendExposurePolicy: 'backend_admin_api_only'
  owningService: 'durationContextService'
  fields: string[]
  sourceFields: string[]
  notes: string[]
}

export interface DurationContextEffectiveContributionLedgerContract {
  sourceField: 'calculationContext.factor_contribution_ledger'
  recomputationPolicy: 'do_not_recompute_duration_or_productivity_from_raw_context_factors'
  consumers: Array<{
    service: string
    requiredFor: string[]
    consumptionPolicy: string
  }>
  notes: string[]
}

export interface DurationContextPolicyLearningContract {
  modelFamily: 'contextual_bandit_v1'
  runtimeRole: 'strategy_candidate_layer_only'
  productionBoundary: 'rule_layer_remains_authoritative_high_risk_manual_promotion'
  decisionLogTable: 'duration_context_policy_decisions'
  parameterTable: 'duration_context_policy_parameters'
  canaryCandidateTable: 'duration_context_policy_canary_candidates'
  policyVersionTable: 'duration_context_policy_versions'
  decisionLoggingPolicy: string
  delayedRewardBackfillPolicy: string
  offlineReplayPolicy: string
  parameterLearningPolicy: string
  learnedPolicyReplayPolicy: string
  canaryGatePolicy: string
  canaryApprovalPolicy: string
  policyVersionRegistryPolicy: string
  rollbackPolicy: string
  runtimeSelectorPolicy: string
  approvedCanaryShadowReplayPolicy: string
  canaryActivationReadinessPolicy: string
  canaryTrialReleasePlanPolicy: string
  coldStartLearningPolicy: string
  stateFeatures: string[]
  actionFamilies: string[]
  rewardSignals: string[]
  promotionPolicy: string
  notes: string[]
}

export interface DurationContextFactorAttributionCase {
  caseId: string
  predictedTopFactorKeys: string[]
  observedCauseFactorKeys: string[]
  actualDeviationDays?: number | null
}

export interface DurationContextFactorAttributionCaseResult {
  caseId: string
  classification: 'matched' | 'missed_driver' | 'over_penalty' | 'no_observed_deviation' | 'unclassified'
  matchedFactorKeys: DurationContextFactorKey[]
  missedFactorKeys: DurationContextFactorKey[]
  overPenaltyFactorKeys: DurationContextFactorKey[]
}

export interface DurationContextFactorAttributionReport {
  reportCode: 'duration_context_factor_attribution'
  frontendExposurePolicy: 'backend_admin_api_only'
  summary: {
    totalCases: number
    matchedCaseCount: number
    missedCaseCount: number
    overPenaltyCaseCount: number
    hitRate: number
    missedRate: number
    overPenaltyRate: number
  }
  factorStats: Partial<Record<DurationContextFactorKey, {
    predictedCount: number
    observedCount: number
    matchedCount: number
    missedCount: number
    overPenaltyCount: number
  }>>
  caseResults: DurationContextFactorAttributionCaseResult[]
}

export interface DurationContextCombinationStressScenario {
  scenarioCode: string
  factorKeys: DurationContextFactorKey[]
  scenarioType: 'pairwise' | 'triple'
  expectedFailureMode: string
  guardrails: string[]
  primaryConsumers: string[]
}

export interface DurationContextCombinationStressMatrix {
  summary: {
    matrixCode: 'duration_context_combination_regression_matrix'
    backendExposurePolicy: 'backend_admin_api_only'
    totalScenarios: number
    pairwiseScenarioCount: number
    tripleScenarioCount: number
  }
  scenarios: DurationContextCombinationStressScenario[]
}

export interface DurationContextContractValidationIssue {
  code: string
  path: string
  message: string
}

export interface DurationContextContractValidationResult {
  valid: boolean
  errors: DurationContextContractValidationIssue[]
  warnings: DurationContextContractValidationIssue[]
}

export const GOVERNED_DURATION_CONTEXT_FACTOR_KEYS = [
  'seasonal_productivity',
  'process_seasonal_sensitivity',
  'weather_forecast_impact',
  'calendar_missing',
  'workflow_sequence',
  'resource_conflict',
  'process_constraint',
  'external_readiness',
  'progress_velocity',
  'progress_quality',
  'pm_recovery_compensation',
  'productivity_compensation',
  'project_baseline_calibration',
  'project_schedule_state',
] as const satisfies readonly DurationContextFactorKey[]

export interface DurationContextGovernanceReport {
  reportCode: 'duration_context_factor_governance'
  generatedAt: string
  frontendExposurePolicy: 'backend_admin_api_only'
  summary: {
    totalFactors: number
    directForecastConsumerCount: number
    productivityConsumerCount: number
    confidenceOnlyConsumerCount: number
    publishedCalibrationGuardCount: number
    forecastOnlySubRuleCount: number
    nonFactorGovernanceSignalCount: number
    inputCoverageDomainCount: number
    runtimePromotionGatewayCount: number
    attributionGovernanceEnabled: boolean
    combinationStressScenarioCount: number
    jsonContractValidationEnabled: boolean
    autoPublishEligibleFactorCount: number
    candidateOrCanaryFactorCount: number
    manualRuntimePromotionFactorCount: number
    highRiskManualRuntimeFactorCount: number
  }
  factorConsumptionMatrix: DurationContextFactorConsumptionMatrixEntry[]
  factorAutomationPolicies: DurationContextFactorAutomationPolicy[]
  nonFactorGovernanceSignals: DurationContextNonFactorGovernanceSignal[]
  inputCoverageAudit: DurationContextInputCoverageAuditEntry[]
  runtimePromotionGateways: DurationContextRuntimePromotionGateway[]
  explainPackageContract: DurationContextExplainPackageContract
  effectiveContributionLedgerContract: DurationContextEffectiveContributionLedgerContract
  policyLearningContract: DurationContextPolicyLearningContract
  combinationStressMatrix: DurationContextCombinationStressMatrix
  jsonContractValidation: {
    validator: 'validateDurationContextSummaryContract'
    frontendExposurePolicy: 'backend_admin_api_only'
    requiredFields: string[]
    governedJsonObjects: string[]
    replayPolicy: string
  }
  recommendations: Array<{
    code: string
    priority: 'P0' | 'P1' | 'P2'
    status: 'active' | 'monitor'
    detail: string
  }>
}

const MATRIX_BY_FACTOR_KEY = {
  seasonal_productivity: {
    factorKey: 'seasonal_productivity',
    factorLabel: 'Seasonal productivity',
    sourceLayer: 'climate',
    forecastDaysConsumption: 'multiplier',
    productivityConsumption: 'base_productivity_pressure',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'taskDurationForecastService', 'projectProductivityCompensationService'],
    runtimeEffect: 'Adjusts context multiplier and creates a climate pressure basis for controlled compensation.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: ['Calendar and seasonal signals should remain observable even when compensation offsets part of the pressure.'],
  },
  process_seasonal_sensitivity: {
    factorKey: 'process_seasonal_sensitivity',
    factorLabel: 'Process seasonal sensitivity',
    sourceLayer: 'climate',
    forecastDaysConsumption: 'multiplier',
    productivityConsumption: 'base_productivity_pressure',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'highFidelitySyntheticStressService'],
    runtimeEffect: 'Applies process-specific weather or seasonal sensitivity to duration context.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: ['Outdoor and envelope work should be separated from indoor commissioning in future seed governance.'],
  },
  weather_forecast_impact: {
    factorKey: 'weather_forecast_impact',
    factorLabel: 'Weather forecast impact',
    sourceLayer: 'climate',
    forecastDaysConsumption: 'multiplier',
    productivityConsumption: 'base_productivity_pressure',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'taskDurationForecastService'],
    runtimeEffect: 'Applies live weather warnings and forecast facts to the context multiplier.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: ['Extreme shutdowns must not be silently lifted by compensation.'],
  },
  calendar_missing: {
    factorKey: 'calendar_missing',
    factorLabel: 'Calendar missing',
    sourceLayer: 'climate',
    forecastDaysConsumption: 'confidence_only',
    productivityConsumption: 'none',
    confidenceConsumption: 'quality_guardrail',
    primaryConsumers: ['durationContextService'],
    runtimeEffect: 'Marks incomplete calendar inputs as a confidence and data dependency signal.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P2',
    notes: ['Missing calendar should degrade confidence rather than invent duration changes.'],
  },
  workflow_sequence: {
    factorKey: 'workflow_sequence',
    factorLabel: 'Workflow sequence and building pattern',
    sourceLayer: 'workflow',
    forecastDaysConsumption: 'extra_days_and_multiplier_cap',
    productivityConsumption: 'workflow_rhythm_context',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'taskDurationForecastService', 'baselineGenerationService'],
    runtimeEffect: 'Carries building_pattern rhythm, weighted cycle days, stagger rules and workflow sequence extra days.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: ['Top-N pattern merge should remain visible in calculationContext for baseline consumers.'],
  },
  resource_conflict: {
    factorKey: 'resource_conflict',
    factorLabel: 'Resource conflict',
    sourceLayer: 'execution',
    forecastDaysConsumption: 'extra_days_and_multiplier_cap',
    productivityConsumption: 'resource_pressure_context',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'taskDurationForecastService', 'projectScheduleStateService'],
    runtimeEffect: 'Adds bounded extra days and multiplier pressure for same-zone, same-floor or scarce-resource conflicts.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: ['Project schedule state may relax this factor when acceleration is deliberate and supported by evidence.'],
  },
  process_constraint: {
    factorKey: 'process_constraint',
    factorLabel: 'Process constraint',
    sourceLayer: 'workflow',
    forecastDaysConsumption: 'extra_days_and_multiplier_cap',
    productivityConsumption: 'constraint_context',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'taskDurationForecastService', 'constructionDependencyRuleSystemService'],
    runtimeEffect: 'Adds constraint-driven candidate or auto-applied delay signals for process dependencies.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: ['Hard constraints should stay explicit rather than being inferred from generic lag.'],
  },
  external_readiness: {
    factorKey: 'external_readiness',
    factorLabel: 'External readiness',
    sourceLayer: 'execution',
    forecastDaysConsumption: 'extra_days',
    productivityConsumption: 'readiness_pressure_context',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'taskDurationForecastService'],
    runtimeEffect: 'Adds limited extra days for unsatisfied conditions, materials, acceptance readiness, earliest-start gates and obstacles.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: [
      'Forecast consumption intentionally caps readiness extra days to avoid double-counting task facts.',
      'earliest_start_rule is not a standalone duration context factor; it is registered as an external_readiness forecast-only sub-rule.',
    ],
    forecastOnlySubRules: [
      {
        code: 'earliest_start_rule',
        parentFactorKey: 'external_readiness',
        sourceTables: ['algorithm_seed_records.earliest_start_rule', 'task_conditions', 'task_obstacles', 'project_materials', 'acceptance_plans'],
        owningService: 'taskDurationForecastService',
        primaryConsumers: ['taskDurationForecastService'],
        consumptionMode: 'forecast_only',
        runtimeAuthority: 'extra_days_bridge_only',
        duplicateCountPolicy: 'external_readiness_parent_owns_duration_context_factor_count',
        notes: ['Computes the earliest feasible start date from readiness facts and known target dates, then bridges wait days into forecast only.'],
      },
      {
        code: 'acceptance_finish_gate',
        parentFactorKey: 'external_readiness',
        sourceTables: ['acceptance_plans'],
        owningService: 'taskDurationForecastService',
        primaryConsumers: ['taskDurationForecastService'],
        consumptionMode: 'forecast_only',
        runtimeAuthority: 'extra_days_bridge_only',
        duplicateCountPolicy: 'dedupe_by_source_entity_and_impact_mode_before_external_readiness_extra_days',
        notes: ['Pending acceptance or handover plans can delay remaining duration but do not create a separate runtime factor.'],
      },
      {
        code: 'certificate_condition_target_date',
        parentFactorKey: 'external_readiness',
        sourceTables: ['task_conditions'],
        owningService: 'taskDurationForecastService',
        primaryConsumers: ['taskDurationForecastService'],
        consumptionMode: 'forecast_only',
        runtimeAuthority: 'extra_days_bridge_only',
        duplicateCountPolicy: 'dedupe_by_condition_source_entity_and_known_date_source',
        notes: ['Certificate, permit and license target dates are known-date readiness gates consumed through the external_readiness bridge.'],
      },
      {
        code: 'drawing_condition_target_date',
        parentFactorKey: 'external_readiness',
        sourceTables: ['task_conditions'],
        owningService: 'taskDurationForecastService',
        primaryConsumers: ['taskDurationForecastService'],
        consumptionMode: 'forecast_only',
        runtimeAuthority: 'extra_days_bridge_only',
        duplicateCountPolicy: 'dedupe_by_condition_source_entity_and_known_date_source',
        notes: ['Drawing and design target dates are known-date readiness gates consumed through the external_readiness bridge.'],
      },
      {
        code: 'drawing_package_schedule_impact',
        parentFactorKey: 'external_readiness',
        sourceTables: ['drawing_packages', 'construction_drawings', 'task_conditions'],
        owningService: 'taskDurationForecastService',
        primaryConsumers: ['taskDurationForecastService', 'durationContextGovernanceService'],
        consumptionMode: 'forecast_only',
        runtimeAuthority: 'extra_days_bridge_only',
        duplicateCountPolicy: 'dedupe_by_drawing_package_before_external_readiness_extra_days',
        notes: ['Drawing package rejection, review delay, revision and schedule-impact flags must bridge through task conditions or forecast readiness context rather than becoming a separate runtime factor.'],
      },
      {
        code: 'certificate_work_item_gate',
        parentFactorKey: 'external_readiness',
        sourceTables: ['certificate_work_items', 'pre_milestones', 'task_conditions'],
        owningService: 'taskDurationForecastService',
        primaryConsumers: ['taskDurationForecastService', 'durationContextGovernanceService'],
        consumptionMode: 'forecast_only',
        runtimeAuthority: 'extra_days_bridge_only',
        duplicateCountPolicy: 'dedupe_by_certificate_or_work_item_before_external_readiness_extra_days',
        notes: ['Certificate work item blocked state, next action due date and permit milestone gate status bridge into forecast readiness only when linked to task conditions or task-level forecast context.'],
      },
    ],
  },
  progress_velocity: {
    factorKey: 'progress_velocity',
    factorLabel: 'Progress velocity',
    sourceLayer: 'execution',
    forecastDaysConsumption: 'multiplier',
    productivityConsumption: 'velocity_pressure_or_acceleration',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'projectScheduleStateService', 'taskDurationForecastService'],
    runtimeEffect: 'Detects slow, stagnant or accelerating progress from snapshots when progress evidence exists.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: ['Zero-progress tasks must keep velocity_skipped_due_to_zero_progress metadata.'],
  },
  progress_quality: {
    factorKey: 'progress_quality',
    factorLabel: 'Progress quality',
    sourceLayer: 'execution',
    forecastDaysConsumption: 'confidence_only',
    productivityConsumption: 'sample_quality_guardrail',
    confidenceConsumption: 'quality_guardrail',
    primaryConsumers: ['durationContextService', 'durationExperienceService'],
    runtimeEffect: 'Suppresses unreliable learning samples and reduces confidence for rollback or dirty progress data.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: ['Quality penalties should not directly add delay without an execution signal.'],
  },
  pm_recovery_compensation: {
    factorKey: 'pm_recovery_compensation',
    factorLabel: 'PM recovery compensation',
    sourceLayer: 'compensation',
    forecastDaysConsumption: 'multiplier',
    productivityConsumption: 'positive_recovery_signal',
    confidenceConsumption: 'none',
    primaryConsumers: ['durationContextService', 'highFidelitySyntheticStressService'],
    runtimeEffect: 'Offsets part of negative pressure when recovery, makeup work or managed resequencing is detected.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P2',
    notes: ['Rigid shutdown windows should not be compensated.'],
  },
  productivity_compensation: {
    factorKey: 'productivity_compensation',
    factorLabel: 'Project productivity compensation',
    sourceLayer: 'compensation',
    forecastDaysConsumption: 'multiplier',
    productivityConsumption: 'controlled_positive_compensation',
    confidenceConsumption: 'none',
    primaryConsumers: ['durationContextService', 'projectProductivityCompensationService', 'projectProductivityCalibrationService'],
    runtimeEffect: 'Applies project-level positive productivity uplift from mature samples, snapshots and schedule states.',
    requiresPublishedCalibrationForRuntimeOverlay: true,
    governancePriority: 'P1',
    notes: ['Runtime overlay must consume published calibration rows only; shadow/candidate remain governance artifacts.'],
  },
  project_baseline_calibration: {
    factorKey: 'project_baseline_calibration',
    factorLabel: 'Project baseline calibration',
    sourceLayer: 'calibration',
    forecastDaysConsumption: 'multiplier',
    productivityConsumption: 'baseline_factor',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'taskDurationForecastService'],
    runtimeEffect: 'Applies project baseline factor when a project-level calibrated baseline exists.',
    requiresPublishedCalibrationForRuntimeOverlay: true,
    governancePriority: 'P1',
    notes: ['Avoid double counting with duration experience contribution in productivity compensation.'],
  },
  project_schedule_state: {
    factorKey: 'project_schedule_state',
    factorLabel: 'Project schedule state',
    sourceLayer: 'schedule_state',
    forecastDaysConsumption: 'multiplier',
    productivityConsumption: 'scope_state_policy',
    confidenceConsumption: 'direct_delta',
    primaryConsumers: ['durationContextService', 'projectScheduleStateService', 'taskDurationForecastService'],
    runtimeEffect: 'Carries project, building and specialty schedule states and downstream policies into context synthesis.',
    requiresPublishedCalibrationForRuntimeOverlay: false,
    governancePriority: 'P1',
    notes: ['Can relax resource conflict and supersede velocity acceleration when scope evidence is stronger.'],
  },
} satisfies Record<DurationContextFactorKey, DurationContextFactorConsumptionMatrixEntry>

const MATRIX: DurationContextFactorConsumptionMatrixEntry[] = GOVERNED_DURATION_CONTEXT_FACTOR_KEYS.map(
  (factorKey) => MATRIX_BY_FACTOR_KEY[factorKey],
)

const FACTOR_KEY_SET = new Set<DurationContextFactorKey>(MATRIX.map((entry) => entry.factorKey))
const ACTION_POLICIES = new Set(['auto_apply', 'candidate_only', 'confidence_only'])

const COMMON_AUTOMATION_STAGES: DurationContextAutomationStage[] = [
  'candidate_discovery',
  'shadow_run',
  'audit_replay',
  'governance_report',
]

const LOW_RISK_AUTOMATION_STAGES: DurationContextAutomationStage[] = [
  'candidate_discovery',
  'shadow_run',
  'audit_replay',
  'threshold_evolution_candidate',
  'runtime_auto_publish',
  'rollback_monitor',
  'governance_report',
]

const MEDIUM_RISK_AUTOMATION_STAGES: DurationContextAutomationStage[] = [
  'candidate_discovery',
  'shadow_run',
  'audit_replay',
  'threshold_evolution_candidate',
  'canary_publish',
  'rollback_monitor',
  'governance_report',
]

const HIGH_RISK_AUTOMATION_STAGES: DurationContextAutomationStage[] = [
  'candidate_discovery',
  'shadow_run',
  'audit_replay',
  'governance_report',
]

const DURATION_CONTEXT_FACTOR_AUTOMATION_POLICY: Record<DurationContextFactorKey, DurationContextFactorAutomationPolicy> = {
  seasonal_productivity: highRiskFactorAutomationPolicy(
    'seasonal_productivity',
    ['Seasonal and statutory-window semantics can move whole-project capacity; automated changes must remain replay/report only until manually promoted.'],
  ),
  process_seasonal_sensitivity: highRiskFactorAutomationPolicy(
    'process_seasonal_sensitivity',
    ['Process-weather sensitivity can hard-stop safety or quality-critical work; candidate changes require manual runtime promotion.'],
  ),
  weather_forecast_impact: highRiskFactorAutomationPolicy(
    'weather_forecast_impact',
    ['Weather warnings may represent hard shutdowns; automation may audit and replay but must not silently publish new runtime behavior.'],
  ),
  calendar_missing: highRiskFactorAutomationPolicy(
    'calendar_missing',
    ['Calendar completeness affects holiday and workday trust; automated discovery is allowed, runtime authority remains manual.'],
  ),
  workflow_sequence: highRiskFactorAutomationPolicy(
    'workflow_sequence',
    ['Workflow and building-pattern rhythm changes can reshape baseline generation and sequencing, so runtime promotion is manual.'],
  ),
  resource_conflict: mediumRiskFactorAutomationPolicy(
    'resource_conflict',
    ['Resource pressure may be canaried after replay because deliberate acceleration and genuine conflict can look similar.'],
  ),
  process_constraint: highRiskFactorAutomationPolicy(
    'process_constraint',
    ['Process constraints may express safety, inspection, cleanroom or hazardous-work boundaries; no unattended runtime auto-publish.'],
  ),
  external_readiness: mediumRiskFactorAutomationPolicy(
    'external_readiness',
    ['Readiness facts can be incomplete or stale; candidate/canary automation is allowed with source-entity replay and rollback.'],
  ),
  progress_velocity: mediumRiskFactorAutomationPolicy(
    'progress_velocity',
    ['Velocity thresholds may be canaried after replay but need rollback because progress snapshots can be sparse or dirty.'],
  ),
  progress_quality: mediumRiskFactorAutomationPolicy(
    'progress_quality',
    ['Quality gates may be canaried as confidence policy, while runtime delay authority remains bounded by evidence.'],
  ),
  pm_recovery_compensation: mediumRiskFactorAutomationPolicy(
    'pm_recovery_compensation',
    ['PM recovery is a positive compensation signal; it can be canaried but should not auto-publish without overcompensation monitoring.'],
  ),
  productivity_compensation: lowRiskFactorAutomationPolicy(
    'productivity_compensation',
    ['Project-level compensation already has published-row runtime gating, shadow replay, MAE improvement checks and rollback.'],
  ),
  project_baseline_calibration: lowRiskFactorAutomationPolicy(
    'project_baseline_calibration',
    ['Baseline calibration can auto-publish only behind published-only runtime consumption and rollback monitoring.'],
  ),
  project_schedule_state: highRiskFactorAutomationPolicy(
    'project_schedule_state',
    ['Schedule-state policy can relax or amplify other factors across scopes; automation is limited to discovery, replay and reporting.'],
  ),
}

function lowRiskFactorAutomationPolicy(
  factorKey: DurationContextFactorKey,
  notes: string[],
): DurationContextFactorAutomationPolicy {
  return {
    factorKey,
    riskTier: 'low',
    allowedAutomationStages: [...LOW_RISK_AUTOMATION_STAGES],
    runtimeAutoPublishEligible: true,
    runtimeActivationBoundary: 'published_only_runtime_consumption',
    rollbackRequired: true,
    guardrails: [
      'minimum_50_day_or_50_sample_evidence',
      'mae_after_must_not_exceed_mae_before',
      'overcompensation_rate_lte_0_08',
      'published_rows_only_are_consumed_by_runtime',
      'rollback_published_row_on_regression',
    ],
    notes,
  }
}

function mediumRiskFactorAutomationPolicy(
  factorKey: DurationContextFactorKey,
  notes: string[],
): DurationContextFactorAutomationPolicy {
  return {
    factorKey,
    riskTier: 'medium',
    allowedAutomationStages: [...MEDIUM_RISK_AUTOMATION_STAGES],
    runtimeAutoPublishEligible: false,
    runtimeActivationBoundary: 'candidate_or_canary_before_manual_publish',
    rollbackRequired: true,
    guardrails: [
      'candidate_only_until_replay_passes',
      'canary_scope_must_be_explicit',
      'effective_ledger_must_match_replay',
      'rollback_required_for_runtime_change',
    ],
    notes,
  }
}

function highRiskFactorAutomationPolicy(
  factorKey: DurationContextFactorKey,
  notes: string[],
): DurationContextFactorAutomationPolicy {
  return {
    factorKey,
    riskTier: 'high',
    allowedAutomationStages: [...COMMON_AUTOMATION_STAGES, ...HIGH_RISK_AUTOMATION_STAGES.filter((stage) => !COMMON_AUTOMATION_STAGES.includes(stage))],
    runtimeAutoPublishEligible: false,
    runtimeActivationBoundary: 'manual_runtime_promotion_required',
    rollbackRequired: true,
    guardrails: [
      'automated_candidate_discovery_allowed',
      'automated_shadow_replay_allowed',
      'automated_governance_report_allowed',
      'runtime_publication_requires_manual_or_code_governance',
      'no_unattended_runtime_auto_publish',
    ],
    notes: [
      ...notes,
      'High risk does not mean never automated; it means automation stops before production runtime publication.',
    ],
  }
}

const COMBINATION_STRESS_SCENARIOS: DurationContextCombinationStressScenario[] = [
  {
    scenarioCode: 'readiness_resource_weather',
    factorKeys: ['external_readiness', 'resource_conflict', 'weather_forecast_impact'],
    scenarioType: 'triple',
    expectedFailureMode: 'readiness, resource and weather pressure can double-count the same delayed workface source.',
    guardrails: [
      'use_factor_contribution_ledger_not_raw_factor_multiplication',
      'causal_dedupe_by_source_entity',
      'cap_extra_days_at_synthesis_layer',
    ],
    primaryConsumers: ['durationContextService', 'taskDurationForecastService', 'highFidelitySyntheticStressService'],
  },
  {
    scenarioCode: 'schedule_state_resource_velocity',
    factorKeys: ['project_schedule_state', 'resource_conflict', 'progress_velocity'],
    scenarioType: 'triple',
    expectedFailureMode: 'local acceleration can look like resource pressure and velocity anomaly when scope composition is ignored.',
    guardrails: [
      'scope_composition_must_remain_visible',
      'project_schedule_state_can_relax_deliberate_resource_pressure',
      'monthly_average_p_must_not_hide_local_acceleration',
    ],
    primaryConsumers: ['durationContextService', 'projectScheduleStateService', 'projectExecutionSummaryService'],
  },
  {
    scenarioCode: 'workflow_readiness_resource',
    factorKeys: ['workflow_sequence', 'external_readiness', 'resource_conflict'],
    scenarioType: 'triple',
    expectedFailureMode: 'building-pattern stagger hints, readiness gates and scarce crews can all create the same sequencing delay.',
    guardrails: [
      'workflow_stagger_is_hint_until_task_dependency_or_readiness_fact_exists',
      'resource_class_hard_limit_overrides_building_pattern_hint',
      'ledger_suppresses_duplicate_source_entity_pressure',
    ],
    primaryConsumers: ['durationContextService', 'baselineGenerationService', 'taskDurationForecastService'],
  },
  {
    scenarioCode: 'climate_weather_process',
    factorKeys: ['seasonal_productivity', 'weather_forecast_impact', 'process_seasonal_sensitivity'],
    scenarioType: 'triple',
    expectedFailureMode: 'macro climate, realtime weather and process sensitivity can multiply the same heat/rain/wind signal.',
    guardrails: [
      'same_climate_signal_must_not_compound_without_distinct_evidence',
      'extreme_shutdowns_must_remain_observable',
      'p_can_fall_below_legacy_floor_when_event_is_real',
    ],
    primaryConsumers: ['durationContextService', 'highFidelitySyntheticStressService'],
  },
  {
    scenarioCode: 'quality_velocity_learning',
    factorKeys: ['progress_quality', 'progress_velocity'],
    scenarioType: 'pairwise',
    expectedFailureMode: 'dirty progress snapshots can look like velocity acceleration or stagnation and pollute learning samples.',
    guardrails: [
      'progress_quality_can_suppress_learning_without_adding_delay',
      'velocity_skipped_due_to_zero_progress_must_be_explicit',
    ],
    primaryConsumers: ['durationContextService', 'durationExperienceService', 'progressVelocityLearningService'],
  },
  {
    scenarioCode: 'compensation_weather_shutdown',
    factorKeys: ['productivity_compensation', 'weather_forecast_impact'],
    scenarioType: 'pairwise',
    expectedFailureMode: 'project-level compensation can over-lift rigid shutdown windows if event authority is ignored.',
    guardrails: [
      'published_calibration_only_for_runtime_overlay',
      'rigid_shutdown_windows_are_not_silently_compensated',
      'p_above_1_allowed_only_when_acceleration_evidence_exists',
    ],
    primaryConsumers: ['durationContextService', 'projectProductivityCompensationService'],
  },
  {
    scenarioCode: 'baseline_calibration_compensation',
    factorKeys: ['project_baseline_calibration', 'productivity_compensation'],
    scenarioType: 'pairwise',
    expectedFailureMode: 'baseline factor and positive productivity compensation can both explain the same historical bias.',
    guardrails: [
      'shadow_candidate_rows_do_not_affect_runtime',
      'avoid_double_counting_duration_experience_samples',
      'ledger_retains_calibration_source_separation',
    ],
    primaryConsumers: ['durationContextService', 'projectProductivityCalibrationService'],
  },
]

const NON_FACTOR_GOVERNANCE_SIGNALS: DurationContextNonFactorGovernanceSignal[] = [
  {
    code: 'project_environment_health_buffer',
    label: 'Project environment and health buffer',
    owningService: 'durationSuggestionService',
    sourceServices: ['projectHealthDeviationSummaryService', 'durationContextService'],
    primaryConsumers: ['durationSuggestionService', 'manualDurationCorrectionService'],
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimeAuthority: 'suggestion_buffer_only',
    governancePriority: 'P1',
    notes: [
      'This is a suggestion-stage buffer, not a DurationContextFactorKey.',
      'It keeps health deviation and project environment pressure visible in backend governance without changing the 14 runtime factors.',
    ],
  },
]

const INPUT_COVERAGE_AUDIT: DurationContextInputCoverageAuditEntry[] = [
  {
    domainCode: 'calendar_and_season',
    label: 'Calendar, holiday and seasonal productivity',
    canonicalRuntimePath: 'runtime_factor',
    coverageStatus: 'direct',
    sourceTables: ['algorithm_seed_records.work_calendar', 'algorithm_seed_records.seasonal_productivity', 'project_climate_profiles'],
    owningService: 'durationContextService',
    runtimeBoundary: 'calendar and seasonal facts can affect multiplier and confidence directly.',
    notes: ['Includes official work calendar, regional climate profile and seasonal productivity seeds.'],
  },
  {
    domainCode: 'process_weather_sensitivity',
    label: 'Process-specific seasonal and weather sensitivity',
    canonicalRuntimePath: 'runtime_factor',
    coverageStatus: 'direct',
    sourceTables: ['algorithm_seed_records.process_seasonal_sensitivity', 'project_weather_forecasts', 'site_shutdown_events'],
    owningService: 'durationContextService',
    runtimeBoundary: 'process-sensitive outdoor or shutdown facts can affect multiplier directly.',
    notes: ['Indoor/outdoor distinction remains governed by process sensitivity seeds.'],
  },
  {
    domainCode: 'task_readiness',
    label: 'Task hard/soft readiness conditions and obstacles',
    canonicalRuntimePath: 'runtime_factor',
    coverageStatus: 'direct',
    sourceTables: ['task_conditions', 'task_obstacles'],
    owningService: 'durationContextService',
    runtimeBoundary: 'open readiness facts affect external_readiness only after timing evidence is present.',
    notes: ['Soft or stale facts remain confidence-only.'],
  },
  {
    domainCode: 'material_arrival',
    label: 'Material expected arrival and overdue readiness',
    canonicalRuntimePath: 'runtime_factor',
    coverageStatus: 'direct',
    sourceTables: ['project_materials', 'task_conditions'],
    owningService: 'durationContextService',
    runtimeBoundary: 'material facts affect external_readiness and resource_conflict through linked task or explicit condition references.',
    notes: ['Explicit task condition linkage takes precedence over linked_task_id fallback.'],
  },
  {
    domainCode: 'drawing_package_schedule_impact',
    label: 'Drawing package schedule impact',
    canonicalRuntimePath: 'external_readiness.forecast_only',
    coverageStatus: 'bridged',
    sourceTables: ['drawing_packages', 'construction_drawings', 'task_conditions'],
    owningService: 'taskDurationForecastService',
    runtimeBoundary: 'drawing package schedule impact must bridge through external_readiness forecast-only logic or linked task conditions.',
    notes: ['Prevents drawing review signals from becoming a fifteenth runtime factor while keeping schedule-impact flags observable.'],
  },
  {
    domainCode: 'certificate_work_item_gate',
    label: 'Certificate work item and permit milestone gate',
    canonicalRuntimePath: 'external_readiness.forecast_only',
    coverageStatus: 'bridged',
    sourceTables: ['certificate_work_items', 'pre_milestones', 'task_conditions'],
    owningService: 'taskDurationForecastService',
    runtimeBoundary: 'certificate work item blocked state and next action due dates bridge through external_readiness forecast-only logic.',
    notes: ['Certificate rows without task linkage stay in pre-milestone governance and project health surfaces.'],
  },
  {
    domainCode: 'acceptance_handover_gate',
    label: 'Acceptance, rectification and handover gates',
    canonicalRuntimePath: 'external_readiness.forecast_only',
    coverageStatus: 'bridged',
    sourceTables: ['acceptance_plans', 'acceptance_requirements', 'acceptance_records'],
    owningService: 'taskDurationForecastService',
    runtimeBoundary: 'acceptance impact signals can delay remaining duration through the readiness bridge.',
    notes: ['Acceptance warnings themselves do not directly mutate duration.'],
  },
  {
    domainCode: 'resource_pressure',
    label: 'Crew, equipment, workface and scarce-resource pressure',
    canonicalRuntimePath: 'runtime_factor',
    coverageStatus: 'direct',
    sourceTables: ['tasks', 'task_progress_snapshots', 'task_conditions', 'task_obstacles', 'project_materials', 'algorithm_seed_records.resource_class'],
    owningService: 'durationContextService',
    runtimeBoundary: 'resource pressure affects extra days and multiplier only when overlap/capacity/readiness evidence crosses policy thresholds.',
    notes: ['Project schedule state can relax deliberate acceleration pressure.'],
  },
  {
    domainCode: 'progress_execution',
    label: 'Progress velocity and data quality',
    canonicalRuntimePath: 'runtime_factor',
    coverageStatus: 'direct',
    sourceTables: ['task_progress_snapshots', 'duration_experience_samples', 'data_quality_findings'],
    owningService: 'durationContextService',
    runtimeBoundary: 'execution velocity affects multiplier; dirty progress affects confidence and learning eligibility.',
    notes: ['Zero-progress tasks keep velocity skipped metadata instead of inventing velocity.'],
  },
  {
    domainCode: 'workflow_pattern_constraint',
    label: 'Workflow sequence, process constraints and building pattern rhythm',
    canonicalRuntimePath: 'runtime_factor',
    coverageStatus: 'direct',
    sourceTables: ['task_dependencies', 'algorithm_seed_records.cross_item_workflow', 'algorithm_seed_records.process_constraint', 'algorithm_seed_records.building_pattern'],
    owningService: 'durationContextService',
    runtimeBoundary: 'workflow and pattern facts can affect extra days, multiplier and baseline cycle-day hints.',
    notes: ['Top-N building pattern merge remains a duration-context/baseline hint, not a warning source.'],
  },
  {
    domainCode: 'project_schedule_state',
    label: 'Project, building, specialty and critical-path schedule state',
    canonicalRuntimePath: 'project_schedule_state',
    coverageStatus: 'direct',
    sourceTables: ['project_schedule_states', 'project_daily_snapshot', 'task_duration_forecasts'],
    owningService: 'projectScheduleStateService',
    runtimeBoundary: 'schedule state can explain scope acceleration, relax resource pressure and supersede task velocity acceleration.',
    notes: ['Scope-level outputs are required so project averages do not hide local acceleration or blockers.'],
  },
  {
    domainCode: 'productivity_calibration',
    label: 'Productivity compensation and baseline calibration',
    canonicalRuntimePath: 'runtime_factor',
    coverageStatus: 'direct',
    sourceTables: ['duration_experience_samples', 'project_daily_snapshot', 'project_schedule_states', 'project_productivity_compensation_calibrations'],
    owningService: 'projectProductivityCompensationService',
    runtimeBoundary: 'runtime overlay consumes published calibration only; shadow and candidate rows remain governance artifacts.',
    notes: ['Cold-start compensation is disabled until enough real evidence exists.'],
  },
  {
    domainCode: 'risk_issue_warning',
    label: 'Risk, issue and warning outputs',
    canonicalRuntimePath: 'governance_only',
    coverageStatus: 'governance_only',
    sourceTables: ['risks', 'issues', 'notifications'],
    owningService: 'riskIssueWarningGovernanceService',
    runtimeBoundary: 'warnings do not directly change duration; underlying facts must enter conditions, obstacles, acceptance, weather, progress or schedule state.',
    notes: ['This prevents circular warning -> duration -> warning feedback loops.'],
  },
  {
    domainCode: 'change_log',
    label: 'Change logs and audit history',
    canonicalRuntimePath: 'governance_only',
    coverageStatus: 'governance_only',
    sourceTables: ['change_logs', 'revision_pool_candidates', 'task_baseline_versions'],
    owningService: 'planningGovernanceService',
    runtimeBoundary: 'audit records do not directly change duration; confirmed plan revisions or task facts carry runtime authority.',
    notes: ['Design changes, claims and contract changes should become revised tasks, dependencies or readiness gates before entering duration context.'],
  },
  {
    domainCode: 'project_environment_health_buffer',
    label: 'Project health and environment buffer',
    canonicalRuntimePath: 'suggestion_buffer_only',
    coverageStatus: 'not_runtime_authority',
    sourceTables: ['project_daily_snapshot', 'project_health_details'],
    owningService: 'durationSuggestionService',
    runtimeBoundary: 'health buffer can influence suggestion guardrails but does not add a runtime factor.',
    notes: ['Kept backend-admin only until promoted through a separate runtime-factor design.'],
  },
]

const RUNTIME_PROMOTION_GATEWAYS: DurationContextRuntimePromotionGateway[] = [
  {
    sourceDomain: 'risk_issue_warning',
    defaultRuntimeAuthority: 'governance_only',
    promotionRequired: true,
    allowedRuntimeTargets: [
      'task_conditions',
      'task_obstacles',
      'acceptance_plans',
      'project_schedule_states',
      'project_weather_forecasts',
      'data_quality_findings',
    ],
    promotionPolicy: 'risk_issue_warning_outputs_must_materialize_as_runtime_facts_before_duration_context_consumption',
    owningService: 'riskIssueWarningGovernanceService',
    notes: [
      'Warnings explain and govern, but do not directly mutate duration context.',
      'The underlying cause must be promoted into an existing runtime fact table to avoid warning-duration feedback loops.',
    ],
  },
  {
    sourceDomain: 'change_log',
    defaultRuntimeAuthority: 'governance_only',
    promotionRequired: true,
    allowedRuntimeTargets: [
      'task_baseline_versions',
      'task_dependencies',
      'task_conditions',
      'task_obstacles',
      'acceptance_plans',
    ],
    promotionPolicy: 'change_log_records_require_confirmed_revision_or_task_fact_projection_before_runtime_consumption',
    owningService: 'planningGovernanceService',
    notes: [
      'Audit history is not a duration signal by itself.',
      'Confirmed change impact must enter baseline revisions, dependencies, readiness gates or obstacles before duration context can consume it.',
    ],
  },
]

const EXPLAIN_PACKAGE_CONTRACT: DurationContextExplainPackageContract = {
  version: 'duration_context_explain_v1',
  frontendExposurePolicy: 'backend_admin_api_only',
  owningService: 'durationContextService',
  fields: [
    'primaryDrivers',
    'companionSignals',
    'suppressedSignals',
    'readinessGraph',
    'scopeComposition',
    'calibration',
    'pSemantics',
    'inputCoverage',
    'causalDedupe',
  ],
  sourceFields: [
    'factor_contribution_ledger',
    'causal_dedupe',
    'readiness_graph',
    'project_schedule_state_composition',
    'external_readiness_calibration',
    'input_coverage',
  ],
  notes: [
    'Explain packages are generated by durationContextService.calculationContext for backend/admin diagnostics.',
    'They standardize why P can be below 1, above 1, or affected by suppressed companion signals without adding a frontend widget.',
  ],
}

const EFFECTIVE_CONTRIBUTION_LEDGER_CONTRACT: DurationContextEffectiveContributionLedgerContract = {
  sourceField: 'calculationContext.factor_contribution_ledger',
  recomputationPolicy: 'do_not_recompute_duration_or_productivity_from_raw_context_factors',
  consumers: [
    {
      service: 'highFidelitySyntheticStressService',
      requiredFor: ['independent_productivity', 'stress_case_factor_trace'],
      consumptionPolicy: 'consume_effective_ledger_after_causal_dedupe_and_suppression',
    },
    {
      service: 'durationSuggestionService',
      requiredFor: ['filtered_context_rebuild', 'suggestion_explainability'],
      consumptionPolicy: 'filter_or_project_from_effective_ledger_instead_of_raw_context_factor_reduction',
    },
    {
      service: 'taskDurationForecastService',
      requiredFor: ['forecast_explain_package', 'readiness_bridge_trace'],
      consumptionPolicy: 'preserve_effective_factor_modes_when projecting forecast diagnostics',
    },
  ],
  notes: [
    'The ledger is already causal-deduped and suppression-aware inside durationContextService.',
    'Downstream consumers must not recompute duration or productivity by multiplying raw context factors again.',
  ],
}

const POLICY_LEARNING_CONTRACT: DurationContextPolicyLearningContract = {
  modelFamily: 'contextual_bandit_v1',
  runtimeRole: 'strategy_candidate_layer_only',
  productionBoundary: 'rule_layer_remains_authoritative_high_risk_manual_promotion',
  decisionLogTable: 'duration_context_policy_decisions',
  parameterTable: 'duration_context_policy_parameters',
  canaryCandidateTable: 'duration_context_policy_canary_candidates',
  policyVersionTable: 'duration_context_policy_versions',
  decisionLoggingPolicy: 'persist_recommendation_state_action_and_guardrails_on_calibration_run_without_runtime_mutation',
  delayedRewardBackfillPolicy: 'evaluate_pending_decisions_after_target_reward_date_from_project_productivity_calibration_evidence',
  offlineReplayPolicy: 'backend_admin_candidate_report_only; persist_decisions_optional; never_updates_published_runtime_rows',
  parameterLearningPolicy: 'learn_state_bucket_action_weights_from_evaluated_decisions_as_candidate_parameters_only',
  learnedPolicyReplayPolicy: 'compare_candidate_learned_weights_against_rule_baseline_rewards_for_canary_review_only',
  canaryGatePolicy: 'generate_low_risk_auto_publish_gate_candidates_without_runtime_publication',
  canaryApprovalPolicy: 'zero_human_review_when_scope_samples_and_mae_gate_pass; company_admin_review_required_when_gate_misses_or_manual_override',
  policyVersionRegistryPolicy: 'duration_context_policy_versions_tracks_auto_gate_or_manual_canary_published_rolled_back_expired_versions_as_registry_only',
  rollbackPolicy: 'auto_or_manual_rollback_records_version_status_and_reason_without_recomputing_runtime_p',
  runtimeSelectorPolicy: 'readonly_selector_explain_only; never_changes_duration_context_p_or_factor_outputs',
  approvedCanaryShadowReplayPolicy: 'selector_matched_canary_versions_are_replayed_against_evaluated_decisions_without_runtime_mutation',
  canaryActivationReadinessPolicy: 'shadow_replay_guardrail_gate_for_controlled_runtime_trial_review_only',
  canaryTrialReleasePlanPolicy: 'build_review_required_controlled_trial_release_plan_without_runtime_activation',
  coldStartLearningPolicy: 'gate_learning_automation_by_0_7_30_60_90_day_real_project_evidence_without_runtime_mutation',
  stateFeatures: [
    'factorSignals',
    'scheduleState',
    'maturityDays',
    'criticalPathFlag',
    'scopeContext',
    'ruleBaselineP',
    'currentP',
  ],
  actionFamilies: [
    'keep_rule_baseline',
    'publish_low_risk_calibration_threshold',
    'hold_high_risk_candidate_for_review',
    'recommend_weather_recovery_overtime',
    'recommend_resequence_workfaces',
  ],
  rewardSignals: [
    'mae_improvement',
    'overcompensation_penalty',
    'schedule_stability_delta',
    'hard_constraint_violation_penalty',
    'high_risk_runtime_auto_publish_penalty',
  ],
  promotionPolicy: 'offline_shadow_first; candidate_only_by_default; low_risk_published_only_auto_publish; high_risk_manual_runtime_promotion',
  notes: [
    'The policy learner ranks strategy candidates; it does not replace deterministic duration-context factors.',
    'Low-risk policy canary versions may be auto-registered only when scope samples and MAE gates pass; high-risk factor changes remain manual or code-governed.',
  ],
}

export function listDurationContextFactorConsumptionMatrix() {
  return MATRIX.map((entry) => ({
    ...entry,
    primaryConsumers: [...entry.primaryConsumers],
    notes: [...entry.notes],
    forecastOnlySubRules: entry.forecastOnlySubRules?.map((subRule) => ({
      ...subRule,
      sourceTables: [...subRule.sourceTables],
      primaryConsumers: [...subRule.primaryConsumers],
      notes: [...subRule.notes],
    })),
  }))
}

export function listDurationContextNonFactorGovernanceSignals() {
  return NON_FACTOR_GOVERNANCE_SIGNALS.map((signal) => ({
    ...signal,
    sourceServices: [...signal.sourceServices],
    primaryConsumers: [...signal.primaryConsumers],
    notes: [...signal.notes],
  }))
}

export function listDurationContextInputCoverageAudit() {
  return INPUT_COVERAGE_AUDIT.map((entry) => ({
    ...entry,
    sourceTables: [...entry.sourceTables],
    notes: [...entry.notes],
  }))
}

export function listDurationContextRuntimePromotionGateways() {
  return RUNTIME_PROMOTION_GATEWAYS.map((gateway) => ({
    ...gateway,
    allowedRuntimeTargets: [...gateway.allowedRuntimeTargets],
    notes: [...gateway.notes],
  }))
}

function cloneDurationContextFactorAutomationPolicy(policy: DurationContextFactorAutomationPolicy) {
  return {
    ...policy,
    allowedAutomationStages: [...policy.allowedAutomationStages],
    guardrails: [...policy.guardrails],
    notes: [...policy.notes],
  }
}

export function listDurationContextFactorAutomationPolicies() {
  return MATRIX.map((entry) => cloneDurationContextFactorAutomationPolicy(DURATION_CONTEXT_FACTOR_AUTOMATION_POLICY[entry.factorKey]))
}

export function getDurationContextFactorAutomationPolicy(factorKey: DurationContextFactorKey) {
  return cloneDurationContextFactorAutomationPolicy(DURATION_CONTEXT_FACTOR_AUTOMATION_POLICY[factorKey])
}

export function getDurationContextExplainPackageContract() {
  return {
    ...EXPLAIN_PACKAGE_CONTRACT,
    fields: [...EXPLAIN_PACKAGE_CONTRACT.fields],
    sourceFields: [...EXPLAIN_PACKAGE_CONTRACT.sourceFields],
    notes: [...EXPLAIN_PACKAGE_CONTRACT.notes],
  }
}

export function getDurationContextEffectiveContributionLedgerContract() {
  return {
    ...EFFECTIVE_CONTRIBUTION_LEDGER_CONTRACT,
    consumers: EFFECTIVE_CONTRIBUTION_LEDGER_CONTRACT.consumers.map((consumer) => ({
      ...consumer,
      requiredFor: [...consumer.requiredFor],
    })),
    notes: [...EFFECTIVE_CONTRIBUTION_LEDGER_CONTRACT.notes],
  }
}

export function getDurationContextPolicyLearningContract() {
  return {
    ...POLICY_LEARNING_CONTRACT,
    stateFeatures: [...POLICY_LEARNING_CONTRACT.stateFeatures],
    actionFamilies: [...POLICY_LEARNING_CONTRACT.actionFamilies],
    rewardSignals: [...POLICY_LEARNING_CONTRACT.rewardSignals],
    notes: [...POLICY_LEARNING_CONTRACT.notes],
  }
}

function uniqueFactorKeys(values: unknown[]): DurationContextFactorKey[] {
  return Array.from(new Set(values
    .map((value) => String(value ?? '').trim())
    .filter((value): value is DurationContextFactorKey => FACTOR_KEY_SET.has(value as DurationContextFactorKey))))
}

function roundRatio(value: number): number {
  return Number(value.toFixed(3))
}

function emptyFactorAttributionStats() {
  return {
    predictedCount: 0,
    observedCount: 0,
    matchedCount: 0,
    missedCount: 0,
    overPenaltyCount: 0,
  }
}

export function evaluateDurationContextFactorAttribution(
  cases: DurationContextFactorAttributionCase[],
): DurationContextFactorAttributionReport {
  const factorStats: DurationContextFactorAttributionReport['factorStats'] = {}
  const touchFactor = (key: DurationContextFactorKey) => {
    factorStats[key] = factorStats[key] ?? emptyFactorAttributionStats()
    return factorStats[key]!
  }
  const caseResults = cases.map((item): DurationContextFactorAttributionCaseResult => {
    const predicted = uniqueFactorKeys(item.predictedTopFactorKeys)
    const observed = uniqueFactorKeys(item.observedCauseFactorKeys)
    const predictedSet = new Set(predicted)
    const observedSet = new Set(observed)
    const matchedFactorKeys = predicted.filter((key) => observedSet.has(key))
    const missedFactorKeys = observed.filter((key) => !predictedSet.has(key))
    const overPenaltyFactorKeys = predicted.filter((key) => !observedSet.has(key) && Number(item.actualDeviationDays ?? 0) <= 0)

    predicted.forEach((key) => { touchFactor(key).predictedCount += 1 })
    observed.forEach((key) => { touchFactor(key).observedCount += 1 })
    matchedFactorKeys.forEach((key) => { touchFactor(key).matchedCount += 1 })
    missedFactorKeys.forEach((key) => { touchFactor(key).missedCount += 1 })
    overPenaltyFactorKeys.forEach((key) => { touchFactor(key).overPenaltyCount += 1 })

    const classification: DurationContextFactorAttributionCaseResult['classification'] = matchedFactorKeys.length > 0
      ? 'matched'
      : overPenaltyFactorKeys.length > 0
        ? 'over_penalty'
        : missedFactorKeys.length > 0
          ? 'missed_driver'
          : observed.length === 0
            ? 'no_observed_deviation'
            : 'unclassified'

    return {
      caseId: item.caseId,
      classification,
      matchedFactorKeys,
      missedFactorKeys,
      overPenaltyFactorKeys,
    }
  })

  const totalCases = caseResults.length
  const matchedCaseCount = caseResults.filter((item) => item.classification === 'matched').length
  const missedCaseCount = caseResults.filter((item) => item.classification === 'missed_driver').length
  const overPenaltyCaseCount = caseResults.filter((item) => item.classification === 'over_penalty').length

  return {
    reportCode: 'duration_context_factor_attribution',
    frontendExposurePolicy: 'backend_admin_api_only',
    summary: {
      totalCases,
      matchedCaseCount,
      missedCaseCount,
      overPenaltyCaseCount,
      hitRate: totalCases > 0 ? roundRatio(matchedCaseCount / totalCases) : 0,
      missedRate: totalCases > 0 ? roundRatio(missedCaseCount / totalCases) : 0,
      overPenaltyRate: totalCases > 0 ? roundRatio(overPenaltyCaseCount / totalCases) : 0,
    },
    factorStats,
    caseResults,
  }
}

export function evaluateDurationContextCombinationStressMatrix(): DurationContextCombinationStressMatrix {
  const scenarios = COMBINATION_STRESS_SCENARIOS.map((scenario) => ({
    ...scenario,
    factorKeys: [...scenario.factorKeys],
    guardrails: [...scenario.guardrails],
    primaryConsumers: [...scenario.primaryConsumers],
  }))
  return {
    summary: {
      matrixCode: 'duration_context_combination_regression_matrix',
      backendExposurePolicy: 'backend_admin_api_only',
      totalScenarios: scenarios.length,
      pairwiseScenarioCount: scenarios.filter((scenario) => scenario.scenarioType === 'pairwise').length,
      tripleScenarioCount: scenarios.filter((scenario) => scenario.scenarioType === 'triple').length,
    },
    scenarios,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function pushIssue(
  list: DurationContextContractValidationIssue[],
  code: string,
  path: string,
  message: string,
) {
  list.push({ code, path, message })
}

export function validateDurationContextSummaryContract(input: unknown): DurationContextContractValidationResult {
  const errors: DurationContextContractValidationIssue[] = []
  const warnings: DurationContextContractValidationIssue[] = []
  if (!isRecord(input)) {
    pushIssue(errors, 'invalid_summary_shape', '$', 'Duration context summary must be an object.')
    return { valid: false, errors, warnings }
  }

  if (input.contextVersion !== 'v1.4.7.4') {
    pushIssue(errors, 'invalid_context_version', 'contextVersion', 'Expected contextVersion v1.4.7.4.')
  }
  if (!isRecord(input.calculationContext)) {
    pushIssue(errors, 'missing_calculation_context', 'calculationContext', 'calculationContext is required for replay.')
    return { valid: false, errors, warnings }
  }

  const calculationContext = input.calculationContext
  const ledger = calculationContext.factor_contribution_ledger
  if (!Array.isArray(ledger) || ledger.length === 0) {
    pushIssue(errors, 'missing_factor_contribution_ledger', 'calculationContext.factor_contribution_ledger', 'Effective factor contribution ledger is required for replay.')
  } else {
    ledger.forEach((entry, index) => {
      const path = `calculationContext.factor_contribution_ledger[${index}]`
      if (!isRecord(entry)) {
        pushIssue(errors, 'invalid_ledger_entry_shape', path, 'Ledger entry must be an object.')
        return
      }
      if (!FACTOR_KEY_SET.has(String(entry.key ?? '') as DurationContextFactorKey)) {
        pushIssue(errors, 'invalid_factor_key', `${path}.key`, 'Ledger entry key must be one of the governed duration context factors.')
      }
      for (const field of ['multiplier', 'extraDays', 'confidenceDelta']) {
        const value = entry[field]
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          pushIssue(errors, 'invalid_ledger_number', `${path}.${field}`, 'Ledger numeric fields must be finite numbers.')
        }
      }
      if (typeof entry.extraDays === 'number' && entry.extraDays < 0) {
        pushIssue(errors, 'invalid_ledger_extra_days', `${path}.extraDays`, 'Ledger extraDays must not be negative.')
      }
      if (!ACTION_POLICIES.has(String(entry.actionPolicy ?? ''))) {
        pushIssue(errors, 'invalid_action_policy', `${path}.actionPolicy`, 'Ledger actionPolicy is not recognized.')
      }
      if (typeof entry.contributionMode !== 'string' || entry.contributionMode.trim().length === 0) {
        pushIssue(errors, 'missing_contribution_mode', `${path}.contributionMode`, 'Ledger contributionMode is required.')
      }
      if (!Array.isArray(entry.sourceEntityKeys)) {
        pushIssue(warnings, 'missing_source_entity_keys', `${path}.sourceEntityKeys`, 'sourceEntityKeys should be present for attribution and dedupe diagnostics.')
      }
    })
  }

  const explainPackage = calculationContext.explain_package
  if (!isRecord(explainPackage)) {
    pushIssue(warnings, 'missing_explain_package', 'calculationContext.explain_package', 'Explain package is recommended for backend diagnostics.')
  } else if (explainPackage.version !== 'duration_context_explain_v1') {
    pushIssue(errors, 'invalid_explain_package_version', 'calculationContext.explain_package.version', 'Explain package version must be duration_context_explain_v1.')
  }

  if (!Array.isArray(calculationContext.adjusted_by)) {
    pushIssue(warnings, 'missing_adjusted_by', 'calculationContext.adjusted_by', 'adjusted_by should be present for quick governance scans.')
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function collectDurationContextGovernanceReport(): DurationContextGovernanceReport {
  const factorConsumptionMatrix = listDurationContextFactorConsumptionMatrix()
  const factorAutomationPolicies = listDurationContextFactorAutomationPolicies()
  const nonFactorGovernanceSignals = listDurationContextNonFactorGovernanceSignals()
  const inputCoverageAudit = listDurationContextInputCoverageAudit()
  const runtimePromotionGateways = listDurationContextRuntimePromotionGateways()
  const explainPackageContract = getDurationContextExplainPackageContract()
  const effectiveContributionLedgerContract = getDurationContextEffectiveContributionLedgerContract()
  const policyLearningContract = getDurationContextPolicyLearningContract()
  const combinationStressMatrix = evaluateDurationContextCombinationStressMatrix()
  return {
    reportCode: 'duration_context_factor_governance',
    generatedAt: new Date().toISOString(),
    frontendExposurePolicy: 'backend_admin_api_only',
    summary: {
      totalFactors: factorConsumptionMatrix.length,
      directForecastConsumerCount: factorConsumptionMatrix.filter((entry) => entry.forecastDaysConsumption !== 'none' && entry.forecastDaysConsumption !== 'confidence_only').length,
      productivityConsumerCount: factorConsumptionMatrix.filter((entry) => entry.productivityConsumption !== 'none').length,
      confidenceOnlyConsumerCount: factorConsumptionMatrix.filter((entry) => entry.forecastDaysConsumption === 'confidence_only').length,
      publishedCalibrationGuardCount: factorConsumptionMatrix.filter((entry) => entry.requiresPublishedCalibrationForRuntimeOverlay).length,
      forecastOnlySubRuleCount: factorConsumptionMatrix.reduce((count, entry) => count + (entry.forecastOnlySubRules?.length ?? 0), 0),
      nonFactorGovernanceSignalCount: nonFactorGovernanceSignals.length,
      inputCoverageDomainCount: inputCoverageAudit.length,
      runtimePromotionGatewayCount: runtimePromotionGateways.length,
      attributionGovernanceEnabled: true,
      combinationStressScenarioCount: combinationStressMatrix.summary.totalScenarios,
      jsonContractValidationEnabled: true,
      autoPublishEligibleFactorCount: factorAutomationPolicies.filter((policy) => policy.runtimeAutoPublishEligible).length,
      candidateOrCanaryFactorCount: factorAutomationPolicies.filter((policy) => policy.runtimeActivationBoundary === 'candidate_or_canary_before_manual_publish').length,
      manualRuntimePromotionFactorCount: factorAutomationPolicies.filter((policy) => policy.runtimeActivationBoundary === 'manual_runtime_promotion_required').length,
      highRiskManualRuntimeFactorCount: factorAutomationPolicies.filter((policy) => policy.riskTier === 'high' && !policy.runtimeAutoPublishEligible).length,
    },
    factorConsumptionMatrix,
    factorAutomationPolicies,
    nonFactorGovernanceSignals,
    inputCoverageAudit,
    runtimePromotionGateways,
    explainPackageContract,
    effectiveContributionLedgerContract,
    policyLearningContract,
    combinationStressMatrix,
    jsonContractValidation: {
      validator: 'validateDurationContextSummaryContract',
      frontendExposurePolicy: 'backend_admin_api_only',
      requiredFields: [
        'contextVersion',
        'calculationContext',
        'calculationContext.factor_contribution_ledger',
        'calculationContext.explain_package.version',
      ],
      governedJsonObjects: [
        'factor_summary',
        'calculation_context',
        'calculationContext.factor_contribution_ledger',
        'calculationContext.explain_package',
      ],
      replayPolicy: 'reject_or_quarantine_invalid_factor_summary_before_replay_or_calibration_learning',
    },
    recommendations: [
      {
        code: 'duration_context_factor_consumption_matrix',
        priority: 'P1',
        status: 'active',
        detail: 'Keep the factor-to-consumer contract explicit so recognition signals and forecast effects cannot drift silently.',
      },
      {
        code: 'factor_automation_runtime_boundary',
        priority: 'P0',
        status: 'active',
        detail: 'Allow automated discovery, shadow replay and reporting for all factors, but restrict production runtime auto-publish to guarded low-risk factors with published-only consumption and rollback.',
      },
      {
        code: 'contextual_bandit_policy_learning_layer',
        priority: 'P1',
        status: 'active',
        detail: 'Use contextual_bandit_v1 as a backend strategy-candidate layer over deterministic factors; it may rank actions and rewards but cannot override high-risk runtime boundaries.',
      },
      {
        code: 'scope_level_productivity_distribution',
        priority: 'P1',
        status: 'active',
        detail: 'Use project, building, specialty and critical-path P distributions to avoid hiding local acceleration in monthly averages.',
      },
      {
        code: 'real_project_shadow_runnable_guard',
        priority: 'P0',
        status: 'active',
        detail: 'Run real shadow calibration only when task-level duration samples, daily snapshots and confirmed observed productivity evidence are present.',
      },
      {
        code: 'external_readiness_forecast_only_sub_rules',
        priority: 'P1',
        status: 'active',
        detail: 'Keep earliest-start, acceptance, certificate and drawing target-date impacts under external_readiness so forecast bridges do not become parallel duration factors.',
      },
      {
        code: 'project_environment_health_buffer_governance',
        priority: 'P1',
        status: 'active',
        detail: 'Keep project environment and health buffer governed through backend/admin diagnostics until it becomes a first-class runtime factor.',
      },
      {
        code: 'risk_change_runtime_promotion_gateway',
        priority: 'P1',
        status: 'active',
        detail: 'Keep risks, warnings and change logs governance-only until they are promoted into existing runtime fact tables.',
      },
      {
        code: 'duration_context_explain_package_contract',
        priority: 'P1',
        status: 'active',
        detail: 'Use the backend explain package to expose primary, companion and suppressed signals consistently across admin diagnostics.',
      },
      {
        code: 'post_run_factor_attribution',
        priority: 'P1',
        status: 'active',
        detail: 'Compare predicted top drivers with observed deviation causes after each shadow or production replay to track hit, miss and over-penalty rates.',
      },
      {
        code: 'combination_regression_matrix',
        priority: 'P1',
        status: 'active',
        detail: 'Keep pairwise and triple factor stress scenarios fixed so cross-factor changes cannot silently regress synthesis behavior.',
      },
      {
        code: 'duration_context_json_contract_validation',
        priority: 'P1',
        status: 'active',
        detail: 'Validate factor_summary, effective ledger and explain package shape before replay, calibration learning or long-term audit consumption.',
      },
    ],
  }
}
