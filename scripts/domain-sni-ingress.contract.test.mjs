import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
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
  assert.doesNotMatch(script, /ssh-keyscan|StrictHostKeyChecking=no/u)

  assert.match(workflow, /workflow_dispatch:/u)
  assert.match(workflow, /environment:\s*Production/u)
  assert.match(workflow, /concurrency:/u)
  assert.match(workflow, /PROVISION_DOMAIN_INGRESS/u)
  assert.match(workflow, /PRODUCTION_DEPLOY_KNOWN_HOSTS/u)
  assert.match(workflow, /PRODUCTION_DEPLOY_PUBLIC_HOST/u)
  assert.match(workflow, /STAGING_DEPLOY_PUBLIC_HOST/u)
  assert.match(workflow, /action=rollback|ACTION=rollback/u)
  assert.match(workflow, /Strict-Transport-Security/u)
  assert.doesNotMatch(workflow, /ssh-keyscan|StrictHostKeyChecking=no/u)
})

test('Workflow Guard executes the domain ingress contract', async () => {
  const guard = await source('.github/workflows/workflow-guard.yml')
  assert.match(guard, /run: node --test scripts\/domain-sni-ingress\.contract\.test\.mjs/u)
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

  assert.match(deployScript, /readiness\.status !== 'ready'/u)
  assert.match(deployScript, /readiness\.build\?\.releaseSha !== process\.env\.RELEASE_SHA/u)
  assert.match(deployScript, /readiness\.build\?\.deployTarget !== process\.env\.DEPLOY_TARGET/u)
  assert.match(deployScript, /readiness\.build\?\.supabaseProjectRef !== expectedProjectRef/u)
  assert.match(deployScript, /readiness\.build\?\.databaseProjectRef !== expectedProjectRef/u)
  assert.equal((deployScript.match(/\*\/api\/readyz\)/gu) ?? []).length, 1)
})
