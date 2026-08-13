import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()
const serverRoot = resolve(workspaceRoot, 'server')
const migrationName = '338_risk_issue_atomic_closure_outcome.sql'

function readIfPresent(...parts: string[]) {
  const path = resolve(...parts)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('risk-to-issue atomic closure outcome migration', () => {
  it('replaces the atomic conversion RPC with a constraint-complete closure outcome', () => {
    const forward = readIfPresent(serverRoot, 'migrations', migrationName)

    expect(forward).not.toBe('')
    expect(forward).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_issue_from_risk_atomic/i)
    expect(forward).toMatch(/linked_issue_id\s*=\s*v_issue_id/i)
    expect(forward).toMatch(/status\s*=\s*'closed'/i)
    expect(forward).toMatch(/closed_reason\s*=\s*'converted_to_issue'/i)
    expect(forward).toMatch(/closure_result_code\s*=\s*'transferred'/i)
    expect(forward).toMatch(/closure_result_summary\s*=\s*'Escalated to linked issue'/i)
    expect(forward).toMatch(/closure_effectiveness\s*=\s*'transferred'/i)
    expect(forward).toMatch(/closure_evidence_refs\s*=\s*jsonb_build_array\([^)]*v_issue_id/i)
    expect(forward).toMatch(/closure_cause_attribution_id\s*=\s*NULL/i)
    expect(forward).toMatch(/closed_by\s*=\s*NULL/i)
    expect(forward).toMatch(/closure_recorded_at\s*=\s*v_timestamp/i)
    expect(forward).toMatch(/SET\s+search_path\s*=\s*public,\s*pg_temp/i)
    expect(forward).toMatch(/pg_get_functiondef/i)
    expect(forward).toContain('MIGRATION_338_RISK_ISSUE_ATOMIC_CLOSURE_OUTCOME_READBACK_COMPLETE')
  })

  it('keeps rollback constraint-safe by returning converted risks to manual close', () => {
    const rollback = readIfPresent(serverRoot, 'migrations', 'rollback', migrationName)

    expect(rollback).not.toBe('')
    expect(rollback).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_issue_from_risk_atomic/i)
    expect(rollback).toMatch(/linked_issue_id\s*=\s*v_issue_id/i)
    expect(rollback).toMatch(/status\s*=\s*'mitigating'/i)
    expect(rollback).toMatch(/pending_manual_close\s*=\s*TRUE/i)
    expect(rollback).not.toMatch(/status\s*=\s*'closed'/i)
    expect(rollback).toMatch(/SET\s+search_path\s*=\s*public,\s*pg_temp/i)
    expect(rollback).toMatch(/pg_get_functiondef/i)
    expect(rollback).toContain('MIGRATION_338_RISK_ISSUE_ATOMIC_CLOSURE_OUTCOME_ROLLBACK_COMPLETE')
  })

  it('requires exact-SHA staging-first authorization before migration 338 can run', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')

    expect(workflow).toContain('Authorize risk-to-issue atomic closure outcome 338')
    expect(workflow).toContain(migrationName)
    expect(workflow).toContain('MIGRATION_338_APPROVED_SHA')
    expect(workflow).toContain('MIGRATION_338_STAGING_EVIDENCE_REF')
    expect(workflow).toMatch(/RISK_ISSUE_ATOMIC_CLOSURE_OUTCOME_APPROVED_SHA[\s\S]+GITHUB_SHA[\s\S]+exit 1/)
    expect(workflow).toMatch(/DEPLOY_TARGET[\s\S]+staging[\s\S]+Migration 338 is approved for this exact staging SHA/)
  })

  it('keeps the canonical clean bundle and system registry aligned', () => {
    const forward = readFileSync(resolve(serverRoot, 'migrations', migrationName), 'utf8')
      .replace(/\r\n/g, '\n')
      .trim()
    const cleanBundle = readFileSync(resolve(serverRoot, 'migrations', 'CLEAN_MIGRATION_V4.sql'), 'utf8')
      .replace(/\r\n/g, '\n')
    const registry = JSON.parse(
      readFileSync(resolve(serverRoot, 'src', 'registry', 'system-domain-registry.json'), 'utf8'),
    ) as { entries?: Array<{ kind?: string; id?: string }> }

    expect(cleanBundle).toContain('CANONICAL: current clean bootstrap bundle, synchronized through migration 338')
    expect(cleanBundle).toContain(`Source: ${migrationName}`)
    expect(cleanBundle.trimEnd().endsWith(forward)).toBe(true)
    expect(registry.entries).toContainEqual(expect.objectContaining({
      kind: 'migration',
      id: '338_risk_issue_atomic_closure_outcome',
    }))
  })
})
