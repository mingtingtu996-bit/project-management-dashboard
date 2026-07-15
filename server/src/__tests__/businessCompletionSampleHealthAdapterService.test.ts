import { describe, expect, it } from 'vitest'
import {
  buildAndPersistBusinessCompletionSampleHealthReport,
  buildCertificateMilestoneCompletionSamples,
  buildDrawingVersionCompletionSamples,
  buildMaterialHandoverCompletionSamples,
  buildQualityRectificationCompletionSamples,
  buildRiskIssueCloseoutCompletionSamples,
} from '../services/businessCompletionSampleHealthAdapterService.js'

function createQueryRecorder() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

describe('businessCompletionSampleHealthAdapterService', () => {
  it('persists non-duration business completion samples as sample-health evidence without benchmark eligibility', async () => {
    const { calls, queryExec } = createQueryRecorder()

    const result = await buildAndPersistBusinessCompletionSampleHealthReport({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      samples: [
        {
          sampleId: 'acceptance-plan-pass-1',
          domain: 'acceptance_plan',
          businessCode: 'main_structure_acceptance',
          completedAt: '2026-05-12',
          qualitySignal: 'verified',
          metadata: { planId: 'acceptance-plan-1' },
        },
        {
          sampleId: 'drawing-version-confirmed-1',
          domain: 'drawing_version',
          businessCode: 'ifc_drawing_v2_confirmed',
          completedAt: '2026-05-13',
          qualitySignal: 'low_confidence_match',
          metadata: { drawingId: 'drawing-1' },
        },
      ],
      queryExec,
    })

    expect(result.report.summary).toEqual(expect.objectContaining({
      totalSampleCount: 2,
      acceptedSampleCount: 1,
      weakSampleCount: 1,
      rejectedSampleCount: 0,
    }))
    expect(result.report.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sampleId: 'acceptance-plan-pass-1',
        workCode: 'acceptance_plan:main_structure_acceptance',
        benchmarkEligible: false,
        candidateEvidenceEligible: true,
      }),
      expect.objectContaining({
        sampleId: 'drawing-version-confirmed-1',
        workCode: 'drawing_version:ifc_drawing_v2_confirmed',
        status: 'weak',
        benchmarkEligible: false,
        candidateEvidenceEligible: true,
      }),
    ]))
    expect(result.persistence).toEqual({
      persisted: true,
      sampleHealthEventCount: 2,
    })

    const insert = calls.find((call) => call.sql.includes('INSERT INTO public.algorithm_sample_health_events'))
    expect(insert?.params).toEqual(expect.arrayContaining([
      'business_completion.sample_health',
      'businessCompletionSampleHealthAdapterService',
      'governance_report',
    ]))
    expect(insert?.params).toEqual(expect.arrayContaining([
      expect.objectContaining({
        benchmarkEligible: false,
        candidateEvidenceEligible: true,
        domain: 'acceptance_plan',
        businessCode: 'main_structure_acceptance',
      }),
    ]))
    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('standard_work_duration')
    expect(sql).not.toContain('acceptance_plans')
    expect(sql).not.toContain('construction_drawings')
  })

  it('builds domain-specific non-duration completion samples without benchmark runtime permissions', async () => {
    const { calls, queryExec } = createQueryRecorder()

    const samples = [
      ...buildDrawingVersionCompletionSamples([
        {
          drawingId: 'drawing-structure-1',
          versionId: 'drawing-version-2',
          drawingCode: 'STRUCTURE_GENERAL',
          versionNo: 'V2',
          confirmedAt: '2026-05-14',
          companyId: '10000000-0000-4000-8000-000000000001',
          projectId: '00000000-0000-4000-8000-000000000001',
          metadata: { packageId: 'pkg-structure' },
        },
      ]),
      ...buildCertificateMilestoneCompletionSamples([
        {
          certificateId: 'certificate-construction-permit',
          milestoneCode: 'construction_permit_approved',
          completedAt: '2026-05-15',
          companyId: '10000000-0000-4000-8000-000000000001',
          projectId: '00000000-0000-4000-8000-000000000001',
          metadata: { authority: '住建主管部门' },
        },
      ]),
      ...buildMaterialHandoverCompletionSamples([
        {
          handoverId: 'handover-steel-1',
          handoverCode: 'rebar_batch_handover',
          acceptedAt: '2026-05-16',
          companyId: '10000000-0000-4000-8000-000000000001',
          projectId: '00000000-0000-4000-8000-000000000001',
          qualitySignal: 'verified',
        },
      ]),
      ...buildQualityRectificationCompletionSamples([
        {
          rectificationId: 'quality-rectification-1',
          rectificationCode: 'pipe_pressure_rectification',
          closedAt: '2026-05-17',
          companyId: '10000000-0000-4000-8000-000000000001',
          projectId: '00000000-0000-4000-8000-000000000001',
          qualitySignal: 'low_confidence_match',
        },
      ]),
      ...buildRiskIssueCloseoutCompletionSamples([
        {
          issueId: 'risk-closeout-1',
          issueCode: 'deep_foundation_warning_closeout',
          resolvedAt: '2026-05-18',
          companyId: '10000000-0000-4000-8000-000000000001',
          projectId: '00000000-0000-4000-8000-000000000001',
        },
      ]),
    ]

    expect(samples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sampleId: 'drawing_version:drawing-version-2',
        domain: 'drawing_version',
        businessCode: 'STRUCTURE_GENERAL:V2',
        completedAt: '2026-05-14',
        metadata: expect.objectContaining({
          drawingId: 'drawing-structure-1',
          versionId: 'drawing-version-2',
          packageId: 'pkg-structure',
        }),
      }),
      expect.objectContaining({
        sampleId: 'certificate_milestone:certificate-construction-permit',
        domain: 'certificate_milestone',
        businessCode: 'construction_permit_approved',
        completedAt: '2026-05-15',
      }),
      expect.objectContaining({
        sampleId: 'material_handover:handover-steel-1',
        domain: 'material_handover',
        businessCode: 'rebar_batch_handover',
        completedAt: '2026-05-16',
      }),
      expect.objectContaining({
        sampleId: 'quality_rectification:quality-rectification-1',
        domain: 'quality_rectification',
        businessCode: 'pipe_pressure_rectification',
        completedAt: '2026-05-17',
        qualitySignal: 'low_confidence_match',
      }),
      expect.objectContaining({
        sampleId: 'risk_issue_closeout:risk-closeout-1',
        domain: 'risk_issue_closeout',
        businessCode: 'deep_foundation_warning_closeout',
        completedAt: '2026-05-18',
      }),
    ]))

    const result = await buildAndPersistBusinessCompletionSampleHealthReport({
      samples,
      queryExec,
    })

    expect(result.report.summary).toEqual(expect.objectContaining({
      totalSampleCount: 5,
      acceptedSampleCount: 4,
      weakSampleCount: 1,
      rejectedSampleCount: 0,
    }))
    expect(result.report.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workCode: 'certificate_milestone:construction_permit_approved',
        benchmarkEligible: false,
        candidateEvidenceEligible: true,
      }),
      expect.objectContaining({
        workCode: 'quality_rectification:pipe_pressure_rectification',
        status: 'weak',
        benchmarkEligible: false,
      }),
    ]))

    const insertedMetadata = calls
      .filter((call) => call.sql.includes('INSERT INTO public.algorithm_sample_health_events'))
      .flatMap((call) => call.params)
    expect(insertedMetadata).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nonDurationBusinessCompletionSample: true,
        benchmarkEligible: false,
        domain: 'risk_issue_closeout',
        businessCode: 'deep_foundation_warning_closeout',
      }),
    ]))
    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('standard_work_duration')
    expect(sql).not.toContain('drawing_versions')
    expect(sql).not.toContain('certificate_work_items')
    expect(sql).not.toContain('project_materials')
    expect(sql).not.toContain('quality_rectifications')
    expect(sql).not.toContain('risk_issues')
  })
})
