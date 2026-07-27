import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import ProjectInfoModule, {
  PROFILE_PREVIEW_TIMEOUT_MESSAGE,
  withProfilePreviewTimeout,
} from '@/pages/ProjectInfoModule/ProjectInfoModule'
import {
  commitWizardProject,
  getWizardGenerationStatus,
  listCompanyProjectDrafts,
  listCompanyProjectTemplates,
  listVisibleProjects,
  previewWizardProfile,
} from '@/components/project/wizard/projectWizardApi'
import { ApiClientError } from '@/lib/apiClient'

vi.mock('@/context/AuthContext', () => ({
  useAuth: (() => {
    const user = {
      id: 'user-1',
      currentCompanyId: 'company-1',
      metadata: { wizard_onboarded_at: '2026-05-01T00:00:00Z' },
    }
    return () => ({ user })
  })(),
}))

vi.mock('@/components/project/wizard/WizardOnboardingTour', () => ({
  WizardOnboardingTour: () => null,
}))

vi.mock('@/components/project/wizard/projectWizardApi', () => ({
  listCompanyProjectTemplates: vi.fn().mockResolvedValue([]),
  listCompanyProjectDrafts: vi.fn().mockResolvedValue([]),
  listVisibleProjects: vi.fn().mockResolvedValue([]),
  saveWizardProjectDraft: vi.fn().mockResolvedValue({ id: 'project-1', lastSaved: new Date().toISOString(), step: 1 }),
  createWizardProjectDraft: vi.fn().mockResolvedValue({ id: 'project-1', projectId: 'project-1', status: 'wizard_drafting' }),
  commitWizardProject: vi.fn().mockResolvedValue({ id: 'project-1', projectId: 'project-1', status: '进行中' }),
  getWizardGenerationStatus: vi.fn(),
  previewWizardProfile: vi.fn().mockResolvedValue({
    estimatedRowCount: 0,
    recommendation: { matchedTemplates: [] },
    profile: {
      identity: {},
      scale: {},
      features: { inferred: {} },
      methods: { methodVariantCodes: [] },
      generation: { templateCount: 0, milestoneCount: 0 },
      issues: [],
    },
  }),
  listMilestonePresets: vi.fn().mockResolvedValue([]),
}))

function renderWizard(options: {
  initialPath?: string
  mode?: 'generate' | 'adjust'
  onExit?: () => void
  onGenerated?: (projectId: string, targetParams: string) => void
} = {}) {
  const onExit = options.onExit ?? vi.fn()
  const onGenerated = options.onGenerated ?? vi.fn()
  const initialPath = options.initialPath ?? '/projects/project-1/gantt?modelingWorkbench=generate'
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ProjectInfoModule
        embedded
        projectId="project-1"
        initialMode={options.mode ?? 'generate'}
        onExit={onExit}
        onGenerated={onGenerated}
      />
    </MemoryRouter>,
  )
  return { onExit, onGenerated }
}

function clickGlobalNext(times = 1) {
  for (let index = 0; index < times; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  }
}

async function completeMinimalScopeModel() {
  fireEvent.change(await screen.findByLabelText('空间名称'), { target: { value: '1#楼' } })
  fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  fireEvent.change(screen.getByLabelText('起始层'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('结束层'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: '生成楼层' }))
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
}

