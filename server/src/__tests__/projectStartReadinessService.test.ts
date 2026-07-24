import { describe, expect, it, vi } from 'vitest'

import {
  ProjectStartReadinessScopeError,
  getProjectStartReadiness,
  type ProjectStartReadinessDataSource,
} from '../services/projectStartReadinessService.js'

const project = {
  id: 'project-1',
  company_id: 'company-1',
  owner_id: 'owner-1',
  metadata: { construction_calendar_timezone: 'Asia/Shanghai' },
  updated_at: '2026-12-30T08:00:00.000Z',
}

const calendar = {
  basis: 'official_construction_calendar_seed' as const,
  availability: 'available' as const,
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  windows: [{ startDate: '2027-02-08', endDate: '2027-02-14', construction_shutdown: true }],
}

function buildSource(
  facts: Awaited<ReturnType<ProjectStartReadinessDataSource['loadWindowFacts']>>,
  projectRow: typeof project | null = project,
): ProjectStartReadinessDataSource {
  return {
    loadProject: vi.fn(async () => projectRow),
    loadWindowFacts: vi.fn(async () => facts),
  }
}

function emptyFacts() {
  return {
    tasks: [],
    conditions: [],
    obstacles: [],
    dependencies: [],
    dependencyTasks: [],
    entityLinks: [],
    drawingPackages: [],
    drawings: [],
    certificateWorkItems: [],
    acceptancePlans: [],
    preMilestones: [],
    projectMaterials: [],
    participantUnits: [],
    users: [],
  }
}

