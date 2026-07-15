import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

const requiredProductionBaselineIds = [
  'PB-01',
  'PB-02',
  'PB-03',
  'PB-04',
  'PB-05',
  'PB-06',
  'PB-07',
  'PB-08',
  'PB-09',
  'PB-10',
  'PB-11',
  'PB-12',
  'PB-T01',
  'PB-T02',
  'PB-T03',
  'PB-T04',
]

function fakeClassCoverage(prefix, count) {
  return {
    normal: Array.from({ length: count }, (_, index) => `${prefix}-NORMAL-${index + 1}`),
    boundary: Array.from({ length: count }, (_, index) => `${prefix}-BOUNDARY-${index + 1}`),
    exception: Array.from({ length: count }, (_, index) => `${prefix}-EXCEPTION-${index + 1}`),
    security: Array.from({ length: count }, (_, index) => `${prefix}-SECURITY-${index + 1}`),
  }
}

function writeCaseDensityArtifacts(releaseDir, { pb09Count = 5, defaultCount = 3, caseCount = 184 } = {}) {
  writeJson(path.join(releaseDir, 'v1424-test-case-matrix.json'), {
    schemaVersion: 'workbuddy/v1424-test-case-matrix/v1',
    status: 'case-ledger-ready-not-executed',
    cases: Array.from({ length: caseCount }, (_, index) => ({ caseId: `CASE-${index + 1}` })),
  })
  writeJson(path.join(releaseDir, 'v1424-baseline-test-coverage-map.json'), {
    schemaVersion: 'workbuddy/v1424-baseline-test-coverage-map/v1',
    status: 'coverage-map-ready-not-executed',
    baselines: Object.fromEntries(
      requiredProductionBaselineIds.map((baselineId) => [
        baselineId,
        {
          baselineId,
          name: `${baselineId} name`,
          classCoverage: fakeClassCoverage(
            baselineId.replace('-', ''),
            baselineId === 'PB-09' ? pb09Count : defaultCount,
          ),
        },
      ]),
    ),
  })
}

function writeFailingHandoffReadiness(releaseDir) {
  writeJson(path.join(releaseDir, 'handoff-readiness.json'), {
    schemaVersion: 'workbuddy-release-handoff-readiness/v1',
    status: 'fail',
    readyToRun: false,
    gateCount: 4,
    readyGateCount: 0,
    blockedGateCount: 4,
    secretLeakCount: 0,
    refIssueCount: 0,
    gates: [
      {
        id: 'c18-l07-l15-live-diagnostics',
        readyToRun: false,
        missingFlags: ['--include-live', '--confirm-live-handoff'],
        missingFields: ['live.baseUrl', 'live.authTokenRef', 'targets.projectId'],
        missingRecommendedFields: ['evidenceOwners.databaseEvidenceOwner'],
        placeholderFields: [],
        blockingIssues: [
          { code: 'unlock-flag-missing', detail: '--include-live' },
          { code: 'handoff-field-missing', detail: 'live.baseUrl' },
        ],
      },
      {
        id: 'c15-live-learning-closeout',
        readyToRun: false,
        missingFlags: ['--include-live', '--confirm-live-handoff'],
        missingFields: ['targets.companyId', 'targets.sampleCohortRef'],
        missingRecommendedFields: [],
        placeholderFields: [],
        blockingIssues: [
          { code: 'handoff-field-missing', detail: 'targets.companyId' },
        ],
      },
      {
        id: 'c19-runtime-publication-release-rollback',
        readyToRun: false,
        missingFlags: ['--include-live', '--confirm-live-handoff'],
        missingFields: ['targets.publicationKey'],
        missingRecommendedFields: [],
        placeholderFields: [],
        blockingIssues: [
          { code: 'handoff-field-missing', detail: 'targets.publicationKey' },
        ],
      },
      {
        id: 'old-object-physical-drop-closeout',
        readyToRun: false,
        missingFlags: ['--include-db', '--confirm-db-ready'],
        missingFields: ['database.connectionRef'],
        missingRecommendedFields: [],
        placeholderFields: [],
        blockingIssues: [
          { code: 'handoff-field-missing', detail: 'database.connectionRef' },
        ],
      },
    ],
  })
}

function writeHandoffSignalsWithCandidateMismatch(releaseDir) {
  writeJson(path.join(releaseDir, 'handoff-signals.json'), {
    schemaVersion: 'workbuddy-release-handoff-signals/v1',
    connectivity: {
      db: {
        ok: true,
      },
    },
    discoveredTargets: {
      companyId: 'company-selected',
      projectId: 'project-selected',
      planId: 'plan-selected',
      candidateId: '',
      sampleCohortRef: 'db-sample://project/project-selected/duration-context-policy-canary-candidates',
    },
    candidateDiscovery: {
      ready: false,
      selectedCandidateId: '',
      selectedBy: '',
      blockers: [
        'canary_candidate_selected_project_missing',
        'canary_candidate_selected_company_missing',
        'canary_candidate_selected_project_eligible_status_missing',
        'canary_candidate_selected_company_eligible_status_missing',
        'canary_candidate_selected_project_company_eligible_status_missing',
        'canary_candidate_selected_id_missing',
      ],
      counts: {
        total: 1,
        selectedProject: 0,
        selectedCompany: 0,
        eligibleStatus: 1,
        selectedProjectEligibleStatus: 0,
        selectedCompanyEligibleStatus: 0,
        selectedProjectCompanyEligibleStatus: 0,
      },
      latest: {
        any: {
          id: 'candidate-other',
          projectId: 'project-other',
          companyId: 'company-other',
          candidateStatus: 'approved_for_canary',
        },
      },
      filterInputs: {
        projectIdPresent: true,
        companyIdPresent: true,
      },
    },
  })
}

test('refresh summary ignores stale G4 failures when a newer same-command result passed', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-'))
  mkdirSync(path.join(releaseDir, 'uiux-predeploy-gates'), { recursive: true })

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    {
      id: 'G4-browser-suite-shell-and-collab',
      gate: 'G4',
      status: 'fail',
      exitCode: 1,
      finishedAt: '2026-07-03T00:00:00.000Z',
      summary: 'shell/collab browser suite failed',
    },
    {
      id: 'G4-browser-suite-shell-and-collab-2',
      gate: 'G4',
      status: 'pass',
      exitCode: 0,
      finishedAt: '2026-07-04T00:00:00.000Z',
      summary: 'shell/collab browser suite passed',
    },
    {
      id: 'G4-browser-suite-project-chains',
      gate: 'G4',
      status: 'fail',
      exitCode: 1,
      finishedAt: '2026-07-04T00:10:00.000Z',
      summary: 'project-chain browser suite failed',
    },
    {
      id: 'G4-browser-suite-planning-and-tooling',
      gate: 'G4',
      status: 'fail',
      exitCode: 1,
      finishedAt: '2026-07-03T00:20:00.000Z',
      summary: 'planning/tooling browser suite failed',
    },
    {
      id: 'G4-browser-suite-planning-and-tooling-2',
      gate: 'G4',
      status: 'pass',
      exitCode: 0,
      finishedAt: '2026-07-04T00:20:00.000Z',
      summary: 'planning/tooling browser suite passed',
    },
    {
      id: 'G4-uiux-predeploy-gates',
      gate: 'G4',
      status: 'pass',
      exitCode: 0,
      finishedAt: '2026-07-04T00:30:00.000Z',
      summary: 'predeploy passed',
    },
  ])

  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-blocked',
    gates: {
      G0: 'pass',
      G1: 'pass',
      G2: 'blocked',
      G3: 'blocked',
      G4: 'fail',
      G5: 'deferred',
      G6: 'deferred',
      G7: 'pass',
      G8: 'pass',
    },
    openBlockers: [
      { gate: 'G2', severity: 'P0', reason: 'migration blocked', requiredAction: 'rerun migration evidence' },
      { gate: 'G4', severity: 'P0', reason: 'stale old blocker', requiredAction: 'rerun stale commands' },
    ],
    productionGapMatrix: {
      'GAP-P0-05': {
        severity: 'P0',
        status: 'fail',
        gate: 'G4',
        evidence: [],
        decisionImpact: 'release-blocked',
      },
    },
    productionBaselineMatrix: {
      'PB-09': { currentEvidence: [], blockers: [] },
      'PB-T04': { currentEvidence: [], blockers: [] },
    },
    downgradedCapabilities: ['CompanyCockpit and browser/UIUX flows remain degraded until all G4 browser suites and UIUX child gates pass; current UIUX predeploy alone is not enough.'],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  writeCaseDensityArtifacts(releaseDir)
  writeJson(path.join(releaseDir, 'v1424-false-green-audit.json'), {
    summary: { status: 'no-suspect-pattern-found', findingCount: 0 },
    findings: [],
  })
  writeFileSync(path.join(releaseDir, 'v1424-test-case-ledger.md'), '# ledger\n', 'utf8')

  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-blocked',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })

  writeFileSync(
    path.join(releaseDir, 'v1424-production-baseline-matrix.json'),
    `\uFEFF${JSON.stringify({
      schemaVersion: 'workbuddy-v1424-production-baseline-matrix/v1',
      generatedAt: '2026-07-03T00:00:00.000Z',
      sourceManifest: 'project-testing/reports/release-v1.4.24-20260702-125254/v1424-source-manifest.json',
      productionBaselineMatrix: {
        'PB-09': { currentEvidence: ['stale-evidence'], blockers: ['stale blocker'] },
      },
    }, null, 2)}\n`,
    'utf8',
  )

  writeJson(path.join(releaseDir, 'uiux-predeploy-gates', 'predeploy-gates-summary.json'), {
    status: 'passed',
    generatedAt: '2026-07-04T00:30:00.000Z',
    summaries: [{ gate: 'visual', status: 'passed' }],
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))
  const baselineMatrix = readJson(path.join(releaseDir, 'v1424-production-baseline-matrix.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')
  const g4Blocker = decision.openBlockers.find((blocker) => blocker.gate === 'G4')

  assert.ok(g4Blocker, 'G4 should remain blocked because project chains still fails')
  assert.match(g4Blocker.reason, /G4-browser-suite-project-chains: fail/)
  assert.doesNotMatch(g4Blocker.reason, /G4-browser-suite-shell-and-collab: fail/)
  assert.doesNotMatch(g4Blocker.reason, /G4-browser-suite-planning-and-tooling: fail/)
  assert.equal(baselineMatrix.sourceDecision, 'v1424-release-decision.json')
  assert.equal(baselineMatrix.synchronizationPolicy, 'mirrors-v1424-release-decision-productionBaselineMatrix')
  assert.deepEqual(baselineMatrix.productionBaselineMatrix, decision.productionBaselineMatrix)
  assert.equal(baselineMatrix.generatedAt, decision.generatedAt)
  assert.ok(decision.artifactIndex.includes('v1424-test-case-matrix.json'))
  assert.ok(decision.artifactIndex.includes('v1424-baseline-test-coverage-map.json'))
  assert.ok(decision.artifactIndex.includes('v1424-false-green-audit.json'))
  assert.ok(decision.artifactIndex.includes('v1424-test-case-ledger.md'))
  assert.ok(decision.artifactIndex.includes('v1424-production-baseline-matrix.json'))
  assert.equal(decision.testCaseDensitySummary.status, 'density-minimum-met-not-executed')
  assert.equal(decision.testCaseDensitySummary.caseCount, 184)
  assert.equal(decision.testCaseDensitySummary.baselineCount, 16)
  assert.equal(decision.testCaseDensitySummary.pb09.classCounts.normal, 5)
  assert.equal(decision.testCaseDensitySummary.pb09.classCounts.boundary, 5)
  assert.equal(decision.testCaseDensitySummary.pb09.classCounts.exception, 5)
  assert.equal(decision.testCaseDensitySummary.pb09.classCounts.security, 5)
  assert.equal(decision.testCaseDensitySummary.tooThinBaselines.length, 0)
  assert.match(summaryMarkdown, /## Artifact Index/)
  assert.match(summaryMarkdown, /v1424-test-case-matrix\.json/)
  assert.match(summaryMarkdown, /v1424-production-baseline-matrix\.json/)
  assert.match(summaryMarkdown, /## Test Case Density/)
  assert.match(summaryMarkdown, /PB-09: normal=5, boundary=5, exception=5, security=5/)
})

test('refresh summary never emits release-pass while non-P0 blockers remain', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-p1-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G1-tests', gate: 'G1', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G2-db', gate: 'G2', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G3-auth', gate: 'G3', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G4-browser', gate: 'G4', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G5-live-handoff', gate: 'G5', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G6-pressure', gate: 'G6', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G7-security', gate: 'G7', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G8-decision', gate: 'G8', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])

  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [
      { gate: 'G5', severity: 'P1', reason: 'live closeout explicit gate remains', requiredAction: 'complete handoff' },
    ],
    productionGapMatrix: {},
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
  })

  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')

  assert.equal(decision.decision, 'release-pass-with-explicit-gates')
  assert.equal(summary.decision, 'release-pass-with-explicit-gates')
  assert.equal(decision.explicitGateSummary.status, 'explicit-gates-present')
  assert.equal(summary.explicitGateSummary.status, 'explicit-gates-present')
  assert.equal(summary.explicitGateSummary.nonP0Blockers[0].gate, 'G5')
  assert.match(summaryMarkdown, /## Explicit Gates/)
  assert.match(summaryMarkdown, /\[P1\]\[G5\] live closeout explicit gate remains/)
})

