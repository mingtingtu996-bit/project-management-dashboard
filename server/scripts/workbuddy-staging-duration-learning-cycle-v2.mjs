#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const SCHEMA = 'workbuddy-staging-duration-learning-cycle-v2/v2'
const REAL_PROPOSAL_AUDIT_SCHEMA = 'workbuddy-duration-learning-real-proposal-audit/v1'
const REAL_COVERAGE_PROOF_SCHEMA = 'workbuddy-duration-learning-real-aggregation-proof/v1'
const ASSET_KEYS = [
  'base_duration_benchmark',
  'standard_work_duration_seed',
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
]
const QUALITY_MODEL_BY_ASSET = {
  base_duration_benchmark: 'numeric_holdout',
  standard_work_duration_seed: 'numeric_holdout',
  special_work_duration_seed: 'numeric_replay',
  wbs_reference_days: 'numeric_holdout',
  dependency_rule_candidate: 'structural_replay',
  critical_path_rule_candidate: 'structural_replay',
}
const STRUCTURAL_ASSET_KEYS = new Set([
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
])
const SCOPE_LEVELS = ['project', 'company', 'industry', 'global']
const SELF_TEST_INDUSTRY_KEYS = ['general_civil', 'industrial', 'hospital']
const REQUIRE_REAL_AGGREGATION_FLOOR = true
const FORBIDDEN_REAL_AGGREGATION_FLOOR_OVERRIDES = [
  'require-real-aggregation-floor',
  'require_real_aggregation_floor',
  'skip-real-aggregation-floor',
  'skip_real_aggregation_floor',
]
const FORBIDDEN_REAL_AGGREGATION_FLOOR_ENV = [
  'REQUIRE_REAL_AGGREGATION_FLOOR',
  'WORKBUDDY_LEARNING_V2_REQUIRE_REAL_AGGREGATION_FLOOR',
  'WORKBUDDY_LEARNING_V2_SKIP_REAL_AGGREGATION_FLOOR',
]
const PUBLICATION_COUNT = ASSET_KEYS.length * SCOPE_LEVELS.length
const OBSERVATIONS_PER_PUBLICATION = 5
const ALLOWED_MUTATION_TABLES = new Set([
  'duration_learning_runtime_publications',
  'runtime_consumer_observations',
  'runtime_consumer_runtime_calls',
  'duration_algorithm_accuracy_events',
  'duration_plan_network_outcomes',
])
const MIGRATION_HASHES = {
  '314_duration_day_basis_contract.sql': '9311df5c818ca087397aff526331d6461b3d083a83aa764ea43dbf690dfb3e3f',
  '315_duration_learning_runtime_publications.sql': 'b94cf44f1da17925def0fc2e15791bb8f94e62b73100be070a19c1c40a0e7c43',
  '321_retire_duplicate_t2_schedule_runtime.sql': '82450a8de36f219972bad62f5beff89952daf956f9b0e0f058ef16871428a7d1',
}
const APPROVAL_PHRASE = 'I_ACKNOWLEDGE_DISPOSABLE_STAGING_LEARNING_MUTATIONS'
const ADVISOR_MAX_AGE_MS = 24 * 60 * 60 * 1000
const ADVISOR_FUTURE_TOLERANCE_MS = 15 * 60 * 1000

function parseArgs(argv) {
  const args = new Map()
  const positionals = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) args.set(key, 'true')
    else {
      args.set(key, next)
      index += 1
    }
  }
  return { args, positionals }
}

const { args, positionals } = parseArgs(process.argv.slice(2))
const mode = positionals[0] ?? 'run'
const here = path.dirname(fileURLToPath(import.meta.url))
const releaseRoot = path.resolve(args.get('release-root') ?? process.env.RELEASE_ROOT ?? process.cwd())
const expectedReleaseSha = String(args.get('expected-release-sha') ?? process.env.EXPECTED_RELEASE_SHA ?? '').trim()
const operationPrefix = String(
  args.get('operation-prefix')
    ?? process.env.LEARNING_V2_OPERATION_PREFIX
    ?? `wb-learning-v2-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
).trim()
const reportPath = path.resolve(args.get('report') ?? process.env.REPORT_PATH ?? path.join(here, `${operationPrefix}.report.json`))
const statePath = path.resolve(args.get('state') ?? process.env.STATE_PATH ?? path.join(here, `${operationPrefix}.state.json`))
const readyzJsonPath = args.get('readyz-json')
  ? path.resolve(args.get('readyz-json'))
  : process.env.DEPLOYED_READYZ_JSON
    ? path.resolve(process.env.DEPLOYED_READYZ_JSON)
    : null

function assertMandatoryRealAggregationFloor(
  required = REQUIRE_REAL_AGGREGATION_FLOOR,
  { inspectRuntimeOverrides = true } = {},
) {
  const overridePresent = inspectRuntimeOverrides && (
    FORBIDDEN_REAL_AGGREGATION_FLOOR_OVERRIDES.some((key) => args.has(key))
    || FORBIDDEN_REAL_AGGREGATION_FLOOR_ENV.some((key) => Object.hasOwn(process.env, key))
  )
  if (required !== true || overridePresent) {
    throw Object.assign(
      new Error('real_aggregation_floor_is_mandatory_and_not_configurable'),
      { code: 'REAL_AGGREGATION_FLOOR_NOT_CONFIGURABLE' },
    )
  }
  return true
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label}_required`)
  return normalized
}

function databaseConnectionIdentity(value, label) {
  let parsed
  try {
    parsed = new URL(requireText(value, label))
  } catch {
    throw new Error(`${label}_must_be_a_valid_database_url`)
  }
  const hostname = parsed.hostname.toLowerCase()
  const username = decodeURIComponent(parsed.username).trim().toLowerCase()
  if (!username) throw new Error(`${label}_database_role_required`)
  const directMatch = hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/)
  if (directMatch) return { projectRef: directMatch[1], roleName: username }
  if (hostname.endsWith('.pooler.supabase.com') || hostname.endsWith('.pooler.supabase.co')) {
    const separator = username.lastIndexOf('.')
    const projectRef = separator >= 0 ? username.slice(separator + 1) : ''
    const roleName = separator >= 0 ? username.slice(0, separator) : ''
    if (projectRef && roleName && /^[a-z0-9-]+$/.test(projectRef)) {
      return { projectRef, roleName }
    }
  }
  throw new Error(`${label}_must_expose_a_supabase_project_identity`)
}

function supabaseApiProjectRef(value) {
  let parsed
  try {
    parsed = new URL(requireText(value, 'SUPABASE_URL'))
  } catch {
    throw new Error('SUPABASE_URL_must_be_a_valid_url')
  }
  const match = parsed.hostname.toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/)
  if (!match) throw new Error('SUPABASE_URL_must_expose_a_supabase_project_identity')
  return match[1]
}

function assertMatchingDatabaseConnectionIdentities(runtimeUrl, adminUrl) {
  const runtimeConnectionIdentity = databaseConnectionIdentity(runtimeUrl, 'RUNTIME_DATABASE_URL')
  const adminConnectionIdentity = databaseConnectionIdentity(adminUrl, 'MIGRATION_DATABASE_URL')
  assert.equal(
    runtimeConnectionIdentity.projectRef,
    adminConnectionIdentity.projectRef,
    'runtime and migration database project refs differ',
  )
  assert.notEqual(
    runtimeConnectionIdentity.roleName,
    adminConnectionIdentity.roleName,
    'runtime and migration database roles must be separate',
  )
  assert.ok(
    !['postgres', 'service_role', 'supabase_admin'].includes(runtimeConnectionIdentity.roleName),
    'runtime database URL uses an administrative role',
  )
  return { runtimeConnectionIdentity, adminConnectionIdentity }
}

function verifyAdvisorExportEvidence(rawValue, expectedProjectRef, nowMs = Date.now()) {
  let advisor
  try {
    advisor = JSON.parse(requireText(rawValue, 'SUPABASE_ADVISOR_EXPORT_JSON'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('advisor_export_invalid_json')
    throw error
  }
  assert.ok(advisor && typeof advisor === 'object' && !Array.isArray(advisor), 'advisor_export_object_required')
  assert.equal(advisor.schemaVersion, 'workbuddy-supabase-advisor-ui-or-api-export/v1', 'advisor_export_schema_invalid')
  assert.ok(['dashboard_ui', 'management_api'].includes(advisor.source), 'advisor_export_source_invalid')
  assert.equal(advisor.environment, 'staging', 'advisor_export_environment_mismatch')
  assert.equal(String(advisor.projectRef ?? '').trim().toLowerCase(), expectedProjectRef, 'advisor_export_project_ref_mismatch')
  assert.equal(advisor.securityIssueCount, 0, 'advisor_export_security_issues_present')
  const exportedAtMs = Date.parse(String(advisor.exportedAt ?? ''))
  assert.ok(Number.isFinite(exportedAtMs), 'advisor_export_timestamp_invalid')
  assert.ok(exportedAtMs <= nowMs + ADVISOR_FUTURE_TOLERANCE_MS, 'advisor_export_timestamp_in_future')
  assert.ok(nowMs - exportedAtMs <= ADVISOR_MAX_AGE_MS, 'advisor_export_stale')
  return {
    schemaVersion: advisor.schemaVersion,
    source: advisor.source,
    exportedAt: new Date(exportedAtMs).toISOString(),
    projectRef: expectedProjectRef,
    environment: 'staging',
    securityIssueCount: 0,
  }
}

function validateOperationPrefix(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9:-]{11,179}$/.test(value)) {
    throw new Error('operation_prefix_must_be_12_to_180_safe_characters')
  }
  return value
}

function redact(value) {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(password|token|secret|key)=([^\s&]+)/gi, '$1=[REDACTED]')
}

function errorRecord(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: redact(error instanceof Error ? error.message : String(error)),
    code: redact(error && typeof error === 'object' && 'code' in error ? error.code : ''),
  }
}

function writeJsonAtomic(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryPath, targetPath)
}

function initialLifecycleState() {
  return {
    schema: SCHEMA,
    operationPrefix,
    reportPath,
    expectedReleaseSha,
    realCoverageVerified: false,
    realCandidateAggregationCoverageProof: null,
    mutationStarted: false,
    mutationStatementCount: 0,
  }
}

function readLifecycleState(targetPath, { allowMissing = false } = {}) {
  if (!fs.existsSync(targetPath)) {
    if (!allowMissing) throw new Error('duration_learning_v2_state_file_required')
    return { ...initialLifecycleState(), stateFilePresent: false }
  }
  const state = JSON.parse(fs.readFileSync(targetPath, 'utf8'))
  assert.equal(state.schema, SCHEMA, 'duration learning v2 state schema mismatch')
  assert.equal(state.operationPrefix, operationPrefix, 'duration learning v2 state operation prefix mismatch')
  return {
    ...state,
    realCoverageVerified: state.realCoverageVerified === true,
    mutationStarted: state.mutationStarted === true,
    mutationStatementCount: Number(state.mutationStatementCount ?? 0),
    stateFilePresent: true,
  }
}

function cleanupPolicyForState(state) {
  const coverageProofValid = hasCompleteRealCandidateAggregationCoverageProof(state)
  const allowMutation = state.realCoverageVerified === true
    && state.mutationStarted === true
    && coverageProofValid
  return {
    allowMutation,
    coverageProofValid,
    mode: allowMutation ? 'prefix_scoped_delete' : 'read_only_no_mutation',
  }
}

