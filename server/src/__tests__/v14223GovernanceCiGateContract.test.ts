import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()
const workflowContractGateCommand = 'npm run verify:workflow-contract'
const requiredWorkflowContractGateTests = [
  'src/__tests__/deployWorkflowContract.test.ts',
  'src/__tests__/v14223GovernanceCiGateContract.test.ts',
  'src/__tests__/v14231EvidenceArtifactIndexService.test.ts',
  'src/__tests__/productionReadyClaimsGuard.test.ts',
]
const requiredV14231CloseoutTests = [
  'src/__tests__/v14231CapabilityStatusContract.test.ts',
  'src/__tests__/v14231EvidenceArtifactIndexService.test.ts',
  'src/__tests__/legacyObjectDropGuardService.test.ts',
  'src/__tests__/migrationProductionGovernanceService.test.ts',
  'src/__tests__/t2RhythmLiveReplayDiagnostic.test.ts',
  'src/__tests__/diagnoseConstructionOrganizationCloseoutLive.test.ts',
  'src/__tests__/durationSuggestionSimulation.test.ts',
  'src/__tests__/productionReadyClaimsGuard.test.ts',
]

const requiredGateTestFiles = [
  'server/src/__tests__/algorithmRuleAssetInventoryService.test.ts',
  'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts',
  'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts',
  'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts',
  'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts',
  'server/src/__tests__/algorithmAssetCandidateEventAdapterService.test.ts',
  'server/src/__tests__/dataQualityRoutes.test.ts',
  'server/src/__tests__/dataQualityService.settings.test.ts',
  'server/src/__tests__/taskStatusDerivationService.test.ts',
  'server/src/__tests__/notificationTouchpointService.test.ts',
  'server/src/__tests__/materialArrivalReminderService.test.ts',
  'server/src/__tests__/deletionRetentionGovernanceService.test.ts',
  'server/src/__tests__/deletionRetentionAntiBypass.test.ts',
  'server/src/__tests__/algorithmAssetConflictService.test.ts',
  'server/src/__tests__/algorithmAssetExplanationChainService.test.ts',
  'server/src/__tests__/algorithmAssetReplayService.test.ts',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts',
  'server/src/__tests__/algorithmAssetPromotionRollbackGateService.test.ts',
  'server/src/__tests__/policyTemplateReleaseAdapterService.test.ts',
  'server/src/__tests__/policyTemplateReleaseExecutionService.test.ts',
  'server/src/__tests__/policyTemplateReleaseImpactMonitoringJob.test.ts',
  'server/src/__tests__/certificateTemplatePolicyUpdateService.test.ts',
  'server/src/__tests__/certificateTemplatePolicyUpdatePersistence.test.ts',
  'server/src/__tests__/certificateTemplatePolicyAutomationQuality.test.ts',
  'server/src/__tests__/acceptanceTemplatePolicyUpdatePersistence.test.ts',
  'server/src/__tests__/acceptanceTemplatePolicyAutomationQuality.test.ts',
  'server/src/__tests__/algorithmAssetIsolationMatrixService.test.ts',
  'server/src/__tests__/algorithmAssetGovernanceDashboardEvidenceService.test.ts',
  'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts',
  'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts',
  'server/src/__tests__/metricProductionSnapshotPublicationRollbackMatrixService.test.ts',
  'server/src/__tests__/metricConsumerPathCoverageMatrixService.test.ts',
  'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts',
  'server/src/__tests__/operableGovernanceFrontendMatrixService.test.ts',
  'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts',
  'server/src/__tests__/crossScopeReplayEvidenceMatrixService.test.ts',
  'server/src/__tests__/algorithmAssetGovernanceWorkbenchReadinessService.test.ts',
  'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
  'server/src/__tests__/algorithmSeedRoutes.test.ts',
  'server/src/__tests__/algorithmSeedGovernanceFlow.test.ts',
  'server/src/__tests__/taskDtoService.test.ts',
  'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
  'server/src/__tests__/durationPrecisionGovernanceBoundaryService.test.ts',
  'server/src/__tests__/v14223AlgorithmAssetGovernancePersistenceMigration.test.ts',
  'server/src/__tests__/wbsTemplateRuntimePublicationService.test.ts',
  'server/src/__tests__/constructionDependencyRuleRuntimePublicationService.test.ts',
  'server/src/__tests__/metricRuntimePublicationService.test.ts',
  'server/src/__tests__/durationLiveLearningProductionEvidenceReaderService.test.ts',
  'server/src/__tests__/baseDurationBenchmarkLiveLearningEvidenceService.test.ts',
  'server/src/__tests__/durationLiveLearningClosureService.test.ts',
  'server/src/__tests__/durationLiveLearningProductionEvidenceGateService.test.ts',
  'server/src/__tests__/durationRuntimeConsumerBusinessPathIntegrationAuditService.test.ts',
  'server/src/__tests__/durationRuntimeConsumerObservationAdapterService.test.ts',
  'server/src/__tests__/durationRuntimeConsumerObservationRuntimeCallAuditService.test.ts',
  'server/src/__tests__/durationFactLayerAcceptanceService.test.ts',
  'server/src/__tests__/durationLiveLearningCompletionAuditService.test.ts',
  'server/src/__tests__/criticalPathRulePublicationReadinessService.test.ts',
  'server/src/__tests__/forecastScopedRuntimeLiveLearningEvidenceService.test.ts',
  'server/src/__tests__/standardWorkDurationSeedReplayCandidateBridgeService.test.ts',
  'server/src/__tests__/wbsTemplateCandidateEventService.test.ts',
  'server/src/__tests__/constructionDependencyReplayCalibrationService.test.ts',
  'server/src/__tests__/runtimeExecutionInferenceService.test.ts',
  'server/src/__tests__/algorithmAssetGovernancePersistenceService.test.ts',
  'server/src/__tests__/algorithmAssetSampleHealthService.test.ts',
  'server/src/__tests__/businessCompletionSampleHealthAdapterService.test.ts',
  'server/src/__tests__/algorithmAssetForecastResidualOverlayService.test.ts',
  'server/src/__tests__/algorithmAssetColdStartBaselineService.test.ts',
  'server/src/__tests__/durationSuggestionService.test.ts',
  'server/src/__tests__/durationExperienceService.test.ts',
  'server/src/__tests__/durationContextService.test.ts',
  'server/src/__tests__/taskDurationForecastService.test.ts',
  'server/src/__tests__/projectGenerationFactsConsumerRegistry.test.ts',
  'server/src/__tests__/projectGenerationFactsStoreService.test.ts',
  'server/src/__tests__/projectFactsToTemplateScheduleTrust.test.ts',
  'server/src/__tests__/scopeTemplateCoverageService.test.ts',
  'server/src/__tests__/wizardScopeMaterializationService.test.ts',
  'server/src/__tests__/wbsTemplateProjectRecommendations.test.ts',
  'server/src/__tests__/wbsTemplateGoldenBenchmarkGateService.test.ts',
  'server/src/__tests__/wbsTemplateGoldenBenchmarkReplayService.test.ts',
  'server/src/__tests__/algorithmAssetLearnableParameterRegistryService.test.ts',
  'server/src/__tests__/algorithmAssetLearnableParameterSuggestionService.test.ts',
  'server/src/__tests__/algorithmAssetLearnableParameterReleaseExecutionService.test.ts',
  'server/src/__tests__/algorithmAssetLearnableParameterImpactMonitoringJob.test.ts',
  'server/src/__tests__/algorithmAssetLearnableParameterRuntimeConsumptionService.test.ts',
  'server/src/__tests__/wbsTemplateRecommendationAccuracyMatrixService.test.ts',
  'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts',
  'server/src/__tests__/v14223CompletionAuditService.test.ts',
  'server/src/__tests__/algorithmSeedCandidateDiscoveryService.test.ts',
  'server/src/__tests__/algorithmSeedGovernancePolicyService.test.ts',
  'server/src/__tests__/algorithmSeedImportService.test.ts',
  'server/src/__tests__/riskIssueWarningRuleRegistry.test.ts',
  'server/src/__tests__/riskIssueWarningGovernanceSignalService.test.ts',
  'server/src/__tests__/riskIssueWarningGovernanceService.hardening.test.ts',
  'server/src/__tests__/warningImpactSignalService.test.ts',
  'server/src/__tests__/warningImpactSignalGovernanceJob.test.ts',
  'server/src/__tests__/warningService.impactGovernance.test.ts',
  'server/src/__tests__/projectHealthDeviationSummaryService.test.ts',
  'server/src/__tests__/projectHealthService.test.ts',
  'server/src/__tests__/progressDeviation.test.ts',
  'server/src/__tests__/responsibilityInsightService.watchStatus.test.ts',
  'server/src/__tests__/planning-health.test.ts',
  'server/src/__tests__/executionGateSeedService.test.ts',
  'server/src/__tests__/projectCriticalPathService.test.ts',
  'server/src/__tests__/projectRemainingDurationForecastService.test.ts',
  'server/src/__tests__/scheduleAccelerationService.test.ts',
  'server/src/__tests__/scheduleAccelerationRuntimeService.test.ts',
  'server/src/__tests__/projectScheduleStateService.test.ts',
  'server/src/__tests__/taskLagStatusService.test.ts',
  'server/src/services/__tests__/taskLagStatusService.test.ts',
  'server/src/__tests__/weatherForecastImpactService.test.ts',
  'server/src/__tests__/constructionCalendar.test.ts',
  'server/src/__tests__/buildingPatternScheduleBenchmarkEvidenceService.test.ts',
  'server/src/__tests__/buildingPatternExecutionResolver.test.ts',
  'server/src/__tests__/buildingPatternExecutionProfileService.test.ts',
  'server/src/__tests__/buildingPatternExecutionPlanCandidateService.test.ts',
  'server/src/__tests__/v14223GovernanceCiGateContract.test.ts',
  'server/src/__tests__/v14231NonLiveCloseoutContract.test.ts',
]

