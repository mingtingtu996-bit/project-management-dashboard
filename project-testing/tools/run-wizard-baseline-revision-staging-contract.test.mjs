import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(toolsDir, '..', '..')
const smokeSource = fs.readFileSync(
  path.join(workspaceRoot, 'scripts', 'run-wizard-baseline-revision-staging.mjs'),
  'utf8',
)
const smokeScriptPath = path.join(workspaceRoot, 'scripts', 'run-wizard-baseline-revision-staging.mjs')

const canonicalBusinessPreviewCases = [
  { businessType: 'general_civil', businessSubtype: 'civil_residential', markerPrefix: 'RMP-' },
  { businessType: 'hotel', businessSubtype: null, markerPrefix: 'BTMP-HTL-' },
  { businessType: 'hospital', businessSubtype: null, markerPrefix: 'BTMP-HSP-' },
  { businessType: 'school', businessSubtype: null, markerPrefix: 'BTMP-SCH-' },
  { businessType: 'industrial', businessSubtype: 'industrial_general', markerPrefix: 'BTMP-IND-' },
  { businessType: 'data_center', businessSubtype: null, markerPrefix: 'BTMP-DTC-' },
  { businessType: 'transportation_hub', businessSubtype: 'transport_multimodal', markerPrefix: 'BTMP-TRH-' },
  { businessType: 'sports_culture', businessSubtype: 'sports_stadium', markerPrefix: 'BTMP-SPC-' },
  { businessType: 'tod_upper_cover', businessSubtype: null, markerPrefix: 'BTMP-TOD-' },
  { businessType: 'renovation', businessSubtype: 'renovation_energy', markerPrefix: 'BTMP-RNV-' },
  { businessType: 'modular_building', businessSubtype: null, markerPrefix: 'BTMP-MOD-' },
]

test('wizard baseline revision staging smoke uses ordinary plan confirmation', () => {
  assert.match(smokeSource, /planQualityDiagnostics/)
  assert.match(smokeSource, /publish edited baseline/)
  assert.match(smokeSource, /Baseline revision smoke/)

  for (const retiredRuntimeContract of [
    'PROJECT_MANAGER_REVIEW_REQUIRED',
    'candidate_governance_review',
    'accepted_for_baseline',
    'reviewed_item_ids',
    'acknowledged_blockers',
    'projectManagerReviewPackage',
    'requiresProjectManagerScopeDecision',
  ]) {
    assert.equal(smokeSource.includes(retiredRuntimeContract), false, retiredRuntimeContract)
  }
})

test('wizard baseline revision staging smoke fails closed on missing task network or CPM readback', () => {
  assert.match(smokeSource, /\/api\/tasks\?projectId=/)
  assert.match(smokeSource, /surface=task_list/)
  assert.match(smokeSource, /taskDependencyReadback/)
  assert.match(smokeSource, /dependencyReadbackCount/)
  assert.match(smokeSource, /wizard task readback is empty/)
  assert.match(smokeSource, /wizard dependency readback is empty/)

  assert.match(smokeSource, /\/api\/projects\/\$\{projectId\}\/critical-path/)
  assert.match(smokeSource, /criticalPathReadback/)
  assert.match(smokeSource, /dependencyEdgeCount/)
  assert.match(smokeSource, /critical path task readback is empty/)
  assert.match(smokeSource, /critical path dependency edge readback is empty/)
  assert.match(smokeSource, /critical path calculation failed/)
})

test('wizard baseline revision staging smoke uses the authenticated active company', () => {
  assert.equal(
    smokeSource.includes("requireValue(args.get('company-id'), 'company-id')"),
    false,
  )
  assert.match(smokeSource, /authBody\?\.data\?\.user\?\.currentCompanyId/)
  assert.match(smokeSource, /company-id does not match the authenticated active company/)
  assert.match(smokeSource, /companyId = activeCompanyId/)
})

