import { createHash } from 'node:crypto'

import {
  isDatabaseTransactionActive,
  query as rawQuery,
  withDatabaseTransaction,
} from '../database.js'

export const EXECUTION_FACT_ENTITY_TYPES = [
  'task',
  'risk',
  'issue',
  'material_batch',
  'drawing_version',
  'certificate_work_item',
  'acceptance_plan',
] as const

export type ExecutionFactEntityType = typeof EXECUTION_FACT_ENTITY_TYPES[number]

export const EXECUTION_FACT_TYPES = [
  'task.actual_start_date',
  'task.actual_end_date',
  'task.first_progress_at',
  'task.progress',
  'task.status',
  'risk.status',
  'risk.closure',
  'issue.status',
  'issue.closure',
  'material_batch.actual_arrival_date',
  'drawing_version.current',
  'certificate_work_item.status',
  'certificate_work_item.actual_finish_date',
  'acceptance_plan.status',
  'acceptance_plan.actual_date',
] as const

export type ExecutionFactType = typeof EXECUTION_FACT_TYPES[number]
export type ExecutionFactSupersessionKind = 'initial' | 'new_observation' | 'correction'

export interface ExecutionFactCorrection {
  supersedesEventId?: string | null
  reason: string
}

export interface RecordExecutionFactInput {
  companyId?: string | null
  projectId: string
  entityType: ExecutionFactEntityType
  entityId: string
  factType: ExecutionFactType
  value: unknown
  effectiveAt: string
  observedAt?: string
  sourceModule: string
  sourceEventId: string
  actorUserId?: string | null
  evidenceRefs?: string[]
  confidence?: number
  idempotencyKey: string
  correction?: ExecutionFactCorrection | null
}

export interface ExecutionFactEvent {
  id: string
  companyId: string
  projectId: string
  entityType: ExecutionFactEntityType
  entityId: string
  factType: ExecutionFactType
  value: unknown
  effectiveAt: string
  observedAt: string
  sourceModule: string
  sourceEventId: string
  actorUserId: string | null
  evidenceRefs: string[]
  confidence: number
  supersedesEventId: string | null
  supersessionKind: ExecutionFactSupersessionKind
  correctionReason: string | null
  idempotencyKey: string
  createdAt: string
}

export interface RecordExecutionFactResult {
  event: ExecutionFactEvent
  disposition: 'created' | 'reused'
}

export type ExecutionFactQueryExecutor = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export type ExecutionFactTransactionRunner = <T>(work: () => Promise<T>) => Promise<T>

export interface ExecutionFactDependencies {
  queryExec?: ExecutionFactQueryExecutor
  isTransactionActive?: () => boolean
}

export interface ListCurrentExecutionFactsInput {
  projectId: string
  entityType: ExecutionFactEntityType
  entityIds: readonly string[]
  factTypes?: readonly ExecutionFactType[]
}

export interface RunExecutionFactProjectionInput<T> {
  applyProjection: () => Promise<T>
  buildFacts: (projection: T) => RecordExecutionFactInput[]
}

export interface RunExecutionFactProjectionDependencies extends ExecutionFactDependencies {
  transactionRunner?: ExecutionFactTransactionRunner
}

export interface ExecutionFactProjectionChange {
  factType: ExecutionFactType
  previousValue: unknown
  nextValue: unknown
  force?: boolean
  effectiveAt?: string | null
  evidenceRefs?: string[]
  confidence?: number
}

export interface BuildChangedExecutionFactInputsInput {
  companyId?: string | null
  projectId: string
  entityType: ExecutionFactEntityType
  entityId: string
  sourceModule: string
  sourceMutationId: string
  actorUserId?: string | null
  observedAt: string
  correctionReason?: string | null
  changes: ExecutionFactProjectionChange[]
}

