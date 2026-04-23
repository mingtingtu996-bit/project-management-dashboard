type MaterialLike = {
  requires_sample_confirmation?: boolean
  sample_confirmed?: boolean
  expected_arrival_date?: string | null
  actual_arrival_date?: string | null
  requires_inspection?: boolean
  inspection_done?: boolean
}

export type MaterialStatusFilter =
  | 'all'
  | 'pending_sample'
  | 'pending_arrival'
  | 'overdue_arrival'
  | 'arrived_this_week'
  | 'pending_inspection'
  | 'completed'

export type MaterialPrimaryStatus =
  | 'pending_sample'
  | 'pending_arrival'
  | 'overdue_arrival'
  | 'pending_inspection'
  | 'completed'

function toStartOfDay(date = new Date()) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function parseDate(value?: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function getWeekRange(referenceDate = new Date()) {
  const start = toStartOfDay(referenceDate)
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

export function isMaterialArrivedThisWeek(material: MaterialLike, referenceDate = new Date()) {
  const actualArrival = parseDate(material.actual_arrival_date)
  if (!actualArrival) return false
  const { start, end } = getWeekRange(referenceDate)
  return actualArrival >= start && actualArrival < end
}

export function getMaterialPrimaryStatus(material: MaterialLike, referenceDate = new Date()): MaterialPrimaryStatus {
  if (material.actual_arrival_date) {
    if (material.requires_inspection && !material.inspection_done) {
      return 'pending_inspection'
    }
    return 'completed'
  }

  if (material.requires_sample_confirmation && !material.sample_confirmed) {
    return 'pending_sample'
  }

  const expectedArrival = parseDate(material.expected_arrival_date)
  if (expectedArrival && expectedArrival < toStartOfDay(referenceDate)) {
    return 'overdue_arrival'
  }

  return 'pending_arrival'
}

export function matchesMaterialStatusFilter(material: MaterialLike, filter: MaterialStatusFilter, referenceDate = new Date()) {
  if (filter === 'all') return true
  if (filter === 'arrived_this_week') return isMaterialArrivedThisWeek(material, referenceDate)
  return getMaterialPrimaryStatus(material, referenceDate) === filter
}

export function buildMaterialSummaryCounts<T extends MaterialLike>(materials: T[], referenceDate = new Date()) {
  return {
    pendingSample: materials.filter((material) => getMaterialPrimaryStatus(material, referenceDate) === 'pending_sample').length,
    pendingArrival: materials.filter((material) => getMaterialPrimaryStatus(material, referenceDate) === 'pending_arrival').length,
    overdueArrival: materials.filter((material) => getMaterialPrimaryStatus(material, referenceDate) === 'overdue_arrival').length,
    arrivedThisWeek: materials.filter((material) => isMaterialArrivedThisWeek(material, referenceDate)).length,
    pendingInspection: materials.filter((material) => getMaterialPrimaryStatus(material, referenceDate) === 'pending_inspection').length,
    completed: materials.filter((material) => getMaterialPrimaryStatus(material, referenceDate) === 'completed').length,
  }
}

export function getMaterialStatusLabel(status: MaterialPrimaryStatus) {
  switch (status) {
    case 'pending_sample':
      return '待定样'
    case 'pending_arrival':
      return '待到场'
    case 'overdue_arrival':
      return '逾期未到'
    case 'pending_inspection':
      return '待送检'
    case 'completed':
      return '已完成'
    default:
      return '待到场'
  }
}

export function getMaterialStatusTone(status: MaterialPrimaryStatus) {
  switch (status) {
    case 'pending_sample':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    case 'pending_arrival':
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
    case 'overdue_arrival':
      return 'bg-red-50 text-red-700 ring-1 ring-red-200'
    case 'pending_inspection':
      return 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
    default:
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  }
}
