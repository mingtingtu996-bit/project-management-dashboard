import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

describe('runtime deployment security contract', () => {
  it('keeps the API on the compose network and routes browser traffic through nginx', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'deploy/docker-compose.lighthouse.yml'), 'utf8')
    const nginx = readFileSync(resolve(workspaceRoot, 'deploy/nginx/lighthouse.conf'), 'utf8')

    const apiSection = compose.slice(compose.indexOf('  api:'), compose.indexOf('  web:'))
    expect(apiSection).not.toContain('network_mode: host')
    expect(apiSection).not.toMatch(/^\s+ports:/m)
    expect(apiSection).toContain('expose:')
    expect(apiSection).toContain('"3001"')
    expect(compose).not.toContain('host.docker.internal')
    expect(compose).toContain('127.0.0.1:${WEB_PORT:-8080}:80')
    expect(nginx).toContain('proxy_pass http://api:3001/api/;')
    expect(nginx).toContain('proxy_pass http://api:3001/ws;')
    expect(nginx).toContain('Strict-Transport-Security')
    expect(nginx).toContain('proxy_set_header X-Forwarded-Proto $workbuddy_forwarded_proto;')
  })

  it('separates the API role from the single scheduler worker role', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'deploy/docker-compose.lighthouse.yml'), 'utf8')
    const apiSection = compose.slice(compose.indexOf('  api:'), compose.indexOf('  worker:'))
    const workerSection = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  web:'))

    expect(apiSection).toContain('RUNTIME_ROLE: api')
    expect(apiSection).toContain('SKIP_SCHEDULER_BOOT: "true"')
    expect(workerSection).toContain('RUNTIME_ROLE: worker')
    expect(workerSection).toContain('SKIP_SCHEDULER_BOOT: "false"')
    expect(workerSection).toContain('DB_POOL_MAX: "5"')
    expect(workerSection).toContain('DB_POOL_WARM_CONNECTIONS: "1"')
    expect(workerSection).not.toMatch(/^\s+ports:/m)
    expect(workerSection).not.toContain('expose:')
  })

  it('uses dependency readiness, optional public HTTPS, and mandatory private release readback', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'deploy/docker-compose.lighthouse.yml'), 'utf8')
    const dockerfile = readFileSync(resolve(workspaceRoot, 'server/Dockerfile'), 'utf8')
    const deployScript = readFileSync(resolve(workspaceRoot, 'scripts/deploy-lighthouse-server.sh'), 'utf8')
    const workflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')

    expect(compose).toContain('/api/readyz')
    expect(dockerfile).toContain('/api/readyz')
    expect(deployScript).toContain('http://127.0.0.1:${WEB_PORT_VALUE}/api/readyz')
    expect(workflow).toContain('HEALTH_URL=\\\"${DEPLOY_HEALTH_URL:-}\\\"')
    expect(workflow).toContain('if [ -n "$DEPLOY_HEALTH_URL" ] && [[ "$DEPLOY_HEALTH_URL" != https://* ]]; then')
    expect(workflow).toContain('- name: Verify deployed release through SSH tunnel')
    expect(workflow).toContain('"http://127.0.0.1:${local_smoke_port}/api/readyz"')
    expect(workflow).toContain('/api/performance-reports/summary')
    expect(workflow).toContain('manifest.releaseSha !== process.env.RELEASE_SHA')
    expect(workflow).toContain('Public HTTPS was not inferred from the private SSH tunnel.')
    expect(deployScript).toContain("grep -qi '^strict-transport-security:'")
    expect(deployScript).toContain('Public HTTP endpoint did not redirect to HTTPS')
  })

  it('bounds container logs and disables unrotated production file duplication', () => {
    const compose = readFileSync(resolve(workspaceRoot, 'deploy/docker-compose.lighthouse.yml'), 'utf8')
    const envExample = readFileSync(resolve(workspaceRoot, 'deploy/env/server.production.example'), 'utf8')

    expect(compose.match(/max-size:\s*"10m"/g)?.length).toBe(3)
    expect(compose.match(/max-file:\s*"5"/g)?.length).toBe(3)
    expect(compose).toContain('LOG_PERSIST: "false"')
    expect(envExample).toContain('LOG_PERSIST=false')
  })

  it('ships the Playwright-matched browser runtime required for PDF export', () => {
    const dockerfile = readFileSync(resolve(workspaceRoot, 'server/Dockerfile'), 'utf8')
    const packageJson = JSON.parse(readFileSync(resolve(workspaceRoot, 'server/package.json'), 'utf8'))
    const reportsRoute = readFileSync(resolve(workspaceRoot, 'server/src/routes/reports.ts'), 'utf8')

    expect(packageJson.dependencies.playwright).toBe('1.58.2')
    expect(dockerfile).toContain('mcr.microsoft.com/playwright:v1.58.2-noble')
    expect(dockerfile).toContain('PLAYWRIGHT_BROWSERS_PATH=/ms-playwright')
    expect(reportsRoute).toContain('pdfExportLimiter')
    expect(reportsRoute).toContain("PDF_EXPORT_RATE_LIMITED")
  })
})
