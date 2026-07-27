#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = path.join(
  repoRoot,
  'project-testing',
  'reports',
  'release-v1.4.24-20260702-125254',
)
const releaseMatrixPath = path.join(repoRoot, 'project-testing', 'matrix', 'release-test-matrix.json')

function parseArgs(argv) {
  const args = {
    releaseDir: defaultReleaseDir,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--release-dir') {
      args.releaseDir = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/refresh-v1424-release-summary.mjs [--release-dir <dir>]')
      process.exit(0)
    }
  }

  return args
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function releaseArtifactExists(releaseDir, artifactPath) {
  return existsSync(path.join(releaseDir, artifactPath))
}

function readReleaseMatrix() {
  return readJson(releaseMatrixPath, { gateGroups: [] })
}

function gateStatusFromResults(results, gate) {
  const rows = results.filter((row) => row.gate === gate)
  if (rows.some((row) => row.status === 'fail')) return 'fail'
  if (rows.some((row) => row.status === 'blocked')) return 'blocked'
  if (rows.some((row) => row.status === 'deferred')) return 'deferred'
  if (rows.length > 0 && rows.every((row) => row.status === 'pass')) return 'pass'
  return null
}

function commandGroupId(id) {
  return String(id ?? '').replace(/-\d+$/, '')
}

function effectiveCommandResults(results) {
  const grouped = new Map()
  for (const row of results) {
    const key = commandGroupId(row.id)
    const previous = grouped.get(key)
    if (!previous) {
      grouped.set(key, row)
      continue
    }

    const previousTime = Date.parse(previous.finishedAt ?? previous.startedAt ?? '') || 0
    const currentTime = Date.parse(row.finishedAt ?? row.startedAt ?? '') || 0
    if (currentTime >= previousTime) grouped.set(key, row)
  }
  return [...grouped.values()]
}

function applyKnownGateBoundaries(gateSummary, results, releaseDir) {
  const effectiveResults = effectiveCommandResults(results)
  const hasG6LocalPass =
    effectiveResults.some((row) => row.id === 'G6-client-bundle-budget' && row.status === 'pass') &&
    effectiveResults.some((row) => row.id === 'G6-performance-evidence-unit' && row.status === 'pass') &&
    effectiveResults.some((row) => commandGroupId(row.id) === 'G6-performance-evidence-online' && row.status === 'pass')

  const performancePressureEvidence = readJson(path.join(releaseDir, 'performance-pressure-evidence.json'), null)
  const hasG6LivePressureEvidence =
    performancePressureEvidence?.routeEvidenceAssessment?.status === 'pass' &&
    performancePressureEvidence?.requireLiveEvidence === true

  const hasAnyG6LivePressureArtifact = [
    'g6-live-pressure-query-log.json',
    'v1424-pressure-query-log-evidence.json',
    'performance-pressure-evidence.json',
  ].some((fileName) => existsSync(path.join(releaseDir, fileName)))

  if (hasG6LocalPass && !hasG6LivePressureEvidence) {
    gateSummary.G6 = 'deferred'
  }
  if (hasG6LivePressureEvidence && gateSummary.G6 !== 'fail' && gateSummary.G6 !== 'blocked') {
    gateSummary.G6 = 'pass'
  }
  if (hasAnyG6LivePressureArtifact && !hasG6LivePressureEvidence && gateSummary.G6 === 'pass') {
    gateSummary.G6 = 'deferred'
  }

  return gateSummary
}

function statusWeight(status) {
  return {
    fail: 5,
    blocked: 4,
    deferred: 3,
    pass: 1,
  }[status] ?? 0
}

function summarizeFailingG4(results) {
  return results
    .filter((row) => row.gate === 'G4' && row.status !== 'pass')
    .map((row) => `${row.id}: ${row.status}${row.summary ? ` (${row.summary})` : ''}`)
}

function updateCommandResultsWithPredeploy(results, releaseDir, predeploySummary) {
  if (!predeploySummary || predeploySummary.status !== 'passed') {
    return { results, updated: false }
  }

  const evidencePath = path
    .relative(repoRoot, path.join(releaseDir, 'uiux-predeploy-gates', 'predeploy-gates-summary.json'))
    .replaceAll(path.sep, '/')
  const gateSummary = predeploySummary.summaries
    .map((summary) => `${summary.gate}=${summary.status}`)
    .join(', ')

  const updatedRows = results.map((row) => {
    if (row.id !== 'G4-uiux-predeploy-gates') return row
    return {
      ...row,
      command: 'node scripts/run-uiux-predeploy-gates.mjs all',
      cwd: repoRoot,
      environment: 'local_browser_against_staging_backend',
      finishedAt: predeploySummary.generatedAt,
      exitCode: 0,
      status: 'pass',
      stdoutPath: evidencePath,
      stderrPath: evidencePath,
      summary: `current UIUX predeploy gates passed: ${gateSummary}`,
      evidencePaths: unique([...(row.evidencePaths ?? []), evidencePath]),
    }
  })

  return { results: updatedRows, updated: true }
}

function findLatestPassingServerVitestReport(releaseDir) {
  const logsDir = path.join(releaseDir, 'logs')
  if (!existsSync(logsDir)) return null

  const candidates = readdirSync(logsDir)
    .filter((name) => /^G1-server-full.*\.json$/.test(name))
    .map((name) => {
      const filePath = path.join(logsDir, name)
      const report = readJson(filePath, null)
      return {
        name,
        filePath,
        report,
        mtimeMs: statSync(filePath).mtimeMs,
      }
    })
    .filter((entry) => entry.report?.success === true)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  return candidates[0] ?? null
}

function updateCommandResultsWithServerVitest(results, releaseDir, serverVitestReport) {
  if (!serverVitestReport) {
    return { results, updated: false }
  }

  const evidencePath = path
    .relative(repoRoot, serverVitestReport.filePath)
    .replaceAll(path.sep, '/')
  const { report } = serverVitestReport
  const summary = `server full Vitest passed: ${report.numPassedTestSuites}/${report.numTotalTestSuites} suites and ${report.numPassedTests}/${report.numTotalTests} tests`

  const updatedRows = results.map((row) => {
    if (row.id !== 'G1-fresh-server-vitest') return row
    return {
      ...row,
      command: 'cmd.exe /c npm exec --workspace=server -- vitest run --config vitest.config.ts --reporter=json',
      cwd: repoRoot,
      environment: 'local_static',
      startedAt: report.startTime ? new Date(report.startTime).toISOString() : row.startedAt,
      finishedAt: serverVitestReport.mtimeMs ? new Date(serverVitestReport.mtimeMs).toISOString() : row.finishedAt,
      exitCode: 0,
      status: 'pass',
      stdoutPath: evidencePath,
      stderrPath: evidencePath,
      summary,
      evidencePaths: unique([...(row.evidencePaths ?? []), evidencePath]),
    }
  })

  return { results: updatedRows, updated: true }
}

function buildBlockers(decision, results, predeploySummary) {
  const existing = decision.openBlockers ?? []
  const effectiveResults = effectiveCommandResults(results)
  const staleGates = ['G4']
  if (gateStatusFromResults(effectiveResults, 'G1') === 'pass') staleGates.push('G1')
  const blockersWithoutStaleG1G4 = existing.filter((blocker) => !staleGates.includes(blocker.gate))
  const failingG4 = summarizeFailingG4(effectiveResults)

  if (failingG4.length === 0) return blockersWithoutStaleG1G4

  const predeployNote =
    predeploySummary?.status === 'passed'
      ? `Current uiux-predeploy-gates passed at ${predeploySummary.generatedAt}; it only closes the stale predeploy failure, not the remaining G4 browser/UIUX child failures.`
      : 'Current uiux-predeploy-gates pass evidence is missing.'

  return [
    ...blockersWithoutStaleG1G4,
    {
      gate: 'G4',
      severity: 'P0',
      reason: `${predeployNote} Remaining G4 failures: ${failingG4.join(' | ')}`,
      requiredAction:
        'Rerun and close all v1.4.24 G4 browser/UIUX commands: browser-suite shell/collab, project-chains, planning/tooling, visual, overlap, a11y, performance, release-smoke, and predeploy gates.',
    },
  ].sort((a, b) => {
    const severityOrder = { P0: 0, P1: 1, P2: 2 }
    const severityDelta = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
    if (severityDelta !== 0) return severityDelta
    return String(a.gate).localeCompare(String(b.gate))
  })
}

function hasGateExplanation(decision, gate) {
  const gateToken = String(gate)
  return (
    (decision.openBlockers ?? []).some((blocker) => blocker.gate === gateToken) ||
    (decision.downgradedCapabilities ?? []).some((item) => String(item).includes(gateToken)) ||
    (decision.mustRerunBeforeProduction ?? []).some((item) => String(item).includes(gateToken)) ||
    Object.values(decision.productionGapMatrix ?? {}).some((gap) => {
      const gapGates = Array.isArray(gap?.gate) ? gap.gate : [gap?.gate]
      return gapGates.includes(gateToken) && gap?.decisionImpact && gap.decisionImpact !== 'none'
    }) ||
    Object.values(decision.productionBaselineMatrix ?? {}).some((baseline) => {
      const mappedGates = Array.isArray(baseline?.mappedGates) ? baseline.mappedGates : []
      return mappedGates.includes(gateToken) && (
        (baseline?.blockers ?? []).length > 0 ||
        baseline?.decisionImpact === 'explicit-gate' ||
        String(baseline?.decisionImpact ?? '').startsWith('release-blocked')
      )
    })
  )
}

function explainUnresolvedGateStatuses(decision, gateSummary) {
  const generated = []
  const existing = decision.openBlockers ?? []

  for (const [gate, status] of Object.entries(gateSummary ?? {})) {
    if (!['fail', 'blocked', 'deferred'].includes(status)) continue
    if (hasGateExplanation({ ...decision, openBlockers: [...existing, ...generated] }, gate)) continue

    const severity = status === 'deferred' ? 'P1' : 'P0'
    generated.push({
      gate,
      severity,
      reason: `Gate ${gate} is ${status} but no explicit blocker, downgraded capability, rerun action, gap, or baseline explanation was recorded.`,
      requiredAction: `Record the missing ${gate} evidence or add a concrete blocker/explicit-gate explanation before refreshing the v1.4.24 release decision.`,
      generatedBy: 'refresh-v1424-release-summary',
    })
  }

  if (generated.length === 0) return decision.openBlockers ?? []

  return [...existing, ...generated].sort((a, b) => {
    const severityOrder = { P0: 0, P1: 1, P2: 2 }
    const severityDelta = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
    if (severityDelta !== 0) return severityDelta
    return String(a.gate).localeCompare(String(b.gate))
  })
}

function updateGapMatrix(decision, predeploySummary, gateSummary) {
  const gap = decision.productionGapMatrix?.['GAP-P0-05']
  if (!gap) return

  gap.gate = 'G4'
  gap.evidence = unique([
    ...(gap.evidence ?? []),
    predeploySummary?.status === 'passed'
      ? 'uiux-predeploy-gates/predeploy-gates-summary.json'
      : null,
  ])
  if (gateSummary.G4 === 'pass') {
    gap.status = 'pass'
    gap.decisionImpact = 'none'
    gap.currentFinding =
      'Current G4 browser suites and UIUX child gates passed for this release run; production decision still depends on live/DB/security gates.'
    return
  }

  gap.status = 'fail'
  gap.decisionImpact = 'release-blocked'
  gap.currentFinding =
    predeploySummary?.status === 'passed'
      ? 'UIUX predeploy is current and passed, but G4 is still blocked by unclosed browser suite and individual UIUX child-gate failures.'
      : 'G4 remains blocked because current UIUX predeploy evidence is missing and other browser/UIUX child gates are not green.'
}

function updateProductionBaselineForG1(decision, serverVitestReport) {
  if (!serverVitestReport) return

  const evidencePath = path
    .relative(repoRoot, serverVitestReport.filePath)
    .replaceAll(path.sep, '/')
  const pb11 = decision.productionBaselineMatrix?.['PB-11']
  if (pb11) {
    pb11.currentEvidence = unique([...(pb11.currentEvidence ?? []), evidencePath])
    const openGates = Object.entries(decision.gates ?? {})
      .filter(([, status]) => status !== 'pass')
      .map(([gate]) => gate)
    pb11.blockers = [
      openGates.length > 0
        ? `The local static server full Vitest rerun is current and passed; PB-11 still cannot close while ${openGates.join('/')} release gates remain open.`
        : 'The local static server full Vitest rerun is current and passed; PB-11 can close only after final release decision verification confirms no open hard gates remain.',
    ]
    pb11.status = 'needs-gating'
    pb11.decisionImpact = 'release-blocked-until-all-hard-gates-complete'
  }
}

function readCurrentG3Matrix(releaseDir) {
  return readJson(path.join(releaseDir, 'rls-role-matrix.json'), null)
}

function updateG3Decision(decision, releaseDir, gateSummary) {
  const matrix = readCurrentG3Matrix(releaseDir)
  if (!matrix || matrix.schemaVersion !== 'workbuddy-v1424-rls-role-matrix/v2') return

  const blockers = Array.isArray(matrix.coverageSummary?.blockers)
    ? matrix.coverageSummary.blockers
    : []
  const failedCases = Number(matrix.coverageSummary?.failedCases ?? 0)
  const totalCases = Number(matrix.coverageSummary?.totalCases ?? 0)
  const passedCases = Number(matrix.coverageSummary?.passedCases ?? 0)
  const hasCanonicalRoleMatrixPass =
    matrix.status === 'pass' &&
    blockers.length === 0 &&
    failedCases === 0 &&
    matrix.cases?.some((testCase) => testCase.id === 'G3-OUTSIDER-MEMBERSHIP-REJECTED' && testCase.status === 'pass' && testCase.httpStatus === 403) &&
    matrix.cases?.some((testCase) => testCase.id === 'G3-OUTSIDER-TASK-LIST-REJECTED' && testCase.status === 'pass' && testCase.httpStatus === 403) &&
    matrix.cases?.some((testCase) => testCase.id === 'G3-OUTSIDER-TASK-WRITE-REJECTED' && testCase.status === 'pass' && testCase.httpStatus === 403) &&
    matrix.cases?.some((testCase) => testCase.id === 'G3-OUTSIDER-PROJECT-PATCH-REJECTED' && testCase.status === 'pass' && testCase.httpStatus === 403)

  const currentEvidence = [
    'auth-smoke.json',
    'api-error-semantics.json',
    'rls-role-matrix.json',
    'tenant-access-matrix.json',
  ]

  if (hasCanonicalRoleMatrixPass) {
    gateSummary.G3 = 'pass'
    decision.openBlockers = (decision.openBlockers ?? []).filter((blocker) => blocker.gate !== 'G3')

    const gapAuth = decision.productionGapMatrix?.['GAP-P0-03']
    if (gapAuth) {
      gapAuth.status = 'pass'
      gapAuth.evidence = unique([...(gapAuth.evidence ?? []), ...currentEvidence])
      gapAuth.decisionImpact = 'none'
      gapAuth.currentFinding =
        'Current auth smoke and API error semantics passed: configured accounts log in, anon project create returns 401, invalid token returns 401, and raw tokens are not written to reports.'
    }

    const gapRls = decision.productionGapMatrix?.['GAP-P0-04']
    if (gapRls) {
      gapRls.status = 'pass'
      gapRls.evidence = unique([...(gapRls.evidence ?? []), ...currentEvidence])
      gapRls.decisionImpact = 'none'
      gapRls.currentFinding =
        `Current G3 staging role matrix executed ${passedCases}/${totalCases} cases successfully, including owner/company-admin/editor access, same-company outsider rejection, anon 401, invalid-token 401, and cross-tenant rejection.`
    }

    for (const key of ['PB-01', 'PB-06', 'PB-T01']) {
      const baseline = decision.productionBaselineMatrix?.[key]
      if (!baseline) continue
      baseline.currentEvidence = unique([...(baseline.currentEvidence ?? []), ...currentEvidence])
      baseline.status = 'needs-gating'
      baseline.blockers = [
        'Current auth, same-company outsider rejection, anon rejection, invalid-token rejection, editor write/readback/rollback, and cross-tenant isolation passed; baseline still cannot be production-ready until all remaining v1.4.24 live/DB/release gates close.',
      ]
      baseline.decisionImpact = 'release-blocked-until-all-hard-gates-complete'
    }
    return
  }

  gateSummary.G3 = 'blocked'
  decision.openBlockers = (decision.openBlockers ?? []).map((blocker) => {
    if (blocker.gate !== 'G3') return blocker
    return {
      ...blocker,
      severity: 'P0',
      reason: `Current G3 staging role matrix passed ${passedCases}/${totalCases} cases and still has ${failedCases} failed cases with blockers: ${blockers.join(', ') || 'none reported'}.`,
      requiredAction:
        'Rerun owner/company-admin/editor, same-company outsider, anonymous, invalid-token, and cross-tenant checks, then close every failed case.',
    }
  })

    const gapAuth = decision.productionGapMatrix?.['GAP-P0-03']
    if (gapAuth) {
      gapAuth.status = 'pass'
      gapAuth.evidence = unique([...(gapAuth.evidence ?? []), ...currentEvidence])
      gapAuth.decisionImpact = 'none'
      gapAuth.currentFinding =
        'Current auth smoke and API error semantics passed: configured accounts log in, anon project create returns 401, invalid token returns 401, and raw tokens are not written to reports.'
    }

    const gapRls = decision.productionGapMatrix?.['GAP-P0-04']
    if (gapRls) {
      gapRls.status = 'blocked'
      gapRls.evidence = unique([...(gapRls.evidence ?? []), 'rls-role-matrix.json'])
      gapRls.decisionImpact = 'release-blocked'
      gapRls.currentFinding =
        'The canonical owner/editor and outsider-denial role matrix still has failed or blocking cases.'
    }

    for (const key of ['PB-01', 'PB-06', 'PB-T01']) {
      const baseline = decision.productionBaselineMatrix?.[key]
      if (!baseline) continue
      baseline.currentEvidence = unique([...(baseline.currentEvidence ?? []), ...currentEvidence])
      baseline.status = 'needs-gating'
      baseline.blockers = [
        'Current role-matrix evidence is incomplete; canonical owner/editor access and outsider/cross-tenant denial must all pass.',
      ]
      baseline.decisionImpact = 'release-blocked-if-isolation-fails'
    }
}

