import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import {
  DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_SNAPSHOT_SQL,
  assertDurationLearningLegacyRuntimeRetirementInvocation,
  calculateDurationLearningLegacyRuntimeRetirementBackupSha256,
  captureDurationLearningLegacyRuntimeRetirementBackup,
  prepareDurationLearningLegacyRuntimeRetirementFromEnvironment,
  planDurationLearningLegacyRuntimeRetirementPendingPhase,
  resolveDurationLearningLegacyRuntimeRetirementTargetIdentity,
  serializeDurationLearningLegacyRuntimeRetirementBackup,
  validateDurationLearningLegacyRuntimeRetirementBackup,
  verifyDurationLearningLegacyRuntimeRetirementReadback,
} from '../scripts/durationLearningLegacyRuntimeRetirementSupport.js'

const targetIdentity = {
  supabaseProjectRef: 'xemqmqpifsstkovbkatp',
  targetEnvironment: 'staging' as const,
}

const state = {
  retirement_key: 'duration_learning_legacy_runtime_v1',
  retirement_status: 'archived_ready_for_explicit_322_authorization',
  source_wbs_publication_count: 2,
  source_wbs_event_count: 20,
  source_dependency_publication_count: 0,
  source_dependency_event_count: 0,
  unsupported_wbs_publication_count: 0,
  archived_row_count: 22,
  default_master_plan_mapping_count: 2,
  source_data_fingerprint: 'a'.repeat(64),
  archive_data_fingerprint: 'a'.repeat(64),
  mapping_fingerprint: 'b'.repeat(64),
  manifest_fingerprint: 'c'.repeat(64),
  source_tables_present: true,
  wbs_publications_present: true,
  wbs_events_present: true,
  dependency_publications_present: true,
  dependency_events_present: true,
  preflight_signal: 'ready_for_explicit_322_authorization',
}

const archiveRows = Array.from({ length: 22 }, (_, index) => ({
  source_relation: index < 2
    ? 'wbs_template_runtime_publications'
    : 'wbs_template_runtime_events',
  source_row_id: `row-${index}`,
  source_row: { id: `row-${index}` },
}))

const mappings = Array.from({ length: 2 }, (_, index) => ({
  legacy_source_id: `row-${index}`,
  legacy_asset_kind: 'default_master_plan',
  mapping_kind: 'legacy_default_master_plan_source_consumer_lineage',
}))

const snapshotRow = {
  retirement_state: state,
  archive_rows: archiveRows,
  default_master_plan_mappings: mappings,
}

function captureQuery() {
  return vi.fn(async (sql: string) => {
    if (sql.includes('current_database()')) {
      return { rows: [{ database_name: 'postgres', current_user_name: 'migration_user' }] }
    }
    if (sql.includes("WHERE version = '315'")) {
      return {
        rows: [{
          filename: '315_duration_learning_runtime_publications.sql',
          checksum: 'd'.repeat(64),
        }],
      }
    }
    if (sql === DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_SNAPSHOT_SQL) {
      return { rows: [snapshotRow] }
    }
    return { rows: [] }
  })
}

const targetEnv = {
  DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_FILE: 'C:/tmp/backup-322.json',
  DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_AUTHORIZATION_REF: 'change:WB-322-approved',
  SUPABASE_URL: 'https://xemqmqpifsstkovbkatp.supabase.co',
  DATABASE_URL: 'postgresql://postgres.xemqmqpifsstkovbkatp:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
  DEPLOY_TARGET: 'staging',
}

