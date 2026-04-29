const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const [name, ...commandParts] = process.argv.slice(2)

if (!name || commandParts.length === 0) {
  console.error('Usage: node scripts/run-detached-command.cjs <name> <command...>')
  process.exit(1)
}

const repoRoot = path.resolve(__dirname, '..')
const logsDir = path.join(repoRoot, 'logs')
fs.mkdirSync(logsDir, { recursive: true })

const command = commandParts.join(' ')
const logPath = path.join(logsDir, `${name}.log`)
const exitPath = path.join(logsDir, `${name}.exit`)
const pidPath = path.join(logsDir, `${name}.pid`)

fs.rmSync(exitPath, { force: true })
fs.writeFileSync(logPath, '')

const workerScript = `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const out = fs.openSync(${JSON.stringify(logPath)}, 'a');
const child = spawn(${JSON.stringify(command)}, {
  cwd: ${JSON.stringify(repoRoot)},
  shell: true,
  windowsHide: true,
  stdio: ['ignore', out, out],
});
fs.writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));
child.on('exit', (code, signal) => {
  fs.writeFileSync(${JSON.stringify(exitPath)}, String(code ?? (signal ? 1 : 0)));
});
child.on('error', (error) => {
  fs.writeFileSync(${JSON.stringify(logPath)}, String(error.stack || error.message || error) + '\\n', { flag: 'a' });
  fs.writeFileSync(${JSON.stringify(exitPath)}, '1');
});
`

const worker = spawn(process.execPath, ['-e', workerScript], {
  cwd: repoRoot,
  detached: true,
  windowsHide: true,
  stdio: 'ignore',
})

worker.unref()
console.log(`Started ${name}: ${command}`)
console.log(`Log: ${path.relative(repoRoot, logPath).replace(/\\/g, '/')}`)
console.log(`Exit: ${path.relative(repoRoot, exitPath).replace(/\\/g, '/')}`)
