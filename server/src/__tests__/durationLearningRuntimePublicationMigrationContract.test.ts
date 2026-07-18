import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'migrations',
  '315_duration_learning_runtime_publications.sql',
)

const rollbackPath = resolve(
  process.cwd(),
  'migrations',
  'rollback',
  '315_duration_learning_runtime_publications.sql',
)

describe('duration learning runtime publication migration', () => {
  it('creates one executable publication boundary for every learnable duration asset scope', () => {
    const sql = readFileSync(migrationPath, 'utf8')

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
    expect(sql).toContain('uq_duration_learning_runtime_publications_active_scope')
  })

  it('keeps the publication boundary backend-only and rollback-capable', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const rollback = readFileSync(rollbackPath, 'utf8')

    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('TO workbuddy_runtime')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE')
    expect(sql).not.toMatch(/GRANT[^;]+TO authenticated/i)
    expect(sql).not.toMatch(/GRANT[^;]+TO anon/i)
    expect(rollback).toContain('DROP TABLE IF EXISTS public.duration_learning_runtime_publications')
  })

  it('keeps migrations 314 and 315 byte-equivalent in the canonical clean bundle before later migrations', () => {
    const cleanBundle = readFileSync(resolve(process.cwd(), 'migrations', 'CLEAN_MIGRATION_V4.sql'), 'utf8')
      .replace(/\r\n/g, '\n')
    let previousSourceIndex = -1

    for (const migrationName of [
      '314_duration_day_basis_contract.sql',
      '315_duration_learning_runtime_publications.sql',
    ]) {
      const migration = readFileSync(resolve(process.cwd(), 'migrations', migrationName), 'utf8')
        .replace(/\r\n/g, '\n')
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
