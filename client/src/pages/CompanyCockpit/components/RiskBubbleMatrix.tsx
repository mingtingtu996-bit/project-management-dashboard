import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { EmptyState } from '@/components/EmptyState'
import { Separator } from '@/components/ui/separator'
import type { Issue, Risk } from '@/lib/supabase'

import type { ProjectRow } from '../types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface RiskBubbleMatrixProps {
  risks: Risk[]
  issues: Issue[]
  projectRows: ProjectRow[]
}

const SIGNAL_SOURCES = ['风险', '问题', '前置条件', '阻碍'] as const
const SIGNAL_LEVELS = [
  { key: 'low', label: '低', color: 'bg-blue-400', textColor: 'text-blue-600' },
  { key: 'medium', label: '中', color: 'bg-amber-400', textColor: 'text-amber-600' },
  { key: 'high', label: '高', color: 'bg-orange-500', textColor: 'text-orange-600' },
  { key: 'critical', label: '严重', color: 'bg-red-500', textColor: 'text-red-600' },
] as const

type SignalLevelKey = (typeof SIGNAL_LEVELS)[number]['key']

type UnifiedSignal = {
  source: (typeof SIGNAL_SOURCES)[number]
  level: SignalLevelKey
  weight: number
}

function normalizeRiskLevel(level?: string | null): SignalLevelKey {
  switch (String(level ?? '').trim().toLowerCase()) {
    case 'critical':
      return 'critical'
    case 'high':
      return 'high'
    case 'medium':
      return 'medium'
    default:
      return 'low'
  }
}

function normalizeIssueLevel(severity?: string | null): SignalLevelKey {
  switch (String(severity ?? '').trim().toLowerCase()) {
    case 'critical':
      return 'critical'
    case 'high':
      return 'high'
    case 'medium':
      return 'medium'
    default:
      return 'low'
  }
}

function classifyCountLevel(count: number, thresholds: { critical: number; high: number; medium: number }): SignalLevelKey {
  if (count >= thresholds.critical) return 'critical'
  if (count >= thresholds.high) return 'high'
  if (count >= thresholds.medium) return 'medium'
  return 'low'
}

function buildUnifiedSignals(input: RiskBubbleMatrixProps): UnifiedSignal[] {
  const activeRiskSignals = input.risks
    .filter((risk) => !['mitigated', 'closed', 'resolved'].includes(String(risk.status ?? '').trim().toLowerCase()))
    .map<UnifiedSignal>((risk) => ({
      source: '风险',
      level: normalizeRiskLevel(risk.level),
      weight: 1,
    }))

  const activeIssueSignals = input.issues
    .filter((issue) => !['closed', 'resolved'].includes(String(issue.status ?? '').trim().toLowerCase()))
    .map<UnifiedSignal>((issue) => ({
      source: '问题',
      level: normalizeIssueLevel(issue.severity),
      weight: 1,
    }))

  const conditionSignals = input.projectRows
    .filter((row) => (row.summary?.pendingConditionCount ?? 0) > 0)
    .map<UnifiedSignal>((row) => {
      const count = row.summary?.pendingConditionCount ?? 0
      return {
        source: '前置条件',
        level: classifyCountLevel(count, { critical: 6, high: 4, medium: 1 }),
        weight: count,
      }
    })

  const obstacleSignals = input.projectRows
    .filter((row) => (row.summary?.activeObstacles ?? row.summary?.activeObstacleCount ?? 0) > 0)
    .map<UnifiedSignal>((row) => {
      const count = row.summary?.activeObstacles ?? row.summary?.activeObstacleCount ?? 0
      return {
        source: '阻碍',
        level: classifyCountLevel(count, { critical: 4, high: 2, medium: 1 }),
        weight: count,
      }
    })

  return [
    ...activeRiskSignals,
    ...activeIssueSignals,
    ...conditionSignals,
    ...obstacleSignals,
  ]
}

function calcBubbleSize(count: number): number {
  return Math.min(42, 20 + count * 4)
}

