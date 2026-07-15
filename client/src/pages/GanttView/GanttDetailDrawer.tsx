import { useEffect, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import {
  BlockageDrawerSection,
  ConditionDrawerSection,
  type BlockageRecord,
  type ConditionRecord,
} from '@/components/planning/DrawerSections'
import {
  PlanningDetailDrawer,
  type DrawerSection,
} from '@/components/planning/PlanningDetailDrawer'
import {
  EngineeringObjectLookup,
  type EngineeringObjectLookupOption,
} from '@/components/planning/lookups/EngineeringObjectLookup'
import { getWbsNodeTypeLabel } from '@/lib/wbsLabels'
import {
  getTaskDurationForecast,
  type TaskDurationForecast,
} from '@/services/durationSuggestionsApi'
import { useDurationForecastRefreshKey } from '@/hooks/useDurationForecastRefreshKey'
import { inclusiveDurationDays } from '@/lib/durationDays'

import type { Task, TaskCondition, TaskObstacle } from '../GanttViewTypes'
import { getTaskWbsNodeType } from '../GanttViewTypes'
import {
  getTaskDisplayTitle,
  type RelatedRiskIssueSummary,
} from './ganttViewUtils'

type DetailDrawerScopeObject = {
  id: string
  objectName?: string | null
  objectCode?: string | null
  objectType?: string | null
}

type AcceptanceImpactItem = {
  id: string
  name?: string | null
  status?: string | null
  statusLabel?: string | null
}

type GanttDetailDrawerProps = {
  acceptanceItems: AcceptanceImpactItem[]
  blockages: BlockageRecord[]
  canEdit: boolean
  conditions: TaskCondition[]
  conditionRecords: ConditionRecord[]
  detailScopeDirty: boolean
  detailScopeDraftObjectId: string | null
  engineeringObjectLookupOptions: EngineeringObjectLookupOption[]
  engineeringObjectsLoading: boolean
  hasNext: boolean
  hasPrevious: boolean
  navigate: NavigateFunction
  onAddBlockage: (data: { description: string; severity: string; expectedResolutionDate: string }) => void | Promise<void>
  onClose: () => void
  onDeleteCondition: (conditionId: string) => void
  onNextTask: () => void
  onOpenConditionDialog: (task: Task) => void | Promise<void>
  onOpenEngineeringObjects: () => void
  onOpenTemplateGenerate?: () => void
  onPreviousTask: () => void
  onResolveObstacle: (obstacle: TaskObstacle) => void | Promise<void>
  onSaveScopeObject: () => void | Promise<void>
  onScopeDraftObjectChange: (objectId: string | null) => void
  onSectionChange: (section: DrawerSection) => void
  onSelectTask: (taskId: string, section?: DrawerSection) => void
  onToggleCondition: (condition: TaskCondition) => void | Promise<void>
  obstacles: TaskObstacle[]
  predecessors: Task[]
  primaryScopeObjectId: string | null
  projectId?: string | null
  relatedRiskIssueCount: number
  relatedRiskIssueSummary: RelatedRiskIssueSummary | null
  scopeObjects: DetailDrawerScopeObject[]
  section: DrawerSection
  task: Task | null
}

function formatForecastConfidence(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'high') return '高'
  if (normalized === 'medium') return '中'
  if (normalized === 'low') return '低'
  return value || '-'
}

function formatForecastDelay(days?: number | null) {
  const value = Number(days ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '无明显偏差'
  return `较计划偏晚 ${Math.round(value)} 天`
}

function getForecastBadgeClass(severity?: string | null) {
  const normalized = String(severity ?? '').trim().toLowerCase()
  if (normalized === 'high') return 'border-red-200 bg-red-50 text-red-700'
  if (normalized === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-blue-100 bg-blue-50 text-blue-700'
}

function readDurationRiskDays(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue) : null
}

function readFloatDays(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? Math.round(numberValue) : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readTruthFlag(value: unknown) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['true', '1', 'yes'].includes(normalized)
}

function formatClimateSignal(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'rainy_season') return '雨季'
  if (normalized === 'winter_season') return '冬季'
  if (normalized === 'high_temperature') return '高温'
  if (normalized === 'typhoon_season') return '台风季'
  return String(value ?? '').trim() || '已应用'
}

