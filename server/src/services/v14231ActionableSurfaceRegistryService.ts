export type V14231ActionableSurfaceStatus = 'stable_action' | 'needs-gating' | 'display-only'

export type V14231ActionableSurface = {
  key: string
  sourceCloseoutItems: string[]
  owningUnit: '主执行环：行动闭环'
  status: V14231ActionableSurfaceStatus
  sourceIdentityRequired: boolean
  targetIdentityRequired: boolean
  permissionGate: string
  auditTrail: string
  failureRecovery: string
  userVisibleEntry: string
  stableTargetRoute: string
  boundaryPolicy: {
    canUseAsStableAction: boolean
    writesRuntimePublication: false
    declaresProductionReady: false
    requiresLiveEvidenceForUpgrade: boolean
  }
  codeEvidence: string[]
  testEvidence: string[]
}

export type V14231ActionableSurfaceLedger = {
  sourcePlan: 'v1.4.23.1-A'
  sourceSections: ['C-07', 'C-09', 'C-12', 'C-13']
  defaultUnregisteredSurfaceStatus: 'display-only'
  requiredFields: string[]
  surfaces: V14231ActionableSurface[]
}

const REQUIRED_FIELDS = [
  'sourceIdentityRequired',
  'targetIdentityRequired',
  'permissionGate',
  'auditTrail',
  'failureRecovery',
  'stableTargetRoute',
  'boundaryPolicy',
  'testEvidence',
]

export const RULE_ASSET_RUNTIME_ACTIONS_ENABLED_ENV = 'WORKBUDDY_RULE_ASSET_RUNTIME_ACTIONS_ENABLED'

const ACTIONABLE_SURFACES: V14231ActionableSurface[] = [
  {
    key: 'notification_attention_todo',
    sourceCloseoutItems: ['C-07', 'C-12', 'C-13'],
    owningUnit: '主执行环：行动闭环',
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'notification visibility is scoped by project/company membership and notification_user_states',
    auditTrail: 'notificationProducerAuditService audits source identity, dedupe, target route, and action due hints',
    failureRecovery: 'notificationTouchpointService downgrades non-actionable algorithm signals and exposes dedupe_missing for action producers',
    userVisibleEntry: 'Header / Sidebar / Dashboard today todo / Notifications',
    stableTargetRoute: '/notifications',
    boundaryPolicy: {
      canUseAsStableAction: false,
      writesRuntimePublication: false,
      declaresProductionReady: false,
      requiresLiveEvidenceForUpgrade: true,
    },
    codeEvidence: [
      'server/src/services/notificationTouchpointService.ts',
      'server/src/services/notificationProducerAuditService.ts',
      'server/src/services/todoTouchpointService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/notificationTouchpointService.test.ts',
      'server/src/__tests__/notificationProducerAuditService.test.ts',
      'server/src/__tests__/todoTouchpointService.test.ts',
    ],
  },
  {
    key: 'warning_issue_closure',
    sourceCloseoutItems: ['C-07', 'C-12'],
    owningUnit: '主执行环：行动闭环',
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'issues/warnings routes require authenticated project scope before mutation',
    auditTrail: 'issueWriteChainService and warningChainService persist source identity and notification chain evidence',
    failureRecovery: 'warning sync keeps source_entity_type/source_entity_id and can reconcile notification touchpoints',
    userVisibleEntry: 'Risk / Issues / Warnings workspace',
    stableTargetRoute: '/projects/:projectId/risks',
    boundaryPolicy: {
      canUseAsStableAction: false,
      writesRuntimePublication: false,
      declaresProductionReady: false,
      requiresLiveEvidenceForUpgrade: true,
    },
    codeEvidence: [
      'server/src/services/issueWriteChainService.ts',
      'server/src/services/warningChainService.ts',
      'server/src/services/warningService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/issues-domain.test.ts',
      'server/src/__tests__/warningChainContract.test.ts',
      'server/src/__tests__/warningService.sourceIdentity.test.ts',
    ],
  },
  {
    key: 'retention_delete_operator_action',
    sourceCloseoutItems: ['C-09'],
    owningUnit: '主执行环：行动闭环',
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'deletion-retention operator actions require visible project scope and supported action',
    auditTrail: 'deletion_retention_events stores requested_action, resolved_action, confirmation metadata, and operator action',
    failureRecovery: 'confirming recovery uses recovery_attempts and retry_requested / mark_handled operator states',
    userVisibleEntry: 'Deletion retention confirmation dialog and operator action endpoint',
    stableTargetRoute: '/api/deletion-retention/operator-actions',
    boundaryPolicy: {
      canUseAsStableAction: false,
      writesRuntimePublication: false,
      declaresProductionReady: false,
      requiresLiveEvidenceForUpgrade: true,
    },
    codeEvidence: [
      'server/src/services/deletionRetentionGovernanceService.ts',
      'server/src/routes/deletion-retention.ts',
    ],
    testEvidence: [
      'server/src/__tests__/deletionRetentionGovernanceService.test.ts',
    ],
  },
  {
    key: 'responsibility_recovery_confirmation',
    sourceCloseoutItems: ['C-12', 'C-12.1', 'C-13'],
    owningUnit: '主执行环：行动闭环',
    status: 'display-only',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'responsibility insight is analysis/display only; recovery confirmation requires future explicit domain action',
    auditTrail: 'responsibilityInsightService exposes causalAttributionPolicy and watch status evidence without direct punishment',
    failureRecovery: 'suggest_recovery_confirmation remains a suggestion until a governed confirmation action exists',
    userVisibleEntry: 'ResponsibilityView / Reports attribution panel',
    stableTargetRoute: '/projects/:projectId/responsibility',
    boundaryPolicy: {
      canUseAsStableAction: false,
      writesRuntimePublication: false,
      declaresProductionReady: false,
      requiresLiveEvidenceForUpgrade: true,
    },
    codeEvidence: [
      'server/src/services/responsibilityInsightService.ts',
      'server/src/services/progressDeviationService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/responsibilityInsightService.watchStatus.test.ts',
      'server/src/__tests__/progressDeviation.test.ts',
    ],
  },
  {
    key: 'construction_organization_runtime_publication_action',
    sourceCloseoutItems: ['C-13', 'C-18', 'C-19'],
    owningUnit: '主执行环：行动闭环',
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'construction organization runtime apply, evidence, recommendation, and rollback actions require manual approval, release-exit closure, production migration MG-07 closeout, live readback, monitoring, and rollback evidence',
    auditTrail: 'rule asset governance workbench operations preserve evidence tokens, domain writer keys, release/rollback refs, and construction organization draft/runtime lineage',
    failureRecovery: 'runtime publication actions remain disabled until live evidence, impact monitoring, rollback verification, and production migration governance are closed',
    userVisibleEntry: 'RuleAssetGovernanceWorkbenchAdmin construction organization plan network operations',
    stableTargetRoute: '/admin/rule-assets/governance-workbench',
    boundaryPolicy: {
      canUseAsStableAction: false,
      writesRuntimePublication: false,
      declaresProductionReady: false,
      requiresLiveEvidenceForUpgrade: true,
    },
    codeEvidence: [
      'server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts',
      'server/src/services/constructionOrganizationPlanNetworkDomainWriter.ts',
      'server/src/services/constructionOrganizationPlanNetworkRuntimeEvidenceService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
      'server/src/__tests__/constructionOrganizationPlanNetworkDomainWriter.test.ts',
      'server/src/__tests__/constructionOrganizationPlanNetworkRuntimeEvidenceService.test.ts',
    ],
  },
]

