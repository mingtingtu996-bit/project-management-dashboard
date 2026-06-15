import type {
  SpecialWorkDurationSeedPublicationReadiness,
  SpecialWorkDurationSeedVersionLineage,
} from './wbsTemplateCandidateEventService.js'
import type {
  WbsReferenceDaysLineage,
  WbsReferenceDaysPublicationReadiness,
} from './wbsTemplateGoldenBenchmarkGateService.js'

export type WbsTemplateRuntimePublicationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type WbsTemplateRuntimePublicationReadiness =
  | SpecialWorkDurationSeedPublicationReadiness
  | WbsReferenceDaysPublicationReadiness

export type WbsTemplateRuntimeAssetKind =
  | 'special_work_duration_seed'
  | 'wbs_reference_days'

export type WbsTemplateRuntimePublication = {
  publicationKey: string
  assetKind: WbsTemplateRuntimeAssetKind
  assetVersionId: string
  runtimePublicationStatus: 'runtime_published'
  runtimeLineage: SpecialWorkDurationSeedVersionLineage | WbsReferenceDaysLineage
  rollbackTarget: string
  companyId: string
  projectId: string | null
  impactMonitoring: {
    status: 'monitoring_armed'
    monitoredAssetCount: number
    monitoringWindowHours: number
    executedAt: string
  }
}

export type WbsTemplateRuntimePublicationResult = {
  status: 'wbs_template_runtime_published' | 'blocked'
  assetKind: WbsTemplateRuntimeAssetKind | null
  canPersist: boolean
  writesWbsTemplateRuntime: boolean
  writesTemplatesDirectly: false
  writesTasksOrBaselinesDirectly: false
  writesSeedRuntimeDirectly: false
  publicationKey: string | null
  rollbackTarget: string | null
  reasons: string[]
  runtimePublication: WbsTemplateRuntimePublication | null
}

export type PersistWbsTemplateRuntimePublicationInput = {
  readiness: WbsTemplateRuntimePublicationReadiness
  companyId?: string | null
  projectId?: string | null
  queryExec: WbsTemplateRuntimePublicationQueryExec
  executedAt?: string
  impactMonitoring?: {
    monitoredAssetCount?: number
    monitoringWindowHours?: number
  }
}

export type ExecuteWbsTemplateRuntimeRollbackInput = {
  queryExec: WbsTemplateRuntimePublicationQueryExec
  companyId?: string | null
  projectId?: string | null
  sourcePublicationKey: string
  rollbackTarget: string
  reason?: string
  executedAt?: string
}

export type WbsTemplateRuntimeRollbackResult = {
  status: 'rollback_executed' | 'rollback_blocked'
  sourcePublicationKey: string
  rollbackTarget: string | null
  restoredRuntimePolicy: 'previous_wbs_template_runtime_publication_retained'
  writesWbsTemplateRuntime: boolean
  writesTemplatesDirectly: false
  writesTasksOrBaselinesDirectly: false
  writesSeedRuntimeDirectly: false
  reasons: string[]
}

export type ResolveWbsTemplateRuntimePublicationInput = {
  queryExec: WbsTemplateRuntimePublicationQueryExec
  publicationKey: string
  companyId?: string | null
  projectId?: string | null
}

export type WbsTemplateRuntimePublicationResolution = {
  runtimeConsumable: boolean
  publicationKey: string | null
  assetKind: string | null
  assetVersionId: string | null
  runtimePublicationStatus: string | null
  runtimeLineage: unknown | null
  rollbackTarget: string | null
  companyId: string | null
  projectId: string | null
  reasons: string[]
}

type WbsTemplateRuntimePublicationRow = {
  publication_key?: unknown
  publicationKey?: unknown
  asset_kind?: unknown
  assetKind?: unknown
  asset_version_id?: unknown
  assetVersionId?: unknown
  runtime_publication_status?: unknown
  runtimePublicationStatus?: unknown
  runtime_lineage?: unknown
  runtimeLineage?: unknown
  rollback_target?: unknown
  rollbackTarget?: unknown
  company_id?: unknown
  companyId?: unknown
  project_id?: unknown
  projectId?: unknown
}

