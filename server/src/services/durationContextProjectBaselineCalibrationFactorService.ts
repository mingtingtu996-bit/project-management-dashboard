import { loadPublishedProgressVelocityRuntime } from './progressVelocityRuntimePublicationService.js'
import type {
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function buildProjectBaselineCalibrationFactor(input: DurationContextInput): Promise<DurationContextFactor | null> {
  const projectId = normalizeId(input.projectId)
  if (!projectId) return null

  const publication = await loadPublishedProgressVelocityRuntime({
    projectId,
    consumerKey: 'durationContextProjectBaselineCalibrationFactorService.published_velocity',
  })
  if (!publication) return null

  const publicationMetadata = readRecord(publication.metadata)
  return {
    key: 'project_baseline_calibration',
    label: 'published project baseline calibration',
    multiplier: publication.multiplier,
    extraDays: 0,
    confidenceDelta: publication.confidenceDelta,
    actionPolicy: 'auto_apply',
    dataDependencies: ['algorithm_learnable_parameter_runtime_publications'],
    reason: publication.reason,
    source: 'project_history',
    metadata: {
      ...publicationMetadata,
      baselineFactor: publication.multiplier,
      sampleCount: publication.sampleCount,
      confidenceLevel: publication.confidenceLevel,
      calibrationLayer: 'published_project_baseline_factor',
      targetAccuracy: '+/-5%',
      runtimeAuthority: 'published_parameter_only',
      rawSampleConsumption: false,
    },
  }
}
