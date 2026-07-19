import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { selectMigrationConnectionTarget } from '../services/migrationRunner.js'

export const DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION =
  '322_duration_learning_legacy_runtime_retirement.sql'
export const DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_EXPLICIT_FLAG =
  '--duration-learning-legacy-runtime-retirement'

type PendingMigration = { filename: string }

export function planDurationLearningLegacyRuntimeRetirementPendingPhase<
  T extends PendingMigration,
>(input: {
  pendingMigrations: readonly T[]
  explicitRetirementRequested: boolean
}) {
  const pendingMigrations = [...input.pendingMigrations]
  const retirementIndex = pendingMigrations.findIndex((migration) => (
    migration.filename === DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION
  ))
  if (input.explicitRetirementRequested) {
    const unexpected = pendingMigrations.filter((migration) => (
      migration.filename !== DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION
    ))
    if (unexpected.length > 0) {
      throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_EXACT_PENDING_SET_REQUIRED')
    }
    return {
      status: 'explicit_322_retirement_selected' as const,
      executableMigrations: pendingMigrations,
      deferredMigrations: [] as T[],
    }
  }
  if (retirementIndex < 0) {
    return {
      status: 'ordinary_pending_ready' as const,
      executableMigrations: pendingMigrations,
      deferredMigrations: [] as T[],
    }
  }
  return {
    status: 'explicit_322_retirement_required' as const,
    executableMigrations: pendingMigrations.slice(0, retirementIndex),
    deferredMigrations: pendingMigrations.slice(retirementIndex),
  }
}

export type DurationLearningLegacyRuntimeRetirementTargetIdentity = {
  supabaseProjectRef: string
  targetEnvironment: 'staging' | 'production'
}

type RetirementEnv = Record<string, string | undefined>
type QueryResult = { rows: any[] }
export type DurationLearningLegacyRuntimeRetirementQuery = (
  sql: string,
  values?: unknown[],
) => Promise<QueryResult>

type RetirementState = {
  retirement_key: 'duration_learning_legacy_runtime_v1'
  retirement_status: 'archived_ready_for_explicit_322_authorization'
  source_wbs_publication_count: number
  source_wbs_event_count: number
  source_dependency_publication_count: number
  source_dependency_event_count: number
  unsupported_wbs_publication_count: number
  archived_row_count: number
  default_master_plan_mapping_count: number
  source_data_fingerprint: string
  archive_data_fingerprint: string
  mapping_fingerprint: string
  manifest_fingerprint: string
  source_tables_present: true
  wbs_publications_present: true
  wbs_events_present: true
  dependency_publications_present: true
  dependency_events_present: true
  preflight_signal: 'ready_for_explicit_322_authorization'
}

export type DurationLearningLegacyRuntimeRetirementBackup = {
  schemaVersion: 'workbuddy/duration-learning-legacy-runtime-retirement-backup/v1'
  migrationFilename: typeof DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION
  generatedAt: string
  databaseIdentity: {
    database_name: string
    current_user_name: string
    supabase_project_ref: string
    target_environment: 'staging' | 'production'
  }
  sourceMigrationLedger: Array<{ filename: string; checksum: string }>
  retirementState: RetirementState
  archiveRows: Array<Record<string, unknown>>
  defaultMasterPlanMappings: Array<Record<string, unknown>>
}

export const DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_SNAPSHOT_SQL = `
  SELECT to_jsonb(readback) AS retirement_state,
         (
           SELECT COALESCE(jsonb_agg(to_jsonb(archive) ORDER BY archive.source_relation, archive.source_row_id), '[]'::jsonb)
           FROM public.duration_learning_legacy_runtime_row_archive archive
         ) AS archive_rows,
         (
           SELECT COALESCE(jsonb_agg(to_jsonb(mapping) ORDER BY mapping.legacy_source_id), '[]'::jsonb)
           FROM public.duration_learning_legacy_default_master_plan_mappings mapping
           WHERE mapping.mapping_kind = 'legacy_default_master_plan_source_consumer_lineage'
         ) AS default_master_plan_mappings
  FROM public.duration_learning_legacy_runtime_retirement_readback readback
  WHERE readback.retirement_key = 'duration_learning_legacy_runtime_v1'
`

