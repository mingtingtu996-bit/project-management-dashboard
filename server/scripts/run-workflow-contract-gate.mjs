import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { startVitest } from 'vitest/node'

const serverRoot = fileURLToPath(new URL('../', import.meta.url))
const vitestPackageRoot = fileURLToPath(new URL('../node_modules/vitest/', import.meta.url))
const vitestCliPath = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))

const longRunningWorkflowContractTests = new Set([
  'src/__tests__/wbsTemplateGenerationService.test.ts',
])

const workflowContractTests = [
  'src/__tests__/releaseGateManifestIntegrity.test.ts',
  'src/__tests__/deployWorkflowContract.test.ts',
  'src/__tests__/commercialTriggerRpcAclRemediationService.test.ts',
  'src/__tests__/productionAdvisorAclRemediationWorkflowContract.test.ts',
  'src/__tests__/environmentSwitchScript.test.ts',
  'src/__tests__/repositorySecretScanWorkflowContract.test.ts',
  'src/__tests__/pendingMigrationDropTargetGuard.test.ts',
  'src/__tests__/pendingMigrationDropTargetWorkflowContract.test.ts',
  'src/__tests__/v14223GovernanceCiGateContract.test.ts',
  'src/__tests__/v14231CapabilityStatusContract.test.ts',
  'src/__tests__/v14231CapabilityReadinessService.test.ts',
  'src/__tests__/v14231ActionableSurfaceRegistryService.test.ts',
  'src/__tests__/v14231EvidenceArtifactIndexService.test.ts',
  'src/__tests__/durationLegacyTaskDurationCleanup.test.ts',
  'src/__tests__/aiNamingGuard.test.ts',
  'src/__tests__/durationArchitectureBoundaryGuard.test.ts',
  'src/__tests__/legacyObjectDispositionLedgerService.test.ts',
  'src/__tests__/v14231NonLiveCloseoutContract.test.ts',
  'src/__tests__/migrationEntryPoints.test.ts',
  'src/__tests__/migrationSafetyGateService.test.ts',
  'src/__tests__/migrationProductionGovernanceService.test.ts',
  'src/__tests__/productionMigrationGovernanceScript.test.ts',
  'src/__tests__/serverBootstrapIsolation.test.ts',
  'src/__tests__/legacyObjectDropGuardService.test.ts',
  'src/__tests__/legacyObjectDropGuardScript.test.ts',
  'src/__tests__/legacyScopeRuntimeSurfaceGuard.test.ts',
  'src/__tests__/spatialFactBoundaryContract.test.ts',
  'src/__tests__/retiredObjectReferenceAudit.test.ts',
  'src/__tests__/deleteMutationClassificationGuard.test.ts',
  'src/__tests__/wizardE2EVerification.test.ts',
  'src/__tests__/wizardGenerationSideEffects.test.ts',
  'src/__tests__/algorithmSeedRoutes.test.ts',
  'src/__tests__/constructionOrganizationCloseoutWorkbenchOperationSuggestionService.test.ts',
  'src/__tests__/constructionOrganizationPlanNetworkDomainWriter.test.ts',
  'src/__tests__/projectFeatureToItemPackMap.foundation.test.ts',
  'src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
  'src/__tests__/wizardScopeMaterializationService.test.ts',
  'src/__tests__/taskStandardModelService.wizardDependencies.test.ts',
  'src/__tests__/taskCodeTransactionService.optimisticLock.test.ts',
  'src/__tests__/taskWriteChainService.participantUnit.test.ts',
  'src/__tests__/wbsTemplateGenerationService.test.ts',
  'src/__tests__/wbsTemplateGenerationConcurrencyGuard.test.ts',
  'src/__tests__/wbsTemplateExcelImportGuard.test.ts',
  'src/__tests__/generateT2RhythmReleaseClosure.test.ts',
  'src/__tests__/verifyT2RhythmReleaseClosureArtifact.test.ts',
  'src/__tests__/preflightT2RhythmReleaseReview.test.ts',
  'src/__tests__/runT2RhythmReleaseReviewPackage.test.ts',
  'src/__tests__/durationRuntimeOrphanRetirement.test.ts',
  'src/__tests__/systemSurfaceOwnershipGuard.test.ts',
  'src/__tests__/algorithmRuleAssetRelationshipMatrix.test.ts',
  'src/__tests__/algorithmRuleAssetInventoryService.test.ts',
  'src/__tests__/algorithmCatalogService.test.ts',
  'src/__tests__/v14AssetAdmissionAutomationService.test.ts',
  'src/__tests__/platformFoundationCapabilityRegistry.test.ts',
  'src/__tests__/runtimeConsumerLineageGuard.test.ts',
  'src/__tests__/durationRuntimeConsumerObservationService.test.ts',
  'src/__tests__/durationRuntimeConsumerObservationIntegrationService.test.ts',
  'src/__tests__/durationRuntimeConsumerObservationAdapterService.test.ts',
  'src/__tests__/durationRuntimeConsumerObservationRuntimeCallAuditService.test.ts',
  'src/__tests__/taskDurationForecastService.test.ts',
  'src/__tests__/projectRemainingDurationForecastService.test.ts',
  'src/__tests__/scheduleAccelerationRuntimeService.test.ts',
  'src/__tests__/t2RhythmLiveReplayDiagnostic.test.ts',
  'src/__tests__/diagnoseConstructionOrganizationCloseoutLive.test.ts',
  'src/__tests__/progressDeviation.test.ts',
  'src/__tests__/runtimeExecutionInferenceService.test.ts',
  'src/__tests__/responsibilityInsightService.watchStatus.test.ts',
  'src/__tests__/biStatusUtilities.test.ts',
  'src/__tests__/experienceTierRegistryService.test.ts',
  'src/__tests__/standardWorkDurationSeedReplayCandidateBridgeService.test.ts',
  'src/__tests__/durationContextPolicyStateBucketService.test.ts',
  'src/__tests__/progressVelocityLearningService.test.ts',
  'src/__tests__/durationContextPolicyParameterLearningService.test.ts',
  'src/__tests__/projectProductivityCalibrationService.test.ts',
  'src/__tests__/durationContextPolicyLearningJob.test.ts',
  'src/__tests__/durationLiveLearningProductionClaimAuditJobContract.test.ts',
  'src/__tests__/durationContextPolicyAutoPublishGateService.test.ts',
  'src/__tests__/durationContextPolicyCanaryApprovalService.test.ts',
  'src/__tests__/durationContextPolicyCanaryGateService.test.ts',
  'src/__tests__/businessTypeRegistryGuard.test.ts',
  'src/__tests__/spatialSemanticGuard.test.ts',
  'src/__tests__/projectScenarioTaxonomyService.test.ts',
  'src/__tests__/projectFactsToTemplateScheduleTrust.test.ts',
  'src/__tests__/constructionOrganizationScenarioGovernanceService.test.ts',
  'src/__tests__/t2RhythmTaskWindowAnnotationCandidateEventService.test.ts',
  'src/__tests__/durationContextFactorSynthesisService.test.ts',
  'src/__tests__/durationContextService.test.ts',
  'src/__tests__/durationContextSampleReadModelService.test.ts',
  'src/__tests__/durationSuggestionService.test.ts',
  'src/__tests__/scheduleAccelerationService.test.ts',
  'src/__tests__/durationSuggestionSimulation.test.ts',
  'src/__tests__/contracts/durationConsistency.contract.test.ts',
  'src/__tests__/durationAlgorithmClosureGovernanceService.test.ts',
  'src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts',
  'src/__tests__/durationAlgorithmAccuracyService.test.ts',
  'src/__tests__/durationAlgorithmAccuracyRoute.test.ts',
  'src/__tests__/projectCriticalPathService.test.ts',
  'src/__tests__/constructionDependencyReplayCalibrationService.test.ts',
  'src/__tests__/constructionOrganizationPlanNetworkRuntimeEvidenceService.test.ts',
  'src/__tests__/wbsTemplateFeedbackGovernance.test.ts',
  'src/__tests__/weatherForecastImpactService.test.ts',
  'src/__tests__/c1915aTemplateAssemblyContract.test.ts',
  'src/__tests__/templateAssemblyCompatibilityCheckService.test.ts',
  'src/__tests__/t2RhythmSchedulePhase1SelectionService.test.ts',
  'src/__tests__/durationInputAssemblerService.test.ts',
  'src/__tests__/wbsTemplateCandidateEventService.test.ts',
  'src/__tests__/routeAggregationGuard.test.ts',
  'src/__tests__/summaryServiceAggregationGuard.test.ts',
  'src/__tests__/metricSsotGuard.test.ts',
  'src/__tests__/routeOwnershipGuard.test.ts',
  'src/__tests__/systemRegistryGuard.test.ts',
  'src/__tests__/architectureBoundaryGuard.test.ts',
  'src/__tests__/productionReadyClaimsGuard.test.ts',
  'src/__tests__/publicRlsAuditGuard.test.ts',
  'src/__tests__/executeSqlGuard.test.ts',
]

