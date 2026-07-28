import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
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

function yamlStepRun(workflow, stepId) {
  const lines = workflow.split(/\r?\n/u)
  const idIndex = lines.findIndex((line) => line.trim() === `id: ${stepId}`)
  assert.notEqual(idIndex, -1, `${stepId} step must exist`)
  const stepIndent = lines[idIndex].search(/\S/u) - 2
  const runIndex = lines.findIndex((line, index) => {
    if (index <= idIndex) return false
    const indent = line.search(/\S/u)
    if (indent >= 0 && indent <= stepIndent) return false
    return line.trim() === 'run: |'
  })
  assert.ok(runIndex > idIndex, `${stepId} must contain a run block`)
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

function workflowEventPaths(workflow, eventName) {
  const lines = workflow.split(/\r?\n/u)
  const eventIndex = lines.findIndex((line) => line === `  ${eventName}:`)
  assert.notEqual(eventIndex, -1, `${eventName} event must exist`)
  const pathsIndex = lines.findIndex((line, index) => index > eventIndex && line === '    paths:')
  assert.ok(pathsIndex > eventIndex, `${eventName} paths must exist`)
  const paths = []
  for (let index = pathsIndex + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s{6}-\s+['"]?([^'"]+)['"]?\s*$/u)
    if (!match) break
    paths.push(match[1])
  }
  return paths
}

