import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectStartReadinessPanel } from '../ProjectStartReadinessPanel'

const apiGet = vi.fn()

vi.mock('@/lib/apiClient', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  isAbortError: () => false,
}))

describe('ProjectStartReadinessPanel', () => {
  beforeEach(() => {
    apiGet.mockReset()
  })

  it('renders the authoritative 14-day summary and grouped task blockers', async () => {
    apiGet.mockResolvedValue({
      window: {
        fromDate: '2027-01-01',
        throughDate: '2027-01-14',
        calendarDateCount: 14,
        timezone: 'Asia/Shanghai',
        timezoneAvailability: 'available',
      },
      calendarIdentity: {
        availability: 'available',
        calendarRef: 'work_calendar',
        calendarVersion: 'v1',
        timezone: 'Asia/Shanghai',
      },
      productionDayMetrics: {
        availability: 'ready',
        productionDateCount: 14,
        taskCountOnProductionDates: 1,
        unit: 'construction_production_day',
      },
      summary: {
        taskCount: 1,
        readyTaskCount: 0,
        blockedTaskCount: 1,
        attentionTaskCount: 0,
        blockerTaskCountByType: { material: 1 },
      },
      items: [{
        taskId: 'task-1',
        title: 'Foundation pour',
        plannedStartDate: '2027-01-05',
        readinessState: 'blocked',
        responsibleParty: { displayName: 'Chen' },
        nextAction: 'Confirm concrete arrival',
        unmetConditionsByType: {
          material: [{
            blockerType: 'material',
            label: 'Concrete must arrive',
            referenceId: 'condition-1',
            referenceType: 'task_condition',
            severity: 'blocking',
          }],
        },
      }],
      freshness: { evaluatedAt: '2027-01-01T08:00:00.000Z' },
    })

    render(<ProjectStartReadinessPanel projectId="project-1" />)

    expect(await screen.findByTestId('project-start-readiness-panel')).toBeInTheDocument()
    expect(screen.getByText('Foundation pour')).toBeInTheDocument()
    expect(screen.getByText('Concrete must arrive')).toBeInTheDocument()
    expect(screen.getByText('Chen')).toBeInTheDocument()
    expect(screen.getAllByText('阻塞').length).toBeGreaterThan(0)
    expect(apiGet).toHaveBeenCalledWith('/api/projects/project-1/start-readiness', expect.objectContaining({
      runtimeCache: 'off',
    }))
  })

  it('keeps calendar-date tasks visible when production-day metrics are unavailable', async () => {
    apiGet.mockResolvedValue({
      window: {
        fromDate: '2027-01-01',
        throughDate: '2027-01-14',
        calendarDateCount: 14,
        timezone: 'UTC',
        timezoneAvailability: 'unavailable',
      },
      calendarIdentity: {
        availability: 'unavailable',
        calendarRef: null,
        calendarVersion: null,
        timezone: null,
        unavailableReason: 'construction_calendar_identity_missing',
      },
      productionDayMetrics: {
        availability: 'source_unavailable',
        productionDateCount: null,
        taskCountOnProductionDates: null,
        unit: 'construction_production_day',
        unavailableReason: 'construction_calendar_identity_missing',
      },
      summary: {
        taskCount: 1,
        readyTaskCount: 1,
        blockedTaskCount: 0,
        attentionTaskCount: 0,
        blockerTaskCountByType: {},
      },
      items: [{
        taskId: 'task-1',
        title: 'Visible by date',
        plannedStartDate: '2027-01-02',
        readinessState: 'ready',
        responsibleParty: null,
        nextAction: null,
        unmetConditionsByType: {},
      }],
      freshness: { evaluatedAt: '2027-01-01T08:00:00.000Z' },
    })

    render(<ProjectStartReadinessPanel projectId="project-1" />)

    expect(await screen.findByText('Visible by date')).toBeInTheDocument()
    expect(screen.getByText('construction_calendar_identity_missing')).toBeInTheDocument()
    expect(screen.getByText(/生产日统计暂不可用/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('加载失败')).not.toBeInTheDocument())
  })
})
