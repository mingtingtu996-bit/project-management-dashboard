import express from 'express'

import { z } from 'zod'

import { generateToken } from '../auth/jwt.js'
import { authError, authSuccess, setAuthTokenCookie } from '../auth/http.js'
import { verifyPassword } from '../auth/password.js'
import type { AuthSessionData, LoginRequest } from '../auth/types.js'
import { getAuthUserByUsername, toAuthUserView } from '../auth/session.js'
import { query } from '../database.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'

const router = express.Router()

const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

router.post('/', validate(loginSchema), asyncHandler(async (req, res) => {
  const body: LoginRequest = req.body
  const username = String(body.username ?? '').trim()
  const password = String(body.password ?? '')

  const user = await getAuthUserByUsername(username)
  if (!user?.password_hash) {
    return res.status(401).json(authError('INVALID_CREDENTIALS', '用户名或密码错误'))
  }

  const isPasswordValid = await verifyPassword(password, user.password_hash)
  if (!isPasswordValid) {
    return res.status(401).json(authError('INVALID_CREDENTIALS', '用户名或密码错误'))
  }

  const responseUser = toAuthUserView(user)
  const token = generateToken({
    ...responseUser,
    role: user.role || 'member',
  })

  try {
    await query('UPDATE public.users SET last_active = NOW() WHERE id = $1', [user.id])
  } catch (error) {
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
