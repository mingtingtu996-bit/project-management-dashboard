import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
const extractionReviewScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-extraction-review.mjs',
)

const reviewPackagePath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'extraction-review',
  'progress-knowledge-extraction-review-package.json',
)
const reviewReportPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'extraction-review',
  'progress-knowledge-extraction-review-report.md',
)
const forbiddenSeedPath = resolve(
  workspaceRoot,
  'project-search',
  'external-duration-research',
  'extraction-review',
  'progress-knowledge-extraction-review-seed.sql',
)

const progressKnowledgeBuildTimeoutMs = 120_000

describe('external progress knowledge extraction review package', () => {
  beforeAll(() => {
    if (!existsSync(extractionReviewScript)) return

    execFileSync('node', [sourceExpansionScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [sourceVerificationScript], { cwd: workspaceRoot, stdio: 'pipe' })
    execFileSync('node', [extractionReviewScript], { cwd: workspaceRoot, stdio: 'pipe' })
  }, progressKnowledgeBuildTimeoutMs)

  it('builds a PDF-backed extraction review package only from verified and hashed documents', () => {
    expect(existsSync(extractionReviewScript)).toBe(true)
    expect(existsSync(reviewPackagePath)).toBe(true)
    expect(existsSync(reviewReportPath)).toBe(true)

    const dataset = JSON.parse(readFileSync(reviewPackagePath, 'utf8'))
    const documents = dataset.documents ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-extraction-review/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe('verified_document_extraction_review_before_candidate_assets')
    expect(dataset.ingestionPolicy.mutationBoundary).toContain('extraction_review_only')
    expect(dataset.ingestionPolicy.forbiddenWrites).toEqual(expect.arrayContaining([
      'progress_asset_candidates',
      'progress_asset_calibration_results',
      'progress_asset_publication_readiness',
      'duration_experience_samples',
      'task_dependencies',
    ]))

    expect(documents.length).toBeGreaterThanOrEqual(4)
    expect(dataset.summary.reviewDocumentCount).toBe(documents.length)
    expect(dataset.summary.reviewPackageReadyCount).toBe(documents.length)
    expect(Object.values(dataset.summary.bySource).reduce((sum: number, count: unknown) => (
      sum + Number(count)
    ), 0)).toBe(documents.length)
    expect(documents.map((document: { sourceKey: string }) => document.sourceKey)).toEqual(expect.arrayContaining([
      'beijing_2018_construction_duration_quota',
      'guangdong_2022_construction_duration_quota',
      'jiangsu_2026_construction_duration_quota',
    ]))
    expect(dataset.summary.pdfProbeSucceededCount).toBeGreaterThanOrEqual(3)

    for (const document of documents) {
      expect(document.sourceVerification.status).toBe('verified_origin_url')
      expect(document.downloadHash.sha256).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(document.sourceExtractionQuality.status).toBe('ready_for_candidate_extraction')
      expect(document.reviewStatus).toBe('review_package_ready')
      expect(document.pdfProbe.pageCount).toBeGreaterThan(0)
      expect(document.pdfProbe.probeStatus).toMatch(/pdf_probe_(succeeded|partial)/)
      expect(document.extractionUnits.length).toBeGreaterThan(0)

      for (const unit of document.extractionUnits) {
        expect(unit.sourceHash).toBe(document.downloadHash.sha256)
        expect(unit.artifactPath).toBe(document.downloadHash.artifactPath)
        expect(unit.pageLocator.pageStart).toBeGreaterThan(0)
        expect(unit.pageLocator.pageEnd).toBeGreaterThanOrEqual(unit.pageLocator.pageStart)
        expect(unit.tableLocator.label).toBeTruthy()
        expect(unit.extractionMethod).toContain('pdfplumber')
        expect(unit.reviewStatus).toBe('requires_human_table_validation')
        expect(unit.candidatePromotion).toBe('blocked_until_table_cells_validated')
        expect(unit.cellEvidence.length).toBeGreaterThan(0)

        for (const cell of unit.cellEvidence) {
          expect(cell.sourceHash).toBe(document.downloadHash.sha256)
          expect(cell.page).toBeGreaterThan(0)
          expect(cell.field).toBeTruthy()
          expect(cell.rawText).toBeTruthy()
          expect(cell.quality).toMatch(/^(probe|needs_review)$/)
        }
      }
    }
  })

  it('does not emit candidate or publication-readiness SQL from extraction review', () => {
    expect(existsSync(extractionReviewScript)).toBe(true)
    expect(existsSync(forbiddenSeedPath)).toBe(false)

    const report = readFileSync(reviewReportPath, 'utf8')
    expect(report).toContain('verified_document_extraction_review_before_candidate_assets')
    expect(report).toContain('blocked_until_table_cells_validated')
    expect(report).not.toContain('INSERT INTO public.progress_asset_candidates')
    expect(report).not.toContain('INSERT INTO public.progress_asset_publication_readiness')
  })
})
