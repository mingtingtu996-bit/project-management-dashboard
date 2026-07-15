import { FileText, Link2, Plus, Search } from 'lucide-react'
import { ReadOnlyGuard } from '@/components/ReadOnlyGuard'
import type {
  LifecycleStatusOption,
  PreMilestonesViewMode,
  ProjectOption,
} from '../types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface MilestoneToolbarProps {
  selectedProjectId: string
  projectsLoading: boolean
  projects: ProjectOption[]
  searchQuery: string
  statusFilter: string
  statusOptions: LifecycleStatusOption[]
  viewMode: PreMilestonesViewMode
  onProjectChange: (projectId: string) => void
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: string) => void
  onViewModeChange: (mode: PreMilestonesViewMode) => void
  onCreate: () => void
}

export function MilestoneToolbar({
  selectedProjectId,
  projectsLoading,
  projects,
  searchQuery,
  statusFilter,
  statusOptions,
  viewMode,
  onProjectChange,
  onSearchChange,
  onStatusFilterChange,
  onViewModeChange,
  onCreate,
}: MilestoneToolbarProps) {
  return (
    <div className="surface-card px-6 py-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Select
          value={selectedProjectId}
          onValueChange={onProjectChange}
          disabled={projectsLoading || projects.length === 0}
        >
          <SelectTrigger aria-label="选择项目" className="h-10 min-w-56 rounded-xl border-slate-300 bg-white text-sm focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projectsLoading ? (
              <SelectItem value="all">加载项目中...</SelectItem>
            ) : projects.length === 0 ? (
              <SelectItem value="all">暂无项目</SelectItem>
            ) : (
              projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            aria-label="搜索证照名称或类型"
            placeholder="搜索证照名称或类型..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={onStatusFilterChange}
        >
          <SelectTrigger aria-label="证照状态筛选" className="h-10 min-w-36 rounded-xl border-slate-300 bg-white text-sm focus-visible:ring-2 focus-visible:ring-blue-500">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
          <Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost"
            onClick={() => onViewModeChange('list')}
            className={`px-3 py-2 text-sm transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            
          >
            <FileText className="w-4 h-4" />
          </Button>
  </TooltipTrigger>
  <TooltipContent>列表视图</TooltipContent>
</Tooltip>
          <Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost"
            onClick={() => onViewModeChange('timeline')}
            className={`px-3 py-2 text-sm transition-colors ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
            
          >
            <Link2 className="w-4 h-4" />
          </Button>
  </TooltipTrigger>
  <TooltipContent>时间轴视图</TooltipContent>
</Tooltip>
        </div>

        <ReadOnlyGuard action="create">
          <Button variant="ghost"
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            <span>新建证照</span>
          </Button>
        </ReadOnlyGuard>
      </div>
    </div>
  )
}
