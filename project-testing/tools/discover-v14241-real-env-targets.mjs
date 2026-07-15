#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultOutputJson = join(defaultReleaseDir, 'v14241-real-env-target-discovery.json')
const defaultOutputMd = join(defaultReleaseDir, 'v14241-real-env-target-discovery.md')

const TARGET_ENV_FILES = [
  'deploy/env/staging.env',
  'deploy/env/server.production.env',
  'deploy/env/server.production.example',
]

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readTextIfPresent(path) {
  if (!existsSync(path)) return ''
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
}

function parseEnvText(text) {
  const values = {}
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    values[key] = line.slice(line.indexOf('=') + 1).trim()
  }
  return values
}

export function classifyUrl(value) {
  const text = String(value ?? '').trim()
  if (!text) return { present: false, kind: 'missing', host: null, local: false, rawValueWrittenToReport: false }
  if (/^\/[A-Za-z0-9/_?.=&-]*$/.test(text)) {
    return { present: true, kind: 'relative_path', host: null, local: false, rawValueWrittenToReport: false }
  }
  try {
    const url = new URL(text)
    const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(url.hostname)
    const databaseLike = /postgres/i.test(url.protocol)
    return {
      present: true,
      kind: databaseLike ? 'database_url' : 'absolute_url',
      scheme: url.protocol.replace(/:$/, ''),
      host: local ? url.host : databaseLike ? '<redacted-db-host>' : url.host,
      local,
      rawValueWrittenToReport: false,
    }
  } catch {
    return { present: true, kind: 'unparseable', host: null, local: false, rawValueWrittenToReport: false }
  }
}

function summarizeEnvFile(file, env) {
  const interestingKeys = [
    'API_BASE_URL',
    'CLIENT_BASE_URL',
    'LIVE_BASE_URL',
    'PRODUCTION_BASE_URL',
    'DEPLOY_HEALTH_URL',
    'VITE_API_BASE_URL',
    'DATABASE_URL',
    'DIRECT_DATABASE_URL',
    'DB_CONNECTION_STRING',
    'WORKBUDDY_RUNTIME_DATABASE_URL',
    'SUPABASE_URL',
    'TEST_USER_EMAIL',
    'TEST_USERNAME',
    'TEST_USER_PASSWORD',
  ]
  return {
    path: file,
    exists: existsSync(resolve(repoRoot, file)),
    keys: Object.fromEntries(interestingKeys.map((key) => {
      if (/_URL$|BASE_URL|CONNECTION_STRING|DATABASE_URL|SUPABASE_URL|HEALTH_URL/.test(key)) {
        return [key, classifyUrl(env[key])]
      }
      return [key, { present: Boolean(env[key]), valueWrittenToReport: false }]
    })),
  }
}

function hasText(text, pattern) {
  return pattern.test(String(text ?? ''))
}

