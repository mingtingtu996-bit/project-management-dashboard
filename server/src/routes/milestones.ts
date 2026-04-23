import { Router } from 'express'
import { SupabaseService } from '../services/supabaseService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  validate,
  validateIdParam,
  milestoneSchema,
  milestoneUpdateSchema,
} from '../middleware/validation.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Milestone } from '../types/db.js'
import type { MilestonePlanningReadModel } from '../types/planning.js'

const router = Router()
const supabase = new SupabaseService()

router.use(authenticate)

function normalizeDate(value?: string | null): string | null {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  return trimmed.slice(0, 10)
}

function normalizeCompletionRate(row: Partial<Milestone> & Record<string, any>): number {
  const explicit = row.completion_rate ?? row.progress
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return Math.max(0, Math.min(100, explicit))
  }

  const status = String(row.status ?? '').trim().toLowerCase()
  if (status === 'completed' || status === '已完成') {
    return 100
  }

  return 0
}

export function buildMilestonePlanningReadModel(
  milestone: Partial<Milestone> & Record<string, any>
): MilestonePlanningReadModel {
  const title = String(milestone.title ?? milestone.name ?? '未命名里程碑').trim() || '未命名里程碑'
  const targetDate = normalizeDate(milestone.target_date ?? milestone.planned_end_date ?? milestone.end_date)
  const baselineDate = normalizeDate(milestone.baseline_date ?? targetDate)
  const currentPlanDate = normalizeDate(milestone.current_plan_date ?? baselineDate ?? targetDate)
  const actualDate = normalizeDate(milestone.actual_date ?? milestone.completed_at ?? milestone.actual_end_date)

  return {
    id: String(milestone.id ?? ''),
    project_id: String(milestone.project_id ?? ''),
    name: title,
    title,
    target_date: targetDate,
    baseline_date: baselineDate,
    current_plan_date: currentPlanDate,
    actual_date: actualDate,
    completed_at: normalizeDate(milestone.completed_at ?? milestone.actual_end_date),
    status: String(milestone.status ?? 'pending'),
    completion_rate: normalizeCompletionRate(milestone),
    timeline_source: {
      baseline: milestone.baseline_date ? 'baseline_date' : targetDate ? 'target_date' : 'none',
      current_plan: milestone.current_plan_date
        ? 'current_plan_date'
        : milestone.baseline_date
          ? 'baseline_date'
          : targetDate
            ? 'target_date'
            : 'none',
      actual: milestone.actual_date
        ? 'actual_date'
        : milestone.completed_at || milestone.actual_end_date
          ? 'completed_at'
          : 'none',
    },
  }
}

function notFound(res: any) {
  const response: ApiResponse = {
    success: false,
    error: { code: 'MILESTONE_NOT_FOUND', message: '里程碑不存在' },
    timestamp: new Date().toISOString(),
  }
  return res.status(404).json(response)
}

router.get(
  '/',
  requireProjectMember(req => req.query.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId as string | undefined
    logger.info('Fetching milestones', { projectId })

    const milestones = await supabase.getMilestones(projectId)
    const planningMilestones = milestones.map((milestone) =>
      buildMilestonePlanningReadModel(milestone as any)
    )

    const response: ApiResponse<MilestonePlanningReadModel[]> = {
      success: true,
      data: planningMilestones,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.get(
  '/:id/planning',
  validateIdParam,
  requireProjectMember(async (req) => {
    const milestone = await supabase.getMilestone(req.params.id)
    return milestone?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    logger.info('Fetching milestone planning read model', { id })

    const milestone = await supabase.getMilestone(id)
    if (!milestone) return notFound(res)

    const response: ApiResponse<MilestonePlanningReadModel> = {
      success: true,
      data: buildMilestonePlanningReadModel(milestone as any),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.get(
  '/:id',
  validateIdParam,
  requireProjectMember(async (req) => {
    const milestone = await supabase.getMilestone(req.params.id)
    return milestone?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    logger.info('Fetching milestone', { id })

    const milestone = await supabase.getMilestone(id)
    if (!milestone) return notFound(res)

    const response: ApiResponse<MilestonePlanningReadModel> = {
      success: true,
      data: buildMilestonePlanningReadModel(milestone as any),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/',
  requireProjectEditor(req => req.body.project_id),
  validate(milestoneSchema),
  asyncHandler(async (req, res) => {
    logger.info('Creating milestone', req.body)

    const milestone = await supabase.createMilestone({
      ...req.body,
      version: 1,
    })

    const response: ApiResponse<MilestonePlanningReadModel> = {
      success: true,
      data: buildMilestonePlanningReadModel(milestone as any),
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  })
)

router.put(
  '/:id',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const milestone = await supabase.getMilestone(req.params.id)
    return milestone?.project_id
  }),
  validate(milestoneUpdateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { version, ...updates } = req.body

    logger.info('Updating milestone', { id, version })

    try {
      const milestone = await supabase.updateMilestone(id, updates, version)

      if (!milestone) {
        return notFound(res)
      }

      const response: ApiResponse<MilestonePlanningReadModel> = {
        success: true,
        data: buildMilestonePlanningReadModel(milestone as any),
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error: any) {
      if (error.message === 'VERSION_MISMATCH') {
        const response: ApiResponse = {
          success: false,
          error: { code: 'VERSION_MISMATCH', message: '数据已被修改，请刷新后重试' },
          timestamp: new Date().toISOString(),
        }
        return res.status(409).json(response)
      }
      throw error
    }
  })
)

router.delete(
  '/:id',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const milestone = await supabase.getMilestone(req.params.id)
    return milestone?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    logger.info('Deleting milestone', { id })

    await supabase.deleteMilestone(id)

    const response: ApiResponse = {
      success: true,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

export default router
