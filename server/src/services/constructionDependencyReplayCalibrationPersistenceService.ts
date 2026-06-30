import { createHash } from 'node:crypto'

import { query as rawQuery } from '../database.js'
import type {
  ConstructionDependencyReplayCalibrationReport,
  ConstructionDependencyReplayLayer,
  ConstructionDependencyReplayQueueItem,
  ConstructionDependencyReplayRecommendation,
} from './constructionDependencyReplayCalibrationService.js'

type QueryExec = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>

export interface PersistConstructionDependencyReplayCalibrationReportParams {
  projectId: string | null
  runId: string
  triggeredBy: 'scheduled_or_manual_governance_job' | 'admin_report_export' | 'test_fixture'
  report: ConstructionDependencyReplayCalibrationReport
  queryExec?: QueryExec
}

export interface PersistConstructionDependencyReplayCalibrationReportResult {
  persisted: boolean
  reportId: string | null
}

interface ConstructionDependencyReplayCalibrationReportRow {
  id?: string | null
  project_id?: string | null
  run_id?: string | null
  report_generated_at?: string | null
  created_at?: string | null
  governance_policy?: unknown
  summary?: unknown
  calibration_queues?: unknown
  report_payload?: unknown
}

export interface ListConstructionDependencyReplayCalibrationHistoryOptions {
  projectId?: string | null
  matchedSeedCode?: string | null
  limit?: number
  queryExec?: QueryExec
}

export type ConstructionDependencyReplayCalibrationPromotionReadinessStatus =
  | 'ready_for_seed_promotion_review'
  | 'blocked_by_conflict_quarantine'
  | 'needs_more_replay_evidence'
  | 'evidence_collection_only'

export interface ConstructionDependencyReplayCalibrationPromotionReadiness {
  status: ConstructionDependencyReplayCalibrationPromotionReadinessStatus
  canEnterSeedPromotionReview: boolean
  requiredAction:
    | 'manual_l3_lag_or_condition_profile_review'
    | 'quarantine_conflict_review_before_template_or_seed_change'
    | 'collect_more_project_replay_evidence'
    | 'map_dependency_to_l3_or_l4_seed_before_review'
  blockingReasons: string[]
  evidenceThresholds: {
    minSampleCount: number
    minProjectCount: number
    conflictCountMustBeZero: boolean
    suggestedLagDaysRequired: boolean
    runtimeMutationPolicy: 'none_report_only'
  }
}

export interface ConstructionDependencyReplayCalibrationHistoryItem {
  matchedLayer: Exclude<ConstructionDependencyReplayLayer, 'unmatched'>
  matchedSeedCode: string
  queueStatus: ConstructionDependencyReplayQueueItem['queueStatus']
  recommendation: ConstructionDependencyReplayRecommendation
  reportCount: number
  sampleCount: number
  projectCount: number
  conflictCount: number
  seedLagDays: number | null
  latestMedianObservedWaitDays: number | null
  latestSuggestedLagDays: number | null
  latestPromotionPolicy: string
  latestReportAt: string | null
  latestReportIds: string[]
  sampleDependencyIds: string[]
  projectIds: string[]
  promotionReadiness: ConstructionDependencyReplayCalibrationPromotionReadiness
}

