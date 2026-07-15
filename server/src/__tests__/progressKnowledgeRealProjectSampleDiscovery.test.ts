import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const discoveryScript = resolve(
  workspaceRoot,
  'project-search',
  'tools',
  'build-progress-knowledge-real-project-sample-discovery.mjs',
)

const discoveryPackagePath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'progress-knowledge-real-project-sample-discovery-package.json',
)

const discoveryReportPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'progress-knowledge-real-project-sample-discovery-report.md',
)

const discoveryNoopSqlPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'progress-knowledge-real-project-sample-discovery-noop.sql',
)

const discoverySearchLogPath = resolve(
  workspaceRoot,
  'project-search',
  'public-project-data',
  'real-project-sample-discovery',
  'progress-knowledge-real-project-sample-discovery-search-log.md',
)

describe('external progress knowledge real project sample discovery package', () => {
  beforeAll(() => {
    expect(existsSync(discoveryScript)).toBe(true)
    execFileSync('node', [discoveryScript], { cwd: workspaceRoot, stdio: 'pipe' })
  })

  it('builds a source-hashed real project sample review package before runtime sample review', () => {
    expect(existsSync(discoveryPackagePath)).toBe(true)
    expect(existsSync(discoveryReportPath)).toBe(true)

    const dataset = JSON.parse(readFileSync(discoveryPackagePath, 'utf8'))
    const samples = dataset.sampleCandidates ?? []

    expect(dataset.schemaVersion).toBe('progress-knowledge-real-project-sample-discovery/v1')
    expect(dataset.ingestionPolicy.currentPhase).toBe('real_project_sample_discovery_before_runtime_sample_review')
    expect(dataset.ingestionPolicy.mutationBoundary).toBe('sample_candidate_only_no_replay_or_readiness_write')
    expect(dataset.ingestionPolicy.nextPhase).toContain('runtime_sample_candidate_review_after_user_source_and_field_review')
    expect(dataset.ingestionPolicy.forbiddenWrites).toEqual(expect.arrayContaining([
      'progress_asset_publication_readiness',
      'duration_experience_samples',
      'tasks',
      'task_baselines',
      'monthly_plans',
      'task_dependencies',
      'actual_duration_outcomes',
      'critical_path',
    ]))

    expect(dataset.summary.sourceDocumentCount).toBeGreaterThanOrEqual(5)
    expect(dataset.summary.hashedDocumentCount).toBeGreaterThanOrEqual(5)
    expect(dataset.summary.sampleCandidateCount).toBeGreaterThanOrEqual(10)
    expect(dataset.summary.strongActualDurationSampleCount).toBeGreaterThanOrEqual(8)
    expect(dataset.summary.byProjectCategory.building_engineering).toBeGreaterThanOrEqual(6)
    expect(dataset.summary.byProjectCategory.municipal_public_works).toBeGreaterThanOrEqual(3)
    expect(Object.keys(dataset.summary.byCity).length).toBeGreaterThanOrEqual(6)
    expect(dataset.summary.publicationReadinessCount).toBe(0)
    expect(dataset.summary.runtimeSampleWriteCount).toBe(0)
    expect(dataset.summary.bySourceQuality.ready_for_field_review).toBeGreaterThanOrEqual(3)
    expect(dataset.summary.bySourceQuality.needs_ocr_review).toBeGreaterThanOrEqual(1)
    expect(dataset.summary.c18Support.byGate).toEqual(expect.objectContaining({
      'C-18.L10': expect.any(Number),
      'C-18.L12': expect.any(Number),
      'C-18.L13': expect.any(Number),
      'C-18.L14': expect.any(Number),
    }))
    expect(dataset.summary.c18Support.byGate['C-18.L10']).toBeGreaterThanOrEqual(6)
    expect(dataset.summary.c18Support.byGate['C-18.L12']).toBeGreaterThanOrEqual(5)
    expect(dataset.summary.c18Support.byGate['C-18.L13']).toBeGreaterThanOrEqual(6)
    expect(dataset.summary.c18Support.byGate['C-18.L14']).toBeGreaterThanOrEqual(6)

    for (const document of dataset.sourceDocuments ?? []) {
      expect(document.sourceKey).toBeTruthy()
      expect(document.sourceUrl).toMatch(/^https?:\/\//)
      expect(document.downloadHash.status).toMatch(/^(hashed_local_artifact|downloaded_short_html|missing_local_artifact)$/)
      if (document.downloadHash.status === 'hashed_local_artifact') {
        expect(document.downloadHash.sha256).toMatch(/^sha256:[a-f0-9]{64}$/)
        expect(document.downloadHash.size).toBeGreaterThan(1024)
      }
    }

    for (const sample of samples) {
      expect(sample.sampleKey).toBeTruthy()
      expect(sample.sourceKey).toBeTruthy()
      expect(sample.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(sample.projectName).toBeTruthy()
      expect(sample.actualDuration.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(sample.actualDuration.finishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(sample.actualDuration.durationDaysInclusive).toBeGreaterThan(0)
      expect(sample.fieldCompleteness.score).toBeGreaterThanOrEqual(0.5)
      expect(sample.replayFit.status).toMatch(/^(candidate_for_runtime_sample_review|partial_actual_duration_only)$/)
      expect(sample.c18Support.gates.length).toBeGreaterThan(0)
      expect(sample.c18Support.mutationBoundary).toBe('sample_realism_only_no_live_closeout')
      expect(sample.governance.publicationReadinessGenerated).toBe(false)
      expect(sample.governance.runtimeSampleWritten).toBe(false)
    }
  })

  it('keeps representative public project samples traceable to official fields', () => {
    const dataset = JSON.parse(readFileSync(discoveryPackagePath, 'utf8'))
    const samples = dataset.sampleCandidates ?? []
    const byKey = new Map<string, any>(samples.map((sample: any) => [sample.sampleKey, sample]))

    const qiyang = byKey.get('real_project_sample:hunan-qiyang-shuangchuang-building')
    expect(qiyang.projectName).toBe('湖南金筑置业发展有限公司双创大厦建设项目')
    expect(qiyang.actualDuration).toMatchObject({
      startDate: '2021-03-03',
      finishDate: '2023-12-28',
      durationDaysInclusive: 1031,
    })
    expect(qiyang.technicalProfile).toMatchObject({
      actualAreaSqm: 100698.88,
      aboveGroundFloors: 27,
      undergroundFloors: 1,
    })
    expect(qiyang.technicalProfile.structureSystem).toContain('框剪')
    expect(qiyang.sourceLocator.evidenceRows).toEqual(expect.arrayContaining([
      '竣工验收备案信息.actualDuration',
      '业绩技术指标.startEnd',
    ]))

    const yunxi = byKey.get('real_project_sample:hunan-yunxi-green-chemical-parking')
    expect(yunxi.projectName).toContain('长岭工业片区危货停车场建设工程')
    expect(yunxi.actualDuration).toMatchObject({
      startDate: '2023-03-07',
      finishDate: '2025-03-31',
      durationDaysInclusive: 756,
    })
    expect(yunxi.technicalProfile.actualAreaSqm).toBe(16559.72)
    expect(yunxi.technicalProfile.structureSystem).toContain('框剪')

    const yiyangBuilding = byKey.get('real_project_sample:yiyang-zishanhu-shopping-center')
    expect(yiyangBuilding.projectName).toBe('益阳梓山湖新城购物中心建设工程项目')
    expect(yiyangBuilding.actualDuration.durationDaysInclusive).toBe(914)
    expect(yiyangBuilding.technicalProfile.totalAreaSqm).toBe(137043)
    expect(yiyangBuilding.technicalProfile.aboveGroundFloors).toBe(31)
    expect(yiyangBuilding.replayFit.status).toBe('candidate_for_runtime_sample_review')
    expect(yiyangBuilding.c18Support.gates).toEqual(expect.arrayContaining(['C-18.L10', 'C-18.L14']))

    const changde = byKey.get('real_project_sample:changde-chaoyang-gongguan-phase1')
    expect(changde.projectName).toContain('朝阳公馆')
    expect(changde.technicalProfile.totalAreaSqm).toBe(159122)
    expect(changde.c18Support.gates).toEqual(expect.arrayContaining(['C-18.L10', 'C-18.L13', 'C-18.L14']))

    const lengshuitan = byKey.get('real_project_sample:lengshuitan-phoenix-industrial-park-plant')
    expect(lengshuitan.projectName).toContain('凤凰园高科技工业园')
    expect(lengshuitan.technicalProfile.totalAreaSqm).toBe(12836.08)
    expect(lengshuitan.actualDuration.durationDaysInclusive).toBeGreaterThan(0)
    expect(lengshuitan.c18Support.gates).toEqual(expect.arrayContaining(['C-18.L10', 'C-18.L12']))

    const ningyuan = (dataset.rejectedSources ?? []).find((source: any) => (
      source.sourceKey === 'hunan_ningyuan_dongxi_residential_performance_pdf'
    ))
    expect(ningyuan.reviewStatus).toBe('needs_ocr_review_before_sample_candidate')
    expect(ningyuan.reason).toContain('pdf_text_layer_too_sparse')
  })

  it('emits a no-op SQL guard and keeps readiness/business writes out', () => {
    expect(existsSync(discoveryNoopSqlPath)).toBe(true)
    const noopSql = readFileSync(discoveryNoopSqlPath, 'utf8')

    expect(noopSql).toContain('sample_candidate_only_no_replay_or_readiness_write')
    expect(noopSql).not.toContain('INSERT INTO')
    expect(noopSql).not.toContain('UPDATE public')

    for (const forbiddenTable of [
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
      expect(noopSql).not.toContain(`INSERT INTO ${forbiddenTable}`)
      expect(noopSql).not.toContain(`UPDATE ${forbiddenTable}`)
    }
  })

  it('records the web search and download/hash governance trail', () => {
    expect(existsSync(discoverySearchLogPath)).toBe(true)
    const searchLog = readFileSync(discoverySearchLogPath, 'utf8')

    expect(searchLog).toContain('firecrawl_search')
    expect(searchLog).toContain('download/hash')
    expect(searchLog).toContain('sample_candidate_only_no_replay_or_readiness_write')
    expect(searchLog).toContain('changsha-county-performance-project-202601.docx')
    expect(searchLog).toContain('wugang')
    expect(searchLog).toContain('direct download failed')
  })

  it('maps public samples to C-18 realism support without pretending to close live gates', () => {
    const dataset = JSON.parse(readFileSync(discoveryPackagePath, 'utf8'))
    const matrix = dataset.c18RealismSupportMatrix ?? []

    expect(matrix.map((row: any) => row.gate)).toEqual(['C-18.L10', 'C-18.L12', 'C-18.L13', 'C-18.L14'])
    for (const row of matrix) {
      expect(row.supportUse).toContain('sample realism')
      expect(row.liveCloseoutReplacement).toBe(false)
      expect(row.requiredLiveEvidenceStillNeeded.length).toBeGreaterThan(0)
      expect(row.sampleKeys.length).toBeGreaterThanOrEqual(5)
    }
  })
})
