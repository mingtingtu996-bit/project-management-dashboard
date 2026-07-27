import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { readWbsTemplateGenerationImplementationSource } from './helpers/wbsTemplateGenerationSource.js'

const serverRoot = fileURLToPath(new URL('../..', import.meta.url))

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('duration learning runtime consumption writer contracts', () => {
  it('writes wizard task lineage and durable evidence before the wizard transaction commits', () => {
    const wizard = source('../routes/projectWizard.ts')
    const persistIndex = wizard.indexOf('await persistDurationLearningRuntimeConsumptions({')
    const observationIndex = wizard.indexOf('await recordWbsTemplateGenerationRuntimeConsumption({')
    const dependencyWriteIndex = wizard.indexOf('await replaceWizardGeneratedTaskDependenciesBatch({')
    const durableEvidenceIndex = wizard.indexOf('await enqueueDurationLearningRuntimeEvidenceBatch({', persistIndex)
    const commitIndex = wizard.indexOf("await transactionClient.query('COMMIT')", persistIndex)

    expect(wizard).toContain('runtimePublicationQueryExec: durationLearningRuntimeQueryExec')
    expect(wizard).toContain('runtimeArtifactPublications,')
    expect(wizard).toContain("consumerKey: 'projectWizard'")
    expect(wizard).toContain("consumerSurface: 'project_wizard_commit'")
    expect(wizard).toContain("subjectType: 'task'")
    expect(wizard).toContain('inputTaskIds: [...idByClientRowId.values()]')
    expect(observationIndex).toBeGreaterThan(0)
    expect(dependencyWriteIndex).toBeGreaterThan(0)
    expect(observationIndex).toBeGreaterThan(dependencyWriteIndex)
    expect(persistIndex).toBeGreaterThan(observationIndex)
    expect(durableEvidenceIndex).toBeGreaterThan(persistIndex)
    expect(commitIndex).toBeGreaterThan(durableEvidenceIndex)
    expect(commitIndex).toBeGreaterThan(persistIndex)
    expect(wizard.indexOf('await recordWbsTemplateCandidateEvent({', commitIndex)).toBe(-1)
    expect(wizard).toContain('durationCandidateNodes: buildSpecialWorkDurationCandidateNodes(generatedRows)')
  })

  it('writes task-list lineage and durable evidence inside the existing request transaction', () => {
    const tasks = source('../routes/tasks.ts')
    const transactionIndex = tasks.indexOf('await withDatabaseTransaction(async () => {')
    const persistIndex = tasks.indexOf('await persistDurationLearningRuntimeConsumptions({', transactionIndex)
    const durableEvidenceIndex = tasks.indexOf('await enqueueDurationLearningRuntimeEvidenceBatch({', persistIndex)

    expect(tasks).toContain('runtimePublicationQueryExec: durationLearningRuntimeQueryExec')
    expect(tasks).toContain("consumerSurface: 'task_list_commit'")
    expect(tasks).toContain("subjectType: 'task'")
    expect(tasks).toContain('inputTaskIds: [...generatedIdByClientRowId.values()]')
    expect(persistIndex).toBeGreaterThan(transactionIndex)
    expect(durableEvidenceIndex).toBeGreaterThan(persistIndex)
    expect(tasks).not.toContain("registerDatabasePostCommitEffect('record_wbs_template_candidate_event'")
    expect(tasks).toContain('durationCandidateNodes: buildSpecialWorkDurationCandidateNodes(generatedRows)')
  })

  it('reuses the exact baseline generation result for rows, observations, lineage, and candidates', () => {
    const baseline = source('../routes/task-baselines.ts')
    const expandIndex = baseline.indexOf('const expandedTemplateOperations = await expandBaselineTemplateGenerateOperations(')
    const persistIndex = baseline.indexOf('await persistDurationLearningRuntimeConsumptions({', expandIndex)
    const durableEvidenceIndex = baseline.indexOf('await enqueueDurationLearningRuntimeEvidenceBatch({', persistIndex)
    const commitIndex = baseline.indexOf("await client.query('COMMIT')", persistIndex)

    expect(baseline).toContain('const generationContexts: Array<{')
    expect(baseline).toContain('runtimePublicationQueryExec,')
    expect(baseline).toContain('const generated = generationContext.generated')
    expect(baseline).toContain("consumerSurface: 'baseline_commit'")
    expect(baseline).toContain("subjectType: 'baseline_item'")
    expect(baseline).toContain('subjectIdByClientRowId: tempIdMap')
    expect(baseline.indexOf('await recordWbsTemplateGenerationRuntimeConsumption({', expandIndex)).toBe(-1)
    expect(persistIndex).toBeGreaterThan(expandIndex)
    expect(durableEvidenceIndex).toBeGreaterThan(persistIndex)
    expect(commitIndex).toBeGreaterThan(durableEvidenceIndex)
    expect(baseline.indexOf('await recordWbsTemplateCandidateEvent({', commitIndex)).toBe(-1)
  })

  it('materializes default-master-plan baseline lineage and durable evidence in one transaction', () => {
    const route = source('../routes/wbs-templates.ts')
    const materializeIndex = route.indexOf('const items = materializeGeneratedTemplateRowsToBaselineItems({')
    const beforeCommitHookIndex = route.indexOf('await params.beforeCommit({ queryExec, baselineId, items })', materializeIndex)
    const commitIndex = route.indexOf("await client.query('COMMIT')", beforeCommitHookIndex)
    const callbackIndex = route.indexOf('beforeCommit: async ({ queryExec, items }) => {', commitIndex)
    const persistIndex = route.indexOf('await persistDurationLearningRuntimeConsumptions({', callbackIndex)
    const durableEvidenceIndex = route.indexOf('await enqueueDurationLearningRuntimeEvidenceBatch({', persistIndex)

    expect(route).toContain('runtimeArtifactPublications,')
    expect(route).toContain("consumerSurface: 'default_master_plan_baseline_draft'")
    expect(route).toContain("subjectType: 'baseline_item'")
    expect(beforeCommitHookIndex).toBeGreaterThan(materializeIndex)
    expect(commitIndex).toBeGreaterThan(beforeCommitHookIndex)
    expect(callbackIndex).toBeGreaterThan(commitIndex)
    expect(persistIndex).toBeGreaterThan(callbackIndex)
    expect(durableEvidenceIndex).toBeGreaterThan(persistIndex)
  })

  it('keeps every WBS preview/replay call no-write and reserves recording for trusted materialization writers', () => {
    const generation = readWbsTemplateGenerationImplementationSource(serverRoot)
    const suggestion = source('../services/durationSuggestionService.ts')
    const previewRoute = source('../routes/wbs-templates.ts')
    const wizard = source('../routes/projectWizard.ts')
    const tasks = source('../routes/tasks.ts')
    const baseline = source('../routes/task-baselines.ts')
    const suggestionCalls = [...generation.matchAll(/getTaskDurationSuggestion\(\{([\s\S]*?)\}\)/g)]

    expect(suggestion).toContain("return input.runtimeEvidenceMode === 'record'")
    expect(suggestion).toContain("if (input.runtimeEvidenceMode === 'record') {")
    expect(generation).toContain('runtimePublicationQueryExec?: DurationLearningRuntimePublicationQueryExec | null')
    expect(generation).toContain("runtimeEvidenceMode?: 'record' | 'no_write'")
    expect(generation).toContain("if (params.runtimeEvidenceMode === 'record' && params.runtimeConsumerObservationQueryExec) {")
    expect(suggestionCalls.length).toBeGreaterThan(0)
    expect(suggestionCalls.every((call) => call[1]?.includes('runtimeEvidenceMode: params.runtimeEvidenceMode'))).toBe(true)
    expect(previewRoute).toContain("runtimeEvidenceMode: 'no_write'")
    expect(wizard).toContain("runtimeEvidenceMode: 'no_write'")
    expect(tasks).toContain("runtimeEvidenceMode: 'no_write'")
    expect(baseline).toContain("runtimeEvidenceMode: 'no_write'")
    expect(previewRoute).not.toContain("runtimeEvidenceMode: 'record'")
    expect(wizard).not.toContain("runtimeEvidenceMode: 'record'")
    expect(tasks).not.toContain("runtimeEvidenceMode: 'record'")
    expect(baseline).not.toContain("runtimeEvidenceMode: 'record'")
  })
})
