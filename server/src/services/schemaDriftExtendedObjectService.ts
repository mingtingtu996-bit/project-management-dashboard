import { buildExpectedSchemaFromMigrationSql } from './schemaDriftExpectedSchemaParser.js'

export type SchemaDriftTrigger = {
  key: string
  schemaName: string
  tableName: string
  triggerName: string
  functionName: string
  timing: string
  events: string[]
  orientation: string
  condition: string | null
}

export type SchemaDriftFunction = {
  key: string
  schemaName: string
  functionName: string
  identityArguments: string
  resultType: string
  language: string
  securityDefiner: boolean
  volatility: 'immutable' | 'stable' | 'volatile'
  body: string
}

export type SchemaDriftView = {
  key: string
  schemaName: string
  viewName: string
  materialized: boolean
  definition: string
  options?: string[]
}

export type SchemaDriftEnum = {
  key: string
  schemaName: string
  enumName: string
  labels: string[]
}

export type SchemaDriftExtension = {
  key: string
  extensionName: string
  schemaName: string | null
}

export type SchemaDriftGrantObjectType =
  | 'schema'
  | 'table'
  | 'sequence'
  | 'function'
  | 'default_table'
  | 'default_sequence'
  | 'default_function'

export type SchemaDriftGrant = {
  key: string
  objectType: SchemaDriftGrantObjectType
  schemaName: string
  objectName: string
  grantee: string
  privilege: string
  allowed: boolean
}

export type SchemaDriftExtendedCatalog = {
  triggers: SchemaDriftTrigger[]
  functions: SchemaDriftFunction[]
  views: SchemaDriftView[]
  enums: SchemaDriftEnum[]
  extensions: SchemaDriftExtension[]
  grants: SchemaDriftGrant[]
}

export type ExtendedSchemaDriftObjectType =
  | 'trigger'
  | 'function'
  | 'view'
  | 'enum'
  | 'extension'
  | 'grant'

export type ExtendedSchemaDriftType =
  | 'missing_actual_trigger'
  | 'unexpected_actual_trigger'
  | 'trigger_definition_mismatch'
  | 'missing_actual_function'
  | 'unexpected_actual_function'
  | 'function_definition_mismatch'
  | 'missing_actual_view'
  | 'unexpected_actual_view'
  | 'view_definition_mismatch'
  | 'missing_actual_enum'
  | 'unexpected_actual_enum'
  | 'enum_labels_mismatch'
  | 'missing_actual_extension'
  | 'extension_schema_mismatch'
  | 'missing_actual_grant'
  | 'forbidden_actual_grant'

export type BlockingExtendedSchemaDrift = {
  objectType: ExtendedSchemaDriftObjectType
  objectName: string
  driftType: ExtendedSchemaDriftType
  expected?: unknown
  actual?: unknown
}

export type ExtendedSchemaDriftResult = {
  status: 'pass' | 'fail'
  blockingDrift: BlockingExtendedSchemaDrift[]
}

type QualifiedName = {
  schemaName: string
  objectName: string
}

type GrantTargetContext = {
  tableNames: string[]
  sequenceNames: string[]
  functionKeys: string[]
}

const TABLE_PRIVILEGES = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] as const
const SEQUENCE_PRIVILEGES = ['usage', 'select', 'update'] as const
const FUNCTION_PRIVILEGES = ['execute'] as const
const SCHEMA_PRIVILEGES = ['usage', 'create'] as const

const TYPE_STARTERS = new Set([
  'bigint',
  'bigserial',
  'bit',
  'boolean',
  'bool',
  'bytea',
  'character',
  'cidr',
  'date',
  'decimal',
  'double',
  'inet',
  'int',
  'int2',
  'int4',
  'int8',
  'integer',
  'interval',
  'json',
  'jsonb',
  'macaddr',
  'money',
  'numeric',
  'oid',
  'real',
  'record',
  'regclass',
  'serial',
  'smallint',
  'text',
  'time',
  'timestamp',
  'trigger',
  'uuid',
  'varbit',
  'varchar',
  'void',
  'xml',
])

export function buildExpectedExtendedSchemaFromMigrationSql(sql: string): SchemaDriftExtendedCatalog {
  const statements = collectExecutableDdlStatements(sql)
  const triggers = new Map<string, SchemaDriftTrigger>()
  const functions = new Map<string, SchemaDriftFunction>()
  const views = new Map<string, SchemaDriftView>()
  const enums = new Map<string, SchemaDriftEnum>()
  const extensions = new Map<string, SchemaDriftExtension>()

  for (const statement of statements) {
    applyFunctionStatement(statement, functions)
    applyTriggerStatement(statement, triggers)
    applyDroppedTableStatement(statement, triggers)
    applyViewStatement(statement, views)
    applyEnumStatement(statement, enums)
    applyExtensionStatement(statement, extensions)
  }

  const expectedTables = buildExpectedSchemaFromMigrationSql(sql)
  const sequenceNames = buildExpectedSequenceNames(statements)
  const grantTargets: GrantTargetContext = {
    tableNames: [
      ...expectedTables.map((table) => `public.${table.tableName}`),
      ...Array.from(views.values()).map((view) => `${view.schemaName}.${view.viewName}`),
    ],
    sequenceNames,
    functionKeys: Array.from(functions.keys()),
  }
  const grants = new Map<string, SchemaDriftGrant>()
  for (const statement of statements) {
    applyGrantStatement(statement, grants, grantTargets)
    applyDroppedObjectGrantCleanup(statement, grants)
  }
  applyDynamicFunctionAclLoops(sql, grants, grantTargets)

  return {
    triggers: sortByKey(triggers.values()),
    functions: sortByKey(functions.values()),
    views: sortByKey(views.values()),
    enums: sortByKey(enums.values()),
    extensions: sortByKey(extensions.values()),
    grants: sortByKey(grants.values()),
  }
}

function applyDroppedTableStatement(statement: string, triggers: Map<string, SchemaDriftTrigger>) {
  const normalized = trimLeadingControlFlow(statement)
  const drop = normalized.match(/^drop\s+table\s+(?:if\s+exists\s+)?(?<names>[\s\S]+?)(?:\s+(?:cascade|restrict))?\s*;?$/i)
  if (!drop?.groups?.names) return
  const droppedTables = new Set(splitTopLevelComma(drop.groups.names).map((item) => {
    const name = parseQualifiedName(item.trim())
    return `${name.schemaName}.${name.objectName}`
  }))
  for (const [key, trigger] of triggers) {
    if (droppedTables.has(`${trigger.schemaName}.${trigger.tableName}`)) triggers.delete(key)
  }
}

