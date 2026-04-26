// Projects API 路由

import { Router } from 'express'
import { z } from 'zod'
import { SupabaseService } from '../services/supabaseService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam, projectSchema, projectUpdateSchema } from '../middleware/validation.js'
import { authenticate, requireProjectMember, requireProjectOwner } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Project } from '../types/db.js'
import { getVisibleProjectIds } from '../auth/access.js'
import { executeSQL } from '../services/dbService.js'
import { dataQualityService } from '../services/dataQualityService.js'

const router = Router()
const supabase = new SupabaseService()
const PROJECT_LIST_CACHE_TTL_MS = Number(process.env.PROJECT_LIST_CACHE_TTL_MS ?? 15_000)

const projectLinkedTasksParamsSchema = z.object({
  id: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
})

type LinkedTaskItem = {
  id: string
  title: string
  status: string | null
  progress: number | null
  assignee_name: string | null
  planned_end_date: string | null
}

let projectListCache: { expiresAt: number; projects: Project[] } | null = null

async function getCachedProjects() {
  const now = Date.now()
  if (projectListCache && projectListCache.expiresAt > now) {
    return projectListCache.projects
  }

  const projects = await supabase.getProjects()
  projectListCache = {
    expiresAt: now + (Number.isFinite(PROJECT_LIST_CACHE_TTL_MS) && PROJECT_LIST_CACHE_TTL_MS > 0 ? PROJECT_LIST_CACHE_TTL_MS : 0),
    projects,
  }
  return projects
}

function clearProjectListCache() {
  projectListCache = null
}

function refreshProjectListCache(projects: Project[]) {
  const ttlMs = Number.isFinite(PROJECT_LIST_CACHE_TTL_MS) && PROJECT_LIST_CACHE_TTL_MS > 0
    ? PROJECT_LIST_CACHE_TTL_MS
    : 0
  projectListCache = {
    expiresAt: Date.now() + ttlMs,
    projects,
  }
}

function upsertProjectListCache(project: Project | null) {
  if (!projectListCache || !project) return
  const nextProjects = projectListCache.projects.filter((item) => item.id !== project.id)
  refreshProjectListCache([project, ...nextProjects])
}

function removeProjectFromListCache(projectId: string) {
  if (!projectListCache) return
  refreshProjectListCache(projectListCache.projects.filter((item) => item.id !== projectId))
}

// 所有路由都需要认证
router.use(authenticate)

// 获取所有项目
router.get('/', asyncHandler(async (req, res) => {
  logger.info('Fetching all projects')
  let projects = await getCachedProjects()

  if (req.user?.id) {
    const visibleProjectIds = await getVisibleProjectIds(req.user.id, req.user.globalRole)
    if (visibleProjectIds) {
      const visibleProjectIdSet = new Set(visibleProjectIds)
      projects = projects.filter((project) => visibleProjectIdSet.has(project.id))
    }
  }
  
  const response: ApiResponse<Project[]> = {
    success: true,
    data: projects,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 导出单个项目聚合数据
router.get('/:id/export', validateIdParam, requireProjectMember(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Exporting project aggregate data', { id })

  const [project, tasks, risks, milestones, members, invitations] = await Promise.all([
    supabase.getProject(id),
    supabase.getTasks(id),
    supabase.getRisks(id),
    supabase.getMilestones(id),
    supabase.getMembers(id),
    supabase.getInvitations(id),
  ])

  if (!project) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<{
    version: string
    exportedAt: string
    projects: Project[]
    tasks: typeof tasks
    risks: typeof risks
    milestones: typeof milestones
    members: typeof members
    invitations: typeof invitations
  }> = {
    success: true,
    data: {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      projects: [project],
      tasks,
      risks,
      milestones,
      members,
      invitations,
    },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

// 获取项目数据质量摘要。保留 /api/data-quality/project-summary 的同时，补齐 v1.1 清单中的项目级 alias。
router.get('/:id/data-quality-summary', validateIdParam, requireProjectMember(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  const month = String(req.query.month ?? '').trim() || undefined
  const summary = await dataQualityService.buildProjectSummary(id, month)
  const response: ApiResponse<typeof summary> = {
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个项目
router.get('/:id', validateIdParam, requireProjectMember(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching project', { id })
  
  const project = await supabase.getProject(id)
  
  if (!project) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  
  const response: ApiResponse<Project> = {
    success: true,
    data: project,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get(
  '/:id/milestones/:taskId/linked-tasks',
  validate(projectLinkedTasksParamsSchema, 'params'),
  requireProjectMember((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const { id: projectId, taskId } = req.params
    logger.info('Fetching milestone linked tasks', { projectId, taskId })

    const task = await supabase.getTask(taskId)
    if (!task || task.project_id !== projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const linkedTasks = await executeSQL<LinkedTaskItem>(
      `SELECT id,
              title,
              status,
              progress,
              COALESCE(NULLIF(assignee_name, ''), assignee) AS assignee_name,
              COALESCE(planned_end_date, end_date) AS planned_end_date
         FROM tasks
        WHERE project_id = ?
          AND (parent_id = ? OR milestone_id = ?)
        ORDER BY COALESCE(planned_end_date, end_date) ASC, updated_at DESC, title ASC`,
      [projectId, taskId, taskId],
    )

    const response: ApiResponse<LinkedTaskItem[]> = {
      success: true,
      data: linkedTasks ?? [],
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

// 创建项目
router.post('/', validate(projectSchema), asyncHandler(async (req, res) => {
  logger.info('Creating project', req.body)

  const project = await supabase.createProject({
    ...req.body,
    owner_id: req.user?.id,
    created_by: req.user?.id,
  })
  upsertProjectListCache(project)
  
  const response: ApiResponse<Project> = {
    success: true,
    data: project,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 创建项目（支持指定ID - 用于种子数据/测试）
router.post('/with-id', validate(projectSchema), asyncHandler(async (req, res) => {
  logger.info('Creating project with specified ID', req.body)

  const project = await supabase.createProject({
    ...req.body,
    owner_id: req.user?.id,
    created_by: req.user?.id,
  })
  upsertProjectListCache(project)
  
  const response: ApiResponse<Project> = {
    success: true,
    data: project,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新项目
router.put('/:id', validateIdParam, requireProjectOwner(req => req.params.id), validate(projectUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const updates = req.body
  const expectedVersion = updates.version

  logger.info('Updating project', { id, updates, expectedVersion })

  try {
    const project = await supabase.updateProject(id, updates, expectedVersion)
    upsertProjectListCache(project)
    
    if (!project) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }
    
    const response: ApiResponse<Project> = {
      success: true,
      data: project,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    if (error.message && error.message.includes('VERSION_MISMATCH')) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      }
      return res.status(409).json(response)
    }
    throw error
  }
}))

// 删除项目
router.delete('/:id', validateIdParam, requireProjectOwner(req => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting project', { id })
  
  await supabase.deleteProject(id)
  removeProjectFromListCache(id)
  
  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
