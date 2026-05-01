import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const manifestPath = join(repoRoot, '.tmp', 'full-app-test-env', 'manifest.json')
const distIndex = join(repoRoot, 'client', 'dist', 'index.html')
const outputRoot = join(repoRoot, 'artifacts', 'figma-design-data')

const defaultProjectId = '422ba093-7a94-4e91-a47a-c1b865185e86'
const defaultMonth = '2026-04'
const maxNodesPerPage = Number(process.env.FIGMA_EXTRACT_MAX_NODES || 3200)
const maxTextRunsPerPage = Number(process.env.FIGMA_EXTRACT_MAX_TEXT_RUNS || 1800)

const candidateBaseUrls = [
  process.env.BASE_URL,
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
].filter(Boolean)

const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const viewportArg = process.env.FIGMA_EXTRACT_VIEWPORTS || process.argv.find((arg) => arg.startsWith('--viewports='))?.split('=')[1] || ''
const routeArg = process.env.FIGMA_EXTRACT_ROUTES || process.argv.find((arg) => arg.startsWith('--routes='))?.split('=')[1] || ''
const browserMode = process.env.FIGMA_EXTRACT_BROWSER_MODE || 'reuse-page'

const allViewports = [
  { key: 'desktop-1440', width: 1440, height: 900, purpose: 'main Figma desktop frame' },
  { key: 'desktop-1366', width: 1366, height: 768, purpose: 'low-height desktop check' },
  { key: 'mobile-390', width: 390, height: 844, purpose: 'mobile responsive frame' },
]

function selectedViewports() {
  if (!viewportArg.trim()) return allViewports
  const wanted = new Set(viewportArg.split(',').map((item) => item.trim()).filter(Boolean))
  return allViewports.filter((viewport) => wanted.has(viewport.key))
}

function selectedRoutes(routes) {
  if (!routeArg.trim()) return routes
  const wanted = new Set(routeArg.split(',').map((item) => item.trim()).filter(Boolean))
  return routes.filter((route) => wanted.has(route.key))
}

function rel(filePath) {
  return relative(repoRoot, filePath).replace(/\\/g, '/')
}

function routeUrl(baseUrl, pathname) {
  return `${baseUrl}/#${pathname}`
}

function projectRoute(projectId, pathname) {
  return `/projects/${projectId}${pathname}`
}

