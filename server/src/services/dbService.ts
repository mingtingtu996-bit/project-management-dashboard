// 数据库服务层（Supabase PostgreSQL）
// 封装所有数据库操作，对外接口与原 dbService.ts 完全兼容
// 使用 @supabase/supabase-js SDK + Supabase REST API

import { createClient } from '@supabase/supabase-js'
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
import { query as rawQuery } from '../database.js'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import { isCompletedTask, isCompletedTaskStatus } from '../utils/taskStatus.js'
import type { WriteLifecycleLogParams, WriteLogParams } from './changeLogs.js'
import {
  PROTECTED_ISSUE_SOURCE_TYPES,
  PROTECTED_RISK_SOURCE_TYPES,
  buildIssueConfirmClosePatch,
  buildIssueKeepProcessingPatch,
  buildRiskConfirmClosePatch,
  buildRiskKeepProcessingPatch,
  computeDynamicIssuePriority,
  getIssueBasePriority,
  isProtectedIssueRecord,
} from './workflowDomainPolicy.js'

// ─── Supabase 初始化 ──────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''

if (!supabaseUrl || !supabaseKey) {
  console.warn('[dbService] WARNING: SUPABASE_URL or SUPABASE_KEY not set')
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ─── SQL 执行辅助（纯 Supabase SDK，无需 RPC）────────────────────────────────
// 解析标准 CRUD SQL 并转换为 Supabase JS SDK 调用。
// 支持：SELECT / INSERT / UPDATE / DELETE / COUNT(*)
// 不支持：JOIN（含 JOIN 的路由已在上方用 SDK 直接实现）

type SqlFilter =
  | { col: string; kind: 'eq'; value: any }
  | { col: string; kind: 'neq'; value: any }
  | { col: string; kind: 'in'; values: any[] }
  | { col: string; kind: 'is_null' }
  | { col: string; kind: 'is_not_null' }

type QueryErrorLike = {
  message?: string | null
}

type SelectQueryResult = {
  data: unknown[] | null
  error: QueryErrorLike | null
}

type MutationQueryResult = {
  error: QueryErrorLike | null
}

interface SqlSelectQuery extends PromiseLike<SelectQueryResult> {
  is(column: string, value: null): SqlSelectQuery
  not(column: string, operator: string, value: unknown): SqlSelectQuery
  in(column: string, values: unknown[]): SqlSelectQuery
  eq(column: string, value: unknown): SqlSelectQuery
  order(column: string, options?: { ascending?: boolean }): SqlSelectQuery
  range(from: number, to: number): SqlSelectQuery
  limit(count: number): SqlSelectQuery
}

interface SqlMutationQuery extends PromiseLike<MutationQueryResult> {
  is(column: string, value: null): SqlMutationQuery
  not(column: string, operator: string, value: unknown): SqlMutationQuery
  in(column: string, values: unknown[]): SqlMutationQuery
  eq(column: string, value: unknown): SqlMutationQuery
}

interface SnapshotTableLike {
  upsert?: (
    row: Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates: boolean },
  ) => Promise<MutationQueryResult>
  insert: (row: Record<string, unknown>) => Promise<MutationQueryResult>
}

const TASK_PROGRESS_SNAPSHOT_BATCH_SIZE = 200

type ProjectCleanupStep = {
  table: string
  column?: string
}

const PROJECT_DELETE_CLEANUP_STEPS: ProjectCleanupStep[] = [
  { table: 'task_conditions' },
  { table: 'task_obstacles' },
  // risks.task_id historically does not cascade, so tasks must be deleted after risks.
  { table: 'risks' },
  { table: 'issues' },
  { table: 'tasks' },
  // condition/obstacle delete triggers may emit timeline rows while the project still exists.
  { table: 'task_timeline_events' },
]

type ProjectCreateInput = Omit<Project, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  owner_id?: string | null
  created_by?: string | null
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
  planned_duration?: number | null
  standard_duration?: number | null
  ai_adjusted_duration?: number | null
  wbs_order?: number | null
}