export interface ConstructionDependencySeedPromotionReviewPackage {
  packageCode: 'construction_dependency_seed_promotion_review_package'
  matchedLayer: Exclude<ConstructionDependencyReplayLayer, 'unmatched'>
  matchedSeedCode: string
  proposedAction:
    | 'draft_l3_lag_days_or_condition_profile_update'
    | 'draft_l4_explicit_gate_template_review'
  currentSeedLagDays: number | null
  suggestedLagDays: number | null
  medianObservedWaitDays: number | null
  packageIdentity: {
    packageId: string
    evidenceFingerprint: string
    fingerprintInputs: {
      matchedLayer: Exclude<ConstructionDependencyReplayLayer, 'unmatched'>
      matchedSeedCode: string
      suggestedLagDays: number | null
      reportIds: string[]
      dependencyIds: string[]
      projectIds: string[]
    }
    stabilityPolicy: 'same_seed_same_replay_evidence_same_fingerprint'
  }
  proposedSeedPatchDraft: {
    draftMode: 'manual_review_only'
    targetSeedLayer: Exclude<ConstructionDependencyReplayLayer, 'unmatched'>
    targetSeedCode: string
    operation:
      | 'update_lag_days_or_add_condition_profile'
      | 'promote_or_revise_explicit_business_gate_template'
    currentValues: {
      lagDays: number | null
    }
    proposedValues: {
      lagDays: number | null
      calibrationBasis: 'median_observed_wait_days'
    }
    evidenceRefs: {
      reportIds: string[]
      dependencyIds: string[]
      projectIds: string[]
    }
    safetyGuards: {
      runtimeMutationPolicy: 'none_report_only'
      requiresManualApproval: true
      requiresCriticalPathImpactCheck: true
      requiresConditionProfileDecision: boolean
    }
  }
  evidence: {
    reportCount: number
    sampleCount: number
    projectCount: number
    conflictCount: number
    latestReportAt: string | null
    latestReportIds: string[]
    sampleDependencyIds: string[]
    projectIds: string[]
  }
  governanceBoundary: {
    runtimeMutationPolicy: 'none_report_only'
    seedWritePolicy: 'never_write_seed_from_review_package'
    taskDependencyWritePolicy: 'never_write_task_dependencies_from_review_package'
    approvalRequired: true
    allowedUse: 'manual_seed_promotion_review'
  }
  reviewChecklist: string[]
}

export interface ConstructionDependencyReplayCalibrationHistoryReport {
  reportCode: 'construction_dependency_replay_calibration_history'
  generatedAt: string
  governancePolicy: ConstructionDependencyReplayCalibrationReport['governancePolicy']
  summary: {
    reportCount: number
    seedReviewItemCount: number
    manualReviewRequiredCount: number
    quarantineReviewRequiredCount: number
    evidenceCollectionRequiredCount: number
    seedPromotionReadyCount: number
    seedPromotionReviewPackageCount: number
    blockedByConflictCount: number
    needsMoreReplayEvidenceCount: number
  }
  seedReviewItems: ConstructionDependencyReplayCalibrationHistoryItem[]
  seedPromotionReviewPackages: ConstructionDependencySeedPromotionReviewPackage[]
  recentReports: Array<{
    reportId: string | null
    projectId: string | null
    runId: string | null
    reportGeneratedAt: string | null
    createdAt: string | null
    summary: Record<string, unknown>
    governancePolicy: Record<string, unknown>
  }>
}

export interface ConstructionDependencySeedPromotionReviewPackageReport {
  reportCode: 'construction_dependency_seed_promotion_review_packages'
  generatedAt: string
  governanceBoundary: {
    reportOnly: true
    runtimeMutationPolicy: 'none_report_only'
    seedWritePolicy: 'never_write_seed_from_review_package'
    taskDependencyWritePolicy: 'never_write_task_dependencies_from_review_package'
    approvalRequired: true
    allowedUse: 'manual_seed_promotion_review'
  }
  summary: {
    sourceReportCount: number
    sourceSeedReviewItemCount: number
    packageCount: number
    blockedByConflictCount: number
    needsMoreReplayEvidenceCount: number
  }
  seedPromotionReviewPackages: ConstructionDependencySeedPromotionReviewPackage[]
  sourceHistorySummary: ConstructionDependencyReplayCalibrationHistoryReport['summary']
}

const REPORT_ONLY_GOVERNANCE_POLICY: ConstructionDependencyReplayCalibrationReport['governancePolicy'] = {
  replayMode: 'report_only',
  seedWritePolicy: 'never_write_seed_from_replay',
  taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
  promotionPolicy: 'manual_seed_review_required',
}

