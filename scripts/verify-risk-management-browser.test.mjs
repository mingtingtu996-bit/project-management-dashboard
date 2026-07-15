import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  extractRiskEntityIdFromDetailTestId,
  resolveRiskManagementProjectId,
} from './verify-risk-management-browser.mjs'

const browserSources = [
  'verify-risk-management-browser.mjs',
  'verify-notifications-browser.mjs',
  'verify-task-summary-browser.mjs',
].map((file) => ({
  file,
  source: readFileSync(new URL(file, import.meta.url), 'utf8'),
}))

const taskSummarySources = browserSources.filter(({ file }) => (
  file === 'verify-notifications-browser.mjs'
  || file === 'verify-task-summary-browser.mjs'
))

test('proxy risk-management verification resolves the standard full-app fixture project', () => {
  const projectId = resolveRiskManagementProjectId({
    envProjectId: '',
    mockApi: false,
    currentProjectId: 'legacy-project',
    manifest: {
      projects: {
        standard: { id: 'standard-project' },
        large: { id: 'large-project' },
      },
    },
  })

  assert.equal(projectId, 'standard-project')
})

test('risk-management verification extracts dynamic risk ids from detail trigger test ids', () => {
  assert.equal(
    extractRiskEntityIdFromDetailTestId('risk-detail-open-risk-2f21ad5c-dynamic'),
    '2f21ad5c-dynamic',
  )
})

test('browser fixtures that enter full project routes provide the project bootstrap payload', () => {
  for (const { file, source } of browserSources) {
    assert.match(
      source,
      /pathname === `\/api\/projects\/\$\{projectId\}\/bootstrap`/,
      `${file} must mock the full-project bootstrap route`,
    )
    assert.match(source, /project:\s*mockProject/, `${file} bootstrap must include the project`)
    assert.match(source, /taskProgressSnapshots:\s*\[\]/, `${file} bootstrap must include project slices`)
  }
})

test('task-summary browser fixtures return a scoped duration forecast object', () => {
  for (const { file, source } of taskSummarySources) {
    assert.match(source, /duration-forecasts/, `${file} must mock scoped duration forecasts`)
    assert.match(source, /dimensions:\s*\{/, `${file} duration forecast must expose dimension groups`)
  }
})
