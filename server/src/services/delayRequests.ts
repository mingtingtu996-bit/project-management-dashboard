import { v4 as uuidv4 } from 'uuid'

import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import type { DelayRequest, Task } from '../types/db.js'
import { writeStatusTransitionLog } from './changeLogs.js'
import { clearCriticalPathCache, getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { supabase } from './dbService.js'
import { getProjectCriticalPathSnapshot, recalculateProjectCriticalPath } from './projectCriticalPathService.js'
import { persistNotification } from './warningChainService.js'
import { WarningService } from './warningService.js'

export interface DelayRequestInput {
  project_id: string
  task_id: string
  baseline_version_id?: string | null
  original_date: string
  delayed_date: string
  delay_days: number
  delay_type?: string | null
  reason?: string | null
  delay_reason?: string | null
  requested_by?: string | null
  chain_id?: string | null
}

export interface DelayImpactResult {
  original_task_end_date: string | null
  delayed_task_end_date: string | null
  task_end_date_impact_days: number
  original_project_end_date: string | null
  delayed_project_end_date: string | null
  project_total_duration_impact_days: number
}

const DELAY_APPROVED_EVENT = 'delay_approved'
const DELAY_APPROVAL_DEGRADED_MODE = 'fallback_blocked_non_transactional'
const warningService = new WarningService()

const STANDARD_DELAY_TYPE_ACTIVE = '主动申请'
const STANDARD_DELAY_TYPE_PASSIVE = '被动延期'
const STANDARD_DELAY_TYPE_OBJECTIVE = '客观因素'

function normalizeDelayType(value: unknown): string {
  if (typeof value !== 'string') return STANDARD_DELAY_TYPE_ACTIVE

  const trimmed = value.trim()
  if (!trimmed) return STANDARD_DELAY_TYPE_ACTIVE
  if (trimmed === '主动延期' || trimmed === '主动申请' || trimmed === '涓诲姩寤舵湡' || trimmed === '涓诲姩鐢宠') {
    return STANDARD_DELAY_TYPE_ACTIVE
  }
  if (trimmed === '被动延期' || trimmed === '琚姩寤舵湡') {
    return STANDARD_DELAY_TYPE_PASSIVE
  }
  if (trimmed === '客观因素' || trimmed === '瀹㈣鍥犵礌') {
    return STANDARD_DELAY_TYPE_OBJECTIVE
  }
  return STANDARD_DELAY_TYPE_ACTIVE
}

function nowIso(): string {
  return new Date().toISOString()
}

function toDateOnly(value?: string | null): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return normalized.slice(0, 10)
}

function toTime(value?: string | null): number {
  const normalized = toDateOnly(value)
  if (!normalized) return Number.NaN
  const parsed = new Date(`${normalized}T00:00:00.000Z`).getTime()
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

function diffDays(start?: string | null, end?: string | null): number {
  const startTime = toTime(start)
  const endTime = toTime(end)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0
  return Math.round((endTime - startTime) / (24 * 60 * 60 * 1000))
}

function shiftDate(value?: string | null, days = 0): string | null {
  const normalized = toDateOnly(value)
  if (!normalized) return null
  const base = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

function isUuidLike(value?: string | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? '').trim())
}

function makeError(code: string, statusCode: number, message: string, details?: unknown) {
  const error = new Error(message) as Error & { code: string; statusCode: number; details?: unknown }
  error.code = code
  error.statusCode = statusCode
  error.details = details
  return error
}

function buildDelayAtomicChainUnavailableError(
  functionName: 'approve_delay_request_atomic' | 'reject_delay_request_atomic',
  delayRequestId: string,
  error: unknown,
) {
  return makeError(
    'DELAY_REQUEST_ATOMIC_CHAIN_UNAVAILABLE',
    503,
    '延期审批原子事务链不可用，已阻断非事务降级路径',
    {
      delay_request_id: delayRequestId,
      function_name: functionName,
      processing_mode: 'atomic_required',
      fallback_mode: DELAY_APPROVAL_DEGRADED_MODE,
      cause: error instanceof Error ? error.message : String(error),
    },
  )
}

