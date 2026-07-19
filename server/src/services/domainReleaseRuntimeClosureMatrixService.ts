export type DomainReleaseRuntimeClosureAssetType =
  | 'learnable_parameter'
  | 'policy_template_entity_projection'
  | 'forecast_residual_overlay'
  | 'cold_start_baseline'
  | 'standard_work_duration_seed_runtime'
  | 'wbs_template_runtime'
  | 'construction_dependency_rule_runtime'
  | 'critical_path_rule_runtime'
  | 'metric_runtime'
  | 'seed_override_runtime'
  | 'construction_organization_plan_network'

export type DomainReleaseRuntimeClosureSurface =
  | 'asset_type_domain_writer'
  | 'runtime_consumer_verification'
  | 'impact_monitoring'
  | 'release_record'
  | 'rollback_writer_and_target'

export type DomainReleaseRuntimeClosureEvidence = {
  assetType: DomainReleaseRuntimeClosureAssetType | string
  surface: DomainReleaseRuntimeClosureSurface | string
  status: 'verified' | 'not_applicable'
  evidenceRefs?: string[]
  reason?: string
}

export type DomainReleaseRuntimeClosureMatrixInput = {
  evidence: DomainReleaseRuntimeClosureEvidence[]
}

export type DomainReleaseRuntimeClosureMatrixRow = {
  assetType: string
  surface: string
  status: 'confirmed' | 'incomplete'
  evidenceRefs: string[]
  missingReasons: string[]
}

export type DomainReleaseRuntimeClosureMatrix = {
  status: 'domain_release_runtime_closure_confirmed' | 'domain_release_runtime_closure_incomplete'
  canDeclareDomainReleaseRuntimeClosureComplete: boolean
  assetTypes: string[]
  requiredSurfaces: string[]
  rows: DomainReleaseRuntimeClosureMatrixRow[]
  boundaryPolicy: string[]
}

const CURRENT_REGISTERED_DOMAIN_RELEASE_ASSET_TYPES = [
  'learnable_parameter',
  'policy_template_entity_projection',
  'forecast_residual_overlay',
  'cold_start_baseline',
  'standard_work_duration_seed_runtime',
  'wbs_template_runtime',
  'construction_dependency_rule_runtime',
  'critical_path_rule_runtime',
  'metric_runtime',
  'seed_override_runtime',
  'construction_organization_plan_network',
] as const

const REQUIRED_DOMAIN_RELEASE_RUNTIME_CLOSURE_SURFACES = [
  'asset_type_domain_writer',
  'runtime_consumer_verification',
  'impact_monitoring',
  'release_record',
  'rollback_writer_and_target',
] as const

const DOMAIN_RELEASE_RUNTIME_CLOSURE_BOUNDARY_POLICY = [
  'domain_release_runtime_closure_matrix_is_current_registered_asset_types_only',
  'matrix_ready_is_not_future_asset_whitelist',
  'each_asset_type_must_keep_its_own_writer_consumer_monitoring_and_rollback',
  'required_runtime_closure_surfaces_must_be_verified',
  'not_applicable_surfaces_document_gaps_but_do_not_close_runtime_closure',
  'new_asset_types_or_runtime_surfaces_must_reenter_review_required',
] as const

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEvidenceRef(evidence: DomainReleaseRuntimeClosureEvidence) {
  return (evidence.evidenceRefs ?? []).some(hasText)
}

function reasonsForSurface(
  assetType: typeof CURRENT_REGISTERED_DOMAIN_RELEASE_ASSET_TYPES[number],
  surface: typeof REQUIRED_DOMAIN_RELEASE_RUNTIME_CLOSURE_SURFACES[number],
  evidence: DomainReleaseRuntimeClosureEvidence | undefined,
) {
  if (!evidence) return [`${assetType}:${surface}_evidence_required`]

  const reasons: string[] = []
  if (evidence.status !== 'verified') reasons.push(`${assetType}:${surface}_verified_status_required`)
  if (!hasEvidenceRef(evidence)) reasons.push(`${assetType}:${surface}_evidence_ref_required`)
  if (evidence.status === 'not_applicable' && !hasText(evidence.reason)) {
    reasons.push(`${assetType}:${surface}_not_applicable_requires_reason`)
  }
  return reasons
}

function verified(
  assetType: DomainReleaseRuntimeClosureAssetType,
  surface: DomainReleaseRuntimeClosureSurface,
  evidenceRefs: string[],
): DomainReleaseRuntimeClosureEvidence {
  return {
    assetType,
    surface,
    status: 'verified',
    evidenceRefs,
  }
}