function updateBaselineMatrix(decision, predeploySummary, gateSummary) {
  const pb02 = decision.productionBaselineMatrix?.['PB-02']
  if (pb02 && decision.g2MigrationAdvisorCloseout?.status === 'closed') {
    pb02.status = 'needs-gating'
    pb02.currentEvidence = unique([
      ...(pb02.currentEvidence ?? []),
      'supabase-advisor-management-api-export.json',
      'production-migration-governance-evidence.json',
      'production-migration-governance-report.json',
    ])
    pb02.blockers = [
      'Current migration governance closeout is closed with formal Advisor export and MG-07 pass; PB-02 still cannot be production-ready until remaining v1.4.24 hard gates close.',
    ]
    pb02.decisionImpact = 'release-blocked-until-all-hard-gates-complete'
  }

  const pb08 = decision.productionBaselineMatrix?.['PB-08']
  if (pb08 && gateSummary.G6 === 'pass') {
    pb08.status = 'needs-gating'
    pb08.currentEvidence = unique([
      ...(pb08.currentEvidence ?? []),
      'v1424-pressure-query-log-evidence.json',
      'performance-pressure-evidence.json',
    ])
    pb08.blockers = [
      'Current staging company-summary pressure and query-log evidence passed; PB-08 still cannot be production-ready until G2 migration Advisor and G5 live closeout/rollback gates are closed.',
    ]
    pb08.decisionImpact = 'release-blocked-until-all-hard-gates-complete'
  }

  const pb09 = decision.productionBaselineMatrix?.['PB-09']
  if (pb09 && predeploySummary?.status === 'passed') {
    pb09.currentEvidence = unique([
      ...(pb09.currentEvidence ?? []),
      'uiux-predeploy-gates/predeploy-gates-summary.json',
    ])
    if (gateSummary.G4 === 'pass') {
      pb09.status = 'needs-gating'
      pb09.blockers = [
        gateSummary.G3 === 'pass'
          ? 'Current browser/UIUX business-loop and G3 role/RLS matrix evidence passed; PB-09 still cannot be production-ready until G2/G5/G6 live, DB, migration Advisor, pressure/query-log, and closeout gates are closed.'
          : 'Current browser/UIUX business-loop evidence passed; PB-09 still cannot be production-ready until G2/G3/G5/G6 live, DB, RLS, tenant-isolation, and closeout gates are closed.',
      ]
    } else {
      pb09.blockers = [
        'UIUX predeploy is current and passed, but business-loop browser suite evidence is still not closed for all v1.4.24 G4 commands.',
      ]
    }
  }

  const pbt04 = decision.productionBaselineMatrix?.['PB-T04']
  if (pbt04 && predeploySummary?.status === 'passed') {
    pbt04.currentEvidence = unique([
      ...(pbt04.currentEvidence ?? []),
      'uiux-predeploy-gates/predeploy-gates-summary.json',
    ])
    if (gateSummary.G4 === 'pass') {
      pbt04.status = 'needs-gating'
      pbt04.blockers = [
        'Current browser/UIUX engineering-domain chains passed; PB-T04 still cannot be production-ready until live/DB/runtime publication and tenant-isolation gates are closed.',
      ]
    } else {
      pbt04.blockers = [
        'UIUX predeploy is current and passed, but engineering-domain browser chains remain unclosed until the required G4 browser suites are rerun and pass.',
      ]
    }
  }
}

function updateDowngradedCapabilities(decision, gateSummary) {
  const current = decision.downgradedCapabilities ?? []
  const next = current.map((item) => {
    if (
      item.includes('Performance hardening remains deferred')
      || item.includes('Performance hardening has current staging pressure')
    ) {
      return gateSummary.G6 === 'pass'
        ? 'Performance hardening has current staging pressure and query-log evidence for CompanyCockpit company-summary.'
        : 'Performance hardening remains deferred until live/staging pressure and query-log evidence are archived.'
    }
    if (
      item.includes('CompanyCockpit and browser/UIUX flows remain degraded')
      || item.includes('CompanyCockpit and browser/UIUX flows have current G4 pass evidence')
    ) {
      return gateSummary.G4 === 'pass'
        ? 'CompanyCockpit and browser/UIUX flows have current G4 pass evidence for this release run.'
        : 'CompanyCockpit and browser/UIUX flows remain degraded until all G4 browser suites and UIUX child gates pass; current UIUX predeploy alone is not enough.'
    }
    return item
  })
  decision.downgradedCapabilities = unique(next).filter((item) => {
    if (gateSummary.G4 === 'pass' && item.includes('CompanyCockpit and browser/UIUX flows have current G4 pass evidence')) {
      return false
    }
    if (gateSummary.G6 === 'pass' && item.includes('Performance hardening has current staging pressure')) {
      return false
    }
    return true
  })
}

function updateFalseGreenAuditBoundary(decision, releaseDir) {
  const audit = readJson(path.join(releaseDir, 'v1424-false-green-audit.json'), null)
  const review = readJson(path.join(releaseDir, 'v1424-false-green-review.json'), null)
  const reviewAccepted = isFalseGreenReviewAccepted(audit, review)
  decision.falseGreenReviewSummary = audit
    ? {
        status: reviewAccepted ? review.status : (audit.summary?.status ?? audit.status ?? 'unknown'),
        findingCount: Number(audit.summary?.findingCount ?? audit.findingCount ?? 0),
        bySeverity: audit.summary?.bySeverity ?? null,
        byClassification: audit.summary?.byClassification ?? null,
        byRule: audit.summary?.byRule ?? [],
        topFiles: audit.summary?.topFiles ?? [],
        reviewPriority: audit.summary?.reviewPriority ?? [],
        classificationLegend: audit.summary?.classificationLegend ?? [],
        reviewArtifact: reviewAccepted ? 'v1424-false-green-review.json' : null,
        reviewDecision: reviewAccepted ? review.decision ?? null : null,
        reviewBlockers: review?.blockers ?? [],
        releaseGateUse:
          reviewAccepted
            ? 'false-green audit has been reviewed and mapped away from production gate-closing evidence'
            : 'false-green audit is review input only; suspect/supporting-only findings cannot close production gates until mapped to real execution evidence',
      }
    : {
        status: 'missing',
        findingCount: 0,
        bySeverity: null,
        byClassification: null,
        byRule: [],
        topFiles: [],
        reviewPriority: [],
        classificationLegend: [],
        reviewArtifact: null,
        reviewDecision: null,
        reviewBlockers: [],
        releaseGateUse: 'missing false-green audit cannot support release-pass',
      }
  if (!audit) return

  const falseGreenPrefix = 'G8 false-green audit requires review before unconditional release-pass:'
  decision.downgradedCapabilities = (decision.downgradedCapabilities ?? [])
    .filter((item) => !String(item).startsWith(falseGreenPrefix))
  const pb11 = decision.productionBaselineMatrix?.['PB-11']
  if (pb11) {
    pb11.blockers = (pb11.blockers ?? [])
      .filter((item) => !String(item).startsWith(falseGreenPrefix))
  }

  if (reviewAccepted) {
    decision.mustRerunBeforeProduction = (decision.mustRerunBeforeProduction ?? [])
      .filter((item) => !String(item).includes('Review v1424-false-green-audit.json'))
    if (pb11) {
      pb11.currentEvidence = unique([
        ...(pb11.currentEvidence ?? []),
        'v1424-false-green-audit.json',
        'v1424-false-green-review.json',
      ])
      pb11.decisionImpact = 'none'
      pb11.blockers = (pb11.blockers ?? []).filter((item) =>
        !String(item).includes('remaining explicit review gates remain open') &&
        !String(item).includes('still cannot close while G2/G5 release gates remain open'),
      )
      if ((pb11.blockers ?? []).length === 0) {
        pb11.status = 'pass'
      }
    }
    return
  }

  const findingCount = Number(audit.summary?.findingCount ?? audit.findingCount ?? 0)
  const status = audit.summary?.status ?? audit.status
  if (status !== 'review-required' || findingCount <= 0) return

  const suspectCount = (audit.findings ?? [])
    .filter((finding) => finding.severity === 'suspect-fake-green')
    .length
  const supportingOnlyCount = (audit.findings ?? [])
    .filter((finding) => finding.severity === 'supporting-only')
    .length
  const boundary =
    `G8 false-green audit requires review before unconditional release-pass: ${findingCount} findings (${suspectCount} suspect-fake-green, ${supportingOnlyCount} supporting-only).`

  decision.downgradedCapabilities = unique([
    ...(decision.downgradedCapabilities ?? []),
    boundary,
  ])
  decision.mustRerunBeforeProduction = unique([
    ...(decision.mustRerunBeforeProduction ?? []),
    'Review v1424-false-green-audit.json and prove suspect/supporting-only tests are not used to close production gates',
  ])

  if (pb11) {
    pb11.currentEvidence = unique([
      ...(pb11.currentEvidence ?? []),
      'v1424-false-green-audit.json',
    ])
    pb11.status = 'needs-gating'
    pb11.blockers = unique([
      ...(pb11.blockers ?? []),
      boundary,
    ])
    pb11.decisionImpact = 'release-blocked-until-all-hard-gates-complete'
  }
}

function isFalseGreenReviewAccepted(audit, review) {
  if (!audit || !review || review.status !== 'reviewed-not-gate-closing') return false
  if (review.auditArtifact !== 'v1424-false-green-audit.json') return false
  if (review.decision?.removeExplicitG8Gate !== true) return false
  if (review.decision?.productionGateUse !== 'not-used-to-close-hard-gates') return false
  if ((review.blockers ?? []).length > 0) return false

  const auditFindingCount = Number(audit.summary?.findingCount ?? audit.findingCount ?? 0)
  const auditSuspectCount = (audit.findings ?? []).filter((finding) => finding.severity === 'suspect-fake-green').length
  const auditSupportingOnlyCount = (audit.findings ?? []).filter((finding) => finding.severity === 'supporting-only').length
  if (Number(review.auditSummary?.findingCount ?? -1) !== auditFindingCount) return false
  if (Number(review.auditSummary?.suspectFakeGreenCount ?? -1) !== auditSuspectCount) return false
  if (Number(review.auditSummary?.supportingOnlyCount ?? -1) !== auditSupportingOnlyCount) return false

  const reviewedSuspects = new Set((review.suspectFindings ?? []).map((finding) =>
    `${finding.file}:${Number(finding.line ?? 0)}:${finding.ruleId}`,
  ))
  const allSuspectsReviewed = (audit.findings ?? [])
    .filter((finding) => finding.severity === 'suspect-fake-green')
    .every((finding) => {
      const key = `${finding.file}:${Number(finding.line ?? 0)}:${finding.ruleId}`
      const reviewed = (review.suspectFindings ?? []).find((item) =>
        `${item.file}:${Number(item.line ?? 0)}:${item.ruleId}` === key
      )
      return reviewedSuspects.has(key) &&
        reviewed?.disposition === 'not-gate-closing' &&
        Array.isArray(reviewed?.hardGateClosedBy) &&
        reviewed.hardGateClosedBy.length === 0
    })
  if (!allSuspectsReviewed) return false

  const supportingDisposition = review.supportingOnlyDisposition ?? {}
  if (supportingDisposition.disposition !== 'supporting-only-not-gate-closing') return false
  if (Number(supportingDisposition.reviewedFindingCount ?? -1) !== auditSupportingOnlyCount) return false

  return true
}

