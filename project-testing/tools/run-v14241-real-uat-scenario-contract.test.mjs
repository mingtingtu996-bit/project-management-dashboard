import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { SUPPORTED_SCENARIOS, runRealUatScenarioContract } from './run-v14241-real-uat-scenario-contract.mjs'

const SCENARIO_META = {
  'REAL-UAT-07': {
    title: '图纸/证照/验收资料与任务责任链',
    owners: ['document-owner', 'security-owner', 'uat-tester'],
    artifacts: ['real-uat-07-document-chain.json', 'file-permission-readback.json', 'retention-delete-readback.json'],
    extras: {
      'targetRefs.documentPackageRef': 'document-package',
      'targetRefs.storageBucketRef': 'storage-bucket',
      'expectedEvidenceRefs.retentionPolicyRef': 'retention-policy',
    },
  },
  'REAL-UAT-08': {
    title: '材料/风险/问题/待办/通知闭环',
    owners: ['business-loop-owner', 'notification-owner', 'uat-tester'],
    artifacts: ['real-uat-08-business-loop.json', 'notification-readback.json', 'responsibility-chain-readback.json'],
    extras: {
      'targetRefs.materialRiskIssueSeedRef': 'material-risk-issue-seed',
      'actorRefs.responsibleUserRef': 'responsible-user',
      'expectedEvidenceRefs.notificationChannelRef': 'notification-channel',
    },
  },
  'REAL-UAT-09': {
    title: 'Dashboard/CompanyCockpit/Reports 指标口径与快照血缘',
    owners: ['bi-owner', 'backend-owner', 'uat-tester'],
    artifacts: ['real-uat-09-bi-ssot.json', 'metric-lineage-readback.json', 'report-export-sample.xlsx'],
    extras: {
      'targetRefs.snapshotRef': 'snapshot',
      'targetRefs.metricRegistryRef': 'metric-registry',
      'expectedEvidenceRefs.exportSampleRef': 'export-sample',
    },
  },
  'REAL-UAT-10': {
    title: '导入/导出/PDF-XLSX 报表与权限',
    owners: ['export-owner', 'security-owner', 'uat-tester'],
    artifacts: ['real-uat-10-import-export.json', 'export-open-validation.json', 'permission-negative-download.json'],
    extras: {
      'targetRefs.importFileSetRef': 'import-file-set',
      'targetRefs.exportValidatorRef': 'export-validator',
      'expectedEvidenceRefs.permissionNegativeRef': 'permission-negative',
    },
  },
  'REAL-UAT-11': {
    title: '容量/性能/慢查询/热点保护',
    owners: ['performance-owner', 'database-owner', 'sre-owner'],
    artifacts: ['real-uat-11-performance-pressure.json', 'db-query-log.json', 'browser-trace.zip'],
    extras: {
      'targetRefs.largeDatasetRef': 'large-dataset',
      'targetRefs.loadWindowRef': 'load-window',
      'expectedEvidenceRefs.queryLogRef': 'query-log',
    },
  },
  'REAL-UAT-12': {
    title: '安全负向：XSS/CSRF/SSRF/限流/恶意文件/密钥',
    owners: ['security-owner', 'sre-owner', 'uat-tester'],
    artifacts: ['real-uat-12-security-negative.json', 'csp-header-readback.json', 'advisor-security-readback.json'],
    extras: {
      'targetRefs.securityWindowRef': 'security-window',
      'targetRefs.payloadSetRef': 'payload-set',
      'expectedEvidenceRefs.headerReadbackRef': 'header-readback',
    },
  },
  'REAL-UAT-13': {
    title: '发布/回滚/健康检查/前端部署回滚',
    owners: ['release-owner', 'sre-owner', 'rollback-owner'],
    artifacts: ['real-uat-13-release-rollback.json', 'healthcheck-readback.json', 'rollback-drill.json'],
    extras: {
      'targetRefs.releaseVersionRef': 'release-version',
      'targetRefs.healthcheckUrlRef': 'healthcheck-url',
      rollbackRef: 'rollback',
    },
  },
  'REAL-UAT-14': {
    title: '备份恢复/迁移治理/schema drift/旧对象处置',
    owners: ['database-owner', 'migration-owner', 'sre-owner'],
    artifacts: ['real-uat-14-backup-restore-migration.json', 'schema-drift-readback.json', 'old-object-disposition.json'],
    extras: {
      'targetRefs.backupRef': 'backup',
      'targetRefs.restoreDrillDbRef': 'restore-drill-db',
      'targetRefs.migrationLedgerRef': 'migration-ledger',
      'targetRefs.oldObjectDispositionRef': 'old-object-disposition',
    },
  },
  'REAL-UAT-15': {
    title: '可观测性/告警/事故响应 Runbook',
    owners: ['sre-owner', 'support-owner', 'incident-commander'],
    artifacts: ['real-uat-15-observability-incident.json', 'alert-delivery-proof.json', 'incident-review.md'],
    extras: {
      'targetRefs.alertRecipientRef': 'alert-recipient',
      'targetRefs.onCallScheduleRef': 'on-call-schedule',
      'targetRefs.runbookRef': 'runbook',
      'actorRefs.incidentCommanderRef': 'incident-commander',
    },
  },
  'REAL-UAT-16': {
    title: '管理员/客服支持/审计/数据补偿工具',
    owners: ['support-owner', 'security-owner', 'database-owner'],
    artifacts: ['real-uat-16-support-ops.json', 'support-audit-readback.json', 'data-compensation-proof.json'],
    extras: {
      'targetRefs.ticketRef': 'ticket',
      'actorRefs.supportAccountRef': 'support-account',
      'targetRefs.auditExportRef': 'audit-export',
      'targetRefs.compensationToolRef': 'compensation-tool',
    },
  },
}

