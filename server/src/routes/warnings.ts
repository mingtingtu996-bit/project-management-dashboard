// 预警API路由 - Phase 2

import { Router } from 'express'
import { WarningService } from '../services/warningService.js'
import { supabase } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { z } from 'zod'
import type { ApiResponse } from '../types/index.js'
import type { Warning } from '../types/db.js'
import {
  applyWarningAcknowledgments,
  closeWarningNotification,
  isProtectedWarning,
  loadAcknowledgedWarningsForUser,
} from '../services/upgradeChainService.js'
import {
  formatMuteDurationMessage,
  getAllowedMuteHours,
  hasExplicitMuteDurationInRequest,
  parseMuteHoursFromRequest,
} from '../utils/muteDuration.js'

const router = Router()
router.use(authenticate)
const warningService = new WarningService()

const warningIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
})

const warningProjectQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
}).passthrough()

const warningsListQuerySchema = warningProjectQuerySchema.extend({
  status: z.enum(['acknowledged', 'unacknowledged']).optional(),
  includeResolved: z.union([z.string(), z.number(), z.boolean()]).optional(),
  include_resolved: z.union([z.string(), z.number(), z.boolean()]).optional(),
}).passthrough()

/**
 * 获取预警列表
 * GET /api/warnings?projectId=xxx&status=acknowledged
 */
router.get('/', validate(warningsListQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined
  const status = req.query.status as string | undefined
  const includeResolved = ['1', 'true', 'yes', 'on'].includes(
    String(req.query.includeResolved ?? req.query.include_resolved ?? '').trim().toLowerCase(),
  )

  logger.info('Fetching warnings', { projectId, status, includeResolved })

  await warningService.syncConditionExpiredIssues(projectId)
  await warningService.syncAcceptanceExpiredIssues(projectId)
  await warningService.autoEscalateWarnings(projectId)
  await warningService.autoEscalateRisksToIssues(projectId)
  const warnings = await warningService.syncActiveWarnings(projectId)
  const acknowledgedWarnings = await loadAcknowledgedWarningsForUser(req.user!.id, projectId)
  const effectiveWarnings = applyWarningAcknowledgments(warnings, acknowledgedWarnings)

  // 筛选状态
  let filteredWarnings = includeResolved
    ? effectiveWarnings
    : effectiveWarnings.filter((warning) => warning.status !== 'resolved' && warning.status !== 'closed')
  if (status === 'acknowledged') {
    filteredWarnings = filteredWarnings.filter((warning) => warning.is_acknowledged)
  } else if (status === 'unacknowledged') {
    filteredWarnings = filteredWarnings.filter((warning) => !warning.is_acknowledged)
  }

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: filteredWarnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取里程碑前置预警
 * GET /api/warnings/pre-milestones?projectId=xxx
 */
router.get('/pre-milestones', validate(warningProjectQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined

  logger.info('Fetching pre-milestone warnings', { projectId })

  const warnings = await warningService.scanPreMilestoneWarnings(projectId)

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: warnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取条件到期预警
 * GET /api/warnings/conditions?projectId=xxx
 */
router.get('/conditions', validate(warningProjectQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined

  logger.info('Fetching condition warnings', { projectId })

  const warnings = await warningService.scanConditionWarnings(projectId)

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: warnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取阻碍超时预警
 * GET /api/warnings/obstacles?projectId=xxx
 */
router.get('/obstacles', validate(warningProjectQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined

  logger.info('Fetching obstacle warnings', { projectId })

  const warnings = await warningService.scanObstacleWarnings(projectId)

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: warnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取验收到期预警
 * GET /api/warnings/acceptance?projectId=xxx
 */
router.get('/acceptance', validate(warningProjectQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined

  logger.info('Fetching acceptance warnings', { projectId })

  const warnings = await warningService.scanAcceptanceWarnings(projectId)

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: warnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 获取延期超次预警
 * GET /api/warnings/delay-exceeded?projectId=xxx
 * 延期次数>=3时触发，3-4次为warning，>=5次为critical
 */
router.get('/delay-exceeded', validate(warningProjectQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined

  logger.info('Fetching delay exceeded warnings', { projectId })

  const warnings = await warningService.scanDelayExceededWarnings(projectId)

  const response: ApiResponse<Warning[]> = {
    success: true,
    data: warnings,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 确认预警
 * PUT /api/warnings/:id/acknowledge
 */
router.put('/:id/acknowledge', validate(warningIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Acknowledging warning', { id, userId: req.user!.id })

  const warning = await warningService.acknowledgeWarning(id, req.user!.id)
  if (!warning) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'WARNING_NOT_FOUND', message: '预警不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: {
      message: '预警已确认',
    },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

/**
 * 暂时静音预警
 * PUT /api/warnings/:id/mute
 */
router.put('/:id/mute', validate(warningIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params
  const muteRequest = {
    body: req.body as Record<string, unknown> | null,
    query: req.query as Record<string, unknown> | null,
  }
  const parsedMuteHours = parseMuteHoursFromRequest(muteRequest)
  const muteHours = parsedMuteHours ?? 24
  const validMuteHours = getAllowedMuteHours()
  if ((parsedMuteHours == null && hasExplicitMuteDurationInRequest(muteRequest)) || !validMuteHours.includes(muteHours)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '静音时长仅支持 1h / 4h / 24h / 7d',
        details: { allowed_hours: validMuteHours },
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Muting warning', { id, userId: req.user!.id, muteHours })
  const warning = await warningService.muteWarning(id, muteHours, req.user!.id)

  if (!warning) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'WARNING_NOT_FOUND', message: '预警不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: `预警已静音${formatMuteDurationMessage(muteHours)}` },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

/**
 * 确认为风险
 * PUT /api/warnings/:id/confirm-risk
 */
router.put('/:id/confirm-risk', validate(warningIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params

  logger.info('Confirming warning as risk', { id, userId: req.user!.id })
  const risk = await warningService.confirmWarningAsRisk(id, req.user!.id)

  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'WARNING_NOT_FOUND', message: '预警不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<typeof risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

/**
 * 删除预警记录
 * DELETE /api/warnings/:id
 */
router.delete('/:id', validate(warningIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params

  logger.info('Deleting warning', { id })

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', id)
    .eq('source_entity_type', 'warning')
    .single()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  if (data && isProtectedWarning(data as any)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'UPGRADE_CHAIN_PROTECTED',
        message: '该记录已关联升级链，请改为关闭操作',
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(422).json(response)
  }

  if (data) {
    await closeWarningNotification(id)
  }

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: {
      message: '预警已关闭',
    },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

export default router
