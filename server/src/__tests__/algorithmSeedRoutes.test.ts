import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { errorHandler } from '../middleware/errorHandler.js'

const mocks = vi.hoisted(() => ({
  membershipRole: 'company_admin',
  globalRole: 'member',
  projectCompanyId: 'company-1',
  visibleProjectIds: ['project-1'],
  getVisibleProjectIds: vi.fn(),
  validateV1474AlgorithmSeeds: vi.fn(),
  importV1474AlgorithmSeeds: vi.fn(),
  previewAlgorithmSeedImport: vi.fn(),
  rollbackAlgorithmSeedVersion: vi.fn(),
  listAlgorithmRuleAssets: vi.fn(),
  getAlgorithmRuleAssetInventoryDiagnostics: vi.fn(),
  listAlgorithmCatalogEntries: vi.fn(),
  listAlgorithmCaliberVersions: vi.fn(),
  listAlgorithmSeedCatalogEntries: vi.fn(),
  getAlgorithmGovernanceCatalogDiagnostics: vi.fn(),
  evaluateV14AssetAdmissionAutomation: vi.fn(),
  collectAlgorithmAssetGovernanceDashboardEvidence: vi.fn(),
  buildStandardWorkDurationSeedReplayGovernanceReport: vi.fn(),
  buildStandardWorkDurationSeedQualityAuditReport: vi.fn(),
  collectConstructionDependencyReplayCalibrationReport: vi.fn(),
  listConstructionDependencyReplayCalibrationHistoryReport: vi.fn(),
  listConstructionDependencySeedPromotionReviewPackageReport: vi.fn(),
  executeAlgorithmAssetGovernanceWorkbenchOperation: vi.fn(),
  executeSQL: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', globalRole: mocks.globalRole }
    next()
  },
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: vi.fn(async () => ({ companyId: 'company-1', role: mocks.membershipRole })),
  getProjectCompanyId: vi.fn(async () => mocks.projectCompanyId),
  getVisibleProjectIds: mocks.getVisibleProjectIds,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })),
  },
}))

vi.mock('../services/algorithmSeedRegistry.js', () => ({
  listAlgorithmSeedTypes: () => ['workflow_dictionary', 'building_pattern'],
}))

vi.mock('../services/algorithmSeedValidationService.js', () => ({
  validateV1474AlgorithmSeeds: mocks.validateV1474AlgorithmSeeds,
}))

vi.mock('../services/algorithmSeedImportService.js', () => ({
  importV1474AlgorithmSeeds: mocks.importV1474AlgorithmSeeds,
  previewAlgorithmSeedImport: mocks.previewAlgorithmSeedImport,
  rollbackAlgorithmSeedVersion: mocks.rollbackAlgorithmSeedVersion,
}))

vi.mock('../services/algorithmSeedLearningService.js', () => ({
  createAlgorithmSeedUpgradeCandidate: vi.fn(),
  listAlgorithmSeedOverrides: vi.fn(async () => []),
  listAlgorithmSeedUpgradeCandidates: vi.fn(async () => []),
}))

vi.mock('../services/algorithmSeedAutoGovernanceService.js', () => ({
  autoGovernAlgorithmSeedUpgradeCandidate: vi.fn(),
}))

vi.mock('../services/algorithmSeedCandidateDiscoveryService.js', () => ({
  discoverAlgorithmSeedUpgradeCandidates: vi.fn(),
}))

vi.mock('../services/algorithmRuleAssetInventoryService.js', () => ({
  listAlgorithmRuleAssets: mocks.listAlgorithmRuleAssets,
  getAlgorithmRuleAssetInventoryDiagnostics: mocks.getAlgorithmRuleAssetInventoryDiagnostics,
}))

vi.mock('../services/algorithmCatalogService.js', () => ({
  listAlgorithmCatalogEntries: mocks.listAlgorithmCatalogEntries,
  listAlgorithmCaliberVersions: mocks.listAlgorithmCaliberVersions,
  listAlgorithmSeedCatalogEntries: mocks.listAlgorithmSeedCatalogEntries,
  getAlgorithmGovernanceCatalogDiagnostics: mocks.getAlgorithmGovernanceCatalogDiagnostics,
}))

vi.mock('../services/v14AssetAdmissionAutomationService.js', () => ({
  evaluateV14AssetAdmissionAutomation: mocks.evaluateV14AssetAdmissionAutomation,
}))

vi.mock('../services/algorithmAssetGovernanceDashboardEvidenceService.js', () => ({
  collectAlgorithmAssetGovernanceDashboardEvidence: mocks.collectAlgorithmAssetGovernanceDashboardEvidence,
}))

vi.mock('../services/algorithmAssetGovernanceWorkbenchOperationService.js', () => ({
  executeAlgorithmAssetGovernanceWorkbenchOperation: mocks.executeAlgorithmAssetGovernanceWorkbenchOperation,
}))

vi.mock('../services/officialHolidayCalendarService.js', () => ({
  importOfficialWorkCalendar: vi.fn(),
  refreshOfficialWorkCalendarFromNotice: vi.fn(),
  resolveOfficialHolidayNoticeSourceUrl: vi.fn(() => null),
}))

vi.mock('../services/standardWorkDurationSeedReplayGovernanceService.js', () => ({
  buildStandardWorkDurationSeedReplayGovernanceReport: mocks.buildStandardWorkDurationSeedReplayGovernanceReport,
}))

vi.mock('../services/standardWorkDurationSeedQualityAuditService.js', () => ({
  buildStandardWorkDurationSeedQualityAuditReport: mocks.buildStandardWorkDurationSeedQualityAuditReport,
}))

vi.mock('../services/constructionDependencyReplayCalibrationService.js', () => ({
  collectConstructionDependencyReplayCalibrationReport: mocks.collectConstructionDependencyReplayCalibrationReport,
}))

vi.mock('../services/constructionDependencyReplayCalibrationPersistenceService.js', () => ({
  listConstructionDependencyReplayCalibrationHistoryReport: mocks.listConstructionDependencyReplayCalibrationHistoryReport,
  listConstructionDependencySeedPromotionReviewPackageReport: mocks.listConstructionDependencySeedPromotionReviewPackageReport,
}))

const { default: algorithmSeedsRouter } = await import('../routes/algorithm-seeds.js')
const {
  buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem,
} = await import('../services/constructionOrganizationPlanNetworkDraftService.js')
const {
  CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES,
} = await import('../services/constructionOrganizationPrecisionReplayMatrixService.js')

type ConstructionOrganizationRouteTestUseCase =
  | 'newProjectPlanning'
  | 'startingLineOnboarding'
  | 'accelerationRecovery'

const CONSTRUCTION_ORGANIZATION_ROUTE_TEST_USE_CASES: ConstructionOrganizationRouteTestUseCase[] = [
  'newProjectPlanning',
  'startingLineOnboarding',
  'accelerationRecovery',
]

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/planning/algorithm-seeds', algorithmSeedsRouter)
  app.use(errorHandler)
  return app
}

function durationLearningRuntimePublicationIdentityRow(input: {
  publicationKey: string
  assetKey?: string
  artifactKey?: string
  scopeLevel?: 'project' | 'company'
  companyId?: string
  projectId?: string | null
}) {
  const scopeLevel = input.scopeLevel ?? 'company'
  return {
    publication_key: input.publicationKey,
    asset_key: input.assetKey ?? 'special_work_duration_seed',
    artifact_key: input.artifactKey ?? 'artifact-special-work',
    scope_level: scopeLevel,
    company_id: input.companyId ?? 'company-1',
    project_id: scopeLevel === 'project' ? input.projectId ?? 'project-1' : null,
    industry_key: null,
    publication_stage: input.publicationKey.endsWith(':previous') ? 'superseded' : 'stable',
    runtime_payload: {},
    source_candidate_refs: ['candidate:rollback'],
    source_evidence_refs: ['evidence:rollback'],
    automation_decision: {},
    previous_publication_key: null,
    traffic_percent: 100,
    monitoring_window_hours: 72,
    monitoring_status: 'passed',
    published_at: '2026-06-15T00:00:00.000Z',
  }
}

function buildReadyConstructionOrganizationRouteFixture(options: {
  projectId?: string
  businessType?: string
  optionId?: string
  selectedScenarioIds?: string[]
  useCaseEvaluations?: Record<string, unknown>
  runtimeUseCases?: ConstructionOrganizationRouteTestUseCase[]
} = {}) {
  const projectId = options.projectId ?? 'project-1'
  const businessType = options.businessType ?? 'general_civil'
  const optionId = options.optionId ?? 'option-ready'
  const selectedScenarioIds = options.selectedScenarioIds ?? ['pile_before_excavation']
  const eventKeySegment = [optionId, ...selectedScenarioIds].join('-').replace(/[^a-zA-Z0-9]+/g, '-')
  const candidateEventId = `event-${eventKeySegment}`
  const runtimeUseCases = options.runtimeUseCases ?? CONSTRUCTION_ORGANIZATION_ROUTE_TEST_USE_CASES
  const reviewPackage = {
    source: 'construction_organization_candidate_materialization_review_package',
    packageBasis: 'manual_review_package_from_generated_row_preview_edges',
    optionId,
    status: 'ready_for_manual_review',
    allowManualReview: true,
    proposedDependencyEdgeCount: 1,
    blockedReasons: [],
    proposedDependencyEdges: [{
      fromGeneratedRowId: 'row-foundation',
      toGeneratedRowId: 'row-earthwork',
      dependencyType: 'FS',
      lagDays: 0,
      intent: 'pile_before_earthwork_bulk_excavation',
      fromVirtualNodeId: 'foundation-work',
      toVirtualNodeId: 'earthwork-work',
      operation: 'propose_create_dependency',
      writesTaskDependencies: false,
    }],
    reviewRequired: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
  }
  const generatedRowReferenceDurationEvidence = {
    source: 'generated_wbs_row_reference_duration_projection',
    matchedReferenceRowCount: 2,
    totalPlanReferenceDays: 30,
    totalContextualReferenceDays: 32,
    totalRecommendedDurationDays: 31,
    writesReferenceDuration: false,
    writesPlanDates: false,
    writesSeed: false,
  }
  const generatedRowNetworkEvaluation = {
    source: 'generated_wbs_row_candidate_network_cpm',
    projectedNetworkSpanDays: 30,
    previewEdgeCount: 1,
    unresolvedEdgeCount: 0,
    criticalGeneratedRowIds: ['row-foundation', 'row-earthwork'],
    materializationStatus: 'fully_mapped_read_only',
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
  }
  const useCaseEvaluations = options.useCaseEvaluations ?? {
    newProjectPlanning: {
      useCase: 'new_project_planning',
      optionScore: 73,
      actionability: 'actionable_candidate',
    },
    startingLineOnboarding: {
      useCase: 'starting_line_onboarding',
      optionScore: 62,
      actionability: 'actionable_candidate',
    },
    accelerationRecovery: {
      useCase: 'acceleration_recovery',
      optionScore: 79,
      recoveryFactorHint: 1.06,
      e5RecoverableSpanDays: 4,
      actionability: 'actionable_candidate',
    },
  }
  const materializationItem = {
    candidateEventId,
    assetKey: `construction_organization.plan_option.${optionId}`,
    sourceModule: 'constructionOrganizationScenarioGovernanceService',
    companyId: 'company-1',
    projectId,
    eventStatus: 'review_required',
    runtimeEffect: 'candidate_only',
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
    optionId,
    selectedScenarioIds,
    reviewPackage,
    materializationDecision: {},
    candidateDependencyPreview: null,
    engineEvaluationSummary: {
      source: 'construction_organization_plan_option_engine_evaluation_summary',
      e3: { projectDurationDays: 30 },
      e5: { recoveryFactorHint: 1.06, recoverableSpanDays: 4 },
    },
    generatedRowReferenceDurationEvidence,
    generatedRowNetworkEvaluation,
    useCaseEvaluations,
    factBasis: {
      businessType,
    },
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
    },
  }
  const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem(materializationItem as any)
  const draftKeySegment = draft.draftNetworkKey.replace(/[^a-zA-Z0-9]+/g, '-')
  const handoffEventId = `handoff-${draftKeySegment}`
  const approvalEventId = `approval-${draftKeySegment}`
  const publicationKey = `construction-org-plan-network:${projectId}:${draft.draftNetworkKey}`
  const releaseExitCandidateEventId = `release-exit-handoff-${draftKeySegment}`
  const candidateEventRow = {
    id: candidateEventId,
    asset_key: `construction_organization.plan_option.${optionId}`,
    source_module: 'constructionOrganizationScenarioGovernanceService',
    company_id: 'company-1',
    project_id: projectId,
    event_status: 'review_required',
    runtime_effect: 'candidate_only',
    created_at: '2026-06-22T00:00:00.000Z',
    updated_at: '2026-06-22T00:00:00.000Z',
    candidate_payload: {
      factBasis: materializationItem.factBasis,
      option: {
        optionId,
        selectedScenarioIds: materializationItem.selectedScenarioIds,
        engineEvaluationSummary: materializationItem.engineEvaluationSummary,
        useCaseEvaluations,
        generatedRowProjection: {
          materializationReviewPackage: reviewPackage,
          generatedRowReferenceDurationEvidence,
          generatedRowNetworkEvaluation,
        },
      },
    },
  }
  const mutationBoundary = {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
  }
  const buildRuntimeEvidenceContext = (useCase: ConstructionOrganizationRouteTestUseCase) => ({
    projectId,
    businessType,
    draftNetworkKey: draft.draftNetworkKey,
    optionId,
    useCase,
  })
  const consumerObservationRows = runtimeUseCases.map((useCase) => ({
    asset_key: 'construction_organization_plan_network',
    publication_key: publicationKey,
    consumer_key: 'gantt.taskDependencyReadModel',
    consumer_surface: 'task_dependency_gantt_read_model',
    observation_status: 'observed',
    observation_context: buildRuntimeEvidenceContext(useCase),
    observed_at: '2026-06-22T02:05:00.000Z',
  }))
  const runtimeEventRows = runtimeUseCases.flatMap((useCase) => [
    {
      event_type: 'impact_monitoring',
      event_status: 'monitoring_passed',
      source_publication_key: publicationKey,
      event_payload: buildRuntimeEvidenceContext(useCase),
      executed_at: '2026-06-22T03:00:00.000Z',
    },
    {
      event_type: 'rollback_execution',
      event_status: 'rollback_executed',
      source_publication_key: publicationKey,
      event_payload: buildRuntimeEvidenceContext(useCase),
      executed_at: '2026-06-22T03:05:00.000Z',
    },
  ])
  const outcomeRows = runtimeUseCases.map((useCase) => ({
    asset_key: 'construction_organization_plan_network',
    publication_key: publicationKey,
    outcome_status: 'accepted',
    outcome_ref: `network_outcomes:${publicationKey}:${useCase}`,
    learning_scope: 'project',
    metadata: buildRuntimeEvidenceContext(useCase),
    observed_at: '2026-06-22T03:10:00.000Z',
  }))
  const accuracyRows = runtimeUseCases.flatMap((useCase) =>
    ['standard_duration_reference', 'critical_path_cpm', 'schedule_acceleration_target']
      .map((engineCode, index) => ({
        id: `accuracy-${engineCode}-${optionId}-${useCase}`,
        engine_code: engineCode,
        backtest_status: 'backtested',
        absolute_error_days: index,
        prediction_context: {
          assetKey: 'construction_organization_plan_network',
          publicationKey,
          businessType,
          projectId,
          draftNetworkKey: draft.draftNetworkKey,
          optionId,
          useCase,
        },
        actual_context: {
          assetKey: 'construction_organization_plan_network',
          publicationKey,
          businessType,
          projectId,
          draftNetworkKey: draft.draftNetworkKey,
          optionId,
          useCase,
        },
        backtested_at: '2026-06-22T04:00:00.000Z',
      })),
  )
  const recommendationActionRows = runtimeUseCases.map((useCase) => ({
    project_id: projectId,
    recommendation_kind: 'construction_organization_plan_network',
    recommendation_key: `construction_organization_plan_network:${optionId}`,
    action_type: 'adopted',
    adopted_at: '2026-06-22T06:00:00.000Z',
    adopted_by: 'user-1',
    action_context: {
      optionId,
      draftNetworkKey: draft.draftNetworkKey,
      publicationKey,
      businessType,
      useCase,
      selectedScenarioIds: materializationItem.selectedScenarioIds,
      decisionAction: 'adopted',
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
  }))

  return {
    candidateEventRow,
    draft,
    publicationKey,
    releaseExitCandidateEventId,
    handoffEventRow: {
      id: handoffEventId,
      asset_key: 'construction_organization.plan_network_handoff.ready',
      source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      event_status: 'review_required',
      runtime_effect: 'candidate_only',
      candidate_payload: {
        draftNetworkKey: draft.draftNetworkKey,
        originalCandidateEventId: candidateEventId,
        optionId,
        selectedScenarioIds: materializationItem.selectedScenarioIds,
        requestedByUserId: 'user-1',
        executedAt: '2026-06-22T01:00:00.000Z',
        reviewPackage,
        runtimeMutationBoundary: mutationBoundary,
      },
    },
    approvalEventRow: {
      id: approvalEventId,
      asset_key: 'construction_organization.plan_network_approval.ready',
      source_module: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
      event_status: 'review_required',
      runtime_effect: 'candidate_only',
      candidate_payload: {
        draftNetworkKey: draft.draftNetworkKey,
        handoffCandidateEventId: handoffEventId,
        approvedByUserId: 'user-2',
        approvedAt: '2026-06-22T01:20:00.000Z',
        approvalDecision: 'approved_for_release_exit_preparation',
      },
    },
    releaseExitHandoffEventRow: {
      id: releaseExitCandidateEventId,
      asset_key: `construction_organization.plan_network_release_exit_handoff.${draftKeySegment}`,
      source_module: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
      event_status: 'review_required',
      runtime_effect: 'candidate_only',
      candidate_payload: {
        draftNetworkKey: draft.draftNetworkKey,
        originalCandidateEventId: candidateEventId,
        handoffCandidateEventId: handoffEventId,
        approvalCandidateEventId: approvalEventId,
        optionId,
        selectedScenarioIds: materializationItem.selectedScenarioIds,
        releaseRecordTarget: publicationKey,
        rollbackTarget: `construction-org-plan-network-rollback:${projectId}:${optionId}`,
        consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
        impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
        rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
        proposedDependencyEdges: reviewPackage.proposedDependencyEdges,
        runtimeMutationBoundary: mutationBoundary,
      },
    },
    runtimePublicationRow: {
      publication_key: publicationKey,
      project_id: projectId,
      draft_network_key: draft.draftNetworkKey,
      release_handoff_candidate_event_id: releaseExitCandidateEventId,
      runtime_publication_status: 'runtime_published',
      applied_dependency_count: 1,
      rollback_target: `construction-org-plan-network-rollback:${projectId}:${optionId}`,
      published_at: '2026-06-22T02:00:00.000Z',
    },
    consumerObservationRow: consumerObservationRows[0],
    consumerObservationRows,
    runtimeEventRows,
    outcomeRow: outcomeRows[0],
    outcomeRows,
    accuracyRows,
    recommendationActionRow: recommendationActionRows[0],
    recommendationActionRows,
  }
}

