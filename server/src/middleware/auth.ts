// 认证和授权中间件
// 提供JWT验证、权限检查功能
// 已迁移：使用 jsonwebtoken 替代 supabase.auth.getUser()
//         使用 Supabase SDK 直接查询（避免 SQL 解析布尔值问题）

import type { Request, Response, NextFunction } from 'express'
import { logger } from './logger.js'
import { executeSQL, executeSQLOne, supabase } from '../services/dbService.js'
import { extractTokenFromRequest, verifyToken } from '../auth/jwt.js'
import { JWT_CONFIG } from '../auth/config.js'
import { getProjectPermissionLevel, isUuidLike } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { query } from '../database.js'
import { isPermissionSystemDisabled } from '../auth/permissionBypass.js'
import { getAuthUserById, toAuthUserView } from '../auth/session.js'
import { isCompanySessionRevoked } from '../auth/companySession.js'

// 扩展Express Request类型
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email?: string
        globalRole?: string
        currentCompanyId?: string | null
        username?: string
        tokenVersion?: number
        passwordResetRequired?: boolean
      }
      authorizedProjectIds?: string[]
    }
  }
}

function grantRequestProjectScope(req: Request, projectId: string) {
  const normalized = String(projectId ?? '').trim()
  if (!normalized) return
  const current = req.authorizedProjectIds ?? []
  if (!current.includes(normalized)) {
    req.authorizedProjectIds = [...current, normalized]
  }
}

export function getAuthorizedRequestProjectId(req: Request, expectedProjectId?: string | null): string | null {
  const projectIds = req.authorizedProjectIds ?? []
  const expected = String(expectedProjectId ?? '').trim()
  if (expected) return projectIds.includes(expected) ? expected : null
  return projectIds.at(-1) ?? null
}

// 严格区分开发/生产环境：只有明确设置 NODE_ENV=development 才是开发模式
const IS_DEV = process.env.NODE_ENV === 'development'
const IS_TEST = process.env.NODE_ENV === 'test'
const DEFAULT_TEST_USER_ID = '00000000-0000-4000-8000-000000000001'
const ALLOW_TEST_FALLBACK_USER = process.env.AUTH_ALLOW_TEST_FALLBACK_USER === 'true'
const ALLOW_DEV_FALLBACK_USER = process.env.AUTH_ALLOW_DEV_FALLBACK_USER === 'true'
type AuthCurrentUserLookup = Promise<Awaited<ReturnType<typeof getAuthUserById>>>
const authCurrentUserLookups = new Map<string, AuthCurrentUserLookup>()

function getJwtSecret() {
  return JWT_CONFIG.secret
}

if (!getJwtSecret()) {
  if (!IS_DEV && !IS_TEST) {
    // 生产/未配置环境下，缺少 JWT_SECRET 直接报错退出
    logger.error('【严重】JWT_SECRET 未设置，服务拒绝启动（生产环境必须配置此密钥）')
    process.exit(1)
  }
  logger.warn('JWT_SECRET 未设置，认证功能将降级为开发测试模式（仅限 NODE_ENV=development）')
}

function resolveTestFallbackUserId() {
  const candidates = [
    process.env.TEST_USER_ID,
    process.env.DEV_USER_ID,
    DEFAULT_TEST_USER_ID,
  ]

  const matched = candidates.find((candidate) => isUuidLike(candidate))
  return matched ?? DEFAULT_TEST_USER_ID
}

function buildTestFallbackUser() {
  return {
    id: resolveTestFallbackUserId(),
    email: 'test@example.com',
    role: 'owner',
    globalRole: 'company_admin',
    currentCompanyId: process.env.TEST_COMPANY_ID || process.env.DEV_COMPANY_ID || null,
  }
}

function getDevFallbackGlobalRole() {
  return process.env.DEV_GLOBAL_ROLE === 'company_admin' ? 'company_admin' : 'regular'
}

