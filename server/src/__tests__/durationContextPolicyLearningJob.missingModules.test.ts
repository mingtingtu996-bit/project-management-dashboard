import { describe, expect, it, vi } from 'vitest'

describe('durationContextPolicyLearningJob missing-module fallback', () => {
  it('returns a report-only missing-module result when an optional learning module is unavailable', async () => {
    vi.doMock('../services/activeProjectService.js', () => ({
      listActiveProjectIds: vi.fn(async () => ['project-1']),
    }))

    const { runDurationContextPolicyLearningSweep } = await import('../jobs/durationContextPolicyLearningJob.js')
    const result = await runDurationContextPolicyLearningSweep(
      {
        projectIds: ['project-1'],
        asOfDate: '2026-05-31',
      },
      {
        loadModules: async () => ({
          status: 'missing',
          missingModule: 'Cannot find module ../services/durationContextPolicyLearningLogService.js',
        }),
      },
    )

    expect(result).toEqual(expect.objectContaining({
      learningModulesAvailable: false,
      sweepResult: 'dependency_missing_report_only',
      rewardBackfill: null,
      offlineReplay: null,
      parameterLearning: null,
      canaryGate: null,
      canaryApprovalPolicy: 'manual_backend_admin_endpoint_only',
      policyVersionRegistryPolicy: 'not_mutated_by_learning_sweep',
    }))
  })
})
