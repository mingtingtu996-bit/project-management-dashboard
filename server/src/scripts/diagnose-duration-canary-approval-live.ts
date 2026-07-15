import { performance } from 'node:perf_hooks'
import { writeJsonFile } from './jsonEvidenceUtils.js'

import type { ApproveDurationContextPolicyCanaryCandidateInput } from '../services/durationContextPolicyCanaryApprovalService.js'

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'
type DisposableCandidateCleanupStatus = 'not_applicable' | 'pass' | 'fail'

export type DurationCanaryApprovalDiagnosticApprover = (
  input: ApproveDurationContextPolicyCanaryCandidateInput,
) => Promise<unknown>

export type DurationCanaryApprovalDisposableCandidateSeeder = (companyId: string) => Promise<string>

export type DurationCanaryApprovalDisposableCandidateCleanup = (
  candidateId: string,
  companyId: string,
) => Promise<void>

export type DurationCanaryApprovalConcurrentCheck = {
  status: DiagnosticStatus
  attemptCount: 2
  successCount: number
  guardedFailureCount: number
  unexpectedFailureCount: number
  missingArchivedJson?: boolean
  elapsedMs: number | null
  resultKinds: Array<'fulfilled' | 'guarded_failure' | 'unexpected_failure'>
  failureMessages: string[]
  reason?: string
}

export type DurationCanaryApprovalLiveDiagnosticReport = {
  reportCode: 'c18_l06_duration_canary_approval_live_diagnostic'
  evidenceKind: 'live_concurrent_write_probe'
  generatedAt: string
  diagnosticRunId: string
  evidenceRef: string | null
  outputFile: string | null
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  status: DiagnosticStatus
  allowWrite: boolean
  companyId: string | null
  candidateId: string | null
  approvedBy: string | null
  createdDisposableCandidate: boolean
  disposableCandidateCleanup: {
    status: DisposableCandidateCleanupStatus
    errorMessage: string | null
  }
  checks: {
    concurrentApproval: DurationCanaryApprovalConcurrentCheck
  }
}

