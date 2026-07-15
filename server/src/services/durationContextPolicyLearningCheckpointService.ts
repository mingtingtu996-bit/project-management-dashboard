import { createHash } from 'node:crypto'
import { executeSQL } from './dbService.js'

export const DURATION_CONTEXT_POLICY_LEARNER_VERSION = 'duration-context-policy-v2'

export type DurationContextPolicyLearningStage =
  | 'reward_backfill'
  | 'offline_replay'
  | 'parameter_learning'
  | 'learned_policy_replay'
  | 'candidate_persistence'
  | 'canary_gate'
  | 'decision_persistence'
  | 'auto_publish_gate'
  | 'approved_canary_shadow_replay'
  | 'activation_readiness'
  | 'trial_release_plan'
  | 'runtime_publication'
  | 'impact_monitoring'
  | 'cold_start_learning_plan'

export type DurationContextPolicyLearningCheckpointStatus = 'running' | 'succeeded' | 'failed'

export type DurationContextPolicyLearningOperationIdentity = {
  operationId: string
  scheduledWindow: string
  projectIds: string[]
  inputFactDigest: string
  learnerVersion: string
  identityHash: string
}

export type DurationContextPolicyLearningStageCheckpoint = {
  operationId: string
  stage: DurationContextPolicyLearningStage
  status: DurationContextPolicyLearningCheckpointStatus
  inputHash: string
  outputHash: string | null
  output: unknown
  attemptCount: number
  ownerId: string | null
  leaseExpiresAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  identity: DurationContextPolicyLearningOperationIdentity
}

export type DurationContextPolicyLearningCheckpointClaim =
  | { disposition: 'execute'; checkpoint: DurationContextPolicyLearningStageCheckpoint }
  | { disposition: 'reuse'; checkpoint: DurationContextPolicyLearningStageCheckpoint }
  | { disposition: 'in_flight'; checkpoint: DurationContextPolicyLearningStageCheckpoint }

export interface DurationContextPolicyLearningCheckpointStore {
  claimStage(input: {
    identity: DurationContextPolicyLearningOperationIdentity
    stage: DurationContextPolicyLearningStage
    inputHash: string
    ownerId: string
    leaseExpiresAt: string
    now: string
  }): Promise<DurationContextPolicyLearningCheckpointClaim>
  completeStage(input: {
    operationId: string
    stage: DurationContextPolicyLearningStage
    ownerId: string
    output: unknown
    outputHash: string
    now: string
  }): Promise<DurationContextPolicyLearningStageCheckpoint>
  failStage(input: {
    operationId: string
    stage: DurationContextPolicyLearningStage
    ownerId: string
    errorMessage: string
    now: string
  }): Promise<DurationContextPolicyLearningStageCheckpoint>
  listOperationCheckpoints(operationId: string): Promise<DurationContextPolicyLearningStageCheckpoint[]>
}

export type InMemoryDurationContextPolicyLearningCheckpointStore = DurationContextPolicyLearningCheckpointStore & {
  corruptSucceededOutputForTest(
    operationId: string,
    stage: DurationContextPolicyLearningStage,
    output: unknown,
  ): void
}

export class DurationContextPolicyLearningCheckpointConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DurationContextPolicyLearningCheckpointConflictError'
  }
}

export class DurationContextPolicyLearningStageInFlightError extends Error {
  constructor(
    public readonly operationId: string,
    public readonly stage: DurationContextPolicyLearningStage,
  ) {
    super(`Duration context policy learning stage is already in flight: ${operationId}/${stage}`)
    this.name = 'DurationContextPolicyLearningStageInFlightError'
  }
}

type CheckpointQueryExec = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeProjectIds(projectIds: readonly string[]) {
  return Array.from(new Set(projectIds.map(normalizeText).filter(Boolean))).sort()
}

function canonicalValue(value: unknown): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    )
  }
  return String(value)
}

function cloneCheckpointValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(canonicalValue(value))) as T
}

export function hashDurationContextPolicyLearningValue(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex')
}