function notApplicable(
  assetType: DomainReleaseRuntimeClosureAssetType,
  surface: DomainReleaseRuntimeClosureSurface,
  reason: string,
  evidenceRefs: string[],
): DomainReleaseRuntimeClosureEvidence {
  return {
    assetType,
    surface,
    status: 'not_applicable',
    reason,
    evidenceRefs,
  }
}

export function buildDomainReleaseRuntimeClosureMatrix(
  input: DomainReleaseRuntimeClosureMatrixInput,
): DomainReleaseRuntimeClosureMatrix {
  const rows = CURRENT_REGISTERED_DOMAIN_RELEASE_ASSET_TYPES.flatMap((assetType) => (
    REQUIRED_DOMAIN_RELEASE_RUNTIME_CLOSURE_SURFACES.map((surface) => {
      const evidence = input.evidence.find((item) => item.assetType === assetType && item.surface === surface)
      const missingReasons = reasonsForSurface(assetType, surface, evidence)

      return {
        assetType,
        surface,
        status: missingReasons.length > 0 ? 'incomplete' as const : 'confirmed' as const,
        evidenceRefs: evidence?.evidenceRefs ?? [],
        missingReasons,
      }
    })
  ))
  const canDeclareDomainReleaseRuntimeClosureComplete = rows.every((row) => row.status === 'confirmed')

  return {
    status: canDeclareDomainReleaseRuntimeClosureComplete
      ? 'domain_release_runtime_closure_confirmed'
      : 'domain_release_runtime_closure_incomplete',
    canDeclareDomainReleaseRuntimeClosureComplete,
    assetTypes: [...CURRENT_REGISTERED_DOMAIN_RELEASE_ASSET_TYPES],
    requiredSurfaces: [...REQUIRED_DOMAIN_RELEASE_RUNTIME_CLOSURE_SURFACES],
    rows,
    boundaryPolicy: [...DOMAIN_RELEASE_RUNTIME_CLOSURE_BOUNDARY_POLICY],
  }
}

