import { executeSQL } from './dbService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import {
  getBaselineItems,
  getCurrentExecutionBaseline,
  markBaselinePendingRealign,
} from './baselineGovernanceService.js'
import { prepareBaselineGenerationForBaseline } from './baselineGenerationService.js'
import {
  startRevisionFromBaseline,
  submitObservationPoolItems,
} from './planningRevisionPoolService.js'
import type { TaskBaseline, TaskBaselineItem } from '../types/db.js'
import type { ObservationPoolSubmitRequest, RevisionSubmitResponse } from '../types/planning.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'
import { getAlgorithmAssetLearnableParameter } from './algorithmAssetLearnableParameterRegistryService.js'
import { resolveDurationContextPolicyRuntimeSelection } from './durationContextPolicySelectorService.js'

export type StableDurationRuntimePublication = {
  publicationKey: string
  publicationStatus: string
  parameterKey: string
  companyId?: string | null
  projectId?: string | null
  publishedAt?: string | null
  rollbackTarget?: string | null
  scopeLevel?: 'system' | 'company' | 'project' | null
}

export type DurationAssetBaselineProjectionTask = {
  taskId: string
  title?: string | null
  durationDays?: number | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
}

export type DurationAssetBaselineProjectionDependency = {
  predecessorId: string
  successorId: string
  type?: string | null
  lagDays?: number | null
}

export type DurationAssetBaselineProjection = {
  tasks: DurationAssetBaselineProjectionTask[]
  dependencies: DurationAssetBaselineProjectionDependency[]
}

export type DurationAssetBaselineChangedField = 'task_selection' | 'duration' | 'dates' | 'dependency'

export type DurationAssetBaselineRevisionBridgeResult = {
  status: 'no_revision_required' | 'revision_draft_created' | 'blocked'
  idempotencyKey: string
  publicationKey: string
  baselineId: string
  projectId: string
  changedFields: DurationAssetBaselineChangedField[]
  changedTaskIds: string[]
  revisionId: string | null
  revisionStatus: 'revising' | null
  confirmationRequired: boolean
  autoConfirmed: false
  reasonCodes: string[]
}

type DurationAssetBaselineRevisionOperationRecord = {
  idempotencyKey: string
  status: 'running' | 'succeeded' | 'failed'
  ownerId: string | null
  leaseExpiresAt: string | null
  result: DurationAssetBaselineRevisionBridgeResult | null
  errorMessage: string | null
  attemptCount: number
  updatedAt: string
}

export interface DurationAssetBaselineRevisionOperationStore {
  claim(input: {
    idempotencyKey: string
    ownerId: string
    leaseExpiresAt: string
    now: string
    context: Record<string, unknown>
  }): Promise<{
    disposition: 'execute' | 'reuse' | 'in_flight'
    record: DurationAssetBaselineRevisionOperationRecord
  }>
  complete(input: {
    idempotencyKey: string
    ownerId: string
    result: DurationAssetBaselineRevisionBridgeResult
    now: string
  }): Promise<void>
  fail(input: {
    idempotencyKey: string
    ownerId: string
    errorMessage: string
    now: string
  }): Promise<void>
}

export type DurationAssetBaselineRevisionBridgeDependencies = {
  markPendingRealign: (input: {
    baseline: Pick<TaskBaseline, 'id' | 'project_id' | 'status' | 'title' | 'source_type'>
    publication: StableDurationRuntimePublication
    changedFields: DurationAssetBaselineChangedField[]
  }) => Promise<unknown>
  submitObservationPoolItems: (input: {
    baseline: Pick<TaskBaseline, 'id' | 'project_id' | 'status' | 'title' | 'source_type'>
    payload: ObservationPoolSubmitRequest
    idempotencyKey?: string
  }) => Promise<{ submitted_count: number; candidate_ids: string[] }>
  startRevisionFromBaseline: (input: {
    baseline: Pick<TaskBaseline, 'id' | 'project_id' | 'status' | 'title' | 'source_type'>
    actorUserId?: string | null
    reason: string
    sourceCandidateIds?: string[]
    idempotencyKey?: string
  }) => Promise<RevisionSubmitResponse>
}

