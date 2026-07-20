import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gauge,
  GitBranch,
  PackageMinus,
  Rocket,
  ShieldCheck,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConstructionOrganizationScenarioSummary } from '@/components/planning/ConstructionOrganizationScenarioSummary'
import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDurationMetric, readAvailableDurationValue } from '@/lib/durationMetric'
import type { WbsAccelerationProposal, WbsAccelerationProposalAction, WbsTargetFeasibility } from '@/services/wbsTemplateGenerationApi'
import type { Task } from '../GanttViewTypes'

type Props = {
  targetFeasibility: WbsTargetFeasibility
  tasks: Task[]
  onFocusTask?: (taskId: string) => void
  onAcceptRescheduleDraft?: (proposal: WbsAccelerationProposal) => Promise<void> | void
  acceptingRescheduleDraft?: boolean
  onDismiss?: () => void
}

function actionLabel(action: WbsAccelerationProposalAction) {
  if (action.type === 'fast_track') return '提前穿插'
  if (action.type === 'crashing') return '增加资源'
  return '交付决策'
}

function actionIcon(action: WbsAccelerationProposalAction) {
  if (action.type === 'fast_track') return GitBranch
  if (action.type === 'crashing') return Rocket
  return PackageMinus
}

function riskLabel(riskLevel: string) {
  if (riskLevel === 'low') return '风险较低'
  if (riskLevel === 'medium') return '需要协调'
  if (riskLevel === 'high') return '负责人决策'
  return riskLevel
}

function getTaskTitle(taskById: Map<string, Task>, taskId: string) {
  const task = taskById.get(taskId)
  return task?.title || taskId
}

function describeProjectProfile(profile?: string) {
  if (!profile) return null
  if (profile.includes('hospital') || profile.includes('cleanroom')) return '医院/洁净类项目按更保守的赶工比例估算。'
  if (profile.includes('data_center')) return '数据中心类项目按设备联调和系统验证约束保守估算。'
  if (profile.includes('prefabricated') || profile.includes('modular')) return '装配式/模块化项目受吊装、运输和构件供应节拍限制，赶工空间已收紧。'
  return null
}

function buildBusinessBasis(proposal: WbsAccelerationProposal) {
  const basis = proposal.calculationBasis
  if (!basis) return []
  const notes: string[] = []
  notes.push(`当前预测自然排期约 ${formatDurationMetric(basis.naturalDuration)}，系统没有把所有任务工期简单相加。`)
  if (basis.resourceGroupedCandidateDays > 0) {
    notes.push('同一类关键资源只按代表性施工面估算，避免塔吊、泵车或班组被重复计算。')
  }
  if (basis.hardConstraintDays > 0) {
    notes.push(`约 ${formatDurationMetric(basis.hardConstraintDuration)}受硬约束保护，不能被压缩。`)
  }
  if (basis.seasonalFactor < 1) {
    notes.push('项目跨冬季、雨季或节假日窗口，可追回时间已按季节影响打折。')
  }
  const profileNote = describeProjectProfile(basis.projectTypeProfile)
  if (profileNote) notes.push(profileNote)
  if (basis.scenario === 'runtime_delay_recovery' && basis.runtimeContext) {
    if ((basis.runtimeContext.resourcePressureScore ?? 0) > 0) {
      notes.push(`已结合当前现场产能压力评分 ${basis.runtimeContext.resourcePressureScore}，不会按模板阶段直接乐观压缩。`)
    }
    if ((basis.runtimeContext.hardBlockerCount ?? 0) > 0 || (basis.runtimeContext.blockedTaskCount ?? 0) > 0) {
      notes.push('当前存在阻塞任务，系统已下调可追回时间，避免把未解除障碍的任务计入赶工承诺。')
    }
    if ((basis.runtimeContext.criticalOrNearCriticalTaskCount ?? 0) > 0) {
      notes.push(`当前识别到 ${basis.runtimeContext.criticalOrNearCriticalTaskCount} 个关键或近关键任务，资源赶工优先围绕这些任务形成草案。`)
    }
  }
  return notes
}

