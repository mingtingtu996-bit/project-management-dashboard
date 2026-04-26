import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { memo, useEffect, useState } from 'react'
import { safeStorageSet } from '@/lib/browserStorage'
import { GitBranch, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useSidebarOpen } from '@/hooks/useStore'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

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

export interface GanttStatsCardsProps {
  projectStats: ProjectStatsData
}

export const GanttStatsCards = memo(function GanttStatsCards({ projectStats }: GanttStatsCardsProps) {
  const cards = [
    { label: '总任务数', value: projectStats.totalTasks, tone: 'text-slate-900' },
    {
      label: '进行中',
      value: projectStats.inProgressTasks,
      tone: 'text-blue-600',
      helper: projectStats.inProgressTasks > 0 ? '持续推进' : '暂无',
    },
    {
      label: '已完成',
      value: projectStats.completedTasks,
      tone: 'text-emerald-600',
      helper: projectStats.totalTasks > 0 ? `${Math.round((projectStats.completedTasks / projectStats.totalTasks) * 100)}%` : '0%',
    },
    {
      label: '延期任务',
      value: projectStats.overdueTask,
      tone: projectStats.overdueTask > 0 ? 'text-red-600' : 'text-slate-400',
      helper: projectStats.overdueTask > 0 ? '需跟进' : '暂无',
    },
    {
      label: '滞后任务',
      value: projectStats.laggedTaskCount,
      tone: projectStats.laggedTaskCount > 0 ? 'text-amber-600' : 'text-slate-400',
      helper: projectStats.laggedTaskCount > 0 ? '需处理' : '暂无',
    },
    {
      label: '条件未满足',
      value: projectStats.pendingStartTasks,
      tone: projectStats.pendingStartTasks > 0 ? 'text-orange-600' : 'text-slate-400',
      helper: projectStats.readyToStartTasks > 0 ? `可开工 ${projectStats.readyToStartTasks}` : undefined,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label} variant="metric">
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <div className="flex items-end justify-between gap-3">
              <p className={`text-2xl font-semibold tracking-tight ${card.tone}`}>{card.value}</p>
              {card.helper && <span className="text-xs text-slate-500">{card.helper}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
})

GanttStatsCards.displayName = 'GanttStatsCards'

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
  const sidebarOpen = useSidebarOpen()
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
      className="fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300"
      style={{ transform: selectedCount > 0 ? 'translateY(0)' : 'translateY(100%)' }}
      aria-live="polite"
    >
      <div className={cn('mx-auto max-w-[1440px] px-4 pb-4 lg:px-6', sidebarOpen ? 'lg:pl-72' : 'lg:pl-20')}>
        <Card data-testid="batch-action-bar" className="border-slate-200/70 bg-slate-950 text-white shadow-2xl">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
                  <span className="text-sm font-medium">全选</span>
                  {selectedCount > 0 && <span className="text-sm text-slate-300">已选 {selectedCount} 项</span>}
                </label>
                {selectedCount > 0 ? (
                  <button
                    type="button"
                    aria-label="清空选择"
                    data-testid="batch-action-bar-clear"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                    onClick={onClearSelection}
                  >
                    <X className="h-3.5 w-3.5" />
                    清空选择
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void applyBatch()}
                  disabled={batchUpdating || selectedCount === 0 || !hasAnyBatchChange}
                  loading={batchUpdating}
                  data-testid="gantt-batch-apply"
                  className="gap-1.5 border-blue-300 bg-white text-slate-900 hover:bg-blue-50"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  批量应用
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
                  批量删除
                </Button>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-5">
              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">批量状态</div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-10 border-slate-700 bg-slate-900 text-white">
                    <SelectValue placeholder="不变" />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="todo">待开始</SelectItem>
                  <SelectItem value="in_progress">进行中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                </SelectContent>
              </Select>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">批量责任人</div>
                <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                  <SelectTrigger className="h-10 border-slate-700 bg-slate-900 text-white">
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
                    className="h-10 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                  />
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
                    {selectedMember?.displayName || '已选择成员'}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">批量单位</div>
                <Select value={participantUnitId} onValueChange={setParticipantUnitId}>
                  <SelectTrigger className="h-10 border-slate-700 bg-slate-900 text-white">
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
                    className="h-10 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                  />
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
                    {selectedUnit?.unit_name || '已选择单位'}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">日期平移</div>
                <Input
                  type="number"
                  value={dateShiftDays}
                  onChange={(event) => setDateShiftDays(event.target.value)}
                  placeholder="例如 3 或 -2"
                  className="h-10 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                />
                <div className="text-xs text-slate-400">按选中任务统一平移开始/结束日期</div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">操作说明</div>
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/70 px-3 py-2 text-xs leading-5 text-slate-300">
                  批量修改会提交到任务主写链，并按项目统一更新状态、责任人、单位和日期。
                </div>
              </div>
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
    'h-10 rounded-xl border-slate-200 bg-white text-sm shadow-sm transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100'

  return (
    <Card variant="surface">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <SlidersHorizontal className="h-4 w-4 text-blue-600" />
            筛选条件
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 px-2 text-slate-500">
            收起
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索任务名、责任人..."
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`${controlClass} w-full pl-10 pr-10`}
            />
            {searchText && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="清空搜索"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <select
            value={filterStatus}
            onChange={(e) => {
              onStatusChange(e.target.value)
              safeStorageSet(localStorage, `gantt_filter_status_${projectId}`, e.target.value)
            }}
            className={`${controlClass} px-3 ${filterStatus !== 'all' ? 'border-blue-300 text-blue-700' : 'text-slate-600'}`}
          >
            <option value="all">全部状态</option>
            <option value="todo">待办</option>
            <option value="in_progress">进行中</option>
            <option value="completed">已完成</option>
            <option value="lagging_mild">轻度滞后</option>
            <option value="lagging_moderate">中度滞后</option>
            <option value="lagging_severe">严重滞后</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) => {
              onPriorityChange(e.target.value)
              safeStorageSet(localStorage, `gantt_filter_priority_${projectId}`, e.target.value)
            }}
            className={`${controlClass} px-3 ${filterPriority !== 'all' ? 'border-blue-300 text-blue-700' : 'text-slate-600'}`}
          >
            <option value="all">全部优先级</option>
            <option value="high">高优先级</option>
            <option value="medium">中优先级</option>
            <option value="low">低优先级</option>
          </select>

          <select
            value={filterSpecialty}
            onChange={(e) => {
              onSpecialtyChange(e.target.value)
              safeStorageSet(localStorage, `gantt_filter_specialty_${projectId}`, e.target.value)
            }}
            className={`${controlClass} px-3 ${filterSpecialty !== 'all' ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-600'}`}
          >
            <option value="all">全部专项</option>
            {SPECIALTY_TYPES.map((specialty) => (
              <option key={specialty.value} value={specialty.value}>
                {specialty.label}
              </option>
            ))}
          </select>

          {buildingOptions.length > 1 && (
            <select
              value={filterBuilding}
              onChange={(e) => onBuildingChange(e.target.value)}
              className={`${controlClass} px-3 ${filterBuilding !== 'all' ? 'border-blue-300 text-blue-700' : 'text-slate-600'}`}
            >
              <option value="all">全部楼栋</option>
              {buildingOptions.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <button
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
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClearAll} className="h-10 px-3 text-slate-600">
              重置筛选
            </Button>
            <Button type="button" size="sm" onClick={onClose} className="h-10 px-4">
              应用筛选
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

GanttFilterBar.displayName = 'GanttFilterBar'
