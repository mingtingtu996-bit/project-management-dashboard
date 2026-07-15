import { clearAlgorithmSeedResolverCache } from './algorithmSeedResolver.js'
import { validateAlgorithmSeedRuntimePayload } from './algorithmSeedValidationService.js'
import { sanitizeLegacyScopeObjectFields } from './legacyScopeObjectSanitizer.js'

export type AlgorithmSeedOverrideReleaseQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type AlgorithmSeedOverrideReleaseExecutionInput = {
  sourcePublicationKey: string
  companyId?: string | null
  projectId?: string | null
  publishedBy?: string | null
  evidenceToken?: string | null
  releaseRecordTarget?: string | null
  rollbackTarget?: string | null
  consumerVerificationRefs?: string[]
  impactMonitoringRefs?: string[]
  rollbackWriterRefs?: string[]
  queryExec: AlgorithmSeedOverrideReleaseQueryExec
  executedAt?: string
}

export type AlgorithmSeedOverrideReleaseExecutionResult = {
  status: 'algorithm_seed_override_published' | 'blocked'
  seedType: 'standard_work_duration' | null
  stableCode: string | null
  scopeType: 'project' | 'company' | null
  projectId: string | null
  companyId: string | null
  sourceCandidateId: string | null
  overrideId: string | null
  writesSeedOverrideRuntime: boolean
  writesSystemSeedRuntimeDirectly: false
  writesTasksOrBaselinesDirectly: false
  reasons: string[]
}

type AlgorithmSeedUpgradeCandidateRow = {
  id?: unknown
  seed_type?: unknown
  seedType?: unknown
  stable_code?: unknown
  stableCode?: unknown
  status?: unknown
  project_id?: unknown
  projectId?: unknown
  company_id?: unknown
  companyId?: unknown
  candidate_payload?: unknown
  candidatePayload?: unknown
  auto_governance_result?: unknown
  autoGovernanceResult?: unknown
}

type AlgorithmSeedOverrideRow = {
  id?: unknown
}

const SOURCE_PUBLICATION_PREFIX = 'algorithm_seed_upgrade_candidates:'
const SUPPORTED_SEED_TYPE = 'standard_work_duration' as const

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  const valueText = normalizeText(value)
  return valueText || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeRefs(values: string[] | undefined) {
  return Array.from(new Set((values ?? []).map(normalizeText).filter(Boolean)))
}

