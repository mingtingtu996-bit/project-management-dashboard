export type MetricRuntimePublicationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

import { isRegisteredMetric } from './metricRegistryService.js'

export type MetricRuntimeLineage = {
  metricKey: string
  metricCaliberVersionId: string
  runtimePublicationKey: string
  rollbackTarget: string
  producerContractRef: string
  snapshotPersistenceRef: string
  dashboardConsumerContractRef: string
}

export type MetricRuntimePublicationReadiness = {
  status: 'metric_publication_ready' | 'metric_publication_not_ready'
  metricLineage: MetricRuntimeLineage
  missingReasons: string[]
}

export type MetricRuntimePublication = {
  publicationKey: string
  metricKey: string
  metricCaliberVersionId: string
  runtimePublicationStatus: 'runtime_published'
  metricLineage: MetricRuntimeLineage
  rollbackTarget: string
  companyId: string
  projectId: string | null
  producerContract: {
    ref: string
    lockedAt: string
  }
  snapshotContract: {
    ref: string
    lockedAt: string
  }
  consumerContracts: Array<{
    consumer: 'dashboard'
    ref: string
    lockedAt: string
  }>
  impactMonitoring: {
    status: 'monitoring_armed'
    monitoredMetricCount: number
    monitoringWindowHours: number
    executedAt: string
  }
}

export type MetricRuntimePublicationResult = {
  status: 'metric_runtime_published' | 'blocked'
  canPersist: boolean
  writesMetricRuntime: boolean
  writesMetricValueSnapshotsDirectly: false
  writesProjectDailySnapshotDirectly: false
  writesProjectFactsDirectly: false
  publicationKey: string | null
  rollbackTarget: string | null
  reasons: string[]
  runtimePublication: MetricRuntimePublication | null
}

export type PersistMetricRuntimePublicationInput = {
  readiness: MetricRuntimePublicationReadiness
  companyId?: string | null
  projectId?: string | null
  queryExec: MetricRuntimePublicationQueryExec
  executedAt?: string
  impactMonitoring?: {
    monitoredMetricCount?: number
    monitoringWindowHours?: number
  }
}

export type ResolveMetricRuntimePublicationInput = {
  queryExec: MetricRuntimePublicationQueryExec
  publicationKey: string
  companyId?: string | null
  projectId?: string | null
}

export type MetricRuntimePublicationResolution = {
  runtimeConsumable: boolean
  publicationKey: string | null
  metricKey: string | null
  metricCaliberVersionId: string | null
  runtimePublicationStatus: string | null
  metricLineage: unknown | null
  rollbackTarget: string | null
  companyId: string | null
  projectId: string | null
  reasons: string[]
}

export type ExecuteMetricRuntimeRollbackInput = {
  queryExec: MetricRuntimePublicationQueryExec
  companyId?: string | null
  projectId?: string | null
  sourcePublicationKey: string
  rollbackTarget: string
  reason?: string
  executedAt?: string
}

export type MetricRuntimeRollbackResult = {
  status: 'rollback_executed' | 'rollback_blocked'
  sourcePublicationKey: string
  rollbackTarget: string | null
  restoredRuntimePolicy: 'previous_metric_runtime_publication_retained'
  writesMetricRuntime: boolean
  writesMetricValueSnapshotsDirectly: false
  writesProjectDailySnapshotDirectly: false
  writesProjectFactsDirectly: false
  reasons: string[]
}

