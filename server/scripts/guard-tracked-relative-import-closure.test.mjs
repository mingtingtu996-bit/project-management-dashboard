import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  auditTrackedRelativeImports,
  collectRelativeImportSpecifiers,
} from './guard-tracked-relative-import-closure.mjs'

test('collects static, exported, dynamic, and require relative imports', () => {
  const imports = collectRelativeImportSpecifiers(`
    import value from './value.js'
    export { other } from '../other.js'
    const lazy = import('./lazy.js')
    const legacy = require('./legacy.cjs')
    import packageValue from 'package-name'
  `, 'fixture.ts')

  assert.deepEqual(imports.sort(), [
    '../other.js',
    './lazy.js',
    './legacy.cjs',
    './value.js',
  ])
})

test('flags relative imports whose source target exists but is not tracked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tracked-import-closure-'))
  try {
    await mkdir(join(root, 'server', 'src'), { recursive: true })
    await writeFile(
      join(root, 'server', 'src', 'entry.ts'),
      "import { helper } from './helper.js'\nvoid helper\n",
      'utf8',
    )
    await writeFile(
      join(root, 'server', 'src', 'helper.ts'),
      'export const helper = true\n',
      'utf8',
    )

    const result = auditTrackedRelativeImports({
      repoRoot: root,
      trackedFiles: ['server/src/entry.ts'],
      scanRoots: ['server/src'],
    })

    assert.equal(result.violations.length, 1)
    assert.deepEqual(result.violations[0], {
      importer: 'server/src/entry.ts',
      specifier: './helper.js',
      resolvedPath: 'server/src/helper.ts',
      reason: 'target_untracked',
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('accepts JavaScript import specifiers resolved to tracked TypeScript sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tracked-import-closure-'))
  try {
    await mkdir(join(root, 'server', 'src'), { recursive: true })
    await writeFile(
      join(root, 'server', 'src', 'entry.ts'),
      "import { helper } from './helper.js'\nvoid helper\n",
      'utf8',
    )
    await writeFile(
      join(root, 'server', 'src', 'helper.ts'),
      'export const helper = true\n',
      'utf8',
    )

    const result = auditTrackedRelativeImports({
      repoRoot: root,
      trackedFiles: ['server/src/entry.ts', 'server/src/helper.ts'],
      scanRoots: ['server/src'],
    })

    assert.equal(result.scannedFileCount, 2)
    assert.equal(result.relativeImportCount, 1)
    assert.deepEqual(result.violations, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