export function buildV14223DomainReleaseRuntimeClosureMatrix(): DomainReleaseRuntimeClosureMatrix {
  return buildDomainReleaseRuntimeClosureMatrix({
    evidence: [
      verified('learnable_parameter', 'asset_type_domain_writer', [
        'server/src/services/algorithmAssetLearnableParameterReleaseExecutionService.ts writes algorithm_learnable_parameter_runtime_publications',
        'server/src/__tests__/algorithmAssetLearnableParameterReleaseExecutionService.test.ts',
      ]),
      verified('learnable_parameter', 'runtime_consumer_verification', [
        'server/src/services/algorithmAssetLearnableParameterRuntimeConsumptionService.ts gates scoped parameter publications',
        'server/src/__tests__/algorithmAssetLearnableParameterRuntimeConsumptionService.test.ts',
        'server/src/__tests__/durationSuggestionService.test.ts',
      ]),
      verified('learnable_parameter', 'impact_monitoring', [
        'server/src/jobs/algorithmAssetLearnableParameterImpactMonitoringJob.ts',
        'server/src/__tests__/algorithmAssetLearnableParameterImpactMonitoringJob.test.ts',
      ]),
      verified('learnable_parameter', 'release_record', [
        'server/migrations/197_v14223_learnable_parameter_runtime_publications.sql',
        'server/src/__tests__/v14223LearnableParameterRuntimePublicationMigration.test.ts',
      ]),
      verified('learnable_parameter', 'rollback_writer_and_target', [
        'server/src/services/algorithmAssetLearnableParameterReleaseExecutionService.ts marks parameter runtime publications rolled back',
        'server/src/__tests__/algorithmAssetLearnableParameterReleaseExecutionService.test.ts',
      ]),

      verified('policy_template_entity_projection', 'asset_type_domain_writer', [
        'server/src/services/policyTemplateReleaseExecutionService.ts writes policy_template_entity_runtime_publications',
        'server/src/__tests__/policyTemplateReleaseExecutionService.test.ts',
      ]),
      verified('policy_template_entity_projection', 'runtime_consumer_verification', [
        'server/src/services/policyTemplateEntityRuntimeProjectionService.ts reads only active runtime projections',
        'server/src/__tests__/policyTemplateReleaseExecutionService.test.ts',
      ]),
      verified('policy_template_entity_projection', 'impact_monitoring', [
        'server/src/jobs/policyTemplateReleaseImpactMonitoringJob.ts',
        'server/src/__tests__/policyTemplateReleaseImpactMonitoringJob.test.ts',
      ]),
      verified('policy_template_entity_projection', 'release_record', [
        'server/src/services/policyTemplateReleaseExecutionService.ts records release / rollback / monitoring execution events',
        'server/migrations/199_v14223_policy_template_entity_runtime_rollback_status.sql',
      ]),
      verified('policy_template_entity_projection', 'rollback_writer_and_target', [
        'server/src/services/policyTemplateReleaseExecutionService.ts marks matching template entity runtime projections runtime_rolled_back',
        'server/src/__tests__/policyTemplateReleaseExecutionService.test.ts',
      ]),

      verified('forecast_residual_overlay', 'asset_type_domain_writer', [
        'server/src/services/algorithmAssetForecastResidualOverlayService.ts writes duration_forecast_residual_overlays only',
        'server/src/__tests__/algorithmAssetForecastResidualOverlayService.test.ts',
      ]),
      verified('forecast_residual_overlay', 'runtime_consumer_verification', [
        'server/src/services/taskDurationForecastService.ts consumes only eligible non-rolled-back forecast residual overlays',
        'server/src/__tests__/algorithmAssetForecastResidualOverlayService.test.ts',
      ]),
      verified('forecast_residual_overlay', 'impact_monitoring', [
        'server/src/services/algorithmAssetForecastResidualOverlayService.ts records MAE improvement and overcompensation evidence',
        'server/src/__tests__/algorithmAssetForecastResidualOverlayService.test.ts',
      ]),
      verified('forecast_residual_overlay', 'release_record', [
        'server/migrations/200_v14223_forecast_residual_overlay_runtime_rollback.sql',
        'server/src/services/algorithmAssetGovernancePersistenceService.ts persists forecast residual overlay runtime status',
      ]),
      verified('forecast_residual_overlay', 'rollback_writer_and_target', [
        'server/src/services/algorithmAssetForecastResidualOverlayService.ts delegates rollback to forecast residual overlay runtime publication record',
        'server/src/__tests__/algorithmAssetForecastResidualOverlayService.test.ts',
      ]),

      verified('cold_start_baseline', 'asset_type_domain_writer', [
        'server/src/services/algorithmAssetColdStartBaselineService.ts writes algorithm_cold_start_baselines only',
        'server/src/__tests__/algorithmAssetColdStartBaselineService.test.ts',
      ]),
      verified('cold_start_baseline', 'runtime_consumer_verification', [
        'server/src/services/durationSuggestionService.ts consumes anonymous non-rolled-back cold-start baselines as read-only references',
        'server/src/__tests__/durationSuggestionService.test.ts',
      ]),
      verified('cold_start_baseline', 'impact_monitoring', [
        'server/src/services/algorithmAssetColdStartBaselineService.ts requires sample coverage, anonymization, single-company cap, and rollback drill evidence',
        'server/src/__tests__/algorithmAssetColdStartBaselineService.test.ts',
      ]),
      verified('cold_start_baseline', 'release_record', [
        'server/migrations/201_v14223_cold_start_baseline_runtime_rollback.sql',
        'server/src/services/algorithmAssetGovernancePersistenceService.ts persists cold-start baseline runtime publication status',
      ]),
      verified('cold_start_baseline', 'rollback_writer_and_target', [
        'server/src/services/algorithmAssetColdStartBaselineService.ts marks baseline runtime publications runtime_rolled_back',
        'server/src/__tests__/algorithmAssetColdStartBaselineService.test.ts',
      ]),

      verified('standard_work_duration_seed_runtime', 'asset_type_domain_writer', [
        'server/src/services/durationLearningRuntimeLifecycleService.ts publishes standard_work_duration_seed through the canonical writer',
        'server/src/services/durationLearningRuntimePublicationService.ts writes duration_learning_runtime_publications only',
      ]),
      verified('standard_work_duration_seed_runtime', 'runtime_consumer_verification', [
        'server/src/services/durationSuggestionService.ts resolves canonical standard_work_duration_seed publications and records trusted consumption',
        'server/src/__tests__/durationSuggestionService.test.ts',
      ]),
      verified('standard_work_duration_seed_runtime', 'impact_monitoring', [
        'server/src/services/durationLearningRuntimeLifecycleService.ts binds exact publication consumption and outcome metrics before promotion',
        'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
      ]),
      verified('standard_work_duration_seed_runtime', 'release_record', [
        'server/migrations/315_duration_learning_runtime_publications.sql',
        'server/src/__tests__/durationLearningRuntimePublicationMigrationContract.test.ts',
      ]),
      verified('standard_work_duration_seed_runtime', 'rollback_writer_and_target', [
        'server/src/services/durationLearningRuntimePublicationService.ts atomically rolls back and restores previous_publication_key',
        'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
      ]),

      verified('wbs_template_runtime', 'asset_type_domain_writer', [
        'server/src/services/durationLearningRuntimeLifecycleService.ts publishes special_work_duration_seed and wbs_reference_days through the canonical writer',
        'server/src/services/durationLearningRuntimePublicationService.ts writes duration_learning_runtime_publications only',
      ]),
      verified('wbs_template_runtime', 'runtime_consumer_verification', [
        'server/src/services/wbsTemplateGenerationService.ts resolves canonical scoped WBS learning publications before task/dependency commit',
        'server/src/services/durationLearningRuntimeConsumptionService.ts records only trusted committed consumption',
        'server/src/__tests__/wbsTemplateGenerationService.test.ts',
      ]),
      verified('wbs_template_runtime', 'impact_monitoring', [
        'server/src/services/durationLearningRuntimeLifecycleService.ts monitors exact publication, artifact, input, and committed consumption lineage',
        'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
      ]),
      verified('wbs_template_runtime', 'release_record', [
        'server/migrations/315_duration_learning_runtime_publications.sql',
        'server/src/__tests__/durationLearningRuntimePublicationMigrationContract.test.ts',
      ]),
      verified('wbs_template_runtime', 'rollback_writer_and_target', [
        'server/src/services/durationLearningRuntimePublicationService.ts atomically rolls back and restores previous_publication_key',
        'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
      ]),

      verified('construction_dependency_rule_runtime', 'asset_type_domain_writer', [
        'server/src/services/durationLearningRuntimeLifecycleService.ts publishes dependency_rule_candidate through the canonical writer',
        'server/src/services/durationLearningRuntimePublicationService.ts writes duration_learning_runtime_publications only',
      ]),
      verified('construction_dependency_rule_runtime', 'runtime_consumer_verification', [
        'server/src/services/wbsTemplateGenerationService.ts resolves canonical scoped dependency_rule_candidate publications',
        'server/src/services/durationLearningRuntimeConsumptionService.ts records exact dependency publication and artifact lineage',
      ]),
      verified('construction_dependency_rule_runtime', 'impact_monitoring', [
        'server/src/services/durationLearningRuntimeLifecycleService.ts monitors dependency outcomes against exact publication consumption',
        'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
      ]),
      verified('construction_dependency_rule_runtime', 'release_record', [
        'server/migrations/315_duration_learning_runtime_publications.sql',
        'server/src/__tests__/durationLearningRuntimePublicationMigrationContract.test.ts',
      ]),
      verified('construction_dependency_rule_runtime', 'rollback_writer_and_target', [
        'server/src/services/durationLearningRuntimePublicationService.ts atomically rolls back and restores previous_publication_key',
        'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
      ]),

      verified('critical_path_rule_runtime', 'asset_type_domain_writer', [
        'server/src/services/durationLearningRuntimeLifecycleService.ts publishes critical_path_rule_candidate through the canonical writer',
        'server/src/services/durationLearningRuntimePublicationService.ts writes duration_learning_runtime_publications only',
      ]),
      verified('critical_path_rule_runtime', 'runtime_consumer_verification', [
        'server/src/services/projectCriticalPathService.ts resolves canonical critical_path_rule_candidate publications and records exact inputs',
        'server/src/services/durationLearningRuntimeConsumptionService.ts records exact publication and artifact lineage',
      ]),
      verified('critical_path_rule_runtime', 'impact_monitoring', [
        'server/src/services/durationLearningRuntimeLifecycleService.ts attributes critical-path outcomes to exact publication, artifact, and CPM input lineage',
        'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
      ]),
      verified('critical_path_rule_runtime', 'release_record', [
        'server/migrations/315_duration_learning_runtime_publications.sql',
        'server/src/__tests__/durationLearningRuntimePublicationMigrationContract.test.ts',
      ]),
      verified('critical_path_rule_runtime', 'rollback_writer_and_target', [
        'server/src/services/durationLearningRuntimePublicationService.ts atomically rolls back and restores previous_publication_key',
        'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
      ]),

      verified('metric_runtime', 'asset_type_domain_writer', [
        'server/src/services/metricRuntimePublicationService.ts writes metric_runtime_publications and events',
        'server/src/__tests__/metricRuntimePublicationService.test.ts',
      ]),
      verified('metric_runtime', 'runtime_consumer_verification', [
        'server/src/services/metricRuntimePublicationService.ts resolves only scoped runtime_published metric publications',
        'server/src/__tests__/metricRuntimePublicationService.test.ts',
      ]),
      verified('metric_runtime', 'impact_monitoring', [
        'server/src/services/metricRuntimePublicationService.ts stores impact monitoring on metric runtime events',
        'server/src/__tests__/metricRuntimePublicationService.test.ts',
      ]),
      verified('metric_runtime', 'release_record', [
        'server/migrations/204_v14223_metric_runtime_publications.sql',
        'server/src/__tests__/metricRuntimePublicationService.test.ts',
      ]),
      verified('metric_runtime', 'rollback_writer_and_target', [
        'server/src/services/metricRuntimePublicationService.ts marks scoped metric runtime publication rows runtime_rolled_back',
        'server/src/__tests__/metricRuntimePublicationService.test.ts',
      ]),

      verified('seed_override_runtime', 'asset_type_domain_writer', [
        'server/src/services/algorithmSeedAutoGovernanceService.ts requires seed_override_domain_writer evidence before runtime write is allowed',
        'server/src/services/algorithmSeedLearningService.ts creates scoped seed override records',
        'server/src/__tests__/algorithmSeedGovernanceFlow.test.ts',
      ]),
      verified('seed_override_runtime', 'runtime_consumer_verification', [
        'server/src/services/algorithmSeedResolver.ts consumes scoped project / company overrides before system seed fallback',
        'server/src/__tests__/algorithmRuleAssetInventoryService.test.ts',
        'server/src/__tests__/algorithmSeedGovernanceFlow.test.ts',
      ]),
      verified('seed_override_runtime', 'impact_monitoring', [
        'server/src/services/algorithmSeedLearningService.ts recordAlgorithmSeedOverrideImpactMonitoring records scoped override monitoring evidence and delegates failed monitoring to scoped rollback',
        'server/src/__tests__/algorithmSeedGovernanceFlow.test.ts records seed override impact monitoring and rolls back only the scoped override when monitoring fails',
      ]),
      verified('seed_override_runtime', 'release_record', [
        'server/src/services/algorithmSeedLearningService.ts writes scoped algorithm_seed_overrides records',
        'server/src/__tests__/algorithmSeedGovernanceFlow.test.ts',
      ]),
      verified('seed_override_runtime', 'rollback_writer_and_target', [
        'server/src/services/algorithmSeedLearningService.ts rollbackAlgorithmSeedOverrideRuntimePublication marks only scoped algorithm_seed_overrides inactive with rollback target evidence',
        'server/src/__tests__/algorithmSeedGovernanceFlow.test.ts',
      ]),

      verified('construction_organization_plan_network', 'asset_type_domain_writer', [
        'server/src/services/constructionOrganizationPlanNetworkDomainWriter.ts applies approved construction organization plan-network drafts to task_dependencies with source_type=construction_organization_plan_network',
        'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
      ]),
      verified('construction_organization_plan_network', 'runtime_consumer_verification', [
        'server/src/services/constructionOrganizationPlanNetworkDraftService.ts reads runtime_consumer_observations for asset_key=construction_organization_plan_network',
        'server/src/__tests__/constructionOrganizationPlanNetworkDraftService.test.ts',
      ]),
      verified('construction_organization_plan_network', 'impact_monitoring', [
        'server/src/services/constructionOrganizationPlanNetworkRuntimeEvidenceService.ts records construction_organization_plan_network runtime impact_monitoring events',
        'server/src/__tests__/constructionOrganizationPlanNetworkRuntimeEvidenceService.test.ts',
      ]),
      verified('construction_organization_plan_network', 'release_record', [
        'server/src/services/constructionOrganizationPlanNetworkDomainWriter.ts persists construction_organization_plan_network_runtime_publications release records',
        'server/migrations/231_v14225_construction_organization_plan_network_runtime_publications.sql',
      ]),
      verified('construction_organization_plan_network', 'rollback_writer_and_target', [
        'server/src/services/constructionOrganizationPlanNetworkRuntimeEvidenceService.ts records rollback_execution verification for construction organization plan-network publications',
        'server/src/services/constructionOrganizationPlanNetworkDomainWriter.ts records rollback targets on construction_organization_plan_network_runtime_publications',
      ]),
    ],
  })
}
