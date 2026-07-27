import { describe, expect, it } from 'vitest'

import {
  buildAlgorithmSeedDiscoveryCandidates,
  buildTitleWeakUnmatchedDiagnostics,
  type AlgorithmSeedDiscoverySample,
} from '../services/algorithmSeedCandidateDiscoveryService.js'
import { evaluateAlgorithmSeedCandidate } from '../services/algorithmSeedAutoGovernanceService.js'
import { V1474_BUILDING_PATTERN_SEED } from '../seeds/v1474BuildingPatternSeed.js'

function buildSample(
  index: number,
  patch: Partial<AlgorithmSeedDiscoverySample> = {},
): AlgorithmSeedDiscoverySample {
  return {
    id: `sample-${index}`,
    project_id: 'project-1',
    task_id: `task-${index}`,
    standard_work_code: '02.03.01',
    standard_work_name: 'Concrete technical interval',
    wbs_node_type: 'process',
    confidence_score: 85,
    metadata: {
      company_id: 'company-1',
      benchmark_context_key: 'project=residential|structure=frame',
      method_variant_codes: ['cast_in_place'],
      process_constraint_type: 'concrete_curing_interval',
      technical_interval_days: index % 2 === 0 ? 7 : 8,
      blocking_level: 'hard',
      progress_impact: 'blocked',
      time_nature: 'physical_constant',
    },
    ...patch,
  }
}

