import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const DEFAULT_SERVICE_NAME = 'project-management-api'
const DEFAULT_PORT = '3001'

function runTcb(args) {
  return spawnSync('tcb', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: node scripts/deploy-cloudbase-backend.mjs

Required environment variables:
  CLOUDBASE_ENV_ID           CloudBase environment id

Optional environment variables:
  CLOUDBASE_BACKEND_SERVICE  CloudRun service name (default: ${DEFAULT_SERVICE_NAME})
  CLOUDBASE_BACKEND_PORT     CloudRun container port (default: ${DEFAULT_PORT})

Note:
  Runtime secrets for the backend must already be configured on the CloudBase
  CloudRun service. This script only updates the service image from ./server.`)
  process.exit(0)
}

const workspaceRoot = process.cwd()
const serverRoot = resolve(workspaceRoot, 'server')
const dockerfilePath = resolve(serverRoot, 'Dockerfile')
const envId = process.env.CLOUDBASE_ENV_ID
const serviceName = process.env.CLOUDBASE_BACKEND_SERVICE || DEFAULT_SERVICE_NAME
const port = process.env.CLOUDBASE_BACKEND_PORT || DEFAULT_PORT

if (!envId) {
  console.error('CLOUDBASE_ENV_ID is required for CloudBase backend deployment.')
  process.exit(1)
}

if (!existsSync(dockerfilePath)) {
  console.error(`Expected backend Dockerfile at ${dockerfilePath}, but it was not found.`)
  process.exit(1)
}

console.log(`Deploying CloudBase CloudRun service "${serviceName}" from ${serverRoot}`)
console.log('CloudRun runtime environment variables must already be configured in CloudBase.')

const preflight = runTcb(['cloudrun', 'list', '-e', envId])
if (preflight.status !== 0) {
  const details = `${preflight.stdout ?? ''}\n${preflight.stderr ?? ''}`.trim()
  if (details.includes('DescribeCloudRunServers') || details.includes('tcbr:DescribeCloudRunServers')) {
    console.error('CloudBase credentials can access the environment, but CloudRun permissions are missing.')
    console.error('Observed missing permission: tcbr:DescribeCloudRunServers')
    console.error('Ask the Tencent Cloud / CloudBase administrator to grant CloudRun service management permissions before retrying.')
  } else {
    console.error('CloudRun preflight check failed before deployment.')
  }
  if (details) {
    console.error(details)
  }
  process.exit(preflight.status ?? 1)
}

const command = [
  'cloudrun',
  'deploy',
  '--envId',
  envId,
  '--serviceName',
  serviceName,
  '--port',
  port,
  '--source',
  serverRoot,
  '--force',
]

const result = spawnSync('tcb', command, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
