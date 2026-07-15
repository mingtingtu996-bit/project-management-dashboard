import { createHash } from 'node:crypto'

export const PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION =
  '311_retire_product_runtime_progress_knowledge_governance.sql'

export const PROGRESS_KNOWLEDGE_RETIREMENT_CONFIRMATION =
  'restore-progress-knowledge-retirement-311'

export const PROGRESS_KNOWLEDGE_RETIREMENT_TABLES = [
  'progress_knowledge_sources',
  'progress_knowledge_documents',
  'progress_asset_candidates',
  'progress_asset_calibration_runs',
  'progress_asset_calibration_results',
  'progress_asset_publication_readiness',
] as const

export type ProgressKnowledgeRetirementTable =
  typeof PROGRESS_KNOWLEDGE_RETIREMENT_TABLES[number]

type QueryResult = { rows: any[] }
export type ProgressKnowledgeRetirementQuery = (
  sql: string,
  values?: unknown[],
) => Promise<QueryResult>

export type ProgressKnowledgeRetirementBackup = {
  schemaVersion: 'workbuddy/progress-knowledge-retirement-backup/v1'
  migrationFilename: typeof PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION
  generatedAt: string
  databaseIdentity: {
    database_name: string
    current_user_name: string
  }
  sourceMigrationLedger: Array<{
    filename: string
    checksum: string
  }>
  counts: Record<ProgressKnowledgeRetirementTable, number>
  dataFingerprint: string
  rows: Record<ProgressKnowledgeRetirementTable, Array<Record<string, unknown>>>
}

const snapshotEntries = PROGRESS_KNOWLEDGE_RETIREMENT_TABLES.map((tableName) => `
    '${tableName}', (
      SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
      FROM public.${tableName} source_row
    )`).join(',')

export const PROGRESS_KNOWLEDGE_RETIREMENT_SNAPSHOT_SQL = `
  WITH captured AS (
    SELECT jsonb_build_object(${snapshotEntries}
    ) AS snapshot
  )
  SELECT snapshot,
         encode(digest(convert_to(snapshot::text, 'UTF8'), 'sha256'), 'hex') AS data_fingerprint
  FROM captured
`

export const PROGRESS_KNOWLEDGE_RETIREMENT_RELATION_STATE_SQL = `
  SELECT jsonb_build_object(
    ${PROGRESS_KNOWLEDGE_RETIREMENT_TABLES.map((tableName) => `
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
    throw new Error('PROGRESS_KNOWLEDGE_BACKUP_INVALID_ROWS')
  }

  const rows = value as Record<string, unknown>
  for (const tableName of PROGRESS_KNOWLEDGE_RETIREMENT_TABLES) {
    if (!Array.isArray(rows[tableName])) {
      throw new Error(`PROGRESS_KNOWLEDGE_BACKUP_INVALID_ROWS:${tableName}`)
    }
  }

  return rows as ProgressKnowledgeRetirementBackup['rows']
}

function buildCounts(rows: ProgressKnowledgeRetirementBackup['rows']) {
  return Object.fromEntries(
    PROGRESS_KNOWLEDGE_RETIREMENT_TABLES.map((tableName) => [tableName, rows[tableName].length]),
  ) as ProgressKnowledgeRetirementBackup['counts']
}

function assertFingerprint(value: unknown) {
  const fingerprint = String(value ?? '')
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) {
    throw new Error('PROGRESS_KNOWLEDGE_BACKUP_INVALID_DATA_FINGERPRINT')
  }
  return fingerprint.toLowerCase()
}

