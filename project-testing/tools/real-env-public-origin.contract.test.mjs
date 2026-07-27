import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const toolsDir = dirname(fileURLToPath(import.meta.url))

const ACTIVE_LOGIN_TOOLS = [
  'cleanup-v14241-real-uat05-residue.mjs',
  'collect-v14241-real-uat05-operator-evidence.mjs',
  'collect-v14241-real-uat07-16-evidence.mjs',
  'collect-v14241-real-uat08-business-loop-evidence.mjs',
  'collect-v14241-real-uat09-bi-ssot-evidence.mjs',
  'collect-v14241-real-uat10-import-export-evidence.mjs',
  'run-v1424-g3-rls-role-matrix.mjs',
  'run-v1424-g6-company-summary-pressure.mjs',
  'run-v14241-real-env-preflight.mjs',
  'run-v14241-real-env-readonly-support-probes.mjs',
  'run-v14241-real-uat01-company-create-switch.mjs',
  'run-v14241-real-uat02-invite-join-role.mjs',
  'run-v14241-real-uat03-rls-role-matrix.mjs',
  'run-v14241-real-uat04-wbs-baseline-publication.mjs',
  'run-v14241-real-uat05-gantt-critical-path.mjs',
  'run-v14241-real-uat06-plan-state-machine.mjs',
  'run-v14241-real-uat06-planning-readonly.mjs',
  'run-v14241-real-uat09-bi-ssot-readonly.mjs',
]

test('every active real-environment login tool sends a resolved public HTTPS origin', async () => {
  const sources = await Promise.all(ACTIVE_LOGIN_TOOLS.map(async (name) => ({
    name,
    source: await readFile(join(toolsDir, name), 'utf8'),
  })))
  for (const { name, source } of sources) {
    assert.match(source, /\/api\/auth\/login/u, `${name} must retain its real login probe`)
    assert.match(source, /resolvePublicHttpsOrigin/u, `${name} must use the shared HTTPS origin resolver`)
    assert.match(
      source,
      /origin:\s*(?:resolved)?publicOrigin/iu,
      `${name} must send the resolved Origin on login`,
    )
  }
})

test('the scenario orchestrator forwards one explicit public origin to child runners', async () => {
  const source = await readFile(join(toolsDir, 'run-v14241-real-env-scenario-attempts.mjs'), 'utf8')

  assert.match(source, /publicOrigin\s*=\s*null/u)
  assert.match(source, /publicOrigin,\s*\n\s*\.\.\.scenarioDefaultEvidenceOptions/u)
  assert.match(source, /publicOrigin:\s*argValue\('--public-origin',\s*process\.env\.PUBLIC_HTTPS_ORIGIN/u)
})
