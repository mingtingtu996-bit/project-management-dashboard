import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const latestManifestPath = 'artifacts/figma-design-data/latest-manifest.json'

function isIgnorableConsole(routeKey, text) {
  return text.includes('Failed to load resource') && text.includes('400')
}

function isIgnorableApi(routeKey, failure) {
  if (failure.failure === 'net::ERR_ABORTED') return true
  return failure.status === 400
    && String(failure.url || '').includes('/api/invitations/validate/FIGMA-DEMO')
}

function cleanDiagnostics(routeKey, diagnostics = {}) {
  return {
    consoleErrors: (diagnostics.consoleErrors || []).filter((text) => !isIgnorableConsole(routeKey, text)),
    pageErrors: diagnostics.pageErrors || [],
    apiFailures: (diagnostics.apiFailures || []).filter((failure) => !isIgnorableApi(routeKey, failure)),
  }
}

function countWarnings(diagnostics) {
  return diagnostics.consoleErrors.length + diagnostics.pageErrors.length + diagnostics.apiFailures.length
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

function replaceDir(value, sourceDir, destDir) {
  return typeof value === 'string' ? value.replaceAll(sourceDir, destDir) : value
}

async function main() {
  const sourceManifest = await readJson(latestManifestPath)
  const sourceDir = process.env.FIGMA_CLEAN_SOURCE_DIR || sourceManifest.outputDir
  const destDir = process.env.FIGMA_CLEAN_OUTPUT_DIR || `${sourceDir}-cleaned`
  if (sourceDir === destDir) {
    throw new Error(`Refusing to clean in place: ${sourceDir}`)
  }

  await rm(destDir, { recursive: true, force: true })
  await cp(sourceDir, destDir, { recursive: true })

  const pagesRoot = join(destDir, 'pages')
  for (const viewport of readdirSync(pagesRoot)) {
    const dir = join(pagesRoot, viewport)
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      const filePath = join(dir, file)
      const payload = await readJson(filePath)
      payload.diagnostics = cleanDiagnostics(payload.route?.key, payload.diagnostics)
      await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    }
  }

  const manifestPath = join(destDir, 'manifest.json')
  const manifest = await readJson(manifestPath)
  manifest.sourceRunId = manifest.runId
  manifest.runId = `${manifest.runId}-cleaned`
  manifest.generatedAt = new Date().toISOString()
  manifest.outputDir = destDir
  manifest.tokenFile = replaceDir(manifest.tokenFile, sourceDir, destDir)
  manifest.assetFile = replaceDir(manifest.assetFile, sourceDir, destDir)
  manifest.captures = manifest.captures.map((capture) => {
    const diagnostics = cleanDiagnostics(capture.routeKey, capture.diagnostics)
    return {
      ...capture,
      pageData: replaceDir(capture.pageData, sourceDir, destDir),
      screenshot: replaceDir(capture.screenshot, sourceDir, destDir),
      diagnostics,
    }
  })

  const warningCount = manifest.captures.reduce(
    (total, capture) => total + countWarnings(capture.diagnostics),
    0,
  )
  manifest.status = warningCount === 0 ? 'completed' : 'completed_with_warnings'
  manifest.warningCount = warningCount

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(latestManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const replayPath = join(destDir, 'figma-replay-spec.json')
  const replay = await readJson(replayPath)
  replay.source.tokenFile = replaceDir(replay.source.tokenFile, sourceDir, destDir)
  replay.source.assetFile = replaceDir(replay.source.assetFile, sourceDir, destDir)
  replay.framePlan = replay.framePlan.map((frame) => ({
    ...frame,
    dataFile: replaceDir(frame.dataFile, sourceDir, destDir),
    screenshotReference: replaceDir(frame.screenshotReference, sourceDir, destDir),
  }))
  await writeFile(replayPath, `${JSON.stringify(replay, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    outputDir: destDir,
    captures: manifest.captureCount,
    routes: manifest.routeCount,
    warningCount,
    status: manifest.status,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
