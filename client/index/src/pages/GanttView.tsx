import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '@/hooks/useStore'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, Plus, Calendar, Save, Trash2, GitBranch, AlertCircle, Flag, ChevronRight, ChevronDown, LayoutTemplate } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { taskDb, generateId } from '@/lib/localDb'
import { calculateCPM, isCriticalTask, getCriticalPathSummary, type CPMResult } from '@/lib/cpm'
import { GanttViewSkeleton } from '@/components/ui/page-skeleton'
import { Pagination, usePagination } from '@/components/ui/Pagination'
import { ConflictDialog } from '@/components/ConflictDialog'

// Task类型（本地版本）
interface Task {
  id: string
  project_id: string
  title?: string
  name?: string  // 兼容旧字段
  description?: string
  status?: string
  priority?: string
  start_date?: string | null
  end_date?: string | null
  progress?: number
  assignee?: string
  assignee_name?: string
  assignee_unit?: string
  responsible_unit?: string
  dependencies?: string[]
  parent_id?: string | null   // WBS父节点ID
  is_critical?: boolean  // 手动标记的关键任务
  is_milestone?: boolean  // 是否为里程碑节点
  milestone_level?: number  // 里程碑层级：1=一级(amber)/2=二级(blue)/3=三级(gray)
  milestone_order?: number  // 同级排序
  version?: number
  created_at: string
  updated_at: string
}

// WBS 树节点（包含 children）
interface WBSNode extends Task {
  children: WBSNode[]
  depth: number
}

// 里程碑层级样式配置
const MILESTONE_LEVEL_CONFIG: Record<number, { label: string; color: string; borderColor: string; bgColor: string }> = {
  1: { label: '一级里程碑', color: 'text-amber-600', borderColor: 'border-amber-500', bgColor: 'bg-amber-50' },
  2: { label: '二级里程碑', color: 'text-blue-600', borderColor: 'border-blue-500', bgColor: 'bg-blue-50' },
  3: { label: '三级里程碑', color: 'text-gray-500', borderColor: 'border-gray-400', bgColor: 'bg-gray-50' },
}

// ─── WBS 树形结构工具函数 ───────────────────────────────────────

/**
 * 将平铺 tasks 数组按 parent_id 重建为多叉树
 * 没有 parent_id（或 parent_id 找不到对应节点）的任务作为根节点
 */
