import express from 'express'
import { z } from 'zod'

import { authError, authSuccess } from '../auth/http.js'
import { extractTokenFromRequest, verifyToken } from '../auth/jwt.js'
import { hashPassword, validateUsername } from '../auth/password.js'
import type { PasswordResetData } from '../auth/types.js'
import { getAuthUserById, hasUsersUpdatedAtColumn } from '../auth/session.js'
import { query } from '../database.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'

const router = express.Router()

const resetPasswordSchema = z.object({
  username: z.string().trim().min(1, '请输入目标用户名'),
})

function generateTemporaryPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let password = ''

  for (let index = 0; index < length; index += 1) {
    password += alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  }

  return password
}

router.post('/', validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  const token = extractTokenFromRequest(req)
  if (!token) {
    return res.status(401).json(authError('UNAUTHORIZED', '未登录'))
  }

  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json(authError('TOKEN_EXPIRED', '登录已过期'))
  }

  const operator = await getAuthUserById(payload.userId)
  if (!operator || operator.global_role !== 'company_admin') {
    return res.status(403).json(authError('FORBIDDEN', '仅公司管理员可以重置密码'))
  }

  const username = String(req.body?.username ?? '').trim()
  const usernameValidation = validateUsername(username)
  if (!usernameValidation.valid) {
    return res.status(400).json(authError('INVALID_USERNAME', usernameValidation.errors.join(', ')))
  }

  const targetResult = await query(
    'SELECT id, username FROM public.users WHERE username = $1 LIMIT 1',
    [username],
  )

  const targetUser = targetResult.rows[0]
  if (!targetUser) {
    return res.status(404).json(authError('USER_NOT_FOUND', '目标用户不存在'))
  }

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  const shouldWriteUpdatedAt = await hasUsersUpdatedAtColumn()

  await query(
    shouldWriteUpdatedAt
      ? 'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2'
      : 'UPDATE public.users SET password_hash = $1 WHERE id = $2',
    [passwordHash, targetUser.id],
  )

  const response: PasswordResetData = {
    message: `已为 ${targetUser.username} 生成临时密码`,
    temporaryPassword,
  }

  return res.json(authSuccess(response))
}))

export default router
