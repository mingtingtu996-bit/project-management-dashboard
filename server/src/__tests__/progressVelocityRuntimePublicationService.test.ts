import { describe, expect, it, vi } from 'vitest'

import { loadPublishedProgressVelocityRuntime } from '../services/progressVelocityRuntimePublicationService.js'

function selection(overrides: Record<string, unknown> = {}) {
  return {
    selectorCode: 'duration_context_policy_runtime_selector',
    parameterKey: 'duration.project_progress_velocity_multiplier',
    consumptionMode: 'stable',
    deterministicValue: 1,
    selectedValue: 0.86,
    effectiveSource: 'stable_runtime_publication',
    runtimeApplied: true,
    publicationKey: 'velocity-stable-1',
    publicationStatus: 'published',
    scopeLevel: 'project',
    rollbackTarget: 'velocity-stable-0',
    reasonCodes: [],
    ...overrides,
  } as any
}

describe('progressVelocityRuntimePublicationService', () => {
  it('maps a stable scoped publication to the runtime learning contract without reading samples', async () => {
    const resolveRuntimeSelection = vi.fn(async () => selection())

    const result = await loadPublishedProgressVelocityRuntime({
      projectId: 'project-1',
      consumerKey: 'taskDurationForecastService.history_velocity',
    }, {
      resolveCompanyId: async () => 'company-1',
      resolveRuntimeSelection,
    })

    expect(result).toEqual(expect.objectContaining({
      multiplier: 0.86,
      durationRatio: 0.86,
      actionPolicy: 'auto_apply',
      confidenceLevel: 'high',
    }))
    expect(result?.metadata).toEqual(expect.objectContaining({
      publicationKey: 'velocity-stable-1',
      runtimeAuthority: 'published_parameter_only',
      rawSampleConsumption: false,
    }))
    expect(resolveRuntimeSelection).toHaveBeenCalledTimes(1)
  })

  it('uses an explicit bounded canary contract when no stable publication exists', async () => {
    const resolveRuntimeSelection = vi.fn()
      .mockResolvedValueOnce(selection({
        runtimeApplied: false,
        selectedValue: 1,
        effectiveSource: 'deterministic_current_factor',
        publicationKey: null,
        publicationStatus: null,
        reasonCodes: ['runtime_parameter_publication_not_found'],
      }))
      .mockResolvedValueOnce(selection({
        consumptionMode: 'canary',
        selectedValue: 1.12,
        effectiveSource: 'canary_runtime_publication',
        publicationKey: 'velocity-canary-1',
        publicationStatus: 'canary',
      }))

    const result = await loadPublishedProgressVelocityRuntime({
      projectId: 'project-1',
      companyId: 'company-1',
      consumerKey: 'durationSuggestionService.similar_task_rhythm',
    }, { resolveRuntimeSelection })

    expect(result).toEqual(expect.objectContaining({
      multiplier: 1.12,
      confidenceLevel: 'medium',
    }))
    expect(resolveRuntimeSelection).toHaveBeenNthCalledWith(2, expect.objectContaining({
      consumptionMode: 'canary',
      canaryRuntimeBoundary: expect.objectContaining({
        consumerKey: 'durationSuggestionService.similar_task_rhythm',
        scopeBoundary: 'project',
        trafficSubjectKey: 'project-1',
      }),
    }))
  })

  it('fails closed when tenant ownership or a valid publication is unavailable', async () => {
    const resolveRuntimeSelection = vi.fn()

    const missingTenant = await loadPublishedProgressVelocityRuntime({
      projectId: 'project-1',
      consumerKey: 'runtime-consumer',
    }, {
      resolveCompanyId: async () => null,
      resolveRuntimeSelection,
    })

    expect(missingTenant).toBeNull()
    expect(resolveRuntimeSelection).not.toHaveBeenCalled()
  })
})
