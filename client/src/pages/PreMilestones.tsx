import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useDebounce } from '@/hooks/useDebounce'
import { ReadOnlyGuard } from '@/components/ReadOnlyGuard'
import { 
  Search, Plus, Edit, Trash2, 
  AlertTriangle, CheckCircle, Clock,
  FileText, Calendar, Users, X, ChevronRight, BarChart3,
  ArrowRight, FolderPlus, Link2, Loader2, ChevronDown, ChevronUp,
  ClipboardCheck
} from 'lucide-react'
import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { useStore } from '@/hooks/useStore'
import { useTabPersist } from '@/hooks/useTabPersist'
import { useToast } from '@/hooks/use-toast'
import {
  countLifecycleStatuses,
  LIFECYCLE_STATUS_OPTIONS,
  matchesLifecycleStatus,
  normalizeDrawingLifecycleStatus,
  normalizeLicenseLifecycleStatus,
} from './preMilestonesLifecycle'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// 类型定义
interface PreMilestone {
  id: string
  project_id: string
  milestone_type: string
  name: string
  description?: string
  // display values (前端内部使用)
  status: '未开始' | '进行中' | '已完成' | '已延期' | '已取消'
  lead_unit?: string
  planned_start_date?: string
  planned_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  responsible_user_id?: string
  sort_order: number
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}

// DB值 ↔ Display值 映射（数据库 CHECK: '待申请','办理中','已取得','已过期','需延期'）
const DB_TO_DISPLAY: Record<string, PreMilestone['status']> = {
  '待申请': '未开始',
  '办理中': '进行中',
  '已取得': '已完成',
  '已过期': '已延期',
  '需延期': '已延期',
}
const DISPLAY_TO_DB: Record<string, string> = {
  '未开始': '待申请',
  '进行中': '办理中',
  '已完成': '已取得',
  '已延期': '需延期',
  '已取消': '需延期',  // 映射到最接近的DB值
}

// 办理流程步骤定义
const PROCESS_STEPS = ['申请', '受理', '审核', '批准', '发证']

// 获取证照的当前办理步骤（基于状态推算）
const getProcessStep = (milestone: PreMilestone): number => {
  switch (milestone.status) {
    case '未开始': return -1  // 尚未启动
    case '进行中': {
      // 进行中：根据时间推算大致步骤（简单等分）
      if (!milestone.planned_start_date || !milestone.planned_end_date) return 1
      const start = new Date(milestone.planned_start_date).getTime()
      const end = new Date(milestone.planned_end_date).getTime()
      const now = Date.now()
      const progress = Math.min(1, Math.max(0, (now - start) / (end - start)))
      return Math.floor(progress * 4)  // 0-3，共4段
    }
    case '已完成': return 4  // 全部完成
    case '已延期': return 1  // 受理阶段卡住
    case '已取消': return -1
    default: return -1
  }
}

interface PreMilestoneDependency {
  id: string
  pre_milestone_id: string
  depends_on_id: string
  dependency_type?: string
}

interface PreMilestoneCondition {
  id: string
  pre_milestone_id: string
  condition_type: string
  condition_name: string
  description?: string
  status: '待处理' | '已满足' | '未满足' | '已确认'
  target_date?: string
  completed_date?: string
  completed_by?: string
  notes?: string
  created_at: string
  updated_at: string
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: string
}

// API 基础配置
const API_BASE = ''

// 施工图纸类型枚举
const DRAWING_TYPES = ['建筑', '结构', '机电', '给排水', '暖通', '幕墙', '景观', '其他'] as const
type DrawingType = (typeof DRAWING_TYPES)[number]

// 施工图纸状态
const DRAWING_STATUSES = ['编制中', '审图中', '已通过', '已驳回', '已出图', '已作废'] as const
type DrawingStatus = (typeof DRAWING_STATUSES)[number]

// 施工图纸审图状态
const REVIEW_STATUSES = ['未提交', '审查中', '已通过', '已驳回', '需修改'] as const
type ReviewStatus = (typeof REVIEW_STATUSES)[number]

// 施工图纸接口（对应 construction_drawings 表）
interface ConstructionDrawing {
  id: string
  project_id: string
  drawing_type: DrawingType
  drawing_name: string
  version: string
  description?: string
  status: DrawingStatus
  design_unit?: string
  design_person?: string
  drawing_date?: string
  review_unit?: string
  review_status: ReviewStatus
  review_date?: string
  review_opinion?: string
  review_report_no?: string
  related_license_id?: string
  planned_submit_date?: string
  planned_pass_date?: string
  actual_submit_date?: string
  actual_pass_date?: string
  lead_unit?: string
  responsible_user_id?: string
  sort_order: number
  notes?: string
  created_at: string
  updated_at: string
}

