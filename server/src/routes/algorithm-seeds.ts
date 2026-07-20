import { Router } from 'express'

import { getCurrentCompanyMembership, getProjectCompanyId } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import type { ApiResponse } from '../types/index.js'
import { executeSQL, supabase } from '../services/dbService.js'
import { importV1474AlgorithmSeeds, previewAlgorithmSeedImport, rollbackAlgorithmSeedVersion } from '../services/algorithmSeedImportService.js'
import {
  createAlgorithmSeedUpgradeCandidate,
  listAlgorithmSeedOverrides,
  listAlgorithmSeedUpgradeCandidates,
  type AlgorithmSeedCandidateSource,
} from '../services/algorithmSeedLearningService.js'
import { autoGovernAlgorithmSeedUpgradeCandidate } from '../services/algorithmSeedAutoGovernanceService.js'
import { discoverAlgorithmSeedUpgradeCandidates } from '../services/algorithmSeedCandidateDiscoveryService.js'
import { listAlgorithmSeedTypes, type AlgorithmSeedType } from '../services/algorithmSeedRegistry.js'
import {
  getAlgorithmRuleAssetInventoryDiagnostics,
  listAlgorithmRuleAssets,
  type AlgorithmRuleAssetLifecycleType,
  type AlgorithmRuleAssetRecommendation,
} from '../services/algorithmRuleAssetInventoryService.js'
import {
  getAlgorithmGovernanceCatalogDiagnostics,
  listAlgorithmCaliberVersions,
  listAlgorithmCatalogEntries,
  listAlgorithmSeedCatalogEntries,
} from '../services/algorithmCatalogService.js'
import { collectAlgorithmAssetGovernanceDashboardEvidence } from '../services/algorithmAssetGovernanceDashboardEvidenceService.js'
import { buildAlgorithmAssetGovernanceWorkbenchReadiness } from '../services/algorithmAssetGovernanceWorkbenchReadinessService.js'
import { executeAlgorithmAssetGovernanceWorkbenchOperation } from '../services/algorithmAssetGovernanceWorkbenchOperationService.js'
import {
  durationLearningRuntimePublicationIdentitiesMatch,
  resolveDurationLearningRuntimePublicationIdentity,
  type DurationLearningRuntimeAssetKey,
} from '../services/durationLearningRuntimePublicationService.js'
import { buildV14223RuntimeAssetIsolationMatrix } from '../services/algorithmAssetIsolationMatrixService.js'
import {
  buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport,
} from '../services/constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import {
  buildConstructionOrganizationPrecisionReplayMatrix,
} from '../services/constructionOrganizationPrecisionReplayMatrixService.js'
import { buildV14223CrossScopeReplayEvidenceMatrix } from '../services/crossScopeReplayEvidenceMatrixService.js'
import { buildV14223DomainReleaseRuntimeClosureMatrix } from '../services/domainReleaseRuntimeClosureMatrixService.js'
import { buildV14223FutureAssetRediscoveryGateRerunMatrix } from '../services/futureAssetRediscoveryGateRerunMatrixService.js'
import { buildV14223MetricConsumerPathCoverageMatrix } from '../services/metricConsumerPathCoverageMatrixService.js'
import { buildV14223MetricProductionSnapshotPublicationRollbackMatrix } from '../services/metricProductionSnapshotPublicationRollbackMatrixService.js'
import { buildV14223OrdinaryBusinessDtoExposureMatrix } from '../services/ordinaryBusinessDtoExposureMatrixService.js'
import { buildV14223OperableGovernanceFrontendMatrix } from '../services/operableGovernanceFrontendMatrixService.js'
import { buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix } from '../services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.js'
import { listAlgorithmAssetLearnableParameters } from '../services/algorithmAssetLearnableParameterRegistryService.js'
import { buildV14223CurrentCompletionAudit } from '../services/v14223CompletionAuditService.js'
import { evaluateV14AssetAdmissionAutomation } from '../services/v14AssetAdmissionAutomationService.js'
import { validateV1474AlgorithmSeeds } from '../services/algorithmSeedValidationService.js'
import { collectConstructionDependencyReplayCalibrationReport } from '../services/constructionDependencyReplayCalibrationService.js'
import {
  listConstructionDependencyReplayCalibrationHistoryReport,
  listConstructionDependencySeedPromotionReviewPackageReport,
} from '../services/constructionDependencyReplayCalibrationPersistenceService.js'
import { buildStandardWorkDurationSeedQualityAuditReport } from '../services/standardWorkDurationSeedQualityAuditService.js'
import { buildStandardWorkDurationSeedReplayGovernanceReport } from '../services/standardWorkDurationSeedReplayGovernanceService.js'
import {
  importOfficialWorkCalendar,
  refreshOfficialWorkCalendarFromNotice,
  resolveOfficialHolidayNoticeSourceUrl,
} from '../services/officialHolidayCalendarService.js'
import { listConstructionOrganizationMaterializationReviewPackages } from '../services/constructionOrganizationMaterializationReviewPackageService.js'
import { listConstructionOrganizationPlanNetworkDrafts } from '../services/constructionOrganizationPlanNetworkDraftService.js'
import { areRuleAssetRuntimeActionsEnabled } from '../services/v14231ActionableSurfaceRegistryService.js'

