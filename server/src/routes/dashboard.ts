// Dashboard API 路由
// 项目健康度、Top风险、里程碑汇总、进度详情

import { Router } from 'express'
import { getTasks, getRisks, getMilestones, supabase } from '../services/dbService.js'
import {
  getAllProjectExecutionSummaries,
  getProjectExecutionSummary,
} from '../services/projectExecutionSummaryService.js'
import { calculateProjectHealth } from '../services/projectHealthService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import { getVisibleProjectIds } from '../auth/access.js'

const router = Router()

// 所有路由都需要认证
router.use(authenticate)

// GET /api/dashboard/project-summary?projectId=
router.get('/project-summary', requireProjectMember(req => req.query.projectId as string | undefined), asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching unified project execution summary', { projectId })
  const summary = await getProjectExecutionSummary(projectId)

  if (!summary) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<typeof summary> = {
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// GET /api/dashboard/projects-summary
router.get('/projects-summary', asyncHandler(async (req, res) => {
  logger.info('Fetching unified multi-project execution summaries')
  let summaries = await getAllProjectExecutionSummaries()

  if (req.user?.id) {
    const visibleProjectIds = await getVisibleProjectIds(req.user.id, req.user.globalRole)
    if (visibleProjectIds) {
      const visibleProjectIdSet = new Set(visibleProjectIds)
      summaries = summaries.filter((summary) => visibleProjectIdSet.has(summary.id))
    }
  }

  const response: ApiResponse<typeof summaries> = {
    success: true,
    data: summaries,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 计算整体进度
function calculateOverallProgress(tasks: any[]) {
  const today = new Date()
  const totalTasks = tasks.length
  
  if (totalTasks === 0) {
    return {
      currentProgress: 0,
      targetProgress: 0,
      progressDeviation: 0
    }
  }
  
  // 当前进度：工期加权平均（无日期任务取权重 1 天）
  const getWeight = (t: any): number => {
    if (!t.planned_start_date || !t.planned_end_date) return 1
    return Math.max(1, Math.round(
      (new Date(t.planned_end_date).getTime() - new Date(t.planned_start_date).getTime()) / 86400000
    ))
  }
  const totalWeight = tasks.reduce((sum, t) => sum + getWeight(t), 0)
  const currentProgress = Math.round(
    tasks.reduce((sum, t) => sum + (t.progress || 0) * getWeight(t), 0) / (totalWeight || 1)
  )
  
  // 目标进度：基于计划时间计算
  let targetProgress = 0
  const tasksWithDates = tasks.filter((t: any) => t.planned_start_date && t.planned_end_date)
  if (tasksWithDates.length > 0) {
    const totalPlannedProgress = tasksWithDates.reduce((sum, t) => {
      const start = new Date(t.planned_start_date)
      const end = new Date(t.planned_end_date)
      const totalDuration = end.getTime() - start.getTime()
      if (totalDuration <= 0) return sum + 100
      const elapsed = Math.max(0, today.getTime() - start.getTime())
      const plannedProgress = Math.min(100, (elapsed / totalDuration) * 100)
      return sum + plannedProgress
    }, 0)
    targetProgress = Math.round(totalPlannedProgress / tasksWithDates.length)
  }
  
  // 进度偏差
  const progressDeviation = currentProgress - targetProgress
  
  return {
    currentProgress,
    targetProgress,
    progressDeviation
  }
}

// 实体数据置信度配置 - 可扩展支持不同实体类型
const entityConfidenceConfig: Record<string, {
  requiredFields: string[];
  updateField: string;
  timelinessDays: number;
}> = {
  tasks: {
    requiredFields: ['progress', 'status', 'planned_start_date', 'planned_end_date'],
    updateField: 'updated_at',
    timelinessDays: 7
  },
  risks: {
    requiredFields: ['title', 'level', 'status', 'probability'],
    updateField: 'updated_at',
    timelinessDays: 14
  },
  milestones: {
    requiredFields: ['title', 'planned_date', 'status'],
    updateField: 'updated_at',
    timelinessDays: 7
  }
}

// 计算数据置信度 - 支持多实体自动化评估
function calculateDataConfidence(
  items: any[],
  entityType: 'tasks' | 'risks' | 'milestones' = 'tasks'
) {
  if (items.length === 0) {
    return {
      completionRate: 100,
      updateTimeliness: 100,
      entityType,
      totalItems: 0
    }
  }
  
  const config = entityConfidenceConfig[entityType]
  
  // 填报完整度：必填字段完成率
  const requiredFields = config.requiredFields
  let totalFields = items.length * requiredFields.length
  let completedFields = 0
  
  items.forEach(item => {
    requiredFields.forEach(field => {
      if (item[field] !== null && item[field] !== undefined && item[field] !== '') {
        completedFields++
      }
    })
  })
  
  const completionRate = Math.round((completedFields / totalFields) * 100)
  
  // 更新及时性：最近N天内有更新的记录比例
  const timelinessDays = config.timelinessDays
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - timelinessDays)
  
  const updateField = config.updateField
  const recentlyUpdated = items.filter(item => {
    if (!item[updateField]) return false
    return new Date(item[updateField]) >= cutoffDate
  }).length
  
  const updateTimeliness = Math.round((recentlyUpdated / items.length) * 100)
  
  return {
    completionRate,
    updateTimeliness,
    entityType,
    totalItems: items.length,
    timelinessDays
  }
}

// 计算里程碑目标进度（基于计划日期）
function calculateTargetProgress(milestones: any[]): number {
  if (milestones.length === 0) return 0
  
  const now = new Date()
  let shouldBeCompleted = 0
  
  milestones.forEach(m => {
    if (m.planned_date) {
      const plannedDate = new Date(m.planned_date)
      if (plannedDate <= now) {
        shouldBeCompleted++
      }
    }
  })
  
  return Math.round((shouldBeCompleted / milestones.length) * 100)
}

// 获取WBS分项进度（楼栋级别）
async function getWBSBuildingProgress(projectId?: string) {
  try {
    // 从wbs_nodes表查询楼栋级别的进度
    let query = supabase
      .from('wbs_nodes')
      .select('*')
      .eq('node_type', 'building')
      .order('node_code', { ascending: true })
    
    if (projectId) {
      query = query.eq('project_id', projectId)
    }
    
    const { data, error } = await query.limit(10)
    
    if (error || !data || data.length === 0) {
      // 如果没有wbs_nodes数据，尝试从tasks表的wbs_code解析
      return null
    }
    
    return data.map((node: any) => ({
      id: node.id,
      name: node.node_name || node.name || `${node.node_code}号楼`,
      code: node.node_code,
      progress: node.progress || 0,
      status: node.status || '进行中'
    }))
  } catch (err) {
    logger.error('获取WBS分项进度失败', { error: err, projectId })
    return null
  }
}

// 从tasks表的wbs_code解析楼栋进度
function parseBuildingProgressFromTasks(tasks: any[]) {
  const buildingMap = new Map<string, { name: string; totalProgress: number; count: number }>()
  
  tasks.forEach(t => {
    const wbsCode = t.wbs_code || ''
    // 解析WBS编码，如 "01.01.01" 表示1号楼
    const match = wbsCode.match(/^(\d+)/)
    if (match) {
      const buildingNum = match[1]
      const buildingKey = `building-${buildingNum}`
      const buildingName = `${parseInt(buildingNum)}#楼`
      
      if (!buildingMap.has(buildingKey)) {
        buildingMap.set(buildingKey, { name: buildingName, totalProgress: 0, count: 0 })
      }
      
      const building = buildingMap.get(buildingKey)!
      building.totalProgress += t.progress || 0
      building.count++
    }
  })
  
  return Array.from(buildingMap.entries()).map(([key, data]) => ({
    id: key,
    name: data.name,
    code: key.replace('building-', ''),
    progress: data.count > 0 ? Math.round(data.totalProgress / data.count) : 0,
    status: '进行中'
  }))
}

// GET /api/dashboard/health-score?projectId=
router.get('/health-score', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching health score', { projectId })

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const result = await calculateProjectHealth(projectId)

  const response: ApiResponse<typeof result> = {
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// GET /api/dashboard/progress-details?projectId=&entityType=
// 返回整体进度、数据置信度（支持多实体）、WBS分项进度
router.get('/progress-details', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  const entityType = (req.query.entityType as 'tasks' | 'risks' | 'milestones') || 'tasks'
  logger.info('Fetching progress details', { projectId, entityType })

  // 根据实体类型获取数据
  let items: any[] = []
  let overallProgress = { currentProgress: 0, targetProgress: 0, progressDeviation: 0 }
  
  if (entityType === 'tasks') {
    items = await getTasks(projectId)
    overallProgress = calculateOverallProgress(items)
  } else if (entityType === 'risks') {
    items = await getRisks(projectId)
    // 风险没有进度概念，返回完成率
    const total = items.length
    const resolved = items.filter(r => r.status === '已解决' || r.status === 'closed').length
    overallProgress = {
      currentProgress: total > 0 ? Math.round((resolved / total) * 100) : 100,
      targetProgress: 100,
      progressDeviation: 0
    }
  } else if (entityType === 'milestones') {
    items = await getMilestones(projectId)
    // 里程碑进度
    const total = items.length
    const completed = items.filter(m => m.status === 'completed').length
    overallProgress = {
      currentProgress: total > 0 ? Math.round((completed / total) * 100) : 0,
      targetProgress: calculateTargetProgress(items),
      progressDeviation: 0
    }
  }
  
  // 计算数据置信度（自动根据实体类型评估）
  const dataConfidence = calculateDataConfidence(items, entityType)
  
  // 获取WBS分项进度（仅tasks类型）
  let buildingProgress: any[] = []
  if (entityType === 'tasks') {
    buildingProgress = await getWBSBuildingProgress(projectId)
    if (!buildingProgress || buildingProgress.length === 0) {
      buildingProgress = parseBuildingProgressFromTasks(items)
    }
  }

  const result = {
    overall: overallProgress,
    dataConfidence,
    buildingProgress,
    hasRealData: entityType === 'tasks' ? buildingProgress.length > 0 : items.length > 0,
    entityType
  }

  const response: ApiResponse<typeof result> = {
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// GET /api/dashboard/top-risks?projectId=
router.get('/top-risks', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  const limit = parseInt(req.query.limit as string) || 5
  logger.info('Fetching top risks', { projectId, limit })

  const risks = await getRisks(projectId)

  // 按严重程度排序：critical > high > medium > low
  const levelOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    mitigating: 2,
    low: 3,
    identified: 3,
    closed: 4,
  }

  const sortedRisks = [...risks].sort((a, b) => {
    const aOrder = levelOrder[a.level || a.status] ?? 4
    const bOrder = levelOrder[b.level || b.status] ?? 4
    if (aOrder !== bOrder) return aOrder - bOrder
    // 同级按概率*影响排序
    const aScore = (a.probability || 5) * (a.impact || 5)
    const bScore = (b.probability || 5) * (b.impact || 5)
    return bScore - aScore
  })

  const topRisks = sortedRisks.slice(0, limit)

  // 关联任务信息
  const allTasks = await getTasks(projectId)
  const risksWithTasks = topRisks.map(risk => ({
    ...risk,
    related_task: risk.task_id
      ? allTasks.find(t => t.id === risk.task_id) || null
      : null,
  }))

  const response: ApiResponse<typeof risksWithTasks> = {
    success: true,
    data: risksWithTasks,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// GET /api/dashboard/milestones-summary?projectId=
router.get('/milestones-summary', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching milestones summary', { projectId })

  const milestones = await getMilestones(projectId)
  const now = new Date()
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const completed = milestones.filter((m: any) => m.status === 'completed' || m.status === '已完成')
  const overdue = milestones.filter((m: any) => {
    if (m.status === 'completed' || m.status === '已完成') return false
    const targetDate = new Date(m.planned_end_date || m.target_date || m.due_date || '')
    return targetDate < now
  })
  const upcoming = milestones.filter((m: any) => {
    if (m.status === 'completed' || m.status === '已完成') return false
    const targetDate = new Date(m.planned_end_date || m.target_date || m.due_date || '')
    return targetDate >= now && targetDate <= thirtyDaysLater
  })

  // 即将到期的里程碑（30天内），按日期排序
  const upcomingMilestones = milestones
    .filter((m: any) => {
      if (m.status === 'completed' || m.status === '已完成') return false
      const targetDate = new Date(m.planned_end_date || m.target_date || m.due_date || '')
      return targetDate <= thirtyDaysLater
    })
    .map((m: any) => ({
      ...m,
      days_remaining: Math.ceil(
        (new Date(m.planned_end_date || m.target_date || m.due_date).getTime() - now.getTime()) /
        (1000 * 60 * 60 * 24)
      ),
    }))
    .sort((a: any, b: any) => a.days_remaining - b.days_remaining)

  const result = {
    total: milestones.length,
    completed: completed.length,
    overdue: overdue.length,
    upcoming: upcoming.length,
    completion_rate: milestones.length > 0
      ? Math.round((completed.length / milestones.length) * 100)
      : 0,
    upcoming_milestones: upcomingMilestones,
  }

  const response: ApiResponse<typeof result> = {
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
