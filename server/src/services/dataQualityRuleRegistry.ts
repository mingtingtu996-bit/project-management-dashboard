export const DATA_QUALITY_DIMENSIONS = [
  'timeliness',
  'anomaly',
  'consistency',
  'jumpiness',
  'coverage',
  'completeness',
  'accuracy',
  'lineage',
  'governance',
  'retention',
  'metric_caliber',
] as const

export type DataQualityDimension = (typeof DATA_QUALITY_DIMENSIONS)[number]
export type QualitySeverity = 'critical' | 'warning' | 'info'

export interface DataQualityRuleDefinition {
  ruleCode: string
  ruleType: string
  dimension: DataQualityDimension
  severity: QualitySeverity
  description: string
  recommendation: string
  autoResolveWhen?: string
  ownerDigestPolicy?: 'owner_digest' | 'silent'
  runtimeRole: 'detected' | 'registered_asset' | 'upstream_signal'
}

export const DATA_QUALITY_RULE_REGISTRY: DataQualityRuleDefinition[] = [
  {
    ruleCode: 'TREND_DELAY',
    ruleType: 'trend',
    dimension: 'timeliness',
    severity: 'warning',
    description: 'Task progress is behind the elapsed schedule window',
    recommendation: '优先核对计划工期、现场完成量和剩余工期，必要时提前调整资源。',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'SNAPSHOT_GAP',
    ruleType: 'staleness',
    dimension: 'timeliness',
    severity: 'warning',
    description: 'Active task has no recent progress snapshot',
    recommendation: '请尽快补录最近一次进度，避免后续分析失真。',
    autoResolveWhen: 'progress or status updated',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'PROGRESS_JUMP',
    ruleType: 'progress_quality',
    dimension: 'anomaly',
    severity: 'warning',
    description: 'Progress changed sharply within a short window',
    recommendation: '请核对最近两次进度填报依据，确认是否存在突击补填。',
    runtimeRole: 'upstream_signal',
  },
  {
    ruleCode: 'PROGRESS_MONTH_END_BURST',
    ruleType: 'progress_quality',
    dimension: 'anomaly',
    severity: 'warning',
    description: 'Progress was concentrated near month end',
    recommendation: '请核对月末集中填报的现场依据，确认是否存在月末突击补录。',
    runtimeRole: 'upstream_signal',
  },
  {
    ruleCode: 'PROGRESS_STUCK_FINISHING',
    ruleType: 'progress_quality',
    dimension: 'anomaly',
    severity: 'warning',
    description: 'Task is close to completion but has not closed for a long time',
    recommendation: '请核对接近完成但长期未闭合的原因，必要时补充验收或收尾说明。',
    runtimeRole: 'upstream_signal',
  },
  {
    ruleCode: 'PROGRESS_SOURCE_LOW_CONFIDENCE',
    ruleType: 'progress_quality',
    dimension: 'anomaly',
    severity: 'info',
    description: 'Progress snapshots mainly come from import, batch, or unknown sources',
    recommendation: '请补充一次现场确认后的进度记录，避免导入或批量填报影响后续趋势判断。',
    autoResolveWhen: 'new confirmed progress snapshot recorded',
    runtimeRole: 'upstream_signal',
  },
  {
    ruleCode: 'PROGRESS_ROLLBACK',
    ruleType: 'progress_quality',
    dimension: 'anomaly',
    severity: 'warning',
    description: 'Progress was corrected downward after a higher snapshot value',
    recommendation: '请确认本次进度回退是否为修正；确认后系统会降低误判影响并保留修正事实。',
    autoResolveWhen: 'subsequent confirmed progress snapshots stabilize',
    runtimeRole: 'upstream_signal',
  },
  {
    ruleCode: 'PROGRESS_DUPLICATE_FILL',
    ruleType: 'progress_quality',
    dimension: 'jumpiness',
    severity: 'info',
    description: 'Same progress value was recorded repeatedly across several days',
    recommendation: '请更新真实进展，或确认现场确实无变化，避免重复填报污染速度学习样本。',
    autoResolveWhen: 'fresh progress value or confirmed unchanged reason recorded',
    runtimeRole: 'upstream_signal',
  },
  {
    ruleCode: 'PROGRESS_TIME_MISMATCH',
    ruleType: 'anomaly',
    dimension: 'jumpiness',
    severity: 'warning',
    description: 'Task progress does not match elapsed schedule time',
    recommendation: '请复核计划工期与当前进度是否匹配，避免整体判断失真。',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'BATCH_SAME_VALUE',
    ruleType: 'anomaly',
    dimension: 'anomaly',
    severity: 'warning',
    description: 'Several tasks were filled with the same progress value in one batch',
    recommendation: '请核对同批任务是否被粗填为相同进度，必要时逐条修正。',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'PARENT_CHILD_INCONSISTENT',
    ruleType: 'cross_check',
    dimension: 'consistency',
    severity: 'critical',
    description: 'Parent task is completed while child tasks are unfinished',
    recommendation: '请先补齐子项状态，再同步父级完成情况。',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'DEPENDENCY_INCONSISTENT',
    ruleType: 'cross_check',
    dimension: 'consistency',
    severity: 'warning',
    description: 'Task started before a required predecessor was completed',
    recommendation: '如属正常穿插施工可保留现场事实；若该关系必须管控，请将依赖标为手动强前置或调整前后置关系。',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'MILESTONE_PREDECESSOR_INCONSISTENT',
    ruleType: 'cross_check',
    dimension: 'consistency',
    severity: 'critical',
    description: 'Milestone is completed while predecessors remain unfinished',
    recommendation: '请确认关键节点是否已满足前置任务条件，再决定是否保留完成状态。',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'CONDITION_UNSATISFIED_STARTED',
    ruleType: 'cross_check',
    dimension: 'consistency',
    severity: 'warning',
    description: 'Task has started while start conditions remain unsatisfied',
    recommendation: '请先确认开工条件，再继续更新任务进度。',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'ASSIGNEE_WORKLOAD_ABNORMAL',
    ruleType: 'anomaly',
    dimension: 'anomaly',
    severity: 'warning',
    description: 'Assignee has too many overlapping active tasks',
    recommendation: '请核查责任人同时承担的在途任务量，必要时调整责任分配。',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'ENGINEERING_OBJECT_MISSING',
    ruleType: 'completeness',
    dimension: 'completeness',
    severity: 'warning',
    description: 'Active executable task missing engineering object reference',
    recommendation: '请为任务补齐主要施工对象或施工范围，避免范围统计和偏差归因失真。',
    autoResolveWhen: 'engineering_object_id becomes non-null',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'PARTICIPANT_UNIT_MISSING',
    ruleType: 'completeness',
    dimension: 'completeness',
    severity: 'warning',
    description: 'Active task missing participant unit assignment',
    recommendation: '请补齐责任主体单位，确保责任汇总、通知触达和履约分析可追踪。',
    autoResolveWhen: 'participant_unit_id becomes non-null',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'WBS_TYPE_UNCALIBRATED',
    ruleType: 'wbs_classification',
    dimension: 'accuracy',
    severity: 'info',
    description: 'WBS node type inferred from depth rather than explicit assignment',
    recommendation: '请为该行补齐 WBS 语义类型或工程分类，避免只能按层级推断。',
    autoResolveWhen: 'wbs_node_type or engineering_category_id set explicitly',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'STATUS_NORMALIZATION_NEEDED',
    ruleType: 'status_normalization',
    dimension: 'governance',
    severity: 'warning',
    description: 'Task status not normalized to standard dictionary value',
    recommendation: '请将任务状态调整为状态字典标准值，避免统计口径出现同义状态。',
    autoResolveWhen: 'status normalized to dictionary value',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'LINEAGE_INCOMPLETE',
    ruleType: 'lineage',
    dimension: 'lineage',
    severity: 'info',
    description: 'Source mapping missing for task created from template/baseline/monthly plan',
    recommendation: '请补齐任务来源映射，确保模板、基线或月度计划生成链路可追溯。',
    autoResolveWhen: 'data_lineage_links record created for entity',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'ACCEPTANCE_LINK_ORPHAN',
    ruleType: 'cross_consistency',
    dimension: 'consistency',
    severity: 'warning',
    description: 'Acceptance plan linked to task that no longer exists or is cancelled',
    recommendation: '请修正验收关联任务，或将该验收项关闭/归档以保持联动一致。',
    autoResolveWhen: 'task restored or acceptance link updated',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'CONDITION_ORPHAN',
    ruleType: 'cross_consistency',
    dimension: 'consistency',
    severity: 'warning',
    description: 'Task condition references deleted or inactive source entity',
    recommendation: '请修正条件来源，或将该条件标记为不适用，避免开工条件链路悬空。',
    autoResolveWhen: 'source restored or condition marked inapplicable',
    runtimeRole: 'registered_asset',
  },
  {
    ruleCode: 'STALE_PROGRESS',
    ruleType: 'staleness',
    dimension: 'timeliness',
    severity: 'info',
    description: 'Task not updated in 14+ days while still active',
    recommendation: '请补录或确认该任务近期无变化，避免历史进度影响趋势判断。',
    autoResolveWhen: 'progress or status updated',
    runtimeRole: 'registered_asset',
  },
  {
    ruleCode: 'RETENTION_DECISION_EXPIRED',
    ruleType: 'retention',
    dimension: 'retention',
    severity: 'warning',
    description: 'Retention decision token expired before confirmation',
    recommendation: '请重新发起保留/删除决策，并保留新的确认记录。',
    autoResolveWhen: 'decision regenerated',
    ownerDigestPolicy: 'silent',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'RETENTION_CONFIRMATION_FAILED',
    ruleType: 'retention',
    dimension: 'retention',
    severity: 'warning',
    description: 'Retention confirmation executor failed after reservation',
    recommendation: '请检查确认执行错误并人工恢复或重新发起保留/删除治理决策。',
    autoResolveWhen: 'confirmation retried successfully or event manually resolved',
    ownerDigestPolicy: 'silent',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'RETENTION_CONFIRMING_STALE',
    ruleType: 'retention',
    dimension: 'retention',
    severity: 'warning',
    description: 'Retention confirmation stayed in confirming state beyond recovery window',
    recommendation: '请恢复确认执行或转人工处理，避免保留/删除动作长期悬挂。',
    autoResolveWhen: 'confirmation executed, failed, expired, or manually resolved',
    ownerDigestPolicy: 'silent',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'SOURCE_DELETED_UNRESOLVED',
    ruleType: 'retention',
    dimension: 'retention',
    severity: 'info',
    description: 'Finding source has been deleted and should be resolved by governance action',
    recommendation: '请确认来源删除是否合规，并将相关数据质量发现标记为来源已删除。',
    autoResolveWhen: 'source_deleted resolution applied',
    ownerDigestPolicy: 'silent',
    runtimeRole: 'registered_asset',
  },
  {
    ruleCode: 'METRIC_CALIBER_MISSING',
    ruleType: 'metric_caliber',
    dimension: 'metric_caliber',
    severity: 'warning',
    description: 'Metric caliber or registry metadata is missing',
    recommendation: '请补齐指标注册信息或口径元数据，避免报表出现平行统计口径。',
    autoResolveWhen: 'metric caliber metadata restored',
    ownerDigestPolicy: 'silent',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'METRIC_VALUE_UNAVAILABLE',
    ruleType: 'metric_caliber',
    dimension: 'metric_caliber',
    severity: 'info',
    description: 'Metric value is unavailable under the current caliber',
    recommendation: '请确认快照或摘要服务是否已生成该指标，必要时重新计算快照。',
    autoResolveWhen: 'snapshot recomputed with metric availability',
    ownerDigestPolicy: 'silent',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'MATERIAL_SPECIALTY_MISSING',
    ruleType: 'completeness',
    dimension: 'completeness',
    severity: 'warning',
    description: 'Material missing specialty classification',
    recommendation: '请为材料补齐对应专业或工程对象，避免材料到场与任务联动失真。',
    autoResolveWhen: 'specialty_type IS NOT NULL',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'MATERIAL_UNIT_MISSING',
    ruleType: 'completeness',
    dimension: 'completeness',
    severity: 'warning',
    description: 'Material missing participant unit',
    recommendation: '请补齐材料责任单位，确保到场、验收和催办可追踪。',
    autoResolveWhen: 'participant_unit_id IS NOT NULL',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'MATERIAL_ARRIVAL_OVERDUE',
    ruleType: 'staleness',
    dimension: 'timeliness',
    severity: 'warning',
    description: 'Material past expected arrival date',
    recommendation: '请核对材料预计到场日期和实际到场状态，必要时同步影响任务。',
    autoResolveWhen: 'actual_arrival_date IS NOT NULL',
    runtimeRole: 'detected',
  },
  {
    ruleCode: 'MATERIAL_SAMPLE_PENDING',
    ruleType: 'staleness',
    dimension: 'timeliness',
    severity: 'info',
    description: 'Material sample confirmation pending beyond expected date',
    recommendation: '请确认材料样品状态，避免样品未确认影响后续采购或施工判断。',
    autoResolveWhen: 'sample_confirmed = true',
    runtimeRole: 'detected',
  },
]

const ruleByCode = new Map(DATA_QUALITY_RULE_REGISTRY.map((rule) => [rule.ruleCode, rule]))

export function getDataQualityRuleDefinition(ruleCode: string) {
  return ruleByCode.get(String(ruleCode ?? '').trim().toUpperCase()) ?? null
}

export function getDataQualityRuleDimension(ruleCode: string, fallback: DataQualityDimension = 'timeliness') {
  return getDataQualityRuleDefinition(ruleCode)?.dimension ?? fallback
}

export function getDataQualityRecommendation(ruleCode: string, fallback = '请核对当前数据并根据现场情况修正。') {
  return getDataQualityRuleDefinition(ruleCode)?.recommendation ?? fallback
}

export function isDataQualityOwnerDigestEligible(ruleCode: string) {
  return (getDataQualityRuleDefinition(ruleCode)?.ownerDigestPolicy ?? 'owner_digest') === 'owner_digest'
}

export function listDataQualityRuleCodes() {
  return DATA_QUALITY_RULE_REGISTRY.map((rule) => rule.ruleCode)
}
