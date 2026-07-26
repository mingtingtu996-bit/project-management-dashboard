// v1.4.17: Extended metric registry service
// Unified metric key definitions, source declarations, and null-value policies

import { logger } from '../middleware/logger.js'

// ============================================================
// Metric type system (v1.4.17)
// ============================================================
export type MetricAvailabilityStatus =
  | 'ready'
  | 'insufficient_data'
  | 'not_applicable'
  | 'data_pending'
  | 'source_unavailable'
  | 'low_confidence'

export type MetricDataType = 'number' | 'percentage' | 'count' | 'duration_days' | 'currency' | 'score' | 'flag' | 'boolean'

export type MetricNullStrategy =
  | 'show_zero'       // Display 0 when data unavailable
  | 'show_null'       // Display "暂无" when data unavailable
  | 'show_incomplete' // Display "数据待完善" when data unavailable
  | 'omit'            // Omit from display entirely

export type MetricValueType =
  | 'count' | 'rate' | 'percent' | 'days' | 'score' | 'status' | 'currency' | 'duration' | 'boolean'

export type MetricDomain =
  | 'project_execution' | 'planning' | 'progress' | 'baseline' | 'monthly_plan'
  | 'task' | 'wbs' | 'engineering_object' | 'responsibility' | 'milestone'
  | 'dependency_condition_obstacle' | 'acceptance' | 'drawing_certificate'
  | 'material' | 'risk_issue_warning' | 'notification' | 'data_quality' | 'health' | 'ai'

export type MetricConsumer =
  | 'dashboard' | 'reports' | 'task_summary' | 'responsibility'
  | 'company_cockpit' | 'weekly_digest' | 'ai' | 'notification'
  | 'special_page' | 'hidden'

export type MetricSource =
  | 'projectExecutionSummaryService'
  | 'project_daily_snapshot'
  | 'taskAttributionSummaryService'
  | 'progressDeviationService'
  | 'riskStatisticsService'
  | 'acceptanceSummaryService'
  | 'materialsSummaryService'
  | 'healthScoreService'
  | 'milestoneOverviewService'
  | 'dataQualityGovernanceService'
  | 'responsibilityInsightService'
  | 'notificationAnalyticsService'
  | 'projectProductivityCompensationService'
  | 'monthlyPlanSummaryService'
  | 'taskSummaryService'
  | 'projectStartReadinessService'
  | 'structuredCauseAttributionService'

export interface MetricDefinition {
  metricKey: string
  label: string
  description: string
  dataType: MetricDataType
  unit?: string
  source: MetricSource
  nullStrategy: MetricNullStrategy
  defaultGranularity: 'project' | 'daily' | 'monthly' | 'weekly'
  supportedGroupBy: string[]
  requiresDataQualityThreshold?: number  // minimum confidence score to display
  frontendVisible: boolean
  deprecatedAliases?: string[]
  snapshotPolicy: 'daily' | 'on_change' | 'monthly' | 'manual' | 'none'
  qualityDimension?: string
}

export type MetricGranularity = 'day' | 'week' | 'month'

export type MetricGroupBy =
  | 'none'
  | 'project'
  | 'building'
  | 'basement'
  | 'floor'
  | 'physical_zone'
  | 'functional_area'
  | 'section'
  | 'specialty'
  | 'phase'
  | 'division'
  | 'subdivision'
  | 'engineering_object'
  | 'wbs_node_type'
  | 'participant_unit'
  | 'assignee'
  | 'severity'

export type MetricKey = string

export interface MetricRegistryEntry {
  key: string
  label: string
  description: string
  source: MetricSource
  defaultGranularity: MetricGranularity
  supportedGroupBy: MetricGroupBy[]
  dataType?: MetricDataType
  nullStrategy?: MetricNullStrategy
  requiresDataQualityThreshold?: number
  frontendVisible?: boolean
  deprecatedAliases?: string[]
}

