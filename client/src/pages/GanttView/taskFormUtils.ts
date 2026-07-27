import type { Task } from '../GanttViewTypes'
import { normalizeTaskEditableStatus } from './ganttViewUtils'

export type GanttTaskFormData = {
  name: string
  description: string
  status: string
  priority: string
  start_date: string
  end_date: string
  progress: number
  assignee_name: string
  assignee_user_id: string | null
  participant_unit_id: string | null
  participant_unit_name: string
  dependencies: string[]
  parent_id: string | null
  milestone_id: string | null
  specialty_type: string
  template_node_id: string | null
  wbs_node_type: string | null
  engineering_category_id: string | null
  engineering_category_name: string | null
  engineering_category_type: string | null
  standard_work_code: string | null
  standard_work_name: string | null
  engineering_object_id: string | null
  phase_object_id: string | null
  section_object_id: string | null
  building_object_id: string | null
  basement_object_id: string | null
  floor_object_id: string | null
  physical_zone_object_id: string | null
  functional_area_object_id: string | null
  standard_task_metadata: Record<string, unknown> | null
}

export type GanttTaskFormErrors = {
  name?: string
  start_date?: string
  end_date?: string
  scope?: string
}

export function createEmptyGanttTaskFormData(): GanttTaskFormData {
  return {
    name: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    start_date: '',
    end_date: '',
    progress: 0,
    assignee_name: '',
    assignee_user_id: null,
    participant_unit_id: null,
    participant_unit_name: '',
    dependencies: [],
    parent_id: null,
    milestone_id: null,
    specialty_type: '',
    template_node_id: null,
    wbs_node_type: null,
    engineering_category_id: null,
    engineering_category_name: null,
    engineering_category_type: null,
    standard_work_code: null,
    standard_work_name: null,
    engineering_object_id: null,
    phase_object_id: null,
    section_object_id: null,
    building_object_id: null,
    basement_object_id: null,
    floor_object_id: null,
    physical_zone_object_id: null,
    functional_area_object_id: null,
    standard_task_metadata: null,
  }
}

export function buildGanttTaskFormDataFromTask(task: Task): GanttTaskFormData {
  return {
    name: task.title || '',
    description: task.description || '',
    status: normalizeTaskEditableStatus(task.status),
    priority: task.priority || 'medium',
    start_date: task.planned_start_date || task.start_date || '',
    end_date: task.planned_end_date || task.end_date || '',
    progress: task.progress || 0,
    assignee_name: task.assignee_name || '',
    assignee_user_id: task.assignee_user_id || null,
    participant_unit_id: task.participant_unit_id || null,
    participant_unit_name: task.participant_unit_name || '',
    dependencies: task.dependencies || [],
    parent_id: task.parent_id || null,
    milestone_id: task.milestone_id || null,
    specialty_type: task.specialty_type || '',
    template_node_id: task.template_node_id || null,
    wbs_node_type: task.wbs_node_type || task.engineering_category_type || task.category_type || null,
    engineering_category_id: task.engineering_category_id || null,
    engineering_category_name: task.engineering_category_name || null,
    engineering_category_type: task.engineering_category_type || task.category_type || null,
    standard_work_code: task.standard_work_code || null,
    standard_work_name: task.standard_work_name || null,
    engineering_object_id: task.engineering_object_id || null,
    phase_object_id: task.phase_object_id || null,
    section_object_id: task.section_object_id || null,
    building_object_id: task.building_object_id || null,
    basement_object_id: task.basement_object_id || null,
    floor_object_id: task.floor_object_id || null,
    physical_zone_object_id: task.physical_zone_object_id || null,
    functional_area_object_id: task.functional_area_object_id || null,
    standard_task_metadata: task.standard_task_metadata ?? null,
  }
}

export function hasGanttTaskScopeObject(formData: GanttTaskFormData): boolean {
  return Boolean(
    formData.engineering_object_id
    || formData.phase_object_id
    || formData.section_object_id
    || formData.building_object_id
    || formData.basement_object_id
    || formData.floor_object_id
    || formData.physical_zone_object_id
    || formData.functional_area_object_id,
  )
}

function buildStandardTaskMetadataFromFormData(formData: GanttTaskFormData) {
  return Object.fromEntries(
    Object.entries(formData.standard_task_metadata ?? {}).filter(([key]) => (
      key.replace(/_/g, '').toLowerCase() !== 'legacytemplatenodekey'
    )),
  )
}

