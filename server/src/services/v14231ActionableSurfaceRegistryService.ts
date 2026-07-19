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

function defineActionableSurface(
  input: Omit<V14231ActionableSurface, 'owningUnit' | 'boundaryPolicy'>,
): V14231ActionableSurface {
  const stable = input.status === 'stable_action'
  return {
    ...input,
    owningUnit: '主执行环：行动闭环',
    boundaryPolicy: {
      canUseAsStableAction: stable,
      writesRuntimePublication: false,
      declaresProductionReady: false,
      requiresLiveEvidenceForUpgrade: !stable,
    },
  }
}

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
  defineActionableSurface({
    key: 'workspace_progress_entry_action',
    sourceCloseoutItems: ['C-07', 'C-12', 'C-13'],
    status: 'stable_action',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'progress entry navigates to the authenticated project task surface where task write permissions are enforced',
    auditTrail: 'taskWriteChainService records the scoped task fact mutation after the workspace navigation handoff',
    failureRecovery: 'workspace navigation performs no write; task entry failures remain visible and recoverable on the owning task surface',
    userVisibleEntry: 'Workspace project progress entry',
    stableTargetRoute: '/projects/:projectId/gantt',
    codeEvidence: [
      'client/src/pages/WorkspacePage.tsx',
      'server/src/services/taskWriteChainService.ts',
    ],
    testEvidence: [
      'client/src/pages/__tests__/WorkspacePage.test.tsx',
      'server/src/__tests__/taskWriteChainService.participantUnit.test.ts',
    ],
  }),
  defineActionableSurface({
    key: 'workspace_governance_prediction_todo_action',
    sourceCloseoutItems: ['C-07', 'C-12', 'C-13'],
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'each governance or prediction todo requires its own backend command and project/company permission check',
    auditTrail: 'notification source identity alone does not prove execution audit or command idempotency',
    failureRecovery: 'workspace exposes reminder navigation but withholds execute controls until command-specific retry and reconciliation semantics exist',
    userVisibleEntry: 'Workspace governance and prediction todo actions',
    stableTargetRoute: '/workspace',
    codeEvidence: [
      'client/src/pages/WorkspacePage.tsx',
      'server/src/services/notificationTouchpointService.ts',
    ],
    testEvidence: [
      'client/src/pages/__tests__/WorkspacePage.test.tsx',
      'server/src/__tests__/notificationTouchpointService.test.ts',
    ],
  }),
  defineActionableSurface({
    key: 'rule_asset_governance_review_action',
    sourceCloseoutItems: ['C-12', 'C-13', 'C-18'],
    status: 'stable_action',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'governance review operations require current-company admin and project ownership checks',
    auditTrail: 'review, conflict decision, approval, and release-exit handoff persist evidence tokens and candidate lineage without runtime apply',
    failureRecovery: 'blocked operation results preserve missing reasons and do not mutate runtime publications or project facts',
    userVisibleEntry: 'RuleAssetGovernanceWorkbenchAdmin review and release-exit preparation',
    stableTargetRoute: '/admin/rule-assets/governance-workbench',
    codeEvidence: [
      'server/src/routes/algorithm-seeds.ts',
      'server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
      'client/src/pages/__tests__/RuleAssetGovernanceWorkbenchAdmin.test.tsx',
    ],
  }),
  defineActionableSurface({
    key: 'rule_asset_stable_publication_action',
    sourceCloseoutItems: ['C-13', 'C-18', 'C-19'],
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'stable publication requires asset-specific publisher permission, release evidence, canary monitoring, and rollback readiness',
    auditTrail: 'publication writers preserve candidate, evidence, scope, stage, and prior-publication lineage',
    failureRecovery: 'stable publication remains disabled until atomic supersede and tested rollback evidence are closed for the selected asset family',
    userVisibleEntry: 'RuleAssetGovernanceWorkbenchAdmin stable publication actions',
    stableTargetRoute: '/admin/rule-assets/governance-workbench',
    codeEvidence: [
      'server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts',
      'server/src/services/durationLearningRuntimePublicationService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
      'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
    ],
  }),
  defineActionableSurface({
    key: 'rule_asset_template_replacement_action',
    sourceCloseoutItems: ['C-13', 'C-18', 'C-19'],
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'template replacement requires company admin, exact template target identity, impact scan, and compatibility checks',
    auditTrail: 'template publication services retain source candidate and replaced-template lineage',
    failureRecovery: 'replacement remains disabled until affected-project replay and atomic rollback are available for the exact template family',
    userVisibleEntry: 'RuleAssetGovernanceWorkbenchAdmin template replacement actions',
    stableTargetRoute: '/admin/rule-assets/governance-workbench',
    codeEvidence: [
      'server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts',
      'server/src/services/durationLearningRuntimePublicationService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
      'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
    ],
  }),
  defineActionableSurface({
    key: 'rule_asset_runtime_evidence_action',
    sourceCloseoutItems: ['C-12', 'C-13', 'C-19'],
    status: 'stable_action',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'runtime evidence and site decisions require current-company admin and scoped publication/project identity',
    auditTrail: 'runtime call, observation, monitoring, engine evidence, saved outcome, and site decision ledgers retain source lineage',
    failureRecovery: 'evidence writes return explicit blocked results and never apply a publication, dependency, date, baseline, or fact mutation',
    userVisibleEntry: 'RuleAssetGovernanceWorkbenchAdmin runtime evidence recording',
    stableTargetRoute: '/admin/rule-assets/governance-workbench',
    codeEvidence: [
      'server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts',
      'server/src/services/durationRuntimeConsumerObservationService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
      'server/src/__tests__/durationRuntimeConsumerObservationService.test.ts',
    ],
  }),
  defineActionableSurface({
    key: 'rule_asset_runtime_rollback_action',
    sourceCloseoutItems: ['C-13', 'C-18', 'C-19'],
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'rollback requires exact active publication, prior target, company/project scope, operator identity, and asset-specific writer permission',
    auditTrail: 'rollback writers preserve source publication, rollback target, reason, operator, and execution result',
    failureRecovery: 'rollback remains disabled until same-release rollback smoke and post-rollback consumer readback are closed',
    userVisibleEntry: 'RuleAssetGovernanceWorkbenchAdmin runtime rollback actions',
    stableTargetRoute: '/admin/rule-assets/governance-workbench',
    codeEvidence: [
      'server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts',
      'server/src/services/durationLearningRuntimePublicationService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
      'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
    ],
  }),
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
  defineActionableSurface({
    key: 'duration_accuracy_auto_publish_action',
    sourceCloseoutItems: ['C-13', 'C-19', 'C-19.01'],
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'auto publish requires the asset-level automation policy, repeat-change threshold, replay, conflict, canary, and tenant scope gates',
    auditTrail: 'automation decisions retain policy version, sample lineage, threshold evidence, and selected publication scope',
    failureRecovery: 'auto publish remains unavailable from the admin page until retry, compensation, monitoring, and rollback are proven for that asset level',
    userVisibleEntry: 'DurationAccuracyAdmin automatic publication',
    stableTargetRoute: '/admin/duration-accuracy',
    codeEvidence: [
      'server/src/services/durationLearningAssetAutomationPolicyService.ts',
      'server/src/services/durationLearningRuntimeLifecycleService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/durationLearningAssetAutomationPolicyService.test.ts',
      'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
    ],
  }),
  defineActionableSurface({
    key: 'duration_accuracy_force_stable_action',
    sourceCloseoutItems: ['C-13', 'C-19', 'C-19.01'],
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'force stable requires explicit admin authority plus passed canary monitoring and exact publication scope',
    auditTrail: 'stable promotion persists prior publication, monitoring result, operator intent, and immutable publication identity',
    failureRecovery: 'force stable remains unavailable until atomic promotion and rollback readback are verified in the target environment',
    userVisibleEntry: 'DurationAccuracyAdmin force stable action',
    stableTargetRoute: '/admin/duration-accuracy',
    codeEvidence: [
      'server/src/services/durationLearningRuntimePublicationService.ts',
      'server/src/services/durationLearningRuntimeLifecycleService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
      'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
    ],
  }),
  defineActionableSurface({
    key: 'duration_accuracy_rollback_close_action',
    sourceCloseoutItems: ['C-13', 'C-19', 'C-19.01'],
    status: 'needs-gating',
    sourceIdentityRequired: true,
    targetIdentityRequired: true,
    permissionGate: 'rollback close requires an executed rollback, restored prior publication, consumer readback, and operator authority',
    auditTrail: 'rollback execution and lifecycle checkpoint preserve publication, reason, restored target, and observation lineage',
    failureRecovery: 'close remains unavailable while rollback compensation, retry, or consumer reconciliation is pending',
    userVisibleEntry: 'DurationAccuracyAdmin rollback close action',
    stableTargetRoute: '/admin/duration-accuracy',
    codeEvidence: [
      'server/src/services/durationLearningRuntimePublicationService.ts',
      'server/src/services/durationLearningRuntimeLifecycleService.ts',
    ],
    testEvidence: [
      'server/src/__tests__/durationLearningRuntimePublicationService.test.ts',
      'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
    ],
  }),
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
