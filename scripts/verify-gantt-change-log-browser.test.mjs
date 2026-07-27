import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { readPlanningCellTaskReference } from './verify-gantt-change-log-browser.mjs'

const browserSource = readFileSync(
  new URL('verify-gantt-change-log-browser.mjs', import.meta.url),
  'utf8',
)

test('gantt change-log verification derives the selected task from the planning cell', () => {
  assert.deepEqual(
    readPlanningCellTaskReference('task-uuid:title', ' 总平面方案确认 '),
    { id: 'task-uuid', title: '总平面方案确认' },
  )
})

test('gantt change-log fixture supports the full-project reports bootstrap', () => {
  assert.match(browserSource, /pathname === `\/api\/projects\/\$\{projectId\}\/bootstrap`/)
  assert.match(browserSource, /project:\s*mockProject/)
  assert.match(browserSource, /taskProgressSnapshots:\s*\[\]/)
})
