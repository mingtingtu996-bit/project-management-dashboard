import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const projectUiRoot = join(repoRoot, 'project-ui')

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(repoRoot, relativePath), 'utf8'))
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  })
}

async function makeUiReportRoot(prefix) {
  return mkdtemp(join(projectUiRoot, 'reports', prefix))
}

test('project-ui center has the required entrypoints and governance files', async () => {
  const expectedFiles = [
    'project-ui/README.md',
    'project-ui/skills/workbuddy-ui-implementation/SKILL.md',
    'project-ui/skills/workbuddy-component-state-catalog/SKILL.md',
    'project-ui/matrix/ui-implementation-matrix.json',
    'project-ui/plugins/ui-tool-inventory.json',
    'project-ui/index/source-map.json',
    'project-ui/index/moved-files.json',
    'project-ui/tools/run-ui-dashboard.mjs',
    'project-ui/tools/check-ui-center.mjs',
    'client/src/mocks/browser.ts',
    'client/src/mocks/handlers.ts',
  ]

  for (const relativePath of expectedFiles) {
    assert.equal(existsSync(join(repoRoot, relativePath)), true, `${relativePath} should exist`)
  }

  assert.equal(existsSync(join(projectUiRoot, 'reports')), true, 'project-ui/reports should exist')
})

test('UI implementation matrix registers sources, profiles, commands, and output boundaries', async () => {
  const matrix = await readJson('project-ui/matrix/ui-implementation-matrix.json')

  assert.equal(matrix.schemaVersion, 'workbuddy-ui-implementation-matrix.v1')
  assert.ok(matrix.authoritativeSources.some((source) => source.path === 'AGENTS.md'))
  assert.ok(matrix.authoritativeSources.some((source) => source.id === 'uiux-v13'))
  assert.ok(matrix.authoritativeSources.some((source) => source.path === 'design-system/workbuddy/MASTER.md'))
  assert.ok(matrix.profiles.some((profile) => profile.id === 'design-audit'))
  assert.ok(matrix.profiles.some((profile) => profile.id === 'figma-assets'))
  assert.ok(matrix.profiles.some((profile) => profile.id === 'component-library'))
  assert.ok(matrix.profiles.some((profile) => profile.id === 'page-implementation'))
  assert.ok(matrix.profiles.some((profile) => profile.id === 'uiux-verify'))
  assert.ok(matrix.commands.some((command) => command.id === 'verify-uiux-visual'))
  assert.ok(matrix.commands.some((command) => command.id === 'figma-extract-design'))
  assert.ok(matrix.commands.some((command) => command.id === 'client-typecheck'))
  assert.ok(matrix.mutationBoundary.forbiddenProductionWrites.length > 0)
  assert.equal(matrix.artifactRoots.current, 'project-ui/artifacts')
})

test('UI center check validates registered files and commands', () => {
  const result = runNode(['project-ui/tools/check-ui-center.mjs'])

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /UI center check passed/)
})

test('UI dashboard dry-run writes a summary into the requested report root', async () => {
  const reportRoot = await makeUiReportRoot('workbuddy-ui-center-')

  try {
    const result = runNode([
      'project-ui/tools/run-ui-dashboard.mjs',
      '--profile',
      'design-audit',
      '--dry-run',
      '--report-root',
      reportRoot,
    ])

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /UI dashboard dry-run completed/)

    const output = JSON.parse(result.stdout)
    assert.equal(output.profile, 'design-audit')
    assert.equal(output.dryRun, true)
    assert.ok(output.sourceIds.includes('uiux-v13'))
    assert.ok(output.summaryJson.startsWith(reportRoot))
    assert.equal(existsSync(output.summaryJson), true)
    assert.equal(existsSync(output.summaryMarkdown), true)
  } finally {
    await rm(reportRoot, { recursive: true, force: true })
  }
})

test('UI dashboard dry-run is read-only unless a report root is explicitly requested', async () => {
  const reportsRoot = join(projectUiRoot, 'reports')
  const before = new Set(await readdir(reportsRoot))

  const result = runNode([
    'project-ui/tools/run-ui-dashboard.mjs',
    '--profile',
    'design-audit',
    '--dry-run',
  ])

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const output = JSON.parse(result.stdout)
  assert.equal(output.dryRun, true)
  assert.equal(output.reportDir, null)
  assert.equal(output.summaryJson, null)
  assert.equal(output.summaryMarkdown, null)
  assert.deepEqual(new Set(await readdir(reportsRoot)), before)
})

