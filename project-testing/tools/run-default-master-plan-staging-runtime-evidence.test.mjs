import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/run-default-master-plan-staging-runtime-evidence.mjs')

test('refuses default master-plan staging writes unless all staging unlock flags are present', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--company-id',
      'company-1',
      '--environment',
      'staging',
      '--reviewed-by',
      'reviewer-1',
    ], { cwd: path.resolve('.') }),
    (error) => {
      const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
      assert.match(output, /include-staging/)
      assert.match(output, /confirm-staging-handoff/)
      assert.match(output, /allow-write/)
      return true
    },
  )
})

test('refuses default master-plan staging writes without a staging authorization file', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--company-id',
      'company-1',
      '--environment',
      'staging',
      '--reviewed-by',
      'reviewer-1',
      '--include-staging',
      '--confirm-staging-handoff',
      '--allow-write',
    ], { cwd: path.resolve('.') }),
    (error) => {
      const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
      assert.match(output, /staging-authorization-file/)
      return true
    },
  )
})

test('normalizes pg DATE values returned as Date objects before writing staging carriers', async () => {
  const module = await import(pathToFileURL(SCRIPT_PATH))

  assert.equal(
    module.normalizeDateOnly(new Date('2026-06-28T16:00:00.000Z')),
    '2026-06-28',
  )
  assert.equal(module.normalizeDateOnly('2026-07-02T05:00:00.000Z'), '2026-07-02')
})

test('keeps the explicit staging TLS policy when the connection string includes sslmode', async () => {
  const module = await import(pathToFileURL(SCRIPT_PATH))
  const config = module.buildStagingPgClientConfig(
    'postgresql://user:secret@example.test:5432/postgres?sslmode=require&application_name=staging-replay',
  )

  assert.doesNotMatch(config.connectionString, /sslmode=/)
  assert.match(config.connectionString, /application_name=staging-replay/)
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
})

test('propagates a blocked production evidence pipeline into the staging summary', async () => {
  const module = await import(pathToFileURL(SCRIPT_PATH))
  const pipeline = module.summarizePipelineRun({
    stdout: JSON.stringify({
      status: 'blocked',
      productionReady: false,
      missingSourceExports: [{
        evidenceType: 'durationCalibrationEvidence',
        source: 'durationSampleCoverageEvidence',
      }],
    }),
  })

  assert.equal(pipeline.status, 'blocked')
  assert.deepEqual(pipeline.blockers, [
    'production_evidence_pipeline_blocked',
    'production_evidence_pipeline_missing_source:durationCalibrationEvidence:durationSampleCoverageEvidence',
  ])
})

test('marks staging evidence results with blockers as unsuccessful for CLI callers', async () => {
  const module = await import(pathToFileURL(SCRIPT_PATH))

  assert.equal(module.stagingEvidenceResultRequiresNonzeroExit({ status: 'blocked', blockers: [] }), true)
  assert.equal(module.stagingEvidenceResultRequiresNonzeroExit({
    status: 'staging_runtime_evidence_written_with_pipeline_blockers',
    blockers: ['production_evidence_pipeline_blocked'],
  }), true)
  assert.equal(module.stagingEvidenceResultRequiresNonzeroExit({
    status: 'staging_runtime_evidence_written',
    blockers: [],
  }), false)
})

test('passes the staging run output root to the production evidence pipeline', async () => {
  const module = await import(pathToFileURL(SCRIPT_PATH))
  const outputRoot = path.resolve('project-testing/reports/default-master-plan-production-readiness/staging-replay-test/runtime-pipeline')
  const args = module.buildPipelineArgs({
    pipelineArgs: [
      'node',
      'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
      '--baseline-id', 'baseline-1',
      '--project-id', 'project-1',
    ],
  }, outputRoot)

  const outputRootIndex = args.indexOf('--output-root')
  assert.equal(outputRootIndex >= 0, true)
  assert.equal(args[outputRootIndex + 1], outputRoot)
})

test('builds staging dependency edges from candidate baseline lineage metadata', async () => {
  const module = await import(pathToFileURL(SCRIPT_PATH))
  const edges = module.buildDependencyEdges({
    publicationKey: 'runtime.default_master_plan.project-1',
    items: [
      {
        id: 'baseline-item-1',
        generation_metadata: { clientRowId: 'generated:school:BTMP-BASE-01' },
      },
      {
        id: 'baseline-item-2',
        generation_metadata: {
          clientRowId: 'generated:school:BTMP-SCH-01',
          predecessorDependencies: [{
            clientRowId: 'generated:school:BTMP-BASE-01',
            dependencyType: 'FS',
            lagDays: 2,
            intentCode: 'business_type_master_plan_profile_sequence',
          }],
        },
      },
    ],
    taskIdByItemId: new Map([
      ['baseline-item-1', 'task-1'],
      ['baseline-item-2', 'task-2'],
    ]),
  })

  assert.equal(edges.length, 1)
  assert.deepEqual(edges[0], {
    edgeId: 'default-master-plan:runtime.default_master_plan.project-1:generated:school:BTMP-BASE-01->generated:school:BTMP-SCH-01',
    fromGeneratedRowId: 'generated:school:BTMP-BASE-01',
    toGeneratedRowId: 'generated:school:BTMP-SCH-01',
    taskId: 'task-2',
    dependencyTaskId: 'task-1',
    dependencyType: 'FS',
    lagDays: 2,
    sourceType: 'construction_organization_plan_network',
    sourceRefId: null,
    sourceEventId: 'release:runtime.default_master_plan.project-1',
    intent: 'business_type_master_plan_profile_sequence',
  })
})

