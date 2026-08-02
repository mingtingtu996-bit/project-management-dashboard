import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationName = '333_staging_schema_drift_reconciliation.sql'

function readSql(...segments: string[]) {
  const path = resolve(serverRoot, ...segments)
  return existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : ''
}

describe('staging schema drift reconciliation migration', () => {
  it('restores the canonical project/company unique index without mutating data', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_id_company_id_for_duration_benchmarks')
    expect(forward).toContain('ON public.projects (id, company_id)')
    expect(forward).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
  })

  it('replaces the execution-fact star projection with an explicit stable column contract', () => {
    const forward = readSql('migrations', migrationName)
    const view = forward.slice(forward.indexOf('CREATE OR REPLACE VIEW public.current_execution_facts'))

    expect(view).toContain('WITH (security_invoker = true)')
    expect(view).not.toContain('event.*')
    for (const column of [
      'id',
      'company_id',
      'project_id',
      'entity_type',
      'entity_id',
      'fact_type',
      'fact_value',
      'effective_at',
      'observed_at',
      'source_module',
      'source_event_id',
      'actor_user_id',
      'evidence_refs',
      'confidence',
      'supersedes_event_id',
      'supersession_kind',
      'correction_reason',
      'idempotency_key',
      'created_at',
    ]) {
      expect(view).toMatch(new RegExp(`\\bevent\\.${column}\\b`))
    }
  })

  it('provides a scoped rollback and exact clean-bundle parity', () => {
    const forward = readSql('migrations', migrationName).trim()
    const rollback = readSql('migrations', 'rollback', migrationName)
    const clean = readSql('migrations', 'CLEAN_MIGRATION_V4.sql')
    const sourceHeader = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = clean.indexOf(sourceHeader)
    const sourceBodyStart = sourceIndex + sourceHeader.length
    const nextSourceIndex = clean.indexOf(
      '\n-- ============================================================\n-- Source:',
      sourceBodyStart,
    )
    const bundledSource = clean
      .slice(sourceBodyStart, nextSourceIndex >= 0 ? nextSourceIndex : undefined)
      .trim()

    expect(rollback).toContain('DROP INDEX IF EXISTS public.uq_projects_id_company_id_for_duration_benchmarks')
    expect(rollback).toContain('CREATE OR REPLACE VIEW public.current_execution_facts')
    expect(rollback).toContain('SELECT event.*')
    expect(sourceIndex).toBeGreaterThanOrEqual(0)
    expect(bundledSource).toBe(forward)
  })
})
