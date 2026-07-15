import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { AcceptanceTemplatePolicyAutoPublishJob } from '../jobs/acceptanceTemplatePolicyAutoPublishJob.js'

describe('acceptance template policy auto-publish job', () => {
  it('is wired into the scheduler, admin jobs route, and audit persistence table', () => {
    const schedulerSource = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')
    const jobsRouteSource = readFileSync(new URL('../routes/jobs.ts', import.meta.url), 'utf8')
    const jobSource = readFileSync(new URL('../jobs/acceptanceTemplatePolicyAutoPublishJob.ts', import.meta.url), 'utf8')
    const migrationSource = readFileSync(
      new URL('../../migrations/180_acceptance_template_policy_auto_publish_runs.sql', import.meta.url),
      'utf8',
    )

    expect(schedulerSource).toContain(
      "import { acceptanceTemplatePolicyAutoPublishJob } from './jobs/acceptanceTemplatePolicyAutoPublishJob.js'",
    )
    expect(schedulerSource).toContain('acceptanceTemplatePolicyAutoPublishJob.start()')
    expect(schedulerSource).toContain('acceptanceTemplatePolicyAutoPublishJob.stop()')

    expect(jobsRouteSource).toContain("name: 'acceptanceTemplatePolicyAutoPublishJob'")
    expect(jobsRouteSource).toContain("schedule: '35 5 * * *'")
    expect(jobsRouteSource).toContain("case 'acceptanceTemplatePolicyAutoPublishJob'")
    expect(jobsRouteSource).toContain('result: await acceptanceTemplatePolicyAutoPublishJob.executeNow()')

    expect(jobSource).toContain('persistAcceptancePolicyAutoPublishRun')
    expect(jobSource).toContain('loadLatestAcceptancePolicyAutoPublishRun')
    expect(jobSource).toContain('publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots')
    expect(jobSource).toContain('collectAcceptancePolicyReplayCalibrationSamples')
    expect(jobSource).toContain('includeOfficialPublicSamples: true')
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS public.acceptance_template_policy_auto_publish_runs')
    expect(migrationSource).toContain('run_id TEXT PRIMARY KEY')
    expect(migrationSource).toContain("automation_quality JSONB NOT NULL DEFAULT '{}'::jsonb")
    expect(migrationSource).toContain("record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_audit_only'")
  })

  it('runs trusted-source acceptance policy auto-publication without manual review input', async () => {
    const job = new AcceptanceTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      replaySampleProvider: async () => [],
      latestRunLoader: async () => null,
      runPublisher: async () => ({
        planCode: 'acceptance_template_policy_auto_publish_plan',
        seedVersion: 'acceptance-template-seed-v1',
        asOfDate: '2026-09-01',
        updateMode: 'trusted_source_auto_publish',
        runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
        publicationGate: 'trusted_source_health_and_calibration_required',
        rollbackPolicy: 'stable_seed_restore_and_candidate_only_on_regression',
        summary: {
          totalPublishedRegionProfiles: 1,
          totalPublishedProvinceSharedProfiles: 1,
          totalPublishedCityProfiles: 0,
          weakSourceAssetCount: 0,
          autoPublishCandidateCount: 1,
          autoPublishedUpdateCount: 1,
          blockedUpdateCount: 0,
        },
        autoPublishedUpdates: [],
        blockedUpdates: [],
        runCode: 'acceptance_template_policy_auto_publish_run',
        runId: 'run-2026-09-01',
        publicationStatus: 'published',
        policyOpsDecision: {
          decisionCode: 'policy_ops_auto_publish_allowed',
          decisionLabel: 'Policy ops auto-publish allowed',
          releaseReadiness: 'ready',
          action: 'publish',
          reasonCodes: [],
        },
        publishedAt: '2026-09-01T08:00:00.000Z',
        appliedAutoPublishedSeedCount: 1,
        retainedPreviousPublishedSeedCount: 0,
        automationQuality: {
          sourceCoverage: {
            totalAssets: 1,
            coveredAssets: 1,
            coverageRate: 1,
            coverageStatus: 'ready',
            uncoveredAssetCodes: [],
          },
          policyParseHitRate: {
            parsedAssets: 0,
            totalAssets: 0,
            hitRate: null,
            status: 'not_evaluated',
          },
          projectReplayCalibration: {
            sampleCount: 0,
            comparableAssets: 0,
            calibrationScore: null,
            calibrationStatus: 'not_evaluated',
            calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
          },
          goldenReplayBaseline: {
            comparableAssets: 0,
            matchedAssets: 0,
            baselineScore: null,
            baselineStatus: 'not_evaluated',
          },
          policyOpsDecision: {
            decisionCode: 'policy_ops_auto_publish_allowed',
            decisionLabel: 'Policy ops auto-publish allowed',
            releaseReadiness: 'ready',
            action: 'publish',
            reasonCodes: [],
          },
        },
      } as any),
      runPersister: async () => null,
    })

    const result = await job.executeNow('2026-09-01')

    expect(result).toMatchObject({
      runCode: 'acceptance_template_policy_auto_publish_run',
      publicationStatus: 'published',
      updateMode: 'trusted_source_auto_publish',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    })
    expect(result?.summary.autoPublishedUpdateCount).toBeGreaterThan(0)
    expect(result?.appliedAutoPublishedSeedCount).toBe(result?.summary.autoPublishedUpdateCount)
    expect(result?.automationQuality.sourceCoverage).toMatchObject({
      coverageRate: 1,
      coverageStatus: 'ready',
    })
    expect(result?.automationQuality.policyParseHitRate.status).toBe('not_evaluated')
    expect(result?.automationQuality.projectReplayCalibration.calibrationPolicy).toBe(
      'candidate_overlay_only_no_silent_seed_mutation',
    )
  })
})