test('provision contract runs from a clean checkout without repository dependencies', async () => {
  const [workflow, contract] = await Promise.all([
    source('.github/workflows/provision-domain-ingress.yml'),
    source('scripts/domain-sni-ingress.contract.test.mjs'),
  ])

  const setupNode = workflow.indexOf('uses: actions/setup-node@v6')
  const contractTest = workflow.indexOf('node --test scripts/domain-sni-ingress.contract.test.mjs')
  assert.ok(setupNode >= 0, 'the clean runner must pin Node before executing the contract')
  assert.ok(setupNode < contractTest, 'Node setup must precede the ingress contract test')
  assert.ok(!contract.includes(['create', 'Require'].join('')))
  assert.ok(!contract.includes(['js', 'yaml'].join('-')))
  for (const specifier of contract.matchAll(/from\s+['"]([^'"]+)['"]/gu)) {
    assert.match(specifier[1], /^node:/u, `unexpected clean-runner dependency: ${specifier[1]}`)
  }
})

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
  assert.match(
    caddyfile,
    /\(workbuddy_upstream_error_response\)\s*\{[\s\S]*?handle_errors\s*\{[\s\S]*?import workbuddy_security_headers[\s\S]*?respond "" \{err\.status_code\}/u,
    'Caddy-generated upstream errors must preserve their status behind the shared security headers',
  )
  assert.equal(
    Array.from(caddyfile.matchAll(/^\s*import workbuddy_upstream_error_response\s*$/gmu)).length,
    2,
    'both HTTPS virtual hosts must harden bootstrap 502 responses',
  )
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
  const workflow = await source('.github/workflows/provision-domain-ingress.yml')
  const publicProbe = yamlStepRun(workflow, 'public-probe')

  const result = spawnSync(bash, ['-n'], {
    input: publicProbe,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})

test('public ingress probe retries transient network readiness and reports target status', async () => {
  const workflow = await source('.github/workflows/provision-domain-ingress.yml')
  const publicProbe = yamlStepRun(workflow, 'public-probe')

  assert.match(publicProbe, /getent ahostsv4/u)
  assert.match(publicProbe, /for attempt in \$\(seq 1 12\)/u)
  assert.match(publicProbe, /--connect-timeout 5/u)
  assert.match(publicProbe, /HTTP probe attempt \$attempt for \$host/u)
  assert.match(publicProbe, /HTTPS probe attempt \$attempt for \$host/u)
  assert.match(publicProbe, /sleep 5/u)
})

test('initial ingress may commit an origin-ready candidate only with explicit public-block confirmation', async () => {
  const workflow = await source('.github/workflows/provision-domain-ingress.yml')
  assert.match(workflow, /origin_bootstrap_confirmation:/u)
  assert.match(workflow, /COMMIT_ORIGIN_READY_PUBLIC_BLOCKED/u)
  assert.match(workflow, /id:\s*public-probe[\s\S]*?continue-on-error:\s*true/u)

  const originProbe = yamlStepRun(workflow, 'origin-probe')
  const syntax = spawnSync(bash, ['-n'], { input: originProbe, encoding: 'utf8' })
  assert.equal(syntax.status, 0, syntax.stderr)
  assert.match(originProbe, /--resolve "\$host:80:\$origin_ip"/u)
  assert.match(originProbe, /--resolve "\$host:443:\$origin_ip"/u)
  assert.match(originProbe, /\[ "\$status" = 308 \]/u)
  assert.match(originProbe, /Strict-Transport-Security/u)
  assert.match(originProbe, /200\|502/u)

  const finalize = yamlStepRun(workflow, 'finalize')
  assert.match(finalize, /BOOTSTRAP_MODE.*initial/u)
  assert.match(finalize, /ORIGIN_BOOTSTRAP_CONFIRMATION.*COMMIT_ORIGIN_READY_PUBLIC_BLOCKED/u)
  assert.match(finalize, /origin_ingress_ready=true/u)
  assert.match(finalize, /public_domain_ready=false/u)
  assert.match(
    finalize,
    /ORIGIN_INGRESS_READY=\$origin_ingress_ready PUBLIC_DOMAIN_READY=\$public_domain_ready/u,
  )
  assert.match(workflow, /originIngressReady/u)
  assert.match(workflow, /publicDomainReady/u)
})

test('ingress commit persists atomic machine-readable origin and public readiness state', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const writeCommittedState = script.match(
    /(write_committed_state\(\) \{[\s\S]*?\n\})\n\ncommit_activation/u,
  )?.[1]
  const commitActivation = script.match(
    /(commit_activation\(\) \{[\s\S]*?\n\})\n\nmkdir -p/u,
  )?.[1]
  assert.ok(writeCommittedState, 'write_committed_state must remain executable in isolation')
  assert.ok(commitActivation, 'commit_activation must remain executable in isolation')

  const sha = '4'.repeat(40)
  const valid = runBash(`
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
STATE_FILE="$ROOT_DIR/pending-activation.env"
COMMITTED_STATE_FILE="$ROOT_DIR/committed-ingress-state.json"
active="$ROOT_DIR/releases/${sha}"
mkdir -p "$active"
touch "$ROOT_DIR/current"
printf '%s' "$active" > "$ROOT_DIR/current-target"
cat > "$STATE_FILE" <<STATE
ACTIVATED_SHA=${sha}
ACTIVATED_TARGET=$active
PREVIOUS_TARGET=
STATE
require_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
require_boolean() { case "$2" in true|false) ;; *) return 2 ;; esac; }
load_state() { source "$STATE_FILE"; }
readlink() {
  if [ "$1" = -f ] && [ -f "$2-target" ]; then cat "$2-target"; return 0; fi
  command readlink "$@"
}
${writeCommittedState}
${commitActivation}
RELEASE_SHA=${sha} ORIGIN_INGRESS_READY=true PUBLIC_DOMAIN_READY=false commit_activation
test ! -f "$STATE_FILE"
node -e '
  const fs = require("node:fs");
  const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (state.releaseSha !== process.argv[2]
    || state.originIngressReady !== true
    || state.publicDomainReady !== false) process.exit(1);
' "$COMMITTED_STATE_FILE" ${sha}
`)
  assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`)

  const invalid = runBash(`
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
STATE_FILE="$ROOT_DIR/pending-activation.env"
COMMITTED_STATE_FILE="$ROOT_DIR/committed-ingress-state.json"
active="$ROOT_DIR/releases/${sha}"
mkdir -p "$active"
touch "$ROOT_DIR/current"
printf '%s' "$active" > "$ROOT_DIR/current-target"
cat > "$STATE_FILE" <<STATE
ACTIVATED_SHA=${sha}
ACTIVATED_TARGET=$active
PREVIOUS_TARGET=
STATE
require_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
require_boolean() { case "$2" in true|false) ;; *) return 2 ;; esac; }
load_state() { source "$STATE_FILE"; }
readlink() {
  if [ "$1" = -f ] && [ -f "$2-target" ]; then cat "$2-target"; return 0; fi
  command readlink "$@"
}
${writeCommittedState}
${commitActivation}
if RELEASE_SHA=${sha} ORIGIN_INGRESS_READY=yes PUBLIC_DOMAIN_READY=false commit_activation; then
  exit 91
fi
test -f "$STATE_FILE"
test ! -f "$COMMITTED_STATE_FILE"
`)
  assert.equal(invalid.status, 0, `${invalid.stdout}\n${invalid.stderr}`)
})

test('deploy preflight uses origin-direct ingress only for explicit staging bootstrap', async () => {
  const workflow = await source('.github/workflows/deploy.yml')
  const preflight = yamlStepRun(workflow, 'ingress-preflight')
  const syntax = spawnSync(bash, ['-n'], { input: preflight, encoding: 'utf8' })
  assert.equal(syntax.status, 0, syntax.stderr)
  assert.match(preflight, /\[ "\$DEPLOY_TARGET" = staging \]/u)
  assert.match(preflight, /--resolve "\$EXPECTED_PUBLIC_HOST:80:\$origin_ip"/u)
  assert.match(preflight, /--resolve "\$EXPECTED_PUBLIC_HOST:443:\$origin_ip"/u)
  assert.match(preflight, /\[ "\$redirect_status" = 308 \]/u)
  assert.match(preflight, /Strict-Transport-Security/u)
  assert.match(preflight, /originIngressReady=true publicDomainReady=false/u)
})

test('application postdeploy origin fallback is staging-only and reports public readiness separately', async () => {
  const [workflow, deployScript] = await Promise.all([
    source('.github/workflows/deploy.yml'),
    source('scripts/deploy-lighthouse-server.sh'),
  ])

  assert.match(workflow, /ORIGIN_INGRESS_IP="\$DEPLOY_HOST"/u)
  assert.match(deployScript, /ORIGIN_INGRESS_IP/u)
  assert.match(deployScript, /\[ "\$DEPLOY_TARGET" = staging \]/u)
  assert.match(deployScript, /--resolve "\$EXPECTED_PUBLIC_HOST:443:\$ORIGIN_INGRESS_IP"/u)
  assert.match(deployScript, /--resolve "\$EXPECTED_PUBLIC_HOST:80:\$ORIGIN_INGRESS_IP"/u)
  assert.match(deployScript, /"originIngressReady":true/u)
  assert.match(deployScript, /"publicDomainReady":/u)
})

test('local HTTPS probe rejects wrong runtime identity and missing HSTS', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const match = script.match(/(probe_https\(\) \{[\s\S]*?\n\})\n\nprobe_ingress_pair/u)
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
python3() {
  node -e '
    const fs = require("node:fs");
    const readiness = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const build = readiness.build || {};
    if (readiness.status !== "ready"
      || build.deployTarget !== process.argv[2]
      || build.supabaseProjectRef !== process.argv[3]
      || build.databaseProjectRef !== process.argv[3]) process.exit(1);
  ' "$2" "$3" "$4"
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
  const rollbackFunction = script.match(/(rollback\(\) \{[\s\S]*?\n\})\n\ncommit_activation/u)?.[1]
  assert.ok(rollbackFunction, 'rollback must remain executable in isolation')
  const sha = 'c'.repeat(40)
  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(readlink -f "$(mktemp -d)")"
trap 'rm -rf "$ROOT_DIR"' EXIT
active="$ROOT_DIR/releases/${sha}"
previous="$ROOT_DIR/releases/${'d'.repeat(40)}"
mkdir -p "$active" "$previous" "$ROOT_DIR/mockbin"
touch "$ROOT_DIR/current"
printf '%s' "$active" > "$ROOT_DIR/current-target"
cat > "$ROOT_DIR/pending-activation.env" <<STATE
ACTIVATED_SHA=${sha}
ACTIVATED_TARGET=$active
PREVIOUS_TARGET=$previous
STATE
STATE_FILE="$ROOT_DIR/pending-activation.env"
cat > "$ROOT_DIR/mockbin/readlink" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = -f ] && [ -f "$2-target" ]; then cat "$2-target"; exit 0; fi
exec /usr/bin/readlink "$@"
MOCK
chmod +x "$ROOT_DIR/mockbin/readlink"
export PATH="$ROOT_DIR/mockbin:$PATH"
require_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
load_state() { source "$STATE_FILE"; }
compose_up() { return 17; }
atomic_link() { printf '%s' "$1" > "$ROOT_DIR/current-target"; }
verify_ingress_release() { return 91; }
${rollbackFunction}
FAILED_RELEASE_SHA=${sha} rollback || true
test "$(readlink -f "$ROOT_DIR/current")" = "$active"
test -f "$ROOT_DIR/pending-activation.env"
test -d "$active"
`)
  assert.equal(result.status, 0, result.stderr)
})

