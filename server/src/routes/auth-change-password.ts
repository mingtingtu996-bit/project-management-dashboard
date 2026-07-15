/**
 * 修改密码 API 路由
 */

import express from 'express'
import { z } from 'zod'

import { authError, authSuccess, setAuthTokenCookie } from '../auth/http.js'
import { generateToken } from '../auth/jwt.js'
import { hashPassword, validatePasswordStrength, verifyPassword } from '../auth/password.js'
import { isDatabaseConnectivityError, toAuthUserView } from '../auth/session.js'
import type { PasswordChangeData } from '../auth/types.js'
import { getClient } from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'

const router = express.Router()

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入旧密码'),
  newPassword: z.string().min(1, '请输入新密码'),
})

router.post('/', authenticate, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json(authError('UNAUTHORIZED', '未登录'))
  }

  const { oldPassword, newPassword } = req.body
  const passwordValidation = validatePasswordStrength(newPassword)
  if (!passwordValidation.valid) {
    return res.status(400).json(authError('WEAK_PASSWORD', passwordValidation.errors.join(', ')))
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const userResult = await client.query(
      'SELECT password_hash FROM public.users WHERE id = $1 FOR UPDATE',
      [userId],
    )
    const user = userResult.rows[0]

    if (!user) {
      await client.query('ROLLBACK')
      return res.status(404).json(authError('USER_NOT_FOUND', '用户不存在'))
    }

    const isValid = await verifyPassword(oldPassword, user.password_hash)
    if (!isValid) {
      await client.query('ROLLBACK')
      return res.status(400).json(authError('INVALID_OLD_PASSWORD', '旧密码错误'))
    }

    const newHash = await hashPassword(newPassword)
    const updatedResult = await client.query(
      `UPDATE public.users
          SET password_hash = $1,
              auth_token_version = COALESCE(auth_token_version, 0) + 1,
              password_reset_required = false,
              updated_at = NOW()
        WHERE id = $2
        RETURNING id, username, display_name, email, global_role,
                  last_active_company_id, joined_at, last_active,
                  auth_token_version, password_reset_required`,
      [newHash, userId],
    )
    const updatedUser = updatedResult.rows[0]
    if (!updatedUser) {
      throw Object.assign(new Error('Password update returned no user'), { code: 'AUTH_PASSWORD_UPDATE_FAILED' })
    }

    await client.query('COMMIT')

    const responseUser = toAuthUserView(updatedUser)
    const replacementToken = generateToken(responseUser)
    setAuthTokenCookie(res, replacementToken)

    const response: PasswordChangeData = {
      message: '密码修改成功',
      token: replacementToken,
    }

    return res.json(authSuccess(response))
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original credential update error.
    }
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    throw error
  } finally {
    client.release()
  }
}))

export default router
