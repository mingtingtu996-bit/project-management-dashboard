import { v4 as uuidv4 } from 'uuid'
import type { TaskBaselineItem } from '../types/db.js'
import type { GeneratedTemplateRow } from './wbsTemplateGenerationService.js'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

const BASELINE_ITEM_METADATA_SCALAR_KEYS = [
  'source',
  'rowProjectionMode',
  'scheduleParticipation',
  'schedule_participation',
  'planItemKind',
  'standardWorkCode',
  'standardWorkName',
  'durationEvidenceSource',
  'durationCalibrationSource',
  'durationReviewGate',
] as const

function compactBaselineItemMetadata(metadata: Record<string, unknown>) {
  const compact: Record<string, unknown> = {}
  const suppressedLargeMetadataKeys: string[] = []
  for (const key of Object.keys(metadata)) {
    const value = metadata[key]
    if ((BASELINE_ITEM_METADATA_SCALAR_KEYS as readonly string[]).includes(key)) {
      compact[key] = value
      continue
    }
    if (
      key === 'businessTypeMasterPlan'
      || key === 'masterPlanGeneration'
      || key === 'durationAssetMapping'
    ) {
      compact[key] = value
      continue
    }
    if (key === 'generationDepthPolicy') continue
    if (value && typeof value === 'object') {
      suppressedLargeMetadataKeys.push(key)
      continue
    }
    compact[key] = value
  }
  return {
    compact,
    suppressedLargeMetadataKeys,
  }
}

function readRowTitle(row: GeneratedTemplateRow) {
  return normalizeText(row.values.title ?? row.values.name) || '未命名计划项'
}

function isPrimaryScheduleRow(row: GeneratedTemplateRow) {
  const metadata = readRecord(row.values.standard_task_metadata)
  const projectionMode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode)
  const participation = normalizeText(row.scheduleParticipation ?? row.values.schedule_participation ?? metadata.scheduleParticipation)
  return projectionMode === 'schedule_row' && (!participation || participation === 'primary_schedule')
}

export function materializeGeneratedTemplateRowsToBaselineItems(params: {
  rows: GeneratedTemplateRow[]
  projectId: string
  baselineVersionId: string
  capturedAt?: string
  generationBatchId?: string | null
  sourceTaskIdByClientRowId?: ReadonlyMap<string, string>
  includeRowsWithoutProjectionMetadata?: boolean
}): TaskBaselineItem[] {
  const capturedAt = params.capturedAt ?? new Date().toISOString()
  return params.rows
    .filter((row) => {
      if (isPrimaryScheduleRow(row)) return true
      if (!params.includeRowsWithoutProjectionMetadata) return false
      const metadata = readRecord(row.values.standard_task_metadata)
      return !normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode)
    })
    .map((row, index) => {
      const metadata = readRecord(row.values.standard_task_metadata)
      const { compact: compactMetadata, suppressedLargeMetadataKeys } = compactBaselineItemMetadata(metadata)
      const durationSuggestion = readRecord(row.values.duration_suggestion ?? row.durationSuggestion)
      const sourceTemplateId = normalizeText(row.values.template_id)
      const sourceTemplateNodeId = normalizeText(row.values.template_node_id)
      const templateId = sourceTemplateId && isUuidLike(sourceTemplateId) ? sourceTemplateId : null
      const templateNodeId = sourceTemplateNodeId && isUuidLike(sourceTemplateNodeId) ? sourceTemplateNodeId : null
      const sourceTaskId = normalizeText(params.sourceTaskIdByClientRowId?.get(row.clientRowId)) || null
      return {
        id: uuidv4(),
        project_id: params.projectId,
        baseline_version_id: params.baselineVersionId,
        parent_item_id: null,
        source_task_id: sourceTaskId,
        source_milestone_id: null,
        title: readRowTitle(row),
        planned_start_date: normalizeText(row.values.planned_start_date ?? row.values.start_date) || null,
        planned_end_date: normalizeText(row.values.planned_end_date ?? row.values.end_date) || null,
        target_progress: null,
        sort_order: Number.isFinite(Number(row.values.sort_order ?? row.sortOrder))
          ? Number(row.values.sort_order ?? row.sortOrder)
          : index,
        is_milestone: Boolean(row.values.is_milestone),
        is_critical: false,
        mapping_status: sourceTaskId ? 'mapped' : 'pending',
        notes: normalizeText(row.values.description ?? row.values.notes) || null,
        template_id: templateId,
        template_node_id: templateNodeId,
        wbs_node_type: normalizeText(row.values.wbs_node_type ?? row.values.category_type) || null,
        is_wbs_summary: typeof row.values.is_wbs_summary === 'boolean' ? row.values.is_wbs_summary : null,
        is_executable: typeof row.values.is_executable === 'boolean' ? row.values.is_executable : null,
        standard_work_code: normalizeText(row.values.standard_work_code ?? metadata.standardWorkCode) || null,
        standard_work_name: normalizeText(row.values.standard_work_name ?? metadata.standardWorkName) || null,
        duration_calibration_source: normalizeText(row.values.duration_calibration_source) || null,
        duration_provenance: normalizeText(row.values.duration_provenance) || null,
        generation_metadata: {
          ...compactMetadata,
          source: normalizeText(metadata.source ?? row.values.source_type) || 'generated_template_row',
          generationBatchId: normalizeText(params.generationBatchId ?? row.values.generation_batch_id) || null,
          clientRowId: row.clientRowId,
          sourceTaskLinked: Boolean(sourceTaskId),
          sourceTemplateId: sourceTemplateId || null,
          sourceTemplateNodeId: sourceTemplateNodeId || null,
          sourceTemplateIdColumnSuppressed: Boolean(sourceTemplateId && !templateId),
          sourceTemplateNodeIdColumnSuppressed: Boolean(sourceTemplateNodeId && !templateNodeId),
          rowProjectionMode: normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode) || null,
          scheduleParticipation: normalizeText(row.scheduleParticipation ?? row.values.schedule_participation) || null,
          executionPhase: normalizeText(row.values.execution_phase ?? row.executionPhase) || null,
          executionLane: normalizeText(row.values.execution_lane ?? row.executionLane) || null,
          planItemKind: normalizeText(row.planItemKind ?? metadata.planItemKind) || null,
          durationSuggestion,
          predecessorClientRowIds: row.predecessorClientRowIds,
          predecessorDependencies: row.predecessorDependencies,
          mutationBoundary: readRecord(readRecord(metadata.generationDepthPolicy).governance).mutationBoundary ?? null,
          suppressedLargeMetadataKeys,
          candidateOnly: true,
          writesTasks: false,
          writesTaskDependencies: false,
          writesCriticalPathFacts: false,
        },
        last_generated_at: capturedAt,
        created_at: capturedAt,
        updated_at: capturedAt,
      } satisfies TaskBaselineItem
    })
}