function text(value: unknown) {
  return String(value ?? '').trim()
}

function integer(value: unknown, code: string) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) throw new Error(code)
  return number
}

function fingerprint(value: unknown, code: string) {
  const normalized = text(value).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(code)
  return normalized
}

function records(value: unknown, code: string) {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error(code)
  }
  return value as Array<Record<string, unknown>>
}

function boolean(value: unknown) {
  return value === true || value === 'true'
}

function normalizeRetirementState(value: unknown): RetirementState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_STATE_REQUIRED')
  }
  const state = value as Record<string, unknown>
  const normalized = {
    retirement_key: text(state.retirement_key),
    retirement_status: text(state.retirement_status),
    source_wbs_publication_count: integer(
      state.source_wbs_publication_count,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_WBS_PUBLICATION_COUNT_INVALID',
    ),
    source_wbs_event_count: integer(
      state.source_wbs_event_count,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_WBS_EVENT_COUNT_INVALID',
    ),
    source_dependency_publication_count: integer(
      state.source_dependency_publication_count,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_DEPENDENCY_PUBLICATION_COUNT_INVALID',
    ),
    source_dependency_event_count: integer(
      state.source_dependency_event_count,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_DEPENDENCY_EVENT_COUNT_INVALID',
    ),
    unsupported_wbs_publication_count: integer(
      state.unsupported_wbs_publication_count,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_UNSUPPORTED_WBS_COUNT_INVALID',
    ),
    archived_row_count: integer(
      state.archived_row_count,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_ARCHIVE_COUNT_INVALID',
    ),
    default_master_plan_mapping_count: integer(
      state.default_master_plan_mapping_count,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_MAPPING_COUNT_INVALID',
    ),
    source_data_fingerprint: fingerprint(
      state.source_data_fingerprint,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_SOURCE_FINGERPRINT_INVALID',
    ),
    archive_data_fingerprint: fingerprint(
      state.archive_data_fingerprint,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_ARCHIVE_FINGERPRINT_INVALID',
    ),
    mapping_fingerprint: fingerprint(
      state.mapping_fingerprint,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_MAPPING_FINGERPRINT_INVALID',
    ),
    manifest_fingerprint: fingerprint(
      state.manifest_fingerprint,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_MANIFEST_FINGERPRINT_INVALID',
    ),
    source_tables_present: boolean(state.source_tables_present),
    wbs_publications_present: boolean(state.wbs_publications_present),
    wbs_events_present: boolean(state.wbs_events_present),
    dependency_publications_present: boolean(state.dependency_publications_present),
    dependency_events_present: boolean(state.dependency_events_present),
    preflight_signal: text(state.preflight_signal),
  }

  if (
    normalized.retirement_key !== 'duration_learning_legacy_runtime_v1'
    || normalized.retirement_status !== 'archived_ready_for_explicit_322_authorization'
    || normalized.preflight_signal !== 'ready_for_explicit_322_authorization'
    || !normalized.source_tables_present
    || !normalized.wbs_publications_present
    || !normalized.wbs_events_present
    || !normalized.dependency_publications_present
    || !normalized.dependency_events_present
  ) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_STATE_NOT_READY')
  }
  if (
    normalized.unsupported_wbs_publication_count !== 0
    || normalized.source_dependency_publication_count !== 0
    || normalized.source_dependency_event_count !== 0
  ) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_SOURCE_NOT_RETIRABLE')
  }
  if (normalized.source_data_fingerprint !== normalized.archive_data_fingerprint) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_ARCHIVE_FINGERPRINT_MISMATCH')
  }
  return normalized as RetirementState
}