const FACT_TYPES_BY_ENTITY: Record<ExecutionFactEntityType, ReadonlySet<ExecutionFactType>> = {
  task: new Set([
    'task.actual_start_date',
    'task.actual_end_date',
    'task.first_progress_at',
    'task.progress',
    'task.status',
  ]),
  risk: new Set(['risk.status', 'risk.closure']),
  issue: new Set(['issue.status', 'issue.closure']),
  material_batch: new Set(['material_batch.actual_arrival_date']),
  drawing_version: new Set(['drawing_version.current']),
  certificate_work_item: new Set([
    'certificate_work_item.status',
    'certificate_work_item.actual_finish_date',
  ]),
  acceptance_plan: new Set(['acceptance_plan.status', 'acceptance_plan.actual_date']),
}

const ENTITY_SCOPE_QUERIES: Record<ExecutionFactEntityType, string> = {
  task: 'SELECT entity.project_id FROM public.tasks entity WHERE entity.id = $1 AND entity.project_id = $2 FOR KEY SHARE',
  risk: 'SELECT entity.project_id FROM public.risks entity WHERE entity.id = $1 AND entity.project_id = $2 FOR KEY SHARE',
  issue: 'SELECT entity.project_id FROM public.issues entity WHERE entity.id = $1 AND entity.project_id = $2 FOR KEY SHARE',
  material_batch: 'SELECT entity.project_id FROM public.project_materials entity WHERE entity.id = $1 AND entity.project_id = $2 FOR KEY SHARE',
  drawing_version: 'SELECT entity.project_id FROM public.drawing_versions entity WHERE entity.id = $1 AND entity.project_id = $2 FOR KEY SHARE',
  certificate_work_item: 'SELECT entity.project_id FROM public.certificate_work_items entity WHERE entity.id = $1 AND entity.project_id = $2 FOR KEY SHARE',
  acceptance_plan: 'SELECT entity.project_id FROM public.acceptance_plans entity WHERE entity.id = $1 AND entity.project_id = $2 FOR KEY SHARE',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DATE_FACT_TYPES = new Set<ExecutionFactType>([
  'task.actual_start_date',
  'task.actual_end_date',
  'material_batch.actual_arrival_date',
  'certificate_work_item.actual_finish_date',
  'acceptance_plan.actual_date',
])
const STATUS_FACT_TYPES = new Set<ExecutionFactType>([
  'task.status',
  'risk.status',
  'issue.status',
  'certificate_work_item.status',
  'acceptance_plan.status',
])

function executionFactError(code: string, message: string, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode })
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function requireText(value: unknown, field: string, maxLength: number) {
  const normalized = normalizeText(value)
  if (!normalized || normalized.length > maxLength) {
    throw executionFactError('EXECUTION_FACT_INPUT_INVALID', `${field} is required and must not exceed ${maxLength} characters`)
  }
  return normalized
}

function requireUuid(value: unknown, field: string) {
  const normalized = requireText(value, field, 36)
  if (!UUID_PATTERN.test(normalized)) {
    throw executionFactError('EXECUTION_FACT_INPUT_INVALID', `${field} must be a UUID`)
  }
  return normalized
}

function normalizeTimestamp(value: unknown, field: string) {
  const normalized = requireText(value, field, 64)
  const timestamp = new Date(normalized)
  if (!Number.isFinite(timestamp.getTime())) {
    throw executionFactError('EXECUTION_FACT_INPUT_INVALID', `${field} must be an ISO timestamp`)
  }
  return timestamp.toISOString()
}

function isValidDateOnly(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw executionFactError('EXECUTION_FACT_VALUE_INVALID', 'execution fact numeric values must be finite')
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    )
  }
  throw executionFactError('EXECUTION_FACT_VALUE_INVALID', 'execution fact value must be JSON serializable')
}