export function TargetAccelerationReviewPanel({
  targetFeasibility,
  tasks,
  onFocusTask,
  onAcceptRescheduleDraft,
  acceptingRescheduleDraft = false,
  onDismiss,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const proposal = targetFeasibility.accelerationProposal ?? null
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const overshootValue = readAvailableDurationValue(targetFeasibility.overshoot, 'calendar_day')
  if (!proposal) return null
  if (overshootValue === null) {
    return (
      <Alert className="border-amber-200 bg-amber-50 text-amber-900">
        <AlertDescription className="text-sm">
          目标竣工为 {targetFeasibility.targetEndDate}，自然排期为 {targetFeasibility.naturalEndDate}；日历天口径不可用，当前不展示未经验证的超期天数。
        </AlertDescription>
      </Alert>
    )
  }
  if (overshootValue <= 0) return null

  const rescheduleDraft = proposal.rescheduleDraft ?? null
  const canAcceptDraft = Boolean(onAcceptRescheduleDraft && rescheduleDraft && rescheduleDraft.operations.length > 0)
  const fastTrack = proposal.actions.find((action) => action.type === 'fast_track')
  const crashing = proposal.actions.find((action) => action.type === 'crashing')
  const scope = proposal.actions.find((action) => action.type === 'scope_reduction')
  const basisNotes = buildBusinessBasis(proposal)
  const isRuntimeRecovery = targetFeasibility.scenario === 'runtime_delay_recovery'
  const panelTitle = isRuntimeRecovery ? '当前进度存在按期风险' : '目标工期偏紧'
  const ctaLabel = isRuntimeRecovery ? '查看赶工建议' : '查看工期压缩预案'
  const collapseLabel = isRuntimeRecovery ? '收起建议' : '收起预案'
  const leadText = isRuntimeRecovery
    ? `当前计划按现场进度预计 ${targetFeasibility.naturalEndDate} 完成，目标竣工为 ${targetFeasibility.targetEndDate}。系统没有直接改任务日期，下面先给出可审阅的赶工建议。`
    : `模板按正常施工组织预计 ${targetFeasibility.naturalEndDate} 完工，目标竣工为 ${targetFeasibility.targetEndDate}。系统没有直接改任务日期，下面先给出可审阅的工期压缩预案。`

  return (
    <section data-testid="target-acceleration-review-panel" className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-950">{panelTitle}</h3>
            <DurationBasisBadge basis="forecast" compact variant="outline" className="border-amber-200 bg-white text-amber-800" />
            <Badge variant="outline" className="border-amber-200 bg-white text-amber-800">
              晚于目标 {formatDurationMetric(targetFeasibility.overshoot, { absolute: true })}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-slate-700">
            {leadText}
          </p>
          <div className="flex flex-wrap gap-2 text-xs tabular-nums">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              预计可追回 {formatDurationMetric(proposal.totalRecover, { absolute: true })}
            </Badge>
            {(readAvailableDurationValue(proposal.remainingGap, 'construction_production_day') ?? 0) > 0 ? (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                仍需决策 {formatDurationMetric(proposal.remainingGap, { absolute: true })}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                草案可覆盖当前差距
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-amber-300 bg-white text-xs text-amber-800 hover:bg-amber-100"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? collapseLabel : ctaLabel}
          </Button>
          {onDismiss ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-slate-500" onClick={onDismiss}>
              暂不处理
            </Button>
          ) : null}
          {onAcceptRescheduleDraft ? (
            <Button
              type="button"
              size="sm"
              className="h-8 bg-blue-600 text-xs text-white hover:bg-blue-700"
              disabled={!canAcceptDraft || acceptingRescheduleDraft}
              onClick={() => void onAcceptRescheduleDraft(proposal)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {acceptingRescheduleDraft ? '提交中' : '采纳重排草案'}
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-3">
          {basisNotes.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                系统如何判断可追回时间
              </div>
              <div className="grid gap-1.5 text-xs leading-5 text-slate-600">
                {basisNotes.map((note) => (
                  <div key={note} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <ConstructionOrganizationScenarioSummary
            scenario={proposal.calculationBasis?.constructionOrganizationScenario}
            activeUseCase="accelerationRecovery"
          />

          <div className="grid gap-3 lg:grid-cols-3">
            {proposal.actions.map((action) => {
              const Icon = actionIcon(action)
              return (
                <div key={action.type} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Icon className="h-4 w-4 text-blue-600" />
                      {actionLabel(action)}
                    </div>
                    <Badge variant="outline" className="bg-slate-50 text-slate-600">
                      {riskLabel(action.riskLevel)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {action.type === 'fast_track'
                      ? `调整前后关系与穿插安排，预计可追回 ${formatDurationMetric(action.recoverDuration)}。`
                      : action.type === 'crashing'
                        ? `通过增加资源投入、设备或施工面，预计可追回 ${formatDurationMetric(action.recoverDuration)}。`
                        : `穿插和资源调整后仍不足的时间，需要决定分批交付、减少范围或调整目标。`}
                  </p>
                </div>
              )
            })}
          </div>

          {fastTrack?.type === 'fast_track' && fastTrack.dependencyAdjustments.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <GitBranch className="h-4 w-4 text-blue-600" />
                建议提前穿插的任务
              </div>
              <div className="grid gap-2">
                {fastTrack.dependencyAdjustments.slice(0, 6).map((adjustment) => (
                  <Button unstyled
                    key={`${adjustment.predecessorClientRowId}-${adjustment.successorClientRowId}`}
                    type="button"
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                    onClick={() => onFocusTask?.(adjustment.successorClientRowId)}
                  >
                    <span className="font-medium text-slate-800">{getTaskTitle(taskById, adjustment.predecessorClientRowId)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-medium text-slate-800">{getTaskTitle(taskById, adjustment.successorClientRowId)}</span>
                    <span className="ml-auto text-blue-700">调整为提前穿插关系</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {crashing?.type === 'crashing' && crashing.durationAdjustments.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Gauge className="h-4 w-4 text-blue-600" />
                建议增加资源的任务
              </div>
              <div className="grid gap-2">
                {crashing.durationAdjustments.slice(0, 6).map((adjustment) => (
                  <Button unstyled
                    key={adjustment.clientRowId}
                    type="button"
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                    onClick={() => onFocusTask?.(adjustment.clientRowId)}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{getTaskTitle(taskById, adjustment.clientRowId)}</span>
                    <span className="tabular-nums text-slate-500">{formatDurationMetric(adjustment.currentDuration)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    <span className="tabular-nums text-blue-700">{formatDurationMetric(adjustment.proposedDuration)}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {scope?.type === 'scope_reduction' ? (
            <Alert className="border-rose-200 bg-rose-50 text-rose-900">
              <AlertDescription className="text-sm">
                仍有 {formatDurationMetric(scope.recoverDuration)}差距，建议由项目负责人确认是否分批交付、增加施工面、减少低优先级专项或调整目标竣工日期。
              </AlertDescription>
            </Alert>
          ) : null}

          {rescheduleDraft ? (
            <div className="rounded-xl border border-blue-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                重排差异预览
              </div>
              <div className="grid gap-2">
                {rescheduleDraft.taskDateAdjustments.slice(0, 6).map((adjustment) => (
                  <Button unstyled
                    key={adjustment.clientRowId}
                    type="button"
                    className="grid gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                    onClick={() => onFocusTask?.(adjustment.clientRowId)}
                  >
                    <span className="min-w-0 truncate font-medium text-slate-800">
                      {adjustment.title || getTaskTitle(taskById, adjustment.clientRowId)}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 tabular-nums">
                      <span>{adjustment.currentStartDate || '-'} → {adjustment.currentEndDate || '-'}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-blue-700">{adjustment.proposedStartDate || '-'} → {adjustment.proposedEndDate || '-'}</span>
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                        {formatDurationMetric(adjustment.currentDuration)}改为 {formatDurationMetric(adjustment.proposedDuration)}
                      </Badge>
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        追回 {formatDurationMetric(adjustment.recoverDuration)}
                      </Badge>
                    </span>
                  </Button>
                ))}
              </div>
              {rescheduleDraft.dependencyAdjustments.length > 0 ? (
                <div className="mt-3 grid gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  {rescheduleDraft.dependencyAdjustments.slice(0, 4).map((adjustment) => (
                    <div key={`${adjustment.predecessorClientRowId}-${adjustment.successorClientRowId}`} className="flex flex-wrap items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5 text-blue-600" />
                      <span className="font-medium text-slate-800">{getTaskTitle(taskById, adjustment.predecessorClientRowId)}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium text-slate-800">{getTaskTitle(taskById, adjustment.successorClientRowId)}</span>
                      <span className="tabular-nums text-blue-700">
                        {adjustment.fromDependencyType} 改为 {adjustment.toDependencyType}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {proposal.commitmentDisclaimer ? (
            <Alert className="border-amber-200 bg-amber-50 text-amber-950">
              <AlertDescription className="text-sm">
                {proposal.commitmentDisclaimer}
              </AlertDescription>
            </Alert>
          ) : null}

          {proposal.protectedConstraints.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                这些时间不建议压缩
              </div>
              <div className="flex flex-wrap gap-2">
                {proposal.protectedConstraints.slice(0, 8).map((constraint) => (
                  <Badge key={`${constraint.clientRowId}-${constraint.reasonCode}`} variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {constraint.title} / {formatDurationMetric(constraint.duration)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export function getAccelerationAffectedTaskIds(targetFeasibility: WbsTargetFeasibility | null | undefined) {
  const proposal = targetFeasibility?.accelerationProposal
  if (!proposal) return new Set<string>()
  return new Set(proposal.actions.flatMap((action) => action.affectedRowIds))
}

export function getAccelerationTaskClassName(taskId: string, targetFeasibility: WbsTargetFeasibility | null | undefined) {
  return getAccelerationAffectedTaskIds(targetFeasibility).has(taskId)
    ? 'ring-1 ring-inset ring-amber-200 bg-amber-50/30'
    : ''
}

export function accelerationTaskBadge(taskId: string, targetFeasibility: WbsTargetFeasibility | null | undefined) {
  const proposal = targetFeasibility?.accelerationProposal
  if (!proposal) return null
  const action = proposal.actions.find((item) => item.affectedRowIds.includes(taskId))
  if (!action) return null
  return (
    <Badge variant="outline" className={cn('h-5 px-1.5 text-xs', action.type === 'scope_reduction' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>
      {actionLabel(action)}
    </Badge>
  )
}
