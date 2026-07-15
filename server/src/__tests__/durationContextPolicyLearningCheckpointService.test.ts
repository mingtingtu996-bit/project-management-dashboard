import { describe, expect, it, vi } from 'vitest'
import {
  DurationContextPolicyLearningCheckpointConflictError,
  DurationContextPolicyLearningStageInFlightError,
  buildDurationContextPolicyLearningOperationIdentity,
  createInMemoryDurationContextPolicyLearningCheckpointStore,
  executeDurationContextPolicyLearningStage,
} from '../services/durationContextPolicyLearningCheckpointService.js'

describe('durationContextPolicyLearningCheckpointService', () => {
  it('derives a stable operation id from window, sorted scope, fact digest, and learner version', () => {
    const first = buildDurationContextPolicyLearningOperationIdentity({
      scheduledWindow: '2026-07-11',
      projectIds: ['project-b', 'project-a', 'project-a'],
      inputFactDigest: 'facts-v1',
      learnerVersion: 'duration-context-policy-v2',
    })
    const same = buildDurationContextPolicyLearningOperationIdentity({
      scheduledWindow: '2026-07-11',
      projectIds: ['project-a', 'project-b'],
      inputFactDigest: 'facts-v1',
      learnerVersion: 'duration-context-policy-v2',
    })
    const changedFacts = buildDurationContextPolicyLearningOperationIdentity({
      scheduledWindow: '2026-07-11',
      projectIds: ['project-a', 'project-b'],
      inputFactDigest: 'facts-v2',
      learnerVersion: 'duration-context-policy-v2',
    })

    expect(first).toEqual(same)
    expect(first.operationId).toMatch(/^duration-context-policy-learning:2026-07-11:/)
    expect(first.projectIds).toEqual(['project-a', 'project-b'])
    expect(changedFacts.operationId).not.toBe(first.operationId)
  })

  it('reuses a committed stage after process restart and resumes only the failed stage', async () => {
    const store = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const identity = buildDurationContextPolicyLearningOperationIdentity({
      scheduledWindow: '2026-07-11',
      projectIds: ['project-1'],
      inputFactDigest: 'facts-v1',
      learnerVersion: 'duration-context-policy-v2',
    })
    const candidateWriter = vi.fn(async () => ({ candidateId: 'candidate-1' }))
    const publicationWriter = vi.fn()
      .mockRejectedValueOnce(new Error('publication unavailable'))
      .mockResolvedValueOnce({ publicationKey: 'publication-1' })

    const candidate = await executeDurationContextPolicyLearningStage({
      identity,
      stage: 'candidate_persistence',
      stageInput: { source: 'replay-1' },
      ownerId: 'process-a',
      store,
      execute: candidateWriter,
    })
    await expect(executeDurationContextPolicyLearningStage({
      identity,
      stage: 'runtime_publication',
      stageInput: { candidateId: candidate.output.candidateId },
      ownerId: 'process-a',
      store,
      execute: publicationWriter,
    })).rejects.toThrow('publication unavailable')

    const resumedCandidate = await executeDurationContextPolicyLearningStage({
      identity,
      stage: 'candidate_persistence',
      stageInput: { source: 'replay-1' },
      ownerId: 'process-b',
      store,
      execute: candidateWriter,
    })
    const resumedPublication = await executeDurationContextPolicyLearningStage({
      identity,
      stage: 'runtime_publication',
      stageInput: { candidateId: resumedCandidate.output.candidateId },
      ownerId: 'process-b',
      store,
      execute: publicationWriter,
    })

    expect(candidateWriter).toHaveBeenCalledTimes(1)
    expect(publicationWriter).toHaveBeenCalledTimes(2)
    expect(resumedCandidate.disposition).toBe('reused')
    expect(resumedPublication.disposition).toBe('executed')
    expect(resumedPublication.output).toEqual({ publicationKey: 'publication-1' })
  })

  it('rejects a succeeded checkpoint whose stored output no longer matches its output hash', async () => {
    const store = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const identity = buildDurationContextPolicyLearningOperationIdentity({
      scheduledWindow: '2026-07-11',
      projectIds: ['project-1'],
      inputFactDigest: 'facts-v1',
      learnerVersion: 'duration-context-policy-v2',
    })
    await executeDurationContextPolicyLearningStage({
      identity,
      stage: 'decision_persistence',
      stageInput: { candidateId: 'candidate-1' },
      ownerId: 'process-a',
      store,
      execute: async () => ({ decisionId: 'decision-1' }),
    })
    store.corruptSucceededOutputForTest(identity.operationId, 'decision_persistence', {
      decisionId: 'decision-tampered',
    })

    await expect(executeDurationContextPolicyLearningStage({
      identity,
      stage: 'decision_persistence',
      stageInput: { candidateId: 'candidate-1' },
      ownerId: 'process-b',
      store,
      execute: async () => ({ decisionId: 'decision-2' }),
    })).rejects.toBeInstanceOf(DurationContextPolicyLearningCheckpointConflictError)
  })

  it('allows only one process to claim the same operation stage', async () => {
    const store = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const identity = buildDurationContextPolicyLearningOperationIdentity({
      scheduledWindow: '2026-07-11',
      projectIds: ['project-1'],
      inputFactDigest: 'facts-v1',
      learnerVersion: 'duration-context-policy-v2',
    })
    let releaseFirst!: () => void
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const writer = vi.fn(async () => {
      await firstMayFinish
      return { candidateId: 'candidate-1' }
    })

    const first = executeDurationContextPolicyLearningStage({
      identity,
      stage: 'candidate_persistence',
      stageInput: { source: 'replay-1' },
      ownerId: 'process-a',
      store,
      execute: writer,
    })
    await Promise.resolve()

    await expect(executeDurationContextPolicyLearningStage({
      identity,
      stage: 'candidate_persistence',
      stageInput: { source: 'replay-1' },
      ownerId: 'process-b',
      store,
      execute: writer,
    })).rejects.toBeInstanceOf(DurationContextPolicyLearningStageInFlightError)

    releaseFirst()
    await expect(first).resolves.toEqual(expect.objectContaining({ disposition: 'executed' }))
    expect(writer).toHaveBeenCalledTimes(1)
  })
})
