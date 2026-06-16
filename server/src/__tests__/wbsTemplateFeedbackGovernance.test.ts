import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  rawQuery: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

const { collectWbsTemplateFeedback } = await import('../services/wbsTemplateFeedback.js')

describe('wbsTemplateFeedback governance bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rawQuery.mockResolvedValue({ rows: [{ id: 'wbs-feedback-candidate-event-id' }] })
    mocks.executeSQLOne.mockResolvedValue({
      id: 'template-1',
      template_name: 'Commercial WBS template',
      wbs_nodes: [
        {
          id: 'source-structure',
          title: '主体结构',
          reference_days: 6,
          children: [],
        },
      ],
    })
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM projects')) {
        return [
          { id: 'project-1', name: 'Done project', status: 'completed' },
        ]
      }
      if (sql.includes('FROM tasks')) {
        return [
          {
            id: 'task-1',
            project_id: 'project-1',
            title: '主体结构',
            status: 'completed',
            task_source: 'template',
            baseline_item_id: 'baseline-1',
            actual_start_date: '2026-05-01',
            actual_end_date: '2026-05-05',
            planned_start_date: '2026-05-01',
            planned_end_date: '2026-05-06',
          },
        ]
      }
      if (sql.includes('FROM task_baseline_items')) {
        return [
          { id: 'baseline-1', project_id: 'project-1', source_task_id: 'source-structure' },
        ]
      }
      return []
    })
  })

  it('bridges completed-project WBS feedback into unified candidate events without mutating runtime seeds', async () => {
    const report = await collectWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    } as any)

    expect(report.sample_task_count).toBe(1)
    const sql = mocks.rawQuery.mock.calls.map((call) => String(call[0])).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('algorithm_seed_overrides')
    expect(sql).not.toContain('update public.wbs_templates')

    const candidateInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_asset_candidate_events'),
    )
    expect(candidateInsert).toBeTruthy()
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      'wbs.template_feedback.template-1',
      'wbsTemplateFeedback',
      'company',
      '10000000-0000-4000-8000-000000000001',
      null,
      'base_duration',
      'governed_candidate',
      'candidate_only',
      'manual_required',
      'review_required',
      'candidate_only',
    ]))
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'template-1',
        sampleTaskCount: 1,
        completedProjectCount: 1,
        nodes: expect.arrayContaining([
          expect.objectContaining({
            title: '主体结构',
            sampleCount: 1,
            suggestedReferenceDays: 5,
          }),
        ]),
      }),
    ]))
  })

  it('records WBS reference-days feedback as a plan-network outcome without mutating facts or runtime', async () => {
    const report = await collectWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    } as any)

    expect(report.sample_task_count).toBe(1)
    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )

    expect(outcomeInsert).toBeTruthy()
    expect(String(outcomeInsert?.[0]).toLowerCase()).toContain('on conflict (id) do update')
    expect(outcomeInsert?.[1]).toEqual([
      'wbs-reference-days:template-1:project-1',
      'wbs_reference_days',
      'weak',
      'wbs_template_feedback:template-1',
      'project',
      '10000000-0000-4000-8000-000000000001',
      'project-1',
      null,
      expect.objectContaining({
        source: 'wbs_template_feedback',
        template_id: 'template-1',
        sample_task_count: 1,
        completed_project_count: 1,
        actionable_node_count: 1,
        writes_runtime_directly: false,
        writes_fact_directly: false,
      }),
      false,
      false,
    ])
  })
})