export async function captureProgressKnowledgeRetirementBackup(
  query: ProgressKnowledgeRetirementQuery,
  options: { generatedAt?: string } = {},
): Promise<ProgressKnowledgeRetirementBackup> {
  await query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const identity = await query(`
      SELECT current_database() AS database_name,
             current_user AS current_user_name
    `)
    const ledger = await query(`
      SELECT filename, checksum
      FROM public.schema_migrations
      WHERE filename = '226_v14225_progress_knowledge_assets.sql'
      ORDER BY filename
    `)
    const snapshotResult = await query(PROGRESS_KNOWLEDGE_RETIREMENT_SNAPSHOT_SQL)
    const snapshotRow = snapshotResult.rows[0]
    const rows = assertSnapshotRows(snapshotRow?.snapshot)
    const databaseIdentity = identity.rows[0]
    if (!databaseIdentity?.database_name || !databaseIdentity?.current_user_name) {
      throw new Error('PROGRESS_KNOWLEDGE_BACKUP_DATABASE_IDENTITY_MISSING')
    }
    if (ledger.rows.length !== 1) {
      throw new Error('PROGRESS_KNOWLEDGE_BACKUP_SOURCE_MIGRATION_MISSING')
    }

    const backup: ProgressKnowledgeRetirementBackup = {
      schemaVersion: 'workbuddy/progress-knowledge-retirement-backup/v1',
      migrationFilename: PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION,
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

export function serializeProgressKnowledgeRetirementBackup(
  backup: ProgressKnowledgeRetirementBackup,
) {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function calculateProgressKnowledgeBackupSha256(serialized: string | Buffer) {
  return createHash('sha256').update(serialized).digest('hex')
}

export function validateProgressKnowledgeRetirementBackup(
  serialized: string,
  expectedSha256: string,
): ProgressKnowledgeRetirementBackup {
  const actualSha256 = calculateProgressKnowledgeBackupSha256(serialized)
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error('PROGRESS_KNOWLEDGE_BACKUP_CHECKSUM_MISMATCH')
  }

  const parsed = JSON.parse(serialized) as Partial<ProgressKnowledgeRetirementBackup>
  if (parsed.schemaVersion !== 'workbuddy/progress-knowledge-retirement-backup/v1') {
    throw new Error('PROGRESS_KNOWLEDGE_BACKUP_SCHEMA_VERSION_MISMATCH')
  }
  if (parsed.migrationFilename !== PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION) {
    throw new Error('PROGRESS_KNOWLEDGE_BACKUP_MIGRATION_MISMATCH')
  }
  const rows = assertSnapshotRows(parsed.rows)
  const counts = buildCounts(rows)
  for (const tableName of PROGRESS_KNOWLEDGE_RETIREMENT_TABLES) {
    if (parsed.counts?.[tableName] !== counts[tableName]) {
      throw new Error(`PROGRESS_KNOWLEDGE_BACKUP_COUNT_MISMATCH:${tableName}`)
    }
  }

  return {
    ...parsed,
    counts,
    rows,
    dataFingerprint: assertFingerprint(parsed.dataFingerprint),
  } as ProgressKnowledgeRetirementBackup
}

export async function prepareProgressKnowledgeRetirementApplySession(
  query: ProgressKnowledgeRetirementQuery,
  backup: ProgressKnowledgeRetirementBackup,
  backupSha256: string,
) {
  const identity = await query(`
    SELECT current_database() AS database_name,
           current_user AS current_user_name
  `)
  if (identity.rows[0]?.database_name !== backup.databaseIdentity.database_name) {
    throw new Error('PROGRESS_KNOWLEDGE_RETIREMENT_BACKUP_DATABASE_MISMATCH')
  }
  const currentSnapshot = await query(PROGRESS_KNOWLEDGE_RETIREMENT_SNAPSHOT_SQL)
  const currentFingerprint = assertFingerprint(currentSnapshot.rows[0]?.data_fingerprint)
  if (currentFingerprint !== backup.dataFingerprint) {
    throw new Error('PROGRESS_KNOWLEDGE_RETIREMENT_PREFLIGHT_DATA_CHANGED')
  }
  await query(
    "SELECT set_config('workbuddy.progress_knowledge_retirement_backup_sha256', $1, FALSE)",
    [assertFingerprint(backupSha256)],
  )
  await query(
    "SELECT set_config('workbuddy.progress_knowledge_retirement_data_fingerprint', $1, FALSE)",
    [backup.dataFingerprint],
  )
}

export async function restoreProgressKnowledgeRetirementBackup(
  query: ProgressKnowledgeRetirementQuery,
  backup: ProgressKnowledgeRetirementBackup,
  confirmation: string,
) {
  if (confirmation !== PROGRESS_KNOWLEDGE_RETIREMENT_CONFIRMATION) {
    throw new Error('PROGRESS_KNOWLEDGE_RESTORE_CONFIRMATION_REQUIRED')
  }

  await query('BEGIN')
  try {
    const relationStateResult = await query(PROGRESS_KNOWLEDGE_RETIREMENT_RELATION_STATE_SQL)
    const relationState = relationStateResult.rows[0]?.relation_state as
      | Record<string, { exists: boolean; count: number | null }>
      | undefined
    for (const tableName of PROGRESS_KNOWLEDGE_RETIREMENT_TABLES) {
      const state = relationState?.[tableName]
      if (!state?.exists) {
        throw new Error(`PROGRESS_KNOWLEDGE_RESTORE_SCHEMA_MISSING:${tableName}`)
      }
      if (state.count !== 0) {
        throw new Error(`PROGRESS_KNOWLEDGE_RESTORE_TARGET_NOT_EMPTY:${tableName}`)
      }
    }

    for (const tableName of PROGRESS_KNOWLEDGE_RETIREMENT_TABLES) {
      await query(
        `INSERT INTO public.${tableName}
         SELECT *
         FROM jsonb_populate_recordset(NULL::public.${tableName}, $1::jsonb)`,
        [JSON.stringify(backup.rows[tableName])],
      )
    }

    const restoredSnapshot = await query(PROGRESS_KNOWLEDGE_RETIREMENT_SNAPSHOT_SQL)
    const restoredFingerprint = assertFingerprint(restoredSnapshot.rows[0]?.data_fingerprint)
    if (restoredFingerprint !== backup.dataFingerprint) {
      throw new Error('PROGRESS_KNOWLEDGE_RESTORE_FINGERPRINT_MISMATCH')
    }
    await query('COMMIT')
  } catch (error) {
    await query('ROLLBACK')
    throw error
  }
}
