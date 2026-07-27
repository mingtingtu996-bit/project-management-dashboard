import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const repoRoot = process.cwd()

function runNode(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr })
    })
  })
}

test('r295 gate writes a failed summary instead of crashing when EXECUTION_PROGRESS is missing', async () => {
  const outputRoot = `.tmp/uiux-predeploy-r295-missing-progress-${Date.now()}`
  const outputPath = join(repoRoot, outputRoot)
  await rm(outputPath, { recursive: true, force: true })

  try {
    const result = await runNode(['scripts/verify-uiux-predeploy-gates.mjs', 'r295'], {
      UIUX_PREDEPLOY_OUTPUT_ROOT: outputRoot,
      UIUX_PREDEPLOY_EXECUTION_PROGRESS_PATH: join(outputPath, 'missing-EXECUTION_PROGRESS.json'),
    })

    assert.notEqual(result.exitCode, 0)
    assert.doesNotMatch(result.stderr, /ENOENT|EXECUTION_PROGRESS\.json/)

    const summaryPath = join(outputPath, 'r295', 'r295-summary.json')
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    const aggregatePath = join(outputPath, 'predeploy-gates-summary.json')
    const aggregate = JSON.parse(await readFile(aggregatePath, 'utf8'))

    assert.equal(summary.gate, 'U.qa.r295')
    assert.equal(summary.status, 'failed')
    assert.equal(summary.requirements.progressEvidence.status, 'missing')
    assert.match(summary.requirements.progressEvidence.reason, /cannot verify completed UI\/UX execution steps/i)
    assert.deepEqual(aggregate.selectedGates, ['r295'])
    assert.equal(aggregate.status, 'failed')
    assert.equal(aggregate.summaries[0].gate, 'U.qa.r295')
    assert.equal(aggregate.summaries[0].status, 'failed')
  } finally {
    await rm(outputPath, { recursive: true, force: true })
  }
})

test('browser gate setup failure writes aggregate summary instead of crashing', async () => {
  const outputRoot = `.tmp/uiux-predeploy-browser-setup-failure-${Date.now()}`
  const outputPath = join(repoRoot, outputRoot)
  await rm(outputPath, { recursive: true, force: true })

  try {
    const result = await runNode(['scripts/verify-uiux-predeploy-gates.mjs', 'component'], {
      UIUX_PREDEPLOY_OUTPUT_ROOT: outputRoot,
      PREDEPLOY_START_PREVIEW: 'false',
      BASE_URL: 'http://127.0.0.1:9',
      API_BASE_URL: 'http://127.0.0.1:9',
      UIUX_PREDEPLOY_RUNTIME_READY_TIMEOUT_MS: '250',
    })

    assert.notEqual(result.exitCode, 0)

    const aggregatePath = join(outputPath, 'predeploy-gates-summary.json')
    const aggregate = JSON.parse(await readFile(aggregatePath, 'utf8'))

    assert.deepEqual(aggregate.selectedGates, ['component'])
    assert.equal(aggregate.status, 'failed')
    assert.equal(aggregate.summaries[0].gate, 'U.qa.component')
    assert.equal(aggregate.summaries[0].status, 'failed')
    assert.match(aggregate.summaries[0].failureMessage, /API did not become ready/i)
  } finally {
    await rm(outputPath, { recursive: true, force: true })
  }
})

test('predeploy interaction selectors do not use mojibake text or retired Gantt entrypoints', async () => {
  const source = await readFile(join(repoRoot, 'scripts/verify-uiux-predeploy-gates.mjs'), 'utf8')

  for (const mojibake of ['椋庨櫓', '鍙樻洿', '搴旂敤', '璺宠繃']) {
    assert.equal(source.includes(mojibake), false, `predeploy gate script should not contain mojibake selector text: ${mojibake}`)
  }

  assert.equal(source.includes("getByTestId('gantt-open-critical-path-dialog')"), false)
  assert.equal(source.includes("getByTestId('dashboard-compact-header')"), false)
  assert.equal(source.includes('[data-testid^="gantt-task-select-"]'), false)
  assert.match(source, /menuTrigger\.click\(\)/)
  assert.match(source, /getByTestId\('gantt-critical-path-summary-chip'\)\.click\(\)/)
  assert.match(source, /getByTestId\('dashboard-page-title'\)/)
  assert.match(source, /getByTestId\('planning-task-list-filter-menu'\)/)
})