function pickConstructionOrganizationUseCaseEvaluation(useCase: 'newProjectPlanning' | 'startingLineOnboarding' | 'accelerationRecovery') {
  const all = {
    newProjectPlanning: {
      useCase: 'new_project_planning',
      optionScore: 73,
      actionability: 'actionable_candidate',
    },
    startingLineOnboarding: {
      useCase: 'starting_line_onboarding',
      optionScore: 62,
      actionability: 'actionable_candidate',
    },
    accelerationRecovery: {
      useCase: 'acceleration_recovery',
      optionScore: 79,
      recoveryFactorHint: 1.06,
      e5RecoverableSpanDays: 4,
      actionability: 'actionable_candidate',
    },
  }
  return {
    [useCase]: all[useCase],
  }
}

function buildReadyConstructionOrganizationOptionSetRouteFixtures(options: {
  projectId: string
  businessType: string
  optionPrefix?: string
  splitUseCasesAcrossOptions?: boolean
}) {
  const optionPrefix = options.optionPrefix ?? `option-${options.businessType}`
  const recommended = buildReadyConstructionOrganizationRouteFixture({
    projectId: options.projectId,
    businessType: options.businessType,
    optionId: `${optionPrefix}-recommended`,
    selectedScenarioIds: [`${options.businessType}_recommended_project_organization`],
    useCaseEvaluations: options.splitUseCasesAcrossOptions
      ? pickConstructionOrganizationUseCaseEvaluation('newProjectPlanning')
      : undefined,
  })
  const foundationAlternative = buildReadyConstructionOrganizationRouteFixture({
    projectId: options.projectId,
    businessType: options.businessType,
    optionId: `${optionPrefix}-foundation-alt`,
    selectedScenarioIds: [`${options.businessType}_foundation_alternative`],
    useCaseEvaluations: options.splitUseCasesAcrossOptions
      ? pickConstructionOrganizationUseCaseEvaluation('startingLineOnboarding')
      : undefined,
  })
  const releaseAlternative = buildReadyConstructionOrganizationRouteFixture({
    projectId: options.projectId,
    businessType: options.businessType,
    optionId: `${optionPrefix}-release-alt`,
    selectedScenarioIds: [`${options.businessType}_release_alternative`],
    useCaseEvaluations: options.splitUseCasesAcrossOptions
      ? pickConstructionOrganizationUseCaseEvaluation('accelerationRecovery')
      : undefined,
  })

  return {
    recommended,
    alternatives: [foundationAlternative, releaseAlternative],
    all: [recommended, foundationAlternative, releaseAlternative],
  }
}

function readPlanNetworkCandidateQueryArgs(params: unknown[] = []) {
  const hasProjectScope = params.length >= 5
  return {
    assetPattern: String(params[hasProjectScope ? 2 : 1] ?? ''),
    limit: Number(params[hasProjectScope ? 4 : 3]),
  }
}

