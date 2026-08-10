import process from 'node:process'

import { verifyWizardDiagnosticCleanupConnection } from './wizard-diagnostic-project-cleanup.mjs'

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      values.set(key, 'true')
      continue
    }
    values.set(key, next)
    index += 1
  }
  return values
}

function requireValue(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

const args = parseArgs(process.argv.slice(2))
const result = await verifyWizardDiagnosticCleanupConnection({
  connectionString: requireValue(
    process.env.WORKBUDDY_DIAGNOSTIC_CLEANUP_DATABASE_URL,
    'WORKBUDDY_DIAGNOSTIC_CLEANUP_DATABASE_URL',
  ),
  expectedProjectRef: requireValue(args.get('expected-project-ref'), 'expected-project-ref'),
  tlsCaCertificate: requireValue(
    process.env.WORKBUDDY_DIAGNOSTIC_CLEANUP_TLS_CA_CERT,
    'WORKBUDDY_DIAGNOSTIC_CLEANUP_TLS_CA_CERT',
  ),
})

process.stdout.write(`${JSON.stringify(result)}\n`)