type ExtractedReadiness = {
  ready: boolean
  assetKind: WbsTemplateRuntimeAssetKind
  assetVersionId: string | null
  publicationKey: string | null
  rollbackTarget: string | null
  runtimeLineage: SpecialWorkDurationSeedVersionLineage | WbsReferenceDaysLineage
  missingReasons: string[]
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

function isReferenceDaysReadiness(
  readiness: WbsTemplateRuntimePublicationReadiness,
): readiness is WbsReferenceDaysPublicationReadiness {
  return 'referenceDaysLineage' in readiness
}

function extractReadiness(readiness: WbsTemplateRuntimePublicationReadiness): ExtractedReadiness {
  if (isReferenceDaysReadiness(readiness)) {
    return {
      ready: readiness.status === 'wbs_reference_days_publication_ready',
      assetKind: 'wbs_reference_days',
      assetVersionId: nullableText(readiness.referenceDaysLineage.referenceDaysVersionId),
      publicationKey: nullableText(readiness.referenceDaysLineage.runtimePublicationKey),
      rollbackTarget: nullableText(readiness.referenceDaysLineage.rollbackTarget),
      runtimeLineage: readiness.referenceDaysLineage,
      missingReasons: readiness.missingReasons,
    }
  }

  return {
    ready: readiness.status === 'special_work_seed_publication_ready',
    assetKind: 'special_work_duration_seed',
    assetVersionId: nullableText(readiness.seedVersionLineage.seedVersionId),
    publicationKey: nullableText(readiness.seedVersionLineage.runtimePublicationKey),
    rollbackTarget: nullableText(readiness.seedVersionLineage.rollbackTarget),
    runtimeLineage: readiness.seedVersionLineage,
    missingReasons: readiness.missingReasons,
  }
}

function blockedPublication(
  extracted: ExtractedReadiness,
  reasons: string[],
): WbsTemplateRuntimePublicationResult {
  return {
    status: 'blocked',
    assetKind: extracted.assetKind,
    canPersist: false,
    writesWbsTemplateRuntime: false,
    writesTemplatesDirectly: false,
    writesTasksOrBaselinesDirectly: false,
    writesSeedRuntimeDirectly: false,
    publicationKey: extracted.publicationKey,
    rollbackTarget: extracted.rollbackTarget,
    reasons: uniqueReasons(reasons.length > 0 ? reasons : extracted.missingReasons),
    runtimePublication: null,
  }
}

function buildRuntimePublication(
  extracted: ExtractedReadiness,
  input: PersistWbsTemplateRuntimePublicationInput,
  companyId: string,
  executedAt: string,
): WbsTemplateRuntimePublication {
  return {
    publicationKey: extracted.publicationKey ?? '',
    assetKind: extracted.assetKind,
    assetVersionId: extracted.assetVersionId ?? '',
    runtimePublicationStatus: 'runtime_published',
    runtimeLineage: extracted.runtimeLineage,
    rollbackTarget: extracted.rollbackTarget ?? '',
    companyId,
    projectId: nullableText(input.projectId),
    impactMonitoring: {
      status: 'monitoring_armed',
      monitoredAssetCount: input.impactMonitoring?.monitoredAssetCount ?? 0,
      monitoringWindowHours: input.impactMonitoring?.monitoringWindowHours ?? 72,
      executedAt,
    },
  }
}

async function persistRuntimeEvent(
  queryExec: WbsTemplateRuntimePublicationQueryExec,
  input: {
    companyId: string
    projectId: string | null
    eventType: 'wbs_template_runtime_publication' | 'rollback_execution' | 'impact_monitoring'
    eventStatus: string
    sourcePublicationKey: string
    eventPayload: Record<string, unknown>
    executedAt: string
  },
) {
  await queryExec(
    'insert into public.wbs_template_runtime_events (company_id, project_id, event_type, event_status, source_publication_key, event_payload, record_visibility_policy, executed_at) values ($1, $2, $3, $4, $5, $6, $7, $8)',
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

export async function persistWbsTemplateRuntimePublication(
  input: PersistWbsTemplateRuntimePublicationInput,
): Promise<WbsTemplateRuntimePublicationResult> {
  const extracted = extractReadiness(input.readiness)
  const companyId = nullableText(input.companyId)
  const reasons = [
    ...(extracted.ready ? [] : extracted.missingReasons.length > 0 ? extracted.missingReasons : ['wbs_template_publication_ready_required']),
    ...(companyId ? [] : ['company_scope_required']),
    ...(extracted.assetVersionId ? [] : ['asset_version_required']),
    ...(extracted.publicationKey ? [] : ['runtime_publication_key_required']),
    ...(extracted.rollbackTarget ? [] : ['rollback_target_required']),
  ]

  if (reasons.length > 0 || !companyId) {
    return blockedPublication(extracted, reasons)
  }

  const executedAt = input.executedAt ?? new Date().toISOString()
  const runtimePublication = buildRuntimePublication(extracted, input, companyId, executedAt)

  await input.queryExec(
    `insert into public.wbs_template_runtime_publications (
      publication_key,
      asset_kind,
      asset_version_id,
      company_id,
      project_id,
      runtime_publication_status,
      runtime_lineage,
      rollback_target,
      impact_monitoring,
      record_visibility_policy,
      published_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      runtimePublication.publicationKey,
      runtimePublication.assetKind,
      runtimePublication.assetVersionId,
      runtimePublication.companyId,
      runtimePublication.projectId,
      runtimePublication.runtimePublicationStatus,
      runtimePublication.runtimeLineage,
      runtimePublication.rollbackTarget,
      runtimePublication.impactMonitoring,
      'backend_admin_governance_only',
      executedAt,
    ],
  )
  await persistRuntimeEvent(input.queryExec, {
    companyId,
    projectId: runtimePublication.projectId,
    eventType: 'wbs_template_runtime_publication',
    eventStatus: 'wbs_template_runtime_published',
    sourcePublicationKey: runtimePublication.publicationKey,
    executedAt,
    eventPayload: {
      runtimePublication,
      writesTemplatesDirectly: false,
      writesTasksOrBaselinesDirectly: false,
      writesSeedRuntimeDirectly: false,
    },
  })

  return {
    status: 'wbs_template_runtime_published',
    assetKind: runtimePublication.assetKind,
    canPersist: true,
    writesWbsTemplateRuntime: true,
    writesTemplatesDirectly: false,
    writesTasksOrBaselinesDirectly: false,
    writesSeedRuntimeDirectly: false,
    publicationKey: runtimePublication.publicationKey,
    rollbackTarget: runtimePublication.rollbackTarget,
    reasons: [],
    runtimePublication,
  }
}

function rowField(row: WbsTemplateRuntimePublicationRow, snakeKey: keyof WbsTemplateRuntimePublicationRow, camelKey: keyof WbsTemplateRuntimePublicationRow) {
  return row[snakeKey] ?? row[camelKey]
}

export async function resolveWbsTemplateRuntimePublication(
  input: ResolveWbsTemplateRuntimePublicationInput,
): Promise<WbsTemplateRuntimePublicationResolution> {
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
      assetKind: null,
      assetVersionId: null,
      runtimePublicationStatus: null,
      runtimeLineage: null,
      rollbackTarget: null,
      companyId,
      projectId,
      reasons,
    }
  }

  const rows = await input.queryExec<WbsTemplateRuntimePublicationRow>(
    `select publication_key,
            asset_kind,
            asset_version_id,
            runtime_publication_status,
            runtime_lineage,
            rollback_target,
            company_id,
            project_id
       from public.wbs_template_runtime_publications
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
      assetKind: null,
      assetVersionId: null,
      runtimePublicationStatus: null,
      runtimeLineage: null,
      rollbackTarget: null,
      companyId,
      projectId,
      reasons: ['wbs_template_runtime_publication_not_found_or_not_consumable'],
    }
  }

  return {
    runtimeConsumable: true,
    publicationKey: normalizeText(rowField(row, 'publication_key', 'publicationKey')),
    assetKind: normalizeText(rowField(row, 'asset_kind', 'assetKind')),
    assetVersionId: normalizeText(rowField(row, 'asset_version_id', 'assetVersionId')),
    runtimePublicationStatus: normalizeText(rowField(row, 'runtime_publication_status', 'runtimePublicationStatus')),
    runtimeLineage: rowField(row, 'runtime_lineage', 'runtimeLineage') ?? null,
    rollbackTarget: nullableText(rowField(row, 'rollback_target', 'rollbackTarget')),
    companyId: nullableText(rowField(row, 'company_id', 'companyId')),
    projectId: nullableText(rowField(row, 'project_id', 'projectId')),
    reasons: [],
  }
}

export async function executeWbsTemplateRuntimeRollback(
  input: ExecuteWbsTemplateRuntimeRollbackInput,
): Promise<WbsTemplateRuntimeRollbackResult> {
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
  const status: WbsTemplateRuntimeRollbackResult['status'] = reasons.length > 0
    ? 'rollback_blocked'
    : 'rollback_executed'

  if (status === 'rollback_executed' && companyId) {
    await input.queryExec(
      `update public.wbs_template_runtime_publications
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
          restoredRuntimePolicy: 'previous_wbs_template_runtime_publication_retained',
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
        restoredRuntimePolicy: 'previous_wbs_template_runtime_publication_retained',
        writesTemplatesDirectly: false,
        writesTasksOrBaselinesDirectly: false,
        writesSeedRuntimeDirectly: false,
      },
    })
  }

  return {
    status,
    sourcePublicationKey,
    rollbackTarget: rollbackTarget || null,
    restoredRuntimePolicy: 'previous_wbs_template_runtime_publication_retained',
    writesWbsTemplateRuntime: status === 'rollback_executed',
    writesTemplatesDirectly: false,
    writesTasksOrBaselinesDirectly: false,
    writesSeedRuntimeDirectly: false,
    reasons,
  }
}
