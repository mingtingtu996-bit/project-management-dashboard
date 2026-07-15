import type {
  ConstructionDependencyRulePublicationReadiness,
} from './constructionDependencyReplayCalibrationService.js'

export type ConstructionDependencyRuleRuntimePublicationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type ConstructionDependencyRuleRuntimePublication = {
  publicationKey: string
  dependencyRuleVersionId: string
  rollbackTarget: string
  runtimePublicationStatus: 'runtime_published'
  dependencyRuleLineage: ConstructionDependencyRulePublicationReadiness['dependencyRuleLineage']
  impactMonitoring: {
    status: 'monitoring_armed'
    monitoredAssetCount: number
    monitoringWindowHours: number
    executedAt: string
  }
}

export type ConstructionDependencyRuleRuntimePublicationResult = {
  status: 'dependency_rule_runtime_published' | 'blocked'
  canPersist: boolean
  writesDependencyRuleRuntime: boolean
  writesTaskDependenciesDirectly: false
  writesSeedRuntimeDirectly: false
  publicationKey: string | null
  rollbackTarget: string | null
  reasons: string[]
  runtimePublication: ConstructionDependencyRuleRuntimePublication | null
}

export type PersistConstructionDependencyRuleRuntimePublicationInput = {
  readiness: ConstructionDependencyRulePublicationReadiness
  queryExec: ConstructionDependencyRuleRuntimePublicationQueryExec
  executedAt?: string
  impactMonitoring?: {
    monitoredAssetCount?: number
    monitoringWindowHours?: number
  }
}

export type ExecuteConstructionDependencyRuleRuntimeRollbackInput = {
  queryExec: ConstructionDependencyRuleRuntimePublicationQueryExec
  sourcePublicationKey: string
  rollbackTarget: string
  reason?: string
  executedAt?: string
}

export type ConstructionDependencyRuleRuntimeRollbackResult = {
  status: 'rollback_executed' | 'rollback_blocked'
  sourcePublicationKey: string
  rollbackTarget: string | null
  restoredRuntimePolicy: 'previous_dependency_rule_publication_retained'
  writesDependencyRuleRuntime: boolean
  writesTaskDependenciesDirectly: false
  writesSeedRuntimeDirectly: false
  reasons: string[]
}

export type ResolveConstructionDependencyRuleRuntimePublicationInput = {
  queryExec: ConstructionDependencyRuleRuntimePublicationQueryExec
  publicationKey: string
}

export type ConstructionDependencyRuleRuntimePublicationResolution = {
  runtimeConsumable: boolean
  publicationKey: string | null
  dependencyRuleVersionId: string | null
  runtimePublicationStatus: string | null
  dependencyRuleLineage: unknown | null
  rollbackTarget: string | null
  reasons: string[]
}