export type DurationAssetBaselineImpactScanDependencies = {
  loadStablePublications: () => Promise<StableDurationRuntimePublication[]>
  listAffectedProjectIds: (
    publication: StableDurationRuntimePublication,
    projectIds?: string[] | null,
  ) => Promise<string[]>
  getCurrentExecutionBaseline: (projectId: string) => Promise<TaskBaseline | null>
  getBaselineItems: (baselineId: string) => Promise<TaskBaselineItem[]>
  loadProjectDependencies: (projectId: string) => Promise<DurationAssetBaselineProjectionDependency[]>
  isPublicationEffectiveForProject: (
    publication: StableDurationRuntimePublication,
    projectId: string,
  ) => Promise<boolean>
  recalculateBaselineNoWrite: (input: {
    publication: StableDurationRuntimePublication
    baseline: TaskBaseline
    beforeProjection: DurationAssetBaselineProjection
    currentDependencies: DurationAssetBaselineProjectionDependency[]
  }) => Promise<DurationAssetBaselineProjection>
  revision: DurationAssetBaselineRevisionBridgeDependencies
}

type RevisionOperationQueryExec = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nowIso() {
  return new Date().toISOString()
}

function mapStablePublicationRow(row: Record<string, unknown>): StableDurationRuntimePublication {
  return {
    publicationKey: normalizeText(row.publication_key),
    publicationStatus: normalizeText(row.publication_status),
    parameterKey: normalizeText(row.parameter_key),
    companyId: normalizeText(row.company_id) || null,
    projectId: normalizeText(row.project_id) || null,
    publishedAt: normalizeText(row.published_at) || null,
    rollbackTarget: normalizeText(row.rollback_target) || null,
    scopeLevel: (normalizeText(row.scope_level) || null) as StableDurationRuntimePublication['scopeLevel'],
  }
}

// workspace-isolation-system-job-approved: scheduler scans shared stable publications, then resolves and processes affected projects within each publication scope.
async function loadStableDurationRuntimePublications(): Promise<StableDurationRuntimePublication[]> {
  const rows = await executeSQL<Record<string, unknown>>(
    `select publication_key, publication_status, parameter_key, company_id,
            project_id, published_at, rollback_target, scope_level
      from public.algorithm_learnable_parameter_runtime_publications
      where publication_status = 'published'
        and left(parameter_key, 9) = 'duration.'
      order by published_at desc
      limit 200`,
  )
  return rows.map(mapStablePublicationRow).filter((row) => row.publicationKey && row.parameterKey)
}

async function listPublicationAffectedProjectIds(
  publication: StableDurationRuntimePublication,
  projectIds?: string[] | null,
) {
  const activeProjectIds = await listActiveProjectIds(projectIds)
  if (publication.projectId) {
    return activeProjectIds.includes(publication.projectId) ? [publication.projectId] : []
  }
  if (!publication.companyId) return activeProjectIds
  const companyProjects = await executeSQL<{ id: string }>(
    'select id from public.projects where company_id = $1',
    [publication.companyId],
  )
  const companyProjectIds = new Set(companyProjects.map((row) => normalizeText(row.id)).filter(Boolean))
  return activeProjectIds.filter((projectId) => companyProjectIds.has(projectId))
}

async function loadProjectDependencyProjection(projectId: string) {
  const rows = await executeSQL<Record<string, unknown>>(
    `select task_id, dependency_task_id, dependency_type, lag_days, status
       from public.task_dependencies
      where project_id = $1`,
    [projectId],
  )
  return rows
    .filter((row) => !normalizeText(row.status) || normalizeText(row.status) === 'active')
    .map((row) => ({
      predecessorId: normalizeText(row.dependency_task_id),
      successorId: normalizeText(row.task_id),
      type: normalizeText(row.dependency_type) || 'FS',
      lagDays: Number.isFinite(Number(row.lag_days)) ? Number(row.lag_days) : 0,
    }))
    .filter((row) => row.predecessorId && row.successorId)
}

