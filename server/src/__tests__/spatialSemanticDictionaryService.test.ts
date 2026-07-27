import { describe, expect, it } from 'vitest'

import {
  auditSpatialSemanticDictionary,
  getSpatialSemanticDictionaryEntry,
  listSpatialSemanticDictionary,
  normalizeSpatialSemanticCode,
} from '../services/spatialSemanticDictionaryService.js'
import { ENGINEERING_OBJECT_TYPES } from '../types/db.js'

describe('spatialSemanticDictionaryService', () => {
  it('normalizes common Chinese and English space labels to controlled semantic codes', () => {
    expect(normalizeSpatialSemanticCode('地下室')).toEqual(expect.objectContaining({
      code: 'basement',
      dimension: 'workface',
      targetEngineeringObjectType: 'basement',
    }))
    expect(normalizeSpatialSemanticCode('workface:standard_floor')).toEqual(expect.objectContaining({
      code: 'standard_floor',
      dimension: 'workface',
      targetEngineeringObjectType: 'floor',
    }))
    expect(normalizeSpatialSemanticCode('室外总平')).toEqual(expect.objectContaining({
      code: 'outdoor_site',
      dimension: 'physical_space_kind',
      targetEngineeringObjectType: 'physical_zone',
    }))
    expect(normalizeSpatialSemanticCode('system:structural')).toEqual(expect.objectContaining({
      code: 'structural',
      dimension: 'system',
      targetEngineeringObjectType: 'functional_area',
    }))
  })

  it('rejects unknown spatial terms instead of silently accepting bare strings', () => {
    expect(normalizeSpatialSemanticCode('随手写的空间')).toBeNull()
    expect(getSpatialSemanticDictionaryEntry('positionBasis:somewhere')).toBeNull()
  })

  it('keeps dictionary targets aligned with engineering object types and scope-assignment metadata', () => {
    const audit = auditSpatialSemanticDictionary()

    const targetTypes = new Set(listSpatialSemanticDictionary().map((entry) => entry.targetEngineeringObjectType))
    for (const objectType of ENGINEERING_OBJECT_TYPES) {
      expect(targetTypes.has(objectType), `${objectType} should have at least one semantic dictionary entry`).toBe(true)
    }
    expect(audit.unknownEngineeringObjectTypes).toEqual([])
    expect(audit.uncoveredEngineeringObjectTypes).toEqual([])
    expect(audit.uncoveredScopeAssignmentMetadataValues).toEqual([])
    expect(audit.status).toBe('ready')
    expect(audit.engineeringObjectTypes).toEqual([...ENGINEERING_OBJECT_TYPES])
  })
})
