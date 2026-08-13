import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(new URL('../server/package.json', import.meta.url))
const { load: loadYaml } = require('js-yaml')
const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash'
const confirmation = 'PRODUCTION_EMPTY_ROOT_BOOTSTRAP'

function bashPath(value) {
  if (process.platform !== 'win32') return value
  const normalized = value.replaceAll('\\', '/')
  const normalizedTemp = tmpdir().replaceAll('\\', '/')
  if (normalized.toLowerCase().startsWith(`${normalizedTemp.toLowerCase()}/`)) {
    return `/tmp/${normalized.slice(normalizedTemp.length + 1)}`
  }
  return normalized.replace(/^([A-Za-z]):\//u, (_match, drive) => `/${drive.toLowerCase()}/`)
}

async function source(path) {
  return import('node:fs/promises').then(({ readFile }) => readFile(resolve(workspaceRoot, path), 'utf8'))
}

async function createCommandMocks(root) {
  const bashEnv = join(root, 'bash-env.sh')
  const pythonShim = process.platform === 'win32' ? 'python3() { py.exe -3 "$@"; }\n' : ''
  await writeFile(
    bashEnv,
    `${pythonShim}find() {
  [ "\${MOCK_FIND_STATUS:-0}" = 0 ] || return "\${MOCK_FIND_STATUS}"
  /usr/bin/find "$@"
}
flock() {
  return "\${MOCK_FLOCK_STATUS:-0}"
}
ss() {
  [ "\${MOCK_SS_STATUS:-0}" = 0 ] || return "\${MOCK_SS_STATUS}"
  printf '%s\\n' "\${MOCK_SS_OUTPUT:-}"
}
docker() {
  if [ "\${1:-}" = compose ]; then
    shift
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --env-file|-f) shift 2 ;;
        config)
          shift
          [ "\${1:-}" = --no-env-resolution ] || return 1
          shift
          [ "\${1:-}" = --format ] || return 1
          [ "\${2:-}" = json ] || return 1
          if [ "\${MOCK_COMPOSE_CONFIG_JSON+x}" = x ]; then
            printf '%s\n' "$MOCK_COMPOSE_CONFIG_JSON"
          else
            printf '%s\n' '{"services":{"api":{"build":{"context":"../server","target":"prebuilt-runtime"}},"worker":{"build":{"context":"../server","target":"prebuilt-runtime"}},"web":{"build":{"context":"../client","target":"prebuilt-runtime"}}}}'
          fi
          return "\${MOCK_COMPOSE_CONFIG_STATUS:-0}"
          ;;
        *) shift ;;
      esac
    done
    return 1
  fi
  case "\${1:-}" in
    info) return "\${MOCK_DOCKER_INFO_STATUS:-0}" ;;
    ps) printf '%b\\n' "\${MOCK_DOCKER_PS_OUTPUT:-}" ;;
    *) return 0 ;;
  esac
}
`,
    'utf8',
  )
  return bashEnv
}

async function writeRollbackContract(root, releaseSha = 'a'.repeat(40)) {
  await mkdir(join(root, 'client', 'dist'), { recursive: true })
  await mkdir(join(root, 'deploy'), { recursive: true })
  await mkdir(join(root, 'deploy', 'env'), { recursive: true })
  await mkdir(join(root, 'deploy', 'nginx'), { recursive: true })
  await mkdir(join(root, 'scripts'), { recursive: true })
  await mkdir(join(root, 'server', 'migrations'), { recursive: true })
  await mkdir(join(root, 'server', 'dist'), { recursive: true })
  await writeFile(
    join(root, 'client', 'dist', 'workbuddy-build.json'),
    JSON.stringify({ releaseSha }),
    'utf8',
  )
  await writeFile(
    join(root, 'deploy', 'docker-compose.lighthouse.yml'),
    'services:\n  api: {}\n  worker: {}\n  web: {}\n',
    'utf8',
  )
  await writeFile(join(root, 'scripts', 'classify-public-ingress-url.mjs'), 'export {}\n', 'utf8')
  await writeFile(join(root, 'server', 'migrations', '001_contract.sql'), 'select 1;\n', 'utf8')
  await writeFile(join(root, 'server', 'Dockerfile'), 'FROM scratch AS prebuilt-runtime\n', 'utf8')
  await writeFile(join(root, 'server', 'package.json'), '{"name":"rollback-api"}\n', 'utf8')
  await writeFile(join(root, 'server', 'package-lock.json'), '{"lockfileVersion":3}\n', 'utf8')
  await writeFile(join(root, 'server', 'dist', 'index.js'), 'export {}\n', 'utf8')
  await writeFile(
    join(root, 'server', 'dist', 'workbuddy-server-build.json'),
    JSON.stringify({ releaseSha }),
    'utf8',
  )
  await mkdir(join(root, 'client'), { recursive: true })
  await writeFile(join(root, 'client', 'Dockerfile'), 'FROM scratch AS prebuilt-runtime\n', 'utf8')
  await writeFile(join(root, 'client', 'nginx.conf'), 'server {}\n', 'utf8')
  await writeFile(join(root, 'client', 'dist', 'index.html'), '<!doctype html>\n', 'utf8')
  await writeFile(join(root, 'deploy', 'env', 'server.production.env'), 'WEB_PORT=8080\n', 'utf8')
  await writeFile(join(root, 'deploy', 'nginx', 'lighthouse.conf'), 'server {}\n', 'utf8')
}

async function runPreflight({ setup, env = {}, bootstrapConfirmation = confirmation } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-production-bootstrap-'))
  const appDir = join(root, 'app')
  const bashEnv = await createCommandMocks(root)
  await mkdir(join(appDir, 'releases'), { recursive: true })
  await setup?.(appDir)
  const result = spawnSync(
    bash,
    [
      bashPath(resolve(workspaceRoot, 'scripts/check-production-empty-root-bootstrap.sh')),
      bashPath(appDir),
      bootstrapConfirmation,
    ],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        BASH_ENV: bashPath(bashEnv),
        ...env,
      },
    },
  )
  await rm(root, { recursive: true, force: true })
  return result
}