function assertBackupRows(
  state: RetirementState,
  archiveRows: Array<Record<string, unknown>>,
  mappings: Array<Record<string, unknown>>,
) {
  const sourceTotal = state.source_wbs_publication_count
    + state.source_wbs_event_count
    + state.source_dependency_publication_count
    + state.source_dependency_event_count
  if (archiveRows.length !== state.archived_row_count || archiveRows.length !== sourceTotal) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_ARCHIVE_COUNT_MISMATCH')
  }
  if (
    mappings.length !== state.default_master_plan_mapping_count
    || mappings.length !== state.source_wbs_publication_count
  ) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_MAPPING_COUNT_MISMATCH')
  }
  if (mappings.some((mapping) => (
    text(mapping.legacy_asset_kind) !== 'default_master_plan'
    || text(mapping.mapping_kind) !== 'legacy_default_master_plan_source_consumer_lineage'
  ))) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_MAPPING_CLASSIFICATION_INVALID')
  }
}

function assertTargetIdentity(
  value: DurationLearningLegacyRuntimeRetirementTargetIdentity,
): DurationLearningLegacyRuntimeRetirementTargetIdentity {
  const supabaseProjectRef = text(value?.supabaseProjectRef).toLowerCase()
  const targetEnvironment = text(value?.targetEnvironment)
  if (!/^[a-z0-9]{20}$/.test(supabaseProjectRef)) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_TARGET_PROJECT_REF_REQUIRED')
  }
  if (targetEnvironment !== 'staging' && targetEnvironment !== 'production') {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_TARGET_ENVIRONMENT_REQUIRED')
  }
  return { supabaseProjectRef, targetEnvironment }
}

function projectRefFromSupabaseUrl(value: string | undefined) {
  try {
    const host = new URL(text(value)).hostname.toLowerCase()
    return /^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1] ?? null
  } catch {
    return null
  }
}

function projectRefsFromSelectedTarget(env: RetirementEnv) {
  const selected = selectMigrationConnectionTarget(env)
  if (selected.mode === 'connection_string') {
    try {
      const url = new URL(selected.connectionString)
      const direct = /^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname.toLowerCase())?.[1]
      const pooler = /(?:^|\.)([a-z0-9]{20})$/i.exec(decodeURIComponent(url.username))?.[1]?.toLowerCase()
      return [direct, pooler].filter((value): value is string => Boolean(value))
    } catch {
      return []
    }
  }
  const host = text(selected.host).toLowerCase()
  const direct = /^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1]
  const pooler = /(?:^|\.)pooler\.supabase\.(?:com|co)$/.test(host)
    ? /(?:^|\.)([a-z0-9]{20})$/i.exec(text(selected.user))?.[1]?.toLowerCase()
    : null
  return [direct, pooler].filter((value): value is string => Boolean(value))
}

export function resolveDurationLearningLegacyRuntimeRetirementTargetIdentity(
  env: RetirementEnv = process.env,
) {
  const expected = projectRefFromSupabaseUrl(env.SUPABASE_URL)
  if (!expected) throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_EXPECTED_PROJECT_UNRESOLVED')
  const actual = [...new Set(projectRefsFromSelectedTarget(env))]
  if (actual.length === 0) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_TARGET_PROJECT_UNRESOLVED')
  }
  if (actual.length !== 1 || actual[0] !== expected) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_TARGET_PROJECT_MISMATCH')
  }
  return assertTargetIdentity({
    supabaseProjectRef: actual[0],
    targetEnvironment: text(env.WORKBUDDY_TARGET_ENVIRONMENT ?? env.DEPLOY_TARGET) as 'staging' | 'production',
  })
}

function snapshotFromRow(row: Record<string, unknown> | undefined) {
  const state = normalizeRetirementState(row?.retirement_state)
  const archiveRows = records(
    row?.archive_rows,
    'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_ARCHIVE_ROWS_INVALID',
  )
  const mappings = records(
    row?.default_master_plan_mappings,
    'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_MAPPING_ROWS_INVALID',
  )
  assertBackupRows(state, archiveRows, mappings)
  return { state, archiveRows, mappings }
}