const PROMOTION_EVIDENCE_THRESHOLDS: ConstructionDependencyReplayCalibrationPromotionReadiness['evidenceThresholds'] = {
  minSampleCount: 3,
  minProjectCount: 2,
  conflictCountMustBeZero: true,
  suggestedLagDaysRequired: true,
  runtimeMutationPolicy: 'none_report_only',
}

const REVIEW_PACKAGE_GOVERNANCE_BOUNDARY: ConstructionDependencySeedPromotionReviewPackageReport['governanceBoundary'] = {
  reportOnly: true,
  runtimeMutationPolicy: 'none_report_only',
  seedWritePolicy: 'never_write_seed_from_review_package',
  taskDependencyWritePolicy: 'never_write_task_dependencies_from_review_package',
  approvalRequired: true,
  allowedUse: 'manual_seed_promotion_review',
}

function buildDefaultQueryExec(): QueryExec {
  return async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    const result = await rawQuery(sql, params as any[])
    return result.rows as T[]
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizePositiveLimit(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), 500) : 100
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return readRecord(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readQueueItems(value: unknown): ConstructionDependencyReplayQueueItem[] {
  return Array.isArray(value) ? value as ConstructionDependencyReplayQueueItem[] : []
}

function readNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function uniquePush(target: string[], values: unknown[], limit = 20) {
  const seen = new Set(target)
  for (const value of values) {
    const text = normalizeText(value)
    if (!text || seen.has(text)) continue
    target.push(text)
    seen.add(text)
    if (target.length >= limit) break
  }
}

function canonicalizeIdentityIds(values: string[]) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
}

function queueStatusRank(status: ConstructionDependencyReplayQueueItem['queueStatus']) {
  if (status === 'manual_review_required') return 0
  if (status === 'quarantine_review_required') return 1
  return 2
}

function sortRowsByLatest(rows: ConstructionDependencyReplayCalibrationReportRow[]) {
  return [...rows].sort((left, right) => {
    const leftDate = normalizeText(left.report_generated_at ?? left.created_at)
    const rightDate = normalizeText(right.report_generated_at ?? right.created_at)
    return rightDate.localeCompare(leftDate)
  })
}

function readCalibrationQueueItems(row: ConstructionDependencyReplayCalibrationReportRow) {
  const queues = readRecord(row.calibration_queues)
  return [
    ...readQueueItems(queues.l3LagCalibrationCandidates),
    ...readQueueItems(queues.l4ConflictQuarantineCandidates),
    ...readQueueItems(queues.evidenceCollectionCandidates),
  ]
}

function buildReportKey(row: ConstructionDependencyReplayCalibrationReportRow, index: number) {
  return normalizeText(row.id) || `${normalizeText(row.project_id)}:${normalizeText(row.report_generated_at ?? row.created_at)}:${index}`
}

