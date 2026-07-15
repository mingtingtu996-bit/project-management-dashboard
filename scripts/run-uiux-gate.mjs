import { spawnSync } from 'node:child_process'
import { basename } from 'node:path'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const targetScript = process.argv[2]
const targetArgs = process.argv.slice(3)

if (!targetScript) {
  console.error('Usage: node scripts/run-uiux-gate.mjs <script.mjs> [...args]')
  process.exit(1)
}

const isolatedGateDefaults = {
  'verify-uiux-visual.mjs': { PORT: '4273' },
  'verify-uiux-overlap.mjs': { PORT: '4274' },
  'verify-uiux-a11y.mjs': { PORT: '4275' },
  'verify-uiux-release-smoke.mjs': { PORT: '4276' },
  'verify-uiux-performance.mjs': { UIUX_PERFORMANCE_PORT: '4277' },
}

function applyGateDefaults(env, defaults) {
  const next = { ...env }

  for (const [key, value] of Object.entries(defaults)) {
    if (!next[key]) next[key] = value
  }

  if (defaults.PORT && !next.BASE_URL) {
    next.BASE_URL = `http://127.0.0.1:${next.PORT}`
  }

  if (
    defaults.UIUX_PERFORMANCE_PORT
    && !next.UIUX_PERFORMANCE_BASE_URL
    && !next.WEB_BASE_URL
    && !next.CLIENT_BASE_URL
  ) {
    next.UIUX_PERFORMANCE_BASE_URL = `http://127.0.0.1:${next.UIUX_PERFORMANCE_PORT}`
  }

  return next
}

const gateDefaults = isolatedGateDefaults[basename(targetScript)] || {}
const realPermissionEnv = {
  ...process.env,
  VITE_DISABLE_PERMISSION_SYSTEM: 'false',
  DISABLE_PERMISSION_SYSTEM: 'false',
}
const gateEnv = applyGateDefaults(realPermissionEnv, gateDefaults)

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: gateEnv,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function runNpm(args) {
  if (process.platform === 'win32') {
    run('cmd.exe', ['/d', '/c', npmCommand, ...args])
    return
  }

  run(npmCommand, args)
}

runNpm(['run', 'build', '--workspace=client'])
run(process.execPath, [targetScript, ...targetArgs])