export function evaluateExtendedSchemaDrift(input: {
  expected: SchemaDriftExtendedCatalog
  actual: SchemaDriftExtendedCatalog
}): ExtendedSchemaDriftResult {
  const blockingDrift: BlockingExtendedSchemaDrift[] = []

  compareManagedObjects(
    'trigger',
    input.expected.triggers,
    input.actual.triggers,
    'missing_actual_trigger',
    'unexpected_actual_trigger',
    'trigger_definition_mismatch',
    normalizeTriggerForComparison,
    blockingDrift,
  )
  compareManagedObjects(
    'function',
    input.expected.functions,
    input.actual.functions,
    'missing_actual_function',
    'unexpected_actual_function',
    'function_definition_mismatch',
    normalizeFunctionForComparison,
    blockingDrift,
  )
  compareManagedObjects(
    'view',
    input.expected.views,
    input.actual.views,
    'missing_actual_view',
    'unexpected_actual_view',
    'view_definition_mismatch',
    normalizeViewForComparison,
    blockingDrift,
  )
  compareManagedObjects(
    'enum',
    input.expected.enums,
    input.actual.enums,
    'missing_actual_enum',
    'unexpected_actual_enum',
    'enum_labels_mismatch',
    (item) => item.labels,
    blockingDrift,
  )

  const actualExtensions = new Map(input.actual.extensions.map((item) => [item.key, item]))
  for (const expectedExtension of input.expected.extensions) {
    const actualExtension = actualExtensions.get(expectedExtension.key)
    if (!actualExtension) {
      blockingDrift.push({
        objectType: 'extension',
        objectName: expectedExtension.extensionName,
        driftType: 'missing_actual_extension',
        expected: expectedExtension,
      })
      continue
    }
    if (
      expectedExtension.schemaName !== null
      && normalizeIdentifier(expectedExtension.schemaName) !== normalizeIdentifier(actualExtension.schemaName ?? '')
    ) {
      blockingDrift.push({
        objectType: 'extension',
        objectName: expectedExtension.extensionName,
        driftType: 'extension_schema_mismatch',
        expected: expectedExtension.schemaName,
        actual: actualExtension.schemaName,
      })
    }
  }

  const actualAllowedGrantKeys = new Set(input.actual.grants.filter((item) => item.allowed).map((item) => item.key))
  for (const expectedGrant of input.expected.grants) {
    const present = actualAllowedGrantKeys.has(expectedGrant.key)
    if (expectedGrant.allowed && !present) {
      blockingDrift.push({
        objectType: 'grant',
        objectName: expectedGrant.key,
        driftType: 'missing_actual_grant',
        expected: true,
        actual: false,
      })
    } else if (!expectedGrant.allowed && present) {
      blockingDrift.push({
        objectType: 'grant',
        objectName: expectedGrant.key,
        driftType: 'forbidden_actual_grant',
        expected: false,
        actual: true,
      })
    }
  }

  return {
    status: blockingDrift.length === 0 ? 'pass' : 'fail',
    blockingDrift,
  }
}

function compareManagedObjects<T extends { key: string }>(
  objectType: Extract<ExtendedSchemaDriftObjectType, 'trigger' | 'function' | 'view' | 'enum'>,
  expectedItems: T[],
  actualItems: T[],
  missingType: ExtendedSchemaDriftType,
  unexpectedType: ExtendedSchemaDriftType,
  mismatchType: ExtendedSchemaDriftType,
  normalize: (item: T) => unknown,
  blockingDrift: BlockingExtendedSchemaDrift[],
) {
  const expectedByKey = new Map(expectedItems.map((item) => [item.key, item]))
  const actualByKey = new Map(actualItems.map((item) => [item.key, item]))

  for (const expectedItem of expectedItems) {
    const actualItem = actualByKey.get(expectedItem.key)
    if (!actualItem) {
      blockingDrift.push({ objectType, objectName: expectedItem.key, driftType: missingType, expected: expectedItem })
      continue
    }
    const normalizedExpected = normalize(expectedItem)
    const normalizedActual = normalize(actualItem)
    if (JSON.stringify(normalizedExpected) !== JSON.stringify(normalizedActual)) {
      blockingDrift.push({
        objectType,
        objectName: expectedItem.key,
        driftType: mismatchType,
        expected: normalizedExpected,
        actual: normalizedActual,
      })
    }
  }

  for (const actualItem of actualItems) {
    if (!expectedByKey.has(actualItem.key)) {
      blockingDrift.push({ objectType, objectName: actualItem.key, driftType: unexpectedType, actual: actualItem })
    }
  }
}

function applyFunctionStatement(statement: string, functions: Map<string, SchemaDriftFunction>) {
  const normalized = trimLeadingControlFlow(statement)
  if (/^drop\s+function\b/i.test(normalized)) {
    const signature = normalized.match(/^drop\s+function\s+(?:if\s+exists\s+)?(?<signature>[\s\S]+?)(?:\s+(?:cascade|restrict))?\s*;?$/i)?.groups?.signature
    if (!signature) return
    for (const item of splitTopLevelComma(signature)) {
      const parsed = parseFunctionSignature(item)
      if (parsed) functions.delete(parsed.key)
    }
    return
  }

  if (!/^create\s+(?:or\s+replace\s+)?function\b/i.test(normalized)) return
  const parsed = parseCreateFunction(normalized)
  if (!parsed) return
  functions.set(parsed.key, parsed)
}

