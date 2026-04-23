/**
 * CompanyCockpit 公司驾驶舱共享类型
 *
 * 此文件定义公司驾驶舱各子组件共享的数据类型，
 * 避免在 CompanyCockpit.tsx 和各拆分组件中重复定义。
 */

import type { LucideIcon } from 'lucide-react'
import type { Project } from '@/lib/localDb'
import type { ProjectSummary } from '@/services/dashboardApi'

export type HealthHistory = {
  thisMonth: number | null
  lastMonth: number | null
  change: number | null
  lastMonthPeriod?: string | null
}

export type ProjectFormStatus = '未开始' | '进行中' | '已完成' | '已暂停'

export type CockpitTab = 'all' | 'in_progress' | 'completed' | 'paused'

export type ProjectRow = {
  project: Project
  summary: ProjectSummary | null
  summaryStatus: string
  healthScore: number
  hasNextMilestone: boolean
  milestoneName: string
  milestoneDate: string | null
  milestoneDaysRemaining: number | null
  deliveryDaysRemaining: number | null
}

export type HeroStatItem = {
  label: string
  value: string
  hint: string
  icon: LucideIcon
  tone: string
}

/**
 * ProjectStats — 旧版驾驶舱组件使用的聚合统计类型。
 * 保留以避免破坏已有子组件，不应在新组件中使用。
 * @deprecated 新组件请使用 ProjectRow 和 ProjectSummary
 */
export interface ProjectStats {
  project: { id: string; name: string; [key: string]: any }
  milestones: Array<{ title?: string; name?: string; planned_end_date?: string; [key: string]: any }>
  tasks: Array<any>
  risks: Array<any>
  [key: string]: any
}
