#!/usr/bin/env node

import { randomUUID, createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import {
  DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  isApprovedDefaultMasterPlanNonProductionTarget,
  readDefaultMasterPlanEnvTarget,
  sameDefaultMasterPlanDatabaseTarget,
} from './default-master-plan-env-target.mjs'

const __filename = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(__filename)
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_REFRESH_PACKAGE = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-package.json')
const DEFAULT_PREFLIGHT = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-execution-preflight.json')
const DEFAULT_AUTHORIZATION_PACKAGE = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-authorization-package.json')
const DEFAULT_READINESS_SEAL = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-execution-readiness-seal.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-execution.json')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'deploy', 'env', 'staging.env')
const AUTHORIZATION_PACKAGE_REF_KIND = 'candidate_refresh_authorization_package'
const READINESS_SEAL_REF_KIND = 'candidate_refresh_execution_readiness_seal'
const REQUIRED_UNLOCK = 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH'
const EXPECTED_OPERATION_MODE = 'full_replace_candidate_baseline_items_from_profile_report'
const DURATION_CALIBRATION_SOURCE = 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence'
const ALLOWED_ENVIRONMENTS = new Set(['local', 'staging'])
const CANDIDATE_SOURCE_LABELS = new Set([
  'managed_frontier_default_master_plan',
  'asset_backed_default_master_plan',
  'residential_master_plan_v2',
])
const AUTOMATION_ACTOR_PATTERNS = [
  /^codex\b/i,
  /^automation\b/i,
  /^bot\b/i,
  /^system\b/i,
]

const BASELINE_ITEM_COLUMNS = [
  'id',
  'project_id',
  'baseline_version_id',
  'parent_item_id',
  'source_task_id',
  'source_milestone_id',
  'title',
  'planned_start_date',
  'planned_end_date',
  'target_progress',
  'sort_order',
  'is_milestone',
  'is_critical',
  'is_baseline_critical',
  'mapping_status',
  'notes',
  'template_id',
  'template_node_id',
  'engineering_category_id',
  'wbs_node_type',
  'wbs_path',
  'is_wbs_summary',
  'is_executable',
  'standard_work_code',
  'standard_work_name',
  'duration_calibration_source',
  'duration_provenance',
  'generation_metadata',
  'last_generated_at',
  'created_at',
  'updated_at',
]
const BASELINE_ITEM_JSON_COLUMNS = new Set(['generation_metadata'])

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    refreshPackage: DEFAULT_REFRESH_PACKAGE,
    preflight: DEFAULT_PREFLIGHT,
    authorizationPackage: DEFAULT_AUTHORIZATION_PACKAGE,
    readinessSeal: DEFAULT_READINESS_SEAL,
    output: DEFAULT_OUTPUT,
    envFile: DEFAULT_ENV_FILE,
    environment: 'staging',
    operatorApprovalRef: '',
    refreshedBy: '',
    mode: 'dry-run',
    allowRefresh: false,
    failOnBlocked: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }

    if (arg === '--refresh-package') args.refreshPackage = path.resolve(nextValue())
    else if (arg === '--preflight') args.preflight = path.resolve(nextValue())
    else if (arg === '--authorization-package') args.authorizationPackage = path.resolve(nextValue())
    else if (arg === '--readiness-seal') args.readinessSeal = path.resolve(nextValue())
    else if (arg === '--output') args.output = path.resolve(nextValue())
    else if (arg === '--env-file') args.envFile = path.resolve(nextValue())
    else if (arg === '--environment') args.environment = text(nextValue()) || args.environment
    else if (arg === '--operator-approval-ref') args.operatorApprovalRef = text(nextValue())
    else if (arg === '--refreshed-by') args.refreshedBy = text(nextValue())
    else if (arg === '--mode') args.mode = text(nextValue())
    else if (arg === '--allow-refresh') args.allowRefresh = true
    else if (arg === '--fail-on-blocked') args.failOnBlocked = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

export function mapReplacementRowsToBaselineItems({
  rows = [],
  baselineId,
  projectId,
  businessType,
  refreshedBy,
  operatorApprovalRef,
  generatedAt = new Date().toISOString(),
  idFactory = (_index, _row) => randomUUID(),
} = {}) {
  return readArray(rows).map((row, index) => {
    const record = readRecord(row)
    const code = firstText(record.code, record.standardWorkCode, record.standard_work_code)
    const title = firstText(record.title, record.name, code, 'Candidate master-plan item')
    const executionPhase = firstText(record.executionPhase, record.execution_phase)
    const executionLane = firstText(record.executionLane, record.execution_lane)
    const planReferenceDays = readPositiveNumber(record.durationDays ?? record.duration_days ?? record.smartReferenceDays ?? record.smart_reference_days)
    const rowBusinessType = firstText(record.businessType, record.business_type, businessType)
    const durationCalibrationSource = firstText(record.durationCalibrationSource, record.duration_calibration_source, DURATION_CALIBRATION_SOURCE)
    const durationProvenance = firstText(record.durationProvenance, record.duration_provenance, 'candidate_asset_backed')
    const profileSourceType = firstText(record.profileSourceType, record.profile_source_type)
    const clientRowId = firstText(record.clientRowId, record.client_row_id)
    const predecessorDependencies = normalizePredecessorDependencies(
      record.predecessorDependencies ?? record.predecessor_dependencies,
    )

    return {
      id: idFactory(index, record),
      project_id: projectId,
      baseline_version_id: baselineId,
      parent_item_id: null,
      source_task_id: null,
      source_milestone_id: null,
      title,
      planned_start_date: dateOnly(record.startDate ?? record.start_date ?? record.plannedStart ?? record.planned_start_date),
      planned_end_date: dateOnly(record.endDate ?? record.end_date ?? record.plannedEnd ?? record.planned_end_date),
      target_progress: null,
      sort_order: readNumber(record.sortOrder ?? record.sort_order ?? record.index ?? index + 1, index + 1),
      is_milestone: record.isMilestone === true || record.is_milestone === true,
      is_critical: false,
      is_baseline_critical: false,
      mapping_status: 'pending',
      notes: null,
      template_id: null,
      template_node_id: null,
      engineering_category_id: null,
      wbs_node_type: firstText(record.wbsNodeType, record.wbs_node_type, 'item_work'),
      wbs_path: null,
      is_wbs_summary: true,
      is_executable: false,
      standard_work_code: code || null,
      standard_work_name: title,
      duration_calibration_source: durationCalibrationSource,
      duration_provenance: durationProvenance,
      generation_metadata: {
        source: 'candidate_refresh_execution',
        refreshPackageSource: firstText(record.source),
        stableCode: code || null,
        standardWorkCode: code || null,
        standardWorkName: title,
        businessType: rowBusinessType || null,
        profileSourceType: profileSourceType || null,
        clientRowId: clientRowId || null,
        predecessorDependencies,
        executionPhase: executionPhase || null,
        executionLane: executionLane || null,
        durationSuggestion: {
          durationOutputCode: 'plan_reference',
          durationOutputSemanticFieldName: 'planReferenceDays',
          planReferenceDays,
          durationCalibrationSource,
          durationProvenance,
          planDurationTruthSource: 'asset_backed_candidate_master_plan',
          dataMaturity: 'L1',
          dataUpgradeBlockedBy: ['GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'],
        },
        candidateRefreshExecution: {
          refreshedAt: generatedAt,
          refreshedBy,
          operatorApprovalRef,
          operationMode: EXPECTED_OPERATION_MODE,
        },
        mutationBoundary: {
          writesProductionTables: false,
          writesCandidateBaselines: false,
          writesTasks: false,
          writesTaskDependencies: false,
          writesProductionDependencies: false,
          writesCriticalPathFacts: false,
          writesDurationSamples: false,
          writesRuntimePublication: false,
        },
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
        writesProductionDependencies: false,
        writesCriticalPathFacts: false,
        writesDurationSamples: false,
        writesRuntimePublication: false,
        refreshedBy,
        operatorApprovalRef,
      },
      last_generated_at: generatedAt,
      created_at: generatedAt,
      updated_at: generatedAt,
    }
  })
}

