import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'

const latestManifestPath = process.env.FIGMA_DESIGN_DATA_LATEST_MANIFEST || 'project-ui/artifacts/figma-design-data/latest-manifest.json'
const legacyFigmaRoot = 'artifacts/figma-design-data'
const currentFigmaRoot = 'project-ui/artifacts/figma-design-data'

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

function resolveMovedPath(value) {
  if (typeof value !== 'string') return value
  if (existsSync(value)) return value
  if (value.startsWith(legacyFigmaRoot)) {
    const current = value.replace(legacyFigmaRoot, currentFigmaRoot)
    if (existsSync(current)) return current
  }
  return value
}

function normalizeManifestPaths(manifest) {
  return {
    ...manifest,
    outputDir: resolveMovedPath(manifest.outputDir),
    tokenFile: resolveMovedPath(manifest.tokenFile),
    assetFile: resolveMovedPath(manifest.assetFile),
    captures: (manifest.captures || []).map((capture) => ({
      ...capture,
      pageData: resolveMovedPath(capture.pageData),
      screenshot: resolveMovedPath(capture.screenshot),
    })),
  }
}

function mimeFromExt(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

async function fileToDataUrl(filePath) {
  const buffer = await readFile(filePath)
  return `data:${mimeFromExt(filePath)};base64,${buffer.toString('base64')}`
}

async function buildBundle({ includeScreenshots }) {
  const manifest = normalizeManifestPaths(await readJson(latestManifestPath))
  const outputDir = manifest.outputDir
  const replaySpec = await readJson(join(outputDir, 'figma-replay-spec.json'))
  const tokens = await readJson(join(outputDir, 'tokens.json'))
  const assets = await readJson(join(outputDir, 'assets.json'))

  const pages = {}
  const screenshots = {}

  for (const capture of manifest.captures) {
    const page = await readJson(capture.pageData)
    const key = `${capture.viewportKey}/${capture.routeKey}`
    pages[key] = {
      routeKey: capture.routeKey,
      viewportKey: capture.viewportKey,
      path: capture.path,
      data: page,
    }

    if (includeScreenshots && existsSync(capture.screenshot)) {
      screenshots[key] = {
        routeKey: capture.routeKey,
        viewportKey: capture.viewportKey,
        path: capture.path,
        dataUrl: await fileToDataUrl(capture.screenshot),
      }
    }
  }

  return {
    schemaVersion: includeScreenshots ? 'figma-design-bundle.full.v1' : 'figma-design-bundle.editable.v1',
    generatedAt: new Date().toISOString(),
    includeScreenshots,
    source: {
      manifestFile: latestManifestPath,
      outputDir,
    },
    manifest,
    replaySpec,
    tokens,
    assets,
    pages,
    screenshots,
    importInstructions: {
      summary: 'This is a single-file bundle for a Figma plugin or MCP script. It includes all page DOM/CSS/layout data; the full bundle also embeds screenshot reference layers as data URLs.',
      firstStep: 'Read replaySpec.framePlan, then find page data by `${viewportKey}/${routeKey}` in pages.',
      nodeMapping: replaySpec.nodeKindMapping,
    },
  }
}

function compactStyle(style = {}) {
  return {
    display: style.display,
    position: style.position,
    zIndex: style.zIndex,
    opacity: style.opacity,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    color: style.color,
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    borderTopWidth: style.borderTopWidth,
    borderTopColor: style.borderTopColor,
    borderRightWidth: style.borderRightWidth,
    borderBottomWidth: style.borderBottomWidth,
    borderLeftWidth: style.borderLeftWidth,
    borderRadius: style.borderRadius,
    boxShadow: style.boxShadow,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textAlign: style.textAlign,
    padding: style.padding,
    gap: style.gap,
    flexDirection: style.flexDirection,
    alignItems: style.alignItems,
    justifyContent: style.justifyContent,
    gridTemplateColumns: style.gridTemplateColumns,
    gridTemplateRows: style.gridTemplateRows,
  }
}

function compactAttrs(attrs = {}) {
  const kept = {}
  for (const key of ['id', 'href', 'src', 'alt', 'aria-label', 'placeholder', 'data-testid', 'currentSrc', 'naturalWidth', 'naturalHeight']) {
    if (attrs[key] !== undefined) kept[key] = attrs[key]
  }
  return kept
}

function compactPage(page) {
  return {
    schemaVersion: 'figma-page-compact.v1',
    route: page.route,
    viewport: page.viewport,
    url: page.url,
    title: page.title,
    document: {
      width: page.document?.width,
      height: page.document?.height,
      viewportWidth: page.document?.viewportWidth,
      viewportHeight: page.document?.viewportHeight,
      bodyTextLength: page.document?.bodyTextLength,
      rootCssVariables: page.document?.rootCssVariables,
      mainScroll: page.document?.mainScroll,
    },
    nodes: (page.nodes || []).map((node) => ({
      id: node.id,
      parentId: node.parentId,
      tag: node.tag,
      role: node.role,
      figmaKind: node.figmaKind,
      text: node.text,
      rect: node.rect,
      style: compactStyle(node.style),
      attrs: compactAttrs(node.attrs),
      childElementCount: node.childElementCount,
    })),
    textRuns: (page.textRuns || []).map((run) => ({
      id: run.id,
      parentId: run.parentId,
      figmaKind: run.figmaKind,
      text: run.text,
      rect: run.rect,
      style: compactStyle(run.style),
    })),
    assets: page.assets,
  }
}

async function writeJson(filePath, value, { pretty = true } = {}) {
  await writeFile(filePath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, 'utf8')
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
  return { filePath, sizeMB: Number((bytes / 1024 / 1024).toFixed(2)) }
}

async function writeBundle(filePath, bundle) {
  return writeJson(filePath, bundle)
}

async function main() {
  const manifest = normalizeManifestPaths(await readJson(latestManifestPath))
  const outputDir = manifest.outputDir
  const bundleDir = join(outputDir, 'bundle')

  await import('node:fs/promises').then(({ mkdir }) => mkdir(bundleDir, { recursive: true }))

  const editable = await writeBundle(
    join(bundleDir, 'figma-design-bundle.editable.json'),
    await buildBundle({ includeScreenshots: false }),
  )
  const full = await writeBundle(
    join(bundleDir, 'figma-design-bundle.full.json'),
    await buildBundle({ includeScreenshots: true }),
  )
  const replaySpec = await readJson(join(outputDir, 'figma-replay-spec.json'))
  const tokens = await readJson(join(outputDir, 'tokens.json'))
  const compactDir = join(bundleDir, 'compact')
  const pageBundleDir = join(compactDir, 'pages')
  const viewportBundleDir = join(compactDir, 'viewports')

  await import('node:fs/promises').then(({ mkdir }) => Promise.all([
    mkdir(pageBundleDir, { recursive: true }),
    mkdir(viewportBundleDir, { recursive: true }),
  ]))

  const compactManifest = {
    schemaVersion: 'figma-compact-bundle-index.v1',
    generatedAt: new Date().toISOString(),
    sourceOutputDir: outputDir,
    routeCount: manifest.routeCount,
    captureCount: manifest.captureCount,
    viewports: manifest.viewports,
    routes: manifest.routes,
    usage: {
      smallest: 'Use pageBundles for one route at a time.',
      medium: 'Use viewportBundles to import one viewport set at a time.',
      tokens: 'tokens.min.json can be imported once before page bundles.',
    },
  }

  const compactTokens = await writeJson(join(compactDir, 'tokens.min.json'), tokens, { pretty: false })
  const compactIndex = await writeJson(join(compactDir, 'bundle-index.min.json'), compactManifest, { pretty: false })

  const pageBundles = []
  const pagesByViewport = new Map()

  for (const capture of manifest.captures) {
    const page = compactPage(await readJson(capture.pageData))
    const frame = replaySpec.framePlan.find((item) => item.routeKey === capture.routeKey && item.viewportKey === capture.viewportKey)
    const pageBundle = {
      schemaVersion: 'figma-single-page-bundle.v1',
      generatedAt: new Date().toISOString(),
      routeKey: capture.routeKey,
      viewportKey: capture.viewportKey,
      path: capture.path,
      frame,
      tokens,
      page,
    }

    const viewportDir = join(pageBundleDir, capture.viewportKey)
    await import('node:fs/promises').then(({ mkdir }) => mkdir(viewportDir, { recursive: true }))
    const written = await writeJson(join(viewportDir, `${capture.routeKey}.min.json`), pageBundle, { pretty: false })
    pageBundles.push({ routeKey: capture.routeKey, viewportKey: capture.viewportKey, path: capture.path, ...written })

    const list = pagesByViewport.get(capture.viewportKey) || []
    list.push({
      routeKey: capture.routeKey,
      path: capture.path,
      frame,
      page,
    })
    pagesByViewport.set(capture.viewportKey, list)
  }

  const viewportBundles = []
  for (const [viewportKey, pages] of pagesByViewport.entries()) {
    const viewportBundle = {
      schemaVersion: 'figma-viewport-bundle.v1',
      generatedAt: new Date().toISOString(),
      viewportKey,
      tokens,
      pages,
    }
    const written = await writeJson(join(viewportBundleDir, `${viewportKey}.min.json`), viewportBundle, { pretty: false })
    viewportBundles.push({ viewportKey, pageCount: pages.length, ...written })
  }

  const index = {
    generatedAt: new Date().toISOString(),
    sourceOutputDir: outputDir,
    bundles: {
      editable,
      full,
      compactIndex,
      compactTokens,
      viewportBundles,
      pageBundles,
    },
    recommendation: 'Use compact/page bundles first. Use editable only if the importer can handle a larger all-in-one JSON. Use full only if screenshot reference layers are required.',
  }

  const indexPath = join(bundleDir, 'bundle-manifest.json')
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ bundleDir, indexPath, ...index }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