function uniqueReasons(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function parseCandidateId(value: unknown) {
  const sourcePublicationKey = normalizeText(value)
  if (!sourcePublicationKey.startsWith(SOURCE_PUBLICATION_PREFIX)) return null
  return nullableText(sourcePublicationKey.slice(SOURCE_PUBLICATION_PREFIX.length))
}

function rowField(
  row: AlgorithmSeedUpgradeCandidateRow,
  snakeKey: keyof AlgorithmSeedUpgradeCandidateRow,
  camelKey: keyof AlgorithmSeedUpgradeCandidateRow,
) {
  return row[snakeKey] ?? row[camelKey]
}

function blockedResult(input: {
  candidateId?: string | null
  stableCode?: string | null
  scopeType?: 'project' | 'company' | null
  projectId?: string | null
  companyId?: string | null
  reasons: Array<string | null>
}): AlgorithmSeedOverrideReleaseExecutionResult {
  return {
    status: 'blocked',
    seedType: null,
    stableCode: input.stableCode ?? null,
    scopeType: input.scopeType ?? null,
    projectId: input.projectId ?? null,
    companyId: input.companyId ?? null,
    sourceCandidateId: input.candidateId ?? null,
    overrideId: null,
    writesSeedOverrideRuntime: false,
    writesSystemSeedRuntimeDirectly: false,
    writesTasksOrBaselinesDirectly: false,
    reasons: uniqueReasons(input.reasons),
  }
}

export async function publishApprovedAlgorithmSeedOverride(
  input: AlgorithmSeedOverrideReleaseExecutionInput,
): Promise<AlgorithmSeedOverrideReleaseExecutionResult> {
  const candidateId = parseCandidateId(input.sourcePublicationKey)
  const inputCompanyId = nullableText(input.companyId)
  const inputProjectId = nullableText(input.projectId)
  const publishedBy = nullableText(input.publishedBy)
  const evidenceToken = nullableText(input.evidenceToken)
  const releaseRecordTarget = nullableText(input.releaseRecordTarget)
  const rollbackTarget = nullableText(input.rollbackTarget)
  const consumerVerificationRefs = normalizeRefs(input.consumerVerificationRefs)
  const impactMonitoringRefs = normalizeRefs(input.impactMonitoringRefs)
  const rollbackWriterRefs = normalizeRefs(input.rollbackWriterRefs)
  const inputReasons = uniqueReasons([
    candidateId ? null : 'algorithm_seed_candidate_publication_key_required',
    inputCompanyId ? null : 'company_scope_required',
    publishedBy ? null : 'published_by_required',
    evidenceToken ? null : 'evidence_token_required',
    releaseRecordTarget ? null : 'release_record_target_required',
    rollbackTarget ? null : 'rollback_target_required',
    consumerVerificationRefs.length > 0 ? null : 'consumer_verification_required',
    impactMonitoringRefs.length > 0 ? null : 'impact_monitoring_required',
    rollbackWriterRefs.length > 0 ? null : 'rollback_writer_required',
  ])
  if (inputReasons.length > 0 || !candidateId || !inputCompanyId || !publishedBy) {
    return blockedResult({
      candidateId,
      projectId: inputProjectId,
      companyId: inputCompanyId,
      reasons: inputReasons,
    })
  }

  const candidates = await input.queryExec<AlgorithmSeedUpgradeCandidateRow>(
    `select id,
            seed_type,
            stable_code,
            status,
            project_id,
            company_id,
            candidate_payload,
            auto_governance_result
       from public.algorithm_seed_upgrade_candidates
      where id = $1::uuid
      limit 1`,
    [candidateId],
  )
  const candidate = candidates[0]
  if (!candidate) {
    return blockedResult({
      candidateId,
      projectId: inputProjectId,
      companyId: inputCompanyId,
      reasons: ['algorithm_seed_candidate_not_found'],
    })
  }

  const seedType = normalizeText(rowField(candidate, 'seed_type', 'seedType'))
  const stableCode = normalizeText(rowField(candidate, 'stable_code', 'stableCode'))
  const candidateStatus = normalizeText(candidate.status)
  const candidateProjectId = nullableText(rowField(candidate, 'project_id', 'projectId'))
  const candidateCompanyId = nullableText(rowField(candidate, 'company_id', 'companyId'))
  const scopeType = candidateProjectId ? 'project' as const : 'company' as const
  const candidateReasons = uniqueReasons([
    seedType === SUPPORTED_SEED_TYPE ? null : 'standard_work_duration_candidate_required',
    candidateStatus === 'auto_published' ? null : 'algorithm_seed_candidate_auto_published_status_required',
    stableCode ? null : 'algorithm_seed_candidate_stable_code_required',
    candidateCompanyId === inputCompanyId ? null : 'algorithm_seed_candidate_company_scope_mismatch',
    scopeType === 'project' && candidateProjectId !== inputProjectId
      ? 'algorithm_seed_candidate_project_scope_mismatch'
      : null,
    scopeType === 'company' && inputProjectId
      ? 'company_seed_override_must_not_claim_project_scope'
      : null,
  ])
  if (candidateReasons.length > 0) {
    return blockedResult({
      candidateId,
      stableCode,
      scopeType,
      projectId: candidateProjectId,
      companyId: candidateCompanyId,
      reasons: candidateReasons,
    })
  }

  const candidatePayload = readRecord(rowField(candidate, 'candidate_payload', 'candidatePayload'))
  const validation = validateAlgorithmSeedRuntimePayload(SUPPORTED_SEED_TYPE, candidatePayload, {
    strict: true,
    stableCode,
  })
  if (!validation.ok) {
    return blockedResult({
      candidateId,
      stableCode,
      scopeType,
      projectId: candidateProjectId,
      companyId: candidateCompanyId,
      reasons: [
        'algorithm_seed_candidate_payload_invalid',
        ...validation.issues.map((issue) => `algorithm_seed_candidate_payload_invalid:${issue.code}`),
      ],
    })
  }

  const overridePayload = sanitizeLegacyScopeObjectFields(validation.normalizedPayload).payload
  const executedAt = input.executedAt ?? new Date().toISOString()
  const releaseExecution = {
    status: 'algorithm_seed_override_published',
    sourcePublicationKey: input.sourcePublicationKey,
    sourceCandidateId: candidateId,
    evidenceToken,
    releaseRecordTarget,
    rollbackTarget,
    consumerVerificationRefs,
    impactMonitoringRefs,
    rollbackWriterRefs,
    publishedBy,
    publishedAt: executedAt,
    mutationBoundary: {
      writesSeedOverrideRuntime: true,
      writesSystemSeedRuntimeDirectly: false,
      writesTasksOrBaselinesDirectly: false,
    },
  }
  const autoGovernanceResult = {
    ...readRecord(rowField(candidate, 'auto_governance_result', 'autoGovernanceResult')),
    releaseExecution,
  }
  const overrideRows = await input.queryExec<AlgorithmSeedOverrideRow>(
    `with deactivated as (
       update public.algorithm_seed_overrides
          set status = 'inactive',
              updated_at = $1::timestamptz
        where seed_type = $2
          and stable_code = $3
          and scope_type = $4
          and status = 'active'
          and (($4 = 'project' and project_id = $5::uuid)
            or ($4 = 'company' and company_id = $6::uuid))
       returning id
     ), inserted as (
       insert into public.algorithm_seed_overrides (
         seed_type,
         stable_code,
         scope_type,
         project_id,
         company_id,
         override_payload,
         source_candidate_id,
         status,
         created_by,
         published_by,
         auto_governance_result,
         created_at,
         updated_at
       ) values (
         $2,
         $3,
         $4,
         $5::uuid,
         $6::uuid,
         $7::jsonb,
         $8::uuid,
         'active',
         $9::uuid,
         $9::uuid,
         $10::jsonb,
         $1::timestamptz,
         $1::timestamptz
       )
       returning id, seed_type, stable_code, scope_type, project_id, company_id, status
     )
     select * from inserted`,
    [
      executedAt,
      SUPPORTED_SEED_TYPE,
      validation.stableCode,
      scopeType,
      candidateProjectId,
      candidateCompanyId,
      overridePayload,
      candidateId,
      publishedBy,
      autoGovernanceResult,
    ],
  )
  const overrideId = nullableText(overrideRows[0]?.id)
  if (!overrideId) {
    return blockedResult({
      candidateId,
      stableCode: validation.stableCode,
      scopeType,
      projectId: candidateProjectId,
      companyId: candidateCompanyId,
      reasons: ['algorithm_seed_override_insert_result_required'],
    })
  }

  clearAlgorithmSeedResolverCache(SUPPORTED_SEED_TYPE)
  return {
    status: 'algorithm_seed_override_published',
    seedType: SUPPORTED_SEED_TYPE,
    stableCode: validation.stableCode,
    scopeType,
    projectId: candidateProjectId,
    companyId: candidateCompanyId,
    sourceCandidateId: candidateId,
    overrideId,
    writesSeedOverrideRuntime: true,
    writesSystemSeedRuntimeDirectly: false,
    writesTasksOrBaselinesDirectly: false,
    reasons: [],
  }
}
