// 数据库服务层（Supabase PostgreSQL）
// 封装所有数据库操作，对外接口与原 dbService.ts 完全兼容
// 使用 @supabase/supabase-js SDK + Supabase REST API

import { v4 as uuidv4 } from 'uuid'
import type {
  Project,
  Task,
  Risk,
  Issue,
  Milestone,
  ProjectMember,
  Invitation,
  TaskProgressSnapshot,
} from '../types/db.js'
import {
  isDatabaseTransactionActive,
  query as rawQuery,
  registerDatabasePostCommitEffect,
  withDatabaseTransaction,
} from '../database.js'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import { isCompletedTask, isCompletedTaskStatus } from '../utils/taskStatus.js'
import type { WriteLifecycleLogParams, WriteLogParams } from '../types/changeLogs.js'
import {
  ExecutionFactIntent,
  applyExecutionFactGovernance,
} from './planningScheduleGovernanceService.js'
import {
  PROTECTED_ISSUE_SOURCE_TYPES,
  PROTECTED_RISK_SOURCE_TYPES,
  buildIssueConfirmClosePatch,
  buildIssueKeepProcessingPatch,
  buildIssueRetentionClosePatch,
  buildRiskConfirmClosePatch,
  buildRiskKeepProcessingPatch,
  buildRiskRetentionClosePatch,
  computeDynamicIssuePriority,
  getIssueBasePriority,
  isProtectedIssueRecord,
  type RetentionClosureContext,
  type RiskIssueClosureOutcomeInput,
} from '../domain/riskIssueWorkflowPolicy.js'
import { classifyProgressSnapshotSource, normalizeProgressSnapshotSource } from '../utils/progressSnapshotSource.js'
import { shouldRecordTaskProgressSnapshot } from '../utils/taskProgressSnapshotPolicy.js'
import {
  createSupabaseRuntimeClient,
  resolveSupabaseRuntimeClientCredentials,
} from './runtimeCredentialBoundary.js'
import { createJobLeaseFencedFetch } from './jobLeaseFenceContext.js'
import {
  recordChangedExecutionFacts,
  type ExecutionFactProjectionChange,
} from './executionFactGovernanceService.js'

export interface DbServiceBusinessSideEffectAdapters {
  writeLog?: (params: WriteLogParams) => Promise<unknown> | unknown
  writeLifecycleLog?: (params: WriteLifecycleLogParams) => Promise<unknown> | unknown
  enqueueProjectHealthUpdate?: (projectId: string, trigger: string) => Promise<unknown> | unknown
  syncProjectDataQuality?: (projectId: string) => Promise<unknown> | unknown
  evaluateTaskConstraint?: (taskId: string, options: { projectId: string; sourceEventType: string }) => Promise<unknown> | unknown
  finalizeTaskWrite?: (task: Task, previousTask?: Task | null, actorId?: string | null) => Promise<unknown> | unknown
}

let businessSideEffectAdapters: DbServiceBusinessSideEffectAdapters = {}

export function registerDbServiceBusinessSideEffectAdapters(adapters: DbServiceBusinessSideEffectAdapters) {
  businessSideEffectAdapters = { ...businessSideEffectAdapters, ...adapters }
}

export function assertDbServiceBusinessSideEffectAdaptersRegistered() {
  const requiredAdapters: Array<keyof DbServiceBusinessSideEffectAdapters> = [
    'writeLog',
    'writeLifecycleLog',
    'enqueueProjectHealthUpdate',
    'syncProjectDataQuality',
    'evaluateTaskConstraint',
    'finalizeTaskWrite',
  ]
  const missingAdapters = requiredAdapters.filter((name) => !businessSideEffectAdapters[name])
  if (missingAdapters.length > 0) {
    throw new Error(`[dbService] missing business side-effect adapters: ${missingAdapters.join(', ')}`)
  }
}