function parseCreateFunction(statement: string): SchemaDriftFunction | null {
  const prefix = statement.match(/^create\s+(?:or\s+replace\s+)?function\s+/i)
  if (!prefix) return null
  const nameStart = prefix[0].length
  const openParen = findCharacterOutsideQuotes(statement, '(', nameStart)
  if (openParen === -1) return null
  const closeParen = findMatchingParenthesis(statement, openParen)
  if (closeParen === -1) return null

  const name = parseQualifiedName(statement.slice(nameStart, openParen).trim())
  const identityArguments = normalizeIdentityArguments(statement.slice(openParen + 1, closeParen))
  const remainder = statement.slice(closeParen + 1)
  const attributes = extractFunctionAttributes(remainder)
  const returnsMatch = attributes.match(/\breturns\s+([\s\S]+?)(?=\s+(?:language|security|immutable|stable|volatile|strict|called|parallel|cost|rows|set)\b|$)/i)
  const language = attributes.match(/\blanguage\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))/i)
  const body = extractFunctionBody(remainder)
  const volatility = /\bimmutable\b/i.test(attributes)
    ? 'immutable'
    : /\bstable\b/i.test(attributes)
      ? 'stable'
      : 'volatile'
  const key = `${name.schemaName}.${name.objectName}(${identityArguments})`

  return {
    key,
    schemaName: name.schemaName,
    functionName: name.objectName,
    identityArguments,
    resultType: normalizePostgresType(returnsMatch?.[1] ?? ''),
    language: normalizeIdentifier(language?.[1] ?? language?.[2] ?? ''),
    securityDefiner: /\bsecurity\s+definer\b/i.test(attributes),
    volatility,
    body: normalizeFunctionBody(body),
  }
}

function parseFunctionSignature(value: string) {
  const openParen = findCharacterOutsideQuotes(value, '(', 0)
  if (openParen === -1) return null
  const closeParen = findMatchingParenthesis(value, openParen)
  if (closeParen === -1) return null
  const name = parseQualifiedName(value.slice(0, openParen).trim())
  const identityArguments = normalizeIdentityArguments(value.slice(openParen + 1, closeParen))
  return {
    ...name,
    identityArguments,
    key: `${name.schemaName}.${name.objectName}(${identityArguments})`,
  }
}

function extractFunctionBody(remainder: string) {
  const asMatch = remainder.match(/\bas\s+(\$[a-zA-Z0-9_]*\$)/i)
  if (asMatch?.[1] && asMatch.index !== undefined) {
    const bodyStart = asMatch.index + asMatch[0].length
    const bodyEnd = remainder.indexOf(asMatch[1], bodyStart)
    if (bodyEnd !== -1) return remainder.slice(bodyStart, bodyEnd)
  }

  const quotedMatch = remainder.match(/\bas\s+'((?:''|[^'])*)'/i)
  return quotedMatch?.[1]?.replace(/''/g, "'") ?? ''
}