test('refresh summary flags PB-09 case density below v1.4.24 minimum', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-density-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])

  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
  })

  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  writeCaseDensityArtifacts(releaseDir, { pb09Count: 4, caseCount: 180 })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')
  const pb09 = summary.testCaseDensitySummary.tooThinBaselines.find((entry) => entry.baselineId === 'PB-09')

  assert.equal(decision.testCaseDensitySummary.status, 'density-too-thin-or-incomplete')
  assert.equal(summary.testCaseDensitySummary.status, 'density-too-thin-or-incomplete')
  assert.equal(summary.testCaseDensitySummary.pb09.classCounts.normal, 4)
  assert.equal(pb09.minimumPerClass, 5)
  assert.deepEqual(
    pb09.belowMinimum.map((entry) => entry.caseClass),
    ['normal', 'boundary', 'exception', 'security'],
  )
  assert.match(summaryMarkdown, /Status: density-too-thin-or-incomplete/)
  assert.match(summaryMarkdown, /PB-09: normal=4, boundary=4, exception=4, security=4/)
})

test('refresh summary reports explicit gates for deferred gates even without blockers', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-deferred-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G5-live', gate: 'G5', status: 'deferred', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])

  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
  })

  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))
  const summary = readJson(path.join(releaseDir, 'summary.json'))

  assert.equal(decision.decision, 'release-pass-with-explicit-gates')
  assert.deepEqual(decision.explicitGateSummary.deferredGates, ['G5'])
  assert.deepEqual(summary.explicitGateSummary.deferredGates, ['G5'])
})

