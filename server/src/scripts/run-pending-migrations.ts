import { setDefaultResultOrder } from 'node:dns'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import pg from 'pg'

import {
  acquireMigrationAdvisoryLock,
  applyMigration,
  calculateMigrationChecksum,
  configureMigrationSession,
  discoverMigrationFiles,
  ensureSchemaMigrationsTable,
  getPendingMigrations,
  listExistingBaselineTables,
  listAppliedMigrations,
  readMigrationSql,
  releaseMigrationAdvisoryLock,
  resolveMigrationRuntimeConnectionConfig,
  schemaMigrationsTableExists,
} from '../services/migrationRunner.js'
import {
  evaluateMigrationCheck,
  shouldFailMigrationCheckGate,
} from '../services/migrationSafetyGateService.js'
import { readAdoptedBaselineLedgerRows, readChecksumReconciliations } from './migrationSafetyScriptUtils.js'
import {
  PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION,
  prepareProgressKnowledgeRetirementApplySession,
  validateProgressKnowledgeRetirementBackup,
} from './progressKnowledgeRetirementSupport.js'
import {
  NOTIFICATION_TASK_REFERENCE_RETIREMENT_MIGRATION,
  prepareNotificationTaskReferenceRetirementApplySession,
  validateNotificationTaskReferenceRetirementBackup,
} from './notificationTaskReferenceRetirementSupport.js'
import {
  T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION,
  prepareT2ScheduleRuntimeRetirementApplySession,
  validateT2ScheduleRuntimeRetirementBackup,
} from './t2ScheduleRuntimeRetirementSupport.js'

const { Client } = pg

const migrationsDir = resolve(process.cwd(), 'migrations')
const adoptedBaselineRegistryPath = resolve(migrationsDir, 'adopted-baseline-ledger-rows.json')
const checksumReconciliationRegistryPath = resolve(migrationsDir, 'checksum-reconciliations.json')
const rawArgs = process.argv.slice(2)
const args = new Set(rawArgs)
const isPlanMode = args.has('--plan') || args.has('--dry-run')
const onlyArguments = rawArgs.filter((argument) => argument.startsWith('--only='))

