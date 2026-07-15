import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const expansionPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'source-expansion',
  'progress-knowledge-source-expansion-candidates.json',
)

const expansionSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'source-expansion',
  'progress-knowledge-source-expansion-seed.sql',
)

describe('external progress knowledge source expansion', () => {
  it('keeps the expanded source catalog broad but source/document scoped', () => {
    expect(existsSync(expansionPath)).toBe(true)
    const dataset = JSON.parse(readFileSync(expansionPath, 'utf8'))
    const sources = dataset.sources ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-source-expansion/v2')
    expect(sources.length).toBeGreaterThanOrEqual(50)
    expect(dataset.ingestionPolicy.mutationBoundary).toContain('source_document_candidates_only')
    expect(dataset.ingestionPolicy.currentPhase).toContain('source_catalog_expansion_before_candidate_extraction')
    expect(dataset.ingestionPolicy.candidatePromotion).toContain('publication_readiness')
    expect(dataset.ingestionPolicy.searchLeadBoundary).toContain('not_calibration_inputs')

    expect(new Set(sources.map((source: any) => source.priority))).toEqual(new Set(['P0', 'P1', 'P2']))
    expect(sources.some((source: any) => source.connectorType === 'public_quota')).toBe(true)
    expect(sources.some((source: any) => source.connectorType === 'enterprise_manual')).toBe(true)
    expect(sources.some((source: any) => source.connectorType === 'web_knowledge_base')).toBe(true)
    expect(sources.some((source: any) => source.sourceCategory === 'official_duration_quota')).toBe(true)
    expect(sources.some((source: any) => source.sourceCategory === 'official_duration_quota_search_lead')).toBe(true)
    expect(sources.some((source: any) => source.sourceCategory === 'enterprise_epc_plan_control_manual')).toBe(true)
    expect(
      sources.some((source: any) => source.sourceCategory === 'infrastructure_progress_control_manual'),
    ).toBe(true)
    expect(sources.some((source: any) => source.sourceCategory === 'product_knowledge_reference')).toBe(true)
    expect(sources.some((source: any) => source.sourceTier.includes('search_lead'))).toBe(true)
    expect(sources.some((source: any) => source.sourceTier.includes('official'))).toBe(true)

    expect(dataset.summary.officialOrRegulatorySources).toBeGreaterThanOrEqual(20)
    expect(dataset.summary.enterpriseSources).toBeGreaterThanOrEqual(18)
    expect(dataset.summary.infrastructureSources).toBeGreaterThanOrEqual(6)
    expect(dataset.summary.directUrlSources).toBeGreaterThanOrEqual(25)

    for (const source of sources) {
      expect(source.sourceKey).toBeTruthy()
      expect(source.documentKey).toBeTruthy()
      expect(source.assetFocus.length).toBeGreaterThan(0)
      expect(source.recommendedNextAction).toBeTruthy()
      expect(source.riskBoundary).toBeTruthy()
      expect(source.discoveryQuery).toBeTruthy()
      expect(source.verificationStatus).toBeTruthy()
      expect(source.sourceAccessStatus).toBeTruthy()
    }
  })

  it('does not let product knowledge pages become duration value sources', () => {
    const dataset = JSON.parse(readFileSync(expansionPath, 'utf8'))
    const productSources = dataset.sources.filter((source: any) =>
      ['product_knowledge_reference', 'product_case_reference'].includes(source.sourceCategory),
    )

    expect(productSources.length).toBeGreaterThanOrEqual(10)
    for (const source of productSources) {
      expect(source.extractionReadiness).toBe('capability_reference_only_not_duration_value_source')
      expect(source.riskBoundary).toContain('not')
      expect(source.riskBoundary).toContain('duration')
      expect(source.priority).toBe('P2')
    }
  })

  it('emits source/document seed SQL without candidate or business fact writes', () => {
    expect(existsSync(expansionSqlPath)).toBe(true)
    const seedSql = readFileSync(expansionSqlPath, 'utf8')

    expect(seedSql).toContain('INSERT INTO public.progress_knowledge_sources')
    expect(seedSql).toContain('INSERT INTO public.progress_knowledge_documents')
    expect(seedSql).toContain('ON CONFLICT')
    expect(seedSql).toContain('source_document_candidates_only_no_duration_seed_no_business_fact_write')

    for (const forbiddenTable of [
      'public.progress_asset_candidates',
      'public.progress_asset_calibration_results',
      'public.progress_asset_publication_readiness',
      'public.duration_experience_samples',
      'public.tasks',
      'public.task_baselines',
      'public.monthly_plans',
      'public.monthly_plan_items',
      'public.task_dependencies',
      'public.actual_duration_outcomes',
      'public.critical_path',
    ]) {
      expect(seedSql).not.toContain(`INSERT INTO ${forbiddenTable}`)
      expect(seedSql).not.toContain(`UPDATE ${forbiddenTable}`)
    }
  })
})
