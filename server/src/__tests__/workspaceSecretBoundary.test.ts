import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

function collectFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(root, entry.name)
    return entry.isDirectory() ? collectFiles(fullPath) : [fullPath]
  })
}

describe('workspace secret boundary', () => {
  it('ignores all repository-local tmp recovery and env backup files', () => {
    const gitignore = readFileSync(resolve(workspaceRoot, '.gitignore'), 'utf8')
    expect(gitignore).toMatch(/^tmp\/$/m)

    const result = spawnSync(
      'git',
      ['check-ignore', '--quiet', 'tmp/security-contract/server.production.env'],
      { cwd: workspaceRoot, encoding: 'utf8' },
    )
    expect(result.status).toBe(0)
  })

  it('does not track any file below the repository-local tmp directory', () => {
    const result = spawnSync('git', ['ls-files', 'tmp'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('does not retain plaintext environment backups inside the workspace tmp directory', () => {
    const tmpRoot = resolve(workspaceRoot, 'tmp')
    const plaintextEnvironmentBackups = collectFiles(tmpRoot)
      .filter((filePath) => /(^\.env(?:\.|$)|\.env(?:\.|$)|env\.bak$|production\.env$|server\.env\.)/i.test(basename(filePath)))
      .map((filePath) => relative(workspaceRoot, filePath).replaceAll('\\', '/'))

    expect(plaintextEnvironmentBackups).toEqual([])
  })
})
