import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    values.set(token.slice(2), argv[index + 1] ?? '')
    index += 1
  }
  return values
}

async function findManifestPaths(root) {
  const paths = []
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && entry.name === 'suite-manifest.json') paths.push(path)
    }
  }
  await walk(root)
  return paths.sort()
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePath(path) {
  return path.replaceAll('\\', '/')
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

async function buildArtifact(options) {
  const blockers = []
  const manifestPaths = await findManifestPaths(options.artifactsRoot)
  if (manifestPaths.length !== options.expectedSuiteCount) {
    blockers.push(`browser_suite_count_mismatch:${manifestPaths.length}/${options.expectedSuiteCount}`)
  }

  const suites = []
  const runs = []
  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const suiteKey = text(manifest.suiteKey)
    const manifestRuns = Array.isArray(manifest.runs) ? manifest.runs : []
    if (!suiteKey) blockers.push(`browser_suite_key_missing:${normalizePath(relative(options.artifactsRoot, manifestPath))}`)
    if (manifestRuns.length === 0) blockers.push(`browser_suite_runs_missing:${suiteKey || 'unknown'}`)

    const normalizedRuns = manifestRuns.map((run) => {
      const script = text(run?.script)
      const status = text(run?.status) || 'unknown'
      if (!script) blockers.push(`browser_run_script_missing:${suiteKey || 'unknown'}`)
      if (status !== 'passed') blockers.push(`browser_verification_not_passed:${script || 'unknown'}`)
      return { script, status, suiteKey }
    })
    runs.push(...normalizedRuns)
    suites.push({
      suiteKey,
      manifestPath: normalizePath(relative(options.artifactsRoot, manifestPath)),
      status: normalizedRuns.length > 0 && normalizedRuns.every((run) => run.status === 'passed') ? 'passed' : 'failed',
      runCount: normalizedRuns.length,
    })
  }

  const duplicateScripts = runs
    .map((run) => run.script)
    .filter((script, index, values) => script && values.indexOf(script) !== index)
  for (const script of [...new Set(duplicateScripts)]) blockers.push(`browser_verification_duplicate:${script}`)

  const canonicalInput = JSON.stringify({
    suites: [...suites].sort((left, right) => left.suiteKey.localeCompare(right.suiteKey)),
    runs: [...runs].sort((left, right) => left.script.localeCompare(right.script)),
  })
  return {
    schemaVersion: 'workbuddy-v14231-readiness-gate/v1',
    status: blockers.length === 0 ? 'passed' : 'failed',
    generatedAt: options.generatedAt,
    releaseDigest: `git:${options.releaseSha}`,
    artifactDigest: digest(canonicalInput),
    targetEnvironment: options.target,
    expectedSuiteCount: options.expectedSuiteCount,
    suiteCount: suites.length,
    suites,
    runs,
    blockers: [...new Set(blockers)],
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const artifactsRoot = resolve(text(args.get('artifacts-root')))
  const output = resolve(text(args.get('output')))
  const releaseSha = text(args.get('release-sha'))
  const target = text(args.get('target'))
  const generatedAt = text(args.get('generated-at')) || new Date().toISOString()
  const expectedSuiteCount = Number(args.get('expected-suite-count'))

  if (!text(args.get('artifacts-root')) || !text(args.get('output')) || !releaseSha || !target) {
    throw new Error('artifacts-root, output, release-sha, and target are required')
  }
  if (!Number.isInteger(expectedSuiteCount) || expectedSuiteCount <= 0) {
    throw new Error('expected-suite-count must be a positive integer')
  }
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('generated-at must be an ISO timestamp')
  }

  const artifact = await buildArtifact({
    artifactsRoot,
    output,
    releaseSha,
    target,
    generatedAt,
    expectedSuiteCount,
  })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({ output, status: artifact.status, blockers: artifact.blockers }, null, 2)}\n`)
  if (artifact.status !== 'passed') process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
