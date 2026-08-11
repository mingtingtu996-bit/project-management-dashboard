import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

function readIfPresent(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('construction dependency replay runtime RLS migration', () => {
  const forwardPath = resolve(
    workspaceRoot,
    'server/migrations/337_construction_dependency_replay_runtime_rls.sql',
  )
  const rollbackPath = resolve(
    workspaceRoot,
    'server/migrations/rollback/337_construction_dependency_replay_runtime_rls.sql',
  )

  it('allows the backend runtime to read and append only governed report-only rows', () => {
    const forward = readIfPresent(forwardPath)

    expect(forward).not.toBe('')
    expect(forward).toMatch(/GRANT\s+SELECT,\s*INSERT\s+ON\s+TABLE\s+public\.construction_dependency_replay_calibration_reports\s+TO\s+workbuddy_runtime/i)
    expect(forward).toMatch(/REVOKE\s+UPDATE,\s*DELETE,\s*TRUNCATE,\s*REFERENCES,\s*TRIGGER\s+ON\s+TABLE\s+public\.construction_dependency_replay_calibration_reports\s+FROM\s+workbuddy_runtime/i)
    expect(forward).not.toMatch(/GRANT\s+[^;]*(?:UPDATE|DELETE)[^;]*TO\s+workbuddy_runtime/i)
    expect(forward).toContain('construction_dependency_replay_report_backend_runtime_select')
    expect(forward).toContain('construction_dependency_replay_report_backend_runtime_insert')
    expect(forward).toMatch(/FOR\s+SELECT\s+TO\s+workbuddy_runtime/i)
    expect(forward).toMatch(/FOR\s+INSERT\s+TO\s+workbuddy_runtime/i)
    expect(forward).toMatch(/current_user\s*=\s*'workbuddy_runtime'/i)
    expect(forward).toMatch(/pg_has_role\(current_user,\s*'workbuddy_runtime',\s*'member'\)/i)
    expect(forward).toMatch(/project_id\s+IS\s+NOT\s+NULL/i)
    expect(forward).toContain("report_code = 'construction_dependency_replay_calibration'")
    expect(forward).toContain("triggered_by = 'scheduled_or_manual_governance_job'")
    expect(forward).toContain("runtime_mutation_policy = 'none_report_only'")
    expect(forward).toContain("governance_policy ->> 'replayMode' = 'report_only'")
    expect(forward).toContain("governance_policy ->> 'seedWritePolicy' = 'never_write_seed_from_replay'")
    expect(forward).toContain("governance_policy ->> 'taskDependencyWritePolicy' = 'never_write_task_dependencies_from_replay'")
  })

  it('performs catalog readback and restores the pre-337 runtime ACL on rollback', () => {
    const forward = readIfPresent(forwardPath)
    const rollback = readIfPresent(rollbackPath)

    expect(forward).toMatch(/has_table_privilege\(\s*'workbuddy_runtime',[\s\S]+?'SELECT'/i)
    expect(forward).toMatch(/has_table_privilege\(\s*'workbuddy_runtime',[\s\S]+?'INSERT'/i)
    expect(forward).toMatch(/has_table_privilege\(\s*'workbuddy_runtime',[\s\S]+?'UPDATE'/i)
    expect(forward).toMatch(/has_table_privilege\(\s*'workbuddy_runtime',[\s\S]+?'DELETE'/i)
    expect(forward).toContain('FROM pg_policies')
    expect(forward).toContain('MIGRATION_337_CONSTRUCTION_DEPENDENCY_REPLAY_RUNTIME_RLS_READBACK_COMPLETE')

    expect(rollback).not.toBe('')
    expect(rollback).toContain('DROP POLICY IF EXISTS construction_dependency_replay_report_backend_runtime_select')
    expect(rollback).toContain('DROP POLICY IF EXISTS construction_dependency_replay_report_backend_runtime_insert')
    expect(rollback).toMatch(/GRANT\s+UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.construction_dependency_replay_calibration_reports\s+TO\s+workbuddy_runtime/i)
    expect(rollback).not.toMatch(/REVOKE\s+SELECT,\s*INSERT\s+ON\s+TABLE\s+public\.construction_dependency_replay_calibration_reports\s+FROM\s+workbuddy_runtime/i)
    expect(rollback).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|TRUNCATE/i)
    expect(rollback).toContain('MIGRATION_337_CONSTRUCTION_DEPENDENCY_REPLAY_RUNTIME_RLS_ROLLBACK_COMPLETE')
  })

  it('requires exact-SHA staging-first authorization before migration 337 can run', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')

    expect(workflow).toContain('Authorize construction dependency replay runtime RLS 337')
    expect(workflow).toContain('337_construction_dependency_replay_runtime_rls.sql')
    expect(workflow).toContain('MIGRATION_337_APPROVED_SHA')
    expect(workflow).toContain('MIGRATION_337_STAGING_EVIDENCE_REF')
    expect(workflow).toMatch(/CONSTRUCTION_DEPENDENCY_REPLAY_RUNTIME_RLS_APPROVED_SHA[\s\S]+GITHUB_SHA[\s\S]+exit 1/)
    expect(workflow).toMatch(/DEPLOY_TARGET[\s\S]+staging[\s\S]+Migration 337 is approved for this exact staging SHA/)
    expect(workflow).toMatch(/CONSTRUCTION_DEPENDENCY_REPLAY_RUNTIME_RLS_STAGING_EVIDENCE_REF[\s\S]+exit 1/)
  })
})