test('refresh summary generates blockers for unresolved non-pass gates', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-unexplained-gate-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G2-migration-governance', gate: 'G2', status: 'blocked', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G5-live', gate: 'G5', status: 'deferred', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])

  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'blocked', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
  })

  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  writeFailingHandoffReadiness(releaseDir)
  writeHandoffSignalsWithCandidateMismatch(releaseDir)
  writeJson(path.join(releaseDir, 'handoff-declaration.template.json'), { schemaVersion: 'workbuddy-release-handoff-input/v1' })
  writeJson(path.join(releaseDir, 'handoff-plan.json'), { schemaVersion: 'workbuddy-release-handoff-plan/v1' })
  writeFileSync(path.join(releaseDir, 'handoff-plan.md'), '# handoff plan\n', 'utf8')
  writeFileSync(path.join(releaseDir, 'handoff-readiness.md'), '# handoff readiness\n', 'utf8')
  writeJson(path.join(releaseDir, 'c15-live-learning-preflight.json'), {
    schemaVersion: 'workbuddy-c15-live-learning-preflight/v1',
    status: 'blocked',
    projectId: 'project-1',
    companyId: 'company-1',
    dbMutation: false,
    liveMutation: false,
    decisionSummary: { decisionCount: 0, evaluatedCount: 0 },
    candidateSummary: { candidateCount: 0, latestCandidateId: null },
    calibrationSummary: { calibrationCount: 0 },
    readiness: { rewardEvaluationReady: false, candidateReady: false, calibrationReadbackReady: false },
    reasonCodes: ['duration_policy_decisions_missing', 'canary_candidate_missing'],
  })
  writeJson(path.join(releaseDir, 'c19-runtime-preflight.json'), {
    schemaVersion: 'workbuddy-c19-runtime-preflight/v1',
    status: 'blocked',
    projectId: 'project-1',
    dbMutation: false,
    liveMutation: false,
    replaySampleReadiness: { durationSampleCount: 0, t2WindowSampleCount: 0 },
    publicationReadiness: { publicationCount: 0, latestPublicationKey: null },
    runtimeEventReadiness: { monitoringCount: 1, rollbackCount: 1 },
    taskReadiness: { completedActualTaskCount: 0, t2MetadataTaskCount: 0 },
    readiness: { replaySamplesReady: false, runtimePublicationReady: false, monitoringReady: true, rollbackReady: true },
    reasonCodes: ['duration_experience_samples_missing', 'runtime_publication_missing'],
  })
  writeJson(path.join(releaseDir, 'c19-release-closure-sources-preflight.json'), {
    schemaVersion: 'workbuddy-c19-release-closure-sources-preflight/v1',
    status: 'blocked',
    readyToGenerateReleaseClosure: false,
    missingSourceFileRoles: ['archived_live_replay', 'c19_13_phase1_multinetwork_selection', 'l5_canary_handoff'],
    invalidSourceFileRoles: [],
    reasonCodes: ['release_closure_source_files_missing'],
    templateScope: {
      status: 'not-assessed',
      commonTemplateIds: [],
      mismatchRoles: [],
    },
    sources: {
      archived_live_replay: {
        present: false,
        usable: false,
        artifact: null,
        selectedTemplateIds: [],
        evidenceRefCount: 0,
        reasonCodes: ['archived_live_replay_missing'],
      },
      c19_13_phase1_multinetwork_selection: {
        present: false,
        usable: false,
        artifact: null,
        selectedTemplateIds: [],
        evidenceRefCount: 0,
        reasonCodes: ['c19_13_phase1_multinetwork_selection_missing'],
      },
      l5_canary_handoff: {
        present: false,
        usable: false,
        artifact: null,
        selectedTemplateIds: [],
        evidenceRefCount: 0,
        reasonCodes: ['l5_canary_handoff_missing'],
      },
    },
    boundary: {
      dbMutation: false,
      liveMutation: false,
    },
  })
  writeJson(path.join(releaseDir, 'c18-l07-critical-path-concurrency-live.json'), {
    reportCode: 'c18_l07_critical_path_concurrency_live_diagnostic',
    diagnosticRunId: 'v1424-c18-l07-test',
    status: 'fail',
    projectId: 'project-1',
    runtimeEvidenceGap: {
      missingLockTelemetryEvidence: true,
      missingFinalProjectionReadback: false,
    },
    lockTelemetryAssessment: {
      status: 'fail',
      environment: 'staging',
      missingSignals: ['lock_acquired', 'lock_wait', 'lock_released'],
    },
    checks: {
      concurrentSweepAndRoute: {
        status: 'fail',
        reason: 'Expected sweep and all route refreshes to complete successfully.',
        operations: [
          {
            operation: 'sweep',
            success: false,
            response: {
              failures: [
                {
                  projectId: 'project-1',
                  error: 'password authentication failed for user "workbuddy_runtime_login"',
                },
              ],
            },
          },
          {
            operation: 'route_refresh',
            success: true,
            response: {
              httpStatus: 200,
              projectId: 'project-1',
            },
          },
        ],
      },
    },
  })
  writeJson(path.join(releaseDir, 'runtime-login-role-repair-attempt.json'), {
    schemaVersion: 'workbuddy-v1424-runtime-login-role-repair-attempt/v1',
    status: 'blocked-by-privileged-database-connection',
    safeToShare: true,
    secretsPrinted: false,
    targetRole: 'workbuddy_runtime_login',
    attempts: [
      {
        method: 'direct-postgres-5432',
        result: 'failed',
        failureCategory: 'migration_database_connection_timeout',
        safeErrorSummary: 'direct Supabase database host resolves to IPv6 only from this machine and timed out on port 5432',
      },
      {
        method: 'supabase-pooler-region-probe',
        result: 'failed',
        failureCategory: 'migration_pooler_tenant_user_missing',
        safeErrorSummary: 'pooler endpoints were reachable, but returned tenant/user postgres.<project-ref> not found',
      },
    ],
    nextRequiredInput: [
      'a working Supabase pooler connection string for this project from the dashboard',
      'or SQL Editor execution of the runtime login repair SQL using the current WORKBUDDY_RUNTIME_LOGIN_PASSWORD',
    ],
  })
  writeJson(path.join(releaseDir, 'runtime-login-role-sql-editor-package.json'), {
    schemaVersion: 'workbuddy-v1424-runtime-login-role-sql-editor-package/v1',
    status: 'sql-editor-repair-package-ready',
    safeToShare: true,
    secretsPrinted: false,
    containsSensitiveSqlFile: true,
    targetProjectRef: 'xemqmqpifsstkovbkatp',
    targetRole: 'workbuddy_runtime_login',
    artifacts: {
      repairSql: 'project-testing/reports/test-release/runtime-login-role-repair.sql',
      verifySql: 'project-testing/reports/test-release/runtime-login-role-verify.sql',
    },
    operatorSteps: [
      'Open the Supabase staging project SQL Editor.',
      'Execute runtime-login-role-repair.sql inside the SQL Editor. Do not paste its content into chat or logs.',
      'Execute runtime-login-role-verify.sql and confirm workbuddy_runtime_login has LOGIN=true, BYPASSRLS=false, INHERIT=true.',
    ],
  })
  writeJson(path.join(releaseDir, 'runtime-login-role-readback.json'), {
    schemaVersion: 'workbuddy-v1424-runtime-login-role-readback/v1',
    status: 'structural-pass-password-unverified',
    safeToShare: true,
    secretsPrinted: false,
    targetRole: 'workbuddy_runtime_login',
    runtimeGroupRole: 'workbuddy_runtime',
    sources: [{ kind: 'sql-editor-verify-result', artifact: 'runtime-login-role-verify-result.json' }],
    checks: {
      targetRole: {
        roleName: 'workbuddy_runtime_login',
        present: true,
        canLogin: true,
        bypassRls: false,
        inherit: true,
      },
      runtimeGroupRole: {
        roleName: 'workbuddy_runtime',
        present: true,
        canLogin: false,
        bypassRls: false,
      },
      membership: {
        memberRole: 'workbuddy_runtime_login',
        grantedRole: 'workbuddy_runtime',
        present: true,
      },
      functionPrivileges: {
        is_active_company_member: { schemaName: 'public', canExecute: true },
        is_active_project_member: { schemaName: 'public', canExecute: true },
      },
      passwordAuth: {
        status: 'unverified',
        currentUser: null,
        safeErrorSummary: null,
        errorCode: null,
      },
    },
    structuralBlockers: [],
    passwordAuthBlockers: ['runtime_password_auth_smoke_missing'],
    blockers: ['runtime_password_auth_smoke_missing'],
    closesRuntimeLoginPrerequisite: false,
    releaseImpact: [
      'This is runtime login prerequisite evidence only.',
      'It does not close G5 by itself; C18 live diagnostics and the remaining live/DB closeout gates must still pass.',
    ],
    boundary: {
      liveMutation: false,
      dbMutation: false,
      readOnly: true,
      closesG5: false,
    },
  })
  writeJson(path.join(releaseDir, 'c19-t2-replay-metadata-remediation-plan.json'), {
    schemaVersion: 'workbuddy-c19-t2-replay-metadata-remediation-plan/v1',
    status: 'dry-run-plan-ready',
    generatedAt: '2026-07-04T14:10:00.000Z',
    dryRun: true,
    liveMutation: false,
    dbMutation: false,
    projectId: 'project-1',
    unknownCodes: ['T2-STRUCTURE', 'T2-MEP', 'T2-FACADE', 'T2-FINISH'],
    unsupportedCodes: [],
    requiredDurationBearingWindows: [
      't2-residential-standard-floor-structure-rhythm-v1:W01',
      't2-residential-standard-floor-structure-rhythm-v1:W02',
      't2-residential-standard-floor-structure-rhythm-v1:W03',
      't2-residential-standard-floor-structure-rhythm-v1:W04',
      't2-residential-standard-floor-structure-rhythm-v1:W05',
      't2-residential-standard-floor-structure-rhythm-v1:W06',
    ],
    minimumWorkfacesPerWindow: 3,
    plannedUpdateCount: 18,
    reasonCodes: ['dry_run_only_not_evidence_of_repair'],
    nextActions: [
      'review_c19_t2_replay_metadata_remediation_plan',
      'run_controlled_live_closeout_writer_or_explicit_staging_remediation_with_write_approval',
      'rerun_diagnose_t2_rhythm_live_replay_after_write',
    ],
  })
  for (const artifact of [
    'c18-l07-l15-live-diagnostics-evidence-validation.json',
    'c15-live-learning-closeout-evidence-validation.json',
    'c19-runtime-publication-release-rollback-evidence-validation.json',
    'old-object-physical-drop-closeout-evidence-validation.json',
  ]) {
    writeJson(path.join(releaseDir, artifact), { status: 'fail' })
  }

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))
  const summary = readJson(path.join(releaseDir, 'summary.json'))

  const g2Blocker = decision.openBlockers.find((blocker) => blocker.gate === 'G2')
  const g5Blocker = decision.openBlockers.find((blocker) => blocker.gate === 'G5')

  assert.equal(decision.decision, 'release-blocked')
  assert.equal(summary.decision, 'release-blocked')
  assert.equal(g2Blocker?.severity, 'P0')
  assert.match(g2Blocker?.reason ?? '', /G2 is blocked by current migration governance evidence/)
  assert.match(g2Blocker?.reason ?? '', /Advisor Management API preflight artifact is missing/)
  assert.match(g2Blocker?.reason ?? '', /supabase-advisor-management-api-preflight\.json/)
  assert.match(g2Blocker?.reason ?? '', /supabase-advisor-management-api-export\.json/)
  assert.match(g2Blocker?.reason ?? '', /production migration governance report is missing/)
  assert.match(g2Blocker?.requiredAction ?? '', /Management API Advisor export/)
  assert.equal(g5Blocker?.severity, 'P1')
  assert.match(g5Blocker?.reason ?? '', /G5 is deferred by current live\/DB closeout evidence/)
  assert.match(g5Blocker?.reason ?? '', /handoff readiness=fail; readyToRun=false; blockedGateCount=4/)
  assert.match(g5Blocker?.reason ?? '', /missing flags=--include-live, --confirm-live-handoff, --include-db, --confirm-db-ready/)
  assert.match(g5Blocker?.reason ?? '', /validation not closed=c18-l07-l15-live-diagnostics:fail/)
  assert.match(g5Blocker?.reason ?? '', /C18 diagnostics=fail; present=1\/8; failing=1/)
  assert.match(g5Blocker?.reason ?? '', /c18-l07-critical-path-concurrency-live\.json:fail/)
  assert.match(g5Blocker?.reason ?? '', /password authentication failed for user "workbuddy_runtime_login"/)
  assert.match(g5Blocker?.reason ?? '', /missingSignals=lock_acquired,lock_wait,lock_released/)
  assert.match(g5Blocker?.reason ?? '', /runtime login repair=blocked-by-privileged-database-connection/)
  assert.match(g5Blocker?.reason ?? '', /direct-postgres-5432:migration_database_connection_timeout/)
  assert.match(g5Blocker?.reason ?? '', /supabase-pooler-region-probe:migration_pooler_tenant_user_missing/)
  assert.match(g5Blocker?.reason ?? '', /runtime login SQL Editor package=sql-editor-repair-package-ready/)
  assert.match(g5Blocker?.reason ?? '', /runtime-login-role-repair\.sql/)
  assert.match(g5Blocker?.reason ?? '', /sensitiveSql=true/)
  assert.match(g5Blocker?.reason ?? '', /runtime login readback=structural-pass-password-unverified/)
  assert.match(g5Blocker?.reason ?? '', /closesRuntimeLoginPrerequisite=false/)
  assert.match(g5Blocker?.reason ?? '', /structuralBlockers=none/)
  assert.match(g5Blocker?.reason ?? '', /passwordAuthBlockers=runtime_password_auth_smoke_missing/)
  assert.match(g5Blocker?.reason ?? '', /candidate discovery ready=false; selectedCandidateId=missing/)
  assert.match(g5Blocker?.reason ?? '', /canary_candidate_selected_project_missing/)
  assert.match(g5Blocker?.reason ?? '', /counts total=1, selectedProject=0, selectedCompany=0, eligibleStatus=1/)
  assert.match(g5Blocker?.reason ?? '', /latestAny=candidate-other\/project-other\/company-other\/approved_for_canary/)
  assert.match(g5Blocker?.reason ?? '', /C15 preflight=blocked; reasons=duration_policy_decisions_missing, canary_candidate_missing/)
  assert.match(g5Blocker?.reason ?? '', /C19 preflight=blocked; reasons=duration_experience_samples_missing, runtime_publication_missing/)
  assert.match(g5Blocker?.reason ?? '', /C19 release closure sources=blocked; readyToGenerate=false/)
  assert.match(g5Blocker?.reason ?? '', /missing=archived_live_replay, c19_13_phase1_multinetwork_selection, l5_canary_handoff/)
  assert.match(g5Blocker?.reason ?? '', /C19 T2 replay metadata remediation=dry-run-plan-ready; dryRun=true; plannedUpdates=18/)
  assert.match(g5Blocker?.reason ?? '', /unknownCodes=T2-STRUCTURE, T2-MEP, T2-FACADE, T2-FINISH/)
  assert.match(g5Blocker?.requiredAction ?? '', /Complete the handoff declaration/)
  assert.match(g5Blocker?.requiredAction ?? '', /C19 T2 remediation through a controlled writer or explicit staging write approval/)
  assert.deepEqual(summary.explicitGateSummary.deferredGates, ['G5'])
  assert.equal(summary.explicitGateSummary.nonP0Blockers.find((blocker) => blocker.gate === 'G5')?.severity, 'P1')
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('evidence:supabase-advisor:management-api-preflight')))
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('evidence:supabase-advisor:management-api --')))
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('migrate:production-governance:evidence')))
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('migrate:production-governance --workspace=server')))
  assert.equal(
    summary.mustRerunBeforeProduction.includes('npm run migrate:production-governance --workspace=server -- --evidence-file <production-migration-governance-evidence.json>'),
    false,
  )
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('generate-release-handoff-pack.mjs --target real-closeout')))
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('check-release-handoff-readiness.mjs')))
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('--gate c18-l07-l15-live-diagnostics')))
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('--gate c15-live-learning-closeout')))
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('--gate c19-runtime-publication-release-rollback')))
  assert.ok(summary.mustRerunBeforeProduction.some((command) => command.includes('--gate old-object-physical-drop-closeout')))
  assert.equal(summary.mustRerunBeforeProduction.includes('Live handoff and rollback evidence for G5'), false)
  assert.equal(summary.g2MigrationAdvisorCloseout.status, 'missing-required-artifacts')
  assert.equal(summary.g2MigrationAdvisorCloseout.artifactPresence['supabase-advisor-management-api-preflight.json'], false)
  assert.equal(summary.g2MigrationAdvisorCloseout.artifactPresence['supabase-advisor-management-api-export.json'], false)
  assert.equal(summary.g2MigrationAdvisorCloseout.artifactPresence['supabase-advisor-dashboard-ui-browser-attempt.json'], false)
  assert.equal(summary.g2MigrationAdvisorCloseout.advisorPreflightSummary, null)
  assert.ok(
    summary.g2MigrationAdvisorCloseout.requiredCommands.some((command) =>
      command.includes('evidence:supabase-advisor:management-api-preflight'),
    ),
  )
  assert.ok(
    summary.g2MigrationAdvisorCloseout.requiredCommands.some((command) =>
      command.includes('evidence:supabase-advisor:management-api'),
    ),
  )
  assert.ok(
    summary.g2MigrationAdvisorCloseout.requiredCommands.some((command) =>
      command.includes('--advisor-export-file <artifact-root-from-server>/supabase-advisor-management-api-export.json'),
    ),
  )
  assert.match(
    summary.g2MigrationAdvisorCloseout.nonSubstitutableEvidence.join('\n'),
    /CLI db advisors evidence is supporting-only/,
  )
  assert.equal(summary.g5LiveCloseoutContract.status, 'missing-current-handoff-or-closeout-evidence')
  assert.equal(summary.g5LiveCloseoutContract.topLevelArtifactPresence['handoff-plan.json'], true)
  assert.equal(summary.g5LiveCloseoutContract.topLevelArtifactPresence['handoff-readiness.json'], true)
  assert.equal(summary.g5LiveCloseoutContract.handoffReadinessSummary.status, 'fail')
  assert.equal(summary.g5LiveCloseoutContract.handoffReadinessSummary.readyToRun, false)
  assert.equal(summary.g5LiveCloseoutContract.handoffReadinessSummary.blockedGateCount, 4)
  assert.equal(summary.g5LiveCloseoutContract.handoffSignalsSummary.dbOk, true)
  assert.equal(summary.g5LiveCloseoutContract.handoffSignalsSummary.candidateDiscovery.ready, false)
  assert.equal(summary.g5LiveCloseoutContract.handoffSignalsSummary.candidateDiscovery.counts.total, 1)
  assert.equal(summary.g5LiveCloseoutContract.handoffSignalsSummary.candidateDiscovery.counts.selectedProject, 0)
  assert.equal(summary.g5LiveCloseoutContract.handoffSignalsSummary.candidateDiscovery.latest.any.id, 'candidate-other')
  assert.ok(summary.g5LiveCloseoutContract.handoffSignalsSummary.candidateDiscovery.blockers.includes('canary_candidate_selected_project_missing'))
  assert.equal(summary.g5LiveCloseoutContract.diagnosticSummaries.c18LiveDiagnostics.status, 'fail')
  assert.equal(summary.g5LiveCloseoutContract.diagnosticSummaries.c18LiveDiagnostics.presentCount, 1)
  assert.equal(summary.g5LiveCloseoutContract.diagnosticSummaries.c18LiveDiagnostics.failingCount, 1)
  assert.equal(summary.g5LiveCloseoutContract.diagnosticSummaries.c18LiveDiagnostics.artifacts[0].status, 'fail')
  assert.equal(summary.g5LiveCloseoutContract.diagnosticSummaries.c18LiveDiagnostics.artifacts[0].diagnosticRunId, 'v1424-c18-l07-test')
  assert.match(
    summary.g5LiveCloseoutContract.diagnosticSummaries.c18LiveDiagnostics.artifacts[0].reasonSummary,
    /password authentication failed for user "workbuddy_runtime_login"/,
  )
  assert.equal(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleRepairAttempt.status,
    'blocked-by-privileged-database-connection',
  )
  assert.equal(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleRepairAttempt.attempts[0].failureCategory,
    'migration_database_connection_timeout',
  )
  assert.equal(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleRepairAttempt.attempts[1].failureCategory,
    'migration_pooler_tenant_user_missing',
  )
  assert.equal(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleSqlEditorPackage.status,
    'sql-editor-repair-package-ready',
  )
  assert.equal(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleSqlEditorPackage.containsSensitiveSqlFile,
    true,
  )
  assert.match(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleSqlEditorPackage.artifacts.repairSql,
    /runtime-login-role-repair\.sql$/,
  )
  assert.equal(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleReadback.status,
    'structural-pass-password-unverified',
  )
  assert.equal(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleReadback.closesRuntimeLoginPrerequisite,
    false,
  )
  assert.deepEqual(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleReadback.structuralBlockers,
    [],
  )
  assert.deepEqual(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleReadback.passwordAuthBlockers,
    ['runtime_password_auth_smoke_missing'],
  )
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c15LiveLearning.status, 'blocked')
  assert.deepEqual(summary.g5LiveCloseoutContract.preflightSummaries.c15LiveLearning.reasonCodes, ['duration_policy_decisions_missing', 'canary_candidate_missing'])
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c15LiveLearning.candidateCount, 0)
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19Runtime.status, 'blocked')
  assert.deepEqual(summary.g5LiveCloseoutContract.preflightSummaries.c19Runtime.reasonCodes, ['duration_experience_samples_missing', 'runtime_publication_missing'])
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19Runtime.publicationCount, 0)
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19ReleaseClosureSources.status, 'blocked')
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19ReleaseClosureSources.readyToGenerateReleaseClosure, false)
  assert.deepEqual(
    summary.g5LiveCloseoutContract.preflightSummaries.c19ReleaseClosureSources.missingSourceFileRoles,
    ['archived_live_replay', 'c19_13_phase1_multinetwork_selection', 'l5_canary_handoff'],
  )
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19ReleaseClosureSources.sourceArtifacts.archived_live_replay.present, false)
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19T2ReplayMetadataRemediation.status, 'dry-run-plan-ready')
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19T2ReplayMetadataRemediation.dryRun, true)
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19T2ReplayMetadataRemediation.dbMutation, false)
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19T2ReplayMetadataRemediation.liveMutation, false)
  assert.equal(summary.g5LiveCloseoutContract.preflightSummaries.c19T2ReplayMetadataRemediation.plannedUpdateCount, 18)
  assert.deepEqual(
    summary.g5LiveCloseoutContract.preflightSummaries.c19T2ReplayMetadataRemediation.reasonCodes,
    ['dry_run_only_not_evidence_of_repair'],
  )
  assert.ok(summary.artifactIndex.includes('handoff-declaration.template.json'))
  assert.ok(summary.artifactIndex.includes('handoff-plan.json'))
  assert.ok(summary.artifactIndex.includes('handoff-plan.md'))
  assert.ok(summary.artifactIndex.includes('handoff-readiness.json'))
  assert.ok(summary.artifactIndex.includes('handoff-readiness.md'))
  assert.ok(summary.artifactIndex.includes('c15-live-learning-preflight.json'))
  assert.ok(summary.artifactIndex.includes('c19-runtime-preflight.json'))
  assert.ok(summary.artifactIndex.includes('c19-release-closure-sources-preflight.json'))
  assert.ok(summary.artifactIndex.includes('runtime-login-role-readback.json'))
  assert.ok(summary.artifactIndex.includes('runtime-login-role-repair-attempt.json'))
  assert.ok(summary.artifactIndex.includes('runtime-login-role-sql-editor-package.json'))
  assert.ok(summary.artifactIndex.includes('c18-l07-l15-live-diagnostics-evidence-validation.json'))
  assert.ok(summary.artifactIndex.includes('c15-live-learning-closeout-evidence-validation.json'))
  assert.ok(summary.artifactIndex.includes('c19-runtime-publication-release-rollback-evidence-validation.json'))
  assert.ok(summary.artifactIndex.includes('old-object-physical-drop-closeout-evidence-validation.json'))
  assert.deepEqual(
    summary.g5LiveCloseoutContract.gates.map((gate) => gate.id),
    [
      'c18-l07-l15-live-diagnostics',
      'c15-live-learning-closeout',
      'c19-runtime-publication-release-rollback',
      'old-object-physical-drop-closeout',
    ],
  )
  assert.ok(
    summary.g5LiveCloseoutContract.gates.every((gate) =>
      gate.closeoutStatus === 'missing-or-failing-current-evidence' &&
      gate.validationCommand.includes('validate-release-evidence.mjs'),
    ),
  )
  assert.equal(summary.g5LiveCloseoutContract.gates[0].handoffReadiness.readyToRun, false)
  assert.deepEqual(summary.g5LiveCloseoutContract.gates[0].handoffReadiness.missingFlags, ['--include-live', '--confirm-live-handoff'])
  assert.ok(summary.g5LiveCloseoutContract.gates[0].handoffReadiness.missingFields.includes('live.baseUrl'))
  assert.equal(summary.g5LiveCloseoutContract.gates[0].handoffReadiness.blockingIssueCount, 2)
  assert.match(
    summary.g5LiveCloseoutContract.nonSubstitutableEvidence.join('\n'),
    /Historical handoff or staging closeout cannot close this current v1\.4\.24 release directory/,
  )
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')
  assert.match(summaryMarkdown, /## G2 Migration Advisor Closeout/)
  assert.match(summaryMarkdown, /supabase-advisor-management-api-preflight\.json: missing/)
  assert.match(summaryMarkdown, /supabase-advisor-management-api-export\.json: missing/)
  assert.match(summaryMarkdown, /Advisor Management API preflight: missing/)
  assert.match(summaryMarkdown, /SUPABASE_MANAGEMENT_API_TOKEN/)
  assert.match(summaryMarkdown, /Dashboard UI browser attempt: missing/)
  assert.match(summaryMarkdown, /## G5 Live Closeout Contract/)
  assert.match(summaryMarkdown, /handoff-plan\.json: present/)
  assert.match(summaryMarkdown, /Handoff readiness: fail; readyToRun=false; blockedGateCount=4/)
  assert.match(summaryMarkdown, /C15 candidate discovery: ready=false; selectedCandidateId=missing/)
  assert.match(summaryMarkdown, /canary_candidate_selected_project_missing/)
  assert.match(summaryMarkdown, /Counts: total=1; selectedProject=0; selectedCompany=0; eligibleStatus=1/)
  assert.match(summaryMarkdown, /Latest candidate: candidate-other; project=project-other; company=company-other; status=approved_for_canary/)
  assert.match(summaryMarkdown, /C18 diagnostics: fail; present=1\/8; failing=1/)
  assert.match(summaryMarkdown, /c18-l07-critical-path-concurrency-live\.json: fail/)
  assert.match(summaryMarkdown, /password authentication failed for user "workbuddy_runtime_login"/)
  assert.match(summaryMarkdown, /Runtime login repair attempt: blocked-by-privileged-database-connection; targetRole=workbuddy_runtime_login/)
  assert.match(summaryMarkdown, /direct-postgres-5432: failed; failureCategory=migration_database_connection_timeout/)
  assert.match(summaryMarkdown, /supabase-pooler-region-probe: failed; failureCategory=migration_pooler_tenant_user_missing/)
  assert.match(summaryMarkdown, /Runtime login SQL Editor package: sql-editor-repair-package-ready; sensitiveSql=true/)
  assert.match(summaryMarkdown, /Repair SQL: project-testing\/reports\/test-release\/runtime-login-role-repair\.sql/)
  assert.match(summaryMarkdown, /Execute runtime-login-role-repair\.sql inside the SQL Editor/)
  assert.match(summaryMarkdown, /Runtime login readback: structural-pass-password-unverified; targetRole=workbuddy_runtime_login; closesRuntimeLoginPrerequisite=false/)
  assert.match(summaryMarkdown, /Structural blockers: none/)
  assert.match(summaryMarkdown, /Password auth blockers: runtime_password_auth_smoke_missing/)
  assert.match(summaryMarkdown, /Target role: present=true; canLogin=true; bypassRls=false; inherit=true/)
  assert.match(summaryMarkdown, /Membership: workbuddy_runtime_login -> workbuddy_runtime present=true/)
  assert.match(summaryMarkdown, /Password auth: unverified/)
  assert.match(summaryMarkdown, /runtime login readback is prerequisite evidence only; it does not close G5 without C18 live diagnostic pass/)
  assert.match(summaryMarkdown, /C15 preflight: blocked; reasons=duration_policy_decisions_missing, canary_candidate_missing/)
  assert.match(summaryMarkdown, /C19 preflight: blocked; reasons=duration_experience_samples_missing, runtime_publication_missing/)
  assert.match(summaryMarkdown, /C19 release closure sources: blocked; readyToGenerate=false; reasons=release_closure_source_files_missing/)
  assert.match(summaryMarkdown, /Missing source roles: archived_live_replay, c19_13_phase1_multinetwork_selection, l5_canary_handoff/)
  assert.match(summaryMarkdown, /archived_live_replay: present=false; usable=false; artifact=missing/)
  assert.match(summaryMarkdown, /C19 T2 replay metadata remediation: dry-run-plan-ready; dryRun=true; plannedUpdates=18; dbMutation=false; liveMutation=false/)
  assert.match(summaryMarkdown, /Unknown window codes: T2-STRUCTURE, T2-MEP, T2-FACADE, T2-FINISH/)
  assert.match(summaryMarkdown, /dry-run remediation plans are supporting-only and do not close G5 without write\/readback evidence/)
  assert.match(summaryMarkdown, /missingFlags=2; missingFields=3; blockingIssues=2/)
  assert.match(summaryMarkdown, /Missing fields: live\.baseUrl, live\.authTokenRef, targets\.projectId/)
  assert.match(summaryMarkdown, /c19-runtime-publication-release-rollback/)
})

