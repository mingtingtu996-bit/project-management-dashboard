import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const gateArgs = process.argv.slice(2)
const selectedGates = gateArgs.length > 0 ? gateArgs : ['all']

const realPermissionEnv = {
  ...process.env,
  VITE_DISABLE_PERMISSION_SYSTEM: 'false',
  DISABLE_PERMISSION_SYSTEM: 'false',
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: realPermissionEnv,
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
run(process.execPath, ['scripts/verify-uiux-predeploy-gates.mjs', ...selectedGates])
