import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const repositoryRoot = resolve(serverRoot, '..')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('migration helper entrypoints', () => {
  it('keeps managed migration SQL byte-stable across Git checkouts', () => {
    const gitAttributes = readFileSync(resolve(repositoryRoot, '.gitattributes'), 'utf8')

    expect(gitAttributes).toContain('server/migrations/*.sql -text')
    expect(gitAttributes).toContain('server/migrations/rollback/*.sql -text')
  })

  it('keeps every checksum reconciliation pinned to the checked-out SQL bytes', () => {
    const reconciliations = JSON.parse(
      readServerFile('migrations', 'checksum-reconciliations.json'),
    ) as Array<{ filename: string; currentFileChecksum: string }>
    const mismatches = reconciliations.flatMap((record) => {
      const sql = readServerFile('migrations', record.filename)
      const checksum = createHash('sha256').update(sql).digest('hex')
      return checksum === record.currentFileChecksum
        ? []
        : [{ filename: record.filename, expected: record.currentFileChecksum, actual: checksum }]
    })

    expect(mismatches).toEqual([])
  })

  it('exposes migration 324 through standalone, rollback, and canonical CLEAN entrypoints', () => {
    const migrationName = '324_canonical_cause_and_benchmark_provenance.sql'
    const forward = readServerFile('migrations', migrationName)
    const rollback = readServerFile('migrations', 'rollback', migrationName)
    const clean = readServerFile('migrations', 'CLEAN_MIGRATION_V4.sql')

    expect(forward).toContain('CREATE TABLE IF NOT EXISTS public.duration_benchmark_cause_segments')
    expect(rollback).toContain('DROP TABLE IF EXISTS public.duration_benchmark_cause_segments')
    expect(clean).toContain(`-- Source: ${migrationName}`)
    expect(clean.trimEnd().endsWith(forward.trim())).toBe(true)
  })

  it('pins clean migration helpers to the canonical V4 bundle only', () => {
    const cleanRunner = readServerFile('run-clean-migration.mjs')
    const guidanceRunner = readServerFile('run-migration.js')
    const cjsGuidanceRunner = readServerFile('run-migration.cjs')

    for (const source of [cleanRunner, guidanceRunner, cjsGuidanceRunner]) {
      expect(source).toContain("const CANONICAL_CLEAN_BUNDLE = 'CLEAN_MIGRATION_V4.sql'")
      expect(source).not.toContain("'CLEAN_MIGRATION_V3.sql'")
      expect(source).not.toContain("'CLEAN_MIGRATION_V2.sql'")
      expect(source).not.toContain("'CLEAN_MIGRATION.sql'")
    }
  })

  it('exposes production migration governance and legacy object drop guards as fail-closed entrypoints', () => {
    const packageJson = readServerFile('package.json')
    const productionGovernanceScript = readServerFile('src', 'scripts', 'check-production-migration-governance.ts')
    const legacyDropGuardScript = readServerFile('src', 'scripts', 'check-legacy-object-drop-guard.ts')
    const pendingDropTargetScript = readServerFile('src', 'scripts', 'check-pending-migration-drop-targets.ts')

    expect(packageJson).toContain('"migrate:production-governance"')
    expect(packageJson).toContain('"guard:legacy-object-drop"')
    expect(packageJson).toContain('"guard:pending-migration-drop-targets"')
    expect(productionGovernanceScript).toContain('buildProductionMigrationGovernanceReport')
    expect(productionGovernanceScript).toContain("exitCode: report.status === 'closed' ? 0 : 1")
    expect(productionGovernanceScript).toContain('process.exitCode = result.exitCode')
    expect(productionGovernanceScript).not.toContain('ensureSchemaMigrationsTable')
    expect(productionGovernanceScript).not.toContain('applyMigration')
    expect(legacyDropGuardScript).toContain('createBlockedSafeLegacyObjectDropReport')
    expect(legacyDropGuardScript).toContain('runLegacyObjectDropGuardCheck')
    expect(legacyDropGuardScript).toContain("behavior.allowNeedsGating === true && report.status === 'needs_gating'")
    expect(legacyDropGuardScript).toContain('return { report, exitCode: allowed ? 0 : 1 }')
    expect(legacyDropGuardScript).toContain('process.exitCode = result.exitCode')
    expect(pendingDropTargetScript).toContain('evaluatePendingMigrationDropTargets')
    expect(pendingDropTargetScript).toContain('existing_drop_target_requires_governed_evidence')
    expect(pendingDropTargetScript).not.toContain('applyMigration')
  })

  it('keeps migration planning read-only and accepts safe pending readiness before apply', () => {
    const pendingRunner = readServerFile('src', 'scripts', 'run-pending-migrations.ts')
    const readinessRunner = readServerFile('src', 'scripts', 'check-migration-release-readiness.ts')

    expect(pendingRunner).toContain('schemaMigrationsTableExists')
    expect(pendingRunner).toMatch(/if \(!isPlanMode && !ledgerAvailable\)[\s\S]{0,120}ensureSchemaMigrationsTable/)
    expect(pendingRunner).toContain("argument.startsWith('--only=')")
    expect(pendingRunner).toContain('matched ${selectedMigrations.length} migration files; expected exactly one')
    expect(pendingRunner).toContain('migration selection refuses to skip earlier pending migrations')
    expect(readinessRunner).toContain('shouldFailMigrationReleaseReadinessGate')
  })
})
