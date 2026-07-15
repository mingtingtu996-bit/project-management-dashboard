import { apiGet, type AuthFetchOptions } from '@/lib/apiClient'

// Runtime consumption and release evidence are independent: evidence can block a release claim without disabling working code.
export type V14231ReadinessStatus =
  | 'production-ready'
  | 'needs-gating'
  | 'not-ready'
  | 'display-only'

export type V14231ReleaseReadinessStatus =
  | 'verified'
  | 'needs-gating'
  | 'not-applicable'

export interface V14231ConsumptionBoundary {
  canUseAsPrimaryMetric: boolean
  canUseAsPrimaryConclusion: boolean
  canUseAsStableAction: boolean
  requiresDisplayOnlyDegradation: boolean
}

export interface V14231ItemEvidenceGate {
  required: boolean
  verified: boolean
  reasons: string[]
}

export interface V14231ReadinessGateEvaluation {
  status: 'verified' | 'missing' | 'invalid' | 'stale' | 'mismatch' | 'failed'
  verified: boolean
  reasons: string[]
  generatedAt: string | null
  releaseDigest: string | null
  artifactDigest: string | null
  targetEnvironment: string | null
  passedScripts: string[]
}

export interface V14231CapabilityReadiness extends V14231ConsumptionBoundary {
  kind: 'capability'
  key: string
  name: string
  status: V14231ReadinessStatus
  declaredStatus?: V14231ReadinessStatus
  releaseReadinessStatus?: V14231ReleaseReadinessStatus
  evidenceGate?: V14231ItemEvidenceGate
  currentStatusText: string
  codeEvidence: string
  unlockCondition: string
  consumptionRule: string
  sourcePlan: 'v1.4.23.1-A'
  sourceSection: '4.7.05'
  sourceRowRef: string
  browserVerificationScripts: string[]
  browserVerificationPolicy: string
}

export interface V14231PageConsumptionReadiness extends V14231ConsumptionBoundary {
  kind: 'page'
  key: string
  page: string
  pageAvailability: 'available' | 'unavailable'
  actionReadiness: 'stable' | 'mixed' | 'gated'
  status: V14231ReadinessStatus
  declaredStatus?: V14231ReadinessStatus
  releaseReadinessStatus?: V14231ReleaseReadinessStatus
  evidenceGate?: V14231ItemEvidenceGate
  currentStatusText: string
  consumableCapabilities: string
  uiDegradationStrategy: string
  forbiddenActions: string
  sourcePlan: 'v1.4.23.1-A'
  sourceSection: '4.7.06'
  sourceRowRef: string
  browserVerificationScripts: string[]
  browserVerificationPolicy: string
}

export interface V14231ReadinessLedger {
  sourcePlan: 'v1.4.23.1-A'
  sourceSections: ['4.7.05', '4.7.06']
  allowedStatuses: V14231ReadinessStatus[]
  defaultUnregisteredStatus: 'not-ready'
  evidenceGate: V14231ReadinessGateEvaluation
  capabilities: V14231CapabilityReadiness[]
  pages: V14231PageConsumptionReadiness[]
}

export type V14231ActionableSurfaceStatus = 'stable_action' | 'needs-gating' | 'display-only'

export interface V14231ActionableSurface {
  key: string
  status: V14231ActionableSurfaceStatus
  sourceCloseoutItems?: string[]
  stableTargetRoute?: string
  permissionGate?: string
  auditTrail?: string
  failureRecovery?: string
  userVisibleEntry?: string
  boundaryPolicy?: {
    canUseAsStableAction?: boolean
    writesRuntimePublication?: boolean
    declaresProductionReady?: boolean
    requiresLiveEvidenceForUpgrade?: boolean
  }
}

export interface V14231ActionableSurfaceLedger {
  sourcePlan: 'v1.4.23.1-A'
  sourceSections: ['C-07', 'C-09', 'C-12', 'C-13']
  defaultUnregisteredSurfaceStatus: 'display-only'
  requiredFields: string[]
  surfaces: V14231ActionableSurface[]
}