function buildDevFallbackUser(devUserId: string) {
  const globalRole = getDevFallbackGlobalRole()
  return {
    id: devUserId,
    email: 'dev@localhost',
    role: globalRole === 'company_admin' ? 'owner' : 'member',
    globalRole,
    currentCompanyId: process.env.DEV_COMPANY_ID || null,
  }
}

function buildPermissionBypassUser() {
  return buildDevFallbackUser(process.env.DEV_USER_ID || '9e4a5570-0032-43bd-8f17-0bc415a1eb70')
}

function tokenVersionValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0
}

export function clearAuthCurrentUserCacheForTest(userId?: string | null) {
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) return
  const key = String(userId ?? '').trim()
  if (key) authCurrentUserLookups.delete(key)
  else authCurrentUserLookups.clear()
}

async function getCachedCurrentUserForPayload(payload: { userId: string; tokenVersion?: unknown }) {
  const existing = authCurrentUserLookups.get(payload.userId)
  if (existing) return existing

  const lookup = getAuthUserById(payload.userId)
  authCurrentUserLookups.set(payload.userId, lookup)
  try {
    return await lookup
  } finally {
    if (authCurrentUserLookups.get(payload.userId) === lookup) {
      authCurrentUserLookups.delete(payload.userId)
    }
  }
}

function sendRevokedSessionResponse(res: Response): void {
  res.status(401).json({
    success: false,
    error: {
      code: 'USER_SESSION_REVOKED',
      message: '当前登录会话已失效，请重新登录'
    },
    timestamp: new Date().toISOString()
  })
}

function sendCompanySessionRevokedResponse(res: Response): void {
  res.status(403).json({
    success: false,
    error: {
      code: 'COMPANY_SESSION_REVOKED',
      message: '当前公司空间的登录会话已失效，请重新登录或切换公司',
    },
    timestamp: new Date().toISOString(),
  })
}

function isPasswordRotationRequest(req: Request): boolean {
  const path = String(req.originalUrl || req.path || '').split('?', 1)[0].replace(/\/+$/, '')
  return path.endsWith('/api/auth/change-password') || path.endsWith('/api/auth/logout')
}

function resolveCompanySessionScope(req: Request, currentCompanyId?: string | null): string | null {
  const path = String(req.originalUrl || req.path || '').split('?', 1)[0].replace(/\/+$/, '')
  if (path.endsWith('/api/workspace/companies/switch')) {
    const targetCompanyId = String(
      typeof req.body === 'object' && req.body ? req.body.companyId ?? req.body.company_id : '',
    ).trim()
    if (isUuidLike(targetCompanyId)) return targetCompanyId
  }

  const requestedCompanyId = getRequestCompanyId(req)
  if (isUuidLike(requestedCompanyId)) return requestedCompanyId
  return isUuidLike(currentCompanyId) ? currentCompanyId : null
}

function sendPasswordChangeRequiredResponse(res: Response): void {
  res.status(403).json({
    success: false,
    error: {
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: '临时密码必须先修改后才能继续使用系统',
    },
    timestamp: new Date().toISOString(),
  })
}

