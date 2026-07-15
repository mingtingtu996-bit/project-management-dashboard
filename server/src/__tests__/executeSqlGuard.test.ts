import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DYNAMIC_SQL_APPROVAL_MARKER = 'execute-sql-dynamic-approved'
const DYNAMIC_DATABASE_QUERY_APPROVAL_MARKER = 'database-query-dynamic-approved'
const RETIRED_EXECUTE_SQL_RPC_DIAGNOSTIC_MARKER = 'c18_l04_execute_sql_anon_poc_live_diagnostic'
const retiredExecuteSqlRpcDiagnosticAllowlist = new Set([
  'src/scripts/diagnose-execute-sql-anon-poc-live.ts',
])
const retiredExecuteSqlMentionAllowlist = new Set([
  'src/scripts/diagnose-execute-sql-anon-poc-live.ts',
  'src/scripts/diagnose-rls-proacl-live.ts',
])
const executeSqlScanRoots = [
  resolve(serverRoot, 'src', 'routes'),
  resolve(serverRoot, 'src', 'services'),
  resolve(serverRoot, 'src', 'jobs'),
  resolve(serverRoot, 'src', 'middleware'),
  resolve(serverRoot, 'src', 'scripts'),
]
const knownDynamicExecuteSqlDebt = new Set<string>()
const knownComplexExecuteSqlDebt = new Set<string>()
const knownDynamicDatabaseQueryDebt = new Set<string>()

function collectSourceFiles() {
  const files: string[] = []
  const pending = [...executeSqlScanRoots]

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

  return files.filter((filePath) => !filePath.endsWith(join('src', 'services', 'dbService.ts')))
}

function getLineNumber(source: string, index: number) {
  return source.slice(0, index).split(/\r?\n/).length
}

function formatFindingPath(filePath: string) {
  if (!isAbsolute(filePath)) return filePath.replace(/\\/g, '/')
  return relative(serverRoot, filePath).replace(/\\/g, '/')
}

function isApprovedRetiredExecuteSqlRpcDiagnostic(filePath: string, source: string) {
  const normalizedPath = formatFindingPath(filePath)
  return retiredExecuteSqlRpcDiagnosticAllowlist.has(normalizedPath)
    && source.includes(RETIRED_EXECUTE_SQL_RPC_DIAGNOSTIC_MARKER)
}

function hasDynamicSqlApproval(source: string, index: number) {
  const before = source.slice(0, index).split(/\r?\n/)
  return before.slice(Math.max(0, before.length - 5)).some((line) => line.includes(DYNAMIC_SQL_APPROVAL_MARKER))
}

function skipWhitespace(source: string, index: number) {
  let cursor = index
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1
  return cursor
}

function readTemplateLiteral(source: string, index: number) {
  let cursor = index + 1
  let raw = '`'
  while (cursor < source.length) {
    const char = source[cursor]
    raw += char
    if (char === '\\') {
      cursor += 1
      if (cursor < source.length) raw += source[cursor]
    } else if (char === '`') {
      return raw
    }
    cursor += 1
  }
  return raw
}

function stripTemplateExpressions(literal: string) {
  return literal.replace(/\$\{[^}]*\}/g, '${}')
}

function collectDynamicExecuteSqlFindings(source: string, filePath: string) {
  const findings: string[] = []
  const dynamicCallPattern = /\bexecuteSQL(?:One)?\s*(?:<[^;]*?>)?\s*\(/g
  const riskyTemplateExpressionPattern = /\$\{\s*[^}]*\b(?:sql|query|table|tableName|column|columns|fields|setClauses|order|sort|direction)\b[^}]*\s*\}/i

  let match: RegExpExecArray | null
  while ((match = dynamicCallPattern.exec(source)) !== null) {
    const prefix = source.slice(Math.max(0, match.index - 20), match.index)
    if (/\bfunction\s*$/.test(prefix)) continue

    const argumentStart = skipWhitespace(source, match.index + match[0].length)
    const firstChar = source[argumentStart]
    const approved = hasDynamicSqlApproval(source, match.index)

    if (firstChar === '`') {
      const literal = readTemplateLiteral(source, argumentStart)
      if (riskyTemplateExpressionPattern.test(literal) && !approved) {
        findings.push(`${formatFindingPath(filePath)}:${getLineNumber(source, match.index)} dynamic SQL template fragment requires ${DYNAMIC_SQL_APPROVAL_MARKER}`)
      }
      continue
    }

    if (firstChar === '\'' || firstChar === '"') continue

    if (!approved) {
      findings.push(`${formatFindingPath(filePath)}:${getLineNumber(source, match.index)} dynamic executeSQL argument requires ${DYNAMIC_SQL_APPROVAL_MARKER}`)
    }
  }

  return findings
}

