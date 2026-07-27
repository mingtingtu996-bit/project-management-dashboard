import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildEvidenceTemplates } from './build-v14241-real-env-evidence-templates.mjs'
import { buildMatrix } from './build-v14241-real-env-uat-matrix.mjs'
import { runRealUatScenarioContract } from './run-v14241-real-uat-scenario-contract.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-evidence-templates-'))
  const matrix = await buildMatrix({ releaseDir: root, now: new Date('2026-07-07T00:00:00.000Z') })
  const matrixFile = join(root, 'matrix.json')
  await import('node:fs/promises').then(({ writeFile }) => writeFile(matrixFile, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8'))
  return { root, matrixFile }
}

test('builds real-environment evidence templates without claiming evidence pass', async () => {
  const { root, matrixFile } = await fixture()
  const outputRoot = join(root, 'templates')

  const { report, reportJson, reportMd } = await buildEvidenceTemplates({
    matrixFile,
    outputRoot,
    selectedTiers: ['staging'],
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const packageJson = await readFile(reportJson, 'utf8')
  const markdown = await readFile(reportMd, 'utf8')
  const firstJsonTemplate = join(outputRoot, 'staging', 'REAL-UAT-01', 'real-uat-01-company-create-switch.json')
  const templateDoc = JSON.parse(await readFile(firstJsonTemplate, 'utf8'))

  assert.equal(report.status, 'templates_written_not_evidence')
  assert.equal(report.selectedTiers.length, 1)
  assert.equal(report.scenarioCount, 16)
  assert.equal(report.templateCount, 48)
  assert.equal(templateDoc.templateOnly, true)
  assert.equal(templateDoc.status, 'template_only_not_evidence')
  assert.equal(templateDoc.environment, 'staging')
  assert.equal(templateDoc.productionBoundary.notEvidence, true)
  assert.match(markdown, /not UAT\/staging\/solo-live\/live evidence/)
  assert.doesNotMatch(packageJson, /password=|postgres:\/\//i)
  assert.equal(report.files.some((file) => file.artifact === 'screenshots/company-create-switch/*.png' && existsSync(resolve(file.templatePath))), true)
})

test('template evidence remains blocking if accidentally used as scenario evidence root', async () => {
  const { root, matrixFile } = await fixture()
  const outputRoot = join(root, 'templates')
  const { report } = await buildEvidenceTemplates({
    matrixFile,
    outputRoot,
    selectedTiers: ['staging'],
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const handoffFile = join(root, 'ready-handoff.json')
  const refsFile = join(root, 'refs.env').replace(/\\/g, '/')
  const envRef = (key) => `env://${refsFile}#${key}`
  const handoff = {
    schemaVersion: 'workbuddy/v14241-real-env-handoff/v1',
    environmentTargets: {
      staging: {
        apiBaseUrlRef: envRef('API_BASE_URL'),
        clientBaseUrlRef: envRef('CLIENT_BASE_URL'),
        deploymentVersionRef: 'release-ref://test',
        artifactRoot: outputRoot,
        writeApprovalRef: 'approval-ref://test',
        cleanupOwner: 'owner-ref://cleanup',
        retentionOwner: 'owner-ref://retention',
        roleAccountRefs: {
          company_admin: envRef('TEST_USER_EMAIL'),
          project_admin: envRef('TEST_USER_EMAIL'),
          editor: envRef('TEST_USER_EMAIL'),
          outsider: envRef('TEST_USER_EMAIL'),
        },
        credentialRefs: {
          testUserEmailRef: envRef('TEST_USER_EMAIL'),
          testUserPasswordRef: envRef('TEST_USER_PASSWORD'),
        },
        anonPolicyRef: 'policy-ref://anon',
      },
    },
    scenarios: {
      'REAL-UAT-07': {
        evidenceOwners: {
          'document-owner': 'owner-ref://document',
          'security-owner': 'owner-ref://security',
          'uat-tester': 'owner-ref://tester',
        },
        tiers: {
          staging: {
            targetRefs: {
              companyIdRef: envRef('COMPANY_ID'),
              projectIdRef: envRef('PROJECT_ID'),
              documentPackageRef: envRef('DOCUMENT_PACKAGE_ID'),
              storageBucketRef: envRef('STORAGE_BUCKET_ID'),
            },
            actorRefs: {
              primaryTesterRef: envRef('TEST_USER_EMAIL'),
            },
            expectedEvidenceRefs: {
              retentionPolicyRef: envRef('RETENTION_POLICY_ID'),
            },
            cleanupRef: 'cleanup-ref://test',
          },
        },
      },
    },
  }
  await import('node:fs/promises').then(({ writeFile }) => Promise.all([
    writeFile(handoffFile, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8'),
    writeFile(join(root, 'refs.env'), [
      'API_BASE_URL=https://staging.example.test',
      'CLIENT_BASE_URL=https://staging.example.test',
      'TEST_USER_EMAIL=tester@example.test',
      'TEST_USER_PASSWORD=redacted',
      'COMPANY_ID=company-1',
      'PROJECT_ID=project-1',
      'DOCUMENT_PACKAGE_ID=document-package-1',
      'STORAGE_BUCKET_ID=storage-bucket-1',
      'RETENTION_POLICY_ID=retention-policy-1',
      '',
    ].join('\n'), 'utf8'),
  ]))

  const result = await runRealUatScenarioContract({
    scenarioId: 'REAL-UAT-07',
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    evidenceRoot: join(outputRoot, 'staging', 'REAL-UAT-07'),
    artifactRoot: join(outputRoot, 'staging', 'REAL-UAT-07'),
    flags: {
      '--include-staging': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'templates_written_not_evidence')
  assert.equal(result.status, 'blocked_required_scenario_evidence_missing')
  assert.equal(result.canCloseScenarioTier, false)
  assert.equal(result.blockers.includes('evidence_status:template_only_not_evidence'), true)
})