const router = Router()
router.use(authenticate)

const CONSTRUCTION_ORGANIZATION_PRODUCT_CLOSEOUT_EVIDENCE_LIMIT = 2000
const HIGH_RISK_RULE_ASSET_ACTIONS = new Set([
  'runtime_apply',
  'runtime_rollback_execution',
  'runtime_rollback',
])

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function durationLearningRuntimeRollbackAssetMatches(
  assetType: string,
  assetKey: DurationLearningRuntimeAssetKey,
) {
  return assetType === 'template_seed'
    ? assetKey === 'special_work_duration_seed' || assetKey === 'wbs_reference_days'
    : assetType === 'dependency_rule'
      && (assetKey === 'dependency_rule_candidate' || assetKey === 'critical_path_rule_candidate')
}

async function isDurationLearningRuntimeRollbackAuthorized(input: {
  body: Record<string, unknown>
  companyId: string
  projectId: string | null
}) {
  const assetType = normalizeText(input.body.assetType)
  if (
    normalizeText(input.body.action) !== 'runtime_rollback'
    || (assetType !== 'template_seed' && assetType !== 'dependency_rule')
  ) return true

  const sourcePublicationKey = normalizeText(input.body.sourcePublicationKey)
  const targetPublicationKey = normalizeText(input.body.rollbackTarget)
  if (!sourcePublicationKey || !targetPublicationKey) return true

  const source = await resolveDurationLearningRuntimePublicationIdentity({
    queryExec: executeSQL,
    publicationKey: sourcePublicationKey,
  })
  const target = await resolveDurationLearningRuntimePublicationIdentity({
    queryExec: executeSQL,
    publicationKey: targetPublicationKey,
  })
  if (
    !source
    || !target
    || !durationLearningRuntimeRollbackAssetMatches(assetType, source.assetKey)
    || !durationLearningRuntimePublicationIdentitiesMatch(source, target)
  ) return false

  if (source.scope.level !== 'project' && source.scope.level !== 'company') return false
  if (source.scope.companyId !== input.companyId) return false
  if (source.scope.level === 'project') {
    return Boolean(input.projectId && source.scope.projectId === input.projectId)
  }
  return input.projectId === null
}

function normalizeSeedType(value: unknown): AlgorithmSeedType | null {
  const text = normalizeText(value) as AlgorithmSeedType
  return listAlgorithmSeedTypes().includes(text) ? text : null
}

function normalizeCandidateSource(value: unknown): AlgorithmSeedCandidateSource {
  const source = normalizeText(value)
  if (source === 'project_history' || source === 'company_history' || source === 'standard_update' || source === 'system_observation') {
    return source
  }
  return 'project_history'
}

function normalizePositiveNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function buildParameterConsumerCoverageFromRegistry() {
  const verifiedConsumers: string[] = []
  const pendingConsumerGroups: string[] = []

  for (const parameter of listAlgorithmAssetLearnableParameters()) {
    const canEnterRuntimeGate = parameter.learningMaturity === 'guarded_live_tuning'
      && parameter.publishAnchor === 'guarded_runtime_auto_publish'
      && (parameter.automationMaturity === 'auto_canary' || parameter.automationMaturity === 'auto_publish')
    if (canEnterRuntimeGate) {
      verifiedConsumers.push(parameter.parameterKey)
      continue
    }

    const manualBlockedRuntimeGate = parameter.learningMaturity === 'governed_candidate'
      && parameter.publishAnchor === 'manual_governance_required'
    if (manualBlockedRuntimeGate) {
      verifiedConsumers.push(`${parameter.parameterKey}:manual_blocked_runtime_gate`)
      continue
    }

    const frozenGovernanceThreshold = parameter.learningMaturity === 'frozen_constant'
      && parameter.publishAnchor === 'manual_governance_required'
    if (frozenGovernanceThreshold) {
      verifiedConsumers.push(`${parameter.parameterKey}:frozen_governance_threshold`)
      continue
    }

    pendingConsumerGroups.push(`${parameter.parameterKey}:parameter_runtime_consumer_or_blocking_policy_required`)
  }

  return {
    verifiedConsumers,
    pendingConsumerGroups,
  }
}


async function buildRuleAssetGovernanceWorkbenchReadinessForRequest(req: any) {
  const membership = req.currentCompanyMembership
  const inventory = getAlgorithmRuleAssetInventoryDiagnostics()
  const admission = evaluateV14AssetAdmissionAutomation()
  const companyId = membership?.companyId ?? getRequestCompanyId(req)
  const projectId = normalizeText(req.query.projectId) || null
  const governanceEvidence = await collectAlgorithmAssetGovernanceDashboardEvidence({ companyId })
  const constructionOrganizationPlanNetworkReport = await listConstructionOrganizationPlanNetworkDrafts({
    companyId,
    projectId,
    limit: CONSTRUCTION_ORGANIZATION_PRODUCT_CLOSEOUT_EVIDENCE_LIMIT,
    maxLimit: CONSTRUCTION_ORGANIZATION_PRODUCT_CLOSEOUT_EVIDENCE_LIMIT,
    queryExec: executeSQL,
  })
  const constructionOrganizationPrecisionReplayMatrix = buildConstructionOrganizationPrecisionReplayMatrix()
  const constructionOrganizationProductOutcomeCloseoutMatrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
    precisionReplayMatrix: constructionOrganizationPrecisionReplayMatrix,
    planNetworkReport: constructionOrganizationPlanNetworkReport,
  })
  const metricAdmissionEvidenceRefs = (admission.assets ?? [])
    .filter((asset: { assetType?: string; discoveryStatus?: string }) => (
      asset.assetType === 'metric_admission_asset' && asset.discoveryStatus === 'registered'
    ))
    .flatMap((asset: { assetKey?: string; sourcePath?: string }) => [asset.assetKey, asset.sourcePath])
    .filter((value: string | undefined): value is string => Boolean(value))

  return buildAlgorithmAssetGovernanceWorkbenchReadiness({
    companyId,
    inventorySummary: inventory.summary,
    admissionStatus: admission.status,
    admissionSummary: admission.summary,
    reviewItems: admission.reviewItems,
    blockers: admission.blockers,
    governanceDefaultReviewItems: admission.governanceDefaultReviewItems,
    governanceEvidence,
    backendWorkbenchEvidenceRefs: [
      'GET /api/planning/algorithm-seeds/rule-assets/governance-workbench',
      'GET /api/planning/algorithm-seeds/rule-assets/governance-completion-audit',
      'POST /api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      'GET /api/planning/algorithm-seeds/rule-assets/governance-dashboard',
      'algorithmAssetGovernanceDashboardEvidenceService',
      'algorithmAssetGovernanceWorkbenchOperationService',
      'v14223CompletionAuditService',
    ],
    frontendAdminPageEvidenceRefs: [
      'client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx',
      'client/src/services/ruleAssetGovernanceWorkbenchApi.ts',
      'GET /admin/rule-assets/governance-workbench',
    ],
    ordinaryBusinessDtoExposureMatrix: buildV14223OrdinaryBusinessDtoExposureMatrix(),
    templateWriteSurfaceLegacyScopeSanitizerMatrix: buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(),
    metricProductionSnapshotPublicationRollbackMatrix: buildV14223MetricProductionSnapshotPublicationRollbackMatrix(),
    metricConsumerPathCoverageMatrix: buildV14223MetricConsumerPathCoverageMatrix(),
    futureAssetRediscoveryGateRerunMatrix: buildV14223FutureAssetRediscoveryGateRerunMatrix(),
    operableGovernanceFrontendMatrix: buildV14223OperableGovernanceFrontendMatrix(),
    domainReleaseRuntimeClosureMatrix: buildV14223DomainReleaseRuntimeClosureMatrix(),
    crossScopeReplayEvidenceMatrix: buildV14223CrossScopeReplayEvidenceMatrix(),
    constructionOrganizationPrecisionReplayMatrix,
    constructionOrganizationRuntimeCloseoutClaim: constructionOrganizationPlanNetworkReport.runtimeCloseoutClaim,
    constructionOrganizationProductOutcomeCloseoutMatrix,
    runtimeIsolationMatrix: buildV14223RuntimeAssetIsolationMatrix(),
    parameterConsumerCoverage: buildParameterConsumerCoverageFromRegistry(),
    metricSourceCoverage: {
      registeredMetricSources: Array.from(new Set([
        ...metricAdmissionEvidenceRefs,
        'algorithm_asset_candidate_events',
        'algorithm_asset_replay_runs',
        'algorithm_sample_health_events',
      ])),
      pendingMetricSourceGroups: [],
    },
  })
}