function normalizePredecessorDependencies(value) {
  return readArray(value)
    .map((dependency) => readRecord(dependency))
    .map((dependency) => ({
      clientRowId: firstText(
        dependency.clientRowId,
        dependency.client_row_id,
        dependency.predecessorClientRowId,
        dependency.predecessor_client_row_id,
      ),
      dependencyType: firstText(dependency.dependencyType, dependency.dependency_type, 'FS').toUpperCase(),
      lagDays: readNumber(dependency.lagDays ?? dependency.lag_days, 0),
      intentCode: firstText(dependency.intentCode, dependency.intent_code, dependency.intent),
    }))
    .filter((dependency) => dependency.clientRowId)
}

export function evaluateCandidateRefreshExecutionGate({
  refreshPackage,
  preflight,
  authorizationPackage = null,
  readinessSeal = null,
  args = {},
  env = process.env,
  loadedRefreshPackage = null,
  loadedPreflight = null,
  loadedAuthorizationPackage = null,
  loadedReadinessSeal = null,
  target = null,
} = {}) {
  const packageRows = readArray(refreshPackage?.targetReplacementRows)
  const normalizedMode = text(args.mode || 'dry-run')
  const normalizedEnvironment = text(args.environment || preflight?.executionPlan?.environment || 'staging')
  const operatorApprovalRef = text(args.operatorApprovalRef)
  const refreshedBy = text(args.refreshedBy)
  const unlockPresent = text(env?.[REQUIRED_UNLOCK]) === '1'
  const targetRowsSafe = packageRows.every(isSafeReplacementRow)
  const preflightExecutionPlan = readRecord(preflight?.executionPlan)
  const candidateDiscovery = readRecord(preflight?.candidateDiscovery)
  const candidateDiscoveryFilters = readRecord(candidateDiscovery.filters)
  const candidateDiscoveryBlockers = readArray(candidateDiscovery.blockers)
  const preflightExecutionTarget = readRecord(preflight?.executionTarget)
  const currentExecutionTarget = readRecord(target)
  const currentTargetProvided = Object.keys(currentExecutionTarget).length > 0
  const expectedBaselineId = firstText(refreshPackage?.baselineId, refreshPackage?.baseline_id)
  const expectedProjectId = firstText(refreshPackage?.projectId, refreshPackage?.project_id)
  const preflightReady = text(preflight?.status) === 'ready_for_execute' && preflight?.mayExecuteCandidateRefresh === true
  const preflightRefreshPackageRef = parseArtifactRef(preflight?.refreshPackageRef)
  const actualRefreshPackageSha256 = text(loadedRefreshPackage?.sha256)
  const requirePreflightRefreshPackageHash = Boolean(preflight?.refreshPackageRef || actualRefreshPackageSha256)
  const authorizationBlockers = normalizedMode === 'execute' ? buildAuthorizationPackageBlockers({
    refreshPackage,
    preflight,
    authorizationPackage,
    args,
    loadedRefreshPackage,
    loadedPreflight,
    loadedAuthorizationPackage,
    preflightReady,
  }) : []
  const readinessSealBlockers = normalizedMode === 'execute' ? buildReadinessSealBlockers({
    refreshPackage,
    preflight,
    readinessSeal,
    args,
    loadedPreflight,
    loadedAuthorizationPackage,
  }) : []

  const blockers = uniqueStrings([
    text(refreshPackage?.status) === 'refresh_required' ? null : 'candidate_refresh_package_not_refresh_required',
    refreshPackage?.refreshRequired === true ? null : 'candidate_refresh_required_flag_missing',
    firstText(refreshPackage?.baselineId, refreshPackage?.baseline_id) ? null : 'baseline_id_required',
    firstText(refreshPackage?.projectId, refreshPackage?.project_id) ? null : 'project_id_required',
    firstText(refreshPackage?.businessType, refreshPackage?.business_type) ? null : 'business_type_required',
    readRecord(refreshPackage?.operationPlan).mode === EXPECTED_OPERATION_MODE ? null : 'candidate_refresh_operation_mode_invalid',
    refreshPackage?.productionReady === false ? null : 'candidate_refresh_package_must_not_mark_production_ready',
    packageRows.length > 0 ? null : 'candidate_refresh_target_replacement_rows_required',
    targetRowsSafe ? null : 'candidate_refresh_target_rows_must_be_candidate_only_no_runtime_writes',
    preflightReady ? null : 'candidate_refresh_preflight_not_ready',
    currentTargetProvided && Object.keys(preflightExecutionTarget).length === 0
      ? 'candidate_refresh_preflight_execution_target_required'
      : null,
    currentTargetProvided && !sameDefaultMasterPlanDatabaseTarget(preflightExecutionTarget, currentExecutionTarget)
      ? 'candidate_refresh_preflight_execution_target_mismatch'
      : null,
    Object.keys(candidateDiscovery).length > 0
      ? null
      : 'candidate_refresh_preflight_candidate_discovery_required',
    Object.keys(candidateDiscovery).length === 0 || candidateDiscovery.matchingBaselineFound === true
      ? null
      : 'candidate_refresh_preflight_target_baseline_not_found',
    candidateDiscoveryBlockers.length === 0
      ? null
      : 'candidate_refresh_preflight_candidate_discovery_blocked',
    text(candidateDiscovery.matchedBaselineId) && expectedBaselineId && text(candidateDiscovery.matchedBaselineId) !== expectedBaselineId
      ? 'candidate_refresh_preflight_candidate_discovery_baseline_mismatch'
      : null,
    text(candidateDiscoveryFilters.projectId) && expectedProjectId && text(candidateDiscoveryFilters.projectId) !== expectedProjectId
      ? 'candidate_refresh_preflight_candidate_discovery_project_mismatch'
      : null,
    text(candidateDiscoveryFilters.environment) && normalizedEnvironment && text(candidateDiscoveryFilters.environment) !== normalizedEnvironment
      ? 'candidate_refresh_preflight_candidate_discovery_environment_mismatch'
      : null,
    !requirePreflightRefreshPackageHash || preflightRefreshPackageRef.sha256
      ? null
      : 'candidate_refresh_preflight_refresh_package_hash_required',
    preflightRefreshPackageRef.sha256 && actualRefreshPackageSha256 && preflightRefreshPackageRef.sha256 !== actualRefreshPackageSha256
      ? 'candidate_refresh_preflight_refresh_package_hash_mismatch'
      : null,
    readArray(preflight?.packageHardBlockers).length === 0 ? null : 'candidate_refresh_preflight_has_unresolved_hard_blockers',
    baselineMatches(refreshPackage, preflight) ? null : 'candidate_refresh_preflight_baseline_mismatch',
    projectMatches(refreshPackage, preflight) ? null : 'candidate_refresh_preflight_project_mismatch',
    businessTypeMatches(refreshPackage, preflight) ? null : 'candidate_refresh_preflight_business_type_mismatch',
    preflight?.refreshPlan?.targetReplacementRowCount == null || Number(preflight.refreshPlan.targetReplacementRowCount) === packageRows.length
      ? null
      : 'candidate_refresh_preflight_target_row_count_mismatch',
    ALLOWED_ENVIRONMENTS.has(normalizedEnvironment) ? null : 'candidate_refresh_environment_must_be_local_or_staging',
    normalizedMode === 'execute' && currentTargetProvided && !isApprovedDefaultMasterPlanNonProductionTarget(currentExecutionTarget, {
      environment: normalizedEnvironment,
      expectedStagingProjectRef: text(args.expectedStagingProjectRef) || DEFAULT_STAGING_SUPABASE_PROJECT_REF,
    })
      ? normalizedEnvironment === 'staging'
        ? 'candidate_refresh_target_not_approved_staging_project'
        : 'candidate_refresh_target_not_approved_non_production'
      : null,
    unlockPresent ? null : 'candidate_refresh_execution_unlock_required',
    args.allowRefresh === true ? null : 'candidate_refresh_execution_allow_refresh_required',
    normalizedMode === 'execute' ? null : 'candidate_refresh_execute_mode_required',
    operatorApprovalRef ? null : 'candidate_refresh_operator_approval_required',
    refreshedBy ? null : 'candidate_refresh_refreshed_by_required',
    refreshedBy && isHumanActor(refreshedBy) ? null : refreshedBy ? 'human_candidate_refresh_actor_required' : null,
    preflightReady && text(preflightExecutionPlan.operatorApprovalRef) && operatorApprovalRef && operatorApprovalRef !== text(preflightExecutionPlan.operatorApprovalRef)
      ? 'candidate_refresh_operator_approval_mismatch'
      : null,
    preflightReady && text(preflightExecutionPlan.refreshedBy) && refreshedBy && refreshedBy !== text(preflightExecutionPlan.refreshedBy)
      ? 'candidate_refresh_refreshed_by_mismatch'
      : null,
    ...authorizationBlockers,
    ...readinessSealBlockers,
  ])

  return {
    executionAllowed: blockers.length === 0,
    blockers,
    unlockPresent,
    mode: normalizedMode,
    environment: normalizedEnvironment,
    operatorApprovalRef,
    refreshedBy,
    targetRowsSafe,
    authorizationPackageChecked: Boolean(authorizationPackage && Object.keys(readRecord(authorizationPackage)).length > 0),
    authorizationPackageVerified: Boolean(authorizationPackage && Object.keys(readRecord(authorizationPackage)).length > 0)
      && authorizationBlockers.length === 0,
    readinessSealChecked: Object.keys(readRecord(readinessSeal)).length > 0,
    readinessSealVerified: Object.keys(readRecord(readinessSeal)).length > 0 && readinessSealBlockers.length === 0,
  }
}