function buildPromotionReadiness(
  item: Omit<ConstructionDependencyReplayCalibrationHistoryItem, 'promotionReadiness'>,
): ConstructionDependencyReplayCalibrationPromotionReadiness {
  if (item.queueStatus === 'quarantine_review_required' || item.conflictCount > 0) {
    return {
      status: 'blocked_by_conflict_quarantine',
      canEnterSeedPromotionReview: false,
      requiredAction: 'quarantine_conflict_review_before_template_or_seed_change',
      blockingReasons: ['actual_order_conflict_quarantine'],
      evidenceThresholds: PROMOTION_EVIDENCE_THRESHOLDS,
    }
  }

  if (item.queueStatus === 'evidence_collection_required') {
    return {
      status: 'evidence_collection_only',
      canEnterSeedPromotionReview: false,
      requiredAction: 'map_dependency_to_l3_or_l4_seed_before_review',
      blockingReasons: ['matched_seed_or_actual_date_evidence_missing'],
      evidenceThresholds: PROMOTION_EVIDENCE_THRESHOLDS,
    }
  }

  const blockingReasons: string[] = []
  if (item.sampleCount < PROMOTION_EVIDENCE_THRESHOLDS.minSampleCount) {
    blockingReasons.push('sample_count_below_threshold')
  }
  if (item.projectCount < PROMOTION_EVIDENCE_THRESHOLDS.minProjectCount) {
    blockingReasons.push('project_count_below_threshold')
  }
  if (PROMOTION_EVIDENCE_THRESHOLDS.suggestedLagDaysRequired && item.latestSuggestedLagDays == null) {
    blockingReasons.push('suggested_lag_days_missing')
  }
  if (PROMOTION_EVIDENCE_THRESHOLDS.conflictCountMustBeZero && item.conflictCount > 0) {
    blockingReasons.push('conflict_count_nonzero')
  }

  if (blockingReasons.length > 0) {
    return {
      status: 'needs_more_replay_evidence',
      canEnterSeedPromotionReview: false,
      requiredAction: 'collect_more_project_replay_evidence',
      blockingReasons,
      evidenceThresholds: PROMOTION_EVIDENCE_THRESHOLDS,
    }
  }

  return {
    status: 'ready_for_seed_promotion_review',
    canEnterSeedPromotionReview: true,
    requiredAction: 'manual_l3_lag_or_condition_profile_review',
    blockingReasons: [],
    evidenceThresholds: PROMOTION_EVIDENCE_THRESHOLDS,
  }
}

function buildPackageIdentity(item: ConstructionDependencyReplayCalibrationHistoryItem): ConstructionDependencySeedPromotionReviewPackage['packageIdentity'] {
  const fingerprintInputs = {
    matchedLayer: item.matchedLayer,
    matchedSeedCode: item.matchedSeedCode,
    suggestedLagDays: item.latestSuggestedLagDays,
    reportIds: canonicalizeIdentityIds(item.latestReportIds),
    dependencyIds: canonicalizeIdentityIds(item.sampleDependencyIds),
    projectIds: canonicalizeIdentityIds(item.projectIds),
  }
  const fingerprintHash = createHash('sha256')
    .update(JSON.stringify(fingerprintInputs))
    .digest('hex')
  return {
    packageId: `construction_dependency_seed_promotion_review_package:${item.matchedLayer}:${item.matchedSeedCode}:${fingerprintHash.slice(0, 12)}`,
    evidenceFingerprint: `sha256:${fingerprintHash}`,
    fingerprintInputs,
    stabilityPolicy: 'same_seed_same_replay_evidence_same_fingerprint',
  }
}