describe('projectStartReadinessService', () => {
  it('builds exactly 14 business-timezone calendar dates across a year boundary', async () => {
    const source = buildSource(emptyFacts())

    const result = await getProjectStartReadiness({
      projectId: project.id,
      companyId: project.company_id,
      now: new Date('2026-12-31T16:30:00.000Z'),
    }, {
      dataSource: source,
      resolveCalendar: async () => calendar,
    })

    expect(source.loadProject).toHaveBeenCalledWith({
      projectId: project.id,
      companyId: project.company_id,
    })
    expect(source.loadWindowFacts).toHaveBeenCalledWith(expect.objectContaining({
      projectId: project.id,
      companyId: project.company_id,
      fromDate: '2027-01-01',
      throughDate: '2027-01-14',
    }))
    expect(result.window).toMatchObject({
      fromDate: '2027-01-01',
      throughDate: '2027-01-14',
      calendarDateCount: 14,
      timezone: 'Asia/Shanghai',
      timezoneAvailability: 'available',
    })
  })

  it('uses the injected clock for deterministic freshness while retaining the calendar-date as-of key', async () => {
    const source = buildSource({
      ...emptyFacts(),
      tasks: [{
        id: 'task-freshness',
        project_id: project.id,
        title: 'Freshness task',
        planned_start_date: '2027-01-01',
        status: 'todo',
        progress: 0,
        actual_start_date: null,
      }],
    })
    const now = new Date('2026-12-31T16:30:00.000Z')

    const result = await getProjectStartReadiness({
      projectId: project.id,
      companyId: project.company_id,
      now,
    }, {
      dataSource: source,
      resolveCalendar: async () => calendar,
    })

    expect(result.freshness).toMatchObject({
      asOf: '2027-01-01',
      evaluatedAt: '2026-12-31T16:30:00.000Z',
    })
    expect(result.items[0]?.freshness).toMatchObject({
      asOf: '2027-01-01',
      evaluatedAt: '2026-12-31T16:30:00.000Z',
    })
  })

  it('groups direct cross-domain blockers and derives one authoritative readiness state', async () => {
    const source = buildSource({
      ...emptyFacts(),
      tasks: [{
        id: 'task-1',
        project_id: project.id,
        title: 'Foundation pour',
        planned_start_date: '2027-01-05',
        status: 'todo',
        progress: 0,
        actual_start_date: null,
        assignee_user_id: 'user-1',
        participant_unit_id: 'unit-1',
        drawing_required: true,
        material_required: true,
        acceptance_required: true,
        updated_at: '2027-01-01T08:00:00.000Z',
      }],
      conditions: [
        {
          id: 'condition-material',
          task_id: 'task-1',
          project_id: project.id,
          condition_type: 'material',
          condition_code: 'concrete_arrival',
          name: 'Concrete must arrive',
          is_satisfied: false,
          required_for_start: true,
          blocking_level: 'hard',
          participant_unit_id: 'unit-1',
          responsible_person: 'Site buyer',
          source_type: 'project_material',
          source_ref_id: 'material-1',
          target_date: '2027-01-04',
          updated_at: '2027-01-02T08:00:00.000Z',
        },
        {
          id: 'condition-equipment',
          task_id: 'task-1',
          project_id: project.id,
          condition_type: 'equipment',
          name: 'Pump booking pending',
          is_satisfied: false,
          required_for_start: true,
          blocking_level: 'soft',
          updated_at: '2027-01-02T09:00:00.000Z',
        },
      ],
      obstacles: [{
        id: 'obstacle-access',
        task_id: 'task-1',
        project_id: project.id,
        obstacle_type: 'access',
        description: 'Workface access is blocked',
        status: 'open',
        is_resolved: false,
        blocking_scope: 'start',
        blocking_level: 'blocked',
        updated_at: '2027-01-03T08:00:00.000Z',
      }],
      dependencies: [{
        id: 'dependency-1',
        project_id: project.id,
        task_id: 'task-1',
        dependency_task_id: 'task-predecessor',
        dependency_type: 'FS',
        required_for_start: true,
        source_type: 'manual',
        status: 'active',
        updated_at: '2027-01-02T10:00:00.000Z',
      }],
      dependencyTasks: [{
        id: 'task-predecessor',
        title: 'Rebar inspection',
        status: 'in_progress',
        progress: 60,
        actual_end_date: null,
        updated_at: '2027-01-03T10:00:00.000Z',
      }],
      entityLinks: [
        {
          id: 'link-drawing',
          project_id: project.id,
          source_entity_type: 'drawing_package',
          source_entity_id: 'drawing-package-1',
          target_entity_type: 'task',
          target_entity_id: 'task-1',
          relation_type: 'covers_task',
          status: 'active',
          updated_at: '2027-01-03T11:00:00.000Z',
        },
        {
          id: 'link-certificate',
          project_id: project.id,
          source_entity_type: 'certificate_work_item',
          source_entity_id: 'certificate-1',
          target_entity_type: 'task',
          target_entity_id: 'task-1',
          relation_type: 'blocks_task_start',
          status: 'active',
          updated_at: '2027-01-03T12:00:00.000Z',
        },
      ],
      drawingPackages: [{
        id: 'drawing-package-1',
        package_code: 'STR-001',
        package_name: 'Foundation structure drawings',
        status: 'pending',
        is_ready_for_construction: false,
        updated_at: '2027-01-03T11:30:00.000Z',
      }],
      certificateWorkItems: [{
        id: 'certificate-1',
        item_code: 'PERMIT-1',
        item_name: 'Pour permit',
        status: 'pending',
        is_blocked: true,
        block_reason: 'Authority approval pending',
        next_action: 'Submit signed package',
        next_action_due_date: '2027-01-04',
        updated_at: '2027-01-03T12:30:00.000Z',
      }],
      projectMaterials: [{
        id: 'material-1',
        material_name: 'C35 concrete',
        actual_arrival_date: null,
        updated_at: '2027-01-03T13:00:00.000Z',
      }],
      participantUnits: [{ id: 'unit-1', unit_name: 'General contractor' }],
      users: [{ id: 'user-1', username: 'Chen' }],
    })

    const result = await getProjectStartReadiness({
      projectId: project.id,
      companyId: project.company_id,
      asOfDate: '2027-01-01',
    }, {
      dataSource: source,
      resolveCalendar: async () => calendar,
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      taskId: 'task-1',
      plannedStartDate: '2027-01-05',
      readinessState: 'blocked',
      responsibleParty: {
        userId: 'user-1',
        userName: 'Chen',
        participantUnitId: 'unit-1',
        participantUnitName: 'General contractor',
        displayName: 'Site buyer',
      },
      calendarIdentity: {
        availability: 'available',
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
      },
    })
    expect(Object.keys(result.items[0].unmetConditionsByType).sort()).toEqual([
      'access',
      'certificate',
      'drawing',
      'labor_equipment',
      'material',
      'predecessor',
    ].sort())
    expect(result.items[0].blockingReferences.predecessor[0]).toMatchObject({
      referenceId: 'task-predecessor',
      label: 'Rebar inspection',
    })
    expect(result.items[0].blockingReferences.material?.[0]).toMatchObject({
      referenceType: 'project_material',
      referenceId: 'material-1',
      label: 'Concrete must arrive',
    })
    expect(result.items[0].blockingReferences.certificate[0]).toMatchObject({
      referenceId: 'certificate-1',
      nextAction: 'Submit signed package',
    })
    expect(result.summary).toMatchObject({
      taskCount: 1,
      readyTaskCount: 0,
      blockedTaskCount: 1,
      attentionTaskCount: 0,
      blockerTaskCountByType: expect.objectContaining({
        material: 1,
        drawing: 1,
        certificate: 1,
        predecessor: 1,
        access: 1,
      }),
    })
    expect(result.metrics.start_readiness_blocked_task_count_14d).toMatchObject({
      value: 1,
      availability: 'ready',
      unit: 'count',
    })
  })

  it('keeps date-only visibility while production-day metrics fail closed without calendar identity', async () => {
    const source = buildSource({
      ...emptyFacts(),
      tasks: [{
        id: 'task-1',
        project_id: project.id,
        title: 'Visible task',
        planned_start_date: '2027-01-02',
        status: 'todo',
        progress: 0,
        actual_start_date: null,
        updated_at: '2027-01-01T08:00:00.000Z',
      }],
    })

    const result = await getProjectStartReadiness({
      projectId: project.id,
      companyId: project.company_id,
      asOfDate: '2027-01-01',
    }, {
      dataSource: source,
      resolveCalendar: async () => ({
        basis: 'calendar_day',
        availability: 'unavailable',
        calendarRef: null,
        calendarVersion: null,
        timezone: 'Asia/Shanghai',
        windows: [],
        unavailableReason: 'construction_calendar_identity_missing',
      }),
    })

    expect(result.items.map((item) => item.taskId)).toEqual(['task-1'])
    expect(result.dateVisibility).toEqual({ availability: 'available', unit: 'calendar_date' })
    expect(result.productionDayMetrics).toMatchObject({
      availability: 'source_unavailable',
      productionDateCount: null,
      taskCountOnProductionDates: null,
      unavailableReason: 'construction_calendar_identity_missing',
    })
    expect(result.items[0].calendarIdentity).toMatchObject({
      availability: 'unavailable',
      calendarRef: null,
      calendarVersion: null,
    })
  })

  it('uses a task-condition entity link as the blocker reference identity', async () => {
    const source = buildSource({
      ...emptyFacts(),
      tasks: [{
        id: 'task-1',
        project_id: project.id,
        title: 'Linked drawing task',
        planned_start_date: '2027-01-03',
        status: 'todo',
        progress: 0,
        actual_start_date: null,
        drawing_required: true,
        updated_at: '2027-01-01T08:00:00.000Z',
      }],
      conditions: [{
        id: 'condition-drawing',
        project_id: project.id,
        task_id: 'task-1',
        condition_type: 'drawing',
        name: 'Foundation drawing release',
        is_satisfied: false,
        required_for_start: true,
        blocking_level: 'hard',
        updated_at: '2027-01-01T09:00:00.000Z',
      }],
      entityLinks: [{
        id: 'condition-link-1',
        project_id: project.id,
        source_entity_type: 'drawing_package',
        source_entity_id: 'drawing-package-1',
        target_entity_type: 'task_condition',
        target_entity_id: 'condition-drawing',
        relation_type: 'satisfies_condition',
        status: 'active',
      }],
      drawingPackages: [{
        id: 'drawing-package-1',
        package_name: 'Foundation structure drawings',
        is_ready_for_construction: false,
      }],
    })

    const result = await getProjectStartReadiness({
      projectId: project.id,
      companyId: project.company_id,
      asOfDate: '2027-01-01',
    }, {
      dataSource: source,
      resolveCalendar: async () => calendar,
    })

    expect(result.items[0].blockingReferences.drawing?.[0]).toMatchObject({
      referenceType: 'drawing_package',
      referenceId: 'drawing-package-1',
      label: 'Foundation drawing release',
    })
  })

  it('keeps a linked certificate next action on its unmet condition', async () => {
    const source = buildSource({
      ...emptyFacts(),
      tasks: [{
        id: 'task-1',
        project_id: project.id,
        title: 'Permit-controlled task',
        planned_start_date: '2027-01-03',
        status: 'todo',
        progress: 0,
        actual_start_date: null,
        acceptance_required: true,
        updated_at: '2027-01-01T08:00:00.000Z',
      }],
      conditions: [{
        id: 'condition-permit',
        project_id: project.id,
        task_id: 'task-1',
        condition_type: 'approval',
        name: 'Pour permit must be issued',
        is_satisfied: false,
        required_for_start: true,
        blocking_level: 'hard',
        updated_at: '2027-01-01T09:00:00.000Z',
      }],
      entityLinks: [{
        id: 'condition-link-1',
        project_id: project.id,
        source_entity_type: 'certificate_work_item',
        source_entity_id: 'certificate-1',
        target_entity_type: 'task_condition',
        target_entity_id: 'condition-permit',
        relation_type: 'satisfies_condition',
        status: 'active',
      }],
      certificateWorkItems: [{
        id: 'certificate-1',
        item_name: 'Pour permit',
        status: 'pending',
        next_action: 'Submit signed package',
        next_action_due_date: '2027-01-02',
        updated_at: '2027-01-01T10:00:00.000Z',
      }],
    })

    const result = await getProjectStartReadiness({
      projectId: project.id,
      companyId: project.company_id,
      asOfDate: '2027-01-01',
    }, {
      dataSource: source,
      resolveCalendar: async () => calendar,
    })

    expect(result.items[0].blockingReferences.certificate?.[0]).toMatchObject({
      referenceType: 'certificate_work_item',
      referenceId: 'certificate-1',
      nextAction: 'Submit signed package',
      dueDate: '2027-01-02',
      sourceUpdatedAt: '2027-01-01T10:00:00.000Z',
    })
    expect(result.items[0].nextAction).toBe('Submit signed package')
  })

  it('fails tenant scope closed before loading project facts', async () => {
    const source = buildSource(emptyFacts(), null)

    await expect(getProjectStartReadiness({
      projectId: project.id,
      companyId: 'another-company',
      asOfDate: '2027-01-01',
    }, {
      dataSource: source,
      resolveCalendar: async () => calendar,
    })).rejects.toBeInstanceOf(ProjectStartReadinessScopeError)

    expect(source.loadWindowFacts).not.toHaveBeenCalled()
  })
})