describe('algorithmSeedCandidateDiscoveryService', () => {
  it('builds project process-constraint candidates only from semantic duration facts', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1))
    samples.push(buildSample(99, {
      id: 'ordinary-duration-sample',
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'process_constraint')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidateSource).toBe('project_history')
    expect(projectCandidate?.sampleCount).toBe(5)
    expect(projectCandidate?.confidenceLevel).toBe('high')
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      stableCode: expect.stringContaining('learned:process_constraint:02_03_01:concrete_curing_interval'),
      constraintType: 'concrete_curing_interval',
      applicationMode: 'edge_lag',
      impactMode: 'duration_lookup',
      runtimeActionPolicy: 'confidence_only',
      timeSourcePolicy: 'project_fact_then_standard_work_duration',
      durationLookupPolicy: 'route_to_standard_work_duration_seed',
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      blockingLevel: 'hard',
      progressImpact: 'blocked',
      timeNature: 'physical_constant',
      standardWorkCodes: ['02.03.01'],
      applicableMethodCodes: ['cast_in_place'],
    }))
    expect(projectCandidate?.candidatePayload.defaultDays).toBeUndefined()
    expect(projectCandidate?.candidatePayload.learnedDays).toBeUndefined()
  })

  it('builds process-constraint back-validation candidates without adding duration values', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      actual_duration: null,
      standard_work_code: '07-01-01-P07',
      standard_work_name: '配电柜保护整定或功能试验',
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame',
        process_constraint_observation: {
          constraintType: 'distribution_cabinet_to_energizing_gate',
          applicationMode: 'gate_wait',
          releaseQuantityEvidenceSource: 'gate_acceptance_or_test_record',
          requiredKeywordGroups: [['配电'], ['送电', '通电']],
        },
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'process_constraint')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      constraintType: 'distribution_cabinet_to_energizing_gate',
      applicationMode: 'gate_wait',
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      quantityEvidenceRequirement: 'not_applicable',
      quantityReleaseEvidenceChecklist: [],
      quantityProxyRiskLevel: 'not_applicable',
      backValidationPolicy: 'candidate_only_from_execution_history',
      runtimeGovernancePolicy: 'candidate_only_no_runtime_effect_until_curated_seed_promotion',
      dependencyWritePolicy: 'never_write_task_dependencies_from_back_validation',
      durationWritePolicy: 'never_write_day_values_to_process_constraint',
      requiredKeywordGroups: [['配电'], ['送电', '通电']],
    }))
    expect(projectCandidate?.candidatePayload.defaultDays).toBeUndefined()
    expect(projectCandidate?.candidatePayload.learnedDays).toBeUndefined()
    expect(projectCandidate?.candidatePayload.defaultDaysP50).toBeNull()
    expect(projectCandidate?.evidenceSummary).toEqual(expect.objectContaining({
      source: 'duration_experience_samples.process_constraint_observation',
      durationValuesIgnored: true,
      backValidationPolicy: 'candidate_only_from_execution_history',
      runtimeGovernancePolicy: 'candidate_only_no_runtime_effect_until_curated_seed_promotion',
      dependencyWritePolicy: 'never_write_task_dependencies_from_back_validation',
      durationWritePolicy: 'never_write_day_values_to_process_constraint',
      releaseQuantityEvidenceSources: ['gate_acceptance_or_test_record'],
    }))
  })

  it('builds standard work duration candidates from completed task duration samples', () => {
    const samples = [6, 7, 8, 9, 10].map((duration, index) => buildSample(index + 1, {
      actual_duration: duration,
      standard_work_code: 'plastering_wall_ceiling',
      standard_work_name: 'Wall and ceiling plastering',
      metadata: {
        company_id: 'company-1',
        project_type_code: 'residential',
        structure_type_code: 'frame',
        method_variant_codes: ['manual_plastering'],
        element_variant_codes: ['interior_public_finish'],
        typical_responsibility_role: 'labor_subcontractor',
        fixed_days: 1,
        scale_basis: 'area',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'standard_work_duration')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidateSource).toBe('project_history')
    expect(projectCandidate?.sampleCount).toBe(5)
    expect(projectCandidate?.stableCode).toContain('learned:standard_work_duration:plastering_wall_ceiling:duration')
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      standardWorkCodes: ['plastering_wall_ceiling'],
      defaultDaysP20: 6,
      defaultDaysP50: 8,
      defaultDaysP80: 9,
      fixedDays: 1,
      variableDays: 7,
      scaleBasis: 'area',
      typicalResponsibilityRole: 'labor_subcontractor',
      projectTypeCodes: ['residential'],
      structureTypeCodes: ['frame'],
      applicableMethodCodes: ['manual_plastering'],
      elementVariantCodes: ['interior_public_finish'],
      defaultDaysByMethod: { manual_plastering: 8 },
    }))
    expect(projectCandidate?.evidenceSummary).toEqual(expect.objectContaining({
      source: 'duration_experience_samples.actual_duration',
      benchmarkContextKey: 'project=residential|structure=frame|method=manual_plastering|element=interior_public_finish|role=labor_subcontractor',
      sampleMaturity: 'usable',
      recommendedGovernanceThresholds: expect.objectContaining({
        minSamples: 5,
        maxCv: 0.35,
        minConfidence: 0.75,
      }),
      calibrationContext: {
        projectTypeCodes: ['residential'],
        structureTypeCodes: ['frame'],
        methodVariantCodes: ['manual_plastering'],
        elementVariantCodes: ['interior_public_finish'],
        typicalResponsibilityRole: 'labor_subcontractor',
      },
    }))
  })

  it('closes the real-project duration sample loop into an auto-publishable project override candidate', () => {
    const samples = [5, 6, 6, 6, 7].map((duration, index) => buildSample(index + 1, {
      actual_duration: duration,
      standard_work_code: '02-01-03-P07',
      standard_work_name: 'Concrete placing',
      metadata: {
        company_id: 'company-1',
        project_type_code: 'residential',
        structure_type_code: 'frame_shear_wall',
        method_variant_codes: ['cast_in_place'],
        element_variant_codes: ['beam_slab_or_floor_plate'],
        typical_responsibility_role: 'labor_subcontractor',
        duration_contribution_mode: 'duration_bearing',
        execution_nature: 'physical_work',
        fixed_days: 1,
        scale_basis: 'floor',
      },
    }))

    const candidate = buildAlgorithmSeedDiscoveryCandidates(samples)
      .find((item) => item.projectId === 'project-1' && item.seedType === 'standard_work_duration')

    expect(candidate).toEqual(expect.objectContaining({
      candidateSource: 'project_history',
      sampleCount: 5,
      confidenceLevel: 'high',
    }))
    expect(candidate?.candidatePayload).toEqual(expect.objectContaining({
      standardWorkCodes: ['02-01-03-P07'],
      defaultDaysP50: 6,
      fixedDays: 1,
      variableDays: 5,
      projectTypeCodes: ['residential'],
      structureTypeCodes: ['frame_shear_wall'],
      applicableMethodCodes: ['cast_in_place'],
      elementVariantCodes: ['beam_slab_or_floor_plate'],
      defaultDaysByMethod: { cast_in_place: 6 },
    }))

    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-closed-loop-1',
      seed_type: candidate!.seedType,
      stable_code: candidate!.stableCode,
      candidate_payload: candidate!.candidatePayload,
      candidate_source: candidate!.candidateSource,
      project_id: candidate!.projectId,
      company_id: candidate!.companyId,
      sample_count: candidate!.sampleCount,
      variance: candidate!.variance,
      confidence_level: candidate!.confidenceLevel,
      evidence_summary: candidate!.evidenceSummary,
      action_policy: 'auto_govern',
    })

    expect(decision.status).toBe('auto_published')
    expect(decision.shouldPublish).toBe(true)
    expect(decision.scopeType).toBe('project')
    expect(decision.audit).toEqual(expect.objectContaining({
      thresholdUsed: expect.objectContaining({
        minSamples: 5,
        maxCv: 0.35,
        minConfidence: 0.75,
        minCrossProjects: 0,
      }),
      evidenceGate: expect.objectContaining({
        ok: true,
        hasEvidence: true,
      }),
      scoreBreakdown: expect.objectContaining({
        confidence: expect.any(Number),
        sampleCount: 25,
        evidence: 25,
        variance: 15,
      }),
    }))
  })

  it('applies mature real-sample threshold recommendations before auto-publishing duration overrides', () => {
    const baseCandidate = {
      id: 'candidate-mature-threshold-1',
      seed_type: 'standard_work_duration' as const,
      stable_code: 'learned:standard_work_duration:plastering_wall_ceiling:duration:mature',
      candidate_payload: {
        stableCode: 'learned:standard_work_duration:plastering_wall_ceiling:duration:mature',
        standardWorkCodes: ['plastering_wall_ceiling'],
        defaultDaysP20: 7,
        defaultDaysP50: 8,
        defaultDaysP80: 10,
        fixedDays: 1,
        variableDays: 7,
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        sourceStandard: 'enterprise_practice',
        sourceVersion: 'v1.4.7.5-auto-discovery',
        sourceClauseRef: 'duration_experience_samples.actual_duration',
        webVerified: true,
        reviewNeeded: false,
        isActive: true,
        evidenceSourceKeys: ['duration_experience_samples:mature'],
        confidence: 'high',
        recommendedGovernanceThresholds: {
          minSamples: 25,
          maxCv: 0.24,
          minConfidence: 0.85,
          minCrossProjects: 0,
        },
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      variance: 0.26,
      confidence_level: 'high' as const,
      evidence_summary: {
        source: 'duration_experience_samples.actual_duration',
        p20Days: 7,
        p50Days: 8,
        p80Days: 10,
        sampleMaturity: 'mature',
        recommendedGovernanceThresholds: {
          minSamples: 25,
          maxCv: 0.24,
          minConfidence: 0.85,
          minCrossProjects: 0,
        },
      },
      action_policy: 'auto_govern',
    }

    const notYetMatureDecision = evaluateAlgorithmSeedCandidate({
      ...baseCandidate,
      sample_count: 24,
    })

    expect(notYetMatureDecision.status).toBe('candidate_only')
    expect(notYetMatureDecision.warnings).toContain('sample_count_below_minimum:24/25')
    expect(notYetMatureDecision.warnings).toContain('variance_above_publish_threshold:0.26/0.24')
    expect(notYetMatureDecision.audit.thresholdUsed).toEqual(expect.objectContaining({
      minSamples: 25,
      maxCv: 0.24,
      minConfidence: 0.85,
      minCrossProjects: 0,
      source: 'recommended',
    }))
    expect(notYetMatureDecision.audit.evidenceGate).toEqual(expect.objectContaining({
      ok: true,
      hasEvidence: true,
    }))

    const matureDecision = evaluateAlgorithmSeedCandidate({
      ...baseCandidate,
      sample_count: 25,
      variance: 0.22,
    })

    expect(matureDecision.status).toBe('auto_published')
    expect(matureDecision.shouldPublish).toBe(true)
    expect(matureDecision.audit.scoreBreakdown.total).toBe(matureDecision.score)
  })

  it('keeps real-sample duration candidates candidate-only when the P50 precision window is exceeded', () => {
    const samples = [8, 9, 10, 14, 14].map((duration, index) => buildSample(index + 1, {
      actual_duration: duration,
      standard_work_code: '02-01-03-P04',
      standard_work_name: 'Concrete placing',
      metadata: {
        company_id: 'company-1',
        project_type_code: 'residential',
        structure_type_code: 'frame_shear_wall',
        method_variant_codes: ['cast_in_place'],
        element_variant_codes: ['beam_slab_or_floor_plate'],
        typical_responsibility_role: 'labor_subcontractor',
        duration_contribution_mode: 'duration_bearing',
        execution_nature: 'physical_work',
        fixed_days: 1,
        scale_basis: 'floor',
      },
    }))

    const candidate = buildAlgorithmSeedDiscoveryCandidates(samples)
      .find((item) => item.projectId === 'project-1' && item.seedType === 'standard_work_duration')

    expect(candidate).toBeTruthy()
    expect(candidate?.evidenceSummary).toEqual(expect.objectContaining({
      precisionGovernance: expect.objectContaining({
        strictP50WindowPassed: false,
        issueCodes: ['p50_precision_window_exceeded'],
        lowerBoundDays: 7,
        upperBoundDays: 13,
      }),
    }))

    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-p50-window-review-1',
      seed_type: candidate!.seedType,
      stable_code: candidate!.stableCode,
      candidate_payload: candidate!.candidatePayload,
      candidate_source: candidate!.candidateSource,
      project_id: candidate!.projectId,
      company_id: candidate!.companyId,
      sample_count: candidate!.sampleCount,
      variance: candidate!.variance,
      confidence_level: candidate!.confidenceLevel,
      evidence_summary: candidate!.evidenceSummary,
      action_policy: 'auto_govern',
    })

    expect(decision.status).toBe('candidate_only')
    expect(decision.shouldPublish).toBe(false)
    expect(decision.reasons).toContain('standard_duration_precision_review_required')
    expect(decision.warnings).toContain('p50_precision_window_exceeded')
    expect((decision.audit as any).precisionGate).toEqual(expect.objectContaining({
      ok: false,
      issueCodes: ['p50_precision_window_exceeded'],
    }))
  })

  it('blocks auto-publishing wide P80/P20 duration candidates even when ordinary variance looks acceptable', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-wide-distribution-1',
      seed_type: 'standard_work_duration',
      stable_code: 'learned:standard_work_duration:wide_distribution:duration',
      candidate_payload: {
        stableCode: 'learned:standard_work_duration:wide_distribution:duration',
        standardWorkCodes: ['wide_distribution'],
        defaultDaysP20: 2,
        defaultDaysP50: 8,
        defaultDaysP80: 8,
        fixedDays: 1,
        variableDays: 7,
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        sourceStandard: 'enterprise_practice',
        sourceVersion: 'v1.4.7.5-auto-discovery',
        sourceClauseRef: 'duration_experience_samples.actual_duration',
        webVerified: true,
        reviewNeeded: false,
        isActive: true,
        evidenceSourceKeys: ['duration_experience_samples:wide_distribution'],
        confidence: 'high',
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 25,
      variance: 0.2,
      confidence_level: 'high',
      evidence_summary: {
        source: 'duration_experience_samples.actual_duration',
        p20Days: 2,
        p50Days: 8,
        p80Days: 8,
      },
      action_policy: 'auto_govern',
    })

    expect(decision.status).toBe('candidate_only')
    expect(decision.shouldPublish).toBe(false)
    expect(decision.reasons).toContain('standard_duration_precision_review_required')
    expect(decision.warnings).toContain('p80_p20_distribution_too_wide')
    expect(decision.warnings).toContain('p50_precision_window_exceeded')
    expect((decision.audit as any).precisionGate).toEqual(expect.objectContaining({
      ok: false,
      p80P20Ratio: 4,
      issueCodes: ['p80_p20_distribution_too_wide', 'p50_precision_window_exceeded'],
    }))
  })

  it('builds company-level standard duration calibration from cross-project project-profile samples', () => {
    const projectIds = ['project-a', 'project-b', 'project-c', 'project-d']
    const samples = Array.from({ length: 20 }, (_, index) => buildSample(index + 1, {
      project_id: projectIds[index % projectIds.length],
      actual_duration: index % 3 === 0 ? 9 : 10,
      standard_work_code: '06-07-01-P04',
      standard_work_name: 'Cleanroom HVAC commissioning',
      metadata: {
        company_id: 'company-1',
        project_type_code: 'hospital',
        structure_type_code: 'frame_shear_wall',
        method_variant_codes: ['cleanroom_commissioning'],
        element_variant_codes: ['cleanroom_hvac'],
        typical_responsibility_role: 'specialty_subcontractor',
        fixed_days: 2,
        scale_basis: 'system',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const companyCandidate = candidates.find((item) => (
      item.companyId === 'company-1'
      && item.projectId === null
      && item.seedType === 'standard_work_duration'
    ))

    expect(companyCandidate).toBeTruthy()
    expect(companyCandidate?.candidateSource).toBe('company_history')
    expect(companyCandidate?.sampleCount).toBe(20)
    expect(companyCandidate?.evidenceSummary).toEqual(expect.objectContaining({
      crossProjects: 4,
      benchmarkContextKey: 'project=hospital|structure=frame_shear_wall|method=cleanroom_commissioning|element=cleanroom_hvac|role=specialty_subcontractor',
    }))
    expect(companyCandidate?.candidatePayload).toEqual(expect.objectContaining({
      standardWorkCodes: ['06-07-01-P04'],
      defaultDaysP50: 10,
      fixedDays: 2,
      variableDays: 8,
      typicalResponsibilityRole: 'specialty_subcontractor',
      projectTypeCodes: ['hospital'],
      structureTypeCodes: ['frame_shear_wall'],
      applicableMethodCodes: ['cleanroom_commissioning'],
      elementVariantCodes: ['cleanroom_hvac'],
      defaultDaysByMethod: { cleanroom_commissioning: 10 },
    }))
  })

  it('does not promote summary or activity-step samples into standard work duration candidates', () => {
    const coarseSamples = [12, 13, 14, 15, 16].map((duration, index) => buildSample(index + 1, {
      actual_duration: duration,
      standard_work_code: '02-01-00-SUM',
      standard_work_name: 'Main structure package',
      wbs_node_type: 'summary',
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame',
        duration_contribution_mode: 'duration_bearing',
      },
    }))
    const activityStepSamples = [1, 1, 2, 1, 2].map((duration, index) => buildSample(100 + index, {
      actual_duration: duration,
      standard_work_code: '02-01-03-P04-S01',
      standard_work_name: 'Concrete vibration step',
      wbs_node_type: 'activity_step',
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame',
        duration_contribution_mode: 'duration_bearing',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates([...coarseSamples, ...activityStepSamples])

    expect(candidates.some((item) => item.seedType === 'standard_work_duration')).toBe(false)
  })

  it('does not promote embedded checks into standard work duration candidates', () => {
    const samples = [1, 1, 2, 1, 2].map((duration, index) => buildSample(index + 1, {
      actual_duration: duration,
      standard_work_code: '02-01-01-P01',
      standard_work_name: 'Setting out and level review',
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame',
        duration_contribution_mode: 'embedded_check',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)

    expect(candidates.some((item) => item.seedType === 'standard_work_duration')).toBe(false)
  })

  it('keeps real project feedback from promoting non-physical rows into duration seed candidates', () => {
    const realProjectSample = (
      index: number,
      patch: Partial<AlgorithmSeedDiscoverySample>,
    ): AlgorithmSeedDiscoverySample => buildSample(index, {
      id: `real-project-feedback-${index}`,
      task_id: `real-project-task-${index}`,
      project_id: 'real-residential-project-1',
      wbs_node_type: 'process',
      confidence_score: 92,
      ...patch,
    })

    const physicalSamples = [6, 7, 7, 8, 8].map((duration, index) => realProjectSample(index + 1, {
      actual_duration: duration,
      standard_work_code: '02-01-03-P04',
      standard_work_name: '混凝土浇筑',
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame_shear_wall|method=cast_in_place',
        duration_contribution_mode: 'duration_bearing',
        execution_nature: 'physical_work',
        method_variant_codes: ['cast_in_place'],
        fixed_days: 1,
        scale_basis: 'floor',
      },
    }))

    const nonPhysicalSamples = [
      ['02-02-01-P01-S01', '砖材和砂浆配合比复验资料核验', 'record_only', 'document_record'],
      ['QR-01-01-04-P01', '混凝土试块见证取样台账', 'record_only', 'document_record'],
      ['02-01-03-P03', '模板成型验收', 'quality_gate', 'inspection_acceptance'],
      ['MS-01-01-11', '竣工验收备案完成', 'handover_marker', 'handover_marker'],
      ['02-02-01-P01', '砖材和砂浆配合比复验', 'external_wait', 'third_party_test'],
    ].map(([standard_work_code, standard_work_name, duration_contribution_mode, execution_nature], index) => realProjectSample(100 + index, {
      actual_duration: index % 2 === 0 ? 1 : 2,
      standard_work_code,
      standard_work_name,
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame_shear_wall|method=cast_in_place',
        duration_contribution_mode,
        execution_nature,
      },
    }))

    const acceptanceTimelineSamples = [2, 3, 3, 4, 3].map((lagDays, index) => realProjectSample(200 + index, {
      actual_duration: 1,
      standard_work_code: 'PM-ACC-MAIN-STRUCTURE',
      standard_work_name: '主体结构验收通过',
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame_shear_wall|method=cast_in_place',
        duration_contribution_mode: 'handover_marker',
        execution_nature: 'handover_marker',
        acceptance_type: 'main_structure_acceptance',
        acceptance_timeline_observed_days: lagDays,
        blocking_level: 'hard',
        progress_impact: 'blocked',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates([
      ...physicalSamples,
      ...nonPhysicalSamples,
      ...acceptanceTimelineSamples,
    ], { minProjectSamples: 5 })

    const projectDurationCandidates = candidates.filter((item) => (
      item.projectId === 'real-residential-project-1'
      && item.seedType === 'standard_work_duration'
    ))
    const durationCodes = projectDurationCandidates.flatMap((item) => (
      item.candidatePayload.standardWorkCodes as string[] | undefined
    ) ?? [])

    expect(durationCodes).toEqual(['02-01-03-P04'])
    expect(projectDurationCandidates[0]?.candidatePayload).toEqual(expect.objectContaining({
      standardWorkCodes: ['02-01-03-P04'],
      defaultDaysP20: 6,
      defaultDaysP50: 7,
      defaultDaysP80: 8,
      durationContributionMode: 'duration_bearing',
      fixedDays: 1,
      variableDays: 6,
      scaleBasis: 'floor',
      applicableMethodCodes: ['cast_in_place'],
    }))

    for (const code of ['02-02-01-P01-S01', 'QR-01-01-04-P01', '02-01-03-P03', 'MS-01-01-11', '02-02-01-P01', 'PM-ACC-MAIN-STRUCTURE']) {
      expect(durationCodes).not.toContain(code)
    }

    const removedSeedType = ['acceptance', 'timeline', 'candidate'].join('_')
    expect(candidates.map((item) => item.seedType)).not.toContain(removedSeedType)
  })

  it('builds site capacity pressure candidates from forecast observations and actual delay', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      actual_duration: 12 + index,
      planned_duration: 7,
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame',
        factor_summary: {
          factors: [{
            key: 'resource_conflict',
            multiplier: 1.18,
            extraDays: 2,
            confidenceDelta: -12,
            metadata: {
              pressureScore: 9,
              resourceObstacleCount: 1,
              overdueMaterialCount: 1,
              longTermResourceSignalCount: 1,
            },
          }],
        },
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'site_capacity_pressure')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidateSource).toBe('project_history')
    expect(projectCandidate?.sampleCount).toBe(5)
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      stableCode: expect.stringContaining('learned:site_capacity_pressure:'),
      signalType: 'resource_obstacle+overdue_material+long_term_signal',
      learnedAdjustment: 'raise_pressure_impact',
      weights: expect.objectContaining({
        progressPressure: 6,
        resourceCondition: 2,
        resourceObstacle: 3,
        overdueMaterial: 2,
      }),
      effectPolicy: expect.objectContaining({
        actionPolicy: 'candidate_only',
        canAffectNewTaskReference: true,
        canCreateRiskIssue: false,
      }),
    }))
    expect(projectCandidate?.evidenceSummary).toEqual(expect.objectContaining({
      observationSource: 'factor_summary.resource_conflict',
      runtimeEffect: 'candidate_only_until_algorithm_seed_governance_publishes_policy',
      sampleMaturity: 'usable',
      recommendedGovernanceThresholds: expect.objectContaining({
        minSamples: 5,
        maxCv: 0.35,
        minConfidence: 0.75,
      }),
    }))

    const decision = evaluateAlgorithmSeedCandidate({
      id: 'site-capacity-candidate-1',
      seed_type: projectCandidate!.seedType,
      stable_code: projectCandidate!.stableCode,
      candidate_payload: projectCandidate!.candidatePayload,
      candidate_source: projectCandidate!.candidateSource,
      project_id: projectCandidate!.projectId,
      company_id: projectCandidate!.companyId,
      sample_count: projectCandidate!.sampleCount,
      variance: projectCandidate!.variance,
      confidence_level: projectCandidate!.confidenceLevel,
      evidence_summary: projectCandidate!.evidenceSummary,
      action_policy: 'auto_govern',
    })

    expect(decision.status).toBe('candidate_only')
    expect(decision.reasons).toContain('site_capacity_pressure_requires_curated_seed_promotion')
  })

  it('does not treat forecast error metadata as actual delay evidence for site capacity learning', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      actual_duration: 7,
      planned_duration: 7,
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=residential|structure=frame',
        forecast_error_days: 9,
        factor_summary: {
          factors: [{
            key: 'resource_conflict',
            multiplier: 1,
            extraDays: 0,
            confidenceDelta: -4,
            metadata: {
              pressureScore: 0,
              resourceObstacleCount: 1,
            },
          }],
        },
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'site_capacity_pressure')

    expect(projectCandidate).toBeUndefined()
  })

  it.each([
    'regional_climate_rules',
    'risk_issue_warning_rule',
    'progress_deviation_cause',
    'responsibility_health_rule',
    'milestone_integrity_rule',
  ] as const)('keeps governed rule asset %s candidates candidate-only until curated promotion', (seedType) => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: `${seedType}-candidate-1`,
      seed_type: seedType,
      stable_code: `${seedType}:candidate`,
      candidate_payload: {
        stableCode: `${seedType}:candidate`,
        sourceStandard: `${seedType}_registry`,
        sourceVersion: 'project_history',
        sourceClauseRef: `${seedType}.candidate`,
        evidenceSourceKeys: [`${seedType}:sample`],
        webVerified: true,
        reviewNeeded: false,
        ruleVersion: 1,
        isActive: true,
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 200,
      variance: 0.05,
      confidence_level: 'high',
      evidence_summary: {
        source: `${seedType}.candidate`,
        evidenceSourceKeys: [`${seedType}:sample`],
        crossProjects: 10,
        crossCompanies: 3,
      },
      action_policy: 'auto_govern',
    })

    expect(decision.status).toBe('candidate_only')
    expect(decision.shouldPublish).toBe(false)
    expect(decision.reasons).toContain(`${seedType}_requires_curated_seed_promotion`)
  })

  it('keeps pure resource window observations out of new-task duration correction', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      actual_duration: 7,
      planned_duration: 7,
      metadata: {
        company_id: 'company-1',
        factor_summary: {
          factors: [{
            key: 'resource_conflict',
            multiplier: 1,
            extraDays: 0,
            confidenceDelta: -3,
            metadata: {
              pressureScore: 4,
              sameResourceClassCount: 1,
              resourceOperationType: 'add_section',
              durationImpactMode: 'resource_window_impact_only',
            },
          }],
        },
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'site_capacity_pressure')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      signalType: 'same_resource_class+resource_operation:add_section+duration_impact:resource_window_impact_only',
      learnedAdjustment: 'stabilize_pressure_impact',
      effectPolicy: expect.objectContaining({
        canAffectNewTaskReference: false,
        canAffectRemainingForecast: true,
        canExplainDeviation: true,
      }),
    }))
    expect(projectCandidate?.evidenceSummary).toEqual(expect.objectContaining({
      resourceOperationTypes: ['add_section'],
      durationImpactModes: ['resource_window_impact_only'],
      hasDurationCandidateEvidence: false,
    }))
  })

  it('builds title weak recognition candidates from repeated title-to-standard-work samples', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      actual_duration: null,
      standard_work_code: 'cast_in_place_rebar',
      standard_work_name: 'Cast-in-place rebar',
      metadata: {
        company_id: 'company-1',
        raw_task_title: '2F 梁钢筋绑扎',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'title_weak_recognition')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidateSource).toBe('project_history')
    expect(projectCandidate?.sampleCount).toBe(5)
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      signalType: 'standard_work_hint',
      standardWorkCodes: ['cast_in_place_rebar'],
      effectPolicy: expect.objectContaining({
        canInferStandardWork: true,
        canAffectBaseDays: false,
        canGenerateRows: false,
      }),
      sourceClauseRef: 'duration_experience_samples.keyword_match_observation',
    }))
  })

  it('turns later-classified unmatched task titles into title weak candidates', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      actual_duration: null,
      standard_work_code: 'outdoor_utilities',
      standard_work_name: 'Outdoor utilities',
      metadata: {
        company_id: 'company-1',
        raw_task_title: '小区外线碰口',
        title_standard_mapping_source: 'algorithm_seed_unmatched',
        title_standard_mapping_status: 'unmatched',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'title_weak_recognition')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      signalType: 'standard_work_hint',
      aliases: expect.arrayContaining(['小区外线碰口']),
      keywords: expect.arrayContaining(['小区外线碰口']),
      standardWorkCodes: ['outdoor_utilities'],
      sourceClauseRef: 'duration_experience_samples.keyword_match_observation',
    }))
  })

  it('builds title weak false-positive guard candidates from corrected standard work samples', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      actual_duration: null,
      standard_work_code: 'cast_in_place_rebar',
      standard_work_name: 'Cast-in-place rebar',
      metadata: {
        company_id: 'company-1',
        raw_task_title: '钢筋混凝土楼板',
        title_standard_mapping_feedback_type: 'false_positive',
        title_standard_mapping_predicted_code: 'cast_in_place_concrete',
        title_standard_mapping_corrected_code: 'cast_in_place_rebar',
        title_standard_mapping_previous_rule_id: 'alias_concrete_cast',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => (
      item.projectId === 'project-1'
      && item.seedType === 'title_weak_recognition'
      && item.evidenceSummary.source === 'duration_experience_samples.title_false_positive_feedback'
    ))

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      standardWorkCodes: ['cast_in_place_concrete'],
      negativeKeywords: expect.arrayContaining(['钢筋混凝土楼板']),
      sourceClauseRef: 'duration_experience_samples.title_false_positive_feedback',
      falsePositivePolicy: expect.objectContaining({
        predictedStandardWorkCode: 'cast_in_place_concrete',
        correctedStandardWorkCode: 'cast_in_place_rebar',
        previousRuleIds: ['alias_concrete_cast'],
        action: 'add_negative_keyword_or_quarantine_rule',
      }),
    }))
    expect(projectCandidate?.evidenceSummary).toEqual(expect.objectContaining({
      observationSource: 'title_false_positive_feedback',
      predictedStandardWorkCode: 'cast_in_place_concrete',
      correctedStandardWorkCode: 'cast_in_place_rebar',
    }))
  })

  it('groups repeated unmatched task titles for backend governance diagnostics', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      actual_duration: null,
      standard_work_code: null,
      standard_work_name: null,
      metadata: {
        company_id: 'company-1',
        raw_task_title: '小区外线碰口',
        title_standard_mapping_source: 'algorithm_seed_unmatched',
        title_standard_mapping_status: 'unmatched',
        title_standard_mapping_reason: 'no_standard_work_duration_seed_match',
        title_standard_mapping_weak_codes: ['outdoor_utilities'],
      },
    }))

    const diagnostics = buildTitleWeakUnmatchedDiagnostics(samples)

    expect(diagnostics).toEqual([
      expect.objectContaining({
        scope: 'project',
        aliasText: '小区外线碰口',
        projectId: 'project-1',
        companyId: 'company-1',
        sampleCount: 5,
        reasons: ['no_standard_work_duration_seed_match'],
        weakStandardWorkCodes: ['outdoor_utilities'],
      }),
    ])
  })

  it('builds standard internal-flow candidates from paired execution history without direct runtime effect', () => {
    const samples: AlgorithmSeedDiscoverySample[] = []
    for (let index = 1; index <= 5; index += 1) {
      samples.push(buildSample(index, {
        id: `flow-predecessor-${index}`,
        task_id: `flow-predecessor-task-${index}`,
        standard_work_code: '06-06-01-P06',
        standard_work_name: '恒温恒湿精度复核',
        actual_duration: null,
        started_at: `2026-04-${String(index).padStart(2, '0')}T08:00:00.000Z`,
        completed_at: `2026-04-${String(index + 1).padStart(2, '0')}T17:00:00.000Z`,
        metadata: { company_id: 'company-1' },
      }))
      samples.push(buildSample(index + 10, {
        id: `flow-successor-${index}`,
        task_id: `flow-successor-task-${index}`,
        standard_work_code: '06-06-01-P07',
        standard_work_name: '系统调试验收',
        actual_duration: null,
        started_at: `2026-04-${String(index + 2).padStart(2, '0')}T08:00:00.000Z`,
        completed_at: `2026-04-${String(index + 3).padStart(2, '0')}T17:00:00.000Z`,
        metadata: {
          company_id: 'company-1',
          standard_internal_flow: {
            curation_status: 'review_required',
            relation_kind: 'soft_sequence',
            schedule_mode: 'sequential',
            curation_method: 'stable_code_backfill',
            predecessor_stable_code: '06-06-01-P06',
            predecessor_name: '恒温恒湿精度复核',
            successor_stable_code: '06-06-01-P07',
            successor_name: '系统调试验收',
            evidence_codes: ['GB50300'],
            evidence_refs: [
              {
                code: 'GB50300',
                level: 'standard',
                rationale: '标准级证据，待后续补充条文或企业工法依据。',
              },
            ],
            applied_conditional_effect_ids: ['conditioned-flow-demo'],
            generalization_hint: {
              status: 'stable_code_backfill',
              promotionPriority: 'P2',
            },
          },
        },
      }))
    }

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'standard_internal_flow')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      createsDependency: true,
      effectPolicy: expect.objectContaining({
        canSuggestInternalFlow: true,
        canCreateRuntimeDependency: false,
        canModifyStandardSeed: false,
        promotionRequiresManualSeedRule: true,
      }),
      sourceClauseRef: 'duration_experience_samples.standard_internal_flow',
      evidenceCodes: ['GB50300'],
      evidenceRefs: expect.arrayContaining([
        expect.objectContaining({ level: 'standard' }),
      ]),
      sourceCurationMethods: ['stable_code_backfill'],
      appliedConditionalEffectIds: ['conditioned-flow-demo'],
      sourceGeneralizationHints: expect.arrayContaining([
        expect.objectContaining({ status: 'stable_code_backfill' }),
      ]),
      impactScope: expect.objectContaining({
        backendOnly: true,
        canModifyRuntimeTasks: false,
      }),
    }))
    expect(projectCandidate?.evidenceSummary).toEqual(expect.objectContaining({
      source: 'duration_experience_samples.standard_internal_flow',
      pairedActualDateCount: 5,
      predecessorCompletedBeforeSuccessorStartCount: 5,
      suggestedRelationKind: 'acceptance_gate',
      originalCurationMethods: ['stable_code_backfill'],
      sourceEvidenceCodes: ['GB50300'],
      sourceEvidenceRefLevels: ['standard'],
      appliedConditionalEffectIds: ['conditioned-flow-demo'],
      runtimeEffect: 'candidate_only_until_promoted_to_standardInternalFlowSeed',
    }))
  })

  it('flags curated standard internal-flow rules when execution history repeatedly contradicts the source order', () => {
    const samples: AlgorithmSeedDiscoverySample[] = []
    for (let index = 1; index <= 5; index += 1) {
      samples.push(buildSample(index, {
        id: `curated-flow-predecessor-${index}`,
        task_id: `curated-flow-predecessor-task-${index}`,
        standard_work_code: '10-01-05-P04',
        standard_work_name: '扇及五金安装',
        actual_duration: null,
        started_at: `2026-04-${String(index).padStart(2, '0')}T08:00:00.000Z`,
        completed_at: `2026-04-${String(index + 5).padStart(2, '0')}T17:00:00.000Z`,
        metadata: { company_id: 'company-1' },
      }))
      samples.push(buildSample(index + 10, {
        id: `curated-flow-successor-${index}`,
        task_id: `curated-flow-successor-task-${index}`,
        standard_work_code: '10-01-05-P05',
        standard_work_name: '调试验收',
        actual_duration: null,
        started_at: `2026-04-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
        completed_at: `2026-04-${String(index + 3).padStart(2, '0')}T17:00:00.000Z`,
        metadata: {
          company_id: 'company-1',
          standard_internal_flow: {
            curation_status: 'curated',
            relation_kind: 'acceptance_gate',
            creates_dependency: true,
            schedule_mode: 'sequential',
            predecessor_stable_code: '10-01-05-P04',
            predecessor_name: '扇及五金安装',
            successor_stable_code: '10-01-05-P05',
            successor_name: '调试验收',
          },
        },
      }))
    }

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'standard_internal_flow')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      validationMode: 'curated_rule_may_be_too_strict',
      relationKind: 'soft_sequence',
      createsDependency: false,
      reviewNeeded: true,
      effectPolicy: expect.objectContaining({
        canCreateRuntimeDependency: false,
        canModifyStandardSeed: false,
        canFlagCuratedRuleForReview: true,
        canSuggestSourceOrderCorrection: true,
      }),
      originalRuleEvidence: expect.objectContaining({
        createsDependency: true,
        curationStatuses: ['curated'],
      }),
    }))
    expect(projectCandidate?.evidenceSummary).toEqual(expect.objectContaining({
      validationOutcome: 'curated_rule_may_be_too_strict',
      predecessorCompletedBeforeSuccessorStartRatio: 0,
      predecessorStartedBeforeSuccessorStartRatio: 1,
      runtimeEffect: 'candidate_only_until_manual_seed_review_or_template_source_order_fix',
    }))
  })

  it('builds cross-item workflow candidates from cross-package execution history without runtime dependency writes', () => {
    const samples: AlgorithmSeedDiscoverySample[] = []
    for (let index = 1; index <= 5; index += 1) {
      samples.push(buildSample(index, {
        id: `cross-predecessor-${index}`,
        task_id: `cross-predecessor-task-${index}`,
        standard_work_code: '02-01',
        standard_work_name: '主体结构施工',
        actual_duration: null,
        started_at: `2026-04-${String(index).padStart(2, '0')}T08:00:00.000Z`,
        completed_at: `2026-04-${String(index + 1).padStart(2, '0')}T17:00:00.000Z`,
        metadata: {
          company_id: 'company-1',
          package_code: 'structure-package',
          category_type: 'sub_division',
        },
      }))
      samples.push(buildSample(index + 20, {
        id: `cross-successor-${index}`,
        task_id: `cross-successor-task-${index}`,
        standard_work_code: '02-02',
        standard_work_name: '砌体工程施工',
        actual_duration: null,
        started_at: `2026-04-${String(index + 2).padStart(2, '0')}T08:00:00.000Z`,
        completed_at: `2026-04-${String(index + 4).padStart(2, '0')}T17:00:00.000Z`,
        metadata: {
          company_id: 'company-1',
          package_code: 'masonry-package',
          category_type: 'sub_division',
          cross_item_workflow: {
            predecessor_code_prefixes: ['02-01'],
            successor_code_prefixes: ['02-02'],
            predecessor_category_types: ['sub_division'],
            successor_category_types: ['sub_division'],
            dependency_type: 'FS',
            scope_rule: 'same_floor',
            strength: 'recommended',
            source_standard: 'enterprise_method',
            source_clause_ref: 'same-floor structure handoff before masonry start',
            evidence_source_keys: ['site_execution_history.structure_to_masonry'],
          },
        },
      }))
    }

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const projectCandidate = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'cross_item_workflow')

    expect(projectCandidate).toBeTruthy()
    expect(projectCandidate?.candidatePayload).toEqual(expect.objectContaining({
      predecessorCodePrefixes: ['02-01'],
      successorCodePrefixes: ['02-02'],
      dependencyType: 'FS',
      scopeRule: 'same_floor',
      autoApplyPolicy: 'candidate_only',
      sourceStandard: 'enterprise_method',
      sourceClauseRef: 'duration_experience_samples.cross_item_workflow',
      boundaryPolicy: expect.stringContaining('candidate-only'),
      durationAuthorityPolicy: 'no_direct_duration_day_authority',
      effectPolicy: expect.objectContaining({
        canSuggestCrossItemWorkflow: true,
        canCreateRuntimeDependency: false,
        canModifyStandardSeed: false,
        promotionRequiresManualSeedRule: true,
      }),
    }))
    expect(projectCandidate?.evidenceSummary).toEqual(expect.objectContaining({
      source: 'duration_experience_samples.cross_item_workflow',
      sampleCount: 5,
      pairedActualDateCount: 5,
      predecessorCompletedBeforeSuccessorStartRatio: 1,
      runtimeEffect: 'candidate_only_until_promoted_to_crossItemWorkflowSeed',
      dependencyWritePolicy: 'never_write_task_dependencies_from_cross_item_workflow_learning',
    }))
  })

  it('does not fabricate workflow, seasonal, or resource-class candidates from text-only samples', () => {
    const samples = Array.from({ length: 30 }, (_, index) => buildSample(index + 1, {
      project_id: `project-${(index % 5) + 1}`,
      standard_work_name: 'Facade installation and winter work text',
      metadata: {
        company_id: 'company-1',
        benchmark_context_key: 'project=office',
      },
    }))

    expect(buildAlgorithmSeedDiscoveryCandidates(samples)).toEqual([])
  })

  it('builds building-pattern candidates from duration samples with backend-only confidence context', () => {
    const patternCode = V1474_BUILDING_PATTERN_SEED.find((record) => record.patternCode === 'high_rise_core_and_floor_cycle')?.patternCode
    expect(patternCode).toBe('high_rise_core_and_floor_cycle')

    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      standard_work_code: '02-01-01',
      standard_work_name: 'Standard floor structural cycle',
      metadata: {
        company_id: 'company-1',
        project_type_code: 'residential',
        structure_type_code: 'frame_shear_wall',
        method_variant_codes: ['aluminum_formwork'],
        element_variant_codes: ['beam_slab_or_floor_plate'],
        building_pattern_observation: {
          pattern_code: 'high_rise_core_and_floor_cycle',
          pattern_name: 'High-rise core and floor cycle',
          match_score: 238,
          confidence_score: 0.86,
          confidence_level: 'high',
          matched_signals: ['scope_dimension', 'rhythm_driver', 'primary_workface'],
          missing_signals: [],
          action_policy: 'backend_consume',
          rhythm_strategy_codes: ['standard-floor-cycle-curve'],
          expansion_strategy: 'floor_ordered',
          rhythm_unit: 'floor',
          primary_workface_type: 'standard_floor',
          phase_window: 'superstructure',
          inferred_system_key: 'system:structural',
          inferred_workface_key: 'workface:standard_floor',
        },
        plan_learning_observation: {
          generated_plan_edit_distance: {
            changed_field_count: 2,
            changed_fields: ['planned_start_date', 'planned_end_date'],
            source: 'baseline_generation_user_adjustment',
          },
          user_date_adjustment: {
            adjustment_days: 3,
            adjusted_fields: ['planned_start_date'],
            source: 'user_date_adjustment',
          },
        },
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const candidate = candidates.find((item) => item.seedType === 'building_pattern' && item.stableCode.includes('high_rise_core_and_floor_cycle'))

    expect(candidate).toBeTruthy()
    expect(candidate?.candidateSource).toBe('project_history')
    expect(candidate?.candidatePayload).toEqual(expect.objectContaining({
      patternCode: 'high_rise_core_and_floor_cycle',
      patternName: expect.stringContaining('learned calibration'),
      confidence: 'high',
      backendOnlyConfidencePolicy: true,
      calibrationPolicy: 'project_or_company_overlay_only_no_ts_seed_mutation',
      rhythmStrategyCodes: expect.arrayContaining(['standard-floor-cycle-curve']),
      expansionStrategy: 'floor_ordered',
      rhythmUnit: 'floor',
      primaryWorkfaceType: 'standard_floor',
      phaseWindow: 'superstructure',
      inferredSystemKeys: ['system:structural'],
      inferredWorkfaceKeys: ['workface:standard_floor'],
      generatedPlanEditDistanceAvg: 2,
      userDateAdjustmentAvgDays: 3,
      sampleMaturity: 'usable',
      recommendedGovernanceThresholds: expect.objectContaining({
        minSamples: 5,
        maxCv: 0.35,
        minConfidence: 0.75,
      }),
    }))
    expect(candidate?.evidenceSummary).toEqual(expect.objectContaining({
      source: 'duration_experience_samples.building_pattern_observation',
      patternCode: 'high_rise_core_and_floor_cycle',
      frontendDisplay: false,
      runtimeEffect: 'backend_algorithm_overlay_after_auto_governance',
      generatedPlanEditDistanceAvg: 2,
      userDateAdjustmentAvgDays: 3,
      sampleMaturity: 'usable',
      thresholdCalibrationPolicy: 'sample_volume_variance_confidence_bounded_strict_overlay_only',
    }))
    expect(candidate?.evidenceSummary.calibrationContext).toEqual(expect.objectContaining({
      inferredSystemKeys: ['system:structural'],
      inferredWorkfaceKeys: ['workface:standard_floor'],
    }))
  })

  it('marks large stable building-pattern samples as mature and recommends stricter governance thresholds', () => {
    const samples = Array.from({ length: 20 }, (_, index) => buildSample(index + 1, {
      standard_work_code: index % 2 === 0 ? '02-01-01' : '02-01-03',
      standard_work_name: 'Standard floor structural cycle',
      metadata: {
        company_id: 'company-1',
        project_type_code: 'residential',
        structure_type_code: 'frame_shear_wall',
        method_variant_codes: ['aluminum_formwork'],
        element_variant_codes: ['beam_slab_or_floor_plate'],
        building_pattern_observation: {
          pattern_code: 'high_rise_core_and_floor_cycle',
          confidence_score: 0.9,
          confidence_level: 'high',
          matched_signals: ['scope_dimension', 'rhythm_driver', 'primary_workface'],
          rhythm_strategy_codes: ['standard-floor-cycle-curve'],
          expansion_strategy: 'floor_ordered',
          rhythm_unit: 'floor',
          primary_workface_type: 'standard_floor',
          phase_window: 'superstructure',
        },
      },
    }))

    const candidate = buildAlgorithmSeedDiscoveryCandidates(samples)
      .find((item) => item.seedType === 'building_pattern' && item.stableCode.includes('high_rise_core_and_floor_cycle'))

    expect(candidate).toBeTruthy()
    expect(candidate?.sampleCount).toBe(20)
    expect(candidate?.candidatePayload).toEqual(expect.objectContaining({
      sampleMaturity: 'mature',
      recommendedGovernanceThresholds: expect.objectContaining({
        minSamples: 20,
        maxCv: 0.22,
        minConfidence: 0.88,
      }),
    }))
    expect(candidate?.evidenceSummary).toEqual(expect.objectContaining({
      sampleMaturity: 'mature',
      maturityReasonCodes: expect.arrayContaining(['sample_volume_mature', 'variance_low', 'confidence_high']),
      recommendedGovernanceThresholds: expect.objectContaining({
        minSamples: 20,
        maxCv: 0.22,
        minConfidence: 0.88,
      }),
    }))
  })

  it('builds climate-month seasonal productivity candidates from real duration samples', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      standard_work_code: 'roof_membrane_waterproof',
      standard_work_name: 'Roof membrane waterproof',
      planned_duration: 10,
      actual_duration: index % 2 === 0 ? 12 : 11,
      started_at: '2026-07-05T00:00:00.000Z',
      metadata: {
        company_id: 'company-1',
        actual_start_month: 7,
        actual_start_climate_signal: 'rainy_season',
        climate_region: 'south',
        thermal_zone: 'hot_summer_warm_winter',
        benchmark_context_key: 'thermal=hot_summer_warm_winter',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const seasonal = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'seasonal_productivity')

    expect(seasonal).toBeTruthy()
    expect(seasonal?.candidatePayload).toEqual(expect.objectContaining({
      regionCode: 'hot_summer_warm_winter',
      month: 7,
      climateSignal: 'rainy_season',
      productivity: expect.any(Number),
    }))
    expect(seasonal?.evidenceSummary).toEqual(expect.objectContaining({
      source: 'duration_experience_samples.climate_month_productivity',
      climateSignal: 'rainy_season',
      month: 7,
    }))
  })

  it('builds process seasonal sensitivity candidates by standard work and climate signal', () => {
    const samples = Array.from({ length: 5 }, (_, index) => buildSample(index + 1, {
      standard_work_code: 'roof_membrane_waterproof',
      standard_work_name: 'Roof membrane waterproof',
      planned_duration: 10,
      actual_duration: index % 2 === 0 ? 12 : 11,
      started_at: '2026-07-05T00:00:00.000Z',
      metadata: {
        company_id: 'company-1',
        actual_start_month: 7,
        actual_start_climate_signal: 'rainy_season',
        method_variant_codes: ['sbs_membrane'],
        benchmark_context_key: 'thermal=hot_summer_warm_winter',
      },
    }))

    const candidates = buildAlgorithmSeedDiscoveryCandidates(samples)
    const processSeasonal = candidates.find((item) => item.projectId === 'project-1' && item.seedType === 'process_seasonal_sensitivity')

    expect(processSeasonal).toBeTruthy()
    expect(processSeasonal?.candidatePayload).toEqual(expect.objectContaining({
      standardWorkCodes: ['roof_membrane_waterproof'],
      sensitivityReason: 'rainy_season',
      requiredClimateSignals: ['rainy_season'],
      applicableMethodCodes: ['sbs_membrane'],
      productivityMultiplier: expect.any(Number),
    }))
    expect(processSeasonal?.evidenceSummary).toEqual(expect.objectContaining({
      source: 'duration_experience_samples.process_climate_sensitivity',
      standardWorkCode: 'roof_membrane_waterproof',
      climateSignal: 'rainy_season',
    }))
  })
})
