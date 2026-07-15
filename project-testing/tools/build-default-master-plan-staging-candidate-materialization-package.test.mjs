import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('creates a candidate-only staging package bound to the approved target, tenant, operator, and source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-staging-materialization-package-'))
  const sourcePackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'staging-candidate-materialization-package.json')
  const module = await import('./build-default-master-plan-staging-candidate-materialization-package.mjs').catch(() => ({}))

  await writeJson(sourcePackage, sourcePackageFixture())

  try {
    assert.equal(typeof module.buildDefaultMasterPlanStagingCandidateMaterializationPackage, 'function')
    const report = await module.buildDefaultMasterPlanStagingCandidateMaterializationPackage({
      sourcePackage,
      output,
      environment: 'staging',
      companyId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      operatorId: '44444444-4444-4444-8444-444444444444',
      operatorApprovalRef: 'user-authorized-staging-guarded-write-2026-07-10',
      baselineIdFactory: () => '55555555-5555-4555-8555-555555555555',
      now: new Date('2026-07-10T03:30:00.000Z'),
      expectedStagingProjectRef: 'staging-test-ref',
      targetReader: async () => stagingTargetFixture(),
    })

    assert.equal(report.status, 'refresh_required')
    assert.equal(report.productionReady, false)
    assert.equal(report.baselineId, '55555555-5555-4555-8555-555555555555')
    assert.equal(report.projectId, '33333333-3333-4333-8333-333333333333')
    assert.deepEqual(report.blockers, ['candidate_baseline_refresh_required_before_runtime_publication'])
    assert.deepEqual(report.stagingMaterialization, {
      environment: 'staging',
      companyId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      baselineId: '55555555-5555-4555-8555-555555555555',
      operatorId: '44444444-4444-4444-8444-444444444444',
      operatorApprovalRef: 'user-authorized-staging-guarded-write-2026-07-10',
      target: stagingTargetFixture(),
    })
    assert.equal(report.sourceLineage.sourceBaselineId, '11111111-1111-4111-8111-111111111111')
    assert.equal(report.sourceLineage.sourceProjectId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    assert.equal(report.targetReplacementRows.length, 1)
    assert.equal(report.mutationBoundary.writesReportFiles, true)
    assert.equal(report.mutationBoundary.writesCandidateBaselines, false)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.stagingMaterialization.operatorId, '44444444-4444-4444-8444-444444444444')
    assert.equal(written.sourceLineage.sourcePackageSha256.length, 64)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a staging package when its source package contains unexpected blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-staging-materialization-package-'))
  const sourcePackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'staging-candidate-materialization-package.json')
  const module = await import('./build-default-master-plan-staging-candidate-materialization-package.mjs').catch(() => ({}))

  await writeJson(sourcePackage, {
    ...sourcePackageFixture(),
    blockers: ['candidate_export_hygiene_blocked'],
  })

  try {
    assert.equal(typeof module.buildDefaultMasterPlanStagingCandidateMaterializationPackage, 'function')
    const report = await module.buildDefaultMasterPlanStagingCandidateMaterializationPackage({
      sourcePackage,
      output,
      environment: 'staging',
      companyId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      operatorId: '44444444-4444-4444-8444-444444444444',
      operatorApprovalRef: 'user-authorized-staging-guarded-write-2026-07-10',
      baselineIdFactory: () => '55555555-5555-4555-8555-555555555555',
      expectedStagingProjectRef: 'staging-test-ref',
      targetReader: async () => stagingTargetFixture(),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.blockers.includes('staging_materialization_source_package_has_unexpected_blockers'), true)
    assert.equal(report.mutationBoundary.writesCandidateBaselines, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function sourcePackageFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    source: 'build-default-master-plan-candidate-refresh-package',
    generatedAt: '2026-07-08T03:11:57.329Z',
    status: 'refresh_required',
    productionReady: false,
    refreshRequired: true,
    baselineId: '11111111-1111-4111-8111-111111111111',
    projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    businessType: 'school',
    targetProfile: { businessType: 'school', targetRowCount: 1 },
    targetReplacementRows: [
      {
        code: 'BTMP-SCH-01',
        title: 'School construction baseline task',
        startDate: '2026-07-26',
        endDate: '2026-09-29',
        durationDays: 66,
        businessType: 'school',
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
        writesProductionDependencies: false,
        writesRuntimePublication: false,
      },
    ],
    diff: {
      currentRowCount: 1,
      targetRowCount: 1,
      missingTargetRows: [],
      extraCurrentRows: [],
      codeChangedRows: [],
      dateOrDurationChangedRows: [],
    },
    blockers: ['candidate_baseline_refresh_required_before_runtime_publication'],
    operationPlan: {
      mode: 'full_replace_candidate_baseline_items_from_profile_report',
    },
    mutationBoundary: {
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
}

function stagingTargetFixture() {
  return {
    envFileRef: 'deploy/env/staging.env',
    envFileSha256: 'a'.repeat(64),
    connectionCredentialSha256: 'b'.repeat(64),
    supabaseProjectRef: 'staging-test-ref',
    databaseHost: 'db.staging-test-ref.supabase.co',
    databasePort: '5432',
    databaseName: 'postgres',
    databaseUser: 'workbuddy_runtime_login',
    targetFingerprint: 'c'.repeat(64),
    connectionSource: 'DB_CONNECTION_STRING',
    readable: true,
  }
}

async function writeJson(filePath, payload) {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
