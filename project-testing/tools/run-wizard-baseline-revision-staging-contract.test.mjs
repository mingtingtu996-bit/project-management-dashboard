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
  { businessType: 'general_civil', businessSubtype: 'civil_residential', markerPrefix: 'RMP-', rowCountRange: [98, 212], operationalRowFloor: 60 },
  { businessType: 'hotel', businessSubtype: null, markerPrefix: 'BTMP-HTL-', rowCountRange: [71, 142], operationalRowFloor: 60 },
  { businessType: 'hospital', businessSubtype: null, markerPrefix: 'BTMP-HSP-', rowCountRange: [104, 235], operationalRowFloor: 60 },
  { businessType: 'school', businessSubtype: null, markerPrefix: 'BTMP-SCH-', rowCountRange: [76, 162], operationalRowFloor: 60 },
  { businessType: 'industrial', businessSubtype: 'industrial_general', markerPrefix: 'BTMP-IND-', rowCountRange: [75, 166], operationalRowFloor: 60 },
  { businessType: 'data_center', businessSubtype: null, markerPrefix: 'BTMP-DTC-', rowCountRange: [71, 171], operationalRowFloor: 60 },
  { businessType: 'transportation_hub', businessSubtype: 'transport_multimodal', markerPrefix: 'BTMP-TRH-', rowCountRange: [71, 192], operationalRowFloor: 60 },
  { businessType: 'sports_culture', businessSubtype: 'sports_stadium', markerPrefix: 'BTMP-SPC-', rowCountRange: [66, 132], operationalRowFloor: 60 },
  { businessType: 'tod_upper_cover', businessSubtype: null, markerPrefix: 'BTMP-TOD-', rowCountRange: [87, 236], operationalRowFloor: 65 },
  { businessType: 'renovation', businessSubtype: 'renovation_energy', markerPrefix: 'BTMP-RNV-', rowCountRange: [67, 98], operationalRowFloor: 60 },
  { businessType: 'modular_building', businessSubtype: null, markerPrefix: 'BTMP-MOD-', rowCountRange: [67, 126], operationalRowFloor: 60 },
]

