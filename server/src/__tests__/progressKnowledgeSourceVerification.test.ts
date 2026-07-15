import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const sourceExpansionScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-source-expansion.mjs',
)

const sourceVerificationScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-source-verification.mjs',
)

const verificationPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'source-verification',
  'progress-knowledge-source-verification-package.json',
)

const verificationSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'source-verification',
  'progress-knowledge-source-verification-seed.sql',
)

describe('external progress knowledge source verification package', () => {
  beforeAll(() => {
    execFileSync('node', [sourceExpansionScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [sourceVerificationScript], { cwd: workspaceRoot, stdio: 'pipe' })
  })

  it('stops at source verification, download hash, and extraction quality before candidate assets', () => {
    expect(existsSync(verificationPath)).toBe(true)
    const dataset = JSON.parse(readFileSync(verificationPath, 'utf8'))
    const documents = dataset.documents ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-source-verification/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe('source_verification_download_hash_extraction_quality_before_candidate_assets')
    expect(dataset.ingestionPolicy.nextPhase).toContain('candidate_assets_after_verified_documents_only')
    expect(dataset.ingestionPolicy.mutationBoundary).toContain('source_document_quality_only')
    expect(dataset.ingestionPolicy.forbiddenWrites).toEqual(expect.arrayContaining([
      'progress_asset_candidates',
      'progress_asset_calibration_results',
      'progress_asset_publication_readiness',
      'duration_experience_samples',
      'tasks',
      'task_dependencies',
    ]))

    expect(documents.length).toBeGreaterThanOrEqual(20)
    expect(documents.some((document: any) => document.sourceVerification.status === 'verified_origin_url')).toBe(true)
    expect(documents.some((document: any) => document.downloadHash.sha256?.startsWith('sha256:'))).toBe(true)
    expect(documents.some((document: any) => document.downloadHash.status === 'download_or_artifact_required')).toBe(true)
    expect(documents.some((document: any) => document.extractionQuality.status === 'ready_for_candidate_extraction')).toBe(true)
    expect(documents.some((document: any) => document.extractionQuality.status === 'ready_for_clause_or_sequence_review')).toBe(true)
    expect(documents.some((document: any) => document.extractionQuality.status === 'source_notice_only_attachment_followup_required')).toBe(true)
    expect(documents.some((document: any) => document.extractionQuality.status === 'needs_table_extraction_review')).toBe(true)
    expect(documents.some((document: any) => document.extractionQuality.status === 'not_duration_value_source')).toBe(true)

    const cscecOfficialClauseSource = documents.find(
      (document: any) => document.sourceKey === 'cscec4_zhuhai_duration_warning_management_case_2017',
    )
    expect(cscecOfficialClauseSource?.sourceVerification.status).toBe('verified_origin_url')
    expect(cscecOfficialClauseSource?.sourceVerification.trustedForDurationValues).toBe(false)
    expect(cscecOfficialClauseSource?.extractionQuality.status).toBe('ready_for_clause_or_sequence_review')

    const cscecOfficialProjectSource = documents.find(
      (document: any) => document.sourceKey === 'cscec_malaysia_data_center_fast_delivery_case_2023',
    )
    expect(cscecOfficialProjectSource?.sourceVerification.status).toBe('verified_origin_url')
    expect(cscecOfficialProjectSource?.sourceVerification.trustedForDurationValues).toBe(false)
    expect(cscecOfficialProjectSource?.extractionQuality.status).toBe('ready_for_field_review')

    for (const document of documents) {
      expect(document.sourceKey).toBeTruthy()
      expect(document.documentKey).toBeTruthy()
      expect(document.sourceVerification.status).toBeTruthy()
      expect(document.downloadHash.status).toBeTruthy()
      expect(document.extractionQuality.status).toBeTruthy()
      expect(document.nextAction).toBeTruthy()

      if (document.sourceVerification.status !== 'verified_origin_url') {
        expect(document.extractionQuality.status).not.toBe('ready_for_candidate_extraction')
      }

      if (document.extractionQuality.status === 'ready_for_candidate_extraction') {
        expect(document.downloadHash.sha256).toMatch(/^sha256:[a-f0-9]{64}$/)
      }
    }
  })

  it('emits source/document quality SQL only and keeps candidates/readiness out of this step', () => {
    expect(existsSync(verificationSqlPath)).toBe(true)
    const seedSql = readFileSync(verificationSqlPath, 'utf8')

    expect(seedSql).toContain('INSERT INTO public.progress_knowledge_sources')
    expect(seedSql).toContain('INSERT INTO public.progress_knowledge_documents')
    expect(seedSql).toContain('source_document_quality_only_no_candidate_or_readiness_write')
    expect(seedSql).toContain('sha256:')
    expect(seedSql).toContain('source_verification_download_hash_extraction_quality_before_candidate_assets')

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

    const allowedConnectorTypes = new Set([
      'external_pdf',
      'public_quota',
      'enterprise_manual',
      'internal_knowledge_base',
      'web_knowledge_base',
      'api_connector',
      'spreadsheet',
    ])
    const allowedExtractionStatuses = new Set([
      'indexed',
      'text_extracted',
      'table_extracted',
      'needs_ocr',
      'needs_table_extraction_review',
      'failed',
    ])
    const allowedExtractionQualities = new Set(['high', 'medium', 'low', 'unknown'])

    for (const connectorType of seedSql.matchAll(/connector_type[^\n]*[\s\S]*?\n  '([^']+)',\n  'public'/g)) {
      expect(allowedConnectorTypes.has(connectorType[1])).toBe(true)
    }
    for (const extractionStatus of seedSql.matchAll(/\n  '([^']+)',\n  '([^']+)',\n  \{/g)) {
      expect(allowedExtractionStatuses.has(extractionStatus[1])).toBe(true)
      expect(allowedExtractionQualities.has(extractionStatus[2])).toBe(true)
    }
  })
})
