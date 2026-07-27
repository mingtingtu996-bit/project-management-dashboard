import express from 'express'
import { z } from 'zod'

import { authError, authSuccess, setAuthTokenCookie } from '../auth/http.js'
import { generateToken } from '../auth/jwt.js'
import { hashPassword, validatePasswordStrength, validateUsername } from '../auth/password.js'
import type { AuthSessionData } from '../auth/types.js'
import { isDatabaseConnectivityError, toAuthUserView } from '../auth/session.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import {
  AuthRegistrationError,
  registerAuthUser,
} from '../services/authRegistrationService.js'

const router = express.Router()

const registerSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
  display_name: z.string().trim().max(100).optional(),
  email: z.string().trim().email('请输入有效邮箱').optional().or(z.literal('')),
})

function readRegisterDbTimeoutMs() {
  const parsed = Number(process.env.AUTH_REGISTER_DB_TIMEOUT_MS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4000
}

async function withRegisterDbTimeout<T>(
  stage: string,
  operation: PromiseLike<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutMs = readRegisterDbTimeoutMs()
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`auth_register_${stage} timed out after ${timeoutMs}ms`)
      ;(error as Error & { code?: string }).code = 'AUTH_REGISTER_DB_TIMEOUT'
      reject(error)
    }, timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve(operation), timeout])
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      logger.warn('Register route database operation unavailable', {
        stage,
        timeoutMs,
        error,
      })
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// route-auth-public-approved: registration is intentionally public and rate-limited at the app mount.
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

  const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim() : null

  const passwordHash = await hashPassword(String(password))

  try {
    const newUser = await withRegisterDbTimeout(
      'transaction',
      registerAuthUser({
        username,
        passwordHash,
        displayName: display_name || username,
        email: normalizedEmail,
      }),
    )

    const responseUser = toAuthUserView(newUser as any)
    responseUser.currentCompanyRole = responseUser.currentCompanyId
      ? responseUser.globalRole
      : null
    const token = generateToken(responseUser)

    setAuthTokenCookie(res, token)

    const response: AuthSessionData = {
      token,
      user: responseUser,
    }

    return res.json(authSuccess(response))
  } catch (error) {
    const registrationErrorCode = String((error as { code?: unknown } | null)?.code ?? '')
    if (
      error instanceof AuthRegistrationError
      || registrationErrorCode === 'USERNAME_ALREADY_EXISTS'
      || registrationErrorCode === 'EMAIL_ALREADY_EXISTS'
    ) {
      const code = registrationErrorCode as 'USERNAME_ALREADY_EXISTS' | 'EMAIL_ALREADY_EXISTS'
      const message = error instanceof Error
        ? error.message
        : code === 'EMAIL_ALREADY_EXISTS' ? '邮箱已被注册' : '用户名已存在'
      return res.status(400).json(authError(code, message))
    }
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '注册服务暂时不可用，请稍后重试'))
    }
    throw error
  }
}))

export default router
