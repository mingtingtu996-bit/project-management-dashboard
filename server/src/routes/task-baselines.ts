import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validateIdParam } from '../middleware/validation.js'
import { supabase } from '../services/dbService.js'
import { PlanningBootstrapService, buildBaselineSeedFromProject } from '../services/planningBootstrap.js'
import { planningStateMachine, PlanningStateTransitionError } from '../services/planningStateMachine.js'
import {
  PlanningDraftLockService,
  PlanningDraftLockServiceError,
} from '../services/planningDraftLockService.js'
import {
  evaluateBaselinePublishReadiness,
  evaluateProjectBaselineValidity,
  listRevisionPoolCandidates,
  PlanningRevisionPoolServiceError,
  startRevisionFromBaseline,
  submitObservationPoolItems,
} from '../services/planningRevisionPoolService.js'
import { writeLog } from '../services/changeLogs.js'
import { annotateBaselineCriticalItems, syncBaselineCriticalFlagsToTasks } from '../services/baselineGovernanceService.js'
import type { ApiResponse } from '../types/index.js'
import type {
  ObservationPoolReadResponse,
  ObservationPoolSubmitRequest,
  ObservationPoolSubmitResponse,
  PlanningTransitionContext,
  RevisionSubmitResponse,
} from '../types/planning.js'
import type { Milestone, PlanningDraftLockRecord, Task, TaskBaseline, TaskBaselineItem } from '../types/db.js'

const router = Router()
const draftLockService = new PlanningDraftLockService()
const MAX_CREATE_ATTEMPTS = 3

type UniqueConstraintErrorLike = {
  code?: string
  message?: string
}

type TaskBaselineVersionRow = {
  version?: number | string | null
}

type TaskBaselineRowInput = Partial<TaskBaseline>

type TaskBaselineItemInput = Partial<TaskBaselineItem> & {
  id?: string
  name?: string | null
}

type BaselineConditionRow = {
  is_satisfied?: boolean | number | string | null
  status?: string | null
}

type BaselineObstacleRow = {
  status?: string | null
}

router.use(authenticate)

function badRequest(message: string, code = 'VALIDATION_ERROR') {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  }
}

function normalizeBaselineRow(
  row: TaskBaselineRowInput,
  items: TaskBaselineItem[] = [],
): TaskBaseline & { items: TaskBaselineItem[] } {
  return {
    ...(row as TaskBaseline),
    items,
  }
}

