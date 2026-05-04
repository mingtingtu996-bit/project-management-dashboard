import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MetricCard } from '@/components/ui/metric-card'
import { Separator } from '@/components/ui/separator'
import { memo, useEffect, useState } from 'react'
import { safeStorageSet } from '@/lib/browserStorage'
import { GitBranch, MoreHorizontal, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
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

import { SPECIALTY_TYPES } from './GanttViewTypes'

export interface ProjectStatsData {
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  overdueTask: number
  laggedTaskCount: number
  pendingStartTasks: number
  readyToStartTasks: number
  criticalPathSummary: string
}

export interface GanttMetricCardsProps {
  projectStats: ProjectStatsData
}

export const GanttMetricCards = memo(function GanttMetricCards({ projectStats }: GanttMetricCardsProps) {
  const exceptionCount = projectStats.overdueTask + projectStats.laggedTaskCount + projectStats.pendingStartTasks
  const cards = [
    { eyebrow: 'TASKS', label: '总任务数', value: projectStats.totalTasks, tone: 'slate' as const, helper: '全部' },
    {
      eyebrow: 'ACTIVE',
      label: '进行中',
      value: projectStats.inProgressTasks,
      tone: 'primary' as const,
      helper: projectStats.inProgressTasks > 0 ? '持续推进' : '暂无',
    },
    {
      eyebrow: 'DONE',
      label: '已完成',
      value: projectStats.completedTasks,
      tone: 'success' as const,
      helper: projectStats.totalTasks > 0 ? `${Math.round((projectStats.completedTasks / projectStats.totalTasks) * 100)}%` : '0%',
    },
    {
      eyebrow: 'RISK',
      label: '异常',
      value: exceptionCount,
      tone: exceptionCount > 0 ? 'warning' as const : 'slate' as const,
      helper: exceptionCount > 0 ? `逾期 ${projectStats.overdueTask} / 进度落后 ${projectStats.laggedTaskCount}` : '暂无',
      tooltip: `逾期：已超过计划完成日期。异常（进度落后）：进度落后但未超期的任务。条件未满足：${projectStats.pendingStartTasks} 项。`,
    },
  ]

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <MetricCard
          key={card.label}
          eyebrow={card.eyebrow}
          title={card.label}
          value={card.value}
          hint={'tooltip' in card && card.tooltip ? `${card.helper} · ${card.tooltip}` : card.helper}
          tone={card.tone}
        />
      ))}
    </div>
  )
})

GanttMetricCards.displayName = 'GanttMetricCards'

export interface GanttBatchBarProps {
  allSelected: boolean
  someSelected: boolean
  selectedCount: number
  batchUpdating?: boolean
  projectMembers: Array<{ userId: string; displayName: string }>
  participantUnits: Array<{ id: string; unit_name: string; unit_type?: string | null }>
  onToggleSelectAll: () => void
  onClearSelection: () => void
  onApplyBatchUpdate: (payload: {
    status?: string | null
    assignee_name?: string | null
    assignee_user_id?: string | null
    participant_unit_id?: string | null
    responsible_unit?: string | null
    dateShiftDays?: number | null
  }) => void | Promise<void>
  onBatchDelete: () => void
}

export const GanttBatchBar = memo(function GanttBatchBar({
  allSelected,
  someSelected,
  selectedCount,
  batchUpdating = false,
  projectMembers,
  participantUnits,
  onToggleSelectAll,
  onClearSelection,
  onApplyBatchUpdate,
  onBatchDelete,
}: GanttBatchBarProps) {
  const [status, setStatus] = useState('')
  const [assigneeUserId, setAssigneeUserId] = useState('__manual__')
  const [assigneeName, setAssigneeName] = useState('')
  const [participantUnitId, setParticipantUnitId] = useState('__manual__')
  const [responsibleUnit, setResponsibleUnit] = useState('')
  const [dateShiftDays, setDateShiftDays] = useState('')

  const selectedMember = projectMembers.find((member) => member.userId === assigneeUserId) ?? null
  const selectedUnit = participantUnits.find((unit) => unit.id === participantUnitId) ?? null
  const hasAnyBatchChange =
    Boolean(status) ||
    Boolean(assigneeName.trim()) ||
    assigneeUserId !== '__manual__' ||
    Boolean(responsibleUnit.trim()) ||
    participantUnitId !== '__manual__' ||
    Boolean(dateShiftDays.trim())

  useEffect(() => {
    if (selectedCount === 0) {
      setStatus('')
      setAssigneeUserId('__manual__')
      setAssigneeName('')
      setParticipantUnitId('__manual__')
      setResponsibleUnit('')
      setDateShiftDays('')
    }
  }, [selectedCount])

  if (selectedCount === 0) {
    return null
  }

  const applyBatch = async () => {
    const payload: {
      status?: string | null
      assignee_name?: string | null
      assignee_user_id?: string | null
      participant_unit_id?: string | null
      responsible_unit?: string | null
      dateShiftDays?: number | null
    } = {}

    if (status) payload.status = status
    if (assigneeUserId !== '__manual__') {
      payload.assignee_user_id = assigneeUserId
      payload.assignee_name = selectedMember?.displayName ?? null
    } else if (assigneeName.trim()) {
      payload.assignee_user_id = null
      payload.assignee_name = assigneeName.trim()
    }

    if (participantUnitId !== '__manual__') {
      payload.participant_unit_id = participantUnitId
      payload.responsible_unit = selectedUnit?.unit_name ?? null
    } else if (responsibleUnit.trim()) {
      payload.participant_unit_id = null
      payload.responsible_unit = responsibleUnit.trim()
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
      <div className="mx-4">
        <Card data-testid="batch-action-bar" className="border-slate-200/70 bg-white shadow-[var(--el-3)]">
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
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-32 border-slate-200 bg-white text-slate-700">
                  <SelectValue placeholder="状态不变" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">待开始</SelectItem>
                  <SelectItem value="in_progress">进行中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                </SelectContent>
              </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void applyBatch()}
                  disabled={batchUpdating || selectedCount === 0 || !status}
                  loading={batchUpdating}
                  data-testid="gantt-batch-apply"
                  className="gap-1.5 border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  状态变更
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onBatchDelete}
                  disabled={batchUpdating || selectedCount === 0}
                  data-testid="gantt-batch-delete"
                  className="gap-1.5 border-red-300 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-slate-600" data-testid="gantt-batch-more">
                    <MoreHorizontal className="h-4 w-4" />
                    更多操作
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-96 space-y-3 rounded-2xl border-slate-200 p-4 shadow-[var(--el-3)]">
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
                        <SelectValue placeholder="手工输入" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">手工输入</SelectItem>
                        {participantUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.unit_type ? `${unit.unit_name} · ${unit.unit_type}` : unit.unit_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {participantUnitId === '__manual__' ? (
                      <Input
                        value={responsibleUnit}
                        onChange={(event) => setResponsibleUnit(event.target.value)}
                        placeholder="输入责任单位或部门"
                        className="h-10"
                      />
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        {selectedUnit?.unit_name || '已选择单位'}
                      </div>
                    )}
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
                    disabled={batchUpdating || selectedCount === 0 || !hasAnyBatchChange}
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
}: GanttFilterBarProps) {
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
              {SPECIALTY_TYPES.map((specialty) => (
                <SelectItem key={specialty.value} value={specialty.value}>
                  {specialty.label}
                </SelectItem>
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