function runBusinessSideEffect(
  name: keyof DbServiceBusinessSideEffectAdapters,
  task: (() => Promise<unknown> | unknown) | undefined,
  context: Record<string, unknown>,
) {
  if (!task) {
    logger.warn('[dbService] business side-effect adapter is not registered', { name, ...context })
    return
  }
  try {
    void Promise.resolve(task()).catch((error) => {
      logger.warn('[dbService] business side-effect failed', {
        name,
        ...context,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  } catch (error) {
    logger.warn('[dbService] business side-effect failed synchronously', {
      name,
      ...context,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// ─── Supabase 初始化 ──────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const { gatewayKey: supabaseGatewayKey, runtimeKey: supabaseRuntimeKey } = resolveSupabaseRuntimeClientCredentials()

if (!supabaseUrl || !supabaseGatewayKey || !supabaseRuntimeKey) {
  console.warn('[dbService] WARNING: SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_RUNTIME_KEY not set')
}

const supabase = createSupabaseRuntimeClient(supabaseUrl, {
  global: {
    fetch: createJobLeaseFencedFetch(),
  },
})

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const SUPABASE_REST_QUERY_TIMEOUT_MS = readPositiveIntEnv('SUPABASE_REST_QUERY_TIMEOUT_MS', 4000)
const DB_DIRECT_QUERY_TIMEOUT_MS = readPositiveIntEnv('DB_DIRECT_QUERY_TIMEOUT_MS', 4000)
const SUPABASE_REST_CIRCUIT_BREAKER_MS = readPositiveIntEnv('SUPABASE_REST_CIRCUIT_BREAKER_MS', 15000)
const DB_DIRECT_QUERY_CIRCUIT_BREAKER_MS = readPositiveIntEnv('DB_DIRECT_QUERY_CIRCUIT_BREAKER_MS', 10000)
const TASK_READ_CACHE_TTL_MS = readPositiveIntEnv('TASK_READ_CACHE_TTL_MS', 3000)
const TASK_READ_STALE_TTL_MS = readPositiveIntEnv('TASK_READ_STALE_TTL_MS', 60000)
const TASK_READ_REST_FIRST = process.env.TASK_READ_DIRECT_FIRST !== 'true'

function shouldUseDirectSqlPath() {
  const configuredMode = String(process.env.DB_SQL_EXECUTION_MODE ?? '').trim().toLowerCase()
  if (configuredMode === 'direct') return true
  if (configuredMode === 'rest') return false

  return Boolean(process.env.DB_CONNECTION_STRING?.trim())
    && !process.env.SUPABASE_RUNTIME_KEY?.trim()
}

export function usesDirectSqlRuntimePath() {
  return isDatabaseTransactionActive() || shouldUseDirectSqlPath()
}

function asProjectRows(data: unknown): Project[] {
  return Array.isArray(data) ? (data as Project[]) : []
}

type AbortablePromiseLike<T> = PromiseLike<T> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<T>
}

let supabaseRestCircuitOpenUntil = 0
let dbDirectQueryCircuitOpenUntil = 0

type TaskReadCacheEntry = {
  projectId: string | null
  rows: Task[]
  expiresAt: number
  staleUntil: number
}

const taskReadCache = new Map<string, TaskReadCacheEntry>()
const taskReadInFlight = new Map<string, Promise<Task[]>>()
const taskReadInvalidationVersion = new Map<string, number>()

function remainingCircuitMs(openUntil: number) {
  return Math.max(0, openUntil - Date.now())
}

function isCircuitOpen(openUntil: number) {
  return remainingCircuitMs(openUntil) > 0
}

function markSupabaseRestCircuitOpen() {
  supabaseRestCircuitOpenUntil = Date.now() + SUPABASE_REST_CIRCUIT_BREAKER_MS
}

function markDbDirectQueryCircuitOpen() {
  dbDirectQueryCircuitOpenUntil = Date.now() + DB_DIRECT_QUERY_CIRCUIT_BREAKER_MS
}

function observeTimedQuery<T>(
  promise: PromiseLike<T>,
  label: string,
  isTimedOut: () => boolean,
): Promise<T> {
  return Promise.resolve(promise).then(
    (value) => {
      if (!isTimedOut()) {
        return value
      }

      logger.warn('dbService late database resolution after timeout', { label })
      return new Promise<T>(() => {})
    },
    (error) => {
      if (!isTimedOut()) {
        throw error
      }

      logger.warn('dbService late database rejection after timeout', {
        label,
        error: error instanceof Error ? error.message : String(error),
      })
      return new Promise<T>(() => {})
    },
  )
}

async function withSupabaseRestTimeout<T>(query: AbortablePromiseLike<T>, label: string): Promise<T> {
  if (isCircuitOpen(supabaseRestCircuitOpenUntil)) {
    throw new Error(`${label} skipped because Supabase REST circuit is open for ${remainingCircuitMs(supabaseRestCircuitOpenUntil)}ms`)
  }

  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  let timedOut = false
  const request = typeof query.abortSignal === 'function'
    ? query.abortSignal(controller.signal)
    : query
  const observedRequest = observeTimedQuery(request, label, () => timedOut)
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new Error(`${label} timed out after ${SUPABASE_REST_QUERY_TIMEOUT_MS}ms`))
    }, SUPABASE_REST_QUERY_TIMEOUT_MS)
  })

  try {
    return await Promise.race([observedRequest, timeout])
  } catch (error) {
    if (timedOut) {
      markSupabaseRestCircuitOpen()
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function withDirectQueryTimeout<T>(query: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let timedOut = false
  const observedQuery = observeTimedQuery(query, label, () => timedOut)
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      reject(new Error(`${label} timed out after ${DB_DIRECT_QUERY_TIMEOUT_MS}ms`))
    }, DB_DIRECT_QUERY_TIMEOUT_MS)
  })

  try {
    return await Promise.race([observedQuery, timeout])
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out after')) {
      markDbDirectQueryCircuitOpen()
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ─── SQL 执行辅助（纯 Supabase SDK，无需 RPC）────────────────────────────────
// 解析标准 CRUD SQL 并转换为 Supabase JS SDK 调用。
// 支持：SELECT / INSERT / UPDATE / DELETE / COUNT(*)
// 不支持：JOIN（含 JOIN 的路由已在上方用 SDK 直接实现）

type SqlFilter =
  | { col: string; kind: 'eq'; value: any }
  | { col: string; kind: 'neq'; value: any }
  | { col: string; kind: 'gt'; value: any }
  | { col: string; kind: 'gte'; value: any }
  | { col: string; kind: 'lt'; value: any }
  | { col: string; kind: 'lte'; value: any }
  | { col: string; kind: 'in'; values: any[] }
  | { col: string; kind: 'is_null' }
  | { col: string; kind: 'is_not_null' }
  | { kind: 'always_false' }

type QueryErrorLike = {
  message?: string | null
}

type SelectQueryResult = {
  data: unknown[] | null
  error: QueryErrorLike | null
  count?: number | null
}

type MutationQueryResult = {
  data?: unknown[] | null
  error: QueryErrorLike | null
}

interface SqlSelectQuery extends PromiseLike<SelectQueryResult> {
  is(column: string, value: null): SqlSelectQuery
  not(column: string, operator: string, value: unknown): SqlSelectQuery
  in(column: string, values: unknown[]): SqlSelectQuery
  eq(column: string, value: unknown): SqlSelectQuery
  gt(column: string, value: unknown): SqlSelectQuery
  gte(column: string, value: unknown): SqlSelectQuery
  lt(column: string, value: unknown): SqlSelectQuery
  lte(column: string, value: unknown): SqlSelectQuery
  order(column: string, options?: { ascending?: boolean }): SqlSelectQuery
  range(from: number, to: number): SqlSelectQuery
  limit(count: number): SqlSelectQuery
}

interface SqlMutationQuery extends PromiseLike<MutationQueryResult> {
  select(columns?: string): SqlMutationQuery
  is(column: string, value: null): SqlMutationQuery
  not(column: string, operator: string, value: unknown): SqlMutationQuery
  in(column: string, values: unknown[]): SqlMutationQuery
  eq(column: string, value: unknown): SqlMutationQuery
  gt(column: string, value: unknown): SqlMutationQuery
  gte(column: string, value: unknown): SqlMutationQuery
  lt(column: string, value: unknown): SqlMutationQuery
  lte(column: string, value: unknown): SqlMutationQuery
}

interface SnapshotTableLike {
  upsert?: (
    row: Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates: boolean },
  ) => Promise<MutationQueryResult>
  insert: (row: Record<string, unknown>) => Promise<MutationQueryResult>
}

type ParsedSelectProjection =
  | { kind: 'count'; alias: string }
  | { kind: 'columns'; postgrestProjection: string }

function parseSimpleSelectProjection(sql: string): ParsedSelectProjection | null {
  const selectMatch = sql.match(/^SELECT\s+([\s\S]+?)\s+FROM\s/i)
  if (!selectMatch) return null
  const rawProjection = selectMatch[1].trim()
  const countMatch = rawProjection.match(/^COUNT\s*\(\s*\*\s*\)\s+AS\s+(\w+)$/i)
  if (countMatch) return { kind: 'count', alias: countMatch[1] }
  if (rawProjection === '*') return { kind: 'columns', postgrestProjection: '*' }

  const projectedColumns: string[] = []
  for (const rawColumn of splitSqlTopLevel(rawProjection, ',')) {
    const columnMatch = rawColumn.trim().match(/^(?:(\w+)\.)?(\w+)(?:\s+AS\s+(\w+))?$/i)
    if (!columnMatch) return null
    const column = columnMatch[2]
    const alias = columnMatch[3]
    projectedColumns.push(alias ? `${alias}:${column}` : column)
  }
  return projectedColumns.length > 0
    ? { kind: 'columns', postgrestProjection: projectedColumns.join(',') }
    : null
}

const TASK_PROGRESS_SNAPSHOT_BATCH_SIZE = 200
const PROJECT_LIST_COLUMNS = [
  'id',
  'name',
  'description',
  'primary_invitation_code',
  'status',
  'project_type',
  'building_type',
  'structure_type',
  'building_count',
  'above_ground_floors',
  'underground_floors',
  'support_method',
  'total_area',
  'planned_start_date',
  'planned_end_date',
  'actual_start_date',
  'actual_end_date',
  'start_date',
  'end_date',
  'total_investment',
  'budget',
  'location',
  'health_score',
  'health_status',
  'current_phase',
  'construction_unlock_date',
  'construction_unlock_by',
  'default_wbs_generated',
  'created_at',
  'updated_at',
  'version',
  'owner_id',
  'project_code',
  'project_code_generated_at',
  'company_id',
  'project_visibility',
].join(', ')

type ProjectCleanupStep = {
  table: string
  column?: string
}

const PROJECT_DELETE_CLEANUP_STEPS: ProjectCleanupStep[] = [
  { table: 'task_conditions' },
  { table: 'task_obstacles' },
  { table: 'task_timeline_events' },
  { table: 'notifications' },
  // risks.task_id historically does not cascade, so tasks must be deleted after risks.
  { table: 'risks' },
  { table: 'issues' },
  { table: 'tasks' },
]

type ProjectCreateInput = Omit<Project, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  owner_id?: string | null
  created_by?: string | null
  companyId?: string | null
  company_id?: string | null
  project_visibility?: 'private' | 'company_visible' | 'invite_only' | null
  created_at?: string | null
  updated_at?: string | null
  project_type?: string | null
  building_type?: string | null
  structure_type?: string | null
}

type ProjectUpdateInput = Partial<ProjectCreateInput>

type TaskWriteInput = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'version'> & {
  id?: string | null
  created_at?: string | null
  updated_at?: string | null
  version?: number | null
  created_by?: string | null
  assignee_id?: string | null
  assignee_type?: string | null
  estimated_hours?: number | null
  actual_hours?: number | null
  wbs_order?: number | null
}

type TaskUpdateInput = Partial<TaskWriteInput> & {
  id?: string
  created_at?: string
  updated_at?: string
  first_progress_at?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
}

type RiskRow = Risk & {
  risk_category?: string | null
  category?: string | null
  risk_type?: string | null
  impact_description?: string | null
  owner_id?: string | null
  owner_name?: string | null
  due_date?: string | null
  created_by?: string | null
}

type RiskWriteInput = Omit<Risk, 'id' | 'created_at' | 'updated_at' | 'version'> & {
  id?: string | null
  created_at?: string | null
  updated_at?: string | null
  version?: number | null
  risk_category?: string | null
  category?: string | null
  risk_type?: string | null
  impact_description?: string | null
  owner_id?: string | null
  owner_name?: string | null
  due_date?: string | null
  created_by?: string | null
  resolved_at?: string | null
}

type RiskUpdateInput = Partial<RiskWriteInput> & {
  id?: string
  created_at?: string
  updated_at?: string
}

type IssueWriteInput = Omit<Issue, 'id' | 'created_at' | 'updated_at' | 'version'> & {
  id?: string | null
  created_at?: string | null
  updated_at?: string | null
  version?: number | null
}
type IssueUpdateInput = Partial<IssueWriteInput> & {
  id?: string
  created_at?: string
  updated_at?: string
}

type MemberRow = ProjectMember & {
  is_active?: boolean | null
  last_activity?: string | null
  created_at?: string | null
}

type MemberWriteInput = Omit<ProjectMember, 'id' | 'joined_at'> & {
  created_at?: string | null
  is_active?: boolean | null
  last_activity?: string | null
}

type MemberUpdateInput = Partial<MemberWriteInput> & {
  id?: string
  joined_at?: string
}

type InvitationRow = Invitation & { permission_level?: string | null }

function isSqlIdentifierChar(char: string | undefined) {
  return !!char && /[a-z0-9_]/i.test(char)
}

function splitSqlTopLevel(input: string, separator: ',' | 'AND'): string[] {
  const parts: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  let depth = 0

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]

    if (quote) {
      current += char
      if (char === quote) {
        if (quote === "'" && next === "'") {
          current += next
          index += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }

    if (char === '(') {
      depth += 1
      current += char
      continue
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }

    if (depth === 0 && separator === ',' && char === ',') {
      if (current.trim()) parts.push(current.trim())
      current = ''
      continue
    }

    if (depth === 0 && separator === 'AND') {
      const candidate = input.slice(index, index + 3).toUpperCase()
      const prevChar = index > 0 ? input[index - 1] : undefined
      const nextChar = index + 3 < input.length ? input[index + 3] : undefined
      if (candidate === 'AND' && !isSqlIdentifierChar(prevChar) && !isSqlIdentifierChar(nextChar)) {
        if (current.trim()) parts.push(current.trim())
        current = ''
        index += 2
        continue
      }
    }

    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function resolveSqlLiteralToken(
  token: string,
  params: any[],
  index: number,
  options?: { allowCurrentTimestamp?: boolean },
): { value: any; consumed: number } | null {
  const trimmed = token.trim()
  if (!trimmed) return null

  if (trimmed === '?') {
    return { value: params[index], consumed: 1 }
  }

  if (/^NULL$/i.test(trimmed)) return { value: null, consumed: 0 }
  if (/^TRUE$/i.test(trimmed)) return { value: true, consumed: 0 }
  if (/^FALSE$/i.test(trimmed)) return { value: false, consumed: 0 }

  if (options?.allowCurrentTimestamp && /^(CURRENT_TIMESTAMP|NOW\(\))$/i.test(trimmed)) {
    return { value: new Date().toISOString(), consumed: 0 }
  }

  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return { value: trimmed.slice(1, -1).replace(/''/g, "'"), consumed: 0 }
  }

  const numeric = Number(trimmed)
  if (!Number.isNaN(numeric) && trimmed !== '') {
    return { value: numeric, consumed: 0 }
  }

  return null
}

function parseSqlWhere(whereClause: string, params: any[], startIdx: number): { filters: SqlFilter[]; consumed: number } {
  const normalizedWhere = whereClause.trim()
  if (!normalizedWhere) return { filters: [], consumed: 0 }

  if (/\bOR\b/i.test(normalizedWhere)) {
    throw new Error(`[executeSQL WHERE] OR is not supported: ${normalizedWhere}`)
  }

  if (/JSON_CONTAINS/i.test(normalizedWhere)) {
    throw new Error(`[executeSQL WHERE] JSON_CONTAINS is not supported: ${normalizedWhere}`)
  }

  if (/\bLIKE\b/i.test(normalizedWhere)) {
    throw new Error(`[executeSQL WHERE] LIKE is not supported: ${normalizedWhere}`)
  }

  const filters: SqlFilter[] = []
  let idx = startIdx
  const conditions = splitSqlTopLevel(normalizedWhere, 'AND')

  for (const condition of conditions) {
    const tautologyMatch = condition.match(/^(\d+)\s*=\s*(\d+)$/)
    if (tautologyMatch) {
      if (tautologyMatch[1] === tautologyMatch[2]) {
        continue
      }
      filters.push({ kind: 'always_false' })
      continue
    }

    const isNullMatch = condition.match(/^(\w+)\s+IS\s+NULL$/i)
    if (isNullMatch) {
      filters.push({ col: isNullMatch[1], kind: 'is_null' })
      continue
    }

    const isNotNullMatch = condition.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i)
    if (isNotNullMatch) {
      filters.push({ col: isNotNullMatch[1], kind: 'is_not_null' })
      continue
    }

    const inMatch = condition.match(/^(\w+)\s+IN\s*\((.+)\)$/i)
    if (inMatch) {
      const values: any[] = []
      const tokens = splitSqlTopLevel(inMatch[2], ',')
      for (const token of tokens) {
        const resolved = resolveSqlLiteralToken(token, params, idx)
        if (!resolved) {
          throw new Error(`[executeSQL WHERE] Unsupported IN token: ${condition}`)
        }
        idx += resolved.consumed
        values.push(resolved.value)
      }
      filters.push({ col: inMatch[1], kind: 'in', values })
      continue
    }

    const compareMatch = condition.match(/^(\w+)\s*(<=|>=|=|!=|<>|<|>)\s*(.+)$/i)
    if (compareMatch) {
      const resolved = resolveSqlLiteralToken(compareMatch[3], params, idx)
      if (!resolved) {
        throw new Error(`[executeSQL WHERE] Unsupported comparison token: ${condition}`)
      }
      idx += resolved.consumed
      const operator = compareMatch[2]
      filters.push({
        col: compareMatch[1],
        kind:
          operator === '=' ? 'eq'
            : operator === '!=' || operator === '<>' ? 'neq'
              : operator === '>' ? 'gt'
                : operator === '>=' ? 'gte'
                  : operator === '<' ? 'lt'
                    : 'lte',
        value: resolved.value,
      })
      continue
    }

    throw new Error(`[executeSQL WHERE] Unsupported condition: ${condition}`)
  }

  return { filters, consumed: idx - startIdx }
}

function resolveSqlNumericToken(token: string | undefined, params: any[], index: number): { value: number; consumed: number } | null {
  if (!token) return null

  if (token === '?') {
    const value = Number(params[index])
    if (!Number.isFinite(value)) return null
    return { value, consumed: 1 }
  }

  const value = Number(token)
  if (!Number.isFinite(value)) return null
  return { value, consumed: 0 }
}

function containsNativePostgresPlaceholder(sql: string) {
  let quote: "'" | '"' | null = null
  let lineComment = false
  let blockComment = false
  let dollarQuote: string | null = null

  for (let cursor = 0; cursor < sql.length; cursor += 1) {
    const char = sql[cursor]
    const next = sql[cursor + 1]

    if (dollarQuote) {
      if (sql.startsWith(dollarQuote, cursor)) {
        cursor += dollarQuote.length - 1
        dollarQuote = null
      }
      continue
    }

    if (lineComment) {
      if (char === "\n" || char === "\r") lineComment = false
      continue
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        cursor += 1
      }
      continue
    }

    if (quote) {
      if (char === quote) {
        if (quote === "'" && next === "'") {
          cursor += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      continue
    }

    if (char === '-' && next === '-') {
      lineComment = true
      cursor += 1
      continue
    }

    if (char === '/' && next === '*') {
      blockComment = true
      cursor += 1
      continue
    }

    const positionalPlaceholder = sql.slice(cursor).match(/^\$\d+(?![A-Za-z0-9_])/)
    if (positionalPlaceholder) return true

    const dollarQuoteStart = sql.slice(cursor).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)
    if (dollarQuoteStart) {
      dollarQuote = dollarQuoteStart[0]
      cursor += dollarQuote.length - 1
    }
  }

  return false
}

function convertQuestionPlaceholdersToPg(sql: string, params: any[]) {
  if (params.length === 0 || containsNativePostgresPlaceholder(sql)) return sql

  let index = 0
  let quote: "'" | '"' | null = null
  let converted = ''

  for (let cursor = 0; cursor < sql.length; cursor += 1) {
    const char = sql[cursor]
    const next = sql[cursor + 1]

    if (quote) {
      converted += char
      if (char === quote) {
        if (quote === "'" && next === "'") {
          converted += next
          cursor += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      converted += char
      continue
    }

    if (char === '?') {
      index += 1
      converted += `$${index}`
      continue
    }

    converted += char
  }

  return converted
}

async function runDirectExecuteSqlFallback<T = any>(
  sql: string,
  params: any[],
  label: string,
): Promise<T[]> {
  const pgSql = convertQuestionPlaceholdersToPg(sql, params)
  const result = await withDirectQueryTimeout(rawQuery(pgSql, params), label)
  return result.rows as T[]
}

function createMutationOutcomeUnknownError(
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  table: string,
  cause: unknown,
) {
  const causeMessage = cause instanceof Error ? cause.message : String(cause)
  return Object.assign(
    new Error(
      `[executeSQL ${operation}] mutation outcome is unknown for ${table}; automatic replay is disabled: ${causeMessage}`,
    ),
    {
      code: 'MUTATION_OUTCOME_UNKNOWN',
      statusCode: 503,
      operation,
      table,
    },
  )
}

function isMissingSupabaseResourceError(error: QueryErrorLike | null | undefined) {
  const code = String((error as { code?: string } | null | undefined)?.code ?? '').trim()
  const message = String(error?.message ?? '')
  return (
    code === '42P01'
    || code === '42703'
    || code === 'PGRST204'
    || code === 'PGRST205'
    || /does not exist/i.test(message)
    || /schema cache/i.test(message)
    || /Could not find the table/i.test(message)
    || /Could not find the .*column/i.test(message)
  )
}

function stripLeadingSqlComments(sql: string) {
  let cursor = 0

  while (cursor < sql.length) {
    while (cursor < sql.length && /\s/.test(sql[cursor])) cursor += 1

    if (sql.startsWith('--', cursor)) {
      const lineEnd = sql.indexOf('\n', cursor + 2)
      if (lineEnd === -1) return ''
      cursor = lineEnd + 1
      continue
    }

    if (sql.startsWith('/*', cursor)) {
      let depth = 1
      cursor += 2
      while (cursor < sql.length && depth > 0) {
        if (sql.startsWith('/*', cursor)) {
          depth += 1
          cursor += 2
        } else if (sql.startsWith('*/', cursor)) {
          depth -= 1
          cursor += 2
        } else {
          cursor += 1
        }
      }
      if (depth > 0) return ''
      continue
    }

    break
  }

  return sql.slice(cursor)
}

// ─── 数据访问规范（2026-04-06 制定）─────────────────────────────────────────
// 【强制】新增查询必须优先使用 Supabase JS SDK 直接调用（如本文件上方的 getTask / createTask 等）
// 【禁止】新增复杂 executeSQL 调用，包括但不限于：
//   - 含 JOIN 的 SELECT（请用多次 SDK 查询或 Supabase RPC）
//   - 含 COALESCE / CASE / 表达式 UPDATE（请用 SDK update + 业务层计算）
//   - 动态表名拼接（安全风险）
// 【现有调用】约 138 处 executeSQL 调用保留兼容，高风险台账见步骤 4.3 执行记录：
//   高风险路由（含动态 SET 模板字符串）：SupabaseService.query / create / update / delete（本文件底部）
//   历史 JOIN/OR/表达式 UPDATE 调用已逐步迁出；新代码应继续避免向 executeSQL 回灌复杂 SQL
// ─────────────────────────────────────────────────────────────────────────────
async function executeSQL<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const s = sql.trim()
  const classificationSql = stripLeadingSqlComments(s)
  const upper = classificationSql.toUpperCase()
  const hasLeadingSqlComment = classificationSql.length > 0 && classificationSql !== s

  if (isDatabaseTransactionActive()) {
    return runDirectExecuteSqlFallback<T>(s, params, 'dbService.executeSQL active transaction')
  }

  if (shouldUseDirectSqlPath()) {
    return runDirectExecuteSqlFallback<T>(s, params, 'dbService.executeSQL direct runtime SQL')
  }

  if (hasLeadingSqlComment || upper.startsWith('WITH')) {
    return runDirectExecuteSqlFallback<T>(s, params, 'dbService.executeSQL annotated or CTE statement')
  }

  // ── SELECT ──────────────────────────────────────────────────────────────────
  if (upper.startsWith('SELECT')) {
    if (/\bJOIN\b/i.test(s)) {
      throw new Error(`[executeSQL SELECT] JOIN is not supported: ${s}`)
    }

    // 提取表名
    const fromMatch = s.match(/FROM\s+(?:(\w+)\.)?(\w+)/i)
    if (!fromMatch) throw new Error(`[executeSQL] Cannot parse table from: ${s}`)
    const table = fromMatch[2]

    const projection = parseSimpleSelectProjection(s)
    if (!projection || /\b(?:GROUP\s+BY|HAVING|UNION|DISTINCT)\b|->>?/i.test(s)) {
      return runDirectExecuteSqlFallback<T>(s, params, `dbService.executeSQL SELECT ${table} complex projection`)
    }
    const isCount = projection.kind === 'count'

    // 解析 WHERE 子句
    const whereMatch = s.match(/WHERE\s+(.+?)(?:\s+ORDER\s+|\s+LIMIT\s+|\s+GROUP\s+|$)/i)
    let paramIdx = 0
    let filters: SqlFilter[] = []

    if (whereMatch) {
      const whereStr = whereMatch[1]
      const parsedWhere = parseSqlWhere(whereStr, params, paramIdx)
      filters = parsedWhere.filters
      const { consumed } = parsedWhere
      paramIdx += consumed
      if (filters.some((filter) => filter.kind === 'always_false')) {
        if (isCount) {
          return [{ [projection.alias]: 0 } as T]
        }
        return []
      }
    }

    const queryBuilder = supabase.from(table)
    let query = (isCount
      ? queryBuilder.select('id', { count: 'exact', head: true })
      : queryBuilder.select(projection.postgrestProjection)) as unknown as SqlSelectQuery
    for (const filter of filters) {
      if (filter.kind === 'is_null') {
        query = query.is(filter.col, null)
      } else if (filter.kind === 'is_not_null') {
        query = query.not(filter.col, 'is', null)
      } else if (filter.kind === 'in') {
        query = query.in(filter.col, filter.values)
      } else if (filter.kind === 'neq') {
        query = query.not(filter.col, 'eq', filter.value)
      } else if (filter.kind === 'gt') {
        query = query.gt(filter.col, filter.value)
      } else if (filter.kind === 'gte') {
        query = query.gte(filter.col, filter.value)
      } else if (filter.kind === 'lt') {
        query = query.lt(filter.col, filter.value)
      } else if (filter.kind === 'lte') {
        query = query.lte(filter.col, filter.value)
      } else if (filter.kind === 'eq') {
        query = query.eq(filter.col, filter.value)
      }
    }

    // 解析 ORDER BY
    const orderMatch = s.match(/ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?/i)
    if (orderMatch) {
      query = query.order(orderMatch[1], { ascending: (orderMatch[2] || 'ASC').toUpperCase() === 'ASC' })
    }

    // 解析 LIMIT / OFFSET，兼容 LIMIT 1 / LIMIT ? / LIMIT 10 OFFSET 20 / LIMIT ? OFFSET ?
    const limitMatch = s.match(/LIMIT\s+(\?|\d+)(?:\s+OFFSET\s+(\?|\d+))?/i)
    if (limitMatch) {
      const limitToken = resolveSqlNumericToken(limitMatch[1], params, paramIdx)
      if (limitToken) {
        paramIdx += limitToken.consumed

        const offsetToken = resolveSqlNumericToken(limitMatch[2], params, paramIdx)
        if (offsetToken) {
          paramIdx += offsetToken.consumed
          query = query.range(offsetToken.value, offsetToken.value + limitToken.value - 1)
        } else {
          query = query.limit(limitToken.value)
        }
      }
    }

    let data: unknown[] | null = null
    let error: QueryErrorLike | null = null
    let exactCount: number | null = null

    try {
      const result = await withSupabaseRestTimeout(query, `dbService.executeSQL SELECT ${table}`)
      data = result.data
      error = result.error
      exactCount = result.count ?? null
    } catch (restError) {
      if (isCircuitOpen(dbDirectQueryCircuitOpenUntil)) {
        logger.warn('dbService.executeSQL SELECT skipped direct query because direct DB circuit is open', {
          table,
          remainingMs: remainingCircuitMs(dbDirectQueryCircuitOpenUntil),
          error: restError instanceof Error ? restError.message : String(restError),
        })
        throw restError
      }

      logger.warn('dbService.executeSQL SELECT REST read failed, falling back to direct query', {
        table,
        error: restError instanceof Error ? restError.message : String(restError),
      })
      return runDirectExecuteSqlFallback<T>(s, params, `dbService.executeSQL SELECT ${table} direct query`)
    }

    if (error) {
      if (isCircuitOpen(dbDirectQueryCircuitOpenUntil)) {
        throw new Error(`[executeSQL SELECT] ${error.message} | SQL: ${s}`)
      }

      logger.warn('dbService.executeSQL SELECT REST returned an error, falling back to direct query', {
        table,
        error: error.message ?? null,
      })
      return runDirectExecuteSqlFallback<T>(s, params, `dbService.executeSQL SELECT ${table} direct query`)
    }

    if (isCount) {
      if (!Number.isFinite(exactCount)) {
        throw new Error(`[executeSQL SELECT] exact count was not returned for ${table}`)
      }
      return [{ [projection.alias]: Number(exactCount) } as T]
    }

    return (data ?? []) as T[]
  }

  // ── INSERT ──────────────────────────────────────────────────────────────────
  if (upper.startsWith('INSERT')) {
    const tableMatch = s.match(/INTO\s+(?:(\w+)\.)?(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)
    if (!tableMatch) throw new Error(`[executeSQL] Cannot parse INSERT: ${s}`)
    const table = tableMatch[2]
    const cols = tableMatch[3].split(',').map(c => c.trim())
    const record: Record<string, any> = {}
    cols.forEach((col, i) => { record[col] = params[i] ?? null })
    const returningMatch = s.match(/RETURNING\s+(.+?)\s*$/i)
    const returningColumns = returningMatch ? returningMatch[1].trim() : null
    const insertQuery = returningColumns
      ? (supabase.from(table).insert(record).select(returningColumns) as unknown as AbortablePromiseLike<MutationQueryResult>)
      : (supabase.from(table).insert(record) as unknown as AbortablePromiseLike<MutationQueryResult>)
    let data: unknown[] | null = null
    let error: QueryErrorLike | null = null

    try {
      const result = await withSupabaseRestTimeout(insertQuery, `dbService.executeSQL INSERT ${table}`)
      data = result.data ?? null
      error = result.error
    } catch (restError) {
      logger.error('dbService.executeSQL INSERT REST write outcome is unknown; direct replay disabled', {
        table,
        error: restError instanceof Error ? restError.message : String(restError),
      })
      throw createMutationOutcomeUnknownError('INSERT', table, restError)
    }

    if (error) {
      throw new Error(`[executeSQL INSERT] ${error.message} | SQL: ${s}`)
    }
    return (data ?? []) as T[]
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  if (upper.startsWith('UPDATE')) {
    const returningMatch = s.match(/\s+RETURNING\s+(.+?)\s*$/i)
    const returningColumns = returningMatch ? returningMatch[1].trim() : '*'
    const updateStatement = returningMatch ? s.slice(0, returningMatch.index).trim() : s
    const tableMatch = updateStatement.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+?)(?:\s*$)/i)
    if (!tableMatch) throw new Error(`[executeSQL] Cannot parse UPDATE: ${s}`)
    const table = tableMatch[1]
    const setStr = tableMatch[2]
    const whereStr = tableMatch[3]

    const updates: Record<string, any> = {}
    let paramIdx = 0
    const assignments = splitSqlTopLevel(setStr, ',')
    for (const assignment of assignments) {
      const assignMatch = assignment.match(/^(\w+)\s*=\s*(.+)$/i)
      if (!assignMatch) {
        throw new Error(`[executeSQL UPDATE] Unsupported assignment: ${assignment}`)
      }

      const resolved = resolveSqlLiteralToken(assignMatch[2], params, paramIdx, { allowCurrentTimestamp: true })
      if (!resolved) {
        throw new Error(`[executeSQL UPDATE] Unsupported expression: ${assignment} | SQL: ${s}`)
      }

      paramIdx += resolved.consumed
      updates[assignMatch[1]] = resolved.value
    }

    // 解析 WHERE 条件
    const { filters } = parseSqlWhere(whereStr, params, paramIdx)
    if (filters.some((filter) => filter.kind === 'always_false')) return []
    let query = supabase.from(table).update(updates) as unknown as SqlMutationQuery
    for (const filter of filters) {
      if (filter.kind === 'is_null') query = query.is(filter.col, null)
      else if (filter.kind === 'is_not_null') query = query.not(filter.col, 'is', null)
      else if (filter.kind === 'in') query = query.in(filter.col, filter.values)
      else if (filter.kind === 'neq') query = query.not(filter.col, 'eq', filter.value)
      else if (filter.kind === 'gt') query = query.gt(filter.col, filter.value)
      else if (filter.kind === 'gte') query = query.gte(filter.col, filter.value)
      else if (filter.kind === 'lt') query = query.lt(filter.col, filter.value)
      else if (filter.kind === 'lte') query = query.lte(filter.col, filter.value)
      else if (filter.kind === 'eq') query = query.eq(filter.col, filter.value)
    }

    let data: unknown[] | null = null
    let error: QueryErrorLike | null = null
    try {
      const result = await withSupabaseRestTimeout(query.select(returningColumns), `dbService.executeSQL UPDATE ${table}`)
      data = result.data ?? null
      error = result.error
    } catch (restError) {
      logger.error('dbService.executeSQL UPDATE REST write outcome is unknown; direct replay disabled', {
        table,
        error: restError instanceof Error ? restError.message : String(restError),
      })
      throw createMutationOutcomeUnknownError('UPDATE', table, restError)
    }
    if (error) {
      throw new Error(`[executeSQL UPDATE] ${error.message} | SQL: ${s}`)
    }
    return (data ?? []) as T[]
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (upper.startsWith('DELETE')) {
    const tableMatch = s.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s*$)/i)
    if (!tableMatch) throw new Error(`[executeSQL] Cannot parse DELETE: ${s}`)
    const table = tableMatch[1]
    const whereStr = tableMatch[2]

    let query = supabase.from(table).delete() as unknown as SqlMutationQuery
    if (whereStr) {
      const { filters } = parseSqlWhere(whereStr, params, 0)
      if (filters.some((filter) => filter.kind === 'always_false')) return []
      for (const filter of filters) {
        if (filter.kind === 'is_null') query = query.is(filter.col, null)
        else if (filter.kind === 'is_not_null') query = query.not(filter.col, 'is', null)
        else if (filter.kind === 'in') query = query.in(filter.col, filter.values)
        else if (filter.kind === 'neq') query = query.not(filter.col, 'eq', filter.value)
        else if (filter.kind === 'gt') query = query.gt(filter.col, filter.value)
        else if (filter.kind === 'gte') query = query.gte(filter.col, filter.value)
        else if (filter.kind === 'lt') query = query.lt(filter.col, filter.value)
        else if (filter.kind === 'lte') query = query.lte(filter.col, filter.value)
        else if (filter.kind === 'eq') query = query.eq(filter.col, filter.value)
      }
    }

    let error: QueryErrorLike | null = null
    try {
      const result = await withSupabaseRestTimeout(query, `dbService.executeSQL DELETE ${table}`)
      error = result.error
    } catch (restError) {
      logger.error('dbService.executeSQL DELETE REST write outcome is unknown; direct replay disabled', {
        table,
        error: restError instanceof Error ? restError.message : String(restError),
      })
      throw createMutationOutcomeUnknownError('DELETE', table, restError)
    }
    if (error) {
      throw new Error(`[executeSQL DELETE] ${error.message} | SQL: ${s}`)
    }
    return []
  }

  throw new Error(`[executeSQL] Unsupported SQL type: ${s.substring(0, 50)}`)
}

async function executeSQLOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await executeSQL<T>(sql, params)
  return rows?.[0] ?? null
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function now(): string {
  return new Date().toISOString()
}

function enqueueProjectHealthRefresh(projectId: unknown, trigger: string) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return

  runBusinessSideEffect(
    'enqueueProjectHealthUpdate',
    businessSideEffectAdapters.enqueueProjectHealthUpdate
      ? () => businessSideEffectAdapters.enqueueProjectHealthUpdate!(normalizedProjectId, trigger)
      : undefined,
    { projectId: normalizedProjectId, trigger },
  )
}

