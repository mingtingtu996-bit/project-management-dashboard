import {
  normalizeViewOptions,
} from './schemaDriftExtendedObjectService.js'
import type {
  SchemaDriftEnum,
  SchemaDriftExtendedCatalog,
  SchemaDriftFunction,
  SchemaDriftGrant,
  SchemaDriftGrantObjectType,
  SchemaDriftTrigger,
} from './schemaDriftExtendedObjectService.js'

export type TriggerCatalogRow = {
  schema_name: string
  table_name: string
  trigger_name: string
  timing: string
  event: string
  orientation: string
  condition: string | null
  action_statement: string
}

export type FunctionCatalogRow = {
  schema_name: string
  function_name: string
  identity_arguments: string
  result_type: string
  language: string
  security_definer: boolean
  volatility: 'i' | 's' | 'v'
  body: string
}

export type ViewCatalogRow = {
  schema_name: string
  view_name: string
  materialized: boolean
  definition: string
  reloptions?: string[] | null
}

export type EnumCatalogRow = {
  schema_name: string
  enum_name: string
  label: string
  sort_order: number
}

export type ExtensionCatalogRow = {
  extension_name: string
  schema_name: string
}

export type GrantCatalogRow = {
  object_type: SchemaDriftGrantObjectType
  schema_name: string
  object_name: string
  identity_arguments: string | null
  grantee: string
  privilege: string
}

export type SchemaDriftExtendedIntrospectionRows = {
  triggers: TriggerCatalogRow[]
  functions: FunctionCatalogRow[]
  views: ViewCatalogRow[]
  enums: EnumCatalogRow[]
  extensions: ExtensionCatalogRow[]
  grants: GrantCatalogRow[]
}

export type SchemaDriftCatalogQueryClient = {
  query: <T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: T[] }>
}

