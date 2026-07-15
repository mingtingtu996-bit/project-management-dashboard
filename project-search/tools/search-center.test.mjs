import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(repoRoot, relativePath), 'utf8'))
}

function runNode(args) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(';') : String(value ?? '')
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

const decisionCsvColumns = [
  'review_item_id',
  'batch_priority',
  'batch_key',
  'asset_uid',
  'family',
  'candidate_key',
  'title',
  'source_key',
  'artifact_path',
  'artifact_verified',
  'promotion_target',
  'review_lane',
  'next_governance_step',
  'allowed_decisions',
  'human_decision',
  'decision_reason',
  'source_checked',
  'mapping_checked',
  'conflict_disposition',
  'replay_evidence_disposition',
  'reviewer',
  'reviewed_at',
  'produces_publication_readiness',
  'produces_replay_input',
  'produces_runtime_asset',
  'produces_business_fact',
  'sample_only',
  'do_not_apply',
  'mutation_boundary',
]

function decisionRow(item, overrides = {}) {
  return {
    review_item_id: item.reviewItemId,
    batch_priority: item.batchPriority,
    batch_key: item.batchKey,
    asset_uid: item.assetUid,
    family: item.family,
    candidate_key: item.candidateKey,
    title: item.title,
    source_key: item.sourceKey,
    artifact_path: item.localArtifactPath,
    artifact_verified: item.localArtifactVerified,
    promotion_target: item.promotionTarget,
    review_lane: item.reviewLane,
    next_governance_step: item.nextGovernanceStep,
    allowed_decisions: item.allowedDecisions,
    human_decision: '',
    decision_reason: '',
    source_checked: '',
    mapping_checked: '',
    conflict_disposition: '',
    replay_evidence_disposition: '',
    reviewer: '',
    reviewed_at: '',
    produces_publication_readiness: false,
    produces_replay_input: false,
    produces_runtime_asset: false,
    produces_business_fact: false,
    sample_only: false,
    do_not_apply: false,
    mutation_boundary: 'test_review_decision_csv_no_db_mutation_no_business_fact_write',
    ...overrides,
  }
}

function filledDecisionRow(item, humanDecision, overrides = {}) {
  return decisionRow(item, {
    human_decision: humanDecision,
    decision_reason: 'reviewed source, mapping, conflict posture, and replay boundary for test fixture',
    source_checked: 'yes',
    mapping_checked: 'yes',
    conflict_disposition: 'no_conflict_or_not_applicable',
    replay_evidence_disposition: 'kept_review_only_no_runtime_write',
    reviewer: 'test-reviewer',
    reviewed_at: '2026-07-03T00:00:00.000Z',
    ...overrides,
  })
}

function decisionCsv(rows) {
  const header = decisionCsvColumns.map(csvCell).join(',')
  const body = rows.map((row) => decisionCsvColumns.map((column) => csvCell(row[column])).join(','))
  return `${[header, ...body].join('\n')}\n`
}

async function withDecisionCsv(rows, callback) {
  const dir = await mkdtemp(join(tmpdir(), 'workbuddy-progress-knowledge-'))
  const file = join(dir, 'decisions.csv')
  try {
    await writeFile(file, decisionCsv(rows), 'utf8')
    return await callback(file)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('project-search center has required governance files and collection folders', async () => {
  const expectedPaths = [
    'project-search/README.md',
    'project-search/skills/workbuddy-project-search/SKILL.md',
    'project-search/plugins/mcp-config/README.md',
    'project-search/plugins/mcp-config/env.example',
    'project-search/plugins/mcp-config/workbuddy-project-search.mcp.example.json',
    'project-search/tools/check-search-center.mjs',
    'project-search/tools/ensure-search-mcp-plugins.mjs',
    'project-search/tools/check-progress-knowledge-sql-boundary.mjs',
    'project-search/tools/audit-progress-knowledge-staging.mjs',
    'project-search/tools/build-progress-knowledge-document-hash-repair.mjs',
    'project-search/tools/build-progress-knowledge-manual-readiness-queue.mjs',
    'project-search/tools/verify-progress-knowledge-p0-triad-source-hashes.mjs',
    'project-search/tools/verify-progress-knowledge-p0-triad-field-consistency.mjs',
    'project-search/tools/build-progress-knowledge-p0-triad-outlier-triage.mjs',
    'project-search/tools/build-progress-knowledge-p0-triad-human-review-package.mjs',
    'project-search/tools/build-progress-knowledge-p1-clause-sequence-human-review-package.mjs',
    'project-search/tools/build-progress-knowledge-p2-duration-quota-human-review-package.mjs',
    'project-search/tools/build-progress-knowledge-asset-catalog.mjs',
    'project-search/tools/query-progress-knowledge-asset-catalog.mjs',
    'project-search/tools/build-progress-knowledge-review-workbench.mjs',
    'project-search/tools/validate-progress-knowledge-review-decisions.mjs',
    'project-search/tools/build-progress-knowledge-sample-review-decisions.mjs',
    'project-search/tools/build-progress-knowledge-review-outcome-report.mjs',
    'project-search/tools/build-progress-knowledge-machine-precheck.mjs',
    'project-search/tools/build-progress-knowledge-priority-evidence-dossier.mjs',
    'project-search/tools/build-progress-knowledge-topic-index.mjs',
    'project-search/tools/query-progress-knowledge-topic-index.mjs',
    'project-search/tools/build-progress-knowledge-domain-packs.mjs',
    'project-search/tools/build-progress-knowledge-retrieval-pack.mjs',
    'project-search/tools/query-progress-knowledge-retrieval-pack.mjs',
    'project-search/tools/build-progress-knowledge-base-manifest.mjs',
    'project-search/tools/check-progress-knowledge-base-health.mjs',
    'project-search/knowledge-base/README.md',
    'project-search/knowledge-base/progress-knowledge-base-manifest.json',
    'project-search/knowledge-base/progress-knowledge-base-manifest.md',
    'project-search/knowledge-base/progress-knowledge-base-health-report.json',
    'project-search/knowledge-base/progress-knowledge-base-health-report.md',
    'project-search/knowledge-base/progress-knowledge-retrieval-pack.json',
    'project-search/knowledge-base/progress-knowledge-retrieval-pack.ndjson',
    'project-search/knowledge-base/progress-knowledge-retrieval-pack.csv',
    'project-search/knowledge-base/progress-knowledge-retrieval-pack.md',
    'project-search/tools/build-progress-knowledge-clause-sequence-review.mjs',
    'project-search/tools/build-progress-knowledge-clause-sequence-candidate-review.mjs',
    'project-search/tools/build-progress-knowledge-clause-sequence-readiness.mjs',
    'project-search/tools/build-progress-knowledge-planned-schedule-field-review.mjs',
    'project-search/tools/build-progress-knowledge-real-project-same-project-pairing.mjs',
    'project-search/tools/build-progress-knowledge-completed-project-triad-candidates.mjs',
    'project-search/external-duration-research',
    'project-search/public-project-data',
    'project-search/knowledge-base',
    'project-search/knowledge-base/domain-packs',
    'project-search/knowledge-base/review-workbench',
    'project-search/inbox',
    'project-search/logs',
  ]

  for (const relativePath of expectedPaths) {
    assert.equal(existsSync(join(repoRoot, relativePath)), true, `${relativePath} should exist`)
  }
})

test('MCP config template keeps keys outside the repository', async () => {
  const config = await readJson('project-search/plugins/mcp-config/workbuddy-project-search.mcp.example.json')
  const text = JSON.stringify(config)

  assert.ok(config.mcpServers['workbuddy-tavily'])
  assert.ok(config.mcpServers['workbuddy-firecrawl'])
  assert.ok(config.mcpServers['workbuddy-exa'])
  assert.doesNotMatch(text, /tvly-[A-Za-z0-9_-]+/)
  assert.doesNotMatch(text, /fc-[A-Za-z0-9_-]+/)
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
})

test('search center check validates the root entrypoint', () => {
  const result = runNode(['project-search/tools/check-search-center.mjs'])

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Search center check passed/)
})

test('progress knowledge generated SQL stays inside governed knowledge tables', () => {
  const result = runNode(['project-search/tools/check-progress-knowledge-sql-boundary.mjs'])

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /progress_knowledge_and_progress_asset_tables_only_no_business_fact_write/)
})

