export interface ProgressSnapshotSourceLike {
  event_source?: string | null
  source_confidence?: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export function normalizeProgressSnapshotSource(source: unknown) {
  const normalized = normalizeText(source)
  if (!normalized) return 'unknown'
  if (['manual', 'user_action', 'field_report', 'daily_report', 'site_report', 'task_dialog', 'progress_dialog'].includes(normalized)) return normalized
  if (['user', 'mobile'].some((token) => normalized.includes(token))) return 'field_report'
  if (['excel', 'csv', 'import'].some((token) => normalized.includes(token))) return 'import'
  if (['bulk', 'batch'].some((token) => normalized.includes(token))) return 'batch_update'
  if (['db_trigger', 'trigger'].some((token) => normalized.includes(token))) return 'system_trigger'
  if (normalized.includes('acceptance')) return 'acceptance_linkage'
  if (['system', 'auto'].some((token) => normalized.includes(token))) return 'system_auto'
  if (['api', 'integration', 'sync'].some((token) => normalized.includes(token))) return 'api_integration'
  if (['legacy', 'migration'].some((token) => normalized.includes(token))) return 'legacy_migration'
  return normalized
}

export function classifyProgressSnapshotSource(snapshot: ProgressSnapshotSourceLike) {
  const explicit = normalizeText(snapshot.source_confidence)
  if (['high', 'medium', 'low', 'unknown'].includes(explicit)) return explicit as 'high' | 'medium' | 'low' | 'unknown'

  const source = normalizeProgressSnapshotSource(snapshot.event_source)
  if (['manual', 'user_action', 'field_report', 'daily_report', 'site_report', 'task_dialog', 'progress_dialog'].includes(source)) return 'high'
  if (['api_integration', 'acceptance_linkage', 'system_auto', 'system_trigger'].includes(source)) return 'medium'
  if (['import', 'batch_update', 'legacy_migration'].includes(source)) return 'low'
  return 'unknown'
}