/**
 * 认证中间件 - 验证JWT Token
 * 从Authorization头部提取token并验证
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (isPermissionSystemDisabled()) {
      req.user = buildPermissionBypassUser()
      next()
      return
    }

    const token = extractTokenFromRequest(req)

    if (!token) {
      if (IS_TEST && ALLOW_TEST_FALLBACK_USER) {
        req.user = buildTestFallbackUser()
        next()
        return
      }

      // 仅在明确启用时，开发模式才允许无 token 使用环境变量中的开发用户。
      // Release/staging probes may run through the dev server, but must keep real auth boundaries.
      if (IS_DEV && ALLOW_DEV_FALLBACK_USER) {
        const devUserId = process.env.DEV_USER_ID
        if (!devUserId) {
          logger.warn('开发模式：DEV_USER_ID 未配置，请在 .env 中设置')
          res.status(401).json({
            success: false,
            error: {
              code: 'DEV_CONFIG_MISSING',
              message: '开发模式需要在 .env 中设置 DEV_USER_ID'
            },
            timestamp: new Date().toISOString()
          })
          return
        }
        logger.debug('开发模式：无token请求，使用 DEV_USER_ID')
        req.user = buildDevFallbackUser(devUserId)
        next()
        return
      }
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '未提供认证token，请在Authorization头部提供Bearer token'
        },
        timestamp: new Date().toISOString()
      })
      return
    }

    // 验证token格式
    if (!token || token.length < 10) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN_FORMAT',
          message: 'Token格式无效'
        },
        timestamp: new Date().toISOString()
      })
      return
    }

    // 测试模式：特殊测试token直接通过（仅 NODE_ENV=test）
    if (IS_TEST && token === 'test-auth-token') {
      req.user = buildTestFallbackUser()
      next()
      return
    }

    // 开发模式：开发token直接通过（仅 NODE_ENV=development）
    if (IS_DEV && token === 'dev-token-for-local-development') {
      const devUserId = process.env.DEV_USER_ID
      if (!devUserId) {
        logger.warn('开发模式：DEV_USER_ID 未配置')
        res.status(401).json({
          success: false,
          error: { code: 'DEV_CONFIG_MISSING', message: '开发模式需要在 .env 中设置 DEV_USER_ID' },
          timestamp: new Date().toISOString()
        })
        return
      }
      req.user = buildDevFallbackUser(devUserId)
      next()
      return
    }

    const payload = verifyToken(token)
    if (!payload) {
      logger.warn('Token验证失败')
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: '无效的认证token或token已过期'
        },
        timestamp: new Date().toISOString()
      })
      return
    }

    const currentUser = await getCachedCurrentUserForPayload(payload)
    if (!currentUser) {
      sendRevokedSessionResponse(res)
      return
    }

    const currentUserView = toAuthUserView(currentUser)
    if (tokenVersionValue(payload.tokenVersion) < tokenVersionValue(currentUserView.tokenVersion)) {
      sendRevokedSessionResponse(res)
      return
    }

    if (currentUserView.passwordResetRequired && !isPasswordRotationRequest(req)) {
      sendPasswordChangeRequiredResponse(res)
      return
    }

    if (!isPasswordRotationRequest(req)) {
      const companyId = resolveCompanySessionScope(req, currentUserView.currentCompanyId)
      if (companyId && await isCompanySessionRevoked({
        userId: currentUserView.id,
        companyId,
        tokenIssuedAtSeconds: payload.iat,
      })) {
        sendCompanySessionRevokedResponse(res)
        return
      }
    }

    // 将用户信息附加到请求对象，角色以当前 users 行为准，避免 JWT 过期前冻结旧权限
    req.user = {
      id: currentUserView.id,
      username: currentUserView.username,
      email: currentUserView.email ?? undefined,
      globalRole: currentUserView.globalRole,
      currentCompanyId: currentUserView.currentCompanyId ?? null,
      tokenVersion: currentUserView.tokenVersion,
      passwordResetRequired: currentUserView.passwordResetRequired,
    }

    logger.debug('用户认证成功', { userId: req.user.id })
    next()
  } catch (error) {
    logger.error('认证中间件错误', { error })
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: '认证过程中发生错误'
      },
      timestamp: new Date().toISOString()
    })
  }
}

/**
 * 可选认证中间件 - 验证token但不强制要求
 * 用于某些可以匿名访问但需要识别登录用户的接口
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromRequest(req)

    if (!token || token.length < 10 || !getJwtSecret()) {
      next()
      return
    }

    const payload = verifyToken(token)
    if (payload) {
      const currentUser = await getCachedCurrentUserForPayload(payload)
      if (currentUser) {
        const currentUserView = toAuthUserView(currentUser)
        if (tokenVersionValue(payload.tokenVersion) >= tokenVersionValue(currentUserView.tokenVersion)) {
          const companyId = resolveCompanySessionScope(req, currentUserView.currentCompanyId)
          const companySessionRevoked = companyId
            ? await isCompanySessionRevoked({
                userId: currentUserView.id,
                companyId,
                tokenIssuedAtSeconds: payload.iat,
              })
            : false
          if (!companySessionRevoked) {
            req.user = {
              id: currentUserView.id,
              username: currentUserView.username,
              email: currentUserView.email ?? undefined,
              globalRole: currentUserView.globalRole,
              currentCompanyId: currentUserView.currentCompanyId ?? null,
              tokenVersion: currentUserView.tokenVersion,
              passwordResetRequired: currentUserView.passwordResetRequired,
            }
          }
        }
      }
    }

    next()
  } catch (error) {
    next()
  }
}

/**
 * 基础权限检查 - 验证用户登录和项目ID
 * 提取公共逻辑，供 requireProjectMember 和 requireProjectEditor 使用
 */