test('Gantt engineering objects overlay waits for dropdown controls before clicking', async () => {
  const source = await readFile(join(repoRoot, 'scripts/verify-uiux-predeploy-gates.mjs'), 'utf8')

  assert.match(source, /const menuTrigger = page\.getByTestId\('gantt-generation-template-menu'\)/)
  assert.match(source, /await menuTrigger\.waitFor\(\{ state: 'visible', timeout: 20000 \}\)/)
  assert.match(source, /const menuItem = page\.getByTestId\('gantt-open-engineering-objects'\)/)
  assert.match(source, /await menuItem\.waitFor\(\{ state: 'visible', timeout: 20000 \}\)/)
})

test('diagnostic assertion includes API failure URLs in error messages', async () => {
  const source = await readFile(join(repoRoot, 'scripts/verify-uiux-predeploy-gates.mjs'), 'utf8')

  assert.match(source, /formatDiagnostics/)
  assert.match(source, /diagnostics\.apiFailures\.slice\(0, 6\)/)
  assert.match(source, /failure\.url/)
  assert.match(source, /failure\.status/)
})

test('preview server shutdown is awaited before the predeploy script exits', async () => {
  const source = await readFile(join(repoRoot, 'scripts/verify-uiux-predeploy-gates.mjs'), 'utf8')

  assert.match(source, /async function stopPreviewServer/)
  assert.match(source, /child\.once\('close'/)
  assert.match(source, /await stopPreviewServer\(preview\)/)
  assert.doesNotMatch(source, /preview\.kill\(\)/)
})

test('npm predeploy entrypoint forces real permission mode before build and browser gates', async () => {
  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
  const wrapper = await readFile(join(repoRoot, 'scripts/run-uiux-predeploy-gates.mjs'), 'utf8')

  assert.equal(packageJson.scripts['verify:uiux-predeploy-gates'], 'node scripts/run-uiux-predeploy-gates.mjs all')
  assert.match(wrapper, /VITE_DISABLE_PERMISSION_SYSTEM:\s*'false'/)
  assert.match(wrapper, /DISABLE_PERMISSION_SYSTEM:\s*'false'/)
  assert.match(wrapper, /npm(?:\.cmd)?/)
  assert.match(wrapper, /run/)
  assert.match(wrapper, /build/)
  assert.match(wrapper, /verify-uiux-predeploy-gates\.mjs/)
})

test('npm UIUX child gate entrypoints force real permission mode before build', async () => {
  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
  const wrapper = await readFile(join(repoRoot, 'scripts/run-uiux-gate.mjs'), 'utf8')
  const visualGate = await readFile(join(repoRoot, 'scripts/verify-uiux-visual.mjs'), 'utf8')

  for (const scriptName of [
    'verify:uiux-visual',
    'verify:uiux-overlap',
    'verify:uiux-a11y',
    'verify:uiux-performance',
    'verify:uiux-release-smoke',
  ]) {
    assert.match(packageJson.scripts[scriptName], /^node scripts\/run-uiux-gate\.mjs scripts\/verify-uiux-/)
  }

  assert.match(wrapper, /VITE_DISABLE_PERMISSION_SYSTEM:\s*'false'/)
  assert.match(wrapper, /DISABLE_PERMISSION_SYSTEM:\s*'false'/)
  assert.match(wrapper, /runNpm\(\['run', 'build', '--workspace=client'\]\)/)
  assert.match(wrapper, /run\(process\.execPath, \[targetScript, \.\.\.targetArgs\]\)/)
  assert.match(wrapper, /'verify-uiux-visual\.mjs': \{ PORT: '4273' \}/)
  assert.match(wrapper, /if \(defaults\.PORT && !next\.BASE_URL\)/)
  assert.match(wrapper, /BASE_URL = `http:\/\/127\.0\.0\.1:\$\{next\.PORT\}`/)
  assert.match(visualGate, /assertPreviewSupportsSelectedStates/)
  assert.match(visualGate, /injects completed onboarding state/)
  assert.match(visualGate, /Route is already handled/)
  assert.match(visualGate, /if \(fulfilled \|\| message\.includes\('Route is already handled'\)\) return/)
})
