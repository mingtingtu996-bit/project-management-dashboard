import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const toolsDir = dirname(fileURLToPath(import.meta.url))
const verifierPath = join(toolsDir, 'verify-duration-assets-admin-ui.mjs')

test('duration assets browser verifier remains deterministic and local-only', () => {
  const source = readFileSync(verifierPath, 'utf8')

  assert.match(source, /1440\s*,\s*900/)
  assert.match(source, /390\s*,\s*844/)
  assert.match(source, /\/admin\/duration-assets/)
  assert.match(source, /page\.route\(/)
  assert.match(source, /duration-assets-overlap/)
  assert.match(source, /assertLocalViteUrl/)
  assert.match(source, /process\.env\.BASE_URL/)
  assert.match(source, /process\.env\.START_VITE/)
  assert.match(source, /127\.0\.0\.1/)
  assert.match(source, /localhost/)
  assert.match(source, /\/api\/auth\/me/)
  assert.match(source, /\/api\/workspace/)
  assert.match(source, /\/api\/admin\/duration-assets\/review-items/)
  assert.match(source, /\/api\/admin\/duration-accuracy/)
  assert.match(source, /readiness/)
  assert.match(
    source,
    /join\(repoRoot,\s*'project-testing',\s*'artifacts',\s*'browser-checks',\s*'duration-assets'\)/,
  )
  assert.match(source, /requireFromServer\('playwright'\)/)
  assert.doesNotMatch(source, /page\.setContent\(/)
  assert.doesNotMatch(source, /staging|production/i)
})