function mapBaselineItem(
  row: TaskBaselineItemInput,
  baselineVersionId: string,
  projectId: string,
  index: number,
): TaskBaselineItem {
  return {
    id: String(row.id ?? uuidv4()),
    project_id: projectId,
    baseline_version_id: baselineVersionId,
    parent_item_id: row.parent_item_id ?? null,
    source_task_id: row.source_task_id ?? null,
    source_milestone_id: row.source_milestone_id ?? null,
    title: String(row.title ?? row.name ?? `基线条目 ${index + 1}`),
    planned_start_date: row.planned_start_date ?? null,
    planned_end_date: row.planned_end_date ?? null,
    target_progress: row.target_progress ?? null,
    sort_order: Number(row.sort_order ?? index),
    is_milestone: Boolean(row.is_milestone),
    is_critical: Boolean(row.is_critical),
    is_baseline_critical: Boolean(row.is_baseline_critical),
    mapping_status: row.mapping_status ?? 'mapped',
    notes: row.notes ?? null,
    template_id: row.template_id ?? null,
    template_node_id: row.template_node_id ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as UniqueConstraintErrorLike
  const message = String(candidate.message ?? '')
  return candidate.code === '23505' || /duplicate key|unique constraint/i.test(message)
}

async function getLatestVersion(projectId: string): Promise<number> {
  const { data, error } = await supabase
    .from('task_baselines')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  if (error) throw error
  const latest = (data?.[0] as TaskBaselineVersionRow | undefined)?.version
  return Number(latest ?? 0)
}

async function getBaselineItems(baselineId: string): Promise<TaskBaselineItem[]> {
  const { data, error } = await supabase
    .from('task_baseline_items')
    .select('*')
    .eq('baseline_version_id', baselineId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as TaskBaselineItem[]
}

function getBaselineCompareKey(item: Pick<TaskBaselineItem, 'source_task_id' | 'source_milestone_id' | 'title'>) {
  return item.source_task_id?.trim() || item.source_milestone_id?.trim() || item.title.trim()
}

function summarizeBaselineDiff(currentItems: TaskBaselineItem[], previousItems: TaskBaselineItem[]) {
  const previousByKey = new Map(previousItems.map((item) => [getBaselineCompareKey(item), item]))
  const matchedKeys = new Set<string>()

  let modifiedItemCount = 0
  let milestoneChangeCount = 0
  let criticalPathChangeCount = 0
  let mappingAffectedCount = 0

  for (const current of currentItems) {
    const key = getBaselineCompareKey(current)
    const previous = previousByKey.get(key)

    if (!previous) {
      modifiedItemCount += 1
      if (current.is_critical) {
        criticalPathChangeCount += 1
      }
      if (current.mapping_status && current.mapping_status !== 'mapped') {
        mappingAffectedCount += 1
      }
      continue
    }

    matchedKeys.add(key)

    const isModified =
      previous.title !== current.title ||
      previous.planned_start_date !== current.planned_start_date ||
      previous.planned_end_date !== current.planned_end_date ||
      previous.target_progress !== current.target_progress ||
      previous.mapping_status !== current.mapping_status ||
      previous.is_critical !== current.is_critical

    const isMilestoneChange =
      Boolean(current.is_milestone || previous.is_milestone) &&
      previous.planned_end_date !== current.planned_end_date

    const affectsCriticalPath =
      Boolean(current.is_critical || previous.is_critical) ||
      isMilestoneChange ||
      previous.mapping_status !== current.mapping_status

    const mappingAffected =
      previous.mapping_status !== current.mapping_status ||
      current.mapping_status === 'missing' ||
      previous.mapping_status === 'missing'

    if (isModified) modifiedItemCount += 1
    if (isMilestoneChange) milestoneChangeCount += 1
    if (affectsCriticalPath) criticalPathChangeCount += 1
    if (mappingAffected) mappingAffectedCount += 1
  }

  for (const previous of previousItems) {
    const key = getBaselineCompareKey(previous)
    if (matchedKeys.has(key)) continue
    modifiedItemCount += 1
    if (previous.is_critical) {
      criticalPathChangeCount += 1
    }
    if (previous.mapping_status && previous.mapping_status !== 'mapped') {
      mappingAffectedCount += 1
    }
  }

  return {
    modifiedItemCount,
    milestoneChangeCount,
    criticalPathChangeCount,
    mappingAffectedCount,
  }
}

async function getComparisonBaseline(projectId: string, currentBaselineId: string) {
  const baselines = await listProjectBaselines(projectId)
  return (
    baselines
      .filter((baseline) => baseline.id !== currentBaselineId && baseline.status === 'confirmed')
      .sort((left, right) => right.version - left.version)[0] ?? null
  )
}

async function evaluateRuntimeBaselineValidity(projectId: string, items: TaskBaselineItem[]) {
  const taskIds = Array.from(new Set(items.map((item) => item.source_task_id).filter(Boolean))) as string[]
  const milestoneIds = Array.from(new Set(items.map((item) => item.source_milestone_id).filter(Boolean))) as string[]
  const emptyResult = { data: [], error: null } as const

  const [taskResult, milestoneResult] = await Promise.all([
    taskIds.length > 0
      ? supabase
          .from('tasks')
          .select('id, project_id, planned_start_date, planned_end_date, start_date, end_date')
          .eq('project_id', projectId)
          .in('id', taskIds)
      : Promise.resolve(emptyResult),
    milestoneIds.length > 0
      ? supabase
          .from('milestones')
          .select('id, project_id, baseline_date, current_plan_date')
          .eq('project_id', projectId)
          .in('id', milestoneIds)
      : Promise.resolve(emptyResult),
  ])

  if (taskResult.error) throw taskResult.error
  if (milestoneResult.error) throw milestoneResult.error

  return evaluateProjectBaselineValidity({
    baselineItems: items,
    tasks: (taskResult.data ?? []) as Array<{
      id: string
      planned_start_date?: string | null
      planned_end_date?: string | null
      start_date?: string | null
      end_date?: string | null
    }>,
    milestones: (milestoneResult.data ?? []) as Array<{
      id: string
      baseline_date?: string | null
      current_plan_date?: string | null
    }>,
  })
}

function buildBaselineValidityMessage(validity: {
  deviatedTaskRatio: number
  shiftedMilestoneCount: number
  averageMilestoneShiftDays: number
  totalDurationDeviationRatio: number
  triggeredRules: string[]
}) {
  const ruleLabels: Record<string, string> = {
    task_deviation_ratio: '任务偏差率超过 40%',
    milestone_shift: '里程碑偏移达到 3 个且平均偏移超过 30 天',
    duration_deviation: '总工期偏差超过 10%',
  }
  const triggeredSummary = validity.triggeredRules
    .map((rule) => ruleLabels[rule] ?? rule)
    .join('、')

  return `当前基线有效性已触发待重整阈值：任务偏差率 ${Math.round(
    validity.deviatedTaskRatio * 100,
  )}%，里程碑偏移 ${validity.shiftedMilestoneCount} 个、平均 ${Math.round(
    validity.averageMilestoneShiftDays,
  )} 天，总工期偏差 ${Math.round(validity.totalDurationDeviationRatio * 100)}%。触发规则：${triggeredSummary}。请先发起重排或修订后再确认。`
}

async function persistBaselineItems(
  baselineId: string,
  projectId: string,
  items: TaskBaselineItemInput[] | undefined,
): Promise<TaskBaselineItem[]> {
  if (!Array.isArray(items) || items.length === 0) return []

  const payload = items.map((item, index) => mapBaselineItem(item, baselineId, projectId, index))
  const { data, error } = await supabase.from('task_baseline_items').insert(payload).select('*')
  if (error) throw error
  return (data ?? []) as TaskBaselineItem[]
}

async function cleanupBaselineDraft(baselineId: string) {
  const [{ error: itemsError }, { error: baselineError }] = await Promise.all([
    supabase.from('task_baseline_items').delete().eq('baseline_version_id', baselineId),
    supabase.from('task_baselines').delete().eq('id', baselineId),
  ])

  if (itemsError) {
    logger.warn('[task-baselines] failed to cleanup draft items', { baselineId, error: itemsError.message })
  }
  if (baselineError) {
    logger.warn('[task-baselines] failed to cleanup draft version', { baselineId, error: baselineError.message })
  }
}

async function getBaselineRecord(id: string) {
  const { data, error } = await supabase.from('task_baselines').select('*').eq('id', id).limit(1)
  if (error) throw error
  return (data?.[0] as TaskBaseline | undefined) ?? null
}

async function listProjectBaselines(projectId: string): Promise<TaskBaseline[]> {
  const { data, error } = await supabase.from('task_baselines').select('*').eq('project_id', projectId)
  if (error) throw error
  return (data ?? []) as TaskBaseline[]
}

async function archiveSupersededBaselines(params: {
  projectId: string
  keepId: string
  actorUserId?: string | null
}) {
  const baselines = await listProjectBaselines(params.projectId)
  const archivedCandidates = baselines.filter(
    (baseline) =>
      baseline.id !== params.keepId && ['confirmed', 'pending_realign'].includes(String(baseline.status ?? '')),
  )

  if (archivedCandidates.length === 0) {
    return
  }

  const archivedAt = new Date().toISOString()
  const candidateIds = archivedCandidates.map((baseline) => baseline.id)
  const { error } = await supabase
    .from('task_baselines')
    .update({
      status: 'archived',
      updated_at: archivedAt,
    })
    .in('id', candidateIds)

  if (error) throw error

  await Promise.all(
    archivedCandidates.map((baseline) =>
      writeLog({
        project_id: baseline.project_id,
    entity_type: 'baseline',
        entity_id: baseline.id,
        field_name: 'status',
        old_value: baseline.status,
        new_value: 'archived',
        changed_by: params.actorUserId ?? null,
        change_source: 'manual_adjusted',
      }),
    ),
  )
}

async function countProjectBlockingIssues(projectId: string): Promise<number> {
  const [conditionResult, obstacleResult] = await Promise.all([
    supabase.from('task_conditions').select('id,is_satisfied').eq('project_id', projectId),
    supabase.from('task_obstacles').select('id,status').eq('project_id', projectId),
  ])

  if (conditionResult.error) throw conditionResult.error
  if (obstacleResult.error) throw obstacleResult.error

  const pendingConditions = (conditionResult.data ?? []).filter((row: BaselineConditionRow) => {
    if (row.is_satisfied !== null && row.is_satisfied !== undefined) {
      return !Boolean(row.is_satisfied)
    }

    const status = String(row.status ?? '').trim()
    if (!status) return true
    return !['已满足', '已确认', 'completed', 'satisfied', 'confirmed'].includes(status)
  }).length

  const activeObstacles = (obstacleResult.data ?? []).filter((row: BaselineObstacleRow) => {
    const status = String(row.status ?? '').trim()
    return !['resolved', 'closed', '已解决'].includes(status)
  }).length

  return pendingConditions + activeObstacles
}

async function buildTransitionContext(projectId: string, expectedVersion: number): Promise<PlanningTransitionContext> {
  const blockingIssueCount = await countProjectBlockingIssues(projectId)
  return {
    version: expectedVersion,
    expected_version: expectedVersion,
    blocking_issue_count: blockingIssueCount,
    has_blocking_issues: blockingIssueCount > 0,
  }
}

async function createBaselineVersion(params: {
  projectId: string
  title: string
  description?: string | null
  sourceType?: TaskBaseline['source_type']
  sourceVersionId?: string | null
  sourceVersionLabel?: string | null
  effectiveFrom?: string | null
  effectiveTo?: string | null
  items?: TaskBaselineItemInput[]
}) {
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const version = (await getLatestVersion(params.projectId)) + 1
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('task_baselines')
      .insert({
        id: uuidv4(),
        project_id: params.projectId,
        version,
        status: 'draft',
        title: params.title,
        description: params.description ?? null,
        source_type: params.sourceType ?? 'current_schedule',
        source_version_id: params.sourceVersionId ?? null,
        source_version_label: params.sourceVersionLabel ?? null,
        effective_from: params.effectiveFrom ?? null,
        effective_to: params.effectiveTo ?? null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single()

    if (error) {
      if (isUniqueConstraintError(error) && attempt < MAX_CREATE_ATTEMPTS - 1) {
        continue
      }
      throw error
    }

    try {
      const createdBaseline = data as TaskBaseline
      const items = await persistBaselineItems(createdBaseline.id, params.projectId, params.items)
      const comparisonBaseline = await getComparisonBaseline(params.projectId, createdBaseline.id)
      const comparisonItems = comparisonBaseline ? await getBaselineItems(comparisonBaseline.id) : []
      const summary = summarizeBaselineDiff(items, comparisonItems)
      return normalizeBaselineRow({ ...createdBaseline, ...summary }, items)
    } catch (itemError) {
      await cleanupBaselineDraft((data as TaskBaseline).id)
      throw itemError
    }
  }

  throw new Error('创建基线版本失败，请稍后重试')
}

function mapPlanningTransitionError(error: unknown) {
  if (error instanceof PlanningStateTransitionError) {
    return error
  }
  return null
}

router.post(
  '/bootstrap/from-schedule',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.project_id ?? req.body?.projectId ?? '').trim()
    if (!projectId) {
      return res.status(400).json(badRequest('project_id 不能为空'))
    }

    const bootstrapService = new PlanningBootstrapService()
    const [projectResult, tasksResult, milestonesResult] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, status, project_type, building_type, planned_start_date, start_date, actual_start_date, current_phase, default_wbs_generated')
        .eq('id', projectId)
        .limit(1),
      supabase
        .from('tasks')
        .select('id, parent_id, title, description, reference_duration, ai_duration, is_milestone, template_id, template_node_id')
        .eq('project_id', projectId),
      supabase
        .from('milestones')
        .select('id, title, description')
        .eq('project_id', projectId),
    ])

    if (projectResult.error) throw projectResult.error
    if (tasksResult.error) throw tasksResult.error
    if (milestonesResult.error) throw milestonesResult.error

    const project = (projectResult.data?.[0] as Record<string, any> | undefined) ?? null
    if (!project) {
      return res.status(404).json(badRequest('项目不存在', 'NOT_FOUND'))
    }

    const tasks = (tasksResult.data ?? []) as Array<Partial<Task> & Record<string, any>>
    const milestones = (milestonesResult.data ?? []) as Array<Partial<Milestone> & Record<string, any>>
    const nodes = bootstrapService.buildProjectNodes({
      project: project as any,
      tasks,
      milestones,
    })
    const seed = buildBaselineSeedFromProject({
      project: project as any,
      nodes,
    })

    const baseline = await createBaselineVersion({
      projectId,
      title: seed.title,
      description: seed.description,
      sourceType: 'current_schedule',
      sourceVersionLabel: seed.source_version_label,
      items: seed.items,
    })

    const response: ApiResponse = {
      success: true,
      data: {
        path: 'ongoing_project_to_baseline',
        baseline,
        created_item_count: baseline.items.length,
        project_id: projectId,
        needs_mapping_review: true,
      },
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  })
)

