import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const read = (relativePath) => readFileSync(resolve(repoRoot, relativePath), 'utf8')

const retiredFrontendRoutes = [
  '/company/templates',
  '/projects',
  '/dashboard',
  'tasks',
  'tasks/closeout',
  'planning/closeout',
  'planning/revision-pool',
  'planning/wbs-templates',
  'wbs-templates',
]

test('retired frontend routes and page objects stay out of the application graph', () => {
  const appSource = read('client/src/App.tsx')

  for (const routePath of retiredFrontendRoutes) {
    assert.doesNotMatch(appSource, new RegExp(`path=["']${routePath.replaceAll('/', '\\/')}["']`))
  }

  for (const componentName of ['CompanyProjectTemplateLibrary', 'WBSTemplates', 'PlanningWorkspace']) {
    assert.doesNotMatch(appSource, new RegExp(`\\b${componentName}\\b`))
  }

  assert.match(appSource, /path=["']planning["'] element={<Navigate to=["']baseline["'] replace\s*\/>}/)
  assert.equal(existsSync(resolve(repoRoot, 'client/src/pages/CompanyProjectTemplateLibrary.tsx')), false)
  assert.equal(existsSync(resolve(repoRoot, 'client/src/pages/WBSTemplates.tsx')), false)
  assert.equal(existsSync(resolve(repoRoot, 'client/src/pages/planning/PlanningWorkspace.tsx')), false)
})

test('runtime navigation uses canonical task-list and planning routes', () => {
  const runtimeSources = [
    'client/src/pages/Dashboard.tsx',
    'client/src/pages/GanttView.tsx',
    'client/src/pages/Milestones.tsx',
    'client/src/components/layout/ProjectLayout.tsx',
    'client/src/config/navigation.ts',
  ].map(read).join('\n')

  assert.doesNotMatch(runtimeSources, /\/projects\/\$\{[^}]+}\/tasks(?:[?`'"/]|$)/)
  assert.doesNotMatch(runtimeSources, /\/tasks\/closeout/)
  assert.doesNotMatch(runtimeSources, /\/wbs-templates/)
})

test('the legacy WBS API mount is removed', () => {
  const serverIndexSource = read('server/src/index.ts')

  assert.match(serverIndexSource, /app\.use\(['"]\/api\/planning\/wbs-templates['"], wbsTemplatesRouter\)/)
  assert.doesNotMatch(serverIndexSource, /app\.use\(['"]\/api\/wbs-templates['"], wbsTemplatesRouter\)/)
})
