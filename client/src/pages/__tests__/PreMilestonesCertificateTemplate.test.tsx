import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PreMilestones from '../PreMilestones'
import { useStore } from '@/hooks/useStore'

const { toastMock, getAuthHeadersMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  getAuthHeadersMock: vi.fn(() => ({})),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

vi.mock('@/lib/apiClient', () => ({
  getAuthHeaders: getAuthHeadersMock,
}))

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    canEdit: true,
    canManageTeam: true,
    loading: false,
    permissionLevel: 'editor',
    globalRole: 'admin',
  }),
}))

vi.mock('@/components/ui/dropdown-menu', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const passthrough = ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children)
  const content = ({ children, ...props }: { children: React.ReactNode }) => React.createElement('div', props, children)
  const item = ({ children, ...props }: { children: React.ReactNode }) => (
    React.createElement('button', { type: 'button', ...props }, children)
  )

  return {
    DropdownMenu: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: content,
    DropdownMenuItem: item,
    DropdownMenuLabel: content,
    DropdownMenuSeparator: () => React.createElement('hr'),
  }
})

vi.mock('../PreMilestones/components/CertificateTemplateApplyDialog', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  function CertificateTemplateApplyDialog(props: {
    open: boolean
    preview: { templateCode: string } | null
    selectedCertificateKeys: string[]
    onOpenChange: (open: boolean) => void
    onToggleCertificate?: (key: string, checked: boolean) => void
    onConfirm: () => void
  }) {
    const {
      open,
      preview,
      selectedCertificateKeys,
      onOpenChange,
      onToggleCertificate,
      onConfirm,
    } = props

    if (!open) return null
    return React.createElement(
      'div',
      { role: 'dialog', 'data-testid': 'certificate-template-dialog' },
      React.createElement('span', { 'data-testid': 'selected-certificate-count' }, String(selectedCertificateKeys.length)),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'certificate-template-unselect-land',
          onClick: () => onToggleCertificate?.('land_certificate', false),
        },
        'unselect land',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'certificate-template-confirm',
          onClick: onConfirm,
        },
        'confirm',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => onOpenChange(false),
        },
        'close',
      ),
    )
  }

  return { CertificateTemplateApplyDialog }
})

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitFor(predicate: () => boolean, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })
    if (predicate()) return
  }
  throw new Error('Timed out waiting for condition')
}

function getButton(container: HTMLElement, testId: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
  if (!button) throw new Error(`Button not found: ${testId}`)
  return button
}

async function openTemplateMenu(container: HTMLElement) {
  await waitFor(() => container.querySelector('[data-testid="pre-milestones-template-menu"]') !== null)
  await act(async () => {
    fireEvent.click(getButton(container, 'pre-milestones-template-menu'))
    await flush()
  })
}

const projectId = 'project-1'

const boardPayload = {
  summary: {
    completedCount: 0,
    totalCount: 4,
    blockingCertificateType: null,
    expectedReadyDate: null,
    overdueCount: 0,
    supplementCount: 0,
    weeklyActionCount: 0,
    criticalItems: [],
  },
  certificates: [],
  sharedItems: [],
}

const ledgerPayload = {
  items: [],
  totals: {
    overdueCount: 0,
    blockedCount: 0,
    supplementCount: 0,
  },
}

