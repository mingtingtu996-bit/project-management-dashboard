import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import { CardHead } from '@/components/ui/card-head'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  PlanningScopeBar,
  type ScopeBarOptions,
  type ScopeBarSelection,
} from '@/components/planning/PlanningScopeBar'
import { PlanningHealthBanner, type HealthIssue } from '@/components/planning/PlanningHealthBanner'
import { CriticalPathAlert, type CriticalPathChange } from '@/components/planning/CriticalPathAlert'
import { zhCN } from '@/i18n/zh-CN'
import { AlertTriangle } from 'lucide-react'

import {
  GanttFilterBar,
  type BuildingOption,
} from '../GanttViewFilters'
import type { Task } from '../GanttViewTypes'

type GanttWorkspaceChromeProps = {
  canEdit: boolean
  criticalPathChangeNotice: (CriticalPathChange & { focusTaskId?: string | null }) | null
  criticalPathSnapshot: {
    hasCycleDetected?: boolean
    cycleTaskIds?: string[]
  } | null
  filterActions: {
    clearAllFilters: () => void
    onBuildingChange: (value: string) => void
    onCriticalToggle: () => void
    onPriorityChange: (value: string) => void
    onSearchChange: (value: string) => void
    onShowRiskIssueOnlyChange: (value: boolean) => void
    onSpecialtyChange: (value: string) => void
    onStatusChange: (value: string) => void
    setShowFilterBar: Dispatch<SetStateAction<boolean>>
  }
  filters: {
    activeFilterCount: number
    buildingOptions: BuildingOption[]
    filterBuilding: string
    filterCritical: boolean
    filterPriority: string
    filterSpecialty: string
    filterStatus: string
    filteredFlatListLength: number
    flatListLength: number
    searchText: string
    showFilterBar: boolean
    showRiskIssueOnly: boolean
    specialtyOptions: string[]
  }
  milestone: {
    id: string
    label: string
    projectId?: string
  }
  navigate: NavigateFunction
  onCriticalPathNoticeDismiss: () => void
  onCriticalPathNoticeViewDetails: () => void
  planningHealthIssues: HealthIssue[]
  signalsPending?: boolean
  taskActions?: ReactNode
  criticalPathSummaryText?: string
  scope: {
    options: ScopeBarOptions
    selection: ScopeBarSelection
    onChange: (value: ScopeBarSelection) => void
    onClear: () => void
  }
  tasks: Task[]
  viewMode: string
}