type ConstructionDependencyRuleRuntimePublicationRow = {
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

function uniqueReasons(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function blockedPublication(
  readiness: ConstructionDependencyRulePublicationReadiness,
): ConstructionDependencyRuleRuntimePublicationResult {
  return {
    status: 'blocked',
    canPersist: false,
    writesDependencyRuleRuntime: false,
    writesTaskDependenciesDirectly: false,
    writesSeedRuntimeDirectly: false,
    publicationKey: null,
    rollbackTarget: readiness.dependencyRuleLineage.rollbackTarget,
    reasons: readiness.missingReasons.length > 0
      ? uniqueReasons(readiness.missingReasons)
      : ['dependency_rule_publication_ready_required'],
    runtimePublication: null,
  }
}

function buildRuntimePublication(
  readiness: ConstructionDependencyRulePublicationReadiness,
  executedAt: string,
  impactMonitoring: PersistConstructionDependencyRuleRuntimePublicationInput['impactMonitoring'],
): ConstructionDependencyRuleRuntimePublication {
  return {
    publicationKey: normalizeText(readiness.dependencyRuleLineage.runtimePublicationKey),
    dependencyRuleVersionId: normalizeText(readiness.dependencyRuleLineage.dependencyRuleVersionId),
    rollbackTarget: normalizeText(readiness.dependencyRuleLineage.rollbackTarget),
    runtimePublicationStatus: 'runtime_published',
    dependencyRuleLineage: readiness.dependencyRuleLineage,
    impactMonitoring: {
      status: 'monitoring_armed',
      monitoredAssetCount: impactMonitoring?.monitoredAssetCount ?? 0,
      monitoringWindowHours: impactMonitoring?.monitoringWindowHours ?? 72,
      executedAt,
    },
  }
}

async function persistRuntimeEvent(
  queryExec: ConstructionDependencyRuleRuntimePublicationQueryExec,
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

export async function persistConstructionDependencyRuleRuntimePublication(
  input: PersistConstructionDependencyRuleRuntimePublicationInput,
): Promise<ConstructionDependencyRuleRuntimePublicationResult> {
  if (
    input.readiness.status !== 'dependency_rule_publication_ready'
    || !input.readiness.dependencyRuleLineage.runtimePublicationKey
    || !input.readiness.dependencyRuleLineage.rollbackTarget
  ) {
    return blockedPublication(input.readiness)
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
      runtimePublication.dependencyRuleVersionId,
      runtimePublication.runtimePublicationStatus,
      runtimePublication.dependencyRuleLineage,
      runtimePublication.rollbackTarget,
      runtimePublication.impactMonitoring,
      'backend_admin_governance_only',
      executedAt,
    ],
  )
  await persistRuntimeEvent(input.queryExec, {
    eventType: 'dependency_rule_runtime_publication',
    eventStatus: 'dependency_rule_runtime_published',
    sourcePublicationKey: runtimePublication.publicationKey,
    executedAt,
    eventPayload: {
      runtimePublication,
      writesTaskDependenciesDirectly: false,
      writesSeedRuntimeDirectly: false,
    },
  })

  return {
    status: 'dependency_rule_runtime_published',
    canPersist: true,
    writesDependencyRuleRuntime: true,
    writesTaskDependenciesDirectly: false,
    writesSeedRuntimeDirectly: false,
    publicationKey: runtimePublication.publicationKey,
    rollbackTarget: runtimePublication.rollbackTarget,
    reasons: [],
    runtimePublication,
  }
}

function rowField(row: ConstructionDependencyRuleRuntimePublicationRow, snakeKey: keyof ConstructionDependencyRuleRuntimePublicationRow, camelKey: keyof ConstructionDependencyRuleRuntimePublicationRow) {
  return row[snakeKey] ?? row[camelKey]
}

export async function resolveConstructionDependencyRuleRuntimePublication(
  input: ResolveConstructionDependencyRuleRuntimePublicationInput,
): Promise<ConstructionDependencyRuleRuntimePublicationResolution> {
  const publicationKey = normalizeText(input.publicationKey)
  if (!publicationKey) {
    return {
      runtimeConsumable: false,
      publicationKey: null,
      dependencyRuleVersionId: null,
      runtimePublicationStatus: null,
      dependencyRuleLineage: null,
      rollbackTarget: null,
      reasons: ['publication_key_required'],
    }
  }

  const rows = await input.queryExec<ConstructionDependencyRuleRuntimePublicationRow>(
    `select publication_key,
            dependency_rule_version_id,
            runtime_publication_status,
            dependency_rule_lineage,
            rollback_target
       from public.construction_dependency_rule_runtime_publications
      where publication_key = $1
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
      dependencyRuleVersionId: null,
      runtimePublicationStatus: null,
      dependencyRuleLineage: null,
      rollbackTarget: null,
      reasons: ['dependency_rule_runtime_publication_not_found_or_not_consumable'],
    }
  }

  return {
    runtimeConsumable: true,
    publicationKey: normalizeText(rowField(row, 'publication_key', 'publicationKey')),
    dependencyRuleVersionId: normalizeText(rowField(row, 'dependency_rule_version_id', 'dependencyRuleVersionId')),
    runtimePublicationStatus: normalizeText(rowField(row, 'runtime_publication_status', 'runtimePublicationStatus')),
    dependencyRuleLineage: rowField(row, 'dependency_rule_lineage', 'dependencyRuleLineage') ?? null,
    rollbackTarget: normalizeText(rowField(row, 'rollback_target', 'rollbackTarget')) || null,
    reasons: [],
  }
}

export async function executeConstructionDependencyRuleRuntimeRollback(
  input: ExecuteConstructionDependencyRuleRuntimeRollbackInput,
): Promise<ConstructionDependencyRuleRuntimeRollbackResult> {
  const executedAt = input.executedAt ?? new Date().toISOString()
  const sourcePublicationKey = normalizeText(input.sourcePublicationKey)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const reasons = [
    ...(sourcePublicationKey ? [] : ['source_publication_key_required']),
    ...(rollbackTarget ? [] : ['rollback_target_required']),
  ]
  const status: ConstructionDependencyRuleRuntimeRollbackResult['status'] = reasons.length > 0
    ? 'rollback_blocked'
    : 'rollback_executed'

  if (status === 'rollback_executed') {
    await input.queryExec(
      `update public.construction_dependency_rule_runtime_publications
        set runtime_publication_status = 'runtime_rolled_back',
            rollback_execution = $1,
            rolled_back_at = $2
        where publication_key = $3 and rollback_target = $4`,
      [
        {
          status,
          reason: input.reason ?? null,
          rollbackTarget,
          executedAt,
          restoredRuntimePolicy: 'previous_dependency_rule_publication_retained',
        },
        executedAt,
        sourcePublicationKey,
        rollbackTarget,
      ],
    )
  }

  await persistRuntimeEvent(input.queryExec, {
    eventType: 'rollback_execution',
    eventStatus: status,
    sourcePublicationKey,
    executedAt,
    eventPayload: {
      rollbackTarget: rollbackTarget || null,
      reason: input.reason ?? null,
      restoredRuntimePolicy: 'previous_dependency_rule_publication_retained',
      writesTaskDependenciesDirectly: false,
      writesSeedRuntimeDirectly: false,
    },
  })

  return {
    status,
    sourcePublicationKey,
    rollbackTarget: rollbackTarget || null,
    restoredRuntimePolicy: 'previous_dependency_rule_publication_retained',
    writesDependencyRuleRuntime: status === 'rollback_executed',
    writesTaskDependenciesDirectly: false,
    writesSeedRuntimeDirectly: false,
    reasons,
  }
}
