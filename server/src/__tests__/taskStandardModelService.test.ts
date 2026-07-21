import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildStandardDTO } from '../services/taskStandardModelService.js'
import { taskSchema } from '../middleware/validation.js'
import { TASK_STATUS_DERIVATION_RULE_VERSION } from '../services/taskStatusDerivationService.js'

describe('taskStandardModelService', async () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('treats any v1.4.1 scope object id as a valid standard-model scope', async () => {
    const scopeFields = [
      'building_object_id',
      'basement_object_id',
      'floor_object_id',
      'physical_zone_object_id',
      'functional_area_object_id',
      'phase_object_id',
      'section_object_id',
    ] as const

    for (const field of scopeFields) {
      const dto = await buildStandardDTO(
        {
          id: `task-${field}`,
          [field]: `${field}-1`,
          wbs_node_type: 'process',
        },
        { mode: 'list' },
      )

      expect(dto.standard_model_status).toBe('complete')
    }
  })

  it('marks executable rows without scope object ids as invalid', async () => {
    const dto = await buildStandardDTO(
      {
        id: 'task-without-scope',
        wbs_node_type: 'process',
      },
      { mode: 'list' },
    )

    expect(dto.standard_model_status).toBe('invalid')
  })

  it('marks text-only scope rows invalid because range-tree compatibility is removed', async () => {
    const dto = await buildStandardDTO(
      {
        id: 'text-only-scoped-task',
        specialty_type: '幕墙',
        wbs_node_type: 'process',
      },
      { mode: 'list' },
    )

    expect(dto.standard_model_status).toBe('invalid')
  })

  it('marks scoped rows without WBS semantics as partial', async () => {
    const dto = await buildStandardDTO(
      {
        id: 'task-with-scope-only',
        building_object_id: 'building-1',
      },
      { mode: 'list' },
    )

    expect(dto.standard_model_status).toBe('partial')
  })

  it('keeps progress-method fields visible so the standard write chain can reject quantity mode', async () => {
    const parsed = taskSchema.parse({
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'Quantity mode should reach write-chain validation',
      start_date: '2026-05-01',
      end_date: '2026-05-02',
      physical_zone_object_id: '00000000-0000-0000-0000-000000000002',
      progress_method: 'quantity',
      planned_quantity: 10,
      quantity_unit: 'm2',
    })

    expect(parsed.progress_method).toBe('quantity')
    expect(parsed.planned_quantity).toBe(10)
    expect(parsed.quantity_unit).toBe('m2')
  })

  it('rejects readonly task code fields at the route validation boundary', async () => {
    const result = taskSchema.safeParse({
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'Task code cannot be client supplied',
      start_date: '2026-05-01',
      end_date: '2026-05-02',
      physical_zone_object_id: '00000000-0000-0000-0000-000000000002',
      task_code: 'MANUAL-001',
    })

    expect(result.success).toBe(false)
  })

  it('rejects standard work snapshots at the normal route validation boundary', async () => {
    const result = taskSchema.safeParse({
      project_id: '00000000-0000-0000-0000-000000000001',
      title: 'Standard work code is backend managed',
      start_date: '2026-05-01',
      end_date: '2026-05-02',
      physical_zone_object_id: '00000000-0000-0000-0000-000000000002',
      standard_work_code: 'MANUAL-SW-001',
    })

    expect(result.success).toBe(false)
  })

  it('uses the task constraint governance cache when deriving DTO business and readiness status', async () => {
    const dto = await buildStandardDTO(
      {
        id: 'task-with-constraint-cache',
        status: 'in_progress',
        progress: 35,
        building_object_id: 'building-1',
        wbs_node_type: 'process',
        condition_count: 0,
        obstacle_count: 0,
        ready_for_start: true,
        dependency_status: 'satisfied',
        condition_status: 'satisfied',
        obstacle_status: 'partial_impact',
        progress_impact_level: 'partial',
        blocked_for_progress: false,
        readiness_summary: { partialImpactCount: 1 },
      },
      { mode: 'detail' },
    )

    expect(dto.businessStatus).toMatchObject({
      status: 'partial_blocked',
      label: '部分受影响',
    })
    expect(dto.displayStatus).toBe('部分受影响')
    expect(dto.statusDerivation).toMatchObject({
      ruleVersion: expect.any(String),
      businessStatus: { status: 'partial_blocked' },
    })
    expect(dto.readiness_status).toMatchObject({
      ready: true,
      dependencyStatus: 'satisfied',
      conditionStatus: 'satisfied',
      obstacleStatus: 'partial_impact',
      progressImpactLevel: 'partial',
      blockedForProgress: false,
      summary: {
        warningReasons: expect.arrayContaining(['progress_impact']),
        raw: { partialImpactCount: 1 },
      },
    })
  })

  it('returns unified status evidence and flat axis fields for list DTO consumers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-20T00:00:00.000Z'))

    const dto = await buildStandardDTO(
      {
        id: 'task-status-dto',
        status: 'in_progress',
        progress: 40,
        building_object_id: 'building-1',
        wbs_node_type: 'process',
        ready_for_start: true,
        dependency_status: 'satisfied',
        condition_status: 'satisfied',
        obstacle_status: 'clear',
        progress_impact_level: 'none',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-30',
      },
      { mode: 'list' },
    )

    expect(dto.statusDerivation).toMatchObject({
      ruleVersion: TASK_STATUS_DERIVATION_RULE_VERSION,
      businessStatus: {
        status: 'in_progress',
        evidence: expect.objectContaining({
          ruleSource: 'direct_fact',
          ruleVersion: TASK_STATUS_DERIVATION_RULE_VERSION,
        }),
      },
      lagStatusEvidence: expect.objectContaining({
        ruleVersion: TASK_STATUS_DERIVATION_RULE_VERSION,
      }),
    })
    expect(dto.businessStatus).toMatchObject({ status: 'in_progress' })
    expect(dto.dueStatus).toEqual(expect.objectContaining({ status: expect.any(String), daysUntilDue: expect.any(Number) }))
    expect(dto.lagLevel).toBeDefined()
    expect(dto.lagStatus).toBeDefined()
  })

  it('keeps overdue status but withholds production-day count without calendar identity', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-02T00:00:00.000Z'))

    const dto = await buildStandardDTO(
      {
        id: 'task-status-overdue-without-calendar',
        status: 'in_progress',
        progress: 40,
        building_object_id: 'building-1',
        wbs_node_type: 'process',
        planned_end_date: '2026-06-01',
      },
      { mode: 'list' },
    )

    expect(dto.dueStatus).toEqual(expect.objectContaining({
      status: 'overdue',
      daysUntilDue: null,
    }))
    expect(dto.statusDerivation).toMatchObject({
      dueStatus: {
        duration: {
          value: null,
          unit: 'construction_production_day',
          availability: 'unavailable',
        },
      },
    })
  })

  it('passes policy and forecast signal fields into the standard DTO unified axes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-20T00:00:00.000Z'))

    const dto = await buildStandardDTO(
      {
        id: 'task-status-policy-forecast-dto',
        status: 'in_progress',
        progress: 40,
        building_object_id: 'building-1',
        wbs_node_type: 'process',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-06-01',
        due_policy: {
          urgentDays: 5,
          approachingDays: 12,
          source: 'seed_policy',
          policyId: 'seed:fast-track-due-window',
        },
        forecast_lag_level: 'moderate',
        lagLevel: 'none',
      },
      { mode: 'list' },
    )

    expect(dto.statusDerivation).toMatchObject({
      dueStatus: {
        evidence: expect.objectContaining({
          policySource: 'seed_policy',
          policyId: 'seed:fast-track-due-window',
          urgentDays: 5,
          approachingDays: 12,
        }),
        sourceFields: expect.arrayContaining(['due_policy']),
      },
      lagLevel: 'moderate',
      lagStatusEvidence: expect.objectContaining({
        ruleKey: 'lag.forecast_signal',
        ruleSource: 'seed_signal',
        sourceFields: expect.arrayContaining(['forecast_lag_level']),
      }),
    })
    expect(dto.lagLevel).toBe('moderate')
  })
})
