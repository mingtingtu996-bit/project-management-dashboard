import { createHash } from 'node:crypto'

export const NOTIFICATION_TASK_REFERENCE_RETIREMENT_MIGRATION =
  '320_notification_task_reference_retirement.sql'

type QueryResult = { rows: any[] }
export type NotificationTaskReferenceRetirementQuery = (
  sql: string,
  values?: unknown[],
) => Promise<QueryResult>

export type NotificationTaskReferenceRetirementBackup = {
  schemaVersion: 'workbuddy/notification-task-reference-retirement-backup/v1'
  migrationFilename: typeof NOTIFICATION_TASK_REFERENCE_RETIREMENT_MIGRATION
  generatedAt: string
  databaseIdentity: {
    database_name: string
    current_user_name: string
  }
  count: number
  dataFingerprint: string
  rows: Array<Record<string, unknown>>
}

export const NOTIFICATION_TASK_REFERENCE_RETIREMENT_SNAPSHOT_SQL = `
  WITH captured AS (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(notification_row) ORDER BY notification_row.id),
      '[]'::jsonb
    ) AS snapshot
    FROM public.notifications notification_row
    LEFT JOIN public.tasks task_row
      ON task_row.id::text = notification_row.task_id::text
    WHERE notification_row.task_id IS NOT NULL
      AND task_row.id IS NULL
  )
  SELECT snapshot,
         jsonb_array_length(snapshot)::int AS row_count,
         encode(digest(convert_to(snapshot::text, 'UTF8'), 'sha256'), 'hex') AS data_fingerprint
  FROM captured
`

function assertFingerprint(value: unknown) {
  const fingerprint = String(value ?? '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_INVALID_FINGERPRINT')
  }
  return fingerprint
}

function assertRows(value: unknown) {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_INVALID_ROWS')
  }
  return value as Array<Record<string, unknown>>
}

function assertDatabaseIdentity(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_DATABASE_IDENTITY_MISSING')
  }
  const identity = value as Record<string, unknown>
  const databaseName = String(identity.database_name ?? '').trim()
  const currentUserName = String(identity.current_user_name ?? '').trim()
  if (!databaseName || !currentUserName) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_DATABASE_IDENTITY_MISSING')
  }
  return {
    database_name: databaseName,
    current_user_name: currentUserName,
  }
}

export async function captureNotificationTaskReferenceRetirementBackup(
  query: NotificationTaskReferenceRetirementQuery,
  options: { generatedAt?: string } = {},
): Promise<NotificationTaskReferenceRetirementBackup> {
  await query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const identity = await query(`
      SELECT current_database() AS database_name,
             current_user AS current_user_name
    `)
    const snapshotResult = await query(NOTIFICATION_TASK_REFERENCE_RETIREMENT_SNAPSHOT_SQL)
    const snapshot = snapshotResult.rows[0]
    const rows = assertRows(snapshot?.snapshot)
    const count = Number(snapshot?.row_count)
    const databaseIdentity = assertDatabaseIdentity(identity.rows[0])
    if (!Number.isInteger(count) || count !== rows.length) {
      throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_COUNT_MISMATCH')
    }

    const backup: NotificationTaskReferenceRetirementBackup = {
      schemaVersion: 'workbuddy/notification-task-reference-retirement-backup/v1',
      migrationFilename: NOTIFICATION_TASK_REFERENCE_RETIREMENT_MIGRATION,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      databaseIdentity,
      count,
      dataFingerprint: assertFingerprint(snapshot?.data_fingerprint),
      rows,
    }
    await query('COMMIT')
    return backup
  } catch (error) {
    await query('ROLLBACK')
    throw error
  }
}

export function serializeNotificationTaskReferenceRetirementBackup(
  backup: NotificationTaskReferenceRetirementBackup,
) {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function calculateNotificationTaskReferenceRetirementBackupSha256(
  serialized: string | Buffer,
) {
  return createHash('sha256').update(serialized).digest('hex')
}

export function validateNotificationTaskReferenceRetirementBackup(
  serialized: string,
  expectedSha256: string,
): NotificationTaskReferenceRetirementBackup {
  const actualSha256 = calculateNotificationTaskReferenceRetirementBackupSha256(serialized)
  if (actualSha256 !== assertFingerprint(expectedSha256)) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_CHECKSUM_MISMATCH')
  }

  const parsed = JSON.parse(serialized) as Partial<NotificationTaskReferenceRetirementBackup>
  if (parsed.schemaVersion !== 'workbuddy/notification-task-reference-retirement-backup/v1') {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_SCHEMA_VERSION_MISMATCH')
  }
  if (parsed.migrationFilename !== NOTIFICATION_TASK_REFERENCE_RETIREMENT_MIGRATION) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_MIGRATION_MISMATCH')
  }
  if (!parsed.generatedAt || !Number.isFinite(Date.parse(parsed.generatedAt))) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_GENERATED_AT_INVALID')
  }
  const databaseIdentity = assertDatabaseIdentity(parsed.databaseIdentity)
  const rows = assertRows(parsed.rows)
  if (!Number.isInteger(parsed.count) || parsed.count !== rows.length) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_COUNT_MISMATCH')
  }

  return {
    ...parsed,
    databaseIdentity,
    count: rows.length,
    dataFingerprint: assertFingerprint(parsed.dataFingerprint),
    rows,
  } as NotificationTaskReferenceRetirementBackup
}

export async function prepareNotificationTaskReferenceRetirementApplySession(
  query: NotificationTaskReferenceRetirementQuery,
  backup: NotificationTaskReferenceRetirementBackup,
  backupSha256: string,
) {
  const identity = await query(`
    SELECT current_database() AS database_name,
           current_user AS current_user_name
  `)
  const currentIdentity = assertDatabaseIdentity(identity.rows[0])
  if (currentIdentity.database_name !== backup.databaseIdentity.database_name) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_DATABASE_MISMATCH')
  }
  if (currentIdentity.current_user_name !== backup.databaseIdentity.current_user_name) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_USER_MISMATCH')
  }

  const currentSnapshot = await query(NOTIFICATION_TASK_REFERENCE_RETIREMENT_SNAPSHOT_SQL)
  const currentFingerprint = assertFingerprint(currentSnapshot.rows[0]?.data_fingerprint)
  if (currentFingerprint !== backup.dataFingerprint) {
    throw new Error('NOTIFICATION_TASK_REFERENCE_RETIREMENT_PREFLIGHT_DATA_CHANGED')
  }

  await query(
    "SELECT set_config('workbuddy.notification_task_reference_retirement_backup_sha256', $1, FALSE)",
    [assertFingerprint(backupSha256)],
  )
  await query(
    "SELECT set_config('workbuddy.notification_task_reference_retirement_data_fingerprint', $1, FALSE)",
    [backup.dataFingerprint],
  )
}
