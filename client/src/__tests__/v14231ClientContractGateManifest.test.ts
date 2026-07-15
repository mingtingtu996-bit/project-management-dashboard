import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const gatePath = resolve(clientRoot, 'scripts/run-v14231-client-contract-gate.mjs')

function readDeclaredContractTests() {
  const source = readFileSync(gatePath, 'utf8')
  const manifest = source.match(/const clientContractTests = \[([\s\S]*?)\n\]/u)?.[1] ?? ''

  return [...manifest.matchAll(/['"]([^'"]+)['"]/gu)].map((match) => match[1])
}

describe('v1.4.23.1 client contract gate manifest', () => {
  it('references only contract tests that exist on disk', () => {
    const missingTests = readDeclaredContractTests().filter(
      (relativePath) => !existsSync(resolve(clientRoot, relativePath)),
    )

    expect(missingTests).toEqual([])
  })

  it('fails before Vitest when a declared contract test is missing', () => {
    const source = readFileSync(gatePath, 'utf8')

    expect(source).toContain('missingClientContractTests')
    expect(source).toContain('missing client contract test files')
  })
})
