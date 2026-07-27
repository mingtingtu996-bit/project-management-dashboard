import { supabase } from './dbService.js'
import { getClient } from '../database.js'
import type { DurationContextPolicyActionKey, DurationContextPolicyModelFamily } from './durationContextPolicyLearningService.js'

export interface DurationContextPolicyCanaryScope {
  projectIds?: string[] | null
  startDate?: string | null
  endDate?: string | null
  trafficPercent?: number | null
}

export interface ApproveDurationContextPolicyCanaryCandidateInput {
  companyId: string
  candidateId: string
  approvedBy?: string | null
  scope?: DurationContextPolicyCanaryScope | null
  reason?: string | null
  expiresAt?: string | null
  reviewMetadata?: Record<string, unknown> | null
}

export interface ApproveDurationContextPolicyCanaryCandidateBatchItem {
  candidateId: string
  scope?: DurationContextPolicyCanaryScope | null
  reason?: string | null
  expiresAt?: string | null
}

export interface ApproveDurationContextPolicyCanaryCandidateBatchInput {
  companyId: string
  batchId?: string | null
  approvedBy?: string | null
  reason?: string | null
  items?: readonly ApproveDurationContextPolicyCanaryCandidateBatchItem[] | null
}

export interface RejectDurationContextPolicyCanaryCandidateInput {
  companyId: string
  candidateId: string
  rejectedBy?: string | null
  reason?: string | null
}

export interface RollbackDurationContextPolicyVersionInput {
  companyId: string
  versionId: string
  rolledBackBy?: string | null
  reason?: string | null
}

