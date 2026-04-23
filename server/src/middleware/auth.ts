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
import { query } from '../database.js'

// 扩展Express Request类型
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email?: string
        role?: string
        globalRole?: string
      }
    }
  }
}

// 严格区分开发/生产环境：只有明确设置 NODE_ENV=development 才是开发模式
const IS_DEV = process.env.NODE_ENV === 'development'
const IS_TEST = process.env.NODE_ENV === 'test'
const DEFAULT_TEST_USER_ID = '00000000-0000-4000-8000-000000000001'

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
  }
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
    const token = extractTokenFromRequest(req)

    if (!token) {
      if (IS_TEST) {
        req.user = buildTestFallbackUser()
        next()
        return
      }

      // 仅开发模式允许无token，使用环境变量中配置的开发用户ID
      if (IS_DEV) {
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
        req.user = { id: devUserId, email: 'admin@localhost', role: 'owner', globalRole: 'company_admin' }
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
      req.user = { id: devUserId, email: 'admin@localhost', role: 'owner', globalRole: 'company_admin' }
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

    // 将用户信息附加到请求对象
    req.user = {
      id: payload.userId,
      role: payload.role || 'user',
      globalRole: payload.globalRole || 'regular',
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
      req.user = {
        id: payload.userId,
        role: payload.role || 'user',
        globalRole: payload.globalRole || 'regular',
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
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: '缺少项目ID'
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
async function isProjectMemberOrOwner(userId: string, projectId: string): Promise<boolean> {
  if (!isUuidLike(userId) || !isUuidLike(projectId)) {
    return false
  }

  const projectResult = await query(
    'SELECT owner_id FROM public.projects WHERE id = $1 LIMIT 1',
    [projectId],
  )
  const project = projectResult.rows[0] as { owner_id?: string | null } | undefined

  if (project?.owner_id === userId) {
    return true
  }

  const memberResult = await query(
    `SELECT id
       FROM public.project_members
      WHERE project_id = $1
        AND user_id = $2
        AND COALESCE(is_active, true) = true
      LIMIT 1`,
    [projectId, userId],
  )

  return memberResult.rows.length > 0
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

      const hasAccess = await isProjectMemberOrOwner(userId, projectId)

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
 * 检查用户是否有编辑权限（owner或editor）
 * 提取公共逻辑
 */
async function isProjectEditor(userId: string, projectId: string): Promise<boolean> {
  if (!isUuidLike(userId) || !isUuidLike(projectId)) {
    return false
  }

  // 检查是否是项目所有者（优先检查）
  const projectOwner = await executeSQLOne<{ owner_id?: string | null }>(
    'SELECT owner_id FROM projects WHERE id = ? LIMIT 1',
    [projectId]
  )

  if (projectOwner?.owner_id === userId) {
    return true
  }

  // 检查是否有编辑权限（检查 permission_level）
  const member = await executeSQLOne(
    'SELECT permission_level FROM project_members WHERE project_id = ? AND user_id = ? AND permission_level IN (?, ?) LIMIT 1',
    [projectId, userId, 'owner', 'editor']
  )

  return member !== null
}

async function isProjectOwner(userId: string, projectId: string): Promise<boolean> {
  const permissionLevel = await getProjectPermissionLevel(userId, projectId)
  return permissionLevel === 'owner'
}

/**
 * 项目编辑权限检查中间件工厂
 * 检查用户是否有编辑权限（owner或editor）
 */
export const requireProjectEditor = (getProjectId: (req: Request) => string | undefined | Promise<string | undefined>) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authResult = await checkAuthAndProjectId(req, res, getProjectId)
      if (!authResult) return

      const { userId, projectId } = authResult

      const hasEditAccess = await isProjectEditor(userId, projectId)

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
      const hasOwnerAccess = await isProjectOwner(userId, projectId)

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
    const tableMap: Record<string, string> = {
      task: 'tasks',
      milestone: 'milestones',
      acceptance_plan: 'acceptance_plans',
      pre_milestone: 'pre_milestones'
    }

    const tableName = tableMap[resourceType]
    const row = await executeSQLOne<{ project_id?: string | null; created_by?: string | null }>(
      `SELECT project_id, created_by FROM ${tableName} WHERE id = ? LIMIT 1`,
      [resourceId]
    )

    if (!row) return { allowed: false, error: '资源不存在' }

    // 如果是创建者，允许访问
    if (row.created_by === userId) return { allowed: true, projectId: row.project_id }

    const projectId = row.project_id

    if (!projectId) return { allowed: false, error: '无法确定项目ID' }

    // 检查是否是项目成员
    const member = await executeSQLOne(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ? AND is_active = 1 LIMIT 1',
      [projectId, userId]
    )

    if (member) return { allowed: true, projectId }

    // 检查是否是项目所有者
    const project = await executeSQLOne<{ owner_id?: string | null }>(
      'SELECT owner_id FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    )

    if (project?.owner_id === userId) {
      return { allowed: true, projectId }
    }

    return { allowed: false, error: '无权访问此资源' }
  } catch (error) {
    logger.error('资源访问检查错误', { error, resourceType, resourceId })
    return { allowed: false, error: '检查权限时发生错误' }
  }
}