export function GanttWorkspaceChrome({
  canEdit,
  criticalPathChangeNotice,
  criticalPathSnapshot,
  filterActions,
  filters,
  milestone,
  navigate,
  onCriticalPathNoticeDismiss,
  onCriticalPathNoticeViewDetails,
  planningHealthIssues,
  signalsPending = false,
  taskActions,
  criticalPathSummaryText,
  scope,
  tasks,
  viewMode,
}: GanttWorkspaceChromeProps) {
  const {
    activeFilterCount,
    buildingOptions,
    filterBuilding,
    filterCritical,
    filterPriority,
    filterSpecialty,
    filterStatus,
    filteredFlatListLength,
    flatListLength,
    searchText,
    showFilterBar,
    showRiskIssueOnly,
    specialtyOptions,
  } = filters
  const {
    clearAllFilters,
    onBuildingChange,
    onCriticalToggle,
    onPriorityChange,
    onSearchChange,
    onShowRiskIssueOnlyChange,
    onSpecialtyChange,
    onStatusChange,
    setShowFilterBar,
  } = filterActions
  const { id: milestoneFilterId, label: milestoneFilterLabel, projectId } = milestone
  const { options: scopeBarOptions, selection: scopeSelection, onChange: onScopeSelectionChange, onClear: clearScopeSelection } = scope
  const hasSignalBanner =
    planningHealthIssues.length > 0 ||
    Boolean(criticalPathChangeNotice) ||
    showRiskIssueOnly ||
    Boolean(criticalPathSnapshot?.hasCycleDetected)

  return (
    <>
      <PlanningScopeBar
        selection={scopeSelection}
        options={scopeBarOptions}
        onChange={onScopeSelectionChange}
        onClear={clearScopeSelection}
        readOnly={canEdit === false}
      />
      <div data-testid="task-workspace-layer-l3" className="sticky top-0 z-30 border-b border-slate-100 bg-white px-4 py-3">
        <CardHead
          eyebrow="TASKS"
          title={zhCN.gantt.structureTitle}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {taskActions}
              <span className={`badge-micro inline-flex h-5 items-center rounded-full px-2 font-medium ring-1 ring-inset ${viewMode === 'gantt' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-slate-100 text-slate-600 ring-slate-200/60'}`}>
                {viewMode === 'gantt' ? '横道图视图' : '计划树视图'}
              </span>
              {activeFilterCount > 0 && (
                <span className="badge-micro inline-flex h-5 items-center rounded-full px-2 font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                  {filteredFlatListLength}/{flatListLength} {zhCN.gantt.structureCount}
                </span>
              )}
              {milestoneFilterId ? (
                <>
                  <span className="badge-micro inline-flex h-5 items-center rounded-full bg-indigo-50 px-2 font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                    关联节点：{milestoneFilterLabel}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-md px-2 text-xs text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                    onClick={() => navigate(`/projects/${projectId}/milestones?highlight=${encodeURIComponent(milestoneFilterId)}`)}
                  >
                    返回里程碑
                  </Button>
                </>
              ) : null}
              {criticalPathSummaryText && (
                <p className="text-xs text-muted-foreground">
                  {zhCN.gantt.criticalPath}: {criticalPathSummaryText}
                </p>
              )}
            </div>
          }
        />
      </div>
      <Sheet open={showFilterBar} onOpenChange={setShowFilterBar}>
        <SheetContent className="w-[min(92vw,520px)] overflow-y-auto p-0">
          <SheetHeader className="border-b border-slate-100 px-5 py-4 text-left">
            <SheetTitle>筛选任务</SheetTitle>
            <SheetDescription>按状态、优先级、专项、楼栋和关键路径缩小当前任务列表。</SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <GanttFilterBar
              searchText={searchText}
              filterStatus={filterStatus}
              filterPriority={filterPriority}
              filterCritical={filterCritical}
              filterSpecialty={filterSpecialty}
              filterBuilding={filterBuilding}
              specialtyOptions={specialtyOptions}
              buildingOptions={buildingOptions}
              projectId={projectId}
              onSearchChange={onSearchChange}
              onStatusChange={onStatusChange}
              onPriorityChange={onPriorityChange}
              onCriticalToggle={onCriticalToggle}
              onSpecialtyChange={onSpecialtyChange}
              onBuildingChange={onBuildingChange}
              onClearAll={clearAllFilters}
              onClose={() => setShowFilterBar(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
      <div className={signalsPending || hasSignalBanner ? 'min-h-[3rem]' : undefined}>
      <PlanningHealthBanner issues={planningHealthIssues} maxVisible={3} className="mx-4 mb-3" />
      <CriticalPathAlert
        change={criticalPathChangeNotice}
        className="mx-4 mb-3"
        onDismiss={onCriticalPathNoticeDismiss}
        onViewDetails={onCriticalPathNoticeViewDetails}
      />
      {showRiskIssueOnly && (
        <div
          data-testid="gantt-risk-issue-filter-banner"
          className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800"
        >
          <span>正在仅显示存在相关风险问题的任务</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs text-amber-800 hover:bg-amber-100"
            onClick={() => onShowRiskIssueOnlyChange(false)}
          >
            显示全部任务
          </Button>
        </div>
      )}
      {criticalPathSnapshot?.hasCycleDetected && (
        <div
          data-testid="gantt-cycle-detection-banner"
          className="mx-4 mb-3 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <div className="font-semibold">检测到任务依赖环路</div>
            <div className="mt-0.5 text-xs text-amber-700">
              关键路径计算已暂停，请检查以下任务的依赖关系并消除环路后重新计算。
              {(criticalPathSnapshot.cycleTaskIds ?? []).length > 0 && (
                <span className="ml-1 font-medium">
                  {(criticalPathSnapshot.cycleTaskIds ?? [])
                    .map((tid) => {
                      const task = tasks.find((item) => item.id === tid)
                      return task ? (task.title || tid) : tid
                    })
                    .join(' -> ')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
