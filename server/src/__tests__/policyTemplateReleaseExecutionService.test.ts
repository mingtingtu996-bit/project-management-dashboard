import { describe, expect, it } from 'vitest'

import { createAlgorithmAssetCandidateEvent } from '../services/algorithmAssetCandidateEventAdapterService.js'
import { buildAlgorithmAssetReleaseExitPackage } from '../services/algorithmAssetReleaseExitService.js'
import { publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots } from '../services/acceptanceTemplatePolicyUpdateService.js'
import { publishCertificatePolicyAutoPublishPlan } from '../services/certificateTemplatePolicyUpdateService.js'
import {
  buildAcceptanceTemplatePolicyReleaseRecord,
  buildCertificateTemplatePolicyReleaseRecord,
} from '../services/policyTemplateReleaseAdapterService.js'
import {
  type PolicyTemplateEntityRuntimePublication,
  executePolicyTemplateReleaseRollback,
  persistPolicyTemplateReleaseExecution,
  recordPolicyTemplateReleaseImpactMonitoring,
} from '../services/policyTemplateReleaseExecutionService.js'

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

function joinedSql(calls: Array<{ sql: string }>) {
  return calls.map((call) => call.sql).join('\n').toLowerCase()
}

function buildReadyReleaseExit(assetKey: string, sourceSystem: string, rollbackTarget: string) {
  const candidateEvent = createAlgorithmAssetCandidateEvent({
    assetKey,
    sourceSystem,
    assetType: 'template',
    allowSystemReleaseScope: true,
    candidatePayload: { sourceSystem },
    learningTarget: 'template_structure',
    learningMaturity: 'system_curated_learning',
    publishAnchor: 'trusted_source_auto_publish',
    automationMaturity: 'auto_publish',
    requestedRuntimeEffect: 'bounded_calibration',
    evidence: {
      sourceHealthPassed: true,
      conflictFree: true,
      rollbackTarget,
    },
  })

  return buildAlgorithmAssetReleaseExitPackage({
    candidateEvent,
    conflictResult: 'no_conflict_publish_allowed',
    replaySummary: {
      replayPassed: true,
      runtimeImpact: 'publish_gate_evidence',
    },
    releaseAdapter: {
      adapterKey: sourceSystem,
      targetSurface: 'system_seed',
      supportsRollback: true,
    },
    platformPolicy: {
      systemAutoPublishPolicyReady: true,
      impactMonitoringReady: true,
      platformReleaseExitReady: true,
    },
  })
}

