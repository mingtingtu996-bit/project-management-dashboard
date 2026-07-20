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

  it('persists physical lineage for base and standard duration applications used by prediction evidence', () => {
    const basePublication = {
      assetKey: 'base_duration_benchmark' as const,
      publicationKey: 'duration_learning_runtime:base_duration_benchmark:concrete-v1',
      publicationStatus: 'published',
      sourceEvidenceRefs: ['duration_benchmarks:concrete-v1'],
      observationContext: {
        artifactKey: 'SW-CONCRETE:process:all',
        scopeLevel: 'project',
      },
    }
    const standardPublication = {
      assetKey: 'standard_work_duration_seed' as const,
      publicationKey: 'duration_learning_runtime:standard_work_duration_seed:concrete-v1',
      publicationStatus: 'published',
      sourceEvidenceRefs: ['standard_work_duration_seed:concrete-v1'],
      observationContext: {
        artifactKey: 'SW-CONCRETE',
        scopeLevel: 'project',
      },
    }
    const records = buildGeneratedTemplateRuntimeConsumptions({
      companyId,
      projectId,
      consumerKey: 'projectWizard',
      consumerSurface: 'project_wizard_commit',
      generationBatchId: 'batch-prediction-lineage',
      rows: [generatedRow([
        {
          assetKey: basePublication.assetKey,
          publicationKey: basePublication.publicationKey,
          artifactKey: 'SW-CONCRETE:process:all',
          durationDayBasis: 'construction_production_day',
          appliedDurationDays: 8,
        },
        {
          assetKey: standardPublication.assetKey,
          publicationKey: standardPublication.publicationKey,
          artifactKey: 'SW-CONCRETE',
          durationDayBasis: 'construction_production_day',
          appliedDurationDays: 8,
        },
      ])],
      runtimeArtifactPublications: [basePublication, standardPublication],
      subjectType: 'task',
      subjectIdByClientRowId: new Map([['generated-row-1', taskId]]),
    })

    expect(records.map((record) => record.assetKey)).toEqual([
      'base_duration_benchmark',
      'standard_work_duration_seed',
    ])
    expect(records.every((record) => record.generationBatchId === 'batch-prediction-lineage')).toBe(true)
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
      generationBatchId: 'batch-dependency',
      appliedDurationDays: null,
      sourceEvidenceRefs: expect.arrayContaining([
        'duration_learning_runtime_publications:duration_learning_runtime:dependency_rule_candidate:facade-p04-p05',
      ]),
      consumptionContext: expect.objectContaining({
        inputTaskIds: [predecessorTaskId, taskId],
        authoritySource: 'runtime_resolver_publication_set',
      }),
    })])
  })

  it('does not send caller-asserted dependency input tasks to the authoritative RPC', async () => {
    const predecessorTaskId = '44444444-4444-4444-8444-444444444444'
    const queryExec = vi.fn(async (_sql: string, params: unknown[]) => {
      const rows = JSON.parse(String(params[0])) as Array<Record<string, unknown>>
      return rows.map((_, index) => ({ consumption_key: `database-derived-dependency-${index + 1}` }))
    })

    await persistDurationLearningRuntimeConsumptions({
      queryExec: queryExec as any,
      build: {
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
      },
    })

    const requestedRows = JSON.parse(String(queryExec.mock.calls[0]?.[1]?.[0])) as Array<Record<string, any>>
    expect(requestedRows[0]?.consumption_context).not.toHaveProperty('inputTaskIds')
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
      const rows = JSON.parse(String(params[0])) as Array<Record<string, unknown>>
      return rows.map((_, index) => ({ consumption_key: `database-derived-consumption-${index + 1}` }))
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
    expect(result.consumptionKeys).toEqual(['database-derived-consumption-1'])
    expect(queryExec).toHaveBeenCalledOnce()
    const sql = String(queryExec.mock.calls[0]?.[0]).toLowerCase()
    expect(sql).toContain('public.persist_duration_learning_runtime_consumptions($1::jsonb)')
    expect(sql).not.toContain('insert into public.duration_learning_runtime_consumptions (')
    const requestedRows = JSON.parse(String(queryExec.mock.calls[0]?.[1]?.[0])) as Array<Record<string, unknown>>
    expect(requestedRows[0]).not.toHaveProperty('source_evidence_refs')
    expect(requestedRows[0]).not.toHaveProperty('consumed_at')
    expect(requestedRows[0]).not.toHaveProperty('consumption_key')
    expect(requestedRows[0]).not.toHaveProperty('template_id')
    expect(requestedRows[0]?.consumption_context).not.toHaveProperty('authoritySource')
    expect(requestedRows[0]?.consumption_context).not.toHaveProperty('scopeLevel')
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
      generationBatchId: 'batch-industry',
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

    const queryExec = vi.fn(async (_sql: string, _params: unknown[]) => [{ consumption_key: 'database-derived-industry-consumption' }])
    await persistDurationLearningRuntimeConsumptions({
      queryExec: queryExec as any,
      build: {
        companyId,
        projectId,
        consumerKey: 'projectWizard',
        consumerSurface: 'project_wizard_commit',
        generationBatchId: 'batch-industry',
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
    expect(String(queryExec.mock.calls[0]?.[0])).toContain('public.persist_duration_learning_runtime_consumptions')
    const requestedRows = JSON.parse(String(queryExec.mock.calls[0]?.[1]?.[0])) as Array<Record<string, any>>
    expect(requestedRows[0]?.consumption_context?.industryKey).toBe('curtain_wall')
  })

  it('reads task completion lineage only from the trusted consumption table with tenant and project predicates', async () => {
    const queryExec = vi.fn(async (_sql: string, _params: unknown[]) => [{
      company_id: companyId,
      project_id: projectId,
      task_id: taskId,
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
      source_evidence_refs: [
        'duration_learning_runtime_publications:duration_learning_runtime:wbs_reference_days:facade-v3',
      ],
      consumption_context: { authoritySource: 'runtime_resolver_publication_set' },
      publication_stage: 'stable',
      monitoring_status: 'passed',
      publication_scope_level: 'project',
      publication_company_id: companyId,
      publication_project_id: projectId,
      publication_industry_key: null,
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
    expect(sql).toContain('join public.duration_learning_runtime_publications')
    expect(sql).toContain('consumption.company_id = $1::uuid')
    expect(sql).toContain('consumption.project_id = $2::uuid')
    expect(sql).toContain('consumption.task_id = $3::uuid')
    expect(sql).toContain("publication.monitoring_status in ('pending', 'collecting', 'passed')")
    expect(sql).toContain("publication.monitoring_status = 'passed'")
    expect(sql).toContain("consumption.consumption_context ->> 'authoritysource'")
    expect(sql).toContain("'duration_learning_runtime_publications:' || consumption.publication_key")
    expect(sql).not.toContain('standard_task_metadata')
  })

  it('filters failed, rollback-pending, superseded, and forged consumption rows at readback', async () => {
    const publicationKey = 'duration_learning_runtime:wbs_reference_days:facade-v3'
    const trusted = {
      company_id: companyId,
      project_id: projectId,
      task_id: taskId,
      consumption_key: 'trusted-consumption',
      publication_key: publicationKey,
      asset_key: 'wbs_reference_days',
      artifact_key: 'china-facade-curtain-wall',
      consumer_key: 'projectWizard',
      consumer_surface: 'project_wizard_commit',
      duration_day_basis: 'construction_production_day',
      applied_duration_days: 99,
      generation_batch_id: 'batch-1',
      template_id: 'china-facade-curtain-wall',
      source_evidence_refs: [`duration_learning_runtime_publications:${publicationKey}`],
      consumption_context: { authoritySource: 'runtime_resolver_publication_set' },
      publication_stage: 'stable',
      monitoring_status: 'passed',
      publication_scope_level: 'project',
      publication_company_id: companyId,
      publication_project_id: projectId,
      publication_industry_key: null,
      consumed_at: '2026-07-19T00:00:00.000Z',
    }
    const queryExec = vi.fn(async () => [
      trusted,
      { ...trusted, consumption_key: 'failed', publication_stage: 'canary', monitoring_status: 'failed' },
      { ...trusted, consumption_key: 'rollback-pending', publication_stage: 'canary', monitoring_status: 'rollback_pending' },
      { ...trusted, consumption_key: 'superseded', publication_stage: 'superseded', monitoring_status: 'passed' },
      { ...trusted, consumption_key: 'forged-ref', source_evidence_refs: ['tasks:forged'] },
      { ...trusted, consumption_key: 'forged-authority', consumption_context: { authoritySource: 'task_json' } },
    ])

    const rows = await readTrustedDurationLearningRuntimeConsumptionsForTask({
      queryExec: queryExec as any,
      companyId,
      projectId,
      taskId,
    })

    expect(rows.map((row) => row.consumptionKey)).toEqual(['trusted-consumption'])
  })
})
