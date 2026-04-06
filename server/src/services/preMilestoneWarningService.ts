// 前期证照过期预警服务
// 房地产工程管理系统V4.1 Phase 3
// 优化: 使用统一的到期状态计算服务

import { createClient } from '@supabase/supabase-js'
import { logger } from '../middleware/logger.js'
import { calculateDueStatus, DUE_CONFIG } from './dueDateService.js'
import { generateId } from '../utils/id.js'

const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

/**
 * 预警配置
 */
const WARNING_CONFIG = {
  // 提前7天预警
  ADVANCE_WARNING_DAYS: 7,
  // 提前30天预警（长期预警）
  LONG_TERM_WARNING_DAYS: 30,
  // 过期后仍持续提醒的天数
  OVERDUE_REMINDER_DAYS: 7
}

/**
 * 预警类型
 */
export type WarningLevel = 'info' | 'warning' | 'critical'

export interface PermitWarning {
  id: string
  project_id: string
  pre_milestone_id: string
  permit_name: string
  permit_type: string
  expiry_date: string
  warning_level: WarningLevel
  days_until_expiry: number
  is_overdue: boolean
  responsible_at?: string  // [F2]: 新增，与 line 288 responsible_at 字段对应
  created_at: string
}

/**
 * 扫描即将过期的证照
 * 优化: 使用统一的到期状态计算服务
 */
export async function scanExpiringPermits(): Promise<PermitWarning[]> {
  logger.info('Starting expiring permits scan')

  const warnings: PermitWarning[] = []

  try {
    // 查询所有未完成的证照
    const { data: permits, error } = await client
      .from('pre_milestones')
      .select('*')
      .not('status', 'in', '("已完成", "已取消")')
      .not('expiry_date', 'is', null)
      .order('expiry_date', { ascending: true })

    if (error) throw error

    if (!permits || permits.length === 0) {
      logger.info('No permits to check')
      return []
    }

    // 遍历每个证照,检查是否需要预警
    for (const permit of permits) {
      // 使用统一的到期状态计算
      const dueResult = calculateDueStatus(permit.expiry_date, {
        urgentDays: 3,
        approachingDays: WARNING_CONFIG.ADVANCE_WARNING_DAYS,
        overdueLabel: '已过期',
        dueLabel: '天后过期',
        todayLabel: '今天过期',
      })

      // 只处理需要预警的状态（已过期、紧急、即将过期）
      if (dueResult.due_status === 'normal') continue

      const daysDiff = dueResult.days_until_due ?? 0
      const warningLevel: WarningLevel = dueResult.due_status === 'overdue' || daysDiff <= 3
        ? 'critical'
        : 'warning'

      warnings.push({
        id: generateId(),
        project_id: permit.project_id,
        pre_milestone_id: permit.id,
        permit_name: permit.milestone_name,
        permit_type: permit.milestone_type,
        expiry_date: permit.expiry_date!,
        warning_level: warningLevel,
        days_until_expiry: daysDiff,
        is_overdue: dueResult.due_status === 'overdue',
        created_at: new Date().toISOString()
      })
    }

    logger.info(`Scan completed, found ${warnings.length} expiring permits`)
    return warnings

  } catch (error) {
    logger.error('Failed to scan expiring permits', { error })
    throw error
  }
}

/**
 * 创建预警记录
 */
