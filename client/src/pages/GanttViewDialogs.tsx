import type { Dispatch, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  AlertOctagon,
  Calendar,
  CheckCircle2,
  Flag,
  GitBranch,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssigneeCombobox } from '@/components/AssigneeCombobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConflictDialog } from '@/components/ConflictDialog'
import { LoadingState } from '@/components/ui/loading-state'
import type { ConfirmDialogState } from '@/hooks/useConfirmDialog'
import { zhCN } from '@/i18n/zh-CN'
import { getStatusTheme } from '@/lib/statusTheme'
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { DataQualityLiveCheckSummary } from '@/services/dataQualityApi'
import type { ParticipantUnitRecord } from './GanttView/ParticipantUnitsDialog'
import {
  CONDITION_TYPES,
  MILESTONE_LEVEL_CONFIG,
  SPECIALTY_TYPES,
  type Task,
  type TaskCondition,
  type TaskObstacle,
} from './GanttViewTypes'

type TaskFormState = {
  name: string
  description: string
  status: string
  priority: string
  start_date: string
  end_date: string
  actual_start_date: string
  progress: number
  assignee_name: string
  assignee_user_id: string | null
  participant_unit_id: string | null
  responsible_unit: string
  dependencies: string[]
  parent_id: string | null
  milestone_id: string | null
  specialty_type: string
  reference_duration: string
}

type ProjectMemberOption = {
  userId: string
  displayName: string
  permissionLevel?: string | null
}

type ParticipantUnitOption = Pick<ParticipantUnitRecord, 'id' | 'unit_name' | 'unit_type'>

type AiDurationSuggestion = {
  estimated_duration: number
  confidence_level: string
  confidence_score: number
  factors: Record<string, unknown>
} | null

type ConflictState = {
  localVersion: Task
  serverVersion: Task
} | null

type ConditionPrecedingTask = {
  task_id: string
  title?: string
  name?: string
  status?: string
}

type TaskFormErrors = {
  name?: string
  start_date?: string
  end_date?: string
}

function hasStringId<T extends { id?: string | null }>(item: T): item is T & { id: string } {
  return typeof item.id === 'string' && item.id.length > 0
}

function getTaskStatusThemeKey(status?: string | null) {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'completed':
    case '已完成':
      return 'completed'
    case 'in_progress':
    case '进行中':
      return 'in_progress'
    case 'blocked':
    case '受阻':
      return 'warning'
    default:
      return 'open'
  }
}

