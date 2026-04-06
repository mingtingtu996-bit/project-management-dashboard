// Milestones API 路由

import { Router } from 'express'
import { SupabaseService } from '../services/supabaseService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam, milestoneSchema, milestoneUpdateSchema } from '../middleware/validation.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Milestone } from '../types/db.js'

const router = Router()
const supabase = new SupabaseService()

// 所有路由都需要认证
router.use(authenticate)

// 获取里程碑列表
router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching milestones', { projectId })
  
  const milestones = await supabase.getMilestones(projectId)
  
  const response: ApiResponse<Milestone[]> = {
    success: true,
    data: milestones,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个里程碑
router.get('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching milestone', { id })
  
  const milestones = await supabase.getMilestones()
  const milestone = milestones.find(m => m.id === id)
  
  if (!milestone) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MILESTONE_NOT_FOUND', message: '里程碑不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  
  const response: ApiResponse<Milestone> = {
    success: true,
    data: milestone,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建里程碑
router.post('/', validate(milestoneSchema), asyncHandler(async (req, res) => {
  logger.info('Creating milestone', req.body)
  
  const milestone = await supabase.createMilestone({
    ...req.body,
    version: 1,
  })
  
  const response: ApiResponse<Milestone> = {
    success: true,
    data: milestone,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新里程碑
router.put('/:id', validateIdParam, validate(milestoneUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { version, ...updates } = req.body
  
  logger.info('Updating milestone', { id, version })
  
  try {
    const milestone = await supabase.updateMilestone(id, updates, version)
    
    if (!milestone) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MILESTONE_NOT_FOUND', message: '里程碑不存在' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }
    
    const response: ApiResponse<Milestone> = {
      success: true,
      data: milestone,
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
}))

// 删除里程碑
router.delete('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting milestone', { id })
  
  await supabase.deleteMilestone(id)
  
  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
