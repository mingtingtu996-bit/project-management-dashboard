import type {
  SchemaDriftConstraint,
  SchemaDriftExpectedColumn,
  SchemaDriftExpectedTable,
  SchemaDriftIndex,
  SchemaDriftPolicy,
} from './migrationSafetyGateService.js'

type MutableExpectedTable = SchemaDriftExpectedTable & {
  columns: SchemaDriftExpectedColumn[]
  constraints: SchemaDriftConstraint[]
  indexes: SchemaDriftIndex[]
}

const CONTROLLED_POLICY_MARKER_START = '/*__schema_drift_controlled_policy_start__*/'
const CONTROLLED_POLICY_MARKER_END = '/*__schema_drift_controlled_policy_end__*/'

export function buildExpectedSchemaFromMigrationSql(sql: string): SchemaDriftExpectedTable[] {
  const tables = new Map<string, MutableExpectedTable>()
  const normalizedSql = stripSqlComments(maskDollarQuotedBodies(inlineControlledPolicyExecuteBlocks(sql)))

  applyCreateTableStatements(normalizedSql, tables)
  applyAlterTableStatements(normalizedSql, tables)
  applyPolicyTemplateRuntimePublicationRollbackStatus(sql, tables)
  applyIndexStatements(normalizedSql, tables)
  applyAlterIndexStatements(normalizedSql, tables)
  applyDynamicallyDiscoveredForeignKeyDrops(sql, tables)
  applyDroppedColumnDependencyCleanup(normalizedSql, tables)
  applyRlsStatements(normalizedSql, tables)
  applyPolicyStatements(normalizedSql, tables)
  applyDynamicBackendRuntimeRlsLoops(sql, tables)
  applyProjectHealthHistoryAdvisorSecurityCloseout(sql, tables)
  applyAdvisorPrivateMembershipPolicyRewrite(sql, tables)
  applyDropTableStatements(normalizedSql, tables)
  applyViewStatements(normalizedSql, tables)

  return Array.from(tables.values()).sort((left, right) => left.tableName.localeCompare(right.tableName))
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
}

function inlineControlledPolicyExecuteBlocks(sql: string) {
  const executeDollarQuotePattern = /\bexecute\s+\$([a-zA-Z0-9_]*)\$([\s\S]*?)\$\1\$\s*;/gi
  return sql.replace(executeDollarQuotePattern, (match: string, _tag: string, body: string) => {
    const statement = body.trim()
    if (!/^(create|drop)\s+policy\b/i.test(statement)) {
      return match
    }

    return `${CONTROLLED_POLICY_MARKER_START}\n${statement};\n${CONTROLLED_POLICY_MARKER_END}`
  })
}

function maskDollarQuotedBodies(sql: string) {
  let result = ''
  let cursor = 0
  let scanIndex = 0

  while (scanIndex < sql.length) {
    const openQuote = findNextDollarQuote(sql, scanIndex)
    if (!openQuote) break

    const { tag, index: tagStart } = openQuote
    const bodyStart = tagStart + tag.length
    const bodyEnd = findClosingDollarQuote(sql, tag, bodyStart)
    if (bodyEnd === -1) break

    const body = sql.slice(bodyStart, bodyEnd)
    const controlledPolicyStatement = extractControlledDollarQuotedPolicyStatementAt(sql, tagStart, body)
    const markedControlledPolicyStatements = controlledPolicyStatement
      ? null
      : extractMarkedControlledPolicyStatements(body)
    const guardedDirectPolicyStatements = controlledPolicyStatement || markedControlledPolicyStatements
      ? null
      : extractGuardedDirectPolicyStatements(body)
    const controlledConstraintStatements = controlledPolicyStatement || markedControlledPolicyStatements || guardedDirectPolicyStatements
      ? null
      : extractControlledConstraintStatements(body)
    const controlledColumnStatements = controlledPolicyStatement || markedControlledPolicyStatements || guardedDirectPolicyStatements || controlledConstraintStatements
      ? null
      : extractControlledColumnStatements(body)
    const nestedControlledPolicyStatements = controlledPolicyStatement
      || markedControlledPolicyStatements
      || guardedDirectPolicyStatements
      || controlledConstraintStatements
      || controlledColumnStatements
      ? null
      : extractControlledDollarQuotedPolicyStatements(body)

    result += sql.slice(cursor, bodyStart)
    result += controlledPolicyStatement || markedControlledPolicyStatements || guardedDirectPolicyStatements || controlledConstraintStatements || controlledColumnStatements || nestedControlledPolicyStatements
      ? padSqlReplacement(body, controlledPolicyStatement ?? markedControlledPolicyStatements ?? guardedDirectPolicyStatements ?? controlledConstraintStatements ?? controlledColumnStatements ?? nestedControlledPolicyStatements ?? '')
      : ' '.repeat(bodyEnd - bodyStart)
    result += tag
    cursor = bodyEnd + tag.length
    scanIndex = cursor
  }

  result += sql.slice(cursor)
  return result
}

function findNextDollarQuote(sql: string, startIndex: number) {
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let index = startIndex; index < sql.length; index += 1) {
    const character = sql[index]

    if (inSingleQuote) {
      if (character === "'" && sql[index + 1] === "'") {
        index += 1
        continue
      }
      if (character === "'") inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      if (character === '"' && sql[index + 1] === '"') {
        index += 1
        continue
      }
      if (character === '"') inDoubleQuote = false
      continue
    }

    if (character === "'") {
      inSingleQuote = true
      continue
    }

    if (character === '"') {
      inDoubleQuote = true
      continue
    }

    if (character !== '$') continue

    const tagMatch = sql.slice(index).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$|^\$\$/)
    if (!tagMatch?.[0]) continue

    return { tag: tagMatch[0], index }
  }

  return null
}

function findClosingDollarQuote(sql: string, tag: string, startIndex: number) {
  return sql.indexOf(tag, startIndex)
}

function extractControlledDollarQuotedPolicyStatementAt(sql: string, tagStart: number, body: string) {
  const prefix = sql.slice(Math.max(0, tagStart - 32), tagStart)
  if (!/\bexecute\s+$/i.test(prefix)) {
    return null
  }

  const statement = body.trim()
  if (!/^(create|drop)\s+policy\b/i.test(statement)) {
    return null
  }

  return `${statement};`
}

function extractControlledDollarQuotedPolicyStatements(sql: string) {
  const statements: string[] = []
  const executeDollarQuotePattern = /\bexecute\s+\$([a-zA-Z0-9_]*)\$([\s\S]*?)\$\1\$\s*;/gi
  let match: RegExpExecArray | null

  while ((match = executeDollarQuotePattern.exec(sql)) !== null) {
    const body = match[2]?.trim()
    if (!body || !/^(create|drop)\s+policy\b/i.test(body)) continue
    statements.push(`${body};`)
  }

  return statements.length > 0 ? statements.join('\n\n') : null
}

