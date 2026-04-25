/**
 * 修改密码 API 路由
 */

import express from 'express'
import { z } from 'zod'

import { authError, authSuccess } from '../auth/http.js'
import { extractTokenFromRequest, verifyToken } from '../auth/jwt.js'
import { hashPassword, validatePasswordStrength, verifyPassword } from '../auth/password.js'
import type { AuthMessageData } from '../auth/types.js'
import { query } from '../database.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'

const router = express.Router()

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入旧密码'),
  newPassword: z.string().min(1, '请输入新密码'),
})

router.post('/', validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const token = extractTokenFromRequest(req)
  if (!token) {
    return res.status(401).json(authError('UNAUTHORIZED', '未登录'))
  }

  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json(authError('TOKEN_EXPIRED', '登录已过期'))
  }

  const { oldPassword, newPassword } = req.body
  const passwordValidation = validatePasswordStrength(newPassword)
  if (!passwordValidation.valid) {
    return res.status(400).json(authError('WEAK_PASSWORD', passwordValidation.errors.join(', ')))
  }

  const userResult = await query(
    'SELECT password_hash FROM public.users WHERE id = $1',
    [payload.userId],
  )
  const user = userResult.rows[0]

  if (!user) {
    return res.status(404).json(authError('USER_NOT_FOUND', '用户不存在'))
  }

  const isValid = await verifyPassword(oldPassword, user.password_hash)
  if (!isValid) {
    return res.status(400).json(authError('INVALID_OLD_PASSWORD', '旧密码错误'))
  }

  const newHash = await hashPassword(newPassword)
  await query(
    'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newHash, payload.userId],
  )

  const response: AuthMessageData = {
    message: '密码修改成功',
  }

  return res.json(authSuccess(response))
}))

export default router
