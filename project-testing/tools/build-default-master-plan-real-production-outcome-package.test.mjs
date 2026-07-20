import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanRealProductionOutcomePackage,
} from './build-default-master-plan-real-production-outcome-package.mjs'

test('builds a no-write real production outcome package with production placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      output: outputPath,
      targetEnvironment: 'production',
      exportedBy: 'production-release-operator',
      now: new Date('2026-07-02T13:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-real-production-outcome-package/v1')
    assert.equal(report.status, 'real_production_outcome_required')
    assert.equal(report.productionReady, false)
    assert.deepEqual(report.blockers, ['real_production_outcome_file_required'])
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.publicationKey, 'default-master-plan-runtime-publication-1')
    assert.equal(report.targetEnvironment, 'production')
    assert.equal(report.realProductionOutcomeTemplate.example.baselineId, 'baseline-1')
    assert.equal(report.realProductionOutcomeTemplate.example.projectId, 'project-1')
    assert.equal(report.realProductionOutcomeTemplate.example.publicationKey, 'default-master-plan-runtime-publication-1')
    assert.equal(report.realProductionOutcomeTemplate.example.environment, 'production')
    assert.equal(report.realProductionOutcomeTemplate.example.evidenceRef, '<path-to-real-production-outcome.json>#sha256=<64hex>')
    assert.equal(report.realProductionOutcomeTemplate.example.evidenceRef.includes('real-production-outcome:'), false)
    assert.equal(report.realProductionOutcomeTemplate.evidenceRefPolicy.rawInputAcceptedPrefix, 'file_path_sha256')
    assert.equal(report.realProductionOutcomeTemplate.evidenceRefPolicy.finalSourceExportPrefix, 'real_production_outcome_export')
    assert.equal(report.realProductionOutcomeTemplate.evidenceRefPolicy.finalReadinessRequiresSourceExportRef, true)
    assert.match(report.realProductionOutcomeTemplate.evidenceRefPolicy.sourceExporterRewrite, /real_production_outcome_export:/)
    assert.equal(report.realProductionOutcomeTemplate.example.acceptedBy, 'production-owner:<user-id-or-uuid>')
    assert.match(report.realProductionOutcomeTemplate.example.runtimePublicationEvidenceRef, /^duration_learning_runtime_publications_export:/)
    assert.match(report.realProductionOutcomeTemplate.example.runtimeConsumptionEvidenceRef, /^duration_learning_runtime_consumptions_export:/)
    assert.match(report.realProductionOutcomeTemplate.example.apiReadSmokeEvidenceRef, /^api_read_smoke_export:/)
    assert.match(report.realProductionOutcomeTemplate.example.uiConsumptionSmokeEvidenceRef, /^ui_consumption_smoke_export:/)
    assert.match(report.realProductionOutcomeTemplate.example.criticalPathReadbackEvidenceRef, /^critical_path_readback_export:/)
    assert.match(report.realProductionOutcomeTemplate.example.rollbackEvidenceRef, /^rollback_verification_export:/)
    assert.equal(report.realProductionOutcomeTemplate.requiredFields.includes('acceptedBy'), true)
    assert.equal(report.realProductionOutcomeTemplate.requiredFields.includes('runtimeConsumptionEvidenceRef'), true)
    assert.equal(report.nextCommands.sourceExport.includes('--environment production'), true)
    assert.equal(report.nextCommands.sourceExport.includes('--real-production-outcome <real-production-outcome.json>'), true)
    assert.equal(report.nextCommands.sourceExport.includes('staging-runtime'), false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.status, 'real_production_outcome_required')
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Real Production Outcome Required Fields/)
    assert.match(markdown, /runtimePublicationEvidenceRef/)
    assert.match(markdown, /runtimeConsumptionEvidenceRef/)
    assert.match(markdown, /Final readiness requires `real_production_outcome_export:`/)
    assert.doesNotMatch(markdown, /real-production-outcome:<path>/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('adds target fingerprint fields when runtime material template is stale', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture({
    requiredFields: [
      'schemaVersion',
      'status',
      'environment',
      'baselineId',
      'projectId',
      'publicationKey',
      'evidenceRef',
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:02:00.000Z'),
    })

    assert.equal(report.realProductionOutcomeTemplate.requiredFields.includes('target'), true)
    assert.equal(report.realProductionOutcomeTemplate.requiredFields.includes('acceptedBy'), true)
    assert.equal(report.realProductionOutcomeTemplate.example.target.supabaseProjectRef, '<production-supabase-project-ref>')
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /target/)
    assert.match(markdown, /production-supabase-project-ref/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('marks a complete production outcome file ready for source export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, realProductionOutcomeFixture())

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:05:00.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_ready_for_source_export')
    assert.deepEqual(report.blockers, [])
    assert.deepEqual(report.validationBlockers, [])
    assert.equal(report.realProductionOutcome.status, 'verified')
    assert.equal(report.realProductionOutcome.environment, 'production')
    assert.equal(report.realProductionOutcome.acceptedBy, 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70')
    assert.equal(report.realProductionOutcome.target.supabaseProjectRef, 'production-ref-1')
    assert.equal(report.realProductionOutcome.target.databaseHost, 'db.production-ref-1.supabase.co')
    assert.equal(report.realProductionOutcome.target.connectionSource, 'SUPABASE_MIGRATION_URL')
    assert.equal(report.nextCommands.sourceExport.includes(`--real-production-outcome ${realOutcomePath}`), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production outcome file without a target environment fingerprint', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  const { target: _target, ...realOutcomeWithoutTarget } = realProductionOutcomeFixture()
  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, realOutcomeWithoutTarget)

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:07:00.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('real_production_outcome_target_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_target_supabase_project_ref_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_target_database_host_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_target_connection_source_required'), true)
    assert.equal(report.realProductionOutcome, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production outcome file with a staging target fingerprint', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, {
    ...realProductionOutcomeFixture(),
    target: {
      envFileRef: 'server/.env',
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'staging',
    },
  })

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:08:00.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('real_production_outcome_target_environment_mismatch'), true)
    assert.equal(report.productionReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production outcome file without a target environment value', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  const realOutcome = realProductionOutcomeFixture()
  const { environment: _targetEnvironment, ...targetWithoutEnvironment } = realOutcome.target
  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, {
    ...realOutcome,
    target: targetWithoutEnvironment,
  })

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:08:30.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('real_production_outcome_target_environment_required'), true)
    assert.equal(report.realProductionOutcome, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production outcome file when target fingerprint values are malformed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, {
    ...realProductionOutcomeFixture(),
    target: {
      envFileRef: 'deploy/env/production.env',
      supabaseProjectRef: 'production project',
      databaseHost: 'localhost',
      connectionSource: 'manual connection string',
      environment: 'production',
    },
  })

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:08:45.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('real_production_outcome_target_supabase_project_ref_format_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_target_database_host_format_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_target_connection_source_format_required'), true)
    assert.equal(report.realProductionOutcome, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production outcome file when material evidence refs are not auditable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, {
    ...realProductionOutcomeFixture(),
    runtimePublicationEvidenceRef: 'manual-note-runtime-publication',
    runtimeConsumptionEvidenceRef: 'manual-note-runtime-consumption',
    apiReadSmokeEvidenceRef: 'manual-note-api-smoke',
    uiConsumptionSmokeEvidenceRef: 'manual-note-ui-smoke',
    criticalPathReadbackEvidenceRef: 'manual-note-critical-path',
    rollbackEvidenceRef: 'manual-note-rollback',
  })

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:09:00.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('real_production_outcome_runtime_publication_evidence_ref_auditable_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_api_read_smoke_evidence_ref_auditable_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_ui_consumption_smoke_evidence_ref_auditable_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_critical_path_readback_evidence_ref_auditable_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_rollback_evidence_ref_auditable_required'), true)
    assert.equal(report.realProductionOutcome, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production outcome file when material evidence refs are ordinary files instead of source-export refs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, realProductionOutcomeFixture({
    runtimePublicationEvidenceRef: `project-testing/reports/default-master-plan-production-readiness/runtime-publication-evidence.json#sha256=${'1'.repeat(64)}`,
    runtimeConsumptionEvidenceRef: `project-testing/reports/default-master-plan-production-readiness/runtime-consumption-evidence.json#sha256=${'6'.repeat(64)}`,
    apiReadSmokeEvidenceRef: `project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json#sha256=${'2'.repeat(64)}`,
    uiConsumptionSmokeEvidenceRef: `project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json#sha256=${'3'.repeat(64)}`,
    criticalPathReadbackEvidenceRef: `project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=${'4'.repeat(64)}`,
    rollbackEvidenceRef: `project-testing/reports/default-master-plan-production-readiness/rollback-verification.json#sha256=${'5'.repeat(64)}`,
  }))

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:09:05.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('real_production_outcome_runtime_publication_evidence_ref_source_export_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_api_read_smoke_evidence_ref_source_export_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_ui_consumption_smoke_evidence_ref_source_export_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_critical_path_readback_evidence_ref_source_export_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_rollback_evidence_ref_source_export_required'), true)
    assert.equal(report.realProductionOutcome, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production outcome file when acceptedAt or approvalRef are not auditable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, {
    ...realProductionOutcomeFixture(),
    acceptedAt: 'yesterday',
    approvalRef: 'manual-note-approval',
  })

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:09:15.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('real_production_outcome_accepted_at_iso_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_approval_ref_auditable_required'), true)
    assert.equal(report.realProductionOutcome, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production outcome file when acceptedBy is a placeholder or weak actor', async () => {
  const weakActors = [
    '<human-production-owner-or-authorized-reviewer>',
    'unknown',
    'manual-note-owner',
    'test-user',
  ]

  for (const acceptedBy of weakActors) {
    const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
    const handoffPath = path.join(root, 'operator-handoff.json')
    const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
    const realOutcomePath = path.join(root, 'real-production-outcome.json')
    const outputPath = path.join(root, 'real-production-outcome-package.json')

    await writeJson(handoffPath, operatorHandoffFixture())
    await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
    await writeJson(realOutcomePath, {
      ...realProductionOutcomeFixture(),
      acceptedBy,
    })

    try {
      const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
        handoff: handoffPath,
        runtimeMaterialPackage: runtimeMaterialPackagePath,
        realProductionOutcome: realOutcomePath,
        output: outputPath,
        targetEnvironment: 'production',
        now: new Date('2026-07-02T13:09:20.000Z'),
      })

      assert.equal(report.status, 'real_production_outcome_blocked')
      assert.equal(report.blockers.includes('real_production_outcome_accepted_by_auditable_required'), true)
      assert.equal(report.realProductionOutcome, null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('blocks a production outcome file when the top-level evidence ref is not auditable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, {
    ...realProductionOutcomeFixture(),
    evidenceRef: 'manual-note-real-outcome',
  })

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:09:30.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('real_production_outcome_evidence_ref_auditable_required'), true)
    assert.equal(report.realProductionOutcome, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks staging controlled replay material as a real production outcome package input', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const realOutcomePath = path.join(root, 'real-production-outcome.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())
  await writeJson(realOutcomePath, {
    ...realProductionOutcomeFixture(),
    environment: 'staging',
  })

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      realProductionOutcome: realOutcomePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:10:00.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('real_production_outcome_production_or_live_environment_required'), true)
    assert.equal(report.blockers.includes('real_production_outcome_environment_mismatch'), true)
    assert.equal(report.productionReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks real production outcome package when handoff root hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, {
    ...operatorHandoffFixture(),
    comparisonBasis: {
      selectedSource: 'manual_comparison_scenario',
    },
  })
  await writeJson(runtimeMaterialPackagePath, runtimeMaterialPackageFixture())

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:11:00.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('operator_handoff_retired_or_low_information_default_master_plan_source'), true)
    assert.equal(report.realProductionOutcome, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks real production outcome package when runtime material root hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-outcome-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const outputPath = path.join(root, 'real-production-outcome-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())
  await writeJson(runtimeMaterialPackagePath, {
    ...runtimeMaterialPackageFixture(),
    boundaryPolicy: {
      fallbackApplied: 'legacy_template_reverse_inference',
    },
  })

  try {
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage({
      handoff: handoffPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      output: outputPath,
      targetEnvironment: 'production',
      now: new Date('2026-07-02T13:11:30.000Z'),
    })

    assert.equal(report.status, 'real_production_outcome_blocked')
    assert.equal(report.blockers.includes('runtime_material_package_retired_or_low_information_default_master_plan_source'), true)
    assert.equal(report.realProductionOutcome, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function operatorHandoffFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    environment: 'staging',
    exportedBy: 'release-operator-1',
    stagingAuthorization: {
      status: 'authorized',
      authorizedBy: '郑俊红',
      authorizationDecision: 'school_staging_write_publish_rollback_allowed',
      productionReady: false,
    },
  }
}

function runtimeMaterialPackageFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-material-package/v1',
    status: 'runtime_materials_resolved',
    productionReady: false,
    realProductionOutcomeTemplate: {
      schemaVersion: 'workbuddy-default-master-plan-real-production-outcome/v1',
      requiredFields: overrides.requiredFields ?? [
        'schemaVersion',
        'status',
      'environment',
      'target',
      'baselineId',
      'projectId',
      'publicationKey',
        'evidenceRef',
        'acceptedBy',
        'acceptedAt',
        'approvalRef',
        'runtimePublicationEvidenceRef',
        'runtimeConsumptionEvidenceRef',
        'apiReadSmokeEvidenceRef',
        'uiConsumptionSmokeEvidenceRef',
        'criticalPathReadbackEvidenceRef',
        'rollbackEvidenceRef',
      ],
      example: {},
    },
  }
}

function realProductionOutcomeFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-real-production-outcome/v1',
    status: 'verified',
    environment: 'production',
    target: {
      envFileRef: 'deploy/env/production.env',
      supabaseProjectRef: 'production-ref-1',
      databaseHost: 'db.production-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'production',
    },
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'real-production-outcome:evidence#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    acceptedBy: 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-02T13:04:00.000Z',
    approvalRef: 'release:window-1',
    runtimePublicationEvidenceRef: `duration_learning_runtime_publications_export:project-testing/reports/default-master-plan-production-readiness/duration-learning-runtime-publications-export.json#sha256=${'1'.repeat(64)}`,
    runtimeConsumptionEvidenceRef: `duration_learning_runtime_consumptions_export:project-testing/reports/default-master-plan-production-readiness/duration-learning-runtime-consumptions-export.json#sha256=${'6'.repeat(64)}`,
    apiReadSmokeEvidenceRef: `api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/api-read-smoke-export.json#sha256=${'2'.repeat(64)}`,
    uiConsumptionSmokeEvidenceRef: `ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke-export.json#sha256=${'3'.repeat(64)}`,
    criticalPathReadbackEvidenceRef: `critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback-export.json#sha256=${'4'.repeat(64)}`,
    rollbackEvidenceRef: `rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/rollback-verification-export.json#sha256=${'5'.repeat(64)}`,
    ...overrides,
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