export type DurationCanaryApprovalLiveDiagnosticOptions = {
  now?: Date
  diagnosticRunId?: string | null
  outputFile?: string | null
  allowWrite?: boolean
  companyId?: string | null
  candidateId?: string | null
  approvedBy?: string | null
  createDisposableCandidate?: boolean
  approveCandidate?: DurationCanaryApprovalDiagnosticApprover
  seedDisposableCandidate?: DurationCanaryApprovalDisposableCandidateSeeder
  cleanupDisposableCandidate?: DurationCanaryApprovalDisposableCandidateCleanup
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function createDefaultDiagnosticRunId(now: Date) {
  return `c18-l06-canary-approval-${now.toISOString().replace(/[:.]/g, '-')}`
}

function normalizeOptionalUuid(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function isGuardedApprovalFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /already changed|already exists|duplicate|23505|candidate rows can be approved/i.test(message)
}

function blockedConcurrentApprovalCheck(reason: string): DurationCanaryApprovalConcurrentCheck {
  return {
    status: 'blocked',
    attemptCount: 2,
    successCount: 0,
    guardedFailureCount: 0,
    unexpectedFailureCount: 0,
    elapsedMs: null,
    resultKinds: [],
    failureMessages: [],
    reason,
  }
}

function failedConcurrentApprovalCheck(reason: string): DurationCanaryApprovalConcurrentCheck {
  return {
    status: 'fail',
    attemptCount: 2,
    successCount: 0,
    guardedFailureCount: 0,
    unexpectedFailureCount: 1,
    elapsedMs: null,
    resultKinds: ['unexpected_failure'],
    failureMessages: [reason],
    reason,
  }
}

async function loadDefaultApprover(): Promise<DurationCanaryApprovalDiagnosticApprover> {
  const service = await import('../services/durationContextPolicyCanaryApprovalService.js')
  return service.approveDurationContextPolicyCanaryCandidate
}

async function seedDefaultDisposableCandidate(companyId: string) {
  const { supabase } = await import('../services/dbService.js')
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_canary_candidates')
    .insert({
      company_id: companyId,
      model_family: 'contextual_bandit_v1',
      model_version: 'contextual_bandit_v1',
      candidate_status: 'candidate',
      runtime_mutation_policy: 'none_canary_candidate_only',
      runtime_auto_publish_eligible: false,
      requires_review: true,
      project_id: null,
      state_bucket: 'diagnostic_c18_l06|risk:low|schedule:stable|hard:0',
      action_key: 'publish_low_risk_calibration_threshold',
      replay_case_count: 2,
      average_projected_reward_delta: 0.01,
      source_decision_ids: ['c18_l06_duration_canary_approval_live_diagnostic'],
      guardrails: ['low_risk_canary_review_required', 'diagnostic_disposable_candidate'],
    })
    .select('id')
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to create disposable duration canary candidate: ${error.message}`)
  }

  const id = normalizeText((data as { id?: unknown } | null)?.id)
  if (!id) {
    throw new Error('Failed to create disposable duration canary candidate: missing id')
  }
  return id
}

async function cleanupDefaultDisposableCandidate(candidateId: string, companyId: string) {
  const { supabase } = await import('../services/dbService.js')
  const { error } = await (supabase as any)
    .from('duration_context_policy_canary_candidates')
    .delete()
    .eq('id', candidateId)
    .eq('company_id', companyId)
  if (error) {
    throw new Error(`Failed to clean up disposable duration canary candidate: ${error.message}`)
  }
}

export async function buildDurationCanaryApprovalLiveDiagnosticReport(
  options: DurationCanaryApprovalLiveDiagnosticOptions = {},
): Promise<DurationCanaryApprovalLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const allowWrite = options.allowWrite === true
  const outputFile = normalizeText(options.outputFile)
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const rawCompanyId = normalizeText(options.companyId)
  const companyId = normalizeOptionalUuid(rawCompanyId)
  let candidateId = normalizeText(options.candidateId)
  const rawApprovedBy = normalizeText(options.approvedBy)
  const approvedBy = normalizeOptionalUuid(rawApprovedBy)
  const createDisposableCandidate = options.createDisposableCandidate === true
  let createdDisposableCandidate = false
  let seedFailureReason: string | null = null
  const disposableCandidateCleanup: DurationCanaryApprovalLiveDiagnosticReport['disposableCandidateCleanup'] = {
    status: 'not_applicable',
    errorMessage: null,
  }

  if (allowWrite && !outputFile) {
    return {
      reportCode: 'c18_l06_duration_canary_approval_live_diagnostic' as const,
      evidenceKind: 'live_concurrent_write_probe' as const,
      generatedAt: now.toISOString(),
      diagnosticRunId,
      evidenceRef: null,
      outputFile: null,
      liveEvidenceRequired: true as const,
      liveEvidenceRequiredReason: 'C-18.L06 requires a real database concurrent approval probe against a disposable candidate plus archived JSON output.',
      status: 'blocked',
      allowWrite,
      companyId,
      candidateId: candidateId || null,
      approvedBy,
      createdDisposableCandidate: false,
      disposableCandidateCleanup,
      checks: {
        concurrentApproval: blockedConcurrentApprovalCheck('Missing archived diagnostic JSON; pass --output-file before closing C-18.L06.'),
      },
    }
  }

  if (allowWrite && rawApprovedBy && !approvedBy) {
    return {
      reportCode: 'c18_l06_duration_canary_approval_live_diagnostic' as const,
      evidenceKind: 'live_concurrent_write_probe' as const,
      generatedAt: now.toISOString(),
      diagnosticRunId,
      evidenceRef: outputFile || null,
      outputFile: outputFile || null,
      liveEvidenceRequired: true as const,
      liveEvidenceRequiredReason: 'C-18.L06 requires a real database concurrent approval probe against a disposable candidate plus archived JSON output.',
      status: 'blocked',
      allowWrite,
      companyId,
      candidateId: candidateId || null,
      approvedBy: null,
      createdDisposableCandidate: false,
      disposableCandidateCleanup,
      checks: {
        concurrentApproval: blockedConcurrentApprovalCheck('--approved-by must be a users.id UUID or omitted for a null diagnostic approver.'),
      },
    }
  }

  if (allowWrite && !companyId) {
    return {
      reportCode: 'c18_l06_duration_canary_approval_live_diagnostic' as const,
      evidenceKind: 'live_concurrent_write_probe' as const,
      generatedAt: now.toISOString(),
      diagnosticRunId,
      evidenceRef: outputFile || null,
      outputFile: outputFile || null,
      liveEvidenceRequired: true as const,
      liveEvidenceRequiredReason: 'C-18.L06 requires a real database concurrent approval probe against a disposable candidate plus archived JSON output.',
      status: 'blocked',
      allowWrite,
      companyId: null,
      candidateId: candidateId || null,
      approvedBy,
      createdDisposableCandidate: false,
      disposableCandidateCleanup,
      checks: {
        concurrentApproval: blockedConcurrentApprovalCheck('--company-id must be a company UUID before any live canary write.'),
      },
    }
  }

  if (allowWrite && !candidateId && createDisposableCandidate) {
    try {
      const seedDisposableCandidate = options.seedDisposableCandidate ?? seedDefaultDisposableCandidate
      candidateId = normalizeText(await seedDisposableCandidate(companyId as string))
      createdDisposableCandidate = Boolean(candidateId)
    } catch (error) {
      seedFailureReason = error instanceof Error ? error.message : String(error)
    }
  }
  const base = {
    reportCode: 'c18_l06_duration_canary_approval_live_diagnostic' as const,
    evidenceKind: 'live_concurrent_write_probe' as const,
    generatedAt: now.toISOString(),
    diagnosticRunId,
    evidenceRef: outputFile || null,
    outputFile: outputFile || null,
    liveEvidenceRequired: true as const,
    liveEvidenceRequiredReason: 'C-18.L06 requires a real database concurrent approval probe against a disposable candidate plus archived JSON output.',
    allowWrite,
    companyId,
    candidateId: candidateId || null,
    approvedBy,
    createdDisposableCandidate,
    disposableCandidateCleanup,
  }

  if (seedFailureReason) {
    return {
      ...base,
      status: 'fail',
      checks: {
        concurrentApproval: failedConcurrentApprovalCheck(seedFailureReason),
      },
    }
  }

  if (!allowWrite || !candidateId) {
    const reason = !allowWrite
      ? 'Pass --allow-write and --candidate-id=<candidate> to run the live concurrent write probe.'
      : 'Pass --candidate-id=<candidate> or --create-disposable-candidate for a disposable low-risk canary candidate.'
    return {
      ...base,
      status: 'blocked',
      checks: {
        concurrentApproval: blockedConcurrentApprovalCheck(reason),
      },
    }
  }

  const approveCandidate = options.approveCandidate ?? await loadDefaultApprover()
  const input: ApproveDurationContextPolicyCanaryCandidateInput = {
    companyId: companyId as string,
    candidateId,
    approvedBy,
    reason: 'C-18.L06 live concurrent approval diagnostic',
    scope: {
      projectIds: [],
      trafficPercent: 5,
    },
    reviewMetadata: {
      diagnosticCode: 'c18_l06_duration_canary_approval_live_diagnostic',
      diagnosticStartedAt: now.toISOString(),
    },
  }
  const startedAt = performance.now()
  const results = await Promise.allSettled([
    approveCandidate(input),
    approveCandidate(input),
  ])
  const resultKinds: DurationCanaryApprovalConcurrentCheck['resultKinds'] = []
  const failureMessages: string[] = []
  let successCount = 0
  let guardedFailureCount = 0
  let unexpectedFailureCount = 0

  for (const result of results) {
    if (result.status === 'fulfilled') {
      successCount += 1
      resultKinds.push('fulfilled')
      continue
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
    failureMessages.push(message)
    if (isGuardedApprovalFailure(result.reason)) {
      guardedFailureCount += 1
      resultKinds.push('guarded_failure')
    } else {
      unexpectedFailureCount += 1
      resultKinds.push('unexpected_failure')
    }
  }

  const missingArchivedJson = !outputFile
  const cleanup: DurationCanaryApprovalLiveDiagnosticReport['disposableCandidateCleanup'] = {
    ...disposableCandidateCleanup,
  }
  if (createdDisposableCandidate) {
    try {
      const cleanupDisposableCandidate = options.cleanupDisposableCandidate ?? cleanupDefaultDisposableCandidate
      await cleanupDisposableCandidate(candidateId, companyId as string)
      cleanup.status = 'pass'
    } catch (error) {
      cleanup.status = 'fail'
      cleanup.errorMessage = error instanceof Error ? error.message : String(error)
    }
  }
  const disposableEvidenceReady = createdDisposableCandidate && cleanup.status === 'pass'
  const concurrentStatus: DiagnosticStatus = successCount === 1 &&
    guardedFailureCount === 1 &&
    unexpectedFailureCount === 0 &&
    !missingArchivedJson &&
    disposableEvidenceReady
    ? 'pass'
    : 'fail'
  const status: DiagnosticStatus = concurrentStatus === 'pass' && cleanup.status !== 'fail' ? 'pass' : 'fail'

  return {
    ...base,
    disposableCandidateCleanup: cleanup,
    status,
    checks: {
      concurrentApproval: {
        status: concurrentStatus,
        attemptCount: 2,
        successCount,
        guardedFailureCount,
        unexpectedFailureCount,
        missingArchivedJson,
        elapsedMs: roundMs(performance.now() - startedAt),
        resultKinds,
        failureMessages,
        ...(concurrentStatus === 'pass'
          ? {}
          : missingArchivedJson
          ? { reason: 'Missing archived diagnostic JSON; pass --output-file before closing C-18.L06.' }
          : !disposableEvidenceReady
            ? { reason: 'Expected diagnostic-created disposable candidate evidence and cleanup pass before closing C-18.L06.' }
            : { reason: 'Expected exactly one successful approval and one guarded duplicate/stale failure.' }),
      },
    },
  }
}

export function shouldFailDurationCanaryApprovalLiveDiagnosticReport(
  report: DurationCanaryApprovalLiveDiagnosticReport,
) {
  return report.status !== 'pass' || report.checks.concurrentApproval.status !== 'pass'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

export function parseDurationCanaryApprovalLiveDiagnosticOptionsFromArgs(
  args: string[],
): Pick<DurationCanaryApprovalLiveDiagnosticOptions, 'allowWrite' | 'companyId' | 'candidateId' | 'approvedBy' | 'createDisposableCandidate' | 'outputFile' | 'diagnosticRunId'> {
  return {
    allowWrite: args.includes('--allow-write'),
    companyId: parseStringArg(args, 'company-id'),
    candidateId: parseStringArg(args, 'candidate-id'),
    approvedBy: parseStringArg(args, 'approved-by'),
    createDisposableCandidate: args.includes('--create-disposable-candidate'),
    outputFile: parseStringArg(args, 'output-file'),
    diagnosticRunId: normalizeText(parseStringArg(args, 'diagnostic-run-id')) || undefined,
  }
}

function writeReportIfRequested(report: DurationCanaryApprovalLiveDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildDurationCanaryApprovalLiveDiagnosticReport(
    parseDurationCanaryApprovalLiveDiagnosticOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailDurationCanaryApprovalLiveDiagnosticReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('diagnose-duration-canary-approval-live.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