async function isStablePublicationEffectiveForProject(
  publication: StableDurationRuntimePublication,
  projectId: string,
) {
  const projectRows = await executeSQL<{ company_id?: string | null }>(
    'select company_id from public.projects where id = $1 limit 1',
    [projectId],
  )
  const companyId = normalizeText(publication.companyId)
    || normalizeText(projectRows[0]?.company_id)
    || null
  if (!companyId) return false
  const registered = getAlgorithmAssetLearnableParameter(publication.parameterKey)
  const deterministicValue = typeof registered?.currentValue === 'number'
    ? registered.currentValue
    : 0
  const selection = await resolveDurationContextPolicyRuntimeSelection({
    parameterKey: publication.parameterKey,
    deterministicValue,
    companyId,
    projectId,
    allowSystemScope: true,
  })
  return selection.runtimeApplied
    && selection.publicationStatus === 'published'
    && selection.publicationKey === publication.publicationKey
}

type DurationAssetBaselineProjectionItem = Partial<Pick<
  TaskBaselineItem,
  'id' | 'source_task_id' | 'source_milestone_id' | 'title' | 'planned_start_date' | 'planned_end_date'
>>

function baselineProjectionTaskId(item: DurationAssetBaselineProjectionItem) {
  return normalizeText(item.source_task_id)
    || normalizeText(item.source_milestone_id)
    || normalizeText(item.id)
    || normalizeText(item.title)
}

export function buildDurationAssetBaselineProjection(
  items: DurationAssetBaselineProjectionItem[],
  dependencies: DurationAssetBaselineProjectionDependency[],
): DurationAssetBaselineProjection {
  const taskIds = new Set(items.map(baselineProjectionTaskId).filter(Boolean))
  return {
    tasks: items.map((item) => ({
      taskId: baselineProjectionTaskId(item),
      title: item.title ?? null,
      durationDays: inclusiveDurationDays(item.planned_start_date, item.planned_end_date),
      plannedStartDate: item.planned_start_date ?? null,
      plannedEndDate: item.planned_end_date ?? null,
    })),
    dependencies: dependencies.filter((dependency) => (
      taskIds.has(normalizeText(dependency.predecessorId))
      && taskIds.has(normalizeText(dependency.successorId))
    )),
  }
}

async function recalculateBaselineProjectionNoWrite(input: {
  baseline: TaskBaseline
  currentDependencies: DurationAssetBaselineProjectionDependency[]
}) {
  const preparation = await prepareBaselineGenerationForBaseline(input.baseline.id, {
    projectId: input.baseline.project_id,
    runtimeEvidenceMode: 'no_write',
  })
  return buildDurationAssetBaselineProjection(preparation.generatedItems, input.currentDependencies)
}

function defaultImpactScanDependencies(): DurationAssetBaselineImpactScanDependencies {
  return {
    loadStablePublications: loadStableDurationRuntimePublications,
    listAffectedProjectIds: listPublicationAffectedProjectIds,
    getCurrentExecutionBaseline,
    getBaselineItems,
    loadProjectDependencies: loadProjectDependencyProjection,
    isPublicationEffectiveForProject: isStablePublicationEffectiveForProject,
    recalculateBaselineNoWrite: recalculateBaselineProjectionNoWrite,
    revision: {
      markPendingRealign: async ({ baseline, publication }) => markBaselinePendingRealign({
        baseline,
        reason: 'stable_duration_publication_material_diff',
        sourceReference: publication.publicationKey,
      }),
      submitObservationPoolItems: async (input) => submitObservationPoolItems({
        ...input,
        baseline: input.baseline as TaskBaseline,
      }),
      startRevisionFromBaseline: async (input) => startRevisionFromBaseline({
        ...input,
        baseline: input.baseline as TaskBaseline,
      }),
    },
  }
}

