import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const artifactsRoot = process.argv[2]
  ? join(repoRoot, process.argv[2])
  : join(repoRoot, 'browser-artifacts')

function statusLabel(run) {
  if (run.status === 'passed') return 'PASS'
  if (run.status === 'failed') return 'FAIL'
  if (run.status === 'running') return 'RUN'
  return 'UNKNOWN'
}

function summarizeCounts(runs) {
  return {
    total: runs.length,
    passed: runs.filter((run) => run.status === 'passed').length,
    failed: runs.filter((run) => run.status === 'failed').length,
  }
}

function totalCounts(suites) {
  return suites.reduce((acc, suite) => {
    acc.total += suite.counts.total
    acc.passed += suite.counts.passed
    acc.failed += suite.counts.failed
    return acc
  }, { total: 0, passed: 0, failed: 0 })
}

async function listManifestPaths(rootDir) {
  const manifests = []

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const nextPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(nextPath)
        continue
      }

      if (entry.isFile() && entry.name === 'suite-manifest.json') {
        manifests.push(nextPath)
      }
    }
  }

  await walk(rootDir)
  return manifests.sort()
}

async function readManifest(path) {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
}

async function main() {
  try {
    const manifestPaths = await listManifestPaths(artifactsRoot)
    if (manifestPaths.length === 0) {
      process.stdout.write([
        '## Browser Checks Overview',
        '',
        `- No suite manifests found under \`${artifactsRoot.replace(`${repoRoot}\\`, '')}\``,
        '',
      ].join('\n'))
      return
    }

    const manifests = await Promise.all(manifestPaths.map(readManifest))
    const suiteSummaries = manifests.map((manifest, index) => {
      const counts = summarizeCounts(Array.isArray(manifest.runs) ? manifest.runs : [])
      return {
        suiteKey: manifest.suiteKey || `suite-${index + 1}`,
        manifestPath: manifestPaths[index].replace(`${repoRoot}\\`, ''),
        runs: Array.isArray(manifest.runs) ? manifest.runs : [],
        counts,
      }
    })

    const totalSuites = suiteSummaries.length
    const passedSuites = suiteSummaries.filter((suite) => suite.counts.failed === 0 && suite.counts.total > 0).length
    const failedSuites = suiteSummaries.filter((suite) => suite.counts.failed > 0).length
    const totals = totalCounts(suiteSummaries)
    const failedRuns = suiteSummaries.flatMap((suite) =>
      suite.runs
        .filter((run) => run.status === 'failed')
        .map((run) => ({ suiteKey: suite.suiteKey, script: run.script, port: run.port ?? '-' })),
    )

    const lines = [
      '## Browser Checks Overview',
      '',
      `- Result: ${failedSuites === 0 ? 'PASS' : 'FAIL'}`,
      `- Suites: ${passedSuites}/${totalSuites} passed`,
      `- Scripts: ${totals.passed}/${totals.total} passed`,
      '',
      '| Suite | Result | Scripts |',
      '| --- | --- | --- |',
      ...suiteSummaries.map((suite) => `| \`${suite.suiteKey}\` | ${suite.counts.failed === 0 ? 'PASS' : 'FAIL'} | ${suite.counts.passed}/${suite.counts.total} |`),
      '',
    ]

    if (failedRuns.length > 0) {
      lines.push('### Failed Scripts')
      lines.push('')
      lines.push('| Suite | Script | Port |')
      lines.push('| --- | --- | --- |')
      lines.push(...failedRuns.map((run) => `| \`${run.suiteKey}\` | \`${run.script}\` | ${run.port} |`))
      lines.push('')
    }

    process.stdout.write(`${lines.join('\n')}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stdout.write([
      '## Browser Checks Overview',
      '',
      `- Artifact scan failed under \`${artifactsRoot.replace(`${repoRoot}\\`, '')}\``,
      `- Error: ${message}`,
      '',
    ].join('\n'))
  }
}

await main()
