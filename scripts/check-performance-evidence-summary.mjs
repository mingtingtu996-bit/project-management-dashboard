import { fileURLToPath } from 'node:url'

const SUMMARY_PATH = '/api/performance-reports/summary'

export function buildSummaryUrl(input) {
  const text = String(input ?? '').trim()
  if (!text) {
    throw new Error('Missing summary URL. Use --url or PERFORMANCE_EVIDENCE_SUMMARY_URL.')
  }

  const url = new URL(text)
  if (url.pathname.endsWith('/api/readyz')) {
    url.pathname = url.pathname.slice(0, -'/api/readyz'.length) + SUMMARY_PATH
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  if (!url.pathname.endsWith('/summary') && !url.pathname.endsWith(SUMMARY_PATH)) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}${SUMMARY_PATH}`
    url.search = ''
    url.hash = ''
  }

  return url.toString()
}

export function parseArgs(argv, env = process.env) {
  const options = {
    url: env.PERFORMANCE_EVIDENCE_SUMMARY_URL || env.PERFORMANCE_SUMMARY_URL || '',
    allowInsufficient: env.PERFORMANCE_EVIDENCE_ALLOW_INSUFFICIENT !== 'false',
    failOnWatch: env.PERFORMANCE_EVIDENCE_FAIL_ON_WATCH === 'true',
    maxThresholdExceeded: Number.POSITIVE_INFINITY,
    timeoutMs: 8000,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]

    if (arg === '--url' || arg === '--base-url') {
      if (!value) throw new Error(`${arg} requires a value`)
      options.url = value
      index += 1
      continue
    }

    if (arg === '--allow-insufficient') {
      options.allowInsufficient = true
      continue
    }

    if (arg === '--disallow-insufficient') {
      options.allowInsufficient = false
      continue
    }

    if (arg === '--fail-on-watch') {
      options.failOnWatch = true
      continue
    }

    if (arg === '--max-threshold-exceeded') {
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${arg} requires a non-negative number`)
      options.maxThresholdExceeded = parsed
      index += 1
      continue
    }

    if (arg === '--timeout-ms') {
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${arg} requires a positive number`)
      options.timeoutMs = parsed
      index += 1
      continue
    }

    if (!arg.startsWith('--') && !options.url) {
      options.url = arg
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  options.url = buildSummaryUrl(options.url)
  return options
}

function unwrapSummary(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data
  }
  return payload
}

function readGateStatus(summary) {
  const status = summary?.releaseGate?.status
  return typeof status === 'string' ? status : 'unknown'
}

export function evaluateSummary(payload, options = {}) {
  const summary = unwrapSummary(payload)
  const gateStatus = readGateStatus(summary)
  const thresholdExceeded = Number(summary?.window?.thresholdExceeded ?? 0)
  const reasons = Array.isArray(summary?.releaseGate?.reasons) ? summary.releaseGate.reasons : []
  const recommendations = Array.isArray(summary?.recommendations) ? summary.recommendations : []
  const failures = []
  const warnings = []

  if (!summary || typeof summary !== 'object') {
    failures.push('Performance evidence summary payload is missing or malformed.')
  }

  if (gateStatus === 'fail') {
    failures.push('Performance release gate is fail.')
  } else if (gateStatus === 'watch') {
    warnings.push('Performance release gate is watch.')
    if (options.failOnWatch) failures.push('Watch gate is configured as failure.')
  } else if (gateStatus === 'insufficient_data') {
    warnings.push('Performance evidence is insufficient.')
    if (!options.allowInsufficient) failures.push('Insufficient data is configured as failure.')
  } else if (gateStatus !== 'pass') {
    failures.push(`Unknown performance release gate: ${gateStatus}`)
  }

  if (thresholdExceeded > (options.maxThresholdExceeded ?? Number.POSITIVE_INFINITY)) {
    failures.push(`Threshold exceeded count ${thresholdExceeded} is above limit ${options.maxThresholdExceeded}.`)
  }

  return {
    ok: failures.length === 0,
    gateStatus,
    thresholdExceeded,
    retainedReports: Number(summary?.window?.retainedReports ?? 0),
    failures,
    warnings,
    reasons,
    recommendations,
    topSlowApis: Array.isArray(summary?.topSlowApis) ? summary.topSlowApis : [],
    topSlowRoutes: Array.isArray(summary?.topSlowRoutes) ? summary.topSlowRoutes : [],
  }
}

function formatTopItems(label, items) {
  const lines = [`${label}:`]
  if (items.length === 0) {
    lines.push('  - none')
    return lines
  }

  for (const item of items.slice(0, 3)) {
    lines.push(`  - ${item.key}: samples=${item.samples}, p95=${item.p95}, exceeded=${item.thresholdExceeded}`)
  }
  return lines
}

export function formatEvaluation(evaluation, url) {
  const lines = [
    'Performance evidence summary check',
    `URL: ${url}`,
    `Gate: ${evaluation.gateStatus}`,
    `Reports: ${evaluation.retainedReports}`,
    `Threshold exceeded: ${evaluation.thresholdExceeded}`,
    ...formatTopItems('Top slow APIs', evaluation.topSlowApis),
    ...formatTopItems('Top slow routes', evaluation.topSlowRoutes),
  ]

  if (evaluation.reasons.length > 0) {
    lines.push('Gate reasons:')
    for (const reason of evaluation.reasons) lines.push(`  - ${reason}`)
  }

  if (evaluation.recommendations.length > 0) {
    lines.push('Recommendations:')
    for (const recommendation of evaluation.recommendations) lines.push(`  - ${recommendation}`)
  }

  if (evaluation.warnings.length > 0) {
    lines.push('Warnings:')
    for (const warning of evaluation.warnings) lines.push(`  - ${warning}`)
  }

  if (evaluation.failures.length > 0) {
    lines.push('Failures:')
    for (const failure of evaluation.failures) lines.push(`  - ${failure}`)
  }

  lines.push(`Result: ${evaluation.ok ? 'PASS' : 'FAIL'}`)
  return lines.join('\n')
}

async function fetchSummary(url, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Summary endpoint returned HTTP ${response.status}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv, env)
  const payload = await fetchSummary(options.url, options.timeoutMs)
  const evaluation = evaluateSummary(payload, options)
  console.log(formatEvaluation(evaluation, options.url))
  return evaluation.ok ? 0 : 1
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isCli) {
  run().then((exitCode) => {
    process.exitCode = exitCode
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
