import express from 'express'
import { z } from 'zod'

import { authError, authSuccess, setAuthTokenCookie } from '../auth/http.js'
import { extractTokenFromRequest, generateToken, verifyToken } from '../auth/jwt.js'
import type { AuthSessionData } from '../auth/types.js'
import { toAuthUserView } from '../auth/session.js'
import { query } from '../database.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'

const router = express.Router()

const updateProfileSchema = z
  .object({
    display_name: z.string().trim().max(100).optional(),
    email: z.string().trim().email('请输入有效邮箱').optional().or(z.literal('')),
  })
  .refine((value) => value.display_name !== undefined || value.email !== undefined, {
    message: '请提供要修改的信息',
  })

router.put('/', validate(updateProfileSchema), asyncHandler(async (req, res) => {
  const token = extractTokenFromRequest(req)
  if (!token) {
    return res.status(401).json(authError('UNAUTHORIZED', '未登录'))
  }

  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json(authError('TOKEN_EXPIRED', '登录已过期'))
  }

  const rawBody = req.body ?? {}
  const display_name = typeof rawBody.display_name === 'string' ? rawBody.display_name.trim() : rawBody.display_name
  const email = typeof rawBody.email === 'string' ? rawBody.email : rawBody.email
  const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim() : null
  const updates: string[] = []
  const params: unknown[] = []
  let paramIndex = 1

  if (display_name !== undefined) {
    updates.push(`display_name = $${paramIndex++}`)
    params.push(display_name)
  }

  if (email !== undefined) {
    updates.push(`email = $${paramIndex++}`)
    params.push(normalizedEmail)
  }

  updates.push('updated_at = NOW()')
  params.push(payload.userId)

  const result = await query(
    `UPDATE public.users
        SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
  RETURNING id, username, display_name, email, role, global_role, joined_at, last_active`,
    params,
  )

  const updatedUser = result.rows[0]
  if (!updatedUser) {
    return res.status(404).json(authError('USER_NOT_FOUND', '用户不存在'))
  }

  const responseUser = toAuthUserView(updatedUser)
  const newToken = generateToken({
    ...responseUser,
    role: updatedUser.role || 'member',
  })

  setAuthTokenCookie(res, newToken)

  const response: AuthSessionData = {
    token: newToken,
    user: responseUser,
  }

  return res.json(authSuccess(response))
}))

export default router
