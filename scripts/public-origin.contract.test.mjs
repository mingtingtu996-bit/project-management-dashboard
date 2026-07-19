import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  normalizePublicHttpsOrigin,
  resolvePublicHttpsOrigin,
} from './public-origin.mjs'

function wizardCommands(workflow) {
  const lines = workflow.split(/\r?\n/u)
  const commands = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes('node scripts/run-wizard-baseline-revision-staging.mjs')) continue
    const commandLines = [lines[index]]
    while (commandLines.at(-1).trimEnd().endsWith('\\') && index + 1 < lines.length) {
      index += 1
      commandLines.push(lines[index])
    }
    commands.push(commandLines.join('\n'))
  }
  return commands
}

test('normalizes only an exact HTTPS public origin', () => {
  assert.equal(
    normalizePublicHttpsOrigin('https://124.222.54.190:8443'),
    'https://124.222.54.190:8443',
  )

  for (const invalid of [
    'http://124.222.54.190:8443',
    'https://user:password@124.222.54.190:8443',
    'https://124.222.54.190:8443/api',
    'https://124.222.54.190:8443?target=staging',
    'https://124.222.54.190:8443/#fragment',
  ]) {
    assert.throws(() => normalizePublicHttpsOrigin(invalid), /HTTPS origin/u)
  }
})

test('requires an explicit public origin for loopback API tunnels', () => {
  assert.throws(
    () => resolvePublicHttpsOrigin({ apiBaseUrl: 'http://127.0.0.1:18081', publicOrigin: '' }),
    /public origin is required/u,
  )
  assert.equal(
    resolvePublicHttpsOrigin({
      apiBaseUrl: 'http://127.0.0.1:18081',
      publicOrigin: 'https://124.222.54.190:8443',
    }),
    'https://124.222.54.190:8443',
  )
})

test('allows the API origin only when the API base is already public HTTPS', () => {
  assert.equal(
    resolvePublicHttpsOrigin({ apiBaseUrl: 'https://124.222.54.190:8443', publicOrigin: '' }),
    'https://124.222.54.190:8443',
  )
})

test('release smoke and browser auth fixture send the resolved public Origin', async () => {
  const [wizardSmoke, browserFixture, deployWorkflow, productionLivegate] = await Promise.all([
    readFile(new URL('./run-wizard-baseline-revision-staging.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./browser-auth-fixture.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/production-livegate-execution.yml', import.meta.url), 'utf8'),
  ])

  assert.match(wizardSmoke, /args\.get\('public-origin'\)/u)
  assert.match(wizardSmoke, /Origin:\s*publicOrigin/u)
  assert.match(wizardSmoke, /'X-Forwarded-Proto':\s*'https'/u)
  assert.match(browserFixture, /PUBLIC_HTTPS_ORIGIN/u)
  assert.match(browserFixture, /Origin:\s*publicOrigin/u)
  assert.match(browserFixture, /'X-Forwarded-Proto':\s*'https'/u)
  assert.match(
    deployWorkflow,
    /--header "X-Forwarded-Proto: https"[\s\S]*\/api\/performance-reports\/summary/u,
  )
  const stagingCommands = wizardCommands(deployWorkflow)
  const productionCommands = wizardCommands(productionLivegate)
  assert.equal(stagingCommands.length, 2)
  assert.equal(productionCommands.length, 2)
  for (const command of [...stagingCommands, ...productionCommands]) {
    assert.match(command, /--api-base-url "http:\/\/127\.0\.0\.1:\$\{local_smoke_port\}"/u)
    assert.match(command, /--public-origin "\$public_origin"/u)
  }
})
