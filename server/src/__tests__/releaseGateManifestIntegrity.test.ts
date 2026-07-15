import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function readDeclaredTests(scriptName: string, manifestName: string) {
  const scriptPath = resolve(serverRoot, 'scripts', scriptName)
  const source = readFileSync(scriptPath, 'utf8')
  const manifest = source.match(
    new RegExp(`const ${manifestName} = \\[([\\s\\S]*?)\\n\\]`, 'u'),
  )?.[1] ?? ''

  return {
    source,
    tests: [...manifest.matchAll(/['"]([^'"]+)['"]/gu)].map((match) => match[1]),
  }
}

describe('release gate manifests', () => {
  it.each([
    ['run-workflow-contract-gate.mjs', 'workflowContractTests'],
    ['run-c18-live-evidence-contract-gate.mjs', 'c18LiveEvidenceContractTests'],
  ])('%s references only tests that exist on disk', (scriptName, manifestName) => {
    const manifest = readDeclaredTests(scriptName, manifestName)
    const missingTests = manifest.tests.filter(
      (relativePath) => !existsSync(resolve(serverRoot, relativePath)),
    )

    expect(missingTests).toEqual([])
  })

  it('fails workflow contract verification before Vitest when a test is missing', () => {
    const { source } = readDeclaredTests('run-workflow-contract-gate.mjs', 'workflowContractTests')

    expect(source).toContain('missingWorkflowContractTests')
    expect(source).toContain('missing workflow contract test files')
  })

  it('fails C-18 verification before Vitest when a test is missing', () => {
    const { source } = readDeclaredTests('run-c18-live-evidence-contract-gate.mjs', 'c18LiveEvidenceContractTests')

    expect(source).toContain('missingC18LiveEvidenceContractTests')
    expect(source).toContain('missing C-18 live evidence contract test files')
  })
})