function extractMarkedControlledPolicyStatements(sql: string) {
  const statements: string[] = []
  const markerPattern = /\/\*__schema_drift_controlled_policy_start__\*\/([\s\S]*?)\/\*__schema_drift_controlled_policy_end__\*\//g
  let match: RegExpExecArray | null

  while ((match = markerPattern.exec(sql)) !== null) {
    const body = match[1]?.trim()
    if (!body || !/^(create|drop)\s+policy\b/i.test(body)) continue
    statements.push(body)
  }

  return statements.length > 0 ? statements.join('\n\n') : null
}

function extractGuardedDirectPolicyStatements(sql: string) {
  const statements: string[] = []
  const policyPattern = /\b(?:drop\s+policy\s+(?:if\s+exists\s+)?(?:"[^"]+"|[a-zA-Z0-9_]+)\s+on\s+([a-zA-Z0-9_".]+)\s*;|create\s+policy\s+(?:"[^"]+"|[a-zA-Z0-9_]+)\s+on\s+([a-zA-Z0-9_".]+)[\s\S]*?;)/gi
  let match: RegExpExecArray | null

  while ((match = policyPattern.exec(sql)) !== null) {
    const tableName = normalizeObjectName(match[1] ?? match[2])
    if (!tableName || !hasToRegclassExistenceGuard(sql, tableName)) continue
    statements.push(match[0].trim())
  }

  return statements.length > 0 ? statements.join('\n\n') : null
}

function hasToRegclassExistenceGuard(sql: string, tableName: string) {
  const escapedTableName = escapeRegExp(tableName)
  return new RegExp(
    `to_regclass\\s*\\(\\s*'(?:(?:public)\\.)?${escapedTableName}'\\s*\\)\\s+is\\s+not\\s+null`,
    'i',
  ).test(sql.replace(/"/g, ''))
}

function extractControlledConstraintStatements(sql: string) {
  const statements: string[] = []
  const constraintPattern = /\balter\s+table\s+(?:if\s+exists\s+)?[a-zA-Z0-9_".]+\s+(?:(?:drop\s+constraint\s+(?:if\s+exists\s+)?(?:"[^"]+"|[a-zA-Z0-9_]+))|(?:add\s+constraint\s+(?:"[^"]+"|[a-zA-Z0-9_]+)\s+(?:primary\s+key|foreign\s+key|unique|check)\b[\s\S]*?))\s*;/gi
  let match: RegExpExecArray | null

  while ((match = constraintPattern.exec(sql)) !== null) {
    const statement = match[0].trim()
    if (!isGuardedConstraintStatement(sql, statement)) continue
    statements.push(statement)
  }

  return statements.length > 0 ? statements.join('\n\n') : null
}

function extractControlledColumnStatements(sql: string) {
  const statements: string[] = []
  const columnPattern = /\balter\s+table\s+(?:if\s+exists\s+)?[a-zA-Z0-9_".]+\s+(?:(?:rename\s+column\s+(?:"[^"]+"|[a-zA-Z0-9_]+)\s+to\s+(?:"[^"]+"|[a-zA-Z0-9_]+))|(?:drop\s+column\s+(?:if\s+exists\s+)?(?:"[^"]+"|[a-zA-Z0-9_]+)))\s*;/gi
  let match: RegExpExecArray | null

  while ((match = columnPattern.exec(sql)) !== null) {
    statements.push(match[0].trim())
  }

  return statements.length > 0 ? statements.join('\n\n') : null
}

function isGuardedConstraintStatement(sql: string, statement: string) {
  const constraintName = statement.match(/\bconstraint\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([a-zA-Z0-9_]+))/i)?.[1]
    ?? statement.match(/\bconstraint\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([a-zA-Z0-9_]+))/i)?.[2]
  if (!constraintName) return false

  const escapedConstraintName = escapeRegExp(constraintName)
  return new RegExp(`\\bconname\\s*=\\s*'${escapedConstraintName}'`, 'i').test(sql)
    || new RegExp(`drop\\s+constraint\\s+(?:if\\s+exists\\s+)?(?:"${escapedConstraintName}"|${escapedConstraintName})`, 'i').test(sql)
    || isDynamicallyDiscoveredConstraintReplacement(sql, statement)
}

