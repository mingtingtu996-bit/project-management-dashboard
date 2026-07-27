import type {
  ConstructionOrganizationPlanNetworkDraftReport,
  ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim,
} from './constructionOrganizationPlanNetworkDraftService.js'
import {
  listConstructionOrganizationPlanNetworkDrafts,
} from './constructionOrganizationPlanNetworkDraftService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'
import type {
  ConstructionOrganizationPrecisionReplayBusinessType,
  ConstructionOrganizationPrecisionReplayMatrix,
} from './constructionOrganizationPrecisionReplayMatrixService.js'
import {
  buildConstructionOrganizationPrecisionReplayMatrix,
  CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES,
} from './constructionOrganizationPrecisionReplayMatrixService.js'

export const CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES = [
  'newProjectPlanning',
  'startingLineOnboarding',
  'accelerationRecovery',
] as const

export const CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT = 3

export type ConstructionOrganizationProductOutcomeUseCase =
  typeof CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES[number]

export const CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_CLOSEOUT_MATRIX_VERSION =
  'v1.4.22-construction-organization-product-outcome-closeout-20260623'

export type ConstructionOrganizationRuntimeReadyUseCaseOptionCounts = Record<
  ConstructionOrganizationProductOutcomeUseCase,
  number
>

export type ConstructionOrganizationProductOutcomeNextEvidenceOperation = {
  source: 'construction_organization_product_outcome_next_evidence_operation'
  businessType: ConstructionOrganizationPrecisionReplayBusinessType | null
  evidenceAction: string
  operationAction:
    | 'manual_review_handoff'
    | 'release_exit_handoff'
    | 'runtime_apply'
    | 'runtime_impact_monitoring'
    | 'runtime_rollback_execution'
    | 'runtime_consumer_observation'
    | 'runtime_saved_outcome'
    | 'runtime_engine_evidence'
    | 'runtime_recommendation_adopt'
  assetType: 'construction_organization_plan_network'
  boundaryPolicy: string[]
}

export type ConstructionOrganizationProductOutcomeCloseoutRow = {
  source: 'construction_organization_product_outcome_closeout_row'
  businessType: ConstructionOrganizationPrecisionReplayBusinessType
  status: 'product_outcome_closeout_ready' | 'product_outcome_closeout_incomplete'
  hasPrecisionReplayEvidence: boolean
  hasRuntimeCloseoutClaimEvidence: boolean
  hasRuntimeCloseoutClaim: boolean
  runtimeClaimStatus: ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim['status'] | null
  runtimeEvidenceProjectIds: string[]
  runtimeEvidenceDraftNetworkKeys: string[]
  runtimeEvidenceOptionIds: string[]
  runtimeEvidencePublicationKeys: string[]
  runtimeEvidenceSources: string[]
  runtimeEvidenceUseCases: ConstructionOrganizationProductOutcomeUseCase[]
  runtimeEvidenceOptionCount: number
  runtimeEvidenceOptionDeficit: number
  runtimeEvidenceRuntimeReadyOptionCount: number
  runtimeEvidenceRuntimeReadyOptionDeficit: number
  runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: number
  runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit: number
  runtimeReadyUseCaseOptionCounts: ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
  runtimeReadyUseCaseOptionDeficits: ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
  runtimeReadyUseCaseOptionCloseoutClaimCounts: ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
  runtimeReadyUseCaseOptionCloseoutClaimDeficits: ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
  hasRealRuntimeEvidenceSource: boolean
  hasRequiredRuntimeUseCaseCoverage: boolean
  hasRequiredRuntimeOptionNetworkCoverage: boolean
  hasRequiredRuntimeReadyOptionNetworkCoverage: boolean
  hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: boolean
  hasRequiredRuntimeReadyUseCaseOptionCoverage: boolean
  hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage: boolean
  runtimeClaimMissingReasons: string[]
  missingReasons: string[]
  nextEvidenceActions: string[]
  nextEvidenceOperations: ConstructionOrganizationProductOutcomeNextEvidenceOperation[]
}

export type ConstructionOrganizationProductOutcomeNextEvidenceWorkItem = {
  source: 'construction_organization_product_outcome_next_evidence_work_item'
  businessType: ConstructionOrganizationPrecisionReplayBusinessType
  status: ConstructionOrganizationProductOutcomeCloseoutRow['status']
  runtimeEvidenceProjectIds: string[]
  runtimeEvidenceDraftNetworkKeys: string[]
  runtimeEvidenceOptionIds: string[]
  runtimeEvidencePublicationKeys: string[]
  runtimeEvidenceSources: string[]
  runtimeEvidenceUseCases: ConstructionOrganizationProductOutcomeUseCase[]
  runtimeEvidenceOptionCount: number
  runtimeEvidenceOptionDeficit: number
  runtimeEvidenceRuntimeReadyOptionCount: number
  runtimeEvidenceRuntimeReadyOptionDeficit: number
  runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: number
  runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit: number
  runtimeReadyUseCaseOptionCounts: ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
  runtimeReadyUseCaseOptionDeficits: ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
  runtimeReadyUseCaseOptionCloseoutClaimCounts: ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
  runtimeReadyUseCaseOptionCloseoutClaimDeficits: ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
  hasRealRuntimeEvidenceSource: boolean
  hasRequiredRuntimeUseCaseCoverage: boolean
  hasRequiredRuntimeOptionNetworkCoverage: boolean
  hasRequiredRuntimeReadyOptionNetworkCoverage: boolean
  hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: boolean
  hasRequiredRuntimeReadyUseCaseOptionCoverage: boolean
  hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage: boolean
  runtimeClaimMissingReasons: string[]
  missingReasons: string[]
  nextEvidenceActions: string[]
  nextEvidenceOperations: ConstructionOrganizationProductOutcomeNextEvidenceOperation[]
}

export type ConstructionOrganizationProductOutcomeEvidenceExecutionPlanItem = {
  source: 'construction_organization_product_outcome_evidence_execution_plan_item'
  businessType: ConstructionOrganizationPrecisionReplayBusinessType
  useCase: ConstructionOrganizationProductOutcomeUseCase | null
  evidenceAction: string
  operationAction: ConstructionOrganizationProductOutcomeNextEvidenceOperation['operationAction']
  assetType: 'construction_organization_plan_network'
  requiredCount: number
  currentCount: number
  deficit: number
  mutationBoundary: ConstructionOrganizationProductOutcomeCloseoutMatrix['mutationBoundary']
  boundaryPolicy: string[]
}

export type ConstructionOrganizationProductOutcomeEvidenceWorkPackageStep = {
  source: 'construction_organization_product_outcome_evidence_work_package_step'
  workPackageKey: string
  businessType: ConstructionOrganizationPrecisionReplayBusinessType
  useCase: ConstructionOrganizationProductOutcomeUseCase | null
  evidenceAction: string
  operationAction: ConstructionOrganizationProductOutcomeNextEvidenceOperation['operationAction']
  assetType: 'construction_organization_plan_network'
  requiredCount: number
  currentCount: number
  deficit: number
  runtimeEvidenceProjectIds: string[]
  runtimeEvidenceDraftNetworkKeys: string[]
  runtimeEvidenceOptionIds: string[]
  runtimeEvidencePublicationKeys: string[]
  canPrefillControlledOperation: boolean
  executionStatus: 'ready_for_controlled_prefill' | 'blocked_missing_runtime_anchors'
  missingRuntimeAnchors: Array<'projectId' | 'draftNetworkKey' | 'publicationKey'>
  mutationBoundary: ConstructionOrganizationProductOutcomeCloseoutMatrix['mutationBoundary']
  boundaryPolicy: string[]
}

export type ConstructionOrganizationProductOutcomeEvidenceWorkPackage = {
  source: 'construction_organization_product_outcome_evidence_work_package'
  workPackageKey: string
  businessType: ConstructionOrganizationPrecisionReplayBusinessType
  status: 'evidence_work_package_ready' | 'evidence_work_package_open'
  runtimeEvidenceProjectIds: string[]
  runtimeEvidenceDraftNetworkKeys: string[]
  runtimeEvidenceOptionIds: string[]
  runtimeEvidencePublicationKeys: string[]
  runtimeClaimMissingReasons: string[]
  missingReasons: string[]
  nextEvidenceActions: string[]
  operationActions: ConstructionOrganizationProductOutcomeNextEvidenceOperation['operationAction'][]
  executionPlanItems: ConstructionOrganizationProductOutcomeEvidenceExecutionPlanItem[]
  executionSteps: ConstructionOrganizationProductOutcomeEvidenceWorkPackageStep[]
  executionPlanItemCount: number
  prefillableExecutionStepCount: number
  blockedExecutionStepCount: number
  executionReadinessStatus: 'ready_for_controlled_prefill' | 'blocked_missing_runtime_anchors'
  missingRuntimeAnchorReasons: string[]
  totalDeficit: number
  useCases: ConstructionOrganizationProductOutcomeUseCase[]
  requiredAttributionDimensions: Array<'businessType' | 'draftNetworkKey' | 'publicationKey'>
  mutationBoundary: ConstructionOrganizationProductOutcomeCloseoutMatrix['mutationBoundary']
  boundaryPolicy: string[]
}

