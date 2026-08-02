import { Client } from 'pg'

import {
  readSecurityAdvisorFunctionHardeningState,
  verifySecurityAdvisorFunctionHardeningRemediationState,
  type SecurityAdvisorFunctionHardeningExpectedState,
} from '../services/securityAdvisorFunctionHardeningService.js'
import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'

const expectedStateIndex = process.argv.indexOf('--expect')
const expectedState = process.argv[expectedStateIndex + 1] as
  | SecurityAdvisorFunctionHardeningExpectedState
  | undefined
if (expectedState !== 'pending' && expectedState !== 'hardened') {
  throw new Error('Usage: verify-security-advisor-function-hardening --expect pending|hardened')
}

const client = new Client(await resolveMigrationRuntimeConnectionConfig())
await client.connect()

try {
  const migrationLedger = await client.query<{ migration_applied: boolean }>(`
    SELECT EXISTS (
      SELECT 1
        FROM public.schema_migrations
       WHERE filename = '334_security_advisor_function_hardening.sql'
    ) AS migration_applied
  `)
  const readbacks = await readSecurityAdvisorFunctionHardeningState(client)

  console.log(JSON.stringify({
    status: 'security_advisor_function_hardening_verified',
    ...verifySecurityAdvisorFunctionHardeningRemediationState(
      readbacks,
      expectedState,
      migrationLedger.rows[0]?.migration_applied === true,
    ),
  }, null, 2))
} finally {
  await client.end()
}
