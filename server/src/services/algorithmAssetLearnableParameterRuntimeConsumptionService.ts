import { query as rawQuery } from '../database.js'
import {
  evaluateAlgorithmAssetParameterRuntimeUse,
  getAlgorithmAssetLearnableParameter,
  type AlgorithmAssetParameterRuntimeUseEvidence,
  type AlgorithmAssetParameterScopePolicy,
} from './algorithmAssetLearnableParameterRegistryService.js'

export type AlgorithmAssetLearnableParameterRuntimeConsumptionQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type AlgorithmAssetLearnableParameterRuntimeConsumptionStatus =
  | 'runtime_parameter_consumable'
  | 'runtime_parameter_not_found'
  | 'runtime_parameter_blocked'

export type AlgorithmAssetLearnableParameterRuntimeConsumptionMode = 'stable' | 'canary'

export type AlgorithmAssetLearnableParameterCanaryRuntimeBoundary = {
  consumerKey?: string | null
  scopeBoundary?: string | null
  stopConditionKeys?: string[] | null
  monitoringWindowHours?: number | null
  trafficSubjectKey?: string | null
}

export type AlgorithmAssetLearnableParameterRuntimeConsumptionInput = {
  parameterKey: string
  companyId?: string | null
  projectId?: string | null
  allowSystemScope?: boolean
  consumptionMode?: AlgorithmAssetLearnableParameterRuntimeConsumptionMode
  canaryRuntimeBoundary?: AlgorithmAssetLearnableParameterCanaryRuntimeBoundary | null
  queryExec?: AlgorithmAssetLearnableParameterRuntimeConsumptionQueryExec
}

export type AlgorithmAssetLearnableParameterRuntimeConsumptionResult = {
  status: AlgorithmAssetLearnableParameterRuntimeConsumptionStatus
  runtimeConsumable: boolean
  parameterKey: string
  runtimeValue: number | null
  consumptionMode: AlgorithmAssetLearnableParameterRuntimeConsumptionMode
  publicationKey: string | null
  publicationStatus: string | null
  scopeLevel: string | null
  companyId: string | null
  projectId: string | null
  rollbackTarget: string | null
  reasons: string[]
  writesSeedRuntimeDirectly: false
}

type RuntimePublicationRow = {
  publication_key?: unknown
  publicationKey?: unknown
  parameter_key?: unknown
  parameterKey?: unknown
  scope_level?: unknown
  scopeLevel?: unknown
  company_id?: unknown
  companyId?: unknown
  project_id?: unknown
  projectId?: unknown
  publication_status?: unknown
  publicationStatus?: unknown
  parameter_value?: unknown
  parameterValue?: unknown
  previous_value?: unknown
  previousValue?: unknown
  rollback_target?: unknown
  rollbackTarget?: unknown
  release_package?: unknown
  releasePackage?: unknown
  writes_seed_runtime_directly?: unknown
  writesSeedRuntimeDirectly?: unknown
  target_runtime_table?: unknown
  targetRuntimeTable?: unknown
}

const PARAMETER_RUNTIME_PUBLICATION_TABLE = 'algorithm_learnable_parameter_runtime_publications'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readBoolean(value: unknown) {
  if (value === true || value === false) return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return Boolean(value)
}

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function readNumber(value: unknown) {
  const raw = readRecord(value).value ?? value
  const number = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(number) ? number : null
}

function readScope(value: unknown): AlgorithmAssetParameterScopePolicy | null {
  const scope = normalizeText(value)
  if (
    scope === 'company'
    || scope === 'project'
    || scope === 'system'
    || scope === 'segment_baseline'
    || scope === 'industry_baseline'
  ) {
    return scope
  }
  return null
}

function normalizeConsumptionMode(value: unknown): AlgorithmAssetLearnableParameterRuntimeConsumptionMode {
  return value === 'canary' ? 'canary' : 'stable'
}

function publicationStatusForMode(mode: AlgorithmAssetLearnableParameterRuntimeConsumptionMode) {
  return mode === 'canary' ? 'canary' : 'published'
}

function publicationStatusReason(input: {
  publicationStatus: string | null
  expectedPublicationStatus: string
  consumptionMode: AlgorithmAssetLearnableParameterRuntimeConsumptionMode
}) {
  if (input.publicationStatus === input.expectedPublicationStatus) return null
  if (input.publicationStatus === 'canary' && input.consumptionMode === 'stable') {
    return 'canary_publication_requires_canary_consumption_mode'
  }
  return 'publication_status_not_runtime_consumable'
}

