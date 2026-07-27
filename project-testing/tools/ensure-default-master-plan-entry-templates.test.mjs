import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ensureDefaultMasterPlanEntryTemplates } from './ensure-default-master-plan-entry-templates.mjs'

test('dry-runs missing explicit default master-plan entry templates without DB writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-entry-templates-'))
  const output = path.join(root, 'entry-template-preflight.json')
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return wbsTemplateColumns()
    if (sql.includes('FROM public.wbs_templates')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await ensureDefaultMasterPlanEntryTemplates({
      output,
      queryExec,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'changes_required')
    assert.equal(report.mode, 'dry_run')
    assert.equal(report.requiredEntryCount, 11)
    assert.equal(report.missingEntryCount, 11)
    assert.equal(report.updateRequiredCount, 0)
    assert.equal(report.mutationBoundary.writesWbsTemplates, false)
    assert.equal(queries.some((query) => /\b(?:INSERT|UPDATE|DELETE)\b/i.test(query.sql)), false)
    assert.match(report.nextAction.command.join(' '), /--execute --installed-by <operator>/)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.schemaVersion, 'workbuddy-default-master-plan-entry-template-preflight/v1')
    assert.equal(written.entries[0].standardCatalogCode, 'residential_master_plan_v2')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('execute mode inserts missing entry templates only with operator identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-entry-templates-'))
  const output = path.join(root, 'entry-template-preflight.json')
  const writes = []
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return wbsTemplateColumns()
    if (sql.includes('FROM public.wbs_templates')) return []
    if (/^\s*INSERT\b/i.test(sql)) {
      writes.push({ sql, params })
      return [{ id: `template-${writes.length}` }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await ensureDefaultMasterPlanEntryTemplates({
      output,
      execute: true,
      installedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'executed')
    assert.equal(report.mode, 'execute')
    assert.equal(report.executedWrites.length, 11)
    assert.equal(writes.length, 11)
    assert.equal(report.mutationBoundary.writesWbsTemplates, true)
    assert.equal(report.mutationBoundary.writesTaskBaselines, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(writes.every((write) => write.sql.includes('standard_catalog_code')), true)
    assert.equal(writes.every((write) => {
      const templateTypeIndex = columnIndex(write.sql, 'template_type')
      const templateType = write.params[templateTypeIndex]
      return ['住宅', '商业', '工业', '公共建筑', '市政'].includes(templateType)
    }), true)
    assert.equal(writes.every((write) => write.params[columnIndex(write.sql, 'is_default')] === false), true)
    assert.equal(writes.every((write) => write.params[columnIndex(write.sql, 'is_construction_default')] === false), true)
    assert.equal(writes.every((write) => write.params[columnIndex(write.sql, 'deleted_at')] === null), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('execute mode updates existing draft-marked entry templates into published trigger entries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-entry-templates-'))
  const output = path.join(root, 'entry-template-preflight.json')
  const writes = []
  const reads = []
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return wbsTemplateColumns()
    if (sql.includes('FROM public.wbs_templates')) {
      reads.push({ sql, params })
      return [
        {
          id: 'old-residential-entry',
          template_name: '旧住宅入口',
          template_type: '住宅',
          wbs_nodes: [],
          standard_catalog_code: 'residential_master_plan_v2',
          project_id: null,
          company_id: null,
          catalog_scope: 'system_seed',
          is_builtin: true,
          is_system: true,
          is_default: true,
          is_construction_default: true,
          status: 'draft',
          deleted_at: '2026-07-01T00:00:00.000Z',
        },
      ]
    }
    if (/^\s*UPDATE\b/i.test(sql) || /^\s*INSERT\b/i.test(sql)) {
      writes.push({ sql, params })
      return [{ id: /^\s*UPDATE\b/i.test(sql) ? 'old-residential-entry' : `template-${writes.length}` }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await ensureDefaultMasterPlanEntryTemplates({
      output,
      execute: true,
      installedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'executed')
    assert.equal(report.updateRequiredCount, 1)
    assert.equal(report.entries.find((entry) => entry.standardCatalogCode === 'residential_master_plan_v2').action, 'update')
    assert.equal(reads.every((read) => !read.sql.includes('"deleted_at" IS NULL')), true)

    const update = writes.find((write) => /^\s*UPDATE\b/i.test(write.sql))
    assert.ok(update, 'expected update for existing draft-marked entry')
    assert.equal(update.params[assignmentIndex(update.sql, 'is_default')], false)
    assert.equal(update.params[assignmentIndex(update.sql, 'is_construction_default')], false)
    assert.equal(update.params[assignmentIndex(update.sql, 'status')], 'published')
    assert.equal(update.params[assignmentIndex(update.sql, 'deleted_at')], null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks execute mode without operator identity before writing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-entry-templates-'))
  const output = path.join(root, 'entry-template-preflight.json')
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return wbsTemplateColumns()
    if (sql.includes('FROM public.wbs_templates')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await ensureDefaultMasterPlanEntryTemplates({
      output,
      execute: true,
      queryExec,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.deepEqual(report.blockers, ['installed_by_required_for_execute'])
    assert.equal(report.executedWrites.length, 0)
    assert.equal(queries.some((query) => /^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(query.sql)), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function wbsTemplateColumns() {
  return [
    ['id', 'uuid'],
    ['template_name', 'text'],
    ['template_type', 'text'],
    ['description', 'text'],
    ['wbs_nodes', 'jsonb'],
    ['is_default', 'boolean'],
    ['is_construction_default', 'boolean'],
    ['is_public', 'boolean'],
    ['is_builtin', 'boolean'],
    ['category', 'text'],
    ['tags', 'ARRAY'],
    ['node_count', 'integer'],
    ['reference_days', 'integer'],
    ['project_id', 'uuid'],
    ['company_id', 'uuid'],
    ['catalog_scope', 'text'],
    ['standard_catalog_code', 'text'],
    ['source_standard', 'text'],
    ['source_version', 'text'],
    ['metadata', 'jsonb'],
    ['template_data', 'jsonb'],
    ['is_system', 'boolean'],
    ['status', 'text'],
    ['deleted_at', 'timestamp with time zone'],
    ['created_at', 'timestamp with time zone'],
    ['updated_at', 'timestamp with time zone'],
  ].map(([column_name, data_type]) => ({ column_name, data_type }))
}

function columnIndex(sql, columnName) {
  const match = sql.match(/\(([^)]+)\)\s+VALUES/i)
  assert.ok(match, `cannot parse insert columns from SQL: ${sql}`)
  const columns = match[1].split(',').map((column) => column.trim().replace(/^"|"$/g, ''))
  const index = columns.indexOf(columnName)
  assert.notEqual(index, -1, `${columnName} missing from SQL columns`)
  return index
}

function assignmentIndex(sql, columnName) {
  const match = sql.match(/\bSET\s+(.+?)\s+WHERE\b/i)
  assert.ok(match, `cannot parse update assignments from SQL: ${sql}`)
  const assignments = match[1].split(',').map((assignment) => assignment.trim())
  const index = assignments.findIndex((assignment) => assignment.startsWith(`"${columnName}" = `))
  assert.notEqual(index, -1, `${columnName} missing from SQL assignments`)
  return index
}
