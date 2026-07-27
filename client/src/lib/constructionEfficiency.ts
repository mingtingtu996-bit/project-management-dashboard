import type { MetricAvailability } from '@/components/ui/metric-card'

type MetricTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'slate'

export interface ConstructionEfficiencyDistribution {
  monthlyAverageP?: number | null
  monthlyMaxP?: number | null
  monthlyMinP?: number | null
  monthlyP90?: number | null
  accelerationCaseRatio?: number | null
  monthlyProductivityCaseCount?: number | null
  sampleMaturity?: 'none' | 'low' | 'medium' | 'high' | string | null
}

export interface ConstructionEfficiencyMetric {
  value: number | null
  unit: 'x'
  hint: string
  tone: MetricTone
  trendClassName: string
  availability: MetricAvailability
  sparkline: number[]
}

function normalizeP(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric * 100) / 100
}

function formatDeltaPercent(value: number): string {
  return `${Math.round(Math.abs(value) * 100)}%`
}

function buildSparkline(distribution?: ConstructionEfficiencyDistribution | null): number[] {
  const values = [
    distribution?.monthlyMinP,
    distribution?.monthlyAverageP,
    distribution?.monthlyP90,
    distribution?.monthlyMaxP,
  ]
    .map((value) => normalizeP(value))
    .filter((value): value is number => value !== null)
    .map((value) => Math.round(value * 100))

  return values.length > 1 ? values : []
}

export function getConstructionEfficiencyMetric(
  monthlyAverageP?: number | null,
  distribution?: ConstructionEfficiencyDistribution | null,
): ConstructionEfficiencyMetric {
  const value = normalizeP(monthlyAverageP)
  if (value === null) {
    return {
      value: null,
      unit: 'x',
      hint: '施工效率待积累',
      tone: 'slate',
      trendClassName: 'text-slate-500',
      availability: 'insufficient_data',
      sparkline: [],
    }
  }

  const maturity = distribution?.sampleMaturity ?? null
  const availability: MetricAvailability = maturity === 'none' || maturity === 'low'
    ? 'low_confidence'
    : 'ready'

  if (value < 0.6) {
    return {
      value,
      unit: 'x',
      hint: `低于标准节奏 ${formatDeltaPercent(1 - value)}`,
      tone: 'danger',
      trendClassName: 'text-rose-700',
      availability,
      sparkline: buildSparkline(distribution),
    }
  }

  if (value < 0.95) {
    return {
      value,
      unit: 'x',
      hint: `低于标准节奏 ${formatDeltaPercent(1 - value)}`,
      tone: 'warning',
      trendClassName: 'text-amber-700',
      availability,
      sparkline: buildSparkline(distribution),
    }
  }

  if (value > 1.05) {
    return {
      value,
      unit: 'x',
      hint: `赶工 ${formatDeltaPercent(value - 1)}`,
      tone: 'success',
      trendClassName: 'text-emerald-700',
      availability,
      sparkline: buildSparkline(distribution),
    }
  }

  return {
    value,
    unit: 'x',
    hint: '接近标准节奏',
    tone: 'primary',
    trendClassName: 'text-blue-700',
    availability,
    sparkline: buildSparkline(distribution),
  }
}
