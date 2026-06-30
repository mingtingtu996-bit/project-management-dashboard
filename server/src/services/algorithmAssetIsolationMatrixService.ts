export type AlgorithmAssetIsolationSurface =
  | 'dashboard_summary'
  | 'runtime_writer'
  | 'runtime_consumer'
  | 'runtime_cache'
  | 'async_job'
  | 'rollback_writer'

export type AlgorithmAssetIsolationEvidenceStatus =
  | 'verified'
  | 'not_applicable'

export type AlgorithmAssetIsolationEvidence = {
  surface: AlgorithmAssetIsolationSurface | string
  status: AlgorithmAssetIsolationEvidenceStatus
  companyOrProjectScoped?: boolean
  reason?: string
  evidenceRefs?: string[]
}

export type AlgorithmAssetIsolationAsset = {
  assetKey: string
  assetType: string
  scopeType: 'project' | 'company' | 'system' | string
  evidence: AlgorithmAssetIsolationEvidence[]
}

export type AlgorithmAssetIsolationMatrixInput = {
  assets: AlgorithmAssetIsolationAsset[]
}

export type AlgorithmAssetIsolationMatrixRow = {
  assetKey: string
  assetType: string
  scopeType: string
  status: 'confirmed' | 'incomplete'
  missingReasons: string[]
}

export type AlgorithmAssetIsolationMatrix = {
  status: 'isolation_matrix_confirmed' | 'isolation_matrix_incomplete'
  canDeclareAssetIsolationComplete: boolean
  requiredSurfaces: string[]
  rows: AlgorithmAssetIsolationMatrixRow[]
}

const REQUIRED_RUNTIME_SURFACES = [
  'runtime_writer',
  'runtime_consumer',
  'runtime_cache',
  'async_job',
  'rollback_writer',
] as const

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEvidenceRef(evidence: AlgorithmAssetIsolationEvidence) {
  return (evidence.evidenceRefs ?? []).some(hasText)
}

function reasonsForSurface(
  surface: typeof REQUIRED_RUNTIME_SURFACES[number],
  evidence: AlgorithmAssetIsolationEvidence | undefined,
) {
  if (!evidence) return [`${surface}_isolation_required`]

  const reasons: string[] = []
  if (!hasEvidenceRef(evidence)) reasons.push(`${surface}_evidence_ref_required`)

  if (evidence.status === 'not_applicable') {
    if (!hasText(evidence.reason)) reasons.push(`${surface}_not_applicable_requires_reason`)
    return reasons
  }

  if (!evidence.companyOrProjectScoped) reasons.push(`${surface}_scope_isolation_required`)
  return reasons
}

export function buildAlgorithmAssetIsolationMatrix(
  input: AlgorithmAssetIsolationMatrixInput,
): AlgorithmAssetIsolationMatrix {
  const rows = input.assets.map((asset) => ({
    assetKey: asset.assetKey,
    assetType: asset.assetType,
    scopeType: asset.scopeType,
    missingReasons: REQUIRED_RUNTIME_SURFACES.flatMap((surface) => reasonsForSurface(
      surface,
      asset.evidence.find((evidence) => evidence.surface === surface),
    )),
  })).map((row) => ({
    ...row,
    status: row.missingReasons.length > 0 ? 'incomplete' as const : 'confirmed' as const,
  }))
  const canDeclareAssetIsolationComplete = rows.length > 0
    && rows.every((row) => row.status === 'confirmed')

  return {
    status: canDeclareAssetIsolationComplete
      ? 'isolation_matrix_confirmed'
      : 'isolation_matrix_incomplete',
    canDeclareAssetIsolationComplete,
    requiredSurfaces: [...REQUIRED_RUNTIME_SURFACES],
    rows,
  }
}

function scoped(surface: AlgorithmAssetIsolationSurface, evidenceRefs: string[]): AlgorithmAssetIsolationEvidence {
  return {
    surface,
    status: 'verified',
    companyOrProjectScoped: true,
    evidenceRefs,
  }
}

