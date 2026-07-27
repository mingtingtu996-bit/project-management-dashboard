#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness/default-master-plan-entry-template-preflight.json')

const REQUIRED_ENTRIES = [
  {
    businessType: 'general_civil',
    businessSubtype: 'civil_residential',
    code: 'residential_master_plan_v2',
    name: '住宅默认主计划入口模板',
    templateType: '住宅',
    description: '显式住宅默认主计划入口，仅用于触发 residential_master_plan_v2 候选主计划生成；不承载旧模板节点串行展开。',
  },
  ['hotel', '酒店', '商业', '酒店默认主计划入口模板'],
  ['hospital', '医院', '公共建筑', '医院默认主计划入口模板'],
  ['school', '学校', '公共建筑', '学校默认主计划入口模板'],
  ['industrial', '工业', '工业', '工业默认主计划入口模板'],
  ['data_center', '数据中心', '工业', '数据中心默认主计划入口模板'],
  ['transportation_hub', '交通枢纽', '市政', '交通枢纽默认主计划入口模板'],
  ['sports_culture', '体育文化', '公共建筑', '体育文化默认主计划入口模板'],
  ['tod_upper_cover', 'TOD上盖', '商业', 'TOD上盖默认主计划入口模板'],
  ['renovation', '改造修缮', '公共建筑', '改造修缮默认主计划入口模板'],
  ['modular_building', '模块化建筑', '工业', '模块化建筑默认主计划入口模板'],
].map((entry) => Array.isArray(entry)
  ? {
      businessType: entry[0],
      businessLabel: entry[1],
      businessSubtype: null,
      code: `${entry[0]}_master_plan_entry`,
      name: entry[3],
      templateType: entry[2],
      description: `显式${entry[1]}默认主计划入口，仅用于触发 managed_frontier_default_master_plan 候选主计划生成；不承载旧模板节点串行展开。`,
    }
  : entry)