function normalizeComplexDebtFinding(finding: string) {
  return finding.replace(/: [`'][\s\S]*$/, '')
}

function collectDirectExecuteSqlLiterals(source: string) {
  const literals: string[] = []
  const callPattern = /executeSQL(?:One)?\s*(?:<[^;]*?>)?\s*\(\s*(`(?:\\`|[^`])*`|'(?:\\'|[^'])*')/gs

  let match: RegExpExecArray | null
  while ((match = callPattern.exec(source)) !== null) {
    literals.push(match[1])
  }

  return literals
}

function collectDatabaseQueryAliases(source: string) {
  const aliases = new Set<string>()
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*['"](?:\.\.\/)+database\.js['"]/g

  let match: RegExpExecArray | null
  while ((match = importPattern.exec(source)) !== null) {
    for (const part of match[1].split(',')) {
      const tokens = part.trim().split(/\s+as\s+/i).map((token) => token.trim())
      const exportedName = tokens[0]
      const localName = tokens[1] ?? exportedName
      if (exportedName === 'query') aliases.add(localName)
    }
  }

  return aliases
}

function collectDynamicDatabaseQueryFindings(source: string, filePath: string) {
  const findings: string[] = []
  const riskyTemplateExpressionPattern = /\$\{\s*[^}]*\b(?:sql|query|table|tableName|column|columns|fields|setClauses|order|sort|direction)\b[^}]*\s*\}/i

  for (const alias of collectDatabaseQueryAliases(source)) {
    const callPattern = new RegExp(`\\b${alias}\\s*(?:<[^;]*?>)?\\s*\\(`, 'g')
    let match: RegExpExecArray | null
    while ((match = callPattern.exec(source)) !== null) {
      const prefix = source.slice(Math.max(0, match.index - 20), match.index)
      if (/\bfunction\s*$/.test(prefix)) continue

      const argumentStart = skipWhitespace(source, match.index + match[0].length)
      const firstChar = source[argumentStart]
      const approved = hasMarkerNearby(source, match.index, DYNAMIC_DATABASE_QUERY_APPROVAL_MARKER)

      if (firstChar === '`') {
        const literal = readTemplateLiteral(source, argumentStart)
        if (riskyTemplateExpressionPattern.test(literal) && !approved) {
          findings.push(`${formatFindingPath(filePath)}:${getLineNumber(source, match.index)} dynamic database query template requires ${DYNAMIC_DATABASE_QUERY_APPROVAL_MARKER}`)
        }
        continue
      }

      if (firstChar === '\'' || firstChar === '"') continue

      if (!approved) {
        findings.push(`${formatFindingPath(filePath)}:${getLineNumber(source, match.index)} dynamic database query argument requires ${DYNAMIC_DATABASE_QUERY_APPROVAL_MARKER}`)
      }
    }
  }

  return findings
}

function hasMarkerNearby(source: string, index: number, marker: string) {
  const before = source.slice(0, index).split(/\r?\n/)
  return before.slice(Math.max(0, before.length - 5)).some((line) => line.includes(marker))
}

