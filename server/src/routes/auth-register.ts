import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { authError, authSuccess, setAuthTokenCookie } from '../auth/http.js'
import { generateToken } from '../auth/jwt.js'
import { hashPassword, validatePasswordStrength, validateUsername } from '../auth/password.js'
import type { AuthSessionData } from '../auth/types.js'
import { countUsers, toAuthUserView } from '../auth/session.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'

const router = express.Router()

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || ''

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const registerSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
  display_name: z.string().trim().max(100).optional(),
  email: z.string().trim().email('请输入有效邮箱').optional().or(z.literal('')),
})

router.post('/', validate(registerSchema), asyncHandler(async (req, res) => {
  const rawBody = req.body ?? {}
  const username = String(rawBody.username ?? '').trim()
  const password = String(rawBody.password ?? '')
  const display_name = typeof rawBody.display_name === 'string' ? rawBody.display_name.trim() : undefined
  const email = typeof rawBody.email === 'string' ? rawBody.email : undefined

  const usernameValidation = validateUsername(String(username))
  if (!usernameValidation.valid) {
    return res.status(400).json(authError('INVALID_USERNAME', usernameValidation.errors.join(', ')))
  }

  const passwordValidation = validatePasswordStrength(String(password))
  if (!passwordValidation.valid) {
    return res.status(400).json(authError('WEAK_PASSWORD', passwordValidation.errors.join(', ')))
  }

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single()

  if (existingUser) {
    return res.status(400).json(authError('USERNAME_ALREADY_EXISTS', '用户名已存在'))
  }

  const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim() : null

  if (normalizedEmail) {
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .single()

    if (existingEmail) {
      return res.status(400).json(authError('EMAIL_ALREADY_EXISTS', '邮箱已被注册'))
    }
  }

  const passwordHash = await hashPassword(String(password))
  const isFirstUser = (await countUsers()) === 0

  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({
      username,
      password_hash: passwordHash,
      display_name: display_name || username,
      email: normalizedEmail,
      role: 'member',
      global_role: isFirstUser ? 'company_admin' : 'regular',
      device_id: `user-${username}`,
    })
    .select()
    .single()

  if (createError || !newUser) {
    logger.error('Create user failed', { username, error: createError })
    return res.status(500).json(authError('REGISTER_FAILED', '注册失败，请稍后重试'))
  }

  const responseUser = toAuthUserView(newUser as any)
  const token = generateToken({
    ...responseUser,
    role: newUser.role || 'member',
  })

  setAuthTokenCookie(res, token)

  const response: AuthSessionData = {
    token,
    user: responseUser,
  }

  return res.json(authSuccess(response))
}))

export default router
