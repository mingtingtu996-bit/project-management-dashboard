import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recoverStaleWizardGenerationAttempts: vi.fn(async () => ({
    scanned: 1,
    recovered: 1,
    failed: 0,
    cutoff: '2026-06-25T01:15:00.000Z',
    recoveredProjectIds: ['project-1'],
  })),
  recoverPendingWizardPostCommitDerivations: vi.fn(async () => ({
    scanned: 1,
    recovered: 1,
    pending: 0,
    failed: 0,
    recoveredProjectIds: ['project-2'],
    pendingProjectIds: [],
    failedProjectIds: [],
  })),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('../services/wizardGenerationRecoveryService.js', () => ({
  recoverStaleWizardGenerationAttempts: mocks.recoverStaleWizardGenerationAttempts,
  recoverPendingWizardPostCommitDerivations: mocks.recoverPendingWizardPostCommitDerivations,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

describe('wizard generation recovery job', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs stale wizard generation recovery through the scheduled job wrapper', async () => {
    const { WizardGenerationRecoveryJob } = await import('../jobs/wizardGenerationRecoveryJob.js')
    const job = new WizardGenerationRecoveryJob()

    const result = await job.executeNow()

    expect(result).toEqual(expect.objectContaining({
      scanned: 1,
      recovered: 1,
      failed: 0,
      postCommitDerivations: expect.objectContaining({
        scanned: 1,
        recovered: 1,
        failed: 0,
      }),
    }))
    expect(mocks.recoverStaleWizardGenerationAttempts).toHaveBeenCalledTimes(1)
    expect(mocks.recoverPendingWizardPostCommitDerivations).toHaveBeenCalledTimes(1)
    expect(mocks.logger.info).toHaveBeenCalledWith(
      'Wizard generation recovery job completed',
      expect.objectContaining({ recovered: 1 }),
    )
  })
})
