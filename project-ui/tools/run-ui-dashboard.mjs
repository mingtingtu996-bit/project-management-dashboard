import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseArgs(argv) {
  const args = {
    profile: 'design-audit',
    dryRun: false,
    execute: false,
    reportRoot: null,
    reportRootExplicit: false,
    allowExternal: false,
    allowBrowser: false,
    allowDelegated: false,
    dryRunRequested: false,
    timeoutMs: 120_000,
    matrix: 'project-ui/matrix/ui-implementation-matrix.json',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile') args.profile = argv[++index]
    else if (arg.startsWith('--profile=')) args.profile = arg.split('=')[1]
    else if (arg === '--dry-run') {
      args.dryRun = true
      args.dryRunRequested = true
    }
    else if (arg === '--execute') args.execute = true
    else if (arg === '--allow-external') args.allowExternal = true
    else if (arg === '--allow-browser') args.allowBrowser = true
    else if (arg === '--allow-delegated') args.allowDelegated = true
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index])
    else if (arg.startsWith('--timeout-ms=')) args.timeoutMs = Number(arg.split('=')[1])
    else if (arg === '--matrix') args.matrix = argv[++index]
    else if (arg.startsWith('--matrix=')) args.matrix = arg.split('=')[1]
    else if (arg === '--report-root') {
      args.reportRoot = argv[++index]
      args.reportRootExplicit = true
    } else if (arg.startsWith('--report-root=')) {
      args.reportRoot = arg.split('=')[1]
      args.reportRootExplicit = true
    }
  }

  if (args.execute && args.dryRunRequested) {
    throw new Error('--execute and --dry-run are mutually exclusive')
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number')
  }
  if (!args.execute) args.dryRun = true
  return args
}

async function readJson(relativePath) {
  const { readFile } = await import('node:fs/promises')
  return JSON.parse(await readFile(resolve(repoRoot, relativePath), 'utf8'))
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function resolveReportRoot(reportRoot) {
  const resolved = resolve(repoRoot, reportRoot)
  const allowedRoots = [
    resolve(repoRoot, 'project-ui/artifacts'),
    resolve(repoRoot, 'project-ui/reports'),
  ]
  const allowed = allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${sep}`))
  if (!allowed) {
    throw new Error('--report-root must stay within project-ui/artifacts or project-ui/reports')
  }
  return resolved
}

function runCommand(command, timeoutMs) {
  const result = spawnSync(command, {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
  })

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error?.message ?? null,
  }
}

function requiredApprovalFlag(execution) {
  if (execution === 'external') return '--allow-external'
  if (execution === 'browser') return '--allow-browser'
  if (execution === 'delegated') return '--allow-delegated'
  return null
}

function hasExecutionApproval(args, execution) {
  if (execution === 'external') return args.allowExternal
  if (execution === 'browser') return args.allowBrowser
  if (execution === 'delegated') return args.allowDelegated
  return true
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const matrix = await readJson(args.matrix)
  const profile = matrix.profiles.find((item) => item.id === args.profile)
  if (!profile) {
    throw new Error(`Unknown UI dashboard profile: ${args.profile}`)
  }
  const sourceIds = profile.sourceIds ?? []

  const commandById = new Map(matrix.commands.map((command) => [command.id, command]))
  const executionKinds = new Set(['safe', 'local', 'browser', 'external', 'delegated'])
  for (const command of matrix.commands) {
    if (!executionKinds.has(command.execution)) {
      throw new Error(`Unknown execution classification for command ${command.id}: ${command.execution}`)
    }
    if (command.successStatus && !['passed', 'review-pending'].includes(command.successStatus)) {
      throw new Error(`Unknown success status for command ${command.id}: ${command.successStatus}`)
    }
  }
  const commands = profile.commandIds.map((id) => {
    const command = commandById.get(id)
    if (!command) throw new Error(`Profile ${profile.id} references missing command ${id}`)
    return command
  })

  if (args.execute) {
    for (const command of commands) {
      const requiredFlag = requiredApprovalFlag(command.execution)
      if (requiredFlag && !hasExecutionApproval(args, command.execution)) {
        throw new Error(`Command ${command.id} (${command.execution}) requires ${requiredFlag}`)
      }
    }
  }

  const shouldWriteReport = args.execute || args.reportRootExplicit
  const reportDir = shouldWriteReport
    ? join(resolveReportRoot(args.reportRoot ?? 'project-ui/reports'), `ui-${timestamp()}`)
    : null
  if (reportDir) await mkdir(reportDir, { recursive: true })

  const results = []
  if (args.execute) {
    for (const command of commands) {
      const startedAt = new Date().toISOString()
      const result = runCommand(command.command, args.timeoutMs)
      results.push({
        id: command.id,
        command: command.command,
        execution: command.execution,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: result.status === 0 && !result.error ? (command.successStatus ?? 'passed') : 'failed',
        exitCode: result.status,
        stdout: result.stdout.slice(-4000),
        stderr: result.stderr.slice(-4000),
        error: result.error,
      })
      if (result.status !== 0) break
    }
  }

  const summary = {
    schemaVersion: 'workbuddy-ui-dashboard-summary.v1',
    generatedAt: new Date().toISOString(),
    message: args.dryRun ? 'UI dashboard dry-run completed' : 'UI dashboard execution completed',
    profile: profile.id,
    sourceIds,
    dryRun: args.dryRun,
    executed: args.execute,
    approvals: {
      external: args.allowExternal,
      browser: args.allowBrowser,
      delegated: args.allowDelegated,
    },
    timeoutMs: args.timeoutMs,
    reportDir,
    commands: commands.map((command) => ({
      id: command.id,
      command: command.command,
      execution: command.execution,
      status: args.execute ? (results.find((result) => result.id === command.id)?.status || 'not-run') : 'planned',
    })),
    results,
    boundaries: matrix.mutationBoundary,
  }

  const summaryJson = reportDir ? join(reportDir, 'summary.json') : null
  const summaryMarkdown = reportDir ? join(reportDir, 'summary.md') : null
  if (summaryJson && summaryMarkdown) {
    await writeFile(summaryJson, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    await writeFile(summaryMarkdown, [
      '# UI Dashboard Summary',
      '',
      `- Profile: ${summary.profile}`,
      `- Dry run: ${summary.dryRun}`,
      `- Executed: ${summary.executed}`,
      '',
      '| Command | Execution | Status |',
      '| --- | --- | --- |',
      ...summary.commands.map((command) => `| ${command.id} | ${command.execution} | ${command.status} |`),
      '',
    ].join('\n'), 'utf8')
  }

  console.log(JSON.stringify({
    ...summary,
    summaryJson,
    summaryMarkdown,
  }, null, 2))

  if (results.some((result) => result.status === 'failed')) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