describe('algorithm seed routes', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.stubEnv('WORKBUDDY_RULE_ASSET_RUNTIME_ACTIONS_ENABLED', 'true')
    mocks.membershipRole = 'company_admin'
    mocks.globalRole = 'member'
    mocks.projectCompanyId = 'company-1'
    mocks.visibleProjectIds = ['project-1']
    mocks.getVisibleProjectIds.mockReset()
    mocks.getVisibleProjectIds.mockImplementation(async () => mocks.visibleProjectIds)
    mocks.validateV1474AlgorithmSeeds.mockReset()
    mocks.importV1474AlgorithmSeeds.mockReset()
    mocks.previewAlgorithmSeedImport.mockReset()
    mocks.rollbackAlgorithmSeedVersion.mockReset()
    mocks.listAlgorithmRuleAssets.mockReset()
    mocks.getAlgorithmRuleAssetInventoryDiagnostics.mockReset()
    mocks.listAlgorithmCatalogEntries.mockReset()
    mocks.listAlgorithmCaliberVersions.mockReset()
    mocks.listAlgorithmSeedCatalogEntries.mockReset()
    mocks.getAlgorithmGovernanceCatalogDiagnostics.mockReset()
    mocks.evaluateV14AssetAdmissionAutomation.mockReset()
    mocks.collectAlgorithmAssetGovernanceDashboardEvidence.mockReset()
    mocks.buildStandardWorkDurationSeedReplayGovernanceReport.mockReset()
    mocks.buildStandardWorkDurationSeedQualityAuditReport.mockReset()
    mocks.collectConstructionDependencyReplayCalibrationReport.mockReset()
    mocks.listConstructionDependencyReplayCalibrationHistoryReport.mockReset()
    mocks.listConstructionDependencySeedPromotionReviewPackageReport.mockReset()
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockReset()
    mocks.executeSQL.mockReset()
    mocks.executeSQL.mockResolvedValue([])
    mocks.validateV1474AlgorithmSeeds.mockReturnValue({
      ok: true,
      strict: true,
      entries: [],
      issues: [],
    })
    mocks.importV1474AlgorithmSeeds.mockResolvedValue({
      validation: { ok: true, strict: true, entries: [], issues: [] },
      summaries: [{ seedType: 'workflow_dictionary', recordCount: 1 }],
    })
    mocks.previewAlgorithmSeedImport.mockResolvedValue({
      dryRun: true,
      validation: { ok: true, strict: true, entries: [], issues: [] },
      summaries: [{
        seedType: 'workflow_dictionary',
        recordCount: 1,
        existingVersionId: null,
        wouldCreateVersion: true,
        wouldReplaceRecords: false,
        wouldDeactivateCurrent: true,
        impactedConsumers: ['algorithmSeedResolver'],
        riskLevel: 'low',
      }],
    })
    mocks.rollbackAlgorithmSeedVersion.mockResolvedValue({
      seedType: 'workflow_dictionary',
      fromVersionId: 'current-version',
      toVersionId: 'previous-version',
      rolledBack: true,
    })
    mocks.listAlgorithmRuleAssets.mockReturnValue([
      {
        key: 'workflow_dictionary',
        lifecycleType: 'algorithm_seed',
        governanceSystem: 'algorithm_seed_lifecycle',
        recommendation: 'keep_in_algorithm_seed_lifecycle',
      },
    ])
    mocks.getAlgorithmRuleAssetInventoryDiagnostics.mockReturnValue({
      version: 'test',
      summary: { totalAssetCount: 1, algorithmSeedCount: 1 },
      gaps: { missingAlgorithmSeedTypes: [], duplicateAssetKeys: [] },
    })
    mocks.listAlgorithmCatalogEntries.mockReturnValue([
      {
        algorithmKey: 'baselineGenerationService',
        displayName: '项目基线生成算法',
        ordinaryUserVisible: false,
      },
    ])
    mocks.listAlgorithmCaliberVersions.mockReturnValue([
      {
        algorithmKey: 'baselineGenerationService',
        caliberVersion: 'v1.4.22-current-code-facts',
        inputSources: ['tasks'],
        outputFields: ['baseline_items'],
        consumerScope: ['BaselinePage'],
      },
    ])
    mocks.listAlgorithmSeedCatalogEntries.mockReturnValue([
      {
        seedKey: 'workflow_dictionary',
        seedType: 'workflow_dictionary',
        registryStatus: 'registry_seed',
      },
      {
        seedKey: 'dataQualityRuleRegistry',
        seedType: 'data_quality',
        registryStatus: 'catalog_only',
      },
    ])
    mocks.getAlgorithmGovernanceCatalogDiagnostics.mockReturnValue({
      catalogVersion: 'test',
      status: 'pass',
      summary: {
        expectedMainAlgorithmCount: 32,
        algorithmCatalogCount: 32,
        registrySeedTypeCount: 2,
        seedCatalogCount: 3,
        catalogOnlyRuleAssetCount: 1,
        ordinaryUserVisibleAlgorithmCount: 0,
      },
      gaps: {
        duplicateAlgorithmKeys: [],
        duplicateSeedKeys: [],
        missingAlgorithmImplementationPaths: [],
        missingRegistrySeedCatalogEntries: [],
        nonRegistryRuleAssetsMissingCatalogEntries: [],
        ordinaryUserVisibleAlgorithmKeys: [],
      },
    })
    mocks.collectAlgorithmAssetGovernanceDashboardEvidence.mockResolvedValue({
      companyId: 'company-1',
      scopePolicy: 'company_scoped_backend_governance_summary',
      candidateEvents: {
        totalCount: 3,
        reviewRequiredCount: 1,
        quarantinedCount: 1,
        replayReadyCount: 1,
      },
      replayRuns: {
        totalCount: 2,
        passedCount: 1,
        blockedCount: 1,
        failedCount: 0,
      },
      sampleHealth: {
        totalCount: 6,
        acceptedCount: 3,
        weakCount: 2,
        rejectedCount: 1,
        benchmarkEligibleCount: 3,
      },
      boundaryPolicy: [
        'dashboard_evidence_filters_by_current_company_id',
        'system_observation_and_other_company_rows_are_excluded',
        'sample_health_summary_is_observable_without_runtime_write',
      ],
    })
    mocks.evaluateV14AssetAdmissionAutomation.mockReturnValue({
      status: 'pass',
      summary: {
        totalDiscoveredCount: 285,
        registeredCount: 285,
        autoDiscoveredCount: 0,
        reviewRequiredCount: 0,
        blockerCount: 0,
        handRegistrationMissingCount: 0,
        dataAdmissionAssetCount: 6,
        metricAdmissionAssetCount: 25,
        ruleSeedAssetCount: 66,
      },
      blockers: [],
      reviewItems: [],
      assets: [
        {
          assetKey: 'metricRegistryService',
          assetType: 'metric_admission_asset',
          sourcePath: 'server/src/services/metricRegistryService.ts',
          discoveryStatus: 'registered',
        },
        {
          assetKey: 'progressCalculation',
          assetType: 'metric_admission_asset',
          sourcePath: 'server/src/utils/progressCalculation.ts',
          discoveryStatus: 'registered',
        },
        {
          assetKey: 'statistics',
          assetType: 'metric_admission_asset',
          sourcePath: 'server/src/utils/statistics.ts',
          discoveryStatus: 'registered',
        },
      ],
      boundaryPolicy: ['auto_discovery_is_the_default_for_new_v14_assets'],
    })
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValue({
      status: 'operation_blocked',
      operationAction: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      domainWriterKey: null,
      reasons: ['domain_writer_dependency_required'],
      domainResult: null,
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })
    mocks.buildStandardWorkDurationSeedReplayGovernanceReport.mockResolvedValue({
      reportCode: 'standard_work_duration_seed_replay_governance',
      companyId: 'company-1',
      projectId: 'project-1',
      replay: {
        reportCode: 'standard_work_duration_seed_p50_replay',
        governancePolicy: {
          replayMode: 'report_only',
          seedWritePolicy: 'never_write_seed_from_replay',
          candidatePolicy: 'review_required_before_seed_promotion',
        },
        summary: {
          evaluatedCodeCount: 2,
          trustedCodeCount: 1,
          reviewRequiredCodeCount: 1,
          overallWithinThirtyPercentRatio: 0.5,
        },
        byStandardWorkCode: [],
      },
    })
    mocks.buildStandardWorkDurationSeedQualityAuditReport.mockReturnValue({
      reportCode: 'standard_work_duration_seed_quality_audit',
      summary: {
        totalRuleCount: 100,
        durationBearingRuleCount: 80,
        blockerCount: 0,
        reviewRequiredCount: 3,
      },
      findings: [],
      governanceBoundary: {
        reportOnly: true,
        seedWritePolicy: 'never_write_seed_from_quality_audit',
        promotionPolicy: 'review_required_before_seed_promotion',
        allowedUse: 'backend_seed_quality_governance',
      },
    })
    mocks.collectConstructionDependencyReplayCalibrationReport.mockResolvedValue({
      reportCode: 'construction_dependency_replay_calibration',
      governancePolicy: {
        replayMode: 'report_only',
        seedWritePolicy: 'never_write_seed_from_replay',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        promotionPolicy: 'manual_seed_review_required',
      },
      summary: {
        inputDependencyCount: 3,
        l3MatchedDependencyCount: 1,
        l4MatchedDependencyCount: 2,
        reviewRequiredDependencyCount: 1,
        conflictDependencyCount: 1,
      },
      items: [],
    })
    mocks.listConstructionDependencyReplayCalibrationHistoryReport.mockResolvedValue({
      reportCode: 'construction_dependency_replay_calibration_history',
      governancePolicy: {
        replayMode: 'report_only',
        seedWritePolicy: 'never_write_seed_from_replay',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        promotionPolicy: 'manual_seed_review_required',
      },
      summary: {
        reportCount: 2,
        seedReviewItemCount: 1,
        manualReviewRequiredCount: 1,
        quarantineReviewRequiredCount: 0,
      },
      seedReviewItems: [{
        matchedSeedCode: 'l3-seed-a',
        matchedLayer: 'cross_item_workflow',
        sampleCount: 3,
        queueStatus: 'manual_review_required',
      }],
      recentReports: [],
    })
    mocks.listConstructionDependencySeedPromotionReviewPackageReport.mockResolvedValue({
      reportCode: 'construction_dependency_seed_promotion_review_packages',
      governanceBoundary: {
        reportOnly: true,
        runtimeMutationPolicy: 'none_report_only',
        seedWritePolicy: 'never_write_seed_from_review_package',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_review_package',
        approvalRequired: true,
        allowedUse: 'manual_seed_promotion_review',
      },
      summary: {
        sourceReportCount: 2,
        sourceSeedReviewItemCount: 1,
        packageCount: 1,
        blockedByConflictCount: 0,
        needsMoreReplayEvidenceCount: 0,
      },
      seedPromotionReviewPackages: [{
        packageCode: 'construction_dependency_seed_promotion_review_package',
        matchedSeedCode: 'l3-seed-a',
      }],
    })
  })

  it('keeps validate-seed as the standard-library compatible validation endpoint', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/validate-seed')
      .query({ strict: 'true', seedType: 'building_pattern' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(mocks.validateV1474AlgorithmSeeds).toHaveBeenCalledWith({
      strict: true,
      seedType: 'building_pattern',
    })
  })

  it('keeps import-seed admin-only and passes through strict seed options', async () => {
    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/import-seed')
      .send({ strict: true, seedType: 'workflow_dictionary' })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(mocks.importV1474AlgorithmSeeds).toHaveBeenCalledWith({
      strict: true,
      seedType: 'workflow_dictionary',
      userId: 'user-1',
    })
  })

  it('previews import-seed impact without calling the mutating import path', async () => {
    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/import-seed/preview')
      .send({ strict: true, seedType: 'workflow_dictionary' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      dryRun: true,
      summaries: [
        expect.objectContaining({
          seedType: 'workflow_dictionary',
          wouldCreateVersion: true,
          impactedConsumers: ['algorithmSeedResolver'],
        }),
      ],
    }))
    expect(mocks.previewAlgorithmSeedImport).toHaveBeenCalledWith({
      strict: true,
      seedType: 'workflow_dictionary',
    })
    expect(mocks.importV1474AlgorithmSeeds).not.toHaveBeenCalled()
  })

  it('rejects import-seed for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/import-seed')
      .send({ strict: true, seedType: 'workflow_dictionary' })
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(mocks.importV1474AlgorithmSeeds).not.toHaveBeenCalled()
  })

  it('keeps seed version rollback admin-only and passes rollback targets', async () => {
    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/versions/rollback')
      .send({
        seedType: 'workflow_dictionary',
        fromVersionId: 'current-version',
        toVersionId: 'previous-version',
        reason: 'regression_found',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(mocks.rollbackAlgorithmSeedVersion).toHaveBeenCalledWith({
      seedType: 'workflow_dictionary',
      fromVersionId: 'current-version',
      toVersionId: 'previous-version',
      reason: 'regression_found',
      userId: 'user-1',
    })
  })

  it('returns read-only rule asset inventory through the algorithm seed governance route', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets')
      .query({ lifecycleType: 'algorithm_seed', recommendation: 'keep_in_algorithm_seed_lifecycle' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      expect.objectContaining({
        key: 'workflow_dictionary',
        lifecycleType: 'algorithm_seed',
      }),
    ])
    expect(mocks.listAlgorithmRuleAssets).toHaveBeenCalledWith({
      lifecycleType: 'algorithm_seed',
      recommendation: 'keep_in_algorithm_seed_lifecycle',
    })
  })

  it('returns rule asset inventory diagnostics without admin mutation privileges', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/diagnostics')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      summary: expect.objectContaining({ totalAssetCount: 1 }),
      gaps: expect.objectContaining({ missingAlgorithmSeedTypes: [] }),
    }))
    expect(mocks.getAlgorithmRuleAssetInventoryDiagnostics).toHaveBeenCalledTimes(1)
  })

  it('exposes v1.4.22.3 rule asset governance dashboard as a company-admin backend view', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-dashboard')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      frontendExposurePolicy: 'backend_admin_governance_only',
      companyId: 'company-1',
      admissionStatus: 'pass',
      inventorySummary: expect.objectContaining({ totalAssetCount: 1 }),
      admissionSummary: expect.objectContaining({ totalDiscoveredCount: 285 }),
      governanceEvidence: expect.objectContaining({
        companyId: 'company-1',
        scopePolicy: 'company_scoped_backend_governance_summary',
        candidateEvents: expect.objectContaining({ totalCount: 3, reviewRequiredCount: 1 }),
        replayRuns: expect.objectContaining({ totalCount: 2, passedCount: 1 }),
        sampleHealth: expect.objectContaining({ totalCount: 6, acceptedCount: 3, weakCount: 2, rejectedCount: 1 }),
        boundaryPolicy: expect.arrayContaining([
          'dashboard_evidence_filters_by_current_company_id',
          'system_observation_and_other_company_rows_are_excluded',
        ]),
      }),
      governancePersistence: expect.objectContaining({
        migration: '193_v14223_algorithm_asset_governance_persistence.sql',
        registryView: 'algorithm_asset_registry_view',
        physicalTables: expect.arrayContaining([
          'algorithm_asset_candidate_events',
          'algorithm_asset_conflicts',
          'algorithm_asset_replay_runs',
          'algorithm_asset_replay_results',
          'algorithm_learnable_parameter_registry',
          'algorithm_cold_start_baselines',
          'duration_forecast_residual_overlays',
          'algorithm_sample_health_events',
        ]),
      }),
      publicationBoundary: expect.objectContaining({
        autoGovernanceIsNotAutoPublish: true,
        ordinaryFrontendVisible: false,
      }),
    }))
    expect(mocks.collectAlgorithmAssetGovernanceDashboardEvidence).toHaveBeenCalledWith({
      companyId: 'company-1',
    })
  })

  it('rejects v1.4.22.3 rule asset governance dashboard for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-dashboard')
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('keeps v1.4.22.3 governance workbench incomplete until construction-organization runtime closeout is proven', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      reportCode: 'v14223_rule_asset_governance_workbench_readiness',
      companyId: 'company-1',
      status: 'workbench_incomplete',
      canDeclareGovernanceWorkbenchComplete: false,
      completionScope: 'workbench_readiness_evidence_only',
      canDeclareV14223GovernanceComplete: false,
      runtimeMutationPolicy: 'none_read_only_evidence_and_gap_report',
      frontendExposurePolicy: 'backend_admin_governance_only',
      gates: expect.arrayContaining([
        expect.objectContaining({
          key: 'backend_operations_workbench',
          status: 'ready',
        }),
        expect.objectContaining({
          key: 'frontend_admin_operations_page',
          status: 'ready',
          evidenceRefs: expect.arrayContaining([
            'client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx',
            'client/src/services/ruleAssetGovernanceWorkbenchApi.ts',
          ]),
        }),
        expect.objectContaining({
          key: 'runtime_asset_isolation_matrix',
          status: 'ready',
          evidenceRefs: ['algorithmAssetIsolationMatrixService'],
          missingReasons: [],
        }),
        expect.objectContaining({
          key: 'parameter_runtime_consumers',
          status: 'ready',
          evidenceRefs: expect.arrayContaining([
            'duration.benchmark_blend_weight',
            'duration.p50_p75_blend_ratio',
            'duration.context.weather_multiplier',
            'duration.context.site_pressure_multiplier',
            'forecast.confidence_weight_multiplier',
            'forecast.L0.candidate_weight:manual_blocked_runtime_gate',
            'forecast.L1.candidate_weight:manual_blocked_runtime_gate',
            'forecast.L2.candidate_weight:manual_blocked_runtime_gate',
            'forecast.progress_curve_multiplier:manual_blocked_runtime_gate',
            'forecast.confidence_penalty:manual_blocked_runtime_gate',
            'governance.canary_stop_conditions:frozen_governance_threshold',
          ]),
          missingReasons: [],
        }),
        expect.objectContaining({
          key: 'metric_source_coverage',
          status: 'ready',
          evidenceRefs: expect.arrayContaining([
            'metricRegistryService',
            'server/src/utils/progressCalculation.ts',
            'server/src/utils/statistics.ts',
          ]),
          missingReasons: [],
        }),
        expect.objectContaining({
          key: 'future_asset_rediscovery_gate_rerun_matrix',
          status: 'ready',
          evidenceRefs: ['futureAssetRediscoveryGateRerunMatrixService'],
          missingReasons: [],
        }),
        expect.objectContaining({
          key: 'metric_consumer_path_coverage_matrix',
          status: 'ready',
          evidenceRefs: ['metricConsumerPathCoverageMatrixService'],
          missingReasons: [],
        }),
        expect.objectContaining({
          key: 'operable_governance_frontend_matrix',
          status: 'ready',
          evidenceRefs: ['operableGovernanceFrontendMatrixService'],
          missingReasons: [],
        }),
        expect.objectContaining({
          key: 'domain_release_runtime_closure_matrix',
          status: 'ready',
          evidenceRefs: ['domainReleaseRuntimeClosureMatrixService'],
          missingReasons: [],
        }),
        expect.objectContaining({
          key: 'construction_organization_runtime_closeout_claim',
          status: 'needs_work',
          evidenceRefs: ['constructionOrganizationPlanNetworkDraftService.runtimeCloseoutClaim'],
          missingReasons: expect.arrayContaining([
            'release_exit_handoff_candidate_event_required',
            'domain_writer_runtime_execution_required',
            'runtime_consumer_observation_required',
            'saved_network_outcome_required',
            'true_per_option_runtime_e1_e3_e5_evidence_required',
          ]),
        }),
      ]),
      boundaryPolicy: expect.arrayContaining([
        'workbench_readiness_does_not_grant_publish_rights',
        'dashboard_or_workbench_summary_is_not_runtime_writer_evidence',
        'metric_consumer_matrix_is_current_snapshot_only',
        'matrix_ready_is_not_future_asset_whitelist',
        'operable_frontend_does_not_grant_publish_rights',
        'construction_organization_runtime_closeout_claim_does_not_grant_auto_materialization',
      ]),
    }))
    expect(mocks.collectAlgorithmAssetGovernanceDashboardEvidence).toHaveBeenCalledWith({
      companyId: 'company-1',
    })
    const isolationGate = response.body.data.gates.find((gate: { key: string }) => gate.key === 'runtime_asset_isolation_matrix')
    expect(isolationGate.missingReasons).not.toContain('runtime_asset_isolation_matrix_required')
    expect(isolationGate.missingReasons).not.toContain('sample_health.production_consumption:runtime_consumer_isolation_required')
    expect(isolationGate.missingReasons.some((reason: string) => reason.startsWith('wbs.template.runtime:'))).toBe(false)
    expect(isolationGate.missingReasons.some((reason: string) => reason.startsWith('seed.override.runtime:'))).toBe(false)
    expect(isolationGate.missingReasons.some((reason: string) => reason.startsWith('dependency.rule.runtime:'))).toBe(false)
    expect(response.body.data.remainingClosureGaps.map((gap: { key: string }) => gap.key))
      .not.toContain('future_assets_rediscovery_and_gate_rerun')
    expect(response.body.data.remainingClosureGaps.map((gap: { key: string }) => gap.key))
      .not.toContain('complete_operable_governance_frontend')
    expect(response.body.data.remainingClosureGaps.map((gap: { key: string }) => gap.key))
      .not.toContain('all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback')
    expect(response.body.data.remainingClosureGaps.map((gap: { key: string }) => gap.key))
      .not.toContain('metric_consumer_path_coverage')
    expect(response.body.data.remainingClosureGaps.map((gap: { key: string }) => gap.key))
      .toContain('construction_organization_runtime_closeout_claim')
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.algorithm_asset_candidate_events'),
      ['company-1', 'construction_organization.plan_option.%', 'constructionOrganizationScenarioGovernanceService', 2000],
    )
  })

  it('keeps governance workbench incomplete when only project-scoped construction-organization runtime closeout is proven', async () => {
    const fixture = buildReadyConstructionOrganizationRouteFixture()
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return [fixture.candidateEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return [fixture.handoffEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return [fixture.approvalEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return [fixture.releaseExitHandoffEventRow]
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [fixture.runtimePublicationRow]
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixture.consumerObservationRows
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixture.runtimeEventRows
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixture.outcomeRows
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixture.accuracyRows
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return fixture.recommendationActionRows
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench?projectId=project-1')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'workbench_incomplete',
      canDeclareGovernanceWorkbenchComplete: false,
      canDeclareV14223GovernanceComplete: false,
      gates: expect.arrayContaining([
        expect.objectContaining({
          key: 'construction_organization_runtime_closeout_claim',
          status: 'ready',
          evidenceRefs: ['constructionOrganizationPlanNetworkDraftService.runtimeCloseoutClaim'],
          missingReasons: [],
        }),
        expect.objectContaining({
          key: 'construction_organization_product_outcome_closeout_matrix',
          status: 'needs_work',
          evidenceRefs: ['constructionOrganizationProductOutcomeCloseoutMatrixService'],
          missingReasons: expect.arrayContaining([
            'hospital:runtime_closeout_claim_by_business_type_required',
          ]),
          details: expect.objectContaining({
            source: 'construction_organization_product_outcome_closeout_gate_detail',
            status: 'product_outcome_closeout_incomplete',
            precisionReplayReadyBusinessTypeCount: 11,
            runtimeOutcomeReadyBusinessTypeCount: 0,
            supportedBusinessTypeCount: 11,
            businessTypeRows: expect.arrayContaining([
              expect.objectContaining({
                businessType: 'general_civil',
                runtimeEvidenceOptionCount: 1,
                hasRequiredRuntimeOptionNetworkCoverage: false,
                missingReasons: expect.arrayContaining([
                  'runtime_option_network_coverage_required',
                ]),
              }),
            ]),
          }),
        }),
      ]),
      boundaryPolicy: expect.arrayContaining([
        'runtime_closeout_claim_is_a_read_only_audit_projection',
        'requires_site_adoption_of_runtime_recommended_option',
        'construction_organization_runtime_closeout_claim_does_not_grant_auto_materialization',
        'single_project_runtime_closeout_does_not_prove_all_business_types',
        'runtime_outcome_claim_required_per_supported_business_type',
        'construction_organization_product_outcome_closeout_does_not_grant_auto_materialization',
      ]),
    }))
    expect(response.body.data.remainingClosureGaps.map((gap: { key: string }) => gap.key))
      .not.toContain('construction_organization_runtime_closeout_claim')
    expect(response.body.data.remainingClosureGaps.map((gap: { key: string }) => gap.key))
      .toContain('construction_organization_product_outcome_closeout_matrix')
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.algorithm_asset_candidate_events'),
      ['company-1', 'project-1', 'construction_organization.plan_option.%', 'constructionOrganizationScenarioGovernanceService', 2000],
    )
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.recommendation_actions'),
      [['project-1'], 'construction_organization_plan_network', expect.arrayContaining([
        'construction_organization_plan_network:option-ready',
        `construction_organization_plan_network:${fixture.draft.draftNetworkKey}`,
        `construction_organization_plan_network:${fixture.publicationKey}`,
      ]), 2000],
    )
  })

  it('preserves blocked construction-organization runtime claim details by business type for product outcome evidence actions', async () => {
    const fixture = buildReadyConstructionOrganizationRouteFixture()
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return [fixture.candidateEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return [fixture.handoffEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return [fixture.approvalEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return [fixture.releaseExitHandoffEventRow]
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [fixture.runtimePublicationRow]
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return [fixture.consumerObservationRow]
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixture.runtimeEventRows
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return []
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixture.accuracyRows
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return [fixture.recommendationActionRow]
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench?projectId=project-1')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'construction_organization_product_outcome_closeout_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'general_civil:runtime_closeout_claim_by_business_type_required',
          'general_civil:saved_network_outcome_required',
        ]),
        details: expect.objectContaining({
          source: 'construction_organization_product_outcome_closeout_gate_detail',
          runtimeOutcomeReadyBusinessTypeCount: 0,
          nextEvidenceActions: expect.arrayContaining([
            'record_saved_network_outcome_for_business_type',
          ]),
          nextEvidenceOperations: expect.arrayContaining([
            expect.objectContaining({
              evidenceAction: 'record_saved_network_outcome_for_business_type',
              operationAction: 'runtime_saved_outcome',
              assetType: 'construction_organization_plan_network',
            }),
          ]),
          nextEvidenceWorkItems: expect.arrayContaining([
            expect.objectContaining({
              businessType: 'general_civil',
              runtimeEvidenceProjectIds: ['project-1'],
              runtimeEvidenceDraftNetworkKeys: [fixture.draft.draftNetworkKey],
              runtimeEvidenceOptionIds: [fixture.draft.optionId],
              runtimeEvidencePublicationKeys: [fixture.publicationKey],
              nextEvidenceOperations: expect.arrayContaining([
                expect.objectContaining({
                  businessType: 'general_civil',
                  evidenceAction: 'record_saved_network_outcome_for_business_type',
                  operationAction: 'runtime_saved_outcome',
                  assetType: 'construction_organization_plan_network',
                }),
              ]),
            }),
          ]),
          businessTypeRows: expect.arrayContaining([
            expect.objectContaining({
              businessType: 'general_civil',
              status: 'product_outcome_closeout_incomplete',
              runtimeClaimStatus: 'runtime_closeout_claim_blocked',
              hasRuntimeCloseoutClaim: false,
              missingReasons: expect.arrayContaining([
                'runtime_closeout_claim_by_business_type_required',
                'saved_network_outcome_required',
              ]),
              runtimeEvidenceProjectIds: ['project-1'],
              runtimeEvidenceDraftNetworkKeys: [fixture.draft.draftNetworkKey],
              runtimeEvidenceOptionIds: [fixture.draft.optionId],
              runtimeEvidencePublicationKeys: [fixture.publicationKey],
              nextEvidenceActions: expect.arrayContaining([
                'record_saved_network_outcome_for_business_type',
              ]),
              nextEvidenceOperations: expect.arrayContaining([
                expect.objectContaining({
                  businessType: 'general_civil',
                  evidenceAction: 'record_saved_network_outcome_for_business_type',
                  operationAction: 'runtime_saved_outcome',
                  assetType: 'construction_organization_plan_network',
                }),
              ]),
            }),
          ]),
        }),
      }),
    ]))
  })

  it('counts company-wide construction-organization runtime closeout by real business type only', async () => {
    const civilFixture = buildReadyConstructionOrganizationRouteFixture()
    const hospitalFixture = buildReadyConstructionOrganizationRouteFixture({
      projectId: 'project-2',
      businessType: 'hospital',
      optionId: 'option-hospital',
      selectedScenarioIds: ['whole_basement_first', 'hospital_mep_early_release'],
    })
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return [civilFixture.candidateEventRow, hospitalFixture.candidateEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return [civilFixture.handoffEventRow, hospitalFixture.handoffEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return [civilFixture.approvalEventRow, hospitalFixture.approvalEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return [civilFixture.releaseExitHandoffEventRow, hospitalFixture.releaseExitHandoffEventRow]
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [civilFixture.runtimePublicationRow, hospitalFixture.runtimePublicationRow]
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return [...civilFixture.consumerObservationRows, ...hospitalFixture.consumerObservationRows]
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return [...civilFixture.runtimeEventRows, ...hospitalFixture.runtimeEventRows]
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return [...civilFixture.outcomeRows, ...hospitalFixture.outcomeRows]
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return [...civilFixture.accuracyRows, ...hospitalFixture.accuracyRows]
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return [...civilFixture.recommendationActionRows, ...hospitalFixture.recommendationActionRows]
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'workbench_incomplete',
      canDeclareGovernanceWorkbenchComplete: false,
      gates: expect.arrayContaining([
        expect.objectContaining({
          key: 'construction_organization_product_outcome_closeout_matrix',
          status: 'needs_work',
          missingReasons: expect.not.arrayContaining([
            'general_civil:runtime_closeout_claim_by_business_type_required',
            'hospital:runtime_closeout_claim_by_business_type_required',
          ]),
          details: expect.objectContaining({
            source: 'construction_organization_product_outcome_closeout_gate_detail',
            status: 'product_outcome_closeout_incomplete',
            precisionReplayReadyBusinessTypeCount: 11,
            runtimeOutcomeReadyBusinessTypeCount: 0,
            supportedBusinessTypeCount: 11,
            businessTypeRows: expect.arrayContaining([
              expect.objectContaining({
                businessType: 'general_civil',
                runtimeEvidenceOptionCount: 1,
                hasRequiredRuntimeOptionNetworkCoverage: false,
                missingReasons: expect.arrayContaining([
                  'runtime_option_network_coverage_required',
                ]),
              }),
              expect.objectContaining({
                businessType: 'hospital',
                runtimeEvidenceOptionCount: 1,
                hasRequiredRuntimeOptionNetworkCoverage: false,
                missingReasons: expect.arrayContaining([
                  'runtime_option_network_coverage_required',
                ]),
              }),
            ]),
          }),
        }),
      ]),
    }))
    expect(response.body.data.remainingClosureGaps.map((gap: { key: string }) => gap.key))
      .toContain('construction_organization_product_outcome_closeout_matrix')
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.recommendation_actions'),
      [expect.arrayContaining(['project-1', 'project-2']), 'construction_organization_plan_network', expect.arrayContaining([
        'construction_organization_plan_network:option-ready',
        'construction_organization_plan_network:option-hospital',
        `construction_organization_plan_network:${civilFixture.publicationKey}`,
        `construction_organization_plan_network:${hospitalFixture.publicationKey}`,
      ]), 2000],
    )
  })

  it('does not let an incomplete same-project construction organization draft block a completed business-type outcome', async () => {
    const civilFixture = buildReadyConstructionOrganizationRouteFixture()
    const hospitalFixture = buildReadyConstructionOrganizationRouteFixture({
      projectId: 'project-1',
      businessType: 'hospital',
      optionId: 'option-hospital',
      selectedScenarioIds: ['whole_basement_first', 'hospital_mep_early_release'],
    })
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return [civilFixture.candidateEventRow, hospitalFixture.candidateEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return [civilFixture.handoffEventRow, hospitalFixture.handoffEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return [civilFixture.approvalEventRow, hospitalFixture.approvalEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return [civilFixture.releaseExitHandoffEventRow, hospitalFixture.releaseExitHandoffEventRow]
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [civilFixture.runtimePublicationRow]
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return civilFixture.consumerObservationRows
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return civilFixture.runtimeEventRows
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return civilFixture.outcomeRows
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return civilFixture.accuracyRows
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return civilFixture.recommendationActionRows
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench?projectId=project-1')
      .expect(200)

    expect(response.body.success).toBe(true)
    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.not.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            hasRuntimeCloseoutClaimEvidence: true,
            hasRuntimeCloseoutClaim: false,
            runtimeEvidenceOptionCount: 1,
            hasRequiredRuntimeOptionNetworkCoverage: false,
            missingReasons: expect.arrayContaining([
              'runtime_option_network_coverage_required',
            ]),
          }),
          expect.objectContaining({
            businessType: 'hospital',
            status: 'product_outcome_closeout_incomplete',
            hasRuntimeCloseoutClaimEvidence: false,
            hasRuntimeCloseoutClaim: false,
            missingReasons: expect.arrayContaining([
              'runtime_closeout_claim_by_business_type_required',
            ]),
          }),
        ]),
      }),
    }))
    expect(productOutcomeGate.missingReasons).toEqual(expect.arrayContaining([
      'hospital:runtime_closeout_claim_by_business_type_required',
    ]))
    expect(productOutcomeGate.missingReasons).not.toContain('hospital:domain_writer_runtime_execution_required')
  })

  it('does not count runtime closeout when structured business type evidence conflicts with the draft business type', async () => {
    const fixture = buildReadyConstructionOrganizationRouteFixture({
      businessType: 'general_civil',
    })
    const conflictingRuntimeEventRows = fixture.runtimeEventRows.map((row) => ({
      ...row,
      event_payload: {
        businessType: 'hospital',
      },
    }))
    const conflictingOutcomeRow = {
      ...fixture.outcomeRow,
      metadata: {
        businessType: 'hospital',
      },
    }
    const conflictingAccuracyRows = fixture.accuracyRows.map((row) => ({
      ...row,
      prediction_context: {
        ...row.prediction_context,
        businessType: 'hospital',
      },
      actual_context: {
        ...row.actual_context,
        businessType: 'hospital',
      },
    }))
    const conflictingRecommendationActionRow = {
      ...fixture.recommendationActionRow,
      action_context: {
        ...fixture.recommendationActionRow.action_context,
        businessType: 'hospital',
      },
    }

    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return [fixture.candidateEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return [fixture.handoffEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return [fixture.approvalEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return [fixture.releaseExitHandoffEventRow]
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [fixture.runtimePublicationRow]
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return [fixture.consumerObservationRow]
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return conflictingRuntimeEventRows
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return [conflictingOutcomeRow]
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return conflictingAccuracyRows
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return [conflictingRecommendationActionRow]
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench?projectId=project-1')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
        'general_civil:runtime_business_type_conflict:hospital',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            hasRuntimeCloseoutClaim: false,
            missingReasons: expect.arrayContaining([
              'runtime_business_type_conflict:hospital',
              'runtime_closeout_claim_by_business_type_required',
            ]),
          }),
          expect.objectContaining({
            businessType: 'hospital',
            status: 'product_outcome_closeout_incomplete',
            hasRuntimeCloseoutClaim: false,
            missingReasons: expect.arrayContaining([
              'runtime_closeout_claim_by_business_type_required',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not count runtime closeout when consumer observation business type conflicts with the draft business type', async () => {
    const fixture = buildReadyConstructionOrganizationRouteFixture({
      businessType: 'general_civil',
    })
    const conflictingConsumerObservationRow = {
      ...fixture.consumerObservationRow,
      observation_context: {
        businessType: 'hospital',
      },
    }

    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return [fixture.candidateEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return [fixture.handoffEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return [fixture.approvalEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return [fixture.releaseExitHandoffEventRow]
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [fixture.runtimePublicationRow]
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return [conflictingConsumerObservationRow]
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixture.runtimeEventRows
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return [fixture.outcomeRow]
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixture.accuracyRows
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return [fixture.recommendationActionRow]
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench?projectId=project-1')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
        'general_civil:runtime_business_type_conflict:hospital',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            hasRuntimeCloseoutClaim: false,
            missingReasons: expect.arrayContaining([
              'runtime_business_type_conflict:hospital',
              'runtime_closeout_claim_by_business_type_required',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not count runtime closeout when site adoption business type conflicts with the draft business type', async () => {
    const fixture = buildReadyConstructionOrganizationRouteFixture({
      businessType: 'general_civil',
    })
    const conflictingRecommendationActionRow = {
      ...fixture.recommendationActionRow,
      action_context: {
        ...fixture.recommendationActionRow.action_context,
        businessType: 'hospital',
      },
    }

    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return [fixture.candidateEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return [fixture.handoffEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return [fixture.approvalEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return [fixture.releaseExitHandoffEventRow]
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [fixture.runtimePublicationRow]
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return [fixture.consumerObservationRow]
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixture.runtimeEventRows
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return [fixture.outcomeRow]
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixture.accuracyRows
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return [conflictingRecommendationActionRow]
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench?projectId=project-1')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
        'general_civil:runtime_business_type_conflict:hospital',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            hasRuntimeCloseoutClaim: false,
            missingReasons: expect.arrayContaining([
              'runtime_business_type_conflict:hospital',
              'runtime_closeout_claim_by_business_type_required',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not count runtime closeout when site adoption omits structured business type attribution', async () => {
    const fixture = buildReadyConstructionOrganizationRouteFixture({
      businessType: 'general_civil',
    })
    const omittedRecommendationActionRow = {
      ...fixture.recommendationActionRow,
      action_context: {
        ...fixture.recommendationActionRow.action_context,
        businessType: null,
      },
    }

    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return [fixture.candidateEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return [fixture.handoffEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return [fixture.approvalEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return [fixture.releaseExitHandoffEventRow]
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [fixture.runtimePublicationRow]
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return [fixture.consumerObservationRow]
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixture.runtimeEventRows
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return [fixture.outcomeRow]
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixture.accuracyRows
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return [omittedRecommendationActionRow]
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench?projectId=project-1')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
        'general_civil:runtime_business_type_attribution_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            hasRuntimeCloseoutClaim: false,
            missingReasons: expect.arrayContaining([
              'runtime_business_type_attribution_required',
              'runtime_closeout_claim_by_business_type_required',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not count runtime closeout when runtime evidence omits structured business type attribution', async () => {
    const fixture = buildReadyConstructionOrganizationRouteFixture({
      businessType: 'general_civil',
    })
    const omittedConsumerObservationRow = {
      ...fixture.consumerObservationRow,
      observation_context: {},
    }
    const omittedRuntimeEventRows = fixture.runtimeEventRows.map((row) => ({
      ...row,
      event_payload: {},
    }))
    const omittedOutcomeRow = {
      ...fixture.outcomeRow,
      metadata: {},
    }
    const omittedAccuracyRows = fixture.accuracyRows.map((row) => ({
      ...row,
      prediction_context: {
        ...row.prediction_context,
        businessType: undefined,
      },
      actual_context: {
        ...row.actual_context,
        businessType: undefined,
      },
    }))
    const omittedRecommendationActionRow = {
      ...fixture.recommendationActionRow,
      action_context: {
        ...fixture.recommendationActionRow.action_context,
        businessType: null,
      },
    }

    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return [fixture.candidateEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return [fixture.handoffEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return [fixture.approvalEventRow]
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return [fixture.releaseExitHandoffEventRow]
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return [fixture.runtimePublicationRow]
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return [omittedConsumerObservationRow]
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return omittedRuntimeEventRows
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return [omittedOutcomeRow]
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return omittedAccuracyRows
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return [omittedRecommendationActionRow]
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench?projectId=project-1')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
        'general_civil:runtime_business_type_attribution_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            hasRuntimeCloseoutClaim: false,
            missingReasons: expect.arrayContaining([
              'runtime_business_type_attribution_required',
              'runtime_closeout_claim_by_business_type_required',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('allows product outcome closeout once every supported business type has runtime outcome evidence across at least three plan options', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    const runtimeReadyFixtures = fixtures
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return runtimeReadyFixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    expect(response.body.success).toBe(true)
    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'ready',
      evidenceRefs: ['constructionOrganizationProductOutcomeCloseoutMatrixService'],
      missingReasons: [],
      details: expect.objectContaining({
        source: 'construction_organization_product_outcome_closeout_gate_detail',
        status: 'product_outcome_closeout_ready',
        precisionReplayReadyBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
        runtimeOutcomeReadyBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
        supportedBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_ready',
            hasRuntimeCloseoutClaim: true,
            hasRealRuntimeEvidenceSource: true,
            runtimeEvidenceSources: ['runtime'],
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 3,
            hasRequiredRuntimeOptionNetworkCoverage: true,
            hasRequiredRuntimeReadyOptionNetworkCoverage: true,
            missingReasons: [],
          }),
          expect.objectContaining({
            businessType: 'hospital',
            status: 'product_outcome_closeout_ready',
            hasRuntimeCloseoutClaim: true,
            hasRealRuntimeEvidenceSource: true,
            runtimeEvidenceSources: ['runtime'],
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 3,
            hasRequiredRuntimeOptionNetworkCoverage: true,
            hasRequiredRuntimeReadyOptionNetworkCoverage: true,
            missingReasons: [],
          }),
        ]),
      }),
    }))
    expect(response.body.data.remainingClosureGaps.map((gap: { key: string }) => gap.key))
      .not.toContain('construction_organization_product_outcome_closeout_matrix')
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.recommendation_actions'),
      [
        expect.arrayContaining(runtimeReadyFixtures.map((fixture) => fixture.draft.projectId)),
        'construction_organization_plan_network',
        expect.arrayContaining(runtimeReadyFixtures.map((fixture) => `construction_organization_plan_network:${fixture.publicationKey}`)),
        2000,
      ],
    )
  })

  it('counts distinct draft networks instead of collapsing A/B/C networks that reuse the same option id', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => {
      const projectId = `project-${index + 1}`
      const sharedOptionId = `option-${businessType}-shared`
      return [
        buildReadyConstructionOrganizationRouteFixture({
          projectId,
          businessType,
          optionId: sharedOptionId,
          selectedScenarioIds: [`${businessType}_network_a`],
        }),
        buildReadyConstructionOrganizationRouteFixture({
          projectId,
          businessType,
          optionId: sharedOptionId,
          selectedScenarioIds: [`${businessType}_network_b`],
        }),
        buildReadyConstructionOrganizationRouteFixture({
          projectId,
          businessType,
          optionId: sharedOptionId,
          selectedScenarioIds: [`${businessType}_network_c`],
        }),
      ]
    })
    const fixtures = fixtureSets.flat()
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return fixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'ready',
      missingReasons: [],
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            runtimeEvidenceOptionIds: ['option-general_civil-shared'],
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 3,
            runtimeReadyUseCaseOptionCloseoutClaimCounts: {
              newProjectPlanning: 3,
              startingLineOnboarding: 3,
              accelerationRecovery: 3,
            },
            hasRequiredRuntimeOptionNetworkCoverage: true,
            status: 'product_outcome_closeout_ready',
          }),
        ]),
      }),
    }))
  })

  it('does not reuse one site adoption across distinct draft networks that share the same option id', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => {
      const projectId = `project-${index + 1}`
      const sharedOptionId = `option-${businessType}-shared`
      return [
        buildReadyConstructionOrganizationRouteFixture({
          projectId,
          businessType,
          optionId: sharedOptionId,
          selectedScenarioIds: [`${businessType}_network_a`],
        }),
        buildReadyConstructionOrganizationRouteFixture({
          projectId,
          businessType,
          optionId: sharedOptionId,
          selectedScenarioIds: [`${businessType}_network_b`],
        }),
        buildReadyConstructionOrganizationRouteFixture({
          projectId,
          businessType,
          optionId: sharedOptionId,
          selectedScenarioIds: [`${businessType}_network_c`],
        }),
      ]
    })
    const fixtures = fixtureSets.flat()
    const adoptedFixtures = fixtureSets.map((fixtureSet) => fixtureSet[0])
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return adoptedFixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_ready_option_closeout_claim_coverage_required',
        'hospital:runtime_ready_option_closeout_claim_coverage_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            hasRuntimeCloseoutClaim: false,
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 1,
            hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: false,
            status: 'product_outcome_closeout_incomplete',
          }),
        ]),
      }),
    }))
  })

  it('does not reuse legacy option-id-only site adoption across distinct draft networks that share the same option id', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => {
      const projectId = `project-${index + 1}`
      const sharedOptionId = `option-${businessType}-shared`
      return [
        buildReadyConstructionOrganizationRouteFixture({
          projectId,
          businessType,
          optionId: sharedOptionId,
          selectedScenarioIds: [`${businessType}_network_a`],
        }),
        buildReadyConstructionOrganizationRouteFixture({
          projectId,
          businessType,
          optionId: sharedOptionId,
          selectedScenarioIds: [`${businessType}_network_b`],
        }),
        buildReadyConstructionOrganizationRouteFixture({
          projectId,
          businessType,
          optionId: sharedOptionId,
          selectedScenarioIds: [`${businessType}_network_c`],
        }),
      ]
    })
    const fixtures = fixtureSets.flat()
    const legacyAdoptedFixtures = fixtureSets.map((fixtureSet) => fixtureSet[0])
    const legacyOptionOnlyActions = legacyAdoptedFixtures.map((fixture) => ({
      ...fixture.recommendationActionRow,
      action_context: {
        optionId: fixture.recommendationActionRow.action_context.optionId,
        businessType: fixture.recommendationActionRow.action_context.businessType,
        decisionAction: 'adopted',
        writesRuntimeDirectly: false,
        writesFactDirectly: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
    }))
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return legacyOptionOnlyActions
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
        'general_civil:site_adoption_of_runtime_recommended_option_required',
        'hospital:runtime_closeout_claim_by_business_type_required',
        'hospital:site_adoption_of_runtime_recommended_option_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 0,
            hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: false,
            status: 'product_outcome_closeout_incomplete',
          }),
        ]),
      }),
    }))
  })

  it('does not treat pre-publication adoption as runtime site adoption evidence', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    const prePublicationActions = fixtures.map((fixture) => ({
      ...fixture.recommendationActionRow,
      adopted_at: '2026-06-22T01:30:00.000Z',
      action_context: {
        ...fixture.recommendationActionRow.action_context,
        decidedAt: '2026-06-22T01:30:00.000Z',
      },
    }))
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return prePublicationActions
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
        'general_civil:site_adoption_before_runtime_publication',
        'hospital:runtime_closeout_claim_by_business_type_required',
        'hospital:site_adoption_before_runtime_publication',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            hasRuntimeCloseoutClaim: false,
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 0,
            missingReasons: expect.arrayContaining([
              'site_adoption_before_runtime_publication',
            ]),
            status: 'product_outcome_closeout_incomplete',
          }),
        ]),
      }),
    }))
  })

  it('does not treat pre-publication runtime observations as runtime materialization evidence', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    const prePublicationRuntimeEvents = fixtures.flatMap((fixture) => fixture.runtimeEventRows.map((row) => ({
      ...row,
      executed_at: '2026-06-22T01:30:00.000Z',
    })))
    const prePublicationAccuracyRows = fixtures.flatMap((fixture) => fixture.accuracyRows.map((row) => ({
      ...row,
      backtested_at: '2026-06-22T01:30:00.000Z',
    })))
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.map((fixture) => ({
          ...fixture.consumerObservationRow,
          observed_at: '2026-06-22T01:30:00.000Z',
        }))
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return prePublicationRuntimeEvents
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.map((fixture) => ({
          ...fixture.outcomeRow,
          observed_at: '2026-06-22T01:30:00.000Z',
        }))
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return prePublicationAccuracyRows
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return fixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
        'general_civil:runtime_consumer_observation_before_publication',
        'general_civil:runtime_engine_evidence_before_publication',
        'hospital:runtime_closeout_claim_by_business_type_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            hasRuntimeCloseoutClaim: false,
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 0,
            runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 0,
            missingReasons: expect.arrayContaining([
              'runtime_consumer_observation_before_publication',
              'post_materialization_impact_monitoring_before_publication',
              'rollback_execution_before_publication',
              'saved_network_outcome_before_publication',
              'runtime_engine_evidence_before_publication',
            ]),
            status: 'product_outcome_closeout_incomplete',
          }),
        ]),
      }),
    }))
  })

  it('uses full company-scoped plan-network evidence for product outcome closeout instead of the paged admin list limit', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    const noiseCandidateRows = Array.from({ length: 210 }, (_, index) => ({
      id: `noise-event-${index}`,
      asset_key: `construction_organization.plan_option.noise-${index}`,
      source_module: 'constructionOrganizationScenarioGovernanceService',
      company_id: 'company-1',
      project_id: `noise-project-${index}`,
      event_status: 'review_required',
      runtime_effect: 'candidate_only',
      created_at: `2026-06-23T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
      updated_at: `2026-06-23T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
      candidate_payload: {},
    }))
    const allCandidateRows = [
      ...noiseCandidateRows,
      ...fixtures.map((fixture) => fixture.candidateEventRow),
    ]

    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        const { limit } = readPlanNetworkCandidateQueryArgs(params)
        const bounded = <T,>(rows: T[]) => Number.isFinite(limit) ? rows.slice(0, limit) : rows
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return bounded(allCandidateRows)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return bounded(fixtures.map((fixture) => fixture.handoffEventRow))
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return bounded(fixtures.map((fixture) => fixture.approvalEventRow))
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return bounded(fixtures.map((fixture) => fixture.releaseExitHandoffEventRow))
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return fixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'ready',
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
      }),
      missingReasons: [],
    }))
  })

  it('does not close product outcome from route-level runtime evidence with only one plan option per business type', async () => {
    const fixtures = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationRouteFixture({
        projectId: `project-${index + 1}`,
        businessType,
        optionId: `option-${businessType}`,
        selectedScenarioIds: [`${businessType}_single_project_organization`],
      }),
    )
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return fixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_option_network_coverage_required',
        'hospital:runtime_option_network_coverage_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            runtimeEvidenceOptionCount: 1,
            hasRequiredRuntimeOptionNetworkCoverage: false,
            missingReasons: expect.arrayContaining([
              'runtime_option_network_coverage_required',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not close product outcome when three route-level options include only one runtime-ready option per business type', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    const runtimeReadyFixtures = fixtureSets.map((fixtureSet) => fixtureSet.recommended)
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return runtimeReadyFixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return runtimeReadyFixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_option_network_coverage_required',
        'hospital:runtime_option_network_coverage_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            runtimeEvidenceOptionCount: 1,
            runtimeEvidenceRuntimeReadyOptionCount: 1,
            hasRequiredRuntimeOptionNetworkCoverage: false,
            hasRequiredRuntimeReadyOptionNetworkCoverage: false,
            missingReasons: expect.arrayContaining([
              'runtime_option_network_coverage_required',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not count product entry use cases from route options without complete runtime materialization evidence', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    const engineEvidenceOnlyFixtures = fixtureSets.map((fixtureSet) => fixtureSet.recommended)
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return engineEvidenceOnlyFixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return []
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return []
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return []
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return engineEvidenceOnlyFixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return []
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_closeout_claim_by_business_type_required',
        'hospital:runtime_consumer_observation_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            runtimeEvidenceOptionCount: 1,
            runtimeEvidenceRuntimeReadyOptionCount: 0,
            runtimeEvidenceUseCases: [],
            hasRequiredRuntimeUseCaseCoverage: false,
            hasRequiredRuntimeReadyOptionNetworkCoverage: false,
            missingReasons: expect.arrayContaining([
              'runtime_closeout_claim_by_business_type_required',
              'runtime_consumer_observation_required',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not close product outcome when runtime-ready route options split product entry point evidence', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
        splitUseCasesAcrossOptions: true,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return fixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_ready_use_case_option_coverage_required:newProjectPlanning',
        'hospital:runtime_ready_use_case_option_coverage_required:startingLineOnboarding',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 3,
            runtimeReadyUseCaseOptionCounts: {
              newProjectPlanning: 1,
              startingLineOnboarding: 1,
              accelerationRecovery: 1,
            },
            hasRequiredRuntimeReadyUseCaseOptionCoverage: false,
            missingReasons: expect.arrayContaining([
              'runtime_ready_use_case_option_coverage_required:newProjectPlanning',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not close product outcome when runtime-ready route options have non-actionable product entry evidence', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    for (const fixture of fixtures) {
      const useCaseEvaluations = fixture.candidateEventRow.candidate_payload.option.useCaseEvaluations
      const accelerationRecovery = useCaseEvaluations.accelerationRecovery as Record<string, unknown>
      useCaseEvaluations.accelerationRecovery = {
        ...accelerationRecovery,
        optionScore: null,
        actionability: 'not_actionable_after_current_phase',
      }
    }
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return fixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_ready_use_case_option_coverage_required:accelerationRecovery',
        'hospital:runtime_ready_use_case_option_coverage_required:accelerationRecovery',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 3,
            runtimeReadyUseCaseOptionCounts: {
              newProjectPlanning: 3,
              startingLineOnboarding: 3,
              accelerationRecovery: 0,
            },
            runtimeEvidenceUseCases: [
              'newProjectPlanning',
              'startingLineOnboarding',
            ],
            hasRequiredRuntimeUseCaseCoverage: false,
            hasRequiredRuntimeReadyUseCaseOptionCoverage: false,
            missingReasons: expect.arrayContaining([
              'runtime_use_case_coverage_required:accelerationRecovery',
              'runtime_ready_use_case_option_coverage_required:accelerationRecovery',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not close product outcome when runtime-ready route options have score-only product entry evidence without actionability', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    for (const fixture of fixtures) {
      const useCaseEvaluations = fixture.candidateEventRow.candidate_payload.option.useCaseEvaluations
      const accelerationRecovery = useCaseEvaluations.accelerationRecovery as Record<string, unknown>
      useCaseEvaluations.accelerationRecovery = {
        ...accelerationRecovery,
        optionScore: 79,
        actionability: undefined,
      }
    }
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return fixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_use_case_coverage_required:accelerationRecovery',
        'hospital:runtime_ready_use_case_option_coverage_required:accelerationRecovery',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            runtimeEvidenceUseCases: [
              'newProjectPlanning',
              'startingLineOnboarding',
            ],
            runtimeReadyUseCaseOptionCounts: {
              newProjectPlanning: 3,
              startingLineOnboarding: 3,
              accelerationRecovery: 0,
            },
            hasRequiredRuntimeUseCaseCoverage: false,
            hasRequiredRuntimeReadyUseCaseOptionCoverage: false,
            missingReasons: expect.arrayContaining([
              'runtime_use_case_coverage_required:accelerationRecovery',
              'runtime_ready_use_case_option_coverage_required:accelerationRecovery',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not close product outcome when A/B/C runtime-ready options do not all have site adoption closeout claims', async () => {
    const fixtureSets = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}`,
      }),
    )
    const fixtures = fixtureSets.flatMap((fixtureSet) => fixtureSet.all)
    const adoptedFixtures = fixtureSets.map((fixtureSet) => fixtureSet.recommended)
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return adoptedFixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_ready_option_closeout_claim_coverage_required',
        'hospital:runtime_ready_option_closeout_claim_coverage_required',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            status: 'product_outcome_closeout_incomplete',
            runtimeEvidenceOptionCount: 3,
            runtimeEvidenceRuntimeReadyOptionCount: 3,
            hasRequiredRuntimeReadyOptionNetworkCoverage: true,
            hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: false,
            missingReasons: expect.arrayContaining([
              'runtime_ready_option_closeout_claim_coverage_required',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('does not close product outcome when product-entry evidence and adoption closeout belong to different A/B/C options', async () => {
    const useCaseOnlyFixtures = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.flatMap((businessType, index) =>
      buildReadyConstructionOrganizationOptionSetRouteFixtures({
        projectId: `project-${index + 1}`,
        businessType,
        optionPrefix: `option-${businessType}-entry`,
      }).all,
    )
    const closeoutOnlyFixtures = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.flatMap((businessType, index) => [
      buildReadyConstructionOrganizationRouteFixture({
        projectId: `project-${index + 1}`,
        businessType,
        optionId: `option-${businessType}-adopted-a`,
        selectedScenarioIds: [`${businessType}_adopted_a`],
        useCaseEvaluations: {},
      }),
      buildReadyConstructionOrganizationRouteFixture({
        projectId: `project-${index + 1}`,
        businessType,
        optionId: `option-${businessType}-adopted-b`,
        selectedScenarioIds: [`${businessType}_adopted_b`],
        useCaseEvaluations: {},
      }),
      buildReadyConstructionOrganizationRouteFixture({
        projectId: `project-${index + 1}`,
        businessType,
        optionId: `option-${businessType}-adopted-c`,
        selectedScenarioIds: [`${businessType}_adopted_c`],
        useCaseEvaluations: {},
      }),
    ])
    const fixtures = [...useCaseOnlyFixtures, ...closeoutOnlyFixtures]
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('FROM public.algorithm_asset_candidate_events')) {
        const { assetPattern } = readPlanNetworkCandidateQueryArgs(params)
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return fixtures.map((fixture) => fixture.candidateEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_handoff.')) {
          return fixtures.map((fixture) => fixture.handoffEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_approval.')) {
          return fixtures.map((fixture) => fixture.approvalEventRow)
        }
        if (assetPattern.startsWith('construction_organization.plan_network_release_exit_handoff.')) {
          return fixtures.map((fixture) => fixture.releaseExitHandoffEventRow)
        }
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_publications')) {
        return fixtures.map((fixture) => fixture.runtimePublicationRow)
      }
      if (sqlText.includes('FROM public.runtime_consumer_observations')) {
        return fixtures.flatMap((fixture) => fixture.consumerObservationRows)
      }
      if (sqlText.includes('FROM public.construction_organization_plan_network_runtime_events')) {
        return fixtures.flatMap((fixture) => fixture.runtimeEventRows)
      }
      if (sqlText.includes('FROM public.duration_plan_network_outcomes')) {
        return fixtures.flatMap((fixture) => fixture.outcomeRows)
      }
      if (sqlText.includes('FROM public.duration_algorithm_accuracy_events')) {
        return fixtures.flatMap((fixture) => fixture.accuracyRows)
      }
      if (sqlText.includes('FROM public.recommendation_actions')) {
        return closeoutOnlyFixtures.flatMap((fixture) => fixture.recommendationActionRows)
      }
      return []
    })

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(200)

    const productOutcomeGate = response.body.data.gates.find((gate: { key: string }) =>
      gate.key === 'construction_organization_product_outcome_closeout_matrix',
    )
    expect(productOutcomeGate).toEqual(expect.objectContaining({
      status: 'needs_work',
      missingReasons: expect.arrayContaining([
        'general_civil:runtime_ready_use_case_option_closeout_claim_coverage_required:newProjectPlanning',
        'hospital:runtime_ready_use_case_option_closeout_claim_coverage_required:accelerationRecovery',
      ]),
      details: expect.objectContaining({
        runtimeOutcomeReadyBusinessTypeCount: 0,
        businessTypeRows: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            runtimeEvidenceRuntimeReadyOptionCount: 6,
            runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 3,
            runtimeReadyUseCaseOptionCounts: {
              newProjectPlanning: 3,
              startingLineOnboarding: 3,
              accelerationRecovery: 3,
            },
            runtimeReadyUseCaseOptionCloseoutClaimCounts: {
              newProjectPlanning: 0,
              startingLineOnboarding: 0,
              accelerationRecovery: 0,
            },
            hasRequiredRuntimeReadyUseCaseOptionCoverage: true,
            hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: true,
            hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage: false,
            missingReasons: expect.arrayContaining([
              'runtime_ready_use_case_option_closeout_claim_coverage_required:newProjectPlanning',
            ]),
          }),
        ]),
      }),
    }))
  })

  it('exposes construction organization plan-network drafts as read-only governance evidence', async () => {
    mocks.executeSQL.mockResolvedValueOnce([
      {
        id: 'event-ready',
        asset_key: 'construction_organization.plan_option.option-ready',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: 'company-1',
        project_id: 'project-1',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: {
          option: {
            optionId: 'option-ready',
            selectedScenarioIds: ['pile_before_excavation'],
            engineEvaluationSummary: {
              source: 'construction_organization_plan_option_engine_evaluation_summary',
              e3: { projectDurationDays: 30 },
              e5: { recoveryFactorHint: 1.06, recoverableSpanDays: 4 },
            },
            useCaseEvaluations: {
              newProjectPlanning: {
                useCase: 'new_project_planning',
                optionScore: 73,
                actionability: 'actionable_candidate',
              },
              startingLineOnboarding: {
                useCase: 'starting_line_onboarding',
                optionScore: 62,
                actionability: 'evidence_only',
              },
              accelerationRecovery: {
                useCase: 'acceleration_recovery',
                optionScore: 79,
                recoveryFactorHint: 1.06,
                e5RecoverableSpanDays: 4,
                actionability: 'actionable_candidate',
              },
            },
            generatedRowProjection: {
              generatedRowReferenceDurationEvidence: {
                source: 'generated_wbs_row_reference_duration_projection',
                matchedReferenceRowCount: 2,
                totalPlanReferenceDays: 30,
                totalContextualReferenceDays: 32,
                totalRecommendedDurationDays: 31,
                writesReferenceDuration: false,
                writesPlanDates: false,
                writesSeed: false,
              },
              generatedRowNetworkEvaluation: {
                source: 'generated_wbs_row_candidate_network_cpm',
                projectedNetworkSpanDays: 30,
                previewEdgeCount: 1,
                unresolvedEdgeCount: 0,
                criticalGeneratedRowIds: ['row-foundation', 'row-earthwork'],
                materializationStatus: 'fully_mapped_read_only',
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              },
              materializationReviewPackage: {
                source: 'construction_organization_candidate_materialization_review_package',
                packageBasis: 'manual_review_package_from_generated_row_preview_edges',
                optionId: 'option-ready',
                status: 'ready_for_manual_review',
                allowManualReview: true,
                proposedDependencyEdgeCount: 1,
                blockedReasons: [],
                proposedDependencyEdges: [{
                  fromGeneratedRowId: 'row-foundation',
                  toGeneratedRowId: 'row-earthwork',
                  dependencyType: 'FS',
                  lagDays: 0,
                  intent: 'pile_before_earthwork_bulk_excavation',
                  fromVirtualNodeId: 'foundation-work',
                  toVirtualNodeId: 'earthwork-work',
                  operation: 'propose_create_dependency',
                  writesTaskDependencies: false,
                }],
                reviewRequired: true,
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              },
            },
          },
        },
      },
    ])
    mocks.executeSQL.mockResolvedValueOnce([])
    mocks.executeSQL.mockResolvedValueOnce([])
    mocks.executeSQL.mockResolvedValueOnce([])
    mocks.executeSQL.mockResolvedValueOnce([])
    mocks.executeSQL.mockResolvedValueOnce([])
    mocks.executeSQL.mockResolvedValueOnce([])
    mocks.executeSQL.mockResolvedValueOnce([])

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench/construction-organization/plan-network-drafts?projectId=project-1&limit=5')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalDraftCount: 1,
      readyForReplayCount: 1,
      evaluationReadyCount: 1,
      totalEdgeCount: 1,
      totalReleaseExitHandoffCount: 0,
      linkedReleaseExitHandoffCount: 0,
      runtimeMaterializationReadiness: expect.objectContaining({
        source: 'construction_organization_plan_network_runtime_materialization_readiness',
        status: 'blocked_pending_release_exit_handoff',
        canMaterializeRuntime: false,
        missingBeforeRuntime: expect.arrayContaining([
          'release_exit_handoff_candidate_event_required',
          'domain_writer_runtime_execution_required',
        ]),
      }),
      recommendedDrafts: expect.objectContaining({
        newProjectPlanning: expect.objectContaining({
          optionId: 'option-ready',
        }),
        accelerationRecovery: expect.objectContaining({
          optionId: 'option-ready',
          e5RecoverableSpanDays: 4,
        }),
      }),
      boundaryPolicy: expect.arrayContaining([
        'plan_network_draft_is_not_runtime_materialization',
        'no_task_dependencies_write',
      ]),
    }))
    expect(response.body.data.items[0]).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_draft',
      optionId: 'option-ready',
      readiness: 'ready_for_replay',
      edgeCount: 1,
      evaluationEvidence: expect.objectContaining({
        evaluationStatus: 'evaluation_ready',
        e1: expect.objectContaining({ matchedReferenceRowCount: 2 }),
        e3: expect.objectContaining({ projectedNetworkSpanDays: 30 }),
        e5: expect.objectContaining({ e5RecoverableSpanDays: 4 }),
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
      releaseExitAssessment: expect.objectContaining({
        source: 'construction_organization_plan_network_release_exit_assessment',
        status: 'manual_review_handoff_required',
        canMaterializeRuntime: false,
        approvalCandidateEventId: null,
        requiredBeforeRuntime: expect.arrayContaining([
          'manual_review_handoff_required',
          'domain_writer_release_exit_required',
          'runtime_consumer_verification_required',
          'impact_monitoring_required',
          'rollback_target_required',
        ]),
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.algorithm_asset_candidate_events'),
      ['company-1', 'project-1', 'construction_organization.plan_option.%', 'constructionOrganizationScenarioGovernanceService', 5],
    )
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.algorithm_asset_candidate_events'),
      ['company-1', 'project-1', 'construction_organization.plan_network_handoff.%', 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff', 5],
    )
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.algorithm_asset_candidate_events'),
      ['company-1', 'project-1', 'construction_organization.plan_network_approval.%', 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval', 5],
    )
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.algorithm_asset_candidate_events'),
      ['company-1', 'project-1', 'construction_organization.plan_network_release_exit_handoff.%', 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff', 5],
    )
  })

  it('rejects v1.4.22.3 governance workbench readiness for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-workbench')
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('exposes v1.4.22.3 completion audit as a conservative admin-only diagnostic', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-completion-audit')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      reportCode: 'v14223_completion_audit',
      declarationStatus: 'current_snapshot_gate_passed',
      canDeclareChapterCompletionCandidate: false,
      canDeclareV14223GovernanceComplete: false,
      requiredSurfaces: expect.arrayContaining([
        'machine_execution_boundaries',
        'runtime_writer_consumer_monitoring_rollback',
        'old_object_handling',
        'llm_candidate_gate_rerun',
      ]),
      missingReasons: expect.arrayContaining([
        'section_14_acceptance_criteria_completion_evidence_required',
        'workbench_readiness_gates_must_all_be_ready',
        'construction_organization_runtime_closeout_claim:release_exit_handoff_candidate_event_required',
        'construction_organization_runtime_closeout_claim:domain_writer_runtime_execution_required',
        'construction_organization_product_outcome_closeout_matrix:hospital:runtime_closeout_claim_by_business_type_required',
        'remaining_closure_gap:construction_organization_runtime_closeout_claim',
        'remaining_closure_gap:construction_organization_product_outcome_closeout_matrix',
        'machine_execution_boundaries:evidence_level_not_completion_ready:evidence_layer_only',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'completion_audit_does_not_grant_publish_rights',
        'v14223_governance_complete_current_snapshot_does_not_grant_publish_rights',
        'v14223_governance_complete_current_snapshot_is_not_future_asset_whitelist',
        'future_asset_or_llm_candidate_changes_must_rerun_completion_audit',
      ]),
    }))
    expect(response.body.data.recordResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'runtime_writer_consumer_monitoring_rollback',
        status: 'verified',
        missingReasons: [],
      }),
    ]))
    expect(response.body.data.missingReasons).not.toContain('runtime_surface_closure_evidence_required')
    expect(response.body.data.missingReasons).not.toContain('machine_execution_guardrail_audit_required')
    expect(response.body.data.missingReasons).not.toContain('hard_decision_table_audit_required')
    expect(mocks.collectAlgorithmAssetGovernanceDashboardEvidence).toHaveBeenCalledWith({
      companyId: 'company-1',
    })
  })

  it('rejects v1.4.22.3 completion audit for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/rule-assets/governance-completion-audit')
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('routes v1.4.22.3 governance workbench operations through the controlled operation contract', async () => {
    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'release_exit_handoff',
        assetType: 'learnable_parameter',
        evidenceToken: 'manual-admin-evidence-1',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      reasons: ['domain_writer_dependency_required'],
    }))
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      evidenceToken: 'manual-admin-evidence-1',
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      queryExec: mocks.executeSQL,
    }))
  })

  it('rejects a duration runtime rollback whose canonical source publication belongs to another company', async () => {
    const rows = [
      durationLearningRuntimePublicationIdentityRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:foreign',
        companyId: 'company-2',
      }),
      durationLearningRuntimePublicationIdentityRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:foreign:previous',
        companyId: 'company-2',
      }),
    ]
    mocks.executeSQL.mockImplementation(async (_sql: string, params: unknown[] = []) => (
      rows.filter((row) => row.publication_key === String(params[0] ?? ''))
    ))

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_rollback',
        assetType: 'template_seed',
        evidenceToken: 'rollback-cross-company-source',
        domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
        sourcePublicationKey: 'duration_learning_runtime:special_work_duration_seed:foreign',
        rollbackTarget: 'duration_learning_runtime:special_work_duration_seed:foreign:previous',
        rollbackReason: 'cross_company_attempt',
        consumerVerificationRefs: ['resolver'],
        rollbackWriterRefs: ['writer'],
      })
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN_COMPANY_SCOPE')
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
  })

  it('rejects a duration runtime rollback target with a different canonical tenant or artifact identity', async () => {
    const rows = [
      durationLearningRuntimePublicationIdentityRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:source',
        companyId: 'company-1',
        artifactKey: 'artifact-source',
      }),
      durationLearningRuntimePublicationIdentityRow({
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:target',
        companyId: 'company-2',
        artifactKey: 'artifact-target',
      }),
    ]
    mocks.executeSQL.mockImplementation(async (_sql: string, params: unknown[] = []) => (
      rows.filter((row) => row.publication_key === String(params[0] ?? ''))
    ))

    await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_rollback',
        assetType: 'template_seed',
        evidenceToken: 'rollback-cross-company-target',
        domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
        sourcePublicationKey: 'duration_learning_runtime:special_work_duration_seed:source',
        rollbackTarget: 'duration_learning_runtime:special_work_duration_seed:target',
        rollbackReason: 'cross_company_target_attempt',
        consumerVerificationRefs: ['resolver'],
        rollbackWriterRefs: ['writer'],
      })
      .expect(403)

    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
  })

  it('rejects a duration runtime rollback when the optional project does not match publication scope', async () => {
    const rows = [
      durationLearningRuntimePublicationIdentityRow({
        publicationKey: 'duration_learning_runtime:dependency_rule_candidate:source',
        assetKey: 'dependency_rule_candidate',
        artifactKey: 'artifact-dependency',
        scopeLevel: 'project',
        projectId: 'project-2',
      }),
      durationLearningRuntimePublicationIdentityRow({
        publicationKey: 'duration_learning_runtime:dependency_rule_candidate:previous',
        assetKey: 'dependency_rule_candidate',
        artifactKey: 'artifact-dependency',
        scopeLevel: 'project',
        projectId: 'project-2',
      }),
    ]
    mocks.executeSQL.mockImplementation(async (_sql: string, params: unknown[] = []) => (
      rows.filter((row) => row.publication_key === String(params[0] ?? ''))
    ))

    await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_rollback',
        assetType: 'dependency_rule',
        evidenceToken: 'rollback-project-mismatch',
        projectId: 'project-1',
        domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
        sourcePublicationKey: 'duration_learning_runtime:dependency_rule_candidate:source',
        rollbackTarget: 'duration_learning_runtime:dependency_rule_candidate:previous',
        rollbackReason: 'project_mismatch_attempt',
        consumerVerificationRefs: ['resolver'],
        rollbackWriterRefs: ['writer'],
      })
      .expect(403)

    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
  })

  it('passes an authorized same-project duration rollback to the identity-validating workbench', async () => {
    const rows = [
      durationLearningRuntimePublicationIdentityRow({
        publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:source',
        assetKey: 'critical_path_rule_candidate',
        artifactKey: 'artifact-critical-path',
        scopeLevel: 'project',
        projectId: 'project-1',
      }),
      durationLearningRuntimePublicationIdentityRow({
        publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:previous',
        assetKey: 'critical_path_rule_candidate',
        artifactKey: 'artifact-critical-path',
        scopeLevel: 'project',
        projectId: 'project-1',
      }),
    ]
    mocks.executeSQL.mockImplementation(async (_sql: string, params: unknown[] = []) => (
      rows.filter((row) => row.publication_key === String(params[0] ?? ''))
    ))

    await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_rollback',
        assetType: 'dependency_rule',
        evidenceToken: 'rollback-same-project',
        projectId: 'project-1',
        domainWriterKey: 'durationLearningRuntimePublicationService.rollbackDurationLearningRuntimePublication',
        sourcePublicationKey: 'duration_learning_runtime:critical_path_rule_candidate:source',
        rollbackTarget: 'duration_learning_runtime:critical_path_rule_candidate:previous',
        rollbackReason: 'same_project_rollback',
        consumerVerificationRefs: ['resolver'],
        rollbackWriterRefs: ['writer'],
      })
      .expect(200)

    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_rollback',
      assetType: 'dependency_rule',
      companyId: 'company-1',
      projectId: 'project-1',
      queryExec: mocks.executeSQL,
    }))
  })

  it('fails closed before the domain writer when a high-risk runtime action is not enabled', async () => {
    vi.stubEnv('WORKBUDDY_RULE_ASSET_RUNTIME_ACTIONS_ENABLED', 'false')

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_apply',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'runtime-action-disabled',
        projectId: 'project-1',
      })
      .expect(409)

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'ACTION_READINESS_GATED',
      },
    })
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
  })

  it('routes construction organization draft manual-review handoff through the controlled operation contract', async () => {
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      reasons: [],
      domainResult: {
        status: 'manual_review_handoff_ready',
        writesTaskDependencies: false,
      },
      boundaryPolicy: ['workbench_never_writes_runtime_directly'],
    })
    const draft = {
      source: 'construction_organization_plan_network_draft',
      draftNetworkKey: 'sha256:draft',
      readiness: 'ready_for_replay',
    }

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'manual_review_handoff',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'manual-review-evidence-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
        consumerVerificationRefs: ['ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations'],
        constructionOrganizationPlanNetworkDraft: draft,
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
    }))
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'manual-review-evidence-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      consumerVerificationRefs: ['ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations'],
      constructionOrganizationPlanNetworkDraft: draft,
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      queryExec: mocks.executeSQL,
    }))
  })

  it('routes construction organization runtime apply with project scope through the controlled operation contract', async () => {
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      reasons: [],
      domainResult: {
        source: 'construction_organization_plan_network_domain_writer',
        status: 'runtime_apply_ready',
        canMaterializeRuntime: true,
        insertedDependencyCount: 1,
        writesTaskDependencies: true,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
      boundaryPolicy: ['workbench_never_writes_runtime_directly'],
    })
    const draft = {
      source: 'construction_organization_plan_network_draft',
      draftNetworkKey: 'sha256:runtime-ready',
      readiness: 'ready_for_replay',
      edgeCount: 1,
      evaluationEvidence: { evaluationStatus: 'evaluation_ready' },
      manualReviewHandoff: { candidateEventId: 'handoff-event-ready' },
      manualReviewApproval: { candidateEventId: 'approval-event-ready' },
      releaseExitHandoff: {
        candidateEventId: 'release-exit-event-ready',
        releaseRecordTarget: 'construction-organization-plan-network-release:sha256:runtime-ready',
        rollbackTarget: 'construction-organization-plan-network-rollback:sha256:runtime-ready',
      },
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
      edges: [{
        edgeId: 'edge-1',
        fromGeneratedRowId: 'row-a',
        toGeneratedRowId: 'row-b',
        dependencyType: 'FS',
        lagDays: 0,
        intent: 'shared_basement_structure_before_tower_full_release',
        writesTaskDependencies: false,
      }],
    }

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_apply',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'runtime-apply-evidence-1',
        projectId: 'project-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
        releaseRecordTarget: 'construction-organization-plan-network-release:sha256:runtime-ready',
        rollbackTarget: 'construction-organization-plan-network-rollback:sha256:runtime-ready',
        consumerVerificationRefs: [
          'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
          'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
        ],
        impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
        rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
        constructionOrganizationPlanNetworkDraft: draft,
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
    }))
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'runtime-apply-evidence-1',
      projectId: 'project-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      releaseRecordTarget: 'construction-organization-plan-network-release:sha256:runtime-ready',
      rollbackTarget: 'construction-organization-plan-network-rollback:sha256:runtime-ready',
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
      ],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
      constructionOrganizationPlanNetworkDraft: draft,
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      queryExec: mocks.executeSQL,
    }))
  })

  it('preserves construction organization product outcome business type through the controlled operation route', async () => {
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
      reasons: [],
      domainResult: {
        status: 'saved_network_outcome_recorded',
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      boundaryPolicy: ['workbench_never_writes_runtime_directly'],
    })

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_saved_outcome',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'construction-org-product-outcome:hospital:runtime_saved_outcome:publication-hospital',
        businessType: 'hospital',
        projectId: 'project-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
        sourcePublicationKey: 'publication-hospital',
        releaseRecordTarget: 'construction-organization-plan-network-outcome:publication-hospital',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
    }))
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-product-outcome:hospital:runtime_saved_outcome:publication-hospital',
      businessType: 'hospital',
      projectId: 'project-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
      sourcePublicationKey: 'publication-hospital',
      releaseRecordTarget: 'construction-organization-plan-network-outcome:publication-hospital',
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      queryExec: mocks.executeSQL,
    }))
  })

  it('preserves construction organization runtime engine evidence payload through the controlled operation route', async () => {
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
      reasons: [],
      domainResult: {
        status: 'runtime_engine_evidence_recorded',
        engineCode: 'standard_duration_reference',
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      boundaryPolicy: ['workbench_never_writes_runtime_directly'],
    })

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_engine_evidence',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'construction-org-product-outcome:hospital:runtime_engine_evidence:publication-hospital',
        workPackageKey: 'construction_organization_product_outcome:hospital',
        useCase: 'newProjectPlanning',
        evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
        businessType: 'hospital',
        projectId: 'project-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
        sourcePublicationKey: 'publication-hospital',
        engineCode: 'standard_duration_reference',
        predictedDurationDays: 180,
        actualDurationDays: 184,
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
    }))
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-product-outcome:hospital:runtime_engine_evidence:publication-hospital',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'newProjectPlanning',
      evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
      businessType: 'hospital',
      projectId: 'project-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
      sourcePublicationKey: 'publication-hospital',
      engineCode: 'standard_duration_reference',
      predictedDurationDays: 180,
      actualDurationDays: 184,
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      queryExec: mocks.executeSQL,
    }))
  })

  it('preserves construction organization runtime consumer observation payload through the controlled operation route', async () => {
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_consumer_observation',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
      reasons: [],
      domainResult: {
        status: 'runtime_consumer_observations_recorded',
        recordedCount: 1,
        writesRuntimeDirectly: false,
        writesFactDirectly: false,
      },
      boundaryPolicy: ['workbench_never_writes_runtime_directly'],
    })

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_consumer_observation',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'construction-org-product-outcome:hospital:runtime_consumer_observation:publication-hospital',
        workPackageKey: 'construction_organization_product_outcome:hospital',
        useCase: 'accelerationRecovery',
        evidenceAction: 'record_runtime_consumer_observation_for_business_type',
        businessType: 'hospital',
        projectId: 'project-1',
        domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
        sourcePublicationKey: 'publication-hospital',
        releaseRecordTarget: 'duration_plan_network_outcomes:publication-hospital',
        consumerVerificationRefs: ['duration_plan_network_outcomes:publication-hospital'],
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_consumer_observation',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
    }))
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_consumer_observation',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-product-outcome:hospital:runtime_consumer_observation:publication-hospital',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'accelerationRecovery',
      evidenceAction: 'record_runtime_consumer_observation_for_business_type',
      businessType: 'hospital',
      projectId: 'project-1',
      domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
      sourcePublicationKey: 'publication-hospital',
      releaseRecordTarget: 'duration_plan_network_outcomes:publication-hospital',
      consumerVerificationRefs: ['duration_plan_network_outcomes:publication-hospital'],
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      queryExec: mocks.executeSQL,
    }))
  })

  it('preserves construction organization workbench suggestion attribution and caller event chronology', async () => {
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_consumer_observation',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
      reasons: [],
      domainResult: {
        status: 'runtime_consumer_observations_recorded',
        recordedCount: 1,
        writesRuntimeDirectly: false,
        writesFactDirectly: false,
      },
      boundaryPolicy: ['workbench_never_writes_runtime_directly'],
    })

    await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_consumer_observation',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'construction-organization-closeout:hospital:runtime_consumer_observation:publication-hospital:draft-hospital',
        workPackageKey: 'construction_organization_product_outcome:hospital',
        evidenceAction: 'record_runtime_consumer_observation_for_business_type',
        businessType: 'hospital',
        companyId: 'spoofed-company',
        requestedByUserId: 'spoofed-user',
        projectId: 'project-1',
        domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
        sourcePublicationKey: 'publication-hospital',
        optionId: 'option-hospital',
        draftNetworkKey: 'draft-hospital',
        releaseRecordTarget: 'option-hospital',
        rollbackTarget: 'draft-hospital',
        executedAt: '2026-06-24T12:00:00.000Z',
        consumerVerificationRefs: [
          'constructionOrganizationProductOutcomeCloseoutMatrixService.nextEvidenceWorkPackages',
        ],
        impactMonitoringRefs: ['constructionOrganizationPlanNetworkRuntimeEvidenceJob.impactMonitoring'],
        rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
        selectedScenarioIds: ['pile_before_excavation', 'tower_early_release'],
      })
      .expect(200)

    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_consumer_observation',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-organization-closeout:hospital:runtime_consumer_observation:publication-hospital:draft-hospital',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      evidenceAction: 'record_runtime_consumer_observation_for_business_type',
      businessType: 'hospital',
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      projectId: 'project-1',
      domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
      sourcePublicationKey: 'publication-hospital',
      optionId: 'option-hospital',
      draftNetworkKey: 'draft-hospital',
      releaseRecordTarget: 'option-hospital',
      rollbackTarget: 'draft-hospital',
      executedAt: '2026-06-24T12:00:00.000Z',
      consumerVerificationRefs: [
        'constructionOrganizationProductOutcomeCloseoutMatrixService.nextEvidenceWorkPackages',
      ],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkRuntimeEvidenceJob.impactMonitoring'],
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
      selectedScenarioIds: ['pile_before_excavation', 'tower_early_release'],
      queryExec: mocks.executeSQL,
    }))
    const delegated = mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mock.calls.at(-1)?.[0]
    expect(delegated.executedAt).toBe('2026-06-24T12:00:00.000Z')
  })

  it('preserves construction organization recommendation adoption payload through the controlled operation route', async () => {
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      reasons: [],
      domainResult: {
        status: 'recommendation_decision_recorded',
        recommendationKey: 'construction_organization_plan_network:option-hospital',
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      boundaryPolicy: ['workbench_never_writes_runtime_directly'],
    })

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_recommendation_adopt',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'construction-org-product-outcome:hospital:runtime_recommendation_adopt:publication-hospital',
        businessType: 'hospital',
        projectId: 'project-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
        sourcePublicationKey: 'publication-hospital',
        optionId: 'option-hospital',
        draftNetworkKey: 'sha256:hospital',
        releaseRecordTarget: 'option-hospital',
        rollbackTarget: 'sha256:hospital',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-product-outcome:hospital:runtime_recommendation_adopt:publication-hospital',
      businessType: 'hospital',
      projectId: 'project-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      sourcePublicationKey: 'publication-hospital',
      optionId: 'option-hospital',
      draftNetworkKey: 'sha256:hospital',
      releaseRecordTarget: 'option-hospital',
      rollbackTarget: 'sha256:hospital',
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      queryExec: mocks.executeSQL,
    }))
  })

  it('preserves construction organization runtime monitoring and rollback payloads through the controlled operation route', async () => {
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation
      .mockResolvedValueOnce({
        status: 'operation_delegated',
        operationAction: 'runtime_impact_monitoring',
        assetType: 'construction_organization_plan_network',
        writesRuntimeDirectly: false,
        workbenchDoesNotGrantPublishRights: true,
        delegatedToDomainWriter: true,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        reasons: [],
        domainResult: {
          status: 'runtime_event_recorded',
          eventType: 'impact_monitoring',
          writesTaskDependencies: false,
          writesPlanDates: false,
        },
        boundaryPolicy: ['workbench_never_writes_runtime_directly'],
      })
      .mockResolvedValueOnce({
        status: 'operation_delegated',
        operationAction: 'runtime_rollback_execution',
        assetType: 'construction_organization_plan_network',
        writesRuntimeDirectly: false,
        workbenchDoesNotGrantPublishRights: true,
        delegatedToDomainWriter: true,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        reasons: [],
        domainResult: {
          status: 'runtime_event_recorded',
          eventType: 'rollback_execution',
          writesTaskDependencies: false,
          writesPlanDates: false,
        },
        boundaryPolicy: ['workbench_never_writes_runtime_directly'],
      })

    await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_impact_monitoring',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'construction-org-product-outcome:hospital:runtime_impact_monitoring:publication-hospital',
        businessType: 'hospital',
        projectId: 'project-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        sourcePublicationKey: 'publication-hospital',
        consumerVerificationRefs: ['constructionOrganizationProductOutcomeCloseoutMatrixService.nextEvidenceWorkItems'],
        impactMonitoringRefs: ['constructionOrganizationPlanNetworkRuntimeEvidenceService.impactMonitoring'],
      })
      .expect(200)

    await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_rollback_execution',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'construction-org-product-outcome:hospital:runtime_rollback_execution:publication-hospital',
        businessType: 'hospital',
        projectId: 'project-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        sourcePublicationKey: 'publication-hospital',
        rollbackTarget: 'construction-organization-plan-network-rollback:publication-hospital',
        rollbackReason: 'product outcome closeout rollback evidence',
        rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
      })
      .expect(200)

    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: 'runtime_impact_monitoring',
      assetType: 'construction_organization_plan_network',
      businessType: 'hospital',
      projectId: 'project-1',
      sourcePublicationKey: 'publication-hospital',
      consumerVerificationRefs: ['constructionOrganizationProductOutcomeCloseoutMatrixService.nextEvidenceWorkItems'],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkRuntimeEvidenceService.impactMonitoring'],
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      queryExec: mocks.executeSQL,
    }))
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: 'runtime_rollback_execution',
      assetType: 'construction_organization_plan_network',
      businessType: 'hospital',
      projectId: 'project-1',
      sourcePublicationKey: 'publication-hospital',
      rollbackTarget: 'construction-organization-plan-network-rollback:publication-hospital',
      rollbackReason: 'product outcome closeout rollback evidence',
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      queryExec: mocks.executeSQL,
    }))
  })

  it('rejects construction organization runtime apply when the project belongs to another company', async () => {
    mocks.projectCompanyId = 'company-2'

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'runtime_apply',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'runtime-apply-evidence-foreign-project',
        projectId: 'project-foreign',
        domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
        consumerVerificationRefs: ['ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations'],
        impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
        rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
        constructionOrganizationPlanNetworkDraft: {
          source: 'construction_organization_plan_network_draft',
          draftNetworkKey: 'sha256:foreign',
          readiness: 'ready_for_replay',
        },
      })
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN_COMPANY_SCOPE')
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
  })

  it('rejects v1.4.22.3 governance workbench operations for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'release_exit_handoff',
        assetType: 'learnable_parameter',
        evidenceToken: 'manual-admin-evidence-1',
      })
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
  })

  it('returns the algorithm catalog through the planning seed governance route', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/catalog/algorithms')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      expect.objectContaining({
        algorithmKey: 'baselineGenerationService',
        ordinaryUserVisible: false,
      }),
    ])
    expect(mocks.listAlgorithmCatalogEntries).toHaveBeenCalledTimes(1)
  })

  it('returns algorithm caliber versions through the planning seed governance route', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/catalog/caliber-versions')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual([
      expect.objectContaining({
        algorithmKey: 'baselineGenerationService',
        caliberVersion: 'v1.4.22-current-code-facts',
      }),
    ])
    expect(mocks.listAlgorithmCaliberVersions).toHaveBeenCalledTimes(1)
  })

  it('returns registry seeds and catalog-only rule assets through the seed catalog endpoint', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/catalog/seeds')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ seedKey: 'workflow_dictionary', registryStatus: 'registry_seed' }),
      expect.objectContaining({ seedKey: 'dataQualityRuleRegistry', registryStatus: 'catalog_only' }),
    ]))
    expect(mocks.listAlgorithmSeedCatalogEntries).toHaveBeenCalledTimes(1)
  })

  it('returns algorithm catalog diagnostics without ordinary frontend exposure', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/catalog/diagnostics')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'pass',
      summary: expect.objectContaining({
        algorithmCatalogCount: 32,
        ordinaryUserVisibleAlgorithmCount: 0,
      }),
      gaps: expect.objectContaining({
        missingRegistrySeedCatalogEntries: [],
      }),
    }))
    expect(mocks.getAlgorithmGovernanceCatalogDiagnostics).toHaveBeenCalledTimes(1)
  })

  it('returns the shared v1.4 automated admission diagnostics for data metric and rule assets', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/catalog/admission-automation')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'pass',
      summary: expect.objectContaining({
        autoDiscoveredCount: 0,
        handRegistrationMissingCount: 0,
        dataAdmissionAssetCount: 6,
        metricAdmissionAssetCount: 25,
      }),
      blockers: [],
      reviewItems: [],
      boundaryPolicy: expect.arrayContaining(['auto_discovery_is_the_default_for_new_v14_assets']),
    }))
    expect(mocks.evaluateV14AssetAdmissionAutomation).toHaveBeenCalledTimes(1)
  })

  it('exposes standard duration P50 replay as an admin-only report-only governance endpoint', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/standard-duration/replay-report')
      .query({
        projectId: 'project-1',
        minSamplesPerCode: '3',
        maxSamples: '50',
        toleranceRatio: '0.3',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      reportCode: 'standard_work_duration_seed_replay_governance',
      replay: expect.objectContaining({
        governancePolicy: {
          replayMode: 'report_only',
          seedWritePolicy: 'never_write_seed_from_replay',
          candidatePolicy: 'review_required_before_seed_promotion',
        },
        summary: expect.objectContaining({
          evaluatedCodeCount: 2,
          reviewRequiredCodeCount: 1,
        }),
      }),
    }))
    expect(mocks.buildStandardWorkDurationSeedReplayGovernanceReport).toHaveBeenCalledWith({
      companyId: 'company-1',
      projectId: 'project-1',
      minSamplesPerCode: 3,
      maxSamples: 50,
      toleranceRatio: 0.3,
    })
  })

  it('rejects standard duration P50 replay report for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/standard-duration/replay-report')
      .query({ projectId: 'project-1' })
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(mocks.buildStandardWorkDurationSeedReplayGovernanceReport).not.toHaveBeenCalled()
  })

  it('exposes standard duration seed quality audit as an admin-only report-only governance endpoint', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/standard-duration/quality-audit')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      reportCode: 'standard_work_duration_seed_quality_audit',
      summary: expect.objectContaining({
        blockerCount: 0,
        reviewRequiredCount: 3,
      }),
      governanceBoundary: {
        reportOnly: true,
        seedWritePolicy: 'never_write_seed_from_quality_audit',
        promotionPolicy: 'review_required_before_seed_promotion',
        allowedUse: 'backend_seed_quality_governance',
      },
    }))
    expect(mocks.buildStandardWorkDurationSeedQualityAuditReport).toHaveBeenCalledTimes(1)
  })

  it('rejects standard duration seed quality audit for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/standard-duration/quality-audit')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(mocks.buildStandardWorkDurationSeedQualityAuditReport).not.toHaveBeenCalled()
  })

  it('exposes L3/L4 construction dependency replay calibration as an admin-only report-only endpoint', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/construction-dependencies/replay-report')
      .query({
        projectId: 'project-1',
        maxSamples: '20',
        zeroLagReviewThresholdDays: '3',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      reportCode: 'construction_dependency_replay_calibration',
      governancePolicy: {
        replayMode: 'report_only',
        seedWritePolicy: 'never_write_seed_from_replay',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        promotionPolicy: 'manual_seed_review_required',
      },
      summary: expect.objectContaining({
        l3MatchedDependencyCount: 1,
        l4MatchedDependencyCount: 2,
        reviewRequiredDependencyCount: 1,
        conflictDependencyCount: 1,
      }),
    }))
    expect(mocks.collectConstructionDependencyReplayCalibrationReport).toHaveBeenCalledWith({
      projectIds: ['project-1'],
      maxSamples: 20,
      zeroLagReviewThresholdDays: 3,
    })
  })

  it('rejects construction dependency replay calibration for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/construction-dependencies/replay-report')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(mocks.collectConstructionDependencyReplayCalibrationReport).not.toHaveBeenCalled()
  })

  it('exposes persisted L3/L4 construction dependency replay history as an admin-only manual review report', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/construction-dependencies/replay-history')
      .query({
        projectId: 'project-1',
        matchedSeedCode: 'l3-seed-a',
        limit: '25',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      reportCode: 'construction_dependency_replay_calibration_history',
      governancePolicy: {
        replayMode: 'report_only',
        seedWritePolicy: 'never_write_seed_from_replay',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        promotionPolicy: 'manual_seed_review_required',
      },
      summary: expect.objectContaining({
        seedReviewItemCount: 1,
      }),
    }))
    expect(mocks.listConstructionDependencyReplayCalibrationHistoryReport).toHaveBeenCalledWith({
      projectId: 'project-1',
      matchedSeedCode: 'l3-seed-a',
      limit: 25,
    })
  })

  it('rejects construction dependency replay history for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/construction-dependencies/replay-history')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(mocks.listConstructionDependencyReplayCalibrationHistoryReport).not.toHaveBeenCalled()
  })

  it('exposes L3/L4 replay seed promotion review packages as an admin-only report-only endpoint', async () => {
    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/construction-dependencies/replay-review-packages')
      .query({
        projectId: 'project-1',
        matchedSeedCode: 'l3-seed-a',
        limit: '25',
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      reportCode: 'construction_dependency_seed_promotion_review_packages',
      governanceBoundary: expect.objectContaining({
        runtimeMutationPolicy: 'none_report_only',
        seedWritePolicy: 'never_write_seed_from_review_package',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_review_package',
      }),
      summary: expect.objectContaining({
        packageCount: 1,
      }),
    }))
    expect(mocks.listConstructionDependencySeedPromotionReviewPackageReport).toHaveBeenCalledWith({
      projectId: 'project-1',
      matchedSeedCode: 'l3-seed-a',
      limit: 25,
    })
  })

  it('rejects construction dependency replay review packages for non-admin company members', async () => {
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .get('/api/planning/algorithm-seeds/construction-dependencies/replay-review-packages')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(mocks.listConstructionDependencySeedPromotionReviewPackageReport).not.toHaveBeenCalled()
  })

  it('feature-gates only duration review approval while leaving reject and supersede queue decisions available', async () => {
    vi.stubEnv('WORKBUDDY_RULE_ASSET_RUNTIME_ACTIONS_ENABLED', 'false')

    const approval = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'duration_asset_review_decision',
        assetType: 'duration_learning_runtime',
        evidenceToken: 'duration-review-approve',
        domainWriterKey: 'duration_asset_review_decision_service',
        reviewItemId: 'review-approve',
        reviewDecision: 'approve',
        decisionNotes: 'approve current evidence',
      })
      .expect(409)

    expect(approval.body.error.code).toBe('ACTION_READINESS_GATED')
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()

    for (const reviewDecision of ['reject', 'supersede'] as const) {
      mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
        status: 'operation_delegated',
        operationAction: 'duration_asset_review_decision',
        assetType: 'duration_learning_runtime',
        writesRuntimeDirectly: false,
        workbenchDoesNotGrantPublishRights: true,
        delegatedToDomainWriter: true,
        domainWriterKey: 'duration_asset_review_decision_service',
        reasons: [],
        domainResult: { status: reviewDecision === 'reject' ? 'rejected' : 'superseded' },
        boundaryPolicy: [],
      })

      const response = await request(buildApp())
        .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
        .send({
          action: 'duration_asset_review_decision',
          assetType: 'duration_learning_runtime',
          evidenceToken: `duration-review-${reviewDecision}`,
          domainWriterKey: 'duration_asset_review_decision_service',
          reviewItemId: `review-${reviewDecision}`,
          reviewDecision,
          decisionNotes: `${reviewDecision} queue item`,
        })
        .expect(200)

      expect(response.body.data.domainResult.status).toBe(reviewDecision === 'reject' ? 'rejected' : 'superseded')
    }
  })

  it('overrides request-body authority and project visibility with current membership authority', async () => {
    mocks.visibleProjectIds = ['project-server-authorized']
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'duration_asset_review_decision',
      assetType: 'duration_learning_runtime',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'duration_asset_review_decision_service',
      reasons: [],
      domainResult: { status: 'rejected' },
      boundaryPolicy: [],
    })

    await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'duration_asset_review_decision',
        assetType: 'duration_learning_runtime',
        evidenceToken: 'duration-review-body-override',
        domainWriterKey: 'duration_asset_review_decision_service',
        reviewItemId: 'review-body-override',
        reviewDecision: 'reject',
        decisionNotes: 'server authority must win',
        companyId: 'company-attacker',
        requestedByUserId: 'user-attacker',
        authority: {
          kind: 'operator',
          companyId: 'company-attacker',
          authorizedProjectIds: ['project-attacker'],
          reviewerUserId: 'user-attacker',
        },
        visibleProjectIds: ['project-attacker'],
        authorizedProjectIds: ['project-attacker'],
      })
      .expect(200)

    expect(mocks.getVisibleProjectIds).toHaveBeenCalledWith('user-1', 'member', 'company-1')
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      requestedByUserId: 'user-1',
      authorizedProjectIds: ['project-server-authorized'],
      queryExec: mocks.executeSQL,
    }))
    const delegated = mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mock.calls.at(-1)?.[0]
    expect(delegated.authorizedProjectIds).not.toEqual(['project-attacker'])
  })

  it('overrides caller executedAt with the server current time after the request-body spread', async () => {
    const serverTime = '2026-07-24T10:15:00.000Z'
    vi.useFakeTimers()
    vi.setSystemTime(new Date(serverTime))
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'duration_asset_review_decision',
      assetType: 'duration_learning_runtime',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'duration_asset_review_decision_service',
      reasons: [],
      domainResult: { status: 'rejected' },
      boundaryPolicy: [],
    })

    await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'duration_asset_review_decision',
        assetType: 'duration_learning_runtime',
        evidenceToken: 'duration-review-time-override',
        domainWriterKey: 'duration_asset_review_decision_service',
        reviewItemId: 'review-time-override',
        reviewDecision: 'reject',
        decisionNotes: 'server time must win',
        executedAt: '2099-01-01T00:00:00.000Z',
      })
      .expect(200)

    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      executedAt: serverTime,
    }))
  })

  it('does not treat legacy JWT globalRole company_admin as current-company authority', async () => {
    mocks.globalRole = 'company_admin'
    mocks.membershipRole = 'regular'

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'duration_asset_review_decision',
        assetType: 'duration_learning_runtime',
        evidenceToken: 'duration-review-legacy-global-role',
        domainWriterKey: 'duration_asset_review_decision_service',
        reviewItemId: 'review-legacy-role',
        reviewDecision: 'reject',
        decisionNotes: 'must be denied',
      })
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getVisibleProjectIds).not.toHaveBeenCalled()
    expect(mocks.executeAlgorithmAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
  })

  it.each([
    ['DURATION_ASSET_REVIEW_SHARED_SCOPE_READ_ONLY', 403, 'Shared review items are read-only.'],
    ['DURATION_ASSET_REVIEW_STALE', 409, 'The current evidence fingerprint no longer matches the locked review item.'],
    ['DURATION_ASSET_REVIEW_PUBLICATION_FAILED', 409, 'The governed publication writer rejected the candidate.'],
  ] as const)('propagates decision-service %s failures instead of returning empty success', async (code, status, message) => {
    mocks.executeAlgorithmAssetGovernanceWorkbenchOperation.mockRejectedValueOnce(Object.assign(
      new Error(message),
      { code, status, statusCode: status },
    ))

    const response = await request(buildApp())
      .post('/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations')
      .send({
        action: 'duration_asset_review_decision',
        assetType: 'duration_learning_runtime',
        evidenceToken: 'duration-review-stale',
        domainWriterKey: 'duration_asset_review_decision_service',
        reviewItemId: 'review-stale',
        reviewDecision: 'reject',
        decisionNotes: 'stale evidence',
      })
      .expect(status)

    expect(response.body).toMatchObject({
      success: false,
      error: { code },
    })
    expect(response.body.data).toBeUndefined()
  })
})