function sha(value) {
  return createHash('sha1').update(value).digest('hex')
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function waitForHttpOk(url, timeoutMs = 30000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHttpReady(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function resolveBaseUrl() {
  for (const url of candidateBaseUrls) {
    if (await isHttpReady(url)) return { baseUrl: url, preview: null, source: 'existing-server' }
  }

  if (!(await fileExists(distIndex))) {
    throw new Error('No running frontend was found and client/dist/index.html is missing. Run npm run build --workspace=client first.')
  }

  const port = Number(process.env.PORT || 4173)
  const preview = spawn(process.execPath, [join(scriptsDir, 'serve-client-dist.mjs')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      API_HOST: new URL(apiBaseUrl).hostname,
      API_PORT: new URL(apiBaseUrl).port || '80',
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  preview.stdout.on('data', (chunk) => process.stdout.write(`[figma-extract:preview] ${chunk}`))
  preview.stderr.on('data', (chunk) => process.stderr.write(`[figma-extract:preview] ${chunk}`))

  const baseUrl = `http://127.0.0.1:${port}`
  if (!(await waitForHttpOk(baseUrl, 30000))) {
    preview.kill()
    throw new Error(`Preview server did not become ready at ${baseUrl}`)
  }

  return { baseUrl, preview, source: 'started-preview' }
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function login(account) {
  if (!account?.username || !account?.password) return null

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: account.username, password: account.password }),
    })
    if (!response.ok) return null
    const json = await response.json()
    const payload = json.data ?? json
    if (!payload?.token) return null
    return { token: payload.token, user: payload.user ?? null, username: account.username }
  } catch {
    return null
  }
}

async function resolveSession(manifest) {
  const account = manifest?.accounts?.owner || manifest?.accounts?.companyAdmin || null
  const session = await login(account)
  if (session) return session

  return {
    token: process.env.AUTH_TOKEN || '',
    user: null,
    username: process.env.AUTH_TOKEN ? 'AUTH_TOKEN' : null,
  }
}

function buildRoutes(projectId, month) {
  return [
    { key: 'company-cockpit', path: '/company', section: 'company', suggestedFrameName: 'Company Cockpit' },
    { key: 'notifications', path: `/notifications?projectId=${projectId}`, section: 'company', suggestedFrameName: 'Notifications' },
    { key: 'monitoring', path: '/monitoring', section: 'company', suggestedFrameName: 'Monitoring Dashboard' },
    { key: 'join-project', path: '/join/FIGMA-DEMO', section: 'company', suggestedFrameName: 'Join Project' },
    { key: 'dashboard', path: projectRoute(projectId, '/dashboard'), section: 'project', suggestedFrameName: 'Project Dashboard' },
    { key: 'milestones', path: projectRoute(projectId, '/milestones'), section: 'project', suggestedFrameName: 'Milestones' },
    { key: 'planning-baseline', path: projectRoute(projectId, '/planning/baseline'), section: 'planning', suggestedFrameName: 'Planning Baseline' },
    { key: 'planning-monthly', path: projectRoute(projectId, `/planning/monthly?month=${month}`), section: 'planning', suggestedFrameName: 'Planning Monthly' },
    { key: 'planning-wbs-templates', path: projectRoute(projectId, '/planning/wbs-templates'), section: 'planning', suggestedFrameName: 'WBS Templates' },
    { key: 'planning-closeout', path: projectRoute(projectId, '/tasks/closeout'), section: 'planning', suggestedFrameName: 'Planning Closeout' },
    { key: 'planning-revision-pool', path: projectRoute(projectId, '/planning/revision-pool'), section: 'planning', suggestedFrameName: 'Planning Revision Pool' },
    { key: 'gantt', path: projectRoute(projectId, '/gantt'), section: 'tasks', suggestedFrameName: 'Task Gantt Workspace' },
    { key: 'task-summary', path: projectRoute(projectId, '/task-summary'), section: 'tasks', suggestedFrameName: 'Task Summary' },
    { key: 'responsibility', path: projectRoute(projectId, '/responsibility'), section: 'tasks', suggestedFrameName: 'Responsibility View' },
    { key: 'risk-management', path: projectRoute(projectId, '/risks'), section: 'risk', suggestedFrameName: 'Risk Management' },
    { key: 'reports', path: projectRoute(projectId, '/reports?view=progress'), section: 'analytics', suggestedFrameName: 'Reports' },
    { key: 'pre-milestones', path: projectRoute(projectId, '/pre-milestones'), section: 'special', suggestedFrameName: 'Pre Milestones' },
    { key: 'drawings', path: projectRoute(projectId, '/drawings'), section: 'special', suggestedFrameName: 'Drawings' },
    { key: 'materials', path: projectRoute(projectId, '/materials'), section: 'special', suggestedFrameName: 'Materials' },
    { key: 'acceptance-timeline', path: projectRoute(projectId, '/acceptance'), section: 'special', suggestedFrameName: 'Acceptance Timeline' },
    { key: 'not-found', path: '/figma-extract/not-found', section: 'system', suggestedFrameName: 'Not Found' },
  ]
}

function getOutputRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function prepareOutput(runId) {
  const runDir = join(outputRoot, runId)
  await mkdir(join(runDir, 'pages'), { recursive: true })
  await mkdir(join(runDir, 'screenshots'), { recursive: true })
  await mkdir(join(runDir, 'assets'), { recursive: true })
  return runDir
}

function extractSourceTokens(indexCss, tailwindConfig) {
  const cssVariables = {}
  const cssVarRegex = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g
  let match = cssVarRegex.exec(indexCss)
  while (match) {
    cssVariables[`--${match[1]}`] = match[2].trim()
    match = cssVarRegex.exec(indexCss)
  }

  const tailwindHints = {
    hasCustomFontFamily: /fontFamily\s*:/.test(tailwindConfig),
    hasCustomRadii: /borderRadius\s*:/.test(tailwindConfig),
    hasCustomShadows: /boxShadow\s*:/.test(tailwindConfig),
    hasCustomAnimations: /animation\s*:/.test(tailwindConfig),
  }

  return {
    files: {
      indexCss: 'client/src/index.css',
      tailwindConfig: 'client/tailwind.config.js',
    },
    cssVariables,
    tailwindHints,
  }
}

function topEntries(map, limit = 80) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }))
}

