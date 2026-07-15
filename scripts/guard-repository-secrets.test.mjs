import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatSecretScanReport,
  scanTextForSecrets,
} from './guard-repository-secrets.mjs'

test('detects production-shaped credentials without returning the matched secret', () => {
  const databasePassword = ['N7', 'x!', 'qP', '4z', 'L9'].join('')
  const githubToken = `gh${'p'}_${'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY3zA5'}`
  const awsAccessKey = `AK${'IA'}${'1234567890ABCDEF'}`
  const privateKeyHeader = `-----BEGIN ${'PRIVATE'} KEY-----`
  const source = [
    `DATABASE_URL=postgresql://app:${databasePassword}@db.acme.supabase.co:5432/postgres`,
    `GITHUB_TOKEN=${githubToken}`,
    `AWS_ACCESS_KEY_ID=${awsAccessKey}`,
    privateKeyHeader,
  ].join('\n')

  const findings = scanTextForSecrets('config/runtime.env', source)

  assert.deepEqual(
    findings.map((finding) => finding.ruleId).sort(),
    ['aws-access-key', 'credentialed-database-url', 'github-token', 'private-key'].sort(),
  )
  assert.ok(findings.every((finding) => !('match' in finding)))

  const report = formatSecretScanReport(findings, 1)
  assert.doesNotMatch(report, new RegExp(databasePassword))
  assert.doesNotMatch(report, new RegExp(githubToken))
  assert.doesNotMatch(report, new RegExp(awsAccessKey))
})

test('detects a Supabase service-role JWT by decoded role', () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role', ref: 'fixture' })}.${'x'.repeat(48)}`

  const findings = scanTextForSecrets('runtime.json', JSON.stringify({ token }))

  assert.deepEqual(findings.map((finding) => finding.ruleId), ['supabase-service-role-jwt'])
  assert.doesNotMatch(formatSecretScanReport(findings, 1), new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('ignores placeholders, localhost credentials, redacted values, and source examples', () => {
  const source = [
    'DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres',
    'DATABASE_URL=postgresql://postgres:<PASSWORD>@db.example.supabase.co:5432/postgres',
    'DATABASE_URL=postgresql://postgres:[REDACTED]@db.example.supabase.co:5432/postgres',
    'DATABASE_URL=postgresql://postgres:${DATABASE_PASSWORD}@db.example.supabase.co:5432/postgres',
    'OPENAI_API_KEY=sk-example-not-a-real-key',
  ].join('\n')

  assert.deepEqual(scanTextForSecrets('server/.env.example', source), [])
})

test('deduplicates a single secret matched by more than one detector on the same line', () => {
  const token = `gh${'p'}_${'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY3zA5'}`
  const findings = scanTextForSecrets('config.env', `TOKEN=${token}\nTOKEN_AGAIN=${token}`)

  assert.equal(findings.length, 2)
  assert.deepEqual(findings.map((finding) => finding.line), [1, 2])
})
