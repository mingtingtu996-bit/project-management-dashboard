import express from 'express'

import { authError, authSuccess } from '../auth/http.js'
import { extractTokenFromRequest, verifyToken } from '../auth/jwt.js'
import type { AuthStatusData } from '../auth/types.js'
import { getAuthUserById, isDatabaseConnectivityError, toAuthUserView } from '../auth/session.js'
import { isPermissionSystemDisabled } from '../auth/permissionBypass.js'
import { getCurrentCompanyMembership } from '../auth/access.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

function getDevFallbackGlobalRole() {
  return process.env.DEV_GLOBAL_ROLE === 'company_admin' ? 'company_admin' : 'regular'
}

router.get('/', asyncHandler(async (req, res) => {
  if (isPermissionSystemDisabled()) {
    const globalRole = getDevFallbackGlobalRole()
    const response: AuthStatusData = {
      authenticated: true,
      user: {
        id: process.env.DEV_USER_ID || '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
        username: 'permission-bypass',
        display_name: globalRole === 'company_admin' ? '临时管理员' : '临时用户',
        email: 'dev@localhost',
        globalRole,
        currentCompanyId: process.env.DEV_COMPANY_ID || null,
        currentCompanyRole: globalRole,
        joined_at: null,
        last_active: null,
      },
    }
    return res.json(authSuccess(response))
  }

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

  let user
  try {
    user = await getAuthUserById(payload.userId)
  } catch (error) {
    if (isDatabaseConnectivityError(error)) {
      return res.status(503).json(authError('SERVICE_UNAVAILABLE', '认证服务暂时不可用，请稍后重试'))
    }
    throw error
  }
  if (!user) {
    const response: AuthStatusData = {
      authenticated: false,
      user: null,
    }
    return res.json(authSuccess(response))
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

  const response: AuthStatusData = {
    authenticated: true,
    user: toAuthUserView(user),
  }

  return res.json(authSuccess(response))
}))

export default router