export function deploymentConfigSummary({ deployWorkflow, productionReadinessWorkflow, compose, nginx, releaseRunbook }) {
  return {
    deployWorkflow: {
      path: '.github/workflows/deploy.yml',
      exists: Boolean(deployWorkflow),
      hasEnvironmentChoice: hasText(deployWorkflow, /environment:/),
      mentionsStaging: hasText(deployWorkflow, /\bstaging\b/i),
      mentionsProduction: hasText(deployWorkflow, /\bproduction\b/i),
      referencesDeployHealthUrlSecret: hasText(deployWorkflow, /DEPLOY_HEALTH_URL/),
    },
    productionCloseoutWorkflow: {
      path: '.github/workflows/production-closeout-readiness.yml',
      exists: Boolean(productionReadinessWorkflow),
      fetchesRemoteProductionEnv: hasText(productionReadinessWorkflow, /deploy\/env\/server\.production\.env/),
      requiresDeploySecrets: hasText(productionReadinessWorkflow, /DEPLOY_(HOST|USER|PATH|PORT|SSH_PRIVATE_KEY)/),
    },
    dockerCompose: {
      path: 'deploy/docker-compose.lighthouse.yml',
      exists: Boolean(compose),
      frontendApiBaseIsRelativeApi: hasText(compose, /VITE_API_BASE_URL:\s*\/api/),
      exposesWebPort: hasText(compose, /\$\{WEB_PORT:-80\}:80/),
      apiHostNetworkPort3001: hasText(compose, /PORT:\s*3001/),
    },
    nginx: {
      path: 'deploy/nginx/lighthouse.conf',
      exists: Boolean(nginx),
      proxiesApiToLocalHostGateway: hasText(nginx, /proxy_pass\s+http:\/\/host\.docker\.internal:3001\/api\//),
    },
    releaseRunbook: {
      path: 'docs/release-runbook.md',
      exists: Boolean(releaseRunbook),
      saysCloudBaseNotFormalTarget: hasText(releaseRunbook, /不再走\s+CloudBase|CloudBase\s+不再作为正式部署目标/i),
      saysSelfHostedDockerCompose: hasText(releaseRunbook, /Docker Compose|自有服务器/),
    },
  }
}

export function deriveTargets(envFiles, config) {
  const stagingEnv = envFiles.find((item) => item.path === 'deploy/env/staging.env')
  const productionEnv = envFiles.find((item) => item.path === 'deploy/env/server.production.env')
  return {
    localRuntimeWithStagingDataSource: {
      available: stagingEnv?.keys?.API_BASE_URL?.local === true && stagingEnv?.keys?.CLIENT_BASE_URL?.local === true,
      apiBase: stagingEnv?.keys?.API_BASE_URL ?? null,
      clientBase: stagingEnv?.keys?.CLIENT_BASE_URL ?? null,
      canCloseStagingTier: false,
      reason: 'Local API/client URLs can support diagnostics but are not deployed staging.',
    },
    deployedStaging: {
      available: false,
      canCloseStagingTier: false,
      reason: 'No deployed staging base URL or deployed version ref is discoverable from repository files.',
    },
    liveProduction: {
      available: false,
      canCloseLiveTier: false,
      reason: productionEnv?.keys?.PRODUCTION_BASE_URL?.present || productionEnv?.keys?.LIVE_BASE_URL?.present
        ? 'Production URL refs are present but not sufficient without live handoff, approval, rollback, monitoring, and retention refs.'
        : 'No live base URL is discoverable from repository files; deploy target values appear to be held in external CI/server secrets.',
    },
    selfHostedDeploymentPattern: {
      available: config.dockerCompose.frontendApiBaseIsRelativeApi && config.nginx.proxiesApiToLocalHostGateway,
      canCloseAnyTier: false,
      reason: 'The repo defines a self-hosted Docker Compose pattern with frontend /api proxying, but not the public host value.',
    },
  }
}

export function blockersFor({ envFiles, config, targets }) {
  const blockers = []
  const stagingEnv = envFiles.find((item) => item.path === 'deploy/env/staging.env')
  if (stagingEnv?.keys?.API_BASE_URL?.local || stagingEnv?.keys?.CLIENT_BASE_URL?.local) {
    blockers.push('staging_env_points_to_localhost_not_deployed_staging')
  }
  if (!targets.deployedStaging.available) blockers.push('deployed_staging_url_not_discoverable')
  if (!targets.liveProduction.available) blockers.push('live_production_url_not_discoverable')
  if (config.productionCloseoutWorkflow.requiresDeploySecrets) blockers.push('deploy_target_values_external_ci_or_server_secrets')
  if (config.releaseRunbook.saysCloudBaseNotFormalTarget) blockers.push('cloudbase_not_current_formal_deploy_target')
  return [...new Set(blockers)]
}

function assertNoSecretLikeText(report) {
  const text = JSON.stringify(report)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password=|service[_-]?role\s*=|MCn5uaPh/i.test(text)) {
    throw new Error('refusing_to_write_v14241_real_env_target_discovery_with_secret_like_text')
  }
}

