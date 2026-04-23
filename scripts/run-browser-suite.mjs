import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const outputDir = join(repoRoot, 'artifacts', 'browser-checks')
const scripts = process.argv.slice(2)
const suiteKey = process.env.BROWSER_SUITE_KEY || process.env.npm_lifecycle_event || 'adhoc-browser-suite'
const suiteRuns = []
const suitePortBase = Number(process.env.BROWSER_SUITE_PORT_BASE || 4300)
const manifestPath = join(outputDir, 'suite-manifest.json')

function toSuiteFolderName(script) {
  return script
    .replace(/^verify:/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function collectScriptArtifacts(script) {
  const scriptDir = join(outputDir, toSuiteFolderName(script))
  await mkdir(scriptDir, { recursive: true })

  const entries = await readdir(outputDir, { withFileTypes: true })
  const filesToMove = entries.filter((entry) => entry.isFile() && entry.name !== 'suite-manifest.json')

  for (const file of filesToMove) {
    await rename(join(outputDir, file.name), join(scriptDir, file.name))
  }

  const files = (await readdir(scriptDir, { recursive: true }))
    .filter((entry) => typeof entry === 'string')
    .sort()

  const run = suiteRuns.find((item) => item.script === script)
  if (run) {
    run.files = files
    run.folder = toSuiteFolderName(script)
  }
}

async function writeManifest() {
  const files = (await readdir(outputDir, { recursive: true }))
    .filter((entry) => typeof entry === 'string')
    .sort()

  await writeFile(
    manifestPath,
    `${JSON.stringify({
      suiteKey,
      scripts,
      runs: suiteRuns,
      files,
    }, null, 2)}\n`,
    'utf8',
  )
}

if (scripts.length === 0) {
  console.error('Usage: node scripts/run-browser-suite.mjs <npm-script> [more-scripts...]')
  process.exit(1)
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })
await writeManifest()

for (const [index, script] of scripts.entries()) {
  const scriptPort = suitePortBase + index
  suiteRuns.push({
    script,
    folder: toSuiteFolderName(script),
    files: [],
    port: scriptPort,
    status: 'running',
  })
  await writeManifest()

  console.log(`\n[run-browser-suite] running ${script}\n`)
  const result = spawnSync(`npm run ${script}`, {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(scriptPort),
      BASE_URL: `http://127.0.0.1:${scriptPort}`,
    },
    shell: true,
    stdio: 'inherit',
  })

  if (result.error) {
    suiteRuns[suiteRuns.length - 1].status = 'failed'
    suiteRuns[suiteRuns.length - 1].error = String(result.error)
    await writeManifest()
    console.error(`[run-browser-suite] failed to launch ${script}:`, result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    suiteRuns[suiteRuns.length - 1].status = 'failed'
    suiteRuns[suiteRuns.length - 1].exitCode = result.status ?? 1
    await collectScriptArtifacts(script)
    await writeManifest()
    process.exit(result.status ?? 1)
  }

  await collectScriptArtifacts(script)
  suiteRuns[suiteRuns.length - 1].status = 'passed'
  suiteRuns[suiteRuns.length - 1].exitCode = 0
  await writeManifest()
}