function extractFunctionAttributes(remainder: string) {
  const dollarBody = remainder.match(/\bas\s+(\$[a-zA-Z0-9_]*\$)/i)
  if (dollarBody?.[1] && dollarBody.index !== undefined) {
    const bodyStart = dollarBody.index + dollarBody[0].length
    const bodyEnd = remainder.indexOf(dollarBody[1], bodyStart)
    if (bodyEnd !== -1) {
      return `${remainder.slice(0, dollarBody.index)} ${remainder.slice(bodyEnd + dollarBody[1].length)}`
    }
  }

  const quotedBody = remainder.match(/\bas\s+'/i)
  if (quotedBody?.index !== undefined) {
    const bodyStart = quotedBody.index + quotedBody[0].length
    let bodyEnd = bodyStart
    while (bodyEnd < remainder.length) {
      if (remainder[bodyEnd] !== "'") {
        bodyEnd += 1
        continue
      }
      if (remainder[bodyEnd + 1] === "'") {
        bodyEnd += 2
        continue
      }
      return `${remainder.slice(0, quotedBody.index)} ${remainder.slice(bodyEnd + 1)}`
    }
  }

  return remainder
}

function applyTriggerStatement(statement: string, triggers: Map<string, SchemaDriftTrigger>) {
  const normalized = trimLeadingControlFlow(statement)
  const drop = normalized.match(/^drop\s+trigger\s+(?:if\s+exists\s+)?(?<trigger>[^\s]+)\s+on\s+(?<table>[^\s;]+)/i)
  if (drop?.groups) {
    const table = parseQualifiedName(drop.groups.table)
    const triggerName = normalizeIdentifier(drop.groups.trigger)
    triggers.delete(`${table.schemaName}.${table.objectName}.${triggerName}`)
    return
  }

  if (!/^create\s+(?:constraint\s+)?trigger\b/i.test(normalized)) return
  const parsed = parseCreateTrigger(normalized)
  if (!parsed) return
  triggers.set(parsed.key, parsed)
}

function parseCreateTrigger(statement: string): SchemaDriftTrigger | null {
  const match = statement.match(/^create\s+(?:constraint\s+)?trigger\s+(?<trigger>[^\s]+)\s+(?<body>[\s\S]+)$/i)
  if (!match?.groups) return null
  const onMatch = match.groups.body.match(/\bon\s+(?<table>[^\s]+)\s+/i)
  const executeMatch = match.groups.body.match(/\bexecute\s+(?:function|procedure)\s+(?<function>[^\s(]+)\s*\(/i)
  if (!onMatch?.groups || !executeMatch?.groups) return null

  const table = parseQualifiedName(onMatch.groups.table)
  const functionName = parseQualifiedName(executeMatch.groups.function)
  const timing = match.groups.body.match(/\b(before|after|instead\s+of)\b/i)?.[1] ?? ''
  const events = Array.from(match.groups.body.matchAll(/\b(insert|update|delete|truncate)\b/gi))
    .map((item) => item[1]?.toLowerCase())
    .filter((item): item is string => Boolean(item))
  const triggerName = normalizeIdentifier(match.groups.trigger)
  const condition = match.groups.body.match(/\bwhen\s*\(([\s\S]+?)\)\s*execute\b/i)?.[1] ?? null

  return {
    key: `${table.schemaName}.${table.objectName}.${triggerName}`,
    schemaName: table.schemaName,
    tableName: table.objectName,
    triggerName,
    functionName: `${functionName.schemaName}.${functionName.objectName}`,
    timing: normalizeWhitespace(timing).toLowerCase(),
    events: Array.from(new Set(events)).sort(),
    orientation: /\bfor\s+each\s+row\b/i.test(match.groups.body) ? 'row' : 'statement',
    condition: condition ? normalizeSqlDefinition(condition) : null,
  }
}

function applyViewStatement(statement: string, views: Map<string, SchemaDriftView>) {
  const normalized = trimLeadingControlFlow(statement)
  const drop = normalized.match(/^drop\s+(?<materialized>materialized\s+)?view\s+(?:if\s+exists\s+)?(?<names>[\s\S]+?)(?:\s+(?:cascade|restrict))?\s*;?$/i)
  if (drop?.groups?.names) {
    for (const item of splitTopLevelComma(drop.groups.names)) {
      const name = parseQualifiedName(item.trim())
      views.delete(`${name.schemaName}.${name.objectName}`)
    }
    return
  }

  const create = normalized.match(/^create\s+(?<replace>or\s+replace\s+)?(?<materialized>materialized\s+)?view\s+(?<ifNotExists>if\s+not\s+exists\s+)?(?<name>[^\s(]+)(?:\s*\([^)]*\))?(?:\s+with\s*\((?<options>[^)]*)\))?\s+as\s+(?<definition>[\s\S]+?)\s*;?$/i)
  if (!create?.groups) return
  const name = parseQualifiedName(create.groups.name)
  const key = `${name.schemaName}.${name.objectName}`
  if (create.groups.ifNotExists && views.has(key)) return
  const definition = create.groups.definition.replace(/\s+with\s+(?:no\s+)?data\s*$/i, '')
  views.set(key, {
    key,
    schemaName: name.schemaName,
    viewName: name.objectName,
    materialized: Boolean(create.groups.materialized),
    definition: definition.trim(),
    options: normalizeViewOptions(create.groups.options),
  })
}

function applyEnumStatement(statement: string, enums: Map<string, SchemaDriftEnum>) {
  const normalized = trimLeadingControlFlow(statement)
  const drop = normalized.match(/^drop\s+type\s+(?:if\s+exists\s+)?(?<names>[\s\S]+?)(?:\s+(?:cascade|restrict))?\s*;?$/i)
  if (drop?.groups?.names) {
    for (const item of splitTopLevelComma(drop.groups.names)) {
      const name = parseQualifiedName(item.trim())
      enums.delete(`${name.schemaName}.${name.objectName}`)
    }
    return
  }

  const create = normalized.match(/^create\s+type\s+(?<name>[^\s]+)\s+as\s+enum\s*\((?<labels>[\s\S]*?)\)\s*;?$/i)
  if (create?.groups) {
    const name = parseQualifiedName(create.groups.name)
    const key = `${name.schemaName}.${name.objectName}`
    if (!enums.has(key)) {
      enums.set(key, {
        key,
        schemaName: name.schemaName,
        enumName: name.objectName,
        labels: parseSqlStringLiterals(create.groups.labels),
      })
    }
    return
  }

  const alter = normalized.match(/^alter\s+type\s+(?<name>[^\s]+)\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'(?<label>(?:''|[^'])*)'(?:\s+(?<position>before|after)\s+'(?<anchor>(?:''|[^'])*)')?/i)
  if (!alter?.groups) return
  const name = parseQualifiedName(alter.groups.name)
  const key = `${name.schemaName}.${name.objectName}`
  const current = enums.get(key)
  if (!current) return
  const label = alter.groups.label.replace(/''/g, "'")
  if (current.labels.includes(label)) return
  const anchor = alter.groups.anchor?.replace(/''/g, "'")
  const anchorIndex = anchor ? current.labels.indexOf(anchor) : -1
  const insertionIndex = anchorIndex === -1
    ? current.labels.length
    : alter.groups.position?.toLowerCase() === 'before'
      ? anchorIndex
      : anchorIndex + 1
  current.labels.splice(insertionIndex, 0, label)
}

function applyExtensionStatement(statement: string, extensions: Map<string, SchemaDriftExtension>) {
  const normalized = trimLeadingControlFlow(statement)
  const drop = normalized.match(/^drop\s+extension\s+(?:if\s+exists\s+)?(?<names>[\s\S]+?)(?:\s+(?:cascade|restrict))?\s*;?$/i)
  if (drop?.groups?.names) {
    for (const item of splitTopLevelComma(drop.groups.names)) {
      extensions.delete(normalizeIdentifier(item.trim()))
    }
    return
  }

  const alter = normalized.match(/^alter\s+extension\s+(?<name>[^\s]+)\s+set\s+schema\s+(?<schema>[^\s;]+)/i)
  if (alter?.groups) {
    const key = normalizeIdentifier(alter.groups.name)
    const existing = extensions.get(key)
    if (existing) existing.schemaName = normalizeIdentifier(alter.groups.schema)
    return
  }

  const create = normalized.match(/^create\s+extension\s+(?<ifNotExists>if\s+not\s+exists\s+)?(?<name>[^\s;]+)(?:\s+with)?(?:\s+schema\s+(?<schema>[^\s;]+))?/i)
  if (!create?.groups) return
  const key = normalizeIdentifier(create.groups.name)
  if (create.groups.ifNotExists && extensions.has(key)) return
  extensions.set(key, {
    key,
    extensionName: key,
    schemaName: create.groups.schema ? normalizeIdentifier(create.groups.schema) : null,
  })
}

function buildExpectedSequenceNames(statements: string[]) {
  const sequences = new Map<string, string>()
  for (const statement of statements) {
    const normalized = trimLeadingControlFlow(statement)
    const create = normalized.match(/^create\s+sequence\s+(?:if\s+not\s+exists\s+)?(?<name>[^\s;]+)/i)
    if (create?.groups?.name) {
      const name = parseQualifiedName(create.groups.name)
      sequences.set(`${name.schemaName}.${name.objectName}`, `${name.schemaName}.${name.objectName}`)
      continue
    }
    const drop = normalized.match(/^drop\s+sequence\s+(?:if\s+exists\s+)?(?<names>[\s\S]+?)(?:\s+(?:cascade|restrict))?\s*;?$/i)
    if (!drop?.groups?.names) continue
    for (const item of splitTopLevelComma(drop.groups.names)) {
      const name = parseQualifiedName(item.trim())
      sequences.delete(`${name.schemaName}.${name.objectName}`)
    }
  }
  return Array.from(sequences.values()).sort()
}

function applyGrantStatement(
  statement: string,
  grants: Map<string, SchemaDriftGrant>,
  targets: GrantTargetContext,
) {
  const normalized = trimLeadingControlFlow(statement)
  const defaultPrivileges = normalized.match(/^alter\s+default\s+privileges(?:\s+for\s+(?:role|user)\s+[^\s]+)?(?:\s+in\s+schema\s+(?<schema>[^\s]+))?\s+(?<action>grant|revoke)\s+(?<privileges>[\s\S]+?)\s+on\s+(?<target>tables|sequences|functions)\s+(?:to|from)\s+(?<grantees>[\s\S]+?)\s*;?$/i)
  if (defaultPrivileges?.groups) {
    const objectType = defaultPrivileges.groups.target.toLowerCase() === 'tables'
      ? 'default_table'
      : defaultPrivileges.groups.target.toLowerCase() === 'sequences'
        ? 'default_sequence'
        : 'default_function'
    const privileges = expandPrivileges(defaultPrivileges.groups.privileges, objectType)
    const schemaName = normalizeIdentifier(defaultPrivileges.groups.schema ?? 'public')
    const allowed = defaultPrivileges.groups.action.toLowerCase() === 'grant'
    for (const grantee of parseIdentifierList(defaultPrivileges.groups.grantees)) {
      for (const privilege of privileges) {
        setGrant(grants, { objectType, schemaName, objectName: `${schemaName}.*`, grantee, privilege, allowed })
      }
    }
    return
  }

  const direct = normalized.match(/^(?<action>grant|revoke)\s+(?<privileges>[\s\S]+?)\s+on\s+(?<target>[\s\S]+?)\s+(?:to|from)\s+(?<grantees>[\s\S]+?)\s*;?$/i)
  if (!direct?.groups) return
  const allowed = direct.groups.action.toLowerCase() === 'grant'
  const target = direct.groups.target.trim()
  const grantees = parseIdentifierList(direct.groups.grantees.replace(/\s+with\s+grant\s+option\s*$/i, ''))

  const allInSchema = target.match(/^all\s+(?<kind>tables|sequences|functions)\s+in\s+schema\s+(?<schema>[^\s]+)$/i)
  if (allInSchema?.groups) {
    const schemaName = normalizeIdentifier(allInSchema.groups.schema)
    const kind = allInSchema.groups.kind.toLowerCase()
    const objectType = kind === 'tables' ? 'table' : kind === 'sequences' ? 'sequence' : 'function'
    const objectNames = kind === 'tables'
      ? targets.tableNames.filter((item) => item.startsWith(`${schemaName}.`))
      : kind === 'sequences'
        ? targets.sequenceNames.filter((item) => item.startsWith(`${schemaName}.`))
        : targets.functionKeys.filter((item) => item.startsWith(`${schemaName}.`))
    const privileges = expandPrivileges(direct.groups.privileges, objectType)
    for (const objectName of objectNames) {
      for (const grantee of grantees) {
        for (const privilege of privileges) {
          setGrant(grants, { objectType, schemaName, objectName, grantee, privilege, allowed })
        }
      }
    }
    return
  }

  const typedTarget = target.match(/^(?<kind>table|sequence|function|schema)\s+(?<objects>[\s\S]+)$/i)
  if (!typedTarget?.groups) return
  const objectType = typedTarget.groups.kind.toLowerCase() as Extract<SchemaDriftGrantObjectType, 'table' | 'sequence' | 'function' | 'schema'>
  const privileges = expandPrivileges(direct.groups.privileges, objectType)
  for (const rawObject of splitTopLevelComma(typedTarget.groups.objects)) {
    const functionTarget = objectType === 'function' ? parseFunctionSignature(rawObject.trim()) : null
    const namedTarget = objectType === 'function' ? null : parseQualifiedName(rawObject.trim())
    if (!functionTarget && !namedTarget) continue
    const schemaName = functionTarget?.schemaName ?? namedTarget?.schemaName ?? 'public'
    const objectName = functionTarget?.key
      ?? (objectType === 'schema'
        ? namedTarget?.objectName ?? ''
        : `${namedTarget?.schemaName ?? 'public'}.${namedTarget?.objectName ?? ''}`)
    for (const grantee of grantees) {
      for (const privilege of privileges) {
        setGrant(grants, { objectType, schemaName, objectName, grantee, privilege, allowed })
      }
    }
  }
}

function applyDynamicFunctionAclLoops(
  sql: string,
  grants: Map<string, SchemaDriftGrant>,
  targets: GrantTargetContext,
) {
  const functionKeys = new Set(targets.functionKeys)
  for (const statement of splitSqlStatements(sql)) {
    const trimmed = statement.trim()
    if (!/^(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*do\b/i.test(trimmed)) continue
    const doBody = extractFirstDollarQuotedBody(trimmed)
    if (!doBody) continue

    for (const functionLoop of extractForeachArrayLoops(doBody)) {
      const functions = parseSqlStringLiterals(functionLoop.items)
        .map((item) => parseFunctionSignature(item))
        .filter((item): item is NonNullable<ReturnType<typeof parseFunctionSignature>> => Boolean(item))
        .filter((item) => functionKeys.has(item.key))
      if (functions.length === 0) continue

      const functionIterator = escapeRegExp(functionLoop.iterator)
      if (new RegExp(
        `execute\\s+format\\s*\\(\\s*'revoke\\s+all\\s+on\\s+function\\s+%s\\s+from\\s+public'\\s*,\\s*${functionIterator}\\s*\\)`,
        'i',
      ).test(functionLoop.body)) {
        for (const functionTarget of functions) {
          setGrant(grants, {
            objectType: 'function',
            schemaName: functionTarget.schemaName,
            objectName: functionTarget.key,
            grantee: 'public',
            privilege: 'execute',
            allowed: false,
          })
        }
      }

      for (const roleLoop of extractForeachArrayLoops(functionLoop.body)) {
        const roleIterator = escapeRegExp(roleLoop.iterator)
        const revoked = new RegExp(
          `execute\\s+format\\s*\\(\\s*'revoke\\s+all\\s+on\\s+function\\s+%s\\s+from\\s+%i'\\s*,\\s*${functionIterator}\\s*,\\s*${roleIterator}\\s*\\)`,
          'i',
        ).test(roleLoop.body)
        const granted = new RegExp(
          `execute\\s+format\\s*\\(\\s*'grant\\s+execute\\s+on\\s+function\\s+%s\\s+to\\s+%i'\\s*,\\s*${functionIterator}\\s*,\\s*${roleIterator}\\s*\\)`,
          'i',
        ).test(roleLoop.body)
        if (!revoked && !granted) continue

        for (const roleName of parseSqlStringLiterals(roleLoop.items).map(normalizeIdentifier)) {
          for (const functionTarget of functions) {
            setGrant(grants, {
              objectType: 'function',
              schemaName: functionTarget.schemaName,
              objectName: functionTarget.key,
              grantee: roleName,
              privilege: 'execute',
              allowed: granted,
            })
          }
        }
      }
    }
  }
}

function extractForeachArrayLoops(value: string) {
  const loops: Array<{ iterator: string; items: string; body: string }> = []
  const headerPattern = /\bforeach\s+(?<iterator>[a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+array\s+array\s*\[(?<items>[\s\S]*?)\]\s+loop\b/gi
  let match: RegExpExecArray | null

  while ((match = headerPattern.exec(value)) !== null) {
    const iterator = match.groups?.iterator
    const items = match.groups?.items
    if (!iterator || items === undefined) continue
    const bodyStart = headerPattern.lastIndex
    const bodyEnd = findMatchingLoopEnd(value, bodyStart)
    if (bodyEnd === -1) continue
    loops.push({ iterator, items, body: value.slice(bodyStart, bodyEnd) })
  }

  return loops
}

function findMatchingLoopEnd(value: string, bodyStart: number) {
  const tokenPattern = /\bend\s+loop\b|\bloop\b/gi
  tokenPattern.lastIndex = bodyStart
  let depth = 1
  let token: RegExpExecArray | null

  while ((token = tokenPattern.exec(value)) !== null) {
    if (/^end\s+loop$/i.test(token[0])) depth -= 1
    else depth += 1
    if (depth === 0) return token.index
  }

  return -1
}

function setGrant(
  grants: Map<string, SchemaDriftGrant>,
  input: Omit<SchemaDriftGrant, 'key'>,
) {
  const key = `${input.objectType}:${input.objectName}:${input.grantee}:${input.privilege}`
  grants.set(key, { key, ...input })
}

function applyDroppedObjectGrantCleanup(statement: string, grants: Map<string, SchemaDriftGrant>) {
  const normalized = trimLeadingControlFlow(statement)
  const drop = normalized.match(/^drop\s+(?<kind>table|sequence|function|materialized\s+view|view)\s+(?:if\s+exists\s+)?(?<objects>[\s\S]+?)(?:\s+(?:cascade|restrict))?\s*;?$/i)
  if (!drop?.groups?.kind || !drop.groups.objects) return

  const objectType = /view|table/i.test(drop.groups.kind)
    ? 'table'
    : /^sequence$/i.test(drop.groups.kind)
      ? 'sequence'
      : 'function'
  const objectNames = new Set(splitTopLevelComma(drop.groups.objects).map((item) => {
    if (objectType === 'function') return parseFunctionSignature(item.trim())?.key ?? ''
    const name = parseQualifiedName(item.trim())
    return `${name.schemaName}.${name.objectName}`
  }).filter(Boolean))

  for (const [key, grant] of grants) {
    if (grant.objectType === objectType && objectNames.has(grant.objectName)) grants.delete(key)
  }
}

function expandPrivileges(value: string, objectType: SchemaDriftGrantObjectType) {
  const normalized = value.replace(/\bgrant\s+option\s+for\b/gi, '').trim().toLowerCase()
  if (!/^all(?:\s+privileges)?$/i.test(normalized)) {
    return splitTopLevelComma(normalized).map((item) => normalizeIdentifier(item))
  }
  if (objectType === 'table' || objectType === 'default_table') return [...TABLE_PRIVILEGES]
  if (objectType === 'sequence' || objectType === 'default_sequence') return [...SEQUENCE_PRIVILEGES]
  if (objectType === 'function' || objectType === 'default_function') return [...FUNCTION_PRIVILEGES]
  return [...SCHEMA_PRIVILEGES]
}

function parseIdentifierList(value: string) {
  return splitTopLevelComma(value)
    .map((item) => normalizeIdentifier(item.replace(/\s+(?:cascade|restrict)\s*$/i, '').trim()))
    .filter(Boolean)
}

function normalizeTriggerForComparison(item: SchemaDriftTrigger) {
  return {
    timing: normalizeWhitespace(item.timing).toLowerCase(),
    events: [...item.events].map((event) => event.toLowerCase()).sort(),
    orientation: item.orientation.toLowerCase(),
    functionName: normalizeQualifiedReference(item.functionName),
    condition: item.condition ? normalizeTriggerCondition(item.condition) : null,
  }
}

function normalizeFunctionForComparison(item: SchemaDriftFunction) {
  return {
    resultType: normalizePostgresType(item.resultType),
    language: normalizeIdentifier(item.language),
    securityDefiner: item.securityDefiner,
    volatility: item.volatility,
    body: normalizeFunctionBody(item.body),
  }
}

function normalizeViewForComparison(item: SchemaDriftView) {
  return {
    materialized: item.materialized,
    definition: normalizeViewDefinition(item.definition),
    options: normalizeViewOptions((item.options ?? []).join(', ')),
  }
}

export function normalizeViewOptions(value: string | null | undefined) {
  return splitTopLevelComma(value ?? '')
    .map((option) => normalizeWhitespace(option).replace(/\s*=\s*/g, ' = ').toLowerCase())
    .filter(Boolean)
    .sort()
}

function normalizeIdentityArguments(value: string) {
  return splitTopLevelComma(value)
    .map((argument) => normalizeIdentityArgument(argument))
    .filter((argument): argument is string => Boolean(argument))
    .join(', ')
}

function normalizeIdentityArgument(value: string) {
  let argument = stripArgumentDefault(value).trim()
  const mode = argument.match(/^(inout|in|out|variadic)\s+/i)?.[1]?.toLowerCase()
  if (mode) argument = argument.replace(/^(?:inout|in|out|variadic)\s+/i, '').trim()
  if (mode === 'out') return null

  const firstToken = readIdentifierToken(argument)
  if (!firstToken) return normalizePostgresType(argument)
  const firstNormalized = normalizeIdentifier(firstToken.token)
  const remainder = argument.slice(firstToken.end).trim()
  const firstLooksLikeType = TYPE_STARTERS.has(firstNormalized)
    || firstNormalized.includes('.')
    || firstNormalized.endsWith('[]')
  const typeExpression = remainder && !firstLooksLikeType ? remainder : argument
  return normalizePostgresType(typeExpression)
}

function stripArgumentDefault(value: string) {
  const defaultIndex = findKeywordOutsideQuotes(value, 'default')
  const equalsIndex = findCharacterOutsideQuotes(value, '=', 0)
  const indexes = [defaultIndex, equalsIndex].filter((index) => index >= 0)
  return indexes.length > 0 ? value.slice(0, Math.min(...indexes)) : value
}

function normalizePostgresType(value: string) {
  const normalized = normalizeWhitespace(value)
    .replace(/\bpublic\./gi, '')
    .replace(/"([a-zA-Z0-9_]+)"/g, '$1')
    .replace(/\btable\s*\(\s*/gi, 'table(')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+\)/g, ')')
    .toLowerCase()
  const withoutLength = normalized.replace(/\(\s*\d+(?:\s*,\s*\d+)?\s*\)/g, '')
  const aliases: Record<string, string> = {
    bool: 'boolean',
    int: 'integer',
    int4: 'integer',
    int8: 'bigint',
    timestamptz: 'timestamp with time zone',
    timestamp: 'timestamp without time zone',
    varchar: 'character varying',
  }
  return aliases[withoutLength] ?? withoutLength
}

function normalizeFunctionBody(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && !lines[0]?.trim()) lines.shift()
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) lines.pop()
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)?.[0].length ?? 0)
  const commonIndent = indents.length > 0 ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(commonIndent).trimEnd()).join('\n')
}

