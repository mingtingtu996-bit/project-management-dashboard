import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')

describe('migration 317 structured cause attribution', () => {
  it('creates tenant-scoped attribution rows with taxonomy, evidence, review, and responsibility boundaries', () => {
    const sql = readFileSync(resolve(serverRoot, 'migrations/317_structured_cause_attribution.sql'), 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.structured_cause_attributions')
    expect(sql).toContain('company_id UUID NOT NULL')
    expect(sql).toContain('project_id UUID NOT NULL')
    expect(sql).toContain('taxonomy_version TEXT NOT NULL')
    expect(sql).toContain('cause_role TEXT NOT NULL')
    expect(sql).toContain("'primary', 'contributing', 'transmitted'")
    expect(sql).toContain('responsibility_class TEXT NULL')
    expect(sql).toContain('raw_text TEXT NULL')
    expect(sql).toContain('evidence_refs JSONB NOT NULL')
    expect(sql).toContain('rule_version TEXT NULL')
    expect(sql).toContain('confidence NUMERIC')
    expect(sql).toContain('confirmation_source TEXT')
    expect(sql).toContain('prefilled_cause_code TEXT NULL')
    expect(sql).toContain('prefill_modified BOOLEAN NULL')
    expect(sql).toContain('prefill_modified IS NULL OR prefilled_cause_code IS NOT NULL')
    expect(sql).toContain("'candidate', 'confirmed', 'rejected', 'superseded'")
    expect(sql).toContain('dedupe_key TEXT NOT NULL')
    expect(sql).toContain('UNIQUE (company_id, dedupe_key)')
  })

  it('forces RLS, exposes tenant reads, limits user writes to editors, and keeps runtime backend access', () => {
    const sql = readFileSync(resolve(serverRoot, 'migrations/317_structured_cause_attribution.sql'), 'utf8')

    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('workbuddy_private.is_active_company_member(structured_cause_attributions.company_id, NULL::TEXT[])')
    expect(sql).toMatch(
      /workbuddy_private\.is_active_project_member\(\s*structured_cause_attributions\.project_id,\s*NULL::TEXT\[\]/,
    )
    expect(sql).toContain("ARRAY['company_admin']::TEXT[]")
    expect(sql).toContain("ARRAY['owner', 'editor']::TEXT[]")
    expect(sql).not.toContain('public.is_active_company_member(')
    expect(sql).not.toContain("ARRAY['company_admin', 'editor']::TEXT[]")
    expect(sql).toContain('project.company_id = structured_cause_attributions.company_id')
    expect(sql).toContain('TO workbuddy_runtime')
    expect(sql).toContain('REVOKE ALL ON TABLE public.structured_cause_attributions FROM PUBLIC, anon')
  })

  it('has an exact rollback for the new attribution table', () => {
    const rollback = readFileSync(resolve(serverRoot, 'migrations/rollback/317_structured_cause_attribution.sql'), 'utf8')

    expect(rollback).toContain('DROP TABLE IF EXISTS public.structured_cause_attributions')
  })

  it('is byte-equivalent in the canonical clean bundle before migration 318', () => {
    const migrationName = '317_structured_cause_attribution.sql'
    const migration = readFileSync(resolve(serverRoot, 'migrations', migrationName), 'utf8')
      .replace(/\r\n/g, '\n')
      .trim()
    const cleanBundle = readFileSync(resolve(serverRoot, 'migrations/CLEAN_MIGRATION_V4.sql'), 'utf8')
      .replace(/\r\n/g, '\n')
    const header = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = cleanBundle.indexOf(header)

    expect(sourceIndex).toBeGreaterThan(-1)
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
    expect(sourceIndex).toBeLessThan(cleanBundle.indexOf('Source: 318_risk_issue_structured_closure_outcome.sql'))
  })
})
