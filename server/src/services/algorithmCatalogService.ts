import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  ALGORITHM_SEED_REGISTRY,
  listAlgorithmSeedTypes,
  type AlgorithmSeedType,
} from './algorithmSeedRegistry.js'
import {
  ALGORITHM_RULE_ASSET_INVENTORY_VERSION,
  listAlgorithmRuleAssets,
} from './algorithmRuleAssetInventoryService.js'

export type AlgorithmCatalogStatus =
  | 'active'
  | 'governance_only'
  | 'catalog_only'
  | 'candidate_only'
  | 'retired'

export type AlgorithmCatalogEntry = {
  algorithmKey: string
  displayName: string
  domain: string
  ownerChapter: string
  implementationPath: string
  status: AlgorithmCatalogStatus
  ordinaryUserVisible: boolean
  inputContractVersion: string
  outputContractVersion: string
  currentCaliberVersion: string
  sourceKind: 'code'
  runtimeEffect: string
  inputSources: string[]
  outputFields: string[]
  consumers: string[]
  metadata: Record<string, unknown>
}

export type AlgorithmCaliberVersionEntry = {
  algorithmKey: string
  caliberVersion: string
  effectiveFrom: string
  effectiveTo: string | null
  changeSummary: string
  inputSources: string[]
  outputFields: string[]
  consumerScope: string[]
  rollbackToVersion: string | null
  testSuiteKey: string
  metadata: Record<string, unknown>
}

export type AlgorithmSeedCatalogRegistryStatus =
  | 'registry_seed'
  | 'catalog_only'

export type AlgorithmSeedCatalogEntry = {
  seedKey: string
  seedFile: string
  seedType: string
  seedVersion: string
  registryStatus: AlgorithmSeedCatalogRegistryStatus
  scope: string
  recordCount: number
  authorityChapter: string
  evidenceSummary: Record<string, unknown>
  runtimeEffect: string
  owner: string
  lifecycleStatus: 'active' | 'candidate_only' | 'governance_only'
  metadata: Record<string, unknown>
}

export type AlgorithmGovernanceCatalogDiagnostics = {
  catalogVersion: string
  status: 'pass' | 'block'
  summary: {
    expectedMainAlgorithmCount: number
    algorithmCatalogCount: number
    registrySeedTypeCount: number
    seedCatalogCount: number
    catalogOnlyRuleAssetCount: number
    ordinaryUserVisibleAlgorithmCount: number
  }
  gaps: {
    duplicateAlgorithmKeys: string[]
    duplicateSeedKeys: string[]
    missingAlgorithmImplementationPaths: string[]
    missingRegistrySeedCatalogEntries: AlgorithmSeedType[]
    nonRegistryRuleAssetsMissingCatalogEntries: string[]
    ordinaryUserVisibleAlgorithmKeys: string[]
  }
  boundaryPolicy: string[]
}

const CATALOG_VERSION = 'v1.4.22-phase-1-3-catalog-20260614'
const CURRENT_CALIBER_VERSION = 'v1.4.22-current-code-facts'
const EFFECTIVE_FROM = '2026-06-14T00:00:00.000Z'

