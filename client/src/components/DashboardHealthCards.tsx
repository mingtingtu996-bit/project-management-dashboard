import { Link } from 'react-router-dom'

import { CardHead } from '@/components/ui/card-head'
import { CHART_SERIES } from '@/lib/chartPalette'
import { cn } from '@/lib/utils'
import type { ProjectSummary } from '@/services/dashboardApi'

interface DashboardHealthCardsProps {
  summary: ProjectSummary | null
  projectId: string
  embedded?: boolean
  healthDetails?: DashboardBusinessHealthDetails | null
  healthDetailsStatus?: HealthDetailsStatus
}

export interface DashboardBusinessHealthDetails {
  progressDeliveryScore?: number
  executionStabilityScore?: number
  criticalTargetScore?: number
  businessExceptionScore?: number
  planGovernanceScore?: number
  taskExecutionScore?: number
  milestoneDeliveryScore?: number
  riskControlScore?: number
  dataTrustScore?: number
  reliabilityScore?: number | null
  businessHealthScore?: number | null
  healthConfidenceScore?: number | null
  capReasons?: string[]
  totalScore?: number
  metricAvailability?: {
    progressDeliveryScore?: boolean
    executionStabilityScore?: boolean
    criticalTargetScore?: boolean
    businessExceptionScore?: boolean
    planGovernanceScore?: boolean
    healthConfidenceScore?: boolean
    taskExecutionScore?: boolean
    milestoneDeliveryScore?: boolean
    riskControlScore?: boolean
    dataTrustScore?: boolean
  }
  metricUnavailableReasons?: Partial<Record<
    'progressDeliveryScore'
    | 'executionStabilityScore'
    | 'criticalTargetScore'
    | 'businessExceptionScore'
    | 'planGovernanceScore'
    | 'healthConfidenceScore'
    | 'taskExecutionScore'
    | 'milestoneDeliveryScore'
    | 'riskControlScore'
    | 'dataTrustScore',
    string
  >>
}

export type HealthDetailsStatus = 'loading' | 'ready' | 'unavailable' | 'degraded'

function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(Number(value))))
}

function normalizePercent(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(Number(value))))
}

function getSemanticTone(value: number): string {
  if (value >= 80) return 'bg-emerald-500'
  if (value >= 60) return 'bg-slate-500'
  if (value >= 40) return 'bg-amber-500'
  return 'bg-rose-500'
}

function pickNumber(...values: Array<number | null | undefined>) {
  return values.find((value) => Number.isFinite(value)) ?? undefined
}

function pickBoolean(...values: Array<boolean | undefined>) {
  return values.find((value) => typeof value === 'boolean')
}

function pickString(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === 'string' && value.length > 0)
}

function ProgressBar({
  value,
  minVisible = true,
  neutral = false,
}: {
  value: number
  minVisible?: boolean
  neutral?: boolean
}) {
  const percent = clampPercent(value)
  const width = minVisible ? Math.max(percent, 4) : percent
  const tone = neutral ? 'bg-slate-300' : getSemanticTone(percent)

  return (
    <div className="h-[3px] overflow-hidden rounded-full bg-slate-100">
      <div className={cn('h-full rounded-full transition-all duration-500 ease-out', tone)} style={{ width: `${width}%` }} />
    </div>
  )
}

