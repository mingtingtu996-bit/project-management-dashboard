/**
 * 用户登出 API 路由
 */

import express from 'express'

import { clearAuthTokenCookie, authSuccess } from '../auth/http.js'
import { extractTokenFromRequest, verifyToken } from '../auth/jwt.js'
import type { AuthMessageData } from '../auth/types.js'
import { logLogout } from '../utils/operationLog.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

router.post('/', asyncHandler(async (req, res) => {
  const token = extractTokenFromRequest(req)
  if (token) {
    const payload = verifyToken(token)
    if (payload) {
      void logLogout(payload.userId, payload.username, req).catch(() => {})
    }
  }

  clearAuthTokenCookie(res)

  const response: AuthMessageData = {
    message: '已登出',
  }

  return res.json(authSuccess(response))
}))

export default router