export function buildCandidateRefreshExecutionReport({
  refreshPackage,
  preflight,
  authorizationPackage = null,
  readinessSeal = null,
  args = {},
  env = process.env,
  executionResult = null,
  generatedAt = new Date().toISOString(),
  loadedRefreshPackage = null,
  loadedPreflight = null,
  loadedAuthorizationPackage = null,
  loadedReadinessSeal = null,
  target = null,
} = {}) {
  const gate = evaluateCandidateRefreshExecutionGate({
    refreshPackage,
    preflight,
    authorizationPackage,
    readinessSeal,
    args,
    env,
    loadedRefreshPackage,
    loadedPreflight,
    loadedAuthorizationPackage,
    loadedReadinessSeal,
    target,
  })
  const targetRows = readArray(refreshPackage?.targetReplacementRows)
  const failedExecution = executionResult?.status === 'failed'
  const completedExecution = executionResult?.status === 'completed'
  const dryRun = gate.blockers.length === 1
    && gate.blockers[0] === 'candidate_refresh_execute_mode_required'
    && gate.mode === 'dry-run'
  const status = failedExecution
    ? 'candidate_refresh_execution_failed'
    : completedExecution
      ? 'candidate_refresh_execution_completed'
      : dryRun
        ? 'candidate_refresh_execution_dry_run'
        : gate.executionAllowed
          ? 'candidate_refresh_execution_ready'
          : 'candidate_refresh_execution_blocked'
  const blockers = failedExecution
    ? classifyExecutionFailureBlockers(executionResult)
    : gate.blockers
  const dbRepairPlan = buildCandidateRefreshDbRepairPlan({
    status,
    blockers,
    target,
    errorCode: failedExecution ? text(executionResult?.errorCode) : '',
    errorMessage: failedExecution ? text(executionResult?.errorMessage) : '',
  })
  const executionGatePlan = buildCandidateRefreshExecutionGatePlan({
    status,
    blockers,
    gate,
  })

  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    source: 'run-default-master-plan-candidate-refresh-execution',
    generatedAt,
    status,
    productionReady: false,
    baselineId: firstText(refreshPackage?.baselineId, refreshPackage?.baseline_id),
    projectId: firstText(refreshPackage?.projectId, refreshPackage?.project_id),
    businessType: firstText(refreshPackage?.businessType, refreshPackage?.business_type),
    target: normalizeTargetSummary(target),
    executionGatePlan,
    dbRepairPlan,
    evidence: {
      refreshPackageRef: artifactRef('candidate_refresh_package', loadedRefreshPackage),
      preflightRef: artifactRef('candidate_refresh_execution_preflight', loadedPreflight),
      authorizationPackageRef: artifactRef(AUTHORIZATION_PACKAGE_REF_KIND, loadedAuthorizationPackage),
      readinessSealRef: artifactRef(READINESS_SEAL_REF_KIND, loadedReadinessSeal),
    },
    executionControl: {
      executionAllowed: gate.executionAllowed,
      mode: gate.mode,
      environment: gate.environment,
      allowRefresh: args.allowRefresh === true,
      requiredUnlock: REQUIRED_UNLOCK,
      unlockPresent: gate.unlockPresent,
      operatorApprovalRef: gate.operatorApprovalRef,
      refreshedBy: gate.refreshedBy,
      authorizationPackageChecked: gate.authorizationPackageChecked,
      authorizationPackageVerified: gate.authorizationPackageVerified,
      readinessSealChecked: gate.readinessSealChecked,
      readinessSealVerified: gate.readinessSealVerified,
    },
    refreshPlan: {
      operationMode: EXPECTED_OPERATION_MODE,
      targetReplacementRowCount: targetRows.length,
      targetRowsSafe: gate.targetRowsSafe,
      wouldDeleteExistingRows: targetRows.length > 0,
      wouldInsertReplacementRows: targetRows.length > 0,
      diff: readRecord(refreshPackage?.diff),
    },
    deletedRowCount: Number(executionResult?.deletedRowCount ?? 0),
    insertedRowCount: Number(executionResult?.insertedRowCount ?? 0),
    blockers,
    errorCode: failedExecution ? text(executionResult?.errorCode) || null : null,
    errorMessage: failedExecution ? text(executionResult?.errorMessage) : null,
    failureClass: failedExecution ? dbRepairPlan.failureClass : null,
    transaction: {
      attempted: executionResult?.transactionAttempted === true || readArray(executionResult?.queryLog).length > 0,
      committed: completedExecution,
      rolledBack: executionResult?.transactionRolledBack === true,
      queryLog: readArray(executionResult?.queryLog),
    },
    mutationBoundary: {
      readsCandidateRefreshPackage: true,
      readsCandidateRefreshExecutionPreflight: true,
      readsCandidateRefreshAuthorizationPackage: Boolean(loadedAuthorizationPackage),
      readsEnvUnlockFlags: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTaskBaselineItems: completedExecution,
      writesCandidateBaselines: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesProductionDependencies: false,
      writesCriticalPathFacts: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      performsRollback: executionResult?.transactionRolledBack === true,
      invokesRuntimeWriters: false,
    },
    nextActions: nextActionsForStatus(status, blockers, target),
  }
}

