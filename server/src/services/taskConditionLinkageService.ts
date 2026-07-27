import { query as rawQuery, registerDatabasePostCommitEffect } from '../database.js'
import { enqueueProjectHealthUpdate } from './projectHealthService.js'

const DRAWING_CONDITION_TYPES = ['图纸', 'drawing']
const MATERIAL_CONDITION_TYPES = ['材料', 'material']

function normalizeNullableText(value: unknown) {
  if (value == null) return null
  const normalized = String(value).trim()
  return normalized || null
}

function toSqlTimestamp(value?: string | null) {
  const normalized = normalizeNullableText(value)
  if (!normalized) return new Date().toISOString().slice(0, 19).replace('T', ' ')
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized} 00:00:00`
  }
  return normalized.replace('T', ' ').slice(0, 19)
}

async function markConditionsSatisfied(params: {
  projectId: string
  conditionIds: string[]
  reason: string
  reasonNote?: string | null
  satisfiedAt?: string | null
  confirmedBy?: string | null
}) {
  const conditionIds = [...new Set(params.conditionIds.map((value) => normalizeNullableText(value)).filter(Boolean))] as string[]
  if (conditionIds.length === 0) return 0

  const timestamp = toSqlTimestamp(params.satisfiedAt)

  await rawQuery(
    `UPDATE public.task_conditions
        SET is_satisfied = TRUE,
            satisfied_reason = $1,
            satisfied_reason_note = $2,
            confirmed_at = COALESCE(confirmed_at, $3::timestamptz),
            confirmed_by = COALESCE(confirmed_by, $4),
            updated_at = $5::timestamptz
      WHERE id = ANY($6::uuid[])
        AND project_id = $7`,
    [
      params.reason,
      normalizeNullableText(params.reasonNote),
      timestamp,
      normalizeNullableText(params.confirmedBy),
      timestamp,
      conditionIds,
      params.projectId,
    ],
  )

  await registerDatabasePostCommitEffect(
    `task-condition-health-refresh:${params.projectId}`,
    async () => {
      await enqueueProjectHealthUpdate(params.projectId, 'task_condition_auto_satisfied')
    },
  )
  return conditionIds.length
}

export async function autoSatisfyDrawingPackageConditions(params: {
  projectId: string
  drawingPackageId?: string | null
  drawingPackageCode?: string | null
  satisfiedAt?: string | null
  confirmedBy?: string | null
}) {
  const drawingPackageId = normalizeNullableText(params.drawingPackageId)
  const drawingPackageCode = normalizeNullableText(params.drawingPackageCode)
  if (!drawingPackageId && !drawingPackageCode) return 0

  let rows: Array<{ id?: string | null }> = []
  if (drawingPackageId && drawingPackageCode) {
    rows = (
      await rawQuery(
        `SELECT id
           FROM public.task_conditions
          WHERE project_id = $1
            AND is_satisfied = FALSE
            AND condition_type = ANY($2::text[])
            AND (drawing_package_id = $3 OR drawing_package_code = $4)`,
        [params.projectId, DRAWING_CONDITION_TYPES, drawingPackageId, drawingPackageCode],
      )
    ).rows as Array<{ id?: string | null }>
  } else if (drawingPackageId) {
    rows = (
      await rawQuery(
        `SELECT id
           FROM public.task_conditions
          WHERE project_id = $1
            AND is_satisfied = FALSE
            AND condition_type = ANY($2::text[])
            AND drawing_package_id = $3`,
        [params.projectId, DRAWING_CONDITION_TYPES, drawingPackageId],
      )
    ).rows as Array<{ id?: string | null }>
  } else if (drawingPackageCode) {
    rows = (
      await rawQuery(
        `SELECT id
           FROM public.task_conditions
          WHERE project_id = $1
            AND is_satisfied = FALSE
            AND condition_type = ANY($2::text[])
            AND drawing_package_code = $3`,
        [params.projectId, DRAWING_CONDITION_TYPES, drawingPackageCode],
      )
    ).rows as Array<{ id?: string | null }>
  }

  const conditionIds = rows
    .map((row) => normalizeNullableText(row.id))
    .filter((value): value is string => Boolean(value))

  return await markConditionsSatisfied({
    projectId: params.projectId,
    conditionIds,
    reason: 'linked_drawing_approved',
    reasonNote: drawingPackageCode
      ? `施工图纸包 ${drawingPackageCode} 已通过审查`
      : '关联施工图纸包已通过审查',
    satisfiedAt: params.satisfiedAt,
    confirmedBy: params.confirmedBy,
  })
}

export async function autoSatisfyMaterialConditions(params: {
  projectId: string
  participantUnitId?: string | null
  materialId?: string | null
  satisfiedAt?: string | null
  confirmedBy?: string | null
}) {
  const participantUnitId = normalizeNullableText(params.participantUnitId)
  const materialId = normalizeNullableText(params.materialId)

  // v1.4.21: Prefer precise materialId/source_ref_id matching over participantUnit bulk
  let conditionIds: string[] = []

  if (materialId) {
    // Precise: match conditions with source_ref_id = materialId
    const preciseRows = (
      await rawQuery(
        `SELECT id
           FROM public.task_conditions
          WHERE project_id = $1
            AND is_satisfied = FALSE
            AND condition_type = ANY($2::text[])
            AND source_ref_id = $3`,
        [params.projectId, MATERIAL_CONDITION_TYPES, materialId],
      )
    ).rows as Array<{ id?: string | null }>

    conditionIds = preciseRows
      .map((row) => normalizeNullableText(row.id))
      .filter((value): value is string => Boolean(value))
  }

  // Fallback: participantUnit bulk match (only if no materialId or no precise matches)
  if (conditionIds.length === 0 && participantUnitId) {
    const bulkRows = (
      await rawQuery(
        `SELECT id
           FROM public.task_conditions
          WHERE project_id = $1
            AND is_satisfied = FALSE
            AND condition_type = ANY($2::text[])
            AND participant_unit_id = $3::uuid
            AND source_ref_id IS NULL`,
        [params.projectId, MATERIAL_CONDITION_TYPES, participantUnitId],
      )
    ).rows as Array<{ id?: string | null }>

    conditionIds = bulkRows
      .map((row) => normalizeNullableText(row.id))
      .filter((value): value is string => Boolean(value))
  }

  if (conditionIds.length === 0) return 0

  return await markConditionsSatisfied({
    projectId: params.projectId,
    conditionIds,
    reason: 'linked_material_arrived',
    reasonNote: '关联责任单位的材料已到货',
    satisfiedAt: params.satisfiedAt,
    confirmedBy: params.confirmedBy,
  })
}
