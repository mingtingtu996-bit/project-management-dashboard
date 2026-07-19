import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const focusedGovernanceTests = [
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
  'server/src/__tests__/taskDtoService.test.ts',
  'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
  'server/src/__tests__/durationPrecisionGovernanceBoundaryService.test.ts',
  'server/src/__tests__/v14223AlgorithmAssetGovernancePersistenceMigration.test.ts',
  'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
  'server/src/__tests__/durationLearningRuntimeConsumptionService.test.ts',
  'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
  'server/src/__tests__/durationLearningLegacyRuntimeRetirementMigrationContract.test.ts',
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
  'server/src/__tests__/v14223GovernanceCiGateContract.test.ts',
  'server/src/__tests__/v14231NonLiveCloseoutContract.test.ts',
]

const focusedClientGovernanceTests = [
  'client/src/services/__tests__/ruleAssetGovernanceWorkbenchApi.test.ts',
  'client/src/services/__tests__/wbsTemplateGenerationApi.test.ts',
  'client/src/pages/__tests__/RuleAssetGovernanceWorkbenchAdmin.test.tsx',
]

const serverCwd = new URL('../server/', import.meta.url)
const serverCwdPath = fileURLToPath(serverCwd)
const clientCwdPath = fileURLToPath(new URL('../client/', import.meta.url))
const tscCli = fileURLToPath(new URL('../server/node_modules/typescript/bin/tsc', import.meta.url))
const vitestCli = fileURLToPath(new URL('../server/node_modules/vitest/vitest.mjs', import.meta.url))
const rootTscCli = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
const rootVitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const clientVitestCli = fileURLToPath(new URL('../client/node_modules/vitest/vitest.mjs', import.meta.url))
const serverRelativeGovernanceTests = focusedGovernanceTests.map((testFile) =>
  testFile.replace(/^server\//, ''),
)
const clientRelativeGovernanceTests = focusedClientGovernanceTests.map((testFile) =>
  testFile.replace(/^client\//, ''),
)

const resolvedServerTscCli = existsSync(tscCli) ? tscCli : rootTscCli
const resolvedServerVitestCli = existsSync(vitestCli) ? vitestCli : rootVitestCli
const hasServerToolchain = existsSync(resolvedServerTscCli) && existsSync(resolvedServerVitestCli)
const resolvedClientVitestCli = existsSync(clientVitestCli) ? clientVitestCli : rootVitestCli
const hasClientVitest = existsSync(resolvedClientVitestCli)

if (!hasServerToolchain) {
  console.error(
    '[v1.4.22.3 governance gate] missing TypeScript/Vitest CLIs. Install server or root dependencies first.',
  )
  process.exit(1)
}

if (!hasClientVitest) {
  console.error(
    '[v1.4.22.3 governance gate] missing client Vitest CLI. Install workspace dependencies first.',
  )
  process.exit(1)
}

const toolchain = {
  cwd: serverCwdPath,
  tscArgs: [resolvedServerTscCli, '-p', 'tsconfig.json', '--noEmit'],
  vitestArgs: [
    resolvedServerVitestCli,
    'run',
    '--no-cache',
    '--no-file-parallelism',
    '--pool=forks',
    '--maxWorkers=1',
    '--minWorkers=1',
    ...serverRelativeGovernanceTests,
  ],
}

const commands = [
  {
    label: 'server typecheck',
    command: process.execPath,
    args: toolchain.tscArgs,
    cwd: toolchain.cwd,
  },
  {
    label: 'v1.4.22.3 focused governance tests',
    command: process.execPath,
    args: toolchain.vitestArgs,
    cwd: toolchain.cwd,
  },
  {
    label: 'v1.4.22.3 focused client governance tests',
    command: process.execPath,
    args: [
      resolvedClientVitestCli,
      'run',
      '--no-cache',
      '--no-file-parallelism',
      '--pool=forks',
      '--maxWorkers=1',
      '--minWorkers=1',
      ...clientRelativeGovernanceTests,
    ],
    cwd: clientCwdPath,
  },
]

for (const { label, command, args, cwd } of commands) {
  console.log(`\n[v1.4.22.3 governance gate] ${label}`)

  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    console.error(`[v1.4.22.3 governance gate] failed to start ${label}:`, result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`[v1.4.22.3 governance gate] ${label} failed with exit code ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\n[v1.4.22.3 governance gate] passed')
