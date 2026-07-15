import type {
  PolicyTemplateReleaseRecordResult,
  PolicyTemplateReleaseTargetTable,
} from './policyTemplateReleaseAdapterService.js'

export type PolicyTemplateReleaseExecutionQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type PolicyTemplateReleaseExecutionStatus = 'publish_record_persisted' | 'blocked'
export type PolicyTemplateReleaseRuntimePublicationStatus =
  | 'runtime_stable_published'
  | 'candidate_record_only'
export type PolicyTemplateEntityRuntimePublicationStatus =
  | 'runtime_stable_published'
  | 'runtime_rolled_back'

export type PolicyTemplateReleaseExecutionEventType =
  | 'release_publication'
  | 'rollback_execution'
  | 'impact_monitoring'

export type PolicyTemplateReleaseExecutionEventStatus =
  | PolicyTemplateReleaseRuntimePublicationStatus
  | 'rollback_executed'
  | 'rollback_blocked'
  | 'monitoring_passed'
  | 'monitoring_failed'

export interface PolicyTemplateReleaseRollbackExecution {
  status: 'rollback_ready'
  rollbackTarget: string
  executionPolicy: 'restore_previous_seed_version_before_runtime_reenable'
  executedAt: string
  targetTable: PolicyTemplateReleaseTargetTable
}

export interface PolicyTemplateReleaseImpactMonitoring {
  status: 'monitoring_armed'
  monitoredAssetCount: number
  monitoringWindowHours: number
  executedAt: string
}

export interface PolicyTemplateReleaseImpactMonitoringOptions {
  monitoredAssetCount?: number
  monitoringWindowHours?: number
}

export interface PolicyTemplateReleaseExecutionResult {
  status: PolicyTemplateReleaseExecutionStatus
  targetTable: PolicyTemplateReleaseTargetTable
  canPersist: boolean
  writesRuntimeDirectly: false
  reasons: string[]
  runtimePublication: PolicyTemplateReleaseRuntimePublication | null
  templateEntityRuntimePublication: PolicyTemplateEntityRuntimePublicationResult | null
  rollbackExecution: PolicyTemplateReleaseRollbackExecution | null
  impactMonitoring: PolicyTemplateReleaseImpactMonitoring | null
}

export interface PolicyTemplateReleaseRuntimePublication {
  status: PolicyTemplateReleaseRuntimePublicationStatus
  runtimeConsumptionStatus: string
  stableConsumptionAllowed: boolean
  promotionDecision: string | null
  consumptionPolicy: 'business_preview_loads_latest_stable_auto_publish_run' | 'candidate_record_for_admin_audit_only'
  runtimeSourceTable: PolicyTemplateReleaseTargetTable | null
  writesRuntimeDirectly: false
}

export interface PolicyTemplateEntityRuntimePublication {
  sourceRunId: string
  targetTable: PolicyTemplateReleaseTargetTable
  runtimeSourceTable: PolicyTemplateReleaseTargetTable
  rollbackTarget: string
  runtimePublicationStatus: PolicyTemplateEntityRuntimePublicationStatus
  executedAt: string
  runRecord: Record<string, unknown>
}

export interface PolicyTemplateEntityRuntimePublicationResult {
  status: 'template_runtime_published'
  sourceRunId: string
  targetTable: PolicyTemplateReleaseTargetTable
  runtimeSourceTable: PolicyTemplateReleaseTargetTable
  rollbackTarget: string
  executedAt: string
  writesTemplateRuntime: true
}

export type PolicyTemplateEntityRuntimeWriter = (
  publication: PolicyTemplateEntityRuntimePublication,
  queryExec: PolicyTemplateReleaseExecutionQueryExec,
) => Promise<PolicyTemplateEntityRuntimePublicationResult>

export interface PolicyTemplateEntityRuntimeRollback {
  sourceRunId: string
  targetTable: PolicyTemplateReleaseTargetTable
  rollbackTarget: string
  reason: string | null
  executedAt: string
}

export interface PolicyTemplateEntityRuntimeRollbackResult {
  status: 'template_runtime_rolled_back'
  sourceRunId: string
  targetTable: PolicyTemplateReleaseTargetTable
  rollbackTarget: string
  executedAt: string
  writesTemplateRuntime: true
  writesSeedRuntimeDirectly: false
}

export type PolicyTemplateEntityRuntimeRollbackWriter = (
  rollback: PolicyTemplateEntityRuntimeRollback,
  queryExec: PolicyTemplateReleaseExecutionQueryExec,
) => Promise<PolicyTemplateEntityRuntimeRollbackResult>

