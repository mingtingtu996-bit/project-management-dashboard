// v1.4.6: Business-language translation for internal lineage fields.
// Never expose chain_id, source_entity_id, mapping_status, or batch_id
// to users. Translate to business language.

const INTERNAL_FORBIDDEN_FIELDS = [
  'chain_id', 'source_id', 'source_entity_id', 'source_entity_type',
  'mapping_status', 'batch_id', 'lineage_link_id', 'import_row_id',
] as const

const SOURCE_TYPE_LABELS: Record<string, string> = {
  risk_converted: '由风险升级生成',
  risk_auto_escalated: '由风险自动升级',
  obstacle_escalated: '由阻碍升级生成',
  condition_expired: '由条件过期触发',
  warning_converted: '由预警转换',
  warning_auto_escalated: '由预警自动升级',
  manual: '人工创建',
  source_deleted: '来源已删除',
  import_csv: '由导入生成',
  import_batch: '由批量导入生成',
  template_apply: '由模板套用生成',
  baseline_generate: '由基线生成',
  monthly_roll: '由月计划滚入',
}

/**
 * Translate source_type to business language.
 */
export function translateSourceType(sourceType?: string | null): string {
  if (!sourceType) return '人工创建'
  return SOURCE_TYPE_LABELS[sourceType] ?? '系统关联'
}

/**
 * Translate acceptance requirement source to business language.
 */
export function translateAcceptanceSource(entityType?: string | null, _entityId?: string | null): string {
  if (!entityType) return '人工创建'
  const labels: Record<string, string> = {
    drawing_package: '来自图纸包',
    task_condition: '来自条件',
    warning: '来自预警',
    certificate: '来自证照事项',
    risk: '来自风险',
    issue: '来自问题',
    manual: '人工创建',
  }
  return labels[entityType] ?? entityType
}

/**
 * Strip all internal lineage fields from an object for display.
 */
export function stripLineageFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    if (!(INTERNAL_FORBIDDEN_FIELDS as readonly string[]).includes(key)) {
      result[key] = obj[key]
    }
  }
  return result as Partial<T>
}

/**
 * Check if a field name is forbidden for user display.
 */
export function isLineageFieldForbidden(field: string): boolean {
  return (INTERNAL_FORBIDDEN_FIELDS as readonly string[]).includes(field)
}

export { INTERNAL_FORBIDDEN_FIELDS }