function buildAuthorizationPackageBlockers({
  refreshPackage,
  preflight,
  authorizationPackage,
  args = {},
  loadedRefreshPackage = null,
  loadedPreflight = null,
  preflightReady = false,
} = {}) {
  const auth = readRecord(authorizationPackage)
  if (Object.keys(auth).length === 0) return ['candidate_refresh_authorization_package_required']

  const template = readRecord(auth.operatorFillTemplate ?? auth.operator_fill_template)
  const approval = readRecord(template.approval)
  const execution = readRecord(template.execution)
  const mutationBoundary = readRecord(auth.mutationBoundary ?? auth.mutation_boundary)
  const expectedBaselineId = firstText(refreshPackage?.baselineId, refreshPackage?.baseline_id)
  const expectedProjectId = firstText(refreshPackage?.projectId, refreshPackage?.project_id)
  const expectedBusinessType = firstText(refreshPackage?.businessType, refreshPackage?.business_type)
  const authBaselineId = firstText(auth.baselineId, auth.baseline_id, template.baselineId, template.baseline_id)
  const authProjectId = firstText(auth.projectId, auth.project_id, template.projectId, template.project_id)
  const authBusinessType = firstText(auth.businessType, auth.business_type, template.businessType, template.business_type)
  const expectedEnvironment = text(args.environment || preflight?.executionPlan?.environment || 'staging')
  const authEnvironment = firstText(auth.environment, template.environment)
  const authApprovalRef = firstText(approval.operatorApprovalRef, approval.operator_approval_ref)
  const authRefreshedBy = firstText(approval.refreshedBy, approval.refreshed_by)
  const packageReadinessBlockers = uniqueStrings(auth.packageReadinessBlockers ?? auth.package_readiness_blockers)

  return uniqueStrings([
    text(auth.status) === 'authorization_package_ready' ? null : 'candidate_refresh_authorization_package_not_ready',
    auth.productionReady === false ? null : 'candidate_refresh_authorization_package_must_not_mark_production_ready',
    auth.preflightReady === true || auth.preflight_ready === true ? null : 'candidate_refresh_authorization_preflight_not_ready',
    preflightReady ? null : 'candidate_refresh_authorization_preflight_gate_not_ready',
    auth.executionCompleted === true || auth.execution_completed === true ? 'candidate_refresh_authorization_execution_already_completed' : null,
    packageReadinessBlockers.length === 0 ? null : 'candidate_refresh_authorization_package_readiness_blockers_present',
    mutationBoundary.packageOnly === true || mutationBoundary.package_only === true ? null : 'candidate_refresh_authorization_package_only_required',
    mutationBoundary.doesNotMutateDatabase === true || mutationBoundary.does_not_mutate_database === true ? null : 'candidate_refresh_authorization_no_db_mutation_boundary_required',
    expectedBaselineId && authBaselineId && expectedBaselineId !== authBaselineId ? 'candidate_refresh_authorization_baseline_mismatch' : null,
    expectedProjectId && authProjectId && expectedProjectId !== authProjectId ? 'candidate_refresh_authorization_project_mismatch' : null,
    expectedBusinessType && authBusinessType && expectedBusinessType !== authBusinessType ? 'candidate_refresh_authorization_business_type_mismatch' : null,
    authEnvironment && expectedEnvironment && authEnvironment !== expectedEnvironment ? 'candidate_refresh_authorization_environment_mismatch' : null,
    authApprovalRef && !isPlaceholder(authApprovalRef) ? null : 'candidate_refresh_authorization_operator_approval_required',
    authRefreshedBy && !isPlaceholder(authRefreshedBy) ? null : 'candidate_refresh_authorization_refreshed_by_required',
    text(args.operatorApprovalRef) && authApprovalRef && !isPlaceholder(authApprovalRef) && text(args.operatorApprovalRef) !== authApprovalRef
      ? 'candidate_refresh_authorization_operator_approval_mismatch'
      : null,
    text(args.refreshedBy) && authRefreshedBy && !isPlaceholder(authRefreshedBy) && text(args.refreshedBy) !== authRefreshedBy
      ? 'candidate_refresh_authorization_refreshed_by_mismatch'
      : null,
    text(execution.mode) === 'execute' ? null : 'candidate_refresh_authorization_execute_mode_required',
    execution.allowRefresh === true || execution.allow_refresh === true ? null : 'candidate_refresh_authorization_allow_refresh_required',
    loadedRefreshPackage?.path && artifactPathMatches(loadedRefreshPackage.path, execution.refreshPackagePath ?? execution.refresh_package_path)
      ? null
      : 'candidate_refresh_authorization_refresh_package_path_mismatch',
    loadedPreflight?.path && artifactPathMatches(loadedPreflight.path, auth.preflightRef ?? auth.preflight_ref, 'candidate_refresh_execution_preflight')
      ? null
      : 'candidate_refresh_authorization_preflight_ref_mismatch',
  ])
}

function buildReadinessSealBlockers({
  refreshPackage,
  preflight,
  readinessSeal,
  args = {},
  loadedPreflight = null,
  loadedAuthorizationPackage = null,
} = {}) {
  const seal = readRecord(readinessSeal)
  if (Object.keys(seal).length === 0) return ['candidate_refresh_execution_readiness_seal_required']
  const executionControl = readRecord(seal.executionControl)
  const authRef = parseArtifactRef(seal.authorizationPackageRef)
  const preflightRef = parseArtifactRef(seal.preflightRef)
  const expectedBaselineId = firstText(refreshPackage?.baselineId, refreshPackage?.baseline_id)
  const expectedProjectId = firstText(refreshPackage?.projectId, refreshPackage?.project_id)
  const expectedBusinessType = firstText(refreshPackage?.businessType, refreshPackage?.business_type)
  const expectedEnvironment = text(args.environment || preflight?.executionPlan?.environment || 'staging')
  return uniqueStrings([
    text(seal.status) === 'ready_for_candidate_refresh_execution' ? null : 'candidate_refresh_execution_readiness_seal_not_ready',
    seal.productionReady === false ? null : 'candidate_refresh_execution_readiness_seal_must_not_mark_production_ready',
    executionControl.executeReady === true ? null : 'candidate_refresh_execution_readiness_seal_execute_flag_required',
    expectedBaselineId && text(seal.baselineId) === expectedBaselineId ? null : 'candidate_refresh_execution_readiness_seal_baseline_mismatch',
    expectedProjectId && text(seal.projectId) === expectedProjectId ? null : 'candidate_refresh_execution_readiness_seal_project_mismatch',
    expectedBusinessType && text(seal.businessType) === expectedBusinessType ? null : 'candidate_refresh_execution_readiness_seal_business_type_mismatch',
    text(seal.environment) === expectedEnvironment ? null : 'candidate_refresh_execution_readiness_seal_environment_mismatch',
    loadedAuthorizationPackage?.path && artifactPathMatches(loadedAuthorizationPackage.path, seal.authorizationPackageRef, AUTHORIZATION_PACKAGE_REF_KIND)
      ? null
      : 'candidate_refresh_execution_readiness_seal_authorization_ref_mismatch',
    loadedAuthorizationPackage?.sha256 && authRef.sha256 === loadedAuthorizationPackage.sha256
      ? null
      : 'candidate_refresh_execution_readiness_seal_authorization_hash_mismatch',
    loadedPreflight?.path && artifactPathMatches(loadedPreflight.path, seal.preflightRef, 'candidate_refresh_execution_preflight')
      ? null
      : 'candidate_refresh_execution_readiness_seal_preflight_ref_mismatch',
    loadedPreflight?.sha256 && preflightRef.sha256 === loadedPreflight.sha256
      ? null
      : 'candidate_refresh_execution_readiness_seal_preflight_hash_mismatch',
  ])
}