export async function finalizeTaskWriteWithRegisteredAdapter(
  task: Task,
  previousTask?: Task | null,
  actorId?: string | null,
) {
  const finalize = businessSideEffectAdapters.finalizeTaskWrite
  if (!finalize) throw new Error('[dbService] task write finalizer is not registered')
  await finalize(task, previousTask, actorId)
}

async function enqueueProjectHealthRefreshAfterCommit(projectId: unknown, trigger: string) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return
  await registerDatabasePostCommitEffect(
    `dbService.projectHealth:${trigger}:${normalizedProjectId}`,
    async () => enqueueProjectHealthRefresh(normalizedProjectId, trigger),
  )
}

type ChangeSource =
  | 'system_auto'
  | 'manual_adjusted'
  | 'manual_close_confirmation'
  | 'manual_keep_processing'
  | 'retention_close'
  | 'admin_force'
  | 'approval'
  | 'monthly_plan_correction'
  | 'baseline_revision'

type DbChangeLogSource = WriteLogParams['change_source']

type BusinessError = Error & {
  code?: string
  statusCode?: number
}

function createBusinessError(code: string, message: string, statusCode = 422): BusinessError {
  const error = new Error(message) as BusinessError
  error.code = code
  error.statusCode = statusCode
  return error
}

function assertStructuredClosureOutcome(
  currentStatus: string | null | undefined,
  nextStatus: string,
  fields: Partial<Risk> | Partial<Issue>,
) {
  if (currentStatus === 'closed' || nextStatus !== 'closed') return

  const hasRequiredOutcome = Boolean(
    fields.closure_result_code
    && String(fields.closure_result_summary ?? '').trim()
    && fields.closure_effectiveness
    && fields.closure_recorded_at,
  )
  if (!hasRequiredOutcome) {
    throw createBusinessError(
      'CLOSURE_OUTCOME_REQUIRED',
      '风险或问题关闭时必须记录受控结果、结果说明、有效性和记录时间',
    )
  }
}

function clearStructuredClosureOutcome(fields: Partial<Risk> | Partial<Issue>) {
  Object.assign(fields, {
    closure_result_code: null,
    closure_result_summary: null,
    closure_effectiveness: null,
    closure_evidence_refs: [],
    closure_cause_attribution_id: null,
    closed_by: null,
    closure_recorded_at: null,
  })
}

function normalizeDbChangeLogSource(source?: ChangeSource): DbChangeLogSource {
  if (source === 'manual_close_confirmation' || source === 'manual_keep_processing') {
    return 'manual_adjusted'
  }
  if (source === 'retention_close') return 'system_auto'
  return source
}

export async function executeDatabaseRpc<T = unknown>(fn: string, params: Record<string, unknown>) {
  if (shouldUseDirectSqlPath() || isDatabaseTransactionActive()) {
    const identifierPattern = /^[a-z_][a-z0-9_]*$/i
    if (!identifierPattern.test(fn)) {
      throw new Error(`Invalid database RPC function name: ${fn}`)
    }

    const entries = Object.entries(params)
    for (const [name] of entries) {
      if (!identifierPattern.test(name)) {
        throw new Error(`Invalid database RPC parameter name: ${name}`)
      }
    }

    const args = entries
      .map(([name], index) => `"${name}" => $${index + 1}`)
      .join(', ')
    const result = await withDirectQueryTimeout(
      rawQuery(`SELECT public."${fn}"(${args}) AS result`, entries.map(([, value]) => value)),
      `dbService.runRpc ${fn}`,
    )
    return (result.rows[0]?.result ?? null) as T
  }

  const { data, error } = await supabase.rpc(fn, params)
  if (error) throw new Error(error.message)
  return data as T
}

const runRpc = executeDatabaseRpc

function buildIndependentChainId(sourceType?: string | null, chainId?: string | null) {
  if (chainId) return chainId
  if (String(sourceType ?? 'manual') === 'manual') return uuidv4()
  return null
}

function normalizeRiskStatus(value?: string | null): Risk['status'] {
  if (value === 'mitigating' || value === 'closed') return value
  return 'identified'
}

function normalizeIssueStatus(value?: string | null): Issue['status'] {
  if (value === 'investigating' || value === 'resolved' || value === 'closed') return value
  return 'open'
}

function buildRiskIssueClosureFact(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries({
    status: row.status,
    resultCode: row.closure_result_code,
    resultSummary: row.closure_result_summary,
    effectiveness: row.closure_effectiveness,
    evidenceRefs: row.closure_evidence_refs,
    causeAttributionId: row.closure_cause_attribution_id,
    closedBy: row.closed_by,
    recordedAt: row.closure_recorded_at,
  }).filter(([, value]) => value !== undefined && value !== null))
}

async function recordRiskIssueExecutionFacts(input: {
  entityType: 'risk' | 'issue'
  entityId: string
  projectId: string
  previous: Record<string, unknown> | null
  next: Record<string, unknown>
  sourceMutationId: string
  observedAt: string
  actorUserId?: string | null
  forceInitialStatus?: boolean
}) {
  const statusFactType = `${input.entityType}.status` as 'risk.status' | 'issue.status'
  const closureFactType = `${input.entityType}.closure` as 'risk.closure' | 'issue.closure'
  const changes: ExecutionFactProjectionChange[] = [{
    factType: statusFactType,
    previousValue: input.previous?.status ?? null,
    nextValue: input.next.status,
    force: input.forceInitialStatus === true,
    effectiveAt: input.observedAt,
  }]
  if (input.next.status === 'closed') {
    changes.push({
      factType: closureFactType,
      previousValue: input.previous?.status === 'closed'
        ? buildRiskIssueClosureFact(input.previous)
        : null,
      nextValue: buildRiskIssueClosureFact(input.next),
      effectiveAt: String(
        input.next.closure_recorded_at
        ?? input.next.closed_at
        ?? input.next.resolved_at
        ?? input.observedAt,
      ),
    })
  }

  const changed = changes.filter((change) => (
    change.force === true
    || JSON.stringify(change.previousValue) !== JSON.stringify(change.nextValue)
  ))
  if (changed.length === 0) return

  await recordChangedExecutionFacts({
    projectId: input.projectId,
    entityType: input.entityType,
    entityId: input.entityId,
    sourceModule: 'dbService',
    sourceMutationId: input.sourceMutationId,
    actorUserId: input.actorUserId ?? null,
    observedAt: input.observedAt,
    changes: changed,
  })
}

function validateRiskStatusTransition(
  currentStatus: Risk['status'] | null,
  nextStatus: Risk['status'],
  changeSource: ChangeSource,
) {
  if (!currentStatus || currentStatus === nextStatus) return

  if (changeSource === 'system_auto' || changeSource === 'retention_close') {
    const allowedSystemTransitions: Record<Risk['status'], Risk['status'][]> = {
      identified: ['mitigating', 'closed'],
      mitigating: ['closed'],
      closed: ['identified', 'mitigating'],
    }
    if (allowedSystemTransitions[currentStatus]?.includes(nextStatus)) return
  }

  const allowedManualTransitions: Record<Risk['status'], Risk['status'][]> = {
    identified: ['mitigating'],
    mitigating: ['closed'],
    closed: ['identified'],
  }

  if (!allowedManualTransitions[currentStatus]?.includes(nextStatus)) {
    throw createBusinessError(
      'INVALID_RISK_STATUS_TRANSITION',
      `风险状态不允许从 ${currentStatus} 直接变更为 ${nextStatus}`,
    )
  }
}

function validateIssueStatusTransition(
  currentStatus: Issue['status'] | null,
  nextStatus: Issue['status'],
  changeSource: ChangeSource,
  updates: Partial<Issue>,
) {
  if (!currentStatus || currentStatus === nextStatus) return

  if (changeSource === 'system_auto') {
    const allowedSystemTransitions: Record<Issue['status'], Issue['status'][]> = {
      open: ['resolved'],
      investigating: ['resolved'],
      resolved: [],
      closed: [],
    }
    if (allowedSystemTransitions[currentStatus]?.includes(nextStatus)) return
  }

  if (changeSource === 'retention_close' && nextStatus === 'closed') return

  if (currentStatus === 'open' && nextStatus === 'investigating') return
  if (currentStatus === 'investigating' && nextStatus === 'open') return
  if (currentStatus === 'investigating' && nextStatus === 'resolved') return
  if (currentStatus === 'resolved' && nextStatus === 'investigating') return
  if (currentStatus === 'resolved' && nextStatus === 'closed') return

  if (
    currentStatus === 'open'
    && nextStatus === 'resolved'
    && (changeSource === 'system_auto' || Boolean(updates.pending_manual_close))
  ) {
    return
  }

  throw createBusinessError(
    'INVALID_ISSUE_STATUS_TRANSITION',
    `问题状态不允许从 ${currentStatus} 直接变更为 ${nextStatus}`,
  )
}

function isIssuePendingManualCloseAction(changeSource: ChangeSource) {
  return changeSource === 'manual_close_confirmation'
    || changeSource === 'manual_keep_processing'
    || changeSource === 'retention_close'
}

async function listPriorityLockedIssueIds(issueIds: string[]) {
  if (!issueIds.length) return new Set<string>()

  if (shouldUseDirectSqlPath() || isDatabaseTransactionActive()) {
    const rows = await executeSQL<{ entity_id?: string | null }>(
      `SELECT entity_id FROM change_logs WHERE entity_type = ? AND field_name = ? AND entity_id IN (${issueIds.map(() => '?').join(', ')})`,
      ['issue', 'priority', ...issueIds],
    )
    return new Set(rows.map((row) => String(row.entity_id ?? '')).filter(Boolean))
  }

  const { data, error } = await supabase
    .from('change_logs')
    .select('entity_id')
    .eq('entity_type', 'issue')
    .eq('field_name', 'priority')
    .in('entity_id', issueIds)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Array<{ entity_id?: string | null }>
  return new Set(rows.map((row) => String(row.entity_id ?? '')).filter(Boolean))
}

function normalizeMilestoneTaskStatus(value?: string | null): Task['status'] {
  switch (String(value ?? '').trim()) {
    case 'completed':
    case '已完成':
      return 'completed'
    case 'in_progress':
    case '进行中':
      return 'in_progress'
    case 'overdue':
    case 'blocked':
      return 'blocked'
    default:
      return 'pending'
  }
}

function buildTaskInputFromMilestone(milestone: Omit<Milestone, 'id' | 'created_at' | 'updated_at'>): TaskWriteInput {
  return {
    project_id: milestone.project_id,
    title: milestone.title,
    description: milestone.description ?? null,
    status: normalizeMilestoneTaskStatus(milestone.status),
    priority: 'medium',
    progress: Number(milestone.completion_rate ?? 0),
    is_milestone: true,
    planned_end_date: milestone.target_date ?? null,
    actual_end_date: milestone.actual_date ?? milestone.completed_at ?? null,
    baseline_end: milestone.baseline_date ?? null,
    version: 1,
  }
}

function buildTaskUpdateFromMilestone(updates: Partial<Milestone>): TaskUpdateInput {
  const taskUpdates: TaskUpdateInput = {}
  if (updates.title !== undefined) {
    taskUpdates.title = updates.title
  }
  if (updates.description !== undefined) {
    taskUpdates.description = updates.description
  }
  if (updates.status !== undefined) {
    taskUpdates.status = normalizeMilestoneTaskStatus(updates.status)
  }
  if (updates.completion_rate !== undefined) {
    taskUpdates.progress = Number(updates.completion_rate)
  }
  if (updates.target_date !== undefined) {
    taskUpdates.planned_end_date = updates.target_date
  }
  if (updates.actual_date !== undefined || updates.completed_at !== undefined) {
    taskUpdates.actual_end_date = updates.actual_date ?? updates.completed_at ?? null
  }
  return taskUpdates
}

function applyDynamicPriority(issue: Issue, isPriorityLocked: boolean) {
  return {
    ...issue,
    priority: computeDynamicIssuePriority(issue, { isLocked: isPriorityLocked }),
  }
}

async function markDownstreamSourceDeleted(sourceEntityType: string, sourceEntityId: string) {
  await runRpc<number>('mark_source_deleted_on_downstream_atomic', {
    p_source_entity_type: sourceEntityType,
    p_source_entity_id: sourceEntityId,
  })
}

async function listUnmetTaskConditionIds(taskId: string) {
  const { data, error } = await supabase
    .from('task_conditions')
    .select('id')
    .eq('task_id', taskId)
    .eq('is_satisfied', false)

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ id?: string | null }>
  return rows.map((row) => String(row.id ?? '')).filter(Boolean)
}

function createProjectMutationError(
  code: 'PROJECT_SCHEMA_INCOMPATIBLE' | 'PROJECT_OWNERSHIP_REQUIRED',
  message: string,
  statusCode: 400 | 503,
) {
  return Object.assign(new Error(message), { code, statusCode })
}