export type ConstructionOrganizationProductOutcomeCloseoutMatrix = {
  source: 'construction_organization_product_outcome_closeout_matrix'
  sourceVersion: typeof CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_CLOSEOUT_MATRIX_VERSION
  status: 'product_outcome_closeout_ready' | 'product_outcome_closeout_incomplete'
  canDeclareConstructionOrganizationProductOutcomeCloseout: boolean
  supportedBusinessTypeCount: number
  precisionReplayReadyBusinessTypeCount: number
  runtimeOutcomeReadyBusinessTypeCount: number
  rows: ConstructionOrganizationProductOutcomeCloseoutRow[]
  missingReasons: string[]
  nextEvidenceActions: string[]
  nextEvidenceOperations: ConstructionOrganizationProductOutcomeNextEvidenceOperation[]
  nextEvidenceWorkItems: ConstructionOrganizationProductOutcomeNextEvidenceWorkItem[]
  nextEvidenceExecutionPlan: ConstructionOrganizationProductOutcomeEvidenceExecutionPlanItem[]
  nextEvidenceWorkPackages: ConstructionOrganizationProductOutcomeEvidenceWorkPackage[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
  boundaryPolicy: string[]
}

export type ConstructionOrganizationProductOutcomeCloseoutProgress = {
  source: 'construction_organization_product_outcome_closeout_progress'
  status: 'product_outcome_closeout_ready' | 'product_outcome_closeout_incomplete'
  canDeclareConstructionOrganizationProductOutcomeCloseout: boolean
  supportedBusinessTypeCount: number
  precisionReplayReadyBusinessTypeCount: number
  runtimeOutcomeReadyBusinessTypeCount: number
  readyBusinessTypes: ConstructionOrganizationPrecisionReplayBusinessType[]
  missingBusinessTypes: ConstructionOrganizationPrecisionReplayBusinessType[]
  topMissingReasons: string[]
  nextEvidenceActions: string[]
  nextEvidenceWorkItemCount: number
  nextEvidenceWorkPackageCount: number
  prefillableWorkPackageCount: number
  blockedWorkPackageCount: number
  useCaseCoverage: Record<ConstructionOrganizationProductOutcomeUseCase, {
    readyBusinessTypeCount: number
    missingBusinessTypes: ConstructionOrganizationPrecisionReplayBusinessType[]
  }>
  mutationBoundary: ConstructionOrganizationProductOutcomeCloseoutMatrix['mutationBoundary']
  boundaryPolicy: string[]
}

export type BuildConstructionOrganizationProductOutcomeCloseoutMatrixInput = {
  precisionReplayMatrix: ConstructionOrganizationPrecisionReplayMatrix
  runtimeEvidenceContextsByBusinessType?: Partial<Record<
    ConstructionOrganizationPrecisionReplayBusinessType,
    {
      projectIds?: string[] | null
      draftNetworkKeys?: string[] | null
      optionIds?: string[] | null
      publicationKeys?: string[] | null
      evidenceSources?: string[] | null
      useCases?: string[] | null
      optionCount?: number | null
      runtimeReadyOptionCount?: number | null
      runtimeReadyOptionCloseoutClaimCount?: number | null
      runtimeReadyUseCaseOptionCounts?: Partial<Record<ConstructionOrganizationProductOutcomeUseCase, number>> | null
      runtimeReadyUseCaseOptionCloseoutClaimCounts?: Partial<Record<ConstructionOrganizationProductOutcomeUseCase, number>> | null
      runtimeCloseoutClaim?: ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim | null
    }
  >>
  runtimeCloseoutClaimsByBusinessType?: Partial<Record<
    ConstructionOrganizationPrecisionReplayBusinessType,
    ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim
  >>
}

export type BuildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReportInput = {
  precisionReplayMatrix?: ConstructionOrganizationPrecisionReplayMatrix
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport
}

export type BuildConstructionOrganizationProductOutcomeCloseoutProgressForProjectInput = {
  companyId?: string | null
  projectId?: string | null
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type ConstructionOrganizationProductOutcomeCloseoutProgressSnapshot = {
  source: 'construction_organization_product_outcome_closeout_progress_snapshot'
  matrix: ConstructionOrganizationProductOutcomeCloseoutMatrix
  progress: ConstructionOrganizationProductOutcomeCloseoutProgress
  boundaryPolicy: string[]
}

const MUTATION_BOUNDARY: ConstructionOrganizationProductOutcomeCloseoutMatrix['mutationBoundary'] = {
  writesTaskDependencies: false,
  writesPlanDates: false,
  writesSeed: false,
  writesBaseline: false,
  writesCriticalPathFacts: false,
  writesAccelerationDraft: false,
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function appendUnique(target: string[], value: unknown) {
  const text = normalizeText(value)
  if (text && !target.includes(text)) target.push(text)
}

function buildRuntimeOptionNetworkIdentity(draftNetworkKey: unknown, optionId: unknown) {
  const draftText = normalizeText(draftNetworkKey)
  if (draftText) return `draft:${draftText}`
  const optionText = normalizeText(optionId)
  return optionText ? `option:${optionText}` : null
}

function collectRuntimeEvidenceOptionNetworkKeys(
  items: ConstructionOrganizationPlanNetworkDraftReport['items'],
) {
  const keys = new Set<string>()
  for (const item of items) {
    if (!normalizeText(item.runtimeEngineEvidence?.publicationKey)) continue
    const key = buildRuntimeOptionNetworkIdentity(item.draftNetworkKey, item.optionId)
    if (key) keys.add(key)
  }
  return keys
}

type RuntimeEvidenceContextDraft = {
  projectIds: string[]
  draftNetworkKeys: string[]
  optionIds: string[]
  publicationKeys: string[]
  evidenceSources: string[]
  useCases: ConstructionOrganizationProductOutcomeUseCase[]
  optionCount: number
  runtimeReadyOptionCount: number
  runtimeReadyOptionCloseoutClaimCount: number
  runtimeReadyUseCaseOptionCounts: Record<ConstructionOrganizationProductOutcomeUseCase, number>
  runtimeReadyUseCaseOptionCloseoutClaimCounts: Record<ConstructionOrganizationProductOutcomeUseCase, number>
  runtimeCloseoutClaim: ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim | null
}

function buildEmptyRuntimeEvidenceContext(): RuntimeEvidenceContextDraft {
  return {
    projectIds: [],
    draftNetworkKeys: [],
    optionIds: [],
    publicationKeys: [],
    evidenceSources: [],
    useCases: [],
    optionCount: 0,
    runtimeReadyOptionCount: 0,
    runtimeReadyOptionCloseoutClaimCount: 0,
    runtimeCloseoutClaim: null,
    runtimeReadyUseCaseOptionCounts: {
      newProjectPlanning: 0,
      startingLineOnboarding: 0,
      accelerationRecovery: 0,
    },
    runtimeReadyUseCaseOptionCloseoutClaimCounts: {
      newProjectPlanning: 0,
      startingLineOnboarding: 0,
      accelerationRecovery: 0,
    },
  }
}

function runtimeEvidenceContextScore(context: RuntimeEvidenceContextDraft) {
  const useCaseOptionCount = CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES
    .reduce((sum, useCase) => sum + Math.min(
      CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT,
      context.runtimeReadyUseCaseOptionCounts[useCase] ?? 0,
    ), 0)
  const useCaseCloseoutCount = CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES
    .reduce((sum, useCase) => sum + Math.min(
      CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT,
      context.runtimeReadyUseCaseOptionCloseoutClaimCounts[useCase] ?? 0,
    ), 0)
  return [
    Math.min(CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT, context.optionCount),
    Math.min(CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT, context.runtimeReadyOptionCount),
    useCaseOptionCount,
    Math.min(CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT, context.runtimeReadyOptionCloseoutClaimCount),
    useCaseCloseoutCount,
    context.evidenceSources.includes('runtime') ? 1 : 0,
    context.publicationKeys.length,
  ]
}

function compareRuntimeEvidenceContexts(
  left: RuntimeEvidenceContextDraft,
  right: RuntimeEvidenceContextDraft,
) {
  const leftScore = runtimeEvidenceContextScore(left)
  const rightScore = runtimeEvidenceContextScore(right)
  for (let index = 0; index < leftScore.length; index += 1) {
    const delta = leftScore[index] - rightScore[index]
    if (delta !== 0) return delta
  }
  return 0
}

function scopedRuntimeEvidenceProjectKey(
  item: ConstructionOrganizationPlanNetworkDraftReport['items'][number],
  index: number,
) {
  const projectId = normalizeText(item.projectId)
  if (projectId) return `project:${projectId}`
  const draftNetworkKey = normalizeText(item.draftNetworkKey)
  if (draftNetworkKey) return `draft:${draftNetworkKey}`
  const optionId = normalizeText(item.optionId)
  if (optionId) return `option:${optionId}`
  return `item:${index}`
}

function buildRuntimeCloseoutProjectDraftKey(projectId: string | null | undefined, draftNetworkKey: string | null | undefined) {
  const normalizedProjectId = normalizeText(projectId)
  const normalizedDraftNetworkKey = normalizeText(draftNetworkKey)
  return normalizedProjectId && normalizedDraftNetworkKey
    ? `${normalizedProjectId}::${normalizedDraftNetworkKey}`
    : null
}

function findScopedRuntimeCloseoutClaimForReportItem(
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport,
  item: ConstructionOrganizationPlanNetworkDraftReport['items'][number],
) {
  const projectId = normalizeText(item.projectId)
  const draftNetworkKey = normalizeText(item.draftNetworkKey)
  const projectDraftKey = buildRuntimeCloseoutProjectDraftKey(projectId, draftNetworkKey)
  const projectDraftClaim = projectDraftKey
    ? planNetworkReport.runtimeCloseoutClaimsByProjectDraftNetworkKey?.[projectDraftKey] ?? null
    : null
  if (projectDraftClaim) return projectDraftClaim

  const projectClaim = projectId
    ? planNetworkReport.runtimeCloseoutClaimsByProject?.[projectId] ?? null
    : null
  if (projectClaim && !projectClaim.canClaimRuntimeCloseout) return projectClaim

  const draftClaim = draftNetworkKey
    ? planNetworkReport.runtimeCloseoutClaimsByDraftNetworkKey?.[draftNetworkKey] ?? null
    : null
  if (draftClaim) return draftClaim
  return draftNetworkKey ? null : projectClaim
}

function findReportItemForOption(input: {
  itemByDraftKey: Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number]>
  itemsByOptionId: Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number][]>
  draftNetworkKey: string
  optionId: string
}) {
  if (input.draftNetworkKey) {
    return input.itemByDraftKey.get(input.draftNetworkKey) ?? null
  }
  if (!input.optionId) return null
  const optionItems = input.itemsByOptionId.get(input.optionId) ?? []
  return optionItems.length === 1 ? optionItems[0] : null
}

function buildRuntimeReadyOptionNetworkKeysByBusinessType(
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport,
) {
  const keysByBusinessType: Partial<Record<ConstructionOrganizationPrecisionReplayBusinessType, Set<string>>> = {}
  const itemByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number]>()
  const itemsByOptionId = new Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number][]>()
  for (const item of planNetworkReport.items) {
    const draftNetworkKey = normalizeText(item.draftNetworkKey)
    const optionId = normalizeText(item.optionId)
    if (draftNetworkKey) itemByDraftKey.set(draftNetworkKey, item)
    if (optionId) itemsByOptionId.set(optionId, [...(itemsByOptionId.get(optionId) ?? []), item])
  }

  for (const option of planNetworkReport.optionComparisonPackage?.options ?? []) {
    if (!option.runtimeMaterializationEvidence?.canClaimRuntimeMaterializationEvidence) continue
    const optionId = normalizeText(option.optionId)
    const draftNetworkKey = normalizeText(option.draftNetworkKey)
    const item = findReportItemForOption({ itemByDraftKey, itemsByOptionId, draftNetworkKey, optionId })
    const businessType = item?.businessType as ConstructionOrganizationPrecisionReplayBusinessType | null
    if (!businessType) continue
    const key = buildRuntimeOptionNetworkIdentity(draftNetworkKey, optionId)
    if (!key) continue
    const keys = keysByBusinessType[businessType] ?? new Set<string>()
    keys.add(key)
    keysByBusinessType[businessType] = keys
  }

  return keysByBusinessType
}

