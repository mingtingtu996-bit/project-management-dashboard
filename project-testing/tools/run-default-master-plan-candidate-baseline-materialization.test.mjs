import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildCandidateBaselineMaterializationPgClientConfig,
  parseArgs,
  runDefaultMasterPlanCandidateBaselineMaterialization,
} from './run-default-master-plan-candidate-baseline-materialization.mjs'
import { buildDefaultMasterPlanDatabaseTargetFingerprint } from './default-master-plan-env-target.mjs'

test('dry-run plans candidate baseline materialization without opening a DB client', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialize-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-baseline-materialization.json')
  let factoryCalled = false

  await writeJson(refreshPackage, refreshPackageFixture())

  try {
    const report = await runDefaultMasterPlanCandidateBaselineMaterialization({
      refreshPackage,
      output,
      mode: 'dry-run',
      environment: 'staging',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      env: {},
      dbClientFactory: () => {
        factoryCalled = true
        return mockClient([])
      },
      now: new Date('2026-07-04T18:00:00.000Z'),
    })

    assert.equal(report.status, 'candidate_baseline_materialization_dry_run')
    assert.equal(report.executionControl.executionAllowed, false)
    assert.equal(report.materializationPlan.targetReplacementRowCount, 3)
    assert.equal(report.materializationPlan.wouldInsertCandidateBaseline, true)
    assert.equal(report.materializationPlan.wouldInsertCandidateBaselineItems, true)
    assert.equal(report.mutationBoundary.writesCandidateBaselines, false)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)
    assert.equal(factoryCalled, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'candidate_baseline_materialization_dry_run')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate baseline materialization execute without unlock and human operator evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialize-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-baseline-materialization.json')
  const queries = []

  await writeJson(refreshPackage, refreshPackageFixture())

  try {
    const report = await runDefaultMasterPlanCandidateBaselineMaterialization({
      refreshPackage,
      output,
      mode: 'execute',
      targetReader: async () => stagingTargetFixture(),
      expectedStagingProjectRef: 'staging-test-ref',
      allowMaterialization: true,
      environment: 'staging',
      env: {},
      dbClientFactory: () => mockClient(queries),
      now: new Date('2026-07-04T18:05:00.000Z'),
    })

    assert.equal(report.status, 'candidate_baseline_materialization_blocked')
    assert.equal(report.executionControl.executionAllowed, false)
    assert.equal(report.blockers.includes('candidate_baseline_materialization_unlock_required'), true)
    assert.equal(report.blockers.includes('candidate_baseline_materialization_operator_approval_required'), true)
    assert.equal(report.blockers.includes('candidate_baseline_materialized_by_required'), true)
    assert.equal(report.mutationBoundary.writesCandidateBaselines, false)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(queries.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks execute before opening a DB client when the refresh package is not bound to a staging tenant and operator', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialize-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-baseline-materialization.json')
  let factoryCalled = false

  await writeJson(refreshPackage, refreshPackageFixture())

  try {
    const report = await runDefaultMasterPlanCandidateBaselineMaterialization({
      refreshPackage,
      output,
      mode: 'execute',
      targetReader: async () => stagingTargetFixture(),
      expectedStagingProjectRef: 'staging-test-ref',
      allowMaterialization: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '1',
      },
      dbClientFactory: () => {
        factoryCalled = true
        return mockClient([])
      },
    })

    assert.equal(report.status, 'candidate_baseline_materialization_blocked')
    assert.equal(report.blockers.includes('candidate_baseline_materialization_staging_context_required'), true)
    assert.equal(factoryCalled, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('execute inserts candidate baseline and candidate-only baseline items in one guarded transaction', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialize-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-baseline-materialization.json')
  const queries = []

  await writeJson(refreshPackage, refreshPackageFixture({ stagingMaterialization: stagingMaterializationFixture() }))

  try {
    const report = await runDefaultMasterPlanCandidateBaselineMaterialization({
      refreshPackage,
      output,
      mode: 'execute',
      targetReader: async () => stagingTargetFixture(),
      expectedStagingProjectRef: 'staging-test-ref',
      allowMaterialization: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '1',
      },
      dbClientFactory: () => mockClient(queries),
      idFactory: (kind, index) => {
        if (kind === 'baseline') return 'baseline-school'
        return `00000000-0000-4000-8000-00000000000${index + 1}`
      },
      now: new Date('2026-07-04T18:10:00.000Z'),
    })

    assert.equal(report.status, 'candidate_baseline_materialization_completed')
    assert.equal(report.executionControl.executionAllowed, true)
    assert.equal(report.baselineId, 'baseline-school')
    assert.equal(report.insertedBaselineCount, 1)
    assert.equal(report.insertedItemCount, 3)
    assert.equal(report.mutationBoundary.writesCandidateBaselines, true)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, true)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)
    assert.deepEqual(report.tenantValidation, {
      companyId: 'company-school',
      projectId: 'project-school',
      operatorId: '11111111-1111-4111-8111-111111111111',
      projectMatchedCompany: true,
      activeCompanyMembership: true,
      activeProjectMembership: true,
    })
    assert.deepEqual(queries.map((entry) => entry.sql), [
      'BEGIN',
      'SELECT id, company_id FROM public.projects WHERE id = $1::uuid FOR SHARE',
      "SELECT company_id FROM public.company_members WHERE company_id = $1::uuid AND user_id = $2::uuid AND status = 'active' LIMIT 1",
      'SELECT project_id FROM public.project_members WHERE project_id = $1::uuid AND user_id = $2::uuid AND is_active = true LIMIT 1',
      'SELECT id FROM public.task_baselines WHERE id = $1::uuid OR (project_id = $2::uuid AND source_version_label = $3 AND status = $4) LIMIT 1 FOR UPDATE',
      'SELECT COALESCE(MAX(version), 0)::int AS max_version FROM public.task_baselines WHERE project_id = $1::uuid',
      'INSERT INTO public.task_baselines',
      'INSERT INTO public.task_baseline_items',
      'COMMIT',
      'END',
    ])
    const baselineInsert = queries.find((entry) => entry.sql === 'INSERT INTO public.task_baselines')
    assert.equal(baselineInsert.params[0], 'baseline-school')
    assert.equal(baselineInsert.params[1], 'project-school')
    assert.equal(baselineInsert.params[3], 'draft')
    assert.equal(baselineInsert.params[6], 'current_schedule')
    assert.equal(baselineInsert.params[7], 'managed_frontier_default_master_plan')
    const itemInsert = queries.find((entry) => entry.sql === 'INSERT INTO public.task_baseline_items')
    assert.equal(itemInsert.params.some((value) => String(value).includes('candidate_baseline_materialization')), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rolls back without inserting when the staging project belongs to a different company', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialize-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-baseline-materialization.json')
  const queries = []

  await writeJson(refreshPackage, refreshPackageFixture({ stagingMaterialization: stagingMaterializationFixture() }))

  try {
    const report = await runDefaultMasterPlanCandidateBaselineMaterialization({
      refreshPackage,
      output,
      mode: 'execute',
      targetReader: async () => stagingTargetFixture(),
      expectedStagingProjectRef: 'staging-test-ref',
      allowMaterialization: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '1',
      },
      dbClientFactory: () => mockClient(queries, { projectCompanyId: 'company-other' }),
    })

    assert.equal(report.status, 'candidate_baseline_materialization_failed')
    assert.equal(report.errorCode, 'candidate_baseline_materialization_project_company_mismatch')
    assert.equal(report.insertedBaselineCount, 0)
    assert.equal(report.insertedItemCount, 0)
    assert.equal(report.transaction.rolledBack, true)
    assert.equal(queries.some((entry) => entry.sql === 'INSERT INTO public.task_baselines'), false)
    assert.equal(queries.some((entry) => entry.sql === 'INSERT INTO public.task_baseline_items'), false)
    assert.equal(queries.at(-2).sql, 'ROLLBACK')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks execute when a staging package has only a target fingerprint without the complete target identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialize-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-baseline-materialization.json')
  let factoryCalled = false
  const target = stagingTargetFixture()

  await writeJson(refreshPackage, refreshPackageFixture({
    stagingMaterialization: stagingMaterializationFixture({
      target: {
        targetFingerprint: target.targetFingerprint,
      },
    }),
  }))

  try {
    const report = await runDefaultMasterPlanCandidateBaselineMaterialization({
      refreshPackage,
      output,
      mode: 'execute',
      targetReader: async () => target,
      expectedStagingProjectRef: 'staging-test-ref',
      allowMaterialization: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      env: { WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '1' },
      dbClientFactory: () => {
        factoryCalled = true
        return mockClient([])
      },
    })

    assert.equal(report.status, 'candidate_baseline_materialization_blocked')
    assert.equal(report.blockers.includes('candidate_baseline_materialization_staging_context_required'), true)
    assert.equal(factoryCalled, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate baseline materialization when a production target is labeled staging', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialize-target-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-baseline-materialization.json')
  const queries = []
  await writeJson(refreshPackage, refreshPackageFixture())

  try {
    const report = await runDefaultMasterPlanCandidateBaselineMaterialization({
      refreshPackage,
      output,
      mode: 'execute',
      allowMaterialization: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      expectedStagingProjectRef: 'staging-test-ref',
      targetReader: async () => ({
        ...stagingTargetFixture(),
        supabaseProjectRef: 'production-test-ref',
        databaseHost: 'db.production-test-ref.supabase.co',
      }),
      env: { WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '1' },
      dbClientFactory: () => mockClient(queries),
    })

    assert.equal(report.status, 'candidate_baseline_materialization_blocked')
    assert.equal(report.blockers.includes('candidate_baseline_materialization_target_not_approved_staging_project'), true)
    assert.equal(queries.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate baseline materialization when refresh package has unresolved hard blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialize-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'candidate-baseline-materialization.json')
  const queries = []
  const packageWithHardBlocker = {
    ...refreshPackageFixture(),
    blockers: ['candidate_export_hygiene_blocked'],
  }

  await writeJson(refreshPackage, packageWithHardBlocker)

  try {
    const report = await runDefaultMasterPlanCandidateBaselineMaterialization({
      refreshPackage,
      output,
      mode: 'execute',
      targetReader: async () => stagingTargetFixture(),
      expectedStagingProjectRef: 'staging-test-ref',
      allowMaterialization: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '1',
      },
      dbClientFactory: () => mockClient(queries),
      idFactory: (kind, index) => {
        if (kind === 'baseline') return 'baseline-school'
        return `00000000-0000-4000-8000-00000000000${index + 1}`
      },
      now: new Date('2026-07-04T18:12:00.000Z'),
    })

    assert.equal(report.status, 'candidate_baseline_materialization_blocked')
    assert.equal(report.executionControl.executionAllowed, false)
    assert.deepEqual(report.blockers, ['candidate_baseline_materialization_refresh_package_has_unresolved_hard_blockers'])
    assert.equal(report.mutationBoundary.writesCandidateBaselines, false)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(queries.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('parses candidate baseline materialization CLI args', () => {
  const args = parseArgs([
    '--refresh-package',
    'tmp/candidate-refresh-package.json',
    '--output',
    'tmp/candidate-baseline-materialization.json',
    '--environment',
    'staging',
    '--operator-approval-ref',
    'approval-1',
    '--materialized-by',
    'user-1',
    '--mode',
    'execute',
    '--allow-materialization',
    '--fail-on-blocked',
  ])

  assert.equal(args.refreshPackage.endsWith('tmp\\candidate-refresh-package.json') || args.refreshPackage.endsWith('tmp/candidate-refresh-package.json'), true)
  assert.equal(args.output.endsWith('tmp\\candidate-baseline-materialization.json') || args.output.endsWith('tmp/candidate-baseline-materialization.json'), true)
  assert.equal(args.environment, 'staging')
  assert.equal(args.operatorApprovalRef, 'approval-1')
  assert.equal(args.materializedBy, 'user-1')
  assert.equal(args.mode, 'execute')
  assert.equal(args.allowMaterialization, true)
  assert.equal(args.failOnBlocked, true)
})

test('builds candidate baseline materialization pg config with sslmode stripped so explicit TLS verifier policy is authoritative', () => {
  const config = buildCandidateBaselineMaterializationPgClientConfig(
    'postgres://runtime:secret@db.example.supabase.co:5432/postgres?sslmode=require&application_name=workbuddy',
    { PGSSLMODE: 'require' },
  )

  assert.equal(config.connectionString.includes('sslmode='), false)
  assert.equal(config.connectionString.includes('application_name=workbuddy'), true)
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  assert.equal(config.connectionTimeoutMillis, 12000)
  assert.equal(config.query_timeout, 30000)
  assert.equal(config.statement_timeout, 30000)
})

function refreshPackageFixture(overrides = {}) {
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
    targetProfile: {
      businessType: 'school',
      scheduleRowCount: 3,
      targetRowCount: 3,
    },
    targetReplacementRows: [
      replacementRow('BTMP-BASE-01', '施工准备与现场临设完成', 'startup_site_setup', 'site_preparation', 'business_type_base_master_plan_profile_v1'),
      replacementRow('BTMP-SCH-02', '教学楼二次结构与普通教室粗装修', 'secondary_structure_fitout_roughin', 'teaching_secondary_structure', 'business_type_master_plan_profile_v1'),
      replacementRow('BTMP-SCH-03', '实验室通风与专业机电安装', 'mep_roughin', 'laboratory_mep', 'business_type_master_plan_profile_v1'),
    ],
    diff: {
      currentRowCount: 0,
      targetRowCount: 3,
      missingTargetRows: [{ code: 'BTMP-SCH-02' }],
      extraCurrentRows: [],
      codeChangedRows: [],
      dateOrDurationChangedRows: [],
    },
    operationPlan: {
      mode: 'full_replace_candidate_baseline_items_from_profile_report',
    },
    mutationBoundary: {
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
    ...overrides,
  }
}

function stagingMaterializationFixture(overrides = {}) {
  return {
    environment: 'staging',
    companyId: 'company-school',
    projectId: 'project-school',
    baselineId: 'baseline-school',
    operatorId: '11111111-1111-4111-8111-111111111111',
    operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
    target: stagingTargetFixture(),
    ...overrides,
  }
}

function replacementRow(code, title, executionPhase, executionLane, profileSourceType) {
  return {
    code,
    title,
    executionPhase,
    executionLane,
    startDate: '2026-07-01',
    endDate: '2026-07-30',
    durationDays: 30,
    businessType: 'school',
    profileSourceType,
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

function mockClient(queries, { projectCompanyId = 'company-school', activeCompanyMembership = true, activeProjectMembership = true } = {}) {
  return {
    async connect() {
      queries.push({ sql: 'CONNECT', params: [] })
    },
    async end() {
      queries.push({ sql: 'END', params: [] })
    },
    async query(sql, params = []) {
      const normalized = normalizeSql(sql)
      if (normalized === 'CONNECT' || normalized === 'END') return { rowCount: 0, rows: [] }
      if (normalized.startsWith('INSERT INTO public.task_baseline_items')) {
        queries.push({ sql: 'INSERT INTO public.task_baseline_items', rawSql: normalized, params })
        return { rowCount: 3, rows: [] }
      }
      if (normalized.startsWith('INSERT INTO public.task_baselines')) {
        queries.push({ sql: 'INSERT INTO public.task_baselines', rawSql: normalized, params })
        return { rowCount: 1, rows: [{ id: params[0] }] }
      }
      queries.push({ sql: normalized, params })
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') return { rowCount: 0, rows: [] }
      if (normalized.startsWith('SELECT id, company_id FROM public.projects')) {
        return { rowCount: 1, rows: [{ id: 'project-school', company_id: projectCompanyId }] }
      }
      if (normalized.startsWith('SELECT company_id FROM public.company_members')) {
        return activeCompanyMembership ? { rowCount: 1, rows: [{ company_id: 'company-school' }] } : { rowCount: 0, rows: [] }
      }
      if (normalized.startsWith('SELECT project_id FROM public.project_members')) {
        return activeProjectMembership ? { rowCount: 1, rows: [{ project_id: 'project-school' }] } : { rowCount: 0, rows: [] }
      }
      if (normalized.startsWith('SELECT id FROM public.task_baselines')) return { rowCount: 0, rows: [] }
      if (normalized.startsWith('SELECT COALESCE(MAX(version), 0)::int AS max_version FROM public.task_baselines')) {
        return { rowCount: 1, rows: [{ max_version: 7 }] }
      }
      return { rowCount: 0, rows: [] }
    },
  }
}

function normalizeSql(sql) {
  return String(sql ?? '').replace(/\s+/g, ' ').trim()
}

async function writeJson(filePath, payload) {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function stagingTargetFixture() {
  const target = {
    envFileRef: 'deploy/env/staging.env',
    envFileSha256: 'staging-env-sha256',
    supabaseProjectRef: 'staging-test-ref',
    databaseHost: 'db.staging-test-ref.supabase.co',
    databasePort: '5432',
    databaseName: 'postgres',
    databaseUser: 'postgres',
    connectionSource: 'SUPABASE_MIGRATION_URL',
    readable: true,
  }
  return {
    ...target,
    targetFingerprint: buildDefaultMasterPlanDatabaseTargetFingerprint(target),
  }
}
