import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

describe('pending migration DROP target workflow contract', () => {
  it('runs the target-catalog preflight after diagnostics and before migrations mutate the database', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const serverPackage = JSON.parse(readFileSync(resolve(workspaceRoot, 'server', 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const runner = readFileSync(resolve(workspaceRoot, 'server', 'scripts', 'run-workflow-contract-gate.mjs'), 'utf8')
    const diagnoseIndex = workflow.indexOf('Diagnose migration release readiness before apply')
    const dropPreflightIndex = workflow.indexOf('Preflight pending migration DROP targets')
    const applyIndex = workflow.indexOf('Apply pending migrations')

    expect(diagnoseIndex).toBeGreaterThan(-1)
    expect(dropPreflightIndex).toBeGreaterThan(diagnoseIndex)
    expect(applyIndex).toBeGreaterThan(dropPreflightIndex)
    expect(workflow.slice(dropPreflightIndex, applyIndex)).toContain('npm run guard:pending-migration-drop-targets')
    expect(workflow).toContain('--allow-target-catalog-preflight')
    expect(serverPackage.scripts?.['guard:pending-migration-drop-targets']).toContain(
      'check-pending-migration-drop-targets.ts',
    )
    expect(runner).toContain("'src/__tests__/pendingMigrationDropTargetGuard.test.ts'")
    expect(runner).toContain("'src/__tests__/pendingMigrationDropTargetWorkflowContract.test.ts'")
  })
})
