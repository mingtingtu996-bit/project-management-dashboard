import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const fullProjectBrowserScripts = [
  'verify-drawings-browser.mjs',
  'verify-acceptance-browser.mjs',
  'verify-risk-guard-browser.mjs',
  'verify-pre-milestones-browser.mjs',
  'verify-milestones-browser.mjs',
  'verify-planning-monthly-browser.mjs',
  'verify-planning-baseline-browser.mjs',
  'verify-planning-closeout-browser.mjs',
  'verify-planning-revision-browser.mjs',
  'verify-planning-deviation-browser.mjs',
  'verify-planning-confirm-failure-browser.mjs',
  'verify-planning-fine-flows-browser.mjs',
]

test('browser fixtures for full project routes provide the authoritative bootstrap shape', () => {
  for (const file of fullProjectBrowserScripts) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')

    assert.match(
      source,
      /pathname === `\/api\/projects\/\$\{projectId\}\/bootstrap`/,
      `${file} must mock the full-project bootstrap route`,
    )
    for (const field of [
      'project',
      'tasks',
      'risks',
      'conditions',
      'obstacles',
      'warnings',
      'issues',
      'taskProgressSnapshots',
    ]) {
      assert.match(source, new RegExp(`${field}:\\s*`), `${file} bootstrap must include ${field}`)
    }
  }
})
