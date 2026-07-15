export const RESPONSIBILITY_HEALTH_RULE_SEED = {
  source: 'v1410_responsibility_health_rule_seed',
  ruleVersion: 1,
  thresholds: {
    lowOnTimeRateThreshold: 60,
    lowOnTimeStreakThreshold: 2,
    activeDelayedTaskThreshold: 3,
    keyCommitmentGapThreshold: 2,
    criticalActiveDelayedTaskThreshold: 5,
    criticalCurrentWeekOnTimeRateThreshold: 40,
  },
  pressureWeights: {
    riskSeverity: {
      low: 0.75,
      medium: 1,
      high: 2,
      critical: 3,
    },
    obstacleSeverity: {
      low: 0.75,
      medium: 1,
      high: 2,
      critical: 3,
    },
    criticalPathImpact: 3,
    milestoneImpact: 1,
    longOpenDaysThreshold: 7,
    longOpenDaysBonus: 1,
    veryLongOpenDaysThreshold: 14,
    veryLongOpenDaysBonus: 1,
  },
  explainOnlyPressureSignals: ['site_capacity_pressure', 'resource_conflict'],
  riskPressurePolicy: 'explain_only_requires_execution_fact',
} as const

export type ResponsibilityHealthRuleSeed = typeof RESPONSIBILITY_HEALTH_RULE_SEED