// ============================================================
// Extended metric registry (v1.4.17)
// ============================================================
export const METRIC_REGISTRY: MetricDefinition[] = [
  // --- Core health ---
  {
    metricKey: 'health_score',
    label: '业务健康分',
    description: '项目业务健康评分（进度兑现、任务执行、里程碑交付、风险问题控制）',
    dataType: 'score',
    unit: '分',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'business_health_score',
    label: '业务健康分',
    description: '不混入数据可靠性的业务健康评分，用于 Dashboard、CompanyCockpit、Reports 的统一主健康分。',
    dataType: 'score',
    unit: '分',
    source: 'healthScoreService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
    deprecatedAliases: ['businessHealthScore'],
  },
  {
    metricKey: 'execution_stability_score',
    label: 'Execution stability score',
    description: 'Task execution stability dimension in the v1.4.19 business health model.',
    dataType: 'score',
    unit: 'score',
    source: 'healthScoreService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
    deprecatedAliases: ['taskExecutionScore'],
  },
  {
    metricKey: 'progress_delivery_score',
    label: 'Progress delivery score',
    description: 'Progress delivery dimension in the v1.4.19 business health model.',
    dataType: 'score',
    unit: 'score',
    source: 'healthScoreService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: false,
    snapshotPolicy: 'daily',
    deprecatedAliases: ['progressDeliveryScore'],
  },
  {
    metricKey: 'critical_target_score',
    label: 'Critical target score',
    description: 'Milestone and critical target delivery dimension in the v1.4.19 business health model.',
    dataType: 'score',
    unit: 'score',
    source: 'healthScoreService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: false,
    snapshotPolicy: 'daily',
    deprecatedAliases: ['milestoneDeliveryScore'],
  },
  {
    metricKey: 'business_exception_score',
    label: 'Business exception score',
    description: 'Risk, issue, obstacle, and condition exception dimension in the v1.4.19 business health model.',
    dataType: 'score',
    unit: 'score',
    source: 'healthScoreService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: false,
    snapshotPolicy: 'daily',
    deprecatedAliases: ['riskControlScore'],
  },
  {
    metricKey: 'plan_governance_score',
    label: 'Plan governance score',
    description: 'Plan governance dimension based on blocked tasks, delay days, and critical path impact.',
    dataType: 'score',
    unit: 'score',
    source: 'healthScoreService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'health_status',
    label: '业务健康状态',
    description: '业务健康分级（健康/亚健康/预警/危险）',
    dataType: 'flag',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_null',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'reliability_score',
    label: 'Data reliability score',
    description: 'Data reliability score shown separately from business health; it explains confidence but does not reduce business health.',
    dataType: 'score',
    unit: 'score',
    source: 'dataQualityGovernanceService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
    qualityDimension: 'coverage',
    deprecatedAliases: ['data_confidence_score', 'data_trust_score'],
  },

  // --- Progress ---
  {
    metricKey: 'overall_progress',
    label: '整体进度',
    description: '所有可执行任务的加权平均进度',
    dataType: 'percentage',
    unit: '%',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'engineering_object', 'wbs_node_type', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'task_progress',
    label: '任务进度分布',
    description: '按进度区间分布的任务数量',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'assignee', 'participant_unit', 'engineering_object'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'task_summary_progress_change',
    label: 'Task-summary progress change',
    description: 'Weighted project progress change between the period baseline and period end, derived from task progress snapshots.',
    dataType: 'percentage',
    unit: '%',
    source: 'taskSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
  },
  {
    metricKey: 'task_summary_tasks_updated',
    label: 'Task-summary updated tasks',
    description: 'Tasks with comparable progress snapshots in the selected period.',
    dataType: 'count',
    source: 'taskSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
  },
  {
    metricKey: 'task_summary_tasks_progressed',
    label: 'Task-summary progressed tasks',
    description: 'Tasks whose comparable progress snapshots increased in the selected period.',
    dataType: 'count',
    source: 'taskSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
  },
  {
    metricKey: 'task_summary_tasks_completed',
    label: 'Task-summary completed tasks',
    description: 'Tasks crossing from below 100 percent to 100 percent in the selected period.',
    dataType: 'count',
    source: 'taskSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
  },
  {
    metricKey: 'task_summary_delayed_count',
    label: 'Task-summary delayed tasks',
    description: 'Tasks delayed as of the selected period end under the construction-calendar delay policy.',
    dataType: 'count',
    source: 'taskSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
  },
  {
    metricKey: 'task_summary_on_time_rate',
    label: 'Task-summary on-time rate',
    description: 'Share of tasks updated in the selected period that are not delayed at the period end.',
    dataType: 'percentage',
    unit: '%',
    source: 'taskSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
  },
  {
    metricKey: 'delay_days',
    label: '延期天数',
    description: '未完成任务逾期暴露天数与已完成任务实际完成超过计划完成的累计天数',
    dataType: 'duration_days',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'engineering_object', 'wbs_node_type', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'schedule_deviation_days',
    label: '偏差天数',
    description: '实际完成日期相对计划完成日期的签名偏差天数，负值表示提前，正值表示滞后',
    dataType: 'duration_days',
    source: 'progressDeviationService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'engineering_object', 'wbs_node_type', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'delay_count',
    label: '延期任务数',
    description: '当前已延期且未完成的任务数量',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'planned_cumulative',
    label: 'Planned cumulative progress',
    description: 'Baseline-aware planned cumulative progress for S-curve comparison; published by projectDailySnapshotService.',
    dataType: 'percentage',
    unit: '%',
    source: 'project_daily_snapshot',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },

  // --- Productivity distribution (BP-Z-9 production signal visibility) ---
  {
    metricKey: 'productivity_monthly_average_p',
    label: 'Monthly average productivity P',
    description: 'Average task-level productivity P for tasks active in the current month; paired with tail metrics so large projects do not hide acceleration signals.',
    dataType: 'percentage',
    unit: 'P',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_monthly_max_p',
    label: 'Monthly max productivity P',
    description: 'Maximum task-level productivity P in the current month, used to preserve acceleration peaks hidden by monthly averages.',
    dataType: 'percentage',
    unit: 'P',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_monthly_min_p',
    label: 'Monthly min productivity P',
    description: 'Minimum task-level productivity P in the current month, used to expose severe local blockers alongside acceleration peaks.',
    dataType: 'percentage',
    unit: 'P',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_monthly_p90',
    label: 'Monthly P90 productivity',
    description: '90th percentile task-level productivity P in the current month, showing acceleration-layer activity without being diluted by the full task set.',
    dataType: 'percentage',
    unit: 'P',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_acceleration_case_ratio',
    label: 'Acceleration case ratio',
    description: 'Share of current-month task productivity cases with P greater than 1.0; exposes acceleration breadth in large projects.',
    dataType: 'percentage',
    unit: 'ratio',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_monthly_case_count',
    label: 'Monthly productivity case count',
    description: 'Number of current-month task productivity cases contributing to monthly productivity distribution metrics.',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_sample_maturity_score',
    label: 'Productivity sample maturity score',
    description: 'Backend-only maturity score for the current monthly productivity sample set: none=0, low=1, medium=2, high=3.',
    dataType: 'number',
    unit: 'score',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: false,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_critical_path_sample_count',
    label: 'Critical path productivity sample count',
    description: 'Backend-only count of critical-path tasks contributing to the current monthly productivity distribution.',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: false,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_building_acceleration_case_ratio',
    label: 'Building acceleration case ratio',
    description: 'Maximum building-scope share of current-month task productivity cases with P greater than 1.0; backend signal for local acceleration.',
    dataType: 'percentage',
    unit: 'ratio',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['building'],
    frontendVisible: false,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_specialty_acceleration_case_ratio',
    label: 'Specialty acceleration case ratio',
    description: 'Maximum specialty-scope share of current-month task productivity cases with P greater than 1.0; backend signal for local acceleration.',
    dataType: 'percentage',
    unit: 'ratio',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['specialty'],
    frontendVisible: false,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'productivity_critical_path_acceleration_case_ratio',
    label: 'Critical path acceleration case ratio',
    description: 'Critical-path share of current-month productivity cases with P greater than 1.0; backend signal for milestone-driven acceleration.',
    dataType: 'percentage',
    unit: 'ratio',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: false,
    snapshotPolicy: 'daily',
  },

  // --- Plan usability (v1.4.7.2 + v1.4.7.4 + v1.4.18) ---
  {
    metricKey: 'generated_plan_duration_readiness_rate',
    label: '生成计划工期合理度',
    description: '非模板占位工期任务占全部生成任务的比例，用于判断模板生成后的计划是否具备现场可用工期基础',
    dataType: 'percentage',
    unit: '%',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'dependency_topology_non_trivial_rate',
    label: '依赖拓扑非平凡度',
    description: '非全 FS 或具备有效流水/搭接关系的任务占比，用于判断计划依赖是否摆脱简单串联',
    dataType: 'percentage',
    unit: '%',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'monthly_plan_confirmation_readiness_score',
    label: 'Monthly plan confirmation readiness score',
    description: 'Explainable monthly-plan confirmation score from data completeness, E2 confidence, capacity load, unresolved blockers, manual overrides, and carryover fulfillment history.',
    dataType: 'number',
    unit: 'score',
    source: 'monthlyPlanSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project', 'month'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'monthly_plan_manual_review_required_count',
    label: 'Monthly plan manual review required count',
    description: 'Count of monthly plans whose confirmation readiness score or review reasons require manual review before confirmation.',
    dataType: 'count',
    unit: 'plans',
    source: 'monthlyPlanSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project', 'month'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'responsible_unit_resolution_rate',
    label: '责任单位解析成功率',
    description: '已映射到责任单位主数据的任务占比，用于判断模板角色是否成功实例化为项目责任主体',
    dataType: 'percentage',
    unit: '%',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'precondition_attachment_rate',
    label: '开工条件挂接率',
    description: '已挂接为实际开工条件的模板条件占全部条件占位的比例，用于判断模板条件是否进入项目事实层',
    dataType: 'percentage',
    unit: '%',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },

  {
    metricKey: 'baseline_deviation_rate',
    label: '基线偏离率',
    description: '已绑定基线的当前执行任务中，已偏离生效基线承诺的任务比例',
    dataType: 'percentage',
    unit: '%',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'monthly_plan_fulfillment_rate',
    label: '月计划履约率',
    description: '已关联月度计划条目的当前执行任务中，已完成任务的比例',
    dataType: 'percentage',
    unit: '%',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'monthly_plan_confirmed_count',
    label: 'Monthly plan confirmed count',
    description: 'Count of monthly plans that have entered confirmed status, published by the project execution summary service.',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'monthly_plan_closed_count',
    label: 'Monthly plan closed count',
    description: 'Count of monthly plans that have been closed, published by the project execution summary service.',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'monthly_plan_pending_closeout_count',
    label: 'Monthly plan pending closeout count',
    description: 'Count of monthly plan commitment items still pending closeout, published by the project execution summary service.',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'planning_alignment_status',
    label: '计划对齐状态',
    description: '由待重对齐计划和临时无基线月计划共同派生的项目计划对齐状态',
    dataType: 'flag',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_null',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'temporary_without_baseline_count',
    label: '临时无基线月计划数',
    description: '因缺少有效基线而从当前排期生成的月度计划数量',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'planning_pending_realign_count',
    label: '待重对齐计划数',
    description: '当前仍处于待重新对齐状态的计划记录数量',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },

  // --- Productivity compensation (v1.4.7.4 integration calibration) ---
  {
    metricKey: 'productivity_base_p',
    label: 'Base productivity P',
    description: 'Raw monthly or task-context productivity before project-level recovery compensation is applied.',
    dataType: 'percentage',
    unit: 'P',
    source: 'projectProductivityCompensationService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    requiresDataQualityThreshold: 60,
    frontendVisible: true,
    snapshotPolicy: 'none',
    deprecatedAliases: ['productivity_compensation_base_productivity'],
  },
  {
    metricKey: 'productivity_compensation_uplift',
    label: 'Productivity compensation uplift',
    description: 'Bounded positive productivity uplift inferred from duration experience samples, project daily snapshots, and applicable schedule-state recovery signals.',
    dataType: 'percentage',
    unit: 'P',
    source: 'projectProductivityCompensationService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    requiresDataQualityThreshold: 60,
    frontendVisible: true,
    snapshotPolicy: 'none',
  },
  {
    metricKey: 'productivity_adjusted_p',
    label: 'Adjusted productivity P',
    description: 'Final productivity after controlled project-level compensation, capped by maturity and rigid shutdown policies.',
    dataType: 'percentage',
    unit: 'P',
    source: 'projectProductivityCompensationService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    requiresDataQualityThreshold: 60,
    frontendVisible: true,
    snapshotPolicy: 'none',
    deprecatedAliases: ['productivity_compensation_adjusted_productivity'],
  },
  {
    metricKey: 'productivity_compensation_duration_multiplier',
    label: 'Productivity compensation duration multiplier',
    description: 'Duration multiplier equivalent of the productivity compensation; values below 1 shorten duration only when compensation is auto-applied.',
    dataType: 'number',
    unit: 'x',
    source: 'projectProductivityCompensationService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    requiresDataQualityThreshold: 60,
    frontendVisible: true,
    snapshotPolicy: 'none',
    deprecatedAliases: ['productivity_compensation_factor'],
  },
  {
    metricKey: 'productivity_compensation_maturity_days',
    label: 'Productivity compensation maturity days',
    description: 'Evidence maturity used to decide whether productivity compensation is cold-start, warm, stable, or mature.',
    dataType: 'duration_days',
    unit: 'days',
    source: 'projectProductivityCompensationService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
  },
  {
    metricKey: 'productivity_compensation_maturity_tier',
    label: 'Productivity compensation maturity tier',
    description: 'Cold-start or mature compensation tier derived from duration experience and project daily snapshot evidence.',
    dataType: 'flag',
    source: 'projectProductivityCompensationService',
    nullStrategy: 'show_null',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
  },

  // --- Risk & Issues ---
  {
    metricKey: 'active_risk_count',
    label: '活跃风险数',
    description: 'status in (identified, mitigating) 的风险数量',
    dataType: 'count',
    source: 'riskStatisticsService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'severity', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'active_issue_count',
    label: '活跃问题数',
    description: 'status in (open, investigating) 的问题数量',
    dataType: 'count',
    source: 'riskStatisticsService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'severity', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },

  // --- Conditions & Obstacles ---
  {
    metricKey: 'start_readiness_task_count_14d',
    label: '14-day planned start task count',
    description: 'Tasks planned to start within the next fourteen business-timezone calendar dates.',
    dataType: 'count',
    source: 'projectStartReadinessService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'on_change',
  },
  {
    metricKey: 'start_readiness_ready_task_count_14d',
    label: '14-day ready task count',
    description: 'Planned start tasks with no authoritative blocking reference.',
    dataType: 'count',
    source: 'projectStartReadinessService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'on_change',
  },
  {
    metricKey: 'start_readiness_blocked_task_count_14d',
    label: '14-day blocked task count',
    description: 'Planned start tasks with at least one controlled blocking reference.',
    dataType: 'count',
    source: 'projectStartReadinessService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'on_change',
  },
  {
    metricKey: 'start_readiness_attention_task_count_14d',
    label: '14-day attention task count',
    description: 'Planned start tasks with non-blocking readiness attention items.',
    dataType: 'count',
    source: 'projectStartReadinessService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'on_change',
  },
  {
    metricKey: 'start_readiness_ready_rate_14d',
    label: '14-day ready task rate',
    description: 'Ready planned-start tasks divided by tasks in the authoritative fourteen-date window.',
    dataType: 'percentage',
    unit: '%',
    source: 'projectStartReadinessService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'on_change',
  },
  {
    metricKey: 'start_readiness_production_date_count_14d',
    label: '14-day construction production date count',
    description: 'Production dates in the lookahead window; unavailable when authoritative calendar identity is missing.',
    dataType: 'count',
    unit: 'construction_production_day',
    source: 'projectStartReadinessService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'on_change',
  },
  {
    metricKey: 'pending_condition_count',
    label: '待满足条件数',
    description: '未满足的开工条件数量',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'active_obstacle_count',
    label: '活跃阻碍数',
    description: '未解决的阻碍记录数量',
    dataType: 'count',
    source: 'projectExecutionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },

  // --- Milestones ---
  {
    metricKey: 'milestone_on_time_rate',
    label: '里程碑按时完成率',
    description: '按时完成的里程碑占比',
    dataType: 'percentage',
    unit: '%',
    source: 'milestoneOverviewService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    requiresDataQualityThreshold: 70,
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'shifted_milestone_count',
    label: '偏移里程碑数',
    description: '计划日期发生偏移的里程碑数量',
    dataType: 'count',
    source: 'milestoneOverviewService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },

  // --- Acceptance (v1.4.17 new) ---
  // Entity completion rates are business metrics, not task execution progress.
  // They stay in the metric registry and must not reuse calculateProgressMetrics.
  {
    metricKey: 'acceptance_completion_rate',
    label: '验收完成率',
    description: '已完成验收项占总数比例',
    dataType: 'percentage',
    unit: '%',
    source: 'acceptanceSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project', 'engineering_object'],
    requiresDataQualityThreshold: 60,
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'acceptance_overdue_count',
    label: '逾期验收项',
    description: '已逾期未完成的验收项数量',
    dataType: 'count',
    source: 'acceptanceSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },

  // --- Materials (v1.4.17 new, v1.4.21 extended) ---
  // Material rates describe material lifecycle completion, not task progress.
  {
    metricKey: 'material_arrival_rate',
    label: '材料到场率',
    description: '已到场材料项占计划到场项的比例',
    dataType: 'percentage',
    unit: '%',
    source: 'materialsSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    requiresDataQualityThreshold: 60,
    frontendVisible: true,
    snapshotPolicy: 'monthly',
    deprecatedAliases: ['material_arrival_completion_rate'],
  },
  {
    metricKey: 'material_on_time_arrival_rate',
    label: '材料按时到场率',
    description: '按时到场材料占计划到场材料的比例',
    dataType: 'percentage',
    unit: '%',
    source: 'materialsSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    requiresDataQualityThreshold: 60,
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'material_sample_confirmation_rate',
    label: '定样完成率',
    description: '已完成定样的材料占需定样材料的比例',
    dataType: 'percentage',
    unit: '%',
    source: 'materialsSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    requiresDataQualityThreshold: 60,
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'material_inspection_completion_rate',
    label: '送检完成率',
    description: '已完成送检的材料占需送检材料的比例',
    dataType: 'percentage',
    unit: '%',
    source: 'materialsSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    requiresDataQualityThreshold: 60,
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'material_overdue_unarrived_count',
    label: '逾期未到材料数',
    description: '预计到场日期已过但未实际到场的活跃材料数',
    dataType: 'count',
    source: 'materialsSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
    deprecatedAliases: ['material_late_arrival_count'],
  },
  {
    metricKey: 'material_critical_risk_count',
    label: '关键材料风险数',
    description: '逾期未到且明确关联关键任务的活跃材料数',
    dataType: 'count',
    source: 'materialsSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },

  // --- Data quality (v1.4.17 new) ---
  {
    metricKey: 'data_confidence_score',
    label: '数据可靠性',
    description: '数据可靠性评分（0-100），用于解释业务健康结论可信度',
    dataType: 'score',
    unit: '分',
    source: 'dataQualityGovernanceService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
    qualityDimension: 'coverage',
  },
  {
    metricKey: 'structured_cause_other_rate',
    label: '归因其他项占比',
    description: '已确认结构化原因中使用“其他”的占比，用于形成 taxonomy 修订候选，不自动改写历史归因。',
    dataType: 'percentage',
    unit: '%',
    source: 'structuredCauseAttributionService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'project',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
    qualityDimension: 'classification_coverage',
  },
  {
    metricKey: 'structured_cause_prefill_modification_rate',
    label: '归因预填修改率',
    description: '人工确认时修改系统预填原因的占比，用于形成推断规则修订候选，不自动改写历史归因。',
    dataType: 'percentage',
    unit: '%',
    source: 'structuredCauseAttributionService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'project',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'none',
    qualityDimension: 'inference_precision',
  },

  // --- Responsibility (v1.4.17 new) ---
  {
    metricKey: 'attribution_on_time_rate',
    label: '责任人按时完成率',
    description: '各责任人按时完成任务的比例',
    dataType: 'percentage',
    unit: '%',
    source: 'taskAttributionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project', 'assignee', 'participant_unit'],
    requiresDataQualityThreshold: 50,
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'responsibility_coverage_rate',
    label: '责任覆盖率',
    description: '已绑定稳定责任主体（责任人或责任单位）的可执行任务占比',
    dataType: 'percentage',
    unit: '%',
    source: 'responsibilityInsightService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'assignee', 'participant_unit'],
    requiresDataQualityThreshold: 50,
    frontendVisible: true,
    snapshotPolicy: 'daily',
    qualityDimension: 'coverage',
  },
  {
    metricKey: 'notification_total_count',
    label: '触达发送量',
    description: '当前公司或项目范围内产生的通知/待办触达总数',
    dataType: 'count',
    source: 'notificationAnalyticsService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'notification_read_rate',
    label: '触达已读率',
    description: 'notification_user_states 中已读触达占全部用户态记录的比例',
    dataType: 'percentage',
    unit: '%',
    source: 'notificationAnalyticsService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'notification_mute_rate',
    label: '触达静音率',
    description: 'notification_user_states 中被静音触达占全部用户态记录的比例',
    dataType: 'percentage',
    unit: '%',
    source: 'notificationAnalyticsService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'notification_dedupe_coverage_rate',
    label: '触达去重键覆盖率',
    description: '写入 dedupe_key 的触达占比，用于观察统一触达入口的去重治理覆盖情况',
    dataType: 'percentage',
    unit: '%',
    source: 'notificationAnalyticsService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'notification_action_conversion_rate',
    label: '触达到动作转化率',
    description: '以用户确认为代理口径的触达到业务动作转化率',
    dataType: 'percentage',
    unit: '%',
    source: 'notificationAnalyticsService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'notification_producer_contract_version_count',
    label: 'Notification producer contract versions',
    description: 'Number of producer contract versions observed in notification metadata; values above one indicate mixed old/new producer inputs or incomplete backfill.',
    dataType: 'count',
    source: 'notificationAnalyticsService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: false,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'active_delayed_tasks',
    label: '延期任务数',
    description: '当前已延期且仍处于活跃状态的任务数量',
    dataType: 'count',
    source: 'project_daily_snapshot',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'monthly_close_status',
    label: '月结状态',
    description: '项目当月计划收口状态',
    dataType: 'flag',
    source: 'project_daily_snapshot',
    nullStrategy: 'show_null',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'attention_required',
    label: '关注项目',
    description: '项目当前是否需要重点关注',
    dataType: 'boolean',
    source: 'project_daily_snapshot',
    nullStrategy: 'show_null',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'highest_warning_level',
    label: '最高预警等级',
    description: '项目当前最高预警等级',
    dataType: 'score',
    source: 'project_daily_snapshot',
    nullStrategy: 'show_null',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'critical_path_affected_tasks',
    label: '关键路径受影响任务数',
    description: '当前受关键路径影响的任务数量',
    dataType: 'count',
    source: 'project_daily_snapshot',
    nullStrategy: 'show_zero',
    defaultGranularity: 'daily',
    supportedGroupBy: ['project'],
    frontendVisible: true,
    snapshotPolicy: 'daily',
  },
  {
    metricKey: 'attribution_completion_rate',
    label: '责任归属完成率',
    description: '任务总结归属对象内已完成任务占该归属任务总量的比例',
    dataType: 'percentage',
    unit: '%',
    source: 'taskAttributionSummaryService',
    nullStrategy: 'show_incomplete',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project', 'assignee', 'participant_unit', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'attribution_avg_delay_days',
    label: '责任归属平均延期天数',
    description: '任务总结归属对象内延期完成任务的平均延期天数',
    dataType: 'duration_days',
    unit: '天',
    source: 'taskAttributionSummaryService',
    nullStrategy: 'show_zero',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project', 'assignee', 'participant_unit', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
  {
    metricKey: 'attribution_health_level',
    label: '责任归属健康档',
    description: '按责任归属按时率映射的健康档',
    dataType: 'flag',
    source: 'taskAttributionSummaryService',
    nullStrategy: 'show_null',
    defaultGranularity: 'monthly',
    supportedGroupBy: ['project', 'assignee', 'participant_unit', 'building', 'specialty', 'phase', 'physical_zone', 'functional_area'],
    frontendVisible: true,
    snapshotPolicy: 'monthly',
  },
]

// ============================================================
// Metric registry query helpers
// ============================================================
export function getMetricDefinition(metricKey: string): MetricDefinition | undefined {
  return METRIC_REGISTRY.find((metric) => metric.metricKey === metricKey)
    ?? METRIC_REGISTRY.find((metric) => metric.deprecatedAliases?.includes(metricKey))
}

export function getFrontendVisibleMetrics(): MetricDefinition[] {
  return METRIC_REGISTRY.filter(m => m.frontendVisible)
}

export function getSnapshotMetrics(): MetricDefinition[] {
  return METRIC_REGISTRY.filter(m => m.snapshotPolicy !== 'none')
}

export function getMetricsBySource(source: MetricSource): MetricDefinition[] {
  return METRIC_REGISTRY.filter(m => m.source === source)
}

export function getMetricsRequiringQuality(): MetricDefinition[] {
  return METRIC_REGISTRY.filter(m => m.requiresDataQualityThreshold != null)
}

export function getMetricsByGroupBy(groupBy: string): MetricDefinition[] {
  return METRIC_REGISTRY.filter(m => m.supportedGroupBy.includes(groupBy))
}

function toTrendGranularity(value: MetricDefinition['defaultGranularity']): MetricGranularity {
  if (value === 'weekly') return 'week'
  if (value === 'monthly') return 'month'
  return 'day'
}

function toTrendGroupByValues(values: string[]): MetricGroupBy[] {
  const normalized = new Set<MetricGroupBy>(['none'])
  for (const value of values) {
    const key = String(value ?? '').trim() as MetricGroupBy
    if (!key) continue
    if (key === 'project') {
      normalized.add('none')
      continue
    }
    normalized.add(key)
  }
  return [...normalized]
}

export function isRegisteredMetric(metric: string): metric is MetricKey {
  return Boolean(getMetricDefinition(metric))
}

export function getMetricRegistryEntry(metric: string): MetricRegistryEntry | undefined {
  const definition = getMetricDefinition(metric)
  if (!definition) return undefined
  return {
    key: definition.metricKey,
    label: definition.label,
    description: definition.description,
    source: definition.source,
    defaultGranularity: toTrendGranularity(definition.defaultGranularity),
    supportedGroupBy: toTrendGroupByValues(definition.supportedGroupBy),
    dataType: definition.dataType,
    nullStrategy: definition.nullStrategy,
    requiresDataQualityThreshold: definition.requiresDataQualityThreshold,
    frontendVisible: definition.frontendVisible,
    deprecatedAliases: definition.deprecatedAliases,
  }
}

export function listMetricRegistry(): MetricRegistryEntry[] {
  return METRIC_REGISTRY.map((definition) => getMetricRegistryEntry(definition.metricKey)).filter(Boolean) as MetricRegistryEntry[]
}

// ============================================================
// v1.4.17: Active predicate helpers
// ============================================================
export function isActiveTask(status: string): boolean {
  const inactiveStatuses = new Set(['cancelled', 'archived', 'voided', 'deleted', 'closed', '已取消', '已归档', '已作废', '已删除', '已关闭'])
  return !inactiveStatuses.has(String(status ?? '').trim().toLowerCase())
}

export function isCompletedTask(status: string, progress?: number): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return s === 'completed' || s === '已完成' || progress === 100
}

export function isExecutableTask(isExecutable?: boolean | null, isWbsSummary?: boolean | null): boolean {
  return Boolean(isExecutable) && !Boolean(isWbsSummary)
}

export function isStructureRow(isWbsSummary?: boolean | null): boolean {
  return Boolean(isWbsSummary)
}

// ============================================================
// Metric availability checker
// ============================================================
export function getMetricAvailability(
  hasData: boolean,
  dataQualityScore?: number,
  minQualityThreshold?: number,
): MetricAvailabilityStatus {
  if (!hasData) return 'insufficient_data'
  if (minQualityThreshold != null && dataQualityScore != null && dataQualityScore < minQualityThreshold) {
    return 'low_confidence'
  }
  return 'ready'
}

if (typeof logger.info === 'function') {
  logger.info('Metric registry loaded', { totalMetrics: METRIC_REGISTRY.length })
}
