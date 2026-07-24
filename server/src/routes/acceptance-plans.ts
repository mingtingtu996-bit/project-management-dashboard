// 验收计划 API 路由

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { getProjectCompanyId } from '../auth/access.js'
import { executeSQL, executeSQLOne, getMembers, supabase } from '../services/dbService.js'
import { v4 as uuidv4 } from 'uuid'
import type { ApiResponse } from '../types/index.js'
import type { AcceptancePlan, AcceptanceNode } from '../types/db.js'
import { ValidationService } from '../services/validationService.js'
import { persistNotification } from '../services/warningChainService.js'
import {
  clearAcceptanceFlowSnapshotCache,
  filterAcceptanceFlowSnapshot,
  getAcceptanceFlowSnapshot,
  listAcceptanceRequirements,
  type AcceptanceFlowFilters,
} from '../services/acceptanceFlowService.js'
import {
  ACCEPTANCE_STATUS_TRANSITIONS,
  acceptanceStatusLabel,
  normalizeAcceptanceStatus,
  parseAcceptanceStatus,
} from '../utils/acceptanceStatus.js'
import {
  ACCEPTANCE_NODE_COLUMNS,
  ACCEPTANCE_PLAN_COLUMNS,
} from '../services/sqlColumns.js'
import { listActiveEntityLinksForEntity } from '../services/projectLinkingService.js'
import { syncCanonicalTaskFromAcceptancePlan } from '../services/acceptanceTaskSyncService.js'
import { withDatabaseTransaction } from '../database.js'
import {
  buildAndPersistBusinessCompletionSampleHealthReport,
  buildQualityRectificationCompletionSamples,
} from '../services/businessCompletionSampleHealthAdapterService.js'
import { recordAcceptancePlanExecutionFacts } from '../services/acceptancePlanExecutionFactService.js'

const router = Router()
router.use(authenticate)
const ACCEPTANCE_PLAN_SELECT = `SELECT ${ACCEPTANCE_PLAN_COLUMNS} FROM acceptance_plans`
const ACCEPTANCE_NODE_SELECT = `SELECT ${ACCEPTANCE_NODE_COLUMNS} FROM acceptance_nodes`

class AcceptanceStatusConflictError extends Error {}

const ACCEPTANCE_JSON_FIELDS = ['documents']
const ACCEPTANCE_PERSISTED_FIELDS = new Set([
  'project_id',
  'building_id',
  'building_object_id',
  'scope_level',
  'participant_unit_id',
  'responsible_user_id',
  'catalog_id',
  'type_id',
  'type_name',
  'acceptance_type',
  'acceptance_name',
  'planned_date',
  'actual_date',
  'status',
  'phase',
  'phase_order',
  'sort_order',
  'parallel_group_id',
  'documents',
  'notes',
  'created_by',
  'type_id',
  'type_name',
  'type_color',
  'description',
])

function normalizeAcceptanceValue(key: string, value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    if (ACCEPTANCE_JSON_FIELDS.includes(key)) return trimmed
    return trimmed
  }

  if (value == null) return null

  if (ACCEPTANCE_JSON_FIELDS.includes(key) && (Array.isArray(value) || typeof value === 'object')) {
    return JSON.stringify(value)
  }

  return value
}

function normalizeAcceptanceBody(body: Record<string, any>) {
  const payload: Record<string, any> = { ...body }

  if (payload.name && !payload.acceptance_name) {
    payload.acceptance_name = payload.name
  }

  if (payload.type_name && !payload.acceptance_type) {
    payload.acceptance_type = payload.type_name
  }

  if (payload.phase_code && !payload.phase) {
    payload.phase = payload.phase_code
  }

  if (payload.buildingObjectId && !payload.building_object_id) {
    payload.building_object_id = payload.buildingObjectId
  }
  delete payload.buildingObjectId

  delete payload.name
  delete payload.milestone_id
  delete payload.is_system
  delete payload.nodes
  delete payload.phase_code

  if (payload.status) {
    payload.status = normalizeAcceptanceStatus(payload.status)
  }

  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => ACCEPTANCE_PERSISTED_FIELDS.has(key))
      .map(([key, value]) => [key, normalizeAcceptanceValue(key, value)]),
  )
}

function hasOwnField(payload: Record<string, any>, key: string) {
  return Object.prototype.hasOwnProperty.call(payload, key)
}

function hasTextValue(value: unknown) {
  return String(value ?? '').trim() !== ''
}

function isBuildingScope(payload: Record<string, any>) {
  return String(payload.scope_level ?? '').trim().toLowerCase() === 'building'
}

function shouldResolveBuildingObject(payload: Record<string, any>, forceBuildingScope = false) {
  return forceBuildingScope
    || isBuildingScope(payload)
    || hasTextValue(payload.building_id)
    || hasTextValue(payload.building_object_id)
}

async function applyBuildingObjectConstraint(payload: Record<string, any>, projectId: string, forceBuildingScope = false) {
  if (!shouldResolveBuildingObject(payload, forceBuildingScope)) return null

  const buildingObjectId = String(payload.building_object_id ?? '').trim()
  if (!buildingObjectId) {
    return {
      code: 'BUILDING_OBJECT_REQUIRED',
      message: 'building_object_id is required for building scoped acceptance plans',
    }
  }

  const buildingObj = await executeSQLOne(
    `SELECT object_code, object_name FROM engineering_objects WHERE id = ? AND object_type = 'building' AND project_id = ? LIMIT 1`,
    [buildingObjectId, projectId],
  ) as any
  if (!buildingObj) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'building_object_id must be a building engineering object',
    }
  }

  payload.building_object_id = buildingObjectId
  payload.building_id = buildingObj.object_code ?? buildingObj.object_name ?? null
  return null
}

