/**
 * CompanyCockpit 公司驾驶舱工具函数
 */

import type { ProjectSummary } from '@/services/dashboardApi'
import type { Project } from '@/lib/localDb'

export function normalizeProjectFallbackStatus(status?: string | null) {
  switch (status) {
    case 'active':
    case 'in_progress':
      return '进行中'
    case 'completed':
      return '已完成'
    case 'paused':
    case 'archived':
      return '已暂停'
    default:
      return '未开始'
  }
}

export function normalizeStatusLabel(summary?: ProjectSummary | null, project?: Project | null) {
  return summary?.statusLabel || normalizeProjectFallbackStatus(project?.status)
}

export function mapSummaryStatusToTab(status?: string) {
  switch (status) {
    case '进行中':
    case 'in_progress':
    case 'active':
      return 'in_progress'
    case '已完成':
    case 'completed':
      return 'completed'
    case '已暂停':
    case 'paused':
    case 'archived':
      return 'paused'
    default:
      return 'all'
  }
}

export function statusBadgeClass(status?: string) {
  switch (status) {
    case '已完成':
    case 'completed':
      return 'bg-emerald-50 text-emerald-700'
    case '进行中':
    case 'in_progress':
    case 'active':
      return 'bg-blue-50 text-blue-700'
    case '已暂停':
    case 'paused':
    case 'archived':
      return 'bg-amber-50 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export function healthBadgeClass(score: number) {
  if (score >= 80) return 'bg-emerald-50 text-emerald-700'
  if (score >= 60) return 'bg-blue-50 text-blue-700'
  if (score >= 40) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

export function progressBarClass(progress: number) {
  if (progress >= 80) return 'bg-emerald-500'
  if (progress >= 40) return 'bg-blue-500'
  if (progress > 0) return 'bg-amber-500'
  return 'bg-slate-300'
}

export function monthlyCloseStatusClass(status?: string | null) {
  switch (status) {
    case '已完成':
      return 'bg-emerald-50 text-emerald-700'
    case '已超期':
      return 'bg-red-50 text-red-700'
    case '进行中':
      return 'bg-blue-50 text-blue-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export function warningLevelClass(level?: string | null) {
  switch (level) {
    case 'critical':
      return 'bg-red-50 text-red-700'
    case 'warning':
      return 'bg-amber-50 text-amber-700'
    case 'info':
      return 'bg-blue-50 text-blue-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

export function warningLevelLabel(level?: string | null) {
  switch (level) {
    case 'critical':
      return '严重预警'
    case 'warning':
      return '一般预警'
    case 'info':
      return '提醒'
    default:
      return '暂无预警'
  }
}

export function timelineTone(daysRemaining: number | null) {
  if (daysRemaining === null) return 'bg-slate-100 text-slate-600'
  if (daysRemaining < 0) return 'bg-red-50 text-red-700'
  if (daysRemaining <= 14) return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
}

export function formatDelta(change: number | null) {
  if (change === null) return '较上月暂无对比'
  return `较上月 ${change > 0 ? '+' : ''}${change} 分`
}

export function formatTimelineLabel(daysRemaining: number | null, fallback = '待排期') {
  if (daysRemaining === null) return fallback
  if (daysRemaining < 0) return `延期 ${Math.abs(daysRemaining)} 天`
  return `剩余 ${daysRemaining} 天`
}

export function formatDeliveryHint(summary?: ProjectSummary | null) {
  if (!summary?.plannedEndDate) return '未设置计划交付日期'
  if (summary.daysUntilPlannedEnd === null) return `计划交付 ${summary.plannedEndDate}`

  return summary.daysUntilPlannedEnd < 0
    ? `计划交付 ${summary.plannedEndDate} · 已延期 ${Math.abs(summary.daysUntilPlannedEnd)} 天`
    : `计划交付 ${summary.plannedEndDate} · 剩余 ${summary.daysUntilPlannedEnd} 天`
}

export function projectAvatarLabel(name: string) {
  const compact = name.trim().replace(/\s+/g, '')
  return compact.slice(0, Math.min(2, compact.length)) || '项目'
}