function addCount(map, value) {
  if (!value) return
  const normalized = String(value).trim()
  if (!normalized || normalized === 'transparent' || normalized === 'rgba(0, 0, 0, 0)') return
  map.set(normalized, (map.get(normalized) ?? 0) + 1)
}

function aggregateRuntimeTokens(pagePayloads) {
  const colors = new Map()
  const fills = new Map()
  const strokes = new Map()
  const shadows = new Map()
  const radii = new Map()
  const typography = new Map()
  const spacing = new Map()

  for (const payload of pagePayloads) {
    for (const node of payload.nodes ?? []) {
      const style = node.style ?? {}
      addCount(colors, style.color)
      addCount(fills, style.backgroundColor)
      addCount(strokes, style.borderTopColor)
      addCount(shadows, style.boxShadow)
      addCount(radii, style.borderRadius)
      addCount(spacing, style.gap)
      addCount(spacing, style.padding)
      const typeKey = [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight].filter(Boolean).join(' | ')
      addCount(typography, typeKey)
    }
    for (const run of payload.textRuns ?? []) {
      const style = run.style ?? {}
      const typeKey = [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight].filter(Boolean).join(' | ')
      addCount(typography, typeKey)
      addCount(colors, style.color)
    }
  }

  return {
    colors: topEntries(colors),
    fills: topEntries(fills),
    strokes: topEntries(strokes),
    shadows: topEntries(shadows),
    radii: topEntries(radii),
    typography: topEntries(typography),
    spacing: topEntries(spacing),
  }
}

function toAssetFileName(assetUrl, contentType) {
  const urlPath = new URL(assetUrl).pathname
  const urlExt = extname(urlPath).slice(0, 10)
  const typeExt = contentType?.includes('svg') ? '.svg'
    : contentType?.includes('png') ? '.png'
      : contentType?.includes('jpeg') ? '.jpg'
        : contentType?.includes('webp') ? '.webp'
          : ''
  return `${sha(assetUrl).slice(0, 16)}${urlExt || typeExt || '.bin'}`
}

async function downloadAsset(assetUrl, assetsDir) {
  if (!/^https?:\/\//.test(assetUrl)) return null
  try {
    const response = await fetch(assetUrl)
    if (!response.ok) return { url: assetUrl, status: 'failed', statusCode: response.status }
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/') && !assetUrl.match(/\.(png|jpe?g|svg|webp|gif)(\?|$)/i)) {
      return { url: assetUrl, status: 'skipped', reason: `content-type ${contentType || 'unknown'}` }
    }
    const fileName = toAssetFileName(assetUrl, contentType)
    const filePath = join(assetsDir, fileName)
    await writeFile(filePath, Buffer.from(await response.arrayBuffer()))
    return { url: assetUrl, status: 'downloaded', contentType, file: rel(filePath) }
  } catch (error) {
    return { url: assetUrl, status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

async function downloadAssets(pagePayloads, runDir) {
  const assetsDir = join(runDir, 'assets')
  const urls = new Set()
  for (const payload of pagePayloads) {
    for (const asset of payload.assets?.images ?? []) urls.add(asset.src)
    for (const asset of payload.assets?.backgroundImages ?? []) urls.add(asset.url)
  }

  const downloaded = []
  for (const url of [...urls].sort()) {
    downloaded.push(await downloadAsset(url, assetsDir))
  }

  return downloaded.filter(Boolean)
}

async function waitForRenderSettle(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(900)
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => undefined)
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }).catch(() => undefined)
}

function isIgnorableConsoleError(route, text) {
  return text.includes('Failed to load resource') && text.includes('400')
}

function isIgnorableApiResponse(route, response) {
  return response.status() === 400
    && response.url().includes('/api/invitations/validate/FIGMA-DEMO')
}

function isIgnorableRequestFailure(request) {
  return request.failure()?.errorText === 'net::ERR_ABORTED'
}