const SURFACES_BY_KEY = new Map(ACTIONABLE_SURFACES.map((surface) => [surface.key, surface]))

function cloneSurface(surface: V14231ActionableSurface): V14231ActionableSurface {
  const clone = {
    ...surface,
    sourceCloseoutItems: [...surface.sourceCloseoutItems],
    boundaryPolicy: { ...surface.boundaryPolicy },
    codeEvidence: [...surface.codeEvidence],
    testEvidence: [...surface.testEvidence],
  }

  if (
    clone.key === 'construction_organization_runtime_publication_action'
    && process.env[RULE_ASSET_RUNTIME_ACTIONS_ENABLED_ENV]?.trim().toLowerCase() === 'true'
  ) {
    return {
      ...clone,
      status: 'stable_action',
      boundaryPolicy: {
        ...clone.boundaryPolicy,
        canUseAsStableAction: true,
        requiresLiveEvidenceForUpgrade: false,
      },
    }
  }

  return clone
}

export function areRuleAssetRuntimeActionsEnabled(): boolean {
  return process.env[RULE_ASSET_RUNTIME_ACTIONS_ENABLED_ENV]?.trim().toLowerCase() === 'true'
}

export function listV14231ActionableSurfaces(): V14231ActionableSurface[] {
  return ACTIONABLE_SURFACES.map(cloneSurface)
}

export function getV14231ActionableSurface(key: string): V14231ActionableSurface | null {
  const surface = SURFACES_BY_KEY.get(String(key ?? '').trim())
  return surface ? cloneSurface(surface) : null
}

export function buildV14231ActionableSurfaceLedger(): V14231ActionableSurfaceLedger {
  return {
    sourcePlan: 'v1.4.23.1-A',
    sourceSections: ['C-07', 'C-09', 'C-12', 'C-13'],
    defaultUnregisteredSurfaceStatus: 'display-only',
    requiredFields: [...REQUIRED_FIELDS],
    surfaces: listV14231ActionableSurfaces(),
  }
}