function uniqueStrings(values: readonly unknown[] | undefined) {
  if (!values) return []
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function entry(
  algorithmKey: string,
  displayName: string,
  domain: string,
  ownerChapter: string,
  implementationPath: string,
  inputSources: string[],
  outputFields: string[],
  consumers: string[],
  metadata: Record<string, unknown> = {},
): AlgorithmCatalogEntry {
  return {
    algorithmKey,
    displayName,
    domain,
    ownerChapter,
    implementationPath,
    status: 'active',
    ordinaryUserVisible: false,
    inputContractVersion: 'v1',
    outputContractVersion: 'v1',
    currentCaliberVersion: CURRENT_CALIBER_VERSION,
    sourceKind: 'code',
    runtimeEffect: 'backend_governance_and_business_dto_only',
    inputSources,
    outputFields,
    consumers,
    metadata,
  }
}

const MAIN_ALGORITHM_CATALOG: readonly AlgorithmCatalogEntry[] = [
  entry('baselineGenerationService', '项目基线生成算法', 'planning', 'v1.4.7', 'server/src/services/baselineGenerationService.ts', ['tasks', 'project_generation_facts', 'algorithm_seed_records'], ['baseline_items', 'business_reasons', 'quality_gates'], ['BaselinePage', 'planning routes']),
  entry('monthlyPlanGenerationService', '月度计划生成算法', 'planning', 'v1.4.7', 'server/src/services/monthlyPlanGenerationService.ts', ['tasks', 'baseline_snapshots', 'monthly_closeout_facts', 'algorithm_seed_records'], ['monthly_plan_items', 'commitment_snapshot', 'business_reasons'], ['MonthlyPlanPage', 'planning routes']),
  entry('planningReplayCalibrationService', '规划回放校准闭环算法', 'planning', 'v1.4.22.4/v1.4.22.5', 'server/src/services/planningReplayCalibrationService.ts', ['baseline_generation_samples', 'monthly_plan_generation_samples', 'actual_outcomes', 'algorithm_asset_replay_runs'], ['calibration_candidates', 'replay_evidence', 'fact_lock_policy'], ['baselineGenerationService', 'monthlyPlanGenerationService', 'algorithmAssetReplayService']),
  entry('durationContextService', '工期上下文因子算法', 'duration', 'v1.4.18/v1.4.22', 'server/src/services/durationContextService.ts', ['project_facts', 'weather_facts', 'progress_snapshots', 'algorithm_seed_records'], ['duration_context_factors', 'business_factor_badges'], ['durationSuggestionService', 'taskDurationForecastService']),
  entry('durationSuggestionService', '任务参考工期建议算法', 'duration', 'v1.4.18', 'server/src/services/durationSuggestionService.ts', ['standard_work_duration_seed', 'duration_context_factors', 'project_generation_facts'], ['suggested_duration_days', 'confidence', 'business_reasons'], ['PlanningTreeTable', 'wbsTemplateGenerationService']),
  entry('taskDurationForecastService', '执行任务剩余工期预测算法', 'duration', 'v1.4.18', 'server/src/services/taskDurationForecastService.ts', ['tasks', 'progress_snapshots', 'duration_context_factors', 'algorithm_seed_records'], ['remaining_duration_forecast', 'delay_risk_index', 'top_factors'], ['TaskDetail', 'Dashboard', 'Reports']),
  entry('wbsPlanRollupService', 'WBS 计划汇总算法', 'planning', 'v1.4.7.2', 'server/src/services/wbsPlanRollupService.ts', ['wbs_nodes', 'tasks'], ['rollup_dates', 'rollup_progress', 'node_flags'], ['PlanningTreeTable', 'wbsTemplateGenerationService']),
  entry('projectCriticalPathService', '关键路径识别算法', 'schedule', 'v1.4.8/v1.4.19', 'server/src/services/projectCriticalPathService.ts', ['tasks', 'task_dependencies', 'task_progress_snapshots'], ['critical_path_snapshot', 'critical_tasks'], ['GanttView', 'projectHealthService']),
  entry('progressDeviationService', '进度偏差原因识别算法', 'deviation', 'v1.4.19', 'server/src/services/progressDeviationService.ts', ['tasks', 'progress_snapshots', 'duration_context_factors'], ['deviation_causes', 'business_reason_chain'], ['Reports', 'projectHealthDeviationSummaryService']),
  entry('projectHealthService', '项目健康度算法', 'health', 'v1.4.19', 'server/src/services/projectHealthService.ts', ['project_execution_summary', 'data_quality_summary', 'warnings', 'algorithm_seed_candidates'], ['health_score', 'health_details', 'algorithm_signals'], ['Dashboard', 'CompanyCockpit', 'Reports']),
  entry('planningHealthService', '计划健康校核算法', 'planning', 'v1.4.7/v1.4.16', 'server/src/services/planningHealthService.ts', ['planning_table_rows', 'milestone_integrity', 'change_logs'], ['planning_health_findings', 'quality_banner_items'], ['BaselinePage', 'MonthlyPlanPage']),
  entry('planningIntegrityService', '计划完整性算法', 'planning', 'v1.4.7/v1.4.9', 'server/src/services/planningIntegrityService.ts', ['baseline_snapshots', 'monthly_plans', 'tasks', 'tasks(is_milestone)'], ['integrity_findings', 'commitment_anchor_status'], ['planningHealthService', 'operationalNotificationService']),
  entry('planningGovernanceService', '计划治理状态算法', 'planning', 'v1.4.7/v1.4.14', 'server/src/services/planningGovernanceService.ts', ['planning_changes', 'integrity_findings', 'health_findings'], ['governance_state', 'required_confirmations'], ['planning routes', 'notifications']),
  entry('dataQualityService', '数据质量治理算法', 'data_quality', 'v1.4.16', 'server/src/services/dataQualityService.ts', ['business_tables', 'data_quality_rule_registry'], ['data_quality_findings', 'confidence_summary'], ['Dashboard', 'projectExecutionSummaryService']),
  entry('warningService', '业务预警生成算法', 'warning', 'v1.4.12', 'server/src/services/warningService.ts', ['tasks', 'risks', 'issues', 'warning_impact_signals'], ['warnings', 'business_reasons'], ['RiskManagement', 'Notifications']),
  entry('riskIssueWarningGovernanceService', '风险问题预警生命周期治理算法', 'warning', 'v1.4.12', 'server/src/services/riskIssueWarningGovernanceService.ts', ['warnings', 'risks', 'issues', 'impact_signals'], ['lifecycle_transitions', 'suggested_close'], ['RiskManagement', 'warningService']),
  entry('responsibilityInsightService', '责任主体洞察算法', 'responsibility', 'v1.4.10', 'server/src/services/responsibilityInsightService.ts', ['tasks', 'responsibility_subjects', 'risks', 'obstacles'], ['responsibility_health', 'responsibility_alerts'], ['ResponsibilityView', 'weeklyDigestService']),
  entry('materialArrivalReminderService', '材料到场提醒算法', 'materials', 'v1.4.13', 'server/src/services/materialArrivalReminderService.ts', ['materials', 'tasks', 'data_quality_summary'], ['material_reminders', 'unlock_results'], ['Materials', 'Notifications']),
  entry('milestoneIntegrityService', '里程碑完整性算法', 'milestone', 'v1.4.9', 'server/src/services/milestoneIntegrityService.ts', ['tasks(is_milestone)', 'baseline_snapshots', 'monthly_plans'], ['milestone_integrity_findings', 'anchor_status'], ['Milestones', 'planningIntegrityService']),
  entry('taskCodeGenerationService', '任务编码生成算法', 'task', 'v1.4.7.2', 'server/src/services/taskCodeGenerationService.ts', ['project_task_code_rules', 'wbs_nodes', 'tasks'], ['task_code', 'code_sequence'], ['PlanningTreeTable', 'taskWriteChainService']),
  entry('wbsSemanticService', 'WBS 语义识别算法', 'wbs', 'v1.4.7.2', 'server/src/services/wbsSemanticService.ts', ['wbs_templates', 'standard_work_catalog', 'title_weak_recognition_seed'], ['wbs_node_type', 'semantic_flags'], ['wbsTemplateGenerationService', 'taskWriteChainService']),
  entry('wbsTemplateGenerationService', '分部分项模板生成算法', 'wbs', 'v1.4.7.2/v1.4.18', 'server/src/services/wbsTemplateGenerationService.ts', ['project_generation_facts', 'wbs_template_seed', 'standard_work_duration_seed'], ['generated_wbs_rows', 'reference_days', 'business_reasons'], ['PlanningTreeTable', 'wizard generation']),
  entry('notificationTouchpointService', '通知触达投影算法', 'notification', 'v1.4.13', 'server/src/services/notificationTouchpointService.ts', ['business_events', 'notification_touchpoint_rules'], ['todo_touchpoints', 'notification_items'], ['Notifications', 'todoTouchpointService']),
  entry('todoTouchpointService', '待办触达算法', 'notification', 'v1.4.13', 'server/src/services/todoTouchpointService.ts', ['touchpoint_rules', 'business_due_dates'], ['todo_items', 'attention_items'], ['Notifications', 'weeklyDigestService']),
  entry('dueDateService', '业务到期状态算法', 'schedule', 'v1.4.13', 'server/src/services/dueDateService.ts', ['tasks', 'tasks(is_milestone)', 'certificates', 'acceptance_items'], ['due_status', 'due_severity'], ['warningService', 'todoTouchpointService']),
  entry('taskLagStatusService', '任务滞后状态算法', 'schedule', 'v1.4.19', 'server/src/services/taskLagStatusService.ts', ['tasks', 'progress_snapshots', 'planned_dates'], ['lag_level', 'lag_days'], ['projectExecutionSummaryService', 'TaskSummary']),
  entry('statusDerivationService', '状态派生算法', 'status', 'v1.4.7/v1.4.16', 'server/src/services/statusDerivationService.ts', ['tasks', 'progress', 'status_derivation_rules'], ['derived_status', 'status_reason'], ['taskDtoService', 'planning routes']),
  entry('deletionRetentionGovernanceService', '删除关闭归档保留判定算法', 'retention', 'v1.4.15', 'server/src/services/deletionRetentionGovernanceService.ts', ['target_object', 'references', 'retention_rules'], ['retention_decision', 'confirmation_requirements'], ['business routes', 'changeAuditService']),
  entry('algorithmSeedResolver', '算法 seed 解析器', 'algorithm_governance', 'v1.4.22', 'server/src/services/algorithmSeedResolver.ts', ['algorithm_seed_records', 'algorithm_seed_overrides', 'runtime_context'], ['resolved_seed_records', 'resolver_source'], ['duration algorithms', 'planning algorithms']),
  entry('algorithmSeedValidationService', '算法 seed 校验器', 'algorithm_governance', 'v1.4.22', 'server/src/services/algorithmSeedValidationService.ts', ['seed_registry', 'seed_payloads'], ['validation_issues', 'quality_gate_result'], ['algorithmSeedImportService', 'tests']),
  entry('algorithmSeedLearningService', '算法 seed 候选学习服务', 'algorithm_governance', 'v1.4.22.3', 'server/src/services/algorithmSeedLearningService.ts', ['project_history', 'company_history', 'candidate_payloads'], ['upgrade_candidates', 'quality_summary'], ['algorithmSeedAutoGovernanceService']),
  entry('algorithmSeedAutoGovernanceService', '算法 seed 自动治理服务', 'algorithm_governance', 'v1.4.22.3', 'server/src/services/algorithmSeedAutoGovernanceService.ts', ['upgrade_candidates', 'governance_policy'], ['governance_decision', 'override_record'], ['algorithm seed admin routes']),
  entry('algorithmSeedImportService', '算法 seed 导入与版本服务', 'algorithm_governance', 'v1.4.22', 'server/src/services/algorithmSeedImportService.ts', ['seed_registry', 'validated_payloads'], ['seed_versions', 'seed_records', 'rollback_results'], ['algorithm seed admin routes']),
  entry('projectRemainingDurationForecastService', 'Project remaining duration forecast engine', 'duration', 'v1.4.22', 'server/src/services/projectRemainingDurationForecastService.ts', ['schedule_acceleration_rows', 'runtime_execution_facts', 'monthly_commitments'], ['project_remaining_forecast_days', 'forecast_finish_date', 'target_gap_days'], ['scheduleAccelerationRuntimeService', 'schedule-acceleration routes']),
  entry('scheduleAccelerationService', 'Schedule acceleration and target compression engine', 'duration', 'v1.4.22', 'server/src/services/scheduleAccelerationService.ts', ['tasks', 'project_generation_facts', 'algorithm_seed_records', 'runtime_execution_facts'], ['acceleration_target_days', 'recovery_proposal', 'target_feasibility'], ['scheduleAccelerationRuntimeService', 'schedule-acceleration routes']),
]

const SEED_SOURCE_FILES: Partial<Record<AlgorithmSeedType, string>> = {
  workflow_dictionary: 'server/src/seeds/v1474WorkflowDictionarySeed.ts',
  cross_item_workflow: 'server/src/seeds/v1475CrossItemWorkflowSeed.ts',
  building_pattern: 'server/src/seeds/v1474BuildingPatternSeed.ts',
  process_constraint: 'server/src/seeds/v1474ProcessConstraintSeed.ts',
  seasonal_productivity: 'server/src/seeds/v1474SeasonalProductivitySeed.ts',
  work_calendar: 'server/src/seeds/v1474WorkCalendarSeed.ts',
  process_seasonal_sensitivity: 'server/src/seeds/v1474ProcessSeasonalSensitivitySeed.ts',
  resource_class: 'server/src/seeds/v1474ResourceClassSeed.ts',
  site_capacity_pressure: 'server/src/seeds/v1474SiteCapacityPressureSeed.ts',
  standard_work_duration: 'server/src/seeds/standardWorkDurationSeed.ts',
  title_weak_recognition: 'server/src/seeds/v1472TitleWeakRecognitionSeed.ts',
  earliest_start_rule: 'server/src/seeds/v1418EarliestStartRuleSeed.ts',
  standard_internal_flow: 'server/src/seeds/standardInternalFlowSeed.ts',
  regional_climate_rules: 'server/src/seeds/v1474RegionalClimateRuleSeed.ts',
  risk_issue_warning_rule: 'server/src/services/riskIssueWarningRuleRegistry.ts',
  progress_deviation_cause: 'server/src/domain/structuredCauseTaxonomy.ts',
  responsibility_health_rule: 'server/src/seeds/responsibilityHealthRuleSeed.ts',
  milestone_integrity_rule: 'server/src/seeds/milestoneIntegrityRuleSeed.ts',
}

function duplicateKeys<T>(items: readonly T[], readKey: (item: T) => string) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const item of items) {
    const key = readKey(item)
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }
  return [...duplicates].sort()
}

