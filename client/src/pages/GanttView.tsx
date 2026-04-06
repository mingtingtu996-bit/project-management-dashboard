import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '@/hooks/useStore'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useDebounce } from '@/hooks/useDebounce'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, Plus, Calendar, Save, Trash2, GitBranch, AlertCircle, Flag, ChevronRight, ChevronDown, LayoutTemplate, ShieldCheck, AlertOctagon, CheckCircle2, XCircle, Search, X, SlidersHorizontal, BarChart2 } from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'
import { getAuthHeaders } from '@/lib/apiClient'
import { calculateCPM, isCriticalTask, getCriticalPathSummary, type CPMResult } from '@/lib/cpm'
import {
  buildProjectTaskProgressSnapshot,
  getTaskBusinessStatus,
  isCompletedTask,
} from '@/lib/taskBusinessStatus'
import { BatchActionBar } from '@/components/BatchActionBar'
import { GanttViewSkeleton } from '@/components/ui/page-skeleton'
import { Pagination, usePagination } from '@/components/ui/Pagination'
import { ConflictDialog } from '@/components/ConflictDialog'
import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

// 从独立文件引入类型、常量和工具函数（拆分以避免 esbuild 解析超大文件的 bug）
import {
  type Task,
  type WBSNode,
  type TaskCondition,
  type TaskObstacle,
  type ConditionTypeValue,
  CONDITION_TYPES,
  SPECIALTY_TYPES,
  MILESTONE_LEVEL_CONFIG,
  getWBSNodeIcon,
  buildWBSTree,
  assignWBSCode,
  flattenTree,
} from './GanttViewTypes'
import { SortableTaskRowWrapper } from './GanttViewComponents'

const API_BASE = ''

/**
 * 辅助函数：为 fetch 请求添加 credentials: 'include'
 * 确保浏览器自动携带 httpOnly Cookie
 */
const withCredentials = (options: RequestInit = {}): RequestInit => ({
  ...options,
  credentials: 'include',
})

