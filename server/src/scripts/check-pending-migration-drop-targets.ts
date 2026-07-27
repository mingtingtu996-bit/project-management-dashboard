import { setDefaultResultOrder } from 'node:dns'
import { resolve } from 'node:path'

import pg from 'pg'

import {
  discoverMigrationFiles,
  getPendingMigrations,
  listAppliedMigrations,
  readMigrationSql,
  resolveMigrationRuntimeConnectionConfig,
  schemaMigrationsTableExists,
} from '../services/migrationRunner.js'
import {
  extractCreatedObjectStatements,
  extractPhysicalDropStatements,
  type MigrationDropStatement,
} from './check-legacy-object-drop-guard.js'

const { Client } = pg

export type PendingMigrationSource = {
  filename: string
  sql: string
}

type DropTargetState =
  | 'absent_noop'
  | 'existing_requires_evidence'
  | 'existing_explicitly_approved'
  | 'pending_recreate_requires_evidence'
  | 'absent_non_idempotent'

type DropTargetResult = MigrationDropStatement & {
  targetState: DropTargetState
  recreatedBy?: string
}

type DropTargetGuardReason =
  | 'existing_drop_target_requires_governed_evidence'
  | 'earlier_pending_migration_recreates_drop_target'
  | 'non_idempotent_drop_target_absent'
  | 'migration_ledger_missing'

export type PendingMigrationDropTargetReport = {
  gate: 'pending-migration-drop-targets'
  status: 'pass' | 'blocked'
  reasonCodes: DropTargetGuardReason[]
  pendingMigrations: string[]
  explicitlyApprovedMigrations: string[]
  targets: DropTargetResult[]
}

type TargetExists = (drop: MigrationDropStatement) => Promise<boolean>

function canonicalObjectKey(object: { objectType: string, objectName: string }) {
  const objectName = object.objectName.replaceAll('"', '').replace(/^public\./i, '').toLowerCase()
  return `${object.objectType.toLowerCase()}::${objectName}`
}

export async function evaluatePendingMigrationDropTargets(
  pendingMigrations: PendingMigrationSource[],
  targetExists: TargetExists,
  options: { explicitlyApprovedMigrations?: ReadonlySet<string> } = {},
): Promise<PendingMigrationDropTargetReport> {
  const createdBy = new Map<string, string>()
  const targets: DropTargetResult[] = []
  const reasonCodes = new Set<DropTargetGuardReason>()

  for (const migration of pendingMigrations) {
    const drops = extractPhysicalDropStatements(migration.sql, migration.filename)
    for (const drop of drops) {
      const recreatedBy = createdBy.get(canonicalObjectKey(drop))
      const exists = await targetExists(drop)

      if (recreatedBy) {
        reasonCodes.add('earlier_pending_migration_recreates_drop_target')
        targets.push({
          ...drop,
          targetState: 'pending_recreate_requires_evidence',
          recreatedBy,
        })
      } else if (exists && options.explicitlyApprovedMigrations?.has(migration.filename)) {
        targets.push({ ...drop, targetState: 'existing_explicitly_approved' })
      } else if (exists) {
        reasonCodes.add('existing_drop_target_requires_governed_evidence')
        targets.push({ ...drop, targetState: 'existing_requires_evidence' })
      } else if (!drop.ifExists) {
        reasonCodes.add('non_idempotent_drop_target_absent')
        targets.push({ ...drop, targetState: 'absent_non_idempotent' })
      } else {
        targets.push({ ...drop, targetState: 'absent_noop' })
      }
    }

    for (const created of extractCreatedObjectStatements(migration.sql, migration.filename)) {
      createdBy.set(canonicalObjectKey(created), migration.filename)
    }
  }

  return {
    gate: 'pending-migration-drop-targets',
    status: reasonCodes.size === 0 ? 'pass' : 'blocked',
    reasonCodes: [...reasonCodes],
    pendingMigrations: pendingMigrations.map((migration) => migration.filename),
    explicitlyApprovedMigrations: [...(options.explicitlyApprovedMigrations ?? [])],
    targets,
  }
}

function parseExplicitMigrationApprovals(argv: string[]) {
  const approvals = new Set<string>()
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--approve-existing-drop-targets-for') continue
    const filename = String(argv[index + 1] ?? '').trim()
    if (!/^\d{3}[a-z]?_[a-z0-9_]+\.sql$/i.test(filename)) {
      throw new Error('--approve-existing-drop-targets-for requires one canonical migration filename')
    }
    approvals.add(filename)
    index += 1
  }
  return approvals
}

function parseRelationMemberName(value: string) {
  const parts = value.replaceAll('"', '').split('.').filter(Boolean)
  const memberName = parts.pop() ?? ''
  const relationName = parts.pop() ?? ''
  const schemaName = parts.pop() ?? 'public'
  return { schemaName, relationName, memberName }
}

