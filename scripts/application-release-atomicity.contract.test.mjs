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
  assert.match(
    script,
    /build_and_up_release "\$previous_target" "\$previous_sha" allow_legacy_source/u,
  )
  assert.doesNotMatch(script, /git ls-files -z \| xargs -0 -r rm/u)
  assert.doesNotMatch(script, /rm -rf client\/dist/u)
  assert.doesNotMatch(script, /tar -xzf "\$RELEASE_ARCHIVE" -C "\$APP_DIR"/u)
})

test('deployment failures capture readiness and container diagnostics before rollback', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const diagnostics = script.match(
    /(print_runtime_failure_diagnostics\(\) \{[\s\S]*?\n\})\n\nvalidate_release_archive/u,
  )?.[1]
  assert.ok(diagnostics, 'runtime failure diagnostics must remain executable in isolation')
  assert.match(diagnostics, /label=com\.docker\.compose\.project=/u)
  assert.match(diagnostics, /container inspect/u)
  assert.match(diagnostics, /\/api\/readyz/u)
  assert.match(diagnostics, /logs --timestamps --tail 200/u)

  const failureBody = script.match(
    /(deployment_failure\(\) \{[\s\S]*?\n\})\ntrap deployment_failure/u,
  )?.[1]
  assert.ok(failureBody, 'deployment failure handler must remain executable in isolation')
  assert.match(failureBody, /print_runtime_failure_diagnostics \|\| true/u)
  assert.ok(
    failureBody.indexOf('print_runtime_failure_diagnostics') < failureBody.indexOf('rollback_application_release'),
    'diagnostics must run before rollback mutates the containers',
  )
})

