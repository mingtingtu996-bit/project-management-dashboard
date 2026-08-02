import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationName = '334_security_advisor_function_hardening.sql'

function readSql(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8').replace(/\r\n/g, '\n')
}

describe('security advisor function hardening migration', () => {
  it('hardens mutable search paths and denies exposed security-definer RPC execution', () => {
    const sql = readSql('migrations', migrationName)

    expect(sql).toMatch(/ALTER FUNCTION public\.ensure_structured_cause_attribution_tenant\(\)\s+SET search_path = public/)
    expect(sql).toMatch(/ALTER FUNCTION public\.validate_risk_issue_closure_cause_attribution\(\)\s+SET search_path = public/)

    for (const signature of [
      'public.archive_duration_learning_runtime_evidence_outbox_tombstone()',
      'public.cancel_duration_learning_runtime_evidence_before_subject_delete()',
      'public.persist_duration_learning_runtime_consumptions(JSONB)',
    ]) {
      const escapedSignature = signature.replaceAll('(', '\\(').replaceAll(')', '\\)')
      expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${escapedSignature}\\s+FROM anon, authenticated`))
    }

    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.archive_duration_learning_runtime_evidence_outbox_tombstone\(\)\s+TO workbuddy_runtime, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.cancel_duration_learning_runtime_evidence_before_subject_delete\(\)\s+TO workbuddy_runtime, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.persist_duration_learning_runtime_consumptions\(JSONB\)\s+TO workbuddy_runtime, service_role/)
  })

  it('has an exact rollback and is included in the clean bootstrap bundle', () => {
    const sql = readSql('migrations', migrationName)
    const rollback = readSql('migrations', 'rollback', migrationName)
    const clean = readSql('migrations', 'CLEAN_MIGRATION_V4.sql')
    const header = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = clean.indexOf(header)

    expect(rollback).toMatch(/ALTER FUNCTION public\.ensure_structured_cause_attribution_tenant\(\)\s+RESET search_path/)
    expect(rollback).toMatch(/ALTER FUNCTION public\.validate_risk_issue_closure_cause_attribution\(\)\s+RESET search_path/)
    expect(rollback).toMatch(/REVOKE ALL ON FUNCTION public\.archive_duration_learning_runtime_evidence_outbox_tombstone\(\)\s+FROM PUBLIC/)
    expect(rollback).toMatch(/REVOKE ALL ON FUNCTION public\.cancel_duration_learning_runtime_evidence_before_subject_delete\(\)\s+FROM PUBLIC/)
    expect(rollback).toMatch(/REVOKE ALL ON FUNCTION public\.persist_duration_learning_runtime_consumptions\(JSONB\)\s+FROM PUBLIC/)
    expect(rollback).toMatch(/GRANT EXECUTE ON FUNCTION public\.persist_duration_learning_runtime_consumptions\(JSONB\)\s+TO workbuddy_runtime, service_role/)
    expect(sourceIndex).toBeGreaterThanOrEqual(0)
    expect(clean.slice(sourceIndex + header.length).trim()).toBe(sql.trim())
  })
})
