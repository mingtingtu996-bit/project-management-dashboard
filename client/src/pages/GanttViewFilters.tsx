import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MetricCard, type MetricAvailability } from '@/components/ui/metric-card'
import { Separator } from '@/components/ui/separator'
import { memo, type ReactNode, useEffect, useState } from 'react'
import { safeStorageSet } from '@/lib/browserStorage'
import { Activity, AlertTriangle, Gauge, GitBranch, ListTree, MoreHorizontal, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { getConstructionEfficiencyMetric } from '@/lib/constructionEfficiency'
import type { ProjectSummary } from '@/services/dashboardApi'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'


export interface TaskListMetricCardsProps {
  summary: ProjectSummary | null
  summaryPending?: boolean
}

function metricCount(value: unknown): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

type TaskListMetricCardModel = {
  eyebrow: string
  label: string
  value: number | null
  unit?: string
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'slate'
  helper: string
  trend?: ReactNode
  icon: ReactNode
  availability?: MetricAvailability
  sparkline?: number[]
}

export const TaskListMetricCards = memo(function TaskListMetricCards({ summary, summaryPending = false }: TaskListMetricCardsProps) {
  const totalTasks = metricCount(summary?.totalTasks)
  const leafTaskCount = metricCount(summary?.leafTaskCount ?? summary?.totalTasks)
  const inProgressTaskCount = metricCount(summary?.inProgressTaskCount)
  const pendingConditionTaskCount = metricCount(summary?.pendingConditionTaskCount)
  const activeObstacleTaskCount = metricCount(summary?.activeObstacleTaskCount)
  const blockedTaskCount = activeObstacleTaskCount + pendingConditionTaskCount
  const activePercent = leafTaskCount > 0 ? Math.round((inProgressTaskCount / leafTaskCount) * 100) : 0
  const metricAvailability = summaryPending ? 'data_pending' as const : 'ready' as const
  const productivityDistribution = summary?.monthlyProductivityDistribution
  const constructionEfficiency = getConstructionEfficiencyMetric(
    summary?.monthlyProductivityDistribution?.monthlyAverageP,
    productivityDistribution,
  )
  const pendingHelper = '摘要加载中'
  const cards: TaskListMetricCardModel[] = [
    {
      eyebrow: 'TASKS',
      label: '任务总数',
      value: summaryPending ? null : totalTasks,
      tone: 'slate' as const,
      helper: summaryPending ? pendingHelper : `叶子 ${leafTaskCount}`,
      trend: '待积累 较上周',
      icon: <ListTree className="h-4 w-4" />,
    },
    {
      eyebrow: 'ACTIVE',
      label: '进行中',
      value: summaryPending ? null : inProgressTaskCount,
      tone: 'primary' as const,
      helper: summaryPending ? pendingHelper : `占比 ${activePercent}%`,
      trend: '待积累 较上周',
      icon: <Activity className="h-4 w-4" />,
    },
    {
      eyebrow: 'EFFICIENCY',
      label: '施工效率',
      value: summaryPending ? null : constructionEfficiency.value,
      unit: constructionEfficiency.unit,
      tone: constructionEfficiency.tone,
      helper: summaryPending ? pendingHelper : '月度综合 P',
      trend: constructionEfficiency.hint,
      icon: <Gauge className="h-4 w-4" />,
      availability: summaryPending ? 'data_pending' as const : constructionEfficiency.availability,
      sparkline: constructionEfficiency.sparkline,
    },
    {
      eyebrow: 'BLOCKED',
      label: '阻碍',
      value: summaryPending ? null : blockedTaskCount,
      tone: blockedTaskCount > 0 ? 'danger' as const : 'slate' as const,
      helper: summaryPending ? pendingHelper : `阻碍任务 ${activeObstacleTaskCount} / 条件未满足 ${pendingConditionTaskCount}`,
      trend: '待积累 较上周',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  ]

  return (
    <>
      {cards.map((card) => (
        <MetricCard
          key={card.label}
          eyebrow={card.eyebrow}
          title={card.label}
          value={card.value}
          unit={card.unit}
          hint={card.helper}
          trend={summaryPending ? undefined : card.trend}
          icon={card.icon}
          tone={card.tone}
          availability={card.availability ?? metricAvailability}
          sparkline={card.sparkline}
          density="compact"
          animateValue={false}
        />
      ))}
    </>
  )
})

TaskListMetricCards.displayName = 'TaskListMetricCards'

export interface GanttBatchBarProps {
  allSelected: boolean
  someSelected: boolean
  selectedCount: number
  batchUpdating?: boolean
  canBatchEdit?: boolean
  projectMembers: Array<{ userId: string; displayName: string }>
  participantUnits: Array<{ id: string; unit_name: string; unit_type?: string | null }>
  onToggleSelectAll: () => void
  onClearSelection: () => void
  onApplyBatchUpdate: (payload: {
    status?: string | null
    assignee_name?: string | null
    assignee_user_id?: string | null
    participant_unit_id?: string | null
    progress?: number | null
    dateShiftDays?: number | null
  }) => void | Promise<void>
  onApplyCurrentScope?: () => void
  canApplyCurrentScope?: boolean
  onBatchDelete: () => void
}

export const GanttBatchBar = memo(function GanttBatchBar({
  allSelected,
  someSelected,
  selectedCount,
  batchUpdating = false,
  canBatchEdit = true,
  projectMembers,
  participantUnits,
  onToggleSelectAll,
  onClearSelection,
  onApplyBatchUpdate,
  onApplyCurrentScope,
  canApplyCurrentScope,
  onBatchDelete,
}: GanttBatchBarProps) {
  const [assigneeUserId, setAssigneeUserId] = useState('__manual__')
  const [assigneeName, setAssigneeName] = useState('')
  const [participantUnitId, setParticipantUnitId] = useState('__none__')
  const [targetProgress, setTargetProgress] = useState('')
  const [dateShiftDays, setDateShiftDays] = useState('')

  const selectedMember = projectMembers.find((member) => member.userId === assigneeUserId) ?? null
  const selectedUnit = participantUnits.find((unit) => unit.id === participantUnitId) ?? null
  const hasAnyBatchChange =
    Boolean(assigneeName.trim()) ||
    assigneeUserId !== '__manual__' ||
    participantUnitId !== '__none__' ||
    Boolean(targetProgress.trim()) ||
    Boolean(dateShiftDays.trim())

  useEffect(() => {
    if (selectedCount === 0) {
      setAssigneeUserId('__manual__')
      setAssigneeName('')
      setParticipantUnitId('__none__')
      setTargetProgress('')
      setDateShiftDays('')
    }
  }, [selectedCount])

  if (selectedCount === 0) {
    return null
  }

  const applyBatch = async () => {
    if (!canBatchEdit) return

    const payload: {
      status?: string | null
      assignee_name?: string | null
      assignee_user_id?: string | null
      participant_unit_id?: string | null
      progress?: number | null
      dateShiftDays?: number | null
    } = {}

    if (assigneeUserId !== '__manual__') {
      payload.assignee_user_id = assigneeUserId
      payload.assignee_name = selectedMember?.displayName ?? null
    } else if (assigneeName.trim()) {
      payload.assignee_user_id = null
      payload.assignee_name = assigneeName.trim()
    }

    if (participantUnitId !== '__none__') {
      payload.participant_unit_id = participantUnitId
    }

    if (targetProgress.trim()) {
      const parsedProgress = Number(targetProgress)
      if (Number.isFinite(parsedProgress)) {
        payload.progress = Math.max(0, Math.min(100, Math.round(parsedProgress)))
      }
    }

    if (dateShiftDays.trim()) {
      const parsedShift = Number(dateShiftDays)
      if (Number.isFinite(parsedShift) && parsedShift !== 0) {
        payload.dateShiftDays = parsedShift
      }
    }

    await onApplyBatchUpdate(payload)
  }

  return (
    <div
      data-testid="gantt-batch-action-bar"
      className="fixed bottom-4 left-1/2 z-40 w-full max-w-[var(--content-max-width)] -translate-x-1/2 transition-transform duration-300"
      style={{ transform: selectedCount > 0 ? 'translateY(0)' : 'translateY(100%)' }}
      aria-live="polite"
    >
      <div className="px-4 lg:px-0">
        <Card data-testid="batch-action-bar" className="border-slate-200/70 bg-white shadow-[var(--el-2)]">
          <CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-3 select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = someSelected && !allSelected
                      }
                    }}
                    onChange={onToggleSelectAll}
                  />
                <span className="text-sm font-medium text-slate-700">已选 {selectedCount} 项</span>
              </label>
              <Button
                variant="ghost"
                type="button"
                aria-label="清空选择"
                data-testid="batch-action-bar-clear"
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                onClick={onClearSelection}
              >
                <X className="h-3.5 w-3.5" />
                清除
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onApplyCurrentScope}
                  disabled={batchUpdating || !canBatchEdit || selectedCount === 0 || !canApplyCurrentScope}
                  data-testid="gantt-batch-apply-scope"
                  className="gap-1.5 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                >
                  应用当前作用域
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onBatchDelete}
                  disabled={batchUpdating || !canBatchEdit || selectedCount === 0}
                  data-testid="gantt-batch-delete"
                  className="gap-1.5 border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-slate-600"
                    data-testid="gantt-batch-more"
                    disabled={batchUpdating || !canBatchEdit}
                    title={canBatchEdit ? '批量改字段' : '请先点击编辑表格'}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    更多操作
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-96 space-y-3 rounded-2xl border-slate-200 p-4 shadow-[var(--el-2)]">
                  <DropdownMenuLabel className="px-0 py-0 text-sm text-slate-900">批量责任与日期</DropdownMenuLabel>
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">责任人</div>
                    <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                      <SelectTrigger className="h-10 border-slate-200 bg-white text-slate-700">
                        <SelectValue placeholder="手工输入" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">手工输入</SelectItem>
                        {projectMembers.map((member) => (
                          <SelectItem key={member.userId} value={member.userId}>
                            {member.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {assigneeUserId === '__manual__' ? (
                      <Input
                        value={assigneeName}
                        onChange={(event) => setAssigneeName(event.target.value)}
                        placeholder="输入责任人姓名"
                        className="h-10"
                      />
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        {selectedMember?.displayName || '已选择成员'}
                      </div>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">责任单位</div>
                    <Select value={participantUnitId} onValueChange={setParticipantUnitId}>
                      <SelectTrigger className="h-10 border-slate-200 bg-white text-slate-700">
                        <SelectValue placeholder="选择参建单位" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">不更新责任单位</SelectItem>
                        {participantUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.unit_type ? `${unit.unit_name} · ${unit.unit_type}` : unit.unit_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {participantUnitId !== '__none__' ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        {participantUnits.find(u => u.id === participantUnitId)?.unit_name || '已选择单位'}
                      </div>
                    ) : null}
                  </div>
                  <DropdownMenuSeparator />
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">目标进度</div>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={targetProgress}
                      onChange={(event) => setTargetProgress(event.target.value)}
                      placeholder="0-100"
                      className="h-10"
                      data-testid="gantt-bulk-progress-input"
                    />
                    <div className="text-xs text-slate-500">按选中任务统一更新进度百分比</div>
                  </div>
                  <DropdownMenuSeparator />
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">日期平移</div>
                    <Input
                      type="number"
                      value={dateShiftDays}
                      onChange={(event) => setDateShiftDays(event.target.value)}
                      placeholder="例如 3 或 -2"
                      className="h-10"
                    />
                    <div className="text-xs text-slate-500">按选中任务统一平移开始/结束日期</div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void applyBatch()}
                    disabled={batchUpdating || !canBatchEdit || selectedCount === 0 || !hasAnyBatchChange}
                    loading={batchUpdating}
                    className="w-full"
                  >
                    应用更多操作
                  </Button>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
})

GanttBatchBar.displayName = 'GanttBatchBar'

export interface BuildingOption {
  id: string
  label: string
}

export interface GanttFilterBarProps {
  searchText: string
  filterStatus: string
  filterPriority?: string
  filterCritical: boolean
  filterSpecialty: string
  filterBuilding: string
  buildingOptions: BuildingOption[]
  projectId: string | undefined
  onSearchChange: (v: string) => void
  onStatusChange: (v: string) => void
  onPriorityChange?: (v: string) => void
  onCriticalToggle: () => void
  onSpecialtyChange: (v: string) => void
  onBuildingChange: (v: string) => void
  onClearAll: () => void
  onClose: () => void
}

export const GanttFilterBar = memo(function GanttFilterBar({
  searchText,
  filterStatus,
  filterPriority = 'all',
  filterCritical,
  filterSpecialty,
  filterBuilding,
  buildingOptions,
  projectId,
  onSearchChange,
  onStatusChange,
  onPriorityChange = () => {},
  onCriticalToggle,
  onSpecialtyChange,
  onBuildingChange,
  onClearAll,
  onClose,
  specialtyOptions,
}: GanttFilterBarProps & { specialtyOptions?: string[] }) {
  const controlClass =
    'h-10 rounded-xl border-slate-100 bg-white text-sm shadow-[var(--el-1)] transition-colors focus-visible:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-100'

  return (
    <Card variant="surface">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <SlidersHorizontal className="h-4 w-4 text-blue-600" />
            筛选条件
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 px-2 text-slate-500">
            收起
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              aria-label="搜索任务名或责任人"
              placeholder="搜索任务名、责任人..."
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`${controlClass} w-full pl-10 pr-10`}
            />
            {searchText && (
              <Button variant="ghost"
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="清空搜索"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <Select
            value={filterStatus}
            onValueChange={(value) => {
              onStatusChange(value)
              safeStorageSet(localStorage, `gantt_filter_status_${projectId}`, value)
            }}
          >
            <SelectTrigger className={`${controlClass} px-3 ${filterStatus !== 'all' ? 'border-blue-300 text-blue-700' : 'text-slate-600'}`}>
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="todo">待办</SelectItem>
              <SelectItem value="in_progress">进行中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="lagging_mild">轻度异常（进度落后）</SelectItem>
              <SelectItem value="lagging_moderate">中度异常（进度落后）</SelectItem>
              <SelectItem value="lagging_severe">严重异常（进度落后）</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filterPriority}
            onValueChange={(value) => {
              onPriorityChange(value)
              safeStorageSet(localStorage, `gantt_filter_priority_${projectId}`, value)
            }}
          >
            <SelectTrigger className={`${controlClass} px-3 ${filterPriority !== 'all' ? 'border-blue-300 text-blue-700' : 'text-slate-600'}`}>
              <SelectValue placeholder="全部优先级" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部优先级</SelectItem>
              <SelectItem value="high">高优先级</SelectItem>
              <SelectItem value="medium">中优先级</SelectItem>
              <SelectItem value="low">低优先级</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filterSpecialty}
            onValueChange={(value) => {
              onSpecialtyChange(value)
              safeStorageSet(localStorage, `gantt_filter_specialty_${projectId}`, value)
            }}
          >
            <SelectTrigger className={`${controlClass} px-3 ${filterSpecialty !== 'all' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
              <SelectValue placeholder="全部专项" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部专项</SelectItem>
              {(specialtyOptions as string[])?.map((s: string) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {buildingOptions.length > 1 && (
            <Select
              value={filterBuilding}
              onValueChange={onBuildingChange}
            >
              <SelectTrigger className={`${controlClass} px-3 ${filterBuilding !== 'all' ? 'border-blue-300 text-blue-700' : 'text-slate-600'}`}>
                <SelectValue placeholder="全部楼栋" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部楼栋</SelectItem>
                {buildingOptions.map((building) => (
                  <SelectItem key={building.id} value={building.id}>
                    {building.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost"
            type="button"
            onClick={onCriticalToggle}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
              filterCritical
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <GitBranch className="h-4 w-4" />
            仅关键路径
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClearAll} className="h-10 px-3 text-slate-600">
              重置筛选
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

GanttFilterBar.displayName = 'GanttFilterBar'
