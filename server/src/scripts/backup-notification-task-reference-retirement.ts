import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import pg from 'pg'

import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'
import {
  NOTIFICATION_TASK_REFERENCE_RETIREMENT_MIGRATION,
  calculateNotificationTaskReferenceRetirementBackupSha256,
  captureNotificationTaskReferenceRetirementBackup,
  serializeNotificationTaskReferenceRetirementBackup,
} from './notificationTaskReferenceRetirementSupport.js'

const { Client } = pg

function parseArgs(argv: string[]) {
  const outputIndex = argv.indexOf('--output')
  const output = outputIndex >= 0 ? String(argv[outputIndex + 1] ?? '').trim() : ''
  if (!output) {
    throw new Error(
      'Usage: backup-notification-task-reference-retirement --output <json-path> [--if-pending]',
    )
  }
  return {
    outputPath: resolve(output),
    ifPending: argv.includes('--if-pending'),
  }
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
      [NOTIFICATION_TASK_REFERENCE_RETIREMENT_MIGRATION],
    )
    if (applied.rows[0]?.applied === true) {
      if (!options.ifPending) {
        throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_ALREADY_APPLIED')
      }
      console.log(JSON.stringify({ status: 'skipped', reason: 'migration_already_applied' }))
      return
    }

    const backup = await captureNotificationTaskReferenceRetirementBackup(
      (sql, values) => client.query(sql, values),
    )
    const serialized = serializeNotificationTaskReferenceRetirementBackup(backup)
    const sha256 = calculateNotificationTaskReferenceRetirementBackupSha256(serialized)
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
      dataFingerprint: backup.dataFingerprint,
      count: backup.count,
    }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