export async function createWarning(warning: Omit<PermitWarning, 'id' | 'created_at'>): Promise<void> {
  try {
    // 检查是否已存在相同证照的预警
    const { data: existing } = await client
      .from('warnings')
      .select('id')
      .eq('warning_type', 'permit_expiry')
      .eq('task_id', warning.pre_milestone_id)
      .single()

    if (existing) {
      // 更新现有预警
      await client
        .from('warnings')
        .update({
          title: `${warning.permit_name} 即将过期`,
          description: `证照 ${warning.permit_name} 的过期日期为 ${warning.expiry_date}，${warning.is_overdue ? '已过期' : '距离过期还有 ' + Math.abs(warning.days_until_expiry) + ' 天'}`,
          warning_level: warning.warning_level,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
    } else {
      // 创建新预警
      await client
        .from('warnings')
        .insert({
          project_id: warning.project_id,
          task_id: warning.pre_milestone_id,
          warning_type: 'permit_expiry',
          warning_level: warning.warning_level,
          title: `${warning.permit_name} 即将过期`,
          description: `证照 ${warning.permit_name} 的过期日期为 ${warning.expiry_date}，${warning.is_overdue ? '已过期' : '距离过期还有 ' + Math.abs(warning.days_until_expiry) + ' 天'}`,
          is_acknowledged: false,
          created_at: new Date().toISOString()
        })
    }

    logger.info('Warning created', { permitId: warning.pre_milestone_id, level: warning.warning_level })

  } catch (error) {
    logger.error('Failed to create warning', { error, permitId: warning.pre_milestone_id })
    throw error
  }
}

/**
 * 批量创建预警
 */
export async function createWarningsBatch(warnings: PermitWarning[]): Promise<void> {
  logger.info(`Creating ${warnings.length} warnings batch`)

  for (const warning of warnings) {
    try {
      await createWarning(warning)
    } catch (error) {
      logger.error('Failed to create warning in batch', { error, permitId: warning.pre_milestone_id })
    }
  }

  logger.info('Batch warning creation completed')
}

/**
 * 标记过期的证照
 */
export async function markAsOverdue(): Promise<number> {
  logger.info('Starting overdue permits marking')

  const today = new Date().toISOString().split('T')[0]

  try {
    const { data, error } = await client
      .from('pre_milestones')
      .select('id, milestone_name, status')  // 修正: name -> milestone_name
      .not('status', 'in', '("已完成", "已取消", "已延期")')
      .lt('expiry_date', today)

    if (error) throw error

    if (!data || data.length === 0) {
      logger.info('No overdue permits found')
      return 0
    }

    // 更新状态为已延期
    const { error: updateError } = await client
      .from('pre_milestones')
      .update({ 
        status: '已延期',
        updated_at: new Date().toISOString()
      })
      .in('id', data.map(p => p.id))

    if (updateError) throw updateError

    logger.info(`Marked ${data.length} permits as overdue`)
    return data.length

  } catch (error) {
    logger.error('Failed to mark overdue permits', { error })
    throw error
  }
}

/**
 * 执行预警检查（定时任务调用）
 */
export async function executeWarningCheck(): Promise<{
  expiring: number
  overdue: number
  warningsCreated: number
  warningsCleaned: number
}> {
  logger.info('Starting permit warning check')

  try {
    // 1. 扫描即将过期的证照
    const expiringPermits = await scanExpiringPermits()

    // 2. 创建预警
    await createWarningsBatch(expiringPermits)

    // 3. 标记过期的证照
    const overdueCount = await markAsOverdue()

    // 4. 清理已完成/已取消证照的预警（优化：避免 warnings 表无限增长）
    const cleanupCount = await cleanupExpiredWarnings()

    logger.info('Warning check completed', {
      expiring: expiringPermits.length,
      overdue: overdueCount,
      warningsCreated: expiringPermits.length,
      warningsCleaned: cleanupCount
    })

    return {
      expiring: expiringPermits.length,
      overdue: overdueCount,
      warningsCreated: expiringPermits.length,
      warningsCleaned: cleanupCount
    }

  } catch (error) {
    logger.error('Failed to execute warning check', { error })
    throw error
  }
}

/**
 * 获取项目的证照预警列表
 * 优化: 使用统一的到期状态计算服务
 */
export async function getPermitWarnings(projectId: string): Promise<PermitWarning[]> {
  try {
    const { data, error } = await client
      .from('pre_milestones')
      .select('*')
      .eq('project_id', projectId)
      .not('status', 'in', '("已完成", "已取消")')
      .not('expiry_date', 'is', null)
      .order('expiry_date', { ascending: true })

    if (error) throw error

    if (!data) return []

    const warnings: PermitWarning[] = []

    for (const permit of data) {
      // 使用统一的到期状态计算
      const dueResult = calculateDueStatus(permit.expiry_date, {
        urgentDays: 3,
        approachingDays: WARNING_CONFIG.ADVANCE_WARNING_DAYS,
        overdueLabel: '已过期',
        dueLabel: '天后过期',
        todayLabel: '今天过期',
      })

      // 只处理需要预警的状态
      if (dueResult.due_status === 'normal') continue

      const daysDiff = dueResult.days_until_due ?? 0
      const warningLevel: WarningLevel = dueResult.due_status === 'overdue' || daysDiff <= 3
        ? 'critical'
        : 'warning'

      warnings.push({
        id: permit.id,
        project_id: permit.project_id,
        pre_milestone_id: permit.id,
        permit_name: permit.milestone_name,
        permit_type: permit.milestone_type,
        expiry_date: permit.expiry_date!,
        warning_level: warningLevel,
        days_until_expiry: daysDiff,
        is_overdue: dueResult.due_status === 'overdue',
        responsible_at: permit.responsible_user_id,
        created_at: permit.created_at
      })
    }

    return warnings

  } catch (error) {
    logger.error('Failed to get permit warnings', { error, projectId })
    throw error
  }
}

/**
 * 清理已过期的预警（已完成的证照）
 */
export async function cleanupExpiredWarnings(): Promise<number> {
  logger.info('Starting expired warnings cleanup')

  try {
    // 获取所有已完成的证照ID
    const { data: completedPermits, error } = await client
      .from('pre_milestones')
      .select('id')
      .in('status', ['已完成', '已取消'])

    if (error) throw error

    if (!completedPermits || completedPermits.length === 0) {
      logger.info('No completed permits found')
      return 0
    }

    // 删除相关预警
    const { error: deleteError } = await client
      .from('warnings')
      .delete()
      .eq('warning_type', 'permit_expiry')
      .in('task_id', completedPermits.map(p => p.id))

    if (deleteError) throw deleteError

    logger.info(`Cleaned up ${completedPermits.length} expired warnings`)
    return completedPermits.length

  } catch (error) {
    logger.error('Failed to cleanup expired warnings', { error })
    throw error
  }
}

export default {
  scanExpiringPermits,
  createWarning,
  createWarningsBatch,
  markAsOverdue,
  executeWarningCheck,
  getPermitWarnings,
  cleanupExpiredWarnings
}
