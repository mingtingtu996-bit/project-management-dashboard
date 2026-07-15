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
})
