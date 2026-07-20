import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('duration learning runtime consumption writer contracts', () => {
  it('writes wizard task lineage and observations before the wizard transaction commits', () => {
    const wizard = source('../routes/projectWizard.ts')
    const persistIndex = wizard.indexOf('await persistDurationLearningRuntimeConsumptions({')
    const observationIndex = wizard.indexOf('await recordWbsTemplateGenerationRuntimeConsumption({')
    const commitIndex = wizard.indexOf("await transactionClient.query('COMMIT')", persistIndex)
    const candidateIndex = wizard.indexOf('await recordWbsTemplateCandidateEvent({', commitIndex)

    expect(wizard).toContain('runtimePublicationQueryExec: durationLearningRuntimeQueryExec')
    expect(wizard).toContain('runtimeArtifactPublications,')
    expect(wizard).toContain("consumerKey: 'projectWizard'")
    expect(wizard).toContain("consumerSurface: 'project_wizard_commit'")
    expect(wizard).toContain("subjectType: 'task'")
    expect(wizard).toContain('inputTaskIds: [...idByClientRowId.values()]')
    expect(observationIndex).toBeGreaterThan(0)
    expect(persistIndex).toBeGreaterThan(observationIndex)
    expect(commitIndex).toBeGreaterThan(persistIndex)
    expect(candidateIndex).toBeGreaterThan(commitIndex)
    expect(wizard).toContain('durationCandidateNodes: buildSpecialWorkDurationCandidateNodes(generatedRows)')
  })

  it('writes task-list lineage inside the existing request transaction and defers only candidate reporting', () => {
    const tasks = source('../routes/tasks.ts')
    const transactionIndex = tasks.indexOf('await withDatabaseTransaction(async () => {')
    const persistIndex = tasks.indexOf('await persistDurationLearningRuntimeConsumptions({', transactionIndex)
    const candidateEffectIndex = tasks.indexOf("registerDatabasePostCommitEffect('record_wbs_template_candidate_event'", persistIndex)

    expect(tasks).toContain('runtimePublicationQueryExec: durationLearningRuntimeQueryExec')
    expect(tasks).toContain("consumerSurface: 'task_list_commit'")
    expect(tasks).toContain("subjectType: 'task'")
    expect(tasks).toContain('inputTaskIds: [...generatedIdByClientRowId.values()]')
    expect(persistIndex).toBeGreaterThan(transactionIndex)
    expect(candidateEffectIndex).toBeGreaterThan(persistIndex)
    expect(tasks).toContain('durationCandidateNodes: buildSpecialWorkDurationCandidateNodes(generatedRows)')
  })

  it('reuses the exact baseline generation result for rows, observations, lineage, and candidates', () => {
    const baseline = source('../routes/task-baselines.ts')
    const expandIndex = baseline.indexOf('const expandedTemplateOperations = await expandBaselineTemplateGenerateOperations(')
    const persistIndex = baseline.indexOf('await persistDurationLearningRuntimeConsumptions({', expandIndex)
    const candidateIndex = baseline.indexOf('await recordWbsTemplateCandidateEvent({', persistIndex)

    expect(baseline).toContain('const generationContexts: Array<{')
    expect(baseline).toContain('runtimePublicationQueryExec,')
    expect(baseline).toContain('const generated = generationContext.generated')
    expect(baseline).toContain("consumerSurface: 'baseline_commit'")
    expect(baseline).toContain("subjectType: 'baseline_item'")
    expect(baseline).toContain('subjectIdByClientRowId: tempIdMap')
    expect(baseline).toContain('inputTaskIds: generated.rows')
    expect(persistIndex).toBeGreaterThan(expandIndex)
    expect(candidateIndex).toBeGreaterThan(persistIndex)
  })

  it('keeps every WBS preview/replay call no-write and reserves recording for trusted materialization writers', () => {
    const generation = source('../services/wbsTemplateGenerationService.ts')
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
  })
})
