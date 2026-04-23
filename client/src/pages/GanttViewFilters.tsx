import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { memo } from 'react'
import { safeStorageSet } from '@/lib/browserStorage'
import { GitBranch, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'

import { SPECIALTY_TYPES } from './GanttViewTypes'

export interface ProjectStatsData {
  totalTasks: number
  progressBaseTaskCount: number
  completedTasks: number
  inProgressTasks: number
  overdueTask: number
  avgProgress: number
  criticalTaskCount: number
  blockedTasks: number
  pendingStartTasks: number
  readyToStartTasks: number
  projectDuration: number
  criticalPathSummary: string
  aiDurationTaskCount: number
  totalAiDuration: number
  avgAiDuration: number
}

export interface GanttStatsCardsProps {
  projectStats: ProjectStatsData
}

export const GanttStatsCards = memo(function GanttStatsCards({ projectStats }: GanttStatsCardsProps) {
  const cards = [
    { label: '总任务数', value: projectStats.totalTasks, tone: 'text-slate-900' },
    {
      label: '已完成',
      value: projectStats.completedTasks,
      tone: 'text-emerald-600',
      helper: projectStats.progressBaseTaskCount > 0 ? `${Math.round((projectStats.completedTasks / projectStats.progressBaseTaskCount) * 100)}%` : '0%',
    },
    {
      label: '平均进度',
      value: `${projectStats.avgProgress}%`,
      tone: 'text-blue-600',
      progress: projectStats.avgProgress,
    },
    {
      label: '逾期任务',
      value: projectStats.overdueTask,
      tone: projectStats.overdueTask > 0 ? 'text-red-600' : 'text-slate-400',
      helper: projectStats.overdueTask > 0 ? '需跟进' : '暂无',
    },
    {
      label: '受阻任务',
      value: projectStats.blockedTasks,
      tone: projectStats.blockedTasks > 0 ? 'text-amber-600' : 'text-slate-400',
      helper: projectStats.blockedTasks > 0 ? '需处理' : '暂无',
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
            {typeof card.progress === 'number' && (
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {projectStats.aiDurationTaskCount > 0 && (
        <Card variant="metric" className="sm:col-span-2 xl:col-span-1">
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-medium text-slate-500">AI 推荐工期</p>
            <div className="flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight text-purple-600">{projectStats.totalAiDuration}天</p>
              <span className="text-xs text-slate-500">{projectStats.aiDurationTaskCount} 项</span>
            </div>
            <p className="text-xs text-slate-500">平均 {projectStats.avgAiDuration}天</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
})

GanttStatsCards.displayName = 'GanttStatsCards'

export interface GanttBatchBarProps {
  allSelected: boolean
  someSelected: boolean
  selectedCount: number
  onToggleSelectAll: () => void
  onBatchComplete: () => void
  onBatchDelete: () => void
}

export const GanttBatchBar = memo(function GanttBatchBar({
  allSelected,
  someSelected,
  selectedCount,
  onToggleSelectAll,
  onBatchComplete,
  onBatchDelete,
}: GanttBatchBarProps) {
  return (
    <Card variant="surface">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-center gap-3 select-none">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={allSelected}
            ref={(el) => {
              if (el) {
                el.indeterminate = someSelected && !allSelected
              }
            }}
            onChange={onToggleSelectAll}
          />
          <span className="text-sm font-medium text-slate-700">全选</span>
          {selectedCount > 0 && <span className="text-sm text-slate-500">已选 {selectedCount} 项</span>}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBatchComplete}
            disabled={selectedCount === 0}
            className="gap-1.5"
          >
            <SlidersHorizontal className="h-4 w-4" />
            批量完成
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBatchDelete}
            disabled={selectedCount === 0}
            className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            批量删除
          </Button>
        </div>
      </CardContent>
    </Card>
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
            <option value="blocked">受阻</option>
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
