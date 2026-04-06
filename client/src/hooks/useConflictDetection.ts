import { useState, useCallback } from 'react'

/**
 * 带版本号的实体基础接口
 */
export interface VersionedEntity {
  id?: string
  version?: number
  [key: string]: unknown
}

/**
 * 冲突类型定义
 */
export interface ConflictItem<T = VersionedEntity> {
  entityType: 'project' | 'task' | 'risk' | 'milestone' | 'member' | 'invitation'
  entityId: string
  localVersion: number
  serverVersion: number
  localData: T
  serverData: T
  field: string
  localValue: unknown
  serverValue: unknown
}

/**
 * 冲突解决方案
 */
export type ResolutionStrategy = 'keepLocal' | 'keepServer' | 'merge' | 'manual'

/**
 * 冲突检测Hook返回类型
 */
export interface UseConflictDetectionReturn {
  conflicts: ConflictItem[]
  hasConflicts: boolean
  resolveConflict: (entityId: string, strategy: ResolutionStrategy, mergedData?: unknown) => void
  clearConflicts: () => void
  detectConflicts: <T extends VersionedEntity>(entityType: ConflictItem['entityType'], localData: T, serverData: T) => ConflictItem[]
}

/**
 * 冲突检测Hook
 * 用于检测和解决数据同步冲突
 */
export function useConflictDetection(): UseConflictDetectionReturn {
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])

  /**
   * 检测两个版本之间的冲突
   */
  const detectConflicts = useCallback(<T extends VersionedEntity>(
    entityType: ConflictItem['entityType'],
    localData: T,
    serverData: T
  ): ConflictItem[] => {
    if (!localData || !serverData) return []

    const detectedConflicts: ConflictItem[] = []
    const localVersion = (localData as VersionedEntity).version ?? 1
    const serverVersion = (serverData as VersionedEntity).version ?? 1

    // 版本相同，无冲突
    if (localVersion === serverVersion) return []

    // 检测每个字段的差异
    const allKeys = new Set([
      ...Object.keys(localData || {}),
      ...Object.keys(serverData || {})
    ])

    for (const key of allKeys) {
      // 跳过系统字段
      if (['id', 'version', 'created_at', 'updated_at', 'user_id', 'project_id'].includes(key)) {
        continue
      }

      const localValue = (localData as VersionedEntity)[key]
      const serverValue = (serverData as VersionedEntity)[key]

      // 检测值差异
      if (localValue !== serverValue) {
        detectedConflicts.push({
          entityType,
          entityId: ((localData as VersionedEntity).id || (serverData as VersionedEntity).id) as string,
          localVersion,
          serverVersion,
          localData,
          serverData,
          field: key,
          localValue,
          serverValue
        })
      }
    }

    return detectedConflicts
  }, [])

  /**
   * 解决冲突
   */
  const resolveConflict = useCallback((
    entityId: string,
    strategy: ResolutionStrategy,
    mergedData?: unknown
  ) => {
    setConflicts(prev => {
      const remaining = prev.filter(c => c.entityId !== entityId)
      
      // 根据策略处理冲突数据
      if (strategy === 'keepLocal' || strategy === 'keepServer') {
        // 数据已由调用方处理
        if (import.meta.env.DEV) console.log(`Conflict resolved for ${entityId}: ${strategy}`)
      } else if (strategy === 'merge' && mergedData) {
        if (import.meta.env.DEV) console.log(`Conflict merged for ${entityId}:`, mergedData)
      } else if (strategy === 'manual') {
        if (import.meta.env.DEV) console.log(`Manual resolution needed for ${entityId}`)
      }
      
      return remaining
    })
  }, [])

  /**
   * 清除所有冲突
   */
  const clearConflicts = useCallback(() => {
    setConflicts([])
  }, [])

  return {
    conflicts,
    hasConflicts: conflicts.length > 0,
    resolveConflict,
    clearConflicts,
    detectConflicts
  }
}

/**
 * 智能合并算法
 * 自动合并两个版本的数据
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function smartMerge(localData: VersionedEntity, serverData: VersionedEntity): VersionedEntity {
  const result: VersionedEntity = { ...serverData } // 以服务器数据为基础

  // 时间字段：取最新
  const timeFields = ['created_at', 'updated_at', 'start_date', 'end_date', 'due_date']

  for (const field of timeFields) {
    if (localData[field] && serverData[field]) {
      result[field] = localData[field] > serverData[field] ? localData[field] : serverData[field]
    } else if (localData[field]) {
      result[field] = localData[field]
    }
  }

  // 文本字段：取本地（用户输入优先）
  const textFields = ['name', 'title', 'description', 'content', 'notes', 'remarks']

  for (const field of textFields) {
    if (localData[field] !== undefined) {
      result[field] = localData[field]
    }
  }

  // 状态字段：取本地（用户操作优先）
  const statusFields = ['status', 'priority', 'category', 'type', 'severity']

  for (const field of statusFields) {
    if (localData[field] !== undefined) {
      result[field] = localData[field]
    }
  }

  // 布尔字段：取本地（用户设置优先）
  const booleanFields = ['is_completed', 'is_critical', 'is_archived', 'is_active']

  for (const field of booleanFields) {
    if (localData[field] !== undefined) {
      result[field] = localData[field]
    }
  }

  // 数值字段：取本地
  const numberFields = ['progress', 'order', 'sort']

  for (const field of numberFields) {
    if (localData[field] !== undefined) {
      result[field] = localData[field]
    }
  }

  // 递增版本号
  result.version = Math.max(localData.version || 1, serverData.version || 1) + 1

  return result
}

/**
 * 计算冲突字段的差异描述
 */
export function getFieldDifference(field: string, localValue: unknown, serverValue: unknown): string {
  const fieldLabels: Record<string, string> = {
    name: '名称',
    title: '标题',
    description: '描述',
    status: '状态',
    priority: '优先级',
    progress: '进度',
    start_date: '开始日期',
    end_date: '结束日期',
    due_date: '截止日期',
    assignee: '负责人',
    notes: '备注'
  }

  const label = fieldLabels[field] || field

  if (typeof localValue === 'boolean') {
    return `${label}: ${localValue ? '是' : '否'} → ${serverValue ? '是' : '否'}`
  }
  
  if (typeof localValue === 'number') {
    return `${label}: ${localValue} → ${serverValue}`
  }
  
  if (localValue instanceof Date || serverValue instanceof Date) {
    const local = localValue instanceof Date ? localValue.toLocaleDateString() : localValue
    const server = serverValue instanceof Date ? serverValue.toLocaleDateString() : serverValue
    return `${label}: ${local} → ${server}`
  }

  return `${label}: "${localValue}" → "${serverValue}"`
}
