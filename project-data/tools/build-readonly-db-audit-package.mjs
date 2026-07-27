#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const mutationBoundary = 'readonly_db_audit_package_only_no_db_connection_no_db_mutation'

function pathOf(relativePath) {
  return join(repoRoot, relativePath)
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(pathOf(relativePath), 'utf8'))
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    outputDir: null,
    pretty: true,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }

    if (arg === '--output-dir') args.outputDir = nextValue()
    else if (arg === '--compact') args.pretty = false
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

async function listContractFiles(relativeDir) {
  const entries = await readdir(pathOf(relativeDir), { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.contract.json'))
    .map((entry) => `${relativeDir}/${entry.name}`)
    .sort()
}

async function readTableContracts(tableCatalog) {
  const contracts = []
  for (const table of tableCatalog.tables) {
    if (!table.contractPath) continue
    contracts.push(await readJson(table.contractPath))
  }
  return contracts
}

function buildTablePresenceSql(tables) {
  const values = tables
    .map((table) => `(${sqlLiteral(table.schema || 'public')}, ${sqlLiteral(table.name || table.id)}, ${sqlLiteral(table.id)})`)
    .join(',\n    ')
  return `SELECT expected.table_id, expected.table_schema, expected.table_name, to_regclass(expected.table_schema || '.' || expected.table_name) IS NOT NULL AS table_exists
FROM (VALUES
    ${values}
) AS expected(table_schema, table_name, table_id)
ORDER BY expected.table_id;`
}

function isPhysicalPresenceRequired(table) {
  return table.physicalPresenceRequired !== false
}

function buildColumnPresenceSql(tableContracts) {
  const pairs = []
  for (const contract of tableContracts) {
    for (const concept of contract.requiredConcepts || []) {
      pairs.push(`(${sqlLiteral(contract.tableId)}, ${sqlLiteral(concept)})`)
    }
  }

  return `SELECT expected.table_name, expected.column_name, columns.column_name IS NOT NULL AS column_exists
FROM (VALUES
    ${pairs.join(',\n    ')}
) AS expected(table_name, column_name)
LEFT JOIN information_schema.columns columns
  ON columns.table_schema = 'public'
 AND columns.table_name = expected.table_name
 AND columns.column_name = expected.column_name
ORDER BY expected.table_name, expected.column_name;`
}

function qualityChecksForContract(contract) {
  const table = contract.tableId
  const rules = new Set(contract.qualityRules || [])
  const checks = []

  if (rules.has('project_id_required')) {
    checks.push({
      id: `${table}.project_id_required`,
      ruleId: 'project_id_required',
      sql: `SELECT count(*)::int AS missing_project_id FROM public.${table} WHERE project_id IS NULL;`,
    })
  }

  if (rules.has('company_id_required')) {
    checks.push({
      id: `${table}.company_id_required`,
      ruleId: 'company_id_required',
      sql: `SELECT count(*)::int AS missing_company_id FROM public.${table} WHERE company_id IS NULL;`,
    })
  }

  if (rules.has('progress_range_0_100')) {
    if (table === 'project_daily_snapshot') {
      checks.push({
        id: `${table}.progress_range_0_100`,
        ruleId: 'progress_range_0_100',
        sql: `SELECT count(*)::int AS invalid_progress
FROM public.${table}
WHERE (overall_progress IS NOT NULL AND (overall_progress < 0 OR overall_progress > 100))
   OR (task_progress IS NOT NULL AND (task_progress < 0 OR task_progress > 100))
   OR (planned_cumulative IS NOT NULL AND (planned_cumulative < 0 OR planned_cumulative > 100));`,
      })
    } else {
      checks.push({
        id: `${table}.progress_range_0_100`,
        ruleId: 'progress_range_0_100',
        sql: `SELECT count(*)::int AS invalid_progress FROM public.${table} WHERE progress IS NOT NULL AND (progress < 0 OR progress > 100);`,
      })
    }
  }

  if (rules.has('snapshot_date_required')) {
    checks.push({
      id: `${table}.snapshot_date_required`,
      ruleId: 'snapshot_date_required',
      sql: `SELECT count(*)::int AS missing_snapshot_date FROM public.${table} WHERE snapshot_date IS NULL;`,
    })
  }

  if (rules.has('one_snapshot_per_project_per_day')) {
    checks.push({
      id: `${table}.one_snapshot_per_project_per_day`,
      ruleId: 'one_snapshot_per_project_per_day',
      sql: `SELECT project_id, snapshot_date, count(*)::int AS row_count
FROM public.${table}
GROUP BY project_id, snapshot_date
HAVING count(*) > 1
ORDER BY row_count DESC, project_id, snapshot_date;`,
    })
  }

  if (rules.has('baseline_version_required')) {
    if (table === 'task_baselines') {
      checks.push({
        id: `${table}.baseline_version_required`,
        ruleId: 'baseline_version_required',
        sql: `SELECT count(*)::int AS missing_baseline_version
FROM public.${table}
WHERE status IN ('confirmed', 'pending_realign', 'archived', 'closed')
  AND version IS NULL;`,
      })
    } else if (table === 'task_baseline_items') {
      checks.push({
        id: `${table}.baseline_version_required`,
        ruleId: 'baseline_version_required',
        sql: `SELECT count(*)::int AS missing_baseline_version_id FROM public.${table} WHERE baseline_version_id IS NULL;`,
      })
    }
  }

  if (rules.has('baseline_dates_required_for_published_baseline') && table === 'task_baseline_items') {
    checks.push({
      id: `${table}.baseline_dates_required_for_published_baseline`,
      ruleId: 'baseline_dates_required_for_published_baseline',
      sql: `SELECT count(*)::int AS published_items_missing_dates
FROM public.task_baseline_items item
JOIN public.task_baselines baseline
  ON baseline.id = item.baseline_version_id
WHERE baseline.status IN ('confirmed', 'closed')
  AND (item.planned_start_date IS NULL OR item.planned_end_date IS NULL);`,
    })
  }

  if (rules.has('monthly_plan_month_required')) {
    checks.push({
      id: `${table}.monthly_plan_month_required`,
      ruleId: 'monthly_plan_month_required',
      sql: `SELECT count(*)::int AS missing_month FROM public.${table} WHERE month IS NULL OR trim(month) = '';`,
    })
  }

  if (rules.has('monthly_plan_status_required')) {
    checks.push({
      id: `${table}.monthly_plan_status_required`,
      ruleId: 'monthly_plan_status_required',
      sql: `SELECT count(*)::int AS missing_status FROM public.${table} WHERE status IS NULL OR trim(status) = '';`,
    })
  }

  if (rules.has('monthly_plan_item_plan_ref_required')) {
    checks.push({
      id: `${table}.monthly_plan_item_plan_ref_required`,
      ruleId: 'monthly_plan_item_plan_ref_required',
      sql: `SELECT count(*)::int AS missing_monthly_plan_version_id FROM public.${table} WHERE monthly_plan_version_id IS NULL;`,
    })
  }

  if (rules.has('monthly_plan_item_task_or_title_required')) {
    checks.push({
      id: `${table}.monthly_plan_item_task_or_title_required`,
      ruleId: 'monthly_plan_item_task_or_title_required',
      sql: `SELECT count(*)::int AS missing_task_or_title FROM public.${table} WHERE source_task_id IS NULL AND (title IS NULL OR trim(title) = '');`,
    })
  }

  if (rules.has('dependency_endpoints_required')) {
    checks.push({
      id: `${table}.dependency_endpoints_required`,
      ruleId: 'dependency_endpoints_required',
      sql: `SELECT count(*)::int AS missing_dependency_endpoint FROM public.${table} WHERE task_id IS NULL OR dependency_task_id IS NULL;`,
    })
  }

  if (rules.has('dependency_no_self_loop')) {
    checks.push({
      id: `${table}.dependency_no_self_loop`,
      ruleId: 'dependency_no_self_loop',
      sql: `SELECT count(*)::int AS self_loop_count FROM public.${table} WHERE task_id = dependency_task_id;`,
    })
  }

  if (rules.has('duration_sample_source_required')) {
    checks.push({
      id: `${table}.duration_sample_source_required`,
      ruleId: 'duration_sample_source_required',
      sql: `SELECT count(*)::int AS missing_source_type FROM public.${table} WHERE source_type IS NULL OR trim(source_type) = '';`,
    })
  }

  if (rules.has('duration_days_non_negative')) {
    checks.push({
      id: `${table}.duration_days_non_negative`,
      ruleId: 'duration_days_non_negative',
      sql: `SELECT count(*)::int AS negative_duration_count
FROM public.${table}
WHERE planned_duration < 0
   OR actual_duration < 0;`,
    })
  }

  if (rules.has('duration_sample_status_required')) {
    checks.push({
      id: `${table}.duration_sample_status_required`,
      ruleId: 'duration_sample_status_required',
      sql: `SELECT count(*)::int AS missing_sample_status FROM public.${table} WHERE sample_status IS NULL OR trim(sample_status) = '';`,
    })
  }

  if (rules.has('source_key_required')) {
    checks.push({
      id: `${table}.source_key_required`,
      ruleId: 'source_key_required',
      sql: `SELECT count(*)::int AS missing_source_key FROM public.${table} WHERE source_key IS NULL OR trim(source_key) = '';`,
    })
  }

  if (rules.has('source_url_or_locator_required')) {
    checks.push({
      id: `${table}.source_url_or_locator_required`,
      ruleId: 'source_url_or_locator_required',
      sql: `SELECT count(*)::int AS missing_source_locator
FROM public.${table}
WHERE coalesce(source_url, '') = ''
  AND (source_metadata IS NULL OR source_metadata = '{}'::jsonb);`,
    })
  }

  if (rules.has('trust_level_required')) {
    checks.push({
      id: `${table}.trust_level_required`,
      ruleId: 'trust_level_required',
      sql: `SELECT count(*)::int AS missing_trust_level FROM public.${table} WHERE source_trust_level IS NULL OR trim(source_trust_level) = '';`,
    })
  }

  if (rules.has('source_governance_status_required')) {
    checks.push({
      id: `${table}.source_governance_status_required`,
      ruleId: 'source_governance_status_required',
      sql: `SELECT count(*)::int AS missing_governance_status FROM public.${table} WHERE governance_status IS NULL OR trim(governance_status) = '';`,
    })
  }

  if (rules.has('document_key_required')) {
    checks.push({
      id: `${table}.document_key_required`,
      ruleId: 'document_key_required',
      sql: `SELECT count(*)::int AS missing_document_key FROM public.${table} WHERE document_key IS NULL OR trim(document_key) = '';`,
    })
  }

  if (rules.has('document_type_required')) {
    checks.push({
      id: `${table}.document_type_required`,
      ruleId: 'document_type_required',
      sql: `SELECT count(*)::int AS missing_document_type FROM public.${table} WHERE document_type IS NULL OR trim(document_type) = '';`,
    })
  }

  if (rules.has('extraction_status_required')) {
    checks.push({
      id: `${table}.extraction_status_required`,
      ruleId: 'extraction_status_required',
      sql: `SELECT count(*)::int AS missing_extraction_status FROM public.${table} WHERE extraction_status IS NULL OR trim(extraction_status) = '';`,
    })
  }

  if (rules.has('hash_required_when_downloaded')) {
    checks.push({
      id: `${table}.hash_required_when_downloaded`,
      ruleId: 'hash_required_when_downloaded',
      sql: `SELECT count(*)::int AS downloaded_without_hash FROM public.${table} WHERE coalesce(storage_path, '') <> '' AND coalesce(content_hash, '') = '';`,
    })
  }

  return checks
}

function renderSqlFile(readonlySql) {
  const sections = [
    ['Schema inventory', readonlySql.schemaInventory],
    ['Catalog table presence', readonlySql.catalogTablePresence],
    ['Contract column presence', readonlySql.contractColumnPresence],
    ...readonlySql.qualityChecks.map((check) => [`Quality check: ${check.id}`, check.sql]),
  ]

  return [
    '-- WorkBuddy read-only DB audit package',
    `-- Mutation boundary: ${mutationBoundary}`,
    '-- Execute only against explicitly approved read-only/staging review targets.',
    '',
    ...sections.flatMap(([title, sql]) => [`-- ${title}`, `${sql.trim()};`, '']),
  ].join('\n')
}

function renderMarkdown(pkg) {
  return [
    '# WorkBuddy Read-Only DB Audit Package',
    '',
    `- Schema: \`${pkg.schemaVersion}\``,
    `- Mutation boundary: \`${pkg.mutationBoundary}\``,
    `- Tables in catalog: ${pkg.summary.tableCount}`,
    `- Table contracts: ${pkg.summary.tableContractCount}`,
    `- Quality checks: ${pkg.readonlySql.qualityChecks.length}`,
    '',
    '## Commands',
    '',
    '```powershell',
    'npm run data:readonly-preflight',
    'npm run data:readonly-audit-package -- --output-dir project-data/reports/readonly-db-audit-package',
    '```',
    '',
    '## Required Environment',
    '',
    ...pkg.requiredEnvironment.map((key) => `- \`${key}\``),
    '',
    '## SQL Files',
    '',
    '- `readonly-db-audit.sql`: schema inventory, table presence, column presence, and read-only quality checks.',
    '',
    'No SQL in this package mutates database state.',
    '',
  ].join('\n')
}

async function buildPackage() {
  const tableCatalog = await readJson('project-data/catalog/tables.json')
  const writerRegistry = await readJson('project-data/lineage/writers.json')
  const qualityRules = await readJson('project-data/quality/rules.json')
  const tableContracts = await readTableContracts(tableCatalog)
  const physicalTables = tableCatalog.tables.filter(isPhysicalPresenceRequired)
  const runtimeContractFiles = [
    ...await listContractFiles('project-data/contracts/runtime-writers'),
    ...await listContractFiles('project-data/contracts/candidate-assets'),
  ]

  const qualityChecks = tableContracts.flatMap(qualityChecksForContract)
  const readonlySql = {
    schemaInventory: `SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_schema, table_name, ordinal_position`,
    catalogTablePresence: buildTablePresenceSql(physicalTables),
    contractColumnPresence: buildColumnPresenceSql(tableContracts),
    qualityChecks,
  }

  return {
    schemaVersion: 'workbuddy-readonly-db-audit-package/v1',
    generatedAt: new Date().toISOString(),
    mutationBoundary,
    summary: {
      tableCount: tableCatalog.tables.length,
      physicalTableAuditCount: physicalTables.length,
      tableContractCount: tableContracts.length,
      runtimeContractCount: runtimeContractFiles.length,
      writerCount: writerRegistry.writers.length,
      qualityRuleCount: qualityRules.rules.length,
    },
    requiredEnvironment: [
      'SUPABASE_ACCESS_TOKEN',
      'WORKBUDDY_SUPABASE_PROJECT_REF',
      'WORKBUDDY_PG_HOST',
      'WORKBUDDY_PG_PORT',
      'WORKBUDDY_PG_DATABASE',
      'WORKBUDDY_PG_USER',
      'WORKBUDDY_PG_PASSWORD',
    ],
    preflightCommand: 'npm run data:readonly-preflight',
    readonlySql,
    outputFiles: [
      'readonly-db-audit-package.json',
      'readonly-db-audit-package.md',
      'readonly-db-audit.sql',
    ],
  }
}

async function writePackage(outputDir, pkg) {
  const targetDir = resolve(repoRoot, outputDir)
  await mkdir(targetDir, { recursive: true })
  await writeFile(join(targetDir, 'readonly-db-audit-package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  await writeFile(join(targetDir, 'readonly-db-audit-package.md'), renderMarkdown(pkg), 'utf8')
  await writeFile(join(targetDir, 'readonly-db-audit.sql'), renderSqlFile(pkg.readonlySql), 'utf8')
}

async function main() {
  const args = parseArgs()
  const pkg = await buildPackage()
  if (args.outputDir) await writePackage(args.outputDir, pkg)
  console.log(JSON.stringify({
    status: 'passed',
    outputDir: args.outputDir,
    tableContracts: pkg.summary.tableContractCount,
    qualityChecks: pkg.readonlySql.qualityChecks.length,
    outputFiles: args.outputDir ? pkg.outputFiles : [],
    mutationBoundary,
    package: args.outputDir ? undefined : pkg,
  }, null, args.pretty ? 2 : 0))
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'failed',
    message: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
