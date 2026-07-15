import { chromium } from 'playwright'
import { primeBrowserAuth } from '../browser-auth-fixture.mjs'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const taskUrl = `${baseUrl}/#/projects/${projectId}/gantt`

async function prime(page) {
  await primeBrowserAuth(page)
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_workspace_completed', 'true')
    localStorage.setItem('onboarding_project_completed', 'true')
    localStorage.setItem('onboarding_notifications_completed', 'true')
    localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
  })
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

try {
  await prime(page)
  await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('gantt-task-rows').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(3500)
  const layout = await page.evaluate(() => {
    const rectOf = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const rows = Array.from(document.querySelectorAll('[data-testid="gantt-task-title-inline-edit-trigger"]'))
      .slice(0, 12)
      .map((element, index) => {
        const rect = element.getBoundingClientRect()
        return {
          index,
          text: element.textContent?.replace(/\s+/g, ' ').trim(),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth,
        }
      })
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: window.scrollX, y: window.scrollY },
      metrics: rectOf('[data-testid="task-workspace-layer-l2"]'),
      businessHealth: rectOf('[data-testid="business-health-banner"]'),
      body: rectOf('[data-testid="task-workspace-body"]'),
      cardHeader: rectOf('[data-testid="task-workspace-layer-l3"]'),
      rowsContainer: rectOf('[data-testid="gantt-task-rows"]'),
      adapterToolbar: rectOf('[data-testid="gantt-task-list-toolbar"]'),
      rows,
    }
  })
  console.log(JSON.stringify(layout, null, 2))
} finally {
  await browser.close()
}