export async function introspectActualExtendedSchema(
  client: SchemaDriftCatalogQueryClient,
  options: {
    schemas: string[]
    extensionNames: string[]
  },
): Promise<SchemaDriftExtendedCatalog> {
  const triggers = await client.query<TriggerCatalogRow>(`
      SELECT event_object_schema AS schema_name,
             event_object_table AS table_name,
             trigger_name,
             action_timing AS timing,
             event_manipulation AS event,
             action_orientation AS orientation,
             action_condition AS condition,
             action_statement
      FROM information_schema.triggers
      WHERE event_object_schema = ANY($1::text[])
      ORDER BY event_object_schema, event_object_table, trigger_name, event_manipulation
    `, [options.schemas])
  const functions = await client.query<FunctionCatalogRow>(`
      SELECT namespace.nspname AS schema_name,
             procedure.proname AS function_name,
             oidvectortypes(procedure.proargtypes) AS identity_arguments,
             pg_get_function_result(procedure.oid) AS result_type,
             language.lanname AS language,
             procedure.prosecdef AS security_definer,
             procedure.provolatile AS volatility,
             procedure.prosrc AS body
      FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      JOIN pg_language language ON language.oid = procedure.prolang
      WHERE namespace.nspname = ANY($1::text[])
        AND procedure.prokind = 'f'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_depend dependency
          WHERE dependency.classid = 'pg_proc'::regclass
            AND dependency.objid = procedure.oid
            AND dependency.deptype = 'e'
        )
      ORDER BY namespace.nspname, procedure.proname, oidvectortypes(procedure.proargtypes)
    `, [options.schemas])
  const views = await client.query<ViewCatalogRow>(`
      SELECT namespace.nspname AS schema_name,
             relation.relname AS view_name,
             relation.relkind = 'm' AS materialized,
             relation.reloptions,
             pg_get_viewdef(relation.oid, TRUE) AS definition
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = ANY($1::text[])
        AND relation.relkind IN ('v', 'm')
      ORDER BY namespace.nspname, relation.relname
    `, [options.schemas])
  const enums = await client.query<EnumCatalogRow>(`
      SELECT namespace.nspname AS schema_name,
             type.typname AS enum_name,
             enum.enumlabel AS label,
             enum.enumsortorder AS sort_order
      FROM pg_type type
      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
      JOIN pg_enum enum ON enum.enumtypid = type.oid
      WHERE namespace.nspname = ANY($1::text[])
      ORDER BY namespace.nspname, type.typname, enum.enumsortorder
    `, [options.schemas])
  const extensions = await client.query<ExtensionCatalogRow>(`
      SELECT extension.extname AS extension_name,
             namespace.nspname AS schema_name
      FROM pg_extension extension
      JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
      WHERE extension.extname = ANY($1::text[])
      ORDER BY extension.extname
    `, [options.extensionNames])
  const grants = await client.query<GrantCatalogRow>(`
      SELECT CASE WHEN relation.relkind = 'S' THEN 'sequence' ELSE 'table' END AS object_type,
             namespace.nspname AS schema_name,
             relation.relname AS object_name,
             NULL::text AS identity_arguments,
             CASE WHEN acl.grantee = 0 THEN 'public' ELSE grantee_role.rolname END AS grantee,
             acl.privilege_type AS privilege
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(
        relation.relacl,
        acldefault(
          CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
          relation.relowner
        )
      )) acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
      WHERE namespace.nspname = ANY($1::text[])
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')

      UNION ALL

      SELECT 'function' AS object_type,
             namespace.nspname AS schema_name,
             procedure.proname AS object_name,
             oidvectortypes(procedure.proargtypes) AS identity_arguments,
             CASE WHEN acl.grantee = 0 THEN 'public' ELSE grantee_role.rolname END AS grantee,
             acl.privilege_type AS privilege
      FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(
        procedure.proacl,
        acldefault('f'::"char", procedure.proowner)
      )) acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
      WHERE namespace.nspname = ANY($1::text[])
        AND procedure.prokind = 'f'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_depend dependency
          WHERE dependency.classid = 'pg_proc'::regclass
            AND dependency.objid = procedure.oid
            AND dependency.deptype = 'e'
        )

      UNION ALL

      SELECT 'schema' AS object_type,
             namespace.nspname AS schema_name,
             namespace.nspname AS object_name,
             NULL::text AS identity_arguments,
             CASE WHEN acl.grantee = 0 THEN 'public' ELSE grantee_role.rolname END AS grantee,
             acl.privilege_type AS privilege
      FROM pg_namespace namespace
      CROSS JOIN LATERAL aclexplode(COALESCE(
        namespace.nspacl,
        acldefault('n'::"char", namespace.nspowner)
      )) acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
      WHERE namespace.nspname = ANY($1::text[])

      UNION ALL

      SELECT CASE default_acl.defaclobjtype
               WHEN 'r' THEN 'default_table'
               WHEN 'S' THEN 'default_sequence'
               WHEN 'f' THEN 'default_function'
             END AS object_type,
             namespace.nspname AS schema_name,
             '*' AS object_name,
             NULL::text AS identity_arguments,
             CASE WHEN acl.grantee = 0 THEN 'public' ELSE grantee_role.rolname END AS grantee,
             acl.privilege_type AS privilege
      FROM pg_default_acl default_acl
      JOIN pg_namespace namespace ON namespace.oid = default_acl.defaclnamespace
      CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
      WHERE namespace.nspname = ANY($1::text[])
        AND default_acl.defaclobjtype IN ('r', 'S', 'f')

      ORDER BY schema_name, object_type, object_name, identity_arguments, grantee, privilege
    `, [options.schemas])

  return buildActualExtendedSchemaCatalog({
    triggers: triggers.rows,
    functions: functions.rows,
    views: views.rows,
    enums: enums.rows,
    extensions: extensions.rows,
    grants: grants.rows,
  })
}

