export type TemplateWriteSurfaceLegacyScopeSanitizerSurface =
  | 'template_create_write'
  | 'template_update_write'
  | 'template_clone_write'
  | 'template_json_import_write'
  | 'template_bootstrap_draft_write'
  | 'frontend_template_preview_dto'

export type TemplateWriteSurfaceLegacyScopeSanitizerEvidence = {
  surface: TemplateWriteSurfaceLegacyScopeSanitizerSurface | string
  status: 'verified' | 'not_applicable'
  evidenceRefs?: string[]
  reason?: string
}

export type TemplateWriteSurfaceLegacyScopeSanitizerMatrixInput = {
  evidence: TemplateWriteSurfaceLegacyScopeSanitizerEvidence[]
}

export type TemplateWriteSurfaceLegacyScopeSanitizerMatrixRow = {
  surface: string
  status: 'confirmed' | 'incomplete'
  missingReasons: string[]
}

export type TemplateWriteSurfaceLegacyScopeSanitizerMatrix = {
  status: 'template_write_surface_legacy_scope_sanitizer_confirmed' | 'template_write_surface_legacy_scope_sanitizer_incomplete'
  canDeclareTemplateWriteSurfaceLegacyScopeSanitizerComplete: boolean
  requiredSurfaces: string[]
  rows: TemplateWriteSurfaceLegacyScopeSanitizerMatrixRow[]
}

const REQUIRED_TEMPLATE_WRITE_SURFACES = [
  'template_create_write',
  'template_update_write',
  'template_clone_write',
  'template_json_import_write',
  'template_bootstrap_draft_write',
  'frontend_template_preview_dto',
] as const

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEvidenceRef(evidence: TemplateWriteSurfaceLegacyScopeSanitizerEvidence) {
  return (evidence.evidenceRefs ?? []).some(hasText)
}

function reasonsForSurface(
  surface: typeof REQUIRED_TEMPLATE_WRITE_SURFACES[number],
  evidence: TemplateWriteSurfaceLegacyScopeSanitizerEvidence | undefined,
) {
  if (!evidence) return [`${surface}_evidence_required`]

  const reasons: string[] = []
  if (evidence.status !== 'verified') reasons.push(`${surface}_verified_status_required`)
  if (!hasEvidenceRef(evidence)) reasons.push(`${surface}_evidence_ref_required`)
  if (evidence.status === 'not_applicable' && !hasText(evidence.reason)) {
    reasons.push(`${surface}_not_applicable_requires_reason`)
  }
  return reasons
}

function verified(
  surface: TemplateWriteSurfaceLegacyScopeSanitizerSurface,
  evidenceRefs: string[],
): TemplateWriteSurfaceLegacyScopeSanitizerEvidence {
  return {
    surface,
    status: 'verified',
    evidenceRefs,
  }
}

export function buildTemplateWriteSurfaceLegacyScopeSanitizerMatrix(
  input: TemplateWriteSurfaceLegacyScopeSanitizerMatrixInput,
): TemplateWriteSurfaceLegacyScopeSanitizerMatrix {
  const rows = REQUIRED_TEMPLATE_WRITE_SURFACES.map((surface) => {
    const missingReasons = reasonsForSurface(
      surface,
      input.evidence.find((evidence) => evidence.surface === surface),
    )
    return {
      surface,
      status: missingReasons.length > 0 ? 'incomplete' as const : 'confirmed' as const,
      missingReasons,
    }
  })
  const canDeclareTemplateWriteSurfaceLegacyScopeSanitizerComplete = rows.every((row) => row.status === 'confirmed')

  return {
    status: canDeclareTemplateWriteSurfaceLegacyScopeSanitizerComplete
      ? 'template_write_surface_legacy_scope_sanitizer_confirmed'
      : 'template_write_surface_legacy_scope_sanitizer_incomplete',
    canDeclareTemplateWriteSurfaceLegacyScopeSanitizerComplete,
    requiredSurfaces: [...REQUIRED_TEMPLATE_WRITE_SURFACES],
    rows,
  }
}

export function buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(): TemplateWriteSurfaceLegacyScopeSanitizerMatrix {
  return buildTemplateWriteSurfaceLegacyScopeSanitizerMatrix({
    evidence: [
      verified('template_create_write', [
        'server/src/routes/wbs-templates.ts create route uses sanitizeWbsTemplatePayload before wbs_templates.wbs_nodes insert',
        'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
      ]),
      verified('template_update_write', [
        'server/src/routes/wbs-templates.ts update route uses sanitizeWbsTemplatePayload before wbs_templates.wbs_nodes update',
        'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
      ]),
      verified('template_clone_write', [
        'server/src/routes/wbs-templates.ts clone route parses original nodes and sanitizes before cloned wbs_templates.wbs_nodes insert',
        'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
      ]),
      verified('template_json_import_write', [
        'server/src/routes/wbs-templates.ts JSON import sanitizes request body before template persistence',
        'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
      ]),
      verified('template_bootstrap_draft_write', [
        'server/src/routes/wbs-templates.ts insertTemplateDraft sanitizes completed-project template draft nodes before Supabase insert',
        'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
      ]),
      verified('frontend_template_preview_dto', [
        'client/src/services/wbsTemplateGenerationApi.ts strips deleted scope-object fields before WBS preview requests',
        'client/src/services/__tests__/wbsTemplateGenerationApi.test.ts',
      ]),
    ],
  })
}
