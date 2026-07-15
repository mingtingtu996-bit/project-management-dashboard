// v1.4.12: Shared warning signature utility
// Single entry point for buildWarningSignature used by upgradeChainService and warningChainService

function warningDay(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return (normalized || new Date().toISOString()).slice(0, 10)
}

export function buildWarningNaturalKey(warning: {
  project_id?: string | null
  task_id?: string | null
  warning_type?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
}) {
  const sourceKey = warning.source_entity_type && warning.source_entity_id
    ? `${warning.source_entity_type}:${warning.source_entity_id}`
    : warning.task_id || ''
  return [warning.project_id || '', sourceKey, warning.warning_type || ''].join('|')
}

export function buildWarningSignature(
  warning: {
    project_id?: string | null
    task_id?: string | null
    warning_type?: string | null
    created_at?: string | null
    source_entity_type?: string | null
    source_entity_id?: string | null
  },
) {
  const sourceKey = warning.source_entity_type && warning.source_entity_id
    ? `${warning.source_entity_type}:${warning.source_entity_id}`
    : warning.task_id || warning.project_id || ''
  return [
    warning.warning_type || '',
    sourceKey,
    warningDay(warning.created_at),
  ].join('|')
}
