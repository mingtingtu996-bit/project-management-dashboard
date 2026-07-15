import { describe, expect, it } from 'vitest'
import {
  evaluateDurationFactLayerAction,
  getDurationFactLayerContract,
  listDurationFactLayerContracts,
} from '../services/durationFactLayerAcceptanceService.js'

describe('durationFactLayerAcceptanceService', () => {
  it('publishes C-class fact and acceptance contracts for duration precision evidence', () => {
    const contracts = listDurationFactLayerContracts()
    const codes = contracts.map((contract) => contract.code)

    expect(codes).toEqual([
      'project_generation_facts',
      'building_pattern_schedule_trust',
      'project_schedule_state',
      'runtime_execution_inference',
      'progress_deviation',
      'monthly_plan_closeout',
      'project_daily_snapshot',
      'project_execution_summary',
      'baseline_generation',
      'monthly_plan_generation',
      'baseline_commitment_snapshot',
      'monthly_plan_commitment_snapshot',
      'planning_table_commitment',
      'task_progress_snapshot',
    ])
    expect(getDurationFactLayerContract('project_daily_snapshot')).toEqual(expect.objectContaining({
      ownerService: 'projectDailySnapshotService',
      role: 'summary_fact_source',
      allowedPrecisionUses: expect.arrayContaining(['accuracy_report_source', 'replay_acceptance_source']),
      autoRewriteAllowed: false,
      selfLearningPublishAllowed: false,
    }))
    expect(getDurationFactLayerContract('project_execution_summary')).toEqual(expect.objectContaining({
      ownerService: 'projectExecutionSummaryService',
      role: 'summary_truth_exit',
      allowedPrecisionUses: expect.arrayContaining(['accuracy_display_source']),
    }))
    expect(getDurationFactLayerContract('runtime_execution_inference')).toEqual(expect.objectContaining({
      ownerService: 'runtimeExecutionInferenceService',
      role: 'runtime_fact_source',
      allowedPrecisionUses: ['basis_lineage_record', 'error_decomposition_input', 'accuracy_report_source', 'runtime_adjustment_input'],
      recordGenerationBasisRequired: true,
      autoRewriteAllowed: false,
      selfLearningPublishAllowed: false,
      boundaryPolicy: expect.arrayContaining([
        'runtime_inference_uses_existing_execution_state_only',
        'runtime_inference_is_not_actual_outcome_source',
        'runtime_inference_must_keep_fact_type_confidence_window_and_evidence_objects',
      ]),
    }))
    expect(getDurationFactLayerContract('project_generation_facts')).toEqual(expect.objectContaining({
      ownerService: 'projectGenerationFactsStoreService/projectGenerationFactsConsumerRegistry',
      role: 'static_project_fact_source',
      allowedPrecisionUses: expect.arrayContaining(['plan_creation_input', 'reference_duration_input']),
      autoRewriteAllowed: false,
    }))
    expect(getDurationFactLayerContract('building_pattern_schedule_trust')).toEqual(expect.objectContaining({
      ownerService: 'buildingPatternScheduleTrustService',
      role: 'static_schedule_context_gate',
      allowedPrecisionUses: expect.arrayContaining(['schedule_rhythm_context', 'controlled_schedule_input']),
      autoRewriteAllowed: false,
      boundaryPolicy: expect.arrayContaining([
        'building_pattern_never_creates_hard_dependency_or_planned_date_without_five_layer_dependency_authority',
      ]),
    }))
  })

  it('keeps baseline and monthly generation as basis records with fulfillment evidence only', () => {
    expect(getDurationFactLayerContract('baseline_generation')).toEqual(expect.objectContaining({
      ownerService: 'baselineGenerationService',
      role: 'basis_record_only',
      recordGenerationBasisRequired: true,
      fulfillmentTrackingRequired: true,
      autoRewriteAllowed: false,
      selfLearningPublishAllowed: false,
      allowedPrecisionUses: ['basis_lineage_record', 'fulfillment_evidence'],
    }))
    expect(getDurationFactLayerContract('monthly_plan_generation')).toEqual(expect.objectContaining({
      ownerService: 'monthlyPlanGenerationService',
      role: 'basis_record_only',
      recordGenerationBasisRequired: true,
      fulfillmentTrackingRequired: true,
      autoRewriteAllowed: false,
      selfLearningPublishAllowed: false,
      allowedPrecisionUses: ['basis_lineage_record', 'fulfillment_evidence'],
    }))
  })

  it('blocks precision learning from auto-rewriting commitments and fact snapshots', () => {
    expect(evaluateDurationFactLayerAction({
      assetCode: 'baseline_commitment_snapshot',
      action: 'auto_rewrite_fact',
    })).toEqual(expect.objectContaining({
      allowed: false,
      findingCode: 'duration_fact_layer_auto_rewrite_blocked',
    }))
    expect(evaluateDurationFactLayerAction({
      assetCode: 'monthly_plan_commitment_snapshot',
      action: 'publish_learning_update',
    })).toEqual(expect.objectContaining({
      allowed: false,
      findingCode: 'duration_fact_layer_learning_publish_blocked',
    }))
    expect(evaluateDurationFactLayerAction({
      assetCode: 'planning_table_commitment',
      action: 'use_as_actual_outcome',
    })).toEqual(expect.objectContaining({
      allowed: true,
    }))
    expect(evaluateDurationFactLayerAction({
      assetCode: 'runtime_execution_inference',
      action: 'use_as_actual_outcome',
    })).toEqual(expect.objectContaining({
      allowed: false,
      findingCode: 'duration_fact_layer_precision_use_not_allowed',
    }))
    expect(evaluateDurationFactLayerAction({
      assetCode: 'runtime_execution_inference',
      action: 'record_basis_lineage',
    })).toEqual(expect.objectContaining({
      allowed: true,
    }))
  })

  it('requires fact-strength gates before runtime inference or building-pattern context can drive schedules', () => {
    expect(evaluateDurationFactLayerAction({
      assetCode: 'runtime_execution_inference',
      action: 'use_as_runtime_adjustment_input',
      runtimeInferenceSummary: {
        readinessStatus: 'advisory_only',
        impactBoundary: 'confidence_only',
      },
    })).toEqual(expect.objectContaining({
      allowed: false,
      findingCode: 'duration_fact_layer_input_strength_not_sufficient',
    }))
    expect(evaluateDurationFactLayerAction({
      assetCode: 'runtime_execution_inference',
      action: 'use_as_runtime_adjustment_input',
      runtimeInferenceSummary: {
        readinessStatus: 'commercial_ready',
        impactBoundary: 'runtime_adjustment_allowed',
      },
    })).toEqual(expect.objectContaining({
      allowed: true,
    }))
    expect(evaluateDurationFactLayerAction({
      assetCode: 'building_pattern_schedule_trust',
      action: 'use_as_controlled_schedule_input',
      buildingPatternTrustLevel: 'candidate_only',
    })).toEqual(expect.objectContaining({
      allowed: false,
      findingCode: 'duration_fact_layer_input_strength_not_sufficient',
    }))
    expect(evaluateDurationFactLayerAction({
      assetCode: 'building_pattern_schedule_trust',
      action: 'use_as_controlled_schedule_input',
      buildingPatternTrustLevel: 'controlled_schedule_input',
    })).toEqual(expect.objectContaining({
      allowed: true,
    }))
  })

  it('rejects unknown fact-layer assets instead of treating them as precision evidence', () => {
    expect(evaluateDurationFactLayerAction({
      assetCode: 'front_end_ad_hoc_progress_counter',
      action: 'use_as_accuracy_report_source',
    })).toEqual(expect.objectContaining({
      allowed: false,
      findingCode: 'duration_fact_layer_contract_unknown',
    }))
  })
})