export async function captureDurationLearningLegacyRuntimeRetirementBackup(
  query: DurationLearningLegacyRuntimeRetirementQuery,
  options: {
    generatedAt?: string
    targetIdentity: DurationLearningLegacyRuntimeRetirementTargetIdentity
  },
): Promise<DurationLearningLegacyRuntimeRetirementBackup> {
  const targetIdentity = assertTargetIdentity(options.targetIdentity)
  await query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const identity = await query(`
      SELECT current_database() AS database_name,
             current_user AS current_user_name
    `)
    const ledger = await query(`
      SELECT filename, checksum
      FROM public.schema_migrations
      WHERE version = '315'
        AND filename = '315_duration_learning_runtime_publications.sql'
      ORDER BY filename
    `)
    const snapshotResult = await query(DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_SNAPSHOT_SQL)
    const databaseIdentity = identity.rows[0]
    if (!text(databaseIdentity?.database_name) || !text(databaseIdentity?.current_user_name)) {
      throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_DATABASE_IDENTITY_MISSING')
    }
    if (ledger.rows.length !== 1 || !fingerprint(
      ledger.rows[0]?.checksum,
      'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_315_CHECKSUM_INVALID',
    )) {
      throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_315_LEDGER_REQUIRED')
    }
    const snapshot = snapshotFromRow(snapshotResult.rows[0])
    const backup: DurationLearningLegacyRuntimeRetirementBackup = {
      schemaVersion: 'workbuddy/duration-learning-legacy-runtime-retirement-backup/v1',
      migrationFilename: DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      databaseIdentity: {
        database_name: text(databaseIdentity.database_name),
        current_user_name: text(databaseIdentity.current_user_name),
        supabase_project_ref: targetIdentity.supabaseProjectRef,
        target_environment: targetIdentity.targetEnvironment,
      },
      sourceMigrationLedger: ledger.rows,
      retirementState: snapshot.state,
      archiveRows: snapshot.archiveRows,
      defaultMasterPlanMappings: snapshot.mappings,
    }
    await query('COMMIT')
    return backup
  } catch (error) {
    await query('ROLLBACK')
    throw error
  }
}

export function serializeDurationLearningLegacyRuntimeRetirementBackup(
  backup: DurationLearningLegacyRuntimeRetirementBackup,
) {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function calculateDurationLearningLegacyRuntimeRetirementBackupSha256(
  serialized: string | Buffer,
) {
  return createHash('sha256').update(serialized).digest('hex')
}

export function validateDurationLearningLegacyRuntimeRetirementBackup(
  serialized: string,
  expectedSha256: string,
): DurationLearningLegacyRuntimeRetirementBackup {
  const actualSha256 = calculateDurationLearningLegacyRuntimeRetirementBackupSha256(serialized)
  if (actualSha256 !== fingerprint(
    expectedSha256,
    'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_CHECKSUM_INVALID',
  )) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_CHECKSUM_MISMATCH')
  }
  const parsed = JSON.parse(serialized) as Partial<DurationLearningLegacyRuntimeRetirementBackup>
  if (parsed.schemaVersion !== 'workbuddy/duration-learning-legacy-runtime-retirement-backup/v1') {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_SCHEMA_VERSION_MISMATCH')
  }
  if (parsed.migrationFilename !== DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_MIGRATION_MISMATCH')
  }
  const target = assertTargetIdentity({
    supabaseProjectRef: text(parsed.databaseIdentity?.supabase_project_ref),
    targetEnvironment: parsed.databaseIdentity?.target_environment as 'staging' | 'production',
  })
  if (!text(parsed.databaseIdentity?.database_name) || !text(parsed.databaseIdentity?.current_user_name)) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_DATABASE_IDENTITY_MISSING')
  }
  if (
    parsed.sourceMigrationLedger?.length !== 1
    || parsed.sourceMigrationLedger[0]?.filename !== '315_duration_learning_runtime_publications.sql'
  ) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_315_LEDGER_REQUIRED')
  }
  fingerprint(
    parsed.sourceMigrationLedger[0]?.checksum,
    'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_315_CHECKSUM_INVALID',
  )
  const state = normalizeRetirementState(parsed.retirementState)
  const archiveRows = records(
    parsed.archiveRows,
    'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_ARCHIVE_ROWS_INVALID',
  )
  const mappings = records(
    parsed.defaultMasterPlanMappings,
    'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_MAPPING_ROWS_INVALID',
  )
  assertBackupRows(state, archiveRows, mappings)
  return {
    ...parsed,
    databaseIdentity: {
      database_name: text(parsed.databaseIdentity.database_name),
      current_user_name: text(parsed.databaseIdentity.current_user_name),
      supabase_project_ref: target.supabaseProjectRef,
      target_environment: target.targetEnvironment,
    },
    retirementState: state,
    archiveRows,
    defaultMasterPlanMappings: mappings,
  } as DurationLearningLegacyRuntimeRetirementBackup
}

