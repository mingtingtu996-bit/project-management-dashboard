import { describe, expect, it, vi } from 'vitest'
import {
  classifyDurationContextPolicyRuntimeProposalRisk,
  collectDurationContextPolicyRuntimeMonitoringObservation,
  runDurationContextPolicyRuntimePublicationBridge,
  type DurationContextPolicyRuntimeParameterProposal,
} from '../services/durationContextPolicyRuntimePublicationBridgeService.js'

function readyGate() {
  return {
    summary: {
      readyForControlledRuntimeTrial: true,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
    },
    blockers: [],
  }
}

function readyTrialPlan() {
  return {
    summary: { readyForReleaseRequest: true },
    releasePlan: {
      status: 'draft_review_required',
      trafficPercent: 5,
      trialDays: 14,
      rollbackRequired: true,
    },
    blockers: [],
  }
}

function proposal(
  overrides: Partial<DurationContextPolicyRuntimeParameterProposal> = {},
): DurationContextPolicyRuntimeParameterProposal {
  return {
    proposalId: 'proposal-1',
    parameterKey: 'duration.benchmark_blend_weight',
    experienceTier: 'T3',
    experienceAssetType: 'project_efficiency_model',
    reuseScope: 'company',
    factSource: 'hybrid',
    companyId: '11111111-1111-4111-8111-111111111111',
    projectId: null,
    currentValue: 0.55,
    proposedValue: 0.6,
    changeKind: 'confidence',
    sourceDecisionIds: ['decision-1'],
    evidence: {
      sampleCount: 80,
      replayPassed: true,
      conflictFree: true,
      rollbackTarget: 'duration.benchmark_blend_weight.default',
      overcompensationRate: 0.05,
      maeBefore: 12,
      maeAfter: 10,
    },
    ...overrides,
  }
}

function autoPublishGate() {
  return {
    decisions: [{
      promotionDecision: 'auto_publish_canary',
      candidate: { sourceDecisionIds: ['decision-1'] },
    }],
  }
}

function adapters(): any {
  return {
    loadRuntimeValue: vi.fn(async () => ({
      status: 'runtime_parameter_not_found',
      runtimeConsumable: false,
      parameterKey: '',
      runtimeValue: null,
      consumptionMode: 'stable',
      publicationKey: null,
      publicationStatus: null,
      scopeLevel: null,
      companyId: null,
      projectId: null,
      rollbackTarget: null,
      reasons: ['runtime_parameter_publication_not_found'],
      writesSeedRuntimeDirectly: false,
    })),
    persistPublication: vi.fn(async (input: any) => ({
      status: input.releaseExit.status === 'release_package_ready'
        ? 'runtime_parameter_published'
        : 'runtime_parameter_canary_published',
      canPersist: true,
      writesParameterRuntime: true,
      writesSeedRuntimeDirectly: false,
      publicationStatus: input.releaseExit.status === 'release_package_ready' ? 'published' : 'canary',
      publicationKey: input.releaseExit.status === 'release_package_ready' ? 'stable-publication-1' : 'canary-publication-1',
      rollbackTarget: input.releaseExit.releasePackage.rollbackTarget,
      reasons: [],
      runtimePublication: null,
    })),
    recordMonitoring: vi.fn(async (input: any) => ({
      status: input.thresholdViolations.length > 0 ? 'monitoring_failed' : 'monitoring_passed',
      sourcePublicationKey: input.sourcePublicationKey,
      monitoredAssetCount: input.monitoredAssetCount,
      monitoringWindowHours: input.monitoringWindowHours,
      thresholdViolations: input.thresholdViolations,
      rollbackRecommended: input.thresholdViolations.length > 0,
      writesParameterRuntime: false,
      writesSeedRuntimeDirectly: false,
    })),
    executeRollback: vi.fn(async (input: any) => ({
      status: 'rollback_executed',
      sourcePublicationKey: input.sourcePublicationKey,
      rollbackTarget: input.rollbackTarget,
      restoredRuntimePolicy: 'previous_parameter_value_retained',
      writesParameterRuntime: true,
      writesSeedRuntimeDirectly: false,
      reasons: [],
    })),
  }
}

