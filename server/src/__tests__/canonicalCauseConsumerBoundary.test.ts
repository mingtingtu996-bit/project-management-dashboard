import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../', import.meta.url))

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : productionTypeScriptFiles(path)
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : []
  })
}

function sourceText(relativePath: string) {
  return readFileSync(join(sourceRoot, relativePath), 'utf8')
}

describe('canonical cause consumer boundary', () => {
  it('limits the progress deviation registry to translation inventory modules', () => {
    const consumers = productionTypeScriptFiles(sourceRoot)
      .filter((path) => readFileSync(path, 'utf8').includes('progressDeviationCauseRegistry'))
      .map((path) => relative(sourceRoot, path).replaceAll('\\', '/'))
      .sort()

    expect(consumers).toEqual([
      'services/algorithmRuleAssetInventoryService.ts',
      'services/algorithmSeedRegistry.ts',
      'services/v14223RequirementCoverageAuditService.ts',
    ])
  })

  it('requires deviation consumers to translate legacy factors through the canonical domain', () => {
    for (const relativePath of [
      'services/progressDeviationService.ts',
      'services/projectHealthDeviationSummaryService.ts',
    ]) {
      const source = sourceText(relativePath)
      expect(source).toContain('translateLegacyProgressFactor')
      expect(source).not.toContain('progressDeviationCauseRegistry')
    }
  })
})
