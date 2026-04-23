// 审计日志类型和存储
// 第三阶段：安全与测试 - 审计日志

import { z } from 'zod'
import { getBrowserStorage, safeJsonParse, safeStorageGet, safeStorageSet } from './browserStorage'
import { generateId } from './localDb'

// ============================================
// 审计日志 Schema
// ============================================

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  user_id: z.string().uuid(),
  user_name: z.string(),
  action: z.string(), // 操作类型: create, update, delete, view, export, invite, etc.
  resource_type: z.string(), // 资源类型: task, risk, milestone, project, member, etc.
  resource_id: z.string().uuid().optional(),
  resource_name: z.string().optional(), // 资源名称（用于显示）
  details: z.record(z.any()).optional(), // 操作的详细信息
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  timestamp: z.string().datetime(),
})

export type AuditLog = z.infer<typeof AuditLogSchema>
const AuditLogListSchema = z.array(AuditLogSchema)

// ============================================
// 操作类型定义
// ============================================

export const AuditActions = {
  // 项目操作
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_VIEW: 'project:view',
  
  // 任务操作
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_VIEW: 'task:view',
  
  // 风险操作
  RISK_CREATE: 'risk:create',
  RISK_UPDATE: 'risk:update',
  RISK_DELETE: 'risk:delete',
  RISK_VIEW: 'risk:view',
  
  // 里程碑操作
  MILESTONE_CREATE: 'milestone:create',
  MILESTONE_UPDATE: 'milestone:update',
  MILESTONE_DELETE: 'milestone:delete',
  MILESTONE_VIEW: 'milestone:view',
  
  // 成员操作
  MEMBER_INVITE: 'member:invite',
  MEMBER_REMOVE: 'member:remove',
  MEMBER_UPDATE: 'member:update',
  
  // 数据操作
  DATA_EXPORT: 'data:export',
  DATA_IMPORT: 'data:import',
  
  // 设置操作
  SETTINGS_UPDATE: 'settings:update',
} as const

// ============================================
// 审计日志存储（使用 localStorage）
// ============================================

const AUDIT_LOG_KEY = 'pm_audit_logs'
const MAX_LOGS = 10000 // 最多保存 10000 条日志

function getLogs(): AuditLog[] {
  const storage = getBrowserStorage()
  const parsed = safeJsonParse<unknown>(
    safeStorageGet(storage, AUDIT_LOG_KEY),
    [],
    AUDIT_LOG_KEY,
  )
  const validated = AuditLogListSchema.safeParse(parsed)
  return validated.success ? validated.data : []
}

function saveLogs(logs: AuditLog[]): void {
  const storage = getBrowserStorage()
  if (!storage) return
  // 只保留最近的日志
  const trimmed = logs.slice(-MAX_LOGS)
  safeStorageSet(storage, AUDIT_LOG_KEY, JSON.stringify(trimmed))
}

export const auditDb = {
  // 创建审计日志
  create(log: Omit<AuditLog, 'id' | 'timestamp'>): AuditLog {
    const newLog: AuditLog = {
      ...log,
      id: generateId(),
      timestamp: new Date().toISOString(),
    }
    
    const logs = getLogs()
    logs.push(newLog)
    saveLogs(logs)
    
    return newLog
  },

  // 获取项目的审计日志
  getByProject(projectId: string, limit = 100): AuditLog[] {
    const logs = getLogs()
    return logs
      .filter(log => log.project_id === projectId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },

  // 获取用户的审计日志
  getByUser(userId: string, limit = 100): AuditLog[] {
    const logs = getLogs()
    return logs
      .filter(log => log.user_id === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },

  // 按操作类型查询
  getByAction(projectId: string, action: string, limit = 100): AuditLog[] {
    const logs = getLogs()
    return logs
      .filter(log => log.project_id === projectId && log.action === action)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },

  // 获取最近的审计日志
  getRecent(limit = 50): AuditLog[] {
    const logs = getLogs()
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },

  // 搜索日志
  search(projectId: string, query: string, limit = 100): AuditLog[] {
    const logs = getLogs()
    const lowerQuery = query.toLowerCase()
    
    return logs
      .filter(log => 
        log.project_id === projectId &&
        (log.action.toLowerCase().includes(lowerQuery) ||
         log.resource_type.toLowerCase().includes(lowerQuery) ||
         log.resource_name?.toLowerCase().includes(lowerQuery) ||
         log.user_name.toLowerCase().includes(lowerQuery))
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },

  // 清除项目日志
  clearProject(projectId: string): void {
    const logs = getLogs()
    const filtered = logs.filter(log => log.project_id !== projectId)
    saveLogs(filtered)
  },

  // 导出日志
  export(projectId: string, format: 'json' | 'csv' = 'json'): string {
    const logs = this.getByProject(projectId, MAX_LOGS)
    
    if (format === 'json') {
      return JSON.stringify(logs, null, 2)
    }
    
    // CSV 格式
    const headers = ['时间', '用户', '操作', '资源类型', '资源名称', '详情']
    const rows = logs.map(log => [
      log.timestamp,
      log.user_name,
      log.action,
      log.resource_type,
      log.resource_name || '',
      JSON.stringify(log.details || {}),
    ])
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
  },
}

// ============================================
// 审计日志辅助函数
// ============================================

export function logAction(
  projectId: string,
  userId: string,
  userName: string,
  action: string,
  resourceType: string,
  options?: {
    resourceId?: string
    resourceName?: string
    details?: Record<string, unknown>
  }
): void {
  auditDb.create({
    project_id: projectId,
    user_id: userId,
    user_name: userName,
    action,
    resource_type: resourceType,
    resource_id: options?.resourceId,
    resource_name: options?.resourceName,
    details: options?.details,
  })
}

// 获取操作类型的中文描述
export function getActionDescription(action: string): string {
  const descriptions: Record<string, string> = {
    'project:create': '创建项目',
    'project:update': '更新项目',
    'project:delete': '删除项目',
    'project:view': '查看项目',
    'task:create': '创建任务',
    'task:update': '更新任务',
    'task:delete': '删除任务',
    'task:view': '查看任务',
    'risk:create': '创建风险',
    'risk:update': '更新风险',
    'risk:delete': '删除风险',
    'risk:view': '查看风险',
    'milestone:create': '创建里程碑',
    'milestone:update': '更新里程碑',
    'milestone:delete': '删除里程碑',
    'milestone:view': '查看里程碑',
    'member:invite': '邀请成员',
    'member:remove': '移除成员',
    'member:update': '更新成员权限',
    'data:export': '导出数据',
    'data:import': '导入数据',
    'settings:update': '更新设置',
  }
  
  return descriptions[action] || action
}
