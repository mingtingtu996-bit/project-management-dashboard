/**
 * AssigneeProgressCard.tsx
 * 
 * 责任人完成情况卡片 - 优化版
 * 
 * 功能特性：
 * 1. 语义化颜色编码：进度条按完成度自动着色
 * 2. 排名标识：左侧显示排名，颜色与状态一致
 * 3. 底部统计栏：状态分布和平均完成度
 * 4. 交互效果：hover高亮、可点击展开详情
 * 
 * 颜色规则：
 * - ≥80%: 绿色 (emerald-500) - 健康
 * - 50-79%: 蓝色 (blue-500) - 正常
 * - 20-49%: 琥珀色 (amber-500) - 需关注
 * - <20%: 红色 (red-500) - 滞后
 * 
 * @module
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AssigneeProgress {
  id: string
  name: string
  avatar?: string
  progress: number
  taskCount: number
  completedTasks: number
}

interface AssigneeProgressCardProps {
  assignees: AssigneeProgress[]
  onViewAll?: () => void
  onItemClick?: (assignee: AssigneeProgress) => void
  maxItems?: number
}

// 进度状态配置 - 可外部化配置
interface ProgressStatusConfig {
  threshold: number
  bar: string
  text: string
  rank: string
  bg: string
  status: string
}

const DEFAULT_STATUS_CONFIG: ProgressStatusConfig[] = [
  { threshold: 80, bar: 'bg-emerald-500', text: 'text-emerald-600', rank: 'text-emerald-600', bg: 'bg-emerald-50/50', status: '健康' },
  { threshold: 50, bar: 'bg-blue-500', text: 'text-blue-600', rank: 'text-blue-600', bg: 'bg-transparent', status: '正常' },
  { threshold: 20, bar: 'bg-amber-500', text: 'text-amber-600', rank: 'text-amber-600', bg: 'bg-amber-50/50', status: '需关注' },
  { threshold: 0, bar: 'bg-red-500', text: 'text-red-600', rank: 'text-red-600', bg: 'bg-red-50/50', status: '滞后' }
]

// 根据进度获取颜色配置
const getProgressColor = (progress: number, config: ProgressStatusConfig[] = DEFAULT_STATUS_CONFIG) => {
  for (const item of config) {
    if (progress >= item.threshold) {
      return item
    }
  }
  return config[config.length - 1]
}

// 获取姓名首字母
const getInitial = (name: string) => {
  return name.charAt(0).toUpperCase()
}

export function AssigneeProgressCard({ 
  assignees, 
  onViewAll, 
  onItemClick,
  maxItems = 5 
}: AssigneeProgressCardProps) {
  // 按进度排序（高到低）
  const sortedAssignees = [...assignees]
    .sort((a, b) => b.progress - a.progress)
    .slice(0, maxItems)

  // 计算统计数据
  const stats = {
    healthy: assignees.filter(a => a.progress >= 80).length,
    normal: assignees.filter(a => a.progress >= 50 && a.progress < 80).length,
    warning: assignees.filter(a => a.progress >= 20 && a.progress < 50).length,
    critical: assignees.filter(a => a.progress < 20).length,
    average: assignees.length > 0 
      ? Math.round(assignees.reduce((sum, a) => sum + a.progress, 0) / assignees.length)
      : 0
  }

  if (assignees.length === 0) {
    return (
      <Card className="rounded-xl border border-gray-200 shadow-sm bg-white hover:shadow-md hover:ring-1 ring-blue-100 transition-all">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">责任人完成情况</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">暂无责任人数据</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-xl border border-gray-200 shadow-sm bg-white hover:shadow-md hover:ring-1 ring-blue-100 transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">责任人完成情况</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              各责任人负责任务的完成进度
            </p>
          </div>
          {onViewAll && (
            <button 
              onClick={onViewAll}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-0.5 transition-colors"
            >
              查看全部
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* 列表头部 */}
        <div className="flex items-center text-xs text-gray-400 mb-2 px-2">
          <span className="w-8">排名</span>
          <span className="flex-1">责任人</span>
          <span className="w-20 text-right">完成度</span>
          <span className="w-6"></span>
        </div>

        {/* 列表项 */}
        <div className="space-y-1">
          {sortedAssignees.map((assignee, index) => {
            const colors = getProgressColor(assignee.progress)
            const rank = index + 1

            return (
              <div
                key={assignee.id}
                onClick={() => onItemClick?.(assignee)}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg cursor-pointer group transition-all",
                  "hover:bg-gray-50",
                  colors.bg
                )}
              >
                {/* 排名 */}
                <span className={cn("w-8 text-center font-bold text-sm", colors.rank)}>
                  {rank}
                </span>

                {/* 头像 */}
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 flex-shrink-0">
                  {assignee.avatar ? (
                    <img src={assignee.avatar} alt={assignee.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    getInitial(assignee.name)
                  )}
                </div>

                {/* 姓名和进度 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {assignee.name}
                    </span>
                    <span className={cn("text-sm font-bold", colors.text)}>
                      {assignee.progress}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
                      style={{ width: `${assignee.progress}%` }}
                    />
                  </div>
                </div>

                {/* 箭头 */}
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
              </div>
            )
          })}
        </div>

        {/* 底部统计 */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            {stats.healthy > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-gray-600">健康 <strong className="text-gray-900">{stats.healthy}</strong></span>
              </span>
            )}
            {stats.normal > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-gray-600">正常 <strong className="text-gray-900">{stats.normal}</strong></span>
              </span>
            )}
            {stats.warning > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span className="text-gray-600">需关注 <strong className="text-gray-900">{stats.warning}</strong></span>
              </span>
            )}
            {stats.critical > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="text-gray-600">滞后 <strong className="text-gray-900">{stats.critical}</strong></span>
              </span>
            )}
          </div>
          <span className="text-gray-500">
            平均完成度 <strong className="text-gray-900">{stats.average}%</strong>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export default AssigneeProgressCard