const templatePreview = {
  templateCode: 'general_construction_v1',
  templateName: 'General Construction Certificate Template',
  seedVersion: 'v1.4.22.2',
  projectId,
  summary: {
    certificateCreateCount: 2,
    workItemCreateCount: 2,
    dependencyCreateCount: 1,
    skippedExistingCount: 1,
    needsConfirmationCount: 0,
  },
  certificates: [
    {
      key: 'land_certificate',
      certificateType: 'land_certificate',
      certificateName: 'Land certificate',
      defaultStage: '资料准备',
      defaultStatus: 'pending',
      approvingAuthority: 'Natural resources bureau',
      requiredPolicy: 'required',
      reason: 'Main certificate',
      sortOrder: 1,
      action: 'will_create',
      selected: true,
    },
    {
      key: 'construction_permit',
      certificateType: 'construction_permit',
      certificateName: 'Construction permit',
      defaultStage: '资料准备',
      defaultStatus: 'pending',
      approvingAuthority: 'Housing bureau',
      requiredPolicy: 'required',
      reason: 'Existing project fact',
      sortOrder: 4,
      action: 'will_skip_existing',
      selected: false,
      existingId: 'cert-existing',
      skipReason: 'existing',
    },
  ],
  workItems: [
    {
      workItemCode: 'land_material_prepare',
      itemName: 'Land material preparation',
      itemStage: '资料准备',
      defaultStatus: 'pending',
      approvingAuthority: 'Natural resources bureau',
      isShared: true,
      certificateTypes: ['land_certificate'],
      requiredPolicy: 'required',
      planRole: 'mainline',
      criticality: 'blocking',
      defaultNextAction: 'Prepare materials',
      sortOrder: 1,
      action: 'will_create',
      selected: true,
      sourceEvidence: [],
      landAcquisitionMethodCodes: ['transfer'],
      provinceProfileCodes: [],
    },
    {
      workItemCode: 'construction_material_prepare',
      itemName: 'Construction material preparation',
      itemStage: '资料准备',
      defaultStatus: 'pending',
      approvingAuthority: 'Housing bureau',
      isShared: false,
      certificateTypes: ['construction_permit'],
      requiredPolicy: 'required',
      planRole: 'mainline',
      criticality: 'normal',
      defaultNextAction: 'Prepare construction permit materials',
      sortOrder: 2,
      action: 'will_create',
      selected: true,
      sourceEvidence: [],
      landAcquisitionMethodCodes: ['transfer'],
      provinceProfileCodes: [],
    },
  ],
  dependencies: [
    {
      dependencyCode: 'dep_land_to_work',
      predecessor: { type: 'certificate', certificateType: 'land_certificate' },
      successor: { type: 'work_item', workItemCode: 'land_material_prepare' },
      dependencyKind: 'hard',
      relationRole: 'mainline',
      reason: 'Certificate gates material work',
      action: 'will_create',
      selected: true,
      provinceProfileCodes: [],
    },
  ],
  materialPackages: [
    {
      packageCode: 'common_pack',
      packageName: 'Common package',
      packageScope: 'certificate_common',
      certificateTypes: ['land_certificate'],
      workItemCodes: ['land_material_prepare'],
      materialNames: ['Application form'],
      policyBasis: ['Seed'],
      requiredPolicy: 'required',
      sortOrder: 1,
      source: 'seed',
      selected: true,
    },
  ],
  materialEvidenceChains: [],
  handlingSteps: [],
  landAcquisition: {
    selectedMethodCode: 'transfer',
    source: 'default',
    methods: [
      {
        methodCode: 'transfer',
        methodName: 'Transfer',
        description: 'Transfer land',
        defaultSelected: true,
        workItemCodes: ['land_material_prepare'],
        materialNames: ['Land transfer contract'],
        policyBasis: ['Seed'],
        recommendedFor: ['New construction project'],
      },
      {
        methodCode: 'allocation',
        methodName: 'Allocation',
        description: 'Allocated land',
        workItemCodes: ['land_material_prepare'],
        materialNames: ['Allocation decision'],
        policyBasis: ['Seed'],
        recommendedFor: ['Public project'],
      },
    ],
  },
  provinceProfile: {
    provinceCode: 'default',
    provinceName: 'Default province',
    profileVersion: 'v1',
    source: 'default',
    applied: true,
    authorityAliases: {},
    additionalWorkItemCodes: [],
    optionalWorkItemCodes: [],
    softDependencyCodes: [],
    policySources: [
      {
        sourceName: 'Official source',
        sourceUrl: 'https://example.gov.cn/policy',
        checkedAt: '2026-05-01',
        updateMode: 'governed_seed_update',
      },
    ],
    notes: [],
  },
  provinceRuleSource: {
    recognizedProvinceCode: 'default',
    recognizedProvinceName: 'Default province',
    appliedProfileCode: 'default',
    appliedProfileName: 'Default province',
    source: 'default',
    recognitionAccuracy: 'default',
    updateMode: 'governed_seed_update',
    policyUpdatePolicy: 'trusted_source_auto_publish',
    sourceCheckedAt: '2026-05-01',
    nextReviewDueAt: '2026-12-01',
  },
  cityOverride: null,
  warnings: [],
}

