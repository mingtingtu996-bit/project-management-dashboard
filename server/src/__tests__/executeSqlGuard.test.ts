import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

function collectDirectExecuteSqlLiterals(source: string) {
  const literals: string[] = []
  const callPattern = /executeSQLOne?\(\s*(`(?:\\`|[^`])*`|'(?:\\'|[^'])*')/gs

  let match: RegExpExecArray | null
  while ((match = callPattern.exec(source)) !== null) {
    literals.push(match[1])
  }

  return literals
}

describe('executeSQL static guard', () => {
  it('does not allow direct executeSQL SQL literals to reintroduce forbidden patterns', () => {
    const files: string[] = []
    const pending = [resolve(serverRoot, 'src', 'routes'), resolve(serverRoot, 'src', 'services')]

    while (pending.length > 0) {
      const current = pending.pop()!
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const fullPath = join(current, entry.name)
        if (entry.isDirectory()) {
          pending.push(fullPath)
          continue
        }
        if (entry.isFile() && fullPath.endsWith('.ts')) {
          files.push(fullPath)
        }
      }
    }

    const findings: string[] = []
    const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
      { label: 'JOIN', pattern: /\bJOIN\b/i },
      { label: 'WHERE ... OR ...', pattern: /\bWHERE\b[\s\S]*\bOR\b/i },
      { label: 'LIKE', pattern: /\bLIKE\b/i },
      { label: 'COALESCE(', pattern: /\bCOALESCE\s*\(/i },
    ]

    for (const filePath of files) {
      if (filePath.endsWith(join('src', 'services', 'dbService.ts'))) continue

      const source = readFileSync(filePath, 'utf8')
      const literals = collectDirectExecuteSqlLiterals(source)

      for (const literal of literals) {
        for (const rule of forbiddenPatterns) {
          if (rule.pattern.test(literal)) {
            findings.push(`${filePath}: direct executeSQL literal contains forbidden ${rule.label}: ${literal.slice(0, 160)}`)
          }
        }
      }
    }

    expect(findings).toEqual([])
  })
})