test('production bootstrap requires an independent exact confirmation and a pre-migration empty-root proof', async () => {
  const workflowSource = await source('.github/workflows/deploy.yml')
  const workflow = loadYaml(workflowSource)
  const preflight = workflow.jobs?.['deployment-target-preflight']
  assert.ok(preflight, 'deployment target preflight job is required')
  assert.equal(preflight.environment, '${{ github.event.inputs.environment }}')

  assert.match(workflowSource, /PRODUCTION_EMPTY_ROOT_BOOTSTRAP \(production\)/u)
  assert.match(workflowSource, /PRODUCTION_CONFIRMATION/u)
  assert.match(workflowSource, /MIGRATION_MAINTENANCE_WINDOW_CONFIRMED/u)

  const emptyRootStep = preflight.steps.find(
    (step) => step.id === 'production-empty-root-bootstrap-preflight',
  )
  assert.ok(emptyRootStep?.run, 'production empty-root bootstrap must run before the migration job')
  assert.equal(emptyRootStep.if, "github.event.inputs.environment == 'production'")
  assert.match(emptyRootStep.run, /check-production-empty-root-bootstrap\.sh/u)
  assert.match(emptyRootStep.run, /PRODUCTION_EMPTY_ROOT_BOOTSTRAP/u)

  const deploymentStep = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .find((step) => step.name === 'Deploy to self-hosted server')
  assert.ok(deploymentStep?.run, 'self-hosted deployment step is required')
  assert.equal(
    deploymentStep.env?.PRODUCTION_EMPTY_ROOT_BOOTSTRAP,
    "${{ github.event.inputs.initial_runtime_bootstrap_confirmation == 'PRODUCTION_EMPTY_ROOT_BOOTSTRAP' && 'true' || 'false' }}",
  )
  assert.equal(
    deploymentStep.env?.PRODUCTION_EMPTY_ROOT_BOOTSTRAP_CONFIRMATION,
    '${{ github.event.inputs.initial_runtime_bootstrap_confirmation }}',
  )

  const migrationStart = workflowSource.indexOf('  database-migration:')
  const emptyRootStepStart = workflowSource.indexOf('id: production-empty-root-bootstrap-preflight')
  assert.ok(emptyRootStepStart > -1 && emptyRootStepStart < migrationStart)
})

