// v1.4.6 §11: AI governance boundary + §12: Presentation rules for data lineage.
//
// AI tools may READ lineage_links for context analysis,
// but must NOT directly write to lineage_links, tasks, or any production table.
// AI output is limited to explanation, suggestion, and repair drafts only.
//
// Lineage anomaly messages are ONLY shown in:
//   - Task/planning/import save failure error prompts
//   - Three-page health banners (Baseline / MonthlyPlan / TaskList-Gantt)
//   - One-time import feedback
//
// Lineage messages are NEVER shown in:
//   - Dashboard / 驾驶舱 / 报表 — these pages consume aggregated metrics only
//   - Dashboard / 驾驶舱 / 报表 — must NOT serve as lineage problem entry points
//   - BI — must NOT expose batch numbers, mapping keys, or internal source IDs
//
// Business language only — never expose internal IDs.

export const AI_GOVERNANCE_RULES = {
  mayReadLineage: true,
  mayWriteLineage: false,
  mayWriteProductionData: false,
  mayGenerateSuggestions: true,
}

/** Pages where lineage anomaly messages ARE allowed */
export const LINEAGE_ALLOWED_PAGES = [
  'task_save_error',
  'planning_save_error',
  'import_feedback',
  'baseline_health_banner',
  'monthly_plan_health_banner',
  'task_list_health_banner',
  'gantt_health_banner',
] as const

/** Pages where lineage anomaly banners are FORBIDDEN */
export const LINEAGE_FORBIDDEN_PAGES = [
  'dashboard',
  'company_cockpit',
  'reports',
  'bi_snapshot',
  'acceptance_timeline',
  'risk_management',
  'materials',
] as const

export const LINEAGE_PRESENTATION_RULES = {
  forbiddenFields: ['lineage_link_id', 'batch_id', 'import_row_id', 'split_from', 'merged_from', 'source_entity_id', 'target_entity_id'],
  templates: {
    broken_source: '当前任务来源关系异常，暂不能重新生成月计划',
    missing_basis: '当前计划目标缺少依据，请补充月度计划',
    orphan_task: '该任务缺少可追溯的计划依据',
    repair_suggestion: '系统检测到来源异常，建议生成修复方案',
    import_feedback: '导入完成，部分条目需补充计划依据',
    generate_blocked: '计划依据缺失，暂不能重新生成',
  },
}

export function translateLineageAnomaly(type: string, _context?: Record<string, unknown>): string {
  const msg = (LINEAGE_PRESENTATION_RULES.templates as Record<string, string>)[type]
  return msg ?? '数据来源关系异常，请联系管理员'
}

export function isLineageMessageAllowedOnPage(page: string): boolean {
  return (LINEAGE_ALLOWED_PAGES as readonly string[]).includes(page)
}

export function isLineageMessageForbiddenOnPage(page: string): boolean {
  return (LINEAGE_FORBIDDEN_PAGES as readonly string[]).includes(page)
}