test('reports dependency anchors outside the selected candidate scope instead of silently omitting them', async () => {
  const module = await import(pathToFileURL(SCRIPT_PATH))
  const plan = module.buildDependencyMaterializationPlan({
    publicationKey: 'runtime.default_master_plan.project-1',
    items: [
      {
        id: 'baseline-item-1',
        generation_metadata: { clientRowId: 'generated:school:BTMP-BASE-01' },
      },
      {
        id: 'baseline-item-2',
        generation_metadata: {
          clientRowId: 'generated:school:BTMP-SCH-01',
          predecessorDependencies: [{
            clientRowId: 'generated:school:template:foundation-anchor',
            dependencyType: 'FS',
            lagDays: 0,
            intentCode: 'business_type_profile_phase_anchor',
          }],
        },
      },
    ],
    taskIdByItemId: new Map([
      ['baseline-item-1', 'task-1'],
      ['baseline-item-2', 'task-2'],
    ]),
  })

  assert.equal(plan.edges.length, 0)
  assert.deepEqual(plan.unresolvedExternalDependencies, [{
    fromGeneratedRowId: 'generated:school:template:foundation-anchor',
    toGeneratedRowId: 'generated:school:BTMP-SCH-01',
    dependencyType: 'FS',
    lagDays: 0,
    intent: 'business_type_profile_phase_anchor',
    reason: 'predecessor_task_outside_selected_candidate_scope',
  }])
})

test('reports the selected environment target before staging writes are unlocked', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-staging-runtime-target-'))
  const envFile = path.join(root, '.env')
  await writeFile(envFile, [
    'SUPABASE_URL=https://wwdrkjnbvcbfytwnnyvs.supabase.co',
    'SUPABASE_MIGRATION_URL=postgresql://postgres.wwdrkjnbvcbfytwnnyvs:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
    '',
  ].join('\n'), 'utf8')

  try {
    const module = await import(pathToFileURL(SCRIPT_PATH))
    const result = await module.runDefaultMasterPlanStagingRuntimeEvidence({
      envFile,
      baselineId: 'baseline-reviewed',
      projectId: 'project-1',
      companyId: 'company-1',
      environment: 'staging',
      reviewedBy: 'reviewer-1',
    })

    assert.equal(result.status, 'blocked')
    assert.equal(result.target.supabaseProjectRef, 'wwdrkjnbvcbfytwnnyvs')
    assert.equal(result.target.databaseHost, 'aws-0-ap-southeast-1.pooler.supabase.com')
    assert.equal(result.target.connectionSource, 'SUPABASE_MIGRATION_URL')
    assert.match(result.target.envFileRef, /workbuddy-staging-runtime-target-/)
    assert.doesNotMatch(JSON.stringify(result.target), /secret/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('requires duration-sample authorization before a staging replay can connect', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-staging-runtime-authorization-'))
  const envFile = path.join(root, '.env')
  const authorizationFile = path.join(root, 'staging-authorization.json')
  await writeFile(envFile, [
    'SUPABASE_URL=https://wwdrkjnbvcbfytwnnyvs.supabase.co',
    'SUPABASE_MIGRATION_URL=postgresql://postgres.wwdrkjnbvcbfytwnnyvs:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
    '',
  ].join('\n'), 'utf8')
  await writeFile(authorizationFile, JSON.stringify({
    status: 'authorized',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    companyId: 'company-1',
    environment: 'staging',
    authorizedBy: 'reviewer-1',
    authorizedAt: '2026-07-10T12:00:00.000Z',
    productionReady: false,
    allowedOperations: [
      'staging_task_carrier_write',
      'staging_dependency_write',
      'staging_runtime_publication',
      'staging_rollback_drill',
    ],
  }), 'utf8')

  try {
    const module = await import(pathToFileURL(SCRIPT_PATH))
    const result = await module.runDefaultMasterPlanStagingRuntimeEvidence({
      envFile,
      stagingAuthorizationFile: authorizationFile,
      baselineId: 'baseline-reviewed',
      projectId: 'project-1',
      companyId: 'company-1',
      environment: 'staging',
      reviewedBy: 'reviewer-1',
      includeStaging: true,
      confirmStagingHandoff: true,
      allowWrite: true,
    })

    assert.equal(result.status, 'blocked')
    assert.ok(result.blockers.includes('staging_authorization_operation_required:staging_duration_sample_write'))
    assert.equal(result.mutationBoundary.writesDatabase, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
