import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const require = createRequire(new URL('../server/package.json', import.meta.url))
const { load: loadYaml } = require('js-yaml')
const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash'
const python3Shim = process.platform === 'win32'
  ? 'python3() { py.exe -3 "$@"; }'
  : ''

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

function runBash(script, env = {}) {
  return spawnSync(bash, ['-c', script], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

test('release archives are prepared outside the live tree and activated with a recoverable pointer', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')

  assert.match(script, /releases/u)
  assert.match(script, /failed-releases/u)
  assert.match(script, /current\.next/u)
  assert.match(script, /pending-application-release\.env/u)
  assert.match(script, /flock -n/u)
  assert.match(script, /CANDIDATE_DIR/u)
  assert.match(script, /PREVIOUS_TARGET/u)
  assert.match(script, /rollback_application_release/u)
  assert.match(script, /verify_release_health/u)
  assert.match(script, /build_and_up_release "\$previous_target" "\$previous_sha"/u)
  assert.doesNotMatch(script, /git ls-files -z \| xargs -0 -r rm/u)
  assert.doesNotMatch(script, /rm -rf client\/dist/u)
  assert.doesNotMatch(script, /tar -xzf "\$RELEASE_ARCHIVE" -C "\$APP_DIR"/u)
})

test('stable runtime env and data paths are linked into releases and never quarantined', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')

  assert.match(script, /STABLE_ENV_FILE/u)
  assert.match(script, /STABLE_DATA_DIR/u)
  assert.match(script, /server\.production\.env/u)
  assert.match(script, /ln -sfn/u)
  assert.doesNotMatch(script, /rm -rf "?\$?STABLE_ENV_FILE/u)
  assert.doesNotMatch(script, /mv "?\$?STABLE_DATA_DIR/u)
})

test('deployment target must own its exact Docker project and loopback port before compose mutation', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const validateRuntimeSlot = script.match(
    /(validate_runtime_slot\(\) \{[\s\S]*?\n\})\n\n/u,
  )?.[1]
  assert.ok(validateRuntimeSlot, 'validate_runtime_slot must remain executable in isolation')

  const harness = `
set -euo pipefail
read_env_value() {
  case "$1" in
    WEB_PORT) printf '%s' "$MOCK_WEB_PORT" ;;
    COMPOSE_PROJECT_NAME) printf '%s' "$MOCK_COMPOSE_PROJECT_NAME" ;;
  esac
}
${validateRuntimeSlot}
validate_runtime_slot
`
  const cases = [
    ['production', '8080', 'project-management', 0],
    ['staging', '8081', 'project-management-staging', 0],
    ['staging', '8080', 'project-management-staging', 1],
    ['staging', '8081', 'project-management', 1],
    ['production', '8081', 'project-management', 1],
    ['production', '8080', 'project-management-staging', 1],
  ]
  for (const [target, webPort, composeProjectName, expectedStatus] of cases) {
    const result = runBash(harness, {
      DEPLOY_TARGET: target,
      MOCK_WEB_PORT: webPort,
      MOCK_COMPOSE_PROJECT_NAME: composeProjectName,
    })
    assert.equal(
      result.status,
      expectedStatus,
      `${target}/${webPort}/${composeProjectName}: ${result.stdout}\n${result.stderr}`,
    )
  }
})

test('runtime JWT secrets must match both registered fingerprints and differ from the real peer environment', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const validateJwtSecretFingerprints = script.match(
    /(validate_jwt_secret_fingerprints\(\) \{[\s\S]*?\n\})\n\n/u,
  )?.[1]
  assert.ok(
    validateJwtSecretFingerprints,
    'validate_jwt_secret_fingerprints must remain executable in isolation',
  )

  const jwtSecret = 'runtime-secret-with-at-least-32-random-bytes'
  const peerSecret = 'peer-runtime-secret-with-at-least-32-random-bytes'
  const expectedFingerprint = createHash('sha256').update(jwtSecret).digest('hex')
  const peerFingerprint = createHash('sha256').update(peerSecret).digest('hex')
  const harness = `
set -euo pipefail
${validateJwtSecretFingerprints}
validate_jwt_secret_fingerprints "$MOCK_JWT_SECRET" "$MOCK_PEER_JWT_SECRET"
`
  const cases = [
    [expectedFingerprint, peerFingerprint, peerSecret, 0],
    ['a'.repeat(64), peerFingerprint, peerSecret, 1],
    [expectedFingerprint, 'b'.repeat(64), peerSecret, 1],
    [expectedFingerprint, peerFingerprint, jwtSecret, 1],
    [expectedFingerprint, expectedFingerprint, peerSecret, 1],
    [expectedFingerprint.toUpperCase(), peerFingerprint, peerSecret, 1],
    ['', peerFingerprint, peerSecret, 1],
  ]
  for (const [currentFingerprint, otherFingerprint, actualPeerSecret, expectedStatus] of cases) {
    const result = runBash(harness, {
      MOCK_JWT_SECRET: jwtSecret,
      MOCK_PEER_JWT_SECRET: actualPeerSecret,
      EXPECTED_JWT_SECRET_SHA256: currentFingerprint,
      PEER_JWT_SECRET_SHA256: otherFingerprint,
    })
    assert.equal(
      result.status,
      expectedStatus,
      `${currentFingerprint}/${otherFingerprint}: ${result.stdout}\n${result.stderr}`,
    )
  }
})

