/**
 * CompanyCockpit 公司驾驶舱共享类型
 *
 * 此文件定义公司驾驶舱各子组件共享的数据类型，
 * 避免在 CompanyCockpit.tsx 和各拆分组件中重复定义。
 */

import type { LucideIcon } from 'lucide-react'
import type { ProjectCatalogItem } from '@/lib/projectApi'
import type { ProjectSummary } from '@/services/dashboardApi'

export type HealthHistory = {
  thisMonth: number | null
  lastMonth: number | null
  change: number | null
  lastMonthPeriod?: string | null
  periods?: Array<{ period: string; value: number | null }>
}

export type ProjectFormStatus = '未开始' | '进行中' | '已完成' | '已暂停'

export type CockpitTab = 'all' | 'in_progress' | 'completed' | 'paused'

export type ProjectRow = {
  project: ProjectCatalogItem
  summary: ProjectSummary | null
  summaryStatus: string
  businessHealthScore: number | null
  keyNodeLabel: string
  keyNodeAttentionCount: number
  deliveryDaysRemaining: number | null
}

export type HeroStatItem = {
  label: string
  value: string
  hint: string
  icon: LucideIcon
  tone: string
  pill?: boolean
  sparklineData?: Array<{ value: number }>
}