function normalizeRuleAssetLifecycleType(value: unknown): AlgorithmRuleAssetLifecycleType | null {
  const text = normalizeText(value) as AlgorithmRuleAssetLifecycleType
  if ([
    'algorithm_seed',
    'template_catalog',
    'notification_policy',
    'data_quality',
    'metric_registry',
    'field_registry',
    'status_registry',
    'reminder_policy',
    'lineage_governance',
    'drawing_review_rule',
    'service_governance',
    'candidate_for_algorithm_seed',
  ].includes(text)) return text
  return null
}

function normalizeRuleAssetRecommendation(value: unknown): AlgorithmRuleAssetRecommendation | null {
  const text = normalizeText(value) as AlgorithmRuleAssetRecommendation
  if ([
    'keep_in_algorithm_seed_lifecycle',
    'keep_independent_governance',
    'diagnostic_bridge_only',
    'evaluate_before_seed_inclusion',
  ].includes(text)) return text
  return null
}

function success<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
}

function forbiddenCompanyResponse(res: any) {
  return res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN_COMPANY_SCOPE', message: '不能治理非当前公司的算法 seed' },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}

async function requireCurrentCompanyAdmin(req: any, res: any, next: any) {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '请先登录' },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse)
    }

    const membership = await getCurrentCompanyMembership(userId, getRequestCompanyId(req))
    if (membership?.role !== 'company_admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '仅公司管理员可以治理算法 seed' },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse)
    }
    ;(req as any).currentCompanyMembership = membership
    next()
  } catch (error) {
    next(error)
  }
}

const validateSeedHandler = asyncHandler(async (req, res) => {
  const seedType = normalizeSeedType(req.query.seedType)
  const strict = String(req.query.strict ?? '').toLowerCase() === 'true'
  res.json(success(validateV1474AlgorithmSeeds({ strict, seedType: seedType ?? undefined })))
})