function buildDurationAssetEvidence(task?: Task | null) {
  const metadata = readRecord(task?.standard_task_metadata)
  const calculation = readRecord(metadata.durationAssetCalculation ?? metadata.duration_asset_calculation)
  const evidence: string[] = []
  const calendarBasis = String(metadata.calendarBasis ?? metadata.calendar_basis ?? '').trim()
  const calendarWindowCount = readFloatDays(metadata.constructionCalendarWindowCount ?? metadata.construction_calendar_window_count)

  if ((calendarBasis && calendarBasis !== 'calendar_day') || (calendarWindowCount ?? 0) > 0) {
    evidence.push(calendarWindowCount !== null ? `施工日历 ${calendarWindowCount} 个窗口` : '施工日历 已应用')
  }

  if (readTruthFlag(calculation.runtimeReferenceDaysConsumed ?? calculation.runtime_reference_days_consumed)) {
    const runtimeP50 = readFloatDays(calculation.runtimeReferenceDaysP50Days ?? calculation.runtime_reference_days_p50_days)
    evidence.push(runtimeP50 !== null ? `运行样本 ${runtimeP50} 天` : '运行样本 已应用')
  }

  if (readTruthFlag(calculation.processSeasonalDurationAssetConsumed ?? calculation.process_seasonal_duration_asset_consumed)) {
    evidence.push(`季节修正 ${formatClimateSignal(calculation.processSeasonalClimateSignal ?? calculation.process_seasonal_climate_signal)}`)
  }

  return evidence
}

function readDurationRiskRange(task?: Task | null) {
  const metadata = readRecord(task?.standard_task_metadata)
  const suggestion = readRecord(metadata.durationSuggestion ?? metadata.duration_suggestion)
  const range = task?.duration_risk_range ?? {}
  const suggestionRange = readRecord(suggestion.durationRiskRange ?? suggestion.duration_risk_range)
  const p20 = readDurationRiskDays(
    task?.duration_risk_p20_days
      ?? range.p20_days
      ?? range.p20Days
      ?? suggestion.riskP20DurationDays
      ?? suggestion.risk_p20_duration_days
      ?? suggestionRange.p20Days
      ?? suggestionRange.p20_days,
  )
  const p50 = readDurationRiskDays(
    task?.duration_risk_p50_days
      ?? range.p50_days
      ?? range.p50Days
      ?? suggestion.riskP50DurationDays
      ?? suggestion.risk_p50_duration_days
      ?? suggestionRange.p50Days
      ?? suggestionRange.p50_days,
  )
  const p80 = readDurationRiskDays(
    task?.duration_risk_p80_days
      ?? range.p80_days
      ?? range.p80Days
      ?? suggestion.riskP80DurationDays
      ?? suggestion.risk_p80_duration_days
      ?? suggestionRange.p80Days
      ?? suggestionRange.p80_days,
  )
  if (p20 == null && p50 == null && p80 == null) return null
  return { p20, p50, p80 }
}

function durationRiskSummary(range: ReturnType<typeof readDurationRiskRange>) {
  if (!range) return null
  const baselineDays = range.p50 ?? range.p20
  if (baselineDays !== null && range.p80 !== null && range.p80 > baselineDays) {
    return `建议预留 ${range.p80 - baselineDays} 天`
  }
  return '工期风险已评估'
}

