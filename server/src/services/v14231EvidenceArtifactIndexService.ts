import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const V14231_EVIDENCE_ARTIFACT_IDS = [
  'A10-E01',
  'A10-E02',
  'A10-E03',
  'A10-E04',
  'A10-E05',
  'A10-E06',
  'A10-E07',
  'A10-E08',
  'A10-E09',
  'A10-E10',
  'A10-E11',
  'A10-E11a',
  'A10-E12',
  'A10-E13',
  'A10-E14',
  'A10-E15',
  'A10-E16',
  'A10-E17',
  'A10-E18',
] as const

export type V14231EvidenceArtifactId = typeof V14231_EVIDENCE_ARTIFACT_IDS[number]

export type V14231EvidenceArtifactIndexEntry = {
  id: V14231EvidenceArtifactId
  sourcePlan: 'v1.4.23.1-A'
  closeoutItems: string[]
  liveEvidenceRequired: boolean | 'mixed' | 'db/no-op' | 'live-backed' | 'false + live ref' | 'live'
  codeEvidence: string[]
  testEvidence: string[]
  scriptEvidence: string[]
  packageScripts: string[]
  boundary: {
    grantsProductionReady: false
    writesRuntimePublication: false
    requiresLiveOrAdminEvidenceForUpgrade: boolean
  }
  remainingBlockers: string[]
}

export type V14231EvidenceArtifactIndex = {
  sourcePlan: 'v1.4.23.1-A'
  entries: V14231EvidenceArtifactIndexEntry[]
}

export type V14231EvidenceArtifactIndexValidationIssue = {
  entryId: V14231EvidenceArtifactId
  field: 'codeEvidence' | 'testEvidence' | 'scriptEvidence' | 'packageScripts' | 'boundary' | 'remainingBlockers' | 'coverage'
  value: string
  reason: string
}

function entry(input: Omit<V14231EvidenceArtifactIndexEntry, 'sourcePlan' | 'boundary'>): V14231EvidenceArtifactIndexEntry {
  return {
    ...input,
    sourcePlan: 'v1.4.23.1-A',
    boundary: {
      grantsProductionReady: false,
      writesRuntimePublication: false,
      requiresLiveOrAdminEvidenceForUpgrade: true,
    },
  }
}

