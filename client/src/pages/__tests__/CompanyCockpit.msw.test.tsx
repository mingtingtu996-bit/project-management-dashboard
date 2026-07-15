import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearApiClientRuntimeCache } from '@/lib/apiClient'
import { companyDashboardSummary } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import CompanyCockpit from '../CompanyCockpit'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setProjects: vi.fn(),
  fetchProjectsFromApi: vi.fn(),
  listCompanyProjectDrafts: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext')
  return {
    ...actual,
    useAuth: () => ({
    isAuthenticated: true,
    loading: false,
    user: {
      id: 'msw-user-1',
      username: 'msw-admin',
      display_name: 'MSW Admin',
      globalRole: 'company_admin',
      currentCompanyId: 'msw-company',
      currentCompanyRole: 'company_admin',
    },
    }),
  }
})

vi.mock('@/hooks/useWorkspaceData', () => ({
  useWorkspaceData: () => ({
    loading: false,
    currentCompany: {
      id: 'msw-company',
      name: 'MSW Company',
      role: 'company_admin',
    },
    companies: [],
    activeCompanyId: 'msw-company',
    refresh: vi.fn(),
  }),
}))

vi.mock('@/hooks/useStore', () => ({
  useStore: (selector: (state: { setProjects: typeof mocks.setProjects }) => unknown) => selector({
    setProjects: mocks.setProjects,
  }),
}))

vi.mock('@/lib/projectApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/projectApi')>('@/lib/projectApi')

  return {
    ...actual,
    fetchProjectsFromApi: mocks.fetchProjectsFromApi,
  }
})

vi.mock('@/components/project/wizard/projectWizardApi', () => ({
  createWizardProjectDraft: vi.fn(),
  deleteWizardProjectDraft: vi.fn(),
  listCompanyProjectDrafts: mocks.listCompanyProjectDrafts,
}))

describe('CompanyCockpit MSW deterministic smoke', () => {
  let restoreBoundingClientRect = () => undefined

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList.contains('recharts-responsive-container')) {
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 960,
          bottom: 320,
          left: 0,
          width: 960,
          height: 320,
          toJSON: () => ({}),
        }
      }
      return originalGetBoundingClientRect.call(this)
    }
    restoreBoundingClientRect = () => {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
    }
    clearApiClientRuntimeCache()
    mocks.navigate.mockReset()
    mocks.setProjects.mockReset()
    mocks.fetchProjectsFromApi.mockResolvedValue([])
    mocks.listCompanyProjectDrafts.mockResolvedValue([])
  })

  afterEach(() => {
    restoreBoundingClientRect()
    server.resetHandlers()
    clearApiClientRuntimeCache()
  })

  afterAll(() => {
    server.close()
  })

  it('renders the company cockpit from MSW summary data without a live backend', async () => {
    render(
      <MemoryRouter>
        <CompanyCockpit />
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('company-cockpit-page')).toBeInTheDocument()
    expect(await screen.findByTestId('company-hero')).toBeInTheDocument()
    expect(await screen.findByTestId('v14231-page-readiness-boundary')).toHaveTextContent(
      '当前页按只展示边界运行，主结论与自动处置保持禁用。',
    )

    const rows = await screen.findAllByTestId('company-project-row')
    expect(rows).toHaveLength(companyDashboardSummary.ranking.length)
    expect(within(rows[0]).getByText('MSW Tower')).toBeInTheDocument()
    expect(within(rows[1]).getByText('MSW Library')).toBeInTheDocument()

    expect(mocks.fetchProjectsFromApi).toHaveBeenCalledOnce()
  })

  it('binds the project deletion confirmation header to the selected project', async () => {
    const user = userEvent.setup()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let deletedProjectId: string | null = null
    let confirmationHeader: string | null = null

    server.use(
      http.delete('/api/projects/:projectId', ({ request, params }) => {
        deletedProjectId = String(params.projectId)
        confirmationHeader = request.headers.get('x-workbuddy-confirm-action')
        return HttpResponse.json({ success: true })
      }),
    )

    render(
      <MemoryRouter>
        <CompanyCockpit />
      </MemoryRouter>,
    )

    const rows = await screen.findAllByTestId('company-project-row')
    await user.click(within(rows[0]).getByRole('button', { name: '项目操作：MSW Tower' }))
    await user.click(await screen.findByRole('menuitem', { name: '删除项目' }))
    expect(await screen.findByTestId('project-delete-guard')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(deletedProjectId).toBe('msw-project-1'))
    expect(confirmationHeader).toBe('delete-project:msw-project-1')
    const emittedZeroSizeWarning = consoleWarn.mock.calls.some(([message]) => (
      String(message).includes('The width(0) and height(0)')
    ))
    consoleWarn.mockRestore()
    expect(emittedZeroSizeWarning).toBe(false)
  }, 15_000)
})
