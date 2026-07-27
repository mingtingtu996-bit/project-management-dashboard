import { randomUUID } from 'node:crypto'

import { query } from '../database.js'
import { buildCanonicalJsonHash } from '../utils/canonicalJsonHash.js'
import { normalizeDurationMetricDto, type DurationMetricDto } from './durationMetricService.js'
import type { ScheduleAccelerationProposal } from './scheduleAccelerationService.js'

export interface ScheduleAccelerationRecommendationIdentity {
  id: string
  recommendationHash: string
  operationsHash: string
  issuedAt: string
  expiresAt: string
}

export interface AuthorizedScheduleAccelerationAdoption {
  recommendationId: string
  recommendationHash: string
  operationsHash: string
  proposal: ScheduleAccelerationProposal
  taskCommitLedgerId: string
  taskCommitRequestId: string
  taskCommitResultSummary: Record<string, unknown>
  taskCommitCompletedAt: string | null
}

export interface AuthorizedScheduleAccelerationCommit {
  recommendationId: string
  recommendationHash: string
  operationsHash: string
  proposal: ScheduleAccelerationProposal
}

type RecommendationRow = {
  id?: unknown
  project_id?: unknown
  recommendation_hash?: unknown
  proposal?: unknown
  operations?: unknown
  operations_hash?: unknown
  issued_by?: unknown
  issued_at?: unknown
  expires_at?: unknown
}

type TaskCommitRow = {
  id?: unknown
  project_id?: unknown
  request_id?: unknown
  requested_by?: unknown
  status?: unknown
  recommendation_id?: unknown
  recommendation_hash?: unknown
  operations_hash?: unknown
  result_summary?: unknown
  completed_at?: unknown
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function createHttpError(message: string, code: string, statusCode: number): Error {
  return Object.assign(new Error(message), { code, statusCode })
}

function readProposal(value: unknown): ScheduleAccelerationProposal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ScheduleAccelerationProposal
}

function readAvailableMetric(value: unknown, unit: DurationMetricDto['unit']): DurationMetricDto | null {
  const metric = normalizeDurationMetricDto(value)
  return metric?.availability === 'available'
    && metric.unit === unit
    && metric.value !== null
    ? metric
    : null
}

function metricIdentity(metric: DurationMetricDto) {
  return [metric.calendarRef, metric.calendarVersion, metric.timezone, metric.asOf].join('|')
}

function hasCanonicalCalendarMetric(metric: DurationMetricDto | null) {
  return Boolean(metric)
    && metric?.calendarRef === 'gregorian'
    && metric.calendarVersion === 'ISO-8601'
}

function collectProposalMetrics(proposal: ScheduleAccelerationProposal) {
  const production: unknown[] = [proposal.totalRecover, proposal.remainingGap]
  const calendar: unknown[] = [proposal.overshoot]

  for (const action of proposal.actions ?? []) {
    production.push(action.recoverDuration)
    if (action.type === 'crashing') {
      for (const adjustment of action.durationAdjustments ?? []) {
        production.push(
          adjustment.currentDuration,
          adjustment.proposedDuration,
          adjustment.minDuration,
          adjustment.recoverDuration,
        )
      }
    }
  }
  for (const constraint of proposal.protectedConstraints ?? []) {
    production.push(constraint.duration)
  }
  for (const adjustment of proposal.rescheduleDraft?.taskDateAdjustments ?? []) {
    production.push(
      adjustment.currentDuration,
      adjustment.proposedDuration,
      adjustment.recoverDuration,
      adjustment.visualDiff?.durationDelta,
    )
    calendar.push(adjustment.visualDiff?.startDelta, adjustment.visualDiff?.endDelta)
  }
  for (const adjustment of proposal.rescheduleDraft?.resourceAdjustments ?? []) {
    production.push(
      adjustment.currentDuration,
      adjustment.proposedDuration,
      adjustment.minDuration,
      adjustment.recoverDuration,
    )
  }
  return { production, calendar }
}

