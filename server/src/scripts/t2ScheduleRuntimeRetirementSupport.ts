import { createHash } from 'node:crypto'

import { selectMigrationConnectionTarget } from '../services/migrationRunner.js'

export const T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION =
  '321_retire_duplicate_t2_schedule_runtime.sql'

export const T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION =
  'restore-t2-schedule-runtime-retirement-321'

export const T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES = [
  't2_rhythm_schedule_runtime_publications',
  't2_rhythm_schedule_runtime_events',
] as const

export const T2_SCHEDULE_RUNTIME_RETIREMENT_DEPENDENCY_SOURCE_TYPE =
  't2_rhythm_schedule_runtime'

export const T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_DATASETS = [
  ...T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES,
  'task_dependencies',
] as const

export type T2ScheduleRuntimeRetirementTable =
  typeof T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES[number]

export type T2ScheduleRuntimeRetirementBackupDataset =
  typeof T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_DATASETS[number]

type QueryResult = { rows: any[] }
export type T2ScheduleRuntimeRetirementQuery = (
  sql: string,
  values?: unknown[],
) => Promise<QueryResult>

export type T2ScheduleRuntimeRetirementTargetIdentity = {
  supabaseProjectRef: string
  targetEnvironment: 'staging' | 'production'
}

type T2ScheduleRuntimeRetirementTargetEnv = Record<string, string | undefined>

function deriveSupabaseUrlProjectRef(value: string | undefined) {
  const text = String(value ?? '').trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return /^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname)?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

function deriveSupabaseHostProjectRef(value: string | undefined) {
  const host = String(value ?? '').trim().toLowerCase().replace(/\.$/u, '')
  return /^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/i.exec(host)?.[1]?.toLowerCase() ?? null
}

function deriveSupabaseUserProjectRef(value: string | undefined) {
  const user = String(value ?? '').trim().toLowerCase()
  return /(?:^|\.)([a-z0-9]{20})$/i.exec(user)?.[1]?.toLowerCase() ?? null
}

function isSupabasePoolerHost(value: string | undefined) {
  const host = String(value ?? '').trim().toLowerCase().replace(/\.$/u, '')
  return /(?:^|\.)pooler\.supabase\.(?:com|co)$/i.test(host)
}

function deriveSelectedMigrationTargetRefs(
  env: T2ScheduleRuntimeRetirementTargetEnv,
) {
  const target = selectMigrationConnectionTarget(env)
  if (target.mode === 'connection_string') {
    try {
      const url = new URL(target.connectionString)
      return [
        deriveSupabaseHostProjectRef(url.hostname),
        isSupabasePoolerHost(url.hostname)
          ? deriveSupabaseUserProjectRef(decodeURIComponent(url.username))
          : null,
      ].filter((value): value is string => Boolean(value))
    } catch {
      return []
    }
  }

  return [
    deriveSupabaseHostProjectRef(target.host),
    isSupabasePoolerHost(target.host)
      ? deriveSupabaseUserProjectRef(target.user)
      : null,
  ].filter((value): value is string => Boolean(value))
}

export function resolveT2ScheduleRuntimeRetirementTargetIdentity(
  env: T2ScheduleRuntimeRetirementTargetEnv = process.env,
): T2ScheduleRuntimeRetirementTargetIdentity {
  const expectedProjectRef = deriveSupabaseUrlProjectRef(env.SUPABASE_URL)
  if (!expectedProjectRef) {
    throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_EXPECTED_PROJECT_UNRESOLVED')
  }
  const actualProjectRefs = [...new Set(deriveSelectedMigrationTargetRefs(env))]
  if (actualProjectRefs.length === 0) {
    throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_TARGET_PROJECT_UNRESOLVED')
  }
  if (actualProjectRefs.length > 1 || actualProjectRefs[0] !== expectedProjectRef) {
    throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_TARGET_PROJECT_MISMATCH')
  }
  return assertTargetIdentity({
    supabaseProjectRef: actualProjectRefs[0],
    targetEnvironment: String(
      env.WORKBUDDY_TARGET_ENVIRONMENT ?? env.DEPLOY_TARGET ?? '',
    ).trim() as 'staging' | 'production',
  })
}

