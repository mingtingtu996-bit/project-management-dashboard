import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationName = '326_execution_fact_governance.sql'

function readSql(...segments: string[]) {
  const path = resolve(serverRoot, ...segments)
  return existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : ''
}

function extractMarkedSegment(sql: string) {
  const beginMarker = '-- BEGIN MIGRATION 326'
  const endMarker = '-- END MIGRATION 326'
  const begin = sql.indexOf(beginMarker)
  const end = sql.indexOf(endMarker)
  if (begin < 0 || end < begin) return ''
  return sql.slice(begin, end + endMarker.length)
}

function extractPolicy(sql: string, name: string) {
  const start = sql.indexOf(`CREATE POLICY ${name}`)
  if (start < 0) return ''
  const end = sql.indexOf(';', start)
  return end < 0 ? '' : sql.slice(start, end + 1)
}

describe('execution fact governance migration', () => {
  it('defines an append-only authority for every governed execution entity', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('CREATE TABLE IF NOT EXISTS public.execution_fact_events')
    expect(forward).toContain("CHECK (entity_type IN ('task','risk','issue','material_batch','drawing_version','certificate_work_item','acceptance_plan'))")
    expect(forward).toContain("'task.actual_start_date','task.actual_end_date','task.first_progress_at','task.progress','task.status'")
    expect(forward).toContain("'risk.status','risk.closure','issue.status','issue.closure'")
    expect(forward).toContain("'material_batch.actual_arrival_date','drawing_version.current'")
    expect(forward).toContain("'certificate_work_item.status','certificate_work_item.actual_finish_date'")
    expect(forward).toContain("'acceptance_plan.status','acceptance_plan.actual_date'")
    expect(forward).toContain('fact_value JSONB NOT NULL')
    expect(forward).toContain('effective_at TIMESTAMPTZ NOT NULL')
    expect(forward).toContain('observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()')
    expect(forward).toContain('evidence_refs JSONB NOT NULL DEFAULT')
    expect(forward).toContain('confidence NUMERIC')
    expect(forward).toContain('supersedes_event_id UUID NULL REFERENCES public.execution_fact_events(id)')
    expect(forward).toContain('UNIQUE (company_id, idempotency_key)')
    expect(forward).toMatch(/CREATE UNIQUE INDEX uq_execution_fact_events_superseded_once[\s\S]+\(supersedes_event_id\)[\s\S]+WHERE supersedes_event_id IS NOT NULL/)
  })

  it('validates tenant, polymorphic entity ownership, and same-stream supersession', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('CREATE OR REPLACE FUNCTION workbuddy_private.ensure_execution_fact_event_scope()')
    expect(forward).toMatch(/SELECT project\.company_id[\s\S]+FROM public\.projects project[\s\S]+WHERE project\.id = NEW\.project_id[\s\S]+FOR KEY SHARE/)
    for (const table of [
      'tasks',
      'risks',
      'issues',
      'project_materials',
      'drawing_versions',
      'certificate_work_items',
      'acceptance_plans',
    ]) {
      expect(forward).toContain(`FROM public.${table}`)
    }
    expect(forward).toContain('execution fact entity does not belong to the governed project')
    expect(forward).toContain('execution fact supersession must stay in the same fact stream')
    expect(forward).toContain('BEFORE INSERT ON public.execution_fact_events')
  })

  it('prevents mutation and exposes only the unsuperseded current fact view', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('CREATE OR REPLACE FUNCTION workbuddy_private.reject_execution_fact_event_mutation()')
    expect(forward).toContain('BEFORE UPDATE OR DELETE ON public.execution_fact_events')
    expect(forward).toContain('execution_fact_events is append-only')
    expect(forward).toContain('CREATE OR REPLACE VIEW public.current_execution_facts')
    expect(forward).toContain('WITH (security_invoker = true)')
    expect(forward).toMatch(/NOT EXISTS \([\s\S]+FROM public\.execution_fact_events successor[\s\S]+successor\.supersedes_event_id = event\.id/)
  })

  it('backfills current compatibility projections as deterministic initial facts', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain("'migration.326_execution_fact_governance'::TEXT AS source_module")
    expect(forward).toContain("'initial'::TEXT AS supersession_kind")
    expect(forward).toContain('ON CONFLICT (company_id, idempotency_key) DO NOTHING')
    for (const table of [
      'public.tasks',
      'public.risks',
      'public.issues',
      'public.project_materials',
      'public.drawing_versions',
      'public.certificate_work_items',
      'public.acceptance_plans',
    ]) {
      expect(forward).toContain(`FROM ${table}`)
    }
    for (const factType of [
      'task.actual_start_date',
      'task.actual_end_date',
      'task.first_progress_at',
      'task.progress',
      'task.status',
      'risk.status',
      'risk.closure',
      'issue.status',
      'issue.closure',
      'material_batch.actual_arrival_date',
      'drawing_version.current',
      'certificate_work_item.status',
      'certificate_work_item.actual_finish_date',
      'acceptance_plan.status',
      'acceptance_plan.actual_date',
    ]) {
      expect(forward).toContain(`'${factType}'`)
    }
    for (const nullableProjection of [
      'task.actual_start_date',
      'task.actual_end_date',
      'task.first_progress_at',
      'material_batch.actual_arrival_date',
      'certificate_work_item.actual_finish_date',
      'acceptance_plan.actual_date',
    ]) {
      expect(forward).toMatch(new RegExp(
        `'${nullableProjection.replaceAll('.', '\\.')}'[\\s\\S]+COALESCE\\(to_jsonb\\([^)]*\\), 'null'::JSONB\\)`,
      ))
    }
  })

  it('allows only parent-driven project cascade deletion through the append-only trigger', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toMatch(/IF TG_OP = 'DELETE'[\s\S]+NOT EXISTS \([\s\S]+FROM public\.projects project[\s\S]+project\.id = OLD\.project_id[\s\S]+RETURN OLD/)
    expect(forward).toContain("RAISE EXCEPTION 'execution_fact_events is append-only'")
  })

  it('keeps authenticated access read-only and runtime writes insert-only', () => {
    const forward = readSql('migrations', migrationName)
    const memberRead = extractPolicy(forward, 'execution_fact_events_member_read')
    const runtimeInsert = extractPolicy(forward, 'execution_fact_events_backend_runtime_insert')

    expect(forward).toContain('ALTER TABLE public.execution_fact_events FORCE ROW LEVEL SECURITY')
    expect(forward).toContain('GRANT SELECT ON TABLE public.execution_fact_events TO authenticated')
    expect(forward).toContain('GRANT SELECT, INSERT ON TABLE public.execution_fact_events TO workbuddy_runtime')
    expect(forward).not.toMatch(/GRANT (UPDATE|DELETE|TRUNCATE)[^;]+execution_fact_events/)
    expect(memberRead).toContain('workbuddy_private.is_active_company_member')
    expect(memberRead).toContain('workbuddy_private.is_active_project_member')
    expect(memberRead).toContain('project.company_id = execution_fact_events.company_id')
    expect(runtimeInsert).toContain('FOR INSERT')
    expect(runtimeInsert).toContain("current_user = 'workbuddy_runtime'")
    expect(runtimeInsert).toContain("pg_has_role(current_user, 'workbuddy_runtime', 'member')")
  })

  it('keeps forward and clean-install definitions byte-equivalent', () => {
    const forwardSegment = extractMarkedSegment(readSql('migrations', migrationName))
    const cleanSegment = extractMarkedSegment(readSql('migrations', 'CLEAN_MIGRATION_V4.sql'))

    expect(forwardSegment).not.toBe('')
    expect(cleanSegment).not.toBe('')
    expect(forwardSegment).toBe(cleanSegment)
  })

  it('provides a rollback scoped to execution-fact governance', () => {
    const rollback = readSql('migrations', 'rollback', migrationName)

    expect(rollback).toContain('DROP VIEW IF EXISTS public.current_execution_facts')
    expect(rollback).toContain('DROP TABLE IF EXISTS public.execution_fact_events')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS workbuddy_private.ensure_execution_fact_event_scope()')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS workbuddy_private.reject_execution_fact_event_mutation()')
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.tasks')
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.risks')
  })
})
