import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectRemainingForecastCard } from '../ProjectRemainingForecastCard'

const apiState = vi.hoisted(() => ({
  response: {
    projectId: 'project-1',
    status: 'degraded',
    degraded: true,
    degradationReason: 'runtime_forecast_unavailable',
    message: 'runtime evidence unavailable',
    rowsEvaluated: null,
    projectRemainingForecast: null,
    constructionOrganizationProductOutcomeCloseoutProgress: null,
  } as any,
}))

vi.mock('@/services/projectRemainingForecastApi', () => ({
  getProjectRemainingDurationForecast: vi.fn(async () => apiState.response),
}))

function flush() {
  return Promise.resolve()
}

describe('ProjectRemainingForecastCard', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('does not expose the acceleration recommendation CTA when the forecast is degraded without a forecast body', async () => {
    const onOpenAcceleration = vi.fn()

    await act(async () => {
      root?.render(
        <ProjectRemainingForecastCard
          projectId="project-1"
          targetEndDate="2027-03-31"
          asOfDate="2027-02-15"
          onOpenAcceleration={onOpenAcceleration}
        />,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    expect(container.querySelector('[data-testid="project-remaining-forecast-degraded"]')).toBeTruthy()
    expect(container.textContent).not.toContain('查看赶工建议')
    expect(container.textContent).toContain('稍后刷新')
    const disabledButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('稍后刷新'))
    expect(disabledButton).toBeTruthy()
    expect(disabledButton?.disabled).toBe(true)
    expect(onOpenAcceleration).not.toHaveBeenCalled()
  })

  it('renders units from typed facts and ignores conflicting legacy numerics', async () => {
    apiState.response = {
      projectId: 'project-1',
      status: 'ready',
      degraded: false,
      rowsEvaluated: 3,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        projectRemainingForecastDays: 999,
        projectRemainingForecast: {
          value: 12,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
        targetGapDays: 999,
        targetGap: {
          value: 30,
          unit: 'calendar_day',
          calendarRef: 'gregorian',
          calendarVersion: 'ISO-8601',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
        forecastFinishDate: '2027-04-30',
        targetEndDate: '2027-03-31',
      },
    }

    await act(async () => {
      root?.render(<ProjectRemainingForecastCard projectId="project-1" />)
      await flush()
    })
    await act(async () => { await flush() })

    expect(container.textContent).toContain('12 个生产日')
    expect(container.textContent).toContain('超目标 30 个日历天')
    expect(container.textContent).not.toContain('999')
  })

  it('shows typed unavailability and never falls back to legacy numerics', async () => {
    apiState.response = {
      projectId: 'project-1',
      status: 'degraded',
      degraded: true,
      degradationReason: 'construction_calendar_identity_missing',
      message: null,
      rowsEvaluated: 3,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        projectRemainingForecastDays: 999,
        projectRemainingForecast: {
          value: null,
          unit: 'construction_production_day',
          calendarRef: null,
          calendarVersion: null,
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'unavailable',
          unavailableReason: 'construction_calendar_identity_missing',
        },
        targetGapDays: 999,
        targetGap: {
          value: null,
          unit: 'calendar_day',
          calendarRef: 'gregorian',
          calendarVersion: 'ISO-8601',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'unavailable',
          unavailableReason: 'forecast_finish_unavailable',
        },
        forecastFinishDate: null,
        targetEndDate: '2027-03-31',
      },
    }

    await act(async () => {
      root?.render(<ProjectRemainingForecastCard projectId="project-1" />)
      await flush()
    })
    await act(async () => { await flush() })

    expect(container.textContent).toContain('\u751f\u4ea7\u65e5\u53e3\u5f84\u4e0d\u53ef\u7528')
    expect(container.textContent).toContain('\u65e5\u5386\u5929\u53e3\u5f84\u4e0d\u53ef\u7528')
    expect(container.textContent).not.toContain('999')
    expect(container.textContent).not.toContain('\u65e0\u660e\u663e\u504f\u5dee')
  })
})
