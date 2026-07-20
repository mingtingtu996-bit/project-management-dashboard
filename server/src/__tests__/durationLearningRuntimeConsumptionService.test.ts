import { describe, expect, it, vi } from 'vitest'

import {
  buildGeneratedTemplateRuntimeConsumptions,
  persistDurationLearningRuntimeConsumptions,
  readTrustedDurationLearningRuntimeConsumptionsForTask,
} from '../services/durationLearningRuntimeConsumptionService.js'
import type { GeneratedTemplateRow } from '../services/wbsTemplateGenerationService.js'

const companyId = '22222222-2222-4222-8222-222222222222'
const projectId = '11111111-1111-4111-8111-111111111111'
const taskId = '33333333-3333-4333-8333-333333333333'

function generatedRow(
  consumptions: unknown[],
  options: {
    clientRowId?: string
    predecessorDependencies?: GeneratedTemplateRow['predecessorDependencies']
  } = {},
): GeneratedTemplateRow {
  return {
    clientRowId: options.clientRowId ?? 'generated-row-1',
    parentClientRowId: null,
    rowType: 'task',
    values: {
      standard_task_metadata: {
        durationLearningConsumptions: consumptions,
      },
    },
    predecessorDependencies: options.predecessorDependencies ?? [],
  } as unknown as GeneratedTemplateRow
}

const runtimeArtifactPublications = [
  {
    assetKey: 'special_work_duration_seed' as const,
    publicationKey: 'duration_learning_runtime:special_work_duration_seed:facade-v2',
    publicationStatus: 'published',
    sourceEvidenceRefs: ['duration_learning_runtime_publications:special-v2'],
    observationContext: {
      artifactKey: 'china-facade-curtain-wall',
      templateId: 'china-facade-curtain-wall',
    },
  },
  {
    assetKey: 'wbs_reference_days' as const,
    publicationKey: 'duration_learning_runtime:wbs_reference_days:facade-v3',
    publicationStatus: 'published',
    sourceEvidenceRefs: ['duration_learning_runtime_publications:wbs-v3'],
    observationContext: {
      artifactKey: 'china-facade-curtain-wall',
      templateId: 'china-facade-curtain-wall',
    },
  },
  {
    assetKey: 'dependency_rule_candidate' as const,
    publicationKey: 'duration_learning_runtime:dependency_rule_candidate:facade-p04-p05',
    publicationStatus: 'published',
    sourceEvidenceRefs: ['duration_learning_runtime_publications:dependency-p04-p05'],
    observationContext: {
      artifactKey: 'facade-p04-p05',
    },
  },
]