const ARTIFACT_INDEX: V14231EvidenceArtifactIndexEntry[] = [
  entry({
    id: 'A10-E01',
    closeoutItems: ['C-03'],
    liveEvidenceRequired: false,
    codeEvidence: [
      'server/src/services/v141HistoricalScopeCloseoutMatrixService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/legacyScopeRuntimeSurfaceGuard.test.ts',
      'server/src/__tests__/v14231NonLiveCloseoutContract.test.ts',
    ],
    scriptEvidence: [
      'server/scripts/guard-legacy-scope-runtime-surface.mjs',
    ],
    packageScripts: [
      'guard:legacy-scope-runtime-surface',
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'physical cleanup of historical scope objects still requires object-level dependency evidence and live/admin readback before any drop',
    ],
  }),
  entry({
    id: 'A10-E02',
    closeoutItems: ['C-02', 'C-03'],
    liveEvidenceRequired: false,
    codeEvidence: [
      'server/src/services/v141HistoricalScopeCloseoutMatrixService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/spatialFactBoundaryContract.test.ts',
      'server/src/__tests__/v14231NonLiveCloseoutContract.test.ts',
    ],
    scriptEvidence: [],
    packageScripts: [
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'future system-level spatial FK expansion requires a separate migration, backfill, permission, aggregation, and regression gate',
    ],
  }),
  entry({
    id: 'A10-E03',
    closeoutItems: ['C-08', 'C-11.1'],
    liveEvidenceRequired: false,
    codeEvidence: [
      'server/src/services/wbsTemplateGenerationService.ts',
      'server/src/services/wbsTemplateFeedback.ts',
      'server/scripts/guard-ai-naming.mjs',
      'server/scripts/guard-duration-architecture-boundaries.mjs',
    ],
    testEvidence: [
      'server/src/__tests__/durationLegacyTaskDurationCleanup.test.ts',
      'server/src/__tests__/aiNamingGuard.test.ts',
      'server/src/__tests__/durationArchitectureBoundaryGuard.test.ts',
    ],
    scriptEvidence: [
      'server/scripts/guard-ai-naming.mjs',
      'server/scripts/guard-duration-architecture-boundaries.mjs',
    ],
    packageScripts: [
      'guard:ai-naming',
      'guard:duration-architecture',
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'large-scale WBS/template runtime evidence, live observations, and release/rollback evidence remain outside this non-live index',
    ],
  }),
  entry({
    id: 'A10-E04',
    closeoutItems: ['C-09'],
    liveEvidenceRequired: 'db/no-op',
    codeEvidence: [
      'server/src/services/deletionRetentionGovernanceService.ts',
      'server/src/routes/deletion-retention.ts',
      'server/src/jobs/deletionRetentionCleanupJob.ts',
      'server/src/services/legacyObjectDropGuardService.ts',
      'server/src/services/legacyObjectDispositionLedgerService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/legacyObjectDropGuardService.test.ts',
      'server/src/__tests__/legacyObjectDropGuardScript.test.ts',
      'server/src/__tests__/legacyObjectDispositionLedgerService.test.ts',
      'server/src/__tests__/retiredObjectReferenceAudit.test.ts',
      'server/src/__tests__/deleteMutationClassificationGuard.test.ts',
    ],
    scriptEvidence: [
      'server/src/scripts/check-legacy-object-drop-guard.ts',
      'server/scripts/audit-retired-object-references.mjs',
      'server/scripts/audit-delete-mutation-classification.mjs',
    ],
    packageScripts: [
      'guard:legacy-object-drop',
      'audit:retired-object-references',
      'audit:delete-mutation-classification',
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'physical drop still requires live rowCount, dependency scan, structure export, rollback, controlled drop migration, and post-drop readback',
    ],
  }),
  entry({
    id: 'A10-E05',
    closeoutItems: ['C-04', 'C-15', 'C-19'],
    liveEvidenceRequired: false,
    codeEvidence: [
      'server/src/services/algorithmRuleAssetInventoryService.ts',
      'server/src/services/algorithmCatalogService.ts',
      'server/src/services/projectGenerationFactsConsumerRegistry.ts',
      'server/src/services/v14AssetAdmissionAutomationService.ts',
      'server/src/services/v14AssetDiscoveryService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/algorithmRuleAssetRelationshipMatrix.test.ts',
      'server/src/__tests__/algorithmRuleAssetInventoryService.test.ts',
      'server/src/__tests__/algorithmCatalogService.test.ts',
      'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts',
    ],
    scriptEvidence: [
      'server/src/scripts/diagnose-algorithm-rule-asset-relationship-matrix.ts',
    ],
    packageScripts: [
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'new algorithm, seed, and rule assets must continue to extend the relationship matrix before any runtime publication claim',
    ],
  }),
  entry({
    id: 'A10-E06',
    closeoutItems: ['C-10', 'C-18.L09', 'C-18.L10'],
    liveEvidenceRequired: 'live-backed',
    codeEvidence: [
      'server/src/routes/projectWizard.ts',
      'server/src/services/wizardScopeMaterializationService.ts',
      'server/src/services/taskWriteChainService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/wizardE2EVerification.test.ts',
      'server/src/__tests__/wizardGenerationSideEffects.test.ts',
      'server/src/__tests__/wizardCommitLiveDiagnostic.test.ts',
      'server/src/__tests__/wbsGenerationPressureHarness.test.ts',
    ],
    scriptEvidence: [
      'server/src/scripts/diagnose-wizard-commit-live.ts',
      'server/src/scripts/profile-wbs-generation.ts',
    ],
    packageScripts: [
      'diagnose:wizard-commit-live',
      'profile:wbs-generation',
    ],
    remainingBlockers: [
      'real wizard fault injection, restart window, concurrency, and large-scale generation evidence still require current live/archive runs',
    ],
  }),
  entry({
    id: 'A10-E07',
    closeoutItems: ['C-12', 'C-14', 'C-14.1', 'C-14.2'],
    liveEvidenceRequired: false,
    codeEvidence: [
      'server/src/services/progressDeviationService.ts',
      'server/src/services/runtimeExecutionInferenceService.ts',
      'server/src/services/responsibilityInsightService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/progressDeviation.test.ts',
      'server/src/__tests__/runtimeExecutionInferenceService.test.ts',
      'server/src/__tests__/responsibilityInsightService.watchStatus.test.ts',
      'server/src/__tests__/biStatusUtilities.test.ts',
    ],
    scriptEvidence: [],
    packageScripts: [
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'non-live fact/inference contracts do not prove full spatial FK coverage, complete causal attribution, or live readiness',
    ],
  }),
  entry({
    id: 'A10-E08',
    closeoutItems: ['C-11', 'C-19.0'],
    liveEvidenceRequired: false,
    codeEvidence: [
      'server/src/services/durationAlgorithmClosureGovernanceService.ts',
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts',
    ],
    testEvidence: [
      'client/src/__tests__/contracts/durationSurface.contract.test.ts',
      'server/src/__tests__/contracts/durationConsistency.contract.test.ts',
      'server/src/__tests__/durationAlgorithmClosureGovernanceService.test.ts',
      'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts',
      'server/src/__tests__/v14231NonLiveCloseoutContract.test.ts',
    ],
    scriptEvidence: [],
    packageScripts: [
      'verify:v14231-non-live-closeout',
      'verify:v14231-client-contracts',
      'verify:workflow-contract',
    ],
    remainingBlockers: [
      'runtime publication, replay, canary, rollback, manual review, and live consumer evidence remain gated',
    ],
  }),
  entry({
    id: 'A10-E09',
    closeoutItems: ['C-15', 'C-15.2', 'C-19.08'],
    liveEvidenceRequired: 'live',
    codeEvidence: [
      'server/src/jobs/durationContextPolicyLearningJob.ts',
      'server/src/services/durationContextPolicyStateBucketService.ts',
      'server/src/services/durationContextPolicyAutoPublishGateService.ts',
      'server/src/services/durationContextPolicyCanaryApprovalService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/durationContextPolicyLearningJob.test.ts',
      'server/src/__tests__/durationLiveLearningProductionClaimAuditJobContract.test.ts',
      'server/src/__tests__/durationContextPolicyStateBucketService.test.ts',
      'server/src/__tests__/durationContextPolicyAutoPublishGateService.test.ts',
      'server/src/__tests__/durationContextPolicyCanaryApprovalService.test.ts',
      'server/src/__tests__/durationContextPolicyCanaryGateService.test.ts',
    ],
    scriptEvidence: [],
    packageScripts: [
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'production sample quality, reward/MAE, pending forecast closure, real canary/stable/rollback, monitoring, and runtime publication are still live-only',
    ],
  }),
  entry({
    id: 'A10-E10',
    closeoutItems: ['C-18.L07', 'C-18.L08', 'C-18.L09', 'C-18.L10', 'C-18.L11', 'C-18.L12', 'C-18.L13', 'C-18.L14', 'C-18.L15'],
    liveEvidenceRequired: 'live',
    codeEvidence: [
      'server/src/services/migrationProductionGovernanceService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/v14231CapabilityStatusContract.test.ts',
      'server/src/__tests__/migrationProductionGovernanceService.test.ts',
      'server/src/__tests__/rlsProaclLiveDiagnostic.test.ts',
      'server/src/__tests__/executeSqlAnonPocLiveDiagnostic.test.ts',
      'server/src/__tests__/durationCanaryApprovalLiveDiagnostic.test.ts',
      'server/src/__tests__/criticalPathConcurrencyLiveDiagnostic.test.ts',
      'server/src/__tests__/acceptanceStatusConcurrencyLiveDiagnostic.test.ts',
      'server/src/__tests__/wizardCommitLiveDiagnostic.test.ts',
      'server/src/__tests__/wbsGenerationPressureHarness.test.ts',
      'server/src/__tests__/warningNotificationSyncLiveDiagnostic.test.ts',
      'server/src/__tests__/criticalPathSyntheticPressureHarness.test.ts',
      'server/src/__tests__/companyHealthTrendLiveDiagnostic.test.ts',
      'server/src/__tests__/companySummaryPressureHarness.test.ts',
      'server/src/__tests__/spreadsheetMigrationLiveDiagnostic.test.ts',
    ],
    scriptEvidence: [
      'server/src/scripts/diagnose-wizard-commit-live.ts',
      'server/src/scripts/diagnose-warning-notification-sync-live.ts',
      'server/src/scripts/diagnose-critical-path-concurrency-live.ts',
      'server/src/scripts/diagnose-spreadsheet-migration-live.ts',
      'server/src/scripts/profile-company-summary.ts',
      'server/src/scripts/profile-critical-path-network.ts',
      'server/src/scripts/profile-wbs-generation.ts',
    ],
    packageScripts: [
      'verify:c18-live-evidence-contracts',
      'diagnose:wizard-commit-live',
      'diagnose:warning-sync-live',
      'diagnose:critical-path-concurrency-live',
      'diagnose:spreadsheet-migration-live',
      'profile:company-summary',
      'profile:critical-path-network',
      'profile:wbs-generation',
    ],
    remainingBlockers: [
      'real database, query logs, concurrency, pressure, malicious-file PoC, and migration replay evidence must be archived before closing live-only rows',
    ],
  }),
  entry({
    id: 'A10-E11',
    closeoutItems: ['C-05', 'C-16'],
    liveEvidenceRequired: false,
    codeEvidence: [
      'server/scripts/guard-route-aggregation.mjs',
      'server/scripts/guard-summary-service-aggregation.mjs',
      'server/scripts/guard-metric-ssot.mjs',
      'server/scripts/guard-architecture-boundaries.mjs',
      'server/scripts/guard-system-surface-ownership.mjs',
      'client/scripts/guard-frontend-bi-aggregation.mjs',
    ],
    testEvidence: [
      'server/src/__tests__/summaryServiceAggregationGuard.test.ts',
      'server/src/__tests__/metricSsotGuard.test.ts',
      'server/src/__tests__/architectureBoundaryGuard.test.ts',
      'server/src/__tests__/systemSurfaceOwnershipGuard.test.ts',
      'client/src/__tests__/frontendBiAggregationGuard.test.ts',
    ],
    scriptEvidence: [],
    packageScripts: [
      'guard:summary-service-aggregation',
      'guard:metric-ssot',
      'guard:architecture-boundaries',
      'guard:system-surface-ownership',
      'guard:frontend-bi-aggregation',
      'verify:v14231-client-contracts',
      'verify:workflow-contract',
    ],
    remainingBlockers: [
      'static guard coverage does not replace production release evidence, future service orchestration review, catalog readback, or post-drop smoke',
    ],
  }),
  entry({
    id: 'A10-E11a',
    closeoutItems: ['C-05.1'],
    liveEvidenceRequired: false,
    codeEvidence: [
      'server/src/services/notificationAnalyticsService.ts',
      'server/src/services/taskAttributionSummaryService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/summaryServiceAggregationGuard.test.ts',
      'server/src/__tests__/deployWorkflowContract.test.ts',
      'server/src/__tests__/metricSsotGuard.test.ts',
    ],
    scriptEvidence: [
      'server/scripts/guard-route-aggregation.mjs',
      'server/scripts/guard-summary-service-aggregation.mjs',
      'server/scripts/guard-metric-ssot.mjs',
      'client/scripts/guard-frontend-bi-aggregation.mjs',
      '.github/workflows/workflow-guard.yml',
    ],
    packageScripts: [
      'guard:route-aggregation',
      'guard:summary-service-aggregation',
      'guard:metric-ssot',
      'guard:frontend-bi-aggregation',
      'verify:workflow-contract',
    ],
    remainingBlockers: [
      'summary and analytics discovery guards do not prove future service orchestration or workspace metric consumers are already migrated to the snapshot or summary source of truth',
    ],
  }),
  entry({
    id: 'A10-E12',
    closeoutItems: ['C-19.13', 'C-19.14', 'C-19.15a'],
    liveEvidenceRequired: 'live',
    codeEvidence: [
      'server/src/services/durationRuntimeConsumerObservationService.ts',
      'server/src/services/durationRuntimeConsumerObservationIntegrationService.ts',
      'server/src/services/taskDurationForecastService.ts',
      'server/src/services/projectRemainingDurationForecastService.ts',
      'server/src/services/scheduleAccelerationRuntimeService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/durationRuntimeConsumerObservationService.test.ts',
      'server/src/__tests__/durationRuntimeConsumerObservationIntegrationService.test.ts',
      'server/src/__tests__/durationRuntimeConsumerObservationAdapterService.test.ts',
      'server/src/__tests__/taskDurationForecastService.test.ts',
      'server/src/__tests__/projectRemainingDurationForecastService.test.ts',
      'server/src/__tests__/scheduleAccelerationRuntimeService.test.ts',
      'server/src/__tests__/t2RhythmLiveReplayDiagnostic.test.ts',
      'server/src/__tests__/diagnoseConstructionOrganizationCloseoutLive.test.ts',
    ],
    scriptEvidence: [
      'server/src/scripts/diagnose-t2-rhythm-live-replay.ts',
      'server/src/scripts/diagnose-construction-organization-closeout-live.ts',
    ],
    packageScripts: [
      'verify:v14231-non-live-closeout',
      'diagnose:t2-rhythm-live-replay',
      'diagnose:construction-organization-closeout-live',
      'package:t2-rhythm-release-review',
      'verify:t2-rhythm-release-closure',
    ],
    remainingBlockers: [
      'manual review decision, approval, release exit, runtime apply, saved outcome, archived consumer observation, monitoring, rollback, and E1/E3/E5 runtime evidence remain live-only',
    ],
  }),
  entry({
    id: 'A10-E13',
    closeoutItems: ['C-13'],
    liveEvidenceRequired: false,
    codeEvidence: [
      'server/src/services/v14231CapabilityReadinessService.ts',
      'server/src/services/v14231ActionableSurfaceRegistryService.ts',
      'server/src/routes/v14231-readiness.ts',
      'client/src/services/v14231ReadinessApi.ts',
    ],
    testEvidence: [
      'server/src/__tests__/v14231CapabilityReadinessService.test.ts',
      'server/src/__tests__/v14231ActionableSurfaceRegistryService.test.ts',
      'client/src/services/__tests__/v14231ReadinessApi.test.ts',
    ],
    scriptEvidence: [],
    packageScripts: [
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'future capability upgrades must backfill C-13 rows, page degradation rows, unlock C ids, browser evidence, and live/admin gates when applicable',
    ],
  }),
  entry({
    id: 'A10-E14',
    closeoutItems: ['C-19.01', 'C-19.02', 'C-19.03', 'C-19.04'],
    liveEvidenceRequired: 'false + live ref',
    codeEvidence: [
      'server/src/services/experienceTierRegistryService.ts',
      'server/src/services/spatialSemanticDictionaryService.ts',
      'server/src/services/businessTypeRegistryService.ts',
      'server/src/services/businessSpatialWbsConsumerCoverageMatrixService.ts',
      'server/src/services/projectScenarioTaxonomyService.ts',
      'server/src/services/projectFactsToTemplateService.ts',
      'server/src/services/durationContextPolicyStateBucketService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/experienceTierRegistryService.test.ts',
      'server/src/__tests__/durationContextPolicyStateBucketService.test.ts',
      'server/src/__tests__/progressVelocityLearningService.test.ts',
      'server/src/__tests__/durationContextPolicyParameterLearningService.test.ts',
      'server/src/__tests__/projectProductivityCalibrationService.test.ts',
      'server/src/__tests__/spatialSemanticGuard.test.ts',
      'server/src/__tests__/businessTypeRegistryGuard.test.ts',
      'server/src/__tests__/projectScenarioTaxonomyService.test.ts',
      'server/src/__tests__/projectFactsToTemplateScheduleTrust.test.ts',
    ],
    scriptEvidence: [
      'server/scripts/check-business-type-registry-gate.mjs',
      'server/scripts/check-spatial-semantic-gate.mjs',
    ],
    packageScripts: [
      'guard:business-type-registry',
      'guard:spatial-semantic',
      'guard:duration-architecture',
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'runtime readers, live replay, L5 release chain, and E1-E5 runtime evidence remain outside the non-live registry/dictionary gates',
    ],
  }),
  entry({
    id: 'A10-E15',
    closeoutItems: ['C-19.09', 'C-19.12'],
    liveEvidenceRequired: 'false + live ref',
    codeEvidence: [
      'server/scripts/guard-duration-architecture-boundaries.mjs',
      'server/src/services/constructionOrganizationScenarioGovernanceService.ts',
      'server/src/services/t2RhythmTaskWindowAnnotationCandidateEventService.ts',
      'server/src/registry/system-domain-registry.json',
    ],
    testEvidence: [
      'server/src/__tests__/durationArchitectureBoundaryGuard.test.ts',
      'server/src/__tests__/constructionOrganizationScenarioGovernanceService.test.ts',
      'server/src/__tests__/t2RhythmTaskWindowAnnotationCandidateEventService.test.ts',
      'server/src/__tests__/systemRegistryGuard.test.ts',
    ],
    scriptEvidence: [],
    packageScripts: [
      'guard:duration-architecture',
      'guard:system-registry',
    ],
    remainingBlockers: [
      'runtime readers, live replay, real network evidence, and release/rollback remain gated even when duration boundary debt is zero',
    ],
  }),
  entry({
    id: 'A10-E16',
    closeoutItems: ['C-19.05'],
    liveEvidenceRequired: 'false + live ref',
    codeEvidence: [
      'server/src/services/algorithmSeedResolver.ts',
      'server/src/services/durationContextService.ts',
      'server/src/services/durationContextSampleReadModelService.ts',
      'server/src/services/durationContextFactorSynthesisService.ts',
      'server/src/services/durationSuggestionService.ts',
      'server/src/services/scheduleAccelerationService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/durationContextFactorSynthesisService.test.ts',
      'server/src/__tests__/durationContextService.test.ts',
      'server/src/__tests__/durationContextSampleReadModelService.test.ts',
      'server/src/__tests__/durationSuggestionService.test.ts',
      'server/src/__tests__/scheduleAccelerationService.test.ts',
      'server/src/__tests__/durationSuggestionSimulation.test.ts',
      'server/src/__tests__/durationArchitectureBoundaryGuard.test.ts',
    ],
    scriptEvidence: [],
    packageScripts: [
      'guard:duration-architecture',
      'guard:system-registry',
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'raw duration-experience runtime reader observation, true samples, live replay, approval, release exit, publication, monitoring, and rollback remain live-only',
    ],
  }),
  entry({
    id: 'A10-E17',
    closeoutItems: ['C-19.11'],
    liveEvidenceRequired: 'false + live ref',
    codeEvidence: [
      'server/src/services/durationAlgorithmAccuracyService.ts',
      'server/src/services/projectCriticalPathService.ts',
      'server/src/services/scheduleAccelerationRuntimeService.ts',
      'server/src/services/constructionDependencyReplayCalibrationService.ts',
      'server/src/services/constructionOrganizationPlanNetworkRuntimeEvidenceService.ts',
      'server/src/services/weatherImpactSignalReadModelService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/durationAlgorithmAccuracyService.test.ts',
      'server/src/__tests__/durationAlgorithmAccuracyRoute.test.ts',
      'server/src/__tests__/projectCriticalPathService.test.ts',
      'server/src/__tests__/scheduleAccelerationRuntimeService.test.ts',
      'server/src/__tests__/constructionDependencyReplayCalibrationService.test.ts',
      'server/src/__tests__/constructionOrganizationPlanNetworkRuntimeEvidenceService.test.ts',
      'server/src/__tests__/wbsTemplateFeedbackGovernance.test.ts',
      'server/src/__tests__/weatherForecastImpactService.test.ts',
      'server/src/__tests__/contracts/durationConsistency.contract.test.ts',
      'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
      'server/src/__tests__/wbsTemplateCandidateEventService.test.ts',
    ],
    scriptEvidence: [
      'server/src/scripts/profile-critical-path-network.ts',
    ],
    packageScripts: [
      'profile:critical-path-network',
      'guard:duration-architecture',
      'verify:v14231-non-live-closeout',
    ],
    remainingBlockers: [
      'real sample quality, historical backfill, automatic upgrade gates, canary/stable/rollback, archived observations, and full E5 runtime evidence remain gated',
    ],
  }),
  entry({
    id: 'A10-E18',
    closeoutItems: ['C-19.13', 'C-19.15', 'C-19.15a'],
    liveEvidenceRequired: 'false + live ref',
    codeEvidence: [
      'server/src/services/durationColdStartTemplateRegistryService.ts',
      'server/src/services/templateAssemblyCompatibilityCheckService.ts',
      'server/src/services/t2RhythmSchedulePhase1SelectionService.ts',
      'server/src/services/durationInputAssemblerService.ts',
      'server/src/services/t2RhythmScheduleCandidateNetworkService.ts',
      'server/src/services/scheduleAccelerationService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/c1915aTemplateAssemblyContract.test.ts',
      'server/src/__tests__/templateAssemblyCompatibilityCheckService.test.ts',
      'server/src/__tests__/t2RhythmSchedulePhase1SelectionService.test.ts',
      'server/src/__tests__/durationInputAssemblerService.test.ts',
      'server/src/__tests__/v14231NonLiveCloseoutContract.test.ts',
      'server/src/__tests__/t2RhythmLiveReplayDiagnostic.test.ts',
    ],
    scriptEvidence: [
      'server/src/scripts/diagnose-t2-rhythm-live-replay.ts',
    ],
    packageScripts: [
      'verify:v14231-non-live-closeout',
      'diagnose:t2-rhythm-live-replay',
      'package:t2-rhythm-release-review',
      'verify:t2-rhythm-release-closure',
    ],
    remainingBlockers: [
      'true A/B/C networks, full template-family runtime evidence, live receipts, manual review, approval, release exit, apply, monitoring, and rollback remain live-only',
    ],
  }),
]