async function checkAuthAndProjectId(
  req: Request,
  res: Response,
  getProjectId: (req: Request) => string | undefined | Promise<string | undefined>
): Promise<{ userId: string; projectId: string } | null> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '请先登录'
      },
      timestamp: new Date().toISOString()
    })
    return null
  }

  const projectId = await getProjectId(req)

  if (!projectId) {
    const entityId = String(req.params?.id ?? '').trim()
    const entityWasNotFound = isUuidLike(entityId)
    res.status(entityWasNotFound ? 404 : 400).json({
      success: false,
      error: {
        code: entityWasNotFound ? 'RESOURCE_NOT_FOUND' : 'BAD_REQUEST',
        message: entityWasNotFound ? '请求的资源不存在' : '缺少项目ID'
      },
      timestamp: new Date().toISOString()
    })
    return null
  }

  return { userId: req.user.id, projectId }
}

/**
 * 检查用户是否是项目成员或所有者
 * 提取公共逻辑
 */
async function isProjectMemberOrOwner(userId: string, projectId: string, companyId?: string | null): Promise<boolean> {
  if (isPermissionSystemDisabled()) {
    return true
  }

  if (!isUuidLike(userId) || !isUuidLike(projectId)) {
    return false
  }

  return await getProjectPermissionLevel(userId, projectId, companyId) !== null
}

/**
 * 项目权限检查中间件工厂
 * 检查用户是否是项目成员
 */
export const requireProjectMember = (getProjectId: (req: Request) => string | undefined | Promise<string | undefined>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authResult = await checkAuthAndProjectId(req, res, getProjectId)
      if (!authResult) return

      const { userId, projectId } = authResult
      const requestedCompanyId = getRequestCompanyId(req)

      if (isPermissionSystemDisabled()) {
        grantRequestProjectScope(req, projectId)
        next()
        return
      }

      if (!isUuidLike(userId)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '当前登录身份无效，请重新登录后重试',
          },
          timestamp: new Date().toISOString(),
        })
        return
      }

      // 先检查项目是否存在，不存在返回 404 而非 403
      // 使用 executeSQLOne 绕过 RLS，确保非成员查询真实不存在的项目也能正确返回 404
      if (isUuidLike(projectId)) {
        const projectExists = await query(
          'SELECT id FROM public.projects WHERE id = $1 LIMIT 1',
          [projectId]
        )
        if (projectExists.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: '项目不存在'
            },
            timestamp: new Date().toISOString()
          })
          return
        }
      }

      const hasAccess = await isProjectMemberOrOwner(userId, projectId, requestedCompanyId)

      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '您没有权限访问此项目'
          },
          timestamp: new Date().toISOString()
        })
        return
      }

      grantRequestProjectScope(req, projectId)
      next()
    } catch (error) {
      logger.error('权限检查错误', { error })
      res.status(500).json({
        success: false,
        error: {
          code: 'PERMISSION_ERROR',
          message: '权限检查过程中发生错误'
        },
        timestamp: new Date().toISOString()
      })
    }
  }
}

/**
 * 检查用户是否有编辑权限（owner / admin / editor）
 * 提取公共逻辑
 */
