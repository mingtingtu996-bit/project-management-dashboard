import type {
  AlgorithmAssetReleaseExitResult,
  AlgorithmAssetReleasePackage,
} from './algorithmAssetReleaseExitService.js'

export type AlgorithmAssetLearnableParameterReleaseExecutionQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type AlgorithmAssetLearnableParameterPublicationStatus = 'published' | 'canary'

export type AlgorithmAssetLearnableParameterRuntimePublication = {
  publicationKey: string
  eventKey: string
  assetKey: string
  parameterKey: string
  ownerAlgorithm: string | null
  scopeType: AlgorithmAssetReleasePackage['scopeType']
  companyId: string | null
  projectId: string | null
  targetSurface: AlgorithmAssetReleasePackage['targetSurface']
  publicationStatus: AlgorithmAssetLearnableParameterPublicationStatus
  parameterValue: unknown
  previousValue: unknown
  rollbackTarget: string
  impactMonitoring: AlgorithmAssetLearnableParameterImpactMonitoring
}

export type AlgorithmAssetLearnableParameterImpactMonitoring = {
  status: 'monitoring_armed'
  monitoredAssetCount: number
  monitoringWindowHours: number
  executedAt: string
}

export type AlgorithmAssetLearnableParameterPublicationResult = {
  status: 'runtime_parameter_published' | 'runtime_parameter_canary_published' | 'blocked'
  canPersist: boolean
  writesParameterRuntime: boolean
  writesSeedRuntimeDirectly: false
  publicationStatus: AlgorithmAssetLearnableParameterPublicationStatus | null
  publicationKey: string | null
  rollbackTarget: string | null
  reasons: string[]
  runtimePublication: AlgorithmAssetLearnableParameterRuntimePublication | null
}

export type PersistAlgorithmAssetLearnableParameterRuntimePublicationInput = {
  releaseExit: AlgorithmAssetReleaseExitResult
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  executedAt?: string
  idempotencyKey?: string | null
  impactMonitoring?: {
    monitoredAssetCount?: number
    monitoringWindowHours?: number
  }
}

export type ExecuteAlgorithmAssetLearnableParameterRuntimeRollbackInput = {
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  sourcePublicationKey: string
  rollbackTarget: string
  reason?: string
  executedAt?: string
  idempotencyKey?: string | null
}

export type AlgorithmAssetLearnableParameterRuntimeRollbackResult = {
  status: 'rollback_executed' | 'rollback_blocked'
  sourcePublicationKey: string
  rollbackTarget: string | null
  restoredRuntimePolicy: 'previous_parameter_value_retained'
  writesParameterRuntime: boolean
  writesSeedRuntimeDirectly: false
  reasons: string[]
}

export type RecordAlgorithmAssetLearnableParameterImpactMonitoringInput = {
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  sourcePublicationKey: string
  monitoredAssetCount: number
  monitoringWindowHours?: number
  metrics?: Record<string, unknown>
  thresholdViolations?: string[]
  executedAt?: string
  idempotencyKey?: string | null
}

