// 通用到期状态服务 - 统一处理所有到期日期计算逻辑
// 适用于：任务、里程碑、证照、验收计划、开工条件等

// 到期状态类型
export type DueStatus = 'overdue' | 'urgent' | 'approaching' | 'normal'

// 到期状态结果
export interface DueStatusResult {
  days_until_due: number | null  // 距离到期还有多少天，null表示无截止日期
  due_status: DueStatus          // 到期状态
  due_label: string              // 显示标签（如"3天后到期"）
  due_color: string              // 颜色标识（用于UI）
}

// 带到期状态的实体（泛型）
export type WithDueStatus<T> = T & DueStatusResult

// 到期判断配置
export const DUE_CONFIG = {
  // 预警阈值（天）
  urgentDays: 3,      // 紧急：3天内
  approachingDays: 7, // 即将到期：7天内

  // 颜色配置（Tailwind类名）
  colors: {
    overdue: 'red',      // 已延期 - 红色
    urgent: 'amber',     // 紧急 - 琥珀色/黄色
    approaching: 'blue', // 即将到期 - 蓝色
    normal: 'gray',      // 正常 - 灰色
  },

  // 优先级权重（用于排序）
  priorityWeight: {
    overdue: 100,
    urgent: 80,
    approaching: 60,
    normal: 40,
  }
}

/**
 * 通用到期状态计算器
 * @param endDate 截止日期（ISO字符串或Date对象）
 * @param options 可选配置
 * @returns 到期状态结果
 */
export function calculateDueStatus(
  endDate: string | Date | null | undefined,
  options?: {
    urgentDays?: number        // 紧急阈值（默认3天）
    approachingDays?: number   // 即将到期阈值（默认7天）
    overdueLabel?: string      // 已延期标签前缀（默认"已延期"）
    dueLabel?: string          // 到期标签前缀（默认"天后到期"）
    todayLabel?: string        // 今天到期标签（默认"今天到期"）
  }
): DueStatusResult {
  // 如果没有截止日期，返回正常状态
  if (!endDate) {
    return {
      days_until_due: null,
      due_status: 'normal',
      due_label: '',
      due_color: DUE_CONFIG.colors.normal,
    }
  }

  const config = {
    urgentDays: options?.urgentDays ?? DUE_CONFIG.urgentDays,
    approachingDays: options?.approachingDays ?? DUE_CONFIG.approachingDays,
    overdueLabel: options?.overdueLabel ?? '已延期',
    dueLabel: options?.dueLabel ?? '天后到期',
    todayLabel: options?.todayLabel ?? '今天到期',
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)  // 重置时间为当天开始

  const targetDate = new Date(endDate)
  targetDate.setHours(0, 0, 0, 0)

  // 计算剩余天数（向上取整）
  const diffTime = targetDate.getTime() - now.getTime()
  const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  let status: DueStatus
  let label: string
  let color: string

  if (daysUntilDue < 0) {
    // 已延期
    status = 'overdue'
    label = `${config.overdueLabel} ${Math.abs(daysUntilDue)} 天`
    color = DUE_CONFIG.colors.overdue
  } else if (daysUntilDue === 0) {
    // 今天到期
    status = 'urgent'
    label = config.todayLabel
    color = DUE_CONFIG.colors.urgent
  } else if (daysUntilDue <= config.urgentDays) {
    // 紧急
    status = 'urgent'
    label = `${daysUntilDue} ${config.dueLabel}`
    color = DUE_CONFIG.colors.urgent
  } else if (daysUntilDue <= config.approachingDays) {
    // 即将到期
    status = 'approaching'
    label = `${daysUntilDue} ${config.dueLabel}`
    color = DUE_CONFIG.colors.approaching
  } else {
    // 正常
    status = 'normal'
    label = ''
    color = DUE_CONFIG.colors.normal
  }

  return {
    days_until_due: daysUntilDue,
    due_status: status,
    due_label: label,
    due_color: color,
  }
}

/**
 * 批量计算到期状态
 * @param items 实体列表
 * @param dateField 日期字段名（默认'end_date'）
 * @param options 可选配置
 * @returns 带到期状态的实体列表
 */
