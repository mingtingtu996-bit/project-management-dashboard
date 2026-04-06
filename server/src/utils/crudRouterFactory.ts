/**
 * CRUD 路由工厂
 * 为通用实体创建标准的 CRUD API 路由
 * 
 * 使用示例:
 * ```typescript
 * const taskRouter = createCRUDRouter<Task>({
 *   tableName: 'tasks',
 *   entityName: '任务',
 *   createSchema: taskSchema,
 *   updateSchema: taskUpdateSchema,
 *   hooks: {
 *     beforeCreate: async (data, req) => { ... },
 *     afterUpdate: async (entity, req) => { ... }
 *   }
 * })
 * ```
 */

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import { authenticate as requireAuth } from '../middleware/auth.js'
import type { ApiResponse } from '../types/index.js'
import { SupabaseService } from '../services/supabaseService.js'

// ============================================
// 类型定义
// ============================================

export interface CRUDRouterOptions<T extends Record<string, any>> {
  /** 数据库表名 */
  tableName: string
  /** 实体中文名称（用于日志和错误消息） */
  entityName: string
  /** 创建时的验证 Schema */
  createSchema?: z.ZodSchema
  /** 更新时的验证 Schema */
  updateSchema?: z.ZodSchema
  /** 路由配置 */
  config?: {
    /** 是否启用创建接口 */
    enableCreate?: boolean
    /** 是否启用更新接口 */
    enableUpdate?: boolean
    /** 是否启用删除接口 */
    enableDelete?: boolean
    /** 是否启用列表查询接口 */
    enableList?: boolean
    /** 是否启用单条查询接口 */
    enableGet?: boolean
    /** 是否需要认证 */
    requireAuth?: boolean
  }
  /** 生命周期钩子 */
  hooks?: {
    /** 创建前钩子 */
    beforeCreate?: (data: Partial<T>, req: Request) => Promise<Partial<T>> | Partial<T>
    /** 创建后钩子 */
    afterCreate?: (entity: T, req: Request) => Promise<void> | void
    /** 更新前钩子 */
    beforeUpdate?: (id: string, data: Partial<T>, req: Request) => Promise<Partial<T>> | Partial<T>
    /** 更新后钩子 */
    afterUpdate?: (entity: T, req: Request) => Promise<void> | void
    /** 删除前钩子 */
    beforeDelete?: (id: string, req: Request) => Promise<boolean> | boolean
    /** 删除后钩子 */
    afterDelete?: (id: string, req: Request) => Promise<void> | void
    /** 查询前钩子（用于修改查询条件） */
    beforeList?: (query: Record<string, any>, req: Request) => Promise<Record<string, any>> | Record<string, any>
    /** 查询后钩子（用于修改返回数据） */
    afterList?: (entities: T[], req: Request) => Promise<T[]> | T[]
  }
  /** 自定义路由处理器 */
  customRoutes?: (router: Router) => void
}

// ============================================
// CRUD 路由工厂函数
// ============================================