export function createInMemoryDurationAssetBaselineRevisionOperationStore(): DurationAssetBaselineRevisionOperationStore {
  const records = new Map<string, DurationAssetBaselineRevisionOperationRecord>()
  return {
    async claim(input) {
      const existing = records.get(input.idempotencyKey)
      if (existing?.status === 'succeeded' && existing.result) {
        return { disposition: 'reuse', record: clone(existing) }
      }
      if (
        existing?.status === 'running'
        && existing.leaseExpiresAt
        && existing.leaseExpiresAt.localeCompare(input.now) > 0
      ) {
        return { disposition: 'in_flight', record: clone(existing) }
      }
      const record: DurationAssetBaselineRevisionOperationRecord = {
        idempotencyKey: input.idempotencyKey,
        status: 'running',
        ownerId: input.ownerId,
        leaseExpiresAt: input.leaseExpiresAt,
        result: null,
        errorMessage: null,
        attemptCount: (existing?.attemptCount ?? 0) + 1,
        updatedAt: input.now,
      }
      records.set(input.idempotencyKey, record)
      return { disposition: 'execute', record: clone(record) }
    },
    async complete(input) {
      const record = records.get(input.idempotencyKey)
      if (!record || record.status !== 'running' || record.ownerId !== input.ownerId) {
        throw new Error(`duration_revision_operation_completion_lease_mismatch:${input.idempotencyKey}`)
      }
      records.set(input.idempotencyKey, {
        ...record,
        status: 'succeeded',
        ownerId: null,
        leaseExpiresAt: null,
        result: clone(input.result),
        errorMessage: null,
        updatedAt: input.now,
      })
    },
    async fail(input) {
      const record = records.get(input.idempotencyKey)
      if (!record || record.status !== 'running' || record.ownerId !== input.ownerId) return
      records.set(input.idempotencyKey, {
        ...record,
        status: 'failed',
        ownerId: null,
        leaseExpiresAt: null,
        errorMessage: input.errorMessage,
        updatedAt: input.now,
      })
    },
  }
}

function mapOperationRow(row: Record<string, unknown>): DurationAssetBaselineRevisionOperationRecord {
  return {
    idempotencyKey: normalizeText(row.idempotency_key),
    status: normalizeText(row.operation_status) as DurationAssetBaselineRevisionOperationRecord['status'],
    ownerId: normalizeText(row.lease_owner) || null,
    leaseExpiresAt: normalizeText(row.lease_expires_at) || null,
    result: row.operation_result && typeof row.operation_result === 'object'
      ? row.operation_result as DurationAssetBaselineRevisionBridgeResult
      : null,
    errorMessage: normalizeText(row.error_message) || null,
    attemptCount: Math.max(0, Math.trunc(Number(row.attempt_count) || 0)),
    updatedAt: normalizeText(row.updated_at),
  }
}

export function createDatabaseDurationAssetBaselineRevisionOperationStore(
  queryExec: RevisionOperationQueryExec = executeSQL,
): DurationAssetBaselineRevisionOperationStore {
  const selectOperation = async (idempotencyKey: string) => {
    const rows = await queryExec<Record<string, unknown>>(
      'select idempotency_key, operation_status, lease_owner, lease_expires_at, operation_result, error_message, attempt_count, updated_at from public.duration_asset_baseline_revision_operations where idempotency_key = $1 limit 1',
      [idempotencyKey],
    )
    return rows[0] ? mapOperationRow(rows[0]) : null
  }
  return {
    async claim(input) {
      const inserted = await queryExec<Record<string, unknown>>(
        `insert into public.duration_asset_baseline_revision_operations (
          idempotency_key, operation_status, lease_owner, lease_expires_at,
          operation_context, attempt_count, created_at, updated_at
        ) values ($1, 'running', $2, $3, $4, 1, $5, $5)
        on conflict (idempotency_key) do nothing
        returning idempotency_key, operation_status, lease_owner, lease_expires_at,
                  operation_result, error_message, attempt_count, updated_at`,
        [input.idempotencyKey, input.ownerId, input.leaseExpiresAt, input.context, input.now],
      )
      if (inserted[0]) return { disposition: 'execute', record: mapOperationRow(inserted[0]) }
      const existing = await selectOperation(input.idempotencyKey)
      if (!existing) throw new Error(`duration_revision_operation_claim_disappeared:${input.idempotencyKey}`)
      if (existing.status === 'succeeded' && existing.result) return { disposition: 'reuse', record: existing }
      if (existing.status === 'running' && existing.leaseExpiresAt && existing.leaseExpiresAt.localeCompare(input.now) > 0) {
        return { disposition: 'in_flight', record: existing }
      }
      const claimed = await queryExec<Record<string, unknown>>(
        `update public.duration_asset_baseline_revision_operations
            set operation_status = 'running', lease_owner = $2, lease_expires_at = $3,
                operation_context = $4, error_message = null,
                attempt_count = attempt_count + 1, updated_at = $5
          where idempotency_key = $1
            and (operation_status = 'failed' or lease_expires_at is null or lease_expires_at <= $5)
        returning idempotency_key, operation_status, lease_owner, lease_expires_at,
                  operation_result, error_message, attempt_count, updated_at`,
        [input.idempotencyKey, input.ownerId, input.leaseExpiresAt, input.context, input.now],
      )
      if (claimed[0]) return { disposition: 'execute', record: mapOperationRow(claimed[0]) }
      const current = await selectOperation(input.idempotencyKey)
      if (!current) throw new Error(`duration_revision_operation_claim_disappeared:${input.idempotencyKey}`)
      return current.status === 'succeeded' && current.result
        ? { disposition: 'reuse', record: current }
        : { disposition: 'in_flight', record: current }
    },
    async complete(input) {
      const rows = await queryExec<Record<string, unknown>>(
        `update public.duration_asset_baseline_revision_operations
            set operation_status = 'succeeded', operation_result = $3,
                lease_owner = null, lease_expires_at = null, error_message = null, updated_at = $4
          where idempotency_key = $1 and operation_status = 'running' and lease_owner = $2
        returning idempotency_key`,
        [input.idempotencyKey, input.ownerId, input.result, input.now],
      )
      if (!rows[0]) throw new Error(`duration_revision_operation_completion_lease_mismatch:${input.idempotencyKey}`)
    },
    async fail(input) {
      await queryExec(
        `update public.duration_asset_baseline_revision_operations
            set operation_status = 'failed', lease_owner = null, lease_expires_at = null,
                error_message = $3, updated_at = $4
          where idempotency_key = $1 and operation_status = 'running' and lease_owner = $2`,
        [input.idempotencyKey, input.ownerId, input.errorMessage, input.now],
      )
    },
  }
}