function Donut({
  label,
  value,
  color,
}: {
  label: string
  value: number | null
  color: string
}) {
  const safeValue = normalizePercent(value)
  const isUnavailable = safeValue === null
  const radius = 48
  const strokeW = 6
  const circumference = 2 * Math.PI * radius
  const progressLength = ((safeValue ?? 0) / 100) * circumference

  return (
    <div className="relative h-[110px] w-[110px] shrink-0">
      <svg viewBox="0 0 110 110" className="h-full w-full" role="img" aria-label={isUnavailable ? `${label} 暂不可用` : `${label} ${safeValue}%`}>
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          className="stroke-slate-200"
          strokeWidth={strokeW}
          opacity={isUnavailable || safeValue === 0 ? 0.4 : 1}
        />
        {!isUnavailable && safeValue > 0 ? (
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={`${progressLength} ${circumference}`}
            transform="rotate(-90 55 55)"
            className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700 motion-safe:ease-out"
          />
        ) : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className={cn('metric-value-lg num-display font-semibold leading-none', isUnavailable || safeValue === 0 ? 'text-slate-400' : 'text-slate-900')}>
          {isUnavailable ? '--' : `${safeValue}%`}
        </div>
        <div className="eyebrow mt-1.5">{label}</div>
      </div>
    </div>
  )
}

function ScoreRow({
  label,
  value,
  tone,
  available = true,
  loading = false,
  unavailableReason,
  isLast = false,
}: {
  label: string
  value: number
  tone: string
  available?: boolean
  loading?: boolean
  unavailableReason?: string
  isLast?: boolean
}) {
  const displayValue = loading ? '加载中' : available ? `${value}%` : '暂无'
  return (
    <div className={cn('py-2', !isLast && 'border-b border-slate-100')} title={!available && !loading ? unavailableReason : undefined}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2.5 text-xs text-slate-600">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone)} />
          <span className="truncate">{label}</span>
        </span>
        <span className={cn('num-mono text-xs', loading || !available || value === 0 ? 'text-slate-400' : 'text-slate-600')}>
          {displayValue}
        </span>
      </div>
      <ProgressBar
        value={available && !loading ? value : 0}
        minVisible={available && !loading && value > 0}
        neutral={!available || loading}
      />
    </div>
  )
}

function StatusRow({
  label,
  value,
  dot,
  progressValue,
  isLast = false,
}: {
  label: string
  value: number
  dot: string
  progressValue: number
  isLast?: boolean
}) {
  return (
    <div className={cn('py-2', !isLast && 'border-b border-slate-100')}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2.5 text-xs text-slate-600">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
          <span className="truncate">{label}</span>
        </span>
        <span className={cn('num-mono text-xs', value === 0 ? 'text-slate-400' : 'text-slate-600')}>{value}</span>
      </div>
      <div className="mt-1">
        <ProgressBar value={progressValue} minVisible={value > 0} />
      </div>
    </div>
  )
}

export function DashboardHealthCards({
  summary,
  projectId,
  embedded = false,
  healthDetails = null,
  healthDetailsStatus = 'unavailable',
}: DashboardHealthCardsProps) {
  const completed = summary?.completedTaskCount ?? 0
  const total = summary?.leafTaskCount ?? 0
  const completedRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const inProgress = summary?.inProgressTaskCount ?? 0
  const delayed = summary?.delayedTaskCount ?? 0
  const notStarted = Math.max(0, total - completed - inProgress)

  const activeRisks = summary?.activeRiskCount ?? 0
  const activeIssues = summary?.activeIssueCount ?? 0
  const activeObstacles = summary?.activeObstacleCount ?? 0
  const pendingConditions = summary?.pendingConditionTaskCount ?? 0
  const totalSignals = activeRisks + activeIssues + activeObstacles + pendingConditions
  const riskSuggestion = totalSignals > 0
    ? (summary?.highestWarningSummary ? `首要关注：${summary.highestWarningSummary}` : '请进入风险与问题页查看待处理项')
    : '暂无活跃风险'
  const signalTiles = [
    { label: '风险', value: activeRisks, dot: 'bg-rose-500', href: `/projects/${projectId}/risks` },
    { label: '问题', value: activeIssues, dot: 'bg-amber-500', href: `/projects/${projectId}/risks?tab=issues` },
    { label: '阻碍', value: activeObstacles, dot: 'bg-slate-400', href: `/projects/${projectId}/gantt` },
    { label: '条件', value: pendingConditions, dot: 'bg-blue-600', href: `/projects/${projectId}/gantt` },
  ]
  const signalDistributionLabel = `信号分布：风险 ${activeRisks}、问题 ${activeIssues}、阻碍 ${activeObstacles}、条件 ${pendingConditions}`

  const businessHealthScore = normalizePercent(pickNumber(healthDetails?.businessHealthScore, summary?.businessHealthScore))
  const isHealthDetailsDegraded = healthDetailsStatus === 'degraded'
  const degradedHealthReasons = (healthDetails?.capReasons ?? []).slice(0, 2)
  const columnClassName = embedded
    ? 'flex h-full min-w-0 flex-col border-b border-slate-100 pb-5 last:border-b-0 last:pb-0 md:border-b-0 md:pb-0 md:border-r md:border-slate-100 md:pr-5 md:last:border-r-0 md:last:pr-0'
    : 'surface-card flex h-full flex-col p-5'
  const donutContentClassName = 'mt-4 grid gap-5 lg:grid-cols-[110px_minmax(0,1fr)] lg:items-start'
  const hasHealthDetails = healthDetailsStatus === 'ready' && Boolean(healthDetails)
  const v1419BusinessScores = [
    {
      label: '进度兑现',
      value: healthDetails?.progressDeliveryScore,
      tone: 'bg-blue-600',
      available: healthDetails?.metricAvailability?.progressDeliveryScore,
      unavailableReason: healthDetails?.metricUnavailableReasons?.progressDeliveryScore,
    },
    {
      label: '执行稳定度',
      value: pickNumber(healthDetails?.executionStabilityScore, healthDetails?.taskExecutionScore),
      tone: 'bg-emerald-500',
      available: pickBoolean(healthDetails?.metricAvailability?.executionStabilityScore, healthDetails?.metricAvailability?.taskExecutionScore),
      unavailableReason: pickString(healthDetails?.metricUnavailableReasons?.executionStabilityScore, healthDetails?.metricUnavailableReasons?.taskExecutionScore),
    },
    {
      label: '关键目标',
      value: pickNumber(healthDetails?.criticalTargetScore, healthDetails?.milestoneDeliveryScore),
      tone: 'bg-amber-500',
      available: pickBoolean(healthDetails?.metricAvailability?.criticalTargetScore, healthDetails?.metricAvailability?.milestoneDeliveryScore),
      unavailableReason: pickString(healthDetails?.metricUnavailableReasons?.criticalTargetScore, healthDetails?.metricUnavailableReasons?.milestoneDeliveryScore),
    },
    {
      label: '业务异常',
      value: pickNumber(healthDetails?.businessExceptionScore, healthDetails?.riskControlScore),
      tone: 'bg-rose-500',
      available: pickBoolean(healthDetails?.metricAvailability?.businessExceptionScore, healthDetails?.metricAvailability?.riskControlScore),
      unavailableReason: pickString(healthDetails?.metricUnavailableReasons?.businessExceptionScore, healthDetails?.metricUnavailableReasons?.riskControlScore),
    },
    {
      label: '计划治理',
      value: healthDetails?.planGovernanceScore,
      tone: 'bg-slate-500',
      available: healthDetails?.metricAvailability?.planGovernanceScore,
      unavailableReason: healthDetails?.metricUnavailableReasons?.planGovernanceScore,
    },
  ].map((item) => ({
    ...item,
    value: hasHealthDetails ? clampPercent(item.value) : 0,
    available: hasHealthDetails ? (item.available ?? true) : false,
    loading: healthDetailsStatus === 'loading',
    unavailableReason: hasHealthDetails ? item.unavailableReason : '健康指标暂不可用',
  }))
  const taskStatusRows = [
    { label: '已完成', value: completed, dot: 'bg-emerald-500', progressValue: completedRate },
    { label: '进行中', value: inProgress, dot: 'bg-blue-600', progressValue: total > 0 ? Math.round((inProgress / total) * 100) : 0 },
    { label: '未开始', value: notStarted, dot: 'bg-slate-400', progressValue: total > 0 ? Math.round((notStarted / total) * 100) : 0 },
    { label: '已延期', value: delayed, dot: 'bg-rose-500', progressValue: total > 0 ? Math.round((delayed / total) * 100) : 0 },
  ]

  return (
    <div className={cn('grid grid-cols-1 gap-5', embedded ? 'md:grid-cols-3' : 'xl:grid-cols-3')}>
      <section className={columnClassName}>
        <CardHead
          eyebrow="HEALTH"
          title="业务健康指标"
        />
        {isHealthDetailsDegraded ? (
          <div
            data-testid="dashboard-health-degraded-note"
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
          >
            参考 / 低信 / 部分维度暂不可用
            {degradedHealthReasons.length > 0 ? ` / ${degradedHealthReasons.join(' / ')}` : null}
          </div>
        ) : null}
        <div className={donutContentClassName}>
          <Donut
            label={isHealthDetailsDegraded ? '业务健康参考' : '业务健康'}
            value={businessHealthScore}
            color={isHealthDetailsDegraded ? CHART_SERIES.warning : CHART_SERIES.success}
          />
          <div className="min-w-0">
            {v1419BusinessScores.map((item, index) => (
              <ScoreRow
                key={item.label}
                label={item.label}
                value={item.value}
                tone={item.tone}
                available={item.available}
                loading={item.loading}
                unavailableReason={item.unavailableReason}
                isLast={index === v1419BusinessScores.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={columnClassName}>
        <CardHead
          eyebrow="TASKS"
          title="任务执行情况"
        />
        <div className={donutContentClassName}>
          <Donut label="完成率" value={completedRate} color={CHART_SERIES.primary} />
          <div className="min-w-0">
            {taskStatusRows.map((item, index) => (
              <StatusRow
                key={item.label}
                label={item.label}
                value={item.value}
                dot={item.dot}
                progressValue={item.progressValue}
                isLast={index === taskStatusRows.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={columnClassName}>
        <CardHead
          eyebrow="RISKS"
          title="风险与异常追踪"
        />
        <div className="mt-5 space-y-1">
          <div className="text-xs text-slate-600">信号分布</div>
          <div
            className="flex h-[3px] overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={signalDistributionLabel}
          >
            {totalSignals > 0
              ? signalTiles.map((item) => (
                  <span
                    key={item.label}
                    className={item.dot}
                    style={{ width: `${(item.value / totalSignals) * 100}%` }}
                  />
                ))
              : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {signalTiles.map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-3 transition-colors hover:bg-white"
            >
              <div className="inline-flex min-w-0 items-center gap-2.5 text-xs text-slate-600">
                <span className={cn('h-1.5 w-1.5 rounded-full', item.dot)} />
                <span className="truncate">{item.label}</span>
              </div>
              <div className={cn('num-mono mt-1 text-xs', item.value === 0 ? 'text-slate-400' : 'text-slate-600')}>
                {item.value}
              </div>
            </Link>
          ))}
        </div>
        <div className="meta-caption mt-4 leading-relaxed text-slate-500">
          {riskSuggestion}
        </div>
      </section>
    </div>
  )
}