export function hasAuthoritativeScheduleAccelerationProposalFacts(
  proposal: ScheduleAccelerationProposal | null | undefined,
): proposal is ScheduleAccelerationProposal {
  if (!proposal || proposal.mode !== 'preview_only' || proposal.source !== 'target_end_compression') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proposal.targetEndDate) || !/^\d{4}-\d{2}-\d{2}$/.test(proposal.naturalEndDate)) return false
  if (!Array.isArray(proposal.actions) || proposal.actions.length === 0) return false
  if (proposal.rescheduleDraft?.writePolicy !== 'requires_user_acceptance') return false
  if (!Array.isArray(proposal.rescheduleDraft.operations) || proposal.rescheduleDraft.operations.length === 0) return false

  const metrics = collectProposalMetrics(proposal)
  const productionMetrics = metrics.production.map((metric) => readAvailableMetric(metric, 'construction_production_day'))
  const calendarMetrics = metrics.calendar.map((metric) => readAvailableMetric(metric, 'calendar_day'))
  if (productionMetrics.some((metric) => !metric) || calendarMetrics.some((metric) => !hasCanonicalCalendarMetric(metric))) return false

  const productionIdentity = metricIdentity(productionMetrics[0]!)
  if (productionMetrics.some((metric) => metricIdentity(metric!) !== productionIdentity)) return false
  const calendarIdentity = metricIdentity(calendarMetrics[0]!)
  if (calendarMetrics.some((metric) => metricIdentity(metric!) !== calendarIdentity)) return false
  if (productionMetrics[0]!.timezone !== calendarMetrics[0]!.timezone) return false
  if (productionMetrics[0]!.asOf !== calendarMetrics[0]!.asOf) return false

  return proposal.rescheduleDraft.operations.every((operation) => {
    const record = readRecord(operation)
    const type = normalizeText(record.type)
    const rowId = normalizeText(record.rowId)
    if (!rowId) return false
    if (type === 'update_row') {
      return Object.keys(readRecord(record.values)).length > 0
    }
    if (type === 'set_predecessors') {
      return Array.isArray(record.predecessorTaskIds)
        && Array.isArray(record.predecessorDependencies)
    }
    return false
  })
}

export function buildScheduleAccelerationRecommendationHash(proposal: ScheduleAccelerationProposal): string {
  return buildCanonicalJsonHash(proposal)
}

export function buildScheduleAccelerationOperationsHash(proposal: ScheduleAccelerationProposal): string {
  return buildCanonicalJsonHash(proposal.rescheduleDraft?.operations ?? [])
}

export async function issueScheduleAccelerationRecommendation(input: {
  projectId: string
  issuedBy?: string | null
  proposal: ScheduleAccelerationProposal
  now?: Date
}): Promise<ScheduleAccelerationRecommendationIdentity | null> {
  const projectId = normalizeText(input.projectId)
  const issuedBy = normalizeText(input.issuedBy)
  if (!projectId || !issuedBy || !hasAuthoritativeScheduleAccelerationProposalFacts(input.proposal)) return null

  const issuedAt = input.now ?? new Date()
  const ttlMinutes = Number(process.env.SCHEDULE_ACCELERATION_RECOMMENDATION_TTL_MINUTES)
  const effectiveTtlMinutes = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? Math.floor(ttlMinutes) : 30
  const expiresAt = new Date(issuedAt.getTime() + effectiveTtlMinutes * 60_000)
  const id = randomUUID()
  const recommendationHash = buildScheduleAccelerationRecommendationHash(input.proposal)
  const operationsHash = buildScheduleAccelerationOperationsHash(input.proposal)
  const issued = await query(`
    INSERT INTO public.schedule_acceleration_recommendations (
      id,
      project_id,
      recommendation,
      operations,
      recommendation_hash,
      operations_hash,
      issued_by,
      issued_at,
      expires_at
    )
    VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9)
    RETURNING id, issued_at, expires_at
  `, [
    id,
    projectId,
    JSON.stringify(input.proposal),
    JSON.stringify(input.proposal.rescheduleDraft!.operations),
    recommendationHash,
    operationsHash,
    issuedBy,
    issuedAt.toISOString(),
    expiresAt.toISOString(),
  ])
  const row = issued.rows[0] as { id: string; issued_at: string; expires_at: string } | undefined
  if (!row) {
    throw createHttpError(
      'The acceleration recommendation could not be issued.',
      'ACCELERATION_RECOMMENDATION_ISSUE_FAILED',
      500,
    )
  }
  return {
    id: normalizeText(row.id) || id,
    recommendationHash,
    operationsHash,
    issuedAt: new Date(row.issued_at ?? issuedAt).toISOString(),
    expiresAt: new Date(row.expires_at ?? expiresAt).toISOString(),
  }
}

