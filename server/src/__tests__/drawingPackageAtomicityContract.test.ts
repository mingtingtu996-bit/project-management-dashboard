import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const source = readFileSync(resolve(serverRoot, 'src/routes/drawing-packages.ts'), 'utf8')

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

    expect(route).toContain('withDatabaseTransaction(async () => {')
    expect(route).toContain('FOR UPDATE')
    expect(route).toContain('UPDATE construction_drawings SET is_current_version')
    expect(route).toContain('UPDATE drawing_versions SET is_current_version')
    expect(route).toContain('UPDATE drawing_packages SET current_version_drawing_id')
  })
})