describe('policyTemplateReleaseExecutionService', () => {
  it('persists a certificate policy release record with rollback and impact monitoring packages', async () => {
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })
    const update = run.autoPublishedUpdates[0]
    const releaseRecord = buildCertificateTemplatePolicyReleaseRecord({
      run,
      releaseExit: buildReadyReleaseExit(
        `certificate.policy_update.${update.assetCode}`,
        'certificateTemplatePolicyReleaseAdapter',
        `certificate-template-policy:${run.seedVersion}`,
      ),
    })
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await persistPolicyTemplateReleaseExecution({
      releaseRecord,
      queryExec,
      executedAt: '2026-09-01T00:00:00.000Z',
      impactMonitoring: {
        monitoredAssetCount: run.summary.autoPublishedUpdateCount,
        monitoringWindowHours: 72,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'publish_record_persisted',
      targetTable: 'certificate_template_policy_auto_publish_runs',
      writesRuntimeDirectly: false,
      runtimePublication: expect.objectContaining({
        status: 'candidate_record_only',
        stableConsumptionAllowed: false,
        runtimeConsumptionStatus: 'candidate_only',
      }),
      rollbackExecution: expect.objectContaining({
        status: 'rollback_ready',
        rollbackTarget: `certificate-template-policy:${run.seedVersion}`,
        executionPolicy: 'restore_previous_seed_version_before_runtime_reenable',
      }),
      impactMonitoring: expect.objectContaining({
        status: 'monitoring_armed',
        monitoredAssetCount: run.summary.autoPublishedUpdateCount,
        monitoringWindowHours: 72,
      }),
    }))
    expect(calls).toHaveLength(2)
    const sql = joinedSql(calls)
    expect(sql).toContain('insert into public.certificate_template_policy_auto_publish_runs')
    expect(sql).toContain('insert into public.policy_template_release_execution_events')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('algorithm_seed_overrides')
    expect(sql).not.toContain('certificate_templates')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      run.runId,
      expect.objectContaining({
        releaseExecution: expect.objectContaining({
          status: 'publish_record_persisted',
          executedAt: '2026-09-01T00:00:00.000Z',
          writesRuntimeDirectly: false,
        }),
        rollbackExecution: expect.objectContaining({
          rollbackTarget: `certificate-template-policy:${run.seedVersion}`,
        }),
        impactMonitoring: expect.objectContaining({
          monitoringWindowHours: 72,
        }),
      }),
    ]))
    expect(calls[1].params).toEqual(expect.arrayContaining([
      'release_publication',
      'candidate_record_only',
      run.runId,
      'certificate_template_policy_auto_publish_runs',
      expect.objectContaining({
        runtimePublication: expect.objectContaining({
          status: 'candidate_record_only',
          stableConsumptionAllowed: false,
        }),
      }),
    ]))
  })

  it('marks a stable policy run as runtime-consumable without writing seed tables', async () => {
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })
    const stableDecision = {
      ...run.policyOpsDecision,
      runtimeConsumptionStatus: 'stable_consumable' as const,
      promotionDecision: 'promote_to_stable' as const,
      runtimeConsumptionPolicy: 'consume_stable_auto_published_seed' as const,
      stableConsumptionAllowed: true,
      reasonCodes: [],
    }
    const stableRun = {
      ...run,
      policyOpsDecision: stableDecision,
      automationQuality: {
        ...run.automationQuality,
        policyOpsDecision: stableDecision,
      },
    }
    const update = stableRun.autoPublishedUpdates[0]
    const releaseRecord = buildCertificateTemplatePolicyReleaseRecord({
      run: stableRun,
      releaseExit: buildReadyReleaseExit(
        `certificate.policy_update.${update.assetCode}`,
        'certificateTemplatePolicyReleaseAdapter',
        `certificate-template-policy:${stableRun.seedVersion}`,
      ),
    })
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await persistPolicyTemplateReleaseExecution({
      releaseRecord,
      queryExec,
      executedAt: '2026-09-01T00:00:00.000Z',
      impactMonitoring: {
        monitoredAssetCount: stableRun.summary.autoPublishedUpdateCount,
      },
    })

    expect(result.runtimePublication).toEqual(expect.objectContaining({
      status: 'runtime_stable_published',
      stableConsumptionAllowed: true,
      runtimeConsumptionStatus: 'stable_consumable',
      consumptionPolicy: 'business_preview_loads_latest_stable_auto_publish_run',
      runtimeSourceTable: 'certificate_template_policy_auto_publish_runs',
    }))
    expect((result as any).templateEntityRuntimePublication).toEqual(expect.objectContaining({
      status: 'template_runtime_published',
      sourceRunId: stableRun.runId,
      targetTable: 'certificate_template_policy_auto_publish_runs',
      runtimeSourceTable: 'certificate_template_policy_auto_publish_runs',
      writesTemplateRuntime: true,
    }))
    const sql = joinedSql(calls)
    expect(sql).toContain('insert into public.certificate_template_policy_auto_publish_runs')
    expect(sql).toContain('insert into public.policy_template_release_execution_events')
    expect(sql).toContain('insert into public.policy_template_entity_runtime_publications')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('algorithm_seed_overrides')
  })

  it('hands stable policy releases to a template entity runtime writer', async () => {
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })
    const stableDecision = {
      ...run.policyOpsDecision,
      runtimeConsumptionStatus: 'stable_consumable' as const,
      promotionDecision: 'promote_to_stable' as const,
      runtimeConsumptionPolicy: 'consume_stable_auto_published_seed' as const,
      stableConsumptionAllowed: true,
      reasonCodes: [],
    }
    const stableRun = {
      ...run,
      policyOpsDecision: stableDecision,
      automationQuality: {
        ...run.automationQuality,
        policyOpsDecision: stableDecision,
      },
    }
    const update = stableRun.autoPublishedUpdates[0]
    const releaseRecord = buildCertificateTemplatePolicyReleaseRecord({
      run: stableRun,
      releaseExit: buildReadyReleaseExit(
        `certificate.policy_update.${update.assetCode}`,
        'certificateTemplatePolicyReleaseAdapter',
        `certificate-template-policy:${stableRun.seedVersion}`,
      ),
    })
    const { queryExec } = createRecordingQueryExec()
    const writerCalls: PolicyTemplateEntityRuntimePublication[] = []

    const result = await persistPolicyTemplateReleaseExecution({
      releaseRecord,
      queryExec,
      executedAt: '2026-09-01T00:00:00.000Z',
      templateEntityRuntimeWriter: async (publication: PolicyTemplateEntityRuntimePublication) => {
        writerCalls.push(publication)
        return {
          status: 'template_runtime_published',
          targetTable: publication.targetTable,
          sourceRunId: publication.sourceRunId,
          runtimeSourceTable: publication.runtimeSourceTable,
          rollbackTarget: publication.rollbackTarget,
          executedAt: publication.executedAt,
          writesTemplateRuntime: true,
        }
      },
    })

    expect(writerCalls).toEqual([
      expect.objectContaining({
        sourceRunId: stableRun.runId,
        targetTable: 'certificate_template_policy_auto_publish_runs',
        runtimeSourceTable: 'certificate_template_policy_auto_publish_runs',
        rollbackTarget: `certificate-template-policy:${stableRun.seedVersion}`,
        executedAt: '2026-09-01T00:00:00.000Z',
      }),
    ])
    expect(result.templateEntityRuntimePublication).toEqual(expect.objectContaining({
      status: 'template_runtime_published',
      writesTemplateRuntime: true,
      sourceRunId: stableRun.runId,
    }))
  })

  it('persists an acceptance policy release record to the acceptance run table', async () => {
    const run = await publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots({ asOfDate: '2026-09-01' })
    const update = run.autoPublishedUpdates[0]
    const releaseRecord = buildAcceptanceTemplatePolicyReleaseRecord({
      run,
      releaseExit: buildReadyReleaseExit(
        `acceptance.policy_update.${update.assetCode}`,
        'acceptanceTemplatePolicyReleaseAdapter',
        `acceptance-template-policy:${run.seedVersion}`,
      ),
    })
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await persistPolicyTemplateReleaseExecution({
      releaseRecord,
      queryExec,
      impactMonitoring: {
        monitoredAssetCount: run.summary.autoPublishedUpdateCount,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'publish_record_persisted',
      targetTable: 'acceptance_template_policy_auto_publish_runs',
      writesRuntimeDirectly: false,
      rollbackExecution: expect.objectContaining({
        rollbackTarget: `acceptance-template-policy:${run.seedVersion}`,
      }),
    }))
    expect(joinedSql(calls)).toContain('insert into public.acceptance_template_policy_auto_publish_runs')
    expect(joinedSql(calls)).toContain('insert into public.policy_template_release_execution_events')
  })

  it('does not persist blocked release records or manufacture rollback execution', async () => {
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })
    const releaseRecord = buildCertificateTemplatePolicyReleaseRecord({
      run,
      releaseExit: {
        status: 'review_required',
        releaseAction: 'review_package_only',
        canHandoffToRuntimeAdapter: false,
        writesRuntimeDirectly: false,
        targetSurface: 'system_seed',
        reasons: ['release_adapter_required'],
        releasePackage: null,
      },
    })
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await persistPolicyTemplateReleaseExecution({
      releaseRecord,
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      canPersist: false,
      writesRuntimeDirectly: false,
      rollbackExecution: null,
      impactMonitoring: null,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'release_exit_package_required',
    ]))
    expect(calls).toHaveLength(0)
  })

  it('executes rollback closure by disabling the template runtime projection before recording the audit event', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await executePolicyTemplateReleaseRollback({
      queryExec,
      sourceRunId: 'certificate-policy-auto-publish:2026-09-01:1',
      targetTable: 'certificate_template_policy_auto_publish_runs',
      rollbackTarget: 'certificate-template-policy:v1.4.22.2',
      reason: 'impact_monitoring_failed',
      executedAt: '2026-09-02T00:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      writesRuntimeDirectly: false,
      restoredRuntimePolicy: 'previous_stable_auto_publish_run_retained',
      rollbackTarget: 'certificate-template-policy:v1.4.22.2',
    }))
    expect((result as any).templateEntityRuntimeRollback).toEqual(expect.objectContaining({
      status: 'template_runtime_rolled_back',
      sourceRunId: 'certificate-policy-auto-publish:2026-09-01:1',
      targetTable: 'certificate_template_policy_auto_publish_runs',
      rollbackTarget: 'certificate-template-policy:v1.4.22.2',
      writesTemplateRuntime: true,
      writesSeedRuntimeDirectly: false,
    }))
    expect(calls).toHaveLength(2)
    const sql = joinedSql(calls)
    expect(sql).toContain('update public.policy_template_entity_runtime_publications')
    expect(sql).toContain('insert into public.policy_template_release_execution_events')
    expect(sql).not.toContain('certificate_templates')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(calls[0].params).toEqual([
      'certificate-policy-auto-publish:2026-09-01:1',
      'certificate_template_policy_auto_publish_runs',
      'certificate-template-policy:v1.4.22.2',
      '2026-09-02T00:00:00.000Z',
    ])
    expect(calls[1].params).toEqual(expect.arrayContaining([
      'rollback_execution',
      'rollback_executed',
      'certificate-policy-auto-publish:2026-09-01:1',
      'certificate_template_policy_auto_publish_runs',
      expect.objectContaining({
        rollbackTarget: 'certificate-template-policy:v1.4.22.2',
        restoredRuntimePolicy: 'previous_stable_auto_publish_run_retained',
        templateEntityRuntimeRollback: expect.objectContaining({
          status: 'template_runtime_rolled_back',
          writesTemplateRuntime: true,
          writesSeedRuntimeDirectly: false,
        }),
      }),
    ]))
  })

  it('records impact monitoring results and recommends rollback when violations are detected', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordPolicyTemplateReleaseImpactMonitoring({
      queryExec,
      sourceRunId: 'acceptance-policy-auto-publish:2026-09-01:1',
      targetTable: 'acceptance_template_policy_auto_publish_runs',
      monitoredAssetCount: 12,
      monitoringWindowHours: 72,
      metrics: {
        previewErrorRate: 0.08,
        rollbackThreshold: 0.05,
      },
      thresholdViolations: ['preview_error_rate_above_threshold'],
      executedAt: '2026-09-04T00:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'monitoring_failed',
      rollbackRecommended: true,
      writesRuntimeDirectly: false,
    }))
    expect(calls).toHaveLength(1)
    expect(joinedSql(calls)).toContain('insert into public.policy_template_release_execution_events')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'impact_monitoring',
      'monitoring_failed',
      'acceptance-policy-auto-publish:2026-09-01:1',
      'acceptance_template_policy_auto_publish_runs',
      expect.objectContaining({
        monitoredAssetCount: 12,
        monitoringWindowHours: 72,
        thresholdViolations: ['preview_error_rate_above_threshold'],
        rollbackRecommended: true,
      }),
    ]))
  })
})
