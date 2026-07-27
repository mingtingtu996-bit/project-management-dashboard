import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  getSpatialSemanticDictionaryEntry,
  normalizeSpatialSemanticCode,
  type SpatialSemanticDictionaryEntry,
} from '../services/spatialSemanticDictionaryService.js'
import {
  buildConstructionSeedScopeContext,
  inferConstructionScopeFromFact,
  readConstructionDimensionValue,
} from '../services/constructionScopeInferenceService.js'
import { buildBuildingPatternExecutionProfile } from '../services/buildingPatternExecutionProfileService.js'
import { buildConstructionRhythmExpansion } from '../services/constructionRhythmExpansionService.js'
import { clearAlgorithmSeedResolverCache } from '../services/algorithmSeedResolver.js'

describe('constructionScopeInferenceService', () => {
  it('keeps explicit system and workface object ids ahead of inferred synthetic keys', () => {
    const fact = {
      title: '消防联动调试',
      standard_work_code: 'FIR-01-01-01-P03',
      system_object_id: 'system-explicit-fire',
      engineering_object_id: 'workface-explicit-public',
    }

    expect(readConstructionDimensionValue(fact, 'system')).toBe('system-explicit-fire')
    expect(readConstructionDimensionValue(fact, 'workface')).toBe('workface-explicit-public')
  })

  it('infers MEP system and workface dimensions from standard work and specialty template facts', () => {
    const inferred = inferConstructionScopeFromFact({
      title: '消防联动调试',
      standard_work_code: 'FIR-01-01-01-P03',
      template_id: 'china-cecs-fire-system',
      standard_task_metadata: {
        projectGenerationFacts: {
          methodVariantCodes: ['fire_alarm'],
        },
      },
    })

    expect(inferred.systemKey).toBe('system:fire')
    expect(inferred.workfaceKey).toBe('workface:mep_system_zone')
    expect(inferred.scopeDimensions).toEqual(expect.arrayContaining(['system', 'workface']))
    expect(inferred.rhythmDrivers).toEqual(expect.arrayContaining(['system_count', 'workface_count']))
    expect(inferred.phaseWindow).toBe('mep')
    expect(inferred.primaryWorkfaceType).toBe('mep_system_zone')
  })

  it('keeps inferred system and workface keys inside SpatialSemanticDictionary instead of emitting unchecked bare strings', () => {
    const cases = [
      {
        title: '消防联动调试',
        standard_work_code: 'FIR-01-01-01-P03',
        template_id: 'china-cecs-fire-system',
        expectedSystemCode: 'fire',
        expectedWorkfaceCode: 'mep_system_zone',
      },
      {
        title: '数据中心机房 UPS 与冷通道调试',
        template_id: 'data-center-mission-critical',
        expectedSystemCode: 'data_center_room',
        expectedWorkfaceCode: 'data_center_room_zone',
      },
      {
        title: '地下室基础底板钢筋绑扎',
        standard_work_code: '01-02-01-P02',
        expectedSystemCode: null,
        expectedWorkfaceCode: 'foundation_section',
      },
    ]

    for (const item of cases) {
      const inferred = inferConstructionScopeFromFact(item)
      const semanticEntries = [
        inferred.systemKey ? getSpatialSemanticDictionaryEntry(inferred.systemKey) : null,
        inferred.workfaceKey ? getSpatialSemanticDictionaryEntry(inferred.workfaceKey) : null,
      ].filter(Boolean) as SpatialSemanticDictionaryEntry[]

      expect(inferred.systemKey ? normalizeSpatialSemanticCode(inferred.systemKey)?.code : null).toBe(item.expectedSystemCode)
      expect(inferred.workfaceKey ? normalizeSpatialSemanticCode(inferred.workfaceKey)?.code : null).toBe(item.expectedWorkfaceCode)
      expect(semanticEntries.every((entry) => ['system', 'workface'].includes(entry.dimension))).toBe(true)
    }
  })

  it('fails when construction-scope inference adds unregistered system or workface literals', () => {
    const source = readFileSync(new URL('../services/constructionScopeInferenceService.ts', import.meta.url), 'utf8')
    const inferredLiterals = Array.from(source.matchAll(/'((?:system|workface):[a-z0-9_]+)'/g))
      .map((match) => match[1])
      .filter((literal) => !literal.startsWith('workface:${'))
    const unknownLiterals = Array.from(new Set(inferredLiterals))
      .filter((literal) => !normalizeSpatialSemanticCode(literal))

    expect(unknownLiterals).toEqual([])
  })

  it('passes inferred system context into building-pattern seed matching without creating fake object ids', async () => {
    clearAlgorithmSeedResolverCache()
    const facts = [
      {
        id: 'fire-debug',
        title: '消防联动调试',
        standard_work_code: 'FIR-01-01-01-P03',
        template_id: 'china-cecs-fire-system',
        acceptance_required: true,
        standard_task_metadata: {
          projectGenerationFacts: {
            businessType: 'commercial_opening',
            methodVariantCodes: ['fire_alarm', 'opening_readiness'],
          },
        },
      },
      {
        id: 'intelligent-debug',
        title: '智能化子系统联调',
        standard_work_code: 'INT-01-01-01-P04',
        template_id: 'china-intelligent-building-system',
        acceptance_required: true,
      },
    ]

    const profile = await buildBuildingPatternExecutionProfile('project-1', facts)
    const expansion = buildConstructionRhythmExpansion(profile, facts)

    expect(profile.dataSupport.scopeDimensionCounts).toEqual(expect.objectContaining({
      system: 2,
      workface: 2,
    }))
    const modeCodes = [
      ...profile.modeCombination.phaseModes,
      ...profile.modeCombination.specialtyDomainModes,
      ...profile.modeCombination.handoverModes,
      ...profile.modeCombination.supportingModes,
    ].map((mode) => mode.patternCode)
    expect(modeCodes).toEqual(
      expect.arrayContaining(['mep_system_zone_commissioning']),
    )
    expect(expansion.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patternCode: 'mep_system_zone_commissioning',
        rhythmUnit: 'system',
        workfaceKeys: expect.arrayContaining(['system:fire', 'system:intelligent']),
      }),
    ]))
  }, 20_000)

  it('makes direct seed contexts consume inferred system and workface dimensions', () => {
    const context = buildConstructionSeedScopeContext({
      title: '医院洁净手术室医用气体与净化空调联调',
      standard_work_code: 'CLN-02-01-P03',
      template_id: 'china-cleanroom-medical-specialty',
    })

    expect(context.scopeDimensions).toEqual(expect.arrayContaining(['system', 'workface']))
    expect(context.rhythmDrivers).toEqual(expect.arrayContaining(['system_count', 'workface_count']))
    expect(context.phaseWindow).toBe('mep')
    expect(context.primaryWorkfaceType).toBe('medical_cleanroom_zone')
    expect(context.expansionStrategy).toBe('system_zone')
  })
})