test('UI dashboard rejects execute and dry-run together', async () => {
  const reportRoot = await makeUiReportRoot('workbuddy-ui-dashboard-conflict-')

  try {
    const result = runNode([
      'project-ui/tools/run-ui-dashboard.mjs',
      '--profile',
      'design-audit',
      '--execute',
      '--dry-run',
      '--report-root',
      reportRoot,
    ])

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /mutually exclusive/)
  } finally {
    await rm(reportRoot, { recursive: true, force: true })
  }
})

test('UI dashboard refuses external or browser execution without an explicit allow flag', async () => {
  const reportRoot = await makeUiReportRoot('workbuddy-ui-dashboard-approval-')

  try {
    const result = runNode([
      'project-ui/tools/run-ui-dashboard.mjs',
      '--profile',
      'page-implementation',
      '--execute',
      '--report-root',
      reportRoot,
    ])

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /requires --allow-browser/)
  } finally {
    await rm(reportRoot, { recursive: true, force: true })
  }
})

test('UI dashboard returns a failing exit code when an executed command times out', async () => {
  const reportRoot = await makeUiReportRoot('workbuddy-ui-dashboard-timeout-')

  try {
    const result = runNode([
      'project-ui/tools/run-ui-dashboard.mjs',
      '--profile',
      'design-audit',
      '--execute',
      '--timeout-ms',
      '1',
      '--report-root',
      reportRoot,
    ])

    assert.notEqual(result.status, 0)
    const output = JSON.parse(result.stdout)
    assert.equal(output.results[0].status, 'failed')
    assert.match(output.results[0].error, /timed out|ETIMEDOUT/i)
  } finally {
    await rm(reportRoot, { recursive: true, force: true })
  }
})

test('UI dashboard rejects report roots outside project-ui artifacts or reports', async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), 'workbuddy-ui-dashboard-outside-'))

  try {
    const result = runNode([
      'project-ui/tools/run-ui-dashboard.mjs',
      '--profile',
      'design-audit',
      '--dry-run',
      '--report-root',
      reportRoot,
    ])

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /report-root.*project-ui.*artifacts.*reports/i)
  } finally {
    await rm(reportRoot, { recursive: true, force: true })
  }
})

test('UI dashboard rejects unknown execution classifications instead of failing open', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'workbuddy-ui-dashboard-execution-fixture-'))
  const matrixPath = join(fixtureRoot, 'matrix.json')

  try {
    await writeFile(matrixPath, JSON.stringify({
      profiles: [{ id: 'invalid-execution', commandIds: ['invalid-command'] }],
      commands: [{ id: 'invalid-command', command: 'node -e "process.exit(0)"', execution: 'locla' }],
      mutationBoundary: {},
    }), 'utf8')
    const result = runNode([
      'project-ui/tools/run-ui-dashboard.mjs',
      '--matrix',
      matrixPath,
      '--profile',
      'invalid-execution',
      '--dry-run',
    ])

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /unknown execution classification.*locla/i)
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('UI dashboard records successful hosted execution as review-pending, not passed', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'workbuddy-ui-dashboard-review-fixture-'))
  const matrixPath = join(fixtureRoot, 'matrix.json')
  const reportRoot = await makeUiReportRoot('workbuddy-ui-dashboard-review-')

  try {
    await writeFile(matrixPath, JSON.stringify({
      profiles: [{ id: 'hosted-review', commandIds: ['hosted-command'] }],
      commands: [{
        id: 'hosted-command',
        command: 'node -e "process.exit(0)"',
        execution: 'external',
        successStatus: 'review-pending',
      }],
      mutationBoundary: {},
    }), 'utf8')
    const result = runNode([
      'project-ui/tools/run-ui-dashboard.mjs',
      '--matrix',
      matrixPath,
      '--profile',
      'hosted-review',
      '--execute',
      '--allow-external',
      '--report-root',
      reportRoot,
    ])

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const output = JSON.parse(result.stdout)
    assert.equal(output.results[0].status, 'review-pending')
    assert.equal(output.commands[0].status, 'review-pending')
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
    await rm(reportRoot, { recursive: true, force: true })
  }
})
