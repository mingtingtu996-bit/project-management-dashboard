// 审计日志 Hook
// 第三阶段：安全与测试 - 审计日志

import { useMemo } from 'react'
import { useStore } from '@/hooks/useStore'
import { auditDb, AuditLog, AuditActions, getActionDescription } from '@/lib/auditLog'

interface UseAuditLogOptions {
  projectId?: string
  limit?: number
}

export function useAuditLog(options: UseAuditLogOptions = {}) {
  const { currentUser, currentProject } = useStore()
  const projectId = options.projectId || currentProject?.id
  const limit = options.limit || 100

  // 获取审计日志
  const logs = useMemo(() => {
    if (!projectId) return []
    return auditDb.getByProject(projectId, limit)
  }, [projectId, limit])

  // 记录操作
  const log = (action: string, resourceType: string, options?: {
    resourceId?: string
    resourceName?: string
    details?: Record<string, unknown>
  }) => {
    if (!projectId || !currentUser) return
    
    auditDb.create({
      project_id: projectId,
      user_id: currentUser.id!,
      user_name: currentUser.display_name!,
      action,
      resource_type: resourceType,
      resource_id: options?.resourceId,
      resource_name: options?.resourceName,
      details: options?.details,
    })
  }

  // 便捷方法
  const logTaskCreate = (taskId: string, taskName: string) => {
    log(AuditActions.TASK_CREATE, 'task', { resourceId: taskId, resourceName: taskName })
  }
  
  const logTaskUpdate = (taskId: string, taskName: string, details?: Record<string, unknown>) => {
    log(AuditActions.TASK_UPDATE, 'task', { resourceId: taskId, resourceName: taskName, details })
  }
  
  const logTaskDelete = (taskId: string, taskName: string) => {
    log(AuditActions.TASK_DELETE, 'task', { resourceId: taskId, resourceName: taskName })
  }
  
  const logRiskCreate = (riskId: string, riskName: string) => {
    log(AuditActions.RISK_CREATE, 'risk', { resourceId: riskId, resourceName: riskName })
  }
  
  const logRiskUpdate = (riskId: string, riskName: string, details?: Record<string, unknown>) => {
    log(AuditActions.RISK_UPDATE, 'risk', { resourceId: riskId, resourceName: riskName, details })
  }
  
  const logMilestoneCreate = (milestoneId: string, milestoneName: string) => {
    log(AuditActions.MILESTONE_CREATE, 'milestone', { resourceId: milestoneId, resourceName: milestoneName })
  }
  
  const logMilestoneUpdate = (milestoneId: string, milestoneName: string, details?: Record<string, unknown>) => {
    log(AuditActions.MILESTONE_UPDATE, 'milestone', { resourceId: milestoneId, resourceName: milestoneName, details })
  }
  
  const logMemberInvite = (memberName: string, permission: string) => {
    log(AuditActions.MEMBER_INVITE, 'member', { resourceName: memberName, details: { permission } })
  }
  
  const logMemberRemove = (memberName: string) => {
    log(AuditActions.MEMBER_REMOVE, 'member', { resourceName: memberName })
  }
  
  const logDataExport = (format: string) => {
    log(AuditActions.DATA_EXPORT, 'data', { details: { format } })
  }

  return {
    logs,
    log,
    logTaskCreate,
    logTaskUpdate,
    logTaskDelete,
    logRiskCreate,
    logRiskUpdate,
    logMilestoneCreate,
    logMilestoneUpdate,
    logMemberInvite,
    logMemberRemove,
    logDataExport,
    getActionDescription,
  }
}