export type T2ScheduleRuntimeRetirementBackup = {
  schemaVersion: 'workbuddy/t2-schedule-runtime-retirement-backup/v2'
  migrationFilename: typeof T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION
  generatedAt: string
  databaseIdentity: {
    database_name: string
    current_user_name: string
    supabase_project_ref: string
    target_environment: 'staging' | 'production'
  }
  sourceMigrationLedger: Array<{
    filename: string
    checksum: string
  }>
  counts: Record<T2ScheduleRuntimeRetirementBackupDataset, number>
  dataFingerprint: string
  rows: Record<T2ScheduleRuntimeRetirementBackupDataset, Array<Record<string, unknown>>>
}

const runtimeSnapshotEntries = T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES.map((tableName) => `
    '${tableName}', (
      SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
      FROM public.${tableName} source_row
    )`)

const dependencySnapshotEntry = `
    'task_dependencies', (
      SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
      FROM public.task_dependencies source_row
      WHERE source_row.source_type = '${T2_SCHEDULE_RUNTIME_RETIREMENT_DEPENDENCY_SOURCE_TYPE}'
    )`

const snapshotEntries = [...runtimeSnapshotEntries, dependencySnapshotEntry].join(',')

export const T2_SCHEDULE_RUNTIME_RETIREMENT_SNAPSHOT_SQL = `
  WITH captured AS (
    SELECT jsonb_build_object(${snapshotEntries}
    ) AS snapshot
  )
  SELECT snapshot,
         encode(digest(convert_to(snapshot::text, 'UTF8'), 'sha256'), 'hex') AS data_fingerprint
  FROM captured
`

export const T2_SCHEDULE_RUNTIME_RETIREMENT_RELATION_STATE_SQL = `
  SELECT jsonb_build_object(
    ${T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES.map((tableName) => `
      '${tableName}', jsonb_build_object(
        'exists', to_regclass('public.${tableName}') IS NOT NULL,
        'count', CASE
          WHEN to_regclass('public.${tableName}') IS NULL THEN NULL
          ELSE (SELECT count(*) FROM public.${tableName})
        END
      )`).join(',')}
  ) AS relation_state
`

function assertSnapshotRows(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_INVALID_ROWS')
  }
  const rows = value as Record<string, unknown>
  for (const datasetName of T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_DATASETS) {
    if (!Array.isArray(rows[datasetName])) {
      throw new Error(`T2_SCHEDULE_RUNTIME_BACKUP_INVALID_ROWS:${datasetName}`)
    }
  }
  return rows as T2ScheduleRuntimeRetirementBackup['rows']
}

function buildCounts(rows: T2ScheduleRuntimeRetirementBackup['rows']) {
  return Object.fromEntries(
    T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_DATASETS.map((datasetName) => [
      datasetName,
      rows[datasetName].length,
    ]),
  ) as T2ScheduleRuntimeRetirementBackup['counts']
}

function assertFingerprint(value: unknown) {
  const fingerprint = String(value ?? '')
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) {
    throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_INVALID_DATA_FINGERPRINT')
  }
  return fingerprint.toLowerCase()
}

function assertTargetIdentity(
  value: T2ScheduleRuntimeRetirementTargetIdentity,
): T2ScheduleRuntimeRetirementTargetIdentity {
  const supabaseProjectRef = String(value?.supabaseProjectRef ?? '').trim().toLowerCase()
  const targetEnvironment = String(value?.targetEnvironment ?? '').trim()
  if (!/^[a-z0-9]{20}$/.test(supabaseProjectRef)) {
    throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_TARGET_PROJECT_REF_REQUIRED')
  }
  if (targetEnvironment !== 'staging' && targetEnvironment !== 'production') {
    throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_TARGET_ENVIRONMENT_REQUIRED')
  }
  return {
    supabaseProjectRef,
    targetEnvironment,
  }
}

function assertBackupTargetMatches(
  backup: T2ScheduleRuntimeRetirementBackup,
  targetIdentity: T2ScheduleRuntimeRetirementTargetIdentity,
) {
  const expected = assertTargetIdentity(targetIdentity)
  if (backup.databaseIdentity.supabase_project_ref !== expected.supabaseProjectRef) {
    throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_PROJECT_MISMATCH')
  }
  if (backup.databaseIdentity.target_environment !== expected.targetEnvironment) {
    throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_ENVIRONMENT_MISMATCH')
  }
}

