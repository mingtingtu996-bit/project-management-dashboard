import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function readSource(...segments: string[]) {
  return readFileSync(join(clientRoot, ...segments), 'utf8')
}

describe('v1.4.20 workspace navigation contract', () => {
  it('keeps workspace as the universal landing and removes retired root-route fallbacks', () => {
    const app = readSource('src/App.tsx')
    const notFound = readSource('src/components/NotFoundPage.tsx')

    expect(app).toContain('<Route path="/" element={<Navigate to="/workspace" replace />} />')
    expect(app).not.toContain('<Route path="/projects"')
    expect(app).not.toContain('<Route path="/dashboard"')
    expect(app).toContain('isReservedProjectRoutePath(location.pathname)')
    expect(notFound).toContain('to="/workspace"')
    expect(app).not.toContain('<Route path="/dashboard" element={<Navigate to="/company" replace />} />')
    expect(notFound).not.toContain('to="/company"')
  })

  it('keeps project shell return and unauthenticated fallback pointed at workspace', () => {
    const projectLayout = readSource('src/components/layout/ProjectLayout.tsx')
    const sidebar = readSource('src/components/layout/Sidebar.tsx')
    const recentTasks = readSource('src/components/RecentTasksCard.tsx')

    expect(projectLayout).toContain("navigate(`/workspace?login=1&redirect=")
    expect(projectLayout).toContain("navigate('/workspace')")
    expect(projectLayout).not.toContain("navigate('/company')")
    expect(projectLayout).not.toContain("navigate(`/company?login=1&redirect=")
    expect(projectLayout).not.toContain('返回公司驾驶舱')

    expect(sidebar).toContain('to="/workspace"')
    expect(sidebar).toContain('返回工作台')
    expect(sidebar).not.toContain('to="/company?create=1"')
    expect(sidebar).not.toContain('返回公司驾驶舱')

    expect(recentTasks).not.toContain(": '/company'")
    expect(recentTasks).toContain(": '/workspace'")
  })

  it('allows company cockpit only for current company admins and redirects regular users to workspace', () => {
    const companyCockpit = readSource('src/pages/CompanyCockpit.tsx')
    const header = readSource('src/components/layout/Header.tsx')
    const sidebar = readSource('src/components/layout/Sidebar.tsx')
    const commandPalette = readSource('src/components/CommandPalette.tsx')
    const workspaceData = readSource('src/hooks/useWorkspaceData.ts')

    expect(companyCockpit).toContain('isCurrentCompanyAdmin')
    expect(companyCockpit).toContain("navigate('/workspace', { replace: true })")
    expect(companyCockpit).toContain('公司驾驶舱仅管理视角可见')
    expect(companyCockpit).not.toContain("searchParams.get('create')")
    expect(companyCockpit).toContain('useWorkspaceData')
    expect(companyCockpit).toContain('workspace.currentCompany ? workspace.currentCompany.role : null')

    expect(header).toContain('isCurrentCompanyAdmin')
    expect(header).toContain('useCurrentCompanyRole')
    expect(header).toContain("currentCompanyRole === 'company_admin'")
    expect(header).toContain('getGlobalRoleLabel(currentCompanyRole)')
    expect(header).not.toContain("(user?.globalRole || globalRole) === 'company_admin'")
    expect(header).not.toContain('getGlobalRoleLabel(user?.globalRole || globalRole)')
    expect(sidebar).toContain('useCurrentCompanyRole')
    expect(commandPalette).toContain('useCurrentCompanyRole')
    expect(workspaceData).toContain('syncCurrentCompanyContext')
    expect(workspaceData).toContain('const currentCompany = result.currentCompany ?? fallbackCompany')
    expect(workspaceData).toContain('role: currentCompany?.role ?? null')
  })

  it('keeps project creation entry inside workspace instead of /company?create=1', () => {
    const workspacePage = readSource('src/pages/WorkspacePage.tsx')
    const commandPalette = readSource('src/components/CommandPalette.tsx')
    const onboardingGuide = readSource('src/components/OnboardingGuide.tsx')
    const companyCockpit = readSource('src/pages/CompanyCockpit.tsx')

    expect(workspacePage).toContain('handleCreateCompany')
    expect(workspacePage).not.toContain("navigate('/company?create=1')")
    expect(commandPalette).not.toContain('/company?create=1')
    expect(commandPalette).not.toContain('quick-new-project')
    expect(commandPalette).not.toContain('新建项目 project add create')
    expect(companyCockpit).not.toContain('open-create-project')
    expect(onboardingGuide).not.toContain('顶部”新建项目”')
  })

  it('keeps wizard exit and notification login fallbacks out of company cockpit', () => {
    const projectInfoModule = readSource('src/pages/ProjectInfoModule/ProjectInfoModule.tsx')
    const notifications = readSource('src/pages/Notifications.tsx')
    const reports = readSource('src/pages/Reports.tsx')
    const riskManagement = readSource('src/pages/RiskManagement.tsx')

    expect(projectInfoModule).toContain("navigate(taskListReturnPath ?? '/workspace')")
    expect(projectInfoModule).not.toContain("navigate(taskListReturnPath ?? '/company')")
    expect(notifications).toContain('/workspace?login=1&redirect=')
    expect(notifications).not.toContain('/company?login=1&redirect=')
    expect(reports).not.toContain("projectId ? `/projects/${projectId}/risks` : '/company'")
    expect(reports).toContain("projectId ? `/projects/${projectId}/risks` : '/workspace'")
    expect(riskManagement).not.toContain("href: '/company'")
    expect(riskManagement).toContain("href: '/workspace'")
  })
})
