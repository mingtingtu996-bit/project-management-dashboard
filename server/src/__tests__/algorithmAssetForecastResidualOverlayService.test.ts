import { describe, expect, it } from 'vitest'

import {
  evaluateAlgorithmAssetForecastResidualOverlay,
  evaluateAndPersistAlgorithmAssetForecastResidualOverlay,
  rollbackAlgorithmAssetForecastResidualOverlayRuntimePublication,
} from '../services/algorithmAssetForecastResidualOverlayService.js'

const improvingForecastSamples = [
  {
    sampleId: 'forecast-1',
    companyId: 'company-a',
    originalForecastFinishDate: '2026-05-10',
    overlayForecastFinishDate: '2026-05-11',
    actualFinishDate: '2026-05-12',
  },
  {
    sampleId: 'forecast-2',
    companyId: 'company-a',
    originalForecastFinishDate: '2026-05-09',
    overlayForecastFinishDate: '2026-05-10',
    actualFinishDate: '2026-05-10',
  },
  {
    sampleId: 'forecast-3',
    companyId: 'company-a',
    originalForecastFinishDate: '2026-05-07',
    overlayForecastFinishDate: '2026-05-06',
    actualFinishDate: '2026-05-06',
  },
]

describe('algorithmAssetForecastResidualOverlayService', () => {
  it('writes improving forecast residual evidence only to the residual overlay target', () => {
    const result = evaluateAlgorithmAssetForecastResidualOverlay({
      assetKey: 'forecast.residual.company-a',
      companyId: 'company-a',
      modelKey: 'taskDurationForecastService',
      modelVersion: 'v1',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      rollbackTarget: 'forecast-residual-overlay:v1',
      conflictFree: true,
      samples: improvingForecastSamples,
      minAcceptedSamples: 3,
    })

    expect(result.summary).toEqual(expect.objectContaining({
      acceptedSampleCount: 3,
      rejectedSampleCount: 0,
      replayPassed: true,
      runtimeImpact: 'publish_gate_evidence',
    }))
    expect(result.summary.originalMae).toBeCloseTo(1.33, 2)
    expect(result.summary.overlayMae).toBeCloseTo(0.33, 2)
    expect(result.summary.maeImprovement).toBeCloseTo(1, 2)
    expect(result.overlayWrite).toEqual(expect.objectContaining({
      targetTable: 'duration_forecast_residual_overlays',
      writeMode: 'published_overlay',
      canWriteRuntimeOverlay: true,
      canWriteBaseDurationSeed: false,
      learningTarget: 'forecast_residual',
    }))
    expect(result.overlayWrite.forbiddenWriteTargets).toEqual(expect.arrayContaining([
      'standard_work_duration',
      'algorithm_seed_records',
    ]))
    expect(result.candidateEvent.candidatePayload).toEqual(expect.objectContaining({
      modelKey: 'taskDurationForecastService',
      modelVersion: 'v1',
      residualCorrectionDays: expect.any(Number),
      confidenceAdjustment: expect.any(Number),
      sampleCount: 3,
      minAcceptedSamples: 3,
    }))
  })

  it('rejects forecast samples outside the candidate company or project scope', () => {
    const result = evaluateAlgorithmAssetForecastResidualOverlay({
      assetKey: 'forecast.residual.project-a1',
      companyId: 'company-a',
      projectId: 'project-a1',
      modelKey: 'taskDurationForecastService',
      modelVersion: 'v1',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      rollbackTarget: 'forecast-residual-overlay:v1',
      conflictFree: true,
      samples: [
        {
          sampleId: 'accepted',
          companyId: 'company-a',
          projectId: 'project-a1',
          originalForecastFinishDate: '2026-05-10',
          overlayForecastFinishDate: '2026-05-11',
          actualFinishDate: '2026-05-12',
        },
        {
          sampleId: 'wrong-company',
          companyId: 'company-b',
          projectId: 'project-a1',
          originalForecastFinishDate: '2026-05-10',
          overlayForecastFinishDate: '2026-05-11',
          actualFinishDate: '2026-05-12',
        },
        {
          sampleId: 'wrong-project',
          companyId: 'company-a',
          projectId: 'project-a2',
          originalForecastFinishDate: '2026-05-10',
          overlayForecastFinishDate: '2026-05-11',
          actualFinishDate: '2026-05-12',
        },
      ],
      minAcceptedSamples: 2,
    })

    expect(result.summary).toEqual(expect.objectContaining({
      acceptedSampleCount: 1,
      rejectedSampleCount: 2,
      replayPassed: false,
      runtimeImpact: 'review_required',
    }))
    expect(result.rejectedSamples.map((sample) => sample.reason)).toEqual([
      'scope_mismatch',
      'scope_mismatch',
    ])
    expect(result.overlayWrite).toEqual(expect.objectContaining({
      writeMode: 'candidate_overlay_only',
      canWriteRuntimeOverlay: false,
      canWriteBaseDurationSeed: false,
    }))
  })

  it('keeps shadow-report-only residual overlays out of runtime even when MAE improves', () => {
    const result = evaluateAlgorithmAssetForecastResidualOverlay({
      assetKey: 'forecast.residual.shadow',
      companyId: 'company-a',
      modelKey: 'taskDurationForecastService',
      modelVersion: 'v1',
      learningMaturity: 'shadow_report_only',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      rollbackTarget: 'forecast-residual-overlay:v1',
      conflictFree: true,
      samples: improvingForecastSamples,
      minAcceptedSamples: 3,
    })

    expect(result.summary).toEqual(expect.objectContaining({
      replayPassed: true,
      runtimeImpact: 'shadow_report_only',
    }))
    expect(result.overlayWrite).toEqual(expect.objectContaining({
      writeMode: 'shadow_report_only',
      canWriteRuntimeOverlay: false,
      canWriteBaseDurationSeed: false,
    }))
    expect(result.candidateEvent.governanceDecision.canWriteRuntime).toBe(false)
  })

  it('keeps project residual overlays below the default runtime sample gate out of publication', () => {
    const result = evaluateAlgorithmAssetForecastResidualOverlay({
      assetKey: 'forecast.residual.thin-project',
      companyId: 'company-a',
      projectId: 'project-a1',
      modelKey: 'taskDurationForecastService',
      modelVersion: 'v1',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      rollbackTarget: 'forecast-residual-overlay:v1',
      conflictFree: true,
      samples: improvingForecastSamples.map((sample) => ({
        ...sample,
        projectId: 'project-a1',
      })),
    })

    expect(result.summary).toEqual(expect.objectContaining({
      acceptedSampleCount: 3,
      replayPassed: false,
      runtimeImpact: 'review_required',
    }))
    expect(result.overlayWrite).toEqual(expect.objectContaining({
      writeMode: 'candidate_overlay_only',
      canWriteRuntimeOverlay: false,
    }))
    expect(result.candidateEvent.governanceDecision.canWriteRuntime).toBe(false)
    expect(result.candidateEvent.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'forecast_residual_overlay_runtime_sample_gate_not_met',
    ]))
    expect(result.candidateEvent.candidatePayload).toEqual(expect.objectContaining({
      sampleCount: 3,
      minAcceptedSamples: 5,
    }))
  })

  it('keeps company residual overlays below the default company runtime sample gate out of publication', () => {
    const result = evaluateAlgorithmAssetForecastResidualOverlay({
      assetKey: 'forecast.residual.thin-company',
      companyId: 'company-a',
      modelKey: 'taskDurationForecastService',
      modelVersion: 'v1',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      rollbackTarget: 'forecast-residual-overlay:v1',
      conflictFree: true,
      samples: improvingForecastSamples,
    })

    expect(result.summary).toEqual(expect.objectContaining({
      acceptedSampleCount: 3,
      replayPassed: false,
      runtimeImpact: 'review_required',
    }))
    expect(result.overlayWrite).toEqual(expect.objectContaining({
      writeMode: 'candidate_overlay_only',
      canWriteRuntimeOverlay: false,
    }))
    expect(result.candidateEvent.governanceDecision.canWriteRuntime).toBe(false)
    expect(result.candidateEvent.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'forecast_residual_overlay_runtime_sample_gate_not_met',
    ]))
    expect(result.candidateEvent.candidatePayload).toEqual(expect.objectContaining({
      sampleCount: 3,
      minAcceptedSamples: 10,
    }))
  })

  it('can persist evaluated residual overlays through the unified governance persistence contract', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO public.duration_forecast_residual_overlays')) {
        return [{ id: 'overlay-row-id' }] as T[]
      }
      return [] as T[]
    }

    const result = await evaluateAndPersistAlgorithmAssetForecastResidualOverlay({
      overlayKey: 'forecast-residual-overlay:v1',
      queryExec,
      assetKey: 'forecast.residual.company-a',
      companyId: '11111111-1111-4111-8111-111111111111',
      modelKey: 'taskDurationForecastService',
      modelVersion: 'v1',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      rollbackTarget: 'forecast-residual-overlay:v1',
      conflictFree: true,
      samples: improvingForecastSamples.map((sample) => ({
        ...sample,
        companyId: '11111111-1111-4111-8111-111111111111',
      })),
      minAcceptedSamples: 3,
    })

    expect(result.persistence).toEqual({
      persisted: true,
      overlayId: 'overlay-row-id',
    })
    expect(result.evaluation.summary.runtimeImpact).toBe('publish_gate_evidence')
    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.duration_forecast_residual_overlays')
    expect(sql).not.toContain('standard_work_duration')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(calls[0]?.params[14]).toEqual(expect.objectContaining({
      sampleCount: 3,
      minAcceptedSamples: 3,
      residualCorrectionDays: expect.any(Number),
      confidenceAdjustment: expect.any(Number),
      candidatePayload: expect.objectContaining({
        residualCorrectionDays: expect.any(Number),
        sampleCount: 3,
        minAcceptedSamples: 3,
      }),
    }))
  })

  it('rolls back residual overlay runtime publication without mutating duration seeds', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('UPDATE public.duration_forecast_residual_overlays')) {
        return [{ id: 'overlay-row-id', overlay_key: 'forecast-residual-overlay:v1' }] as T[]
      }
      return [] as T[]
    }

    const result = await rollbackAlgorithmAssetForecastResidualOverlayRuntimePublication({
      overlayKey: 'forecast-residual-overlay:v1',
      rollbackTarget: 'forecast-residual-overlay:v0',
      reason: 'impact_monitoring_regression',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      overlayKey: 'forecast-residual-overlay:v1',
      writesRuntimeOverlay: true,
      writesBaseDurationSeed: false,
    }))

    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).toContain('update public.duration_forecast_residual_overlays')
    expect(sql).toContain("runtime_publication_status = 'runtime_rolled_back'")
    expect(sql).toContain('rollback_execution')
    expect(sql).toContain('rolled_back_at')
    expect(sql).not.toContain('standard_work_duration')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
  })
})
