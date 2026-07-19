import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith('server')
  ? resolve(process.cwd(), '..')
  : process.cwd()
const workflowPath = resolve(workspaceRoot, '.github/workflows/production-advisor-acl-remediation.yml')
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

describe('production Advisor ACL remediation workflow contract', () => {
  it('provides a reviewed exact-308 database-only bootstrap path', () => {
    const workflow = readIfPresent(workflowPath)

    expect(workflow).not.toBe('')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/\bschedule\s*:/)
    expect(workflow).toContain('group: lighthouse-host-runtime-mutation')
    expect(workflow).toContain('environment: Production')
    expect(workflow).toContain('APPLY_PRODUCTION_ADVISOR_ACL_REMEDIATION_308')
    expect(workflow).toContain('PRODUCTION_SUPABASE_URL')
    expect(workflow).toContain('PRODUCTION_SUPABASE_MIGRATION_URL')
    expect(workflow).not.toContain('SUPABASE_ADVISOR_EXPORT_JSON')
    expect(workflow).toContain('verify:commercial-trigger-rpc-target')
    expect(workflow).toContain('id: remediation-state')
    expect(workflow).toMatch(/if npm run verify:commercial-trigger-rpc-acl -- --expect hardened; then/)
    expect(workflow).toContain('verify:commercial-trigger-rpc-acl -- --expect vulnerable')
    expect(workflow).toContain('migrate:pending -- --only=308_commercial_trigger_rpc_acl_closeout.sql')
    expect(workflow).toContain('verify:commercial-trigger-rpc-acl -- --expect hardened')
    expect(workflow.match(/if: steps\.remediation-state\.outputs\.apply_required == 'true'/g))
      .toHaveLength(1)
    expect(workflow).toContain('git rev-parse origin/main')
    expect(workflow).not.toMatch(/\bssh\b|docker compose|deploy-lighthouse-server/i)

    const targetIdentityStep = readWorkflowStep(
      workflow,
      'Verify exact production database target identity',
    )
    expect(targetIdentityStep).toContain(
      'SUPABASE_URL: ${{ secrets.PRODUCTION_SUPABASE_URL }}',
    )
    expect(targetIdentityStep).toContain(
      'SUPABASE_MIGRATION_URL: ${{ secrets.PRODUCTION_SUPABASE_MIGRATION_URL }}',
    )
    for (const databaseStepName of [
      'Resolve exact remediation state',
      'Verify migration 308 is the exact selectable pending migration',
      'Apply migration 308 only',
      'Verify hardened ACL readback',
      'Report next migration phase',
    ]) {
      expect(readWorkflowStep(workflow, databaseStepName), databaseStepName).toContain(
        'DATABASE_URL: ${{ secrets.PRODUCTION_SUPABASE_MIGRATION_URL }}',
      )
    }

    const targetIdentityCheckIndex = workflow.indexOf('verify:commercial-trigger-rpc-target')
    const firstDatabaseReadIndex = Math.min(
      workflow.indexOf('verify:commercial-trigger-rpc-acl -- --expect hardened'),
      workflow.indexOf('migrate:plan -- --only=308_commercial_trigger_rpc_acl_closeout.sql'),
      workflow.indexOf('verify:commercial-trigger-rpc-acl -- --expect vulnerable'),
    )
    expect(targetIdentityCheckIndex).toBeGreaterThan(0)
    expect(firstDatabaseReadIndex).toBeGreaterThan(targetIdentityCheckIndex)
  })

  it('registers the verifier command and guards workflow changes on push and pull requests', () => {
    const packageJson = JSON.parse(readIfPresent(packagePath)) as { scripts?: Record<string, string> }
    const workflowGuard = readIfPresent(workflowGuardPath)
    const workflowGate = readIfPresent(workflowGatePath)
    const deployReadme = readIfPresent(deployReadmePath)
    const systemRegistry = JSON.parse(readIfPresent(systemRegistryPath)) as {
      entries?: Array<Record<string, unknown>>
    }

    expect(packageJson.scripts?.['verify:commercial-trigger-rpc-acl'])
      .toContain('verify-commercial-trigger-rpc-acl.ts')
    expect(packageJson.scripts?.['verify:commercial-trigger-rpc-target'])
      .toContain('verify-commercial-trigger-rpc-target.ts')
    expect(workflowGuard.match(/- '\.github\/workflows\/production-advisor-acl-remediation\.yml'/g))
      .toHaveLength(2)
    expect(workflowGuard.match(/- 'server\/src\/scripts\/verify-commercial-trigger-rpc-acl\.ts'/g))
      .toHaveLength(2)
    expect(workflowGuard.match(/- 'server\/src\/scripts\/verify-commercial-trigger-rpc-target\.ts'/g))
      .toHaveLength(2)
    expect(workflowGuard.match(/- 'server\/src\/services\/commercialTriggerRpcAclRemediationService\.ts'/g))
      .toHaveLength(2)
    expect(workflowGuard.match(/- 'server\/src\/registry\/system-domain-registry\.json'/g))
      .toHaveLength(2)
    expect(workflowGuard.match(/- 'server\/src\/__tests__\/commercialTriggerRpcAclRemediationService\.test\.ts'/g))
      .toHaveLength(2)
    expect(workflowGuard.match(/- 'server\/src\/__tests__\/productionAdvisorAclRemediationWorkflowContract\.test\.ts'/g))
      .toHaveLength(2)
    expect(workflowGate).toContain('src/__tests__/commercialTriggerRpcAclRemediationService.test.ts')
    expect(workflowGate).toContain('src/__tests__/productionAdvisorAclRemediationWorkflowContract.test.ts')
    expect(systemRegistry.entries?.find((entry) => (
      entry.kind === 'service'
      && entry.id === 'commercialTriggerRpcAclRemediationService'
    ))).toMatchObject({
      architectureUnit: '底座：平台运行观测',
      runtimeScope: 'platform_foundation',
    })
    expect(deployReadme).toContain('Production Advisor ACL Remediation 308')
    expect(deployReadme).toContain('APPLY_PRODUCTION_ADVISOR_ACL_REMEDIATION_308')
    expect(deployReadme).toMatch(/refresh.*Production.*Advisor.*zero security issues/is)
  })
})