async function capturePage(page, route, viewport, baseUrl, runDir) {
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    apiFailures: [],
  }

  const onConsole = (message) => {
    const text = message.text()
    if (message.type() === 'error' && !isIgnorableConsoleError(route, text)) diagnostics.consoleErrors.push(text)
  }
  const onPageError = (error) => diagnostics.pageErrors.push(error.message)
  const onResponse = (response) => {
    if (isIgnorableApiResponse(route, response)) return
    if (response.url().includes('/api/') && response.status() >= 400) {
      diagnostics.apiFailures.push({ url: response.url(), status: response.status() })
    }
  }
  const onRequestFailed = (request) => {
    if (isIgnorableRequestFailure(request)) return
    if (request.url().includes('/api/')) {
      diagnostics.apiFailures.push({ url: request.url(), failure: request.failure()?.errorText || 'unknown' })
    }
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('response', onResponse)
  page.on('requestfailed', onRequestFailed)

  const url = routeUrl(baseUrl, route.path)
  const startedAt = Date.now()
  let status = 'captured'
  let error = null

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await waitForRenderSettle(page)
  } catch (captureError) {
    status = 'partial'
    error = captureError instanceof Error ? captureError.message : String(captureError)
  }

  const payload = await page.evaluate(({ route, viewport, maxNodes, maxTextRuns }) => {
    const transparentValues = new Set(['transparent', 'rgba(0, 0, 0, 0)'])
    const nodeIds = new WeakMap()
    let nextId = 1

    function getNodeId(node) {
      if (!nodeIds.has(node)) nodeIds.set(node, `n${nextId++}`)
      return nodeIds.get(node)
    }

    function round(value) {
      return Math.round(Number(value || 0) * 100) / 100
    }

    function rectPayload(rect, extra = {}) {
      return {
        x: round(rect.left + window.scrollX),
        y: round(rect.top + window.scrollY),
        width: round(rect.width),
        height: round(rect.height),
        viewportX: round(rect.left),
        viewportY: round(rect.top),
        ...extra,
      }
    }

    function styleValue(style, prop) {
      return style.getPropertyValue(prop)
    }

    function isTransparent(value) {
      return !value || transparentValues.has(value)
    }

    function hasVisibleRect(rect) {
      return rect.width > 0.25 && rect.height > 0.25
    }

    function visibleElement(element) {
      if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return false
      const tag = element.tagName.toLowerCase()
      if (['script', 'style', 'template', 'noscript', 'meta', 'link'].includes(tag)) return false
      const style = window.getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
      const rect = element.getBoundingClientRect()
      return hasVisibleRect(rect) || element.scrollWidth > 0 || element.scrollHeight > 0
    }

    function directText(element) {
      return [...element.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    function truncate(value, limit = 260) {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim()
      if (normalized.length <= limit) return normalized
      return `${normalized.slice(0, limit - 1)}…`
    }

    function getRole(element) {
      return element.getAttribute('role') || (
        element instanceof HTMLButtonElement ? 'button'
          : element instanceof HTMLAnchorElement ? 'link'
            : element instanceof HTMLInputElement ? 'input'
              : element instanceof HTMLTextAreaElement ? 'textarea'
                : element instanceof HTMLSelectElement ? 'select'
                  : null
      )
    }

    function figmaKind(element, style) {
      const tag = element.tagName.toLowerCase()
      const role = getRole(element)
      if (tag === 'img' || tag === 'picture' || tag === 'canvas') return 'IMAGE'
      if (tag === 'svg' || element.closest('svg')) return 'VECTOR'
      if (['button', 'input', 'textarea', 'select'].includes(tag) || role === 'button' || role === 'tab') return 'COMPONENT_CANDIDATE'
      if (style.display.includes('flex') || style.display.includes('grid')) return 'FRAME'
      if (!isTransparent(style.backgroundColor) || style.borderTopWidth !== '0px' || style.boxShadow !== 'none') return 'RECTANGLE_OR_FRAME'
      return 'GROUP'
    }

    function relevantStyle(element) {
      const style = window.getComputedStyle(element)
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
        textTransform: style.textTransform,
        whiteSpace: style.whiteSpace,
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(' '),
        margin: [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].join(' '),
        gap: style.gap,
        flexDirection: style.flexDirection,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        gridTemplateColumns: style.gridTemplateColumns,
        gridTemplateRows: style.gridTemplateRows,
      }
    }

    function getAttrs(element) {
      const attrs = {}
      for (const name of ['id', 'href', 'src', 'alt', 'title', 'aria-label', 'aria-current', 'aria-expanded', 'type', 'placeholder', 'data-testid', 'data-onboarding-target']) {
        const value = element.getAttribute(name)
        if (value) attrs[name] = truncate(value, 500)
      }
      if (element instanceof HTMLImageElement && element.currentSrc) {
        attrs.currentSrc = element.currentSrc
        attrs.naturalWidth = element.naturalWidth
        attrs.naturalHeight = element.naturalHeight
      }
      return attrs
    }

    function classes(element) {
      return [...element.classList].slice(0, 80)
    }

    function cssVariables() {
      const rootStyle = window.getComputedStyle(document.documentElement)
      const vars = {}
      for (const prop of rootStyle) {
        if (prop.startsWith('--')) vars[prop] = rootStyle.getPropertyValue(prop).trim()
      }
      return vars
    }

    function collectImageAssets(nodes) {
      const images = []
      const backgrounds = []
      const inlineSvgs = []
      const imageSeen = new Set()
      const backgroundSeen = new Set()

      for (const node of nodes) {
        const element = document.querySelector(`[data-figma-extract-id="${node.id}"]`)
        if (!element) continue
        if (element instanceof HTMLImageElement && element.currentSrc && !imageSeen.has(element.currentSrc)) {
          imageSeen.add(element.currentSrc)
          images.push({
            src: element.currentSrc,
            alt: element.alt || '',
            naturalWidth: element.naturalWidth,
            naturalHeight: element.naturalHeight,
          })
        }

        const backgroundImage = window.getComputedStyle(element).backgroundImage
        if (backgroundImage && backgroundImage !== 'none') {
          const matches = [...backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)]
          for (const match of matches) {
            try {
              const absolute = new URL(match[1], window.location.href).href
              if (!backgroundSeen.has(absolute)) {
                backgroundSeen.add(absolute)
                backgrounds.push({ url: absolute, ownerNodeId: node.id })
              }
            } catch {
              // Ignore invalid URLs.
            }
          }
        }

        if (element instanceof SVGElement && element.tagName.toLowerCase() === 'svg') {
          inlineSvgs.push({
            ownerNodeId: node.id,
            rect: node.rect,
            outerHTML: element.outerHTML.length <= 12000 ? element.outerHTML : element.outerHTML.slice(0, 12000),
          })
        }
      }

      return { images, backgroundImages: backgrounds, inlineSvgs }
    }

    const nodes = []
    const textRuns = []
    const allElements = [...document.body.querySelectorAll('*')]
    for (const element of allElements) {
      if (nodes.length >= maxNodes) break
      if (!visibleElement(element)) continue
      const id = getNodeId(element)
      element.setAttribute('data-figma-extract-id', id)
      const parent = element.parentElement && element.parentElement !== document.body ? getNodeId(element.parentElement) : null
      const rect = element.getBoundingClientRect()
      const style = relevantStyle(element)
      const tag = element.tagName.toLowerCase()
      const text = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value || element.placeholder
        : directText(element)

      nodes.push({
        id,
        parentId: parent,
        tag,
        role: getRole(element),
        figmaKind: figmaKind(element, window.getComputedStyle(element)),
        text: truncate(text, 500),
        rect: rectPayload(rect, {
          scrollWidth: round(element.scrollWidth),
          scrollHeight: round(element.scrollHeight),
          clientWidth: round(element.clientWidth),
          clientHeight: round(element.clientHeight),
        }),
        style,
        classList: classes(element),
        attrs: getAttrs(element),
        childElementCount: element.childElementCount,
      })
    }

    const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.textContent?.replace(/\s+/g, ' ').trim()
        if (!text) return NodeFilter.FILTER_REJECT
        const parent = node.parentElement
        if (!parent || !visibleElement(parent)) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })

    while (textRuns.length < maxTextRuns) {
      const textNode = textWalker.nextNode()
      if (!textNode) break
      const range = document.createRange()
      range.selectNodeContents(textNode)
      const rect = range.getBoundingClientRect()
      const parent = textNode.parentElement
      if (!parent || !hasVisibleRect(rect)) continue
      const style = relevantStyle(parent)
      textRuns.push({
        id: `t${textRuns.length + 1}`,
        parentId: getNodeId(parent),
        figmaKind: 'TEXT',
        text: truncate(textNode.textContent || '', 1000),
        rect: rectPayload(rect),
        style: {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          textAlign: style.textAlign,
          color: style.color,
        },
      })
    }

    const assets = collectImageAssets(nodes)
    for (const element of allElements) {
      element.removeAttribute('data-figma-extract-id')
    }

    const bodyText = document.body.innerText.replace(/\s+/g, ' ').trim()
    const main = document.querySelector('main')

    return {
      schemaVersion: 'figma-design-data.v1',
      route,
      viewport,
      url: window.location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      document: {
        width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth),
        height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        bodyTextLength: bodyText.length,
        bodyTextSample: truncate(bodyText, 5000),
        rootCssVariables: cssVariables(),
        mainScroll: main ? {
          scrollWidth: main.scrollWidth,
          scrollHeight: main.scrollHeight,
          clientWidth: main.clientWidth,
          clientHeight: main.clientHeight,
        } : null,
      },
      nodes,
      textRuns,
      assets,
    }
  }, { route, viewport, maxNodes: maxNodesPerPage, maxTextRuns: maxTextRunsPerPage })

  payload.status = status
  payload.error = error
  payload.diagnostics = diagnostics
  payload.durationMs = Date.now() - startedAt

  const pageDir = join(runDir, 'pages', viewport.key)
  const shotDir = join(runDir, 'screenshots', viewport.key)
  await mkdir(pageDir, { recursive: true })
  await mkdir(shotDir, { recursive: true })

  const pagePath = join(pageDir, `${route.key}.json`)
  const screenshotPath = join(shotDir, `${route.key}.png`)
  await writeFile(pagePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await page.screenshot({ path: screenshotPath, fullPage: false })

  page.off('console', onConsole)
  page.off('pageerror', onPageError)
  page.off('response', onResponse)
  page.off('requestfailed', onRequestFailed)

  return {
    routeKey: route.key,
    path: route.path,
    viewportKey: viewport.key,
    pageData: rel(pagePath),
    screenshot: rel(screenshotPath),
    status,
    error,
    diagnostics,
    nodeCount: payload.nodes.length,
    textRunCount: payload.textRuns.length,
    assetCount: (payload.assets.images.length + payload.assets.backgroundImages.length + payload.assets.inlineSvgs.length),
    bodyTextLength: payload.document.bodyTextLength,
    durationMs: payload.durationMs,
    payload,
  }
}

