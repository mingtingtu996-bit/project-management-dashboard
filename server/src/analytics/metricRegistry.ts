export type MetricSource = 'projectExecutionSummaryService' | 'project_daily_snapshot'

export type MetricGranularity = 'day' | 'week' | 'month'

export type MetricGroupBy = 'none' | 'building' | 'specialty' | 'phase' | 'region'

export interface MetricRegistryEntry {
  key: string
  label: string
  description: string
  source: MetricSource
  defaultGranularity: MetricGranularity
  supportedGroupBy: MetricGroupBy[]
}

const DEFAULT_SUPPORTED_GROUP_BY: MetricGroupBy[] = [
  'none',
  'building',
  'specialty',
  'phase',
  'region',
]

export const METRIC_REGISTRY = {
  health_score: {
    key: 'health_score',
    label: '健康度',
    description: '项目级综合健康度',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  health_status: {
    key: 'health_status',
    label: '健康状态',
    description: '健康度分档状态',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  overall_progress: {
    key: 'overall_progress',
    label: '总体进度',
    description: '项目整体加权进度',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  task_progress: {
    key: 'task_progress',
    label: '任务进度',
    description: '任务维度完成率',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  delay_days: {
    key: 'delay_days',
    label: '延期天数',
    description: '项目累计延期天数',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  delay_count: {
    key: 'delay_count',
    label: '延期次数',
    description: '已延期任务或里程碑数量',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  active_risk_count: {
    key: 'active_risk_count',
    label: '活跃风险数',
    description: '未关闭风险数量',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  pending_condition_count: {
    key: 'pending_condition_count',
    label: '待满足条件数',
    description: '当前未满足的前置条件数量',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  active_obstacle_count: {
    key: 'active_obstacle_count',
    label: '阻碍数',
    description: '活跃阻碍数量',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  active_delay_requests: {
    key: 'active_delay_requests',
    label: '延期审批数',
    description: '活跃延期审批请求数量',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  monthly_close_status: {
    key: 'monthly_close_status',
    label: '月结状态',
    description: '项目当月收口状态',
    source: 'project_daily_snapshot',
    defaultGranularity: 'month',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  attention_required: {
    key: 'attention_required',
    label: '关注项目',
    description: '是否需要重点关注',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  highest_warning_level: {
    key: 'highest_warning_level',
    label: '最高预警等级',
    description: '项目当前最高预警等级',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  shifted_milestone_count: {
    key: 'shifted_milestone_count',
    label: '调整里程碑数',
    description: '已发生偏移的里程碑数量',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
  critical_path_affected_tasks: {
    key: 'critical_path_affected_tasks',
    label: '关键路径受影响任务数',
    description: '受关键路径影响的任务数量',
    source: 'project_daily_snapshot',
    defaultGranularity: 'day',
    supportedGroupBy: DEFAULT_SUPPORTED_GROUP_BY,
  },
} satisfies Record<string, MetricRegistryEntry>

export type MetricKey = keyof typeof METRIC_REGISTRY

export const METRIC_REGISTRY_KEYS = Object.keys(METRIC_REGISTRY) as MetricKey[]

export function isRegisteredMetric(metric: string): metric is MetricKey {
  return Object.prototype.hasOwnProperty.call(METRIC_REGISTRY, metric)
}

export function getMetricRegistryEntry(metric: string): MetricRegistryEntry | undefined {
  return isRegisteredMetric(metric) ? METRIC_REGISTRY[metric] : undefined
}

export function listMetricRegistry(): MetricRegistryEntry[] {
  return METRIC_REGISTRY_KEYS.map((key) => METRIC_REGISTRY[key])
}
