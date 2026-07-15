export type DetailLevel = 'overview' | 'standard' | 'detailed'

export type WizardMode = 'new' | 'starting_line'
export type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6
export const SCOPE_MODELING_STAGE_ORDER = ['spaces', 'subdivision', 'review'] as const
export type ScopeModelingStage = typeof SCOPE_MODELING_STAGE_ORDER[number]
export type PlanScopeCaliber =
  | 'full_project_master'
  | 'general_contract'
  | 'civil_structure_package'
  | 'specialty_package'
  | 'continuation_start_line'
export type DeliveryStandard =
  | 'rough'
  | 'mep_ready'
  | 'public_area_fitout'
  | 'full_fitout'
  | 'hotel_opening'
  | 'production_ready'
export type TerminalEvent =
  | 'contract_completion'
  | 'completion_acceptance'
  | 'owner_handover'
  | 'trial_opening'
  | 'production_validation'

export interface WizardDraftPayload {
  step: WizardStep
  mode: WizardMode
  projectName?: string
  location?: string
  plannedStartDate?: string
  plannedEndDate?: string
  actualStartDate?: string
  planScopeCaliber?: PlanScopeCaliber
  deliveryStandard?: DeliveryStandard
  terminalEvent?: TerminalEvent
  totalAreaM2?: number
  aboveGroundAreaM2?: number
  basementAreaM2?: number
  siteAreaM2?: number
  businessType?: string
  businessSubtype?: string
  methodVariantCodes?: string[]
  prefabSystemCodes?: string[]
  projectFeatures?: Record<string, number | boolean | string[]>
  towerCraneCount?: number
  constructionHoistCount?: number
  detailLevel?: DetailLevel
  scopeTree?: unknown[]
  scopeModelingStage?: ScopeModelingStage
  onboardingSubstage?: string
  onboardingPhaseProgress?: Record<string, unknown>
  onboardingPassedMilestones?: string[]
  saveAsCompanyTemplate?: boolean
  companyTemplateName?: string
}