function buildFigmaReplaySpec({ manifest, routes, viewports, captures, tokenFile, assetFile }) {
  return {
    schemaVersion: 'figma-replay-spec.v1',
    intent: 'Rebuild captured web app routes as editable Figma frames.',
    recommendedPageStructure: [
      '00 Design Tokens',
      '01 Components Candidates',
      '02 Screens Desktop',
      '03 Screens Responsive',
      '99 Screenshot References',
    ],
    source: {
      app: manifest.app,
      baseUrl: manifest.baseUrl,
      projectId: manifest.projectId,
      tokenFile,
      assetFile,
    },
    framePlan: captures.map((capture) => ({
      frameName: `${capture.viewportKey} / ${capture.routeKey}`,
      routeKey: capture.routeKey,
      routePath: capture.path,
      viewportKey: capture.viewportKey,
      width: viewports.find((item) => item.key === capture.viewportKey)?.width,
      height: Math.max(
        viewports.find((item) => item.key === capture.viewportKey)?.height ?? 0,
        capture.payload?.document?.mainScroll?.scrollHeight ?? 0,
        capture.payload?.document?.height ?? 0,
      ),
      dataFile: capture.pageData,
      screenshotReference: capture.screenshot,
      reconstructionOrder: [
        'Create a frame using viewport width and extracted document/main scroll height.',
        'Create root containers from nodes with parentId null, preserving x/y/width/height.',
        'Create text from textRuns using font/color/line-height data.',
        'Create rectangles/frames from visible nodes with background, border, radius, or shadow.',
        'Place downloaded images and inline SVG references where available.',
        'Lock screenshot as bottom reference layer, then compare and adjust.',
      ],
    })),
    nodeKindMapping: {
      TEXT: 'Figma TextNode',
      IMAGE: 'Figma RectangleNode with image fill',
      VECTOR: 'Figma vector/SVG import candidate',
      FRAME: 'Figma FrameNode, prefer Auto Layout if flex/grid style is available',
      RECTANGLE_OR_FRAME: 'Figma RectangleNode or FrameNode depending on children',
      COMPONENT_CANDIDATE: 'Reusable component candidate such as button/input/tab',
      GROUP: 'Group or layout wrapper',
    },
    routes: routes.map(({ key, path, section, suggestedFrameName }) => ({ key, path, section, suggestedFrameName })),
  }
}

