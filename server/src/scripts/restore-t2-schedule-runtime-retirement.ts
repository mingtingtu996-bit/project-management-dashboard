import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import pg from 'pg'

import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'
import {
  T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION,
  restoreT2ScheduleRuntimeRetirementBackup,
  resolveT2ScheduleRuntimeRetirementTargetIdentity,
  validateT2ScheduleRuntimeRetirementBackup,
} from './t2ScheduleRuntimeRetirementSupport.js'

const { Client } = pg

function readArgument(argv: string[], name: string) {
  const index = argv.indexOf(name)
  return index >= 0 ? String(argv[index + 1] ?? '').trim() : ''
}

async function main() {
  const args = process.argv.slice(2)
  const backupPathValue = readArgument(args, '--backup')
  const confirmation = readArgument(args, '--confirm')
  if (!backupPathValue || !confirmation) {
    throw new Error(
      `Usage: restore-t2-schedule-runtime-retirement --backup <json-path> --confirm ${T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION}`,
    )
  }

  const backupPath = resolve(backupPathValue)
  const [serialized, checksumFile] = await Promise.all([
    readFile(backupPath, 'utf8'),
    readFile(`${backupPath}.sha256`, 'utf8'),
  ])
  const expectedSha256 = checksumFile.trim().split(/\s+/)[0] ?? ''
  const backup = validateT2ScheduleRuntimeRetirementBackup(serialized, expectedSha256)

  const client = new Client(await resolveMigrationRuntimeConnectionConfig())
  await client.connect()
  try {
    await restoreT2ScheduleRuntimeRetirementBackup(
      (sql, values) => client.query(sql, values),
      backup,
      confirmation,
      resolveT2ScheduleRuntimeRetirementTargetIdentity(),
    )
    console.log(JSON.stringify({
      status: 'pass',
      restoredMigration: backup.migrationFilename,
      dataFingerprint: backup.dataFingerprint,
      counts: backup.counts,
    }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
