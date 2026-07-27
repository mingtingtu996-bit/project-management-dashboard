import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  runPolicyTemplateReleaseImpactMonitoringSweep,
  type PolicyTemplateReleaseMonitoringCandidate,
} from '../jobs/policyTemplateReleaseImpactMonitoringJob.js'

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

const certificateCandidate: PolicyTemplateReleaseMonitoringCandidate = {
  sourceRunId: 'certificate-policy-auto-publish:2026-09-01:1',
  targetTable: 'certificate_template_policy_auto_publish_runs',
  rollbackTarget: 'certificate-template-policy:v1.4.22.2',
  monitoredAssetCount: 4,
  metrics: {
    previewErrorRate: 0.08,
    rollbackThreshold: 0.05,
  },
  thresholdViolations: ['preview_error_rate_above_threshold'],
}

const acceptanceCandidate: PolicyTemplateReleaseMonitoringCandidate = {
  sourceRunId: 'acceptance-policy-auto-publish:2026-09-01:1',
  targetTable: 'acceptance_template_policy_auto_publish_runs',
  rollbackTarget: 'acceptance-template-policy:v1.4.22.2',
  monitoredAssetCount: 3,
  metrics: {
    previewErrorRate: 0.01,
    rollbackThreshold: 0.05,
  },
  thresholdViolations: [],
}

describe('policyTemplateReleaseImpactMonitoringJob', () => {
  it('records impact monitoring and triggers rollback event when a stable template policy run violates thresholds', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await runPolicyTemplateReleaseImpactMonitoringSweep({
      queryExec,
      candidates: [certificateCandidate],
      executedAt: '2026-09-04T00:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      total: 1,
      monitored: 1,
      monitoringPassed: 0,
      monitoringFailed: 1,
      rollbackEvents: 1,
      failed: 0,
    }))
    expect(calls).toHaveLength(3)
    expect(joinedSql(calls)).toContain('insert into public.policy_template_release_execution_events')
    expect(joinedSql(calls)).toContain('update public.policy_template_entity_runtime_publications')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'impact_monitoring',
      'monitoring_failed',
      'certificate-policy-auto-publish:2026-09-01:1',
      'certificate_template_policy_auto_publish_runs',
      expect.objectContaining({
        thresholdViolations: ['preview_error_rate_above_threshold'],
        rollbackRecommended: true,
      }),
    ]))
    expect(calls[1].params).toEqual([
      'certificate-policy-auto-publish:2026-09-01:1',
      'certificate_template_policy_auto_publish_runs',
      'certificate-template-policy:v1.4.22.2',
      '2026-09-04T00:00:00.000Z',
    ])
    expect(calls[2].params).toEqual(expect.arrayContaining([
      'rollback_execution',
      'rollback_executed',
      'certificate-policy-auto-publish:2026-09-01:1',
      'certificate_template_policy_auto_publish_runs',
      expect.objectContaining({
        rollbackTarget: 'certificate-template-policy:v1.4.22.2',
        reason: 'impact_monitoring_failed',
        templateEntityRuntimeRollback: expect.objectContaining({
          status: 'template_runtime_rolled_back',
          writesTemplateRuntime: true,
          writesSeedRuntimeDirectly: false,
        }),
      }),
    ]))
    expect(joinedSql(calls)).not.toContain('certificate_templates')
    expect(joinedSql(calls)).not.toContain('algorithm_seed_records')
  })

  it('records passed monitoring without rollback when thresholds are clean', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await runPolicyTemplateReleaseImpactMonitoringSweep({
      queryExec,
      candidates: [acceptanceCandidate],
      executedAt: '2026-09-04T00:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      total: 1,
      monitored: 1,
      monitoringPassed: 1,
      monitoringFailed: 0,
      rollbackEvents: 0,
      failed: 0,
    }))
    expect(calls).toHaveLength(1)
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'impact_monitoring',
      'monitoring_passed',
      'acceptance-policy-auto-publish:2026-09-01:1',
      'acceptance_template_policy_auto_publish_runs',
      expect.objectContaining({
        thresholdViolations: [],
        rollbackRecommended: false,
      }),
    ]))
  })

  it('is wired into the scheduler as the post-release monitoring job', () => {
    const schedulerSource = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')

    expect(schedulerSource).toContain("import { policyTemplateReleaseImpactMonitoringJob } from './jobs/policyTemplateReleaseImpactMonitoringJob.js'")
    expect(schedulerSource).toContain('policyTemplateReleaseImpactMonitoringJob.start()')
    expect(schedulerSource).toContain('policyTemplateReleaseImpactMonitoringJob.stop()')
  })
})
