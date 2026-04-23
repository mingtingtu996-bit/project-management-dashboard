// 任务阻碍记录 API 路由

import { Router } from 'express'
import { executeSQL, executeSQLOne, supabase } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { validate, obstacleSchema, obstacleUpdateSchema } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Issue } from '../types/db.js'
import { v4 as uuidv4 } from 'uuid'
import { writeLifecycleLog, writeStatusTransitionLog } from '../services/changeLogs.js'
import { WarningService } from '../services/warningService.js'
import { enqueueProjectHealthUpdate } from '../services/projectHealthService.js'

const router = Router()
const warningService = new WarningService()

type TaskProjectRow = {
  project_id?: string | null
}

type ObstacleRow = {
  id: string
  task_id: string
  project_id?: string | null
  title?: string | null
  description?: string | null
  obstacle_type?: string | null
  severity?: string | null
  status?: string | null
  is_resolved?: boolean | number | string | null
  resolution?: string | null
  resolved_by?: string | null
  resolved_at?: string | null
  estimated_resolve_date?: string | null
  expected_resolution_date?: string | null
  notes?: string | null
  resolution_notes?: string | null
  severity_escalated_at?: string | null
  severity_manually_overridden?: boolean | number | string | null
  created_at: string
  updated_at: string
}

type LinkedIssueRow = Pick<Issue, 'id' | 'status' | 'source_type'>

type MappedObstacleRecord = ObstacleRow & {
  title: string
  description: string
  expected_resolution_date: string | null
  resolution_notes: string | null
  status: string
  is_resolved: boolean
  severity_escalated_at: string | null
  severity_manually_overridden: boolean
}

type WarningObstacleInput = {
  id: string
  project_id?: string | null
  task_id?: string | null
  title?: string | null
  description?: string | null
  severity?: 'low' | 'medium' | 'high' | 'warning' | 'critical'
  status?: string | null
  expected_resolution_date?: string | null
}

const OBSTACLE_TYPE_PERSONNEL = '\u4eba\u5458'
const OBSTACLE_TYPE_MATERIAL = '\u6750\u6599'
const OBSTACLE_TYPE_EQUIPMENT = '\u8bbe\u5907'
const OBSTACLE_TYPE_ENVIRONMENT = '\u73af\u5883'
const OBSTACLE_TYPE_DESIGN = '\u8bbe\u8ba1'
const OBSTACLE_TYPE_PROCEDURE = '\u624b\u7eed'
const OBSTACLE_TYPE_FUNDS = '\u8d44\u91d1'
const OBSTACLE_TYPE_OTHER = '\u5176\u4ed6'

const OBSTACLE_STATUS_PENDING = '\u5f85\u5904\u7406'
const OBSTACLE_STATUS_PROCESSING = '\u5904\u7406\u4e2d'
const OBSTACLE_STATUS_RESOLVED = '\u5df2\u89e3\u51b3'

const OBSTACLE_TYPE_MAP: Record<string, string> = {
  personnel: OBSTACLE_TYPE_PERSONNEL,
  material: OBSTACLE_TYPE_MATERIAL,
  equipment: OBSTACLE_TYPE_EQUIPMENT,
  environment: OBSTACLE_TYPE_ENVIRONMENT,
  design: OBSTACLE_TYPE_DESIGN,
  procedure: OBSTACLE_TYPE_PROCEDURE,
  funds: OBSTACLE_TYPE_FUNDS,
  other: OBSTACLE_TYPE_OTHER,
  [OBSTACLE_TYPE_PERSONNEL]: OBSTACLE_TYPE_PERSONNEL,
  [OBSTACLE_TYPE_MATERIAL]: OBSTACLE_TYPE_MATERIAL,
  [OBSTACLE_TYPE_EQUIPMENT]: OBSTACLE_TYPE_EQUIPMENT,
  [OBSTACLE_TYPE_ENVIRONMENT]: OBSTACLE_TYPE_ENVIRONMENT,
  [OBSTACLE_TYPE_DESIGN]: OBSTACLE_TYPE_DESIGN,
  [OBSTACLE_TYPE_PROCEDURE]: OBSTACLE_TYPE_PROCEDURE,
  [OBSTACLE_TYPE_FUNDS]: OBSTACLE_TYPE_FUNDS,
  [OBSTACLE_TYPE_OTHER]: OBSTACLE_TYPE_OTHER,
}

