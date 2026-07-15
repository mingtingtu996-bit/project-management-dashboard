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
  schemaMigrationsTableExists,
} from '../services/migrationRunner.js'
import {
  buildMigrationReleaseReadiness,
  evaluateMigrationCheck,
  shouldFailMigrationReleaseReadinessGate,
} from '../services/migrationSafetyGateService.js'
import { readAdoptedBaselineLedgerRows, readChecksumReconciliations } from './migrationSafetyScriptUtils.js'

const { Client } = pg

const migrationsDir = resolve(process.cwd(), 'migrations')
const adoptedBaselineRegistryPath = resolve(migrationsDir, 'adopted-baseline-ledger-rows.json')
const checksumReconciliationRegistryPath = resolve(migrationsDir, 'checksum-reconciliations.json')

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
    const existingBaselineTables = await listExistingBaselineTables(client)
    const ledgerAvailable = await schemaMigrationsTableExists(client)
    const applied = ledgerAvailable ? await listAppliedMigrations(client) : []
    const check = evaluateMigrationCheck({
      discoveredMigrations: discovered,
      appliedMigrations: applied,
      adoptedBaselineFilenames,
      checksumReconciliations,
      existingBaselineTables,
      ledgerAvailable,
    })
    const readiness = buildMigrationReleaseReadiness(check)

    console.log(JSON.stringify({
      gate: 'migrate:diagnose',
      status: readiness.status,
      safeToApplyPending: readiness.safeToApplyPending,
      safeToEvaluateDrift: readiness.safeToEvaluateDrift,
      nextAction: readiness.nextAction,
      reasonCodes: check.reasonCodes,
      blockingReasonCodes: readiness.blockingReasonCodes,
      pendingMigrations: check.pendingMigrations.map((item) => item.filename),
      checksumMismatches: check.checksumMismatches,
      reconciledChecksumMismatches: check.reconciledChecksumMismatches,
      orphanLedgerRows: check.orphanLedgerRows.map((item) => item.filename),
      adoptedBaselineLedgerRows: check.adoptedBaselineLedgerRows.map((item) => item.filename),
      duplicateVersions: check.duplicateVersions,
      unsafeBaselineReplayRisk: check.unsafeBaselineReplayRisk,
      counts: {
        pending: readiness.pendingCount,
        checksumMismatch: readiness.checksumMismatchCount,
        orphanLedgerRow: readiness.orphanLedgerRowCount,
        adoptedBaselineLedgerRow: readiness.adoptedBaselineLedgerRowCount,
        duplicateVersion: readiness.duplicateVersionCount,
      },
    }, null, 2))

    if (shouldFailMigrationReleaseReadinessGate(readiness)) {
      process.exitCode = 1
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Migration release readiness check failed:', error)
  process.exitCode = 1
})