export type V14231ReadinessItem = {
  status?: string
  releaseReadinessStatus?: V14231ReleaseReadinessStatus
  canUseAsPrimaryMetric?: boolean
  canUseAsPrimaryConclusion?: boolean
  canUseAsStableAction?: boolean
  requiresDisplayOnlyDegradation?: boolean
}

export function normalizeV14231ConsumptionBoundary(
  item: V14231ReadinessItem | null | undefined,
): V14231ConsumptionBoundary {
  // v1.4.23.1-A C-13 boundary: only explicit production-ready rows with flags may avoid display-only degradation.
  const isProductionReady = item?.status === 'production-ready'
  const allowsPrimaryConsumption = isProductionReady
    && item?.canUseAsPrimaryMetric === true
    && item?.canUseAsPrimaryConclusion === true
    && item?.canUseAsStableAction === true
    && item?.requiresDisplayOnlyDegradation === false

  return {
    canUseAsPrimaryMetric: allowsPrimaryConsumption,
    canUseAsPrimaryConclusion: allowsPrimaryConsumption,
    canUseAsStableAction: allowsPrimaryConsumption,
    requiresDisplayOnlyDegradation: !allowsPrimaryConsumption,
  }
}

export function canUseV14231AsPrimaryMetric(item: V14231ReadinessItem | null | undefined): boolean {
  return normalizeV14231ConsumptionBoundary(item).canUseAsPrimaryMetric
}

export function canUseV14231AsPrimaryConclusion(item: V14231ReadinessItem | null | undefined): boolean {
  return normalizeV14231ConsumptionBoundary(item).canUseAsPrimaryConclusion
}

export function canUseV14231AsStableAction(item: V14231ReadinessItem | null | undefined): boolean {
  return normalizeV14231ConsumptionBoundary(item).canUseAsStableAction
}

export function canUseV14231ActionableSurfaceAsStableAction(
  surface: Pick<V14231ActionableSurface, 'status' | 'boundaryPolicy'> | null | undefined,
): boolean {
  return surface?.status === 'stable_action'
    && surface.boundaryPolicy?.canUseAsStableAction === true
    && surface.boundaryPolicy.writesRuntimePublication === false
    && surface.boundaryPolicy.declaresProductionReady === false
}

export function mustDegradeV14231ToDisplayOnly(item: V14231ReadinessItem | null | undefined): boolean {
  return normalizeV14231ConsumptionBoundary(item).requiresDisplayOnlyDegradation
}

export async function fetchV14231ReadinessLedger(
  options?: AuthFetchOptions,
): Promise<V14231ReadinessLedger> {
  return apiGet<V14231ReadinessLedger>('/api/v14231-readiness', {
    cache: 'no-store',
    ...options,
  })
}

export async function fetchV14231CapabilityReadiness(
  nameOrKey: string,
  options?: AuthFetchOptions,
): Promise<V14231CapabilityReadiness> {
  return apiGet<V14231CapabilityReadiness>(
    `/api/v14231-readiness/capabilities/${encodeURIComponent(nameOrKey)}`,
    {
      cache: 'no-store',
      ...options,
    },
  )
}

export async function fetchV14231PageConsumptionReadiness(
  pageOrKey: string,
  options?: AuthFetchOptions,
): Promise<V14231PageConsumptionReadiness> {
  return apiGet<V14231PageConsumptionReadiness>(
    `/api/v14231-readiness/pages/${encodeURIComponent(pageOrKey)}`,
    {
      cache: 'no-store',
      ...options,
    },
  )
}

export async function fetchV14231ActionableSurfaceLedger(
  options?: AuthFetchOptions,
): Promise<V14231ActionableSurfaceLedger> {
  return apiGet<V14231ActionableSurfaceLedger>('/api/v14231-readiness/actionable-surfaces', {
    cache: 'no-store',
    ...options,
  })
}

export async function fetchV14231ActionableSurface(
  key: string,
  options?: AuthFetchOptions,
): Promise<V14231ActionableSurface> {
  return apiGet<V14231ActionableSurface>(
    `/api/v14231-readiness/actionable-surfaces/${encodeURIComponent(key)}`,
    {
      cache: 'no-store',
      ...options,
    },
  )
}