type MetricRuntimePublicationRow = {
  publication_key?: unknown
  publicationKey?: unknown
  metric_key?: unknown
  metricKey?: unknown
  metric_caliber_version_id?: unknown
  metricCaliberVersionId?: unknown
  runtime_publication_status?: unknown
  runtimePublicationStatus?: unknown
  metric_lineage?: unknown
  metricLineage?: unknown
  rollback_target?: unknown
  rollbackTarget?: unknown
  company_id?: unknown
  companyId?: unknown
  project_id?: unknown
  projectId?: unknown
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function uniqueReasons(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function rowField(row: MetricRuntimePublicationRow, snakeKey: keyof MetricRuntimePublicationRow, camelKey: keyof MetricRuntimePublicationRow) {
  return row[snakeKey] ?? row[camelKey]
}

function blockedPublication(
  input: PersistMetricRuntimePublicationInput,
  reasons: string[],
): MetricRuntimePublicationResult {
  return {
    status: 'blocked',
    canPersist: false,
    writesMetricRuntime: false,
    writesMetricValueSnapshotsDirectly: false,
    writesProjectDailySnapshotDirectly: false,
    writesProjectFactsDirectly: false,
    publicationKey: nullableText(input.readiness.metricLineage.runtimePublicationKey),
    rollbackTarget: nullableText(input.readiness.metricLineage.rollbackTarget),
    reasons: uniqueReasons(reasons),
    runtimePublication: null,
  }
}

function buildRuntimePublication(
  input: PersistMetricRuntimePublicationInput,
  companyId: string,
  executedAt: string,
): MetricRuntimePublication {
  const lineage = input.readiness.metricLineage
  return {
    publicationKey: normalizeText(lineage.runtimePublicationKey),
    metricKey: normalizeText(lineage.metricKey),
    metricCaliberVersionId: normalizeText(lineage.metricCaliberVersionId),
    runtimePublicationStatus: 'runtime_published',
    metricLineage: lineage,
    rollbackTarget: normalizeText(lineage.rollbackTarget),
    companyId,
    projectId: nullableText(input.projectId),
    producerContract: {
      ref: normalizeText(lineage.producerContractRef),
      lockedAt: executedAt,
    },
    snapshotContract: {
      ref: normalizeText(lineage.snapshotPersistenceRef),
      lockedAt: executedAt,
    },
    consumerContracts: [{
      consumer: 'dashboard',
      ref: normalizeText(lineage.dashboardConsumerContractRef),
      lockedAt: executedAt,
    }],
    impactMonitoring: {
      status: 'monitoring_armed',
      monitoredMetricCount: input.impactMonitoring?.monitoredMetricCount ?? 0,
      monitoringWindowHours: input.impactMonitoring?.monitoringWindowHours ?? 72,
      executedAt,
    },
  }
}

async function persistRuntimeEvent(
  queryExec: MetricRuntimePublicationQueryExec,
  input: {
    companyId: string
    projectId: string | null
    eventType: 'metric_runtime_publication' | 'rollback_execution' | 'impact_monitoring'
    eventStatus: string
    sourcePublicationKey: string
    eventPayload: Record<string, unknown>
    executedAt: string
  },
) {
  await queryExec(
    'insert into public.metric_runtime_events (company_id, project_id, event_type, event_status, source_publication_key, event_payload, record_visibility_policy, executed_at) values ($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      input.companyId,
      input.projectId,
      input.eventType,
      input.eventStatus,
      input.sourcePublicationKey,
      input.eventPayload,
      'backend_admin_governance_only',
      input.executedAt,
    ],
  )
}

export async function persistMetricRuntimePublication(
  input: PersistMetricRuntimePublicationInput,
): Promise<MetricRuntimePublicationResult> {
  const companyId = nullableText(input.companyId)
  const lineage = input.readiness.metricLineage
  const reasons = [
    ...(input.readiness.status === 'metric_publication_ready'
      ? []
      : input.readiness.missingReasons.length > 0 ? input.readiness.missingReasons : ['metric_publication_ready_required']),
    ...(companyId ? [] : ['company_scope_required']),
    ...(normalizeText(lineage.metricKey) ? [] : ['metric_key_required']),
    ...(normalizeText(lineage.metricKey) && !isRegisteredMetric(normalizeText(lineage.metricKey))
      ? ['metric_registry_entry_required']
      : []),
    ...(normalizeText(lineage.metricCaliberVersionId) ? [] : ['metric_caliber_version_required']),
    ...(normalizeText(lineage.runtimePublicationKey) ? [] : ['runtime_publication_key_required']),
    ...(normalizeText(lineage.rollbackTarget) ? [] : ['rollback_target_required']),
    ...(normalizeText(lineage.producerContractRef) ? [] : ['metric_producer_contract_required']),
    ...(normalizeText(lineage.snapshotPersistenceRef) ? [] : ['snapshot_persistence_contract_required']),
    ...(normalizeText(lineage.dashboardConsumerContractRef) ? [] : ['dashboard_consumer_contract_required']),
  ]

  if (reasons.length > 0 || !companyId) {
    return blockedPublication(input, reasons)
  }

  const executedAt = input.executedAt ?? new Date().toISOString()
  const runtimePublication = buildRuntimePublication(input, companyId, executedAt)

  await input.queryExec(
    `insert into public.metric_runtime_publications (
      publication_key,
      metric_key,
      metric_caliber_version_id,
      company_id,
      project_id,
      runtime_publication_status,
      metric_lineage,
      rollback_target,
      producer_contract,
      snapshot_contract,
      consumer_contracts,
      impact_monitoring,
      record_visibility_policy,
      published_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      runtimePublication.publicationKey,
      runtimePublication.metricKey,
      runtimePublication.metricCaliberVersionId,
      runtimePublication.companyId,
      runtimePublication.projectId,
      runtimePublication.runtimePublicationStatus,
      runtimePublication.metricLineage,
      runtimePublication.rollbackTarget,
      runtimePublication.producerContract,
      runtimePublication.snapshotContract,
      runtimePublication.consumerContracts,
      runtimePublication.impactMonitoring,
      'backend_admin_governance_only',
      executedAt,
    ],
  )
  await persistRuntimeEvent(input.queryExec, {
    companyId,
    projectId: runtimePublication.projectId,
    eventType: 'metric_runtime_publication',
    eventStatus: 'metric_runtime_published',
    sourcePublicationKey: runtimePublication.publicationKey,
    executedAt,
    eventPayload: {
      runtimePublication,
      writesMetricValueSnapshotsDirectly: false,
      writesProjectDailySnapshotDirectly: false,
      writesProjectFactsDirectly: false,
    },
  })

  return {
    status: 'metric_runtime_published',
    canPersist: true,
    writesMetricRuntime: true,
    writesMetricValueSnapshotsDirectly: false,
    writesProjectDailySnapshotDirectly: false,
    writesProjectFactsDirectly: false,
    publicationKey: runtimePublication.publicationKey,
    rollbackTarget: runtimePublication.rollbackTarget,
    reasons: [],
    runtimePublication,
  }
}

export async function resolveMetricRuntimePublication(
  input: ResolveMetricRuntimePublicationInput,
): Promise<MetricRuntimePublicationResolution> {
  const publicationKey = nullableText(input.publicationKey)
  const companyId = nullableText(input.companyId)
  const projectId = nullableText(input.projectId)
  const reasons = [
    ...(publicationKey ? [] : ['publication_key_required']),
    ...(companyId ? [] : ['company_scope_required']),
  ]
  if (reasons.length > 0 || !publicationKey || !companyId) {
    return {
      runtimeConsumable: false,
      publicationKey,
      metricKey: null,
      metricCaliberVersionId: null,
      runtimePublicationStatus: null,
      metricLineage: null,
      rollbackTarget: null,
      companyId,
      projectId,
      reasons,
    }
  }

  const rows = await input.queryExec<MetricRuntimePublicationRow>(
    `select publication_key,
            metric_key,
            metric_caliber_version_id,
            runtime_publication_status,
            metric_lineage,
            rollback_target,
            company_id,
            project_id
       from public.metric_runtime_publications
      where publication_key = $1
        and company_id = $2
        and ($3::uuid is null or project_id = $3)
        and runtime_publication_status = 'runtime_published'
      order by published_at desc
      limit 1`,
    [publicationKey, companyId, projectId],
  )
  const row = rows[0] ?? null
  if (!row) {
    return {
      runtimeConsumable: false,
      publicationKey,
      metricKey: null,
      metricCaliberVersionId: null,
      runtimePublicationStatus: null,
      metricLineage: null,
      rollbackTarget: null,
      companyId,
      projectId,
      reasons: ['metric_runtime_publication_not_found_or_not_consumable'],
    }
  }

  return {
    runtimeConsumable: true,
    publicationKey: normalizeText(rowField(row, 'publication_key', 'publicationKey')),
    metricKey: normalizeText(rowField(row, 'metric_key', 'metricKey')),
    metricCaliberVersionId: normalizeText(rowField(row, 'metric_caliber_version_id', 'metricCaliberVersionId')),
    runtimePublicationStatus: normalizeText(rowField(row, 'runtime_publication_status', 'runtimePublicationStatus')),
    metricLineage: rowField(row, 'metric_lineage', 'metricLineage') ?? null,
    rollbackTarget: nullableText(rowField(row, 'rollback_target', 'rollbackTarget')),
    companyId: nullableText(rowField(row, 'company_id', 'companyId')),
    projectId: nullableText(rowField(row, 'project_id', 'projectId')),
    reasons: [],
  }
}

export async function executeMetricRuntimeRollback(
  input: ExecuteMetricRuntimeRollbackInput,
): Promise<MetricRuntimeRollbackResult> {
  const executedAt = input.executedAt ?? new Date().toISOString()
  const companyId = nullableText(input.companyId)
  const projectId = nullableText(input.projectId)
  const sourcePublicationKey = normalizeText(input.sourcePublicationKey)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const reasons = [
    ...(sourcePublicationKey ? [] : ['source_publication_key_required']),
    ...(rollbackTarget ? [] : ['rollback_target_required']),
    ...(companyId ? [] : ['company_scope_required']),
  ]
  const status: MetricRuntimeRollbackResult['status'] = reasons.length > 0
    ? 'rollback_blocked'
    : 'rollback_executed'

  if (status === 'rollback_executed' && companyId) {
    await input.queryExec(
      `update public.metric_runtime_publications
        set runtime_publication_status = 'runtime_rolled_back',
            rollback_execution = $1,
            rolled_back_at = $2
        where publication_key = $3 and rollback_target = $4 and company_id = $5
          and ($6::uuid is null or project_id = $6)`,
      [
        {
          status,
          reason: input.reason ?? null,
          rollbackTarget,
          executedAt,
          restoredRuntimePolicy: 'previous_metric_runtime_publication_retained',
        },
        executedAt,
        sourcePublicationKey,
        rollbackTarget,
        companyId,
        projectId,
      ],
    )

    await persistRuntimeEvent(input.queryExec, {
      companyId,
      projectId,
      eventType: 'rollback_execution',
      eventStatus: status,
      sourcePublicationKey,
      executedAt,
      eventPayload: {
        rollbackTarget,
        reason: input.reason ?? null,
        restoredRuntimePolicy: 'previous_metric_runtime_publication_retained',
        writesMetricValueSnapshotsDirectly: false,
        writesProjectDailySnapshotDirectly: false,
        writesProjectFactsDirectly: false,
      },
    })
  }

  return {
    status,
    sourcePublicationKey,
    rollbackTarget: rollbackTarget || null,
    restoredRuntimePolicy: 'previous_metric_runtime_publication_retained',
    writesMetricRuntime: status === 'rollback_executed',
    writesMetricValueSnapshotsDirectly: false,
    writesProjectDailySnapshotDirectly: false,
    writesProjectFactsDirectly: false,
    reasons,
  }
}