const requiredMetadata = [
  'environment',
  'baseUrl',
  'actorRefs',
  'companyId',
  'projectId',
  'startedAt',
  'finishedAt',
  'commandOrManualScript',
  'screenshotsOrTrace',
  'apiFailureSummary',
  'consoleErrorSummary',
  'cleanupOrRollbackReadback',
]

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function setByPath(target, dottedPath, value) {
  const parts = dottedPath.split('.')
  let current = target
  for (const part of parts.slice(0, -1)) {
    current[part] ??= {}
    current = current[part]
  }
  current[parts.at(-1)] = value
}

function scenario(id) {
  const meta = SCENARIO_META[id]
  return {
    id,
    title: meta.title,
    priority: 'P0',
    evidenceOwners: meta.owners,
    tiers: [{ name: 'UAT' }, { name: 'staging' }, { name: 'live' }],
    evidenceContract: {
      requiredArtifacts: meta.artifacts,
      requiredMetadata,
      rejectIf: ['mock-api-only', 'local-only', 'dry-run-only'],
    },
  }
}

async function fixtureRoot(id = 'REAL-UAT-07') {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-scenario-'))
  const matrixFile = join(root, 'matrix.json')
  await writeJson(matrixFile, {
    schemaVersion: 'test',
    scenarios: [scenario(id)],
  })
  return { root, matrixFile }
}

function envTarget(root, ref = 'secret-ref://operator/value') {
  return {
    UAT: {},
    staging: {
      apiBaseUrlRef: ref,
      clientBaseUrlRef: ref,
      deploymentVersionRef: 'deploy://staging/v1',
      artifactRoot: `${root}/evidence/staging`,
      writeApprovalRef: 'approval://staging',
      cleanupOwner: 'cleanup-owner',
      retentionOwner: 'retention-owner',
      roleAccountRefs: {
        company_admin: ref,
        project_admin: ref,
        editor: 'role://editor',
        outsider: 'role://outsider',
      },
      anonPolicyRef: 'policy://anon',
      credentialRefs: {
        testUserEmailRef: ref,
        testUserPasswordRef: ref,
      },
    },
    live: {},
  }
}

function readyScenarioTier(id, ref = 'secret-ref://operator/value') {
  const tier = {
    targetRefs: {
      companyIdRef: ref,
      projectIdRef: ref,
    },
    actorRefs: {
      primaryTesterRef: 'actor://primary',
    },
    expectedEvidenceRefs: {},
    cleanupRef: 'cleanup://scenario',
    approvalRef: 'approval://scenario',
    rollbackRef: 'rollback://scenario',
    monitoringRef: 'monitor://scenario',
  }
  for (const [path] of Object.entries(SCENARIO_META[id].extras)) {
    setByPath(tier, path, ref)
  }
  return tier
}

function handoff({ root, id = 'REAL-UAT-07', ref = 'secret-ref://operator/value', includeExtras = true } = {}) {
  const meta = SCENARIO_META[id]
  const tier = readyScenarioTier(id, ref)
  if (!includeExtras) {
    for (const path of Object.keys(meta.extras)) {
      setByPath(tier, path, '')
    }
  }
  return {
    schemaVersion: 'workbuddy/v14241-real-env-handoff/v1',
    releaseDir: root,
    environmentTargets: envTarget(root, ref),
    scenarios: {
      [id]: {
        id,
        evidenceOwners: Object.fromEntries(meta.owners.map((owner) => [owner, `owner://${owner}`])),
        tiers: {
          staging: tier,
        },
      },
    },
  }
}

