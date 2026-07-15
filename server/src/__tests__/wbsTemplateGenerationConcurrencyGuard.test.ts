import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

function readServerFile(...segments: string[]) {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('WBS template duration suggestion concurrency guard', () => {
  it('keeps duration suggestion fan-out behind a bounded concurrency helper', () => {
    const source = readServerFile('src', 'services', 'wbsTemplateGenerationService.ts')
    const buildDurationSuggestionMapSource = source.slice(
      source.indexOf('async function buildDurationSuggestionMap'),
      source.indexOf('function readDurationDaysForNode'),
    )

    expect(source).toContain('WBS_DURATION_SUGGESTION_CONCURRENCY')
    expect(source).toContain('async function mapWithConcurrencyLimit')
    expect(buildDurationSuggestionMapSource.match(/mapWithConcurrencyLimit/g)).toHaveLength(2)
    expect(buildDurationSuggestionMapSource).toContain('DURATION_SUGGESTION_CONCURRENCY_LIMIT')
    expect(buildDurationSuggestionMapSource).not.toContain('Promise.all(targetsByScope.flatMap')
    expect(buildDurationSuggestionMapSource).not.toContain('Promise.all(unresolvedActivityTargets.map')
  })

  it('keeps oversized WBS generation behind a server-side row fuse', () => {
    const source = readServerFile('src', 'services', 'wbsTemplateGenerationService.ts')

    expect(source).toContain('WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT')
    expect(source).toContain('function assertGeneratedRowBudget')
    expect(source).toContain('WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED')
    expect(source).toMatch(/assertGeneratedRowBudget\(\{\s*generatedMainPlanRowCount,/s)
    expect(source.indexOf('assertGeneratedRowBudget({')).toBeLessThan(source.indexOf('let rows: GeneratedTemplateRow[] = []'))
  })
})
