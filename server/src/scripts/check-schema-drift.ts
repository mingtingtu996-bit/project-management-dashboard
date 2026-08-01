import { promises as fs } from 'node:fs'
import { setDefaultResultOrder } from 'node:dns'
import { resolve } from 'node:path'

import pg from 'pg'

import {
  discoverMigrationFiles,
  readMigrationSql,
  resolveMigrationRuntimeConnectionConfig,
} from '../services/migrationRunner.js'
import {
  evaluateSchemaDrift,
  type SchemaDriftActualTable,
  type SchemaDriftConstraint,
  type SchemaDriftIndex,
  type SchemaDriftPolicy,
} from '../services/migrationSafetyGateService.js'
import {
  introspectActualExtendedSchema,
  type SchemaDriftCatalogQueryClient,
} from '../services/schemaDriftExtendedIntrospectionService.js'
import {
  buildExpectedExtendedSchemaFromMigrationSql,
  evaluateExtendedSchemaDrift,
} from '../services/schemaDriftExtendedObjectService.js'
import { buildExpectedSchemaFromMigrationSql } from '../services/schemaDriftExpectedSchemaParser.js'

const { Client } = pg

const migrationsDir = resolve(process.cwd(), 'migrations')
const IGNORED_LEGACY_OBJECTS = [
  'schema_migrations',
] as const

type ActualColumnRow = {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: 'YES' | 'NO'
  column_default: string | null
}

type RlsRow = {
  table_name: string
  enabled: boolean
  forced: boolean
}

type PolicyRow = {
  tablename: string
  policyname: string
  cmd: string | null
  qual: string | null
  with_check: string | null
}

type ConstraintRow = {
  table_name: string
  constraint_name: string
  constraint_type: 'p' | 'f' | 'u' | 'c'
  definition: string
}

type IndexRow = {
  table_name: string
  index_name: string
  definition: string
}

async function main() {
  setDefaultResultOrder('ipv4first')

  const migrationSql = await readCombinedMigrationSql()
  const expectedTables = buildExpectedSchemaFromMigrationSql(migrationSql)
  const expectedExtended = buildExpectedExtendedSchemaFromMigrationSql(migrationSql)

  const client = new Client(await resolveMigrationRuntimeConnectionConfig())
  await client.connect()

  try {
    const actualTables = await introspectActualPublicSchema(client)
    const result = evaluateSchemaDrift({
      expectedTables,
      actualTables,
      coverageBacklog: [],
      ignoredLegacyObjects: IGNORED_LEGACY_OBJECTS,
    })
    const managedSchemas = collectManagedSchemas(expectedExtended)
    const actualExtended = await introspectActualExtendedSchema(
      client as unknown as SchemaDriftCatalogQueryClient,
      {
        schemas: managedSchemas,
        extensionNames: expectedExtended.extensions.map((extension) => extension.extensionName),
      },
    )
    const extendedResult = evaluateExtendedSchemaDrift({
      expected: expectedExtended,
      actual: actualExtended,
    })
    const status = result.status === 'fail' || extendedResult.status === 'fail' ? 'fail' : 'pass'

    console.log(JSON.stringify({
      gate: 'migrate:drift',
      status,
      blockingDrift: [...result.blockingDrift, ...extendedResult.blockingDrift],
      coverageBacklog: [],
      ignoredLegacyObjects: result.ignoredLegacyObjects,
      coverageNote: 'blockingDrift covers managed tables, columns, constraints, indexes, RLS state/policies, triggers, functions, views, enums, declared extensions, and explicit/default grants or revocations.',
    }, null, 2))

    if (status === 'fail') {
      process.exitCode = 1
    }
  } finally {
    await client.end()
  }
}

async function readCombinedMigrationSql() {
  const migrations = await discoverMigrationFiles(migrationsDir)
  const migrationSql = await Promise.all(migrations.map((migration) => readMigrationSql(migration)))

  return migrationSql.join('\n\n')
}

function collectManagedSchemas(catalog: ReturnType<typeof buildExpectedExtendedSchemaFromMigrationSql>) {
  return Array.from(new Set([
    'public',
    ...catalog.triggers.map((item) => item.schemaName),
    ...catalog.functions.map((item) => item.schemaName),
    ...catalog.views.map((item) => item.schemaName),
    ...catalog.enums.map((item) => item.schemaName),
    ...catalog.grants.map((item) => item.schemaName),
  ])).sort()
}