function stableJson(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

function normalizeFactValue(factType: ExecutionFactType, value: unknown) {
  if (DATE_FACT_TYPES.has(factType)) {
    if (value === null) return null
    const normalized = normalizeText(value)
    if (!isValidDateOnly(normalized)) {
      throw executionFactError('EXECUTION_FACT_VALUE_INVALID', `${factType} must be null or YYYY-MM-DD`)
    }
    return normalized
  }
  if (factType === 'task.first_progress_at') {
    if (value === null) return null
    return normalizeTimestamp(value, factType)
  }
  if (factType === 'task.progress') {
    const progress = Number(value)
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      throw executionFactError('EXECUTION_FACT_VALUE_INVALID', 'task.progress must be an integer from 0 to 100')
    }
    return progress
  }
  if (STATUS_FACT_TYPES.has(factType)) {
    return requireText(value, factType, 80)
  }
  if (factType === 'drawing_version.current') {
    if (typeof value !== 'boolean') {
      throw executionFactError('EXECUTION_FACT_VALUE_INVALID', 'drawing_version.current must be boolean')
    }
    return value
  }
  if (factType === 'risk.closure' || factType === 'issue.closure') {
    const record = asRecord(value)
    if (!record) {
      throw executionFactError('EXECUTION_FACT_VALUE_INVALID', `${factType} must be an object`)
    }
    return canonicalValue(record)
  }
  return canonicalValue(value)
}

function normalizeEvidenceRefs(values: readonly unknown[] | undefined) {
  const refs = Array.from(new Set((values ?? []).map(normalizeText).filter(Boolean)))
  if (refs.length > 100 || refs.some((value) => value.length > 512)) {
    throw executionFactError('EXECUTION_FACT_INPUT_INVALID', 'execution fact evidence references exceed their bounded contract')
  }
  return refs
}

function parseJsonValue(value: unknown) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function rowToEvent(row: Record<string, unknown>): ExecutionFactEvent {
  return {
    id: normalizeText(row.id),
    companyId: normalizeText(row.company_id),
    projectId: normalizeText(row.project_id),
    entityType: normalizeText(row.entity_type) as ExecutionFactEntityType,
    entityId: normalizeText(row.entity_id),
    factType: normalizeText(row.fact_type) as ExecutionFactType,
    value: parseJsonValue(row.fact_value),
    effectiveAt: normalizeTimestamp(row.effective_at, 'effective_at'),
    observedAt: normalizeTimestamp(row.observed_at, 'observed_at'),
    sourceModule: normalizeText(row.source_module),
    sourceEventId: normalizeText(row.source_event_id),
    actorUserId: normalizeText(row.actor_user_id) || null,
    evidenceRefs: Array.isArray(parseJsonValue(row.evidence_refs))
      ? (parseJsonValue(row.evidence_refs) as unknown[]).map(normalizeText).filter(Boolean)
      : [],
    confidence: Number(row.confidence ?? 1),
    supersedesEventId: normalizeText(row.supersedes_event_id) || null,
    supersessionKind: normalizeText(row.supersession_kind) as ExecutionFactSupersessionKind,
    correctionReason: normalizeText(row.correction_reason) || null,
    idempotencyKey: normalizeText(row.idempotency_key),
    createdAt: normalizeTimestamp(row.created_at, 'created_at'),
  }
}

async function defaultQueryExec<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  // database-query-dynamic-approved: execution-fact governance owns fixed parameterized SQL templates; callers provide only bound values.
  const result = await rawQuery(sql, params)
  return result.rows as T[]
}

export async function listCurrentExecutionFacts(
  input: ListCurrentExecutionFactsInput,
  dependencies: Pick<ExecutionFactDependencies, 'queryExec'> = {},
): Promise<ExecutionFactEvent[]> {
  const projectId = requireUuid(input.projectId, 'projectId')
  const allowedFactTypes = FACT_TYPES_BY_ENTITY[input.entityType]
  if (!allowedFactTypes) {
    throw executionFactError('EXECUTION_FACT_INPUT_INVALID', 'entityType is not governed')
  }
  const entityIds = Array.from(new Set(input.entityIds.map((entityId) => requireUuid(entityId, 'entityId'))))
  if (entityIds.length === 0) return []
  const factTypes = Array.from(new Set(input.factTypes ?? [...allowedFactTypes]))
  if (factTypes.length === 0 || factTypes.some((factType) => !allowedFactTypes.has(factType))) {
    throw executionFactError('EXECUTION_FACT_TYPE_MISMATCH', 'requested fact types are not owned by the entity type')
  }

  const queryExec = dependencies.queryExec ?? defaultQueryExec
  const rows = await queryExec<Record<string, unknown>>(
    `SELECT event.*
       FROM public.current_execution_facts event
      WHERE event.project_id = $1
        AND event.entity_type = $2
        AND event.entity_id = ANY($3::uuid[])
        AND event.fact_type = ANY($4::text[])
      ORDER BY event.entity_id, event.fact_type`,
    [projectId, input.entityType, entityIds, factTypes],
  )
  return rows.map(rowToEvent)
}