function assertBackupTarget(
  backup: DurationLearningLegacyRuntimeRetirementBackup,
  target: DurationLearningLegacyRuntimeRetirementTargetIdentity,
) {
  const expected = assertTargetIdentity(target)
  if (backup.databaseIdentity.supabase_project_ref !== expected.supabaseProjectRef) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_PROJECT_MISMATCH')
  }
  if (backup.databaseIdentity.target_environment !== expected.targetEnvironment) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_ENVIRONMENT_MISMATCH')
  }
}

function authorizationRef(value: unknown) {
  const normalized = text(value)
  if (!/^change:[A-Za-z0-9][A-Za-z0-9._:/-]{7,239}$/.test(normalized)) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_AUTHORIZATION_REF_INVALID')
  }
  return normalized
}

export async function prepareDurationLearningLegacyRuntimeRetirementApplySession(
  query: DurationLearningLegacyRuntimeRetirementQuery,
  input: {
    backup: DurationLearningLegacyRuntimeRetirementBackup
    backupSha256: string
    authorizationRef: string
    targetIdentity: DurationLearningLegacyRuntimeRetirementTargetIdentity
  },
) {
  assertBackupTarget(input.backup, input.targetIdentity)
  const backupSha256 = fingerprint(
    input.backupSha256,
    'DURATION_LEARNING_LEGACY_RUNTIME_BACKUP_CHECKSUM_INVALID',
  )
  const approvedBy = authorizationRef(input.authorizationRef)
  const identity = await query(`
    SELECT current_database() AS database_name,
           current_user AS current_user_name
  `)
  if (text(identity.rows[0]?.database_name) !== input.backup.databaseIdentity.database_name) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_DATABASE_MISMATCH')
  }
  const current = snapshotFromRow(
    (await query(DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_SNAPSHOT_SQL)).rows[0],
  )
  const expected = input.backup.retirementState
  for (const key of [
    'source_data_fingerprint',
    'archive_data_fingerprint',
    'mapping_fingerprint',
    'manifest_fingerprint',
    'archived_row_count',
    'default_master_plan_mapping_count',
  ] as const) {
    if (current.state[key] !== expected[key]) {
      throw new Error(`DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_PREFLIGHT_CHANGED:${key}`)
    }
  }
  const token = createHash('sha256').update(
    `322:${approvedBy}:${backupSha256}:${expected.source_data_fingerprint}:${expected.manifest_fingerprint}`,
    'utf8',
  ).digest('hex')
  const settings = [
    ['workbuddy.duration_learning_legacy_runtime_retirement.authorization_ref', approvedBy],
    ['workbuddy.duration_learning_legacy_runtime_retirement.authorization_token', token],
    ['workbuddy.duration_learning_legacy_runtime_retirement.backup_sha256', backupSha256],
    ['workbuddy.duration_learning_legacy_runtime_retirement.data_fingerprint', expected.source_data_fingerprint],
    ['workbuddy.duration_learning_legacy_runtime_retirement.manifest_fingerprint', expected.manifest_fingerprint],
  ] as const
  for (const [key, value] of settings) {
    await query('SELECT set_config($1, $2, FALSE)', [key, value])
  }
  return { authorizationToken: token, dataFingerprint: expected.source_data_fingerprint }
}