export interface GanttViewDialogsProps {
  dialogOpen: boolean
  setDialogOpen: Dispatch<SetStateAction<boolean>>
  editingTask: Task | null
  newTaskParentId: string | null
  tasks: Task[]
  formData: TaskFormState
  setFormData: Dispatch<SetStateAction<TaskFormState>>
  taskFormErrors: TaskFormErrors
  setTaskFormErrors: Dispatch<SetStateAction<TaskFormErrors>>
  projectMembers: ProjectMemberOption[]
  participantUnits: ParticipantUnitOption[]
  onOpenParticipantUnits: () => void
  aiDurationLoading: boolean
  aiDurationSuggestion: AiDurationSuggestion
  fetchAiDurationSuggestion: () => void
  applyAiDuration: () => void
  handleDependencyChange: (taskId: string, checked: boolean) => void
  handleSaveTask: () => void
  taskSaving: boolean
  liveCheckSummary: DataQualityLiveCheckSummary | null
  liveCheckLoading: boolean
  progressInputBlocked: boolean
  progressInputHint: string
  milestoneOptions: Task[]
  isOnCriticalPath: (taskId: string) => boolean
  conflictOpen: boolean
  setConflictOpen: Dispatch<SetStateAction<boolean>>
  conflictData: ConflictState
  handleKeepLocal: () => void
  handleKeepServer: () => void
  handleMerge: () => void
  milestoneDialogOpen: boolean
  setMilestoneDialogOpen: Dispatch<SetStateAction<boolean>>
  milestoneTargetTask: Task | null
  handleSelectMilestoneLevel: (level: number | null) => void
  conditionDialogOpen: boolean
  setConditionDialogOpen: Dispatch<SetStateAction<boolean>>
  conditionTask: Task | null
  conditionsLoading: boolean
  taskConditions: TaskCondition[]
  conditionPrecedingTasks: Record<string, ConditionPrecedingTask[]>
  newConditionName: string
  setNewConditionName: Dispatch<SetStateAction<string>>
  newConditionType: string
  setNewConditionType: Dispatch<SetStateAction<string>>
  newConditionTargetDate: string
  setNewConditionTargetDate: Dispatch<SetStateAction<string>>
  newConditionDescription: string
  setNewConditionDescription: Dispatch<SetStateAction<string>>
  newConditionResponsibleUnit: string
  setNewConditionResponsibleUnit: Dispatch<SetStateAction<string>>
  newConditionPrecedingTaskIds: string[]
  setNewConditionPrecedingTaskIds: Dispatch<SetStateAction<string[]>>
  handleAddCondition: () => void
  handleToggleCondition: (condition: TaskCondition) => void
  handleDeleteCondition: (conditionId: string) => void
  handleAdminForceSatisfyCondition: (condition: TaskCondition) => void
  forceSatisfyDialogOpen: boolean
  setForceSatisfyDialogOpen: Dispatch<SetStateAction<boolean>>
  forceSatisfyCondition: TaskCondition | null
  forceSatisfyReason: string
  setForceSatisfyReason: Dispatch<SetStateAction<string>>
  confirmAdminForceSatisfyCondition: () => void
  canAdminForceSatisfyCondition: boolean
  obstacleDialogOpen: boolean
  setObstacleDialogOpen: Dispatch<SetStateAction<boolean>>
  obstacleTask: Task | null
  obstaclesLoading: boolean
  taskObstacles: TaskObstacle[]
  newObstacleTitle: string
  setNewObstacleTitle: Dispatch<SetStateAction<string>>
  newObstacleSeverity: string
  setNewObstacleSeverity: Dispatch<SetStateAction<string>>
  newObstacleExpectedResolutionDate: string
  setNewObstacleExpectedResolutionDate: Dispatch<SetStateAction<string>>
  newObstacleResolutionNotes: string
  setNewObstacleResolutionNotes: Dispatch<SetStateAction<string>>
  editingObstacleId: string | null
  setEditingObstacleId: Dispatch<SetStateAction<string | null>>
  editingObstacleTitle: string
  setEditingObstacleTitle: Dispatch<SetStateAction<string>>
  editingObstacleSeverity: string
  setEditingObstacleSeverity: Dispatch<SetStateAction<string>>
  editingObstacleExpectedResolutionDate: string
  setEditingObstacleExpectedResolutionDate: Dispatch<SetStateAction<string>>
  editingObstacleResolutionNotes: string
  setEditingObstacleResolutionNotes: Dispatch<SetStateAction<string>>
  handleAddObstacle: () => void
  handleResolveObstacle: (obstacle: TaskObstacle) => void
  handleDeleteObstacle: (obstacleId: string) => void
  handleSaveObstacleEdit: (obstacleId: string) => void
  onOpenRiskWorkspaceForObstacle: (obstacle: TaskObstacle) => void
  newTaskConditionPromptId: string | null
  setNewTaskConditionPromptId: Dispatch<SetStateAction<string | null>>
  openConditionDialogByTaskId: (taskId: string) => void
  confirmDialog: ConfirmDialogState
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState>>
}