const importSeedHandler = asyncHandler(async (req: any, res) => {
  const seedType = normalizeSeedType(req.body?.seedType ?? req.query.seedType)
  try {
    const result = await importV1474AlgorithmSeeds({
      strict: req.body?.strict ?? true,
      seedType: seedType ?? undefined,
      userId: req.user?.id ?? null,
    })
    res.status(201).json(success(result))
  } catch (error: any) {
    if (error?.code === 'ALGORITHM_SEED_VALIDATION_FAILED') {
      return res.status(422).json({
        success: false,
        error: { code: error.code, message: error.message, details: error.details },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse)
    }
    throw error
  }
})

const previewImportSeedHandler = asyncHandler(async (req: any, res) => {
  const seedType = normalizeSeedType(req.body?.seedType ?? req.query.seedType)
  try {
    const result = await previewAlgorithmSeedImport({
      strict: req.body?.strict ?? true,
      seedType: seedType ?? undefined,
    })
    res.json(success(result))
  } catch (error: any) {
    if (error?.code === 'ALGORITHM_SEED_VALIDATION_FAILED') {
      return res.status(422).json({
        success: false,
        error: { code: error.code, message: error.message, details: error.details },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse)
    }
    throw error
  }
})

router.get('/validate', validateSeedHandler)
router.get('/validate-seed', validateSeedHandler)

router.get('/rule-assets', asyncHandler(async (req, res) => {
  res.json(success(listAlgorithmRuleAssets({
    lifecycleType: normalizeRuleAssetLifecycleType(req.query.lifecycleType),
    recommendation: normalizeRuleAssetRecommendation(req.query.recommendation),
  })))
}))

router.get('/rule-assets/diagnostics', asyncHandler(async (_req, res) => {
  res.json(success(getAlgorithmRuleAssetInventoryDiagnostics()))
}))

router.get('/rule-assets/governance-dashboard', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = req.currentCompanyMembership
  const inventory = getAlgorithmRuleAssetInventoryDiagnostics()
  const admission = evaluateV14AssetAdmissionAutomation()
  const companyId = membership?.companyId ?? getRequestCompanyId(req)
  const governanceEvidence = await collectAlgorithmAssetGovernanceDashboardEvidence({ companyId })

  res.json(success({
    frontendExposurePolicy: 'backend_admin_governance_only',
    companyId,
    inventorySummary: inventory.summary,
    admissionStatus: admission.status,
    admissionSummary: admission.summary,
    reviewItems: admission.reviewItems,
    blockers: admission.blockers,
    governanceDefaultReviewItems: admission.governanceDefaultReviewItems,
    governanceEvidence,
    governancePersistence: {
      migration: '193_v14223_algorithm_asset_governance_persistence.sql',
      registryView: 'algorithm_asset_registry_view',
      physicalTables: [
        'algorithm_asset_candidate_events',
        'algorithm_asset_conflicts',
        'algorithm_asset_replay_runs',
        'algorithm_asset_replay_results',
        'algorithm_learnable_parameter_registry',
        'algorithm_cold_start_baselines',
        'duration_forecast_residual_overlays',
        'algorithm_sample_health_events',
      ],
      remainingIntegration: [
        'specialized_candidate_event_adapters',
        'specialized_replay_result_writers',
        'admin_governance_operations_page',
      ],
    },
    publicationBoundary: {
      autoGovernanceIsNotAutoPublish: true,
      ordinaryFrontendVisible: false,
      publishRequiresAnchorAndMaturityGate: true,
      manualAnchorsRemainHardBlockersUntilUnlockStrategyPasses: true,
    },
  }))
}))

router.get('/rule-assets/governance-workbench', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  res.json(success(await buildRuleAssetGovernanceWorkbenchReadinessForRequest(req)))
}))

router.get('/rule-assets/governance-workbench/construction-organization/materialization-review-packages', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = req.currentCompanyMembership
  const companyId = membership?.companyId ?? getRequestCompanyId(req)
  const projectId = normalizeText(req.query.projectId) || null
  const limit = normalizePositiveNumber(req.query.limit)
  const report = await listConstructionOrganizationMaterializationReviewPackages({
    companyId,
    projectId,
    limit,
    queryExec: executeSQL,
  })
  res.json(success(report))
}))

router.get('/rule-assets/governance-workbench/construction-organization/plan-network-drafts', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = req.currentCompanyMembership
  const companyId = membership?.companyId ?? getRequestCompanyId(req)
  const projectId = normalizeText(req.query.projectId) || null
  const limit = normalizePositiveNumber(req.query.limit)
  const report = await listConstructionOrganizationPlanNetworkDrafts({
    companyId,
    projectId,
    limit,
    queryExec: executeSQL,
  })
  res.json(success(report))
}))

router.get('/rule-assets/governance-completion-audit', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const workbenchReadiness = await buildRuleAssetGovernanceWorkbenchReadinessForRequest(req)
  const futureAssetRediscoveryGate = workbenchReadiness.gates.find((gate) =>
    gate.key === 'future_asset_rediscovery_gate_rerun_matrix')
  const domainReleaseRuntimeClosureMatrix = buildV14223DomainReleaseRuntimeClosureMatrix()

  res.json(success(buildV14223CurrentCompletionAudit({
    workbenchReadiness,
    currentSnapshotGatePassed: true,
    futureAssetRediscoveryGateRerunComplete: futureAssetRediscoveryGate?.status === 'ready',
    domainReleaseRuntimeClosureMatrix,
  })))
}))

