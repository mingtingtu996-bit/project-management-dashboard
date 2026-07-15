import express from 'express'

import { z } from 'zod'

import { generateToken } from '../auth/jwt.js'
import { authError, authSuccess, setAuthTokenCookie } from '../auth/http.js'
import { verifyPassword } from '../auth/password.js'
import type { AuthSessionData, LoginRequest } from '../auth/types.js'
import { getAuthUserByUsername, isDatabaseConnectivityError, toAuthUserView } from '../auth/session.js'
import { getCurrentCompanyMembership } from '../auth/access.js'
import { query } from '../database.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'

const router = express.Router()

const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

// route-auth-public-approved: login is intentionally public and rate-limited at the app mount.
router.post('/', validate(loginSchema), asyncHandler(async (req, res) => {
  const body: LoginRequest = req.body
  const username = String(body.username ?? '').trim()
  const password = String(body.password ?? '')

  let user
  try {
    user = await getAuthUserByUsername(username)
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    throw error
  }
  if (!user?.password_hash) {
    return res.status(401).json(authError('INVALID_CREDENTIALS', '用户名或密码错误'))
  }

  let isPasswordValid = false
  try {
    isPasswordValid = await verifyPassword(password, user.password_hash)
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    throw error
  }
  if (!isPasswordValid) {
    return res.status(401).json(authError('INVALID_CREDENTIALS', '用户名或密码错误'))
  }

  let membership
  try {
    membership = await getCurrentCompanyMembership(user.id, user.last_active_company_id)
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    throw error
  }
  if (membership?.companyId) {
    user.last_active_company_id = membership.companyId
    user.current_company_role = membership.role
  }

  const responseUser = toAuthUserView(user)
  const token = generateToken(responseUser)

  try {
    await query('UPDATE public.users SET last_active = NOW() WHERE id = $1', [user.id])
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    logger.warn('Failed to update last_active', { userId: user.id, error })
  }

  setAuthTokenCookie(res, token)

  const response: AuthSessionData = {
    token,
    user: responseUser,
  }

  return res.json(authSuccess(response))
}))

export default router