export function RiskBubbleMatrix({ risks, issues, projectRows }: RiskBubbleMatrixProps) {
  const signals = buildUnifiedSignals({ risks, issues, projectRows })
  const matrix = SIGNAL_SOURCES.map((source) => {
    const sourceSignals = signals.filter((signal) => signal.source === source)
    return {
      source,
      counts: SIGNAL_LEVELS.map((level) => {
        const items = sourceSignals.filter((signal) => signal.level === level.key)
        return {
          level: level.key,
          label: level.label,
          color: level.color,
          textColor: level.textColor,
          count: items.length,
          weight: items.reduce((sum, item) => sum + item.weight, 0),
        }
      }),
      total: sourceSignals.length,
    }
  })

  const totalSignals = signals.length

  return (
    <Card className="surface-card">
      <CardContent padding="md" className="space-y-4">
        <CardHead
          eyebrow="MATRIX"
          title="风险 / 问题 / 阻碍分布"
          action={totalSignals > 0 ? (
            <span className="text-xs font-normal text-slate-500">
              共 {totalSignals} 个活跃信号
            </span>
          ) : null}
        />
        <div className="mb-4 flex items-center justify-center gap-3 text-xs">
          {SIGNAL_LEVELS.map((level) => (
            <span key={level.key} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${level.color}`} />
              <span className="text-slate-500">{level.label}</span>
            </span>
          ))}
        </div>

        <ChartAccessibleWrapper
          summary="风险矩阵数据"
          columns={['来源', '级别', '信号数', '权重']}
          rows={matrix.flatMap((item) =>
            item.counts.map((cell) => [item.source, cell.label, cell.count, cell.weight]),
          )}
        >
        <div className="relative">
          <div className="absolute bottom-0 left-0 top-0 flex w-10 flex-col justify-around py-2 text-xs text-slate-500">
            {[...SIGNAL_LEVELS].reverse().map((level) => (
              <span key={level.key} className="text-center">{level.label}</span>
            ))}
          </div>

          <div className="ml-10">
            <div className="mb-1 grid grid-cols-4 gap-2">
              {SIGNAL_SOURCES.map((source) => (
                <div key={source} className="py-1 text-center text-xs text-slate-500">
                  {source}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {[...SIGNAL_LEVELS].reverse().map((level) => (
                <div key={level.key} className="grid grid-cols-4 gap-2">
                  {SIGNAL_SOURCES.map((source, index) => {
                    const cell = matrix[index].counts.find((item) => item.level === level.key)
                    const count = cell?.count ?? 0
                    const weight = cell?.weight ?? 0

                    return (
                      <Tooltip key={`${source}-${level.key}`}>
  <TooltipTrigger asChild>
    <div
                        className="relative aspect-square rounded-xl bg-white transition-colors hover:bg-slate-100"
                        
                      >
                        <div className="flex h-full items-center justify-center">
                          {count > 0 ? (
                            <div
                              className={`flex items-center justify-center rounded-full text-xs font-semibold text-white shadow-[var(--el-1)] ${level.color}`}
                              style={{
                                width: `${calcBubbleSize(Math.max(count, weight))}px`,
                                height: `${calcBubbleSize(Math.max(count, weight))}px`,
                              }}
                            >
                              {count}
                            </div>
                          ) : null}
                        </div>
                      </div>
  </TooltipTrigger>
  <TooltipContent>{count > 0 ? `${source} · ${level.label}：${count} 个信号` : `${source} · ${level.label}`}</TooltipContent>
</Tooltip>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        </ChartAccessibleWrapper>

        {totalSignals > 0 ? (
          <div className="mt-4 pt-3">
            <Separator className="mb-3" />
            <div className="flex flex-wrap gap-2">
              {matrix
                .filter((item) => item.total > 0)
                .sort((left, right) => right.total - left.total)
                .map((item) => (
                  <span
                    key={item.source}
                    className="rounded-full bg-white px-3 py-1 text-xs text-slate-600"
                  >
                    {item.source}: {item.total} 个
                  </span>
                ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title="暂无活跃风险信号"
            description="当前项目组合没有待跟踪的风险、问题、前置条件或阻碍信号。"
            className="mt-4 rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-8"
          />
        )}
      </CardContent>
    </Card>
  )
}
