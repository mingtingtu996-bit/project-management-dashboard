import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import {
  isIgnorableBrowserConsoleError,
  primeBrowserAuth,
} from './browser-auth-fixture.mjs'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(__filename), '..')
const defaultCloakBrowserExecutable = 'C:\\Users\\jjj64\\.codex\\tools\\CloakBrowser-release\\chromium-v146.0.7680.177.4\\chrome.exe'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function parseStringArg(args, name) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

function parseRepeatedStringArgs(args, name) {
  const prefix = `--${name}=`
  return args
    .filter((item) => item.startsWith(prefix))
    .map((item) => item.slice(prefix.length))
    .map(normalizeText)
    .filter(Boolean)
}

function routeUrl(baseUrl, route) {
  const base = normalizeText(baseUrl).replace(/\/$/, '')
  const normalizedRoute = normalizeText(route) || '/'
  if (/^https?:\/\//i.test(normalizedRoute)) return normalizedRoute
  if (normalizedRoute.startsWith('/#/')) return `${base}${normalizedRoute}`
  if (normalizedRoute.startsWith('#/')) return `${base}/${normalizedRoute}`
  if (normalizedRoute.startsWith('/')) return `${base}${normalizedRoute}`
  return `${base}/${normalizedRoute}`
}

function screenshotPath(outputFile, route, index) {
  if (!outputFile) return null
  const safeRoute = (route || 'root')
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'root'
  return join(dirname(outputFile), `cloakbrowser-route-${index + 1}-${safeRoute}.png`)
}

function authTokenStatus() {
  const source = process.env.BROWSER_VERIFY_AUTH_TOKEN
    ? 'BROWSER_VERIFY_AUTH_TOKEN'
    : process.env.WORKBUDDY_LIVE_AUTH_TOKEN
      ? 'WORKBUDDY_LIVE_AUTH_TOKEN'
      : null
  return {
    present: Boolean(source),
    source,
  }
}

function buildBoundaryPolicy() {
  return [
    'cloakbrowser_route_smoke_is_http_ui_only',
    'dbEvidenceIncluded=false',
    'route_smoke_does_not_replace_db_query_log_catalog_lock_migration_publication_or_rollback_evidence',
    '5xx_browser_console_errors_block_route_smoke',
    'auth_token_is_not_written_to_report',
  ]
}

export function isBlockingConsoleMessage(message) {
  const text = normalizeText(message?.text ?? message)
  return /\b5\d\d\b|internal server error/i.test(text)
}

export function isBlockingHttpResponseStatus(status) {
  return Number(status) >= 500
}

export async function run() {
  const args = process.argv.slice(2)
  const baseUrl = parseStringArg(args, 'base-url') || process.env.BASE_URL || 'http://127.0.0.1:5173'
  const executablePath = parseStringArg(args, 'executable-path')
    || process.env.CLOAK_BROWSER_EXECUTABLE
    || defaultCloakBrowserExecutable
  const outputFile = parseStringArg(args, 'output-file')
    || join(repoRoot, 'artifacts', 'test-runs', '20260628-v14231-live-execution', 'cloakbrowser-route-smoke-current.json')
  const routes = parseRepeatedStringArgs(args, 'route')
  const routeList = routes.length > 0 ? routes : ['/', '/#/company']
  const generatedAt = new Date().toISOString()
  const consoleMessages = []
  const httpFailures = []
  const pageErrors = []
  const auth = authTokenStatus()
  const screenshots = []
  const routeResults = []
  let browser = null

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
    })
    const page = await browser.newPage({
      viewport: { width: 1365, height: 900 },
    })
    page.on('console', (message) => {
      const text = message.text()
      if (!isIgnorableBrowserConsoleError(text)) {
        consoleMessages.push({
          type: message.type(),
          text: text.slice(0, 500),
        })
      }
    })
    page.on('pageerror', (error) => {
      pageErrors.push(error.message.slice(0, 500))
    })
    page.on('response', (response) => {
      const status = response.status()
      if (isBlockingHttpResponseStatus(status)) {
        httpFailures.push({
          status,
          statusText: response.statusText().slice(0, 120),
          url: response.url().slice(0, 500),
        })
      }
    })

    if (auth.present) {
      await primeBrowserAuth(page, process.env.BROWSER_VERIFY_AUTH_TOKEN || process.env.WORKBUDDY_LIVE_AUTH_TOKEN)
    }

    for (const [index, route] of routeList.entries()) {
      const url = routeUrl(baseUrl, route)
      const startedAt = Date.now()
      const result = {
        route,
        url,
        status: 'blocked',
        httpStatus: null,
        elapsedMs: null,
        title: null,
        finalUrl: null,
        screenshot: null,
        error: null,
      }
      try {
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        })
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined)
        result.httpStatus = response?.status() ?? null
        result.title = await page.title()
        result.finalUrl = page.url()
        result.elapsedMs = Date.now() - startedAt
        result.status = result.httpStatus && result.httpStatus >= 500 ? 'fail' : 'pass'
        const shot = screenshotPath(outputFile, route, index)
        if (shot) {
          mkdirSync(dirname(shot), { recursive: true })
          await page.screenshot({ path: shot, fullPage: true })
          result.screenshot = shot
          screenshots.push(shot)
        }
      } catch (error) {
        result.elapsedMs = Date.now() - startedAt
        result.error = error instanceof Error ? error.message : String(error)
      }
      routeResults.push(result)
    }
  } finally {
    await browser?.close().catch(() => undefined)
  }

  const routeFailures = routeResults.filter((route) => route.status !== 'pass')
  const consoleFailures = consoleMessages.filter(isBlockingConsoleMessage)
  const uniqueHttpFailures = Array.from(new Map(
    httpFailures.map((failure) => [`${failure.status}:${failure.url}`, failure]),
  ).values())
  const report = {
    reportCode: 'v14231_cloakbrowser_route_smoke',
    generatedAt,
    baseUrl,
    executablePath,
    browser: {
      engine: 'CloakBrowser',
      launched: true,
    },
    authToken: auth,
    status: routeFailures.length === 0
      && pageErrors.length === 0
      && consoleFailures.length === 0
      && uniqueHttpFailures.length === 0
      ? 'pass'
      : 'blocked',
    dbEvidenceIncluded: false,
    routeResults,
    screenshots,
    consoleMessageCount: consoleMessages.length,
    consoleMessages,
    consoleFailureCount: consoleFailures.length,
    consoleFailures,
    httpFailureCount: uniqueHttpFailures.length,
    httpFailures: uniqueHttpFailures,
    pageErrors,
    missingEvidenceCategories: [
      'db_query_log',
      'postgres_catalog_readback',
      'advisory_lock_telemetry',
      'migration_replay',
      'runtime_publication_apply',
      'runtime_publication_rollback',
    ],
    boundaryPolicy: buildBoundaryPolicy(),
  }

  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'pass') {
    process.exitCode = 1
  }
}

function writeBlockedLaunchReport(error) {
  const outputFile = parseStringArg(process.argv.slice(2), 'output-file')
    || join(repoRoot, 'artifacts', 'test-runs', '20260628-v14231-live-execution', 'cloakbrowser-route-smoke-current.json')
  const report = {
    reportCode: 'v14231_cloakbrowser_route_smoke',
    generatedAt: new Date().toISOString(),
    status: 'blocked',
    dbEvidenceIncluded: false,
    error: error instanceof Error ? error.message : String(error),
    boundaryPolicy: buildBoundaryPolicy(),
  }
  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch(writeBlockedLaunchReport)
}
