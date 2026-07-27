#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const serverRoot = join(repoRoot, 'server')
const serverSrcRoot = join(serverRoot, 'src')
const vitestConfigPath = join(serverRoot, 'vitest.config.ts')
const defaultOutputPath = join(repoRoot, 'project-testing/reports/server-vitest-slices.json')
const schemaVersion = 'workbuddy-server-vitest-slices/v1'

const projectNames = new Set(['server-default', 'server-wbs-long', 'all'])

function normalizeSlash(value) {
  return String(value).replace(/\\/g, '/')
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    project: 'server-default',
    output: defaultOutputPath,
    timeoutMs: 180_000,
    planOnly: false,
    limit: null,
    shard: null,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }

    if (arg === '--project') {
      options.project = nextValue()
    } else if (arg === '--output') {
      options.output = resolve(repoRoot, nextValue())
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number.parseInt(nextValue(), 10)
    } else if (arg === '--plan-only') {
      options.planOnly = true
    } else if (arg === '--limit') {
      options.limit = Number.parseInt(nextValue(), 10)
    } else if (arg === '--shard') {
      options.shard = parseShard(nextValue())
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!projectNames.has(options.project)) {
    throw new Error(`--project must be one of ${[...projectNames].join(', ')}`)
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive integer')
  }
  if (options.limit !== null && (!Number.isFinite(options.limit) || options.limit <= 0)) {
    throw new Error('--limit must be a positive integer')
  }

  return options
}

function parseShard(value) {
  const match = String(value).match(/^(\d+)\/(\d+)$/)
  if (!match) throw new Error('--shard must use the format index/total')
  const index = Number.parseInt(match[1], 10)
  const total = Number.parseInt(match[2], 10)
  if (index < 1 || total < 1 || index > total) {
    throw new Error('--shard index must be between 1 and total')
  }
  return { index, total, label: `${index}/${total}` }
}

async function discoverServerTestFiles() {
  const result = []

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      if (!/\.(test|spec)\.ts$/.test(entry.name)) continue
      result.push(normalizeSlash(relative(serverRoot, fullPath)))
    }
  }

  await walk(serverSrcRoot)
  return result.sort((a, b) => a.localeCompare(b))
}

async function readConfiguredLongRunningTests() {
  const source = await readFile(vitestConfigPath, 'utf8')
  const match = source.match(/const\s+longRunningServerTests\s*=\s*\[([\s\S]*?)\]/)
  if (!match) throw new Error(`Cannot find longRunningServerTests in ${normalizeSlash(relative(repoRoot, vitestConfigPath))}`)
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => normalizeSlash(item[1])).sort()
}

function selectFiles(allFiles, longRunningFiles, project) {
  const longSet = new Set(longRunningFiles)
  if (project === 'server-default') return allFiles.filter((file) => !longSet.has(file))
  if (project === 'server-wbs-long') return longRunningFiles.filter((file) => allFiles.includes(file))
  return allFiles
}

function applyShard(files, shard) {
  if (!shard) return files
  return files.filter((_, index) => index % shard.total === shard.index - 1)
}

function applyLimit(files, limit) {
  if (!limit) return files
  return files.slice(0, limit)
}

function buildBaseReport({ options, allFiles, longRunningFiles, selectedFiles, startedAt }) {
  return {
    schemaVersion,
    generatedAt: startedAt.toISOString(),
    project: options.project,
    planOnly: options.planOnly,
    timeoutMs: options.timeoutMs,
    shard: options.shard?.label ?? null,
    limit: options.limit,
    totalDiscoveredFiles: allFiles.length,
    configuredLongRunningFileCount: longRunningFiles.length,
    selectedFileCount: selectedFiles.length,
    selectedFiles,
    excludedLongRunningFiles: options.project === 'server-default' ? longRunningFiles : [],
    results: [],
    summary: {
      status: options.planOnly ? 'planned' : 'not_started',
      passed: 0,
      failed: 0,
      timedOut: 0,
      skipped: options.planOnly ? selectedFiles.length : 0,
      total: selectedFiles.length,
    },
    mutationBoundary: 'local test execution only; no live or DB commands run',
  }
}

