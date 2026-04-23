import express from 'express'

import { authSuccess } from '../auth/http.js'
import { extractTokenFromRequest, verifyToken } from '../auth/jwt.js'
import type { AuthStatusData } from '../auth/types.js'
import { getAuthUserById, toAuthUserView } from '../auth/session.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

router.get('/', asyncHandler(async (req, res) => {
  const token = extractTokenFromRequest(req)

  if (!token) {
    const response: AuthStatusData = {
      authenticated: false,
      user: null,
    }
    return res.json(authSuccess(response))
  }

  const payload = verifyToken(token)
  if (!payload) {
    const response: AuthStatusData = {
      authenticated: false,
      user: null,
    }
    return res.json(authSuccess(response))
  }

  const user = await getAuthUserById(payload.userId)
  if (!user) {
    const response: AuthStatusData = {
      authenticated: false,
      user: null,
    }
    return res.json(authSuccess(response))
  }

  const response: AuthStatusData = {
    authenticated: true,
    user: toAuthUserView(user),
  }

  return res.json(authSuccess(response))
}))

export default router