export async function discoverRealEnvTargets({
  releaseDir = defaultReleaseDir,
  outputJson = defaultOutputJson,
  outputMd = defaultOutputMd,
  now = new Date(),
} = {}) {
  const envFiles = []
  for (const file of TARGET_ENV_FILES) {
    const text = await readTextIfPresent(resolve(repoRoot, file))
    envFiles.push(summarizeEnvFile(file, parseEnvText(text)))
  }
  const [deployWorkflow, productionReadinessWorkflow, compose, nginx, releaseRunbook] = await Promise.all([
    readTextIfPresent(resolve(repoRoot, '.github/workflows/deploy.yml')),
    readTextIfPresent(resolve(repoRoot, '.github/workflows/production-closeout-readiness.yml')),
    readTextIfPresent(resolve(repoRoot, 'deploy/docker-compose.lighthouse.yml')),
    readTextIfPresent(resolve(repoRoot, 'deploy/nginx/lighthouse.conf')),
    readTextIfPresent(resolve(repoRoot, 'docs/release-runbook.md')),
  ])
  const config = deploymentConfigSummary({ deployWorkflow, productionReadinessWorkflow, compose, nginx, releaseRunbook })
  const targets = deriveTargets(envFiles, config)
  const blockers = blockersFor({ envFiles, config, targets })
  const report = {
    schemaVersion: 'workbuddy/v14241-real-env-target-discovery/v1',
    generatedAt: now.toISOString(),
    source: 'discover-v14241-real-env-targets',
    releaseDir: rel(resolve(releaseDir)),
    status: blockers.length === 0 ? 'real_environment_targets_discovered' : 'real_environment_targets_not_discoverable_from_repo',
    envFiles,
    deploymentConfig: config,
    targets,
    blockers,
    executionBoundary: {
      readOnly: true,
      commandsExecuted: 0,
      doesNotMutateEnvironment: true,
      doesNotAuthorizeExecution: true,
      rawSecretValuesWrittenToReport: false,
      canCloseUatStagingLiveMatrix: false,
    },
    nextRequiredActions: [
      'Provide deployed staging client/API base URLs and deployed version refs, not localhost URLs.',
      'Provide live/production base URL and live handoff refs from the deployment owner.',
      'Provide approval, rollback, monitoring, retention, cleanup, role accounts, and scenario target refs before executing mutating tiers.',
    ],
  }
  assertNoSecretLikeText(report)
  await mkdir(dirname(resolve(outputJson)), { recursive: true })
  await mkdir(dirname(resolve(outputMd)), { recursive: true })
  await writeFile(resolve(outputJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputMd), renderMarkdown(report), 'utf8')
  return report
}

export function renderMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Real Environment Target Discovery',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Release dir: ${report.releaseDir}`,
    '',
    '## Targets',
    '',
    `- Local runtime with staging data source: ${report.targets.localRuntimeWithStagingDataSource.available ? 'yes' : 'no'}; can close staging tier: no`,
    `- Deployed staging: ${report.targets.deployedStaging.available ? 'yes' : 'no'}`,
    `- Live production: ${report.targets.liveProduction.available ? 'yes' : 'no'}`,
    `- Self-hosted deployment pattern in repo: ${report.targets.selfHostedDeploymentPattern.available ? 'yes' : 'no'}`,
    '',
    '## Blockers',
    '',
  ]
  for (const blocker of report.blockers) lines.push(`- ${blocker}`)
  lines.push('', '## Boundary', '')
  lines.push('- This discovery is read-only and writes no raw secrets, database URLs, passwords, or token values.')
  lines.push('- Repository configuration can show deployment shape, but it does not reveal CI/server secret values such as public host URLs.')
  lines.push('- Localhost API/client URLs are support-only and cannot close UAT/staging/solo-live/live matrix tiers.')
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const outputJson = resolve(argValue('--output', join(releaseDir, 'v14241-real-env-target-discovery.json')))
  const outputMd = resolve(argValue('--md-output', join(releaseDir, 'v14241-real-env-target-discovery.md')))
  const report = await discoverRealEnvTargets({ releaseDir, outputJson, outputMd })
  console.log(JSON.stringify({
    status: report.status,
    blockers: report.blockers,
    localRuntimeWithStagingDataSource: report.targets.localRuntimeWithStagingDataSource.available,
    deployedStaging: report.targets.deployedStaging.available,
    liveProduction: report.targets.liveProduction.available,
    outputs: [rel(outputJson), rel(outputMd)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