router.post('/rule-assets/governance-workbench/operations', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = req.currentCompanyMembership
  const companyId = membership?.companyId ?? getRequestCompanyId(req)
  const projectId = normalizeText(req.body?.projectId) || null
  const projectCompanyId = projectId ? await getProjectCompanyId(projectId) : null
  if (projectCompanyId && membership?.companyId && projectCompanyId !== membership.companyId) {
    return forbiddenCompanyResponse(res)
  }
  const operationAction = normalizeText(req.body?.action)
  if (HIGH_RISK_RULE_ASSET_ACTIONS.has(operationAction) && !areRuleAssetRuntimeActionsEnabled()) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'ACTION_READINESS_GATED',
        message: '当前可查看治理数据，但运行时发布与回滚动作尚未放行',
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  const durationRuntimeRollbackAuthorized = await isDurationLearningRuntimeRollbackAuthorized({
    body: req.body ?? {},
    companyId: normalizeText(companyId),
    projectId,
  })
  if (!durationRuntimeRollbackAuthorized) return forbiddenCompanyResponse(res)
  const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
    ...req.body,
    companyId,
    requestedByUserId: req.user?.id ?? null,
    queryExec: executeSQL,
  })

  res.json(success(result))
}))

router.get('/catalog/algorithms', asyncHandler(async (_req, res) => {
  res.json(success(listAlgorithmCatalogEntries()))
}))

router.get('/catalog/caliber-versions', asyncHandler(async (_req, res) => {
  res.json(success(listAlgorithmCaliberVersions()))
}))

router.get('/catalog/seeds', asyncHandler(async (_req, res) => {
  res.json(success(listAlgorithmSeedCatalogEntries()))
}))

router.get('/catalog/diagnostics', asyncHandler(async (_req, res) => {
  res.json(success(getAlgorithmGovernanceCatalogDiagnostics()))
}))

router.get('/catalog/admission-automation', asyncHandler(async (_req, res) => {
  res.json(success(evaluateV14AssetAdmissionAutomation()))
}))

router.get('/standard-duration/replay-report', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = (req as any).currentCompanyMembership
  const projectId = normalizeText(req.query.projectId) || null
  const projectCompanyId = projectId ? await getProjectCompanyId(projectId) : null
  if (projectCompanyId && membership?.companyId && projectCompanyId !== membership.companyId) {
    return forbiddenCompanyResponse(res)
  }

  const report = await buildStandardWorkDurationSeedReplayGovernanceReport({
    companyId: membership?.companyId ?? null,
    projectId,
    minSamplesPerCode: normalizePositiveNumber(req.query.minSamplesPerCode),
    maxSamples: normalizePositiveNumber(req.query.maxSamples),
    toleranceRatio: normalizePositiveNumber(req.query.toleranceRatio),
  })
  res.json(success(report))
}))

router.get('/standard-duration/quality-audit', requireCurrentCompanyAdmin, asyncHandler(async (_req, res) => {
  res.json(success(buildStandardWorkDurationSeedQualityAuditReport()))
}))

router.get('/construction-dependencies/replay-report', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = (req as any).currentCompanyMembership
  const projectId = normalizeText(req.query.projectId) || null
  const projectCompanyId = projectId ? await getProjectCompanyId(projectId) : null
  if (projectCompanyId && membership?.companyId && projectCompanyId !== membership.companyId) {
    return forbiddenCompanyResponse(res)
  }

  const report = await collectConstructionDependencyReplayCalibrationReport({
    projectIds: projectId ? [projectId] : [],
    maxSamples: normalizePositiveNumber(req.query.maxSamples),
    zeroLagReviewThresholdDays: normalizePositiveNumber(req.query.zeroLagReviewThresholdDays),
  })
  res.json(success(report))
}))

router.get('/construction-dependencies/replay-history', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = (req as any).currentCompanyMembership
  const projectId = normalizeText(req.query.projectId) || null
  const projectCompanyId = projectId ? await getProjectCompanyId(projectId) : null
  if (projectCompanyId && membership?.companyId && projectCompanyId !== membership.companyId) {
    return forbiddenCompanyResponse(res)
  }

  const report = await listConstructionDependencyReplayCalibrationHistoryReport({
    projectId,
    matchedSeedCode: normalizeText(req.query.matchedSeedCode) || null,
    limit: normalizePositiveNumber(req.query.limit),
  })
  res.json(success(report))
}))