export interface PersistPolicyTemplateReleaseExecutionInput<TRecord extends object> {
  releaseRecord: PolicyTemplateReleaseRecordResult<TRecord>
  queryExec: PolicyTemplateReleaseExecutionQueryExec
  executedAt?: string
  impactMonitoring?: PolicyTemplateReleaseImpactMonitoringOptions
  templateEntityRuntimeWriter?: PolicyTemplateEntityRuntimeWriter
}

export interface ExecutePolicyTemplateReleaseRollbackInput {
  queryExec: PolicyTemplateReleaseExecutionQueryExec
  sourceRunId: string
  targetTable: PolicyTemplateReleaseTargetTable
  rollbackTarget: string
  reason?: string
  executedAt?: string
  templateEntityRuntimeRollbackWriter?: PolicyTemplateEntityRuntimeRollbackWriter
}

export interface PolicyTemplateReleaseRollbackExecutionResult {
  status: 'rollback_executed' | 'rollback_blocked'
  targetTable: PolicyTemplateReleaseTargetTable
  sourceRunId: string
  rollbackTarget: string | null
  restoredRuntimePolicy: 'previous_stable_auto_publish_run_retained'
  writesRuntimeDirectly: false
  templateEntityRuntimeRollback: PolicyTemplateEntityRuntimeRollbackResult | null
  reasons: string[]
}

export interface RecordPolicyTemplateReleaseImpactMonitoringInput {
  queryExec: PolicyTemplateReleaseExecutionQueryExec
  sourceRunId: string
  targetTable: PolicyTemplateReleaseTargetTable
  monitoredAssetCount: number
  monitoringWindowHours?: number
  metrics?: Record<string, unknown>
  thresholdViolations?: string[]
  executedAt?: string
}

export interface PolicyTemplateReleaseImpactMonitoringResult {
  status: 'monitoring_passed' | 'monitoring_failed'
  targetTable: PolicyTemplateReleaseTargetTable
  sourceRunId: string
  monitoredAssetCount: number
  monitoringWindowHours: number
  thresholdViolations: string[]
  rollbackRecommended: boolean
  writesRuntimeDirectly: false
}

