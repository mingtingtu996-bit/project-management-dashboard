import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith('server')
  ? resolve(process.cwd(), '..')
  : process.cwd()
const workflowPath = resolve(workspaceRoot, '.github/workflows/advisor-retirement-state-rls-335.yml')
const workflowGuardPath = resolve(workspaceRoot, '.github/workflows/workflow-guard.yml')
const packagePath = resolve(workspaceRoot, 'server/package.json')
const workflowGatePath = resolve(workspaceRoot, 'server/scripts/run-workflow-contract-gate.mjs')
const deployReadmePath = resolve(workspaceRoot, 'deploy/README.md')
const systemRegistryPath = resolve(workspaceRoot, 'server/src/registry/system-domain-registry.json')

function readIfPresent(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function readWorkflowStep(workflow: string, name: string) {
  const marker = `      - name: ${name}`
  const start = workflow.indexOf(marker)
  if (start < 0) return ''
  const next = workflow.indexOf('\n      - name:', start + marker.length)
  return workflow.slice(start, next < 0 ? workflow.length : next)
}

describe('Advisor retirement-state RLS 335 workflow contract', () => {
  it('provides a staging-only exact-SHA database migration path', () => {
    const workflow = readIfPresent(workflowPath)

    expect(workflow).not.toBe('')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/\bschedule\s*:/)
    expect(workflow).toContain('environment: staging')
    expect(workflow).toContain('group: lighthouse-host-runtime-mutation')
    expect(workflow).toContain('APPLY_STAGING_ADVISOR_RETIREMENT_STATE_RLS_335')
    expect(workflow).toContain('EXACT_1_SECURITY_INFO_MATCH_MIGRATION_335')
    expect(workflow).toContain('migration_maintenance_window_confirmed')
    expect(workflow).toContain('[ "$MIGRATION_MAINTENANCE_WINDOW_CONFIRMED" = "true" ]')
    expect(workflow).toContain('[ "$(git rev-parse origin/main)" = "$RELEASE_SHA" ]')
    expect(workflow).toContain('verify:security-advisor-retirement-state-rls-target')
    expect(workflow).toContain('migrate:plan -- --only=335_duration_learning_retirement_state_rls_policy.sql')
    expect(workflow).toContain('migrate:pending -- --only=335_duration_learning_retirement_state_rls_policy.sql')
    expect(workflow).toContain('verify:security-advisor-retirement-state-rls -- --expect hardened')
    expect(workflow).not.toMatch(/\bproduction\b/i)
    expect(workflow).not.toMatch(/\bssh\b|docker compose|deploy-lighthouse-server|npm run (?:build|start)/i)
    expect(workflow).not.toContain('SUPABASE_ADVISOR_EXPORT_JSON')

    const targetIdentityStep = readWorkflowStep(workflow, 'Verify exact staging database target identity')
    expect(targetIdentityStep).toContain('secrets.STAGING_SUPABASE_URL')
    expect(targetIdentityStep).toContain('secrets.STAGING_SUPABASE_MIGRATION_URL')
    for (const databaseStepName of [
      'Verify migration 335 is the exact selectable pending migration',
      'Apply migration 335 only',
      'Verify migration 335 readback',
    ]) {
      expect(readWorkflowStep(workflow, databaseStepName), databaseStepName).toContain(
        'secrets.STAGING_SUPABASE_MIGRATION_URL',
      )
    }

    const maintenanceIndex = workflow.indexOf('MIGRATION_MAINTENANCE_WINDOW_CONFIRMED')
    const targetIdentityIndex = workflow.indexOf('verify:security-advisor-retirement-state-rls-target')
    const firstDatabaseReadIndex = workflow.indexOf('migrate:plan -- --only=335_duration_learning_retirement_state_rls_policy.sql')
    expect(maintenanceIndex).toBeGreaterThan(0)
    expect(targetIdentityIndex).toBeGreaterThan(maintenanceIndex)
    expect(firstDatabaseReadIndex).toBeGreaterThan(targetIdentityIndex)
  })

  it('registers the verifier, workflow, and focused contract in repository gates', () => {
    const packageJson = JSON.parse(readIfPresent(packagePath)) as { scripts?: Record<string, string> }
    const workflowGuard = readIfPresent(workflowGuardPath)
    const workflowGate = readIfPresent(workflowGatePath)
    const deployReadme = readIfPresent(deployReadmePath)
    const systemRegistry = JSON.parse(readIfPresent(systemRegistryPath)) as {
      entries?: Array<Record<string, unknown>>
    }

    expect(packageJson.scripts?.['verify:security-advisor-retirement-state-rls'])
      .toContain('verify-security-advisor-retirement-state-rls.ts')
    expect(packageJson.scripts?.['verify:security-advisor-retirement-state-rls-target'])
      .toContain('verify-security-advisor-retirement-state-rls-target.ts')
    for (const guardedPath of [
      '.github/workflows/advisor-retirement-state-rls-335.yml',
      'server/src/services/securityAdvisorRetirementStateRlsService.ts',
      'server/src/scripts/verify-security-advisor-retirement-state-rls.ts',
      'server/src/scripts/verify-security-advisor-retirement-state-rls-target.ts',
      'server/src/__tests__/securityAdvisorRetirementStateRlsMigration.test.ts',
      'server/src/__tests__/securityAdvisorRetirementStateRlsService.test.ts',
      'server/src/__tests__/advisorRetirementStateRlsWorkflowContract.test.ts',
    ]) {
      expect(
        workflowGuard.match(new RegExp(`- '${guardedPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'`, 'g')),
        guardedPath,
      ).toHaveLength(2)
    }
    expect(workflowGate).toContain('src/__tests__/securityAdvisorRetirementStateRlsMigration.test.ts')
    expect(workflowGate).toContain('src/__tests__/securityAdvisorRetirementStateRlsService.test.ts')
    expect(workflowGate).toContain('src/__tests__/advisorRetirementStateRlsWorkflowContract.test.ts')
    expect(systemRegistry.entries?.find((entry) => (
      entry.kind === 'service'
      && entry.id === 'securityAdvisorRetirementStateRlsService'
    ))).toMatchObject({ runtimeScope: 'platform_foundation' })
    expect(deployReadme).toContain('Advisor Retirement-State RLS 335')
    expect(deployReadme).toContain('APPLY_STAGING_ADVISOR_RETIREMENT_STATE_RLS_335')
    expect(deployReadme).toContain('EXACT_1_SECURITY_INFO_MATCH_MIGRATION_335')
  })
})