function buildSeedPromotionReviewPackage(
  item: ConstructionDependencyReplayCalibrationHistoryItem,
): ConstructionDependencySeedPromotionReviewPackage | null {
  if (!item.promotionReadiness.canEnterSeedPromotionReview) return null

  return {
    packageCode: 'construction_dependency_seed_promotion_review_package',
    matchedLayer: item.matchedLayer,
    matchedSeedCode: item.matchedSeedCode,
    proposedAction: item.matchedLayer === 'cross_item_workflow'
      ? 'draft_l3_lag_days_or_condition_profile_update'
      : 'draft_l4_explicit_gate_template_review',
    currentSeedLagDays: item.seedLagDays,
    suggestedLagDays: item.latestSuggestedLagDays,
    medianObservedWaitDays: item.latestMedianObservedWaitDays,
    packageIdentity: buildPackageIdentity(item),
    proposedSeedPatchDraft: {
      draftMode: 'manual_review_only',
      targetSeedLayer: item.matchedLayer,
      targetSeedCode: item.matchedSeedCode,
      operation: item.matchedLayer === 'cross_item_workflow'
        ? 'update_lag_days_or_add_condition_profile'
        : 'promote_or_revise_explicit_business_gate_template',
      currentValues: {
        lagDays: item.seedLagDays,
      },
      proposedValues: {
        lagDays: item.latestSuggestedLagDays,
        calibrationBasis: 'median_observed_wait_days',
      },
      evidenceRefs: {
        reportIds: item.latestReportIds,
        dependencyIds: item.sampleDependencyIds,
        projectIds: item.projectIds,
      },
      safetyGuards: {
        runtimeMutationPolicy: 'none_report_only',
        requiresManualApproval: true,
        requiresCriticalPathImpactCheck: true,
        requiresConditionProfileDecision: item.matchedLayer === 'cross_item_workflow',
      },
    },
    evidence: {
      reportCount: item.reportCount,
      sampleCount: item.sampleCount,
      projectCount: item.projectCount,
      conflictCount: item.conflictCount,
      latestReportAt: item.latestReportAt,
      latestReportIds: item.latestReportIds,
      sampleDependencyIds: item.sampleDependencyIds,
      projectIds: item.projectIds,
    },
    governanceBoundary: {
      runtimeMutationPolicy: 'none_report_only',
      seedWritePolicy: 'never_write_seed_from_review_package',
      taskDependencyWritePolicy: 'never_write_task_dependencies_from_review_package',
      approvalRequired: true,
      allowedUse: 'manual_seed_promotion_review',
    },
    reviewChecklist: [
      'confirm_handoff_scope_matches_seed',
      'validate_actual_date_quality',
      'decide_flat_lag_vs_conditional_profile',
      'check_critical_path_impact_before_seed_promotion',
    ],
  }
}