test('rollback preserves state when restored ingress probes fail after compose succeeds', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const rollbackFunction = script.match(
    /(rollback\(\) \{[\s\S]*?\n\})\n\ncommit_activation/u,
  )?.[1]
  assert.ok(rollbackFunction, 'rollback must remain executable in isolation')
  const sha = '7'.repeat(40)
  const previousSha = '6'.repeat(40)
  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(readlink -f "$(mktemp -d)")"
trap 'rm -rf "$ROOT_DIR"' EXIT
STATE_FILE="$ROOT_DIR/pending-activation.env"
active="$ROOT_DIR/releases/${sha}"
previous="$ROOT_DIR/releases/${previousSha}"
mkdir -p "$active" "$previous"
touch "$ROOT_DIR/current"
printf '%s' "$active" > "$ROOT_DIR/current-target"
cat > "$STATE_FILE" <<STATE
ACTIVATED_SHA=${sha}
ACTIVATED_TARGET=$active
PREVIOUS_TARGET=$previous
STATE
require_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
load_state() { source "$STATE_FILE"; }
readlink() {
  if [ "$1" = -f ] && [ -f "$2-target" ]; then cat "$2-target"; return 0; fi
  command readlink "$@"
}
compose_up() { return 0; }
atomic_link() { printf '%s' "$1" > "$ROOT_DIR/current-target"; }
verify_ingress_release() { return 1; }
${rollbackFunction}
FAILED_RELEASE_SHA=${sha} rollback || true
test "$(readlink -f "$ROOT_DIR/current")" = "$previous"
test -f "$STATE_FILE"
test -d "$active"
`)

  assert.equal(result.status, 0, result.stderr)
})

test('rollback verification honors a committed origin-ready public-blocked state', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const readCommittedReadiness = script.match(
    /(read_committed_public_readiness\(\) \{[\s\S]*?\n\})\n\nverify_ingress_release/u,
  )?.[1]
  const verifyIngressRelease = script.match(
    /(verify_ingress_release\(\) \{[\s\S]*?\n\})\n\nverify_ingress_stopped/u,
  )?.[1]
  assert.ok(readCommittedReadiness, 'committed public readiness reader must remain executable in isolation')
  assert.ok(verifyIngressRelease, 'verify_ingress_release must remain executable in isolation')

  const sha = '6'.repeat(40)
  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
COMMITTED_STATE_FILE="$ROOT_DIR/committed-ingress-state.json"
release_dir="$ROOT_DIR/releases/${sha}"
mkdir -p "$release_dir"
touch "$ROOT_DIR/current"
printf '%s' "$release_dir" > "$ROOT_DIR/current-target"
printf '%s' '{"status":"committed","releaseSha":"${sha}","originIngressReady":true,"publicDomainReady":false}' > "$COMMITTED_STATE_FILE"
readlink() {
  if [ "$1" = -f ] && [ -f "$2-target" ]; then cat "$2-target"; return 0; fi
  command readlink "$@"
}
python3() {
  node -e '
    const fs = require("node:fs");
    const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (state.releaseSha !== process.argv[2]
      || state.originIngressReady !== true
      || typeof state.publicDomainReady !== "boolean") process.exit(1);
    process.stdout.write(String(state.publicDomainReady));
  ' "$2" "$3"
}
probe_ingress_pair() {
  if [ -n "\${1:-}" ]; then
    printf local > "$ROOT_DIR/local-called"
    return 0
  fi
  printf public > "$ROOT_DIR/public-called"
  return 1
}
sleep() { :; }
${readCommittedReadiness}
${verifyIngressRelease}
verify_ingress_release "$release_dir"
test -f "$ROOT_DIR/local-called"
test ! -f "$ROOT_DIR/public-called"
`)

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
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

