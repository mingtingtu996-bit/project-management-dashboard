// Risks API 路由

import { Router } from 'express'
import { SupabaseService } from '../services/supabaseService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam, riskSchema, riskUpdateSchema } from '../middleware/validation.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Risk } from '../types/db.js'

const router = Router()
const supabase = new SupabaseService()

// 所有路由都需要认证
router.use(authenticate)

// 获取风险列表
router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching risks', { projectId })
  
  const risks = await supabase.getRisks(projectId)
  
  const response: ApiResponse<Risk[]> = {
    success: true,
    data: risks,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个风险
router.get('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching risk', { id })
  
  const risks = await supabase.getRisks()
  const risk = risks.find(r => r.id === id)
  
  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: '风险不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  
  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建风险
router.post('/', validate(riskSchema), asyncHandler(async (req, res) => {
  logger.info('Creating risk', req.body)
  
  const risk = await supabase.createRisk({
    ...req.body,
    version: 1,
  })
  
  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新风险
router.put('/:id', validateIdParam, validate(riskUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { version, ...updates } = req.body
  
  logger.info('Updating risk', { id, version })
  
  try {
    const risk = await supabase.updateRisk(id, updates, version)
    
    if (!risk) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'RISK_NOT_FOUND', message: '风险不存在' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }
    
    const response: ApiResponse<Risk> = {
      success: true,
      data: risk,
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

// 删除风险
router.delete('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting risk', { id })
  
  await supabase.deleteRisk(id)
  
  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
