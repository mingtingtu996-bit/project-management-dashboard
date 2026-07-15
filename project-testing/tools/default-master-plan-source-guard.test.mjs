import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultMasterPlanCandidateQualityBlockers,
  defaultMasterPlanFallbackAppliedSourceSignal,
  defaultMasterPlanMetadataSourceSignals,
  defaultMasterPlanRowSourceSignals,
  defaultMasterPlanSourceBlockers,
  retiredOrLowInformationDefaultMasterPlanSource,
} from './default-master-plan-source-guard.mjs'

test('normalizes fallbackApplied values into default master-plan source signals', () => {
  assert.equal(defaultMasterPlanFallbackAppliedSourceSignal(true), 'fallback_applied')
  assert.equal(defaultMasterPlanFallbackAppliedSourceSignal('true'), 'fallback_applied')
  assert.equal(defaultMasterPlanFallbackAppliedSourceSignal(false), '')
  assert.equal(defaultMasterPlanFallbackAppliedSourceSignal('false'), '')
  assert.equal(
    defaultMasterPlanFallbackAppliedSourceSignal('manual_comparison_scenario'),
    'manual_comparison_scenario',
  )
})

test('treats hidden fallbackApplied string labels as retired or low-information sources', () => {
  const signals = defaultMasterPlanMetadataSourceSignals({
    generationMode: 'managed_frontier_default_master_plan',
    fallbackApplied: 'low_information_template_draft',
    fallback_applied: 'manual_comparison_scenario',
  })

  assert.equal(signals.includes('low_information_template_draft'), true)
  assert.equal(signals.includes('manual_comparison_scenario'), true)
  assert.equal(retiredOrLowInformationDefaultMasterPlanSource('manual_comparison_scenario'), true)

  const guard = defaultMasterPlanSourceBlockers(signals)
  assert.deepEqual(guard.blockers, ['retired_or_low_information_default_master_plan_source'])
  assert.equal(guard.retiredOrLowInformationLabels.includes('low_information_template_draft'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('manual_comparison_scenario'), true)
})

test('classifies retired labels before unsupported default-master-plan labels', () => {
  const guard = defaultMasterPlanSourceBlockers([
    'managed_frontier_default_master_plan',
    'legacy_template_serial_fallback',
    'business_type_master_plan_profile_v1',
  ])

  assert.deepEqual(guard.blockers, ['retired_or_low_information_default_master_plan_source'])
  assert.deepEqual(guard.unsupportedDefaultPlanLabels, [])
})

test('allows dependency-anchor labels only as profile lineage, not as a root source', () => {
  const profileSignals = defaultMasterPlanRowSourceSignals({
    source: 'managed_frontier_default_master_plan',
    profileSourceType: 'dependency_anchor_master_plan_profile_v1',
  })
  const profileGuard = defaultMasterPlanSourceBlockers(profileSignals)
  const rootGuard = defaultMasterPlanSourceBlockers(
    defaultMasterPlanRowSourceSignals({ source: 'dependency_anchor_master_plan_profile_v1' }),
  )

  assert.deepEqual(profileGuard.blockers, [])
  assert.equal(rootGuard.blockers.includes('unsupported_default_master_plan_source_label'), true)
  assert.equal(rootGuard.unsupportedDefaultPlanLabels.includes('dependency_anchor_master_plan_profile_v1'), true)
})

test('blocks candidate rows that hide retired sources in row-level metadata markers', () => {
  const quality = defaultMasterPlanCandidateQualityBlockers({
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    rows: [
      {
        source: 'managed_frontier_default_master_plan',
        fallbackApplied: 'manual_comparison_scenario',
        candidateOnly: true,
        smartReferenceDays: 30,
      },
      {
        source: 'managed_frontier_default_master_plan',
        controlledDegradation: 'low_information_template_draft',
        candidateOnly: true,
        smartReferenceDays: 20,
      },
    ],
  })

  assert.equal(quality.productionCandidateEligible, false)
  assert.equal(quality.retiredOrLowInformationSourceRowCount, 2)
  assert.equal(quality.blockers.includes('retired_or_low_information_default_master_plan_source'), true)
  assert.equal(quality.sourceGuard.retiredOrLowInformationLabels.includes('manual_comparison_scenario'), true)
  assert.equal(quality.sourceGuard.retiredOrLowInformationLabels.includes('low_information_template_draft'), true)
})

test('blocks candidate rows that hide retired sources in original source lineage', () => {
  const quality = defaultMasterPlanCandidateQualityBlockers({
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    rows: [
      {
        source: 'managed_frontier_default_master_plan',
        originalSource: 'manual_comparison_scenario',
        candidateOnly: true,
        smartReferenceDays: 30,
      },
      {
        source: 'managed_frontier_default_master_plan',
        original_source: 'legacy_template_reverse_inference',
        candidateOnly: true,
        smartReferenceDays: 20,
      },
    ],
  })

  assert.equal(quality.productionCandidateEligible, false)
  assert.equal(quality.retiredOrLowInformationSourceRowCount, 2)
  assert.equal(quality.blockers.includes('retired_or_low_information_default_master_plan_source'), true)
  assert.equal(quality.sourceGuard.retiredOrLowInformationLabels.includes('manual_comparison_scenario'), true)
  assert.equal(quality.sourceGuard.retiredOrLowInformationLabels.includes('legacy_template_reverse_inference'), true)
})

test('does not treat duration asset evidence fields as default-master-plan source labels', () => {
  const rowSignals = defaultMasterPlanRowSourceSignals({
    source: 'managed_frontier_default_master_plan',
    candidateOnly: true,
    smartReferenceDays: 56,
    durationAssetEvidence: {
      durationAssetStableCode: 'site_setup_temp_works',
      t2RhythmTemplateId: 't2-residential-basement-structure-handover-rhythm-v1',
      durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
      durationTruthSource: 'asset_backed_candidate_master_plan',
      durationMaturity: 'L1',
      runtimeReferenceDays: {
        consumed: false,
        evidenceLevel: '',
      },
      standardWorkSeed: {
        resolverSource: 'ts_seed_fallback',
      },
    },
  })

  const guard = defaultMasterPlanSourceBlockers(rowSignals)
  assert.deepEqual(guard.blockers, [])
  assert.equal(guard.unsupportedDefaultPlanLabels.includes('asset_backed_candidate_master_plan'), false)
  assert.equal(guard.retiredOrLowInformationLabels.includes('ts_seed_fallback'), false)
})

test('does not treat runtime asset identity fields as default-master-plan source labels', () => {
  const rowSignals = defaultMasterPlanRowSourceSignals({
    source: 'wbs_template_runtime_publications',
    assetKind: 'default_master_plan',
    asset_kind: 'default_master_plan',
    runtimeAssetKey: 'runtime.default_master_plan.project-1',
    runtime_asset_key: 'runtime.default_master_plan.project-1',
    runtimeLineage: {
      assetKind: 'default_master_plan',
      runtimeAssetKey: 'runtime.default_master_plan.project-1',
      generationMode: 'residential_master_plan_v2',
    },
  })

  const guard = defaultMasterPlanSourceBlockers(rowSignals)

  assert.deepEqual(guard.blockers, [])
  assert.equal(guard.unsupportedDefaultPlanLabels.includes('default_master_plan'), false)
  assert.equal(guard.unsupportedDefaultPlanLabels.includes('runtime.default_master_plan.project-1'), false)
})

test('does not treat PM review change-log action fields as default-master-plan source labels', () => {
  const rowSignals = defaultMasterPlanRowSourceSignals({
    entity_type: 'baseline',
    entity_id: 'baseline-1',
    field_name: 'candidate_default_master_plan_review',
    action_type: 'candidate_default_master_plan_review',
    after_snapshot: {
      candidate_governance_review: {
        decision: 'accepted_for_baseline',
      },
    },
  })

  const guard = defaultMasterPlanSourceBlockers(rowSignals)

  assert.deepEqual(guard.blockers, [])
  assert.equal(guard.unsupportedDefaultPlanLabels.includes('candidate_default_master_plan_review'), false)
})

test('treats construction organization option-comparison packages as read-only non-production sources', () => {
  const quality = defaultMasterPlanCandidateQualityBlockers({
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    rows: [
      {
        source: 'managed_frontier_default_master_plan',
        scenarioType: 'construction_organization_plan_option_comparison_package',
        candidateOnly: true,
        smartReferenceDays: 30,
      },
      {
        source: 'managed_frontier_default_master_plan',
        comparisonScenario: 'construction_organization_plan_network_option_comparison_package',
        candidateOnly: true,
        smartReferenceDays: 20,
      },
    ],
  })

  assert.equal(quality.productionCandidateEligible, false)
  assert.equal(quality.retiredOrLowInformationSourceRowCount, 2)
  assert.equal(quality.blockers.includes('retired_or_low_information_default_master_plan_source'), true)
  assert.equal(quality.sourceGuard.retiredOrLowInformationLabels.includes('construction_organization_plan_option_comparison_package'), true)
  assert.equal(quality.sourceGuard.retiredOrLowInformationLabels.includes('construction_organization_plan_network_option_comparison_package'), true)
})

test('blocks retired sources hidden in source metadata, lineage, and template aliases', () => {
  const metadataSignals = defaultMasterPlanMetadataSourceSignals({
    generationMode: 'managed_frontier_default_master_plan',
    templateSource: 'legacy_template_reverse_inference',
    sourceMetadata: {
      originSource: 'low_information_template_draft',
      sourceLineage: [
        { scenarioSource: 'manual_comparison_scenario' },
      ],
    },
    runtimeLineage: {
      sourceMetadata: {
        fallbackApplied: 'human_comparison_package',
      },
    },
  })

  const rowSignals = defaultMasterPlanRowSourceSignals({
    source: 'managed_frontier_default_master_plan',
    source_metadata: {
      template_source: 'old_template_reverse_inference',
    },
    runtime_lineage: {
      source_lineage: [
        { scenario_source: 'option_comparison_package' },
      ],
    },
  })

  const guard = defaultMasterPlanSourceBlockers([...metadataSignals, ...rowSignals])
  assert.equal(guard.blockers.includes('retired_or_low_information_default_master_plan_source'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('legacy_template_reverse_inference'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('low_information_template_draft'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('manual_comparison_scenario'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('human_comparison_package'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('old_template_reverse_inference'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('option_comparison_package'), true)
})

test('blocks retired sources hidden in source and template label arrays', () => {
  const metadataSignals = defaultMasterPlanMetadataSourceSignals({
    generationMode: 'managed_frontier_default_master_plan',
    sourceLabels: [
      'managed_frontier_default_master_plan',
      'manual_comparison_scenario',
    ],
    runtimeLineage: {
      sourceAliases: [
        'low_information_template_draft',
      ],
    },
  })

  const rowSignals = defaultMasterPlanRowSourceSignals({
    source: 'managed_frontier_default_master_plan',
    source_metadata: {
      templateAliases: [
        'legacy_template_serial_fallback',
      ],
    },
    candidateOnly: true,
    smartReferenceDays: 30,
  })

  const guard = defaultMasterPlanSourceBlockers([...metadataSignals, ...rowSignals])

  assert.equal(guard.blockers.includes('retired_or_low_information_default_master_plan_source'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('manual_comparison_scenario'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('low_information_template_draft'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('legacy_template_serial_fallback'), true)
})

test('blocks retired sources hidden in stringified source metadata arrays', () => {
  const metadataSignals = defaultMasterPlanMetadataSourceSignals({
    generationMode: 'managed_frontier_default_master_plan',
    sourceMetadata: JSON.stringify({
      sourceLabels: [
        'manual_comparison_scenario',
      ],
    }),
    fallbackApplied: JSON.stringify({
      sourceAliases: [
        'low_information_template_draft',
      ],
    }),
  })

  const rowSignals = defaultMasterPlanRowSourceSignals({
    source: 'managed_frontier_default_master_plan',
    runtime_lineage: JSON.stringify({
      templateAliases: [
        'legacy_template_serial_fallback',
      ],
    }),
    candidateOnly: true,
    smartReferenceDays: 30,
  })

  const guard = defaultMasterPlanSourceBlockers([...metadataSignals, ...rowSignals])

  assert.equal(guard.blockers.includes('retired_or_low_information_default_master_plan_source'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('manual_comparison_scenario'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('low_information_template_draft'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('legacy_template_serial_fallback'), true)
})

test('blocks retired sources hidden in stringified JSON array source metadata', () => {
  const metadataSignals = defaultMasterPlanMetadataSourceSignals({
    generationMode: 'managed_frontier_default_master_plan',
    sourceMetadata: JSON.stringify([
      { source: 'manual_comparison_scenario' },
      { sourceAliases: ['low_information_template_draft'] },
    ]),
  })

  const rowSignals = defaultMasterPlanRowSourceSignals({
    source: 'managed_frontier_default_master_plan',
    fallbackApplied: JSON.stringify([
      'legacy_template_serial_fallback',
    ]),
    candidateOnly: true,
    smartReferenceDays: 30,
  })

  const guard = defaultMasterPlanSourceBlockers([...metadataSignals, ...rowSignals])

  assert.equal(guard.blockers.includes('retired_or_low_information_default_master_plan_source'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('manual_comparison_scenario'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('low_information_template_draft'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('legacy_template_serial_fallback'), true)
})

test('blocks retired sources hidden in marker flag tag and alias fields', () => {
  const metadataSignals = defaultMasterPlanMetadataSourceSignals({
    generationMode: 'managed_frontier_default_master_plan',
    generationMarkers: [
      'manual_comparison_scenario',
    ],
    evidenceTags: [
      'low_information_template_draft',
    ],
  })

  const rowSignals = defaultMasterPlanRowSourceSignals({
    source: 'managed_frontier_default_master_plan',
    qualityFlags: [
      'legacy_template_serial_fallback',
    ],
    candidateOnly: true,
    smartReferenceDays: 30,
  })

  const guard = defaultMasterPlanSourceBlockers([...metadataSignals, ...rowSignals])

  assert.equal(guard.blockers.includes('retired_or_low_information_default_master_plan_source'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('manual_comparison_scenario'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('low_information_template_draft'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('legacy_template_serial_fallback'), true)
})

test('blocks retired sources hidden in governance basis policy reason and evidence fields', () => {
  const metadataSignals = defaultMasterPlanMetadataSourceSignals({
    generationMode: 'managed_frontier_default_master_plan',
    comparisonBasis: [
      'manual_comparison_scenario',
    ],
    boundaryPolicy: [
      'low_information_template_draft',
    ],
    decisionReasons: JSON.stringify([
      { sourceKind: 'legacy_template_reverse_inference' },
    ]),
  })

  const rowSignals = defaultMasterPlanRowSourceSignals({
    source: 'managed_frontier_default_master_plan',
    reviewProof: {
      sourceStatus: 'controlled_degradation',
    },
    handoffEvidence: [
      { sourceType: 'legacy_template_serial_fallback' },
    ],
    candidateOnly: true,
    smartReferenceDays: 30,
  })

  const guard = defaultMasterPlanSourceBlockers([...metadataSignals, ...rowSignals])

  assert.equal(guard.blockers.includes('retired_or_low_information_default_master_plan_source'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('manual_comparison_scenario'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('low_information_template_draft'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('legacy_template_reverse_inference'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('controlled_degradation'), true)
  assert.equal(guard.retiredOrLowInformationLabels.includes('legacy_template_serial_fallback'), true)
})