function createProjectSchemaIncompatibleError(error: QueryErrorLike | null | undefined) {
  return createProjectMutationError(
    'PROJECT_SCHEMA_INCOMPATIBLE',
    `项目数据库结构与当前服务版本不兼容，请先完成数据库迁移：${error?.message ?? 'unknown schema error'}`,
    503,
  )
}

function toDateOnly(value?: unknown): string {
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? now().slice(0, 10) : value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? now().slice(0, 10) : date.toISOString().slice(0, 10)
  }

  const text = String(value ?? now()).trim()
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoDate) return isoDate[1]

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return now().slice(0, 10)
}

function normalizeTaskProgressValue(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0 || numeric > 100) {
    throw createBusinessError('INVALID_TASK_PROGRESS', '任务进度只允许 0-100 的整数', 400)
  }
  return numeric
}

async function writeChangeLog(params: {
  project_id?: string | null
  entity_type: 'task' | 'risk' | 'issue'
  entity_id: string
  field_name: string
  old_value?: string | number | boolean | null
  new_value?: string | number | boolean | null
  changed_by?: string | null
  change_source?: ChangeSource
}) {
  const normalizedParams: WriteLogParams = {
    ...params,
    change_source: normalizeDbChangeLogSource(params.change_source),
  }
  if (!businessSideEffectAdapters.writeLog) {
    logger.warn('[dbService] writeLog adapter is not registered', {
      entityType: params.entity_type,
      entityId: params.entity_id,
    })
    return
  }
  await businessSideEffectAdapters.writeLog(normalizedParams)
}

async function writeLifecycleChangeLog(params: {
  project_id?: string | null
  entity_type: 'task' | 'risk' | 'issue'
  entity_id: string
  action: string
  changed_by?: string | null
  change_reason?: string | null
  change_source?: ChangeSource
}) {
  const normalizedParams: WriteLifecycleLogParams = {
    ...params,
    change_source: normalizeDbChangeLogSource(params.change_source),
  }
  if (!businessSideEffectAdapters.writeLifecycleLog) {
    logger.warn('[dbService] writeLifecycleLog adapter is not registered', {
      entityType: params.entity_type,
      entityId: params.entity_id,
    })
    return
  }
  await businessSideEffectAdapters.writeLifecycleLog(normalizedParams)
}

export interface TaskSnapshotWriteOptions {
  recordedBy?: string | null
  eventType?: string
  eventSource?: string
  notes?: string | null
  deferProjectSideEffects?: boolean
  confirmationStatus?: 'unconfirmed' | 'confirmed' | 'acknowledged' | 'verified' | null
  confirmedAt?: string | null
  confirmedBy?: string | null
}

type TaskProgressSnapshotWriteRow = {
  task_id: string
  progress: number
  snapshot_date: string
  event_type: string
  event_source: string
  source_confidence: string
  confirmation_status: string | null
  confirmed_at: string | null
  confirmed_by: string | null
  notes: string | null
  status: string | null
  conditions_met_count: number
  conditions_total_count: number
  obstacles_active_count: number
  recorded_by: string | null
  is_auto_generated: boolean
  baseline_version_id: string | null
  monthly_plan_version_id: string | null
  baseline_item_id: string | null
  monthly_plan_item_id: string | null
  planning_source_type: string | null
  planning_source_version_id: string | null
  planning_source_item_id: string | null
  created_at: string
}

async function writeTaskProgressSnapshotDirect(snapshot: TaskProgressSnapshotWriteRow) {
  await rawQuery(
    `WITH planning_lineage AS (
       SELECT
         baseline_item.baseline_version_id,
         monthly_item.monthly_plan_version_id
       FROM (SELECT 1) AS anchor
       LEFT JOIN public.task_baseline_items AS baseline_item
         ON baseline_item.id = $19::uuid
       LEFT JOIN public.monthly_plan_items AS monthly_item
         ON monthly_item.id = $20::uuid
     )
     INSERT INTO public.task_progress_snapshots (
       task_id,
       progress,
       snapshot_date,
       event_type,
       event_source,
       source_confidence,
       confirmation_status,
       confirmed_at,
       confirmed_by,
       notes,
       status,
       conditions_met_count,
       conditions_total_count,
       obstacles_active_count,
       recorded_by,
       is_auto_generated,
       baseline_version_id,
       monthly_plan_version_id,
       baseline_item_id,
       monthly_plan_item_id,
       planning_source_type,
       planning_source_version_id,
       planning_source_item_id,
       created_at
     )
     SELECT
       $1::uuid,
       $2::integer,
       $3::date,
       $4::text,
       $5::text,
       $6::text,
       $7::text,
       $8::timestamptz,
       $9::uuid,
       $10::text,
       $11::text,
       $12::integer,
       $13::integer,
       $14::integer,
       $15::uuid,
       $16::boolean,
       COALESCE($17::uuid, planning_lineage.baseline_version_id),
       COALESCE($18::uuid, planning_lineage.monthly_plan_version_id),
       $19::uuid,
       $20::uuid,
       COALESCE(
         NULLIF($21::text, ''),
         CASE
           WHEN $20::uuid IS NOT NULL THEN 'monthly_plan'
           WHEN $19::uuid IS NOT NULL THEN 'baseline'
           ELSE 'execution'
         END
       ),
       COALESCE(
         $22::uuid,
         CASE
           WHEN $20::uuid IS NOT NULL THEN COALESCE($18::uuid, planning_lineage.monthly_plan_version_id)
           WHEN $19::uuid IS NOT NULL THEN COALESCE($17::uuid, planning_lineage.baseline_version_id)
           ELSE NULL
         END
       ),
       COALESCE(
         $23::uuid,
         CASE
           WHEN $20::uuid IS NOT NULL THEN $20::uuid
           WHEN $19::uuid IS NOT NULL THEN $19::uuid
           ELSE NULL
         END
       ),
       $24::timestamptz
     FROM planning_lineage
     ON CONFLICT (task_id, snapshot_date, event_type, event_source)
     DO UPDATE SET
       progress = EXCLUDED.progress,
       source_confidence = EXCLUDED.source_confidence,
       confirmation_status = EXCLUDED.confirmation_status,
       confirmed_at = EXCLUDED.confirmed_at,
       confirmed_by = EXCLUDED.confirmed_by,
       notes = EXCLUDED.notes,
       status = EXCLUDED.status,
       conditions_met_count = EXCLUDED.conditions_met_count,
       conditions_total_count = EXCLUDED.conditions_total_count,
       obstacles_active_count = EXCLUDED.obstacles_active_count,
       recorded_by = EXCLUDED.recorded_by,
       is_auto_generated = EXCLUDED.is_auto_generated,
       baseline_version_id = EXCLUDED.baseline_version_id,
       monthly_plan_version_id = EXCLUDED.monthly_plan_version_id,
       baseline_item_id = EXCLUDED.baseline_item_id,
       monthly_plan_item_id = EXCLUDED.monthly_plan_item_id,
       planning_source_type = EXCLUDED.planning_source_type,
       planning_source_version_id = EXCLUDED.planning_source_version_id,
       planning_source_item_id = EXCLUDED.planning_source_item_id,
       created_at = EXCLUDED.created_at`,
    [
      snapshot.task_id,
      snapshot.progress,
      snapshot.snapshot_date,
      snapshot.event_type,
      snapshot.event_source,
      snapshot.source_confidence,
      snapshot.confirmation_status,
      snapshot.confirmed_at,
      snapshot.confirmed_by,
      snapshot.notes,
      snapshot.status,
      snapshot.conditions_met_count,
      snapshot.conditions_total_count,
      snapshot.obstacles_active_count,
      snapshot.recorded_by,
      snapshot.is_auto_generated,
      snapshot.baseline_version_id,
      snapshot.monthly_plan_version_id,
      snapshot.baseline_item_id,
      snapshot.monthly_plan_item_id,
      snapshot.planning_source_type,
      snapshot.planning_source_version_id,
      snapshot.planning_source_item_id,
      snapshot.created_at,
    ],
  )
}

interface TaskUpdateOptions {
  allowReopen?: boolean
  skipSnapshotWrite?: boolean
  executionFactIntent?: ExecutionFactIntent
  executionFactEventDate?: string | null
  allowManualActualDates?: boolean
}

function resolveTaskSnapshotEventType(task: any, previousTask?: any | null) {
  const isMilestone = Boolean(task?.is_milestone)
  if (!previousTask) {
    return isMilestone ? 'milestone_created' : 'task_created'
  }

  const previousCompleted = isCompletedTask(previousTask)
  const nextCompleted = isCompletedTask(task)
  if (previousCompleted && !nextCompleted) {
    return isMilestone ? 'milestone_reopened' : 'task_reopened'
  }
  if (!previousCompleted && nextCompleted) {
    return isMilestone ? 'milestone_completed' : 'task_completed'
  }

  return isMilestone ? 'milestone_update' : 'task_update'
}