function isRuntimeReadyProductEntryScore(score: unknown) {
  if (!score || typeof score !== 'object') return false
  const record = score as Record<string, unknown>
  const optionScore = Number(record.optionScore)
  const actionability = normalizeText(record.actionability)
  return Number.isFinite(optionScore)
    && optionScore > 0
    && actionability === 'actionable_candidate'
}

function runtimeEvidenceDeclaresUseCase(
  option: ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage']['options'][number],
  useCase: ConstructionOrganizationProductOutcomeUseCase,
) {
  const coverage = option.runtimeMaterializationEvidence?.runtimeUseCaseCoverage
  const useCaseCoverage = coverage && typeof coverage === 'object'
    ? (coverage as Record<string, unknown>)[useCase]
    : null
  return Boolean(
    useCaseCoverage
      && typeof useCaseCoverage === 'object'
      && (useCaseCoverage as Record<string, unknown>).canClaimRuntimeUseCaseEvidence === true,
  )
}

function buildRuntimeReadyUseCaseOptionCountsByBusinessType(
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport,
) {
  const countsByBusinessType: Partial<Record<
    ConstructionOrganizationPrecisionReplayBusinessType,
    Record<ConstructionOrganizationProductOutcomeUseCase, Set<string>>
  >> = {}
  const itemByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number]>()
  const itemsByOptionId = new Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number][]>()
  for (const item of planNetworkReport.items) {
    const draftNetworkKey = normalizeText(item.draftNetworkKey)
    const optionId = normalizeText(item.optionId)
    if (draftNetworkKey) itemByDraftKey.set(draftNetworkKey, item)
    if (optionId) itemsByOptionId.set(optionId, [...(itemsByOptionId.get(optionId) ?? []), item])
  }

  for (const option of planNetworkReport.optionComparisonPackage?.options ?? []) {
    if (!option.runtimeMaterializationEvidence?.canClaimRuntimeMaterializationEvidence) continue
    const optionId = normalizeText(option.optionId)
    const draftNetworkKey = normalizeText(option.draftNetworkKey)
    const item = findReportItemForOption({ itemByDraftKey, itemsByOptionId, draftNetworkKey, optionId })
    const businessType = item?.businessType as ConstructionOrganizationPrecisionReplayBusinessType | null
    if (!businessType) continue
    const key = buildRuntimeOptionNetworkIdentity(draftNetworkKey, optionId)
    if (!key) continue

    const counts = countsByBusinessType[businessType] ?? {
      newProjectPlanning: new Set<string>(),
      startingLineOnboarding: new Set<string>(),
      accelerationRecovery: new Set<string>(),
    }
    for (const useCase of CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES) {
      if (
        isRuntimeReadyProductEntryScore(option.useCaseScores?.[useCase])
        && runtimeEvidenceDeclaresUseCase(option, useCase)
      ) {
        counts[useCase].add(key)
      }
    }
    countsByBusinessType[businessType] = counts
  }

  return Object.fromEntries(Object.entries(countsByBusinessType).map(([businessType, counts]) => [
    businessType,
    Object.fromEntries(CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES.map((useCase) => [
      useCase,
      counts?.[useCase]?.size ?? 0,
    ])),
  ])) as Partial<Record<
    ConstructionOrganizationPrecisionReplayBusinessType,
    Record<ConstructionOrganizationProductOutcomeUseCase, number>
  >>
}

function buildRuntimeReadyOptionCloseoutClaimKeysByBusinessType(
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport,
) {
  const keysByBusinessType: Partial<Record<ConstructionOrganizationPrecisionReplayBusinessType, Set<string>>> = {}
  const itemByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number]>()
  const itemsByOptionId = new Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number][]>()
  for (const item of planNetworkReport.items) {
    const draftNetworkKey = normalizeText(item.draftNetworkKey)
    const optionId = normalizeText(item.optionId)
    if (draftNetworkKey) itemByDraftKey.set(draftNetworkKey, item)
    if (optionId) itemsByOptionId.set(optionId, [...(itemsByOptionId.get(optionId) ?? []), item])
  }

  for (const option of planNetworkReport.optionComparisonPackage?.options ?? []) {
    if (!option.runtimeMaterializationEvidence?.canClaimRuntimeMaterializationEvidence) continue
    const optionId = normalizeText(option.optionId)
    const draftNetworkKey = normalizeText(option.draftNetworkKey)
    const item = findReportItemForOption({ itemByDraftKey, itemsByOptionId, draftNetworkKey, optionId })
    const businessType = item?.businessType as ConstructionOrganizationPrecisionReplayBusinessType | null
    if (!businessType) continue
    const scopedClaim = findScopedRuntimeCloseoutClaimForReportItem(planNetworkReport, item)
    if (scopedClaim?.canClaimRuntimeCloseout !== true) continue
    const key = buildRuntimeOptionNetworkIdentity(draftNetworkKey, optionId)
    if (!key) continue
    const keys = keysByBusinessType[businessType] ?? new Set<string>()
    keys.add(key)
    keysByBusinessType[businessType] = keys
  }

  return keysByBusinessType
}

