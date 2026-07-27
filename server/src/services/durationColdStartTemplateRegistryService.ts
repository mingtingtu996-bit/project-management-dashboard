import {
  T2_DIVISION_RHYTHM_TEMPLATE_SEED,
  auditT2DivisionRhythmTemplateRegistry,
} from './t2DivisionRhythmTemplateRegistryService.js'
import { listExperienceTierRegistry, type ExperienceTier } from './experienceTierRegistryService.js'

export type DurationColdStartTemplateFamily =
  | 't2_division_rhythm_template'
  | 'wbs_standard_decomposition_template'
  | 'cpm_standard_dependency_network'
  | 'construction_organization_abc_profile'
  | 't3_project_efficiency_model'
  | 's_curve_state_model'
  | 'condition_factor_adjustment_template'
  | 'calendar_resource_capacity_template'
  | 'external_progress_knowledge_template'
  | 'historical_project_deposition_template'

export type DurationColdStartTemplateAssetGovernanceStatus =
  | 'registered_read_only_asset_view'
  | 'compatibility_receipt_required'
  | 'registry_adapter_missing'

export type DurationColdStartTemplateAssetRow = {
  templateId: string
  family: DurationColdStartTemplateFamily
  sourceType: string
  tier: ExperienceTier | 'not_tiered_yet'
  reuseScope: string
  businessType: string[]
  spatialScope: string[]
  maturity: string
  confidence: string
  governanceStatus: DurationColdStartTemplateAssetGovernanceStatus
  sourceRefs: string[]
  noWriteReceiptRefs: string[]
  missingReadinessReasons: string[]
  canAutoApply: false
  mutationBoundary: {
    readsRuntimeReader: false
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

export type DurationColdStartTemplateAssetView = {
  viewCode: 'duration_cold_start_template_asset_view'
  status: 'non_live_template_asset_view_ready'
  summary: {
    rowCount: number
    t2TemplateRowCount: number
    nonT2FamilyRowCount: number
    gapRowCount: number
    canDeclareNonLiveTemplateAssetViewClosed: boolean
  }
  rows: DurationColdStartTemplateAssetRow[]
  tierRegistryRefs: string[]
  t2RegistryAudit: ReturnType<typeof auditT2DivisionRhythmTemplateRegistry>
  liveOnlyBlockers: string[]
  boundaryPolicy: string[]
}

const NO_WRITE_MUTATION_BOUNDARY = {
  readsRuntimeReader: false,
  writesTaskDependencies: false,
  writesPlanDates: false,
  writesSeed: false,
  writesBaseline: false,
  writesRuntimePublications: false,
} as const

const NON_T2_FAMILY_ROWS: DurationColdStartTemplateAssetRow[] = [
  {
    templateId: 'wbs-standard-decomposition-template-family',
    family: 'wbs_standard_decomposition_template',
    sourceType: 'governed_catalog_family',
    tier: 'not_tiered_yet',
    reuseScope: 'industry/company/project',
    businessType: ['covered_by_businessTypeRegistry'],
    spatialScope: ['covered_by_spatialSemanticDictionary'],
    maturity: 'catalog_available_receipt_required',
    confidence: 'medium',
    governanceStatus: 'compatibility_receipt_required',
    sourceRefs: ['server/src/services/wbsTemplateGenerationService.ts', 'server/src/services/wbsSeedSemanticGovernanceService.ts'],
    noWriteReceiptRefs: ['businessSpatialWbsConsumerCoverageMatrixService'],
    missingReadinessReasons: ['full_family_runtime_receipt_not_archived', 'live_generation_replay_not_closed'],
    canAutoApply: false,
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    templateId: 'cpm-standard-dependency-network-family',
    family: 'cpm_standard_dependency_network',
    sourceType: 'governed_rule_family',
    tier: 'not_tiered_yet',
    reuseScope: 'industry/company/project',
    businessType: ['all_registered_business_types'],
    spatialScope: ['dependency_window_scope'],
    maturity: 'compatibility_gate_available',
    confidence: 'medium',
    governanceStatus: 'compatibility_receipt_required',
    sourceRefs: ['server/src/services/templateAssemblyCompatibilityCheckService.ts', 'server/src/services/constructionDependencyRuleSystemService.ts'],
    noWriteReceiptRefs: ['c1915aTemplateAssemblyContract.test.ts', 'templateAssemblyCompatibilityCheckService.test.ts'],
    missingReadinessReasons: ['full_cpm_family_receipt_not_archived', 'e3_runtime_evidence_not_closed'],
    canAutoApply: false,
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    templateId: 'construction-organization-abc-profile-family',
    family: 'construction_organization_abc_profile',
    sourceType: 'candidate_profile_family',
    tier: 'T3',
    reuseScope: 'company/project',
    businessType: ['all_registered_business_types'],
    spatialScope: ['project_level', 'building', 'zone'],
    maturity: 'candidate_only_runtime_apply_gated',
    confidence: 'medium',
    governanceStatus: 'compatibility_receipt_required',
    sourceRefs: ['server/src/services/constructionOrganizationScenarioGovernanceService.ts'],
    noWriteReceiptRefs: ['constructionOrganizationScenarioGovernanceService.test.ts'],
    missingReadinessReasons: ['manual_conflict_review_not_closed', 'runtime_apply_not_closed'],
    canAutoApply: false,
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    templateId: 't3-project-efficiency-model-family',
    family: 't3_project_efficiency_model',
    sourceType: 'candidate_model_family',
    tier: 'T3',
    reuseScope: 'company/project',
    businessType: ['all_registered_business_types'],
    spatialScope: ['project_level'],
    maturity: 'registry_adapter_pending',
    confidence: 'low',
    governanceStatus: 'registry_adapter_missing',
    sourceRefs: ['server/src/services/projectProductivityCalibrationService.ts'],
    noWriteReceiptRefs: ['durationArchitectureBoundaryGuard.test.ts'],
    missingReadinessReasons: ['template_asset_adapter_not_promoted_to_runtime_registry', 'live_replay_not_closed'],
    canAutoApply: false,
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    templateId: 's-curve-state-model-family',
    family: 's_curve_state_model',
    sourceType: 'candidate_model_family',
    tier: 'T3',
    reuseScope: 'company/project',
    businessType: ['all_registered_business_types'],
    spatialScope: ['project_level'],
    maturity: 'registry_adapter_pending',
    confidence: 'low',
    governanceStatus: 'registry_adapter_missing',
    sourceRefs: ['server/src/services/progressVelocityLearningService.ts'],
    noWriteReceiptRefs: ['progressVelocityLearningService.test.ts'],
    missingReadinessReasons: ['s_curve_template_receipt_not_archived', 'runtime_consumer_not_closed'],
    canAutoApply: false,
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    templateId: 'condition-factor-adjustment-template-family',
    family: 'condition_factor_adjustment_template',
    sourceType: 'factor_policy_family',
    tier: 'not_tiered_yet',
    reuseScope: 'industry/company/project',
    businessType: ['all_registered_business_types'],
    spatialScope: ['project_level', 'phase_window'],
    maturity: 'governed_factor_contract_available',
    confidence: 'medium',
    governanceStatus: 'compatibility_receipt_required',
    sourceRefs: ['server/src/services/durationContextFactorSynthesisService.ts', 'server/src/services/durationContextGovernanceService.ts'],
    noWriteReceiptRefs: ['durationContextPolicyParameterLearningService.test.ts'],
    missingReadinessReasons: ['factor_template_family_receipt_not_archived', 'canary_publication_not_closed'],
    canAutoApply: false,
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    templateId: 'calendar-resource-capacity-template-family',
    family: 'calendar_resource_capacity_template',
    sourceType: 'calendar_resource_policy_family',
    tier: 'not_tiered_yet',
    reuseScope: 'industry/company/project',
    businessType: ['all_registered_business_types'],
    spatialScope: ['workface', 'calendar_window'],
    maturity: 'evidence_required',
    confidence: 'medium',
    governanceStatus: 'compatibility_receipt_required',
    sourceRefs: ['server/src/services/t2RhythmProductionCapacityEvidenceService.ts', 'server/src/services/constructionCalendar.ts'],
    noWriteReceiptRefs: ['c1915aTemplateAssemblyContract.test.ts'],
    missingReadinessReasons: ['real_resource_capacity_evidence_not_archived', 'live_calendar_readback_not_closed'],
    canAutoApply: false,
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    templateId: 'external-progress-knowledge-template-family',
    family: 'external_progress_knowledge_template',
    sourceType: 'external_candidate_family',
    tier: 'not_tiered_yet',
    reuseScope: 'industry',
    businessType: ['all_registered_business_types'],
    spatialScope: ['project_level', 'phase_window'],
    maturity: 'candidate_review_only',
    confidence: 'low',
    governanceStatus: 'registry_adapter_missing',
    sourceRefs: ['docs/plans/v1.4.22.5外部进度知识源与工期资产自动发布专项方案.md'],
    noWriteReceiptRefs: ['progress knowledge candidate governance docs'],
    missingReadinessReasons: ['source_verification_publication_readiness_not_closed', 'runtime_writer_gate_not_closed'],
    canAutoApply: false,
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    templateId: 'historical-project-deposition-template-family',
    family: 'historical_project_deposition_template',
    sourceType: 'historical_sample_family',
    tier: 'not_tiered_yet',
    reuseScope: 'company/project',
    businessType: ['all_registered_business_types'],
    spatialScope: ['project_level', 'phase_window', 'workface'],
    maturity: 'read_model_available_live_replay_required',
    confidence: 'medium',
    governanceStatus: 'compatibility_receipt_required',
    sourceRefs: ['server/src/services/t2RhythmDurationExperienceReplayReadModelService.ts'],
    noWriteReceiptRefs: ['t2RhythmDurationExperienceReplayReadModelService.test.ts'],
    missingReadinessReasons: ['live_duration_experience_replay_not_closed', 'publication_exit_not_closed'],
    canAutoApply: false,
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
]

function cloneRow(row: DurationColdStartTemplateAssetRow): DurationColdStartTemplateAssetRow {
  return {
    ...row,
    businessType: [...row.businessType],
    spatialScope: [...row.spatialScope],
    sourceRefs: [...row.sourceRefs],
    noWriteReceiptRefs: [...row.noWriteReceiptRefs],
    missingReadinessReasons: [...row.missingReadinessReasons],
    mutationBoundary: { ...row.mutationBoundary },
  }
}

function buildT2Rows(): DurationColdStartTemplateAssetRow[] {
  return T2_DIVISION_RHYTHM_TEMPLATE_SEED.map((template) => ({
    templateId: template.templateId,
    family: 't2_division_rhythm_template',
    sourceType: template.sourceType,
    tier: template.tier,
    reuseScope: template.reuseScope,
    businessType: [...template.applicability.businessTypeCodes].sort(),
    spatialScope: [...template.applicability.requiredScopeDimensions].sort(),
    maturity: template.maturity,
    confidence: template.confidence,
    governanceStatus: 'registered_read_only_asset_view',
    sourceRefs: [...template.sourceRefs],
    noWriteReceiptRefs: [
      't2DivisionRhythmTemplateRegistryService.auditT2DivisionRhythmTemplateRegistry',
      't2DivisionRhythmTemplateRegistryService.buildT2RhythmScheduleCandidatePackage',
      'templateAssemblyCompatibilityCheckService',
    ],
    missingReadinessReasons: [
      'archived_live_replay_required_before_publication',
      'l5_release_gate_required_before_runtime_consumption',
      'runtime_publication_impact_monitoring_rollback_required',
    ],
    canAutoApply: false,
    mutationBoundary: { ...NO_WRITE_MUTATION_BOUNDARY },
  }))
}

export function listDurationColdStartTemplateAssetView(): DurationColdStartTemplateAssetView {
  const t2Rows = buildT2Rows()
  const nonT2Rows = NON_T2_FAMILY_ROWS.map(cloneRow)
  const rows = [...t2Rows, ...nonT2Rows]
  const gapRows = rows.filter((row) => row.governanceStatus !== 'registered_read_only_asset_view')
  const t2RegistryAudit = auditT2DivisionRhythmTemplateRegistry()

  return {
    viewCode: 'duration_cold_start_template_asset_view',
    status: 'non_live_template_asset_view_ready',
    summary: {
      rowCount: rows.length,
      t2TemplateRowCount: t2Rows.length,
      nonT2FamilyRowCount: nonT2Rows.length,
      gapRowCount: gapRows.length,
      canDeclareNonLiveTemplateAssetViewClosed: true,
    },
    rows,
    tierRegistryRefs: listExperienceTierRegistry().map((entry) => `${entry.tier}:${entry.allowedAssetTypes.join(',')}`),
    t2RegistryAudit,
    liveOnlyBlockers: [
      'all_template_family_live_replay_not_closed',
      'l5_release_gate_not_closed',
      'runtime_publication_not_closed',
      'runtime_consumer_observation_not_archived',
      'impact_monitoring_and_rollback_not_closed',
    ],
    boundaryPolicy: [
      'read_only_asset_view_only',
      'non_t2_family_gap_rows_are_explicit_not_fake_green',
      'asset_view_closed_does_not_grant_runtime_publication',
      'no_task_dependency_plan_date_seed_baseline_or_runtime_publication_writes',
    ],
  }
}
