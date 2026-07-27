import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { readWbsTemplateGenerationImplementationSource } from './helpers/wbsTemplateGenerationSource.js'

function readServerFile(...segments: string[]) {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function readWbsImplementation() {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return readWbsTemplateGenerationImplementationSource(serverRoot)
}

describe('WBS template duration suggestion concurrency guard', () => {
  it('keeps duration suggestion fan-out behind a bounded concurrency helper', () => {
    const source = readWbsImplementation()
    const assetStrategySource = readServerFile('src', 'services', 'wbsTemplateAssetStrategyService.ts')
    const sourceFile = ts.createSourceFile(
      'wbsTemplateAssetStrategyService.ts',
      assetStrategySource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const buildDurationSuggestionMapSource = sourceFile.statements.find((statement) => (
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'buildDurationSuggestionMap'
    ))?.getText(sourceFile)

    expect(source).toContain('WBS_DURATION_SUGGESTION_CONCURRENCY')
    expect(source).toContain('async function mapWithConcurrencyLimit')
    expect(buildDurationSuggestionMapSource?.match(/mapWithConcurrencyLimit/g)).toHaveLength(2)
    expect(buildDurationSuggestionMapSource).toContain('DURATION_SUGGESTION_CONCURRENCY_LIMIT')
    expect(buildDurationSuggestionMapSource).not.toContain('Promise.all(targetsByScope.flatMap')
    expect(buildDurationSuggestionMapSource).not.toContain('Promise.all(unresolvedActivityTargets.map')
  })

  it('keeps oversized WBS generation behind a server-side row fuse', () => {
    const source = readWbsImplementation()

    expect(source).toContain('WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT')
    expect(source).toContain('function assertGeneratedRowBudget')
    expect(source).toContain('WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED')
    expect(source).toMatch(/assertGeneratedRowBudget\(\{\s*generatedMainPlanRowCount,/s)
    expect(source.indexOf('assertGeneratedRowBudget({')).toBeLessThan(source.indexOf('let rows: GeneratedTemplateRow[] = []'))
  })
})