function buildRuntimeReadyUseCaseOptionCloseoutClaimCountsByBusinessType(
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport,
) {
  const countsByBusinessType: Partial<Record<
    ConstructionOrganizationPrecisionReplayBusinessType,
    Record<ConstructionOrganizationProductOutcomeUseCase, Set<string>>
  >> = {}
  const itemByDraftKey = new Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number]>()
  const itemsByOptionId = new Map<string, ConstructionOrganizationPlanNetworkDraftReport['items'][number][]>()
  for (const item of planNetworkReport.items) {
    const draftNetworkKey = normalizeText(item.draftNetworkKey)
    const optionId = normalizeText(item.optionId)
    if (draftNetworkKey) itemByDraftKey.set(draftNetworkKey, item)
    if (optionId) itemsByOptionId.set(optionId, [...(itemsByOptionId.get(optionId) ?? []), item])
  }

  for (const option of planNetworkReport.optionComparisonPackage?.options ?? []) {
    if (!option.runtimeMaterializationEvidence?.canClaimRuntimeMaterializationEvidence) continue
    const optionId = normalizeText(option.optionId)
    const draftNetworkKey = normalizeText(option.draftNetworkKey)
    const item = findReportItemForOption({ itemByDraftKey, itemsByOptionId, draftNetworkKey, optionId })
    const businessType = item?.businessType as ConstructionOrganizationPrecisionReplayBusinessType | null
    if (!businessType) continue
    const scopedClaim = findScopedRuntimeCloseoutClaimForReportItem(planNetworkReport, item)
    if (scopedClaim?.canClaimRuntimeCloseout !== true) continue
    const key = buildRuntimeOptionNetworkIdentity(draftNetworkKey, optionId)
    if (!key) continue

    const counts = countsByBusinessType[businessType] ?? {
      newProjectPlanning: new Set<string>(),
      startingLineOnboarding: new Set<string>(),
      accelerationRecovery: new Set<string>(),
    }
    for (const useCase of CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES) {
      if (
        isRuntimeReadyProductEntryScore(option.useCaseScores?.[useCase])
        && runtimeEvidenceDeclaresUseCase(option, useCase)
      ) {
        counts[useCase].add(key)
      }
    }
    countsByBusinessType[businessType] = counts
  }

  return Object.fromEntries(Object.entries(countsByBusinessType).map(([businessType, counts]) => [
    businessType,
    Object.fromEntries(CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES.map((useCase) => [
      useCase,
      counts?.[useCase]?.size ?? 0,
    ])),
  ])) as Partial<Record<
    ConstructionOrganizationPrecisionReplayBusinessType,
    Record<ConstructionOrganizationProductOutcomeUseCase, number>
  >>
}

function collectRuntimeEvidenceUseCasesFromReadyCounts(
  counts: Record<ConstructionOrganizationProductOutcomeUseCase, number>,
) {
  return CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES
    .filter((useCase) => counts[useCase] > 0)
}

const PRODUCT_OUTCOME_MISSING_REASON_ACTIONS: Record<string, string> = {
  precision_replay_row_required: 'run_precision_replay_for_business_type',
  precision_replay_ready_required: 'resolve_precision_replay_for_business_type',
  runtime_closeout_claim_by_business_type_required: 'collect_runtime_closeout_claim_for_business_type',
  runtime_business_type_attribution_required: 'resolve_runtime_business_type_attribution_for_business_type',
  release_exit_handoff_candidate_event_required: 'link_release_exit_handoff_for_business_type',
  domain_writer_runtime_publication_required: 'link_runtime_publication_for_business_type',
  runtime_consumer_observation_required: 'record_runtime_consumer_observation_for_business_type',
  post_materialization_impact_monitoring_result_required: 'record_impact_monitoring_for_business_type',
  rollback_execution_verification_required: 'record_rollback_evidence_for_business_type',
  saved_network_outcome_required: 'record_saved_network_outcome_for_business_type',
  true_per_option_E1_E3_E5_runtime_evidence_required: 'record_E1_E3_E5_runtime_accuracy_for_business_type',
  site_adoption_of_runtime_recommended_option_required: 'record_site_adoption_for_business_type',
  real_runtime_evidence_source_required: 'collect_real_runtime_evidence_for_business_type',
  runtime_use_case_coverage_required: 'collect_runtime_use_case_evidence_for_business_type',
  runtime_option_network_coverage_required: 'collect_runtime_option_network_evidence_for_business_type',
  runtime_ready_option_network_coverage_required: 'collect_runtime_ready_option_network_evidence_for_business_type',
  runtime_ready_option_closeout_claim_coverage_required: 'collect_runtime_ready_option_closeout_claim_evidence_for_business_type',
  runtime_ready_use_case_option_coverage_required: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
}

const PRODUCT_OUTCOME_MISSING_REASON_PREFIX_ACTIONS: Array<{ prefix: string; action: string }> = [
  {
    prefix: 'runtime_business_type_conflict:',
    action: 'resolve_runtime_business_type_conflict_for_business_type',
  },
  {
    prefix: 'runtime_use_case_coverage_required:',
    action: 'collect_runtime_use_case_evidence_for_business_type',
  },
  {
    prefix: 'runtime_ready_use_case_option_coverage_required:',
    action: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
  },
  {
    prefix: 'runtime_ready_use_case_option_closeout_claim_coverage_required:',
    action: 'collect_runtime_ready_use_case_option_closeout_claim_evidence_for_business_type',
  },
]

const PRODUCT_OUTCOME_ACTION_OPERATION_HINTS: Record<
  string,
  Pick<ConstructionOrganizationProductOutcomeNextEvidenceOperation, 'operationAction' | 'assetType'>
> = {
  link_release_exit_handoff_for_business_type: {
    operationAction: 'release_exit_handoff',
    assetType: 'construction_organization_plan_network',
  },
  link_runtime_publication_for_business_type: {
    operationAction: 'runtime_apply',
    assetType: 'construction_organization_plan_network',
  },
  record_runtime_consumer_observation_for_business_type: {
    operationAction: 'runtime_consumer_observation',
    assetType: 'construction_organization_plan_network',
  },
  record_impact_monitoring_for_business_type: {
    operationAction: 'runtime_impact_monitoring',
    assetType: 'construction_organization_plan_network',
  },
  record_rollback_evidence_for_business_type: {
    operationAction: 'runtime_rollback_execution',
    assetType: 'construction_organization_plan_network',
  },
  record_saved_network_outcome_for_business_type: {
    operationAction: 'runtime_saved_outcome',
    assetType: 'construction_organization_plan_network',
  },
  record_E1_E3_E5_runtime_accuracy_for_business_type: {
    operationAction: 'runtime_engine_evidence',
    assetType: 'construction_organization_plan_network',
  },
  collect_runtime_use_case_evidence_for_business_type: {
    operationAction: 'runtime_engine_evidence',
    assetType: 'construction_organization_plan_network',
  },
  collect_runtime_option_network_evidence_for_business_type: {
    operationAction: 'runtime_engine_evidence',
    assetType: 'construction_organization_plan_network',
  },
  collect_real_runtime_evidence_for_business_type: {
    operationAction: 'runtime_engine_evidence',
    assetType: 'construction_organization_plan_network',
  },
  collect_runtime_ready_option_network_evidence_for_business_type: {
    operationAction: 'runtime_engine_evidence',
    assetType: 'construction_organization_plan_network',
  },
  collect_runtime_ready_use_case_option_evidence_for_business_type: {
    operationAction: 'runtime_engine_evidence',
    assetType: 'construction_organization_plan_network',
  },
  record_site_adoption_for_business_type: {
    operationAction: 'runtime_recommendation_adopt',
    assetType: 'construction_organization_plan_network',
  },
}

function uniqueTextArray(values: unknown[]) {
  return Array.from(new Set(values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)))
}

function hasRealRuntimeEvidenceSource(values: unknown[]) {
  const sources = uniqueTextArray(values).map((value) => value.toLowerCase())
  return sources.includes('runtime')
}

function normalizeRuntimeUseCases(values: unknown[]) {
  const allowed = new Set<string>(CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES)
  return uniqueTextArray(values)
    .filter((value): value is ConstructionOrganizationProductOutcomeUseCase => allowed.has(value))
}

function normalizeNonNegativeInteger(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0
}

function normalizeRuntimeReadyUseCaseOptionCounts(
  value: Partial<Record<ConstructionOrganizationProductOutcomeUseCase, number>> | null | undefined,
): ConstructionOrganizationRuntimeReadyUseCaseOptionCounts {
  return Object.fromEntries(CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES.map((useCase) => [
    useCase,
    normalizeNonNegativeInteger(value?.[useCase]),
  ])) as ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
}

function productOutcomeDeficit(count: number) {
  return Math.max(0, CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT - count)
}

function buildRuntimeReadyUseCaseOptionDeficits(
  counts: ConstructionOrganizationRuntimeReadyUseCaseOptionCounts,
): ConstructionOrganizationRuntimeReadyUseCaseOptionCounts {
  return Object.fromEntries(CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES.map((useCase) => [
    useCase,
    productOutcomeDeficit(counts[useCase]),
  ])) as ConstructionOrganizationRuntimeReadyUseCaseOptionCounts
}

function buildProductOutcomeNextEvidenceActions(missingReasons: string[]) {
  const actions = missingReasons
    .map((reason) => PRODUCT_OUTCOME_MISSING_REASON_ACTIONS[reason]
      ?? PRODUCT_OUTCOME_MISSING_REASON_PREFIX_ACTIONS.find((item) => reason.startsWith(item.prefix))?.action)
    .filter((action): action is string => Boolean(action))
  if (actions.length > 0) return Array.from(new Set(actions))
  return missingReasons.length > 0 ? ['resolve_product_outcome_closeout_evidence_for_business_type'] : []
}