function normalizeSqlDefinition(value: string) {
  return value
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"([a-zA-Z0-9_]+)"/g, '$1')
    .replace(/\bpublic\./gi, '')
    .replace(/\s*;\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeTriggerCondition(value: string) {
  let normalized = normalizeSqlDefinition(value)
    .replace(/::(?:text|character varying|varchar|uuid|integer|bigint|numeric|double precision|real|boolean|bool|date|timestamp with time zone|timestamp without time zone)(?:\[\])?/g, '')
    .replace(/\((new|old)\.([a-z_][a-z0-9_]*)\)/g, '$1.$2')
  let previous = ''
  while (previous !== normalized) {
    previous = normalized
    normalized = stripBalancedOuterParentheses(normalized)
      .replace(/\((new|old)\.([a-z_][a-z0-9_]*)\)/g, '$1.$2')
      .replace(
        /\(\s*((?:new|old)\.[a-z_][a-z0-9_]*)\s+(is\s+(?:not\s+)?distinct\s+from)\s+((?:new|old)\.[a-z_][a-z0-9_]*)\s*\)/g,
        '$1 $2 $3',
      )
  }
  return normalizeWhitespace(normalized)
}

function normalizeViewDefinition(value: string) {
  const normalized = normalizeSqlDefinition(value)
  return normalized
    .split(/\bunion\s+all\b/)
    .map((branch) => normalizeSingleSourceViewBranch(branch.trim()))
    .join(' union all ')
}

function normalizeSingleSourceViewBranch(branch: string) {
  if (/\bjoin\b/.test(branch)) return branch
  const sources = Array.from(branch.matchAll(/\bfrom\s+([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/g))
  if (sources.length !== 1) return branch
  const sourceName = sources[0]?.[1]
  const possibleAlias = sources[0]?.[2]
  const reservedWords = new Set(['where', 'group', 'order', 'limit', 'offset', 'union', 'having', 'window'])
  const qualifiers = [sourceName, possibleAlias && !reservedWords.has(possibleAlias) ? possibleAlias : null]
    .filter((item): item is string => Boolean(item))
  let result = branch
  for (const qualifier of qualifiers) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(qualifier)}\\.`, 'g'), '')
  }
  return result
}

function stripBalancedOuterParentheses(value: string) {
  let result = value.trim()
  while (result.startsWith('(') && result.endsWith(')') && outerParenthesesWrapWholeExpression(result)) {
    result = result.slice(1, -1).trim()
  }
  return result
}

function outerParenthesesWrapWholeExpression(value: string) {
  let depth = 0
  let singleQuoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const next = value[index + 1]
    if (singleQuoted) {
      if (character === "'" && next === "'") index += 1
      else if (character === "'") singleQuoted = false
      continue
    }
    if (character === "'") {
      singleQuoted = true
      continue
    }
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0 && index < value.length - 1) return false
    }
  }
  return depth === 0
}

function normalizeQualifiedReference(value: string) {
  const name = parseQualifiedName(value)
  return `${name.schemaName}.${name.objectName}`
}

function parseQualifiedName(value: string): QualifiedName {
  const parts = splitQualifiedIdentifier(value.trim().replace(/[;,]$/, ''))
  if (parts.length === 1) {
    return { schemaName: 'public', objectName: normalizeIdentifier(parts[0] ?? '') }
  }
  return {
    schemaName: normalizeIdentifier(parts[parts.length - 2] ?? 'public'),
    objectName: normalizeIdentifier(parts[parts.length - 1] ?? ''),
  }
}

function splitQualifiedIdentifier(value: string) {
  const result: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (character === '.' && !quoted) {
      result.push(current)
      current = ''
      continue
    }
    current += character
  }
  result.push(current)
  return result.filter(Boolean)
}

function normalizeIdentifier(value: string) {
  const normalized = value.trim().replace(/^"|"$/g, '').replace(/""/g, '"').toLowerCase()
  return normalized.length > 63 ? normalized.slice(0, 63) : normalized
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function trimLeadingControlFlow(statement: string) {
  const withoutComments = statement
    .replace(/^\s*(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/\s*)*/g, '')
    .trim()
  const start = findDdlStartOutsideQuotes(withoutComments)
  return start >= 0 ? withoutComments.slice(start).trim() : withoutComments
}

function collectExecutableDdlStatements(sql: string) {
  const collected: string[] = []
  for (const statement of splitSqlStatements(sql)) {
    const trimmed = statement.trim()
    if (!trimmed) continue
    if (/^(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*do\b/i.test(trimmed)) {
      const body = extractFirstDollarQuotedBody(trimmed)
      if (body) collected.push(...extractDdlStatementsFromDoBody(body))
      continue
    }
    if (findDdlStartOutsideQuotes(trimmed) >= 0) collected.push(trimmed)
  }
  return collected
}

function extractDdlStatementsFromDoBody(body: string) {
  const result: string[] = []
  for (const dynamicBody of extractExecutedDollarQuotedBodies(body)) {
    result.push(...splitSqlStatements(dynamicBody).filter((item) => findDdlStartOutsideQuotes(item) >= 0))
  }
  for (const dynamicBody of extractExecutedSingleQuotedBodies(body)) {
    result.push(...splitSqlStatements(dynamicBody).filter((item) => findDdlStartOutsideQuotes(item) >= 0))
  }
  const masked = maskDollarQuotedBodies(body)
  for (const fragment of splitSqlStatements(masked)) {
    const start = findDdlStartOutsideQuotes(fragment)
    if (start >= 0) result.push(fragment.slice(start))
  }
  return result
}

function extractExecutedDollarQuotedBodies(value: string) {
  const bodies: string[] = []
  const pattern = /\bexecute\s+(\$[a-zA-Z0-9_]*\$)([\s\S]*?)\1/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    const body = match[2]?.trim()
    if (body && findDdlStartOutsideQuotes(body) === 0 && !/%[ILs]/.test(body)) bodies.push(body)
  }
  return bodies
}

function extractExecutedSingleQuotedBodies(value: string) {
  const bodies: string[] = []
  const pattern = /\bexecute\s+'((?:''|[^'])*)'\s*;/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    const body = match[1]?.replace(/''/g, "'").trim()
    if (body && findDdlStartOutsideQuotes(body) === 0) bodies.push(body)
  }
  return bodies
}

function extractFirstDollarQuotedBody(value: string) {
  const open = value.match(/\$[a-zA-Z0-9_]*\$/)
  if (!open?.[0] || open.index === undefined) return null
  const start = open.index + open[0].length
  const end = value.indexOf(open[0], start)
  return end === -1 ? null : value.slice(start, end)
}

function maskDollarQuotedBodies(value: string) {
  let result = ''
  let cursor = 0
  while (cursor < value.length) {
    const match = value.slice(cursor).match(/\$[a-zA-Z0-9_]*\$/)
    if (!match?.[0] || match.index === undefined) {
      result += value.slice(cursor)
      break
    }
    const openIndex = cursor + match.index
    const bodyStart = openIndex + match[0].length
    const closeIndex = value.indexOf(match[0], bodyStart)
    if (closeIndex === -1) {
      result += value.slice(cursor)
      break
    }
    result += value.slice(cursor, openIndex)
    result += ' '.repeat(closeIndex + match[0].length - openIndex)
    cursor = closeIndex + match[0].length
  }
  return result
}

function splitSqlStatements(value: string) {
  const statements: string[] = []
  let start = 0
  let singleQuoted = false
  let doubleQuoted = false
  let lineComment = false
  let blockComment = false
  let dollarTag: string | null = null

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const next = value[index + 1]

    if (lineComment) {
      if (character === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (dollarTag) {
      if (value.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1
        dollarTag = null
      }
      continue
    }
    if (singleQuoted) {
      if (character === "'" && next === "'") {
        index += 1
      } else if (character === "'") {
        singleQuoted = false
      }
      continue
    }
    if (doubleQuoted) {
      if (character === '"' && next === '"') {
        index += 1
      } else if (character === '"') {
        doubleQuoted = false
      }
      continue
    }

    if (character === '-' && next === '-') {
      lineComment = true
      index += 1
      continue
    }
    if (character === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (character === "'") {
      singleQuoted = true
      continue
    }
    if (character === '"') {
      doubleQuoted = true
      continue
    }
    if (character === '$') {
      const tag = value.slice(index).match(/^\$[a-zA-Z0-9_]*\$/)?.[0]
      if (tag) {
        dollarTag = tag
        index += tag.length - 1
        continue
      }
    }
    if (character === ';') {
      statements.push(value.slice(start, index + 1))
      start = index + 1
    }
  }

  if (start < value.length) statements.push(value.slice(start))
  return statements
}

function findDdlStartOutsideQuotes(value: string) {
  const pattern = /\b(?:create\s+(?:(?:or\s+replace|constraint|materialized)\s+)*(?:table|function|trigger|view|type|extension|sequence)|drop\s+(?:table|function|trigger|materialized\s+view|view|type|extension|sequence)|alter\s+(?:type|extension|default\s+privileges)|grant|revoke)\b/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    if (isOutsideQuotes(value, match.index)) return match.index
  }
  return -1
}

function isOutsideQuotes(value: string, targetIndex: number) {
  let singleQuoted = false
  let doubleQuoted = false
  let dollarTag: string | null = null
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < targetIndex; index += 1) {
    const character = value[index]
    const next = value[index + 1]
    if (lineComment) {
      if (character === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (dollarTag) {
      if (value.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1
        dollarTag = null
      }
      continue
    }
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
    if (character === '-' && next === '-') {
      lineComment = true
      index += 1
    } else if (character === '/' && next === '*') {
      blockComment = true
      index += 1
    } else if (character === "'") singleQuoted = true
    else if (character === '"') doubleQuoted = true
    else if (character === '$') {
      const tag = value.slice(index).match(/^\$[a-zA-Z0-9_]*\$/)?.[0]
      if (tag) {
        dollarTag = tag
        index += tag.length - 1
      }
    }
  }
  return !singleQuoted && !doubleQuoted && !dollarTag && !lineComment && !blockComment
}

function splitTopLevelComma(value: string) {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let singleQuoted = false
  let doubleQuoted = false
  for (let index = 0; index < value.length; index += 1) {
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
    else if (character === '(' || character === '[') depth += 1
    else if (character === ')' || character === ']') depth = Math.max(0, depth - 1)
    else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

function parseSqlStringLiterals(value: string) {
  const labels: string[] = []
  const pattern = /'((?:''|[^'])*)'/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) labels.push((match[1] ?? '').replace(/''/g, "'"))
  return labels
}

function findCharacterOutsideQuotes(value: string, target: string, startIndex: number) {
  let singleQuoted = false
  let doubleQuoted = false
  let depth = 0
  for (let index = startIndex; index < value.length; index += 1) {
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
    else if (character === '(') {
      if (target === '(' && depth === 0) return index
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    } else if (character === target && depth === 0) {
      return index
    }
  }
  return -1
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

function findKeywordOutsideQuotes(value: string, keyword: string) {
  const pattern = new RegExp(`\\b${keyword}\\b`, 'gi')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    if (isOutsideQuotes(value, match.index)) return match.index
  }
  return -1
}

function readIdentifierToken(value: string) {
  const quoted = value.match(/^"(?:""|[^"])+"/)
  if (quoted?.[0]) return { token: quoted[0], end: quoted[0].length }
  const plain = value.match(/^[^\s]+/)
  return plain?.[0] ? { token: plain[0], end: plain[0].length } : null
}

function sortByKey<T extends { key: string }>(values: Iterable<T>) {
  return Array.from(values).sort((left, right) => left.key.localeCompare(right.key))
}