export type AlgorithmAssetLearnableParameterImpactMonitoringResult = {
  status: 'monitoring_passed' | 'monitoring_failed'
  sourcePublicationKey: string
  monitoredAssetCount: number
  monitoringWindowHours: number
  thresholdViolations: string[]
  rollbackRecommended: boolean
  writesParameterRuntime: false
  writesSeedRuntimeDirectly: false
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function buildBlockedResult(releaseExit: AlgorithmAssetReleaseExitResult): AlgorithmAssetLearnableParameterPublicationResult {
  const reasons = releaseExit.releasePackage
    ? releaseExit.reasons
    : ['release_exit_package_required', ...releaseExit.reasons]
  return {
    status: 'blocked',
    canPersist: false,
    writesParameterRuntime: false,
    writesSeedRuntimeDirectly: false,
    publicationStatus: null,
    publicationKey: null,
    rollbackTarget: null,
    reasons: reasons.length > 0 ? Array.from(new Set(reasons)) : ['release_exit_package_required'],
    runtimePublication: null,
  }
}

function publicationStatusFor(releaseExit: AlgorithmAssetReleaseExitResult): AlgorithmAssetLearnableParameterPublicationStatus | null {
  if (releaseExit.status === 'release_package_ready') return 'published'
  if (releaseExit.status === 'canary_package_ready') return 'canary'
  return null
}

function publicationKeyFor(pkg: AlgorithmAssetReleasePackage) {
  return [
    'learnable-parameter-runtime',
    pkg.eventKey,
    pkg.targetSurface,
  ].join(':')
}

function buildImpactMonitoring(
  executedAt: string,
  options: PersistAlgorithmAssetLearnableParameterRuntimePublicationInput['impactMonitoring'],
): AlgorithmAssetLearnableParameterImpactMonitoring {
  return {
    status: 'monitoring_armed',
    monitoredAssetCount: options?.monitoredAssetCount ?? 0,
    monitoringWindowHours: options?.monitoringWindowHours ?? 72,
    executedAt,
  }
}

function buildRuntimePublication(
  pkg: AlgorithmAssetReleasePackage,
  publicationStatus: AlgorithmAssetLearnableParameterPublicationStatus,
  executedAt: string,
  options: PersistAlgorithmAssetLearnableParameterRuntimePublicationInput['impactMonitoring'],
): AlgorithmAssetLearnableParameterRuntimePublication {
  const payload = readRecord(pkg.candidatePayload)
  return {
    publicationKey: publicationKeyFor(pkg),
    eventKey: pkg.eventKey,
    assetKey: pkg.assetKey,
    parameterKey: normalizeText(payload.parameterKey),
    ownerAlgorithm: normalizeText(payload.ownerAlgorithm) || null,
    scopeType: pkg.scopeType,
    companyId: pkg.companyId ?? null,
    projectId: pkg.projectId ?? null,
    targetSurface: pkg.targetSurface,
    publicationStatus,
    parameterValue: payload.proposedValue ?? null,
    previousValue: payload.currentValue ?? null,
    rollbackTarget: pkg.rollbackTarget,
    impactMonitoring: buildImpactMonitoring(executedAt, options),
  }
}

function buildPublicationInsert(publication: AlgorithmAssetLearnableParameterRuntimePublication, releasePackage: AlgorithmAssetReleasePackage, executedAt: string) {
  return {
    sql: `insert into public.algorithm_learnable_parameter_runtime_publications (
      publication_key,
      event_key,
      asset_key,
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
      impact_monitoring,
      record_visibility_policy,
      published_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    on conflict (publication_key) do nothing`,
    params: [
      publication.publicationKey,
      publication.eventKey,
      publication.assetKey,
      publication.parameterKey,
      publication.ownerAlgorithm,
      publication.scopeType,
      publication.companyId,
      publication.projectId,
      publication.targetSurface,
      publication.publicationStatus,
      publication.parameterValue,
      publication.previousValue,
      publication.rollbackTarget,
      releasePackage,
      publication.impactMonitoring,
      'backend_admin_governance_only',
      executedAt,
    ],
  }
}

async function supersedePriorActiveRuntimePublications(
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  publication: AlgorithmAssetLearnableParameterRuntimePublication,
  executedAt: string,
) {
  await queryExec(
    `update public.algorithm_learnable_parameter_runtime_publications
      set publication_status = 'rolled_back',
          rollback_execution = jsonb_build_object(
            'status', 'superseded_by_new_publication',
            'supersededByPublicationKey', $8,
            'executedAt', $7,
            'restoredRuntimePolicy', 'newer_parameter_publication_takes_precedence'
          ),
          rolled_back_at = $7,
          updated_at = $7
      where parameter_key = $1
        and COALESCE(owner_algorithm, '') = COALESCE($2, '')
        and scope_level = $3
        and COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        and COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        and target_surface = $6
        and publication_status in ('published', 'canary')
        and publication_key <> $8`,
    [
      publication.parameterKey,
      publication.ownerAlgorithm,
      publication.scopeType,
      publication.companyId,
      publication.projectId,
      publication.targetSurface,
      executedAt,
      publication.publicationKey,
    ],
  )
}

async function persistReleaseEvent(
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  input: {
    eventType: 'parameter_runtime_publication' | 'rollback_execution' | 'impact_monitoring'
    eventStatus: string
    sourcePublicationKey: string
    eventPayload: Record<string, unknown>
    executedAt: string
    idempotencyKey?: string | null
  },
) {
  const idempotencyKey = normalizeText(input.idempotencyKey)
  if (idempotencyKey) {
    await queryExec(
      `insert into public.algorithm_learnable_parameter_release_events (
        event_type, event_status, source_publication_key, event_payload,
        record_visibility_policy, executed_at, idempotency_key
      ) values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (idempotency_key) where idempotency_key is not null do nothing`,
      [
        input.eventType,
        input.eventStatus,
        input.sourcePublicationKey,
        input.eventPayload,
        'backend_admin_governance_only',
        input.executedAt,
        idempotencyKey,
      ],
    )
    return
  }
  await queryExec(
    'insert into public.algorithm_learnable_parameter_release_events (event_type, event_status, source_publication_key, event_payload, record_visibility_policy, executed_at) values ($1, $2, $3, $4, $5, $6)',
    [input.eventType, input.eventStatus, input.sourcePublicationKey, input.eventPayload, 'backend_admin_governance_only', input.executedAt],
  )
}

export async function persistAlgorithmAssetLearnableParameterRuntimePublication(
  input: PersistAlgorithmAssetLearnableParameterRuntimePublicationInput,
): Promise<AlgorithmAssetLearnableParameterPublicationResult> {
  const publicationStatus = publicationStatusFor(input.releaseExit)
  const releasePackage = input.releaseExit.releasePackage
  if (!publicationStatus || !releasePackage || !input.releaseExit.canHandoffToRuntimeAdapter) {
    return buildBlockedResult(input.releaseExit)
  }

  const executedAt = input.executedAt ?? new Date().toISOString()
  const runtimePublication = buildRuntimePublication(releasePackage, publicationStatus, executedAt, input.impactMonitoring)
  await supersedePriorActiveRuntimePublications(input.queryExec, runtimePublication, executedAt)
  const insert = buildPublicationInsert(runtimePublication, releasePackage, executedAt)
  await input.queryExec(insert.sql, insert.params)
  await persistReleaseEvent(input.queryExec, {
    eventType: 'parameter_runtime_publication',
    eventStatus: publicationStatus === 'published'
      ? 'runtime_parameter_published'
      : 'runtime_parameter_canary_published',
    sourcePublicationKey: runtimePublication.publicationKey,
    executedAt,
    eventPayload: {
      runtimePublication,
      releasePackage,
      writesSeedRuntimeDirectly: false,
    },
    idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:publication_event` : null,
  })

  return {
    status: publicationStatus === 'published'
      ? 'runtime_parameter_published'
      : 'runtime_parameter_canary_published',
    canPersist: true,
    writesParameterRuntime: true,
    writesSeedRuntimeDirectly: false,
    publicationStatus,
    publicationKey: runtimePublication.publicationKey,
    rollbackTarget: runtimePublication.rollbackTarget,
    reasons: [],
    runtimePublication,
  }
}

export async function executeAlgorithmAssetLearnableParameterRuntimeRollback(
  input: ExecuteAlgorithmAssetLearnableParameterRuntimeRollbackInput,
): Promise<AlgorithmAssetLearnableParameterRuntimeRollbackResult> {
  const executedAt = input.executedAt ?? new Date().toISOString()
  const sourcePublicationKey = normalizeText(input.sourcePublicationKey)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const reasons = [
    ...(sourcePublicationKey ? [] : ['source_publication_key_required']),
    ...(rollbackTarget ? [] : ['rollback_target_required']),
  ]
  const status: AlgorithmAssetLearnableParameterRuntimeRollbackResult['status'] = reasons.length > 0
    ? 'rollback_blocked'
    : 'rollback_executed'

  if (status === 'rollback_executed') {
    await input.queryExec(
      `update public.algorithm_learnable_parameter_runtime_publications
        set publication_status = 'rolled_back',
            rollback_execution = $1,
            rolled_back_at = $2
        where publication_key = $3 and rollback_target = $4`,
      [
        {
          status,
          reason: input.reason ?? null,
          rollbackTarget,
          executedAt,
          restoredRuntimePolicy: 'previous_parameter_value_retained',
        },
        executedAt,
        sourcePublicationKey,
        rollbackTarget,
      ],
    )
  }

  await persistReleaseEvent(input.queryExec, {
    eventType: 'rollback_execution',
    eventStatus: status,
    sourcePublicationKey,
    executedAt,
    eventPayload: {
      rollbackTarget: rollbackTarget || null,
      reason: input.reason ?? null,
      restoredRuntimePolicy: 'previous_parameter_value_retained',
      writesSeedRuntimeDirectly: false,
    },
    idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:rollback_event` : null,
  })

  return {
    status,
    sourcePublicationKey,
    rollbackTarget: rollbackTarget || null,
    restoredRuntimePolicy: 'previous_parameter_value_retained',
    writesParameterRuntime: status === 'rollback_executed',
    writesSeedRuntimeDirectly: false,
    reasons,
  }
}

export async function recordAlgorithmAssetLearnableParameterImpactMonitoring(
  input: RecordAlgorithmAssetLearnableParameterImpactMonitoringInput,
): Promise<AlgorithmAssetLearnableParameterImpactMonitoringResult> {
  const executedAt = input.executedAt ?? new Date().toISOString()
  const thresholdViolations = input.thresholdViolations ?? []
  const status: AlgorithmAssetLearnableParameterImpactMonitoringResult['status'] = thresholdViolations.length > 0
    ? 'monitoring_failed'
    : 'monitoring_passed'
  const result: AlgorithmAssetLearnableParameterImpactMonitoringResult = {
    status,
    sourcePublicationKey: normalizeText(input.sourcePublicationKey),
    monitoredAssetCount: input.monitoredAssetCount,
    monitoringWindowHours: input.monitoringWindowHours ?? 72,
    thresholdViolations,
    rollbackRecommended: thresholdViolations.length > 0,
    writesParameterRuntime: false,
    writesSeedRuntimeDirectly: false,
  }

  await persistReleaseEvent(input.queryExec, {
    eventType: 'impact_monitoring',
    eventStatus: status,
    sourcePublicationKey: result.sourcePublicationKey,
    executedAt,
    eventPayload: {
      monitoredAssetCount: result.monitoredAssetCount,
      monitoringWindowHours: result.monitoringWindowHours,
      metrics: input.metrics ?? {},
      thresholdViolations,
      rollbackRecommended: result.rollbackRecommended,
      writesParameterRuntime: false,
      writesSeedRuntimeDirectly: false,
    },
    idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:monitoring_event` : null,
  })

  return result
}
