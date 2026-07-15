import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const authToken = process.env.BROWSER_VERIFY_AUTH_TOKEN || 'dev-token-for-local-development'

const topLevelTargets = [
  { label: '仪表盘', expected: `/projects/${projectId}/dashboard` },
  { label: '里程碑', expected: `/projects/${projectId}/milestones` },
  { label: '计划编制', expected: `/projects/${projectId}/planning/baseline` },
  { label: '任务管理', expected: `/projects/${projectId}/gantt` },
  { label: '风险与问题', expected: `/projects/${projectId}/risks` },
  { label: '报表分析', expected: `/projects/${projectId}/reports` },
  { label: '专项管理', expected: `/projects/${projectId}/pre-milestones` },
  { label: '提醒中心', expected: '/notifications' },
]

const childTargets = [
  { open: '计划编制', label: '项目基线', expected: `/projects/${projectId}/planning/baseline` },
  { open: '计划编制', label: '月度计划', expected: `/projects/${projectId}/planning/monthly` },
  { open: '任务管理', label: '任务列表', expected: `/projects/${projectId}/gantt` },
  { open: '任务管理', label: '任务总结', expected: `/projects/${projectId}/task-summary` },
  { open: '任务管理', label: '责任主体', expected: `/projects/${projectId}/responsibility` },
  { open: '专项管理', label: '前期证照', expected: `/projects/${projectId}/pre-milestones` },
  { open: '专项管理', label: '施工图纸', expected: `/projects/${projectId}/drawings` },
  { open: '专项管理', label: '材料管控', expected: `/projects/${projectId}/materials` },
  { open: '专项管理', label: '验收时间轴', expected: `/projects/${projectId}/acceptance` },
]

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

async function settle(page, timeout = 2500) {
  try {
    await page.waitForLoadState('networkidle', { timeout })
  } catch {
    await page.waitForTimeout(700)
  }
}

async function pageSignature(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 260) ?? ''
    return {
      hash: location.hash,
      dashboard: document.querySelectorAll('[data-testid="dashboard-page"]').length,
      gantt: document.querySelectorAll('[data-testid="task-workspace-body"]').length,
      milestones: text.includes('节点偏差表') ? 1 : 0,
      planningBaseline: text.includes('项目基线') ? 1 : 0,
      monthlyPlan: text.includes('月度计划') ? 1 : 0,
      risks: text.includes('风险') || text.includes('问题') ? 1 : 0,
      reports: text.includes('报表') ? 1 : 0,
      bodyText: text,
    }
  })
}

async function linkDiagnostics(page, label) {
  return page.locator('#app-sidebar a').evaluateAll((links, text) => {
    return links
      .filter((link) => link.textContent?.replace(/\s+/g, ' ').trim().includes(text))
      .map((link) => {
        const rect = link.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        const hit = document.elementFromPoint(x, y)
        const style = getComputedStyle(link)
        return {
          text: link.textContent?.replace(/\s+/g, ' ').trim(),
          href: link.getAttribute('href'),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          pointerEvents: style.pointerEvents,
          visible: rect.width > 0 && rect.height > 0,
          hitTag: hit?.tagName ?? null,
          hitText: hit?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
        }
      })
  }, label)
}

async function clickSidebarLabel(page, label) {
  const link = page.locator('#app-sidebar a').filter({ hasText: label }).first()
  const count = await link.count()
  if (count === 0) {
    return { clicked: false, reason: 'link_not_found', diagnostics: [] }
  }
  const diagnostics = await linkDiagnostics(page, label)
  await link.click({ timeout: 8000 })
  await settle(page)
  return { clicked: true, diagnostics }
}

async function goGantt(page) {
  await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 30000 })
  await settle(page)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
const badResponses = []
const consoleMessages = []
const pageErrors = []

page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  }
})
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('response', async (response) => {
  const url = response.url()
  if (!url.includes('/api/')) return
  if (response.status() >= 400) {
    badResponses.push({ status: response.status(), url })
  }
})

await page.addInitScript((token) => {
  window.localStorage.setItem('auth_token', token)
  window.localStorage.setItem('access_token', token)
}, authToken)

await page.route(`${baseUrl}/api/**`, async (route) => {
  try {
    const forwardUrl = route.request().url().replace(baseUrl, apiBaseUrl)
    const response = await route.fetch({ url: forwardUrl })
    await route.fulfill({ response })
  } catch (error) {
    if (String(error?.message ?? '').includes('Request context disposed')) return
    throw error
  }
})

const result = {
  baseUrl,
  apiBaseUrl,
  projectId,
  topLevel: [],
  children: [],
  badResponses,
  consoleMessages,
  pageErrors,
}

try {
  for (const target of topLevelTargets) {
    await goGantt(page)
    const before = await pageSignature(page)
    const click = await clickSidebarLabel(page, target.label)
    const after = await pageSignature(page)
    result.topLevel.push({
      label: target.label,
      expectedHash: `#${target.expected}`,
      before,
      click,
      after,
      ok: after.hash === `#${target.expected}`,
    })
  }

  for (const target of childTargets) {
    await goGantt(page)
    if (target.open !== '任务管理') {
      await clickSidebarLabel(page, target.open)
      await settle(page)
    }
    const before = await pageSignature(page)
    const click = await clickSidebarLabel(page, target.label)
    const after = await pageSignature(page)
    result.children.push({
      open: target.open,
      label: target.label,
      expectedHash: `#${target.expected}`,
      before,
      click,
      after,
      ok: after.hash === `#${target.expected}`,
    })
  }

  console.log(JSON.stringify(result, null, 2))
  const failed = [...result.topLevel, ...result.children].filter((item) => !item.ok)
  if (failed.length > 0 || badResponses.length > 0 || pageErrors.length > 0) {
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
