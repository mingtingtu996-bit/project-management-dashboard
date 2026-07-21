import { describe, expect, it, vi } from 'vitest'

import {
  DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION,
  runDurationLearningRuntimeEvidenceOutboxRecoveryCli,
} from '../scripts/recover-duration-learning-runtime-evidence-outbox.js'

function completedResult() {
  return {
    status: 'completed' as const,
    attempts: 1,
    claimed: 2,
    completed: 2,
    failed: 0,
    backlogCount: 0,
    readyBacklogCount: 0,
    failedBacklogCount: 0,
    expiredProcessingCount: 0,
  }
}

describe('duration learning runtime evidence outbox recovery CLI', () => {
  it.each([
    ['missing write authorization', ['--confirm', DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION]],
    ['missing exact confirmation', ['--allow-write']],
    ['wrong confirmation', ['--allow-write', '--confirm', 'wrong-target']],
  ])('rejects %s before loading the job or database graph', async (_label, argv) => {
    const loadJob = vi.fn()

    await expect(runDurationLearningRuntimeEvidenceOutboxRecoveryCli(argv, {
      loadJob,
      writeOutput: vi.fn(),
    })).rejects.toThrow('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION_REQUIRED')

    expect(loadJob).not.toHaveBeenCalled()
  })

  it('runs the singleton only after both confirmations and emits a completed result', async () => {
    const executeNow = vi.fn(async () => completedResult())
    const loadJob = vi.fn(async () => ({ executeNow }))
    const writeOutput = vi.fn()

    const result = await runDurationLearningRuntimeEvidenceOutboxRecoveryCli([
      '--allow-write',
      '--confirm',
      DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION,
    ], { loadJob, writeOutput })

    expect(loadJob).toHaveBeenCalledTimes(1)
    expect(executeNow).toHaveBeenCalledTimes(1)
    expect(result).toEqual(completedResult())
    expect(writeOutput).toHaveBeenCalledWith(expect.stringContaining('"status": "completed"'))
  })

  it.each(['already_running', 'lease_not_acquired'] as const)(
    'fails recovery when execution is skipped with %s',
    async (reason) => {
      const executeNow = vi.fn(async () => ({ status: 'skipped' as const, reason }))
      const loadJob = vi.fn(async () => ({ executeNow }))
      const writeOutput = vi.fn()

      await expect(runDurationLearningRuntimeEvidenceOutboxRecoveryCli([
        '--allow-write',
        '--confirm',
        DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION,
      ], { loadJob, writeOutput })).rejects.toThrow(
        `DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_SKIPPED:${reason}`,
      )

      expect(writeOutput).not.toHaveBeenCalled()
    },
  )
})