async function applyParticipantUnitConstraint(payload: Record<string, any>, projectId: string) {
  if (!hasOwnField(payload, 'participant_unit_id')) return null

  const participantUnitId = String(payload.participant_unit_id ?? '').trim()
  if (!participantUnitId) {
    payload.participant_unit_id = null
    return null
  }

  const unit = await executeSQLOne(
    `SELECT id, unit_status FROM participant_units WHERE id = ? AND project_id = ? LIMIT 1`,
    [participantUnitId, projectId],
  ) as any
  const unitStatus = String(unit?.unit_status ?? 'active').trim() || 'active'
  if (!unit || unitStatus !== 'active') {
    return {
      code: 'PARTICIPANT_UNIT_NOT_FOUND',
      message: 'participant_unit_id must reference an active participant unit in the current project',
    }
  }

  payload.participant_unit_id = participantUnitId
  return null
}

async function validateAcceptanceCatalogReference(payload: Record<string, any>, projectId: string) {
  if (!hasOwnField(payload, 'catalog_id')) return null

  const catalogId = String(payload.catalog_id ?? '').trim()
  if (!catalogId) {
    payload.catalog_id = null
    return null
  }

  const catalog = await executeSQLOne<{ id?: string | null; project_id?: string | null }>(
    'SELECT id, project_id FROM acceptance_catalog WHERE id = ? LIMIT 1',
    [catalogId],
  )
  if (!catalog || String(catalog.project_id ?? '').trim() !== projectId) {
    return {
      code: 'ACCEPTANCE_CATALOG_PROJECT_MISMATCH',
      message: 'acceptance catalog does not belong to current project',
    }
  }

  payload.catalog_id = catalogId
  return null
}

function uniqueRecipients(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function parseCsvQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item ?? '').split(','))
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseBooleanQueryValue(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized)
}

function buildAcceptanceFlowFilters(query: Record<string, unknown>): AcceptanceFlowFilters {
  return {
    task_id: String(query.taskId ?? '').trim() || null,
    building_id: String(query.buildingId ?? query.building_id ?? '').trim() || null,
    scope_level: String(query.scopeLevel ?? query.scope_level ?? '').trim() || null,
    participant_unit_id: String(query.participantUnitId ?? query.participant_unit_id ?? '').trim() || null,
    catalog_id: String(query.catalogId ?? query.catalog_id ?? '').trim() || null,
    phase_code: String(query.phaseCode ?? query.phase_code ?? '').trim() || null,
    statuses: parseCsvQueryValue(query.status ?? query.statuses).map((status) => normalizeAcceptanceStatus(status)),
    overlay_tag: String(query.overlayTag ?? query.overlay_tag ?? '').trim() || null,
    blocked_only: parseBooleanQueryValue(query.blockedOnly ?? query.blocked_only),
  }
}

function normalizeAcceptancePlanRow(row: AcceptancePlan, coveredTaskIds: string[] = []): AcceptancePlan {
  return {
    ...row,
    covered_task_ids: coveredTaskIds,
    status: normalizeAcceptanceStatus(row.status),
    phase_code: (row as any).phase_code ?? row.phase ?? null,
    overlay_tags: Array.isArray((row as any).overlay_tags) ? (row as any).overlay_tags : [],
    display_badges: Array.isArray((row as any).display_badges) ? (row as any).display_badges : [],
  }
}

function normalizeCoveredTaskIds(value: unknown) {
  if (!Array.isArray(value)) return null
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))]
}

async function validateAcceptanceTaskReferences(projectId: string, coveredTaskIds?: string[] | null) {
  const uniqueIds = [...new Set(coveredTaskIds ?? [])]
  if (uniqueIds.length === 0) return null

  const placeholders = uniqueIds.map(() => '?').join(', ')
  const rows = await executeSQL<{ id?: string | null; project_id?: string | null }>(
    `SELECT id, project_id FROM tasks WHERE id IN (${placeholders})`,
    uniqueIds,
  )
  const byId = new Map((rows ?? []).map((row) => [String(row.id ?? ''), String(row.project_id ?? '')]))
  const invalidIds = uniqueIds.filter((id) => byId.get(id) !== projectId)

  if (invalidIds.length > 0) {
    return {
      code: 'TASK_PROJECT_MISMATCH',
      message: 'acceptance task references must belong to the current project',
      details: { invalidTaskIds: invalidIds },
    }
  }

  return null
}