function sha256File(targetPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex')
}

function gitHead(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]),
  )
}

function hashCanonicalValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalValue(value))).digest('hex')
}

function createRealCandidateAggregationCoverageProof(coverage) {
  assertCompleteRealCandidateAggregationCoverage(coverage)
  const proposalIdentityHashes = uniqueSorted(
    (coverage.proposalAuditRecords ?? []).map((record) => record.proposalIdentityHash),
  )
  assert.ok(
    proposalIdentityHashes.length >= PUBLICATION_COUNT,
    'complete real candidate aggregation coverage must include proposal audit identities',
  )
  const proofBody = {
    schema: REAL_COVERAGE_PROOF_SCHEMA,
    operationPrefix,
    releaseSha: expectedReleaseSha,
    status: 'complete',
    requiredCellCount: PUBLICATION_COUNT,
    missingCoverageCells: [],
    policyViolationCount: 0,
    proposalAuditCount: proposalIdentityHashes.length,
    proposalIdentityHashes,
    collectorOutputHash: requireText(coverage.collectorOutputHash, 'real_candidate_collector_output_hash'),
  }
  return { ...proofBody, realCoverageProofHash: hashCanonicalValue(proofBody) }
}

function hasCompleteRealCandidateAggregationCoverageProof(state) {
  const proof = state?.realCandidateAggregationCoverageProof
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return false
  const { realCoverageProofHash, ...proofBody } = proof
  return proof.schema === REAL_COVERAGE_PROOF_SCHEMA
    && proof.operationPrefix === operationPrefix
    && (!expectedReleaseSha || proof.releaseSha === expectedReleaseSha)
    && proof.status === 'complete'
    && Number(proof.requiredCellCount) === PUBLICATION_COUNT
    && Array.isArray(proof.missingCoverageCells)
    && proof.missingCoverageCells.length === 0
    && Number(proof.policyViolationCount) === 0
    && Number(proof.proposalAuditCount) >= PUBLICATION_COUNT
    && Array.isArray(proof.proposalIdentityHashes)
    && proof.proposalIdentityHashes.length === Number(proof.proposalAuditCount)
    && typeof proof.collectorOutputHash === 'string'
    && /^[0-9a-f]{64}$/.test(proof.collectorOutputHash)
    && typeof realCoverageProofHash === 'string'
    && realCoverageProofHash === hashCanonicalValue(proofBody)
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort()
}

async function loadReleaseModules() {
  const servicesRoot = path.join(releaseRoot, 'server', 'dist', 'services')
  const load = async (filename) => import(pathToFileURL(path.join(servicesRoot, filename)).href)
  const [lifecycle, publication, checkpoint, adapter, observation, automation, integration] = await Promise.all([
    load('durationLearningRuntimeLifecycleService.js'),
    load('durationLearningRuntimePublicationService.js'),
    load('durationContextPolicyLearningCheckpointService.js'),
    load('durationRuntimeConsumerObservationAdapterService.js'),
    load('durationRuntimeConsumerObservationService.js'),
    load('durationLearningAssetAutomationPolicyService.js'),
    load('durationRuntimeConsumerObservationIntegrationService.js'),
  ])
  return { lifecycle, publication, checkpoint, adapter, observation, automation, integration }
}

function loadPoolConstructor() {
  const requireFromServer = createRequire(path.join(releaseRoot, 'server', 'package.json'))
  return requireFromServer('pg').Pool
}

function createPool(connectionString, label) {
  const Pool = loadPoolConstructor()
  const pool = new Pool({
    connectionString: requireText(connectionString, label),
    application_name: `workbuddy-learning-v2:${operationPrefix}`.slice(0, 63),
    max: 2,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 30_000,
    query_timeout: 30_000,
  })
  pool.on('error', () => {})
  return pool
}