test('deployment workflow supplies the explicit bootstrap contract and runs the atomicity test', async () => {
  const [deployWorkflow, guardWorkflow] = await Promise.all([
    source('.github/workflows/deploy.yml'),
    source('.github/workflows/workflow-guard.yml'),
  ])

  assert.match(
    deployWorkflow,
    /INITIAL_RUNTIME_BOOTSTRAP:\s*\$\{\{ github\.event\.inputs\.initial_runtime_bootstrap \|\| 'false' \}\}/u,
  )
  const workflow = loadYaml(deployWorkflow)
  const deploymentStep = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .find((step) => step.name === 'Deploy to self-hosted server')
  assert.ok(deploymentStep?.run, 'self-hosted deployment shell is required')
  assert.equal(
    deploymentStep.env?.INITIAL_RUNTIME_BOOTSTRAP,
    "${{ github.event.inputs.initial_runtime_bootstrap || 'false' }}",
  )
  assert.equal(
    deploymentStep.env?.EXPECTED_JWT_SECRET_SHA256,
    "${{ secrets[format('{0}_JWT_SECRET_SHA256', github.event.inputs.environment == 'staging' && 'STAGING' || 'PRODUCTION')] }}",
  )
  assert.equal(
    deploymentStep.env?.PEER_JWT_SECRET_SHA256,
    "${{ secrets[format('{0}_PEER_JWT_SECRET_SHA256', github.event.inputs.environment == 'staging' && 'STAGING' || 'PRODUCTION')] }}",
  )
  assert.equal(
    deploymentStep.env?.PEER_DEPLOY_PATH,
    "${{ vars[format('{0}_PEER_DEPLOY_PATH', github.event.inputs.environment == 'staging' && 'STAGING' || 'PRODUCTION')] }}",
  )
  assert.match(
    deploymentStep.run,
    /INITIAL_RUNTIME_BOOTSTRAP=\\"\$INITIAL_RUNTIME_BOOTSTRAP\\"/u,
  )
  assert.match(
    deploymentStep.run,
    /EXPECTED_JWT_SECRET_SHA256=\\"\$EXPECTED_JWT_SECRET_SHA256\\" PEER_JWT_SECRET_SHA256=\\"\$PEER_JWT_SECRET_SHA256\\" PEER_RUNTIME_ENV_FILE=\\"\$PEER_DEPLOY_PATH\/deploy\/env\/server\.production\.env\\"/u,
  )

  const preflightSteps = workflow.jobs['deployment-target-preflight'].steps
  const preflightSecretCheck = preflightSteps.find(
    (step) => step.name === 'Check target deployment and runtime secrets',
  )
  assert.match(preflightSecretCheck?.run ?? '', /EXPECTED_JWT_SECRET_SHA256/u)
  assert.match(preflightSecretCheck?.run ?? '', /PEER_JWT_SECRET_SHA256/u)
  const remoteFingerprintCheck = preflightSteps.find(
    (step) => step.name === 'Verify remote runtime JWT fingerprint',
  )
  assert.ok(remoteFingerprintCheck?.run, 'remote JWT fingerprint preflight is required before migration')
  assert.match(remoteFingerprintCheck.run, /sha256sum/u)
  assert.match(remoteFingerprintCheck.run, /PEER_DEPLOY_PATH/u)
  assert.match(remoteFingerprintCheck.run, /peer_actual_fingerprint/u)
  assert.doesNotMatch(remoteFingerprintCheck.run, /echo .*JWT.*SHA|printf .*fingerprint/u)
  const fingerprintSyntax = spawnSync(bash, ['-n'], {
    input: remoteFingerprintCheck.run,
    encoding: 'utf8',
  })
  assert.equal(fingerprintSyntax.status, 0, fingerprintSyntax.stderr)
  assert.match(guardWorkflow, /application-release-atomicity\.contract\.test\.mjs/u)
})