router.get('/construction-dependencies/replay-review-packages', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = (req as any).currentCompanyMembership
  const projectId = normalizeText(req.query.projectId) || null
  const projectCompanyId = projectId ? await getProjectCompanyId(projectId) : null
  if (projectCompanyId && membership?.companyId && projectCompanyId !== membership.companyId) {
    return forbiddenCompanyResponse(res)
  }

  const report = await listConstructionDependencySeedPromotionReviewPackageReport({
    projectId,
    matchedSeedCode: normalizeText(req.query.matchedSeedCode) || null,
    limit: normalizePositiveNumber(req.query.limit),
  })
  res.json(success(report))
}))

router.post('/import/preview', requireCurrentCompanyAdmin, previewImportSeedHandler)
router.post('/import-seed/preview', requireCurrentCompanyAdmin, previewImportSeedHandler)
router.post('/import', requireCurrentCompanyAdmin, importSeedHandler)
router.post('/import-seed', requireCurrentCompanyAdmin, importSeedHandler)

router.post('/versions/rollback', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const seedType = normalizeSeedType(req.body?.seedType)
  if (!seedType) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_SEED_TYPE', message: 'seedType 鏃犳晥' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  const result = await rollbackAlgorithmSeedVersion({
    seedType,
    fromVersionId: normalizeText(req.body?.fromVersionId),
    toVersionId: normalizeText(req.body?.toVersionId),
    userId: req.user?.id ?? null,
    reason: normalizeText(req.body?.reason) || null,
  })
  res.json(success(result))
}))

router.post('/work-calendar/official-import', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const year = Number(req.body?.year)
  const sourceUrl = normalizeText(req.body?.sourceUrl)
  const holidays = Array.isArray(req.body?.holidays) ? req.body.holidays : []
  const result = await importOfficialWorkCalendar({
    year,
    sourceUrl,
    holidays,
    userId: req.user?.id ?? null,
  })
  res.status(201).json(success(result))
}))

router.post('/work-calendar/refresh-official', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const year = Number(req.body?.year)
  const sourceUrl = normalizeText(req.body?.sourceUrl) || resolveOfficialHolidayNoticeSourceUrl(year)
  if (!sourceUrl) {
    return res.status(404).json({
      success: false,
      error: { code: 'OFFICIAL_HOLIDAY_NOTICE_SOURCE_MISSING', message: '未配置该年度 gov.cn 法定节假日公告 URL' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  const result = await refreshOfficialWorkCalendarFromNotice({
    year,
    sourceUrl,
    userId: req.user?.id ?? null,
  })
  res.status(201).json(success(result))
}))

router.get('/versions', asyncHandler(async (req, res) => {
  const seedType = normalizeSeedType(req.query.seedType)
  let query = supabase
    .from('algorithm_seed_versions')
    .select('*')
    .order('imported_at', { ascending: false })
    .limit(200)
  if (seedType) query = query.eq('seed_type', seedType)
  const { data, error } = await query
  if (error) throw error
  res.json(success(Array.isArray(data) ? data : []))
}))

router.get('/upgrade-candidates', asyncHandler(async (req: any, res) => {
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  const seedType = normalizeSeedType(req.query.seedType)
  const projectId = normalizeText(req.query.projectId) || null
  if (projectId) {
    const projectCompanyId = await getProjectCompanyId(projectId)
    if (membership?.companyId && projectCompanyId && projectCompanyId !== membership.companyId) {
      return forbiddenCompanyResponse(res)
    }
  }
  const rows = await listAlgorithmSeedUpgradeCandidates({
    seedType,
    status: normalizeText(req.query.status) as any || null,
    companyId: membership?.companyId || null,
    projectId,
  })
  res.json(success(rows))
}))

router.post('/upgrade-candidates', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const seedType = normalizeSeedType(req.body?.seedType)
  if (!seedType) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_SEED_TYPE', message: 'seedType 无效' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  const projectId = normalizeText(req.body?.projectId) || null
  const projectCompanyId = projectId ? await getProjectCompanyId(projectId) : null
  const membership = (req as any).currentCompanyMembership
  if (projectCompanyId && membership?.companyId && projectCompanyId !== membership.companyId) {
    return forbiddenCompanyResponse(res)
  }
  const companyId = projectCompanyId ?? membership?.companyId ?? null
  const actionPolicy = req.body?.actionPolicy === 'candidate_only' ? 'candidate_only' : 'auto_govern'
  const row = await createAlgorithmSeedUpgradeCandidate({
    seedType,
    stableCode: normalizeText(req.body?.stableCode),
    candidatePayload: req.body?.candidatePayload ?? {},
    candidateSource: normalizeCandidateSource(req.body?.candidateSource),
    projectId,
    companyId,
    sampleCount: req.body?.sampleCount,
    variance: req.body?.variance ?? null,
    confidenceLevel: req.body?.confidenceLevel ?? 'low',
    evidenceSummary: req.body?.evidenceSummary ?? {},
    actionPolicy,
    createdBy: req.user?.id ?? null,
  })
  if (actionPolicy === 'auto_govern') {
    const governed = await autoGovernAlgorithmSeedUpgradeCandidate((row as any).id, {
      triggeredBy: req.user?.id ?? null,
      scopeType: projectId ? 'project' : 'company',
      projectId,
      companyId,
    })
    return res.status(201).json(success(governed))
  }
  res.status(201).json(success({ candidate: row, decision: null, override: null }))
}))