describe('duration learning legacy runtime retirement support', () => {
  it('defers only exact 322 while an ordinary sweep executes safe migrations on both sides', () => {
    const phase = planDurationLearningLegacyRuntimeRetirementPendingPhase({
      pendingMigrations: [
        { filename: '315_duration_learning_runtime_publications.sql' },
        { filename: '322_duration_learning_legacy_runtime_retirement.sql' },
        { filename: '323_duration_learning_runtime_evidence_outbox.sql' },
      ],
      explicitRetirementRequested: false,
    })

    expect(phase.status).toBe('explicit_322_retirement_required')
    expect(phase.executableMigrations.map((migration) => migration.filename)).toEqual([
      '315_duration_learning_runtime_publications.sql',
      '323_duration_learning_runtime_evidence_outbox.sql',
    ])
    expect(phase.deferredMigrations.map((migration) => migration.filename)).toEqual([
      '322_duration_learning_legacy_runtime_retirement.sql',
    ])
  })

  it('fails closed when dedicated retirement still sees pending migrations besides exact 322', () => {
    expect(() => planDurationLearningLegacyRuntimeRetirementPendingPhase({
      pendingMigrations: [
        { filename: '322_duration_learning_legacy_runtime_retirement.sql' },
        { filename: '323_duration_learning_runtime_evidence_outbox.sql' },
      ],
      explicitRetirementRequested: true,
    })).toThrow('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_EXACT_PENDING_SET_REQUIRED')
  })

  it('selects exact 322 after safe post-322 migrations are already ledgered', () => {
    const phase = planDurationLearningLegacyRuntimeRetirementPendingPhase({
      pendingMigrations: [
        { filename: '322_duration_learning_legacy_runtime_retirement.sql' },
      ],
      explicitRetirementRequested: true,
    })

    expect(phase.status).toBe('explicit_322_retirement_selected')
    expect(phase.executableMigrations).toEqual([
      { filename: '322_duration_learning_legacy_runtime_retirement.sql' },
    ])
    expect(phase.deferredMigrations).toEqual([])
  })

  it('allows only the dedicated exact-322 selector and validates its environment before connection', () => {
    expect(() => assertDurationLearningLegacyRuntimeRetirementInvocation({
      explicitRetirementRequested: false,
      onlyMigrationSelector: '322',
      isPlanMode: false,
      env: targetEnv,
    })).toThrow('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_DEDICATED_COMMAND_REQUIRED')
    expect(() => assertDurationLearningLegacyRuntimeRetirementInvocation({
      explicitRetirementRequested: true,
      onlyMigrationSelector: '321',
      isPlanMode: false,
      env: targetEnv,
    })).toThrow('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_EXACT_SELECTOR_REQUIRED')
    expect(() => assertDurationLearningLegacyRuntimeRetirementInvocation({
      explicitRetirementRequested: true,
      onlyMigrationSelector: '322',
      isPlanMode: false,
      env: {},
    })).toThrow('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_FILE_REQUIRED')

    expect(assertDurationLearningLegacyRuntimeRetirementInvocation({
      explicitRetirementRequested: true,
      onlyMigrationSelector: '322',
      isPlanMode: false,
      env: targetEnv,
    })).toEqual(expect.objectContaining({
      dedicatedExecution: true,
      backupPath: 'C:/tmp/backup-322.json',
      authorizationRef: 'change:WB-322-approved',
      targetIdentity,
    }))
  })

  it('lets ordinary pending execution resume after 322 is absent from the pending set', () => {
    const phase = planDurationLearningLegacyRuntimeRetirementPendingPhase({
      pendingMigrations: [{ filename: '323_after_retirement.sql' }],
      explicitRetirementRequested: false,
    })

    expect(phase.status).toBe('ordinary_pending_ready')
    expect(phase.executableMigrations).toEqual([{ filename: '323_after_retirement.sql' }])
    expect(phase.deferredMigrations).toEqual([])
  })

  it('rejects direct and pooler connection identity overrides before backup or database access', async () => {
    const expectedProjectRef = 'xemqmqpifsstkovbkatp'
    const otherProjectRef = 'bbbbbbbbbbbbbbbbbbbb'
    const overrideEnvironments = [
      {
        ...targetEnv,
        DATABASE_URL:
          `postgresql://postgres:secret@db.${expectedProjectRef}.supabase.co:5432/postgres`
          + `?host=db.${otherProjectRef}.supabase.co`,
      },
      {
        ...targetEnv,
        DATABASE_URL:
          `postgresql://postgres.${expectedProjectRef}:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`
          + `?user=postgres.${otherProjectRef}`,
      },
      {
        ...targetEnv,
        DATABASE_URL:
          `postgresql://postgres.${expectedProjectRef}:secret@evil.example:5432/postgres`,
      },
    ]

    for (const env of overrideEnvironments) {
      expect(() => resolveDurationLearningLegacyRuntimeRetirementTargetIdentity(env))
        .toThrow(/connection query parameter|effective target|project[_ ]unresolved/i)

      const query = vi.fn(async () => ({ rows: [] }))
      const readTextFile = vi.fn(async () => '')
      await expect(prepareDurationLearningLegacyRuntimeRetirementFromEnvironment(
        query,
        env,
        readTextFile,
      )).rejects.toThrow(/connection query parameter|effective target|project[_ ]unresolved/i)
      expect(readTextFile).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
    }
  })

  it('verifies the committed 322 ledger and exact retired readback before reporting completion', async () => {
    const query = vi.fn(async (_sql: string) => ({
      rows: [{
        retirement_ledgered: true,
        retirement_status: 'retired_readback_complete',
        preflight_signal: 'retired_readback_complete',
        source_tables_present: false,
        wbs_publications_present: false,
        wbs_events_present: false,
        dependency_publications_present: false,
        dependency_events_present: false,
        retirement_backup_sha256: 'd'.repeat(64),
        source_data_fingerprint: 'a'.repeat(64),
        retired_source_data_fingerprint: 'a'.repeat(64),
      }],
    }))

    await expect(verifyDurationLearningLegacyRuntimeRetirementReadback(query)).resolves.toEqual(
      expect.objectContaining({ status: 'retired_readback_complete', ledgered: true }),
    )
    expect(query.mock.calls[0]?.[0]).toContain("filename = '322_duration_learning_legacy_runtime_retirement.sql'")
  })

  it('fails the dedicated 322 readback when the ledger or retired state is incomplete', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        retirement_ledgered: false,
        retirement_status: 'archived_ready_for_explicit_322_authorization',
        preflight_signal: 'ready_for_explicit_322_authorization',
        source_tables_present: true,
      }],
    }))

    await expect(verifyDurationLearningLegacyRuntimeRetirementReadback(query)).rejects.toThrow(
      'DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_READBACK_INCOMPLETE',
    )
  })

  it('captures and validates an exact repeatable-read archive backup bound to migration 315', async () => {
    const query = captureQuery()
    const backup = await captureDurationLearningLegacyRuntimeRetirementBackup(query, {
      generatedAt: '2026-07-19T00:00:00.000Z',
      targetIdentity,
    })
    const serialized = serializeDurationLearningLegacyRuntimeRetirementBackup(backup)
    const sha256 = calculateDurationLearningLegacyRuntimeRetirementBackupSha256(serialized)

    expect(query.mock.calls[0]?.[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    expect(backup.retirementState).toEqual(state)
    expect(backup.archiveRows).toHaveLength(22)
    expect(backup.defaultMasterPlanMappings).toHaveLength(2)
    expect(validateDurationLearningLegacyRuntimeRetirementBackup(serialized, sha256)).toEqual(backup)
    expect(() => validateDurationLearningLegacyRuntimeRetirementBackup(`${serialized} `, sha256))
      .toThrow('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_CHECKSUM_MISMATCH')
  })

  it('fails before file or database access when an ordinary pending sweep lacks 322 authorization', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const readTextFile = vi.fn(async () => '')

    await expect(prepareDurationLearningLegacyRuntimeRetirementFromEnvironment(
      query,
      {},
      readTextFile,
    )).rejects.toThrow('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_FILE_REQUIRED')
    await expect(prepareDurationLearningLegacyRuntimeRetirementFromEnvironment(
      query,
      { DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_FILE: 'C:/tmp/backup.json' },
      readTextFile,
    )).rejects.toThrow('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_AUTHORIZATION_REF_REQUIRED')

    expect(readTextFile).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it('binds the exact backup, target, fingerprints and authorization token before 322 apply', async () => {
    const capture = captureQuery()
    const backup = await captureDurationLearningLegacyRuntimeRetirementBackup(capture, {
      generatedAt: '2026-07-19T00:00:00.000Z',
      targetIdentity,
    })
    const serialized = serializeDurationLearningLegacyRuntimeRetirementBackup(backup)
    const sha256 = calculateDurationLearningLegacyRuntimeRetirementBackupSha256(serialized)
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('current_database()')) {
        return { rows: [{ database_name: 'postgres', current_user_name: 'migration_user' }] }
      }
      if (sql === DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_SNAPSHOT_SQL) {
        return { rows: [snapshotRow] }
      }
      return { rows: [] }
    })
    const readTextFile = vi.fn(async (path: string) => (
      path.endsWith('.sha256') ? `${sha256}  backup-322.json\n` : serialized
    ))

    const result = await prepareDurationLearningLegacyRuntimeRetirementFromEnvironment(
      query,
      targetEnv,
      readTextFile,
    )
    const expectedToken = createHash('sha256').update(
      `322:change:WB-322-approved:${sha256}:${state.source_data_fingerprint}:${state.manifest_fingerprint}`,
      'utf8',
    ).digest('hex')

    expect(result.authorizationToken).toBe(expectedToken)
    const queryCalls = query.mock.calls as unknown as Array<[string, unknown[]]>
    const settings = queryCalls.filter(([sql]) => sql === 'SELECT set_config($1, $2, FALSE)')
    expect(settings).toHaveLength(5)
    expect(settings.map(([, values]) => values)).toEqual(expect.arrayContaining([
      ['workbuddy.duration_learning_legacy_runtime_retirement.authorization_ref', 'change:WB-322-approved'],
      ['workbuddy.duration_learning_legacy_runtime_retirement.authorization_token', expectedToken],
      ['workbuddy.duration_learning_legacy_runtime_retirement.backup_sha256', sha256],
      ['workbuddy.duration_learning_legacy_runtime_retirement.data_fingerprint', state.source_data_fingerprint],
      ['workbuddy.duration_learning_legacy_runtime_retirement.manifest_fingerprint', state.manifest_fingerprint],
    ]))
  })

  it('rejects a changed retirement snapshot before setting any authorization value', async () => {
    const capture = captureQuery()
    const backup = await captureDurationLearningLegacyRuntimeRetirementBackup(capture, {
      generatedAt: '2026-07-19T00:00:00.000Z',
      targetIdentity,
    })
    const serialized = serializeDurationLearningLegacyRuntimeRetirementBackup(backup)
    const sha256 = calculateDurationLearningLegacyRuntimeRetirementBackupSha256(serialized)
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('current_database()')) {
        return { rows: [{ database_name: 'postgres', current_user_name: 'migration_user' }] }
      }
      if (sql === DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_SNAPSHOT_SQL) {
        return {
          rows: [{
            ...snapshotRow,
            retirement_state: { ...state, manifest_fingerprint: 'e'.repeat(64) },
          }],
        }
      }
      return { rows: [] }
    })
    const readTextFile = vi.fn(async (path: string) => (
      path.endsWith('.sha256') ? `${sha256}\n` : serialized
    ))

    await expect(prepareDurationLearningLegacyRuntimeRetirementFromEnvironment(
      query,
      targetEnv,
      readTextFile,
    )).rejects.toThrow('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_PREFLIGHT_CHANGED:manifest_fingerprint')
    expect(query.mock.calls.some(([sql]) => sql === 'SELECT set_config($1, $2, FALSE)')).toBe(false)
  })
})