async function writeReadme(runDir, runManifestPath) {
  const readme = `# Figma Design Data Export

This folder contains browser-extracted design data that can be replayed into Figma.

Start with:
- \`${rel(runManifestPath)}\`
- \`${rel(join(runDir, 'figma-replay-spec.json'))}\`
- \`${rel(join(runDir, 'tokens.json'))}\`

Each route has:
- \`pages/<viewport>/<route>.json\`: editable DOM/CSS/layout data.
- \`screenshots/<viewport>/<route>.png\`: visual reference layer.

Recommended Figma import flow:
1. Create token pages from \`tokens.json\`.
2. Create one frame per entry in \`figma-replay-spec.json.framePlan\`.
3. Rebuild containers, text, images, and component candidates from each page JSON.
4. Place the screenshot at the bottom of each frame as a locked visual reference.
5. Replace repeated button/input/card groups with proper Figma components.
`
  await writeFile(join(runDir, 'README.md'), readme, 'utf8')
}

async function captureRouteInFreshBrowser({ route, viewport, baseUrl, runDir, session }) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu'],
  })

  try {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: 'light',
      locale: 'zh-CN',
    })

    await context.addInitScript(({ token }) => {
      if (token) {
        window.localStorage.setItem('auth_token', token)
        window.localStorage.setItem('access_token', token)
      }
      window.localStorage.setItem('onboarding_completed', 'true')
      window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
      window.localStorage.setItem('workbuddy_sidebar_open', 'true')
    }, { token: session.token })

    const page = await context.newPage()
    page.setDefaultTimeout(45000)

    try {
      return await capturePage(page, route, viewport, baseUrl, runDir)
    } finally {
      await page.close().catch(() => undefined)
      await context.close().catch(() => undefined)
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

async function captureRouteWithRetry(params) {
  try {
    return await captureRouteInFreshBrowser(params)
  } catch (firstError) {
    process.stdout.write(
      `[figma-extract] retry ${params.viewport.key} ${params.route.key}: ${
        firstError instanceof Error ? firstError.message : String(firstError)
      }\n`,
    )
    return await captureRouteInFreshBrowser(params)
  }
}

async function main() {
  const manifest = await readJsonFile(manifestPath)
  const projectId = process.env.PROJECT_ID || manifest?.projects?.standard?.id || defaultProjectId
  const month = process.env.FIGMA_EXTRACT_MONTH || process.env.UIUX_RELEASE_MONTH || defaultMonth
  const routes = selectedRoutes(buildRoutes(projectId, month))
  const viewports = selectedViewports()

  if (!routes.length) throw new Error('No routes selected for extraction.')
  if (!viewports.length) throw new Error('No viewports selected for extraction.')

  const { baseUrl, preview, source } = await resolveBaseUrl()
  const session = await resolveSession(manifest)
  const runId = getOutputRunId()
  const runDir = await prepareOutput(runId)

  const indexCss = await readFile(join(repoRoot, 'client', 'src', 'index.css'), 'utf8').catch(() => '')
  const tailwindConfig = await readFile(join(repoRoot, 'client', 'tailwind.config.js'), 'utf8').catch(() => '')
  const sourceTokens = extractSourceTokens(indexCss, tailwindConfig)

  const captures = []
  const pagePayloads = []

  try {
    if (browserMode === 'fresh-browser') {
      for (const viewport of viewports) {
        for (const route of routes) {
          process.stdout.write(`[figma-extract] ${viewport.key} ${route.key}\n`)
          const capture = await captureRouteWithRetry({ route, viewport, baseUrl, runDir, session })
          captures.push(capture)
          pagePayloads.push(capture.payload)
        }
      }
    } else {
      const browser = await chromium.launch({ headless: true })
      try {
        for (const viewport of viewports) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            colorScheme: 'light',
            locale: 'zh-CN',
          })

          await context.addInitScript(({ token }) => {
            if (token) {
              window.localStorage.setItem('auth_token', token)
              window.localStorage.setItem('access_token', token)
            }
            window.localStorage.setItem('onboarding_completed', 'true')
            window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
            window.localStorage.setItem('workbuddy_sidebar_open', 'true')
          }, { token: session.token })

          const page = await context.newPage()
          page.setDefaultTimeout(45000)

          try {
            for (const route of routes) {
              process.stdout.write(`[figma-extract] ${viewport.key} ${route.key}\n`)
              const capture = await capturePage(page, route, viewport, baseUrl, runDir)
              captures.push(capture)
              pagePayloads.push(capture.payload)
            }
          } finally {
            await page.close().catch(() => undefined)
            await context.close().catch(() => undefined)
          }
        }
      } finally {
        await browser.close().catch(() => undefined)
      }
    }
  } finally {
    if (preview) preview.kill()
  }

  const runtimeTokens = aggregateRuntimeTokens(pagePayloads)
  const assetManifest = await downloadAssets(pagePayloads, runDir)

  const tokenPayload = {
    schemaVersion: 'figma-token-export.v1',
    generatedAt: new Date().toISOString(),
    sourceTokens,
    runtimeTokens,
  }
  const tokenPath = join(runDir, 'tokens.json')
  const assetPath = join(runDir, 'assets.json')
  await writeFile(tokenPath, `${JSON.stringify(tokenPayload, null, 2)}\n`, 'utf8')
  await writeFile(assetPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), assets: assetManifest }, null, 2)}\n`, 'utf8')

  const runManifest = {
    schemaVersion: 'figma-design-data-manifest.v1',
    generatedAt: new Date().toISOString(),
    runId,
    app: 'project-management-dashboard',
    baseUrl,
    baseUrlSource: source,
    apiBaseUrl,
    authenticatedAs: session.username,
    projectId,
    month,
    outputDir: rel(runDir),
    viewports,
    routeCount: routes.length,
    captureCount: captures.length,
    routes: routes.map(({ key, path, section, suggestedFrameName }) => ({ key, path, section, suggestedFrameName })),
    captures: captures.map(({ payload, ...summary }) => summary),
    tokenFile: rel(tokenPath),
    assetFile: rel(assetPath),
    status: captures.some((capture) => capture.status !== 'captured' || capture.diagnostics.pageErrors.length)
      ? 'completed_with_warnings'
      : 'completed',
  }

  const runManifestPath = join(runDir, 'manifest.json')
  await writeFile(runManifestPath, `${JSON.stringify(runManifest, null, 2)}\n`, 'utf8')
  await writeFile(join(outputRoot, 'latest-manifest.json'), `${JSON.stringify(runManifest, null, 2)}\n`, 'utf8')

  const replaySpec = buildFigmaReplaySpec({
    manifest: runManifest,
    routes,
    viewports,
    captures,
    tokenFile: rel(tokenPath),
    assetFile: rel(assetPath),
  })
  await writeFile(join(runDir, 'figma-replay-spec.json'), `${JSON.stringify(replaySpec, null, 2)}\n`, 'utf8')
  await writeReadme(runDir, runManifestPath)

  const warningCount = captures.reduce(
    (total, capture) => total + capture.diagnostics.consoleErrors.length + capture.diagnostics.pageErrors.length + capture.diagnostics.apiFailures.length,
    0,
  )

  console.log(`Figma design data extracted: ${rel(runDir)}`)
  console.log(`Routes: ${routes.length}, viewports: ${viewports.length}, captures: ${captures.length}, warnings: ${warningCount}`)
  console.log(`Manifest: ${rel(runManifestPath)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
