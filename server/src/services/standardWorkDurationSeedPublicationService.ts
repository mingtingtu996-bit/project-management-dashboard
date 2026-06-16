import { v4 as uuidv4 } from 'uuid'

import {
  getAlgorithmSeedEvidenceKeys,
  getAlgorithmSeedStableCode,
  isAlgorithmSeedPayloadActive,
  normalizeAlgorithmSeedRecordPayload,
  type AlgorithmSeedRecordPayload,
} from './algorithmSeedRegistry.js'
import { clearAlgorithmSeedResolverCache } from './algorithmSeedResolver.js'
import { validateAlgorithmSeedRuntimePayload } from './algorithmSeedValidationService.js'
import type {
  StandardWorkDurationSeedPublicationReadiness,
} from './standardWorkDurationSeedReplayCandidateBridgeService.js'

export type StandardWorkDurationSeedPublicationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type ApprovedStandardWorkDurationSeedCandidate = {
  id: string
  approvalStatus: 'approved' | 'pending' | 'rejected'
  candidatePayload: AlgorithmSeedRecordPayload
}

export type PublishStandardWorkDurationSeedVersionInput = {
  readiness: StandardWorkDurationSeedPublicationReadiness
  seedVersion: string
  approvedCandidates: readonly ApprovedStandardWorkDurationSeedCandidate[]
  queryExec: StandardWorkDurationSeedPublicationQueryExec
  publishedBy?: string | null
  executedAt?: string
}

export type StandardWorkDurationSeedPublicationResult = {
  status: 'standard_work_duration_seed_published' | 'blocked'
  publicationKey: string | null
  rollbackTarget: string | null
  seedVersionId: string | null
  recordCount: number
  writesAlgorithmSeedVersions: boolean
  writesAlgorithmSeedRecords: boolean
  writesTasksOrBaselinesDirectly: false
  writesMonthlyPlansDirectly: false
  writesProgressFactsDirectly: false
  reasons: string[]
}

export type RollbackStandardWorkDurationSeedVersionInput = {
  queryExec: StandardWorkDurationSeedPublicationQueryExec
  sourcePublicationKey: string
  rollbackTarget: string
  reason?: string | null
  userId?: string | null
  executedAt?: string
}

export type StandardWorkDurationSeedRollbackResult = {
  status: 'standard_work_duration_seed_rollback_executed' | 'rollback_blocked'
  sourcePublicationKey: string | null
  rollbackTarget: string | null
  restoredRuntimePolicy: 'previous_standard_work_duration_seed_version_restored'
  writesAlgorithmSeedVersions: boolean
  writesTasksOrBaselinesDirectly: false
  writesMonthlyPlansDirectly: false
  writesProgressFactsDirectly: false
  reasons: string[]
}

