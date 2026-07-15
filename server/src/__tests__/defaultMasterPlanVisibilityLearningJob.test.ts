import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sweepCalls: [] as Array<Record<string, unknown>>,
  retryCalls: [] as Array<Record<string, unknown>>,
  result: {
    status: 'visibility_policy_candidates_generated',
    feedbackEventCount: 9,
    policyCandidateCount: 1,
    persistedCandidateCount: 1,
    writesRuntimePolicy: false,
    writesTasksOrDependencies: false,
    mutationBoundary: 'candidate_only_until_governed_seed_publication',
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: vi.fn(async (options: Record<string, unknown>, runner: () => Promise<unknown>) => {
    mocks.retryCalls.push(options)
    return { attempts: 1, value: await runner() }
  }),
}))

vi.mock('../services/defaultMasterPlanVisibilityLearningService.js', () => ({
  runDefaultMasterPlanVisibilityLearningSweep: vi.fn(async (input: Record<string, unknown>) => {
    mocks.sweepCalls.push(input)
    return mocks.result
  }),
}))

import { DefaultMasterPlanVisibilityLearningJob } from '../jobs/defaultMasterPlanVisibilityLearningJob.js'

describe('defaultMasterPlanVisibilityLearningJob', () => {
  beforeEach(() => {
    mocks.sweepCalls.length = 0
    mocks.retryCalls.length = 0
  })

  it('runs the governed candidate-only learning sweep without runtime mutation', async () => {
    const job = new DefaultMasterPlanVisibilityLearningJob()

    const result = await job.executeNow()

    expect(result).toEqual(expect.objectContaining({
      persistedCandidateCount: 1,
      writesRuntimePolicy: false,
      writesTasksOrDependencies: false,
    }))
    expect(mocks.sweepCalls).toEqual([{}])
    expect(mocks.retryCalls).toEqual([
      expect.objectContaining({ jobName: 'defaultMasterPlanVisibilityLearningJob', triggeredBy: 'manual' }),
    ])
  })
})
