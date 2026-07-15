import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')

dotenv.config({ path: path.join(repoRoot, 'server', '.env') })

const projectRef = (process.env.SUPABASE_URL || '').match(/^https:\/\/([^.]+)\.supabase\.co/i)?.[1]
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_MIGRATION_URL || process.env.POSTGRES_URL || ''

function describeConnection() {
  if (connectionString) {
    try {
      const parsed = new URL(connectionString)
      return {
        host: parsed.hostname,
        database: parsed.pathname.replace(/^\//, '') || 'postgres',
        user: decodeURIComponent(parsed.username || 'postgres'),
        projectRef: projectRef || null,
      }
    } catch {
      return {
        host: 'connection-string',
        database: 'unknown',
        user: 'unknown',
        projectRef: projectRef || null,
      }
    }
  }

  return {
    host: process.env.DB_HOST || process.env.SUPABASE_HOST || (projectRef ? `db.${projectRef}.supabase.co` : undefined),
    database: process.env.DB_NAME || process.env.SUPABASE_DATABASE || 'postgres',
    user: process.env.DB_USER || process.env.SUPABASE_USER || 'postgres',
    projectRef: projectRef || null,
  }
}

const connection = connectionString
  ? {
      connectionString,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || process.env.SUPABASE_HOST || (projectRef ? `db.${projectRef}.supabase.co` : undefined),
      port: Number(process.env.DB_PORT || process.env.SUPABASE_PORT || 5432),
      database: process.env.DB_NAME || process.env.SUPABASE_DATABASE || 'postgres',
      user: process.env.DB_USER || process.env.SUPABASE_USER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.SUPABASE_PASSWORD,
      ssl: { rejectUnauthorized: false },
    }

if (!connectionString && (!connection.host || !connection.password)) {
  throw new Error('Missing database connection. Provide DATABASE_URL/SUPABASE_MIGRATION_URL, or server/.env SUPABASE_URL and DB_PASSWORD/SUPABASE_PASSWORD.')
}

const qid = (value) => `"${String(value).replace(/"/g, '""')}"`
const qtable = (table) => `"public".${qid(table)}`

const client = new Client(connection)
const errors = []
const warnings = []
const checks = []

function recordCheck(name, status, details = {}) {
  checks.push({ name, status, ...details })
}

function recordIssue(level, code, table, message, detail = {}) {
  const target = level === 'error' ? errors : warnings
  target.push({ code, table, message, ...detail })
}

async function scalar(sql, params = []) {
  const result = await client.query(sql, params)
  return Number(result.rows[0]?.count || 0)
}

async function rows(sql, params = []) {
  const result = await client.query(sql, params)
  return result.rows
}

function has(columnsByTable, table, column) {
  return columnsByTable.get(table)?.has(column) === true
}

function sampleSelect(table, aliases) {
  const selected = aliases
    .filter(({ tableAlias, column }) => tableAlias !== 't' || column === 'ctid' || true)
    .map(({ tableAlias, column, as }) => `${tableAlias}.${qid(column)}::text as ${qid(as || column)}`)
  if (!selected.some((part) => part.includes('t."id"')) && table) {
    selected.unshift(`t.ctid::text as "row_ref"`)
  }
  return selected.join(', ')
}

async function countRows(table) {
  return scalar(`select count(*)::int as count from ${qtable(table)}`)
}

async function collectSchema() {
  const tableRows = await rows(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  `)

  const columnRows = await rows(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `)

  const tables = tableRows.map((row) => row.table_name)
  const columnsByTable = new Map()
  for (const table of tables) columnsByTable.set(table, new Set())
  for (const row of columnRows) {
    columnsByTable.get(row.table_name)?.add(row.column_name)
  }
  return { tables, columnsByTable }
}

async function checkCompanyAndProjectBoundaries(tables, columnsByTable) {
  const hasCompanies = tables.includes('companies')
  const hasProjects = tables.includes('projects')

  if (!hasCompanies) {
    recordIssue('error', 'missing_companies_table', 'companies', 'companies table is required for workspace isolation.')
  }
  if (!hasProjects) {
    recordIssue('error', 'missing_projects_table', 'projects', 'projects table is required for workspace isolation.')
    return
  }

  if (!has(columnsByTable, 'projects', 'company_id')) {
    const projectCount = await countRows('projects')
    recordIssue('error', 'projects_missing_company_id', 'projects', 'projects.company_id is required to isolate projects by company/workspace.', { count: projectCount })
  } else if (hasCompanies) {
    const count = await scalar(`
      select count(*)::int as count
      from public.projects p
      left join public.companies c on c.id::text = p.company_id::text
      where p.company_id is not null
        and c.id is null
    `)
    if (count > 0) {
      const sample = await rows(`
        select p.id::text as project_id, p.company_id::text as company_id
        from public.projects p
        left join public.companies c on c.id::text = p.company_id::text
        where p.company_id is not null
          and c.id is null
        limit 10
      `)
      recordIssue('error', 'project_orphan_company_id', 'projects', 'Projects reference missing company_id values.', { count, sample })
    }
  }

  for (const table of tables) {
    if (table === 'companies' || table === 'projects') continue

    if (hasCompanies && has(columnsByTable, table, 'company_id')) {
      const count = await scalar(`
        select count(*)::int as count
        from ${qtable(table)} t
        left join public.companies c on c.id::text = t.company_id::text
        where t.company_id is not null
          and c.id is null
      `)
      if (count > 0) {
        const sample = await rows(`
          select ${sampleSelect(table, [{ tableAlias: 't', column: 'company_id' }])}
          from ${qtable(table)} t
          left join public.companies c on c.id::text = t.company_id::text
          where t.company_id is not null
            and c.id is null
          limit 10
        `)
        recordIssue('error', 'orphan_company_id', table, 'Rows reference a missing company_id.', { count, sample })
      }
    }

    if (has(columnsByTable, table, 'project_id')) {
      const count = await scalar(`
        select count(*)::int as count
        from ${qtable(table)} t
        left join public.projects p on p.id::text = t.project_id::text
        where t.project_id is not null
          and p.id is null
      `)
      if (count > 0) {
        const sample = await rows(`
          select ${sampleSelect(table, [{ tableAlias: 't', column: 'project_id' }])}
          from ${qtable(table)} t
          left join public.projects p on p.id::text = t.project_id::text
          where t.project_id is not null
            and p.id is null
          limit 10
        `)
        recordIssue('error', 'orphan_project_id', table, 'Rows reference a missing project_id.', { count, sample })
      }
    }

    if (has(columnsByTable, 'projects', 'company_id') && has(columnsByTable, table, 'company_id') && has(columnsByTable, table, 'project_id')) {
      const count = await scalar(`
        select count(*)::int as count
        from ${qtable(table)} t
        join public.projects p on p.id::text = t.project_id::text
        where t.company_id is not null
          and p.company_id is not null
          and t.company_id::text <> p.company_id::text
      `)
      if (count > 0) {
        const sample = await rows(`
          select ${sampleSelect(table, [
            { tableAlias: 't', column: 'company_id' },
            { tableAlias: 't', column: 'project_id' },
          ])}, p.company_id::text as project_company_id
          from ${qtable(table)} t
          join public.projects p on p.id::text = t.project_id::text
          where t.company_id is not null
            and p.company_id is not null
            and t.company_id::text <> p.company_id::text
          limit 10
        `)
        recordIssue('error', 'project_company_mismatch', table, 'Rows carry a company_id different from the referenced project company.', { count, sample })
      }
    }
  }

  recordCheck('company/project boundary checks', 'done')
}

async function checkProjectMembershipBoundary(tables, columnsByTable) {
  if (!tables.includes('project_members')) {
    recordIssue('warning', 'missing_project_members_table', 'project_members', 'Project member table not found.')
    return
  }
  if (!tables.includes('company_members')) {
    recordIssue('warning', 'missing_company_members_table', 'company_members', 'Company member table not found; cannot verify project_members against company_members.')
    return
  }

  const count = await scalar(`
    select count(*)::int as count
    from public.project_members pm
    join public.projects p on p.id::text = pm.project_id::text
    left join public.company_members cm
      on cm.company_id::text = p.company_id::text
     and cm.user_id::text = pm.user_id::text
    where pm.project_id is not null
      and pm.user_id is not null
      and cm.user_id is null
  `)

  if (count > 0) {
    const sample = await rows(`
      select pm.id::text as project_member_id,
             pm.project_id::text as project_id,
             pm.user_id::text as user_id,
             p.company_id::text as project_company_id
      from public.project_members pm
      join public.projects p on p.id::text = pm.project_id::text
      left join public.company_members cm
        on cm.company_id::text = p.company_id::text
       and cm.user_id::text = pm.user_id::text
      where pm.project_id is not null
        and pm.user_id is not null
        and cm.user_id is null
      limit 10
    `)
    recordIssue('error', 'project_member_without_company_membership', 'project_members', 'Project member rows exist without matching company membership.', { count, sample })
  }

  if (has(columnsByTable, 'company_members', 'status')) {
    const inactiveCount = await scalar(`
      select count(*)::int as count
      from public.project_members pm
      join public.projects p on p.id::text = pm.project_id::text
      join public.company_members cm
        on cm.company_id::text = p.company_id::text
       and cm.user_id::text = pm.user_id::text
      where coalesce(cm.status, 'active') <> 'active'
    `)
    if (inactiveCount > 0) {
      const sample = await rows(`
        select pm.id::text as project_member_id,
               pm.project_id::text as project_id,
               pm.user_id::text as user_id,
               cm.status::text as company_member_status
        from public.project_members pm
        join public.projects p on p.id::text = pm.project_id::text
        join public.company_members cm
          on cm.company_id::text = p.company_id::text
         and cm.user_id::text = pm.user_id::text
        where coalesce(cm.status, 'active') <> 'active'
        limit 10
      `)
      recordIssue('warning', 'project_member_in_inactive_company_membership', 'project_members', 'Project member rows are tied to non-active company memberships.', { count: inactiveCount, sample })
    }
  }

  if (has(columnsByTable, 'projects', 'owner_id')) {
    const ownerCount = await scalar(`
      select count(*)::int as count
      from public.projects p
      left join public.company_members cm
        on cm.company_id::text = p.company_id::text
       and cm.user_id::text = p.owner_id::text
      where p.owner_id is not null
        and cm.user_id is null
    `)
    if (ownerCount > 0) {
      const sample = await rows(`
        select p.id::text as project_id,
               p.company_id::text as company_id,
               p.owner_id::text as owner_id
        from public.projects p
        left join public.company_members cm
          on cm.company_id::text = p.company_id::text
         and cm.user_id::text = p.owner_id::text
        where p.owner_id is not null
          and cm.user_id is null
        limit 10
      `)
      recordIssue('warning', 'project_owner_without_company_membership', 'projects', 'Project owner_id has no matching company membership.', { count: ownerCount, sample })
    }
  }

  recordCheck('project membership boundary checks', 'done')
}

const taskReferenceColumns = new Set([
  'task_id',
  'source_task_id',
  'target_task_id',
  'predecessor_task_id',
  'successor_task_id',
  'related_task_id',
  'linked_task_id',
  'parent_task_id',
])

const participantUnitColumns = new Set([
  'participant_unit_id',
  'responsible_unit_id',
  'supervision_unit_id',
  'supplier_unit_id',
])

const engineeringObjectColumns = new Set([
  'engineering_object_id',
  'professional_object_id',
  'building_object_id',
  'zone_object_id',
  'phase_object_id',
])

const globalReferenceTables = new Set([
  'companies',
  'company_members',
  'schema_migrations',
  'migration_history',
  'users',
  'profiles',
  'status_definitions',
  'metric_definitions',
  'metric_registry',
  'wbs_default_template_items',
  'wbs_default_templates',
  'wbs_template_presets',
  'engineering_category',
  'engineering_category_templates',
  'data_lineage_entity_types',
  'data_lineage_relation_rules',
  'dialog_frequency_settings',
  'job_failures',
  'standard_processes',
  'status_aliases',
  'status_dictionary_versions',
  'status_domains',
  'status_transitions',
  'status_values',
  'system_settings',
])

const inheritedScopedReferences = new Map([
  ['certificate_approvals', [{ column: 'pre_milestone_id', targetTable: 'pre_milestones' }]],
  ['drawing_package_items', [{ column: 'package_id', targetTable: 'drawing_packages' }]],
  ['pre_milestone_conditions', [{ column: 'pre_milestone_id', targetTable: 'pre_milestones' }]],
  ['task_preceding_relations', [
    { column: 'condition_id', targetTable: 'task_conditions' },
    { column: 'task_id', targetTable: 'tasks' },
  ]],
  ['task_progress_history', [{ column: 'task_id', targetTable: 'tasks' }]],
  ['task_progress_snapshots', [{ column: 'task_id', targetTable: 'tasks' }]],
])

function isInheritedScopedTable(tables, columnsByTable, table) {
  const references = inheritedScopedReferences.get(table)
  if (!references) return false

  return references.some(({ column, targetTable }) => (
    tables.includes(targetTable)
    && has(columnsByTable, table, column)
    && (has(columnsByTable, targetTable, 'project_id') || has(columnsByTable, targetTable, 'company_id'))
  ))
}

async function checkReferenceColumn(table, columnsByTable, column, targetTable, codePrefix) {
  if (!has(columnsByTable, table, column) || !has(columnsByTable, targetTable, 'id') || table === targetTable) return

  const targetProjectExpr = targetTable === 'tasks'
    ? 'ref.project_id'
    : targetTable === 'participant_units'
      ? 'ref.project_id'
      : targetTable === 'engineering_objects'
        ? 'ref.project_id'
        : null

  const count = await scalar(`
    select count(*)::int as count
    from ${qtable(table)} t
    left join ${qtable(targetTable)} ref on ref.id::text = t.${qid(column)}::text
    where t.${qid(column)} is not null
      and ref.id is null
  `)

  if (count > 0) {
    const sample = await rows(`
      select ${sampleSelect(table, [{ tableAlias: 't', column }])}
      from ${qtable(table)} t
      left join ${qtable(targetTable)} ref on ref.id::text = t.${qid(column)}::text
      where t.${qid(column)} is not null
        and ref.id is null
      limit 10
    `)
    recordIssue('error', `${codePrefix}_orphan_ref`, table, `${column} references a missing ${targetTable}.`, { column, targetTable, count, sample })
  }

  if (targetProjectExpr && has(columnsByTable, table, 'project_id') && has(columnsByTable, targetTable, 'project_id')) {
    const mismatchCount = await scalar(`
      select count(*)::int as count
      from ${qtable(table)} t
      join ${qtable(targetTable)} ref on ref.id::text = t.${qid(column)}::text
      where t.project_id is not null
        and ${targetProjectExpr} is not null
        and t.project_id::text <> ${targetProjectExpr}::text
    `)
    if (mismatchCount > 0) {
      const sample = await rows(`
        select ${sampleSelect(table, [
          { tableAlias: 't', column: 'project_id' },
          { tableAlias: 't', column },
        ])}, ${targetProjectExpr}::text as referenced_project_id
        from ${qtable(table)} t
        join ${qtable(targetTable)} ref on ref.id::text = t.${qid(column)}::text
        where t.project_id is not null
          and ${targetProjectExpr} is not null
          and t.project_id::text <> ${targetProjectExpr}::text
        limit 10
      `)
      recordIssue('error', `${codePrefix}_project_mismatch`, table, `${column} points to a ${targetTable} row in another project.`, { column, targetTable, count: mismatchCount, sample })
    }
  }
}

async function checkScopedReferences(tables, columnsByTable) {
  for (const table of tables) {
    const columns = columnsByTable.get(table) || new Set()
    for (const column of columns) {
      if (taskReferenceColumns.has(column) && tables.includes('tasks')) {
        await checkReferenceColumn(table, columnsByTable, column, 'tasks', 'task')
      }
      if (participantUnitColumns.has(column) && tables.includes('participant_units')) {
        await checkReferenceColumn(table, columnsByTable, column, 'participant_units', 'participant_unit')
      }
      if (engineeringObjectColumns.has(column) && tables.includes('engineering_objects')) {
        await checkReferenceColumn(table, columnsByTable, column, 'engineering_objects', 'engineering_object')
      }
    }

    for (const { column, targetTable } of inheritedScopedReferences.get(table) || []) {
      if (tables.includes(targetTable)) {
        await checkReferenceColumn(table, columnsByTable, column, targetTable, 'inherited_scope')
      }
    }
  }

  recordCheck('scoped reference checks', 'done')
}

async function checkUnscopedTables(tables, columnsByTable) {
  for (const table of tables) {
    const columns = columnsByTable.get(table) || new Set()
    if (
      columns.has('company_id')
      || columns.has('project_id')
      || globalReferenceTables.has(table)
      || isInheritedScopedTable(tables, columnsByTable, table)
    ) {
      continue
    }

    const count = await countRows(table)
    if (count > 0) {
      recordIssue(
        'warning',
        'data_table_without_company_or_project_scope',
        table,
        'Table has rows but no company_id/project_id column. Confirm it is intentionally global or scoped through another required parent.',
        { count },
      )
    }
  }

  recordCheck('unscoped data table review', 'done')
}

async function main() {
  const startedAt = new Date()
  await client.connect()
  await client.query('begin read only')

  try {
    const { tables, columnsByTable } = await collectSchema()
    recordCheck('schema loaded', 'done', { tables: tables.length })

    await checkCompanyAndProjectBoundaries(tables, columnsByTable)
    await checkProjectMembershipBoundary(tables, columnsByTable)
    await checkScopedReferences(tables, columnsByTable)
    await checkUnscopedTables(tables, columnsByTable)

    await client.query('commit')

    const finishedAt = new Date()
    const result = {
      checkedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      database: describeConnection(),
      summary: {
        status: errors.length === 0 ? 'pass' : 'fail',
        checks: checks.length,
        errors: errors.length,
        warnings: warnings.length,
      },
      checks,
      errors,
      warnings,
    }

    const reportDir = path.join(repoRoot, 'artifacts', 'reports')
    fs.mkdirSync(reportDir, { recursive: true })
    const stamp = finishedAt.toISOString().replace(/[:.]/g, '-')
    const jsonPath = path.join(reportDir, `live-workspace-isolation-regression-${stamp}.json`)
    fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')

    console.log(JSON.stringify({ ...result, reportPath: path.relative(repoRoot, jsonPath) }, null, 2))
    if (errors.length > 0) process.exitCode = 1
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
