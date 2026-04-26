import { type MouseEvent } from 'react'
import {
  AlertOctagon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flag,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'

import {
  SHARED_TREE_LAYOUT,
  TreeDiamondIcon,
} from '@/components/tree/SharedTreePrimitives'
import type { CriticalTaskSnapshot } from '@/lib/criticalPath'
import { LoadingState } from '@/components/ui/loading-state'
import { getTaskLagLevel } from '@/lib/taskBusinessStatus'
import { cn } from '@/lib/utils'

import { MILESTONE_LEVEL_CONFIG, SPECIALTY_TYPES, getWBSNodeIcon, type Task, type TaskCondition, type WBSNode } from './GanttViewTypes'

export type BusinessStatusView = {
  label: string
  cls: string
  badge?: { text: string; cls: string }
}

export type TaskConditionSummary = {
  satisfied: number
  total: number
}

export function TaskRowIdentityCell({
  task,
  node,
  indentPx,
  hasChildren,
  isCollapsed,
  isOverdue,
  overdueDays,
  selected,
  bizStatus,
  conditionSummary,
  obstacleCount,
  criticalTask,
  inlineTitleTaskId,
  inlineTitleValue,
  expandedConditionTaskId,
  onToggleSelect,
  onToggleCollapse,
  onSelectTask,
  onOpenMilestoneDialog,
  onOpenEditDialog,
  onStartInlineTitleEdit,
  onInlineTitleValueChange,
  onInlineTitleSave,
  onCancelInlineTitleEdit,
  onToggleInlineConditions,
}: {
  task: Task
  node: WBSNode
  indentPx: number
  hasChildren: boolean
  isCollapsed: boolean
  isOverdue: boolean
  overdueDays: number
  selected: boolean
  bizStatus: BusinessStatusView
  conditionSummary: TaskConditionSummary | undefined
  obstacleCount: number
  criticalTask: CriticalTaskSnapshot | null
  inlineTitleTaskId: string | null
  inlineTitleValue: string
  expandedConditionTaskId: string | null
  onToggleSelect: (taskId: string) => void
  onToggleCollapse: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onOpenMilestoneDialog: (task: Task) => void
  onOpenEditDialog: (task?: Task, parentId?: string) => void
  onStartInlineTitleEdit: (task: Task) => void
  onInlineTitleValueChange: (value: string) => void
  onInlineTitleSave: (taskId: string) => void
  onCancelInlineTitleEdit: () => void
  onToggleInlineConditions: (taskId: string, event: MouseEvent) => void
}) {
  const iconInfo = getWBSNodeIcon(node)
  const lagLevel = getTaskLagLevel(task)

  return (
    <div className={cn('flex h-full min-w-0 shrink-0 items-center', SHARED_TREE_LAYOUT.firstColumnClass)}>
      <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: `${indentPx}px` }}>
        <div className="flex-shrink-0 w-6">
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-gray-300"
          checked={selected}
          onChange={() => onToggleSelect(task.id)}
          data-testid={`gantt-task-checkbox-${task.id}`}
        />
        </div>

        <div className="flex-shrink-0 w-5 mr-1">
        {hasChildren ? (
          <button onClick={() => onToggleCollapse(task.id)} className="text-gray-400 hover:text-gray-600 transition-colors">
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block w-3.5" />
        )}
        </div>

        <button
        title={task.is_milestone ? `${MILESTONE_LEVEL_CONFIG[task.milestone_level ?? 1]?.label}\uFF08\u70B9\u51FB\u4FEE\u6539\uFF09` : '\u8BBE\u4E3A\u91CC\u7A0B\u7891'}
        onClick={(event) => {
          event.stopPropagation()
          onOpenMilestoneDialog(task)
        }}
        className={`flex-shrink-0 p-0.5 rounded transition-colors hover:bg-accent mr-1.5 ${
          task.is_milestone
            ? MILESTONE_LEVEL_CONFIG[task.milestone_level ?? 1]?.color
            : 'text-gray-300 hover:text-gray-500'
        }`}
      >
        <Flag className="h-3.5 w-3.5" fill={task.is_milestone ? 'currentColor' : 'none'} />
        </button>

        <div
          className="flex min-w-0 flex-1 items-center gap-1.5 mr-3 cursor-pointer"
          data-testid={`gantt-task-select-${task.id}`}
          onClick={() => onSelectTask(task)}
        >
        {task.is_milestone && !hasChildren ? (
          <TreeDiamondIcon className="text-amber-500" />
        ) : iconInfo.icon === 'folder' ? (
          <svg className={`flex-shrink-0 h-3.5 w-3.5 ${iconInfo.cls}`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
          </svg>
        ) : iconInfo.icon === 'folder-open' ? (
          <svg className={`flex-shrink-0 h-3.5 w-3.5 ${iconInfo.cls}`} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          </svg>
        ) : (
          <svg className={`flex-shrink-0 h-3.5 w-3.5 ${iconInfo.cls}`} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        )}
        {task.wbs_code && <span className="flex-shrink-0 text-[10px] tabular-nums text-gray-400 font-mono min-w-[24px]">{task.wbs_code}</span>}
        {inlineTitleTaskId === task.id ? (
          <input
            type="text"
            value={inlineTitleValue}
            onChange={(event) => onInlineTitleValueChange(event.target.value)}
            onBlur={() => onInlineTitleSave(task.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onInlineTitleSave(task.id)
              if (event.key === 'Escape') onCancelInlineTitleEdit()
            }}
            autoFocus
            className="text-sm font-medium w-40 border-b border-blue-400 bg-transparent outline-none px-0.5 py-0 text-gray-800"
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSelectTask(task)
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              onStartInlineTitleEdit(task)
            }}
            className={`text-sm font-medium truncate max-w-[200px] text-left hover:text-blue-600 transition-colors ${
              isOverdue
                ? 'text-red-600'
                : lagLevel === 'severe'
                  ? 'text-orange-700'
                  : lagLevel === 'moderate'
                    ? 'text-amber-700'
                    : lagLevel === 'mild'
                      ? 'text-yellow-700'
                  : task.status === 'completed'
                    ? 'text-gray-400 line-through'
                    : task.status === 'in_progress'
                      ? 'text-blue-700'
                      : 'text-gray-800'
            }`}
            title="单击查看详情，双击快速改名"
          >
            {task.title || task.name}
          </button>
        )}
        <TaskRowMetaChips
          taskId={task.id}
          bizStatus={bizStatus}
          overdueDays={overdueDays}
          conditionSummary={conditionSummary}
          obstacleCount={obstacleCount}
          criticalTask={criticalTask}
          specialtyType={task.specialty_type}
          expandedConditionTaskId={expandedConditionTaskId}
          onToggleInlineConditions={onToggleInlineConditions}
        />
        </div>
      </div>
    </div>
  )
}

