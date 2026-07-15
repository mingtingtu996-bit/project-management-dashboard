import { describe, expect, it } from 'vitest'
import {
  buildAlgorithmAssetSampleHealthReport,
  buildAndPersistAlgorithmAssetSampleHealthReport,
  classifyAlgorithmAssetSampleHealth,
} from '../services/algorithmAssetSampleHealthService.js'

describe('algorithmAssetSampleHealthService', () => {
  it('classifies complete high-quality samples as accepted benchmark evidence', () => {
    const event = classifyAlgorithmAssetSampleHealth({
      sampleId: 'sample-accepted',
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-001',
      actualStartDate: '2026-05-01',
      actualEndDate: '2026-05-06',
      qualitySignal: 'verified',
    })

    expect(event).toEqual(expect.objectContaining({
      sampleId: 'sample-accepted',
      status: 'accepted',
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-001',
      derivedActualDurationDays: 5,
      benchmarkEligible: true,
      candidateEvidenceEligible: true,
    }))
    expect(event.reasons).toEqual([])
    expect(event.completionHints).toEqual([])
  })

  it('downgrades completed samples with derived dates to weak instead of silently dropping them', () => {
    const event = classifyAlgorithmAssetSampleHealth({
      sampleId: 'sample-weak',
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-002',
      plannedStartDate: '2026-05-01',
      completionEventAt: '2026-05-08',
      status: 'completed',
      qualitySignal: 'low_confidence_match',
    })

    expect(event).toEqual(expect.objectContaining({
      status: 'weak',
      derivedStartDate: '2026-05-01',
      derivedEndDate: '2026-05-08',
      derivedActualDurationDays: 7,
      benchmarkEligible: false,
      candidateEvidenceEligible: true,
    }))
    expect(event.reasons).toEqual(expect.arrayContaining([
      'actual_start_derived_from_planned_start',
      'actual_end_derived_from_completion_event',
      'low_confidence_match',
    ]))
    expect(event.completionHints).toEqual(expect.arrayContaining([
      'fill_actual_start_date',
      'fill_actual_end_date',
      'confirm_work_code_mapping',
    ]))
  })

  it('keeps non-duration completion samples out of benchmark eligibility while preserving candidate evidence', () => {
    const event = classifyAlgorithmAssetSampleHealth({
      sampleId: 'acceptance-pass-1',
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'acceptance_plan:main_structure_acceptance',
      actualStartDate: '2026-05-06',
      actualEndDate: '2026-05-06',
      qualitySignal: 'verified',
      benchmarkEligible: false,
    })

    expect(event).toEqual(expect.objectContaining({
      status: 'accepted',
      derivedActualDurationDays: 0,
      benchmarkEligible: false,
      candidateEvidenceEligible: true,
    }))
    expect(event.reasons).toEqual([])
  })

  it('rejects unusable samples with explicit reasons so missing facts are visible', () => {
    const event = classifyAlgorithmAssetSampleHealth({
      sampleId: 'sample-rejected',
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: '',
      actualStartDate: '2026-05-10',
      actualEndDate: '2026-05-08',
      qualitySignal: 'unusable',
    })

    expect(event).toEqual(expect.objectContaining({
      status: 'rejected',
      benchmarkEligible: false,
      candidateEvidenceEligible: false,
      derivedActualDurationDays: null,
    }))
    expect(event.reasons).toEqual(expect.arrayContaining([
      'missing_work_code',
      'date_anomaly',
      'quality_unusable',
    ]))
    expect(event.completionHints).toEqual(expect.arrayContaining([
      'map_work_code',
      'check_actual_dates',
      'review_sample_quality',
    ]))
  })

  it('summarizes availability weak samples rejection reasons and cold-start coverage by scope', () => {
    const report = buildAlgorithmAssetSampleHealthReport({
      minAcceptedSamplesForColdStartCoverage: 2,
      samples: [
        {
          sampleId: 'accepted-1',
          companyId: 'company-a',
          projectId: 'project-a1',
          workCode: 'WBS-001',
          actualStartDate: '2026-05-01',
          actualEndDate: '2026-05-04',
          qualitySignal: 'verified',
        },
        {
          sampleId: 'accepted-2',
          companyId: 'company-a',
          projectId: 'project-a1',
          workCode: 'WBS-001',
          actualStartDate: '2026-05-05',
          actualEndDate: '2026-05-08',
          qualitySignal: 'verified',
        },
        {
          sampleId: 'weak-1',
          companyId: 'company-a',
          projectId: 'project-a1',
          workCode: 'WBS-001',
          plannedStartDate: '2026-05-09',
          completionEventAt: '2026-05-12',
          status: 'completed',
          qualitySignal: 'progress_quality_degraded',
        },
        {
          sampleId: 'rejected-1',
          companyId: 'company-a',
          projectId: 'project-a2',
          workCode: '',
          actualStartDate: '2026-05-10',
          actualEndDate: '2026-05-08',
          qualitySignal: 'unusable',
        },
      ],
    })

    expect(report.summary).toEqual(expect.objectContaining({
      totalSampleCount: 4,
      acceptedSampleCount: 2,
      weakSampleCount: 1,
      rejectedSampleCount: 1,
      sampleAvailabilityRate: 0.75,
      weakSampleRate: 0.25,
      longTailFreezeCount: 1,
      coldStartCoveredGroupCount: 1,
    }))
    expect(report.summary.rejectionReasons).toEqual(expect.objectContaining({
      missing_work_code: 1,
      date_anomaly: 1,
      quality_unusable: 1,
    }))
    expect(report.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        groupKey: 'company-a:project-a1:WBS-001',
        acceptedSampleCount: 2,
        weakSampleCount: 1,
        rejectedSampleCount: 0,
        coldStartCovered: true,
      }),
      expect.objectContaining({
        groupKey: 'company-a:project-a2:unknown_work_code',
        acceptedSampleCount: 0,
        rejectedSampleCount: 1,
        longTailFrozen: true,
        coldStartCovered: false,
      }),
    ]))
  })

  it('can persist built sample health reports through the unified governance persistence contract', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [] as T[]
    }

    const result = await buildAndPersistAlgorithmAssetSampleHealthReport({
      assetKey: 'duration.sample.health',
      sourceModule: 'durationExperienceService',
      learningTarget: 'base_duration',
      queryExec,
      samples: [
        {
          sampleId: 'accepted-1',
          companyId: 'company-a',
          projectId: 'project-a1',
          workCode: 'WBS-001',
          actualStartDate: '2026-05-01',
          actualEndDate: '2026-05-04',
          qualitySignal: 'verified',
        },
        {
          sampleId: 'weak-1',
          companyId: 'company-a',
          projectId: 'project-a1',
          workCode: 'WBS-001',
          plannedStartDate: '2026-05-09',
          completionEventAt: '2026-05-12',
          status: 'completed',
          qualitySignal: 'progress_quality_degraded',
        },
      ],
    })

    expect(result.report.summary).toEqual(expect.objectContaining({
      totalSampleCount: 2,
      acceptedSampleCount: 1,
      weakSampleCount: 1,
    }))
    expect(result.persistence).toEqual({
      persisted: true,
      sampleHealthEventCount: 2,
    })
    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.algorithm_sample_health_events')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('standard_work_duration')
  })
})