export default function PreMilestones() {
  const navigate = useNavigate()
  // 状态管理
  const [activeTab, setActiveTab] = useTabPersist('pre-milestones', 'pre-milestones')
  // 使用全局状态
  const { currentProject, projects } = useStore()
  const { toast } = useToast()
  
  const [milestones, setMilestones] = useState<PreMilestone[]>([])
  // 施工图纸：独立API数据源（construction_drawings 表）
  const [drawings, setDrawings] = useState<ConstructionDrawing[]>([])
  const [drawingsLoading, setDrawingsLoading] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(currentProject?.id || '')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  // 防抖：300ms 后触发证照过滤
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const [selectedMilestone, setSelectedMilestone] = useState<PreMilestone | null>(null)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'conditions' | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [conditions, setConditions] = useState<PreMilestoneCondition[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
  const [dependencies, setDependencies] = useState<PreMilestoneDependency[]>([])
  // 确认弹窗状态（使用 useConfirmDialog hook 统一管理，替代 window.confirm）
  const { confirmDialog, setConfirmDialog, openConfirm } = useConfirmDialog()
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  // 表单状态
  const [formData, setFormData] = useState({
    project_id: '',
    milestone_type: '',
    name: '',
    description: '',
    lead_unit: '',
    planned_start_date: '',
    planned_end_date: '',
    responsible_user_id: '',
    sort_order: 0,
    notes: '',
    status: '未开始' as PreMilestone['status'],
    document_no: '',
    issue_date: '',
    expiry_date: '',
    issuing_authority: '',
    phase_id: '',
  })

  // 条件表单状态
  const [conditionForm, setConditionForm] = useState({
    condition_type: '',
    condition_name: '',
    description: '',
    target_date: ''
  })

  // 施工图纸表单状态
  const [drawingForm, setDrawingForm] = useState({
    drawing_type: '建筑' as DrawingType,
    drawing_name: '',
    version: '1.0',
    description: '',
    status: '编制中' as DrawingStatus,
    design_unit: '',
    design_person: '',
    drawing_date: '',
    review_unit: '',
    review_status: '未提交' as ReviewStatus,
    review_date: '',
    review_opinion: '',
    review_report_no: '',
    planned_submit_date: '',
    planned_pass_date: '',
    actual_submit_date: '',
    actual_pass_date: '',
    lead_unit: '',
    notes: '',
    sort_order: 0,
  })
  const [selectedDrawing, setSelectedDrawing] = useState<ConstructionDrawing | null>(null)
  const [drawingDialogMode, setDrawingDialogMode] = useState<'create' | 'edit' | null>(null)

  // 获取前期证照列表
  const fetchMilestones = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/pre-milestones?projectId=${selectedProjectId}`)
      const result: ApiResponse<PreMilestone[]> = await response.json()

      if (result.success && result.data) {
        // DB值 → Display值映射（解决 CHECK 约束与前端枚举不一致问题）
        const mapped = result.data.map(m => ({
          ...m,
          status: DB_TO_DISPLAY[m.status] ?? m.status,
        }))
        setMilestones(mapped)
      }
    } catch (error) {
      console.error('Failed to fetch milestones:', error)
    } finally {
      setLoading(false)
    }
  }

  // 获取证照依赖关系
  const fetchDependencies = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/pre-milestone-dependencies/project/${selectedProjectId}`)
      const result = await response.json()
      if (result.success && result.data) {
        setDependencies(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch dependencies:', error)
    }
  }

  // 加载依赖数据
  useEffect(() => {
    if (selectedProjectId && viewMode === 'timeline') {
      fetchDependencies()
    }
  }, [selectedProjectId, viewMode])

  // 获取施工图纸：独立 API（construction_drawings 表）
  const fetchDrawings = async () => {
    setDrawingsLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/construction-drawings?projectId=${selectedProjectId}`)
      const result: ApiResponse<ConstructionDrawing[]> = await response.json()
      if (result.success && result.data) {
        setDrawings(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch construction drawings:', error)
    } finally {
      setDrawingsLoading(false)
    }
  }

  // 保存施工图纸（创建或更新）
  const handleSaveDrawing = async () => {
    try {
      if (!selectedProjectId) {
        toast({ title: '请先选择项目', variant: 'destructive' })
        return
      }
      if (!drawingForm.drawing_name?.trim()) {
        toast({ title: '请输入图纸名称', variant: 'destructive' })
        return
      }

      const isEdit = drawingDialogMode === 'edit' && selectedDrawing
      const url = isEdit
        ? `${API_BASE}/api/construction-drawings/${selectedDrawing!.id}`
        : `${API_BASE}/api/construction-drawings`
      const method = isEdit ? 'PUT' : 'POST'

      const apiData = {
        project_id: selectedProjectId,
        ...drawingForm,
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData),
        credentials: 'include', // 添加 credentials 以携带 httpOnly Cookie
      })

      const result: ApiResponse<ConstructionDrawing> = await response.json()

      if (result.success) {
        setDrawingDialogMode(null)
        toast({ title: isEdit ? '更新成功' : '创建成功', description: isEdit ? '图纸信息已更新' : '图纸已添加' })
        fetchDrawings()
      } else {
        toast({ title: '保存失败', description: result.error?.message || '请检查输入', variant: 'destructive' })
      }
    } catch (error) {
      console.error('Failed to save drawing:', error)
      toast({ title: '保存失败', description: '请检查网络连接', variant: 'destructive' })
    }
  }

  // 删除施工图纸
  const handleDeleteDrawing = async (id: string) => {
    openConfirm('确认删除', '确定要删除此施工图纸吗？此操作无法撤销。', async () => {
      try {
        const response = await fetch(`${API_BASE}/api/construction-drawings/${id}`, {
          method: 'DELETE',
          credentials: 'include', // 添加 credentials 以携带 httpOnly Cookie
        })
        const result = await response.json()
        if (result.success) {
          toast({ title: '删除成功', description: '施工图纸已删除' })
          fetchDrawings()
        }
      } catch (error) {
        console.error('Failed to delete drawing:', error)
        toast({ title: '删除失败', description: '请检查网络连接', variant: 'destructive' })
      }
    })
  }

  useEffect(() => {
    fetchMilestones()
  }, [selectedProjectId])

  // 当全局 currentProject 变化时，更新 selectedProjectId
  useEffect(() => {
    if (currentProject?.id) {
      setSelectedProjectId(currentProject.id)
    }
  }, [currentProject])


  // 切换到施工图纸Tab时加载数据
  useEffect(() => {
    if (activeTab === 'construction-drawings') {
      fetchDrawings()
    }
  }, [activeTab, selectedProjectId])

  // 获取条件列表
  const fetchConditions = async (milestoneId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/pre-milestone-conditions?preMilestoneId=${milestoneId}`)
      const result: ApiResponse<PreMilestoneCondition[]> = await response.json()

      if (result.success && result.data) {
        setConditions(result.data)
      }
    } catch (error) {
      console.error('Failed to fetch conditions:', error)
    }
  }

  // 检查是否过期
  const isOverdue = (plannedDate?: string) => {
    if (!plannedDate) return false
    return new Date(plannedDate) < new Date()
  }

  // 获取状态颜色（display值）
  const getStatusColor = (status: string) => {
    switch (status) {
      case '未开始': return 'bg-gray-100 text-gray-700'
      case '进行中': return 'bg-blue-100 text-blue-700'
      case '已完成': return 'bg-emerald-100 text-emerald-700'
      case '已延期': return 'bg-red-100 text-red-700'
      case '已取消': return 'bg-gray-100 text-gray-500'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  // 状态筛选
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [drawingTypeFilter, setDrawingTypeFilter] = useState<string>('all')
  const statusOptions = LIFECYCLE_STATUS_OPTIONS

  const filteredMilestones = milestones.filter((milestone) => {
    const nameStr = milestone.name || ''
    const typeStr = milestone.milestone_type || ''
    const lifecycleStatus = normalizeLicenseLifecycleStatus(milestone.status)
    const matchSearch =
      nameStr.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      typeStr.toLowerCase().includes(debouncedSearchQuery.toLowerCase())

    return matchSearch && matchesLifecycleStatus(statusFilter, lifecycleStatus)
  })

  const filteredDrawings = drawings.filter((drawing) => {
    const searchText = `${drawing.drawing_name || ''} ${drawing.drawing_type || ''} ${drawing.version || ''}`.toLowerCase()
    const lifecycleStatus = normalizeDrawingLifecycleStatus(drawing.status, drawing.review_status)
    const matchSearch = searchText.includes(debouncedSearchQuery.toLowerCase())
    const matchStatus = matchesLifecycleStatus(statusFilter, lifecycleStatus)
    const matchType = drawingTypeFilter === 'all' || drawing.drawing_type === drawingTypeFilter

    return matchSearch && matchStatus && matchType
  })

  // 打开创建对话框（仅前期证照 Tab 使用）
  const handleCreate = () => {
    setDialogMode('create')
    setSelectedMilestone(null)
    
    setFormData({
      project_id: selectedProjectId,
      milestone_type: '',
      name: '',
      description: '',
      lead_unit: '',
      planned_start_date: '',
      planned_end_date: '',
      responsible_user_id: '',
      sort_order: milestones.length,
      notes: '',
      status: '未开始',  // 默认 display 值（后端会映射为 '待申请'）
      document_no: '',
      issue_date: '',
      expiry_date: '',
      issuing_authority: '',
      phase_id: '',
    })
  }

  // 打开编辑对话框
  const handleEdit = (milestone: PreMilestone) => {
    setDialogMode('edit')
    setSelectedMilestone(milestone)
    setFormData({
      project_id: milestone.project_id,
      milestone_type: milestone.milestone_type,
      name: milestone.name,
      description: milestone.description || '',
      lead_unit: milestone.lead_unit || '',
      planned_start_date: milestone.planned_start_date || '',
      planned_end_date: milestone.planned_end_date || '',
      responsible_user_id: milestone.responsible_user_id || '',
      sort_order: milestone.sort_order,
      notes: milestone.notes || '',
      status: milestone.status || '未开始',  // 传递 display 值
      document_no: '',
      issue_date: '',
      expiry_date: '',
      issuing_authority: '',
      phase_id: '',
    })
  }

  // 打开卡点管理对话框
  const handleManageConditions = async (milestone: PreMilestone) => {
    setDialogMode('conditions')
    setSelectedMilestone(milestone)
    await fetchConditions(milestone.id)
  }

  // 删除证照
  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/pre-milestones/${id}`, {
        method: 'DELETE'
      })
      const result: ApiResponse<void> = await response.json()

      if (result.success) {
        setDeleteConfirm(null)
        toast({ title: '删除成功', description: '证照已删除' })
        fetchMilestones()
      }
    } catch (error) {
      console.error('Failed to delete milestone:', error)
      toast({ title: '删除失败', description: '请检查网络连接', variant: 'destructive' })
    }
  }

  // 保存证照（创建或更新）
  const handleSave = async () => {
    try {
      // 验证必填字段
      if (!selectedProjectId) {
        toast({ title: '请先选择项目', variant: 'destructive' })
        return
      }
      if (!formData.name?.trim()) {
        toast({ title: '请输入证照名称', variant: 'destructive' })
        return
      }

      const isEdit = dialogMode === 'edit' && selectedMilestone
      const url = isEdit
        ? `${API_BASE}/api/pre-milestones/${selectedMilestone!.id}`
        : `${API_BASE}/api/pre-milestones`
      const method = isEdit ? 'PUT' : 'POST'

      // 构建API数据，确保必填字段有值
      const apiData = {
        project_id: selectedProjectId,
        milestone_name: formData.name,
        milestone_type: formData.milestone_type || '其他',
        status: formData.status ? (DISPLAY_TO_DB[formData.status] ?? formData.status) : undefined,
        document_no: formData.document_no || undefined,
        issue_date: formData.issue_date || undefined,
        expiry_date: formData.expiry_date || undefined,
        issuing_authority: formData.issuing_authority || undefined,
        description: formData.description || undefined,
        phase_id: formData.phase_id || undefined,
        lead_unit: formData.lead_unit || undefined,
        planned_start_date: formData.planned_start_date || undefined,
        planned_end_date: formData.planned_end_date || undefined,
        responsible_user_id: formData.responsible_user_id || undefined,
        sort_order: formData.sort_order || 0,
        // 修复：不传递 created_by，由后端处理
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiData)
      })

      const result: ApiResponse<PreMilestone> = await response.json()

      if (result.success) {
        setDialogMode(null)
        toast({ title: isEdit ? '更新成功' : '创建成功', description: isEdit ? '证照信息已更新' : '证照已添加' })
        fetchMilestones()
      } else {
        // 显示错误信息给用户
        toast({ title: '保存失败', description: result.error?.message || '请检查输入', variant: 'destructive' })
      }
    } catch (error) {
      console.error('Failed to save milestone:', error)
      toast({ title: '保存失败', description: '请检查网络连接', variant: 'destructive' })
    }
  }

  // 添加条件
  const handleAddCondition = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/pre-milestone-conditions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_milestone_id: selectedMilestone?.id,
          ...conditionForm
        })
      })

      const result: ApiResponse<PreMilestoneCondition> = await response.json()

      if (result.success) {
        setConditionForm({
          condition_type: '',
          condition_name: '',
          description: '',
          target_date: ''
        })
        toast({ title: '已添加卡点' })
        fetchConditions(selectedMilestone!.id)
      }
    } catch (error) {
      console.error('Failed to add condition:', error)
      toast({ title: '添加失败', description: '请检查网络连接', variant: 'destructive' })
  }
  }

  // 更新条件状态
  const handleUpdateConditionStatus = async (conditionId: string, status: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/pre-milestone-conditions/${conditionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })

      const result: ApiResponse<PreMilestoneCondition> = await response.json()

      if (result.success) {
        fetchConditions(selectedMilestone!.id)
      }
    } catch (error) {
      console.error('Failed to update condition status:', error)
    }
  }

  // 删除条件
  const handleDeleteCondition = async (conditionId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/pre-milestone-conditions/${conditionId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchConditions(selectedMilestone!.id)
      }
    } catch (error) {
      console.error('Failed to delete condition:', error)
    }
  }

  // 展开/折叠卡片流程步骤
  const toggleCardExpand = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 计算证照办理进度百分比（基于状态）
  const getProgressPercent = (milestone: PreMilestone): number => {
    switch (milestone.status) {
      case '未开始': return 0
      case '进行中': {
        if (!milestone.planned_start_date || !milestone.planned_end_date) return 30
        const start = new Date(milestone.planned_start_date).getTime()
        const end = new Date(milestone.planned_end_date).getTime()
        const now = Date.now()
        return Math.min(90, Math.max(10, Math.round(((now - start) / (end - start)) * 100)))
      }
      case '已完成': return 100
      case '已延期': return 60
      case '已取消': return 0
      default: return 0
    }
  }

  // 解锁施工阶段 - 前端显示值是"已完成"，但调用API时后端检查的是DB值"已取得"
  const handleUnlockConstruction = async (milestone: PreMilestone) => {
    if (milestone.milestone_type !== '施工证' || milestone.status !== '已完成') {
      toast({ title: '操作受限', description: '只有已取得的施工证才能解锁施工阶段', variant: 'destructive' })
      return
    }
    
    openConfirm('解锁施工阶段', '确定要解锁施工阶段吗？解锁后项目将进入施工阶段。', async () => {
      try {
        const response = await fetch(`${API_BASE}/api/pre-milestones/${milestone.id}/unlock-construction`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: 'system' })
        })
        
        const result = await response.json()
        
        if (result.success) {
          toast({ title: '施工阶段已解锁', description: '项目已进入施工阶段' })
          fetchMilestones()
        } else {
          toast({ title: '解锁失败', description: result.error?.message || '请联系管理员', variant: 'destructive' })
        }
      } catch (error) {
        console.error('Failed to unlock construction:', error)
        toast({ title: '解锁失败', description: '请检查网络连接', variant: 'destructive' })
      }
    })
  }

  // 生成WBS结构
  const handleGenerateWBS = async (milestone: PreMilestone) => {
    openConfirm('生成WBS结构', '确定要生成默认施工阶段WBS结构吗？', async () => {
      try {
        const response = await fetch(`${API_BASE}/api/pre-milestones/${milestone.id}/generate-wbs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: 'system' })
        })
        
        const result = await response.json()
        
        if (result.success) {
          toast({ title: 'WBS 结构已生成', description: `已生成 ${result.data.nodes_generated} 个节点` })
        } else {
          toast({ title: '生成失败', description: result.error?.message || '请重试', variant: 'destructive' })
        }
      } catch (error) {
        console.error('Failed to generate WBS:', error)
        toast({ title: '生成失败', description: '请检查网络连接', variant: 'destructive' })
      }
    })
  }

  // 使用全局状态的 currentProject 名称
  const currentProjectName = currentProject?.name

  return (
    <div className="p-6 bg-[#F9FAFB] min-h-screen page-enter">
      {/* 面包屑导航（N07/N08） */}
      <Breadcrumb
        items={[
          { label: '公司驾驶舱', href: '/company' },
          ...(currentProjectName
            ? [{ label: currentProjectName, href: `/projects/${selectedProjectId}` }]
            : []),
          { label: '证照管理' },
          { label: '前期证照' },
        ]}
        className="mb-4"
      />
      {/* 页面标题（PageHeader 组件统一）*/}
      <PageHeader
        eyebrow="证照管理"
        title="前期证照"
        subtitle="在证照管理父模块下统一承接前期证照和施工图纸的办理进度。"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => selectedProjectId && navigate(`/projects/${selectedProjectId}/reports?view=license`)}
          disabled={!selectedProjectId}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          证照状态分析
        </Button>
      </PageHeader>

      {/* 根据当前Tab筛选数据 */}
      {(() => {
        const currentStatuses = (activeTab === 'construction-drawings' ? filteredDrawings : filteredMilestones).map(
          (item: any) =>
            activeTab === 'construction-drawings'
              ? normalizeDrawingLifecycleStatus(item.status, item.review_status)
              : normalizeLicenseLifecycleStatus(item.status),
        )
        const { totalCount, completedCount, inProgressCount, notStartedCount, delayedCount, completionRate } =
          countLifecycleStatuses(currentStatuses)
        
        return (
        <>
      {/* 顶部统计卡片（5个）- 按当前Tab统计 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          {
            label: '已完成',
            value: completedCount,
            icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
            textColor: 'text-emerald-700',
            numColor: 'text-emerald-600',
          },
          {
            label: '办理中',
            value: inProgressCount,
            icon: <Clock className="w-5 h-5 text-blue-600" />,
            bg: 'bg-blue-50',
            border: 'border-blue-100',
            textColor: 'text-blue-700',
            numColor: 'text-blue-600',
          },
          {
            label: '待办理',
            value: notStartedCount,
            icon: <FileText className="w-5 h-5 text-amber-600" />,
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            textColor: 'text-amber-700',
            numColor: 'text-amber-600',
          },
          {
            label: '已延期',
            value: delayedCount,
            icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
            bg: 'bg-red-50',
            border: 'border-red-100',
            textColor: 'text-red-700',
            numColor: 'text-red-600',
          },
          {
            label: '完成率',
            value: completionRate,
            suffix: '%',
            icon: <BarChart3 className="w-5 h-5 text-violet-600" />,
            bg: 'bg-violet-50',
            border: 'border-violet-100',
            textColor: 'text-violet-700',
            numColor: 'text-violet-600',
          },
        ].map((item, i) => (
          <div key={i} className={`${item.bg} border ${item.border} rounded-xl p-4 flex items-center gap-4 shadow-sm`}>
            <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center border ${item.border}`}>
              {item.icon}
            </div>
            <div>
              <div className={`text-2xl font-bold ${item.numColor}`}>{item.value}{item.suffix || ''}</div>
              <div className={`text-xs font-medium ${item.textColor}`}>{item.label}</div>
            </div>
          </div>
        ))}
      </div>
        </>
        )
      })()}

      {/* Tab 导航 */}
      <div className="card-v4 !p-0 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('pre-milestones')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'pre-milestones'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="flex items-center gap-2">
              前期证照
              <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">
                {milestones.length}
              </span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('construction-drawings')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'construction-drawings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="flex items-center gap-2">
              施工图纸
              <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">{drawings.length}</span>
            </span>
          </button>
        </div>
      </div>

      {/* 操作栏 */}
      {activeTab === 'pre-milestones' ? (
      <div className="card-v4 !p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* 项目选择 */}
          <select
            value={selectedProjectId}
            onChange={(e) => {
              const newId = e.target.value
              setSelectedProjectId(newId)
            }}
            disabled={projectsLoading || projects.length === 0}
            className="px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            {projectsLoading ? (
              <option value="all">加载项目中...</option>
            ) : projects.length === 0 ? (
              <option value="all">暂无项目</option>
            ) : (
              projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))
            )}
          </select>

          {/* 搜索 */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索证照名称或类型..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 状态筛选 */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {/* 视图切换按钮 */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-sm transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
              title="列表视图"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-2 text-sm transition-colors ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
              title="时间轴视图"
            >
              <Link2 className="w-4 h-4" />
            </button>
          </div>

          {/* 创建按钮 */}
          <ReadOnlyGuard action="create">
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            <span>新建证照</span>
          </button>
          </ReadOnlyGuard>
        </div>
      </div>
      ) : (
      <div className="card-v4 !p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* 搜索 */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索施工图纸..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 状态筛选 */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {/* 图纸类型筛选 */}
          <select
            value={drawingTypeFilter}
            onChange={(e) => setDrawingTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">全部类型</option>
            {DRAWING_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          {/* 视图切换按钮 */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-sm transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
              title="列表视图"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-2 text-sm transition-colors ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
              title="时间轴视图"
            >
              <Link2 className="w-4 h-4" />
            </button>
          </div>

          {/* 创建按钮 */}
          <button
            onClick={() => {
              setDrawingDialogMode('create')
              setSelectedDrawing(null)
              setDrawingForm({
                drawing_type: '建筑',
                drawing_name: '',
                version: '1.0',
                description: '',
                status: '编制中',
                design_unit: '',
                design_person: '',
                drawing_date: '',
                review_unit: '',
                review_status: '未提交',
                review_date: '',
                review_opinion: '',
                review_report_no: '',
                planned_submit_date: '',
                planned_pass_date: '',
                actual_submit_date: '',
                actual_pass_date: '',
                lead_unit: '',
                notes: '',
                sort_order: drawings.length,
              })
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            <span>新建图纸</span>
          </button>
        </div>
      </div>
      )}

      {/* 证照列表和施工图纸列表 */}
      {activeTab === 'pre-milestones' ? (
        <>
        {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mr-3" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : filteredMilestones.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="没有找到证照"
          description="该项目还没有创建任何前期证照"
          action={
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
            >
              <Plus className="w-5 h-5" />
              创建第一个证照
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMilestones.map(milestone => {
            const lifecycleStatus = normalizeLicenseLifecycleStatus(milestone.status)
            const statusKey = lifecycleStatus === '已完成' ? 'completed'
              : lifecycleStatus === '进行中' ? 'processing'
              : lifecycleStatus === '已延期' ? 'overdue'
              : lifecycleStatus === '已取消' ? 'cancelled'
              : 'pending'

            const progressPercent = getProgressPercent(milestone)
            const currentStep = getProcessStep(milestone)
            const isExpanded = expandedCards.has(milestone.id)

            const borderColor = statusKey === 'completed' ? 'border-emerald-200'
              : statusKey === 'processing' ? 'border-blue-200'
              : statusKey === 'overdue' ? 'border-red-200'
              : statusKey === 'cancelled' ? 'border-gray-200'
              : 'border-gray-200'

            const progressColor = statusKey === 'completed' ? 'bg-emerald-500'
              : statusKey === 'processing' ? 'bg-blue-500'
              : statusKey === 'overdue' ? 'bg-red-500'
              : statusKey === 'cancelled' ? 'bg-gray-400'
              : 'bg-amber-400'

            const statusBadge = {
              completed: 'bg-emerald-100 text-emerald-700',
              processing: 'bg-blue-100 text-blue-700',
              overdue: 'bg-red-100 text-red-700',
              cancelled: 'bg-gray-100 text-gray-600',
              pending: 'bg-gray-100 text-gray-600',
            }[statusKey]

            return (
              <div
                key={milestone.id}
                className={`bg-white rounded-xl border ${borderColor} shadow-sm hover:shadow-md transition-shadow p-4`}
              >
                {/* 卡片顶部：图标 + 名称 + 状态标签 */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      statusKey === 'completed' ? 'bg-emerald-50' :
                      statusKey === 'processing' ? 'bg-blue-50' :
                      statusKey === 'overdue' ? 'bg-red-50' : 'bg-gray-100'
                    }`}>
                    {statusKey === 'completed' && <CheckCircle className="w-5 h-5 text-emerald-600" />}
                    {statusKey === 'processing' && <Clock className="w-5 h-5 text-blue-600" />}
                    {statusKey === 'overdue' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                    {statusKey === 'cancelled' && <X className="w-5 h-5 text-gray-400" />}
                    {statusKey === 'pending' && <FileText className="w-5 h-5 text-gray-400" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-gray-900 text-sm leading-tight truncate">{milestone.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{milestone.milestone_type}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${statusBadge}`}>
                    {lifecycleStatus}
                  </span>
                </div>

                {/* 横向进度条 */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">办理进度</span>
                    <span className="text-xs font-medium text-gray-700">{progressPercent}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* 计划时间 + 牵头单位 */}
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{milestone.planned_end_date ? milestone.planned_end_date.slice(0, 10) : '未设置截止日'}</span>
                  </div>
                  {milestone.lead_unit && (
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[80px]">{milestone.lead_unit}</span>
                    </div>
                  )}
                </div>

                {/* 办理流程折叠区 */}
                <button
                  onClick={() => toggleCardExpand(milestone.id)}
                  className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 py-1.5 border-t border-gray-100 transition-colors"
                >
                  <span className="font-medium">办理流程</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {isExpanded && (
                  <div className="mt-2 pt-2">
                    {/* 5步流程节点 */}
                    <div className="flex items-center">
                      {PROCESS_STEPS.map((step, idx) => {
                        const isDone = currentStep >= idx
                        const isCurrent = currentStep === idx && milestone.status !== '已完成'
                        return (
                          <React.Fragment key={step}>
                            <div className="flex flex-col items-center">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                isDone && milestone.status === '已完成'
                                  ? 'bg-emerald-500 text-white'
                                  : isCurrent
                                  ? 'bg-blue-500 text-white ring-2 ring-blue-200'
                                  : isDone
                                  ? 'bg-blue-400 text-white'
                                  : 'bg-gray-100 text-gray-400'
                              }`}>
                                {isDone && !isCurrent ? (
                                  milestone.status === '已完成' && idx === 4
                                    ? <CheckCircle className="w-3.5 h-3.5" />
                                    : <span>{idx + 1}</span>
                                ) : (
                                  <span>{idx + 1}</span>
                                )}
                              </div>
                              <span className={`text-xs mt-1 whitespace-nowrap ${
                                isCurrent ? 'text-blue-600 font-medium' :
                                isDone ? 'text-gray-600' : 'text-gray-400'
                              }`}>{step}</span>
                            </div>
                            {idx < PROCESS_STEPS.length - 1 && (
                              <div className={`flex-1 h-0.5 mx-1 mb-4 ${
                                currentStep > idx ? (milestone.status === '已完成' ? 'bg-emerald-400' : 'bg-blue-300') : 'bg-gray-200'
                              }`} />
                            )}
                          </React.Fragment>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex items-center justify-end gap-1.5 mt-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => handleManageConditions(milestone)}
                    className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    前置条件
                  </button>
                  <button
                    onClick={() => handleEdit(milestone)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                    title="编辑"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(milestone.id)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
        </>
      ) : (
        <>
        {/* 施工图纸列表 — 独立数据源（construction_drawings 表） */}
        {drawingsLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mr-3" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : filteredDrawings.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="没有找到施工图纸"
            description="该项目还没有创建任何施工图纸"
            action={
              <button
                onClick={() => {
                  setDrawingDialogMode('create')
                  setSelectedDrawing(null)
                  setDrawingForm({
                    drawing_type: '建筑', drawing_name: '', version: '1.0',
                    description: '', status: '编制中', design_unit: '',
                    design_person: '', drawing_date: '', review_unit: '',
                    review_status: '未提交', review_date: '', review_opinion: '',
                    review_report_no: '', planned_submit_date: '',
                    planned_pass_date: '', actual_submit_date: '',
                    actual_pass_date: '', lead_unit: '', notes: '',
                    sort_order: 0,
                  })
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
              >
                <Plus className="w-5 h-5" />
                创建第一个施工图纸
              </button>
            }
          />
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDrawings.map(drawing => {
            const lifecycleStatus = normalizeDrawingLifecycleStatus(drawing.status, drawing.review_status)
            const drawingStatusStyle: Record<string, { border: string; bg: string; iconColor: string }> = {
              '未开始': { border: 'border-gray-200', bg: 'bg-gray-50', iconColor: 'text-gray-400' },
              '进行中': { border: 'border-blue-200', bg: 'bg-blue-50', iconColor: 'text-blue-600' },
              '已完成': { border: 'border-emerald-200', bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
              '已延期': { border: 'border-red-200', bg: 'bg-red-50', iconColor: 'text-red-600' },
              '已取消': { border: 'border-gray-200', bg: 'bg-gray-50', iconColor: 'text-gray-400' },
            }
            const style = drawingStatusStyle[lifecycleStatus] || drawingStatusStyle['未开始']
            const isExpanded = expandedCards.has(drawing.id)

            return (
            <div
              key={drawing.id}
              className={`bg-white rounded-xl border ${style.border} shadow-sm hover:shadow-md transition-shadow p-4`}
            >
              {/* 卡片顶部：类型标签 + 名称 + 版本 + 状态 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                    {lifecycleStatus === '未开始' && <FileText className="w-5 h-5 text-gray-400" />}
                    {lifecycleStatus === '进行中' && <Clock className="w-5 h-5 text-blue-600" />}
                    {lifecycleStatus === '已完成' && <CheckCircle className="w-5 h-5 text-emerald-600" />}
                    {lifecycleStatus === '已延期' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                    {lifecycleStatus === '已取消' && <X className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-900 text-sm leading-tight truncate">{drawing.drawing_name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{drawing.drawing_type}</span>
                      {drawing.version && <span className="text-xs text-gray-400">v{drawing.version}</span>}
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${style.bg.replace('-50', '-100')} ${style.iconColor}`}>
                  {lifecycleStatus}
                </span>
              </div>

              {/* 设计信息 */}
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                {drawing.design_unit && (
                  <div className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[120px]">{drawing.design_unit}</span>
                  </div>
                )}
                {drawing.drawing_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{drawing.drawing_date.slice(0, 10)}</span>
                  </div>
                )}
              </div>

              {/* 审图进度 */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">审图状态</span>
                  <span className={`text-xs font-medium ${
                    drawing.review_status === '已通过' ? 'text-emerald-600' :
                    drawing.review_status === '审查中' ? 'text-blue-600' :
                    drawing.review_status === '已驳回' || drawing.review_status === '需修改' ? 'text-red-600' :
                    'text-gray-500'
                  }`}>{drawing.review_status}</span>
                </div>
                {drawing.review_unit && (
                  <p className="text-xs text-gray-400">审图机构: {drawing.review_unit}</p>
                )}
              </div>

              {/* 展开/折叠详情 */}
              <button
                onClick={() => toggleCardExpand(drawing.id)}
                className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 py-1.5 border-t border-gray-100 transition-colors"
              >
                <span className="font-medium">详细信息</span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {isExpanded && (
                <div className="mt-2 pt-2 text-xs text-gray-500 space-y-1">
                  {drawing.design_person && <p>设计负责人: {drawing.design_person}</p>}
                  {drawing.review_report_no && <p>审图报告编号: {drawing.review_report_no}</p>}
                  {drawing.planned_submit_date && <p>计划提交: {drawing.planned_submit_date.slice(0, 10)}</p>}
                  {drawing.actual_submit_date && <p>实际提交: {drawing.actual_submit_date.slice(0, 10)}</p>}
                  {drawing.review_opinion && <p className="text-gray-600">审图意见: {drawing.review_opinion}</p>}
                  {drawing.description && <p className="text-gray-600">描述: {drawing.description}</p>}
                  {drawing.notes && <p className="text-gray-600">备注: {drawing.notes}</p>}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center justify-end gap-1.5 mt-3 pt-2 border-t border-gray-100">
                <button
                  onClick={() => {
                    setSelectedDrawing(drawing)
                    setDrawingDialogMode('edit')
                    setDrawingForm({
                      drawing_type: drawing.drawing_type,
                      drawing_name: drawing.drawing_name,
                      version: drawing.version || '1.0',
                      description: drawing.description || '',
                      status: drawing.status,
                      design_unit: drawing.design_unit || '',
                      design_person: drawing.design_person || '',
                      drawing_date: drawing.drawing_date || '',
                      review_unit: drawing.review_unit || '',
                      review_status: drawing.review_status,
                      review_date: drawing.review_date || '',
                      review_opinion: drawing.review_opinion || '',
                      review_report_no: drawing.review_report_no || '',
                      planned_submit_date: drawing.planned_submit_date || '',
                      planned_pass_date: drawing.planned_pass_date || '',
                      actual_submit_date: drawing.actual_submit_date || '',
                      actual_pass_date: drawing.actual_pass_date || '',
                      lead_unit: drawing.lead_unit || '',
                      notes: drawing.notes || '',
                      sort_order: drawing.sort_order,
                    })
                  }}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                  title="编辑"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteDrawing(drawing.id)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            )
          })}
        </div>
        )}
        </>
      )}

      {/* 创建/编辑对话框 */}
      {(dialogMode === 'create' || dialogMode === 'edit') && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{dialogMode === 'edit' ? '编辑证照' : '新建证照'}</h2>
              <button onClick={() => setDialogMode(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 证照名称：合并类型和名称，支持选择或自定义输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  证照名称 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="milestone-name-options"
                    value={formData.name}
                    onChange={(e) => {
                      const value = e.target.value
                      setFormData({ ...formData, name: value })
                      // 自动推断证照类型
                      const typeMap: Record<string, string> = {
                        '土地证': '土地证', '国有土地使用证': '土地证', '不动产证': '土地证',
                        '规划证': '规划证', '建设工程规划许可证': '规划证',
                        '施工证': '施工证', '建筑工程施工许可证': '施工证',
                        '预售证': '预售证', '商品房预售许可证': '预售证',
                        '产权证': '产权证', '不动产权证': '产权证', '房产证': '产权证',
                      }
                      const inferredType = typeMap[value] || (value ? '其他' : '')
                      setFormData(prev => ({ ...prev, name: value, milestone_type: inferredType || prev.milestone_type }))
                    }}
                    placeholder="选择或输入证照名称"
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="milestone-name-options">
                    <option value="国有土地使用证" />
                    <option value="不动产证" />
                    <option value="建设工程规划许可证" />
                    <option value="建筑工程施工许可证" />
                    <option value="商品房预售许可证" />
                    <option value="不动产权证" />
                    <option value="房产证" />
                    <option value="人防验收" />
                    <option value="消防验收" />
                    <option value="环保验收" />
                    <option value="竣工验收备案" />
                  </datalist>
                </div>
                {/* 快速选择按钮 */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {['土地证', '规划证', '施工证', '预售证', '产权证'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({ ...formData, name: type, milestone_type: type })}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        formData.name === type 
                          ? 'bg-blue-500 text-white border-blue-500' 
                          : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">计划开始日期</label>
                  <input
                    type="date"
                    value={formData.planned_start_date}
                    onChange={(e) => setFormData({ ...formData, planned_start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">计划结束日期</label>
                  <input
                    type="date"
                    value={formData.planned_end_date}
                    onChange={(e) => setFormData({ ...formData, planned_end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">牵头单位</label>
                <input
                  type="text"
                  value={formData.lead_unit}
                  onChange={(e) => setFormData({ ...formData, lead_unit: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setDialogMode(null)}
                className="px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 卡点管理对话框 */}
      {dialogMode === 'conditions' && selectedMilestone && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedMilestone.name} - 前置条件</h2>
                <p className="text-sm text-gray-500 mt-1">管理证照办理所需的各项前置条件</p>
              </div>
              <button
                onClick={() => setDialogMode(null)}
                className="p-2 hover:bg-gray-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* 添加条件 */}
              <div className="mb-6 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <h3 className="text-sm font-medium text-gray-900 mb-3">添加新条件</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">条件类型</label>
                    <select
                      value={conditionForm.condition_type}
                      onChange={(e) => setConditionForm({ ...conditionForm, condition_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">请选择</option>
                      <option value="资料">资料</option>
                      <option value="费用">费用</option>
                      <option value="审批">审批</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">目标日期</label>
                    <input
                      type="date"
                      value={conditionForm.target_date}
                      onChange={(e) => setConditionForm({ ...conditionForm, target_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">条件名称 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={conditionForm.condition_name}
                    onChange={(e) => setConditionForm({ ...conditionForm, condition_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">描述</label>
                  <textarea
                    value={conditionForm.description}
                    onChange={(e) => setConditionForm({ ...conditionForm, description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleAddCondition}
                  disabled={!conditionForm.condition_name}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  添加条件
                </button>
              </div>

              {/* 条件列表 */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  条件列表 ({conditions.length})
                </h3>
                {conditions.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-100">
                    <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">暂无前置条件</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {conditions.map(condition => (
                      <div
                        key={condition.id}
                        className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                {condition.condition_type}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                condition.status === '已确认' ? 'bg-emerald-100 text-emerald-700' :
                                condition.status === '已满足' ? 'bg-blue-100 text-blue-700' :
                                condition.status === '未满足' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {condition.status}
                              </span>
                            </div>
                            <h4 className="font-medium text-gray-900 mb-1">{condition.condition_name}</h4>
                            {condition.description && (
                              <p className="text-sm text-gray-600 mb-2">{condition.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              {condition.target_date && (
                                <div className="flex items-center">
                                  <Calendar className="w-3 h-3 mr-1" />
                                  {condition.target_date}
                                </div>
                              )}
                              {condition.completed_date && (
                                <div className="flex items-center text-emerald-600">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {condition.completed_date}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {condition.status === '待处理' && (
                              <button
                                onClick={() => handleUpdateConditionStatus(condition.id, '已满足')}
                                className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200 text-xs font-medium transition-colors"
                              >
                                标记完成
                              </button>
                            )}
                            {condition.status === '已满足' && (
                              <button
                                onClick={() => handleUpdateConditionStatus(condition.id, '已确认')}
                                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-xs font-medium transition-colors"
                              >
                                确认
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteCondition(condition.id)}
                              className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 施工图纸创建/编辑对话框 */}
      {drawingDialogMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {drawingDialogMode === 'edit' ? '编辑施工图纸' : '新建施工图纸'}
              </h2>
              <button onClick={() => setDrawingDialogMode(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 图纸名称 + 类型 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    图纸名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={drawingForm.drawing_name}
                    onChange={(e) => setDrawingForm({ ...drawingForm, drawing_name: e.target.value })}
                    placeholder="如：1#楼建筑施工图"
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">图纸类型</label>
                  <select
                    value={drawingForm.drawing_type}
                    onChange={(e) => setDrawingForm({ ...drawingForm, drawing_type: e.target.value as DrawingType })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {DRAWING_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 版本号 + 状态 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">版本号</label>
                  <input
                    type="text"
                    value={drawingForm.version}
                    onChange={(e) => setDrawingForm({ ...drawingForm, version: e.target.value })}
                    placeholder="1.0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">图纸状态</label>
                  <select
                    value={drawingForm.status}
                    onChange={(e) => setDrawingForm({ ...drawingForm, status: e.target.value as DrawingStatus })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {DRAWING_STATUSES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 设计信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">设计单位</label>
                  <input
                    type="text"
                    value={drawingForm.design_unit}
                    onChange={(e) => setDrawingForm({ ...drawingForm, design_unit: e.target.value })}
                    placeholder="设计院名称"
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">设计负责人</label>
                  <input
                    type="text"
                    value={drawingForm.design_person}
                    onChange={(e) => setDrawingForm({ ...drawingForm, design_person: e.target.value })}
                    placeholder="设计负责人姓名"
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 出图日期 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">出图日期</label>
                <input
                  type="date"
                  value={drawingForm.drawing_date}
                  onChange={(e) => setDrawingForm({ ...drawingForm, drawing_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 审图信息 */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">审图信息</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">审图机构</label>
                    <input
                      type="text"
                      value={drawingForm.review_unit}
                      onChange={(e) => setDrawingForm({ ...drawingForm, review_unit: e.target.value })}
                      placeholder="审图公司名称"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">审图状态</label>
                    <select
                      value={drawingForm.review_status}
                      onChange={(e) => setDrawingForm({ ...drawingForm, review_status: e.target.value as ReviewStatus })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {REVIEW_STATUSES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">审图报告编号</label>
                    <input
                      type="text"
                      value={drawingForm.review_report_no}
                      onChange={(e) => setDrawingForm({ ...drawingForm, review_report_no: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">审图完成日期</label>
                    <input
                      type="date"
                      value={drawingForm.review_date}
                      onChange={(e) => setDrawingForm({ ...drawingForm, review_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1 mt-3">审图意见</label>
                  <textarea
                    value={drawingForm.review_opinion}
                    onChange={(e) => setDrawingForm({ ...drawingForm, review_opinion: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="审图意见或修改要求"
                  />
                </div>
              </div>

              {/* 计划日期 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">计划提交审图日期</label>
                  <input
                    type="date"
                    value={drawingForm.planned_submit_date}
                    onChange={(e) => setDrawingForm({ ...drawingForm, planned_submit_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">计划通过审图日期</label>
                  <input
                    type="date"
                    value={drawingForm.planned_pass_date}
                    onChange={(e) => setDrawingForm({ ...drawingForm, planned_pass_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 牵头单位 + 备注 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">牵头单位</label>
                  <input
                    type="text"
                    value={drawingForm.lead_unit}
                    onChange={(e) => setDrawingForm({ ...drawingForm, lead_unit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
                  <input
                    type="text"
                    value={drawingForm.description}
                    onChange={(e) => setDrawingForm({ ...drawingForm, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                <textarea
                  value={drawingForm.notes}
                  onChange={(e) => setDrawingForm({ ...drawingForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setDrawingDialogMode(null)}
                className="px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveDrawing}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 时间轴视图 */}
      {activeTab === 'pre-milestones' && viewMode === 'timeline' && (
        <div className="card-v4">
          <div className="relative">
            {/* 时间轴线 */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200"></div>
            
            {/* 时间轴节点 */}
            <div className="space-y-8">
              {filteredMilestones
                .sort((a, b) => {
                  const dateA = a.planned_start_date || a.planned_end_date || ''
                  const dateB = b.planned_start_date || b.planned_end_date || ''
                  return dateA.localeCompare(dateB)
                })
                .map((milestone, index) => {
                  const statusKey = milestone.status === '已完成' ? 'completed'
                    : milestone.status === '进行中' ? 'processing'
                    : milestone.status === '已延期' ? 'overdue'
                    : 'pending'
                  
                  const dateInfo = milestone.planned_start_date 
                    ? `${milestone.planned_start_date}${milestone.planned_end_date ? ' ~ ' + milestone.planned_end_date : ''}`
                    : milestone.planned_end_date
                    ? milestone.planned_end_date
                    : '未设置时间'
                  
                  return (
                    <div key={milestone.id} className="relative flex items-start gap-6">
                      {/* 状态节点 */}
                      <div className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${
                        statusKey === 'completed' ? 'bg-emerald-100' :
                        statusKey === 'processing' ? 'bg-blue-100' :
                        statusKey === 'overdue' ? 'bg-red-100' :
                        'bg-gray-100'
                      }`}>
                        {statusKey === 'completed' && <CheckCircle className="w-8 h-8 text-emerald-600" />}
                        {statusKey === 'processing' && <Clock className="w-8 h-8 text-blue-600" />}
                        {statusKey === 'overdue' && <AlertTriangle className="w-8 h-8 text-red-600" />}
                        {statusKey === 'pending' && <FileText className="w-8 h-8 text-gray-400" />}
                      </div>
                      
                      {/* 内容卡片 */}
                      <div className="flex-1 bg-gray-50 rounded-xl p-4 hover:shadow-md transition-shadow border border-gray-100">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-gray-900">{milestone.name}</h3>
                            <p className="text-sm text-gray-500 mt-1">{milestone.milestone_type}</p>
                            <p className="text-xs text-gray-400 mt-2">{dateInfo}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              statusKey === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              statusKey === 'processing' ? 'bg-blue-100 text-blue-700' :
                              statusKey === 'overdue' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {milestone.status}
                            </span>
                            {milestone.milestone_type === '施工证' && milestone.status === '已完成' && (
                              <button
                                onClick={() => handleUnlockConstruction(milestone)}
                                className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs hover:bg-emerald-200 transition-colors"
                                title="解锁施工阶段"
                              >
                                解锁施工
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* 依赖箭头 - 显示前置证照 */}
                        {(() => {
                          // 从 dependencies 数据中找当前证照的前置依赖
                          const deps = dependencies.filter(d => d.pre_milestone_id === milestone.id)
                          const depNames = deps
                            .map(d => filteredMilestones.find(m => m.id === d.depends_on_id)?.name)
                            .filter(Boolean)
                          if (depNames.length === 0) return null
                          return (
                            <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                              <ArrowRight className="w-3 h-3 flex-shrink-0" />
                              <span>前置依赖: {depNames.join(', ')}</span>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}
            </div>
            
            {filteredMilestones.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无证照数据</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">确认删除</h3>
              <p className="text-gray-600">确定要删除此证照吗？此操作无法撤销。</p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

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

    </div>
  )
}
