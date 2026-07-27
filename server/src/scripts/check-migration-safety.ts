import { setDefaultResultOrder } from 'node:dns'
import { resolve } from 'node:path'

import pg from 'pg'

import {
  calculateMigrationChecksum,
  discoverMigrationFiles,
  listAppliedMigrations,
  listExistingBaselineTables,
  readMigrationSql,
  resolveMigrationRuntimeConnectionConfig,
} from '../services/migrationRunner.js'
import { evaluateMigrationCheck } from '../services/migrationSafetyGateService.js'
import { shouldFailMigrationCheckGate } from '../services/migrationSafetyGateService.js'
import { readAdoptedBaselineLedgerRows, readChecksumReconciliations } from './migrationSafetyScriptUtils.js'

const { Client } = pg

const migrationsDir = resolve(process.cwd(), 'migrations')
const adoptedBaselineRegistryPath = resolve(migrationsDir, 'adopted-baseline-ledger-rows.json')
const checksumReconciliationRegistryPath = resolve(migrationsDir, 'checksum-reconciliations.json')
const allowPendingMigrations = process.argv.includes('--allow-pending')

async function main() {
  setDefaultResultOrder('ipv4first')

  const discovered = await Promise.all(
    (await discoverMigrationFiles(migrationsDir)).map(async (migration) => ({
      filename: migration.filename,
      version: migration.version,
      checksum: calculateMigrationChecksum(await readMigrationSql(migration)),
    })),
  )

  const client = new Client(await resolveMigrationRuntimeConnectionConfig())
  await client.connect()

  try {
    const adoptedBaselineFilenames = await readAdoptedBaselineLedgerRows(adoptedBaselineRegistryPath)
    const checksumReconciliations = await readChecksumReconciliations(checksumReconciliationRegistryPath)
    const ledgerAvailable = await schemaMigrationsLedgerExists(client)
    const existingBaselineTables = await listExistingBaselineTables(client)
    const applied = ledgerAvailable ? await listAppliedMigrations(client) : []

    const result = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: applied,
      adoptedBaselineFilenames,
      checksumReconciliations,
      existingBaselineTables,
      ledgerAvailable,
    })

    printMigrationCheckSummary(result)

    if (shouldFailMigrationCheckGate(result, { allowPendingMigrations })) {
      process.exitCode = 1
    }
  } finally {
    await client.end()
  }
}

type MigrationCheckSummary = ReturnType<typeof evaluateMigrationCheck>

function printMigrationCheckSummary(result: MigrationCheckSummary) {
  const payload = {
    gate: 'migrate:check',
    status: result.status,
    ledgerAvailable: result.ledgerAvailable,
    allowPendingMigrations,
    reasonCodes: result.reasonCodes,
    pendingMigrations: result.pendingMigrations.map((item) => item.filename),
    checksumMismatches: result.checksumMismatches,
    reconciledChecksumMismatches: result.reconciledChecksumMismatches,
    orphanLedgerRows: result.orphanLedgerRows.map((item) => item.filename),
    adoptedBaselineLedgerRows: result.adoptedBaselineLedgerRows.map((item) => item.filename),
    duplicateVersions: result.duplicateVersions,
    unsafeBaselineReplayRisk: result.unsafeBaselineReplayRisk,
    existingBaselineTables: result.existingBaselineTables,
  }

  console.log(JSON.stringify(payload, null, 2))
}

async function schemaMigrationsLedgerExists(client: InstanceType<typeof Client>) {
  const result = await client.query<{ exists: boolean }>(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
  )
  return result.rows[0]?.exists === true
}

main().catch((error) => {
  console.error('Migration safety check failed:', error)
  process.exitCode = 1
})