test('refresh summary reads C18 pressure live assessment status when top-level status is absent', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-c18-assessment-status-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G2-migration-governance', gate: 'G2', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass-with-explicit-gates',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    downgradedCapabilities: [],
    productionBaselineMatrix: {},
    mustRerunBeforeProduction: [],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    schemaVersion: 'workbuddy-v1424-release-summary/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    decision: 'release-pass-with-explicit-gates',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
  })
  writeCaseDensityArtifacts(releaseDir)
  writeJson(path.join(releaseDir, 'handoff-plan.json'), { schemaVersion: 'workbuddy-release-handoff-plan/v1' })
  writeJson(path.join(releaseDir, 'handoff-readiness.json'), {
    schemaVersion: 'workbuddy-release-handoff-readiness/v1',
    status: 'pass',
    readyToRun: true,
    blockedGateCount: 0,
    secretLeakCount: 0,
    refIssueCount: 0,
    gates: [],
  })
  writeJson(path.join(releaseDir, 'c18-l07-l15-live-diagnostics-evidence-validation.json'), {
    schemaVersion: 'workbuddy-release-evidence-validation/v1',
    gateId: 'c18-l07-l15-live-diagnostics',
    status: 'pass',
  })
  writeJson(path.join(releaseDir, 'c15-live-learning-closeout-evidence-validation.json'), { status: 'fail' })
  writeJson(path.join(releaseDir, 'c19-runtime-publication-release-rollback-evidence-validation.json'), { status: 'fail' })
  writeJson(path.join(releaseDir, 'old-object-physical-drop-closeout-evidence-validation.json'), { status: 'pass' })

  for (const artifact of [
    'c18-l07-critical-path-concurrency-live.json',
    'c18-l08-acceptance-status-concurrency-live.json',
    'c18-l09-wizard-commit-live.json',
    'c18-l11-warning-sync-query-log.json',
    'c18-l15-spreadsheet-migration-replay.json',
  ]) {
    writeJson(path.join(releaseDir, artifact), {
      status: 'pass',
      diagnosticRunId: `run-${artifact}`,
      environment: 'current-live',
    })
  }

  writeJson(path.join(releaseDir, 'c18-l10-wbs-generation-pressure.json'), {
    diagnosticRunId: 'run-l10',
    routeEvidenceAssessment: { status: 'pass' },
  })
  writeJson(path.join(releaseDir, 'c18-l12-critical-path-network-pressure.json'), {
    diagnosticRunId: 'run-l12',
    dbEvidenceAssessment: { status: 'pass' },
  })
  writeJson(path.join(releaseDir, 'c18-l14-company-summary-pressure.json'), {
    diagnosticRunId: 'run-l14',
    routeEvidenceAssessment: { status: 'pass' },
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const c18 = summary.g5LiveCloseoutContract.diagnosticSummaries.c18LiveDiagnostics

  assert.equal(c18.status, 'pass')
  assert.equal(c18.presentCount, 8)
  assert.equal(c18.failingCount, 0)
  assert.equal(c18.artifacts.find((artifact) => artifact.artifact === 'c18-l10-wbs-generation-pressure.json')?.status, 'pass')
  assert.equal(c18.artifacts.find((artifact) => artifact.artifact === 'c18-l12-critical-path-network-pressure.json')?.status, 'pass')
  assert.equal(c18.artifacts.find((artifact) => artifact.artifact === 'c18-l14-company-summary-pressure.json')?.status, 'pass')

  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')
  assert.match(summaryMarkdown, /C18 diagnostics: pass; present=8\/8; failing=0/)
  assert.doesNotMatch(summaryMarkdown, /c18-l10-wbs-generation-pressure\.json: unknown/)
  assert.doesNotMatch(summaryMarkdown, /c18-l12-critical-path-network-pressure\.json: unknown/)
  assert.doesNotMatch(summaryMarkdown, /c18-l14-company-summary-pressure\.json: unknown/)
})

test('refresh summary trusts current C18 live evidence summary over stale per-artifact unknown statuses', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-c18-summary-pass-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass-with-explicit-gates',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    downgradedCapabilities: [],
    productionBaselineMatrix: {},
    mustRerunBeforeProduction: [],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    schemaVersion: 'workbuddy-v1424-release-summary/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    decision: 'release-pass-with-explicit-gates',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
  })
  writeJson(path.join(releaseDir, 'handoff-readiness.json'), {
    schemaVersion: 'workbuddy-release-handoff-readiness/v1',
    status: 'fail',
    readyToRun: false,
    blockedGateCount: 1,
    secretLeakCount: 0,
    refIssueCount: 0,
    gates: [],
  })
  writeJson(path.join(releaseDir, 'c18-live-evidence-summary.json'), {
    schemaVersion: 'workbuddy-c18-l07-l15-live-evidence-summary/v1',
    status: 'pass',
    canClaimC18L07L15Closeout: true,
    diagnosticRunId: 'c18-summary-pass',
    items: [
      { itemId: 'C-18.L10', status: 'pass', diagnosticRunId: 'run-l10-summary' },
      { itemId: 'C-18.L12', status: 'pass', diagnosticRunId: 'run-l12-summary' },
      { itemId: 'C-18.L14', status: 'pass', diagnosticRunId: 'run-l14-summary' },
    ],
  })
  for (const artifact of [
    'c18-l07-critical-path-concurrency-live.json',
    'c18-l08-acceptance-status-concurrency-live.json',
    'c18-l09-wizard-commit-live.json',
    'c18-l11-warning-sync-query-log.json',
    'c18-l15-spreadsheet-migration-replay.json',
  ]) {
    writeJson(path.join(releaseDir, artifact), { status: 'pass', diagnosticRunId: `run-${artifact}` })
  }
  for (const artifact of [
    'c18-l10-wbs-generation-pressure.json',
    'c18-l12-critical-path-network-pressure.json',
    'c18-l14-company-summary-pressure.json',
  ]) {
    writeJson(path.join(releaseDir, artifact), { diagnosticRunId: `stale-${artifact}` })
  }

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const c18 = summary.g5LiveCloseoutContract.diagnosticSummaries.c18LiveDiagnostics

  assert.equal(c18.status, 'pass')
  assert.equal(c18.presentCount, 8)
  assert.equal(c18.failingCount, 0)
  assert.equal(c18.summaryArtifact, 'c18-live-evidence-summary.json')
  assert.equal(c18.artifacts.find((artifact) => artifact.id === 'C-18.L10')?.diagnosticRunId, 'run-l10-summary')
  assert.equal(c18.artifacts.find((artifact) => artifact.id === 'C-18.L12')?.diagnosticRunId, 'run-l12-summary')
  assert.equal(c18.artifacts.find((artifact) => artifact.id === 'C-18.L14')?.diagnosticRunId, 'run-l14-summary')

  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')
  assert.match(summaryMarkdown, /C18 diagnostics: pass; present=8\/8; failing=0/)
  assert.doesNotMatch(summaryMarkdown, /c18-l10-wbs-generation-pressure\.json: unknown/)
  assert.doesNotMatch(summaryMarkdown, /c18-l12-critical-path-network-pressure\.json: unknown/)
  assert.doesNotMatch(summaryMarkdown, /c18-l14-company-summary-pressure\.json: unknown/)
})

