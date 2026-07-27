import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildExpectedSchemaFromMigrationSql } from '../services/schemaDriftExpectedSchemaParser.js'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationName = '322_duration_learning_legacy_runtime_retirement.sql'

function readSql(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8').replace(/\r\n/g, '\n')
}

function normalizeSqlWhitespace(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim()
  if (Array.isArray(value)) return value.map(normalizeSqlWhitespace)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizeSqlWhitespace(nested)]),
    )
  }
  return value
}

describe('duration learning legacy runtime retirement migration', () => {
  it('fails closed before its explicit transaction unless the exact backup is authorized', () => {
    const sql = readSql('migrations', migrationName)
    const explicitBegin = sql.indexOf('\nBEGIN;')
    const preTransaction = sql.slice(0, explicitBegin)

    expect(explicitBegin).toBeGreaterThan(-1)
    expect(preTransaction).toContain('DO $preflight$')
    expect(preTransaction).not.toMatch(/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|LOCK)\b/i)
    for (const setting of [
      'workbuddy.duration_learning_legacy_runtime_retirement.authorization_ref',
      'workbuddy.duration_learning_legacy_runtime_retirement.authorization_token',
      'workbuddy.duration_learning_legacy_runtime_retirement.backup_sha256',
      'workbuddy.duration_learning_legacy_runtime_retirement.data_fingerprint',
      'workbuddy.duration_learning_legacy_runtime_retirement.manifest_fingerprint',
    ]) {
      expect(preTransaction).toMatch(
        new RegExp(`current_setting\\(\\s*'${setting.replaceAll('.', '\\.')}\\s*'\\s*,\\s*true\\s*\\)`),
      )
    }
    expect(preTransaction).toContain('duration_learning_legacy_runtime_retirement_explicit_authorization_required')
    expect(preTransaction).toContain('duration_learning_legacy_runtime_retirement_authorization_token_mismatch')
    expect(preTransaction).toContain("digest(convert_to('322:'")
    expect(preTransaction).not.toContain('set_config(')
  })

  it('requires migration 315, trusted archive parity and a default-master-plan-only mapping', () => {
    const sql = readSql('migrations', migrationName)

    expect(sql).toMatch(/FROM public\.schema_migrations[\s\S]+version = '315'[\s\S]+filename = '315_duration_learning_runtime_publications\.sql'/i)
    for (const relation of [
      'duration_learning_runtime_publications',
      'duration_learning_runtime_consumptions',
      'duration_learning_legacy_runtime_row_archive',
      'duration_learning_legacy_default_master_plan_mappings',
      'duration_learning_legacy_runtime_retirement_state',
      'wbs_template_runtime_publications',
      'wbs_template_runtime_events',
      'construction_dependency_rule_runtime_publications',
      'construction_dependency_rule_runtime_events',
    ]) {
      expect(sql).toContain(`to_regclass('public.${relation}')`)
    }

    expect(sql).toContain("retirement_status = 'archived_ready_for_explicit_322_authorization'")
    expect(sql).toContain('source_data_fingerprint')
    expect(sql).toContain('archive_data_fingerprint')
    expect(sql).toContain('manifest_fingerprint')
    expect(sql).toContain('default_master_plan_mapping_count')
    expect(sql).toContain('unsupported_wbs_publication_count = 0')
    expect(sql).toContain('source_dependency_publication_count = 0')
    expect(sql).toContain('source_dependency_event_count = 0')
    expect(sql).toContain("mapping_kind = 'legacy_default_master_plan_source_consumer_lineage'")
    expect(sql).toContain('duration_learning_legacy_runtime_retirement_source_changed_after_archive')
    expect(sql).toContain('duration_learning_legacy_runtime_retirement_archive_fingerprint_mismatch')
    expect(sql).toContain('duration_learning_legacy_runtime_retirement_mapping_count_mismatch')
    expect(sql).toContain('duration_learning_legacy_runtime_retirement_locked_revalidation')
  })

  it('drops only the four legacy runtime relations and leaves a machine-readable readback', () => {
    const sql = readSql('migrations', migrationName)

    for (const relation of [
      'wbs_template_runtime_publications',
      'wbs_template_runtime_events',
      'construction_dependency_rule_runtime_publications',
      'construction_dependency_rule_runtime_events',
    ]) {
      expect(sql).toContain(`LOCK TABLE public.${relation} IN ACCESS EXCLUSIVE MODE`)
      expect(sql).toContain(`DROP TABLE public.${relation};`)
    }
    expect(sql).not.toMatch(/DROP TABLE[\s\S]{0,120}\bCASCADE\b/i)
    expect(sql).toContain("retirement_status = 'retired_readback_complete'")
    expect(sql).toContain('retirement_authorization_ref = authorization_ref')
    expect(sql).toContain('retirement_backup_sha256 = backup_sha256')
    expect(sql).toContain('retired_source_data_fingerprint = actual_source_fingerprint')
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('restores exact legacy schemas and archived rows without creating learned publications', () => {
    const rollback = readSql('migrations', 'rollback', migrationName)

    for (const relation of [
      'wbs_template_runtime_publications',
      'wbs_template_runtime_events',
      'construction_dependency_rule_runtime_publications',
      'construction_dependency_rule_runtime_events',
    ]) {
      expect(rollback).toContain(`CREATE TABLE public.${relation}`)
      expect(rollback).toContain(`NULL::public.${relation}`)
    }
    expect(rollback).toContain("asset_kind IN ('special_work_duration_seed', 'wbs_reference_days', 'default_master_plan')")
    expect(rollback).toContain('CREATE POLICY wbs_template_runtime_publications_backend_runtime')
    expect(rollback).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_publications TO workbuddy_runtime')
    expect(rollback).toContain('duration_learning_legacy_runtime_rollback_archive_fingerprint_mismatch')
    expect(rollback).toContain('duration_learning_legacy_runtime_rollback_source_fingerprint_mismatch')
    expect(rollback).toContain("retirement_status = 'restored_readback_complete'")
    expect(rollback).not.toMatch(/INSERT\s+INTO\s+public\.duration_learning_runtime_publications/i)
  })

  it('reconstructs the final legacy schema represented by migrations 202, 203, 264 and 279', () => {
    const legacyTables = new Set([
      'construction_dependency_rule_runtime_events',
      'construction_dependency_rule_runtime_publications',
      'wbs_template_runtime_events',
      'wbs_template_runtime_publications',
    ])
    const sourceSchema = buildExpectedSchemaFromMigrationSql([
      readSql('migrations', '202_v14223_dependency_rule_runtime_publications.sql'),
      readSql('migrations', '203_v14223_wbs_template_runtime_publications.sql'),
      readSql('migrations', '264_v14231_default_master_plan_runtime_publication_asset_kind.sql'),
      readSql('migrations', '279_v14231_wbs_template_runtime_publication_runtime_rls.sql'),
    ].join('\n\n')).filter((table) => legacyTables.has(table.tableName))
    const rollbackSchema = buildExpectedSchemaFromMigrationSql(
      readSql('migrations', 'rollback', migrationName),
    ).filter((table) => legacyTables.has(table.tableName))

    expect(normalizeSqlWhitespace(rollbackSchema)).toEqual(normalizeSqlWhitespace(sourceSchema))
  })

  it('is byte-equivalent in its canonical source block before later safe migrations', () => {
    const migration = readSql('migrations', migrationName).trim()
    const clean = readSql('migrations', 'CLEAN_MIGRATION_V4.sql')
    const sourceHeader = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = clean.indexOf(sourceHeader)
    const nextSourceIndex = clean.indexOf('\n-- ============================================================\n-- Source:', sourceIndex + sourceHeader.length)
    const migration315Index = clean.indexOf('Source: 315_duration_learning_runtime_publications.sql')

    expect(sourceIndex).toBeGreaterThan(migration315Index)
    expect(nextSourceIndex).toBeGreaterThan(sourceIndex)
    expect(clean.slice(sourceIndex + sourceHeader.length, nextSourceIndex).trim()).toBe(migration)
    expect(clean.indexOf('Source: 323_duration_learning_runtime_evidence_outbox.sql')).toBeGreaterThan(sourceIndex)
    const latestBundledMigration = Math.max(
      ...Array.from(clean.matchAll(/^-- Source: (\d+)_/gm), (match) => Number(match[1])),
    )
    expect(clean.split('\n', 1)[0]).toBe(
      `-- CANONICAL: current clean bootstrap bundle, synchronized through migration ${latestBundledMigration}`,
    )
  })

  it('removes production-reachable legacy runtime services after canonical 315 wiring', () => {
    for (const relativePath of [
      'src/services/wbsTemplateRuntimePublicationService.ts',
      'src/services/constructionDependencyRuleRuntimePublicationService.ts',
      'src/services/criticalPathRuleRuntimePublicationService.ts',
      'src/__tests__/wbsTemplateRuntimePublicationService.test.ts',
      'src/__tests__/constructionDependencyRuleRuntimePublicationService.test.ts',
      'src/__tests__/criticalPathRuleRuntimePublicationService.test.ts',
    ]) {
      expect(existsSync(resolve(serverRoot, relativePath)), relativePath).toBe(false)
    }

    const registry = JSON.parse(readSql('src/registry/system-domain-registry.json')) as {
      entries?: Array<{ kind?: unknown; id?: unknown }>
    }
    const runtimeSources = [
      'src/services/algorithmAssetGovernanceWorkbenchOperationService.ts',
      'src/services/algorithmAssetIsolationMatrixService.ts',
      'src/services/domainReleaseRuntimeClosureMatrixService.ts',
      'src/services/durationLiveLearningClosureService.ts',
      'src/services/v14231ActionableSurfaceRegistryService.ts',
      'src/services/durationRuntimeConsumerObservationIntegrationService.ts',
      'src/__tests__/v14223GovernanceCiGateContract.test.ts',
    ].map((relativePath) => readSql(relativePath)).concat(JSON.stringify(
      (registry.entries ?? []).filter((entry) => entry.kind === 'service'),
    ))

    for (const source of runtimeSources) {
      expect(source).not.toMatch(/(?:wbsTemplate|constructionDependencyRule|criticalPathRule)RuntimePublicationService/)
      expect(source).not.toMatch(/(?:wbs_template|construction_dependency_rule)_runtime_(?:publications|events)/)
    }
    expect(runtimeSources.join('\n')).toContain('durationLearningRuntimePublicationService')
    expect(runtimeSources.join('\n')).toContain('duration_learning_runtime_publications')
  })

  it('requires the dedicated 322 backup and authorization session before applyMigration', () => {
    const runner = readSql('src/scripts/run-pending-migrations.ts')
    const packageJson = readSql('package.json')
    const supportPath = resolve(
      serverRoot,
      'src/scripts/durationLearningLegacyRuntimeRetirementSupport.ts',
    )
    const support = existsSync(supportPath) ? readFileSync(supportPath, 'utf8') : ''
    const branchStart = runner.indexOf(
      'if (migration.filename === DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION)',
    )
    const applyStart = runner.indexOf('await applyMigration(client, migration)', branchStart)
    const readbackStart = runner.indexOf(
      'verifyDurationLearningLegacyRuntimeRetirementReadback',
      applyStart,
    )

    expect(branchStart).toBeGreaterThan(-1)
    expect(applyStart).toBeGreaterThan(branchStart)
    expect(readbackStart).toBeGreaterThan(applyStart)
    expect(runner.slice(branchStart, applyStart)).toContain(
      'prepareDurationLearningLegacyRuntimeRetirementFromEnvironment',
    )
    expect(support).toContain('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_FILE_REQUIRED')
    expect(support).toContain('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_AUTHORIZATION_REF_REQUIRED')
    expect(support).toContain('prepareDurationLearningLegacyRuntimeRetirementFromEnvironment')
    expect(support).toContain('workbuddy.duration_learning_legacy_runtime_retirement.authorization_token')
    expect(packageJson).toContain('backup:duration-learning-legacy-runtime-retirement')
    expect(packageJson).toContain('migrate:duration-learning-legacy-runtime-retirement')
    expect(runner).toContain('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_EXPLICIT_FLAG')
    expect(runner).toContain('assertDurationLearningLegacyRuntimeRetirementInvocation')
    expect(runner).toContain('planDurationLearningLegacyRuntimeRetirementPendingPhase')
    expect(runner).toMatch(
      /pendingMigrations:\s*explicitDurationLearningRetirement\s*\?\s*allPending\s*:\s*pending/,
    )
    expect(runner).toContain('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_PHASE_BOUNDARY')
  })

  it('requires effective target validation before any destructive 322 client or file access', () => {
    const runner = readSql('src/scripts/run-pending-migrations.ts')
    const backup = readSql('src/scripts/backup-duration-learning-legacy-runtime-retirement.ts')
    const runnerParserCall = runner.lastIndexOf('parseStrictPostgresConnectionTarget(')
    const runnerClient = runner.indexOf('new Client(')
    const backupTargetValidation = backup.lastIndexOf(
      'resolveDurationLearningLegacyRuntimeRetirementTargetIdentity()',
    )
    const backupConnectionConfig = backup.indexOf('resolveMigrationRuntimeConnectionConfig()')
    const backupClient = backup.indexOf('new Client(')

    expect(runner).toContain('selectMigrationConnectionTarget')
    expect(runner).toContain('parseStrictPostgresConnectionTarget')
    expect(runnerParserCall).toBeGreaterThan(-1)
    expect(runnerParserCall).toBeLessThan(runnerClient)
    expect(backupTargetValidation).toBeGreaterThan(-1)
    expect(backupTargetValidation).toBeLessThan(backupConnectionConfig)
    expect(backupConnectionConfig).toBeLessThan(backupClient)
  })

  it('requires pooler user project refs to be gated by the effective Supabase pooler host', () => {
    const support = readSql('src/scripts/durationLearningLegacyRuntimeRetirementSupport.ts')
    const hostGate = support.indexOf('isSupabasePoolerHost(authority.host)')
    const userRefExtraction = support.indexOf('exec(authority.user)')

    expect(support).toContain('isSupabasePoolerHost')
    expect(support).toContain('parsePostgresConnectionAuthority')
    expect(hostGate).toBeGreaterThan(-1)
    expect(userRefExtraction).toBeGreaterThan(hostGate)
  })
})
