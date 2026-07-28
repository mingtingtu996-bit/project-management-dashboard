import { describe, expect, it, vi } from 'vitest'

import {
  syncProjectStartReadinessNotification,
  type ProjectStartReadinessNotificationPort,
} from '../services/projectStartReadinessNotificationService.js'
import type { ProjectStartReadinessReadModel } from '../services/projectStartReadinessService.js'

function buildModel(blockedTaskCount: number): ProjectStartReadinessReadModel {
  return {
    project: { projectId: 'project-1', companyId: 'company-1', ownerId: 'owner-1' },
    window: {
      fromDate: '2027-01-01',
      throughDate: '2027-01-14',
      calendarDateCount: 14,
      timezone: 'Asia/Shanghai',
      timezoneAvailability: 'available',
    },
    dateVisibility: { availability: 'available', unit: 'calendar_date' },
    calendarIdentity: {
      availability: 'available',
      calendarRef: 'work_calendar',
      calendarVersion: 'v1',
      timezone: 'Asia/Shanghai',
      unavailableReason: null,
    },
    productionDayMetrics: {
      availability: 'ready',
      productionDateCount: 14,
      taskCountOnProductionDates: blockedTaskCount,
      unit: 'construction_production_day',
      unavailableReason: null,
    },
    summary: {
      taskCount: blockedTaskCount,
      readyTaskCount: 0,
      blockedTaskCount,
      attentionTaskCount: 0,
      blockerTaskCountByType: {
        material: blockedTaskCount,
        drawing: 0,
        certificate: 0,
        predecessor: 0,
        access: 0,
        labor_equipment: 0,
        approval: 0,
        other: 0,
      },
    },
    metrics: {
      start_readiness_task_count_14d: { value: blockedTaskCount, unit: 'count', availability: 'ready' },
      start_readiness_ready_task_count_14d: { value: 0, unit: 'count', availability: 'ready' },
      start_readiness_blocked_task_count_14d: { value: blockedTaskCount, unit: 'count', availability: 'ready' },
      start_readiness_attention_task_count_14d: { value: 0, unit: 'count', availability: 'ready' },
      start_readiness_ready_rate_14d: { value: blockedTaskCount ? 0 : null, unit: 'percent', availability: blockedTaskCount ? 'ready' : 'insufficient_data' },
      start_readiness_production_date_count_14d: { value: 14, unit: 'construction_production_day', availability: 'ready' },
    },
    items: blockedTaskCount ? [{
      taskId: 'task-1',
      title: 'Foundation pour',
      plannedStartDate: '2027-01-05',
      readinessState: 'blocked',
      calendarIdentity: {
        availability: 'available',
        calendarRef: 'work_calendar',
        calendarVersion: 'v1',
        timezone: 'Asia/Shanghai',
        unavailableReason: null,
      },
      unmetConditionsByType: {
        material: [{
          blockerType: 'material',
          severity: 'blocking',
          referenceType: 'task_condition',
          referenceId: 'condition-1',
          label: 'Concrete must arrive',
          nextAction: 'Confirm arrival',
          dueDate: '2027-01-04',
          sourceUpdatedAt: '2027-01-02T08:00:00.000Z',
        }],
      },
      blockingReferences: {
        material: [{
          blockerType: 'material',
          severity: 'blocking',
          referenceType: 'task_condition',
          referenceId: 'condition-1',
          label: 'Concrete must arrive',
          nextAction: 'Confirm arrival',
          dueDate: '2027-01-04',
          sourceUpdatedAt: '2027-01-02T08:00:00.000Z',
        }],
      },
      responsibleParty: {
        userId: 'user-1',
        userName: 'Chen',
        participantUnitId: 'unit-1',
        participantUnitName: 'General contractor',
        displayName: 'Chen',
      },
      nextAction: 'Confirm arrival',
      freshness: {
        asOf: '2027-01-01T00:00:00.000Z',
        evaluatedAt: '2027-01-01T00:00:00.000Z',
        sourceUpdatedAt: '2027-01-02T08:00:00.000Z',
      },
    }] : [],
    freshness: {
      asOf: '2027-01-01T00:00:00.000Z',
      evaluatedAt: '2027-01-01T00:00:00.000Z',
      sourceUpdatedAt: '2027-01-02T08:00:00.000Z',
    },
  }
}

describe('projectStartReadinessNotificationService', () => {
  it('emits one deduped project notification directly from the authoritative read model', async () => {
    const port: ProjectStartReadinessNotificationPort = {
      emit: vi.fn(async (input) => ({ id: 'notification-1', ...input })),
      resolve: vi.fn(async () => true),
    }
    const model = buildModel(1)

    await syncProjectStartReadinessNotification(model, port)

    expect(port.emit).toHaveBeenCalledOnce()
    expect(port.emit).toHaveBeenCalledWith(expect.objectContaining({
      company_id: 'company-1',
      project_id: 'project-1',
      type: 'start_readiness_lookahead',
      touchpoint_type: 'dashboard_todo',
      scope_type: 'project',
      dedupe_key: 'project-start-readiness-14d:project-1',
      recipients: ['user-1'],
      target_route: '/projects/project-1/dashboard?tab=readiness',
      metadata: expect.objectContaining({
        read_model: 'projectStartReadinessService',
        as_of_date: '2027-01-01',
        blocked_task_ids: ['task-1'],
      }),
    }))
    expect(port.resolve).not.toHaveBeenCalled()
  })

  it('resolves the same dedupe key when the authoritative model has no blocked tasks', async () => {
    const port: ProjectStartReadinessNotificationPort = {
      emit: vi.fn(async (input) => ({ id: 'notification-1', ...input })),
      resolve: vi.fn(async () => true),
    }

    await syncProjectStartReadinessNotification(buildModel(0), port)

    expect(port.emit).not.toHaveBeenCalled()
    expect(port.resolve).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      dedupe_key: 'project-start-readiness-14d:project-1',
      resolved_source: 'project_start_readiness_clear',
    }))
  })
})