async function introspectActualPublicSchema(client: InstanceType<typeof Client>): Promise<SchemaDriftActualTable[]> {
  const columnsResult = await client.query<ActualColumnRow>(`
      SELECT c.relname AS table_name,
             a.attname AS column_name,
             format_type(a.atttypid, a.atttypmod) AS data_type,
             CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
             pg_get_expr(ad.adbin, ad.adrelid) AS column_default
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY c.relname ASC, a.attnum ASC
    `)
  const rlsResult = await client.query<RlsRow>(`
      SELECT c.relname AS table_name,
             c.relrowsecurity AS enabled,
             c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY c.relname ASC
    `)
  const policiesResult = await client.query<PolicyRow>(`
      SELECT tablename, policyname, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename ASC, policyname ASC
    `)
  const constraintsResult = await client.query<ConstraintRow>(`
      SELECT c.relname AS table_name,
             con.conname AS constraint_name,
             con.contype AS constraint_type,
             pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND con.contype IN ('p', 'f', 'u', 'c')
      ORDER BY c.relname ASC, con.conname ASC
    `)
  const indexesResult = await client.query<IndexRow>(`
      SELECT table_class.relname AS table_name,
             index_class.relname AS index_name,
             pg_get_indexdef(index_class.oid) AS definition
      FROM pg_index idx
      JOIN pg_class index_class ON index_class.oid = idx.indexrelid
      JOIN pg_class table_class ON table_class.oid = idx.indrelid
      JOIN pg_namespace n ON n.oid = table_class.relnamespace
      LEFT JOIN pg_constraint con
        ON con.conindid = index_class.oid
       AND con.conrelid = table_class.oid
      WHERE n.nspname = 'public'
        AND con.oid IS NULL
      ORDER BY table_class.relname ASC, index_class.relname ASC
    `)

  const tables = new Map<string, SchemaDriftActualTable>()
  const rlsByTable = new Map(rlsResult.rows.map((row) => [row.table_name, row]))
  const policiesByTable = new Map<string, SchemaDriftPolicy[]>()
  const constraintsByTable = new Map<string, SchemaDriftConstraint[]>()
  const indexesByTable = new Map<string, SchemaDriftIndex[]>()

  for (const policy of policiesResult.rows) {
    const policies = policiesByTable.get(policy.tablename) ?? []
    policies.push({
      policyName: policy.policyname,
      command: policy.cmd,
      usingExpression: policy.qual,
      withCheckExpression: policy.with_check,
    })
    policiesByTable.set(policy.tablename, policies)
  }

  for (const constraint of constraintsResult.rows) {
    const constraints = constraintsByTable.get(constraint.table_name) ?? []
    constraints.push({
      constraintName: constraint.constraint_name,
      constraintType: mapConstraintType(constraint.constraint_type),
      definition: constraint.definition,
    })
    constraintsByTable.set(constraint.table_name, constraints)
  }

  for (const index of indexesResult.rows) {
    const indexes = indexesByTable.get(index.table_name) ?? []
    indexes.push({
      indexName: index.index_name,
      definition: index.definition,
    })
    indexesByTable.set(index.table_name, indexes)
  }

  for (const column of columnsResult.rows) {
    const table = tables.get(column.table_name) ?? {
      tableName: column.table_name,
      columns: [],
      constraints: constraintsByTable.get(column.table_name) ?? [],
      indexes: indexesByTable.get(column.table_name) ?? [],
      rls: {
        enabled: rlsByTable.get(column.table_name)?.enabled ?? false,
        forced: rlsByTable.get(column.table_name)?.forced ?? false,
        policies: policiesByTable.get(column.table_name) ?? [],
      },
    }

    table.columns.push({
      columnName: column.column_name,
      dataType: normalizePostgresType(column.data_type),
      nullable: column.is_nullable === 'YES',
      defaultExpression: column.column_default,
    })
    tables.set(column.table_name, table)
  }

  return Array.from(tables.values()).map((table) => ({
    ...table,
    columns: table.columns.sort((left, right) => left.columnName.localeCompare(right.columnName)),
    constraints: (table.constraints ?? []).sort((left, right) => left.constraintName.localeCompare(right.constraintName)),
    indexes: (table.indexes ?? []).sort((left, right) => left.indexName.localeCompare(right.indexName)),
    rls: {
      enabled: table.rls?.enabled ?? false,
      forced: table.rls?.forced ?? false,
      policies: (table.rls?.policies ?? []).sort((left, right) => left.policyName.localeCompare(right.policyName)),
    },
  }))
}

function mapConstraintType(value: ConstraintRow['constraint_type']): SchemaDriftConstraint['constraintType'] {
  if (value === 'p') return 'primary_key'
  if (value === 'f') return 'foreign_key'
  if (value === 'u') return 'unique_constraint'
  return 'check_constraint'
}

function normalizePostgresType(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase()
  const withoutLength = normalized.replace(/\(\s*\d+(?:\s*,\s*\d+)?\s*\)/g, '')
  const aliases: Record<string, string> = {
    bool: 'boolean',
    int: 'integer',
    int4: 'integer',
    int8: 'bigint',
    serial: 'integer',
    bigserial: 'bigint',
    varchar: 'character varying',
    'timestamp with time zone': 'timestamp with time zone',
    timestamptz: 'timestamp with time zone',
    timestamp: 'timestamp without time zone',
  }

  return aliases[withoutLength] ?? withoutLength
}

main().catch(async (error) => {
  const cwd = process.cwd()
  const hintPath = resolve(cwd, 'migrations')
  const exists = await fs.stat(hintPath).then(() => true).catch(() => false)
  console.error('Schema drift check failed:', {
    error,
    migrationsDirectory: hintPath,
    migrationsDirectoryExists: exists,
  })
  process.exitCode = 1
})
