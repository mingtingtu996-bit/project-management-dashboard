import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildProbeEnvText,
  buildStrictServerEnv,
  strictRuntimeSummary,
} from './run-v14241-strict-local-readonly-support-probes.mjs'

test('strict local server env overrides local permission bypass and fallback flags', () => {
  const env = buildStrictServerEnv({
    baseEnv: {
      Path: 'C:\\Tools',
      NODE_ENV: 'development',
      DISABLE_PERMISSION_SYSTEM: 'true',
      AUTH_ALLOW_DEV_FALLBACK_USER: 'true',
      AUTH_ALLOW_TEST_FALLBACK_USER: 'true',
    },
    envFileEnv: {
      DISABLE_PERMISSION_SYSTEM: 'true',
      AUTH_ALLOW_DEV_FALLBACK_USER: 'true',
      AUTH_ALLOW_TEST_FALLBACK_USER: 'true',
    },
    host: '127.0.0.1',
    port: '3999',
  })

  assert.equal(env.NODE_ENV, 'production')
  assert.equal(env.DISABLE_PERMISSION_SYSTEM, 'false')
  assert.equal(env.AUTH_ALLOW_DEV_FALLBACK_USER, 'false')
  assert.equal(env.AUTH_ALLOW_TEST_FALLBACK_USER, 'false')
  assert.equal(env.SKIP_SCHEDULER_BOOT, 'true')
  assert.equal(env.SKIP_DATABASE_VALIDATE, 'true')
  assert.equal(env.PORT, '3999')
  assert.equal(env.Path, 'C:\\Tools')
  assert.equal(Object.keys(env).filter((key) => key.toLowerCase() === 'path').length, 1)
})

test('probe env keeps only target URLs and credential keys needed by the delegated read-only probe', () => {
  const text = buildProbeEnvText({
    apiBaseUrl: 'http://127.0.0.1:3999',
    clientBaseUrl: 'http://127.0.0.1:5173',
    sourceEnv: {
      TEST_USER_EMAIL: 'qa@example.test',
      TEST_USER_PASSWORD: 'secret-not-in-report',
      DATABASE_URL: 'postgres://must-not-copy',
    },
  })

  assert.match(text, /API_BASE_URL=http:\/\/127\.0\.0\.1:3999/)
  assert.match(text, /CLIENT_BASE_URL=http:\/\/127\.0\.0\.1:5173/)
  assert.match(text, /TEST_USER_EMAIL=qa@example\.test/)
  assert.match(text, /TEST_USER_PASSWORD=secret-not-in-report/)
  assert.equal(text.includes('DATABASE_URL='), false)
})

test('strict runtime summary is sanitized and support-only', () => {
  const summary = strictRuntimeSummary({ host: '127.0.0.1', port: '3999' })
  const text = JSON.stringify(summary)

  assert.equal(summary.strictAuth.disablePermissionSystem, 'false')
  assert.equal(summary.strictAuth.allowDevFallbackUser, 'false')
  assert.equal(summary.strictAuth.allowTestFallbackUser, 'false')
  assert.equal(summary.mutationBoundary.includes('read-only HTTP probes'), true)
  assert.equal(/password=|postgres:\/\//i.test(text), false)
})