export function GanttViewDialogs(props: GanttViewDialogsProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const selectedParticipantUnit = props.participantUnits.find((unit) => unit.id === props.formData.participant_unit_id) ?? null
  const parentTaskName = props.newTaskParentId
    ? props.tasks.find((task) => task.id === props.newTaskParentId)?.title
      || props.tasks.find((task) => task.id === props.newTaskParentId)?.name
      || ''
    : ''

  return (
    <>
      <Dialog open={props.dialogOpen} onOpenChange={props.setDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {props.editingTask ? '编辑任务' : props.newTaskParentId ? '添加子任务' : '新建任务'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {props.editingTask ? '修改任务的名称、日期和属性' : '填写新任务的基本信息'}
            </DialogDescription>
            {props.newTaskParentId && !props.editingTask && (
              <p className="text-xs text-muted-foreground">上级任务：{parentTaskName}</p>
            )}
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4 pr-2">
            <div className="space-y-2">
              <Label>任务名称 <span className="text-red-500">*</span></Label>
              <Input
                value={props.formData.name}
                onChange={(event) => {
                  props.setTaskFormErrors((previous) => ({ ...previous, name: undefined }))
                  props.setFormData({ ...props.formData, name: event.target.value })
                }}
                placeholder="输入任务名称"
              />
              {props.taskFormErrors.name && <p className="text-xs text-red-600">{props.taskFormErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>开始日期 <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  data-testid="delay-start-date-input"
                  value={props.formData.start_date}
                  onChange={(event) => {
                    props.setTaskFormErrors((previous) => ({ ...previous, start_date: undefined }))
                    props.setFormData({ ...props.formData, start_date: event.target.value })
                  }}
                />
                {props.taskFormErrors.start_date && <p className="text-xs text-red-600">{props.taskFormErrors.start_date}</p>}
              </div>
              <div className="space-y-2">
                <Label>结束日期 <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  data-testid="delay-end-date-input"
                  value={props.formData.end_date}
                  onChange={(event) => {
                    props.setTaskFormErrors((previous) => ({ ...previous, end_date: undefined }))
                    props.setFormData({ ...props.formData, end_date: event.target.value })
                  }}
                />
                {props.taskFormErrors.end_date && <p className="text-xs text-red-600">{props.taskFormErrors.end_date}</p>}
              </div>
              <div className={advancedOpen ? "space-y-2" : "hidden"}>
                <Label>实际开始日期</Label>
                <Input
                  type="date"
                  data-testid="task-actual-start-date-input"
                  value={props.formData.actual_start_date}
                  onChange={(event) => props.setFormData({ ...props.formData, actual_start_date: event.target.value })}
                />
              </div>
            </div>

            {advancedOpen && props.editingTask && (
              <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-blue-700">AI 工期建议</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 border-blue-200 px-2 text-xs text-blue-600 hover:bg-blue-100"
                    onClick={props.fetchAiDurationSuggestion}
                    disabled={props.aiDurationLoading}
                  >
                    {props.aiDurationLoading ? '计算中...' : '获取建议'}
                  </Button>
                </div>
                {props.aiDurationSuggestion ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-blue-800">
                        建议工期：{props.aiDurationSuggestion.estimated_duration} 天
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-xs ${
                          props.aiDurationSuggestion.confidence_level === 'high'
                            ? getStatusTheme('completed').className
                            : props.aiDurationSuggestion.confidence_level === 'medium'
                              ? getStatusTheme('medium').className
                              : getStatusTheme('open').className
                        }`}
                      >
                        置信度 {Math.round((props.aiDurationSuggestion.confidence_score || 0) * 100)}%
                      </span>
                    </div>
                    <Button type="button" size="sm" className="h-6 px-2 text-xs" onClick={props.applyAiDuration}>
                      应用此工期
                    </Button>
                  </div>
                ) : (
                  !props.aiDurationLoading && <div className="h-1" />
                )}
              </div>
            )}

            <div className={advancedOpen ? 'grid grid-cols-2 gap-4' : 'hidden'}>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select
                  value={props.formData.status}
                  onValueChange={(value) => props.setFormData({ ...props.formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">待开始</SelectItem>
                    <SelectItem value="in_progress">进行中</SelectItem>
                    <SelectItem value="completed">已完成</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{zhCN.gantt.priority}</Label>
                <Select
                  value={props.formData.priority}
                  onValueChange={(value) => props.setFormData({ ...props.formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择优先级" />
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

            <div className={advancedOpen ? 'space-y-2' : 'hidden'}>
              <Label>{zhCN.gantt.progress}</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={props.formData.progress}
                onChange={(event) => props.setFormData({ ...props.formData, progress: parseInt(event.target.value, 10) || 0 })}
                disabled={props.progressInputBlocked}
                title={props.progressInputBlocked ? props.progressInputHint : undefined}
              />
              <p className={`text-xs ${props.progressInputBlocked ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {props.progressInputHint}
              </p>
            </div>

            <div
              data-testid="gantt-live-data-quality-check"
              className={advancedOpen ? `rounded-2xl border px-4 py-3 ${
                props.liveCheckSummary?.count
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-slate-200 bg-slate-50'
              }` : 'hidden'}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">即时数据校验</div>
                  <div className="mt-1 text-sm text-slate-700">
                    {props.liveCheckLoading
                      ? '正在核对当前草稿与前后置、条件、父子层级之间的关系。'
                      : props.liveCheckSummary?.count
                        ? props.liveCheckSummary.summary
                        : '当前草稿未发现交叉矛盾，可继续保存。'}
                  </div>
                </div>
                {props.liveCheckSummary?.count ? (
                  <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-800">
                    {props.liveCheckSummary.count} 条待确认
                  </span>
                ) : null}
              </div>

              {props.liveCheckSummary?.items?.length ? (
                <div className="mt-3 space-y-2">
                  {props.liveCheckSummary.items.map((item) => (
                    <div key={item.id} className="rounded-xl border border-amber-100 bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-slate-900">{item.taskTitle}</div>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {item.severity === 'critical' ? '严重' : item.severity === 'warning' ? '警告' : '关注'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-600">{item.summary}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{zhCN.gantt.assignee}</Label>
                <AssigneeCombobox
                  members={props.projectMembers}
                  valueName={props.formData.assignee_name}
                  valueUserId={props.formData.assignee_user_id}
                  placeholder={zhCN.gantt.assigneePlaceholder}
                  onChange={(value) => props.setFormData({
                    ...props.formData,
                    assignee_name: value.assignee_name,
                    assignee_user_id: value.assignee_user_id,
                  })}
                />
                {props.formData.assignee_name.trim() ? (
                  props.formData.assignee_user_id ? (
                    <p className="text-xs text-emerald-600">该责任人已关联项目成员账号，后续提醒与责任汇总会按该成员归集。</p>
                  ) : (
                    <p data-testid="gantt-assignee-link-hint" className="text-xs text-amber-600">该责任人尚未关联账号，可稍后在团队管理的“待关联责任人”里补做关联。</p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">优先关联项目成员；若需录入外部责任人，可直接手工填写。</p>
                )}
              </div>
              <div className={advancedOpen ? 'space-y-2' : 'hidden'}>
                <div className="flex items-center justify-between gap-2">
                  <Label>责任单位</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={props.onOpenParticipantUnits}>
                    维护台账
                  </Button>
                </div>
                <Select
                  value={selectedParticipantUnit ? selectedParticipantUnit.id : '__manual__'}
                  onValueChange={(value) => {
                    if (value === '__manual__') {
                      props.setFormData({ ...props.formData, participant_unit_id: null })
                      return
                    }
                    const nextUnit = props.participantUnits.find((unit) => unit.id === value)
                    props.setFormData({
                      ...props.formData,
                      participant_unit_id: value,
                      responsible_unit: nextUnit?.unit_name ?? props.formData.responsible_unit,
                    })
                  }}
                >
                  <SelectTrigger data-testid="gantt-task-participant-unit-select">
                    <SelectValue placeholder="优先从项目级参建单位选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">手工输入</SelectItem>
                    {props.participantUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.unit_type ? `${unit.unit_name} · ${unit.unit_type}` : unit.unit_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {props.formData.participant_unit_id ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                    {selectedParticipantUnit
                      ? `已绑定项目级单位：${selectedParticipantUnit.unit_name}${selectedParticipantUnit.unit_type ? `（${selectedParticipantUnit.unit_type}）` : ''}。若需录入临时部门，可切回“手工输入”。`
                      : `已绑定单位：${props.formData.responsible_unit || '未命名单位'}。若台账刚更新未刷新，可稍后重开此弹窗确认。`}
                  </div>
                ) : (
                  <Input
                    value={props.formData.responsible_unit}
                    onChange={(event) => props.setFormData({
                      ...props.formData,
                      participant_unit_id: null,
                      responsible_unit: event.target.value,
                    })}
                    placeholder="输入责任单位或部门"
                  />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <button
                type="button"
                onClick={() => setAdvancedOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={advancedOpen}
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">高级选项</p>
                </div>
                {advancedOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
              </button>
            </div>

            {advancedOpen && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{zhCN.gantt.specialty}（可选）</Label>
                    <Select
                      value={props.formData.specialty_type || '__none__'}
                      onValueChange={(value) => props.setFormData({ ...props.formData, specialty_type: value === '__none__' ? '' : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={zhCN.gantt.specialtyPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{zhCN.gantt.specialtyPlaceholder}</SelectItem>
                        {SPECIALTY_TYPES.map((specialty) => (
                          <SelectItem key={specialty.value} value={specialty.value}>
                            {specialty.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{zhCN.gantt.plannedDuration}</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder={zhCN.gantt.referenceDurationPlaceholder}
                      value={props.formData.reference_duration}
                      onChange={(event) => props.setFormData({ ...props.formData, reference_duration: event.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{zhCN.gantt.parentTask}（可选）</Label>
                  <Select
                    value={props.formData.parent_id || '__none__'}
                    onValueChange={(value) => props.setFormData({ ...props.formData, parent_id: value === '__none__' ? null : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="无（顶级任务）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">无（顶级任务）</SelectItem>
                      {props.tasks
                        .filter(hasStringId)
                        .filter((task) => task.id !== props.editingTask?.id)
                        .map((task) => (
                          <SelectItem key={task.id} value={task.id}>
                            {task.title || task.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>所属里程碑（可选）</Label>
                  <Select
                    value={props.formData.milestone_id || '__none__'}
                    onValueChange={(value) => props.setFormData({ ...props.formData, milestone_id: value === '__none__' ? null : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="无所属里程碑" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">无所属里程碑</SelectItem>
                      {props.milestoneOptions
                        .filter(hasStringId)
                        .map((milestone) => (
                          <SelectItem key={milestone.id} value={milestone.id}>
                            {milestone.title || milestone.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {props.tasks.length > 1 && (
                  <div className="space-y-2">
                    <Label>{zhCN.gantt.predecessorTasks}</Label>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                      {props.tasks
                        .filter(hasStringId)
                        .filter((task) => task.id !== props.editingTask?.id)
                        .map((task) => (
                          <label key={task.id} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-accent">
                            <input
                              type="checkbox"
                              checked={(props.formData.dependencies || []).includes(task.id)}
                              onChange={(event) => props.handleDependencyChange(task.id, event.target.checked)}
                              className="rounded border-input"
                            />
                            <span className="text-sm">{task.title || task.name}</span>
                            {props.isOnCriticalPath(task.id) && <AlertCircle className="h-3 w-3 text-red-500" />}
                          </label>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{zhCN.gantt.predecessorHelp}</p>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter className="border-t bg-background pt-4">
            <Button variant="outline" onClick={() => props.setDialogOpen(false)}>取消</Button>
            <Button onClick={props.handleSaveTask} disabled={props.taskSaving}>
              <Save className="mr-2 h-4 w-4" />
              {props.taskSaving ? '保存中' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConflictDialog
        open={props.conflictOpen}
        onOpenChange={props.setConflictOpen}
        localVersion={props.conflictData?.localVersion as Task || ({} as Task)}
        serverVersion={props.conflictData?.serverVersion as Task || ({} as Task)}
        onKeepLocal={props.handleKeepLocal}
        onKeepServer={props.handleKeepServer}
        onMerge={props.handleMerge}
        itemType="task"
      />

      <Dialog open={props.milestoneDialogOpen} onOpenChange={props.setMilestoneDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-amber-500" />
              设置里程碑
            </DialogTitle>
            <DialogDescription className="sr-only">为当前任务配置里程碑标记</DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              任务：<span className="font-medium text-foreground">{props.milestoneTargetTask?.title || props.milestoneTargetTask?.name}</span>
            </p>
            <div className="grid gap-2">
              <button
                onClick={() => props.handleSelectMilestoneLevel(null)}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent ${!props.milestoneTargetTask?.is_milestone ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <Flag className="h-4 w-4 text-gray-300" />
                <div className="text-left">
                  <div className="text-sm font-medium">普通任务</div>
                  <div className="text-xs text-muted-foreground">取消里程碑标记</div>
                </div>
              </button>
              {[1, 2, 3].map((level) => {
                const config = MILESTONE_LEVEL_CONFIG[level]
                const isSelected = props.milestoneTargetTask?.is_milestone && props.milestoneTargetTask?.milestone_level === level
                return (
                  <button
                    key={level}
                    onClick={() => props.handleSelectMilestoneLevel(level)}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent ${isSelected ? `border-current ${config.bgColor} ${config.color}` : 'border-border'}`}
                  >
                    <Flag className={`h-4 w-4 ${config.color}`} fill="currentColor" />
                    <div className="text-left">
                      <div className={`text-sm font-medium ${config.color}`}>{config.label}</div>
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
            <Button variant="outline" onClick={() => props.setMilestoneDialogOpen(false)}>取消</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.conditionDialogOpen} onOpenChange={props.setConditionDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              开工条件管理
            </DialogTitle>
            <DialogDescription className="sr-only">管理当前任务的开工条件列表</DialogDescription>
            <p className="text-xs text-muted-foreground mt-1">
              任务：<span className="font-medium text-foreground">{props.conditionTask?.title || props.conditionTask?.name}</span>
            </p>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-2 p-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
              <div className="flex gap-2">
                <Select value={props.newConditionType} onValueChange={props.setNewConditionType}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue placeholder="类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-xs">{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="输入开工条件"
                  value={props.newConditionName}
                  onChange={(event) => props.setNewConditionName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && props.handleAddCondition()}
                  className="flex-1 h-8 text-sm"
                />
              </div>
              <Input
                placeholder="备注（可选）"
                value={props.newConditionDescription}
                onChange={(event) => props.setNewConditionDescription(event.target.value)}
                className="h-7 text-xs"
              />
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1.5 flex-1">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  <label className="text-xs text-gray-500">目标日期</label>
                  <Input
                    type="date"
                    value={props.newConditionTargetDate}
                    onChange={(event) => props.setNewConditionTargetDate(event.target.value)}
                    className="h-7 text-xs flex-1"
                  />
                </div>
                <Input
                  placeholder="责任单位"
                  value={props.newConditionResponsibleUnit}
                  onChange={(event) => props.setNewConditionResponsibleUnit(event.target.value)}
                  className="h-7 text-xs w-28"
                />
                {props.newConditionType === 'preceding' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs flex-1 justify-start gap-1.5 border-amber-200 bg-amber-50/50 hover:bg-amber-50"
                      >
                        <GitBranch className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        {props.newConditionPrecedingTaskIds.length === 0 ? (
                          <span className="text-gray-400">选择前置任务（可多选）</span>
                        ) : (
                          <span className="text-amber-700 font-medium truncate">已选 {props.newConditionPrecedingTaskIds.length} 个前置任务</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <div className="px-3 py-2 border-b bg-gray-50">
                        <p className="text-xs text-gray-500">勾选所有前置任务（可多选）</p>
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1">
                        {props.tasks
                          .filter(hasStringId)
                          .filter((task) => props.conditionTask && task.id !== props.conditionTask.id)
                          .map((task) => {
                            const checked = props.newConditionPrecedingTaskIds.includes(task.id)
                            return (
                              <label key={task.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    if (event.target.checked) {
                                      props.setNewConditionPrecedingTaskIds((previous) => [...previous, task.id])
                                    } else {
                                      props.setNewConditionPrecedingTaskIds((previous) => previous.filter((id) => id !== task.id))
                                    }
                                  }}
                                  className="accent-amber-500 w-3.5 h-3.5"
                                />
                                <span className="text-xs text-gray-700 truncate flex-1">{task.title || task.name}</span>
                                {task.status && (
                                  <span className={`rounded px-1 text-[10px] ${getStatusTheme(getTaskStatusThemeKey(task.status)).className}`}>
                                    {getStatusTheme(getTaskStatusThemeKey(task.status), task.status).label}
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
              {props.newConditionType === 'preceding' && props.newConditionPrecedingTaskIds.length > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  已选 {props.newConditionPrecedingTaskIds.length} 个前置任务 — 全部完成时，此条件自动满足
                </p>
              )}
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {props.conditionsLoading ? (
                <LoadingState
                  label="开工条件加载中"
                  className="min-h-24 py-4"
                />
              ) : props.taskConditions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无开工条件</p>
              ) : (
                props.taskConditions.map((condition) => {
                  const typeConfig = CONDITION_TYPES.find((item) => item.value === condition.condition_type)
                  const isOverdue = !condition.is_satisfied && condition.target_date && new Date(condition.target_date) < new Date()
                  return (
                    <div
                      key={condition.id}
                      className={`flex items-start gap-2 p-2.5 rounded-xl border transition-colors ${
                        condition.is_satisfied ? 'bg-green-50 border-green-200' : isOverdue ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <button
                        onClick={() => props.handleToggleCondition(condition)}
                        className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          condition.is_satisfied ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-emerald-400'
                        }`}
                      >
                        {condition.is_satisfied && <CheckCircle2 className="h-3 w-3" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${condition.is_satisfied ? 'line-through text-gray-400' : 'text-gray-700'}`}>{condition.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {typeConfig && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeConfig.color}`}>{typeConfig.label}</span>}
                          {condition.target_date && (
                            <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                              <Calendar className="h-2.5 w-2.5" />
                              {isOverdue ? '已超期: ' : ''}{condition.target_date}
                            </span>
                          )}
                          {(props.conditionPrecedingTasks[condition.id] || []).map((precedingTask) => (
                            <span
                              key={precedingTask.task_id}
                              className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                precedingTask.status === '已完成' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                              }`}
                              title={`前置任务: ${precedingTask.title || precedingTask.name}`}
                            >
                              <GitBranch className="h-2.5 w-2.5 flex-shrink-0" />
                              {precedingTask.title || precedingTask.name}
                            </span>
                          ))}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${condition.is_satisfied ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                            {condition.is_satisfied ? '已满足' : '未满足'}
                          </span>
                        </div>
                        {!condition.is_satisfied && props.canAdminForceSatisfyCondition && (
                          <div className="mt-2 flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 border-amber-200 text-xs text-amber-700 hover:bg-amber-50"
                              onClick={() => props.handleAdminForceSatisfyCondition(condition)}
                            >
                              强制满足
                            </Button>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => props.handleDeleteCondition(condition.id)}
                        className="flex-shrink-0 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            {props.taskConditions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                已满足 {props.taskConditions.filter((condition) => condition.is_satisfied).length}/{props.taskConditions.length} 个条件
                {props.taskConditions.every((condition) => condition.is_satisfied) && (
                  <span className="ml-1.5 text-green-600 font-medium">全部满足，可以开工</span>
                )}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => props.setConditionDialogOpen(false)}>关闭</Button>
            <Button onClick={props.handleAddCondition} disabled={!props.newConditionName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              保存条件
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={props.forceSatisfyDialogOpen}
        onOpenChange={(open) => {
          props.setForceSatisfyDialogOpen(open)
          if (!open) {
            props.setForceSatisfyReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]" data-testid="gantt-force-satisfy-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              强制满足条件
            </DialogTitle>
            <DialogDescription className="sr-only">管理员强制标记开工条件为已满足</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <div className="font-medium">{props.forceSatisfyCondition?.name ?? '当前条件'}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gantt-force-satisfy-reason">强制满足原因</Label>
              <Textarea
                id="gantt-force-satisfy-reason"
                value={props.forceSatisfyReason}
                onChange={(event) => props.setForceSatisfyReason(event.target.value)}
                placeholder="请输入管理员确认依据，例如：现场签认完成，允许继续推进。"
                rows={4}
                data-testid="gantt-force-satisfy-reason"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                props.setForceSatisfyDialogOpen(false)
                props.setForceSatisfyReason('')
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={props.confirmAdminForceSatisfyCondition}
              disabled={!props.forceSatisfyReason.trim()}
              data-testid="gantt-force-satisfy-confirm"
            >
              确认强制满足
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.obstacleDialogOpen} onOpenChange={props.setObstacleDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-amber-600" />
              阻碍记录
            </DialogTitle>
            <DialogDescription className="sr-only">查看和管理当前任务的阻碍记录</DialogDescription>
            <p className="text-xs text-muted-foreground mt-1">
              任务：<span className="font-medium text-foreground">{props.obstacleTask?.title || props.obstacleTask?.name}</span>
            </p>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="阻碍备注"
                value={props.newObstacleTitle}
                onChange={(event) => props.setNewObstacleTitle(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && props.handleAddObstacle()}
                className="flex-1"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
              <Select value={props.newObstacleSeverity} onValueChange={props.setNewObstacleSeverity}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="严重程度" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="低">低</SelectItem>
                  <SelectItem value="中">中</SelectItem>
                  <SelectItem value="高">高</SelectItem>
                  <SelectItem value="严重">严重</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={props.newObstacleExpectedResolutionDate}
                onChange={(event) => props.setNewObstacleExpectedResolutionDate(event.target.value)}
                placeholder="预计解决日期"
              />
            </div>
            <textarea
              value={props.newObstacleResolutionNotes}
              onChange={(event) => props.setNewObstacleResolutionNotes(event.target.value)}
              placeholder="处理备注 / 协调情况（可选）"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {props.obstaclesLoading ? (
                <LoadingState
                  label="阻碍记录加载中"
                  className="min-h-24 py-4"
                />
              ) : props.taskObstacles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无阻碍记录</p>
              ) : (
                props.taskObstacles.map((obstacle) => {
                  const daysSince = Math.floor((Date.now() - new Date(obstacle.created_at).getTime()) / 86400000)
                  const isLongTerm = !obstacle.is_resolved && daysSince > 3
                  const isCritical = !obstacle.is_resolved && daysSince > 7
                  const escalatedSeverity = isCritical
                    ? '严重'
                    : isLongTerm && ['low', 'medium', '低', '中'].includes(String(obstacle.severity || '').trim().toLowerCase())
                      ? '高'
                      : obstacle.severity || '中'
                  const isEditing = props.editingObstacleId === obstacle.id
                  return (
                    <div
                      key={obstacle.id}
                      className={`p-2.5 rounded-xl border transition-colors ${
                        obstacle.is_resolved ? 'bg-gray-50 border-gray-200 opacity-60' : isCritical ? 'bg-red-50 border-red-300' : isLongTerm ? 'bg-orange-50 border-orange-300' : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="space-y-2">
                              <div className="flex gap-1">
                                <Input
                                  value={props.editingObstacleTitle}
                                  onChange={(event) => props.setEditingObstacleTitle(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') props.handleSaveObstacleEdit(obstacle.id)
                                  if (event.key === 'Escape') {
                                    props.setEditingObstacleId(null)
                                    props.setEditingObstacleTitle('')
                                    props.setEditingObstacleSeverity('medium')
                                    props.setEditingObstacleExpectedResolutionDate('')
                                    props.setEditingObstacleResolutionNotes('')
                                  }
                                }}
                                  className="h-7 text-xs flex-1"
                                  autoFocus
                                />
                                <Button size="sm" className="h-7 px-2" onClick={() => props.handleSaveObstacleEdit(obstacle.id)}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={() => {
                                    props.setEditingObstacleId(null)
                                    props.setEditingObstacleTitle('')
                                    props.setEditingObstacleSeverity('medium')
                                    props.setEditingObstacleExpectedResolutionDate('')
                                    props.setEditingObstacleResolutionNotes('')
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-3">
                                <select
                                  value={props.editingObstacleSeverity}
                                  onChange={(event) => props.setEditingObstacleSeverity(event.target.value)}
                                  className="h-8 rounded-md border border-slate-200 px-2 text-xs"
                                >
                                  <option value="low">低</option>
                                  <option value="medium">中</option>
                                  <option value="high">高</option>
                                  <option value="critical">严重</option>
                                </select>
                                <Input
                                  type="date"
                                  value={props.editingObstacleExpectedResolutionDate}
                                  onChange={(event) => props.setEditingObstacleExpectedResolutionDate(event.target.value)}
                                  className="h-8 text-xs"
                                />
                                <Input
                                  value={props.editingObstacleResolutionNotes}
                                  onChange={(event) => props.setEditingObstacleResolutionNotes(event.target.value)}
                                  placeholder="处理备注"
                                  className="h-8 text-xs sm:col-span-1"
                                />
                              </div>
                            </div>
                          ) : (
                            <p className={`text-sm ${obstacle.is_resolved ? 'line-through text-gray-400' : 'text-gray-800'}`}>{obstacle.title}</p>
                          )}
                          {!isEditing && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {obstacle.severity && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                                  严重程度 · {obstacle.severity}
                                </span>
                              )}
                              {!obstacle.is_resolved && escalatedSeverity !== (obstacle.severity || '中') && (
                                <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">
                                  升级后 · {escalatedSeverity}
                                </span>
                              )}
                              {obstacle.severity_escalated_at && (
                                <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">
                                  已升级 · {new Date(obstacle.severity_escalated_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                                </span>
                              )}
                              {obstacle.expected_resolution_date && (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                                  预计解决 · {obstacle.expected_resolution_date}
                                </span>
                              )}
                              {isCritical && (
                                <span className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${getStatusTheme('critical').className}`}>
                                  <AlertCircle className="h-2.5 w-2.5" />长期阻碍·{daysSince}天
                                </span>
                              )}
                              {isLongTerm && !isCritical && (
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getStatusTheme('warning').className}`}>超时·{daysSince}天</span>
                              )}
                              {!isLongTerm && !obstacle.is_resolved && <span className="text-[10px] text-gray-400">{daysSince}天前</span>}
                            </div>
                          )}
                          {obstacle.description && !isEditing && <p className="text-xs text-muted-foreground mt-0.5">{obstacle.description}</p>}
                          {obstacle.resolution_notes && !isEditing && (
                            <p className="mt-0.5 text-xs text-slate-500">处理备注：{obstacle.resolution_notes}</p>
                          )}
                          {!isEditing && obstacle.obstacle_type === '设计' && props.obstacleTask?.project_id && (
                            <div className="mt-1">
                              <Link
                                to={`/projects/${props.obstacleTask.project_id}/drawings${props.obstacleTask.specialty_type ? `?specialty=${props.obstacleTask.specialty_type}` : ''}`}
                                className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800"
                                onClick={() => props.setObstacleDialogOpen(false)}
                              >
                                ↗ 查看相关图纸
                              </Link>
                            </div>
                          )}
                          {!isEditing && obstacle.obstacle_type === '材料' && props.obstacleTask?.project_id && props.obstacleTask.participant_unit_id && (
                            <div className="mt-1">
                              <Link
                                to={`/projects/${props.obstacleTask.project_id}/materials?unit=${encodeURIComponent(props.obstacleTask.participant_unit_id)}`}
                                className="inline-flex items-center gap-0.5 text-xs text-orange-600 hover:text-orange-700"
                                onClick={() => props.setObstacleDialogOpen(false)}
                              >
                                ↗ 查看相关材料
                              </Link>
                            </div>
                          )}
                          {!isEditing && isCritical && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-red-200 text-xs text-red-700 hover:bg-red-50"
                                onClick={() => props.onOpenRiskWorkspaceForObstacle(obstacle)}
                              >
                                查看关联风险链
                              </Button>
                            </div>
                          )}
                        </div>
                        {!isEditing && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                              obstacle.is_resolved
                                ? getStatusTheme('resolved').className
                                : isCritical
                                  ? getStatusTheme('critical').className
                                  : getStatusTheme('warning').className
                            }`}>
                              {obstacle.is_resolved ? '已解决' : '进行中'}
                            </span>
                            {!obstacle.is_resolved && (
                              <button
                                onClick={() => {
                                  props.setEditingObstacleId(obstacle.id)
                                  props.setEditingObstacleTitle(obstacle.title)
                                  props.setEditingObstacleSeverity(obstacle.severity || 'medium')
                                  props.setEditingObstacleExpectedResolutionDate(obstacle.expected_resolution_date || '')
                                  props.setEditingObstacleResolutionNotes(obstacle.resolution_notes || '')
                                }}
                                className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                title="编辑"
                              >
                                <Save className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {!obstacle.is_resolved && (
                              <button
                                onClick={() => props.handleResolveObstacle(obstacle)}
                                className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                                title="标记为已解决"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {obstacle.is_resolved && (
                              <button
                                onClick={() => props.handleDeleteObstacle(obstacle.id)}
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
            {props.taskObstacles.length > 0 && (
              <p className="text-xs text-muted-foreground">
                共 {props.taskObstacles.length} 条阻碍 · {props.taskObstacles.filter((obstacle) => !obstacle.is_resolved).length} 条待解决
                {props.taskObstacles.filter((obstacle) => !obstacle.is_resolved && Math.floor((Date.now() - new Date(obstacle.created_at).getTime()) / 86400000) > 7).length > 0 && (
                  <span className="ml-1.5 text-red-600 font-medium">
                    · {props.taskObstacles.filter((obstacle) => !obstacle.is_resolved && Math.floor((Date.now() - new Date(obstacle.created_at).getTime()) / 86400000) > 7).length} 条长期阻碍
                  </span>
                )}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => props.setObstacleDialogOpen(false)}>关闭</Button>
            <Button onClick={props.handleAddObstacle} disabled={!props.newObstacleTitle.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              保存阻碍
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!props.newTaskConditionPromptId}
        onOpenChange={(open) => {
          if (!open) props.setNewTaskConditionPromptId(null)
        }}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              需要设置开工条件吗？
            </DialogTitle>
            <DialogDescription className="sr-only">新任务创建后选择是否添加开工条件</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => props.setNewTaskConditionPromptId(null)}>
              暂不设置
            </Button>
            <Button
              onClick={() => {
                const taskId = props.newTaskConditionPromptId
                props.setNewTaskConditionPromptId(null)
                if (taskId) props.openConditionDialogByTaskId(taskId)
              }}
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              添加开工条件
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={props.confirmDialog.open}
        onOpenChange={(open) => !open && props.setConfirmDialog((previous) => ({ ...previous, open: false }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{props.confirmDialog.title}</DialogTitle>
            <DialogDescription className="sr-only">确认</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">{props.confirmDialog.message}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => props.setConfirmDialog((previous) => ({ ...previous, open: false }))}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                props.setConfirmDialog((previous) => ({ ...previous, open: false }))
                props.confirmDialog.onConfirm()
              }}
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
