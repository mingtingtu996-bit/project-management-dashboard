import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

function readSource(relativePath: string) {
  const candidates = [
    join(process.cwd(), relativePath),
    join(process.cwd(), 'client', relativePath),
  ]
  const filePath = candidates.find((candidate) => existsSync(candidate))
  if (!filePath) {
    throw new Error(`Unable to locate ${relativePath}`)
  }
  return readFileSync(filePath, 'utf8')
}

function listTsxFiles(relativeDir: string): string[] {
  const candidates = [
    join(process.cwd(), relativeDir),
    join(process.cwd(), 'client', relativeDir),
  ]
  const dir = candidates.find((candidate) => existsSync(candidate))
  if (!dir) return []

  const result: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
      } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        result.push(entryPath)
      }
    }
  }
  walk(dir)
  return result
}

describe('v1.3.1 UI/UX contract', () => {
  it('keeps core component contracts in source', () => {
    expect(readSource('src/index.css')).toContain('--brand-primary-hover: #1D4ED8')
    expect(readSource('src/components/ui/card.tsx')).not.toContain('=> null')
    expect(readSource('src/components/ui/button.tsx')).toContain('rounded-xl')
    expect(readSource('src/components/ui/select.tsx')).not.toContain('focus:ring')
    expect(readSource('src/components/ui/dialog.tsx')).toContain('min-h-11')
  })

  it('keeps interaction and accessibility fixes wired', () => {
    expect(readSource('src/pages/Notifications.tsx')).toContain('确认通知失败，请重试')
    expect(readSource('src/pages/Drawings/DrawingsPage.tsx')).toContain('加载图纸数据失败')
    expect(readSource('src/pages/GanttView/useGanttReferenceData.ts')).toContain('加载项目成员失败')
    expect(readSource('src/pages/Materials.tsx')).toContain('aria-label="材料名称"')
    expect(readSource('src/pages/Materials.tsx')).toContain('aria-label="取样确认"')
    expect(readSource('src/components/ChangePasswordDialog.tsx')).toContain('htmlFor="change-pwd-old"')
    expect(readSource('src/components/EditProfileDialog.tsx')).toContain('htmlFor="edit-profile-username"')
  })

  it('keeps dashboard and planning information architecture fixes', () => {
    const dashboardSource = readSource('src/pages/Dashboard.tsx')
    expect(dashboardSource).toContain('MetricCard as SharedMetricCard')
    expect(dashboardSource).not.toMatch(/sparkline=\{\s*\[/)
    expect(readSource('src/components/ui/metric-card.tsx')).toContain('sparklineData.length > 1')
    expect(dashboardSource).toContain('今日暂无进度变化')
    expect(dashboardSource).toContain('TodayProgressListPanel')

    const baselineSource = readSource('src/pages/planning/BaselinePage.tsx')
    const monthlySource = readSource('src/pages/planning/MonthlyPlanPage.tsx')
    expect(baselineSource).toContain('PlanningPageLayout')
    expect(monthlySource).toContain('PlanningPageLayout')
  })

  it('does not keep non-standard palette classes in production TSX', () => {
    const files = listTsxFiles('src')
      .filter((filePath) => !filePath.includes('__tests__'))
    const violations = files.flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      const forbiddenPalettePattern = new RegExp([
        'green-[0-9]',
        'pur' + 'ple-',
        'vio' + 'let-',
        'teal-',
        'cyan-',
      ].join('|'), 'g')
      const matches = source.match(forbiddenPalettePattern)
      return matches ? [`${filePath}: ${matches.join(', ')}`] : []
    })

    expect(violations).toEqual([])
  })
})
