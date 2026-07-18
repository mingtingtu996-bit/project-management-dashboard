import { createHash } from 'node:crypto'

export const T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION =
  '321_retire_duplicate_t2_schedule_runtime.sql'

export const T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION =
  'restore-t2-schedule-runtime-retirement-321'

export const T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES = [
  't2_rhythm_schedule_runtime_publications',
  't2_rhythm_schedule_runtime_events',
] as const

export type T2ScheduleRuntimeRetirementTable =
  typeof T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES[number]

type QueryResult = { rows: any[] }
export type T2ScheduleRuntimeRetirementQuery = (
  sql: string,
  values?: unknown[],
) => Promise<QueryResult>

export type T2ScheduleRuntimeRetirementBackup = {
  schemaVersion: 'workbuddy/t2-schedule-runtime-retirement-backup/v1'
  migrationFilename: typeof T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION
  generatedAt: string
  databaseIdentity: {
    database_name: string
    current_user_name: string
  }
  sourceMigrationLedger: Array<{
    filename: string
    checksum: string
  }>
  counts: Record<T2ScheduleRuntimeRetirementTable, number>
  dataFingerprint: string
  rows: Record<T2ScheduleRuntimeRetirementTable, Array<Record<string, unknown>>>
}

const snapshotEntries = T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES.map((tableName) => `
    '${tableName}', (
      SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
      FROM public.${tableName} source_row
    )`).join(',')

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
  for (const tableName of T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES) {
    if (!Array.isArray(rows[tableName])) {
      throw new Error(`T2_SCHEDULE_RUNTIME_BACKUP_INVALID_ROWS:${tableName}`)
    }
  }
  return rows as T2ScheduleRuntimeRetirementBackup['rows']
}

function buildCounts(rows: T2ScheduleRuntimeRetirementBackup['rows']) {
  return Object.fromEntries(
    T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES.map((tableName) => [tableName, rows[tableName].length]),
  ) as T2ScheduleRuntimeRetirementBackup['counts']
}

function assertFingerprint(value: unknown) {
  const fingerprint = String(value ?? '')
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) {
    throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_INVALID_DATA_FINGERPRINT')
  }
  return fingerprint.toLowerCase()
}

export async function captureT2ScheduleRuntimeRetirementBackup(
  query: T2ScheduleRuntimeRetirementQuery,
  options: { generatedAt?: string } = {},
): Promise<T2ScheduleRuntimeRetirementBackup> {
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
      schemaVersion: 'workbuddy/t2-schedule-runtime-retirement-backup/v1',
      migrationFilename: T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      databaseIdentity,
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
  if (parsed.schemaVersion !== 'workbuddy/t2-schedule-runtime-retirement-backup/v1') {
    throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_SCHEMA_VERSION_MISMATCH')
  }
  if (parsed.migrationFilename !== T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION) {
    throw new Error('T2_SCHEDULE_RUNTIME_BACKUP_MIGRATION_MISMATCH')
  }
  const rows = assertSnapshotRows(parsed.rows)
  const counts = buildCounts(rows)
  for (const tableName of T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES) {
    if (parsed.counts?.[tableName] !== counts[tableName]) {
      throw new Error(`T2_SCHEDULE_RUNTIME_BACKUP_COUNT_MISMATCH:${tableName}`)
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
) {
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
) {
  if (confirmation !== T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION) {
    throw new Error('T2_SCHEDULE_RUNTIME_RESTORE_CONFIRMATION_REQUIRED')
  }

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

    for (const tableName of T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES) {
      await query(
        `INSERT INTO public.${tableName}
         SELECT *
         FROM jsonb_populate_recordset(NULL::public.${tableName}, $1::jsonb)`,
        [JSON.stringify(backup.rows[tableName])],
      )
    }

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
