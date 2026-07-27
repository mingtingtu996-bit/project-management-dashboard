import { query as rawQuery } from '../database.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'

export type ConstructionOrganizationMaterializationReviewPackageItem = {
  candidateEventId: string | null
  assetKey: string
  sourceModule: string
  companyId: string | null
  projectId: string | null
  eventStatus: string
  runtimeEffect: string
  createdAt: string | null
  updatedAt: string | null
  optionId: string | null
  selectedScenarioIds: string[]
  reviewPackage: {
    source: string | null
    packageBasis: string | null
    optionId: string | null
    status: string | null
    allowManualReview: boolean
    proposedDependencyEdgeCount: number
    blockedReasons: string[]
    proposedDependencyEdges: unknown[]
    conflictEvidence?: unknown[]
    reviewRequired: boolean
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  }
  materializationDecision: Record<string, unknown>
  candidateDependencyPreview: {
    source: string | null
    materializationReadiness: Record<string, unknown>
    previewEdgeCount: number
    unresolvedEdgeCount: number
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  } | null
  engineEvaluationSummary: Record<string, unknown> | null
  generatedRowReferenceDurationEvidence: Record<string, unknown> | null
  generatedRowNetworkEvaluation: Record<string, unknown> | null
  useCaseEvaluations: Record<string, unknown>
  factBasis?: Record<string, unknown>
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
  }
}

export type ListConstructionOrganizationMaterializationReviewPackagesInput = {
  companyId?: string | null
  projectId?: string | null
  limit?: number | null
  maxLimit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type ConstructionOrganizationMaterializationReviewPackageReport = {
  source: 'construction_organization_materialization_review_package_read_model'
  companyId: string
  projectId: string | null
  totalCandidateEventRows: number
  totalReviewPackageItems: number
  readyForManualReviewCount: number
  evidenceOnlyCount: number
  needsGeneratedRowCarrierCount: number
  blockedByViolationsCount: number
  proposedDependencyEdgeCount: number
  skippedMissingPackageCount: number
  items: ConstructionOrganizationMaterializationReviewPackageItem[]
  boundaryPolicy: string[]
}

type CandidateEventRow = {
  id?: unknown
  asset_key?: unknown
  source_module?: unknown
  company_id?: unknown
  project_id?: unknown
  event_status?: unknown
  runtime_effect?: unknown
  candidate_payload?: unknown
  created_at?: unknown
  updated_at?: unknown
}

const CONSTRUCTION_ORGANIZATION_ASSET_KEY_PREFIX = 'construction_organization.plan_option.'
const CONSTRUCTION_ORGANIZATION_SOURCE_MODULE = 'constructionOrganizationScenarioGovernanceService'

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return readRecord(parsed)
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  return [...new Set(readArray(value).map((item) => normalizeText(item)).filter((item): item is string => Boolean(item)))]
}

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function readFalseFlag(record: Record<string, unknown>, key: string): false {
  return record[key] === false ? false : false
}

const DEFAULT_ADMIN_LIST_LIMIT = 50
const DEFAULT_ADMIN_LIST_MAX_LIMIT = 200

function normalizeMaxLimit(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.floor(parsed))
    : DEFAULT_ADMIN_LIST_MAX_LIMIT
}

function clampLimit(value: unknown, maxLimit: unknown = DEFAULT_ADMIN_LIST_MAX_LIMIT) {
  const parsed = Number(value)
  const max = normalizeMaxLimit(maxLimit)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.min(max, Math.floor(parsed)))
    : Math.min(DEFAULT_ADMIN_LIST_LIMIT, max)
}

