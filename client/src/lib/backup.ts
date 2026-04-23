/**
 * 数据备份服务
 * 本地存储数据的导出和备份功能
 */

import {
  milestoneDb,
  MilestoneSchema,
  projectDb,
  ProjectSchema,
  riskDb,
  RiskSchema,
  taskDb,
  TaskSchema,
  userDb,
  UserSchema,
} from './localDb'
import { safeJsonParse, safeStorageGet, safeStorageRemove, safeStorageSet } from './browserStorage'
import { format } from 'date-fns'
import type { output, ZodTypeAny } from 'zod'

interface BackupData {
  version: string
  timestamp: string
  data: {
    users: unknown[]
    projects: unknown[]
    tasks: unknown[]
    risks: unknown[]
    milestones: unknown[]
  }
}

function parseBackupEntity<S extends ZodTypeAny>(schema: S, entity: unknown): output<S> | null {
  const parsed = schema.safeParse(entity)
  return parsed.success ? parsed.data : null
}

// 导出所有数据
export function exportAllData(): BackupData {
  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    data: {
      users: userDb.getAll(),
      projects: projectDb.getAll(),
      tasks: taskDb.getAll(),
      risks: riskDb.getAll(),
      milestones: milestoneDb.getAll(),
    },
  }
}

// 下载备份文件
export function downloadBackup(): void {
  const data = exportAllData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `backup-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 导入备份数据
export async function importBackup(file: File): Promise<{ success: boolean; message: string }> {
  try {
    const text = await file.text()
    const data = safeJsonParse<BackupData | null>(text, null, 'backup-import')

    if (!data) {
      return { success: false, message: '无效的备份文件格式' }
    }

    // 验证版本
    if (!data.version || !data.timestamp || !data.data) {
      return { success: false, message: '无效的备份文件格式' }
    }

    // 导入数据（覆盖模式）
    if (data.data.users) {
      data.data.users.forEach((user) => {
        const backupUser = parseBackupEntity(UserSchema, user)
        if (!backupUser) return

        const existing = userDb.findByDeviceId(backupUser.device_id)
        if (existing) {
          userDb.update(existing.id, backupUser)
        } else {
          userDb.create(backupUser)
        }
      })
    }

    if (data.data.projects) {
      data.data.projects.forEach((project) => {
        const backupProject = parseBackupEntity(ProjectSchema, project)
        if (!backupProject) return

        const existing = projectDb.getById(backupProject.id)
        if (existing) {
          projectDb.update(backupProject.id, backupProject)
        } else {
          projectDb.create(backupProject)
        }
      })
    }

    if (data.data.tasks) {
      data.data.tasks.forEach((task) => {
        const backupTask = parseBackupEntity(TaskSchema, task)
        if (!backupTask) return

        const existing = taskDb.getById(backupTask.id)
        if (existing) {
          taskDb.update(backupTask.id, backupTask)
        } else {
          taskDb.create(backupTask)
        }
      })
    }

    if (data.data.risks) {
      data.data.risks.forEach((risk) => {
        const backupRisk = parseBackupEntity(RiskSchema, risk)
        if (!backupRisk) return

        const existing = riskDb.getById(backupRisk.id)
        if (existing) {
          riskDb.update(backupRisk.id, backupRisk)
        } else {
          riskDb.create(backupRisk)
        }
      })
    }

    if (data.data.milestones) {
      data.data.milestones.forEach((milestone) => {
        const backupMilestone = parseBackupEntity(MilestoneSchema, milestone)
        if (!backupMilestone) return

        const existing = milestoneDb.getById(backupMilestone.id)
        if (existing) {
          milestoneDb.update(backupMilestone.id, backupMilestone)
        } else {
          milestoneDb.create(backupMilestone)
        }
      })
    }

    return { success: true, message: `成功导入 ${data.timestamp} 的备份` }
  } catch (error) {
    return { success: false, message: `导入失败: ${error instanceof Error ? error.message : '未知错误'}` }
  }
}

// 自动备份到 localStorage（定时任务）
let autoBackupInterval: ReturnType<typeof setInterval> | null = null

export function startAutoBackup(intervalMs = 24 * 60 * 60 * 1000): void {
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval)
  }
  
  // 立即执行一次备份
  const performBackup = () => {
    const data = exportAllData()
    const key = `auto_backup_${format(new Date(), 'yyyy-MM-dd')}`
    safeStorageSet(localStorage, key, JSON.stringify(data))
    
    // 只保留最近7天的自动备份
    for (let i = 7; i < 30; i++) {
      const oldKey = `auto_backup_${format(new Date(Date.now() - i * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')}`
      safeStorageRemove(localStorage, oldKey)
    }
    
    console.log('[Backup] 自动备份完成')
  }
  
  performBackup()
  autoBackupInterval = setInterval(performBackup, intervalMs)
}

export function stopAutoBackup(): void {
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval)
    autoBackupInterval = null
  }
}

// 获取自动备份列表
export function getAutoBackupList(): { date: string; timestamp: string }[] {
  const backups: { date: string; timestamp: string }[] = []
  
  for (let i = 0; i < 30; i++) {
    const date = format(new Date(Date.now() - i * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
    const key = `auto_backup_${date}`
    const data = safeStorageGet(localStorage, key)
    
    if (data) {
      const parsed = safeJsonParse<{ timestamp?: string } | null>(data, null, key)
      if (parsed?.timestamp) {
        backups.push({ date, timestamp: parsed.timestamp })
      }
    }
  }
  
  return backups
}