export async function runDefaultMasterPlanCandidateRefreshExecution({
  refreshPackage = DEFAULT_REFRESH_PACKAGE,
  preflight = DEFAULT_PREFLIGHT,
  authorizationPackage = DEFAULT_AUTHORIZATION_PACKAGE,
  readinessSeal = DEFAULT_READINESS_SEAL,
  output = DEFAULT_OUTPUT,
  envFile = DEFAULT_ENV_FILE,
  environment = 'staging',
  operatorApprovalRef = '',
  refreshedBy = '',
  mode = 'dry-run',
  allowRefresh = false,
  env = process.env,
  dbClientFactory = null,
  targetReader = null,
  expectedStagingProjectRef = DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  idFactory,
  now = new Date(),
} = {}) {
  const loadedRefreshPackage = await readJsonWithHash(path.resolve(refreshPackage))
  const loadedPreflight = await readJsonWithHash(path.resolve(preflight))
  const loadedAuthorizationPackage = authorizationPackage
    ? await readJsonWithHashIfPresent(path.resolve(authorizationPackage))
    : null
  const loadedReadinessSeal = readinessSeal
    ? await readJsonWithHashIfPresent(path.resolve(readinessSeal))
    : null
  const target = await (targetReader ?? ((file) => readDefaultMasterPlanEnvTarget(file, { repoRoot: REPO_ROOT })))(path.resolve(envFile))
  const generatedAt = now.toISOString()
  const args = {
    mode,
    allowRefresh,
    environment,
    operatorApprovalRef,
    refreshedBy,
    expectedStagingProjectRef,
  }
  const gate = evaluateCandidateRefreshExecutionGate({
    refreshPackage: loadedRefreshPackage.json,
    preflight: loadedPreflight.json,
    authorizationPackage: loadedAuthorizationPackage?.json ?? null,
    readinessSeal: loadedReadinessSeal?.json ?? null,
    args,
    env,
    loadedRefreshPackage,
    loadedPreflight,
    loadedAuthorizationPackage,
    loadedReadinessSeal,
    target,
  })

  if (!gate.executionAllowed) {
    const report = buildCandidateRefreshExecutionReport({
      refreshPackage: loadedRefreshPackage.json,
      preflight: loadedPreflight.json,
      authorizationPackage: loadedAuthorizationPackage?.json ?? null,
      readinessSeal: loadedReadinessSeal?.json ?? null,
      args,
      env,
      generatedAt,
      loadedRefreshPackage,
      loadedPreflight,
      loadedAuthorizationPackage,
      loadedReadinessSeal,
      target,
    })
    await writeReport(path.resolve(output), report)
    return report
  }

  const targetRows = readArray(loadedRefreshPackage.json.targetReplacementRows)
  const items = mapReplacementRowsToBaselineItems({
    rows: targetRows,
    baselineId: firstText(loadedRefreshPackage.json.baselineId, loadedRefreshPackage.json.baseline_id),
    projectId: firstText(loadedRefreshPackage.json.projectId, loadedRefreshPackage.json.project_id),
    businessType: firstText(loadedRefreshPackage.json.businessType, loadedRefreshPackage.json.business_type),
    refreshedBy: gate.refreshedBy,
    operatorApprovalRef: gate.operatorApprovalRef,
    generatedAt,
    idFactory,
  })
  const factory = dbClientFactory ?? (() => createPgClient(envFile))
  let client = null
  let executionResult = null
  try {
    client = await factory()
    executionResult = await executeCandidateRefreshTransaction({
      client,
      baselineId: firstText(loadedRefreshPackage.json.baselineId, loadedRefreshPackage.json.baseline_id),
      projectId: firstText(loadedRefreshPackage.json.projectId, loadedRefreshPackage.json.project_id),
      items,
    })
  } catch (error) {
    executionResult = {
      status: 'failed',
      deletedRowCount: Number(error?.deletedRowCount ?? 0),
      insertedRowCount: 0,
      errorCode: text(error?.code),
      errorMessage: error?.message ?? String(error),
      transactionAttempted: readArray(error?.queryLog).length > 0,
      connectionFailed: !client,
      transactionRolledBack: client ? true : false,
      queryLog: readArray(error?.queryLog),
    }
  } finally {
    if (client && typeof client.end === 'function') {
      await client.end().catch(() => undefined)
    }
  }

  const report = buildCandidateRefreshExecutionReport({
    refreshPackage: loadedRefreshPackage.json,
    preflight: loadedPreflight.json,
    authorizationPackage: loadedAuthorizationPackage?.json ?? null,
    readinessSeal: loadedReadinessSeal?.json ?? null,
    args,
    env,
    executionResult,
    generatedAt,
    loadedRefreshPackage,
    loadedPreflight,
    loadedAuthorizationPackage,
    loadedReadinessSeal,
    target,
  })
  await writeReport(path.resolve(output), report)
  return report
}

async function createPgClient(envFile) {
  const parsed = dotenv.parse(await fs.readFile(envFile, 'utf8'))
  const connectionString = text(parsed.SUPABASE_MIGRATION_URL) || text(parsed.DB_CONNECTION_STRING) || text(parsed.DATABASE_URL)
  if (!connectionString) throw new Error('SUPABASE_MIGRATION_URL, DB_CONNECTION_STRING, or DATABASE_URL is required')
  const client = new pg.Client(buildPgClientConfig(connectionString, parsed))
  await client.connect()
  return client
}

export function buildPgClientConfig(connectionString, env = {}) {
  const normalizedConnectionString = stripSslModeFromConnectionString(connectionString)
  return {
    connectionString: normalizedConnectionString,
    ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 30000,
    statement_timeout: 30000,
  }
}

function stripSslModeFromConnectionString(connectionString) {
  try {
    const url = new URL(connectionString)
    url.searchParams.delete('sslmode')
    return url.toString()
  } catch {
    return connectionString
  }
}

async function summarizeEnvTarget(envFile) {
  const envFilePath = path.resolve(envFile)
  const base = {
    envFileRef: repoRelative(envFilePath),
    envFileReadable: false,
    envFileSha256: null,
    connectionSource: null,
    databaseHost: null,
    databasePort: null,
    databaseName: null,
    databaseUser: null,
    supabaseProjectRef: null,
    hasPassword: false,
    sslmode: null,
    parseError: null,
  }

  let raw = ''
  try {
    raw = await fs.readFile(envFilePath, 'utf8')
  } catch (error) {
    return {
      ...base,
      parseError: `env_file_unreadable:${text(error?.code || error?.message || error)}`,
    }
  }

  const parsed = dotenv.parse(raw)
  const connectionSource = ['SUPABASE_MIGRATION_URL', 'DB_CONNECTION_STRING', 'DATABASE_URL']
    .find((key) => text(parsed[key]))
  const summary = {
    ...base,
    envFileReadable: true,
    envFileSha256: createHash('sha256').update(raw).digest('hex'),
    connectionSource: connectionSource ?? null,
  }
  if (!connectionSource) return summary

  try {
    const url = new URL(text(parsed[connectionSource]))
    return {
      ...summary,
      databaseHost: url.hostname || null,
      databasePort: url.port || null,
      databaseName: url.pathname.replace(/^\//, '') || null,
      databaseUser: url.username || null,
      supabaseProjectRef: deriveSupabaseProjectRef(url),
      hasPassword: Boolean(url.password),
      sslmode: url.searchParams.get('sslmode') || null,
    }
  } catch (error) {
    return {
      ...summary,
      parseError: `connection_url_parse_failed:${text(error?.message || error)}`,
    }
  }
}

function deriveSupabaseProjectRef(url) {
  const host = text(url?.hostname)
  const directHostMatch = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(host)
  if (directHostMatch) return directHostMatch[1]

  const username = text(url?.username)
  const usernameMatch = /^[^.]+\.([a-z0-9]+)$/i.exec(username)
  return usernameMatch ? usernameMatch[1] : null
}

function normalizeTargetSummary(target) {
  const record = readRecord(target)
  return {
    envFileRef: text(record.envFileRef) || null,
    envFileReadable: record.envFileReadable === true || record.readable === true,
    envFileSha256: text(record.envFileSha256) || null,
    connectionCredentialSha256: text(record.connectionCredentialSha256) || null,
    connectionSource: text(record.connectionSource) || null,
    databaseHost: text(record.databaseHost) || null,
    databasePort: text(record.databasePort) || null,
    databaseName: text(record.databaseName) || null,
    databaseUser: text(record.databaseUser) || null,
    supabaseProjectRef: text(record.supabaseProjectRef) || null,
    targetFingerprint: text(record.targetFingerprint) || null,
    hasPassword: record.hasPassword === true,
    sslmode: text(record.sslmode) || null,
    parseError: text(record.parseError) || null,
  }
}

function repairStep({
  id,
  status,
  blockerCodes = [],
  title,
  commands = [],
  verificationCommands = [],
  notes = [],
}) {
  return {
    id,
    status,
    blockerCodes: uniqueStrings(blockerCodes),
    title,
    commands: uniqueStrings(commands),
    verificationCommands: uniqueStrings(verificationCommands),
    notes: uniqueStrings(notes),
  }
}

function classifyDbFailure({ errorCode = '', errorMessage = '' } = {}) {
  const code = text(errorCode)
  const message = text(errorMessage).toLowerCase()
  if (code === '28P01' || message.includes('password authentication failed')) return 'authentication_failed'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || message.includes('getaddrinfo')) return 'dns_or_host_unreachable'
  if (code === 'ETIMEDOUT' || code === 'ETIMEOUT' || message.includes('timeout')) return 'connection_timeout'
  if (message.includes('ssl')) return 'ssl_or_pooler_configuration'
  if (code) return `db_error_${code}`
  return message ? 'db_execution_or_connection_failed' : 'none'
}