function buildReadyPreviewResponse(previewCase) {
  const scheduleRowCount = previewCase.rowCountRange[0]
  const rows = Array.from({ length: scheduleRowCount }, (_, index) => ({
    clientRowId: `${previewCase.businessType}-row-${index + 1}`,
    wbsCode: index === 0
      ? `${previewCase.markerPrefix}01`
      : `${previewCase.markerPrefix}SUP-${String(index + 1).padStart(3, '0')}`,
    plannedStartDate: '2026-08-01',
    plannedEndDate: '2026-08-15',
    standardWorkDurationSeedStableCode: `${previewCase.businessType}-duration-seed`,
    t2RhythmTemplateId: `${previewCase.businessType}-t2-rhythm-v1`,
  }))
  return {
    estimatedRowCount: scheduleRowCount,
    profile: {
      identity: {
        businessType: previewCase.businessType,
        businessSubtype: previewCase.businessSubtype,
      },
      issues: [],
      generation: {
        masterPlanProfile: {
          layer: 'master_plan',
          rowCountRange: previewCase.rowCountRange,
        },
        executableDefaultMasterPlanAssembly: {
          status: 'executable_default_master_plan_ready',
          businessType: previewCase.businessType,
          readyForWizardCommit: true,
          assetAuthority: 'system_standard_seed',
          scheduleRowCount,
          minimumScheduleRowCount: scheduleRowCount,
          operationalRowFloor: previewCase.operationalRowFloor,
          availableScheduleRowCount: scheduleRowCount,
          assetInventoryShortfallAccepted: false,
          visibleDependencyCount: scheduleRowCount - 1,
          visibleDependencyCoverageRate: 0.99,
          missingExecutionPhases: [],
          invalidDurationRowCount: 0,
          methodConflictCount: 0,
          durationAssetSemanticMismatchCount: 0,
          dependencyCycleRowCount: 0,
          schedulePropagationCycleRowCount: 0,
          networkComponentCount: 1,
          networkRootCount: 1,
          networkSinkCount: 1,
          readinessReasonCodes: [],
        },
        executableDefaultMasterPlanPreview: {
          status: 'executable_default_master_plan_ready',
          businessType: previewCase.businessType,
          readyForWizardCommit: true,
          scheduleRowCount,
          visibleDependencyCount: scheduleRowCount - 1,
          dependencyCycleRowCount: 0,
          schedulePropagationCycleRowCount: 0,
          projectStartDate: '2026-08-01',
          projectEndDate: '2027-08-01',
          previewOnly: true,
          mutationBoundary: 'preview_only_no_db_write',
          rows,
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
  }
}

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

test('wizard baseline revision smoke requires explicit same-SHA production identity and approval', async () => {
  assert.match(smokeSource, /args\.get\('target-environment'\)/)
  assert.match(smokeSource, /args\.get\('production-mutation-approval'\)/)
  assert.match(smokeSource, /args\.get\('deployed-readiness-file'\)/)
  assert.match(smokeSource, /deployed_production_private_server/)
  assert.match(smokeSource, /databaseProjectRef/)
  assert.match(smokeSource, /generationBatchId/)

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-production-smoke-guard-'))
  const envPath = path.join(root, 'production.env')
  const reportPath = path.join(root, 'report.json')
  const readyzPath = path.join(root, 'readyz.json')
  fs.writeFileSync(envPath, [
    'SUPABASE_URL=https://wwdrkjnbvcbfytwnnyvs.supabase.co',
    'TEST_USERNAME=smoke@example.com',
    'TEST_USER_PASSWORD=test-password',
    '',
  ].join('\n'))
  fs.writeFileSync(readyzPath, JSON.stringify({
    build: {
      releaseSha: 'a'.repeat(40),
      deployTarget: 'production',
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      databaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
    },
  }))

  try {
    const childResult = await new Promise((resolveChild, rejectChild) => {
      const child = spawn(process.execPath, [
        smokeScriptPath,
        '--env-file', envPath,
        '--public-origin', 'https://workbuddy.example.com',
        '--target-environment', 'production',
        '--release-sha', 'a'.repeat(40),
        '--expected-project-ref', 'wwdrkjnbvcbfytwnnyvs',
        '--deployed-readiness-file', readyzPath,
        '--report', reportPath,
      ], { cwd: workspaceRoot })
      let stderr = ''
      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.once('error', rejectChild)
      child.once('close', (code) => resolveChild({ code, stderr }))
    })

    assert.equal(childResult.code, 1)
    assert.match(childResult.stderr, /production-mutation-approval/u)
    assert.equal(fs.existsSync(reportPath), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('production wizard mutation fixture remains the approved one-building legacy payload', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-production-mutation-fixture-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const companyId = '11111111-1111-4111-8111-111111111111'
  const projectRef = 'wwdrkjnbvcbfytwnnyvs'
  const releaseSha = 'a'.repeat(40)
  let createRequest = null
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
    if (req.method === 'GET' && req.url === '/api/admin/duration-accuracy/summary') {
      send(200, { metrics: [] })
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard/preview') {
      const previewCase = canonicalBusinessPreviewCases.find((candidate) => (
        candidate.businessType === requestBody.businessType
      ))
      assert.ok(previewCase, `unexpected preview business type: ${requestBody.businessType}`)
      send(200, buildReadyPreviewResponse(previewCase))
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard') {
      createRequest = requestBody
      send(500, { code: 'EXPECTED_TEST_STOP', message: 'stop before mutation' })
      return
    }
    send(404, null)
  })
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)))
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  assert.equal(typeof address, 'object')

  const envPath = path.join(root, 'production.env')
  const reportPath = path.join(root, 'report.json')
  const readyzPath = path.join(root, 'readyz.json')
  fs.writeFileSync(envPath, [
    `SUPABASE_URL=https://${projectRef}.supabase.co`,
    'TEST_USERNAME=smoke@example.com',
    'TEST_USER_PASSWORD=test-password',
    '',
  ].join('\n'))
  fs.writeFileSync(readyzPath, JSON.stringify({
    build: {
      releaseSha,
      deployTarget: 'production',
      supabaseProjectRef: projectRef,
      databaseProjectRef: projectRef,
    },
  }))

  const childResult = await new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      smokeScriptPath,
      '--env-file', envPath,
      '--api-base-url', `http://127.0.0.1:${address.port}`,
      '--public-origin', 'https://workbuddy.example.com',
      '--target-environment', 'production',
      '--production-mutation-approval', 'I_APPROVE_DISPOSABLE_PRODUCTION_WIZARD_SMOKE',
      '--deployed-readiness-file', readyzPath,
      '--expected-project-ref', projectRef,
      '--release-sha', releaseSha,
      '--report', reportPath,
    ], { cwd: workspaceRoot })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', rejectChild)
    child.once('close', (code) => resolveChild({ code, stderr }))
  })

  assert.equal(childResult.code, 1)
  assert.ok(createRequest)
  assert.equal(createRequest.wizardPayload.buildingCount, 1)
  assert.equal(createRequest.wizardPayload.projectFeatures.standardFloorCount, 22)
  assert.equal(createRequest.wizardPayload.scopeTree.filter((node) => node.type === 'building').length, 1)
  const productionPhysicalZones = createRequest.wizardPayload.scopeTree.filter((node) => node.type === 'physical_zone')
  assert.deepEqual(productionPhysicalZones.map((node) => node.metadata), [
    { physicalCategory: 'tower', coverageRole: 'overlay_trigger', areaAccountingMode: 'not_counted' },
    { physicalCategory: 'basement', coverageRole: 'overlay_trigger', areaAccountingMode: 'not_counted' },
    { physicalCategory: 'outdoor_site', coverageRole: 'overlay_trigger', areaAccountingMode: 'not_counted' },
  ])
})