router.get(
  '/',
  requireProjectMember((req) => req.query.project_id as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = req.query.project_id as string | undefined
    const { data, error } = await supabase
      .from('task_baselines')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = (data ?? []) as TaskBaseline[]
    const filtered = projectId ? rows.filter((row) => row.project_id === projectId) : rows
    const response: ApiResponse<TaskBaseline[]> = {
      success: true,
      data: filtered,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.get(
  '/:id',
  validateIdParam,
  requireProjectMember((req) => req.query.project_id as string | undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    const items = await getBaselineItems(id)
    const comparisonBaseline = await getComparisonBaseline(baseline.project_id, baseline.id)
    const comparisonItems = comparisonBaseline ? await getBaselineItems(comparisonBaseline.id) : []
    const summary = summarizeBaselineDiff(items, comparisonItems)
    const response: ApiResponse<TaskBaseline & { items: TaskBaselineItem[] }> = {
      success: true,
      data: normalizeBaselineRow({ ...baseline, ...summary }, items),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/',
  requireProjectEditor((req) => req.body?.project_id),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.project_id ?? '').trim()
    const title = String(req.body?.title ?? '').trim() || '项目基线'
    if (!projectId) {
      return res.status(400).json(badRequest('project_id 不能为空'))
    }

    const baseline = await createBaselineVersion({
      projectId,
      title,
      description: req.body?.description ?? null,
      sourceType: req.body?.source_type ?? 'current_schedule',
      sourceVersionId: req.body?.source_version_id ?? null,
      sourceVersionLabel: req.body?.source_version_label ?? null,
      effectiveFrom: req.body?.effective_from ?? null,
      effectiveTo: req.body?.effective_to ?? null,
      items: req.body?.items,
    })

    const response: ApiResponse<TaskBaseline & { items: TaskBaselineItem[] }> = {
      success: true,
      data: baseline,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  })
)

router.post(
  '/:id/confirm',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const version = Number(req.body?.version)
    if (!Number.isFinite(version)) {
      return res.status(400).json(badRequest('version 不能为空'))
    }

    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    if (baseline.version !== version) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }

    try {
      await draftLockService.acquireDraftLock({
        projectId: baseline.project_id,
        draftType: 'baseline',
        resourceId: id,
        actorUserId: req.user?.id ?? 'system',
      })
    } catch (error: unknown) {
      if (error instanceof PlanningDraftLockServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }

    try {
      let items = await getBaselineItems(id)
      const readiness = evaluateBaselinePublishReadiness(items)
      if (!readiness.isReady) {
        return res.status(422).json(
          badRequest(
            `基线发布准备度未达阈值：计划日期完整率 ${Math.round(readiness.scheduledRatio * 100)}%，映射完整率 ${Math.round(readiness.mappedRatio * 100)}%`,
            'VALIDATION_ERROR',
          ),
        )
      }
      const validity = await evaluateRuntimeBaselineValidity(baseline.project_id, items)
      if (validity.state === 'needs_realign') {
        return res
          .status(422)
          .json(badRequest(buildBaselineValidityMessage(validity), 'REQUIRES_REALIGNMENT'))
      }

      const transitionContext = await buildTransitionContext(baseline.project_id, version)
      const transitionEvent = baseline.status === 'revising' ? 'SUBMIT_REVISION' : 'CONFIRM'
      const nextStatus = planningStateMachine.transition(baseline.status, transitionEvent, {
        ...transitionContext,
        revision_ready: transitionEvent === 'SUBMIT_REVISION' ? true : undefined,
      })
      const confirmedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('task_baselines')
        .update({
          status: nextStatus,
          confirmed_at: confirmedAt,
          confirmed_by: req.user?.id ?? null,
          updated_at: confirmedAt,
        })
        .eq('id', id)
        .select('*')
        .single()

      if (error) throw error

      await writeLog({
        project_id: baseline.project_id,
        entity_type: 'baseline',
        entity_id: id,
        field_name: 'status',
        old_value: baseline.status,
        new_value: nextStatus,
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })

      if (nextStatus === 'confirmed') {
        items = await annotateBaselineCriticalItems(baseline, items)
        await syncBaselineCriticalFlagsToTasks(baseline.project_id, items, req.user?.id ?? null)
        await archiveSupersededBaselines({
          projectId: baseline.project_id,
          keepId: id,
          actorUserId: req.user?.id ?? null,
        })
      }

      const response: ApiResponse<TaskBaseline & { items: TaskBaselineItem[] }> = {
        success: true,
        data: normalizeBaselineRow(data, items),
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      const planningError = mapPlanningTransitionError(error)
      if (planningError) {
        return res.status(409).json(badRequest(planningError.message, planningError.code))
      }
      throw error
    } finally {
      try {
        await draftLockService.releaseDraftLock({
          projectId: baseline.project_id,
          draftType: 'baseline',
          resourceId: id,
          actorUserId: req.user?.id ?? 'system',
          actorRole: await draftLockService.getProjectRole(baseline.project_id, req.user?.id ?? 'system'),
          reason: 'manual_release',
        })
      } catch (error) {
        if (!(error instanceof PlanningDraftLockServiceError) || error.code !== 'NOT_FOUND') {
          logger.warn('[task-baselines] failed to release draft lock after confirm', { baselineId: id, error })
        }
      }
    }
  })
)

router.post(
  '/:id/queue-realignment',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const version = Number(req.body?.version)
    if (!Number.isFinite(version)) {
      return res.status(400).json(badRequest('version 不能为空'))
    }

    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    if (baseline.version !== version) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }

    try {
      const nextStatus = planningStateMachine.transition(baseline.status, 'QUEUE_REALIGNMENT', {
        realignment_required: true,
      })
      const updatedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('task_baselines')
        .update({
          status: nextStatus,
          updated_at: updatedAt,
        })
        .eq('id', id)
        .select('*')
        .single()

      if (error) throw error

      await writeLog({
        project_id: baseline.project_id,
        entity_type: 'baseline',
        entity_id: id,
        field_name: 'status',
        old_value: baseline.status,
        new_value: nextStatus,
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })

      const items = await getBaselineItems(id)
      const response: ApiResponse<TaskBaseline & { items: TaskBaselineItem[] }> = {
        success: true,
        data: normalizeBaselineRow(data, items),
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      const planningError = mapPlanningTransitionError(error)
      if (planningError) {
        return res.status(409).json(badRequest(planningError.message, planningError.code))
      }
      throw error
    }
  })
)