function buildProductOutcomeNextEvidenceOperations(
  nextEvidenceActions: string[],
  businessType: ConstructionOrganizationPrecisionReplayBusinessType | null = null,
): ConstructionOrganizationProductOutcomeNextEvidenceOperation[] {
  const operations = nextEvidenceActions
    .map((evidenceAction) => {
      const hint = PRODUCT_OUTCOME_ACTION_OPERATION_HINTS[evidenceAction]
      if (!hint) return null
      return {
        source: 'construction_organization_product_outcome_next_evidence_operation' as const,
        businessType,
        evidenceAction,
        operationAction: hint.operationAction,
        assetType: hint.assetType,
        boundaryPolicy: [
          'operation_hint_is_read_only',
          'workbench_operation_still_requires_user_submitted_evidence',
          'does_not_write_runtime_or_plan_data',
        ],
      }
    })
    .filter((item): item is ConstructionOrganizationProductOutcomeNextEvidenceOperation => Boolean(item))
  const seen = new Set<string>()
  return operations.filter((operation) => {
    const key = `${operation.businessType ?? 'matrix'}:${operation.evidenceAction}:${operation.operationAction}:${operation.assetType}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildProductOutcomeCloseoutRow(
  input: BuildConstructionOrganizationProductOutcomeCloseoutMatrixInput,
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
): ConstructionOrganizationProductOutcomeCloseoutRow {
  const precisionRow = input.precisionReplayMatrix.businessTypes.find((row) => row.businessType === businessType) ?? null
  const runtimeClaim = input.runtimeCloseoutClaimsByBusinessType?.[businessType] ?? null
  const runtimeEvidenceContext = input.runtimeEvidenceContextsByBusinessType?.[businessType]
  const scopedRuntimeClaim = runtimeEvidenceContext
    ? (runtimeEvidenceContext.runtimeCloseoutClaim ?? null)
    : runtimeClaim
  const hasPrecisionReplayEvidence = precisionRow?.status === 'precision_replay_ready'
  const hasRuntimeCloseoutClaimEvidence = scopedRuntimeClaim?.canClaimRuntimeCloseout === true
  const runtimeEvidenceProjectIds = uniqueTextArray(runtimeEvidenceContext?.projectIds ?? [])
  const runtimeEvidenceDraftNetworkKeys = uniqueTextArray(runtimeEvidenceContext?.draftNetworkKeys ?? [])
  const runtimeEvidenceOptionIds = uniqueTextArray(runtimeEvidenceContext?.optionIds ?? [])
  const runtimeEvidencePublicationKeys = uniqueTextArray(runtimeEvidenceContext?.publicationKeys ?? [])
  const runtimeEvidenceSources = uniqueTextArray(runtimeEvidenceContext?.evidenceSources ?? [])
  const hasRuntimeSource = hasRuntimeCloseoutClaimEvidence && hasRealRuntimeEvidenceSource(runtimeEvidenceSources)
  const runtimeEvidenceOptionCount = normalizeNonNegativeInteger(runtimeEvidenceContext?.optionCount)
  const runtimeEvidenceOptionDeficit = productOutcomeDeficit(runtimeEvidenceOptionCount)
  const hasRequiredRuntimeOptionNetworkCoverage =
    runtimeEvidenceOptionCount >= CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT
  const runtimeEvidenceRuntimeReadyOptionCount = normalizeNonNegativeInteger(runtimeEvidenceContext?.runtimeReadyOptionCount)
  const runtimeEvidenceRuntimeReadyOptionDeficit = productOutcomeDeficit(runtimeEvidenceRuntimeReadyOptionCount)
  const hasRequiredRuntimeReadyOptionNetworkCoverage =
    runtimeEvidenceRuntimeReadyOptionCount >= CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT
  const runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount =
    normalizeNonNegativeInteger(runtimeEvidenceContext?.runtimeReadyOptionCloseoutClaimCount)
  const runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit =
    productOutcomeDeficit(runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount)
  const hasRequiredRuntimeReadyOptionCloseoutClaimCoverage =
    runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount >= CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT
  const runtimeReadyUseCaseOptionCounts = normalizeRuntimeReadyUseCaseOptionCounts(
    runtimeEvidenceContext?.runtimeReadyUseCaseOptionCounts,
  )
  const runtimeReadyUseCaseOptionDeficits =
    buildRuntimeReadyUseCaseOptionDeficits(runtimeReadyUseCaseOptionCounts)
  const runtimeEvidenceUseCases = normalizeRuntimeUseCases(runtimeEvidenceContext?.useCases ?? [])
    .filter((useCase) => runtimeReadyUseCaseOptionCounts[useCase] > 0)
  const missingRuntimeUseCases = CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES
    .filter((useCase) => !runtimeEvidenceUseCases.includes(useCase))
  const hasRequiredRuntimeUseCaseCoverage = missingRuntimeUseCases.length === 0
  const runtimeReadyUseCaseOptionCloseoutClaimCounts = normalizeRuntimeReadyUseCaseOptionCounts(
    runtimeEvidenceContext?.runtimeReadyUseCaseOptionCloseoutClaimCounts,
  )
  const runtimeReadyUseCaseOptionCloseoutClaimDeficits =
    buildRuntimeReadyUseCaseOptionDeficits(runtimeReadyUseCaseOptionCloseoutClaimCounts)
  const missingRuntimeReadyUseCaseOptionCoverage = CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES
    .filter((useCase) => (
      runtimeReadyUseCaseOptionCounts[useCase] < CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT
    ))
  const hasRequiredRuntimeReadyUseCaseOptionCoverage = missingRuntimeReadyUseCaseOptionCoverage.length === 0
  const missingRuntimeReadyUseCaseOptionCloseoutClaimCoverage = CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES
    .filter((useCase) => (
      runtimeReadyUseCaseOptionCloseoutClaimCounts[useCase] < CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT
    ))
  const hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage =
    missingRuntimeReadyUseCaseOptionCloseoutClaimCoverage.length === 0
  const runtimeClaimMissingReasons = uniqueTextArray(scopedRuntimeClaim?.missingBeforeClaim ?? [])
  const hasRuntimeCloseoutClaim = hasRuntimeCloseoutClaimEvidence
    && hasRuntimeSource
    && hasRequiredRuntimeUseCaseCoverage
    && hasRequiredRuntimeOptionNetworkCoverage
    && hasRequiredRuntimeReadyOptionNetworkCoverage
    && hasRequiredRuntimeReadyOptionCloseoutClaimCoverage
    && hasRequiredRuntimeReadyUseCaseOptionCoverage
    && hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage
  const missingReasons = [
    !precisionRow ? 'precision_replay_row_required' : null,
    precisionRow && !hasPrecisionReplayEvidence ? 'precision_replay_ready_required' : null,
    ...((precisionRow && precisionRow.status !== 'precision_replay_ready') ? precisionRow.missingReasons : []),
    !hasRuntimeCloseoutClaimEvidence ? 'runtime_closeout_claim_by_business_type_required' : null,
    hasRuntimeCloseoutClaimEvidence && !hasRuntimeSource ? 'real_runtime_evidence_source_required' : null,
    ...(hasRuntimeCloseoutClaimEvidence && hasRuntimeSource
      ? missingRuntimeUseCases.map((useCase) => `runtime_use_case_coverage_required:${useCase}`)
      : []),
    hasRuntimeCloseoutClaimEvidence && hasRuntimeSource && !hasRequiredRuntimeOptionNetworkCoverage
      ? 'runtime_option_network_coverage_required'
      : null,
    hasRuntimeCloseoutClaimEvidence && hasRuntimeSource && hasRequiredRuntimeOptionNetworkCoverage && !hasRequiredRuntimeReadyOptionNetworkCoverage
      ? 'runtime_ready_option_network_coverage_required'
      : null,
    hasRuntimeCloseoutClaimEvidence
      && hasRuntimeSource
      && hasRequiredRuntimeReadyOptionNetworkCoverage
      && !hasRequiredRuntimeReadyOptionCloseoutClaimCoverage
      ? 'runtime_ready_option_closeout_claim_coverage_required'
      : null,
    ...(hasRuntimeCloseoutClaimEvidence && hasRuntimeSource && hasRequiredRuntimeReadyOptionNetworkCoverage
      ? missingRuntimeReadyUseCaseOptionCoverage.map((useCase) =>
          `runtime_ready_use_case_option_coverage_required:${useCase}`)
      : []),
    ...(hasRuntimeCloseoutClaimEvidence
      && hasRuntimeSource
      && hasRequiredRuntimeReadyOptionCloseoutClaimCoverage
      && hasRequiredRuntimeReadyUseCaseOptionCoverage
      ? missingRuntimeReadyUseCaseOptionCloseoutClaimCoverage.map((useCase) =>
          `runtime_ready_use_case_option_closeout_claim_coverage_required:${useCase}`)
      : []),
    ...(scopedRuntimeClaim && !hasRuntimeCloseoutClaimEvidence ? runtimeClaimMissingReasons : []),
  ].filter((item): item is string => Boolean(item))
  const nextEvidenceActions = buildProductOutcomeNextEvidenceActions(missingReasons)
  const nextEvidenceOperations = buildProductOutcomeNextEvidenceOperations(nextEvidenceActions, businessType)

  return {
    source: 'construction_organization_product_outcome_closeout_row',
    businessType,
    status: missingReasons.length === 0
      ? 'product_outcome_closeout_ready'
      : 'product_outcome_closeout_incomplete',
    hasPrecisionReplayEvidence,
    hasRuntimeCloseoutClaimEvidence,
    hasRuntimeCloseoutClaim,
    runtimeClaimStatus: scopedRuntimeClaim?.status ?? null,
    runtimeEvidenceProjectIds,
    runtimeEvidenceDraftNetworkKeys,
    runtimeEvidenceOptionIds,
    runtimeEvidencePublicationKeys,
    runtimeEvidenceSources,
    runtimeEvidenceUseCases,
    runtimeEvidenceOptionCount,
    runtimeEvidenceOptionDeficit,
    runtimeEvidenceRuntimeReadyOptionCount,
    runtimeEvidenceRuntimeReadyOptionDeficit,
    runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount,
    runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit,
    runtimeReadyUseCaseOptionCounts,
    runtimeReadyUseCaseOptionDeficits,
    runtimeReadyUseCaseOptionCloseoutClaimCounts,
    runtimeReadyUseCaseOptionCloseoutClaimDeficits,
    hasRealRuntimeEvidenceSource: hasRuntimeSource,
    hasRequiredRuntimeUseCaseCoverage,
    hasRequiredRuntimeOptionNetworkCoverage,
    hasRequiredRuntimeReadyOptionNetworkCoverage,
    hasRequiredRuntimeReadyOptionCloseoutClaimCoverage,
    hasRequiredRuntimeReadyUseCaseOptionCoverage,
    hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage,
    runtimeClaimMissingReasons,
    missingReasons,
    nextEvidenceActions,
    nextEvidenceOperations,
  }
}

function buildProductOutcomeNextEvidenceWorkItems(
  rows: ConstructionOrganizationProductOutcomeCloseoutRow[],
): ConstructionOrganizationProductOutcomeNextEvidenceWorkItem[] {
  return rows
    .filter((row) => row.missingReasons.length > 0)
    .map((row) => ({
      source: 'construction_organization_product_outcome_next_evidence_work_item' as const,
      businessType: row.businessType,
      status: row.status,
      hasRuntimeCloseoutClaimEvidence: row.hasRuntimeCloseoutClaimEvidence,
      runtimeEvidenceProjectIds: row.runtimeEvidenceProjectIds,
      runtimeEvidenceDraftNetworkKeys: row.runtimeEvidenceDraftNetworkKeys,
      runtimeEvidenceOptionIds: row.runtimeEvidenceOptionIds,
      runtimeEvidencePublicationKeys: row.runtimeEvidencePublicationKeys,
      runtimeEvidenceSources: row.runtimeEvidenceSources,
      runtimeEvidenceUseCases: row.runtimeEvidenceUseCases,
      runtimeEvidenceOptionCount: row.runtimeEvidenceOptionCount,
      runtimeEvidenceOptionDeficit: row.runtimeEvidenceOptionDeficit,
      runtimeEvidenceRuntimeReadyOptionCount: row.runtimeEvidenceRuntimeReadyOptionCount,
      runtimeEvidenceRuntimeReadyOptionDeficit: row.runtimeEvidenceRuntimeReadyOptionDeficit,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: row.runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit: row.runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit,
      runtimeReadyUseCaseOptionCounts: row.runtimeReadyUseCaseOptionCounts,
      runtimeReadyUseCaseOptionDeficits: row.runtimeReadyUseCaseOptionDeficits,
      runtimeReadyUseCaseOptionCloseoutClaimCounts: row.runtimeReadyUseCaseOptionCloseoutClaimCounts,
      runtimeReadyUseCaseOptionCloseoutClaimDeficits: row.runtimeReadyUseCaseOptionCloseoutClaimDeficits,
      hasRealRuntimeEvidenceSource: row.hasRealRuntimeEvidenceSource,
      hasRequiredRuntimeUseCaseCoverage: row.hasRequiredRuntimeUseCaseCoverage,
      hasRequiredRuntimeOptionNetworkCoverage: row.hasRequiredRuntimeOptionNetworkCoverage,
      hasRequiredRuntimeReadyOptionNetworkCoverage: row.hasRequiredRuntimeReadyOptionNetworkCoverage,
      hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: row.hasRequiredRuntimeReadyOptionCloseoutClaimCoverage,
      hasRequiredRuntimeReadyUseCaseOptionCoverage: row.hasRequiredRuntimeReadyUseCaseOptionCoverage,
      hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage: row.hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage,
      runtimeClaimMissingReasons: row.runtimeClaimMissingReasons,
      missingReasons: row.missingReasons,
      nextEvidenceActions: row.nextEvidenceActions,
      nextEvidenceOperations: row.nextEvidenceOperations,
    }))
}

function buildProductOutcomeEvidenceExecutionPlanItem(input: {
  businessType: ConstructionOrganizationPrecisionReplayBusinessType
  useCase: ConstructionOrganizationProductOutcomeUseCase | null
  evidenceAction: string
  currentCount: number
  deficit: number
}): ConstructionOrganizationProductOutcomeEvidenceExecutionPlanItem | null {
  if (input.deficit <= 0) return null
  const hint = PRODUCT_OUTCOME_ACTION_OPERATION_HINTS[input.evidenceAction]
  if (!hint) return null
  return {
    source: 'construction_organization_product_outcome_evidence_execution_plan_item',
    businessType: input.businessType,
    useCase: input.useCase,
    evidenceAction: input.evidenceAction,
    operationAction: hint.operationAction,
    assetType: hint.assetType,
    requiredCount: CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT,
    currentCount: input.currentCount,
    deficit: input.deficit,
    mutationBoundary: MUTATION_BOUNDARY,
    boundaryPolicy: [
      'execution_plan_is_gap_guidance_only',
      'execution_plan_does_not_write_runtime_or_plan_data',
      'real_runtime_evidence_or_user_adoption_still_required',
    ],
  }
}

function buildProductOutcomeEvidenceExecutionPlan(
  rows: ConstructionOrganizationProductOutcomeCloseoutRow[],
): ConstructionOrganizationProductOutcomeEvidenceExecutionPlanItem[] {
  const items = rows.flatMap((row) => {
    const rowItems: Array<ConstructionOrganizationProductOutcomeEvidenceExecutionPlanItem | null> = [
      buildProductOutcomeEvidenceExecutionPlanItem({
        businessType: row.businessType,
        useCase: null,
        evidenceAction: 'collect_runtime_option_network_evidence_for_business_type',
        currentCount: row.runtimeEvidenceOptionCount,
        deficit: row.runtimeEvidenceOptionDeficit,
      }),
      buildProductOutcomeEvidenceExecutionPlanItem({
        businessType: row.businessType,
        useCase: null,
        evidenceAction: 'collect_runtime_ready_option_network_evidence_for_business_type',
        currentCount: row.runtimeEvidenceRuntimeReadyOptionCount,
        deficit: row.runtimeEvidenceRuntimeReadyOptionDeficit,
      }),
      buildProductOutcomeEvidenceExecutionPlanItem({
        businessType: row.businessType,
        useCase: null,
        evidenceAction: 'collect_runtime_ready_option_closeout_claim_evidence_for_business_type',
        currentCount: row.runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount,
        deficit: row.runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit,
      }),
    ]

    CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES.forEach((useCase) => {
      rowItems.push(buildProductOutcomeEvidenceExecutionPlanItem({
        businessType: row.businessType,
        useCase,
        evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
        currentCount: row.runtimeReadyUseCaseOptionCounts[useCase],
        deficit: row.runtimeReadyUseCaseOptionDeficits[useCase],
      }))
      rowItems.push(buildProductOutcomeEvidenceExecutionPlanItem({
        businessType: row.businessType,
        useCase,
        evidenceAction: 'collect_runtime_ready_use_case_option_closeout_claim_evidence_for_business_type',
        currentCount: row.runtimeReadyUseCaseOptionCloseoutClaimCounts[useCase],
        deficit: row.runtimeReadyUseCaseOptionCloseoutClaimDeficits[useCase],
      }))
    })

    return rowItems
  })

  return items.filter((item): item is ConstructionOrganizationProductOutcomeEvidenceExecutionPlanItem => Boolean(item))
}

function buildProductOutcomeEvidenceWorkPackages(
  workItems: ConstructionOrganizationProductOutcomeNextEvidenceWorkItem[],
  executionPlan: ConstructionOrganizationProductOutcomeEvidenceExecutionPlanItem[],
): ConstructionOrganizationProductOutcomeEvidenceWorkPackage[] {
  return workItems.map((workItem) => {
    const workPackageKey = `construction_organization_product_outcome:${workItem.businessType}`
    const packageExecutionPlan = executionPlan.filter((item) => item.businessType === workItem.businessType)
    const missingRuntimeAnchors: Array<'projectId' | 'draftNetworkKey' | 'publicationKey'> = [
      workItem.runtimeEvidenceProjectIds.length === 0 ? 'projectId' : null,
      workItem.runtimeEvidenceDraftNetworkKeys.length === 0 ? 'draftNetworkKey' : null,
      workItem.runtimeEvidencePublicationKeys.length === 0 ? 'publicationKey' : null,
    ].filter((item): item is 'projectId' | 'draftNetworkKey' | 'publicationKey' => Boolean(item))
    const canPrefillControlledOperation = workItem.runtimeEvidenceProjectIds.length > 0
      && workItem.runtimeEvidenceDraftNetworkKeys.length > 0
      && workItem.runtimeEvidencePublicationKeys.length > 0
    const executionStatus: ConstructionOrganizationProductOutcomeEvidenceWorkPackageStep['executionStatus'] = canPrefillControlledOperation
      ? 'ready_for_controlled_prefill'
      : 'blocked_missing_runtime_anchors'
    const executionSteps = packageExecutionPlan.map((item) => ({
      source: 'construction_organization_product_outcome_evidence_work_package_step' as const,
      workPackageKey,
      businessType: workItem.businessType,
      useCase: item.useCase,
      evidenceAction: item.evidenceAction,
      operationAction: item.operationAction,
      assetType: item.assetType,
      requiredCount: item.requiredCount,
      currentCount: item.currentCount,
      deficit: item.deficit,
      runtimeEvidenceProjectIds: workItem.runtimeEvidenceProjectIds,
      runtimeEvidenceDraftNetworkKeys: workItem.runtimeEvidenceDraftNetworkKeys,
      runtimeEvidenceOptionIds: workItem.runtimeEvidenceOptionIds,
      runtimeEvidencePublicationKeys: workItem.runtimeEvidencePublicationKeys,
      canPrefillControlledOperation,
      executionStatus,
      missingRuntimeAnchors,
      mutationBoundary: MUTATION_BOUNDARY,
      boundaryPolicy: [
        'work_package_step_is_prefill_guidance_only',
        'work_package_step_does_not_write_runtime_or_plan_data',
        'controlled_operation_submission_still_requires_user_action',
      ],
    }))
    const operationActions = Array.from(new Set([
      ...workItem.nextEvidenceOperations.map((operation) => operation.operationAction),
      ...packageExecutionPlan.map((item) => item.operationAction),
    ]))
    const useCases = CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES.filter((useCase) =>
      packageExecutionPlan.some((item) => item.useCase === useCase),
    )
    const totalDeficit = packageExecutionPlan.reduce((sum, item) => sum + item.deficit, 0)
    const prefillableExecutionStepCount = executionSteps.filter((step) => step.canPrefillControlledOperation).length
    const blockedExecutionStepCount = executionSteps.length - prefillableExecutionStepCount
    const missingRuntimeAnchorReasons = missingRuntimeAnchors.map((anchor) => `${anchor}_anchor_required`)

    return {
      source: 'construction_organization_product_outcome_evidence_work_package',
      workPackageKey,
      businessType: workItem.businessType,
      status: workItem.status === 'product_outcome_closeout_ready'
        ? 'evidence_work_package_ready'
        : 'evidence_work_package_open',
      runtimeEvidenceProjectIds: workItem.runtimeEvidenceProjectIds,
      runtimeEvidenceDraftNetworkKeys: workItem.runtimeEvidenceDraftNetworkKeys,
      runtimeEvidenceOptionIds: workItem.runtimeEvidenceOptionIds,
      runtimeEvidencePublicationKeys: workItem.runtimeEvidencePublicationKeys,
      runtimeClaimMissingReasons: workItem.runtimeClaimMissingReasons,
      missingReasons: workItem.missingReasons,
      nextEvidenceActions: workItem.nextEvidenceActions,
      operationActions,
      executionPlanItems: packageExecutionPlan,
      executionSteps,
      executionPlanItemCount: packageExecutionPlan.length,
      prefillableExecutionStepCount,
      blockedExecutionStepCount,
      executionReadinessStatus: executionStatus,
      missingRuntimeAnchorReasons,
      totalDeficit,
      useCases,
      requiredAttributionDimensions: ['businessType', 'draftNetworkKey', 'publicationKey'],
      mutationBoundary: MUTATION_BOUNDARY,
      boundaryPolicy: [
        'work_package_is_auditable_guidance_only',
        'work_package_does_not_fabricate_runtime_evidence',
        'work_package_requires_strict_business_type_draft_publication_attribution',
        'work_package_does_not_write_runtime_or_plan_data',
      ],
    }
  })
}

export function buildConstructionOrganizationProductOutcomeCloseoutProgress(
  matrix: ConstructionOrganizationProductOutcomeCloseoutMatrix,
): ConstructionOrganizationProductOutcomeCloseoutProgress {
  const readyRows = matrix.rows.filter((row) => row.status === 'product_outcome_closeout_ready')
  const missingRows = matrix.rows.filter((row) => row.status !== 'product_outcome_closeout_ready')
  const useCaseCoverage = Object.fromEntries(CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_USE_CASES.map((useCase) => {
    const readyBusinessTypes = matrix.rows
      .filter((row) => row.runtimeReadyUseCaseOptionCounts[useCase] >= CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT
        && row.runtimeReadyUseCaseOptionCloseoutClaimCounts[useCase] >= CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_MIN_OPTION_NETWORK_COUNT)
      .map((row) => row.businessType)
    const readySet = new Set(readyBusinessTypes)
    return [
      useCase,
      {
        readyBusinessTypeCount: readyBusinessTypes.length,
        missingBusinessTypes: matrix.rows
          .map((row) => row.businessType)
          .filter((businessType) => !readySet.has(businessType)),
      },
    ]
  })) as ConstructionOrganizationProductOutcomeCloseoutProgress['useCaseCoverage']
  const prefillableWorkPackageCount = matrix.nextEvidenceWorkPackages
    .filter((workPackage) => workPackage.executionReadinessStatus === 'ready_for_controlled_prefill').length
  const blockedWorkPackageCount = matrix.nextEvidenceWorkPackages.length - prefillableWorkPackageCount

  return {
    source: 'construction_organization_product_outcome_closeout_progress',
    status: matrix.status,
    canDeclareConstructionOrganizationProductOutcomeCloseout:
      matrix.canDeclareConstructionOrganizationProductOutcomeCloseout,
    supportedBusinessTypeCount: matrix.supportedBusinessTypeCount,
    precisionReplayReadyBusinessTypeCount: matrix.precisionReplayReadyBusinessTypeCount,
    runtimeOutcomeReadyBusinessTypeCount: matrix.runtimeOutcomeReadyBusinessTypeCount,
    readyBusinessTypes: readyRows.map((row) => row.businessType),
    missingBusinessTypes: missingRows.map((row) => row.businessType),
    topMissingReasons: matrix.missingReasons.slice(0, 12),
    nextEvidenceActions: matrix.nextEvidenceActions,
    nextEvidenceWorkItemCount: matrix.nextEvidenceWorkItems.length,
    nextEvidenceWorkPackageCount: matrix.nextEvidenceWorkPackages.length,
    prefillableWorkPackageCount,
    blockedWorkPackageCount,
    useCaseCoverage,
    mutationBoundary: matrix.mutationBoundary,
    boundaryPolicy: [
      'progress_projection_is_read_only',
      'progress_projection_does_not_replace_product_outcome_closeout_matrix',
      'progress_projection_does_not_grant_auto_materialization',
      'progress_projection_does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}

export function buildConstructionOrganizationRuntimeCloseoutClaimsByBusinessType(
  precisionReplayMatrix: ConstructionOrganizationPrecisionReplayMatrix,
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport,
) {
  const supportedBusinessTypes = new Set(
    precisionReplayMatrix.businessTypes.map((row) => row.businessType),
  )
  const runtimeCloseoutClaimsByBusinessType: Partial<Record<
    ConstructionOrganizationPrecisionReplayBusinessType,
    ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim
  >> = {}
  for (const item of planNetworkReport.items) {
    const businessType = item.businessType as ConstructionOrganizationPrecisionReplayBusinessType | null
    const runtimeClaim = findScopedRuntimeCloseoutClaimForReportItem(planNetworkReport, item)
    if (
      businessType
      && supportedBusinessTypes.has(businessType)
      && runtimeClaim
    ) {
      const existingClaim = runtimeCloseoutClaimsByBusinessType[businessType]
      if (!existingClaim || (!existingClaim.canClaimRuntimeCloseout && runtimeClaim.canClaimRuntimeCloseout)) {
        runtimeCloseoutClaimsByBusinessType[businessType] = runtimeClaim
      }
    }
  }
  return runtimeCloseoutClaimsByBusinessType
}

export function buildConstructionOrganizationRuntimeEvidenceContextsByBusinessType(
  precisionReplayMatrix: ConstructionOrganizationPrecisionReplayMatrix,
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport,
) {
  const supportedBusinessTypes = new Set(
    precisionReplayMatrix.businessTypes.map((row) => row.businessType),
  )
  const groupedItems = new Map<
    ConstructionOrganizationPrecisionReplayBusinessType,
    Map<string, ConstructionOrganizationPlanNetworkDraftReport['items']>
  >()
  planNetworkReport.items.forEach((item, index) => {
    const businessType = item.businessType as ConstructionOrganizationPrecisionReplayBusinessType | null
    if (!businessType || !supportedBusinessTypes.has(businessType)) return
    const projectKey = scopedRuntimeEvidenceProjectKey(item, index)
    const businessGroups = groupedItems.get(businessType) ?? new Map<string, ConstructionOrganizationPlanNetworkDraftReport['items']>()
    businessGroups.set(projectKey, [...(businessGroups.get(projectKey) ?? []), item])
    groupedItems.set(businessType, businessGroups)
  })

  const contextsByBusinessType: Partial<Record<
    ConstructionOrganizationPrecisionReplayBusinessType,
    RuntimeEvidenceContextDraft
  >> = {}

  for (const [businessType, projectGroups] of groupedItems.entries()) {
    let bestContext: RuntimeEvidenceContextDraft | null = null
    for (const items of projectGroups.values()) {
      const scopedPlanNetworkReport = {
        ...planNetworkReport,
        items,
      }
      const runtimeReadyOptionKeysByBusinessType =
        buildRuntimeReadyOptionNetworkKeysByBusinessType(scopedPlanNetworkReport)
      const runtimeReadyOptionCloseoutClaimKeysByBusinessType =
        buildRuntimeReadyOptionCloseoutClaimKeysByBusinessType(scopedPlanNetworkReport)
      const runtimeReadyUseCaseOptionCountsByBusinessType =
        buildRuntimeReadyUseCaseOptionCountsByBusinessType(scopedPlanNetworkReport)
      const runtimeReadyUseCaseOptionCloseoutClaimCountsByBusinessType =
        buildRuntimeReadyUseCaseOptionCloseoutClaimCountsByBusinessType(scopedPlanNetworkReport)
      const context = buildEmptyRuntimeEvidenceContext()
      for (const item of items) {
        if (item.runtimeEngineEvidence?.publicationKey) {
          appendUnique(context.projectIds, item.projectId)
          appendUnique(context.draftNetworkKeys, item.draftNetworkKey)
          appendUnique(context.optionIds, item.optionId)
          appendUnique(context.publicationKeys, item.runtimeEngineEvidence.publicationKey)
          const draftRuntimeClaim = findScopedRuntimeCloseoutClaimForReportItem(planNetworkReport, item)
          if (draftRuntimeClaim?.canClaimRuntimeCloseout === true) {
            appendUnique(context.evidenceSources, 'runtime')
            if (!context.runtimeCloseoutClaim?.canClaimRuntimeCloseout) {
              context.runtimeCloseoutClaim = draftRuntimeClaim
            }
          } else if (!context.runtimeCloseoutClaim && draftRuntimeClaim) {
            context.runtimeCloseoutClaim = draftRuntimeClaim
          }
        }
      }
      context.optionCount = collectRuntimeEvidenceOptionNetworkKeys(items).size
      context.runtimeReadyOptionCount = runtimeReadyOptionKeysByBusinessType[businessType]?.size ?? 0
      context.runtimeReadyOptionCloseoutClaimCount =
        runtimeReadyOptionCloseoutClaimKeysByBusinessType[businessType]?.size ?? 0
      context.runtimeReadyUseCaseOptionCounts =
        runtimeReadyUseCaseOptionCountsByBusinessType[businessType] ?? context.runtimeReadyUseCaseOptionCounts
      context.useCases = collectRuntimeEvidenceUseCasesFromReadyCounts(context.runtimeReadyUseCaseOptionCounts)
      context.runtimeReadyUseCaseOptionCloseoutClaimCounts =
        runtimeReadyUseCaseOptionCloseoutClaimCountsByBusinessType[businessType]
          ?? context.runtimeReadyUseCaseOptionCloseoutClaimCounts
      if (!bestContext || compareRuntimeEvidenceContexts(context, bestContext) > 0) {
        bestContext = context
      }
    }
    if (bestContext) contextsByBusinessType[businessType] = bestContext
  }

  return contextsByBusinessType
}

export function buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport(
  input: BuildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReportInput,
): ConstructionOrganizationProductOutcomeCloseoutMatrix {
  const precisionReplayMatrix = input.precisionReplayMatrix ?? buildConstructionOrganizationPrecisionReplayMatrix()
  return buildConstructionOrganizationProductOutcomeCloseoutMatrix({
    precisionReplayMatrix,
    runtimeEvidenceContextsByBusinessType: buildConstructionOrganizationRuntimeEvidenceContextsByBusinessType(
      precisionReplayMatrix,
      input.planNetworkReport,
    ),
  })
}

export async function buildConstructionOrganizationProductOutcomeCloseoutProgressForProject(
  input: BuildConstructionOrganizationProductOutcomeCloseoutProgressForProjectInput,
): Promise<ConstructionOrganizationProductOutcomeCloseoutProgressSnapshot> {
  const precisionReplayMatrix = buildConstructionOrganizationPrecisionReplayMatrix()
  const planNetworkReport = await listConstructionOrganizationPlanNetworkDrafts({
    companyId: input.companyId,
    projectId: input.projectId,
    limit: input.limit,
    maxLimit: input.maxLimit,
    queryExec: input.queryExec,
  })
  const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
    precisionReplayMatrix,
    planNetworkReport,
  })
  return {
    source: 'construction_organization_product_outcome_closeout_progress_snapshot',
    matrix,
    progress: buildConstructionOrganizationProductOutcomeCloseoutProgress(matrix),
    boundaryPolicy: [
      'progress_snapshot_is_read_only',
      'progress_snapshot_uses_current_plan_network_runtime_evidence',
      'progress_snapshot_does_not_write_runtime_or_plan_data',
      'progress_snapshot_does_not_authorize_runtime_materialization',
    ],
  }
}

export function buildConstructionOrganizationProductOutcomeCloseoutMatrix(
  input: BuildConstructionOrganizationProductOutcomeCloseoutMatrixInput,
): ConstructionOrganizationProductOutcomeCloseoutMatrix {
  const rows = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType) =>
    buildProductOutcomeCloseoutRow(input, businessType),
  )
  const precisionReplayReadyBusinessTypeCount = rows.filter((row) => row.hasPrecisionReplayEvidence).length
  const runtimeOutcomeReadyBusinessTypeCount = rows.filter((row) => (
    row.hasRuntimeCloseoutClaim
    && row.hasRealRuntimeEvidenceSource
    && row.hasRequiredRuntimeUseCaseCoverage
    && row.hasRequiredRuntimeOptionNetworkCoverage
    && row.hasRequiredRuntimeReadyOptionNetworkCoverage
    && row.hasRequiredRuntimeReadyOptionCloseoutClaimCoverage
    && row.hasRequiredRuntimeReadyUseCaseOptionCoverage
    && row.hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage
    && row.missingReasons.length === 0
  )).length
  const missingReasons = rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.businessType}:${reason}`),
  )
  const nextEvidenceActions = Array.from(new Set(rows.flatMap((row) => row.nextEvidenceActions)))
  const nextEvidenceOperations = buildProductOutcomeNextEvidenceOperations(nextEvidenceActions)
  const nextEvidenceWorkItems = buildProductOutcomeNextEvidenceWorkItems(rows)
  const nextEvidenceExecutionPlan = buildProductOutcomeEvidenceExecutionPlan(rows)
  const nextEvidenceWorkPackages = buildProductOutcomeEvidenceWorkPackages(nextEvidenceWorkItems, nextEvidenceExecutionPlan)
  const canDeclareConstructionOrganizationProductOutcomeCloseout =
    missingReasons.length === 0
      && precisionReplayReadyBusinessTypeCount === CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length
      && runtimeOutcomeReadyBusinessTypeCount === CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length

  return {
    source: 'construction_organization_product_outcome_closeout_matrix',
    sourceVersion: CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_CLOSEOUT_MATRIX_VERSION,
    status: canDeclareConstructionOrganizationProductOutcomeCloseout
      ? 'product_outcome_closeout_ready'
      : 'product_outcome_closeout_incomplete',
    canDeclareConstructionOrganizationProductOutcomeCloseout,
    supportedBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
    precisionReplayReadyBusinessTypeCount,
    runtimeOutcomeReadyBusinessTypeCount,
    rows,
    missingReasons,
    nextEvidenceActions,
    nextEvidenceOperations,
    nextEvidenceWorkItems,
    nextEvidenceExecutionPlan,
    nextEvidenceWorkPackages,
    mutationBoundary: MUTATION_BOUNDARY,
    boundaryPolicy: [
      'precision_replay_is_not_runtime_product_outcome',
      'single_project_runtime_closeout_does_not_prove_all_business_types',
      'runtime_outcome_claim_required_per_supported_business_type',
      'product_outcome_closeout_does_not_grant_auto_materialization',
      'does_not_write_task_dependencies_or_plan_dates',
    ],
  }
}
