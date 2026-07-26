import { describe, expect, it } from 'vitest'

import { simulateDurationNetworkProbability } from '../services/durationNetworkMonteCarloService.js'

describe('duration network Monte Carlo service', () => {
  it('models parallel-chain convergence with deterministic correlated sampling', () => {
    const input = {
      seed: 'project-1:2026-06-10:network-v1',
      simulationCount: 1000,
      scenarioCorrelation: 0.35,
      tasks: [
        { id: 'a1', p20Days: 8, p50Days: 10, p80Days: 15, releaseOffsetDays: 0 },
        { id: 'a2', p20Days: 8, p50Days: 10, p80Days: 15, releaseOffsetDays: 0 },
        { id: 'b1', p20Days: 8, p50Days: 10, p80Days: 15, releaseOffsetDays: 0 },
        { id: 'b2', p20Days: 8, p50Days: 10, p80Days: 15, releaseOffsetDays: 0 },
      ],
      dependencies: [
        { predecessorTaskId: 'a1', successorTaskId: 'a2', dependencyType: 'FS' as const, lagDays: 0 },
        { predecessorTaskId: 'b1', successorTaskId: 'b2', dependencyType: 'FS' as const, lagDays: 0 },
      ],
    }

    const first = simulateDurationNetworkProbability(input)
    const repeated = simulateDurationNetworkProbability(input)

    expect(first).toEqual(repeated)
    expect(first).toEqual(expect.objectContaining({
      probabilityBasis: 'monte_carlo',
      simulationCount: 1000,
      scenarioCorrelation: 0.35,
      taskCount: 4,
      dependencyCount: 2,
      fallbackReasons: [],
    }))
    expect(first.p20DurationDays).toBeGreaterThan(0)
    expect(first.p50DurationDays).toBeGreaterThanOrEqual(20)
    expect(first.p80DurationDays).toBeGreaterThan(first.p50DurationDays!)
  })

  it('falls back explicitly when a task has no usable percentile distribution', () => {
    const result = simulateDurationNetworkProbability({
      seed: 'incomplete-network',
      tasks: [
        { id: 'known', p20Days: 8, p50Days: 10, p80Days: 15, releaseOffsetDays: 0 },
        { id: 'missing', p20Days: null, p50Days: 10, p80Days: null, releaseOffsetDays: 0 },
      ],
      dependencies: [],
    })

    expect(result).toEqual(expect.objectContaining({
      probabilityBasis: 'pert_analytic',
      simulationCount: 0,
      p20DurationDays: null,
      p50DurationDays: null,
      p80DurationDays: null,
      fallbackReasons: expect.arrayContaining(['incomplete_task_probability_distribution']),
    }))
  })

  it('answers an arbitrary target duration from the same deterministic network samples', () => {
    const input = {
      seed: 'target-date-network',
      simulationCount: 500,
      scenarioCorrelation: 0.35,
      tasks: [
        { id: 'first', p20Days: 5, p50Days: 5, p80Days: 5, releaseOffsetDays: 0 },
        { id: 'second', p20Days: 5, p50Days: 5, p80Days: 5, releaseOffsetDays: 0 },
      ],
      dependencies: [
        { predecessorTaskId: 'first', successorTaskId: 'second', dependencyType: 'FS' as const, lagDays: 0 },
      ],
    }

    const beforeFinish = simulateDurationNetworkProbability({ ...input, completionTargetDays: 9 } as any)
    const onFinish = simulateDurationNetworkProbability({ ...input, completionTargetDays: 10 } as any)

    expect(beforeFinish).toMatchObject({
      probabilityBasis: 'monte_carlo',
      completionTargetDays: 9,
      completionProbability: 0,
    })
    expect(onFinish).toMatchObject({
      probabilityBasis: 'monte_carlo',
      completionTargetDays: 10,
      completionProbability: 1,
    })
    expect(beforeFinish.p50DurationDays).toBe(onFinish.p50DurationDays)
    expect(beforeFinish.inputHash).toBe(onFinish.inputHash)
  })
})