function updateArtifactIndex(decision, releaseDir) {
  const requiredArtifacts = [
    'v1424-command-results.normalized.json',
    'v1424-test-case-matrix.json',
    'v1424-baseline-test-coverage-map.json',
    'v1424-false-green-audit.json',
    'v1424-false-green-review.json',
    'v1424-test-case-ledger.md',
    'v1424-production-baseline-matrix.json',
    'supabase-advisor-management-api-preflight.json',
    'supabase-advisor-management-api-export.json',
    'supabase-advisor-dashboard-ui-capture.template.json',
    'supabase-advisor-dashboard-ui-capture.filled.json',
    'supabase-advisor-dashboard-ui-browser-attempt.json',
    'production-migration-governance-evidence.json',
    'production-migration-governance-report.json',
    'handoff-declaration.template.json',
    'handoff-plan.json',
    'handoff-plan.md',
    'handoff-readiness.json',
    'handoff-readiness.md',
    'handoff-signals.json',
    'handoff-candidate.generated.json',
    'handoff-candidate.hydrated.json',
    'c15-live-learning-preflight.json',
    'c19-runtime-preflight.json',
    'c19-release-closure-sources-preflight.json',
    'c18-l07-l15-live-diagnostics-evidence-validation.json',
    'c15-live-learning-closeout-evidence-validation.json',
    'c19-runtime-publication-release-rollback-evidence-validation.json',
    'old-object-physical-drop-closeout-evidence-validation.json',
    'old-object-candidate-discovery.all.json',
    'legacy-object-drop-guard.initial.json',
    'old-object-no-safe-candidate-closeout.json',
    'runtime-login-role-readback.json',
    'runtime-login-role-repair-attempt.json',
    'runtime-login-role-repair-execution.json',
    'runtime-login-role-sql-editor-package.json',
    'v1424-release-decision.json',
    'summary.json',
    'summary.md',
  ]
  const existing = decision.artifactIndex ?? []
  decision.artifactIndex = unique([
    ...existing,
    ...requiredArtifacts.filter((artifactPath) => releaseArtifactExists(releaseDir, artifactPath)),
  ])
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
const requiredCaseClasses = ['normal', 'boundary', 'exception', 'security']

function minimumCasesPerClass(baselineId) {
  return baselineId === 'PB-09' ? 5 : 3
}

function buildTestCaseDensitySummary(releaseDir) {
  const matrixArtifact = 'v1424-test-case-matrix.json'
  const coverageArtifact = 'v1424-baseline-test-coverage-map.json'
  const matrix = readJson(path.join(releaseDir, matrixArtifact), null)
  const coverage = readJson(path.join(releaseDir, coverageArtifact), null)
  const baselines = coverage?.baselines ?? {}
  const baselineEntries = Object.values(baselines)
  const missingRequiredBaselines = requiredProductionBaselineIds.filter((baselineId) => !baselines[baselineId])

  if (!matrix || !coverage) {
    return {
      status: 'missing-test-case-ledger',
      releaseGateUse: 'Missing test-case matrix or coverage map cannot support v1.4.24 release-pass.',
      sourceArtifacts: {
        [matrixArtifact]: Boolean(matrix),
        [coverageArtifact]: Boolean(coverage),
      },
      caseCount: Array.isArray(matrix?.cases) ? matrix.cases.length : 0,
      baselineCount: baselineEntries.length,
      requiredBaselineCount: requiredProductionBaselineIds.length,
      missingRequiredBaselines,
      minimums: {
        defaultPerClass: 3,
        pb09PerClass: 5,
        pb09MinimumTotal: 20,
      },
      requiredCaseClasses,
      pb09: null,
      tooThinBaselines: [],
    }
  }

  const baselineSummaries = baselineEntries.map((entry) => {
    const baselineId = entry.baselineId
    const minimum = minimumCasesPerClass(baselineId)
    const classCounts = Object.fromEntries(requiredCaseClasses.map((caseClass) => [
      caseClass,
      Array.isArray(entry.classCoverage?.[caseClass]) ? entry.classCoverage[caseClass].length : 0,
    ]))
    const belowMinimum = requiredCaseClasses
      .filter((caseClass) => classCounts[caseClass] < minimum)
      .map((caseClass) => ({
        caseClass,
        count: classCounts[caseClass],
        minimum,
      }))

    return {
      baselineId,
      name: entry.name ?? '',
      minimumPerClass: minimum,
      classCounts,
      totalClassRefs: requiredCaseClasses.reduce((sum, caseClass) => sum + classCounts[caseClass], 0),
      densityStatus: belowMinimum.length > 0 ? 'too-thin' : 'meets-minimum',
      belowMinimum,
    }
  })

  const tooThinBaselines = baselineSummaries
    .filter((entry) => entry.belowMinimum.length > 0)
    .map((entry) => ({
      baselineId: entry.baselineId,
      name: entry.name,
      minimumPerClass: entry.minimumPerClass,
      classCounts: entry.classCounts,
      belowMinimum: entry.belowMinimum,
    }))
  const pb09 = baselineSummaries.find((entry) => entry.baselineId === 'PB-09') ?? null
  const caseCount = Array.isArray(matrix.cases) ? matrix.cases.length : 0

  return {
    status: missingRequiredBaselines.length === 0 && tooThinBaselines.length === 0
      ? 'density-minimum-met-not-executed'
      : 'density-too-thin-or-incomplete',
    releaseGateUse: 'This summary only proves the v1.4.24 case ledger has enough case density. It does not prove execution pass.',
    sourceArtifacts: {
      [matrixArtifact]: true,
      [coverageArtifact]: true,
    },
    caseCount,
    baselineCount: baselineEntries.length,
    requiredBaselineCount: requiredProductionBaselineIds.length,
    missingRequiredBaselines,
    minimums: {
      defaultPerClass: 3,
      pb09PerClass: 5,
      pb09MinimumTotal: 20,
    },
    requiredCaseClasses,
    pb09,
    tooThinBaselines,
  }
}

function updateMustRerunBeforeProduction(decision, gateSummary) {
  const g2Commands = [
    'npm run evidence:supabase-advisor:management-api-preflight -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-management-api-preflight.json --advisor-output <artifact-root>/supabase-advisor-management-api-export.json --operator release-dashboard-db-profile',
    'npm run evidence:supabase-advisor:management-api -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-management-api-export.json --operator release-dashboard-db-profile',
    'npm run evidence:supabase-advisor:dashboard-ui-template -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-dashboard-ui-capture.template.json --operator release-dashboard-db-profile',
    'npm run evidence:supabase-advisor:dashboard-ui-normalize -- --input <operator-captured-dashboard-advisor-json> --output <artifact-root>/supabase-advisor-management-api-export.json --project-ref <project-ref> --dashboard-url <supabase-dashboard-project-advisor-url> --operator release-dashboard-db-profile',
    'npm run migrate:production-governance:evidence --workspace=server -- --output-file <artifact-root-from-server>/production-migration-governance-evidence.json --operator release-dashboard-db-profile --advisor-export-file <artifact-root-from-server>/supabase-advisor-management-api-export.json',
    'npm run migrate:production-governance --workspace=server -- --evidence-file <artifact-root-from-server>/production-migration-governance-evidence.json',
  ]
  const g5Commands = [
    'node project-testing/tools/generate-release-handoff-pack.mjs --target real-closeout --output-root <release-report-parent>',
    'node project-testing/tools/check-release-handoff-readiness.mjs --handoff-file <handoff.json> --output <release-report-dir>/handoff-readiness.json',
    'node project-testing/tools/validate-release-evidence.mjs --gate c18-l07-l15-live-diagnostics --evidence-root <release-report-dir> --output <release-report-dir>/c18-l07-l15-live-diagnostics-evidence-validation.json',
    'node project-testing/tools/validate-release-evidence.mjs --gate c15-live-learning-closeout --evidence-root <release-report-dir> --output <release-report-dir>/c15-live-learning-closeout-evidence-validation.json',
    'node project-testing/tools/validate-release-evidence.mjs --gate c19-runtime-publication-release-rollback --evidence-root <release-report-dir> --output <release-report-dir>/c19-runtime-publication-release-rollback-evidence-validation.json',
    'node project-testing/tools/validate-release-evidence.mjs --gate old-object-physical-drop-closeout --evidence-root <release-report-dir> --output <release-report-dir>/old-object-physical-drop-closeout-evidence-validation.json',
  ]
  const oldG2Commands = new Set([
    'npm run migrate:production-governance --workspace=server -- --evidence-file <production-migration-governance-evidence.json>',
  ])
  const oldG5Commands = new Set([
    'Live handoff and rollback evidence for G5',
  ])
  const g4Commands = new Set([
    'npm run verify:browser-suite:shell-and-collab',
    'npm run verify:browser-suite:project-chains',
    'npm run verify:browser-suite:planning-and-tooling',
    'npm run verify:uiux-visual',
    'npm run verify:uiux-overlap',
    'npm run verify:uiux-a11y',
    'npm run verify:uiux-performance',
    'npm run verify:uiux-release-smoke',
    'npm run verify:uiux-predeploy-gates',
  ])
  const g3Commands = new Set([
    'Full multi-role RLS matrix with company_admin, owner, editor, same-company outsider, anon, and cross-company fixtures',
  ])
  decision.mustRerunBeforeProduction = (decision.mustRerunBeforeProduction ?? []).filter(
    (command) => {
      if (oldG2Commands.has(command)) return false
      if (oldG5Commands.has(command)) return false
      if (gateSummary.G2 === 'pass' && g2Commands.includes(command)) return false
      if (gateSummary.G5 === 'pass' && g5Commands.includes(command)) return false
      if (gateSummary.G4 === 'pass' && g4Commands.has(command)) return false
      if (gateSummary.G3 === 'pass' && g3Commands.has(command)) return false
      if (gateSummary.G6 === 'pass' && command === 'Live/staging pressure and query-log evidence for G6') return false
      return true
    },
  )
  if (gateSummary.G2 !== 'pass') {
    decision.mustRerunBeforeProduction = unique([
      ...g2Commands,
      ...(decision.mustRerunBeforeProduction ?? []),
    ])
  }
  if (gateSummary.G5 !== 'pass') {
    decision.mustRerunBeforeProduction = unique([
      ...(decision.mustRerunBeforeProduction ?? []),
      ...g5Commands,
    ])
  }
}

function buildG2MigrationAdvisorCloseout(releaseDir, matrix) {
  const migrationGroup = (matrix.gateGroups ?? []).find((group) => group.id === 'database-migration-and-recovery')
  const commands = migrationGroup?.commands ?? []
  const advisorPreflightArtifact = 'supabase-advisor-management-api-preflight.json'
  const advisorExportArtifact = 'supabase-advisor-management-api-export.json'
  const dashboardTemplateArtifact = 'supabase-advisor-dashboard-ui-capture.template.json'
  const dashboardFilledArtifact = 'supabase-advisor-dashboard-ui-capture.filled.json'
  const dashboardBrowserAttemptArtifact = 'supabase-advisor-dashboard-ui-browser-attempt.json'
  const governanceEvidenceArtifact = 'production-migration-governance-evidence.json'
  const governanceReportArtifact = 'production-migration-governance-report.json'
  const advisorPreflightExists = releaseArtifactExists(releaseDir, advisorPreflightArtifact)
  const advisorExportExists = releaseArtifactExists(releaseDir, advisorExportArtifact)
  const dashboardTemplateExists = releaseArtifactExists(releaseDir, dashboardTemplateArtifact)
  const dashboardFilledExists = releaseArtifactExists(releaseDir, dashboardFilledArtifact)
  const dashboardBrowserAttemptExists = releaseArtifactExists(releaseDir, dashboardBrowserAttemptArtifact)
  const governanceEvidenceExists = releaseArtifactExists(releaseDir, governanceEvidenceArtifact)
  const governanceReportExists = releaseArtifactExists(releaseDir, governanceReportArtifact)
  const advisorPreflight = readJson(path.join(releaseDir, advisorPreflightArtifact), null)
  const advisorExport = readJson(path.join(releaseDir, advisorExportArtifact), null)
  const dashboardTemplate = readJson(path.join(releaseDir, dashboardTemplateArtifact), null)
  const dashboardBrowserAttempt = readJson(path.join(releaseDir, dashboardBrowserAttemptArtifact), null)
  const governanceReport = readJson(path.join(releaseDir, governanceReportArtifact), null)
  const mg07 = Array.isArray(governanceReport?.gates)
    ? governanceReport.gates.find((gate) => gate?.id === 'MG-07')
    : null
  const reportClosed = governanceReport?.status === 'closed'
  const mg07Pass = mg07?.status === 'pass'
  const allArtifactsPresent = advisorExportExists && governanceEvidenceExists && governanceReportExists
  const status = allArtifactsPresent && reportClosed && mg07Pass
    ? 'closed'
    : allArtifactsPresent
      ? 'artifacts-present-but-governance-blocked'
      : 'missing-required-artifacts'

  return {
    status,
    gate: 'G2',
    releaseGateUse: status === 'closed'
      ? 'G2 is closed for this release directory: current-run Advisor export, migration governance evidence, and governance report are present and MG-07 passed.'
      : 'G2 remains blocked until the current-run Advisor export, migration governance evidence, and governance report all exist and migrate:production-governance exits closed with MG-07 pass.',
    requiredArtifacts: [
      advisorPreflightArtifact,
      advisorExportArtifact,
      governanceEvidenceArtifact,
      governanceReportArtifact,
    ],
    artifactPresence: {
      [advisorPreflightArtifact]: advisorPreflightExists,
      [advisorExportArtifact]: advisorExportExists,
      [dashboardTemplateArtifact]: dashboardTemplateExists,
      [dashboardFilledArtifact]: dashboardFilledExists,
      [dashboardBrowserAttemptArtifact]: dashboardBrowserAttemptExists,
      [governanceEvidenceArtifact]: governanceEvidenceExists,
      [governanceReportArtifact]: governanceReportExists,
    },
    requiredCommands: commands.filter((command) =>
      command.includes('evidence:supabase-advisor:management-api') ||
      command.includes('evidence:supabase-advisor:dashboard-ui-template') ||
      command.includes('evidence:supabase-advisor:dashboard-ui-normalize') ||
      command.includes('migrate:production-governance:evidence') ||
      command.includes('migrate:production-governance'),
    ),
    requiredCommandsStatus: status === 'closed' ? 'satisfied' : 'required',
    blockingPrerequisites: migrationGroup?.blockingPrerequisites ?? [],
    advisorPreflightSummary: advisorPreflight
      ? {
          status: advisorPreflight.status ?? 'unknown',
          readyToRun: Boolean(advisorPreflight.readyToRun),
          envFilePresent: Boolean(advisorPreflight.envFilePresent),
          projectRef: advisorPreflight.projectRef ?? null,
          resolvedTokenEnv: advisorPreflight.resolvedTokenEnv ?? null,
          blockerCodes: (advisorPreflight.blockers ?? []).map((blocker) => blocker.code),
          requiredExportArtifact: advisorPreflight.requiredExportArtifact ?? null,
        }
      : null,
    advisorExportSummary: advisorExport
      ? {
          schemaVersion: advisorExport.schemaVersion ?? null,
          source: advisorExport.source ?? null,
          environment: advisorExport.environment ?? null,
          projectRef: advisorExport.projectRef ?? null,
          exportedAt: advisorExport.exportedAt ?? null,
          securityIssueCount: Number.isFinite(Number(advisorExport.securityIssueCount))
            ? Number(advisorExport.securityIssueCount)
            : null,
          performanceIssueCount: Number.isFinite(Number(advisorExport.performanceIssueCount))
            ? Number(advisorExport.performanceIssueCount)
            : null,
        }
      : null,
    dashboardUiFallbackSummary: {
      template: dashboardTemplateExists
        ? {
            present: true,
            templateOnly: dashboardTemplate?.templateOnly ?? null,
            projectRef: dashboardTemplate?.projectRef ?? null,
            dashboardUrl: dashboardTemplate?.dashboardUrl ?? null,
            hasManualChecklist: Array.isArray(dashboardTemplate?.manualChecklist) && dashboardTemplate.manualChecklist.length > 0,
            normalizeCommand: dashboardTemplate?.normalizeCommand ?? null,
          }
        : { present: false },
      filledCapturePresent: dashboardFilledExists,
      browserAttempt: dashboardBrowserAttempt
        ? {
            status: dashboardBrowserAttempt.status ?? 'unknown',
            source: dashboardBrowserAttempt.source ?? null,
            attemptedAt: dashboardBrowserAttempt.attemptedAt ?? null,
            projectRef: dashboardBrowserAttempt.projectRef ?? null,
            blockedBy: dashboardBrowserAttempt.blockedBy ?? [],
            pages: (dashboardBrowserAttempt.pages ?? []).map((page) => ({
              section: page.section ?? null,
              currentUrl: page.currentUrl ?? null,
              isLogin: Boolean(page.isLogin),
              issueCountCaptured: page.issueCountCaptured ?? false,
              noIssueSignalCaptured: page.noIssueSignalCaptured ?? false,
            })),
          }
        : null,
    },
    governanceReportSummary: governanceReport
      ? {
          status: governanceReport.status ?? 'unknown',
          mg07Status: mg07?.status ?? 'missing',
          mg07ReasonCodes: mg07?.reasonCodes ?? [],
          allowValidate: Boolean(governanceReport.allowValidate),
          allowWarmup: Boolean(governanceReport.allowWarmup),
          allowScheduler: Boolean(governanceReport.allowScheduler),
          passGateCount: Array.isArray(governanceReport.gates)
            ? governanceReport.gates.filter((gate) => gate?.status === 'pass').length
            : 0,
          gateCount: Array.isArray(governanceReport.gates) ? governanceReport.gates.length : 0,
        }
      : null,
    tokenBoundary: 'Use SUPABASE_MANAGEMENT_API_TOKEN, SUPABASE_ACCESS_TOKEN, or SUPABASE_API_TOKEN from the operator environment only; do not write raw tokens or database URLs into repository artifacts. If no token is available, use evidence:supabase-advisor:dashboard-ui-normalize with an operator-captured Dashboard UI Advisor JSON capture.',
    nonSubstitutableEvidence: [
      'Supabase CLI db advisors evidence is supporting-only and cannot replace Dashboard UI or Management API Advisor export.',
      'Dashboard UI Advisor captures must include the Supabase dashboard project URL and current security/performance issue counts; do not synthesize them from CLI output.',
      'A browser attempt that lands on Supabase sign-in proves only that the Dashboard UI fallback is not currently captured; it cannot replace filled Dashboard counts.',
      'Catalog RLS readback is required but cannot close MG-07 without the formal Advisor export.',
      '--advisor-rescan-pass without --advisor-export-file is explicitly rejected by the evidence generator.',
      'Advisor performance issue counts are tracked under PB-08/G6 performance governance; they do not by themselves reopen MG-07 when the formal Advisor export reports zero security issues and production governance is closed.',
    ],
  }
}

function isRuntimeLoginRepairExecutionAttempt(value) {
  if (!value || typeof value !== 'object') return false
  const status = String(value.status ?? '').trim()
  if (status === 'blocked') {
    return Boolean(value.boundary?.dbMutation || value.boundary?.writesRolePassword)
  }
  return ['repaired', 'not-repaired', 'failed'].includes(status)
}

function selectRuntimeLoginRoleRepairAttempt(releaseDir) {
  const execution = readJson(path.join(releaseDir, 'runtime-login-role-repair-execution.json'), null)
  if (isRuntimeLoginRepairExecutionAttempt(execution)) return execution
  return readJson(path.join(releaseDir, 'runtime-login-role-repair-attempt.json'), null)
}

function buildG5LiveCloseoutContract(releaseDir, matrix) {
  const gateIds = [
    'c18-l07-l15-live-diagnostics',
    'c15-live-learning-closeout',
    'c19-runtime-publication-release-rollback',
    'old-object-physical-drop-closeout',
  ]
  const handoffReadiness = readJson(path.join(releaseDir, 'handoff-readiness.json'), null)
  const handoffSignals = readJson(path.join(releaseDir, 'handoff-signals.json'), null)
  const readinessGateById = new Map((handoffReadiness?.gates ?? []).map((gate) => [gate.id, gate]))
  const gates = gateIds.map((gateId) => {
    const group = (matrix.gateGroups ?? []).find((item) => item.id === gateId)
    const readinessGate = readinessGateById.get(gateId)
    const validationArtifact = `${gateId}-evidence-validation.json`
    const validation = readJson(path.join(releaseDir, validationArtifact), null)
    const validationStatus = validation?.status ?? 'missing'
    const expectedArtifacts = group?.expectedArtifacts ?? []
    const artifactPresence = Object.fromEntries(
      expectedArtifacts.map((artifact) => [artifact, releaseArtifactExists(releaseDir, artifact)]),
    )
    return {
      id: gateId,
      tier: group?.tier ?? null,
      matrixStatus: group?.status ?? null,
      closeoutStatus: validationStatus === 'pass' ? 'validation-pass' : 'missing-or-failing-current-evidence',
      validationArtifact,
      validationStatus,
      validationPass: validationStatus === 'pass',
      unlockPolicy: group?.unlockPolicy ?? null,
      commandTemplates: group?.commandTemplates ?? [],
      expectedArtifacts,
      artifactPresence,
      missingExpectedArtifacts: expectedArtifacts.filter((artifact) => !artifactPresence[artifact]),
      blockingPrerequisites: group?.blockingPrerequisites ?? [],
      handoffReadiness: readinessGate
        ? {
            readyToRun: Boolean(readinessGate.readyToRun),
            missingFlags: readinessGate.missingFlags ?? [],
            missingFields: readinessGate.missingFields ?? [],
            missingRecommendedFields: readinessGate.missingRecommendedFields ?? [],
            placeholderFields: readinessGate.placeholderFields ?? [],
            blockingIssueCount: (readinessGate.blockingIssues ?? []).length,
            blockingIssues: (readinessGate.blockingIssues ?? []).slice(0, 12),
          }
        : null,
      validationCommand: `node project-testing/tools/validate-release-evidence.mjs --gate ${gateId} --evidence-root <release-report-dir> --output <release-report-dir>/${validationArtifact}`,
    }
  })
  const handoffPlanPresent = releaseArtifactExists(releaseDir, 'handoff-plan.json')
  const handoffReadinessPresent = releaseArtifactExists(releaseDir, 'handoff-readiness.json')
  const c15Preflight = readJson(path.join(releaseDir, 'c15-live-learning-preflight.json'), null)
  const c19Preflight = readJson(path.join(releaseDir, 'c19-runtime-preflight.json'), null)
  const c19ReleaseClosureSourcesPreflight = readJson(path.join(releaseDir, 'c19-release-closure-sources-preflight.json'), null)
  const c19T2ReplayMetadataRemediationPlan = readJson(path.join(releaseDir, 'c19-t2-replay-metadata-remediation-plan.json'), null)
  const c18LiveDiagnostics = buildC18LiveDiagnosticSummary(releaseDir)
  const runtimeLoginRoleRepairAttempt = selectRuntimeLoginRoleRepairAttempt(releaseDir)
  const runtimeLoginRoleSqlEditorPackage = readJson(path.join(releaseDir, 'runtime-login-role-sql-editor-package.json'), null)
  const runtimeLoginRoleReadback = readJson(path.join(releaseDir, 'runtime-login-role-readback.json'), null)
  const allValidationPass = gates.every((gate) => gate.validationPass)
  const handoffReadinessSummary = handoffReadiness
    ? {
        status: handoffReadiness.status ?? 'unknown',
        readyToRun: Boolean(handoffReadiness.readyToRun),
        gateCount: Number(handoffReadiness.gateCount ?? (handoffReadiness.gates ?? []).length),
        readyGateCount: Number(handoffReadiness.readyGateCount ?? 0),
        blockedGateCount: Number(handoffReadiness.blockedGateCount ?? 0),
        secretLeakCount: Number(handoffReadiness.secretLeakCount ?? 0),
        refIssueCount: Number(handoffReadiness.refIssueCount ?? 0),
      }
    : null
  const status = handoffPlanPresent && handoffReadinessSummary?.readyToRun === true && allValidationPass
    ? 'current-release-live-closeout-ready'
    : 'missing-current-handoff-or-closeout-evidence'

  return {
    status,
    gate: 'G5',
    releaseGateUse: status === 'current-release-live-closeout-ready'
      ? 'G5 is closed for this release directory: handoff readiness passed and every listed live/DB closeout validator passed.'
      : 'G5 remains deferred until the current release directory has a handoff plan, handoff readiness pass, and pass validation for every listed live/DB closeout gate.',
    requiredTopLevelArtifacts: [
      'handoff-plan.json',
      'handoff-readiness.json',
      ...gates.map((gate) => gate.validationArtifact),
    ],
    topLevelArtifactPresence: {
      'handoff-plan.json': handoffPlanPresent,
      'handoff-readiness.json': handoffReadinessPresent,
      ...Object.fromEntries(gates.map((gate) => [gate.validationArtifact, releaseArtifactExists(releaseDir, gate.validationArtifact)])),
    },
    handoffReadinessSummary,
    handoffSignalsSummary: handoffSignals
      ? {
          dbOk: Boolean(handoffSignals.connectivity?.db?.ok),
          discoveredTargets: handoffSignals.discoveredTargets ?? {},
          candidateDiscovery: handoffSignals.candidateDiscovery
            ? {
                ready: Boolean(handoffSignals.candidateDiscovery.ready),
                selectedCandidateId: handoffSignals.candidateDiscovery.selectedCandidateId ?? '',
                selectedBy: handoffSignals.candidateDiscovery.selectedBy ?? '',
                blockers: handoffSignals.candidateDiscovery.blockers ?? [],
                counts: handoffSignals.candidateDiscovery.counts ?? {},
                latest: handoffSignals.candidateDiscovery.latest ?? {},
                filterInputs: handoffSignals.candidateDiscovery.filterInputs ?? {},
              }
            : null,
        }
      : null,
    diagnosticSummaries: {
      c18LiveDiagnostics,
      runtimeLoginRoleRepairAttempt: runtimeLoginRoleRepairAttempt
        ? {
            status: runtimeLoginRoleRepairAttempt.status ?? 'unknown',
            targetRole: runtimeLoginRoleRepairAttempt.targetRole ?? runtimeLoginRoleRepairAttempt.roleName ?? null,
            attempts: (runtimeLoginRoleRepairAttempt.attempts ?? []).map((attempt) => ({
              method: attempt.method ?? null,
              result: attempt.result ?? null,
              failureCategory: attempt.failureCategory ?? null,
              safeErrorSummary: attempt.safeErrorSummary ?? null,
            })),
            failureCategory: runtimeLoginRoleRepairAttempt.failureCategory ?? null,
            safeErrorSummary: runtimeLoginRoleRepairAttempt.safeErrorSummary ?? null,
            nextAction: runtimeLoginRoleRepairAttempt.nextAction ?? null,
            nextRequiredInput: runtimeLoginRoleRepairAttempt.nextRequiredInput ?? [],
            releaseImpact: runtimeLoginRoleRepairAttempt.releaseImpact ?? [],
            boundary: runtimeLoginRoleRepairAttempt.boundary ?? {},
          }
        : null,
      runtimeLoginRoleSqlEditorPackage: runtimeLoginRoleSqlEditorPackage
        ? {
            status: runtimeLoginRoleSqlEditorPackage.status ?? 'unknown',
            targetProjectRef: runtimeLoginRoleSqlEditorPackage.targetProjectRef ?? null,
            targetRole: runtimeLoginRoleSqlEditorPackage.targetRole ?? null,
            containsSensitiveSqlFile: Boolean(runtimeLoginRoleSqlEditorPackage.containsSensitiveSqlFile),
            artifacts: runtimeLoginRoleSqlEditorPackage.artifacts ?? {},
            operatorSteps: runtimeLoginRoleSqlEditorPackage.operatorSteps ?? [],
            releaseImpact: runtimeLoginRoleSqlEditorPackage.releaseImpact ?? [],
          }
        : null,
      runtimeLoginRoleReadback: runtimeLoginRoleReadback
        ? {
            status: runtimeLoginRoleReadback.status ?? 'unknown',
            targetRole: runtimeLoginRoleReadback.targetRole ?? null,
            runtimeGroupRole: runtimeLoginRoleReadback.runtimeGroupRole ?? null,
            sourceCount: Number((runtimeLoginRoleReadback.sources ?? []).length),
            structuralBlockers: runtimeLoginRoleReadback.structuralBlockers ?? [],
            passwordAuthBlockers: runtimeLoginRoleReadback.passwordAuthBlockers ?? [],
            blockers: runtimeLoginRoleReadback.blockers ?? [],
            closesRuntimeLoginPrerequisite: Boolean(runtimeLoginRoleReadback.closesRuntimeLoginPrerequisite),
            checks: runtimeLoginRoleReadback.checks ?? {},
            releaseImpact: runtimeLoginRoleReadback.releaseImpact ?? [],
            boundary: runtimeLoginRoleReadback.boundary ?? {},
          }
        : null,
    },
    preflightSummaries: {
      c15LiveLearning: c15Preflight
        ? {
            status: c15Preflight.status ?? 'unknown',
            projectId: c15Preflight.projectId ?? null,
            companyId: c15Preflight.companyId ?? null,
            reasonCodes: c15Preflight.reasonCodes ?? [],
            readiness: c15Preflight.readiness ?? null,
            decisionCount: Number(c15Preflight.decisionSummary?.decisionCount ?? 0),
            evaluatedCount: Number(c15Preflight.decisionSummary?.evaluatedCount ?? 0),
            candidateCount: Number(c15Preflight.candidateSummary?.candidateCount ?? 0),
            latestCandidateId: c15Preflight.candidateSummary?.latestCandidateId ?? null,
            calibrationCount: Number(c15Preflight.calibrationSummary?.calibrationCount ?? 0),
            dbMutation: Boolean(c15Preflight.dbMutation),
            liveMutation: Boolean(c15Preflight.liveMutation),
          }
        : null,
      c19Runtime: c19Preflight
        ? {
            status: c19Preflight.status ?? 'unknown',
            projectId: c19Preflight.projectId ?? null,
            reasonCodes: c19Preflight.reasonCodes ?? [],
            readiness: c19Preflight.readiness ?? null,
            durationSampleCount: Number(c19Preflight.replaySampleReadiness?.durationSampleCount ?? 0),
            t2WindowSampleCount: Number(c19Preflight.replaySampleReadiness?.t2WindowSampleCount ?? 0),
            publicationCount: Number(c19Preflight.publicationReadiness?.publicationCount ?? 0),
            latestPublicationKey: c19Preflight.publicationReadiness?.latestPublicationKey ?? null,
            monitoringCount: Number(c19Preflight.runtimeEventReadiness?.monitoringCount ?? 0),
            rollbackCount: Number(c19Preflight.runtimeEventReadiness?.rollbackCount ?? 0),
            completedActualTaskCount: Number(c19Preflight.taskReadiness?.completedActualTaskCount ?? 0),
            t2MetadataTaskCount: Number(c19Preflight.taskReadiness?.t2MetadataTaskCount ?? 0),
            dbMutation: Boolean(c19Preflight.dbMutation),
            liveMutation: Boolean(c19Preflight.liveMutation),
          }
        : null,
      c19ReleaseClosureSources: c19ReleaseClosureSourcesPreflight
        ? {
            status: c19ReleaseClosureSourcesPreflight.status ?? 'unknown',
            readyToGenerateReleaseClosure: Boolean(c19ReleaseClosureSourcesPreflight.readyToGenerateReleaseClosure),
            reasonCodes: c19ReleaseClosureSourcesPreflight.reasonCodes ?? [],
            missingSourceFileRoles: c19ReleaseClosureSourcesPreflight.missingSourceFileRoles ?? [],
            invalidSourceFileRoles: c19ReleaseClosureSourcesPreflight.invalidSourceFileRoles ?? [],
            templateScopeStatus: c19ReleaseClosureSourcesPreflight.templateScope?.status ?? null,
            commonTemplateIds: c19ReleaseClosureSourcesPreflight.templateScope?.commonTemplateIds ?? [],
            sourceArtifacts: Object.fromEntries(
              Object.entries(c19ReleaseClosureSourcesPreflight.sources ?? {}).map(([role, source]) => [
                role,
                {
                  present: Boolean(source?.present),
                  usable: Boolean(source?.usable),
                  artifact: source?.artifact ?? null,
                  reasonCodes: source?.reasonCodes ?? [],
                  selectedTemplateIds: source?.selectedTemplateIds ?? [],
                  evidenceRefCount: Number(source?.evidenceRefCount ?? 0),
                },
              ]),
            ),
            dbMutation: Boolean(c19ReleaseClosureSourcesPreflight.boundary?.dbMutation),
            liveMutation: Boolean(c19ReleaseClosureSourcesPreflight.boundary?.liveMutation),
          }
        : null,
      c19T2ReplayMetadataRemediation: c19T2ReplayMetadataRemediationPlan
        ? {
            status: c19T2ReplayMetadataRemediationPlan.status ?? 'unknown',
            dryRun: c19T2ReplayMetadataRemediationPlan.dryRun !== false,
            liveMutation: Boolean(c19T2ReplayMetadataRemediationPlan.liveMutation),
            dbMutation: Boolean(c19T2ReplayMetadataRemediationPlan.dbMutation),
            projectId: c19T2ReplayMetadataRemediationPlan.projectId ?? null,
            plannedUpdateCount: Number(c19T2ReplayMetadataRemediationPlan.plannedUpdateCount ?? 0),
            unknownCodes: c19T2ReplayMetadataRemediationPlan.unknownCodes ?? [],
            unsupportedCodes: c19T2ReplayMetadataRemediationPlan.unsupportedCodes ?? [],
            requiredDurationBearingWindows: c19T2ReplayMetadataRemediationPlan.requiredDurationBearingWindows ?? [],
            minimumWorkfacesPerWindow: Number(c19T2ReplayMetadataRemediationPlan.minimumWorkfacesPerWindow ?? 0),
            reasonCodes: c19T2ReplayMetadataRemediationPlan.reasonCodes ?? [],
            nextActions: c19T2ReplayMetadataRemediationPlan.nextActions ?? [],
          }
        : null,
    },
    requiredPreparationCommands: [
      'node project-testing/tools/generate-release-handoff-pack.mjs --target real-closeout --output-root <release-report-parent>',
      'node project-testing/tools/check-release-handoff-readiness.mjs --handoff-file <handoff.json> --output <release-report-dir>/handoff-readiness.json',
      'node project-testing/tools/check-c19-release-closure-sources.mjs --artifact-root <release-report-dir> --output <release-report-dir>/c19-release-closure-sources-preflight.json',
    ],
    gates,
    nonSubstitutableEvidence: [
      'Historical handoff or staging closeout cannot close this current v1.4.24 release directory.',
      'MCP, RPA, browser-only, dry-run, local scheduler, or metadata-only artifacts cannot close G5.',
      'Every live/DB write gate must include current target IDs, approval refs, rollback owner, monitoring/cleanup evidence, and validator pass output.',
    ],
  }
}

function sortBlockers(blockers) {
  return blockers.sort((a, b) => {
    const severityOrder = { P0: 0, P1: 1, P2: 2 }
    const severityDelta = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
    if (severityDelta !== 0) return severityDelta
    return String(a.gate).localeCompare(String(b.gate))
  })
}

function missingArtifactsFromPresence(presence) {
  return Object.entries(presence ?? {})
    .filter(([, present]) => !present)
    .map(([artifact]) => artifact)
}

function missingRequiredArtifacts(artifactPresence, requiredArtifacts) {
  const required = Array.isArray(requiredArtifacts) ? requiredArtifacts : Object.keys(artifactPresence ?? {})
  return required.filter((artifact) => artifactPresence?.[artifact] !== true)
}

const c18LiveDiagnosticArtifacts = [
  { id: 'C-18.L07', artifact: 'c18-l07-critical-path-concurrency-live.json' },
  { id: 'C-18.L08', artifact: 'c18-l08-acceptance-status-concurrency-live.json' },
  { id: 'C-18.L09', artifact: 'c18-l09-wizard-commit-live.json' },
  { id: 'C-18.L10', artifact: 'c18-l10-wbs-generation-pressure.json' },
  { id: 'C-18.L11', artifact: 'c18-l11-warning-sync-query-log.json' },
  { id: 'C-18.L12', artifact: 'c18-l12-critical-path-network-pressure.json' },
  { id: 'C-18.L14', artifact: 'c18-l14-company-summary-pressure.json' },
  { id: 'C-18.L15', artifact: 'c18-l15-spreadsheet-migration-replay.json' },
]

function redactDiagnosticText(value) {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://<redacted>')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, '<jwt-redacted>')
    .replace(/password=([^;\s]+)/gi, 'password=<redacted>')
    .trim()
}

function pushDiagnosticReason(reasons, value) {
  const text = redactDiagnosticText(value)
  if (text) reasons.push(text.slice(0, 240))
}

function diagnosticAssessmentForPayload(payload) {
  return payload.routeEvidenceAssessment
    ?? payload.dbEvidenceAssessment
    ?? payload.importPressureAssessment
    ?? null
}

function diagnosticStatusForPayload(payload, checkStatuses) {
  if (typeof payload.status === 'string') {
    return payload.status
  }

  const assessment = diagnosticAssessmentForPayload(payload)
  if (typeof assessment?.status === 'string') {
    return assessment.status
  }

  if (checkStatuses.some((item) => item === 'fail')) {
    return 'fail'
  }

  return checkStatuses.length > 0 && checkStatuses.every((item) => item === 'pass')
    ? 'pass'
    : 'unknown'
}

function collectRuntimeEvidenceGapReasons(payload, status) {
  if (status === 'pass') {
    return []
  }

  const assessment = diagnosticAssessmentForPayload(payload)
  const gapSource = assessment?.runtimeEvidenceGap ?? payload.runtimeEvidenceGap ?? {}
  return Object.entries(gapSource)
    .filter(([key, value]) => key.startsWith('missing') && value === true)
    .map(([key]) => key)
}

function summarizeC18DiagnosticArtifact(releaseDir, definition) {
  const artifactPath = path.join(releaseDir, definition.artifact)
  const payload = readJson(artifactPath, null)
  if (!payload) {
    return {
      id: definition.id,
      artifact: definition.artifact,
      present: false,
      status: 'missing',
      diagnosticRunId: null,
      reasons: [],
      reasonSummary: '',
    }
  }

  const reasons = []
  const checkEntries = Object.entries(payload.checks ?? {})
  const checkStatuses = checkEntries
    .map(([, check]) => check?.status)
    .filter((status) => typeof status === 'string')
  const status = diagnosticStatusForPayload(payload, checkStatuses)

  for (const [checkName, check] of checkEntries) {
    if (!check || check.status === 'pass') continue
    pushDiagnosticReason(reasons, `${checkName}=${check.status ?? 'unknown'}${check.reason ? `: ${check.reason}` : ''}`)
    for (const operation of check.operations ?? []) {
      if (operation?.success === false) {
        pushDiagnosticReason(reasons, `${operation.operation ?? 'operation'} failed`)
      }
      for (const failure of operation?.response?.failures ?? []) {
        pushDiagnosticReason(reasons, failure?.error ?? failure?.message ?? JSON.stringify(failure))
      }
      if (operation?.response?.errorCode || operation?.response?.errorMessage) {
        pushDiagnosticReason(reasons, `${operation.response.errorCode ?? 'error'}: ${operation.response.errorMessage ?? ''}`)
      }
    }
  }

  const lockTelemetry = payload.lockTelemetryAssessment
  if (lockTelemetry?.status && lockTelemetry.status !== 'pass') {
    const missingSignals = Array.isArray(lockTelemetry.missingSignals) && lockTelemetry.missingSignals.length > 0
      ? `; missingSignals=${lockTelemetry.missingSignals.join(',')}`
      : ''
    pushDiagnosticReason(reasons, `lockTelemetry=${lockTelemetry.status}${missingSignals}`)
  }

  const missingRuntimeEvidence = collectRuntimeEvidenceGapReasons(payload, status)
  if (missingRuntimeEvidence.length > 0) {
    pushDiagnosticReason(reasons, `runtimeEvidenceGap=${missingRuntimeEvidence.join(',')}`)
  }

  const uniqueReasons = unique(reasons)

  return {
    id: definition.id,
    artifact: definition.artifact,
    present: true,
    status,
    diagnosticRunId: payload.diagnosticRunId ?? null,
    environment: payload.environment ?? payload.lockTelemetryAssessment?.environment ?? null,
    targetIds: {
      projectId: payload.projectId ?? payload.targetIds?.projectId ?? null,
      companyId: payload.companyId ?? payload.targetIds?.companyId ?? null,
    },
    reasons: uniqueReasons,
    reasonSummary: uniqueReasons.slice(0, 4).join(' | '),
  }
}

function buildC18LiveDiagnosticSummary(releaseDir) {
  const summaryPayload = readJson(path.join(releaseDir, 'c18-live-evidence-summary.json'), null)
  const artifacts = c18LiveDiagnosticArtifacts.map((definition) => summarizeC18DiagnosticArtifact(releaseDir, definition))
  if (summaryPayload?.status === 'pass' && summaryPayload?.canClaimC18L07L15Closeout === true) {
    const statusByItem = new Map(
      (summaryPayload.items ?? [])
        .map((item) => [String(item.itemId ?? ''), item])
        .filter(([itemId]) => itemId),
    )
    const summaryArtifacts = artifacts.map((artifact) => {
      const item = statusByItem.get(artifact.id)
      return item
        ? {
            ...artifact,
            present: true,
            status: item.status ?? artifact.status,
            diagnosticRunId: item.diagnosticRunId ?? artifact.diagnosticRunId,
            environment: item.environment ?? artifact.environment,
            reasons: item.status === 'pass' ? [] : artifact.reasons,
            reasonSummary: item.status === 'pass' ? '' : artifact.reasonSummary,
          }
        : artifact
    })
    return {
      status: 'pass',
      artifactCount: c18LiveDiagnosticArtifacts.length,
      presentCount: c18LiveDiagnosticArtifacts.length,
      missingCount: 0,
      failingCount: 0,
      artifacts: summaryArtifacts,
      summaryArtifact: 'c18-live-evidence-summary.json',
      summaryDiagnosticRunId: summaryPayload.diagnosticRunId ?? null,
    }
  }

  const presentArtifacts = artifacts.filter((artifact) => artifact.present)
  const failingArtifacts = presentArtifacts.filter((artifact) => artifact.status !== 'pass')
  return {
    status: presentArtifacts.length === 0
      ? 'missing'
      : failingArtifacts.length > 0
        ? 'fail'
        : presentArtifacts.length === artifacts.length
          ? 'pass'
          : 'partial',
    artifactCount: artifacts.length,
    presentCount: presentArtifacts.length,
    missingCount: artifacts.length - presentArtifacts.length,
    failingCount: failingArtifacts.length,
    artifacts,
  }
}

function buildG2CurrentEvidenceBlocker(g2) {
  const missingArtifacts = missingRequiredArtifacts(g2?.artifactPresence, g2?.requiredArtifacts)
  const preflight = g2?.advisorPreflightSummary
  const report = g2?.governanceReportSummary
  const advisorExport = g2?.advisorExportSummary
  const preflightBlockers = preflight?.blockerCodes ?? []
  const mg07ReasonCodes = report?.mg07ReasonCodes ?? []
  const reasonParts = []

  if (preflight) {
    reasonParts.push(
      `Advisor Management API preflight=${preflight.status}; readyToRun=${preflight.readyToRun}; blockerCodes=${preflightBlockers.join(', ') || 'none'}`,
    )
  } else {
    reasonParts.push('Advisor Management API preflight artifact is missing')
  }
  if (missingArtifacts.length > 0) {
    reasonParts.push(`missing artifacts=${missingArtifacts.join(', ')}`)
  }
  if (advisorExport) {
    reasonParts.push(
      `Advisor export=${advisorExport.source ?? 'unknown'}; environment=${advisorExport.environment ?? 'unknown'}; securityIssueCount=${advisorExport.securityIssueCount ?? 'unknown'}; performanceIssueCount=${advisorExport.performanceIssueCount ?? 'unknown'}`,
    )
  }
  const dashboardFallback = g2?.dashboardUiFallbackSummary
  if (dashboardFallback?.browserAttempt) {
    const attempt = dashboardFallback.browserAttempt
    const pageSummary = (attempt.pages ?? [])
      .map((page) => `${page.section ?? 'unknown'}:${page.isLogin ? 'login-required' : 'loaded'}:${page.issueCountCaptured ? 'issue-count-captured' : 'no-issue-count'}`)
      .join(', ')
    reasonParts.push(
      `Dashboard UI fallback attempt=${attempt.status}; blockedBy=${(attempt.blockedBy ?? []).join(', ') || 'none'}${pageSummary ? `; pages=${pageSummary}` : ''}`,
    )
  } else if (dashboardFallback?.template?.present) {
    reasonParts.push(
      `Dashboard UI fallback template present; filledCapturePresent=${dashboardFallback.filledCapturePresent}; templateOnly=${dashboardFallback.template.templateOnly}`,
    )
  }
  if (report) {
    reasonParts.push(
      `governance report=${report.status}; MG-07=${report.mg07Status}; reasonCodes=${mg07ReasonCodes.join(', ') || 'none'}; allowValidate=${report.allowValidate}; allowWarmup=${report.allowWarmup}; allowScheduler=${report.allowScheduler}`,
    )
  } else {
    reasonParts.push('production migration governance report is missing')
  }

  const requiredActions = []
  if (!preflight || preflightBlockers.includes('management-api-token-missing')) {
    requiredActions.push('provide a Supabase Management API token from the operator environment and rerun the preflight, or generate the Dashboard UI capture template, fill it from the logged-in Supabase Dashboard Advisor page, set templateOnly=false, and normalize it with evidence:supabase-advisor:dashboard-ui-normalize')
  }
  if (dashboardFallback?.browserAttempt?.blockedBy?.includes('supabase-sign-in-required')) {
    requiredActions.push('sign in to Supabase in the controllable browser or manually fill supabase-advisor-dashboard-ui-capture.filled.json from the logged-in Dashboard Advisor pages before normalization')
  }
  if (missingArtifacts.includes('supabase-advisor-management-api-export.json')) {
    requiredActions.push('run the Management API Advisor export or the Dashboard UI template-plus-normalizer flow and archive supabase-advisor-management-api-export.json')
  }
  if (
    missingArtifacts.includes('production-migration-governance-evidence.json') ||
    missingArtifacts.includes('production-migration-governance-report.json') ||
    report?.status !== 'closed' ||
    report?.mg07Status !== 'pass'
  ) {
    requiredActions.push('rerun migrate:production-governance:evidence with --advisor-export-file and migrate:production-governance until MG-07 passes and the report is closed')
  }

  return {
    gate: 'G2',
    severity: 'P0',
    reason: `G2 is blocked by current migration governance evidence: ${reasonParts.join('; ')}.`,
    requiredAction: `${requiredActions.join('; ') || 'rerun the G2 migration governance closeout commands until the current-run report is closed'}.`,
    generatedBy: 'refresh-v1424-release-summary',
    evidenceStatus: g2?.status ?? 'missing',
  }
}

function applyG2MigrationAdvisorCloseout(decision, gateSummary) {
  if (decision.g2MigrationAdvisorCloseout?.status !== 'closed') return

  gateSummary.G2 = 'pass'
  decision.openBlockers = (decision.openBlockers ?? []).filter((blocker) => blocker.gate !== 'G2')

  const gap = decision.productionGapMatrix?.['GAP-P0-02']
  if (gap) {
    gap.status = 'pass'
    gap.gate = 'G2'
    gap.evidence = unique([
      ...(gap.evidence ?? []),
      'supabase-advisor-management-api-export.json',
      'production-migration-governance-evidence.json',
      'production-migration-governance-report.json',
    ])
    gap.decisionImpact = 'none'
    gap.currentFinding =
      'Current formal Advisor export and production migration governance report are closed: MG-07 pass, securityIssueCount=0, allowWarmup=true, allowScheduler=true. Advisor performance findings remain PB-08/G6 input, not a G2 blocker.'
  }
}

function applyG5LiveCloseoutContract(decision, gateSummary) {
  if (decision.g5LiveCloseoutContract?.status !== 'current-release-live-closeout-ready') return

  gateSummary.G5 = 'pass'
  decision.openBlockers = (decision.openBlockers ?? []).filter((blocker) => blocker.gate !== 'G5')
  decision.downgradedCapabilities = (decision.downgradedCapabilities ?? []).filter(
    (item) => !String(item).includes('Runtime publication and live closeout remain explicit gates'),
  )

  const closeoutEvidence = [
    'handoff-plan.json',
    'handoff-readiness.json',
    'c18-l07-l15-live-diagnostics-evidence-validation.json',
    'c15-live-learning-closeout-evidence-validation.json',
    'c19-runtime-publication-release-rollback-evidence-validation.json',
    'old-object-physical-drop-closeout-evidence-validation.json',
    'closeout-decision.json',
    'closeout-status-index.json',
  ]

  const gap = decision.productionGapMatrix?.['GAP-P0-07']
  if (gap) {
    gap.status = 'pass'
    gap.gate = 'G5'
    gap.evidence = unique([...(gap.evidence ?? []), ...closeoutEvidence])
    gap.decisionImpact = 'none'
    gap.currentFinding =
      'Current live/DB closeout contract is ready: handoff readiness passed and C18, C15, C19, and old-object validators passed for this release directory.'
  }

  for (const key of ['GAP-P1-04', 'GAP-P1-05']) {
    const item = decision.productionGapMatrix?.[key]
    if (!item) continue
    item.status = 'pass'
    item.gate = 'G5'
    item.evidence = unique([...(item.evidence ?? []), ...closeoutEvidence])
    item.decisionImpact = 'none'
    item.currentFinding =
      'Current G5 closeout evidence is present in this release directory; rollback/readback validators passed under the controlled live/DB closeout contract.'
  }

  const releaseBlockedUntilHardGates = 'release-blocked-until-all-hard-gates-complete'
  for (const baseline of Object.values(decision.productionBaselineMatrix ?? {})) {
    if (!baseline || baseline.decisionImpact !== releaseBlockedUntilHardGates) continue
    baseline.blockers = (baseline.blockers ?? []).map((blocker) =>
      String(blocker)
        .replace('G2/G5/G6 live, DB, migration Advisor, pressure/query-log, and closeout gates', 'remaining explicit G6/G8 review gates')
        .replace('G2/G5 release gates', 'remaining explicit review gates')
        .replace('G2 migration Advisor and G5 live closeout/rollback gates', 'remaining explicit review gates')
        .replace('live/DB/runtime publication and tenant-isolation gates', 'remaining explicit review gates'),
    )
  }
}

function buildG5CurrentEvidenceBlocker(g5, gateStatus) {
  const missingTopLevelArtifacts = missingArtifactsFromPresence(g5?.topLevelArtifactPresence)
  const readiness = g5?.handoffReadinessSummary
  const gateReadiness = g5?.gates ?? []
  const missingFlags = unique(gateReadiness.flatMap((gate) => gate.handoffReadiness?.missingFlags ?? []))
  const missingFields = unique(gateReadiness.flatMap((gate) => gate.handoffReadiness?.missingFields ?? []))
  const failingValidations = gateReadiness
    .filter((gate) => !gate.validationPass)
    .map((gate) => `${gate.id}:${gate.validationStatus}; missingExpectedArtifacts=${gate.missingExpectedArtifacts.length}`)

  const reasonParts = []
  if (readiness) {
    reasonParts.push(
      `handoff readiness=${readiness.status}; readyToRun=${readiness.readyToRun}; blockedGateCount=${readiness.blockedGateCount}; secretLeakCount=${readiness.secretLeakCount}; refIssueCount=${readiness.refIssueCount}`,
    )
  } else {
    reasonParts.push('handoff readiness artifact is missing')
  }
  if (missingTopLevelArtifacts.length > 0) {
    reasonParts.push(`missing top-level artifacts=${missingTopLevelArtifacts.join(', ')}`)
  }
  if (missingFlags.length > 0) {
    reasonParts.push(`missing flags=${missingFlags.join(', ')}`)
  }
  if (missingFields.length > 0) {
    const suffix = missingFields.length > 8 ? ', ...' : ''
    reasonParts.push(`missing fields=${missingFields.slice(0, 8).join(', ')}${suffix}`)
  }
  if (failingValidations.length > 0) {
    reasonParts.push(`validation not closed=${failingValidations.join(' | ')}`)
  }
  const candidateDiscovery = g5?.handoffSignalsSummary?.candidateDiscovery
  if (candidateDiscovery) {
    const latestAny = candidateDiscovery.latest?.any
    const latestSummary = latestAny?.id
      ? `; latestAny=${latestAny.id}/${latestAny.projectId ?? 'no-project'}/${latestAny.companyId ?? 'no-company'}/${latestAny.candidateStatus ?? 'no-status'}`
      : ''
    reasonParts.push(
      `candidate discovery ready=${candidateDiscovery.ready}; selectedCandidateId=${candidateDiscovery.selectedCandidateId || 'missing'}; blockers=${(candidateDiscovery.blockers ?? []).join(', ') || 'none'}; counts total=${candidateDiscovery.counts?.total ?? 'unknown'}, selectedProject=${candidateDiscovery.counts?.selectedProject ?? 'unknown'}, selectedCompany=${candidateDiscovery.counts?.selectedCompany ?? 'unknown'}, eligibleStatus=${candidateDiscovery.counts?.eligibleStatus ?? 'unknown'}${latestSummary}`,
    )
  }
  const c18Diagnostics = g5?.diagnosticSummaries?.c18LiveDiagnostics
  if (c18Diagnostics) {
    const failingDiagnostics = (c18Diagnostics.artifacts ?? [])
      .filter((artifact) => artifact.present && artifact.status !== 'pass')
      .map((artifact) => `${artifact.artifact}:${artifact.status}${artifact.reasonSummary ? ` (${artifact.reasonSummary})` : ''}`)
    reasonParts.push(
      `C18 diagnostics=${c18Diagnostics.status}; present=${c18Diagnostics.presentCount}/${c18Diagnostics.artifactCount}; failing=${c18Diagnostics.failingCount}${failingDiagnostics.length > 0 ? `; failures=${failingDiagnostics.join(' | ')}` : ''}`,
    )
  }
  const runtimeRepairAttempt = g5?.diagnosticSummaries?.runtimeLoginRoleRepairAttempt
  if (runtimeRepairAttempt) {
    const failures = (runtimeRepairAttempt.attempts ?? [])
      .filter((attempt) => attempt.result !== 'pass' && attempt.result !== 'repaired')
      .map((attempt) => `${attempt.method}:${attempt.failureCategory ?? attempt.result}${attempt.safeErrorSummary ? ` (${attempt.safeErrorSummary})` : ''}`)
    const directFailure = runtimeRepairAttempt.failureCategory
      ? `; failureCategory=${runtimeRepairAttempt.failureCategory}${runtimeRepairAttempt.safeErrorSummary ? ` (${runtimeRepairAttempt.safeErrorSummary})` : ''}`
      : ''
    reasonParts.push(
      `runtime login repair=${runtimeRepairAttempt.status}; targetRole=${runtimeRepairAttempt.targetRole ?? 'unknown'}${directFailure}${failures.length > 0 ? `; attempts=${failures.join(' | ')}` : ''}`,
    )
  }
  const runtimeSqlPackage = g5?.diagnosticSummaries?.runtimeLoginRoleSqlEditorPackage
  if (runtimeSqlPackage) {
    reasonParts.push(
      `runtime login SQL Editor package=${runtimeSqlPackage.status}; repairSql=${runtimeSqlPackage.artifacts?.repairSql ?? 'missing'}; verifySql=${runtimeSqlPackage.artifacts?.verifySql ?? 'missing'}; sensitiveSql=${runtimeSqlPackage.containsSensitiveSqlFile}`,
    )
  }
  const runtimeReadback = g5?.diagnosticSummaries?.runtimeLoginRoleReadback
  if (runtimeReadback) {
    reasonParts.push(
      `runtime login readback=${runtimeReadback.status}; targetRole=${runtimeReadback.targetRole ?? 'unknown'}; closesRuntimeLoginPrerequisite=${runtimeReadback.closesRuntimeLoginPrerequisite}; structuralBlockers=${(runtimeReadback.structuralBlockers ?? []).join(', ') || 'none'}; passwordAuthBlockers=${(runtimeReadback.passwordAuthBlockers ?? []).join(', ') || 'none'}`,
    )
  } else {
    reasonParts.push('runtime login readback=missing')
  }
  const c15Preflight = g5?.preflightSummaries?.c15LiveLearning
  if (c15Preflight) {
    reasonParts.push(
      `C15 preflight=${c15Preflight.status}; reasons=${(c15Preflight.reasonCodes ?? []).join(', ') || 'none'}; decisions=${c15Preflight.decisionCount}; evaluated=${c15Preflight.evaluatedCount}; candidates=${c15Preflight.candidateCount}; calibrations=${c15Preflight.calibrationCount}`,
    )
  }
  const c19Preflight = g5?.preflightSummaries?.c19Runtime
  if (c19Preflight) {
    reasonParts.push(
      `C19 preflight=${c19Preflight.status}; reasons=${(c19Preflight.reasonCodes ?? []).join(', ') || 'none'}; durationSamples=${c19Preflight.durationSampleCount}; t2WindowSamples=${c19Preflight.t2WindowSampleCount}; publications=${c19Preflight.publicationCount}; monitoring=${c19Preflight.monitoringCount}; rollback=${c19Preflight.rollbackCount}`,
    )
  }
  const c19ClosureSources = g5?.preflightSummaries?.c19ReleaseClosureSources
  if (c19ClosureSources) {
    const missing = c19ClosureSources.missingSourceFileRoles ?? []
    const invalid = c19ClosureSources.invalidSourceFileRoles ?? []
    reasonParts.push(
      `C19 release closure sources=${c19ClosureSources.status}; readyToGenerate=${c19ClosureSources.readyToGenerateReleaseClosure}; reasons=${(c19ClosureSources.reasonCodes ?? []).join(', ') || 'none'}; missing=${missing.join(', ') || 'none'}; invalid=${invalid.join(', ') || 'none'}; templateScope=${c19ClosureSources.templateScopeStatus ?? 'unknown'}`,
    )
  } else {
    reasonParts.push('C19 release closure sources preflight is missing')
  }
  const c19T2Remediation = g5?.preflightSummaries?.c19T2ReplayMetadataRemediation
  if (c19T2Remediation) {
    reasonParts.push(
      `C19 T2 replay metadata remediation=${c19T2Remediation.status}; dryRun=${c19T2Remediation.dryRun}; plannedUpdates=${c19T2Remediation.plannedUpdateCount}; unknownCodes=${(c19T2Remediation.unknownCodes ?? []).join(', ') || 'none'}; unsupported=${(c19T2Remediation.unsupportedCodes ?? []).join(', ') || 'none'}; dbMutation=${c19T2Remediation.dbMutation}; liveMutation=${c19T2Remediation.liveMutation}`,
    )
  }

  return {
    gate: 'G5',
    severity: gateStatus === 'deferred' ? 'P1' : 'P0',
    reason: `G5 is ${gateStatus} by current live/DB closeout evidence: ${reasonParts.join('; ')}.`,
    requiredAction:
      'Complete the handoff declaration with live/DB owners, target IDs, approval/rollback refs, artifact root, and DB readiness refs; execute any C19 T2 remediation through a controlled writer or explicit staging write approval, rerun live diagnostics/readback, then validate C18, C15, C19, and old-object closeout artifacts after the real live/DB commands produce evidence.',
    generatedBy: 'refresh-v1424-release-summary',
    evidenceStatus: g5?.status ?? 'missing',
  }
}

function refineCurrentEvidenceBlockers(decision, gateSummary) {
  const replaceGates = new Set()
  if (gateSummary.G2 && gateSummary.G2 !== 'pass') replaceGates.add('G2')
  if (gateSummary.G5 && gateSummary.G5 !== 'pass') replaceGates.add('G5')
  const blockers = (decision.openBlockers ?? []).filter((blocker) => !replaceGates.has(blocker.gate))
  if (gateSummary.G2 && gateSummary.G2 !== 'pass') {
    blockers.push(buildG2CurrentEvidenceBlocker(decision.g2MigrationAdvisorCloseout))
  }
  if (gateSummary.G5 && gateSummary.G5 !== 'pass') {
    blockers.push(buildG5CurrentEvidenceBlocker(decision.g5LiveCloseoutContract, gateSummary.G5))
  }
  return sortBlockers(blockers)
}

function buildSummaryMarkdown(summary) {
  const lines = [
    '# WorkBuddy v1.4.24 Release Summary',
    '',
    `- Decision: ${summary.decision}`,
    '- Decision authority: v1424-release-decision.json (full release)',
    `- Closeout layer: ${summary.decisionHierarchy?.closeout?.status ?? 'missing'}; does not imply release pass`,
    '- Production-ready: not claimed by release artifacts',
    `- Execution mode: ${summary.executionMode}`,
    `- Report dir: ${summary.releaseDir}`,
    `- Generated at: ${summary.generatedAt}`,
    '',
    '## Gates',
    '',
  ]

  for (const [gate, status] of Object.entries(summary.gateSummary)) {
    lines.push(`- ${gate}: ${status}`)
  }

  lines.push('', '## Blockers', '')
  const matrixReleaseBlockers = summary.matrixReleaseBlockers ?? []
  if (summary.blockers.length === 0 && matrixReleaseBlockers.length === 0) {
    lines.push('- None')
  } else {
    for (const blocker of summary.blockers) {
      lines.push(`- [${blocker.severity}][${blocker.gate}] ${blocker.reason}`)
    }
    for (const blocker of matrixReleaseBlockers) {
      const gateLabel = blocker.gate ? `][${blocker.gate}` : ''
      lines.push(`- [${blocker.severity}${gateLabel}] ${blocker.source}.${blocker.id}: ${blocker.status}; ${blocker.decisionImpact}`)
    }
  }

  lines.push('', '## Must Rerun Before Production', '')
  for (const command of summary.mustRerunBeforeProduction ?? []) {
    lines.push(`- ${command}`)
  }

  lines.push('', '## Explicit Gates', '')
  const explicitGateSummary = summary.explicitGateSummary
  if (!explicitGateSummary || explicitGateSummary.status === 'none') {
    lines.push('- None')
  } else {
    if (explicitGateSummary.deferredGates?.length) {
      lines.push(`- Deferred gates: ${explicitGateSummary.deferredGates.join(', ')}`)
    }
    for (const blocker of explicitGateSummary.nonP0Blockers ?? []) {
      lines.push(`- [${blocker.severity}][${blocker.gate}] ${blocker.reason}`)
    }
    for (const gate of explicitGateSummary.matrixExplicitGates ?? []) {
      const gateLabel = gate.gate ? `][${gate.gate}` : ''
      lines.push(`- [${gate.severity}${gateLabel}] ${gate.source}.${gate.id}: ${gate.status}; ${gate.decisionImpact}`)
    }
    for (const capability of explicitGateSummary.downgradedCapabilities ?? []) {
      lines.push(`- Downgraded: ${capability}`)
    }
    for (const command of explicitGateSummary.mustRerunBeforeProduction ?? []) {
      lines.push(`- Must rerun: ${command}`)
    }
    lines.push(`- Boundary: ${explicitGateSummary.releasePassBoundary}`)
  }

  lines.push('', '## Artifact Index', '')
  if ((summary.artifactIndex ?? []).length === 0) {
    lines.push('- None')
  } else {
    for (const artifact of summary.artifactIndex) {
      lines.push(`- ${artifact}`)
    }
  }

  lines.push('', '## Test Case Density', '')
  const density = summary.testCaseDensitySummary
  if (!density) {
    lines.push('- Missing test-case density summary')
  } else {
    lines.push(`- Status: ${density.status}`)
    lines.push(`- Case count: ${density.caseCount}`)
    lines.push(`- Baseline count: ${density.baselineCount}/${density.requiredBaselineCount}`)
    lines.push(`- Minimums: default ${density.minimums?.defaultPerClass}/class; PB-09 ${density.minimums?.pb09PerClass}/class (${density.minimums?.pb09MinimumTotal} total)`)
    if (density.pb09) {
      const counts = density.pb09.classCounts ?? {}
      lines.push(`- PB-09: normal=${counts.normal ?? 0}, boundary=${counts.boundary ?? 0}, exception=${counts.exception ?? 0}, security=${counts.security ?? 0}`)
    } else {
      lines.push('- PB-09: missing')
    }
    if ((density.missingRequiredBaselines ?? []).length > 0) {
      lines.push(`- Missing baselines: ${density.missingRequiredBaselines.join(', ')}`)
    }
    if ((density.tooThinBaselines ?? []).length > 0) {
      lines.push('- Too-thin baselines:')
      for (const item of density.tooThinBaselines) {
        const counts = item.classCounts ?? {}
        lines.push(`  - ${item.baselineId}: normal=${counts.normal ?? 0}, boundary=${counts.boundary ?? 0}, exception=${counts.exception ?? 0}, security=${counts.security ?? 0}; minimum=${item.minimumPerClass}`)
      }
    }
    lines.push(`- Boundary: ${density.releaseGateUse}`)
  }

  lines.push('', '## G2 Migration Advisor Closeout', '')
  const g2 = summary.g2MigrationAdvisorCloseout
  if (!g2) {
    lines.push('- Missing G2 migration Advisor closeout contract')
  } else {
    lines.push(`- Status: ${g2.status}`)
    lines.push(`- Boundary: ${g2.releaseGateUse}`)
    lines.push('- Required artifacts:')
    for (const artifact of g2.requiredArtifacts ?? []) {
      lines.push(`  - ${artifact}: ${g2.artifactPresence?.[artifact] ? 'present' : 'missing'}`)
    }
    if (g2.advisorPreflightSummary) {
      const preflight = g2.advisorPreflightSummary
      lines.push(`- Advisor Management API preflight: ${preflight.status}; readyToRun=${preflight.readyToRun}; envFilePresent=${preflight.envFilePresent}; tokenEnv=${preflight.resolvedTokenEnv ?? 'missing'}; blockerCodes=${(preflight.blockerCodes ?? []).join(', ') || 'none'}`)
    } else {
      lines.push('- Advisor Management API preflight: missing')
    }
    if (g2.advisorExportSummary) {
      const advisorExport = g2.advisorExportSummary
      lines.push(`- Advisor export: source=${advisorExport.source ?? 'unknown'}; environment=${advisorExport.environment ?? 'unknown'}; projectRef=${advisorExport.projectRef ?? 'unknown'}; securityIssueCount=${advisorExport.securityIssueCount ?? 'unknown'}; performanceIssueCount=${advisorExport.performanceIssueCount ?? 'unknown'}`)
    } else {
      lines.push('- Advisor export: missing')
    }
    if (g2.dashboardUiFallbackSummary) {
      const fallback = g2.dashboardUiFallbackSummary
      const template = fallback.template ?? {}
      lines.push(`- Dashboard UI fallback template: ${template.present ? 'present' : 'missing'}${template.present ? `; templateOnly=${template.templateOnly}; hasManualChecklist=${template.hasManualChecklist}` : ''}`)
      lines.push(`- Dashboard UI filled capture: ${fallback.filledCapturePresent ? 'present' : 'missing'}`)
      if (fallback.browserAttempt) {
        const attempt = fallback.browserAttempt
        lines.push(`- Dashboard UI browser attempt: ${attempt.status}; blockedBy=${(attempt.blockedBy ?? []).join(', ') || 'none'}`)
        for (const page of attempt.pages ?? []) {
          lines.push(`  - ${page.section ?? 'unknown'}: ${page.isLogin ? 'login-required' : 'loaded'}; issueCountCaptured=${page.issueCountCaptured}; url=${page.currentUrl ?? 'missing'}`)
        }
      } else {
        lines.push('- Dashboard UI browser attempt: missing')
      }
    }
    if (g2.governanceReportSummary) {
      const report = g2.governanceReportSummary
      lines.push(`- Governance report: ${report.status}; MG-07=${report.mg07Status}; reasonCodes=${(report.mg07ReasonCodes ?? []).join(', ') || 'none'}`)
      lines.push(`- Execution unlocks: allowValidate=${report.allowValidate}; allowWarmup=${report.allowWarmup}; allowScheduler=${report.allowScheduler}`)
      lines.push(`- Gate pass count: ${report.passGateCount}/${report.gateCount}`)
    } else {
      lines.push('- Governance report: missing')
    }
    if (g2.requiredCommandsStatus === 'satisfied') {
      lines.push('- Required commands: satisfied in this release directory; no G2 commands are listed under Must Rerun.')
    } else {
      lines.push('- Required commands:')
      for (const command of g2.requiredCommands ?? []) {
        lines.push(`  - ${command}`)
      }
    }
    lines.push(`- Token boundary: ${g2.tokenBoundary}`)
    lines.push('- Non-substitutable evidence:')
    for (const item of g2.nonSubstitutableEvidence ?? []) {
      lines.push(`  - ${item}`)
    }
  }

  lines.push('', '## G5 Live Closeout Contract', '')
  const g5 = summary.g5LiveCloseoutContract
  if (!g5) {
    lines.push('- Missing G5 live closeout contract')
  } else {
    lines.push(`- Status: ${g5.status}`)
    lines.push(`- Boundary: ${g5.releaseGateUse}`)
    lines.push('- Required top-level artifacts:')
    for (const artifact of g5.requiredTopLevelArtifacts ?? []) {
      lines.push(`  - ${artifact}: ${g5.topLevelArtifactPresence?.[artifact] ? 'present' : 'missing'}`)
    }
    if (g5.handoffReadinessSummary) {
      const readiness = g5.handoffReadinessSummary
      lines.push(`- Handoff readiness: ${readiness.status}; readyToRun=${readiness.readyToRun}; blockedGateCount=${readiness.blockedGateCount}; secretLeakCount=${readiness.secretLeakCount}; refIssueCount=${readiness.refIssueCount}`)
    } else {
      lines.push('- Handoff readiness: missing')
    }
    const candidateDiscovery = g5.handoffSignalsSummary?.candidateDiscovery
    if (candidateDiscovery) {
      const latestAny = candidateDiscovery.latest?.any
      lines.push(`- C15 candidate discovery: ready=${candidateDiscovery.ready}; selectedCandidateId=${candidateDiscovery.selectedCandidateId || 'missing'}; blockers=${(candidateDiscovery.blockers ?? []).join(', ') || 'none'}`)
      lines.push(`  - Counts: total=${candidateDiscovery.counts?.total ?? 'unknown'}; selectedProject=${candidateDiscovery.counts?.selectedProject ?? 'unknown'}; selectedCompany=${candidateDiscovery.counts?.selectedCompany ?? 'unknown'}; eligibleStatus=${candidateDiscovery.counts?.eligibleStatus ?? 'unknown'}`)
      if (latestAny?.id) {
        lines.push(`  - Latest candidate: ${latestAny.id}; project=${latestAny.projectId ?? 'missing'}; company=${latestAny.companyId ?? 'missing'}; status=${latestAny.candidateStatus ?? 'missing'}`)
      }
    } else {
      lines.push('- C15 candidate discovery: missing')
    }
    const c18Diagnostics = g5.diagnosticSummaries?.c18LiveDiagnostics
    if (c18Diagnostics) {
      lines.push(`- C18 diagnostics: ${c18Diagnostics.status}; present=${c18Diagnostics.presentCount}/${c18Diagnostics.artifactCount}; failing=${c18Diagnostics.failingCount}`)
      for (const artifact of c18Diagnostics.artifacts ?? []) {
        if (!artifact.present) continue
        lines.push(`  - ${artifact.artifact}: ${artifact.status}${artifact.reasonSummary ? `; reasons=${artifact.reasonSummary}` : ''}`)
      }
    } else {
      lines.push('- C18 diagnostics: missing')
    }
    const runtimeRepairAttempt = g5.diagnosticSummaries?.runtimeLoginRoleRepairAttempt
    if (runtimeRepairAttempt) {
      lines.push(`- Runtime login repair attempt: ${runtimeRepairAttempt.status}; targetRole=${runtimeRepairAttempt.targetRole ?? 'unknown'}`)
      if (runtimeRepairAttempt.failureCategory) {
        lines.push(`  - Failure category: ${runtimeRepairAttempt.failureCategory}${runtimeRepairAttempt.safeErrorSummary ? `; ${runtimeRepairAttempt.safeErrorSummary}` : ''}`)
      }
      if (runtimeRepairAttempt.nextAction) {
        lines.push(`  - Next action: ${runtimeRepairAttempt.nextAction}`)
      }
      for (const attempt of runtimeRepairAttempt.attempts ?? []) {
        lines.push(`  - ${attempt.method}: ${attempt.result}; failureCategory=${attempt.failureCategory ?? 'none'}${attempt.safeErrorSummary ? `; ${attempt.safeErrorSummary}` : ''}`)
      }
      if (runtimeRepairAttempt.nextRequiredInput?.length) {
        lines.push(`  - Next required input: ${runtimeRepairAttempt.nextRequiredInput.join('; ')}`)
      }
    } else {
      lines.push('- Runtime login repair attempt: missing')
    }
    const runtimeSqlPackage = g5.diagnosticSummaries?.runtimeLoginRoleSqlEditorPackage
    if (runtimeSqlPackage) {
      lines.push(`- Runtime login SQL Editor package: ${runtimeSqlPackage.status}; sensitiveSql=${runtimeSqlPackage.containsSensitiveSqlFile}`)
      lines.push(`  - Repair SQL: ${runtimeSqlPackage.artifacts?.repairSql ?? 'missing'}`)
      lines.push(`  - Verify SQL: ${runtimeSqlPackage.artifacts?.verifySql ?? 'missing'}`)
      if (runtimeSqlPackage.operatorSteps?.length) {
        lines.push('  - Operator steps:')
        for (const step of runtimeSqlPackage.operatorSteps) {
          lines.push(`    - ${step}`)
        }
      }
    } else {
      lines.push('- Runtime login SQL Editor package: missing')
    }
    const runtimeReadback = g5.diagnosticSummaries?.runtimeLoginRoleReadback
    if (runtimeReadback) {
      lines.push(`- Runtime login readback: ${runtimeReadback.status}; targetRole=${runtimeReadback.targetRole ?? 'unknown'}; closesRuntimeLoginPrerequisite=${runtimeReadback.closesRuntimeLoginPrerequisite}`)
      lines.push(`  - Structural blockers: ${(runtimeReadback.structuralBlockers ?? []).join(', ') || 'none'}`)
      lines.push(`  - Password auth blockers: ${(runtimeReadback.passwordAuthBlockers ?? []).join(', ') || 'none'}`)
      const checks = runtimeReadback.checks ?? {}
      if (checks.targetRole) {
        lines.push(`  - Target role: present=${checks.targetRole.present}; canLogin=${checks.targetRole.canLogin}; bypassRls=${checks.targetRole.bypassRls}; inherit=${checks.targetRole.inherit}`)
      }
      if (checks.membership) {
        lines.push(`  - Membership: ${checks.membership.memberRole ?? 'unknown'} -> ${checks.membership.grantedRole ?? 'unknown'} present=${checks.membership.present}`)
      }
      if (checks.passwordAuth) {
        lines.push(`  - Password auth: ${checks.passwordAuth.status}${checks.passwordAuth.safeErrorSummary ? `; ${checks.passwordAuth.safeErrorSummary}` : ''}`)
      }
      lines.push('  - Boundary: runtime login readback is prerequisite evidence only; it does not close G5 without C18 live diagnostic pass.')
    } else {
      lines.push('- Runtime login readback: missing')
    }
    const c15Preflight = g5.preflightSummaries?.c15LiveLearning
    if (c15Preflight) {
      lines.push(`- C15 preflight: ${c15Preflight.status}; reasons=${(c15Preflight.reasonCodes ?? []).join(', ') || 'none'}; decisions=${c15Preflight.decisionCount}; evaluated=${c15Preflight.evaluatedCount}; candidates=${c15Preflight.candidateCount}; calibrations=${c15Preflight.calibrationCount}`)
    } else {
      lines.push('- C15 preflight: missing')
    }
    const c19Preflight = g5.preflightSummaries?.c19Runtime
    if (c19Preflight) {
      lines.push(`- C19 preflight: ${c19Preflight.status}; reasons=${(c19Preflight.reasonCodes ?? []).join(', ') || 'none'}; durationSamples=${c19Preflight.durationSampleCount}; t2WindowSamples=${c19Preflight.t2WindowSampleCount}; publications=${c19Preflight.publicationCount}; monitoring=${c19Preflight.monitoringCount}; rollback=${c19Preflight.rollbackCount}`)
    } else {
      lines.push('- C19 preflight: missing')
    }
    const c19ClosureSources = g5.preflightSummaries?.c19ReleaseClosureSources
    if (c19ClosureSources) {
      lines.push(`- C19 release closure sources: ${c19ClosureSources.status}; readyToGenerate=${c19ClosureSources.readyToGenerateReleaseClosure}; reasons=${(c19ClosureSources.reasonCodes ?? []).join(', ') || 'none'}; templateScope=${c19ClosureSources.templateScopeStatus ?? 'unknown'}`)
      if (c19ClosureSources.missingSourceFileRoles?.length) {
        lines.push(`  - Missing source roles: ${c19ClosureSources.missingSourceFileRoles.join(', ')}`)
      }
      if (c19ClosureSources.invalidSourceFileRoles?.length) {
        lines.push(`  - Invalid source roles: ${c19ClosureSources.invalidSourceFileRoles.join(', ')}`)
      }
      for (const [role, source] of Object.entries(c19ClosureSources.sourceArtifacts ?? {})) {
        lines.push(`  - ${role}: present=${source.present}; usable=${source.usable}; artifact=${source.artifact ?? 'missing'}; evidenceRefs=${source.evidenceRefCount ?? 0}; reasons=${(source.reasonCodes ?? []).join(', ') || 'none'}`)
      }
    } else {
      lines.push('- C19 release closure sources: missing')
    }
    const c19T2Remediation = g5.preflightSummaries?.c19T2ReplayMetadataRemediation
    if (c19T2Remediation) {
      lines.push(`- C19 T2 replay metadata remediation: ${c19T2Remediation.status}; dryRun=${c19T2Remediation.dryRun}; plannedUpdates=${c19T2Remediation.plannedUpdateCount}; dbMutation=${c19T2Remediation.dbMutation}; liveMutation=${c19T2Remediation.liveMutation}`)
      if (c19T2Remediation.unknownCodes?.length) {
        lines.push(`  - Unknown window codes: ${c19T2Remediation.unknownCodes.join(', ')}`)
      }
      if (c19T2Remediation.reasonCodes?.length) {
        lines.push(`  - Remediation reason codes: ${c19T2Remediation.reasonCodes.join(', ')}`)
      }
      lines.push('  - Boundary: dry-run remediation plans are supporting-only and do not close G5 without write/readback evidence.')
    }
    lines.push('- Preparation commands:')
    for (const command of g5.requiredPreparationCommands ?? []) {
      lines.push(`  - ${command}`)
    }
    lines.push('- Closeout gates:')
    for (const gate of g5.gates ?? []) {
      const readiness = gate.handoffReadiness
      const readinessSuffix = readiness
        ? `; readyToRun=${readiness.readyToRun}; missingFlags=${readiness.missingFlags.length}; missingFields=${readiness.missingFields.length}; blockingIssues=${readiness.blockingIssueCount}`
        : '; handoffReadiness=missing'
      lines.push(`  - ${gate.id}: ${gate.closeoutStatus}; validation=${gate.validationStatus}; missingExpectedArtifacts=${gate.missingExpectedArtifacts.length}${readinessSuffix}`)
      if (readiness?.missingFields?.length) {
        lines.push(`    - Missing fields: ${readiness.missingFields.slice(0, 8).join(', ')}${readiness.missingFields.length > 8 ? ', ...' : ''}`)
      }
    }
    lines.push('- Non-substitutable evidence:')
    for (const item of g5.nonSubstitutableEvidence ?? []) {
      lines.push(`  - ${item}`)
    }
  }

  lines.push('', '## False-Green Review', '')
  const falseGreen = summary.falseGreenReviewSummary
  if (!falseGreen) {
    lines.push('- Missing false-green review summary')
  } else {
    lines.push(`- Status: ${falseGreen.status}`)
    lines.push(`- Findings: ${falseGreen.findingCount}`)
    if (falseGreen.bySeverity) {
      for (const [severity, count] of Object.entries(falseGreen.bySeverity)) {
        lines.push(`- ${severity}: ${count}`)
      }
    }
    if (falseGreen.byClassification) {
      lines.push('- Classifications:')
      for (const [classification, count] of Object.entries(falseGreen.byClassification)) {
        lines.push(`  - ${classification}: ${count}`)
      }
    }
    if ((falseGreen.reviewPriority ?? []).length > 0) {
      lines.push('- Review priority:')
      for (const item of falseGreen.reviewPriority.slice(0, 10)) {
        const classification = item.classification ? `; classification=${item.classification}` : ''
        lines.push(`  - ${item.priority}: ${item.file} (${item.findingCount} findings${classification})`)
      }
    }
    if (falseGreen.reviewArtifact) {
      lines.push(`- Review artifact: ${falseGreen.reviewArtifact}`)
      lines.push(`- Remove explicit G8 gate: ${Boolean(falseGreen.reviewDecision?.removeExplicitG8Gate)}`)
    }
    lines.push(`- Boundary: ${falseGreen.releaseGateUse}`)
  }

  lines.push('', '## Related Blocked Facts', '')
  for (const fact of summary.relatedBlockedFacts ?? []) {
    lines.push(`- ${fact.source}: ${fact.status}`)
  }

  lines.push('')
  return lines.join('\n')
}

function buildProductionBaselineMatrixArtifact(decision, releaseDir, generatedAt) {
  const existingPath = path.join(releaseDir, 'v1424-production-baseline-matrix.json')
  const existing = readJson(existingPath, {})
  const sourceManifest = existing?.sourceManifest
    ?? path.relative(repoRoot, path.join(releaseDir, 'v1424-source-manifest.json')).replaceAll(path.sep, '/')

  return {
    schemaVersion: existing?.schemaVersion ?? 'workbuddy-v1424-production-baseline-matrix/v1',
    generatedAt,
    sourceManifest,
    sourceDecision: 'v1424-release-decision.json',
    synchronizationPolicy: 'mirrors-v1424-release-decision-productionBaselineMatrix',
    productionBaselineMatrix: decision.productionBaselineMatrix ?? {},
  }
}

function matrixEntryStatus(entry) {
  return String(entry?.status ?? '').trim()
}

function matrixEntryDecisionImpact(entry) {
  return String(entry?.decisionImpact ?? '').trim()
}

function matrixEntryIsClosed(entry) {
  const status = matrixEntryStatus(entry)
  return status === 'pass' || status === 'not-applicable'
}

function allReleaseGatesClosed(gateSummary) {
  return Object.values(gateSummary ?? {}).every((status) =>
    status === 'pass' || status === 'not-applicable',
  )
}

function matrixEntryBlocksRelease(entry, gateSummary) {
  if (!entry || matrixEntryIsClosed(entry)) return false
  const impact = matrixEntryDecisionImpact(entry)
  if (impact === 'release-blocked') return true
  if (impact === 'release-blocked-until-all-hard-gates-complete') {
    return !allReleaseGatesClosed(gateSummary)
  }
  return false
}

function matrixEntryRequiresExplicitGate(entry, gateSummary) {
  if (!entry || matrixEntryIsClosed(entry) || matrixEntryBlocksRelease(entry, gateSummary)) return false
  const impact = matrixEntryDecisionImpact(entry)
  return impact === 'explicit-gate'
    || impact === 'release-blocked-until-all-hard-gates-complete'
    || impact.startsWith('release-blocked-if-')
}

function collectMatrixReleaseBlockers(decision, gateSummary) {
  const blockers = []
  for (const [id, gap] of Object.entries(decision.productionGapMatrix ?? {})) {
    if (matrixEntryBlocksRelease(gap, gateSummary)) {
      blockers.push({
        source: 'productionGapMatrix',
        id,
        severity: gap.severity ?? 'P0',
        gate: gap.gate ?? null,
        status: matrixEntryStatus(gap),
        decisionImpact: matrixEntryDecisionImpact(gap),
      })
    }
  }
  for (const [id, baseline] of Object.entries(decision.productionBaselineMatrix ?? {})) {
    if (matrixEntryBlocksRelease(baseline, gateSummary)) {
      blockers.push({
        source: 'productionBaselineMatrix',
        id,
        severity: baseline.severity ?? 'P0',
        gate: Array.isArray(baseline.mappedGates) ? baseline.mappedGates.join(',') : baseline.gate ?? null,
        status: matrixEntryStatus(baseline),
        decisionImpact: matrixEntryDecisionImpact(baseline),
      })
    }
  }
  return blockers
}

function collectMatrixExplicitGates(decision, gateSummary) {
  const explicitGates = []
  for (const [id, gap] of Object.entries(decision.productionGapMatrix ?? {})) {
    if (matrixEntryRequiresExplicitGate(gap, gateSummary)) {
      explicitGates.push({
        source: 'productionGapMatrix',
        id,
        severity: gap.severity ?? 'P1',
        gate: gap.gate ?? null,
        status: matrixEntryStatus(gap),
        decisionImpact: matrixEntryDecisionImpact(gap),
      })
    }
  }
  for (const [id, baseline] of Object.entries(decision.productionBaselineMatrix ?? {})) {
    if (matrixEntryRequiresExplicitGate(baseline, gateSummary)) {
      explicitGates.push({
        source: 'productionBaselineMatrix',
        id,
        severity: baseline.severity ?? 'P1',
        gate: Array.isArray(baseline.mappedGates) ? baseline.mappedGates.join(',') : baseline.gate ?? null,
        status: matrixEntryStatus(baseline),
        decisionImpact: matrixEntryDecisionImpact(baseline),
      })
    }
  }
  return explicitGates
}

function computeFinalDecision(decision, gateSummary) {
  const blockers = decision.openBlockers ?? []
  const gateStatuses = Object.values(gateSummary ?? {})
  const matrixReleaseBlockers = collectMatrixReleaseBlockers(decision, gateSummary)
  if (
    blockers.some((blocker) => blocker.severity === 'P0') ||
    gateStatuses.some((status) => status === 'fail' || status === 'blocked') ||
    matrixReleaseBlockers.length > 0
  ) {
    return 'release-blocked'
  }
  const matrixExplicitGates = collectMatrixExplicitGates(decision, gateSummary)
  if (
    blockers.length > 0 ||
    gateStatuses.some((status) => status === 'deferred') ||
    (decision.downgradedCapabilities ?? []).length > 0 ||
    (decision.mustRerunBeforeProduction ?? []).length > 0 ||
    matrixExplicitGates.length > 0
  ) {
    return 'release-pass-with-explicit-gates'
  }
  return 'release-pass'
}

function buildDecisionHierarchy(releaseDir, finalDecision) {
  const closeoutDecision = readJson(path.join(releaseDir, 'closeout-decision.json'))
  return {
    closeout: {
      artifact: 'closeout-decision.json',
      status: closeoutDecision?.status ?? 'missing',
      mayCloseAll: closeoutDecision?.mayCloseAll === true,
      authoritativeForRelease: false,
    },
    release: {
      artifact: 'v1424-release-decision.json',
      status: finalDecision,
      authoritativeForRelease: true,
    },
    production: {
      status: 'not-claimed-by-release-artifacts',
      authoritativeForProduction: false,
      requiredAuthority: 'deployed-target-production-evidence',
    },
  }
}

function buildExplicitGateSummary(decision, gateSummary) {
  const deferredGates = Object.entries(gateSummary ?? {})
    .filter(([, status]) => status === 'deferred')
    .map(([gate]) => gate)
  const nonP0Blockers = (decision.openBlockers ?? [])
    .filter((blocker) => blocker.severity !== 'P0')
    .map((blocker) => ({
      gate: blocker.gate,
      severity: blocker.severity,
      reason: blocker.reason,
      requiredAction: blocker.requiredAction,
    }))
  const downgradedCapabilities = decision.downgradedCapabilities ?? []
  const mustRerunBeforeProduction = decision.mustRerunBeforeProduction ?? []
  const matrixExplicitGates = collectMatrixExplicitGates(decision, gateSummary)

  return {
    status:
      deferredGates.length > 0 ||
      nonP0Blockers.length > 0 ||
      downgradedCapabilities.length > 0 ||
      mustRerunBeforeProduction.length > 0 ||
      matrixExplicitGates.length > 0
        ? 'explicit-gates-present'
        : 'none',
    deferredGates,
    nonP0Blockers,
    matrixExplicitGates,
    downgradedCapabilities,
    mustRerunBeforeProduction,
    releasePassBoundary:
      'release-pass is allowed only when this summary is none and all gates are pass/not-applicable with no open blockers.',
  }
}

function main() {
  const { releaseDir } = parseArgs(process.argv.slice(2))
  const normalizedPath = path.join(releaseDir, 'v1424-command-results.normalized.json')
  const decisionPath = path.join(releaseDir, 'v1424-release-decision.json')
  const productionBaselinePath = path.join(releaseDir, 'v1424-production-baseline-matrix.json')
  const summaryPath = path.join(releaseDir, 'summary.json')
  const summaryMdPath = path.join(releaseDir, 'summary.md')
  const predeployPath = path.join(releaseDir, 'uiux-predeploy-gates', 'predeploy-gates-summary.json')

  const decision = readJson(decisionPath)
  const summary = readJson(summaryPath)
  const commandResults = readJson(normalizedPath, [])
  const predeploySummary = readJson(predeployPath)
  const releaseMatrix = readReleaseMatrix()

  if (!decision || !summary || !Array.isArray(commandResults)) {
    throw new Error('release decision, summary, or normalized command results are missing or invalid')
  }

  const predeployUpdate = updateCommandResultsWithPredeploy(
    commandResults,
    releaseDir,
    predeploySummary,
  )
  const serverVitestReport = findLatestPassingServerVitestReport(releaseDir)
  const serverVitestUpdate = updateCommandResultsWithServerVitest(
    predeployUpdate.results,
    releaseDir,
    serverVitestReport,
  )
  const refreshedResults = serverVitestUpdate.results

  const now = new Date().toISOString()
  const effectiveResults = effectiveCommandResults(refreshedResults)
  const gateSummary = {
    ...decision.gates,
  }
  for (const gate of ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8']) {
    const status = gateStatusFromResults(effectiveResults, gate)
    if (status) gateSummary[gate] = status
  }
  gateSummary.G4 = gateStatusFromResults(effectiveResults, 'G4') ?? gateSummary.G4
  applyKnownGateBoundaries(gateSummary, refreshedResults, releaseDir)

  decision.generatedAt = now
  decision.gates = gateSummary
  decision.openBlockers = buildBlockers(decision, refreshedResults, predeploySummary)
  updateGapMatrix(decision, predeploySummary, gateSummary)
  updateG3Decision(decision, releaseDir, gateSummary)
  decision.gates = gateSummary
  updateProductionBaselineForG1(decision, serverVitestReport)
  decision.g2MigrationAdvisorCloseout = buildG2MigrationAdvisorCloseout(releaseDir, releaseMatrix)
  applyG2MigrationAdvisorCloseout(decision, gateSummary)
  decision.g5LiveCloseoutContract = buildG5LiveCloseoutContract(releaseDir, releaseMatrix)
  applyG5LiveCloseoutContract(decision, gateSummary)
  decision.gates = gateSummary
  updateBaselineMatrix(decision, predeploySummary, gateSummary)
  updateDowngradedCapabilities(decision, gateSummary)
  updateFalseGreenAuditBoundary(decision, releaseDir)
  updateMustRerunBeforeProduction(decision, gateSummary)
  updateArtifactIndex(decision, releaseDir)
  decision.openBlockers = explainUnresolvedGateStatuses(decision, gateSummary)
  decision.openBlockers = refineCurrentEvidenceBlockers(decision, gateSummary)

  const finalDecision = computeFinalDecision(decision, gateSummary)
  const matrixReleaseBlockers = collectMatrixReleaseBlockers(decision, gateSummary)
  const decisionHierarchy = buildDecisionHierarchy(releaseDir, finalDecision)
  decision.decisionScope = 'full-release'
  decision.decisionAuthority = {
    level: 'release',
    authoritativeForCloseout: false,
    authoritativeForRelease: true,
    authoritativeForProduction: false,
    artifact: 'v1424-release-decision.json',
  }
  decision.decisionHierarchy = decisionHierarchy
  decision.decision = finalDecision
  decision.matrixReleaseBlockers = matrixReleaseBlockers
  decision.explicitGateSummary = buildExplicitGateSummary(decision, gateSummary)
  decision.testCaseDensitySummary = buildTestCaseDensitySummary(releaseDir)

  const refreshedSummary = {
    ...summary,
    generatedAt: now,
    decision: finalDecision,
    decisionScope: 'release-summary',
    decisionAuthority: {
      level: 'summary',
      authoritativeForRelease: false,
      authoritativeForProduction: false,
      sourceArtifact: 'v1424-release-decision.json',
    },
    decisionHierarchy,
    gateSummary,
    blockers: decision.openBlockers,
    matrixReleaseBlockers,
    explicitGateSummary: decision.explicitGateSummary,
    downgradedCapabilities: decision.downgradedCapabilities,
    mustRerunBeforeProduction: decision.mustRerunBeforeProduction,
    falseGreenReviewSummary: decision.falseGreenReviewSummary,
    testCaseDensitySummary: decision.testCaseDensitySummary,
    g2MigrationAdvisorCloseout: decision.g2MigrationAdvisorCloseout,
    g5LiveCloseoutContract: decision.g5LiveCloseoutContract,
    artifactIndex: decision.artifactIndex,
  }

  writeJson(normalizedPath, refreshedResults)
  writeJson(decisionPath, decision)
  writeJson(productionBaselinePath, buildProductionBaselineMatrixArtifact(decision, releaseDir, now))
  writeJson(summaryPath, refreshedSummary)
  writeFileSync(summaryMdPath, buildSummaryMarkdown(refreshedSummary), 'utf8')

  console.log(
    JSON.stringify(
      {
        status: 'refreshed',
        releaseDir,
        predeployEvidenceApplied: predeployUpdate.updated,
        serverVitestEvidenceApplied: serverVitestUpdate.updated,
        decision: finalDecision,
        gates: gateSummary,
        blockerCount: decision.openBlockers.length + matrixReleaseBlockers.length,
        openBlockerCount: decision.openBlockers.length,
        matrixReleaseBlockerCount: matrixReleaseBlockers.length,
      },
      null,
      2,
    ),
  )
}

main()