test('wizard baseline revision staging smoke can attest an exact deployed staging release', () => {
  assert.match(smokeSource, /args\.get\('deployed-staging-code'\)/)
  assert.match(smokeSource, /args\.get\('release-sha'\)/)
  assert.match(smokeSource, /deployed_staging_private_server/)
  assert.match(smokeSource, /releaseSha/)
  assert.match(smokeSource, /AbortSignal\.timeout/)
  assert.match(smokeSource, /args\.get\('cleanup-report'\)/)
  assert.match(smokeSource, /newProjectId: projectId/)
  assert.match(smokeSource, /newProjectId: undefined/)
  assert.match(smokeSource, /preallocated_project_id_readback_after_uncertain_create_response/)
  assert.match(smokeSource, /cleanup refused because the project diagnostic identity does not match/)
  assert.match(smokeSource, /writeResultReport\(\)/)
})

test('wizard baseline revision staging smoke reads duration accuracy from the real staging database without inventing an accuracy claim', () => {
  assert.match(smokeSource, /\/api\/admin\/duration-accuracy\/summary/)
  assert.match(smokeSource, /durationAccuracyReadback/)
  assert.match(smokeSource, /empty_no_completed_samples/)
  assert.match(smokeSource, /readback_only_not_accuracy_acceptance/)
})

test('wizard baseline revision staging smoke previews all 11 canonical business types before its one disposable commit chain', () => {
  for (const previewCase of canonicalBusinessPreviewCases) {
    assert.match(smokeSource, new RegExp(`businessType: '${previewCase.businessType}'`))
    assert.match(smokeSource, new RegExp(previewCase.markerPrefix.replaceAll('-', '\\-')))
    if (previewCase.businessSubtype) {
      assert.match(smokeSource, new RegExp(`businessSubtype: '${previewCase.businessSubtype}'`))
    }
  }

  assert.match(smokeSource, /previewBusinessTypeMatrix/)
  assert.match(smokeSource, /visibleDependencyCoverageRate/)
  assert.match(smokeSource, /readyForWizardCommit/)
  assert.match(smokeSource, /previewOnly/)
  assert.equal(smokeSource.includes("businessType: 'residential'"), false)
  assert.equal(smokeSource.includes("businessSubtype: 'high_rise_residential'"), false)
})

