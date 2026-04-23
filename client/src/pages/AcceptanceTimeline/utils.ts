import type { ComponentType } from 'react'
import { AlertCircle, CheckCircle2, Circle, Loader2, Users, XCircle } from 'lucide-react'

import { ACCEPTANCE_STATUS_CONFIG, ACCEPTANCE_STATUS_NAMES, DEFAULT_ACCEPTANCE_TYPES, type AcceptanceStatus, type AcceptanceType } from '@/types/acceptance'

import type { AcceptanceTimelineScale } from './types'

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  AlertCircle,
  Users,
}

export function getIcon(iconName?: string) {
  return ICON_MAP[iconName || ''] || Circle
}

export function getAcceptanceStatusMeta(status?: string | null) {
  const normalizedStatus = status && status in ACCEPTANCE_STATUS_CONFIG ? (status as AcceptanceStatus) : 'draft'
  return {
    status: normalizedStatus,
    config: ACCEPTANCE_STATUS_CONFIG[normalizedStatus],
    label: ACCEPTANCE_STATUS_NAMES[normalizedStatus],
  }
}

export function getTypeById(typeId: string, customTypes: AcceptanceType[]) {
  return [...DEFAULT_ACCEPTANCE_TYPES, ...customTypes].find((type) => type.id === typeId)
}

export function formatTimelineMarker(date?: string | null, scale: AcceptanceTimelineScale = 'month') {
  if (!date) return '待排期'
  if (scale === 'week') return date
  if (scale === 'biweek') return `${date.slice(0, 7)} · 双周`
  return date.slice(0, 7)
}

export function formatLinkedStatus(status?: string | null) {
  return status || 'unknown'
}