export function buildV14231EvidenceArtifactIndex(): V14231EvidenceArtifactIndex {
  return {
    sourcePlan: 'v1.4.23.1-A',
    entries: ARTIFACT_INDEX.map(cloneEntry),
  }
}

export function validateV14231EvidenceArtifactIndex(
  workspaceRoot = resolve(process.cwd().endsWith('server') ? resolve(process.cwd(), '..') : process.cwd()),
): V14231EvidenceArtifactIndexValidationIssue[] {
  const issues: V14231EvidenceArtifactIndexValidationIssue[] = []
  const packageJson = readPackageScripts(workspaceRoot)
  const coveredIds = new Set(ARTIFACT_INDEX.map((entry) => entry.id))

  for (const expectedId of V14231_EVIDENCE_ARTIFACT_IDS) {
    if (!coveredIds.has(expectedId)) {
      issues.push({
        entryId: expectedId,
        field: 'coverage',
        value: expectedId,
        reason: 'a10_evidence_entry_missing',
      })
    }
  }

  for (const entry of ARTIFACT_INDEX) {
    for (const field of ['codeEvidence', 'testEvidence', 'scriptEvidence'] as const) {
      for (const evidencePath of entry[field]) {
        if (!existsSync(resolve(workspaceRoot, evidencePath))) {
          issues.push({
            entryId: entry.id,
            field,
            value: evidencePath,
            reason: 'evidence_path_missing',
          })
        }
      }
    }

    for (const scriptName of entry.packageScripts) {
      if (!packageJson.has(scriptName)) {
        issues.push({
          entryId: entry.id,
          field: 'packageScripts',
          value: scriptName,
          reason: 'package_script_missing',
        })
      }
    }

    if (entry.boundary.grantsProductionReady !== false || entry.boundary.writesRuntimePublication !== false) {
      issues.push({
        entryId: entry.id,
        field: 'boundary',
        value: 'production_or_runtime_write_boundary',
        reason: 'artifact_index_must_not_grant_runtime_or_production_ready',
      })
    }

    if (entry.remainingBlockers.length === 0) {
      issues.push({
        entryId: entry.id,
        field: 'remainingBlockers',
        value: entry.id,
        reason: 'remaining_blocker_boundary_required',
      })
    }
  }

  return issues
}

function readPackageScripts(workspaceRoot: string) {
  const scripts = new Set<string>()
  for (const packagePath of ['package.json', 'server/package.json', 'client/package.json']) {
    try {
      const source = JSON.parse(readFileSync(resolve(workspaceRoot, packagePath), 'utf8')) as {
        scripts?: Record<string, string>
      }
      for (const key of Object.keys(source.scripts ?? {})) scripts.add(key)
    } catch {
      // Missing package files are reported as missing script entries by the caller.
    }
  }
  return scripts
}

function cloneEntry(entry: V14231EvidenceArtifactIndexEntry): V14231EvidenceArtifactIndexEntry {
  return {
    ...entry,
    closeoutItems: [...entry.closeoutItems],
    codeEvidence: [...entry.codeEvidence],
    testEvidence: [...entry.testEvidence],
    scriptEvidence: [...entry.scriptEvidence],
    packageScripts: [...entry.packageScripts],
    boundary: { ...entry.boundary },
    remainingBlockers: [...entry.remainingBlockers],
  }
}
