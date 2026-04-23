import { FileText, Link2, Plus, Search } from 'lucide-react'
import { ReadOnlyGuard } from '@/components/ReadOnlyGuard'
import type {
  LifecycleStatusOption,
  PreMilestonesViewMode,
  ProjectOption,
} from '../types'

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
    <div className="shell-surface px-6 py-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        <select
          value={selectedProjectId}
          onChange={(event) => onProjectChange(event.target.value)}
          disabled={projectsLoading || projects.length === 0}
          className="px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          {projectsLoading ? (
            <option value="all">加载项目中...</option>
          ) : projects.length === 0 ? (
            <option value="all">暂无项目</option>
          ) : (
            projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))
          )}
        </select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索证照名称或类型..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => onViewModeChange('list')}
            className={`px-3 py-2 text-sm transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
            title="列表视图"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('timeline')}
            className={`px-3 py-2 text-sm transition-colors ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
            title="时间轴视图"
          >
            <Link2 className="w-4 h-4" />
          </button>
        </div>

        <ReadOnlyGuard action="create">
          <button
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            <span>新建证照</span>
          </button>
        </ReadOnlyGuard>
      </div>
    </div>
  )
}