test('refresh summary keeps G2 blocked when governance report has MG-07 blocked', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-g2-mg07-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G2-migration-governance', gate: 'G2', status: 'blocked', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'supabase-advisor-management-api-preflight.json'), {
    schemaVersion: 'workbuddy-supabase-advisor-management-api-preflight/v1',
    status: 'ready',
    readyToRun: true,
    envFilePresent: true,
    projectRef: 'xemqmqpifsstkovbkatp',
    resolvedTokenEnv: 'SUPABASE_MANAGEMENT_API_TOKEN',
    blockers: [],
    requiredExportArtifact: 'project-testing/reports/test/supabase-advisor-management-api-export.json',
  })
  writeJson(path.join(releaseDir, 'supabase-advisor-management-api-export.json'), {
    schemaVersion: 'workbuddy-supabase-advisor-ui-or-api-export/v1',
    source: 'management_api',
    exportedAt: '2026-07-04T00:00:00.000Z',
    artifactPath: 'project-testing/reports/test/supabase-advisor-management-api-export.json',
    securityIssueCount: 0,
  })
  writeJson(path.join(releaseDir, 'production-migration-governance-evidence.json'), {
    inventoryFrozen: true,
  })
  writeJson(path.join(releaseDir, 'production-migration-governance-report.json'), {
    gate: 'production-migration-governance',
    status: 'ready_for_closeout_readback',
    gates: [
      { id: 'MG-01', status: 'pass', reasonCodes: [] },
      { id: 'MG-02', status: 'pass', reasonCodes: [] },
      { id: 'MG-03', status: 'pass', reasonCodes: [] },
      { id: 'MG-04', status: 'pass', reasonCodes: [] },
      { id: 'MG-05', status: 'pass', reasonCodes: [] },
      { id: 'MG-06', status: 'pass', reasonCodes: [] },
      { id: 'MG-07', status: 'blocked', reasonCodes: ['live_advisor_rescan_missing'] },
    ],
    allowValidate: true,
    allowWarmup: false,
    allowScheduler: false,
  })
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'blocked', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')

  assert.equal(summary.decision, 'release-blocked')
  assert.equal(summary.g2MigrationAdvisorCloseout.status, 'artifacts-present-but-governance-blocked')
  assert.equal(summary.g2MigrationAdvisorCloseout.advisorPreflightSummary.status, 'ready')
  assert.equal(summary.g2MigrationAdvisorCloseout.advisorPreflightSummary.readyToRun, true)
  assert.equal(summary.g2MigrationAdvisorCloseout.advisorPreflightSummary.resolvedTokenEnv, 'SUPABASE_MANAGEMENT_API_TOKEN')
  assert.equal(summary.g2MigrationAdvisorCloseout.governanceReportSummary.status, 'ready_for_closeout_readback')
  assert.equal(summary.g2MigrationAdvisorCloseout.governanceReportSummary.mg07Status, 'blocked')
  assert.deepEqual(summary.g2MigrationAdvisorCloseout.governanceReportSummary.mg07ReasonCodes, ['live_advisor_rescan_missing'])
  assert.equal(summary.g2MigrationAdvisorCloseout.governanceReportSummary.allowWarmup, false)
  assert.equal(summary.g2MigrationAdvisorCloseout.governanceReportSummary.allowScheduler, false)
  const g2Blocker = summary.blockers.find((blocker) => blocker.gate === 'G2')
  assert.equal(g2Blocker?.severity, 'P0')
  assert.match(g2Blocker?.reason ?? '', /G2 is blocked by current migration governance evidence/)
  assert.match(g2Blocker?.reason ?? '', /Advisor Management API preflight=ready; readyToRun=true; blockerCodes=none/)
  assert.match(g2Blocker?.reason ?? '', /governance report=ready_for_closeout_readback; MG-07=blocked; reasonCodes=live_advisor_rescan_missing/)
  assert.match(g2Blocker?.requiredAction ?? '', /MG-07 passes/)
  assert.ok(summary.artifactIndex.includes('supabase-advisor-management-api-preflight.json'))
  assert.ok(summary.artifactIndex.includes('supabase-advisor-management-api-export.json'))
  assert.ok(summary.artifactIndex.includes('production-migration-governance-evidence.json'))
  assert.ok(summary.artifactIndex.includes('production-migration-governance-report.json'))
  assert.match(summaryMarkdown, /Governance report: ready_for_closeout_readback; MG-07=blocked; reasonCodes=live_advisor_rescan_missing/)
  assert.match(summaryMarkdown, /Advisor Management API preflight: ready; readyToRun=true; envFilePresent=true; tokenEnv=SUPABASE_MANAGEMENT_API_TOKEN; blockerCodes=none/)
  assert.match(summaryMarkdown, /supabase-advisor-management-api-preflight\.json/)
  assert.match(summaryMarkdown, /production-migration-governance-report\.json/)
  assert.match(summaryMarkdown, /Execution unlocks: allowValidate=true; allowWarmup=false; allowScheduler=false/)
})

test('refresh summary keeps G2 closed when formal Advisor export has performance findings but security is clean', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-g2-performance-boundary-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G2-migration-governance', gate: 'G2', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'supabase-advisor-management-api-export.json'), {
    schemaVersion: 'workbuddy-supabase-advisor-ui-or-api-export/v1',
    source: 'management_api',
    environment: 'production',
    projectRef: 'wwdrkjnbvcbfytwnnyvs',
    exportedAt: '2026-07-04T14:55:00.977Z',
    securityIssueCount: 0,
    performanceIssueCount: 1136,
  })
  writeJson(path.join(releaseDir, 'production-migration-governance-evidence.json'), {
    inventoryFrozen: true,
  })
  writeJson(path.join(releaseDir, 'production-migration-governance-report.json'), {
    gate: 'production-migration-governance',
    status: 'closed',
    gates: [
      { id: 'MG-01', status: 'pass', reasonCodes: [] },
      { id: 'MG-02', status: 'pass', reasonCodes: [] },
      { id: 'MG-03', status: 'pass', reasonCodes: [] },
      { id: 'MG-04', status: 'pass', reasonCodes: [] },
      { id: 'MG-05', status: 'pass', reasonCodes: [] },
      { id: 'MG-06', status: 'pass', reasonCodes: [] },
      { id: 'MG-07', status: 'pass', reasonCodes: [] },
    ],
    allowValidate: true,
    allowWarmup: true,
    allowScheduler: true,
  })
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')

  assert.equal(summary.g2MigrationAdvisorCloseout.status, 'closed')
  assert.equal(summary.g2MigrationAdvisorCloseout.governanceReportSummary.status, 'closed')
  assert.equal(summary.g2MigrationAdvisorCloseout.governanceReportSummary.mg07Status, 'pass')
  assert.equal(summary.g2MigrationAdvisorCloseout.governanceReportSummary.allowWarmup, true)
  assert.equal(summary.g2MigrationAdvisorCloseout.governanceReportSummary.allowScheduler, true)
  assert.equal(summary.g2MigrationAdvisorCloseout.advisorExportSummary.securityIssueCount, 0)
  assert.equal(summary.g2MigrationAdvisorCloseout.advisorExportSummary.performanceIssueCount, 1136)
  assert.equal(summary.blockers.some((blocker) => blocker.gate === 'G2'), false)
  assert.equal(
    summary.g2MigrationAdvisorCloseout.releaseGateUse,
    'G2 is closed for this release directory: current-run Advisor export, migration governance evidence, and governance report are present and MG-07 passed.',
  )
  assert.equal(summary.g2MigrationAdvisorCloseout.requiredCommandsStatus, 'satisfied')
  assert.match(summaryMarkdown, /Advisor export: source=management_api; environment=production; projectRef=wwdrkjnbvcbfytwnnyvs; securityIssueCount=0; performanceIssueCount=1136/)
  assert.match(summaryMarkdown, /Execution unlocks: allowValidate=true; allowWarmup=true; allowScheduler=true/)
  assert.match(summaryMarkdown, /Required commands: satisfied in this release directory; no G2 commands are listed under Must Rerun\./)
  assert.doesNotMatch(summaryMarkdown, /G2 remains blocked until/)
  assert.match(
    summary.g2MigrationAdvisorCloseout.nonSubstitutableEvidence.join('\n'),
    /Advisor performance issue counts are tracked under PB-08\/G6 performance governance/,
  )
})

test('refresh summary reopens stale G2 command blocker when formal Advisor closeout is current', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-g2-stale-command-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G2-migration-governance', gate: 'G2', status: 'blocked', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G5-live-closeout', gate: 'G5', status: 'deferred', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'supabase-advisor-management-api-preflight.json'), {
    schemaVersion: 'workbuddy-supabase-advisor-management-api-preflight/v1',
    status: 'blocked',
    readyToRun: false,
    blockerCodes: ['management-api-token-missing'],
  })
  writeJson(path.join(releaseDir, 'supabase-advisor-management-api-export.json'), {
    schemaVersion: 'workbuddy-supabase-advisor-ui-or-api-export/v1',
    source: 'management_api',
    environment: 'production',
    projectRef: 'wwdrkjnbvcbfytwnnyvs',
    securityIssueCount: 0,
    performanceIssueCount: 1136,
  })
  writeJson(path.join(releaseDir, 'production-migration-governance-evidence.json'), {
    inventoryFrozen: true,
  })
  writeJson(path.join(releaseDir, 'production-migration-governance-report.json'), {
    gate: 'production-migration-governance',
    status: 'closed',
    gates: [
      { id: 'MG-01', status: 'pass', reasonCodes: [] },
      { id: 'MG-02', status: 'pass', reasonCodes: [] },
      { id: 'MG-03', status: 'pass', reasonCodes: [] },
      { id: 'MG-04', status: 'pass', reasonCodes: [] },
      { id: 'MG-05', status: 'pass', reasonCodes: [] },
      { id: 'MG-06', status: 'pass', reasonCodes: [] },
      { id: 'MG-07', status: 'pass', reasonCodes: [] },
    ],
    allowValidate: true,
    allowWarmup: true,
    allowScheduler: true,
  })
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-blocked',
    gates: { G0: 'pass', G1: 'pass', G2: 'blocked', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [
      { gate: 'G2', severity: 'P0', reason: 'stale G2 blocker', requiredAction: 'rerun stale G2 preflight' },
      { gate: 'G5', severity: 'P1', reason: 'live closeout deferred', requiredAction: 'finish live closeout' },
    ],
    productionGapMatrix: {
      'GAP-P0-02': {
        severity: 'P0',
        status: 'blocked',
        gate: 'G2',
        evidence: [],
        decisionImpact: 'release-blocked',
      },
    },
    productionBaselineMatrix: {
      'PB-02': {
        status: 'needs-gating',
        mappedGates: ['G2'],
        currentEvidence: [],
        blockers: ['Migration governance closeout is still blocked by live Advisor rescan/export missing.'],
      },
      'PB-08': {
        status: 'needs-gating',
        mappedGates: ['G6'],
        currentEvidence: [],
        blockers: [],
      },
    },
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [
      'npm run evidence:supabase-advisor:management-api-preflight -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-management-api-preflight.json --advisor-output <artifact-root>/supabase-advisor-management-api-export.json --operator release-dashboard-db-profile',
      'npm run evidence:supabase-advisor:management-api -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-management-api-export.json --operator release-dashboard-db-profile',
      'npm run evidence:supabase-advisor:dashboard-ui-template -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-dashboard-ui-capture.template.json --operator release-dashboard-db-profile',
      'npm run evidence:supabase-advisor:dashboard-ui-normalize -- --input <operator-captured-dashboard-advisor-json> --output <artifact-root>/supabase-advisor-management-api-export.json --project-ref <project-ref> --dashboard-url <supabase-dashboard-project-advisor-url> --operator release-dashboard-db-profile',
      'npm run migrate:production-governance:evidence --workspace=server -- --output-file <artifact-root-from-server>/production-migration-governance-evidence.json --operator release-dashboard-db-profile --advisor-export-file <artifact-root-from-server>/supabase-advisor-management-api-export.json',
      'npm run migrate:production-governance --workspace=server -- --evidence-file <artifact-root-from-server>/production-migration-governance-evidence.json',
      'node project-testing/tools/generate-release-handoff-pack.mjs --target real-closeout --output-root <release-report-parent>',
    ],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-blocked',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))

  assert.equal(summary.g2MigrationAdvisorCloseout.status, 'closed')
  assert.equal(summary.gateSummary.G2, 'pass')
  assert.equal(decision.gates.G2, 'pass')
  assert.equal(summary.blockers.some((blocker) => blocker.gate === 'G2'), false)
  assert.equal(decision.productionGapMatrix['GAP-P0-02'].status, 'pass')
  assert.equal(decision.productionGapMatrix['GAP-P0-02'].decisionImpact, 'none')
  assert.equal(decision.productionBaselineMatrix['PB-02'].status, 'needs-gating')
  assert.match(decision.productionBaselineMatrix['PB-02'].blockers.join('\n'), /Current migration governance closeout is closed/)
  assert.equal(
    summary.mustRerunBeforeProduction.some((command) => command.includes('supabase-advisor')),
    false,
  )
  assert.equal(
    summary.mustRerunBeforeProduction.some((command) => command.includes('migrate:production-governance')),
    false,
  )
  assert.ok(
    summary.mustRerunBeforeProduction.some((command) =>
      command.includes('generate-release-handoff-pack.mjs --target real-closeout'),
    ),
  )
})