test('progress knowledge source expansion and hash repair carry document content hashes', async () => {
  const sourceExpansionSql = await readFile(
    join(repoRoot, 'project-search/external-duration-research/source-expansion/progress-knowledge-source-expansion-seed.sql'),
    'utf8',
  )
  assert.match(sourceExpansionSql, /content_hash/)
  assert.match(sourceExpansionSql, /content_hash = EXCLUDED\.content_hash/)

  const outputDir = await mkdtemp(join(tmpdir(), 'workbuddy-document-hash-repair-'))
  try {
    const result = runNode([
      'project-search/tools/build-progress-knowledge-document-hash-repair.mjs',
      '--output-dir',
      outputDir,
    ])
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const payload = JSON.parse(result.stdout)
    assert.equal(payload.status, 'passed')
    assert.equal(payload.mutationBoundary, 'progress_knowledge_document_hash_repair_only_no_business_fact_write')
    assert.ok(payload.repairableDocumentCount > 0)

    const repairSql = await readFile(join(outputDir, 'progress-knowledge-document-hash-repair.sql'), 'utf8')
    assert.match(repairSql, /UPDATE public\.progress_knowledge_documents/)
    assert.match(repairSql, /coalesce\(document\.content_hash, ''\) = ''/)
    assert.doesNotMatch(repairSql, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(tasks|task_baselines|monthly_plans|monthly_plan_items|task_dependencies|duration_experience_samples|actual_duration_outcomes|critical_path)\b/i)
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})

test('manual readiness queue stays review-only and prioritizes real project triads', async () => {
  const report = await readJson('project-search/reports/progress-knowledge-manual-readiness-queue.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-manual-readiness-queue/v1')
  assert.equal(report.mutationBoundary, 'manual_readiness_queue_only_no_db_mutation_no_business_fact_write')
  assert.equal(report.summary.queueItemCount, 114)
  assert.equal(report.summary.byFamily.completed_project_triad, 11)
  assert.equal(report.summary.byFamily.clause_sequence, 103)
  assert.equal(report.summary.byPriority.P0, 11)
  assert.equal(report.summary.byPriority.P1, 103)
  assert.equal(report.summary.autoCanaryReadyCount, 0)
  assert.equal(report.summary.enqueueGuardedCanaryReleaseCount, 0)
  assert.equal(report.summary.replayInputWriteCount, 0)
  assert.equal(report.summary.runtimeSampleWriteCount, 0)
  assert.equal(report.summary.businessFactWriteCount, 0)

  assert.equal(report.batches[0].batchKey, 'real_project_replay_realism_field_mapping')
  assert.equal(report.batches[0].count, 11)
  assert.equal(report.items[0].priority, 'P0')
  assert.match(report.items[0].candidateKey, /^completed_project_triad:/)
})

test('P0 triad source hash review verifies local artifacts without runtime writes', async () => {
  const report = await readJson('project-search/reports/progress-knowledge-p0-triad-source-hash-review.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-p0-triad-source-hash-review/v1')
  assert.equal(report.mutationBoundary, 'p0_triad_source_hash_review_only_no_db_mutation_no_business_fact_write')
  assert.equal(report.summary.reviewItemCount, 11)
  assert.equal(report.summary.localArtifactPresentCount, 11)
  assert.equal(report.summary.dbContentHashPresentCount, 11)
  assert.equal(report.summary.sourceMetadataHashPresentCount, 11)
  assert.equal(report.summary.documentHashMatchedCount, 11)
  assert.equal(report.summary.sourceMetadataHashMatchedCount, 11)
  assert.equal(report.summary.fullyVerifiedCount, 11)
  assert.equal(report.summary.missingLocalArtifactCount, 0)
  assert.equal(report.summary.hashMismatchCount, 0)
  assert.equal(report.summary.replayInputWriteCount, 0)
  assert.equal(report.summary.runtimeSampleWriteCount, 0)
  assert.equal(report.summary.businessFactWriteCount, 0)

  for (const item of report.items) {
    assert.match(item.candidateKey, /^completed_project_triad:/)
    assert.equal(item.reviewStatus, 'source_hash_verified_against_staging_and_local_artifact')
  }
})

test('P0 triad field consistency review recomputes durations without approval writes', async () => {
  const report = await readJson('project-search/reports/progress-knowledge-p0-triad-field-consistency-review.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-p0-triad-field-consistency-review/v1')
  assert.equal(report.mutationBoundary, 'p0_triad_field_consistency_review_only_no_db_mutation_no_business_fact_write')
  assert.equal(report.summary.reviewItemCount, 11)
  assert.equal(report.summary.machineFieldConsistencyPassedCount, 11)
  assert.equal(report.summary.blockedCount, 0)
  assert.equal(report.summary.contractDurationMatchCount, 11)
  assert.equal(report.summary.actualDurationMatchCount, 11)
  assert.equal(report.summary.varianceDaysMatchCount, 11)
  assert.equal(report.summary.varianceRatioMatchCount, 11)
  assert.equal(report.summary.calibrationDeviationMatchCount, 11)
  assert.equal(report.summary.scopeScaleReadyCount, 11)
  assert.equal(report.summary.outlierFlaggedCount, 6)
  assert.equal(report.summary.replayInputWriteCount, 0)
  assert.equal(report.summary.runtimeSampleWriteCount, 0)
  assert.equal(report.summary.businessFactWriteCount, 0)

  for (const item of report.items) {
    assert.match(item.candidateKey, /^completed_project_triad:/)
    assert.equal(item.reviewStatus, 'machine_field_consistency_passed_human_review_still_required')
    assert.equal(item.humanReviewStillRequired, true)
  }
})

test('P0 triad outlier triage separates standard review from outlier explanation', async () => {
  const report = await readJson('project-search/reports/progress-knowledge-p0-triad-outlier-triage.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-p0-triad-outlier-triage/v1')
  assert.equal(report.mutationBoundary, 'p0_triad_outlier_triage_review_only_no_db_mutation_no_business_fact_write')
  assert.equal(report.summary.triageItemCount, 11)
  assert.equal(report.summary.sourceHashVerifiedCount, 11)
  assert.equal(report.summary.fieldConsistencyVerifiedCount, 11)
  assert.equal(report.summary.standardHumanFieldReviewReadyCount, 5)
  assert.equal(report.summary.outlierReviewRequiredCount, 6)
  assert.equal(report.summary.highPositiveVarianceCount, 4)
  assert.equal(report.summary.zeroVarianceReviewCount, 1)
  assert.equal(report.summary.negativeVarianceReviewCount, 1)
  assert.equal(report.summary.replayInputWriteCount, 0)
  assert.equal(report.summary.runtimeSampleWriteCount, 0)
  assert.equal(report.summary.businessFactWriteCount, 0)

  const standardItems = report.items.filter((item) => item.triageStatus === 'standard_human_field_review_ready')
  const outlierItems = report.items.filter((item) => item.triageStatus !== 'standard_human_field_review_ready')
  assert.equal(standardItems.length, 5)
  assert.equal(outlierItems.length, 6)
})

test('P0 triad human review package keeps 11 assets manual and review-only', async () => {
  const report = await readJson('project-search/reports/progress-knowledge-p0-triad-human-review-decision-package.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-p0-triad-human-review-decision-package/v1')
  assert.equal(report.mutationBoundary, 'p0_triad_human_review_package_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(report.summary.totalReviewAssets, 11)
  assert.equal(report.summary.standardHumanReviewAssets, 5)
  assert.equal(report.summary.outlierExplanationAssets, 6)
  assert.equal(report.summary.sourceHashVerifiedCount, 11)
  assert.equal(report.summary.fieldConsistencyVerifiedCount, 11)
  assert.equal(report.summary.scopeScaleReadyCount, 11)
  assert.equal(report.summary.pendingManualReviewCount, 11)
  assert.equal(report.summary.approvedForReplayInputCount, 0)
  assert.equal(report.summary.autoCanaryReadyCount, 0)
  assert.equal(report.summary.replayInputWriteCount, 0)
  assert.equal(report.summary.runtimeSampleWriteCount, 0)
  assert.equal(report.summary.businessFactWriteCount, 0)

  assert.equal(report.standardHumanReviewQueue.length, 5)
  assert.equal(report.outlierExplanationWorklist.length, 6)

  for (const item of report.items) {
    assert.match(item.candidateKey, /^completed_project_triad:/)
    assert.equal(item.humanDecisionStatus, 'pending_manual_review')
    assert.equal(item.humanReviewStillRequired, true)
    assert.equal(item.approvedForReplayInput, false)
    assert.equal(item.replayInputWritten, false)
    assert.equal(item.runtimeSampleWritten, false)
    assert.equal(item.businessFactWritten, false)
    assert.equal(item.autoCanaryReady, false)
    assert.ok(item.reviewQuestions.length >= 2)
    assert.ok(item.decisionOptions.length >= 3)
  }
})

test('P1 clause sequence human review package keeps 103 assets manual and review-only', async () => {
  const report = await readJson('project-search/reports/progress-knowledge-p1-clause-sequence-human-review-decision-package.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-p1-clause-sequence-human-review-decision-package/v1')
  assert.equal(report.mutationBoundary, 'p1_clause_sequence_human_review_package_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(report.summary.totalReviewAssets, 103)
  assert.equal(report.summary.constructionOrganizationAssumptionAssets, 51)
  assert.equal(report.summary.processConstraintRuleAssets, 22)
  assert.equal(report.summary.durationContextFactorAssets, 30)
  assert.equal(report.summary.localArtifactPresentCount, 103)
  assert.equal(report.summary.localArtifactHashMatchedCount, 103)
  assert.equal(report.summary.pendingManualReviewCount, 103)
  assert.equal(report.summary.ambiguousMappingCount, 103)
  assert.equal(report.summary.needsRuntimeSampleCount, 103)
  assert.equal(report.summary.approvedForShadowMappingCount, 0)
  assert.equal(report.summary.approvedForReplayInputCount, 0)
  assert.equal(report.summary.autoCanaryReadyCount, 0)
  assert.equal(report.summary.replayInputWriteCount, 0)
  assert.equal(report.summary.runtimeAssetWriteCount, 0)
  assert.equal(report.summary.businessFactWriteCount, 0)
  assert.equal(report.itemsByPromotionTarget.construction_organization_assumption.length, 51)
  assert.equal(report.itemsByPromotionTarget.process_constraint_rule.length, 22)
  assert.equal(report.itemsByPromotionTarget.duration_context_factor.length, 30)

  for (const item of report.items) {
    assert.match(item.candidateKey, /^clause-sequence\./)
    assert.equal(item.localArtifactPresent, true)
    assert.equal(item.localArtifactHashMatched, true)
    assert.equal(item.humanDecisionStatus, 'pending_manual_review')
    assert.equal(item.approvedForShadowMapping, false)
    assert.equal(item.approvedForReplayInput, false)
    assert.equal(item.replayInputWritten, false)
    assert.equal(item.runtimeAssetWritten, false)
    assert.equal(item.businessFactWritten, false)
    assert.equal(item.autoCanaryReady, false)
    assert.ok(item.reviewQuestions.length >= 4)
    assert.ok(item.decisionOptions.length >= 5)
  }
})

test('P2 duration quota human review package keeps 385 assets manual and review-only', async () => {
  const report = await readJson('project-search/reports/progress-knowledge-p2-duration-quota-human-review-decision-package.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-p2-duration-quota-human-review-decision-package/v1')
  assert.equal(report.mutationBoundary, 'p2_duration_quota_human_review_package_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(report.summary.totalReviewAssets, 385)
  assert.equal(report.summary.approvedDocumentCount, 3)
  assert.equal(report.summary.skippedDocumentCount, 1)
  assert.equal(report.summary.calibrationResultCount, 385)
  assert.equal(report.summary.publicationReadinessCount, 0)
  assert.equal(report.summary.conflictGroupCount, 118)
  assert.equal(report.summary.localArtifactPresentCount, 385)
  assert.equal(report.summary.localArtifactHashMatchedCount, 385)
  assert.equal(report.summary.userReviewedPagesApprovedCount, 385)
  assert.equal(report.summary.tableCellsUserValidatedCount, 385)
  assert.equal(report.summary.matchedExistingAssetCount, 385)
  assert.equal(report.summary.needsRuntimeSampleCount, 385)
  assert.equal(report.summary.pendingManualReviewCount, 385)
  assert.equal(report.summary.manualGovernanceRequiredCount, 193)
  assert.equal(report.summary.blockedCount, 192)
  assert.equal(report.summary.noConflictCount, 58)
  assert.equal(report.summary.regionalVariantConflictCount, 135)
  assert.equal(report.summary.duplicateScopeReviewRequiredCount, 192)
  assert.equal(report.summary.approvedForPublicationReadinessCount, 0)
  assert.equal(report.summary.approvedForReplayInputCount, 0)
  assert.equal(report.summary.autoCanaryReadyCount, 0)
  assert.equal(report.summary.replayInputWriteCount, 0)
  assert.equal(report.summary.runtimeAssetWriteCount, 0)
  assert.equal(report.summary.businessFactWriteCount, 0)
  assert.equal(report.itemsByConflictStatus.no_conflict.length, 58)
  assert.equal(report.itemsByConflictStatus.regional_variant_conflict.length, 135)
  assert.equal(report.itemsByConflictStatus.duplicate_scope_review_required.length, 192)

  for (const item of report.items) {
    assert.equal(item.localArtifactPresent, true)
    assert.equal(item.localArtifactHashMatched, true)
    assert.equal(item.userReviewedPagesApproved, true)
    assert.equal(item.extractionStatus, 'table_cells_user_validated')
    assert.equal(item.mappingStatus, 'matched_existing_asset')
    assert.equal(item.replayStatus, 'needs_runtime_sample')
    assert.equal(item.humanDecisionStatus, 'pending_manual_review')
    assert.equal(item.approvedForPublicationReadiness, false)
    assert.equal(item.approvedForReplayInput, false)
    assert.equal(item.replayInputWritten, false)
    assert.equal(item.runtimeAssetWritten, false)
    assert.equal(item.businessFactWritten, false)
    assert.equal(item.autoCanaryReady, false)
    assert.ok(item.reviewQuestions.length >= 4)
    assert.ok(item.decisionOptions.length >= 5)
  }
})

test('progress knowledge asset catalog indexes all 499 governed assets without publication writes', async () => {
  const report = await readJson('project-search/knowledge-base/progress-knowledge-asset-catalog.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-asset-catalog/v1')
  assert.equal(report.mutationBoundary, 'knowledge_base_index_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(report.summary.totalAssets, 499)
  assert.equal(report.summary.indexedReviewOnlyAssets, 499)
  assert.equal(report.summary.localArtifactVerifiedCount, 499)
  assert.equal(report.summary.pendingManualReviewCount, 499)
  assert.equal(report.summary.approvedForReplayInputCount, 0)
  assert.equal(report.summary.autoCanaryReadyCount, 0)
  assert.equal(report.summary.replayInputWriteCount, 0)
  assert.equal(report.summary.runtimeAssetWriteCount, 0)
  assert.equal(report.summary.businessFactWriteCount, 0)
  assert.deepEqual(report.summary.byPriority, { P0: 11, P1: 103, P2: 385 })
  assert.deepEqual(report.summary.byFamily, {
    completed_project_triad: 11,
    clause_sequence: 103,
    duration_quota_extracted_tables: 385,
  })
  assert.equal(report.summary.byReviewLane.standard_human_review_queue, 5)
  assert.equal(report.summary.byReviewLane.outlier_explanation_worklist, 6)
  assert.equal(report.summary.byReviewLane.construction_organization_assumption_review_queue, 51)
  assert.equal(report.summary.byReviewLane.process_constraint_rule_review_queue, 22)
  assert.equal(report.summary.byReviewLane.duration_context_factor_review_queue, 30)
  assert.equal(report.summary.byReviewLane.no_conflict_mapping_review_queue, 58)
  assert.equal(report.summary.byReviewLane.regional_variant_conflict_review_queue, 135)
  assert.equal(report.summary.byReviewLane.duplicate_scope_review_queue, 192)

  for (const asset of report.assets) {
    assert.match(asset.assetUid, /^P[0-2]:/)
    assert.ok(asset.candidateKey)
    assert.equal(asset.localArtifactVerified, true)
    assert.equal(asset.reviewStatus, 'pending_manual_review')
    assert.equal(asset.autoCanaryReady, false)
    assert.equal(asset.replayInputWritten, false)
    assert.equal(asset.runtimeAssetWritten, false)
    assert.equal(asset.businessFactWritten, false)
    assert.ok(asset.nextGovernanceStep)
    assert.ok(asset.searchText)
  }
})

test('progress knowledge asset catalog query is read-only and filters indexed assets', () => {
  const durationResult = runNode([
    'project-search/tools/query-progress-knowledge-asset-catalog.mjs',
    '--family',
    'duration_quota_extracted_tables',
    '--q',
    '带形基础',
    '--limit',
    '3',
    '--json',
  ])
  assert.equal(durationResult.status, 0, `${durationResult.stdout}\n${durationResult.stderr}`)
  const durationPayload = JSON.parse(durationResult.stdout)
  assert.equal(durationPayload.status, 'passed')
  assert.equal(durationPayload.mutationBoundary, 'read_only_knowledge_base_catalog_query_no_db_mutation_no_business_fact_write')
  assert.ok(durationPayload.matchedCount > 0)
  assert.equal(durationPayload.items.length, 3)
  for (const item of durationPayload.items) {
    assert.equal(item.family, 'duration_quota_extracted_tables')
    assert.equal(item.localArtifactVerified, true)
  }

  const triadResult = runNode([
    'project-search/tools/query-progress-knowledge-asset-catalog.mjs',
    '--priority',
    'P0',
    '--q',
    '朝阳公馆',
    '--limit',
    '10',
    '--json',
  ])
  assert.equal(triadResult.status, 0, `${triadResult.stdout}\n${triadResult.stderr}`)
  const triadPayload = JSON.parse(triadResult.stdout)
  assert.equal(triadPayload.status, 'passed')
  assert.ok(triadPayload.matchedCount >= 2)
  for (const item of triadPayload.items) {
    assert.equal(item.priority, 'P0')
  }
})

test('progress knowledge review workbench creates blank governed decision batches', async () => {
  const report = await readJson('project-search/knowledge-base/review-workbench/progress-knowledge-review-workbench.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-review-workbench/v1')
  assert.equal(report.mutationBoundary, 'review_workbench_templates_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(report.summary.totalReviewItems, 499)
  assert.equal(report.summary.pendingDecisionCount, 499)
  assert.equal(report.summary.publicationReadinessProducedCount, 0)
  assert.equal(report.summary.replayInputProducedCount, 0)
  assert.equal(report.summary.runtimeAssetProducedCount, 0)
  assert.equal(report.summary.businessFactProducedCount, 0)
  assert.deepEqual(report.summary.byBatch, {
    p0_immediate_real_project_review: 11,
    p2_no_conflict_mapping_first_pass: 58,
    p1_clause_sequence_mapping_review: 103,
    p2_conflict_resolution_review: 327,
  })

  assert.equal(report.batchPlan.length, 4)
  assert.deepEqual(report.batchPlan.map((batch) => batch.batchKey), [
    'p0_immediate_real_project_review',
    'p2_no_conflict_mapping_first_pass',
    'p1_clause_sequence_mapping_review',
    'p2_conflict_resolution_review',
  ])

  for (const item of report.items) {
    assert.match(item.reviewItemId, /^review-\d{4}$/)
    assert.ok(item.assetUid)
    assert.equal(item.localArtifactVerified, true)
    assert.equal(item.humanDecision, '')
    assert.equal(item.decisionReason, '')
    assert.equal(item.producesPublicationReadiness, false)
    assert.equal(item.producesReplayInput, false)
    assert.equal(item.producesRuntimeAsset, false)
    assert.equal(item.producesBusinessFact, false)
    assert.ok(item.allowedDecisions.length >= 5)
    assert.ok(item.requiredReviewerFields.includes('humanDecision'))
  }
})

test('progress knowledge review decision validation keeps blank decisions pending and non-mutating', () => {
  const result = runNode(['project-search/tools/validate-progress-knowledge-review-decisions.mjs', '--json'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.mutationBoundary, 'review_decision_validation_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(payload.summary.decisionRowCount, 499)
  assert.equal(payload.summary.missingWorkbenchItemCount, 0)
  assert.equal(payload.summary.pendingDecisionCount, 499)
  assert.equal(payload.summary.validDecisionCount, 0)
  assert.equal(payload.summary.invalidDecisionCount, 0)
  assert.equal(payload.summary.publicationReadinessProducedCount, 0)
  assert.equal(payload.summary.replayInputProducedCount, 0)
  assert.equal(payload.summary.runtimeAssetProducedCount, 0)
  assert.equal(payload.summary.businessFactProducedCount, 0)
  assert.deepEqual(payload.summary.byBatch, {
    p0_immediate_real_project_review: 11,
    p2_no_conflict_mapping_first_pass: 58,
    p1_clause_sequence_mapping_review: 103,
    p2_conflict_resolution_review: 327,
  })
})

test('progress knowledge sample review decisions are example-only and rejected as real input', async () => {
  const result = runNode(['project-search/tools/build-progress-knowledge-sample-review-decisions.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.mutationBoundary, 'sample_review_decisions_only_not_applicable_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(payload.summary.sampleDecisionRows, 3)
  assert.equal(payload.summary.actualHumanDecisionsWritten, 0)
  assert.equal(payload.summary.runtimeAssetProduced, 0)
  assert.equal(existsSync(join(repoRoot, payload.csvSamplePath)), true)

  const validation = runNode([
    'project-search/tools/validate-progress-knowledge-review-decisions.mjs',
    '--decisions-file',
    payload.csvSamplePath,
    '--json',
  ])
  assert.notEqual(validation.status, 0, `${validation.stdout}\n${validation.stderr}`)

  const validationReport = await readJson('project-search/knowledge-base/review-workbench/progress-knowledge-review-decision-validation.json')
  assert.ok(validationReport.items.some((item) => item.errors.includes('non_applicable_example_row:sample_only')))
  assert.ok(validationReport.items.some((item) => item.errors.includes('non_applicable_example_row:do_not_apply')))
})

test('progress knowledge review outcome report keeps blank template pending and non-mutating', () => {
  const result = runNode(['project-search/tools/build-progress-knowledge-review-outcome-report.mjs', '--json'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.mutationBoundary, 'review_outcome_report_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(payload.summary.decisionRowCount, 499)
  assert.equal(payload.summary.pendingDecisionCount, 499)
  assert.equal(payload.summary.validDecisionCount, 0)
  assert.equal(payload.summary.invalidDecisionCount, 0)
  assert.equal(payload.summary.acceptedButNotWrittenCount, 0)
  assert.equal(payload.summary.publicationReadinessProducedCount, 0)
  assert.equal(payload.summary.replayInputProducedCount, 0)
  assert.equal(payload.summary.runtimeAssetProducedCount, 0)
  assert.equal(payload.summary.businessFactProducedCount, 0)
})

test('progress knowledge review outcome report accepts partial real decisions as report-only outcomes', async () => {
  const workbench = await readJson('project-search/knowledge-base/review-workbench/progress-knowledge-review-workbench.json')
  const p0Item = workbench.items.find((item) => item.batchKey === 'p0_immediate_real_project_review')
  const p2Item = workbench.items.find((item) => item.batchKey === 'p2_no_conflict_mapping_first_pass')

  assert.ok(p0Item)
  assert.ok(p2Item)

  await withDecisionCsv([
    filledDecisionRow(p0Item, 'approve_for_replay_candidate'),
    filledDecisionRow(p2Item, 'needs_project_sample_replay'),
  ], async (file) => {
    const result = runNode([
      'project-search/tools/build-progress-knowledge-review-outcome-report.mjs',
      '--decisions-file',
      file,
      '--json',
    ])
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

    const payload = JSON.parse(result.stdout)
    assert.equal(payload.status, 'passed')
    assert.equal(payload.summary.decisionRowCount, 2)
    assert.equal(payload.summary.pendingDecisionCount, 0)
    assert.equal(payload.summary.validDecisionCount, 2)
    assert.equal(payload.summary.invalidDecisionCount, 0)
    assert.equal(payload.summary.acceptedButNotWrittenCount, 2)
    assert.equal(payload.summary.publicationReadinessProducedCount, 0)
    assert.equal(payload.summary.replayInputProducedCount, 0)
    assert.equal(payload.summary.runtimeAssetProducedCount, 0)
    assert.equal(payload.summary.businessFactProducedCount, 0)
    assert.equal(payload.summary.byDecision.approve_for_replay_candidate, 1)
    assert.equal(payload.summary.byDecision.needs_project_sample_replay, 1)
  })
})

test('progress knowledge review decision validation rejects unsafe or incoherent decisions', async () => {
  const workbench = await readJson('project-search/knowledge-base/review-workbench/progress-knowledge-review-workbench.json')
  const [first, second, third, fourth] = workbench.items

  const scenarios = [
    {
      name: 'invalid decision value',
      expectedError: 'human_decision_not_allowed_for_batch',
      mutate(rows) {
        rows[0] = filledDecisionRow(first, 'not_a_real_decision')
      },
    },
    {
      name: 'missing required field',
      expectedError: 'required_field_missing:decision_reason',
      mutate(rows) {
        rows[1] = filledDecisionRow(second, second.allowedDecisions[0], { decision_reason: '' })
      },
    },
    {
      name: 'forbidden runtime output flag',
      expectedError: 'forbidden_production_output_flag:produces_runtime_asset',
      mutate(rows) {
        rows[2] = filledDecisionRow(third, third.allowedDecisions[0], { produces_runtime_asset: true })
      },
    },
    {
      name: 'mismatched asset uid',
      expectedError: 'asset_uid_mismatch',
      mutate(rows) {
        rows[3] = filledDecisionRow(fourth, fourth.allowedDecisions[0], { asset_uid: 'wrong-asset-uid' })
      },
    },
  ]

  for (const scenario of scenarios) {
    const rows = workbench.items.map((item) => decisionRow(item))
    scenario.mutate(rows)

    await withDecisionCsv(rows, async (file) => {
      const result = runNode([
        'project-search/tools/validate-progress-knowledge-review-decisions.mjs',
        '--decisions-file',
        file,
        '--json',
      ])
      assert.notEqual(result.status, 0, `${scenario.name}\n${result.stdout}\n${result.stderr}`)

      const payload = JSON.parse(result.stdout)
      assert.equal(payload.summary.invalidDecisionCount, 1, scenario.name)

      const report = await readJson('project-search/knowledge-base/review-workbench/progress-knowledge-review-decision-validation.json')
      const invalidItems = report.items.filter((item) => item.status === 'invalid')
      assert.equal(invalidItems.length, 1, scenario.name)
      assert.ok(invalidItems[0].errors.includes(scenario.expectedError), scenario.name)
      assert.equal(report.summary.runtimeAssetProducedCount, 0)
      assert.equal(report.summary.businessFactProducedCount, 0)
    })
  }
})

test('progress knowledge machine precheck suggests review order without writing decisions', async () => {
  const report = await readJson('project-search/knowledge-base/review-workbench/progress-knowledge-machine-precheck.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-machine-precheck/v1')
  assert.equal(report.mutationBoundary, 'machine_precheck_reviewer_assist_only_no_human_decision_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(report.summary.totalPrecheckItems, 499)
  assert.equal(report.summary.priorityReviewAssistCount, 69)
  assert.equal(report.summary.firstPassReadyWithoutConflictCount, 63)
  assert.equal(report.summary.outlierExplanationRequiredCount, 6)
  assert.equal(report.summary.clauseMappingOwnerReviewRequiredCount, 103)
  assert.equal(report.summary.regionalVariantConflictResolutionRequiredCount, 135)
  assert.equal(report.summary.duplicateScopeResolutionRequiredCount, 192)
  assert.equal(report.summary.humanDecisionWrittenCount, 0)
  assert.equal(report.summary.publicationReadinessProducedCount, 0)
  assert.equal(report.summary.replayInputProducedCount, 0)
  assert.equal(report.summary.runtimeAssetProducedCount, 0)
  assert.equal(report.summary.businessFactProducedCount, 0)
  assert.deepEqual(report.summary.byMachinePrecheckCategory, {
    first_pass_ready_standard_real_project: 5,
    outlier_explanation_required_real_project: 6,
    first_pass_ready_duration_quota_no_conflict: 58,
    clause_mapping_owner_review_required: 103,
    regional_variant_conflict_resolution_required: 135,
    duplicate_scope_resolution_required: 192,
  })
  assert.equal(report.priorityReviewAssistItems.length, 69)

  for (const item of report.items) {
    assert.equal(item.notHumanDecision, true)
    assert.equal(item.machineSuggestedDecision, null)
    assert.equal(item.humanDecisionWritten, false)
    assert.equal(item.publicationReadinessProduced, false)
    assert.equal(item.replayInputProduced, false)
    assert.equal(item.runtimeAssetProduced, false)
    assert.equal(item.businessFactProduced, false)
    assert.ok(item.suggestedReviewerAction)
    assert.ok(item.evidenceStillRequired.length > 0)
  }
})

test('progress knowledge priority evidence dossier packages evidence without writing decisions', async () => {
  const report = await readJson('project-search/knowledge-base/review-workbench/progress-knowledge-priority-evidence-dossier.json')

  assert.equal(report.schemaVersion, 'progress-knowledge-priority-evidence-dossier/v1')
  assert.equal(report.mutationBoundary, 'priority_evidence_dossier_only_no_human_decision_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(report.summary.dossierItemCount, 69)
  assert.equal(report.summary.evidenceMissingCount, 0)
  assert.equal(report.summary.p0DossierItemCount, 11)
  assert.equal(report.summary.p2NoConflictDossierItemCount, 58)
  assert.equal(report.summary.standardRealProjectCount, 5)
  assert.equal(report.summary.outlierRealProjectCount, 6)
  assert.equal(report.summary.durationQuotaNoConflictCount, 58)
  assert.equal(report.summary.humanDecisionWrittenCount, 0)
  assert.equal(report.summary.publicationReadinessProducedCount, 0)
  assert.equal(report.summary.replayInputProducedCount, 0)
  assert.equal(report.summary.runtimeAssetProducedCount, 0)
  assert.equal(report.summary.businessFactProducedCount, 0)

  for (const item of report.items) {
    assert.equal(item.notHumanDecision, true)
    assert.equal(item.humanDecisionWritten, false)
    assert.equal(item.publicationReadinessProduced, false)
    assert.equal(item.replayInputProduced, false)
    assert.equal(item.runtimeAssetProduced, false)
    assert.equal(item.businessFactProduced, false)
    assert.equal(item.evidence.evidenceMissing, false)
    assert.ok(item.evidence.localArtifactPath)
    assert.ok(item.evidence.sourceLocator)
    assert.ok(item.evidence.extractedFacts)
    assert.ok(item.evidence.reviewQuestions.length > 0)
    assert.ok(item.allowedHumanDecisions.length > 0)
  }
})

test('progress knowledge topic index turns all governed assets into searchable cards without runtime writes', async () => {
  const buildResult = runNode(['project-search/tools/build-progress-knowledge-topic-index.mjs'])
  assert.equal(buildResult.status, 0, `${buildResult.stdout}\n${buildResult.stderr}`)

  const payload = JSON.parse(buildResult.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.mutationBoundary, 'knowledge_topic_index_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(payload.summary.knowledgeCardCount, 499)
  assert.equal(payload.summary.topicCount, 267)
  assert.equal(payload.summary.sourceCatalogAssetCount, 499)
  assert.equal(payload.summary.priorityFirstPassCardCount, 69)
  assert.equal(payload.summary.p0RealProjectCaseCards, 11)
  assert.equal(payload.summary.p1ClauseSequenceCards, 103)
  assert.equal(payload.summary.p2DurationQuotaCards, 385)
  assert.equal(payload.summary.localArtifactVerifiedCount, 499)
  assert.equal(payload.summary.pendingManualReviewCount, 499)
  assert.equal(payload.summary.humanDecisionWrittenCount, 0)
  assert.equal(payload.summary.publicationReadinessProducedCount, 0)
  assert.equal(payload.summary.replayInputProducedCount, 0)
  assert.equal(payload.summary.runtimeAssetProducedCount, 0)
  assert.equal(payload.summary.businessFactProducedCount, 0)
  assert.equal(payload.summary.autoCanaryReadyCount, 0)

  const report = await readJson('project-search/knowledge-base/progress-knowledge-topic-index.json')
  assert.equal(report.schemaVersion, 'progress-knowledge-topic-index/v2')
  assert.equal(report.sourceScope, 'asset_catalog_499_items')
  assert.deepEqual(report.summary.byFamily, {
    completed_project_triad: 11,
    clause_sequence: 103,
    duration_quota_extracted_tables: 385,
  })
  assert.deepEqual(report.summary.byRegion, {
    'CN-HN': 11,
    'CN-UNKNOWN': 103,
    'CN-BJ': 37,
    'CN-GD': 127,
    'CN-JS': 221,
  })

  const topicIds = new Set(report.topics.map((topic) => topic.topicId))
  assert.equal(topicIds.has('family:completed_project_triad'), true)
  assert.equal(topicIds.has('family:clause_sequence'), true)
  assert.equal(topicIds.has('family:duration_quota_extracted_tables'), true)
  assert.equal(topicIds.has('clause_category:process_sequence_and_interleaving'), true)
  assert.equal(topicIds.has('conflict_status:regional_variant_conflict'), true)
  assert.equal(topicIds.has('duration_quota:CN-BJ:civil_building_no_basement:below_zero_no_basement'), true)
  assert.equal(topicIds.has('duration_quota:CN-GD:residential_building:above_zero_residential'), true)

  for (const card of report.cards) {
    assert.match(card.knowledgeCardId, /^kb-card-review-\d{4}$/)
    assert.equal(card.governanceStatus, 'pending_manual_review')
    assert.equal(card.humanDecisionWritten, false)
    assert.equal(card.publicationReadinessProduced, false)
    assert.equal(card.replayInputProduced, false)
    assert.equal(card.runtimeAssetProduced, false)
    assert.equal(card.businessFactProduced, false)
    assert.equal(card.autoCanaryReady, false)
    assert.ok(card.summaryText)
    assert.ok(card.topicIds.length >= 5)
    assert.ok(card.searchText)
  }
})

test('progress knowledge topic index query filters cards and topics read-only', () => {
  const regionPhaseResult = runNode([
    'project-search/tools/query-progress-knowledge-topic-index.mjs',
    '--region',
    'CN-GD',
    '--phase',
    'below_zero_basement',
    '--limit',
    '5',
    '--json',
  ])
  assert.equal(regionPhaseResult.status, 0, `${regionPhaseResult.stdout}\n${regionPhaseResult.stderr}`)
  const regionPhasePayload = JSON.parse(regionPhaseResult.stdout)
  assert.equal(regionPhasePayload.status, 'passed')
  assert.equal(regionPhasePayload.mutationBoundary, 'read_only_knowledge_topic_index_query_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(regionPhasePayload.cards.length, 5)
  assert.ok(regionPhasePayload.cardsMatchedCount >= 5)
  for (const card of regionPhasePayload.cards) {
    assert.equal(card.regionCode, 'CN-GD')
    assert.equal(card.phaseCode, 'below_zero_basement')
    assert.equal(card.governanceStatus, 'pending_manual_review')
  }

  const topicResult = runNode([
    'project-search/tools/query-progress-knowledge-topic-index.mjs',
    '--topic',
    'duration_quota:CN-BJ:civil_building_no_basement:below_zero_no_basement',
    '--json',
  ])
  assert.equal(topicResult.status, 0, `${topicResult.stdout}\n${topicResult.stderr}`)
  const topicPayload = JSON.parse(topicResult.stdout)
  assert.equal(topicPayload.status, 'passed')
  assert.equal(topicPayload.topicsMatchedCount, 1)
  assert.ok(topicPayload.cardsMatchedCount >= 4)
  for (const card of topicPayload.cards) {
    assert.ok(card.topicIds.includes('duration_quota:CN-BJ:civil_building_no_basement:below_zero_no_basement'))
  }

  const clauseResult = runNode([
    'project-search/tools/query-progress-knowledge-topic-index.mjs',
    '--family',
    'clause_sequence',
    '--q',
    '施工顺序',
    '--limit',
    '5',
    '--json',
  ])
  assert.equal(clauseResult.status, 0, `${clauseResult.stdout}\n${clauseResult.stderr}`)
  const clausePayload = JSON.parse(clauseResult.stdout)
  assert.equal(clausePayload.status, 'passed')
  assert.equal(clausePayload.cards.length, 5)
  assert.ok(clausePayload.cardsMatchedCount >= 5)
  for (const card of clausePayload.cards) {
    assert.equal(card.family, 'clause_sequence')
    assert.equal(card.cardType, 'clause_sequence_card')
    assert.equal(card.conflictStatus, 'ambiguous_mapping')
  }

  const conflictResult = runNode([
    'project-search/tools/query-progress-knowledge-topic-index.mjs',
    '--conflict-status',
    'regional_variant_conflict',
    '--region',
    'CN-BJ',
    '--limit',
    '5',
    '--json',
  ])
  assert.equal(conflictResult.status, 0, `${conflictResult.stdout}\n${conflictResult.stderr}`)
  const conflictPayload = JSON.parse(conflictResult.stdout)
  assert.equal(conflictPayload.status, 'passed')
  assert.equal(conflictPayload.cards.length, 5)
  assert.ok(conflictPayload.cardsMatchedCount >= 5)
  for (const card of conflictPayload.cards) {
    assert.equal(card.regionCode, 'CN-BJ')
    assert.equal(card.conflictStatus, 'regional_variant_conflict')
  }

  const realProjectResult = runNode([
    'project-search/tools/query-progress-knowledge-topic-index.mjs',
    '--q',
    '朝阳公馆',
    '--card-type',
    'real_project_case_card',
    '--json',
  ])
  assert.equal(realProjectResult.status, 0, `${realProjectResult.stdout}\n${realProjectResult.stderr}`)
  const realProjectPayload = JSON.parse(realProjectResult.stdout)
  assert.equal(realProjectPayload.status, 'passed')
  assert.equal(realProjectPayload.cardsMatchedCount, 2)
  for (const card of realProjectPayload.cards) {
    assert.equal(card.cardType, 'real_project_case_card')
    assert.match(card.title, /朝阳公馆/)
    assert.equal(card.regionCode, 'CN-HN')
  }
})

test('progress knowledge domain packs split all cards into review-only usable bundles', async () => {
  const result = runNode(['project-search/tools/build-progress-knowledge-domain-packs.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.mutationBoundary, 'knowledge_domain_packs_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(payload.summary.packCount, 3)
  assert.equal(payload.summary.totalCards, 499)
  assert.equal(payload.summary.localArtifactVerifiedCount, 499)
  assert.equal(payload.summary.pendingManualReviewCount, 499)
  assert.equal(payload.summary.humanDecisionWrittenCount, 0)
  assert.equal(payload.summary.publicationReadinessProducedCount, 0)
  assert.equal(payload.summary.replayInputProducedCount, 0)
  assert.equal(payload.summary.runtimeAssetProducedCount, 0)
  assert.equal(payload.summary.businessFactProducedCount, 0)
  assert.equal(payload.summary.autoCanaryReadyCount, 0)

  const summary = await readJson('project-search/knowledge-base/domain-packs/progress-knowledge-domain-packs-summary.json')
  assert.equal(summary.schemaVersion, 'progress-knowledge-domain-packs-summary/v1')
  assert.deepEqual(summary.packs.map((pack) => pack.domainKey), [
    'real_project_cases',
    'construction_organization_clauses',
    'duration_quota_rows',
  ])
  assert.deepEqual(summary.packs.map((pack) => pack.summary.cardCount), [11, 103, 385])

  const realProjects = await readJson('project-search/knowledge-base/domain-packs/progress-knowledge-real-project-cases.json')
  const clauses = await readJson('project-search/knowledge-base/domain-packs/progress-knowledge-construction-organization-clauses.json')
  const duration = await readJson('project-search/knowledge-base/domain-packs/progress-knowledge-duration-quota-rows.json')

  assert.equal(realProjects.summary.byFamily.completed_project_triad, 11)
  assert.equal(realProjects.summary.byReviewLane.standard_human_review_queue, 5)
  assert.equal(realProjects.summary.byReviewLane.outlier_explanation_worklist, 6)
  assert.equal(clauses.summary.byFamily.clause_sequence, 103)
  assert.equal(clauses.summary.byConflictStatus.ambiguous_mapping, 103)
  assert.equal(duration.summary.byFamily.duration_quota_extracted_tables, 385)
  assert.equal(duration.summary.byConflictStatus.no_conflict, 58)
  assert.equal(duration.summary.byConflictStatus.regional_variant_conflict, 135)
  assert.equal(duration.summary.byConflictStatus.duplicate_scope_review_required, 192)

  for (const pack of [realProjects, clauses, duration]) {
    assert.equal(pack.mutationBoundary, 'knowledge_domain_packs_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
    assert.equal(pack.summary.pendingManualReviewCount, pack.summary.cardCount)
    assert.equal(pack.summary.runtimeAssetProducedCount, 0)
    assert.equal(pack.summary.businessFactProducedCount, 0)
    for (const card of pack.cards) {
      assert.equal(card.governanceStatus, 'pending_manual_review')
      assert.equal(card.humanDecisionWritten, false)
      assert.equal(card.publicationReadinessProduced, false)
      assert.equal(card.replayInputProduced, false)
      assert.equal(card.runtimeAssetProduced, false)
      assert.equal(card.businessFactProduced, false)
      assert.ok(card.summaryText)
      assert.ok(card.localArtifactPath)
    }
  }
})

test('progress knowledge retrieval pack provides compact read-only cards', async () => {
  const result = runNode(['project-search/tools/build-progress-knowledge-retrieval-pack.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.mutationBoundary, 'knowledge_retrieval_pack_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(payload.summary.retrievalCardCount, 499)
  assert.equal(payload.summary.sourceTopicIndexCardCount, 499)
  assert.equal(payload.summary.sourceTopicCount, 267)
  assert.equal(payload.summary.firstPassReviewCardCount, 69)
  assert.equal(payload.summary.heldForLaterReviewCardCount, 430)
  assert.equal(payload.summary.localArtifactVerifiedCount, 499)
  assert.equal(payload.summary.pendingManualReviewCount, 499)
  assert.equal(payload.summary.humanDecisionWrittenCount, 0)
  assert.equal(payload.summary.publicationReadinessProducedCount, 0)
  assert.equal(payload.summary.replayInputProducedCount, 0)
  assert.equal(payload.summary.runtimeAssetProducedCount, 0)
  assert.equal(payload.summary.businessFactProducedCount, 0)
  assert.equal(payload.summary.autoCanaryReadyCount, 0)

  const pack = await readJson('project-search/knowledge-base/progress-knowledge-retrieval-pack.json')
  assert.equal(pack.schemaVersion, 'progress-knowledge-retrieval-pack/v1')
  assert.deepEqual(pack.summary.byFamily, {
    completed_project_triad: 11,
    clause_sequence: 103,
    duration_quota_extracted_tables: 385,
  })
  assert.deepEqual(pack.summary.byCardType, {
    real_project_case_card: 11,
    clause_sequence_card: 103,
    duration_quota_card: 385,
  })

  for (const card of pack.cards) {
    assert.match(card.retrievalId, /^kb-retrieval-\d{4}$/)
    assert.equal(card.governanceStatus, 'pending_manual_review')
    assert.equal(card.humanDecisionWritten, false)
    assert.equal(card.publicationReadinessProduced, false)
    assert.equal(card.replayInputProduced, false)
    assert.equal(card.runtimeAssetProduced, false)
    assert.equal(card.businessFactProduced, false)
    assert.equal(card.autoCanaryReady, false)
    assert.ok(card.queryText)
    assert.ok(card.summaryText)
    assert.ok(card.selectedFacts)
  }
})

test('progress knowledge retrieval pack query filters compact cards read-only', () => {
  const realProjectResult = runNode([
    'project-search/tools/query-progress-knowledge-retrieval-pack.mjs',
    '--q',
    '朝阳公馆',
    '--card-type',
    'real_project_case_card',
    '--json',
  ])
  assert.equal(realProjectResult.status, 0, `${realProjectResult.stdout}\n${realProjectResult.stderr}`)
  const realProjectPayload = JSON.parse(realProjectResult.stdout)
  assert.equal(realProjectPayload.status, 'passed')
  assert.equal(realProjectPayload.mutationBoundary, 'read_only_knowledge_retrieval_pack_query_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(realProjectPayload.cardsMatchedCount, 2)
  for (const card of realProjectPayload.cards) {
    assert.equal(card.cardType, 'real_project_case_card')
    assert.match(card.title, /朝阳公馆/)
    assert.equal(card.regionCode, 'CN-HN')
  }

  const firstPassResult = runNode([
    'project-search/tools/query-progress-knowledge-retrieval-pack.mjs',
    '--first-pass',
    '--limit',
    '3',
    '--json',
  ])
  assert.equal(firstPassResult.status, 0, `${firstPassResult.stdout}\n${firstPassResult.stderr}`)
  const firstPassPayload = JSON.parse(firstPassResult.stdout)
  assert.equal(firstPassPayload.status, 'passed')
  assert.equal(firstPassPayload.cardsMatchedCount, 69)
  assert.equal(firstPassPayload.cardsReturnedCount, 3)
  for (const card of firstPassPayload.cards) {
    assert.equal(card.firstPassReview, true)
  }

  const durationResult = runNode([
    'project-search/tools/query-progress-knowledge-retrieval-pack.mjs',
    '--family',
    'duration_quota_extracted_tables',
    '--region',
    'CN-GD',
    '--phase',
    'below_zero_basement',
    '--limit',
    '5',
    '--json',
  ])
  assert.equal(durationResult.status, 0, `${durationResult.stdout}\n${durationResult.stderr}`)
  const durationPayload = JSON.parse(durationResult.stdout)
  assert.equal(durationPayload.status, 'passed')
  assert.equal(durationPayload.cardsReturnedCount, 5)
  assert.ok(durationPayload.cardsMatchedCount >= 5)
  for (const card of durationPayload.cards) {
    assert.equal(card.family, 'duration_quota_extracted_tables')
    assert.equal(card.regionCode, 'CN-GD')
    assert.equal(card.phaseCode, 'below_zero_basement')
  }
})

test('progress knowledge base manifest ties the knowledge catalog together without runtime writes', async () => {
  const result = runNode(['project-search/tools/build-progress-knowledge-base-manifest.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.mutationBoundary, 'knowledge_base_manifest_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(payload.summary.totalKnowledgeAssets, 499)
  assert.equal(payload.summary.searchableKnowledgeCards, 499)
  assert.equal(payload.summary.searchableTopics, 267)
  assert.equal(payload.summary.retrievalCards, 499)
  assert.equal(payload.summary.domainPackCount, 3)
  assert.equal(payload.summary.domainPackCards, 499)
  assert.equal(payload.summary.firstPassReviewAssets, 69)
  assert.equal(payload.summary.heldForLaterReviewAssets, 430)
  assert.equal(payload.summary.pendingManualReviewCount, 499)
  assert.equal(payload.summary.localArtifactVerifiedCount, 499)
  assert.equal(payload.summary.humanDecisionWrittenCount, 0)
  assert.equal(payload.summary.publicationReadinessProducedCount, 0)
  assert.equal(payload.summary.replayInputProducedCount, 0)
  assert.equal(payload.summary.runtimeAssetProducedCount, 0)
  assert.equal(payload.summary.businessFactProducedCount, 0)
  assert.equal(payload.summary.autoCanaryReadyCount, 0)

  const manifest = await readJson('project-search/knowledge-base/progress-knowledge-base-manifest.json')
  assert.equal(manifest.schemaVersion, 'progress-knowledge-base-manifest/v1')
  assert.equal(manifest.knowledgeBaseStatus, 'candidate_review_only')
  assert.deepEqual(manifest.domainPacks.map((pack) => pack.cardCount), [11, 103, 385])
  assert.deepEqual(manifest.reviewBatches.map((batch) => batch.itemCount), [11, 58, 103, 327])
  assert.ok(manifest.canonicalArtifacts.every((item) => item.exists))
  assert.ok(manifest.canonicalArtifacts.some((item) => item.role === 'compact_retrieval_pack'))
  assert.equal(manifest.governanceBoundary.currentPublicationBoundary, 'no_human_decisions_no_replay_inputs_no_runtime_assets_no_business_facts_no_auto_canary')
})

test('progress knowledge base health audit verifies counts and candidate-only boundary', async () => {
  const validationRestore = runNode(['project-search/tools/validate-progress-knowledge-review-decisions.mjs', '--json'])
  assert.equal(validationRestore.status, 0, `${validationRestore.stdout}\n${validationRestore.stderr}`)

  const outcomeRestore = runNode(['project-search/tools/build-progress-knowledge-review-outcome-report.mjs', '--json'])
  assert.equal(outcomeRestore.status, 0, `${outcomeRestore.stdout}\n${outcomeRestore.stderr}`)

  const retrievalRestore = runNode(['project-search/tools/build-progress-knowledge-retrieval-pack.mjs'])
  assert.equal(retrievalRestore.status, 0, `${retrievalRestore.stdout}\n${retrievalRestore.stderr}`)

  const manifestRestore = runNode(['project-search/tools/build-progress-knowledge-base-manifest.mjs'])
  assert.equal(manifestRestore.status, 0, `${manifestRestore.stdout}\n${manifestRestore.stderr}`)

  const result = runNode(['project-search/tools/check-progress-knowledge-base-health.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.mutationBoundary, 'knowledge_base_health_report_only_no_db_mutation_no_replay_no_runtime_no_business_fact_write')
  assert.equal(payload.summary.checkCount, 43)
  assert.equal(payload.summary.failedCheckCount, 0)
  assert.equal(payload.summary.totalKnowledgeAssets, 499)
  assert.equal(payload.summary.searchableKnowledgeCards, 499)
  assert.equal(payload.summary.searchableTopics, 267)
  assert.equal(payload.summary.retrievalCards, 499)
  assert.equal(payload.summary.domainPackCount, 3)
  assert.equal(payload.summary.domainPackCards, 499)
  assert.equal(payload.summary.firstPassReviewAssets, 69)
  assert.equal(payload.summary.pendingManualReviewCount, 499)
  assert.equal(payload.summary.localArtifactPresentCount, 499)
  assert.equal(payload.summary.humanDecisionWrittenCount, 0)
  assert.equal(payload.summary.publicationReadinessProducedCount, 0)
  assert.equal(payload.summary.replayInputProducedCount, 0)
  assert.equal(payload.summary.runtimeAssetProducedCount, 0)
  assert.equal(payload.summary.businessFactProducedCount, 0)
  assert.equal(payload.summary.autoCanaryReadyCount, 0)

  const report = await readJson('project-search/knowledge-base/progress-knowledge-base-health-report.json')
  assert.equal(report.schemaVersion, 'progress-knowledge-base-health-report/v1')
  assert.equal(report.status, 'passed')
  assert.equal(report.failures.length, 0)
  assert.ok(report.checks.some((check) => check.name === 'all_catalog_assets_have_existing_local_artifacts'))
  assert.ok(report.checks.some((check) => check.name === 'card_level_has_no_replay_runtime_or_business_outputs'))
  assert.ok(report.checks.some((check) => check.name === 'retrieval_card_level_has_no_replay_runtime_or_business_outputs'))
})
