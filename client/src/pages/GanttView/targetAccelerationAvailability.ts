import { readAvailableDurationValue, type DurationMetricDto } from '@/lib/durationMetric'
import type {
  WbsAccelerationProposal,
  WbsAccelerationProposalAction,
  WbsAccelerationRescheduleDraft,
  WbsTargetFeasibility,
} from '@/services/wbsTemplateGenerationApi'

function hasProductionDayValue(metric: DurationMetricDto | null | undefined) {
  return readAvailableDurationValue(metric, 'construction_production_day') !== null
}

function hasCalendarDayValue(metric: DurationMetricDto | null | undefined) {
  return readAvailableDurationValue(metric, 'calendar_day') !== null
}

function isActionAvailable(action: WbsAccelerationProposalAction) {
  if (!hasProductionDayValue(action.recoverDuration)) return false
  if (action.type !== 'crashing') return true
  return action.durationAdjustments.every((adjustment) => (
    hasProductionDayValue(adjustment.currentDuration)
    && hasProductionDayValue(adjustment.proposedDuration)
    && hasProductionDayValue(adjustment.minDuration)
    && hasProductionDayValue(adjustment.recoverDuration)
  ))
}

function hasDraftTypedFacts(draft: WbsAccelerationRescheduleDraft | null | undefined) {
  if (!draft || draft.writePolicy !== 'requires_user_acceptance') return false
  const taskFactsAvailable = draft.taskDateAdjustments.every((adjustment) => (
    hasProductionDayValue(adjustment.currentDuration)
    && hasProductionDayValue(adjustment.proposedDuration)
    && hasProductionDayValue(adjustment.recoverDuration)
    && hasProductionDayValue(adjustment.visualDiff.durationDelta)
    && hasCalendarDayValue(adjustment.visualDiff.startDelta)
    && hasCalendarDayValue(adjustment.visualDiff.endDelta)
  ))
  const resourceFactsAvailable = draft.resourceAdjustments.every((adjustment) => (
    hasProductionDayValue(adjustment.currentDuration)
    && hasProductionDayValue(adjustment.proposedDuration)
    && hasProductionDayValue(adjustment.minDuration)
    && hasProductionDayValue(adjustment.recoverDuration)
  ))
  return taskFactsAvailable && resourceFactsAvailable
}

export function hasAccelerationProposalTypedFacts(proposal: WbsAccelerationProposal | null | undefined) {
  if (!proposal) return false
  return hasCalendarDayValue(proposal.overshoot)
    && hasProductionDayValue(proposal.totalRecover)
    && hasProductionDayValue(proposal.remainingGap)
    && proposal.actions.length > 0
    && proposal.actions.every(isActionAvailable)
    && proposal.protectedConstraints.every((constraint) => hasProductionDayValue(constraint.duration))
    && hasDraftTypedFacts(proposal.rescheduleDraft)
}

export function isAccelerationProposalActionable(proposal: WbsAccelerationProposal | null | undefined) {
  return hasAccelerationProposalTypedFacts(proposal)
    && Boolean(proposal?.rescheduleDraft?.operations.length)
}

export function hasTargetAccelerationTypedFacts(feasibility: WbsTargetFeasibility | null | undefined) {
  if (!feasibility) return false
  return hasCalendarDayValue(feasibility.overshoot)
    && hasProductionDayValue(feasibility.recoverable)
    && hasProductionDayValue(feasibility.unrecoverable)
    && hasAccelerationProposalTypedFacts(feasibility.accelerationProposal)
}

export function isTargetAccelerationFeasibilityActionable(
  feasibility: WbsTargetFeasibility | null | undefined,
) {
  if (!feasibility || !hasTargetAccelerationTypedFacts(feasibility)) return false
  return isAccelerationProposalActionable(feasibility.accelerationProposal)
}
