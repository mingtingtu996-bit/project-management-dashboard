import { describe, expect, it } from 'vitest'

import {
  evaluateDurationAccuracyReplayAcceptance,
  type DurationAccuracyReplayAcceptanceDataset,
} from '../services/durationAccuracyReplayAcceptanceService.js'

function sample(
  sampleId: string,
  actualDurationDays: number,
  seedOnlyDurationDays: number,
  residualOverlayDurationDays: number,
) {
  return {
    sampleId,
    actualDurationDays,
    seedOnlyDurationDays,
    companyBlendDurationDays: seedOnlyDurationDays - 1,
    coldStartBaselineDurationDays: seedOnlyDurationDays - 2,
    residualOverlayDurationDays,
    predictionEvent: {
      id: `prediction:${sampleId}`,
      rollbackTarget: 'forecast-overlay:v1',
      basisSnapshot: {
        runtimeConsumptionState: 'seed_only',
        predictedDurationDays: seedOnlyDurationDays,
      },
      overlaySnapshot: {
        runtimeConsumptionState: 'residual_overlay_published',
        predictedDurationDays: residualOverlayDurationDays,
      },
      parameterSnapshot: {
        blendWeight: 0.5,
      },
    },
  }
}

describe('durationAccuracyReplayAcceptanceService', () => {
  it('builds the v1.4.22.4 replay acceptance matrix for high-frequency long-tail and cold-start datasets', () => {
    const datasets: DurationAccuracyReplayAcceptanceDataset[] = [
      {
        datasetKey: 'high-frequency-rebar',
        scenario: 'high_frequency_work',
        acceptedSampleCount: 3,
        samples: [
          sample('hf-1', 10, 14, 11),
          sample('hf-2', 12, 15, 12),
          sample('hf-3', 8, 13, 8),
        ],
      },
      {
        datasetKey: 'long-tail-elevator',
        scenario: 'long_tail_low_frequency',
        acceptedSampleCount: 1,
        samples: [
          sample('lt-1', 20, 28, 25),
        ],
      },
      {
        datasetKey: 'new-company-cold-start',
        scenario: 'new_company_cold_start',
        acceptedSampleCount: 3,
        samples: [
          sample('cs-1', 9, 14, 10),
          sample('cs-2', 11, 15, 12),
          sample('cs-3', 12, 17, 13),
        ],
      },
    ]

    const report = evaluateDurationAccuracyReplayAcceptance({
      datasets,
      maxOvercompensationRate: 0.2,
      minAcceptedSamplesForCanary: 3,
    })

    expect(report.datasetCount).toBe(3)
    expect(report.requiredScenarioCoverage).toEqual({
      high_frequency_work: true,
      long_tail_low_frequency: true,
      new_company_cold_start: true,
    })
    expect(report.datasets[0].variants.map((item) => item.basis)).toEqual([
      'seed_only',
      'company_blend',
      'cold_start_baseline',
      'residual_overlay',
    ])
    expect(report.datasets[0].variants.find((item) => item.basis === 'residual_overlay')).toMatchObject({
      maeDays: 0.33,
      maeImprovementDays: 3.67,
      overcompensationRate: 0,
    })
    expect(report.datasets[0].canaryGate).toMatchObject({
      passed: true,
      rollbackReady: true,
    })
    expect(report.datasets[1].canaryGate).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(['insufficient_accepted_samples']),
    })
    expect(report.overallCanaryReady).toBe(false)
  })

  it('blocks residual overlay canary when rollback evidence is missing even if accuracy improves', () => {
    const report = evaluateDurationAccuracyReplayAcceptance({
      datasets: [{
        datasetKey: 'missing-rollback',
        scenario: 'high_frequency_work',
        acceptedSampleCount: 3,
        samples: [
          {
            ...sample('mr-1', 10, 14, 10),
            predictionEvent: {
              id: 'prediction:mr-1',
              basisSnapshot: { predictedDurationDays: 14 },
              overlaySnapshot: { predictedDurationDays: 10 },
            },
          },
          sample('mr-2', 12, 16, 12),
          sample('mr-3', 8, 11, 8),
        ],
      }],
    })

    expect(report.datasets[0].variants.find((item) => item.basis === 'residual_overlay')).toMatchObject({
      maeImprovementDays: 3.67,
    })
    expect(report.datasets[0].rollbackEvidence).toMatchObject({
      rollbackReady: false,
      missingReasons: expect.arrayContaining(['rollback_target_missing']),
    })
    expect(report.datasets[0].canaryGate).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(['rollback_evidence_missing']),
    })
  })
})
