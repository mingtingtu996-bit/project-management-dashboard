import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const persistenceMocks = vi.hoisted(() => {
  const tables: Record<string, any[]> = {
    certificate_template_policy_auto_publish_runs: [],
    policy_template_entity_runtime_publications: [],
  }
  function createQuery(table: string) {
    const filters: Array<{ column: string; value: unknown }> = []
    let orderColumn: string | null = null
    let orderAscending = false
    let rowLimit: number | null = null
    const readRows = () => {
      let rows = [...(tables[table] ?? [])].filter((row) => (
        filters.every((filter) => row[filter.column] === filter.value)
      ))
      if (orderColumn) {
        rows = rows.sort((left, right) => {
          const leftValue = left[orderColumn as string] ?? ''
          const rightValue = right[orderColumn as string] ?? ''
          if (leftValue === rightValue) return 0
          return leftValue > rightValue
            ? orderAscending ? 1 : -1
            : orderAscending ? -1 : 1
        })
      }
      return typeof rowLimit === 'number' ? rows.slice(0, rowLimit) : rows
    }
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value })
        return query
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderColumn = column
        orderAscending = options?.ascending === true
        return query
      }),
      limit: vi.fn((limit: number) => {
        rowLimit = limit
        return query
      }),
      maybeSingle: vi.fn(async () => ({ data: readRows()[0] ?? null, error: null })),
      insert: vi.fn(async (record: any) => {
        const rows = tables[table] ?? []
        if (Array.isArray(record)) rows.push(...record)
        else rows.push(record)
        return { data: record, error: null }
      }),
    }
    return query
  }
  const client = {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    release: vi.fn(),
  }
  return {
    supabase: {
      from: vi.fn((table: string) => createQuery(table)),
    },
    executeSQL: vi.fn(async () => []),
    executeSQLOne: vi.fn(async () => null),
    getClient: vi.fn(async () => client),
    client,
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: persistenceMocks.supabase,
  executeSQL: persistenceMocks.executeSQL,
  executeSQLOne: persistenceMocks.executeSQLOne,
}))

vi.mock('../database.js', () => ({
  getClient: persistenceMocks.getClient,
  query: persistenceMocks.client.query,
}))

import {
  CertificateTemplatePolicyAutoPublishJob,
  certificateTemplatePolicyAutoPublishJob,
} from '../jobs/certificateTemplatePolicyAutoPublishJob.js'

describe('certificate template policy auto-publish job', () => {
  it('is wired into the scheduler and admin jobs route for automatic publication', () => {
    const schedulerSource = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')
    const jobsRouteSource = readFileSync(new URL('../routes/jobs.ts', import.meta.url), 'utf8')
    const jobSource = readFileSync(new URL('../jobs/certificateTemplatePolicyAutoPublishJob.ts', import.meta.url), 'utf8')
    const migrationSource = readFileSync(
      new URL('../../migrations/179_certificate_template_policy_auto_publish_runs.sql', import.meta.url),
      'utf8',
    )

    expect(schedulerSource).toContain(
      "import { certificateTemplatePolicyAutoPublishJob } from './jobs/certificateTemplatePolicyAutoPublishJob.js'",
    )
    expect(schedulerSource).toContain('certificateTemplatePolicyAutoPublishJob.start()')
    expect(schedulerSource).toContain('certificateTemplatePolicyAutoPublishJob.stop()')

    expect(jobsRouteSource).toContain("name: 'certificateTemplatePolicyAutoPublishJob'")
    expect(jobsRouteSource).toContain("schedule: '25 5 * * *'")
    expect(jobsRouteSource).toContain("case 'certificateTemplatePolicyAutoPublishJob'")
    expect(jobsRouteSource).toContain('result: await certificateTemplatePolicyAutoPublishJob.executeNow()')

    expect(jobSource).toContain('persistCertificatePolicyAutoPublishRun')
    expect(jobSource).toContain('loadLatestCertificatePolicyAutoPublishRun')
    expect(jobSource).toContain('publishCertificatePolicyAutoPublishPlanWithSourceSnapshots')
    expect(jobSource).toContain('useLiveSourceSnapshots')
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS public.certificate_template_policy_auto_publish_runs')
    expect(migrationSource).toContain('run_id TEXT PRIMARY KEY')
    expect(migrationSource).toContain("automation_quality JSONB NOT NULL DEFAULT '{}'::jsonb")
    expect(migrationSource).toContain("record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_audit_only'")
  })

  it('runs trusted-source certificate policy auto-publication without manual review input', async () => {
    const snapshotAwareJob = new CertificateTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      replaySampleProvider: async () => [],
      sourceSnapshotProvider: async (source) => ({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl ?? '',
        policyLevel: source.policyLevel,
        checkedAt: source.checkedAt,
        sourceHealth: 'healthy',
        fetchStatus: 'fetched',
        contentHash: 'stable-policy-content-hash',
        previousContentHash: 'stable-policy-content-hash',
        diffStatus: 'unchanged',
        changeSignals: [],
        changeRisk: 'low',
        autoPublishDecision: 'auto_publish_allowed',
      }),
    })
    const result = await snapshotAwareJob.executeNow('2026-09-01')

    expect(result).toMatchObject({
      runCode: 'certificate_template_policy_auto_publish_run',
      publicationStatus: 'published',
      updateMode: 'trusted_source_auto_publish',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    })
    expect(result?.summary.autoPublishedUpdateCount).toBeGreaterThan(0)
    expect(result?.appliedAutoPublishedSeedCount).toBe(result?.summary.autoPublishedUpdateCount)
    expect(result?.automationQuality.sourceCoverage.totalPublishedAssetCount).toBeGreaterThan(0)
    expect(result?.automationQuality.policyParseHitRate.status).toBe('not_evaluated')
    expect(result?.automationQuality.projectReplayCalibration.calibrationPolicy).toBe(
      'candidate_overlay_only_no_silent_seed_mutation',
    )
    expect(
      result?.autoPublishedUpdates
        .filter((update) => update.assetCode === 'province_profile:guangdong')
        .every((update) => update.sourceSnapshots?.length),
    ).toBe(true)
    expect(result?.autoPublishedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          publishStatus: 'auto_published',
          runtimeConsumptionPolicy: 'auto_published_seed',
        }),
      ]),
    )
  })

  it('feeds real-project replay samples into automatic publication quality metrics', async () => {
    const replayAwareJob = new CertificateTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: false,
      replaySampleProvider: async () => [
        {
          projectId: 'project-1',
          provinceCode: 'guangdong',
          cityCode: 'shenzhen',
          certificateType: 'construction_permit',
          expectedMaterialNames: ['Construction Permit Application Form'],
          actualMaterialNames: ['Construction Permit Application Form'],
          expectedAuthority: 'Shenzhen Housing Bureau',
          actualAuthority: 'Shenzhen Housing Bureau',
          expectedReusableOutputNames: ['Engineering Planning Permit'],
          actualReusableOutputNames: ['Engineering Planning Permit'],
        },
      ],
    })

    const result = await replayAwareJob.executeNow('2026-09-01')

    expect(result?.automationQuality.projectReplayCalibration).toMatchObject({
      sampleCount: 1,
      calibratedSampleCount: 1,
      materialMatchRate: 1,
      authorityMatchRate: 1,
      predecessorReuseMatchRate: 1,
      calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
    })
  })
})