async function listAcceptancePlanIdsCoveringTask(taskId: string) {
  const task = await executeSQLOne<{ project_id?: string | null }>('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [taskId])
  const projectId = String(task?.project_id ?? '').trim()
  if (!projectId) return []

  const { data: links, error } = await supabase
    .from('project_entity_links')
    .select('source_entity_id')
    .eq('project_id', projectId)
    .eq('source_entity_type', 'acceptance_plan')
    .eq('target_entity_type', 'task')
    .eq('target_entity_id', taskId)
    .eq('relation_type', 'covers_task')
    .eq('status', 'active')

  if (error) throw error
  return [...new Set((links ?? []).map((item: any) => String(item.source_entity_id ?? '').trim()).filter(Boolean))]
}

async function loadAcceptancePlansByIds(ids: string[]) {
  if (ids.length === 0) return [] as AcceptancePlan[]
  const { data, error } = await supabase
    .from('acceptance_plans')
    .select(ACCEPTANCE_PLAN_COLUMNS)
    .in('id', ids)
    .order('planned_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return hydrateAcceptancePlanRows((data ?? []) as unknown as AcceptancePlan[])
}

async function loadCoveredTaskIdsByPlanIds(projectId: string, planIds: string[]) {
  const normalizedPlanIds = [...new Set(planIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  const result = new Map<string, string[]>()
  if (!projectId || normalizedPlanIds.length === 0) return result

  const placeholders = normalizedPlanIds.map(() => '?').join(', ')
  const links = await executeSQL<{ source_entity_id?: string | null; target_entity_id?: string | null }>(
    `SELECT source_entity_id, target_entity_id
       FROM project_entity_links
      WHERE project_id = ?
        AND source_entity_type = 'acceptance_plan'
        AND source_entity_id IN (${placeholders})
        AND target_entity_type = 'task'
        AND relation_type = 'covers_task'
        AND status = 'active'
      ORDER BY created_at ASC, id ASC`,
    [projectId, ...normalizedPlanIds],
  )

  for (const link of links ?? []) {
    const planId = String(link.source_entity_id ?? '').trim()
    const taskId = String(link.target_entity_id ?? '').trim()
    if (!planId || !taskId) continue
    const taskIds = result.get(planId) ?? []
    if (!taskIds.includes(taskId)) taskIds.push(taskId)
    result.set(planId, taskIds)
  }
  return result
}

async function hydrateAcceptancePlanRows(rows: AcceptancePlan[]) {
  const byProject = new Map<string, AcceptancePlan[]>()
  for (const row of rows ?? []) {
    const projectId = String(row.project_id ?? '').trim()
    const projectRows = byProject.get(projectId) ?? []
    projectRows.push(row)
    byProject.set(projectId, projectRows)
  }

  const hydrated: AcceptancePlan[] = []
  for (const [projectId, projectRows] of byProject) {
    const coveredTaskIdsByPlan = await loadCoveredTaskIdsByPlanIds(
      projectId,
      projectRows.map((row) => row.id),
    )
    for (const row of projectRows) {
      hydrated.push(normalizeAcceptancePlanRow(row, coveredTaskIdsByPlan.get(String(row.id)) ?? []))
    }
  }
  return hydrated
}

async function resolveAcceptancePlanProjectId(planId: string) {
  const plan = await executeSQLOne<{ project_id?: string | null }>(
    'SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1',
    [planId],
  )
  return plan?.project_id ?? undefined
}

async function resolveAcceptancePlanIdsProjectId(planIds: string[]) {
  const normalizedIds = [...new Set(planIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (normalizedIds.length === 0) return undefined

  const placeholders = normalizedIds.map(() => '?').join(', ')
  const rows = await executeSQL<{ id?: string | null; project_id?: string | null }>(
    `SELECT id, project_id FROM acceptance_plans WHERE id IN (${placeholders})`,
    normalizedIds,
  )
  if ((rows ?? []).length !== normalizedIds.length) return undefined

  const projectIds = [...new Set((rows ?? []).map((row) => String(row.project_id ?? '').trim()).filter(Boolean))]
  return projectIds.length === 1 ? projectIds[0] : undefined
}

async function resolveTaskProjectId(taskId: string) {
  const task = await executeSQLOne<{ project_id?: string | null }>('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [taskId])
  return task?.project_id ?? undefined
}

async function resolveAcceptanceListProjectId(req: any) {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim()
  if (projectId) return projectId

  const taskId = String(req.query.taskId ?? '').trim()
  return taskId ? resolveTaskProjectId(taskId) : undefined
}

async function syncAcceptanceCoveredTaskLinks(planId: string, projectId: string, coveredTaskIds: string[]) {
  const now = new Date().toISOString()
  await executeSQL(
    `UPDATE project_entity_links
        SET status = 'inactive', updated_at = ?
      WHERE project_id = ?
        AND source_entity_type = 'acceptance_plan'
        AND source_entity_id = ?
        AND target_entity_type = 'task'
        AND relation_type = 'covers_task'
        AND status = 'active'`,
    [now, projectId, planId],
  )

  for (const taskId of coveredTaskIds) {
    await executeSQL(
      `INSERT INTO project_entity_links (project_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relation_type, relation_strength, status, created_at, updated_at)
       VALUES (?, 'acceptance_plan', ?, 'task', ?, 'covers_task', 'explicit', 'active', ?, ?)`,
      [projectId, planId, taskId, now, now],
    )
  }
}

function validateAcceptanceStatusTransition(currentStatus: string, nextStatus: string, actualDate?: string) {
  const current = parseAcceptanceStatus(currentStatus)
  const next = parseAcceptanceStatus(nextStatus)
  const errors: string[] = []

  if (!current) {
    errors.push('current acceptance status is invalid')
  }
  if (!next) {
    errors.push('next acceptance status is invalid')
  }
  if (!current || !next) {
    return { valid: false, errors, normalizedStatus: null }
  }

  if (current === next) {
    return { valid: true, errors: [] as string[], normalizedStatus: next }
  }

  const allowedNext = ACCEPTANCE_STATUS_TRANSITIONS[current] || []

  if (!allowedNext.includes(next)) {
    errors.push(`transition from ${acceptanceStatusLabel(current)} to ${acceptanceStatusLabel(next)} is not allowed`)
  }

  if (next === 'passed' && !actualDate) {
    errors.push('actual_date is required when acceptance status is passed')
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedStatus: next,
  }
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

async function notifyAcceptanceStatusChange(current: AcceptancePlan, next: AcceptancePlan) {
  const currentStatus = normalizeAcceptanceStatus(current.status)
  const nextStatus = normalizeAcceptanceStatus(next.status)
  if (currentStatus === nextStatus) return

  const members = await getMembers(next.project_id)
  const recipients = uniqueRecipients(
    members
      .filter((member) => member.permission_level === 'owner')
      .map((member) => member.user_id),
  )

  if (recipients.length === 0) return

  await persistNotification({
    project_id: next.project_id,
    type: 'acceptance_status_changed',
    notification_type: 'flow-reminder',
    severity: nextStatus === 'rectifying' ? 'warning' : 'info',
    title: '验收状态已更新',
    content: `Acceptance ${next.plan_name || next.acceptance_name || next.id} changed from ${acceptanceStatusLabel(currentStatus)} to ${acceptanceStatusLabel(nextStatus)}.`,
    is_read: false,
    is_broadcast: false,
    source_entity_type: 'acceptance_plan',
    source_entity_id: next.id,
    task_id: next.covered_task_ids?.[0] ?? null,
    category: 'acceptance',
    recipients,
    created_at: new Date().toISOString(),
  })
}

async function recordQualityRectificationSampleHealthEvidence(input: {
  previousPlan: AcceptancePlan
  nextPlan: AcceptancePlan
  sourceRoute: string
}) {
  const previousStatus = normalizeAcceptanceStatus(input.previousPlan.status)
  const nextStatus = normalizeAcceptanceStatus(input.nextPlan.status)
  if (previousStatus !== 'rectifying' || nextStatus !== 'passed') return

  const projectId = normalizeText((input.nextPlan as any).project_id)
  const rectificationId = normalizeText((input.nextPlan as any).id)
  if (!projectId || !rectificationId) return

  try {
    const companyId = await getProjectCompanyId(projectId)
    if (!companyId) {
      logger.warn('[acceptancePlans] skip quality rectification sample health evidence without company scope', {
        projectId,
        rectificationId,
      })
      return
    }

    const closedAt = normalizeText((input.nextPlan as any).actual_date)
      ?? normalizeText((input.nextPlan as any).updated_at)
      ?? new Date().toISOString()
    const rectificationCode = normalizeText((input.nextPlan as any).acceptance_name)
      ?? normalizeText((input.nextPlan as any).plan_name)
      ?? rectificationId
    const samples = buildQualityRectificationCompletionSamples([{
      companyId,
      projectId,
      rectificationId,
      rectificationCode,
      closedAt,
      startedAt: closedAt,
      updatedAt: normalizeText((input.nextPlan as any).updated_at),
      qualitySignal: 'verified',
      metadata: {
        sourceRoute: input.sourceRoute,
        acceptancePlanId: rectificationId,
        previousStatus,
        nextStatus,
        acceptanceName: normalizeText((input.nextPlan as any).acceptance_name),
        actualDate: normalizeText((input.nextPlan as any).actual_date),
      },
    }])

    await buildAndPersistBusinessCompletionSampleHealthReport({
      companyId,
      projectId,
      queryExec: executeSQL,
      samples,
    })
  } catch (error) {
    logger.warn('[acceptancePlans] failed to record quality rectification sample health evidence', {
      projectId,
      rectificationId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function validateAcceptanceStatusPreconditions(projectId: string, planId: string, nextStatus: string) {
  const requirements = await listAcceptanceRequirements(projectId, planId)
  return ValidationService.validateAcceptanceStatusPreconditions(nextStatus, requirements || [])
}

async function runAcceptancePlanPostCommitEffects(input: {
  previousPlan: AcceptancePlan
  nextPlan: AcceptancePlan
  actorId: string | null
  sourceRoute: string
}) {
  const effects = [
    {
      name: 'quality_rectification_sample_health',
      run: () => recordQualityRectificationSampleHealthEvidence({
        previousPlan: input.previousPlan,
        nextPlan: input.nextPlan,
        sourceRoute: input.sourceRoute,
      }),
    },
    {
      name: 'status_notification',
      run: () => notifyAcceptanceStatusChange(input.previousPlan, input.nextPlan),
    },
    {
      name: 'canonical_task_sync',
      run: () => syncCanonicalTaskFromAcceptancePlan({
        previousPlan: input.previousPlan,
        nextPlan: input.nextPlan,
        actorId: input.actorId,
      }),
    },
  ]

  for (const effect of effects) {
    try {
      await effect.run()
    } catch (error) {
      logger.warn('[acceptancePlans] post-commit effect failed after acceptance plan update', {
        effect: effect.name,
        sourceRoute: input.sourceRoute,
        planId: input.nextPlan.id,
        projectId: input.nextPlan.project_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

// P0-3 修复：批量查询验收节点接口（解决 N+1 查询问题）
router.get('/batch/nodes',
  requireProjectMember((req) => {
    const planIds = req.query.planIds
    if (!planIds || typeof planIds !== 'string') return undefined
    const planIdArray = planIds.split(',').filter((id) => id.trim())
    return resolveAcceptancePlanIdsProjectId(planIdArray)
  }),
  asyncHandler(async (req, res) => {
  const { planIds } = req.query

  if (!planIds || typeof planIds !== 'string') {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_IDS', message: 'planIds必须是字符串数组格式' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

// 解析 planIds（支持逗号分隔的字符串）
  const planIdArray = planIds.split(',').filter(id => id.trim())

  if (planIdArray.length === 0) {
    const response: ApiResponse<Record<string, AcceptanceNode[]>> = {
      success: true,
      data: {},
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  logger.info('Batch fetching acceptance nodes', { planIds: planIdArray })

// 批量查询所有计划的所有节点
  const placeholders = planIdArray.map(() => '?').join(', ')
  const data = await executeSQL(
    `${ACCEPTANCE_NODE_SELECT}
     WHERE acceptance_plan_id IN (${placeholders})
     ORDER BY planned_date ASC`,
    planIdArray
  )

  // 按计划ID分组
  // eslint-disable-next-line -- route-level-aggregation-approved
  const grouped = (data || []).reduce((acc: Record<string, AcceptanceNode[]>, node: any) => {
    if (!acc[node.acceptance_plan_id]) {
      acc[node.acceptance_plan_id] = []
    }
    acc[node.acceptance_plan_id].push(node)
    return acc
  }, {})

  const response: ApiResponse<Record<string, AcceptanceNode[]>> = {
    success: true,
    data: grouped,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取项目的所有验收计划
router.get('/',
  requireProjectMember(resolveAcceptanceListProjectId),
  asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim()
  const taskId = String(req.query.taskId ?? '').trim()
  const filters = buildAcceptanceFlowFilters(req.query as Record<string, unknown>)

  if (!projectId && !taskId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_ID', message: '项目ID或任务ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching acceptance plans', { projectId, taskId, filters })

  let data: AcceptancePlan[] = []
  if (projectId) {
    const snapshot = await getAcceptanceFlowSnapshot(projectId)
    data = filterAcceptanceFlowSnapshot(snapshot, filters).plans
  } else {
    const linkedPlanIds = await listAcceptancePlanIdsCoveringTask(taskId)
    const normalizedRows = await loadAcceptancePlansByIds(linkedPlanIds)
    data = filterAcceptanceFlowSnapshot({
      catalogs: [],
      plans: normalizedRows,
      dependencies: [],
      requirements: [],
      records: [],
    }, filters).plans
  }

  const response: ApiResponse<AcceptancePlan[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/flow-snapshot',
  requireProjectMember((req) => String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined),
  asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim()
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: 'projectId 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const filters = buildAcceptanceFlowFilters(req.query as Record<string, unknown>)
  logger.info('Fetching acceptance flow snapshot', { projectId, filters })

  const snapshot = filterAcceptanceFlowSnapshot(await getAcceptanceFlowSnapshot(projectId), filters)
  const response: ApiResponse<typeof snapshot> = {
    success: true,
    data: snapshot,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个验收计划
router.get('/:id',
  requireProjectMember((req) => resolveAcceptancePlanProjectId(req.params.id)),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching acceptance plan', { id })

  const row = await executeSQLOne<AcceptancePlan>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  if (!row) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ACCEPTANCE_NOT_FOUND', message: 'acceptance plan not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const [data] = await hydrateAcceptancePlanRows([row])

  const response: ApiResponse<AcceptancePlan> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建验收计划
router.post('/', requireProjectEditor(req => req.body.project_id), asyncHandler(async (req, res) => {
  logger.info('Creating acceptance plan', req.body)

  // 验证数据
  const validation = ValidationService.validateAcceptancePlan(req.body)
  if (!validation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: validation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const id = uuidv4()
  const now = new Date().toISOString()
  const createdBy = req.user?.id
  if (!createdBy) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'authenticated user is required' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse<never>)
  }

  const normalizedBody = normalizeAcceptanceBody(req.body)

  const buildingConstraintError = await applyBuildingObjectConstraint(
    normalizedBody,
    String(normalizedBody.project_id || req.body.project_id || ''),
  )
  if (buildingConstraintError) {
    return res.status(400).json({
      success: false,
      error: buildingConstraintError,
      timestamp: new Date().toISOString(),
    })
  }

  const participantUnitConstraintError = await applyParticipantUnitConstraint(
    normalizedBody,
    String(normalizedBody.project_id || req.body.project_id || ''),
  )
  if (participantUnitConstraintError) {
    return res.status(400).json({
      success: false,
      error: participantUnitConstraintError,
      timestamp: new Date().toISOString(),
    })
  }

  const catalogReferenceError = await validateAcceptanceCatalogReference(
    normalizedBody,
    String(normalizedBody.project_id || req.body.project_id || ''),
  )
  if (catalogReferenceError) {
    return res.status(400).json({
      success: false,
      error: catalogReferenceError,
      timestamp: new Date().toISOString(),
    })
  }

  const coveredTaskIds = normalizeCoveredTaskIds(req.body.covered_task_ids) ?? []
  const taskReferenceError = await validateAcceptanceTaskReferences(
    String(normalizedBody.project_id || req.body.project_id || ''),
    coveredTaskIds,
  )
  if (taskReferenceError) {
    return res.status(400).json({
      success: false,
      error: taskReferenceError,
      timestamp: new Date().toISOString(),
    })
  }

  // v1.4.1: validate building_object_id type and backfill building_id
  if (normalizedBody.building_object_id) {
    const buildingObj = await executeSQLOne(
      `SELECT object_code FROM engineering_objects WHERE id = ? AND object_type = 'building' AND project_id = ? LIMIT 1`,
      [normalizedBody.building_object_id, normalizedBody.project_id || req.body.project_id],
    ) as any
    if (!buildingObj) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'building_object_id must reference a building engineering object' },
        timestamp: new Date().toISOString(),
      })
    }
    if (!normalizedBody.building_id) {
      normalizedBody.building_id = buildingObj.object_code ?? null
    }
  }

  const insertValues = [
    id,
    normalizedBody.project_id ?? req.body.project_id,
    normalizedBody.building_id ?? null,
    normalizedBody.building_object_id ?? null,
    normalizedBody.scope_level ?? null,
    normalizedBody.participant_unit_id ?? null,
    normalizedBody.responsible_user_id ?? null,
    normalizedBody.catalog_id ?? null,
    normalizedBody.type_id ?? null,
    normalizedBody.type_name ?? null,
    normalizedBody.type_color ?? null,
    normalizedBody.acceptance_type ?? null,
    normalizedBody.acceptance_name ?? req.body.acceptance_name ?? req.body.name ?? null,
    normalizedBody.planned_date ?? null,
    normalizedBody.actual_date ?? null,
    normalizedBody.status ?? 'draft',
    normalizedBody.phase ?? null,
    normalizedBody.phase_order ?? null,
    normalizedBody.sort_order ?? null,
    normalizedBody.parallel_group_id ?? null,
    normalizedBody.documents ?? null,
    normalizedBody.notes ?? null,
    normalizedBody.description ?? null,
  ]

  await withDatabaseTransaction(async () => {
    await executeSQL(
      `INSERT INTO acceptance_plans (
         id, project_id, building_id, building_object_id, scope_level,
         participant_unit_id, responsible_user_id, catalog_id, type_id, type_name,
         type_color, acceptance_type, acceptance_name, planned_date, actual_date,
         status, phase, phase_order, sort_order, parallel_group_id, documents,
         notes, description, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...insertValues, createdBy, now, now],
    )

    await syncAcceptanceCoveredTaskLinks(
      id,
      String(normalizedBody.project_id ?? req.body.project_id),
      coveredTaskIds,
    )

    await recordAcceptancePlanExecutionFacts({
      projectId: String(normalizedBody.project_id ?? req.body.project_id),
      planId: id,
      previous: null,
      next: {
        status: normalizedBody.status ?? 'draft',
        actual_date: normalizedBody.actual_date ?? null,
      },
      sourceMutationId: `acceptance_plan:${id}:create`,
      observedAt: now,
      actorUserId: createdBy,
      forceInitial: true,
    })
  })
  clearAcceptanceFlowSnapshotCache(String(normalizedBody.project_id || req.body.project_id || ''))

  const insertedRow = await executeSQLOne<AcceptancePlan>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )
  const [data] = insertedRow ? await hydrateAcceptancePlanRows([insertedRow]) : []

  const response: ApiResponse<AcceptancePlan> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新验收计划
router.put('/:id', requireProjectEditor(async (req) => {
  const row = await executeSQLOne(
    'SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1',
    [req.params.id]
  ) as any
  return row?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating acceptance plan', { id })

// 获取当前状态
  const currentRow = await executeSQLOne<AcceptancePlan>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  if (!currentRow) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ACCEPTANCE_NOT_FOUND', message: 'acceptance plan not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  const [current] = await hydrateAcceptancePlanRows([currentRow])

  if (
    Object.prototype.hasOwnProperty.call(req.body ?? {}, 'project_id')
    && String(req.body.project_id ?? '').trim() !== String((current as any).project_id ?? '').trim()
  ) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_ID_IMMUTABLE', message: 'acceptance plan project_id is immutable' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

// 如果更新状态，验证状态转换
  const requestedStatusChange = Boolean(req.body.status && req.body.status !== current.status)
  if (requestedStatusChange) {
    const statusValidation = validateAcceptanceStatusTransition(
      current.status,
      req.body.status,
      req.body.actual_date
    )
    if (!statusValidation.valid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'STATUS_TRANSITION_ERROR',
          message: statusValidation.errors.join('; ')
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const preconditionValidation = await validateAcceptanceStatusPreconditions(
      String((current as any)?.project_id ?? ''),
      id,
      statusValidation.normalizedStatus,
    )
    if (!preconditionValidation.valid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'PRECONDITION_NOT_MET',
          message: preconditionValidation.errors.join('; '),
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    req.body.status = statusValidation.normalizedStatus
  }

  const updateBody = normalizeAcceptanceBody(req.body)
  const coveredTaskIds = normalizeCoveredTaskIds(req.body.covered_task_ids)

  if (Object.keys(updateBody).length === 0 && coveredTaskIds === null) {
    const response: ApiResponse<AcceptancePlan> = {
      success: true,
      data: current,
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

// 验证其他数据。优先基于规范化后的持久字段做校验，避免旧兼容字段重新污染新模型写入。
  const validation = ValidationService.validateAcceptancePlan({
    ...current,
    ...updateBody,
  })
  if (!validation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: validation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const mergedForBuildingConstraint = { ...(current as any), ...updateBody }
  if (hasTextValue(mergedForBuildingConstraint.building_object_id) && !hasTextValue(updateBody.building_object_id)) {
    updateBody.building_object_id = mergedForBuildingConstraint.building_object_id
  }
  const buildingConstraintError = await applyBuildingObjectConstraint(
    updateBody,
    String((current as any)?.project_id ?? ''),
    isBuildingScope(mergedForBuildingConstraint)
      || hasOwnField(updateBody, 'building_id')
      || hasOwnField(updateBody, 'building_object_id'),
  )
  if (buildingConstraintError) {
    return res.status(400).json({
      success: false,
      error: buildingConstraintError,
      timestamp: new Date().toISOString(),
    })
  }

  const participantUnitConstraintError = await applyParticipantUnitConstraint(
    updateBody,
    String((current as any)?.project_id ?? ''),
  )
  if (participantUnitConstraintError) {
    return res.status(400).json({
      success: false,
      error: participantUnitConstraintError,
      timestamp: new Date().toISOString(),
    })
  }

  const catalogReferenceError = await validateAcceptanceCatalogReference(
    updateBody,
    String((current as any)?.project_id ?? ''),
  )
  if (catalogReferenceError) {
    return res.status(400).json({
      success: false,
      error: catalogReferenceError,
      timestamp: new Date().toISOString(),
    })
  }

  const taskReferenceError = await validateAcceptanceTaskReferences(
    String((current as any)?.project_id ?? ''),
    coveredTaskIds,
  )
  if (taskReferenceError) {
    return res.status(400).json({
      success: false,
      error: taskReferenceError,
      timestamp: new Date().toISOString(),
    })
  }

  // v1.4.1: validate building_object_id type and backfill building_id
  if (updateBody.building_object_id) {
    const projectId = String((current as any)?.project_id ?? '')
    const buildingObj = await executeSQLOne(
      `SELECT object_code FROM engineering_objects WHERE id = ? AND object_type = 'building' AND project_id = ? LIMIT 1`,
      [updateBody.building_object_id, projectId],
    ) as any
    if (!buildingObj) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'building_object_id must reference a building engineering object' },
        timestamp: new Date().toISOString(),
      })
    }
    if (!updateBody.building_id) {
      updateBody.building_id = buildingObj.object_code ?? null
    }
  }

  const currentProjectId = String((current as any)?.project_id ?? '')
  const nextValue = (key: string) => (
    hasOwnField(updateBody, key) ? updateBody[key] : ((current as any)[key] ?? null)
  )
  const updateValues = [
    nextValue('building_id'),
    nextValue('building_object_id'),
    nextValue('scope_level'),
    nextValue('participant_unit_id'),
    nextValue('responsible_user_id'),
    nextValue('catalog_id'),
    nextValue('type_id'),
    nextValue('type_name'),
    nextValue('type_color'),
    nextValue('acceptance_type'),
    nextValue('acceptance_name'),
    nextValue('planned_date'),
    nextValue('actual_date'),
    nextValue('status'),
    nextValue('phase'),
    nextValue('phase_order'),
    nextValue('sort_order'),
    nextValue('parallel_group_id'),
    nextValue('documents'),
    nextValue('notes'),
    nextValue('description'),
  ]

  try {
    await withDatabaseTransaction(async () => {
      let updateRows: unknown[] = [{ id }]
      if (Object.keys(updateBody).length > 0) {
        if (requestedStatusChange) {
          updateRows = await executeSQL(
            `UPDATE acceptance_plans SET building_id = ?, building_object_id = ?, scope_level = ?, participant_unit_id = ?, responsible_user_id = ?, catalog_id = ?, type_id = ?, type_name = ?, type_color = ?, acceptance_type = ?, acceptance_name = ?, planned_date = ?, actual_date = ?, status = ?, phase = ?, phase_order = ?, sort_order = ?, parallel_group_id = ?, documents = ?, notes = ?, description = ? WHERE id = ? AND project_id = ? AND status = ? RETURNING id`,
            [...updateValues, id, currentProjectId, current.status]
          )
        } else {
          updateRows = await executeSQL(
            `UPDATE acceptance_plans SET building_id = ?, building_object_id = ?, scope_level = ?, participant_unit_id = ?, responsible_user_id = ?, catalog_id = ?, type_id = ?, type_name = ?, type_color = ?, acceptance_type = ?, acceptance_name = ?, planned_date = ?, actual_date = ?, status = ?, phase = ?, phase_order = ?, sort_order = ?, parallel_group_id = ?, documents = ?, notes = ?, description = ? WHERE id = ? AND project_id = ?`,
            [...updateValues, id, currentProjectId]
          )
        }
      }

      if (requestedStatusChange && updateRows.length === 0) {
        throw new AcceptanceStatusConflictError()
      }
      if (coveredTaskIds) {
        await syncAcceptanceCoveredTaskLinks(id, currentProjectId, coveredTaskIds)
      }

      const observedAt = new Date().toISOString()
      const nextForFacts = {
        status: nextValue('status'),
        actual_date: nextValue('actual_date'),
      }
      if (
        nextForFacts.status !== (current as any).status
        || nextForFacts.actual_date !== ((current as any).actual_date ?? null)
      ) {
        await recordAcceptancePlanExecutionFacts({
          projectId: currentProjectId,
          planId: id,
          previous: current as Record<string, any>,
          next: nextForFacts,
          sourceMutationId: `acceptance_plan:${id}:update:${observedAt}`,
          observedAt,
          actorUserId: req.user?.id ?? null,
        })
      }
    })
  } catch (error) {
    if (!(error instanceof AcceptanceStatusConflictError)) throw error
    return res.status(409).json({
      success: false,
      error: {
        code: 'ACCEPTANCE_STATUS_CONFLICT',
        message: 'acceptance status changed while this request was being processed',
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse)
  }
  clearAcceptanceFlowSnapshotCache(currentProjectId)

  const updatedRow = await executeSQLOne<AcceptancePlan>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [id, currentProjectId]
  )
  const [data] = updatedRow ? await hydrateAcceptancePlanRows([updatedRow]) : []

  const response: ApiResponse<AcceptancePlan> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  if (data) {
    await runAcceptancePlanPostCommitEffects({
      previousPlan: current,
      nextPlan: data,
      sourceRoute: 'acceptance-plans.put',
      actorId: req.user?.id ?? null,
    })
  }
  res.json(response)
}))

router.patch('/:id/status', requireProjectEditor(async (req) => {
  const row = await executeSQLOne(
    'SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1',
    [req.params.id]
  ) as any
  return row?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status, actual_date } = req.body ?? {}
  const expectedStatus = normalizeText(req.body?.expected_status ?? req.body?.expectedStatus)
  logger.info('Updating acceptance plan status', { id, status })

  const currentRow = await executeSQLOne<AcceptancePlan>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? LIMIT 1`,
    [id]
  )

  if (!currentRow) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ACCEPTANCE_NOT_FOUND', message: 'acceptance plan not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  const [current] = await hydrateAcceptancePlanRows([currentRow])

  if (!status) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'status 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  if (expectedStatus) {
    const expected = parseAcceptanceStatus(expectedStatus)
    if (!expected) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'expected_status is invalid' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }
    if (expected !== parseAcceptanceStatus(current.status)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ACCEPTANCE_STATUS_CONFLICT',
          message: 'acceptance status changed while this request was being processed',
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse)
    }
  }

  const statusValidation = validateAcceptanceStatusTransition(
    current.status,
    status,
    actual_date
  )

  if (!statusValidation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'STATUS_TRANSITION_ERROR',
        message: statusValidation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const preconditionValidation = await validateAcceptanceStatusPreconditions(
    String((current as any)?.project_id ?? ''),
    id,
    statusValidation.normalizedStatus,
  )
  if (!preconditionValidation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'PRECONDITION_NOT_MET',
        message: preconditionValidation.errors.join('; '),
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const currentProjectId = String((current as any)?.project_id ?? '')
  const nextActualDate = actual_date !== undefined ? actual_date || null : ((current as any)?.actual_date ?? null)
  const observedAt = new Date().toISOString()
  const mutation = await withDatabaseTransaction(async () => {
    const updateRows = await executeSQL(
      'UPDATE acceptance_plans SET status = ?, actual_date = ?, updated_at = ? WHERE id = ? AND project_id = ? AND status = ? RETURNING id',
      [statusValidation.normalizedStatus, nextActualDate, observedAt, id, currentProjectId, current.status]
    )
    if (updateRows.length === 0) return { kind: 'conflict' as const }

    await recordAcceptancePlanExecutionFacts({
      projectId: currentProjectId,
      planId: id,
      previous: current as Record<string, any>,
      next: {
        status: statusValidation.normalizedStatus,
        actual_date: nextActualDate,
      },
      sourceMutationId: `acceptance_plan:${id}:status:${observedAt}`,
      observedAt,
      actorUserId: req.user?.id ?? null,
    })
    return { kind: 'ok' as const }
  })
  if (mutation.kind === 'conflict') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'ACCEPTANCE_STATUS_CONFLICT',
        message: 'acceptance status changed while this request was being processed',
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse)
  }
  clearAcceptanceFlowSnapshotCache(currentProjectId)

  const updatedRow = await executeSQLOne<AcceptancePlan>(
    `${ACCEPTANCE_PLAN_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [id, currentProjectId]
  )
  const [data] = updatedRow ? await hydrateAcceptancePlanRows([updatedRow]) : []

  const response: ApiResponse<AcceptancePlan> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  if (data) {
    await runAcceptancePlanPostCommitEffects({
      previousPlan: current,
      nextPlan: data,
      sourceRoute: 'acceptance-plans.patch-status',
      actorId: req.user?.id ?? null,
    })
  }
  res.json(response)
}))

// 删除验收计划
router.delete('/:id', requireProjectEditor(async (req) => {
  const row = await executeSQLOne(
    'SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1',
    [req.params.id]
  ) as any
  return row?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting acceptance plan', { id })

  const current = await executeSQLOne<{ project_id?: string | null }>(
    'SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1',
    [id],
  )
  const activeLinks = current?.project_id
    ? await listActiveEntityLinksForEntity({
      projectId: String(current.project_id),
      entityType: 'acceptance_plan',
      entityId: id,
      roles: ['source'],
    })
    : []

  if (activeLinks.length > 0) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'ACCEPTANCE_PLAN_LINKED',
        message: 'acceptance plan still has active task or condition links; remove or archive links before deletion',
        details: { activeLinkCount: activeLinks.length },
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(422).json(response)
  }

  const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
  const retention = await enforceRetentionOrBlock({
    entityType: 'acceptance_plan',
    entityId: id,
    projectId: current?.project_id ?? null,
    userId: req.user?.id ?? null,
    userAction: 'delete',
  })
  if (retention.blocked) {
    return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({
      success: false,
      error: buildRetentionBlockedApiError(retention.reason, retention.result),
      timestamp: new Date().toISOString(),
    })
  }

  await executeSQL('DELETE FROM acceptance_plans WHERE id = ? AND project_id = ?', [id, String(current?.project_id ?? '')])
  clearAcceptanceFlowSnapshotCache(String(current?.project_id ?? ''))

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