test('atomic deploy rechecks the production empty-root contract while holding its deployment lock', async () => {
  const deployScript = await source('scripts/deploy-lighthouse-server.sh')
  assert.match(deployScript, /PRODUCTION_EMPTY_ROOT_BOOTSTRAP/u)
  assert.match(deployScript, /PRODUCTION_EMPTY_ROOT_BOOTSTRAP_CONFIRMATION/u)
  assert.match(deployScript, /lock-held-by-caller/u)

  const recheckIndex = deployScript.indexOf('verify_production_empty_root_bootstrap')
  const recheckFunction = deployScript.match(
    /(verify_production_empty_root_bootstrap\(\) \{[\s\S]*?\n\})\n\n\[ -f "\$STABLE_ENV_FILE" \]/u,
  )?.[1]
  assert.ok(recheckFunction, 'deploy-time empty-root verifier must remain inspectable')
  assert.match(recheckFunction, /release_entry="\$\(find "\$RELEASES_DIR"[\s\S]*?\)" \|\| \{/u)
  assert.match(recheckFunction, /failed_release_entry="\$\(find "\$FAILED_RELEASES_DIR"[\s\S]*?\)" \|\| \{/u)
  assert.match(recheckFunction, /socket_table="\$\(ss -H -ltn 2>\/dev\/null\)" \|\| \{/u)
  const dockerProbeIndex = deployScript.indexOf('if docker info')
  const dockerRunnerIndex = deployScript.indexOf('run_docker_command()')
  const recheckCallIndex = deployScript.lastIndexOf('verify_production_empty_root_bootstrap lock-held-by-caller')
  const candidateIndex = deployScript.indexOf('CANDIDATE_DIR="$RELEASES_DIR/.candidate-')
  const activationIndex = deployScript.indexOf('write_activation_state "$RELEASE_DIR"')
  assert.ok(recheckIndex > -1, 'deploy-time empty-root recheck is required')
  assert.ok(dockerProbeIndex > -1 && dockerProbeIndex < recheckCallIndex, 'Docker access must be established before the deploy-time recheck')
  assert.ok(dockerRunnerIndex > -1 && dockerRunnerIndex < recheckCallIndex, 'Docker command wrapper must be defined before the deploy-time recheck')
  assert.ok(recheckCallIndex > recheckIndex, 'recheck ordering must inspect the call, not only the function definition')
  assert.ok(candidateIndex > recheckCallIndex, 'empty-root recheck must precede candidate creation')
  assert.ok(activationIndex > candidateIndex, 'activation must remain after candidate creation')
  assert.match(
    deployScript,
    /elif \[ "\$INITIAL_RUNTIME_BOOTSTRAP" != true \] && \[ "\$PRODUCTION_EMPTY_ROOT_BOOTSTRAP" != true \]; then/u,
  )
  assert.match(deployScript, /has_rollback_contract\(\)/u)
  assert.match(deployScript, /has_rollback_contract "\$APP_DIR"/u)
  assert.match(deployScript, /has_rollback_contract "\$PREVIOUS_TARGET"/u)
  assert.match(deployScript, /config --no-env-resolution --format json/u)
})

test('deploy-time rollback authority requires a governed runnable API, worker, and web release', async () => {
  const deployScript = await source('scripts/deploy-lighthouse-server.sh')
  const rollbackFunctions = deployScript.match(
    /(release_sha_from_manifest\(\) \{[\s\S]*?\n\})\n\nrun_docker_command\(\)/u,
  )?.[1]
  assert.ok(rollbackFunctions, 'deploy-time rollback authority must remain executable in isolation')

  const root = await mkdtemp(join(tmpdir(), 'workbuddy-deploy-rollback-contract-'))
  const release = join(root, 'release')
  const bashEnv = await createCommandMocks(root)
  const runContract = (composeConfigJson) =>
    spawnSync(
      bash,
      [
        '-c',
        `set -euo pipefail
COMPOSE_FILE=deploy/docker-compose.lighthouse.yml
${rollbackFunctions}
run_docker_compose() { printf '%s\\n' "$MOCK_COMPOSE_CONFIG_JSON"; }
has_rollback_contract "$ROLLBACK_RELEASE"
`,
      ],
      {
        cwd: workspaceRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          BASH_ENV: bashPath(bashEnv),
          ROLLBACK_RELEASE: bashPath(release),
          MOCK_COMPOSE_CONFIG_JSON: composeConfigJson,
        },
      },
    )
  const validCompose = JSON.stringify({
    services: {
      api: { build: { context: '../server', target: 'prebuilt-runtime' } },
      worker: { build: { context: '../server', target: 'prebuilt-runtime' } },
      web: { build: { context: '../client', target: 'prebuilt-runtime' } },
    },
  })

  try {
    await writeRollbackContract(release)
    const valid = runContract(validCompose)
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`)

    const emptyCompose = runContract('{"services":{}}')
    assert.notEqual(emptyCompose.status, 0, 'deploy-time check accepted an empty Compose model')

    await rm(join(release, 'server', 'dist', 'index.js'))
    const missingRuntime = runContract(validCompose)
    assert.notEqual(missingRuntime.status, 0, 'deploy-time check accepted a missing API runtime')

    await writeFile(join(release, 'server', 'dist', 'index.js'), 'export {}\n', 'utf8')
    await writeFile(
      join(release, 'server', 'dist', 'workbuddy-server-build.json'),
      JSON.stringify({ releaseSha: 'f'.repeat(40) }),
      'utf8',
    )
    const mismatchedRuntime = runContract(validCompose)
    assert.notEqual(mismatchedRuntime.status, 0, 'deploy-time check accepted a mismatched API runtime')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('production empty-root proof accepts only a clean managed root with port 8080 unbound', async () => {
  const result = await runPreflight()
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report, {
    status: 'production_empty_root_bootstrap_ready',
    currentRelease: false,
    releaseCount: 0,
    pendingActivation: false,
    deploymentLockHeld: false,
    upstreamPort: 8080,
    upstreamListening: false,
    targetContainerCount: 0,
  })
})

test('production pre-migration proof rejects an empty root without bootstrap authorization', async () => {
  const emptyRoot = await runPreflight({ bootstrapConfirmation: '' })
  assert.notEqual(emptyRoot.status, 0, `empty production root was accepted\n${emptyRoot.stdout}`)
  assert.equal(emptyRoot.stdout, '')

  const legacyRoot = await runPreflight({
    bootstrapConfirmation: '',
    setup: (appDir) => writeRollbackContract(appDir),
  })
  assert.equal(legacyRoot.status, 0, `${legacyRoot.stdout}\n${legacyRoot.stderr}`)
  assert.equal(JSON.parse(legacyRoot.stdout).rollbackSource, 'legacy_tree')
})

test('production upgrade accepts only complete rollback sources and rejects orphan managed releases', async () => {
  const manifestOnly = await runPreflight({
    bootstrapConfirmation: '',
    setup: async (appDir) => {
      await mkdir(join(appDir, 'client', 'dist'), { recursive: true })
      await writeFile(
        join(appDir, 'client', 'dist', 'workbuddy-build.json'),
        JSON.stringify({ releaseSha: 'a'.repeat(40) }),
        'utf8',
      )
    },
  })
  assert.notEqual(manifestOnly.status, 0, `manifest-only legacy root was accepted\n${manifestOnly.stdout}`)

  const emptyCompose = await runPreflight({
    bootstrapConfirmation: '',
    setup: async (appDir) => {
      await writeRollbackContract(appDir)
    },
    env: { MOCK_COMPOSE_CONFIG_JSON: '{"services":{}}' },
  })
  assert.notEqual(emptyCompose.status, 0, `empty Compose rollback source was accepted\n${emptyCompose.stdout}`)

  const missingServerRuntime = await runPreflight({
    bootstrapConfirmation: '',
    setup: async (appDir) => {
      await writeRollbackContract(appDir)
      await rm(join(appDir, 'server', 'dist', 'index.js'))
    },
  })
  assert.notEqual(
    missingServerRuntime.status,
    0,
    `rollback source without an API runtime was accepted\n${missingServerRuntime.stdout}`,
  )

  const mismatchedServerRuntime = await runPreflight({
    bootstrapConfirmation: '',
    setup: async (appDir) => {
      await writeRollbackContract(appDir)
      await writeFile(
        join(appDir, 'server', 'dist', 'workbuddy-server-build.json'),
        JSON.stringify({ releaseSha: 'f'.repeat(40) }),
        'utf8',
      )
    },
  })
  assert.notEqual(
    mismatchedServerRuntime.status,
    0,
    `rollback source with a mismatched API runtime was accepted\n${mismatchedServerRuntime.stdout}`,
  )

  const orphanRelease = await runPreflight({
    bootstrapConfirmation: '',
    setup: async (appDir) => {
      await writeRollbackContract(appDir)
      await mkdir(join(appDir, 'releases', 'b'.repeat(40)), { recursive: true })
    },
  })
  assert.notEqual(orphanRelease.status, 0, `orphan managed release was ignored\n${orphanRelease.stdout}`)

  const managedCurrent = await runPreflight({
    bootstrapConfirmation: '',
    setup: async (appDir) => {
      const releaseDir = join(appDir, 'releases', 'c'.repeat(40))
      await writeRollbackContract(releaseDir, 'c'.repeat(40))
      await symlink(releaseDir, join(appDir, 'current'), process.platform === 'win32' ? 'junction' : 'dir')
    },
  })
  assert.equal(managedCurrent.status, 0, `${managedCurrent.stdout}\n${managedCurrent.stderr}`)
  assert.equal(JSON.parse(managedCurrent.stdout).rollbackSource, 'managed_current')

  const incompleteManagedCurrent = await runPreflight({
    bootstrapConfirmation: '',
    setup: async (appDir) => {
      const releaseDir = join(appDir, 'releases', 'd'.repeat(40))
      await writeRollbackContract(releaseDir, 'd'.repeat(40))
      await rm(join(releaseDir, 'scripts', 'classify-public-ingress-url.mjs'))
      await symlink(releaseDir, join(appDir, 'current'), process.platform === 'win32' ? 'junction' : 'dir')
    },
  })
  assert.notEqual(
    incompleteManagedCurrent.status,
    0,
    `incomplete managed current was accepted\n${incompleteManagedCurrent.stdout}`,
  )
})

test('production empty-root proof rejects legacy production containers but permits staging containers', async () => {
  const accepted = await runPreflight({
    env: {
      MOCK_DOCKER_PS_OUTPUT: 'project-management-staging-api\\tproject-management-staging\\nproject-management-staging-web\\tproject-management-staging',
    },
  })
  assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`)
  assert.equal(JSON.parse(accepted.stdout).targetContainerCount, 0)

  for (const output of [
    'project-management-api\\tproject-management',
    'project-management-api\\t',
    'unrelated-name\\tproject-management',
  ]) {
    const rejected = await runPreflight({ env: { MOCK_DOCKER_PS_OUTPUT: output } })
    assert.notEqual(rejected.status, 0, `${output} was accepted\n${rejected.stdout}`)
    assert.equal(rejected.stdout, '')
  }
})

test('production empty-root proof fails closed for every state that makes bootstrap unsafe', async () => {
  const cases = [
    {
      name: 'current pointer',
      setup: (appDir) => writeFile(join(appDir, 'current'), 'unexpected', 'utf8'),
    },
    {
      name: 'managed release',
      setup: (appDir) => mkdir(join(appDir, 'releases', 'a'.repeat(40))),
    },
    {
      name: 'pending activation',
      setup: (appDir) => writeFile(join(appDir, 'pending-application-release.env'), 'pending', 'utf8'),
    },
    {
      name: 'candidate pointer',
      setup: (appDir) => writeFile(join(appDir, 'current.next'), 'pending', 'utf8'),
    },
    {
      name: 'held deployment lock',
      setup: (appDir) => writeFile(join(appDir, '.deploy.lock'), '', 'utf8'),
      env: { MOCK_FLOCK_STATUS: '1' },
    },
    {
      name: 'production upstream listener',
      env: { MOCK_SS_OUTPUT: 'LISTEN 0 4096 127.0.0.1:8080 0.0.0.0:*' },
    },
    {
      name: 'release directory inspection failure',
      env: { MOCK_FIND_STATUS: '1' },
    },
    {
      name: 'socket inspection failure',
      env: { MOCK_SS_STATUS: '1' },
    },
    {
      name: 'legacy server tree',
      setup: (appDir) => mkdir(join(appDir, 'server')),
    },
    {
      name: 'legacy compose tree',
      setup: async (appDir) => {
        await mkdir(join(appDir, 'deploy'), { recursive: true })
        await writeFile(join(appDir, 'deploy', 'docker-compose.lighthouse.yml'), 'services: {}\n', 'utf8')
      },
    },
  ]

  for (const scenario of cases) {
    const result = await runPreflight(scenario)
    assert.notEqual(result.status, 0, `${scenario.name} was accepted\n${result.stdout}`)
    assert.equal(result.stdout, '', `${scenario.name} emitted a success report`)
  }
})

test('production empty-root proof rejects every non-exact bootstrap confirmation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-production-bootstrap-confirmation-'))
  const appDir = join(root, 'app')
  const bashEnv = await createCommandMocks(root)
  await mkdir(join(appDir, 'releases'), { recursive: true })
  try {
    for (const invalid of ['INGRESS_READY_UPSTREAM_UNAVAILABLE', 'production_empty_root_bootstrap']) {
      const result = spawnSync(
        bash,
        [
          bashPath(resolve(workspaceRoot, 'scripts/check-production-empty-root-bootstrap.sh')),
          bashPath(appDir),
          invalid,
        ],
        {
          cwd: dirname(appDir),
          encoding: 'utf8',
          env: { ...process.env, BASH_ENV: bashPath(bashEnv) },
        },
      )
      assert.notEqual(result.status, 0, `invalid confirmation was accepted: ${invalid}`)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('both production checks reject dangling activation state and any legacy application tree marker', async () => {
  const [preflightScript, deployScript] = await Promise.all([
    source('scripts/check-production-empty-root-bootstrap.sh'),
    source('scripts/deploy-lighthouse-server.sh'),
  ])
  const normalizedPreflight = preflightScript.replace(/\\\r?\n\s*/gu, ' ')
  assert.match(
    normalizedPreflight,
    /\[ ! -e "\$APP_DIR\/pending-application-release\.env" \]\s+&& \[ ! -L "\$APP_DIR\/pending-application-release\.env" \]/u,
  )
  assert.match(
    deployScript,
    /\[ ! -e "\$STATE_FILE" \] && \[ ! -L "\$STATE_FILE" \]/u,
  )
  for (const script of [preflightScript, deployScript]) {
    assert.match(script, /"\$APP_DIR\/server"/u)
    assert.match(script, /"\$APP_DIR\/deploy\/docker-compose\.lighthouse\.yml"/u)
  }
})

test('production bootstrap never inherits staging origin-only postdeploy success', async () => {
  const deployScript = await source('scripts/deploy-lighthouse-server.sh')
  const healthVerifier = deployScript.match(
    /(verify_release_health\(\) \{[\s\S]*?\n\})\n\nprint_runtime_failure_diagnostics/u,
  )?.[1]
  assert.ok(healthVerifier, 'postdeploy release verifier must remain inspectable')
  assert.match(healthVerifier, /\[ "\$DEPLOY_TARGET" = staging \]/u)
  assert.doesNotMatch(healthVerifier, /\[ "\$DEPLOY_TARGET" = production \][\s\S]*public_domain_ready=false/u)
  assert.match(
    healthVerifier,
    /Public-domain postdeploy verification failed and origin fallback is not authorized\./u,
  )
})

test('production 502 bootstrap preflight is classified as public-domain unavailable, not ready', async () => {
  const workflow = await source('.github/workflows/deploy.yml')
  const normalizedWorkflow = workflow.replaceAll('\r\n', '\n')
  const preflight = normalizedWorkflow.match(
    /- name: Check target deployment and runtime secrets[\s\S]*?\n      - name:/u,
  )?.[0]
  assert.ok(preflight, 'public ingress preflight must remain inspectable')
  assert.match(
    preflight,
    /if public_readyz_status="\$\(probe_ingress_route public\)"; then[\s\S]*?if \[ "\$public_readyz_status" = 200 \]; then[\s\S]*?public_domain_ready=true/u,
  )
  assert.match(
    preflight,
    /\[ "\$public_readyz_status" = 502 \][\s\S]*?\[ "\$PRODUCTION_EMPTY_ROOT_BOOTSTRAP" = true \]/u,
  )
  assert.doesNotMatch(
    preflight,
    /if public_readyz_status="\$\(probe_ingress_route public\)"; then\s+public_domain_ready=true/u,
  )
  const publicProbeFailureBranch = preflight.match(
    /elif \[ "\$INITIAL_RUNTIME_BOOTSTRAP" = true \][\s\S]*?else\n            echo "Public-domain preflight failed/u,
  )?.[0]
  assert.ok(publicProbeFailureBranch, 'public-probe failure branch must remain inspectable')
  assert.doesNotMatch(
    publicProbeFailureBranch,
    /PRODUCTION_EMPTY_ROOT_BOOTSTRAP/u,
    'production must not use origin-only ingress fallback',
  )
  assert.match(preflight, /PRODUCTION_EMPTY_ROOT_BOOTSTRAP[\s\S]*publicDomainReady=false/u)
  assert.match(
    preflight,
    /\[ "\$public_readyz_status" = 502 \] \|\| \[ "\$origin_readyz_status" = 502 \]/u,
  )
})
