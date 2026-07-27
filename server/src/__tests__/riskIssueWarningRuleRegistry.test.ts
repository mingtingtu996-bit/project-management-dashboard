import { describe, expect, it } from 'vitest'
import {
  RISK_ISSUE_WARNING_RULE_REGISTRY,
  getCriticalPathStagnationThresholdMs,
  getRiskIssueWarningLifecycleThresholdMs,
  getRiskIssueWarningLifecycleThresholdDays,
  resolveCriticalPathDelayWarningRule,
  resolveDelayExceededWarningRule,
  resolveObstacleTimeoutWarningRule,
} from '../services/riskIssueWarningRuleRegistry.js'

describe('risk/issue/warning lifecycle rule registry', () => {
  it('exports the canonical lifecycle escalation thresholds', () => {
    expect(getRiskIssueWarningLifecycleThresholdDays('warning_to_risk')).toBe(3)
    expect(getRiskIssueWarningLifecycleThresholdDays('risk_to_issue')).toBe(7)
    expect(getRiskIssueWarningLifecycleThresholdMs('warning_to_risk')).toBe(3 * 86_400_000)
    expect(getRiskIssueWarningLifecycleThresholdMs('risk_to_issue')).toBe(7 * 86_400_000)
    expect(getCriticalPathStagnationThresholdMs()).toBe(7 * 86_400_000)
    expect(RISK_ISSUE_WARNING_RULE_REGISTRY.lifecycle.warningToRisk.thresholdDays).toBe(3)
    expect(RISK_ISSUE_WARNING_RULE_REGISTRY.lifecycle.riskToIssue.thresholdDays).toBe(7)
  })

  it('resolves runtime warning severities from registered thresholds', () => {
    expect(resolveCriticalPathDelayWarningRule(20)).toMatchObject({ level: 'critical', thresholdDays: 20 })
    expect(resolveCriticalPathDelayWarningRule(10)).toMatchObject({ level: 'warning', thresholdDays: 10 })
    expect(resolveCriticalPathDelayWarningRule(1)).toMatchObject({ level: 'info', thresholdDays: 1 })

    expect(resolveDelayExceededWarningRule(5)).toMatchObject({ level: 'critical', thresholdCount: 5 })
    expect(resolveDelayExceededWarningRule(3)).toMatchObject({ level: 'warning', thresholdCount: 3 })

    expect(resolveObstacleTimeoutWarningRule(7)).toMatchObject({ level: 'critical', thresholdDays: 7 })
    expect(resolveObstacleTimeoutWarningRule(3)).toMatchObject({ level: 'warning', thresholdDays: 3 })
    expect(resolveObstacleTimeoutWarningRule(2)).toBeNull()
  })
})