test('initial activation records no previous target unless current is a valid release symlink', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const resolvePreviousTarget = script.match(
    /(resolve_previous_target\(\) \{[\s\S]*?\n\})\n\nRELEASE_DIR=/u,
  )?.[1]
  assert.ok(resolvePreviousTarget, 'resolve_previous_target must remain executable in isolation')
  const symlinkProbe = process.platform === 'win32'
    ? ''
    : `
previous="$ROOT_DIR/releases/${'1'.repeat(40)}"
mkdir -p "$previous"
ln -s "$previous" "$ROOT_DIR/current"
test "$(resolve_previous_target)" = "$previous"
rm -f "$ROOT_DIR/current"
`

  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
${resolvePreviousTarget}
test -z "$(resolve_previous_target)"
${symlinkProbe}
touch "$ROOT_DIR/current"
set +e
resolve_previous_target
status=$?
set -e
test "$status" -ne 0
`)

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test('post-activation validation failure invokes rollback instead of bypassing the ERR trap', async () => {
  const script = await source('scripts/provision-lighthouse-domain-ingress.sh')
  const restoreOnFailure = script.match(
    /(restore_on_failure\(\) \{[\s\S]*?\n\})\ntrap restore_on_failure/u,
  )?.[1]
  const failActivation = script.match(
    /(fail_activation\(\) \{[\s\S]*?\n\})\n\nif \[ -d "\$RELEASE_DIR" \]/u,
  )?.[1]
  assert.ok(restoreOnFailure, 'restore_on_failure must remain executable in isolation')
  assert.ok(failActivation, 'fail_activation must remain executable in isolation')
  assert.doesNotMatch(script.slice(script.indexOf('ACTIVATED=true')), /\bexit 1\b/u)

  const result = runBash(`
set -euo pipefail
CANDIDATE_DIR=/tmp/workbuddy-ingress-candidate
ACTIVATED=true
RELEASE_SHA=${'2'.repeat(40)}
rollback() { printf '%s\\n' rollback-called >&2; return 0; }
${restoreOnFailure}
${failActivation}
trap restore_on_failure ERR
fail_activation forced-probe-failure
`)

  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /forced-probe-failure/u)
  assert.match(result.stderr, /rollback-called/u)
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
  const guard = await source('.github/workflows/workflow-guard.yml')
  const requiredPaths = [
    '.github/workflows/provision-domain-ingress.yml',
    'scripts/domain-sni-ingress.contract.test.mjs',
    'scripts/application-release-atomicity.contract.test.mjs',
    'scripts/provision-lighthouse-domain-ingress.sh',
    'deploy/ingress/**',
    'deploy/docker-compose.ingress.yml',
    'deploy/env/ingress.example',
  ]

  const eventPaths = {}
  for (const eventName of ['push', 'pull_request']) {
    const paths = workflowEventPaths(guard, eventName)
    eventPaths[eventName] = paths
    for (const requiredPath of requiredPaths) {
      assert.ok(paths.includes(requiredPath), `${eventName} does not watch ${requiredPath}`)
    }
  }
  assert.deepEqual(
    [...eventPaths.push].sort(),
    [...eventPaths.pull_request].sort(),
    'push and pull_request must run the same workflow guard path surface',
  )
})

test('application deploy distinguishes first bootstrap from upgrades and verifies public release identity', async () => {
  const [workflow, deployScript] = await Promise.all([
    source('.github/workflows/deploy.yml'),
    source('scripts/deploy-lighthouse-server.sh'),
  ])

  assert.doesNotMatch(workflow, /initial_runtime_bootstrap:/u)
  assert.match(workflow, /initial_runtime_bootstrap_confirmation:/u)
  assert.match(
    workflow,
    /initial_runtime_bootstrap_confirmation == 'INGRESS_READY_UPSTREAM_UNAVAILABLE' && 'true' \|\| 'false'/u,
  )
  assert.match(workflow, /INGRESS_READY_UPSTREAM_UNAVAILABLE/u)
  assert.match(workflow, /ingress_ready_upstream_unavailable/u)
  assert.match(workflow, /public_readyz_status/u)
  assert.match(workflow, /502/u)
  assert.match(workflow, /readiness\.status !== 'ready'/u)

  assert.match(deployScript, /verify_readyz_identity/u)
  assert.match(deployScript, /validate_public_ingress_contract/u)
  assert.match(deployScript, /python3/u)
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
python3() {
  node -e '
    const fs = require("node:fs");
    const readiness = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const build = readiness.build || {};
    if (readiness.status !== "ready"
      || build.releaseSha !== process.env.RELEASE_SHA_TO_VERIFY
      || build.deployTarget !== process.env.DEPLOY_TARGET_TO_VERIFY
      || build.supabaseProjectRef !== process.env.EXPECTED_PROJECT_REF_TO_VERIFY
      || build.databaseProjectRef !== process.env.EXPECTED_PROJECT_REF_TO_VERIFY) process.exit(1);
  ' "$2"
}
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
