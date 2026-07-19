import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const require = createRequire(new URL('../server/package.json', import.meta.url))
const { load: loadYaml } = require('js-yaml')
const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash'

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

function bashPath(url) {
  const pathname = decodeURIComponent(url.pathname)
  if (process.platform !== 'win32') return pathname
  return pathname.replace(/^\/([A-Za-z]):/u, (_match, drive) => `/${drive.toLowerCase()}`)
}

test('Caddy owns only shared 80/443 and routes the two domain names to loopback runtimes', async () => {
  const [caddyfile, compose, envExample] = await Promise.all([
    source('deploy/ingress/Caddyfile'),
    source('deploy/docker-compose.ingress.yml'),
    source('deploy/env/ingress.example'),
  ])

  assert.match(caddyfile, /http:\/\/\{\$PRODUCTION_HOST\}/u)
  assert.match(caddyfile, /http:\/\/\{\$STAGING_HOST\}/u)
  assert.match(caddyfile, /https:\/\/\{\$PRODUCTION_HOST\}/u)
  assert.match(caddyfile, /https:\/\/\{\$STAGING_HOST\}/u)
  assert.match(caddyfile, /redir https:\/\/\{\$PRODUCTION_HOST\}\{uri\} 308/u)
  assert.match(caddyfile, /redir https:\/\/\{\$STAGING_HOST\}\{uri\} 308/u)
  assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:8080/u)
  assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:8081/u)
  assert.match(caddyfile, /Strict-Transport-Security/u)
  assert.doesNotMatch(caddyfile, /8443|8082/u)

  assert.match(
    compose,
    /caddy:2\.10\.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d/u,
  )
  assert.match(compose, /network_mode:\s*host/u)
  assert.match(compose, /\/data/u)
  assert.match(compose, /\/config/u)
  assert.match(compose, /read_only:\s*true/u)
  assert.doesNotMatch(compose, /SUPABASE|DATABASE|JWT|SERVICE_KEY/u)
  assert.match(envExample, /^PRODUCTION_HOST=zhuxucloud\.com$/mu)
  assert.match(envExample, /^STAGING_HOST=staging\.zhuxucloud\.com$/mu)
})

