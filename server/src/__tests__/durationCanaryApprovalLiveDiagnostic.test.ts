import { describe, expect, it, vi } from 'vitest'

import {
  buildDurationCanaryApprovalLiveDiagnosticReport,
  parseDurationCanaryApprovalLiveDiagnosticOptionsFromArgs,
  shouldFailDurationCanaryApprovalLiveDiagnosticReport,
} from '../scripts/diagnose-duration-canary-approval-live.js'

describe('duration canary approval live diagnostic', () => {
  it('blocks by default to avoid mutating live canary candidates accidentally', async () => {
    const approveCandidate = vi.fn()

    const report = await buildDurationCanaryApprovalLiveDiagnosticReport({
      now: new Date('2026-06-21T05:40:00.000+08:00'),
      approveCandidate,
    })

    expect(report.reportCode).toBe('c18_l06_duration_canary_approval_live_diagnostic')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('blocked')
    expect(report.allowWrite).toBe(false)
    expect(report.candidateId).toBeNull()
    expect(approveCandidate).not.toHaveBeenCalled()
    expect(shouldFailDurationCanaryApprovalLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails closeout when a direct candidate probe lacks disposable creation and cleanup evidence', async () => {
    const approveCandidate = vi.fn()
      .mockResolvedValueOnce({ approvalCode: 'duration_context_policy_canary_approval' })
      .mockRejectedValueOnce(new Error('Duration context policy canary candidate already changed before review update.'))

    const report = await buildDurationCanaryApprovalLiveDiagnosticReport({
      now: new Date('2026-06-21T05:41:00.000+08:00'),
      allowWrite: true,
      companyId: '11111111-1111-4111-8111-111111111111',
      candidateId: 'candidate-live',
      approvedBy: '00000000-0000-4000-8000-000000000006',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l06-duration-canary-approval.json',
      approveCandidate,
    })

    expect(report.status).toBe('fail')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l06-duration-canary-approval.json')
    expect(report.candidateId).toBe('candidate-live')
    expect(report.checks.concurrentApproval.attemptCount).toBe(2)
    expect(report.checks.concurrentApproval.missingArchivedJson).toBe(false)
    expect(report.checks.concurrentApproval.successCount).toBe(1)
    expect(report.checks.concurrentApproval.guardedFailureCount).toBe(1)
    expect(report.checks.concurrentApproval.status).toBe('fail')
    expect(report.checks.concurrentApproval.reason).toContain('disposable candidate')
    expect(report.disposableCandidateCleanup.status).toBe('not_applicable')
    expect(approveCandidate).toHaveBeenCalledTimes(2)
    expect(approveCandidate.mock.calls[0][0]).toMatchObject({
      companyId: '11111111-1111-4111-8111-111111111111',
      candidateId: 'candidate-live',
      approvedBy: '00000000-0000-4000-8000-000000000006',
    })
    expect(shouldFailDurationCanaryApprovalLiveDiagnosticReport(report)).toBe(true)
  })

  it('can create and clean up a disposable candidate for the live concurrency probe', async () => {
    const seedDisposableCandidate = vi.fn(async () => 'candidate-disposable')
    const cleanupDisposableCandidate = vi.fn(async () => undefined)
    const approveCandidate = vi.fn()
      .mockResolvedValueOnce({ approvalCode: 'duration_context_policy_canary_approval' })
      .mockRejectedValueOnce(new Error('Duration context policy canary candidate already changed before review update.'))

    const report = await buildDurationCanaryApprovalLiveDiagnosticReport({
      now: new Date('2026-06-21T05:42:00.000+08:00'),
      allowWrite: true,
      companyId: '11111111-1111-4111-8111-111111111111',
      createDisposableCandidate: true,
      approvedBy: '00000000-0000-4000-8000-000000000006',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l06-duration-canary-approval-disposable.json',
      seedDisposableCandidate,
      cleanupDisposableCandidate,
      approveCandidate,
    })

    expect(report.status).toBe('pass')
    expect(report.diagnosticRunId).toBe('c18-l06-canary-approval-2026-06-20T21-42-00-000Z')
    expect(report.evidenceRef).toBe('artifacts/test-runs/20260621-c18-live/c18-l06-duration-canary-approval-disposable.json')
    expect(report.candidateId).toBe('candidate-disposable')
    expect(report.createdDisposableCandidate).toBe(true)
    expect(report.disposableCandidateCleanup.status).toBe('pass')
    expect(seedDisposableCandidate).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(approveCandidate).toHaveBeenCalledTimes(2)
    expect(approveCandidate.mock.calls[0][0]).toMatchObject({
      companyId: '11111111-1111-4111-8111-111111111111',
      candidateId: 'candidate-disposable',
    })
    expect(cleanupDisposableCandidate).toHaveBeenCalledWith(
      'candidate-disposable',
      '11111111-1111-4111-8111-111111111111',
    )
  })

  it('blocks before mutating when the diagnostic JSON output file is missing', async () => {
    const approveCandidate = vi.fn()

    const report = await buildDurationCanaryApprovalLiveDiagnosticReport({
      now: new Date('2026-06-21T05:43:00.000+08:00'),
      allowWrite: true,
      companyId: '11111111-1111-4111-8111-111111111111',
      candidateId: 'candidate-live',
      approvedBy: '00000000-0000-4000-8000-000000000006',
      approveCandidate,
    })

    expect(report.status).toBe('blocked')
    expect(report.outputFile).toBeNull()
    expect(report.checks.concurrentApproval.status).toBe('blocked')
    expect(report.checks.concurrentApproval.reason).toContain('Missing archived diagnostic JSON')
    expect(approveCandidate).not.toHaveBeenCalled()
    expect(shouldFailDurationCanaryApprovalLiveDiagnosticReport(report)).toBe(true)
  })

  it('blocks before mutating when approved-by is not a UUID', async () => {
    const approveCandidate = vi.fn()

    const report = await buildDurationCanaryApprovalLiveDiagnosticReport({
      now: new Date('2026-06-21T05:44:00.000+08:00'),
      allowWrite: true,
      companyId: '11111111-1111-4111-8111-111111111111',
      createDisposableCandidate: true,
      approvedBy: 'codex-live-diagnostic',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l06-duration-canary-approval-disposable.json',
      approveCandidate,
    })

    expect(report.status).toBe('blocked')
    expect(report.approvedBy).toBeNull()
    expect(report.createdDisposableCandidate).toBe(false)
    expect(report.checks.concurrentApproval.reason).toContain('--approved-by must be a users.id UUID')
    expect(approveCandidate).not.toHaveBeenCalled()
  })

  it('blocks before mutating when company scope is missing', async () => {
    const approveCandidate = vi.fn()

    const report = await buildDurationCanaryApprovalLiveDiagnosticReport({
      now: new Date('2026-06-21T05:45:00.000+08:00'),
      allowWrite: true,
      candidateId: 'candidate-live',
      approvedBy: '00000000-0000-4000-8000-000000000006',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l06-duration-canary-approval.json',
      approveCandidate,
    })

    expect(report.status).toBe('blocked')
    expect(report.companyId).toBeNull()
    expect(report.checks.concurrentApproval.reason).toContain('--company-id must be a company UUID')
    expect(approveCandidate).not.toHaveBeenCalled()
  })

  it('parses live diagnostic CLI flags', () => {
    expect(parseDurationCanaryApprovalLiveDiagnosticOptionsFromArgs([
      '--allow-write',
      '--company-id=11111111-1111-4111-8111-111111111111',
      '--candidate-id=candidate-1',
      '--approved-by=00000000-0000-4000-8000-000000000006',
      '--create-disposable-candidate',
      '--output-file=artifacts/test-runs/c18-l06.json',
      '--diagnostic-run-id=c18-l06-manual-1',
    ])).toEqual({
      allowWrite: true,
      companyId: '11111111-1111-4111-8111-111111111111',
      candidateId: 'candidate-1',
      approvedBy: '00000000-0000-4000-8000-000000000006',
      createDisposableCandidate: true,
      outputFile: 'artifacts/test-runs/c18-l06.json',
      diagnosticRunId: 'c18-l06-manual-1',
    })
  })
})
