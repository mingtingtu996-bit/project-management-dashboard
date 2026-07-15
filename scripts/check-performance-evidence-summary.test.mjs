import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSummaryUrl,
  evaluateSummary,
  formatEvaluation,
  parseArgs,
} from './check-performance-evidence-summary.mjs'

test('buildSummaryUrl derives the performance summary endpoint from a base url or health url', () => {
  assert.equal(
    buildSummaryUrl('http://127.0.0.1'),
    'http://127.0.0.1/api/performance-reports/summary',
  )
  assert.equal(
    buildSummaryUrl('http://127.0.0.1/api/readyz'),
    'http://127.0.0.1/api/performance-reports/summary',
  )
  assert.equal(
    buildSummaryUrl('https://example.com/api/performance-reports/summary'),
    'https://example.com/api/performance-reports/summary',
  )
})

test('parseArgs accepts strict gate options for online regression checks', () => {
  const options = parseArgs([
    '--url',
    'https://example.com',
    '--fail-on-watch',
    '--disallow-insufficient',
    '--max-threshold-exceeded',
    '0',
    '--timeout-ms',
    '1500',
  ], {})

  assert.equal(options.url, 'https://example.com/api/performance-reports/summary')
  assert.equal(options.failOnWatch, true)
  assert.equal(options.allowInsufficient, false)
  assert.equal(options.maxThresholdExceeded, 0)
  assert.equal(options.timeoutMs, 1500)
})

test('evaluateSummary passes insufficient data by default but can enforce strict evidence', () => {
  const payload = {
    success: true,
    data: {
      window: { retainedReports: 0, thresholdExceeded: 0 },
      releaseGate: {
        status: 'insufficient_data',
        reasons: ['no data'],
      },
      recommendations: ['collect evidence'],
    },
  }

  assert.equal(evaluateSummary(payload, { allowInsufficient: true }).ok, true)
  const strict = evaluateSummary(payload, { allowInsufficient: false })
  assert.equal(strict.ok, false)
  assert.deepEqual(strict.failures, ['Insufficient data is configured as failure.'])
})

test('evaluateSummary fails hard failures and optional watch thresholds', () => {
  const failed = evaluateSummary({
    data: {
      window: { retainedReports: 4, thresholdExceeded: 2 },
      releaseGate: { status: 'fail', reasons: ['slow api'] },
      topSlowApis: [{ key: 'GET /api/projects/:id/bootstrap', samples: 2, p95: 2600, thresholdExceeded: 2 }],
    },
  }, {})

  assert.equal(failed.ok, false)
  assert.equal(failed.gateStatus, 'fail')
  assert.equal(failed.failures[0], 'Performance release gate is fail.')

  const watch = evaluateSummary({
    data: {
      window: { retainedReports: 3, thresholdExceeded: 1 },
      releaseGate: { status: 'watch', reasons: ['one slow route'] },
    },
  }, { failOnWatch: true, maxThresholdExceeded: 0 })

  assert.equal(watch.ok, false)
  assert.equal(watch.failures.includes('Watch gate is configured as failure.'), true)
  assert.equal(watch.failures.includes('Threshold exceeded count 1 is above limit 0.'), true)
})

test('formatEvaluation prints a compact machine-readable result line', () => {
  const output = formatEvaluation({
    ok: true,
    gateStatus: 'pass',
    thresholdExceeded: 0,
    retainedReports: 5,
    failures: [],
    warnings: [],
    reasons: [],
    recommendations: ['keep watching'],
    topSlowApis: [],
    topSlowRoutes: [],
  }, 'https://example.com/api/performance-reports/summary')

  assert.match(output, /Gate: pass/)
  assert.match(output, /Result: PASS/)
})