export interface DurationContextPolicyVersionRecord {
  id: string
  modelFamily: DurationContextPolicyModelFamily
  modelVersion: string
  sourceCandidateId: string
  status: 'canary' | 'published' | 'rolled_back' | 'expired'
  activationMode: 'review_required_canary' | 'auto_publish_gate_canary' | 'manual_publish'
  runtimeMutationPolicy: 'none_version_registry_only'
  runtimeAutoPublishEligible: false
  rollbackPolicy: 'manual_rollback_required_before_runtime_disablement' | 'auto_or_manual_rollback_on_mae_regression_or_guardrail_drift'
  stateBucket: string
  actionKey: DurationContextPolicyActionKey
  scope: DurationContextPolicyCanaryScope
  approvedBy: string | null
  expiresAt: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function requireId(value: unknown, fieldName: string) {
  const id = normalizeId(value)
  if (!id) throw new Error(`${fieldName} is required`)
  return id
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : []
}

function normalizeScope(scope?: DurationContextPolicyCanaryScope | null): DurationContextPolicyCanaryScope {
  return {
    projectIds: readStringList(scope?.projectIds),
    startDate: normalizeText(scope?.startDate) || null,
    endDate: normalizeText(scope?.endDate) || null,
    trafficPercent: clamp(readNumber(scope?.trafficPercent, 5), 0, 25),
  }
}

function isLowRiskStateBucket(value: unknown) {
  return normalizeText(value).includes('|risk:low|')
}

function rowToPolicyVersion(row: Record<string, unknown>): DurationContextPolicyVersionRecord {
  return {
    id: normalizeText(row.id),
    modelFamily: normalizeText(row.model_family) as DurationContextPolicyModelFamily || 'contextual_bandit_v1',
    modelVersion: normalizeText(row.model_version) || 'contextual_bandit_v1',
    sourceCandidateId: normalizeText(row.source_candidate_id),
    status: normalizeText(row.version_status) as DurationContextPolicyVersionRecord['status'] || 'canary',
    activationMode: normalizeText(row.activation_mode) as DurationContextPolicyVersionRecord['activationMode'] || 'review_required_canary',
    runtimeMutationPolicy: normalizeText(row.runtime_mutation_policy) as DurationContextPolicyVersionRecord['runtimeMutationPolicy'] || 'none_version_registry_only',
    runtimeAutoPublishEligible: false,
    rollbackPolicy: normalizeText(row.rollback_policy) as DurationContextPolicyVersionRecord['rollbackPolicy'] || 'manual_rollback_required_before_runtime_disablement',
    stateBucket: normalizeText(row.state_bucket),
    actionKey: normalizeText(row.action_key) as DurationContextPolicyActionKey,
    scope: readRecord(row.canary_scope) as DurationContextPolicyCanaryScope,
    approvedBy: normalizeId(row.approved_by),
    expiresAt: normalizeText(row.expires_at) || null,
  }
}

async function loadCandidate(candidateId: string, companyId: string) {
  const id = normalizeId(candidateId)
  if (!id) throw new Error('candidateId is required')
  const tenantId = requireId(companyId, 'companyId')
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_canary_candidates')
    .select('*')
    .eq('id', id)
    .eq('company_id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load duration context policy canary candidate: ${error.message}`)
  if (!data) throw new Error(`Duration context policy canary candidate not found for tenant: ${id}`)
  return data as Record<string, unknown>
}

async function updateCandidateStatus(input: {
  companyId: string
  candidateId: string
  status: 'approved_for_canary' | 'rejected'
  actorId?: string | null
  reason?: string | null
  reviewMetadata?: Record<string, unknown> | null
  expectedStatus?: 'candidate' | 'approved_for_canary' | 'rejected' | 'superseded'
}) {
  const metadata = {
    reviewedBy: normalizeId(input.actorId),
    reviewedAt: new Date().toISOString(),
    reviewReason: normalizeText(input.reason) || null,
    ...readRecord(input.reviewMetadata),
  }
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_canary_candidates')
    .update({
      candidate_status: input.status,
      runtime_auto_publish_eligible: false,
      runtime_mutation_policy: 'none_canary_candidate_only',
      review_metadata: metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.candidateId)
    .eq('company_id', requireId(input.companyId, 'companyId'))
    .eq('candidate_status', input.expectedStatus ?? 'candidate')
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to update duration context policy canary candidate: ${error.message}`)
  if (!data) {
    throw new Error('Duration context policy canary candidate already changed before review update.')
  }
  return data as Record<string, unknown> | null
}

async function markCandidateApprovalVersionPersistenceFailed(
  candidateRow: Record<string, unknown>,
  versionError: { message?: unknown },
) {
  const candidateId = normalizeText(candidateRow.id)
  if (!candidateId) return

  const existingMetadata = readRecord(candidateRow.review_metadata)
  const reasonCodes = Array.from(new Set([
    ...readStringList(existingMetadata.canaryApprovalReasonCodes),
    'version_persistence_failed',
  ]))
  const errorMessage = normalizeText(versionError.message) || 'unknown version persistence error'

  await (supabase as any)
    .from('duration_context_policy_canary_candidates')
    .update({
      candidate_status: 'rejected',
      runtime_auto_publish_eligible: false,
      requires_review: true,
      review_metadata: {
        ...existingMetadata,
        canaryApprovalDecision: 'review_required_canary_failed_version_persistence',
        canaryApprovalReasonCodes: reasonCodes,
        canaryApprovalFailedAt: new Date().toISOString(),
        versionPersistenceError: errorMessage,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId)
    .select('*')
    .maybeSingle()
}

export async function approveDurationContextPolicyCanaryCandidate(
  input: ApproveDurationContextPolicyCanaryCandidateInput,
) {
  const companyId = requireId(input.companyId, 'companyId')
  const candidateId = normalizeText(input.candidateId)
  const candidate = await loadCandidate(candidateId, companyId)
  const status = normalizeText(candidate.candidate_status)
  if (status !== 'candidate') {
    throw new Error(`Only candidate rows can be approved for canary. Current status: ${status || 'unknown'}`)
  }
  if (!isLowRiskStateBucket(candidate.state_bucket)) {
    throw new Error('Candidate cannot be approved for canary because its state bucket is not low-risk.')
  }
  const guardrails = readStringList(candidate.guardrails)
  if (guardrails.includes('manual_runtime_promotion_required') || guardrails.includes('hard_constraint_active')) {
    throw new Error('Candidate cannot be approved for canary because manual runtime promotion guardrails are active.')
  }

  const scope = normalizeScope(input.scope)
  const client = await getClient()
  let transactionStarted = false
  let atomicResult: {
    candidate_row?: Record<string, unknown> | null
    version_row?: Record<string, unknown> | null
    superseded_version_id?: string | null
  } | null = null
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const result = await client.query<{
      candidate_row?: Record<string, unknown> | null
      version_row?: Record<string, unknown> | null
      superseded_version_id?: string | null
    }>(
      `select candidate_row, version_row, superseded_version_id
         from public.approve_duration_context_policy_canary_candidate_atomic(
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4::jsonb,
           $5::text,
           $6::timestamptz,
           $7::jsonb
         )`,
      [
        companyId,
        candidateId,
        normalizeId(input.approvedBy),
        JSON.stringify(scope),
        normalizeText(input.reason) || null,
        normalizeText(input.expiresAt) || null,
        JSON.stringify(readRecord(input.reviewMetadata)),
      ],
    )
    atomicResult = result.rows[0] ?? null
    if (!atomicResult?.candidate_row || !atomicResult.version_row) {
      throw new Error('Atomic canary approval did not return the activated candidate and version.')
    }
    await client.query('COMMIT')
    transactionStarted = false
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined)
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes('duplicate') || message.includes('23505')) {
      throw new Error('Duration context policy canary version already exists for this candidate.')
    }
    throw error
  } finally {
    client.release()
  }

  const policyVersion = rowToPolicyVersion(atomicResult.version_row)
  return {
    approvalCode: 'duration_context_policy_canary_approval' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_approval_record_only' as const,
    candidateId,
    candidateStatus: 'approved_for_canary' as const,
    versionStatus: policyVersion.status,
    runtimeAutoPublishEligible: false as const,
    policyVersion,
    supersededPolicyVersionId: normalizeId(atomicResult.superseded_version_id),
  }
}

function buildBatchApprovalReason(input: {
  batchId: string
  batchReason?: string | null
  itemReason?: string | null
}) {
  const reason = normalizeText(input.itemReason) || normalizeText(input.batchReason) || 'batch canary approval'
  return `[batch:${input.batchId}] ${reason}`
}

export async function approveDurationContextPolicyCanaryCandidateBatch(
  input: ApproveDurationContextPolicyCanaryCandidateBatchInput,
) {
  const companyId = requireId(input.companyId, 'companyId')
  const batchId = normalizeId(input.batchId) ?? `duration-context-canary-batch-${new Date().toISOString()}`
  const items = Array.isArray(input.items) ? input.items : []
  if (items.length === 0) throw new Error('At least one canary candidate approval item is required.')

  const approvals: Awaited<ReturnType<typeof approveDurationContextPolicyCanaryCandidate>>[] = []
  const failures: Array<{ candidateId: string; error: string }> = []
  const reviewMetadata = {
    batchId,
    humanReviewMode: 'weekly_batch_single_click',
    batchReason: normalizeText(input.reason) || null,
  }

  for (const item of items) {
    const candidateId = normalizeText(item.candidateId)
    try {
      const approval = await approveDurationContextPolicyCanaryCandidate({
        companyId,
        candidateId,
        approvedBy: input.approvedBy,
        scope: item.scope,
        reason: buildBatchApprovalReason({
          batchId,
          batchReason: input.reason,
          itemReason: item.reason,
        }),
        expiresAt: item.expiresAt,
        reviewMetadata,
      })
      approvals.push(approval)
    } catch (error) {
      failures.push({
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    approvalCode: 'duration_context_policy_canary_batch_approval' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    humanReviewMode: 'weekly_batch_single_click' as const,
    runtimeMutationPolicy: 'none_batch_approval_record_only' as const,
    batchId,
    requestedCount: items.length,
    approvedCount: approvals.length,
    failedCount: failures.length,
    approvals,
    failures,
  }
}

export async function rejectDurationContextPolicyCanaryCandidate(
  input: RejectDurationContextPolicyCanaryCandidateInput,
) {
  const companyId = requireId(input.companyId, 'companyId')
  const candidateId = normalizeText(input.candidateId)
  await loadCandidate(candidateId, companyId)
  await updateCandidateStatus({
    companyId,
    candidateId,
    status: 'rejected',
    actorId: input.rejectedBy,
    reason: input.reason,
  })
  return {
    approvalCode: 'duration_context_policy_canary_rejection' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_rejection_record_only' as const,
    candidateId,
    candidateStatus: 'rejected' as const,
    runtimeAutoPublishEligible: false as const,
  }
}

export async function rollbackDurationContextPolicyVersion(
  input: RollbackDurationContextPolicyVersionInput,
) {
  const companyId = requireId(input.companyId, 'companyId')
  const versionId = normalizeText(input.versionId)
  if (!versionId) throw new Error('versionId is required')
  const client = await getClient()
  let transactionStarted = false
  let atomicResult: {
    rolled_back_version_row?: Record<string, unknown> | null
    restored_version_row?: Record<string, unknown> | null
  } | null = null
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const result = await client.query<{
      rolled_back_version_row?: Record<string, unknown> | null
      restored_version_row?: Record<string, unknown> | null
    }>(
      `select rolled_back_version_row, restored_version_row
         from public.rollback_duration_context_policy_version_atomic(
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4::text
         )`,
      [
        companyId,
        versionId,
        normalizeId(input.rolledBackBy),
        normalizeText(input.reason) || null,
      ],
    )
    atomicResult = result.rows[0] ?? null
    if (!atomicResult?.rolled_back_version_row) {
      throw new Error(`Duration context policy version not found for tenant: ${versionId}`)
    }
    await client.query('COMMIT')
    transactionStarted = false
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  const policyVersion = rowToPolicyVersion(atomicResult.rolled_back_version_row)
  const restoredPolicyVersion = atomicResult.restored_version_row
    ? rowToPolicyVersion(atomicResult.restored_version_row)
    : null
  return {
    rollbackCode: 'duration_context_policy_version_rollback' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_version_registry_only' as const,
    versionId,
    versionStatus: 'rolled_back' as const,
    policyVersion,
    restoredPolicyVersion,
  }
}
