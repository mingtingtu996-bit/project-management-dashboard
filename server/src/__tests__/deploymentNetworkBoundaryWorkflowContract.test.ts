import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const workspaceRoot = resolve(serverRoot, '..')

describe('private server network boundary contract', () => {
  it('keeps runtime ports private and verifies public TLS only through the configured HTTPS edge', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')
    const compose = readFileSync(resolve(workspaceRoot, 'deploy/docker-compose.lighthouse.yml'), 'utf8')
    const deployScript = readFileSync(resolve(workspaceRoot, 'scripts/deploy-lighthouse-server.sh'), 'utf8')

    expect(compose).toContain('127.0.0.1:${WEB_PORT:-8080}:80')
    expect(deployScript).toContain('External deployment health URL must use https://')
    expect(deployScript).toContain('strict-transport-security:')
    expect(deployScript).toContain('HTTP endpoint did not redirect to the HTTPS health authority.')

    const deployIndex = workflow.indexOf('name: Deploy to self-hosted server')
    const portProbeIndex = workflow.indexOf('name: Verify API port is not externally reachable')
    const tunnelIndex = workflow.indexOf('name: Verify deployed release through SSH tunnel')
    expect(deployIndex).toBeGreaterThan(0)
    expect(portProbeIndex).toBeGreaterThan(deployIndex)
    expect(tunnelIndex).toBeGreaterThan(portProbeIndex)
    expect(workflow.slice(portProbeIndex, tunnelIndex)).toContain('/dev/tcp/$DEPLOY_HOST/3001')
  })
})