test('wizard baseline revision staging smoke keeps admin accuracy evidence separate from its ordinary-user business flow', () => {
  assert.match(smokeSource, /\/api\/admin\/duration-accuracy\/summary/)
  assert.match(smokeSource, /durationAccuracyReadback/)
  assert.match(smokeSource, /empty_no_completed_samples/)
  assert.match(smokeSource, /readback_only_not_accuracy_acceptance/)
  assert.match(smokeSource, /Duration accuracy diagnostics are available to company administrators only\./)
  assert.match(smokeSource, /forbidden_company_admin_required/)
  assert.match(smokeSource, /wizard_business_smoke_only_no_accuracy_readback_claim/)
})

test('wizard baseline revision smoke fails closed for unrecognized staging 403 and every production 403', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-accuracy-forbidden-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const companyId = '11111111-1111-4111-8111-111111111111'
  const projectRef = 'wwdrkjnbvcbfytwnnyvs'
  let accuracyMessage = ''
  let previewRequestCount = 0
  const server = http.createServer(async (req, res) => {
    for await (const _chunk of req) {
      // Drain request bodies so spawned clients can reuse the connection cleanly.
    }
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
    }

    if (req.method === 'POST' && req.url === '/api/auth/login') {
      send(200, { success: true, data: { token: 'test-token', user: { currentCompanyId: companyId } } })
      return
    }
    if (req.method === 'GET' && req.url === '/api/admin/duration-accuracy/summary') {
      send(403, {
        success: false,
        error: { code: 'FORBIDDEN', message: accuracyMessage },
      })
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard/preview') {
      previewRequestCount += 1
    }
    send(404, { success: false, error: { code: 'NOT_FOUND', message: 'not found' } })
  })
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)))
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  assert.equal(typeof address, 'object')

  const envPath = path.join(root, 'staging.env')
  const readyzPath = path.join(root, 'readyz.json')
  fs.writeFileSync(envPath, [
    `SUPABASE_URL=https://${projectRef}.supabase.co`,
    'TEST_USERNAME=smoke@example.com',
    'TEST_USER_PASSWORD=test-password',
    '',
  ].join('\n'))
  fs.writeFileSync(readyzPath, JSON.stringify({
    build: {
      releaseSha: 'a'.repeat(40),
      deployTarget: 'production',
      supabaseProjectRef: projectRef,
      databaseProjectRef: projectRef,
    },
  }))

  const scenarios = [
    {
      name: 'unrecognized-staging-forbidden',
      accuracyMessage: 'Request origin is not allowed.',
      extraArgs: [],
    },
    {
      name: 'production-admin-only-forbidden',
      accuracyMessage: 'Duration accuracy diagnostics are available to company administrators only.',
      extraArgs: [
        '--target-environment', 'production',
        '--production-mutation-approval', 'I_APPROVE_DISPOSABLE_PRODUCTION_WIZARD_SMOKE',
        '--deployed-readiness-file', readyzPath,
        '--expected-project-ref', projectRef,
        '--release-sha', 'a'.repeat(40),
      ],
    },
  ]

  for (const scenario of scenarios) {
    accuracyMessage = scenario.accuracyMessage
    const previewCountBefore = previewRequestCount
    const reportPath = path.join(root, `${scenario.name}.json`)
    const childResult = await new Promise((resolveChild, rejectChild) => {
      const child = spawn(process.execPath, [
        smokeScriptPath,
        '--env-file', envPath,
        '--api-base-url', `http://127.0.0.1:${address.port}`,
        '--public-origin', 'https://workbuddy.example.com',
        '--report', reportPath,
        ...scenario.extraArgs,
      ], { cwd: workspaceRoot })
      let stderr = ''
      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.once('error', rejectChild)
      child.once('close', (code) => resolveChild({ code, stderr }))
    })

    assert.equal(childResult.code, 1, `${scenario.name}: ${childResult.stderr}`)
    assert.equal(previewRequestCount, previewCountBefore, scenario.name)
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    assert.match(report.error?.message ?? '', /read staging duration accuracy summary failed: HTTP 403/u)
    assert.equal(report.steps.durationAccuracyReadback, undefined)
  }
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