test('application commit and rollback require healthy exact-SHA Web, API, and worker containers', async () => {
  const [script, compose] = await Promise.all([
    source('scripts/deploy-lighthouse-server.sh'),
    source('deploy/docker-compose.lighthouse.yml'),
  ])

  assert.match(script, /verify_runtime_container_identities/u)
  assert.match(script, /container_env_value[\s\S]*?RELEASE_SHA/u)
  assert.match(script, /container_env_value[\s\S]*?DEPLOY_TARGET/u)
  assert.match(script, /container_health/u)
  assert.match(script, /for service in web api worker/u)
  assert.match(script, /container="\$\{COMPOSE_PROJECT_NAME_VALUE\}-\$\{service\}"/u)
  assert.match(compose, /web:[\s\S]*?RELEASE_SHA: \$\{RELEASE_SHA:\?RELEASE_SHA is required\}/u)
  assert.match(compose, /web:[\s\S]*?DEPLOY_TARGET: \$\{DEPLOY_TARGET:\?DEPLOY_TARGET is required\}/u)
  assert.match(compose, /web:[\s\S]*?healthcheck:/u)
})

test('remote deployment and ingress scripts do not require host Node.js', async () => {
  const [deployScript, ingressScript] = await Promise.all([
    source('scripts/deploy-lighthouse-server.sh'),
    source('scripts/provision-lighthouse-domain-ingress.sh'),
  ])

  assert.doesNotMatch(deployScript, /(^|\n)\s*node(?:\s|$)/u)
  assert.doesNotMatch(ingressScript, /\bnode\s+--input-type/u)
  assert.match(deployScript, /python3/u)
  assert.match(ingressScript, /python3/u)
})

test('host Python ingress verifier rejects wrong authority, path, credentials, port, and private IP', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const validator = script.match(
    /(validate_public_ingress_contract\(\) \{[\s\S]*?\n\})\n\nverify_release_health/u,
  )?.[1]
  assert.ok(validator, 'validate_public_ingress_contract must remain executable in isolation')

  const cases = [
    ['https://zhuxucloud.com/api/readyz', 'http://zhuxucloud.com/api/readyz', 'production', 'zhuxucloud.com', 'domain_hsts', 0],
    ['https://staging.zhuxucloud.com/api/readyz', 'http://staging.zhuxucloud.com/api/readyz', 'staging', 'staging.zhuxucloud.com', 'domain_hsts', 0],
    ['https://staging.zhuxucloud.com/health', 'http://staging.zhuxucloud.com/api/readyz', 'staging', 'staging.zhuxucloud.com', 'domain_hsts', 1],
    ['https://user:pass@zhuxucloud.com/api/readyz', 'http://zhuxucloud.com/api/readyz', 'production', 'zhuxucloud.com', 'domain_hsts', 1],
    ['https://staging.zhuxucloud.com:8443/api/readyz', 'http://staging.zhuxucloud.com/api/readyz', 'staging', 'staging.zhuxucloud.com', 'domain_hsts', 1],
    ['https://127.0.0.1/api/readyz', 'http://127.0.0.1/api/readyz', 'production', '127.0.0.1', 'temporary_ip_tls', 1],
    ['https://staging.zhuxucloud.com/api/readyz', 'http://staging.zhuxucloud.com/api/readyz', 'staging', 'zhuxucloud.com', 'domain_hsts', 1],
  ]
  for (const [health, redirect, target, host, mode, expectedStatus] of cases) {
    const result = runBash(`
set -euo pipefail
${python3Shim}
HEALTH_URL="$MOCK_HEALTH_URL"
HTTP_REDIRECT_URL="$MOCK_REDIRECT_URL"
DEPLOY_TARGET="$MOCK_DEPLOY_TARGET"
EXPECTED_PUBLIC_HOST="$MOCK_EXPECTED_HOST"
PUBLIC_INGRESS_MODE="$MOCK_INGRESS_MODE"
${validator}
validate_public_ingress_contract
`, {
      MOCK_HEALTH_URL: health,
      MOCK_REDIRECT_URL: redirect,
      MOCK_DEPLOY_TARGET: target,
      MOCK_EXPECTED_HOST: host,
      MOCK_INGRESS_MODE: mode,
    })
    assert.equal(
      result.status,
      expectedStatus,
      `${health}/${redirect}/${target}/${host}/${mode}: ${result.stderr}`,
    )
  }
})