const OBSTACLE_STATUS_MAP: Record<string, string> = {
  pending: OBSTACLE_STATUS_PENDING,
  active: OBSTACLE_STATUS_PENDING,
  resolving: OBSTACLE_STATUS_PROCESSING,
  resolved: OBSTACLE_STATUS_RESOLVED,
  closed: OBSTACLE_STATUS_RESOLVED,
  blocked: OBSTACLE_STATUS_PENDING,
  [OBSTACLE_STATUS_PENDING]: OBSTACLE_STATUS_PENDING,
  [OBSTACLE_STATUS_PROCESSING]: OBSTACLE_STATUS_PROCESSING,
  [OBSTACLE_STATUS_RESOLVED]: OBSTACLE_STATUS_RESOLVED,
}

function normalizeObstacleType(value: unknown): string {
  if (typeof value !== 'string') return OBSTACLE_TYPE_OTHER
  return OBSTACLE_TYPE_MAP[value] || OBSTACLE_TYPE_OTHER
}

function normalizeObstacleStatus(value: unknown, isResolved?: unknown): string {
  if (typeof value === 'string' && OBSTACLE_STATUS_MAP[value]) {
    return OBSTACLE_STATUS_MAP[value]
  }
  return isResolved ? OBSTACLE_STATUS_RESOLVED : OBSTACLE_STATUS_PENDING
}

function normalizeTextField(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value)
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function isTruthyLike(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function normalizeObstacleWarningSeverity(value: unknown): WarningObstacleInput['severity'] {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'critical' || normalized === '严重') return 'critical'
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low' || normalized === 'warning') {
    return normalized
  }
  return 'warning'
}

function toWarningObstacle(record: ObstacleRow | MappedObstacleRecord): WarningObstacleInput {
  return {
    id: record.id,
    project_id: record.project_id ?? null,
    task_id: record.task_id ?? null,
    title: normalizeTextField(record.title) ?? null,
    description: normalizeTextField(record.description) ?? null,
    severity: normalizeObstacleWarningSeverity(record.severity),
    status: record.status ?? null,
    expected_resolution_date: record.expected_resolution_date ?? record.estimated_resolve_date ?? null,
  }
}

function mapObstacleRecord(record: ObstacleRow | null): MappedObstacleRecord | null {
  if (!record) return null
  const status = normalizeObstacleStatus(record.status, record.is_resolved)
  const isResolved =
    isTruthyLike(record.is_resolved) ||
    status === OBSTACLE_STATUS_RESOLVED

  const title = normalizeTextField(record.title) ?? normalizeTextField(record.description) ?? ''

  return {
    ...record,
    title,
    description: normalizeTextField(record.description) ?? title,
    expected_resolution_date: record.expected_resolution_date ?? record.estimated_resolve_date ?? null,
    resolution_notes: normalizeTextField(record.resolution_notes) ?? normalizeTextField(record.notes) ?? null,
    status,
    is_resolved: isResolved,
    severity_escalated_at: record.severity_escalated_at ?? null,
    severity_manually_overridden: record.severity_manually_overridden === true
      || record.severity_manually_overridden === 1
      || record.severity_manually_overridden === '1',
  }
}

function buildObstacleDeleteProtectionResponse(
  obstacle: Pick<MappedObstacleRecord, 'id' | 'status' | 'is_resolved'>,
  linkedIssue?: LinkedIssueRow | null,
): ApiResponse {
  return {
    success: false,
    error: {
      code: 'OBSTACLE_DELETE_PROTECTED',
      message: linkedIssue
        ? '该阻碍已关联升级问题，请改为关闭此记录。'
        : '该阻碍仍在处理中，请先关闭此记录后再考虑是否清理。',
      details: {
        entity_type: 'task_obstacle',
        entity_id: obstacle.id ?? null,
        status: obstacle.status ?? null,
        is_resolved: Boolean(obstacle.is_resolved),
        linked_issue_id: linkedIssue?.id ?? null,
        linked_issue_status: linkedIssue?.status ?? null,
        close_action: {
          method: 'POST',
          endpoint: `/api/task-obstacles/${obstacle.id}/close`,
          label: '关闭此记录',
        },
      },
    },
    timestamp: new Date().toISOString(),
  }
}