async function loadAuthorizedScheduleAccelerationRecommendation(input: {
  projectId: string
  recommendationId: string
  recommendationHash: string
  expectedOperationsHash?: string | null
  now?: Date
}): Promise<AuthorizedScheduleAccelerationCommit> {
  const projectId = normalizeText(input.projectId)
  const recommendationId = normalizeText(input.recommendationId)
  const recommendationHash = normalizeText(input.recommendationHash)
  const expectedOperationsHash = normalizeText(input.expectedOperationsHash)
  if (!recommendationId) throw createHttpError('recommendationId is required.', 'ACCELERATION_RECOMMENDATION_ID_REQUIRED', 400)
  if (!recommendationHash) throw createHttpError('recommendationHash is required.', 'ACCELERATION_RECOMMENDATION_HASH_REQUIRED', 400)
  if (!projectId) throw createHttpError('projectId is required.', 'PROJECT_ID_REQUIRED', 400)

  const recommendationResult = await query(`
    SELECT id, project_id, recommendation_hash, recommendation AS proposal, operations, operations_hash,
           issued_by, issued_at, expires_at
      FROM public.schedule_acceleration_recommendations
     WHERE id = $1
     LIMIT 1
     FOR SHARE
  `, [recommendationId])
  const recommendation = recommendationResult.rows[0] as RecommendationRow | undefined
  if (!recommendation) {
    throw createHttpError('The acceleration recommendation was not found.', 'ACCELERATION_RECOMMENDATION_NOT_FOUND', 404)
  }
  if (normalizeText(recommendation.project_id) !== projectId) {
    throw createHttpError('The acceleration recommendation belongs to another project.', 'ACCELERATION_RECOMMENDATION_PROJECT_MISMATCH', 404)
  }

  const proposal = readProposal(recommendation.proposal)
  const recomputedRecommendationHash = proposal ? buildScheduleAccelerationRecommendationHash(proposal) : ''
  const storedRecommendationHash = normalizeText(recommendation.recommendation_hash)
  if (!proposal || recommendationHash !== storedRecommendationHash || storedRecommendationHash !== recomputedRecommendationHash) {
    throw createHttpError('The acceleration recommendation hash does not match the issued proposal.', 'ACCELERATION_RECOMMENDATION_HASH_MISMATCH', 409)
  }
  const expiresAt = new Date(normalizeText(recommendation.expires_at))
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= (input.now ?? new Date()).getTime()) {
    throw createHttpError('The acceleration recommendation has expired.', 'ACCELERATION_RECOMMENDATION_EXPIRED', 409)
  }
  if (!hasAuthoritativeScheduleAccelerationProposalFacts(proposal)) {
    throw createHttpError('The issued proposal no longer has authoritative duration and calendar facts.', 'ACCELERATION_RECOMMENDATION_FACTS_UNAVAILABLE', 409)
  }

  const operationsHash = buildScheduleAccelerationOperationsHash(proposal)
  const storedOperations = Array.isArray(recommendation.operations) ? recommendation.operations : null
  const storedOperationsHash = storedOperations ? buildCanonicalJsonHash(storedOperations) : ''
  if (
    normalizeText(recommendation.operations_hash) !== operationsHash
    || storedOperationsHash !== operationsHash
  ) {
    throw createHttpError('The issued proposal operations hash is invalid.', 'ACCELERATION_RECOMMENDATION_OPERATIONS_HASH_MISMATCH', 409)
  }
  if (expectedOperationsHash && expectedOperationsHash !== operationsHash) {
    throw createHttpError('The submitted task operations differ from the issued proposal.', 'ACCELERATION_RECOMMENDATION_COMMIT_OPERATIONS_MISMATCH', 409)
  }

  return {
    recommendationId,
    recommendationHash,
    operationsHash,
    proposal,
  }
}