type TaskUpdateInput = Partial<TaskWriteInput> & {
  id?: string
  created_at?: string
  updated_at?: string
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
  permission_level?: ProjectMember['permission_level']
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

type InvitationRow = Invitation & {
  invitation_code?: string | null
  invited_by?: string | null
  accepted_by?: string | null
  accepted_at?: string | null
}

type InvitationWriteInput = Omit<Invitation, 'created_at'> & {
  invitation_code?: string | null
  invited_by?: string | null
  accepted_by?: string | null
  accepted_at?: string | null
}

type InvitationUpdateInput = Partial<InvitationWriteInput> & {
  id?: string
  created_at?: string
}

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
      throw new Error(`[executeSQL WHERE] Unsupported numeric comparison: ${condition}`)
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

    const compareMatch = condition.match(/^(\w+)\s*(=|!=|<>)\s*(.+)$/i)
    if (compareMatch) {
      const resolved = resolveSqlLiteralToken(compareMatch[3], params, idx)
      if (!resolved) {
        throw new Error(`[executeSQL WHERE] Unsupported comparison token: ${condition}`)
      }
      idx += resolved.consumed
      filters.push({
        col: compareMatch[1],
        kind: compareMatch[2] === '=' ? 'eq' : 'neq',
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

async function deleteProjectScopedRows(projectId: string, step: ProjectCleanupStep): Promise<void> {
  const column = step.column ?? 'project_id'
  const query = supabase.from(step.table).delete() as unknown as SqlMutationQuery
  const { error } = await query.eq(column, projectId)
  if (!error) return

  if (isMissingSupabaseResourceError(error)) {
    logger.warn('Skipping project cleanup step because current schema is missing the target resource', {
      projectId,
      table: step.table,
      column,
      error: error.message ?? null,
    })
    return
  }

  throw new Error(`[deleteProject cleanup ${step.table}] ${error.message ?? 'unknown error'}`)
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
  const upper = s.toUpperCase()

  // ── SELECT ──────────────────────────────────────────────────────────────────
  if (upper.startsWith('SELECT')) {
    if (/\bJOIN\b/i.test(s)) {
      throw new Error(`[executeSQL SELECT] JOIN is not supported: ${s}`)
    }

    // 提取表名
    const fromMatch = s.match(/FROM\s+(\w+)/i)
    if (!fromMatch) throw new Error(`[executeSQL] Cannot parse table from: ${s}`)
    const table = fromMatch[1]

    // 判断是 COUNT(*) 查询
    const isCount = /SELECT\s+COUNT\s*\(\s*\*\s*\)\s+AS\s+(\w+)/i.test(s)

    let query = supabase.from(table).select('*') as unknown as SqlSelectQuery

    // 解析 WHERE 子句
    const whereMatch = s.match(/WHERE\s+(.+?)(?:\s+ORDER\s+|\s+LIMIT\s+|\s+GROUP\s+|$)/i)
    let paramIdx = 0

    if (whereMatch) {
      const whereStr = whereMatch[1]
      const { filters, consumed } = parseSqlWhere(whereStr, params, paramIdx)
      paramIdx += consumed
      for (const filter of filters) {
        if (filter.kind === 'is_null') {
          query = query.is(filter.col, null)
        } else if (filter.kind === 'is_not_null') {
          query = query.not(filter.col, 'is', null)
        } else if (filter.kind === 'in') {
          query = query.in(filter.col, filter.values)
        } else if (filter.kind === 'neq') {
          query = query.not(filter.col, 'eq', filter.value)
        } else {
          query = query.eq(filter.col, filter.value)
        }
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

    const { data, error } = await query
    if (error) throw new Error(`[executeSQL SELECT] ${error.message} | SQL: ${s}`)

    if (isCount) {
      // 把 SELECT COUNT(*) AS cnt 的结果包装成 [{cnt: N}]
      const aliasMatch = s.match(/COUNT\s*\(\s*\*\s*\)\s+AS\s+(\w+)/i)
      const alias = aliasMatch ? aliasMatch[1] : 'count'
      const count = Array.isArray(data) ? data.length : 0
      return [{ [alias]: count } as T]
    }

    return (data ?? []) as T[]
  }

  // ── INSERT ──────────────────────────────────────────────────────────────────
  if (upper.startsWith('INSERT')) {
    const tableMatch = s.match(/INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)
    if (!tableMatch) throw new Error(`[executeSQL] Cannot parse INSERT: ${s}`)
    const table = tableMatch[1]
    const cols = tableMatch[2].split(',').map(c => c.trim())
    const record: Record<string, any> = {}
    cols.forEach((col, i) => { record[col] = params[i] ?? null })
    const { error } = await supabase.from(table).insert(record)
    if (error) throw new Error(`[executeSQL INSERT] ${error.message} | SQL: ${s}`)
    return []
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  if (upper.startsWith('UPDATE')) {
    const tableMatch = s.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+?)(?:\s*$)/i)
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
    let query = supabase.from(table).update(updates) as unknown as SqlMutationQuery
    for (const filter of filters) {
      if (filter.kind === 'is_null') query = query.is(filter.col, null)
      else if (filter.kind === 'is_not_null') query = query.not(filter.col, 'is', null)
      else if (filter.kind === 'in') query = query.in(filter.col, filter.values)
      else if (filter.kind === 'neq') query = query.not(filter.col, 'eq', filter.value)
      else query = query.eq(filter.col, filter.value)
    }

    const { error } = await query
    if (error) throw new Error(`[executeSQL UPDATE] ${error.message} | SQL: ${s}`)
    return []
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
      for (const filter of filters) {
        if (filter.kind === 'is_null') query = query.is(filter.col, null)
        else if (filter.kind === 'is_not_null') query = query.not(filter.col, 'is', null)
        else if (filter.kind === 'in') query = query.in(filter.col, filter.values)
        else if (filter.kind === 'neq') query = query.not(filter.col, 'eq', filter.value)
        else query = query.eq(filter.col, filter.value)
      }
    }

    const { error } = await query
    if (error) throw new Error(`[executeSQL DELETE] ${error.message} | SQL: ${s}`)
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

type ChangeSource =
  | 'system_auto'
  | 'manual_adjusted'
  | 'manual_close_confirmation'
  | 'manual_keep_processing'
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

function normalizeDbChangeLogSource(source?: ChangeSource): DbChangeLogSource {
  if (source === 'manual_close_confirmation' || source === 'manual_keep_processing') {
    return 'manual_adjusted'
  }
  return source
}

async function runRpc<T = unknown>(fn: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, params)
  if (error) throw new Error(error.message)
  return data as T
}

function isMissingRelationError(error: unknown, relation: string) {
  const message = String((error as Error | undefined)?.message || '')
  const lowerMessage = message.toLowerCase()
  const lowerRelation = relation.toLowerCase()

  return lowerMessage.includes(lowerRelation) && (
    lowerMessage.includes('does not exist') ||
    lowerMessage.includes('不存在') ||
    lowerMessage.includes('schema cache') ||
    lowerMessage.includes('could not find the table') ||
    lowerMessage.includes('could not find the column')
  )
}

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

function validateRiskStatusTransition(
  currentStatus: Risk['status'] | null,
  nextStatus: Risk['status'],
  changeSource: ChangeSource,
) {
  if (!currentStatus || currentStatus === nextStatus) return

  if (changeSource === 'system_auto') {
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
  return changeSource === 'manual_close_confirmation' || changeSource === 'manual_keep_processing'
}

async function listPriorityLockedIssueIds(issueIds: string[]) {
  if (!issueIds.length) return new Set<string>()

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
    title: milestone.title ?? milestone.name,
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
  if (updates.name !== undefined || updates.title !== undefined) {
    taskUpdates.title = updates.title ?? updates.name ?? ''
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

function extractMissingColumnName(message: string | undefined, table: string): string | null {
  if (!message) return null

  const patterns = [
    new RegExp(`Could not find the '([^']+)' column of '${table}'`, 'i'),
    new RegExp(`column "([^"]+)" of relation "${table}" does not exist`, 'i'),
    /column "([^"]+)" does not exist/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

function toDateOnly(value?: string | null): string {
  return (value ?? now()).slice(0, 10)
}

function isStartState(status?: string | null): boolean {
  return ['todo', 'pending', '未开始'].includes(String(status ?? '').trim())
}

function isInProgressState(status?: string | null): boolean {
  return ['in_progress', '进行中'].includes(String(status ?? '').trim())
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
  entity_type: 'task' | 'risk' | 'issue' | 'delay_request'
  entity_id: string
  field_name: string
  old_value?: string | number | boolean | null
  new_value?: string | number | boolean | null
  changed_by?: string | null
  change_source?: ChangeSource
}) {
  const { writeLog } = await import('./changeLogs.js')
  const normalizedParams: WriteLogParams = {
    ...params,
    change_source: normalizeDbChangeLogSource(params.change_source),
  }
  await writeLog(normalizedParams)
}

async function writeLifecycleChangeLog(params: {
  project_id?: string | null
  entity_type: 'task' | 'risk' | 'issue' | 'delay_request'
  entity_id: string
  action: string
  changed_by?: string | null
  change_reason?: string | null
  change_source?: ChangeSource
}) {
  const { writeLifecycleLog } = await import('./changeLogs.js')
  const normalizedParams: WriteLifecycleLogParams = {
    ...params,
    change_source: normalizeDbChangeLogSource(params.change_source),
  }
  await writeLifecycleLog(normalizedParams)
}

export interface TaskSnapshotWriteOptions {
  recordedBy?: string | null
  eventType?: string
  eventSource?: string
  notes?: string | null
}

interface TaskUpdateOptions {
  allowReopen?: boolean
  skipSnapshotWrite?: boolean
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

export async function recordTaskProgressSnapshot(task: any, options: TaskSnapshotWriteOptions = {}, previousTask?: any | null) {
  const eventType = options.eventType ?? resolveTaskSnapshotEventType(task, previousTask)
  const eventSource = options.eventSource ?? (options.recordedBy ? 'user_action' : 'system_auto')
  const snapshot = {
    task_id: task.id,
    progress: Number(task.progress ?? 0),
    snapshot_date: toDateOnly(task.updated_at),
    event_type: eventType,
    event_source: eventSource,
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
    planning_source_type: task.planning_source_type ?? 'execution',
    planning_source_version_id: task.planning_source_version_id ?? null,
    planning_source_item_id: task.planning_source_item_id ?? null,
    created_at: now(),
  }

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

  const projectId = String(task?.project_id ?? '').trim()
  if (projectId) {
    void import('./projectHealthService.js')
      .then(({ enqueueProjectHealthUpdate }) => enqueueProjectHealthUpdate(projectId, eventType))
      .catch((error) => {
        logger.warn('[dbService] failed to enqueue project health refresh after snapshot write', {
          projectId,
          eventType,
          error: error instanceof Error ? error.message : String(error),
        })
      })

    void import('./dataQualityService.js')
      .then(({ dataQualityService }) => dataQualityService.syncProjectDataQuality(projectId))
      .catch((error) => {
        logger.warn('[dbService] failed to enqueue data quality refresh after snapshot write', {
          projectId,
          eventType,
          error: error instanceof Error ? error.message : String(error),
        })
      })
  }
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export async function getProjects(): Promise<Project[]> {
  try {
    const result = await rawQuery('SELECT * FROM public.projects ORDER BY created_at DESC')
    return result.rows as Project[]
  } catch (error) {
    logger.warn('dbService.getProjects fallback to Supabase REST', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Project[]
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
  const id = project.id || uuidv4()
  const ts = now()
  const row = {
    id,
    name: project.name,
    description: project.description ?? null,
    status: normalizeProjectStatus(project.status),
    owner_id: project.owner_id ?? null,
    created_by: project.created_by ?? project.owner_id ?? null,
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
  // TODO(待替换点 6.2)：以下是列剥离重试补丁，用于兼容 projects 表列与代码字段不匹配的情形。
  // 当 Supabase 返回 42703（列不存在）时，自动删除该列并重试，直到插入成功或所有字段耗尽。
  // 问题：行为不透明、每次部署存在隐性依赖、无法区分"真实业务字段缺失"与"迁移滞后"。
  // 替换方向：迁移完整对齐后，改为显式 allowedColumns 白名单，直接过滤 row 字段，去掉重试循环。
  // 替换前提：需确认所有生产环境已跑完 001→054 标准迁移链（见步骤 6.1）。
  const insertRow: Record<string, unknown> = { ...row }

  for (let attempt = 0; attempt < Object.keys(row).length; attempt += 1) {
    const { error } = await supabase.from('projects').insert(insertRow)

    if (!error) {
      if (row.owner_id) {
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
      }
      return (await getProject(id))!
    }

    const missingColumn =
      extractMissingColumnName(error.message, 'projects') ??
      extractMissingColumnName(String(error.details || ''), 'projects')

    if ((error.code === '42703' || missingColumn) && missingColumn && missingColumn in insertRow) {
      delete insertRow[missingColumn]
      continue
    }

    throw new Error(error.message)
  }

  throw new Error('项目创建失败：projects 表结构与当前接口不兼容')
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
      // 42703: column does not exist —— version 列尚未迁移，降级重试
      if (error.code === '42703' || error.message?.includes('"version"') || error.message?.includes("version")) {
        const { error: retryError } = await supabase
          .from('projects')
          .update({ ...normalizedFields, updated_at: now() })
          .eq('id', id)
        if (retryError) throw new Error(retryError.message)
      } else {
        throw new Error(error.message)
      }
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

export async function deleteProject(id: string): Promise<void> {
  const projectId = String(id ?? '').trim()
  if (!projectId) return

  for (const step of PROJECT_DELETE_CLEANUP_STEPS) {
    await deleteProjectScopedRows(projectId, step)
  }

  const query = supabase.from('projects').delete() as unknown as SqlMutationQuery
  const { error } = await query.eq('id', projectId)
  if (error) throw new Error(error.message)
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export async function getTasks(projectId?: string): Promise<Task[]> {
  const sql = projectId
    ? 'SELECT * FROM public.tasks WHERE project_id = $1 ORDER BY created_at DESC'
    : 'SELECT * FROM public.tasks ORDER BY created_at DESC'

  try {
    const result = projectId
      ? await rawQuery(sql, [projectId])
      : await rawQuery(sql)
    return result.rows as Task[]
  } catch (error) {
    logger.warn('dbService.getTasks fallback to Supabase REST', {
      projectId: projectId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  let query = supabase.from('tasks').select('*').order('created_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Task[]
}

export async function getTask(id: string): Promise<Task | null> {
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
  const id = uuidv4()
  const ts = now()
  const normalizedProgress = normalizeTaskProgressValue(task.progress ?? 0)
  const row = {
    id,
    project_id: task.project_id,
    phase_id: task.phase_id ?? null,
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
    is_critical: task.is_critical ?? false,
    specialty_type: task.specialty_type ?? null,
    reference_duration: task.reference_duration ?? null,
    ai_duration: task.ai_duration ?? null,
    first_progress_at: task.first_progress_at ?? null,
    delay_reason: task.delay_reason ?? null,
    planned_start_date: task.planned_start_date ?? task.start_date ?? null,
    planned_end_date: task.planned_end_date ?? task.end_date ?? null,
    actual_start_date: task.actual_start_date ?? null,
    actual_end_date: task.actual_end_date ?? null,
    planned_duration: task.planned_duration ?? null,
    standard_duration: task.standard_duration ?? null,
    ai_adjusted_duration: task.ai_adjusted_duration ?? null,
    assignee_id: task.assignee_id ?? task.assignee_user_id ?? null,
    assignee_user_id: task.assignee_user_id ?? task.assignee_id ?? null,
    assignee_name: task.assignee_name ?? task.assignee ?? null,
    assignee_unit: task.assignee_unit ?? task.responsible_unit ?? null,
    participant_unit_id: task.participant_unit_id ?? null,
    assignee_type: task.assignee_type ?? 'person',
    estimated_hours: task.estimated_hours ?? null,
    actual_hours: task.actual_hours ?? null,
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
    first_progress_at: _manualFirstProgressAt,
    ...fields
  } = updates
  if ('assignee_user_id' in fields && !('assignee_id' in fields)) {
    fields.assignee_id = fields.assignee_user_id ?? null
  }
  if ('assignee_id' in fields && !('assignee_user_id' in fields)) {
    fields.assignee_user_id = fields.assignee_id ?? null
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
    // 统一口径：仅首次 0 -> >0 进度填报可以豁免条件拦截，
    // 后续推进仍需先解除未满足条件；主写链也不会隐式替当前任务 auto-satisfy 条件。
    const unmetConditionIds = await listUnmetTaskConditionIds(id)
    if (unmetConditionIds.length > 0) {
      throw createBusinessError(
        'TASK_CONDITIONS_UNMET',
        '该任务存在未满足的开工条件，请先处理阻塞项后再录入进度',
      )
    }
  }

  const autoActualStart = !oldTask.actual_start_date && (
    (isStartState(oldTask.status) && isInProgressState(nextStatus)) ||
    nextProgress > 0
  )
  const autoActualEnd = !oldTask.actual_end_date && (
    isCompletedTask({ status: nextStatus, progress: nextProgress })
  )
  const autoFirstProgress = !oldTask.first_progress_at && nextProgress > 0
  const updatePayload = {
    ...fields,
    ...(options.allowReopen ? { actual_end_date: null } : {}),
    ...(autoActualStart ? { actual_start_date: toDateOnly(nowTs) } : {}),
    ...(autoActualEnd ? { actual_end_date: toDateOnly(nowTs) } : {}),
    ...(autoFirstProgress ? { first_progress_at: nowTs } : {}),
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

  // 10.2d 规定：end_date 变更必须通过延期审批流（POST /api/delay-requests）提交，
  // 不再在 updateTask 内自动创建 approved 的 delay_request。
  // 仅通过 change_logs 留痕（已在上方 changedFieldPairs 中覆盖 end_date / planned_end_date）。

  const needsSnapshot =
    fields.progress !== undefined ||
    fields.status !== undefined ||
    autoActualStart ||
    autoActualEnd ||
    autoFirstProgress

  if (needsSnapshot && !options.skipSnapshotWrite) {
    await recordTaskProgressSnapshot(updatedTask, {
      recordedBy: changedBy,
    }, oldTask)
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
  try {
    await runRpc<boolean>('delete_task_with_source_backfill_atomic', {
      p_task_id: id,
    })
  } catch (error) {
    if (!isMissingRelationError(error, 'task_preceding_relations')) {
      throw error
    }

    logger.warn('Falling back to direct task delete because task_preceding_relations is missing inside delete RPC', { id })

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (deleteError) {
      throw new Error(deleteError.message)
    }
  }
}

// ─── Risks ────────────────────────────────────────────────────────────────────
export async function getRisks(projectId?: string): Promise<Risk[]> {
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
  const { data, error } = await supabase.from('risks').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as Risk
}

export async function createRisk(
  risk: RiskWriteInput
): Promise<Risk> {
  const id = uuidv4()
  const ts = now()
  const requestedStatus = String(risk.status ?? '')
  const sourceType = String(risk.source_type ?? 'manual')
  const status = normalizeRiskStatus(risk.status)

  if (requestedStatus === 'closed') {
    throw createBusinessError('INVALID_RISK_STATUS_TRANSITION', '风险创建时不能直接进入 closed 状态')
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
    version: risk.version ?? 1,
    created_at: ts,
    updated_at: ts,
  }
  const { error } = await supabase.from('risks').insert(row)
  if (error) throw new Error(error.message)
  return (await getRisk(id))!
}

export async function updateRisk(
  id: string,
  updates: RiskUpdateInput,
  expectedVersion?: number,
  changeSource: ChangeSource = 'manual_adjusted',
): Promise<Risk | null> {
  const oldRisk = await getRisk(id)
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
  
  if (fields.status !== undefined) {
    fields.status = nextStatus
    if (nextStatus === 'closed' && !fields.closed_at) {
      fields.closed_at = now()
    }
    if (nextStatus !== 'closed') {
      if (fields.closed_at === undefined) fields.closed_at = null
      if (fields.closed_reason === undefined) fields.closed_reason = null
    }
  }
  
  // 乐观锁：原子性更新
  if (expectedVersion !== undefined) {
    const { data, error } = await supabase
      .from('risks')
      .update({ ...fields, version: expectedVersion + 1, updated_at: now() })
      .eq('id', id)
      .eq('version', expectedVersion)
      .select('id')
    
    if (error) throw new Error(error.message)
    
    if (!data || data.length === 0) {
      throw createBusinessError('VERSION_MISMATCH', '该风险已被他人修改，请刷新后重试', 409)
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
    return updated
  }

  // 无乐观锁：普通更新
  const { error } = await supabase
    .from('risks')
    .update({ ...fields, updated_at: now() })
    .eq('id', id)
  if (error) throw new Error(error.message)
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
  return updated
}

export async function deleteRisk(id: string): Promise<void> {
  const existing = await getRisk(id)
  if (!existing) return
  const sourceType = String(existing.source_type ?? '') as Risk['source_type']
  if (existing.linked_issue_id || PROTECTED_RISK_SOURCE_TYPES.has(sourceType)) {
    throw createBusinessError('UPGRADE_CHAIN_PROTECTED', '该风险已关联升级链，请改为关闭操作')
  }

  await runRpc<boolean>('delete_risk_with_source_backfill_atomic', {
    p_risk_id: id,
  })
}

export async function confirmRiskPendingManualClose(id: string, expectedVersion?: number): Promise<Risk | null> {
  const risk = await getRisk(id)
  if (!risk) return null
  if (!risk.pending_manual_close) {
    throw createBusinessError('RISK_PENDING_MANUAL_CLOSE_REQUIRED', '当前风险不处于待确认关闭状态')
  }
  return await updateRisk(id, buildRiskConfirmClosePatch(), expectedVersion, 'manual_close_confirmation')
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
  return rows.map((record) => {
    const normalizedRole = normalizeProjectPermissionLevel(record.permission_level ?? record.role)
    return {
      ...record,
      role: normalizedRole,
      permission_level: normalizedRole,
    } as ProjectMember
  })
}

export async function createMember(
  member: MemberWriteInput
): Promise<ProjectMember> {
  const id = uuidv4()
  const ts = now()
  const normalizedRole = normalizeProjectPermissionLevel(member.permission_level ?? member.role ?? 'viewer')
  const row = {
    id,
    project_id: member.project_id,
    user_id: member.user_id,
    role: normalizedRole,
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
  const { id: _id, joined_at: _ja, created_at: _ca, ...fields } = updates
  const { error } = await supabase.from('project_members').update(fields).eq('id', id)
  if (error) throw new Error(error.message)
  const { data } = await supabase.from('project_members').select('*').eq('id', id).single()
  return (data ?? null) as ProjectMember | null
}

export async function deleteMember(id: string): Promise<void> {
  const { error } = await supabase.from('project_members').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Invitations ──────────────────────────────────────────────────────────────
export async function getInvitations(projectId?: string): Promise<Invitation[]> {
  let query = supabase.from('project_invitations').select('*').order('created_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Invitation[]
}

export async function createInvitation(
  invitation: InvitationWriteInput
): Promise<Invitation> {
  const ts = now()
  const row = {
    id: invitation.id ?? uuidv4(),
    project_id: invitation.project_id,
    invited_by: invitation.invited_by ?? invitation.created_by,
    invitation_code: invitation.invitation_code ?? invitation.code,
    role: invitation.role ?? 'viewer',
    status: invitation.status ?? 'active',
    expires_at: invitation.expires_at ?? null,
    accepted_by: invitation.accepted_by ?? null,
    accepted_at: invitation.accepted_at ?? null,
    created_at: ts,
  }
  const { error } = await supabase.from('project_invitations').insert(row)
  if (error) throw new Error(error.message)
  const { data } = await supabase
    .from('project_invitations')
    .select('*')
    .eq('invitation_code', invitation.invitation_code ?? invitation.code)
    .single()
  return data as Invitation
}

export async function updateInvitation(
  id: string,
  updates: InvitationUpdateInput
): Promise<Invitation | null> {
  const { id: _id, created_at: _ca, ...fields } = updates
  const { error } = await supabase.from('project_invitations').update(fields).eq('id', id)
  if (error) throw new Error(error.message)
  const { data } = await supabase.from('project_invitations').select('*').eq('id', id).single()
  return (data ?? null) as Invitation | null
}

export async function deleteInvitation(id: string): Promise<void> {
  const { error } = await supabase.from('project_invitations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function validateInvitation(code: string): Promise<Invitation | null> {
  const { data } = await supabase
    .from('project_invitations')
    .select('*')
    .eq('invitation_code', code)
    .eq('status', 'pending')
    .single()
  if (!data) return null
  const invitation = data as InvitationRow
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) return null
  return data as Invitation
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
  async deleteProject(id: string) { return deleteProject(id) }

  async getTasks(projectId?: string) { return getTasks(projectId) }
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
  async createInvitation(inv: any) { return createInvitation(inv) }
  async updateInvitation(id: string, u: any) { return updateInvitation(id, u) }
  async deleteInvitation(id: string) { return deleteInvitation(id) }
  async validateInvitation(code: string) { return validateInvitation(code) }

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
    const { id: _id, created_at: _ca, ...fields } = data
    const { error } = await supabase.from(table).update(fields).eq('id', id)
    if (error) throw new Error(`[SupabaseService.update] ${error.message}`)
    const updated = await this.query<T>(table, { id })
    return updated[0]
  }

  async delete(table: string, id: string): Promise<void> {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw new Error(`[SupabaseService.delete] ${error.message}`)
  }
}

// ─── Issues CRUD ──────────────────────────────────────────────────────────────

export async function getIssues(projectId?: string): Promise<Issue[]> {
  let query = supabase.from('issues').select('*').order('created_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const issues = (data ?? []) as Issue[]
  const lockedIds = await listPriorityLockedIssueIds(issues.map((issue) => issue.id))
  return issues.map((issue) => applyDynamicPriority(issue, lockedIds.has(issue.id)))
}

export async function getIssue(id: string): Promise<Issue | null> {
  const { data, error } = await supabase.from('issues').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  const issue = data as Issue
  const lockedIds = await listPriorityLockedIssueIds([issue.id])
  return applyDynamicPriority(issue, lockedIds.has(issue.id))
}

export async function createIssue(
  issue: IssueWriteInput
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
    return (await getIssue(issueId))!
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
    version: issue.version ?? 1,
    created_at: ts,
    updated_at: ts,
  }
  const { error } = await supabase.from('issues').insert(row)
  if (error) throw new Error(error.message)
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
  return (await getIssue(id))!
}

export async function updateIssue(
  id: string,
  updates: IssueUpdateInput,
  expectedVersion?: number,
  changeSource: ChangeSource = 'manual_adjusted',
): Promise<Issue | null> {
  const oldIssue = await getIssue(id)
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

  if (fields.status !== undefined) {
    fields.status = nextStatus
    if (nextStatus === 'closed' && !fields.closed_at) {
      fields.closed_at = now()
    }
    if (nextStatus !== 'closed') {
      if (fields.closed_at === undefined) fields.closed_at = null
      if (fields.closed_reason === undefined) fields.closed_reason = null
    }
  }

  const updatePayload = {
    ...fields,
    updated_at: now(),
    version: expectedVersion !== undefined ? expectedVersion + 1 : oldIssue.version + 1,
  }

  if (expectedVersion !== undefined) {
    const { data, error } = await supabase
      .from('issues')
      .update(updatePayload)
      .eq('id', id)
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
  }
  return updated
}

export async function deleteIssue(id: string): Promise<void> {
  const existing = await getIssue(id)
  if (!existing) return
  if (isProtectedIssueRecord(existing)) {
    throw createBusinessError('UPGRADE_CHAIN_PROTECTED', '该问题已关联升级链，请改为关闭操作')
  }

  const { error } = await supabase.from('issues').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function confirmIssuePendingManualClose(id: string, expectedVersion?: number): Promise<Issue | null> {
  const issue = await getIssue(id)
  if (!issue) return null
  if (!issue.pending_manual_close) {
    throw createBusinessError('ISSUE_PENDING_MANUAL_CLOSE_REQUIRED', '当前问题不处于待确认关闭状态')
  }
  return await updateIssue(id, buildIssueConfirmClosePatch(), expectedVersion, 'manual_close_confirmation')
}

export async function keepIssueProcessing(id: string, expectedVersion?: number): Promise<Issue | null> {
  const issue = await getIssue(id)
  if (!issue) return null
  if (!issue.pending_manual_close) {
    throw createBusinessError('ISSUE_PENDING_MANUAL_CLOSE_REQUIRED', '当前问题不处于待确认关闭状态')
  }
  return await updateIssue(id, buildIssueKeepProcessingPatch(), expectedVersion, 'manual_keep_processing')
}
