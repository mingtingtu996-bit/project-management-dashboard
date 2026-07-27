export type OrdinaryBusinessDtoExposureSurface =
  | 'business_route_contract'
  | 'api_dto_sanitizer'
  | 'ordinary_page_component_check'
  | 'admin_governance_field_boundary'

export type OrdinaryBusinessDtoExposureEvidence = {
  surface: OrdinaryBusinessDtoExposureSurface | string
  status: 'verified' | 'not_applicable'
  evidenceRefs?: string[]
  reason?: string
}

export type OrdinaryBusinessDtoExposureMatrixInput = {
  evidence: OrdinaryBusinessDtoExposureEvidence[]
}

export type OrdinaryBusinessDtoExposureMatrixRow = {
  surface: string
  status: 'confirmed' | 'incomplete'
  missingReasons: string[]
}

export type OrdinaryBusinessDtoExposureMatrix = {
  status: 'ordinary_business_dto_exposure_confirmed' | 'ordinary_business_dto_exposure_incomplete'
  canDeclareOrdinaryBusinessDtoExposureComplete: boolean
  requiredSurfaces: string[]
  rows: OrdinaryBusinessDtoExposureMatrixRow[]
}

const REQUIRED_DTO_EXPOSURE_SURFACES = [
  'business_route_contract',
  'api_dto_sanitizer',
  'ordinary_page_component_check',
  'admin_governance_field_boundary',
] as const

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEvidenceRef(evidence: OrdinaryBusinessDtoExposureEvidence) {
  return (evidence.evidenceRefs ?? []).some(hasText)
}

function reasonsForSurface(
  surface: typeof REQUIRED_DTO_EXPOSURE_SURFACES[number],
  evidence: OrdinaryBusinessDtoExposureEvidence | undefined,
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
  surface: OrdinaryBusinessDtoExposureSurface,
  evidenceRefs: string[],
): OrdinaryBusinessDtoExposureEvidence {
  return {
    surface,
    status: 'verified',
    evidenceRefs,
  }
}

export function buildOrdinaryBusinessDtoExposureMatrix(
  input: OrdinaryBusinessDtoExposureMatrixInput,
): OrdinaryBusinessDtoExposureMatrix {
  const rows = REQUIRED_DTO_EXPOSURE_SURFACES.map((surface) => {
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
  const canDeclareOrdinaryBusinessDtoExposureComplete = rows.every((row) => row.status === 'confirmed')

  return {
    status: canDeclareOrdinaryBusinessDtoExposureComplete
      ? 'ordinary_business_dto_exposure_confirmed'
      : 'ordinary_business_dto_exposure_incomplete',
    canDeclareOrdinaryBusinessDtoExposureComplete,
    requiredSurfaces: [...REQUIRED_DTO_EXPOSURE_SURFACES],
    rows,
  }
}

export function buildV14223OrdinaryBusinessDtoExposureMatrix(): OrdinaryBusinessDtoExposureMatrix {
  return buildOrdinaryBusinessDtoExposureMatrix({
    evidence: [
      verified('business_route_contract', [
        'server/src/routes/tasks.ts uses sanitizeTaskForClient on detail/list/commit responses',
        'server/src/__tests__/taskDtoService.test.ts',
      ]),
      verified('api_dto_sanitizer', [
        'server/src/services/taskDtoService.ts strips deleted scope-object fields from task read DTOs',
        'client/src/services/wbsTemplateGenerationApi.ts strips deleted scope-object fields before WBS preview requests',
        'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
      ]),
      verified('ordinary_page_component_check', [
        'client/src/pages and client/src/components source scan has no deleted scope-object field usage outside sanitizer/test evidence',
        'client/src/pages/__tests__/Materials.test.tsx asserts ordinary page text and update payload do not expose professional_object_id',
      ]),
      verified('admin_governance_field_boundary', [
        'server/src/routes/algorithm-seeds.ts requires company admin for governance-workbench routes',
        'client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx is the high-permission governance evidence page',
        'client/src/services/ruleAssetGovernanceWorkbenchApi.ts',
      ]),
    ],
  })
}