async function queryCandidateEventRows(params: {
  companyId: string
  projectId: string | null
  limit: number
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const baseSelect = `
    SELECT
      id,
      asset_key,
      source_module,
      company_id::text AS company_id,
      project_id::text AS project_id,
      event_status,
      runtime_effect,
      candidate_payload,
      created_at,
      updated_at
    FROM public.algorithm_asset_candidate_events
  `
  const projectScoped = Boolean(params.projectId)
  const sql = projectScoped
    ? `${baseSelect}
    WHERE company_id = $1::uuid
      AND project_id = $2::uuid
      AND asset_key LIKE $3
      AND source_module = $4
    ORDER BY created_at DESC
    LIMIT $5
  `
    : `${baseSelect}
    WHERE company_id = $1::uuid
      AND asset_key LIKE $2
      AND source_module = $3
    ORDER BY created_at DESC
    LIMIT $4
  `
  const queryParams = projectScoped
    ? [
        params.companyId,
        params.projectId,
        `${CONSTRUCTION_ORGANIZATION_ASSET_KEY_PREFIX}%`,
        CONSTRUCTION_ORGANIZATION_SOURCE_MODULE,
        params.limit,
      ]
    : [
        params.companyId,
        `${CONSTRUCTION_ORGANIZATION_ASSET_KEY_PREFIX}%`,
        CONSTRUCTION_ORGANIZATION_SOURCE_MODULE,
        params.limit,
      ]

  if (params.queryExec) {
    return params.queryExec<CandidateEventRow>(sql, queryParams)
  }

  // database-query-dynamic-approved: local static SELECT; all runtime values are bound parameters.
  const result = await rawQuery(sql, queryParams as any[])
  return (result.rows ?? []) as CandidateEventRow[]
}

function buildItem(row: CandidateEventRow): ConstructionOrganizationMaterializationReviewPackageItem | null {
  const payload = readRecord(row.candidate_payload)
  const option = readRecord(payload.option)
  const generatedRowProjection = readRecord(option.generatedRowProjection)
  const reviewPackage = readRecord(generatedRowProjection.materializationReviewPackage)
  if (Object.keys(reviewPackage).length === 0) return null

  const materializationDecision = readRecord(generatedRowProjection.materializationDecision)
  const candidateDependencyPreview = readRecord(generatedRowProjection.candidateDependencyPreview)
  const engineEvaluationSummary = readRecord(option.engineEvaluationSummary)
  const factBasis = readRecord(payload.factBasis ?? option.factBasis)
  const generatedRowReferenceDurationEvidence = readRecord(generatedRowProjection.generatedRowReferenceDurationEvidence)
  const generatedRowNetworkEvaluation = readRecord(generatedRowProjection.generatedRowNetworkEvaluation)
  const candidateDependencyPreviewSummary = Object.keys(candidateDependencyPreview).length > 0
    ? {
        source: normalizeText(candidateDependencyPreview.source),
        materializationReadiness: readRecord(candidateDependencyPreview.materializationReadiness),
        previewEdgeCount: readNumber(candidateDependencyPreview.previewEdgeCount),
        unresolvedEdgeCount: readNumber(candidateDependencyPreview.unresolvedEdgeCount),
        writesTaskDependencies: readFalseFlag(candidateDependencyPreview, 'writesTaskDependencies'),
        writesPlanDates: readFalseFlag(candidateDependencyPreview, 'writesPlanDates'),
        writesCriticalPathFacts: readFalseFlag(candidateDependencyPreview, 'writesCriticalPathFacts'),
      }
    : null

  return {
    candidateEventId: normalizeText(row.id),
    assetKey: normalizeText(row.asset_key) ?? '',
    sourceModule: normalizeText(row.source_module) ?? '',
    companyId: normalizeText(row.company_id),
    projectId: normalizeText(row.project_id),
    eventStatus: normalizeText(row.event_status) ?? '',
    runtimeEffect: normalizeText(row.runtime_effect) ?? '',
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
    optionId: normalizeText(option.optionId ?? reviewPackage.optionId),
    selectedScenarioIds: readStringArray(option.selectedScenarioIds),
    reviewPackage: {
      source: normalizeText(reviewPackage.source),
      packageBasis: normalizeText(reviewPackage.packageBasis),
      optionId: normalizeText(reviewPackage.optionId),
      status: normalizeText(reviewPackage.status),
      allowManualReview: reviewPackage.allowManualReview === true,
      proposedDependencyEdgeCount: readNumber(reviewPackage.proposedDependencyEdgeCount),
      blockedReasons: readStringArray(reviewPackage.blockedReasons),
      proposedDependencyEdges: readArray(reviewPackage.proposedDependencyEdges),
      conflictEvidence: readArray(reviewPackage.conflictEvidence),
      reviewRequired: reviewPackage.reviewRequired === true,
      writesTaskDependencies: readFalseFlag(reviewPackage, 'writesTaskDependencies'),
      writesPlanDates: readFalseFlag(reviewPackage, 'writesPlanDates'),
      writesCriticalPathFacts: readFalseFlag(reviewPackage, 'writesCriticalPathFacts'),
    },
    materializationDecision,
    candidateDependencyPreview: candidateDependencyPreviewSummary,
    engineEvaluationSummary: Object.keys(engineEvaluationSummary).length > 0 ? engineEvaluationSummary : null,
    generatedRowReferenceDurationEvidence: Object.keys(generatedRowReferenceDurationEvidence).length > 0
      ? generatedRowReferenceDurationEvidence
      : null,
    generatedRowNetworkEvaluation: Object.keys(generatedRowNetworkEvaluation).length > 0
      ? generatedRowNetworkEvaluation
      : null,
    useCaseEvaluations: readRecord(option.useCaseEvaluations),
    factBasis,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
    },
  }
}