router.post('/upgrade-candidates/discover', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = (req as any).currentCompanyMembership
  const projectId = normalizeText(req.body?.projectId) || null
  const projectCompanyId = projectId ? await getProjectCompanyId(projectId) : null
  if (projectCompanyId && membership?.companyId && projectCompanyId !== membership.companyId) {
    return forbiddenCompanyResponse(res)
  }

  const result = await discoverAlgorithmSeedUpgradeCandidates({
    projectId,
    companyId: projectId ? null : membership?.companyId ?? null,
    minProjectSamples: Number(req.body?.minProjectSamples) || undefined,
    minCompanySamples: Number(req.body?.minCompanySamples) || undefined,
    maxSamples: Number(req.body?.maxSamples) || undefined,
    autoGovern: req.body?.autoGovern !== false,
    triggeredBy: req.user?.id ?? null,
  })
  res.status(201).json(success(result))
}))

router.post('/upgrade-candidates/:id/auto-govern', requireCurrentCompanyAdmin, asyncHandler(async (req: any, res) => {
  const membership = (req as any).currentCompanyMembership
  const { data: candidateScope, error: candidateScopeError } = await supabase
    .from('algorithm_seed_upgrade_candidates')
    .select('company_id, project_id')
    .eq('id', req.params.id)
    .maybeSingle()
  if (candidateScopeError) throw candidateScopeError
  if (!candidateScope) {
    return res.status(404).json({
      success: false,
      error: { code: 'CANDIDATE_NOT_FOUND', message: '升级候选不存在' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  const candidateCompanyId = normalizeText((candidateScope as any).company_id)
    || ((candidateScope as any).project_id ? await getProjectCompanyId((candidateScope as any).project_id) : null)
  if (membership?.companyId && candidateCompanyId && candidateCompanyId !== membership.companyId) {
    return forbiddenCompanyResponse(res)
  }
  const candidateProjectId = normalizeText((candidateScope as any).project_id) || null
  const result = await autoGovernAlgorithmSeedUpgradeCandidate(req.params.id, {
    triggeredBy: req.user?.id ?? null,
    scopeType: candidateProjectId ? 'project' : 'company',
    projectId: candidateProjectId,
    companyId: candidateCompanyId,
  })
  res.json(success(result))
}))

router.get('/overrides', asyncHandler(async (req: any, res) => {
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  const projectId = normalizeText(req.query.projectId) || null
  if (projectId) {
    const projectCompanyId = await getProjectCompanyId(projectId)
    if (membership?.companyId && projectCompanyId && projectCompanyId !== membership.companyId) {
      return forbiddenCompanyResponse(res)
    }
  }
  const rows = await listAlgorithmSeedOverrides({
    seedType: normalizeSeedType(req.query.seedType),
    scopeType: normalizeText(req.query.scopeType) as any || null,
    companyId: membership?.companyId || null,
    projectId,
    status: normalizeText(req.query.status) as any || 'active',
  })
  res.json(success(rows))
}))

export default router
