#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tsxCliPath = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs')
const defaultRuntimeOutputPath = resolve(repoRoot, 'artifacts/reports/wbs-template-golden-benchmark-runtime-results.json')
const userArgs = process.argv.slice(2)

function readListArg(names) {
  const values = []
  for (let index = 0; index < userArgs.length; index += 1) {
    const arg = userArgs[index]
    for (const name of names) {
      if (arg === name && userArgs[index + 1]) {
        values.push(userArgs[index + 1])
      } else if (arg.startsWith(`${name}=`)) {
        values.push(arg.slice(name.length + 1))
      }
    }
  }
  return values
    .flatMap((value) => String(value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

function readStringArg(name) {
  for (let index = 0; index < userArgs.length; index += 1) {
    const arg = userArgs[index]
    if (arg === name && userArgs[index + 1]) return userArgs[index + 1]
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
  }
  return null
}

function filterOutputPath(projectCodes, recommendationKeys) {
  const filterKey = [...projectCodes, ...recommendationKeys]
    .join('-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
  return resolve(
    repoRoot,
    `artifacts/reports/wbs-template-golden-benchmark-runtime-results-${filterKey || 'filtered'}.json`,
  )
}

const projectCodes = readListArg(['--project-code', '--project-codes'])
const recommendationKeys = readListArg(['--recommendation-key', '--recommendation-keys'])
const outputArg = readStringArg('--output')
const durationMode = readStringArg('--duration-mode')
if (durationMode && !['fast_template', 'full', 'benchmark_plan_reference'].includes(durationMode)) {
  process.stderr.write(`Unsupported --duration-mode: ${durationMode}\n`)
  process.exit(1)
}
const emitGenerationStageTimings = userArgs.includes('--stage-timings')
const hasFilter = projectCodes.length > 0 || recommendationKeys.length > 0
const runtimeOutputPath = outputArg
  ? resolve(process.cwd(), outputArg)
  : hasFilter
    ? filterOutputPath(projectCodes, recommendationKeys)
    : defaultRuntimeOutputPath

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

const runtimeResults = runTsxJson(`
  import { runWbsTemplateGoldenBenchmarkReplay } from './server/src/services/wbsTemplateGoldenBenchmarkReplayService.ts'

  async function main() {
    const results = await runWbsTemplateGoldenBenchmarkReplay({
      projectCodes: ${JSON.stringify(projectCodes)},
      recommendationKeys: ${JSON.stringify(recommendationKeys)},
      diagnosticDurationSuggestionMode: ${JSON.stringify(durationMode)},
      emitGenerationStageTimings: ${JSON.stringify(emitGenerationStageTimings)},
    })
    console.log(JSON.stringify(results))
  }

  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
`)

mkdirSync(dirname(runtimeOutputPath), { recursive: true })
writeFileSync(runtimeOutputPath, `${JSON.stringify(runtimeResults, null, 2)}\n`, 'utf8')

const summary = {
  status: 'pass',
  outputPath: runtimeOutputPath,
  resultCount: Array.isArray(runtimeResults) ? runtimeResults.length : 0,
  filters: {
    projectCodes,
    recommendationKeys,
    durationMode: durationMode ?? 'benchmark_plan_reference',
    stageTimings: emitGenerationStageTimings,
  },
  totalActualGeneratedRows: Array.isArray(runtimeResults)
    ? runtimeResults.reduce((total, result) => total + Number(result.actualGeneratedRowCount ?? 0), 0)
    : 0,
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
