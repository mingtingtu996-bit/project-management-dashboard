// v1.4.7.4: shared business reason helpers for baseline and monthly plan generation.
// Keep algorithm details backend-only; expose concise construction-planning reasons.

export type PlanningRecommendationLevel = 'none' | 'watch' | 'suggest' | 'strong_suggest' | 'blocked'
export type PlanningConfidenceLevel = 'high' | 'medium' | 'low'

export type PlanningReasonSeverity = 'info' | 'warning' | 'critical'

export interface PlanningBusinessReason {
  code: string
  label: string
  detail: string
  severity: PlanningReasonSeverity
}

export interface PlanningRecommendationInput {
  affectedTaskCount?: number
  addedItemCount?: number
  removedItemCount?: number
  changedItemCount?: number
  criticalPathChangeCount?: number
  milestoneShiftDays?: number
  finishShiftDays?: number
  forecastDelayedCount?: number
  maxForecastDelayDays?: number
  carryoverItemCount?: number
  externalBlockingSignalCount?: number
  monthlyRiskSignalCount?: number
  healthRiskSignalCount?: number
  lowConfidenceReasonCount?: number
}

function positive(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function buildBaselineBusinessReasons(input: PlanningRecommendationInput): PlanningBusinessReason[] {
  const reasons: PlanningBusinessReason[] = []
  const milestoneShiftDays = positive(input.milestoneShiftDays)
  const finishShiftDays = positive(input.finishShiftDays)
  const criticalPathChangeCount = positive(input.criticalPathChangeCount)
  const addedItemCount = positive(input.addedItemCount)
  const removedItemCount = positive(input.removedItemCount)
  const changedItemCount = positive(input.changedItemCount)
  const forecastDelayedCount = positive(input.forecastDelayedCount)
  const maxForecastDelayDays = positive(input.maxForecastDelayDays)
  const externalBlockingSignalCount = positive(input.externalBlockingSignalCount)
  const monthlyRiskSignalCount = positive(input.monthlyRiskSignalCount)
  const healthRiskSignalCount = positive(input.healthRiskSignalCount)
  const lowConfidenceReasonCount = positive(input.lowConfidenceReasonCount)

  if (criticalPathChangeCount > 0) {
    reasons.push({
      code: 'critical_path_changed',
      label: 'Critical path changed',
      detail: `${criticalPathChangeCount} critical path row(s) changed in the current task list.`,
      severity: criticalPathChangeCount >= 3 ? 'critical' : 'warning',
    })
  }

  if (milestoneShiftDays > 0) {
    reasons.push({
      code: 'milestone_shift',
      label: 'Milestone shifted',
      detail: `Key milestone shift is about ${milestoneShiftDays} day(s).`,
      severity: milestoneShiftDays > 7 ? 'critical' : 'warning',
    })
  }

  if (finishShiftDays > 0) {
    reasons.push({
      code: 'finish_shift',
      label: 'Project finish shifted',
      detail: `Overall finish date shifted by about ${finishShiftDays} day(s).`,
      severity: finishShiftDays > 14 ? 'critical' : 'warning',
    })
  }

  if (addedItemCount + removedItemCount > 0) {
    reasons.push({
      code: 'scope_structure_changed',
      label: 'Planning structure changed',
      detail: `${addedItemCount} row(s) added and ${removedItemCount} row(s) removed compared with the current baseline.`,
      severity: addedItemCount + removedItemCount >= 10 ? 'warning' : 'info',
    })
  }

  if (changedItemCount > 0) {
    reasons.push({
      code: 'planned_dates_changed',
      label: 'Planned dates changed',
      detail: `${changedItemCount} row(s) have changed dates or planning attributes.`,
      severity: changedItemCount >= 10 ? 'warning' : 'info',
    })
  }

  if (forecastDelayedCount > 0) {
    reasons.push({
      code: 'duration_forecast_delay',
      label: 'Remaining duration may affect the plan',
      detail: `${forecastDelayedCount} task(s) may finish later than the current schedule; max forecast delay is ${maxForecastDelayDays} day(s).`,
      severity: maxForecastDelayDays > 7 ? 'warning' : 'info',
    })
  }

  if (externalBlockingSignalCount > 0) {
    reasons.push({
      code: 'external_execution_blocking_signals',
      label: 'Execution constraints may affect the baseline',
      detail: `${externalBlockingSignalCount} execution constraint signal(s) from conditions, obstacles, materials, acceptance, risks, issues or warnings were considered.`,
      severity: externalBlockingSignalCount >= 5 ? 'warning' : 'info',
    })
  }

  if (monthlyRiskSignalCount > 0) {
    reasons.push({
      code: 'monthly_commitment_carryover',
      label: 'Monthly commitment carryover exists',
      detail: `${monthlyRiskSignalCount} monthly commitment carryover row(s) may affect baseline realignment.`,
      severity: 'warning',
    })
  }

  if (healthRiskSignalCount > 0) {
    reasons.push({
      code: 'project_health_deviation_signal',
      label: 'Project health or deviation signal exists',
      detail: `${healthRiskSignalCount} health/deviation signal(s) were considered by the baseline recommendation.`,
      severity: 'warning',
    })
  }

  if (lowConfidenceReasonCount > 0) {
    reasons.push({
      code: 'low_confidence_data',
      label: 'Data confidence needs attention',
      detail: `${lowConfidenceReasonCount} algorithm input(s) have low confidence, so the recommendation is downgraded.`,
      severity: 'info',
    })
  }

  return reasons
}

export function buildMonthlyPlanBusinessReasons(input: PlanningRecommendationInput): PlanningBusinessReason[] {
  const reasons: PlanningBusinessReason[] = []
  const carryoverItemCount = positive(input.carryoverItemCount)
  const criticalPathChangeCount = positive(input.criticalPathChangeCount)
  const forecastDelayedCount = positive(input.forecastDelayedCount)
  const maxForecastDelayDays = positive(input.maxForecastDelayDays)
  const externalBlockingSignalCount = positive(input.externalBlockingSignalCount)
  const healthRiskSignalCount = positive(input.healthRiskSignalCount)
  const lowConfidenceReasonCount = positive(input.lowConfidenceReasonCount)

  if (carryoverItemCount > 0) {
    reasons.push({
      code: 'carryover',
      label: 'Carryover from previous month',
      detail: `${carryoverItemCount} unfinished monthly commitment(s) should be considered for the new month.`,
      severity: carryoverItemCount >= 5 ? 'warning' : 'info',
    })
  }

  if (criticalPathChangeCount > 0) {
    reasons.push({
      code: 'critical_path_focus',
      label: 'Critical path focus',
      detail: `${criticalPathChangeCount} critical task(s) are included in this monthly plan candidate.`,
      severity: 'warning',
    })
  }

  if (forecastDelayedCount > 0) {
    reasons.push({
      code: 'remaining_duration_pressure',
      label: 'Remaining duration pressure',
      detail: `${forecastDelayedCount} task(s) have remaining duration pressure; max forecast delay is ${maxForecastDelayDays} day(s).`,
      severity: maxForecastDelayDays > 7 ? 'warning' : 'info',
    })
  }

  if (externalBlockingSignalCount > 0) {
    reasons.push({
      code: 'monthly_execution_constraints',
      label: 'Execution constraints affect this month',
      detail: `${externalBlockingSignalCount} condition, obstacle, material, acceptance, risk, issue or warning signal(s) were considered before monthly confirmation.`,
      severity: externalBlockingSignalCount >= 5 ? 'warning' : 'info',
    })
  }

  if (healthRiskSignalCount > 0) {
    reasons.push({
      code: 'monthly_health_deviation_signal',
      label: 'Project health affects this month',
      detail: `${healthRiskSignalCount} project health/deviation signal(s) were considered before monthly confirmation.`,
      severity: 'warning',
    })
  }

  if (lowConfidenceReasonCount > 0) {
    reasons.push({
      code: 'low_confidence_data',
      label: 'Data confidence needs attention',
      detail: `${lowConfidenceReasonCount} algorithm input(s) have low confidence, so the plan should be reviewed before confirmation.`,
      severity: 'info',
    })
  }

  return reasons
}

export function scorePlanningRecommendation(input: PlanningRecommendationInput) {
  const score = Math.min(100, Math.round(
    positive(input.affectedTaskCount) * 2
    + positive(input.addedItemCount) * 3
    + positive(input.removedItemCount) * 3
    + positive(input.changedItemCount) * 2
    + positive(input.criticalPathChangeCount) * 8
    + Math.min(24, positive(input.milestoneShiftDays) * 3)
    + Math.min(24, positive(input.finishShiftDays) * 2)
    + Math.min(20, positive(input.forecastDelayedCount) * 4)
    + Math.min(20, positive(input.carryoverItemCount) * 3)
    + Math.min(24, positive(input.externalBlockingSignalCount) * 6)
    + Math.min(16, positive(input.monthlyRiskSignalCount) * 4)
    + Math.min(16, positive(input.healthRiskSignalCount) * 6)
  ))

  const level: PlanningRecommendationLevel =
    score >= 70 ? 'strong_suggest'
      : score >= 35 ? 'suggest'
        : score >= 12 ? 'watch'
          : 'none'

  const confidence: PlanningConfidenceLevel =
    positive(input.lowConfidenceReasonCount) >= 3 ? 'low'
      : positive(input.lowConfidenceReasonCount) > 0 ? 'medium'
        : 'high'

  return { score, level, confidence }
}