test('provisioning validates a candidate, activates atomically, classifies bootstrap 502, and can roll back', async () => {
  const [script, workflow] = await Promise.all([
    source('scripts/provision-lighthouse-domain-ingress.sh'),
    source('.github/workflows/provision-domain-ingress.yml'),
  ])

  assert.match(script, /flock/u)
  assert.match(script, /docker pull/u)
  assert.match(script, /caddy validate/u)
  assert.match(script, /releases\/\$RELEASE_SHA/u)
  assert.match(script, /ln -sfn/u)
  assert.match(script, /rollback/u)
  assert.match(script, /--resolve/u)
  assert.match(script, /ingress_ready_upstream_unavailable/u)
  assert.match(script, /502/u)
  assert.match(script, /pending-activation\.env/u)
  assert.match(script, /failed\/\$\{?ACTIVATED_SHA/u)
  const activationFlag = script.indexOf('ACTIVATED=true')
  const activatedCompose = script.indexOf('compose_up "$RELEASE_DIR"')
  assert.ok(activationFlag >= 0 && activationFlag < activatedCompose)
  const rollbackBlock = script.match(/rollback\(\) \{([\s\S]*?)\n\}/u)?.[1] ?? ''
  assert.ok(
    rollbackBlock.indexOf('compose_up "$PREVIOUS_TARGET"')
      < rollbackBlock.indexOf('atomic_link "$PREVIOUS_TARGET"'),
    'failed previous compose recovery must leave the active CAS target retryable',
  )
  assert.doesNotMatch(script, /ssh-keyscan|StrictHostKeyChecking=no/u)

  assert.match(workflow, /workflow_dispatch:/u)
  assert.match(workflow, /environment:\s*Production/u)
  assert.match(workflow, /concurrency:/u)
  assert.match(workflow, /PROVISION_DOMAIN_INGRESS/u)
  assert.match(workflow, /PRODUCTION_DEPLOY_KNOWN_HOSTS/u)
  assert.match(workflow, /PRODUCTION_DEPLOY_PUBLIC_HOST/u)
  assert.match(workflow, /STAGING_DEPLOY_PUBLIC_HOST/u)
  assert.match(workflow, /action=rollback|ACTION=rollback/u)
  assert.match(workflow, /id:\s*finalize/u)
  assert.match(workflow, /steps\.public-probe\.outcome/u)
  assert.match(workflow, /steps\.finalize\.outcome/u)
  assert.match(workflow, /Recover pending activation after finalize failure/u)
  assert.match(workflow, /Strict-Transport-Security/u)
  assert.doesNotMatch(workflow, /ssh-keyscan|StrictHostKeyChecking=no/u)
})

test('public ingress probe workflow is valid Bash after YAML block scalar decoding', async () => {
  const workflow = loadYaml(await source('.github/workflows/provision-domain-ingress.yml'))
  const publicProbe = workflow.jobs.provision.steps.find((step) => step.id === 'public-probe')
  assert.ok(publicProbe?.run, 'public-probe shell is required')

  const result = spawnSync(bash, ['-n'], {
    input: publicProbe.run,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})

test('local HTTPS probe rejects wrong runtime identity and missing HSTS', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const match = script.match(/(probe_https\(\) \{[\s\S]*?\n\})\n\nfor attempt/u)
  assert.ok(match, 'probe_https function must remain executable in isolation')

  const harness = `
set -euo pipefail
ROOT_DIR="$(readlink -f "$(mktemp -d)")"
trap 'rm -rf "$ROOT_DIR"' EXIT
curl() {
  local headers='' body=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dump-header) headers="$2"; shift 2 ;;
      --output) body="$2"; shift 2 ;;
      --write-out|--resolve|--max-time) shift 2 ;;
      *) shift ;;
    esac
  done
  printf 'HTTP/2 200\\r\\n' > "$headers"
  if [ "\${MOCK_HSTS:-false}" = true ]; then
    printf 'Strict-Transport-Security: max-age=31536000\\r\\n' >> "$headers"
  fi
  printf '%s' "$MOCK_READINESS" > "$body"
  printf '200'
}
${match[1]}
if probe_status="$(probe_https zhuxucloud.com production wwdrkjnbvcbfytwnnyvs)"; then
  printf '%s' "$probe_status"
  exit 0
fi
exit 42
`
  const validReadiness = {
    status: 'ready',
    build: {
      deployTarget: 'production',
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      databaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
    },
  }
  const valid = runBash(harness, {
    MOCK_HSTS: 'true',
    MOCK_READINESS: JSON.stringify(validReadiness),
  })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(valid.stdout, '200')

  const invalidCases = [
    ['wrong deploy target', { ...validReadiness, build: { ...validReadiness.build, deployTarget: 'staging' } }, true],
    ['wrong project ref', { ...validReadiness, build: { ...validReadiness.build, databaseProjectRef: 'xemqmqpifsstkovbkatp' } }, true],
    ['missing HSTS', validReadiness, false],
  ]
  for (const [label, readiness, hsts] of invalidCases) {
    const result = runBash(harness, {
      MOCK_HSTS: String(hsts),
      MOCK_READINESS: JSON.stringify(readiness),
    })
    assert.notEqual(result.status, 0, `${label} unexpectedly passed: ${result.stdout}`)
  }
})

test('governed host map and activation commit reject swapped or stale authorities', async () => {
  const scriptPath = bashPath(new URL('scripts/provision-lighthouse-domain-ingress.sh', root))
  const sha = 'a'.repeat(40)
  const swapped = runBash(`
ROOT_DIR="$(readlink -f "$(mktemp -d)")"
trap 'rm -rf "$ROOT_DIR"' EXIT
mkdir -p "$ROOT_DIR/mockbin"
printf '#!/usr/bin/env bash\\nexit 0\\n' > "$ROOT_DIR/mockbin/flock"
chmod +x "$ROOT_DIR/mockbin/flock"
ACTION=activate RELEASE_SHA=${sha} RELEASE_ARCHIVE=/dev/null \\
  PRODUCTION_HOST=staging.zhuxucloud.com STAGING_HOST=zhuxucloud.com \\
  PATH="$ROOT_DIR/mockbin:$PATH" bash '${scriptPath}'
`)
  assert.notEqual(swapped.status, 0, 'swapped production and staging hosts must fail closed')

  const stale = runBash(`
set -euo pipefail
ROOT_DIR="$(readlink -f "$(mktemp -d)")"
trap 'rm -rf "$ROOT_DIR"' EXIT
mkdir -p "$ROOT_DIR/releases/${sha}" "$ROOT_DIR/releases/${'b'.repeat(40)}"
mkdir -p "$ROOT_DIR/mockbin"
printf '#!/usr/bin/env bash\\nexit 0\\n' > "$ROOT_DIR/mockbin/flock"
cat > "$ROOT_DIR/mockbin/readlink" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = -f ] && [ -f "$2-target" ]; then cat "$2-target"; exit 0; fi
exec /usr/bin/readlink "$@"
MOCK
chmod +x "$ROOT_DIR/mockbin/flock" "$ROOT_DIR/mockbin/readlink"
touch "$ROOT_DIR/current"
printf '%s' "$ROOT_DIR/releases/${'b'.repeat(40)}" > "$ROOT_DIR/current-target"
cat > "$ROOT_DIR/pending-activation.env" <<STATE
ACTIVATED_SHA=${sha}
ACTIVATED_TARGET=$ROOT_DIR/releases/${sha}
PREVIOUS_TARGET=
STATE
if ROOT_DIR="$ROOT_DIR" ACTION=commit RELEASE_SHA=${sha} \\
  PATH="$ROOT_DIR/mockbin:$PATH" bash '${scriptPath}'; then
  exit 99
fi
test -f "$ROOT_DIR/pending-activation.env"
`)
  assert.equal(stale.status, 0, stale.stderr)
})

test('rollback preserves its CAS state when previous compose recovery fails', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const functions = script.match(/(require_sha\(\) \{[\s\S]*?rollback\(\) \{[\s\S]*?\n\})\n\ncommit_activation/u)?.[1]
  assert.ok(functions, 'rollback function graph must remain executable in isolation')
  const sha = 'c'.repeat(40)
  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(readlink -f "$(mktemp -d)")"
trap 'rm -rf "$ROOT_DIR"' EXIT
active="$ROOT_DIR/releases/${sha}"
previous="$ROOT_DIR/releases/${'d'.repeat(40)}"
mkdir -p "$active/deploy" "$active/env" "$previous/deploy" "$previous/env" "$ROOT_DIR/mockbin"
touch "$active/deploy/docker-compose.ingress.yml" "$active/env/ingress.env"
touch "$previous/deploy/docker-compose.ingress.yml" "$previous/env/ingress.env"
touch "$ROOT_DIR/current"
printf '%s' "$active" > "$ROOT_DIR/current-target"
cat > "$ROOT_DIR/pending-activation.env" <<STATE
ACTIVATED_SHA=${sha}
ACTIVATED_TARGET=$active
PREVIOUS_TARGET=$previous
STATE
COMPOSE_PROJECT=workbuddy-ingress-test
STATE_FILE="$ROOT_DIR/pending-activation.env"
printf '#!/usr/bin/env bash\\nexit 0\\n' > "$ROOT_DIR/mockbin/flock"
printf '#!/usr/bin/env bash\\nexit 17\\n' > "$ROOT_DIR/mockbin/docker"
cat > "$ROOT_DIR/mockbin/readlink" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = -f ] && [ -f "$2-target" ]; then cat "$2-target"; exit 0; fi
exec /usr/bin/readlink "$@"
MOCK
chmod +x "$ROOT_DIR/mockbin/flock" "$ROOT_DIR/mockbin/docker" "$ROOT_DIR/mockbin/readlink"
export PATH="$ROOT_DIR/mockbin:$PATH"
${functions}
FAILED_RELEASE_SHA=${sha} rollback || true
test "$(readlink -f "$ROOT_DIR/current")" = "$active"
test -f "$ROOT_DIR/pending-activation.env"
test -d "$active"
`)
  assert.equal(result.status, 0, result.stderr)
})

test('initial rollback preserves its state when compose down fails', async () => {
  const scriptPath = bashPath(new URL('scripts/provision-lighthouse-domain-ingress.sh', root))
  const sha = 'e'.repeat(40)
  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
active="$ROOT_DIR/releases/${sha}"
mkdir -p "$active/deploy" "$active/env" "$ROOT_DIR/mockbin"
touch "$active/deploy/docker-compose.ingress.yml" "$active/env/ingress.env"
touch "$ROOT_DIR/current"
printf '%s' "$active" > "$ROOT_DIR/current-target"
cat > "$ROOT_DIR/pending-activation.env" <<STATE
ACTIVATED_SHA=${sha}
ACTIVATED_TARGET=$active
PREVIOUS_TARGET=
STATE
printf '#!/usr/bin/env bash\\nexit 0\\n' > "$ROOT_DIR/mockbin/flock"
printf '#!/usr/bin/env bash\\nexit 23\\n' > "$ROOT_DIR/mockbin/docker"
cat > "$ROOT_DIR/mockbin/readlink" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = -f ] && [ -f "$2-target" ]; then cat "$2-target"; exit 0; fi
exec /usr/bin/readlink "$@"
MOCK
chmod +x "$ROOT_DIR/mockbin/flock" "$ROOT_DIR/mockbin/docker" "$ROOT_DIR/mockbin/readlink"
export PATH="$ROOT_DIR/mockbin:$PATH"
if ROOT_DIR="$ROOT_DIR" ACTION=rollback FAILED_RELEASE_SHA=${sha} \\
  bash '${scriptPath}'; then
  exit 99
fi
test "$(readlink -f "$ROOT_DIR/current")" = "$active"
test -f "$ROOT_DIR/pending-activation.env"
test -d "$active"
`)
  assert.equal(result.status, 0, result.stderr)
})

