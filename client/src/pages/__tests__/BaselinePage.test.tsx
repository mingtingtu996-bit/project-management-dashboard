import type { ReactNode } from 'react'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePlanningStore } from '@/hooks/usePlanningStore'
import { useStore } from '@/hooks/useStore'
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import type { BaselineItem, BaselineVersion } from '@/types/planning'

import BaselinePage, { inferBaselinePublishCauseCode } from '../planning/BaselinePage'

vi.mock('@/lib/apiClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  getApiErrorMessage: vi.fn(),
}))

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    canEdit: true,
    globalRole: 'company_admin',
    permissionLevel: 'owner',
  }),
}))

type BaselineDetail = BaselineVersion & { items: BaselineItem[] }

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)
const mockedGetApiErrorMessage = vi.mocked(getApiErrorMessage)
const mountedCleanups = new Set<() => void>()

let versions: BaselineVersion[]
let details: Record<string, BaselineDetail>
let generateCandidateDefaultMasterPlanDraft = false
let generateCandidateDefaultMasterPlanDraftGovernanceOnly = false
let generationCandidateDurationMetrics: Record<string, unknown>

function calendarDayMetric(value: number | null, availability: 'available' | 'unavailable' = 'available') {
  return {
    value,
    unit: 'calendar_day',
    calendarRef: 'gregorian',
    calendarVersion: 'ISO-8601',
    timezone: 'UTC',
    asOf: '2026-05-09',
    availability,
    unavailableReason: availability === 'available' ? null : 'date_metadata_missing',
  }
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForCondition(check: () => boolean) {
  const deadline = Date.now() + 2500

  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })

    if (check()) return
  }

  throw new Error('Timed out waiting for condition')
}

async function waitForText(container: HTMLElement, expected: string[]) {
  try {
    await waitForCondition(() => {
      const text = container.textContent || ''
      return expected.every((item) => text.includes(item))
    })
  } catch (error) {
    const text = (container.textContent || '').replace(/\s+/g, ' ').trim()
    const reason = error instanceof Error ? ` Cause: ${error.message}` : ''
    throw new Error(`Timed out waiting for text. Expected: ${expected.join(' | ')}. Actual: ${text.slice(0, 1200)}${reason}`)
  }
}

function mount(node: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(node)
  })

  const cleanup = () => {
    if (!mountedCleanups.has(cleanup)) return
    mountedCleanups.delete(cleanup)
    act(() => {
      root.unmount()
    })
    container.remove()
  }

  mountedCleanups.add(cleanup)
  return { container, cleanup }
}

async function clickElement(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await flush()
  })
}

async function clickButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button'))
    .filter((item) => item.textContent?.includes(text))
    .at(-1) as HTMLButtonElement | undefined

  expect(button).toBeTruthy()
  await clickElement(button as HTMLButtonElement)
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

  await act(async () => {
    input.focus()
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await flush()
  })
}

async function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set

  await act(async () => {
    textarea.focus()
    valueSetter?.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
    textarea.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await flush()
  })
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getBaselineIdFromUrl(url: string) {
  return (url.split('?')[0]?.split('/').at(-1) ?? '').trim()
}

function baselineSummary(): NonNullable<BaselineVersion['summary']> {
  return {
    total_items: 4,
    structure_items: 2,
    work_items: 2,
    top_level_items: 1,
    division_items: 1,
    subdivision_items: 1,
    construction_task_items: 2,
    milestone_items: 1,
    critical_path_items: 0,
    planned_start_date: '2026-02-22',
    planned_end_date: '2026-12-21',
    duration_days: 303,
  }
}

function planningFieldRegistryFixture() {
  const now = '2026-05-09T08:00:00.000Z'
  return {
    registryVersion: 'v1.4.7.6',
    surface: 'baseline',
    generatedAt: now,
    updatedAt: now,
    groups: [
      { key: 'basic_plan', label: '基础计划', sortOrder: 1 },
      { key: 'node_control', label: '节点控制', sortOrder: 2 },
    ],
    fields: [
      {
        key: 'title',
        group: 'basic_plan',
        displayGroup: 'basic_plan',
        mergeGroup: 'identity',
        label: '任务名称',
        dataType: 'text',
        editableIn: ['baseline', 'monthly_plan', 'task_list'],
        defaultVisibleIn: ['baseline', 'monthly_plan', 'task_list'],
      },
      {
        key: 'planned_start_date',
        group: 'basic_plan',
        displayGroup: 'basic_plan',
        mergeGroup: 'schedule',
        label: '计划开始',
        dataType: 'date',
        editableIn: ['baseline', 'monthly_plan', 'task_list'],
        defaultVisibleIn: ['baseline', 'monthly_plan', 'task_list'],
      },
      {
        key: 'planned_end_date',
        group: 'basic_plan',
        displayGroup: 'basic_plan',
        mergeGroup: 'schedule',
        label: '计划完成',
        dataType: 'date',
        editableIn: ['baseline', 'monthly_plan', 'task_list'],
        defaultVisibleIn: ['baseline', 'monthly_plan', 'task_list'],
      },
      {
        key: 'sort_order',
        group: 'node_control',
        displayGroup: 'node_control',
        mergeGroup: 'node_control',
        label: '排序',
        dataType: 'number',
        editableIn: ['baseline', 'monthly_plan', 'task_list'],
        defaultVisibleIn: [],
      },
      {
        key: 'is_milestone',
        group: 'node_control',
        displayGroup: 'node_control',
        mergeGroup: 'node_control',
        label: '里程碑',
        dataType: 'boolean',
        editableIn: ['baseline', 'task_list'],
        defaultVisibleIn: ['baseline'],
      },
    ],
  }
}