export function createCRUDRouter<T extends Record<string, any>>(
  options: CRUDRouterOptions<T>
): Router {
  const router = Router()
  const supabase = new SupabaseService()

  const {
    tableName,
    entityName,
    createSchema,
    updateSchema,
    config = {},
    hooks = {},
    customRoutes
  } = options

  const {
    enableCreate = true,
    enableUpdate = true,
    enableDelete = true,
    enableList = true,
    enableGet = true,
    requireAuth: requireAuthEnabled = true
  } = config

  // 应用认证中间件
  if (requireAuthEnabled) {
    router.use(requireAuth)
  }

  // ============================================
  // 列表查询
  // ============================================
  if (enableList) {
    router.get('/', asyncHandler(async (req: Request, res: Response) => {
      const projectId = req.query.projectId as string | undefined
      logger.info(`Fetching ${tableName}`, { projectId })

      let query: Record<string, any> = {}
      if (projectId) {
        query.project_id = projectId
      }

      // 应用 beforeList 钩子
      if (hooks.beforeList) {
        query = await hooks.beforeList(query, req)
      }

      const entities = await supabase.query<T>(tableName, query)

      // 应用 afterList 钩子
      const result = hooks.afterList ? await hooks.afterList(entities, req) : entities

      const response: ApiResponse<T[]> = {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    }))
  }

  // ============================================
  // 单条查询
  // ============================================
  if (enableGet) {
    router.get('/:id', validateIdParam, asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params
      logger.info(`Fetching ${entityName}`, { id })

      const entities = await supabase.query<T>(tableName, { id })
      const entity = entities[0]

      if (!entity) {
        const response: ApiResponse = {
          success: false,
          error: { 
            code: `${tableName.toUpperCase()}_NOT_FOUND`, 
            message: `${entityName}不存在` 
          },
          timestamp: new Date().toISOString(),
        }
        return res.status(404).json(response)
      }

      const response: ApiResponse<T> = {
        success: true,
        data: entity,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    }))
  }

  // ============================================
  // 创建
  // ============================================
  if (enableCreate) {
    const validators = createSchema ? [validate(createSchema)] : []
    router.post('/', ...validators, asyncHandler(async (req: Request, res: Response) => {
      logger.info(`Creating ${entityName}`, req.body)

      let data = req.body

      // 应用 beforeCreate 钩子
      if (hooks.beforeCreate) {
        data = await hooks.beforeCreate(data, req)
      }

      const entity = await supabase.create<T>(tableName, {
        ...data,
        version: 1,
      })

      // 应用 afterCreate 钩子
      if (hooks.afterCreate) {
        await hooks.afterCreate(entity, req)
      }

      const response: ApiResponse<T> = {
        success: true,
        data: entity,
        timestamp: new Date().toISOString(),
      }
      res.status(201).json(response)
    }))
  }

  // ============================================
  // 更新
  // ============================================
  if (enableUpdate) {
    const validators = [validateIdParam]
    if (updateSchema) {
      validators.push(validate(updateSchema))
    }

    router.put('/:id', ...validators, asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params
      const { version, ...updates } = req.body

      logger.info(`Updating ${entityName}`, { id, version })

      let data = updates

      // 应用 beforeUpdate 钩子
      if (hooks.beforeUpdate) {
        data = await hooks.beforeUpdate(id, data, req)
      }

      const entity = await supabase.update<T>(tableName, id, data, version)

      // 应用 afterUpdate 钩子
      if (hooks.afterUpdate) {
        await hooks.afterUpdate(entity, req)
      }

      const response: ApiResponse<T> = {
        success: true,
        data: entity,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    }))
  }

  // ============================================
  // 删除
  // ============================================
  if (enableDelete) {
    router.delete('/:id', validateIdParam, asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params

      logger.info(`Deleting ${entityName}`, { id })

      // 应用 beforeDelete 钩子（可用于权限检查）
      if (hooks.beforeDelete) {
        const canDelete = await hooks.beforeDelete(id, req)
        if (!canDelete) {
          const response: ApiResponse = {
            success: false,
            error: { 
              code: 'DELETE_FORBIDDEN', 
              message: `无权删除该${entityName}` 
            },
            timestamp: new Date().toISOString(),
          }
          return res.status(403).json(response)
        }
      }

      await supabase.delete(tableName, id)

      // 应用 afterDelete 钩子
      if (hooks.afterDelete) {
        await hooks.afterDelete(id, req)
      }

      const response: ApiResponse = {
        success: true,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    }))
  }

  // ============================================
  // 自定义路由
  // ============================================
  if (customRoutes) {
    customRoutes(router)
  }

  return router
}

// ============================================
// 批量创建 CRUD 路由（用于简化多个实体的注册）
// ============================================

export interface BatchCRUDConfig<T extends Record<string, any>> {
  path: string
  options: CRUDRouterOptions<T>
}

export function registerCRUDRoutes<T extends Record<string, any>>(
  app: any,
  configs: BatchCRUDConfig<T>[]
): void {
  for (const { path, options } of configs) {
    const router = createCRUDRouter<T>(options)
    app.use(path, router)
    logger.info(`Registered CRUD routes: ${path}`)
  }
}

// ============================================
// 导出类型
// ============================================

export type { Router }
