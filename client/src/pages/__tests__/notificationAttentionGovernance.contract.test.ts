import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSrc(relPath: string) {
  const candidates = [
    join(process.cwd(), relPath),
    join(process.cwd(), 'client', relPath),
    join(process.cwd(), '..', relPath),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8')
  }
  throw new Error(`Unable to read ${relPath}`)
}

describe('notification attention governance frontend contracts', () => {
  it('does not treat a loaded zero attention summary as a failed summary fallback', () => {
    const hook = readSrc('src/hooks/useAttentionSummary.ts')
    const header = readSrc('src/components/layout/Header.tsx')
    const sidebar = readSrc('src/components/layout/Sidebar.tsx')

    expect(hook).toContain('loaded')
    expect(header).toContain('attentionSummaryLoaded')
    expect(header).not.toContain('attentionSummary.totalAttentionCount ||')
    expect(sidebar).toContain('unifiedAttentionLoaded')
    expect(sidebar).not.toContain('unifiedAttention?.totalAttentionCount ||')
  })

  it('loads all notification touchpoints by default on the Notifications page', () => {
    const notifications = readSrc('src/pages/Notifications.tsx')

    expect(notifications).toContain('touchpointType=all')
    expect(notifications).not.toContain("let url = '/api/notifications?limit=100'")
  })

  it('provides touchpoint filters on the Notifications page without changing backend fetch scope', () => {
    const notifications = readSrc('src/pages/Notifications.tsx')

    expect(notifications).toContain('type TouchpointFilter')
    expect(notifications).toContain('TOUCHPOINT_FILTER_OPTIONS')
    expect(notifications).toContain('data-testid="notifications-touchpoint-chips"')
    expect(notifications).toContain('setTouchpointFilter')
    expect(notifications).toContain("touchpointFilter === 'all'")
    expect(notifications).toContain("item.touchpointType || 'persistent'")
  })

  it('labels Dashboard project-wide today actions separately from notification today todos', () => {
    const dashboard = readSrc('src/pages/Dashboard.tsx')
    const dashboardApi = readSrc('src/services/dashboardApi.ts')

    expect(dashboardApi).toContain('projectTodayActionCount?: number')
    expect(dashboard).toContain('projectTodayActionCount')
    expect(dashboard).toContain('summaryData?.projectTodayActionCount ?? summaryData?.todayTodoCount')
  })
})
