import { describe, expect, it } from 'vitest'
import { materializeGeneratedTemplateRowsToBaselineItems } from '../services/wbsTemplateBaselineDraftMaterializer.js'

describe('wbs template baseline draft materializer', () => {
  it('does not write standard catalog codes into uuid template reference columns', () => {
    const [item] = materializeGeneratedTemplateRowsToBaselineItems({
      projectId: '11111111-1111-4111-8111-111111111111',
      baselineVersionId: '22222222-2222-4222-8222-222222222222',
      capturedAt: '2026-07-01T00:00:00.000Z',
      rows: [
        {
          clientRowId: 'row-1',
          rowProjectionMode: 'schedule_row',
          scheduleParticipation: 'primary_schedule',
          sortOrder: 1,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          values: {
            title: '主体结构候选计划项',
            template_id: 'china-gb55032-2022',
            template_node_id: 'BDT-04-01-02',
            planned_start_date: '2026-07-01',
            planned_end_date: '2026-07-08',
            standard_task_metadata: {
              source: 'managed_frontier_default_master_plan',
            },
          },
        } as any,
      ],
    })

    expect(item.template_id).toBeNull()
    expect(item.template_node_id).toBeNull()
    expect(item.generation_metadata).toEqual(expect.objectContaining({
      sourceTemplateId: 'china-gb55032-2022',
      sourceTemplateNodeId: 'BDT-04-01-02',
      sourceTemplateIdColumnSuppressed: true,
      sourceTemplateNodeIdColumnSuppressed: true,
    }))
  })

  it('keeps uuid template references in reference columns', () => {
    const [item] = materializeGeneratedTemplateRowsToBaselineItems({
      projectId: '11111111-1111-4111-8111-111111111111',
      baselineVersionId: '22222222-2222-4222-8222-222222222222',
      capturedAt: '2026-07-01T00:00:00.000Z',
      rows: [
        {
          clientRowId: 'row-1',
          rowProjectionMode: 'schedule_row',
          scheduleParticipation: 'primary_schedule',
          sortOrder: 1,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          values: {
            title: '主体结构候选计划项',
            template_id: '33333333-3333-4333-8333-333333333333',
            template_node_id: '44444444-4444-4444-8444-444444444444',
            planned_start_date: '2026-07-01',
            planned_end_date: '2026-07-08',
            standard_task_metadata: {
              source: 'managed_frontier_default_master_plan',
            },
          },
        } as any,
      ],
    })

    expect(item.template_id).toBe('33333333-3333-4333-8333-333333333333')
    expect(item.template_node_id).toBe('44444444-4444-4444-8444-444444444444')
    expect(item.generation_metadata).toEqual(expect.objectContaining({
      sourceTemplateId: '33333333-3333-4333-8333-333333333333',
      sourceTemplateNodeId: '44444444-4444-4444-8444-444444444444',
      sourceTemplateIdColumnSuppressed: false,
      sourceTemplateNodeIdColumnSuppressed: false,
    }))
  })

  it('suppresses bulky generator metadata from baseline item rows', () => {
    const [item] = materializeGeneratedTemplateRowsToBaselineItems({
      projectId: '11111111-1111-4111-8111-111111111111',
      baselineVersionId: '22222222-2222-4222-8222-222222222222',
      capturedAt: '2026-07-01T00:00:00.000Z',
      rows: [
        {
          clientRowId: 'row-1',
          rowProjectionMode: 'schedule_row',
          scheduleParticipation: 'primary_schedule',
          sortOrder: 1,
          predecessorClientRowIds: ['row-0'],
          predecessorDependencies: [{ clientRowId: 'row-0', dependencyType: 'FS', lagDays: 0 }],
          values: {
            title: '主体结构候选计划项',
            planned_start_date: '2026-07-01',
            planned_end_date: '2026-07-08',
            duration_suggestion: {
              recommendedDurationDays: 7,
              durationOutputCode: 'governed_duration_candidate',
            },
            standard_task_metadata: {
              source: 'managed_frontier_default_master_plan',
              planItemKind: 'work_task',
              generationDepthPolicy: {
                governance: {
                  mutationBoundary: {
                    writesTasks: false,
                    writesTaskDependencies: false,
                    writesCriticalPathFacts: false,
                  },
                },
              },
              constructionOrganizationOptions: [{ payload: 'x'.repeat(1_000_000) }],
              projectOrganizationScheme: { payload: 'x'.repeat(1_000_000) },
              factCoverage: { payload: 'x'.repeat(1_000_000) },
            },
          },
        } as any,
      ],
    })

    const metadataText = JSON.stringify(item.generation_metadata)
    expect(Buffer.byteLength(metadataText, 'utf8')).toBeLessThan(20_000)
    expect(metadataText).not.toContain('x'.repeat(1_000))
    expect(item.generation_metadata).toEqual(expect.objectContaining({
      source: 'managed_frontier_default_master_plan',
      planItemKind: 'work_task',
      suppressedLargeMetadataKeys: expect.arrayContaining([
        'constructionOrganizationOptions',
        'projectOrganizationScheme',
        'factCoverage',
      ]),
      durationSuggestion: expect.objectContaining({
        recommendedDurationDays: 7,
      }),
      predecessorDependencies: [{ clientRowId: 'row-0', dependencyType: 'FS', lagDays: 0 }],
      mutationBoundary: expect.objectContaining({
        writesTasks: false,
        writesTaskDependencies: false,
        writesCriticalPathFacts: false,
      }),
    }))
  })

  it('links wizard-committed tasks without changing candidate baseline semantics', () => {
    const [item] = materializeGeneratedTemplateRowsToBaselineItems({
      projectId: '11111111-1111-4111-8111-111111111111',
      baselineVersionId: '22222222-2222-4222-8222-222222222222',
      capturedAt: '2026-07-13T00:00:00.000Z',
      generationBatchId: '55555555-5555-4555-8555-555555555555',
      sourceTaskIdByClientRowId: new Map([
        ['row-1', '33333333-3333-4333-8333-333333333333'],
      ]),
      rows: [
        {
          clientRowId: 'row-1',
          rowProjectionMode: 'schedule_row',
          scheduleParticipation: 'primary_schedule',
          sortOrder: 1,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            planned_start_date: '2026-07-01',
            planned_end_date: '2026-07-08',
            standard_task_metadata: {
              source: 'managed_frontier_default_master_plan',
            },
          },
        } as any,
      ],
    })

    expect(item.source_task_id).toBe('33333333-3333-4333-8333-333333333333')
    expect(item.mapping_status).toBe('mapped')
    expect(item.generation_metadata).toEqual(expect.objectContaining({
      candidateOnly: true,
      generationBatchId: '55555555-5555-4555-8555-555555555555',
      sourceTaskLinked: true,
    }))
  })
})