export function TaskRowMetaChips({
  taskId,
  bizStatus,
  overdueDays,
  conditionSummary,
  obstacleCount,
  criticalTask,
  specialtyType,
  expandedConditionTaskId,
  onToggleInlineConditions,
}: {
  taskId: string
  bizStatus: BusinessStatusView
  overdueDays: number
  conditionSummary: TaskConditionSummary | undefined
  obstacleCount: number
  criticalTask: CriticalTaskSnapshot | null
  specialtyType?: string | null
  expandedConditionTaskId: string | null
  onToggleInlineConditions: (taskId: string, event: MouseEvent) => void
}) {
  const specialtyConfig = specialtyType ? SPECIALTY_TYPES.find(s => s.value === specialtyType) : null
  const showBusinessChip = !['进行中', '已完成', '待开始'].includes(bizStatus.label)
  return (
    <>
      {showBusinessChip && (
        <span
          data-testid={`gantt-business-status-chip-${taskId}`}
          className={`flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${bizStatus.cls}`}
        >
          {bizStatus.label}
        </span>
      )}
      {bizStatus.badge && <span className={`flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${bizStatus.badge.cls}`}>{bizStatus.badge.text}</span>}
      {specialtyConfig && (
        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-xs ${specialtyConfig.color}`}>
          {specialtyConfig.label}
        </span>
      )}
      {overdueDays > 0 && !bizStatus.badge && <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">逾期{overdueDays}天</span>}

      {conditionSummary && conditionSummary.total > 0 && (
        <button
          onClick={(event) => onToggleInlineConditions(taskId, event)}
          className={`flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
            expandedConditionTaskId === taskId
              ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
              : conditionSummary.satisfied >= conditionSummary.total
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
          }`}
          title={'开工条件 ' + conditionSummary.satisfied + '/' + conditionSummary.total}
        >
          <ShieldCheck className="h-2.5 w-2.5" />
          {conditionSummary.satisfied}/{conditionSummary.total}
          {expandedConditionTaskId === taskId ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
        </button>
      )}

      {obstacleCount > 0 && (
        <span
          className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
          title={`${obstacleCount} 个未解决阻碍`}
        >
          <AlertOctagon className="h-2.5 w-2.5" />
          阻碍{obstacleCount}
        </span>
      )}

      {criticalTask && (
        <>
          {criticalTask.isAutoCritical && (
            <span
              data-testid={'gantt-critical-badge-' + taskId}
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200 cursor-help"
              title={'关键任务 浮动时间: ' + criticalTask.floatDays + '天'}
              >
                关键 +{criticalTask.floatDays}天
              </span>
          )}
          {criticalTask.isManualAttention && (
            <span
              data-testid={'gantt-critical-attention-badge-' + taskId}
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200"
              title="手动关注任务"
            >
              关注
            </span>
          )}
          {criticalTask.isManualInserted && (
            <span
              data-testid={'gantt-critical-insert-badge-' + taskId}
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200"
              title="手动插链任务"
            >
              插链
            </span>
          )}
        </>
      )}
    </>
  )
}

export function TaskRowDetailCells({
  task,
  hasChildren,
  isOverdue,
  actualProgress,
  rolledProgress,
  bizStatus,
  criticalTask,
  onOpenEditDialog,
  onDeleteTask,
  onViewTaskSummary,
  onStatusChange,
}: {
  task: Task
  hasChildren: boolean
  isOverdue: boolean
  actualProgress: number
  rolledProgress: number
  bizStatus: BusinessStatusView
  criticalTask: CriticalTaskSnapshot | null
  onOpenEditDialog: (task?: Task, parentId?: string) => void
  onDeleteTask: (taskId: string) => void
  onViewTaskSummary: (taskId: string) => void
  onStatusChange?: (taskId: string, status: string) => void
}) {
  const isMilestoneLeaf = Boolean(task.is_milestone && !hasChildren)
  const lagLevel = getTaskLagLevel(task)
  const criticalProgressClass = criticalTask
    ? criticalTask.isManualInserted
      ? 'bg-orange-500'
      : criticalTask.isManualAttention
        ? 'bg-amber-400'
        : criticalTask.isAutoCritical
          ? 'bg-red-500'
          : 'bg-gray-300'
    : task.status === 'completed'
      ? 'bg-emerald-500'
      : isOverdue
        ? 'bg-red-500'
        : lagLevel === 'severe'
          ? 'bg-orange-500'
          : lagLevel === 'moderate'
            ? 'bg-amber-400'
            : lagLevel === 'mild'
              ? 'bg-yellow-400'
              : task.status === 'in_progress'
                ? 'bg-blue-500'
                : 'bg-gray-300'
  const milestoneProgressLabel =
    task.status === 'completed'
      ? '已完成'
      : actualProgress > 0
        ? `当前 ${actualProgress}%`
        : '待更新'

  return (
    <>
      <div className="flex-shrink-0 w-24">
        <span
          data-testid={`gantt-task-status-${task.id}`}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${bizStatus.cls}`}
        >
          {bizStatus.label}
          {bizStatus.badge && <span className="opacity-80">· {bizStatus.badge.text}</span>}
        </span>
      </div>

      <div className="flex-shrink-0 w-32 px-3">
        {isMilestoneLeaf ? (
          <div className="flex items-center justify-between text-xs text-amber-700">
            <span className="font-medium">关键节点</span>
            <span className="tabular-nums">{milestoneProgressLabel}</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5"
            title={
              hasChildren
                ? '实际进度 ' + actualProgress + '% / 子任务汇总 ' + rolledProgress + '%（已收口到右侧详情抽屉录进展）'
                : '实际进度 ' + actualProgress + '%（已收口到右侧详情抽屉录进展）'
            }
            data-testid={`gantt-task-progress-display-${task.id}`}
          >
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={'h-full rounded-full transition-all ' + criticalProgressClass} style={{ width: actualProgress + '%' }} />
            </div>
            <span className="text-xs font-medium w-7 text-right tabular-nums text-gray-600">
              {actualProgress}%
            </span>
            {hasChildren && (
              <span className="text-[10px] text-purple-500 whitespace-nowrap" title={'子任务汇总进度 ' + rolledProgress + '%'}>
                汇总{rolledProgress}%
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 w-20 text-xs text-gray-600 truncate" title={task.assignee_name || ''}>
        {task.assignee_name || <span className="text-muted-foreground/40">—</span>}
      </div>

      <div className="flex-shrink-0 w-28 text-xs text-gray-500 tabular-nums">
        <span className="text-muted-foreground/40 italic" title="工期信息已收口到右侧详情抽屉">
          —
        </span>
      </div>

      <div className="flex-shrink-0 w-24 text-center text-xs text-muted-foreground/40" title="工期信息已收口到右侧详情抽屉">
        —
      </div>

      {!hasChildren ? (
        <div className="flex-shrink-0 w-16 text-center text-[10px] text-muted-foreground/40" title="关键路径信息已收口到左侧颜色与右侧抽屉">
          —
        </div>
      ) : (
        <div className="flex-shrink-0 w-16" />
      )}

      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
        {onStatusChange && task.status !== 'in_progress' && task.status !== 'completed' && (
          <button
            title="开始执行"
            onClick={() => onStatusChange(task.id, 'in_progress')}
            className="p-1.5 hover:bg-blue-50 rounded text-gray-300 hover:text-blue-600 transition-colors"
            data-testid={`row-start-task-${task.id}`}
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
          </button>
        )}
        {onStatusChange && task.status === 'in_progress' && (
          <button
            title="标记完成"
            onClick={() => onStatusChange(task.id, 'completed')}
            className="p-1.5 hover:bg-emerald-50 rounded text-gray-300 hover:text-emerald-600 transition-colors"
            data-testid={`row-complete-task-${task.id}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button title="添加子任务" onClick={() => onOpenEditDialog(undefined, task.id)} className="p-1.5 hover:bg-blue-50 rounded text-blue-400 hover:text-blue-600 transition-colors">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button title="编辑任务" onClick={() => onOpenEditDialog(task)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button title="删除任务" onClick={() => onDeleteTask(task.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {task.status === 'completed' && (
          <button title="查看任务完成总结" onClick={() => onViewTaskSummary(task.id)} className="p-1.5 hover:bg-orange-50 rounded text-gray-300 hover:text-orange-500 transition-colors">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </>
  )
}

export function TaskRowConditionPanel({
  task,
  taskId,
  expandedConditionTaskId,
  inlineConditions,
  onToggleInlineConditions,
  onToggleCondition,
  indentPx,
}: {
  task: Task
  taskId: string
  expandedConditionTaskId: string | null
  inlineConditions: TaskCondition[] | undefined
  onToggleInlineConditions: (taskId: string, event: MouseEvent) => void
  onToggleCondition?: (condition: TaskCondition) => void
  indentPx: number
}) {
  if (expandedConditionTaskId !== taskId) return null

  return (
    <div className="mx-4 mb-2 rounded-xl border border-green-100 bg-green-50/60 p-3" style={{ marginLeft: (indentPx + 16) + 'px' }} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-green-700 flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          开工条件
        </span>
        <button onClick={(event) => onToggleInlineConditions(taskId, event)} className="text-xs text-gray-400 hover:text-gray-600">收起</button>
      </div>
      {!inlineConditions ? (
        <LoadingState
          label="开工条件加载中"
          className="min-h-0 border-0 bg-transparent px-0 py-1 shadow-none"
        />
      ) : inlineConditions.length === 0 ? (
        <div className="text-xs text-gray-400 py-1">暂无条件记录</div>
      ) : (
        <div className="space-y-1.5">
          {inlineConditions.map((condition) => (
            <div key={condition.id} className="flex items-center gap-1.5 text-xs">
              {condition.is_satisfied
                ? <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                : <XCircle className="h-3 w-3 text-orange-400 flex-shrink-0" />}
              <span className={condition.is_satisfied ? 'text-gray-400 line-through' : 'text-gray-700'}>{condition.name}</span>
              {condition.condition_type && <span className="px-1 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">{condition.condition_type}</span>}
              {condition.is_satisfied && condition.satisfied_reason === 'admin_force' && (
                <span className="px-1 py-0.5 rounded text-[10px] bg-violet-100 text-violet-700 border border-violet-200" title={condition.satisfied_reason_note || '管理员强制满足'}>强制</span>
              )}
              {condition.target_date && <span className="text-gray-400">{condition.target_date}</span>}
              {onToggleCondition && !condition.is_satisfied && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleCondition(condition) }}
                  className="ml-auto rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                  data-testid={`condition-mark-satisfied-${condition.id}`}
                >
                  标记满足
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
