import { Router, type Request as ExpressRequest } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import {
  getProjectCompanyId,
  getProjectPermissionLevel,
  normalizeProjectPermissionLevel,
} from '../auth/access.js'
import { extractTokenFromRequest, verifyToken } from '../auth/jwt.js'
import { supabase } from '../services/dbService.js'
import {
  acceptProjectInvitationCode,
  InvitationAcceptanceError,
} from '../services/invitationAcceptanceService.js'

const router = Router()

const codeParamSchema = z.object({
  code: z.string().trim().min(1, '邀请码不能为空'),
})

const invitationIdParamSchema = z.object({
  id: z.string().trim().min(1, '邀请码ID不能为空'),
})

const projectIdQuerySchema = z.object({
  projectId: z.string().trim().min(1, '缺少项目ID'),
})

const createInvitationSchema = z.object({
  project_id: z.string().trim().min(1, '缺少项目ID'),
  permission_level: z.string().trim().min(1, '缺少权限级别'),
  max_uses: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
  expires_at: z.string().trim().optional().or(z.null()),
})

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let index = 0; index < 8; index += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function resolveOptionalRequestUserId(req: ExpressRequest) {
  const token = extractTokenFromRequest(req)
  if (!token) return null
  const payload = verifyToken(token)
  return typeof payload?.userId === 'string' && payload.userId ? payload.userId : null
}

function normalizeInvitationRow(row: Record<string, any>) {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    projectName: row.project_name ?? row.projects?.name ?? null,
    invitationCode: String(row.invitation_code),
    permissionLevel: normalizeProjectPermissionLevel(row.permission_level),
    createdAt: row.created_at ?? null,
    expiresAt: row.expires_at ?? null,
    isRevoked: Boolean(row.is_revoked),
    usedCount: Number(row.used_count ?? 0),
    maxUses: row.max_uses == null ? null : Number(row.max_uses),
    alreadyJoined: Boolean(row.alreadyJoined),
  }
}

async function ensureProjectOwner(userId: string, projectId: string, companyId?: string | null) {
  const permissionLevel = await getProjectPermissionLevel(userId, projectId, companyId)
  return permissionLevel === 'owner'
}

function isInvitationAvailable(row: Record<string, any>) {
  if (Boolean(row.is_revoked)) return false

  if (row.expires_at) {
    const expiresAt = new Date(String(row.expires_at))
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return false
    }
  }

  if (row.max_uses != null) {
    const usedCount = Number(row.used_count ?? 0)
    const maxUses = Number(row.max_uses)
    if (!Number.isNaN(maxUses) && usedCount >= maxUses) {
      return false
    }
  }

  return true
}

async function syncPrimaryInvitationCode(projectId: string, preferredCode?: string | null) {
  let nextPrimaryCode = preferredCode ?? null

  if (!nextPrimaryCode) {
    const { data, error } = await supabase
      .from('project_invitations')
      .select('invitation_code, expires_at, is_revoked, used_count, max_uses, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Load invitations for primary code sync failed', { error, projectId })
      return null
    }

    const availableInvitation = (data ?? []).find((row) => isInvitationAvailable(row as Record<string, any>)) as Record<string, any> | undefined
    nextPrimaryCode = availableInvitation?.invitation_code ? String(availableInvitation.invitation_code) : null
  }

  const { error: updateError } = await supabase
    .from('projects')
    .update({ primary_invitation_code: nextPrimaryCode })
    .eq('id', projectId)

  if (updateError) {
    logger.error('Sync primary invitation code failed', { error: updateError, projectId, nextPrimaryCode })
    return null
  }

  return nextPrimaryCode
}

// route-auth-public-approved: invitation validation must work before a user joins the project.
// workspace-isolation-capability-read-approved: the high-entropy invitation code is the pre-membership read capability.
router.get('/validate/:code', validate(codeParamSchema, 'params'), asyncHandler(async (req, res) => {
    const code = String(req.params.code ?? '').trim().toUpperCase()
    const userId = resolveOptionalRequestUserId(req)

    const { data } = await supabase
      .from('project_invitations')
      .select('id, project_id, company_id, invitation_code, permission_level, expires_at, is_revoked, used_count, max_uses')
      .eq('invitation_code', code)
      .single()

    const invitation = data as Record<string, any> | null
    if (!invitation) {
      return res.status(400).json({ success: false, message: '邀请码无效或已过期' })
    }

    let alreadyJoined = false
    if (userId) {
      const { data: existingMember, error: existingMemberError } = await supabase
        .from('project_members')
        .select('id, is_active')
        .eq('project_id', invitation.project_id)
        .eq('user_id', userId)
        .maybeSingle()

      if (existingMemberError) {
        logger.error('Validate invitation member lookup error', { error: existingMemberError, invitationId: invitation.id, userId })
        return res.status(500).json({ success: false, message: '邀请码校验失败' })
      }

      alreadyJoined = Boolean(existingMember?.id && existingMember.is_active !== false)
    }

    if (invitation.is_revoked && !alreadyJoined) {
      return res.status(400).json({ success: false, message: '邀请码无效或已过期' })
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      if (!alreadyJoined) {
        return res.status(400).json({ success: false, message: '邀请码无效或已过期' })
      }
    }

    if (invitation.max_uses != null && Number(invitation.used_count ?? 0) >= Number(invitation.max_uses)) {
      if (!alreadyJoined) {
        return res.status(400).json({ success: false, message: '邀请码已达到使用上限' })
      }
    }

    const { data: projectData } = await supabase
      .from('projects')
      .select('name')
      .eq('id', invitation.project_id)
      .single()

    return res.json({
      success: true,
      data: normalizeInvitationRow({
        ...invitation,
        project_name: projectData?.name ?? null,
        alreadyJoined,
      }),
    })
}))