test('wizard baseline revision staging smoke reports sanitized preview readiness issues', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-preview-readiness-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const companyId = '11111111-1111-4111-8111-111111111111'
  const server = http.createServer(async (req, res) => {
    for await (const _chunk of req) {
      // Drain request bodies so spawned clients can reuse the connection cleanly.
    }
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: status < 400, data }))
    }

    if (req.method === 'POST' && req.url === '/api/auth/login') {
      send(200, { token: 'test-token', user: { currentCompanyId: companyId } })
      return
    }
    if (req.method === 'GET' && req.url === '/api/admin/duration-accuracy/summary') {
      send(200, { metrics: [] })
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard/preview') {
      const preview = buildReadyPreviewResponse(canonicalBusinessPreviewCases[0])
      preview.profile.issues = [{
        code: 'SCOPE_WBS_READINESS_MISSING',
        severity: 'blocking',
        details: {
          itemPackPattern: 'OUT-',
          matchMetadata: {
            physicalSpaceKind: 'outdoor_site',
            internalSecret: 'nested-must-not-leak',
          },
          matchedStableCodes: ['OUT-01', { internalSecret: 'array-must-not-leak' }],
          missingObjectLabel: 'outdoor site',
          internalSecret: 'must-not-leak',
        },
      }]
      preview.profile.generation.executableDefaultMasterPlanAssembly.status = {
        internalSecret: 'selected-field-must-not-leak',
      }
      preview.profile.generation.executableDefaultMasterPlanAssembly.assetAuthority = 'legacy_untrusted_seed'
      preview.profile.generation.executableDefaultMasterPlanAssembly.internalSecret = 'assembly-must-not-leak'
      preview.profile.generation.planQualityDiagnostics.internalSecret = 'quality-must-not-leak'
      preview.profile.generation.executableDefaultMasterPlanPreview.internalSecret = 'preview-must-not-leak'
      send(200, preview)
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
      '--public-origin', 'https://workbuddy.example.com',
      '--report', reportPath,
    ], { cwd: workspaceRoot })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', rejectChild)
    child.once('close', (code) => resolveChild({ code, stderr }))
  })

  assert.equal(childResult.code, 1)
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.match(report.error.message, /assembly is not ready/u)
  assert.deepEqual(report.error.details.profileIssues, [{
    code: 'SCOPE_WBS_READINESS_MISSING',
    severity: 'blocking',
    details: {
      itemPackPattern: 'OUT-',
      matchMetadata: { physicalSpaceKind: 'outdoor_site' },
      matchedStableCodes: ['OUT-01'],
      missingObjectLabel: 'outdoor site',
    },
  }])
  assert.equal(JSON.stringify(report.error.details).includes('must-not-leak'), false)
})