async function ensureConstructionDependencyReplayCalibrationReportsTable(queryExec: QueryExec) {
  await queryExec(`
    CREATE TABLE IF NOT EXISTS public.construction_dependency_replay_calibration_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      report_code TEXT NOT NULL,
      report_generated_at TIMESTAMPTZ NOT NULL,
      governance_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      calibration_queues JSONB NOT NULL DEFAULT '{}'::jsonb,
      report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      runtime_mutation_policy TEXT NOT NULL DEFAULT 'none_report_only',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await queryExec(`
    CREATE INDEX IF NOT EXISTS idx_construction_dependency_replay_reports_project
      ON public.construction_dependency_replay_calibration_reports(project_id, report_generated_at DESC)
  `)
  await queryExec(`
    CREATE INDEX IF NOT EXISTS idx_construction_dependency_replay_reports_run
      ON public.construction_dependency_replay_calibration_reports(run_id, report_generated_at DESC)
  `)
}

export async function persistConstructionDependencyReplayCalibrationReport(
  params: PersistConstructionDependencyReplayCalibrationReportParams,
): Promise<PersistConstructionDependencyReplayCalibrationReportResult> {
  const queryExec = params.queryExec ?? buildDefaultQueryExec()
  await ensureConstructionDependencyReplayCalibrationReportsTable(queryExec)
  const rows = await queryExec<{ id?: string }>(`
    INSERT INTO public.construction_dependency_replay_calibration_reports (
      project_id,
      run_id,
      triggered_by,
      report_code,
      report_generated_at,
      governance_policy,
      summary,
      calibration_queues,
      report_payload,
      runtime_mutation_policy
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6::jsonb,
      $7::jsonb,
      $8::jsonb,
      $9::jsonb,
      'none_report_only'
    )
    RETURNING id
  `, [
    params.projectId,
    params.runId,
    params.triggeredBy,
    params.report.reportCode,
    params.report.generatedAt,
    params.report.governancePolicy,
    params.report.summary,
    params.report.calibrationQueues,
    params.report,
  ])

  return {
    persisted: true,
    reportId: rows[0]?.id ?? null,
  }
}

export async function listConstructionDependencyReplayCalibrationHistoryReport(
  options: ListConstructionDependencyReplayCalibrationHistoryOptions = {},
): Promise<ConstructionDependencyReplayCalibrationHistoryReport> {
  const queryExec = options.queryExec ?? buildDefaultQueryExec()
  const projectId = normalizeText(options.projectId) || null
  const matchedSeedCodeFilter = normalizeText(options.matchedSeedCode)
  const limit = normalizePositiveLimit(options.limit)

  const rows = sortRowsByLatest(await queryExec<ConstructionDependencyReplayCalibrationReportRow>(`
    SELECT
      id,
      project_id,
      run_id,
      report_generated_at,
      created_at,
      governance_policy,
      summary,
      calibration_queues,
      report_payload
    FROM public.construction_dependency_replay_calibration_reports
    WHERE ($1::uuid IS NULL OR project_id = $1::uuid)
    ORDER BY report_generated_at DESC, created_at DESC
    LIMIT $2
  `, [projectId, limit]))

  type GroupState = Omit<ConstructionDependencyReplayCalibrationHistoryItem, 'promotionReadiness'> & {
    reportKeys: Set<string>
    projectKeySet: Set<string>
  }

  const groups = new Map<string, GroupState>()

  rows.forEach((row, rowIndex) => {
    const reportKey = buildReportKey(row, rowIndex)
    const reportId = normalizeText(row.id)
    const rowProjectId = normalizeText(row.project_id)
    const rowReportAt = normalizeText(row.report_generated_at ?? row.created_at) || null

    for (const item of readCalibrationQueueItems(row)) {
      const matchedSeedCode = normalizeText(item.matchedSeedCode)
      const matchedLayer = normalizeText(item.matchedLayer) as ConstructionDependencyReplayCalibrationHistoryItem['matchedLayer']
      if (!matchedSeedCode || !matchedLayer) continue
      if (matchedSeedCodeFilter && matchedSeedCode !== matchedSeedCodeFilter) continue

      const groupKey = `${matchedLayer}:${matchedSeedCode}`
      let group = groups.get(groupKey)
      if (!group) {
        group = {
          matchedLayer,
          matchedSeedCode,
          queueStatus: item.queueStatus,
          recommendation: item.recommendation,
          reportCount: 0,
          sampleCount: 0,
          projectCount: 0,
          conflictCount: 0,
          seedLagDays: readNumber(item.seedLagDays),
          latestMedianObservedWaitDays: readNumber(item.medianObservedWaitDays),
          latestSuggestedLagDays: readNumber(item.suggestedLagDays),
          latestPromotionPolicy: normalizeText(item.promotionPolicy),
          latestReportAt: rowReportAt,
          latestReportIds: [],
          sampleDependencyIds: [],
          projectIds: [],
          reportKeys: new Set<string>(),
          projectKeySet: new Set<string>(),
        }
        groups.set(groupKey, group)
      } else if (queueStatusRank(item.queueStatus) < queueStatusRank(group.queueStatus)) {
        group.queueStatus = item.queueStatus
        group.recommendation = item.recommendation
      }

      group.reportKeys.add(reportKey)
      if (reportId) uniquePush(group.latestReportIds, [reportId])
      group.sampleCount += Math.max(0, readNumber(item.sampleCount) ?? 0)
      group.conflictCount += Math.max(0, readNumber(item.conflictCount) ?? 0)
      uniquePush(group.sampleDependencyIds, item.sampleDependencyIds ?? [])

      const candidateProjectIds = [
        ...(Array.isArray(item.projectIds) ? item.projectIds : []),
        rowProjectId,
      ]
      uniquePush(group.projectIds, candidateProjectIds)
      for (const candidateProjectId of candidateProjectIds) {
        const text = normalizeText(candidateProjectId)
        if (text) group.projectKeySet.add(text)
      }
      group.projectCount = group.projectKeySet.size || Math.max(group.projectCount, readNumber(item.projectCount) ?? 0)
    }
  })

  const seedReviewItems = [...groups.values()]
    .map(({ reportKeys, projectKeySet, ...item }) => {
      const reviewItem = {
        ...item,
        reportCount: reportKeys.size,
        projectCount: projectKeySet.size || item.projectCount,
      }
      return {
        ...reviewItem,
        promotionReadiness: buildPromotionReadiness(reviewItem),
      }
    })
    .sort((left, right) => {
      const statusRank = queueStatusRank(left.queueStatus) - queueStatusRank(right.queueStatus)
      if (statusRank !== 0) return statusRank
      const latestRank = normalizeText(right.latestReportAt).localeCompare(normalizeText(left.latestReportAt))
      if (latestRank !== 0) return latestRank
      if (right.sampleCount !== left.sampleCount) return right.sampleCount - left.sampleCount
      return left.matchedSeedCode.localeCompare(right.matchedSeedCode)
    })
  const seedPromotionReadyCount = seedReviewItems.filter((item) => item.promotionReadiness.status === 'ready_for_seed_promotion_review').length
  const blockedByConflictCount = seedReviewItems.filter((item) => item.promotionReadiness.status === 'blocked_by_conflict_quarantine').length
  const needsMoreReplayEvidenceCount = seedReviewItems.filter((item) => item.promotionReadiness.status === 'needs_more_replay_evidence').length
  const seedPromotionReviewPackages = seedReviewItems
    .map(buildSeedPromotionReviewPackage)
    .filter((item): item is ConstructionDependencySeedPromotionReviewPackage => item != null)

  return {
    reportCode: 'construction_dependency_replay_calibration_history',
    generatedAt: new Date().toISOString(),
    governancePolicy: REPORT_ONLY_GOVERNANCE_POLICY,
    summary: {
      reportCount: rows.length,
      seedReviewItemCount: seedReviewItems.length,
      manualReviewRequiredCount: seedReviewItems.filter((item) => item.queueStatus === 'manual_review_required').length,
      quarantineReviewRequiredCount: seedReviewItems.filter((item) => item.queueStatus === 'quarantine_review_required').length,
      evidenceCollectionRequiredCount: seedReviewItems.filter((item) => item.queueStatus === 'evidence_collection_required').length,
      seedPromotionReadyCount,
      seedPromotionReviewPackageCount: seedPromotionReviewPackages.length,
      blockedByConflictCount,
      needsMoreReplayEvidenceCount,
    },
    seedReviewItems,
    seedPromotionReviewPackages,
    recentReports: rows.map((row) => ({
      reportId: normalizeText(row.id) || null,
      projectId: normalizeText(row.project_id) || null,
      runId: normalizeText(row.run_id) || null,
      reportGeneratedAt: normalizeText(row.report_generated_at) || null,
      createdAt: normalizeText(row.created_at) || null,
      summary: readRecord(row.summary),
      governancePolicy: readRecord(row.governance_policy),
    })),
  }
}

export async function listConstructionDependencySeedPromotionReviewPackageReport(
  options: ListConstructionDependencyReplayCalibrationHistoryOptions = {},
): Promise<ConstructionDependencySeedPromotionReviewPackageReport> {
  const history = await listConstructionDependencyReplayCalibrationHistoryReport(options)
  return {
    reportCode: 'construction_dependency_seed_promotion_review_packages',
    generatedAt: new Date().toISOString(),
    governanceBoundary: REVIEW_PACKAGE_GOVERNANCE_BOUNDARY,
    summary: {
      sourceReportCount: history.summary.reportCount,
      sourceSeedReviewItemCount: history.summary.seedReviewItemCount,
      packageCount: history.seedPromotionReviewPackages.length,
      blockedByConflictCount: history.summary.blockedByConflictCount,
      needsMoreReplayEvidenceCount: history.summary.needsMoreReplayEvidenceCount,
    },
    seedPromotionReviewPackages: history.seedPromotionReviewPackages,
    sourceHistorySummary: history.summary,
  }
}