function canaryBoundaryReasons(
  mode: AlgorithmAssetLearnableParameterRuntimeConsumptionMode,
  boundary: AlgorithmAssetLearnableParameterCanaryRuntimeBoundary | null | undefined,
) {
  if (mode !== 'canary') return []
  const stopConditionKeys = Array.isArray(boundary?.stopConditionKeys)
    ? boundary.stopConditionKeys.map(normalizeText).filter(Boolean)
    : []
  const monitoringWindowHours = Number(boundary?.monitoringWindowHours)
  return [
    ...(normalizeText(boundary?.consumerKey) ? [] : ['canary_runtime_consumer_key_required']),
    ...(normalizeText(boundary?.scopeBoundary) ? [] : ['canary_runtime_scope_boundary_required']),
    ...(stopConditionKeys.length > 0 ? [] : ['canary_runtime_stop_conditions_required']),
    ...(Number.isFinite(monitoringWindowHours) && monitoringWindowHours > 0
      ? []
      : ['canary_runtime_monitoring_window_required']),
  ]
}

function deterministicTrafficBucket(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

function publishedCanaryBoundaryReasons(
  mode: AlgorithmAssetLearnableParameterRuntimeConsumptionMode,
  row: RuntimePublicationRow,
  boundary: AlgorithmAssetLearnableParameterCanaryRuntimeBoundary | null | undefined,
) {
  if (mode !== 'canary') return []
  const payload = candidatePayloadFor(row)
  const publishedBoundary = readRecord(payload.runtimeBoundary ?? payload.runtime_boundary)
  if (Object.keys(publishedBoundary).length === 0) return []
  const reasons: string[] = []
  const consumerKey = normalizeText(boundary?.consumerKey)
  const allowedConsumerKeys = readStringList(
    publishedBoundary.allowedConsumerKeys ?? publishedBoundary.allowed_consumer_keys,
  )
  if (allowedConsumerKeys.length > 0 && !allowedConsumerKeys.includes(consumerKey)) {
    reasons.push('canary_runtime_consumer_not_allowed_by_publication')
  }
  const expectedScope = normalizeText(publishedBoundary.scopeBoundary ?? publishedBoundary.scope_boundary)
  if (expectedScope && expectedScope !== normalizeText(boundary?.scopeBoundary)) {
    reasons.push('canary_runtime_scope_boundary_mismatch')
  }
  const trafficPercent = Number(publishedBoundary.trafficPercent ?? publishedBoundary.traffic_percent)
  const monitoringConsumer = consumerKey === 'durationContextPolicyRuntimePublicationBridge.monitor_and_promote'
  if (Number.isFinite(trafficPercent) && trafficPercent > 0 && trafficPercent < 100 && !monitoringConsumer) {
    const trafficSubjectKey = normalizeText(boundary?.trafficSubjectKey)
    if (!trafficSubjectKey) {
      reasons.push('canary_runtime_traffic_subject_key_required')
    } else {
      const publicationKey = normalizeText(rowField(row, 'publication_key', 'publicationKey'))
      const bucket = deterministicTrafficBucket(`${publicationKey}:${trafficSubjectKey}`)
      if (bucket >= trafficPercent) reasons.push('canary_subject_outside_traffic_allocation')
    }
  }
  return reasons
}

function rowField(row: RuntimePublicationRow, snakeKey: keyof RuntimePublicationRow, camelKey: keyof RuntimePublicationRow) {
  return row[snakeKey] ?? row[camelKey]
}

function releasePackageFor(row: RuntimePublicationRow) {
  return readRecord(rowField(row, 'release_package', 'releasePackage'))
}

function candidatePayloadFor(row: RuntimePublicationRow) {
  const releasePackage = releasePackageFor(row)
  return readRecord(releasePackage.candidatePayload ?? releasePackage.candidate_payload)
}

function evidenceFor(row: RuntimePublicationRow, rollbackTarget: string | null): AlgorithmAssetParameterRuntimeUseEvidence {
  const payload = candidatePayloadFor(row)
  const evidence = readRecord(payload.evidence)
  return {
    sampleCount: readNumber(evidence.sampleCount ?? evidence.sample_count),
    replayPassed: evidence.replayPassed === true || evidence.replay_passed === true,
    conflictFree: evidence.conflictFree === true || evidence.conflict_free === true,
    rollbackTarget: nullableText(evidence.rollbackTarget ?? evidence.rollback_target) ?? rollbackTarget,
    crossCompanyReplayPassed: evidence.crossCompanyReplayPassed === true || evidence.cross_company_replay_passed === true,
    maeImprovement: readNumber(evidence.maeImprovement ?? evidence.mae_improvement),
    overcompensationRate: readNumber(evidence.overcompensationRate ?? evidence.overcompensation_rate),
  }
}

function blockedResult(input: {
  parameterKey: string
  consumptionMode?: AlgorithmAssetLearnableParameterRuntimeConsumptionMode
  row?: RuntimePublicationRow | null
  reasons: string[]
}): AlgorithmAssetLearnableParameterRuntimeConsumptionResult {
  const row = input.row ?? null
  return {
    status: row ? 'runtime_parameter_blocked' : 'runtime_parameter_not_found',
    runtimeConsumable: false,
    parameterKey: input.parameterKey,
    runtimeValue: null,
    consumptionMode: input.consumptionMode ?? 'stable',
    publicationKey: row ? nullableText(rowField(row, 'publication_key', 'publicationKey')) : null,
    publicationStatus: row ? nullableText(rowField(row, 'publication_status', 'publicationStatus')) : null,
    scopeLevel: row ? nullableText(rowField(row, 'scope_level', 'scopeLevel')) : null,
    companyId: row ? nullableText(rowField(row, 'company_id', 'companyId')) : null,
    projectId: row ? nullableText(rowField(row, 'project_id', 'projectId')) : null,
    rollbackTarget: row ? nullableText(rowField(row, 'rollback_target', 'rollbackTarget')) : null,
    reasons: Array.from(new Set(input.reasons)),
    writesSeedRuntimeDirectly: false,
  }
}

async function loadRuntimePublicationRows(
  input: Required<Pick<AlgorithmAssetLearnableParameterRuntimeConsumptionInput, 'parameterKey' | 'allowSystemScope'>> & {
    publicationStatus: 'published' | 'canary'
  },
  options: Pick<AlgorithmAssetLearnableParameterRuntimeConsumptionInput, 'companyId' | 'projectId' | 'queryExec'>,
) {
  const params = [
    input.parameterKey,
    options.companyId ?? null,
    options.projectId ?? null,
    input.allowSystemScope,
    input.publicationStatus,
  ]
  if (options.queryExec) {
    return options.queryExec<RuntimePublicationRow>(`
      select
        publication_key,
        parameter_key,
        owner_algorithm,
        scope_level,
        company_id,
        project_id,
        target_surface,
        publication_status,
        parameter_value,
        previous_value,
        rollback_target,
        release_package,
        writes_seed_runtime_directly,
        target_runtime_table,
        published_at,
        rolled_back_at
      from public.algorithm_learnable_parameter_runtime_publications
      where parameter_key = $1
        and publication_status = $5
        and writes_seed_runtime_directly = false
        and target_runtime_table = 'algorithm_learnable_parameter_runtime_publications'
        and (
          ($2::text is not null and $3::text is not null and scope_level = 'project' and company_id::text = $2 and project_id::text = $3)
          or ($2::text is not null and scope_level = 'company' and company_id::text = $2 and project_id is null)
          or ($4::boolean = true and scope_level = 'system' and company_id is null and project_id is null)
        )
      order by
        case
          when $3::text is not null and scope_level = 'project' then 0
          when $2::text is not null and scope_level = 'company' then 1
          when scope_level = 'system' then 2
          else 9
        end,
        published_at desc
      limit 5
    `, params)
  }

  const result = await rawQuery(`
    select
      publication_key,
      parameter_key,
      owner_algorithm,
      scope_level,
      company_id,
      project_id,
      target_surface,
      publication_status,
      parameter_value,
      previous_value,
      rollback_target,
      release_package,
      writes_seed_runtime_directly,
      target_runtime_table,
      published_at,
      rolled_back_at
    from public.algorithm_learnable_parameter_runtime_publications
    where parameter_key = $1
      and publication_status = $5
      and writes_seed_runtime_directly = false
      and target_runtime_table = 'algorithm_learnable_parameter_runtime_publications'
      and (
        ($2::text is not null and $3::text is not null and scope_level = 'project' and company_id::text = $2 and project_id::text = $3)
        or ($2::text is not null and scope_level = 'company' and company_id::text = $2 and project_id is null)
        or ($4::boolean = true and scope_level = 'system' and company_id is null and project_id is null)
      )
    order by
      case
        when $3::text is not null and scope_level = 'project' then 0
        when $2::text is not null and scope_level = 'company' then 1
        when scope_level = 'system' then 2
        else 9
      end,
      published_at desc
    limit 5
  `, params)
  return result.rows as RuntimePublicationRow[]
}

export async function loadAlgorithmAssetLearnableParameterRuntimeValue(
  input: AlgorithmAssetLearnableParameterRuntimeConsumptionInput,
): Promise<AlgorithmAssetLearnableParameterRuntimeConsumptionResult> {
  const parameterKey = normalizeText(input.parameterKey)
  if (!parameterKey) {
    return blockedResult({
      parameterKey,
      reasons: ['parameter_key_required'],
    })
  }

  const consumptionMode = normalizeConsumptionMode(input.consumptionMode)
  const expectedPublicationStatus = publicationStatusForMode(consumptionMode)

  const rows = await loadRuntimePublicationRows(
    {
      parameterKey,
      allowSystemScope: input.allowSystemScope === true,
      publicationStatus: expectedPublicationStatus,
    },
    input,
  )

  const row = rows[0] ?? null
  if (!row) {
    return blockedResult({
      parameterKey,
      consumptionMode,
      reasons: ['runtime_parameter_publication_not_found'],
    })
  }

  const publicationStatus = nullableText(rowField(row, 'publication_status', 'publicationStatus'))
  const writesSeedRuntimeDirectly = readBoolean(rowField(row, 'writes_seed_runtime_directly', 'writesSeedRuntimeDirectly'))
  const targetRuntimeTable = normalizeText(rowField(row, 'target_runtime_table', 'targetRuntimeTable')) || PARAMETER_RUNTIME_PUBLICATION_TABLE
  const runtimeValue = readNumber(rowField(row, 'parameter_value', 'parameterValue'))
  const currentValue = readNumber(rowField(row, 'previous_value', 'previousValue'))
  const scopeLevel = readScope(rowField(row, 'scope_level', 'scopeLevel'))
  const rollbackTarget = nullableText(rowField(row, 'rollback_target', 'rollbackTarget'))
  const publicationStatusBlockReason = publicationStatusReason({
    publicationStatus,
    expectedPublicationStatus,
    consumptionMode,
  })
  const reasons = [
    ...(publicationStatusBlockReason ? [publicationStatusBlockReason] : []),
    ...canaryBoundaryReasons(consumptionMode, input.canaryRuntimeBoundary),
    ...publishedCanaryBoundaryReasons(consumptionMode, row, input.canaryRuntimeBoundary),
    ...(writesSeedRuntimeDirectly ? ['parameter_publication_must_not_write_seed_runtime'] : []),
    ...(targetRuntimeTable === PARAMETER_RUNTIME_PUBLICATION_TABLE ? [] : ['parameter_publication_target_runtime_table_mismatch']),
    ...(runtimeValue === null ? ['numeric_parameter_value_required'] : []),
    ...(scopeLevel ? [] : ['publication_scope_level_required']),
    ...(rollbackTarget ? [] : ['rollback_target_required']),
  ]

  const parameter = getAlgorithmAssetLearnableParameter(parameterKey)
  const decision = evaluateAlgorithmAssetParameterRuntimeUse({
    parameterKey,
    currentValue: currentValue ?? (typeof parameter?.currentValue === 'number' ? parameter.currentValue : null),
    proposedValue: runtimeValue,
    scopeType: scopeLevel,
    companyId: nullableText(rowField(row, 'company_id', 'companyId')),
    projectId: nullableText(rowField(row, 'project_id', 'projectId')),
    evidence: evidenceFor(row, rollbackTarget),
  })
  reasons.push(...decision.reasons)

  if (reasons.length > 0 || !decision.runtimeConsumable || runtimeValue === null) {
    return blockedResult({
      parameterKey,
      consumptionMode,
      row,
      reasons: reasons.length > 0 ? reasons : ['parameter_runtime_decision_blocks_consumption'],
    })
  }

  return {
    status: 'runtime_parameter_consumable',
    runtimeConsumable: true,
    parameterKey,
    runtimeValue,
    consumptionMode,
    publicationKey: nullableText(rowField(row, 'publication_key', 'publicationKey')),
    publicationStatus,
    scopeLevel,
    companyId: nullableText(rowField(row, 'company_id', 'companyId')),
    projectId: nullableText(rowField(row, 'project_id', 'projectId')),
    rollbackTarget,
    reasons: [],
    writesSeedRuntimeDirectly: false,
  }
}