test('application activation state replaces the prior checkpoint only after the candidate is durable', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const writeActivationState = script.match(
    /(write_activation_state\(\) \{[\s\S]*?\n\})\n\nrollback_application_release/u,
  )?.[1]
  assert.ok(writeActivationState, 'write_activation_state must remain executable in isolation')

  const sha = '5'.repeat(40)
  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
STATE_FILE="$ROOT_DIR/pending-application-release.env"
RELEASE_SHA=${sha}
printf '%s\n' ORIGINAL_CHECKPOINT=preserved > "$STATE_FILE"
chmod() { return 41; }
${writeActivationState}
if write_activation_state "$ROOT_DIR/releases/${sha}" "$ROOT_DIR/releases/previous"; then
  exit 91
fi
grep -Fqx 'ORIGINAL_CHECKPOINT=preserved' "$STATE_FILE"
test -z "$(find "$ROOT_DIR" -maxdepth 1 -name 'pending-application-release.env.next.*' -print -quit)"
`)

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test('rollback clears state only after the previous release is healthy on the migrated schema', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const rollbackFunction = script.match(
    /(rollback_application_release\(\) \{[\s\S]*?\n\})\n\nsnapshot_legacy_release/u,
  )?.[1]
  assert.ok(rollbackFunction, 'rollback_application_release must remain executable in isolation')

  const activeSha = '3'.repeat(40)
  const previousSha = '4'.repeat(40)
  const harness = `
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
RELEASES_DIR="$ROOT_DIR/releases"
FAILED_RELEASES_DIR="$ROOT_DIR/failed-releases"
CURRENT_LINK="$ROOT_DIR/current"
CURRENT_NEXT_LINK="$ROOT_DIR/current.next"
STATE_FILE="$ROOT_DIR/pending-application-release.env"
active="$RELEASES_DIR/${activeSha}"
previous="$RELEASES_DIR/${previousSha}"
  mkdir -p "$active" "$previous" "$FAILED_RELEASES_DIR" "$ROOT_DIR/mockbin"
  touch "$CURRENT_LINK"
  printf '%s' "$previous" > "$CURRENT_LINK-target"
  cat > "$ROOT_DIR/mockbin/readlink" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = -f ] && [ -f "$2-target" ]; then cat "$2-target"; exit 0; fi
exec /usr/bin/readlink "$@"
MOCK
  chmod +x "$ROOT_DIR/mockbin/readlink"
  export PATH="$ROOT_DIR/mockbin:$PATH"
cat > "$STATE_FILE" <<STATE
ACTIVATED_SHA=${activeSha}
ACTIVATED_TARGET=$active
PREVIOUS_TARGET=$previous
STATE
require_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
state_value() { awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$STATE_FILE"; }
release_sha_from_manifest() { printf '%s' ${previousSha}; }
build_and_up_release() { printf 'build:%s:%s\n' "$1" "$2" >> "$ROOT_DIR/calls"; }
verify_release_health() {
  printf 'verify:%s\n' "$1" >> "$ROOT_DIR/calls"
  [ "$SCHEMA_COMPATIBLE" = true ]
}
  atomic_link() { printf '%s' "$1" > "$CURRENT_LINK-target"; }
quarantine_release_dir() { mv "$1" "$FAILED_RELEASES_DIR/$2"; }
${rollbackFunction}
if [ "$SCHEMA_COMPATIBLE" = true ]; then
  rollback_application_release
  test "$(readlink -f "$CURRENT_LINK")" = "$(readlink -f "$previous")"
  test ! -f "$STATE_FILE"
  test ! -d "$active"
  grep -Fqx "verify:${previousSha}" "$ROOT_DIR/calls"
else
  if rollback_application_release; then exit 91; fi
  test "$(readlink -f "$CURRENT_LINK")" = "$(readlink -f "$previous")"
  test -f "$STATE_FILE"
  test -d "$active"
  grep -Fqx "verify:${previousSha}" "$ROOT_DIR/calls"
fi
`

  const compatible = runBash(harness, { SCHEMA_COMPATIBLE: 'true' })
  assert.equal(compatible.status, 0, `${compatible.stdout}\n${compatible.stderr}`)

  const incompatible = runBash(harness, { SCHEMA_COMPATIBLE: 'false' })
  assert.equal(incompatible.status, 0, `${incompatible.stdout}\n${incompatible.stderr}`)
  assert.match(incompatible.stderr, /not compatible with the migrated schema/u)
})
