import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const manifestPath = process.argv[2]
  ? join(repoRoot, process.argv[2])
  : join(repoRoot, 'artifacts', 'browser-checks', 'suite-manifest.json')

function statusIcon(status) {
  if (status === 'passed') return 'PASS'
  if (status === 'failed') return 'FAIL'
  if (status === 'running') return 'RUN'
  return 'UNKNOWN'
}

function summarizeFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return 'no artifacts'
  if (files.length <= 3) return files.join(', ')
  return `${files.slice(0, 3).join(', ')} and ${files.length - 3} more`
}

async function main() {
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw)
    const runs = Array.isArray(manifest.runs) ? manifest.runs : []
    const passed = runs.filter((run) => run.status === 'passed').length
    const failed = runs.filter((run) => run.status === 'failed').length

    const lines = [
      `## Browser Suite Summary: ${manifest.suiteKey || 'unknown-suite'}`,
      '',
      `- Scripts: ${runs.length}`,
      `- Passed: ${passed}`,
      `- Failed: ${failed}`,
      '',
      '| Status | Script | Port | Artifacts |',
      '| --- | --- | --- | --- |',
      ...runs.map((run) => `| ${statusIcon(run.status)} | \`${run.script}\` | ${run.port ?? '-'} | ${summarizeFiles(run.files)} |`),
      '',
      `- Manifest: \`${manifestPath.replace(`${repoRoot}\\`, '')}\``,
    ]

    process.stdout.write(`${lines.join('\n')}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stdout.write([
      '## Browser Suite Summary',
      '',
      `- Manifest read failed: \`${manifestPath.replace(`${repoRoot}\\`, '')}\``,
      `- Error: ${message}`,
      '',
    ].join('\n'))
  }
}

await main()
