import { pathToFileURL } from 'node:url'

import pg from 'pg'

import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'
import {
  resolveDurationLearningLegacyRuntimeRetirementTargetIdentity,
  verifyDurationLearningLegacyRuntimeRetirementReadback,
} from './durationLearningLegacyRuntimeRetirementSupport.js'

const { Client } = pg

type RuntimeEnv = Record<string, string | undefined>
type MigrationConnectionConfig = Awaited<ReturnType<typeof resolveMigrationRuntimeConnectionConfig>>
type ReadbackClient = {
  connect(): Promise<void>
  query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>
  end(): Promise<void>
}

type VerificationDependencies = {
  env?: RuntimeEnv
  resolveTargetIdentity?: typeof resolveDurationLearningLegacyRuntimeRetirementTargetIdentity
  resolveConnectionConfig?: typeof resolveMigrationRuntimeConnectionConfig
  createClient?: (config: MigrationConnectionConfig) => ReadbackClient
  writeOutput?: (output: string) => void
}

export async function runDurationLearningLegacyRuntimeRetirementVerification(
  dependencies: VerificationDependencies = {},
) {
  const target = (
    dependencies.resolveTargetIdentity
    ?? resolveDurationLearningLegacyRuntimeRetirementTargetIdentity
  )(dependencies.env ?? process.env)
  const connectionConfig = await (
    dependencies.resolveConnectionConfig
    ?? resolveMigrationRuntimeConnectionConfig
  )()
  const client = dependencies.createClient?.(connectionConfig)
    ?? new Client(connectionConfig) as unknown as ReadbackClient

  let readback: Awaited<ReturnType<typeof verifyDurationLearningLegacyRuntimeRetirementReadback>>
  try {
    await client.connect()
    readback = await verifyDurationLearningLegacyRuntimeRetirementReadback(
      (sql, values) => client.query(sql, values),
    )
  } finally {
    await client.end()
  }

  const result = {
    status: 'DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_READBACK_COMPLETE' as const,
    target,
    readback,
  }
  const writeOutput = dependencies.writeOutput ?? console.log
  writeOutput(JSON.stringify(result, null, 2))
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runDurationLearningLegacyRuntimeRetirementVerification().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
