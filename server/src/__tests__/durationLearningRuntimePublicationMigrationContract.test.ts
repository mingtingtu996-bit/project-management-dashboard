import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const migrationPath = resolve(
  serverRoot,
  'migrations',
  '315_duration_learning_runtime_publications.sql',
)

const rollbackPath = resolve(
  serverRoot,
  'migrations',
  'rollback',
  '315_duration_learning_runtime_publications.sql',
)

function readSql(path: string) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

describe('duration learning runtime publication migration', () => {
  it('creates one executable publication boundary for every learnable duration asset scope', () => {
    const sql = readSql(migrationPath)

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.duration_learning_runtime_publications')
    for (const assetKey of [
      'base_duration_benchmark',
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
    ]) {
      expect(sql).toContain(`'${assetKey}'`)
    }
    for (const scope of ['project', 'company', 'industry', 'global']) {
      expect(sql).toContain(`'${scope}'`)
    }
    for (const stage of ['canary', 'stable', 'superseded', 'rolled_back']) {
      expect(sql).toContain(`'${stage}'`)
    }

    expect(sql).toContain('runtime_payload JSONB NOT NULL')
    expect(sql).toContain('previous_publication_key TEXT NULL')
    expect(sql).toContain('traffic_percent INTEGER NOT NULL')
    expect(sql).toContain('monitoring_status TEXT NOT NULL')
    expect(sql).toContain('impact_metrics JSONB NOT NULL')
    expect(sql).toContain('rollback_execution JSONB NULL')
    expect(sql).toContain('duration_learning_runtime_publications_scope_consistency')
    expect(sql).toContain('duration_learning_runtime_publications_identity_key')
    expect(sql).toMatch(
      /UNIQUE\s*\(\s*publication_key\s*,\s*asset_key\s*,\s*artifact_key\s*\)/i,
    )
    expect(sql).toContain('uq_duration_learning_runtime_publications_active_scope')
  })

  it('persists trusted append-only runtime consumption lineage outside business metadata', () => {
    const sql = readSql(migrationPath)
    const tableStart = sql.indexOf(
      'CREATE TABLE IF NOT EXISTS public.duration_learning_runtime_consumptions',
    )
    const tableEnd = sql.indexOf(');', tableStart)
    const tableSql = sql.slice(tableStart, tableEnd + 2)

    expect(tableStart).toBeGreaterThan(-1)
    for (const field of [
      'company_id UUID NOT NULL',
      'project_id UUID NOT NULL',
      'publication_key TEXT NOT NULL',
      'asset_key TEXT NOT NULL',
      'artifact_key TEXT NOT NULL',
      'consumer_key TEXT NOT NULL',
      'consumer_surface TEXT NOT NULL',
      'task_id UUID NULL',
      'baseline_item_id UUID NULL',
      'generation_batch_id TEXT NULL',
      'template_id TEXT NULL',
      'duration_day_basis TEXT NOT NULL',
      'applied_duration_days NUMERIC',
      'source_evidence_refs JSONB NOT NULL',
      'consumption_context JSONB NOT NULL',
    ]) {
      expect(tableSql).toContain(field)
    }

    expect(tableSql).toContain('duration_learning_runtime_consumptions_publication_identity_fkey')
    expect(tableSql).toMatch(
      /FOREIGN KEY\s*\(\s*publication_key\s*,\s*asset_key\s*,\s*artifact_key\s*\)[\s\S]+REFERENCES public\.duration_learning_runtime_publications\s*\(\s*publication_key\s*,\s*asset_key\s*,\s*artifact_key\s*\)/i,
    )
    expect(tableSql).toContain('duration_learning_runtime_consumptions_subject_consistency')
    expect(tableSql).toContain("duration_day_basis = 'construction_production_day'")
    expect(tableSql).toMatch(/applied_duration_days\s+IS\s+NULL\s+OR\s+applied_duration_days\s*>\s*0/i)
    expect(tableSql).toMatch(/jsonb_typeof\(source_evidence_refs\)\s*=\s*'array'/i)
    expect(tableSql).toMatch(/jsonb_typeof\(consumption_context\)\s*=\s*'object'/i)
    expect(tableSql).not.toMatch(/\bmetadata\b/i)

    expect(sql).toContain('ALTER TABLE public.duration_learning_runtime_consumptions FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE public.duration_learning_runtime_consumptions')
    expect(sql).toContain('REVOKE UPDATE, DELETE ON TABLE public.duration_learning_runtime_consumptions')
    expect(sql).toContain('duration_learning_runtime_consumptions_backend_runtime_select')
    expect(sql).toContain('duration_learning_runtime_consumptions_backend_runtime_insert')
    expect(sql).toContain('publication.publication_stage IN (\'canary\', \'stable\')')
    expect(sql).toContain('task.project_id = duration_learning_runtime_consumptions.project_id')
    expect(sql).toContain('baseline_item.project_id = duration_learning_runtime_consumptions.project_id')
  })

  it('archives legacy default-master-plan rows without inventing six-family publications', () => {
    const sql = readSql(migrationPath)

    for (const relation of [
      'wbs_template_runtime_publications',
      'wbs_template_runtime_events',
      'construction_dependency_rule_runtime_publications',
      'construction_dependency_rule_runtime_events',
    ]) {
      expect(sql).toContain(`'${relation}'`)
      expect(sql).toMatch(new RegExp(`FROM public\\.${relation}\\s+source_row`, 'i'))
    }

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.duration_learning_legacy_runtime_row_archive')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.duration_learning_legacy_default_master_plan_mappings')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.duration_learning_legacy_runtime_retirement_state')
    expect(sql).toContain('CREATE VIEW public.duration_learning_legacy_runtime_retirement_readback')
    expect(sql).toContain("mapping_kind = 'legacy_default_master_plan_source_consumer_lineage'")
    expect(sql).toContain("source_row.asset_kind = 'default_master_plan'")
    expect(sql).toContain('source_data_fingerprint')
    expect(sql).toContain('archive_data_fingerprint')
    expect(sql).toContain('mapping_fingerprint')
    expect(sql).toContain('manifest_fingerprint')
    expect(sql).toContain("'archived_ready_for_explicit_322_authorization'")
    expect(sql).toContain("'archived_blocked'")
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.duration_learning_runtime_publications/i)
    expect(sql).not.toMatch(/legacy_default_master_plan[\s\S]{0,200}'(?:base_duration_benchmark|standard_work_duration_seed|special_work_duration_seed|wbs_reference_days|dependency_rule_candidate|critical_path_rule_candidate)'/i)
  })

  it('keeps publication, consumption, archive and mapping boundaries backend-only', () => {
    const sql = readSql(migrationPath)
    const rollback = readSql(rollbackPath)

    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('TO workbuddy_runtime')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE')
    expect(sql).toContain('REVOKE DELETE ON TABLE public.duration_learning_runtime_publications')
    expect(sql).not.toMatch(/GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE[\s\S]+duration_learning_runtime_publications/i)
    expect(sql).not.toMatch(/GRANT[^;]+TO authenticated/i)
    expect(sql).not.toMatch(/GRANT[^;]+TO anon/i)
    expect(sql).toContain('REVOKE ALL ON TABLE public.duration_learning_legacy_runtime_row_archive FROM PUBLIC')
    expect(sql).toContain('REVOKE ALL ON TABLE public.duration_learning_legacy_default_master_plan_mappings FROM PUBLIC')
    expect(sql).toContain('duration_learning_legacy_runtime_row_archive_backend_runtime_select')
    expect(sql).toContain('duration_learning_legacy_default_master_plan_mappings_backend_runtime_select')

    const viewDrop = rollback.indexOf(
      'DROP VIEW IF EXISTS public.duration_learning_legacy_runtime_retirement_readback',
    )
    const consumptionDrop = rollback.indexOf(
      'DROP TABLE IF EXISTS public.duration_learning_runtime_consumptions',
    )
    const mappingDrop = rollback.indexOf(
      'DROP TABLE IF EXISTS public.duration_learning_legacy_default_master_plan_mappings',
    )
    const archiveDrop = rollback.indexOf(
      'DROP TABLE IF EXISTS public.duration_learning_legacy_runtime_row_archive',
    )
    const publicationDrop = rollback.indexOf(
      'DROP TABLE IF EXISTS public.duration_learning_runtime_publications',
    )

    expect(viewDrop).toBeGreaterThan(-1)
    expect(consumptionDrop).toBeGreaterThan(viewDrop)
    expect(mappingDrop).toBeGreaterThan(consumptionDrop)
    expect(archiveDrop).toBeGreaterThan(mappingDrop)
    expect(publicationDrop).toBeGreaterThan(archiveDrop)
    expect(rollback).toContain('duration_learning_legacy_runtime_rollback_322_required')
  })

  it('keeps migrations 314 and 315 byte-equivalent in the canonical clean bundle before later migrations', () => {
    const cleanBundle = readSql(resolve(serverRoot, 'migrations', 'CLEAN_MIGRATION_V4.sql'))
    let previousSourceIndex = -1

    for (const migrationName of [
      '314_duration_day_basis_contract.sql',
      '315_duration_learning_runtime_publications.sql',
    ]) {
      const migration = readSql(resolve(serverRoot, 'migrations', migrationName))
        .trim()
      const header = [
        '-- ============================================================',
        `-- Source: ${migrationName}`,
        '-- ============================================================',
      ].join('\n')
      const sourceIndex = cleanBundle.indexOf(header)
      expect(sourceIndex, migrationName).toBeGreaterThan(previousSourceIndex)
      const bodyStart = sourceIndex + header.length
      const nextSourceIndex = cleanBundle.indexOf(
        '\n-- ============================================================\n-- Source:',
        bodyStart,
      )
      const bundledBody = cleanBundle.slice(
        bodyStart,
        nextSourceIndex >= 0 ? nextSourceIndex : undefined,
      ).trim()
      expect(bundledBody).toBe(migration)
      previousSourceIndex = sourceIndex
    }

    expect(previousSourceIndex).toBeLessThan(cleanBundle.indexOf('Source: 316_task_fact_write_integrity.sql'))
  })
})