export function validateGanttTaskFormData(formData: GanttTaskFormData): GanttTaskFormErrors {
  const nextErrors: GanttTaskFormErrors = {}
  if (!formData.name.trim()) {
    nextErrors.name = '请输入任务名称'
  }
  if (!formData.start_date) {
    nextErrors.start_date = '甘特与关键路径任务必须填写开始日期'
  }
  if (!formData.end_date) {
    nextErrors.end_date = '甘特与关键路径任务必须填写结束日期'
  }
  if (!hasGanttTaskScopeObject(formData)) {
    nextErrors.scope = '请至少选择一个主要施工范围或施工对象'
  }
  return nextErrors
}

export function buildGanttLiveCheckDraft(
  formData: GanttTaskFormData,
  editingTask?: Pick<Task, 'id' | 'is_milestone'> | null,
) {
  return {
    id: editingTask?.id,
    title: formData.name,
    description: formData.description || null,
    status: formData.status,
    priority: formData.priority,
    start_date: formData.start_date || null,
    end_date: formData.end_date || null,
    planned_start_date: formData.start_date || null,
    planned_end_date: formData.end_date || null,
    progress: formData.progress,
    assignee_name: formData.assignee_name || null,
    participant_unit_id: formData.participant_unit_id || null,
    dependencies: formData.dependencies,
    parent_id: formData.parent_id,
    milestone_id: formData.milestone_id,
    specialty_type: formData.specialty_type || null,
    template_node_id: formData.template_node_id || null,
    wbs_node_type: formData.wbs_node_type || null,
    engineering_category_id: formData.engineering_category_id || null,
    engineering_category_name: formData.engineering_category_name || null,
    engineering_category_type: formData.engineering_category_type || null,
    standard_work_code: formData.standard_work_code || null,
    standard_work_name: formData.standard_work_name || null,
    engineering_object_id: formData.engineering_object_id || null,
    phase_object_id: formData.phase_object_id || null,
    section_object_id: formData.section_object_id || null,
    building_object_id: formData.building_object_id || null,
    basement_object_id: formData.basement_object_id || null,
    floor_object_id: formData.floor_object_id || null,
    physical_zone_object_id: formData.physical_zone_object_id || null,
    functional_area_object_id: formData.functional_area_object_id || null,
    standard_task_metadata: buildStandardTaskMetadataFromFormData(formData),
    is_milestone: Boolean(editingTask?.is_milestone),
  }
}

export function buildGanttTaskDataFromFormData(
  formData: GanttTaskFormData,
  options: {
    autoStatus: string
    includeProgress: boolean
    projectId: string
  },
): Partial<Task> {
  const taskData: Partial<Task> = {
    title: formData.name,
    description: formData.description,
    status: options.autoStatus,
    priority: formData.priority,
    start_date: formData.start_date || null,
    end_date: formData.end_date || null,
    planned_start_date: formData.start_date || null,
    planned_end_date: formData.end_date || null,
    assignee: formData.assignee_name,
    assignee_user_id: formData.assignee_user_id || null,
    participant_unit_id: formData.participant_unit_id || null,
    dependencies: formData.dependencies || [],
    parent_id: formData.parent_id || undefined,
    milestone_id: formData.milestone_id || undefined,
    project_id: options.projectId,
    updated_at: new Date().toISOString(),
    specialty_type: formData.specialty_type || null,
    template_node_id: formData.template_node_id || null,
    wbs_node_type: formData.wbs_node_type || null,
    engineering_category_id: formData.engineering_category_id || null,
    engineering_category_name: formData.engineering_category_name || null,
    engineering_category_type: formData.engineering_category_type || null,
    standard_work_code: formData.standard_work_code || null,
    standard_work_name: formData.standard_work_name || null,
    engineering_object_id: formData.engineering_object_id || null,
    phase_object_id: formData.phase_object_id || null,
    section_object_id: formData.section_object_id || null,
    building_object_id: formData.building_object_id || null,
    basement_object_id: formData.basement_object_id || null,
    floor_object_id: formData.floor_object_id || null,
    physical_zone_object_id: formData.physical_zone_object_id || null,
    functional_area_object_id: formData.functional_area_object_id || null,
    standard_task_metadata: buildStandardTaskMetadataFromFormData(formData),
  }

  if (options.includeProgress) {
    taskData.progress = formData.progress
  }

  return taskData
}