function isMutationSql(sql) {
  const normalized = String(sql ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  return /\b(insert\s+into|update\s+(?:public\.)?[a-z_][\w.]*|delete\s+from|merge\s+into|truncate|drop\s+table|alter\s+table|create\s+table)\b/.test(normalized)
}

function mutationTargetTable(sql) {
  const normalized = String(sql ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const match = normalized.match(/\b(?:insert\s+into|update|delete\s+from|merge\s+into)\s+(?:public\.)?([a-z_][a-z0-9_]*)\b/)
  return match?.[1] ?? null
}

function createMutationGuard() {
  return {
    realCoverageVerified: false,
    realCandidateAggregationCoverageProof: null,
    mutationStarted: false,
    statementCount: 0,
    armAfterRealCoverage(coverage, proof) {
      assertCompleteRealCandidateAggregationCoverage(coverage)
      assert.equal(this.statementCount, 0, 'real aggregation floor must complete before any mutation')
      assert.equal(
        hasCompleteRealCandidateAggregationCoverageProof({
          realCandidateAggregationCoverageProof: proof,
        }),
        true,
        'real aggregation coverage proof is invalid',
      )
      this.realCoverageVerified = true
      this.realCandidateAggregationCoverageProof = proof
      this.mutationStarted = true
    },
    assertAndCount(sql) {
      if (!isMutationSql(sql)) return
      if (!this.realCoverageVerified || !this.mutationStarted) {
        throw new Error('database_mutation_before_real_candidate_aggregation_coverage')
      }
      const targetTable = mutationTargetTable(sql)
      if (!targetTable || !ALLOWED_MUTATION_TABLES.has(targetTable)) {
        throw new Error(`database_mutation_outside_learning_v2_boundary:${targetTable ?? 'unresolved'}`)
      }
      this.statementCount += 1
    },
  }
}

function queryExec(pool, mutationGuard = null) {
  return async (sql, params = []) => {
    mutationGuard?.assertAndCount(sql)
    return (await pool.query(sql, params)).rows
  }
}

async function guardedClientQuery(client, mutationGuard, sql, params = []) {
  mutationGuard?.assertAndCount(sql)
  return client.query(sql, params)
}

function scopeFor(level, fixture) {
  if (level === 'project') return { level, companyId: fixture.companyId, projectId: fixture.projectId }
  if (level === 'company') return { level, companyId: fixture.companyId }
  if (level === 'industry') return { level, industryKey: fixture.industryKey }
  return { level: 'global' }
}

function runtimePayload(assetKey, artifactKey) {
  if (assetKey === 'base_duration_benchmark') {
    return { p50Days: 10, p80Days: 13, durationDayBasis: 'construction_production_day' }
  }
  if (assetKey === 'standard_work_duration_seed') {
    return { stableCode: artifactKey, p50Days: 8, p80Days: 11, durationDayBasis: 'construction_production_day' }
  }
  if (assetKey === 'special_work_duration_seed') {
    return {
      stableCode: artifactKey,
      durationDayBasis: 'construction_production_day',
      nodes: [{ sourceId: `${artifactKey}:node`, referenceDays: 7, p50Days: 7, p80Days: 9 }],
    }
  }
  if (assetKey === 'wbs_reference_days') {
    return {
      durationDayBasis: 'construction_production_day',
      nodes: [{ sourceId: `${artifactKey}:node`, referenceDays: 6, p50Days: 6, p80Days: 8 }],
    }
  }
  if (assetKey === 'dependency_rule_candidate') {
    return {
      predecessorCode: `${artifactKey}:predecessor`,
      successorCode: `${artifactKey}:successor`,
      dependencyType: 'FS',
      lagDays: 0,
      constructionCalendarBasis: { calendarCode: 'staging-controlled-fixture' },
      durationDayBasis: 'construction_production_day',
    }
  }
  return { criticalStableCodes: [`${artifactKey}:critical`], durationDayBasis: 'construction_production_day' }
}

function controlledEvidenceIds(primaryId, label, count) {
  const values = primaryId ? [primaryId] : []
  for (let index = values.length; index < count; index += 1) {
    values.push(`${operationPrefix}:controlled-floor:${label}:${index + 1}`)
  }
  return values
}

function controlledAutomationDecision(modules, assetKey, scopeLevel, evidence) {
  const qualityModel = QUALITY_MODEL_BY_ASSET[assetKey]
  const decision = modules.automation.evaluateDurationLearningAssetAutomationPolicy({
    experienceTier: STRUCTURAL_ASSET_KEYS.has(assetKey) ? 'T3' : 'T2',
    reuseScope: scopeLevel,
    factSource: qualityModel === 'numeric_replay'
      ? 'replay'
      : qualityModel === 'structural_replay' ? 'hybrid' : 'actual_outcome',
    targetStage: 'canary',
    qualityModel,
    evidence,
  })
  assert.equal(decision.autoPromotionAllowed, true, `controlled canary policy blocked for ${scopeLevel}`)
  return decision
}

function evaluateProposalAutomationPolicy(modules, proposal) {
  const qualityModel = proposal.qualityModel
  return modules.automation.evaluateDurationLearningAssetAutomationPolicy({
    experienceTier: STRUCTURAL_ASSET_KEYS.has(proposal.assetKey) ? 'T3' : 'T2',
    reuseScope: proposal.scope.level,
    factSource: qualityModel === 'numeric_replay'
      ? 'replay'
      : qualityModel === 'structural_replay' ? 'hybrid' : 'actual_outcome',
    targetStage: 'canary',
    qualityModel,
    evidence: {
      ...proposal.automationEvidence,
      validChangeCount: proposal.sampleCount,
      taskIds: proposal.taskIds ?? [],
      projectIds: proposal.projectIds,
      companyIds: proposal.companyIds,
      realOutcomeCount: proposal.realOutcomeCount ?? 0,
      replayCaseCount: proposal.replayCaseCount ?? 0,
      observationWindowDays: proposal.observationWindowDays ?? 0,
      exceptionalConflict: proposal.conflictCount > 0
        || proposal.automationEvidence?.exceptionalConflict === true,
    },
  })
}

function predictedPublicationKey(proposal, hashValue) {
  const digest = hashValue({
    proposalKey: proposal.proposalKey,
    assetKey: proposal.assetKey,
    artifactKey: proposal.artifactKey,
    scope: proposal.scope,
    runtimePayload: canonicalValue(proposal.runtimePayload),
    sourceCandidateRefs: uniqueSorted(proposal.sourceCandidateRefs),
    sourceEvidenceRefs: uniqueSorted(proposal.sourceEvidenceRefs),
  }).slice(0, 32)
  return `duration_learning_runtime:${proposal.assetKey}:${digest}`
}

function buildCandidateBase(modules, assetKey, scopeLevel, fixture, nonce) {
  const artifactKey = `${operationPrefix}:${assetKey}:${scopeLevel}`
  const proposalKey = `${operationPrefix}:proposal:${assetKey}:${scopeLevel}:${nonce}`
  const floor = modules.automation.getDurationLearningAutomationHardFloors()[scopeLevel].stable
  const projectIds = controlledEvidenceIds(
    fixture.projectId,
    `${assetKey}:${scopeLevel}:project`,
    floor.minDistinctProjects,
  )
  const companyIds = controlledEvidenceIds(
    fixture.companyId,
    `${assetKey}:${scopeLevel}:company`,
    floor.minDistinctCompanies,
  )
  const taskIds = controlledEvidenceIds(
    null,
    `${assetKey}:${scopeLevel}:task`,
    floor.minDistinctTasks,
  )
  const qualityModel = QUALITY_MODEL_BY_ASSET[assetKey]
  const automationEvidence = {
    holdoutSampleCount: Math.max(3, Math.ceil(floor.minRealOutcomes * 0.2)),
    maeBefore: 2,
    maeAfter: 1,
    conflictRate: 0,
    overcompensationRate: 0,
    replayPassRate: 1,
    outcomeAcceptanceRate: 1,
    qualityConsistencyRate: 1,
    rollbackReady: true,
    tenantScopeValid: true,
    structuralMutation: false,
    exceptionalConflict: false,
  }
  const policyEvidence = {
    ...automationEvidence,
    validChangeCount: floor.minValidChanges,
    taskIds,
    projectIds,
    companyIds,
    realOutcomeCount: floor.minRealOutcomes,
    replayCaseCount: floor.minReplayCases,
    observationWindowDays: floor.minObservationDays,
  }
  const automationDecision = controlledAutomationDecision(modules, assetKey, scopeLevel, policyEvidence)
  return {
    proposalKey,
    assetKey,
    artifactKey,
    scope: scopeFor(scopeLevel, fixture),
    runtimePayload: runtimePayload(assetKey, artifactKey),
    sourceCandidateRefs: [`${operationPrefix}:candidate:${assetKey}:${scopeLevel}`],
    sourceEvidenceRefs: [`${operationPrefix}:evidence:${assetKey}:${scopeLevel}`],
    sampleCount: floor.minValidChanges,
    projectIds,
    companyIds,
    industryKeys: [fixture.industryKey],
    taskIds,
    realOutcomeCount: floor.minRealOutcomes,
    replayCaseCount: floor.minReplayCases,
    observationWindowDays: floor.minObservationDays,
    conflictCount: 0,
    replayPassed: true,
    qualityModel,
    blockingReasons: [],
    policyEvaluationRequired: true,
    automationEvidence,
    automationDecision,
  }
}

function buildSelectedCandidates(modules, fixture) {
  const candidates = []
  const expectedPublicationKeys = new Map()
  const selectionAttempts = {}
  for (const assetKey of ASSET_KEYS) {
    for (const scopeLevel of SCOPE_LEVELS) {
      const trafficPercent = scopeLevel === 'project' ? 20 : 5
      let selected = null
      for (let nonce = 0; nonce < 500; nonce += 1) {
        const proposal = buildCandidateBase(modules, assetKey, scopeLevel, fixture, nonce)
        const publicationKey = predictedPublicationKey(
          proposal,
          modules.checkpoint.hashDurationContextPolicyLearningValue,
        )
        if (modules.publication.isDurationLearningRuntimeCanarySelected({
          publicationKey,
          projectId: fixture.projectId,
          trafficPercent,
        })) {
          selected = { proposal, publicationKey, attempts: nonce + 1 }
          break
        }
      }
      assert.ok(selected, `could not select deterministic canary bucket for ${assetKey}/${scopeLevel}`)
      candidates.push(selected.proposal)
      expectedPublicationKeys.set(`${assetKey}:${scopeLevel}`, selected.publicationKey)
      selectionAttempts[`${assetKey}:${scopeLevel}`] = selected.attempts
    }
  }
  return { candidates, expectedPublicationKeys, selectionAttempts }
}

function realProposalAuditRecord(modules, proposal, enteredCanaryDryRun) {
  const sourceDecision = proposal.automationDecision ?? null
  const evaluatedDecision = evaluateProposalAutomationPolicy(modules, proposal)
  const identity = {
    proposalKey: proposal.proposalKey,
    assetKey: proposal.assetKey,
    artifactKey: proposal.artifactKey,
    scope: proposal.scope,
    runtimePayload: canonicalValue(proposal.runtimePayload),
    sourceCandidateRefs: uniqueSorted(proposal.sourceCandidateRefs),
    sourceEvidenceRefs: uniqueSorted(proposal.sourceEvidenceRefs),
  }
  const hashValue = modules.checkpoint.hashDurationContextPolicyLearningValue
  const sourceDecisionHash = sourceDecision ? hashValue(canonicalValue(sourceDecision)) : null
  const evaluatedDecisionHash = hashValue(canonicalValue(evaluatedDecision))
  const decisionMatchesSameShaEvaluator = sourceDecisionHash === evaluatedDecisionHash
  return {
    proposalIdentity: {
      proposalKey: proposal.proposalKey,
      artifactKey: proposal.artifactKey,
      assetKey: proposal.assetKey,
    },
    proposalIdentityHash: hashValue(identity),
    proposalKeyHash: hashValue(proposal.proposalKey),
    artifactKeyHash: hashValue(proposal.artifactKey),
    sourceCandidateRefsHash: hashValue(uniqueSorted(proposal.sourceCandidateRefs)),
    sourceEvidenceRefsHash: hashValue(uniqueSorted(proposal.sourceEvidenceRefs)),
    assetKey: proposal.assetKey,
    scope: {
      level: proposal.scope.level,
      identityHash: hashValue(proposal.scope),
      projectIdHash: proposal.scope.projectId ? hashValue(proposal.scope.projectId) : null,
      companyIdHash: proposal.scope.companyId ? hashValue(proposal.scope.companyId) : null,
      industryKeyHash: proposal.scope.industryKey ? hashValue(proposal.scope.industryKey) : null,
    },
    policyEvaluationRequired: proposal.policyEvaluationRequired === true,
    observed: {
      sampleCount: proposal.sampleCount,
      distinctProjectCount: uniqueSorted(proposal.projectIds).length,
      distinctCompanyCount: uniqueSorted(proposal.companyIds).length,
      distinctIndustryCount: uniqueSorted(proposal.industryKeys).length,
      distinctTaskCount: uniqueSorted(proposal.taskIds ?? []).length,
      realOutcomeCount: proposal.realOutcomeCount ?? 0,
      replayCaseCount: proposal.replayCaseCount ?? 0,
      observationWindowDays: proposal.observationWindowDays ?? 0,
      conflictCount: proposal.conflictCount,
      replayPassed: proposal.replayPassed,
      blockingReasons: uniqueSorted(proposal.blockingReasons ?? []),
    },
    policyEvaluator: {
      sourceDecisionPresent: Boolean(sourceDecision),
      sourceDecisionHash,
      evaluatedDecisionHash,
      decisionMatchesSameShaEvaluator,
      policyCode: evaluatedDecision.policyCode ?? null,
      experienceTier: evaluatedDecision.experienceTier ?? null,
      reuseScope: evaluatedDecision.reuseScope ?? proposal.scope.level,
      factSource: evaluatedDecision.factSource ?? null,
      targetStage: evaluatedDecision.targetStage ?? 'canary',
      stage: evaluatedDecision.stage ?? null,
      autoPromotionAllowed: evaluatedDecision.autoPromotionAllowed === true,
      manualReviewRequired: evaluatedDecision.manualReviewRequired === true,
      retainPreviousStable: evaluatedDecision.retainPreviousStable === true,
      reasonCodes: uniqueSorted(evaluatedDecision.reasonCodes ?? []),
      thresholds: evaluatedDecision.thresholds ?? null,
      observed: evaluatedDecision.observed ?? null,
    },
    enteredCanaryDryRun,
  }
}

function assertControlledFixturePolicyConsistency(modules, candidates) {
  const records = candidates.map((proposal) => realProposalAuditRecord(modules, proposal, true))
  const mismatches = records
    .filter((record) => (
      record.policyEvaluationRequired !== true
      || record.policyEvaluator.sourceDecisionPresent !== true
      || record.policyEvaluator.decisionMatchesSameShaEvaluator !== true
      || record.policyEvaluator.autoPromotionAllowed !== true
      || record.policyEvaluator.manualReviewRequired !== false
    ))
    .map((record) => ({
      proposalIdentityHash: record.proposalIdentityHash,
      assetKey: record.assetKey,
      scopeLevel: record.scope.level,
    }))
  assert.deepEqual(mismatches, [], 'controlled staging floor fixture must match the same-SHA policy evaluator')
  return {
    consistent: true,
    proposalCount: records.length,
    proposalIdentityHashes: records.map((record) => record.proposalIdentityHash).sort(),
  }
}

function realProposalCoverageEligible(record) {
  return record.enteredCanaryDryRun === true
    && record.policyEvaluationRequired === true
    && record.policyEvaluator.sourceDecisionPresent === true
    && record.policyEvaluator.decisionMatchesSameShaEvaluator === true
    && record.policyEvaluator.autoPromotionAllowed === true
    && record.policyEvaluator.manualReviewRequired === false
}

function realProposalPolicyViolationReasonCodes(record) {
  const reasons = []
  if (record.policyEvaluationRequired !== true) reasons.push('POLICY_EVALUATION_NOT_REQUIRED')
  if (record.policyEvaluator.sourceDecisionPresent !== true) reasons.push('SOURCE_AUTOMATION_DECISION_MISSING')
  if (record.policyEvaluator.decisionMatchesSameShaEvaluator !== true) reasons.push('SAME_SHA_POLICY_EVALUATION_MISMATCH')
  return reasons
}

function collectRealProposalPolicyViolations(records) {
  return records.flatMap((record) => {
    const reasonCodes = realProposalPolicyViolationReasonCodes(record)
    return reasonCodes.length === 0
      ? []
      : [{
          proposalIdentityHash: record.proposalIdentityHash,
          assetKey: record.assetKey,
          scopeLevel: record.scope.level,
          reasonCodes,
        }]
  })
}

function coverageMatrix(records) {
  return Object.fromEntries(ASSET_KEYS.map((assetKey) => [
    assetKey,
    Object.fromEntries(SCOPE_LEVELS.map((scopeLevel) => {
      const matching = records.filter((record) => record.assetKey === assetKey && record.scope.level === scopeLevel)
      const eligible = matching.filter(realProposalCoverageEligible)
      return [scopeLevel, {
        proposalCount: matching.length,
        eligibleCount: eligible.length,
        proposalIdentityHashes: eligible.map((record) => record.proposalIdentityHash).sort(),
      }]
    })),
  ]))
}

function missingCoverageCells(matrix) {
  return ASSET_KEYS.flatMap((assetKey) => SCOPE_LEVELS
    .filter((scopeLevel) => Number(matrix?.[assetKey]?.[scopeLevel]?.eligibleCount ?? 0) < 1)
    .map((scopeLevel) => `${assetKey}:${scopeLevel}`))
}

function assertCompleteRealCandidateAggregationCoverage(coverage) {
  const policyViolations = coverage.policyViolations ?? []
  if (policyViolations.length > 0) {
    throw Object.assign(
      new Error(`real_candidate_policy_evaluation_invalid:${policyViolations.length}`),
      { code: 'REAL_CANDIDATE_POLICY_EVALUATION_INVALID', policyViolations },
    )
  }
  const missing = missingCoverageCells(coverage.matrix)
  if (missing.length > 0) {
    throw Object.assign(
      new Error(`real_candidate_aggregation_coverage_incomplete:${missing.join(',')}`),
      { code: 'REAL_CANDIDATE_AGGREGATION_COVERAGE_INCOMPLETE', missingCoverageCells: missing },
    )
  }
}

async function assessRealCandidateAggregationCoverage(modules, runtimeQueryExec) {
  const sourceCandidates = await modules.lifecycle.collectDurationLearningRuntimeCandidateProposals(runtimeQueryExec)
  const expanded = modules.lifecycle.expandDurationLearningRuntimeCandidateScopes(sourceCandidates)
  const enteredProposalKeys = new Set()
  const dryRunResult = await modules.lifecycle.runDurationLearningRuntimeLifecycleSweep({
    queryExec: runtimeQueryExec,
    candidateProvider: async () => sourceCandidates,
    monitoringProvider: async () => [],
    checkpointStore: null,
    persistPublication: async (input) => {
      const proposalKey = String(input.automationDecision?.proposalKey ?? '').trim()
      if (proposalKey) enteredProposalKeys.add(proposalKey)
      return {
        status: 'published',
        publication: {
          publicationKey: input.publicationKey,
          assetKey: input.assetKey,
          artifactKey: input.artifactKey,
          scopeLevel: input.scope.level,
        },
        reasons: [],
      }
    },
  })
  const proposals = expanded.map((proposal) => realProposalAuditRecord(
    modules,
    proposal,
    enteredProposalKeys.has(proposal.proposalKey),
  ))
  const policyViolations = collectRealProposalPolicyViolations(proposals)
  const matrix = coverageMatrix(proposals)
  const missing = missingCoverageCells(matrix)
  const collectorOutputHash = hashCanonicalValue({
    schema: REAL_PROPOSAL_AUDIT_SCHEMA,
    sourceCandidateCount: sourceCandidates.length,
    expandedCandidateCount: expanded.length,
    proposalAuditRecords: proposals,
  })
  return {
    status: missing.length === 0 && policyViolations.length === 0 ? 'complete' : 'incomplete',
    proposalAuditSchema: REAL_PROPOSAL_AUDIT_SCHEMA,
    collectorOutputHash,
    sourceCandidateCount: sourceCandidates.length,
    expandedCandidateCount: expanded.length,
    dryRunLifecycleResult: dryRunResult,
    matrix,
    missingCoverageCells: missing,
    policyViolations,
    proposalAuditRecords: proposals,
    mutationCount: 0,
  }
}

function syntheticAggregationCandidates(modules, assetKey) {
  const candidates = []
  for (let index = 0; index < 24; index += 1) {
    const companyIndex = Math.floor(index / 4)
    const industryIndex = index % 3
    const fixture = {
      projectId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      companyId: `10000000-0000-4000-8000-${String(companyIndex + 1).padStart(12, '0')}`,
      industryKey: SELF_TEST_INDUSTRY_KEYS[industryIndex],
    }
    candidates.push(buildCandidateBase(modules, assetKey, 'project', fixture, index))
  }
  return candidates
}

function monitoringCandidateForProposal(proposal, publicationKey, failure = false) {
  const structural = STRUCTURAL_ASSET_KEYS.has(proposal.assetKey)
  return {
    publicationKey,
    assetKey: proposal.assetKey,
    artifactKey: proposal.artifactKey,
    publicationStage: failure ? 'stable' : 'canary',
    monitoringStatus: 'pending',
    scope: proposal.scope,
    monitoringWindowHours: structural ? 168 : 72,
    monitoringElapsedHours: 192,
    observedCount: OBSERVATIONS_PER_PUBLICATION,
    rejectedObservationCount: failure ? 1 : 0,
    acceptedOutcomeCount: structural ? OBSERVATIONS_PER_PUBLICATION : 0,
    weakOrRejectedOutcomeCount: 0,
    accuracySampleCount: OBSERVATIONS_PER_PUBLICATION,
    maeBefore: 2,
    maeAfter: 1,
    regressionRate: 0,
    sourceAutomationDecision: proposal.automationDecision,
  }
}

function createSyntheticLifecycleReviewQueueStore() {
  return {
    upsertOpen: async () => ({ disposition: 'created', item: {} }),
    loadForUpdate: async () => null,
    resolveByPublication: async () => 0,
    resolveOpenByPublicationIdentity: async () => 0,
    decide: async () => null,
    list: async () => [],
  }
}

async function runPureLifecycleSimulation(modules, selected) {
  const reviewQueueStore = createSyntheticLifecycleReviewQueueStore()
  const transactionRunner = async (work) => work()
  const candidateResult = await modules.lifecycle.runDurationLearningRuntimeLifecycleSweep({
    candidateProvider: async () => selected.candidates,
    monitoringProvider: async () => [],
    checkpointStore: null,
    reviewQueueStore,
    transactionRunner,
    persistPublication: async (input) => ({
      status: 'published',
      publication: {
        publicationKey: input.publicationKey,
        assetKey: input.assetKey,
        artifactKey: input.artifactKey,
        scopeLevel: input.scope.level,
      },
      reasons: [],
    }),
  })
  assert.equal(candidateResult.canaryPublished, PUBLICATION_COUNT)
  assert.equal(candidateResult.failed, 0)

  const proposalByIdentity = new Map(selected.candidates.map((proposal) => [
    `${proposal.assetKey}:${proposal.scope.level}`,
    proposal,
  ]))
  const passingMonitoring = [...selected.expectedPublicationKeys.entries()].map(([identity, publicationKey]) => (
    monitoringCandidateForProposal(proposalByIdentity.get(identity), publicationKey, false)
  ))
  const stableResult = await modules.lifecycle.runDurationLearningRuntimeLifecycleSweep({
    candidateProvider: async () => [],
    monitoringProvider: async () => passingMonitoring,
    checkpointStore: null,
    reviewQueueStore,
    transactionRunner,
    recordImpact: async () => ({ status: 'impact_recorded', reasons: [] }),
    promoteCanary: async () => ({ status: 'stable_promoted', previousPublicationKey: null, reasons: [] }),
    promoteBenchmarkCanary: async () => ({ status: 'stable_promoted', previousPublicationKey: null, reasons: [] }),
    rollbackPublication: async () => { throw new Error('unexpected_rollback') },
  })
  assert.equal(stableResult.monitoringPassed, PUBLICATION_COUNT)
  assert.equal(stableResult.stablePromoted, PUBLICATION_COUNT)
  assert.equal(stableResult.failed, 0)

  const failingMonitoring = [...selected.expectedPublicationKeys.entries()].map(([identity, publicationKey]) => (
    monitoringCandidateForProposal(proposalByIdentity.get(identity), publicationKey, true)
  ))
  const rollbackResult = await modules.lifecycle.runDurationLearningRuntimeLifecycleSweep({
    candidateProvider: async () => [],
    monitoringProvider: async () => failingMonitoring,
    checkpointStore: null,
    reviewQueueStore,
    transactionRunner,
    recordImpact: async () => ({ status: 'impact_recorded', reasons: [] }),
    promoteCanary: async () => { throw new Error('unexpected_promotion') },
    rollbackPublication: async () => ({ status: 'rollback_executed', restoredPublicationKey: null, reasons: [] }),
  })
  assert.equal(rollbackResult.monitoringFailed, PUBLICATION_COUNT)
  assert.equal(rollbackResult.rollbackExecuted, PUBLICATION_COUNT)
  assert.equal(rollbackResult.failed, 0)
  return { candidateResult, stableResult, rollbackResult }
}

async function runSelfTest() {
  validateOperationPrefix(operationPrefix)
  assertMandatoryRealAggregationFloor()
  if (expectedReleaseSha) assert.equal(gitHead(releaseRoot), expectedReleaseSha, 'self-test release SHA mismatch')
  const modules = await loadReleaseModules()
  const consumerContracts = controlledConsumerContracts(modules)
  const requiredConsumerKeys = uniqueSorted(consumerContracts.map((contract) => contract.consumerKey))
  const aggregation = {}
  for (const assetKey of ASSET_KEYS) {
    const expanded = modules.lifecycle.expandDurationLearningRuntimeCandidateScopes(
      syntheticAggregationCandidates(modules, assetKey),
    )
    const counts = Object.fromEntries(SCOPE_LEVELS.map((level) => [
      level,
      expanded.filter((candidate) => candidate.scope.level === level).length,
    ]))
    assert.deepEqual(counts, { project: 24, company: 6, industry: 3, global: 1 })
    aggregation[assetKey] = counts
  }
  const fixture = {
    projectId: '20000000-0000-4000-8000-000000000001',
    companyId: '30000000-0000-4000-8000-000000000001',
    industryKey: SELF_TEST_INDUSTRY_KEYS[0],
  }
  const selected = buildSelectedCandidates(modules, fixture)
  assert.equal(selected.candidates.length, PUBLICATION_COUNT)
  assert.equal(selected.expectedPublicationKeys.size, PUBLICATION_COUNT)
  const controlledFixturePolicy = assertControlledFixturePolicyConsistency(modules, selected.candidates)
  const lifecycleSimulation = await runPureLifecycleSimulation(modules, selected)
  const completeCoverageRecords = ASSET_KEYS.flatMap((assetKey) => SCOPE_LEVELS.map((scopeLevel) => ({
    assetKey,
    scope: { level: scopeLevel },
    proposalIdentityHash: `${assetKey}:${scopeLevel}`,
    enteredCanaryDryRun: true,
    policyEvaluationRequired: true,
    policyEvaluator: {
      sourceDecisionPresent: true,
      decisionMatchesSameShaEvaluator: true,
      autoPromotionAllowed: true,
      manualReviewRequired: false,
    },
  })))
  const missingGlobalCoverageGuard = createMutationGuard()
  let missingGlobalCoverageRejected = false
  try {
    const incompleteCoverage = {
      matrix: coverageMatrix(completeCoverageRecords.filter((record) => record.scope.level !== 'global')),
      proposalAuditRecords: completeCoverageRecords.filter((record) => record.scope.level !== 'global'),
      policyViolations: [],
    }
    assertCompleteRealCandidateAggregationCoverage(incompleteCoverage)
    const invalidProof = createRealCandidateAggregationCoverageProof(incompleteCoverage)
    missingGlobalCoverageGuard.armAfterRealCoverage(incompleteCoverage, invalidProof)
    missingGlobalCoverageGuard.assertAndCount(
      'insert into public.duration_learning_runtime_publications (publication_key) values ($1)',
    )
  } catch (error) {
    assert.equal(error.code, 'REAL_CANDIDATE_AGGREGATION_COVERAGE_INCOMPLETE')
    assert.ok(error.missingCoverageCells.every((cell) => cell.endsWith(':global')))
    missingGlobalCoverageRejected = true
  }

  const tamperedProposal = {
    ...buildCandidateBase(modules, ASSET_KEYS[0], 'project', fixture, 999),
    automationDecision: { autoPromotionAllowed: true, manualReviewRequired: false },
  }
  const tamperedRecord = realProposalAuditRecord(modules, tamperedProposal, true)
  const disabledPolicyRecord = {
    ...completeCoverageRecords[0],
    policyEvaluationRequired: false,
  }
  const policyViolationRejected = (record) => {
    try {
      assertCompleteRealCandidateAggregationCoverage({
        matrix: coverageMatrix(completeCoverageRecords),
        policyViolations: collectRealProposalPolicyViolations([record]),
      })
      return false
    } catch (error) {
      assert.equal(error.code, 'REAL_CANDIDATE_POLICY_EVALUATION_INVALID')
      return true
    }
  }
  const handWrittenAutomationDecisionRejected = policyViolationRejected(tamperedRecord)
  const disabledPolicyEvaluationRejected = policyViolationRejected(disabledPolicyRecord)

  let floorOverrideRejected = false
  try {
    assertMandatoryRealAggregationFloor(false, { inspectRuntimeOverrides: false })
  } catch (error) {
    assert.equal(error.code, 'REAL_AGGREGATION_FLOOR_NOT_CONFIGURABLE')
    floorOverrideRejected = true
  }

  const mutationGuard = createMutationGuard()
  let writeBeforeRealCoverageRejected = false
  try {
    mutationGuard.assertAndCount('insert into public.duration_learning_runtime_publications (publication_key) values ($1)')
  } catch (error) {
    assert.match(error.message, /database_mutation_before_real_candidate_aggregation_coverage/)
    writeBeforeRealCoverageRejected = true
  }
  const boundaryGuard = createMutationGuard()
  boundaryGuard.realCoverageVerified = true
  boundaryGuard.mutationStarted = true
  let outOfBoundaryMutationRejected = false
  try {
    boundaryGuard.assertAndCount('insert into public.tasks (id) values ($1)')
  } catch (error) {
    assert.match(error.message, /database_mutation_outside_learning_v2_boundary:tasks/)
    outOfBoundaryMutationRejected = true
  }
  const cleanupQueries = []
  const readOnlyCleanupResult = await cleanupOperation({
    query: async (sql) => {
      cleanupQueries.push(sql)
      return { rows: [{ count: 0 }], rowCount: 1 }
    },
  }, operationPrefix, { allowMutation: false })
  const cleanupWithoutMutationIsReadOnly = readOnlyCleanupResult.mode === 'read_only_no_mutation'
    && cleanupQueries.length > 0
    && cleanupQueries.every((sql) => !isMutationSql(sql))
  const forgedCleanupPolicy = cleanupPolicyForState({
    ...initialLifecycleState(),
    realCoverageVerified: true,
    mutationStarted: true,
    realCandidateAggregationCoverageProof: null,
  })
  const forgedCleanupWithoutCoverageProofIsReadOnly = forgedCleanupPolicy.allowMutation === false
    && forgedCleanupPolicy.coverageProofValid === false
    && forgedCleanupPolicy.mode === 'read_only_no_mutation'
  let crossProjectDatabaseIdentityRejected = false
  try {
    assertMatchingDatabaseConnectionIdentities(
      'postgresql://workbuddy_runtime_login.stagingref:runtime@aws-1.pooler.supabase.com:5432/postgres',
      'postgresql://postgres.productionref:admin@aws-1.pooler.supabase.com:5432/postgres',
    )
  } catch (error) {
    assert.match(error.message, /project refs differ/)
    crossProjectDatabaseIdentityRejected = true
  }
  let staleAdvisorExportRejected = false
  try {
    verifyAdvisorExportEvidence(JSON.stringify({
      schemaVersion: 'workbuddy-supabase-advisor-ui-or-api-export/v1',
      source: 'management_api',
      exportedAt: new Date(Date.now() - ADVISOR_MAX_AGE_MS - 1).toISOString(),
      projectRef: 'stagingref',
      environment: 'staging',
      securityIssueCount: 0,
    }), 'stagingref')
  } catch (error) {
    assert.match(error.message, /advisor_export_stale/)
    staleAdvisorExportRejected = true
  }
  const negativeContracts = {
    missingGlobalCoverageRejected,
    missingGlobalCoverageMutationCount: missingGlobalCoverageGuard.statementCount,
    missingGlobalCoverageLeftMutationDisarmed: missingGlobalCoverageGuard.realCoverageVerified === false
      && missingGlobalCoverageGuard.mutationStarted === false,
    handWrittenAutomationDecisionRejected,
    disabledPolicyEvaluationRejected,
    floorOverrideRejected,
    writeBeforeRealCoverageRejected,
    writeBeforeRealCoverageMutationCount: mutationGuard.statementCount,
    cleanupWithoutMutationIsReadOnly,
    cleanupMutationStatementCount: readOnlyCleanupResult.mutationStatementCount,
    forgedCleanupWithoutCoverageProofIsReadOnly,
    outOfBoundaryMutationRejected,
    outOfBoundaryMutationCount: boundaryGuard.statementCount,
    crossProjectDatabaseIdentityRejected,
    staleAdvisorExportRejected,
  }
  assert.ok(Object.entries(negativeContracts)
    .filter(([key]) => ![
      'writeBeforeRealCoverageMutationCount',
      'missingGlobalCoverageMutationCount',
      'cleanupMutationStatementCount',
      'outOfBoundaryMutationCount',
    ].includes(key))
    .every(([, value]) => value === true))
  assert.equal(negativeContracts.writeBeforeRealCoverageMutationCount, 0)
  assert.equal(negativeContracts.missingGlobalCoverageMutationCount, 0)
  assert.equal(negativeContracts.cleanupMutationStatementCount, 0)
  assert.equal(negativeContracts.outOfBoundaryMutationCount, 0)
  const result = {
    schema: SCHEMA,
    status: 'pass',
    mode: 'self-test',
    releaseRoot,
    assetKeys: ASSET_KEYS,
    scopeLevels: SCOPE_LEVELS,
    publicationCount: PUBLICATION_COUNT,
    requiredConsumerKeys,
    assetConsumerContracts: consumerContracts,
    aggregation,
    deterministicCanarySelection: selected.selectionAttempts,
    controlledFixturePolicyEvaluatorConsistent: controlledFixturePolicy.consistent,
    controlledFixturePolicy,
    lifecycleSimulation,
    negativeContracts,
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

async function cleanupOperation(adminPool, prefix, { allowMutation = false, mutationGuard = null } = {}) {
  validateOperationPrefix(prefix)
  if (!allowMutation) {
    const residue = await readResidue(adminPool, prefix)
    return {
      status: Object.values(residue).every((count) => count === 0) ? 'pass' : 'fail',
      mode: 'read_only_no_mutation',
      deletionCounts: {},
      mutationStatementCount: 0,
      residue,
    }
  }
  const statementCountBeforeCleanup = mutationGuard?.statementCount ?? 0
  const client = await adminPool.connect()
  try {
    await client.query('begin')
    const deletionCounts = {}
    const deletions = [
      ['duration_algorithm_accuracy_events', `delete from public.duration_algorithm_accuracy_events
        where prediction_context ->> 'operationId' = $1`, [prefix]],
      ['duration_plan_network_outcomes', `delete from public.duration_plan_network_outcomes
        where metadata ->> 'operationId' = $1 or id like $2`, [prefix, `${prefix}:%`]],
      ['runtime_consumer_observations', `delete from public.runtime_consumer_observations
        where observation_context ->> 'operationId' = $1
           or exists (
             select 1
               from jsonb_array_elements_text(
                 case when jsonb_typeof(source_evidence_refs) = 'array' then source_evidence_refs else '[]'::jsonb end
               ) ref
              where ref like $2
           )`, [prefix, `${prefix}:%`]],
      ['runtime_consumer_runtime_calls', `delete from public.runtime_consumer_runtime_calls
        where call_context ->> 'operationId' = $1
           or exists (
             select 1
               from jsonb_array_elements_text(
                 case when jsonb_typeof(source_evidence_refs) = 'array' then source_evidence_refs else '[]'::jsonb end
               ) ref
              where ref like $2
           )`, [prefix, `${prefix}:%`]],
      ['duration_learning_runtime_publications', `delete from public.duration_learning_runtime_publications
        where artifact_key like $1
           or exists (
             select 1
               from jsonb_array_elements_text(
                 case when jsonb_typeof(source_candidate_refs) = 'array' then source_candidate_refs else '[]'::jsonb end
               ) ref
              where ref like $1
           )`, [`${prefix}:%`]],
    ]
    for (const [label, sql, params] of deletions) {
      deletionCounts[label] = (await guardedClientQuery(client, mutationGuard, sql, params)).rowCount ?? 0
    }
    await client.query('commit')
    const residue = await readResidue(adminPool, prefix)
    return {
      status: Object.values(residue).every((count) => count === 0) ? 'pass' : 'fail',
      mode: 'prefix_scoped_delete',
      deletionCounts,
      mutationStatementCount: mutationGuard
        ? mutationGuard.statementCount - statementCountBeforeCleanup
        : deletions.length,
      residue,
    }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function readResidue(pool, prefix) {
  const queries = {
    durationLearningRuntimePublications: [`select count(*)::int as count
      from public.duration_learning_runtime_publications
      where artifact_key like $1
         or exists (
           select 1
             from jsonb_array_elements_text(
               case when jsonb_typeof(source_candidate_refs) = 'array' then source_candidate_refs else '[]'::jsonb end
             ) ref
            where ref like $1
         )`, [`${prefix}:%`]],
    runtimeConsumerObservations: [`select count(*)::int as count
      from public.runtime_consumer_observations
      where observation_context ->> 'operationId' = $1
         or exists (
           select 1
             from jsonb_array_elements_text(
               case when jsonb_typeof(source_evidence_refs) = 'array' then source_evidence_refs else '[]'::jsonb end
             ) ref
            where ref like $2
         )`, [prefix, `${prefix}:%`]],
    runtimeConsumerRuntimeCalls: [`select count(*)::int as count
      from public.runtime_consumer_runtime_calls
      where call_context ->> 'operationId' = $1
         or exists (
           select 1
             from jsonb_array_elements_text(
               case when jsonb_typeof(source_evidence_refs) = 'array' then source_evidence_refs else '[]'::jsonb end
             ) ref
            where ref like $2
         )`, [prefix, `${prefix}:%`]],
    durationAlgorithmAccuracyEvents: [`select count(*)::int as count
      from public.duration_algorithm_accuracy_events
      where prediction_context ->> 'operationId' = $1`, [prefix]],
    durationPlanNetworkOutcomes: [`select count(*)::int as count
      from public.duration_plan_network_outcomes
      where metadata ->> 'operationId' = $1 or id like $2`, [prefix, `${prefix}:%`]],
  }
  const residue = {}
  for (const [label, [sql, params]] of Object.entries(queries)) {
    residue[label] = Number((await pool.query(sql, params)).rows[0]?.count ?? 0)
  }
  return residue
}

async function verifyPreflight(adminPool, runtimePool, report, modules) {
  assert.equal(process.env.WORKBUDDY_TARGET_ENVIRONMENT, 'staging', 'WORKBUDDY_TARGET_ENVIRONMENT must be staging')
  assert.equal(
    process.env.WORKBUDDY_LEARNING_V2_MUTATION_APPROVED,
    APPROVAL_PHRASE,
    'explicit disposable staging mutation approval phrase is required',
  )
  assert.match(expectedReleaseSha, /^[0-9a-f]{40}$/)
  assert.equal(gitHead(releaseRoot), expectedReleaseSha, 'checkout release SHA mismatch')
  assert.ok(readyzJsonPath && fs.existsSync(readyzJsonPath), 'deployed readyz JSON is required')
  const readyz = JSON.parse(fs.readFileSync(readyzJsonPath, 'utf8'))
  assert.equal(readyz?.build?.releaseSha, expectedReleaseSha, 'deployed readyz release SHA mismatch')
  assert.equal(readyz?.build?.deployTarget, 'staging', 'deployed readyz target must be staging')

  const runtimeUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.WORKBUDDY_RUNTIME_DATABASE_URL
  const adminUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
  const { runtimeConnectionIdentity, adminConnectionIdentity } = assertMatchingDatabaseConnectionIdentities(
    runtimeUrl,
    adminUrl,
  )
  const apiProjectRef = supabaseApiProjectRef(process.env.SUPABASE_URL)
  assert.equal(apiProjectRef, runtimeConnectionIdentity.projectRef, 'runtime API and runtime database project refs differ')
  assert.equal(
    readyz?.build?.supabaseProjectRef,
    runtimeConnectionIdentity.projectRef,
    'readyz Supabase project ref mismatch',
  )
  assert.equal(
    readyz?.build?.databaseProjectRef,
    runtimeConnectionIdentity.projectRef,
    'readyz database project ref mismatch',
  )
  const advisor = verifyAdvisorExportEvidence(
    process.env.SUPABASE_ADVISOR_EXPORT_JSON,
    runtimeConnectionIdentity.projectRef,
  )

  const migrationReadback = []
  for (const [filename, expectedHash] of Object.entries(MIGRATION_HASHES)) {
    const filePath = path.join(releaseRoot, 'server', 'migrations', filename)
    assert.equal(sha256File(filePath), expectedHash, `${filename} file checksum mismatch`)
    const ledger = await adminPool.query(
      `select filename, checksum, applied_at::text as applied_at
         from public.schema_migrations
        where filename = $1`,
      [filename],
    )
    assert.equal(ledger.rowCount, 1, `${filename} is not applied in schema_migrations`)
    assert.equal(ledger.rows[0].checksum, expectedHash, `${filename} ledger checksum mismatch`)
    migrationReadback.push({ filename, checksum: expectedHash, appliedAt: ledger.rows[0].applied_at })
  }

  const runtimeIdentity = (await runtimePool.query(
    `select current_database() as database_name,
            current_user as database_user,
            pg_has_role(current_user, 'workbuddy_runtime', 'member') as runtime_member`,
  )).rows[0]
  const adminIdentity = (await adminPool.query(
    `select current_database() as database_name, current_user as database_user`,
  )).rows[0]
  assert.equal(runtimeIdentity.runtime_member, true, 'runtime DB login must inherit workbuddy_runtime')
  assert.equal(runtimeIdentity.database_name, adminIdentity.database_name, 'runtime/admin URLs target different databases')
  assert.notEqual(runtimeIdentity.database_user, adminIdentity.database_user, 'runtime/admin SQL users must be separate')

  const privilege = (await runtimePool.query(
    `select
       has_table_privilege(current_user, 'public.duration_learning_runtime_publications', 'select,insert,update,delete') as publication_rw,
       has_table_privilege(current_user, 'public.runtime_consumer_observations', 'select,insert') as observation_append,
       has_table_privilege(current_user, 'public.runtime_consumer_runtime_calls', 'select,insert') as call_append,
       has_table_privilege(current_user, 'public.duration_algorithm_accuracy_events', 'select') as accuracy_read,
       has_table_privilege(current_user, 'public.duration_plan_network_outcomes', 'select') as outcome_read`,
  )).rows[0]
  assert.ok(Object.values(privilege).every(Boolean), 'runtime DB privileges are incomplete for lifecycle smoke')

  const requestedProjectId = requireText(
    args.get('project-id') ?? process.env.WORKBUDDY_LEARNING_V2_PROJECT_ID,
    'WORKBUDDY_LEARNING_V2_PROJECT_ID',
  )
  assert.equal(
    typeof modules.lifecycle.durationLearningProjectIndustrySqlExpression,
    'function',
    'same-SHA canonical project industry SQL helper is required',
  )
  assert.equal(
    typeof modules.lifecycle.canonicalizeDurationLearningIndustryKey,
    'function',
    'same-SHA canonical project industry resolver is required',
  )
  const projectIndustrySql = modules.lifecycle.durationLearningProjectIndustrySqlExpression('project')
  const projectRows = await adminPool.query(
    `select project.id::text as project_id,
            project.company_id::text as company_id,
            ${projectIndustrySql} as industry_key
       from public.projects project
      where project.id = $1::uuid
      limit 1`,
    [requestedProjectId],
  )
  assert.equal(projectRows.rowCount, 1, 'staging fixture project not found')
  const databaseIndustryKey = requireText(projectRows.rows[0].industry_key, 'fixture_project_industry_key')
  assert.equal(
    modules.lifecycle.canonicalizeDurationLearningIndustryKey(databaseIndustryKey),
    databaseIndustryKey,
    'fixture project industry readback is not canonical',
  )
  const fixture = {
    projectId: projectRows.rows[0].project_id,
    companyId: requireText(projectRows.rows[0].company_id, 'fixture_project_company_id'),
    industryKey: databaseIndustryKey,
  }
  const requestedCompanyId = String(args.get('company-id') ?? process.env.WORKBUDDY_LEARNING_V2_COMPANY_ID ?? '').trim()
  if (requestedCompanyId) assert.equal(requestedCompanyId, fixture.companyId, 'fixture project/company mismatch')
  const requestedIndustryKey = String(
    args.get('industry-key') ?? process.env.WORKBUDDY_LEARNING_V2_INDUSTRY_KEY ?? '',
  ).trim()
  if (requestedIndustryKey) {
    assert.equal(
      modules.lifecycle.canonicalizeDurationLearningIndustryKey(requestedIndustryKey),
      databaseIndustryKey,
      'fixture project/industry mismatch',
    )
  }

  const residue = await readResidue(adminPool, operationPrefix)
  assert.ok(Object.values(residue).every((count) => count === 0), 'operation prefix already has database residue')
  report.release = {
    expectedReleaseSha,
    checkoutReleaseSha: expectedReleaseSha,
    deployedReleaseSha: readyz.build.releaseSha,
    deployTarget: readyz.build.deployTarget,
  }
  report.database = {
    projectRef: runtimeConnectionIdentity.projectRef,
    databaseName: runtimeIdentity.database_name,
    runtimeUser: runtimeIdentity.database_user,
    adminUser: adminIdentity.database_user,
    sameDatabase: true,
    runtimeMember: true,
    connectionRolesSeparated: runtimeConnectionIdentity.roleName !== adminConnectionIdentity.roleName,
    privileges: privilege,
  }
  report.advisor = advisor
  report.migrations = migrationReadback
  report.fixture = fixture
  report.preflightResidue = residue
  return fixture
}

function publicationQuery(prefix) {
  return {
    sql: `select publication_key, asset_key, artifact_key, scope_level,
                 company_id::text as company_id, project_id::text as project_id,
                 industry_key, publication_stage, monitoring_status, traffic_percent,
                 runtime_payload, rollback_execution
            from public.duration_learning_runtime_publications
           where artifact_key like $1
           order by asset_key, scope_level`,
    params: [`${prefix}:%`],
  }
}

async function readPublications(pool, prefix) {
  const query = publicationQuery(prefix)
  return (await pool.query(query.sql, query.params)).rows
}

const CONSUMER_FACADE_METHOD_BY_KEY = {
  durationSuggestionService: 'recordDurationSuggestionConsumedArtifacts',
  projectRemainingDurationForecastService: 'recordProjectRemainingDurationForecastConsumedArtifacts',
  projectCriticalPathService: 'recordProjectCriticalPathConsumedArtifacts',
  wbsTemplateGenerationService: 'recordWbsTemplateGenerationConsumedArtifacts',
  scheduleAccelerationService: 'recordScheduleAccelerationConsumedArtifacts',
  scheduleAccelerationRuntimeService: 'recordScheduleAccelerationRuntimeConsumedArtifacts',
}

function controlledConsumerContracts(modules) {
  const contracts = modules.integration.listDurationRuntimeConsumerObservationIntegrationContracts()
    .filter((contract) => ASSET_KEYS.includes(contract.assetKey))
  const unsupported = contracts.filter((contract) => !CONSUMER_FACADE_METHOD_BY_KEY[contract.consumerKey])
  assert.deepEqual(
    unsupported.map((contract) => `${contract.assetKey}:${contract.consumerKey}`),
    [],
    'same-SHA duration consumer contract has no approved facade',
  )
  return [...new Map(contracts.map((contract) => [
    `${contract.assetKey}:${contract.consumerKey}`,
    {
      assetKey: contract.assetKey,
      consumerKey: contract.consumerKey,
      consumerSurface: contract.consumerSurface,
    },
  ])).values()].sort((left, right) => (
    `${left.assetKey}:${left.consumerKey}`.localeCompare(`${right.assetKey}:${right.consumerKey}`)
  ))
}

function facadeForConsumer(modules, consumerKey) {
  const methodName = CONSUMER_FACADE_METHOD_BY_KEY[consumerKey]
  const call = methodName ? modules.adapter[methodName] : null
  assert.equal(typeof call, 'function', `missing same-SHA consumer facade ${consumerKey}`)
  return { consumerKey, call }
}

async function consumeCanaries(modules, runtimeQueryExec, approvedObservationQueryExec, fixture, publications) {
  const consumption = []
  const contracts = controlledConsumerContracts(modules)
  const now = Date.now()
  for (const publication of publications) {
    const resolution = await modules.publication.resolveDurationLearningRuntimePublication({
      queryExec: runtimeQueryExec,
      assetKey: publication.asset_key,
      artifactKey: publication.artifact_key,
      companyId: fixture.companyId,
      projectId: fixture.projectId,
      industryKey: fixture.industryKey,
    })
    assert.equal(resolution.runtimeConsumable, true)
    assert.equal(resolution.publicationKey, publication.publication_key)
    assert.equal(resolution.selectionBasis, `${publication.scope_level}_canary`)
    const publicationContracts = contracts.filter((contract) => contract.assetKey === publication.asset_key)
    assert.ok(publicationContracts.length > 0, `no same-SHA consumer contracts for ${publication.asset_key}`)
    for (const contract of publicationContracts) {
      const facade = facadeForConsumer(modules, contract.consumerKey)
      for (let index = 0; index < OBSERVATIONS_PER_PUBLICATION; index += 1) {
        const observedAt = new Date(now - 60 * 60 * 1000 + index * 1000).toISOString()
        const evidenceRef = `${operationPrefix}:consumer:${contract.consumerKey}:${publication.asset_key}:${publication.scope_level}:${index}`
        const result = await facade.call({
          queryExec: approvedObservationQueryExec,
          runtimeEntryRef: undefined,
          calledAt: observedAt,
          observedAt,
          callContext: {
            operationId: operationPrefix,
            releaseSha: expectedReleaseSha,
            projectId: fixture.projectId,
            assetKey: publication.asset_key,
            scopeLevel: publication.scope_level,
            consumerKey: contract.consumerKey,
            iteration: index,
            controlledStagingFixture: true,
          },
          sourceEvidenceRefs: [evidenceRef],
          artifacts: [{
            assetKey: publication.asset_key,
            publicationKey: publication.publication_key,
            publicationStatus: 'canary',
            sourceEvidenceRefs: [`duration_learning_runtime_publications:${publication.publication_key}`, evidenceRef],
            observationContext: {
              operationId: operationPrefix,
              releaseSha: expectedReleaseSha,
              projectId: fixture.projectId,
              artifactKey: publication.artifact_key,
              scopeLevel: publication.scope_level,
              consumerKey: contract.consumerKey,
              iteration: index,
              controlledStagingFixture: true,
            },
          }],
          writesRuntimeDirectly: false,
          writesFactDirectly: false,
        })
        assert.equal(result.status, 'runtime_consumer_observations_recorded')
        assert.equal(result.recordedCount, 1)
        assert.equal(result.runtimeCallResult.status, 'runtime_consumer_runtime_call_recorded')
      }
      consumption.push({
        publicationKey: publication.publication_key,
        assetKey: publication.asset_key,
        scopeLevel: publication.scope_level,
        consumerKey: facade.consumerKey,
        consumerSurface: contract.consumerSurface,
        observationCount: OBSERVATIONS_PER_PUBLICATION,
        runtimeCallCount: OBSERVATIONS_PER_PUBLICATION,
        selectionBasis: resolution.selectionBasis,
      })
    }
  }
  return {
    contracts,
    requiredConsumerKeys: uniqueSorted(contracts.map((contract) => contract.consumerKey)),
    rows: consumption,
    observationCount: consumption.reduce((sum, row) => sum + row.observationCount, 0),
    runtimeCallCount: consumption.reduce((sum, row) => sum + row.runtimeCallCount, 0),
  }
}

function learningScopeSource(scopeLevel) {
  if (scopeLevel === 'project') return 'project_business_outcome_writer'
  if (scopeLevel === 'company') return 'plan_network_company_aggregate_job'
  if (scopeLevel === 'industry') return 'plan_network_industry_baseline_job'
  return 'plan_network_global_baseline_job'
}

async function insertMonitoringFixtures(adminPool, fixture, publications, mutationGuard) {
  const client = await adminPool.connect()
  let accuracyCount = 0
  let outcomeCount = 0
  try {
    await client.query('begin')
    for (const publication of publications) {
      if (STRUCTURAL_ASSET_KEYS.has(publication.asset_key)) {
        for (let index = 0; index < OBSERVATIONS_PER_PUBLICATION; index += 1) {
          const id = `${operationPrefix}:outcome:${publication.asset_key}:${publication.scope_level}:${index}`
          await guardedClientQuery(
            client,
            mutationGuard,
            `insert into public.duration_plan_network_outcomes (
               id, asset_key, outcome_status, outcome_ref, learning_scope,
               learning_scope_source, company_id, project_id, publication_key,
               observed_at, metadata, writes_runtime_directly, writes_fact_directly
             ) values (
               $1, $2, 'accepted', $3, $4, $5, $6::uuid, $7::uuid, $8,
               now(), $9::jsonb, false, false
             )`,
            [
              id,
              publication.asset_key,
              `${operationPrefix}:accepted`,
              publication.scope_level,
              learningScopeSource(publication.scope_level),
              ['project', 'company'].includes(publication.scope_level) ? fixture.companyId : null,
              publication.scope_level === 'project' ? fixture.projectId : null,
              publication.publication_key,
              JSON.stringify({ operationId: operationPrefix, releaseSha: expectedReleaseSha, controlledStagingFixture: true }),
            ],
          )
          outcomeCount += 1
        }
      }
      for (let index = 0; index < OBSERVATIONS_PER_PUBLICATION; index += 1) {
        await guardedClientQuery(
          client,
          mutationGuard,
          `insert into public.duration_algorithm_accuracy_events (
             project_id, task_id, engine_code, output_kind, dedupe_key,
             prediction_basis, prediction_source, model_version,
             predicted_duration_days, actual_duration_days, signed_error_days,
             absolute_error_days, baseline_absolute_error_days, overcompensated,
             backtest_status, prediction_context, actual_context,
             predicted_at, backtested_at, created_at, updated_at
           ) values (
             $1::uuid, null, 'duration_learning_v2_smoke', $2, $3,
             'controlled_staging_lifecycle_smoke', 'controlled_staging_fixture', $4,
             10, 11, 1, 1, 2, false, 'backtested', $5::jsonb, $6::jsonb,
             now(), now(), now(), now()
           )`,
          [
            fixture.projectId,
            publication.asset_key,
            `${operationPrefix}:accuracy:${publication.asset_key}:${publication.scope_level}:${index}`,
            expectedReleaseSha,
            JSON.stringify({
              operationId: operationPrefix,
              runtimePublicationKey: publication.publication_key,
              scopeLevel: publication.scope_level,
              controlledStagingFixture: true,
            }),
            JSON.stringify({ operationId: operationPrefix, controlledStagingFixture: true }),
          ],
        )
        accuracyCount += 1
      }
    }
    await client.query('commit')
    return { accuracyCount, outcomeCount }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function filteredMonitoringCandidates(modules, runtimeQueryExec, publicationKeys) {
  const all = await modules.lifecycle.collectDurationLearningRuntimeMonitoringCandidates(runtimeQueryExec)
  const selected = all.filter((candidate) => publicationKeys.has(candidate.publicationKey))
  assert.equal(selected.length, publicationKeys.size, 'monitoring collector did not return every controlled publication')
  return selected
}

async function injectForcedRollbackObservations(
  modules,
  runtimeQueryExec,
  approvedObservationQueryExec,
  publications,
) {
  const observedRows = await Promise.all(publications.map(async (publication) => {
    const rows = await runtimeQueryExec(
      `select consumer_key, consumer_surface
         from public.runtime_consumer_observations
        where publication_key = $1
          and observation_context ->> 'operationId' = $2
        order by observed_at asc
        limit 1`,
      [publication.publication_key, operationPrefix],
    )
    return { publication, row: rows[0] }
  }))
  for (const { publication, row } of observedRows) {
    assert.ok(row, `missing observed consumer row for ${publication.publication_key}`)
    const result = await modules.observation.recordDurationRuntimeConsumerObservation({
      queryExec: approvedObservationQueryExec,
      assetKey: publication.asset_key,
      publicationKey: publication.publication_key,
      consumerKey: row.consumer_key,
      consumerSurface: row.consumer_surface,
      observationStatus: 'rejected',
      observationContext: {
        operationId: operationPrefix,
        releaseSha: expectedReleaseSha,
        projectId: publication.project_id,
        scopeLevel: publication.scope_level,
        phase: 'forced_rollback',
        controlledStagingFailureInjection: true,
      },
      sourceEvidenceRefs: [`${operationPrefix}:forced-rollback:${publication.asset_key}:${publication.scope_level}`],
      observedAt: new Date().toISOString(),
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
    })
    assert.equal(result.status, 'runtime_consumer_observation_recorded')
  }
  return { rejectedObservationCount: publications.length }
}

async function runLifecycle() {
  validateOperationPrefix(operationPrefix)
  assertMandatoryRealAggregationFloor()
  const mutationGuard = createMutationGuard()
  const lifecycleState = initialLifecycleState()
  const report = {
    schema: SCHEMA,
    status: 'running',
    mode: 'run',
    operationPrefix,
    startedAt: new Date().toISOString(),
    mutationBoundary: 'duration_learning_v2_prefixed_publications_observations_accuracy_and_network_outcomes_only',
    allowedMutationTables: [...ALLOWED_MUTATION_TABLES].sort(),
    assetKeys: ASSET_KEYS,
    scopeLevels: SCOPE_LEVELS,
    expectedPublicationCount: PUBLICATION_COUNT,
    mutationStatementCount: 0,
    realStableAccuracyNotProvenByControlledFixture: true,
    preflight: { status: 'not_started' },
    realCandidateAggregationCoverage: {
      status: 'not_started',
      requiredMatrix: { assetFamilyCount: ASSET_KEYS.length, scopeLevelCount: SCOPE_LEVELS.length, cellCount: PUBLICATION_COUNT },
      mutationCount: 0,
    },
    controlledScopeLifecycle: {
      status: 'not_started',
      evidenceClass: 'synthetic_staging_fixture',
      purpose: 'same_sha_lifecycle_mechanism_validation_only',
      aggregationClaim: 'not_real_candidate_aggregation',
      accuracyClaim: 'not_measured',
      realCandidateAggregationClaimed: false,
      realAccuracyClaimed: false,
      realStableAccuracyNotProvenByControlledFixture: true,
      controlledFixtureDisclosure: {
        candidates: true,
        monitoringAccuracyRows: true,
        monitoringPlanNetworkOutcomeRows: true,
        controlledLearningEvidenceRowsInserted: true,
        taskBaselinePlanProgressFactsMutated: false,
        existingStableAssetsMutated: false,
      },
      phases: {},
    },
    cleanup: { status: 'not_started', residue: null },
  }
  writeJsonAtomic(reportPath, report)
  writeJsonAtomic(statePath, lifecycleState)

  let adminPool = null
  let runtimePool = null
  let failure = null
  try {
    const adminUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    const runtimeUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.WORKBUDDY_RUNTIME_DATABASE_URL
    adminPool = createPool(adminUrl, 'MIGRATION_DATABASE_URL_or_DATABASE_URL')
    runtimePool = createPool(runtimeUrl, 'RUNTIME_DATABASE_URL')
    const modules = await loadReleaseModules()
    const fixture = await verifyPreflight(adminPool, runtimePool, report, modules)
    report.preflight = { status: 'pass', completedAt: new Date().toISOString() }
    writeJsonAtomic(reportPath, report)

    const runtimeQueryExec = queryExec(runtimePool, mutationGuard)
    const approvedObservationQueryExec = modules.observation.createDurationRuntimeConsumerObservationQueryExec(runtimeQueryExec)
    const realCandidateAggregationCoverage = await assessRealCandidateAggregationCoverage(modules, runtimeQueryExec)
    realCandidateAggregationCoverage.mutationStatementCount = mutationGuard.statementCount
    report.realCandidateAggregationCoverage = realCandidateAggregationCoverage
    writeJsonAtomic(reportPath, report)
    assertCompleteRealCandidateAggregationCoverage(realCandidateAggregationCoverage)
    assert.equal(mutationGuard.statementCount, 0, 'real candidate aggregation coverage assessment must be read-only')
    const realCoverageProof = createRealCandidateAggregationCoverageProof(realCandidateAggregationCoverage)
    mutationGuard.armAfterRealCoverage(realCandidateAggregationCoverage, realCoverageProof)
    lifecycleState.realCoverageVerified = mutationGuard.realCoverageVerified
    lifecycleState.realCandidateAggregationCoverageProof = realCoverageProof
    lifecycleState.mutationStarted = mutationGuard.mutationStarted
    report.realCandidateAggregationCoverage.realCoverageProofHash = realCoverageProof.realCoverageProofHash
    writeJsonAtomic(statePath, lifecycleState)

    const selected = buildSelectedCandidates(modules, fixture)
    const controlledFixturePolicy = assertControlledFixturePolicyConsistency(modules, selected.candidates)
    report.controlledScopeLifecycle.status = 'running'
    report.controlledScopeLifecycle.fixtureCoverage = {
      candidateCount: selected.candidates.length,
      policyEvaluator: controlledFixturePolicy,
      matrix: Object.fromEntries(ASSET_KEYS.map((assetKey) => [
        assetKey,
        Object.fromEntries(SCOPE_LEVELS.map((scopeLevel) => [
          scopeLevel,
          selected.candidates.filter((candidate) => candidate.assetKey === assetKey && candidate.scope.level === scopeLevel).length,
        ])),
      ])),
    }
    const predictedByKey = new Map([...selected.expectedPublicationKeys.entries()].map(([identity, key]) => [key, identity]))
    const publishedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const publishResult = await modules.lifecycle.runDurationLearningRuntimeLifecycleSweep({
      queryExec: runtimeQueryExec,
      candidateProvider: async () => selected.candidates,
      monitoringProvider: async () => [],
      checkpointStore: null,
      observedAt: publishedAt,
      persistPublication: async (input) => {
        assert.ok(predictedByKey.has(input.publicationKey), `unexpected publication key ${input.publicationKey}`)
        return modules.publication.persistDurationLearningRuntimePublication(input)
      },
    })
    assert.deepEqual(
      {
        candidateCount: publishResult.candidateCount,
        expandedCandidateCount: publishResult.expandedCandidateCount,
        canaryPublished: publishResult.canaryPublished,
        candidateCollecting: publishResult.candidateCollecting,
        failed: publishResult.failed,
      },
      { candidateCount: PUBLICATION_COUNT, expandedCandidateCount: PUBLICATION_COUNT, canaryPublished: PUBLICATION_COUNT, candidateCollecting: 0, failed: 0 },
    )
    let publications = await readPublications(adminPool, operationPrefix)
    assert.equal(publications.length, PUBLICATION_COUNT)
    assert.ok(publications.every((row) => row.publication_stage === 'canary'))
    report.controlledScopeLifecycle.phases.canary = {
      status: 'pass',
      publishedAt,
      lifecycleResult: publishResult,
      publicationCount: publications.length,
      scopeCounts: Object.fromEntries(SCOPE_LEVELS.map((level) => [level, publications.filter((row) => row.scope_level === level).length])),
      assetCounts: Object.fromEntries(ASSET_KEYS.map((key) => [key, publications.filter((row) => row.asset_key === key).length])),
      trafficPercentPreserved: publications.every((row) => Number(row.traffic_percent) === (row.scope_level === 'project' ? 20 : 5)),
      deterministicCanarySelectionAttempts: selected.selectionAttempts,
    }
    report.mutationStatementCount = mutationGuard.statementCount
    writeJsonAtomic(reportPath, report)

    const consumption = await consumeCanaries(modules, runtimeQueryExec, approvedObservationQueryExec, fixture, publications)
    const observationReadback = await adminPool.query(
      `select publication_key, asset_key, count(*)::int as observed_count
         from public.runtime_consumer_observations
        where observation_context ->> 'operationId' = $1
          and observation_status = 'observed'
        group by publication_key, asset_key
        order by asset_key, publication_key`,
      [operationPrefix],
    )
    const callReadback = await adminPool.query(
      `select consumer_key, count(*)::int as call_count
         from public.runtime_consumer_runtime_calls
        where call_context ->> 'operationId' = $1
        group by consumer_key
        order by consumer_key`,
      [operationPrefix],
    )
    assert.equal(observationReadback.rowCount, PUBLICATION_COUNT)
    const expectedObservationCountByPublication = new Map()
    for (const row of consumption.rows) {
      expectedObservationCountByPublication.set(
        row.publicationKey,
        (expectedObservationCountByPublication.get(row.publicationKey) ?? 0) + row.observationCount,
      )
    }
    assert.ok(observationReadback.rows.every((row) => (
      Number(row.observed_count) === expectedObservationCountByPublication.get(row.publication_key)
    )))
    assert.equal(
      callReadback.rows.reduce((sum, row) => sum + Number(row.call_count), 0),
      consumption.runtimeCallCount,
    )
    assert.deepEqual(
      callReadback.rows.map((row) => row.consumer_key).sort(),
      consumption.requiredConsumerKeys,
    )
    report.controlledScopeLifecycle.phases.consumerObservation = {
      status: 'pass',
      consumption,
      observationRows: consumption.observationCount,
      runtimeCallRows: consumption.runtimeCallCount,
      callsByConsumer: callReadback.rows,
    }
    report.mutationStatementCount = mutationGuard.statementCount
    writeJsonAtomic(reportPath, report)

    const fixtureResult = await insertMonitoringFixtures(adminPool, fixture, publications, mutationGuard)
    const publicationKeys = new Set(publications.map((row) => row.publication_key))
    const stableResult = await modules.lifecycle.runDurationLearningRuntimeLifecycleSweep({
      queryExec: runtimeQueryExec,
      candidateProvider: async () => [],
      monitoringProvider: async () => filteredMonitoringCandidates(modules, runtimeQueryExec, publicationKeys),
      checkpointStore: null,
      observedAt: new Date().toISOString(),
    })
    assert.deepEqual(
      {
        monitoringPassed: stableResult.monitoringPassed,
        stablePromoted: stableResult.stablePromoted,
        monitoringFailed: stableResult.monitoringFailed,
        rollbackExecuted: stableResult.rollbackExecuted,
        failed: stableResult.failed,
      },
      { monitoringPassed: PUBLICATION_COUNT, stablePromoted: PUBLICATION_COUNT, monitoringFailed: 0, rollbackExecuted: 0, failed: 0 },
    )
    publications = await readPublications(adminPool, operationPrefix)
    assert.ok(publications.every((row) => row.publication_stage === 'stable' && row.monitoring_status === 'passed'))
    report.controlledScopeLifecycle.phases.monitorAndStable = {
      status: 'pass',
      fixtureRows: fixtureResult,
      lifecycleResult: stableResult,
      stablePublicationCount: publications.length,
    }
    report.mutationStatementCount = mutationGuard.statementCount
    writeJsonAtomic(reportPath, report)

    const forced = await injectForcedRollbackObservations(
      modules,
      runtimeQueryExec,
      approvedObservationQueryExec,
      publications,
    )
    const rollbackResult = await modules.lifecycle.runDurationLearningRuntimeLifecycleSweep({
      queryExec: runtimeQueryExec,
      candidateProvider: async () => [],
      monitoringProvider: async () => filteredMonitoringCandidates(modules, runtimeQueryExec, publicationKeys),
      checkpointStore: null,
      observedAt: new Date().toISOString(),
    })
    assert.deepEqual(
      {
        monitoringFailed: rollbackResult.monitoringFailed,
        rollbackExecuted: rollbackResult.rollbackExecuted,
        stablePromoted: rollbackResult.stablePromoted,
        failed: rollbackResult.failed,
      },
      { monitoringFailed: PUBLICATION_COUNT, rollbackExecuted: PUBLICATION_COUNT, stablePromoted: 0, failed: 0 },
    )
    publications = await readPublications(adminPool, operationPrefix)
    assert.ok(publications.every((row) => row.publication_stage === 'rolled_back' && row.monitoring_status === 'failed'))
    assert.ok(publications.every((row) => row.rollback_execution?.reason))
    report.controlledScopeLifecycle.phases.forcedRollback = {
      status: 'pass',
      failureInjection: forced,
      lifecycleResult: rollbackResult,
      rolledBackPublicationCount: publications.length,
    }
    report.controlledScopeLifecycle.status = 'pass_before_cleanup'
    report.mutationStatementCount = mutationGuard.statementCount
    report.status = 'pass_before_cleanup'
    writeJsonAtomic(reportPath, report)
  } catch (error) {
    failure = error
    report.status = 'fail'
    report.controlledScopeLifecycle.status = mutationGuard.realCoverageVerified
      ? 'fail'
      : 'not_run_real_coverage_incomplete'
    report.mutationStatementCount = mutationGuard.statementCount
    report.error = errorRecord(error)
    writeJsonAtomic(reportPath, report)
  } finally {
    lifecycleState.realCoverageVerified = mutationGuard.realCoverageVerified
    lifecycleState.realCandidateAggregationCoverageProof = mutationGuard.realCandidateAggregationCoverageProof
    lifecycleState.mutationStarted = mutationGuard.mutationStarted
    lifecycleState.mutationStatementCount = mutationGuard.statementCount
    try {
      writeJsonAtomic(statePath, lifecycleState)
    } catch (stateError) {
      report.statePersistence = { status: 'fail', error: errorRecord(stateError) }
      failure ??= stateError
    }
    if (adminPool) {
      try {
        const cleanupPolicy = cleanupPolicyForState(lifecycleState)
        report.cleanup = {
          ...await cleanupOperation(adminPool, operationPrefix, {
            allowMutation: cleanupPolicy.allowMutation,
            mutationGuard,
          }),
          policy: cleanupPolicy,
        }
      } catch (cleanupError) {
        report.cleanup = { status: 'fail', error: errorRecord(cleanupError), residue: null }
        failure ??= cleanupError
      }
    } else {
      report.cleanup = { status: 'not_run', residue: null }
    }
    report.mutationStatementCount = mutationGuard.statementCount
    lifecycleState.mutationStatementCount = mutationGuard.statementCount
    try {
      writeJsonAtomic(statePath, lifecycleState)
    } catch (stateError) {
      report.statePersistence = { status: 'fail', error: errorRecord(stateError) }
      failure ??= stateError
    }
    if (!failure && report.controlledScopeLifecycle.status === 'pass_before_cleanup') {
      report.controlledScopeLifecycle.status = 'pass'
    }
    report.status = !failure && report.cleanup.status === 'pass' ? 'pass' : 'fail'
    report.completedAt = new Date().toISOString()
    writeJsonAtomic(reportPath, report)
    await Promise.allSettled([adminPool?.end(), runtimePool?.end()].filter(Boolean))
  }
  process.stdout.write(`${JSON.stringify({ status: report.status, reportPath, operationPrefix, cleanup: report.cleanup })}\n`)
  if (failure || report.status !== 'pass') throw failure ?? new Error('duration_learning_v2_smoke_failed')
}

async function runCleanup() {
  validateOperationPrefix(operationPrefix)
  assertMandatoryRealAggregationFloor()
  assert.equal(process.env.WORKBUDDY_TARGET_ENVIRONMENT, 'staging', 'cleanup target must be staging')
  const state = readLifecycleState(statePath, { allowMissing: true })
  const cleanupPolicy = cleanupPolicyForState(state)
  if (cleanupPolicy.allowMutation) {
    assert.equal(
      process.env.WORKBUDDY_LEARNING_V2_MUTATION_APPROVED,
      APPROVAL_PHRASE,
      'explicit disposable staging mutation approval phrase is required for cleanup',
    )
  }
  const mutationGuard = createMutationGuard()
  mutationGuard.realCoverageVerified = state.realCoverageVerified
  mutationGuard.mutationStarted = state.mutationStarted
  const adminUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
  const adminPool = createPool(adminUrl, 'MIGRATION_DATABASE_URL_or_DATABASE_URL')
  let result
  try {
    result = await cleanupOperation(adminPool, operationPrefix, {
      allowMutation: cleanupPolicy.allowMutation,
      mutationGuard,
    })
  } finally {
    await adminPool.end()
  }
  const cleanupReportPath = path.resolve(args.get('cleanup-report') ?? `${reportPath}.cleanup.json`)
  writeJsonAtomic(cleanupReportPath, {
    schema: SCHEMA,
    status: result.status,
    mode: 'cleanup',
    operationPrefix,
    statePath,
    stateFilePresent: state.stateFilePresent,
    state: {
      realCoverageVerified: state.realCoverageVerified,
      mutationStarted: state.mutationStarted,
      mutationStatementCount: state.mutationStatementCount,
    },
    cleanupPolicy,
    cleanup: result,
    completedAt: new Date().toISOString(),
  })
  process.stdout.write(`${JSON.stringify({ status: result.status, cleanupReportPath, operationPrefix, residue: result.residue })}\n`)
  if (result.status !== 'pass') throw new Error('duration_learning_v2_cleanup_residue_detected')
}

if (mode === 'self-test') await runSelfTest()
else if (mode === 'run') await runLifecycle()
else if (mode === 'cleanup') await runCleanup()
else throw new Error(`unsupported_mode:${mode}`)
