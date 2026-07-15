import { describe, expect, it } from 'vitest'

import {
  buildOrdinaryBusinessDtoExposureMatrix,
  buildV14223OrdinaryBusinessDtoExposureMatrix,
} from '../services/ordinaryBusinessDtoExposureMatrixService.js'

describe('ordinaryBusinessDtoExposureMatrixService', () => {
  it('confirms the v1.4.22.3 ordinary business DTO exposure evidence matrix', () => {
    const matrix = buildV14223OrdinaryBusinessDtoExposureMatrix()

    expect(matrix.status).toBe('ordinary_business_dto_exposure_confirmed')
    expect(matrix.canDeclareOrdinaryBusinessDtoExposureComplete).toBe(true)
    expect(matrix.requiredSurfaces).toEqual([
      'business_route_contract',
      'api_dto_sanitizer',
      'ordinary_page_component_check',
      'admin_governance_field_boundary',
    ])
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'business_route_contract',
        status: 'confirmed',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'api_dto_sanitizer',
        status: 'confirmed',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'ordinary_page_component_check',
        status: 'confirmed',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'admin_governance_field_boundary',
        status: 'confirmed',
        missingReasons: [],
      }),
    ]))
  })

  it('keeps the matrix incomplete when a required evidence surface is missing', () => {
    const matrix = buildOrdinaryBusinessDtoExposureMatrix({
      evidence: [{
        surface: 'business_route_contract',
        status: 'verified',
        evidenceRefs: ['server/src/routes/tasks.ts'],
      }],
    })

    expect(matrix.status).toBe('ordinary_business_dto_exposure_incomplete')
    expect(matrix.canDeclareOrdinaryBusinessDtoExposureComplete).toBe(false)
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'api_dto_sanitizer',
        status: 'incomplete',
        missingReasons: ['api_dto_sanitizer_evidence_required'],
      }),
    ]))
  })

  it('does not allow required ordinary business DTO surfaces to be bypassed as not applicable', () => {
    const matrix = buildOrdinaryBusinessDtoExposureMatrix({
      evidence: [
        {
          surface: 'business_route_contract',
          status: 'verified',
          evidenceRefs: ['tasks route contract'],
        },
        {
          surface: 'api_dto_sanitizer',
          status: 'verified',
          evidenceRefs: ['taskDtoService'],
        },
        {
          surface: 'ordinary_page_component_check',
          status: 'not_applicable',
          reason: 'ordinary page does not render this field',
          evidenceRefs: ['manual note'],
        },
        {
          surface: 'admin_governance_field_boundary',
          status: 'verified',
          evidenceRefs: ['admin governance boundary'],
        },
      ],
    })

    expect(matrix.status).toBe('ordinary_business_dto_exposure_incomplete')
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'ordinary_page_component_check',
        status: 'incomplete',
        missingReasons: ['ordinary_page_component_check_verified_status_required'],
      }),
    ]))
  })
})
