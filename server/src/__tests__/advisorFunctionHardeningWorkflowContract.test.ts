import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith('server')
  ? resolve(process.cwd(), '..')
  : process.cwd()
const workflowPath = resolve(workspaceRoot, '.github/workflows/advisor-function-hardening-334.yml')
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

describe('Advisor function hardening 334 workflow contract', () => {
  it('provides an exact-SHA database-only remediation path for staging and production', () => {
    const workflow = readIfPresent(workflowPath)

    expect(workflow).not.toBe('')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/\bschedule\s*:/)
    expect(workflow).toContain('group: lighthouse-host-runtime-mutation')
    expect(workflow).toContain(
      "environment: ${{ inputs.environment == 'staging' && 'staging' || 'Production' }}",
    )
    expect(workflow).toContain('APPLY_STAGING_ADVISOR_FUNCTION_HARDENING_334')
    expect(workflow).toContain('APPLY_PRODUCTION_ADVISOR_FUNCTION_HARDENING_334')
    expect(workflow).toContain('EXACT_8_WARNINGS_MATCH_MIGRATION_334')
    expect(workflow).toContain('migration_maintenance_window_confirmed')
    expect(workflow).toContain("[ \"$MIGRATION_MAINTENANCE_WINDOW_CONFIRMED\" = \"true\" ]")
    expect(workflow).toContain("inputs.environment == 'staging' && 'STAGING' || 'PRODUCTION'")
    expect(workflow).not.toContain('SUPABASE_ADVISOR_EXPORT_JSON')
    expect(workflow).toContain('verify:security-advisor-function-hardening-target')
    expect(workflow).toContain('id: remediation-state')
    expect(workflow).toContain('verify:security-advisor-function-hardening -- --expect hardened')
    expect(workflow).toContain('verify:security-advisor-function-hardening -- --expect pending')
    expect(workflow).toContain('migrate:plan -- --only=334_security_advisor_function_hardening.sql')
    expect(workflow).toContain('migrate:pending -- --only=334_security_advisor_function_hardening.sql')
    expect(workflow.match(/if: steps\.remediation-state\.outputs\.apply_required == 'true'/g))
      .toHaveLength(1)
    expect(workflow).toContain('git rev-parse origin/main')
    expect(workflow).not.toMatch(/\bssh\b|docker compose|deploy-lighthouse-server/i)

    const targetIdentityStep = readWorkflowStep(
      workflow,
      'Verify exact database target identity',
    )
    expect(targetIdentityStep).toContain("secrets[format('{0}_SUPABASE_URL'")
    expect(targetIdentityStep).toContain("secrets[format('{0}_SUPABASE_MIGRATION_URL'")
    for (const databaseStepName of [
      'Resolve exact remediation state',
      'Verify migration 334 is the exact selectable pending migration',
      'Apply migration 334 only',
      'Verify hardened function readback',
      'Report next release phase',
    ]) {
      expect(readWorkflowStep(workflow, databaseStepName), databaseStepName).toContain(
        "secrets[format('{0}_SUPABASE_MIGRATION_URL'",
      )
    }

    const maintenanceIndex = workflow.indexOf('MIGRATION_MAINTENANCE_WINDOW_CONFIRMED')
    const targetIdentityIndex = workflow.indexOf('verify:security-advisor-function-hardening-target')
    const firstDatabaseReadIndex = Math.min(
      workflow.indexOf('verify:security-advisor-function-hardening -- --expect hardened'),
      workflow.indexOf('migrate:plan -- --only=334_security_advisor_function_hardening.sql'),
    )
    expect(maintenanceIndex).toBeGreaterThan(0)
    expect(targetIdentityIndex).toBeGreaterThan(maintenanceIndex)
    expect(firstDatabaseReadIndex).toBeGreaterThan(targetIdentityIndex)
  })

  it('registers verifier commands and guards every remediation path', () => {
    const packageJson = JSON.parse(readIfPresent(packagePath)) as { scripts?: Record<string, string> }
    const workflowGuard = readIfPresent(workflowGuardPath)
    const workflowGate = readIfPresent(workflowGatePath)
    const deployReadme = readIfPresent(deployReadmePath)
    const systemRegistry = JSON.parse(readIfPresent(systemRegistryPath)) as {
      entries?: Array<Record<string, unknown>>
    }

    expect(packageJson.scripts?.['verify:security-advisor-function-hardening'])
      .toContain('verify-security-advisor-function-hardening.ts')
    expect(packageJson.scripts?.['verify:security-advisor-function-hardening-target'])
      .toContain('verify-security-advisor-function-hardening-target.ts')
    for (const guardedPath of [
      '.github/workflows/advisor-function-hardening-334.yml',
      'server/src/services/securityAdvisorFunctionHardeningService.ts',
      'server/src/scripts/verify-security-advisor-function-hardening.ts',
      'server/src/scripts/verify-security-advisor-function-hardening-target.ts',
      'server/src/__tests__/securityAdvisorFunctionHardeningService.test.ts',
      'server/src/__tests__/advisorFunctionHardeningWorkflowContract.test.ts',
    ]) {
      expect(workflowGuard.match(new RegExp(`- '${guardedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'g')), guardedPath)
        .toHaveLength(2)
    }
    expect(workflowGate).toContain('src/__tests__/securityAdvisorFunctionHardeningService.test.ts')
    expect(workflowGate).toContain('src/__tests__/advisorFunctionHardeningWorkflowContract.test.ts')
    expect(systemRegistry.entries?.find((entry) => (
      entry.kind === 'service'
      && entry.id === 'securityAdvisorFunctionHardeningService'
    ))).toMatchObject({
      runtimeScope: 'platform_foundation',
    })
    expect(deployReadme).toContain('Advisor Function Hardening 334')
    expect(deployReadme).toContain('APPLY_STAGING_ADVISOR_FUNCTION_HARDENING_334')
    expect(deployReadme).toContain('APPLY_PRODUCTION_ADVISOR_FUNCTION_HARDENING_334')
    expect(deployReadme).toMatch(/refresh.*Advisor.*zero security issues/is)
  })
})