function normalizeInput(input: RecordExecutionFactInput) {
  const projectId = requireUuid(input.projectId, 'projectId')
  const entityId = requireUuid(input.entityId, 'entityId')
  const companyId = input.companyId == null ? null : requireUuid(input.companyId, 'companyId')
  const sourceModule = requireText(input.sourceModule, 'sourceModule', 160)
  const sourceEventId = requireText(input.sourceEventId, 'sourceEventId', 256)
  const idempotencyKey = requireText(input.idempotencyKey, 'idempotencyKey', 256)
  const actorUserId = input.actorUserId == null ? null : requireUuid(input.actorUserId, 'actorUserId')
  const allowedFactTypes = FACT_TYPES_BY_ENTITY[input.entityType]
  if (!allowedFactTypes || !allowedFactTypes.has(input.factType)) {
    throw executionFactError('EXECUTION_FACT_TYPE_MISMATCH', `${input.factType} is not owned by ${input.entityType}`)
  }
  const effectiveAt = normalizeTimestamp(input.effectiveAt, 'effectiveAt')
  const observedAt = input.observedAt
    ? normalizeTimestamp(input.observedAt, 'observedAt')
    : new Date().toISOString()
  const confidence = input.confidence ?? 1
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw executionFactError('EXECUTION_FACT_INPUT_INVALID', 'confidence must be between 0 and 1')
  }
  const correction = input.correction
    ? {
        supersedesEventId: input.correction.supersedesEventId == null
          ? null
          : requireUuid(input.correction.supersedesEventId, 'correction.supersedesEventId'),
        reason: requireText(input.correction.reason, 'correction.reason', 1000),
      }
    : null

  return {
    companyId,
    projectId,
    entityType: input.entityType,
    entityId,
    factType: input.factType,
    value: normalizeFactValue(input.factType, input.value),
    effectiveAt,
    observedAt,
    sourceModule,
    sourceEventId,
    actorUserId,
    evidenceRefs: normalizeEvidenceRefs(input.evidenceRefs),
    confidence,
    idempotencyKey,
    correction,
  }
}

function assertIdempotentReplayMatches(
  existing: ExecutionFactEvent,
  input: ReturnType<typeof normalizeInput>,
) {
  const mismatched = existing.projectId !== input.projectId
    || existing.entityType !== input.entityType
    || existing.entityId !== input.entityId
    || existing.factType !== input.factType
    || stableJson(existing.value) !== stableJson(input.value)
    || existing.effectiveAt !== input.effectiveAt
    || existing.observedAt !== input.observedAt
    || existing.sourceModule !== input.sourceModule
    || existing.sourceEventId !== input.sourceEventId
    || existing.actorUserId !== input.actorUserId
    || stableJson(existing.evidenceRefs) !== stableJson(input.evidenceRefs)
    || existing.confidence !== input.confidence
    || (input.correction
      ? existing.supersessionKind !== 'correction'
        || (input.correction.supersedesEventId != null
          && existing.supersedesEventId !== input.correction.supersedesEventId)
        || existing.correctionReason !== input.correction.reason
      : existing.supersessionKind === 'correction')

  if (mismatched) {
    throw executionFactError(
      'EXECUTION_FACT_IDEMPOTENCY_CONFLICT',
      'execution fact idempotency key already owns a different immutable event',
      409,
    )
  }
}

