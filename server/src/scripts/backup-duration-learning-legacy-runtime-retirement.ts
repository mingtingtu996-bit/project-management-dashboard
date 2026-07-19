import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import pg from 'pg'

import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'
import {
  DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION,
  calculateDurationLearningLegacyRuntimeRetirementBackupSha256,
  captureDurationLearningLegacyRuntimeRetirementBackup,
  resolveDurationLearningLegacyRuntimeRetirementTargetIdentity,
  serializeDurationLearningLegacyRuntimeRetirementBackup,
} from './durationLearningLegacyRuntimeRetirementSupport.js'

const { Client } = pg

function parseArgs(argv: string[]) {
  const outputIndex = argv.indexOf('--output')
  const output = outputIndex >= 0 ? String(argv[outputIndex + 1] ?? '').trim() : ''
  if (!output) {
    throw new Error(
      'Usage: backup:duration-learning-legacy-runtime-retirement -- --output <json-path> [--if-pending]',
    )
  }
  return { outputPath: resolve(output), ifPending: argv.includes('--if-pending') }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const client = new Client(await resolveMigrationRuntimeConnectionConfig())
  await client.connect()
  try {
    const applied = await client.query<{ applied: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM public.schema_migrations
         WHERE filename = $1
       ) AS applied`,
      [DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION],
    )
    if (applied.rows[0]?.applied === true) {
      if (!options.ifPending) {
        throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_ALREADY_APPLIED')
      }
      console.log(JSON.stringify({ status: 'skipped', reason: 'migration_already_applied' }))
      return
    }

    const backup = await captureDurationLearningLegacyRuntimeRetirementBackup(
      (sql, values) => client.query(sql, values),
      { targetIdentity: resolveDurationLearningLegacyRuntimeRetirementTargetIdentity() },
    )
    const serialized = serializeDurationLearningLegacyRuntimeRetirementBackup(backup)
    const sha256 = calculateDurationLearningLegacyRuntimeRetirementBackupSha256(serialized)
    await mkdir(dirname(options.outputPath), { recursive: true })
    await writeFile(options.outputPath, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await writeFile(
      `${options.outputPath}.sha256`,
      `${sha256}  ${basename(options.outputPath)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    )
    console.log(JSON.stringify({
      status: 'pass',
      outputPath: options.outputPath,
      sha256Path: `${options.outputPath}.sha256`,
      sha256,
      dataFingerprint: backup.retirementState.source_data_fingerprint,
      manifestFingerprint: backup.retirementState.manifest_fingerprint,
      archivedRowCount: backup.retirementState.archived_row_count,
      mappingCount: backup.retirementState.default_master_plan_mapping_count,
    }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