async function closeObstacleRecord(id: string, userId?: string | null, reqBody?: Record<string, unknown>) {
  const normalizedResolution = normalizeTextField(reqBody?.resolution) ?? '手动关闭并保留记录'
  const resolvedBy = normalizeTextField(reqBody?.resolved_by)
  const { BusinessStatusService } = await import('../services/businessStatusService.js')
  const previous = await executeSQLOne<{ id?: string; project_id?: string | null; status?: string | null }>(
    'SELECT id, project_id, status FROM task_obstacles WHERE id = ? LIMIT 1',
    [id]
  )

  const obstacle = mapObstacleRecord(await BusinessStatusService.resolveObstacle({
    id,
    resolution: normalizedResolution,
    resolved_by: resolvedBy || userId || null,
  }))
  if (!obstacle) {
    throw new Error('阻碍记录不存在')
  }

  const oldStatus = normalizeObstacleStatus(previous?.status)
  const newStatus = normalizeObstacleStatus(obstacle.status, obstacle.is_resolved)
  if (oldStatus !== newStatus) {
    await writeStatusTransitionLog({
      project_id: previous?.project_id ?? obstacle.project_id ?? null,
      entity_type: 'task_obstacle',
      entity_id: id,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: userId ?? null,
      change_source: 'manual_adjusted',
    })
  }

  const businessStatus = await BusinessStatusService.calculateBusinessStatus(obstacle.task_id)
  await warningService.evaluate({
    type: 'obstacle',
    obstacle: toWarningObstacle(obstacle),
  })
  const projectId = obstacle.project_id ?? null
  if (projectId) {
    enqueueProjectHealthUpdate(projectId, 'task_obstacle_resolved')
  }

  return {
    obstacle,
    businessStatus,
  }
}