function buildCommitResponse(rows: BaselineItem[], operations: Array<Record<string, unknown>>) {
  return {
    success: true,
    surface: 'baseline',
    resourceId: 'baseline-v7',
    revision: '2026-05-09T08:03:00.000Z',
    rows,
    validationIssues: [],
    governanceSummary: {
      changedRowCount: operations.length,
      createdRowCount: operations.filter((operation) => operation.type === 'create_row').length,
      updatedRowCount: operations.filter((operation) => operation.type === 'update_row' || operation.type === 'update_cell').length,
      deletedRowCount: operations.filter((operation) => operation.type === 'delete_row').length,
      dateAdjustmentCount: 0,
      progressAdjustmentCount: 0,
      milestoneChangeCount: 0,
      dependencyChangeCount: 0,
    },
    deletionResults: [],
    criticalPathChangeSummary: { changed: false, enteredTaskIds: [], leftTaskIds: [] },
    realtimeEvents: [],
    tempIdMap: {},
  }
}

function seedBaselineFixtures() {
  const items: BaselineItem[] = [
    {
      id: 'baseline-v6-root',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v6',
      title: '主体工程',
      sort_order: 0,
      mapping_status: 'mapped',
    },
    {
      id: 'baseline-v6-sub',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v6',
      parent_item_id: 'baseline-v6-root',
      title: '主体结构施工',
      sort_order: 1,
      mapping_status: 'mapped',
    },
    {
      id: 'baseline-v6-task',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v6',
      parent_item_id: 'baseline-v6-sub',
      title: '一层主体结构施工',
      planned_start_date: '2026-04-20',
      planned_end_date: '2026-07-04',
      sort_order: 2,
      mapping_status: 'mapped',
    },
    {
      id: 'baseline-v6-milestone',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v6',
      parent_item_id: 'baseline-v6-sub',
      title: '主体结构封顶',
      planned_start_date: '2026-08-13',
      planned_end_date: '2026-08-13',
      sort_order: 3,
      is_milestone: true,
      mapping_status: 'mapped',
    },
  ]

  const confirmed: BaselineDetail = {
    id: 'baseline-v6',
    project_id: 'project-1',
    version: 6,
    status: 'confirmed',
    title: '城市中心广场项目（二期） 总进度计划',
    description: '当前生效项目基线',
    source_type: 'manual',
    business_version_label: 'v6',
    is_current_execution: true,
    confirmed_at: '2026-05-04T08:00:00.000Z',
    confirmed_by: 'user-1',
    created_at: '2026-05-04T08:00:00.000Z',
    updated_at: '2026-05-04T08:00:00.000Z',
    summary: baselineSummary(),
    items,
  }

  versions = [confirmed]
  details = { [confirmed.id]: confirmed }
}

function candidateDefaultMasterPlanMetadata() {
  return {
    source: 'managed_frontier_default_master_plan',
    candidateOnly: true,
    writesTasks: false,
    writesTaskDependencies: false,
    writesCriticalPathFacts: false,
    durationSuggestion: {
      planDurationTruthSource: 'candidate_default_master_plan_baseline',
      dataUpgradeBlockedBy: ['GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'],
    },
  }
}