export function buildActualExtendedSchemaCatalog(
  rows: SchemaDriftExtendedIntrospectionRows,
): SchemaDriftExtendedCatalog {
  const triggers = new Map<string, SchemaDriftTrigger>()
  for (const row of rows.triggers) {
    const schemaName = normalizeIdentifier(row.schema_name)
    const tableName = normalizeIdentifier(row.table_name)
    const triggerName = normalizeIdentifier(row.trigger_name)
    const key = `${schemaName}.${tableName}.${triggerName}`
    const existing = triggers.get(key)
    const functionName = parseTriggerFunctionName(row.action_statement)
    const event = normalizeIdentifier(row.event)
    if (existing) {
      existing.events = Array.from(new Set([...existing.events, event])).sort()
    } else {
      triggers.set(key, {
        key,
        schemaName,
        tableName,
        triggerName,
        functionName,
        timing: normalizeWhitespace(row.timing).toLowerCase(),
        events: [event],
        orientation: normalizeIdentifier(row.orientation),
        condition: row.condition,
      })
    }
  }

  const functions: SchemaDriftFunction[] = rows.functions.map((row) => {
    const schemaName = normalizeIdentifier(row.schema_name)
    const functionName = normalizeIdentifier(row.function_name)
    const identityArguments = normalizeIdentityArguments(row.identity_arguments)
    return {
      key: `${schemaName}.${functionName}(${identityArguments})`,
      schemaName,
      functionName,
      identityArguments,
      resultType: row.result_type,
      language: row.language,
      securityDefiner: row.security_definer,
      volatility: row.volatility === 'i' ? 'immutable' : row.volatility === 's' ? 'stable' : 'volatile',
      body: row.body,
    }
  })

  const enumMap = new Map<string, SchemaDriftEnum>()
  for (const row of [...rows.enums].sort((left, right) => left.sort_order - right.sort_order)) {
    const schemaName = normalizeIdentifier(row.schema_name)
    const enumName = normalizeIdentifier(row.enum_name)
    const key = `${schemaName}.${enumName}`
    const current = enumMap.get(key) ?? { key, schemaName, enumName, labels: [] }
    current.labels.push(row.label)
    enumMap.set(key, current)
  }

  const grants: SchemaDriftGrant[] = rows.grants.map((row) => {
    const objectType = row.object_type
    const schemaName = normalizeIdentifier(row.schema_name)
    const rawObjectName = normalizeIdentifier(row.object_name)
    const identityArguments = normalizeIdentityArguments(row.identity_arguments ?? '')
    const objectName = objectType === 'function'
      ? `${schemaName}.${rawObjectName}(${identityArguments})`
      : objectType === 'schema'
        ? rawObjectName
        : objectType.startsWith('default_')
          ? `${schemaName}.*`
          : `${schemaName}.${rawObjectName}`
    const grantee = normalizeIdentifier(row.grantee)
    const privilege = normalizeIdentifier(row.privilege)
    const key = `${objectType}:${objectName}:${grantee}:${privilege}`
    return {
      key,
      objectType,
      schemaName,
      objectName,
      grantee,
      privilege,
      allowed: true,
    }
  })

  return {
    triggers: sortByKey(triggers.values()),
    functions: sortByKey(functions),
    views: sortByKey(rows.views.map((row) => {
      const schemaName = normalizeIdentifier(row.schema_name)
      const viewName = normalizeIdentifier(row.view_name)
      return {
        key: `${schemaName}.${viewName}`,
        schemaName,
        viewName,
        materialized: row.materialized,
        definition: row.definition,
        options: normalizeViewOptions((row.reloptions ?? []).join(', ')),
      }
    })),
    enums: sortByKey(enumMap.values()),
    extensions: sortByKey(rows.extensions.map((row) => ({
      key: normalizeIdentifier(row.extension_name),
      extensionName: normalizeIdentifier(row.extension_name),
      schemaName: normalizeIdentifier(row.schema_name),
    }))),
    grants: sortByKey(grants),
  }
}

function parseTriggerFunctionName(value: string) {
  const match = value.match(/\bexecute\s+(?:function|procedure)\s+(?<name>[^\s(]+)/i)
  const rawName = match?.groups?.name ?? ''
  const parts = rawName.replace(/"/g, '').split('.').filter(Boolean).map(normalizeIdentifier)
  if (parts.length === 1) return `public.${parts[0]}`
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
}

function normalizeIdentityArguments(value: string) {
  return value
    .split(',')
    .map((item) => normalizeWhitespace(item).replace(/\bpublic\./gi, '').toLowerCase())
    .filter(Boolean)
    .join(', ')
}

function normalizeIdentifier(value: string) {
  return value.trim().replace(/^"|"$/g, '').toLowerCase()
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function sortByKey<T extends { key: string }>(values: Iterable<T>) {
  return Array.from(values).sort((left, right) => left.key.localeCompare(right.key))
}