router.post(
  '/:id/resolve-realignment',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const version = Number(req.body?.version)
    if (!Number.isFinite(version)) {
      return res.status(400).json(badRequest('version 不能为空'))
    }

    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    if (baseline.version !== version) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }

    try {
      const nextStatus = planningStateMachine.transition(baseline.status, 'RESOLVE_REALIGNMENT', {
        realignment_resolved: true,
      })
      const updatedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('task_baselines')
        .update({
          status: nextStatus,
          updated_at: updatedAt,
        })
        .eq('id', id)
        .select('*')
        .single()

      if (error) throw error

      await writeLog({
        project_id: baseline.project_id,
        entity_type: 'baseline',
        entity_id: id,
        field_name: 'status',
        old_value: baseline.status,
        new_value: nextStatus,
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })

      const items = await getBaselineItems(id)
      const response: ApiResponse<TaskBaseline & { items: TaskBaselineItem[] }> = {
        success: true,
        data: normalizeBaselineRow(data, items),
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      const planningError = mapPlanningTransitionError(error)
      if (planningError) {
        return res.status(409).json(badRequest(planningError.message, planningError.code))
      }
      throw error
    }
  })
)

router.get(
  '/:id/revision-pool',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const baseline = await getBaselineRecord(req.params.id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    const data = await listRevisionPoolCandidates(baseline.id)
    const response: ApiResponse<ObservationPoolReadResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/:id/revision-pool',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const baseline = await getBaselineRecord(req.params.id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    try {
      const data = await submitObservationPoolItems({
        baseline,
        payload: {
          project_id: baseline.project_id,
          baseline_version_id: baseline.id,
          items: Array.isArray(req.body?.items) ? req.body.items : [],
        } satisfies ObservationPoolSubmitRequest,
      })

      const response: ApiResponse<ObservationPoolSubmitResponse> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      res.status(201).json(response)
    } catch (error) {
      if (error instanceof PlanningRevisionPoolServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }
  })
)