function buildWBSTree(tasks: Task[]): WBSNode[] {
  const nodeMap = new Map<string, WBSNode>()
  // 初始化节点
  for (const t of tasks) {
    nodeMap.set(t.id, { ...t, children: [], depth: 0 })
  }
  const roots: WBSNode[] = []
  for (const node of nodeMap.values()) {
    const parentId = node.parent_id
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  // 设置 depth
  function setDepth(nodes: WBSNode[], d: number) {
    for (const n of nodes) {
      n.depth = d
      setDepth(n.children, d + 1)
    }
  }
  setDepth(roots, 0)
  return roots
}

/**
 * 将 WBS 树打平为有序列表，用于渲染
 * collapsed：存放已折叠节点 id 的 Set，折叠节点的子树跳过
 */
function flattenTree(nodes: WBSNode[], collapsed: Set<string>): WBSNode[] {
  const result: WBSNode[] = []
  for (const n of nodes) {
    result.push(n)
    if (!collapsed.has(n.id) && n.children.length > 0) {
      result.push(...flattenTree(n.children, collapsed))
    }
  }
  return result
}

// ──────────────────────────────────────────────────────────────────

export default function GanttView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tasks, setTasks, addTask, updateTask, deleteTask, currentProject } = useStore()
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  
  // WBS 树形状态
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 添加子任务时预设的父节点 ID
  const [newTaskParentId, setNewTaskParentId] = useState<string | null>(null)

  // 里程碑设置弹窗状态
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [milestoneTargetTask, setMilestoneTargetTask] = useState<Task | null>(null)
  
  // 版本冲突处理状态
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictData, setConflictData] = useState<{
    localVersion: Task
    serverVersion: Task
  } | null>(null)
  const [pendingTaskData, setPendingTaskData] = useState<Partial<Task> | null>(null)
  
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
  })

  // ─── WBS 树形 ──────────────────────────────────────
  const wbsTree = useMemo(() => buildWBSTree(tasks as Task[]), [tasks])
  const flatList = useMemo(() => flattenTree(wbsTree, collapsed), [wbsTree, collapsed])

  // 全选判断
  const allSelected = flatList.length > 0 && flatList.every(n => selectedIds.has(n.id))
  const someSelected = flatList.some(n => selectedIds.has(n.id))
  // ────────────────────────────────────────────────────

  // CPM计算结果（考虑手动标记的关键任务）
  const cpmResult: CPMResult | null = useMemo(() => {
    if (tasks.length === 0) return null
    
    // 转换为CPM任务节点
    const taskNodes = tasks.map(t => {
      const taskName = t.title || t.name || ''
      const startDate = t.start_date ? new Date(t.start_date) : new Date()
      const endDate = t.end_date ? new Date(t.end_date) : addDays(startDate, 1)
      // 使用inclusive计算：结束日-开始日+1，例如03/01到03/21=21天
      const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      
      return {
        id: t.id,
        name: taskName,
        duration,
        startDate,
        endDate,
        dependencies: t.dependencies || []
      }
    })
    
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

  // 项目统计信息
  const projectStats = useMemo(() => {
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => t.status === 'completed').length
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length
    const overdueTask = tasks.filter(t =>
      t.status !== 'completed' && t.end_date && new Date(t.end_date) < new Date()
    ).length
    const avgProgress = totalTasks > 0
      ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / totalTasks)
      : 0
    const criticalTaskCount = cpmResult ? cpmResult.criticalPath.length : 0
    const blockedTasks = tasks.filter(t => t.status === 'blocked').length
    
    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      overdueTask,
      avgProgress,
      criticalTaskCount,
      blockedTasks,
      projectDuration: cpmResult ? cpmResult.projectDuration : 0,
      criticalPathSummary: cpmResult ? getCriticalPathSummary(cpmResult) : ''
    }
  }, [tasks, cpmResult])

  useEffect(() => {
    if (id) {
      loadTasks()
    }
  }, [id, loadTasks])

  const loadTasks = useCallback(() => {
    try {
      const data = taskDb.getByProject(id!)
      // 按开始日期排序
      const sorted = data.sort((a: Task, b: Task) => {
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

  const handleSaveTask = () => {
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
      // 字段映射：将表单字段转换为数据库字段
      const taskData: Partial<Task> = {
        title: formData.name,  // name -> title
        description: formData.description,
        status: formData.status,
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
      }

      if (editingTask) {
        const currentVersion = editingTask.version || 1
        const updated = taskDb.update(editingTask.id, { ...taskData, version: currentVersion + 1 })
        
        if (updated) {
          updateTask(editingTask.id, { ...editingTask, ...taskData, version: currentVersion + 1 })
          toast({ title: "任务已更新" })
        } else {
          // 版本冲突：获取服务器版本并显示冲突对话框
          const serverVersion = taskDb.getById(editingTask.id)
          if (serverVersion) {
            setConflictData({
              localVersion: { ...editingTask, ...taskData },
              serverVersion
            })
            setPendingTaskData(taskData)
            setConflictOpen(true)
          } else {
            // 记录不存在，强制更新
            taskDb.forceUpdate(editingTask.id, { ...taskData, version: currentVersion + 1 })
            updateTask(editingTask.id, { ...editingTask, ...taskData, version: currentVersion + 1 })
            toast({ title: "任务已更新" })
          }
        }
      } else {
        const newTask: Task = {
          ...taskData,
          id: generateId(),
          version: 1,
          created_at: new Date().toISOString(),
          is_milestone: false,
        }
        taskDb.create(newTask)
        addTask(newTask)
        toast({ title: "任务已创建" })
      }

      setDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error('保存任务失败:', error)
      toast({ title: "保存失败: " + (error as Error).message, variant: "destructive" })
    }
  }

  const handleDeleteTask = (taskId: string) => {
    if (!confirm('确定要删除这个任务吗？')) return

    try {
      taskDb.delete(taskId)
      deleteTask(taskId)
      toast({ title: "任务已删除" })
    } catch (error) {
      console.error('删除任务失败:', error)
      toast({ title: "删除失败", variant: "destructive" })
    }
  }

  // 切换关键任务状态
  const handleToggleCritical = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const newCriticalStatus = !task.is_critical
    try {
      taskDb.update(taskId, { is_critical: newCriticalStatus })
      // 更新本地状态
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

  const handleStatusChange = (taskId: string, val: string) => {
    const updated = taskDb.update(taskId, { status: val, updated_at: new Date().toISOString() })
    if (updated) {
      updateTask(taskId, { status: val })
    }
  }

  const handlePriorityChange = (taskId: string, val: string) => {
    const updated = taskDb.update(taskId, { priority: val, updated_at: new Date().toISOString() })
    if (updated) {
      updateTask(taskId, { priority: val })
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
    })
    setNewTaskParentId(null)
  }

  // 版本冲突处理函数
  const handleKeepLocal = useCallback(() => {
    if (!conflictData || !pendingTaskData || !editingTask) return
    
    // 强制保留本地版本
    const newVersion = (conflictData.localVersion.version || 1) + 1
    taskDb.forceUpdate(editingTask.id, { ...pendingTaskData, version: newVersion })
    updateTask(editingTask.id, { ...conflictData.localVersion, ...pendingTaskData, version: newVersion })
    
    toast({ title: "已保留您的修改" })
    setConflictOpen(false)
    setConflictData(null)
    setPendingTaskData(null)
  }, [conflictData, pendingTaskData, editingTask, updateTask])

  const handleKeepServer = useCallback(() => {
    if (!conflictData || !editingTask) return
    
    // 使用服务器版本，刷新本地数据
    const serverData = taskDb.getById(editingTask.id)
    if (serverData) {
      updateTask(editingTask.id, serverData)
      toast({ title: "已使用服务器版本" })
    }
    
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

  // ─── WBS 树形操作 ──────────────────────────────────

  const toggleCollapse = (nodeId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
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

  const handleBatchComplete = () => {
    if (selectedIds.size === 0) return
    try {
      for (const tid of selectedIds) {
        taskDb.update(tid, { status: 'completed', progress: 100, updated_at: new Date().toISOString() })
        updateTask(tid, { status: 'completed', progress: 100 })
      }
      toast({ title: `已完成 ${selectedIds.size} 个任务` })
      setSelectedIds(new Set())
    } catch (e) {
      toast({ title: '批量操作失败', variant: 'destructive' })
    }
  }

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个任务吗？`)) return
    try {
      for (const tid of selectedIds) {
        taskDb.delete(tid)
        deleteTask(tid)
      }
      toast({ title: `已删除 ${selectedIds.size} 个任务` })
      setSelectedIds(new Set())
    } catch (e) {
      toast({ title: '批量删除失败', variant: 'destructive' })
    }
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
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(`/projects/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回项目
          </Button>
          <div>
            <h2 className="text-xl font-semibold">任务列表</h2>
            <p className="text-sm text-muted-foreground mt-0.5">项目工作分解结构(WBS)及任务管理</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/wbs-templates`)}>
            <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" />
            从模板生成
          </Button>
          <Button onClick={() => openEditDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            新建任务
          </Button>
        </div>
      </div>

      {/* 统计卡片 5项 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">总任务数</p>
            <p className="text-2xl font-bold">{projectStats.totalTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">已完成</p>
            <p className="text-2xl font-bold text-green-600">{projectStats.completedTasks}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {projectStats.totalTasks > 0 ? Math.round(projectStats.completedTasks / projectStats.totalTasks * 100) : 0}%
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

      {/* WBS 任务树形结构 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
          <CardTitle className="text-base">WBS任务结构</CardTitle>
          <div className="flex items-center gap-2">
            {projectStats.criticalPathSummary && (
              <p className="text-xs text-muted-foreground">
                关键路径: {projectStats.criticalPathSummary}
              </p>
            )}
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
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无任务</p>
              <Button className="mt-4" onClick={() => openEditDialog()}>
                添加第一个任务
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {flatList.map(node => {
                const task = node
                const isOverdue = task.status !== 'completed' && task.end_date && new Date(task.end_date) < new Date()
                const hasChildren = node.children.length > 0
                const isCollapsed = collapsed.has(node.id)
                const indentPx = node.depth * 24

                // 状态配置
                const statusConfig: Record<string, { label: string; cls: string }> = {
                  completed: { label: '已完成', cls: 'bg-green-100 text-green-700' },
                  in_progress: { label: '进行中', cls: 'bg-blue-100 text-blue-700' },
                  blocked: { label: '受阻', cls: 'bg-amber-100 text-amber-700' },
                  todo: { label: '待办', cls: 'bg-gray-100 text-gray-600' },
                }
                const statusInfo = statusConfig[task.status || 'todo'] || statusConfig.todo

                // 进度条颜色
                const progressColor = task.status === 'completed'
                  ? 'bg-emerald-500'
                  : isOverdue ? 'bg-red-500'
                  : task.status === 'in_progress' ? 'bg-blue-500'
                  : task.status === 'blocked' ? 'bg-amber-500'
                  : 'bg-gray-300'

                const fmtShort = (d?: string | null) => {
                  if (!d) return null
                  const dt = new Date(d)
                  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
                }

                return (
                  <div
                    key={task.id}
                    className={`flex items-center px-4 py-2.5 group hover:bg-accent/30 transition-colors ${
                      task.status === 'blocked'
                        ? 'border-l-4 border-l-amber-400 bg-amber-50/50'
                        : isOverdue
                        ? 'border-l-4 border-l-red-400 bg-red-50/30'
                        : ''
                    }`}
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
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 mr-3">
                      <button
                        onClick={() => openEditDialog(task)}
                        className={`text-sm font-medium truncate max-w-[200px] text-left hover:text-blue-600 transition-colors ${
                          isOnCriticalPath(task.id) ? 'text-red-700'
                          : task.status === 'blocked' ? 'text-amber-700'
                          : isOverdue ? 'text-red-600'
                          : task.status === 'completed' ? 'text-gray-400 line-through'
                          : 'text-gray-800'
                        }`}
                        title={task.title || task.name}
                      >
                        {task.title || task.name}
                      </button>
                      {task.status === 'blocked' && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">受阻</span>
                      )}
                      {isOverdue && task.status !== 'blocked' && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">逾期</span>
                      )}
                      {isOnCriticalPath(task.id) && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200">关键</span>
                      )}
                    </div>

                    {/* 状态 */}
                    <div className="flex-shrink-0 w-20">
                      <Select value={task.status || 'todo'} onValueChange={(val) => handleStatusChange(task.id, val)}>
                        <SelectTrigger className="h-7 border-0 bg-transparent p-0 shadow-none focus:ring-0 w-full">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                            {statusInfo.label}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">待办</SelectItem>
                          <SelectItem value="in_progress">进行中</SelectItem>
                          <SelectItem value="completed">已完成</SelectItem>
                          <SelectItem value="blocked">受阻</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 进度 */}
                    <div className="flex-shrink-0 w-32 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${progressColor}`}
                            style={{ width: `${task.progress || 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-7 text-right tabular-nums text-gray-600">{task.progress || 0}%</span>
                      </div>
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

                    {/* 操作按钮（hover显示） */}
                    <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
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
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
                onClick={() => {
                  if (!milestoneTargetTask) return
                  const updated = { ...milestoneTargetTask, is_milestone: false, milestone_level: undefined }
                  taskDb.update(milestoneTargetTask.id, { is_milestone: false, milestone_level: undefined })
                  updateTask(milestoneTargetTask.id, updated)
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
                return (
                  <button
                    key={level}
                    onClick={() => {
                      if (!milestoneTargetTask) return
                      const updated = { ...milestoneTargetTask, is_milestone: true, milestone_level: level }
                      taskDb.update(milestoneTargetTask.id, { is_milestone: true, milestone_level: level })
                      updateTask(milestoneTargetTask.id, updated)
                      setMilestoneDialogOpen(false)
                      toast({ title: `已设为${cfg.label}` })
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent ${isSelected ? `border-current ${cfg.bgColor} ${cfg.color}` : 'border-border'}`}
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
    </div>
  )
}
