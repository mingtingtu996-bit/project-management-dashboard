export type MaterialConditionLinkLike = {
  source_ref_id?: string | null
  source_type?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
}

function normalizeText(value?: unknown) {
  return String(value ?? '').trim()
}

export const MATERIAL_OPEN_TASK_STATUS_VALUES = [
  'todo',
  'pending',
  'in_progress',
  'not_started',
  '\u8fdb\u884c\u4e2d',
  '\u672a\u5f00\u59cb',
] as const

export function isOpenMaterialLinkedTaskStatus(value?: string | null) {
  const normalized = normalizeText(value).toLowerCase()
  return (MATERIAL_OPEN_TASK_STATUS_VALUES as readonly string[]).includes(normalized)
}

export function getLinkedMaterialIdFromCondition(row: MaterialConditionLinkLike) {
  const sourceRefId = normalizeText(row.source_ref_id)
  const sourceType = normalizeText(row.source_type).toLowerCase()
  if (sourceRefId && sourceType === 'material') {
    return sourceRefId
  }

  const sourceEntityId = normalizeText(row.source_entity_id)
  const sourceEntityType = normalizeText(row.source_entity_type).toLowerCase()
  if (sourceEntityId && sourceEntityType === 'project_material') {
    return sourceEntityId
  }

  return null
}