export function buildDurationContextPolicyLearningIdempotencyUuid(
  operationId: string,
  stage: string,
  businessKey: string,
) {
  const hash = hashDurationContextPolicyLearningValue({ operationId, stage, businessKey })
  const chars = hash.slice(0, 32).split('')
  chars[12] = '5'
  chars[16] = ['8', '9', 'a', 'b'][Number.parseInt(chars[16], 16) % 4]
  const hex = chars.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function buildDurationContextPolicyLearningOperationIdentity(input: {
  scheduledWindow: string
  projectIds: readonly string[]
  inputFactDigest: string
  learnerVersion?: string | null
}): DurationContextPolicyLearningOperationIdentity {
  const scheduledWindow = normalizeText(input.scheduledWindow)
  const projectIds = normalizeProjectIds(input.projectIds)
  const inputFactDigest = normalizeText(input.inputFactDigest)
  const learnerVersion = normalizeText(input.learnerVersion) || DURATION_CONTEXT_POLICY_LEARNER_VERSION
  if (!scheduledWindow) throw new Error('scheduled_window_required')
  if (!inputFactDigest) throw new Error('input_fact_digest_required')
  const identityHash = hashDurationContextPolicyLearningValue({
    scheduledWindow,
    projectIds,
    inputFactDigest,
    learnerVersion,
  })
  return {
    operationId: `duration-context-policy-learning:${scheduledWindow}:${identityHash.slice(0, 24)}`,
    scheduledWindow,
    projectIds,
    inputFactDigest,
    learnerVersion,
    identityHash,
  }
}

function checkpointKey(operationId: string, stage: DurationContextPolicyLearningStage) {
  return `${operationId}\u0000${stage}`
}

function assertReusableCheckpoint(
  checkpoint: DurationContextPolicyLearningStageCheckpoint,
  inputHash: string,
) {
  if (checkpoint.inputHash !== inputHash) {
    throw new DurationContextPolicyLearningCheckpointConflictError(
      `Checkpoint input hash mismatch for ${checkpoint.operationId}/${checkpoint.stage}`,
    )
  }
  if (checkpoint.status === 'succeeded') {
    const actualOutputHash = hashDurationContextPolicyLearningValue(checkpoint.output)
    if (!checkpoint.outputHash || checkpoint.outputHash !== actualOutputHash) {
      throw new DurationContextPolicyLearningCheckpointConflictError(
        `Checkpoint output hash mismatch for ${checkpoint.operationId}/${checkpoint.stage}`,
      )
    }
  }
}

export function createInMemoryDurationContextPolicyLearningCheckpointStore(): InMemoryDurationContextPolicyLearningCheckpointStore {
  const checkpoints = new Map<string, DurationContextPolicyLearningStageCheckpoint>()
  return {
    async claimStage(input) {
      const key = checkpointKey(input.identity.operationId, input.stage)
      const existing = checkpoints.get(key)
      if (existing) {
        assertReusableCheckpoint(existing, input.inputHash)
        if (existing.identity.identityHash !== input.identity.identityHash) {
          throw new DurationContextPolicyLearningCheckpointConflictError(
            `Checkpoint operation identity mismatch for ${input.identity.operationId}/${input.stage}`,
          )
        }
        if (existing.status === 'succeeded') {
          return { disposition: 'reuse', checkpoint: cloneCheckpointValue(existing) }
        }
        const leaseActive = existing.status === 'running'
          && Boolean(existing.leaseExpiresAt)
          && String(existing.leaseExpiresAt).localeCompare(input.now) > 0
        if (leaseActive) {
          return { disposition: 'in_flight', checkpoint: cloneCheckpointValue(existing) }
        }
        const claimed: DurationContextPolicyLearningStageCheckpoint = {
          ...existing,
          status: 'running',
          ownerId: input.ownerId,
          leaseExpiresAt: input.leaseExpiresAt,
          errorMessage: null,
          attemptCount: existing.attemptCount + 1,
          updatedAt: input.now,
        }
        checkpoints.set(key, claimed)
        return { disposition: 'execute', checkpoint: cloneCheckpointValue(claimed) }
      }

      const checkpoint: DurationContextPolicyLearningStageCheckpoint = {
        operationId: input.identity.operationId,
        stage: input.stage,
        status: 'running',
        inputHash: input.inputHash,
        outputHash: null,
        output: null,
        attemptCount: 1,
        ownerId: input.ownerId,
        leaseExpiresAt: input.leaseExpiresAt,
        errorMessage: null,
        createdAt: input.now,
        updatedAt: input.now,
        identity: cloneCheckpointValue(input.identity),
      }
      checkpoints.set(key, checkpoint)
      return { disposition: 'execute', checkpoint: cloneCheckpointValue(checkpoint) }
    },

    async completeStage(input) {
      const key = checkpointKey(input.operationId, input.stage)
      const existing = checkpoints.get(key)
      if (!existing || existing.status !== 'running' || existing.ownerId !== input.ownerId) {
        throw new DurationContextPolicyLearningCheckpointConflictError(
          `Checkpoint completion lease mismatch for ${input.operationId}/${input.stage}`,
        )
      }
      const checkpoint: DurationContextPolicyLearningStageCheckpoint = {
        ...existing,
        status: 'succeeded',
        output: cloneCheckpointValue(input.output),
        outputHash: input.outputHash,
        ownerId: null,
        leaseExpiresAt: null,
        errorMessage: null,
        updatedAt: input.now,
      }
      checkpoints.set(key, checkpoint)
      return cloneCheckpointValue(checkpoint)
    },

    async failStage(input) {
      const key = checkpointKey(input.operationId, input.stage)
      const existing = checkpoints.get(key)
      if (!existing || existing.status !== 'running' || existing.ownerId !== input.ownerId) {
        throw new DurationContextPolicyLearningCheckpointConflictError(
          `Checkpoint failure lease mismatch for ${input.operationId}/${input.stage}`,
        )
      }
      const checkpoint: DurationContextPolicyLearningStageCheckpoint = {
        ...existing,
        status: 'failed',
        ownerId: null,
        leaseExpiresAt: null,
        errorMessage: input.errorMessage,
        updatedAt: input.now,
      }
      checkpoints.set(key, checkpoint)
      return cloneCheckpointValue(checkpoint)
    },

    async listOperationCheckpoints(operationId) {
      return Array.from(checkpoints.values())
        .filter((checkpoint) => checkpoint.operationId === operationId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.stage.localeCompare(right.stage))
        .map(cloneCheckpointValue)
    },

    corruptSucceededOutputForTest(operationId, stage, output) {
      const key = checkpointKey(operationId, stage)
      const checkpoint = checkpoints.get(key)
      if (!checkpoint || checkpoint.status !== 'succeeded') throw new Error('succeeded_checkpoint_required')
      checkpoints.set(key, {
        ...checkpoint,
        output: cloneCheckpointValue(output),
      })
    },
  }
}

function rowRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function mapCheckpointRow(row: Record<string, unknown>): DurationContextPolicyLearningStageCheckpoint {
  const identity = rowRecord(row.operation_identity)
  return {
    operationId: normalizeText(row.operation_id),
    stage: normalizeText(row.stage_key) as DurationContextPolicyLearningStage,
    status: normalizeText(row.stage_status) as DurationContextPolicyLearningCheckpointStatus,
    inputHash: normalizeText(row.input_hash),
    outputHash: normalizeText(row.output_hash) || null,
    output: row.output_payload ?? null,
    attemptCount: Math.max(0, Math.trunc(Number(row.attempt_count) || 0)),
    ownerId: normalizeText(row.lease_owner) || null,
    leaseExpiresAt: normalizeText(row.lease_expires_at) || null,
    errorMessage: normalizeText(row.error_message) || null,
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
    identity: {
      operationId: normalizeText(identity.operationId ?? identity.operation_id ?? row.operation_id),
      scheduledWindow: normalizeText(identity.scheduledWindow ?? identity.scheduled_window),
      projectIds: normalizeProjectIds(Array.isArray(identity.projectIds ?? identity.project_ids)
        ? identity.projectIds as string[]
        : identity.project_ids as string[] ?? []),
      inputFactDigest: normalizeText(identity.inputFactDigest ?? identity.input_fact_digest),
      learnerVersion: normalizeText(identity.learnerVersion ?? identity.learner_version),
      identityHash: normalizeText(identity.identityHash ?? identity.identity_hash),
    },
  }
}

export function createDatabaseDurationContextPolicyLearningCheckpointStore(
  queryExec: CheckpointQueryExec = executeSQL,
): DurationContextPolicyLearningCheckpointStore {
  const readCheckpoint = async (operationId: string, stage: DurationContextPolicyLearningStage) => {
    const rows = await queryExec<Record<string, unknown>>(
      'select operation_id, stage_key, stage_status, input_hash, output_hash, output_payload, attempt_count, lease_owner, lease_expires_at, error_message, operation_identity, created_at, updated_at from public.duration_context_policy_learning_checkpoints where operation_id = $1 and stage_key = $2 limit 1',
      [operationId, stage],
    )
    return rows[0] ? mapCheckpointRow(rows[0]) : null
  }

  return {
    async claimStage(input) {
      const inserted = await queryExec<Record<string, unknown>>(
        `insert into public.duration_context_policy_learning_checkpoints (
          operation_id, stage_key, stage_status, input_hash, attempt_count,
          lease_owner, lease_expires_at, operation_identity, created_at, updated_at
        ) values ($1, $2, 'running', $3, 1, $4, $5, $6, $7, $7)
        on conflict (operation_id, stage_key) do nothing
        returning operation_id, stage_key, stage_status, input_hash, output_hash, output_payload,
                  attempt_count, lease_owner, lease_expires_at, error_message, operation_identity,
                  created_at, updated_at`,
        [
          input.identity.operationId,
          input.stage,
          input.inputHash,
          input.ownerId,
          input.leaseExpiresAt,
          input.identity,
          input.now,
        ],
      )
      if (inserted[0]) return { disposition: 'execute', checkpoint: mapCheckpointRow(inserted[0]) }

      const existing = await readCheckpoint(input.identity.operationId, input.stage)
      if (!existing) {
        throw new DurationContextPolicyLearningCheckpointConflictError(
          `Checkpoint claim disappeared for ${input.identity.operationId}/${input.stage}`,
        )
      }
      assertReusableCheckpoint(existing, input.inputHash)
      if (existing.identity.identityHash !== input.identity.identityHash) {
        throw new DurationContextPolicyLearningCheckpointConflictError(
          `Checkpoint operation identity mismatch for ${input.identity.operationId}/${input.stage}`,
        )
      }
      if (existing.status === 'succeeded') return { disposition: 'reuse', checkpoint: existing }
      if (
        existing.status === 'running'
        && existing.leaseExpiresAt
        && existing.leaseExpiresAt.localeCompare(input.now) > 0
      ) {
        return { disposition: 'in_flight', checkpoint: existing }
      }

      const claimed = await queryExec<Record<string, unknown>>(
        `update public.duration_context_policy_learning_checkpoints
            set stage_status = 'running',
                attempt_count = attempt_count + 1,
                lease_owner = $4,
                lease_expires_at = $5,
                error_message = null,
                updated_at = $6
          where operation_id = $1
            and stage_key = $2
            and input_hash = $3
            and (stage_status = 'failed' or lease_expires_at is null or lease_expires_at <= $6)
        returning operation_id, stage_key, stage_status, input_hash, output_hash, output_payload,
                  attempt_count, lease_owner, lease_expires_at, error_message, operation_identity,
                  created_at, updated_at`,
        [input.identity.operationId, input.stage, input.inputHash, input.ownerId, input.leaseExpiresAt, input.now],
      )
      if (claimed[0]) return { disposition: 'execute', checkpoint: mapCheckpointRow(claimed[0]) }
      const current = await readCheckpoint(input.identity.operationId, input.stage)
      if (!current) {
        throw new DurationContextPolicyLearningCheckpointConflictError(
          `Checkpoint claim disappeared for ${input.identity.operationId}/${input.stage}`,
        )
      }
      assertReusableCheckpoint(current, input.inputHash)
      return current.status === 'succeeded'
        ? { disposition: 'reuse', checkpoint: current }
        : { disposition: 'in_flight', checkpoint: current }
    },

    async completeStage(input) {
      const rows = await queryExec<Record<string, unknown>>(
        `update public.duration_context_policy_learning_checkpoints
            set stage_status = 'succeeded', output_hash = $4, output_payload = $5,
                lease_owner = null, lease_expires_at = null, error_message = null, updated_at = $6
          where operation_id = $1 and stage_key = $2 and stage_status = 'running' and lease_owner = $3
        returning operation_id, stage_key, stage_status, input_hash, output_hash, output_payload,
                  attempt_count, lease_owner, lease_expires_at, error_message, operation_identity,
                  created_at, updated_at`,
        [input.operationId, input.stage, input.ownerId, input.outputHash, canonicalValue(input.output), input.now],
      )
      if (!rows[0]) {
        throw new DurationContextPolicyLearningCheckpointConflictError(
          `Checkpoint completion lease mismatch for ${input.operationId}/${input.stage}`,
        )
      }
      return mapCheckpointRow(rows[0])
    },

    async failStage(input) {
      const rows = await queryExec<Record<string, unknown>>(
        `update public.duration_context_policy_learning_checkpoints
            set stage_status = 'failed', lease_owner = null, lease_expires_at = null,
                error_message = $4, updated_at = $5
          where operation_id = $1 and stage_key = $2 and stage_status = 'running' and lease_owner = $3
        returning operation_id, stage_key, stage_status, input_hash, output_hash, output_payload,
                  attempt_count, lease_owner, lease_expires_at, error_message, operation_identity,
                  created_at, updated_at`,
        [input.operationId, input.stage, input.ownerId, input.errorMessage, input.now],
      )
      if (!rows[0]) {
        throw new DurationContextPolicyLearningCheckpointConflictError(
          `Checkpoint failure lease mismatch for ${input.operationId}/${input.stage}`,
        )
      }
      return mapCheckpointRow(rows[0])
    },

    async listOperationCheckpoints(operationId) {
      const rows = await queryExec<Record<string, unknown>>(
        'select operation_id, stage_key, stage_status, input_hash, output_hash, output_payload, attempt_count, lease_owner, lease_expires_at, error_message, operation_identity, created_at, updated_at from public.duration_context_policy_learning_checkpoints where operation_id = $1 order by created_at asc, stage_key asc',
        [operationId],
      )
      return rows.map(mapCheckpointRow)
    },
  }
}

export async function executeDurationContextPolicyLearningStage<T>(input: {
  identity: DurationContextPolicyLearningOperationIdentity
  stage: DurationContextPolicyLearningStage
  stageInput: unknown
  ownerId: string
  store: DurationContextPolicyLearningCheckpointStore
  execute: () => Promise<T>
  now?: () => Date
  leaseMs?: number
}): Promise<{
  disposition: 'executed' | 'reused'
  output: T
  checkpoint: DurationContextPolicyLearningStageCheckpoint
}> {
  const clock = input.now ?? (() => new Date())
  const startedAt = clock()
  const leaseMs = Math.max(1_000, input.leaseMs ?? 15 * 60 * 1_000)
  const inputHash = hashDurationContextPolicyLearningValue(input.stageInput)
  const claim = await input.store.claimStage({
    identity: input.identity,
    stage: input.stage,
    inputHash,
    ownerId: input.ownerId,
    leaseExpiresAt: new Date(startedAt.getTime() + leaseMs).toISOString(),
    now: startedAt.toISOString(),
  })
  if (claim.disposition === 'in_flight') {
    throw new DurationContextPolicyLearningStageInFlightError(input.identity.operationId, input.stage)
  }
  if (claim.disposition === 'reuse') {
    assertReusableCheckpoint(claim.checkpoint, inputHash)
    return {
      disposition: 'reused',
      output: cloneCheckpointValue(claim.checkpoint.output) as T,
      checkpoint: claim.checkpoint,
    }
  }

  try {
    const output = await input.execute()
    const outputHash = hashDurationContextPolicyLearningValue(output)
    const checkpoint = await input.store.completeStage({
      operationId: input.identity.operationId,
      stage: input.stage,
      ownerId: input.ownerId,
      output,
      outputHash,
      now: clock().toISOString(),
    })
    return {
      disposition: 'executed',
      output,
      checkpoint,
    }
  } catch (error) {
    await input.store.failStage({
      operationId: input.identity.operationId,
      stage: input.stage,
      ownerId: input.ownerId,
      errorMessage: error instanceof Error ? error.message : String(error),
      now: clock().toISOString(),
    })
    throw error
  }
}