test('wizard baseline revision staging smoke fails closed when governed preview evidence is missing or wrongly typed', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-preview-governed-evidence-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const companyId = '11111111-1111-4111-8111-111111111111'
  let activeScenario = null
  let createRequestCount = 0
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
    if (req.method === 'GET' && req.url === '/api/admin/duration-accuracy/summary') {
      send(200, { metrics: [] })
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard/preview') {
      const previewCase = canonicalBusinessPreviewCases.find((candidate) => (
        candidate.businessType === requestBody.businessType
      ))
      assert.ok(previewCase, `unexpected preview business type: ${requestBody.businessType}`)
      const preview = buildReadyPreviewResponse(previewCase)
      activeScenario.mutate(preview)
      send(200, preview)
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard') {
      createRequestCount += 1
      send(500, { code: 'UNEXPECTED_CREATE', message: 'preview evidence should have failed closed' })
      return
    }
    send(404, null)
  })
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)))
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  assert.equal(typeof address, 'object')

  const envPath = path.join(root, 'staging.env')
  fs.writeFileSync(envPath, [
    'SUPABASE_URL=https://stagingref.supabase.co',
    'TEST_USERNAME=smoke@example.com',
    'TEST_USER_PASSWORD=test-password',
    '',
  ].join('\n'))

  const scenarios = [
    {
      name: 'missing-execution-phases',
      mutate: (preview) => { delete preview.profile.generation.executableDefaultMasterPlanAssembly.missingExecutionPhases },
    },
    {
      name: 'wrong-readiness-reason-codes-type',
      mutate: (preview) => { preview.profile.generation.executableDefaultMasterPlanAssembly.readinessReasonCodes = {} },
    },
    {
      name: 'wrong-invalid-duration-count-type',
      mutate: (preview) => { preview.profile.generation.executableDefaultMasterPlanAssembly.invalidDurationRowCount = '0' },
    },
    {
      name: 'missing-method-conflict-count',
      mutate: (preview) => { delete preview.profile.generation.executableDefaultMasterPlanAssembly.methodConflictCount },
    },
    {
      name: 'wrong-semantic-mismatch-count-type',
      mutate: (preview) => { preview.profile.generation.executableDefaultMasterPlanAssembly.durationAssetSemanticMismatchCount = false },
    },
    {
      name: 'missing-dependency-cycle-count',
      mutate: (preview) => {
        delete preview.profile.generation.executableDefaultMasterPlanAssembly.dependencyCycleRowCount
        delete preview.profile.generation.executableDefaultMasterPlanPreview.dependencyCycleRowCount
      },
    },
    {
      name: 'wrong-schedule-cycle-count-type',
      mutate: (preview) => {
        preview.profile.generation.executableDefaultMasterPlanAssembly.schedulePropagationCycleRowCount = '0'
        preview.profile.generation.executableDefaultMasterPlanPreview.schedulePropagationCycleRowCount = '0'
      },
    },
    {
      name: 'missing-unresolved-dependency-count',
      mutate: (preview) => { delete preview.profile.generation.planQualityDiagnostics.unresolvedDependencyCount },
    },
  ]

  for (const scenario of scenarios) {
    activeScenario = scenario
    const createCountBefore = createRequestCount
    const reportPath = path.join(root, `${scenario.name}.json`)
    const childResult = await new Promise((resolveChild, rejectChild) => {
      const child = spawn(process.execPath, [
        smokeScriptPath,
        '--env-file', envPath,
        '--api-base-url', `http://127.0.0.1:${address.port}`,
        '--public-origin', 'https://workbuddy.example.com',
        '--report', reportPath,
      ], { cwd: workspaceRoot })
      let stderr = ''
      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.once('error', rejectChild)
      child.once('close', (code) => resolveChild({ code, stderr }))
    })

    assert.equal(childResult.code, 1, `${scenario.name}: ${childResult.stderr}`)
    assert.equal(createRequestCount, createCountBefore, scenario.name)
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    assert.equal(report.status, 'fail', scenario.name)
  }
})

test('wizard baseline revision staging smoke does not persist arbitrary HTTP failure details', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-preview-http-failure-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const companyId = '11111111-1111-4111-8111-111111111111'
  const server = http.createServer(async (req, res) => {
    for await (const _chunk of req) {
      // Drain request bodies so spawned clients can reuse the connection cleanly.
    }
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: status < 400, data }))
    }

    if (req.method === 'POST' && req.url === '/api/auth/login') {
      send(200, { token: 'test-token', user: { currentCompanyId: companyId } })
      return
    }
    if (req.method === 'GET' && req.url === '/api/admin/duration-accuracy/summary') {
      send(200, { metrics: [] })
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard/preview') {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: false,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'preview service unavailable',
          details: {
            requestId: 'safe-request-id',
            authorization: 'must-not-leak',
            nested: { databaseUrl: 'nested-must-not-leak' },
          },
        },
      }))
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
      '--public-origin', 'https://workbuddy.example.com',
      '--report', reportPath,
    ], { cwd: workspaceRoot })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', rejectChild)
    child.once('close', (code) => resolveChild({ code, stderr }))
  })

  assert.equal(childResult.code, 1)
  const reportText = fs.readFileSync(reportPath, 'utf8')
  const report = JSON.parse(reportText)
  assert.match(report.error.message, /HTTP 503/u)
  assert.equal(reportText.includes('must-not-leak'), false)
})

