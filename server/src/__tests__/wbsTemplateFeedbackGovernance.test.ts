import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  rawQuery: vi.fn(),
  resolveConstructionCalendarContext: vi.fn(),
  trustedConsumptionRows: [] as Record<string, unknown>[],
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
  withDatabaseTransaction: async <T>(runner: () => Promise<T>) => runner(),
}))

vi.mock('../services/constructionCalendar.js', async () => {
  const actual = await vi.importActual<typeof import('../services/constructionCalendar.js')>('../services/constructionCalendar.js')
  return {
    ...actual,
    resolveConstructionCalendarContext: mocks.resolveConstructionCalendarContext,
  }
})

const {
  collectWbsTemplateFeedback,
  produceWbsTemplateFeedback,
  runWbsTemplateFeedbackGovernanceSweep,
} = await import('../services/wbsTemplateFeedback.js')
const serviceSourcePath = fileURLToPath(new URL('../services/wbsTemplateFeedback.ts', import.meta.url))

describe('wbsTemplateFeedback governance bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.trustedConsumptionRows = [{
      company_id: '10000000-0000-4000-8000-000000000001',
      project_id: 'project-1',
      task_id: 'task-1',
      consumption_key: 'trusted-consumption-1',
      publication_key: 'duration-learning:wbs-reference:stable-1',
      asset_key: 'wbs_reference_days',
      artifact_key: 'template-1',
      generation_batch_id: 'batch-1',
      template_id: 'template-1',
      source_evidence_refs: [
        'duration_learning_runtime_publications:duration-learning:wbs-reference:stable-1',
      ],
      consumption_context: {
        authoritySource: 'runtime_resolver_publication_set',
      },
      publication_stage: 'stable',
      monitoring_status: 'passed',
      publication_scope_level: 'project',
      publication_company_id: '10000000-0000-4000-8000-000000000001',
      publication_project_id: 'project-1',
      publication_industry_key: null,
      consumed_at: '2026-04-01T00:00:00.000Z',
    }]
    mocks.rawQuery.mockImplementation(async (sql: string) => ({
      rows: sql.toLowerCase().includes('from public.duration_learning_runtime_consumptions')
        ? mocks.trustedConsumptionRows
        : [{ id: 'wbs-feedback-candidate-event-id' }],
    }))
    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      basis: 'official_construction_calendar_seed',
      windows: [{
        startDate: '2026-05-03',
        endDate: '2026-05-03',
        shutdown: true,
      }],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    })
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
            source_template_id: 'template-1',
            generation_batch_id: 'batch-1',
            standard_task_metadata: {
              durationLearningAssetKey: 'wbs_reference_days',
              durationLearningPublicationKey: 'duration-learning:wbs-reference:forged-json',
            },
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

  it('keeps report collection read-only so GET consumers cannot create governance mutations', async () => {
    const report = await collectWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    } as any)

    expect(report.sample_task_count).toBe(1)
    const sql = mocks.rawQuery.mock.calls.map((call) => String(call[0])).join('\n').toLowerCase()
    expect(sql).not.toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).not.toContain('insert into public.duration_plan_network_outcomes')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('algorithm_seed_overrides')
    expect(sql).not.toContain('update public.wbs_templates')
  })

  it('bridges an explicit project-scoped producer into unified candidate events and outcomes', async () => {
    const result = await produceWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    } as any)

    const candidateInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_asset_candidate_events'),
    )
    expect(candidateInsert).toBeTruthy()
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      'wbs.template_feedback.template-1',
      'wbsTemplateFeedback',
      'project',
      '10000000-0000-4000-8000-000000000001',
      'project-1',
      'base_duration',
      'governed_candidate',
      'candidate_only',
      'auto_shadow',
      'review_required',
      'candidate_only',
    ]))
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'template-1',
        projectIds: ['project-1'],
        sampleTaskCount: 1,
        completedProjectCount: 1,
        automationLifecycle: 'duration_learning_runtime_candidate',
        humanFallbackPolicy: 'conflict_or_exception_only',
        nodes: expect.arrayContaining([
          expect.objectContaining({
            title: '主体结构',
            sampleCount: 1,
            suggestedReferenceDays: 4,
          }),
        ]),
      }),
    ]))

    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )

    expect(outcomeInsert).toBeTruthy()
    expect(String(outcomeInsert?.[0]).toLowerCase()).toContain('on conflict (id) do update')
    expect(String(outcomeInsert?.[0]).toLowerCase()).toContain('learning_scope_source')
    expect(outcomeInsert?.[1]).toEqual([
      'wbs-reference-days:template-1:project-1:duration-learning:wbs-reference:stable-1:batch-1',
      'wbs_reference_days',
      'weak',
      'wbs_template_feedback:template-1',
      'project',
      'project_business_outcome_writer',
      '10000000-0000-4000-8000-000000000001',
      'project-1',
      'duration-learning:wbs-reference:stable-1',
      expect.objectContaining({
        source: 'wbs_template_feedback',
        template_id: 'template-1',
        sample_task_count: 1,
        completed_project_count: 1,
        actionable_node_count: 1,
        publication_lineage_status: 'linked',
        consumed_runtime_publication_keys: ['duration-learning:wbs-reference:stable-1'],
        runtime_publication_key: 'duration-learning:wbs-reference:stable-1',
        runtime_publication_artifact_key: 'template-1',
        runtime_publication_input_task_ids: ['task-1'],
        runtime_publication_generation_batch_id: 'batch-1',
        generation_batch_id: 'batch-1',
        runtime_publication_consumption_keys: ['trusted-consumption-1'],
        source_evidence_refs: expect.arrayContaining([
          'duration_learning_runtime_publications:duration-learning:wbs-reference:stable-1',
          'duration_learning_runtime_consumptions:trusted-consumption-1',
        ]),
        writes_runtime_directly: false,
        writes_fact_directly: false,
      }),
      false,
      false,
    ])
    expect(result).toEqual(expect.objectContaining({
      candidateEventCount: 1,
      recordedOutcomeCount: 1,
      report: expect.objectContaining({ sample_task_count: 1 }),
    }))

    const canonicalRead = mocks.rawQuery.mock.calls.find((call) => (
      String(call[0]).toLowerCase().includes('from public.duration_learning_runtime_consumptions')
    ))
    expect(canonicalRead).toBeTruthy()
    expect(String(canonicalRead?.[0]).toLowerCase()).toContain('join public.tasks')
    expect(String(canonicalRead?.[0]).toLowerCase()).toContain('join public.duration_learning_runtime_publications')
    expect(String(canonicalRead?.[0]).toLowerCase()).toContain('generation_batch_id')
    expect(String(canonicalRead?.[0]).toLowerCase()).toContain('artifact_key')
    expect(String(canonicalRead?.[0])).toContain("consumption.consumption_context ->> 'authoritySource'")
  })

  it('keeps forged task JSON unlinked when no canonical trusted consumption exists', async () => {
    mocks.trustedConsumptionRows = []

    await produceWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    })

    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )
    const metadata = outcomeInsert?.[1]?.[9] as Record<string, unknown>
    expect(outcomeInsert?.[1]?.[8]).toBeNull()
    expect(metadata).toEqual(expect.objectContaining({
      publication_lineage_status: 'unlinked_no_trusted_consumption',
      consumed_runtime_publication_keys: [],
      runtime_publication_key: null,
      runtime_publication_artifact_key: null,
      runtime_publication_input_task_ids: [],
    }))
    expect(JSON.stringify(outcomeInsert?.[1])).not.toContain('forged-json')
  })

  it('keeps a physical-looking row unlinked when its canonical authority marker is missing', async () => {
    mocks.trustedConsumptionRows = [{
      ...mocks.trustedConsumptionRows[0],
      source_evidence_refs: ['tasks:task-1:materialized'],
      consumption_context: { authoritySource: 'user_metadata' },
    }]

    await produceWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    })

    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )
    const metadata = outcomeInsert?.[1]?.[9] as Record<string, unknown>
    expect(outcomeInsert?.[1]?.[8]).toBeNull()
    expect(metadata).toEqual(expect.objectContaining({
      publication_lineage_status: 'unlinked_no_trusted_consumption',
      generation_batch_id: null,
      runtime_publication_key: null,
      runtime_publication_consumption_keys: [],
    }))
  })

  it('ignores stale generation history and links the unique canonical materialization lineage', async () => {
    mocks.trustedConsumptionRows = [
      {
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: 'project-1',
        task_id: 'task-1',
        consumption_key: 'trusted-consumption-old',
        publication_key: 'duration-learning:wbs-reference:old',
        asset_key: 'wbs_reference_days',
        artifact_key: 'template-1',
        generation_batch_id: 'batch-old',
        template_id: 'template-1',
        source_evidence_refs: [
          'duration_learning_runtime_publications:duration-learning:wbs-reference:old',
        ],
        consumption_context: { authoritySource: 'runtime_resolver_publication_set' },
        publication_stage: 'stable',
        monitoring_status: 'passed',
        publication_scope_level: 'project',
        publication_company_id: '10000000-0000-4000-8000-000000000001',
        publication_project_id: 'project-1',
        consumed_at: '2026-03-01T00:00:00.000Z',
      },
      {
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: 'project-1',
        task_id: 'task-1',
        consumption_key: 'trusted-consumption-current',
        publication_key: 'duration-learning:wbs-reference:stable-1',
        asset_key: 'wbs_reference_days',
        artifact_key: 'template-1',
        generation_batch_id: 'batch-1',
        template_id: 'template-1',
        source_evidence_refs: [
          'duration_learning_runtime_publications:duration-learning:wbs-reference:stable-1',
        ],
        consumption_context: { authoritySource: 'runtime_resolver_publication_set' },
        publication_stage: 'stable',
        monitoring_status: 'passed',
        publication_scope_level: 'project',
        publication_company_id: '10000000-0000-4000-8000-000000000001',
        publication_project_id: 'project-1',
        consumed_at: '2026-04-01T00:00:00.000Z',
      },
    ]

    await produceWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    })

    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )
    const metadata = outcomeInsert?.[1]?.[9] as Record<string, unknown>
    expect(outcomeInsert?.[1]?.[8]).toBe('duration-learning:wbs-reference:stable-1')
    expect(metadata).toEqual(expect.objectContaining({
      publication_lineage_status: 'linked',
      runtime_publication_generation_batch_id: 'batch-1',
      runtime_publication_consumption_keys: ['trusted-consumption-current'],
    }))
    expect(JSON.stringify(metadata)).not.toContain('duration-learning:wbs-reference:old')
  })

  it('fails closed when one materialization has multiple canonical publication lineages', async () => {
    mocks.trustedConsumptionRows = [
      mocks.trustedConsumptionRows[0]!,
      {
        ...mocks.trustedConsumptionRows[0],
        consumption_key: 'trusted-consumption-2',
        publication_key: 'duration-learning:wbs-reference:stable-2',
        source_evidence_refs: [
          'duration_learning_runtime_publications:duration-learning:wbs-reference:stable-2',
        ],
      },
    ]

    await produceWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    })

    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )
    const metadata = outcomeInsert?.[1]?.[9] as Record<string, unknown>
    expect(outcomeInsert?.[1]?.[8]).toBeNull()
    expect(metadata).toEqual(expect.objectContaining({
      publication_lineage_status: 'ambiguous_trusted_consumption',
      consumed_runtime_publication_keys: [
        'duration-learning:wbs-reference:stable-1',
        'duration-learning:wbs-reference:stable-2',
      ],
      runtime_publication_key: null,
      runtime_publication_artifact_key: null,
      runtime_publication_input_task_ids: [],
    }))
  })

  it('splits disjoint physical task subsets into distinct publication outcomes without duplicating the candidate aggregate', async () => {
    mocks.trustedConsumptionRows = [
      mocks.trustedConsumptionRows[0]!,
      {
        ...mocks.trustedConsumptionRows[0],
        task_id: 'task-2',
        consumption_key: 'trusted-consumption-2',
        publication_key: 'duration-learning:wbs-reference:stable-2',
        source_evidence_refs: [
          'duration_learning_runtime_publications:duration-learning:wbs-reference:stable-2',
        ],
      },
    ]
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM projects')) {
        return [{ id: 'project-1', name: 'Done project', status: 'completed' }]
      }
      if (sql.includes('FROM tasks')) {
        return [
          {
            id: 'task-1',
            project_id: 'project-1',
            title: '涓讳綋缁撴瀯',
            status: 'completed',
            task_source: 'template',
            baseline_item_id: 'baseline-1',
            actual_start_date: '2026-05-01',
            actual_end_date: '2026-05-05',
            source_template_id: 'template-1',
            generation_batch_id: 'batch-1',
          },
          {
            id: 'task-2',
            project_id: 'project-1',
            title: '涓讳綋缁撴瀯',
            status: 'completed',
            task_source: 'template',
            baseline_item_id: 'baseline-2',
            actual_start_date: '2026-05-01',
            actual_end_date: '2026-05-11',
            source_template_id: 'template-1',
            generation_batch_id: 'batch-1',
          },
        ]
      }
      if (sql.includes('FROM task_baseline_items')) {
        return [
          { id: 'baseline-1', project_id: 'project-1', source_task_id: 'source-structure' },
          { id: 'baseline-2', project_id: 'project-1', source_task_id: 'source-structure' },
        ]
      }
      return []
    })

    const result = await produceWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    })

    expect(result.report).toEqual(expect.objectContaining({ sample_task_count: 2 }))
    expect(result.report.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ current_reference_days: 6, sample_count: 2, suggested_reference_days: 7, is_leaf: true }),
    ]))
    const outcomeInserts = mocks.rawQuery.mock.calls.filter((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )
    expect(result.recordedOutcomeCount).toBe(2)
    expect(outcomeInserts).toHaveLength(2)
    expect(new Set(outcomeInserts.map((call) => call[1]?.[0]))).toEqual(new Set([
      'wbs-reference-days:template-1:project-1:duration-learning:wbs-reference:stable-1:batch-1',
      'wbs-reference-days:template-1:project-1:duration-learning:wbs-reference:stable-2:batch-1',
    ]))
    const metadataByPublication = new Map(outcomeInserts.map((call) => [
      call[1]?.[8],
      call[1]?.[9] as Record<string, unknown>,
    ]))
    expect(metadataByPublication.get('duration-learning:wbs-reference:stable-1')).toEqual(expect.objectContaining({
      sample_task_count: 1,
      generation_batch_id: 'batch-1',
      runtime_publication_input_task_ids: ['task-1'],
      runtime_publication_consumption_keys: ['trusted-consumption-1'],
    }))
    expect(metadataByPublication.get('duration-learning:wbs-reference:stable-2')).toEqual(expect.objectContaining({
      sample_task_count: 1,
      generation_batch_id: 'batch-1',
      runtime_publication_input_task_ids: ['task-2'],
      runtime_publication_consumption_keys: ['trusted-consumption-2'],
    }))
    expect(result.candidateEventCount).toBe(1)
  })

  it('stores WBS reference-day outcomes in construction production days with calendar lineage', async () => {
    await produceWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    } as any)

    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )
    const metadata = outcomeInsert?.[1]?.[9] as Record<string, unknown>

    expect(metadata).toEqual(expect.objectContaining({
      day_count_basis: 'construction_production_day',
      reference_day_basis: 'wbs_template_reference_days',
      construction_calendar_basis: 'per_project_resolved_construction_calendar',
      production_day_conversion_applied: true,
      construction_calendar_by_project: {
        'project-1': expect.objectContaining({
          basis: 'official_construction_calendar_seed',
        }),
      },
    }))
    expect(metadata.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dayCountBasis: 'construction_production_day',
        productionDayConversionApplied: true,
      }),
    ]))
    expect(mocks.resolveConstructionCalendarContext).toHaveBeenCalledWith({ projectId: 'project-1' })
  })

  it('writes real leave-one-out accuracy and task lineage for WBS reference-day candidates', async () => {
    mocks.executeSQLOne.mockResolvedValue({
      id: 'template-1',
      template_name: 'Commercial WBS template',
      wbs_nodes: [{
        id: 'source-structure',
        title: 'Structure',
        reference_days: 20,
        children: [],
      }],
    })
    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      basis: 'official_construction_calendar_seed',
      windows: [],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    })
    const tasks = Array.from({ length: 20 }, (_, index) => ({
      id: `task-${index + 1}`,
      project_id: 'project-1',
      title: 'Structure',
      status: 'completed',
      task_source: 'template',
      baseline_item_id: `baseline-${index + 1}`,
      actual_start_date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      actual_end_date: `2026-01-${String(index + 9 + (index % 3)).padStart(2, '0')}`,
      planned_start_date: '2026-01-01',
      planned_end_date: '2026-01-20',
      standard_task_metadata: {},
    }))
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM projects')) return [{ id: 'project-1', status: 'completed' }]
      if (sql.includes('FROM tasks')) return tasks
      if (sql.includes('FROM task_baseline_items')) {
        return tasks.map((task) => ({
          id: task.baseline_item_id,
          project_id: 'project-1',
          source_task_id: 'source-structure',
        }))
      }
      return []
    })

    await produceWbsTemplateFeedback('template-1', {
      projectIds: ['project-1'],
      companyId: '10000000-0000-4000-8000-000000000001',
    })

    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )
    const metadata = outcomeInsert?.[1]?.[9] as Record<string, unknown>
    expect(metadata).toEqual(expect.objectContaining({
      source_task_ids: tasks.map((task) => task.id),
      quality_model: 'numeric_holdout',
      holdout_sample_count: 20,
      mae_before: expect.any(Number),
      mae_after: expect.any(Number),
      conflict_rate: 0,
      overcompensation_rate: 0,
      rollback_ready: true,
      tenant_scope_valid: true,
    }))
    expect(Number(metadata.mae_before)).toBeGreaterThan(Number(metadata.mae_after))
  })

  it('runs the scheduled producer by exact company, project, and template scope', async () => {
    const targetQueryExec = vi.fn()
      .mockResolvedValueOnce([{
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: 'project-1',
        template_id: 'template-1',
      }])
      .mockResolvedValueOnce([])

    const result = await runWbsTemplateFeedbackGovernanceSweep({
      companyId: '10000000-0000-4000-8000-000000000001',
      targetQueryExec,
      pageSize: 1,
    } as any)

    expect(targetQueryExec).toHaveBeenCalledTimes(2)
    expect(targetQueryExec.mock.calls[0]?.[0]).toContain('SELECT DISTINCT')
    expect(targetQueryExec.mock.calls[0]?.[0]).toContain('source_template_id')
    expect(targetQueryExec.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      '10000000-0000-4000-8000-000000000001',
      1,
    ]))
    expect(result).toEqual(expect.objectContaining({
      targetCount: 1,
      completedTargetCount: 1,
      failedTargetCount: 0,
      candidateEventCount: 1,
      recordedOutcomeCount: 1,
    }))
  })

  it('falls back to template-only reference-day inference when optional task feedback reads time out', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM projects')) {
        return [
          { id: 'project-1', name: 'Done project', status: 'completed' },
        ]
      }
      if (sql.includes('FROM tasks')) {
        throw new Error('dbService.executeSQL SELECT tasks direct query timed out after 12000ms')
      }
      return []
    })

    const report = await collectWbsTemplateFeedback('template-1', {
      projectIds: null,
      companyId: '10000000-0000-4000-8000-000000000001',
    } as any)

    expect(report.sample_task_count).toBe(0)
    expect(report.completed_project_count).toBe(0)
    expect(report.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: '主体结构',
        sample_count: 0,
        current_reference_days: 6,
        suggested_reference_days: 6,
      }),
    ]))
    const projectRead = mocks.executeSQL.mock.calls.find((call) => String(call[0]).includes('FROM projects'))
    const taskRead = mocks.executeSQL.mock.calls.find((call) => String(call[0]).includes('FROM tasks'))
    expect(String(projectRead?.[0])).toContain('WHERE 1 = 0')
    expect(String(taskRead?.[0])).toContain('WHERE 1 = 0')
    expect(mocks.rawQuery.mock.calls.some((call) => (
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes')
    ))).toBe(false)
  })

  it('keeps the default plan-network outcome writer on fixed SQL instead of dynamic rawQuery delegation', () => {
    const source = readFileSync(serviceSourcePath, 'utf8')

    expect(source).not.toContain('buildDefaultGovernanceQueryExec')
    expect(source).not.toContain('rawQuery(sql')
    expect(source).not.toContain('rawQuery(\n    sql')
    expect(source).toContain('async function recordWbsReferenceDaysPlanNetworkOutcome')
    expect(source).toContain('INSERT INTO public.duration_plan_network_outcomes')
  })
})
