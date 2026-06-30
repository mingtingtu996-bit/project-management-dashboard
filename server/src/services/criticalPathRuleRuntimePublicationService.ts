import type {
  CriticalPathRulePublicationReadiness,
} from './criticalPathRulePublicationReadinessService.js'

export type CriticalPathRuleRuntimePublicationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type CriticalPathRuleRuntimePublication = {
  publicationKey: string
  criticalPathRuleVersionId: string
  rollbackTarget: string
  runtimePublicationStatus: 'runtime_published'
  criticalPathRuleLineage: CriticalPathRulePublicationReadiness['criticalPathRuleLineage']
  impactMonitoring: {
    status: 'monitoring_armed'
    monitoredAssetCount: number
    monitoringWindowHours: number
    executedAt: string
  }
}

export type CriticalPathRuleRuntimePublicationResult = {
  status: 'critical_path_rule_runtime_published' | 'blocked'
  canPersist: boolean
  writesCriticalPathRuleRuntime: boolean
  writesTaskDatesDirectly: false
  writesTaskCriticalOverridesDirectly: false
  writesBaselinesOrMonthlyPlansDirectly: false
  writesProgressFactsDirectly: false
  publicationKey: string | null
  rollbackTarget: string | null
  reasons: string[]
  runtimePublication: CriticalPathRuleRuntimePublication | null
}

export type PersistCriticalPathRuleRuntimePublicationInput = {
  readiness: CriticalPathRulePublicationReadiness
  queryExec: CriticalPathRuleRuntimePublicationQueryExec
  executedAt?: string
  impactMonitoring?: {
    monitoredAssetCount?: number
    monitoringWindowHours?: number
  }
}

export type ExecuteCriticalPathRuleRuntimeRollbackInput = {
  queryExec: CriticalPathRuleRuntimePublicationQueryExec
  sourcePublicationKey: string
  rollbackTarget: string
  reason?: string
  executedAt?: string
}

export type CriticalPathRuleRuntimeRollbackResult = {
  status: 'critical_path_rule_runtime_rollback_executed' | 'rollback_blocked'
  sourcePublicationKey: string
  rollbackTarget: string | null
  restoredRuntimePolicy: 'previous_critical_path_rule_publication_retained'
  writesCriticalPathRuleRuntime: boolean
  writesTaskDatesDirectly: false
  writesTaskCriticalOverridesDirectly: false
  writesBaselinesOrMonthlyPlansDirectly: false
  writesProgressFactsDirectly: false
  reasons: string[]
}

export type ResolveCriticalPathRuleRuntimePublicationInput = {
  queryExec: CriticalPathRuleRuntimePublicationQueryExec
  publicationKey: string
}

export type CriticalPathRuleRuntimePublicationResolution = {
  runtimeConsumable: boolean
  publicationKey: string | null
  criticalPathRuleVersionId: string | null
  runtimePublicationStatus: string | null
  criticalPathRuleLineage: unknown | null
  rollbackTarget: string | null
  reasons: string[]
}