export default function GanttView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    tasks,
    setTasks,
    addTask,
    updateTask,
    deleteTask,
    currentProject,
    conditions: projectConditions,
    setConditions: setProjectConditions,
    obstacles: projectObstacles,
    setObstacles: setProjectObstacles,
  } = useStore()
  const [loading, setLoading] = useState(true)

  // #16-B: 从总结页跳回时，高亮指定任务行
  const highlightTaskId = new URLSearchParams(location.search).get('highlight') || null
  useEffect(() => {
    if (!highlightTaskId || loading) return
    const outerTimer = setTimeout(() => {
      const el = document.getElementById(`gantt-task-row-${highlightTaskId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('!bg-orange-50', 'ring-1', 'ring-orange-300')
        const innerTimer = setTimeout(() => el.classList.remove('!bg-orange-50', 'ring-1', 'ring-orange-300'), 3000)
        // 将内层定时器存储以便清理（通过闭包引用）
        ;(el as any)._highlightTimer = innerTimer
      }
    }, 400)
    return () => {
      clearTimeout(outerTimer)
      // 清理可能残留的内层高亮定时器
      const el = document.getElementById(`gantt-task-row-${highlightTaskId}`)
      if (el && (el as any)._highlightTimer) {
        clearTimeout((el as any)._highlightTimer)
        el.classList.remove('!bg-orange-50', 'ring-1', 'ring-orange-300')
      }
    }
  }, [highlightTaskId, loading])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  
  // WBS 树形状态
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    // #13: 展开状态记忆 — 从 localStorage 恢复
    try {
      const saved = localStorage.getItem(`gantt_collapsed_${id}`)
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set()
    } catch { return new Set() }
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 确认弹窗状态（使用 useConfirmDialog hook 统一管理，替代 window.confirm）
  const { confirmDialog, setConfirmDialog, openConfirm } = useConfirmDialog()
  // 添加子任务时预设的父节点 ID
  const [newTaskParentId, setNewTaskParentId] = useState<string | null>(null)

  // 里程碑设置弹窗状态
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [milestoneTargetTask, setMilestoneTargetTask] = useState<Task | null>(null)

  // 条件管理弹窗状态
  const [conditionDialogOpen, setConditionDialogOpen] = useState(false)
  const [conditionTask, setConditionTask] = useState<Task | null>(null)
  const [taskConditions, setTaskConditions] = useState<TaskCondition[]>([])
  const [conditionsLoading, setConditionsLoading] = useState(false)
  // P2-9: 存储每个条件的前置任务列表 { conditionId: [{task_id, title, name, status}] }
  const [conditionPrecedingTasks, setConditionPrecedingTasks] = useState<Record<string, Array<{task_id: string; title?: string; name?: string; status?: string}>>>({})
  const [newConditionName, setNewConditionName] = useState('')
  const [newConditionType, setNewConditionType] = useState<string>('other')     // P0-1: 条件类型
  const [newConditionTargetDate, setNewConditionTargetDate] = useState('')       // P1-6: 目标日期
  const [newConditionDescription, setNewConditionDescription] = useState('')     // [G3]: 条件详细说明
  const [newConditionResponsibleUnit, setNewConditionResponsibleUnit] = useState('') // [G3]: 责任单位
  // P2-9: 前置任务多选
  const [newConditionPrecedingTaskIds, setNewConditionPrecedingTaskIds] = useState<string[]>([])

  // 阻碍管理弹窗状态
  const [obstacleDialogOpen, setObstacleDialogOpen] = useState(false)
  const [obstacleTask, setObstacleTask] = useState<Task | null>(null)
  const [taskObstacles, setTaskObstacles] = useState<TaskObstacle[]>([])
  const [obstaclesLoading, setObstaclesLoading] = useState(false)

  // inline 条件面板：展开的 taskId + 已加载的条件缓存
  const [expandedConditionTaskId, setExpandedConditionTaskId] = useState<string | null>(null)
  const [inlineConditionsMap, setInlineConditionsMap] = useState<Record<string, TaskCondition[]>>({})
  const [newObstacleTitle, setNewObstacleTitle] = useState('')
  // P1-5: 阻碍编辑状态
  const [editingObstacleId, setEditingObstacleId] = useState<string | null>(null)
  const [editingObstacleTitle, setEditingObstacleTitle] = useState('')

  // ── 缺8：筛选/搜索工具栏状态 ─────────────────────────
  // #9: 筛选持久化 — 从 localStorage 初始化
  const [searchText, setSearchText] = useState('')
  // 防抖：搜索输入 300ms 后才触发 useMemo 重新计算，减少大列表过滤频率
  const debouncedSearchText = useDebounce(searchText, 300)
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    try { return localStorage.getItem(`gantt_filter_status_${id}`) || 'all' } catch { return 'all' }
  })
  const [filterPriority, setFilterPriority] = useState<string>(() => {
    try { return localStorage.getItem(`gantt_filter_priority_${id}`) || 'all' } catch { return 'all' }
  })
  const [filterCritical, setFilterCritical] = useState<boolean>(() => {
    try { return localStorage.getItem(`gantt_filter_critical_${id}`) === 'true' } catch { return false }
  })
  const [showFilterBar, setShowFilterBar] = useState(false)
  // #12: 专项工程筛选（持久化）
  const [filterSpecialty, setFilterSpecialty] = useState<string>(() => {
    try { return localStorage.getItem(`gantt_filter_specialty_${id}`) || 'all' } catch { return 'all' }
  })
  // 楼栋/分部筛选：选择某个顶层节点后只展示该子树
  const [filterBuilding, setFilterBuilding] = useState<string>('all')
  // ────────────────────────────────────────────────────

  // #4: 双栏布局 — 右侧详情面板
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // ── 缺7：行内进度编辑状态 ─────────────────────────────
  const [inlineProgressTaskId, setInlineProgressTaskId] = useState<string | null>(null)
  const [inlineProgressValue, setInlineProgressValue] = useState<number>(0)
  // #14: 行内任务名称编辑
  const [inlineTitleTaskId, setInlineTitleTaskId] = useState<string | null>(null)
  const [inlineTitleValue, setInlineTitleValue] = useState<string>('')
  // #15: 右键快捷菜单
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: Task } | null>(null)
  // ────────────────────────────────────────────────────

  // 版本冲突处理状态
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictData, setConflictData] = useState<{
    localVersion: Task
    serverVersion: Task
  } | null>(null)
  const [pendingTaskData, setPendingTaskData] = useState<Partial<Task> | null>(null)
  // AI 工期建议
  const [aiDurationLoading, setAiDurationLoading] = useState(false)
  const [aiDurationSuggestion, setAiDurationSuggestion] = useState<{
    estimated_duration: number
    confidence_level: string
    confidence_score: number
    factors: Record<string, unknown>
  } | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    start_date: '',
    end_date: '',
    progress: 0,
    assignee_name: '',
    responsible_unit: '',
    dependencies: [] as string[],
    parent_id: null as string | null,
    specialty_type: '' as string,          // #12
    reference_duration: '' as string,      // #7 计划工期
  })

  // ─── WBS 树形 ──────────────────────────────────────
  // P1-7: 新建任务后是否弹出条件询问
  const [newTaskConditionPromptId, setNewTaskConditionPromptId] = useState<string | null>(null)
  const wbsTree = useMemo(() => {
    const tree = buildWBSTree(tasks as Task[])
    assignWBSCode(tree)  // 缺4：自动生成 wbs_code
    return tree
  }, [tasks])
  const flatList = useMemo(() => flattenTree(wbsTree, collapsed), [wbsTree, collapsed])

  // ── 缺6：父级自动汇总子级进度 ─────────────────────────
  // 递归计算节点（含子节点）的平均进度
  const computeRolledProgress = useCallback((node: WBSNode): number => {
    if (node.children.length === 0) {
      return node.progress || 0
    }
    const childAvg = node.children.reduce((sum, c) => sum + computeRolledProgress(c), 0) / node.children.length
    return Math.round(childAvg)
  }, [])

  // 汇总进度 map：taskId -> rolledProgress
  const rolledProgressMap = useMemo(() => {
    const map: Record<string, number> = {}
    function walk(node: WBSNode) {
      map[node.id] = computeRolledProgress(node)
      node.children.forEach(walk)
    }
    wbsTree.forEach(walk)
    return map
  }, [wbsTree, computeRolledProgress])
  // ────────────────────────────────────────────────────

  // 楼栋列表：WBS 根节点（parent_id=null），用于筛选下拉
  const buildingOptions = useMemo(() => {
    return wbsTree.map(node => ({
      id: node.id,
      label: node.title || node.name || `楼栋-${node.wbs_code || node.id.slice(0, 6)}`
    }))
  }, [wbsTree])

  // 楼栋筛选：当选中某楼栋时，收集该节点及其所有子孙的 id 集合
  const buildingNodeIds = useMemo<Set<string>>(() => {
    if (filterBuilding === 'all') return new Set()
    const ids = new Set<string>()
    function collectIds(node: WBSNode) {
      ids.add(node.id)
      node.children.forEach(collectIds)
    }
    const root = wbsTree.find(n => n.id === filterBuilding)
    if (root) collectIds(root)
    return ids
  }, [filterBuilding, wbsTree])

  // ── 缺8：筛选后的列表 ────────────────────────────────
  const filteredFlatList = useMemo(() => {
    if (!debouncedSearchText && filterStatus === 'all' && filterPriority === 'all' && !filterCritical && filterSpecialty === 'all' && filterBuilding === 'all') {
      return flatList
    }
    const lowerSearch = debouncedSearchText.toLowerCase()
    return flatList.filter(node => {
      const task = node
      // 楼栋/分部筛选（只展示选中子树）
      if (filterBuilding !== 'all' && !buildingNodeIds.has(task.id)) return false
      // 关键字匹配（任务名/责任人）
      if (lowerSearch) {
        const name = (task.title || task.name || '').toLowerCase()
        const assignee = (task.assignee || task.assignee_name || '').toLowerCase()
        if (!name.includes(lowerSearch) && !assignee.includes(lowerSearch)) return false
      }
      // 状态筛选
      if (filterStatus !== 'all' && task.status !== filterStatus) return false
      // 优先级筛选
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false
      // 关键路径筛选
      if (filterCritical && !isOnCriticalPath(task.id)) return false
      // #12: 专项工程筛选
      if (filterSpecialty !== 'all' && task.specialty_type !== filterSpecialty) return false
      return true
    })
  }, [flatList, debouncedSearchText, filterStatus, filterPriority, filterCritical, filterSpecialty, filterBuilding, buildingNodeIds])

  const activeFilterCount = [
    debouncedSearchText ? 1 : 0,
    filterStatus !== 'all' ? 1 : 0,
    filterPriority !== 'all' ? 1 : 0,
    filterCritical ? 1 : 0,
    filterSpecialty !== 'all' ? 1 : 0,
    filterBuilding !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const clearAllFilters = () => {
    setSearchText('')
    setFilterStatus('all')
    setFilterPriority('all')
    setFilterCritical(false)
    setFilterSpecialty('all')
    setFilterBuilding('all')
    // #9: 清空持久化
    try {
      localStorage.removeItem(`gantt_filter_status_${id}`)
      localStorage.removeItem(`gantt_filter_priority_${id}`)
      localStorage.removeItem(`gantt_filter_critical_${id}`)
      localStorage.removeItem(`gantt_filter_specialty_${id}`)
    } catch { }
  }
  // ────────────────────────────────────────────────────

  // 全选判断
  const allSelected = flatList.length > 0 && flatList.every(n => selectedIds.has(n.id))
  const someSelected = flatList.some(n => selectedIds.has(n.id))
  // ────────────────────────────────────────────────────

  // CPM计算结果（考虑手动标记的关键任务）
  const cpmResult: CPMResult | null = useMemo(() => {
    if (tasks.length === 0) return null

    // 只有同时满足「有开始日期 + 有结束日期 + (有依赖关系 OR 被其他任务依赖)」的任务才参与 CPM 自动计算。
    // 缺少日期或完全孤立的任务浮动时间恒为 0，会误判为"关键"，故排除。
    const allDepIds = new Set(tasks.flatMap(t => t.dependencies || []))
    const cpmEligibleIds = new Set(
      tasks
        .filter(t =>
          t.start_date && t.end_date &&
          ((t.dependencies || []).length > 0 || allDepIds.has(t.id))
        )
        .map(t => t.id)
    )

    // 转换为CPM任务节点（仅合格任务）
    const taskNodes = tasks
      .filter(t => cpmEligibleIds.has(t.id))
      .map(t => {
        const taskName = t.title || t.name || ''
        const startDate = new Date(t.start_date!)
        const endDate = new Date(t.end_date!)
        // 使用inclusive计算：结束日-开始日+1，例如03/01到03/21=21天
        const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)

        return {
          id: t.id,
          name: taskName,
          duration,
          startDate,
          endDate,
          // 依赖关系也只保留合格任务之间的边
          dependencies: (t.dependencies || []).filter(d => cpmEligibleIds.has(d))
        }
      })

    // 如果符合条件的任务为空，只有手动标记的关键任务
    if (taskNodes.length === 0) {
      const manualCriticalIds = tasks.filter(t => t.is_critical).map(t => t.id)
      if (manualCriticalIds.length === 0) return null
      return {
        criticalPath: manualCriticalIds,
        criticalTasks: [],
        earliestStart: new Map(),
        earliestFinish: new Map(),
        latestStart: new Map(),
        latestFinish: new Map(),
        float: new Map(manualCriticalIds.map(id => [id, 0])),
        projectDuration: 0,
      }
    }

    // 自动计算CPM
    const autoCpm = calculateCPM(taskNodes, new Date())
    
    // 合并手动标记的关键任务
    const manualCriticalIds = tasks.filter(t => t.is_critical).map(t => t.id)
    const combinedCriticalPath = [...new Set([...autoCpm.criticalPath, ...manualCriticalIds])]
    
    return {
      ...autoCpm,
      criticalPath: combinedCriticalPath
    }
  }, [tasks])

  // 工具函数：日期加减
  function addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }

  const currentTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks])

  const scopedProjectConditions = useMemo(
    () => projectConditions.filter((condition) => condition.task_id && currentTaskIds.has(condition.task_id)),
    [currentTaskIds, projectConditions],
  )

  const scopedProjectObstacles = useMemo(
    () => projectObstacles.filter((obstacle) => obstacle.task_id && currentTaskIds.has(obstacle.task_id)),
    [currentTaskIds, projectObstacles],
  )

  const taskProgressSnapshot = useMemo(
    () => buildProjectTaskProgressSnapshot(tasks, scopedProjectConditions, scopedProjectObstacles),
    [scopedProjectConditions, scopedProjectObstacles, tasks],
  )

  useEffect(() => {
    if (!conditionTask) return

    setTaskConditions(
      scopedProjectConditions.filter((condition) => condition.task_id === conditionTask.id) as TaskCondition[],
    )
  }, [conditionTask, scopedProjectConditions])

  useEffect(() => {
    if (!obstacleTask) return

    setTaskObstacles(
      scopedProjectObstacles.filter((obstacle) => obstacle.task_id === obstacleTask.id) as TaskObstacle[],
    )
  }, [obstacleTask, scopedProjectObstacles])

  // 项目统计信息
  const projectStats = useMemo(() => {
    const criticalTaskCount = cpmResult ? cpmResult.criticalPath.length : 0
    // #10: AI 工期聚合
    const aiDurationTasks = tasks.filter(t => t.ai_duration && t.ai_duration > 0)
    const totalAiDuration = aiDurationTasks.reduce((sum, t) => sum + (t.ai_duration || 0), 0)
    const avgAiDuration = aiDurationTasks.length > 0 ? Math.round(totalAiDuration / aiDurationTasks.length) : 0
    
    return {
      totalTasks: taskProgressSnapshot.totalTasks,
      progressBaseTaskCount: taskProgressSnapshot.progressBaseTaskCount,
      completedTasks: taskProgressSnapshot.completedTaskCount,
      inProgressTasks: taskProgressSnapshot.inProgressTaskCount,
      overdueTask: taskProgressSnapshot.delayedTaskCount,
      avgProgress: taskProgressSnapshot.overallProgress,
      criticalTaskCount,
      blockedTasks: taskProgressSnapshot.activeObstacleTaskCount,
      pendingStartTasks: taskProgressSnapshot.pendingConditionTaskCount,
      readyToStartTasks: taskProgressSnapshot.readyToStartTaskCount,
      projectDuration: cpmResult ? cpmResult.projectDuration : 0,
      criticalPathSummary: cpmResult ? getCriticalPathSummary(cpmResult) : '',
      aiDurationTaskCount: aiDurationTasks.length,
      totalAiDuration,
      avgAiDuration,
    }
  }, [tasks, cpmResult, taskProgressSnapshot])

  // ── #1 业务状态计算 ──────────────────────────────────
  /**
   * 计算任务的业务状态（统一函数）
   * 优先级：已完成 > 受阻 > 待开工(条件未满足) > 可开工(条件已满足) > 进行中 > 未开始
   */
  const getBusinessStatus = useCallback((task: Task): {
    label: string
    cls: string
    badge?: { text: string; cls: string }
  } => {
    const condInfo = taskProgressSnapshot.taskConditionMap[task.id]
    const obstacleCount = taskProgressSnapshot.obstacleCountMap[task.id] || 0
    const businessStatus = getTaskBusinessStatus(task, {
      conditionSummary: condInfo,
      activeObstacleCount: obstacleCount,
    })
    const isOverdue = !isCompletedTask(task) && task.end_date && new Date(task.end_date) < new Date()

    switch (businessStatus.code) {
      case 'completed':
        return { label: businessStatus.label, cls: 'bg-emerald-100 text-emerald-700' }
      case 'blocked':
        return {
          label: businessStatus.label,
          cls: 'bg-amber-100 text-amber-700',
          badge: obstacleCount > 0 ? { text: `${obstacleCount}个阻碍`, cls: 'bg-amber-100 text-amber-700 border border-amber-200' } : undefined,
        }
      case 'in_progress':
        return {
          label: businessStatus.label,
          cls: 'bg-blue-100 text-blue-700',
          badge: isOverdue ? { text: `延期${Math.ceil((new Date().getTime() - new Date(task.end_date!).getTime()) / 86400000)}天`, cls: 'bg-red-100 text-red-700 border border-red-200' } : undefined,
        }
      case 'pending_conditions':
        return {
          label: businessStatus.label,
          cls: 'bg-orange-100 text-orange-700',
          badge: condInfo ? { text: `${condInfo.total - condInfo.satisfied}/${condInfo.total}条件未满足`, cls: 'bg-orange-100 text-orange-700 border border-orange-200' } : undefined,
        }
      case 'ready':
        return { label: businessStatus.label, cls: 'bg-emerald-100 text-emerald-700' }
      default:
        return {
          label: businessStatus.label,
          cls: 'bg-gray-100 text-gray-600',
          badge: isOverdue ? { text: `延期${Math.ceil((new Date().getTime() - new Date(task.end_date!).getTime()) / 86400000)}天`, cls: 'bg-red-100 text-red-700 border border-red-200' } : undefined,
        }
    }
  }, [taskProgressSnapshot])
  // ────────────────────────────────────────────────────

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks?projectId=${id}`, {
        headers: getAuthHeaders()
      })
      const json = await res.json()
      const data: Task[] = json.data || []
      // 按开始日期排序
      const sorted = [...data].sort((a, b) => {
        if (!a.start_date) return 1
        if (!b.start_date) return -1
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      })
      setTasks(sorted)
    } catch (error) {
      console.error('加载任务失败:', error)
    } finally {
      setLoading(false)
    }
  }, [id, setTasks])

  useEffect(() => {
    if (id) {
      loadTasks()
    }
  }, [id, loadTasks])

  const handleSaveTask = async () => {
    if (!formData.name.trim() || !id) {
      toast({ title: "请输入任务名称", variant: "destructive" })
      return
    }

    // 验证依赖任务的日期
    if (formData.dependencies && formData.dependencies.length > 0) {
      const newStartDate = formData.start_date ? new Date(formData.start_date) : null
      const newEndDate = formData.end_date ? new Date(formData.end_date) : null
      
      for (const depId of formData.dependencies) {
        const depTask = tasks.find(t => t.id === depId)
        if (!depTask) continue
        
        const depStartDate = depTask.start_date ? new Date(depTask.start_date) : null
        const depEndDate = depTask.end_date ? new Date(depTask.end_date) : null
        
        // 验证：任务的开始时间不能早于依赖任务的完成时间
        if (newStartDate && depEndDate && newStartDate < depEndDate) {
          toast({ 
            title: "日期冲突", 
            description: `依赖任务"${depTask.title || depTask.name}"完成于${depTask.end_date}，当前任务开始时间不能早于此时间`,
            variant: "destructive" 
          })
          return
        }
        
        // 验证：任务的开始时间不能早于依赖任务的开始时间（建议）
        if (newStartDate && depStartDate && newStartDate < depStartDate) {
          toast({ 
            title: "日期建议", 
            description: `依赖任务"${depTask.title || depTask.name}"开始于${depTask.start_date}，建议当前任务在此之后开始`,
          })
        }
      }
    }

    try {
      // ── 缺9修复：进度与状态联动 ──────────────────────
      let autoStatus = formData.status
      if (formData.progress >= 100 && formData.status !== 'completed') {
        autoStatus = 'completed'
      } else if (formData.progress === 0 && formData.status === 'completed') {
        autoStatus = 'todo'
      }
      // ────────────────────────────────────────────────

      // 字段映射：将表单字段转换为数据库字段
      const taskData: Partial<Task> = {
        title: formData.name,  // name -> title
        description: formData.description,
        status: autoStatus,
        priority: formData.priority,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        progress: formData.progress,
        assignee: formData.assignee_name,  // assignee_name -> assignee
        assignee_unit: formData.responsible_unit,  // responsible_unit -> assignee_unit
        dependencies: formData.dependencies || [],
        parent_id: formData.parent_id || null,
        project_id: id,
        updated_at: new Date().toISOString(),
        specialty_type: formData.specialty_type || null,  // #12
        reference_duration: formData.reference_duration ? Number(formData.reference_duration) : undefined,  // #7
        // #11: 首次填报时间 — 仅在进度从0变为>0时首次设置
        ...(formData.progress > 0 && editingTask && !editingTask.first_progress_at
          ? { first_progress_at: new Date().toISOString() }
          : {}),
      }

      if (editingTask) {
        const currentVersion = editingTask.version || 1
        const res = await fetch(`${API_BASE}/api/tasks/${editingTask.id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({ ...taskData, version: currentVersion }),
        })
        const json = await res.json()
        if (res.status === 409) {
          // 版本冲突：用服务器版本显示对话框
          const serverRes = await fetch(`${API_BASE}/api/tasks/${editingTask.id}`, {
            headers: getAuthHeaders()
          })
          const serverJson = await serverRes.json()
          setConflictData({
            localVersion: { ...editingTask, ...taskData } as unknown as Task,
            serverVersion: (serverJson.data || serverJson) as unknown as Task
          })
          setPendingTaskData(taskData)
          setConflictOpen(true)
        } else if (json.success) {
          updateTask(editingTask.id, json.data)
          toast({ title: "任务已更新" })
        } else {
          throw new Error(json.error?.message || '更新失败')
        }
      } else {
        console.log('[DEBUG] 创建任务，发送数据:', JSON.stringify(taskData, null, 2))
        const res = await fetch(`${API_BASE}/api/tasks`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify(taskData),
        })
        const json = await res.json()
        console.log('[DEBUG] 创建任务响应:', JSON.stringify(json, null, 2))
        if (!json.success) {
          const detail = json.error?.details || json.error?.message || '创建失败'
          throw new Error(detail)
        }
        const newTask = json.data as Task
        addTask(newTask as any)
        toast({ title: "任务已创建" })
        // P1-7: 新建任务后提示是否添加开工条件
        setNewTaskConditionPromptId(newTask.id)
      }

      setDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error('保存任务失败:', error)
      toast({ title: "保存失败: " + (error as Error).message, variant: "destructive" })
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    openConfirm('删除任务', '确定要删除这个任务吗？此操作不可撤销。', async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, { 
          method: 'DELETE',
          headers: getAuthHeaders()
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error?.message || '删除失败')
        deleteTask(taskId)
        toast({ title: "任务已删除" })
      } catch (error) {
        console.error('删除任务失败:', error)
        toast({ title: "删除失败", variant: "destructive" })
      }
    })
  }

  // 切换关键任务状态
  const handleToggleCritical = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const newCriticalStatus = !task.is_critical
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ is_critical: newCriticalStatus, version: task.version ?? 1 }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || '操作失败')
      const updatedTasks = tasks.map(t =>
        t.id === taskId ? { ...t, is_critical: newCriticalStatus } : t
      )
      setTasks(updatedTasks)
      toast({
        title: newCriticalStatus ? "已标记为关键任务" : "已取消关键任务标记",
        description: newCriticalStatus ? "该任务将显示在关键路径中" : ""
      })
    } catch (error) {
      console.error('更新关键任务状态失败:', error)
      toast({ title: "操作失败", variant: "destructive" })
    }
  }

  const handleStatusChange = async (taskId: string, val: string) => {
    const task = tasks.find(t => t.id === taskId)
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ status: val, updated_at: new Date().toISOString(), version: task?.version ?? 1 }),
    })
    const json = await res.json()
    if (json.success) {
      updateTask(taskId, { status: val as 'todo' | 'in_progress' | 'completed' })
      // #2: 状态变更时，若任务已逾期且变为 in_progress，自动记录延期
      if (task && val === 'in_progress' && task.end_date) {
        const now = new Date()
        const endDate = new Date(task.end_date)
        if (now > endDate) {
          const delayDays = Math.ceil((now.getTime() - endDate.getTime()) / 86400000)
          fetch(`${API_BASE}/api/task-delays`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            body: JSON.stringify({
              task_id: taskId,
              project_id: id,
              delay_days: delayDays,
              original_end_date: task.end_date,
              detected_at: now.toISOString(),
              reason: '手动标记开始时已逾期',
            }),
          }).catch(() => { /* 静默失败 */ })
        }
      }
      // #2: 状态变为 completed 时，若之前已逾期，记录实际完成延期天数
      if (task && val === 'completed' && task.end_date) {
        const now = new Date()
        const endDate = new Date(task.end_date)
        if (now > endDate) {
          const delayDays = Math.ceil((now.getTime() - endDate.getTime()) / 86400000)
          fetch(`${API_BASE}/api/task-delays`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            body: JSON.stringify({
              task_id: taskId,
              project_id: id,
              delay_days: delayDays,
              original_end_date: task.end_date,
              actual_end_date: now.toISOString().split('T')[0],
              detected_at: now.toISOString(),
              reason: '逾期完成',
            }),
          }).catch(() => { /* 静默失败 */ })
        }
      }
    }
  }

  const handlePriorityChange = async (taskId: string, val: string) => {
    const task = tasks.find(t => t.id === taskId)
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ priority: val, updated_at: new Date().toISOString(), version: task?.version ?? 1 }),
    })
    const json = await res.json()
    if (json.success) {
      updateTask(taskId, { priority: val as 'low' | 'medium' | 'high' | 'urgent' })
    }
  }

  const openEditDialog = (task?: Task, parentId?: string) => {
    if (task) {
      setEditingTask(task)
      setFormData({
        name: task.title || task.name || '',
        description: task.description || '',
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        start_date: task.start_date || '',
        end_date: task.end_date || '',
        progress: task.progress || 0,
        assignee_name: task.assignee_name || '',
        responsible_unit: task.responsible_unit || '',
        dependencies: task.dependencies || [],
        parent_id: task.parent_id || null,
        specialty_type: task.specialty_type || '',
        reference_duration: task.reference_duration != null ? String(task.reference_duration) : '',
      })
    } else {
      resetForm()
      if (parentId) {
        setFormData(prev => ({ ...prev, parent_id: parentId }))
      }
    }
    setNewTaskParentId(parentId || null)
    setDialogOpen(true)
  }

  // 处理依赖关系变更
  const handleDependencyChange = (taskId: string, checked: boolean) => {
    const currentDeps = formData.dependencies || []
    if (checked) {
      // 不能依赖自己
      if (taskId !== editingTask?.id) {
        setFormData({ ...formData, dependencies: [...currentDeps, taskId] })
      }
    } else {
      setFormData({ ...formData, dependencies: currentDeps.filter(id => id !== taskId) })
    }
  }

  const resetForm = () => {
    setEditingTask(null)
    setAiDurationSuggestion(null)
    setFormData({
      name: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      start_date: '',
      end_date: '',
      progress: 0,
      assignee_name: '',
      responsible_unit: '',
      dependencies: [],
      parent_id: null,
      specialty_type: '',
      reference_duration: '',
    })
    setNewTaskParentId(null)
  }

  // AI 工期建议（仅编辑已有任务时可用）
  const fetchAiDurationSuggestion = useCallback(async () => {
    if (!editingTask?.id || !id) return
    setAiDurationLoading(true)
    setAiDurationSuggestion(null)
    try {
      const res = await fetch(`${API_BASE}/api/ai-duration/estimate-duration`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          task_id: editingTask.id,
          project_id: id,
          historical_data: true,
        }),
      })
      const data = await res.json()
      if (data.success && data.data) {
        setAiDurationSuggestion({
          estimated_duration: data.data.estimated_duration,
          confidence_level: data.data.confidence_level,
          confidence_score: data.data.confidence_score,
          factors: data.data.factors || {},
        })
      } else {
        toast({ title: '暂无历史数据，AI 工期建议不可用', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'AI 工期建议获取失败', variant: 'destructive' })
    } finally {
      setAiDurationLoading(false)
    }
  }, [editingTask, id, toast])

  // 应用 AI 建议工期：从开始日期 + estimated_duration 天计算结束日期
  const applyAiDuration = useCallback(() => {
    if (!aiDurationSuggestion) return
    const start = formData.start_date ? new Date(formData.start_date) : new Date()
    const end = new Date(start.getTime() + aiDurationSuggestion.estimated_duration * 24 * 60 * 60 * 1000)
    const endStr = end.toISOString().split('T')[0]
    setFormData(prev => ({ ...prev, end_date: endStr }))
    toast({ title: `已应用 AI 建议工期：${aiDurationSuggestion.estimated_duration} 天` })
  }, [aiDurationSuggestion, formData.start_date, toast])

  // 版本冲突处理函数
  const handleKeepLocal = useCallback(async () => {
    if (!conflictData || !pendingTaskData || !editingTask) return

    // 强制保留本地版本：用服务器版本号 +1 提交
    const serverVersion = conflictData.serverVersion.version || 1
    const res = await fetch(`${API_BASE}/api/tasks/${editingTask.id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ ...pendingTaskData, version: serverVersion }),
    })
    const json = await res.json()
    if (json.success) {
      updateTask(editingTask.id, json.data)
    }
    toast({ title: "已保留您的修改" })
    setConflictOpen(false)
    setConflictData(null)
    setPendingTaskData(null)
  }, [conflictData, pendingTaskData, editingTask, updateTask])

  const handleKeepServer = useCallback(() => {
    if (!conflictData || !editingTask) return

    // 使用服务器版本，刷新本地状态
    updateTask(editingTask.id, conflictData.serverVersion)
    toast({ title: "已使用服务器版本" })

    setConflictOpen(false)
    setConflictData(null)
    setPendingTaskData(null)
    setDialogOpen(false)
    resetForm()
  }, [conflictData, editingTask, updateTask])

  const handleMerge = useCallback(() => {
    // 关闭冲突对话框，让用户在表单中手动合并
    setConflictOpen(false)
    toast({ title: "请手动合并不同之处", description: "服务器版本已加载到表单中" })
    // 可以在这里预填服务器版本的数据到表单，让用户对比修改
  }, [conflictData])

  // ─── 条件管理 ──────────────────────────────────────
  const openConditionDialog = async (task: Task) => {
    const nextConditions = scopedProjectConditions.filter(
      (condition) => condition.task_id === task.id,
    ) as TaskCondition[]

    setConditionTask(task)
    setConditionDialogOpen(true)
    setConditionsLoading(true)
    setNewConditionName('')
    setTaskConditions(nextConditions)
    try {
      // P2-9: 并发获取所有条件的前置任务（junction 表）
      const precedingTaskPromises = nextConditions.map(async (cond) => {
        try {
          const prRes = await fetch(`/api/task-conditions/${cond.id}/preceding-tasks`, {
            headers: getAuthHeaders()
          })
          const prJson = await prRes.json()
          return { conditionId: cond.id, tasks: prJson.data || [] }
        } catch {
          return { conditionId: cond.id, tasks: [] }
        }
      })
      const precedingTaskResults = await Promise.all(precedingTaskPromises)
      const ptMap: Record<string, Array<{task_id: string; title?: string; name?: string; status?: string}>> = {}
      for (const r of precedingTaskResults) {
        ptMap[r.conditionId] = r.tasks
      }
      setConditionPrecedingTasks(ptMap)
    } catch {
      toast({ title: '加载条件失败', variant: 'destructive' })
    } finally {
      setConditionsLoading(false)
    }
  }

  const handleAddCondition = async () => {
    if (!newConditionName.trim() || !conditionTask) return
    try {
      const body: Record<string, unknown> = {
        task_id: conditionTask.id,
        project_id: conditionTask.project_id, // P0-1: 修复缺少 project_id
        name: newConditionName.trim(),
        is_satisfied: false,
        condition_type: newConditionType,
      }
      if (newConditionTargetDate) body.target_date = newConditionTargetDate
      if (newConditionDescription.trim()) body.description = newConditionDescription.trim() // [G3]: 详细说明
      if (newConditionResponsibleUnit.trim()) body.responsible_unit = newConditionResponsibleUnit.trim() // [G3]: 责任单位
      const res = await fetch(`${API_BASE}/api/task-conditions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
        ...withCredentials(),
      })
      const json = await res.json()
      if (json.success) {
        const nextCondition = json.data as TaskCondition
        // P2-9: 如果是前置工序类型且选了多个前置任务，写入 junction 表
        if (newConditionType === 'preceding' && newConditionPrecedingTaskIds.length > 0) {
          await fetch(`${API_BASE}/api/task-conditions/${json.data.id}/preceding-tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ preceding_task_ids: newConditionPrecedingTaskIds }),
          })
        }
        setProjectConditions([...projectConditions, nextCondition] as any)
        setTaskConditions(prev => [...prev, nextCondition])
        setInlineConditionsMap(prev => {
          if (!conditionTask || !prev[conditionTask.id]) return prev
          return {
            ...prev,
            [conditionTask.id]: [...prev[conditionTask.id], nextCondition],
          }
        })
        setNewConditionName('')
        setNewConditionType('other')
        setNewConditionTargetDate('')
        setNewConditionDescription('')
        setNewConditionResponsibleUnit('')
        setNewConditionPrecedingTaskIds([])
      }
    } catch {
      toast({ title: '添加条件失败', variant: 'destructive' })
    }
  }

  const handleToggleCondition = async (cond: TaskCondition) => {
    try {
      const res = await fetch(`/api/task-conditions/${cond.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ is_satisfied: !cond.is_satisfied }),
        ...withCredentials(),
      })
      const json = await res.json()
      if (json.success) {
        const nextCondition = (json.data ?? { ...cond, is_satisfied: !cond.is_satisfied }) as TaskCondition
        setProjectConditions(
          projectConditions.map((item) => (item.id === cond.id ? { ...item, ...nextCondition } : item)) as any,
        )
        setTaskConditions(prev => prev.map(c => c.id === cond.id ? nextCondition : c))
        setInlineConditionsMap(prev => {
          if (!cond.task_id || !prev[cond.task_id]) return prev
          return {
            ...prev,
            [cond.task_id]: prev[cond.task_id].map((item) => (item.id === cond.id ? nextCondition : item)),
          }
        })
      }
    } catch {
      toast({ title: '更新条件失败', variant: 'destructive' })
    }
  }

  const handleDeleteCondition = async (condId: string) => {
    try {
      const res = await fetch(`/api/task-conditions/${condId}`, { method: 'DELETE', headers: getAuthHeaders() })
      const json = await res.json()
      if (json.success) {
        setProjectConditions(projectConditions.filter((condition) => condition.id !== condId) as any)
        setTaskConditions(prev => prev.filter(c => c.id !== condId))
        if (conditionTask) {
          setInlineConditionsMap(prev => {
            if (!prev[conditionTask.id]) return prev
            return {
              ...prev,
              [conditionTask.id]: prev[conditionTask.id].filter((condition) => condition.id !== condId),
            }
          })
        }
      }
    } catch {
      toast({ title: '删除条件失败', variant: 'destructive' })
    }
  }

  // ─── inline 条件面板 toggle（chip 点击）──────────────
  const toggleInlineConditions = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (expandedConditionTaskId === taskId) {
      setExpandedConditionTaskId(null)
      return
    }
    setExpandedConditionTaskId(taskId)
    if (!inlineConditionsMap[taskId]) {
      setInlineConditionsMap((prev) => ({
        ...prev,
        [taskId]: scopedProjectConditions.filter((condition) => condition.task_id === taskId) as TaskCondition[],
      }))
    }
  }

  // ─── 阻碍管理 ──────────────────────────────────────
  const openObstacleDialog = async (task: Task) => {
    setObstacleTask(task)
    setObstacleDialogOpen(true)
    setObstaclesLoading(true)
    setNewObstacleTitle('')
    try {
      setTaskObstacles(
        scopedProjectObstacles.filter((obstacle) => obstacle.task_id === task.id) as TaskObstacle[],
      )
    } catch {
      toast({ title: '加载阻碍失败', variant: 'destructive' })
    } finally {
      setObstaclesLoading(false)
    }
  }

  const handleAddObstacle = async () => {
    if (!newObstacleTitle.trim() || !obstacleTask) return
    try {
      const res = await fetch(`${API_BASE}/api/task-obstacles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ task_id: obstacleTask.id, project_id: id, title: newObstacleTitle.trim(), is_resolved: false }),
        ...withCredentials(),
      })
      const json = await res.json()
      if (json.success) {
        const nextObstacle = json.data as TaskObstacle
        setProjectObstacles([nextObstacle, ...projectObstacles] as any)
        setTaskObstacles(prev => [nextObstacle, ...prev])
        setNewObstacleTitle('')
      }
    } catch {
      toast({ title: '添加阻碍失败', variant: 'destructive' })
    }
  }

  const handleResolveObstacle = async (obs: TaskObstacle) => {
    try {
        const res = await fetch(`/api/task-obstacles/${obs.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ is_resolved: true }),
          ...withCredentials(),
        })
      const json = await res.json()
      if (json.success) {
        const nextObstacle = (json.data ?? { ...obs, is_resolved: true }) as TaskObstacle
        setProjectObstacles(
          projectObstacles.map((item) => (item.id === obs.id ? { ...item, ...nextObstacle } : item)) as any,
        )
        setTaskObstacles(prev => prev.map(o => o.id === obs.id ? nextObstacle : o))
        toast({ title: '阻碍已标记为已解决' })
      }
    } catch {
      toast({ title: '操作失败', variant: 'destructive' })
    }
  }

  // P0-4: 删除阻碍（只有已解决的才能删除）
  const handleDeleteObstacle = async (obsId: string) => {
    try {
      const res = await fetch(`/api/task-obstacles/${obsId}`, { method: 'DELETE', headers: getAuthHeaders() })
      const json = await res.json()
      if (json.success) {
        setProjectObstacles(projectObstacles.filter((obstacle) => obstacle.id !== obsId) as any)
        setTaskObstacles(prev => prev.filter(o => o.id !== obsId))
        toast({ title: '阻碍记录已删除' })
      }
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }

  // P1-5: 保存阻碍编辑
  const handleSaveObstacleEdit = async (obsId: string) => {
    if (!editingObstacleTitle.trim()) return
    try {
      const res = await fetch(`/api/task-obstacles/${obsId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ title: editingObstacleTitle.trim() }),
          ...withCredentials(),
        })
      const json = await res.json()
      if (json.success) {
        const nextObstacle = (json.data ?? { ...taskObstacles.find((item) => item.id === obsId), title: editingObstacleTitle.trim() }) as TaskObstacle
        setProjectObstacles(
          projectObstacles.map((item) => (item.id === obsId ? { ...item, ...nextObstacle } : item)) as any,
        )
        setTaskObstacles(prev => prev.map(o => o.id === obsId ? nextObstacle : o))
        setEditingObstacleId(null)
        setEditingObstacleTitle('')
        toast({ title: '阻碍已更新' })
      }
    } catch {
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }

  // ── 缺5：拖拽排序 sensors ─────────────────────────────
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // 找到拖拽项和目标项在 flatList 中的位置
    const activeIdx = flatList.findIndex(n => n.id === active.id)
    const overIdx = flatList.findIndex(n => n.id === over.id)
    if (activeIdx === -1 || overIdx === -1) return

    const activeNode = flatList[activeIdx]
    const overNode = flatList[overIdx]

    // 判断是否跨层级
    const isCrossLevel = activeNode.parent_id !== overNode.parent_id

    // 防止将任务拖拽到其自身的子孙节点（避免循环引用）
    const isDescendant = (nodeId: string, potentialAncestorId: string): boolean => {
      const node = tasks.find(t => t.id === nodeId)
      if (!node || !node.parent_id) return false
      if (node.parent_id === potentialAncestorId) return true
      return isDescendant(node.parent_id, potentialAncestorId)
    }
    if (isCrossLevel && isDescendant(overNode.id, activeNode.id)) {
      toast({ title: '无法移动', description: '不能将任务移动到其子任务下', variant: 'destructive' })
      return
    }

    // 目标层级中重新排列
    const newParentId = overNode.parent_id
    const targetSiblings = tasks.filter(t => (t.parent_id || null) === (newParentId || null) && t.id !== activeNode.id)
    const overPos = targetSiblings.findIndex(t => t.id === overNode.id)
    const insertAt = overPos === -1 ? targetSiblings.length : overPos

    const reordered = [...targetSiblings]
    reordered.splice(insertAt, 0, activeNode)

    // 更新 tasks：修改 activeNode 的 parent_id（如有变化）并更新 sort_order
    // otherTasks = 不属于目标层、且不是被拖动节点 的其他任务（保持不变）
    const otherTasks = tasks.filter(t =>
      (t.parent_id || null) !== (newParentId || null) && t.id !== activeNode.id
    )
    const updatedTasks = [
      ...otherTasks,
      ...reordered.map((t, i) => ({
        ...t,
        parent_id: newParentId,   // 跨层时同步更新 activeNode 的 parent_id
        sort_order: i,
        updated_at: new Date().toISOString()
      }))
    ]

    // 批量持久化（reordered 中的每个节点都统一使用 newParentId）
    reordered.forEach((t, i) => {
      fetch(`${API_BASE}/api/tasks/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_id: newParentId,
          sort_order: i,
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => { /* 拖拽排序持久化失败静默处理 */ })
    })
    setTasks(updatedTasks)
    toast({ title: isCrossLevel ? '已移动到新层级' : '排序已更新' })
  }, [flatList, tasks, setTasks])
  // ────────────────────────────────────────────────────
  const handleInlineProgressSave = useCallback(async (taskId: string, newProgress: number) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const prevProgress = task.progress ?? 0
    const autoStatus = (newProgress >= 100
      ? 'completed'
      : newProgress > 0 && task.status === 'todo'
      ? 'in_progress'
      : newProgress === 0 && task.status === 'completed'
      ? 'todo'
      : task.status) as 'todo' | 'in_progress' | 'completed'
    // #11: 首次填报时间 — 仅在进度首次从0变为>0时写入
    const now = new Date().toISOString()
    const firstProgressAt = (prevProgress === 0 && newProgress > 0 && !task.first_progress_at)
      ? now
      : task.first_progress_at
    const updated = {
      ...task,
      progress: newProgress,
      status: autoStatus,
      first_progress_at: firstProgressAt,
      updated_at: now,
    } as unknown as Task
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          progress: newProgress,
          status: autoStatus,
          first_progress_at: firstProgressAt,
          updated_at: now,
          version: task.version ?? 1,  // 防止 VERSION_MISMATCH
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || '更新失败')
      updateTask(updated.id!, {
        progress: newProgress,
        status: autoStatus,
        first_progress_at: firstProgressAt,
        updated_at: now,
      })
      setInlineProgressTaskId(null)

      // P0-2: 进度首次从0变为>0时，自动满足该任务所有未满足开工条件
      if (prevProgress === 0 && newProgress > 0) {
        try {
          const res = await fetch(`/api/task-conditions/batch-satisfy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId }),
          })
          const json = await res.json()
          if (json.success && json.count > 0) {
            toast({ title: `已自动满足 ${json.count} 个开工条件`, description: '任务已开工，条件自动关闭' })
            // 更新缓存
            setTaskConditionMap(prev => {
              const cur = prev[taskId]
              if (!cur) return prev
              return { ...prev, [taskId]: { total: cur.total, satisfied: cur.total } }
            })
          }
        } catch {
          // 静默处理：条件自动满足失败不影响进度保存
        }
      }
    } catch (err: any) {
      const msg = err?.message || '未知错误'
      if (msg.includes('VERSION_MISMATCH')) {
        // 版本冲突：自动用最新数据重试一次
        try {
          const refetch = await fetch(`${API_BASE}/api/tasks/${taskId}`)
          const refetchJson = await refetch.json()
          if (refetchJson.success && refetchJson.data) {
            const latestVersion = refetchJson.data.version ?? 1
            const retryRes = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                progress: newProgress,
                status: autoStatus,
                first_progress_at: firstProgressAt,
                updated_at: now,
                version: latestVersion,
              }),
            })
            const retryJson = await retryRes.json()
            if (retryJson.success) {
              updateTask(updated.id!, {
                progress: newProgress,
                status: autoStatus,
                first_progress_at: firstProgressAt,
                updated_at: now,
                version: latestVersion + 1,
              })
              setInlineProgressTaskId(null)
              toast({ title: '进度已更新' })
              return
            }
          }
        } catch { /* 重试失败，走下方通用错误 */ }
        toast({ title: '数据已变更，请刷新页面后重试', variant: 'destructive' })
      } else {
        toast({ title: '更新进度失败', description: msg, variant: 'destructive' })
      }
    }
  }, [tasks, updateTask])
  // ────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────

  // #14: 行内任务名称保存
  const handleInlineTitleSave = useCallback(async (taskId: string) => {
    const trimmed = inlineTitleValue.trim()
    if (!trimmed) { setInlineTitleTaskId(null); return }
    const task = tasks.find(t => t.id === taskId)
    if (!task || trimmed === (task.title || task.name)) { setInlineTitleTaskId(null); return }
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed, updated_at: new Date().toISOString(), version: task.version ?? 1 }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || '更新失败')
      updateTask(taskId, { title: trimmed, updated_at: new Date().toISOString() } as any)
      toast({ title: '任务名称已更新' })
    } catch {
      toast({ title: '更新失败', variant: 'destructive' })
    }
    setInlineTitleTaskId(null)
  }, [inlineTitleValue, tasks, updateTask])
  const toggleCollapse = (nodeId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      // #13: 展开状态记忆 — 持久化到 localStorage
      try { localStorage.setItem(`gantt_collapsed_${id}`, JSON.stringify([...next])) } catch { }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(flatList.map(n => n.id)))
    }
  }

  const toggleSelect = (nodeId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const handleBatchComplete = async () => {
    if (selectedIds.size === 0) return
    const alreadyDone = [...selectedIds].filter(tid => tasks.find(t => t.id === tid)?.status === 'completed').length
    const toComplete = selectedIds.size - alreadyDone
    try {
      await Promise.all([...selectedIds].map(tid => {
        const task = tasks.find(t => t.id === tid)
        return fetch(`${API_BASE}/api/tasks/${tid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            status: 'completed', 
            progress: 100, 
            updated_at: new Date().toISOString(),
            version: task?.version ?? 1 
          }),
        })
      }))
      for (const tid of selectedIds) {
        updateTask(tid, { status: 'completed', progress: 100 })
      }
      toast({
        title: `已完成 ${toComplete} 个任务`,
        description: alreadyDone > 0 ? `其中 ${alreadyDone} 个已是完成状态` : undefined
      })
      setSelectedIds(new Set())
    } catch (e: any) {
      // 处理版本冲突错误
      if (e.message && e.message.includes('VERSION_MISMATCH')) {
        toast({ 
          title: '版本冲突', 
          description: '部分任务已被其他用户修改，请刷新后重试',
          variant: 'destructive' 
        })
      } else {
        toast({ title: '批量操作失败', variant: 'destructive' })
      }
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    openConfirm('批量删除任务', `确定要删除选中的 ${selectedIds.size} 个任务吗？此操作不可撤销。`, async () => {
      try {
        await Promise.all([...selectedIds].map(tid =>
          fetch(`${API_BASE}/api/tasks/${tid}`, { method: 'DELETE' })
        ))
        for (const tid of selectedIds) {
          deleteTask(tid)
        }
        toast({ title: `已删除 ${selectedIds.size} 个任务` })
        setSelectedIds(new Set())
      } catch (e) {
        toast({ title: '批量删除失败', variant: 'destructive' })
      }
    })
  }

  // ────────────────────────────────────────────────────

  // 判断任务是否在关键路径上
  const isOnCriticalPath = (taskId: string): boolean => {
    if (!cpmResult) return false
    return isCriticalTask(taskId, cpmResult)
  }

  // 获取任务的浮动时间
  const getTaskFloat = (taskId: string): number => {
    if (!cpmResult) return 0
    return cpmResult.float.get(taskId) || 0
  }

  if (loading) {
    return (
      <div className="p-6">
        <GanttViewSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      {/* 面包屑导航（N07/N08） */}
      {currentProject && (
        <Breadcrumb items={[
          { label: '公司驾驶舱', href: '/company' },
          { label: currentProject.name, href: `/projects/${id}/dashboard` },
          { label: '任务管理', href: `/projects/${id}/gantt` },
          { label: '任务列表' },
        ]} />
      )}
      <PageHeader
        eyebrow="任务管理"
        title="任务管理 / 任务列表"
        subtitle="承接任务录入、WBS 结构和执行维护；任务总结作为复盘子页独立承接。"
      >
        <Button variant="ghost" onClick={() => navigate(`/projects/${id}/dashboard`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          项目 Dashboard
        </Button>
        <Button variant="outline" onClick={() => navigate(`/projects/${id}/task-summary`)}>
          <BarChart2 className="mr-2 h-4 w-4" />
          任务总结
        </Button>
        <Button variant="outline" onClick={() => navigate(`/projects/${id}/reports?view=wbs`)}>
          <BarChart2 className="mr-2 h-4 w-4" />
          WBS完成度分析
        </Button>
        <Button onClick={() => openEditDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          新建任务
        </Button>
      </PageHeader>

      {/* 统计卡片 6项 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">总任务数</p>
            <p className="text-2xl font-bold">{projectStats.totalTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">已完成</p>
            <p className="text-2xl font-bold text-emerald-600">{projectStats.completedTasks}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {projectStats.progressBaseTaskCount > 0 ? Math.round(projectStats.completedTasks / projectStats.progressBaseTaskCount * 100) : 0}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">平均进度</p>
            <p className="text-2xl font-bold text-blue-600">{projectStats.avgProgress}%</p>
            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${projectStats.avgProgress}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">延期任务</p>
            <p className={`text-2xl font-bold ${projectStats.overdueTask > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {projectStats.overdueTask}
            </p>
            {projectStats.overdueTask > 0 && (
              <p className="text-xs text-red-500 mt-0.5">需跟进</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">受阻任务</p>
            <p className={`text-2xl font-bold ${projectStats.blockedTasks > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {projectStats.blockedTasks}
            </p>
            {projectStats.blockedTasks > 0 && (
              <p className="text-xs text-amber-500 mt-0.5">需处理</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">条件未满足任务</p>
            <p className={`text-2xl font-bold ${projectStats.pendingStartTasks > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
              {projectStats.pendingStartTasks}
            </p>
            {projectStats.readyToStartTasks > 0 && (
              <p className="text-xs text-green-600 mt-0.5">可开工 {projectStats.readyToStartTasks}</p>
            )}
          </CardContent>
        </Card>
        {/* #10: AI工期聚合卡片（有AI工期数据时才显示） */}
        {projectStats.aiDurationTaskCount > 0 && (
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">AI推荐工期</p>
              <p className="text-2xl font-bold text-purple-600">{projectStats.totalAiDuration}d</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {projectStats.aiDurationTaskCount} 个任务 · 均{projectStats.avgAiDuration}d
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 批量操作栏 */}
      <div className="px-1 py-2.5 bg-gray-50 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
              onChange={toggleSelectAll}
            />
            <span className="text-sm text-gray-600">全选</span>
          </label>
          {selectedIds.size > 0 && (
            <span className="text-sm text-gray-500">已选 {selectedIds.size} 项</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBatchComplete}
            disabled={selectedIds.size === 0}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
            </svg>
            批量完成
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={selectedIds.size === 0}
            className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            批量删除
          </button>
        </div>
      </div>

      {/* WBS 任务树形结构 + #4双栏布局详情面板 */}
      <div className={`flex gap-4 items-start transition-all duration-300 ${selectedTask ? '' : ''}`}>
        {/* 左侧：WBS任务列表 */}
        <div className={`transition-all duration-300 ${selectedTask ? 'flex-1 min-w-0' : 'w-full'}`}>
      {/* WBS 任务树形结构 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">WBS 结构</CardTitle>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                {filteredFlatList.length}/{flatList.length} 条
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {projectStats.criticalPathSummary && (
              <p className="text-xs text-muted-foreground">
                关键路径: {projectStats.criticalPathSummary}
              </p>
            )}
            {/* 缺8：筛选入口 */}
            <button
              onClick={() => setShowFilterBar(v => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${showFilterBar || activeFilterCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              筛选{activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-blue-600 h-7"
              onClick={() => navigate(`/projects/${id}/wbs-templates`)}
            >
              <LayoutTemplate className="mr-1 h-3.5 w-3.5" />
              从模板生成
            </Button>
          </div>
        </CardHeader>

        {/* 筛选工具栏（展开时显示） */}
        {showFilterBar && (
          <div className="px-4 py-3 border-b bg-gray-50/80 flex flex-wrap items-center gap-2">
            {/* 关键字搜索 */}
            <div className="relative flex-1 min-w-[180px] max-w-[260px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索任务名/责任人..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 text-sm border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {searchText && (
                <button onClick={() => setSearchText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* 状态筛选 */}
            <select
              value={filterStatus}
              onChange={e => {
                setFilterStatus(e.target.value)
                try { localStorage.setItem(`gantt_filter_status_${id}`, e.target.value) } catch { }
              }}
              className={`text-sm border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${filterStatus !== 'all' ? 'border-blue-400 text-blue-700' : 'text-gray-600'}`}
            >
              <option value="all">全部状态</option>
              <option value="todo">待办</option>
              <option value="in_progress">进行中</option>
              <option value="completed">已完成</option>
              <option value="blocked">受阻</option>
            </select>
            {/* 优先级筛选 */}
            <select
              value={filterPriority}
              onChange={e => {
                setFilterPriority(e.target.value)
                try { localStorage.setItem(`gantt_filter_priority_${id}`, e.target.value) } catch { }
              }}
              className={`text-sm border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${filterPriority !== 'all' ? 'border-blue-400 text-blue-700' : 'text-gray-600'}`}
            >
              <option value="all">全部优先级</option>
              <option value="high">高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            {/* 关键路径筛选 */}
            <button
              onClick={() => {
                setFilterCritical(v => {
                  try { localStorage.setItem(`gantt_filter_critical_${id}`, String(!v)) } catch { }
                  return !v
                })
              }}
              className={`flex items-center gap-1 text-sm px-2.5 py-1.5 border rounded-md transition-colors ${filterCritical ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              仅关键路径
            </button>
            {/* #12: 专项工程筛选 */}
            <select
              value={filterSpecialty}
              onChange={e => {
                setFilterSpecialty(e.target.value)
                try { localStorage.setItem(`gantt_filter_specialty_${id}`, e.target.value) } catch { }
              }}
              className={`text-sm border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400 ${filterSpecialty !== 'all' ? 'border-purple-300 text-purple-700 bg-purple-50' : 'border-purple-200 text-purple-600'}`}
            >
              <option value="all">全部专项</option>
              {SPECIALTY_TYPES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {/* 楼栋/分部筛选（WBS 根节点） */}
            {buildingOptions.length > 1 && (
              <select
                value={filterBuilding}
                onChange={e => setFilterBuilding(e.target.value)}
                className={`text-sm border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${filterBuilding !== 'all' ? 'border-blue-400 text-blue-700' : 'text-gray-600'}`}
              >
                <option value="all">全部楼栋</option>
                {buildingOptions.map(b => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            )}
            {/* 清空 / 重置 / 应用 */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={clearAllFilters}
                className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                重置筛选
              </button>
              <button
                onClick={() => setShowFilterBar(false)}
                className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                应用筛选
              </button>
            </div>
          </div>
        )}
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无任务</p>
              <Button className="mt-4" onClick={() => openEditDialog()}>
                添加第一个任务
              </Button>
            </div>
          ) : filteredFlatList.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">没有匹配的任务</p>
              <button onClick={clearAllFilters} className="mt-2 text-xs text-blue-500 hover:underline">清空筛选条件</button>
            </div>
          ) : (
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filteredFlatList.map(n => n.id)} strategy={verticalListSortingStrategy}>
                <div className="divide-y">
                  {filteredFlatList.map(node => {
                const task = node
                const isOverdue = task.status !== 'completed' && task.end_date && new Date(task.end_date) < new Date()
                const hasChildren = node.children.length > 0
                const isCollapsed = collapsed.has(node.id)
                const indentPx = node.depth * 24

                // #1: 业务状态（统一计算）
                const bizStatus = getBusinessStatus(task)

                // 进度条颜色
                const progressColor = task.status === 'completed'
                  ? 'bg-emerald-500'
                  : isOverdue ? 'bg-red-500'
                  : task.status === 'in_progress' ? 'bg-blue-500'
                  : task.status === 'blocked' ? 'bg-amber-500'
                  : 'bg-gray-300'

                // #2: 延期天数
                const overdueDays = isOverdue && task.end_date
                  ? Math.ceil((new Date().getTime() - new Date(task.end_date).getTime()) / 86400000)
                  : 0

                const fmtShort = (d?: string | null) => {
                  if (!d) return null
                  const dt = new Date(d)
                  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
                }

                return (
                  <SortableTaskRowWrapper key={task.id} id={task.id}>
                  <div
                    id={`gantt-task-row-${task.id}`}
                    className={`flex items-center px-4 py-2.5 group hover:bg-accent/30 transition-colors ${
                      task.status === 'blocked'
                        ? 'border-l-4 border-l-amber-400 bg-amber-50/50'
                        : isOverdue
                        ? 'border-l-4 border-l-red-400 bg-red-50/30'
                        : ''
                    }`}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY, task })
                    }}
                  >
                    {/* 复选框 */}
                    <div className="flex-shrink-0 w-6" style={{ marginLeft: `${indentPx}px` }}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-300"
                        checked={selectedIds.has(task.id)}
                        onChange={() => toggleSelect(task.id)}
                      />
                    </div>

                    {/* 折叠/展开按钮 */}
                    <div className="flex-shrink-0 w-5 mr-1">
                      {hasChildren ? (
                        <button
                          onClick={() => toggleCollapse(node.id)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {isCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5" />
                            : <ChevronDown className="h-3.5 w-3.5" />
                          }
                        </button>
                      ) : (
                        <span className="inline-block w-3.5" />
                      )}
                    </div>

                    {/* 旗帜图标：设置里程碑 */}
                    <button
                      title={task.is_milestone ? `${MILESTONE_LEVEL_CONFIG[task.milestone_level ?? 1]?.label}（点击修改）` : '设为里程碑'}
                      onClick={(e) => {
                        e.stopPropagation()
                        setMilestoneTargetTask(task)
                        setMilestoneDialogOpen(true)
                      }}
                      className={`flex-shrink-0 p-0.5 rounded transition-colors hover:bg-accent mr-1.5 ${
                        task.is_milestone
                          ? MILESTONE_LEVEL_CONFIG[task.milestone_level ?? 1]?.color
                          : 'text-gray-300 hover:text-gray-500'
                      }`}
                    >
                      <Flag className="h-3.5 w-3.5" fill={task.is_milestone ? 'currentColor' : 'none'} />
                    </button>

                    {/* 任务名称区域 */}
                    <div
                      className="flex-1 min-w-0 flex items-center gap-1.5 mr-3 cursor-pointer"
                      onClick={() => setSelectedTask(prev => prev?.id === task.id ? null : task)}
                    >
                      {/* #5: WBS层级图标 */}
                      {(() => {
                        const iconInfo = getWBSNodeIcon(node)
                        if (iconInfo.icon === 'folder') return (
                          <svg className={`flex-shrink-0 h-3.5 w-3.5 ${iconInfo.cls}`} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
                          </svg>
                        )
                        if (iconInfo.icon === 'folder-open') return (
                          <svg className={`flex-shrink-0 h-3.5 w-3.5 ${iconInfo.cls}`} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"/>
                          </svg>
                        )
                        return (
                          <svg className={`flex-shrink-0 h-3.5 w-3.5 ${iconInfo.cls}`} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                          </svg>
                        )
                      })()}
                      {/* 缺4：WBS编码显示 */}
                      {task.wbs_code && (
                        <span className="flex-shrink-0 text-[10px] tabular-nums text-gray-400 font-mono min-w-[24px]">
                          {task.wbs_code}
                        </span>
                      )}
                      {/* #14: 行内编辑任务名（双击进入编辑模式） */}
                      {inlineTitleTaskId === task.id ? (
                        <input
                          type="text"
                          value={inlineTitleValue}
                          onChange={e => setInlineTitleValue(e.target.value)}
                          onBlur={() => handleInlineTitleSave(task.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleInlineTitleSave(task.id)
                            if (e.key === 'Escape') setInlineTitleTaskId(null)
                          }}
                          autoFocus
                          className="text-sm font-medium w-40 border-b border-blue-400 bg-transparent outline-none px-0.5 py-0 text-gray-800"
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <button
                          onClick={() => openEditDialog(task)}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setInlineTitleTaskId(task.id)
                            setInlineTitleValue(task.title || task.name || '')
                          }}
                          className={`text-sm font-medium truncate max-w-[200px] text-left hover:text-blue-600 transition-colors ${
                            isOnCriticalPath(task.id) ? 'text-red-700'
                            : task.status === 'blocked' ? 'text-amber-700'
                            : isOverdue ? 'text-red-600'
                            : task.status === 'completed' ? 'text-gray-400 line-through'
                            : 'text-gray-800'
                          }`}
                          title="单击打开编辑，双击快速改名"
                        >
                          {task.title || task.name}
                        </button>
                      )}

                      {/* ── #1 业务状态 badge（待开工/可开工/阻碍说明/延期天数）─── */}
                      {bizStatus.badge && (
                        <span className={`flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${bizStatus.badge.cls}`}>
                          {bizStatus.badge.text}
                        </span>
                      )}
                      {/* #2: 延期天数（进行中/未开始均显示，bizStatus.badge 没有时补充显示） */}
                      {overdueDays > 0 && !bizStatus.badge && (
                        <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                          延期{overdueDays}天
                        </span>
                      )}
                      {/* ─────────────────────────────────────────────────── */}

                      {/* 条件 chip：有条件时常驻显示，点击展开 inline 面板 */}
                      {(() => {
                        const cond = taskProgressSnapshot.taskConditionMap[task.id]
                        if (!cond || cond.total === 0) return null
                        const allSatisfied = cond.satisfied >= cond.total
                        const isExpanded = expandedConditionTaskId === task.id
                        return (
                          <button
                            onClick={e => toggleInlineConditions(task.id, e)}
                            className={`flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                              isExpanded
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                : allSatisfied
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
                            }`}
                            title={`开工条件 ${cond.satisfied}/${cond.total}，点击展开详情`}
                          >
                            <ShieldCheck className="h-2.5 w-2.5" />
                            {cond.satisfied}/{cond.total}
                            {isExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                          </button>
                        )
                      })()}

                      {/* 阻碍 chip：有未解决阻碍时显示 */}
                      {(() => {
                        const cnt = taskProgressSnapshot.obstacleCountMap[task.id] || 0
                        if (cnt === 0) return null
                        return (
                          <span
                            className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
                            title={`${cnt} 个未解决阻碍，点击操作按钮管理`}
                          >
                            <AlertOctagon className="h-2.5 w-2.5" />
                            阻碍{cnt}
                          </span>
                        )
                      })()}

                      {isOnCriticalPath(task.id) && (
                        <span
                          className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 cursor-help"
                          title={`关键任务 · 浮动时间: ${getTaskFloat(task.id)}天`}
                        >
                          关键 +{getTaskFloat(task.id)}d
                        </span>
                      )}
                    </div>

                    {/* 状态（下拉选择，显示业务状态标签） */}
                    <div className="flex-shrink-0 w-20">
                      <Select value={task.status || 'todo'} onValueChange={(val) => handleStatusChange(task.id, val)}>
                        <SelectTrigger className="h-7 border-0 bg-transparent p-0 shadow-none focus:ring-0 w-full">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bizStatus.cls}`}>
                            {bizStatus.label}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">未开始</SelectItem>
                          <SelectItem value="in_progress">进行中</SelectItem>
                          <SelectItem value="completed">已完成</SelectItem>
                          <SelectItem value="blocked">受阻</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 进度 — 缺6汇总显示 + 缺7行内滑动条 */}
                    <div className="flex-shrink-0 w-32 px-3">
                      {inlineProgressTaskId === task.id ? (
                        // 行内编辑模式
                        <div className="flex items-center gap-1.5" onBlur={() => handleInlineProgressSave(task.id, inlineProgressValue)}>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={inlineProgressValue}
                            onChange={e => setInlineProgressValue(Number(e.target.value))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleInlineProgressSave(task.id, inlineProgressValue)
                              if (e.key === 'Escape') setInlineProgressTaskId(null)
                            }}
                            className="flex-1 h-1.5 accent-blue-500"
                            autoFocus
                          />
                          <span className="text-xs font-medium w-7 text-right tabular-nums text-blue-600">{inlineProgressValue}%</span>
                        </div>
                      ) : (
                        // 普通显示模式（点击进入编辑）
                        <div
                          className="flex items-center gap-1.5 cursor-pointer group/prog"
                          title={hasChildren ? `汇总进度: ${rolledProgressMap[task.id] || 0}%（点击编辑实际进度: ${task.progress || 0}%）` : '点击快速编辑进度'}
                          onClick={() => {
                            setInlineProgressTaskId(task.id)
                            setInlineProgressValue(task.progress || 0)
                          }}
                        >
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${progressColor}`}
                              style={{ width: `${hasChildren ? rolledProgressMap[task.id] : (task.progress || 0)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-7 text-right tabular-nums text-gray-600 group-hover/prog:text-blue-500">
                            {hasChildren ? rolledProgressMap[task.id] : (task.progress || 0)}%{hasChildren && <span className="text-[10px] text-purple-500 ml-0.5" title="父级汇总进度">↑</span>}
                          </span>
                          {/* #18: 父子进度差异提示 */}
                          {hasChildren && task.progress !== undefined && task.progress !== rolledProgressMap[task.id] && (
                            <span
                              className="text-[10px] text-amber-500"
                              title={`手填进度(${task.progress}%) ≠ 子任务汇总进度(${rolledProgressMap[task.id]}%)，以汇总值显示`}
                            >!</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 责任人 */}
                    <div className="flex-shrink-0 w-20 text-xs text-gray-600 truncate" title={task.assignee_name || ''}>
                      {task.assignee_name || <span className="text-muted-foreground/40">—</span>}
                    </div>

                    {/* 日期 */}
                    <div className="flex-shrink-0 w-28 text-xs text-gray-500 tabular-nums">
                      {fmtShort(task.start_date) && fmtShort(task.end_date)
                        ? <span>{fmtShort(task.start_date)} ~ <span className={isOverdue ? 'text-red-600 font-medium' : ''}>{fmtShort(task.end_date)}</span></span>
                        : fmtShort(task.start_date) || fmtShort(task.end_date)
                        ? <span>{fmtShort(task.start_date) || fmtShort(task.end_date)}</span>
                        : <span className="text-muted-foreground/40 italic">待定</span>
                      }
                    </div>

                    {/* #7: 工期对比列 */}
                    {(() => {
                      const planDays = task.reference_duration
                      const actualDays = (task.start_date && task.end_date)
                        ? Math.max(1, Math.ceil((new Date(task.end_date).getTime() - new Date(task.start_date).getTime()) / 86400000) + 1)
                        : null
                      const aiDays = task.ai_duration
                      const hasDuration = planDays || actualDays || aiDays
                      if (!hasDuration) return (
                        <div className="flex-shrink-0 w-24 text-xs text-muted-foreground/30 tabular-nums text-center">—</div>
                      )
                      const diffColor = (planDays && actualDays)
                        ? actualDays > planDays ? 'text-red-600' : actualDays < planDays ? 'text-emerald-600' : 'text-gray-500'
                        : 'text-gray-500'
                      return (
                        <div className="flex-shrink-0 w-24 text-xs tabular-nums flex flex-col gap-0.5">
                          {planDays && (
                            <span className="text-gray-500" title="计划工期">计划{planDays}d</span>
                          )}
                          {actualDays && (
                            <span className={diffColor} title="实际/排期工期">
                              实际{actualDays}d{planDays && actualDays !== planDays ? (actualDays > planDays ? ' ↑' : ' ↓') : ''}
                            </span>
                          )}
                          {aiDays && (
                            <span className="text-purple-500" title="AI推荐工期">AI{aiDays}d</span>
                          )}
                        </div>
                      )
                    })()}

                    {/* #17: 关键路径浮动时间 badge */}
                    {cpmResult && !hasChildren && (() => {
                      const f = getTaskFloat(task.id)
                      if (isOnCriticalPath(task.id)) {
                        return (
                          <span
                            className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium tabular-nums"
                            title="关键任务：无缓冲时间，延期会直接影响项目工期"
                          >关键</span>
                        )
                      }
                      if (f > 0) {
                        return (
                          <span
                            className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 tabular-nums"
                            title={`浮动时间 ${f} 天：此任务可延迟最多 ${f} 天而不影响项目工期`}
                          >缓冲{f}d</span>
                        )
                      }
                      return null
                    })()}

                    {/* 操作按钮（hover显示） */}
                    <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      {/* 条件管理（缺2修复） */}
                      <button
                        title="开工条件管理"
                        onClick={() => openConditionDialog(task)}
                        className="p-1.5 hover:bg-green-50 rounded text-gray-300 hover:text-green-600 transition-colors"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </button>
                      {/* 阻碍管理（缺3修复） */}
                      <button
                        title="阻碍记录"
                        onClick={() => openObstacleDialog(task)}
                        className="p-1.5 hover:bg-amber-50 rounded text-gray-300 hover:text-amber-600 transition-colors"
                      >
                        <AlertOctagon className="h-3.5 w-3.5" />
                      </button>
                      {/* 添加子任务 */}
                      <button
                        title="添加子任务"
                        onClick={() => openEditDialog(undefined, task.id)}
                        className="p-1.5 hover:bg-blue-50 rounded text-blue-400 hover:text-blue-600 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      {/* 编辑 */}
                      <button
                        title="编辑任务"
                        onClick={() => openEditDialog(task)}
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                      </button>
                      {/* 删除 */}
                      <button
                        title="删除任务"
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {/* #16: 查看总结（仅完成态显示） */}
                      {task.status === 'completed' && (
                        <button
                          title="查看任务完成总结"
                          onClick={() => navigate(`/projects/${id}/task-summary?highlight=${task.id}`)}
                          className="p-1.5 hover:bg-orange-50 rounded text-gray-300 hover:text-orange-500 transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── inline 条件面板（chip 展开后显示）─── */}
                  {expandedConditionTaskId === task.id && (() => {
                    const list = inlineConditionsMap[task.id]
                    return (
                      <div
                        className="mx-4 mb-2 rounded-xl border border-green-100 bg-green-50/60 p-3"
                        style={{ marginLeft: `${indentPx + 16}px` }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-green-700 flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            开工条件
                          </span>
                          <button
                            onClick={e => toggleInlineConditions(task.id, e)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >收起</button>
                        </div>
                        {!list ? (
                          <div className="text-xs text-gray-400 py-1">加载中...</div>
                        ) : list.length === 0 ? (
                          <div className="text-xs text-gray-400 py-1">暂无条件记录</div>
                        ) : (
                          <div className="space-y-1.5">
                            {list.map(c => {
                              const typeInfo = CONDITION_TYPES.find(t => t.value === c.condition_type)
                              return (
                                <div key={c.id} className="flex items-center gap-1.5 text-xs">
                                  {c.is_satisfied
                                    ? <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                                    : <XCircle className="h-3 w-3 text-orange-400 flex-shrink-0" />
                                  }
                                  <span className={c.is_satisfied ? 'text-gray-400 line-through' : 'text-gray-700'}>{c.name}</span>
                                  {typeInfo && (
                                    <span className={`px-1 py-0.5 rounded text-[10px] ${typeInfo.color}`}>{typeInfo.label}</span>
                                  )}
                                  {c.target_date && (
                                    <span className="text-gray-400 ml-auto">{c.target_date}</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); openConditionDialog(task) }}
                          className="mt-2 text-xs text-green-600 hover:text-green-800 hover:underline"
                        >
                          管理条件 →
                        </button>
                      </div>
                    )
                  })()}
                  </SortableTaskRowWrapper>
                )
              })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>
        </div>{/* 左侧列表结束 */}

        {/* #4: 右侧详情面板（selectedTask 有值时显示） */}
        {selectedTask && (
          <div className="w-80 flex-shrink-0 sticky top-4">
            <Card className="rounded-xl shadow-sm border-gray-100">
              <CardHeader className="pb-3 border-b flex flex-row items-start justify-between space-y-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {selectedTask.is_milestone && (
                      <Flag className={`h-3.5 w-3.5 flex-shrink-0 ${MILESTONE_LEVEL_CONFIG[selectedTask.milestone_level ?? 1]?.color}`} fill="currentColor" />
                    )}
                    <CardTitle className="text-sm font-semibold truncate">{selectedTask.title || selectedTask.name}</CardTitle>
                  </div>
                  {selectedTask.wbs_code && (
                    <span className="text-[10px] font-mono text-gray-400">{selectedTask.wbs_code}</span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="flex-shrink-0 ml-2 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </CardHeader>
              <CardContent className="pt-3 space-y-3 text-sm">
                {/* 业务状态 */}
                {(() => {
                  const biz = getBusinessStatus(selectedTask)
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">业务状态</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${biz.cls}`}>
                        {biz.label}
                        {biz.badge && <span className="opacity-80">· {biz.badge.text}</span>}
                      </span>
                    </div>
                  )
                })()}

                {/* 进度 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">进度</span>
                    <span className="text-xs font-medium text-gray-700">{selectedTask.progress || 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        selectedTask.status === 'completed' ? 'bg-emerald-500'
                        : selectedTask.status === 'blocked' ? 'bg-amber-500'
                        : 'bg-blue-500'
                      }`}
                      style={{ width: `${selectedTask.progress || 0}%` }}
                    />
                  </div>
                </div>

                {/* 工期对比 */}
                {(selectedTask.reference_duration || selectedTask.ai_duration || (selectedTask.start_date && selectedTask.end_date)) && (
                  <div className="rounded-lg bg-gray-50 p-2.5 space-y-1.5">
                    <p className="text-xs font-medium text-gray-600 mb-1.5">工期对比</p>
                    {selectedTask.reference_duration && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">计划工期</span>
                        <span className="font-medium text-gray-700">{selectedTask.reference_duration} 天</span>
                      </div>
                    )}
                    {selectedTask.start_date && selectedTask.end_date && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">排期工期</span>
                        <span className={`font-medium ${
                          selectedTask.reference_duration && Math.ceil((new Date(selectedTask.end_date).getTime() - new Date(selectedTask.start_date).getTime()) / 86400000) + 1 > selectedTask.reference_duration
                            ? 'text-red-600' : 'text-gray-700'
                        }`}>
                          {Math.max(1, Math.ceil((new Date(selectedTask.end_date).getTime() - new Date(selectedTask.start_date).getTime()) / 86400000) + 1)} 天
                        </span>
                      </div>
                    )}
                    {selectedTask.ai_duration && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">AI推荐</span>
                        <span className="font-medium text-purple-600">{selectedTask.ai_duration} 天</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 日期区间 */}
                {(selectedTask.start_date || selectedTask.end_date) && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">时间区间</span>
                    <span className="text-gray-700 tabular-nums">
                      {selectedTask.start_date ? formatDate(selectedTask.start_date) : '—'} ~ {selectedTask.end_date ? formatDate(selectedTask.end_date) : '—'}
                    </span>
                  </div>
                )}

                {/* 责任人 */}
                {selectedTask.assignee_name && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">责任人</span>
                    <span className="text-gray-700">{selectedTask.assignee_name}</span>
                  </div>
                )}

                {/* 责任单位 */}
                {selectedTask.responsible_unit && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">责任单位</span>
                    <span className="text-gray-700 truncate max-w-[160px]" title={selectedTask.responsible_unit}>{selectedTask.responsible_unit}</span>
                  </div>
                )}

                {/* 专项工程 */}
                {selectedTask.specialty_type && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">专项类型</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SPECIALTY_TYPES.find(s => s.value === selectedTask.specialty_type)?.color || 'bg-gray-100 text-gray-600'}`}>
                      {SPECIALTY_TYPES.find(s => s.value === selectedTask.specialty_type)?.label || selectedTask.specialty_type}
                    </span>
                  </div>
                )}

                {/* 首次填报时间 */}
                {selectedTask.first_progress_at && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">首次填报</span>
                    <span className="text-gray-600 tabular-nums">
                      {new Date(selectedTask.first_progress_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {/* 描述 */}
                {selectedTask.description && (
                  <div className="text-xs text-gray-600 leading-relaxed pt-1 border-t border-gray-100">
                    <p className="text-gray-400 mb-1">描述</p>
                    <p>{selectedTask.description}</p>
                  </div>
                )}

                {/* 快速操作 */}
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    onClick={() => openEditDialog(selectedTask)}
                  >
                    编辑
                  </Button>
                  <button
                    onClick={() => openConditionDialog(selectedTask)}
                    className="flex-1 h-7 text-xs px-2 border rounded-md text-green-700 border-green-200 hover:bg-green-50 transition-colors"
                  >
                    条件
                  </button>
                  <button
                    onClick={() => openObstacleDialog(selectedTask)}
                    className="flex-1 h-7 text-xs px-2 border rounded-md text-amber-700 border-amber-200 hover:bg-amber-50 transition-colors"
                  >
                    阻碍
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>{/* 双栏容器结束 */}

      {/* #15: 右键快捷菜单 */}
      {contextMenu && (
        <>
          {/* 点击其他区域关闭菜单 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }}
          />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[160px] text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
              onClick={() => { openEditDialog(contextMenu.task); setContextMenu(null) }}
            >
              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
              </svg>
              编辑任务
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-green-50 text-green-700 flex items-center gap-2"
              onClick={() => { openConditionDialog(contextMenu.task); setContextMenu(null) }}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              开工条件
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-amber-50 text-amber-700 flex items-center gap-2"
              onClick={() => { openObstacleDialog(contextMenu.task); setContextMenu(null) }}
            >
              <AlertOctagon className="h-3.5 w-3.5" />
              进行中阻碍
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-blue-700 flex items-center gap-2"
              onClick={() => {
                openEditDialog(undefined, contextMenu.task.id)
                setContextMenu(null)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              添加子任务
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
              onClick={() => {
                setInlineTitleTaskId(contextMenu.task.id)
                setInlineTitleValue(contextMenu.task.title || contextMenu.task.name || '')
                setContextMenu(null)
              }}
            >
              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"/>
              </svg>
              快速改名
            </button>
            <div className="my-1 border-t border-gray-100" />
            {contextMenu.task.status !== 'completed' && (
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-emerald-700 flex items-center gap-2"
                onClick={() => {
                  handleStatusChange(contextMenu.task.id, 'completed')
                  setContextMenu(null)
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                标记完成
              </button>
            )}
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2"
              onClick={() => {
                const taskName = contextMenu.task.title || contextMenu.task.name
                const taskId = contextMenu.task.id
                setContextMenu(null)
                openConfirm('删除任务', `确定删除「${taskName}」？此操作不可撤销。`, async () => {
                  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, { method: 'DELETE' })
                  const json = await res.json()
                  if (json.success) {
                    deleteTask(taskId)
                    toast({ title: '任务已删除' })
                  } else {
                    toast({ title: '删除失败', variant: 'destructive' })
                  }
                })
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除任务
            </button>
          </div>
        </>
      )}

      {/* 任务编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? '编辑任务' : newTaskParentId ? `添加子任务` : '新建任务'}
            </DialogTitle>
            {newTaskParentId && !editingTask && (
              <p className="text-xs text-muted-foreground">
                上级任务：{tasks.find(t => t.id === newTaskParentId)?.title || tasks.find(t => t.id === newTaskParentId)?.name || ''}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>任务名称</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入任务名称"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>开始日期</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>结束日期</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            {/* AI 工期建议（仅编辑已有任务时显示） */}
            {editingTask && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-700">AI 工期建议</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2 border-blue-200 text-blue-600 hover:bg-blue-100"
                    onClick={fetchAiDurationSuggestion}
                    disabled={aiDurationLoading}
                  >
                    {aiDurationLoading ? '计算中…' : '获取建议'}
                  </Button>
                </div>
                {aiDurationSuggestion && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-blue-800">
                        建议工期：{aiDurationSuggestion.estimated_duration} 天
                      </span>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded-full',
                        aiDurationSuggestion.confidence_level === 'high'
                          ? 'bg-emerald-100 text-emerald-700'
                          : aiDurationSuggestion.confidence_level === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-600'
                      )}>
                        置信度 {Math.round((aiDurationSuggestion.confidence_score || 0) * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-blue-600">
                      基于历史相似任务数据估算，仅供参考
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={applyAiDuration}
                    >
                      应用此工期
                    </Button>
                  </div>
                )}
                {!aiDurationSuggestion && !aiDurationLoading && (
                  <p className="text-xs text-blue-500">点击"获取建议"，AI 将基于历史同类任务数据估算工期</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={formData.status} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">待办</SelectItem>
                    <SelectItem value="in_progress">进行中</SelectItem>
                    <SelectItem value="completed">已完成</SelectItem>
                    <SelectItem value="blocked">已阻塞</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>优先级</Label>
                <Select value={formData.priority} onValueChange={(val) => setFormData({ ...formData, priority: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="critical">紧急</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>进度 (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={formData.progress}
                onChange={(e) => setFormData({ ...formData, progress: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>责任人</Label>
                <Input
                  value={formData.assignee_name}
                  onChange={(e) => setFormData({ ...formData, assignee_name: e.target.value })}
                  placeholder="负责人姓名"
                />
              </div>
              <div className="space-y-2">
                <Label>责任单位</Label>
                <Input
                  value={formData.responsible_unit}
                  onChange={(e) => setFormData({ ...formData, responsible_unit: e.target.value })}
                  placeholder="所属部门/单位"
                />
              </div>
            </div>

            {/* #12 专项工程 + #7 计划工期 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>专项工程（可选）</Label>
                <Select
                  value={formData.specialty_type || '__none__'}
                  onValueChange={(val) => setFormData({ ...formData, specialty_type: val === '__none__' ? '' : val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="无专项分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">无专项分类</SelectItem>
                    {SPECIALTY_TYPES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>计划工期（天）</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="参考工期天数"
                  value={formData.reference_duration}
                  onChange={(e) => setFormData({ ...formData, reference_duration: e.target.value })}
                />
              </div>
            </div>

            {/* 父任务选择（WBS结构） */}
            <div className="space-y-2">
              <Label>上级任务（可选）</Label>
              <Select
                value={formData.parent_id || '__none__'}
                onValueChange={(val) => setFormData({ ...formData, parent_id: val === '__none__' ? null : val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="无（顶级任务）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">无（顶级任务）</SelectItem>
                  {tasks
                    .filter(t => t.id !== editingTask?.id)
                    .map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title || t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">选择上级任务，构建 WBS 层级结构</p>
            </div>

            {/* 依赖关系选择 */}
            {tasks.length > 1 && (
              <div className="space-y-2">
                <Label>前置依赖任务</Label>
                <div className="border rounded-md max-h-32 overflow-y-auto p-2 space-y-1">
                  {tasks
                    .filter(t => t.id !== editingTask?.id)
                    .map(task => (
                      <label
                        key={task.id}
                        className="flex items-center gap-2 p-1 hover:bg-accent rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={(formData.dependencies || []).includes(task.id)}
                          onChange={(e) => handleDependencyChange(task.id, e.target.checked)}
                          className="rounded border-input"
                        />
                        <span className="text-sm">{task.title || task.name}</span>
                        {isOnCriticalPath(task.id) && (
                          <AlertCircle className="h-3 w-3 text-red-500" />
                        )}
                      </label>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  选择此任务依赖的前置任务（完成后才能开始）
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveTask}>
              <Save className="mr-2 h-4 w-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 版本冲突解决对话框 */}
      <ConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        localVersion={conflictData?.localVersion as Task || {} as Task}
        serverVersion={conflictData?.serverVersion as Task || {} as Task}
        onKeepLocal={handleKeepLocal}
        onKeepServer={handleKeepServer}
        onMerge={handleMerge}
        itemType="task"
      />

      {/* 里程碑层级设置弹窗 */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-amber-500" />
              设置里程碑
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              任务：<span className="font-medium text-foreground">{milestoneTargetTask?.title || milestoneTargetTask?.name}</span>
            </p>
            <div className="grid gap-2">
              {/* 取消里程碑 */}
              <button
                onClick={async () => {
                  if (!milestoneTargetTask) return
                  const res = await fetch(`${API_BASE}/api/tasks/${milestoneTargetTask.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      is_milestone: false, 
                      milestone_level: null,
                      version: milestoneTargetTask.version ?? 1 
                    }),
                  })
                  const json = await res.json()
                  if (json.success) {
                    updateTask(milestoneTargetTask.id, { ...milestoneTargetTask, is_milestone: false, milestone_level: undefined })
                  }
                  setMilestoneDialogOpen(false)
                  toast({ title: '已取消里程碑标记' })
                }}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent ${!milestoneTargetTask?.is_milestone ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <Flag className="h-4 w-4 text-gray-300" />
                <div className="text-left">
                  <div className="text-sm font-medium">普通任务</div>
                  <div className="text-xs text-muted-foreground">取消里程碑标记</div>
                </div>
              </button>
              {/* 三个层级选择 */}
              {[1, 2, 3].map(level => {
                const cfg = MILESTONE_LEVEL_CONFIG[level]
                const isSelected = milestoneTargetTask?.is_milestone && milestoneTargetTask?.milestone_level === level
                const selectedCls = isSelected ? `border-current ${cfg.bgColor} ${cfg.color}` : 'border-border'
                return (
                  <button
                    key={level}
                    onClick={async () => {
                      if (!milestoneTargetTask) return
                      const res = await fetch(`${API_BASE}/api/tasks/${milestoneTargetTask.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          is_milestone: true, 
                          milestone_level: level,
                          version: milestoneTargetTask.version ?? 1 
                        }),
                      })
                      const json = await res.json()
                      if (json.success) {
                        updateTask(milestoneTargetTask.id, { ...milestoneTargetTask, is_milestone: true, milestone_level: level })
                      }
                      setMilestoneDialogOpen(false)
                      toast({ title: `已设为${cfg.label}` })
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent ${selectedCls}`}
                  >
                    <Flag className={`h-4 w-4 ${cfg.color}`} fill="currentColor" />
                    <div className="text-left">
                      <div className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {level === 1 ? '关键节点，影响整体工期' : level === 2 ? '重要节点，分项关键控制点' : '一般节点，过程监控点'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMilestoneDialogOpen(false)}>取消</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 条件管理弹窗 ─────────────────────────────── */}
      <Dialog open={conditionDialogOpen} onOpenChange={setConditionDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              开工条件管理
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              任务：<span className="font-medium text-foreground">{conditionTask?.title || conditionTask?.name}</span>
            </p>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {/* 添加新条件 */}
            <div className="space-y-2 p-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
              <div className="flex gap-2">
                {/* P0-1: 条件类型 Select */}
                <Select value={newConditionType} onValueChange={setNewConditionType}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue placeholder="类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="输入开工条件描述"
                  value={newConditionName}
                  onChange={(e) => setNewConditionName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCondition()}
                  className="flex-1 h-8 text-sm"
                />
              </div>
              {/* [G3]: 条件详细说明（占一行） */}
              <Input
                placeholder="详细说明（可选）"
                value={newConditionDescription}
                onChange={(e) => setNewConditionDescription(e.target.value)}
                className="h-7 text-xs"
              />
              <div className="flex gap-2 items-center">
                {/* P1-6: 目标解决日期 */}
                <div className="flex items-center gap-1.5 flex-1">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  <label className="text-xs text-gray-500">目标日期</label>
                  <Input
                    type="date"
                    value={newConditionTargetDate}
                    onChange={(e) => setNewConditionTargetDate(e.target.value)}
                    className="h-7 text-xs flex-1"
                  />
                </div>
                {/* [G3]: 责任单位 */}
                <Input
                  placeholder="责任单位"
                  value={newConditionResponsibleUnit}
                  onChange={(e) => setNewConditionResponsibleUnit(e.target.value)}
                  className="h-7 text-xs w-28"
                />
                {/* P2-9: 前置任务多选（Popover + Checkbox List） */}
                {newConditionType === 'preceding' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs flex-1 justify-start gap-1.5 border-amber-200 bg-amber-50/50 hover:bg-amber-50"
                      >
                        <GitBranch className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        {newConditionPrecedingTaskIds.length === 0 ? (
                          <span className="text-gray-400">选择前置任务（可多选）</span>
                        ) : (
                          <span className="text-amber-700 font-medium truncate">
                            已选 {newConditionPrecedingTaskIds.length} 个前置任务
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <div className="px-3 py-2 border-b bg-gray-50">
                        <p className="text-xs text-gray-500">勾选所有前置任务（可多选）</p>
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1">
                        {tasks
                          .filter(t => conditionTask && t.id !== conditionTask.id)
                          .map(t => {
                            const checked = newConditionPrecedingTaskIds.includes(t.id)
                            return (
                              <label
                                key={t.id}
                                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewConditionPrecedingTaskIds(prev => [...prev, t.id])
                                    } else {
                                      setNewConditionPrecedingTaskIds(prev => prev.filter(id => id !== t.id))
                                    }
                                  }}
                                  className="accent-amber-500 w-3.5 h-3.5"
                                />
                                <span className="text-xs text-gray-700 truncate flex-1">
                                  {t.title || t.name}
                                </span>
                                {t.status && (
                                  <span className={`text-[10px] px-1 rounded ${
                                    t.status === '已完成' ? 'bg-green-100 text-green-700' :
                                    t.status === '进行中' ? 'bg-blue-100 text-blue-700' :
                                    'bg-gray-100 text-gray-500'
                                  }`}>
                                    {t.status}
                                  </span>
                                )}
                              </label>
                            )
                          })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              {newConditionType === 'preceding' && newConditionPrecedingTaskIds.length > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  已选 {newConditionPrecedingTaskIds.length} 个前置任务 — 全部完成时，此条件自动满足
                </p>
              )}
            </div>
            {/* 条件列表 */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {conditionsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">加载中...</p>
              ) : taskConditions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无开工条件，点击上方添加</p>
              ) : (
                taskConditions.map(cond => {
                  const typeConf = CONDITION_TYPES.find(t => t.value === cond.condition_type)
                  // P0-3 体现在条件层面: 目标日期超期未满足
                  const isOverdue = !cond.is_satisfied && cond.target_date && new Date(cond.target_date) < new Date()
                  return (
                    <div key={cond.id} className={`flex items-start gap-2 p-2.5 rounded-xl border transition-colors ${cond.is_satisfied ? 'bg-green-50 border-green-200' : isOverdue ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
                      <button
                        onClick={() => handleToggleCondition(cond)}
                        className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${cond.is_satisfied ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-emerald-400'}`}
                      >
                        {cond.is_satisfied && <CheckCircle2 className="h-3 w-3" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${cond.is_satisfied ? 'line-through text-gray-400' : 'text-gray-700'}`}>{cond.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {typeConf && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeConf.color}`}>{typeConf.label}</span>
                          )}
                          {cond.target_date && (
                            <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                              <Calendar className="h-2.5 w-2.5" />
                              {isOverdue ? '已超期: ' : ''}{cond.target_date}
                            </span>
                          )}
                          {/* P2-9: 前置任务芯片 */}
                          {(conditionPrecedingTasks[cond.id] || []).map(pt => (
                            <span
                              key={pt.task_id}
                              className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                pt.status === '已完成' ? 'bg-green-100 text-green-700' :
                                'bg-amber-100 text-amber-700'
                              }`}
                              title={`前置任务: ${pt.title || pt.name}`}
                            >
                              <GitBranch className="h-2.5 w-2.5 flex-shrink-0" />
                              {pt.title || pt.name}
                            </span>
                          ))}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cond.is_satisfied ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                            {cond.is_satisfied ? '已满足' : '未满足'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteCondition(cond.id)}
                        className="flex-shrink-0 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
            {taskConditions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                已满足 {taskConditions.filter(c => c.is_satisfied).length}/{taskConditions.length} 个条件
                {taskConditions.every(c => c.is_satisfied) && (
                  <span className="ml-1.5 text-green-600 font-medium">全部满足，可以开工</span>
                )}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConditionDialogOpen(false)}>关闭</Button>
            <Button onClick={handleAddCondition} disabled={!newConditionName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              保存条件
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 阻碍管理弹窗 ─────────────────────────────── */}
      <Dialog open={obstacleDialogOpen} onOpenChange={setObstacleDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-amber-600" />
              阻碍记录
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              任务：<span className="font-medium text-foreground">{obstacleTask?.title || obstacleTask?.name}</span>
            </p>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {/* 添加新阻碍 */}
            <div className="flex gap-2">
              <Input
                placeholder="描述阻碍（如：材料未到场，无法施工）"
                value={newObstacleTitle}
                onChange={(e) => setNewObstacleTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddObstacle()}
                className="flex-1"
              />
            </div>
            {/* 阻碍列表 */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {obstaclesLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">加载中...</p>
              ) : taskObstacles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无阻碍记录</p>
              ) : (
                taskObstacles.map(obs => {
                  // P0-3: 超时标识 —— 未解决且超过3天
                  const daysSince = Math.floor((Date.now() - new Date(obs.created_at).getTime()) / 86400000)
                  const isLongTerm = !obs.is_resolved && daysSince > 3
                  // P1-8: 超过7天推送标识
                  const isCritical = !obs.is_resolved && daysSince > 7
                  const isEditing = editingObstacleId === obs.id

                  return (
                    <div key={obs.id} className={`p-2.5 rounded-xl border transition-colors ${obs.is_resolved ? 'bg-gray-50 border-gray-200 opacity-60' : isCritical ? 'bg-red-50 border-red-300' : isLongTerm ? 'bg-orange-50 border-orange-300' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            /* P1-5: 编辑态 */
                            <div className="flex gap-1">
                              <Input
                                value={editingObstacleTitle}
                                onChange={e => setEditingObstacleTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveObstacleEdit(obs.id)
                                  if (e.key === 'Escape') { setEditingObstacleId(null); setEditingObstacleTitle('') }
                                }}
                                className="h-7 text-xs flex-1"
                                autoFocus
                              />
                              <Button size="sm" className="h-7 px-2" onClick={() => handleSaveObstacleEdit(obs.id)}>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditingObstacleId(null); setEditingObstacleTitle('') }}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <p className={`text-sm ${obs.is_resolved ? 'line-through text-gray-400' : 'text-gray-800'}`}>{obs.title}</p>
                          )}
                          {!isEditing && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {/* P0-3: 超时标签 */}
                              {isCritical && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium flex items-center gap-0.5">
                                  <AlertCircle className="h-2.5 w-2.5" />长期阻碍·{daysSince}天
                                </span>
                              )}
                              {isLongTerm && !isCritical && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                                  超时·{daysSince}天
                                </span>
                              )}
                              {!isLongTerm && !obs.is_resolved && (
                                <span className="text-[10px] text-gray-400">{daysSince}天前</span>
                              )}
                            </div>
                          )}
                          {obs.description && !isEditing && <p className="text-xs text-muted-foreground mt-0.5">{obs.description}</p>}
                        </div>
                        {!isEditing && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${obs.is_resolved ? 'bg-gray-100 text-gray-500' : isCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {obs.is_resolved ? '已解决' : '进行中'}
                            </span>
                            {/* P1-5: 编辑按钮（未解决才可编辑） */}
                            {!obs.is_resolved && (
                              <button
                                onClick={() => { setEditingObstacleId(obs.id); setEditingObstacleTitle(obs.title) }}
                                className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                title="编辑"
                              >
                                <Save className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {!obs.is_resolved && (
                              <button
                                onClick={() => handleResolveObstacle(obs)}
                                className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                                title="标记为已解决"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {/* P0-4: 删除按钮（已解决才能删除） */}
                            {obs.is_resolved && (
                              <button
                                onClick={() => handleDeleteObstacle(obs.id)}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                title="删除"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {taskObstacles.length > 0 && (
              <p className="text-xs text-muted-foreground">
                共 {taskObstacles.length} 条阻碍 · {taskObstacles.filter(o => !o.is_resolved).length} 条待解决
                {taskObstacles.filter(o => !o.is_resolved && Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000) > 7).length > 0 && (
                  <span className="ml-1.5 text-red-600 font-medium">
                    · {taskObstacles.filter(o => !o.is_resolved && Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000) > 7).length} 条长期阻碍
                  </span>
                )}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setObstacleDialogOpen(false)}>关闭</Button>
            <Button onClick={handleAddObstacle} disabled={!newObstacleTitle.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              保存阻碍
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* P1-7: 新建任务后提示添加开工条件 */}
      <Dialog open={!!newTaskConditionPromptId} onOpenChange={(open) => { if (!open) setNewTaskConditionPromptId(null) }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              需要设置开工条件吗？
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            任务已创建。如果该任务有尚未满足的前提条件（如材料到位、许可证办理等），可以现在添加开工条件来跟踪进度。
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewTaskConditionPromptId(null)}>
              暂不设置
            </Button>
            <Button onClick={() => {
              const taskId = newTaskConditionPromptId
              setNewTaskConditionPromptId(null)
              if (taskId) {
                const task = tasks.find(t => t.id === taskId)
                if (task) openConditionDialog(task as unknown as Task)
              }
            }}>
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              添加开工条件
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 通用确认弹窗（替代 window.confirm） */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog(prev => ({ ...prev, open: false }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">{confirmDialog.message}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => {
              setConfirmDialog(prev => ({ ...prev, open: false }))
              confirmDialog.onConfirm()
            }}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BatchActionBar — 批量操作浮动条（I02） */}
      <BatchActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: '批量完成',
            icon: CheckCircle2,
            onClick: handleBatchComplete,
            disabled: selectedIds.size === 0,
          },
          {
            label: '批量删除',
            icon: Trash2,
            variant: 'destructive',
            onClick: handleBatchDelete,
            disabled: selectedIds.size === 0,
          },
        ]}
      />
    </div>
  )
}
