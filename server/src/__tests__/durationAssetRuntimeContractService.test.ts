import { describe, expect, it } from 'vitest'

import {
  classifyAlgorithmSeedRuntimeRole,
  mapAlgorithmSeedResolverSource,
  resolveEffectiveDurationAsset,
  type DurationAssetResolutionCandidate,
} from '../services/durationAssetRuntimeContractService.js'

type TestValue = { days: number }

function candidate(
  overrides: Partial<DurationAssetResolutionCandidate<TestValue>> = {},
): DurationAssetResolutionCandidate<TestValue> {
  return {
    stableCode: 'duration.concrete.structure',
    assetType: 'standard_work_duration',
    role: 'stable_runtime',
    effectiveSource: 'system_stable',
    value: { days: 12 },
    versionId: 'system-v1',
    publicationKey: 'publication-system-v1',
    conflictCodes: [],
    rollbackTarget: 'system-v0',
    ...overrides,
  }
}

describe('durationAssetRuntimeContractService', () => {
  it('classifies governed seed records and TypeScript fallback by runtime role', () => {
    expect(classifyAlgorithmSeedRuntimeRole('standard_work_duration', 'project_override'))
      .toBe('stable_runtime')
    expect(classifyAlgorithmSeedRuntimeRole('t2_division_rhythm_template', 'company_override'))
      .toBe('stable_runtime')
    expect(classifyAlgorithmSeedRuntimeRole('work_calendar', 'active_seed'))
      .toBe('stable_runtime')
    expect(classifyAlgorithmSeedRuntimeRole('cross_item_workflow', 'ts_seed_fallback'))
      .toBe('system_bootstrap')

    expect(mapAlgorithmSeedResolverSource('project_override')).toBe('project_stable')
    expect(mapAlgorithmSeedResolverSource('company_override')).toBe('company_stable')
    expect(mapAlgorithmSeedResolverSource('active_seed')).toBe('system_stable')
    expect(mapAlgorithmSeedResolverSource('ts_seed_fallback')).toBe('system_bootstrap')
  })

  it('resolves project, company, industry, system and bootstrap sources in descending priority', () => {
    const result = resolveEffectiveDurationAsset([
      candidate({
        role: 'system_bootstrap',
        effectiveSource: 'system_bootstrap',
        value: { days: 15 },
        versionId: 'bootstrap-v1',
        publicationKey: null,
        rollbackTarget: null,
      }),
      candidate({
        effectiveSource: 'industry_stable',
        value: { days: 13 },
        versionId: 'industry-v1',
      }),
      candidate({
        effectiveSource: 'company_stable',
        value: { days: 11 },
        versionId: 'company-v2',
      }),
      candidate({
        effectiveSource: 'project_stable',
        value: { days: 9 },
        versionId: 'project-v3',
        publicationKey: 'publication-project-v3',
        rollbackTarget: 'project-v2',
      }),
      candidate({
        effectiveSource: 'system_stable',
        value: { days: 14 },
        versionId: 'system-v2',
      }),
    ])

    expect(result).toMatchObject({
      stableCode: 'duration.concrete.structure',
      assetType: 'standard_work_duration',
      role: 'stable_runtime',
      effectiveSource: 'project_stable',
      value: { days: 9 },
      versionId: 'project-v3',
      publicationKey: 'publication-project-v3',
      runtimeConsumable: true,
      rollbackTarget: 'project-v2',
      conflictCodes: [],
    })
    expect(result.suppressedSources).toEqual([
      'company_stable',
      'industry_stable',
      'system_stable',
      'system_bootstrap',
    ])
  })

  it('keeps candidate advice from overriding a runtime bootstrap asset', () => {
    const result = resolveEffectiveDurationAsset([
      candidate({
        role: 'candidate_advisory',
        effectiveSource: 'candidate_advisory',
        value: { days: 7 },
        versionId: 'candidate-v9',
      }),
      candidate({
        role: 'system_bootstrap',
        effectiveSource: 'system_bootstrap',
        value: { days: 15 },
        versionId: 'bootstrap-v1',
        publicationKey: null,
        rollbackTarget: null,
      }),
    ])

    expect(result).toMatchObject({
      effectiveSource: 'system_bootstrap',
      role: 'system_bootstrap',
      value: { days: 15 },
      runtimeConsumable: true,
    })
    expect(result.suppressedSources).toEqual(['candidate_advisory'])
  })

  it('uses canary runtime only inside the exact declared boundary', () => {
    const stable = candidate({
      effectiveSource: 'company_stable',
      value: { days: 11 },
      versionId: 'company-stable-v2',
    })
    const canary = candidate({
      role: 'canary_runtime',
      effectiveSource: 'project_stable',
      value: { days: 8 },
      versionId: 'project-canary-v1',
      canaryBoundary: {
        companyId: 'company-1',
        projectId: 'project-1',
        surface: 'wizard_master_plan',
        trafficKey: 'trial-a',
      },
    })

    expect(resolveEffectiveDurationAsset([stable, canary], {
      canaryBoundary: {
        companyId: 'company-1',
        projectId: 'project-2',
        surface: 'wizard_master_plan',
        trafficKey: 'trial-a',
      },
    })).toMatchObject({
      effectiveSource: 'company_stable',
      value: { days: 11 },
      runtimeConsumable: true,
    })

    expect(resolveEffectiveDurationAsset([stable, canary], {
      canaryBoundary: {
        companyId: 'company-1',
        projectId: 'project-1',
        surface: 'wizard_master_plan',
        trafficKey: 'trial-a',
      },
    })).toMatchObject({
      effectiveSource: 'project_stable',
      role: 'canary_runtime',
      value: { days: 8 },
      runtimeConsumable: true,
    })
  })

  it('blocks a conflicting higher-priority runtime asset instead of silently falling back', () => {
    const result = resolveEffectiveDurationAsset([
      candidate({
        effectiveSource: 'project_stable',
        value: { days: 8 },
        versionId: 'project-v4',
        conflictCodes: ['scope_fact_conflict'],
      }),
      candidate({
        role: 'system_bootstrap',
        effectiveSource: 'system_bootstrap',
        value: { days: 15 },
        versionId: 'bootstrap-v1',
        publicationKey: null,
        rollbackTarget: null,
      }),
    ])

    expect(result).toMatchObject({
      effectiveSource: 'project_stable',
      value: null,
      runtimeConsumable: false,
      conflictCodes: ['scope_fact_conflict'],
    })
    expect(result.suppressedSources).toEqual(['system_bootstrap'])
  })

  it('returns candidate advice as non-consumable and rejects retired-only input', () => {
    expect(resolveEffectiveDurationAsset([
      candidate({
        role: 'candidate_advisory',
        effectiveSource: 'candidate_advisory',
        versionId: 'candidate-v1',
      }),
    ])).toMatchObject({
      role: 'candidate_advisory',
      effectiveSource: 'candidate_advisory',
      value: { days: 12 },
      runtimeConsumable: false,
    })

    expect(resolveEffectiveDurationAsset([
      candidate({
        role: 'retired',
        effectiveSource: 'system_stable',
        versionId: 'retired-v1',
      }),
    ])).toMatchObject({
      role: 'retired',
      effectiveSource: 'none',
      value: null,
      runtimeConsumable: false,
      conflictCodes: ['no_runtime_consumable_asset'],
    })
  })
})
