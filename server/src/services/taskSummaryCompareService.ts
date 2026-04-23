export type TaskSummaryCompareGranularity = 'day' | 'week' | 'month'

export interface TaskSummaryComparePeriod {
  label: string
  from: string
  to: string
}

export function normalizeTaskSummaryCompareGranularity(raw?: string | null): TaskSummaryCompareGranularity {
  return raw === 'week' || raw === 'month' ? raw : 'day'
}

export function normalizeTaskSummaryComparePeriods(
  periods: TaskSummaryComparePeriod[],
  granularity: TaskSummaryCompareGranularity,
) {
  if (granularity !== 'month') {
    return periods
  }

  const pad = (value: number) => String(value).padStart(2, '0')

  const getMonthLastDay = (year: number, month: number) => {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return `${year}-${pad(month)}-${pad(lastDay)}`
  }

  const normalizeMonthEdge = (value: string, edge: 'from' | 'to') => {
    if (/^\d{4}-\d{2}$/.test(value)) {
      if (edge === 'from') return `${value}-01`
      const [year, month] = value.split('-').map((item) => Number(item))
      return getMonthLastDay(year, month)
    }
    return value
  }

  return periods.map((period) => ({
    ...period,
    from: normalizeMonthEdge(period.from, 'from'),
    to: normalizeMonthEdge(period.to, 'to'),
  }))
}