test('wizard baseline revision staging smoke recovers and deletes a project when create commits before the response times out', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-timeout-recovery-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const companyId = '11111111-1111-4111-8111-111111111111'
  const createdProjectId = '22222222-2222-4222-8222-222222222222'
  const previewRequests = []
  let wizardCreateRequest = null
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
      const preview = buildReadyPreviewResponse(previewCase)
      if (previewCase.businessType === 'general_civil') {
        const secret = { internalSecret: 'successful-preview-must-not-leak' }
        preview.estimatedRowCount = secret
        preview.profile.generation.durationAssetUtilizationSummary = { scheduleRowCount: secret }
        preview.profile.generation.planQualityDiagnostics.status = secret
        preview.profile.generation.planQualityDiagnostics.targetAlignmentSnapshot = {
          targetEndDate: secret,
          naturalEndDate: secret,
          overshootDays: secret,
          unrecoverableDays: secret,
        }
      }
      send(200, preview)
      return
    }
    if (req.method === 'GET' && req.url === '/api/admin/duration-accuracy/summary') {
      send(200, { metrics: [] })
      return
    }
    if (req.method === 'POST' && req.url === '/api/projects/wizard') {
      assert.equal(requestBody.newProjectId, createdProjectId)
      wizardCreateRequest = requestBody
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
      '--public-origin', 'https://workbuddy.example.com',
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
  const previewByBusinessType = new Map(previewRequests.map((request) => [request.businessType, request]))
  const generalCivilPreview = previewByBusinessType.get('general_civil')
  assert.equal(generalCivilPreview.buildingCount, 3)
  assert.equal(generalCivilPreview.projectFeatures.standardFloorCount, 24)
  assert.equal(generalCivilPreview.scopeTree.filter((node) => node.type === 'building').length, 3)

  const renovationPreview = previewByBusinessType.get('renovation')
  assert.equal(renovationPreview.buildingCount, 2)
  assert.equal(renovationPreview.projectFeatures.standardFloorCount, 8)

  const modularPreview = previewByBusinessType.get('modular_building')
  assert.equal(modularPreview.buildingCount, 3)
  assert.equal(modularPreview.projectFeatures.standardFloorCount, 18)

  for (const previewRequest of previewRequests) {
    const physicalZones = previewRequest.scopeTree.filter((node) => node.type === 'physical_zone')
    assert.equal(physicalZones.some((node) => ['tower', 'basement'].includes(node.metadata.physicalCategory)), false, previewRequest.businessType)
    assert.equal(physicalZones.every((node) => (
      node.metadata.coverageRole === 'exclusive_scope'
      && node.metadata.areaAccountingMode === 'counted'
      && node.metadata.childrenComplete === true
    )), true, previewRequest.businessType)
    const outdoorSite = previewRequest.scopeTree.find((node) => (
      node.type === 'physical_zone'
      && node.metadata.physicalSpaceKind === 'outdoor_site'
    ))
    assert.equal(outdoorSite?.metadata.physicalCategory, 'outdoor_site_plan', previewRequest.businessType)
    assert.equal(previewRequest.scopeTree.filter((node) => node.type === 'building').every((node) => (
      node.metadata.coverageRole === 'exclusive_scope'
      && node.metadata.areaAccountingMode === 'counted'
    )), true, previewRequest.businessType)
    assert.equal(previewRequest.scopeTree.filter((node) => node.type === 'basement').every((node) => (
      node.metadata.coverageRole === 'exclusive_scope'
      && node.metadata.areaAccountingMode === 'counted'
      && node.metadata.childrenComplete === true
    )), true, previewRequest.businessType)
  }

  const hospitalPreview = previewByBusinessType.get('hospital')
  assert.ok(hospitalPreview.scopeTree.some((node) => node.type === 'building' && node.metadata.functionalUsage === '医技楼'))
  assert.ok(hospitalPreview.scopeTree.some((node) => node.type === 'functional_area' && node.metadata.functionalCategory === '手术区'))

  const dataCenterPreview = previewByBusinessType.get('data_center')
  assert.ok(dataCenterPreview.scopeTree.some((node) => node.type === 'building' && node.metadata.functionalUsage === '机房楼'))

  for (const businessType of ['transportation_hub', 'tod_upper_cover']) {
    const previewRequest = previewByBusinessType.get(businessType)
    assert.ok(previewRequest.scopeTree.some((node) => (
      node.type === 'physical_zone'
      && node.metadata.physicalSpaceKind === 'independent_engineering_zone'
      && node.metadata.physicalCategory === 'railway_operation_zone'
    )), businessType)
  }
  assert.equal(wizardCreateRequest.wizardPayload.buildingCount, 1)
  assert.equal(wizardCreateRequest.wizardPayload.projectFeatures.standardFloorCount, 22)
  assert.equal(wizardCreateRequest.wizardPayload.scopeTree.filter((node) => node.type === 'building').length, 1)
  assert.equal(wizardCreateRequest.wizardPayload.scopeTree.filter((node) => node.type === 'physical_zone').every((node) => (
    node.metadata.coverageRole === 'exclusive_scope'
    && node.metadata.areaAccountingMode === 'counted'
    && node.metadata.childrenComplete === true
  )), true)
  const reportText = fs.readFileSync(reportPath, 'utf8')
  const report = JSON.parse(reportText)
  assert.equal(report.projectId, createdProjectId)
  assert.equal(report.steps.projectRecovery.status, 'pass')
  assert.equal(report.steps.durationAccuracyReadback.status, 'pass')
  assert.equal(report.steps.durationAccuracyReadback.dataState, 'empty_no_completed_samples')
  assert.equal(report.steps.previewBusinessTypeMatrix.status, 'pass')
  assert.equal(report.steps.previewBusinessTypeMatrix.previewCount, 11)
  for (const previewEvidence of report.steps.previewBusinessTypeMatrix.cases) {
    const expected = canonicalBusinessPreviewCases.find((previewCase) => (
      previewCase.businessType === previewEvidence.businessType
    ))
    assert.ok(expected, previewEvidence.businessType)
    assert.deepEqual(previewEvidence.profileRowCountRange, expected.rowCountRange)
    assert.equal(previewEvidence.scheduleRowCount, expected.rowCountRange[0])
    assert.equal(previewEvidence.minimumScheduleRowCount, expected.rowCountRange[0])
    assert.equal(previewEvidence.operationalRowFloor, expected.operationalRowFloor)
    assert.equal(previewEvidence.assetAuthority, 'system_standard_seed')
    assert.equal(previewEvidence.assetInventoryShortfallAccepted, false)
    assert.equal(previewEvidence.invalidDurationRowCount, 0)
    assert.equal(previewEvidence.missingExecutionPhaseCount, 0)
    assert.equal(previewEvidence.methodConflictCount, 0)
    assert.equal(previewEvidence.durationAssetSemanticMismatchCount, 0)
    assert.equal(previewEvidence.networkComponentCount, 1)
    assert.equal(previewEvidence.networkRootCount, 1)
    assert.equal(previewEvidence.networkSinkCount, 1)
  }
  assert.equal(reportText.includes('successful-preview-must-not-leak'), false)
  assert.equal(report.steps.previewCandidatePlan.estimatedRowCount, null)
  assert.equal(report.steps.previewCandidatePlan.generatedScheduleRowCount, null)
  assert.equal(report.steps.previewCandidatePlan.planQualityStatus, null)
  assert.equal(report.steps.previewCandidatePlan.targetEndDate, null)
  assert.equal(report.steps.previewCandidatePlan.naturalEndDate, null)
  assert.equal(report.steps.previewCandidatePlan.targetOvershootDays, null)
  assert.equal(report.steps.previewCandidatePlan.targetUnrecoverableDays, null)
  assert.equal(report.cleanup.status, 'pass')
  assert.equal(report.cleanup.projectPhysicallyDeleted, true)
  assert.equal(project, null)
})