test('refresh summary closes stale G5 deferred command when current live DB closeout validators pass', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-g5-current-closeout-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G1-tests', gate: 'G1', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G2-migration-governance', gate: 'G2', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G3-auth-rls', gate: 'G3', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G4-browser-uiux', gate: 'G4', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G5-live-closeout', gate: 'G5', status: 'deferred', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G6-pressure-query-log', gate: 'G6', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G7-security', gate: 'G7', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G8-decision', gate: 'G8', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'handoff-plan.json'), {
    schemaVersion: 'workbuddy-release-handoff-plan/v1',
  })
  writeJson(path.join(releaseDir, 'handoff-readiness.json'), {
    schemaVersion: 'workbuddy-release-handoff-readiness/v1',
    status: 'pass',
    readyToRun: true,
    gateCount: 4,
    readyGateCount: 4,
    blockedGateCount: 0,
    secretLeakCount: 0,
    refIssueCount: 0,
    gates: [
      {
        id: 'c18-l07-l15-live-diagnostics',
        readyToRun: true,
        missingFlags: [],
        missingFields: [],
        missingRecommendedFields: [],
        placeholderFields: [],
        blockingIssues: [],
      },
      {
        id: 'c15-live-learning-closeout',
        readyToRun: true,
        missingFlags: [],
        missingFields: [],
        missingRecommendedFields: [],
        placeholderFields: [],
        blockingIssues: [],
      },
      {
        id: 'c19-runtime-publication-release-rollback',
        readyToRun: true,
        missingFlags: [],
        missingFields: [],
        missingRecommendedFields: [],
        placeholderFields: [],
        blockingIssues: [],
      },
      {
        id: 'old-object-physical-drop-closeout',
        readyToRun: true,
        missingFlags: [],
        missingFields: [],
        missingRecommendedFields: [],
        placeholderFields: [],
        blockingIssues: [],
      },
    ],
  })

  for (const artifact of [
    'c18-l07-l15-live-diagnostics-evidence-validation.json',
    'c15-live-learning-closeout-evidence-validation.json',
    'c19-runtime-publication-release-rollback-evidence-validation.json',
    'old-object-physical-drop-closeout-evidence-validation.json',
  ]) {
    writeJson(path.join(releaseDir, artifact), { status: 'pass' })
  }

  writeJson(path.join(releaseDir, 'closeout-decision.json'), {
    schemaVersion: 'workbuddy-release-closeout-decision/v1',
    decisionScope: 'live-db-closeout-gates',
    decisionAuthority: {
      level: 'closeout',
      authoritativeForCloseout: true,
      authoritativeForRelease: false,
      authoritativeForProduction: false,
      releaseDecisionArtifact: 'v1424-release-decision.json',
    },
    status: 'pass',
    mayCloseAll: true,
    openGateCount: 0,
  })
  writeJson(path.join(releaseDir, 'closeout-status-index.json'), {
    schemaVersion: 'workbuddy-release-closeout-status-index/v1',
    status: 'closeout-ready',
    mayCloseAll: true,
  })

  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass-with-explicit-gates',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [
      { gate: 'G5', severity: 'P1', reason: 'stale G5 live closeout deferred', requiredAction: 'rerun stale G5 validation' },
    ],
    productionGapMatrix: {
      'GAP-P0-07': {
        severity: 'P0',
        status: 'deferred',
        gate: 'G5',
        evidence: [],
        decisionImpact: 'release-blocked',
      },
      'GAP-P1-04': {
        severity: 'P1',
        status: 'explicit-gate',
        gate: 'G5',
        evidence: [],
        decisionImpact: 'explicit-gate',
      },
      'GAP-P1-03': {
        severity: 'P1',
        status: 'blocked',
        gate: 'G1',
        evidence: ['default-master-plan-readiness.json'],
        decisionImpact: 'release-blocked',
      },
    },
    productionBaselineMatrix: {
      'PB-11': {
        status: 'needs-gating',
        currentEvidence: [],
        blockers: ['The local static server full Vitest rerun is current and passed; PB-11 still cannot close while G2/G5 release gates remain open.'],
        decisionImpact: 'release-blocked-until-all-hard-gates-complete',
      },
    },
    downgradedCapabilities: ['Runtime publication and live closeout remain explicit gates until handoff and rollback evidence exist.'],
    mustRerunBeforeProduction: [
      'Live handoff and rollback evidence for G5',
      'node project-testing/tools/generate-release-handoff-pack.mjs --target real-closeout --output-root <release-report-parent>',
      'node project-testing/tools/check-release-handoff-readiness.mjs --handoff-file <handoff.json> --output <release-report-dir>/handoff-readiness.json',
      'node project-testing/tools/validate-release-evidence.mjs --gate c18-l07-l15-live-diagnostics --evidence-root <release-report-dir> --output <release-report-dir>/c18-l07-l15-live-diagnostics-evidence-validation.json',
      'node project-testing/tools/validate-release-evidence.mjs --gate c15-live-learning-closeout --evidence-root <release-report-dir> --output <release-report-dir>/c15-live-learning-closeout-evidence-validation.json',
      'node project-testing/tools/validate-release-evidence.mjs --gate c19-runtime-publication-release-rollback --evidence-root <release-report-dir> --output <release-report-dir>/c19-runtime-publication-release-rollback-evidence-validation.json',
      'node project-testing/tools/validate-release-evidence.mjs --gate old-object-physical-drop-closeout --evidence-root <release-report-dir> --output <release-report-dir>/old-object-physical-drop-closeout-evidence-validation.json',
    ],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass-with-explicit-gates',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))
  const closeoutDecision = readJson(path.join(releaseDir, 'closeout-decision.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')

  assert.equal(summary.g5LiveCloseoutContract.status, 'current-release-live-closeout-ready')
  assert.equal(summary.g5LiveCloseoutContract.releaseGateUse, 'G5 is closed for this release directory: handoff readiness passed and every listed live/DB closeout validator passed.')
  assert.equal(summary.gateSummary.G5, 'pass')
  assert.equal(decision.gates.G5, 'pass')
  assert.equal(summary.blockers.some((blocker) => blocker.gate === 'G5'), false)
  assert.equal(decision.openBlockers.some((blocker) => blocker.gate === 'G5'), false)
  assert.equal(summary.explicitGateSummary.deferredGates.includes('G5'), false)
  assert.equal(decision.productionGapMatrix['GAP-P0-07'].status, 'pass')
  assert.equal(decision.productionGapMatrix['GAP-P0-07'].decisionImpact, 'none')
  assert.equal(decision.productionGapMatrix['GAP-P1-04'].status, 'pass')
  assert.equal(decision.productionGapMatrix['GAP-P1-04'].decisionImpact, 'none')
  assert.equal(decision.decision, 'release-blocked')
  assert.equal(summary.decision, 'release-blocked')
  assert.equal(decision.decisionScope, 'full-release')
  assert.equal(decision.decisionAuthority.authoritativeForRelease, true)
  assert.equal(decision.decisionAuthority.authoritativeForProduction, false)
  assert.equal(summary.decisionAuthority.authoritativeForRelease, false)
  assert.equal(summary.decisionAuthority.sourceArtifact, 'v1424-release-decision.json')
  assert.deepEqual(decision.decisionHierarchy.closeout, {
    artifact: 'closeout-decision.json',
    status: 'pass',
    mayCloseAll: true,
    authoritativeForRelease: false,
  })
  assert.equal(decision.decisionHierarchy.release.status, 'release-blocked')
  assert.equal(decision.decisionHierarchy.release.authoritativeForRelease, true)
  assert.equal(decision.decisionHierarchy.production.status, 'not-claimed-by-release-artifacts')
  assert.equal(
    [closeoutDecision, summary, decision]
      .filter((artifact) => artifact.decisionAuthority?.authoritativeForRelease === true)
      .length,
    1,
  )
  assert.equal(summary.mustRerunBeforeProduction.some((command) => command.includes('generate-release-handoff-pack.mjs --target real-closeout')), false)
  assert.equal(summary.mustRerunBeforeProduction.some((command) => command.includes('check-release-handoff-readiness.mjs')), false)
  assert.equal(summary.mustRerunBeforeProduction.some((command) => command.includes('--gate c15-live-learning-closeout')), false)
  assert.equal(summary.mustRerunBeforeProduction.some((command) => command.includes('--gate c19-runtime-publication-release-rollback')), false)
  assert.equal(summary.mustRerunBeforeProduction.includes('Live handoff and rollback evidence for G5'), false)
  assert.match(summaryMarkdown, /G5 is closed for this release directory/)
  assert.doesNotMatch(summaryMarkdown, /G5 remains deferred/)
})

