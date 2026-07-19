import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

function requiredText(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function projectRefFromSupabaseUrl(value) {
  let parsed
  try {
    parsed = new URL(requiredText(value, 'SUPABASE_URL'))
  } catch {
    throw new Error('SUPABASE_URL must be a valid URL')
  }
  const match = parsed.hostname.toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/u)
  if (!match) throw new Error('SUPABASE_URL must identify a Supabase project')
  return match[1]
}

export function verifyPublicReadyzIdentity({
  expectedProjectRef,
  expectedReleaseSha,
  expectedTarget,
  readiness,
}) {
  const projectRef = requiredText(expectedProjectRef, 'expected project ref').toLowerCase()
  const target = requiredText(expectedTarget, 'expected target')
  if (target !== 'production' && target !== 'staging') {
    throw new Error('expected target must be production or staging')
  }
  if (!readiness || typeof readiness !== 'object' || Array.isArray(readiness)) {
    throw new Error('readyz payload must be an object')
  }
  const build = readiness.build
  if (!build || typeof build !== 'object' || Array.isArray(build)) {
    throw new Error('readyz build identity is required')
  }
  const releaseSha = String(build.releaseSha ?? '').trim()
  if (readiness.status !== 'ready') throw new Error('readyz status is not ready')
  if (!/^[0-9a-f]{40}$/u.test(releaseSha)) throw new Error('readyz release SHA is invalid')
  if (expectedReleaseSha && releaseSha !== expectedReleaseSha) {
    throw new Error('readyz release SHA does not match the current release')
  }
  if (build.deployTarget !== target) throw new Error('readyz deploy target mismatch')
  if (build.supabaseProjectRef !== projectRef) throw new Error('readyz Supabase project mismatch')
  if (build.databaseProjectRef !== projectRef) throw new Error('readyz database project mismatch')
  return releaseSha
}

function run(argv, env) {
  const file = requiredText(option(argv, '--file'), '--file')
  const expectedTarget = requiredText(option(argv, '--expected-target'), '--expected-target')
  const expectedReleaseSha = option(argv, '--expected-release-sha')
  if (expectedReleaseSha && !/^[0-9a-f]{40}$/u.test(expectedReleaseSha)) {
    throw new Error('expected release SHA is invalid')
  }
  let readiness
  try {
    readiness = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new Error('readyz payload must be valid JSON')
  }
  return verifyPublicReadyzIdentity({
    expectedProjectRef: projectRefFromSupabaseUrl(env.SUPABASE_URL),
    expectedReleaseSha,
    expectedTarget,
    readiness,
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.stdout.write(`${run(process.argv.slice(2), process.env)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