async function main() {
  if (onlyArguments.length > 1) {
    throw new Error('migration selection accepts exactly one --only=<version-or-filename> argument')
  }
  const onlyMigrationSelector = onlyArguments[0]?.slice('--only='.length).trim() || null
  if (onlyArguments.length === 1 && !onlyMigrationSelector) {
    throw new Error('migration selection requires a non-empty --only=<version-or-filename> argument')
  }

  setDefaultResultOrder('ipv4first')
  const discovered = await discoverMigrationFiles(migrationsDir)
  const discoveredSafetyRecords = await Promise.all(
    discovered.map(async (migration) => ({
      filename: migration.filename,
      version: migration.version,
      checksum: calculateMigrationChecksum(await readMigrationSql(migration)),
    })),
  )

  const client = new Client(await resolveMigrationRuntimeConnectionConfig())
  await client.connect()
  let lockAcquired = false

  try {
    await configureMigrationSession(client)
    if (!isPlanMode) {
      await acquireMigrationAdvisoryLock(client)
      lockAcquired = true
    }

    const adoptedBaselineFilenames = await readAdoptedBaselineLedgerRows(adoptedBaselineRegistryPath)
    const checksumReconciliations = await readChecksumReconciliations(checksumReconciliationRegistryPath)
    let ledgerAvailable = await schemaMigrationsTableExists(client)
    const applied = ledgerAvailable ? await listAppliedMigrations(client) : []
    const existingBaselineTables = await listExistingBaselineTables(client)
    const safetyCheck = evaluateMigrationCheck({
      discoveredMigrations: discoveredSafetyRecords,
      appliedMigrations: applied,
      adoptedBaselineFilenames,
      checksumReconciliations,
      existingBaselineTables,
      ledgerAvailable,
    })

    if (shouldFailMigrationCheckGate(safetyCheck, { allowPendingMigrations: true })) {
      throw new Error(
        `migration safety gate blocked migrate:pending before applying SQL: ${safetyCheck.reasonCodes.join(', ')}`,
      )
    }

    if (!isPlanMode && !ledgerAvailable) {
      await ensureSchemaMigrationsTable(client)
      ledgerAvailable = true
    }

    const allPending = getPendingMigrations(discovered, applied)
    let pending = allPending
    if (onlyMigrationSelector) {
      const selectedMigrations = discovered.filter((migration) => (
        migration.version === onlyMigrationSelector
        || migration.filename === onlyMigrationSelector
      ))
      if (selectedMigrations.length !== 1) {
        throw new Error(
          `migration selection ${onlyMigrationSelector} matched ${selectedMigrations.length} migration files; expected exactly one`,
        )
      }

      const selectedMigration = selectedMigrations[0]
      const selectedIndex = discovered.findIndex((migration) => migration.filename === selectedMigration.filename)
      const earlierPending = allPending.filter((migration) => (
        discovered.findIndex((candidate) => candidate.filename === migration.filename) < selectedIndex
      ))
      if (earlierPending.length > 0) {
        throw new Error(
          `migration selection refuses to skip earlier pending migrations: ${earlierPending.map((migration) => migration.filename).join(', ')}`,
        )
      }
      pending = allPending.filter((migration) => migration.filename === selectedMigration.filename)
    }

    if (isPlanMode) {
      console.log(`发现 ${discovered.length} 个正式 migration 文件。`)
      console.log(`已记录 migration: ${applied.length}`)
      console.log(`待执行 migration: ${pending.length}`)

      if (pending.length > 0) {
        console.log('待执行清单:')
        pending.forEach((migration) => {
          console.log(`- ${migration.filename}`)
        })
      } else {
        console.log('没有待执行 migration。')
      }
      return
    }

    console.log(`已记录 migration: ${applied.length}`)
    console.log(`待执行 migration: ${pending.length}`)

    for (const migration of pending) {
      console.log(`开始执行 ${migration.filename}`)
      if (migration.filename === PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION) {
        const backupPath = String(process.env.PROGRESS_KNOWLEDGE_RETIREMENT_BACKUP_FILE ?? '').trim()
        if (!backupPath) {
          throw new Error('PROGRESS_KNOWLEDGE_RETIREMENT_BACKUP_FILE_REQUIRED')
        }
        const [serialized, checksumFile] = await Promise.all([
          readFile(resolve(backupPath), 'utf8'),
          readFile(`${resolve(backupPath)}.sha256`, 'utf8'),
        ])
        const expectedSha256 = checksumFile.trim().split(/\s+/)[0] ?? ''
        const backup = validateProgressKnowledgeRetirementBackup(serialized, expectedSha256)
        await prepareProgressKnowledgeRetirementApplySession(
          (sql, values) => client.query(sql, values),
          backup,
          expectedSha256,
        )
      }
      if (migration.filename === NOTIFICATION_TASK_REFERENCE_RETIREMENT_MIGRATION) {
        const backupPath = String(
          process.env.NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_FILE ?? '',
        ).trim()
        if (!backupPath) {
          throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_FILE_REQUIRED')
        }
        const [serialized, checksumFile] = await Promise.all([
          readFile(resolve(backupPath), 'utf8'),
          readFile(`${resolve(backupPath)}.sha256`, 'utf8'),
        ])
        const expectedSha256 = checksumFile.trim().split(/\s+/)[0] ?? ''
        const backup = validateNotificationTaskReferenceRetirementBackup(
          serialized,
          expectedSha256,
        )
        await prepareNotificationTaskReferenceRetirementApplySession(
          (sql, values) => client.query(sql, values),
          backup,
          expectedSha256,
        )
      }
      if (migration.filename === T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION) {
        const backupPath = String(process.env.T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_FILE ?? '').trim()
        if (!backupPath) {
          throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_FILE_REQUIRED')
        }
        const [serialized, checksumFile] = await Promise.all([
          readFile(resolve(backupPath), 'utf8'),
          readFile(`${resolve(backupPath)}.sha256`, 'utf8'),
        ])
        const expectedSha256 = checksumFile.trim().split(/\s+/)[0] ?? ''
        const backup = validateT2ScheduleRuntimeRetirementBackup(serialized, expectedSha256)
        await prepareT2ScheduleRuntimeRetirementApplySession(
          (sql, values) => client.query(sql, values),
          backup,
          expectedSha256,
        )
      }
      await applyMigration(client, migration)
      console.log(`已完成 ${migration.filename}`)
    }

    if (pending.length === 0) {
      console.log('没有待执行 migration。')
    }
  } finally {
    try {
      if (lockAcquired) {
        await releaseMigrationAdvisoryLock(client)
      }
    } finally {
      await client.end()
    }
  }
}

main().catch((error) => {
  console.error('执行 migration 失败:', error)
  process.exitCode = 1
})
