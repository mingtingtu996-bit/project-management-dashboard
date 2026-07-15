import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspacePage } from '../WorkspacePage'
import type { WorkspaceData } from '@/hooks/useWorkspaceData'

const workspaceMock = vi.hoisted(() => ({
  state: null as WorkspaceData | null,
}))

const apiMocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext')
  return {
    ...actual,
    useAuth: () => ({
      user: {
        display_name: '林工',
        username: 'lin',
      },
    }),
  }
})

vi.mock('@/hooks/useWorkspaceData', () => ({
  useWorkspaceData: () => {
    if (!workspaceMock.state) throw new Error('workspace mock not configured')
    return workspaceMock.state
  },
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: apiMocks.apiGet,
  apiPost: vi.fn(),
  getApiErrorMessage: (error: unknown, fallback = '请求失败') => error instanceof Error ? error.message : fallback,
}))

function baseWorkspace(overrides: Partial<WorkspaceData>): WorkspaceData {
  return {
    loading: false,
    error: null,
    hasCompany: true,
    currentCompany: {
      id: 'company-1',
      name: '华东一公司',
      role: 'company_admin',
      isCurrent: true,
    },
    switchableCompanies: [
      { id: 'company-1', name: '华东一公司', role: 'company_admin', isCurrent: true },
      { id: 'company-2', name: '西南分公司', role: 'regular', isCurrent: false },
    ],
    myProjects: [],
    recentProjects: [],
    companyProjects: [],
    joinableProjects: [],
    pendingInvitations: [],
    joinRequests: [],
    demoEntry: { available: true, label: '产品预览', route: '/demo' },
    emptyStateReason: null,
    refresh: vi.fn(),
    createCompany: vi.fn(async () => ({ id: 'company-created', name: '我的公司', role: 'company_admin' as const })),
    switchCompany: vi.fn(),
    acceptInvitation: vi.fn(),
    declineInvitation: vi.fn(),
    requestJoinProject: vi.fn(),
    ...overrides,
  }
}

function renderPage(state: Partial<WorkspaceData>) {
  workspaceMock.state = baseWorkspace(state)
  return render(
    <MemoryRouter initialEntries={['/workspace']}>
      <WorkspacePage />
    </MemoryRouter>,
  )
}

describe('WorkspacePage v1.4.20.1', () => {
  beforeEach(() => {
    workspaceMock.state = null
    vi.clearAllMocks()
    apiMocks.apiGet.mockResolvedValue({})
  })

  it('renders the no-company start card with user context and preview entry', () => {
    renderPage({
      hasCompany: false,
      currentCompany: null,
      switchableCompanies: [],
      emptyStateReason: 'no_company',
    })

    const page = screen.getByTestId('workspace-no-company')
    expect(within(page).getByText('欢迎，林工')).toBeInTheDocument()
    expect(within(page).getByRole('button', { name: /创建公司/ })).toBeInTheDocument()
    expect(within(page).getByRole('button', { name: /加入已有公司/ })).toBeInTheDocument()
    expect(within(page).getByRole('button', { name: /查看产品预览/ })).toBeInTheDocument()
  })

  it('keeps empty-project users on a useful workspace with pending and joinable sections', () => {
    renderPage({
      emptyStateReason: 'no_project_membership',
      pendingInvitations: [
        {
          id: 'inv-1',
          projectId: 'project-1',
          projectName: '1#楼主体施工',
          inviterName: '项目经理',
          invitedAt: '2026-05-01T00:00:00.000Z',
          companyName: '华东一公司',
        },
      ],
      joinableProjects: [
        {
          id: 'project-2',
          name: '地下室机电安装',
          projectType: '房建',
          stage: '施工中',
          ownerName: '王工',
          location: '上海',
        },
      ],
    })

    expect(screen.getByTestId('workspace-empty-projects')).toBeInTheDocument()
    expect(screen.getByText('你已加入 华东一公司，但还未加入任何项目。')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-pending')).toHaveTextContent('项目经理 邀请你加入 1#楼主体施工')
    expect(screen.getByTestId('workspace-joinable')).toHaveTextContent('地下室机电安装')
    expect(screen.getByTestId('workspace-preview-entry')).toBeInTheDocument()
  })

  it('renders normal workspace sections for project work and company admins', () => {
    const project = {
      id: 'project-1',
      name: '总部基地一期',
      projectType: '房建',
      stage: '主体结构',
      ownerName: '张工',
      location: '南京',
      healthScore: 88,
      progress: 42,
      criticalPathCount: 3,
      lastActivityAt: '2026-05-15T08:00:00.000Z',
      myRole: 'company_admin' as const,
    }

    renderPage({
      myProjects: [project],
      recentProjects: [project],
      companyProjects: [project, { ...project, id: 'project-2', name: '商业配套二期', myRole: 'owner' }],
      pendingInvitations: [
        {
          id: 'inv-1',
          projectId: 'project-3',
          projectName: '幕墙专项',
          inviterName: '李工',
          invitedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      joinRequests: [
        {
          id: 'join-1',
          projectId: 'project-4',
          projectName: '精装修样板段',
          status: 'pending',
        },
      ],
      joinableProjects: [
        {
          id: 'project-5',
          name: '屋面工程',
          projectType: '房建',
          stage: '待开工',
          ownerName: '赵工',
        },
      ],
    })

    expect(screen.getByTestId('workspace-normal')).toHaveTextContent('林工')
    expect(screen.getByTestId('workspace-quick-metrics')).toHaveTextContent('待处理邀请')
    expect(screen.getByTestId('workspace-recent-projects')).toHaveTextContent('总部基地一期')
    expect(screen.getByTestId('workspace-my-projects')).toHaveTextContent('公司全量')
    expect(screen.getByTestId('workspace-pending')).toHaveTextContent('你已申请加入 精装修样板段')
    expect(screen.getByTestId('workspace-joinable')).toHaveTextContent('屋面工程')
    expect(screen.getByTestId('workspace-preview-entry')).toBeInTheDocument()
    expect(screen.queryByTestId('v14231-page-readiness-boundary')).not.toBeInTheDocument()
    expect(apiMocks.apiGet).not.toHaveBeenCalled()
  })

  it('submits a join request with the entered reason', async () => {
    const requestJoinProject = vi.fn(async () => undefined)
    renderPage({
      requestJoinProject,
      joinableProjects: [
        {
          id: 'project-7',
          name: '屋面工程',
          projectType: '房建',
          stage: '待开工',
          ownerName: '赵工',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: '申请加入' }))
    fireEvent.change(screen.getByTestId('workspace-request-join-reason'), {
      target: { value: '需要参与计划协同' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }))

    await waitFor(() => {
      expect(requestJoinProject).toHaveBeenCalledWith('project-7', '需要参与计划协同')
    })
  })

  it('keeps the join request sheet open with inline errors when submission fails', async () => {
    const requestJoinProject = vi.fn(async () => {
      throw new Error('项目已不可申请')
    })
    renderPage({
      requestJoinProject,
      joinableProjects: [
        {
          id: 'project-8',
          name: '幕墙专项',
          projectType: '房建',
          stage: '施工中',
          ownerName: '李工',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: '申请加入' }))
    fireEvent.change(screen.getByTestId('workspace-request-join-reason'), {
      target: { value: '需要查看专项任务' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }))

    await waitFor(() => {
      expect(screen.getByTestId('workspace-request-join-error')).toHaveTextContent('项目已不可申请')
    })
    expect(screen.getByTestId('workspace-request-join-reason')).toHaveValue('需要查看专项任务')
  })
})