function normalizedTask(task: DurationAssetBaselineProjectionTask) {
  return {
    taskId: normalizeText(task.taskId),
    durationDays: Number.isFinite(Number(task.durationDays)) ? Number(task.durationDays) : null,
    plannedStartDate: normalizeText(task.plannedStartDate) || null,
    plannedEndDate: normalizeText(task.plannedEndDate) || null,
  }
}

function dependencyKey(dependency: DurationAssetBaselineProjectionDependency) {
  return `${normalizeText(dependency.predecessorId)}>${normalizeText(dependency.successorId)}`
}

export function compareDurationAssetBaselineProjections(
  before: DurationAssetBaselineProjection,
  after: DurationAssetBaselineProjection,
) {
  const changedFields = new Set<DurationAssetBaselineChangedField>()
  const changedTaskIds = new Set<string>()
  const beforeTasks = new Map(before.tasks.map((task) => [normalizeText(task.taskId), normalizedTask(task)]))
  const afterTasks = new Map(after.tasks.map((task) => [normalizeText(task.taskId), normalizedTask(task)]))
  for (const taskId of new Set([...beforeTasks.keys(), ...afterTasks.keys()])) {
    const left = beforeTasks.get(taskId)
    const right = afterTasks.get(taskId)
    if (!left || !right) {
      changedFields.add('task_selection')
      changedTaskIds.add(taskId)
      continue
    }
    if (left.durationDays !== right.durationDays) {
      changedFields.add('duration')
      changedTaskIds.add(taskId)
    }
    if (left.plannedStartDate !== right.plannedStartDate || left.plannedEndDate !== right.plannedEndDate) {
      changedFields.add('dates')
      changedTaskIds.add(taskId)
    }
  }
  const beforeDependencies = new Map(before.dependencies.map((dependency) => [dependencyKey(dependency), dependency]))
  const afterDependencies = new Map(after.dependencies.map((dependency) => [dependencyKey(dependency), dependency]))
  for (const key of new Set([...beforeDependencies.keys(), ...afterDependencies.keys()])) {
    const left = beforeDependencies.get(key)
    const right = afterDependencies.get(key)
    if (
      !left
      || !right
      || normalizeText(left.type) !== normalizeText(right.type)
      || Number(left.lagDays ?? 0) !== Number(right.lagDays ?? 0)
    ) {
      changedFields.add('dependency')
      if (left) {
        changedTaskIds.add(normalizeText(left.predecessorId))
        changedTaskIds.add(normalizeText(left.successorId))
      }
      if (right) {
        changedTaskIds.add(normalizeText(right.predecessorId))
        changedTaskIds.add(normalizeText(right.successorId))
      }
    }
  }
  return {
    changedFields: Array.from(changedFields).sort() as DurationAssetBaselineChangedField[],
    changedTaskIds: Array.from(changedTaskIds).filter(Boolean).sort(),
  }
}

