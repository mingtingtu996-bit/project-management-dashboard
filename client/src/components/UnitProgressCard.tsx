/**
 * UnitProgressCard.tsx
 * 
 * 责任单位完成情况卡片 - 优化版
 * 
 * 功能特性：
 * 1. 语义化颜色编码：进度条按完成度自动着色
 * 2. 排名标识：左侧显示排名，颜色与状态一致
 * 3. 单位图标：使用不同颜色的图标区分单位类型
 * 4. 底部统计栏：状态分布和平均完成度
 * 5. 交互效果：hover高亮、可点击展开详情
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
import { ChevronRight, Building2, Palette, ClipboardCheck, Compass, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

export type UnitType = 'general' | 'design' | 'supervision' | 'survey' | 'subcontract'

export interface UnitProgress {
  id: string
  name: string
  type: UnitType
  progress: number
  taskCount: number
  completedTasks: number
}

interface UnitProgressCardProps {
  units: UnitProgress[]
  onViewAll?: () => void
  onItemClick?: (unit: UnitProgress) => void
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

// 获取单位图标配置
const getUnitIconConfig = (type: UnitType) => {
  switch (type) {
    case 'general':
      return {
        icon: Building2,
        bgColor: 'bg-blue-50',
        iconColor: 'text-blue-600'
      }
    case 'design':
      return {
        icon: Palette,
        bgColor: 'bg-purple-50',
        iconColor: 'text-purple-600'
      }
    case 'supervision':
      return {
        icon: ClipboardCheck,
        bgColor: 'bg-orange-50',
        iconColor: 'text-orange-600'
      }
    case 'survey':
      return {
        icon: Compass,
        bgColor: 'bg-green-50',
        iconColor: 'text-green-600'
      }
    case 'subcontract':
      return {
        icon: Zap,
        bgColor: 'bg-red-50',
        iconColor: 'text-red-600'
      }
    default:
      return {
        icon: Building2,
        bgColor: 'bg-gray-50',
        iconColor: 'text-gray-600'
      }
  }
}

export function UnitProgressCard({ 
  units, 
  onViewAll, 
  onItemClick,
  maxItems = 5 
}: UnitProgressCardProps) {
  // 按进度排序（高到低）
  const sortedUnits = [...units]
    .sort((a, b) => b.progress - a.progress)
    .slice(0, maxItems)

  // 计算统计数据
  const stats = {
    healthy: units.filter(u => u.progress >= 80).length,
    normal: units.filter(u => u.progress >= 50 && u.progress < 80).length,
    warning: units.filter(u => u.progress >= 20 && u.progress < 50).length,
    critical: units.filter(u => u.progress < 20).length,
    average: units.length > 0 
      ? Math.round(units.reduce((sum, u) => sum + u.progress, 0) / units.length)
      : 0
  }

  if (units.length === 0) {
    return (
      <Card variant="metric">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">责任单位完成情况</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">暂无责任单位数据</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="metric">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">责任单位完成情况</CardTitle>
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
          <span className="flex-1">责任单位</span>
          <span className="w-20 text-right">完成度</span>
          <span className="w-6"></span>
        </div>

        {/* 列表项 */}
        <div className="space-y-1">
          {sortedUnits.map((unit, index) => {
            const colors = getProgressColor(unit.progress)
            const iconConfig = getUnitIconConfig(unit.type)
            const IconComponent = iconConfig.icon
            const rank = index + 1

            return (
              <div
                key={unit.id}
                onClick={() => onItemClick?.(unit)}
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

                {/* 单位图标 */}
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  iconConfig.bgColor
                )}>
                  <IconComponent className={cn("w-5 h-5", iconConfig.iconColor)} />
                </div>

                {/* 单位名称和进度 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {unit.name}
                    </span>
                    <span className={cn("text-sm font-bold", colors.text)}>
                      {unit.progress}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
                      style={{ width: `${unit.progress}%` }}
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

export default UnitProgressCard