test('ordinary staging user completes the full wizard and baseline smoke when admin accuracy readback is forbidden', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-admin-diagnostic-boundary-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const companyId = '11111111-1111-4111-8111-111111111111'
  const projectId = '22222222-2222-4222-8222-222222222222'
  const baselineId = 'baseline-1'
  const revisionId = 'revision-1'
  let project = null
  let revisionActive = false
  let accuracyRequestCount = 0
  let previewRequestCount = 0
  let baseline = {
    id: baselineId,
    title: 'Candidate baseline',
    description: null,
    effective_from: null,
    effective_to: null,
    status: 'candidate',
    version: 1,
    items: [{ id: 'baseline-item-1', notes: 'original note' }],
  }

  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const requestBody = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
    const requestUrl = new URL(req.url, 'http://127.0.0.1')
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: status < 400, data }))
    }
    const sendError = (status, code, message) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: { code, message } }))
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/auth/login') {
      send(200, { token: 'test-token', user: { currentCompanyId: companyId } })
      return
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/admin/duration-accuracy/summary') {
      accuracyRequestCount += 1
      sendError(
        403,
        'FORBIDDEN',
        'Duration accuracy diagnostics are available to company administrators only.',
      )
      return
    }
    if (req.method === 'POST' && requestUrl.pathname === '/api/projects/wizard/preview') {
      previewRequestCount += 1
      const previewCase = canonicalBusinessPreviewCases.find((candidate) => (
        candidate.businessType === requestBody.businessType
      ))
      assert.ok(previewCase, `unexpected preview business type: ${requestBody.businessType}`)
      send(200, buildReadyPreviewResponse(previewCase))
      return
    }
    if (req.method === 'POST' && requestUrl.pathname === '/api/projects/wizard') {
      if (requestBody.commit === false) {
        assert.equal(requestBody.newProjectId, projectId)
        project = {
          id: projectId,
          name: requestBody.name,
          metadata: requestBody.metadata,
        }
        send(201, { id: projectId, projectId })
        return
      }
      assert.equal(requestBody.projectId, projectId)
      assert.equal(requestBody.commit, true)
      send(200, {
        generation: {
          generationBatchId: 'generation-batch-1',
          generatedRowCount: 2,
          createdTaskCount: 2,
          candidateBaseline: { baselineId },
          executableDefaultMasterPlanAssembly: {
            status: 'executable_default_master_plan_ready',
            assetInventoryShortfallAccepted: false,
          },
          planQualityDiagnostics: {
            status: 'ready',
            runtimeApprovalRequired: false,
            blocksWizardCommit: false,
          },
        },
      })
      return
    }
    if (req.method === 'GET' && requestUrl.pathname === `/api/projects/${projectId}/wizard/artifact-inventory`) {
      send(200, {
        generatedTaskCount: 2,
        generatedPrimaryScheduleTaskCount: 2,
        generatedPrimaryScheduleExecutableTaskCount: 2,
        generatedPrimaryScheduleRecordOnlyTaskCount: 0,
        generatedNonPrimaryTaskCount: 0,
        candidateBaselinesRemaining: 1,
        candidateBaselineItemCount: 2,
        candidateBaselineMappedItemCount: 2,
        candidateBaselineIds: [baselineId],
        dependenciesRemaining: 1,
      })
      return
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/tasks') {
      send(200, [
        { id: 'task-1', dependencies: [] },
        { id: 'task-2', dependencies: ['task-1'] },
      ])
      return
    }
    if (req.method === 'GET' && requestUrl.pathname === `/api/projects/${projectId}/critical-path`) {
      send(200, {
        projectId,
        calculationStatus: 'calculated',
        tasks: [{ id: 'task-1' }, { id: 'task-2' }],
        displayTaskIds: ['task-1', 'task-2'],
        edges: [{ fromTaskId: 'task-1', toTaskId: 'task-2', source: 'dependency' }],
        projectDurationDays: 2,
        calculatedAt: '2026-08-05T00:00:00.000Z',
        networkLineage: { dependencyInputHash: 'dependency-hash-1' },
      })
      return
    }
    if (requestUrl.pathname === `/api/task-baselines/${baselineId}`) {
      if (req.method === 'GET') {
        send(200, baseline)
        return
      }
      if (req.method === 'PUT') {
        baseline = { ...baseline, ...requestBody, version: 2 }
        send(200, baseline)
        return
      }
    }
    if (req.method === 'POST' && requestUrl.pathname === `/api/task-baselines/${baselineId}/publish`) {
      baseline = { ...baseline, status: 'confirmed', version: 3 }
      send(200, baseline)
      return
    }
    if (req.method === 'POST' && requestUrl.pathname === `/api/task-baselines/${baselineId}/revisions`) {
      revisionActive = true
      send(201, { revision_id: revisionId })
      return
    }
    if (requestUrl.pathname === `/api/task-baselines/${revisionId}`) {
      if (req.method === 'GET') {
        if (!revisionActive) {
          sendError(404, 'NOT_FOUND', 'revision not found')
          return
        }
        send(200, {
          id: revisionId,
          status: 'revising',
          source_version_id: baselineId,
          items: baseline.items,
        })
        return
      }
      if (req.method === 'DELETE') {
        revisionActive = false
        send(200, { id: revisionId })
        return
      }
    }
    if (requestUrl.pathname === `/api/projects/${projectId}`) {
      if (req.method === 'GET') {
        if (project) send(200, project)
        else sendError(404, 'NOT_FOUND', 'project not found')
        return
      }
      if (req.method === 'DELETE') {
        project = null
        send(200, { id: projectId })
        return
      }
    }
    sendError(404, 'NOT_FOUND', 'not found')
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
      '--public-origin', 'https://workbuddy.example.com',
      '--project-id', projectId,
      '--report', reportPath,
    ], { cwd: workspaceRoot })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', rejectChild)
    child.once('close', (code) => resolveChild({ code, stderr }))
  })

  assert.equal(childResult.code, 0, childResult.stderr)
  assert.equal(accuracyRequestCount, 1)
  assert.equal(previewRequestCount, canonicalBusinessPreviewCases.length)
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(report.status, 'pass')
  assert.equal(report.steps.durationAccuracyReadback.status, 'unavailable')
  assert.equal(report.steps.durationAccuracyReadback.httpStatus, 403)
  assert.equal(report.steps.durationAccuracyReadback.dataState, 'forbidden_company_admin_required')
  assert.equal(report.steps.durationAccuracyReadback.nonBlocking, true)
  assert.equal(
    report.steps.durationAccuracyReadback.claimBoundary,
    'wizard_business_smoke_only_no_accuracy_readback_claim',
  )
  assert.equal(report.steps.previewBusinessTypeMatrix.status, 'pass')
  assert.equal(report.steps.commitWizardGeneration.status, 'pass')
  assert.equal(report.steps.taskDependencyReadback.status, 'pass')
  assert.equal(report.steps.criticalPathReadback.status, 'pass')
  assert.equal(report.steps.publishBaseline.status, 'pass')
  assert.equal(report.steps.startRevision.status, 'pass')
  assert.equal(report.steps.rollbackRevisionDraft.status, 'pass')
  assert.equal(report.cleanup.status, 'pass')
  assert.equal(report.cleanup.projectPhysicallyDeleted, true)
  assert.equal(project, null)
})