export function batchCalculateDueStatus<T extends Record<string, any>>(
  items: T[],
  dateField: keyof T = 'end_date' as keyof T,
  options?: Parameters<typeof calculateDueStatus>[1]
): WithDueStatus<T>[] {
  return items.map(item => {
    const dueResult = calculateDueStatus(item[dateField] as string | Date, options)
    return {
      ...item,
      ...dueResult,
    }
  })
}

/**
 * 按到期状态优先级排序
 * @param items 带到期状态的实体列表
 * @returns 排序后的列表（已延期 > 紧急 > 即将到期 > 正常）
 */
export function sortByDueStatus<T extends DueStatusResult>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const weightA = DUE_CONFIG.priorityWeight[a.due_status]
    const weightB = DUE_CONFIG.priorityWeight[b.due_status]

    if (weightA !== weightB) {
      return weightB - weightA  // 权重高的排前面
    }

    // 同优先级：按剩余天数升序
    const daysA = a.days_until_due ?? Infinity
    const daysB = b.days_until_due ?? Infinity
    return daysA - daysB
  })
}

/**
 * 统计到期状态分布
 * @param items 带到期状态的实体列表
 * @returns 各类状态的数量统计
 */
export function countDueStatus<T extends DueStatusResult>(items: T[]): {
  total: number
  overdue: number
  urgent: number
  approaching: number
  normal: number
} {
  return {
    total: items.length,
    overdue: items.filter(t => t.due_status === 'overdue').length,
    urgent: items.filter(t => t.due_status === 'urgent').length,
    approaching: items.filter(t => t.due_status === 'approaching').length,
    normal: items.filter(t => t.due_status === 'normal').length,
  }
}

/**
 * 过滤指定状态的实体
 * @param items 带到期状态的实体列表
 * @param statuses 要过滤的状态
 * @returns 符合条件的实体
 */
export function filterByDueStatus<T extends DueStatusResult>(
  items: T[],
  statuses: DueStatus[]
): T[] {
  return items.filter(item => statuses.includes(item.due_status))
}

/**
 * 获取需要关注的实体（已延期 + 紧急 + 即将到期）
 * @param items 带到期状态的实体列表
 * @returns 需要关注的实体
 */
export function getAttentionRequired<T extends DueStatusResult>(items: T[]): T[] {
  return filterByDueStatus(items, ['overdue', 'urgent', 'approaching'])
}

// ==================== 特定场景快捷方法 ====================

/**
 * 计算任务到期状态（兼容旧版接口）
 * @param task 任务对象
 * @returns 带到期状态的任务
 */
export function calculateTaskDueStatus<T extends { end_date?: string | Date | null }>(
  task: T
): WithDueStatus<T> {
  const dueResult = calculateDueStatus(task.end_date)
  return { ...task, ...dueResult }
}

/**
 * 计算里程碑到期状态
 * @param milestone 里程碑对象
 * @returns 带到期状态的里程碑
 */
export function calculateMilestoneDueStatus<T extends { planned_date?: string | Date | null }>(
  milestone: T
): WithDueStatus<T> {
  const dueResult = calculateDueStatus(milestone.planned_date)
  return { ...milestone, ...dueResult }
}

/**
 * 计算证照到期状态
 * @param permit 证照对象
 * @returns 带到期状态的证照
 */
export function calculatePermitDueStatus<T extends { expiry_date?: string | Date | null }>(
  permit: T
): WithDueStatus<T> {
  const dueResult = calculateDueStatus(permit.expiry_date, {
    overdueLabel: '已过期',
    dueLabel: '天后过期',
    todayLabel: '今天过期',
  })
  return { ...permit, ...dueResult }
}

/**
 * 计算验收计划到期状态
 * @param acceptance 验收计划对象
 * @returns 带到期状态的验收计划
 */
export function calculateAcceptanceDueStatus<T extends { planned_date?: string | Date | null }>(
  acceptance: T
): WithDueStatus<T> {
  return calculateMilestoneDueStatus(acceptance)
}

/**
 * 计算开工条件到期状态
 * @param condition 开工条件对象
 * @returns 带到期状态的开工条件
 */
export function calculateConditionDueStatus<T extends { required_date?: string | Date | null }>(
  condition: T
): WithDueStatus<T> {
  const dueResult = calculateDueStatus(condition.required_date, {
    overdueLabel: '已逾期',
    dueLabel: '天后到期',
    todayLabel: '今天到期',
  })
  return { ...condition, ...dueResult }
}
