import { Router } from 'express'
import { authenticate, requireProjectMember, requireProjectOwner } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { dataQualityService } from '../services/dataQualityService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()

router.use(authenticate)

router.get(
  '/settings',
  requireProjectMember((req) => req.query.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.projectId ?? '').trim()

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const settings = await dataQualityService.getProjectSettings(projectId)
    const response: ApiResponse<typeof settings> = {
      success: true,
      data: settings,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.put(
  '/settings',
  requireProjectOwner((req) => req.body?.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const weights = req.body?.weights

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (!weights || typeof weights !== 'object') {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_WEIGHTS', message: '数据质量权重不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const settings = await dataQualityService.updateProjectSettings(projectId, weights, req.user?.id ?? null)
    const response: ApiResponse<typeof settings> = {
      success: true,
      data: settings,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.get(
  '/project-summary',
  requireProjectMember((req) => req.query.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.projectId ?? '').trim()
    const month = String(req.query.month ?? '').trim() || undefined

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const summary = await dataQualityService.buildProjectSummary(projectId, month)
    const response: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/live-check',
  requireProjectMember((req) => req.body?.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const taskId = String(req.body?.taskId ?? '').trim() || undefined
    const draft = req.body?.draft

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (!draft || typeof draft !== 'object') {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_DRAFT', message: '任务草稿不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const summary = await dataQualityService.previewTaskLiveCheck(projectId, draft, taskId)
    const response: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/scan',
  requireProjectMember((req) => req.body?.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const month = String(req.body?.month ?? '').trim() || undefined

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const summary = await dataQualityService.syncProjectDataQuality(projectId, month)
    const response: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

export default router
