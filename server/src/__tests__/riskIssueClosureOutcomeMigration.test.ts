import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')

describe('migration 318 risk and issue closure outcomes', () => {
  it('adds structured result, evidence, actor, and confirmed cause fields to both domains', () => {
    const sql = readFileSync(resolve(serverRoot, 'migrations/318_risk_issue_structured_closure_outcome.sql'), 'utf8')

    for (const table of ['risks', 'issues']) {
      expect(sql).toContain(`ALTER TABLE public.${table}`)
    }
    expect(sql).toContain('closure_result_code TEXT')
    expect(sql).toContain('closure_result_summary TEXT')
    expect(sql).toContain('closure_effectiveness TEXT')
    expect(sql).toContain('closure_evidence_refs JSONB')
    expect(sql).toContain('closure_cause_attribution_id UUID')
    expect(sql).toContain('closed_by UUID')
    expect(sql).toContain('closure_recorded_at TIMESTAMPTZ')
    expect(sql).toContain("'resolved', 'mitigated', 'transferred', 'accepted', 'duplicate', 'invalidated', 'retention_close', 'legacy_close'")
  })

  it('backfills historical closed rows and validates cause attribution ownership', () => {
    const sql = readFileSync(resolve(serverRoot, 'migrations/318_risk_issue_structured_closure_outcome.sql'), 'utf8')

    expect(sql).toContain("closure_result_code = COALESCE(closure_result_code, 'legacy_close')")
    expect(sql).toContain('validate_risk_issue_closure_cause_attribution')
    expect(sql).toContain("attribution.status <> 'confirmed'")
    expect(sql).toContain('attribution.project_id <> NEW.project_id')
    expect(sql).toContain('attribution.subject_id <> NEW.id::TEXT')
  })

  it('has an exact rollback for both table extensions and validation triggers', () => {
    const rollback = readFileSync(resolve(serverRoot, 'migrations/rollback/318_risk_issue_structured_closure_outcome.sql'), 'utf8')

    expect(rollback).toContain('ALTER TABLE public.risks')
    expect(rollback).toContain('ALTER TABLE public.issues')
    expect(rollback).toContain('DROP COLUMN IF EXISTS closure_result_code')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.validate_risk_issue_closure_cause_attribution()')
  })

  it('is byte-equivalent in the canonical clean bundle', () => {
    const migrationName = '318_risk_issue_structured_closure_outcome.sql'
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
  })
})
