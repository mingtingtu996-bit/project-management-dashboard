import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import {
  blockersFor,
  classifyUrl,
  deploymentConfigSummary,
  deriveTargets,
  discoverRealEnvTargets,
} from './discover-v14241-real-env-targets.mjs'

test('classifies local, relative, and database URLs without writing raw values', () => {
  assert.deepEqual(classifyUrl('http://127.0.0.1:3001'), {
    present: true,
    kind: 'absolute_url',
    scheme: 'http',
    host: '127.0.0.1:3001',
    local: true,
    rawValueWrittenToReport: false,
  })
  assert.deepEqual(classifyUrl('/api'), {
    present: true,
    kind: 'relative_path',
    host: null,
    local: false,
    rawValueWrittenToReport: false,
  })
  const database = classifyUrl('postgresql://user:secret@db.example.com:5432/postgres')
  assert.equal(database.kind, 'database_url')
  assert.equal(database.host, '<redacted-db-host>')
  assert.equal(database.rawValueWrittenToReport, false)
})

test('derives that localhost staging env is support-only and deployed targets are missing', () => {
  const envFiles = [
    {
      path: 'deploy/env/staging.env',
      keys: {
        API_BASE_URL: classifyUrl('http://127.0.0.1:3001'),
        CLIENT_BASE_URL: classifyUrl('http://127.0.0.1:5173'),
      },
    },
    {
      path: 'deploy/env/server.production.env',
      keys: {
        LIVE_BASE_URL: classifyUrl(''),
        PRODUCTION_BASE_URL: classifyUrl(''),
      },
    },
  ]
  const config = deploymentConfigSummary({
    deployWorkflow: 'environment:\n  staging:\n  production:\nDEPLOY_HEALTH_URL',
    productionReadinessWorkflow: 'DEPLOY_HOST DEPLOY_USER DEPLOY_PATH DEPLOY_PORT deploy/env/server.production.env',
    compose: 'VITE_API_BASE_URL: /api\n"${WEB_PORT:-80}:80"\nPORT: 3001',
    nginx: 'proxy_pass http://host.docker.internal:3001/api/;',
    releaseRunbook: '正式发布链使用自有服务器 Docker Compose，CloudBase 不再作为正式部署目标',
  })
  const targets = deriveTargets(envFiles, config)
  const blockers = blockersFor({ envFiles, config, targets })

  assert.equal(targets.localRuntimeWithStagingDataSource.available, true)
  assert.equal(targets.localRuntimeWithStagingDataSource.canCloseStagingTier, false)
  assert.equal(targets.deployedStaging.available, false)
  assert.equal(targets.liveProduction.available, false)
  assert.equal(targets.selfHostedDeploymentPattern.available, true)
  assert.ok(blockers.includes('staging_env_points_to_localhost_not_deployed_staging'))
  assert.ok(blockers.includes('deployed_staging_url_not_discoverable'))
  assert.ok(blockers.includes('live_production_url_not_discoverable'))
  assert.ok(blockers.includes('cloudbase_not_current_formal_deploy_target'))
})

test('writes sanitized repository target discovery report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-target-discovery-'))
  const outputJson = join(root, 'target-discovery.json')
  const outputMd = join(root, 'target-discovery.md')
  const report = await discoverRealEnvTargets({
    releaseDir: root,
    outputJson,
    outputMd,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(outputJson, 'utf8')

  assert.equal(report.status, 'real_environment_targets_not_discoverable_from_repo')
  assert.equal(report.executionBoundary.rawSecretValuesWrittenToReport, false)
  assert.equal(report.executionBoundary.canCloseUatStagingLiveMatrix, false)
  assert.ok(report.blockers.includes('staging_env_points_to_localhost_not_deployed_staging'))
  assert.doesNotMatch(written, /postgres(?:ql)?:\/\//i)
  assert.doesNotMatch(written, /password=|MCn5uaPh/i)
})
