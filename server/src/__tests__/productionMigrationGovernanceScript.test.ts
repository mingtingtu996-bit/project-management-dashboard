import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runProductionMigrationGovernanceCheck } from '../scripts/check-production-migration-governance.js'
import type { ProductionMigrationGovernanceInput } from '../services/migrationProductionGovernanceService.js'

const tempRoots: string[] = []
const migration246 = '246_v14231_advisor_public_rls_closeout.sql'
const migration247 = '247_v14231_users_active_session_guard_columns.sql'
const migration252 = '252_v14231_advisor_public_rls_remaining_closeout.sql'
const migration253 = '253_v14231_advisor_public_rls_live_catalog_closeout.sql'
const migration259 = '259_v14231_supabase_advisor_security_closeout.sql'
const migration264 = '264_v14231_default_master_plan_runtime_publication_asset_kind.sql'
const migration277 = '277_v14231_algorithm_asset_candidate_experience_tier.sql'
const migration278 = '278_v14231_post277_advisor_security_rpc_acl_closeout.sql'
const requiredV14231Migrations = [migration246, migration247, migration252, migration253, migration259, migration264, migration277, migration278]

function freshGovernanceTimestamp() {
  return new Date().toISOString()
}

function createFixture(files: Record<string, string>) {
  const root = join(tmpdir(), `production-migration-governance-script-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(root, relativePath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, source)
  }
  tempRoots.push(root)
  return root
}

function writeEvidence(root: string, input: ProductionMigrationGovernanceInput) {
  const file = join(root, 'evidence.json')
  writeFileSync(file, JSON.stringify(input, null, 2))
  return file
}

function requiredMigrationFiles() {
  return Object.fromEntries(requiredV14231Migrations.map((filename) => [filename, '-- migration']))
}

function cleanBundleSource() {
  return requiredV14231Migrations.map((filename) => `-- Source: ${filename}`).join('\n')
}

function requiredMigrationRows() {
  return requiredV14231Migrations.map((filename) => ({
    filename,
    version: filename.split('_')[0],
  }))
}

function appliedRequiredMigrations() {
  return requiredV14231Migrations.map((filename) => ({
    filename,
    owner: 'db-owner',
    schemaReadback: true,
    ledgered: true,
    evidenceLinks: [`artifacts/${filename.replace(/\.sql$/, '')}-closeout.json`],
  }))
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('check-production-migration-governance script', () => {
  it('fails closed without live/admin evidence instead of treating local migrations as enough', async () => {
    const root = createFixture({
      '246_v14231_advisor_public_rls_closeout.sql': '-- migration',
      '247_v14231_users_active_session_guard_columns.sql': '-- migration',
      'CLEAN_MIGRATION_V4.sql': '-- clean bundle',
    })
    const outputs: string[] = []

    const result = await runProductionMigrationGovernanceCheck([], {
      migrationsDirectory: root,
      writeOutput: (message) => outputs.push(message),
    })

    expect(result.exitCode).toBe(1)
    expect(result.report.status).toBe('blocked')
    expect(result.report.allowScheduler).toBe(false)
    expect(outputs.join('\n')).toContain('"gate": "production-migration-governance"')
  })

  it('writes a machine-readable report when --output is provided', async () => {
    const root = createFixture({
      '246_v14231_advisor_public_rls_closeout.sql': '-- migration',
      '247_v14231_users_active_session_guard_columns.sql': '-- migration',
      'CLEAN_MIGRATION_V4.sql': '-- clean bundle',
    })
    const outputFile = join(root, 'reports', 'production-migration-governance.json')

    const result = await runProductionMigrationGovernanceCheck(['--output', outputFile], {
      migrationsDirectory: root,
    })

    expect(result.exitCode).toBe(1)
    expect(existsSync(outputFile)).toBe(true)
    const written = JSON.parse(readFileSync(outputFile, 'utf8'))
    expect(written).toEqual(expect.objectContaining({
      gate: 'production-migration-governance',
      status: 'blocked',
    }))
  })

  it('rejects malformed evidence files before producing a false closeout report', async () => {
    const root = createFixture({
      'evidence.json': '[]',
    })

    await expect(runProductionMigrationGovernanceCheck(['--evidence-file', join(root, 'evidence.json')], {
      migrationsDirectory: root,
    })).rejects.toThrow('production migration governance evidence file must be a JSON object')
  })

  it('returns exit code zero only when the mocked closeout evidence closes all gates', async () => {
    const root = createFixture({
      ...requiredMigrationFiles(),
      'CLEAN_MIGRATION_V4.sql': cleanBundleSource(),
    })
    const evidenceFile = writeEvidence(root, {
      inventoryFrozen: true,
      inventorySnapshot: {
        gitCommit: 'test-commit',
        imageDigest: 'sha256:test-image',
        executedAt: freshGovernanceTimestamp(),
        operator: 'script-test',
      },
      remoteMigrations: requiredMigrationRows(),
      cleanBundle: {
        present: true,
        filename: 'CLEAN_MIGRATION_V4.sql',
        includedFilenames: requiredV14231Migrations,
      },
      ledger: {
        available: true,
        rowCount: 277,
        rows: requiredMigrationRows(),
      },
      liveCatalog: {
        baselineObjectCount: 2,
        baselineObjects: ['project_key_node_snapshots', 'users'],
      },
      privilegedProbe: {
        attempted: true,
        ok: true,
        migrationUrlConfigured: true,
        runtimeUrlSeparated: true,
        currentUser: 'migration_admin',
        sessionUser: 'migration_admin',
        rolBypassRls: true,
        pgIsInRecovery: false,
      },
      requiredMigrations: appliedRequiredMigrations(),
      schemaDrift: {
        unexplainedDriftCount: 0,
        orphanLedgerRows: [],
        duplicateVersions: [],
        checksumDriftRows: [],
        missingMigrationFiles: [],
        retiredColumnHardReads: [],
      },
      dropCandidateInventory: {
        evaluated: true,
        noCandidates: true,
        source: 'script-test retired-object audit + legacy-object-drop guard',
        generatedAt: freshGovernanceTimestamp(),
        operator: 'script-test',
        artifactPath: 'artifacts/script-test-drop-candidate-inventory.json',
      },
      dropCandidates: [],
      closeoutReadback: {
        schemaMigrationsRowCount: 277,
        keyMigrationsLedgered: requiredV14231Migrations,
        keyCatalogMatches: true,
        apiSmokePass: true,
        postgresErrorsStable: true,
        advisorPass: true,
        allowValidate: true,
        allowWarmup: true,
        allowScheduler: true,
      },
    })

    const result = await runProductionMigrationGovernanceCheck(['--evidence-file', evidenceFile], {
      migrationsDirectory: root,
    })

    expect(result.exitCode).toBe(0)
    expect(result.report.status).toBe('closed')
    expect(result.report.allowScheduler).toBe(true)
  })

  it('does not close MG-07 when catalog readback exists but Advisor rescan is not evidenced', async () => {
    const root = createFixture({
      ...requiredMigrationFiles(),
      'CLEAN_MIGRATION_V4.sql': cleanBundleSource(),
    })
    const evidenceFile = writeEvidence(root, {
      inventoryFrozen: true,
      inventorySnapshot: {
        gitCommit: 'test-commit',
        imageDigest: 'sha256:test-image',
        executedAt: freshGovernanceTimestamp(),
        operator: 'script-test',
      },
      remoteMigrations: requiredMigrationRows(),
      cleanBundle: {
        present: true,
        filename: 'CLEAN_MIGRATION_V4.sql',
        includedFilenames: requiredV14231Migrations,
      },
      ledger: {
        available: true,
        rowCount: 277,
        rows: requiredMigrationRows(),
      },
      liveCatalog: {
        baselineObjectCount: 3,
        baselineObjects: ['project_key_node_snapshots', 'users', 'notification_user_states'],
      },
      privilegedProbe: {
        attempted: true,
        ok: true,
        migrationUrlConfigured: true,
        runtimeUrlSeparated: true,
        currentUser: 'migration_admin',
        sessionUser: 'migration_admin',
        rolBypassRls: true,
        pgIsInRecovery: false,
      },
      requiredMigrations: appliedRequiredMigrations(),
      schemaDrift: {
        unexplainedDriftCount: 0,
        orphanLedgerRows: [],
        duplicateVersions: [],
        checksumDriftRows: [],
        missingMigrationFiles: [],
        retiredColumnHardReads: [],
      },
      dropCandidateInventory: {
        evaluated: true,
        noCandidates: true,
        source: 'script-test retired-object audit + legacy-object-drop guard',
        generatedAt: freshGovernanceTimestamp(),
        operator: 'script-test',
        artifactPath: 'artifacts/script-test-drop-candidate-inventory.json',
      },
      dropCandidates: [],
      closeoutReadback: {
        schemaMigrationsRowCount: 277,
        keyMigrationsLedgered: requiredV14231Migrations,
        keyCatalogMatches: true,
        apiSmokePass: true,
        postgresErrorsStable: true,
        advisorPass: false,
        allowValidate: true,
        allowWarmup: false,
        allowScheduler: false,
      },
    })

    const result = await runProductionMigrationGovernanceCheck(['--evidence-file', evidenceFile], {
      migrationsDirectory: root,
    })

    expect(result.exitCode).toBe(1)
    expect(result.report.status).toBe('ready_for_closeout_readback')
    expect(result.report.allowValidate).toBe(true)
    expect(result.report.allowWarmup).toBe(false)
    expect(result.report.allowScheduler).toBe(false)
    expect(result.report.gates.find((gate) => gate.id === 'MG-07')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: ['live_advisor_rescan_missing'],
    }))
  })

  it('uses the current local migration scan over stale evidence inventory', async () => {
    const root = createFixture({
      '246_v14231_advisor_public_rls_closeout.sql': '-- migration',
      '247_v14231_users_active_session_guard_columns.sql': '-- migration',
      '248_v14231_current_local_hardening.sql': '-- migration',
      'CLEAN_MIGRATION_V4.sql': [
        '-- Source: 246_v14231_advisor_public_rls_closeout.sql',
        '-- Source: 247_v14231_users_active_session_guard_columns.sql',
      ].join('\n'),
    })
    const evidenceFile = writeEvidence(root, {
      inventoryFrozen: true,
      inventorySnapshot: {
        gitCommit: 'test-commit',
        imageDigest: 'sha256:test-image',
        executedAt: freshGovernanceTimestamp(),
        operator: 'script-test',
      },
      localMigrations: [
        { filename: '246_v14231_advisor_public_rls_closeout.sql', version: '246' },
        { filename: '247_v14231_users_active_session_guard_columns.sql', version: '247' },
      ],
      remoteMigrations: [
        { filename: '246_v14231_advisor_public_rls_closeout.sql', version: '246' },
        { filename: '247_v14231_users_active_session_guard_columns.sql', version: '247' },
      ],
      cleanBundle: {
        present: true,
        filename: 'CLEAN_MIGRATION_V4.sql',
        includedFilenames: [
          '246_v14231_advisor_public_rls_closeout.sql',
          '247_v14231_users_active_session_guard_columns.sql',
        ],
      },
      ledger: {
        available: true,
        rowCount: 247,
        rows: [
          { filename: '246_v14231_advisor_public_rls_closeout.sql', version: '246' },
          { filename: '247_v14231_users_active_session_guard_columns.sql', version: '247' },
        ],
      },
      liveCatalog: {
        baselineObjectCount: 2,
        baselineObjects: ['project_key_node_snapshots', 'users'],
      },
      privilegedProbe: {
        attempted: true,
        ok: true,
        migrationUrlConfigured: true,
        runtimeUrlSeparated: true,
        currentUser: 'migration_admin',
        sessionUser: 'migration_admin',
        rolBypassRls: true,
        pgIsInRecovery: false,
      },
      requiredMigrations: [
        {
          filename: '246_v14231_advisor_public_rls_closeout.sql',
          owner: 'db-owner',
          schemaReadback: true,
          ledgered: true,
          evidenceLinks: ['artifacts/246-closeout.json'],
        },
        {
          filename: '247_v14231_users_active_session_guard_columns.sql',
          owner: 'db-owner',
          schemaReadback: true,
          ledgered: true,
          evidenceLinks: ['artifacts/247-closeout.json'],
        },
      ],
      schemaDrift: {
        unexplainedDriftCount: 0,
        orphanLedgerRows: [],
        duplicateVersions: [],
        checksumDriftRows: [],
        missingMigrationFiles: [],
        retiredColumnHardReads: [],
      },
      dropCandidateInventory: {
        evaluated: true,
        noCandidates: true,
        source: 'script-test retired-object audit + legacy-object-drop guard',
        generatedAt: freshGovernanceTimestamp(),
        operator: 'script-test',
      },
      dropCandidates: [],
      closeoutReadback: {
        schemaMigrationsRowCount: 247,
        keyMigrationsLedgered: [
          '246_v14231_advisor_public_rls_closeout.sql',
          '247_v14231_users_active_session_guard_columns.sql',
        ],
        keyCatalogMatches: true,
        apiSmokePass: true,
        postgresErrorsStable: true,
        advisorPass: true,
        allowValidate: true,
        allowWarmup: true,
        allowScheduler: true,
      },
    })

    const result = await runProductionMigrationGovernanceCheck(['--evidence-file', evidenceFile], {
      migrationsDirectory: root,
    })

    expect(result.exitCode).toBe(1)
    expect(result.report.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filename: '248_v14231_current_local_hardening.sql',
        classification: 'not_applied_forward_apply',
      }),
    ]))
    expect(result.report.gates.find((gate) => gate.id === 'MG-01')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining([
        '248_v14231_current_local_hardening.sql:clean_bundle_entry_missing',
      ]),
    }))
    expect(result.report.gates.find((gate) => gate.id === 'MG-05')).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: expect.arrayContaining([
        '248_v14231_current_local_hardening.sql:forward_apply_plan_required',
      ]),
    }))
  })
})