describe('ProjectInfoModule embedded workbench content', () => {
  it('does not load entry template, draft, or project lists inside the task-list workbench', async () => {
    const templateListMock = vi.mocked(listCompanyProjectTemplates)
    const draftListMock = vi.mocked(listCompanyProjectDrafts)
    const projectListMock = vi.mocked(listVisibleProjects)
    templateListMock.mockClear()
    draftListMock.mockClear()
    projectListMock.mockClear()

    renderWizard()

    await waitFor(() => expect(screen.getByLabelText(/planned end/i)).toBeInTheDocument())

    expect(templateListMock).not.toHaveBeenCalled()
    expect(draftListMock).not.toHaveBeenCalled()
    expect(projectListMock).not.toHaveBeenCalled()
    expect(screen.queryByText('姝ｅ湪鍔犺浇妯℃澘涓庤崏绋?')).not.toBeInTheDocument()
  })

  it('exits through the task-list workbench callback when opened for generation', async () => {
    const { onExit } = renderWizard()

    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0))

    fireEvent.click(screen.getAllByRole('button')[0])

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('exits through the task-list workbench callback when opened for template adjustment', async () => {
    const { onExit } = renderWizard({ mode: 'adjust' })

    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0))

    fireEvent.click(screen.getAllByRole('button')[0])

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('loads the embedded project wizard and advances through core steps', async () => {
    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '业态、工法与装配体系' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
  })

  it('requires a concrete subtype before leaving a business type with subtype-specific plans', async () => {
    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    fireEvent.click(screen.getByRole('button', { name: /体育文化建筑/ }))
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))

    expect(screen.getByRole('heading', { name: '业态、工法与装配体系' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('请选择具体项目子类型')
    expect(screen.queryByRole('heading', { name: '工程范围与体量' })).not.toBeInTheDocument()
  })

  it('uses the global next button to complete the scope modeling substeps before leaving scope volume', async () => {
    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '业态、工法与装配体系' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '项目空间' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '细化空间' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('heading', { name: '确认范围' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '关键特征与专项约束' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '关键特征与专项约束' })).toBeInTheDocument()
  })

  it('does not leave the scope step from review while physical spaces are incomplete', async () => {
    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '业态、工法与装配体系' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '项目空间' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('空间名称'), { target: { value: '1#楼' } })
    fireEvent.click(screen.getByRole('button', { name: '添加项目空间' }))

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('heading', { name: '细化空间' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('heading', { name: '确认范围' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '确认范围' })).toBeInTheDocument()
    expect(screen.getByText('仍有 WBS 必要信息待补充，暂不能生成 WBS。请先补齐单体层数或地下室层数。')).toBeInTheDocument()
  })

  it('captures planned project end as a target date in the basic step', async () => {
    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: /项目身份与时间/ })).toBeInTheDocument())
    expect(screen.getByLabelText(/目标竣工日期|planned end/i)).toBeInTheDocument()
  })

  it('keeps project scale facts editable inside the embedded wizard identity step', async () => {
    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('总建筑面积 (m²)'), { target: { value: '180000' } })
    fireEvent.change(screen.getByLabelText('地上建筑面积 (m²)'), { target: { value: '135000' } })
    fireEvent.change(screen.getByLabelText('地下建筑面积 (m²)'), { target: { value: '45000' } })
    fireEvent.change(screen.getByLabelText('占地面积 (m²)'), { target: { value: '52000' } })

    expect(screen.getByLabelText('总建筑面积 (m²)')).toHaveValue(180000)
    expect(screen.getByLabelText('地上建筑面积 (m²)')).toHaveValue(135000)
    expect(screen.getByLabelText('地下建筑面积 (m²)')).toHaveValue(45000)
    expect(screen.getByLabelText('占地面积 (m²)')).toHaveValue(52000)
  })

  it('does not leave the scope step while a building is missing required functional usage', async () => {
    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '业态、工法与装配体系' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '高级树编辑' }))
    fireEvent.click(screen.getByTestId('scope-root-add-building'))
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    expect(screen.getByText('请先为所有单体选择功能用途')).toBeInTheDocument()
  })

  it('shows the starting-line step only when starting-line mode is selected', async () => {
    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())
    expect(screen.queryByText('起跑线')).not.toBeInTheDocument()
    expect(screen.getByText('已完成 1/5 步')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '已开工' }))
    expect(screen.getByText('起跑线')).toBeInTheDocument()
    expect(screen.getByText('已完成 1/6 步')).toBeInTheDocument()

    clickGlobalNext(2)
    await completeMinimalScopeModel()
    clickGlobalNext(2)

    expect(await screen.findByRole('heading', { name: '起跑线接入' })).toBeInTheDocument()
  })
  it('does not recompute the profile preview after every draft field change on the confirmation step', async () => {
    const previewMock = vi.mocked(previewWizardProfile)
    previewMock.mockClear()
    renderWizard()

    await waitFor(() => expect(screen.getByLabelText(/planned end/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/planned end/i), { target: { value: '2027-12-31' } })

    clickGlobalNext(2)
    await completeMinimalScopeModel()
    clickGlobalNext(2)

    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByRole('button', { name: /1500/ }))

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(previewMock).toHaveBeenCalledTimes(1)
  })

  it('carries a parsed project-space description into profile preview assignment coverage', async () => {
    const previewMock = vi.mocked(previewWizardProfile)
    previewMock.mockClear()
    previewMock.mockImplementationOnce(async (payload) => {
      const serializedScope = JSON.stringify(payload.scopeTree)
      expect(serializedScope).toContain('轨行区')
      expect(serializedScope).toContain('railway_operation_zone')

      return {
        estimatedRowCount: 180,
        recommendation: {
          matchedTemplates: ['china-tod-upper-cover-specialty'],
          triggeredItemPacks: ['TOD-01-01-02', 'TOD-04-01-08', 'TOD-04-01-09'],
          triggeredMilestones: [],
          expectedRowCount: { overview: 80, standard: 180, detailed: 420 },
        },
        previewSummary: {
          businessType: 'tod_upper_cover',
          detailLevel: 'standard',
          buildingCount: 1,
          templateCount: 1,
          milestoneCount: 0,
        },
        profile: {
          identity: { businessType: 'tod_upper_cover', mode: 'new' },
          scale: {
            buildingCount: 1,
            highestBuildingFloorCount: 26,
            totalAreaM2: 180000,
          },
          methods: {
            methodVariantCodes: ['cast_in_place_rebar'],
            prefabSystemCodes: [],
            elementVariantCodes: [],
            buildingPatternCodes: [],
          },
          features: {
            userSelected: {},
            inferred: {
              functionalUsageCodes: ['住宅楼'],
              functionalCategoryCodes: [],
              specialRoomTypeCodes: [],
              physicalZoneTypeCodes: ['railway_operation_zone'],
            },
          },
          generation: {
            detailLevel: 'standard',
            estimatedRowCount: 180,
            templateCount: 1,
            milestoneCount: 0,
          },
          issues: [],
          scopeCoverageDiagnostics: [],
          scopeTemplateCoverage: {
            summary: {
              autoSchedulableCount: 1,
              manualTaskRequiredCount: 0,
              missingRequiredScopeCount: 0,
            },
            items: [
              {
                scopeObjectId: 'railway-zone-1',
                scopeName: '轨行区',
                objectType: 'physical_zone',
                status: 'auto_schedulable',
                title: '轨行区 会自动生成并挂接任务',
                detail: '轨行区已命中 TOD-01-01-02|TOD-04-01-08|TOD-04-01-09 的模板挂接规则。',
                action: '无需额外处理，生成 WBS 后可按轨行区筛选和复核。',
                matchedRulePatterns: ['TOD-01-01-02|TOD-04-01-08|TOD-04-01-09'],
                requiredByTemplates: ['TOD-01-01-02|TOD-04-01-08|TOD-04-01-09'],
              },
            ],
          },
        },
      }
    })

    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('项目名称 *'), { target: { value: 'TOD验证项目' } })
    fireEvent.change(screen.getByLabelText('项目地点 *'), { target: { value: '上海' } })
    fireEvent.change(screen.getByLabelText('总建筑面积 (m²)'), { target: { value: '180000' } })

    clickGlobalNext(2)
    expect(await screen.findByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('项目范围描述'), {
      target: {
        value: '项目有1期，1期有1个标段，1#住宅楼26层，1期1标段有轨行区，B2地下室，室外总平。',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '从描述生成空间草稿' }))
    expect(screen.getByText(/已生成/)).toBeInTheDocument()

    clickGlobalNext(3)
    expect(await screen.findByRole('heading', { name: '关键特征与专项约束' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByRole('heading', { name: '确认项目画像' })).toBeInTheDocument()
    expect(await screen.findByText('任务挂接检查')).toBeInTheDocument()
    expect(screen.getByText('可以直接生成任务')).toBeInTheDocument()
    expect(screen.getByText('轨行区 会自动生成并挂接任务')).toBeInTheDocument()
    expect(screen.getAllByText(/TOD-01-01-02/).length).toBeGreaterThan(0)
    expect(previewMock).toHaveBeenCalledTimes(1)
  })

  it('times out a hanging profile preview request', async () => {
    vi.useFakeTimers()
    try {
      const previewPromise = withProfilePreviewTimeout(new Promise(() => {}), 15000)
      const assertion = expect(previewPromise).rejects.toThrow(PROFILE_PREVIEW_TIMEOUT_MESSAGE)

      await vi.advanceTimersByTimeAsync(15000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops the profile preview spinner and offers retry when the preview request times out', async () => {
    const previewMock = vi.mocked(previewWizardProfile)
    previewMock.mockRejectedValueOnce(new Error(PROFILE_PREVIEW_TIMEOUT_MESSAGE))

    renderWizard()

    await waitFor(() => expect(screen.getByLabelText(/planned end/i)).toBeInTheDocument())
    clickGlobalNext(2)
    expect(await screen.findByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    await completeMinimalScopeModel()

    clickGlobalNext(2)

    expect(await screen.findByText(PROFILE_PREVIEW_TIMEOUT_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新试算' })).toBeInTheDocument()
  })

  it('shows backend WBS readiness blockers on the profile confirmation step after commit is rejected', async () => {
    vi.mocked(commitWizardProject).mockRejectedValueOnce(new ApiClientError('项目空间模型还没有准备好，暂不能生成 WBS。', {
      status: 422,
      url: '/api/projects/wizard',
      code: 'http_error',
      rawText: JSON.stringify({
        success: false,
        error: {
          code: 'SCOPE_MODEL_NOT_READY_FOR_WBS',
          message: '项目空间模型还没有准备好，暂不能生成 WBS。',
          details: {
            issues: [
              {
                code: 'TEMPLATE_SCOPE_TARGET_MISSING',
                severity: 'blocking',
                message: '模板需要挂到「室外总平」，但当前项目空间中没有对应对象。',
                action: '请先补充对应的物理空间，或取消触发该专项模板后再生成 WBS。',
              },
            ],
          },
        },
      }),
    }))

    renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())
    clickGlobalNext(2)
    expect(await screen.findByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    await completeMinimalScopeModel()
    clickGlobalNext(2)
    expect(await screen.findByRole('heading', { name: '确认项目画像' })).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: '确认并生成任务' }))

    expect(await screen.findByText('范围体量还不能生成 WBS')).toBeInTheDocument()
    expect(screen.getByText(/室外总平/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回范围体量补齐' })).toBeInTheDocument()
  })

  it('polls async wizard generation and exits to the task list after completion', async () => {
    const commitMock = vi.mocked(commitWizardProject)
    const statusMock = vi.mocked(getWizardGenerationStatus)
    commitMock.mockResolvedValueOnce({
      id: 'project-1',
      projectId: 'project-1',
      status: 'wizard_drafting',
      generation: { state: 'queued', attemptId: 'attempt-1' },
    } as any)
    statusMock
      .mockResolvedValueOnce({ projectId: 'project-1', attemptId: 'attempt-1', state: 'running' } as any)
      .mockResolvedValueOnce({
        projectId: 'project-1',
        attemptId: 'attempt-1',
        state: 'completed',
        targetFeasibility: {
          overshootDays: 999,
          overshoot: {
            value: 4,
            unit: 'calendar_day',
            calendarRef: 'gregorian',
            calendarVersion: 'ISO-8601',
            timezone: 'Asia/Shanghai',
            asOf: '2026-07-20',
            availability: 'available',
          },
          naturalEndDate: '2027-01-10',
          targetEndDate: '2027-01-06',
        },
        durationAssetUtilizationSummary: {
          source: 'default_master_plan_duration_asset_utilization_summary',
          scheduleRowCount: 2,
          durationRiskRangeRowCount: 1,
        },
        candidateDurationAssetPreview: {
          source: 'generated_wbs_rows_candidate_duration_asset_preview',
          totalCount: 1,
          writesDurationRuntime: false,
          writesTasks: false,
          items: [],
        },
        criticalPathRefresh: {
          source: 'project_wizard_post_commit_critical_path_refresh',
          status: 'refreshed',
          criticalTaskCount: 2,
          projectDurationDays: 120,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: true,
        },
      } as any)
    const { onGenerated } = renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())
    clickGlobalNext(2)
    expect(await screen.findByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    await completeMinimalScopeModel()
    clickGlobalNext(2)
    expect(await screen.findByRole('heading', { name: '确认项目画像' })).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: '确认并生成任务' }))

    expect(await screen.findByText(/正在生成计划表/)).toBeInTheDocument()
    await waitFor(() => expect(statusMock).toHaveBeenCalledWith('project-1', 'attempt-1'))
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(
      'project-1',
      expect.not.stringContaining('target_overshoot_days='),
    ))
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('wizard_evidence=true'),
    ))
    const evidence = JSON.parse(String(window.sessionStorage.getItem('workbuddy:wizard-generation-evidence:project-1')))
    expect(evidence).toEqual(expect.objectContaining({
      durationAssetUtilizationSummary: expect.objectContaining({ scheduleRowCount: 2 }),
      candidateDurationAssetPreview: expect.objectContaining({ totalCount: 1 }),
      criticalPathRefresh: expect.objectContaining({ criticalTaskCount: 2 }),
    }))
  })

  it('persists post-commit generation evidence and marks the task-list handoff', async () => {
    window.sessionStorage.clear()
    const commitMock = vi.mocked(commitWizardProject)
    commitMock.mockResolvedValueOnce({
      id: 'project-1',
      projectId: 'project-1',
      status: '进行中',
      generation: {
        generationBatchId: 'batch-1',
        candidateDurationAssetPreview: {
          source: 'generated_wbs_rows_candidate_duration_asset_preview',
          evidenceLevel: 'candidate_duration_asset_preview_l1',
          mutationBoundary: 'preview_only_no_duration_runtime_write_no_task_write',
          totalCount: 1,
          riskRangeCount: 1,
          processSeasonalAdjustmentCount: 1,
          constructionCalendarCount: 1,
          writesDurationRuntime: false,
          writesTasks: false,
          items: [
            {
              clientRowId: 'row-1',
              title: '主体结构施工',
              riskP20DurationDays: 8,
              riskP50DurationDays: 10,
              riskP80DurationDays: 14,
              constructionCalendarWindowCount: 1,
              processSeasonalDurationAssetConsumed: true,
            },
          ],
        },
        candidateNetworkEvaluation: {
          source: 'generated_wbs_row_candidate_network_cpm',
          networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
          projectedNetworkSpanDays: 326,
          previewEdgeCount: 4,
          unresolvedEdgeCount: 0,
          criticalGeneratedRowIds: ['row-1'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        },
        candidateAcceptancePlanPreview: {
          source: 'generated_wbs_rows_candidate_acceptance_plan_preview',
          evidenceLevel: 'candidate_acceptance_plan_preview_l1',
          mutationBoundary: 'preview_only_no_acceptance_plan_write',
          totalCount: 1,
          datedCount: 1,
          writesAcceptancePlans: false,
          items: [
            {
              clientRowId: 'acceptance-row',
              title: '竣工验收与交付移交',
              acceptanceType: 'completion',
              plannedDate: '2027-12-20',
            },
          ],
        },
        criticalPathRefresh: {
          source: 'project_wizard_post_commit_critical_path_refresh',
          status: 'refreshed',
          generationBatchId: 'batch-1',
          criticalTaskCount: 3,
          projectDurationDays: 326,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: true,
        },
      },
    } as any)
    const { onGenerated } = renderWizard()

    await waitFor(() => expect(screen.getByRole('heading', { name: '项目身份与时间' })).toBeInTheDocument())
    clickGlobalNext(2)
    expect(await screen.findByRole('heading', { name: '工程范围与体量' })).toBeInTheDocument()
    await completeMinimalScopeModel()
    clickGlobalNext(2)
    expect(await screen.findByRole('heading', { name: '确认项目画像' })).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: '确认并生成任务' }))

    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('wizard_evidence=true'),
    ))
    const rawEvidence = window.sessionStorage.getItem('workbuddy:wizard-generation-evidence:project-1')
    expect(rawEvidence).toBeTruthy()
    const evidence = JSON.parse(String(rawEvidence))
    expect(evidence).toEqual(expect.objectContaining({
      generationBatchId: 'batch-1',
      candidateDurationAssetPreview: expect.objectContaining({
        writesTasks: false,
        writesDurationRuntime: false,
      }),
      candidateNetworkEvaluation: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
      candidateAcceptancePlanPreview: expect.objectContaining({
        writesAcceptancePlans: false,
      }),
      criticalPathRefresh: expect.objectContaining({
        source: 'project_wizard_post_commit_critical_path_refresh',
        criticalTaskCount: 3,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))
  })
})
