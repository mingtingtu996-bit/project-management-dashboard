import { MATERIAL_OPEN_TASK_STATUS_VALUES } from './materialTaskLinkPolicy.js'

export const MATERIAL_ARRIVAL_REMINDER_RULE = {
  ruleId: 'material_arrival_reminder',
  version: 'v1.4.21-p3',
  upcomingWindowDays: 7,
  fallbackWindowDays: 5,
  overdueLookbackDays: 90,
  overdueAcknowledgedQuietDays: 3,
  overdueLongAgingIntervalDays: 7,
  longOverdueGovernanceCadence: 'monthly_governance_summary',
  dedupePolicy: 'upcoming_weekly_overdue_aging_acknowledged_quiet',
  recipientPolicy: ['project_owner', 'project_editor', 'impacted_task_assignee', 'participant_unit_contact_email_member'],
  openTaskStatuses: [...MATERIAL_OPEN_TASK_STATUS_VALUES],
  priorityPolicy: 'execution_impact_explain_only',
  dataQualityPolicy: 'explain_only',
  overdueCadencePolicy: 'critical_daily_ordinary_aging_acknowledged_quiet',
} as const

export function buildMaterialArrivalReminderRuleMetadata() {
  return {
    rule_id: MATERIAL_ARRIVAL_REMINDER_RULE.ruleId,
    rule_version: MATERIAL_ARRIVAL_REMINDER_RULE.version,
    upcoming_window_days: MATERIAL_ARRIVAL_REMINDER_RULE.upcomingWindowDays,
    fallback_window_days: MATERIAL_ARRIVAL_REMINDER_RULE.fallbackWindowDays,
    overdue_lookback_days: MATERIAL_ARRIVAL_REMINDER_RULE.overdueLookbackDays,
    overdue_acknowledged_quiet_days: MATERIAL_ARRIVAL_REMINDER_RULE.overdueAcknowledgedQuietDays,
    overdue_long_aging_interval_days: MATERIAL_ARRIVAL_REMINDER_RULE.overdueLongAgingIntervalDays,
    long_overdue_governance_cadence: MATERIAL_ARRIVAL_REMINDER_RULE.longOverdueGovernanceCadence,
    dedupe_policy: MATERIAL_ARRIVAL_REMINDER_RULE.dedupePolicy,
    recipient_policy: MATERIAL_ARRIVAL_REMINDER_RULE.recipientPolicy,
    overdue_cadence_policy: MATERIAL_ARRIVAL_REMINDER_RULE.overdueCadencePolicy,
    status_policy_open_task_statuses: MATERIAL_ARRIVAL_REMINDER_RULE.openTaskStatuses,
  }
}