describe('durationContextPolicyRuntimePublicationBridgeService', () => {
  it('builds a monitoring observation only from matured, consumed, backtested canary outcomes', async () => {
    const queryExec: any = vi.fn(async () => [{
      publication_key: 'canary-publication-1',
      monitoring_elapsed_hours: 400,
      monitoring_window_hours: 336,
      consumer_count: 42,
      sample_count: 36,
      mae_before: 12,
      mae_after: 9,
      overcompensation_rate: 0.04,
    }])
    const monitored = await collectDurationContextPolicyRuntimeMonitoringObservation({
      proposal: proposal({
        parameterKey: 'duration.p50_p75_blend_ratio',
        changeKind: 'duration',
      }),
      publicationKey: 'canary-publication-1',
      queryExec,
    })

    expect(monitored).toEqual({
      proposalId: 'proposal-1',
      monitoredAssetCount: 36,
      monitoringWindowHours: 336,
      metrics: {
        publicationKey: 'canary-publication-1',
        consumerCount: 42,
        sampleCount: 36,
        maeBefore: 12,
        maeAfter: 9,
        overcompensationRate: 0.04,
        monitoringElapsedHours: 400,
      },
      thresholdViolations: [],
    })
    expect(queryExec).toHaveBeenCalledWith(
      expect.stringContaining('publication.scope_level = $2'),
      [
        'canary-publication-1',
        'company',
        '11111111-1111-4111-8111-111111111111',
        null,
      ],
    )
    expect(String(queryExec.mock.calls[0]?.[0])).toContain('observed_project.company_id = $3::uuid')

    queryExec.mockResolvedValueOnce([{
      publication_key: 'canary-publication-1',
      monitoring_elapsed_hours: 400,
      monitoring_window_hours: 336,
      consumer_count: 42,
      sample_count: 4,
      mae_before: 12,
      mae_after: 9,
      overcompensation_rate: 0.04,
    }])
    await expect(collectDurationContextPolicyRuntimeMonitoringObservation({
      proposal: proposal({ parameterKey: 'duration.p50_p75_blend_ratio', changeKind: 'duration' }),
      publicationKey: 'canary-publication-1',
      queryExec,
    })).resolves.toBeNull()
  })

  it('classifies structural changes as high risk and never auto-publishes them', async () => {
    const runtimeAdapters = adapters()
    const structural = proposal({
      parameterKey: 'unregistered.task.structure',
      changeKind: 'task_structure',
      proposedValue: 1,
      currentValue: 0,
    })

    expect(classifyDurationContextPolicyRuntimeProposalRisk(structural)).toEqual(expect.objectContaining({
      riskTier: 'high',
      releasePolicy: 'manual_professional_approval_required',
    }))
    const result = await runDurationContextPolicyRuntimePublicationBridge({
      operationId: 'operation-1',
      proposals: [structural],
      autoPublishGate: autoPublishGate(),
      activationReadiness: readyGate(),
      trialReleasePlan: readyTrialPlan(),
      queryExec: async () => [],
      adapters: runtimeAdapters,
    })

    expect(result.results[0]).toEqual(expect.objectContaining({
      status: 'manual_professional_approval_required',
      riskTier: 'high',
    }))
    expect(runtimeAdapters.persistPublication).not.toHaveBeenCalled()
  })

  it('publishes a low-risk numeric parameter to canary first instead of bypassing observation', async () => {
    const runtimeAdapters = adapters()
    const result = await runDurationContextPolicyRuntimePublicationBridge({
      operationId: 'operation-1',
      proposals: [proposal()],
      autoPublishGate: autoPublishGate(),
      activationReadiness: readyGate(),
      trialReleasePlan: readyTrialPlan(),
      queryExec: async () => [],
      adapters: runtimeAdapters,
    })

    expect(result.results[0]).toEqual(expect.objectContaining({
      status: 'canary_published',
      riskTier: 'low',
      publicationKey: 'canary-publication-1',
    }))
    expect(runtimeAdapters.persistPublication).toHaveBeenCalledWith(expect.objectContaining({
      releaseExit: expect.objectContaining({ status: 'canary_package_ready' }),
    }))
  })

  it('publishes medium duration/lag/overlap parameters only to a bounded canary first', async () => {
    const runtimeAdapters = adapters()
    const medium = proposal({
      parameterKey: 'duration.p50_p75_blend_ratio',
      currentValue: 0.5,
      proposedValue: 0.56,
      changeKind: 'duration',
      evidence: {
        ...proposal().evidence,
        rollbackTarget: 'duration.p50_p75_blend_ratio.default',
      },
    })
    const result = await runDurationContextPolicyRuntimePublicationBridge({
      operationId: 'operation-1',
      proposals: [medium],
      autoPublishGate: autoPublishGate(),
      activationReadiness: readyGate(),
      trialReleasePlan: readyTrialPlan(),
      queryExec: async () => [],
      adapters: runtimeAdapters,
    })

    expect(result.results[0]).toEqual(expect.objectContaining({
      status: 'canary_published',
      riskTier: 'medium',
      publicationKey: 'canary-publication-1',
      runtimeBoundary: expect.objectContaining({ trafficPercent: 5, trialDays: 14 }),
    }))
    expect(runtimeAdapters.persistPublication).toHaveBeenCalledWith(expect.objectContaining({
      releaseExit: expect.objectContaining({ status: 'canary_package_ready' }),
    }))
  })

  it('promotes a monitored medium canary to stable, or rolls it back on a threshold violation', async () => {
    const medium = proposal({
      parameterKey: 'duration.p50_p75_blend_ratio',
      currentValue: 0.5,
      proposedValue: 0.56,
      changeKind: 'overlap',
      evidence: {
        ...proposal().evidence,
        rollbackTarget: 'duration.p50_p75_blend_ratio.default',
      },
    })
    const passingAdapters = adapters()
    passingAdapters.loadRuntimeValue.mockImplementation(async (input: any) => ({
      status: input.consumptionMode === 'canary' ? 'runtime_parameter_consumable' : 'runtime_parameter_not_found',
      runtimeConsumable: input.consumptionMode === 'canary',
      parameterKey: medium.parameterKey,
      runtimeValue: input.consumptionMode === 'canary' ? medium.proposedValue : null,
      consumptionMode: input.consumptionMode ?? 'stable',
      publicationKey: input.consumptionMode === 'canary' ? 'canary-existing-1' : null,
      publicationStatus: input.consumptionMode === 'canary' ? 'canary' : null,
      scopeLevel: 'company',
      companyId: medium.companyId,
      projectId: null,
      rollbackTarget: medium.evidence.rollbackTarget,
      reasons: [],
      writesSeedRuntimeDirectly: false,
    }))
    const passing = await runDurationContextPolicyRuntimePublicationBridge({
      operationId: 'operation-2',
      proposals: [medium],
      autoPublishGate: autoPublishGate(),
      activationReadiness: readyGate(),
      trialReleasePlan: readyTrialPlan(),
      monitoringObservations: [{
        proposalId: medium.proposalId,
        monitoredAssetCount: 100,
        monitoringWindowHours: 1440,
        metrics: {
          maeBefore: 12,
          maeAfter: 9,
          validChangeCount: 200,
          distinctTaskCount: 100,
          distinctProjectCount: 40,
          distinctCompanyCount: 1,
          realOutcomeCount: 100,
          replayCaseCount: 200,
          observationWindowDays: 60,
          conflictRate: 0.02,
          overcompensationRate: 0.03,
        },
        thresholdViolations: [],
      }],
      queryExec: async () => [],
      adapters: passingAdapters,
    })

    expect(passing.results[0]).toEqual(expect.objectContaining({
      status: 'canary_promoted_to_stable',
      sourceCanaryPublicationKey: 'canary-existing-1',
      publicationKey: 'stable-publication-1',
    }))
    expect(passingAdapters.recordMonitoring).toHaveBeenCalledWith(expect.objectContaining({
      sourcePublicationKey: 'canary-existing-1',
      thresholdViolations: [],
    }))

    const collectingAdapters = adapters()
    collectingAdapters.loadRuntimeValue.mockImplementation(passingAdapters.loadRuntimeValue.getMockImplementation()!)
    const collecting = await runDurationContextPolicyRuntimePublicationBridge({
      operationId: 'operation-2-collecting',
      proposals: [medium],
      autoPublishGate: autoPublishGate(),
      activationReadiness: readyGate(),
      trialReleasePlan: readyTrialPlan(),
      monitoringObservations: [{
        proposalId: medium.proposalId,
        monitoredAssetCount: 40,
        monitoringWindowHours: 720,
        metrics: {
          maeBefore: 12,
          maeAfter: 9,
          validChangeCount: 80,
          distinctTaskCount: 40,
          distinctProjectCount: 10,
          distinctCompanyCount: 1,
          realOutcomeCount: 40,
          replayCaseCount: 80,
          observationWindowDays: 30,
          conflictRate: 0.02,
          overcompensationRate: 0.03,
        },
        thresholdViolations: [],
      }],
      queryExec: async () => [],
      adapters: collectingAdapters,
    })

    expect(collecting.results[0]).toEqual(expect.objectContaining({
      status: 'canary_already_active',
      reasonCodes: expect.arrayContaining(['valid_change_count_below_company_stable_floor']),
      sourceCanaryPublicationKey: 'canary-existing-1',
    }))
    expect(collectingAdapters.persistPublication).not.toHaveBeenCalled()
    expect(collectingAdapters.executeRollback).not.toHaveBeenCalled()

    const failingAdapters = adapters()
    failingAdapters.loadRuntimeValue.mockImplementation(passingAdapters.loadRuntimeValue.getMockImplementation()!)
    const failing = await runDurationContextPolicyRuntimePublicationBridge({
      operationId: 'operation-3',
      proposals: [medium],
      autoPublishGate: autoPublishGate(),
      activationReadiness: readyGate(),
      trialReleasePlan: readyTrialPlan(),
      monitoringObservations: [{
        proposalId: medium.proposalId,
        monitoredAssetCount: 40,
        metrics: { maeBefore: 12, maeAfter: 14 },
        thresholdViolations: ['mae_regression'],
      }],
      queryExec: async () => [],
      adapters: failingAdapters,
    })

    expect(failing.results[0]).toEqual(expect.objectContaining({
      status: 'canary_rolled_back',
      sourceCanaryPublicationKey: 'canary-existing-1',
    }))
    expect(failingAdapters.executeRollback).toHaveBeenCalledWith(expect.objectContaining({
      sourcePublicationKey: 'canary-existing-1',
      rollbackTarget: 'duration.p50_p75_blend_ratio.default',
    }))
    expect(failingAdapters.persistPublication).not.toHaveBeenCalled()
  })
})