function notApplicable(
  surface: AlgorithmAssetIsolationSurface,
  reason: string,
  evidenceRefs: string[],
): AlgorithmAssetIsolationEvidence {
  return {
    surface,
    status: 'not_applicable',
    reason,
    evidenceRefs,
  }
}

export function buildV14223RuntimeAssetIsolationMatrix(): AlgorithmAssetIsolationMatrix {
  return buildAlgorithmAssetIsolationMatrix({
    assets: [
      {
        assetKey: 'algorithm.learnable_parameter.runtime_publication',
        assetType: 'learnable_parameter_publication',
        scopeType: 'company',
        evidence: [
          scoped('runtime_writer', ['algorithmAssetLearnableParameterReleaseExecutionService']),
          scoped('runtime_consumer', ['algorithmAssetLearnableParameterRuntimeConsumptionService']),
          notApplicable(
            'runtime_cache',
            'parameter publication consumers read committed scoped publication rows without a shared runtime cache',
            ['algorithmAssetLearnableParameterRuntimeConsumptionService'],
          ),
          scoped('async_job', ['algorithmAssetLearnableParameterImpactMonitoringJob']),
          scoped('rollback_writer', ['executeAlgorithmAssetLearnableParameterRuntimeRollback']),
        ],
      },
      {
        assetKey: 'policy_template.entity_runtime_publication',
        assetType: 'policy_template_runtime_projection',
        scopeType: 'system',
        evidence: [
          scoped('runtime_writer', ['policyTemplateReleaseExecutionService writes policy_template_entity_runtime_publications']),
          scoped('runtime_consumer', [
            'certificateTemplatePolicyAutoPublishE2E.test.ts',
            'acceptanceTemplatePolicyAutoPublishE2E.test.ts',
          ]),
          notApplicable(
            'runtime_cache',
            'template preview reads committed runtime projection records rather than a shared runtime cache',
            ['policy_template_entity_runtime_publications'],
          ),
          scoped('async_job', ['policyTemplateReleaseImpactMonitoringJob']),
          scoped('rollback_writer', ['policyTemplateReleaseExecutionService disables runtime projection on rollback']),
        ],
      },
      {
        assetKey: 'duration.forecast.residual_overlay',
        assetType: 'forecast_residual_overlay',
        scopeType: 'company',
        evidence: [
          scoped('runtime_writer', ['persistAlgorithmAssetForecastResidualOverlayEvaluation']),
          scoped('runtime_consumer', ['taskDurationForecastService excludes cross-company and rolled-back overlays']),
          scoped('runtime_cache', ['forecast overlay lookup cache includes company/project scope']),
          scoped('async_job', ['forecast residual monitoring payload carries company/project scope']),
          scoped('rollback_writer', ['rollbackAlgorithmAssetForecastResidualOverlayRuntimePublication']),
        ],
      },
      {
        assetKey: 'duration.cold_start.shared_baseline',
        assetType: 'cold_start_baseline',
        scopeType: 'system',
        evidence: [
          scoped('runtime_writer', ['persistAlgorithmAssetColdStartBaseline enforces anonymous multi-company scope']),
          scoped('runtime_consumer', ['durationSuggestionService excludes cross-company details and rolled-back baseline']),
          scoped('runtime_cache', ['cold-start baseline cache keys include segment/system scope']),
          scoped('async_job', ['cold-start refresh job payload carries segment/system scope']),
          scoped('rollback_writer', ['rollbackAlgorithmAssetColdStartBaselineRuntimePublicationRecord']),
        ],
      },
      {
        assetKey: 'standard_work_duration.seed_version_runtime',
        assetType: 'standard_work_duration_seed_runtime',
        scopeType: 'system',
        evidence: [
          scoped('runtime_writer', ['standardWorkDurationSeedPublicationService writes standard_work_duration seed versions and records only']),
          scoped('runtime_consumer', ['durationSuggestionService records algorithm_seed_versions runtime consumer observations for active standard work duration seeds']),
          scoped('runtime_cache', ['standardWorkDurationSeedPublicationService clears algorithmSeedResolver standard_work_duration cache after publication']),
          notApplicable(
            'async_job',
            'standard work duration seed publication is a release-exit writer; replay and candidate jobs create readiness evidence but do not write runtime rows asynchronously',
            ['standardWorkDurationSeedPublicationService', 'standardWorkDurationSeedReplayCandidateBridgeService'],
          ),
          scoped('rollback_writer', ['rollbackStandardWorkDurationSeedVersion restores only the previous standard_work_duration seed version pointer']),
        ],
      },
      {
        assetKey: 'wbs.template.runtime',
        assetType: 'wbs_template_runtime',
        scopeType: 'company',
        evidence: [
          scoped('runtime_writer', ['wbsTemplateRuntimePublicationService.persistWbsTemplateRuntimePublication']),
          scoped('runtime_consumer', ['wbsTemplateRuntimePublicationService.resolveWbsTemplateRuntimePublication filters company scope and excludes runtime_rolled_back publications']),
          notApplicable(
            'runtime_cache',
            'WBS template runtime consumers read committed publication rows directly; no shared runtime cache is introduced',
            ['wbs_template_runtime_publications'],
          ),
          notApplicable(
            'async_job',
            'WBS candidate and golden benchmark replay paths remain governance/report-only; runtime publication records scoped impact monitoring metadata and events without adding an asynchronous runtime writer',
            [
              'wbsTemplateCandidateEventService candidate_only',
              'wbsTemplateGoldenBenchmarkReplayService report_only',
              'wbsTemplateRuntimePublicationService persists wbs_template_runtime_events',
            ],
          ),
          scoped('rollback_writer', ['wbsTemplateRuntimePublicationService.executeWbsTemplateRuntimeRollback']),
        ],
      },
      {
        assetKey: 'dependency.rule.runtime',
        assetType: 'dependency_rule_runtime',
        scopeType: 'company',
        evidence: [
          scoped('runtime_writer', ['constructionDependencyRuleRuntimePublicationService.persistConstructionDependencyRuleRuntimePublication']),
          scoped('runtime_consumer', ['constructionDependencyRuleRuntimePublicationService.resolveConstructionDependencyRuleRuntimePublication excludes runtime_rolled_back publications']),
          notApplicable(
            'runtime_cache',
            'dependency rule runtime consumers read committed publication rows directly; no shared runtime cache is introduced',
            ['construction_dependency_rule_runtime_publications'],
          ),
          notApplicable(
            'async_job',
            'dependency replay remains report-only; runtime publication stores scoped impact monitoring metadata and events without adding an asynchronous runtime writer',
            [
              'constructionDependencyReplayCalibrationJob report_only',
              'constructionDependencyRuleRuntimePublicationService persists construction_dependency_rule_runtime_events',
            ],
          ),
          scoped('rollback_writer', ['constructionDependencyRuleRuntimePublicationService.executeConstructionDependencyRuleRuntimeRollback']),
        ],
      },
      {
        assetKey: 'critical_path.rule_runtime',
        assetType: 'critical_path_rule_runtime',
        scopeType: 'company',
        evidence: [
          scoped('runtime_writer', ['criticalPathRuleRuntimePublicationService.persistCriticalPathRuleRuntimePublication']),
          scoped('runtime_consumer', [
            'criticalPathRuleRuntimePublicationService.resolveCriticalPathRuleRuntimePublication excludes non-critical and runtime_rolled_back publications',
            'projectRemainingDurationForecastService and scheduleAccelerationRuntimeService record critical_path_rule_candidate runtime observations',
          ]),
          notApplicable(
            'runtime_cache',
            'critical-path rule runtime consumers read committed scoped publication rows directly; no shared runtime cache is introduced',
            ['construction_dependency_rule_runtime_publications publication_key critical_path_rule_runtime:*'],
          ),
          notApplicable(
            'async_job',
            'critical-path projection and publication readiness create evidence; runtime publication stores scoped monitoring metadata and events without adding an asynchronous runtime writer',
            [
              'projectCriticalPathService critical_path_rule_candidate outcome writer',
              'criticalPathRuleRuntimePublicationService persists construction_dependency_rule_runtime_events',
            ],
          ),
          scoped('rollback_writer', ['criticalPathRuleRuntimePublicationService.executeCriticalPathRuleRuntimeRollback']),
        ],
      },
      {
        assetKey: 'seed.override.runtime',
        assetType: 'algorithm_seed_override',
        scopeType: 'company',
        evidence: [
          scoped('runtime_writer', ['createAlgorithmSeedOverride validates project/company scope and deactivates only same-scope active override']),
          scoped('runtime_consumer', ['algorithmSeedResolver scoped override lookup']),
          scoped('runtime_cache', ['algorithmSeedResolver cache key includes seedType/projectId/companyId and is cleared after override writes']),
          notApplicable(
            'async_job',
            'seed override runtime is consumed synchronously by algorithmSeedResolver; candidate discovery jobs only create candidates and do not consume override runtime',
            ['algorithmSeedResolver', 'algorithmSeedCandidateDiscoveryJob'],
          ),
          scoped('rollback_writer', ['rollbackAlgorithmSeedOverrideRuntimePublication disables same-scope active override and resolver excludes inactive overrides']),
        ],
      },
      {
        assetKey: 'sample_health.production_consumption',
        assetType: 'sample_health',
        scopeType: 'company',
        evidence: [
          scoped('runtime_writer', ['algorithmAssetSampleHealthService writes algorithm_sample_health_events']),
          scoped('runtime_consumer', [
            'algorithmAssetGovernanceDashboardEvidenceService reads company-scoped sample health summary',
            'RuleAssetGovernanceWorkbenchAdmin displays sample health gaps as read-only evidence',
          ]),
          notApplicable(
            'runtime_cache',
            'sample health production consumption is read from committed governance evidence rows without a shared runtime cache',
            ['algorithmAssetGovernanceDashboardEvidenceService'],
          ),
          notApplicable(
            'async_job',
            'domain production adapters write sample health evidence synchronously; no background runtime consumer is required',
            ['businessCompletionSampleHealthAdapterService'],
          ),
          notApplicable(
            'rollback_writer',
            'sample health events are immutable evidence records; invalid samples are superseded by new evidence rather than runtime rollback',
            ['algorithm_sample_health_events'],
          ),
        ],
      },
      {
        assetKey: 'unknown_scope.candidate_governance',
        assetType: 'unknown_scope_candidate',
        scopeType: 'system_observation',
        evidence: [
          notApplicable(
            'runtime_writer',
            'unknown-scope candidates are normalized to system_observation and candidate_only; they cannot write company, project, system seed, parameter, template, overlay or business runtime rows',
            ['algorithmAssetCandidateEventAdapterService missing_scope_defaults_to_system_observation'],
          ),
          notApplicable(
            'runtime_consumer',
            'runtime consumers read scoped publications or scoped override rows, not unknown-scope candidate events',
            [
              'algorithmAssetCandidateEventAdapterService candidate_only',
              'algorithmAssetLearnableParameterRuntimeConsumptionService',
              'algorithmSeedResolver scoped override lookup',
            ],
          ),
          notApplicable(
            'runtime_cache',
            'unknown-scope candidates are governance observations and do not populate runtime cache keys',
            ['algorithmAssetCandidateEventAdapterService eventKey no_company:no_project'],
          ),
          notApplicable(
            'async_job',
            'candidate discovery jobs may create governance observations but do not consume unknown-scope candidates as runtime inputs',
            ['algorithmSeedCandidateDiscoveryJob creates candidates only'],
          ),
          notApplicable(
            'rollback_writer',
            'unknown-scope candidates have no runtime publication to roll back; publication requires scoped writer evidence first',
            ['algorithmAssetPromotionRollbackGateService requires domain writer and consumer verification'],
          ),
        ],
      },
    ],
  })
}
