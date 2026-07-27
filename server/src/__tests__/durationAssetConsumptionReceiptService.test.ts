import { describe, expect, it } from 'vitest'

import {
  buildDurationAssetConsumptionReceipt,
  summarizeDurationAssetConsumption,
} from '../services/durationAssetConsumptionReceiptService.js'
import type { EffectiveDurationAssetResolution } from '../services/durationAssetRuntimeContractService.js'

function resolution(
  overrides: Partial<EffectiveDurationAssetResolution<{ days: number }>> = {},
): EffectiveDurationAssetResolution<{ days: number }> {
  return {
    stableCode: 'duration.concrete.structure',
    assetType: 'standard_work_duration',
    role: 'stable_runtime',
    value: { days: 10 },
    effectiveSource: 'system_stable',
    versionId: 'system-v2',
    publicationKey: 'publication-system-v2',
    suppressedSources: ['system_bootstrap'],
    conflictCodes: [],
    runtimeConsumable: true,
    rollbackTarget: 'system-v1',
    ...overrides,
  }
}

describe('durationAssetConsumptionReceiptService', () => {
  it('marks a runtime duration change as effective consumption', () => {
    expect(buildDurationAssetConsumptionReceipt({
      consumer: 'wizard_master_plan',
      resolution: resolution(),
      before: { durationDays: { p20: 9, p50: 12, p80: 15 } },
      after: { durationDays: { p20: 8, p50: 10, p80: 13 } },
      targetRowIds: ['row-1', 'row-1'],
    })).toEqual(expect.objectContaining({
      status: 'effective_applied',
      changedFields: ['duration'],
      targetRowIds: ['row-1'],
      stableCode: 'duration.concrete.structure',
      versionId: 'system-v2',
      publicationKey: 'publication-system-v2',
      rollbackTarget: 'system-v1',
    }))
  })

  it('detects structured dependency and overlap changes', () => {
    expect(buildDurationAssetConsumptionReceipt({
      consumer: 'execution_plan_drilldown',
      resolution: resolution({ assetType: 'cross_item_workflow' }),
      before: {
        dependencies: [{ predecessor: 'row-a', type: 'FS', lagDays: 0 }],
        overlapRatio: 0,
      },
      after: {
        dependencies: [{ predecessor: 'row-a', type: 'SS', lagDays: 2 }],
        overlapRatio: 0.25,
      },
      targetRowIds: ['row-b'],
    })).toMatchObject({
      status: 'effective_applied',
      changedFields: ['dependency', 'overlap'],
    })
  })

  it('does not count metadata-only lineage as effective consumption', () => {
    expect(buildDurationAssetConsumptionReceipt({
      consumer: 'wizard_master_plan',
      resolution: resolution(),
      before: {
        durationDays: 10,
        metadata: { source: 'legacy', versionId: null },
      },
      after: {
        durationDays: 10,
        metadata: { source: 'system_stable', versionId: 'system-v2' },
      },
      targetRowIds: ['row-1'],
    })).toMatchObject({
      status: 'evidence_only',
      changedFields: [],
      reasonCodes: ['no_governed_output_change'],
    })
  })

  it('keeps candidate output advisory even when confidence changes', () => {
    expect(buildDurationAssetConsumptionReceipt({
      consumer: 'remaining_duration_forecast',
      resolution: resolution({
        role: 'candidate_advisory',
        effectiveSource: 'candidate_advisory',
        runtimeConsumable: false,
        rollbackTarget: null,
      }),
      before: { confidence: 0.55 },
      after: { confidence: 0.72 },
      targetRowIds: ['row-2'],
    })).toMatchObject({
      status: 'advisory_used',
      changedFields: ['confidence'],
    })
  })

  it('blocks conflicts and records the conflict reason instead of an apparent change', () => {
    expect(buildDurationAssetConsumptionReceipt({
      consumer: 'critical_path',
      resolution: resolution({
        value: null,
        conflictCodes: ['scope_fact_conflict'],
        runtimeConsumable: false,
      }),
      before: { dates: { start: '2026-01-01', end: '2026-01-10' } },
      after: { dates: { start: '2026-01-02', end: '2026-01-11' } },
      targetRowIds: ['row-3'],
    })).toMatchObject({
      status: 'blocked_by_conflict',
      changedFields: [],
      reasonCodes: ['scope_fact_conflict'],
    })
  })

  it('marks an asset outside the current business scope as not applicable', () => {
    expect(buildDurationAssetConsumptionReceipt({
      consumer: 'wizard_master_plan',
      resolution: resolution(),
      before: {},
      after: {},
      targetRowIds: [],
      applicable: false,
      reasonCodes: ['business_type_not_supported'],
    })).toMatchObject({
      status: 'not_applicable',
      changedFields: [],
      reasonCodes: ['business_type_not_supported'],
    })
  })

  it('summarizes status and changed-field counts from receipts only', () => {
    const receipts = [
      buildDurationAssetConsumptionReceipt({
        consumer: 'wizard_master_plan',
        resolution: resolution(),
        before: { durationDays: 12 },
        after: { durationDays: 10 },
        targetRowIds: ['row-1'],
      }),
      buildDurationAssetConsumptionReceipt({
        consumer: 'wizard_master_plan',
        resolution: resolution({
          stableCode: 'visibility.tower_crane',
          assetType: 'master_plan_visibility_policy',
          role: 'candidate_advisory',
          effectiveSource: 'candidate_advisory',
          runtimeConsumable: false,
          rollbackTarget: null,
        }),
        before: { confidence: 0.5 },
        after: { confidence: 0.6 },
        targetRowIds: ['row-2'],
      }),
      buildDurationAssetConsumptionReceipt({
        consumer: 'wizard_master_plan',
        resolution: resolution(),
        before: { durationDays: 10 },
        after: { durationDays: 10 },
        targetRowIds: ['row-3'],
      }),
    ]

    expect(summarizeDurationAssetConsumption(receipts)).toEqual(expect.objectContaining({
      totalCount: 3,
      effectiveAppliedCount: 1,
      advisoryUsedCount: 1,
      evidenceOnlyCount: 1,
      notApplicableCount: 0,
      blockedByConflictCount: 0,
      changedFieldCounts: expect.objectContaining({ duration: 1, confidence: 1 }),
      effectiveStableCodes: ['duration.concrete.structure'],
    }))
  })
})
