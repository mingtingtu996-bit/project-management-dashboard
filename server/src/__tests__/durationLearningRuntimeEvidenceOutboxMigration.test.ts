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
    expect(sql).toContain("processing_status IN ('pending', 'processing', 'failed', 'completed', 'cancelled')")
    expect(sql).toContain('input_subject_ids ? subject_id::text')
    expect(sql).toContain('input_task_ids ? subject_id::text')
    expect(sql).toContain('idx_duration_learning_runtime_evidence_outbox_claim')
    expect(sql).toContain('idx_duration_learning_runtime_evidence_outbox_expired_lease')
  })

  it('archives source-deleted pending/failed rows with immutable scope and lineage snapshots', () => {
    const sql = readSql('migrations', migrationName)

    expect(sql).toContain('duration_learning_runtime_evidence_outbox_tombstones')
    expect(sql).toContain('scope_snapshot JSONB NOT NULL')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone')
    expect(sql).toContain('CREATE TRIGGER duration_learning_runtime_evidence_outbox_tombstone_on_delete')
    expect(sql).toContain("OLD.processing_status IN ('pending', 'processing', 'failed', 'cancelled')")
    expect(sql).toContain("ON DELETE CASCADE")
    expect(sql).toContain("cancellation_reason")
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
  })

  it('governs cancelled rows separately from claimable work', () => {
    const sql = readSql('migrations', migrationName)

    expect(sql).toContain('cancelled_at TIMESTAMPTZ')
    expect(sql).toContain('cancellation_scope_snapshot JSONB')
    expect(sql).toMatch(/processing_status = 'cancelled'[\s\S]+cancelled_at IS NOT NULL/i)
    expect(sql).toContain("processing_status IN ('pending', 'processing', 'failed', 'completed', 'cancelled')")
    expect(sql).toContain("processing_status IN ('pending', 'processing', 'failed', 'cancelled')")
    expect(sql).toContain("processing_status = 'cancelled'")
  })

  it('forces tenant, subject and exact safe-publication authority for runtime access', () => {
    const sql = readSql('migrations', migrationName)

    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('TO workbuddy_runtime')
    expect(sql).toContain('TO service_role')
    expect(sql).toContain('duration_learning_runtime_evidence_outbox_row_is_governable')
    expect(sql).toContain('task.id::text = input_subject.subject_id')
    expect(sql).toContain('baseline_item.id::text = input_subject.subject_id')
    expect(sql).toContain('duration_learning_runtime_evidence_outbox_row_is_authorized')
    expect(sql.toLowerCase()).toContain('from public.duration_learning_runtime_consumptions consumption')
    expect(sql).toContain("consumption.consumption_context ->> 'authoritySource'")
    expect(sql).toContain("'runtime_resolver_publication_set'")
    expect(sql).toContain("publication.publication_stage = 'stable' AND publication.monitoring_status = 'passed'")
    expect(sql).toContain("publication.scope_level = 'industry'")
    expect(sql).toContain("consumption.source_evidence_refs ? (")
  })

  it('uses legal split runtime policies and keeps unsafe queued rows governable', () => {
    const sql = readSql('migrations', migrationName)
    const selectStart = sql.indexOf('CREATE POLICY duration_learning_runtime_evidence_outbox_runtime_select')
    const insertStart = sql.indexOf('CREATE POLICY duration_learning_runtime_evidence_outbox_runtime_insert')
    const updateStart = sql.indexOf('CREATE POLICY duration_learning_runtime_evidence_outbox_runtime_update')
    const serviceStart = sql.indexOf('DROP POLICY IF EXISTS duration_learning_runtime_evidence_outbox_service_policy')
    const selectPolicy = sql.slice(selectStart, insertStart)
    const insertPolicy = sql.slice(insertStart, updateStart)
    const updatePolicy = sql.slice(updateStart, serviceStart)

    expect(selectStart).toBeGreaterThanOrEqual(0)
    expect(selectPolicy).toContain('FOR SELECT')
    expect(selectPolicy).toContain('USING (')
    expect(selectPolicy).not.toContain('WITH CHECK')
    expect(selectPolicy).not.toContain('row_is_authorized')
    expect(insertPolicy).toContain('FOR INSERT')
    expect(insertPolicy).toContain('WITH CHECK')
    expect(insertPolicy).toContain('row_is_authorized')
    expect(updatePolicy).toContain('FOR UPDATE')
    expect(updatePolicy).toContain('USING (')
    expect(updatePolicy).toContain('WITH CHECK')
    expect(updatePolicy).toContain("processing_status = 'cancelled'")
    expect(updatePolicy).toContain('cancellation_scope_snapshot')
  })

  it('hardens migration-315 consumption inserts with exact resolver authority and restores them on rollback', () => {
    const sql = readSql('migrations', migrationName)
    const rollback = readSql('migrations', 'rollback', migrationName)

    expect(sql).toContain('DROP POLICY IF EXISTS duration_learning_runtime_consumptions_backend_runtime_insert')
    expect(sql).toContain('CREATE POLICY duration_learning_runtime_consumptions_backend_runtime_insert')
    expect(sql).toContain("duration_learning_runtime_consumptions.source_evidence_refs ? (")
    expect(sql).toContain("'duration_learning_runtime_publications:'")
    expect(sql).toContain("duration_learning_runtime_consumptions.consumption_context ->> 'authoritySource'")
    expect(sql).toContain("= 'runtime_resolver_publication_set'")
    expect(sql).toContain('duration_learning_runtime_consumptions.task_id IS NOT NULL')
    expect(sql).toContain('duration_learning_runtime_consumptions.baseline_item_id IS NULL')
    expect(sql).toContain('publication.project_id IS NULL')
    expect(sql).toContain('publication.company_id IS NULL')
    expect(sql).toContain('publication.industry_key IS NULL')

    expect(rollback).toContain('CREATE POLICY duration_learning_runtime_consumptions_backend_runtime_insert')
    expect(rollback).not.toContain("source_evidence_refs ? (")
    expect(rollback).not.toContain("= 'runtime_resolver_publication_set'")
  })

  it('revokes direct consumption writes and exposes only the fixed authoritative RPC', () => {
    const sql = readSql('migrations', migrationName)
    const rollback = readSql('migrations', 'rollback', migrationName)
    const rpcStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.persist_duration_learning_runtime_consumptions(')
    const rpcEnd = sql.indexOf('REVOKE ALL ON FUNCTION public.persist_duration_learning_runtime_consumptions', rpcStart)
    const rpc = sql.slice(rpcStart, rpcEnd)

    expect(rpcStart).toBeGreaterThanOrEqual(0)
    expect(rpc).toContain('SECURITY DEFINER')
    expect(rpc).toContain('SET row_security = off')
    expect(rpc.match(/WITH requested AS MATERIALIZED/gi)).toHaveLength(1)
    expect(rpc).toContain('normalized_input_task_ids')
    expect(rpc).toContain('FROM public.task_dependencies dependency')
    expect(rpc).toContain("dependency.source_type = 'duration_learning_runtime_publication'")
    expect(rpc).toContain("dependency.metadata ->> 'publicationKey' = requested.publication_key")
    expect(rpc).toContain("dependency.metadata ->> 'artifactKey' = requested.artifact_key")
    expect(rpc).not.toContain("requested.consumption_context -> 'inputTaskIds'")
    expect(rpc).toMatch(/prepared\.consumption_context\s+- 'authoritySource'/)
    expect(rpc).toContain("'duration_learning_runtime_publications:' || prepared.publication_key")
    expect(rpc).not.toContain('publication.source_evidence_refs ?')
    expect(rpc).not.toContain('requested.template_id')
    expect(rpc).toContain('pg_catalog.sha256(')
    expect(rpc).not.toContain('public.digest(')
    expect(rpc).toMatch(/encode\(\s*pg_catalog\.sha256\([\s\S]*?\)\s*,\s*'hex'\s*\)/)
    expect(rpc).toContain('exact_existing AS (')
    expect(rpc).toContain('requested_count <> validated_count OR requested_count <> resolved_count')
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE public.duration_learning_runtime_consumptions')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.persist_duration_learning_runtime_consumptions(JSONB)')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.persist_duration_learning_runtime_consumptions(JSONB)')
    expect(rollback).toContain('GRANT SELECT, INSERT ON TABLE public.duration_learning_runtime_consumptions')
  })

  it('has an explicit rollback that removes the two outbox relations and restores the 315 policy', () => {
    const rollback = readSql('migrations', 'rollback', migrationName)

    expect(rollback).toContain('DROP TABLE IF EXISTS public.duration_learning_runtime_evidence_outbox;')
    expect(rollback.match(/DROP TABLE/gi)).toHaveLength(2)
    const tombstoneDrop = rollback.indexOf('DROP TABLE IF EXISTS public.duration_learning_runtime_evidence_outbox_tombstones;')
    const outboxDrop = rollback.indexOf('DROP TABLE IF EXISTS public.duration_learning_runtime_evidence_outbox;')
    expect(tombstoneDrop).toBeGreaterThanOrEqual(0)
    expect(outboxDrop).toBeGreaterThan(tombstoneDrop)
    expect(rollback).toContain('DROP TRIGGER IF EXISTS duration_learning_runtime_evidence_outbox_cancel_task_on_delete')
    expect(rollback).toContain('duration_learning_runtime_publications publication')
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.duration_learning_runtime_publications')
    expect(rollback).not.toContain('wbs_template_runtime_publications')
  })

  it('locks source-delete archive scope and high-privilege trigger access', () => {
    const sql = readSql('migrations', migrationName)

    expect(sql).toContain("TG_TABLE_NAME NOT IN ('tasks', 'task_baseline_items')")
    expect(sql).toContain('outbox.input_subject_ids ? OLD.id::text')
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone() FROM PUBLIC")
    expect(sql).toContain("REVOKE INSERT ON TABLE public.duration_learning_runtime_evidence_outbox_tombstones")
    expect(sql).toContain('TO service_role')
    expect(sql).not.toContain('TO workbuddy_runtime, service_role\n  USING (true)')
    expect(sql).toContain("'eventKey', OLD.event_key")
    expect(sql).toContain("'subjectType', outbox.subject_type")
    expect(sql).toContain("'deletedSubjectType', v_subject_type")
    expect(sql).not.toContain("'subjectType', v_subject_type")
    const sourceDeleteTrigger = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete()'),
      sql.indexOf('REVOKE ALL ON FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete()'),
    )
    expect(sourceDeleteTrigger.match(/outbox\.subject_type = v_subject_type/gi)).toHaveLength(2)
    expect(sourceDeleteTrigger).toMatch(/outbox\.subject_type = v_subject_type\s+AND \(\s*outbox\.subject_id = OLD\.id\s+OR outbox\.input_subject_ids \? OLD\.id::text\s*\)/i)
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