function blockedResult(input: {
  idempotencyKey: string
  publication: StableDurationRuntimePublication
  baseline: Pick<TaskBaseline, 'id' | 'project_id'>
  reasonCodes: string[]
}): DurationAssetBaselineRevisionBridgeResult {
  return {
    status: 'blocked',
    idempotencyKey: input.idempotencyKey,
    publicationKey: input.publication.publicationKey,
    baselineId: input.baseline.id,
    projectId: input.baseline.project_id,
    changedFields: [],
    changedTaskIds: [],
    revisionId: null,
    revisionStatus: null,
    confirmationRequired: false,
    autoConfirmed: false,
    reasonCodes: input.reasonCodes,
  }
}

export async function runDurationAssetBaselineRevisionBridge(input: {
  publication: StableDurationRuntimePublication
  baseline: Pick<TaskBaseline, 'id' | 'project_id' | 'status' | 'title' | 'source_type'>
  beforeProjection: DurationAssetBaselineProjection
  recalculateNoWrite: () => Promise<DurationAssetBaselineProjection>
  operationStore?: DurationAssetBaselineRevisionOperationStore
  dependencies: DurationAssetBaselineRevisionBridgeDependencies
  ownerId?: string
}) {
  const idempotencyKey = `${normalizeText(input.publication.publicationKey)}:${normalizeText(input.baseline.id)}`
  if (input.publication.publicationStatus !== 'published') {
    return blockedResult({
      idempotencyKey,
      publication: input.publication,
      baseline: input.baseline,
      reasonCodes: ['stable_publication_required'],
    })
  }
  if (!normalizeText(input.publication.rollbackTarget)) {
    return blockedResult({
      idempotencyKey,
      publication: input.publication,
      baseline: input.baseline,
      reasonCodes: ['rollback_target_required'],
    })
  }
  if (!['confirmed', 'pending_realign'].includes(normalizeText(input.baseline.status))) {
    return blockedResult({
      idempotencyKey,
      publication: input.publication,
      baseline: input.baseline,
      reasonCodes: ['confirmed_or_pending_realign_baseline_required'],
    })
  }
  const operationStore = input.operationStore ?? createDatabaseDurationAssetBaselineRevisionOperationStore()
  const ownerId = input.ownerId ?? `duration-revision-${nowIso()}`
  const startedAt = nowIso()
  const claim = await operationStore.claim({
    idempotencyKey,
    ownerId,
    now: startedAt,
    leaseExpiresAt: new Date(Date.parse(startedAt) + 15 * 60 * 1_000).toISOString(),
    context: {
      publication: input.publication,
      baselineId: input.baseline.id,
      projectId: input.baseline.project_id,
    },
  })
  if (claim.disposition === 'reuse' && claim.record.result) return claim.record.result
  if (claim.disposition === 'in_flight') {
    return blockedResult({
      idempotencyKey,
      publication: input.publication,
      baseline: input.baseline,
      reasonCodes: ['revision_operation_in_flight'],
    })
  }

  try {
    const afterProjection = await input.recalculateNoWrite()
    const diff = compareDurationAssetBaselineProjections(input.beforeProjection, afterProjection)
    if (diff.changedFields.length === 0) {
      const result: DurationAssetBaselineRevisionBridgeResult = {
        status: 'no_revision_required',
        idempotencyKey,
        publicationKey: input.publication.publicationKey,
        baselineId: input.baseline.id,
        projectId: input.baseline.project_id,
        changedFields: [],
        changedTaskIds: [],
        revisionId: null,
        revisionStatus: null,
        confirmationRequired: false,
        autoConfirmed: false,
        reasonCodes: ['no_material_task_duration_date_or_dependency_diff'],
      }
      await operationStore.complete({ idempotencyKey, ownerId, result, now: nowIso() })
      return result
    }

    await input.dependencies.markPendingRealign({
      baseline: input.baseline,
      publication: input.publication,
      changedFields: diff.changedFields,
    })
    const observation = await input.dependencies.submitObservationPoolItems({
      baseline: { ...input.baseline, status: 'pending_realign' },
      idempotencyKey: `${idempotencyKey}:revision_pool`,
      payload: {
        project_id: input.baseline.project_id,
        baseline_version_id: input.baseline.id,
        items: [{
          source_type: 'deviation',
          source_id: idempotencyKey,
          title: `Duration asset publication affects baseline ${input.baseline.id}`,
          reason: `Publication ${input.publication.publicationKey} changes ${diff.changedFields.join(', ')} for ${diff.changedTaskIds.length} task(s).`,
          severity: diff.changedFields.includes('task_selection') || diff.changedFields.includes('dependency') ? 'high' : 'medium',
          priority: diff.changedFields.includes('task_selection') || diff.changedFields.includes('dependency') ? 'high' : 'medium',
          affects_critical_milestone: false,
        }],
      },
    })
    const revision = await input.dependencies.startRevisionFromBaseline({
      baseline: { ...input.baseline, status: 'pending_realign' },
      actorUserId: null,
      reason: `System-generated draft for stable duration publication ${input.publication.publicationKey}; project manager confirmation required.`,
      sourceCandidateIds: observation.candidate_ids,
      idempotencyKey: `${idempotencyKey}:revision_draft`,
    })
    if (revision.status !== 'revising') throw new Error('duration_revision_draft_must_remain_revising')
    const result: DurationAssetBaselineRevisionBridgeResult = {
      status: 'revision_draft_created',
      idempotencyKey,
      publicationKey: input.publication.publicationKey,
      baselineId: input.baseline.id,
      projectId: input.baseline.project_id,
      changedFields: diff.changedFields,
      changedTaskIds: diff.changedTaskIds,
      revisionId: revision.revision_id,
      revisionStatus: 'revising',
      confirmationRequired: true,
      autoConfirmed: false,
      reasonCodes: ['stable_publication_material_diff_requires_pm_confirmation'],
    }
    await operationStore.complete({ idempotencyKey, ownerId, result, now: nowIso() })
    return result
  } catch (error) {
    await operationStore.fail({
      idempotencyKey,
      ownerId,
      errorMessage: error instanceof Error ? error.message : String(error),
      now: nowIso(),
    })
    throw error
  }
}

