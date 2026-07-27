import { describe, expect, it } from 'vitest'

import {
  buildTemplateWriteSurfaceLegacyScopeSanitizerMatrix,
  buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix,
} from '../services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.js'

describe('templateWriteSurfaceLegacyScopeSanitizerMatrixService', () => {
  it('confirms the v1.4.22.3 template write-surface legacy scope sanitizer matrix', () => {
    const matrix = buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix()

    expect(matrix.status).toBe('template_write_surface_legacy_scope_sanitizer_confirmed')
    expect(matrix.canDeclareTemplateWriteSurfaceLegacyScopeSanitizerComplete).toBe(true)
    expect(matrix.requiredSurfaces).toEqual([
      'template_create_write',
      'template_update_write',
      'template_clone_write',
      'template_json_import_write',
      'template_bootstrap_draft_write',
      'frontend_template_preview_dto',
    ])
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'template_create_write',
        status: 'confirmed',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'template_update_write',
        status: 'confirmed',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'template_clone_write',
        status: 'confirmed',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'template_json_import_write',
        status: 'confirmed',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'template_bootstrap_draft_write',
        status: 'confirmed',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'frontend_template_preview_dto',
        status: 'confirmed',
        missingReasons: [],
      }),
    ]))
  })

  it('keeps the matrix incomplete when a required write surface is missing evidence', () => {
    const matrix = buildTemplateWriteSurfaceLegacyScopeSanitizerMatrix({
      evidence: [{
        surface: 'template_create_write',
        status: 'verified',
        evidenceRefs: ['server/src/routes/wbs-templates.ts create route sanitizer'],
      }],
    })

    expect(matrix.status).toBe('template_write_surface_legacy_scope_sanitizer_incomplete')
    expect(matrix.canDeclareTemplateWriteSurfaceLegacyScopeSanitizerComplete).toBe(false)
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'template_update_write',
        status: 'incomplete',
        missingReasons: ['template_update_write_evidence_required'],
      }),
    ]))
  })

  it('does not allow required template write surfaces to be bypassed as not applicable', () => {
    const matrix = buildTemplateWriteSurfaceLegacyScopeSanitizerMatrix({
      evidence: [
        {
          surface: 'template_create_write',
          status: 'verified',
          evidenceRefs: ['create sanitizer'],
        },
        {
          surface: 'template_update_write',
          status: 'not_applicable',
          reason: 'updates are currently disabled',
          evidenceRefs: ['manual note'],
        },
        {
          surface: 'template_clone_write',
          status: 'verified',
          evidenceRefs: ['clone sanitizer'],
        },
        {
          surface: 'template_json_import_write',
          status: 'verified',
          evidenceRefs: ['import sanitizer'],
        },
        {
          surface: 'template_bootstrap_draft_write',
          status: 'verified',
          evidenceRefs: ['draft sanitizer'],
        },
        {
          surface: 'frontend_template_preview_dto',
          status: 'verified',
          evidenceRefs: ['frontend dto sanitizer'],
        },
      ],
    })

    expect(matrix.status).toBe('template_write_surface_legacy_scope_sanitizer_incomplete')
    expect(matrix.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'template_update_write',
        status: 'incomplete',
        missingReasons: ['template_update_write_verified_status_required'],
      }),
    ]))
  })
})