router.post(
  '/:id/revisions',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const baseline = await getBaselineRecord(req.params.id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    try {
      const data: RevisionSubmitResponse = await startRevisionFromBaseline({
        baseline,
        actorUserId: req.user?.id ?? null,
        reason: String(req.body?.reason ?? '').trim() || 'manual_revision',
        sourceCandidateIds: Array.isArray(req.body?.source_candidate_ids)
          ? req.body.source_candidate_ids.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
          : Array.isArray(req.body?.sourceCandidateIds)
            ? req.body.sourceCandidateIds.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
            : undefined,
      })

      const response: ApiResponse<RevisionSubmitResponse> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      res.status(201).json(response)
    } catch (error) {
      if (error instanceof PlanningRevisionPoolServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }
  })
)

router.get(
  '/:id/lock',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    const lock = await draftLockService.getDraftLock(baseline.project_id, 'baseline', id)
    if (!lock) {
      return res.status(404).json(badRequest('草稿锁不存在', 'NOT_FOUND'))
    }

    const response: ApiResponse<{ lock: PlanningDraftLockRecord }> = {
      success: true,
      data: { lock },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/:id/lock',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    try {
      const lock = await draftLockService.acquireDraftLock({
        projectId: baseline.project_id,
        draftType: 'baseline',
        resourceId: id,
        actorUserId: req.user?.id ?? 'system',
      })
      const response: ApiResponse<{ lock: PlanningDraftLockRecord }> = {
        success: true,
        data: { lock },
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error: unknown) {
      if (error instanceof PlanningDraftLockServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }
  })
)

router.post(
  '/:id/force-unlock',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    try {
      const lock = await draftLockService.forceUnlockDraftLock({
        projectId: baseline.project_id,
        draftType: 'baseline',
        resourceId: id,
        actorUserId: req.user?.id ?? 'system',
        reason: req.body?.reason ?? 'manual_release',
      })
      const response: ApiResponse<{ lock: PlanningDraftLockRecord }> = {
        success: true,
        data: { lock },
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error: unknown) {
      if (error instanceof PlanningDraftLockServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }
  })
)

export default router