export function buildExecutionFactIdempotencyKey(input: {
  companyId?: string | null
  projectId: string
  entityType: ExecutionFactEntityType
  entityId: string
  factType: ExecutionFactType
  sourceModule: string
  sourceEventId: string
}) {
  return createHash('sha256').update(stableJson({
    version: 1,
    companyId: normalizeText(input.companyId) || null,
    projectId: normalizeText(input.projectId),
    entityType: input.entityType,
    entityId: normalizeText(input.entityId),
    factType: input.factType,
    sourceModule: normalizeText(input.sourceModule),
    sourceEventId: normalizeText(input.sourceEventId),
  })).digest('hex')
}

export function buildChangedExecutionFactInputs(
  input: BuildChangedExecutionFactInputsInput,
): RecordExecutionFactInput[] {
  const sourceModule = requireText(input.sourceModule, 'sourceModule', 160)
  const sourceMutationId = requireText(input.sourceMutationId, 'sourceMutationId', 180)
  const observedAt = normalizeTimestamp(input.observedAt, 'observedAt')
  const correctionReason = normalizeText(input.correctionReason)

  return input.changes
    .filter((change) => change.force === true || stableJson(change.previousValue) !== stableJson(change.nextValue))
    .map((change) => {
      const sourceEventId = `${sourceMutationId}:${change.factType}`
      return {
        companyId: input.companyId,
        projectId: input.projectId,
        entityType: input.entityType,
        entityId: input.entityId,
        factType: change.factType,
        value: change.nextValue,
        effectiveAt: change.effectiveAt
          ? normalizeTimestamp(change.effectiveAt, `${change.factType}.effectiveAt`)
          : observedAt,
        observedAt,
        sourceModule,
        sourceEventId,
        actorUserId: input.actorUserId ?? null,
        evidenceRefs: change.evidenceRefs,
        confidence: change.confidence,
        idempotencyKey: buildExecutionFactIdempotencyKey({
          companyId: input.companyId,
          projectId: input.projectId,
          entityType: input.entityType,
          entityId: input.entityId,
          factType: change.factType,
          sourceModule,
          sourceEventId,
        }),
        correction: correctionReason ? { reason: correctionReason } : undefined,
      }
    })
}

export async function recordChangedExecutionFacts(
  input: BuildChangedExecutionFactInputsInput,
  dependencies: ExecutionFactDependencies = {},
) {
  const facts = buildChangedExecutionFactInputs(input)
  const results: RecordExecutionFactResult[] = []
  for (const fact of facts) {
    results.push(await recordExecutionFact(fact, dependencies))
  }
  return results
}