function candidateDefaultMasterPlanGovernanceMetadata() {
  return {
    source: 'default_master_plan_candidate_baseline_draft',
    candidateOnly: true,
    productionReady: false,
    evidenceLevel: 'candidate_asset_backed_l1',
    requiredEvidenceLevel: 'runtime_published_project_manager_accepted',
    durationAssetUtilizationSummary: {
      source: 'default_master_plan_duration_asset_utilization_summary',
      evidenceLevel: 'candidate_duration_asset_utilization_l1',
      scheduleRowCount: 54,
      standardWorkDurationSeedRowCount: 54,
      activeStandardWorkDurationSeedRowCount: 8,
      fallbackStandardWorkDurationSeedRowCount: 46,
      t2RhythmTemplateRowCount: 54,
      activeT2RhythmTemplateRowCount: 7,
      fallbackT2RhythmTemplateRowCount: 47,
      dependencyAssetConsumedRowCount: 13,
      dependencyTimingAssetConsumedRowCount: 13,
      runtimeReferenceDaysRowCount: 6,
      runtimeReferenceDaysConsumedRowCount: 6,
      rowsMissingDurationAssetCount: 0,
      rowsMissingT2RhythmTemplateCount: 0,
      rowsMissingRuntimeReferenceDaysCount: 48,
      productionWritePolicy: 'candidate_only_no_task_dependencies_write',
    },
    candidateNetworkEvaluation: {
      source: 'generated_wbs_row_candidate_network_cpm',
      projectedNetworkSpanDays: 326,
      previewEdgeCount: 27,
      processConstraintRoutingCandidateEdgeCount: 1,
      unresolvedEdgeCount: 0,
      criticalGeneratedRowIds: ['row-residential-1', 'row-residential-2', 'row-residential-3'],
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    mutationBoundary: {
      writesTasks: false,
      writesTaskDependencies: false,
      writesCriticalPathFacts: false,
      writesRuntimePublication: false,
    },
  }
}

function renderBaselinePage() {
  return mount(
    <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
      <Routes>
        <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BaselinePage planning workflow', () => {
  it('prefills only explicit baseline-change cause signals without misclassifying project names', () => {
    expect(inferBaselinePublishCauseCode({
      id: 'baseline-equipment-project',
      project_id: 'project-1',
      version: 2,
      status: 'draft',
      title: '机电设备安装项目基线',
      description: '常规计划修订',
      source_type: 'manual',
    })).toBe('workflow_sequence')
    expect(inferBaselinePublishCauseCode({
      id: 'baseline-design-change',
      project_id: 'project-1',
      version: 3,
      status: 'draft',
      title: '项目基线修订',
      description: '设计变更确认后调整主体结构节点',
      source_type: 'manual',
    })).toBe('design_change')
  })

  beforeEach(() => {
    seedBaselineFixtures()
    generateCandidateDefaultMasterPlanDraft = false
    generateCandidateDefaultMasterPlanDraftGovernanceOnly = false
    generationCandidateDurationMetrics = {
      milestoneMaxShift: calendarDayMetric(3),
      totalFinishShift: calendarDayMetric(14),
      // One-release compatibility fields deliberately conflict with typed truth.
      milestoneMaxShiftDays: 903,
      totalFinishShiftDays: 914,
    }

    useStore.setState({
      currentProject: {
        id: 'project-1',
        name: '城市中心广场项目（二期）',
        status: 'active',
      } as never,
      changeLogs: [],
    } as never)

    usePlanningStore.setState({
      selectedItemIds: [],
      draftStatus: 'idle',
      validationIssues: [],
    } as never)

    mockedGetApiErrorMessage.mockImplementation((error, fallback = '请稍后重试。') => {
      if (error instanceof Error && error.message) return error.message
      return fallback
    })

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/planning/field-registry?')) {
        return planningFieldRegistryFixture() as never
      }

      if (url.startsWith('/api/task-baselines?project_id=')) {
        return deepClone(versions)
      }

      if (url.startsWith('/api/task-baselines/baseline-v6/generation-candidate?')) {
        return {
          baselineId: 'baseline-v6',
          projectId: 'project-1',
          sourceVersionLabel: 'v6',
          candidateVersionLabel: '新版基线草案',
          recommended: true,
          summary: '⵽ 1 ƻ죬°߲ݰ󸴺ˡ',
          reasons: [
            {
              code: 'finish_shift',
              label: '总完工日期偏移',
              detail: '总完工日期偏移 14 个日历天，超过 7 个日历天阈值。',
              severity: 'warning',
            },
          ],
          metrics: {
            baselineTaskCount: 4,
            candidateTaskCount: 4,
            affectedTaskCount: 1,
            affectedTaskRatio: 0.25,
            addedItemCount: 0,
            removedItemCount: 0,
            changedItemCount: 1,
            structureChangeRatio: 0,
            ...generationCandidateDurationMetrics,
          },
          diffCounts: { total: 1, 新增: 0, 修改: 1, 移除: 0, 里程碑变动: 0 },
          diffItems: [
            {
              id: 'candidate-baseline-v6-task-end',
              kind: '修改',
              title: '一层主体结构施工',
              before: '一层主体结构施工 · 2026-04-20 - 2026-07-04',
              after: '一层主体结构施工 · 2026-04-20 - 2026-07-18',
              note: '计划完成: 2026-07-04 → 2026-07-18',
              field: 'end',
            },
          ],
        } as never
      }

      if (url.startsWith('/api/task-baselines/baseline-v7/diff?')) {
        return {
          baselineId: 'baseline-v7',
          compareToBaselineId: 'baseline-v6',
          fromVersionLabel: 'v6',
          toVersionLabel: '编辑中',
          counts: { total: 1, 新增: 0, 修改: 1, 移除: 0, 里程碑变动: 0 },
          items: [
            {
              id: 'changed-baseline-v7-item-3-end',
              kind: '修改',
              title: '一层主体结构施工',
              before: '一层主体结构施工 · 2026-04-20 - 2026-07-04',
              after: '一层主体结构施工 · 2026-04-20 - 2026-07-18',
              note: '计划完成: 2026-07-04 → 2026-07-18',
              rowId: 'baseline-v7-item-3',
              sourceRowId: 'baseline-v6-task',
              field: 'end',
            },
          ],
        } as never
      }

      const baselineId = getBaselineIdFromUrl(url)
      const detail = details[baselineId]
      if (detail) return deepClone(detail)

      throw new Error(`Unexpected GET ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/api/task-baselines/generate') {
        const createdId = 'baseline-v7'
        const sourceItems = details['baseline-v6'].items
        const generatedIdBySourceId = new Map(
          sourceItems.map((item, index) => [item.id, `${createdId}-item-${index + 1}`]),
        )
        const items = sourceItems.map((item, index) => ({
          ...item,
          id: `${createdId}-item-${index + 1}`,
          baseline_version_id: createdId,
          parent_item_id: item.parent_item_id ? generatedIdBySourceId.get(item.parent_item_id) ?? null : null,
          planned_end_date: item.id === 'baseline-v6-task' ? '2026-07-18' : item.planned_end_date,
          notes: item.id === 'baseline-v6-task'
            ? 'ϵͳ飺Ѱǰбڸ¼ƻڡ'
            : item.notes ?? null,
          generation_metadata: generateCandidateDefaultMasterPlanDraft && !generateCandidateDefaultMasterPlanDraftGovernanceOnly
            ? candidateDefaultMasterPlanMetadata()
            : item.generation_metadata ?? null,
        }))

        const created: BaselineDetail = {
          ...details['baseline-v6'],
          id: createdId,
          version: null,
          status: 'draft',
          title: '城市中心广场项目（二期） 总进度计划新版',
          description: '系统根据当前任务列表排期自动生成的待发布新版总进度计划。',
          source_version_id: 'baseline-v6',
          source_version_label: generateCandidateDefaultMasterPlanDraft && !generateCandidateDefaultMasterPlanDraftGovernanceOnly
            ? 'managed_frontier_default_master_plan'
            : 'v6',
          ...(generateCandidateDefaultMasterPlanDraft || generateCandidateDefaultMasterPlanDraftGovernanceOnly
            ? { governance_metadata: candidateDefaultMasterPlanGovernanceMetadata() }
            : {}),
          business_version_label: '编辑中',
          is_current_execution: false,
          confirmed_at: undefined,
          confirmed_by: undefined,
          created_at: '2026-05-09T08:00:00.000Z',
          updated_at: '2026-05-09T08:00:00.000Z',
          items,
          summary: baselineSummary(),
        }

        details[createdId] = created
        versions = [created, ...versions]
        return deepClone(created)
      }

      if (url === '/api/task-baselines/baseline-v7/commit') {
        const payload = body as { operations?: Array<Record<string, unknown>> }
        const operations = payload.operations ?? []
        const current = details['baseline-v7']
        const rows = current.items.map((item) => {
          const update = operations.find((operation) =>
            operation.type === 'update_row' && operation.rowId === item.id,
          )
          return update ? { ...item, ...(update.values as Partial<BaselineItem>) } : item
        })
        details['baseline-v7'] = { ...current, items: rows, updated_at: '2026-05-09T08:03:00.000Z' }
        versions = versions.map((version) =>
          version.id === 'baseline-v7'
            ? { ...version, updated_at: '2026-05-09T08:03:00.000Z' }
            : version,
        )
        return buildCommitResponse(deepClone(rows), operations) as never
      }

      if (url === '/api/task-baselines/baseline-v7/publish') {
        const confirmed: BaselineDetail = {
          ...details['baseline-v7'],
          version: 7,
          status: 'confirmed',
          business_version_label: 'v7',
          is_current_execution: true,
          confirmed_at: '2026-05-09T08:05:00.000Z',
          confirmed_by: 'user-1',
          updated_at: '2026-05-09T08:05:00.000Z',
          summary: baselineSummary(),
        }
        details['baseline-v7'] = confirmed
        versions = versions.map((version) =>
          version.id === 'baseline-v7'
            ? {
                ...version,
                version: 7,
                status: 'confirmed',
                business_version_label: 'v7',
                is_current_execution: true,
                confirmed_at: confirmed.confirmed_at,
                confirmed_by: confirmed.confirmed_by,
                updated_at: confirmed.updated_at,
                summary: confirmed.summary,
              }
            : { ...version, is_current_execution: false },
        )
        return deepClone(confirmed)
      }

      if (
        url === '/api/task-baselines'
        || url === '/api/task-baselines/baseline-v6/generate-version'
        || url === '/api/task-baselines/baseline-v7/confirm'
      ) {
        throw new Error(`Legacy baseline endpoint should not be used: ${url}`)
      }

      if (url === '/api/task-baselines') {
        const payload = body as {
          title?: string
          description?: string | null
          source_version_id?: string | null
          source_version_label?: string | null
          items?: Array<Record<string, unknown>>
        }
        const createdId = 'baseline-v7'
        const items = (payload.items ?? []).map((item, index) => ({
          id: `${createdId}-item-${index + 1}`,
          project_id: 'project-1',
          baseline_version_id: createdId,
          parent_item_id: (item.parent_item_id as string | null | undefined) ?? null,
          source_task_id: (item.source_task_id as string | null | undefined) ?? null,
          source_milestone_id: (item.source_milestone_id as string | null | undefined) ?? null,
          title: String(item.title ?? `条目 ${index + 1}`),
          planned_start_date: (item.planned_start_date as string | null | undefined) ?? null,
          planned_end_date: (item.planned_end_date as string | null | undefined) ?? null,
          target_progress: (item.target_progress as number | null | undefined) ?? null,
          sort_order: Number(item.sort_order ?? index),
          is_milestone: Boolean(item.is_milestone),
          is_critical: Boolean(item.is_critical),
          mapping_status: (item.mapping_status as BaselineItem['mapping_status']) ?? 'mapped',
          notes: (item.notes as string | null | undefined) ?? null,
        }))

        const created: BaselineDetail = {
          ...details['baseline-v6'],
          id: createdId,
          version: null,
          status: 'draft',
          title: payload.title ?? details['baseline-v6'].title,
          description: payload.description ?? null,
          source_version_id: payload.source_version_id ?? 'baseline-v6',
          source_version_label: payload.source_version_label ?? 'v6',
          business_version_label: '未发布调整',
          is_current_execution: false,
          created_at: '2026-05-09T08:00:00.000Z',
          updated_at: '2026-05-09T08:00:00.000Z',
          items,
        }

        details[createdId] = created
        versions = [created, ...versions]
        return deepClone(created)
      }

      if (url === '/api/task-baselines/baseline-v6/generate-version') {
        const createdId = 'baseline-v7'
        const sourceItems = details['baseline-v6'].items
        const generatedIdBySourceId = new Map(
          sourceItems.map((item, index) => [item.id, `${createdId}-item-${index + 1}`]),
        )
        const items = [
          ...sourceItems.map((item, index) => ({
            ...item,
            id: `${createdId}-item-${index + 1}`,
            baseline_version_id: createdId,
            parent_item_id: item.parent_item_id ? generatedIdBySourceId.get(item.parent_item_id) ?? null : null,
            planned_end_date: item.id === 'baseline-v6-task' ? '2026-07-18' : item.planned_end_date,
            notes: item.id === 'baseline-v6-task' ? 'ϵͳ飺Ѱǰбڸ¼ƻڡ' : item.notes ?? null,
          })),
          {
            id: `${createdId}-item-new`,
            project_id: 'project-1',
            baseline_version_id: createdId,
            parent_item_id: `${createdId}-item-2`,
            source_task_id: 'task-new',
            title: '新增幕墙施工',
            planned_start_date: '2026-08-01',
            planned_end_date: '2026-08-20',
            target_progress: null,
            sort_order: sourceItems.length,
            is_milestone: false,
            is_critical: false,
            mapping_status: 'pending' as const,
            notes: 'ϵͳ飺ǰбʩ°߲ݰ',
          },
        ]
        const created: BaselineDetail = {
          ...details['baseline-v6'],
          id: createdId,
          version: null,
          status: 'draft',
          title: '城市中心广场项目（二期） 总进度计划新版',
          description: '系统根据当前任务列表排期自动生成的待发布新版总进度计划。',
          source_version_id: 'baseline-v6',
          source_version_label: 'v6',
          business_version_label: '编辑中',
          is_current_execution: false,
          created_at: '2026-05-09T08:00:00.000Z',
          updated_at: '2026-05-09T08:00:00.000Z',
          items,
          summary: {
            ...baselineSummary(),
            total_items: 5,
            construction_task_items: 3,
          },
          mapping_affected_count: 1,
          modified_item_count: 2,
        }

        details[createdId] = created
        versions = [created, ...versions]
        return deepClone(created)
      }

      if (url === '/api/task-baselines/baseline-v7/confirm') {
        const confirmed: BaselineDetail = {
          ...details['baseline-v7'],
          version: 7,
          status: 'confirmed',
          business_version_label: 'v7',
          is_current_execution: true,
          confirmed_at: '2026-05-09T08:05:00.000Z',
          confirmed_by: 'user-1',
          updated_at: '2026-05-09T08:05:00.000Z',
          summary: baselineSummary(),
        }
        details['baseline-v7'] = confirmed
        versions = versions.map((version) =>
          version.id === 'baseline-v7'
            ? {
                ...version,
                version: 7,
                status: 'confirmed',
                business_version_label: 'v7',
                is_current_execution: true,
                confirmed_at: confirmed.confirmed_at,
                confirmed_by: confirmed.confirmed_by,
                updated_at: confirmed.updated_at,
                summary: confirmed.summary,
              }
            : { ...version, is_current_execution: false },
        )
        return deepClone(confirmed)
      }

      throw new Error(`Unexpected POST ${url}`)
    })
  })

  afterEach(() => {
    for (const cleanup of Array.from(mountedCleanups)) cleanup()
    useStore.setState({ currentProject: null, changeLogs: [] } as never)
    usePlanningStore.setState({
      selectedItemIds: [],
      draftStatus: 'idle',
      validationIssues: [],
    } as never)
    mockedApiGet.mockReset()
    mockedApiPost.mockReset()
    mockedGetApiErrorMessage.mockReset()
    document.body.innerHTML = ''
  })

  it('renders the current baseline with backend KPI summary and no old draft workflow wording', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, [
      '项目基线',
      '维护项目总进度计划',
      'DIVISION',
      '分部工程',
      'SUBDIVISION',
      '分项工程',
      'TASK',
      '施工任务',
      'MILESTONE',
      '里程碑',
      'v6 已确认',
      '总进度计划表',
      '任务名称',
      '计划开始',
      '计划完成',
      '工期',
      '编辑',
    ])

    const text = container.textContent || ''
    expect(text).not.toContain('修订草稿')
    expect(text).not.toContain('确认冻结')
    expect(text).not.toContain('计划修订候选')
    expect(text).not.toContain('观察池')
    expect(text).not.toContain(['修订', '池'].join(''))
    expect(container.querySelector('[data-testid="baseline-health-banner"]')).toBeFalsy()
    cleanup()
  })

  it('shows the baseline generation candidate panel and accepts the suggestion', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, [
      '系统建议',
      '建议生成新版基线草案',
      '先不更新',
      '查看详情',
      '总完工偏移 14 个日历天',
    ])
    expect(container.textContent).not.toContain('914')

    const acceptButton = container.querySelector('[data-testid="baseline-accept-generation-candidate"]') as HTMLButtonElement | null
    expect(acceptButton).toBeTruthy()
    expect(acceptButton?.getAttribute('title')).toContain('系统将基于当前任务列表和实际进度')

    await clickButtonByText(container, '查看详情')
    await waitForText(document.body, ['新版基线候选详情', '里程碑最大偏移', '3 个日历天', '计划完成: 2026-07-04 → 2026-07-18'])
    expect(document.body.textContent).not.toContain('903')
    expect(document.body.querySelector('[data-testid="baseline-generation-candidate-dialog"]')).toBeTruthy()

    await clickElement(acceptButton as HTMLButtonElement)
    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/generate'))
    await waitForText(container, ['正在编辑计划表', '已根据当前任务列表生成新版基线'])
    expect(container.querySelector('[data-testid="baseline-generation-candidate"]')).toBeFalsy()

    cleanup()
  })

  it('fails calendar-day candidate metrics closed instead of reading deprecated numerics', async () => {
    generationCandidateDurationMetrics = {
      milestoneMaxShift: calendarDayMetric(null, 'unavailable'),
      totalFinishShift: calendarDayMetric(null, 'unavailable'),
      milestoneMaxShiftDays: 803,
      totalFinishShiftDays: 814,
    }

    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['总完工偏移 日历天口径不可用'])
    expect(container.textContent).not.toContain('814')

    await clickButtonByText(container, '查看详情')
    await waitForText(document.body, ['里程碑最大偏移', '日历天口径不可用'])
    expect(document.body.textContent).not.toContain('803')

    cleanup()
  })

  it('renders structured 422 baseline validity metrics without parsing error prose', async () => {
    const defaultPost = mockedApiPost.getMockImplementation()
    mockedApiPost.mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/api/task-baselines/baseline-v7/publish') {
        throw Object.assign(new Error('opaque realignment response mentioning 999 days'), {
          status: 422,
          serverCode: 'REQUIRES_REALIGNMENT',
          serverDetails: {
            validity: {
              deviatedTaskRatio: 0.5,
              shiftedMilestoneCount: 3,
              averageMilestoneShift: calendarDayMetric(12),
              averageMilestoneShiftDays: 999,
              totalDurationDeviationRatio: 0.25,
              triggeredRules: ['task_deviation_ratio', 'milestone_shift'],
            },
          },
        })
      }
      return defaultPost?.(url, body) as never
    })

    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['生成新版基线'])
    await clickButtonByText(container, '生成新版基线')
    await waitForCondition(() => Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]')))
    await clickButtonByText(container, '保存')
    await waitForText(container, ['已保存当前项目基线草稿。', '发布项目基线'])
    await clickButtonByText(container, '发布项目基线')
    await setTextareaValue(
      document.body.querySelector('#baseline-publish-change-reason') as HTMLTextAreaElement,
      '基于现场进展调整节点。',
    )
    await clickButtonByText(document.body, '确认发布')

    await waitForText(container, [
      '任务偏差率 50%',
      '偏移里程碑 3 个',
      '平均里程碑偏移 12 个日历天',
      '总工期偏差 25%',
    ])
    const validity = container.querySelector('[data-testid="baseline-publish-validity"]')
    expect(validity).toBeTruthy()
    expect(validity?.textContent).not.toContain('999')

    cleanup()
  })

  it('enters in-place edit mode and exposes shared table editing actions', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['生成新版基线'])
    await clickButtonByText(container, '生成新版基线')

    await waitForText(container, ['总进度计划', '正在编辑计划表', '取消', '保存'])
    await waitForCondition(() => Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]')))

    expect(container.querySelector('[aria-label="添加同级"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="添加子级"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="标记里程碑"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="删除"]')).toBeTruthy()

    cleanup()
  })

  it('opens version records as a right-side drawer', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['查看版本记录'])
    await clickButtonByText(container, '查看版本记录')

    await waitForText(document.body, ['版本记录', '历史基线', '发布留痕'])
    expect(document.body.querySelector('[data-testid="baseline-version-records-dialog"]')).toBeTruthy()

    cleanup()
  })

  it('opens a current-version diff drawer and locates changed baseline rows', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['生成新版基线'])
    await clickButtonByText(container, '生成新版基线')
    await waitForCondition(() => Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:end"]')))

    await clickButtonByText(container, '对比当前生效版本')
    await waitForText(document.body, [
      '对比当前生效版本',
      'v6 → 编辑中',
      '计划完成: 2026-07-04 → 2026-07-18',
      '定位行',
    ])

    expect(mockedApiGet.mock.calls.some(([url]) =>
      String(url).startsWith('/api/task-baselines/baseline-v7/diff?'),
    )).toBe(true)
    expect(document.body.querySelector('[data-testid="baseline-version-records-dialog"]')).toBeFalsy()

    const locateButton = document.body.querySelector('[data-testid="baseline-diff-locate-baseline-v7-item-3"]') as HTMLElement | null
    expect(locateButton).toBeTruthy()
    await clickElement(locateButton as HTMLElement)

    await waitForCondition(() => !document.body.querySelector('[data-testid="baseline-current-diff-drawer"]'))
    await waitForCondition(() =>
      document.activeElement === container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:end"]'),
    )

    cleanup()
  })

  it('discards unsaved baseline table edits when cancelling edit mode', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['生成新版基线'])
    await clickButtonByText(container, '生成新版基线')
    await waitForCondition(() => Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]')))

    const titleInput = container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]') as HTMLInputElement
    await setInputValue(titleInput, 'Unsaved baseline title')
    expect(titleInput.value).toBe('Unsaved baseline title')

    await clickButtonByText(container, '取消')
    await waitForCondition(() => !container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]'))

    expect(container.textContent).not.toContain('Unsaved baseline title')
    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/commit')).toBe(false)

    cleanup()
  })

  it('supports undo and redo for baseline table edits before saving', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['生成新版基线'])
    await clickButtonByText(container, '生成新版基线')
    await waitForCondition(() => Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]')))

    await setInputValue(
      container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]') as HTMLInputElement,
      'Undoable baseline title',
    )
    expect((container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]') as HTMLInputElement).value)
      .toBe('Undoable baseline title')

    await clickButtonByText(container, '撤销')
    await waitForCondition(() => {
      const input = container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]') as HTMLInputElement | null
      return Boolean(input && input.value !== 'Undoable baseline title')
    })

    await clickButtonByText(container, '重做')
    await waitForCondition(() => {
      const input = container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]') as HTMLInputElement | null
      return input?.value === 'Undoable baseline title'
    })

    await clickButtonByText(container, '保存')
    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/commit'))

    const commitCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines/baseline-v7/commit')
    const payload = commitCall?.[1] as { operations?: Array<{ type: string; rowId?: string; values?: Record<string, unknown> }> } | undefined
    expect(payload?.operations?.some((operation) =>
      operation.type === 'update_row'
      && operation.rowId === 'baseline-v7-item-3'
      && operation.values?.title === 'Undoable baseline title',
    )).toBe(true)

    cleanup()
  })

  it('blocks baseline draft save when shared table validation has errors', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['生成新版基线'])
    await clickButtonByText(container, '生成新版基线')
    await waitForCondition(() => Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]')))

    await setInputValue(
      container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]') as HTMLInputElement,
      '',
    )
    await waitForText(container, ['表格校核', '请输入任务名称'])

    await clickButtonByText(container, '保存')
    await waitForText(container, ['请先处理 1 项表格校核问题后再保存。'])

    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/commit')).toBe(false)

    cleanup()
  })

  it('saves the edited whole schedule as a new published baseline version', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['生成新版基线'])
    await clickButtonByText(container, '生成新版基线')
    await waitForCondition(() => Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]')))

    await setInputValue(
      container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]') as HTMLInputElement,
      '一层主体结构施工（调整）',
    )

    await clickButtonByText(container, '保存')
    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/commit'))
    await waitForText(container, ['已保存当前项目基线草稿。', '发布项目基线'])

    await clickButtonByText(container, '发布项目基线')
    await waitForText(document.body, ['发布项目基线', '变更原因分类', '原因原话', '确认发布'])
    await waitForText(document.body, ['工序顺序调整'])
    const confirmPublishButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('确认发布')) as HTMLButtonElement | undefined
    expect(confirmPublishButton?.disabled).toBe(true)
    await setTextareaValue(
      document.body.querySelector('#baseline-publish-change-reason') as HTMLTextAreaElement,
      '设计变更确认后调整主体结构节点。',
    )
    expect(confirmPublishButton?.disabled).toBe(false)
    await clickButtonByText(document.body, '确认发布')

    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/publish'))

    const commitCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines/baseline-v7/commit')
    const payload = commitCall?.[1] as { operations?: Array<{ type: string; rowId?: string; values?: Record<string, unknown> }> } | undefined
    expect(payload?.operations?.some((operation) =>
      operation.type === 'update_row'
      && operation.rowId === 'baseline-v7-item-3'
      && operation.values?.title === '一层主体结构施工（调整）',
    )).toBe(true)
    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/generate')).toBe(true)
    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines')).toBe(false)
    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v6/generate-version')).toBe(false)
    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/confirm')).toBe(false)
    const publishCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines/baseline-v7/publish')
    expect(publishCall?.[1]).toEqual({
      project_id: 'project-1',
      cause_code: 'workflow_sequence',
      change_reason: '设计变更确认后调整主体结构节点。',
    })

    await waitForText(container, ['已发布新版项目基线', 'v7 已确认'])
    cleanup()
  })

  it('publishes a wizard-generated baseline through the normal confirmation dialog', async () => {
    generateCandidateDefaultMasterPlanDraft = true
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['生成新版基线'])
    await clickButtonByText(container, '生成新版基线')
    await waitForCondition(() => Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]')))

    await clickButtonByText(container, '保存')
    await waitForText(container, ['已保存当前项目基线草稿。', '发布项目基线'])

    await clickButtonByText(container, '发布项目基线')
    await waitForText(document.body, ['发布项目基线', '变更原因分类', '原因原话', '确认发布'])

    expect(document.body.querySelector('[data-testid="candidate-default-master-plan-review-warning"]')).toBeNull()
    expect(document.body.querySelector('#candidate-default-master-plan-review-acknowledgement')).toBeNull()
    expect(document.body.querySelector('#candidate-default-master-plan-review-notes')).toBeNull()
    await setTextareaValue(
      document.body.querySelector('#baseline-publish-change-reason') as HTMLTextAreaElement,
      '根据项目向导生成结果发布首版执行基线。',
    )
    await clickButtonByText(document.body, '确认发布')

    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/publish'))

    const publishCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines/baseline-v7/publish')
    const payload = publishCall?.[1] as Record<string, unknown> | undefined
    expect(payload).toEqual({
      project_id: 'project-1',
      cause_code: 'workflow_sequence',
      change_reason: '根据项目向导生成结果发布首版执行基线。',
    })

    cleanup()
  })

  it('does not turn legacy candidate metadata into a PM approval UI', async () => {
    generateCandidateDefaultMasterPlanDraftGovernanceOnly = true
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['生成新版基线'])
    await clickButtonByText(container, '生成新版基线')
    await waitForCondition(() => Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-item-3:title"]')))

    await clickButtonByText(container, '保存')
    await waitForText(container, ['已保存当前项目基线草稿。', '发布项目基线'])

    await clickButtonByText(container, '发布项目基线')
    await waitForText(document.body, ['发布项目基线', '变更原因分类', '原因原话', '确认发布'])

    expect(document.body.querySelector('[data-testid="candidate-default-master-plan-review-warning"]')).toBeNull()
    expect(document.body.querySelector('#candidate-default-master-plan-review-acknowledgement')).toBeNull()
    expect(document.body.querySelector('#candidate-default-master-plan-review-notes')).toBeNull()
    await setTextareaValue(
      document.body.querySelector('#baseline-publish-change-reason') as HTMLTextAreaElement,
      '复核候选计划后发布为当前执行基线。',
    )
    await clickButtonByText(document.body, '确认发布')

    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/publish'))

    const publishCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines/baseline-v7/publish')
    const payload = publishCall?.[1] as Record<string, unknown> | undefined
    expect(payload).toEqual({
      project_id: 'project-1',
      cause_code: 'workflow_sequence',
      change_reason: '复核候选计划后发布为当前执行基线。',
    })

    cleanup()
  })

  it('uses the same table base for WBS hierarchy and visible row actions', async () => {
    const { container, cleanup } = renderBaselinePage()

    await waitForText(container, ['├', '1.1', '1.1.1', '主体工程', '主体结构施工'])
    await clickButtonByText(container, '生成新版基线')
    await waitForCondition(() => Boolean(container.querySelector('[aria-label="添加子级"]')))

    await clickElement(container.querySelector('[aria-label="添加子级"]') as HTMLElement)
    await waitForCondition(() =>
      Array.from(container.querySelectorAll<HTMLInputElement>('[data-baseline-editor-cell$=":title"]'))
        .some((input) => input.value.includes('新子级')),
    )

    cleanup()
  })
})
