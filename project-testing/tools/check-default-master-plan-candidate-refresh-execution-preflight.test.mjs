import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
  checkDefaultMasterPlanCandidateRefreshExecutionPreflight,
  parseArgs,
} from './check-default-master-plan-candidate-refresh-execution-preflight.mjs'

const execFileAsync = promisify(execFile)

test('blocks candidate refresh execution when package requires refresh but unlock and human approval are missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')

  await writeJson(refreshPackage, refreshPackageFixture())

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
      refreshPackage,
      output,
      env: {},
      now: new Date('2026-07-04T16:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1')
    assert.equal(report.status, 'blocked')
    assert.equal(report.mayExecuteCandidateRefresh, false)
    assert.equal(report.blockers.includes('candidate_refresh_unlock_required'), true)
    assert.equal(report.blockers.includes('candidate_refresh_operator_approval_required'), true)
    assert.equal(report.blockers.includes('candidate_refresh_refreshed_by_required'), true)
    assert.equal(report.blockers.includes('candidate_refresh_execute_mode_required'), true)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'blocked')
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /candidate_refresh_unlock_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows staging candidate refresh execution only after unlock, approval, actor, and execute mode are present', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const candidateDiscovery = path.join(root, 'candidate-discovery.json')
  const envFile = path.join(root, 'staging.env')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')

  await writeJson(refreshPackage, refreshPackageFixture())
  await writeJson(candidateDiscovery, candidateDiscoveryFixture())
  await writeFile(envFile, candidateTargetEnv('staging-test-ref'), 'utf8')

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
      refreshPackage,
      candidateDiscovery,
      envFile,
      output,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      expectedStagingProjectRef: 'staging-test-ref',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      now: new Date('2026-07-04T16:05:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_execute')
    assert.equal(report.mayExecuteCandidateRefresh, true)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.baselineId, 'baseline-school')
    assert.equal(report.projectId, 'project-school')
    assert.equal(report.businessType, 'school')
    assert.match(report.refreshPackageRef, /^candidate_refresh_package:.+#sha256=[a-f0-9]{64}$/)
    assert.equal(report.refreshPlan.targetReplacementRowCount, 3)
    assert.equal(report.executionPlan.requiredUnlock, 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH')
    assert.equal(report.executionPlan.unlockPresent, true)
    assert.equal(report.executionPlan.operatorApprovalRef, 'pm-approval:baseline-school:2026-07-04')
    assert.equal(report.executionPlan.environment, 'staging')
    assert.equal(report.candidateDiscovery.matchingBaselineFound, true)
    assert.match(report.executionPlan.allowedCommand, /run-default-master-plan-candidate-refresh-execution\.mjs/)
    assert.match(report.executionPlan.allowedCommand, /--allow-refresh/)
    assert.equal(report.productionReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows system-standard replacement rows to declare no duration review gate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const candidateDiscovery = path.join(root, 'candidate-discovery.json')
  const envFile = path.join(root, 'staging.env')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')
  const systemStandardPackage = {
    ...refreshPackageFixture(),
    targetReplacementRows: refreshPackageFixture().targetReplacementRows.map((row) => ({
      ...row,
      durationReviewGate: '',
      durationReviewRequired: false,
      durationTruthSource: 'system_standard_executable_master_plan',
    })),
  }

  await writeJson(refreshPackage, systemStandardPackage)
  await writeJson(candidateDiscovery, candidateDiscoveryFixture())
  await writeFile(envFile, candidateTargetEnv('staging-test-ref'), 'utf8')

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
      refreshPackage,
      candidateDiscovery,
      envFile,
      output,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      expectedStagingProjectRef: 'staging-test-ref',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
    })

    assert.equal(report.status, 'ready_for_execute')
    assert.equal(report.refreshPlan.targetRowsDurationAssetLineageReady, true)
    assert.equal(report.blockers.includes('candidate_refresh_target_rows_duration_asset_lineage_required'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks execute mode when discovery target differs from the selected staging env target', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const candidateDiscovery = path.join(root, 'candidate-discovery.json')
  const envFile = path.join(root, 'staging.env')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')

  await writeJson(refreshPackage, refreshPackageFixture())
  await writeJson(candidateDiscovery, candidateDiscoveryFixture({
    supabaseProjectRef: 'production-test-ref',
    databaseHost: 'db.production-test-ref.supabase.co',
  }))
  await writeFile(envFile, candidateTargetEnv('staging-test-ref'), 'utf8')

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
      refreshPackage,
      candidateDiscovery,
      envFile,
      output,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      expectedStagingProjectRef: 'staging-test-ref',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayExecuteCandidateRefresh, false)
    assert.equal(report.executionTarget.supabaseProjectRef, 'staging-test-ref')
    assert.equal(report.candidateDiscovery.target.supabaseProjectRef, 'production-test-ref')
    assert.equal(report.blockers.includes('candidate_refresh_candidate_discovery_target_mismatch'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks execute mode when target database candidate discovery is not supplied', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')

  await writeJson(refreshPackage, refreshPackageFixture())

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
      refreshPackage,
      output,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      now: new Date('2026-07-04T16:05:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayExecuteCandidateRefresh, false)
    assert.equal(report.candidateDiscovery, null)
    assert.equal(report.blockers.includes('candidate_refresh_candidate_discovery_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate refresh execution when replacement rows are missing duration asset lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')
  const packageWithoutLineage = {
    ...refreshPackageFixture(),
    targetReplacementRows: refreshPackageFixture().targetReplacementRows.map(stripDurationAssetLineage),
  }

  await writeJson(refreshPackage, packageWithoutLineage)

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
      refreshPackage,
      output,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      now: new Date('2026-07-04T16:06:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayExecuteCandidateRefresh, false)
    assert.equal(report.refreshPlan.targetRowsDurationAssetLineageReady, false)
    assert.equal(report.blockers.includes('candidate_refresh_target_rows_duration_asset_lineage_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate refresh execution when candidate discovery cannot find the target baseline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const candidateDiscovery = path.join(root, 'candidate-discovery.json')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')

  await writeJson(refreshPackage, refreshPackageFixture())
  await writeJson(candidateDiscovery, {
    schemaVersion: 'workbuddy-default-master-plan-production-candidate-discovery/v1',
    status: 'blocked',
    filters: {
      projectId: 'project-school',
      environment: 'staging',
    },
    candidateCount: 0,
    candidates: [],
    recommendedCandidate: null,
    blockers: [
      'candidate_default_master_plan_baseline_not_found',
    ],
    mutationBoundary: {
      readsDatabase: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
      refreshPackage,
      candidateDiscovery,
      output,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      now: new Date('2026-07-04T16:07:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayExecuteCandidateRefresh, false)
    assert.equal(report.candidateDiscovery.status, 'blocked')
    assert.equal(report.candidateDiscovery.matchingBaselineFound, false)
    assert.equal(report.blockers.includes('candidate_refresh_target_baseline_not_found'), true)

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /candidate_refresh_target_baseline_not_found/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('treats no-refresh package as already current without requiring unlock', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')

  await writeJson(refreshPackage, {
    ...refreshPackageFixture(),
    status: 'no_refresh_required',
    refreshRequired: false,
    blockers: [],
    diff: {
      currentRowCount: 3,
      targetRowCount: 3,
      missingTargetRows: [],
      extraCurrentRows: [],
      codeChangedRows: [],
      dateOrDurationChangedRows: [],
    },
  })

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
      refreshPackage,
      output,
      env: {},
      now: new Date('2026-07-04T16:10:00.000Z'),
    })

    assert.equal(report.status, 'already_current')
    assert.equal(report.mayExecuteCandidateRefresh, false)
    assert.equal(report.alreadyCurrent, true)
    assert.deepEqual(report.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate refresh execution when package has unresolved hard blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')

  await writeJson(refreshPackage, {
    ...refreshPackageFixture(),
    blockers: [
      'selected_candidate_export_profile_shape_mismatch',
      'candidate_baseline_refresh_required_before_runtime_publication',
      'profile_report_file_required',
    ],
  })

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
      refreshPackage,
      output,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayExecuteCandidateRefresh, false)
    assert.equal(report.packageHardBlockers.includes('profile_report_file_required'), true)
    assert.equal(report.blockers.includes('candidate_refresh_package_has_unresolved_hard_blockers'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('parses candidate refresh execution preflight CLI args', () => {
  const args = parseArgs([
    '--refresh-package',
    'tmp/candidate-refresh-package.json',
    '--output',
    'tmp/candidate-refresh-execution-preflight.json',
    '--environment',
    'staging',
    '--operator-approval-ref',
    'approval-1',
    '--refreshed-by',
    'user-1',
    '--mode',
    'execute',
    '--fail-on-blocked',
  ])

  assert.equal(args.refreshPackage.endsWith('tmp\\candidate-refresh-package.json') || args.refreshPackage.endsWith('tmp/candidate-refresh-package.json'), true)
  assert.equal(args.output.endsWith('tmp\\candidate-refresh-execution-preflight.json') || args.output.endsWith('tmp/candidate-refresh-execution-preflight.json'), true)
  assert.equal(args.environment, 'staging')
  assert.equal(args.operatorApprovalRef, 'approval-1')
  assert.equal(args.refreshedBy, 'user-1')
  assert.equal(args.mode, 'execute')
  assert.equal(args.failOnBlocked, true)
})

test('prints candidate refresh execution preflight readiness in CLI summary output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-preflight-cli-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-refresh-execution-preflight.json')

  await writeJson(refreshPackage, refreshPackageFixture())

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      'project-testing/tools/check-default-master-plan-candidate-refresh-execution-preflight.mjs',
      '--refresh-package',
      refreshPackage,
      '--output',
      output,
    ], { cwd: process.cwd() })
    const summary = JSON.parse(stdout)

    assert.equal(summary.status, 'blocked')
    assert.equal(summary.mayExecuteCandidateRefresh, false)
    assert.equal(summary.blockers.includes('candidate_refresh_unlock_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function refreshPackageFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    source: 'build-default-master-plan-candidate-refresh-package',
    generatedAt: '2026-07-04T15:00:00.000Z',
    status: 'refresh_required',
    productionReady: false,
    refreshRequired: true,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    currentCandidate: {
      rowCount: 2,
      normalizedRowCount: 2,
      artifact: 'project-testing/reports/default-master-plan-production-readiness/candidate-baseline-baseline-school-school-items.json',
    },
    targetProfile: {
      businessType: 'school',
      scheduleRowCount: 3,
      baseRowCount: 1,
      profileRowCount: 2,
      targetRowCount: 3,
    },
    targetReplacementRows: [
      replacementRow('BTMP-BASE-01', '施工准备与现场临设完成'),
      replacementRow('BTMP-SCH-02', '教学楼二次结构与普通教室粗装修'),
      replacementRow('BTMP-SCH-03', '实验室通风与专业机电安装'),
    ],
    diff: {
      currentRowCount: 2,
      targetRowCount: 3,
      missingTargetRows: [
        {
          code: 'BTMP-SCH-02',
          title: '教学楼二次结构与普通教室粗装修',
        },
      ],
      extraCurrentRows: [],
      codeChangedRows: [
        {
          fromCode: 'BTMP-SCH-02',
          toCode: 'BTMP-SCH-03',
          title: '实验室通风与专业机电安装',
        },
      ],
      dateOrDurationChangedRows: [],
    },
    blockers: [
      'selected_candidate_export_profile_shape_mismatch',
      'candidate_baseline_refresh_required_before_runtime_publication',
    ],
    operationPlan: {
      mode: 'full_replace_candidate_baseline_items_from_profile_report',
      executeAllowed: false,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      targetArtifactOnly: true,
    },
    mutationBoundary: {
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
}

function candidateDiscoveryFixture(targetOverrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-production-candidate-discovery/v1',
    status: 'candidate_found',
    target: {
      envFileRef: 'staging.env',
      envFileSha256: 'fixture-env-sha256',
      supabaseProjectRef: 'staging-test-ref',
      databaseHost: 'db.staging-test-ref.supabase.co',
      databasePort: '5432',
      databaseName: 'postgres',
      databaseUser: 'postgres',
      connectionSource: 'DB_CONNECTION_STRING',
      readable: true,
      ...targetOverrides,
    },
    filters: {
      projectId: 'project-school',
      environment: 'staging',
    },
    candidateCount: 1,
    candidates: [
      {
        baselineId: 'baseline-school',
        projectId: 'project-school',
        businessType: 'school',
      },
    ],
    recommendedCandidate: {
      baselineId: 'baseline-school',
      projectId: 'project-school',
      businessType: 'school',
    },
    blockers: [],
  }
}

function candidateTargetEnv(projectRef) {
  return [
    `SUPABASE_URL=https://${projectRef}.supabase.co`,
    `DB_CONNECTION_STRING=postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`,
    '',
  ].join('\n')
}

function replacementRow(code, title) {
  return {
    code,
    title,
    executionPhase: code.startsWith('BTMP-BASE-') ? 'startup_site_setup' : 'mep_roughin',
    executionLane: code.startsWith('BTMP-BASE-') ? 'site_preparation' : 'school_profile',
    startDate: '2026-07-01',
    endDate: '2026-07-30',
    durationDays: 30,
    businessType: 'school',
    profileSourceType: code.startsWith('BTMP-BASE-')
      ? 'business_type_base_master_plan_profile_v1'
      : 'business_type_master_plan_profile_v1',
    durationAssetStableCode: code.startsWith('BTMP-BASE-') ? 'site_setup_temp_works' : 'masonry_infill_wall',
    t2RhythmTemplateId: code.startsWith('BTMP-BASE-')
      ? 't2-residential-basement-structure-handover-rhythm-v1'
      : 't2-residential-secondary-structure-fitout-interleave-v1',
    standardWorkDurationSeedP50Days: code.startsWith('BTMP-BASE-') ? 18 : 8,
    t2RhythmTemplateP50Days: code.startsWith('BTMP-BASE-') ? 35 : 26,
    runtimeReferenceDaysConsumed: true,
    quantityProxySource: 'project_scale_facts',
    quantityProxyValue: code.startsWith('BTMP-BASE-') ? 2 : 6,
    productivityDerivedDurationDays: 30,
    selectionRule: 'runtime_calibrated_reference_days_p50_candidate_l2',
    dependencyRuleSource: code.startsWith('BTMP-BASE-') ? '' : 'construction_task_dependency_constraint_rule_system',
    dependencyRuleLayerStack: code.startsWith('BTMP-BASE-') ? '' : 'cross_item_workflow + process_constraint',
    durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
    durationMaturity: 'L1',
    durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
    durationTruthSource: 'asset_backed_candidate_master_plan',
    candidateOnly: true,
    writesTasks: false,
    writesTaskDependencies: false,
    writesProductionDependencies: false,
    writesRuntimePublication: false,
  }
}

function stripDurationAssetLineage(row) {
  const copy = { ...row }
  for (const key of [
    'profileSourceType',
    'durationAssetStableCode',
    't2RhythmTemplateId',
    'standardWorkDurationSeedP50Days',
    't2RhythmTemplateP50Days',
    'runtimeReferenceDaysConsumed',
    'quantityProxySource',
    'quantityProxyValue',
    'productivityDerivedDurationDays',
    'selectionRule',
    'dependencyRuleSource',
    'dependencyRuleLayerStack',
    'durationCalibrationSource',
    'durationMaturity',
    'durationReviewGate',
    'durationTruthSource',
  ]) {
    delete copy[key]
  }
  return copy
}

async function writeJson(filePath, payload) {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