export async function authorizeScheduleAccelerationRecommendationCommit(input: {
  projectId: string
  recommendationId: string
  recommendationHash: string
  operationsHash: string
  now?: Date
}): Promise<AuthorizedScheduleAccelerationCommit> {
  const operationsHash = normalizeText(input.operationsHash)
  if (!operationsHash) {
    throw createHttpError('operationsHash is required.', 'ACCELERATION_RECOMMENDATION_OPERATIONS_HASH_REQUIRED', 400)
  }
  return loadAuthorizedScheduleAccelerationRecommendation({
    ...input,
    expectedOperationsHash: operationsHash,
  })
}

export async function authorizeScheduleAccelerationRecommendationAdoption(input: {
  projectId: string
  adoptedBy: string
  recommendationId: string
  recommendationHash: string
  taskCommitRequestId: string
  now?: Date
}): Promise<AuthorizedScheduleAccelerationAdoption> {
  const projectId = normalizeText(input.projectId)
  const adoptedBy = normalizeText(input.adoptedBy)
  const taskCommitRequestId = normalizeText(input.taskCommitRequestId)
  if (!adoptedBy) throw createHttpError('The adopting user is required.', 'ACCELERATION_ADOPTING_USER_REQUIRED', 401)
  const recommendation = await loadAuthorizedScheduleAccelerationRecommendation(input)
  const { recommendationId, recommendationHash, operationsHash, proposal } = recommendation
  if (!taskCommitRequestId) throw createHttpError('taskCommitRequestId is required.', 'ACCELERATION_TASK_COMMIT_REQUEST_ID_REQUIRED', 400)

  const commitResult = await query(`
    SELECT id, project_id, request_id, requested_by, status,
           recommendation_id, recommendation_hash, operations_hash,
           result_summary, completed_at
      FROM public.task_commit_requests
     WHERE project_id = $1
       AND request_id = $2
     LIMIT 1
     FOR SHARE
  `, [projectId, taskCommitRequestId])
  const commit = commitResult.rows[0] as TaskCommitRow | undefined
  if (!commit) {
    throw createHttpError('The task commit request was not found.', 'ACCELERATION_TASK_COMMIT_NOT_FOUND', 404)
  }
  if (normalizeText(commit.project_id) !== projectId) {
    throw createHttpError('The task commit belongs to another project.', 'ACCELERATION_TASK_COMMIT_PROJECT_MISMATCH', 404)
  }
  if (normalizeText(commit.status) !== 'succeeded') {
    throw createHttpError('The task commit has not succeeded.', 'ACCELERATION_TASK_COMMIT_NOT_SUCCEEDED', 409)
  }
  if (normalizeText(commit.requested_by) !== adoptedBy) {
    throw createHttpError('Only the user who committed the proposal may record its adoption.', 'ACCELERATION_TASK_COMMIT_ACTOR_MISMATCH', 403)
  }
  if (
    normalizeText(commit.recommendation_id) !== recommendationId
    || normalizeText(commit.recommendation_hash) !== recommendationHash
  ) {
    throw createHttpError('The task commit is not bound to this recommendation.', 'ACCELERATION_TASK_COMMIT_BINDING_MISMATCH', 409)
  }
  if (normalizeText(commit.operations_hash) !== operationsHash) {
    throw createHttpError('The committed task operations differ from the issued proposal.', 'ACCELERATION_TASK_COMMIT_OPERATIONS_MISMATCH', 409)
  }

  return {
    recommendationId,
    recommendationHash,
    operationsHash,
    proposal,
    taskCommitLedgerId: normalizeText(commit.id),
    taskCommitRequestId: normalizeText(commit.request_id),
    taskCommitResultSummary: readRecord(commit.result_summary),
    taskCommitCompletedAt: normalizeText(commit.completed_at) || null,
  }
}
