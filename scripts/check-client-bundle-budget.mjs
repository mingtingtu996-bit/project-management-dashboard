import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DEFAULTS = {
  entryGzipKb: 350,
  maxChunkGzipKb: 900,
  totalGzipKb: 1600,
}

function parseArgs(argv) {
  const options = { ...DEFAULTS, distDir: 'client/dist' }
  const args = [...argv]

  if (args[0] && !args[0].startsWith('--')) {
    options.distDir = args.shift()
  }

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    const value = args[index + 1]
    if (!key.startsWith('--') || value === undefined) continue

    const numberValue = Number(value)
    if (!Number.isFinite(numberValue) || numberValue <= 0) {
      throw new Error(`Invalid value for ${key}: ${value}`)
    }

    if (key === '--entry-gzip-kb') options.entryGzipKb = numberValue
    if (key === '--max-chunk-gzip-kb') options.maxChunkGzipKb = numberValue
    if (key === '--total-gzip-kb') options.totalGzipKb = numberValue
    index += 1
  }

  return options
}

function collectJsFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  }

  return files
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const assetsDir = join(options.distDir, 'assets')
  const jsFiles = collectJsFiles(assetsDir)

  if (jsFiles.length === 0) {
    throw new Error(`No JavaScript assets found under ${assetsDir}`)
  }

  const rows = jsFiles
    .map((filePath) => {
      const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
      const rawBytes = statSync(filePath).size
      const gzipBytes = gzipSync(readFileSync(filePath)).length
      const isEntry = /^index-[\w-]+\.js$/.test(fileName)
      return { fileName, rawBytes, gzipBytes, isEntry }
    })
    .sort((left, right) => right.gzipBytes - left.gzipBytes)

  const totalGzipBytes = rows.reduce((sum, row) => sum + row.gzipBytes, 0)
  const entryRows = rows.filter((row) => row.isEntry)
  const failures = []

  if (entryRows.length === 0) {
    failures.push('No index-*.js entry chunk found.')
  }

  for (const row of entryRows) {
    if (row.gzipBytes > options.entryGzipKb * 1024) {
      failures.push(`${row.fileName} entry gzip ${formatKb(row.gzipBytes)} > ${options.entryGzipKb} KB`)
    }
  }

  for (const row of rows) {
    if (row.gzipBytes > options.maxChunkGzipKb * 1024) {
      failures.push(`${row.fileName} chunk gzip ${formatKb(row.gzipBytes)} > ${options.maxChunkGzipKb} KB`)
    }
  }

  if (totalGzipBytes > options.totalGzipKb * 1024) {
    failures.push(`Total JS gzip ${formatKb(totalGzipBytes)} > ${options.totalGzipKb} KB`)
  }

  console.log('Client bundle budget report')
  console.log(`Dist: ${options.distDir}`)
  console.log(`Total JS gzip: ${formatKb(totalGzipBytes)}`)
  console.table(
    rows.map((row) => ({
      asset: row.fileName,
      entry: row.isEntry ? 'yes' : 'no',
      raw: formatKb(row.rawBytes),
      gzip: formatKb(row.gzipBytes),
    })),
  )

  if (failures.length > 0) {
    console.error('Bundle budget failed:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exit(1)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