test('initial bootstrap treats an absent current pointer as no previous release', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const resolveCurrentReleaseTarget = script.match(
    /(resolve_current_release_target\(\) \{[\s\S]*?\n\})\n\n/u,
  )?.[1]
  assert.ok(
    resolveCurrentReleaseTarget,
    'resolve_current_release_target must remain executable in isolation',
  )

  const result = runBash(`
set -euo pipefail
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
CURRENT_LINK="$ROOT_DIR/current"
readlink() {
  printf 'called\n' >> "$ROOT_DIR/readlink-calls"
  [ "$MOCK_READLINK_RESULT" != fail ] || return 1
  printf '%s' "$MOCK_READLINK_RESULT"
}
${resolveCurrentReleaseTarget}
test ! -e "$CURRENT_LINK"
test -z "$(resolve_current_release_target)"
test ! -f "$ROOT_DIR/readlink-calls"
touch "$CURRENT_LINK"
test "$(resolve_current_release_target)" = "$MOCK_READLINK_RESULT"
grep -Fqx called "$ROOT_DIR/readlink-calls"
MOCK_READLINK_RESULT=fail
if resolve_current_release_target; then exit 91; fi
`, { MOCK_READLINK_RESULT: '/managed/releases/previous' })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.equal(script.match(/readlink -f "\$CURRENT_LINK"/gu)?.length, 1)
  assert.equal(script.match(/resolve_current_release_target/g)?.length, 4)
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
    /INITIAL_RUNTIME_BOOTSTRAP:\s*\$\{\{ github\.event\.inputs\.initial_runtime_bootstrap_confirmation == 'INGRESS_READY_UPSTREAM_UNAVAILABLE' && 'true' \|\| 'false' \}\}/u,
  )
  const workflow = loadYaml(deployWorkflow)
  const deploymentStep = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .find((step) => step.name === 'Deploy to self-hosted server')
  assert.ok(deploymentStep?.run, 'self-hosted deployment shell is required')
  assert.equal(
    deploymentStep.env?.INITIAL_RUNTIME_BOOTSTRAP,
    "${{ github.event.inputs.initial_runtime_bootstrap_confirmation == 'INGRESS_READY_UPSTREAM_UNAVAILABLE' && 'true' || 'false' }}",
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

test('deployment promotes the tested server build without compiling TypeScript on the runtime host', async () => {
  const [deployWorkflow, dockerfile, compose, deployScript] = await Promise.all([
    source('.github/workflows/deploy.yml'),
    source('server/Dockerfile'),
    source('deploy/docker-compose.lighthouse.yml'),
    source('scripts/deploy-lighthouse-server.sh'),
  ])
  const workflow = loadYaml(deployWorkflow)
  const serverSteps = workflow.jobs['server-quality'].steps
  const serverBuildIndex = serverSteps.findIndex((step) => step.name === 'Server build')
  const serverStampIndex = serverSteps.findIndex((step) => step.name === 'Stamp server build provenance')
  const serverUploadIndex = serverSteps.findIndex((step) => step.name === 'Upload tested server build')
  const serverStamp = serverSteps[serverStampIndex]

  assert.notEqual(serverBuildIndex, -1, 'server build step is required')
  assert.ok(serverBuildIndex < serverStampIndex, 'server provenance must be stamped after compilation')
  assert.ok(serverStampIndex < serverUploadIndex, 'only the stamped server build may be uploaded')
  assert.equal(serverStamp.env.RELEASE_SHA, '${{ github.sha }}')
  assert.match(serverStamp.run, /workbuddy-server-build\.json/u)
  assert.match(serverStamp.run, /process\.env\.RELEASE_SHA/u)
  assert.deepEqual(serverSteps[serverUploadIndex].with, {
    name: 'server-build',
    path: 'server/dist',
    'if-no-files-found': 'error',
    'retention-days': 7,
  })

  const deployJob = workflow.jobs['deploy-server']
  const deploySteps = deployJob.steps
  assert.ok(deployJob.needs.includes('server-quality'))
  assert.match(deployJob.if, /needs\.server-quality\.result == 'success'/u)
  const serverDownload = deploySteps.find((step) => step.name === 'Download tested server build')
  assert.deepEqual(serverDownload?.with, {
    name: 'server-build',
    path: 'server/dist',
  })
  const remoteDeploy = deploySteps.find((step) => step.name === 'Deploy to self-hosted server')
  const remoteDeployRun = remoteDeploy?.run ?? ''
  const serverArtifactCopyIndex = remoteDeployRun.indexOf('cp -a server/dist/. "$RELEASE_DIR/server/dist/"')
  const releaseArchiveIndex = remoteDeployRun.indexOf('tar -czf "$RELEASE_ARCHIVE"')
  assert.ok(serverArtifactCopyIndex >= 0, 'tested server artifact must enter the release directory')
  assert.ok(
    serverArtifactCopyIndex < releaseArchiveIndex,
    'tested server artifact must be copied before the release archive is created',
  )

  const apiSection = compose.slice(compose.indexOf('  api:'), compose.indexOf('  worker:'))
  const workerSection = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  web:'))
  assert.match(apiSection, /target:\s*prebuilt-runtime/u)
  assert.match(workerSection, /target:\s*prebuilt-runtime/u)

  const prebuiltStart = dockerfile.indexOf('FROM runtime-base AS prebuilt-runtime')
  const sourceBuilderStart = dockerfile.indexOf('FROM node:22-bookworm-slim AS deps', prebuiltStart + 1)
  const defaultRuntimeStart = dockerfile.indexOf('FROM runtime-base AS runtime', prebuiltStart + 1)
  assert.ok(prebuiltStart >= 0, 'server Dockerfile must expose a prebuilt runtime target')
  assert.ok(
    sourceBuilderStart > prebuiltStart,
    'the prebuilt target must precede every source-compilation stage',
  )
  assert.ok(defaultRuntimeStart > prebuiltStart, 'the source-building runtime must remain the default target')
  const prebuiltStage = dockerfile.slice(prebuiltStart, sourceBuilderStart)
  assert.match(prebuiltStage, /COPY dist \.\/dist/u)
  assert.doesNotMatch(prebuiltStage, /builder|npm run build|tsc/u)

  assert.match(deployScript, /server\/dist\/index\.js/u)
  assert.match(deployScript, /workbuddy-server-build\.json/u)
  assert.match(deployScript, /Server build provenance does not match release SHA/u)
  assert.match(
    deployScript,
    /set_release_contract "\$CANDIDATE_DIR" "\$RELEASE_SHA" require_prebuilt/u,
  )
})

test('rollback can rebuild a pre-artifact release while candidates require exact server provenance', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const frontendManifestReader = script.match(
    /(release_sha_from_manifest\(\) \{[\s\S]*?\n\})\n\nserver_release_sha_from_manifest/u,
  )?.[1]
  const serverManifestReader = script.match(
    /(server_release_sha_from_manifest\(\) \{[\s\S]*?\n\})\n\nset_release_contract/u,
  )?.[1]
  const releaseContract = script.match(
    /(set_release_contract\(\) \{[\s\S]*?\n\})\n\nrun_docker_compose/u,
  )?.[1]
  const buildAndUp = script.match(
    /(build_and_up_release\(\) \{[\s\S]*?\n\})\n\nverify_readyz_identity/u,
  )?.[1]
  assert.ok(frontendManifestReader, 'frontend release manifest reader must remain executable')
  assert.ok(serverManifestReader, 'server release manifest reader must remain executable')
  assert.ok(releaseContract, 'release contract must remain executable')
  assert.ok(buildAndUp, 'release build-and-up path must remain executable')

  const legacySha = '6'.repeat(40)
  const candidateSha = '7'.repeat(40)
  const result = runBash(`
set -euo pipefail
${python3Shim}
ROOT_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_DIR"' EXIT
COMPOSE_FILE=deploy/docker-compose.lighthouse.yml
make_release() {
  local release_dir="$1" release_sha="$2"
  mkdir -p "$release_dir/deploy/env" "$release_dir/scripts" "$release_dir/client/dist" "$release_dir/server/migrations"
  : > "$release_dir/$COMPOSE_FILE"
  : > "$release_dir/deploy/env/server.production.env"
  : > "$release_dir/scripts/classify-public-ingress-url.mjs"
  printf '{"releaseSha":"%s"}\n' "$release_sha" > "$release_dir/client/dist/workbuddy-build.json"
  printf '%s\n' 'SELECT 1;' > "$release_dir/server/migrations/001_contract.sql"
}
${frontendManifestReader}
${serverManifestReader}
${releaseContract}
${buildAndUp}
run_api_build_with_cache_repair() { printf 'build:%s:%s\n' "$1" "$2" >> "$ROOT_DIR/calls"; }
run_docker_compose() { printf 'compose:%s:%s:%s\n' "$1" "$2" "${'$'}5" >> "$ROOT_DIR/calls"; }

legacy="$ROOT_DIR/legacy"
make_release "$legacy" ${legacySha}
build_and_up_release "$legacy" ${legacySha} allow_legacy_source
grep -Fqx "build:$legacy:${legacySha}" "$ROOT_DIR/calls"
if set_release_contract "$legacy" ${legacySha} require_prebuilt; then exit 91; fi

candidate="$ROOT_DIR/candidate"
make_release "$candidate" ${candidateSha}
mkdir -p "$candidate/server/dist"
: > "$candidate/server/dist/index.js"
printf '{"releaseSha":"%s"}\n' ${candidateSha} > "$candidate/server/dist/workbuddy-server-build.json"
set_release_contract "$candidate" ${candidateSha} require_prebuilt
rm "$candidate/server/dist/workbuddy-server-build.json"
if set_release_contract "$candidate" ${candidateSha} require_prebuilt; then exit 92; fi
if set_release_contract "$candidate" ${candidateSha} allow_legacy_source; then exit 93; fi
`)

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test('workflow installs server dependencies before the YAML-backed atomicity contract', async () => {
  const workflow = loadYaml(await source('.github/workflows/workflow-guard.yml'))
  const steps = workflow.jobs['deploy-workflow-contract'].steps
  const installIndex = steps.findIndex((step) => step.name === 'Install server dependencies')
  const atomicityIndex = steps.findIndex(
    (step) => step.name === 'Verify application release atomicity contract',
  )

  assert.notEqual(installIndex, -1, 'server dependency installation step is required')
  assert.notEqual(atomicityIndex, -1, 'application release atomicity step is required')
  assert.ok(
    installIndex < atomicityIndex,
    'server dependencies must be installed before loading the YAML-backed contract',
  )
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

test('deployment target preflight proves the host Python runtime before database migration', async () => {
  const workflow = await source('.github/workflows/deploy.yml')
  const preflightStart = workflow.indexOf('  deployment-target-preflight:')
  const migrationStart = workflow.indexOf('  database-migration:')
  assert.ok(preflightStart >= 0 && migrationStart > preflightStart)
  const preflight = workflow.slice(preflightStart, migrationStart)

  assert.match(preflight, /name: Verify deployment host Python runtime/u)
  assert.match(preflight, /command -v python3/u)
  assert.match(preflight, /sys\.version_info < \(3, 10\)/u)
  assert.match(preflight, /import ipaddress/u)
  assert.match(preflight, /import json/u)
  assert.match(preflight, /from urllib\.parse import urlsplit/u)
  assert.match(preflight, /ssh[\s\S]*?python3/u)

  const parsed = loadYaml(workflow)
  const runtimeCheck = parsed.jobs['deployment-target-preflight'].steps.find(
    (step) => step.name === 'Verify deployment host Python runtime',
  )
  assert.ok(runtimeCheck?.run, 'the host Python runtime step must contain executable shell')
  const shellSyntax = spawnSync(bash, ['-n'], { input: runtimeCheck.run, encoding: 'utf8' })
  assert.equal(shellSyntax.status, 0, shellSyntax.stderr)
  const pythonSource = runtimeCheck.run.match(/python3 - <<'PY'\n([\s\S]*?)\nPY/u)?.[1]
  assert.ok(pythonSource, 'the host Python runtime preflight must retain its Python body')
  const pythonSyntax = process.platform === 'win32'
    ? spawnSync('py.exe', ['-3', '-c', 'import ast,sys; ast.parse(sys.stdin.read())'], {
        input: pythonSource,
        encoding: 'utf8',
      })
    : spawnSync('python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], {
        input: pythonSource,
        encoding: 'utf8',
      })
  assert.equal(pythonSyntax.status, 0, pythonSyntax.stderr)
})

test('host Python ingress verifier rejects wrong authority, path, credentials, port, and private IP', async () => {
  const script = await source('scripts/deploy-lighthouse-server.sh')
  const { classifyPublicIngressUrl } = await import('./classify-public-ingress-url.mjs')
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
    ['https://internal/api/readyz', 'http://internal/api/readyz', 'production', 'internal', 'domain_hsts', 1],
    ['https://service.test/api/readyz', 'http://service.test/api/readyz', 'production', 'service.test', 'domain_hsts', 1],
    ['https://workbuddy/api/readyz', 'http://workbuddy/api/readyz', 'production', 'workbuddy', 'domain_hsts', 1],
    ['https://bad_label.example.com/api/readyz', 'http://bad_label.example.com/api/readyz', 'production', 'bad_label.example.com', 'domain_hsts', 1],
    ['https://[2001:4860:4860::8888]/api/readyz', 'http://[2001:4860:4860::8888]/api/readyz', 'production', '2001:4860:4860::8888', 'temporary_ip_tls', 1],
    ['https://zhuxucloud.com./api/readyz', 'http://zhuxucloud.com./api/readyz', 'production', 'zhuxucloud.com', 'domain_hsts', 1],
  ]
  for (const [health, redirect, target, host, mode, expectedStatus] of cases) {
    const canonical = classifyPublicIngressUrl({
      environment: target,
      expectedHost: host,
      expectedMode: mode,
      redirectValue: redirect,
      value: health,
    })
    assert.equal(canonical.pass, expectedStatus === 0, `canonical golden mismatch for ${health}`)
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
  const resolveCurrentReleaseTarget = script.match(
    /(resolve_current_release_target\(\) \{[\s\S]*?\n\})\n\n/u,
  )?.[1]
  const rollbackFunction = script.match(
    /(rollback_application_release\(\) \{[\s\S]*?\n\})\n\nsnapshot_legacy_release/u,
  )?.[1]
  assert.ok(resolveCurrentReleaseTarget, 'rollback must use the shared current-target resolver')
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
build_and_up_release() {
  [ "${'$'}{3:-}" = allow_legacy_source ] || return 89
  printf 'build:%s:%s\n' "$1" "$2" >> "$ROOT_DIR/calls"
}
verify_release_health() {
  printf 'verify:%s\n' "$1" >> "$ROOT_DIR/calls"
  [ "$SCHEMA_COMPATIBLE" = true ]
}
  atomic_link() { printf '%s' "$1" > "$CURRENT_LINK-target"; }
quarantine_release_dir() { mv "$1" "$FAILED_RELEASES_DIR/$2"; }
${resolveCurrentReleaseTarget}
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
