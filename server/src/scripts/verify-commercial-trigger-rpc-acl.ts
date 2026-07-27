import { Client } from 'pg'

import {
  readCommercialTriggerRpcAclState,
  verifyCommercialTriggerRpcAclRemediationState,
  type CommercialTriggerRpcAclExpectedState,
} from '../services/commercialTriggerRpcAclRemediationService.js'
import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'

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
  const readbacks = await readCommercialTriggerRpcAclState(client)

  console.log(JSON.stringify({
    status: 'commercial_trigger_rpc_acl_verified',
    ...verifyCommercialTriggerRpcAclRemediationState(
      readbacks,
      expectedState,
      migrationLedger.rows[0]?.migration_applied === true,
    ),
  }, null, 2))
} finally {
  await client.end()
}
