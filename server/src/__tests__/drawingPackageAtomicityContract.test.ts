import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const source = readFileSync(resolve(serverRoot, 'src/routes/drawing-packages.ts'), 'utf8')
const constructionDrawingSource = readFileSync(resolve(serverRoot, 'src/routes/construction-drawings.ts'), 'utf8')

describe('drawing package write atomicity contract', () => {
  it('creates the package and every package item in one request transaction', () => {
    const route = source.slice(
      source.indexOf("router.post('/packages'"),
      source.indexOf("router.patch('/packages/:packageId'"),
    )

    expect(source).toContain("import { withDatabaseTransaction } from '../database.js'")
    expect(route).toContain('withDatabaseTransaction(async () => {')
    expect(route.indexOf('withDatabaseTransaction(async () => {')).toBeLessThan(route.indexOf('INSERT INTO drawing_packages'))
    expect(route.indexOf('INSERT INTO drawing_packages')).toBeLessThan(route.indexOf('INSERT INTO drawing_package_items'))
  })

  it('serializes current-version switches and commits every pointer together', () => {
    const route = source.slice(
      source.indexOf("router.post('/packages/:packageId/set-current-version'"),
      source.indexOf('\n  }\))', source.indexOf("router.post('/packages/:packageId/set-current-version'")) + 6,
    )

    const handler = route.slice(route.indexOf('asyncHandler(async (req, res)'))
    const transactionIndex = handler.indexOf('withDatabaseTransaction(async () => {')
    const lockedPackageIndex = handler.indexOf('FOR UPDATE')
    const drawingReadIndex = handler.indexOf('CONSTRUCTION_DRAWING_SELECT')
    const versionReadIndex = handler.indexOf('DRAWING_VERSION_SELECT')

    expect(transactionIndex).toBeGreaterThanOrEqual(0)
    expect(transactionIndex).toBeLessThan(lockedPackageIndex)
    expect(lockedPackageIndex).toBeLessThan(drawingReadIndex)
    expect(lockedPackageIndex).toBeLessThan(versionReadIndex)
    expect(handler).toContain('ORDER BY created_at ASC FOR UPDATE')
    expect(handler).toContain('ORDER BY is_current_version DESC, created_at DESC FOR UPDATE')
    expect(handler).toContain('is_current_version = CASE WHEN id = ? THEN ? ELSE ? END')
    expect(handler).not.toContain('for (const drawing of drawings)')
    expect(route).toMatch(/UPDATE construction_drawings\s+SET is_current_version/)
    expect(route).toMatch(/UPDATE drawing_versions\s+SET is_current_version/)
    expect(route).toContain('UPDATE drawing_packages SET current_version_drawing_id')
  })

  it('uses package-before-drawing lock order for construction drawing PUT and DELETE writers', () => {
    const putRoute = constructionDrawingSource.slice(
      constructionDrawingSource.indexOf("router.put('/:id'"),
      constructionDrawingSource.indexOf("router.delete('/:id'"),
    )
    const deleteRoute = constructionDrawingSource.slice(
      constructionDrawingSource.indexOf("router.delete('/:id'"),
    )

    expect(putRoute.indexOf('validateDrawingProjectReferences(')).toBeLessThan(
      putRoute.indexOf('LIMIT 1 FOR UPDATE'),
    )
    expect(deleteRoute.indexOf('validateDrawingProjectReferences(')).toBeLessThan(
      deleteRoute.indexOf('LIMIT 1 FOR UPDATE'),
    )
  })
})
