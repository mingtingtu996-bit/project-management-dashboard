import { query as rawQuery } from '../database.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'

export type T2RhythmTaskWindowAnnotationReviewCandidate = {
  taskId: string
  proposedWindowCode: string
  proposedWindowRole: string
  confidence: string
  score: number
  matchSignals: string[]
  reviewReasonCodes: string[]
  requiresManualApproval: true
  autoWriteAllowed: false
}

export type T2RhythmTaskWindowAnnotationReviewGap = {
  taskId: string
  reasonCodes: string[]
  requiresManualReview: true
}

export type T2RhythmTaskWindowAnnotationReviewPackageItem = {
  candidateEventId: string | null
  assetKey: string
  sourceModule: string
  companyId: string | null
  projectId: string | null
  eventStatus: string
  runtimeEffect: string
  createdAt: string | null
  updatedAt: string | null
  templateId: string | null
  selectedTemplateIds: string[]
  evidenceRef: string | null
  reviewPackage: {
    source: 't2_task_window_annotation_review_package'
    status: 'ready_for_manual_review'
    allowManualReview: true
    annotationCandidateCount: number
    annotationGapCount: number
    canFeedReplayEvidence: false
    writesStandardTaskMetadata: false
    writesTaskDependencies: false
    writesPlanDates: false
  }
  annotationCandidates: T2RhythmTaskWindowAnnotationReviewCandidate[]
  annotationGaps: T2RhythmTaskWindowAnnotationReviewGap[]
  mutationBoundary: {
    writesStandardTaskMetadata: false
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

export type ListT2RhythmTaskWindowAnnotationReviewPackagesInput = {
  companyId?: string | null
  projectId?: string | null
  limit?: number | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type T2RhythmTaskWindowAnnotationReviewPackageReport = {
  source: 't2_rhythm_task_window_annotation_review_package_read_model'
  companyId: string
  projectId: string | null
  totalCandidateEventRows: number
  totalReviewPackageItems: number
  readyForManualReviewCount: number
  annotationCandidateCount: number
  annotationGapCount: number
  skippedMissingCandidatePayloadCount: number
  items: T2RhythmTaskWindowAnnotationReviewPackageItem[]
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

const T2_ANNOTATION_ASSET_KEY_PREFIX = 't2.rhythm.task_window_annotation:'
const T2_ANNOTATION_SOURCE_MODULE = 't2RhythmTaskWindowAnnotationCandidateEventService'

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
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

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  return Array.from(new Set(readArray(value).map((item) => normalizeText(item)).filter((item): item is string => Boolean(item))))
}

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clampLimit(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.min(200, Math.floor(parsed)))
    : 50
}

async function queryCandidateEventRows(params: {
  companyId: string
  projectId: string | null
  limit: number
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const sql = `
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
    WHERE company_id = $1::uuid
      AND ($2::uuid IS NULL OR project_id = $2::uuid)
      AND asset_key LIKE $3
      AND source_module = $4
    ORDER BY created_at DESC
    LIMIT $5
  `
  const queryParams = [
    params.companyId,
    params.projectId,
    `${T2_ANNOTATION_ASSET_KEY_PREFIX}%`,
    T2_ANNOTATION_SOURCE_MODULE,
    params.limit,
  ]

  if (params.queryExec) {
    return params.queryExec<CandidateEventRow>(sql, queryParams)
  }

  // database-query-dynamic-approved: local static SELECT; all runtime values are bound parameters.
  const result = await rawQuery(sql, queryParams as any[])
  return (result.rows ?? []) as CandidateEventRow[]
}

function buildCandidate(value: unknown): T2RhythmTaskWindowAnnotationReviewCandidate | null {
  const candidate = readRecord(value)
  const taskId = normalizeText(candidate.taskId)
  const proposedWindowCode = normalizeText(candidate.proposedWindowCode)
  const proposedWindowRole = normalizeText(candidate.proposedWindowRole)
  if (!taskId || !proposedWindowCode || !proposedWindowRole) return null

  return {
    taskId,
    proposedWindowCode,
    proposedWindowRole,
    confidence: normalizeText(candidate.confidence) ?? 'unknown',
    score: readNumber(candidate.score),
    matchSignals: readStringArray(candidate.matchSignals),
    reviewReasonCodes: readStringArray(candidate.reviewReasonCodes),
    requiresManualApproval: true,
    autoWriteAllowed: false,
  }
}

function buildGap(value: unknown): T2RhythmTaskWindowAnnotationReviewGap | null {
  const gap = readRecord(value)
  const taskId = normalizeText(gap.taskId)
  if (!taskId) return null

  return {
    taskId,
    reasonCodes: readStringArray(gap.reasonCodes),
    requiresManualReview: true,
  }
}

function buildItem(row: CandidateEventRow): T2RhythmTaskWindowAnnotationReviewPackageItem | null {
  const payload = readRecord(row.candidate_payload)
  if (payload.source !== 't2_task_window_annotation_candidate_event') return null

  const annotationCandidates = readArray(payload.annotationCandidates)
    .map(buildCandidate)
    .filter((candidate): candidate is T2RhythmTaskWindowAnnotationReviewCandidate => Boolean(candidate))
  if (annotationCandidates.length < 1) return null

  const annotationGaps = readArray(payload.annotationGaps)
    .map(buildGap)
    .filter((gap): gap is T2RhythmTaskWindowAnnotationReviewGap => Boolean(gap))

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
    templateId: normalizeText(payload.templateId),
    selectedTemplateIds: readStringArray(payload.selectedTemplateIds),
    evidenceRef: normalizeText(payload.evidenceRef),
    reviewPackage: {
      source: 't2_task_window_annotation_review_package',
      status: 'ready_for_manual_review',
      allowManualReview: true,
      annotationCandidateCount: annotationCandidates.length,
      annotationGapCount: annotationGaps.length,
      canFeedReplayEvidence: false,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
    },
    annotationCandidates,
    annotationGaps,
    mutationBoundary: {
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  }
}

export async function listT2RhythmTaskWindowAnnotationReviewPackages(
  input: ListT2RhythmTaskWindowAnnotationReviewPackagesInput,
): Promise<T2RhythmTaskWindowAnnotationReviewPackageReport> {
  const companyId = normalizeText(input.companyId)
  if (!companyId) {
    throw new Error('t2_rhythm_task_window_annotation_review_requires_company_id')
  }
  const projectId = normalizeText(input.projectId)
  const rows = await queryCandidateEventRows({
    companyId,
    projectId,
    limit: clampLimit(input.limit),
    queryExec: input.queryExec,
  })
  const items = rows
    .map(buildItem)
    .filter((item): item is T2RhythmTaskWindowAnnotationReviewPackageItem => Boolean(item))

  return {
    source: 't2_rhythm_task_window_annotation_review_package_read_model',
    companyId,
    projectId,
    totalCandidateEventRows: rows.length,
    totalReviewPackageItems: items.length,
    readyForManualReviewCount: items.length,
    annotationCandidateCount: items.reduce((sum, item) => sum + item.reviewPackage.annotationCandidateCount, 0),
    annotationGapCount: items.reduce((sum, item) => sum + item.reviewPackage.annotationGapCount, 0),
    skippedMissingCandidatePayloadCount: rows.length - items.length,
    items,
    boundaryPolicy: [
      'read_only_projection_from_algorithm_asset_candidate_events',
      'manual_review_package_is_not_metadata_write',
      'no_standard_task_metadata_write',
      'no_task_dependencies_write',
      'no_plan_dates_write',
      'no_seed_write',
      'no_runtime_publication_write',
      'approved_annotations_must_enter_separate_domain_writer_release_exit',
    ],
  }
}