export async function targetExists(
  client: InstanceType<typeof Client>,
  drop: MigrationDropStatement,
) {
  if (drop.objectType === 'function') {
    const result = await client.query<{ exists: boolean }>(
      'SELECT to_regprocedure($1) IS NOT NULL AS exists',
      [drop.objectName.toLowerCase()],
    )
    return result.rows[0]?.exists === true
  }

  if (drop.objectType === 'trigger') {
    const parts = drop.objectName.replaceAll('"', '').split('.')
    const triggerName = parts.pop() ?? ''
    const tableName = parts.pop() ?? ''
    const schemaName = parts.pop() ?? 'public'
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_trigger trigger_record
         JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1
           AND relation.relname = $2
           AND trigger_record.tgname = $3
           AND trigger_record.tgisinternal = FALSE
       ) AS exists`,
      [schemaName, tableName, triggerName],
    )
    return result.rows[0]?.exists === true
  }

  if (drop.objectType === 'column') {
    const { schemaName, relationName, memberName } = parseRelationMemberName(drop.objectName)
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_attribute attribute
         JOIN pg_class relation ON relation.oid = attribute.attrelid
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1
           AND relation.relname = $2
           AND attribute.attname = $3
           AND attribute.attnum > 0
           AND attribute.attisdropped = FALSE
       ) AS exists`,
      [schemaName, relationName, memberName],
    )
    return result.rows[0]?.exists === true
  }

  if (drop.objectType === 'constraint') {
    const { schemaName, relationName, memberName } = parseRelationMemberName(drop.objectName)
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_constraint constraint_record
         JOIN pg_class relation ON relation.oid = constraint_record.conrelid
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1
           AND relation.relname = $2
           AND constraint_record.conname = $3
       ) AS exists`,
      [schemaName, relationName, memberName],
    )
    return result.rows[0]?.exists === true
  }

  if (drop.objectType === 'policy' || drop.objectType === 'rule') {
    const { schemaName, relationName, memberName } = parseRelationMemberName(drop.objectName)
    const catalog = drop.objectType === 'policy' ? 'pg_policy' : 'pg_rewrite'
    const nameColumn = drop.objectType === 'policy' ? 'polname' : 'rulename'
    const relationColumn = drop.objectType === 'policy' ? 'polrelid' : 'ev_class'
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM ${catalog} catalog_record
         JOIN pg_class relation ON relation.oid = catalog_record.${relationColumn}
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1
           AND relation.relname = $2
           AND catalog_record.${nameColumn} = $3
       ) AS exists`,
      [schemaName, relationName, memberName],
    )
    return result.rows[0]?.exists === true
  }

  if (drop.objectType === 'schema') {
    const result = await client.query<{ exists: boolean }>(
      'SELECT to_regnamespace($1) IS NOT NULL AS exists',
      [drop.objectName.replaceAll('"', '')],
    )
    return result.rows[0]?.exists === true
  }

  if (drop.objectType === 'type') {
    const result = await client.query<{ exists: boolean }>(
      'SELECT to_regtype($1) IS NOT NULL AS exists',
      [drop.objectName],
    )
    return result.rows[0]?.exists === true
  }

  if (['table', 'view', 'materialized_view', 'sequence', 'index'].includes(drop.objectType)) {
    const result = await client.query<{ exists: boolean }>(
      'SELECT to_regclass($1) IS NOT NULL AS exists',
      [drop.objectName],
    )
    return result.rows[0]?.exists === true
  }

  throw new Error(`Unsupported pending migration DROP target type: ${drop.objectType}`)
}

async function main() {
  setDefaultResultOrder('ipv4first')
  const migrationsDir = resolve(process.cwd(), 'migrations')
  const discovered = await discoverMigrationFiles(migrationsDir)
  const client = new Client(await resolveMigrationRuntimeConnectionConfig())
  const explicitApprovals = parseExplicitMigrationApprovals(process.argv.slice(2))
  await client.connect()

  try {
    if (!await schemaMigrationsTableExists(client)) {
      const report: PendingMigrationDropTargetReport = {
        gate: 'pending-migration-drop-targets',
        status: 'blocked',
        reasonCodes: ['migration_ledger_missing'],
        pendingMigrations: [],
        explicitlyApprovedMigrations: [...explicitApprovals],
        targets: [],
      }
      console.log(JSON.stringify(report, null, 2))
      process.exitCode = 1
      return
    }

    const applied = await listAppliedMigrations(client)
    const pending = getPendingMigrations(discovered, applied)
    const sources = await Promise.all(pending.map(async (migration) => ({
      filename: migration.filename,
      sql: await readMigrationSql(migration),
    })))
    const pendingFilenames = new Set(sources.map((migration) => migration.filename))
    for (const approvedFilename of explicitApprovals) {
      if (!pendingFilenames.has(approvedFilename)) {
        throw new Error(`explicit DROP approval does not match a pending migration: ${approvedFilename}`)
      }
    }
    const report = await evaluatePendingMigrationDropTargets(
      sources,
      (drop) => targetExists(client, drop),
      { explicitlyApprovedMigrations: explicitApprovals },
    )

    console.log(JSON.stringify(report, null, 2))
    if (report.status !== 'pass') process.exitCode = 1
  } finally {
    await client.end()
  }
}

if (process.argv[1]?.endsWith('check-pending-migration-drop-targets.ts')) {
  main().catch((error) => {
    console.error('Pending migration DROP target preflight failed:', error)
    process.exitCode = 1
  })
}