function normalizeDelayRequest(row: DelayRequestRow): DelayRequest {
  return {
    id: row.id,
    project_id: row.project_id ?? null,
    task_id: row.task_id,
    baseline_version_id: row.baseline_version_id ?? null,
    original_date: row.original_date,
    delayed_date: row.delayed_date,
    delay_days: Number(row.delay_days ?? 0),
    delay_type: normalizeDelayType(row.delay_type),
    reason: row.reason ?? row.delay_reason ?? '未说明原因',
    delay_reason: row.delay_reason ?? null,
    status: row.status ?? 'approved',
    requested_by: row.requested_by ?? row.approved_by ?? null,
    requested_at: row.requested_at ?? row.created_at ?? row.approved_at ?? null,
    reviewed_by: row.reviewed_by ?? row.approved_by ?? null,
    reviewed_at: row.reviewed_at ?? row.approved_at ?? null,
    withdrawn_at: row.withdrawn_at ?? null,
    approved_by: row.approved_by ?? row.reviewed_by ?? null,
    approved_at: row.approved_at ?? row.reviewed_at ?? null,
    chain_id: row.chain_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  }
}

async function normalizeDelayTask(
  task: Partial<DelayTaskLike> | null | undefined,
  projectId: string,
): Promise<DelayTaskLike | null> {
  if (!task?.id) return null

  const criticalTaskIds = await getCriticalPathTaskIds(projectId)

  return {
    id: String(task.id),
    project_id: String(task.project_id ?? ''),
    title: String(task.title ?? ''),
    is_critical: criticalTaskIds.has(task.id),
    updated_at: String(task.updated_at ?? ''),
    planned_end_date: task.planned_end_date ? String(task.planned_end_date) : undefined,
    end_date: task.end_date ? String(task.end_date) : undefined,
    start_date: task.start_date ? String(task.start_date) : undefined,
    planned_start_date: task.planned_start_date ? String(task.planned_start_date) : undefined,
  }
}

function hasDelayRpcInvoker(client: unknown): client is DelayRpcInvoker {
  return typeof (client as { rpc?: unknown } | null)?.rpc === 'function'
}

async function readDelayRows(table: 'delay_requests' | 'task_delay_history', filters: Record<string, unknown>) {
  let query = supabase.from(table).select('*')
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      query = query.in(key, value)
    } else {
      query = query.eq(key, value)
    }
  }
  const { data, error } = await query
  const rows: DelayRequestRow[] | null = Array.isArray(data) ? data : null
  return { data: rows, error } satisfies DelayRowQueryResult
}

