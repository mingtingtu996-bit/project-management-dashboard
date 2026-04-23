import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient'

export interface ProjectMaterialRecord {
  id: string
  project_id: string
  participant_unit_id: string | null
  participant_unit_name: string | null
  material_name: string
  specialty_type: string | null
  requires_sample_confirmation: boolean
  sample_confirmed: boolean
  expected_arrival_date: string
  actual_arrival_date: string | null
  requires_inspection: boolean
  inspection_done: boolean
  linked_task_id?: string | null
  linked_task_title?: string | null
  linked_task_start_date?: string | null
  linked_task_status?: string | null
  linked_task_buffer_days?: number | null
  version: number
  created_at: string
  updated_at: string
}

export interface MaterialRateByUnit {
  participantUnitId: string | null
  participantUnitName: string | null
  specialtyTypes: string[]
  totalExpectedCount: number
  onTimeCount: number
  arrivalRate: number
}

export interface MaterialMonthlyTrendPoint {
  month: string
  totalExpectedCount: number
  onTimeCount: number
  arrivalRate: number
}

export interface MaterialReportSummary {
  overview: {
    totalExpectedCount: number
    onTimeCount: number
    arrivalRate: number
  }
  byUnit: MaterialRateByUnit[]
  monthlyTrend: MaterialMonthlyTrendPoint[]
}

type NotificationApiRecord = {
  id: string
  type?: string | null
  title?: string | null
  content?: string | null
  message?: string | null
  severity?: string | null
  category?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface MaterialReminderRecord {
  id: string
  type: string
  title: string
  content: string
  severity: string | null
  created_at: string
}

export interface ProjectWeeklyDigestSnapshot {
  id: string
  project_id: string
  week_start: string
  generated_at: string
  overall_progress?: number | null
  health_score?: number | null
  progress_change?: number | null
  completed_tasks_count?: number | null
  completed_milestones_count?: number | null
}

export interface ParticipantUnitSummary {
  id: string
  project_id?: string | null
  unit_name: string
  unit_type: string
}

type ChangeLogApiRecord = {
  id: string
  entity_type?: string | null
  entity_id?: string | null
  field_name?: string | null
  old_value?: string | null
  new_value?: string | null
  change_reason?: string | null
  change_source?: string | null
  changed_at?: string | null
  changed_by?: string | null
}

export interface MaterialChangeLogRecord {
  id: string
  entity_type: string
  entity_id: string
  field_name: string
  old_value: string | null
  new_value: string | null
  change_reason: string | null
  change_source: string | null
  changed_at: string
  changed_by: string | null
}

export interface MaterialTaskDurationEstimate {
  id?: string
  task_id?: string
  project_id?: string
  estimated_duration: number
  confidence_level?: number | string | null
  confidence_score?: number | null
  reasoning?: string | null
}

export interface MaterialTaskDelayRisk {
  task_id: string
  task_title: string
  progress_deviation: number
  remaining_days: number
  obstacle_count: number
  delay_probability: number
  delay_risk: 'low' | 'medium' | 'high'
  risk_factors: string[]
  recommendations: string[]
}

export interface MaterialMutationPayload {
  participant_unit_id?: string | null
  material_name?: string
  specialty_type?: string | null
  requires_sample_confirmation?: boolean
  sample_confirmed?: boolean
  expected_arrival_date?: string
  actual_arrival_date?: string | null
  requires_inspection?: boolean
  inspection_done?: boolean
  change_reason?: string | null
}

export class MaterialsApiService {
  static async list(projectId: string, options?: RequestInit) {
    return apiGet<ProjectMaterialRecord[]>(`/api/projects/${encodeURIComponent(projectId)}/materials`, options)
  }

  static async getSummary(projectId: string, options?: RequestInit) {
    return apiGet<MaterialReportSummary>(`/api/projects/${encodeURIComponent(projectId)}/materials/summary`, options)
  }

  static async listReminders(projectId: string, options?: RequestInit) {
    const notifications = await apiGet<NotificationApiRecord[]>(
      `/api/notifications?projectId=${encodeURIComponent(projectId)}&limit=100`,
      options,
    )

    return (notifications ?? [])
      .filter((item) => {
        const type = String(item.type ?? '').trim()
        return item.category === 'materials' || type === 'material_arrival_reminder' || type === 'material_arrival_overdue'
      })
      .map<MaterialReminderRecord>((item) => ({
        id: item.id,
        type: String(item.type ?? '').trim(),
        title: String(item.title ?? '').trim() || '材料提醒',
        content: String(item.content ?? item.message ?? '').trim(),
        severity: item.severity ?? null,
        created_at: String(item.created_at ?? item.updated_at ?? '').trim(),
      }))
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
  }

  static async getWeeklyDigest(projectId: string, options?: RequestInit) {
    return apiGet<ProjectWeeklyDigestSnapshot | null>(
      `/api/projects/${encodeURIComponent(projectId)}/weekly-digest/latest`,
      options,
    )
  }

  static async estimateLinkedTaskDuration(projectId: string, taskId: string, options?: RequestInit) {
    return apiPost<MaterialTaskDurationEstimate>(
      '/api/ai-duration/estimate-duration',
      {
        task_id: taskId,
        project_id: projectId,
        historical_data: true,
      },
      options,
    )
  }

  static async analyzeLinkedTaskDelayRisk(taskId: string, options?: RequestInit) {
    return apiPost<MaterialTaskDelayRisk>(
      '/api/ai-schedule/analyze-delay-risk',
      { task_id: taskId },
      options,
    )
  }

  static async listChangeLogs(projectId: string, materialId: string, options?: RequestInit) {
    const logs = await apiGet<ChangeLogApiRecord[]>(
      `/api/change-logs?projectId=${encodeURIComponent(projectId)}&limit=100`,
      options,
    )

    return (logs ?? [])
      .filter((item) => String(item.entity_type ?? '').trim() === 'project_material' && String(item.entity_id ?? '').trim() === materialId)
      .map<MaterialChangeLogRecord>((item) => ({
        id: item.id,
        entity_type: String(item.entity_type ?? '').trim(),
        entity_id: String(item.entity_id ?? '').trim(),
        field_name: String(item.field_name ?? '').trim(),
        old_value: item.old_value ?? null,
        new_value: item.new_value ?? null,
        change_reason: item.change_reason ?? null,
        change_source: item.change_source ?? null,
        changed_at: String(item.changed_at ?? '').trim(),
        changed_by: item.changed_by ?? null,
      }))
      .sort((left, right) => right.changed_at.localeCompare(left.changed_at))
  }

  static async create(projectId: string, payload: MaterialMutationPayload | MaterialMutationPayload[]) {
    return apiPost<ProjectMaterialRecord | ProjectMaterialRecord[]>(
      `/api/projects/${encodeURIComponent(projectId)}/materials`,
      Array.isArray(payload) ? payload : payload,
    )
  }

  static async update(projectId: string, materialId: string, payload: MaterialMutationPayload) {
    return apiPatch<ProjectMaterialRecord>(
      `/api/projects/${encodeURIComponent(projectId)}/materials/${encodeURIComponent(materialId)}`,
      payload,
    )
  }

  static async remove(projectId: string, materialId: string) {
    return apiDelete(`/api/projects/${encodeURIComponent(projectId)}/materials/${encodeURIComponent(materialId)}`)
  }

  static async listParticipantUnits(projectId: string, options?: RequestInit) {
    return apiGet<ParticipantUnitSummary[]>(
      `/api/participant-units?projectId=${encodeURIComponent(projectId)}`,
      options,
    )
  }
}
