export type V141HistoricalScopeCloseoutStatus =
  | 'fixed'
  | 'continuous_guard'
  | 'deprecated'
  | 'live_only'

export type V141HistoricalScopeCloseoutRow = {
  id: string
  priority: 'P0' | 'P1' | 'P2'
  title: string
  status: V141HistoricalScopeCloseoutStatus
  disposition: string
  evidenceRefs: string[]
  guards: string[]
  liveOnlyReasons: string[]
}

export type V141HistoricalScopeCloseoutMatrix = {
  matrixCode: 'v141_historical_scope_p0_p1_p2_closeout'
  status: 'non_live_classification_closed'
  summary: {
    totalCount: number
    fixedCount: number
    continuousGuardCount: number
    deprecatedCount: number
    liveOnlyCount: number
    canDeclareNonLiveClassificationClosed: boolean
  }
  rows: V141HistoricalScopeCloseoutRow[]
  boundaryPolicy: string[]
}

const ROWS: V141HistoricalScopeCloseoutRow[] = [
  {
    id: 'P0-1',
    priority: 'P0',
    title: 'planningIntegrityService missing_scope_dimension_count',
    status: 'fixed',
    disposition: 'Planning integrity now evaluates engineering-object scope presence instead of legacy scope-dimension counters.',
    evidenceRefs: ['server/src/services/planningIntegrityService.ts:hasAnyScopeObjectId'],
    guards: ['v14-engineering-objects.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P0-2',
    priority: 'P0',
    title: 'projectTrendAnalyticsService range trend source',
    status: 'continuous_guard',
    disposition: 'Trend analytics is guarded against reverting to the retired scope-dimension fact table and stays on engineering_objects/current summaries.',
    evidenceRefs: ['server/src/__tests__/v14-engineering-objects.test.ts'],
    guards: ['v14-engineering-objects.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P0-3',
    priority: 'P0',
    title: 'taskAttributionSummaryService scope_dimension / invalid_unassigned source split',
    status: 'fixed',
    disposition: 'Attribution source vocabulary uses engineering_object / legacy / invalid_unassigned and does not restore scope_dimension as a live source.',
    evidenceRefs: ['server/src/services/taskAttributionSummaryService.ts'],
    guards: ['taskAttributionSummaryService.test.ts', 'v14-engineering-objects.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P0-4',
    priority: 'P0',
    title: 'Reports specialty/range filters',
    status: 'continuous_guard',
    disposition: 'Reports scope filters are treated as engineering-object label/id filters, with legacy scope dimensions retained only as compatibility/documentation references.',
    evidenceRefs: ['client/src/pages/Reports.tsx', 'server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts'],
    guards: ['audit:retired-object-references', 'v14-engineering-objects.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P1-1',
    priority: 'P1',
    title: 'materials specialty_type',
    status: 'deprecated',
    disposition: 'Specialty-type wording remains compatibility/archive only and must not become a new engineering-object taxonomy.',
    evidenceRefs: ['server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts'],
    guards: ['audit:retired-object-references'],
    liveOnlyReasons: [],
  },
  {
    id: 'P1-2',
    priority: 'P1',
    title: 'acceptance frontend building_object_id selector',
    status: 'fixed',
    disposition: 'Acceptance selectors use engineering-object identity semantics; legacy building_object_id wording is not a separate model.',
    evidenceRefs: ['client/src/pages/AcceptanceTimeline.tsx', 'server/src/routes/acceptance-plans.ts'],
    guards: ['AcceptanceTimeline.test.tsx', 'v14-engineering-objects.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P1-3',
    priority: 'P1',
    title: 'old route/adapter deletion',
    status: 'continuous_guard',
    disposition: 'Old scope route/imports are forbidden as live consumers; compatibility guards and docs may remain classified.',
    evidenceRefs: ['server/src/registry/system-domain-registry.json:deprecations'],
    guards: ['guard:system-registry', 'audit:retired-object-references'],
    liveOnlyReasons: [],
  },
  {
    id: 'P1-4',
    priority: 'P1',
    title: 'acceptance only /api/engineering-objects',
    status: 'continuous_guard',
    disposition: 'Acceptance must consume engineering-object endpoints and cannot resurrect scope-dimensions as a live route.',
    evidenceRefs: ['server/src/routes/engineering-objects.ts', 'server/src/registry/system-domain-registry.json:deprecations'],
    guards: ['guard:system-registry', 'v14-engineering-objects.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P1-5',
    priority: 'P1',
    title: 'ProjectInfoCard legacy scope display',
    status: 'deprecated',
    disposition: 'ProjectInfoCard legacy component is removed/deprecated; project summary display must not be the source of scope truth.',
    evidenceRefs: ['client/src/components/ProjectInfoCard.tsx deleted in worktree status'],
    guards: ['client contract tests', 'audit:retired-object-references'],
    liveOnlyReasons: [],
  },
  {
    id: 'P1-6',
    priority: 'P1',
    title: 'old scope mapping script not executed',
    status: 'deprecated',
    disposition: 'Old mapping scripts are migration/archive references only and cannot be run as current live materialization.',
    evidenceRefs: ['server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts'],
    guards: ['audit:retired-object-references'],
    liveOnlyReasons: [],
  },
  {
    id: 'P1-7',
    priority: 'P1',
    title: 'unit/custom legacyType plan deprecated',
    status: 'deprecated',
    disposition: 'custom/legacyType object plans are forbidden as live taxonomy and retained only in historical tests/docs/migration history.',
    evidenceRefs: ['server/src/__tests__/v14-object-type-deprecation.test.ts'],
    guards: ['v14-object-type-deprecation.test.ts', 'audit:retired-object-references'],
    liveOnlyReasons: [],
  },
  {
    id: 'P1-8',
    priority: 'P1',
    title: 'acceptance unit business semantic distinct from engineering object',
    status: 'fixed',
    disposition: 'Acceptance business unit semantics remain separate from engineering-object identity and do not create a third scope model.',
    evidenceRefs: ['server/src/routes/acceptance-plans.ts', 'server/src/services/engineeringObjectService.ts'],
    guards: ['acceptanceRoutesLifecycle.test.ts', 'v14-engineering-objects.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P2-1',
    priority: 'P2',
    title: 'object code retry',
    status: 'fixed',
    disposition: 'Engineering object code generation/retry belongs to engineeringObjectService and is covered by object service tests.',
    evidenceRefs: ['server/src/services/engineeringObjectService.ts'],
    guards: ['v14-engineering-objects.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P2-2',
    priority: 'P2',
    title: 'delete object wording as inactive/deactivate',
    status: 'fixed',
    disposition: 'Delete semantics are soft/inactive where required; deletion wording is governed by retention/deletion policy.',
    evidenceRefs: ['server/src/services/engineeringObjectService.ts:deleteEngineeringObject', 'server/src/services/deletionRetentionGovernanceService.ts'],
    guards: ['v14-engineering-objects.test.ts', 'deleteProtectionRoutes.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P2-3',
    priority: 'P2',
    title: 'path/level cascade move test',
    status: 'continuous_guard',
    disposition: 'Engineering object path/level cascade behavior is protected by service and object contract tests.',
    evidenceRefs: ['server/src/services/engineeringObjectService.ts'],
    guards: ['v14-engineering-objects.test.ts'],
    liveOnlyReasons: [],
  },
  {
    id: 'P2-4',
    priority: 'P2',
    title: 'reports/dashboard/tasksummary ID+label filtering',
    status: 'continuous_guard',
    disposition: 'BI/report display filters must preserve ID+label semantics and not rebuild legacy scope-dimension filters.',
    evidenceRefs: ['server/src/services/projectExecutionSummaryService.ts', 'server/src/services/taskAttributionSummaryService.ts'],
    guards: ['sharedTruth.contract.test.tsx', 'taskSummaryCoreChain.test.ts', 'audit:retired-object-references'],
    liveOnlyReasons: [],
  },
  {
    id: 'P2-5',
    priority: 'P2',
    title: 'no history, only necessary scope skeleton, specialty not engineering object',
    status: 'deprecated',
    disposition: 'Historical scope skeletons and specialty labels are not live engineering objects; only classified archive/migration/doc references remain.',
    evidenceRefs: ['server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts'],
    guards: ['audit:retired-object-references', 'guard:system-registry'],
    liveOnlyReasons: [],
  },
]

export function buildV141HistoricalScopeCloseoutMatrix(): V141HistoricalScopeCloseoutMatrix {
  const rows = ROWS.map((row) => ({
    ...row,
    evidenceRefs: [...row.evidenceRefs],
    guards: [...row.guards],
    liveOnlyReasons: [...row.liveOnlyReasons],
  }))
  return {
    matrixCode: 'v141_historical_scope_p0_p1_p2_closeout',
    status: 'non_live_classification_closed',
    summary: {
      totalCount: rows.length,
      fixedCount: rows.filter((row) => row.status === 'fixed').length,
      continuousGuardCount: rows.filter((row) => row.status === 'continuous_guard').length,
      deprecatedCount: rows.filter((row) => row.status === 'deprecated').length,
      liveOnlyCount: rows.filter((row) => row.status === 'live_only').length,
      canDeclareNonLiveClassificationClosed: true,
    },
    rows,
    boundaryPolicy: [
      'classification_matrix_closes_non_live_v141_p0_p1_p2_accounting_only',
      'does_not_bypass_retired_object_reference_audit',
      'does_not_claim_live_database_physical_cleanup',
      'legacy_history_docs_tests_migrations_must_remain_classified_not_runtime_consumed',
    ],
  }
}