function buildBlockedResult<TRecord extends object>(
  releaseRecord: PolicyTemplateReleaseRecordResult<TRecord>,
): PolicyTemplateReleaseExecutionResult {
  return {
    status: 'blocked',
    targetTable: releaseRecord.targetTable,
    canPersist: false,
    writesRuntimeDirectly: false,
    reasons: releaseRecord.reasons.length > 0
      ? releaseRecord.reasons
      : ['release_exit_package_required'],
    runtimePublication: null,
    templateEntityRuntimePublication: null,
    rollbackExecution: null,
    impactMonitoring: null,
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readRunId(record: Record<string, unknown>) {
  return String(record.run_id ?? '')
}

function readPolicyOpsDecision(record: Record<string, unknown>) {
  const automationQuality = readRecord(record.automation_quality)
  return readRecord(automationQuality.policyOpsDecision)
}

function buildRuntimePublication(
  record: Record<string, unknown>,
  targetTable: PolicyTemplateReleaseTargetTable,
): PolicyTemplateReleaseRuntimePublication {
  const decision = readPolicyOpsDecision(record)
  const runtimeConsumptionStatus = String(decision.runtimeConsumptionStatus ?? 'candidate_only')
  const stableConsumptionAllowed = decision.stableConsumptionAllowed === true && runtimeConsumptionStatus === 'stable_consumable'

  return {
    status: stableConsumptionAllowed ? 'runtime_stable_published' : 'candidate_record_only',
    runtimeConsumptionStatus,
    stableConsumptionAllowed,
    promotionDecision: typeof decision.promotionDecision === 'string' ? decision.promotionDecision : null,
    consumptionPolicy: stableConsumptionAllowed
      ? 'business_preview_loads_latest_stable_auto_publish_run'
      : 'candidate_record_for_admin_audit_only',
    runtimeSourceTable: stableConsumptionAllowed ? targetTable : null,
    writesRuntimeDirectly: false,
  }
}

function buildRollbackExecution(
  releaseRecord: PolicyTemplateReleaseRecordResult<object>,
  executedAt: string,
): PolicyTemplateReleaseRollbackExecution {
  return {
    status: 'rollback_ready',
    rollbackTarget: String(releaseRecord.rollbackTarget),
    executionPolicy: 'restore_previous_seed_version_before_runtime_reenable',
    executedAt,
    targetTable: releaseRecord.targetTable,
  }
}

function resolveMonitoredAssetCount(
  record: Record<string, unknown>,
  explicitCount: number | undefined,
) {
  if (typeof explicitCount === 'number' && Number.isFinite(explicitCount) && explicitCount >= 0) {
    return explicitCount
  }
  const summary = record.summary as { autoPublishedUpdateCount?: unknown } | undefined
  const fromSummary = Number(summary?.autoPublishedUpdateCount)
  return Number.isFinite(fromSummary) && fromSummary >= 0 ? fromSummary : 0
}

function buildImpactMonitoring(
  record: Record<string, unknown>,
  executedAt: string,
  options: PolicyTemplateReleaseImpactMonitoringOptions | undefined,
): PolicyTemplateReleaseImpactMonitoring {
  return {
    status: 'monitoring_armed',
    monitoredAssetCount: resolveMonitoredAssetCount(record, options?.monitoredAssetCount),
    monitoringWindowHours: options?.monitoringWindowHours ?? 72,
    executedAt,
  }
}

function attachReleaseExecutionMetadata<TRecord extends object>(
  record: TRecord,
  releaseRecord: PolicyTemplateReleaseRecordResult<TRecord>,
  rollbackExecution: PolicyTemplateReleaseRollbackExecution,
  impactMonitoring: PolicyTemplateReleaseImpactMonitoring,
  executedAt: string,
): TRecord {
  const recordValues = record as Record<string, unknown>
  const automationQuality = (recordValues.automation_quality ?? {}) as Record<string, unknown>
  return {
    ...recordValues,
    automation_quality: {
      ...automationQuality,
      releaseExecution: {
        status: 'publish_record_persisted',
        targetTable: releaseRecord.targetTable,
        executedAt,
        writesRuntimeDirectly: false,
      },
      rollbackExecution,
      impactMonitoring,
    },
  } as TRecord
}

function buildInsertSql(table: PolicyTemplateReleaseTargetTable, record: Record<string, unknown>) {
  const columns = Object.keys(record)
  const placeholders = columns.map((_, index) => `$${index + 1}`)
  return {
    sql: `insert into public.${table} (${columns.join(', ')}) values (${placeholders.join(', ')})`,
    params: columns.map((column) => record[column]),
  }
}

function buildTemplateEntityRuntimePublicationInsert(publication: PolicyTemplateEntityRuntimePublication) {
  return {
    sql: `insert into public.policy_template_entity_runtime_publications (
      source_run_id,
      target_table,
      runtime_source_table,
      rollback_target,
      runtime_publication_status,
      runtime_record,
      writes_template_runtime,
      record_visibility_policy,
      published_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    params: [
      publication.sourceRunId,
      publication.targetTable,
      publication.runtimeSourceTable,
      publication.rollbackTarget,
      publication.runtimePublicationStatus,
      publication.runRecord,
      true,
      'backend_admin_governance_only',
      publication.executedAt,
    ],
  }
}

export async function persistPolicyTemplateEntityRuntimePublication(
  publication: PolicyTemplateEntityRuntimePublication,
  queryExec: PolicyTemplateReleaseExecutionQueryExec,
): Promise<PolicyTemplateEntityRuntimePublicationResult> {
  const insert = buildTemplateEntityRuntimePublicationInsert(publication)
  await queryExec(insert.sql, insert.params)
  return {
    status: 'template_runtime_published',
    sourceRunId: publication.sourceRunId,
    targetTable: publication.targetTable,
    runtimeSourceTable: publication.runtimeSourceTable,
    rollbackTarget: publication.rollbackTarget,
    executedAt: publication.executedAt,
    writesTemplateRuntime: true,
  }
}

function buildTemplateEntityRuntimeRollbackUpdate(rollback: PolicyTemplateEntityRuntimeRollback) {
  return {
    sql: `update public.policy_template_entity_runtime_publications
      set runtime_publication_status = 'runtime_rolled_back',
          rolled_back_at = $4,
          updated_at = $4
      where source_run_id = $1
        and target_table = $2
        and rollback_target = $3
        and runtime_publication_status = 'runtime_stable_published'`,
    params: [
      rollback.sourceRunId,
      rollback.targetTable,
      rollback.rollbackTarget,
      rollback.executedAt,
    ],
  }
}

export async function rollbackPolicyTemplateEntityRuntimePublication(
  rollback: PolicyTemplateEntityRuntimeRollback,
  queryExec: PolicyTemplateReleaseExecutionQueryExec,
): Promise<PolicyTemplateEntityRuntimeRollbackResult> {
  const update = buildTemplateEntityRuntimeRollbackUpdate(rollback)
  await queryExec(update.sql, update.params)
  return {
    status: 'template_runtime_rolled_back',
    sourceRunId: rollback.sourceRunId,
    targetTable: rollback.targetTable,
    rollbackTarget: rollback.rollbackTarget,
    executedAt: rollback.executedAt,
    writesTemplateRuntime: true,
    writesSeedRuntimeDirectly: false,
  }
}

function buildTemplateEntityRuntimePublication(
  sourceRunId: string,
  targetTable: PolicyTemplateReleaseTargetTable,
  runRecord: Record<string, unknown>,
  runtimePublication: PolicyTemplateReleaseRuntimePublication,
  rollbackExecution: PolicyTemplateReleaseRollbackExecution,
  executedAt: string,
): PolicyTemplateEntityRuntimePublication | null {
  if (!runtimePublication.stableConsumptionAllowed || runtimePublication.status !== 'runtime_stable_published' || !runtimePublication.runtimeSourceTable) {
    return null
  }

  return {
    sourceRunId,
    targetTable,
    runtimeSourceTable: runtimePublication.runtimeSourceTable,
    rollbackTarget: rollbackExecution.rollbackTarget,
    runtimePublicationStatus: runtimePublication.status,
    executedAt,
    runRecord,
  }
}

function buildExecutionEventInsert(
  input: {
    eventType: PolicyTemplateReleaseExecutionEventType
    eventStatus: PolicyTemplateReleaseExecutionEventStatus
    sourceRunId: string
    targetTable: PolicyTemplateReleaseTargetTable
    eventPayload: Record<string, unknown>
    executedAt: string
  },
) {
  return {
    sql: 'insert into public.policy_template_release_execution_events (event_type, event_status, source_run_id, target_table, event_payload, record_visibility_policy, executed_at) values ($1, $2, $3, $4, $5, $6, $7)',
    params: [
      input.eventType,
      input.eventStatus,
      input.sourceRunId,
      input.targetTable,
      input.eventPayload,
      'backend_admin_audit_only',
      input.executedAt,
    ],
  }
}

async function persistReleaseExecutionEvent(
  queryExec: PolicyTemplateReleaseExecutionQueryExec,
  input: Parameters<typeof buildExecutionEventInsert>[0],
) {
  const eventInsert = buildExecutionEventInsert(input)
  await queryExec(eventInsert.sql, eventInsert.params)
}

export async function persistPolicyTemplateReleaseExecution<TRecord extends object>(
  input: PersistPolicyTemplateReleaseExecutionInput<TRecord>,
): Promise<PolicyTemplateReleaseExecutionResult> {
  if (!input.releaseRecord.canPersist || input.releaseRecord.status !== 'release_record_ready' || !input.releaseRecord.runRecord || !input.releaseRecord.rollbackTarget) {
    return buildBlockedResult(input.releaseRecord)
  }

  const executedAt = input.executedAt ?? new Date().toISOString()
  const sourceRunId = readRunId(input.releaseRecord.runRecord as Record<string, unknown>)
  const rollbackExecution = buildRollbackExecution(
    input.releaseRecord as PolicyTemplateReleaseRecordResult<object>,
    executedAt,
  )
  const impactMonitoring = buildImpactMonitoring(
    input.releaseRecord.runRecord as Record<string, unknown>,
    executedAt,
    input.impactMonitoring,
  )
  const runtimePublication = buildRuntimePublication(
    input.releaseRecord.runRecord as Record<string, unknown>,
    input.releaseRecord.targetTable,
  )
  const runRecord = attachReleaseExecutionMetadata(
    input.releaseRecord.runRecord,
    input.releaseRecord,
    rollbackExecution,
    impactMonitoring,
    executedAt,
  )
  const insert = buildInsertSql(input.releaseRecord.targetTable, runRecord as Record<string, unknown>)

  await input.queryExec(insert.sql, insert.params)
  const templateEntityPublication = buildTemplateEntityRuntimePublication(
    sourceRunId,
    input.releaseRecord.targetTable,
    runRecord as Record<string, unknown>,
    runtimePublication,
    rollbackExecution,
    executedAt,
  )
  const templateEntityRuntimePublication = templateEntityPublication
    ? await (input.templateEntityRuntimeWriter ?? persistPolicyTemplateEntityRuntimePublication)(
      templateEntityPublication,
      input.queryExec,
    )
    : null
  await persistReleaseExecutionEvent(input.queryExec, {
    eventType: 'release_publication',
    eventStatus: runtimePublication.status,
    sourceRunId,
    targetTable: input.releaseRecord.targetTable,
    executedAt,
    eventPayload: {
      releaseExecution: {
        status: 'publish_record_persisted',
        targetTable: input.releaseRecord.targetTable,
        executedAt,
        writesRuntimeDirectly: false,
      },
      runtimePublication,
      templateEntityRuntimePublication,
      rollbackExecution,
      impactMonitoring,
    },
  })

  return {
    status: 'publish_record_persisted',
    targetTable: input.releaseRecord.targetTable,
    canPersist: true,
    writesRuntimeDirectly: false,
    reasons: [],
    runtimePublication,
    templateEntityRuntimePublication,
    rollbackExecution,
    impactMonitoring,
  }
}

export async function executePolicyTemplateReleaseRollback(
  input: ExecutePolicyTemplateReleaseRollbackInput,
): Promise<PolicyTemplateReleaseRollbackExecutionResult> {
  const executedAt = input.executedAt ?? new Date().toISOString()
  const reasons = [
    ...(input.sourceRunId ? [] : ['source_run_id_required']),
    ...(input.rollbackTarget ? [] : ['rollback_target_required']),
  ]
  const status: PolicyTemplateReleaseRollbackExecutionResult['status'] = reasons.length > 0
    ? 'rollback_blocked'
    : 'rollback_executed'
  const templateEntityRuntimeRollback = status === 'rollback_executed'
    ? await (input.templateEntityRuntimeRollbackWriter ?? rollbackPolicyTemplateEntityRuntimePublication)(
      {
        sourceRunId: input.sourceRunId,
        targetTable: input.targetTable,
        rollbackTarget: input.rollbackTarget,
        reason: input.reason ?? null,
        executedAt,
      },
      input.queryExec,
    )
    : null
  const result: PolicyTemplateReleaseRollbackExecutionResult = {
    status,
    targetTable: input.targetTable,
    sourceRunId: input.sourceRunId,
    rollbackTarget: input.rollbackTarget || null,
    restoredRuntimePolicy: 'previous_stable_auto_publish_run_retained',
    writesRuntimeDirectly: false,
    templateEntityRuntimeRollback,
    reasons,
  }

  await persistReleaseExecutionEvent(input.queryExec, {
    eventType: 'rollback_execution',
    eventStatus: status,
    sourceRunId: input.sourceRunId,
    targetTable: input.targetTable,
    executedAt,
    eventPayload: {
      rollbackTarget: input.rollbackTarget || null,
      restoredRuntimePolicy: result.restoredRuntimePolicy,
      reason: input.reason ?? null,
      writesRuntimeDirectly: false,
      templateEntityRuntimeRollback,
      reasons,
    },
  })

  return result
}

export async function recordPolicyTemplateReleaseImpactMonitoring(
  input: RecordPolicyTemplateReleaseImpactMonitoringInput,
): Promise<PolicyTemplateReleaseImpactMonitoringResult> {
  const executedAt = input.executedAt ?? new Date().toISOString()
  const thresholdViolations = input.thresholdViolations ?? []
  const status: PolicyTemplateReleaseImpactMonitoringResult['status'] = thresholdViolations.length > 0
    ? 'monitoring_failed'
    : 'monitoring_passed'
  const result: PolicyTemplateReleaseImpactMonitoringResult = {
    status,
    targetTable: input.targetTable,
    sourceRunId: input.sourceRunId,
    monitoredAssetCount: input.monitoredAssetCount,
    monitoringWindowHours: input.monitoringWindowHours ?? 72,
    thresholdViolations,
    rollbackRecommended: thresholdViolations.length > 0,
    writesRuntimeDirectly: false,
  }

  await persistReleaseExecutionEvent(input.queryExec, {
    eventType: 'impact_monitoring',
    eventStatus: status,
    sourceRunId: input.sourceRunId,
    targetTable: input.targetTable,
    executedAt,
    eventPayload: {
      monitoredAssetCount: result.monitoredAssetCount,
      monitoringWindowHours: result.monitoringWindowHours,
      metrics: input.metrics ?? {},
      thresholdViolations,
      rollbackRecommended: result.rollbackRecommended,
      writesRuntimeDirectly: false,
    },
  })

  return result
}