test('activation failure still attempts rollback when candidate cleanup fails', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const restoreOnFailure = script.match(
    /(restore_on_failure\(\) \{[\s\S]*?\n\})\ntrap restore_on_failure/u,
  )?.[1]
  assert.ok(restoreOnFailure, 'restore_on_failure must remain executable in isolation')

  const result = runBash(`
set -euo pipefail
CANDIDATE_DIR=/tmp/workbuddy-ingress-candidate
ACTIVATED=true
RELEASE_SHA=${'f'.repeat(40)}
rollback() {
  printf '%s\n' rollback-called >&2
  return 0
}
rm() {
  printf '%s\n' cleanup-failed >&2
  return 41
}
${restoreOnFailure}
trap restore_on_failure ERR
false
`)

  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /cleanup-failed/u)
  assert.match(result.stderr, /rollback-called/u)
  assert.match(result.stderr, /candidate cleanup did not complete/u)
})

test('pre-activation failure quarantines a moved release so the same SHA can be retried', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const restoreOnFailure = script.match(
    /(restore_on_failure\(\) \{[\s\S]*?\n\})\ntrap restore_on_failure/u,
  )?.[1]
  assert.ok(restoreOnFailure, 'restore_on_failure must remain executable in isolation')

  const sha = '8'.repeat(40)
  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
RELEASE_SHA=${sha}
RELEASE_DIR="$ROOT_DIR/releases/$RELEASE_SHA"
STATE_FILE="$ROOT_DIR/pending-activation.env"
CANDIDATE_DIR="$ROOT_DIR/.candidate-$RELEASE_SHA"
ACTIVATED=false
mkdir -p "$RELEASE_DIR"
rollback() { printf '%s\n' unexpected-rollback >&2; return 91; }
mv() { printf '%s\n' quarantine-called >&2; return 0; }
${restoreOnFailure}
trap restore_on_failure ERR
false
`)

  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /quarantine-called/u)
  assert.doesNotMatch(result.stderr, /unexpected-rollback/u)
})

test('ingress activation state replaces the prior checkpoint only after the candidate is durable', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const writeActivationState = script.match(
    /(write_activation_state\(\) \{[\s\S]*?\n\})\n\nrollback/u,
  )?.[1]
  assert.ok(writeActivationState, 'write_activation_state must remain executable in isolation')

  const sha = '9'.repeat(40)
  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
STATE_FILE="$ROOT_DIR/pending-activation.env"
RELEASE_SHA=${sha}
RELEASE_DIR="$ROOT_DIR/releases/${sha}"
PREVIOUS_TARGET="$ROOT_DIR/releases/previous"
printf '%s\n' ORIGINAL_CHECKPOINT=preserved > "$STATE_FILE"
chmod() { return 41; }
${writeActivationState}
if write_activation_state; then
  exit 91
fi
grep -Fqx 'ORIGINAL_CHECKPOINT=preserved' "$STATE_FILE"
test -z "$(find "$ROOT_DIR" -maxdepth 1 -name 'pending-activation.env.next.*' -print -quit)"
`)

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test('Workflow Guard executes the domain ingress contract', async () => {
  const guard = await source('.github/workflows/workflow-guard.yml')
  assert.match(guard, /run: node --test scripts\/domain-sni-ingress\.contract\.test\.mjs/u)
})

