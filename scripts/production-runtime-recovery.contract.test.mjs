import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const workspaceRoot = resolve(import.meta.dirname, '..')

function readOwnedFile(relativePath) {
  const absolutePath = resolve(workspaceRoot, relativePath)
  assert.ok(existsSync(absolutePath), `${relativePath} must exist`)
  return readFileSync(absolutePath, 'utf8')
}

function jobSection(workflow, jobName, nextJobName) {
  const start = workflow.indexOf(`  ${jobName}:`)
  assert.notEqual(start, -1, `${jobName} job must exist`)
  const end = nextJobName ? workflow.indexOf(`  ${nextJobName}:`, start + 1) : workflow.length
  assert.notEqual(end, -1, `${nextJobName} job must follow ${jobName}`)
  return workflow.slice(start, end)
}

test('runtime recovery workflow probes production hourly and preserves current deployment contracts', () => {
  const workflow = readOwnedFile('.github/workflows/production-runtime-recovery.yml')

  assert.match(workflow, /schedule:\r?\n\s+- cron: '17 \* \* \* \*'/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /environment:\s+production/)
  assert.match(workflow, /\/api\/readyz/)
  assert.doesNotMatch(workflow, /\/api\/health(?:\s|['"]|$)/)

  for (const service of ['project-management-web', 'project-management-api', 'project-management-worker']) {
    assert.match(workflow, new RegExp(service), `${service} must be covered by the workflow`)
  }

  for (const secret of [
    'PRODUCTION_DEPLOY_HOST',
    'PRODUCTION_DEPLOY_USER',
    'PRODUCTION_DEPLOY_PORT',
    'PRODUCTION_DEPLOY_PATH',
    'PRODUCTION_DEPLOY_SSH_PRIVATE_KEY',
    'PRODUCTION_DEPLOY_KNOWN_HOSTS',
    'PRODUCTION_DEPLOY_HEALTH_URL',
    'PRODUCTION_SLACK_WEBHOOK',
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`), `${secret} must retain the current secret convention`)
  }

  assert.match(workflow, /scripts\/recover-production-runtime\.sh/)
  assert.doesNotMatch(workflow, /docker compose (?:down|up)/)
  assert.doesNotMatch(workflow, /--build/)
  assert.doesNotMatch(workflow, /migrate:/)
  assert.doesNotMatch(workflow, /deploy-lighthouse-server/)
})

test('private runtime recovery requires local verification and treats public HTTPS as optional', () => {
  const workflow = readOwnedFile('.github/workflows/production-runtime-recovery.yml')
  const script = readOwnedFile('scripts/recover-production-runtime.sh')
  const requiredSecretLoop = workflow.match(/for required_name in ([^;]+); do/)?.[1] ?? ''

  assert.doesNotMatch(requiredSecretLoop, /DEPLOY_HEALTH_URL/)
  assert.match(workflow, /if \[ -n "\$DEPLOY_HEALTH_URL" \]; then/)
  assert.match(workflow, /PUBLIC_PROBE_CONFIGURED/)
  assert.match(workflow, /publicProbeConfigured/)
  assert.match(workflow, /!publicProbeConfigured \|\| publicProbeAfterPassed/)
  assert.match(script, /PUBLIC_PROBE_CONFIGURED/)
  assert.match(
    script,
    /\[ "\$PUBLIC_PROBE_CONFIGURED" != "true" \] \|\| \[ "\$PUBLIC_PROBE_HEALTHY" = "true" \]/,
  )
})

test('manual restart is guarded by environment, exact confirmation, and an allow-listed target', () => {
  const workflow = readOwnedFile('.github/workflows/production-runtime-recovery.yml')
  const script = readOwnedFile('scripts/recover-production-runtime.sh')

  assert.match(workflow, /environment:\r?\n\s+description:[\s\S]*?type: choice[\s\S]*?options:\r?\n\s+- production/)
  assert.match(workflow, /confirmation:/)
  assert.match(workflow, /target:[\s\S]*?type: choice[\s\S]*?- api[\s\S]*?- web[\s\S]*?- worker[\s\S]*?- all/)
  assert.match(workflow, /RESTART_PRODUCTION_RUNTIME/)

  assert.match(script, /DEPLOY_TARGET.*production/)
  assert.match(script, /RESTART_PRODUCTION_RUNTIME/)
  assert.match(script, /auto\|api\|web\|worker\|all/)
  assert.match(script, /Refusing manual recovery/)
})

test('recovery policy is fail closed and records evidence without inferring OOM from exit 137', () => {
  const script = readOwnedFile('scripts/recover-production-runtime.sh')

  assert.match(script, /SUPABASE_RUNTIME_KEY/)
  assert.match(script, /SUPABASE_SERVICE_KEY/)
  assert.match(script, /preflight_passed/)
  assert.match(script, /recovery_allowed/)
  assert.match(script, /apiUnhealthy/)
  assert.match(script, /apiExited/)
  assert.match(script, /healthCurlFailed/)
  assert.match(script, /api_exit_code_before/)
  assert.doesNotMatch(script, /\boom(?:kill|killed|error)?\b/i)

  const recoveryGuard = script.indexOf('if [ "$recovery_allowed" != "true" ]')
  const firstMutation = Math.min(
    ...[' start ', ' restart ']
      .map((token) => script.indexOf(token))
      .filter((index) => index >= 0),
  )
  assert.ok(recoveryGuard >= 0, 'the script must reject recovery before mutation when diagnosis is unclear')
  assert.ok(firstMutation > recoveryGuard, 'container mutation must occur only after the recovery_allowed guard')

  assert.doesNotMatch(script, /docker compose (?:down|up)/)
  assert.doesNotMatch(script, /--build/)
  assert.doesNotMatch(script, /git (?:checkout|reset|pull|fetch)/)
  assert.doesNotMatch(script, /migrat(?:e|ion)/i)
})

test('recovery binds container actions to the atomic current release and refuses deployment overlap', () => {
  const script = readOwnedFile('scripts/recover-production-runtime.sh')

  assert.match(script, /CURRENT_LINK="\$APP_DIR\/current"/)
  assert.match(script, /pending-application-release\.env/)
  assert.match(script, /flock -n 9/)
  assert.match(script, /ACTIVE_RELEASE_DIR/)
  assert.match(script, /readlink -f "\$CURRENT_LINK"/)
  assert.match(script, /release_sha_from_manifest/)
  assert.match(script, /\[ "\$release_sha" = "\$active_release_sha" \]/)

  const pendingGuard = script.indexOf('pending-application-release.env')
  const containerMutation = script.indexOf('recover_container()')
  assert.ok(pendingGuard >= 0 && pendingGuard < containerMutation)
})

test('all recovery notifications are independent and cannot suppress later stages', () => {
  const workflow = readOwnedFile('.github/workflows/production-runtime-recovery.yml')
  const notificationJobs = [
    ['notify-probe', 'notify-recovery'],
    ['notify-recovery', 'notify-verification'],
    ['notify-verification', undefined],
  ]

  for (const [jobName, nextJobName] of notificationJobs) {
    const section = jobSection(workflow, jobName, nextJobName)
    assert.match(section, /needs:\s+runtime-recovery/)
    assert.match(section, /if:\s+\$\{\{ always\(\) \}\}/)
    assert.match(section, /continue-on-error:\s+true/)
    assert.doesNotMatch(section, /needs:\s+notify-/)
  }
})

test('workflow guard and deployment documentation own the recovery contract', () => {
  const guard = readOwnedFile('.github/workflows/workflow-guard.yml')
  const deployReadme = readOwnedFile('deploy/README.md')

  for (const path of [
    '.github/workflows/production-runtime-recovery.yml',
    'scripts/recover-production-runtime.sh',
    'scripts/production-runtime-recovery.contract.test.mjs',
    'deploy/README.md',
  ]) {
    assert.match(guard, new RegExp(path.replaceAll('.', '\\.').replaceAll('/', '\\/')))
  }
  assert.match(guard, /node --test scripts\/production-runtime-recovery\.contract\.test\.mjs/)

  assert.match(deployReadme, /Production runtime recovery/)
  assert.match(deployReadme, /PRODUCTION_DEPLOY_HEALTH_URL/)
  assert.match(deployReadme, /\/api\/readyz/)
  assert.match(deployReadme, /Web, API, and worker/)
  assert.match(deployReadme, /does not deploy/i)
  assert.match(deployReadme, /exit code 137/i)
})
