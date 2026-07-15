import { describe, expect, it } from 'vitest'

import { buildDownstreamDurationAssetConsumption } from '../services/durationAssetDownstreamConsumptionService.js'

describe('duration asset downstream consumption service', () => {
  it('preserves runtime publication lineage while attributing governed downstream changes', () => {
    const result = buildDownstreamDurationAssetConsumption({
      consumer: 'critical_path_cpm',
      upstreamReceipts: [{
        consumer: 'wizard_master_plan',
        assetType: 'standard_work_duration',
        stableCode: 'duration.concrete.structure',
        role: 'stable_runtime',
        effectiveSource: 'project_stable',
        versionId: 'project-duration-v3',
        publicationKey: 'duration-publication-v3',
        status: 'effective_applied',
        changedFields: ['duration', 'dates'],
        targetRowIds: ['task-1'],
        reasonCodes: [],
        rollbackTarget: 'project-duration-v2',
      }],
      before: { durationDays: null, dates: null, dependencies: null },
      after: {
        durationDays: 36,
        dates: { finishDate: '2027-08-31' },
        dependencies: [{ from: 'task-1', to: 'task-2' }],
      },
      targetRowIds: ['task-1', 'task-2'],
    })

    expect(result.receipts).toEqual([
      expect.objectContaining({
        consumer: 'critical_path_cpm',
        versionId: 'project-duration-v3',
        publicationKey: 'duration-publication-v3',
        status: 'effective_applied',
        changedFields: expect.arrayContaining(['duration', 'dates', 'dependency']),
      }),
    ])
    expect(result.summary).toEqual(expect.objectContaining({ effectiveAppliedCount: 1 }))
  })

  it('keeps candidate-only lineage evidence-only even when the downstream calculation has outputs', () => {
    const result = buildDownstreamDurationAssetConsumption({
      consumer: 'remaining_duration_forecast',
      upstreamReceipts: [{
        consumer: 'candidate_calibration',
        assetType: 'standard_work_duration',
        stableCode: 'duration.candidate.v4',
        role: 'candidate_advisory',
        effectiveSource: 'candidate_advisory',
        versionId: 'candidate-v4',
        publicationKey: 'candidate-publication-v4',
        status: 'advisory_used',
        changedFields: ['confidence'],
        targetRowIds: [],
        reasonCodes: ['candidate_advisory_only'],
        rollbackTarget: null,
      }],
      before: { durationDays: null, dates: null },
      after: { durationDays: 42, dates: { finishDate: '2027-09-30' } },
      targetRowIds: ['project-1'],
    })

    expect(result.receipts).toEqual([
      expect.objectContaining({
        versionId: 'candidate-v4',
        publicationKey: 'candidate-publication-v4',
        status: 'evidence_only',
        changedFields: [],
        reasonCodes: expect.arrayContaining(['candidate_not_authorized_for_official_downstream_output']),
      }),
    ])
    expect(result.summary).toEqual(expect.objectContaining({
      effectiveAppliedCount: 0,
      advisoryUsedCount: 0,
      evidenceOnlyCount: 1,
    }))
  })
})
