import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = resolve(__dirname, '..', '..')

const CALENDAR_CONSUMERS = [
  'services/constructionDependencyReplayCalibrationService.ts',
  'services/durationExperienceService.ts',
  'services/durationSuggestionService.ts',
  'services/projectCriticalPathService.ts',
  'services/projectGenerationFactsStoreService.ts',
  'services/projectRemainingDurationForecastService.ts',
  'services/t2RhythmProductionCapacityEvidenceService.ts',
  'services/taskDurationForecastService.ts',
  'services/taskPlanDrilldownRhythmService.ts',
  'services/templateDurationGovernanceService.ts',
  'services/wbsPlanRollupService.ts',
  'services/wbsTemplateFeedback.ts',
  'services/wbsTemplateGenerationService.ts',
]

describe('construction calendar identity consumption contract', () => {
  it('routes production-day decisions through the shared identity authority', () => {
    for (const relativePath of CALENDAR_CONSUMERS) {
      const source = readFileSync(resolve(serverRoot, 'src', relativePath), 'utf8')
      expect(source, relativePath).toMatch(
        /isAuthoritativeConstructionCalendar|effectiveConstructionCalendarBasis|normalizeConstructionCalendarForConsumption|hasIdentifiedConstructionCalendar/,
      )
    }
  })

  it('does not reintroduce the known basis-only or window-count-only predicates', () => {
    const combinedSource = CALENDAR_CONSUMERS
      .map((relativePath) => readFileSync(resolve(serverRoot, 'src', relativePath), 'utf8'))
      .join('\n')

    expect(combinedSource).not.toMatch(
      /constructionCalendar\?\.basis\s*===\s*['"]official_construction_calendar_seed['"]/,
    )
    expect(combinedSource).not.toMatch(
      /workCalendar\.basis\s*===\s*['"]official_construction_calendar_seed['"]/,
    )
    expect(combinedSource).not.toContain('return Boolean(calendar?.windows?.length)')
  })
})
