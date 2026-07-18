import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const workspaceRoot = resolve(serverRoot, '..')

describe('duration suggestion simulation naming contract', () => {
  it('does not label the fully mocked duration suggestion suite as E2E', () => {
    const simulationPath = resolve(serverRoot, 'src/__tests__/durationSuggestionSimulation.test.ts')
    const legacyE2ePath = resolve(serverRoot, 'src/__tests__/durationSuggestionE2E.test.ts')
    const serverPackage = readFileSync(resolve(serverRoot, 'package.json'), 'utf8')
    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github/workflows/workflow-guard.yml'), 'utf8')
    const workflowManifest = readFileSync(resolve(serverRoot, 'scripts/run-workflow-contract-gate.mjs'), 'utf8')

    expect(existsSync(simulationPath)).toBe(true)
    expect(existsSync(legacyE2ePath)).toBe(false)
    expect(serverPackage).toContain('src/__tests__/durationSuggestionSimulation.test.ts')
    expect(serverPackage).not.toContain('src/__tests__/durationSuggestionE2E.test.ts')
    expect(workflowGuard).not.toContain('server/src/__tests__/durationSuggestionE2E.test.ts')
    expect(workflowManifest).not.toContain('src/__tests__/durationSuggestionE2E.test.ts')
  })
})
