/**
 * 用户登出 API 路由
 */

import express from 'express'

import { authError, clearAuthTokenCookie, authSuccess } from '../auth/http.js'
import { isDatabaseConnectivityError } from '../auth/session.js'
import type { AuthMessageData } from '../auth/types.js'
import { query } from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { logLogout } from '../utils/operationLog.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

router.post('/', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json(authError('UNAUTHORIZED', '未登录'))
  }

  try {
    const result = await query(
      `UPDATE public.users
          SET auth_token_version = COALESCE(auth_token_version, 0) + 1,
              updated_at = NOW()
        WHERE id = $1
        RETURNING auth_token_version`,
      [userId],
    )
    if (result.rowCount !== 1) {
      return res.status(401).json(authError('USER_SESSION_REVOKED', '当前登录会话已失效'))
    }
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    throw error
  }

  void logLogout(userId, req.user?.username ?? '', req).catch(() => {})

  clearAuthTokenCookie(res)

  const response: AuthMessageData = {
    message: '已登出',
  }

  return res.json(authSuccess(response))
}))

export default router
