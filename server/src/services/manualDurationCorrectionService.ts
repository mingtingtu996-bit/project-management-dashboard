// 人工工期修正服务：仅负责把用户修正沉淀为统一工期建议 override 候选。

import * as dbService from './dbService.js'
import { getTaskDurationSuggestion } from './durationSuggestionService.js'

function readPositiveDuration(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readGovernedManualBaselineDuration(suggestion: {
  durationOutputCode?: string | null
  contextualReferenceDays?: number | null
  planReferenceDays?: number | null
}) {
  const outputCode = String(suggestion.durationOutputCode ?? '').trim()
  if (outputCode === 'contextual_reference') {
    return readPositiveDuration(suggestion.contextualReferenceDays)
  }
  if (outputCode === 'plan_reference') {
    return readPositiveDuration(suggestion.planReferenceDays)
  }
  return null
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? '').trim())
}

async function writeManualDurationCorrectionCandidate(input: {
  taskId: string
  correctedDuration: number
  baselineDuration: number
  correctionReason?: string | null
  approvedBy?: string | null
}) {
  const supabase = (dbService as any).supabase
  if (!supabase?.from) return false

  const deviationRatio = Math.abs(input.correctedDuration - input.baselineDuration) / Math.max(input.baselineDuration, 1)
  if (deviationRatio <= 0.3) return false

  const task = await dbService.executeSQLOne<any>(
    'SELECT id, project_id, template_node_id, wbs_node_type FROM tasks WHERE id = ? LIMIT 1',
    [input.taskId],
  )
  if (!task) return false

  const overrideKey = [
    'manual-duration-correction',
    task.template_node_id ?? task.id,
    task.wbs_node_type ?? 'process',
  ].join(':')
  const now = new Date().toISOString()
  const payload = {
    override_key: overrideKey,
    project_id: task.project_id ?? null,
    company_id: null,
    template_node_id: isUuid(task.template_node_id) ? task.template_node_id : null,
    recommended_duration_days: input.correctedDuration,
    reason: input.correctionReason
      ?? `Manual correction differs from suggested duration by ${Math.round(deviationRatio * 100)}%.`,
    override_status: 'candidate',
    created_by: isUuid(input.approvedBy) ? input.approvedBy : null,
    updated_at: now,
  }

  const { data: existing, error: lookupError } = await (supabase as any)
    .from('duration_suggestion_overrides')
    .select('id')
    .eq('override_key', overrideKey)
    .eq('override_status', 'candidate')
    .maybeSingle()
  if (lookupError) throw lookupError

  if (existing?.id) {
    const { error } = await (supabase as any)
      .from('duration_suggestion_overrides')
      .update(payload)
      .eq('id', existing.id)
    if (error) throw error
    return true
  }

  const { error } = await (supabase as any)
    .from('duration_suggestion_overrides')
    .insert({ ...payload, created_at: now })
  if (error) throw error
  return true
}

export interface DurationCorrectionInput {
  task_id: string
  corrected_duration: number
  correction_reason: string
  approved_by: string
}

export interface ManualDurationCorrectionEstimate {
  id: string
  task_id: string
  project_id: string
  baselineDurationDays: number
  correctedDurationDays: number
  confidence_level: string | number
  confidence_score?: number | null
  adjustment_factors?: unknown
  factors?: unknown
  reasoning?: string
  model_version?: string
  created_at: string
  updated_at: string
}

export class ManualDurationCorrectionService {
  /**
   * 人工工期修正：以统一工期建议作为 baseline，并把大偏差沉淀为待审核 override 候选。
   */
  async correctDuration(input: DurationCorrectionInput): Promise<ManualDurationCorrectionEstimate> {
    const originalEstimate = await this.buildCurrentUnifiedEstimateBaseline(input.task_id)

    const correctedEstimate: ManualDurationCorrectionEstimate = {
      ...originalEstimate,
      id: crypto.randomUUID(),
      correctedDurationDays: input.corrected_duration,
      reasoning: input.correction_reason,
      model_version: `${originalEstimate.model_version ?? 'v1.4.18-v1.4.7.4'}:manual_correction`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const baselineDuration = readPositiveDuration(originalEstimate.baselineDurationDays ?? originalEstimate.correctedDurationDays)
    if (baselineDuration) {
      try {
        await writeManualDurationCorrectionCandidate({
          taskId: input.task_id,
          correctedDuration: input.corrected_duration,
          baselineDuration,
          correctionReason: input.correction_reason,
          approvedBy: input.approved_by,
        })
      } catch {
        // 候选沉淀失败不阻断用户本次纠偏保存；后台治理任务可继续从估算历史重放。
      }
    }

    return correctedEstimate
  }

  private async buildCurrentUnifiedEstimateBaseline(taskId: string): Promise<ManualDurationCorrectionEstimate> {
    const task = await dbService.executeSQLOne<any>(
      'SELECT * FROM tasks WHERE id = ? LIMIT 1',
      [taskId]
    )

    if (!task) {
      throw new Error('任务不存在')
    }

    const projectId = String(task.project_id ?? '').trim()
    if (!projectId) {
      throw new Error('任务缺少项目归属')
    }

    const project = await dbService.executeSQLOne<any>(
      'SELECT * FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    )

    if (!project) {
      throw new Error('项目不存在')
    }

    const suggestion = await getTaskDurationSuggestion({
      taskId,
      templateNodeId: task.template_node_id ?? null,
      wbsNodeType: task.wbs_node_type ?? 'process',
      engineeringCategoryId: task.engineering_category_id ?? null,
      standardWorkCode: task.standard_work_code ?? null,
      standardWorkName: task.standard_work_name ?? null,
      taskTitle: task.title ?? null,
      plannedStartDate: task.planned_start_date ?? task.start_date ?? null,
      plannedEndDate: task.planned_end_date ?? task.end_date ?? null,
      actualStartDate: task.actual_start_date ?? null,
      actualEndDate: task.actual_end_date ?? null,
      progress: task.progress ?? null,
      buildingObjectId: task.building_object_id ?? null,
      responsibleUnitId: task.participant_unit_id ?? null,
      acceptanceRequired: task.acceptance_required ?? null,
      materialRequired: task.material_required ?? null,
      projectId,
    })

    const baseDuration = readGovernedManualBaselineDuration(suggestion)
    if (!baseDuration) {
      throw new Error('No governed duration suggestion is available for manual duration correction baseline.')
    }
    const now = new Date().toISOString()
    return {
      id: crypto.randomUUID(),
      task_id: taskId,
      project_id: projectId,
      baselineDurationDays: baseDuration,
      correctedDurationDays: baseDuration,
      confidence_level: suggestion.confidenceLevel as any,
      confidence_score: suggestion.confidenceScore,
      factors: {
        source: suggestion.forecastSource,
        benchmarkKey: suggestion.benchmarkKey,
        sampleSize: suggestion.sampleSize ?? 0,
        factorSummary: suggestion.factorSummary ?? null,
        calculationContext: suggestion.calculationContext ?? null,
        durationOutputCode: suggestion.durationOutputCode ?? null,
        durationOutputSemanticFieldName: suggestion.durationOutputSemanticFieldName ?? null,
        contextualReferenceDays: suggestion.contextualReferenceDays ?? null,
      },
      reasoning: suggestion.businessReason ?? '统一工期建议',
      model_version: 'v1.4.18-v1.4.7.4',
      created_at: now,
      updated_at: now,
    }
  }
}
