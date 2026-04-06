// Invitations API 路由

import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { SupabaseService } from '../services/supabaseService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { validate, validateIdParam, invitationCreateSchema } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Invitation } from '../types/db.js'

const router = Router()
router.use(authenticate)
const supabase = new SupabaseService()

// 生成邀请码
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// 获取邀请码列表
router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching invitations', { projectId })
  
  const invitations = await supabase.getInvitations(projectId)
  
  const response: ApiResponse<Invitation[]> = {
    success: true,
    data: invitations,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个邀请码
router.get('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching invitation', { id })
  
  const invitations = await supabase.getInvitations()
  const invitation = invitations.find(i => i.id === id)
  
  if (!invitation) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVITATION_NOT_FOUND', message: '邀请码不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  
  const response: ApiResponse<Invitation> = {
    success: true,
    data: invitation,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 验证邀请码
router.get('/validate/:code', asyncHandler(async (req, res) => {
  const { code } = req.params
  logger.info('Validating invitation code', { code })
  
  const invitation = await supabase.validateInvitation(code)
  
  if (!invitation) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_INVITATION', message: '邀请码无效或已过期' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }
  
  const response: ApiResponse<Invitation> = {
    success: true,
    data: invitation,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建邀请码
router.post('/', validate(invitationCreateSchema), asyncHandler(async (req, res) => {
  const { project_id, role, expires_at } = req.body
  
  // 生成邀请码
  const code = generateInviteCode()
  
  logger.info('Creating invitation', { project_id, role, code })
  
  const invitation = await supabase.createInvitation({
    id: uuidv4(),
    project_id,
    code,
    role,
    status: 'active',
    expires_at,
    created_by: req.body.created_by || 'system',
  })
  
  const response: ApiResponse<Invitation> = {
    success: true,
    data: invitation,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新邀请码
router.put('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  
  logger.info('Updating invitation', { id })
  
  const invitation = await supabase.updateInvitation(id, req.body)
  
  if (!invitation) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVITATION_NOT_FOUND', message: '邀请码不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  
  const response: ApiResponse<Invitation> = {
    success: true,
    data: invitation,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 撤销邀请码
router.delete('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Revoking invitation', { id })
  
  // 软删除：更新状态为revoked
  await supabase.updateInvitation(id, { status: 'revoked' })
  
  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