router.get('/', authenticate, validate(projectIdQuerySchema, 'query'), asyncHandler(async (req, res) => {
    const projectId = String(req.query.projectId ?? '').trim()
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const isOwner = await ensureProjectOwner(userId, projectId, getRequestCompanyId(req))
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目负责人可以查看邀请码' })
    }

    const { data, error } = await supabase
      .from('project_invitations')
      .select('id, project_id, company_id, invitation_code, permission_level, expires_at, is_revoked, used_count, max_uses, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Get invitations error', { error, projectId, userId })
      return res.status(500).json({ success: false, message: '获取邀请码失败' })
    }

    return res.json({
      success: true,
      data: (data ?? []).map((row) => normalizeInvitationRow(row as Record<string, any>)),
    })
}))

router.post('/', authenticate, validate(createInvitationSchema), asyncHandler(async (req, res) => {
    const userId = req.user?.id
    const projectId = String(req.body?.project_id ?? '').trim()
    const permissionLevel = normalizeProjectPermissionLevel(req.body?.permission_level)
    const maxUses = req.body?.max_uses == null || req.body?.max_uses === '' ? null : Number(req.body.max_uses)
    const expiresAt = req.body?.expires_at ? String(req.body.expires_at) : null

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    if (permissionLevel !== 'editor') {
      return res.status(400).json({ success: false, message: '邀请码仅支持授予编辑成员' })
    }

    const isOwner = await ensureProjectOwner(userId, projectId, getRequestCompanyId(req))
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目负责人可以生成邀请码' })
    }

    const projectCompanyId = await getProjectCompanyId(projectId)
    const invitationCode = generateInviteCode()
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('project_invitations')
      .insert({
        id: uuidv4(),
        project_id: projectId,
        company_id: projectCompanyId,
        invitation_code: invitationCode,
        permission_level: permissionLevel,
        created_by: userId,
        created_at: now,
        is_revoked: false,
        used_count: 0,
        max_uses: maxUses,
        expires_at: expiresAt,
      })
      .select('id, project_id, company_id, invitation_code, permission_level, expires_at, is_revoked, used_count, max_uses, created_at')
      .single()

    if (error || !data) {
      logger.error('Create invitation error', { error, projectId, userId })
      return res.status(500).json({ success: false, message: '生成邀请码失败' })
    }

    await syncPrimaryInvitationCode(projectId, invitationCode)

    return res.status(201).json({
      success: true,
      data: normalizeInvitationRow(data as Record<string, any>),
    })
}))

// workspace-isolation-capability-write-approved: authenticated acceptance is authorized by the single-use invitation code and the transactional acceptance service.
router.post('/accept/:code', authenticate, validate(codeParamSchema, 'params'), asyncHandler(async (req, res) => {
    const userId = req.user?.id
    const code = String(req.params.code ?? '').trim().toUpperCase()

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    let result
    try {
      result = await acceptProjectInvitationCode({ code, userId })
    } catch (error) {
      if (error instanceof InvitationAcceptanceError) {
        return res.status(error.statusCode).json({ success: false, message: error.message, error: { code: error.code } })
      }
      throw error
    }

    if (result.alreadyMember) {
      return res.status(400).json({ success: false, message: '你已经是该项目成员' })
    }

    await syncPrimaryInvitationCode(result.projectId)

    return res.json({
      success: true,
      data: {
        projectId: result.projectId,
        companyId: result.companyId,
        permissionLevel: result.permissionLevel,
      },
    })
}))

router.delete('/:id', authenticate, validate(invitationIdParamSchema, 'params'), asyncHandler(async (req, res) => {
    const userId = req.user?.id
    const invitationId = String(req.params.id ?? '').trim()

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const { data } = await supabase
      .from('project_invitations')
      .select('id, project_id, company_id')
      .eq('id', invitationId)
      .single()

    const invitation = data as Record<string, any> | null
    if (!invitation) {
      return res.status(404).json({ success: false, message: '邀请码不存在' })
    }

    const isOwner = await ensureProjectOwner(userId, String(invitation.project_id), getRequestCompanyId(req))
    if (!isOwner) {
      return res.status(403).json({ success: false, message: '只有项目负责人可以撤销邀请码' })
    }

    // v1.4.15: record retention decision (revoke)
    const { executeRetention } = await import('../services/deletionRetentionGovernanceService.js')
    await executeRetention({ entityType: 'project_invitation', entityId: invitationId, projectId: String(invitation.project_id), userId, userAction: 'void' }).catch(() => {})

    const { error } = await supabase
      .from('project_invitations')
      .update({ is_revoked: true })
      .eq('id', invitationId)
      .eq('project_id', invitation.project_id)

    if (error) {
      logger.error('Revoke invitation error', { error, invitationId, userId })
      return res.status(500).json({ success: false, message: '撤销邀请码失败' })
    }

    await syncPrimaryInvitationCode(String(invitation.project_id))

    return res.json({ success: true })
}))

export default router