const requiredClientGateTestFiles = [
  'client/src/services/__tests__/ruleAssetGovernanceWorkbenchApi.test.ts',
  'client/src/services/__tests__/wbsTemplateGenerationApi.test.ts',
  'client/src/pages/__tests__/RuleAssetGovernanceWorkbenchAdmin.test.tsx',
]

describe('v1.4.22.3 governance CI gate contract', () => {
  it('exposes a root verification command that runs the focused governance gate', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> }
    const serverPackageJson = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'server', 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> }

    expect(packageJson.scripts?.['verify:workflow-contract']).toBe(
      'node server/scripts/run-workflow-contract-gate.mjs',
    )
    expect(serverPackageJson.scripts?.['verify:workflow-contract']).toBe(
      'node scripts/run-workflow-contract-gate.mjs',
    )
    expect(packageJson.scripts?.['verify:v14231-non-live-closeout']).toBe(
      'npm run verify:v14231-non-live-closeout --workspace=server',
    )
    const serverV14231CloseoutScript = serverPackageJson.scripts?.['verify:v14231-non-live-closeout'] ?? ''
    expect(serverV14231CloseoutScript).toContain('node scripts/run-vitest-guard.mjs')
    for (const testPath of requiredV14231CloseoutTests) {
      expect(serverV14231CloseoutScript).toContain(testPath)
    }
    expect(packageJson.scripts?.['verify:v14223-governance']).toBe(
      'node scripts/check-v14223-governance-gate.mjs',
    )

    const workflowContractGate = readFileSync(
      resolve(workspaceRoot, 'server', 'scripts', 'run-workflow-contract-gate.mjs'),
      'utf8',
    )
    expect(workflowContractGate).toContain('startVitest')
    expect(workflowContractGate).toContain('configFile: false')
    for (const testPath of requiredWorkflowContractGateTests) {
      expect(workflowContractGate).toContain(testPath)
    }

    const gateScriptPath = resolve(workspaceRoot, 'scripts', 'check-v14223-governance-gate.mjs')
    expect(existsSync(gateScriptPath)).toBe(true)

    const gateScript = readFileSync(gateScriptPath, 'utf8')
    expect(gateScript).toContain('tsc')
    expect(gateScript).toContain('tsconfig.json')
    expect(gateScript).toContain('vitest')
    expect(gateScript).toContain('--no-cache')
    expect(gateScript).toContain('--no-file-parallelism')
    expect(gateScript).toContain('--pool=forks')
    expect(gateScript).toContain('--maxWorkers=1')
    expect(gateScript).toContain('--minWorkers=1')
    expect(gateScript).toContain('../server/')
    expect(gateScript).toContain('serverRelativeGovernanceTests')
    expect(gateScript).toContain('resolvedServerTscCli')
    expect(gateScript).toContain('resolvedServerVitestCli')
    expect(gateScript).toContain('clientVitestCli')
    expect(gateScript).toContain('clientRelativeGovernanceTests')
    expect(gateScript).not.toContain("from 'vitest/node'")
    expect(gateScript).not.toContain("from '@vitejs/plugin-react'")
    expect(gateScript).not.toContain('startVitest(')
    expect(gateScript).toContain('focusedClientGovernanceTests')

    for (const testFile of requiredGateTestFiles) {
      expect(gateScript).toContain(testFile)
    }

    for (const testFile of requiredClientGateTestFiles) {
      expect(gateScript).toContain(testFile)
    }
  })

  it('runs the gate from deploy CI and protects the workflow guard from drift', () => {
    const deployWorkflow = readFileSync(
      resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'),
      'utf8',
    )
    const workflowGuard = readFileSync(
      resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'),
      'utf8',
    )

    expect(deployWorkflow).toContain('name: v1.4.22.3 Governance Gate')
    expect(deployWorkflow).toContain('npm run verify:v14223-governance')
    expect(deployWorkflow).toContain('working-directory: .')
    expect(deployWorkflow).toContain('npm run guard:business-type-registry')
    expect(deployWorkflow).toContain('npm run guard:legacy-scope-runtime-surface')
    expect(deployWorkflow).toContain('npm run audit:retired-object-references')
    expect(deployWorkflow).toContain('npm run audit:delete-mutation-classification')

    expect(workflowGuard).toContain('server/scripts/check-business-type-registry-gate.mjs')
    expect(workflowGuard).toContain('scripts/check-v14223-governance-gate.mjs')
    expect(workflowGuard).toContain('server/scripts/check-spatial-semantic-gate.mjs')
    expect(workflowGuard).toContain('server/scripts/guard-duration-architecture-boundaries.mjs')
    expect(workflowGuard).toContain('server/scripts/guard-legacy-scope-runtime-surface.mjs')
    expect(workflowGuard).toContain('server/scripts/audit-retired-object-references.mjs')
    expect(workflowGuard).toContain('server/scripts/audit-delete-mutation-classification.mjs')
    expect(workflowGuard).toContain('package-lock.json')
    expect(workflowGuard).toContain('client/pnpm-lock.yaml')
    expect(workflowGuard).toContain('server/package.json')
    expect(workflowGuard).toContain('server/scripts/guard-ai-naming.mjs')
    expect(workflowGuard).toContain('server/src/__tests__/durationArchitectureBoundaryGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/aiNamingGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/retiredObjectReferenceAudit.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/deleteMutationClassificationGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/businessTypeRegistryGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/spatialSemanticGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/legacyScopeRuntimeSurfaceGuard.test.ts')
    expect(workflowGuard).toContain(
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts',
    )
    expect(workflowGuard).toContain(workflowContractGateCommand)
  })

  it('locks the v1.4.22.3 document guardrails that prevent LLM over-execution', () => {
    const planDoc = readFileSync(
      resolve(workspaceRoot, 'docs', 'plans', 'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'),
      'utf8',
    )
    const completionAuditService = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'services', 'v14223CompletionAuditService.ts'),
      'utf8',
    )
    const requirementCoverageAuditService = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'services', 'v14223RequirementCoverageAuditService.ts'),
      'utf8',
    )
    const routesSource = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'routes', 'algorithm-seeds.ts'),
      'utf8',
    )

    expect(planDoc).toContain('operation_classification / execution_dependencies / forbidden_paths_checked')
    expect(planDoc).toContain('v14223RequirementCoverageAuditService')
    expect(planDoc).toContain('section 14 acceptance')
    expect(planDoc).toContain('buildV14223DefaultCompletionEvidenceRecords()')
    expect(planDoc).toContain('buildV14223CurrentCompletionAudit()')
    expect(planDoc).toContain('buildV14223DefaultRequirementCoverageEvidenceRecords()')
    expect(planDoc).toContain('buildV14223DefaultAcceptanceCriterionEvidenceRecords()')
    expect(planDoc).toContain('buildV14223DefaultMachineExecutionGuardrailEvidenceRecords()')
    expect(planDoc).toContain('buildV14223CurrentMachineExecutionGuardrailAudit()')
    expect(planDoc).toContain('buildV14223DefaultHardDecisionTableEvidenceRecords()')
    expect(planDoc).toContain('buildV14223CurrentHardDecisionTableAudit()')
    expect(planDoc).toContain('machine_guardrail_item_coverage_is_required_before_chapter_completion_candidate')
    expect(planDoc).toContain('hard_decision_table_row_coverage_is_required_before_chapter_completion_candidate')
    expect(planDoc).toContain('not_do_items_are_guardrails_not_optional_notes')
    expect(planDoc).toContain('forbidden_action_column_is_guardrail_not_comment')
    expect(planDoc).toContain('machine_guardrail_coverage_does_not_grant_publish_rights')
    expect(planDoc).toContain('hard_decision_table_rows_define_action_limits_not_publish_rights')
    expect(planDoc).toContain('machine_execution_guardrail_audit_required')
    expect(planDoc).toContain('hard_decision_table_audit_required')
    expect(planDoc).toContain('completionEvidenceLevel=coverage_mapping_only')
    expect(planDoc).toContain('completionEvidenceLevel=asset_instance_completion_evidence')
    expect(planDoc).toContain('assetInstanceCompletionEvidence')
    expect(planDoc).toContain('writerEvidenceRefs / consumerEvidenceRefs / monitoringEvidenceRefs / releaseRecordEvidenceRefs / rollbackEvidenceRefs / oldObjectHandlingEvidenceRefs')
    expect(planDoc).toContain('asset_instance_*_evidence_refs_must_reference_existing_workspace_files')
    expect(planDoc).toContain('asset_instance_*_evidence_refs_must_reference_specific_assertions')
    expect(planDoc).toContain('manual note / todo / tbd / synthetic / historical_evidence_needs_refresh')
    expect(planDoc).toContain('只写 `::service exists / ::test file / ::matrix ready / ::see section` 不足以作为资产实例级完成证据')
    expect(planDoc).toContain('`delegated_domain_operation` 必须先由专项 writer 执行并重新记录为上述 runtime 状态后才可使用')
    expect(planDoc).toContain('证据引用巡检')
    expect(planDoc).toContain('委托执行巡检')
    expect(planDoc).toContain('canUseForChapterCompletionCandidate=false')
    expect(planDoc).toContain('section_14_acceptance_criteria_completion_evidence_level_required')
    expect(planDoc).toContain('acceptance_criteria_coverage_mapping_is_not_completion_evidence')
    expect(planDoc).toContain('不能只在测试内用合成完整记录替代 current completion builder')
    expect(planDoc).toContain('不能只在测试内用合成完整记录替代 current coverage builder')
    expect(planDoc).toContain('是合法输出状态，但不是完成证据')
    expect(planDoc).toContain('runtime_surface_closed_requires_runtime_closure_operation_evidence')
    expect(planDoc).toContain('必须输出 `runtime_surface_closure_evidence_required`')
    expect(planDoc).toContain('缺章节覆盖审计时即使 runtime surface 证据闭合，也不得进入 `chapter_completion_candidate`')
    expect(planDoc).toContain('不是所有资产都能跳过强锚点直接写 runtime')
    expect(planDoc).toContain('凡出现“自动更新 / 自我升级 / auto-update / self-upgrade”')
    expect(planDoc).toContain('runtime projection / published 版本只能由发布执行段和专项 writer 更新')
    expect(planDoc).toContain('`trusted_source_auto_publish / guarded_runtime_auto_publish / system_curated_publish`')
    expect(planDoc).toContain('缺系统级发布策略、平台发布出口、锚点升级策略、跨范围验证、系统 writer、消费者验证、影响面监控、发布记录或 rollback target 时不能写 `system_published`')
    expect(planDoc).toContain('当“当前必须人工治理”与“长期希望自动化”冲突时，当前锚点优先')
    expect(planDoc).toContain('不能由 seed、算法、候选 adapter 或大模型直接写入')
    expect(planDoc).toContain('不能按裸词直接误杀')
    expect(planDoc).toContain('chapter_completion_candidate_display_is_not_completion_declaration')
    expect(planDoc).toContain('completion_declaration_is_current_snapshot_governance_only')
    expect(planDoc).toContain('auto_governance_default_is_not_anchor_mutation')

    expect(completionAuditService).toContain('operation_classification_and_forbidden_paths_are_required_for_completion_audit')
    expect(completionAuditService).toContain('buildV14223DefaultCompletionEvidenceRecords')
    expect(completionAuditService).toContain('buildV14223CurrentCompletionAudit')
    expect(completionAuditService).toContain('operation_classification_not_completion_ready')
    expect(completionAuditService).toContain('runtime_surface_closed_requires_complete_current_output_template')
    expect(completionAuditService).toContain('runtime_surface_closed_requires_runtime_closure_operation_evidence')
    expect(completionAuditService).toContain('runtime_surface_closure_evidence_required')
    expect(completionAuditService).toContain('V14223_COMPLETION_EVIDENCE_REF_GENERIC_DETAIL_PATTERN')
    expect(completionAuditService).toContain('current_evidence_refs_must_reference_specific_assertions')
    expect(completionAuditService).toContain('writer_evidence_refs_must_reference_specific_assertions')
    expect(completionAuditService).toContain('chapter_completion_candidate_requires_document_requirement_coverage_audit')
    expect(completionAuditService).toContain('chapter_completion_candidate_requires_machine_execution_guardrail_audit')
    expect(completionAuditService).toContain('chapter_completion_candidate_requires_hard_decision_table_audit')
    expect(completionAuditService).toContain('chapter_completion_candidate_requires_section_14_acceptance_criteria_audit')
    expect(completionAuditService).toContain('chapter_completion_candidate_requires_asset_instance_acceptance_completion_evidence')
    expect(completionAuditService).toContain('chapter_completion_candidate_display_is_not_completion_declaration')
    expect(completionAuditService).toContain('completion_declaration_is_current_snapshot_governance_only')
    expect(completionAuditService).toContain('machine_execution_guardrail_audit_required')
    expect(completionAuditService).toContain('hard_decision_table_audit_required')
    expect(completionAuditService).toContain('section_14_acceptance_criteria_completion_evidence_level_required')
    expect(completionAuditService).toContain('section_14_acceptance_criteria_completion_evidence_required')
    expect(completionAuditService).toContain('if (!input.currentSnapshotGatePassed) return')
    expect(routesSource).toContain('/rule-assets/governance-completion-audit')
    expect(routesSource).toContain('buildV14223CurrentCompletionAudit')
    expect(requirementCoverageAuditService).toContain('document_section_coverage_is_required_before_chapter_completion_candidate')
    expect(requirementCoverageAuditService).toContain('machine_guardrail_item_coverage_is_required_before_chapter_completion_candidate')
    expect(requirementCoverageAuditService).toContain('hard_decision_table_row_coverage_is_required_before_chapter_completion_candidate')
    expect(requirementCoverageAuditService).toContain('section_14_acceptance_criteria_are_required_before_chapter_completion_candidate')
    expect(requirementCoverageAuditService).toContain('section_coverage_does_not_grant_publish_rights')
    expect(requirementCoverageAuditService).toContain('machine_guardrail_coverage_does_not_grant_publish_rights')
    expect(requirementCoverageAuditService).toContain('not_do_items_are_guardrails_not_optional_notes')
    expect(requirementCoverageAuditService).toContain('hard_decision_table_rows_define_action_limits_not_publish_rights')
    expect(requirementCoverageAuditService).toContain('forbidden_action_column_is_guardrail_not_comment')
    expect(requirementCoverageAuditService).toContain('acceptance_criteria_coverage_does_not_grant_publish_rights')
    expect(requirementCoverageAuditService).toContain('acceptance_criteria_coverage_mapping_is_not_completion_evidence')
    expect(requirementCoverageAuditService).toContain('completionEvidenceLevel')
    expect(requirementCoverageAuditService).toContain('assetInstanceCompletionEvidence')
    expect(requirementCoverageAuditService).toContain('asset_instance_completion_evidence_required')
    expect(requirementCoverageAuditService).toContain('asset_instance_writer_evidence_refs_required')
    expect(requirementCoverageAuditService).toContain('asset_instance_consumer_evidence_refs_required')
    expect(requirementCoverageAuditService).toContain('asset_instance_monitoring_evidence_refs_required')
    expect(requirementCoverageAuditService).toContain('asset_instance_release_record_evidence_refs_required')
    expect(requirementCoverageAuditService).toContain('asset_instance_rollback_evidence_refs_required')
    expect(requirementCoverageAuditService).toContain('must_reference_existing_workspace_files')
    expect(requirementCoverageAuditService).toContain('must_reference_specific_assertions')
    expect(requirementCoverageAuditService).toContain('V14223_ACCEPTANCE_EVIDENCE_REF_GENERIC_DETAIL_PATTERN')
    expect(requirementCoverageAuditService).toContain('V14223_ACCEPTANCE_EVIDENCE_REF_FORBIDDEN_PATTERN')
    expect(requirementCoverageAuditService).toContain('canUseForChapterCompletionCandidate')
    expect(requirementCoverageAuditService).toContain('buildV14223DefaultRequirementCoverageEvidenceRecords')
    expect(requirementCoverageAuditService).toContain('buildV14223CurrentRequirementCoverageAudit')
    expect(requirementCoverageAuditService).toContain('buildV14223DefaultMachineExecutionGuardrailEvidenceRecords')
    expect(requirementCoverageAuditService).toContain('buildV14223CurrentMachineExecutionGuardrailAudit')
    expect(requirementCoverageAuditService).toContain('buildV14223DefaultHardDecisionTableEvidenceRecords')
    expect(requirementCoverageAuditService).toContain('buildV14223CurrentHardDecisionTableAudit')
    expect(requirementCoverageAuditService).toContain('buildV14223DefaultAcceptanceCriterionEvidenceRecords')
    expect(requirementCoverageAuditService).toContain('buildV14223CurrentAcceptanceCriteriaAudit')
  })
})
