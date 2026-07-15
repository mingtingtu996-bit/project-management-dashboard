import { describe, expect, it, vi } from 'vitest'

import { createWizardCandidateBaselineDraft } from '../services/wizardCandidateBaselineService.js'

describe('wizard candidate baseline service', () => {
  it('persists a task-mapped candidate baseline in the caller transaction', async () => {
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO "task_baselines"')) {
        return { rowCount: 1, rows: [{ id: params[0] }] }
      }
      if (sql.includes('INSERT INTO "task_baseline_items"')) {
        return { rowCount: 1, rows: [] }
      }
      throw new Error(`unexpected SQL: ${sql}`)
    })

    const result = await createWizardCandidateBaselineDraft({
      transactionClient: { query },
      projectId: '11111111-1111-4111-8111-111111111111',
      projectName: '医院扩建项目',
      businessType: 'hospital',
      generationBatchId: '22222222-2222-4222-8222-222222222222',
      capturedAt: '2026-07-13T00:00:00.000Z',
      sourceTaskIdByClientRowId: new Map([
        ['row-1', '33333333-3333-4333-8333-333333333333'],
      ]),
      durationAssetUtilizationSummary: {
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        rowsMissingDurationAssetCount: 0,
      },
      candidateNetworkEvaluation: {
        projectedNetworkSpanDays: 120,
        previewEdgeCount: 0,
      },
      rows: [
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          parentRowId: null,
          rowProjectionMode: 'schedule_row',
          scheduleParticipation: 'primary_schedule',
          sortOrder: 1,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          values: {
            title: '医疗专项系统施工与调试',
            planned_start_date: '2026-07-01',
            planned_end_date: '2026-10-28',
            standard_task_metadata: {
              source: 'managed_frontier_default_master_plan',
            },
          },
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      baselineId: expect.any(String),
      sourceVersionLabel: 'managed_frontier_default_master_plan',
      itemCount: 1,
      mappedTaskCount: 1,
      status: 'draft',
    }))

    const baselineInsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO "task_baselines"'))
    const itemInsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO "task_baseline_items"'))
    expect(baselineInsert).toBeTruthy()
    expect(itemInsert).toBeTruthy()

    const governanceMetadata = baselineInsert?.[1].find((value) => (
      typeof value === 'string' && value.includes('wizard_generated_initial_plan_draft')
    ))
    expect(JSON.parse(String(governanceMetadata))).toEqual(expect.objectContaining({
      source: 'wizard_generated_initial_plan_draft',
      planLifecycleStatus: 'draft_ready_for_user_confirmation',
      runtimeApprovalRequired: false,
      generationQualityReview: expect.objectContaining({
        mode: 'offline_development_calibration',
        blocksPlanGeneration: false,
        blocksBaselinePublication: false,
      }),
      wizardGeneration: expect.objectContaining({
        generationBatchId: '22222222-2222-4222-8222-222222222222',
        mappedTaskCount: 1,
      }),
      mutationBoundary: expect.objectContaining({
        writesConfirmedBaseline: false,
      }),
    }))
    expect(itemInsert?.[1]).toContain('33333333-3333-4333-8333-333333333333')
  })

  it('rejects an empty primary schedule instead of creating a false baseline', async () => {
    const query = vi.fn()

    await expect(createWizardCandidateBaselineDraft({
      transactionClient: { query },
      projectId: '11111111-1111-4111-8111-111111111111',
      projectName: '住宅项目',
      businessType: 'residential',
      generationBatchId: '22222222-2222-4222-8222-222222222222',
      rows: [],
      sourceTaskIdByClientRowId: new Map(),
    })).rejects.toMatchObject({ code: 'WIZARD_CANDIDATE_BASELINE_EMPTY' })

    expect(query).not.toHaveBeenCalled()
  })
})