test('refresh summary records Dashboard UI browser sign-in fallback as non-pass evidence', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-g2-dashboard-login-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G2-migration-governance', gate: 'G2', status: 'blocked', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'supabase-advisor-management-api-preflight.json'), {
    schemaVersion: 'workbuddy-supabase-advisor-management-api-preflight/v1',
    status: 'blocked',
    readyToRun: false,
    envFilePresent: true,
    projectRef: 'xemqmqpifsstkovbkatp',
    resolvedTokenEnv: null,
    blockers: [{ code: 'management-api-token-missing' }],
    requiredExportArtifact: 'project-testing/reports/test/supabase-advisor-management-api-export.json',
  })
  writeJson(path.join(releaseDir, 'supabase-advisor-dashboard-ui-capture.template.json'), {
    schemaVersion: 'manual-supabase-advisor-dashboard-capture/v1',
    templateOnly: true,
    projectRef: 'xemqmqpifsstkovbkatp',
    dashboardUrl: 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/security',
    manualChecklist: [{ id: 'SECURITY_ADVISOR_CURRENT' }],
    normalizeCommand: 'npm run evidence:supabase-advisor:dashboard-ui-normalize -- --input project-testing/reports/test/supabase-advisor-dashboard-ui-capture.filled.json',
  })
  writeJson(path.join(releaseDir, 'supabase-advisor-dashboard-ui-browser-attempt.json'), {
    schemaVersion: 'workbuddy-supabase-advisor-dashboard-ui-browser-attempt/v1',
    status: 'blocked',
    source: 'chrome_browser_read_only',
    attemptedAt: '2026-07-04T00:00:00.000Z',
    projectRef: 'xemqmqpifsstkovbkatp',
    blockedBy: ['supabase-sign-in-required'],
    pages: [
      {
        section: 'security',
        currentUrl: 'https://supabase.com/dashboard/sign-in?returnTo=%2Fproject%2Fxemqmqpifsstkovbkatp%2Fadvisors%2Fsecurity',
        isLogin: true,
        issueCountCaptured: false,
      },
      {
        section: 'performance',
        currentUrl: 'https://supabase.com/dashboard/sign-in?returnTo=%2Fproject%2Fxemqmqpifsstkovbkatp%2Fadvisors%2Fperformance',
        isLogin: true,
        issueCountCaptured: false,
      },
    ],
  })
  writeJson(path.join(releaseDir, 'production-migration-governance-evidence.json'), {
    inventoryFrozen: true,
  })
  writeJson(path.join(releaseDir, 'production-migration-governance-report.json'), {
    gate: 'production-migration-governance',
    status: 'ready_for_closeout_readback',
    gates: [
      { id: 'MG-01', status: 'pass', reasonCodes: [] },
      { id: 'MG-02', status: 'pass', reasonCodes: [] },
      { id: 'MG-03', status: 'pass', reasonCodes: [] },
      { id: 'MG-04', status: 'pass', reasonCodes: [] },
      { id: 'MG-05', status: 'pass', reasonCodes: [] },
      { id: 'MG-06', status: 'pass', reasonCodes: [] },
      { id: 'MG-07', status: 'blocked', reasonCodes: ['live_advisor_rescan_missing'] },
    ],
    allowValidate: true,
    allowWarmup: false,
    allowScheduler: false,
  })
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'blocked', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')
  const g2Blocker = summary.blockers.find((blocker) => blocker.gate === 'G2')

  assert.equal(summary.decision, 'release-blocked')
  assert.equal(summary.g2MigrationAdvisorCloseout.status, 'missing-required-artifacts')
  assert.equal(summary.g2MigrationAdvisorCloseout.artifactPresence['supabase-advisor-dashboard-ui-capture.template.json'], true)
  assert.equal(summary.g2MigrationAdvisorCloseout.artifactPresence['supabase-advisor-dashboard-ui-capture.filled.json'], false)
  assert.equal(summary.g2MigrationAdvisorCloseout.artifactPresence['supabase-advisor-dashboard-ui-browser-attempt.json'], true)
  assert.equal(summary.g2MigrationAdvisorCloseout.dashboardUiFallbackSummary.template.present, true)
  assert.equal(summary.g2MigrationAdvisorCloseout.dashboardUiFallbackSummary.template.hasManualChecklist, true)
  assert.equal(summary.g2MigrationAdvisorCloseout.dashboardUiFallbackSummary.filledCapturePresent, false)
  assert.equal(summary.g2MigrationAdvisorCloseout.dashboardUiFallbackSummary.browserAttempt.status, 'blocked')
  assert.deepEqual(summary.g2MigrationAdvisorCloseout.dashboardUiFallbackSummary.browserAttempt.blockedBy, ['supabase-sign-in-required'])
  assert.equal(summary.g2MigrationAdvisorCloseout.dashboardUiFallbackSummary.browserAttempt.pages[0].isLogin, true)
  assert.equal(summary.g2MigrationAdvisorCloseout.dashboardUiFallbackSummary.browserAttempt.pages[0].issueCountCaptured, false)
  assert.match(g2Blocker?.reason ?? '', /Dashboard UI fallback attempt=blocked; blockedBy=supabase-sign-in-required/)
  assert.match(g2Blocker?.requiredAction ?? '', /sign in to Supabase in the controllable browser/)
  assert.ok(summary.artifactIndex.includes('supabase-advisor-dashboard-ui-capture.template.json'))
  assert.ok(summary.artifactIndex.includes('supabase-advisor-dashboard-ui-browser-attempt.json'))
  assert.match(summaryMarkdown, /Dashboard UI fallback template: present; templateOnly=true; hasManualChecklist=true/)
  assert.match(summaryMarkdown, /Dashboard UI filled capture: missing/)
  assert.match(summaryMarkdown, /Dashboard UI browser attempt: blocked; blockedBy=supabase-sign-in-required/)
  assert.match(summaryMarkdown, /security: login-required; issueCountCaptured=false/)
  assert.match(
    summary.g2MigrationAdvisorCloseout.nonSubstitutableEvidence.join('\n'),
    /cannot replace filled Dashboard counts/,
  )
})

test('refresh summary carries false-green review-required audit into explicit gates', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-false-green-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G8-release-decision', gate: 'G8', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])

  writeJson(path.join(releaseDir, 'v1424-false-green-audit.json'), {
    schemaVersion: 'workbuddy/v1424-false-green-audit/v1',
    summary: {
      status: 'review-required',
      findingCount: 2,
      bySeverity: {
        'suspect-fake-green': 1,
        'supporting-only': 1,
      },
      byClassification: {
        'hard-gate-review-required': 1,
        'supporting-only-not-pass-evidence': 1,
      },
      byRule: [
        { ruleId: 'FG-01-SKIP-ONLY', severity: 'suspect-fake-green', classification: 'hard-gate-review-required', findingCount: 1 },
        { ruleId: 'FG-03-MOCK-API', severity: 'supporting-only', classification: 'supporting-only-not-pass-evidence', findingCount: 1 },
      ],
      topFiles: [
        {
          file: 'server/src/__tests__/fake.test.ts',
          findingCount: 2,
          suspectFakeGreenCount: 1,
          supportingOnlyCount: 1,
          classificationCounts: {
            'hard-gate-review-required': 1,
            'supporting-only-not-pass-evidence': 1,
          },
        },
      ],
      reviewPriority: [
        { file: 'server/src/__tests__/fake.test.ts', findingCount: 2, priority: 'P0-review-suspect-fake-green', classification: 'hard-gate-review-required', reason: 'test priority' },
      ],
      classificationLegend: [
        {
          classification: 'hard-gate-review-required',
          severity: 'suspect-fake-green',
          releaseGateUse: 'review-required; cannot close any release gate until manually reviewed and mapped to real production-branch/live evidence',
        },
        {
          classification: 'supporting-only-not-pass-evidence',
          severity: 'supporting-only',
          releaseGateUse: 'supporting-only; cannot close P0/P1 gate without production-branch/live evidence',
        },
      ],
    },
    findings: [
      { severity: 'suspect-fake-green', classification: 'hard-gate-review-required', ruleId: 'FG-01-SKIP-ONLY' },
      { severity: 'supporting-only', classification: 'supporting-only-not-pass-evidence', ruleId: 'FG-03-MOCK-API' },
    ],
  })

  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {
      'PB-11': {
        status: 'needs-gating',
        currentEvidence: [],
        blockers: [
          'G8 false-green audit requires review before unconditional release-pass: 99 findings (98 suspect-fake-green, 1 supporting-only).',
        ],
      },
    },
    downgradedCapabilities: [
      'G8 false-green audit requires review before unconditional release-pass: 99 findings (98 suspect-fake-green, 1 supporting-only).',
    ],
    mustRerunBeforeProduction: [],
  })

  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')

  assert.equal(decision.decision, 'release-pass-with-explicit-gates')
  assert.equal(summary.decision, 'release-pass-with-explicit-gates')
  assert.ok(
    decision.downgradedCapabilities.some((item) =>
      item.includes('G8 false-green audit requires review before unconditional release-pass: 2 findings'),
    ),
  )
  assert.equal(
    decision.downgradedCapabilities.some((item) =>
      item.includes('99 findings'),
    ),
    false,
  )
  assert.ok(
    decision.mustRerunBeforeProduction.some((item) =>
      item.includes('Review v1424-false-green-audit.json'),
    ),
  )
  assert.ok(decision.productionBaselineMatrix['PB-11'].currentEvidence.includes('v1424-false-green-audit.json'))
  assert.ok(decision.productionBaselineMatrix['PB-11'].blockers[0].includes('G8 false-green audit requires review'))
  assert.equal(
    decision.productionBaselineMatrix['PB-11'].blockers.some((item) => item.includes('99 findings')),
    false,
  )
  assert.equal(summary.explicitGateSummary.status, 'explicit-gates-present')
  assert.equal(decision.falseGreenReviewSummary.status, 'review-required')
  assert.equal(decision.falseGreenReviewSummary.findingCount, 2)
  assert.deepEqual(decision.falseGreenReviewSummary.bySeverity, {
    'suspect-fake-green': 1,
    'supporting-only': 1,
  })
  assert.deepEqual(decision.falseGreenReviewSummary.byClassification, {
    'hard-gate-review-required': 1,
    'supporting-only-not-pass-evidence': 1,
  })
  assert.equal(decision.falseGreenReviewSummary.reviewPriority[0].file, 'server/src/__tests__/fake.test.ts')
  assert.equal(decision.falseGreenReviewSummary.reviewPriority[0].classification, 'hard-gate-review-required')
  assert.equal(summary.falseGreenReviewSummary.reviewPriority[0].priority, 'P0-review-suspect-fake-green')
  assert.equal(summary.falseGreenReviewSummary.reviewPriority[0].classification, 'hard-gate-review-required')
  assert.match(summaryMarkdown, /## False-Green Review/)
  assert.match(summaryMarkdown, /hard-gate-review-required: 1/)
  assert.match(summaryMarkdown, /P0-review-suspect-fake-green: server\/src\/__tests__\/fake\.test\.ts \(2 findings; classification=hard-gate-review-required\)/)
})

test('refresh summary removes G8 explicit gate when false-green review proves findings were not gate-closing evidence', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-false-green-reviewed-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G1-tests', gate: 'G1', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G2-db', gate: 'G2', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G3-auth', gate: 'G3', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G4-browser', gate: 'G4', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G5-live', gate: 'G5', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G6-pressure', gate: 'G6', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G7-security', gate: 'G7', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G8-decision', gate: 'G8', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])

  writeJson(path.join(releaseDir, 'v1424-false-green-audit.json'), {
    schemaVersion: 'workbuddy/v1424-false-green-audit/v1',
    summary: {
      status: 'review-required',
      findingCount: 2,
      bySeverity: { 'suspect-fake-green': 1, 'supporting-only': 1 },
      byClassification: {
        'hard-gate-review-required': 1,
        'supporting-only-not-pass-evidence': 1,
      },
      byRule: [
        { ruleId: 'FG-01-SKIP-ONLY', severity: 'suspect-fake-green', classification: 'hard-gate-review-required', findingCount: 1 },
        { ruleId: 'FG-03-MOCK-API', severity: 'supporting-only', classification: 'supporting-only-not-pass-evidence', findingCount: 1 },
      ],
      topFiles: [],
      reviewPriority: [],
      classificationLegend: [],
    },
    findings: [
      {
        file: 'server/src/__tests__/fake.test.ts',
        line: 10,
        severity: 'suspect-fake-green',
        classification: 'hard-gate-review-required',
        ruleId: 'FG-01-SKIP-ONLY',
      },
      {
        file: 'scripts/verify-mock-browser.mjs',
        line: 20,
        severity: 'supporting-only',
        classification: 'supporting-only-not-pass-evidence',
        ruleId: 'FG-03-MOCK-API',
      },
    ],
  })

  writeJson(path.join(releaseDir, 'v1424-false-green-review.json'), {
    schemaVersion: 'workbuddy/v1424-false-green-review/v1',
    status: 'reviewed-not-gate-closing',
    auditArtifact: 'v1424-false-green-audit.json',
    reviewedAt: '2026-07-05T00:00:00.000Z',
    reviewer: 'release-summary-refresh-test',
    auditSummary: {
      findingCount: 2,
      suspectFakeGreenCount: 1,
      supportingOnlyCount: 1,
    },
    decision: {
      removeExplicitG8Gate: true,
      productionGateUse: 'not-used-to-close-hard-gates',
      releasePassAllowed: true,
    },
    suspectFindings: [
      {
        file: 'server/src/__tests__/fake.test.ts',
        line: 10,
        ruleId: 'FG-01-SKIP-ONLY',
        disposition: 'not-gate-closing',
        reviewedEvidence: ['v1424-command-results.normalized.json'],
        hardGateClosedBy: [],
      },
    ],
    supportingOnlyDisposition: {
      disposition: 'supporting-only-not-gate-closing',
      reviewedFindingCount: 1,
      ruleIds: ['FG-03-MOCK-API'],
    },
    blockers: [],
  })

  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass-with-explicit-gates',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {
      'PB-11': {
        status: 'needs-gating',
        currentEvidence: ['v1424-false-green-audit.json'],
        blockers: ['G8 false-green audit requires review before unconditional release-pass: 2 findings (1 suspect-fake-green, 1 supporting-only).'],
        decisionImpact: 'release-blocked-until-all-hard-gates-complete',
      },
    },
    downgradedCapabilities: [
      'G8 false-green audit requires review before unconditional release-pass: 2 findings (1 suspect-fake-green, 1 supporting-only).',
    ],
    mustRerunBeforeProduction: [
      'Review v1424-false-green-audit.json and prove suspect/supporting-only tests are not used to close production gates',
    ],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass-with-explicit-gates',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')

  assert.equal(decision.decision, 'release-pass')
  assert.equal(summary.decision, 'release-pass')
  assert.equal(summary.explicitGateSummary.status, 'none')
  assert.equal(summary.falseGreenReviewSummary.status, 'reviewed-not-gate-closing')
  assert.equal(summary.falseGreenReviewSummary.reviewArtifact, 'v1424-false-green-review.json')
  assert.equal(summary.falseGreenReviewSummary.reviewDecision.removeExplicitG8Gate, true)
  assert.equal(summary.downgradedCapabilities.some((item) => item.includes('G8 false-green audit requires review')), false)
  assert.deepEqual(summary.downgradedCapabilities, [])
  assert.equal(summary.mustRerunBeforeProduction.some((item) => item.includes('Review v1424-false-green-audit.json')), false)
  assert.ok(decision.productionBaselineMatrix['PB-11'].currentEvidence.includes('v1424-false-green-review.json'))
  assert.equal(decision.productionBaselineMatrix['PB-11'].status, 'pass')
  assert.equal(decision.productionBaselineMatrix['PB-11'].blockers.some((item) => item.includes('G8 false-green audit requires review')), false)
  assert.equal(decision.productionBaselineMatrix['PB-11'].decisionImpact, 'none')
  assert.match(summaryMarkdown, /Status: reviewed-not-gate-closing/)
  assert.match(summaryMarkdown, /Review artifact: v1424-false-green-review\.json/)
})