test('Workflow Guard watches deployment ingress and atomicity paths on pushes and pull requests', async () => {
  const guard = loadYaml(await source('.github/workflows/workflow-guard.yml'))
  const requiredPaths = [
    '.github/workflows/provision-domain-ingress.yml',
    'scripts/domain-sni-ingress.contract.test.mjs',
    'scripts/application-release-atomicity.contract.test.mjs',
    'scripts/provision-lighthouse-domain-ingress.sh',
    'deploy/ingress/**',
    'deploy/docker-compose.ingress.yml',
    'deploy/env/ingress.example',
  ]

  for (const eventName of ['push', 'pull_request']) {
    const paths = guard.on?.[eventName]?.paths ?? []
    for (const requiredPath of requiredPaths) {
      assert.ok(paths.includes(requiredPath), `${eventName} does not watch ${requiredPath}`)
    }
  }
})

test('application deploy distinguishes first bootstrap from upgrades and verifies public release identity', async () => {
  const [workflow, deployScript] = await Promise.all([
    source('.github/workflows/deploy.yml'),
    source('scripts/deploy-lighthouse-server.sh'),
  ])

  assert.match(workflow, /initial_runtime_bootstrap:/u)
  assert.match(workflow, /initial_runtime_bootstrap_confirmation:/u)
  assert.match(workflow, /INGRESS_READY_UPSTREAM_UNAVAILABLE/u)
  assert.match(workflow, /ingress_ready_upstream_unavailable/u)
  assert.match(workflow, /public_readyz_status/u)
  assert.match(workflow, /502/u)
  assert.match(workflow, /readiness\.status !== 'ready'/u)

  assert.match(deployScript, /verify_readyz_identity/u)
  assert.match(
    deployScript,
    /node "\$ACTIVE_RELEASE_DIR\/scripts\/classify-public-ingress-url\.mjs"[\s\S]*?--expected-host "\$EXPECTED_PUBLIC_HOST"/u,
  )
  assert.equal((deployScript.match(/\*\/api\/readyz\)/gu) ?? []).length, 1)
})

