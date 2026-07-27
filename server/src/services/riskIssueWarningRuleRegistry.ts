export type WarningSeverityLevel = 'info' | 'warning' | 'critical'

export type RiskIssueWarningLifecycleRuleKey = 'warning_to_risk' | 'risk_to_issue'

export interface WarningSeverityRuleResult {
  level: WarningSeverityLevel
  thresholdDays?: number
  thresholdCount?: number
  titleTone: 'attention' | 'warning' | 'critical'
}

export const RISK_ISSUE_WARNING_RULE_REGISTRY = {
  lifecycle: {
    warningToRisk: {
      code: 'warning_to_risk',
      thresholdDays: 3,
      source: 'risk_issue_warning_lifecycle_governance',
    },
    riskToIssue: {
      code: 'risk_to_issue',
      thresholdDays: 7,
      source: 'risk_issue_warning_lifecycle_governance',
    },
  },
  warningSeverity: {
    criticalPathDelay: {
      warningDays: 10,
      criticalDays: 20,
    },
    delayExceeded: {
      warningCount: 3,
      criticalCount: 5,
    },
    obstacleTimeout: {
      warningDays: 3,
      criticalDays: 7,
    },
    criticalPathStagnation: {
      criticalDays: 7,
    },
  },
} as const

const DAY_MS = 86_400_000

export function getRiskIssueWarningLifecycleThresholdDays(key: RiskIssueWarningLifecycleRuleKey) {
  switch (key) {
    case 'warning_to_risk':
      return RISK_ISSUE_WARNING_RULE_REGISTRY.lifecycle.warningToRisk.thresholdDays
    case 'risk_to_issue':
      return RISK_ISSUE_WARNING_RULE_REGISTRY.lifecycle.riskToIssue.thresholdDays
  }
}

export function getRiskIssueWarningLifecycleThresholdMs(key: RiskIssueWarningLifecycleRuleKey) {
  return getRiskIssueWarningLifecycleThresholdDays(key) * DAY_MS
}

export function getRiskIssueWarningLifecycleCutoffIso(key: RiskIssueWarningLifecycleRuleKey, now: Date | number = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : now
  return new Date(nowMs - getRiskIssueWarningLifecycleThresholdMs(key)).toISOString()
}

export function resolveCriticalPathDelayWarningRule(delayDays: number): WarningSeverityRuleResult | null {
  if (!Number.isFinite(delayDays) || delayDays <= 0) return null
  const rule = RISK_ISSUE_WARNING_RULE_REGISTRY.warningSeverity.criticalPathDelay
  if (delayDays >= rule.criticalDays) {
    return { level: 'critical', thresholdDays: rule.criticalDays, titleTone: 'critical' }
  }
  if (delayDays >= rule.warningDays) {
    return { level: 'warning', thresholdDays: rule.warningDays, titleTone: 'warning' }
  }
  return { level: 'info', thresholdDays: 1, titleTone: 'attention' }
}

export function resolveDelayExceededWarningRule(delayCount: number): WarningSeverityRuleResult | null {
  if (!Number.isFinite(delayCount)) return null
  const rule = RISK_ISSUE_WARNING_RULE_REGISTRY.warningSeverity.delayExceeded
  if (delayCount >= rule.criticalCount) {
    return { level: 'critical', thresholdCount: rule.criticalCount, titleTone: 'critical' }
  }
  if (delayCount >= rule.warningCount) {
    return { level: 'warning', thresholdCount: rule.warningCount, titleTone: 'warning' }
  }
  return null
}

export function resolveObstacleTimeoutWarningRule(daysElapsed: number): WarningSeverityRuleResult | null {
  if (!Number.isFinite(daysElapsed)) return null
  const rule = RISK_ISSUE_WARNING_RULE_REGISTRY.warningSeverity.obstacleTimeout
  if (daysElapsed >= rule.criticalDays) {
    return { level: 'critical', thresholdDays: rule.criticalDays, titleTone: 'critical' }
  }
  if (daysElapsed >= rule.warningDays) {
    return { level: 'warning', thresholdDays: rule.warningDays, titleTone: 'warning' }
  }
  return null
}

export function getCriticalPathStagnationThresholdDays() {
  return RISK_ISSUE_WARNING_RULE_REGISTRY.warningSeverity.criticalPathStagnation.criticalDays
}

export function getCriticalPathStagnationThresholdMs() {
  return getCriticalPathStagnationThresholdDays() * DAY_MS
}