test('v1.4.24 plan documents explicit gate summary decision contract', () => {
  const plan = readFileSync(path.join(repoRoot, 'docs/plans/v1.4.24上线验收测试方案.md'), 'utf8')

  assert.match(plan, /"explicitGateSummary"/)
  assert.match(plan, /"status": "none \| explicit-gates-present"/)
  assert.match(plan, /deferred gate/)
  assert.match(plan, /blocked \/ fail \/ deferred/)
  assert.match(plan, /v1424-false-green-audit\.json/)
  assert.match(plan, /最终不得为无条件 `release-pass`/)
  assert.match(plan, /explicitGateSummary\.status=none/)
})

test('refresh summary treats production matrix explicit gates as explicit release gates', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-matrix-explicit-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G1-tests', gate: 'G1', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G2-migration', gate: 'G2', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G3-api', gate: 'G3', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G4-browser', gate: 'G4', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G5-live', gate: 'G5', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G6-pressure', gate: 'G6', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G7-security', gate: 'G7', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G8-decision', gate: 'G8', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {
      'GAP-P1-03': {
        severity: 'P1',
        status: 'explicit-gate',
        gate: 'G8',
        evidence: ['project-testing/reports/default-master-plan-production-readiness/readiness.json'],
        decisionImpact: 'explicit-gate',
      },
    },
    productionBaselineMatrix: {
      'PB-03': {
        status: 'explicit-gate',
        mappedGates: ['G7', 'G8'],
        currentEvidence: ['enterprise-readiness-gates.json'],
        blockers: ['Secret rotation remains an enterprise delivery gate.'],
        decisionImpact: 'explicit-gate',
      },
    },
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  writeCaseDensityArtifacts(releaseDir)
  writeJson(path.join(releaseDir, 'v1424-false-green-audit.json'), {
    summary: { status: 'no-suspect-pattern-found', findingCount: 0 },
    findings: [],
  })
  writeFileSync(path.join(releaseDir, 'v1424-test-case-ledger.md'), '# ledger\n', 'utf8')

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')

  assert.equal(decision.decision, 'release-pass-with-explicit-gates')
  assert.equal(summary.decision, 'release-pass-with-explicit-gates')
  assert.equal(summary.explicitGateSummary.status, 'explicit-gates-present')
  assert.deepEqual(
    summary.explicitGateSummary.matrixExplicitGates.map((gate) => `${gate.source}.${gate.id}`),
    ['productionGapMatrix.GAP-P1-03', 'productionBaselineMatrix.PB-03'],
  )
  assert.match(summaryMarkdown, /productionGapMatrix\.GAP-P1-03/)
  assert.match(summaryMarkdown, /productionBaselineMatrix\.PB-03/)
})

test('refresh summary blocks release when production gap matrix still has release-blocked impact', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-matrix-blocked-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { id: 'G0-source', gate: 'G0', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G1-tests', gate: 'G1', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G2-migration', gate: 'G2', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G3-api', gate: 'G3', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G4-browser', gate: 'G4', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G5-live', gate: 'G5', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G6-pressure', gate: 'G6', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G7-security', gate: 'G7', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
    { id: 'G8-decision', gate: 'G8', status: 'pass', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    generatedAt: '2026-07-04T00:00:00.000Z',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-pass',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {
      'GAP-P1-03': {
        severity: 'P1',
        status: 'blocked',
        gate: 'G8',
        evidence: ['project-testing/reports/default-master-plan-production-readiness/readiness.json'],
        decisionImpact: 'release-blocked',
      },
    },
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-pass',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  writeCaseDensityArtifacts(releaseDir)
  writeJson(path.join(releaseDir, 'v1424-false-green-audit.json'), {
    summary: { status: 'no-suspect-pattern-found', findingCount: 0 },
    findings: [],
  })
  writeFileSync(path.join(releaseDir, 'v1424-test-case-ledger.md'), '# ledger\n', 'utf8')

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const decision = readJson(path.join(releaseDir, 'v1424-release-decision.json'))

  assert.equal(decision.decision, 'release-blocked')
  assert.equal(summary.decision, 'release-blocked')
  assert.deepEqual(
    summary.matrixReleaseBlockers.map((blocker) => `${blocker.source}.${blocker.id}`),
    ['productionGapMatrix.GAP-P1-03'],
  )
})

test('refresh summary prefers runtime login repair execution over stale repair attempt', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-runtime-repair-execution-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { gate: 'G0', status: 'pass', command: 'g0', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G1', status: 'pass', command: 'g1', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G2', status: 'pass', command: 'g2', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G3', status: 'pass', command: 'g3', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G4', status: 'pass', command: 'g4', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G5', status: 'deferred', command: 'g5', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G6', status: 'pass', command: 'g6', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G7', status: 'pass', command: 'g7', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G8', status: 'pass', command: 'g8', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-blocked',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-blocked',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  writeCaseDensityArtifacts(releaseDir)
  writeFailingHandoffReadiness(releaseDir)
  writeHandoffSignalsWithCandidateMismatch(releaseDir)
  writeJson(path.join(releaseDir, 'handoff-plan.json'), { schemaVersion: 'workbuddy-release-handoff-plan/v1' })
  writeJson(path.join(releaseDir, 'runtime-login-role-repair-attempt.json'), {
    schemaVersion: 'workbuddy-v1424-runtime-login-role-repair-attempt/v1',
    status: 'blocked-by-privileged-database-connection',
    targetRole: 'workbuddy_runtime_login',
    attempts: [
      {
        method: 'stale-direct-postgres-5432',
        result: 'failed',
        failureCategory: 'migration_database_connection_timeout',
        safeErrorSummary: 'stale failure that must not drive the refreshed summary',
      },
    ],
  })
  writeJson(path.join(releaseDir, 'runtime-login-role-repair-execution.json'), {
    schemaVersion: 'workbuddy-v1424-runtime-login-repair-execution/v1',
    status: 'repaired',
    roleName: 'workbuddy_runtime_login',
    verifiedRuntimeConnection: false,
    nextAction: 'runtime_login_role_repair_completed_without_runtime_connection_verify',
    safeToShare: true,
    secretsPrinted: false,
    boundary: {
      environment: 'staging',
      dbMutation: true,
      liveMutation: true,
      writesApplicationData: false,
      writesRolePassword: true,
    },
    releaseImpact: [
      'This only repairs the staging runtime login role password and grants.',
      'It does not close G5 until runtime-login-role-readback and C18 L07 diagnostics pass.',
    ],
  })
  writeJson(path.join(releaseDir, 'runtime-login-role-readback.json'), {
    schemaVersion: 'workbuddy-v1424-runtime-login-role-readback/v1',
    status: 'pass',
    targetRole: 'workbuddy_runtime_login',
    runtimeGroupRole: 'workbuddy_runtime',
    sources: [],
    checks: {
      passwordAuth: { status: 'pass' },
    },
    structuralBlockers: [],
    passwordAuthBlockers: [],
    blockers: [],
    closesRuntimeLoginPrerequisite: true,
    boundary: { closesG5: false },
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const summaryMarkdown = readFileSync(path.join(releaseDir, 'summary.md'), 'utf8')
  const blocker = summary.blockers.find((item) => item.gate === 'G5')

  assert.equal(summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleRepairAttempt.status, 'repaired')
  assert.equal(summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleRepairAttempt.targetRole, 'workbuddy_runtime_login')
  assert.equal(summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleRepairAttempt.nextAction, 'runtime_login_role_repair_completed_without_runtime_connection_verify')
  assert.deepEqual(summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleRepairAttempt.attempts, [])
  assert.match(blocker?.reason ?? '', /runtime login repair=repaired/)
  assert.doesNotMatch(blocker?.reason ?? '', /stale-direct-postgres-5432/)
  assert.doesNotMatch(blocker?.reason ?? '', /stale failure/)
  assert.match(summaryMarkdown, /Runtime login repair attempt: repaired/)
  assert.match(summaryMarkdown, /Next action: runtime_login_role_repair_completed_without_runtime_connection_verify/)
  assert.ok(summary.artifactIndex.includes('runtime-login-role-repair-execution.json'))
})

test('refresh summary ignores guard-blocked runtime login repair execution as non-attempt', () => {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'v1424-refresh-runtime-repair-guard-'))

  writeJson(path.join(releaseDir, 'v1424-command-results.normalized.json'), [
    { gate: 'G0', status: 'pass', command: 'g0', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G1', status: 'pass', command: 'g1', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G2', status: 'pass', command: 'g2', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G3', status: 'pass', command: 'g3', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G4', status: 'pass', command: 'g4', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G5', status: 'deferred', command: 'g5', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G6', status: 'pass', command: 'g6', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G7', status: 'pass', command: 'g7', finishedAt: '2026-07-04T00:00:00.000Z' },
    { gate: 'G8', status: 'pass', command: 'g8', finishedAt: '2026-07-04T00:00:00.000Z' },
  ])
  writeJson(path.join(releaseDir, 'v1424-release-decision.json'), {
    schemaVersion: 'workbuddy-v1424-release-decision/v1',
    releaseDir,
    executionMode: 'controlled-launch',
    decision: 'release-blocked',
    gates: { G0: 'pass', G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'deferred', G6: 'pass', G7: 'pass', G8: 'pass' },
    openBlockers: [],
    productionGapMatrix: {},
    productionBaselineMatrix: {},
    downgradedCapabilities: [],
    mustRerunBeforeProduction: [],
  })
  writeJson(path.join(releaseDir, 'summary.json'), {
    decision: 'release-blocked',
    executionMode: 'controlled-launch',
    releaseDir,
    generatedAt: '2026-07-04T00:00:00.000Z',
    gateSummary: {},
    blockers: [],
    mustRerunBeforeProduction: [],
    relatedBlockedFacts: [],
  })
  writeCaseDensityArtifacts(releaseDir)
  writeFailingHandoffReadiness(releaseDir)
  writeHandoffSignalsWithCandidateMismatch(releaseDir)
  writeJson(path.join(releaseDir, 'handoff-plan.json'), { schemaVersion: 'workbuddy-release-handoff-plan/v1' })
  writeJson(path.join(releaseDir, 'runtime-login-role-repair-attempt.json'), {
    schemaVersion: 'workbuddy-v1424-runtime-login-role-repair-attempt/v1',
    status: 'blocked-by-privileged-database-connection',
    targetRole: 'workbuddy_runtime_login',
    attempts: [
      {
        method: 'direct-postgres-5432',
        result: 'failed',
        failureCategory: 'migration_database_connection_timeout',
        safeErrorSummary: 'real prior connectivity failure',
      },
    ],
  })
  writeJson(path.join(releaseDir, 'runtime-login-role-repair-execution.json'), {
    schemaVersion: 'workbuddy-v1424-runtime-login-repair-execution/v1',
    status: 'blocked',
    reasonCode: 'explicit_staging_write_confirmation_required',
    safeToShare: true,
    secretsPrinted: false,
    boundary: {
      environment: 'staging',
      dbMutation: false,
      liveMutation: false,
      writesApplicationData: false,
      writesRolePassword: false,
    },
  })

  const result = spawnSync(process.execPath, ['project-testing/tools/refresh-v1424-release-summary.mjs', '--release-dir', releaseDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = readJson(path.join(releaseDir, 'summary.json'))
  const blocker = summary.blockers.find((item) => item.gate === 'G5')

  assert.equal(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleRepairAttempt.status,
    'blocked-by-privileged-database-connection',
  )
  assert.equal(
    summary.g5LiveCloseoutContract.diagnosticSummaries.runtimeLoginRoleRepairAttempt.attempts[0].failureCategory,
    'migration_database_connection_timeout',
  )
  assert.match(blocker?.reason ?? '', /runtime login repair=blocked-by-privileged-database-connection/)
  assert.doesNotMatch(blocker?.reason ?? '', /explicit_staging_write_confirmation_required/)
  assert.ok(summary.artifactIndex.includes('runtime-login-role-repair-execution.json'))
})
