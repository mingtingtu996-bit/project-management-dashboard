import { describe, expect, it } from 'vitest'

import {
  deriveTaskUnifiedStatus,
  TASK_STATUS_RULE_REGISTRY,
  TASK_STATUS_DERIVATION_RULE_VERSION,
} from '../services/taskStatusDerivationService.js'
import { deriveTaskLagStatus } from '../services/statusDerivationService.js'
import { BusinessStatusService, BusinessStatusType } from '../services/businessStatusService.js'
import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'

type BusinessPriorityStatus = (typeof TASK_STATUS_RULE_REGISTRY.business.priority)[number]
type BusinessStatusFacts = Parameters<typeof BusinessStatusService.evaluateBusinessStatusFromFacts>[0]

describe('taskStatusDerivationService', () => {
  it('derives readiness-aware business status from the task constraint cache', () => {
    const result = deriveTaskUnifiedStatus(
      {
        status: 'todo',
        progress: 0,
        ready_for_start: false,
        dependency_status: 'satisfied',
        condition_status: 'blocking',
        obstacle_status: 'clear',
        progress_impact_level: 'none',
        blocked_for_progress: false,
        readiness_summary: { blockingReasons: ['condition'] },
        planned_end_date: '2026-06-10',
      },
      { currentDate: new Date('2026-05-27T00:00:00Z') },
    )

    expect(result.ruleVersion).toBe(TASK_STATUS_DERIVATION_RULE_VERSION)
    expect(result.businessStatus.status).toBe('pending_conditions')
    expect(result.businessStatus.label).toBe('待开工')
    expect(result.displayStatus).toBe('待开工')
    expect(result.businessStatus.sourceFields).toEqual(
      expect.arrayContaining(['ready_for_start', 'condition_status', 'readiness_summary']),
    )
    expect(result.readinessStatus).toMatchObject({
      ready: false,
      dependencyStatus: 'satisfied',
      conditionStatus: 'blocking',
      obstacleStatus: 'clear',
      progressImpactLevel: 'none',
      blockedForProgress: false,
    })
  })

  it('keeps progress-impact warning, partial impact, and blocked states distinct', () => {
    const base = {
      status: 'in_progress',
      progress: 45,
      ready_for_start: true,
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-06-10',
    }

    expect(
      deriveTaskUnifiedStatus({ ...base, progress_impact_level: 'warning' }).businessStatus.status,
    ).toBe('progress_warning')
    expect(
      deriveTaskUnifiedStatus({ ...base, progress_impact_level: 'partial' }).businessStatus.status,
    ).toBe('partial_blocked')
    expect(
      deriveTaskUnifiedStatus({ ...base, progress_impact_level: 'blocked' }).businessStatus.status,
    ).toBe('blocked_by_obstacle')
    expect(
      deriveTaskUnifiedStatus({ ...base, progress_impact_level: 'none', blocked_for_progress: true }).businessStatus.status,
    ).toBe('blocked_by_obstacle')
  })

  it('treats active obstacle counts as warning unless progress impact explicitly blocks execution', () => {
    const result = deriveTaskUnifiedStatus({
      status: 'backlog',
      progress: 0,
      progress_impact_level: 'none',
      obstacle_status: 'clear',
      obstacles_active: 2,
    })

    expect(result.businessStatus.status).toBe('progress_warning')
    expect(result.businessStatus.evidence).toEqual(expect.objectContaining({
      ruleKey: 'business.progress_warning',
      obstacles_active: 2,
    }))
    expect(result.businessStatus.sourceFields).toContain('obstacles_active')

    expect(deriveTaskUnifiedStatus({
      status: 'in_progress',
      progress: 35,
      progress_impact_level: 'none',
      obstacle_status: 'clear',
      obstacles_active: 1,
    }).businessStatus.status).toBe('progress_warning')
  })

  it('outputs due and lag statuses separately without overriding business status', () => {
    const result = deriveTaskUnifiedStatus(
      {
        status: 'in_progress',
        progress: 30,
        ready_for_start: true,
        progress_impact_level: 'none',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-30',
        lagLevel: 'mild',
      },
      { currentDate: new Date('2026-05-27T00:00:00Z') },
    )

    expect(result.businessStatus.status).toBe('in_progress')
    expect(result.dueStatus.status).toBe('urgent')
    expect(result.dueStatus.daysUntilDue).toBe(3)
    expect(result.lagLevel).toBe('mild')
    expect(result.lagStatus).toBe('轻度滞后')
  })
  it('allows due window thresholds to be supplied by a project or seed policy', () => {
    const result = deriveTaskUnifiedStatus(
      {
        status: 'in_progress',
        progress: 20,
        planned_end_date: '2026-06-01',
      },
      {
        currentDate: new Date('2026-05-27T00:00:00Z'),
        duePolicy: {
          urgentDays: 5,
          approachingDays: 10,
          source: 'project_policy',
          policyId: 'project-policy:fitout-fast-track',
        },
      },
    )

    expect(result.dueStatus.status).toBe('urgent')
    expect(result.dueStatus.daysUntilDue).toBe(5)
    expect(result.dueStatus.evidence).toEqual(expect.objectContaining({
      ruleKey: 'due.urgent',
      urgentDays: 5,
      approachingDays: 10,
      policySource: 'project_policy',
      policyId: 'project-policy:fitout-fast-track',
    }))
  })

  it('uses calendar days for the future due window and production days only after actual overdue', () => {
    const calendar: ConstructionCalendarContext = {
      basis: 'official_construction_calendar_seed',
      windows: [{
        holidayCode: 'spring_festival_2026',
        holidayName: 'Spring Festival shutdown',
        startDate: '2026-05-04',
        endDate: '2026-05-05',
        counts_as_construction_shutdown: true,
      }],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    }

    const due = deriveTaskUnifiedStatus(
      {
        status: 'in_progress',
        progress: 20,
        planned_end_date: '2026-05-07',
      },
      {
        currentDate: new Date('2026-05-01T00:00:00.000Z'),
        calendar,
      },
    )
    const overdue = deriveTaskUnifiedStatus(
      {
        status: 'in_progress',
        progress: 20,
        planned_end_date: '2026-05-01',
      },
      {
        currentDate: new Date('2026-05-07T00:00:00.000Z'),
        calendar,
      },
    )

    expect(due.dueStatus.status).toBe('approaching')
    expect(due.dueStatus.daysUntilDue).toBe(6)
    expect(due.dueStatus.duration).toEqual(expect.objectContaining({
      value: 6,
      unit: 'calendar_day',
      availability: 'available',
    }))
    expect(overdue.dueStatus.status).toBe('overdue')
    expect(overdue.dueStatus.daysUntilDue).toBe(-4)
    expect(overdue.dueStatus.duration).toEqual(expect.objectContaining({
      value: -4,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      availability: 'available',
    }))
    expect(overdue.dueStatus.label).toBe('逾期 4个生产日')
  })

  it('prefers forecast lag signals over legacy lag cache fields', () => {
    const result = deriveTaskUnifiedStatus({
      status: 'in_progress',
      progress: 90,
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-06-30',
      lagLevel: 'none',
      forecast_lag_level: 'severe',
      delay_signal_status: 'moderate',
    })

    expect(result.lagLevel).toBe('severe')
    expect(result.lagStatusEvidence).toEqual(expect.objectContaining({
      ruleKey: 'lag.forecast_signal',
      ruleSource: 'seed_signal',
    }))
    expect(result.lagStatusEvidence.sourceFields).toEqual(expect.arrayContaining(['forecast_lag_level']))
  })

  it('normalizes readiness summaries into a stable DTO shape', () => {
    const result = deriveTaskUnifiedStatus({
      status: 'todo',
      progress: 0,
      ready_for_start: false,
      dependency_status: 'blocking',
      condition_status: 'blocking',
      obstacle_status: 'warning',
      progress_impact_level: 'warning',
      conditions_unmet: 2,
      readiness_summary: {
        blocking_reasons: ['dependency'],
        warningReasons: ['material'],
        source_counts: { task_conditions: 2 },
        primary_blocker_type: 'dependency',
        openObstacleCount: 1,
        impactSignals: [
          { sourceAlgorithm: 'material_arrival_reminder' },
          { source_algorithm: 'duration_forecast' },
        ],
      },
    })

    expect(result.readinessStatus.summary).toEqual(expect.objectContaining({
      blockingReasons: expect.arrayContaining(['dependency', 'condition']),
      warningReasons: expect.arrayContaining(['material', 'obstacle', 'progress_impact']),
      sourceCounts: expect.objectContaining({
        task_conditions: 2,
        material_arrival_reminder: 1,
        duration_forecast: 1,
      }),
      primaryBlockerType: 'dependency',
      impactSignalCount: 2,
    }))
  })

  it('emits a stable readiness summary even when no raw summary cache exists', () => {
    const result = deriveTaskUnifiedStatus({
      status: 'todo',
      progress: 0,
      ready_for_start: false,
      dependency_status: 'blocking',
      condition_status: 'satisfied',
      obstacle_status: 'clear',
      progress_impact_level: 'none',
    })

    expect(result.readinessStatus.summary).toEqual({
      blockingReasons: ['dependency'],
      warningReasons: [],
      sourceCounts: {},
      primaryBlockerType: 'dependency',
      impactSignalCount: 0,
    })
  })

  it('exposes rule provenance metadata for each unified status axis', () => {
    const result = deriveTaskUnifiedStatus(
      {
        status: 'todo',
        progress: 0,
        ready_for_start: false,
        dependency_status: 'blocking',
        condition_status: 'blocking',
        obstacle_status: 'clear',
        progress_impact_level: 'none',
        blocked_for_progress: false,
        planned_end_date: '2026-05-30',
      },
      { currentDate: new Date('2026-05-27T00:00:00Z') },
    )

    expect(result.ruleVersion).toBe(TASK_STATUS_DERIVATION_RULE_VERSION)
    expect(TASK_STATUS_DERIVATION_RULE_VERSION).toBe('v1.4.5-task-status-unified-p6')
    expect(result.businessStatus.evidence).toEqual(expect.objectContaining({
      ruleVersion: TASK_STATUS_DERIVATION_RULE_VERSION,
      ruleKey: 'business.pending_conditions',
      ruleSource: 'direct_fact',
    }))
    expect(result.dueStatus.evidence).toEqual(expect.objectContaining({
      ruleVersion: TASK_STATUS_DERIVATION_RULE_VERSION,
      ruleKey: 'due.urgent',
      ruleSource: 'derived_window',
      urgentDays: 3,
      approachingDays: 7,
    }))
    expect(result.lagStatusEvidence).toEqual(expect.objectContaining({
      ruleVersion: TASK_STATUS_DERIVATION_RULE_VERSION,
      ruleKey: 'lag.legacy_fallback',
      ruleSource: 'legacy_fallback',
    }))
    expect(result.readinessStatus.evidence).toEqual(expect.objectContaining({
      ruleVersion: TASK_STATUS_DERIVATION_RULE_VERSION,
      ruleKey: 'readiness.blocked',
      ruleSource: 'direct_fact',
    }))
  })

  it('keeps legacy lag status facade evidence aligned with the unified package', () => {
    const input = {
      status: 'in_progress',
      progress: 30,
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-30',
      lagLevel: 'mild',
    }

    const unified = deriveTaskUnifiedStatus(input)
    const legacyLag = deriveTaskLagStatus(input)

    expect(legacyLag.evidence).toEqual(unified.lagStatusEvidence)
    expect(legacyLag.sourceFields).toEqual(unified.lagStatusEvidence.sourceFields)
  })

  it('can derive business status from an already-loaded fact bundle without requerying', () => {
    const status = BusinessStatusService.evaluateBusinessStatusFromFacts({
      taskStatus: 'in_progress',
      taskProgress: 35,
      conditions: [{ is_satisfied: false } as any],
      obstacles: [{ status: 'resolving' } as any],
      task: {
        ready_for_start: false,
        dependency_status: 'blocking',
        condition_status: 'blocking',
        obstacle_status: 'blocked',
        progress_impact_level: 'blocked',
      },
    })

    expect(status.display).toBe(BusinessStatusType.BLOCKED)
    expect(status.priority).toBe(TASK_STATUS_RULE_REGISTRY.business.priority.indexOf('blocked_by_obstacle') + 1)
  })

  it('maps legacy business status priority from the unified registry order', () => {
    const factsByStatus: Record<BusinessPriorityStatus, BusinessStatusFacts> = {
      cancelled: { taskStatus: 'cancelled', taskProgress: 0 },
      completed: { taskStatus: 'completed', taskProgress: 100 },
      blocked_by_obstacle: {
        taskStatus: 'in_progress',
        taskProgress: 35,
        task: { progress_impact_level: 'blocked', obstacle_status: 'blocked', blocked_for_progress: true },
      },
      partial_blocked: {
        taskStatus: 'in_progress',
        taskProgress: 35,
        task: { progress_impact_level: 'partial', obstacle_status: 'partial_impact' },
      },
      progress_warning: {
        taskStatus: 'in_progress',
        taskProgress: 35,
        task: { progress_impact_level: 'warning', obstacle_status: 'warning' },
      },
      pending_conditions: {
        taskStatus: 'todo',
        taskProgress: 0,
        conditions: [{ is_satisfied: false } as any],
        task: { ready_for_start: false, condition_status: 'blocking' },
      },
      ready: {
        taskStatus: 'todo',
        taskProgress: 0,
        task: { ready_for_start: true, condition_status: 'satisfied', dependency_status: 'satisfied' },
      },
      in_progress: {
        taskStatus: 'in_progress',
        taskProgress: 35,
        task: { ready_for_start: true, progress_impact_level: 'none' },
      },
      pending: { taskStatus: 'backlog', taskProgress: 0 },
    }

    for (const status of Object.keys(factsByStatus) as BusinessPriorityStatus[]) {
      const facts = factsByStatus[status]
      const result = BusinessStatusService.evaluateBusinessStatusFromFacts({
        ...facts,
      })

      expect(result.priority).toBe(TASK_STATUS_RULE_REGISTRY.business.priority.indexOf(status) + 1)
    }
  })
})
