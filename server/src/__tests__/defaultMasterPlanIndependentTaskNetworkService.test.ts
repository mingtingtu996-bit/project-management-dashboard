import { describe, expect, it } from 'vitest'
import {
  buildIndependentDefaultMasterPlanTaskNetwork,
} from '../services/defaultMasterPlanIndependentTaskNetworkService.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const BASELINE_ID = '22222222-2222-4222-8222-222222222222'
const SCOPE_ID = '33333333-3333-4333-8333-333333333333'

function candidateItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    project_id: PROJECT_ID,
    title: '混凝土结构',
    planned_start_date: '2026-02-16',
    planned_end_date: '2026-02-20',
    sort_order: 1,
    is_milestone: false,
    is_critical: false,
    wbs_node_type: 'sub_division',
    is_executable: true,
    standard_work_code: '02-01',
    standard_work_name: '混凝土结构',
    source_task_id: null,
    mapping_status: 'pending',
    generation_metadata: {
      clientRowId: 'candidate-row-1',
      predecessorDependencies: [],
      candidateOnly: true,
    },
    ...overrides,
  }
}

describe('default master-plan independent task network', () => {
  it('plans new tasks and edges only between newly materialized candidate rows', () => {
    const predecessor = candidateItem({
      id: '44444444-4444-4444-8444-444444444444',
      title: '基础工程',
      standard_work_code: '01-02',
      generation_metadata: {
        clientRowId: 'candidate-row-1',
        predecessorDependencies: [],
        candidateOnly: true,
      },
    })
    const successor = candidateItem({
      id: '55555555-5555-4555-8555-555555555555',
      title: '混凝土结构',
      standard_work_code: '02-01',
      sort_order: 2,
      generation_metadata: {
        clientRowId: 'candidate-row-2',
        predecessorDependencies: [{ clientRowId: 'candidate-row-1', dependencyType: 'FS', lagDays: 1 }],
        candidateOnly: true,
      },
    })

    const plan = buildIndependentDefaultMasterPlanTaskNetwork({
      projectId: PROJECT_ID,
      baseline: { id: BASELINE_ID, project_id: PROJECT_ID, status: 'draft' },
      candidateItems: [predecessor, successor],
      scopeAssignment: { engineering_object_id: SCOPE_ID },
      materializedByUserId: '66666666-6666-4666-8666-666666666666',
      idFactory: (index) => `task-${index + 1}`,
    })

    expect(plan.status).toBe('ready')
    expect(plan.blockers).toEqual([])
    expect(plan.tasks).toHaveLength(2)
    expect(plan.tasks.map((task) => task.id)).toEqual(['task-1', 'task-2'])
    expect(plan.tasks.every((task) => task.sourceBaselineId === BASELINE_ID)).toBe(true)
    expect(plan.tasks.every((task) => task.payload.project_id === PROJECT_ID)).toBe(true)
    expect(plan.tasks.every((task) => task.payload.engineering_object_id === SCOPE_ID)).toBe(true)
    expect(plan.tasks.every((task) => task.payload.start_date === task.payload.planned_start_date)).toBe(true)
    expect(plan.dependencies).toEqual([
      expect.objectContaining({
        taskId: 'task-2',
        dependencyTaskId: 'task-1',
        dependencyType: 'FS',
        lagDays: 1,
        sourceType: 'template_generated',
      }),
    ])
    expect(plan.mutationBoundary).toEqual(expect.objectContaining({
      writesExistingTasks: false,
      writesTasks: true,
      writesTaskDependencies: true,
      writesRuntimePublication: false,
    }))
  })

  it('blocks materialization when a candidate row is already mapped to an existing task', () => {
    const plan = buildIndependentDefaultMasterPlanTaskNetwork({
      projectId: PROJECT_ID,
      baseline: { id: BASELINE_ID, project_id: PROJECT_ID, status: 'draft' },
      candidateItems: [candidateItem({ source_task_id: '77777777-7777-4777-8777-777777777777' })],
      scopeAssignment: { engineering_object_id: SCOPE_ID },
      materializedByUserId: '66666666-6666-4666-8666-666666666666',
    })

    expect(plan.status).toBe('blocked')
    expect(plan.blockers).toContain('candidate_item_already_mapped_to_existing_task')
    expect(plan.tasks).toEqual([])
    expect(plan.dependencies).toEqual([])
  })

  it('requires an explicit project scope assignment instead of inventing one', () => {
    const plan = buildIndependentDefaultMasterPlanTaskNetwork({
      projectId: PROJECT_ID,
      baseline: { id: BASELINE_ID, project_id: PROJECT_ID, status: 'draft' },
      candidateItems: [candidateItem()],
      scopeAssignment: {},
      materializedByUserId: '66666666-6666-4666-8666-666666666666',
    })

    expect(plan.status).toBe('blocked')
    expect(plan.blockers).toContain('independent_task_scope_assignment_required')
  })

  it('uses per-candidate scope overrides for a cross-specialty independent plan', () => {
    const civilCandidate = candidateItem({
      id: '44444444-4444-4444-8444-444444444444',
      title: '混凝土结构',
      generation_metadata: { clientRowId: 'candidate-row-civil', predecessorDependencies: [], candidateOnly: true },
    })
    const mepCandidate = candidateItem({
      id: '55555555-5555-4555-8555-555555555555',
      title: '供电干线',
      standard_work_code: '07-03',
      generation_metadata: { clientRowId: 'candidate-row-mep', predecessorDependencies: [], candidateOnly: true },
    })

    const plan = buildIndependentDefaultMasterPlanTaskNetwork({
      projectId: PROJECT_ID,
      baseline: { id: BASELINE_ID, project_id: PROJECT_ID, status: 'draft' },
      candidateItems: [civilCandidate, mepCandidate],
      scopeAssignment: {},
      scopeAssignmentsByCandidateItemId: {
        '44444444-4444-4444-8444-444444444444': { engineering_object_id: SCOPE_ID },
        '55555555-5555-4555-8555-555555555555': { engineering_object_id: '99999999-9999-4999-8999-999999999999' },
      },
      materializedByUserId: '66666666-6666-4666-8666-666666666666',
    } as any)

    expect(plan.status).toBe('ready')
    expect(plan.tasks[0]?.payload.engineering_object_id).toBe(SCOPE_ID)
    expect(plan.tasks[1]?.payload.engineering_object_id).toBe('99999999-9999-4999-8999-999999999999')
  })

  it('keeps a confirmed duration mapping as review metadata until schedule realignment is explicitly run', () => {
    const plan = buildIndependentDefaultMasterPlanTaskNetwork({
      projectId: PROJECT_ID,
      baseline: { id: BASELINE_ID, project_id: PROJECT_ID, status: 'draft' },
      candidateItems: [candidateItem()],
      scopeAssignment: { engineering_object_id: SCOPE_ID },
      materializedByUserId: '66666666-6666-4666-8666-666666666666',
      approvedDurationMappings: [{
        sampleId: '88888888-8888-4888-8888-888888888888',
        candidateItemId: '44444444-4444-4444-8444-444444444444',
        actualDurationDays: 15,
        decision: 'direct',
      }],
    })

    expect(plan.status).toBe('ready')
    expect(plan.durationCalibration.directMappingCount).toBe(1)
    expect(plan.durationCalibration.scheduleRealignmentRequired).toBe(true)
    expect(plan.tasks[0]?.payload.planned_end_date).toBe('2026-02-20')
    expect(plan.tasks[0]?.payload.standard_task_metadata).toEqual(expect.objectContaining({
      candidateDurationCalibration: expect.objectContaining({
        actualDurationDays: 15,
        pendingScheduleRealignment: true,
      }),
    }))
  })
})
