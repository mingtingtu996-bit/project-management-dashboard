import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('verify-scope-modeling-wizard-browser.mjs', import.meta.url),
  'utf8',
)

test('scope-modeling browser fixture uses the project-scoped wizard preview endpoint', () => {
  assert.match(
    source,
    /const wizardPreviewPath = `\/api\/projects\/\$\{projectId\}\/wizard\/preview`/,
  )
  assert.doesNotMatch(source, /pathname === '\/api\/projects\/wizard\/preview'/)
})