test('application readyz verifier rejects wrong SHA, target, project refs, and readiness status', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const verifier = script.match(
    /(verify_readyz_identity\(\) \{[\s\S]*?\n\})\n\nverify_release_health/u,
  )?.[1]
  assert.ok(verifier, 'verify_readyz_identity must remain executable in isolation')

  const sha = '1'.repeat(40)
  const projectRef = 'wwdrkjnbvcbfytwnnyvs'
  const harness = `
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
expected_public_project_ref=${projectRef}
DEPLOY_TARGET=production
${verifier}
printf '%s' "$MOCK_READINESS" > "$ROOT_DIR/readyz.json"
if verify_readyz_identity "$ROOT_DIR/readyz.json" ${sha}; then
  exit 0
fi
exit 42
`
  const validReadiness = {
    status: 'ready',
    build: {
      releaseSha: sha,
      deployTarget: 'production',
      supabaseProjectRef: projectRef,
      databaseProjectRef: projectRef,
    },
  }
  const valid = runBash(harness, { MOCK_READINESS: JSON.stringify(validReadiness) })
  assert.equal(valid.status, 0, valid.stderr)

  const invalidCases = [
    ['not ready', { ...validReadiness, status: 'starting' }],
    ['wrong SHA', { ...validReadiness, build: { ...validReadiness.build, releaseSha: '2'.repeat(40) } }],
    ['wrong target', { ...validReadiness, build: { ...validReadiness.build, deployTarget: 'staging' } }],
    ['wrong Supabase ref', { ...validReadiness, build: { ...validReadiness.build, supabaseProjectRef: 'xemqmqpifsstkovbkatp' } }],
    ['wrong database ref', { ...validReadiness, build: { ...validReadiness.build, databaseProjectRef: 'xemqmqpifsstkovbkatp' } }],
  ]
  for (const [label, readiness] of invalidCases) {
    const result = runBash(harness, { MOCK_READINESS: JSON.stringify(readiness) })
    assert.equal(result.status, 42, `${label} unexpectedly passed: ${result.stderr}`)
  }
})