async function runVitestFile(file, options, logDir) {
  const startedAt = Date.now()
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const npmArgs = [
    'exec',
    '--workspace=server',
    '--',
    'vitest',
    'run',
    file,
    '--pool=threads',
    '--fileParallelism=false',
    '--maxWorkers=1',
    '--minWorkers=1',
    '--reporter=default',
  ]
  if (options.project !== 'all') {
    npmArgs.splice(6, 0, '--project', options.project)
  }
  const command = process.platform === 'win32' ? 'cmd.exe' : npmCommand
  const args = process.platform === 'win32' ? ['/d', '/c', npmCommand, ...npmArgs] : npmArgs

  let stdout = ''
  let stderr = ''
  let timedOut = false

  const exitCode = await new Promise((resolveExitCode) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      timedOut = true
      terminateChildTree(child)
    }, options.timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      stderr += `${error.stack ?? error.message}\n`
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveExitCode(typeof code === 'number' ? code : 1)
    })
  })

  const safeName = file.replace(/[\\/:]/g, '__')
  const stdoutPath = join(logDir, `${safeName}.stdout.txt`)
  const stderrPath = join(logDir, `${safeName}.stderr.txt`)
  await writeFile(stdoutPath, stdout, 'utf8')
  await writeFile(stderrPath, stderr, 'utf8')

  return {
    file,
    status: timedOut ? 'timed_out' : exitCode === 0 ? 'passed' : 'failed',
    exitCode,
    timedOut,
    durationMs: Date.now() - startedAt,
    stdoutPath: normalizeSlash(relative(repoRoot, stdoutPath)),
    stderrPath: normalizeSlash(relative(repoRoot, stderrPath)),
  }
}

function terminateChildTree(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    return
  }

  child.kill('SIGTERM')
  setTimeout(() => {
    if (!child.killed) child.kill('SIGKILL')
  }, 2_000).unref()
}

async function writeReport(output, report) {
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function summarize(results, total) {
  const passed = results.filter((result) => result.status === 'passed').length
  const failed = results.filter((result) => result.status === 'failed').length
  const timedOut = results.filter((result) => result.status === 'timed_out').length
  return {
    status: failed > 0 || timedOut > 0 ? 'failed' : 'passed',
    passed,
    failed,
    timedOut,
    skipped: Math.max(0, total - results.length),
    total,
  }
}

function renderHelp() {
  return [
    'Usage: node project-testing/tools/run-server-vitest-slices.mjs [options]',
    '',
    'Options:',
    '  --project <server-default|server-wbs-long|all>',
    '  --output <path>',
    '  --timeout-ms <ms>',
    '  --plan-only',
    '  --limit <count>',
    '  --shard <index/total>',
  ].join('\n')
}

async function main() {
  const options = parseArgs()
  if (options.help) {
    console.log(renderHelp())
    return
  }
  if (!existsSync(serverSrcRoot)) throw new Error('server/src is missing')

  const startedAt = new Date()
  const allFiles = await discoverServerTestFiles()
  const longRunningFiles = await readConfiguredLongRunningTests()
  const selectedFiles = applyLimit(
    applyShard(selectFiles(allFiles, longRunningFiles, options.project), options.shard),
    options.limit,
  )
  const report = buildBaseReport({ options, allFiles, longRunningFiles, selectedFiles, startedAt })

  if (options.planOnly) {
    await writeReport(options.output, report)
    console.log(JSON.stringify({
      status: 'planned',
      output: normalizeSlash(relative(repoRoot, options.output)),
      selectedFileCount: selectedFiles.length,
      mutationBoundary: report.mutationBoundary,
    }, null, 2))
    return
  }

  const logDir = join(dirname(options.output), 'logs', 'server-vitest-slices')
  await mkdir(logDir, { recursive: true })

  for (const file of selectedFiles) {
    const result = await runVitestFile(file, options, logDir)
    report.results.push(result)
    report.summary = summarize(report.results, selectedFiles.length)
    await writeReport(options.output, report)
    if (result.status !== 'passed') break
  }

  report.finishedAt = new Date().toISOString()
  report.summary = summarize(report.results, selectedFiles.length)
  await writeReport(options.output, report)

  console.log(JSON.stringify({
    status: report.summary.status,
    output: normalizeSlash(relative(repoRoot, options.output)),
    selectedFileCount: selectedFiles.length,
    passed: report.summary.passed,
    failed: report.summary.failed,
    timedOut: report.summary.timedOut,
    mutationBoundary: report.mutationBoundary,
  }, null, 2))

  if (report.summary.status !== 'passed') process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