function isDynamicallyDiscoveredConstraintReplacement(sql: string, statement: string) {
  if (!/\badd\s+constraint\b/i.test(statement)) return false

  const tableName = normalizeObjectName(statement.match(/\balter\s+table\s+(?:if\s+exists\s+)?(?<table>[a-zA-Z0-9_".]+)/i)?.groups?.table)
  if (!tableName) return false

  return new RegExp(`\\brel\\.relname\\s*=\\s*'${escapeRegExp(tableName)}'`, 'i').test(sql)
    && /\bpg_get_constraintdef\s*\(/i.test(sql)
    && /\bexecute\s+format\s*\(\s*'alter\s+table\s+[^']+\s+drop\s+constraint\s+%i'/i.test(sql)
}

function padSqlReplacement(original: string, replacement: string) {
  if (replacement.length >= original.length) {
    return replacement
  }

  return `${replacement}${' '.repeat(original.length - replacement.length)}`
}

function applyCreateTableStatements(sql: string, tables: Map<string, MutableExpectedTable>) {
  const createTablePattern = /create\s+table\s+(?<ifNotExists>if\s+not\s+exists\s+)?(?<table>[a-zA-Z0-9_".]+)\s*\((?<body>[\s\S]*?)\)\s*(?:engine\s*=\s*[a-zA-Z0-9_]+\s*)?(?:default\s+charset\s*=\s*[a-zA-Z0-9_]+\s*)?;/gi
  let match: RegExpExecArray | null

  while ((match = createTablePattern.exec(sql)) !== null) {
    const tableName = normalizeObjectName(match.groups?.table)
    const body = match.groups?.body ?? ''
    if (!tableName) continue
    if (match.groups?.ifNotExists && tables.has(tableName)) continue

    const table = ensureExpectedTable(tables, tableName)
    const tablePrimaryKeys = extractTablePrimaryKeys(body)
    for (const segment of splitTopLevelComma(body)) {
      const tableConstraint = parseTableConstraintDefinition(tableName, segment)
      if (tableConstraint) {
        upsertConstraint(table, tableConstraint)
        continue
      }

      const column = parseColumnDefinition(segment, tablePrimaryKeys, tableName)
      if (!column) continue
      upsertColumn(table, column)

      for (const columnConstraint of parseColumnConstraints(tableName, segment, column.columnName)) {
        upsertConstraint(table, columnConstraint)
      }
    }
  }
}

function applyDropTableStatements(sql: string, tables: Map<string, MutableExpectedTable>) {
  const dropTablePattern = /drop\s+table\s+(?:if\s+exists\s+)?(?<tables>[\s\S]*?)\s*(?:cascade|restrict)?\s*;/gi
  let match: RegExpExecArray | null

  while ((match = dropTablePattern.exec(sql)) !== null) {
    const tableNames = match.groups?.tables ?? ''
    for (const rawTableName of splitTopLevelComma(tableNames)) {
      const tableName = normalizeObjectName(rawTableName.replace(/\s+(?:cascade|restrict)$/i, ''))
      if (tableName) tables.delete(tableName)
    }
  }
}

function applyViewStatements(sql: string, tables: Map<string, MutableExpectedTable>) {
  const createViewPattern = /create\s+(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?<view>[a-zA-Z0-9_".]+)/gi
  let createMatch: RegExpExecArray | null
  while ((createMatch = createViewPattern.exec(sql)) !== null) {
    const viewName = normalizeObjectName(createMatch.groups?.view)
    if (viewName) tables.delete(viewName)
  }

  const dropViewPattern = /drop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?(?<views>[\s\S]*?)\s*(?:cascade|restrict)?\s*;/gi
  let dropMatch: RegExpExecArray | null
  while ((dropMatch = dropViewPattern.exec(sql)) !== null) {
    const viewNames = dropMatch.groups?.views ?? ''
    for (const rawViewName of splitTopLevelComma(viewNames)) {
      const viewName = normalizeObjectName(rawViewName.replace(/\s+(?:cascade|restrict)$/i, ''))
      if (viewName) tables.delete(viewName)
    }
  }
}

function applyAlterTableStatements(sql: string, tables: Map<string, MutableExpectedTable>) {
  const alterTablePattern = /alter\s+table\s+(?:if\s+exists\s+)?(?<table>[a-zA-Z0-9_".]+)\s+(?<body>[\s\S]*?);/gi
  let alterMatch: RegExpExecArray | null

  while ((alterMatch = alterTablePattern.exec(sql)) !== null) {
    const tableName = normalizeObjectName(alterMatch.groups?.table)
    const body = alterMatch.groups?.body ?? ''
    if (!tableName) continue

    for (const operation of splitTopLevelComma(body)) {
      applyAlterTableOperation(tableName, operation, tables)
    }
  }
}

function applyAlterTableOperation(
  tableName: string,
  operation: string,
  tables: Map<string, MutableExpectedTable>,
) {
  const addColumnMatch = operation.match(/^add\s+column\s+(?<ifNotExists>if\s+not\s+exists\s+)?(?<definition>[\s\S]+)$/i)
  if (addColumnMatch?.groups?.definition) {
    const column = parseColumnDefinition(addColumnMatch.groups.definition, new Set(), tableName)
    if (column) {
      const table = ensureExpectedTable(tables, tableName)
      if (addColumnMatch.groups.ifNotExists && table.columns.some((existing) => existing.columnName === column.columnName)) {
        return
      }

      upsertColumn(table, column)
      for (const columnConstraint of parseColumnConstraints(tableName, addColumnMatch.groups.definition, column.columnName)) {
        upsertConstraint(table, columnConstraint)
      }
    }
    return
  }

  const dropColumnMatch = operation.match(/^drop\s+column\s+(?:if\s+exists\s+)?(?<column>[a-zA-Z0-9_".]+)$/i)
  if (dropColumnMatch?.groups?.column) {
    const columnName = normalizeObjectName(dropColumnMatch.groups.column)
    const table = tables.get(tableName)
    if (table && columnName) {
      table.columns = table.columns.filter((column) => column.columnName !== columnName)
    }
    return
  }

  const renameColumnMatch = operation.match(/^rename\s+column\s+(?<from>[a-zA-Z0-9_".]+)\s+to\s+(?<to>[a-zA-Z0-9_".]+)$/i)
  if (renameColumnMatch?.groups?.from && renameColumnMatch.groups.to) {
    const fromColumnName = normalizeObjectName(renameColumnMatch.groups.from)
    const toColumnName = normalizeObjectName(renameColumnMatch.groups.to)
    const table = tables.get(tableName)
    const column = table?.columns.find((item) => item.columnName === fromColumnName)
    if (table && column && toColumnName) {
      column.columnName = toColumnName
      table.constraints = table.constraints.map((constraint) => ({
        ...constraint,
        definition: renameConstraintLocalReferences(constraint.definition, fromColumnName, toColumnName),
      }))
      table.columns = table.columns.sort((left, right) => left.columnName.localeCompare(right.columnName))
    }
    return
  }

  const addConstraintMatch = operation.match(/^add\s+constraint\s+(?<name>"[^"]+"|[a-zA-Z0-9_]+)\s+(?<definition>[\s\S]+)$/i)
  if (addConstraintMatch?.groups?.name && addConstraintMatch.groups.definition) {
    const constraint = parseNamedConstraint(
      tableName,
      addConstraintMatch.groups.name,
      addConstraintMatch.groups.definition,
    )
    if (constraint) upsertConstraint(ensureExpectedTable(tables, tableName), constraint)
    return
  }

  const dropConstraintMatch = operation.match(/^drop\s+constraint\s+(?:if\s+exists\s+)?(?<name>"[^"]+"|[a-zA-Z0-9_]+)$/i)
  if (dropConstraintMatch?.groups?.name) {
    const constraintName = normalizeObjectName(dropConstraintMatch.groups.name)
    const table = tables.get(tableName)
    if (table && constraintName) {
      table.constraints = table.constraints.filter((constraint) => constraint.constraintName !== constraintName)
    }
    return
  }

  const validateConstraintMatch = operation.match(
    /^validate\s+constraint\s+(?<name>"[^"]+"|[a-zA-Z0-9_]+)$/i,
  )
  if (validateConstraintMatch?.groups?.name) {
    const constraintName = normalizeObjectName(validateConstraintMatch.groups.name)
    const constraint = tables.get(tableName)?.constraints.find(
      (candidate) => candidate.constraintName === constraintName,
    )
    if (constraint) {
      constraint.definition = constraint.definition.replace(/\s+not\s+valid\s*$/i, '').trim()
    }
    return
  }

  const setNotNullMatch = operation.match(/^alter\s+column\s+(?<column>[a-zA-Z0-9_".]+)\s+set\s+not\s+null$/i)
  if (setNotNullMatch?.groups?.column) {
    patchColumn(tables, tableName, setNotNullMatch.groups.column, { nullable: false })
    return
  }

  const dropNotNullMatch = operation.match(/^alter\s+column\s+(?<column>[a-zA-Z0-9_".]+)\s+drop\s+not\s+null$/i)
  if (dropNotNullMatch?.groups?.column) {
    patchColumn(tables, tableName, dropNotNullMatch.groups.column, { nullable: true })
    return
  }

  const setDefaultMatch = operation.match(/^alter\s+column\s+(?<column>[a-zA-Z0-9_".]+)\s+set\s+default\s+(?<default>[\s\S]+)$/i)
  if (setDefaultMatch?.groups?.column) {
    patchColumn(tables, tableName, setDefaultMatch.groups.column, {
      defaultExpression: setDefaultMatch.groups.default?.trim() || null,
    })
    return
  }

  const dropDefaultMatch = operation.match(/^alter\s+column\s+(?<column>[a-zA-Z0-9_".]+)\s+drop\s+default$/i)
  if (dropDefaultMatch?.groups?.column) {
    patchColumn(tables, tableName, dropDefaultMatch.groups.column, { defaultExpression: null })
    return
  }

  const typeMatch = operation.match(/^alter\s+column\s+(?<column>[a-zA-Z0-9_".]+)\s+type\s+(?<type>[\s\S]+?)(?:\s+using\s+[\s\S]+)?$/i)
  if (typeMatch?.groups?.column && typeMatch.groups.type) {
    patchColumn(tables, tableName, typeMatch.groups.column, {
      dataType: normalizePostgresType(typeMatch.groups.type),
    })
  }
}

function applyIndexStatements(sql: string, tables: Map<string, MutableExpectedTable>) {
  const indexPattern = /(?<!['"])\b(?:(drop)\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?<dropIndex>[a-zA-Z0-9_".]+)\s*;|create\s+(?<unique>unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?<index>"[^"]+"|[a-zA-Z0-9_]+)\s+on\s+(?<table>[a-zA-Z0-9_".]+)\s*(?<body>(?:using\b|\()[\s\S]*?);)/gi
  let match: RegExpExecArray | null

  while ((match = indexPattern.exec(sql)) !== null) {
    if (match[1]) {
      const indexName = normalizeObjectName(match.groups?.dropIndex)
      if (!indexName) continue
      for (const table of tables.values()) {
        table.indexes = table.indexes.filter((index) => index.indexName !== indexName)
      }
      continue
    }

    const tableName = normalizeObjectName(match.groups?.table)
    const indexName = normalizeObjectName(match.groups?.index)
    if (!tableName || !indexName) continue

    const table = ensureExpectedTable(tables, tableName)
    const normalizedDefinition = normalizeIndexDefinition({
      indexName,
      tableName,
      unique: Boolean(match.groups?.unique),
      body: match.groups?.body ?? '',
    })
    upsertIndex(table, {
      indexName,
      definition: applyLaterColumnRenamesToIndex(
        sql,
        match.index + match[0].length,
        tableName,
        normalizedDefinition,
      ),
    })
  }
}

function applyLaterColumnRenamesToIndex(sql: string, start: number, tableName: string, definition: string) {
  const onTableMatch = definition.match(/\s+on\s+public\.[^\s]+\s+/i)
  if (!onTableMatch || onTableMatch.index === undefined) return definition

  let body = definition.slice(onTableMatch.index + onTableMatch[0].length)
  const alterTablePattern = /alter\s+table\s+(?:if\s+exists\s+)?(?<table>[a-zA-Z0-9_".]+)\s+(?<body>[\s\S]*?);/gi
  alterTablePattern.lastIndex = start
  let alterMatch: RegExpExecArray | null

  while ((alterMatch = alterTablePattern.exec(sql)) !== null) {
    if (normalizeObjectName(alterMatch.groups?.table) !== tableName) continue
    for (const operation of splitTopLevelComma(alterMatch.groups?.body ?? '')) {
      const rename = operation.match(/^rename\s+column\s+(?<from>[a-zA-Z0-9_".]+)\s+to\s+(?<to>[a-zA-Z0-9_".]+)$/i)
      const fromColumnName = normalizeObjectName(rename?.groups?.from)
      const toColumnName = normalizeObjectName(rename?.groups?.to)
      if (!fromColumnName || !toColumnName) continue
      body = replaceLocalIndexIdentifier(body, fromColumnName, toColumnName)
    }
  }

  return `${definition.slice(0, onTableMatch.index + onTableMatch[0].length)}${body}`
}

function applyAlterIndexStatements(sql: string, tables: Map<string, MutableExpectedTable>) {
  const renamePattern = /alter\s+index\s+(?:if\s+exists\s+)?(?<from>[a-zA-Z0-9_".]+)\s+rename\s+to\s+(?<to>[a-zA-Z0-9_".]+)\s*;/gi
  let match: RegExpExecArray | null

  while ((match = renamePattern.exec(sql)) !== null) {
    const fromIndexName = normalizeObjectName(match.groups?.from)
    const toIndexName = normalizeObjectName(match.groups?.to)
    if (!fromIndexName || !toIndexName) continue

    for (const table of tables.values()) {
      const index = table.indexes.find((candidate) => candidate.indexName === fromIndexName)
      if (!index) continue
      index.indexName = toIndexName
      index.definition = renameIndexObjectInDefinition(index.definition, toIndexName)
      table.indexes = table.indexes.sort((left, right) => left.indexName.localeCompare(right.indexName))
      break
    }
  }
}

function renameIndexObjectInDefinition(definition: string, indexName: string) {
  return definition.replace(
    /^(CREATE\s+(?:UNIQUE\s+)?INDEX\s+)(?:"[^"]+"|[a-zA-Z0-9_]+)/i,
    `$1${indexName}`,
  )
}

function applyDynamicallyDiscoveredForeignKeyDrops(sql: string, tables: Map<string, MutableExpectedTable>) {
  const doBlockPattern = /\bdo\s+\$([a-zA-Z0-9_]*)\$([\s\S]*?)\$\1\$\s*;/gi
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = doBlockPattern.exec(sql)) !== null) {
    const body = blockMatch[2] ?? ''
    if (!/\bc\.contype\s*=\s*'f'/i.test(body)) continue
    if (!/\bexecute\s+format\s*\(\s*'alter\s+table\s+[^']+\s+drop\s+constraint\s+%i'/i.test(body)) continue

    const tableName = normalizeObjectName(
      body.match(/\bc\.conrelid\s*=\s*'(?<table>[a-zA-Z0-9_".]+)'\s*::\s*regclass/i)?.groups?.table,
    )
    const columnName = normalizeObjectName(
      body.match(/\ba\.attname\s*=\s*'(?<column>[a-zA-Z0-9_"]+)'/i)?.groups?.column,
    )
    const table = tableName ? tables.get(tableName) : null
    if (!table || !columnName) continue

    const replacementConstraintNames = findLaterForeignKeyConstraintNames(
      sql.slice(blockMatch.index + blockMatch[0].length),
      tableName,
      columnName,
    )
    table.constraints = table.constraints.filter((constraint) => (
      constraint.constraintType !== 'foreign_key'
      || !constraintDependsOnLocalColumn(constraint, columnName)
      || replacementConstraintNames.has(constraint.constraintName)
    ))
  }
}

function findLaterForeignKeyConstraintNames(sql: string, tableName: string, columnName: string) {
  const names = new Set<string>()
  const alterTablePattern = /alter\s+table\s+(?:if\s+exists\s+)?(?<table>[a-zA-Z0-9_".]+)\s+(?<body>[\s\S]*?);/gi
  let match: RegExpExecArray | null

  while ((match = alterTablePattern.exec(sql)) !== null) {
    if (normalizeObjectName(match.groups?.table) !== tableName) continue
    for (const operation of splitTopLevelComma(match.groups?.body ?? '')) {
      const add = operation.match(/^add\s+constraint\s+(?<name>"[^"]+"|[a-zA-Z0-9_]+)\s+(?<definition>[\s\S]+)$/i)
      if (!add?.groups?.name || !add.groups.definition) continue
      const constraint = parseNamedConstraint(tableName, add.groups.name, add.groups.definition)
      if (constraint?.constraintType === 'foreign_key' && constraintDependsOnLocalColumn(constraint, columnName)) {
        names.add(constraint.constraintName)
      }
    }
  }

  return names
}

function applyDroppedColumnDependencyCleanup(sql: string, tables: Map<string, MutableExpectedTable>) {
  const droppedColumns = new Map<string, Set<string>>()
  const alterTablePattern = /alter\s+table\s+(?:if\s+exists\s+)?(?<table>[a-zA-Z0-9_".]+)\s+(?<body>[\s\S]*?);/gi
  let alterMatch: RegExpExecArray | null

  while ((alterMatch = alterTablePattern.exec(sql)) !== null) {
    const tableName = normalizeObjectName(alterMatch.groups?.table)
    if (!tableName) continue

    for (const operation of splitTopLevelComma(alterMatch.groups?.body ?? '')) {
      const dropColumnMatch = operation.match(/^drop\s+column\s+(?:if\s+exists\s+)?(?<column>[a-zA-Z0-9_".]+)$/i)
      const columnName = normalizeObjectName(dropColumnMatch?.groups?.column)
      if (!columnName) continue

      const tableColumns = droppedColumns.get(tableName) ?? new Set<string>()
      tableColumns.add(columnName)
      droppedColumns.set(tableName, tableColumns)
    }
  }

  for (const [tableName, columnNames] of droppedColumns) {
    const table = tables.get(tableName)
    if (!table) continue

    for (const columnName of columnNames) {
      if (table.columns.some((column) => column.columnName === columnName)) continue

      table.constraints = table.constraints.filter(
        (constraint) => !constraintDependsOnLocalColumn(constraint, columnName),
      )
      table.indexes = table.indexes.filter(
        (index) => !indexDependsOnColumn(index, columnName),
      )
    }
  }
}

function constraintDependsOnLocalColumn(constraint: SchemaDriftConstraint, columnName: string) {
  if (constraint.constraintType === 'check_constraint') {
    return sqlExpressionReferencesIdentifier(constraint.definition, columnName)
  }

  const localColumnsMatch = constraint.definition.match(
    /^(?:primary\s+key|unique|foreign\s+key)\s*\((?<columns>[\s\S]*?)\)/i,
  )
  if (!localColumnsMatch?.groups?.columns) return false

  return splitTopLevelComma(localColumnsMatch.groups.columns).some((rawColumn) => {
    const localColumnName = normalizeObjectName(rawColumn.split(/\s+/)[0])
    return localColumnName === columnName
  })
}

function indexDependsOnColumn(index: SchemaDriftIndex, columnName: string) {
  const indexBody = index.definition.match(/\bon\s+[a-zA-Z0-9_".]+\s+(?<body>[\s\S]+)$/i)?.groups?.body
  return indexBody ? sqlExpressionReferencesIdentifier(indexBody, columnName) : false
}

function sqlExpressionReferencesIdentifier(expression: string, identifier: string) {
  const withoutStringLiterals = expression.replace(/'(?:''|[^'])*'/g, ' ')
  return new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(identifier)}([^a-zA-Z0-9_]|$)`, 'i')
    .test(withoutStringLiterals)
}

function applyRlsStatements(sql: string, tables: Map<string, MutableExpectedTable>) {
  const enablePattern = /alter\s+table\s+(?:if\s+exists\s+)?(?<table>[a-zA-Z0-9_".]+)\s+enable\s+row\s+level\s+security\s*;/gi
  let enableMatch: RegExpExecArray | null
  while ((enableMatch = enablePattern.exec(sql)) !== null) {
    const tableName = normalizeObjectName(enableMatch.groups?.table)
    if (!tableName) continue
    const table = ensureExpectedTable(tables, tableName)
    table.rls = {
      enabled: true,
      forced: table.rls?.forced ?? false,
      policies: table.rls?.policies ?? [],
    }
  }

  const forcePattern = /alter\s+table\s+(?:if\s+exists\s+)?(?<table>[a-zA-Z0-9_".]+)\s+force\s+row\s+level\s+security\s*;/gi
  let forceMatch: RegExpExecArray | null
  while ((forceMatch = forcePattern.exec(sql)) !== null) {
    const tableName = normalizeObjectName(forceMatch.groups?.table)
    if (!tableName) continue
    const table = ensureExpectedTable(tables, tableName)
    table.rls = {
      enabled: table.rls?.enabled ?? true,
      forced: true,
      policies: table.rls?.policies ?? [],
    }
  }
}

function applyPolicyStatements(sql: string, tables: Map<string, MutableExpectedTable>) {
  const policyPattern = /\b(?:(drop)\s+policy\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+on\s+([a-zA-Z0-9_".]+)\s*;|(create)\s+policy\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+on\s+([a-zA-Z0-9_".]+)([\s\S]*?);)/gi
  let policyMatch: RegExpExecArray | null

  while ((policyMatch = policyPattern.exec(sql)) !== null) {
    if (policyMatch[1]) {
      const policyName = normalizeObjectName(policyMatch[2] ?? policyMatch[3])
      const tableName = normalizeObjectName(policyMatch[4])
      const table = tableName ? tables.get(tableName) : null
      if (table?.rls && policyName) {
        table.rls.policies = table.rls.policies.filter((existing) => existing.policyName !== policyName)
      }
      continue
    }

    const tableName = normalizeObjectName(policyMatch[8])
    const policyName = normalizeObjectName(policyMatch[6] ?? policyMatch[7])
    const body = policyMatch[9] ?? ''
    if (!tableName || !policyName) continue

    const policy: SchemaDriftPolicy = {
      policyName,
      command: body.match(/\bfor\s+(?<command>all|select|insert|update|delete)\b/i)?.groups?.command?.toUpperCase() ?? null,
      usingExpression: extractPolicyExpression(body, 'using'),
      withCheckExpression: extractPolicyExpression(body, 'with\\s+check'),
    }

    const table = ensureExpectedTable(tables, tableName)
    table.rls = table.rls ?? { enabled: false, forced: false, policies: [] }
    table.rls.policies = [
      ...table.rls.policies.filter((existing) => existing.policyName !== policy.policyName),
      policy,
    ].sort((left, right) => left.policyName.localeCompare(right.policyName))
  }
}

function applyPolicyTemplateRuntimePublicationRollbackStatus(sql: string, tables: Map<string, MutableExpectedTable>) {
  const tableName = 'policy_template_entity_runtime_publications'
  const legacyConstraintName = `${tableName}_runtime_publication_status_check`
  const finalConstraintName = `${tableName}_status_check`
  const isRollbackStatusMigration = new RegExp(`conrelid\\s*=\\s*'public\\.${tableName}'::regclass`, 'i').test(sql)
    && new RegExp(`add\\s+constraint\\s+${finalConstraintName}`, 'i').test(sql)
    && /runtime_publication_status\s+in\s*\(\s*'runtime_stable_published'\s*,\s*'runtime_rolled_back'\s*\)/i.test(sql)
  if (!isRollbackStatusMigration) return

  const table = tables.get(tableName)
  if (!table) return

  table.constraints = table.constraints.filter((constraint) => constraint.constraintName !== legacyConstraintName)
  upsertConstraint(table, {
    constraintName: finalConstraintName,
    constraintType: 'check_constraint',
    definition: "CHECK (runtime_publication_status IN ('runtime_stable_published', 'runtime_rolled_back'))",
  })
}

function applyAdvisorPrivateMembershipPolicyRewrite(sql: string, tables: Map<string, MutableExpectedTable>) {
  const isAdvisorCloseout = /create\s+or\s+replace\s+function\s+workbuddy_private\.is_active_company_member\b/i.test(sql)
    && /regexp_replace\(using_expr,\s*'public\\\.is_project_member/i.test(sql)
    && /execute\s+format\('drop\s+policy\s+if\s+exists/i.test(sql)
  if (!isAdvisorCloseout) return

  const helperNames = [
    'is_active_company_member',
    'is_active_project_member',
    'is_project_member',
    'is_project_owner',
    'has_project_edit_permission',
  ]

  for (const table of tables.values()) {
    if (!table.rls) continue
    table.rls.policies = table.rls.policies.map((policy) => ({
      ...policy,
      usingExpression: rewriteMembershipHelpersToPrivate(policy.usingExpression, helperNames),
      withCheckExpression: rewriteMembershipHelpersToPrivate(policy.withCheckExpression, helperNames),
    }))
  }
}

function rewriteMembershipHelpersToPrivate(expression: string | null, helperNames: string[]) {
  if (!expression) return expression

  return helperNames.reduce(
    (rewritten, helperName) => rewritten.replace(
      new RegExp(`(?<![a-zA-Z0-9_.])(?:public\\.)?${escapeRegExp(helperName)}\\s*\\(`, 'gi'),
      `workbuddy_private.${helperName}(`,
    ),
    expression,
  )
}

function applyDynamicBackendRuntimeRlsLoops(sql: string, tables: Map<string, MutableExpectedTable>) {
  const loopPattern = /\bforeach\s+(?<iterator>[a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+array\s+array\s*\[(?<items>[\s\S]*?)\]\s+loop(?<body>[\s\S]*?)end\s+loop/gi
  let loopMatch: RegExpExecArray | null

  while ((loopMatch = loopPattern.exec(sql)) !== null) {
    const iterator = loopMatch.groups?.iterator
    const items = loopMatch.groups?.items ?? ''
    const body = loopMatch.groups?.body ?? ''
    if (!iterator) continue

    const iteratorPattern = escapeRegExp(iterator)
    const hasEnableRls = new RegExp(`alter\\s+table\\s+public\\.%i\\s+enable\\s+row\\s+level\\s+security`, 'i').test(body)
    const hasForceRls = new RegExp(`alter\\s+table\\s+public\\.%i\\s+force\\s+row\\s+level\\s+security`, 'i').test(body)
    const hasBackendPolicyName = new RegExp(`${iteratorPattern}\\s*\\|\\|\\s*'_backend_runtime_policy'`, 'i').test(body)
    const hasBackendPolicyCreate = /\bcreate\s+policy\s+%i\s+on\s+public\.%i\b[\s\S]*?\bfor\s+all\b[\s\S]*?\bto\s+workbuddy_runtime\b/i.test(body)
      && /\bpg_has_role\s*\(\s*current_user\s*,\s*'workbuddy_runtime'\s*,\s*'member'\s*\)/i.test(body)

    if (!hasEnableRls || !hasForceRls || !hasBackendPolicyName || !hasBackendPolicyCreate) continue

    for (const tableName of parseSqlStringLiterals(items)) {
      const table = ensureExpectedTable(tables, tableName)
      const existingPolicies = table.rls?.policies ?? []
      const backendPolicy: SchemaDriftPolicy = {
        policyName: `${tableName}_backend_runtime_policy`,
        command: 'ALL',
        usingExpression: "current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member')",
        withCheckExpression: "current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member')",
      }
      table.rls = {
        enabled: true,
        forced: true,
        policies: [
          ...existingPolicies.filter((policy) => policy.policyName !== backendPolicy.policyName),
          backendPolicy,
        ].sort((left, right) => left.policyName.localeCompare(right.policyName)),
      }
    }
  }
}

function applyProjectHealthHistoryAdvisorSecurityCloseout(sql: string, tables: Map<string, MutableExpectedTable>) {
  if (!/to_regclass\s*\(\s*'public\.project_health_history'\s*\)/i.test(sql)) return
  if (!/\bdrop\s+policy\s+if\s+exists\s+health_history_insert\s+on\s+public\.project_health_history\b/i.test(sql)) return
  if (!/\bcreate\s+policy\s+project_health_history_auth_project_member_read_policy\b/i.test(sql)) return
  if (!/\bcreate\s+policy\s+project_health_history_backend_runtime_policy\b/i.test(sql)) return

  const table = ensureExpectedTable(tables, 'project_health_history')
  const removedPolicyNames = new Set([
    'health_history_select',
    'health_history_insert',
    'health_history_update',
    'project_health_history_auth_project_member_read_policy',
    'project_health_history_backend_runtime_policy',
  ])
  const existingPolicies = (table.rls?.policies ?? [])
    .filter((policy) => !removedPolicyNames.has(policy.policyName))
  const backendPredicate = "current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member')"

  table.rls = {
    enabled: true,
    forced: true,
    policies: [
      ...existingPolicies,
      {
        policyName: 'project_health_history_auth_project_member_read_policy',
        command: 'SELECT',
        usingExpression: 'auth.uid() IS NOT NULL AND is_active_project_member(project_id, NULL::TEXT[])',
        withCheckExpression: null,
      },
      {
        policyName: 'project_health_history_backend_runtime_policy',
        command: 'ALL',
        usingExpression: backendPredicate,
        withCheckExpression: backendPredicate,
      },
    ].sort((left, right) => left.policyName.localeCompare(right.policyName)),
  }
}

function parseSqlStringLiterals(value: string) {
  const values: string[] = []
  const stringPattern = /'((?:''|[^'])*)'/g
  let match: RegExpExecArray | null

  while ((match = stringPattern.exec(value)) !== null) {
    const text = match[1]?.replace(/''/g, "'").trim()
    if (text) values.push(text)
  }

  return values
}

function extractPolicyExpression(body: string, keywordPattern: string) {
  const pattern = new RegExp(`${keywordPattern}\\s*\\((?<expression>[\\s\\S]*?)\\)\\s*(?:with\\s+check|$)`, 'i')
  return body.match(pattern)?.groups?.expression?.trim() ?? null
}

function parseTableConstraintDefinition(
  tableName: string,
  rawDefinition: string,
): SchemaDriftConstraint | null {
  const definition = rawDefinition.trim().replace(/,$/, '').trim()
  const mysqlUniqueKeyMatch = definition.match(/^unique\s+key\s+(?<name>"[^"]+"|[a-zA-Z0-9_]+)\s*\((?<columns>[^)]+)\)$/i)
  if (mysqlUniqueKeyMatch?.groups?.name && mysqlUniqueKeyMatch.groups.columns) {
    return {
      constraintName: normalizeObjectName(mysqlUniqueKeyMatch.groups.name) ?? defaultConstraintName(tableName, 'unique_constraint', definition),
      constraintType: 'unique_constraint',
      definition: normalizeConstraintDefinition(`UNIQUE (${mysqlUniqueKeyMatch.groups.columns})`),
    }
  }

  const namedMatch = definition.match(/^constraint\s+(?<name>"[^"]+"|[a-zA-Z0-9_]+)\s+(?<body>[\s\S]+)$/i)
  if (namedMatch?.groups?.name && namedMatch.groups.body) {
    return parseNamedConstraint(tableName, namedMatch.groups.name, namedMatch.groups.body)
  }

  if (!/^(primary\s+key|foreign\s+key|unique|check)\b/i.test(definition)) {
    return null
  }

  const constraintType = classifyConstraintType(definition)
  if (!constraintType) return null

  return {
    constraintName: defaultConstraintName(tableName, constraintType, definition),
    constraintType,
    definition: normalizeConstraintDefinition(definition),
  }
}

function parseNamedConstraint(
  tableName: string,
  rawName: string,
  rawDefinition: string,
): SchemaDriftConstraint | null {
  const constraintName = normalizeObjectName(rawName)
  const constraintType = classifyConstraintType(rawDefinition)
  if (!constraintName || !constraintType) return null

  return {
    constraintName,
    constraintType,
    definition: normalizeConstraintDefinition(rawDefinition),
  }
}

function parseColumnConstraints(
  tableName: string,
  rawDefinition: string,
  columnName: string,
): SchemaDriftConstraint[] {
  const definition = rawDefinition.trim().replace(/,$/, '').trim()
  const constraints: SchemaDriftConstraint[] = []

  if (/\bprimary\s+key\b/i.test(definition)) {
    constraints.push({
      constraintName: `${tableName}_pkey`,
      constraintType: 'primary_key',
      definition: `PRIMARY KEY (${columnName})`,
    })
  }

  if (/\bunique\b/i.test(definition)) {
    constraints.push({
      constraintName: `${tableName}_${columnName}_key`,
      constraintType: 'unique_constraint',
      definition: `UNIQUE (${columnName})`,
    })
  }

  const referenceMatch = definition.match(/\breferences\s+(?<target>[a-zA-Z0-9_".]+)\s*\((?<targetColumns>[^)]+)\)(?<tail>[\s\S]*?)$/i)
  if (referenceMatch?.groups?.target && referenceMatch.groups.targetColumns) {
    constraints.push({
      constraintName: `${tableName}_${columnName}_fkey`,
      constraintType: 'foreign_key',
      definition: normalizeConstraintDefinition(
        `FOREIGN KEY (${columnName}) REFERENCES ${referenceMatch.groups.target}(${referenceMatch.groups.targetColumns})${referenceMatch.groups.tail ?? ''}`,
      ),
    })
  }

  const checkMatch = definition.match(/\bcheck\s*\((?<expression>[\s\S]+)\)\s*$/i)
  if (checkMatch?.groups?.expression) {
    constraints.push({
      constraintName: `${tableName}_${columnName}_check`,
      constraintType: 'check_constraint',
      definition: normalizeConstraintDefinition(`CHECK (${checkMatch.groups.expression})`),
    })
  }

  return constraints
}

function parseColumnDefinition(
  rawDefinition: string,
  tablePrimaryKeys: Set<string> = new Set(),
  tableName?: string,
): SchemaDriftExpectedColumn | null {
  const definition = rawDefinition.trim().replace(/,$/, '').trim()
  if (!definition || /^(constraint|primary\s+key|foreign\s+key|unique|check|exclude|index|key)\b/i.test(definition)) {
    return null
  }

  const nameMatch = definition.match(/^(?<name>"[^"]+"|[a-zA-Z0-9_]+)\s+(?<rest>[\s\S]+)$/)
  const columnName = normalizeObjectName(nameMatch?.groups?.name)
  const rest = nameMatch?.groups?.rest?.trim()
  if (!columnName || !rest) return null

  const typeMatch = rest.match(/^(?<type>.+?)(?:\s+(?:collate|constraint|not\s+null|null|default|generated|primary\s+key|references|unique|check)\b|$)/i)
  const rawDataType = typeMatch?.groups?.type?.trim() ?? rest
  const columnClauses = rest.slice(rawDataType.length)
  const nullabilityClauses = stripCheckConstraintClauses(columnClauses)
  const dataType = normalizePostgresType(rawDataType)
  const serialDefaultExpression = tableName ? serialColumnDefaultExpression(rawDataType, tableName, columnName) : null
  const defaultExpression = extractColumnDefault(columnClauses) ?? serialDefaultExpression
  const nullable = !/\bnot\s+null\b/i.test(nullabilityClauses)
    && !/\bprimary\s+key\b/i.test(nullabilityClauses)
    && !/\bgenerated\s+(?:always|by\s+default)\s+as\s+identity\b/i.test(columnClauses)
    && !tablePrimaryKeys.has(columnName)

  return {
    columnName,
    dataType,
    nullable,
    defaultExpression,
  }
}

function serialColumnDefaultExpression(rawDataType: string, tableName: string, columnName: string) {
  const normalized = rawDataType.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!['serial', 'serial4', 'bigserial', 'serial8', 'smallserial', 'serial2'].includes(normalized)) {
    return null
  }

  return `nextval('${tableName}_${columnName}_seq'::regclass)`
}

function extractColumnDefault(definitionRest: string) {
  const defaultMatch = definitionRest.match(/\bdefault\s+(?<default>[\s\S]+?)(?:\s+(?:constraint|not\s+null|null|primary\s+key|references|unique|check)\b|$)/i)
  return defaultMatch?.groups?.default?.trim() ?? null
}

function extractTablePrimaryKeys(body: string) {
  const keys = new Set<string>()
  for (const segment of splitTopLevelComma(body)) {
    const match = segment.match(/^(?:constraint\s+(?:"[^"]+"|[a-zA-Z0-9_]+)\s+)?primary\s+key\s*\((?<columns>[^)]+)\)/i)
    if (!match?.groups?.columns) continue
    for (const column of match.groups.columns.split(',')) {
      const columnName = normalizeObjectName(column)
      if (columnName) keys.add(columnName)
    }
  }
  return keys
}

function splitTopLevelComma(value: string) {
  const segments: string[] = []
  let depth = 0
  let start = 0
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]

    if (inSingleQuote) {
      if (character === "'" && value[index + 1] === "'") {
        index += 1
        continue
      }
      if (character === "'") inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      if (character === '"' && value[index + 1] === '"') {
        index += 1
        continue
      }
      if (character === '"') inDoubleQuote = false
      continue
    }

    if (character === "'") {
      inSingleQuote = true
      continue
    }
    if (character === '"') {
      inDoubleQuote = true
      continue
    }
    if (character === '(') depth += 1
    if (character === ')') depth = Math.max(0, depth - 1)
    if (character === ',' && depth === 0) {
      segments.push(value.slice(start, index).trim())
      start = index + 1
    }
  }

  segments.push(value.slice(start).trim())
  return segments.filter(Boolean)
}

function ensureExpectedTable(tables: Map<string, MutableExpectedTable>, tableName: string) {
  const existing = tables.get(tableName)
  if (existing) return existing

  const created: MutableExpectedTable = {
    tableName,
    columns: [],
    constraints: [],
    indexes: [],
    rls: { enabled: false, forced: false, policies: [] },
  }
  tables.set(tableName, created)
  return created
}

function upsertColumn(table: MutableExpectedTable, column: SchemaDriftExpectedColumn) {
  table.columns = [
    ...table.columns.filter((existing) => existing.columnName !== column.columnName),
    column,
  ].sort((left, right) => left.columnName.localeCompare(right.columnName))
}

function upsertConstraint(table: MutableExpectedTable, constraint: SchemaDriftConstraint) {
  table.constraints = [
    ...table.constraints.filter((existing) => existing.constraintName !== constraint.constraintName),
    constraint,
  ].sort((left, right) => left.constraintName.localeCompare(right.constraintName))
}

function upsertIndex(table: MutableExpectedTable, index: SchemaDriftIndex) {
  table.indexes = [
    ...table.indexes.filter((existing) => existing.indexName !== index.indexName),
    index,
  ].sort((left, right) => left.indexName.localeCompare(right.indexName))
}

function patchColumn(
  tables: Map<string, MutableExpectedTable>,
  rawTableName: string | undefined,
  rawColumnName: string | undefined,
  patch: Partial<SchemaDriftExpectedColumn>,
) {
  const tableName = normalizeObjectName(rawTableName)
  const columnName = normalizeObjectName(rawColumnName)
  if (!tableName || !columnName) return

  const table = tables.get(tableName)
  const column = table?.columns.find((item) => item.columnName === columnName)
  if (!column) return

  Object.assign(column, patch)
}

function normalizeObjectName(value: string | undefined) {
  const raw = value?.trim()
  if (!raw) return null

  const withoutSchema = raw.split('.').pop() ?? raw
  return withoutSchema.replace(/^"|"$/g, '').trim()
}

function normalizePostgresType(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase()
  const withoutLength = normalized.replace(/\(\s*\d+(?:\s*,\s*\d+)?\s*\)/g, '')
  const aliases: Record<string, string> = {
    bool: 'boolean',
    int: 'integer',
    int4: 'integer',
    int8: 'bigint',
    serial: 'integer',
    serial4: 'integer',
    bigserial: 'bigint',
    serial8: 'bigint',
    smallserial: 'smallint',
    serial2: 'smallint',
    varchar: 'character varying',
    timestamptz: 'timestamp with time zone',
    timestamp: 'timestamp without time zone',
  }

  return aliases[withoutLength] ?? withoutLength
}

function classifyConstraintType(definition: string): SchemaDriftConstraint['constraintType'] | null {
  if (/^primary\s+key\b/i.test(definition.trim())) return 'primary_key'
  if (/^foreign\s+key\b/i.test(definition.trim())) return 'foreign_key'
  if (/^unique\b/i.test(definition.trim())) return 'unique_constraint'
  if (/^check\b/i.test(definition.trim())) return 'check_constraint'
  return null
}

function defaultConstraintName(
  tableName: string,
  constraintType: SchemaDriftConstraint['constraintType'],
  definition: string,
) {
  const columnsMatch = definition.match(/\((?<columns>[^)]+)\)/)
  const firstColumn = normalizeObjectName(columnsMatch?.groups?.columns?.split(',')[0])

  if (constraintType === 'primary_key') return `${tableName}_pkey`
  if (constraintType === 'foreign_key' && firstColumn) return `${tableName}_${firstColumn}_fkey`
  if (constraintType === 'unique_constraint' && firstColumn) return `${tableName}_${firstColumn}_key`
  if (constraintType === 'check_constraint' && firstColumn) return `${tableName}_${firstColumn}_check`

  return `${tableName}_${constraintType}`
}

function normalizeConstraintDefinition(definition: string) {
  return definition
    .trim()
    .replace(/,$/, '')
    .replace(/\s+/g, ' ')
    .replace(/\bpublic\./gi, '')
    .replace(/\s+\)/g, ')')
    .replace(/\(\s+/g, '(')
    .replace(/\s*,\s*/g, ', ')
}

function normalizeIndexDefinition(input: {
  indexName: string
  tableName: string
  unique: boolean
  body: string
}) {
  const body = input.body
    .trim()
    .replace(/,$/, '')
    .replace(/\s+/g, ' ')
    .replace(/\bpublic\./gi, '')
    .replace(/\s+\)/g, ')')
    .replace(/\(\s+/g, '(')

  return `CREATE ${input.unique ? 'UNIQUE ' : ''}INDEX ${input.indexName} ON public.${input.tableName} ${body}`.trim()
}

function stripCheckConstraintClauses(value: string) {
  let result = ''
  let cursor = 0
  const checkPattern = /\bcheck\s*\(/gi
  let match: RegExpExecArray | null

  while ((match = checkPattern.exec(value)) !== null) {
    const openParen = value.indexOf('(', match.index)
    const closeParen = openParen === -1 ? -1 : findMatchingParenthesis(value, openParen)
    if (closeParen === -1) break
    result += value.slice(cursor, match.index)
    cursor = closeParen + 1
    checkPattern.lastIndex = cursor
  }

  return `${result}${value.slice(cursor)}`
}

function renameConstraintLocalReferences(value: string, from: string, to: string) {
  const referencesMatch = value.match(/\breferences\b/i)
  const localPart = referencesMatch?.index === undefined ? value : value.slice(0, referencesMatch.index)
  const referencedPart = referencesMatch?.index === undefined ? '' : value.slice(referencesMatch.index)
  return `${replaceSqlIdentifierOutsideSingleQuotes(localPart, from, to)}${referencedPart}`
}

function replaceSqlIdentifierOutsideSingleQuotes(value: string, from: string, to: string) {
  const identifierPattern = new RegExp(`(?<![a-zA-Z0-9_])"?${escapeRegExp(from)}"?(?![a-zA-Z0-9_])`, 'gi')
  return value.replace(/'(?:''|[^'])*'|([^']+)/gs, (segment, outsideQuotes: string | undefined) => (
    outsideQuotes === undefined ? segment : outsideQuotes.replace(identifierPattern, to)
  ))
}

function replaceLocalIndexIdentifier(value: string, from: string, to: string) {
  const tokenPattern = /'(?:''|[^'])*'|"(?:""|[^"])*"|[a-zA-Z_][a-zA-Z0-9_$]*|./gs
  const normalizedFrom = from.toLowerCase()

  return value.replace(tokenPattern, (token, offset: number) => {
    const identifier = token.startsWith('"')
      ? token.slice(1, -1).replace(/""/g, '"')
      : token
    if (identifier.toLowerCase() !== normalizedFrom || token.startsWith("'") || token === '') return token

    const before = value.slice(0, offset).replace(/\s+$/g, '')
    const after = value.slice(offset + token.length).replace(/^\s+/g, '')
    if (before.endsWith('.') || before.endsWith('::') || /\bcollate$/i.test(before) || after.startsWith('.') || after.startsWith('(')) {
      return token
    }

    return to
  })
}

function findMatchingParenthesis(value: string, openIndex: number) {
  let depth = 0
  let singleQuoted = false
  let doubleQuoted = false
  for (let index = openIndex; index < value.length; index += 1) {
    const character = value[index]
    const next = value[index + 1]
    if (singleQuoted) {
      if (character === "'" && next === "'") index += 1
      else if (character === "'") singleQuoted = false
      continue
    }
    if (doubleQuoted) {
      if (character === '"' && next === '"') index += 1
      else if (character === '"') doubleQuoted = false
      continue
    }
    if (character === "'") singleQuoted = true
    else if (character === '"') doubleQuoted = true
    else if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