export async function recordExecutionFact(
  rawInput: RecordExecutionFactInput,
  dependencies: ExecutionFactDependencies = {},
): Promise<RecordExecutionFactResult> {
  const transactionActive = dependencies.isTransactionActive ?? isDatabaseTransactionActive
  if (!transactionActive()) {
    throw executionFactError(
      'EXECUTION_FACT_TRANSACTION_REQUIRED',
      'execution facts and compatibility projections must share one database transaction',
      500,
    )
  }

  const input = normalizeInput(rawInput)
  const queryExec = dependencies.queryExec ?? defaultQueryExec
  const projectRows = await queryExec<{ company_id?: string | null }>(
    'SELECT project.company_id FROM public.projects project WHERE project.id = $1 FOR KEY SHARE',
    [input.projectId],
  )
  const authoritativeCompanyId = normalizeText(projectRows[0]?.company_id)
  if (!authoritativeCompanyId) {
    throw executionFactError('EXECUTION_FACT_PROJECT_NOT_FOUND', 'execution fact project was not found', 404)
  }
  if (input.companyId && input.companyId !== authoritativeCompanyId) {
    throw executionFactError('EXECUTION_FACT_TENANT_MISMATCH', 'execution fact project does not belong to the supplied company', 403)
  }

  const entityRows = await queryExec<{ project_id?: string | null }>(
    ENTITY_SCOPE_QUERIES[input.entityType],
    [input.entityId, input.projectId],
  )
  if (normalizeText(entityRows[0]?.project_id) !== input.projectId) {
    throw executionFactError('EXECUTION_FACT_ENTITY_SCOPE_MISMATCH', 'execution fact entity does not belong to the supplied project', 403)
  }

  const existingRows = await queryExec<Record<string, unknown>>(
    `SELECT event.*
       FROM public.execution_fact_events event
      WHERE event.company_id = $1
        AND event.idempotency_key = $2
      FOR UPDATE`,
    [authoritativeCompanyId, input.idempotencyKey],
  )
  if (existingRows[0]) {
    const existing = rowToEvent(existingRows[0])
    assertIdempotentReplayMatches(existing, input)
    return { event: existing, disposition: 'reused' }
  }

  const currentRows = await queryExec<Record<string, unknown>>(
    `SELECT event.*
       FROM public.execution_fact_events event
      WHERE event.company_id = $1
        AND event.project_id = $2
        AND event.entity_type = $3
        AND event.entity_id = $4
        AND event.fact_type = $5
        AND NOT EXISTS (
          SELECT 1
            FROM public.execution_fact_events successor
           WHERE successor.supersedes_event_id = event.id
        )
      ORDER BY event.effective_at DESC, event.observed_at DESC, event.id DESC
      LIMIT 1
      FOR UPDATE`,
    [authoritativeCompanyId, input.projectId, input.entityType, input.entityId, input.factType],
  )
  const current = currentRows[0] ? rowToEvent(currentRows[0]) : null

  let supersedesEventId: string | null = current?.id ?? null
  let supersessionKind: ExecutionFactSupersessionKind = current ? 'new_observation' : 'initial'
  let correctionReason: string | null = null
  if (input.correction) {
    if (!current) {
      throw executionFactError(
        'EXECUTION_FACT_CORRECTION_BASE_REQUIRED',
        'execution fact correction requires an existing current stream head',
        409,
      )
    }
    if (input.correction.supersedesEventId && current.id !== input.correction.supersedesEventId) {
      throw executionFactError(
        'EXECUTION_FACT_CORRECTION_STALE',
        'execution fact correction must supersede the current stream head',
        409,
      )
    }
    supersedesEventId = current.id
    supersessionKind = 'correction'
    correctionReason = input.correction.reason
  }

  const insertedRows = await queryExec<Record<string, unknown>>(
    `INSERT INTO public.execution_fact_events (
       company_id, project_id, entity_type, entity_id, fact_type, fact_value,
       effective_at, observed_at, source_module, source_event_id, actor_user_id,
       evidence_refs, confidence, supersedes_event_id, supersession_kind,
       correction_reason, idempotency_key
     ) VALUES (
       $1, $2, $3, $4, $5, $6::JSONB,
       $7, $8, $9, $10, $11,
       $12::JSONB, $13, $14, $15,
       $16, $17
     )
     RETURNING *`,
    [
      authoritativeCompanyId,
      input.projectId,
      input.entityType,
      input.entityId,
      input.factType,
      stableJson(input.value),
      input.effectiveAt,
      input.observedAt,
      input.sourceModule,
      input.sourceEventId,
      input.actorUserId,
      stableJson(input.evidenceRefs),
      input.confidence,
      supersedesEventId,
      supersessionKind,
      correctionReason,
      input.idempotencyKey,
    ],
  )
  if (!insertedRows[0]) {
    throw executionFactError('EXECUTION_FACT_PERSISTENCE_FAILED', 'execution fact insert returned no row', 500)
  }

  return { event: rowToEvent(insertedRows[0]), disposition: 'created' }
}

export async function runExecutionFactProjection<T>(
  input: RunExecutionFactProjectionInput<T>,
  dependencies: RunExecutionFactProjectionDependencies = {},
) {
  const transactionRunner = dependencies.transactionRunner ?? withDatabaseTransaction
  return transactionRunner(async () => {
    const projection = await input.applyProjection()
    const facts = input.buildFacts(projection)
    if (facts.length === 0) {
      throw executionFactError(
        'EXECUTION_FACT_PROJECTION_EMPTY',
        'an execution-fact projection must persist at least one governed fact',
        500,
      )
    }
    const results: RecordExecutionFactResult[] = []
    for (const fact of facts) {
      results.push(await recordExecutionFact(fact, dependencies))
    }
    return { projection, facts: results }
  })
}
