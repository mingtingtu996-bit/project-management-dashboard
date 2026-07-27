import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const workspaceRoot = resolve(import.meta.dirname, '..')
const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash'

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

function stepRun(workflow, stepName) {
  const lines = workflow.split(/\r?\n/u)
  const stepIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`)
  assert.notEqual(stepIndex, -1, `${stepName} step must exist`)
  const stepIndent = lines[stepIndex].search(/\S/u)
  const runIndex = lines.findIndex((line, index) => {
    if (index <= stepIndex) return false
    const indent = line.search(/\S/u)
    if (indent >= 0 && indent <= stepIndent) return false
    return line.trim() === 'run: |'
  })
  assert.ok(runIndex > stepIndex, `${stepName} must contain a run block`)
  const runIndent = lines[runIndex].search(/\S/u)
  const body = []
  for (let index = runIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const indent = line.search(/\S/u)
    if (indent >= 0 && indent <= runIndent) break
    body.push(line.length > runIndent + 2 ? line.slice(runIndent + 2) : '')
  }
  return body.join('\n')
}

function runProbeStep(run, { body, httpStatus = '200', reportSha = null }) {
  const report = reportSha
    ? `printf '%s\\n' 'release_sha=${reportSha}' > "$OUTPUT_ROOT/runtime-recovery.env"`
    : ':'
  return spawnSync(bash, ['-c', `
set -euo pipefail
curl() {
  local output=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --output|-o) output="$2"; shift 2 ;;
      --write-out|--max-time) shift 2 ;;
      --fail|--silent|--show-error) shift ;;
      *) shift ;;
    esac
  done
  if [ -n "$output" ]; then printf '%s' "$MOCK_READINESS" > "$output"; fi
  printf '%s' "$MOCK_HTTP_STATUS"
}
sleep() { :; }
RUNNER_TEMP="$(mktemp -d)"
trap 'rm -rf "$RUNNER_TEMP"' EXIT
GITHUB_OUTPUT="$RUNNER_TEMP/github-output"
OUTPUT_ROOT="$RUNNER_TEMP/output"
mkdir -p "$OUTPUT_ROOT"
touch "$GITHUB_OUTPUT"
export RUNNER_TEMP GITHUB_OUTPUT OUTPUT_ROOT
${report}
${run}
cat "$GITHUB_OUTPUT"
`], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEPLOY_HEALTH_URL: 'https://zhuxucloud.com/api/readyz',
      EXPECTED_PUBLIC_HOST: 'zhuxucloud.com',
      MOCK_HTTP_STATUS: httpStatus,
      MOCK_READINESS: JSON.stringify(body),
      SUPABASE_URL: 'https://production-ref.supabase.co',
    },
  })
}

test('runtime recovery is manual-only behind the protected production environment', () => {
  const workflow = readOwnedFile('.github/workflows/production-runtime-recovery.yml')

  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /schedule:/)
  assert.doesNotMatch(workflow, /cron:/)
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
    'PRODUCTION_SUPABASE_URL',
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

test('production runtime recovery requires both local verification and public HTTPS readiness', () => {
  const workflow = readOwnedFile('.github/workflows/production-runtime-recovery.yml')
  const script = readOwnedFile('scripts/recover-production-runtime.sh')
  const requiredSecretLoop = workflow.match(/for required_name in ([^;]+); do/)?.[1] ?? ''

  assert.match(requiredSecretLoop, /DEPLOY_HEALTH_URL/)
  assert.doesNotMatch(workflow, /Probe optional public runtime readiness endpoint/)
  assert.doesNotMatch(workflow, /if \[ -n "\$DEPLOY_HEALTH_URL" \]; then/)
  assert.match(workflow, /PUBLIC_PROBE_CONFIGURED/)
  assert.match(workflow, /publicProbeConfigured/)
  assert.match(workflow, /publicProbeConfigured && publicProbeAfterPassed/)
  assert.match(script, /PUBLIC_PROBE_CONFIGURED/)
  assert.match(
    script,
    /\[ "\$PUBLIC_PROBE_CONFIGURED" = "true" \].*public probe.*required/is,
  )
  assert.doesNotMatch(
    script,
    /\[ "\$PUBLIC_PROBE_CONFIGURED" != "true" \] \|\| \[ "\$PUBLIC_PROBE_HEALTHY" = "true" \]/,
  )
})

test('production deploy, staging deploy, recovery, ingress, and ACL remediation share one mutation queue', () => {
  const deployWorkflow = readOwnedFile('.github/workflows/deploy.yml')
  const recoveryWorkflow = readOwnedFile('.github/workflows/production-runtime-recovery.yml')
  const ingressWorkflow = readOwnedFile('.github/workflows/provision-domain-ingress.yml')
  const aclRemediationWorkflow = readOwnedFile('.github/workflows/production-advisor-acl-remediation.yml')

  const sharedGroup = 'lighthouse-host-runtime-mutation'
  assert.match(deployWorkflow, new RegExp(sharedGroup))
  assert.match(deployWorkflow, /github\.event\.inputs\.environment != 'preview'/)
  assert.match(recoveryWorkflow, new RegExp(`group:\\s*${sharedGroup}`))
  assert.match(ingressWorkflow, new RegExp(`group:\\s*${sharedGroup}`))
  assert.match(aclRemediationWorkflow, new RegExp(`group:\\s*${sharedGroup}`))
  assert.doesNotMatch(recoveryWorkflow, /group:\s*production-runtime-mutation/)
  assert.doesNotMatch(ingressWorkflow, /group:\s*workbuddy-domain-ingress/)
})

test('public recovery probes reject wrong target, project, stale SHA, and non-200 responses', () => {
  const workflow = readOwnedFile('.github/workflows/production-runtime-recovery.yml')
  const before = stepRun(workflow, 'Probe required public runtime readiness endpoint')
  const after = stepRun(workflow, 'Verify required public runtime readiness after diagnosis and recovery')
  const currentSha = 'a'.repeat(40)
  const valid = {
    status: 'ready',
    build: {
      releaseSha: currentSha,
      deployTarget: 'production',
      supabaseProjectRef: 'production-ref',
      databaseProjectRef: 'production-ref',
    },
  }

  const validBefore = runProbeStep(before, { body: valid })
  assert.equal(validBefore.status, 0, validBefore.stderr)
  assert.match(validBefore.stdout, /^healthy=true$/mu)

  for (const body of [
    { ...valid, build: { ...valid.build, deployTarget: 'staging' } },
    { ...valid, build: { ...valid.build, supabaseProjectRef: 'staging-ref' } },
    { ...valid, build: { ...valid.build, databaseProjectRef: 'staging-ref' } },
    { ...valid, status: 'live' },
  ]) {
    const result = runProbeStep(before, { body })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /^healthy=false$/mu)
  }

  const validAfter = runProbeStep(after, { body: valid, reportSha: currentSha })
  assert.equal(validAfter.status, 0, validAfter.stderr)
  assert.match(validAfter.stdout, /^healthy=true$/mu)

  const staleAfter = runProbeStep(after, {
    body: { ...valid, build: { ...valid.build, releaseSha: 'b'.repeat(40) } },
    reportSha: currentSha,
  })
  assert.equal(staleAfter.status, 0, staleAfter.stderr)
  assert.match(staleAfter.stdout, /^healthy=false$/mu)

  const noContent = runProbeStep(after, { body: valid, httpStatus: '204', reportSha: currentSha })
  assert.equal(noContent.status, 0, noContent.stderr)
  assert.match(noContent.stdout, /^healthy=false$/mu)
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
  assert.match(script, /api\|web\|worker\|all/)
  assert.doesNotMatch(script, /\b(?:scheduled|auto)\b/u)
  assert.doesNotMatch(workflow, /\b(?:scheduled|auto)\b/u)
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
  const compose = readOwnedFile('deploy/docker-compose.lighthouse.yml')

  assert.match(script, /CURRENT_LINK="\$APP_DIR\/current"/)
  assert.match(script, /pending-application-release\.env/)
  assert.match(script, /flock -n 9/)
  assert.match(script, /ACTIVE_RELEASE_DIR/)
  assert.match(script, /readlink -f "\$CURRENT_LINK"/)
  assert.match(script, /release_sha_from_manifest/)
  assert.match(script, /\[ "\$release_sha" = "\$active_release_sha" \]/)
  assert.match(script, /web_release_sha/)
  assert.match(script, /web_target/)
  assert.match(script, /web_health_before/)
  assert.match(script, /web_health_after/)
  assert.match(script, /api_release_sha.*worker_release_sha.*web_release_sha/s)
  assert.match(compose, /web:[\s\S]*?RELEASE_SHA: \$\{RELEASE_SHA:\?RELEASE_SHA is required\}/)
  assert.match(compose, /web:[\s\S]*?DEPLOY_TARGET: \$\{DEPLOY_TARGET:\?DEPLOY_TARGET is required\}/)
  assert.match(compose, /web:[\s\S]*?healthcheck:/)

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
    'scripts/verify-public-readyz-identity.mjs',
    'scripts/production-runtime-recovery.contract.test.mjs',
    'deploy/README.md',
  ]) {
    assert.match(guard, new RegExp(path.replaceAll('.', '\\.').replaceAll('/', '\\/')))
  }
  assert.match(guard, /node --test scripts\/production-runtime-recovery\.contract\.test\.mjs/)

  assert.match(deployReadme, /Production runtime recovery/)
  assert.match(deployReadme, /PRODUCTION_DEPLOY_HEALTH_URL/)
  assert.match(deployReadme, /PRODUCTION_DEPLOY_HEALTH_URL.*required/i)
  assert.doesNotMatch(deployReadme, /PRODUCTION_DEPLOY_HEALTH_URL.*optional/i)
  assert.match(deployReadme, /STAGING_PEER_DEPLOY_PATH/)
  assert.match(deployReadme, /PRODUCTION_PEER_DEPLOY_PATH/)
  assert.match(deployReadme, /\/api\/readyz/)
  assert.match(deployReadme, /Web, API, and worker/)
  assert.match(deployReadme, /does not deploy/i)
  assert.match(deployReadme, /exit code 137/i)
  assert.doesNotMatch(deployReadme, /scheduled run/i)
})