describe('executeSQL static guard', () => {
  it('does not allow direct executeSQL SQL literals to reintroduce forbidden patterns', () => {
    const files = collectSourceFiles()

    const findings: string[] = []
    const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
      { label: 'JOIN', pattern: /\bJOIN\b/i },
      { label: 'WHERE ... OR ...', pattern: /\bWHERE\b[\s\S]*\bOR\b/i },
      { label: 'LIKE', pattern: /\bLIKE\b/i },
      { label: 'COALESCE(', pattern: /\bCOALESCE\s*\(/i },
    ]

    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8')
      const literals = collectDirectExecuteSqlLiterals(source)

      for (const literal of literals) {
        const sqlText = stripTemplateExpressions(literal)
        for (const rule of forbiddenPatterns) {
          if (rule.pattern.test(sqlText)) {
            findings.push(`${formatFindingPath(filePath)}: direct executeSQL literal contains forbidden ${rule.label}: ${sqlText.slice(0, 160)}`)
          }
        }
      }
    }

    const unexpectedFindings = findings
      .map(normalizeComplexDebtFinding)
      .filter((finding) => !knownComplexExecuteSqlDebt.has(finding))

    expect(unexpectedFindings).toEqual([])
    expect(new Set(findings.map(normalizeComplexDebtFinding))).toEqual(knownComplexExecuteSqlDebt)
  })

  it('detects dynamic SQL when executeSQL has a generic array return type', () => {
    const findings = collectDynamicExecuteSqlFindings(
      `
        async function load(query: string, params: unknown[]) {
          return executeSQL<TemplateRow[]>(query, params)
        }
      `,
      'fixture.ts',
    )

    expect(findings).toEqual([
      `fixture.ts:3 dynamic executeSQL argument requires ${DYNAMIC_SQL_APPROVAL_MARKER}`,
    ])
  })

  it('does not allow new unapproved dynamic executeSQL SQL text beyond the audited debt snapshot', () => {
    const findings: string[] = []
    for (const filePath of collectSourceFiles()) {
      const source = readFileSync(filePath, 'utf8')
      findings.push(...collectDynamicExecuteSqlFindings(source, filePath))
    }

    const unexpectedFindings = findings.filter((finding) => !knownDynamicExecuteSqlDebt.has(finding))
    expect(unexpectedFindings).toEqual([])
    expect(findings).toHaveLength(knownDynamicExecuteSqlDebt.size)
  })

  it('detects dynamic SQL passed directly to database.query aliases', () => {
    const findings = collectDynamicDatabaseQueryFindings(
      `
        import { query as rawQuery } from '../database.js'

        async function load(sql: string, params: unknown[]) {
          return rawQuery(sql, params)
        }
      `,
      'fixture.ts',
    )

    expect(findings).toEqual([
      `fixture.ts:5 dynamic database query argument requires ${DYNAMIC_DATABASE_QUERY_APPROVAL_MARKER}`,
    ])
  })

  it('requires project wizard metadata SQL adapters to carry an explicit dynamic-query approval', () => {
    const source = readFileSync(resolve(serverRoot, 'src/routes/projectWizard.ts'), 'utf8')

    expect(source).toContain(
      'database-query-dynamic-approved: project wizard metadata updater owns only fixed project UPDATE SQL templates',
    )
  })

  it('does not allow new unapproved dynamic direct database query SQL text beyond the audited debt snapshot', () => {
    const findings: string[] = []
    for (const filePath of collectSourceFiles()) {
      const source = readFileSync(filePath, 'utf8')
      findings.push(...collectDynamicDatabaseQueryFindings(source, filePath))
    }

    const unexpectedFindings = findings.filter((finding) => !knownDynamicDatabaseQueryDebt.has(finding))
    expect(unexpectedFindings).toEqual([])
    expect(findings).toHaveLength(knownDynamicDatabaseQueryDebt.size)
  })

  it('does not allow the retired execute_sql RPC to be called from server code', () => {
    const findings: string[] = []
    const retiredRpcPattern = /\.rpc\s*\(\s*['"`]execute_sql['"`]/g

    for (const filePath of collectSourceFiles()) {
      const source = readFileSync(filePath, 'utf8')
      if (isApprovedRetiredExecuteSqlRpcDiagnostic(filePath, source)) continue

      let match: RegExpExecArray | null
      while ((match = retiredRpcPattern.exec(source)) !== null) {
        findings.push(`${formatFindingPath(filePath)}:${getLineNumber(source, match.index)} calls retired execute_sql RPC`)
      }
    }

    expect(findings).toEqual([])
  }, 15000)

  it('does not leave operator-facing scripts that recommend the retired execute_sql RPC', () => {
    const findings: string[] = []
    const retiredRpcMentionPattern = /\bexecute_sql\b/g

    for (const filePath of collectSourceFiles()) {
      const source = readFileSync(filePath, 'utf8')
      const normalizedPath = formatFindingPath(filePath)
      if (retiredExecuteSqlMentionAllowlist.has(normalizedPath)) continue

      let match: RegExpExecArray | null
      while ((match = retiredRpcMentionPattern.exec(source)) !== null) {
        findings.push(`${normalizedPath}:${getLineNumber(source, match.index)} mentions retired execute_sql RPC`)
      }
    }

    expect(findings).toEqual([])
  })
})