function buildCandidateRefreshDbRepairPlan({
  status = '',
  blockers = [],
  target = null,
  errorCode = '',
  errorMessage = '',
} = {}) {
  const targetSummary = normalizeTargetSummary(target)
  const blockerList = uniqueStrings(blockers)
  const hasConnectionFailure = blockerList.includes('candidate_refresh_db_connection_failed')
  const hasExecutionFailure = blockerList.includes('candidate_refresh_db_execution_failed')
  const failureClass = classifyDbFailure({ errorCode, errorMessage })
  const steps = []

  if (hasConnectionFailure || hasExecutionFailure) {
    steps.push(repairStep({
      id: 'confirm_candidate_refresh_target_identity',
      status: targetSummary.envFileReadable && targetSummary.connectionSource && targetSummary.supabaseProjectRef
        ? 'required'
        : 'required_missing_target_metadata',
      blockerCodes: hasConnectionFailure
        ? ['candidate_refresh_db_connection_failed']
        : ['candidate_refresh_db_execution_failed'],
      title: 'Confirm the candidate refresh DB target is the intended staging/local Supabase project before changing credentials or rerunning the writer.',
      commands: [
        'npm.cmd run evidence:default-master-plan:candidate-refresh-db-repair-readiness',
        'npm.cmd run evidence:default-master-plan:candidate-refresh-preflight',
        'npm.cmd run evidence:default-master-plan:candidate-hygiene',
      ],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      notes: [
        `envFileRef=${targetSummary.envFileRef || 'unknown'}`,
        `connectionSource=${targetSummary.connectionSource || 'unknown'}`,
        `supabaseProjectRef=${targetSummary.supabaseProjectRef || 'unknown'}`,
        `databaseHost=${targetSummary.databaseHost || 'unknown'}`,
        'Do not switch env files unless discovery proves the same baseline/project exists in the replacement database.',
      ],
    }))
  }

  if (hasConnectionFailure) {
    steps.push(repairStep({
      id: 'repair_or_rotate_candidate_refresh_db_credentials',
      status: 'required',
      blockerCodes: ['candidate_refresh_db_connection_failed'],
      title: 'Repair or rotate the candidate refresh database credential outside repository files, preserving the selected baseline/project target.',
      commands: [
        'update SUPABASE_MIGRATION_URL or approved DB connection credential outside generated reports',
        'npm.cmd run evidence:default-master-plan:candidate-refresh-execution',
      ],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      notes: [
        `failureClass=${failureClass}`,
        'Do not write raw passwords, tokens, or connection strings into project-testing reports.',
        'If a pooler/direct-host switch is required, rerun candidate discovery against the replacement target before executing refresh.',
      ],
    }))
  }

  if (hasExecutionFailure && !hasConnectionFailure) {
    steps.push(repairStep({
      id: 'inspect_candidate_refresh_transaction_failure',
      status: 'required',
      blockerCodes: ['candidate_refresh_db_execution_failed'],
      title: 'Inspect the failed transaction condition before rerunning the candidate baseline item refresh writer.',
      commands: [
        'npm.cmd run evidence:default-master-plan:candidate-refresh-preflight',
        'npm.cmd run evidence:default-master-plan:candidate-refresh-execution',
      ],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      notes: [
        `failureClass=${failureClass}`,
        'Keep the same approval boundary unless the refresh package or target baseline changes.',
      ],
    }))
  }

  if (hasConnectionFailure || hasExecutionFailure) {
    steps.push(repairStep({
      id: 'rerun_candidate_refresh_execution',
      status: 'blocked_by_previous_steps',
      blockerCodes: blockerList.filter((blocker) => blocker.startsWith('candidate_refresh_db_')),
      title: 'Rerun the guarded candidate refresh execution after target identity and DB access are repaired.',
      commands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      verificationCommands: [
        'npm.cmd run evidence:default-master-plan:operator-handoff',
        'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
        'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
      ],
      notes: ['The writer remains limited to candidate task_baseline_items and must not write tasks, dependencies, runtime publication, or duration samples.'],
    }))
  }

  const requiredStepIds = steps
    .filter((step) => ['required', 'required_missing_target_metadata', 'manual_review_required'].includes(step.status))
    .map((step) => step.id)
  const blockedStepIds = steps
    .filter((step) => step.status === 'blocked_by_previous_steps')
    .map((step) => step.id)

  return {
    status: steps.length === 0
      ? status === 'candidate_refresh_execution_completed'
        ? 'not_required_execution_completed'
        : 'not_required_before_db_execution'
      : 'blocked',
    failureClass,
    target: targetSummary,
    noAutoCredentialRotation: true,
    requiredStepIds,
    blockedStepIds,
    orderedStepCount: steps.length,
    orderedSteps: steps,
    mutationBoundary: {
      readsEnvTargetFingerprint: true,
      writesProductionTables: false,
      writesTaskBaselineItems: false,
      writesCandidateBaselines: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  }
}

function buildCandidateRefreshExecutionGatePlan({
  status = '',
  blockers = [],
  gate = {},
} = {}) {
  const blockerList = uniqueStrings(blockers)
  const steps = []
  const hasAny = (...codes) => codes.some((code) => blockerList.includes(code))

  if (hasAny(
    'candidate_refresh_preflight_not_ready',
    'candidate_refresh_preflight_refresh_package_hash_required',
    'candidate_refresh_preflight_refresh_package_hash_mismatch',
    'candidate_refresh_preflight_has_unresolved_hard_blockers',
    'candidate_refresh_preflight_baseline_mismatch',
    'candidate_refresh_preflight_project_mismatch',
    'candidate_refresh_preflight_business_type_mismatch',
    'candidate_refresh_preflight_target_row_count_mismatch',
  )) {
    steps.push(repairStep({
      id: 'refresh_candidate_execution_preflight',
      status: 'required',
      blockerCodes: blockerList.filter((blocker) => blocker.startsWith('candidate_refresh_preflight_')),
      title: 'Refresh the candidate execution preflight so the execution plan, package hash, baseline, project, business type, and target row count are current.',
      commands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-preflight'],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      notes: ['Do not execute candidate refresh while preflight identity or package hash is stale.'],
    }))
  }

  if (blockerList.some((blocker) => blocker.startsWith('candidate_refresh_authorization_'))) {
    steps.push(repairStep({
      id: 'build_candidate_refresh_authorization_package',
      status: 'required',
      blockerCodes: blockerList.filter((blocker) => blocker.startsWith('candidate_refresh_authorization_')),
      title: 'Rebuild the candidate refresh authorization package so the approval reference, human actor, preflight ref, refresh package path, and no-write package boundary match the execution command.',
      commands: ['node project-testing/tools/build-default-master-plan-candidate-refresh-authorization-package.mjs'],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      notes: [
        'The authorization package is no-write evidence; it does not replace --mode execute, --allow-refresh, unlock, approval, or actor controls.',
      ],
    }))
  }

  if (hasAny('candidate_refresh_execution_unlock_required')) {
    steps.push(repairStep({
      id: 'set_candidate_refresh_execution_unlock',
      status: 'required',
      blockerCodes: ['candidate_refresh_execution_unlock_required'],
      title: `Set ${REQUIRED_UNLOCK}=1 only for the approved candidate refresh execution window.`,
      commands: [`set ${REQUIRED_UNLOCK}=1 outside repository files`],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      notes: ['This unlock must not be committed to the repository or generated reports.'],
    }))
  }

  if (hasAny('candidate_refresh_execution_allow_refresh_required', 'candidate_refresh_execute_mode_required')) {
    steps.push(repairStep({
      id: 'run_candidate_refresh_in_execute_mode_with_allow_flag',
      status: 'required',
      blockerCodes: blockerList.filter((blocker) => [
        'candidate_refresh_execution_allow_refresh_required',
        'candidate_refresh_execute_mode_required',
      ].includes(blocker)),
      title: 'Rerun candidate refresh with execute mode and the explicit allow-refresh flag after preflight and approval are ready.',
      commands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution -- --mode execute --allow-refresh'],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      notes: [
        `currentMode=${text(gate.mode) || 'unknown'}`,
        'Execute mode remains limited to candidate task_baseline_items replacement rows.',
      ],
    }))
  }

  if (hasAny(
    'candidate_refresh_operator_approval_required',
    'candidate_refresh_refreshed_by_required',
    'human_candidate_refresh_actor_required',
    'candidate_refresh_operator_approval_mismatch',
    'candidate_refresh_refreshed_by_mismatch',
  )) {
    steps.push(repairStep({
      id: 'record_candidate_refresh_operator_approval_and_actor',
      status: 'required',
      blockerCodes: blockerList.filter((blocker) => [
        'candidate_refresh_operator_approval_required',
        'candidate_refresh_refreshed_by_required',
        'human_candidate_refresh_actor_required',
        'candidate_refresh_operator_approval_mismatch',
        'candidate_refresh_refreshed_by_mismatch',
      ].includes(blocker)),
      title: 'Bind the execution to a real operator approval reference and human refreshed-by actor before rerunning the writer.',
      commands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution -- --operator-approval-ref <approval-ref> --refreshed-by <human-user-id>'],
      verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      notes: ['The approval reference and actor id must match the preflight execution plan when that plan provides them.'],
    }))
  }

  if (steps.length > 0) {
    steps.push(repairStep({
      id: 'rerun_candidate_refresh_execution_after_gate',
      status: 'blocked_by_previous_steps',
      blockerCodes: blockerList.filter((blocker) => blocker.startsWith('candidate_refresh_')),
      title: 'Rerun the guarded candidate refresh execution after preflight, unlock, allow flag, execute mode, approval, and operator identity are all satisfied.',
      commands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      verificationCommands: [
        'npm.cmd run evidence:default-master-plan:operator-handoff',
        'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
        'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
      ],
      notes: ['Do not treat this as runtime publication or production-ready evidence.'],
    }))
  }

  const requiredStepIds = steps
    .filter((step) => step.status === 'required')
    .map((step) => step.id)
  const blockedStepIds = steps
    .filter((step) => step.status === 'blocked_by_previous_steps')
    .map((step) => step.id)

  return {
    status: steps.length === 0
      ? status === 'candidate_refresh_execution_completed'
        ? 'not_required_execution_completed'
        : 'not_required_gate_satisfied'
      : 'blocked',
    noAutoExecution: true,
    requiredStepIds,
    blockedStepIds,
    orderedStepCount: steps.length,
    orderedSteps: steps,
    mutationBoundary: {
      requiresExplicitUnlock: true,
      requiresOperatorApproval: true,
      writesProductionTables: false,
      writesCandidateTaskBaselineItemsOnlyAfterUnlock: true,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  }
}

async function executeCandidateRefreshTransaction({
  client,
  baselineId,
  projectId,
  items,
}) {
  const queryLog = []
  let deletedRowCount = 0
  try {
    await loggedQuery(client, queryLog, 'BEGIN')
    const baselineResult = await loggedQuery(
      client,
      queryLog,
      'SELECT id, project_id, source_version_label, status FROM public.task_baselines WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE',
      [baselineId, projectId],
    )
    const baseline = readRecord(baselineResult?.rows?.[0])
    if (!baseline.id) {
      throw Object.assign(new Error('candidate baseline version not found for refresh target'), {
        code: 'candidate_baseline_version_not_found',
      })
    }
    const sourceLabel = text(baseline.source_version_label)
    if (!CANDIDATE_SOURCE_LABELS.has(sourceLabel)) {
      throw Object.assign(new Error(`baseline source_version_label is not a candidate default master-plan label: ${sourceLabel || '<empty>'}`), {
        code: 'candidate_baseline_source_label_required',
      })
    }

    const deleteResult = await loggedQuery(
      client,
      queryLog,
      'DELETE FROM public.task_baseline_items WHERE baseline_version_id = $1::uuid AND project_id = $2::uuid',
      [baselineId, projectId],
    )
    deletedRowCount = Number(deleteResult?.rowCount ?? 0)
    await insertBaselineItems(client, queryLog, items)
    await loggedQuery(client, queryLog, 'COMMIT')
    return {
      status: 'completed',
      deletedRowCount,
      insertedRowCount: items.length,
      transactionRolledBack: false,
      queryLog,
    }
  } catch (error) {
    try {
      await loggedQuery(client, queryLog, 'ROLLBACK')
    } catch {
      // Preserve the original failure; rollback failure is not a reason to hide it.
    }
    throw Object.assign(error, {
      deletedRowCount,
      queryLog,
    })
  }
}

async function insertBaselineItems(client, queryLog, rows) {
  if (rows.length === 0) return 0
  const values = []
  const groups = rows.map((row) => {
    const placeholders = BASELINE_ITEM_COLUMNS.map((column) => {
      values.push(normalizeParameterValue(column, row[column]))
      return `$${values.length}`
    })
    return `(${placeholders.join(', ')})`
  })
  const sql = [
    `INSERT INTO public.task_baseline_items (${BASELINE_ITEM_COLUMNS.join(', ')})`,
    `VALUES ${groups.join(', ')}`,
  ].join(' ')
  await loggedQuery(client, queryLog, sql, values)
  return rows.length
}

function normalizeParameterValue(column, value) {
  const normalized = value === undefined ? null : value
  if (normalized === null) return null
  if (!BASELINE_ITEM_JSON_COLUMNS.has(column)) return normalized
  return typeof normalized === 'string' ? normalized : JSON.stringify(normalized)
}

async function loggedQuery(client, queryLog, sql, params = []) {
  queryLog.push(normalizeSqlForLog(sql))
  return client.query(sql, params)
}

function normalizeSqlForLog(sql) {
  const normalized = String(sql ?? '').replace(/\s+/g, ' ').trim()
  return normalized.startsWith('INSERT INTO public.task_baseline_items')
    ? 'INSERT INTO public.task_baseline_items'
    : normalized
}

async function readJsonWithHash(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return {
    path: filePath,
    sha256: createHash('sha256').update(raw).digest('hex'),
    json: JSON.parse(raw),
  }
}

async function readJsonWithHashIfPresent(filePath) {
  try {
    return await readJsonWithHash(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function writeReport(outputPath, report) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await fs.writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Candidate Refresh Execution',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Production ready: ${report.productionReady ? 'yes' : 'no'}`,
    `Baseline: ${report.baselineId || '-'}`,
    `Project: ${report.projectId || '-'}`,
    `Business type: ${report.businessType || '-'}`,
    '',
    '## Target',
    '',
    `- envFile: ${report.target.envFileRef || '-'}`,
    `- envFileReadable: ${report.target.envFileReadable}`,
    `- connectionSource: ${report.target.connectionSource || '-'}`,
    `- supabaseProjectRef: ${report.target.supabaseProjectRef || '-'}`,
    `- databaseHost: ${report.target.databaseHost || '-'}`,
    `- databaseUser: ${report.target.databaseUser || '-'}`,
    `- hasPassword: ${report.target.hasPassword}`,
    '',
    '## Execution Control',
    '',
    `- mode: ${report.executionControl.mode}`,
    `- environment: ${report.executionControl.environment}`,
    `- allowRefresh: ${report.executionControl.allowRefresh}`,
    `- unlockPresent: ${report.executionControl.unlockPresent}`,
    `- authorizationPackageChecked: ${report.executionControl.authorizationPackageChecked}`,
    `- authorizationPackageVerified: ${report.executionControl.authorizationPackageVerified}`,
    `- executionAllowed: ${report.executionControl.executionAllowed}`,
    '',
    '## Refresh Plan',
    '',
    `- target replacement rows: ${report.refreshPlan.targetReplacementRowCount}`,
    `- deleted rows: ${report.deletedRowCount}`,
    `- inserted rows: ${report.insertedRowCount}`,
    '',
    '## Blockers',
    '',
  ]
  if (report.blockers.length === 0) lines.push('- none')
  else report.blockers.forEach((blocker) => lines.push(`- ${blocker}`))
  lines.push(
    '',
    '## DB Repair Plan',
    '',
    `- status: ${report.dbRepairPlan.status}`,
    `- failureClass: ${report.dbRepairPlan.failureClass}`,
    `- noAutoCredentialRotation: ${report.dbRepairPlan.noAutoCredentialRotation}`,
    `- requiredStepIds: ${report.dbRepairPlan.requiredStepIds.length > 0 ? report.dbRepairPlan.requiredStepIds.join(', ') : 'none'}`,
    `- blockedStepIds: ${report.dbRepairPlan.blockedStepIds.length > 0 ? report.dbRepairPlan.blockedStepIds.join(', ') : 'none'}`,
  )
  if (report.dbRepairPlan.orderedSteps.length > 0) {
    lines.push('', '| stepId | status | blockerCodes | commandCount | verificationCount |', '|---|---|---|---|---|')
    for (const step of report.dbRepairPlan.orderedSteps) {
      lines.push([
        step.id,
        step.status,
        readArray(step.blockerCodes).join(', '),
        String(readArray(step.commands).length),
        String(readArray(step.verificationCommands).length),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
      for (const command of readArray(step.commands)) {
        lines.push(`- db_repair_step_command: ${step.id} | ${command}`)
      }
      for (const command of readArray(step.verificationCommands)) {
        lines.push(`- db_repair_step_verification: ${step.id} | ${command}`)
      }
    }
  }
  lines.push(
    '',
    '## Execution Gate Plan',
    '',
    `- status: ${report.executionGatePlan.status}`,
    `- noAutoExecution: ${report.executionGatePlan.noAutoExecution}`,
    `- requiredStepIds: ${report.executionGatePlan.requiredStepIds.length > 0 ? report.executionGatePlan.requiredStepIds.join(', ') : 'none'}`,
    `- blockedStepIds: ${report.executionGatePlan.blockedStepIds.length > 0 ? report.executionGatePlan.blockedStepIds.join(', ') : 'none'}`,
  )
  if (report.executionGatePlan.orderedSteps.length > 0) {
    lines.push('', '| stepId | status | blockerCodes | commandCount | verificationCount |', '|---|---|---|---|---|')
    for (const step of report.executionGatePlan.orderedSteps) {
      lines.push([
        step.id,
        step.status,
        readArray(step.blockerCodes).join(', '),
        String(readArray(step.commands).length),
        String(readArray(step.verificationCommands).length),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }
  lines.push(
    '',
    '## Mutation Boundary',
    '',
    `- writesTaskBaselineItems: ${report.mutationBoundary.writesTaskBaselineItems}`,
    `- writesCandidateBaselines: ${report.mutationBoundary.writesCandidateBaselines}`,
    `- writesTasks: ${report.mutationBoundary.writesTasks}`,
    `- writesTaskDependencies: ${report.mutationBoundary.writesTaskDependencies}`,
    `- writesDurationSamples: ${report.mutationBoundary.writesDurationSamples}`,
    `- writesRuntimePublication: ${report.mutationBoundary.writesRuntimePublication}`,
    '',
  )
  return `${lines.join('\n')}\n`
}

function nextActionsForStatus(status, blockers, target = null) {
  const targetSummary = normalizeTargetSummary(target)
  if (status === 'candidate_refresh_execution_completed') {
    return [
      'Re-export candidate baseline items and rerun candidate export hygiene.',
      'Continue runtime seed, dependency writer, publication, and post-publish smoke/rollback gates.',
    ]
  }
  if (status === 'candidate_refresh_execution_failed') {
    if (readArray(blockers).includes('candidate_refresh_db_connection_failed')) {
      const envRef = targetSummary.envFileRef || '<env-file>'
      const source = targetSummary.connectionSource || 'SUPABASE_MIGRATION_URL/DB_CONNECTION_STRING/DATABASE_URL'
      return [
        `Fix or rotate the database credentials in ${envRef} for ${source}, then rerun candidate refresh execution with the same approval boundary.`,
        'Do not switch env files unless discovery proves the same baseline/project exists in the replacement database.',
      ]
    }
    return [
      'Inspect candidate refresh execution error and DB transaction logs.',
      'Fix the failed refresh writer condition, then rerun with the same approval boundary.',
    ]
  }
  if (status === 'candidate_refresh_execution_dry_run') {
    return [
      'Review the dry-run replacement plan.',
      'Run again with --mode execute only after approval and staging/local target confirmation.',
    ]
  }
  return readArray(blockers).length > 0
    ? [`Resolve blockers: ${blockers.join(', ')}`]
    : []
}

function classifyExecutionFailureBlockers(executionResult) {
  const errorCode = text(executionResult?.errorCode)
  return uniqueStrings([
    errorCode === 'candidate_baseline_version_not_found' ? 'candidate_refresh_target_baseline_not_found' : null,
    errorCode === 'candidate_baseline_source_label_required' ? 'candidate_refresh_target_baseline_source_label_required' : null,
    executionResult?.connectionFailed === true ? 'candidate_refresh_db_connection_failed' : null,
    'candidate_refresh_db_execution_failed',
  ])
}

function artifactRef(kind, loaded) {
  if (!loaded?.path) return null
  return `${kind}:${repoRelative(loaded.path)}#sha256=${loaded.sha256}`
}

function parseArtifactRef(value) {
  const raw = text(value)
  if (!raw) return { raw: '', kind: '', path: '', sha256: '' }
  const refMatch = /^([a-z][a-z0-9_]*):(.+?)(?:#sha256=[a-f0-9]{64})?$/i.exec(raw)
  const hashMatch = raw.match(/(?:^|#)sha256=([a-f0-9]{64})(?:$|[&#])/i)
  return {
    raw,
    kind: refMatch ? refMatch[1] : '',
    path: refMatch ? refMatch[2] : raw,
    sha256: hashMatch ? hashMatch[1].toLowerCase() : '',
  }
}

function artifactPathMatches(expectedPath, refOrPath, expectedKind = '') {
  const parsed = parseArtifactRef(refOrPath)
  if (!parsed.path) return false
  if (expectedKind && parsed.kind && parsed.kind !== expectedKind) return false
  const actualPath = path.isAbsolute(parsed.path)
    ? path.resolve(parsed.path)
    : path.resolve(REPO_ROOT, parsed.path)
  return actualPath === path.resolve(expectedPath)
}

function isPlaceholder(value) {
  return /^<[^>]+>$/.test(text(value))
}

function isSafeReplacementRow(row) {
  const record = readRecord(row)
  return record.candidateOnly === true
    && record.writesTasks === false
    && record.writesTaskDependencies === false
    && record.writesProductionDependencies === false
    && record.writesRuntimePublication === false
}

function isHumanActor(value) {
  const actor = text(value)
  if (!actor) return false
  return !AUTOMATION_ACTOR_PATTERNS.some((pattern) => pattern.test(actor))
}

function baselineMatches(refreshPackage, preflight) {
  const left = firstText(refreshPackage?.baselineId, refreshPackage?.baseline_id)
  const right = firstText(preflight?.baselineId, preflight?.baseline_id)
  return !left || !right || left === right
}

function projectMatches(refreshPackage, preflight) {
  const left = firstText(refreshPackage?.projectId, refreshPackage?.project_id)
  const right = firstText(preflight?.projectId, preflight?.project_id)
  return !left || !right || left === right
}

function businessTypeMatches(refreshPackage, preflight) {
  const left = firstText(refreshPackage?.businessType, refreshPackage?.business_type)
  const right = firstText(preflight?.businessType, preflight?.business_type)
  return !left || !right || left === right
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstText(...values) {
  return text(values.find((value) => text(value)) ?? '')
}

function text(value) {
  return String(value ?? '').trim()
}

function readNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readPositiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function dateOnly(value) {
  const raw = text(value)
  const match = /^\d{4}-\d{2}-\d{2}/.exec(raw)
  return match?.[0] ?? null
}

function uniqueStrings(values) {
  return [...new Set(readArray(values).map(text).filter(Boolean))]
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/run-default-master-plan-candidate-refresh-execution.mjs',
    '  [--refresh-package <candidate-refresh-package.json>]',
    '  [--preflight <candidate-refresh-execution-preflight.json>]',
    '  [--authorization-package <candidate-refresh-authorization-package.json>]',
    '  [--readiness-seal <candidate-refresh-execution-readiness-seal.json>]',
    '  [--output <candidate-refresh-execution.json>]',
    '  [--env-file <deploy/env/staging.env>]',
    '  [--environment local|staging]',
    '  [--operator-approval-ref <ref>]',
    '  [--refreshed-by <human-user-id>]',
    '  [--mode dry-run|execute]',
    '  [--allow-refresh]',
    '  [--fail-on-blocked]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const args = parseArgs()
    if (args.help) {
      printHelp()
      process.exit(0)
    }
    const report = await runDefaultMasterPlanCandidateRefreshExecution(args)
    const summary = {
      status: report.status,
      productionReady: report.productionReady,
      baselineId: report.baselineId,
      projectId: report.projectId,
      businessType: report.businessType,
      executionAllowed: report.executionControl.executionAllowed,
      deletedRowCount: report.deletedRowCount,
      insertedRowCount: report.insertedRowCount,
      blockers: report.blockers,
    }
    console.log(JSON.stringify(summary, null, 2))
    if (args.failOnBlocked && report.status === 'candidate_refresh_execution_failed') process.exit(1)
    if (args.failOnBlocked && report.status === 'candidate_refresh_execution_blocked') process.exit(2)
  } catch (error) {
    console.error(error?.stack || error?.message || String(error))
    process.exit(1)
  }
}