export function GanttDetailDrawer({
  acceptanceItems,
  blockages,
  canEdit,
  conditions,
  conditionRecords,
  detailScopeDirty,
  detailScopeDraftObjectId,
  engineeringObjectLookupOptions,
  engineeringObjectsLoading,
  hasNext,
  hasPrevious,
  navigate,
  onAddBlockage,
  onClose,
  onDeleteCondition,
  onNextTask,
  onOpenConditionDialog,
  onOpenEngineeringObjects,
  onOpenTemplateGenerate,
  onPreviousTask,
  onResolveObstacle,
  onSaveScopeObject,
  onScopeDraftObjectChange,
  onSectionChange,
  onSelectTask,
  onToggleCondition,
  obstacles,
  predecessors,
  primaryScopeObjectId,
  projectId,
  relatedRiskIssueCount,
  relatedRiskIssueSummary,
  scopeObjects,
  section,
  task,
}: GanttDetailDrawerProps) {
  const [durationForecast, setDurationForecast] = useState<TaskDurationForecast | null>(null)
  const [durationForecastLoading, setDurationForecastLoading] = useState(false)
  const durationForecastRefreshKey = useDurationForecastRefreshKey(Boolean(task?.id))
  const plannedStartDate = task?.start_date || task?.planned_start_date || null
  const plannedEndDate = task?.end_date || task?.planned_end_date || null
  const planDurationDays = inclusiveDurationDays(plannedStartDate, plannedEndDate)
  const planDurationLabel = planDurationDays == null ? '-' : `${planDurationDays} 天`
  const durationRiskRange = readDurationRiskRange(task)
  const durationRiskSummaryLabel = durationRiskSummary(durationRiskRange)
  const totalFloatDays = readFloatDays(task?.total_float_days)
  const freeFloatDays = readFloatDays(task?.free_float_days)
  const showCriticalPathFloat = Boolean(task?.is_critical) || totalFloatDays !== null || freeFloatDays !== null
  const durationAssetEvidence = buildDurationAssetEvidence(task)

  useEffect(() => {
    const taskId = task?.id
    if (!taskId) {
      setDurationForecast(null)
      setDurationForecastLoading(false)
      return
    }

    const controller = new AbortController()
    setDurationForecastLoading(true)
    getTaskDurationForecast(taskId, { signal: controller.signal })
      .then((forecast) => setDurationForecast(forecast))
      .catch((error) => {
        if ((error as DOMException)?.name !== 'AbortError') {
          setDurationForecast(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDurationForecastLoading(false)
      })

    return () => controller.abort()
  }, [durationForecastRefreshKey, task?.id])

  return (
    <PlanningDetailDrawer
      open={Boolean(task)}
      onClose={onClose}
      taskTitle={getTaskDisplayTitle(task)}
      taskSequenceLabel={task?.wbs_code}
      taskStatusLabel={task?.statusLabel || task?.displayStatus || task?.status}
      activeSection={section}
      onSectionChange={onSectionChange}
      hasPrevious={hasPrevious}
      hasNext={hasNext}
      onPreviousTask={onPreviousTask}
      onNextTask={onNextTask}
      renderBasicInfo={() => (
        <div className="space-y-3 text-sm text-slate-700">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">任务名称</div>
            <div className="mt-1 font-medium text-slate-900">{getTaskDisplayTitle(task)}</div>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-slate-500">计划开始</div>
              <div className="mt-1 num-mono text-slate-800">{plannedStartDate || '-'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-slate-500">计划完成</div>
              <div className="mt-1 num-mono text-slate-800">{plannedEndDate || '-'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-slate-500">
                <DurationBasisBadge basis="plan" compact variant="outline" className="bg-white/70" />
                计划工期
              </div>
              <div className="mt-1 num-mono text-slate-800">{planDurationLabel}</div>
            </div>
          </div>
          {durationRiskSummaryLabel ? (
            <div data-testid="task-duration-risk-range" className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">工期风险</span>
                <DurationBasisBadge basis="reference" compact variant="outline" />
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1 text-slate-700 num-mono">{durationRiskSummaryLabel}</div>
            </div>
          ) : null}
          {durationAssetEvidence.length > 0 ? (
            <div data-testid="task-duration-asset-evidence" className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              <div className="mb-2 font-medium">工期资产依据</div>
              <div className="flex flex-wrap gap-2 text-emerald-700">
                {durationAssetEvidence.map((item) => (
                  <span key={item} className="rounded-lg bg-white px-2 py-1">{item}</span>
                ))}
              </div>
            </div>
          ) : null}
          {showCriticalPathFloat ? (
            <div data-testid="task-critical-path-float" className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 text-xs text-rose-900">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium">关键路径浮时</span>
                {task?.is_critical ? <Badge variant="outline" className="border-rose-200 bg-white text-rose-700">关键</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2 text-rose-700">
                {totalFloatDays !== null ? <span className="rounded-lg bg-white px-2 py-1 num-mono">总浮时 {totalFloatDays} 天</span> : null}
                {freeFloatDays !== null ? <span className="rounded-lg bg-white px-2 py-1 num-mono">自由浮时 {freeFloatDays} 天</span> : null}
              </div>
            </div>
          ) : null}
          {durationForecast ? (
            <div data-testid="task-duration-forecast" className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <DurationBasisBadge basis="remaining" compact variant="outline" className="bg-white/70" />
                  执行中剩余工期预测
                </span>
                <span>{formatForecastDelay(durationForecast.forecastDelayDays)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-blue-700">
                {durationForecast.remainingForecastDays != null ? <span>预计还需 {durationForecast.remainingForecastDays} 天</span> : null}
                <span>预计完成 {durationForecast.forecastFinishDate || '-'}</span>
                <span>可信度 {formatForecastConfidence(durationForecast.confidenceLevel)}</span>
              </div>
              {durationForecast.businessFactorBadges?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {durationForecast.businessFactorBadges.slice(0, 4).map((badge) => (
                    <Badge
                      key={`${badge.type}:${badge.label}`}
                      variant="outline"
                      className={getForecastBadgeClass(badge.severity)}
                    >
                      {badge.label}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {durationForecast.businessReason ? (
                <div className="mt-2 leading-5 text-blue-700">{durationForecast.businessReason}</div>
              ) : null}
              {durationForecast.topFactors?.length ? (
                <ul className="mt-2 space-y-1 text-blue-700">
                  {durationForecast.topFactors.slice(0, 3).map((factor) => (
                    <li key={factor}>• {factor}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : durationForecastLoading ? (
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">正在计算预计完成时间...</div>
          ) : null}
          {relatedRiskIssueCount > 0 && task?.id ? (
            <div
              data-testid="task-related-risk-issue-summary"
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800"
            >
              <span>
                存在 {relatedRiskIssueCount} 个相关风险问题
                {relatedRiskIssueSummary?.riskCount ? ` · 风险 ${relatedRiskIssueSummary.riskCount}` : ''}
                {relatedRiskIssueSummary?.issueCount ? ` · 问题 ${relatedRiskIssueSummary.issueCount}` : ''}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 border-amber-200 bg-white text-xs text-amber-800"
                onClick={() => {
                  if (!projectId || !task?.id) return
                  const stream = (relatedRiskIssueSummary?.issueCount ?? 0) > 0
                    && (relatedRiskIssueSummary?.riskCount ?? 0) === 0
                    ? 'issues'
                    : 'risks'
                  navigate(`/projects/${projectId}/risks?stream=${stream}&taskId=${encodeURIComponent(task.id)}`)
                }}
              >
                跳转专题页
              </Button>
            </div>
          ) : null}
        </div>
      )}
      renderScope={() => (
        <div className="space-y-2 text-sm text-slate-700">
          {scopeObjects.length > 0 ? (
            scopeObjects.map((object) => (
              <div key={object.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{object.objectName || object.objectCode || object.id}</div>
                  <div className="mt-1 text-xs text-slate-500">{object.objectType}</div>
                </div>
                {object.objectCode ? <span className="shrink-0 text-xs num-mono text-slate-400">{object.objectCode}</span> : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">该任务尚未绑定工程对象</p>
          )}
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="mb-2 text-xs font-medium text-slate-600">主要施工对象</div>
            <EngineeringObjectLookup
              valueId={detailScopeDraftObjectId}
              options={engineeringObjectLookupOptions}
              disabled={!canEdit || engineeringObjectsLoading}
              canCreate={canEdit}
              className="border-0 bg-white p-0 shadow-none"
              onChange={onScopeDraftObjectChange}
              onCreate={onOpenEngineeringObjects}
            />
            {engineeringObjectsLoading ? <p className="mt-2 text-xs text-slate-500">正在加载工程对象...</p> : null}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-slate-500"
                disabled={!canEdit || engineeringObjectsLoading}
                onClick={() => onScopeDraftObjectChange(null)}
              >
                清空对象
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={!detailScopeDirty}
                  onClick={() => onScopeDraftObjectChange(primaryScopeObjectId)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={!canEdit || engineeringObjectsLoading || !detailScopeDirty}
                  onClick={() => void onSaveScopeObject()}
                >
                  保存对象
                </Button>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-0 text-xs text-blue-700 hover:bg-transparent"
            onClick={onOpenEngineeringObjects}
          >
            管理工程对象
          </Button>
        </div>
      )}
      renderResponsibility={() => (
        <div className="space-y-2 text-sm text-slate-700">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span className="text-slate-500">责任人</span>
            <span>{task?.assignee_name || task?.assignee || '未分配'}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span className="text-slate-500">责任单位</span>
            <span>{task?.participant_unit_name || '未分配'}</span>
          </div>
        </div>
      )}
      renderConditions={() => (
        <ConditionDrawerSection
          conditions={conditionRecords}
          canEdit={canEdit}
          onToggleSatisfied={(conditionId) => {
            const condition = conditions.find((item) => item.id === conditionId)
            if (condition) void onToggleCondition(condition)
          }}
          onAddCondition={() => {
            if (task) void onOpenConditionDialog(task)
          }}
          onDeleteCondition={onDeleteCondition}
          onLoadFromTemplate={() => {
            if (onOpenTemplateGenerate) {
              onOpenTemplateGenerate()
              return
            }
            if (projectId) navigate(`/projects/${projectId}/gantt`)
          }}
        />
      )}
      renderBlockages={() => (
        <BlockageDrawerSection
          blockages={blockages}
          canEdit={canEdit}
          onAddBlockage={onAddBlockage}
          onResolveBlockage={(obstacleId) => {
            const obstacle = obstacles.find((item) => item.id === obstacleId)
            if (obstacle) void onResolveObstacle(obstacle)
          }}
        />
      )}
      renderPredecessors={() => (
        <div className="space-y-2">
          {predecessors.length > 0 ? (
            predecessors.map((predecessor) => (
              <div key={predecessor.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{getTaskDisplayTitle(predecessor)}</div>
                  <div className="mt-1 text-xs text-slate-500">{predecessor.wbs_code || predecessor.id.slice(0, 8)}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => onSelectTask(predecessor.id, 'basic')}
                >
                  查看
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">暂无前置任务</p>
          )}
          <p className="text-xs leading-5 text-slate-500">前置任务关系在任务编辑表单中维护，保存时由后端统一推断依赖类型并检查循环依赖。</p>
        </div>
      )}
      renderAcceptance={() => (
        <div className="space-y-3">
          {acceptanceItems.length > 0 ? (
            acceptanceItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{item.name}</div>
                  <div className="mt-1 text-xs text-blue-700">{item.statusLabel || item.status || '状态未同步'}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 border-blue-200 bg-white text-xs text-blue-700"
                  onClick={() => {
                    if (!projectId) return
                    navigate(`/projects/${projectId}/acceptance?planId=${encodeURIComponent(item.id)}`)
                  }}
                >
                  跳转
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">该任务未关联验收计划</p>
          )}
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            新增验收并关联任务，请到
            <Button unstyled
              type="button"
              className="mx-1 font-medium text-blue-700 hover:text-blue-800"
              onClick={() => {
                if (!projectId) return
                navigate(`/projects/${projectId}/acceptance`)
              }}
            >
              验收管理
            </Button>
            页面。
          </div>
        </div>
      )}
      renderSource={() => (
        <div className="space-y-2 text-sm text-slate-700">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">标准工项</div>
            <div className="mt-1 font-medium text-slate-900">{task?.standard_work_name || '未绑定标准工项'}</div>
            {task?.standard_work_code ? (
              <div className="mt-1 text-xs num-mono text-slate-500">{task.standard_work_code}</div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-slate-500">WBS 类型</div>
              <div className="mt-1 text-slate-800">{getWbsNodeTypeLabel(getTaskWbsNodeType(task))}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-slate-500">工程分类</div>
              <div className="mt-1 text-slate-800">{task?.engineering_category_id || '未绑定'}</div>
            </div>
          </div>
        </div>
      )}
    />
  )
}
