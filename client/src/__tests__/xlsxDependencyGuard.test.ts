import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const clientRoot = resolve(process.cwd().endsWith('client') ? process.cwd() : resolve(process.cwd(), 'client'))
const sourceRoot = resolve(clientRoot, 'src')

function readPackageJson() {
  return JSON.parse(readFileSync(resolve(clientRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
}

function readPnpmLockfile() {
  return readFileSync(resolve(clientRoot, 'pnpm-lock.yaml'), 'utf8')
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = resolve(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) return listSourceFiles(fullPath)
    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : []
  })
}

describe('spreadsheet dependency guard', () => {
  it('does not use the vulnerable npm xlsx package in frontend import/export surfaces', () => {
    const packageJson = readPackageJson()
    const dependencies = packageJson.dependencies ?? {}
    const lockfile = readPnpmLockfile()

    expect(dependencies).not.toHaveProperty('xlsx')
    expect(dependencies['@e965/xlsx']).toMatch(/^(\^|~)?0\.20\./)
    expect(lockfile).not.toContain('xlsx@0.18.5')
    expect(lockfile).toContain("'@e965/xlsx':")

    const offenders = listSourceFiles(sourceRoot).filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /from\s+['"]xlsx['"]|import\s*\(\s*['"]xlsx['"]\s*\)|typeof\s+import\s*\(\s*['"]xlsx['"]\s*\)/.test(source)
    })

    expect(offenders).toEqual([])
  })
})