async function isProjectEditor(userId: string, projectId: string, companyId?: string | null): Promise<boolean> {
  if (isPermissionSystemDisabled()) {
    return true
  }

  if (!isUuidLike(userId) || !isUuidLike(projectId)) {
    return false
  }
  const permissionLevel = await getProjectPermissionLevel(userId, projectId, companyId)
  return permissionLevel === 'owner' || permissionLevel === 'editor'
}

async function isProjectOwner(userId: string, projectId: string, companyId?: string | null): Promise<boolean> {
  if (isPermissionSystemDisabled()) {
    return true
  }

  const permissionLevel = await getProjectPermissionLevel(userId, projectId, companyId)
  return permissionLevel === 'owner'
}

/**
 * 项目编辑权限检查中间件工厂
 * 检查用户是否有编辑权限（owner / admin / editor）
 */
export const requireProjectEditor = (getProjectId: (req: Request) => string | undefined | Promise<string | undefined>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authResult = await checkAuthAndProjectId(req, res, getProjectId)
      if (!authResult) return

      const { userId, projectId } = authResult
      const requestedCompanyId = getRequestCompanyId(req)

      const hasEditAccess = await isProjectEditor(userId, projectId, requestedCompanyId)

      if (!hasEditAccess) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '您没有编辑此项目的权限'
          },
          timestamp: new Date().toISOString()
        })
        return
      }

      grantRequestProjectScope(req, projectId)
      next()
    } catch (error) {
      logger.error('编辑权限检查错误', { error })
      res.status(500).json({
        success: false,
        error: {
          code: 'PERMISSION_ERROR',
          message: '权限检查过程中发生错误'
        },
        timestamp: new Date().toISOString()
      })
    }
  }
}

export const requireProjectOwner = (getProjectId: (req: Request) => string | undefined | Promise<string | undefined>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authResult = await checkAuthAndProjectId(req, res, getProjectId)
      if (!authResult) return

      const { userId, projectId } = authResult
      const hasOwnerAccess = await isProjectOwner(userId, projectId, getRequestCompanyId(req))

      if (!hasOwnerAccess) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '您没有管理此项目的权限'
          },
          timestamp: new Date().toISOString()
        })
        return
      }

      grantRequestProjectScope(req, projectId)
      next()
    } catch (error) {
      logger.error('Owner 权限检查错误', { error })
      res.status(500).json({
        success: false,
        error: {
          code: 'PERMISSION_ERROR',
          message: '权限检查过程中发生错误'
        },
        timestamp: new Date().toISOString()
      })
    }
  }
}

/**
 * 资源所有权检查辅助函数
 * 检查用户是否有权访问特定资源
 */
export const checkResourceAccess = async (
  userId: string,
  resourceType: 'task' | 'milestone' | 'acceptance_plan' | 'pre_milestone',
  resourceId: string
): Promise<{ allowed: boolean; projectId?: string; error?: string }> => {
  try {
    if (isPermissionSystemDisabled()) {
      return { allowed: true }
    }

    const tableMap: Record<string, string> = {
      task: 'tasks',
      milestone: 'tasks',
      acceptance_plan: 'acceptance_plans',
      pre_milestone: 'pre_milestones'
    }

    const tableName = tableMap[resourceType]
    const resourcePredicate = resourceType === 'milestone' ? ' AND is_milestone = TRUE' : ''
    const row = await executeSQLOne<{ project_id?: string | null; created_by?: string | null }>(
      `SELECT project_id, created_by FROM ${tableName} WHERE id = ?${resourcePredicate} LIMIT 1`,
      [resourceId]
    )

    if (!row) return { allowed: false, error: '资源不存在' }

    const projectId = row.project_id

    if (!projectId) return { allowed: false, error: '无法确定项目ID' }

    const permissionLevel = await getProjectPermissionLevel(userId, projectId)
    if (permissionLevel) return { allowed: true, projectId }

    return { allowed: false, error: '无权访问此资源' }
  } catch (error) {
    logger.error('资源访问检查错误', { error, resourceType, resourceId })
    return { allowed: false, error: '检查权限时发生错误' }
  }
}