describe('durationLearningRuntimeConsumptionService', () => {
  it('builds immutable task consumption rows only from resolver-authorized publications', () => {
    const records = buildGeneratedTemplateRuntimeConsumptions({
      companyId,
      projectId,
      consumerKey: 'projectWizard',
      consumerSurface: 'project_wizard_commit',
      generationBatchId: 'batch-1',
      templateIds: ['china-facade-curtain-wall'],
      rows: [generatedRow([
        {
          assetKey: 'special_work_duration_seed',
          publicationKey: 'duration_learning_runtime:special_work_duration_seed:facade-v2',
          artifactKey: 'china-facade-curtain-wall',
          durationDayBasis: 'construction_production_day',
          appliedDurationDays: 77,
        },
        {
          assetKey: 'wbs_reference_days',
          publicationKey: 'duration_learning_runtime:wbs_reference_days:facade-v3',
          artifactKey: 'china-facade-curtain-wall',
          durationDayBasis: 'construction_production_day',
          appliedDurationDays: 99,
        },
      ])],
      runtimeArtifactPublications,
      subjectType: 'task',
      subjectIdByClientRowId: new Map([['generated-row-1', taskId]]),
    })

    expect(records).toHaveLength(2)
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        companyId,
        projectId,
        taskId,
        baselineItemId: null,
        assetKey: 'special_work_duration_seed',
        artifactKey: 'china-facade-curtain-wall',
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:facade-v2',
        durationDayBasis: 'construction_production_day',
        appliedDurationDays: 77,
      }),
      expect.objectContaining({
        taskId,
        assetKey: 'wbs_reference_days',
        publicationKey: 'duration_learning_runtime:wbs_reference_days:facade-v3',
        appliedDurationDays: 99,
      }),
    ]))
    expect(new Set(records.map((record) => record.consumptionKey)).size).toBe(2)
  })

  it('persists dependency publication consumption with exact predecessor and successor task lineage', () => {
    const predecessorTaskId = '44444444-4444-4444-8444-444444444444'
    const records = buildGeneratedTemplateRuntimeConsumptions({
      companyId,
      projectId,
      consumerKey: 'projectWizard',
      consumerSurface: 'project_wizard_commit',
      generationBatchId: 'batch-dependency',
      rows: [
        generatedRow([], { clientRowId: 'predecessor-row' }),
        generatedRow([], {
          clientRowId: 'successor-row',
          predecessorDependencies: [{
            clientRowId: 'predecessor-row',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'duration_learning_runtime_publication',
            publicationKey: 'duration_learning_runtime:dependency_rule_candidate:facade-p04-p05',
            artifactKey: 'facade-p04-p05',
            publicationStage: 'stable',
            selectionBasis: 'project_stable',
          }],
        }),
      ],
      runtimeArtifactPublications,
      subjectType: 'task',
      subjectIdByClientRowId: new Map([
        ['predecessor-row', predecessorTaskId],
        ['successor-row', taskId],
      ]),
    })

    expect(records).toEqual([expect.objectContaining({
      assetKey: 'dependency_rule_candidate',
      publicationKey: 'duration_learning_runtime:dependency_rule_candidate:facade-p04-p05',
      artifactKey: 'facade-p04-p05',
      taskId,
      appliedDurationDays: null,
      consumptionContext: expect.objectContaining({
        inputTaskIds: [predecessorTaskId, taskId],
      }),
    })])
  })

  it('rejects user-editable metadata that is not backed by the resolver publication set before SQL', async () => {
    const queryExec = vi.fn()

    await expect(persistDurationLearningRuntimeConsumptions({
      queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (
        await queryExec(sql, params)
      ) as T[],
      build: {
        companyId,
        projectId,
        consumerKey: 'wbsTemplateGenerationService',
        consumerSurface: 'task_list_commit',
        generationBatchId: 'batch-untrusted',
        templateIds: ['china-facade-curtain-wall'],
        rows: [generatedRow([{
          assetKey: 'wbs_reference_days',
          publicationKey: 'duration_learning_runtime:wbs_reference_days:forged',
          artifactKey: 'china-facade-curtain-wall',
          durationDayBasis: 'construction_production_day',
          appliedDurationDays: 1,
        }])],
        runtimeArtifactPublications,
        subjectType: 'task',
        subjectIdByClientRowId: new Map([['generated-row-1', taskId]]),
      },
    })).rejects.toMatchObject({
      code: 'DURATION_LEARNING_RUNTIME_CONSUMPTION_AUTHORITY_MISMATCH',
    })
    expect(queryExec).not.toHaveBeenCalled()
  })

  it('persists validated consumptions with publication/artifact scope checks in one statement', async () => {
    const queryExec = vi.fn(async (_sql: string, params: unknown[]) => {
      const rows = JSON.parse(String(params[0])) as Array<{ consumption_key: string }>
      return rows.map((row) => ({ consumption_key: row.consumption_key }))
    })

    const result = await persistDurationLearningRuntimeConsumptions({
      queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (
        await queryExec(sql, params)
      ) as T[],
      build: {
        companyId,
        projectId,
        consumerKey: 'projectWizard',
        consumerSurface: 'project_wizard_commit',
        generationBatchId: 'batch-1',
        templateIds: ['china-facade-curtain-wall'],
        rows: [generatedRow([{
          assetKey: 'wbs_reference_days',
          publicationKey: 'duration_learning_runtime:wbs_reference_days:facade-v3',
          artifactKey: 'china-facade-curtain-wall',
          durationDayBasis: 'construction_production_day',
          appliedDurationDays: 99,
        }])],
        runtimeArtifactPublications,
        subjectType: 'task',
        subjectIdByClientRowId: new Map([['generated-row-1', taskId]]),
      },
    })

    expect(result).toMatchObject({ requestedCount: 1, insertedCount: 1 })
    expect(queryExec).toHaveBeenCalledOnce()
    const sql = String(queryExec.mock.calls[0]?.[0]).toLowerCase()
    expect(sql).toContain('insert into public.duration_learning_runtime_consumptions')
    expect(sql).toContain('join public.duration_learning_runtime_publications')
    expect(sql).toContain('publication.publication_key = requested.publication_key')
    expect(sql).toContain('publication.asset_key = requested.asset_key')
    expect(sql).toContain('publication.artifact_key = requested.artifact_key')
    expect(sql).toContain("publication.publication_stage = 'canary'")
    expect(sql).toContain("publication.monitoring_status in ('pending', 'collecting', 'passed')")
    expect(sql).toContain("publication.publication_stage = 'stable'")
    expect(sql).toContain("publication.monitoring_status = 'passed'")
    expect(sql).toContain("requested.duration_day_basis = 'construction_production_day'")
    expect(sql).toContain('jsonb_array_length($1::jsonb)')
    expect(sql).toContain('on conflict (consumption_key) do nothing')
  })

  it('binds industry publications to the resolver industry identity used by migration 315 RLS', async () => {
    const industryPublication = [{
      ...runtimeArtifactPublications[1],
      observationContext: {
        ...runtimeArtifactPublications[1].observationContext,
        scopeLevel: 'industry',
        industryKey: 'curtain_wall',
      },
    }]
    const records = buildGeneratedTemplateRuntimeConsumptions({
      companyId,
      projectId,
      consumerKey: 'projectWizard',
      consumerSurface: 'project_wizard_commit',
      rows: [generatedRow([{
        assetKey: 'wbs_reference_days',
        publicationKey: 'duration_learning_runtime:wbs_reference_days:facade-v3',
        artifactKey: 'china-facade-curtain-wall',
        durationDayBasis: 'construction_production_day',
        appliedDurationDays: 99,
      }])],
      runtimeArtifactPublications: industryPublication,
      subjectType: 'task',
      subjectIdByClientRowId: new Map([['generated-row-1', taskId]]),
    })

    expect(records[0]?.consumptionContext).toEqual(expect.objectContaining({
      scopeLevel: 'industry',
      industryKey: 'curtain_wall',
    }))

    const queryExec = vi.fn(async (_sql: string, _params: unknown[]) => [])
    await persistDurationLearningRuntimeConsumptions({
      queryExec: queryExec as any,
      build: {
        companyId,
        projectId,
        consumerKey: 'projectWizard',
        consumerSurface: 'project_wizard_commit',
        rows: [generatedRow([{
          assetKey: 'wbs_reference_days',
          publicationKey: 'duration_learning_runtime:wbs_reference_days:facade-v3',
          artifactKey: 'china-facade-curtain-wall',
          durationDayBasis: 'construction_production_day',
          appliedDurationDays: 99,
        }])],
        runtimeArtifactPublications: industryPublication,
        subjectType: 'task',
        subjectIdByClientRowId: new Map([['generated-row-1', taskId]]),
      },
    })
    expect(String(queryExec.mock.calls[0]?.[0])).toContain(
      "publication.industry_key = requested.consumption_context ->> 'industryKey'",
    )
  })

  it('reads task completion lineage only from the trusted consumption table with tenant and project predicates', async () => {
    const queryExec = vi.fn(async (_sql: string, _params: unknown[]) => [{
      consumption_key: 'consumption-1',
      publication_key: 'duration_learning_runtime:wbs_reference_days:facade-v3',
      asset_key: 'wbs_reference_days',
      artifact_key: 'china-facade-curtain-wall',
      consumer_key: 'projectWizard',
      consumer_surface: 'project_wizard_commit',
      duration_day_basis: 'construction_production_day',
      applied_duration_days: 99,
      generation_batch_id: 'batch-1',
      template_id: 'china-facade-curtain-wall',
      consumed_at: '2026-07-19T00:00:00.000Z',
    }])

    const rows = await readTrustedDurationLearningRuntimeConsumptionsForTask({
      queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (
        await queryExec(sql, params)
      ) as T[],
      companyId,
      projectId,
      taskId,
    })

    expect(rows).toEqual([expect.objectContaining({
      assetKey: 'wbs_reference_days',
      publicationKey: 'duration_learning_runtime:wbs_reference_days:facade-v3',
      durationDayBasis: 'construction_production_day',
    })])
    const sql = String(queryExec.mock.calls[0]?.[0]).toLowerCase()
    expect(sql).toContain('from public.duration_learning_runtime_consumptions')
    expect(sql).toContain('company_id = $1::uuid')
    expect(sql).toContain('project_id = $2::uuid')
    expect(sql).toContain('task_id = $3::uuid')
    expect(sql).not.toContain('standard_task_metadata')
  })
})
