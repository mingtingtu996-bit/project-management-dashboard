import { pathToFileURL } from 'node:url'

export const DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION =
  'DRAIN_DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_NOW'

type RecoveryExecutionResult =
  | ({ status: 'completed' } & Record<string, unknown>)
  | { status: 'skipped'; reason: string }

type RecoveryJob = {
  executeNow(): Promise<RecoveryExecutionResult>
}

type RecoveryCliDependencies = {
  loadJob?: () => Promise<RecoveryJob>
  writeOutput?: (output: string) => void
}

function readArgument(argv: string[], name: string) {
  const index = argv.indexOf(name)
  return index >= 0 ? String(argv[index + 1] ?? '').trim() : ''
}

function assertRecoveryConfirmed(argv: string[]) {
  const allowWrite = argv.includes('--allow-write')
  const confirmation = readArgument(argv, '--confirm')
  if (!allowWrite || confirmation !== DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION_REQUIRED')
  }
}

async function loadDefaultRecoveryJob(): Promise<RecoveryJob> {
  const { durationLearningRuntimeEvidenceOutboxDrainJob } = await import(
    '../jobs/durationLearningRuntimeEvidenceOutboxDrainJob.js'
  )
  return durationLearningRuntimeEvidenceOutboxDrainJob
}

export async function runDurationLearningRuntimeEvidenceOutboxRecoveryCli(
  argv: string[],
  dependencies: RecoveryCliDependencies = {},
) {
  assertRecoveryConfirmed(argv)

  const job = await (dependencies.loadJob ?? loadDefaultRecoveryJob)()
  const result = await job.executeNow()
  if (result.status === 'skipped') {
    throw new Error(`DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_SKIPPED:${result.reason}`)
  }

  const writeOutput = dependencies.writeOutput ?? console.log
  writeOutput(JSON.stringify({
    recovery: 'duration_learning_runtime_evidence_outbox',
    result,
  }, null, 2))
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runDurationLearningRuntimeEvidenceOutboxRecoveryCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
