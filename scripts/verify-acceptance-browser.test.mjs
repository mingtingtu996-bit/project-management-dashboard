import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractAcceptanceListRowTitle,
  resolveAcceptanceProjectId,
} from './verify-acceptance-browser.mjs'

test('proxy acceptance verification resolves the standard full-app fixture project', () => {
  const projectId = resolveAcceptanceProjectId({
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

test('acceptance browser verification does not treat a Lucide icon name as the plan title', () => {
  const title = extractAcceptanceListRowTitle(`1
ClipboardCheck
地基与基础验收
工程竣工预验收 · 2026-05
责任单位
责任单位待确认`)

  assert.equal(title, '地基与基础验收')
})

test('acceptance browser verification extracts the real staging list row title', () => {
  const title = extractAcceptanceListRowTitle(`1
验
标准项目-机电专项验收
其他 · 2026-06
责任单位
—
草稿`)

  assert.equal(title, '标准项目-机电专项验收')
})
