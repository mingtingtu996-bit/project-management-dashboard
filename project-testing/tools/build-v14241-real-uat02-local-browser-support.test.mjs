import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildUat02LocalBrowserSupport } from './build-v14241-real-uat02-local-browser-support.mjs'

async function writeArtifacts(root, { withJoinScreenshot = true, withApiFailure = false } = {}) {
  await mkdir(root, { recursive: true })
  const teamPage = join(root, 'team-page.png')
  const teamDialog = join(root, 'team-dialog.png')
  const joinPage = join(root, 'join-page.png')
  const joinSuccess = join(root, 'join-success.png')
  await writeFile(teamPage, 'png', 'utf8')
  await writeFile(teamDialog, 'png', 'utf8')
  await writeFile(joinPage, 'png', 'utf8')
  if (withJoinScreenshot) await writeFile(joinSuccess, 'png', 'utf8')

  await writeFile(join(root, 'team-members-browser-check.json'), `${JSON.stringify({
    mode: 'mock-api',
    pendingAssigneeVisible: true,
    invitationDialogVisible: true,
    apiFailures: withApiFailure ? [{ url: '/api/members', status: 500 }] : [],
    consoleErrors: [],
    pageErrors: [],
    screenshots: {
      page: teamPage,
      invitationDialog: teamDialog,
    },
  }, null, 2)}\n`, 'utf8')

  await writeFile(join(root, 'join-project-browser-check.json'), `${JSON.stringify({
    mode: 'mock-api',
    joinedStateVisible: true,
    apiFailures: [],
    consoleErrors: [],
    pageErrors: [],
    screenshots: {
      page: joinPage,
      success: joinSuccess,
    },
  }, null, 2)}\n`, 'utf8')
}

test('builds REAL-UAT-02 local browser support report without claiming real tier pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat02-'))
  const output = join(root, 'report.json')
  await writeArtifacts(root)

  const report = await buildUat02LocalBrowserSupport({
    browserRoot: root,
    output,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(output, 'utf8')

  assert.equal(report.status, 'support_passed')
  assert.equal(report.canCloseScenarioTier, false)
  assert.equal(report.closesRealEnvironmentTier, false)
  assert.equal(report.summary.screenshotCount, 4)
  assert.equal(report.boundary.mockApiOnly, true)
  assert.equal(/password=|postgres:\/\//i.test(written), false)
})

test('blocks REAL-UAT-02 local browser support when screenshots are missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat02-'))
  const output = join(root, 'report.json')
  await writeArtifacts(root, { withJoinScreenshot: false })

  const report = await buildUat02LocalBrowserSupport({
    browserRoot: root,
    output,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'support_blocked')
  assert.deepEqual(report.summary.failedCheckIds, ['join-project-browser'])
})

test('blocks REAL-UAT-02 local browser support when API failures were captured', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat02-'))
  const output = join(root, 'report.json')
  await writeArtifacts(root, { withApiFailure: true })

  const report = await buildUat02LocalBrowserSupport({
    browserRoot: root,
    output,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'support_blocked')
  assert.deepEqual(report.summary.failedCheckIds, ['team-members-browser'])
})
