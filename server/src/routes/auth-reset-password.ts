import express from 'express'
import { z } from 'zod'

import { getCurrentCompanyMembership } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authError, authSuccess } from '../auth/http.js'
import { generateTemporaryPassword, hashPassword, validateUsername } from '../auth/password.js'
import { isDatabaseConnectivityError } from '../auth/session.js'
import type { PasswordResetData } from '../auth/types.js'
import { query } from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'

const router = express.Router()

const resetPasswordSchema = z.object({
  username: z.string().trim().min(1, '请输入目标用户名'),
})

router.post('/', authenticate, validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  const actorId = req.user?.id
  if (!actorId) {
    return res.status(401).json(authError('UNAUTHORIZED', '未登录'))
  }

  let operatorMembership
  try {
    operatorMembership = await getCurrentCompanyMembership(actorId, getRequestCompanyId(req))
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    throw error
  }

  if (operatorMembership?.role !== 'company_admin') {
    return res.status(403).json(authError('FORBIDDEN', '仅公司管理员可以重置密码'))
  }

  const username = String(req.body?.username ?? '').trim()
  const usernameValidation = validateUsername(username)
  if (!usernameValidation.valid) {
    return res.status(400).json(authError('INVALID_USERNAME', usernameValidation.errors.join(', ')))
  }

  let targetResult
  try {
    targetResult = await query(
      'SELECT id, username FROM public.users WHERE username = $1 LIMIT 1',
      [username],
    )
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    throw error
  }

  const targetUser = targetResult.rows[0]
  if (!targetUser) {
    return res.status(404).json(authError('USER_NOT_FOUND', '目标用户不存在'))
  }

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  try {
    const updateResult = await query(
      `UPDATE public.users u
          SET password_hash = $1,
              auth_token_version = COALESCE(auth_token_version, 0) + 1,
              password_reset_required = true,
              updated_at = NOW()
        WHERE u.id = $2
          AND EXISTS (
            SELECT 1
              FROM public.company_members target_membership
             WHERE target_membership.company_id = $3
               AND target_membership.user_id = u.id
               AND COALESCE(target_membership.status, 'active') = 'active'
          )
          AND EXISTS (
            SELECT 1
              FROM public.company_members operator_membership
             WHERE operator_membership.company_id = $3
               AND operator_membership.user_id = $4
               AND operator_membership.role = 'company_admin'
               AND COALESCE(operator_membership.status, 'active') = 'active'
          )
        RETURNING u.id, u.auth_token_version`,
      [passwordHash, targetUser.id, operatorMembership.companyId, actorId],
    )
    if (updateResult.rowCount !== 1) {
      return res.status(403).json(authError('FORBIDDEN', '只能重置当前公司的有效成员密码'))
    }
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    throw error
  }

  const response: PasswordResetData = {
    message: `已为 ${targetUser.username} 生成临时密码`,
    temporaryPassword,
  }

  return res.json(authSuccess(response))
}))

export default router