function toMonthKey(value?: string | null) {
  const normalized = toDateOnly(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized.slice(0, 7) : null
}

export async function flushTaskProgressSnapshotProjectSideEffects(projectId: string, eventType: string) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return

  const effects: Array<{
    name: 'enqueueProjectHealthUpdate' | 'syncProjectDataQuality'
    run: (() => Promise<unknown> | unknown) | undefined
  }> = [
    {
      name: 'enqueueProjectHealthUpdate',
      run: businessSideEffectAdapters.enqueueProjectHealthUpdate
        ? () => businessSideEffectAdapters.enqueueProjectHealthUpdate!(normalizedProjectId, eventType)
        : undefined,
    },
    {
      name: 'syncProjectDataQuality',
      run: businessSideEffectAdapters.syncProjectDataQuality
        ? () => businessSideEffectAdapters.syncProjectDataQuality!(normalizedProjectId)
        : undefined,
    },
  ]

  for (const effect of effects) {
    if (!effect.run) {
      logger.warn('[dbService] business side-effect adapter is not registered', {
        name: effect.name,
        projectId: normalizedProjectId,
        eventType,
      })
      continue
    }
    try {
      await effect.run()
    } catch (error) {
      logger.warn('[dbService] business side-effect failed', {
        name: effect.name,
        projectId: normalizedProjectId,
        eventType,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export async function recordTaskProgressSnapshot(task: any, options: TaskSnapshotWriteOptions = {}, previousTask?: any | null) {
  const eventType = options.eventType ?? resolveTaskSnapshotEventType(task, previousTask)
  const eventSource = normalizeProgressSnapshotSource(options.eventSource ?? (options.recordedBy ? 'user_action' : 'system_auto'))
  const sourceConfidence = classifyProgressSnapshotSource({ event_source: eventSource })
  const confirmationStatus = options.confirmationStatus
    ?? (options.confirmedAt || options.confirmedBy ? 'confirmed' : 'unconfirmed')
  const snapshot: TaskProgressSnapshotWriteRow = {
    task_id: task.id,
    progress: Number(task.progress ?? 0),
    snapshot_date: toDateOnly(task.updated_at),
    event_type: eventType,
    event_source: eventSource,
    source_confidence: sourceConfidence,
    confirmation_status: confirmationStatus,
    confirmed_at: options.confirmedAt ?? null,
    confirmed_by: options.confirmedBy ?? null,
    notes: options.notes ?? `进度更新: ${Number(task.progress ?? 0)}%`,
    status: task.status ?? null,
    conditions_met_count: Number(task.conditions_met_count ?? 0),
    conditions_total_count: Number(task.conditions_total_count ?? 0),
    obstacles_active_count: Number(task.obstacles_active_count ?? 0),
    recorded_by: options.recordedBy ?? null,
    is_auto_generated: true,
    baseline_version_id: task.baseline_version_id ?? null,
    monthly_plan_version_id: task.monthly_plan_version_id ?? null,
    baseline_item_id: task.baseline_item_id ?? null,
    monthly_plan_item_id: task.monthly_plan_item_id ?? null,
    planning_source_type: task.planning_source_type
      ?? (task.monthly_plan_item_id ? 'monthly_plan' : task.baseline_item_id ? 'baseline' : 'execution'),
    planning_source_version_id: task.planning_source_version_id ?? null,
    planning_source_item_id: task.planning_source_item_id
      ?? task.monthly_plan_item_id
      ?? task.baseline_item_id
      ?? null,
    created_at: now(),
  }

  if (shouldUseDirectSqlPath() || isDatabaseTransactionActive()) {
    await writeTaskProgressSnapshotDirect(snapshot)
  } else {
    const snapshotTable = supabase.from('task_progress_snapshots') as unknown as SnapshotTableLike
    const mutation = typeof snapshotTable.upsert === 'function'
      ? snapshotTable.upsert(snapshot, {
        onConflict: 'task_id,snapshot_date,event_type,event_source',
        ignoreDuplicates: false,
      })
      : snapshotTable.insert({
        id: uuidv4(),
        ...snapshot,
      })
    const { error } = await mutation
    if (error) {
      const message = String(error.message ?? '')
      const isUpsertUnsupported = message.includes('no unique or exclusion constraint matching the ON CONFLICT specification')
      const isDuplicateKey = message.includes('duplicate key value violates unique constraint')
      if (isUpsertUnsupported || isDuplicateKey) {
        logger.warn('[dbService] task_progress_snapshots missing unique upsert index or hit duplicate, using select-then-update-or-insert fallback', {
          taskId: task.id,
          snapshotDate: snapshot.snapshot_date,
          eventType: snapshot.event_type,
          eventSource: snapshot.event_source,
          reason: isUpsertUnsupported ? 'missing_upsert_index' : 'duplicate_key',
        })
        const { data: existingRows } = await supabase
          .from('task_progress_snapshots')
          .select('id')
          .eq('task_id', snapshot.task_id)
          .eq('snapshot_date', snapshot.snapshot_date)
          .eq('event_type', snapshot.event_type)
          .eq('event_source', snapshot.event_source)
        const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows
        if (existing?.id) {
          const { error: updateErr } = await supabase
            .from('task_progress_snapshots')
            .update({
              progress: snapshot.progress,
              notes: snapshot.notes,
              source_confidence: snapshot.source_confidence,
              confirmation_status: snapshot.confirmation_status,
              confirmed_at: snapshot.confirmed_at,
              confirmed_by: snapshot.confirmed_by,
              status: snapshot.status,
              conditions_met_count: snapshot.conditions_met_count,
              conditions_total_count: snapshot.conditions_total_count,
              obstacles_active_count: snapshot.obstacles_active_count,
              recorded_by: snapshot.recorded_by,
              baseline_version_id: snapshot.baseline_version_id,
              monthly_plan_version_id: snapshot.monthly_plan_version_id,
              baseline_item_id: snapshot.baseline_item_id,
              monthly_plan_item_id: snapshot.monthly_plan_item_id,
              planning_source_type: snapshot.planning_source_type,
              planning_source_version_id: snapshot.planning_source_version_id,
              planning_source_item_id: snapshot.planning_source_item_id,
            })
            .eq('id', existing.id)
          if (updateErr) throw new Error(updateErr.message)
        } else {
          const { error: insertErr } = await snapshotTable.insert({
            id: uuidv4(),
            ...snapshot,
          })
          if (insertErr && !String(insertErr.message ?? '').includes('duplicate key value violates unique constraint')) {
            throw new Error(insertErr.message)
          }
        }
      } else {
        throw new Error(error.message)
      }
    }
  }

  const projectId = String(task?.project_id ?? '').trim()
  if (projectId && !options.deferProjectSideEffects) {
    runBusinessSideEffect(
      'enqueueProjectHealthUpdate',
      businessSideEffectAdapters.enqueueProjectHealthUpdate
        ? () => businessSideEffectAdapters.enqueueProjectHealthUpdate!(projectId, eventType)
        : undefined,
      { projectId, eventType },
    )
    runBusinessSideEffect(
      'syncProjectDataQuality',
      businessSideEffectAdapters.syncProjectDataQuality
        ? () => businessSideEffectAdapters.syncProjectDataQuality!(projectId)
        : undefined,
      { projectId, eventType },
    )
  }
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export async function getProjects(): Promise<Project[]> {
  try {
    // v1.4.22.1: exclude wizard_drafting projects from main list
    const result = await rawQuery(`SELECT ${PROJECT_LIST_COLUMNS} FROM public.projects WHERE (status IS NULL OR status != 'wizard_drafting') ORDER BY created_at DESC`)
    return result.rows as Project[]
  } catch (error) {
    logger.warn('dbService.getProjects fallback to Supabase REST', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_LIST_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return asProjectRows(data)
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    const result = await rawQuery('SELECT * FROM public.projects WHERE id = $1 LIMIT 1', [id])
    return (result.rows[0] as Project | undefined) ?? null
  } catch (error) {
    logger.warn('dbService.getProject fallback to Supabase REST', {
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null // not found
    throw new Error(error.message)
  }
  return data as Project
}

function normalizeProjectStatus(status?: string | null): Project['status'] {
  switch (String(status || '').trim()) {
    case 'wizard_drafting':
      return 'wizard_drafting'
    case '已完成':
    case 'completed':
    case 'done':
      return '已完成'
    case '进行中':
    case 'in_progress':
    case 'active':
      return '进行中'
    case '已暂停':
    case 'paused':
    case 'archived':
      return '已暂停'
    case '未开始':
    case 'planning':
    case 'pending':
    case 'not_started':
    default:
      return '未开始'
  }
}

export async function createProject(
  project: ProjectCreateInput
): Promise<Project> {
  const companyId = String(project.company_id ?? project.companyId ?? '').trim()
  const ownerId = String(project.owner_id ?? '').trim()
  if (!companyId || !ownerId) {
    throw createProjectMutationError(
      'PROJECT_OWNERSHIP_REQUIRED',
      '创建项目必须提供有效的 company_id 和 owner_id',
      400,
    )
  }

  const id = project.id || uuidv4()
  const ts = now()
  const row = {
    id,
    name: project.name,
    description: project.description ?? null,
    company_id: companyId,
    project_visibility: project.project_visibility ?? 'private',
    status: normalizeProjectStatus(project.status),
    owner_id: ownerId,
    created_by: project.created_by ?? ownerId,
    project_type: project.project_type ?? null,
    building_type: project.building_type ?? null,
    structure_type: project.structure_type ?? null,
    building_count: project.building_count ?? 1,
    above_ground_floors: project.above_ground_floors ?? null,
    underground_floors: project.underground_floors ?? null,
    support_method: project.support_method ?? null,
    total_area: project.total_area ?? null,
    planned_start_date: project.planned_start_date ?? null,
    planned_end_date: project.planned_end_date ?? null,
    actual_start_date: project.actual_start_date ?? null,
    actual_end_date: project.actual_end_date ?? null,
    total_investment: project.total_investment ?? null,
    health_score: project.health_score ?? 50,
    health_status: project.health_status ?? '亚健康',
    version: project.version ?? 1,
    created_at: ts,
    updated_at: ts,
  }
  const { error } = await supabase.from('projects').insert(row)
  if (error) {
    if (isMissingSupabaseResourceError(error)) {
      throw createProjectSchemaIncompatibleError(error)
    }
    throw new Error(error.message)
  }

  try {
    const { data: existingMember, error: existingMemberError } = await supabase
      .from('project_members')
      .select('id, joined_at')
      .eq('project_id', id)
      .eq('user_id', row.owner_id)
      .maybeSingle()

    if (existingMemberError) {
      throw new Error(existingMemberError.message)
    }

    if (existingMember?.id) {
      const { error: updateMemberError } = await supabase
        .from('project_members')
        .update({
          permission_level: 'owner',
          is_active: true,
          joined_at: existingMember.joined_at ?? ts,
          last_activity: ts,
        })
        .eq('id', existingMember.id)

      if (updateMemberError) {
        throw new Error(updateMemberError.message)
      }
    } else {
      const { error: insertMemberError } = await supabase
        .from('project_members')
        .insert({
          id: uuidv4(),
          project_id: id,
          user_id: row.owner_id,
          permission_level: 'owner',
          joined_at: ts,
          is_active: true,
          last_activity: ts,
        })

      if (insertMemberError) {
        throw new Error(insertMemberError.message)
      }
    }
  } catch (membershipError) {
    await supabase.from('projects').delete().eq('id', id)
    throw membershipError
  }

  return (await getProject(id))!
}

export async function updateProject(
  id: string,
  updates: ProjectUpdateInput,
  expectedVersion?: number
): Promise<Project | null> {
  const { id: _id, created_at: _ca, updated_at: _ua, version: _v, ...fields } = updates
  const normalizedFields = {
    ...fields,
    ...(fields.status !== undefined ? { status: normalizeProjectStatus(fields.status) } : {}),
  }
  
  // 乐观锁：原子性更新，将版本检查放在 WHERE 条件中
  if (expectedVersion !== undefined) {
    // 原子更新：UPDATE ... WHERE id = ? AND version = ?
    const { data, error } = await supabase
      .from('projects')
      .update({ 
        ...normalizedFields, 
        updated_at: now(), 
        version: expectedVersion + 1 
      })
      .eq('id', id)
      .eq('version', expectedVersion)  // 原子版本检查
      .select('id')
      .maybeSingle()
    
    if (error) {
      if (isMissingSupabaseResourceError(error)) {
        throw createProjectSchemaIncompatibleError(error)
      }
      throw new Error(error.message)
    }
    
    // Supabase update 未命中时 data 可能为 null，而不是稳定返回 count=0。
    if (!data) {
      throw new Error('VERSION_MISMATCH: 该项目已被他人修改，请刷新后重试')
    }
    
    return getProject(id)
  }
  
  // 无乐观锁：普通更新
  const { error } = await supabase
    .from('projects')
    .update({ ...normalizedFields, updated_at: now() })
    .eq('id', id)
    
  if (error) throw new Error(error.message)
  return getProject(id)
}

export type ProjectDeleteAuditContext = {
  actorUserId: string
  actorUsername?: string | null
  companyId?: string | null
  confirmation: {
    action: 'delete-project'
    resourceId: string
    source: 'explicit_request_header'
  }
  requestPath: string
}

export async function deleteProject(id: string, audit: ProjectDeleteAuditContext): Promise<void> {
  const projectId = String(id ?? '').trim()
  if (!projectId) return
  const actorUserId = String(audit?.actorUserId ?? '').trim()
  if (
    !actorUserId
    || audit?.confirmation?.action !== 'delete-project'
    || String(audit.confirmation.resourceId ?? '').trim() !== projectId
    || audit.confirmation.source !== 'explicit_request_header'
  ) {
    throw new Error('Project deletion requires a resource-bound confirmation audit context')
  }

  const { getClient } = await import('../database.js')
  const client = await getClient()
  let transactionStarted = false

  try {
    await client.query('BEGIN')
    transactionStarted = true

    for (const step of PROJECT_DELETE_CLEANUP_STEPS) {
      const column = step.column ?? 'project_id'
      await client.query(
        `DELETE FROM public.${step.table} WHERE ${column} = $1`,
        [projectId],
      )
    }

    await client.query('DELETE FROM public.projects WHERE id = $1', [projectId])
    await client.query(
      `INSERT INTO public.operation_logs
        (user_id, username, project_id, action, resource_type, resource_id,
         method, path, status_code, detail, created_at)
       VALUES ($1, $2, $3, 'project:delete_confirmed', 'project', $3,
               'DELETE', $4, 200, $5::jsonb, NOW())`,
      [
        actorUserId,
        audit.actorUsername ?? null,
        projectId,
        audit.requestPath,
        JSON.stringify({
          companyId: audit.companyId ?? null,
          confirmation: audit.confirmation,
          auditPolicy: 'same_transaction_as_project_delete',
        }),
      ],
    )
    await client.query('COMMIT')
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        logger.error('Project deletion rollback failed', {
          projectId,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        })
      }
    }
    throw error
  } finally {
    client.release()
  }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
async function attachEngineeringCategoryInfo(tasks: Task[]): Promise<Task[]> {
  const categoryIds = Array.from(new Set(
    tasks
      .map((task) => task.engineering_category_id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  ))
  if (categoryIds.length === 0) return tasks

  try {
    const { data, error } = await withSupabaseRestTimeout(supabase
      .from('engineering_categories')
      .select('id, category_type, category_name')
      .in('id', categoryIds), 'dbService.attachEngineeringCategoryInfo')
    if (error) throw new Error(error.message)

    const categoriesById = new Map((data ?? []).map((category) => [
      String(category.id),
      {
        engineering_category_type: category.category_type as string | null,
        engineering_category_name: category.category_name as string | null,
      },
    ]))

    return tasks.map((task) => {
      const category = task.engineering_category_id ? categoriesById.get(task.engineering_category_id) : null
      if (!category) return task
      return {
        ...task,
        engineering_category_type: task.engineering_category_type ?? category.engineering_category_type,
        engineering_category_name: task.engineering_category_name ?? category.engineering_category_name,
      }
    })
  } catch (directError) {
    logger.warn('dbService.attachEngineeringCategoryInfo REST read failed, falling back to direct query', {
      error: directError instanceof Error ? directError.message : String(directError),
    })
  }

  if (isCircuitOpen(dbDirectQueryCircuitOpenUntil)) {
    logger.warn('dbService.attachEngineeringCategoryInfo skipped direct query because direct DB circuit is open', {
      remainingMs: remainingCircuitMs(dbDirectQueryCircuitOpenUntil),
    })
    return tasks
  }

  try {
    const placeholders = categoryIds.map((_, index) => `$${index + 1}`).join(', ')
    const result = await withDirectQueryTimeout(
      rawQuery(
        `SELECT id, category_type, category_name
           FROM public.engineering_categories
          WHERE id IN (${placeholders})`,
        categoryIds,
      ),
      'dbService.attachEngineeringCategoryInfo direct query',
    )

    const categoriesById = new Map<string, {
      engineering_category_type: string | null
      engineering_category_name: string | null
    }>((result.rows ?? []).map((category: any) => [
      String(category.id),
      {
        engineering_category_type: category.category_type as string | null,
        engineering_category_name: category.category_name as string | null,
      },
    ] as const))

    return tasks.map((task) => {
      const category = task.engineering_category_id ? categoriesById.get(task.engineering_category_id) : null
      if (!category) return task
      return {
        ...task,
        engineering_category_type: task.engineering_category_type ?? category.engineering_category_type,
        engineering_category_name: task.engineering_category_name ?? category.engineering_category_name,
      }
    })
  } catch (error) {
    logger.warn('dbService.attachEngineeringCategoryInfo skipped', {
      error: error instanceof Error ? error.message : String(error),
    })
    return tasks
  }
}

export type GetTasksOptions = {
  columns?: readonly string[]
}

function buildTaskSelectClause(columns?: readonly string[]) {
  if (!columns || columns.length === 0) return '*'
  return Array.from(new Set(columns))
    .map((column) => String(column).trim())
    .filter((column) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column))
    .join(', ') || '*'
}

function buildTaskReadCacheKey(projectId: string | undefined, selectClause: string) {
  return `${String(projectId ?? '').trim() || '*'}::${selectClause}`
}

function buildTaskReadProjectKey(projectId?: string | null) {
  return String(projectId ?? '').trim() || '*'
}

function getTaskReadInvalidationVersion(projectKey: string) {
  return taskReadInvalidationVersion.get(projectKey) ?? 0
}

function cloneTasksForReadCache(tasks: Task[]) {
  return tasks.map((task) => ({ ...task }))
}

export function invalidateTaskReadCache(projectId?: string | null) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) {
    taskReadCache.clear()
    taskReadInFlight.clear()
    taskReadInvalidationVersion.set('*', getTaskReadInvalidationVersion('*') + 1)
    return
  }

  taskReadInvalidationVersion.set(
    normalizedProjectId,
    getTaskReadInvalidationVersion(normalizedProjectId) + 1,
  )
  taskReadInvalidationVersion.set('*', getTaskReadInvalidationVersion('*') + 1)

  for (const [key, entry] of taskReadCache.entries()) {
    if (entry.projectId === normalizedProjectId || entry.projectId === null) {
      taskReadCache.delete(key)
    }
  }
  for (const key of taskReadInFlight.keys()) {
    if (key.startsWith(`${normalizedProjectId}::`) || key.startsWith('*::')) {
      taskReadInFlight.delete(key)
    }
  }
}

async function loadTasksFromSupabaseRest(projectId: string | undefined, selectClause: string): Promise<Task[]> {
  const pageSize = 1000
  const rows: Task[] = []
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from('tasks')
      .select(selectClause)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (projectId) query = query.eq('project_id', projectId)
    const { data, error } = await withSupabaseRestTimeout(query, `dbService.getTasks REST page ${Math.floor(offset / pageSize) + 1}`)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as unknown as Task[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return attachEngineeringCategoryInfo(rows)
}

async function loadTasksFromDirectDatabase(projectId: string | undefined, selectClause: string): Promise<Task[]> {
  const sql = projectId
    ? `SELECT ${selectClause} FROM public.tasks WHERE project_id = $1 ORDER BY created_at DESC`
    : `SELECT ${selectClause} FROM public.tasks ORDER BY created_at DESC`

  const result = projectId
    ? await withDirectQueryTimeout(rawQuery(sql, [projectId]), 'dbService.getTasks direct query')
    : await withDirectQueryTimeout(rawQuery(sql), 'dbService.getTasks direct query')
  return attachEngineeringCategoryInfo(result.rows as Task[])
}

async function loadTasksFromDatabase(projectId: string | undefined, selectClause: string): Promise<Task[]> {
  let restError: unknown = null
  let directError: unknown = null
  const readFromRestFirst = TASK_READ_REST_FIRST
    && !shouldUseDirectSqlPath()
    && !isDatabaseTransactionActive()

  if (readFromRestFirst) {
    try {
      return await loadTasksFromSupabaseRest(projectId, selectClause)
    } catch (error) {
      restError = error
      logger.warn('dbService.getTasks REST read failed, falling back to direct query', {
        projectId: projectId ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!isCircuitOpen(dbDirectQueryCircuitOpenUntil)) {
    try {
      return await loadTasksFromDirectDatabase(projectId, selectClause)
    } catch (error) {
      directError = error
      logger.warn('dbService.getTasks fallback to Supabase REST', {
        projectId: projectId ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    logger.warn('dbService.getTasks skipped direct query because direct DB circuit is open', {
      projectId: projectId ?? null,
      remainingMs: remainingCircuitMs(dbDirectQueryCircuitOpenUntil),
    })
  }

  if (!readFromRestFirst) {
    return await loadTasksFromSupabaseRest(projectId, selectClause)
  }

  if (directError instanceof Error) throw directError
  throw restError instanceof Error ? restError : new Error(String(restError ?? 'Task REST read failed'))
}

export async function getTasks(projectId?: string, options: GetTasksOptions = {}): Promise<Task[]> {
  const selectClause = buildTaskSelectClause(options.columns)
  const cacheKey = buildTaskReadCacheKey(projectId, selectClause)
  const projectKey = buildTaskReadProjectKey(projectId)
  const nowMs = Date.now()
  const cached = taskReadCache.get(cacheKey)

  if (cached && nowMs < cached.expiresAt) {
    return cloneTasksForReadCache(cached.rows)
  }

  const inFlight = taskReadInFlight.get(cacheKey)
  if (inFlight) {
    return cloneTasksForReadCache(await inFlight)
  }

  const requestVersion = getTaskReadInvalidationVersion(projectKey)
  const request = loadTasksFromDatabase(projectId, selectClause)
    .then((rows) => {
      if (getTaskReadInvalidationVersion(projectKey) === requestVersion) {
        taskReadCache.set(cacheKey, {
          projectId: projectId ? String(projectId) : null,
          rows,
          expiresAt: Date.now() + TASK_READ_CACHE_TTL_MS,
          staleUntil: Date.now() + TASK_READ_STALE_TTL_MS,
        })
      }
      return rows
    })

  taskReadInFlight.set(cacheKey, request)

  try {
    return cloneTasksForReadCache(await request)
  } catch (error) {
    if (cached && nowMs < cached.staleUntil) {
      logger.warn('dbService.getTasks served stale cache after read failure', {
        projectId: projectId ?? null,
        error: error instanceof Error ? error.message : String(error),
      })
      return cloneTasksForReadCache(cached.rows)
    }
    throw error
  } finally {
    if (taskReadInFlight.get(cacheKey) === request) {
      taskReadInFlight.delete(cacheKey)
    }
  }
}

export async function getTask(id: string): Promise<Task | null> {
  if (isDatabaseTransactionActive() || shouldUseDirectSqlPath()) {
    const result = await rawQuery('SELECT * FROM tasks WHERE id = $1 LIMIT 1', [id])
    return (result.rows[0] as Task | undefined) ?? null
  }
  const { data, error } = await supabase.from('tasks').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as Task
}

export async function createTask(
  task: TaskWriteInput,
  options: Pick<TaskUpdateOptions, 'skipSnapshotWrite'> = {},
): Promise<Task> {
  const id = (task as any).id || uuidv4()
  const ts = now()
  const normalizedProgress = normalizeTaskProgressValue(task.progress ?? 0)
  const row = {
    id,
    project_id: task.project_id,
    parent_id: task.parent_id ?? null,
    title: task.title,
    description: task.description ?? null,
    status: task.status ?? 'todo',
    priority: task.priority ?? 'medium',
    progress: normalizedProgress,
    task_type: task.task_type ?? 'task',
    wbs_code: task.wbs_code ?? null,
    wbs_level: task.wbs_level ?? 0,
    sort_order: task.sort_order ?? (task.wbs_order ?? 0),
    is_milestone: task.is_milestone ?? false,
    milestone_level: task.milestone_level ?? null,
    milestone_order: task.milestone_order ?? null,
    milestone_id: task.milestone_id ?? null,
    specialty_type: task.specialty_type ?? null,
    duration_calibration_source: (task as any).duration_calibration_source ?? null,
    duration_provenance: (task as any).duration_provenance ?? null,
    first_progress_at: task.first_progress_at ?? null,
    delay_reason: task.delay_reason ?? null,
    planned_start_date: task.planned_start_date ?? task.start_date ?? null,
    planned_end_date: task.planned_end_date ?? task.end_date ?? null,
    actual_start_date: null,
    actual_end_date: null,
    assignee_id: task.assignee_id ?? task.assignee_user_id ?? null,
    assignee_user_id: task.assignee_user_id ?? task.assignee_id ?? null,
    assignee_name: task.assignee_name ?? task.assignee ?? null,
    participant_unit_id: task.participant_unit_id ?? null,
    // v1.4 range-tree engineering object references
    engineering_object_id: (task as any).engineering_object_id ?? (task as any).engineeringObjectId ?? null,
    phase_object_id: (task as any).phase_object_id ?? (task as any).phaseObjectId ?? null,
    section_object_id: (task as any).section_object_id ?? (task as any).sectionObjectId ?? null,
    building_object_id: (task as any).building_object_id ?? (task as any).buildingObjectId ?? null,
    basement_object_id: (task as any).basement_object_id ?? (task as any).basementObjectId ?? null,
    floor_object_id: (task as any).floor_object_id ?? (task as any).floorObjectId ?? null,
    physical_zone_object_id: (task as any).physical_zone_object_id ?? (task as any).physicalZoneObjectId ?? null,
    functional_area_object_id: (task as any).functional_area_object_id ?? (task as any).functionalAreaObjectId ?? null,
    assignee_type: task.assignee_type ?? 'person',
    estimated_hours: task.estimated_hours ?? null,
    actual_hours: task.actual_hours ?? null,
    // v1.4.2 WBS semantic fields
    engineering_category_id: (task as any).engineering_category_id ?? null,
    wbs_node_type: (task as any).wbs_node_type ?? null,
    wbs_path: (task as any).wbs_path ?? null,
    is_leaf: (task as any).is_leaf ?? null,
    is_wbs_summary: (task as any).is_wbs_summary ?? null,
    is_executable: (task as any).is_executable ?? null,
    standard_work_code: (task as any).standard_work_code ?? null,
    standard_work_name: (task as any).standard_work_name ?? null,
    // v1.4.3 task standard fields
    task_code: (task as any).task_code ?? null,
    task_code_version: (task as any).task_code_version ?? null,
    progress_method: (task as any).progress_method ?? 'percent',
    planned_quantity: (task as any).planned_quantity ?? null,
    completed_quantity: (task as any).completed_quantity ?? null,
    quantity_unit: (task as any).quantity_unit ?? null,
    progress_weight: (task as any).progress_weight ?? 1,
    completion_rule: (task as any).completion_rule ?? 'progress_100',
    drawing_required: (task as any).drawing_required ?? false,
    material_required: (task as any).material_required ?? false,
    acceptance_required: (task as any).acceptance_required ?? false,
    quality_required: (task as any).quality_required ?? false,
    standard_task_metadata: (task as any).standard_task_metadata ?? {},
    // 恢复：添加 version 字段（乐观锁支持）
    version: task.version ?? 1,
    // 修复：只在 created_by 为有效 UUID 时才添加到 row
    ...(task.created_by ? { created_by: task.created_by } : {}),
    created_at: ts,
    updated_at: ts,
  }
  const { error } = await supabase.from('tasks').insert(row)
  if (error) {
    throw new Error(error.message)
  }
  invalidateTaskReadCache(task.project_id)
  const createdTask = await getTask(id)
  if (createdTask && !options.skipSnapshotWrite) {
    await recordTaskProgressSnapshot(createdTask, {
      recordedBy: task.created_by ?? null,
      notes: Boolean(createdTask.is_milestone)
        ? '里程碑已创建并纳入快照链路'
        : '任务已创建并纳入快照链路',
    })
  }
  return createdTask!
}

export async function updateTask(
  id: string,
  updates: TaskUpdateInput,
  expectedVersion?: number,
  options: TaskUpdateOptions = {},
): Promise<Task | null> {
  const oldTask = await getTask(id)
  if (!oldTask) return null

  const {
    id: _id,
    created_at: _ca,
    version: _v,
    dependencies: _legacyDependencies,
    first_progress_at: manualFirstProgressAt,
    actual_start_date: manualActualStartDate,
    actual_end_date: manualActualEndDate,
    ...rawFields
  } = updates
  let fields = rawFields
  if (options.allowManualActualDates) {
    const managedFields = fields as Record<string, unknown>
    if (manualFirstProgressAt !== undefined) managedFields.first_progress_at = manualFirstProgressAt
    if (manualActualStartDate !== undefined) managedFields.actual_start_date = manualActualStartDate
    if (manualActualEndDate !== undefined) managedFields.actual_end_date = manualActualEndDate
  }
  if ('assignee_user_id' in fields && !('assignee_id' in fields)) {
    fields.assignee_id = fields.assignee_user_id ?? null
  }
  if ('assignee_id' in fields && !('assignee_user_id' in fields)) {
    fields.assignee_user_id = fields.assignee_id ?? null
  }
  // v1.4.1 Normalize camelCase engineering object IDs to snake_case DB columns
  if ('engineeringObjectId' in fields && !('engineering_object_id' in fields)) {
    fields.engineering_object_id = (fields as any).engineeringObjectId ?? null
  }
  if ('phaseObjectId' in fields && !('phase_object_id' in fields)) {
    fields.phase_object_id = (fields as any).phaseObjectId ?? null
  }
  if ('sectionObjectId' in fields && !('section_object_id' in fields)) {
    fields.section_object_id = (fields as any).sectionObjectId ?? null
  }
  if ('buildingObjectId' in fields && !('building_object_id' in fields)) {
    fields.building_object_id = (fields as any).buildingObjectId ?? null
  }
  if ('basementObjectId' in fields && !('basement_object_id' in fields)) {
    fields.basement_object_id = (fields as any).basementObjectId ?? null
  }
  if ('floorObjectId' in fields && !('floor_object_id' in fields)) {
    fields.floor_object_id = (fields as any).floorObjectId ?? null
  }
  if ('physicalZoneObjectId' in fields && !('physical_zone_object_id' in fields)) {
    fields.physical_zone_object_id = (fields as any).physicalZoneObjectId ?? null
  }
  if ('functionalAreaObjectId' in fields && !('functional_area_object_id' in fields)) {
    fields.functional_area_object_id = (fields as any).functionalAreaObjectId ?? null
  }
  if (!options.allowReopen && fields.status !== undefined && isCompletedTaskStatus(fields.status)) {
    fields.progress = 100
  }
  if (fields.progress !== undefined) {
    fields.progress = normalizeTaskProgressValue(fields.progress)
  }
  const nowTs = now()
  const mergedTask = { ...oldTask, ...fields }
  let nextStatus = String(mergedTask.status ?? oldTask.status)
  const previousProgress = Number(oldTask.progress ?? 0)
  const nextProgress = Number(mergedTask.progress ?? oldTask.progress ?? 0)
  const isFirstProgressAdvance = previousProgress === 0 && nextProgress > 0 && !oldTask.first_progress_at
  const wasCompleted = isCompletedTask(oldTask)
  const requestsReopen =
    wasCompleted
    && (
      (fields.progress !== undefined && nextProgress < 100)
      || (fields.status !== undefined && !isCompletedTaskStatus(nextStatus))
    )

  if (requestsReopen && !options.allowReopen) {
    throw createBusinessError(
      'TASK_REOPEN_REQUIRED',
      '任务已完成，回退进度必须通过专用 reopen 动作处理',
    )
  }

  if (options.allowReopen) {
    if (!wasCompleted) {
      throw createBusinessError('TASK_REOPEN_NOT_ALLOWED', '当前任务未处于已完成状态，不能执行 reopen', 422)
    }
    if (fields.progress === undefined) {
      throw createBusinessError('TASK_REOPEN_PROGRESS_REQUIRED', 'reopen 必须提供小于 100 的目标进度', 400)
    }
    if (nextProgress >= 100) {
      throw createBusinessError('TASK_REOPEN_PROGRESS_INVALID', 'reopen 后的任务进度必须小于 100', 400)
    }
    fields.status = 'in_progress'
    mergedTask.status = 'in_progress'
    mergedTask.actual_end_date = null
    nextStatus = 'in_progress'
  }

  const isProgressAdvance = fields.progress !== undefined && nextProgress > previousProgress

  if (isProgressAdvance && !isFirstProgressAdvance) {
    // v1.4.8: unmet start conditions are execution quality signals, not a hard write block.
    const unmetConditionIds = await listUnmetTaskConditionIds(id)
    if (unmetConditionIds.length > 0) {
      logger.info('[dbService] task progressed with unmet start conditions', {
        taskId: id,
        unmetConditionCount: unmetConditionIds.length,
      })
    }
  }

  const governedExecutionFacts = applyExecutionFactGovernance({
    intent: options.allowReopen
      ? ExecutionFactIntent.TaskReopen
      : options.executionFactIntent ?? ExecutionFactIntent.TaskApiUpdate,
    previousTask: oldTask,
    patch: fields,
    now: nowTs,
    eventDate: options.executionFactEventDate ?? null,
    allowManualActualDates: options.allowManualActualDates === true,
  })
  fields = governedExecutionFacts.patch as typeof fields
  const autoActualStart = governedExecutionFacts.generatedFields.includes('actual_start_date')
  const autoActualEnd = governedExecutionFacts.generatedFields.includes('actual_end_date')
  const autoFirstProgress = governedExecutionFacts.generatedFields.includes('first_progress_at')
  const updatePayload = {
    ...fields,
    ...(options.allowReopen ? { actual_end_date: null } : {}),
    updated_at: nowTs,
    ...(expectedVersion !== undefined ? { version: expectedVersion + 1 } : {}),
  }

  // 乐观锁：原子性更新，将版本检查放在 WHERE 条件中
  let updatedTask: Task | null = null
  if (expectedVersion !== undefined) {
    const { data, error } = await supabase
      .from('tasks')
      .update(updatePayload)
      .eq('id', id)
      .eq('version', expectedVersion)
      .select('id')
      .maybeSingle()

    if (error) throw new Error(error.message)
    // Supabase update 未命中时 data 可能为 null，而不是稳定返回 count=0。
    if (!data) {
      throw new Error('VERSION_MISMATCH: 该任务已被他人修改，请刷新后重试')
    }
    updatedTask = await getTask(id)
  } else {
    const { error } = await supabase
      .from('tasks')
      .update(updatePayload)
      .eq('id', id)

    if (error) throw new Error(error.message)
    updatedTask = await getTask(id)
  }

  if (!updatedTask) return null
  invalidateTaskReadCache(oldTask.project_id ?? updatedTask.project_id ?? null)

  const changedBy = (fields.updated_by ?? fields.created_by ?? null) as string | null
  const isCrossMonthReopen =
    Boolean(options.allowReopen)
    && Boolean(oldTask.actual_end_date)
    && toMonthKey(oldTask.actual_end_date) !== toMonthKey(nowTs)
  type TrackedTaskField =
    | 'title'
    | 'status'
    | 'progress'
    | 'start_date'
    | 'end_date'
    | 'planned_start_date'
    | 'planned_end_date'
    | 'delay_reason'
  const changedFieldPairs: Array<{
    field: TrackedTaskField | 'actual_start_date' | 'actual_end_date' | 'first_progress_at'
    oldValue: string | number | boolean | null | undefined
    newValue: string | number | boolean | null | undefined
    source: 'manual_adjusted' | 'system_auto'
  }> = []
  const trackedFields: TrackedTaskField[] = ['title', 'status', 'progress', 'start_date', 'end_date', 'planned_start_date', 'planned_end_date', 'delay_reason']
  for (const field of trackedFields) {
    if (field in fields || (field === 'status' && autoActualStart) || (field === 'status' && autoActualEnd)) {
      const oldValue = oldTask[field]
      const newValue = updatedTask[field]
      if (oldValue !== newValue) {
        changedFieldPairs.push({
          field,
          oldValue,
          newValue,
          source: 'manual_adjusted',
        })
      }
    }
  }

  if (autoActualStart && oldTask.actual_start_date !== updatedTask.actual_start_date) {
    changedFieldPairs.push({
      field: 'actual_start_date',
      oldValue: oldTask.actual_start_date ?? null,
      newValue: updatedTask.actual_start_date ?? null,
      source: 'system_auto',
    })
  }
  if (autoActualEnd && oldTask.actual_end_date !== updatedTask.actual_end_date) {
    changedFieldPairs.push({
      field: 'actual_end_date',
      oldValue: oldTask.actual_end_date ?? null,
      newValue: updatedTask.actual_end_date ?? null,
      source: 'system_auto',
    })
  }
  if (
    options.allowReopen
    && oldTask.actual_end_date !== updatedTask.actual_end_date
    && !changedFieldPairs.some((change) => change.field === 'actual_end_date')
  ) {
    changedFieldPairs.push({
      field: 'actual_end_date',
      oldValue: oldTask.actual_end_date ?? null,
      newValue: updatedTask.actual_end_date ?? null,
      source: 'manual_adjusted',
    })
  }
  if (autoFirstProgress && oldTask.first_progress_at !== updatedTask.first_progress_at) {
    changedFieldPairs.push({
      field: 'first_progress_at',
      oldValue: oldTask.first_progress_at ?? null,
      newValue: updatedTask.first_progress_at ?? null,
      source: 'system_auto',
    })
  }

  for (const change of changedFieldPairs) {
    await writeChangeLog({
      project_id: oldTask.project_id ?? null,
      entity_type: 'task',
      entity_id: id,
      field_name: change.field,
      old_value: change.oldValue ?? null,
      new_value: change.newValue ?? null,
      changed_by: change.source === 'system_auto' ? changedBy : changedBy,
      change_source: change.source,
    })
  }

  if (isCrossMonthReopen) {
    await writeLifecycleChangeLog({
      project_id: oldTask.project_id ?? null,
      entity_type: 'task',
      entity_id: id,
      action: 'cross_month_reopened',
      changed_by: changedBy,
      change_source: 'manual_adjusted',
    })
  }

  // end_date 变更直接作为当前排期调整，后续由月度计划、月末关账和项目基线重编算法自动消化。
  // 仅通过 change_logs 留痕（已在上方 changedFieldPairs 中覆盖 end_date / planned_end_date）。

  const needsSnapshot = shouldRecordTaskProgressSnapshot(oldTask, updatedTask)

  if (needsSnapshot && !options.skipSnapshotWrite) {
    await recordTaskProgressSnapshot(updatedTask, {
      recordedBy: changedBy,
    }, oldTask)
  }

  if (fields.progress !== undefined || fields.status !== undefined) {
    runBusinessSideEffect(
      'evaluateTaskConstraint',
      businessSideEffectAdapters.evaluateTaskConstraint
        ? () => businessSideEffectAdapters.evaluateTaskConstraint!(id, {
          projectId: String(oldTask.project_id ?? ''),
          sourceEventType: 'task_progress_or_status_updated',
        })
        : undefined,
      { taskId: id },
    )
  }

  return updatedTask
}

export async function reopenTask(
  id: string,
  updates: Pick<Partial<Task>, 'progress' | 'updated_by'>,
  expectedVersion?: number,
  options: Pick<TaskUpdateOptions, 'skipSnapshotWrite'> = {},
): Promise<Task | null> {
  return await updateTask(
    id,
    {
      ...updates,
      status: 'in_progress',
      actual_end_date: null,
    } as Partial<Task>,
    expectedVersion,
    { ...options, allowReopen: true },
  )
}

export async function deleteTask(id: string): Promise<void> {
  const existingTask = await getTask(id).catch((error) => {
    logger.warn('Failed to read task before delete cache invalidation', {
      taskId: id,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  })
  if (isDatabaseTransactionActive()) {
    await rawQuery('SELECT public.delete_task_with_source_backfill_atomic($1)', [id])
    invalidateTaskReadCache(existingTask?.project_id ?? null)
    return
  }

  await runRpc<boolean>('delete_task_with_source_backfill_atomic', {
    p_task_id: id,
  })
  invalidateTaskReadCache(existingTask?.project_id ?? null)
}

// ─── Risks ────────────────────────────────────────────────────────────────────
export async function getRisks(projectId?: string): Promise<Risk[]> {
  if (shouldUseDirectSqlPath() || isDatabaseTransactionActive()) {
    const rows = projectId
      ? await executeSQL<RiskRow>('SELECT * FROM risks WHERE project_id = ? ORDER BY created_at DESC', [projectId])
      : await executeSQL<RiskRow>('SELECT * FROM risks ORDER BY created_at DESC')
    return rows.map((risk) => ({ ...risk, risk_category: risk.risk_category ?? risk.category })) as Risk[]
  }

  let query = supabase.from('risks').select('*').order('created_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  // 将数据库 category 字段映射到前端期望的 risk_category
  const rows = (data ?? []) as RiskRow[]
  return rows.map((risk) => ({ ...risk, risk_category: risk.risk_category ?? risk.category })) as Risk[]
}

export async function listTaskProgressSnapshotsByTaskIds(
  taskIds: string[],
  batchSize = TASK_PROGRESS_SNAPSHOT_BATCH_SIZE,
): Promise<TaskProgressSnapshot[]> {
  const normalizedTaskIds = [...new Set(
    taskIds
      .map((taskId) => String(taskId ?? '').trim())
      .filter((taskId) => taskId.length > 0),
  )]

  if (normalizedTaskIds.length === 0) {
    return []
  }

  const snapshots: TaskProgressSnapshot[] = []

  for (let index = 0; index < normalizedTaskIds.length; index += batchSize) {
    const batch = normalizedTaskIds.slice(index, index + batchSize)
    const rows = await executeSQL<TaskProgressSnapshot>(
      `SELECT * FROM task_progress_snapshots WHERE task_id IN (${batch.map(() => '?').join(', ')})`,
      batch,
    )
    snapshots.push(...rows)
  }

  return snapshots
}

export async function getRisk(id: string): Promise<Risk | null> {
  return executeSQLOne<Risk>('SELECT * FROM risks WHERE id = ? LIMIT 1', [id])
}

export async function createRisk(
  risk: RiskWriteInput
): Promise<Risk> {
  return withDatabaseTransaction(() => createRiskInTransaction(risk))
}

async function createRiskInTransaction(
  risk: RiskWriteInput,
): Promise<Risk> {
  const id = uuidv4()
  const ts = now()
  const requestedStatus = String(risk.status ?? '')
  const sourceType = String(risk.source_type ?? 'manual')
  const status = normalizeRiskStatus(risk.status)

  if (requestedStatus === 'closed') {
    throw createBusinessError('INVALID_RISK_STATUS_TRANSITION', '风险创建时不能直接进入 closed 状态')
  }

  if (sourceType === 'warning_converted' || sourceType === 'warning_auto_escalated') {
    const sourceWarningId = String(
      risk.source_entity_type === 'warning'
        ? risk.source_entity_id ?? risk.source_id ?? ''
        : risk.source_id ?? '',
    ).trim()
    if (!sourceWarningId) {
      throw createBusinessError('RISK_WARNING_SOURCE_REQUIRED', '预警升级风险必须绑定来源预警')
    }
    const riskId = await runRpc<string | null>('confirm_warning_as_risk_atomic', {
      p_warning_id: sourceWarningId,
      p_source_type: sourceType,
    })
    if (!riskId) {
      throw new Error('confirm_warning_as_risk_atomic returned empty risk id')
    }
    const created = await getRisk(riskId)
    if (!created || created.project_id !== risk.project_id) {
      throw createBusinessError('PROJECT_SCOPE_MISMATCH', '预警升级风险不属于请求项目', 403)
    }
    await recordRiskIssueExecutionFacts({
      entityType: 'risk',
      entityId: riskId,
      projectId: created.project_id,
      previous: null,
      next: created as unknown as Record<string, unknown>,
      sourceMutationId: `risk:${riskId}:warning:${sourceWarningId}`,
      observedAt: String(created.updated_at ?? created.created_at ?? ts),
      actorUserId: risk.created_by ?? null,
      forceInitialStatus: true,
    })
    await enqueueProjectHealthRefreshAfterCommit(created.project_id, 'risk_created')
    return created
  }

  const row = {
    id,
    project_id: risk.project_id,
    task_id: risk.task_id ?? null,
    title: risk.title,
    description: risk.description ?? null,
    level: risk.level ?? 'medium',
    status,
    // 使用数据库 risk_category 列
    risk_category: risk.risk_category ?? risk.category ?? 'other',
    risk_type: risk.risk_type ?? null,
    impact_description: risk.impact_description ?? null,
    // mitigation_plan 已废弃删除，不再写入
    owner_id: risk.owner_id ?? null,
    owner_name: risk.owner_name ?? null,
    due_date: risk.due_date ?? null,
    resolved_at: risk.resolved_at ?? null,
    created_by: risk.created_by ?? null,
    // 来源追踪字段（§1.2）
    source_type: sourceType,
    source_id: risk.source_id ?? null,
    source_entity_type: risk.source_entity_type ?? null,
    source_entity_id: risk.source_entity_id ?? null,
    chain_id: risk.chain_id ?? buildIndependentChainId(sourceType),
    pending_manual_close: risk.pending_manual_close ?? false,
    linked_issue_id: risk.linked_issue_id ?? null,
    closed_reason: risk.closed_reason ?? null,
    closed_at: status === 'closed' ? (risk.closed_at ?? ts) : null,
    closure_result_code: null,
    closure_result_summary: null,
    closure_effectiveness: null,
    closure_evidence_refs: [],
    closure_cause_attribution_id: null,
    closed_by: null,
    closure_recorded_at: null,
    version: risk.version ?? 1,
    created_at: ts,
    updated_at: ts,
  }
  await executeSQL(
    `INSERT INTO risks (
       id, project_id, task_id, title, description, level, status,
       risk_category, risk_type, impact_description, owner_id, owner_name,
       due_date, resolved_at, created_by, source_type, source_id,
       source_entity_type, source_entity_id, chain_id, pending_manual_close,
       linked_issue_id, closed_reason, closed_at,
       closure_result_code, closure_result_summary, closure_effectiveness,
       closure_evidence_refs, closure_cause_attribution_id, closed_by,
       closure_recorded_at, version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.project_id,
      row.task_id,
      row.title,
      row.description,
      row.level,
      row.status,
      row.risk_category,
      row.risk_type,
      row.impact_description,
      row.owner_id,
      row.owner_name,
      row.due_date,
      row.resolved_at,
      row.created_by,
      row.source_type,
      row.source_id,
      row.source_entity_type,
      row.source_entity_id,
      row.chain_id,
      row.pending_manual_close,
      row.linked_issue_id,
      row.closed_reason,
      row.closed_at,
      row.closure_result_code,
      row.closure_result_summary,
      row.closure_effectiveness,
      row.closure_evidence_refs,
      row.closure_cause_attribution_id,
      row.closed_by,
      row.closure_recorded_at,
      row.version,
      row.created_at,
      row.updated_at,
    ],
  )
  const created = (await getRisk(id))!
  await recordRiskIssueExecutionFacts({
    entityType: 'risk',
    entityId: id,
    projectId: created.project_id,
    previous: null,
    next: created as unknown as Record<string, unknown>,
    sourceMutationId: `risk:${id}:version:${Number(created.version ?? 1)}`,
    observedAt: ts,
    actorUserId: risk.created_by ?? null,
    forceInitialStatus: true,
  })
  await enqueueProjectHealthRefreshAfterCommit(created.project_id, 'risk_created')
  return created
}

export async function updateRisk(
  id: string,
  updates: RiskUpdateInput,
  expectedVersion?: number,
  changeSource: ChangeSource = 'manual_adjusted',
): Promise<Risk | null> {
  return withDatabaseTransaction(() => updateRiskInTransaction(id, updates, expectedVersion, changeSource))
}

async function updateRiskInTransaction(
  id: string,
  updates: RiskUpdateInput,
  expectedVersion?: number,
  changeSource: ChangeSource = 'manual_adjusted',
): Promise<Risk | null> {
  const oldRisk = await executeSQLOne<Risk>('SELECT * FROM risks WHERE id = ? FOR UPDATE', [id])
  if (!oldRisk) return null
  const { version: _v, id: _id, created_at: _ca, updated_at: _ua, risk_category, ...restFields } = updates
  const fields: Omit<RiskUpdateInput, 'id' | 'created_at' | 'updated_at' | 'version'> = {
    ...restFields,
    ...(risk_category !== undefined ? { risk_category } : {}),
  }
  const nextStatus = fields.status !== undefined ? normalizeRiskStatus(fields.status) : oldRisk.status

  if (
    oldRisk.pending_manual_close
    && changeSource !== 'manual_close_confirmation'
    && changeSource !== 'manual_keep_processing'
    && changeSource !== 'retention_close'
  ) {
    const pendingFlagChanged = fields.pending_manual_close !== undefined && Boolean(fields.pending_manual_close) !== Boolean(oldRisk.pending_manual_close)
    const statusChanged = fields.status !== undefined && nextStatus !== oldRisk.status
    if (pendingFlagChanged || statusChanged) {
      throw createBusinessError(
        'PENDING_MANUAL_CLOSE_ACTION_REQUIRED',
        '待确认关闭的风险必须通过专用动作完成确认关闭或保持处理中',
      )
    }
  }

  validateRiskStatusTransition(oldRisk.status, nextStatus, changeSource)
  assertStructuredClosureOutcome(oldRisk.status, nextStatus, fields)
  
  if (fields.status !== undefined) {
    fields.status = nextStatus
    if (nextStatus === 'closed' && !fields.closed_at) {
      fields.closed_at = now()
    }
    if (nextStatus !== 'closed') {
      if (fields.closed_at === undefined) fields.closed_at = null
      if (fields.closed_reason === undefined) fields.closed_reason = null
      clearStructuredClosureOutcome(fields)
    }
  }
  
  const updatePayload = {
    ...fields,
    updated_at: now(),
    version: expectedVersion !== undefined ? expectedVersion + 1 : Number(oldRisk.version ?? 1) + 1,
  }
  const mutableColumns = new Set([
    'task_id', 'title', 'description', 'level', 'status', 'risk_category',
    'risk_type', 'impact_description', 'owner_id', 'owner_name', 'due_date',
    'resolved_at', 'source_type', 'source_id', 'source_entity_type',
    'source_entity_id', 'chain_id', 'pending_manual_close', 'linked_issue_id',
    'closed_reason', 'closed_at', 'closure_result_code', 'closure_result_summary',
    'closure_effectiveness', 'closure_evidence_refs', 'closure_cause_attribution_id',
    'closed_by', 'closure_recorded_at', 'updated_at', 'version',
  ])
  const entries = Object.entries(updatePayload).filter(([column, value]) => (
    value !== undefined && mutableColumns.has(column)
  ))
  const where = ['id = ?', 'project_id = ?']
  const values = entries.map(([, value]) => value)
  values.push(id, oldRisk.project_id)
  if (expectedVersion !== undefined) {
    where.push('version = ?')
    values.push(expectedVersion)
  }
  const rows = await executeSQL<{ id: string }>(
    `UPDATE risks SET ${entries.map(([column]) => `${column} = ?`).join(', ')} WHERE ${where.join(' AND ')} RETURNING id`,
    values,
  )
  if (rows.length === 0) {
    if (expectedVersion !== undefined) {
      throw createBusinessError('VERSION_MISMATCH', '该风险已被他人修改，请刷新后重试', 409)
    }
    throw createBusinessError('RISK_UPDATE_FAILED', '风险更新未写入任何记录', 500)
  }
  const updated = await getRisk(id)
  if (updated) {
    if (oldRisk.status !== updated.status) {
      await writeChangeLog({
        project_id: oldRisk.project_id ?? null,
        entity_type: 'risk',
        entity_id: id,
        field_name: 'status',
        old_value: oldRisk.status ?? null,
        new_value: updated.status ?? null,
        change_source: changeSource,
      })
    }
    if (Boolean(oldRisk.pending_manual_close) !== Boolean(updated.pending_manual_close)) {
      await writeChangeLog({
        project_id: oldRisk.project_id ?? null,
        entity_type: 'risk',
        entity_id: id,
        field_name: 'pending_manual_close',
        old_value: Boolean(oldRisk.pending_manual_close),
        new_value: Boolean(updated.pending_manual_close),
        change_source: changeSource,
      })
    }
  }
  if (updated) {
    await recordRiskIssueExecutionFacts({
      entityType: 'risk',
      entityId: id,
      projectId: updated.project_id,
      previous: oldRisk as unknown as Record<string, unknown>,
      next: updated as unknown as Record<string, unknown>,
      sourceMutationId: `risk:${id}:version:${Number(updated.version ?? updatePayload.version)}`,
      observedAt: String(updated.updated_at ?? updatePayload.updated_at),
      actorUserId: String(updated.closed_by ?? '').trim() || null,
    })
  }
  await enqueueProjectHealthRefreshAfterCommit(updated?.project_id ?? oldRisk.project_id, 'risk_updated')
  return updated
}

export async function deleteRisk(id: string): Promise<void> {
  const existing = await getRisk(id)
  if (!existing) return
  const sourceType = String(existing.source_type ?? '') as Risk['source_type']
  if (existing.linked_issue_id || PROTECTED_RISK_SOURCE_TYPES.has(sourceType)) {
    throw createBusinessError('UPGRADE_CHAIN_PROTECTED', '该风险已关联升级链，请改为关闭操作')
  }

  if (shouldUseDirectSqlPath()) {
    await rawQuery('SELECT public.delete_risk_with_source_backfill_atomic($1) AS deleted', [id])
  } else {
    await runRpc<boolean>('delete_risk_with_source_backfill_atomic', {
      p_risk_id: id,
    })
  }
  enqueueProjectHealthRefresh(existing.project_id, 'risk_deleted')
}

export async function confirmRiskPendingManualClose(
  id: string,
  outcome: RiskIssueClosureOutcomeInput,
  actorId: string,
  expectedVersion?: number,
): Promise<Risk | null> {
  const risk = await getRisk(id)
  if (!risk) return null
  if (!risk.pending_manual_close) {
    throw createBusinessError('RISK_PENDING_MANUAL_CLOSE_REQUIRED', '当前风险不处于待确认关闭状态')
  }
  return await updateRisk(id, buildRiskConfirmClosePatch(outcome, actorId), expectedVersion, 'manual_close_confirmation')
}

export async function closeRiskByRetention(
  id: string,
  projectId: string,
  context: RetentionClosureContext = {},
  expectedVersion?: number,
): Promise<Risk | null> {
  const risk = await getRisk(id)
  if (!risk) return null
  if (risk.project_id !== projectId) {
    throw createBusinessError('PROJECT_SCOPE_MISMATCH', '风险不属于当前留存治理项目', 403)
  }
  if (risk.status === 'closed') return risk
  return await updateRisk(
    id,
    buildRiskRetentionClosePatch(context),
    expectedVersion,
    'retention_close',
  )
}

export async function keepRiskProcessing(id: string, expectedVersion?: number): Promise<Risk | null> {
  const risk = await getRisk(id)
  if (!risk) return null
  if (!risk.pending_manual_close) {
    throw createBusinessError('RISK_PENDING_MANUAL_CLOSE_REQUIRED', '当前风险不处于待确认关闭状态')
  }
  return await updateRisk(id, buildRiskKeepProcessingPatch(), expectedVersion, 'manual_keep_processing')
}

// ─── Milestones（从 tasks 表查 is_milestone=true）────────────────────────────
export async function getMilestones(projectId?: string): Promise<Milestone[]> {
  let query = supabase
    .from('tasks')
    .select('*')
    .eq('is_milestone', true)
    .order('milestone_order', { ascending: true })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Milestone[]
}

export async function getMilestone(id: string): Promise<Milestone | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('is_milestone', true)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as Milestone
}

export async function createMilestone(
  milestone: Omit<Milestone, 'id' | 'created_at' | 'updated_at'>
): Promise<Milestone> {
  const task = await createTask(buildTaskInputFromMilestone(milestone))
  return task as unknown as Milestone
}

export async function updateMilestone(
  id: string,
  updates: Partial<Milestone>,
  expectedVersion?: number
): Promise<Milestone | null> {
  const task = await updateTask(id, buildTaskUpdateFromMilestone(updates), expectedVersion)
  return task as unknown as Milestone | null
}

export async function deleteMilestone(id: string): Promise<void> {
  return deleteTask(id)
}

// ─── Project Members ──────────────────────────────────────────────────────────
export async function getMembers(projectId?: string): Promise<ProjectMember[]> {
  let query = supabase.from('project_members').select('*').order('joined_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as MemberRow[]
  return rows.flatMap((record) => {
    if (record.is_active === false) return []
    const normalizedRole = normalizeProjectPermissionLevel(record.permission_level)
    if (!normalizedRole) return []
    return {
      ...record,
      permission_level: normalizedRole,
    } as ProjectMember
  })
}

export async function createMember(
  member: MemberWriteInput
): Promise<ProjectMember> {
  const id = uuidv4()
  const ts = now()
  const normalizedRole = normalizeProjectPermissionLevel(member.permission_level)
  if (!normalizedRole) throw new Error('Invalid project member role')
  const row = {
    id,
    project_id: member.project_id,
    user_id: member.user_id,
    permission_level: normalizedRole,
    joined_at: ts,
    created_at: ts,
    is_active: member.is_active ?? true,
    last_activity: member.last_activity ?? ts,
  }
  const { error } = await supabase.from('project_members').insert(row)
  if (error) throw new Error(error.message)
  const { data } = await supabase.from('project_members').select('*').eq('id', id).single()
  return data as ProjectMember
}

export async function updateMember(
  id: string,
  updates: MemberUpdateInput
): Promise<ProjectMember | null> {
  const { data: existing } = await supabase.from('project_members').select('project_id').eq('id', id).single()
  const projectId = (existing as { project_id?: string | null } | null)?.project_id
  if (!projectId) return null
  const { id: _id, joined_at: _ja, created_at: _ca, ...fields } = updates
  const nextRole = fields.permission_level
  if (nextRole !== undefined) {
    const normalizedRole = normalizeProjectPermissionLevel(nextRole)
    if (!normalizedRole) throw new Error('Invalid project member role')
    fields.permission_level = normalizedRole
  }
  const { error } = await supabase.from('project_members').update(fields).eq('id', id).eq('project_id', projectId)
  if (error) throw new Error(error.message)
  const { data } = await supabase.from('project_members').select('*').eq('id', id).eq('project_id', projectId).single()
  return (data ?? null) as ProjectMember | null
}

export async function deleteMember(id: string): Promise<void> {
  const { data: existing } = await supabase.from('project_members').select('project_id').eq('id', id).single()
  const projectId = (existing as { project_id?: string | null } | null)?.project_id
  if (!projectId) return
  const { error } = await supabase.from('project_members').delete().eq('id', id).eq('project_id', projectId)
  if (error) throw new Error(error.message)
}

// ─── Invitations ──────────────────────────────────────────────────────────────
export async function getInvitations(projectId?: string): Promise<Invitation[]> {
  let query = supabase.from('project_invitations').select('*').order('created_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as InvitationRow[]).flatMap((row) => {
    if (normalizeProjectPermissionLevel(row.permission_level) !== 'editor') return []
    return [{ ...row, permission_level: 'editor' as const }]
  }) as Invitation[]
}

// ─── 通用 SQL 执行（供其他路由使用）────────────────────────────────────────────
export { executeSQL, executeSQLOne }

// ─── Supabase 客户端（供路由直接使用）────────────────────────────────────────
export { supabase }

// ─── 历史同名导出：保留 SupabaseService 供现有调用点使用 ───────────────────
export class SupabaseService {
  async getProjects() { return getProjects() }
  async getProject(id: string) { return getProject(id) }
  async createProject(p: any) { return createProject(p) }
  async updateProject(id: string, u: any, v: number) { return updateProject(id, u, v) }
  async deleteProject(id: string, audit: ProjectDeleteAuditContext) { return deleteProject(id, audit) }

  async getTasks(projectId?: string, options?: GetTasksOptions) { return getTasks(projectId, options) }
  async getTask(id: string) { return getTask(id) }
  async createTask(t: any) { return createTask(t) }
  async updateTask(id: string, u: any, v: number) { return updateTask(id, u, v) }
  async reopenTask(id: string, u: any, v: number) { return reopenTask(id, u, v) }
  async deleteTask(id: string) { return deleteTask(id) }

  async getRisks(projectId?: string) { return getRisks(projectId) }
  async getRisk(id: string) { return getRisk(id) }
  async createRisk(r: any) { return createRisk(r) }
  async updateRisk(id: string, u: any, v: number) { return updateRisk(id, u, v) }
  async deleteRisk(id: string) { return deleteRisk(id) }

  async getMilestones(projectId?: string) { return getMilestones(projectId) }
  async getMilestone(id: string) { return getMilestone(id) }
  async createMilestone(m: any) { return createMilestone(m) }
  async updateMilestone(id: string, u: any, v: number) { return updateMilestone(id, u, v) }
  async deleteMilestone(id: string) { return deleteMilestone(id) }

  async getMembers(projectId?: string) { return getMembers(projectId) }
  async createMember(m: any) { return createMember(m) }
  async updateMember(id: string, u: any) { return updateMember(id, u) }
  async deleteMember(id: string) { return deleteMember(id) }

  async getInvitations(projectId?: string) { return getInvitations(projectId) }

  // ─── 通用 CRUD 方法（crudRouterFactory 使用）────────────────────────
  // 6.3 修复：将反引号（MySQL 方言）SQL 改为 Supabase JS SDK 直接调用，消除 PostgreSQL 语法错误风险。
  async query<T = any>(table: string, conditions: Record<string, unknown> = {}): Promise<T[]> {
    let q = supabase.from(table).select('*') as unknown as SqlSelectQuery
    for (const [k, v] of Object.entries(conditions)) {
      q = q.eq(k, v)
    }
    const { data, error } = await q
    if (error) throw new Error(`[SupabaseService.query] ${error.message}`)
    return (data ?? []) as T[]
  }

  async create<T = any>(table: string, data: Record<string, unknown>): Promise<T> {
    const { error } = await supabase.from(table).insert(data)
    if (error) throw new Error(`[SupabaseService.create] ${error.message}`)
    const inserted = await this.query<T>(table, { id: data.id })
    return inserted[0]
  }

  async update<T = any>(table: string, id: string, data: Record<string, unknown>, _version?: number): Promise<T> {
    const current = await this.query<Record<string, unknown>>(table, { id })
    const projectId = current[0]?.project_id
    const { id: _id, created_at: _ca, ...fields } = data
    let updateQuery = supabase.from(table).update(fields).eq('id', id)
    if (projectId) {
      updateQuery = updateQuery.eq('project_id', projectId)
    }
    const { error } = await updateQuery
    if (error) throw new Error(`[SupabaseService.update] ${error.message}`)
    const updated = await this.query<T>(table, projectId ? { id, project_id: projectId } : { id })
    return updated[0]
  }

  async delete(table: string, id: string): Promise<void> {
    const current = await this.query<Record<string, unknown>>(table, { id })
    const projectId = current[0]?.project_id
    let deleteQuery = supabase.from(table).delete().eq('id', id)
    if (projectId) {
      deleteQuery = deleteQuery.eq('project_id', projectId)
    }
    const { error } = await deleteQuery
    if (error) throw new Error(`[SupabaseService.delete] ${error.message}`)
  }
}

// ─── Issues CRUD ──────────────────────────────────────────────────────────────

export async function getIssues(projectId?: string): Promise<Issue[]> {
  let issues: Issue[]
  if (shouldUseDirectSqlPath() || isDatabaseTransactionActive()) {
    issues = projectId
      ? await executeSQL<Issue>('SELECT * FROM issues WHERE project_id = ? ORDER BY created_at DESC', [projectId])
      : await executeSQL<Issue>('SELECT * FROM issues ORDER BY created_at DESC')
  } else {
    let query = supabase.from('issues').select('*').order('created_at', { ascending: false })
    if (projectId) query = query.eq('project_id', projectId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    issues = (data ?? []) as Issue[]
  }
  const lockedIds = await listPriorityLockedIssueIds(issues.map((issue) => issue.id))
  return issues.map((issue) => applyDynamicPriority(issue, lockedIds.has(issue.id)))
}

export async function getIssue(id: string): Promise<Issue | null> {
  let issue: Issue | null
  if (shouldUseDirectSqlPath() || isDatabaseTransactionActive()) {
    issue = await executeSQLOne<Issue>('SELECT * FROM issues WHERE id = ? LIMIT 1', [id])
  } else {
    const { data, error } = await supabase.from('issues').select('*').eq('id', id).single()
    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }
    issue = data as Issue
  }
  if (!issue) return null
  const lockedIds = await listPriorityLockedIssueIds([issue.id])
  return applyDynamicPriority(issue, lockedIds.has(issue.id))
}

export async function createIssue(
  issue: IssueWriteInput
): Promise<Issue> {
  return withDatabaseTransaction(() => createIssueInTransaction(issue))
}

async function createIssueInTransaction(
  issue: IssueWriteInput,
): Promise<Issue> {
  const id = uuidv4()
  const ts = now()
  const requestedStatus = String(issue.status ?? '')
  const sourceType = String(issue.source_type ?? 'manual')
  const status = normalizeIssueStatus(issue.status)
  const sourceRiskId =
    typeof issue.source_entity_id === 'string' && issue.source_entity_type === 'risk'
      ? issue.source_entity_id
      : issue.source_id

  if (requestedStatus === 'closed') {
    throw createBusinessError('INVALID_ISSUE_STATUS_TRANSITION', '问题创建时不能直接进入 closed 状态')
  }

  if (
    (sourceType === 'risk_converted' || sourceType === 'risk_auto_escalated')
    && typeof sourceRiskId === 'string'
    && sourceRiskId
  ) {
    const previousRisk = await executeSQLOne<Risk>(
      'SELECT * FROM risks WHERE id = ? FOR UPDATE',
      [sourceRiskId],
    )
    const previousIssue = previousRisk?.linked_issue_id
      ? await executeSQLOne<Issue>('SELECT * FROM issues WHERE id = ? FOR UPDATE', [previousRisk.linked_issue_id])
      : await executeSQLOne<Issue>(
        `SELECT * FROM issues
          WHERE source_entity_type = 'risk'
            AND (source_id = ? OR source_entity_id = ?)
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [sourceRiskId, sourceRiskId],
      )
    const issueId = await runRpc<string | null>('create_issue_from_risk_atomic', {
      p_risk_id: sourceRiskId,
      p_issue_source_type: sourceType,
      p_title: issue.title ?? null,
      p_description: issue.description ?? null,
      p_severity: issue.severity ?? null,
      p_priority: issue.priority ?? null,
    })
    if (!issueId) {
      throw new Error('create_issue_from_risk_atomic returned empty issue id')
    }
    const created = (await getIssue(issueId))!
    const updatedRisk = previousRisk ? await getRisk(previousRisk.id) : null
    await recordRiskIssueExecutionFacts({
      entityType: 'issue',
      entityId: issueId,
      projectId: created.project_id,
      previous: previousIssue as unknown as Record<string, unknown> | null,
      next: created as unknown as Record<string, unknown>,
      sourceMutationId: `issue:${issueId}:version:${Number(created.version ?? 1)}`,
      observedAt: String(created.updated_at ?? created.created_at ?? ts),
      forceInitialStatus: !previousIssue,
    })
    if (previousRisk && updatedRisk) {
      await recordRiskIssueExecutionFacts({
        entityType: 'risk',
        entityId: previousRisk.id,
        projectId: updatedRisk.project_id,
        previous: previousRisk as unknown as Record<string, unknown>,
        next: updatedRisk as unknown as Record<string, unknown>,
        sourceMutationId: `risk:${previousRisk.id}:conversion:${issueId}`,
        observedAt: String(updatedRisk.updated_at ?? ts),
      })
    }
    await enqueueProjectHealthRefreshAfterCommit(created.project_id, 'issue_created')
    return created
  }

  const basePriority = computeDynamicIssuePriority({
    source_type: sourceType as Issue['source_type'],
    severity: (issue.severity ?? 'medium') as Issue['severity'],
    created_at: ts,
    status,
    priority: getIssueBasePriority(
      sourceType as Issue['source_type'],
      (issue.severity ?? 'medium') as Issue['severity'],
    ),
  })
  const requestedPriority = typeof issue.priority === 'number' ? issue.priority : undefined
  const effectivePriority = requestedPriority ?? basePriority

  const row = {
    id,
    project_id: issue.project_id,
    task_id: issue.task_id ?? null,
    title: issue.title,
    description: issue.description ?? null,
    source_type: sourceType,
    source_id: issue.source_id ?? null,
    source_entity_type: issue.source_entity_type ?? null,
    source_entity_id: issue.source_entity_id ?? null,
    chain_id: issue.chain_id ?? buildIndependentChainId(sourceType),
    severity: issue.severity ?? 'medium',
    priority: effectivePriority,
    pending_manual_close: issue.pending_manual_close ?? false,
    status,
    closed_reason: issue.closed_reason ?? null,
    closed_at: status === 'closed' ? (issue.closed_at ?? ts) : null,
    closure_result_code: null,
    closure_result_summary: null,
    closure_effectiveness: null,
    closure_evidence_refs: [],
    closure_cause_attribution_id: null,
    closed_by: null,
    closure_recorded_at: null,
    version: issue.version ?? 1,
    created_at: ts,
    updated_at: ts,
  }
  await executeSQL(
    `INSERT INTO issues (
       id, project_id, task_id, title, description, source_type, source_id,
       source_entity_type, source_entity_id, chain_id, severity, priority,
       pending_manual_close, status, closed_reason, closed_at,
       closure_result_code, closure_result_summary, closure_effectiveness,
       closure_evidence_refs, closure_cause_attribution_id, closed_by,
       closure_recorded_at, version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, row.project_id, row.task_id, row.title, row.description,
      row.source_type, row.source_id, row.source_entity_type, row.source_entity_id,
      row.chain_id, row.severity, row.priority, row.pending_manual_close, row.status,
      row.closed_reason, row.closed_at, row.closure_result_code, row.closure_result_summary,
      row.closure_effectiveness, row.closure_evidence_refs, row.closure_cause_attribution_id,
      row.closed_by, row.closure_recorded_at, row.version, row.created_at, row.updated_at,
    ],
  )
  if (requestedPriority !== undefined && requestedPriority !== basePriority) {
    await writeChangeLog({
      project_id: row.project_id,
      entity_type: 'issue',
      entity_id: id,
      field_name: 'priority',
      old_value: null,
      new_value: requestedPriority,
      change_source: 'manual_adjusted',
    })
  }
  const created = (await getIssue(id))!
  await recordRiskIssueExecutionFacts({
    entityType: 'issue',
    entityId: id,
    projectId: created.project_id,
    previous: null,
    next: created as unknown as Record<string, unknown>,
    sourceMutationId: `issue:${id}:version:${Number(created.version ?? 1)}`,
    observedAt: ts,
    actorUserId: String((issue as Record<string, unknown>).created_by ?? '').trim() || null,
    forceInitialStatus: true,
  })
  await enqueueProjectHealthRefreshAfterCommit(created.project_id, 'issue_created')
  return created
}

export async function updateIssue(
  id: string,
  updates: IssueUpdateInput,
  expectedVersion?: number,
  changeSource: ChangeSource = 'manual_adjusted',
): Promise<Issue | null> {
  return withDatabaseTransaction(() => updateIssueInTransaction(id, updates, expectedVersion, changeSource))
}

async function updateIssueInTransaction(
  id: string,
  updates: IssueUpdateInput,
  expectedVersion?: number,
  changeSource: ChangeSource = 'manual_adjusted',
): Promise<Issue | null> {
  const oldIssue = await executeSQLOne<Issue>('SELECT * FROM issues WHERE id = ? FOR UPDATE', [id])
  if (!oldIssue) return null
  const { id: _id, created_at: _ca, ...fields } = updates
  const nextStatus = fields.status !== undefined ? normalizeIssueStatus(fields.status) : oldIssue.status

  if (oldIssue.pending_manual_close && !isIssuePendingManualCloseAction(changeSource)) {
    const pendingFlagChanged = fields.pending_manual_close !== undefined && Boolean(fields.pending_manual_close) !== Boolean(oldIssue.pending_manual_close)
    const statusChanged = fields.status !== undefined && nextStatus !== oldIssue.status
    if (pendingFlagChanged || statusChanged) {
      throw createBusinessError(
        'PENDING_MANUAL_CLOSE_ACTION_REQUIRED',
        '待确认关闭的问题必须通过专用动作完成确认关闭或保持处理中',
      )
    }
  }

  validateIssueStatusTransition(oldIssue.status, nextStatus, changeSource, updates)
  assertStructuredClosureOutcome(oldIssue.status, nextStatus, fields)

  if (fields.status !== undefined) {
    fields.status = nextStatus
    if (nextStatus === 'closed' && !fields.closed_at) {
      fields.closed_at = now()
    }
    if (nextStatus !== 'closed') {
      if (fields.closed_at === undefined) fields.closed_at = null
      if (fields.closed_reason === undefined) fields.closed_reason = null
      clearStructuredClosureOutcome(fields)
    }
  }

  const updatePayload = {
    ...fields,
    updated_at: now(),
    version: expectedVersion !== undefined ? expectedVersion + 1 : oldIssue.version + 1,
  }

  if (shouldUseDirectSqlPath() || isDatabaseTransactionActive()) {
    const mutableColumns = new Set([
      'task_id', 'title', 'description', 'source_type', 'source_id',
      'source_entity_type', 'source_entity_id', 'chain_id', 'severity',
      'priority', 'pending_manual_close', 'status', 'closed_reason',
      'closed_at', 'closure_result_code', 'closure_result_summary', 'closure_effectiveness',
      'closure_evidence_refs', 'closure_cause_attribution_id', 'closed_by',
      'closure_recorded_at', 'updated_at', 'version',
    ])
    const entries = Object.entries(updatePayload).filter(([column, value]) => (
      value !== undefined && mutableColumns.has(column)
    ))
    const where = ['id = ?', 'project_id = ?']
    const values = entries.map(([, value]) => value)
    values.push(id, oldIssue.project_id)
    if (expectedVersion !== undefined) {
      where.push('version = ?')
      values.push(expectedVersion)
    }
    const rows = await executeSQL<{ id: string }>(
      `UPDATE issues SET ${entries.map(([column]) => `${column} = ?`).join(', ')} WHERE ${where.join(' AND ')} RETURNING id`,
      values,
    )
    if (expectedVersion !== undefined && rows.length === 0) {
      throw createBusinessError('VERSION_MISMATCH', '该问题已被他人修改，请刷新后重试', 409)
    }
  } else if (expectedVersion !== undefined) {
    const { data, error } = await supabase
      .from('issues')
      .update(updatePayload)
      .eq('id', id)
      .eq('project_id', oldIssue.project_id)
      .eq('version', expectedVersion)
      .select('id')

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw createBusinessError('VERSION_MISMATCH', '该问题已被他人修改，请刷新后重试', 409)
    }
  } else {
    const { error } = await supabase
      .from('issues')
      .update(updatePayload)
      .eq('id', id)
      .eq('project_id', oldIssue.project_id)

    if (error) throw new Error(error.message)
  }
  const updated = await getIssue(id)
  if (updated) {
    if (oldIssue.status !== updated.status) {
      await writeChangeLog({
        project_id: oldIssue.project_id ?? null,
        entity_type: 'issue',
        entity_id: id,
        field_name: 'status',
        old_value: oldIssue.status ?? null,
        new_value: updated.status ?? null,
        change_source: changeSource,
      })
    }
    if (Boolean(oldIssue.pending_manual_close) !== Boolean(updated.pending_manual_close)) {
      await writeChangeLog({
        project_id: oldIssue.project_id ?? null,
        entity_type: 'issue',
        entity_id: id,
        field_name: 'pending_manual_close',
        old_value: Boolean(oldIssue.pending_manual_close),
        new_value: Boolean(updated.pending_manual_close),
        change_source: changeSource,
      })
    }
    if (fields.priority !== undefined && Number(oldIssue.priority) !== Number(updated.priority)) {
      await writeChangeLog({
        project_id: oldIssue.project_id ?? null,
        entity_type: 'issue',
        entity_id: id,
        field_name: 'priority',
        old_value: Number(oldIssue.priority),
        new_value: Number(updated.priority),
        change_source: changeSource,
      })
    }
    await recordRiskIssueExecutionFacts({
      entityType: 'issue',
      entityId: id,
      projectId: updated.project_id,
      previous: oldIssue as unknown as Record<string, unknown>,
      next: updated as unknown as Record<string, unknown>,
      sourceMutationId: `issue:${id}:version:${Number(updated.version ?? updatePayload.version)}`,
      observedAt: String(updated.updated_at ?? updatePayload.updated_at),
      actorUserId: String(updated.closed_by ?? '').trim() || null,
    })
  }
  await enqueueProjectHealthRefreshAfterCommit(updated?.project_id ?? oldIssue.project_id, 'issue_updated')
  return updated
}

export async function deleteIssue(id: string): Promise<void> {
  const existing = await getIssue(id)
  if (!existing) return
  if (isProtectedIssueRecord(existing)) {
    throw createBusinessError('UPGRADE_CHAIN_PROTECTED', '该问题已关联升级链，请改为关闭操作')
  }

  if (shouldUseDirectSqlPath() || isDatabaseTransactionActive()) {
    await executeSQL('DELETE FROM issues WHERE id = ? AND project_id = ?', [id, existing.project_id])
  } else {
    const { error } = await supabase
      .from('issues')
      .delete()
      .eq('id', id)
      .eq('project_id', existing.project_id)
    if (error) throw new Error(error.message)
  }
  enqueueProjectHealthRefresh(existing.project_id, 'issue_deleted')
}

export async function confirmIssuePendingManualClose(
  id: string,
  outcome: RiskIssueClosureOutcomeInput,
  actorId: string,
  expectedVersion?: number,
): Promise<Issue | null> {
  const issue = await getIssue(id)
  if (!issue) return null
  if (!issue.pending_manual_close) {
    throw createBusinessError('ISSUE_PENDING_MANUAL_CLOSE_REQUIRED', '当前问题不处于待确认关闭状态')
  }
  return await updateIssue(id, buildIssueConfirmClosePatch(outcome, actorId), expectedVersion, 'manual_close_confirmation')
}

export async function closeIssueByRetention(
  id: string,
  projectId: string,
  context: RetentionClosureContext = {},
  expectedVersion?: number,
): Promise<Issue | null> {
  const issue = await getIssue(id)
  if (!issue) return null
  if (issue.project_id !== projectId) {
    throw createBusinessError('PROJECT_SCOPE_MISMATCH', '问题不属于当前留存治理项目', 403)
  }
  if (issue.status === 'closed') return issue
  return await updateIssue(
    id,
    buildIssueRetentionClosePatch(context),
    expectedVersion,
    'retention_close',
  )
}

export async function keepIssueProcessing(id: string, expectedVersion?: number): Promise<Issue | null> {
  const issue = await getIssue(id)
  if (!issue) return null
  if (!issue.pending_manual_close) {
    throw createBusinessError('ISSUE_PENDING_MANUAL_CLOSE_REQUIRED', '当前问题不处于待确认关闭状态')
  }
  return await updateIssue(id, buildIssueKeepProcessingPatch(), expectedVersion, 'manual_keep_processing')
}
