import { Client } from 'pg'

import {
  readSecurityAdvisorRetirementStateRls,
  verifySecurityAdvisorRetirementStateRls,
} from '../services/securityAdvisorRetirementStateRlsService.js'
import { resolveMigrationRuntimeConnectionConfig } from '../services/migrationRunner.js'

const expectedStateIndex = process.argv.indexOf('--expect')
const expectedState = process.argv[expectedStateIndex + 1]
if (expectedState !== 'hardened') {
  throw new Error('Usage: verify-security-advisor-retirement-state-rls --expect hardened')
}

const client = new Client(await resolveMigrationRuntimeConnectionConfig())
await client.connect()

try {
  const migrationLedger = await client.query<{ migration_applied: boolean }>(`
    SELECT EXISTS (
      SELECT 1
        FROM public.schema_migrations
       WHERE filename = '335_duration_learning_retirement_state_rls_policy.sql'
    ) AS migration_applied
  `)
  const result = verifySecurityAdvisorRetirementStateRls(
    await readSecurityAdvisorRetirementStateRls(client),
    'hardened',
    migrationLedger.rows[0]?.migration_applied === true,
  )
  console.log(JSON.stringify({
    status: 'security_advisor_retirement_state_rls_verified',
    ...result,
  }, null, 2))
} finally {
  await client.end()
}
