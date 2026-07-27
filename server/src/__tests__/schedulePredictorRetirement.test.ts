import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentFile = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(currentFile), '../../..')

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('schedulePredictor retirement contract', () => {
  it('removes legacy schedule facades while keeping canonical duration suggestions on the unified forecast service', () => {
    expect(existsSync(path.join(repoRoot, 'server/src/services/schedulePredictor.ts'))).toBe(false)
    expect(existsSync(path.join(repoRoot, 'server/src/routes/aiSchedule.ts'))).toBe(false)

    const indexSource = readRepoFile('server/src/index.ts')
    const durationSuggestionsRoute = readRepoFile('server/src/routes/duration-suggestions.ts')
    expect(indexSource).not.toContain('aiScheduleRouter')
    expect(indexSource).toContain('durationSuggestionsRouter')
    expect(durationSuggestionsRoute).not.toContain('schedulePredictor')
    expect(durationSuggestionsRoute).toContain('taskDurationForecastService')

    const algorithmPlan = readRepoFile('docs/plans/v1.4.22算法与规则口径治理体系执行方案.md')
    expect(algorithmPlan).not.toContain('`schedulePredictor`')
    expect(algorithmPlan).toContain('taskDurationForecastService')
  })
})