const missingWorkflowContractTests = workflowContractTests.filter(
  (testFile) => !existsSync(fileURLToPath(new URL(`../${testFile}`, import.meta.url))),
)

if (missingWorkflowContractTests.length > 0) {
  console.error(
    '[workflow-contract-gate] missing workflow contract test files:',
    missingWorkflowContractTests.join(', '),
  )
  process.exit(1)
}

const testConfig = {
  globals: true,
  environment: 'node',
  include: ['src/**/*.{test,spec}.ts'],
  pool: 'forks',
  fileParallelism: false,
  minWorkers: 1,
  maxWorkers: 1,
  poolOptions: {
    forks: {
      execArgv: ['--max-old-space-size=8192'],
    },
  },
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    NODE_ENV: 'test',
  },
}

if (!existsSync(vitestPackageRoot)) {
  console.error('[workflow-contract-gate] missing Vitest package under server/node_modules. Install server dependencies first.')
  process.exit(1)
}
if (!existsSync(vitestCliPath)) {
  console.error('[workflow-contract-gate] missing Vitest CLI under server/node_modules. Install server dependencies first.')
  process.exit(1)
}

for (const testFile of longRunningWorkflowContractTests) {
  const result = spawnSync(process.execPath, [
    vitestCliPath,
    '--run',
    testFile,
    '--pool=threads',
    '--testTimeout=60000',
    '--fileParallelism=false',
    '--maxWorkers=1',
    '--minWorkers=1',
    '--reporter=dot',
  ], {
    cwd: serverRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL ?? 'https://test.supabase.co',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? 'test-key',
      NODE_ENV: 'test',
    },
  })
  if (result.status !== 0) {
    console.error('[workflow-contract-gate] long-running workflow contract test failed', testFile)
    process.exit(result.status ?? 1)
  }
}

const vitest = await startVitest(
  'test',
  workflowContractTests.filter((testFile) => !longRunningWorkflowContractTests.has(testFile)),
  {
    run: true,
    watch: false,
    configFile: false,
    root: serverRoot,
    ...testConfig,
  },
  {
    configFile: false,
    root: serverRoot,
    test: testConfig,
  },
)

const exitCode = await vitest?.close()
const processExitCode = typeof process.exitCode === 'number' ? process.exitCode : 0
const finalExitCode = typeof exitCode === 'number' ? exitCode : processExitCode
if (finalExitCode !== 0) {
  console.error('[workflow-contract-gate] focused workflow contract gate failed with exit code', finalExitCode)
  process.exit(finalExitCode)
}

console.log('[workflow-contract-gate] OK: focused workflow contract gate passed.')
