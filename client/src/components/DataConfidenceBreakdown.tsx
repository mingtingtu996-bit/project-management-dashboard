import type { DataQualityConfidenceDimension, DataQualityProjectSummary, DataQualityWeights } from '@/services/dataQualityApi'

type ConfidenceShape = DataQualityProjectSummary['confidence']

const DIMENSION_META: Array<{
  key: keyof DataQualityWeights
  label: string
  scoreKey: keyof Pick<
    ConfidenceShape,
    'timelinessScore' | 'anomalyScore' | 'consistencyScore' | 'jumpinessScore' | 'coverageScore'
  >
}> = [
  { key: 'timeliness', label: '填报及时性', scoreKey: 'timelinessScore' },
  { key: 'anomaly', label: '异常检测命中率', scoreKey: 'anomalyScore' },
  { key: 'consistency', label: '交叉一致性', scoreKey: 'consistencyScore' },
  { key: 'jumpiness', label: '进度跳变率', scoreKey: 'jumpinessScore' },
  { key: 'coverage', label: '更新覆盖率', scoreKey: 'coverageScore' },
]

const DEFAULT_WEIGHTS: DataQualityWeights = {
  timeliness: 0.3,
  anomaly: 0.25,
  consistency: 0.2,
  jumpiness: 0.1,
  coverage: 0.15,
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100
}

function getDimensions(confidence: ConfidenceShape): DataQualityConfidenceDimension[] {
  if (Array.isArray(confidence.dimensions) && confidence.dimensions.length > 0) {
    return confidence.dimensions
  }

  const raw = DIMENSION_META.map((item) => {
    const score = Number(confidence[item.scoreKey] ?? 0)
    const weight = Number(confidence.weights?.[item.key] ?? DEFAULT_WEIGHTS[item.key] ?? 0)
    const maxContribution = roundScore(weight * 100)
    const actualContribution = roundScore(score * weight)
    const lossContribution = roundScore(Math.max(0, maxContribution - actualContribution))
    return {
      key: item.key,
      label: item.label,
      score,
      weight,
      maxContribution,
      actualContribution,
      lossContribution,
      lossShare: 0,
    } satisfies DataQualityConfidenceDimension
  })

  const totalLoss = raw.reduce((sum, item) => sum + item.lossContribution, 0)
  return raw
    .map((item) => ({
      ...item,
      lossShare: totalLoss > 0 ? roundScore((item.lossContribution / totalLoss) * 100) : 0,
    }))
    .sort((left, right) => right.lossContribution - left.lossContribution)
}

export function DataConfidenceBreakdown({
  confidence,
  title = '置信度维度分解',
  compact = false,
  testId,
}: {
  confidence: ConfidenceShape
  title?: string
  compact?: boolean
  testId?: string
}) {
  const dimensions = getDimensions(confidence)
  const visibleDimensions = compact ? dimensions.slice(0, 3) : dimensions
  const totalLoss = roundScore(Math.max(0, 100 - confidence.score))
  const leadingDimension = dimensions[0]

  return (
    <div data-testid={testId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</div>
          <div className="mt-1 text-sm text-slate-700">
            {totalLoss > 0
              ? `当前总降幅 ${totalLoss} 分，影响最大的是 ${leadingDimension?.label ?? '暂无' }。`
              : '当前没有明显降分维度，数据质量保持稳定。'}
          </div>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          总分 {Math.round(confidence.score)}%
        </div>
      </div>

      <div className="space-y-3">
        {visibleDimensions.map((dimension) => (
          <div key={dimension.key} className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-900">{dimension.label}</div>
              <div className="text-xs text-slate-500">
                权重 {Math.round(dimension.weight * 100)}% · 维度得分 {Math.round(dimension.score)}%
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${Math.max(0, Math.min(dimension.lossShare || 0, 100))}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>贡献降幅 {dimension.lossContribution.toFixed(1)} 分</span>
              <span>实际贡献 {dimension.actualContribution.toFixed(1)} / {dimension.maxContribution.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DataConfidenceBreakdown