async function writeResolvedEnv(root) {
  const envFile = join(root, 'real-env.env')
  await writeFile(envFile, [
    'VALUE=https://staging.example.test',
    'USER=uat@example.test',
    'PASSWORD=redacted-value',
    'ID=ref-1',
  ].join('\n'), 'utf8')
  const ref = (key) => `env://${envFile.replace(/\\/g, '/')}#${key}`
  return {
    ref,
    genericRef: ref('ID'),
    urlRef: ref('VALUE'),
    userRef: ref('USER'),
    passRef: ref('PASSWORD'),
  }
}

function handoffWithEnvRefs({ root, id }) {
  return writeResolvedEnv(root).then(({ genericRef, urlRef, userRef, passRef }) => {
    const doc = handoff({ root, id, ref: genericRef })
    doc.environmentTargets.staging.apiBaseUrlRef = urlRef
    doc.environmentTargets.staging.clientBaseUrlRef = urlRef
    doc.environmentTargets.staging.roleAccountRefs.company_admin = userRef
    doc.environmentTargets.staging.roleAccountRefs.project_admin = userRef
    doc.environmentTargets.staging.credentialRefs.testUserEmailRef = userRef
    doc.environmentTargets.staging.credentialRefs.testUserPasswordRef = passRef
    return doc
  })
}

async function writePassingEvidence(root, id, environment = 'staging', { withExecutionTrace = true } = {}) {
  const evidenceRoot = join(root, 'evidence', 'staging')
  await mkdir(evidenceRoot, { recursive: true })
  const meta = SCENARIO_META[id]
  const main = {
    status: 'pass',
    environment,
    baseUrl: 'https://staging.example.test',
    actorRefs: ['actor://primary'],
    companyId: 'company-1',
    projectId: 'project-1',
    startedAt: '2026-07-07T00:00:00.000Z',
    finishedAt: '2026-07-07T00:01:00.000Z',
    commandOrManualScript: 'node project-testing/tools/run-v14241-real-uat-scenario-contract.mjs',
    screenshotsOrTrace: ['trace.zip'],
    apiTrace: withExecutionTrace ? [{ label: 'verified-real-environment-operation', status: 200 }] : [],
    apiFailureSummary: [],
    consoleErrorSummary: [],
    cleanupOrRollbackReadback: { status: 'pass' },
  }
  for (const [index, artifact] of meta.artifacts.entries()) {
    if (artifact.endsWith('.json')) {
      await writeJson(join(evidenceRoot, artifact), index === 0 ? main : { status: 'pass', environment })
    } else {
      await writeFile(join(evidenceRoot, artifact), 'artifact-placeholder', 'utf8')
    }
  }
  return evidenceRoot
}

