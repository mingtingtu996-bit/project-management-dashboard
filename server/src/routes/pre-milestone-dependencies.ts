// 证照依赖关系 API 路由

import { type Request, type Response, Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { getProjectPermissionLevel } from '../auth/access.js'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import type { ApiResponse } from '../types/index.js'

const router = Router()
router.use(authenticate)

const preMilestoneDependencyIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
})

const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1, 'projectId 不能为空'),
})

const preMilestoneDependencyCreateBodySchema = z.object({
  project_id: z.string().trim().optional(),
  source_milestone_id: z.string().trim().optional(),
  target_milestone_id: z.string().trim().optional(),
  dependency_kind: z.string().trim().optional(),
  notes: z.string().optional().nullable(),
}).passthrough()

async function resolveMilestoneProjectId(milestoneId?: string | null) {
  if (!milestoneId) return null
  const row = await executeSQLOne<{ project_id?: string | null }>(
    'SELECT project_id FROM pre_milestones WHERE id = ? LIMIT 1',
    [milestoneId],
  )
  return row?.project_id ?? null
}

async function requireProjectEditorAccess(req: Request, res: Response, projectId: string | null) {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: '请先登录' },
      timestamp: new Date().toISOString(),
    }
    res.status(401).json(response)
    return false
  }

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
      timestamp: new Date().toISOString(),
    }
    res.status(404).json(response)
    return false
  }

  const permissionLevel = await getProjectPermissionLevel(req.user.id, projectId)
  if (permissionLevel !== 'owner' && permissionLevel !== 'editor') {
    const response: ApiResponse = {
      success: false,
      error: { code: 'FORBIDDEN', message: '您没有编辑此项目的权限' },
      timestamp: new Date().toISOString(),
    }
    res.status(403).json(response)
    return false
  }

  return true
}

// 获取项目的所有证照依赖关系
router.get('/project/:projectId', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { projectId } = req.params
  logger.info('Fetching pre-milestone dependencies', { projectId })

  // 获取项目所有证照
  const milestones = await executeSQL(
    'SELECT id, name, milestone_type, status FROM pre_milestones WHERE project_id = ?',
    [projectId]
  )

  const milestoneList = milestones || []

  // 获取依赖关系
  const milestoneIds: string[] = milestoneList.map((m: any) => m.id)
  let dependencies: any[] = []

  if (milestoneIds.length > 0) {
    const placeholders = milestoneIds.map(() => '?').join(', ')
    dependencies = await executeSQL(
      `SELECT * FROM pre_milestone_dependencies WHERE source_milestone_id IN (${placeholders})`,
      milestoneIds
    ) || []
  }

  // 构建依赖图
  const dependencyGraph = milestoneList.map((m: any) => ({
    ...m,
    dependencies: dependencies
      .filter((d: any) => d.source_milestone_id === m.id)
      .map((d: any) => {
        const target = milestoneList.find((ms: any) => ms.id === d.target_milestone_id)
        return {
          ...d,
          target_milestone: target
        }
      })
  }))

  const response: ApiResponse<typeof dependencyGraph> = {
    success: true,
    data: dependencyGraph,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建依赖关系
router.post('/', validate(preMilestoneDependencyCreateBodySchema), asyncHandler(async (req, res) => {
  logger.info('Creating pre-milestone dependency', req.body)

  if (!req.body?.source_milestone_id || !req.body?.target_milestone_id) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'source_milestone_id 和 target_milestone_id 不能为空',
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const sourceProjectId = await resolveMilestoneProjectId(req.body.source_milestone_id)
  const targetProjectId = await resolveMilestoneProjectId(req.body.target_milestone_id)
  if (sourceProjectId && targetProjectId && sourceProjectId !== targetProjectId) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'source_milestone_id 和 target_milestone_id 必须属于同一项目',
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const resolvedProjectId = sourceProjectId ?? targetProjectId ?? null
  if (req.body.project_id && resolvedProjectId && req.body.project_id !== resolvedProjectId) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'project_id 必须与源/目标证照所在项目一致',
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const projectId = resolvedProjectId ?? req.body.project_id ?? null
  if (!(await requireProjectEditorAccess(req, res, projectId))) {
    return
  }

  const id = uuidv4()
  const now = new Date().toISOString()
  const payload = {
    ...req.body,
    project_id: projectId,
  }

  const fields: string[] = ['id', 'created_at']
  const values: any[] = [id, now]
  const placeholders: string[] = ['?', '?']

  for (const [key, val] of Object.entries(payload)) {
    fields.push(key)
    values.push(val)
    placeholders.push('?')
  }

  await executeSQL(
    `INSERT INTO pre_milestone_dependencies (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  )

  const data = await executeSQLOne(
    'SELECT * FROM pre_milestone_dependencies WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 删除依赖关系
router.delete('/:id', validate(preMilestoneDependencyIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting pre-milestone dependency', { id })

  const current = await executeSQLOne<{ project_id?: string | null; source_milestone_id?: string | null; target_milestone_id?: string | null }>(
    'SELECT project_id, source_milestone_id, target_milestone_id FROM pre_milestone_dependencies WHERE id = ? LIMIT 1',
    [id],
  )

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'DEPENDENCY_NOT_FOUND', message: '证照依赖不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const projectId = current.project_id ?? await resolveMilestoneProjectId(current.source_milestone_id) ?? await resolveMilestoneProjectId(current.target_milestone_id)
  if (!(await requireProjectEditorAccess(req, res, projectId))) {
    return
  }

  await executeSQL('DELETE FROM pre_milestone_dependencies WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
