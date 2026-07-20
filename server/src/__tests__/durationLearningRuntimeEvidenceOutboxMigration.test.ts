import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationName = '323_duration_learning_runtime_evidence_outbox.sql'

function readSql(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8').replace(/\r\n/g, '\n')
}

describe('duration learning runtime evidence outbox migration', () => {
  it('creates a bounded durable lease queue with task and baseline-item contracts', () => {
    const sql = readSql('migrations', migrationName)

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.duration_learning_runtime_evidence_outbox')
    for (const column of [
      'event_key TEXT PRIMARY KEY',
      'event_type TEXT NOT NULL',
      'company_id UUID NOT NULL',
      'project_id UUID NOT NULL',
      'subject_type TEXT NOT NULL',
      'subject_id UUID NOT NULL',
      'asset_key TEXT',
      'publication_key TEXT',
      'artifact_key TEXT',
      'scope_level TEXT',
      'industry_key TEXT',
      'input_subject_ids JSONB NOT NULL',
      'input_task_ids JSONB NOT NULL',
      'processing_status TEXT NOT NULL',
      'attempt_count INTEGER NOT NULL',
      'next_attempt_at TIMESTAMPTZ NOT NULL',
      'lease_owner TEXT',
      'lease_expires_at TIMESTAMPTZ',
    ]) {
      expect(sql).toContain(column)
    }
    expect(sql).toContain("event_type IN ('duration_prediction', 'wbs_candidate')")
    expect(sql).toContain("subject_type IN ('task', 'baseline_item')")
    expect(sql).toContain("processing_status IN ('pending', 'processing', 'failed', 'completed')")
    expect(sql).toContain('input_subject_ids ? subject_id::text')
    expect(sql).toContain('input_task_ids ? subject_id::text')
    expect(sql).toContain('idx_duration_learning_runtime_evidence_outbox_claim')
    expect(sql).toContain('idx_duration_learning_runtime_evidence_outbox_expired_lease')
  })

  it('forces tenant, subject and exact safe-publication authority for runtime access', () => {
    const sql = readSql('migrations', migrationName)

    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('TO workbuddy_runtime')
    expect(sql).toContain('TO service_role')
    expect(sql).toMatch(/project\.id = duration_learning_runtime_evidence_outbox\.project_id[\s\S]+project\.company_id = duration_learning_runtime_evidence_outbox\.company_id/i)
    expect(sql).toMatch(/task\.id = duration_learning_runtime_evidence_outbox\.subject_id[\s\S]+task\.project_id = duration_learning_runtime_evidence_outbox\.project_id/i)
    expect(sql).toMatch(/baseline_item\.id = duration_learning_runtime_evidence_outbox\.subject_id[\s\S]+baseline_item\.project_id = duration_learning_runtime_evidence_outbox\.project_id/i)
    expect(sql).toMatch(/jsonb_array_elements_text\(duration_learning_runtime_evidence_outbox\.input_subject_ids\)[\s\S]+task\.project_id = duration_learning_runtime_evidence_outbox\.project_id/i)
    expect(sql).toMatch(/jsonb_array_elements_text\(duration_learning_runtime_evidence_outbox\.input_subject_ids\)[\s\S]+baseline_item\.project_id = duration_learning_runtime_evidence_outbox\.project_id/i)
    expect(sql).toMatch(/publication\.publication_key = duration_learning_runtime_evidence_outbox\.publication_key[\s\S]+publication\.asset_key = duration_learning_runtime_evidence_outbox\.asset_key[\s\S]+publication\.artifact_key = duration_learning_runtime_evidence_outbox\.artifact_key/i)
    expect(sql).toContain("publication.publication_stage = 'stable' AND publication.monitoring_status = 'passed'")
    expect(sql).toContain("publication.scope_level = 'industry'")
    expect(sql).toContain('publication.industry_key = duration_learning_runtime_evidence_outbox.industry_key')
  })

  it('has an explicit rollback that removes only the new outbox relation', () => {
    const rollback = readSql('migrations', 'rollback', migrationName)

    expect(rollback).toContain('DROP TABLE IF EXISTS public.duration_learning_runtime_evidence_outbox;')
    expect(rollback.match(/DROP TABLE/gi)).toHaveLength(1)
    expect(rollback).not.toContain('duration_learning_runtime_publications')
    expect(rollback).not.toContain('wbs_template_runtime_publications')
  })

  it('is the exact canonical EOF block after unchanged migration 322', () => {
    const migration = readSql('migrations', migrationName).trim()
    const clean = readSql('migrations', 'CLEAN_MIGRATION_V4.sql')
    const sourceHeader = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = clean.indexOf(sourceHeader)
    const migration322Index = clean.indexOf('Source: 322_duration_learning_legacy_runtime_retirement.sql')

    expect(sourceIndex).toBeGreaterThan(migration322Index)
    expect(clean.slice(sourceIndex + sourceHeader.length).trim()).toBe(migration)
    expect(clean.trimEnd().endsWith(migration)).toBe(true)
    expect(clean).toContain('CANONICAL: current clean bootstrap bundle, synchronized through migration 323')
  })
})
