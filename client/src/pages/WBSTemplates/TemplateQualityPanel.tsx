import { ArrowRight, CheckCircle2, Layers3, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'

export interface TemplateQualitySuggestion {
  path: string
  title: string
  sample_count: number
  mean_days: number
  median_days: number
  current_reference_days: number | null
  suggested_reference_days: number | null
}

export interface TemplateQualitySnapshot {
  template_id: string
  template_name: string
  completed_project_count: number
  sample_task_count: number
  node_count: number
  leaf_count: number
  missing_reference_days_leaf_count: number
  missing_reference_days_ratio: number
  missing_standard_step_count: number
  structure_anomaly_count: number
  suggestions: TemplateQualitySuggestion[]
}

export interface TemplateQualityPanelProps {
  templateName: string
  templateType?: string | null
  quality: TemplateQualitySnapshot | null
  loading?: boolean
  applyingFeedback?: boolean
  canGenerateFromCompleted?: boolean
  selectedSuggestionPaths?: string[]
  onToggleSuggestion?: (path: string) => void
  onSelectAllSuggestions?: () => void
  onClearSuggestionSelection?: () => void
  onGenerateFromCompleted: () => void | Promise<void>
  onApplyFeedback: () => void | Promise<void>
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '0'
}

function MetricCard({
  testId,
  label,
  value,
  detail,
  tone,
}: {
  testId: string
  label: string
  value: string
  detail: string
  tone: 'amber' | 'emerald' | 'rose'
}) {
  void detail

  const toneClass = tone === 'amber'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-rose-200 bg-rose-50 text-rose-700'

  return (
    <div
      data-testid={testId}
      className={`rounded-2xl border p-4 ${toneClass}`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  )
}

export function TemplateQualityPanel({
  templateName,
  templateType,
  quality,
  loading = false,
  applyingFeedback = false,
  canGenerateFromCompleted = true,
  selectedSuggestionPaths = [],
  onToggleSuggestion,
  onSelectAllSuggestions,
  onClearSuggestionSelection,
  onGenerateFromCompleted,
  onApplyFeedback,
}: TemplateQualityPanelProps) {
  const suggestions = quality?.suggestions ?? []
  const suggestionCount = suggestions.length
  const hasCompletedSamples = Number(quality?.sample_task_count ?? 0) > 0
  const selectedSuggestionCount = suggestions.filter((suggestion) => selectedSuggestionPaths.includes(suggestion.path)).length

  return (
    <Card data-testid="wbs-template-quality-panel" className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-base">模板质量面板</CardTitle>
        </div>
        <CardDescription>
          {templateName}
          {templateType ? ` · ${templateType}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && !quality ? (
          <LoadingState
            label="模板质量加载中"
            description=""
            className="min-h-32"
          />
        ) : quality ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                testId="wbs-template-quality-missing-reference-days"
                label="缺少 reference_days"
                value={`${formatNumber(quality.missing_reference_days_leaf_count)} / ${formatNumber(
                  Math.max(quality.leaf_count, quality.missing_reference_days_leaf_count),
                )}`}
                detail={`叶子节点缺少工期占比 ${formatPercent(quality.missing_reference_days_ratio)}`}
                tone="amber"
              />
              <MetricCard
                testId="wbs-template-quality-missing-standard-steps"
                label="缺少标准工序节点"
                value={formatNumber(quality.missing_standard_step_count)}
                detail=""
                tone="emerald"
              />
              <MetricCard
                testId="wbs-template-quality-structure-anomalies"
                label="结构异常"
                value={formatNumber(quality.structure_anomaly_count)}
                detail=""
                tone="rose"
              />
            </div>

            <div data-testid="wbs-template-feedback-summary" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Layers3 className="h-4 w-4 text-slate-500" />
                已完成项目反馈摘要
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white bg-white p-3">
                  <div className="text-xs text-slate-500">已完成项目</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(quality.completed_project_count)}</div>
                </div>
                <div className="rounded-xl border border-white bg-white p-3">
                  <div className="text-xs text-slate-500">样本任务</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(quality.sample_task_count)}</div>
                </div>
                <div className="rounded-xl border border-white bg-white p-3">
                  <div className="text-xs text-slate-500">模板节点</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(quality.node_count)}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">模板校正建议</div>
                  {suggestionCount > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span data-testid="wbs-template-selected-suggestion-count">
                        已选 {selectedSuggestionCount} / {suggestionCount}
                      </span>
                      <button
                        type="button"
                        data-testid="wbs-template-select-all-suggestions"
                        className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                        onClick={() => onSelectAllSuggestions?.()}
                      >
                        全选
                      </button>
                      <button
                        type="button"
                        data-testid="wbs-template-clear-suggestions"
                        className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                        onClick={() => onClearSuggestionSelection?.()}
                      >
                        清空
                      </button>
                    </div>
                  ) : null}
                </div>
                {suggestionCount > 0 ? (
                  <div className="space-y-2">
                    {suggestions.map((suggestion, index) => (
                      <div
                        key={suggestion.path}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            data-testid={`wbs-template-suggestion-checkbox-${index}`}
                            checked={selectedSuggestionPaths.includes(suggestion.path)}
                            onChange={() => onToggleSuggestion?.(suggestion.path)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-900">{suggestion.title}</div>
                            <div className="mt-1 text-xs text-slate-500">{suggestion.path}</div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                              <span>样本 {suggestion.sample_count}</span>
                              <span>均值 {suggestion.mean_days}</span>
                              <span>中位数 {suggestion.median_days}</span>
                              <span>
                                当前 {suggestion.current_reference_days ?? '未设置'}
                              </span>
                              <span>
                                建议 {suggestion.suggested_reference_days ?? '未设置'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4" />
                )}
              </div>

              <div className="space-y-3">
                <Button
                  type="button"
                  data-testid="wbs-template-generate-from-completed"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => void onGenerateFromCompleted()}
                  disabled={!canGenerateFromCompleted}
                >
                  从已完成项目生成模板
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  data-testid="wbs-template-apply-feedback"
                  className="w-full gap-2"
                  onClick={() => void onApplyFeedback()}
                  disabled={applyingFeedback || selectedSuggestionCount === 0}
                >
                  {applyingFeedback ? '正在确认...' : `确认采纳已选建议${selectedSuggestionCount > 0 ? `（${selectedSuggestionCount}）` : ''}`}
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6" />
        )}
      </CardContent>
    </Card>
  )
}

export type { TemplateQualitySnapshot as WbsTemplateQualitySnapshot }
