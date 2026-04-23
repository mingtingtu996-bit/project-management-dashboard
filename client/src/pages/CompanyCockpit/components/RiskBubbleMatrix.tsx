import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Issue, Risk } from '@/lib/supabase'

import type { ProjectRow } from '../types'

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
    <Card className="rounded-[24px] border border-slate-100 bg-slate-50 shadow-none">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center justify-between text-base font-semibold text-slate-900">
          <span>风险 / 问题 / 阻碍分布</span>
          {totalSignals > 0 && (
            <span className="text-xs font-normal text-slate-500">
              共 {totalSignals} 个活跃信号
            </span>
          )}
        </CardTitle>
        <p className="text-xs leading-5 text-slate-500">
          数据源对齐统一风险底座，合并风险、问题、前置条件和阻碍，便于在公司层快速识别高密度异常来源。
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-4 flex items-center justify-center gap-3 text-xs">
          {SIGNAL_LEVELS.map((level) => (
            <span key={level.key} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded-full ${level.color}`} />
              <span className="text-slate-500">{level.label}</span>
            </span>
          ))}
        </div>

        <div className="relative">
          <div className="absolute bottom-0 left-0 top-0 flex w-10 flex-col justify-around py-2 text-[10px] text-slate-400">
            {[...SIGNAL_LEVELS].reverse().map((level) => (
              <span key={level.key} className="text-center">{level.label}</span>
            ))}
          </div>

          <div className="ml-10">
            <div className="mb-1 grid grid-cols-4 gap-2">
              {SIGNAL_SOURCES.map((source) => (
                <div key={source} className="py-1 text-center text-[10px] text-slate-500">
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
                      <div
                        key={`${source}-${level.key}`}
                        className="relative aspect-square rounded-xl bg-white transition-colors hover:bg-slate-100"
                        title={count > 0 ? `${source} · ${level.label}：${count} 个信号` : `${source} · ${level.label}`}
                      >
                        <div className="flex h-full items-center justify-center">
                          {count > 0 ? (
                            <div
                              className={`flex items-center justify-center rounded-full text-[10px] font-semibold text-white shadow-sm ${level.color}`}
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
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {totalSignals > 0 ? (
          <div className="mt-4 border-t border-slate-200 pt-3">
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
          <div className="py-8 text-center text-sm text-slate-400">暂无活跃风险信号</div>
        )}
      </CardContent>
    </Card>
  )
}