export async function scanStableDurationPublicationBaselineImpacts(input: {
  projectIds?: string[] | null
  publicationKeys?: string[] | null
  operationStore?: DurationAssetBaselineRevisionOperationStore
  dependencies?: DurationAssetBaselineImpactScanDependencies
} = {}): Promise<DurationAssetBaselineRevisionBridgeResult[]> {
  const dependencies = input.dependencies ?? defaultImpactScanDependencies()
  const publicationKeys = Array.isArray(input.publicationKeys)
    ? new Set(input.publicationKeys.map(normalizeText).filter(Boolean))
    : null
  const publications = (await dependencies.loadStablePublications())
    .filter((publication) => publication.publicationStatus === 'published')
    .filter((publication) => normalizeText(publication.parameterKey).startsWith('duration.'))
    .filter((publication) => !publicationKeys || publicationKeys.has(publication.publicationKey))
  const reports: DurationAssetBaselineRevisionBridgeResult[] = []

  for (const publication of publications) {
    const projectIds = Array.from(new Set(
      await dependencies.listAffectedProjectIds(publication, input.projectIds),
    )).filter(Boolean)
    for (const projectId of projectIds) {
      if (!await dependencies.isPublicationEffectiveForProject(publication, projectId)) continue
      const baseline = await dependencies.getCurrentExecutionBaseline(projectId)
      if (!baseline || !['confirmed', 'pending_realign'].includes(normalizeText(baseline.status))) continue
      const [baselineItems, currentDependencies] = await Promise.all([
        dependencies.getBaselineItems(baseline.id),
        dependencies.loadProjectDependencies(projectId),
      ])
      const beforeProjection = buildDurationAssetBaselineProjection(baselineItems, currentDependencies)
      reports.push(await runDurationAssetBaselineRevisionBridge({
        publication,
        baseline,
        beforeProjection,
        operationStore: input.operationStore,
        dependencies: dependencies.revision,
        recalculateNoWrite: () => dependencies.recalculateBaselineNoWrite({
          publication,
          baseline,
          beforeProjection,
          currentDependencies,
        }),
      }))
    }
  }

  return reports
}