async function loadDelayRows(filters: Record<string, unknown>): Promise<DelayRequest[]> {
  const currentResult = await readDelayRows('delay_requests', filters)
  const currentData = currentResult?.data ?? []
  const currentError = currentResult?.error ?? null
  if (!currentError && currentData && currentData.length > 0) {
    return currentData
      .map(normalizeDelayRequest)
      .sort((left, right) => String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')))
  }

  if (filters.status && filters.status !== 'approved') {
    return []
  }

  const legacyFilters = { ...filters }
  delete legacyFilters.status
  const legacyResult = await readDelayRows('task_delay_history', legacyFilters)
  const legacyData = legacyResult?.data ?? []
  const legacyError = legacyResult?.error ?? null
  if (legacyError || !legacyData) return []

  return legacyData
    .map((row) => normalizeDelayRequest({
      ...row,
      status: 'approved',
      requested_by: row.requested_by ?? row.approved_by ?? null,
      requested_at: row.requested_at ?? row.created_at ?? row.approved_at ?? null,
      reviewed_by: row.reviewed_by ?? row.approved_by ?? null,
      reviewed_at: row.reviewed_at ?? row.approved_at ?? null,
      withdrawn_at: row.withdrawn_at ?? null,
    }))
    .sort((left, right) => String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')))
}

async function loadTask(taskId: string): Promise<DelayTaskLike | null> {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).single()
  if (error) throw error
  const projectId = String(data?.project_id ?? '')
  if (!projectId) return null
  return await normalizeDelayTask(data, projectId)
}

async function loadProjectTasks(projectId: string): Promise<DelayTaskLike[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, project_id, title, start_date, planned_start_date, end_date, planned_end_date')
    .eq('project_id', projectId)
  if (error) throw error
  const tasks = await Promise.all(
    (data ?? []).map(async (row) => await normalizeDelayTask(row, projectId))
  )
  return tasks.filter((row): row is DelayTaskLike => Boolean(row))
}

async function loadProject(projectId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name')
    .eq('id', projectId)
    .single()
  if (error) throw error
  return data as { id: string; owner_id?: string | null; name?: string | null }
}

async function loadProjectMembers(projectId: string) {
  const { data, error } = await supabase
    .from('project_members')
    .select('project_id, user_id, permission_level')
    .eq('project_id', projectId)
  if (error) throw error
  return (data ?? []) as Array<{
    project_id: string
    user_id: string
    permission_level?: string | null
  }>
}

export async function calculateDelayImpact(input: Pick<DelayRequestInput, 'project_id' | 'task_id' | 'original_date' | 'delayed_date'>): Promise<DelayImpactResult> {
  const [task, projectTasks, snapshot] = await Promise.all([
    loadTask(input.task_id),
    loadProjectTasks(input.project_id),
    getProjectCriticalPathSnapshot(input.project_id).catch(() => null),
  ])

  const originalTaskEndDate = toDateOnly(input.original_date)
    ?? toDateOnly(task?.planned_end_date)
    ?? toDateOnly(task?.end_date)
  const delayedTaskEndDate = toDateOnly(input.delayed_date)

  const taskEndDateImpactDays = Math.max(0, diffDays(originalTaskEndDate, delayedTaskEndDate))

  const taskFloat = snapshot?.tasks?.find(t => t.taskId === input.task_id)?.floatDays ?? 0
  const projectTotalDurationImpactDays = taskFloat >= taskEndDateImpactDays
    ? 0
    : taskEndDateImpactDays - taskFloat

  const originalProjectEndCandidates = projectTasks
    .map((row) => {
      if (String(row.id) === input.task_id) {
        return originalTaskEndDate
      }
      return toDateOnly(row.planned_end_date ?? row.end_date)
    })
    .filter(Boolean) as string[]
  const originalProjectEndDate = originalProjectEndCandidates
    .sort((left, right) => toTime(right) - toTime(left))[0] ?? originalTaskEndDate ?? null

  const delayedProjectEndDate = originalProjectEndDate && projectTotalDurationImpactDays > 0
    ? shiftDate(originalProjectEndDate, projectTotalDurationImpactDays)
    : originalProjectEndDate

  return {
    original_task_end_date: originalTaskEndDate ?? null,
    delayed_task_end_date: delayedTaskEndDate ?? null,
    task_end_date_impact_days: taskEndDateImpactDays,
    original_project_end_date: originalProjectEndDate ?? null,
    delayed_project_end_date: delayedProjectEndDate ?? null,
    project_total_duration_impact_days: projectTotalDurationImpactDays,
  }
}

async function writeStatusLog(
  projectId: string | null | undefined,
  entityId: string,
  oldStatus: string | null | undefined,
  newStatus: string,
  changedBy: string | null,
  changeSource: 'manual_adjusted' | 'approval' | 'system_auto',
) {
  await writeStatusTransitionLog({
    project_id: projectId ?? null,
    entity_type: 'delay_request',
    entity_id: entityId,
    old_status: oldStatus ?? null,
    new_status: newStatus,
    changed_by: changedBy ?? null,
    change_source: changeSource,
  })
}

function uniqueRecipients(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

async function isCriticalDelayTask(task: DelayTaskLike | null | undefined, delayRequest?: DelayRequest | null) {
  const projectId = String(delayRequest?.project_id ?? task?.project_id ?? '').trim()
  const taskId = String(delayRequest?.task_id ?? task?.id ?? '').trim()
  if (!projectId || !taskId) return false

  const criticalTaskIds = await getCriticalPathTaskIds(projectId)
  return criticalTaskIds.has(taskId)
}

async function resolveDelayApproverRecipients(projectId: string) {
  const [project, members] = await Promise.all([
    loadProject(projectId),
    loadProjectMembers(projectId),
  ])

  return uniqueRecipients([
    project?.owner_id ?? null,
    ...members
      .filter((member) => {
        const level = normalizeProjectPermissionLevel(member.permission_level)
        return level === 'owner'
      })
      .map((member) => member.user_id),
  ])
}

async function resolveDelayFollowupRecipients(projectId: string, requesterId?: string | null) {
  return uniqueRecipients([
    requesterId ?? null,
    ...(await resolveDelayApproverRecipients(projectId)),
  ])
}

async function notifyDelaySubmitted(delayRequest: DelayRequest, task: DelayTaskLike | null, requesterId: string | null, timestamp: string) {
  const projectId = delayRequest.project_id ?? task?.project_id ?? null
  if (!projectId) return

  try {
    const recipients = await resolveDelayApproverRecipients(projectId)
    if (recipients.length === 0) return
    const isCritical = await isCriticalDelayTask(task, delayRequest)

    await persistNotification({
      project_id: projectId,
      type: isCritical ? 'critical_path_delay_request_submitted' : 'delay_request_submitted',
      notification_type: 'flow-reminder',
      severity: isCritical ? 'critical' : 'warning',
      title: isCritical ? '关键路径延期申请待专项处理' : '新的延期申请待审批',
      content: isCritical
        ? `关键路径任务“${task?.title ?? delayRequest.task_id}”已提交延期申请，拟延期至 ${delayRequest.delayed_date}，请项目负责人尽快专项评估。`
        : `任务“${task?.title ?? delayRequest.task_id}”已提交延期申请，拟延期至 ${delayRequest.delayed_date}，请项目经理/owner 审批。`,
      is_read: false,
      is_broadcast: isCritical,
      source_entity_type: 'delay_request',
      source_entity_id: delayRequest.id,
      task_id: delayRequest.task_id,
      delay_request_id: delayRequest.id,
      recipients,
      metadata: {
        delay_request_id: delayRequest.id,
        original_date: delayRequest.original_date,
        delayed_date: delayRequest.delayed_date,
        delay_days: delayRequest.delay_days,
        requested_by: requesterId,
        is_critical_task: isCritical,
      },
      created_at: timestamp,
    })
  } catch (error) {
    logger.warn('[delayRequests] failed to persist delay_request_submitted notification', {
      delayRequestId: delayRequest.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function notifyDelayApproved(delayRequest: DelayRequest, task: DelayTaskLike | null, reviewerId: string | null, timestamp: string) {
  const projectId = delayRequest.project_id ?? task?.project_id ?? null
  if (!projectId) return

  try {
    const recipients = await resolveDelayFollowupRecipients(projectId, delayRequest.requested_by ?? null)
    await persistNotification({
      project_id: projectId,
      type: 'delay_approved',
      notification_type: 'flow-reminder',
      severity: 'info',
      title: '延期申请已审批通过',
      content: `任务“${task?.title ?? delayRequest.task_id}”延期至 ${delayRequest.delayed_date} 已生效。`,
      is_read: false,
      is_broadcast: false,
      source_entity_type: 'delay_request',
      source_entity_id: delayRequest.id,
      task_id: delayRequest.task_id,
      delay_request_id: delayRequest.id,
      recipients,
      metadata: {
        delay_request_id: delayRequest.id,
        original_date: delayRequest.original_date,
        delayed_date: delayRequest.delayed_date,
        delay_days: delayRequest.delay_days,
        approved_by: reviewerId,
      },
      created_at: timestamp,
    })
  } catch (error) {
    logger.warn('[delayRequests] failed to persist delay_approved notification', {
      delayRequestId: delayRequest.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function notifyDelayApprovedAssessment(delayRequest: DelayRequest, task: DelayTaskLike | null, reviewerId: string | null, timestamp: string) {
  const projectId = delayRequest.project_id ?? task?.project_id ?? null
  if (!projectId) return

  try {
    const isCritical = await isCriticalDelayTask(task, delayRequest)
    const recipients = await resolveDelayFollowupRecipients(projectId, delayRequest.requested_by ?? null)
    if (recipients.length === 0) return

    await persistNotification({
      project_id: projectId,
      type: isCritical ? 'critical_path_delay_approved_assessment' : 'delay_approved_assessment',
      notification_type: 'flow-reminder',
      severity: isCritical ? 'critical' : 'warning',
      title: isCritical ? '关键路径延期已批准，需专项复核' : '延期已批准，需后续复核',
      content: isCritical
        ? `关键路径任务“${task?.title ?? delayRequest.task_id}”延期已批准，请立即复核关键路径、健康度与后续承诺。`
        : `任务“${task?.title ?? delayRequest.task_id}”延期已批准，请继续复核对月计划与项目健康度的影响。`,
      is_read: false,
      is_broadcast: isCritical,
      source_entity_type: 'delay_request',
      source_entity_id: delayRequest.id,
      task_id: delayRequest.task_id,
      delay_request_id: delayRequest.id,
      recipients,
      metadata: {
        delay_request_id: delayRequest.id,
        approved_by: reviewerId,
        assessment_event_type: DELAY_APPROVED_EVENT,
        is_critical_task: isCritical,
      },
      created_at: timestamp,
    })
  } catch (error) {
    logger.warn('[delayRequests] failed to persist delay approved assessment notification', {
      delayRequestId: delayRequest.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function evaluateDelayWarning(event: {
  type: 'delay_request' | 'delay_request_submitted' | 'delay_approved'
  delayRequest: {
    id: string
    task_id: string
    status: string
    project_id?: string | null
  }
}) {
  await warningService.evaluate(event)
}

async function runDelayApprovalFollowupStep(
  step: 'critical_path_recalculation' | 'delay_warning_evaluation',
  context: {
    delayRequestId: string
    projectId?: string | null
    taskId?: string | null
  },
  action: () => Promise<void>,
) {
  try {
    await action()
  } catch (error) {
    logger.warn('[delayRequests] delay approval follow-up failed; keeping approval result', {
      step,
      delayRequestId: context.delayRequestId,
      projectId: context.projectId ?? null,
      taskId: context.taskId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function listDelayRequests(taskId?: string, projectId?: string): Promise<DelayRequest[]> {
  const filters: Record<string, unknown> = {}
  if (taskId) filters.task_id = taskId
  if (projectId) filters.project_id = projectId
  return loadDelayRows(filters)
}

export async function getDelayRequest(id: string): Promise<DelayRequest | null> {
  const rows = await loadDelayRows({ id })
  return rows[0] ?? null
}

export async function getApprovedDelayRequestsByTaskId(taskId: string): Promise<DelayRequest[]> {
  return loadDelayRows({ task_id: taskId, status: 'approved' })
}

export async function getApprovedDelayRequestsByTaskIds(taskIds: string[]): Promise<DelayRequest[]> {
  if (taskIds.length === 0) return []
  const rows = await loadDelayRows({ task_id: taskIds, status: 'approved' })
  return rows.sort((left, right) => right.created_at.localeCompare(left.created_at))
}

export async function getApprovedDelayRequestsByProjectId(projectId: string): Promise<DelayRequest[]> {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
  if (error) throw error

  const taskIds = (tasks ?? []).map((task: any) => task.id)
  return getApprovedDelayRequestsByTaskIds(taskIds)
}

export async function getApprovedDelayReasonsByProjectId(projectId: string): Promise<string[]> {
  const delays = await getApprovedDelayRequestsByProjectId(projectId)
  if (delays.length === 0) return []

  const reasonCount = delays.reduce((accumulator: Record<string, number>, delay) => {
    const reason = delay.reason || delay.delay_reason || '未说明原因'
    accumulator[reason] = (accumulator[reason] || 0) + 1
    return accumulator
  }, {})

  return Object.entries(reasonCount)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([reason]) => reason)
}

type DelayDecisionRpcPayload = {
  ok?: boolean
  code?: string | null
  message?: string | null
  status_code?: number | null
  project_id?: string | null
  delay_request?: DelayRequestRow | null
  task?: DelayTaskLike | null
}

type DelayRequestRow = Partial<DelayRequest> & Record<string, unknown>

type DelayTaskLike = Pick<
  Task,
  'id' | 'project_id' | 'title' | 'is_critical' | 'updated_at' | 'planned_end_date' | 'end_date' | 'start_date' | 'planned_start_date'
>

type DelayRowQueryResult = {
  data: DelayRequestRow[] | null
  error: { message?: string | null } | null
}

type DelayRpcInvoker = {
  rpc: (
    functionName: 'approve_delay_request_atomic' | 'reject_delay_request_atomic',
    params: { p_delay_request_id: string; p_reviewer_id: string | null },
  ) => Promise<{ data: DelayDecisionRpcPayload | null; error: { message?: string | null } | null }>
}

function isMissingRpcError(error: unknown) {
  const message = String((error as Error | undefined)?.message ?? '')
  const code = String((error as { code?: unknown } | undefined)?.code ?? '')
  return (
    code === '42883'
    || 
    message.includes('Could not find the function')
    || message.includes('does not exist')
    || message.includes('is not a function')
    || message.includes('PGRST202')
  )
}

async function approveDelayRequestDirect(delayRequestId: string, reviewerId: string | null): Promise<DelayDecisionRpcPayload> {
  const timestamp = nowIso()
  const dateOnly = toDateOnly(timestamp)

  const { data: dr, error: drErr } = await supabase
    .from('delay_requests')
    .select('*')
    .eq('id', delayRequestId)
    .single()
  if (drErr || !dr) throw makeError('DELAY_REQUEST_NOT_FOUND', 404, '延期申请不存在')
  if (String(dr.status ?? 'pending') !== 'pending') {
    throw makeError('DELAY_REQUEST_STATE_INVALID', 422, '只有待审批延期申请可以通过')
  }

  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', dr.task_id)
    .single()
  if (taskErr || !task) throw makeError('TASK_NOT_FOUND', 404, '任务不存在')

  const projectId = dr.project_id ?? task.project_id
  const oldEndDate = task.end_date ? String(task.end_date) : null
  const oldPlannedEndDate = task.planned_end_date ? String(task.planned_end_date) : null

  const { error: updateDrErr } = await supabase
    .from('delay_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: timestamp,
      approved_by: reviewerId,
      approved_at: timestamp,
      updated_at: timestamp,
    })
    .eq('id', delayRequestId)
  if (updateDrErr) throw new Error(updateDrErr.message)

  const { error: updateTaskErr } = await supabase
    .from('tasks')
    .update({
      end_date: dr.delayed_date,
      planned_end_date: dr.delayed_date,
      updated_at: timestamp,
    })
    .eq('id', dr.task_id)
  if (updateTaskErr) throw new Error(updateTaskErr.message)

  const changeLogs = [
    { entity_type: 'delay_request', entity_id: dr.id, field_name: 'status', old_value: String(dr.status ?? 'pending'), new_value: 'approved' },
    { entity_type: 'task', entity_id: task.id, field_name: 'end_date', old_value: oldEndDate, new_value: String(dr.delayed_date) },
    { entity_type: 'task', entity_id: task.id, field_name: 'planned_end_date', old_value: oldPlannedEndDate, new_value: String(dr.delayed_date) },
  ]
  for (const cl of changeLogs) {
    await supabase.from('change_logs').insert({
      id: uuidv4(),
      project_id: projectId,
      entity_type: cl.entity_type,
      entity_id: cl.entity_id,
      field_name: cl.field_name,
      old_value: cl.old_value,
      new_value: cl.new_value,
      changed_by: reviewerId,
      changed_at: timestamp,
      change_source: 'approval',
    })
  }

  const snapshotBase = {
    task_id: task.id,
    progress: Number(task.progress ?? 0),
    snapshot_date: dateOnly,
    status: task.status ?? 'todo',
    conditions_met_count: Number(task.conditions_met_count ?? 0),
    conditions_total_count: Number(task.conditions_total_count ?? 0),
    obstacles_active_count: Number(task.obstacles_active_count ?? 0),
    recorded_by: reviewerId,
    is_auto_generated: true,
    created_at: timestamp,
  }
  const snapshots = [
    { ...snapshotBase, event_type: 'delay_approved', event_source: 'delay_request', notes: `延期审批通过，计划完成时间调整为 ${dr.delayed_date}` },
    { ...snapshotBase, event_type: 'delay_approved_assessment', event_source: 'delay_request', notes: '延期审批通过后触发后续影响评估' },
  ]
  for (const snap of snapshots) {
    const { data: existingRows } = await supabase
      .from('task_progress_snapshots')
      .select('id')
      .eq('task_id', snap.task_id)
      .eq('snapshot_date', snap.snapshot_date)
      .eq('event_type', snap.event_type)
      .eq('event_source', snap.event_source)
    const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows
    if (existing?.id) {
      await supabase.from('task_progress_snapshots').update({
        progress: snap.progress, notes: snap.notes, status: snap.status,
        conditions_met_count: snap.conditions_met_count, conditions_total_count: snap.conditions_total_count,
        obstacles_active_count: snap.obstacles_active_count, recorded_by: snap.recorded_by, created_at: snap.created_at,
      }).eq('id', existing.id)
    } else {
      const { error: insErr } = await supabase.from('task_progress_snapshots').insert({ id: uuidv4(), ...snap })
      if (insErr && !String(insErr.message ?? '').includes('duplicate key value violates unique constraint')) {
        throw new Error(insErr.message)
      }
    }
  }

  const { data: updatedDr } = await supabase.from('delay_requests').select('*').eq('id', delayRequestId).single()
  const { data: updatedTask } = await supabase.from('tasks').select('*').eq('id', task.id).single()

  return {
    ok: true,
    project_id: projectId,
    delay_request: updatedDr,
    task: updatedTask,
  }
}

async function rejectDelayRequestDirect(delayRequestId: string, reviewerId: string | null): Promise<DelayDecisionRpcPayload> {
  const timestamp = nowIso()

  const { data: dr, error: drErr } = await supabase
    .from('delay_requests')
    .select('*')
    .eq('id', delayRequestId)
    .single()
  if (drErr || !dr) throw makeError('DELAY_REQUEST_NOT_FOUND', 404, '延期申请不存在')
  if (String(dr.status ?? 'pending') !== 'pending') {
    throw makeError('DELAY_REQUEST_STATE_INVALID', 422, '只有待审批延期申请可以驳回')
  }

  const { error: updateDrErr } = await supabase
    .from('delay_requests')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: timestamp,
      updated_at: timestamp,
    })
    .eq('id', delayRequestId)
  if (updateDrErr) throw new Error(updateDrErr.message)

  await supabase.from('change_logs').insert({
    id: uuidv4(),
    project_id: dr.project_id,
    entity_type: 'delay_request',
    entity_id: dr.id,
    field_name: 'status',
    old_value: String(dr.status ?? 'pending'),
    new_value: 'rejected',
    changed_by: reviewerId,
    changed_at: timestamp,
    change_source: 'approval',
  })

  const { data: updatedDr } = await supabase.from('delay_requests').select('*').eq('id', delayRequestId).single()

  return {
    ok: true,
    project_id: dr.project_id,
    delay_request: updatedDr,
    task: null,
  }
}

async function invokeDelayDecisionRpc(functionName: 'approve_delay_request_atomic' | 'reject_delay_request_atomic', delayRequestId: string, reviewerId?: string | null) {
  if (!hasDelayRpcInvoker(supabase)) {
    logger.warn('[delayRequests] supabase.rpc unavailable, using direct query fallback', { functionName, delayRequestId })
    return functionName === 'approve_delay_request_atomic'
      ? approveDelayRequestDirect(delayRequestId, reviewerId ?? null)
      : rejectDelayRequestDirect(delayRequestId, reviewerId ?? null)
  }
  try {
    const { data, error } = await supabase.rpc(functionName, {
      p_delay_request_id: delayRequestId,
      p_reviewer_id: reviewerId ?? null,
    })
    if (error) throw error
    const payload = data as DelayDecisionRpcPayload | null
    if (payload?.ok === false) {
      throw makeError(
        String(payload.code ?? 'DELAY_REQUEST_PROCESSING_FAILED'),
        Number(payload.status_code ?? 422),
        String(payload.message ?? '延期申请处理失败'),
      )
    }
    return payload
  } catch (error) {
    if (isMissingRpcError(error)) {
      logger.warn('[delayRequests] atomic rpc unavailable, using direct query fallback', {
        functionName,
        delayRequestId,
        originalError: error instanceof Error ? error.message : String(error),
      })
      return functionName === 'approve_delay_request_atomic'
        ? approveDelayRequestDirect(delayRequestId, reviewerId ?? null)
        : rejectDelayRequestDirect(delayRequestId, reviewerId ?? null)
    }
    throw error
  }
}

export async function createDelayRequest(input: DelayRequestInput): Promise<DelayRequest> {
  const existingPending = await loadDelayRows({ task_id: input.task_id, status: 'pending' })
  if (existingPending.length > 0) {
    const latestPending = existingPending[0]
    throw makeError('PENDING_CONFLICT', 409, '同一任务已存在待审批延期申请', {
      task_id: input.task_id,
      pending_request_id: latestPending.id,
      pending_requested_at: latestPending.requested_at ?? latestPending.created_at ?? null,
      pending_delayed_date: latestPending.delayed_date ?? null,
      pending_reason: latestPending.reason ?? latestPending.delay_reason ?? null,
    })
  }

  const rejected = await loadDelayRows({ task_id: input.task_id, status: 'rejected' })
  const latestRejected = rejected[0]
  const normalizedReason = (input.reason ?? input.delay_reason ?? '').trim()

  if (
    latestRejected
    && normalizedReason
    && normalizedReason === String(latestRejected.reason ?? latestRejected.delay_reason ?? '').trim()
  ) {
    throw makeError('DUPLICATE_REASON', 422, '驳回后的重新提交原因不得与最近一次拒绝原因相同', {
      task_id: input.task_id,
      last_rejected_request_id: latestRejected.id,
      last_rejected_at: latestRejected.reviewed_at ?? latestRejected.updated_at ?? null,
      last_rejected_reason: latestRejected.reason ?? latestRejected.delay_reason ?? null,
    })
  }

  const id = uuidv4()
  const timestamp = nowIso()
  const row: DelayRequestRow = {
    id,
    project_id: input.project_id,
    task_id: input.task_id,
    baseline_version_id: input.baseline_version_id ?? null,
    original_date: input.original_date,
    delayed_date: input.delayed_date,
    delay_days: input.delay_days,
    delay_type: normalizeDelayType(input.delay_type),
    reason: normalizedReason || '未说明原因',
    delay_reason: input.delay_reason ?? null,
    status: 'pending',
    requested_by: input.requested_by ?? null,
    requested_at: timestamp,
    reviewed_by: null,
    reviewed_at: null,
    withdrawn_at: null,
    approved_by: null,
    approved_at: null,
    chain_id: input.chain_id ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  }

  const { error } = await supabase.from('delay_requests').insert(row)
  if (error) throw new Error(error.message)

  await writeStatusLog(input.project_id, id, null, 'pending', input.requested_by ?? null, 'manual_adjusted')

  const delayRequest = normalizeDelayRequest(row)
  const task = await loadTask(input.task_id)
  await notifyDelaySubmitted(delayRequest, task, input.requested_by ?? null, timestamp)
  await evaluateDelayWarning({
    type: 'delay_request_submitted',
    delayRequest: {
      id: delayRequest.id,
      task_id: delayRequest.task_id,
      status: delayRequest.status,
      project_id: delayRequest.project_id,
    },
  })
  return delayRequest
}

async function loadMutableDelayRequest(id: string): Promise<DelayRequest> {
  const delayRequest = await getDelayRequest(id)
  if (!delayRequest) {
    throw makeError('DELAY_REQUEST_NOT_FOUND', 404, '延期申请不存在')
  }
  return delayRequest
}

export async function approveDelayRequest(id: string, reviewerId?: string | null): Promise<DelayRequest> {
  const existing = await loadMutableDelayRequest(id)
  if (existing.status !== 'pending') {
    throw makeError('DELAY_REQUEST_STATE_INVALID', 422, '只有待审批延期申请可以通过')
  }

  const rpcPayload = await invokeDelayDecisionRpc('approve_delay_request_atomic', id, reviewerId)
  if (rpcPayload?.delay_request) {
    const approved = normalizeDelayRequest(rpcPayload.delay_request)
    const approvedTask = (await normalizeDelayTask(rpcPayload.task, existing.project_id)) ?? (await loadTask(existing.task_id))
    const projectId = rpcPayload.project_id ?? approved.project_id ?? null
    const timestamp = String(
      approved.reviewed_at
      ?? approved.approved_at
      ?? approvedTask?.updated_at
      ?? nowIso(),
    )
    if (projectId) {
      await runDelayApprovalFollowupStep(
        'critical_path_recalculation',
        {
          delayRequestId: approved.id,
          projectId,
          taskId: approved.task_id,
        },
        async () => {
          await recalculateProjectCriticalPath(projectId)
          clearCriticalPathCache(projectId)
        },
      )
    }
    await notifyDelayApproved(approved, approvedTask, reviewerId ?? null, timestamp)
    await notifyDelayApprovedAssessment(approved, approvedTask, reviewerId ?? null, timestamp)
    await runDelayApprovalFollowupStep(
      'delay_warning_evaluation',
      {
        delayRequestId: approved.id,
        projectId,
        taskId: approved.task_id,
      },
      async () => {
        await evaluateDelayWarning({
          type: DELAY_APPROVED_EVENT,
          delayRequest: {
            id: approved.id,
            task_id: approved.task_id,
            status: approved.status,
            project_id: approved.project_id,
          },
        })
      },
    )
    return approved
  }

  throw buildDelayAtomicChainUnavailableError('approve_delay_request_atomic', existing.id, new Error('atomic rpc payload missing'))
}

export async function rejectDelayRequest(id: string, reviewerId?: string | null): Promise<DelayRequest> {
  const existing = await loadMutableDelayRequest(id)
  if (existing.status !== 'pending') {
    throw makeError('DELAY_REQUEST_STATE_INVALID', 422, '只有待审批延期申请可以驳回')
  }

  const rpcPayload = await invokeDelayDecisionRpc('reject_delay_request_atomic', id, reviewerId)
  if (rpcPayload?.delay_request) {
    const rejected = normalizeDelayRequest(rpcPayload.delay_request)
    await evaluateDelayWarning({
      type: 'delay_request',
      delayRequest: {
        id: rejected.id,
        task_id: rejected.task_id,
        status: rejected.status,
        project_id: rejected.project_id,
      },
    })
    return rejected
  }

  throw buildDelayAtomicChainUnavailableError('reject_delay_request_atomic', existing.id, new Error('atomic rpc payload missing'))
}

export async function withdrawDelayRequest(id: string, requesterId?: string | null): Promise<DelayRequest> {
  const existing = await loadMutableDelayRequest(id)
  if (existing.status !== 'pending') {
    throw makeError('DELAY_REQUEST_STATE_INVALID', 422, '只有待审批延期申请可以撤回')
  }

  if (requesterId && existing.requested_by && requesterId !== existing.requested_by) {
    throw makeError('DELAY_REQUEST_FORBIDDEN', 403, '只有申请人可以撤回延期申请')
  }

  const timestamp = nowIso()
  const { error } = await supabase
    .from('delay_requests')
    .update({
      status: 'withdrawn',
      withdrawn_at: timestamp,
      updated_at: timestamp,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  await writeStatusLog(existing.project_id ?? null, id, existing.status, 'withdrawn', requesterId ?? existing.requested_by ?? null, 'manual_adjusted')
  const withdrawn = (await getDelayRequest(id))!
  await evaluateDelayWarning({
    type: 'delay_request',
    delayRequest: {
      id: withdrawn.id,
      task_id: withdrawn.task_id,
      status: withdrawn.status,
      project_id: withdrawn.project_id,
    },
  })
  return withdrawn
}
