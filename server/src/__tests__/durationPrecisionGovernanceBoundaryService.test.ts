import { describe, expect, it } from 'vitest'

import {
  classifyDurationPrecisionBoundaryAction,
  evaluateDurationPrecisionBoundaryAction,
  listDurationPrecisionBoundaryActionContracts,
} from '../services/durationPrecisionGovernanceBoundaryService.js'

describe('durationPrecisionGovernanceBoundaryService', () => {
  it('keeps v1.4.22.3 governance-control actions separate from v1.4.22.4 precision-learning actions', () => {
    const contracts = listDurationPrecisionBoundaryActionContracts()

    expect(contracts.map((contract) => contract.action)).toEqual([
      'register_asset',
      'evaluate_release_gate',
      'publish_runtime_parameter',
      'rollback_runtime_parameter',
      'block_fact_rewrite',
      'record_prediction_event',
      'record_actual_outcome',
      'calculate_accuracy_metrics',
      'produce_precision_candidate',
      'consume_published_runtime_overlay',
      'claim_accuracy_improved',
      'auto_rewrite_fact',
    ])
    expect(classifyDurationPrecisionBoundaryAction('publish_runtime_parameter')).toEqual(expect.objectContaining({
      ownerPlane: 'v1.4.22.3_governance_control',
      requiresReleaseExit: true,
    }))
    expect(classifyDurationPrecisionBoundaryAction('calculate_accuracy_metrics')).toEqual(expect.objectContaining({
      ownerPlane: 'v1.4.22.4_precision_learning',
      requiresAccuracyEvidence: true,
    }))
  })

  it('blocks precision learning from directly publishing runtime changes without the v1.4.22.3 release gate', () => {
    expect(evaluateDurationPrecisionBoundaryAction({
      action: 'publish_runtime_parameter',
      requestedByPlane: 'v1.4.22.4_precision_learning',
      releaseExitApproved: false,
      accuracyMetricsAvailable: true,
    })).toEqual(expect.objectContaining({
      allowed: false,
      ownerPlane: 'v1.4.22.3_governance_control',
      findingCode: 'precision_learning_cannot_bypass_governance_release_exit',
    }))

    expect(evaluateDurationPrecisionBoundaryAction({
      action: 'consume_published_runtime_overlay',
      requestedByPlane: 'v1.4.22.4_precision_learning',
      releaseExitApproved: true,
      accuracyMetricsAvailable: true,
    })).toEqual(expect.objectContaining({
      allowed: true,
      ownerPlane: 'v1.4.22.4_precision_learning',
    }))
  })

  it('blocks governance-control evidence from claiming accuracy improvement without v1.4.22.4 metrics', () => {
    expect(evaluateDurationPrecisionBoundaryAction({
      action: 'claim_accuracy_improved',
      requestedByPlane: 'v1.4.22.3_governance_control',
      releaseExitApproved: true,
      accuracyMetricsAvailable: false,
    })).toEqual(expect.objectContaining({
      allowed: false,
      ownerPlane: 'v1.4.22.4_precision_learning',
      findingCode: 'governance_control_cannot_claim_precision_without_metrics',
    }))
  })

  it('blocks both planes from auto-rewriting duration facts and commitments', () => {
    const lockedFactKinds = [
      'actual_start_date',
      'actual_end_date',
      'completion_status',
      'baseline_commitment',
      'monthly_plan_commitment',
      'confirmed_dependency',
      'critical_path_fact',
      'progress_snapshot',
    ] as const

    for (const factKind of lockedFactKinds) {
      expect(evaluateDurationPrecisionBoundaryAction({
        action: 'auto_rewrite_fact',
        requestedByPlane: 'v1.4.22.4_precision_learning',
        factKind,
      })).toEqual(expect.objectContaining({
        allowed: false,
        ownerPlane: 'business_fact_lock',
        findingCode: 'business_fact_auto_rewrite_blocked',
      }))
    }
  })
})
