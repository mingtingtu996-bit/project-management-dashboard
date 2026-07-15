#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultBrowserRoot = join(repoRoot, 'project-testing', 'artifacts', 'browser-checks')
const defaultOutput = join(defaultReleaseDir, 'v14241-real-uat02-local-browser-support.json')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

async function screenshotChecks(doc, keys) {
  const checks = []
  for (const key of keys) {
    const screenshotPath = doc?.screenshots?.[key]
    const present = screenshotPath ? await exists(screenshotPath) : false
    checks.push({
      key,
      path: screenshotPath ? rel(screenshotPath) : null,
      present,
    })
  }
  return checks
}

function errorSummary(doc) {
  return {
    apiFailureCount: toArray(doc?.apiFailures).length,
    consoleErrorCount: toArray(doc?.consoleErrors).length,
    pageErrorCount: toArray(doc?.pageErrors).length,
  }
}

function allZeroErrors(summary) {
  return summary.apiFailureCount === 0 && summary.consoleErrorCount === 0 && summary.pageErrorCount === 0
}

export async function buildUat02LocalBrowserSupport({
  browserRoot = defaultBrowserRoot,
  output = defaultOutput,
  now = new Date(),
} = {}) {
  const absoluteBrowserRoot = resolve(browserRoot)
  const teamArtifact = join(absoluteBrowserRoot, 'team-members-browser-check.json')
  const joinArtifact = join(absoluteBrowserRoot, 'join-project-browser-check.json')
  const [teamPresent, joinPresent] = await Promise.all([exists(teamArtifact), exists(joinArtifact)])
  const checks = []
  let teamDoc = null
  let joinDoc = null

  if (teamPresent) {
    teamDoc = await readJson(teamArtifact)
    const errors = errorSummary(teamDoc)
    const screenshots = await screenshotChecks(teamDoc, ['page', 'invitationDialog'])
    checks.push({
      id: 'team-members-browser',
      status: teamDoc.pendingAssigneeVisible === true
        && teamDoc.invitationDialogVisible === true
        && allZeroErrors(errors)
        && screenshots.every((item) => item.present)
        ? 'pass'
        : 'blocked',
      artifact: rel(teamArtifact),
      mode: teamDoc.mode ?? null,
      assertions: {
        pendingAssigneeVisible: teamDoc.pendingAssigneeVisible === true,
        invitationDialogVisible: teamDoc.invitationDialogVisible === true,
        noErrors: allZeroErrors(errors),
        screenshots,
      },
      errors,
    })
  } else {
    checks.push({
      id: 'team-members-browser',
      status: 'blocked',
      reason: 'missing_team_members_browser_artifact',
      artifact: rel(teamArtifact),
    })
  }

  if (joinPresent) {
    joinDoc = await readJson(joinArtifact)
    const errors = errorSummary(joinDoc)
    const screenshots = await screenshotChecks(joinDoc, ['page', 'success'])
    checks.push({
      id: 'join-project-browser',
      status: joinDoc.joinedStateVisible === true
        && allZeroErrors(errors)
        && screenshots.every((item) => item.present)
        ? 'pass'
        : 'blocked',
      artifact: rel(joinArtifact),
      mode: joinDoc.mode ?? null,
      assertions: {
        joinedStateVisible: joinDoc.joinedStateVisible === true,
        noErrors: allZeroErrors(errors),
        screenshots,
      },
      errors,
    })
  } else {
    checks.push({
      id: 'join-project-browser',
      status: 'blocked',
      reason: 'missing_join_project_browser_artifact',
      artifact: rel(joinArtifact),
    })
  }

  const failedCheckIds = checks.filter((check) => check.status !== 'pass').map((check) => check.id)
  const report = {
    schemaVersion: 'workbuddy/v14241-real-uat02-local-browser-support/v1',
    generatedAt: now.toISOString(),
    status: failedCheckIds.length === 0 ? 'support_passed' : 'support_blocked',
    scenarioId: 'REAL-UAT-02',
    environment: 'local_browser_mock_api',
    targetClass: 'local_browser_mock_api',
    mutationBoundary: 'mock API browser replay only; no real invitation, membership, email, database, or audit mutation executed',
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
    supportOnlyReason: 'REAL-UAT-02 full pass still requires real UAT/staging/solo-live/live accounts, invitation creation, invite acceptance, role readback, audit trail, target ids, and cleanup/readback under the scenario evidence contract.',
    artifacts: {
      teamMembers: teamPresent ? rel(teamArtifact) : null,
      joinProject: joinPresent ? rel(joinArtifact) : null,
    },
    checks,
    summary: {
      requiredCheckCount: checks.length,
      passedRequiredCheckCount: checks.length - failedCheckIds.length,
      failedCheckIds,
      screenshotCount: checks.reduce((sum, check) => (
        sum + toArray(check.assertions?.screenshots).filter((item) => item.present).length
      ), 0),
    },
    boundary: {
      mockApiOnly: true,
      noRealInvitationCreated: true,
      noRealMembershipMutationExecuted: true,
      noAuditReadbackCaptured: true,
      scenarioEvidenceStillRequired: true,
      handoffStillRequired: true,
    },
  }

  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=/i.test(text)) {
    throw new Error('refusing_to_write_uat02_browser_support_report_with_secret_like_text')
  }

  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

async function main() {
  const browserRoot = resolve(argValue('--browser-root', defaultBrowserRoot))
  const output = resolve(argValue('--output', defaultOutput))
  const report = await buildUat02LocalBrowserSupport({ browserRoot, output })
  console.log(JSON.stringify({
    status: report.status,
    scenarioId: report.scenarioId,
    environment: report.environment,
    passedRequiredCheckCount: report.summary.passedRequiredCheckCount,
    requiredCheckCount: report.summary.requiredCheckCount,
    failedCheckIds: report.summary.failedCheckIds,
    canCloseScenarioTier: report.canCloseScenarioTier,
    output: rel(output),
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
