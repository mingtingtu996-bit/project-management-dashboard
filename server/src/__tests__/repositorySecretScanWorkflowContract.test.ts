import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

function extractEventPaths(workflow: string, eventName: 'push' | 'pull_request') {
  const lines = workflow.split(/\r?\n/)
  const eventStart = lines.findIndex((line) => line === `  ${eventName}:`)
  const pathsStart = lines.findIndex((line, index) => index > eventStart && line === '    paths:')
  const paths: string[] = []

  for (const line of lines.slice(pathsStart + 1)) {
    if (/^  [a-z_]+:/.test(line)) break
    if (line.startsWith('      - ')) {
      paths.push(line.replace(/^      - ['"]?/, '').replace(/['"]?$/, ''))
    }
  }
  return paths
}

describe('repository secret scan workflow contract', () => {
  it('blocks deployment with the repository secret scan before dependency installation', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const scanIndex = workflow.indexOf('name: Repository Secret Scan')
    const installIndex = workflow.indexOf('name: Install server dependencies')

    expect(scanIndex).toBeGreaterThan(-1)
    expect(installIndex).toBeGreaterThan(scanIndex)
    expect(workflow.slice(scanIndex, installIndex)).toContain('node scripts/guard-repository-secrets.mjs')
  })

  it('tests and executes the scanner whenever its contract changes', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')
    const runner = readFileSync(resolve(workspaceRoot, 'server', 'scripts', 'run-workflow-contract-gate.mjs'), 'utf8')
    const requiredPaths = [
      'scripts/guard-repository-secrets.mjs',
      'scripts/guard-repository-secrets.test.mjs',
      'server/src/__tests__/repositorySecretScanWorkflowContract.test.ts',
    ]

    for (const eventName of ['push', 'pull_request'] as const) {
      const paths = extractEventPaths(workflow, eventName)
      for (const requiredPath of requiredPaths) {
        expect(paths).toContain(requiredPath)
      }
    }

    expect(workflow).toContain('node --test scripts/guard-repository-secrets.test.mjs')
    expect(workflow).toContain('node scripts/guard-repository-secrets.mjs')
    expect(runner).toContain("'src/__tests__/repositorySecretScanWorkflowContract.test.ts'")
  })
})