function itemActiveReviewPackageKey(item: ConstructionOrganizationMaterializationReviewPackageItem) {
  const networkIdentity = stableStringify({
    selectedScenarioIds: item.selectedScenarioIds,
    proposedDependencyEdges: item.reviewPackage.proposedDependencyEdges,
  })
  return [
    item.projectId ?? item.companyId ?? 'company',
    item.optionId ?? item.reviewPackage.optionId ?? item.assetKey,
    networkIdentity,
  ].join('|')
}

function itemRecencyRank(item: ConstructionOrganizationMaterializationReviewPackageItem) {
  const updatedAt = Date.parse(item.updatedAt ?? '')
  if (Number.isFinite(updatedAt)) return updatedAt
  const createdAt = Date.parse(item.createdAt ?? '')
  return Number.isFinite(createdAt) ? createdAt : 0
}

function compareReviewPackageItemsByRecency(
  left: ConstructionOrganizationMaterializationReviewPackageItem,
  right: ConstructionOrganizationMaterializationReviewPackageItem,
) {
  const recencyDelta = itemRecencyRank(right) - itemRecencyRank(left)
  if (recencyDelta !== 0) return recencyDelta
  return String(right.candidateEventId ?? '').localeCompare(String(left.candidateEventId ?? ''))
}

function keepLatestReviewPackageItemsByProjectOption(
  items: ConstructionOrganizationMaterializationReviewPackageItem[],
) {
  const latestByKey = new Map<string, ConstructionOrganizationMaterializationReviewPackageItem>()
  for (const item of items) {
    const key = itemActiveReviewPackageKey(item)
    const existing = latestByKey.get(key)
    if (!existing || compareReviewPackageItemsByRecency(item, existing) < 0) {
      latestByKey.set(key, item)
    }
  }
  return [...latestByKey.values()].sort(compareReviewPackageItemsByRecency)
}

export async function listConstructionOrganizationMaterializationReviewPackages(
  input: ListConstructionOrganizationMaterializationReviewPackagesInput,
): Promise<ConstructionOrganizationMaterializationReviewPackageReport> {
  const companyId = normalizeText(input.companyId)
  if (!companyId) {
    throw new Error('construction_organization_materialization_review_requires_company_id')
  }
  const projectId = normalizeText(input.projectId)
  const rows = await queryCandidateEventRows({
    companyId,
    projectId,
    limit: clampLimit(input.limit, input.maxLimit),
    queryExec: input.queryExec,
  })
  const items = rows
    .map(buildItem)
    .filter((item): item is ConstructionOrganizationMaterializationReviewPackageItem => Boolean(item))
  const activeItems = keepLatestReviewPackageItemsByProjectOption(items)

  return {
    source: 'construction_organization_materialization_review_package_read_model',
    companyId,
    projectId,
    totalCandidateEventRows: rows.length,
    totalReviewPackageItems: activeItems.length,
    readyForManualReviewCount: activeItems.filter((item) => item.reviewPackage.status === 'ready_for_manual_review').length,
    evidenceOnlyCount: activeItems.filter((item) => item.reviewPackage.status === 'evidence_only').length,
    needsGeneratedRowCarrierCount: activeItems.filter((item) => item.reviewPackage.status === 'needs_generated_row_carrier').length,
    blockedByViolationsCount: activeItems.filter((item) => item.reviewPackage.status === 'blocked_by_violations').length,
    proposedDependencyEdgeCount: activeItems.reduce((sum, item) => sum + item.reviewPackage.proposedDependencyEdgeCount, 0),
    skippedMissingPackageCount: rows.length - items.length,
    items: activeItems,
    boundaryPolicy: [
      'read_only_projection_from_algorithm_asset_candidate_events',
      'active_read_model_uses_latest_review_package_per_project_option_network',
      'manual_review_package_is_not_runtime_approval',
      'no_task_dependencies_write',
      'no_plan_dates_write',
      'no_seed_write',
      'no_critical_path_fact_write',
      'runtime_materialization_requires_separate_domain_writer_release_exit_and_rollback_gate',
    ],
  }
}
