import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const workspaceRoot = resolve(serverRoot, '..')

describe('tracked relative import closure release gate', () => {
  it('is exposed by the server package and runs before typecheck in deploy CI', () => {
    const packageJson = JSON.parse(readFileSync(resolve(serverRoot, 'package.json'), 'utf8'))
    const workflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')
    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github/workflows/workflow-guard.yml'), 'utf8')

    expect(packageJson.scripts?.['guard:tracked-relative-imports']).toBe(
      'node scripts/guard-tracked-relative-import-closure.mjs',
    )
    const guardIndex = workflow.indexOf('name: Server tracked relative import closure guard')
    const typecheckIndex = workflow.indexOf('name: Server typecheck')
    expect(guardIndex).toBeGreaterThan(0)
    expect(typecheckIndex).toBeGreaterThan(guardIndex)
    expect(workflow.slice(guardIndex, typecheckIndex)).toContain('npm run guard:tracked-relative-imports')
    expect(workflowGuard).toContain('name: Test tracked relative import closure guard')
    expect(workflowGuard).toContain('node --test scripts/guard-tracked-relative-import-closure.test.mjs')
    expect(workflowGuard).toContain('name: Verify tracked relative import closure')
    expect(workflowGuard).toContain('npm run guard:tracked-relative-imports')
  })
})