export function assertDurationLearningLegacyRuntimeRetirementInvocation(input: {
  explicitRetirementRequested: boolean
  onlyMigrationSelector: string | null
  isPlanMode: boolean
  env?: RetirementEnv
}) {
  const selector = text(input.onlyMigrationSelector)
  const selectsRetirement = selector === '322'
    || selector === DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_MIGRATION
  if (!input.explicitRetirementRequested) {
    if (selectsRetirement && !input.isPlanMode) {
      throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_DEDICATED_COMMAND_REQUIRED')
    }
    return { dedicatedExecution: false as const }
  }
  if (!selectsRetirement) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_EXACT_SELECTOR_REQUIRED')
  }
  if (input.isPlanMode) return { dedicatedExecution: true as const }

  const env = input.env ?? process.env
  const backupPath = text(env.DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_FILE)
  if (!backupPath) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_FILE_REQUIRED')
  }
  const approvedBy = text(env.DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_AUTHORIZATION_REF)
  if (!approvedBy) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_AUTHORIZATION_REF_REQUIRED')
  }
  return {
    dedicatedExecution: true as const,
    backupPath,
    authorizationRef: authorizationRef(approvedBy),
    targetIdentity: resolveDurationLearningLegacyRuntimeRetirementTargetIdentity(env),
  }
}

export async function verifyDurationLearningLegacyRuntimeRetirementReadback(
  query: DurationLearningLegacyRuntimeRetirementQuery,
) {
  const result = await query(`
    SELECT EXISTS (
             SELECT 1
               FROM public.schema_migrations
              WHERE version = '322'
                AND filename = '322_duration_learning_legacy_runtime_retirement.sql'
           ) AS retirement_ledgered,
           readback.retirement_status,
           readback.preflight_signal,
           readback.source_tables_present,
           readback.wbs_publications_present,
           readback.wbs_events_present,
           readback.dependency_publications_present,
           readback.dependency_events_present,
           readback.retirement_backup_sha256,
           readback.source_data_fingerprint,
           readback.retired_source_data_fingerprint
      FROM public.duration_learning_legacy_runtime_retirement_readback readback
     WHERE readback.retirement_key = 'duration_learning_legacy_runtime_v1'
  `)
  const row = result.rows[0] as Record<string, unknown> | undefined
  const backupSha256 = text(row?.retirement_backup_sha256).toLowerCase()
  const sourceFingerprint = text(row?.source_data_fingerprint).toLowerCase()
  const retiredFingerprint = text(row?.retired_source_data_fingerprint).toLowerCase()
  const complete = row?.retirement_ledgered === true
    && text(row.retirement_status) === 'retired_readback_complete'
    && text(row.preflight_signal) === 'retired_readback_complete'
    && row.source_tables_present === false
    && row.wbs_publications_present === false
    && row.wbs_events_present === false
    && row.dependency_publications_present === false
    && row.dependency_events_present === false
    && /^[a-f0-9]{64}$/.test(backupSha256)
    && /^[a-f0-9]{64}$/.test(sourceFingerprint)
    && retiredFingerprint === sourceFingerprint
  if (!complete) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_READBACK_INCOMPLETE')
  }
  return {
    status: 'retired_readback_complete' as const,
    ledgered: true as const,
    backupSha256,
    sourceDataFingerprint: sourceFingerprint,
  }
}

export async function prepareDurationLearningLegacyRuntimeRetirementFromEnvironment(
  query: DurationLearningLegacyRuntimeRetirementQuery,
  env: RetirementEnv = process.env,
  readTextFile: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
) {
  const backupPath = text(env.DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_FILE)
  if (!backupPath) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_BACKUP_FILE_REQUIRED')
  }
  const approvedBy = text(env.DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_AUTHORIZATION_REF)
  if (!approvedBy) {
    throw new Error('DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_AUTHORIZATION_REF_REQUIRED')
  }
  const resolvedBackupPath = resolve(backupPath)
  const serialized = await readTextFile(resolvedBackupPath)
  const checksumFile = await readTextFile(`${resolvedBackupPath}.sha256`)
  const expectedSha256 = text(checksumFile).split(/\s+/)[0] ?? ''
  const backup = validateDurationLearningLegacyRuntimeRetirementBackup(serialized, expectedSha256)
  return prepareDurationLearningLegacyRuntimeRetirementApplySession(query, {
    backup,
    backupSha256: expectedSha256,
    authorizationRef: approvedBy,
    targetIdentity: resolveDurationLearningLegacyRuntimeRetirementTargetIdentity(env),
  })
}
