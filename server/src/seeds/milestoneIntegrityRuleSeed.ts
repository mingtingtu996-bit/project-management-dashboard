import type {
  PlanningGovernanceGateLevel,
  PlanningGovernanceTargetSurface,
} from '../types/planning.js'

export type MilestoneKey = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8' | 'M9'

export type MilestoneScenarioType =
  | 'milestone_mapping_pending'
  | 'milestone_pending_takeover'
  | 'milestone_execution_closed'
  | 'milestone_baseline_removed'
  | 'milestone_data_incomplete'
  | 'milestone_deviation_excessive'
  | 'milestone_no_baseline'

export type MilestoneCommitmentAnchor = 'baseline' | 'monthly_plan' | 'manual' | 'unanchored'

export interface MilestoneScenarioPolicy {
  milestoneKey: MilestoneKey
  scenarioType: MilestoneScenarioType | null
  label: string
  suggestedAction: string
  defaultSeverity: 'info' | 'warning' | 'critical'
  defaultGateLevel: PlanningGovernanceGateLevel
  defaultTargetSurface: PlanningGovernanceTargetSurface
}

export const MILESTONE_INTEGRITY_RULE_SEED = {
  source: 'v149_milestone_integrity_rule_seed',
  ruleVersion: 1,
  commitmentAnchorPolicy: {
    manualWithoutAnchorGateLevel: 'confirm',
    formalAnchorBrokenGateLevel: 'block_save',
    criticalAnchorBrokenGateLevel: 'block_save',
    manualWithoutAnchorIssue: 'manual milestone missing commitment anchor',
    formalAnchorBrokenIssue: 'baseline commitment anchor missing',
    criticalAnchorBrokenIssue: 'critical milestone anchor requires repair before publishing',
  },
  scenarioPolicies: [
    {
      milestoneKey: 'M1',
      scenarioType: 'milestone_mapping_pending',
      label: 'M1 基线映射待补',
      suggestedAction: '请补齐基线映射并回到基线页确认',
      defaultSeverity: 'warning',
      defaultGateLevel: 'confirm',
      defaultTargetSurface: 'planning_governance',
    },
    {
      milestoneKey: 'M2',
      scenarioType: 'milestone_pending_takeover',
      label: 'M2 待承接',
      suggestedAction: '请确认承接关系并补齐执行层节点',
      defaultSeverity: 'warning',
      defaultGateLevel: 'confirm',
      defaultTargetSurface: 'planning_governance',
    },
    {
      milestoneKey: 'M3',
      scenarioType: null,
      label: 'M3 关键节点确认',
      suggestedAction: '请确认关键节点承诺关系和计划日期',
      defaultSeverity: 'warning',
      defaultGateLevel: 'confirm',
      defaultTargetSurface: 'planning_governance',
    },
    {
      milestoneKey: 'M4',
      scenarioType: null,
      label: 'M4 关键节点确认',
      suggestedAction: '请确认关键节点承诺关系和计划日期',
      defaultSeverity: 'warning',
      defaultGateLevel: 'confirm',
      defaultTargetSurface: 'planning_governance',
    },
    {
      milestoneKey: 'M5',
      scenarioType: 'milestone_execution_closed',
      label: 'M5 执行层已关闭',
      suggestedAction: '请改为关闭、取消或重新激活执行层节点',
      defaultSeverity: 'critical',
      defaultGateLevel: 'block_save',
      defaultTargetSurface: 'baseline',
    },
    {
      milestoneKey: 'M6',
      scenarioType: 'milestone_baseline_removed',
      label: 'M6 基线已移除',
      suggestedAction: '请重新确认基线版本并修复映射',
      defaultSeverity: 'critical',
      defaultGateLevel: 'block_save',
      defaultTargetSurface: 'baseline',
    },
    {
      milestoneKey: 'M7',
      scenarioType: 'milestone_data_incomplete',
      label: 'M7 数据不完整',
      suggestedAction: '请补全三时间字段后再继续跟踪',
      defaultSeverity: 'warning',
      defaultGateLevel: 'confirm',
      defaultTargetSurface: 'planning_governance',
    },
    {
      milestoneKey: 'M8',
      scenarioType: 'milestone_deviation_excessive',
      label: 'M8 偏差过大',
      suggestedAction: '请纳入修订观察池并评估偏差原因',
      defaultSeverity: 'warning',
      defaultGateLevel: 'confirm',
      defaultTargetSurface: 'planning_governance',
    },
    {
      milestoneKey: 'M9',
      scenarioType: 'milestone_no_baseline',
      label: 'M9 未关联基线',
      suggestedAction: '请补充基线来源或标记为临时新增',
      defaultSeverity: 'warning',
      defaultGateLevel: 'confirm',
      defaultTargetSurface: 'planning_governance',
    },
  ] satisfies MilestoneScenarioPolicy[],
} as const

export type MilestoneIntegrityRuleSeed = typeof MILESTONE_INTEGRITY_RULE_SEED