export async function captureT2ScheduleRuntimeRetirementBackup(
  query: T2ScheduleRuntimeRetirementQuery,
  options: {
    generatedAt?: string
    targetIdentity: T2ScheduleRuntimeRetirementTargetIdentity
  },
): Promise<T2ScheduleRuntimeRetirementBackup> {
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
      WHERE filename = '241_v14231_t2_rhythm_schedule_runtime_publications.sql'
      ORDER BY filename
    `)
    const snapshotResult = await query(T2_SCHEDULE_RUNTIME_RETIREMENT_SNAPSHOT_SQL)
    const snapshotRow = snapshotResult.rows[0]
    const rows = assertSnapshotRows(snapshotRow?.snapshot)
    const databaseIdentity = identity.rows[0]
    if (!databaseIdentity?.database_name || !databaseIdentity?.current_user_name) {
      throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_DATABASE_IDENTITY_MISSING')
    }
    if (ledger.rows.length !== 1) {
      throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_SOURCE_MIGRATION_MISSING')
    }

    const backup: T2ScheduleRuntimeRetirementBackup = {
      schemaVersion: 'workbuddy/t2-schedule-runtime-retirement-backup/v2',
      migrationFilename: T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      databaseIdentity: {
        ...databaseIdentity,
        supabase_project_ref: targetIdentity.supabaseProjectRef,
        target_environment: targetIdentity.targetEnvironment,
      },
      sourceMigrationLedger: ledger.rows,
      counts: buildCounts(rows),
      dataFingerprint: assertFingerprint(snapshotRow?.data_fingerprint),
      rows,
    }
    await query('COMMIT')
    return backup
  } catch (error) {
    await query('ROLLBACK')
    throw error
  }
}

export function serializeT2ScheduleRuntimeRetirementBackup(
  backup: T2ScheduleRuntimeRetirementBackup,
) {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function calculateT2ScheduleRuntimeBackupSha256(serialized: string | Buffer) {
  return createHash('sha256').update(serialized).digest('hex')
}

export function validateT2ScheduleRuntimeRetirementBackup(
  serialized: string,
  expectedSha256: string,
): T2ScheduleRuntimeRetirementBackup {
  const actualSha256 = calculateT2ScheduleRuntimeBackupSha256(serialized)
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_CHECKSUM_MISMATCH')
  }

  const parsed = JSON.parse(serialized) as Partial<T2ScheduleRuntimeRetirementBackup>
  if (parsed.schemaVersion !== 'workbuddy/t2-schedule-runtime-retirement-backup/v2') {
    throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_SCHEMA_VERSION_MISMATCH')
  }
  if (parsed.migrationFilename !== T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION) {
    throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_MIGRATION_MISMATCH')
  }
  const rows = assertSnapshotRows(parsed.rows)
  const databaseIdentity = parsed.databaseIdentity
  assertTargetIdentity({
    supabaseProjectRef: String(databaseIdentity?.supabase_project_ref ?? ''),
    targetEnvironment: databaseIdentity?.target_environment as 'staging' | 'production',
  })
  const counts = buildCounts(rows)
  for (const datasetName of T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_DATASETS) {
    if (parsed.counts?.[datasetName] !== counts[datasetName]) {
      throw new Error(`T2_SCHEDULE_RUNTIME_BACKUP_COUNT_MISMATCH:${datasetName}`)
    }
  }
  return {
    ...parsed,
    counts,
    rows,
    dataFingerprint: assertFingerprint(parsed.dataFingerprint),
  } as T2ScheduleRuntimeRetirementBackup
}

export async function prepareT2ScheduleRuntimeRetirementApplySession(
  query: T2ScheduleRuntimeRetirementQuery,
  backup: T2ScheduleRuntimeRetirementBackup,
  backupSha256: string,
  targetIdentity: T2ScheduleRuntimeRetirementTargetIdentity,
) {
  assertBackupTargetMatches(backup, targetIdentity)
  const identity = await query(`
    SELECT current_database() AS database_name,
           current_user AS current_user_name
  `)
  if (identity.rows[0]?.database_name !== backup.databaseIdentity.database_name) {
    throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_DATABASE_MISMATCH')
  }
  const currentSnapshot = await query(T2_SCHEDULE_RUNTIME_RETIREMENT_SNAPSHOT_SQL)
  const currentFingerprint = assertFingerprint(currentSnapshot.rows[0]?.data_fingerprint)
  if (currentFingerprint !== backup.dataFingerprint) {
    throw new Error('T2_SCHEDULE_RUNTIME_RETIREMENT_PREFLIGHT_DATA_CHANGED')
  }
  await query(
    "SELECT set_config('workbuddy.t2_schedule_runtime_retirement_backup_sha256', $1, FALSE)",
    [assertFingerprint(backupSha256)],
  )
  await query(
    "SELECT set_config('workbuddy.t2_schedule_runtime_retirement_data_fingerprint', $1, FALSE)",
    [backup.dataFingerprint],
  )
}

export async function restoreT2ScheduleRuntimeRetirementBackup(
  query: T2ScheduleRuntimeRetirementQuery,
  backup: T2ScheduleRuntimeRetirementBackup,
  confirmation: string,
  targetIdentity: T2ScheduleRuntimeRetirementTargetIdentity,
) {
  if (confirmation !== T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION) {
    throw new Error('T2_SCHEDULE_RUNTIME_RESTORE_CONFIRMATION_REQUIRED')
  }
  assertBackupTargetMatches(backup, targetIdentity)

  await query('BEGIN')
  try {
    const relationStateResult = await query(T2_SCHEDULE_RUNTIME_RETIREMENT_RELATION_STATE_SQL)
    const relationState = relationStateResult.rows[0]?.relation_state as
      | Record<string, { exists: boolean; count: number | null }>
      | undefined
    for (const tableName of T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES) {
      const state = relationState?.[tableName]
      if (!state?.exists) {
        throw new Error(`T2_SCHEDULE_RUNTIME_RESTORE_SCHEMA_MISSING:${tableName}`)
      }
      if (state.count !== 0) {
        throw new Error(`T2_SCHEDULE_RUNTIME_RESTORE_TARGET_NOT_EMPTY:${tableName}`)
      }
    }

    const dependencyIds = backup.rows.task_dependencies.map((row) => String(row.id ?? ''))
    if (dependencyIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      throw new Error('T2_SCHEDULE_RUNTIME_RESTORE_DEPENDENCY_ID_INVALID')
    }
    const dependencyConflictResult = await query(
      `WITH t2_dependency_restore_conflicts AS (
         SELECT count(*) FILTER (
                  WHERE source_type = '${T2_SCHEDULE_RUNTIME_RETIREMENT_DEPENDENCY_SOURCE_TYPE}'
                )::int AS source_count,
                count(*) FILTER (WHERE id = ANY($1::uuid[]))::int AS id_conflict_count
           FROM public.task_dependencies
       )
       SELECT source_count, id_conflict_count
       FROM t2_dependency_restore_conflicts`,
      [dependencyIds],
    )
    const dependencyConflicts = dependencyConflictResult.rows[0]
    if (Number(dependencyConflicts?.source_count ?? 0) !== 0) {
      throw new Error('T2_SCHEDULE_RUNTIME_RESTORE_DEPENDENCY_TARGET_NOT_EMPTY')
    }
    if (Number(dependencyConflicts?.id_conflict_count ?? 0) !== 0) {
      throw new Error('T2_SCHEDULE_RUNTIME_RESTORE_DEPENDENCY_ID_OCCUPIED')
    }

    for (const tableName of T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES) {
      await query(
        `INSERT INTO public.${tableName}
         SELECT *
         FROM jsonb_populate_recordset(NULL::public.${tableName}, $1::jsonb)`,
        [JSON.stringify(backup.rows[tableName])],
      )
    }
    await query(
      `INSERT INTO public.task_dependencies
       SELECT *
       FROM jsonb_populate_recordset(NULL::public.task_dependencies, $1::jsonb)`,
      [JSON.stringify(backup.rows.task_dependencies)],
    )

    const restoredSnapshot = await query(T2_SCHEDULE_RUNTIME_RETIREMENT_SNAPSHOT_SQL)
    const restoredFingerprint = assertFingerprint(restoredSnapshot.rows[0]?.data_fingerprint)
    if (restoredFingerprint !== backup.dataFingerprint) {
      throw new Error('T2_SCHEDULE_RUNTIME_RESTORE_FINGERPRINT_MISMATCH')
    }
    await query('COMMIT')
  } catch (error) {
    await query('ROLLBACK')
    throw error
  }
}
