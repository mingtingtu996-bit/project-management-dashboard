import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import pg from 'pg'

import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'

const { Client } = pg

const schemaSnapshotTables = [
  'project_members',
  'project_invitations',
  'project_direct_invitations',
  'wbs_structure',
  'wbs_task_links',
  'data_lineage_entity_types',
  'data_lineage_relation_rules',
  'data_lineage_links',
  'project_entity_links',
  'duration_context_policy_learning_checkpoints',
  'duration_asset_baseline_revision_operations',
] as const

const fullRowSnapshotTables = [
  'project_members',
  'project_invitations',
  'project_direct_invitations',
  'wbs_structure',
  'wbs_task_links',
] as const

const retiredLineageTypes = ['wbs_structure', 'wbs_task_link', 'task_milestone']
const remappedLineageTypes = ['milestone', 'warning', 'planning_governance_signal']

function parseOutputPath(argv: string[]) {
  const index = argv.indexOf('--output')
  const value = index >= 0 ? String(argv[index + 1] ?? '').trim() : ''
  if (!value) {
    throw new Error('Usage: backup-v1420-legacy-closeout --output <absolute-or-relative-json-path>')
  }
  return resolve(value)
}

function quoteIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`)
  }
  return `"${value}"`
}

async function relationExists(client: InstanceType<typeof Client>, tableName: string) {
  const result = await client.query<{ exists: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS exists',
    [`public.${tableName}`],
  )
  return result.rows[0]?.exists === true
}

async function readRelationSchema(client: InstanceType<typeof Client>, tableName: string) {
  const columns = await client.query(
    `SELECT column_name, ordinal_position, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  )
  const constraints = await client.query(
    `SELECT constraint_record.conname AS name,
            constraint_record.contype AS type,
            pg_get_constraintdef(constraint_record.oid, TRUE) AS definition
     FROM pg_constraint constraint_record
     WHERE constraint_record.conrelid = to_regclass($1)
     ORDER BY constraint_record.conname`,
    [`public.${tableName}`],
  )
  const indexes = await client.query(
    `SELECT indexname AS name, indexdef AS definition
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1
     ORDER BY indexname`,
    [tableName],
  )
  const policies = await client.query(
    `SELECT policyname AS name, permissive, roles, cmd, qual, with_check
     FROM pg_policies
     WHERE schemaname = 'public' AND tablename = $1
     ORDER BY policyname`,
    [tableName],
  )
  const grants = await client.query(
    `SELECT grantee, privilege_type, is_grantable
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY grantee, privilege_type`,
    [tableName],
  )
  const rls = await client.query(
    `SELECT relation.relrowsecurity AS enabled, relation.relforcerowsecurity AS forced
     FROM pg_class relation
     WHERE relation.oid = to_regclass($1)`,
    [`public.${tableName}`],
  )

  return {
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    policies: policies.rows,
    grants: grants.rows,
    rowLevelSecurity: rls.rows[0] ?? null,
  }
}

async function readAllRows(client: InstanceType<typeof Client>, tableName: string) {
  const identifier = quoteIdentifier(tableName)
  const result = await client.query<{ row: Record<string, unknown> }>(
    `SELECT to_jsonb(source_row) AS row FROM public.${identifier} source_row`,
  )
  return result.rows.map((item) => item.row)
}

async function readLineageRows(client: InstanceType<typeof Client>) {
  const allTypes = [...retiredLineageTypes, ...remappedLineageTypes]
  const entityTypes = await client.query(
    `SELECT to_jsonb(source_row) AS row
     FROM public.data_lineage_entity_types source_row
     WHERE entity_type = ANY($1::text[])`,
    [allTypes],
  )
  const relationRules = await client.query(
    `SELECT to_jsonb(source_row) AS row
     FROM public.data_lineage_relation_rules source_row
     WHERE source_entity_type = ANY($1::text[])
        OR target_entity_type = ANY($1::text[])`,
    [retiredLineageTypes],
  )
  const lineageLinks = await client.query(
    `SELECT to_jsonb(source_row) AS row
     FROM public.data_lineage_links source_row
     WHERE source_entity_type = ANY($1::text[])
        OR target_entity_type = ANY($1::text[])`,
    [retiredLineageTypes],
  )
  const projectLinks = await client.query(
    `SELECT to_jsonb(source_row) AS row
     FROM public.project_entity_links source_row
     WHERE source_entity_type = ANY($1::text[])
        OR target_entity_type = ANY($1::text[])`,
    [retiredLineageTypes],
  )

  return {
    data_lineage_entity_types: entityTypes.rows.map((item) => item.row),
    data_lineage_relation_rules: relationRules.rows.map((item) => item.row),
    data_lineage_links: lineageLinks.rows.map((item) => item.row),
    project_entity_links: projectLinks.rows.map((item) => item.row),
  }
}

async function main() {
  const outputPath = parseOutputPath(process.argv.slice(2))
  const client = new Client(await resolveMigrationRuntimeConnectionConfig())
  await client.connect()

  try {
    const databaseIdentity = await client.query<{
      database_name: string
      current_user_name: string
      server_address: string | null
    }>(
      `SELECT current_database() AS database_name,
              current_user AS current_user_name,
              inet_server_addr()::text AS server_address`,
    )
    const runtimeRole = await client.query(
      `SELECT rolname, rolinherit, rolbypassrls
       FROM pg_roles
       WHERE rolname = 'workbuddy_runtime'`,
    )
    const migrationLedger = await client.query(
      `SELECT version, filename, checksum, applied_at
       FROM public.schema_migrations
       WHERE filename = ANY($1::text[])
       ORDER BY filename`,
      [[
        '303_v14231_duration_learning_operation_runtime_rls.sql',
        '304_v1420_viewer_wbs_legacy_closeout.sql',
      ]],
    )

    const relations: Record<string, unknown> = {}
    for (const tableName of schemaSnapshotTables) {
      const exists = await relationExists(client, tableName)
      relations[tableName] = exists
        ? {
            exists: true,
            schema: await readRelationSchema(client, tableName),
            rows: fullRowSnapshotTables.includes(tableName as typeof fullRowSnapshotTables[number])
              ? await readAllRows(client, tableName)
              : null,
          }
        : { exists: false, schema: null, rows: null }
    }

    const payload = {
      schemaVersion: 'workbuddy/v1420-legacy-closeout-backup/v1',
      generatedAt: new Date().toISOString(),
      purpose: 'Scoped before-image for migrations 303 and 304',
      rollbackMigration: 'server/migrations/rollback/304_v1420_viewer_wbs_legacy_closeout.sql',
      databaseIdentity: databaseIdentity.rows[0] ?? null,
      runtimeRole: runtimeRole.rows,
      migrationLedger: migrationLedger.rows,
      relations,
      lineageRows: await readLineageRows(client),
    }

    const serialized = `${JSON.stringify(payload, null, 2)}\n`
    const digest = createHash('sha256').update(serialized).digest('hex')
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await writeFile(
      `${outputPath}.sha256`,
      `${digest}  ${basename(outputPath)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    )

    console.log(JSON.stringify({
      status: 'pass',
      outputPath,
      sha256Path: `${outputPath}.sha256`,
      sha256: digest,
      relationCount: Object.keys(relations).length,
    }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
