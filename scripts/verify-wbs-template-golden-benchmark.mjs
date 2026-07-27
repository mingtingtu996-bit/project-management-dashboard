#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const serverRequire = createRequire(resolve(repoRoot, 'server/package.json'))
const tsxCliPath = serverRequire.resolve('tsx/cli')
const outputPath = resolve(repoRoot, 'artifacts/reports/wbs-template-golden-benchmark-verification.json')
const runtimeOutputPath = resolve(repoRoot, 'artifacts/reports/wbs-template-golden-benchmark-runtime-results.json')
const userArgs = process.argv.slice(2)
const replayRuntime = userArgs.includes('--replay')
const runtimeResultPathArg = userArgs.find((arg) => arg && arg !== '--replay')
const runtimeResultArg = runtimeResultPathArg ? resolve(process.cwd(), runtimeResultPathArg) : null

function runTsxJson(source) {
  const result = spawnSync(process.execPath, [tsxCliPath, '-e', source], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    throw new Error(`tsx helper failed with exit code ${result.status}`)
  }

  const text = String(result.stdout ?? '').trim()
  if (!text) throw new Error('tsx helper returned empty stdout')
  return JSON.parse(text)
}

if (runtimeResultArg && !existsSync(runtimeResultArg)) {
  process.stderr.write(JSON.stringify({
    status: 'fail',
    findings: [{
      code: 'runtime_result_file_missing',
      message: `Runtime benchmark result file does not exist: ${runtimeResultArg}`,
      severity: 'error',
    }],
  }, null, 2))
  process.exit(1)
}

const runtimeResultPathJson = JSON.stringify(runtimeResultArg)

const envelope = runTsxJson(`
  import { readFileSync } from 'node:fs'
  import {
    evaluateWbsTemplateGoldenBenchmarkRunGate,
    evaluateWbsTemplateGoldenBenchmarkStaticGate,
  } from './server/src/services/wbsTemplateGoldenBenchmarkGateService.ts'
  import { runWbsTemplateGoldenBenchmarkReplay } from './server/src/services/wbsTemplateGoldenBenchmarkReplayService.ts'

  const runtimeResultPath = ${runtimeResultPathJson}
  const replayRuntime = ${JSON.stringify(replayRuntime)}
  async function main() {
    const staticGate = evaluateWbsTemplateGoldenBenchmarkStaticGate()
    const runtimeResults = runtimeResultPath
      ? JSON.parse(readFileSync(runtimeResultPath, 'utf8'))
      : replayRuntime
        ? await runWbsTemplateGoldenBenchmarkReplay()
        : null
    const runtimeGate = runtimeResults
      ? evaluateWbsTemplateGoldenBenchmarkRunGate(runtimeResults)
      : null
    const findings = [
      ...staticGate.findings.map((finding) => ({ ...finding, gate: 'static' })),
      ...((runtimeGate?.findings ?? []).map((finding) => ({ ...finding, gate: 'runtime' }))),
    ]
    const verification = {
      status: findings.length > 0 ? 'fail' : 'pass',
      staticGate,
      runtimeGate,
      findings,
    }
    console.log(JSON.stringify({
      verification,
      runtimeResults: replayRuntime ? runtimeResults : null,
    }))
  }

  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
`)

const verification = envelope.verification
if (!verification || typeof verification !== 'object') {
  throw new Error('tsx helper returned an invalid verification envelope')
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(verification, null, 2)}\n`, 'utf8')
if (replayRuntime && Array.isArray(envelope.runtimeResults)) {
  mkdirSync(dirname(runtimeOutputPath), { recursive: true })
  writeFileSync(runtimeOutputPath, `${JSON.stringify(envelope.runtimeResults, null, 2)}\n`, 'utf8')
}

if (verification.status === 'fail') {
  process.stderr.write(`${JSON.stringify(verification, null, 2)}\n`)
  process.exit(1)
}

process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`)
