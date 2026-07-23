import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationName = '325_duration_asset_review_queue.sql'

function readSql(...segments: string[]) {
  const path = resolve(serverRoot, ...segments)
  return existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : ''
}

function extractPolicy(sql: string, name: string) {
  const start = sql.indexOf(`CREATE POLICY ${name}`)
  if (start < 0) return ''
  const end = sql.indexOf(';', start)
  return end < 0 ? '' : sql.slice(start, end + 1)
}

function extractConstraint(sql: string, name: string) {
  const marker = `CONSTRAINT ${name} CHECK (`
  const start = sql.indexOf(marker)
  if (start < 0) return ''
  let depth = 0
  for (let index = start + marker.length - 1; index < sql.length; index += 1) {
    if (sql[index] === '(') depth += 1
    if (sql[index] === ')') depth -= 1
    if (depth === 0) return sql.slice(start, index + 1)
  }
  return ''
}

function extractMarkedSegment(sql: string) {
  const begin = sql.indexOf('-- BEGIN MIGRATION 325')
  const end = sql.indexOf('-- END MIGRATION 325')
  if (begin < 0 || end < begin) return ''
  return sql.slice(begin, end + '-- END MIGRATION 325'.length)
}

describe('duration asset review migration', () => {
  it('defines the six-family durable queue with bounded payloads', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('CREATE TABLE IF NOT EXISTS public.duration_asset_review_items')
    expect(forward).toContain("CHECK (asset_key IN ('base_duration_benchmark','standard_work_duration_seed','special_work_duration_seed','wbs_reference_days','dependency_rule_candidate','critical_path_rule_candidate'))")
    expect(forward).toContain("CHECK (status IN ('open','approved','rejected','superseded','resolved_by_publication'))")
    expect(forward).toContain("CHECK (review_kind IN ('candidate_publication','stable_promotion'))")
    expect(forward).toContain("decision_fingerprint TEXT NOT NULL CHECK (decision_fingerprint ~ '^[a-f0-9]{64}$')")
    expect(forward).toContain("CHECK (resolution_source IN ('automatic_publication','manual_approval','manual_rejection','manual_supersession'))")
    expect(forward).toContain('CHECK (pg_column_size(review_payload) <= 32768)')
    expect(forward).toContain('UNIQUE (source_key)')
  })

  it('keeps company/project ownership and shared-scope authority fail closed', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id)')
    expect(forward).toContain('ALTER TABLE public.duration_asset_review_items FORCE ROW LEVEL SECURITY')
    expect(forward).toMatch(/CREATE POLICY duration_asset_review_items_member_read[\s\S]+FOR SELECT[\s\S]+TO authenticated[\s\S]+scope_level IN \('company','project'\)[\s\S]+workbuddy_private\.is_active_company_member\([\s\S]+company_id,[\s\S]+ARRAY\['company_admin'\]::TEXT\[\][\s\S]+\)[\s\S]+EXISTS \([\s\S]+FROM public\.projects project[\s\S]+project\.id = duration_asset_review_items\.project_id[\s\S]+project\.company_id = duration_asset_review_items\.company_id/)
    const memberPolicy = extractPolicy(forward, 'duration_asset_review_items_member_read')
    expect(memberPolicy).not.toMatch(/scope_level\s*=\s*'(industry|global)'/)
    expect(forward).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]+TO authenticated/)
    expect(forward).toMatch(/CREATE POLICY duration_asset_review_items_backend_runtime[\s\S]+FOR ALL[\s\S]+TO workbuddy_runtime[\s\S]+USING \([\s\S]+current_user = 'workbuddy_runtime'[\s\S]+pg_has_role\(current_user, 'workbuddy_runtime', 'member'\)[\s\S]+\)[\s\S]+WITH CHECK \([\s\S]+current_user = 'workbuddy_runtime'[\s\S]+pg_has_role\(current_user, 'workbuddy_runtime', 'member'\)[\s\S]+\)/)
  })

  it('maps every status to one non-contradictory resolution state', () => {
    const forward = readSql('migrations', migrationName)
    const stateConstraint = extractConstraint(forward, 'duration_asset_review_items_resolution_state_check')

    expect(stateConstraint).toContain("status = 'open'")
    expect(stateConstraint).toContain("status = 'approved' AND resolution_source = 'manual_approval'")
    expect(stateConstraint).toContain("status = 'rejected' AND resolution_source = 'manual_rejection'")
    expect(stateConstraint).toContain("status = 'superseded' AND resolution_source = 'manual_supersession'")
    expect(stateConstraint).toContain("status = 'resolved_by_publication'")
    expect(stateConstraint).toContain('NULLIF(BTRIM(resolved_publication_key), \'\') IS NOT NULL')
    expect(stateConstraint).toContain("status = 'approved' AND resolution_source = 'manual_approval'\n      AND resolution_source IS NOT NULL")
    expect(stateConstraint).toContain("status = 'rejected' AND resolution_source = 'manual_rejection'\n      AND resolution_source IS NOT NULL")
    expect(stateConstraint).toContain("status = 'superseded' AND resolution_source = 'manual_supersession'\n      AND resolution_source IS NOT NULL")
    expect(stateConstraint).toContain("status = 'resolved_by_publication'\n      AND resolution_source IS NOT NULL\n      AND resolution_source IN ('automatic_publication','manual_approval')")
    expect(stateConstraint).toMatch(/status = 'open'[\s\S]+reviewed_by_user_id IS NULL[\s\S]+reviewed_at IS NULL[\s\S]+decision_reason IS NULL[\s\S]+resolution_source IS NULL[\s\S]+resolved_publication_key IS NULL/)
    expect(stateConstraint).toMatch(/resolution_source = 'automatic_publication' AND reviewed_by_user_id IS NULL/)
    expect(stateConstraint).toMatch(/resolution_source = 'manual_approval' AND reviewed_by_user_id IS NOT NULL/)
  })

  it('keeps forward and clean-install table definitions byte-equivalent', () => {
    const forwardSegment = extractMarkedSegment(readSql('migrations', migrationName))
    const cleanSegment = extractMarkedSegment(readSql('migrations', 'CLEAN_MIGRATION_V4.sql'))

    expect(forwardSegment).not.toBe('')
    expect(cleanSegment).not.toBe('')
    expect(forwardSegment).toBe(cleanSegment)
  })

  it('keeps the migration rollback scoped to the durable review queue', () => {
    const rollback = readSql('migrations', 'rollback', migrationName)

    expect(rollback).toContain('DROP POLICY IF EXISTS duration_asset_review_items_member_read ON public.duration_asset_review_items')
    expect(rollback).toContain('DROP POLICY IF EXISTS duration_asset_review_items_backend_runtime ON public.duration_asset_review_items')
    expect(rollback).toContain('DROP TRIGGER IF EXISTS set_duration_asset_review_items_updated_at ON public.duration_asset_review_items')
    expect(rollback).toContain('DROP TABLE IF EXISTS public.duration_asset_review_items')
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.duration_benchmarks')
  })
})