function renderPage(container: HTMLElement, root: Root) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/pre-milestones`]}>
        <Routes>
          <Route path="/projects/:id/pre-milestones" element={<PreMilestones />} />
        </Routes>
      </MemoryRouter>,
    )
  })
}

describe('PreMilestones certificate template', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    toastMock.mockReset()
    getAuthHeadersMock.mockReset()
    getAuthHeadersMock.mockReturnValue({})
    fetchMock.mockReset()
    vi.mocked(window.localStorage.getItem).mockReset()
    vi.mocked(window.localStorage.setItem).mockReset()
    vi.mocked(window.localStorage.removeItem).mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useStore.setState({
      currentProject: {
        id: projectId,
        name: 'Template Project',
      } as never,
      projects: [] as never,
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/pre-milestones/board')) {
        return { ok: true, json: async () => ({ success: true, data: boardPayload }) }
      }
      if (url.includes('/pre-milestones/ledger')) {
        return { ok: true, json: async () => ({ success: true, data: ledgerPayload }) }
      }
      if (url.includes('/certificate-templates/system/preview')) {
        return { ok: true, json: async () => ({ success: true, data: templatePreview }) }
      }
      if (url.includes('/certificate-templates/system/apply')) {
        const body = init?.body ? JSON.parse(String(init.body)) : null
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              templateCode: body?.templateCode,
              seedVersion: body?.seedVersion,
              projectId,
              createdCertificateIds: ['cert-created'],
              createdWorkItemIds: ['work-created'],
              createdDependencyIds: ['dep-created'],
              skippedExisting: [],
            },
          }),
        }
      }
      throw new Error(`Unhandled request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    root?.unmount()
    container.remove()
    vi.unstubAllGlobals()
  })

  it('loads template preview without replacing the main workspace first screen', async () => {
    renderPage(container, root!)

    await waitFor(() => fetchMock.mock.calls.some(([url]) => String(url).includes('/certificate-templates/system/preview')))

    expect(container.querySelector('[data-testid="pre-milestones-overview"]')).not.toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('sends auth and company headers when loading certificate read models', async () => {
    getAuthHeadersMock.mockReturnValue({
      Authorization: 'Bearer test-auth-token',
      'X-Company-Id': 'company-1',
    })

    renderPage(container, root!)

    await waitFor(() => fetchMock.mock.calls.some(([url]) => String(url).includes('/certificate-templates/system/preview')))

    const guardedPaths = [
      '/pre-milestones/board',
      '/pre-milestones/ledger',
      '/certificate-templates/system/preview',
    ]

    for (const path of guardedPaths) {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes(path))
      expect(call, path).toBeTruthy()
      const headers = new Headers(call?.[1]?.headers)
      expect(headers.get('Authorization'), path).toBe('Bearer test-auth-token')
      expect(headers.get('X-Company-Id'), path).toBe('company-1')
    }
  })

  it('keeps the board workspace visible while template preview is still loading', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/pre-milestones/board')) {
        return { ok: true, json: async () => ({ success: true, data: boardPayload }) }
      }
      if (url.includes('/pre-milestones/ledger')) {
        return { ok: true, json: async () => ({ success: true, data: ledgerPayload }) }
      }
      if (url.includes('/certificate-templates/system/preview')) {
        return new Promise(() => {})
      }
      throw new Error(`Unhandled request: ${url}`)
    })

    renderPage(container, root!)

    await waitFor(() => fetchMock.mock.calls.some(([url]) => String(url).includes('/certificate-templates/system/preview')))
    await act(async () => {
      await flush()
    })

    expect(container.querySelector('[data-testid="pre-milestones-tab-board"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="pre-milestones-overview"]')).toBeTruthy()
  })

  it('opens system template dialog and applies the preview payload', async () => {
    renderPage(container, root!)

    await openTemplateMenu(container)
    await waitFor(() => document.body.querySelector('[data-testid="pre-milestones-apply-system-template"]') !== null)

    await act(async () => {
      fireEvent.click(getButton(document.body, 'pre-milestones-apply-system-template'))
      await flush()
    })
    await waitFor(() => document.body.querySelector('[data-testid="certificate-template-confirm"]') !== null)

    await act(async () => {
      fireEvent.click(getButton(document.body, 'certificate-template-unselect-land'))
      await flush()
    })
    await waitFor(() => document.body.querySelector('[data-testid="selected-certificate-count"]')?.textContent === '0')

    await act(async () => {
      fireEvent.click(getButton(document.body, 'certificate-template-confirm'))
      await flush()
    })

    await waitFor(() => fetchMock.mock.calls.some(([url]) => String(url).includes('/certificate-templates/system/apply')))
    const applyCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/certificate-templates/system/apply'))
    const payload = JSON.parse(String(applyCall?.[1]?.body))

    expect(payload).toMatchObject({
      templateCode: 'general_construction_v1',
      seedVersion: 'v1.4.22.2',
      duplicatePolicy: 'skip_existing',
      landAcquisitionMethodCode: 'transfer',
    })
    expect(payload.selectedCertificateKeys).toEqual([])
    expect(payload.selectedWorkItemCodes).toEqual(['land_material_prepare', 'construction_material_prepare'])
    expect(payload.selectedDependencyCodes).toEqual(['dep_land_to_work'])
    expect(toastMock).toHaveBeenCalled()
  })

  it('shows a toast when applying the template fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/pre-milestones/board')) {
        return { ok: true, json: async () => ({ success: true, data: boardPayload }) }
      }
      if (url.includes('/pre-milestones/ledger')) {
        return { ok: true, json: async () => ({ success: true, data: ledgerPayload }) }
      }
      if (url.includes('/certificate-templates/system/preview')) {
        return { ok: true, json: async () => ({ success: true, data: templatePreview }) }
      }
      if (url.includes('/certificate-templates/system/apply')) {
        return {
          ok: true,
          json: async () => ({
            success: false,
            error: { message: 'apply failed' },
          }),
        }
      }
      throw new Error(`Unhandled request: ${url}`)
    })

    renderPage(container, root!)

    await openTemplateMenu(container)
    await waitFor(() => document.body.querySelector('[data-testid="pre-milestones-apply-system-template"]') !== null)
    await act(async () => {
      fireEvent.click(getButton(document.body, 'pre-milestones-apply-system-template'))
      await flush()
    })
    await waitFor(() => document.body.querySelector('[data-testid="certificate-template-confirm"]') !== null)

    await act(async () => {
      fireEvent.click(getButton(document.body, 'certificate-template-confirm'))
      await flush()
    })

    await waitFor(() => toastMock.mock.calls.some(([toast]) => toast?.description === 'apply failed'))
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      description: 'apply failed',
      variant: 'destructive',
    }))
  })
})
