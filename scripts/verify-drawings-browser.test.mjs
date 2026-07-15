import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveExpectedDrawingVersionLabel,
  waitForLocatorTextIncludes,
  resolveDrawingsProjectId,
  selectDrawingFixturePackage,
} from './verify-drawings-browser.mjs'

test('proxy drawings verification resolves the standard full-app fixture project', () => {
  const projectId = resolveDrawingsProjectId({
    envProjectId: '',
    mockApi: false,
    currentProjectId: 'legacy-project',
    manifest: {
      projects: {
        standard: { id: 'standard-project' },
        large: { id: 'large-project' },
        empty: { id: 'empty-project' },
      },
    },
  })

  assert.equal(projectId, 'standard-project')
})

test('drawings verification selects the fixed staging fixture package by code', () => {
  const fixture = {
    packageCode: 'v1424-browser-structure',
    packageName: 'v1.4.24 structure drawing package',
  }

  const selected = selectDrawingFixturePackage([
    { packageCode: 'other', packageName: 'other package' },
    { packageCode: fixture.packageCode, packageName: 'renamed package' },
  ], fixture)

  assert.deepEqual(selected, { packageCode: fixture.packageCode, packageName: 'renamed package' })
})

test('drawings verification waits until the detail drawer renders the target package text', async () => {
  let attempts = 0
  const locator = {
    async innerText() {
      attempts += 1
      return attempts < 3 ? '图纸包详情\n暂无详情数据' : 'v1.4.24 structure drawing package\n当前有效v1.2'
    },
  }

  const text = await waitForLocatorTextIncludes(locator, 'v1.4.24 structure drawing package', {
    timeoutMs: 500,
    intervalMs: 1,
    description: 'drawing drawer package name',
  })

  assert.equal(text, 'v1.4.24 structure drawing package\n当前有效v1.2')
  assert.equal(attempts, 3)
})

test('drawings verification asserts dynamic staging versions by label instead of mock row id', () => {
  const label = resolveExpectedDrawingVersionLabel({
    packageId: 'real-db-package-id',
    currentVersionNo: '1.2',
  })

  assert.equal(label, 'v1.2')
})