type CriticalPathRuleRuntimePublicationRow = {
  publication_key?: unknown
  publicationKey?: unknown
  dependency_rule_version_id?: unknown
  dependencyRuleVersionId?: unknown
  runtime_publication_status?: unknown
  runtimePublicationStatus?: unknown
  dependency_rule_lineage?: unknown
  dependencyRuleLineage?: unknown
  rollback_target?: unknown
  rollbackTarget?: unknown
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function uniqueReasons(values: readonly string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function isCriticalPathPublicationKey(value: string | null) {
  return Boolean(value && value.startsWith('critical_path_rule_runtime:'))
}

function blockedPublication(
  readiness: CriticalPathRulePublicationReadiness,
  reasons: string[],
): CriticalPathRuleRuntimePublicationResult {
  return {
    status: 'blocked',
    canPersist: false,
    writesCriticalPathRuleRuntime: false,
    writesTaskDatesDirectly: false,
    writesTaskCriticalOverridesDirectly: false,
    writesBaselinesOrMonthlyPlansDirectly: false,
    writesProgressFactsDirectly: false,
    publicationKey: normalizeText(readiness.criticalPathRuleLineage.runtimePublicationKey) || null,
    rollbackTarget: normalizeText(readiness.criticalPathRuleLineage.rollbackTarget) || null,
    reasons: uniqueReasons(reasons.length > 0 ? reasons : readiness.missingReasons),
    runtimePublication: null,
  }
}

function buildRuntimePublication(
  readiness: CriticalPathRulePublicationReadiness,
  executedAt: string,
  impactMonitoring: PersistCriticalPathRuleRuntimePublicationInput['impactMonitoring'],
): CriticalPathRuleRuntimePublication {
  return {
    publicationKey: normalizeText(readiness.criticalPathRuleLineage.runtimePublicationKey),
    criticalPathRuleVersionId: normalizeText(readiness.criticalPathRuleLineage.criticalPathRuleVersionId),
    rollbackTarget: normalizeText(readiness.criticalPathRuleLineage.rollbackTarget),
    runtimePublicationStatus: 'runtime_published',
    criticalPathRuleLineage: readiness.criticalPathRuleLineage,
    impactMonitoring: {
      status: 'monitoring_armed',
      monitoredAssetCount: impactMonitoring?.monitoredAssetCount ?? 0,
      monitoringWindowHours: impactMonitoring?.monitoringWindowHours ?? 72,
      executedAt,
    },
  }
}

async function persistRuntimeEvent(
  queryExec: CriticalPathRuleRuntimePublicationQueryExec,
  input: {
    eventType: 'dependency_rule_runtime_publication' | 'rollback_execution'
    eventStatus: string
    sourcePublicationKey: string
    eventPayload: Record<string, unknown>
    executedAt: string
  },
) {
  await queryExec(
    'insert into public.construction_dependency_rule_runtime_events (event_type, event_status, source_publication_key, event_payload, record_visibility_policy, executed_at) values ($1, $2, $3, $4, $5, $6)',
    [
      input.eventType,
      input.eventStatus,
      input.sourcePublicationKey,
      input.eventPayload,
      'backend_admin_governance_only',
      input.executedAt,
    ],
  )
}

export async function persistCriticalPathRuleRuntimePublication(
  input: PersistCriticalPathRuleRuntimePublicationInput,
): Promise<CriticalPathRuleRuntimePublicationResult> {
  const publicationKey = normalizeText(input.readiness.criticalPathRuleLineage.runtimePublicationKey)
  const rollbackTarget = normalizeText(input.readiness.criticalPathRuleLineage.rollbackTarget)
  const versionId = normalizeText(input.readiness.criticalPathRuleLineage.criticalPathRuleVersionId)
  const reasons = [
    ...(input.readiness.status === 'critical_path_rule_publication_ready'
      ? []
      : input.readiness.missingReasons.length > 0 ? input.readiness.missingReasons : ['critical_path_rule_publication_ready_required']),
    ...(isCriticalPathPublicationKey(publicationKey) ? [] : ['critical_path_rule_runtime_publication_key_required']),
    ...(isCriticalPathPublicationKey(rollbackTarget) ? [] : ['critical_path_rule_runtime_rollback_target_required']),
    ...(versionId ? [] : ['critical_path_rule_version_required']),
  ]

  if (reasons.length > 0) {
    return blockedPublication(input.readiness, reasons)
  }

  const executedAt = input.executedAt ?? new Date().toISOString()
  const runtimePublication = buildRuntimePublication(input.readiness, executedAt, input.impactMonitoring)

  await input.queryExec(
    `insert into public.construction_dependency_rule_runtime_publications (
      publication_key,
      dependency_rule_version_id,
      runtime_publication_status,
      dependency_rule_lineage,
      rollback_target,
      impact_monitoring,
      record_visibility_policy,
      published_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      runtimePublication.publicationKey,
      runtimePublication.criticalPathRuleVersionId,
      runtimePublication.runtimePublicationStatus,
      runtimePublication.criticalPathRuleLineage,
      runtimePublication.rollbackTarget,
      runtimePublication.impactMonitoring,
      'backend_admin_governance_only',
      executedAt,
    ],
  )
  await persistRuntimeEvent(input.queryExec, {
    eventType: 'dependency_rule_runtime_publication',
    eventStatus: 'critical_path_rule_runtime_published',
    sourcePublicationKey: runtimePublication.publicationKey,
    executedAt,
    eventPayload: {
      runtimePublication,
      assetType: 'critical_path_rule_candidate',
      writesTaskDatesDirectly: false,
      writesTaskCriticalOverridesDirectly: false,
      writesBaselinesOrMonthlyPlansDirectly: false,
      writesProgressFactsDirectly: false,
    },
  })

  return {
    status: 'critical_path_rule_runtime_published',
    canPersist: true,
    writesCriticalPathRuleRuntime: true,
    writesTaskDatesDirectly: false,
    writesTaskCriticalOverridesDirectly: false,
    writesBaselinesOrMonthlyPlansDirectly: false,
    writesProgressFactsDirectly: false,
    publicationKey: runtimePublication.publicationKey,
    rollbackTarget: runtimePublication.rollbackTarget,
    reasons: [],
    runtimePublication,
  }
}

function rowField(
  row: CriticalPathRuleRuntimePublicationRow,
  snakeKey: keyof CriticalPathRuleRuntimePublicationRow,
  camelKey: keyof CriticalPathRuleRuntimePublicationRow,
) {
  return row[snakeKey] ?? row[camelKey]
}

export async function resolveCriticalPathRuleRuntimePublication(
  input: ResolveCriticalPathRuleRuntimePublicationInput,
): Promise<CriticalPathRuleRuntimePublicationResolution> {
  const publicationKey = normalizeText(input.publicationKey)
  if (!publicationKey) {
    return {
      runtimeConsumable: false,
      publicationKey: null,
      criticalPathRuleVersionId: null,
      runtimePublicationStatus: null,
      criticalPathRuleLineage: null,
      rollbackTarget: null,
      reasons: ['publication_key_required'],
    }
  }
  if (!isCriticalPathPublicationKey(publicationKey)) {
    return {
      runtimeConsumable: false,
      publicationKey,
      criticalPathRuleVersionId: null,
      runtimePublicationStatus: null,
      criticalPathRuleLineage: null,
      rollbackTarget: null,
      reasons: ['critical_path_rule_runtime_publication_key_required'],
    }
  }

  const rows = await input.queryExec<CriticalPathRuleRuntimePublicationRow>(
    `select publication_key,
            dependency_rule_version_id,
            runtime_publication_status,
            dependency_rule_lineage,
            rollback_target
       from public.construction_dependency_rule_runtime_publications
      where publication_key = $1
        and publication_key like 'critical_path_rule_runtime:%'
        and runtime_publication_status = 'runtime_published'
      order by published_at desc
      limit 1`,
    [publicationKey],
  )
  const row = rows[0] ?? null
  if (!row) {
    return {
      runtimeConsumable: false,
      publicationKey,
      criticalPathRuleVersionId: null,
      runtimePublicationStatus: null,
      criticalPathRuleLineage: null,
      rollbackTarget: null,
      reasons: ['critical_path_rule_runtime_publication_not_found_or_not_consumable'],
    }
  }

  return {
    runtimeConsumable: true,
    publicationKey: normalizeText(rowField(row, 'publication_key', 'publicationKey')),
    criticalPathRuleVersionId: normalizeText(rowField(row, 'dependency_rule_version_id', 'dependencyRuleVersionId')),
    runtimePublicationStatus: normalizeText(rowField(row, 'runtime_publication_status', 'runtimePublicationStatus')),
    criticalPathRuleLineage: rowField(row, 'dependency_rule_lineage', 'dependencyRuleLineage') ?? null,
    rollbackTarget: normalizeText(rowField(row, 'rollback_target', 'rollbackTarget')) || null,
    reasons: [],
  }
}

function blockedRollback(input: {
  sourcePublicationKey: string
  rollbackTarget: string | null
  reasons: string[]
}): CriticalPathRuleRuntimeRollbackResult {
  return {
    status: 'rollback_blocked',
    sourcePublicationKey: input.sourcePublicationKey,
    rollbackTarget: input.rollbackTarget,
    restoredRuntimePolicy: 'previous_critical_path_rule_publication_retained',
    writesCriticalPathRuleRuntime: false,
    writesTaskDatesDirectly: false,
    writesTaskCriticalOverridesDirectly: false,
    writesBaselinesOrMonthlyPlansDirectly: false,
    writesProgressFactsDirectly: false,
    reasons: uniqueReasons(input.reasons),
  }
}

export async function executeCriticalPathRuleRuntimeRollback(
  input: ExecuteCriticalPathRuleRuntimeRollbackInput,
): Promise<CriticalPathRuleRuntimeRollbackResult> {
  const executedAt = input.executedAt ?? new Date().toISOString()
  const sourcePublicationKey = normalizeText(input.sourcePublicationKey)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const reasons = [
    ...(sourcePublicationKey ? [] : ['source_publication_key_required']),
    ...(rollbackTarget ? [] : ['rollback_target_required']),
    ...(isCriticalPathPublicationKey(sourcePublicationKey) ? [] : ['critical_path_rule_runtime_publication_key_required']),
    ...(isCriticalPathPublicationKey(rollbackTarget) ? [] : ['critical_path_rule_runtime_rollback_target_required']),
  ]

  if (reasons.length > 0) {
    return blockedRollback({ sourcePublicationKey, rollbackTarget: rollbackTarget || null, reasons })
  }

  await input.queryExec(
    `update public.construction_dependency_rule_runtime_publications
        set runtime_publication_status = 'runtime_rolled_back',
            rollback_execution = $1,
            rolled_back_at = $2
      where publication_key = $3 and rollback_target = $4`,
    [
      {
        status: 'critical_path_rule_runtime_rollback_executed',
        reason: input.reason ?? null,
        rollbackTarget,
        executedAt,
        restoredRuntimePolicy: 'previous_critical_path_rule_publication_retained',
      },
      executedAt,
      sourcePublicationKey,
      rollbackTarget,
    ],
  )

  await persistRuntimeEvent(input.queryExec, {
    eventType: 'rollback_execution',
    eventStatus: 'critical_path_rule_runtime_rollback_executed',
    sourcePublicationKey,
    executedAt,
    eventPayload: {
      rollbackTarget,
      reason: input.reason ?? null,
      restoredRuntimePolicy: 'previous_critical_path_rule_publication_retained',
      writesTaskDatesDirectly: false,
      writesTaskCriticalOverridesDirectly: false,
      writesBaselinesOrMonthlyPlansDirectly: false,
      writesProgressFactsDirectly: false,
    },
  })

  return {
    status: 'critical_path_rule_runtime_rollback_executed',
    sourcePublicationKey,
    rollbackTarget,
    restoredRuntimePolicy: 'previous_critical_path_rule_publication_retained',
    writesCriticalPathRuleRuntime: true,
    writesTaskDatesDirectly: false,
    writesTaskCriticalOverridesDirectly: false,
    writesBaselinesOrMonthlyPlansDirectly: false,
    writesProgressFactsDirectly: false,
    reasons: [],
  }
}