const REQUIRED_COLUMNS = [
  'template_name',
  'template_type',
  'wbs_nodes',
  'standard_catalog_code',
]

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    output: DEFAULT_OUTPUT,
    execute: false,
    installedBy: '',
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }

    if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--execute') {
      options.execute = true
    } else if (arg === '--installed-by') {
      options.installedBy = nextValue()
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export async function ensureDefaultMasterPlanEntryTemplates({
  envFile = DEFAULT_ENV_FILE,
  output = DEFAULT_OUTPUT,
  execute = false,
  installedBy = '',
  queryExec = null,
  now = new Date(),
} = {}) {
  const normalized = {
    envFile: path.resolve(envFile),
    output: path.resolve(output),
    execute: Boolean(execute),
    installedBy: text(installedBy),
  }

  const exec = queryExec ?? await createPgQueryExec(normalized.envFile)
  try {
    const schema = await readTableColumns(exec, 'public', 'wbs_templates')
    const schemaBlockers = [
      schema.exists ? null : 'wbs_templates_table_missing',
      ...REQUIRED_COLUMNS.map((column) => schema.columns.has(column) ? null : `wbs_templates_${column}_column_missing`),
    ].filter(Boolean)
    const identityBlockers = normalized.execute && !normalized.installedBy
      ? ['installed_by_required_for_execute']
      : []

    const existingRows = schemaBlockers.length === 0
      ? await readExistingEntries(exec, schema)
      : []
    const plannedEntries = REQUIRED_ENTRIES.map((entry) => buildPlannedEntry(schema, entry, existingRows))
    const missingCount = plannedEntries.filter((entry) => entry.action === 'insert').length
    const updateCount = plannedEntries.filter((entry) => entry.action === 'update').length
    const duplicateCount = plannedEntries.reduce((sum, entry) => sum + Math.max(0, entry.matchingRowCount - 1), 0)
    const blockers = [...schemaBlockers, ...identityBlockers]
    const writes = []

    if (normalized.execute && blockers.length === 0) {
      for (const plan of plannedEntries) {
        if (plan.action === 'insert') {
          writes.push(await insertEntry(exec, schema, plan.entry, normalized, now))
        } else if (plan.action === 'update') {
          writes.push(await updateEntry(exec, schema, plan.existingRow, plan.entry, normalized, now))
        }
      }
    }

    const status = blockers.length > 0
      ? 'blocked'
      : normalized.execute
        ? 'executed'
        : missingCount === 0 && updateCount === 0
          ? 'ready'
          : 'changes_required'
    const report = {
      schemaVersion: 'workbuddy-default-master-plan-entry-template-preflight/v1',
      status,
      generatedAt: now.toISOString(),
      source: 'ensure-default-master-plan-entry-templates',
      mode: normalized.execute ? 'execute' : 'dry_run',
      requiredEntryCount: REQUIRED_ENTRIES.length,
      existingEntryCount: existingRows.length,
      missingEntryCount: missingCount,
      updateRequiredCount: updateCount,
      duplicateEntryCount: duplicateCount,
      blockers,
      entries: plannedEntries.map((plan) => ({
        businessType: plan.entry.businessType,
        businessSubtype: plan.entry.businessSubtype,
        standardCatalogCode: plan.entry.code,
        templateName: plan.entry.name,
        templateType: plan.entry.templateType,
        action: plan.action,
        existingId: text(plan.existingRow?.id) || null,
        matchingRowCount: plan.matchingRowCount,
        blockers: plan.blockers,
      })),
      executedWrites: writes,
      nextAction: status === 'changes_required'
        ? {
            command: [
              'npm', 'run', 'evidence:default-master-plan:ensure-entry-templates', '--',
              '--execute',
              '--installed-by', '<operator>',
            ],
            note: 'Run only after confirming the target DB is the intended staging/live environment. This installs explicit entry templates only; it does not generate baselines or production runtime data.',
          }
        : null,
      schemaHealth: {
        wbs_templates: {
          exists: schema.exists,
          columnCount: schema.columns.size,
        },
      },
      mutationBoundary: {
        readsDatabase: true,
        writesWbsTemplates: normalized.execute && blockers.length === 0,
        deletesWbsTemplates: false,
        writesTaskBaselines: false,
        writesTaskBaselineItems: false,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    }

    await mkdir(path.dirname(normalized.output), { recursive: true })
    await writeFile(normalized.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    return report
  } finally {
    await closeQueryExec(exec)
  }
}

async function readExistingEntries(queryExec, schema) {
  const codeColumn = quoteIdent('standard_catalog_code')
  const rows = await queryExec(
    `SELECT * FROM public.wbs_templates WHERE lower(${codeColumn}::text) = ANY($1::text[])`,
    [REQUIRED_ENTRIES.map((entry) => entry.code.toLowerCase())],
  )
  return Array.isArray(rows) ? rows : []
}

function buildPlannedEntry(schema, entry, existingRows) {
  const matchingRows = existingRows.filter((row) => normalize(row.standard_catalog_code) === normalize(entry.code))
  const existingRow = matchingRows[0] ?? null
  const blockers = [
    matchingRows.length > 1 ? 'duplicate_standard_catalog_code' : null,
  ].filter(Boolean)
  const action = existingRow
    ? isCompliantEntry(schema, existingRow, entry) && blockers.length === 0
      ? 'none'
      : 'update'
    : 'insert'
  return {
    entry,
    existingRow,
    matchingRowCount: matchingRows.length,
    action,
    blockers,
  }
}

function isCompliantEntry(schema, row, entry) {
  const projectOk = !schema.columns.has('project_id') || text(row.project_id) === ''
  const companyOk = !schema.columns.has('company_id') || text(row.company_id) === ''
  const scopeOk = !schema.columns.has('catalog_scope') || ['system', 'system_seed', 'global', 'national', 'global_dictionary'].includes(normalize(row.catalog_scope))
  const builtinOk = !schema.columns.has('is_builtin') || row.is_builtin === true
  const systemOk = !schema.columns.has('is_system') || row.is_system === true
  const notDraftDefaultOk = !schema.columns.has('is_default') || row.is_default === false
  const notConstructionDefaultOk = !schema.columns.has('is_construction_default') || row.is_construction_default === false
  const activeOk = !schema.columns.has('deleted_at') || row.deleted_at == null
  const statusOk = !schema.columns.has('status') || normalize(row.status) === 'published'
  const typeOk = normalize(row.template_type).includes(normalize(entry.templateType))
    || normalize(entry.templateType).includes(normalize(row.template_type))
  return projectOk
    && companyOk
    && scopeOk
    && builtinOk
    && systemOk
    && notDraftDefaultOk
    && notConstructionDefaultOk
    && activeOk
    && statusOk
    && normalize(row.standard_catalog_code) === normalize(entry.code)
    && typeOk
}

async function insertEntry(queryExec, schema, entry, options, now) {
  const payload = entryPayload(schema, entry, options, now)
  const { sql, params } = buildInsertSql('wbs_templates', payload, schema.columnTypes)
  const rows = await queryExec(sql, params)
  return {
    action: 'insert',
    standardCatalogCode: entry.code,
    id: text(rows[0]?.id) || null,
  }
}

async function updateEntry(queryExec, schema, row, entry, options, now) {
  const payload = entryPayload(schema, entry, options, now)
  delete payload.created_at
  delete payload.standard_catalog_code
  const { sql, params } = buildUpdateSql('wbs_templates', payload, schema.columnTypes)
  params.push(row.id)
  const rows = await queryExec(`${sql} WHERE "id" = $${params.length} RETURNING id`, params)
  return {
    action: 'update',
    standardCatalogCode: entry.code,
    id: text(rows[0]?.id ?? row.id) || null,
  }
}

function entryPayload(schema, entry, options, now) {
  const metadata = {
    source: 'default_master_plan_entry_template_preflight',
    installedBy: options.installedBy || null,
    installedAt: now.toISOString(),
    businessType: entry.businessType,
    businessLabel: entry.businessLabel ?? entry.templateType,
    businessSubtype: entry.businessSubtype,
    generationMode: entry.code === 'residential_master_plan_v2'
      ? 'residential_master_plan_v2'
      : 'managed_frontier_default_master_plan',
    mutationBoundary: {
      legacySerialTemplateFallback: false,
      writesTaskBaselines: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
  const values = {
    template_name: entry.name,
    template_type: entry.templateType,
    description: entry.description,
    wbs_nodes: [],
    is_default: false,
    is_construction_default: false,
    is_public: true,
    is_builtin: true,
    category: 'default_master_plan_entry',
    tags: ['default-master-plan', entry.businessType, entry.code],
    node_count: 0,
    reference_days: null,
    project_id: null,
    company_id: null,
    catalog_scope: 'system_seed',
    standard_catalog_code: entry.code,
    source_standard: 'workbuddy-default-master-plan',
    source_version: 'v1',
    metadata,
    template_data: {
      entryOnly: true,
      noTemplateNodeSerialExpansion: true,
      businessType: entry.businessType,
      businessLabel: entry.businessLabel ?? entry.templateType,
      businessSubtype: entry.businessSubtype,
    },
    is_system: true,
    status: 'published',
    deleted_at: null,
    updated_at: now.toISOString(),
    created_at: now.toISOString(),
  }
  return Object.fromEntries(Object.entries(values).filter(([key]) => schema.columns.has(key)))
}

function buildInsertSql(tableName, payload, columnTypes) {
  const columns = Object.keys(payload)
  const params = columns.map((column) => normalizeParamValue(payload[column], columnTypes.get(column)))
  const placeholders = columns.map((column, index) => `$${index + 1}${castSuffix(columnTypes.get(column))}`)
  return {
    sql: `INSERT INTO public.${quoteIdent(tableName)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    params,
  }
}

function buildUpdateSql(tableName, payload, columnTypes) {
  const columns = Object.keys(payload)
  const params = columns.map((column) => normalizeParamValue(payload[column], columnTypes.get(column)))
  const assignments = columns.map((column, index) => `${quoteIdent(column)} = $${index + 1}${castSuffix(columnTypes.get(column))}`)
  return {
    sql: `UPDATE public.${quoteIdent(tableName)} SET ${assignments.join(', ')}`,
    params,
  }
}

function normalizeParamValue(value, dataType) {
  if (dataType === 'jsonb' || dataType === 'json') return JSON.stringify(value ?? {})
  return value
}

function castSuffix(dataType) {
  if (dataType === 'jsonb') return '::jsonb'
  if (dataType === 'json') return '::json'
  return ''
}

async function readTableColumns(queryExec, schemaName, tableName) {
  const rows = await queryExec(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position`,
    [schemaName, tableName],
  )
  const columns = rows.map((row) => text(row.column_name)).filter(Boolean)
  return {
    exists: columns.length > 0,
    columns: new Set(columns),
    columnTypes: new Map(rows.map((row) => [text(row.column_name), text(row.data_type)])),
  }
}

async function createPgQueryExec(envFile) {
  const env = dotenv.parse(await readFile(envFile, 'utf8'))
  const connectionString = text(env.SUPABASE_MIGRATION_URL) || text(env.DB_CONNECTION_STRING)
  if (!connectionString) {
    throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required for default master-plan entry template preflight')
  }
  const client = new pg.Client({
    connectionString,
    ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 12000,
    statement_timeout: 12000,
  })
  await client.connect()
  const exec = async (sql, params = []) => {
    const result = await client.query(sql, params)
    return result.rows
  }
  exec.close = async () => {
    await client.end()
  }
  return exec
}

async function closeQueryExec(queryExec) {
  if (typeof queryExec?.close === 'function') await queryExec.close()
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function normalize(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function text(value) {
  return String(value ?? '').trim()
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseArgs()
  if (options.help) {
    console.log([
      'Usage: node project-testing/tools/ensure-default-master-plan-entry-templates.mjs',
      '  [--execute --installed-by <operator>] [--env-file <path>] [--output <json>]',
      '',
      'Default mode is dry-run. Execute mode only upserts explicit default master-plan entry templates.',
    ].join('\n'))
    process.exit(0)
  }
  const report = await ensureDefaultMasterPlanEntryTemplates(options)
  console.log(JSON.stringify({
    status: report.status,
    mode: report.mode,
    requiredEntryCount: report.requiredEntryCount,
    missingEntryCount: report.missingEntryCount,
    updateRequiredCount: report.updateRequiredCount,
    output: path.relative(REPO_ROOT, path.resolve(options.output)).replace(/\\/g, '/'),
    blockers: report.blockers,
    nextAction: report.nextAction,
  }, null, 2))
}
