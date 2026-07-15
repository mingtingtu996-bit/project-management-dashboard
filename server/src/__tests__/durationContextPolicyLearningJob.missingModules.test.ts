import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: vi.fn(async () => ['project-1']),
}))

const { runDurationContextPolicyLearningSweep } = await import('../jobs/durationContextPolicyLearningJob.js')

describe('durationContextPolicyLearningJob missing-module fallback', () => {
  it('returns a report-only missing-module result when an optional learning module is unavailable', async () => {
    const result = await runDurationContextPolicyLearningSweep(
      {
        projectIds: ['project-1'],
        asOfDate: '2026-05-31',
      },
      {
        sampleReconciliation: async () => ({
          discovered: 0,
          scanned: 0,
          recovered: 0,
          deferred: 0,
          retrying: 0,
          deadLettered: 0,
        }),
        loadModules: async () => ({
          status: 'missing',
          missingModule: 'Cannot find module ../services/durationContextPolicyLearningLogService.js',
        }),
      },
    )

    expect(result).toEqual(expect.objectContaining({
      learningModulesAvailable: false,
      runtimeMutationPolicy: 'none_candidate_report_only_dependency_missing',
      sweepResult: 'dependency_missing_report_only',
      rewardBackfill: null,
      offlineReplay: null,
      parameterLearning: null,
      canaryGate: null,
      autoPublishGate: null,
      canaryApprovalPolicy: 'auto_publish_gate_unavailable_dependency_missing',
      policyVersionRegistryPolicy: 'not_mutated_dependency_missing',
    }))
  })
})
