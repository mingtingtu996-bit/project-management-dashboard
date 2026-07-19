import { Client } from 'pg'

import {
  COMMERCIAL_TRIGGER_API_ROLES,
  COMMERCIAL_TRIGGER_RPC_IDENTITIES,
  COMMERCIAL_TRIGGER_RUNTIME_ROLES,
  verifyCommercialTriggerRpcAclRemediationState,
  type CommercialTriggerRpcAclExpectedState,
  type CommercialTriggerRpcAclReadback,
} from '../services/commercialTriggerRpcAclRemediationService.js'
import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'

type AclQueryRow = {
  function_identity: string
  function_exists: boolean
  public_can_execute: boolean
  role_name: string
  role_exists: boolean
  role_can_execute: boolean
}

const expectedStateIndex = process.argv.indexOf('--expect')
const expectedState = process.argv[expectedStateIndex + 1] as CommercialTriggerRpcAclExpectedState | undefined
if (expectedState !== 'vulnerable' && expectedState !== 'hardened') {
  throw new Error('Usage: verify-commercial-trigger-rpc-acl --expect vulnerable|hardened')
}

const client = new Client(await resolveMigrationRuntimeConnectionConfig())
await client.connect()

try {
  const migrationLedger = await client.query<{ migration_applied: boolean }>(`
    SELECT EXISTS (
      SELECT 1
        FROM public.schema_migrations
       WHERE filename = '308_commercial_trigger_rpc_acl_closeout.sql'
    ) AS migration_applied
  `)
  const result = await client.query<AclQueryRow>(`
    WITH expected_functions(function_identity) AS (
      SELECT unnest($1::text[])
    ),
    expected_roles(role_name) AS (
      SELECT unnest($2::text[])
    )
    SELECT functions.function_identity,
           procedures.oid IS NOT NULL AS function_exists,
           CASE WHEN procedures.oid IS NULL THEN FALSE ELSE EXISTS (
             SELECT 1
               FROM aclexplode(COALESCE(procedures.proacl, acldefault('f', procedures.proowner))) acl
              WHERE acl.grantee = 0
                AND acl.privilege_type = 'EXECUTE'
           ) END AS public_can_execute,
           roles.role_name,
           database_roles.oid IS NOT NULL AS role_exists,
           CASE
             WHEN procedures.oid IS NULL OR database_roles.oid IS NULL THEN FALSE
             ELSE has_function_privilege(database_roles.oid, procedures.oid, 'EXECUTE')
           END AS role_can_execute
      FROM expected_functions functions
      CROSS JOIN expected_roles roles
      LEFT JOIN pg_proc procedures ON procedures.oid = to_regprocedure(functions.function_identity)
      LEFT JOIN pg_roles database_roles ON database_roles.rolname::text = roles.role_name
     ORDER BY functions.function_identity, roles.role_name
  `, [
    [...COMMERCIAL_TRIGGER_RPC_IDENTITIES],
    [...COMMERCIAL_TRIGGER_API_ROLES, ...COMMERCIAL_TRIGGER_RUNTIME_ROLES],
  ])

  const byIdentity = new Map<string, CommercialTriggerRpcAclReadback>()
  for (const row of result.rows) {
    const readback = byIdentity.get(row.function_identity) ?? {
      functionIdentity: row.function_identity,
      functionExists: row.function_exists,
      publicCanExecute: row.public_can_execute,
      roles: {},
    }
    readback.roles[row.role_name] = {
      exists: row.role_exists,
      canExecute: row.role_can_execute,
    }
    byIdentity.set(row.function_identity, readback)
  }

  console.log(JSON.stringify({
    status: 'commercial_trigger_rpc_acl_verified',
    ...verifyCommercialTriggerRpcAclRemediationState(
      [...byIdentity.values()],
      expectedState,
      migrationLedger.rows[0]?.migration_applied === true,
    ),
  }, null, 2))
} finally {
  await client.end()
}