function workspacePathExists(relativePath: string) {
  const cwd = process.cwd()
  return existsSync(resolve(cwd, relativePath))
    || existsSync(resolve(cwd, '..', relativePath))
    || existsSync(join(cwd, relativePath.replace(/^server\//, '')))
}

function withDerivedCatalogFacts(entry: AlgorithmCatalogEntry): AlgorithmCatalogEntry {
  if (entry.algorithmKey !== 'planningReplayCalibrationService') return entry
  return {
    ...entry,
    outputFields: uniqueStrings([
      ...entry.outputFields,
      'algorithm_asset_replay_evaluations',
    ]),
    consumers: uniqueStrings([
      ...entry.consumers,
      'planningReplayCalibrationJob',
    ]),
    metadata: {
      ...entry.metadata,
      productionSweepEntrypoint: 'server/src/jobs/planningReplayCalibrationJob.ts',
      persistenceTarget: 'algorithmAssetReplayService.persistAlgorithmAssetReplayEvaluation',
      mutationPolicy: 'candidate_overlay_only_no_fact_mutation',
    },
  }
}

export function listAlgorithmCatalogEntries() {
  return MAIN_ALGORITHM_CATALOG.map(withDerivedCatalogFacts)
}

export function listAlgorithmCaliberVersions(): AlgorithmCaliberVersionEntry[] {
  return listAlgorithmCatalogEntries().map((algorithm) => ({
    algorithmKey: algorithm.algorithmKey,
    caliberVersion: algorithm.currentCaliberVersion,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo: null,
    changeSummary: 'Current code facts registered by v1.4.22 phase 1-3 governance catalog.',
    inputSources: algorithm.inputSources,
    outputFields: algorithm.outputFields,
    consumerScope: algorithm.consumers,
    rollbackToVersion: null,
    testSuiteKey: `${algorithm.algorithmKey}.governance`,
    metadata: {
      ownerChapter: algorithm.ownerChapter,
      implementationPath: algorithm.implementationPath,
      ordinaryUserVisible: algorithm.ordinaryUserVisible,
    },
  }))
}

function buildRegistrySeedCatalogEntries(): AlgorithmSeedCatalogEntry[] {
  return ALGORITHM_SEED_REGISTRY.map((seed) => ({
    seedKey: seed.seedType,
    seedFile: SEED_SOURCE_FILES[seed.seedType] ?? 'server/src/services/algorithmSeedRegistry.ts',
    seedType: seed.seedType,
    seedVersion: seed.meta.seedVersion,
    registryStatus: 'registry_seed',
    scope: seed.meta.seedScope,
    recordCount: seed.records.length,
    authorityChapter: seed.meta.sourceStandards[0] ?? 'v1.4.22',
    evidenceSummary: {
      sourceStandards: seed.meta.sourceStandards,
      evidenceSources: seed.meta.evidenceSources,
      webVerified: seed.meta.webVerified,
      reviewNeeded: seed.meta.reviewNeeded,
    },
    runtimeEffect: seed.meta.relationshipRole ?? 'governed_algorithm_seed',
    owner: 'algorithmSeedRegistry',
    lifecycleStatus: seed.meta.reviewNeeded ? 'candidate_only' : 'active',
    metadata: {
      expectedCounts: seed.meta.expectedCounts,
      generationPolicy: seed.meta.generationPolicy,
      upstreamRuleTypes: uniqueStrings(seed.meta.upstreamRuleTypes),
      downstreamRuleTypes: uniqueStrings(seed.meta.downstreamRuleTypes),
      boundaryPolicy: uniqueStrings(seed.meta.boundaryPolicy),
    },
  }))
}

function buildCatalogOnlyRuleAssetEntries(): AlgorithmSeedCatalogEntry[] {
  const ruleAssetEntries = listAlgorithmRuleAssets()
    .filter((asset) => asset.lifecycleType !== 'algorithm_seed')
    .map((asset): AlgorithmSeedCatalogEntry => ({
      seedKey: asset.key,
      seedFile: asset.source,
      seedType: asset.lifecycleType,
      seedVersion: ALGORITHM_RULE_ASSET_INVENTORY_VERSION,
      registryStatus: 'catalog_only',
      scope: asset.role,
      recordCount: asset.recordCount ?? 0,
      authorityChapter: asset.governanceSystem,
      evidenceSummary: {
        recommendation: asset.recommendation,
        reason: asset.reason,
        consumers: asset.consumers,
      },
      runtimeEffect: asset.recommendation,
      owner: asset.ownerService,
      lifecycleStatus: asset.recommendation === 'evaluate_before_seed_inclusion' ? 'candidate_only' : 'governance_only',
      metadata: {
        governanceSystem: asset.governanceSystem,
        boundaryPolicy: asset.boundaryPolicy,
        algorithmSeedType: asset.algorithmSeedType ?? null,
      },
    }))
  const seedLifecycleSupportEntries: AlgorithmSeedCatalogEntry[] = [
    {
      seedKey: 'algorithm_seed_upgrade_candidates',
      seedFile: 'server/migrations/149_v1474_algorithm_seed_governance.sql',
      seedType: 'candidate_for_algorithm_seed',
      seedVersion: ALGORITHM_RULE_ASSET_INVENTORY_VERSION,
      registryStatus: 'catalog_only',
      scope: 'company/project scoped candidate rules discovered from history before promotion',
      recordCount: 0,
      authorityChapter: 'v1.4.22.3 rule asset company isolation and self-learning',
      evidenceSummary: {
        ownerService: 'algorithmSeedLearningService',
        reason: 'Candidate rules are governance inputs only and cannot mutate system seeds or business plans before promotion.',
      },
      runtimeEffect: 'candidate_only_until_governed',
      owner: 'algorithmSeedLearningService',
      lifecycleStatus: 'candidate_only',
      metadata: {
        table: 'algorithm_seed_upgrade_candidates',
        boundaryPolicy: [
          'company_project_scope_required',
          'candidate_payload_must_pass_runtime_validation',
          'promotion_requires_auto_governance_or_admin_review',
        ],
      },
    },
    {
      seedKey: 'algorithm_seed_overrides',
      seedFile: 'server/migrations/149_v1474_algorithm_seed_governance.sql',
      seedType: 'service_governance',
      seedVersion: ALGORITHM_RULE_ASSET_INVENTORY_VERSION,
      registryStatus: 'catalog_only',
      scope: 'company/project scoped runtime override layer over read-only system seed records',
      recordCount: 0,
      authorityChapter: 'v1.4.22.3 rule asset company isolation and self-learning',
      evidenceSummary: {
        ownerService: 'algorithmSeedLearningService/algorithmSeedResolver',
        reason: 'Overrides isolate company/project learning without modifying system seed records.',
      },
      runtimeEffect: 'scoped_runtime_override',
      owner: 'algorithmSeedLearningService/algorithmSeedResolver',
      lifecycleStatus: 'governance_only',
      metadata: {
        table: 'algorithm_seed_overrides',
        boundaryPolicy: [
          'system_seed_records_are_readonly',
          'company_override_requires_company_scope',
          'project_override_requires_project_scope',
          'resolver_must_merge_by_scope_without_cross_company_leakage',
        ],
      },
    },
  ]
  return [
    ...ruleAssetEntries,
    ...seedLifecycleSupportEntries,
  ]
}

export function listAlgorithmSeedCatalogEntries(): AlgorithmSeedCatalogEntry[] {
  return [
    ...buildRegistrySeedCatalogEntries(),
    ...buildCatalogOnlyRuleAssetEntries(),
  ]
}

export function getAlgorithmGovernanceCatalogDiagnostics(): AlgorithmGovernanceCatalogDiagnostics {
  const algorithms = listAlgorithmCatalogEntries()
  const seedCatalog = listAlgorithmSeedCatalogEntries()
  const seedCatalogKeys = new Set(seedCatalog.map((seed) => seed.seedKey))
  const nonSeedAssets = listAlgorithmRuleAssets().filter((asset) => asset.lifecycleType !== 'algorithm_seed')
  const ordinaryUserVisibleAlgorithmKeys = algorithms
    .filter((algorithm) => algorithm.ordinaryUserVisible)
    .map((algorithm) => algorithm.algorithmKey)
  const gaps = {
    duplicateAlgorithmKeys: duplicateKeys(algorithms, (algorithm) => algorithm.algorithmKey),
    duplicateSeedKeys: duplicateKeys(seedCatalog, (seed) => seed.seedKey),
    missingAlgorithmImplementationPaths: algorithms
      .filter((algorithm) => !workspacePathExists(algorithm.implementationPath))
      .map((algorithm) => algorithm.implementationPath),
    missingRegistrySeedCatalogEntries: listAlgorithmSeedTypes().filter((seedType) => !seedCatalogKeys.has(seedType)),
    nonRegistryRuleAssetsMissingCatalogEntries: nonSeedAssets
      .filter((asset) => !seedCatalogKeys.has(asset.key))
      .map((asset) => asset.key),
    ordinaryUserVisibleAlgorithmKeys,
  }

  const status = Object.values(gaps).some((items) => items.length > 0) ? 'block' : 'pass'
  return {
    catalogVersion: CATALOG_VERSION,
    status,
    summary: {
      expectedMainAlgorithmCount: MAIN_ALGORITHM_CATALOG.length,
      algorithmCatalogCount: algorithms.length,
      registrySeedTypeCount: listAlgorithmSeedTypes().length,
      seedCatalogCount: seedCatalog.length,
      catalogOnlyRuleAssetCount: nonSeedAssets.length,
      ordinaryUserVisibleAlgorithmCount: ordinaryUserVisibleAlgorithmKeys.length,
    },
    gaps,
    boundaryPolicy: [
      'ordinary_business_frontend_must_not_read_algorithm_catalog_directly',
      'catalog_records_register_current_code_facts_not_final_algorithm_completion',
      'registry_seed_entries_remain_system_readonly',
      'company_or_project_learning_must_use_override_and_candidate_lifecycle',
      'non_registry_rule_assets_are_catalog_only_until_promoted_by_governance',
    ],
  }
}