// 获取任务的所有阻碍记录（支持 taskId 和 projectId 两种查询方式）
router.get('/', asyncHandler(async (req, res) => {
  const taskId = req.query.taskId as string
  const projectId = req.query.projectId as string
  const limit = parseInt(req.query.limit as string) || 200
  const offset = parseInt(req.query.offset as string) || 0

  if (!taskId && !projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_ID', message: '任务ID或项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  let data: ObstacleRow[]
  if (taskId) {
    logger.info('Fetching task obstacles by taskId', { taskId, limit, offset })
    data = await executeSQL<ObstacleRow>(
      'SELECT * FROM task_obstacles WHERE task_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [taskId, limit, offset]
    )
  } else {
    logger.info('Fetching task obstacles by projectId', { projectId, limit, offset })
    data = await executeSQL<ObstacleRow>(
      'SELECT * FROM task_obstacles WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [projectId, limit, offset]
    )
  }

  const response: ApiResponse = {
    success: true,
    data: (data || []).map(mapObstacleRecord),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个阻碍记录
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching task obstacle', { id })

  const data = await executeSQLOne<ObstacleRow>('SELECT * FROM task_obstacles WHERE id = ? LIMIT 1', [id])

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'OBSTACLE_NOT_FOUND', message: '阻碍记录不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse = {
    success: true,
    data: mapObstacleRecord(data),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建阻碍记录
// P1修复：添加XSS防护验证，使用统一认证中间件
router.post('/', authenticate, requireProjectEditor(req => req.body.project_id), validate(obstacleSchema), asyncHandler(async (req, res) => {
  logger.info('Creating task obstacle', req.body)

  // [F5]: 兼容 GanttView 发送的 title 字段 → description
  const description = normalizeTextField(req.body.description ?? req.body.title)
  // [F5]: 兼容 GanttView 发送的 is_resolved 字段 → status
  const status = normalizeObstacleStatus(req.body.status, req.body.is_resolved)
  const obstacleType = normalizeObstacleType(req.body.obstacle_type)

  const id = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  // [F2]: 从 tasks 表获取 project_id（如果没有传入，兼容旧前端）
  let projectId = req.body.project_id
  if (!projectId) {
    const taskRows = await executeSQL<TaskProjectRow>('SELECT project_id FROM tasks WHERE id = ?', [req.body.task_id])
    projectId = taskRows?.[0]?.project_id ?? null
  }

  await executeSQL(
    `INSERT INTO task_obstacles (id, task_id, project_id, obstacle_type, description, status,
       severity, severity_escalated_at, severity_manually_overridden, resolution, resolved_by, resolved_at, estimated_resolve_date, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.body.task_id,
      projectId, // [F2]: 使用自动获取的 project_id
      obstacleType,
      description,
      status,
      req.body.severity ?? '中',
      null,
      false,
      normalizeTextField(req.body.resolution),
      req.body.resolved_by ?? null,
      req.body.resolved_at ?? null,
      normalizeTextField(req.body.expected_resolution_date),
      normalizeTextField(req.body.resolution_notes),
      req.user!.id,
      ts,
      ts,
    ]
  )

  const data = await executeSQLOne<ObstacleRow>('SELECT * FROM task_obstacles WHERE id = ? LIMIT 1', [id])

  await writeLifecycleLog({
    project_id: projectId ?? data?.project_id ?? null,
    entity_type: 'task_obstacle',
    entity_id: id,
    action: 'created',
    changed_by: req.user?.id ?? null,
    change_source: 'manual_adjusted',
  })

  const response: ApiResponse = {
    success: true,
    data: mapObstacleRecord(data),
    timestamp: new Date().toISOString(),
  }
  if (data) {
    await warningService.evaluate({
      type: 'obstacle',
      obstacle: toWarningObstacle(data),
    })
    if (data.project_id) {
      enqueueProjectHealthUpdate(data.project_id, 'task_obstacle_created')
    }
  }
  res.status(201).json(response)
}))

// 更新阻碍记录
// P1修复：添加XSS防护验证，使用统一认证中间件
router.put('/:id', authenticate, requireProjectEditor(async (req) => {
  const obstacle = await executeSQLOne<TaskProjectRow>(
    'SELECT project_id FROM task_obstacles WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return obstacle?.project_id ?? (req.query.projectId as string | undefined)
}), validate(obstacleUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user!.id

  logger.info('Updating task obstacle', { id, userId })

  if (req.body.is_resolved === true && req.body.status === undefined) {
    req.body.status = OBSTACLE_STATUS_RESOLVED
  } else if (req.body.is_resolved === false && req.body.status === undefined) {
    req.body.status = OBSTACLE_STATUS_PENDING
  }

  if (req.body.status !== undefined) {
    req.body.status = normalizeObstacleStatus(req.body.status, req.body.is_resolved)
  }

  if (req.body.obstacle_type !== undefined) {
    req.body.obstacle_type = normalizeObstacleType(req.body.obstacle_type)
  }

  if (req.body.title !== undefined && req.body.description === undefined) {
    req.body.description = req.body.title
  }

  // 获取当前阻碍信息
  const current = await executeSQLOne<ObstacleRow>('SELECT * FROM task_obstacles WHERE id = ? LIMIT 1', [id])

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'OBSTACLE_NOT_FOUND', message: '阻碍记录不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 如果更新状态为已解决，验证必填字段
  if (req.body.status === OBSTACLE_STATUS_RESOLVED) {
    req.body.resolution = normalizeTextField(req.body.resolution) ?? normalizeTextField(current?.resolution) ?? '现场已处理'

    if (!req.body.resolved_by) {
      req.body.resolved_by = userId
    }

    req.body.resolved_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const setClauses: string[] = ['updated_at = ?']
  const params: any[] = [ts]
  const nextDescription = req.body.description !== undefined
    ? normalizeTextField(req.body.description) ?? normalizeTextField(current?.description) ?? normalizeTextField(current?.title) ?? ''
    : undefined
  const normalizedSeverity = req.body.severity
  const severityChanged = normalizedSeverity !== undefined
    && String(normalizedSeverity).trim() !== String(current?.severity ?? '').trim()

  const fieldMap: Record<string, unknown> = {
    obstacle_type: req.body.obstacle_type,
    description: nextDescription,
    status: req.body.status,
    severity: normalizedSeverity,
    severity_manually_overridden: severityChanged ? true : undefined,
    estimated_resolve_date: normalizeTextField(req.body.expected_resolution_date),
    notes: normalizeTextField(req.body.resolution_notes),
    resolution: normalizeTextField(req.body.resolution),
    resolved_by: req.body.resolved_by,
    resolved_at: req.body.resolved_at,
  }

  for (const [col, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      setClauses.push(`${col} = ?`)
      params.push(val)
    }
  }

  params.push(id)
  await executeSQL(`UPDATE task_obstacles SET ${setClauses.join(', ')} WHERE id = ?`, params)

  const data = await executeSQLOne<ObstacleRow>('SELECT * FROM task_obstacles WHERE id = ? LIMIT 1', [id])

  const oldStatus = normalizeObstacleStatus(current?.status, current?.is_resolved)
  const newStatus = normalizeObstacleStatus(data?.status, data?.is_resolved)
  if (oldStatus !== newStatus) {
    await writeStatusTransitionLog({
      project_id: current?.project_id ?? data?.project_id ?? null,
      entity_type: 'task_obstacle',
      entity_id: id,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: userId ?? null,
      change_source: 'manual_adjusted',
    })
  }

  const response: ApiResponse = {
    success: true,
    data: mapObstacleRecord(data),
    timestamp: new Date().toISOString(),
  }
  if (data) {
    await warningService.evaluate({
      type: 'obstacle',
      obstacle: toWarningObstacle(data),
    })
    if (data.project_id) {
      enqueueProjectHealthUpdate(data.project_id, 'task_obstacle_updated')
    }
  }
  res.json(response)
}))

// 删除阻碍记录
// P1修复：使用统一认证中间件
router.delete('/:id', authenticate, requireProjectEditor(async (req) => {
  const obstacle = await executeSQLOne<TaskProjectRow>(
    'SELECT project_id FROM task_obstacles WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return obstacle?.project_id ?? (req.query.projectId as string | undefined)
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting task obstacle', { id })
  const existing = await executeSQLOne<ObstacleRow>('SELECT * FROM task_obstacles WHERE id = ? LIMIT 1', [id])
  if (!existing) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'OBSTACLE_NOT_FOUND', message: '任务阻碍不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const normalizedExisting = mapObstacleRecord(existing)
  const { data: linkedIssues, error: linkedIssueError } = await supabase
    .from('issues')
    .select('id, status, source_type')
    .eq('source_type', 'obstacle_escalated')
    .eq('source_id', id)
    .in('status', ['open', 'investigating', 'resolved'])

  if (linkedIssueError) throw linkedIssueError
  const linkedIssue = Array.isArray(linkedIssues) ? linkedIssues[0] as LinkedIssueRow | undefined : undefined

  if (!normalizedExisting.is_resolved || linkedIssue) {
    return res.status(422).json(buildObstacleDeleteProtectionResponse(normalizedExisting, linkedIssue ?? null))
  }

  const { data, error } = await supabase.rpc('delete_task_obstacle_with_source_backfill_atomic', {
    p_obstacle_id: id,
  })

  if (error) throw error
  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'OBSTACLE_NOT_FOUND', message: '任务阻碍不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  await writeLifecycleLog({
    project_id: existing?.project_id ?? null,
    entity_type: 'task_obstacle',
    entity_id: id,
    action: 'deleted',
    changed_by: req.user?.id ?? null,
    change_source: 'manual_adjusted',
  })

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  if (existing?.project_id) {
    enqueueProjectHealthUpdate(existing.project_id, 'task_obstacle_deleted')
  }
  res.json(response)
}))

// 解决阻碍
// P1修复：使用统一认证中间件
router.put('/:id/resolve', authenticate, requireProjectEditor(async (req) => {
  const obstacle = await executeSQLOne<TaskProjectRow>(
    'SELECT project_id FROM task_obstacles WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return obstacle?.project_id ?? (req.query.projectId as string | undefined)
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user!.id

  logger.info('Resolving task obstacle', { id, userId })

  try {
    const result = await closeObstacleRecord(id, userId, req.body as Record<string, unknown> | undefined)
    const response: ApiResponse<{
      obstacle: any
      businessStatus: any
    }> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    logger.error('Failed to resolve obstacle', { id, error })
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RESOLVE_OBSTACLE_FAILED',
        message: error.message || '解决阻碍失败'
      },
      timestamp: new Date().toISOString(),
    }
    res.status(400).json(response)
  }
}))

router.post('/:id/close', authenticate, requireProjectEditor(async (req) => {
  const obstacle = await executeSQLOne<TaskProjectRow>(
    'SELECT project_id FROM task_obstacles WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return obstacle?.project_id ?? (req.query.projectId as string | undefined)
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user!.id

  logger.info('Closing task obstacle instead of deleting it', { id, userId })

  try {
    const result = await closeObstacleRecord(id, userId, req.body as Record<string, unknown> | undefined)
    const response: ApiResponse<{
      obstacle: any
      businessStatus: any
    }> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    logger.error('Failed to close obstacle', { id, error })
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'CLOSE_OBSTACLE_FAILED',
        message: error.message || '关闭阻碍失败'
      },
      timestamp: new Date().toISOString(),
    }
    res.status(400).json(response)
  }
}))

export default router
