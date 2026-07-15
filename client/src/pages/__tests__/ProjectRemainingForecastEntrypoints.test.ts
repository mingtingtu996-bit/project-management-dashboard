import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function readSource(relativePath: string) {
  const candidates = [
    join(process.cwd(), relativePath),
    join(process.cwd(), 'client', relativePath),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root before failing.
    }
  }

  throw new Error(`Unable to locate ${relativePath}`)
}

describe('project remaining forecast frontend entrypoints', () => {
  it('uses one shared API client for the project-level remaining duration outlet', () => {
    const source = readSource('src/services/projectRemainingForecastApi.ts')
    const cardSource = readSource('src/components/ProjectRemainingForecastCard.tsx')

    expect(source.includes('/schedule-acceleration/remaining-forecast')).toBe(true)
    expect(source.includes('getProjectRemainingDurationForecast')).toBe(true)
    expect(source.includes('ProjectRemainingDurationForecast')).toBe(true)
    expect(source.includes('projectRemainingForecastDays')).toBe(true)
    expect(source.includes('constructionOrganizationProductOutcomeCloseoutProgress')).toBe(true)
    expect(source.includes('project_remaining_forecast_days')).toBe(false)
    expect(source.includes('duration_output_code')).toBe(false)
    expect(source.includes('duration_output_semantic_field_name')).toBe(false)
    expect(source.includes('forecast_finish_date')).toBe(false)
    expect(source.includes('target_gap_days')).toBe(false)
    expect(source.includes('rows_evaluated')).toBe(false)
    expect(source.includes('calculation_context')).toBe(false)
    expect(cardSource.includes('getProjectRemainingDurationForecast')).toBe(true)
    expect(cardSource.includes('projectRemainingForecastDays')).toBe(true)
    expect(cardSource.includes('project_remaining_forecast')).toBe(false)
    expect(cardSource.includes('constructionOrganizationProductOutcomeCloseoutProgress')).toBe(false)
    expect(cardSource.includes('施工组织预测覆盖')).toBe(false)
    expect(cardSource.includes('当前预测按已覆盖业态解释')).toBe(false)
    expect(cardSource.includes('运行闭环矩阵')).toBe(false)
    expect(cardSource.includes('施工组织闭环 ${formatNumber')).toBe(false)
  })

  it('surfaces the same project-level remaining forecast in Dashboard, monthly plan review, and Gantt acceleration context', () => {
    const dashboardSource = readSource('src/pages/Dashboard.tsx')
    const monthlySource = readSource('src/pages/planning/MonthlyPlanPage.tsx')
    const ganttSource = readSource('src/pages/GanttView.tsx')

    for (const source of [dashboardSource, monthlySource, ganttSource]) {
      expect(source.includes('ProjectRemainingForecastCard')).toBe(true)
    }

    expect(dashboardSource.includes('testId="dashboard-project-remaining-forecast"')).toBe(true)
    expect(monthlySource.includes('testId="monthly-project-remaining-forecast"')).toBe(true)
    expect(ganttSource.includes('testId="gantt-project-remaining-forecast"')).toBe(true)
  })
})