test('blocks REAL-UAT-07 when scenario-specific handoff refs are missing', async () => {
  const { root, matrixFile } = await fixtureRoot('REAL-UAT-07')
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, handoff({ root, id: 'REAL-UAT-07', includeExtras: false }))

  const report = await runRealUatScenarioContract({
    scenarioId: 'REAL-UAT-07',
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(output, 'utf8')

  assert.equal(report.status, 'blocked_missing_real_handoff_inputs')
  assert.equal(report.commandsExecuted, 0)
  assert.equal(report.canCloseScenarioTier, false)
  assert.ok(report.blockers.includes('scenario:targetRefs.documentPackageRef'))
  assert.ok(report.blockers.includes('scenario:targetRefs.storageBucketRef'))
  assert.ok(report.blockers.includes('scenario:expectedEvidenceRefs.retentionPolicyRef'))
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('blocks ready handoff when explicit real-environment unlock flags are missing', async () => {
  const { root, matrixFile } = await fixtureRoot('REAL-UAT-07')
  const handoffFile = join(root, 'handoff.json')
  await writeJson(handoffFile, handoff({ root, id: 'REAL-UAT-07' }))

  const report = await runRealUatScenarioContract({
    scenarioId: 'REAL-UAT-07',
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output: join(root, 'report.json'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'blocked_missing_execution_unlock')
  assert.equal(report.commandsExecuted, 0)
  assert.deepEqual(report.blockers, [
    'missing --include-staging',
    'missing --confirm-real-handoff',
    'missing --allow-write',
  ])
})

test('blocks ready and unlocked handoff when refs are not locally resolvable', async () => {
  const { root, matrixFile } = await fixtureRoot('REAL-UAT-07')
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, handoff({ root, id: 'REAL-UAT-07' }))

  const report = await runRealUatScenarioContract({
    scenarioId: 'REAL-UAT-07',
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output,
    flags: {
      '--include-staging': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(output, 'utf8')

  assert.equal(report.status, 'blocked_unresolvable_execution_refs')
  assert.equal(report.commandsExecuted, 0)
  assert.ok(report.blockers.includes('apiBase:unsupported_ref'))
  assert.ok(report.blockers.includes('documentPackageId:unsupported_ref'))
  assert.ok(report.blockers.includes('storageBucketRef:unsupported_ref'))
  assert.ok(report.blockers.includes('retentionPolicyRef:unsupported_ref'))
  assert.equal(report.resolvedRefs.password.valueWrittenToReport, false)
  assert.match(written, /secret-ref:\/\/operator\/value/)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('blocks resolved handoff when required scenario evidence artifacts are absent', async () => {
  const { root, matrixFile } = await fixtureRoot('REAL-UAT-07')
  const handoffFile = join(root, 'handoff.json')
  await writeJson(handoffFile, await handoffWithEnvRefs({ root, id: 'REAL-UAT-07' }))

  const report = await runRealUatScenarioContract({
    scenarioId: 'REAL-UAT-07',
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output: join(root, 'report.json'),
    evidenceRoot: join(root, 'evidence', 'staging'),
    flags: {
      '--include-staging': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'blocked_required_scenario_evidence_missing')
  assert.equal(report.commandsExecuted, 0)
  assert.ok(report.blockers.includes('artifact:real-uat-07-document-chain.json'))
  assert.ok(report.blockers.includes('environment:staging:missing_or_mismatched'))
})

test('passes a tier only when refs resolve and the scenario evidence contract is complete for that tier', async () => {
  const { root, matrixFile } = await fixtureRoot('REAL-UAT-07')
  const handoffFile = join(root, 'handoff.json')
  const evidenceRoot = await writePassingEvidence(root, 'REAL-UAT-07', 'staging')
  await writeJson(handoffFile, await handoffWithEnvRefs({ root, id: 'REAL-UAT-07' }))

  const report = await runRealUatScenarioContract({
    scenarioId: 'REAL-UAT-07',
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output: join(root, 'report.json'),
    evidenceRoot,
    flags: {
      '--include-staging': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'passed')
  assert.equal(report.canCloseScenarioTier, true)
  assert.equal(report.closesRealEnvironmentTier, true)
  assert.equal(report.commandsExecuted, 1)
})

test('blocks metadata-only evidence that has no verifiable real-environment execution records', async () => {
  const { root, matrixFile } = await fixtureRoot('REAL-UAT-07')
  const handoffFile = join(root, 'handoff.json')
  const evidenceRoot = await writePassingEvidence(root, 'REAL-UAT-07', 'staging', { withExecutionTrace: false })
  await writeJson(handoffFile, await handoffWithEnvRefs({ root, id: 'REAL-UAT-07' }))

  const report = await runRealUatScenarioContract({
    scenarioId: 'REAL-UAT-07',
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output: join(root, 'report.json'),
    evidenceRoot,
    flags: {
      '--include-staging': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'blocked_required_scenario_evidence_missing')
  assert.equal(report.commandsExecuted, 0)
  assert.equal(report.canCloseScenarioTier, false)
  assert.ok(report.blockers.includes('execution:commandsExecuted=0'))
})

test('keeps evidence from another tier from closing the selected tier', async () => {
  const { root, matrixFile } = await fixtureRoot('REAL-UAT-07')
  const handoffFile = join(root, 'handoff.json')
  const evidenceRoot = await writePassingEvidence(root, 'REAL-UAT-07', 'local')
  await writeJson(handoffFile, await handoffWithEnvRefs({ root, id: 'REAL-UAT-07' }))

  const report = await runRealUatScenarioContract({
    scenarioId: 'REAL-UAT-07',
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output: join(root, 'report.json'),
    evidenceRoot,
    flags: {
      '--include-staging': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'blocked_required_scenario_evidence_missing')
  assert.ok(report.blockers.includes('environment:staging:missing_or_mismatched'))
})

for (const scenarioId of Object.keys(SUPPORTED_SCENARIOS)) {
  test(`${scenarioId} fails closed with incomplete handoff`, async () => {
    const { root, matrixFile } = await fixtureRoot(scenarioId)
    const handoffFile = join(root, 'handoff.json')
    await writeJson(handoffFile, handoff({ root, id: scenarioId, includeExtras: false }))

    const report = await runRealUatScenarioContract({
      scenarioId,
      tier: 'staging',
      handoffFile,
      matrixFile,
      releaseDir: root,
      output: join(root, 'report.json'),
      now: new Date('2026-07-07T00:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked_missing_real_handoff_inputs')
    assert.equal(report.commandsExecuted, 0)
    assert.equal(report.canCloseScenarioTier, false)
  })
}