type StandardWorkDurationSeedRecordRow = {
  id: string
  seed_version_id: string
  seed_type: 'standard_work_duration'
  stable_code: string
  rule_payload: AlgorithmSeedRecordPayload
  source_standard: string | null
  source_version: string | null
  source_clause_ref: string | null
  evidence_source_keys: string[]
  confidence: 'high' | 'medium' | 'low'
  web_verified: boolean
  review_needed: boolean
  status: 'active' | 'inactive'
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function uniqueReasons(values: readonly string[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function publicationKeyForSeedVersion(seedVersionId: string | null) {
  return seedVersionId ? `algorithm_seed_versions:${seedVersionId}` : null
}

function parseAlgorithmSeedPublicationKey(value: unknown) {
  const normalized = normalizeText(value)
  const prefix = 'algorithm_seed_versions:'
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : null
}

function blockedPublication(
  input: {
    publicationKey: string | null
    rollbackTarget: string | null
    seedVersionId: string | null
    reasons: string[]
  },
): StandardWorkDurationSeedPublicationResult {
  return {
    status: 'blocked',
    publicationKey: input.publicationKey,
    rollbackTarget: input.rollbackTarget,
    seedVersionId: input.seedVersionId,
    recordCount: 0,
    writesAlgorithmSeedVersions: false,
    writesAlgorithmSeedRecords: false,
    writesTasksOrBaselinesDirectly: false,
    writesMonthlyPlansDirectly: false,
    writesProgressFactsDirectly: false,
    reasons: uniqueReasons(input.reasons),
  }
}

function confidence(value: unknown): 'high' | 'medium' | 'low' {
  const normalized = normalizeText(value)
  return normalized === 'high' || normalized === 'low' ? normalized : 'medium'
}

function candidateToRecordRow(
  seedVersionId: string,
  candidate: ApprovedStandardWorkDurationSeedCandidate,
): StandardWorkDurationSeedRecordRow | { error: string } {
  const normalizedPayload = normalizeAlgorithmSeedRecordPayload('standard_work_duration', candidate.candidatePayload)
  const stableCode = getAlgorithmSeedStableCode('standard_work_duration', normalizedPayload)
  const validation = validateAlgorithmSeedRuntimePayload('standard_work_duration', normalizedPayload, {
    strict: true,
    stableCode,
  })
  if (!validation.ok) {
    return { error: `candidate_payload_invalid:${candidate.id}` }
  }

  return {
    id: uuidv4(),
    seed_version_id: seedVersionId,
    seed_type: 'standard_work_duration',
    stable_code: stableCode,
    rule_payload: validation.normalizedPayload,
    source_standard: nullableText(validation.normalizedPayload.sourceStandard),
    source_version: nullableText(validation.normalizedPayload.sourceVersion),
    source_clause_ref: nullableText(validation.normalizedPayload.sourceClauseRef),
    evidence_source_keys: getAlgorithmSeedEvidenceKeys(validation.normalizedPayload).map(normalizeText).filter(Boolean),
    confidence: confidence(validation.normalizedPayload.confidence),
    web_verified: validation.normalizedPayload.webVerified === true,
    review_needed: validation.normalizedPayload.reviewNeeded === true,
    status: isAlgorithmSeedPayloadActive('standard_work_duration', validation.normalizedPayload) ? 'active' : 'inactive',
  }
}

export async function publishStandardWorkDurationSeedVersion(
  input: PublishStandardWorkDurationSeedVersionInput,
): Promise<StandardWorkDurationSeedPublicationResult> {
  const executedAt = input.executedAt ?? new Date().toISOString()
  const seedVersionId = nullableText(input.readiness.seedVersionLineage.seedVersionId)
  const runtimePublicationKey = nullableText(input.readiness.seedVersionLineage.runtimePublicationKey)
  const expectedPublicationKey = publicationKeyForSeedVersion(seedVersionId)
  const rollbackTarget = nullableText(input.readiness.seedVersionLineage.rollbackTarget)
  const seedVersion = normalizeText(input.seedVersion)
  const approvedCandidateIds = new Set(input.readiness.seedVersionLineage.approvedCandidateIds.map(normalizeText).filter(Boolean))
  const approvedCandidates = input.approvedCandidates.filter((candidate) =>
    candidate.approvalStatus === 'approved'
      && approvedCandidateIds.has(normalizeText(candidate.id)))
  const baseReasons = [
    ...(input.readiness.status === 'standard_work_seed_publication_ready'
      ? []
      : input.readiness.missingReasons.length > 0 ? input.readiness.missingReasons : ['standard_work_seed_publication_ready_required']),
    ...(seedVersionId ? [] : ['seed_version_id_required']),
    ...(seedVersion ? [] : ['seed_version_required']),
    ...(runtimePublicationKey ? [] : ['runtime_publication_key_required']),
    ...(runtimePublicationKey === expectedPublicationKey ? [] : ['runtime_publication_key_must_match_seed_version_id']),
    ...(rollbackTarget ? [] : ['rollback_target_required']),
    ...(approvedCandidateIds.size > 0 && approvedCandidates.length === approvedCandidateIds.size ? [] : ['approved_candidate_review_required']),
  ]

  if (baseReasons.length > 0 || !seedVersionId || !runtimePublicationKey || !expectedPublicationKey || !seedVersion) {
    return blockedPublication({
      publicationKey: runtimePublicationKey,
      rollbackTarget,
      seedVersionId,
      reasons: baseReasons,
    })
  }

  const recordRows: StandardWorkDurationSeedRecordRow[] = []
  const recordErrors: string[] = []
  for (const candidate of approvedCandidates) {
    const row = candidateToRecordRow(seedVersionId, candidate)
    if ('error' in row) recordErrors.push(row.error)
    else recordRows.push(row)
  }

  if (recordErrors.length > 0 || recordRows.length === 0) {
    return blockedPublication({
      publicationKey: runtimePublicationKey,
      rollbackTarget,
      seedVersionId,
      reasons: recordRows.length === 0 ? [...recordErrors, 'approved_candidate_payload_required'] : recordErrors,
    })
  }

  await input.queryExec(
    `update public.algorithm_seed_versions
        set status = 'deprecated',
            is_current = false,
            updated_at = $1
      where seed_type = 'standard_work_duration'
        and is_current = true
        and id <> $2`,
    [executedAt, seedVersionId],
  )

  await input.queryExec(
    `insert into public.algorithm_seed_versions (
      id,
      seed_type,
      seed_version,
      seed_scope,
      source_standards,
      expected_counts,
      evidence_sources,
      validation_result,
      status,
      is_current,
      imported_by,
      published_by,
      imported_at,
      published_at,
      created_at,
      updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'active', true, $9, $9, $10, $10, $10, $10)
    on conflict (seed_type, seed_version) do update
      set source_standards = excluded.source_standards,
          expected_counts = excluded.expected_counts,
          evidence_sources = excluded.evidence_sources,
          validation_result = excluded.validation_result,
          status = 'active',
          is_current = true,
          published_by = excluded.published_by,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at`,
    [
      seedVersionId,
      'standard_work_duration',
      seedVersion,
      'standard_work_duration',
      ['enterprise_duration_replay'],
      { records: recordRows.length },
      input.readiness.seedVersionLineage.sourceSampleIds.map((id) => `duration_experience_samples:${id}`),
      {
        source: 'v1.4.22.5_standard_work_duration_seed_publication_writer',
        runtimePublicationKey,
        rollbackTarget,
        replayReportCode: input.readiness.seedVersionLineage.replayReportCode,
        governanceReportCode: input.readiness.seedVersionLineage.governanceReportCode,
        approvedCandidateIds: Array.from(approvedCandidateIds),
        liveLearningEvidence: input.readiness.liveLearningEvidence,
      },
      nullableText(input.publishedBy),
      executedAt,
    ],
  )

  await input.queryExec(
    'delete from public.algorithm_seed_records where seed_version_id = $1 and seed_type = $2',
    [seedVersionId, 'standard_work_duration'],
  )

  await input.queryExec(
    'insert into public.algorithm_seed_records (id, seed_version_id, seed_type, stable_code, rule_payload, source_standard, source_version, source_clause_ref, evidence_source_keys, confidence, web_verified, review_needed, status) values $1',
    [recordRows],
  )

  await input.queryExec(
    'insert into public.algorithm_seed_import_logs (id, seed_version_id, seed_type, import_source, expected_counts_snapshot, actual_counts_snapshot, validation_result, imported_by, imported_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [
      uuidv4(),
      seedVersionId,
      'standard_work_duration',
      'v14225_standard_work_duration_seed_publication',
      { approvedCandidateCount: approvedCandidateIds.size },
      { records: recordRows.length },
      {
        runtimePublicationKey,
        rollbackTarget,
        factMutationPolicy: 'fact_and_commitment_assets_locked',
        writesTasksOrBaselinesDirectly: false,
        writesMonthlyPlansDirectly: false,
        writesProgressFactsDirectly: false,
      },
      nullableText(input.publishedBy),
      executedAt,
    ],
  )

  clearAlgorithmSeedResolverCache('standard_work_duration')

  return {
    status: 'standard_work_duration_seed_published',
    publicationKey: runtimePublicationKey,
    rollbackTarget,
    seedVersionId,
    recordCount: recordRows.length,
    writesAlgorithmSeedVersions: true,
    writesAlgorithmSeedRecords: true,
    writesTasksOrBaselinesDirectly: false,
    writesMonthlyPlansDirectly: false,
    writesProgressFactsDirectly: false,
    reasons: [],
  }
}

function blockedRollback(input: {
  sourcePublicationKey: string | null
  rollbackTarget: string | null
  reasons: string[]
}): StandardWorkDurationSeedRollbackResult {
  return {
    status: 'rollback_blocked',
    sourcePublicationKey: input.sourcePublicationKey,
    rollbackTarget: input.rollbackTarget,
    restoredRuntimePolicy: 'previous_standard_work_duration_seed_version_restored',
    writesAlgorithmSeedVersions: false,
    writesTasksOrBaselinesDirectly: false,
    writesMonthlyPlansDirectly: false,
    writesProgressFactsDirectly: false,
    reasons: uniqueReasons(input.reasons),
  }
}

export async function rollbackStandardWorkDurationSeedVersion(
  input: RollbackStandardWorkDurationSeedVersionInput,
): Promise<StandardWorkDurationSeedRollbackResult> {
  const executedAt = input.executedAt ?? new Date().toISOString()
  const sourcePublicationKey = nullableText(input.sourcePublicationKey)
  const rollbackTarget = nullableText(input.rollbackTarget)
  const fromVersionId = parseAlgorithmSeedPublicationKey(sourcePublicationKey)
  const toVersionId = parseAlgorithmSeedPublicationKey(rollbackTarget)
  const reasons = [
    ...(sourcePublicationKey ? [] : ['source_publication_key_required']),
    ...(rollbackTarget ? [] : ['rollback_target_required']),
    ...(fromVersionId ? [] : ['source_publication_key_must_be_algorithm_seed_version']),
    ...(toVersionId ? [] : ['rollback_target_must_be_algorithm_seed_version']),
    ...(fromVersionId && toVersionId && fromVersionId !== toVersionId ? [] : ['rollback_target_must_differ_from_source']),
  ]

  if (reasons.length > 0 || !fromVersionId || !toVersionId) {
    return blockedRollback({ sourcePublicationKey, rollbackTarget, reasons })
  }

  await input.queryExec(
    `update public.algorithm_seed_versions
        set status = 'deprecated',
            is_current = false,
            updated_at = $1
      where id = $2
        and seed_type = 'standard_work_duration'`,
    [executedAt, fromVersionId],
  )

  await input.queryExec(
    `update public.algorithm_seed_versions
        set status = 'active',
            is_current = true,
            published_by = $1,
            published_at = $2,
            updated_at = $2
      where id = $3
        and seed_type = 'standard_work_duration'`,
    [nullableText(input.userId), executedAt, toVersionId],
  )

  await input.queryExec(
    'insert into public.algorithm_seed_import_logs (id, seed_version_id, seed_type, import_source, expected_counts_snapshot, actual_counts_snapshot, validation_result, imported_by, imported_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [
      uuidv4(),
      toVersionId,
      'standard_work_duration',
      'v14225_standard_work_duration_seed_rollback',
      {},
      {},
      {
        reason: nullableText(input.reason) ?? 'standard_work_duration_seed_rollback',
        sourcePublicationKey,
        rollbackTarget,
        rolledBackAt: executedAt,
        restoredRuntimePolicy: 'previous_standard_work_duration_seed_version_restored',
      },
      nullableText(input.userId),
      executedAt,
    ],
  )

  clearAlgorithmSeedResolverCache('standard_work_duration')

  return {
    status: 'standard_work_duration_seed_rollback_executed',
    sourcePublicationKey,
    rollbackTarget,
    restoredRuntimePolicy: 'previous_standard_work_duration_seed_version_restored',
    writesAlgorithmSeedVersions: true,
    writesTasksOrBaselinesDirectly: false,
    writesMonthlyPlansDirectly: false,
    writesProgressFactsDirectly: false,
    reasons: [],
  }
}
