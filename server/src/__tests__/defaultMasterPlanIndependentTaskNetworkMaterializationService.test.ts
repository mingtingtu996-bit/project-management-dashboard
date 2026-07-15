import { describe, expect, it, vi } from 'vitest'
import { buildIndependentDefaultMasterPlanTaskNetwork } from '../services/defaultMasterPlanIndependentTaskNetworkService.js'
import { materializeIndependentDefaultMasterPlanTaskNetwork } from '../services/defaultMasterPlanIndependentTaskNetworkMaterializationService.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const BASELINE_ID = '22222222-2222-4222-8222-222222222222'
const SCOPE_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_ID = '66666666-6666-4666-8666-666666666666'

function readyPlan() {
  return buildIndependentDefaultMasterPlanTaskNetwork({
    projectId: PROJECT_ID,
    baseline: { id: BASELINE_ID, project_id: PROJECT_ID, status: 'draft' },
    scopeAssignment: { engineering_object_id: SCOPE_ID },
    materializedByUserId: ACTOR_ID,
    idFactory: (index) => `task-${index + 1}`,
    candidateItems: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        project_id: PROJECT_ID,
        title: '基础工程',
        planned_start_date: '2026-02-16',
        planned_end_date: '2026-02-16',
        sort_order: 1,
        source_task_id: null,
        generation_metadata: { clientRowId: 'candidate-1', predecessorDependencies: [], candidateOnly: true },
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        project_id: PROJECT_ID,
        title: '混凝土结构',
        planned_start_date: '2026-02-17',
        planned_end_date: '2026-02-20',
        sort_order: 2,
        source_task_id: null,
        generation_metadata: {
          clientRowId: 'candidate-2',
          predecessorDependencies: [{ clientRowId: 'candidate-1', dependencyType: 'FS', lagDays: 1 }],
          candidateOnly: true,
        },
      },
    ],
  })
}

describe('independent default master-plan task network materialization', () => {
  it('creates only planned tasks and their internal dependencies in one transaction', async () => {
    const plan = readyPlan()
    const statements: string[] = []
    const client = {
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        statements.push(sql)
        if (sql.includes('task_baseline_items')) return { rows: [{ id: 'mapped-item' }] }
        if (sql.includes('task_baselines')) return { rows: [{ id: BASELINE_ID }] }
        if (sql.includes('change_logs')) return { rows: [{ id: 'audit-log' }] }
        return { rows: [{ id: 'dependency-row' }] }
      }),
      release: vi.fn(),
    }
    const createTasks = vi.fn(async (items: any[]) => items.map((item) => ({
      task: { id: item.payload.id, project_id: item.payload.project_id },
      participantUnit: null,
    })))

    const result = await materializeIndependentDefaultMasterPlanTaskNetwork({
      projectId: PROJECT_ID,
      baselineId: BASELINE_ID,
      actorUserId: ACTOR_ID,
      plan,
      clientFactory: async () => client,
      createTasks,
    })

    expect(result.createdTaskIds).toEqual(['task-1', 'task-2'])
    expect(result.createdDependencyCount).toBe(1)
    expect(result.mappedCandidateItemCount).toBe(2)
    expect(result.runtimePublicationCreated).toBe(false)
    expect(createTasks).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ clientRowId: 'candidate-1' })]),
      ACTOR_ID,
      expect.objectContaining({ transactionClient: client, deferPostCreateEffects: true }),
    )
    expect(statements[0]).toBe('BEGIN')
    expect(statements).toContain('COMMIT')
    expect(statements.join('\n')).toContain('INSERT INTO public.task_dependencies')
    expect(statements.join('\n')).toContain('UPDATE public.task_baseline_items')
    expect(statements.join('\n')).toContain('INSERT INTO public.change_logs')
    expect(statements.join('\n')).not.toContain('UPDATE public.tasks')
    const baselineUpdateCall = client.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE public.task_baselines'))
    const auditInsertCall = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.change_logs'))
    expect(JSON.parse(String(baselineUpdateCall?.[1]?.[2]))).not.toHaveProperty('candidate_governance_review')
    expect(JSON.parse(String(auditInsertCall?.[1]?.[4]))).not.toHaveProperty('candidate_governance_review')
    expect(String(auditInsertCall?.[0])).toContain("'plan_materialization'")
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('rolls back all writes when a candidate mapping update is not guarded', async () => {
    const plan = readyPlan()
    const statements: string[] = []
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql)
        if (sql.includes('task_baseline_items')) return { rows: [] }
        return { rows: [{ id: 'ok' }] }
      }),
      release: vi.fn(),
    }

    await expect(materializeIndependentDefaultMasterPlanTaskNetwork({
      projectId: PROJECT_ID,
      baselineId: BASELINE_ID,
      actorUserId: ACTOR_ID,
      plan,
      clientFactory: async () => client,
      createTasks: async (items: any[]) => items.map((item) => ({
        task: { id: item.payload.id, project_id: item.payload.project_id },
        participantUnit: null,
      })),
    })).rejects.toMatchObject({ code: 'CANDIDATE_BASELINE_MAPPING_GUARD_FAILED' })

    expect(statements[0]).toBe('BEGIN')
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
    expect(client.release).toHaveBeenCalledTimes(1)
  })
})
