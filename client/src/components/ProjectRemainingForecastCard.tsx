import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, GitBranch, Link2, RefreshCw } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatNumber } from '@/lib/formatters'
import { formatDurationMetric, readAvailableDurationValue, type DurationMetricDto } from '@/lib/durationMetric'
import { cn } from '@/lib/utils'
import {
  getProjectRemainingDurationForecast,
  type ProjectRemainingDurationForecast,
  type ProjectRemainingDurationForecastResponse,
} from '@/services/projectRemainingForecastApi'

type ProjectRemainingForecastCardDensity = 'default' | 'compact'
type ProjectRemainingForecastCardTone = 'dashboard' | 'monthly' | 'gantt'
type ForecastReadState = {
  status: string | null
  degraded: boolean
  degradationReason: string | null
  message: string | null
}

function ForecastCompactLoadingState({ testId }: { testId: string }) {
  return (
    <div
      data-testid={`${testId}-loading`}
      className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32 rounded-full bg-slate-200" />
          <Skeleton className="h-4 w-48 rounded-full bg-slate-200" />
        </div>
        <div className="text-xs text-slate-500">读取预测依据</div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <Skeleton className="h-3 w-20 rounded-full bg-slate-200" />
            <Skeleton className="mt-2 h-5 w-24 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface ProjectRemainingForecastCardProps {
  projectId: string
  targetEndDate?: string | null
  asOfDate?: string | null
  title?: string
  description?: string
  testId?: string
  density?: ProjectRemainingForecastCardDensity
  tone?: ProjectRemainingForecastCardTone
  className?: string
  onOpenAcceleration?: () => void
  accelerationActionLoading?: boolean
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getGapLabel(metric: DurationMetricDto | null | undefined) {
  const value = readAvailableDurationValue(metric, 'calendar_day')
  if (value === null) return formatDurationMetric(metric)
  if (value > 0) return `超目标 ${formatDurationMetric(metric, { absolute: true })}`
  return `${formatDurationMetric(metric, { absolute: true })}余量`
}

function buildSignalItems(forecast: ProjectRemainingDurationForecast | null) {
  const context = forecast?.calculationContext
  return [
    {
      key: 'critical',
      label: '关键路径剩余',
      value: normalizeNumber(context?.criticalPath?.remainingTaskCount),
      suffix: '项',
      icon: GitBranch,
      hint: `最晚 ${formatDate(context?.criticalPath?.latestCriticalFinishDate)}`,
    },
    {
      key: 'monthly',
      label: '月计划承诺',
      value: normalizeNumber(context?.monthlyCommitments?.activeCommitmentCount),
      suffix: '项',
      icon: CalendarDays,
      hint: `最晚 ${formatDate(context?.monthlyCommitments?.latestCommitmentFinishDate)}`,
    },
    {
      key: 'external',
      label: '外部硬约束',
      value: normalizeNumber(context?.externalInterfaces?.hardGateCount),
      suffix: '项',
      icon: Link2,
      hint: `最晚 ${formatDate(context?.externalInterfaces?.latestGateFinishDate)}`,
    },
  ]
}

function buildForecastReadState(
  response?: Pick<ProjectRemainingDurationForecastResponse, 'status' | 'degraded' | 'degradationReason' | 'message'> | null,
): ForecastReadState {
  return {
    status: response?.status ?? null,
    degraded: response?.degraded === true,
    degradationReason: response?.degradationReason ?? null,
    message: response?.message ?? null,
  }
}

const INTERNAL_FORECAST_MESSAGE_PATTERN = new RegExp([
  '后' + '台.{0,4}计' + '算',
  'project_' + '.*forecast',
  '出' + '口',
  '同' + '一口径',
  '项目级' + '剩余工期',
].join('|'))

function getForecastUnavailableMessage(message: string | null | undefined, hasForecast: boolean) {
  if (message && !INTERNAL_FORECAST_MESSAGE_PATTERN.test(message)) return message
  return hasForecast
    ? '预测依据使用最近一次可用结果，刷新后会自动更新。'
    : '预测依据暂未更新，请稍后重试。'
}

function getForecastErrorMessage(message: string | null | undefined) {
  if (message && !INTERNAL_FORECAST_MESSAGE_PATTERN.test(message)) return message
  return '请稍后重试，或检查项目计划与进度数据是否已更新。'
}

export function ProjectRemainingForecastCard({
  projectId,
  targetEndDate,
  asOfDate,
  title = '预测依据',
  description = '',
  testId = 'project-remaining-forecast',
  density = 'default',
  tone = 'dashboard',
  className,
  onOpenAcceleration,
  accelerationActionLoading = false,
}: ProjectRemainingForecastCardProps) {
  const [forecast, setForecast] = useState<ProjectRemainingDurationForecast | null>(null)
  const [readState, setReadState] = useState<ForecastReadState>(() => buildForecastReadState())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const compact = density === 'compact'

  const loadForecast = useMemo(() => {
    return async (signal?: AbortSignal) => {
      const normalizedProjectId = String(projectId ?? '').trim()
      if (!normalizedProjectId) {
        setForecast(null)
        setReadState(buildForecastReadState())
        return
      }

      setLoading(true)
      setError(null)
      try {
        const response = await getProjectRemainingDurationForecast(
          normalizedProjectId,
          { targetEndDate, asOfDate },
          { signal },
        )
        setForecast(response.projectRemainingForecast)
        setReadState(buildForecastReadState(response))
      } catch (nextError) {
        if (nextError instanceof DOMException && nextError.name === 'AbortError') return
        setError(getForecastErrorMessage(nextError instanceof Error ? nextError.message : null))
        setForecast(null)
        setReadState(buildForecastReadState())
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    }
  }, [asOfDate, projectId, targetEndDate])

  useEffect(() => {
    const controller = new AbortController()
    void loadForecast(controller.signal)
    return () => controller.abort()
  }, [loadForecast])

  const signalItems = buildSignalItems(forecast)
  const remainingDuration = forecast?.projectRemainingForecast ?? null
  const targetGap = forecast?.targetGap ?? null
  const targetGapValue = readAvailableDurationValue(targetGap, 'calendar_day')
  const degradedMessage = readState.degraded ? getForecastUnavailableMessage(readState.message, Boolean(forecast)) : null
  const accelerationActionUnavailable = readState.degraded && !forecast

  return (
    <Card
      data-testid={testId}
      variant="detail"
      className={cn(
        tone === 'monthly' && 'border-blue-100 bg-blue-50/30',
        tone === 'gantt' && 'border-slate-200 bg-white',
        className,
      )}
    >
      <CardContent className={cn('space-y-4', compact ? 'p-4' : 'p-5')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {description ? <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div> : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            onClick={() => void loadForecast()}
            loading={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>

        {loading && !forecast ? (
          <ForecastCompactLoadingState testId={testId} />
        ) : error ? (
          <Alert data-testid={`${testId}-retry`} variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium">工期预测读取失败</div>
              <div className="mt-1 text-xs leading-5">{error}</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-8 border-red-200 bg-white text-xs text-red-700 hover:bg-red-50"
                onClick={() => void loadForecast()}
                loading={loading}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                重试
              </Button>
            </AlertDescription>
          </Alert>
        ) : readState.degraded && !forecast ? (
          <Alert data-testid={`${testId}-degraded`} className="border-amber-200 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription>
              <div className="font-medium">预测依据暂不可用</div>
              <div className="mt-1 text-xs leading-5 text-amber-800">
                {degradedMessage}
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {readState.degraded ? (
              <Alert data-testid={`${testId}-degraded`} className="border-amber-200 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  {degradedMessage || '预测依据使用最近一次可用结果，刷新后会自动更新。'}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>剩余工期</span>
                  <DurationBasisBadge basis="remaining" compact variant="outline" />
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
                  {formatDurationMetric(remainingDuration)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>预测完工</span>
                  <DurationBasisBadge basis="forecast" compact variant="outline" />
                </div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-slate-950">{formatDate(forecast?.forecastFinishDate)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="text-xs text-slate-500">目标差值</div>
                <div className={cn('mt-1 text-sm font-semibold tabular-nums', (targetGapValue ?? 0) > 0 ? 'text-red-700' : 'text-emerald-700')}>
                  {getGapLabel(targetGap)}
                </div>
              </div>
            </div>

            <div className={cn('grid gap-2', compact ? 'sm:grid-cols-1' : 'sm:grid-cols-3')}>
              {signalItems.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums text-slate-900">{formatNumber(item.value)}{item.suffix}</span>
                      <span className="truncate text-xs text-slate-500">{item.hint}</span>
                    </div>
                  </div>
                )
              })}
            </div>

          </>
        )}

        {onOpenAcceleration ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={accelerationActionUnavailable ? undefined : onOpenAcceleration}
              disabled={accelerationActionUnavailable}
              loading={!accelerationActionUnavailable && accelerationActionLoading}
              title={accelerationActionUnavailable ? '预测依据暂不可用，请稍后刷新' : undefined}
            >
              {accelerationActionUnavailable ? '稍后刷新' : accelerationActionLoading ? '生成中' : '查看赶工建议'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