test('wizard baseline revision staging smoke recovers and deletes a project when create commits before the response times out', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-timeout-recovery-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const companyId = '11111111-1111-4111-8111-111111111111'
  const createdProjectId = '22222222-2222-4222-8222-222222222222'
  const previewRequests = []
  let project = null
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const requestBody = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: status < 400, data }))
    }

    if (req.method === 'POST' && req.url === '/api/auth/login') {
      send(200, { token: 'test-token', user: { currentCompanyId: companyId } })
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard/preview') {
      previewRequests.push(requestBody)
      const previewCase = canonicalBusinessPreviewCases.find((candidate) => (
        candidate.businessType === requestBody.businessType
      ))
      assert.ok(previewCase, `unexpected preview business type: ${requestBody.businessType}`)
      const businessMarkerCode = `${previewCase.markerPrefix}01`
      send(200, {
        estimatedRowCount: 120,
        profile: {
          identity: {
            businessType: previewCase.businessType,
            businessSubtype: previewCase.businessSubtype,
          },
          generation: {
            masterPlanProfile: {
              layer: 'master_plan',
              rowCountRange: [60, 180],
            },
            executableDefaultMasterPlanAssembly: {
              status: 'executable_default_master_plan_ready',
              businessType: previewCase.businessType,
              readyForWizardCommit: true,
              scheduleRowCount: 120,
              visibleDependencyCount: 119,
              visibleDependencyCoverageRate: 0.99,
              dependencyCycleRowCount: 0,
              schedulePropagationCycleRowCount: 0,
            },
            executableDefaultMasterPlanPreview: {
              status: 'executable_default_master_plan_ready',
              businessType: previewCase.businessType,
              readyForWizardCommit: true,
              scheduleRowCount: 120,
              visibleDependencyCount: 119,
              dependencyCycleRowCount: 0,
              schedulePropagationCycleRowCount: 0,
              projectStartDate: '2026-08-01',
              projectEndDate: '2027-08-01',
              previewOnly: true,
              mutationBoundary: 'preview_only_no_db_write',
              rows: [{
                clientRowId: `${previewCase.businessType}-marker`,
                wbsCode: businessMarkerCode,
                plannedStartDate: '2026-08-01',
                plannedEndDate: '2026-08-15',
                standardWorkDurationSeedStableCode: `${previewCase.businessType}-duration-seed`,
                t2RhythmTemplateId: `${previewCase.businessType}-t2-rhythm-v1`,
              }],
            },
            planQualityDiagnostics: {
              status: 'ready',
              readyForWizardCommit: true,
              runtimeApprovalRequired: false,
              blocksWizardCommit: false,
              unresolvedDependencyCount: 0,
            },
          },
        },
      })
      return
    }
    if (req.method === 'GET' && req.url === '/api/admin/duration-accuracy/summary') {
      send(200, { metrics: [] })
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard') {
      assert.equal(requestBody.newProjectId, createdProjectId)
      setTimeout(() => {
        project = {
          id: createdProjectId,
          name: requestBody.name,
          metadata: requestBody.metadata,
        }
      }, 1_100)
      setTimeout(() => send(201, { id: createdProjectId, projectId: createdProjectId }), 1_500)
      return
    }
    if (req.method === 'GET' && req.url === '/api/projects') {
      send(200, project ? [project] : [])
      return
    }
    if (req.method === 'DELETE' && req.url === `/api/projects/${createdProjectId}`) {
      project = null
      send(200, { id: createdProjectId })
      return
    }
    if (req.method === 'GET' && req.url === `/api/projects/${createdProjectId}`) {
      if (project) send(200, project)
      else send(404, null)
      return
    }
    send(404, null)
  })
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)))
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  assert.equal(typeof address, 'object')

  const envPath = path.join(root, 'staging.env')
  const reportPath = path.join(root, 'report.json')
  fs.writeFileSync(envPath, [
    'SUPABASE_URL=https://stagingref.supabase.co',
    'TEST_USERNAME=smoke@example.com',
    'TEST_USER_PASSWORD=test-password',
    '',
  ].join('\n'))

  const childResult = await new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      smokeScriptPath,
      '--env-file', envPath,
      '--api-base-url', `http://127.0.0.1:${address.port}`,
      '--request-timeout-ms', '1000',
      '--recovery-delay-ms', '100',
      '--project-id', createdProjectId,
      '--report', reportPath,
    ], { cwd: workspaceRoot })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', rejectChild)
    child.once('close', (code) => resolveChild({ code, stdout, stderr }))
  })

  assert.equal(childResult.code, 1, childResult.stderr)
  assert.deepEqual(
    previewRequests.map(({ businessType, businessSubtype = null }) => ({ businessType, businessSubtype })),
    canonicalBusinessPreviewCases.map(({ businessType, businessSubtype }) => ({ businessType, businessSubtype })),
  )
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(report.projectId, createdProjectId)
  assert.equal(report.steps.projectRecovery.status, 'pass')
  assert.equal(report.steps.durationAccuracyReadback.status, 'pass')
  assert.equal(report.steps.durationAccuracyReadback.dataState, 'empty_no_completed_samples')
  assert.equal(report.steps.previewBusinessTypeMatrix.status, 'pass')
  assert.equal(report.steps.previewBusinessTypeMatrix.previewCount, 11)
  assert.equal(report.cleanup.status, 'pass')
  assert.equal(report.cleanup.projectPhysicallyDeleted, true)
  assert.equal(project, null)
})
