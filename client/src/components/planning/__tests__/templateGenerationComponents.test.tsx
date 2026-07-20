import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GeneratedWbsBanner } from '@/components/planning/GeneratedWbsBanner'
import { ConstructionOrganizationScenarioSummary } from '@/components/planning/ConstructionOrganizationScenarioSummary'
import { TemplateBrowser } from '@/components/planning/TemplateBrowser'
import { TemplateGenerationPreview } from '@/components/planning/TemplateGenerationPreview'
import { TemplateInlineExpand } from '@/components/planning/TemplateInlineExpand'
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary'
import {
  generateWbsTemplatePreview,
  getWbsTemplateCatalogItem,
  listWbsTemplateCatalog,
  type WbsGeneratedTemplateRow,
  type WbsTemplateCatalogItem,
} from '@/services/wbsTemplateGenerationApi'
import { Button } from '@/components/ui/button'

const productionMetric = (value: number) => ({
  value,
  unit: 'construction_production_day' as const,
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  asOf: '2028-05-01',
  availability: 'available' as const,
  unavailableReason: null,
})

const calendarMetric = (value: number) => ({
  value,
  unit: 'calendar_day' as const,
  calendarRef: 'gregorian',
  calendarVersion: 'ISO-8601',
  timezone: 'Asia/Shanghai',
  asOf: '2028-05-01',
  availability: 'available' as const,
  unavailableReason: null,
})

vi.mock('@/services/wbsTemplateGenerationApi', () => ({
  listWbsTemplateCatalog: vi.fn(),
  getWbsTemplateCatalogItem: vi.fn(),
  generateWbsTemplatePreview: vi.fn(),
}))

const catalogTemplates: WbsTemplateCatalogItem[] = [
  {
    id: 'template-1',
    name: '住宅主体结构模板',
    source: 'builtin_seed',
    nodeCount: 2,
    packType: 'core_quality',
    templateGroup: 'building_main',
    generationPolicy: 'default_selected',
    sourceStandard: 'GB demo',
    evidenceSummary: {
      domainScope: '房建',
      evidenceStatus: 'verified',
      reviewNeededCount: 1,
      webVerifiedFalseCount: 0,
      divisionCount: 1,
      subDivisionCount: 0,
      itemWorkCount: 1,
      processCount: 2,
      activityStepCount: 0,
      disciplineProcessCount: 2,
      genericFallbackProcessCount: 0,
      disciplineActivityStepCount: 0,
      genericActivityStepCount: 0,
      uniqueProcessNameCount: 2,
      uniqueActivityStepNameCount: 0,
    },
    nodes: [
      {
        id: 'node-1',
        stableCode: '01',
        name: '钢筋工程',
        categoryType: 'process',
        defaultDurationDays: 3,
        sourceStandard: 'GB demo',
        sourceVersion: '2026',
        sourceClauseRef: '1.1',
        reviewNeeded: false,
        webVerified: true,
        evidenceLevel: 'verified',
        verificationStatus: 'verified',
        applicableScope: '房建',
        children: [],
      },
    ],
  },
  {
    id: 'template-2',
    name: '消防深化模板',
    source: 'builtin_seed',
    packType: 'specialty',
    templateGroup: 'mep',
    generationPolicy: 'triggered',
    triggerKeywords: ['消防'],
    nodeCount: 1,
    sourceStandard: 'GB fire',
    nodes: [
      {
        id: 'fire-node-1',
        stableCode: 'FIR-01',
        name: '喷淋管网',
        categoryType: 'item_work',
        defaultDurationDays: 3,
        sourceStandard: 'GB fire',
        sourceVersion: '2026',
        sourceClauseRef: 'F.1',
        reviewNeeded: false,
        webVerified: true,
        evidenceLevel: 'verified',
        verificationStatus: 'verified',
        applicableScope: '消防',
        children: [],
      },
    ],
  },
  {
    id: 'template-3',
    name: '幕墙外立面模板',
    source: 'builtin_seed',
    packType: 'specialty',
    templateGroup: 'facade',
    generationPolicy: 'triggered',
    nodeCount: 1,
    sourceStandard: 'GB facade',
    nodes: [],
  },
]

function makePreviewRows(count = 2): WbsGeneratedTemplateRow[] {
  return Array.from({ length: count }, (_, index) => ({
    clientRowId: `preview-${index + 1}`,
    parentClientRowId: null,
    parentRowId: null,
    sortOrder: index,
    predecessorClientRowIds: index > 0 ? ['preview-1'] : [],
    predecessorDependencies: index > 0 ? [{
      clientRowId: 'preview-1',
      dependencyType: 'SS',
      lagDays: 0,
      source: 'dependency_intent_template',
    }] : [],
    values: {
      title: `生成工序 ${index + 1}`,
      wbs_node_type: 'process',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-03',
      participant_unit_id: index === 0 ? 'unit-1' : null,
      conditions: index === 0 ? ['condition-1'] : [],
      acceptance_requirement_ids: index === 0 ? ['acceptance-1'] : [],
    },
  }))
}

function TemplateLibraryProbe({ projectId = 'project-1' }: { projectId?: string }) {
  const library = useTemplateLibrary(projectId)
  return (
    <div>
      <span data-testid="template-library-count">{library.templates.length}</span>
      <span data-testid="template-library-category-count">{library.categories.length}</span>
      <span data-testid="template-library-loading">{String(library.loading)}</span>
      <span data-testid="template-library-error">{library.error ?? ''}</span>
    </div>
  )
}

function TemplateLibraryLazyProbe({ projectId = 'project-1' }: { projectId?: string }) {
  const library = useTemplateLibrary(projectId)
  return (
    <div>
      <span data-testid="template-library-count">{library.templates.length}</span>
      <span data-testid="template-library-node-count">{library.templates[0]?.nodes?.length ?? 0}</span>
      <span data-testid="template-library-loading-template">{library.loadingTemplateId ?? ''}</span>
      <Button unstyled type="button" onClick={() => void library.ensureTemplateNodes('template-1')}>hydrate</Button>
    </div>
  )
}

describe('template generation planning components', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the template browser as catalog, node list, and detail panes', () => {
    const onTemplateChange = vi.fn()
    const onTemplateToggle = vi.fn()
    const onToggleNode = vi.fn()
    const onSelectAll = vi.fn()

    render(
      <TemplateBrowser
        templates={catalogTemplates}
        selectedTemplateId="template-1"
        selectedTemplateIds={['template-1']}
        selectedNodeIds={['node-1']}
        onTemplateChange={onTemplateChange}
        onTemplateToggle={onTemplateToggle}
        onToggleNode={onToggleNode}
        onSelectAll={onSelectAll}
      />,
    )

    expect(screen.getByTestId('template-browser')).toBeTruthy()
    expect(screen.getByTestId('template-browser-detail').textContent).toContain('住宅主体结构模板')
    expect(screen.getByTestId('template-browser-node-node-1').textContent).toContain('钢筋工程')
    expect(screen.getByTestId('template-pack-core_quality')).toBeTruthy()
    expect(screen.getByTestId('template-pack-specialty')).toBeTruthy()
    expect(screen.getByTestId('template-group-building_main')).toBeTruthy()
    expect(screen.getByTestId('template-group-mep')).toBeTruthy()
    expect(screen.getByTestId('template-browser').textContent).toContain('房建主干')
    expect(screen.getByTestId('template-browser').textContent).toContain('消防深化')
    expect(screen.getByTestId('template-browser').textContent).toContain('幕墙外立面')

    fireEvent.click(screen.getByTestId('template-browser-template-template-2'))
    expect(onTemplateChange).toHaveBeenCalledWith('template-2')

    fireEvent.click(screen.getByTestId('template-browser-template-template-2').parentElement!.querySelector('button[role="checkbox"]')!)
    expect(onTemplateToggle).toHaveBeenCalledWith('template-2', true)

    fireEvent.click(screen.getByText('全选'))
    expect(onSelectAll).toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('template-browser-node-node-1').querySelector('button')!)
    expect(onToggleNode).toHaveBeenCalledWith('node-1', false)
  })

  it('finds and selects nested catalog nodes for selected-task drilldown', () => {
    const nestedTemplate: WbsTemplateCatalogItem = {
      ...catalogTemplates[0],
      nodes: [{
        ...catalogTemplates[0].nodes![0],
        id: 'division-1',
        categoryType: 'division',
        children: [{
          ...catalogTemplates[0].nodes![0],
          id: 'item-work-1',
          name: '主体结构施工',
          categoryType: 'item_work',
          children: [],
        }],
      }],
    }
    const onToggleNode = vi.fn()

    render(
      <TemplateBrowser
        templates={[nestedTemplate]}
        selectedTemplateId={nestedTemplate.id}
        selectedNodeIds={['item-work-1']}
        showNestedNodes
        onTemplateChange={vi.fn()}
        onToggleNode={onToggleNode}
      />,
    )

    expect(screen.getByTestId('template-browser-node-item-work-1')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('template-browser-node-search'), {
      target: { value: '主体结构' },
    })
    fireEvent.click(screen.getByTestId('template-browser-node-item-work-1').querySelector('button')!)
    expect(onToggleNode).toHaveBeenCalledWith('item-work-1', false)
  })

  it('loads shared template library data through the hook', async () => {
    vi.mocked(listWbsTemplateCatalog).mockResolvedValue({
      builtIn: {
        templateId: 'template-1',
        templateCode: 'demo',
        templateName: '住宅主体结构模板',
        sourceStandard: 'GB demo',
        sourceVersion: '2026',
        divisionCount: 1,
        nodeCount: 2,
        evidenceSummary: catalogTemplates[0].evidenceSummary!,
      },
      templates: catalogTemplates,
    })

    render(<TemplateLibraryProbe />)

    await waitFor(() => expect(screen.getByTestId('template-library-count').textContent).toBe('3'))
    expect(screen.getByTestId('template-library-category-count').textContent).toBe('3')
    expect(screen.getByTestId('template-library-error').textContent).toBe('')
  })

  it('lazy-loads template nodes through the hook after summary catalog load', async () => {
    const summaryTemplates = catalogTemplates.map((template) => ({ ...template, nodes: undefined }))
    vi.mocked(listWbsTemplateCatalog).mockResolvedValue({
      builtIn: {
        templateId: 'template-1',
        templateCode: 'demo',
        templateName: '住宅主体结构模板',
        sourceStandard: 'GB demo',
        sourceVersion: '2026',
        divisionCount: 1,
        nodeCount: 2,
        evidenceSummary: catalogTemplates[0].evidenceSummary!,
      },
      templates: summaryTemplates,
    })
    vi.mocked(getWbsTemplateCatalogItem).mockResolvedValue(catalogTemplates[0])

    render(<TemplateLibraryLazyProbe />)

    await waitFor(() => expect(screen.getByTestId('template-library-count').textContent).toBe('3'))
    expect(screen.getByTestId('template-library-node-count').textContent).toBe('0')
    fireEvent.click(screen.getByText('hydrate'))
    await waitFor(() => expect(screen.getByTestId('template-library-node-count').textContent).toBe('1'))
    expect(getWbsTemplateCatalogItem).toHaveBeenCalledWith('template-1')
  })

  it('covers preview duplicate policy, missing-field warnings, and render-budget warning', () => {
    const onDuplicatePolicyChange = vi.fn()
    const onToggleRow = vi.fn()
    const onApply = vi.fn()

    const { rerender } = render(
      <TemplateGenerationPreview
        rows={makePreviewRows(2)}
        selectedRowIds={new Set(['preview-1', 'preview-2'])}
        duplicatePolicy="skip"
        onDuplicatePolicyChange={onDuplicatePolicyChange}
        onToggleRow={onToggleRow}
        onApply={onApply}
      />,
    )

    expect(screen.getByTestId('template-generation-preview').textContent).toContain('已选择 2 / 2 行')
    expect(screen.getByTestId('template-preview-warning-list').textContent).toContain('默认责任单位缺失')

    fireEvent.click(screen.getByTestId('template-duplicate-policy-overwrite'))
    fireEvent.click(screen.getByTestId('template-duplicate-policy-duplicate'))
    expect(onDuplicatePolicyChange).toHaveBeenCalledWith('overwrite')
    expect(onDuplicatePolicyChange).toHaveBeenCalledWith('duplicate')

    fireEvent.click(screen.getByText('加入草稿'))
    expect(onApply).toHaveBeenCalled()

    rerender(
      <TemplateGenerationPreview
        rows={makePreviewRows(501)}
        selectedRowIds={new Set(['preview-1'])}
        duplicatePolicy="skip"
        onDuplicatePolicyChange={onDuplicatePolicyChange}
        onToggleRow={onToggleRow}
        onApply={onApply}
      />,
    )
    expect(screen.getByTestId('template-preview-row-limit').textContent).toContain('首屏先渲染 500 行')
    expect(screen.getByText('加入草稿').closest('button')).not.toBeDisabled()
  })

  it('surfaces candidate CPM network evidence in template preview without implying production writes', () => {
    render(
      <TemplateGenerationPreview
        rows={makePreviewRows(3)}
        selectedRowIds={new Set(['preview-1', 'preview-2', 'preview-3'])}
        duplicatePolicy="skip"
        onDuplicatePolicyChange={vi.fn()}
        onToggleRow={vi.fn()}
        onApply={vi.fn()}
        {...({
          candidateNetworkEvaluation: {
            source: 'generated_wbs_row_candidate_network_cpm',
            networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
            projectedNetworkSpanDays: 318,
            previewEdgeCount: 3,
            processConstraintRoutingCandidateEdgeCount: 1,
            unresolvedEdgeCount: 0,
            criticalGeneratedRowIds: ['preview-1', 'preview-2', 'preview-3'],
            materializationStatus: 'fully_mapped_read_only',
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
          },
        } as any)}
      />,
    )

    const summary = screen.getByTestId('template-preview-candidate-cpm')
    expect(summary.textContent).toContain('候选关键路径')
    expect(summary.textContent).toContain('跨度 318 天')
    expect(summary.textContent).toContain('依赖边 3')
    expect(summary.textContent).toContain('工艺穿插候选边 1')
    expect(summary.textContent).toContain('未解析 0')
    expect(summary.textContent).toContain('关键行 3')
    expect(summary.textContent).toContain('只读预览，不写任务依赖、计划日期或关键路径事实')
  })

  it('does not show ungoverned recommended days as a preview reference duration', () => {
    const rows = makePreviewRows(1)
    rows[0] = {
      ...rows[0],
      values: {
        ...rows[0].values,
        title: 'legacy duration only',
        smart_reference_days: 9,
        duration_suggestion: {
          recommendedDurationDays: 9,
          conservativeDurationDays: 12,
          confidenceLevel: 'medium',
          confidenceScore: 60,
          forecastSource: 'legacy_recommended_only',
          businessReason: 'Legacy recommended-only values are not governed display references.',
        } as any,
      },
      durationSuggestion: {
        recommendedDurationDays: 9,
        conservativeDurationDays: 12,
        confidenceLevel: 'medium',
        confidenceScore: 60,
        forecastSource: 'legacy_recommended_only',
        businessReason: 'Legacy recommended-only values are not governed display references.',
      } as any,
    }

    render(
      <TemplateGenerationPreview
        rows={rows}
        selectedRowIds={new Set(['preview-1'])}
        duplicatePolicy="skip"
        onDuplicatePolicyChange={vi.fn()}
        onToggleRow={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText('legacy duration only')).toBeInTheDocument()
    expect(screen.queryByText(/9/)).toBeNull()
  })

  it('does not show legacy snake_case duration aliases as a preview reference duration', () => {
    const rows = makePreviewRows(1)
    rows[0] = {
      ...rows[0],
      values: {
        ...rows[0].values,
        title: 'legacy alias duration only',
        duration_suggestion: {
          duration_output_code: 'contextual_reference',
          duration_output_semantic_field_name: 'contextualReferenceDays',
          contextual_reference_days: 9,
          plan_reference_days: 9,
          remaining_forecast_days: 9,
          confidenceLevel: 'medium',
          confidenceScore: 60,
          forecastSource: 'legacy_alias_only',
          businessReason: 'Legacy alias-only values are not governed display references.',
        } as any,
      },
      durationSuggestion: {
        duration_output_code: 'contextual_reference',
        duration_output_semantic_field_name: 'contextualReferenceDays',
        contextual_reference_days: 9,
        plan_reference_days: 9,
        remaining_forecast_days: 9,
        confidenceLevel: 'medium',
        confidenceScore: 60,
        forecastSource: 'legacy_alias_only',
        businessReason: 'Legacy alias-only values are not governed display references.',
      } as any,
    }

    render(
      <TemplateGenerationPreview
        rows={rows}
        selectedRowIds={new Set(['preview-1'])}
        duplicatePolicy="skip"
        onDuplicatePolicyChange={vi.fn()}
        onToggleRow={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText('legacy alias duration only')).toBeInTheDocument()
    expect(screen.queryByText(/9/)).toBeNull()
  })

  it('surfaces target end feasibility on the generated WBS banner without applying compression', () => {
    const onRequestAcceleration = vi.fn()

    render(
      <GeneratedWbsBanner
        businessType="residential"
        generatedCount={212}
        targetFeasibility={{
          mode: 'compare_only',
          targetEndDate: '2028-05-10',
          naturalEndDate: '2028-08-21',
          overshootDays: 103,
          overshoot: calendarMetric(103),
          recoverableDays: 72,
          recoverable: productionMetric(72),
          unrecoverableDays: 31,
          unrecoverable: productionMetric(31),
          verdict: 'requires_scope_change',
          strategies: [
            {
              type: 'fast_track',
              affectedRowIds: [],
              recoverDays: 36,
              riskLevel: 'medium',
              explanation: '主体、机电、装饰可做穿插搭接。',
            },
          ],
        }}
        onRequestAccelerationProposal={onRequestAcceleration}
        onSaveConfirm={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )

    expect(screen.getByText(/目标工期偏紧/)).toBeInTheDocument()
    expect(screen.getByText(/超出目标 103 个日历天/)).toBeInTheDocument()
    expect(screen.getByText(/未自动压缩/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /生成赶工建议/ }))
    expect(onRequestAcceleration).toHaveBeenCalledTimes(1)
  })

  it('shows a preview-only acceleration proposal from template generation preview', () => {
    render(
      <TemplateGenerationPreview
        rows={makePreviewRows(2)}
        selectedRowIds={new Set(['preview-1', 'preview-2'])}
        duplicatePolicy="skip"
        onDuplicatePolicyChange={vi.fn()}
        onToggleRow={vi.fn()}
        onApply={vi.fn()}
        targetFeasibility={{
          mode: 'compression_preview',
          targetEndDate: '2028-05-10',
          naturalEndDate: '2028-08-21',
          overshootDays: 103,
          overshoot: calendarMetric(103),
          recoverableDays: 72,
          recoverable: productionMetric(72),
          unrecoverableDays: 31,
          unrecoverable: productionMetric(31),
          verdict: 'requires_scope_change',
          strategies: [],
          accelerationProposal: {
            mode: 'preview_only',
            source: 'target_end_compression',
            targetEndDate: '2028-05-10',
            naturalEndDate: '2028-08-21',
            overshootDays: 103,
            overshoot: calendarMetric(103),
            totalRecoverDays: 72,
            totalRecover: productionMetric(72),
            remainingGapDays: 31,
            remainingGap: productionMetric(31),
            verdict: 'needs_scope_decision',
            actions: [
              {
                type: 'fast_track',
                affectedRowIds: ['preview-2'],
                recoverDays: 999,
                recoverDuration: productionMetric(36),
                riskLevel: 'medium',
                explanation: '主体、机电、装饰可做穿插搭接。',
                dependencyAdjustments: [{
                  predecessorClientRowId: 'preview-1',
                  successorClientRowId: 'preview-2',
                  fromDependencyType: 'FS',
                  toDependencyType: 'SS',
                  lagDaysBefore: 0,
                  lagDaysAfter: -7,
                }],
              },
              {
                type: 'crashing',
                affectedRowIds: ['preview-1'],
                recoverDays: 999,
                recoverDuration: productionMetric(36),
                riskLevel: 'medium',
                explanation: '关键路径资源赶工预览。',
                durationAdjustments: [{
                  clientRowId: 'preview-1',
                  currentDurationDays: 999,
                  currentDuration: productionMetric(10),
                  proposedDurationDays: 999,
                  proposedDuration: productionMetric(8),
                  minDurationDays: 999,
                  minDuration: productionMetric(7),
                  recoverDays: 999,
                  recoverDuration: productionMetric(2),
                  basis: 'resource_crash_preview',
                }],
              },
              {
                type: 'scope_reduction',
                affectedRowIds: [],
                recoverDays: 999,
                recoverDuration: productionMetric(31),
                riskLevel: 'high',
                explanation: '仍需项目负责人决策交付范围。',
                decisionOptions: ['分批交付', '调整目标日期'],
              },
            ],
            protectedConstraints: [{
              clientRowId: 'preview-2',
              title: '混凝土养护',
              reasonCode: 'hard_process_wait',
              durationDays: 999,
              duration: productionMetric(28),
            }],
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /生成赶工建议/ }))

    expect(screen.getByText(/赶工方案预览/)).toBeInTheDocument()
    expect(screen.getByText(/不自动修改任务日期/)).toBeInTheDocument()
    expect(screen.getByText(/搭接优化/)).toBeInTheDocument()
    expect(screen.getAllByText(/资源赶工/).length).toBeGreaterThan(0)
    expect(screen.getByText(/范围\/交付决策/)).toBeInTheDocument()
    expect(screen.getByText(/预计可追回 72 个生产日/)).toBeInTheDocument()
    expect(screen.getByText(/剩余缺口 31 个生产日/)).toBeInTheDocument()
    expect(screen.getAllByText(/可追回 36 个生产日/).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('999')
    expect(screen.getByText(/硬约束保护/)).toBeInTheDocument()
  })

  it('surfaces the construction organization scenario consumed by generated rows', () => {
    const rows = makePreviewRows(1)
    rows[0] = {
      ...rows[0],
      values: {
        ...rows[0].values,
        standard_task_metadata: {
          projectOrganization: {
            scenarioSelection: {
              source: 'construction_organization_scenario_selector',
              recommendedScenarioIds: [
                'pile_before_excavation',
                'shared_basement_first_then_tower',
              ],
              recommendedPlanOption: {
                optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                selectedScenarioIds: [
                  'pile_before_excavation',
                  'shared_basement_first_then_tower',
                ],
                confidence: 'high',
                excludedReasons: [
                  {
                    scenarioId: 'excavation_before_pile',
                    reasons: ['rainy_deep_pit_without_horizontal_support'],
                  },
                  {
                    scenarioId: 'tower_lane_early_release_after_core_basement',
                    reasons: ['not_selected_for_basement_tower_release'],
                  },
                ],
                useCaseEvaluations: {
                  newProjectPlanning: {
                    factCoverage: {
                      consumedFactKeys: [
                        'scopeOrganizationFacts',
                        'methodVariantCodes',
                        'buildingCount',
                      ],
                      sidecarFactKeys: ['towerCraneCount'],
                      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                    },
                  },
                },
                generatedRowProjection: {
                  candidateMaterializationEvaluation: {
                    previewEdgeCount: 3,
                    satisfiedEdgeCount: 3,
                    violatedEdgeCount: 0,
                    unresolvedEdgeCount: 0,
                    materializationScore: 1,
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesCriticalPathFacts: false,
                  },
                  materializationDecision: {
                    source: 'construction_organization_candidate_materialization_decision',
                    decision: 'ready_for_manual_materialization',
                    allowManualMaterialization: true,
                    reasons: [],
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesCriticalPathFacts: false,
                  },
                  materializationReviewPackage: {
                    source: 'construction_organization_candidate_materialization_review_package',
                    packageBasis: 'manual_review_package_from_generated_row_preview_edges',
                    status: 'ready_for_manual_review',
                    allowManualReview: true,
                    proposedDependencyEdgeCount: 3,
                    proposedDependencyEdges: [
                      {
                        operation: 'propose_create_dependency',
                        writesTaskDependencies: false,
                      },
                    ],
                    reviewRequired: true,
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesCriticalPathFacts: false,
                  },
                  generatedRowReferenceDurationEvidence: {
                    source: 'generated_wbs_row_reference_duration_projection',
                    durationBasis: 'generated_row_plan_dates_and_plan_reference_days',
                    matchedReferenceRowCount: 4,
                    totalPlanReferenceDays: 310,
                    writesReferenceDuration: false,
                    writesPlanDates: false,
                    writesSeed: false,
                  },
                  generatedRowNetworkEvaluation: {
                    source: 'generated_wbs_row_candidate_network_cpm',
                    networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
                    projectedNetworkSpanDays: 318,
                    previewEdgeCount: 3,
                    unresolvedEdgeCount: 0,
                    criticalGeneratedRowIds: [
                      'row-foundation',
                      'row-basement',
                      'row-tower',
                    ],
                    materializationStatus: 'fully_mapped_read_only',
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesCriticalPathFacts: false,
                  },
                },
                boundaryPolicy: {
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                },
              },
              planOptions: [
                {
                  optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                  selectedScenarioIds: [
                    'pile_before_excavation',
                    'shared_basement_first_then_tower',
                  ],
                  projectOrganizationScheme: {
                    source: 'project_organization_policy_scheme_candidate',
                    schemeFamily: 'shared_works_then_multi_building_lane',
                    strategy: 'shared_basement_podium_then_multi_tower_lane_network',
                    interfaceGateTags: ['shared_basement_gate', 'tower_lane_gate'],
                    resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesSeed: false,
                  },
                },
                {
                  optionId: 'construction_org_option:pile_before_excavation+tower_lane_early_release_after_core_basement',
                  selectedScenarioIds: [
                    'pile_before_excavation',
                    'tower_lane_early_release_after_core_basement',
                  ],
                  projectOrganizationScheme: {
                    source: 'project_organization_policy_scheme_candidate',
                    schemeFamily: 'tower_lane_recovery_option',
                    strategy: 'tower_lane_recovery_network',
                    interfaceGateTags: ['tower_lane_gate'],
                    resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesSeed: false,
                  },
                },
              ],
              scenarioRecommendations: {
                startingLineOnboarding: {
                  useCase: 'starting_line_onboarding',
                  actionability: 'not_actionable_after_current_phase',
                  currentSubstage: 'main_structure',
                  recommendationBasis: [
                    'starting_line_current_phase_past_foundation_or_basement',
                  ],
                },
              },
              resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            },
          },
        },
      },
    }

    render(
      <TemplateGenerationPreview
        rows={rows}
        selectedRowIds={new Set(['preview-1'])}
        duplicatePolicy="skip"
        onDuplicatePolicyChange={vi.fn()}
        onToggleRow={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByText('施工组织方案')).toBeInTheDocument()
    expect(screen.getByText(/先桩后挖/)).toBeInTheDocument()
    expect(screen.getByText(/整体地下室先行/)).toBeInTheDocument()
    expect(screen.getByText(/已比较 2 套候选方案/)).toBeInTheDocument()
    expect(screen.getByText(/组织族 shared_works_then_multi_building_lane/)).toBeInTheDocument()
    expect(screen.getByText(/先挖后桩：雨季深基坑且缺少水平支撑/)).toBeInTheDocument()
    expect(screen.getByText(/塔楼提前释放：当前不是地下室\/塔楼释放首选/)).toBeInTheDocument()
    expect(screen.getByText(/已用于判断：空间组织关系、工法做法、楼栋数量/)).toBeInTheDocument()
    expect(screen.getByText(/与当前计划关系匹配；已校验 3 条关系，其中 3 条满足，匹配度 100%/)).toBeInTheDocument()
    expect(screen.getByText(/组织关系审阅：可进入人工审阅/)).toBeInTheDocument()
    expect(screen.getByText(/已生成可审阅关系草案：3 条/)).toBeInTheDocument()
    expect(screen.getByText(/已读取 4 行生成计划参考工期，合计参考 310 天/)).toBeInTheDocument()
    expect(screen.getByText(/候选网络只读评估：跨度 318 天，关键生成行 3 个/)).toBeInTheDocument()
    expect(screen.getByText(/起跑线接入：仅作证据，当前阶段不可倒写/)).toBeInTheDocument()
    expect(screen.getByText(/当前阶段：main_structure/)).toBeInTheDocument()
    expect(screen.getByText(/塔吊等资源只作可行性旁路信号/)).toBeInTheDocument()
    expect(screen.getByText(/候选方案不直接改写任务依赖或计划日期/)).toBeInTheDocument()
  })

  it('renders construction organization comparison package fallback for lightweight wizard summaries', () => {
    render(
      <ConstructionOrganizationScenarioSummary
        activeUseCase="newProjectPlanning"
        scenario={{
          source: 'project_wizard_commit_construction_organization_summary',
          recommendedScenarioIds: ['pile_before_excavation'],
          recommendedPlanOption: {
            optionId: 'option-default',
            selectedScenarioIds: ['pile_before_excavation'],
            confidence: 'medium',
          },
          scenarioRecommendations: {
            newProjectPlanning: {
              optionId: 'option-default',
              selectedScenarioIds: ['pile_before_excavation'],
              actionability: 'actionable_candidate',
              recommendationBasis: [],
            },
          },
          organizationDecisionReport: {
            source: 'construction_organization_decision_report',
            reportRole: 'product_best_scheme_read_model',
            optionCount: 4,
            candidateCount: 5,
            recommendedPlanOptionId: 'option-default',
            recommendedScenarioIds: ['pile_before_excavation'],
            selectedByUseCase: {
              newProjectPlanning: {
                source: 'construction_organization_use_case_decision_report',
                useCase: 'new_project_planning',
                optionId: 'option-default',
                selectedScenarioIds: ['pile_before_excavation'],
                actionability: 'actionable_candidate',
                confidence: 'medium',
                decisionBasis: ['uses_existing_wizard_project_facts'],
                optionScore: 82,
                virtualProjectDurationDays: 318,
                e5RecoverableSpanDays: 8,
                recoveryFactorHint: 1.06,
                nextGovernanceAction: 'manual_review_handoff',
                nextGovernanceReasons: ['ready_for_manual_review_handoff'],
                excludedAlternatives: [],
                factCoverage: null,
                boundaryPolicy: {
                  recommendedBySystem: true,
                  candidateOnly: true,
                  resourcesAreSidecarSignals: true,
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                  writesCriticalPathFacts: false,
                  writesAccelerationDraft: false,
                },
              },
            },
            decisionSignals: {
              usesExistingWizardFactsOnly: true,
              decisionFactKeys: ['scopeOrganizationFacts'],
              contextFactKeys: ['deliveryStandard'],
              sidecarFactKeys: ['towerCraneCount'],
              resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            },
            productCloseoutReadiness: {
              source: 'construction_organization_product_closeout_readiness_from_decision_report',
              status: 'candidate_recommendation_only_runtime_closeout_required',
              canDeclareConstructionOrganizationProductOutcomeCloseout: false,
              productOutcomeCloseoutProgress: {
                source: 'construction_organization_product_outcome_closeout_progress',
                status: 'product_outcome_closeout_incomplete',
                canDeclareConstructionOrganizationProductOutcomeCloseout: false,
                supportedBusinessTypeCount: 11,
                precisionReplayReadyBusinessTypeCount: 11,
                runtimeOutcomeReadyBusinessTypeCount: 2,
                readyBusinessTypes: ['general_civil', 'hospital'],
                missingBusinessTypes: ['industrial_cleanroom', 'modular_building'],
                topMissingReasons: [
                  'industrial_cleanroom:runtime_option_network_coverage_required',
                ],
                nextEvidenceActions: [
                  'collect_runtime_option_network_evidence_for_business_type',
                ],
                nextEvidenceWorkItemCount: 9,
                nextEvidenceWorkPackageCount: 9,
                prefillableWorkPackageCount: 1,
                blockedWorkPackageCount: 8,
                mutationBoundary: {
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                  writesBaseline: false,
                  writesCriticalPathFacts: false,
                  writesAccelerationDraft: false,
                },
                boundaryPolicy: [
                  'progress_projection_is_read_only',
                  'progress_projection_does_not_replace_product_outcome_closeout_matrix',
                ],
              },
              missingBeforeProductCloseout: [
                'real_runtime_evidence_source_required',
                'runtime_use_case_coverage_required',
                'runtime_option_network_coverage_required',
                'site_adoption_of_runtime_recommended_option_required',
              ],
            },
            boundaryPolicy: {
              candidateOnly: true,
              readOnlyBestScheme: true,
              runtimeMaterializationRequiresGovernance: true,
              resourcesAreSidecarSignals: true,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            },
          },
          planOptionComparisonPackage: {
            totalOptionCount: 3,
            recommendedOptionIdsByUseCase: {
              newProjectPlanning: 'option-default',
            },
            options: [
              {
                optionId: 'option-default',
                nextGovernanceAction: 'manual_review_handoff',
                nextGovernanceReasons: ['ready_for_manual_review_handoff'],
                isRecommendedFor: ['newProjectPlanning'],
                systemRecommendationBasis: {
                  source: 'construction_organization_plan_option_system_recommendation_basis',
                  recommendationRole: 'read_only_candidate_ranking_from_e1_e3_e5_and_generated_row_projection',
                  recommendedForUseCases: ['newProjectPlanning'],
                  rankingSignals: [
                    'candidate_option_e1_e3_e5_summary',
                    'generated_row_projection_alignment',
                    'generated_row_candidate_network_cpm',
                  ],
                  e1: {
                    selectedWorkPackageCount: 3,
                    hasGeneratedRowReferenceEvidence: true,
                    matchedReferenceRowCount: 4,
                    totalRecommendedDurationDays: 310,
                    writesReferenceDuration: false,
                  },
                  e3: {
                    projectDurationDays: 318,
                    previewEdgeCount: 3,
                    unresolvedEdgeCount: 0,
                    criticalNodeCount: 2,
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesCriticalPathFacts: false,
                  },
                  e5: {
                    recoveryFactorHint: 1.06,
                    e5RecoverableSpanDays: 8,
                    writesAccelerationDraft: false,
                  },
                  materialization: {
                    decision: 'ready_for_manual_materialization',
                    allowManualMaterialization: true,
                    reasons: ['all_virtual_dependency_edges_have_generated_row_carriers'],
                  },
                  boundaryPolicy: {
                    candidateOnly: true,
                    readOnlyRecommendation: true,
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesSeed: false,
                    writesCriticalPathFacts: false,
                    writesAccelerationDraft: false,
                  },
                },
              },
            ],
          },
        }}
      />,
    )

    expect(screen.getByText(/已比较 4 套候选方案/)).toBeInTheDocument()
    expect(screen.getByText(/产品闭环：2\/11 业态闭合，仍需运行闭环矩阵确认，缺口业态：industrial_cleanroom、modular_building/)).toBeInTheDocument()
    expect(screen.getByText(/推荐依据：依据向导事实推导/)).toBeInTheDocument()
    expect(screen.getByText(/系统推荐依据：E1 参考 4 行、E3 关系 3 条、E5 可恢复 8 天/)).toBeInTheDocument()
    expect(screen.getByText(/下一步治理：manual_review_handoff/)).toBeInTheDocument()
    expect(screen.getByText(/原因：可进入人工审阅交接/)).toBeInTheDocument()
    expect(screen.getByText(/候选方案不直接改写任务依赖或计划日期/)).toBeInTheDocument()
  })

  it('keeps completed product closeout progress as read-only matrix evidence on wizard summaries', () => {
    render(
      <ConstructionOrganizationScenarioSummary
        activeUseCase="newProjectPlanning"
        scenario={{
          source: 'project_wizard_commit_construction_organization_summary',
          recommendedScenarioIds: ['pile_before_excavation'],
          organizationDecisionReport: {
            source: 'construction_organization_decision_report',
            reportRole: 'product_best_scheme_read_model',
            productCloseoutReadiness: {
              source: 'construction_organization_product_closeout_readiness_from_decision_report',
              status: 'candidate_recommendation_only_runtime_closeout_required',
              canDeclareConstructionOrganizationProductOutcomeCloseout: true,
              productOutcomeCloseoutProgress: {
                source: 'construction_organization_product_outcome_closeout_progress',
                status: 'product_outcome_closeout_ready',
                canDeclareConstructionOrganizationProductOutcomeCloseout: true,
                supportedBusinessTypeCount: 11,
                precisionReplayReadyBusinessTypeCount: 11,
                runtimeOutcomeReadyBusinessTypeCount: 11,
                readyBusinessTypes: [
                  'general_civil',
                  'hospital',
                  'industrial_cleanroom',
                  'modular_building',
                ],
                missingBusinessTypes: [],
                topMissingReasons: [],
                nextEvidenceActions: [],
                mutationBoundary: {
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                  writesBaseline: false,
                  writesCriticalPathFacts: false,
                  writesAccelerationDraft: false,
                },
                boundaryPolicy: [
                  'progress_projection_is_read_only',
                  'progress_projection_does_not_replace_product_outcome_closeout_matrix',
                ],
              },
              missingBeforeProductCloseout: [],
            },
          },
        }}
      />,
    )

    expect(screen.getByText(/产品闭环：11\/11 业态运行证据已闭合，仍以运行闭环矩阵为准/)).toBeInTheDocument()
    expect(screen.queryByText(/可进入产品收口声明|业态可收口/)).not.toBeInTheDocument()
  })

  it('prefers active use-case scenario ids when a generated-row snapshot has no matching plan option', () => {
    const rows = makePreviewRows(1)
    rows[0] = {
      ...rows[0],
      values: {
        ...rows[0].values,
        standard_task_metadata: {
          projectOrganization: {
            scenarioSelection: {
              source: 'construction_organization_scenario_selector',
              recommendedScenarioIds: ['pile_before_excavation'],
              recommendedPlanOption: {
                optionId: 'option-default',
                selectedScenarioIds: ['pile_before_excavation'],
                confidence: 'medium',
              },
              scenarioRecommendations: {
                startingLineOnboarding: {
                  useCase: 'starting_line_onboarding',
                  selectedScenarioIds: ['shared_basement_first_then_tower'],
                  actionability: 'not_actionable_after_current_phase',
                  currentSubstage: 'main_structure',
                },
              },
            },
          },
        },
      },
    }

    render(
      <TemplateGenerationPreview
        rows={rows}
        selectedRowIds={new Set(['preview-1'])}
        duplicatePolicy="skip"
        onDuplicatePolicyChange={vi.fn()}
        onToggleRow={vi.fn()}
        onApply={vi.fn()}
        constructionOrganizationUseCase="startingLineOnboarding"
      />,
    )

    expect(screen.getByText(/整体地下室先行/)).toBeInTheDocument()
    expect(screen.queryByText(/先桩后挖/)).toBeNull()
    expect(screen.getByText(/起跑线接入：仅作证据，当前阶段不可倒写/)).toBeInTheDocument()
  })

  it('loads catalog, generates preview, and applies inline template rows through the shared draft flow', async () => {
    vi.mocked(listWbsTemplateCatalog).mockResolvedValue({
      builtIn: {
        templateId: 'template-1',
        templateCode: 'demo',
        templateName: '住宅主体结构模板',
        sourceStandard: 'GB demo',
        sourceVersion: '2026',
        divisionCount: 1,
        nodeCount: 2,
        evidenceSummary: catalogTemplates[0].evidenceSummary!,
      },
      templates: catalogTemplates,
    })
    vi.mocked(generateWbsTemplatePreview).mockResolvedValue({
      generationBatchId: 'batch-1',
      templateId: 'template-1',
      generationDepth: 'item_work',
      rows: makePreviewRows(2),
      previewRows: makePreviewRows(2),
      scopeCombos: [],
      operations: [],
      writeMode: 'preview_only',
    })
    const onApply = vi.fn()

    render(
      <TemplateInlineExpand
        projectId="project-1"
        surface="task_list"
        defaultScope={{ building_object_id: 'building-1' }}
        scopeLabel="楼栋: 1#楼"
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByText('钢筋工程')).toBeTruthy())
    fireEvent.click(screen.getByText('生成预览'))
    await waitFor(() => expect(screen.getByTestId('template-generation-preview')).toBeTruthy())
    fireEvent.click(screen.getByTestId('template-duplicate-policy-overwrite'))
    fireEvent.click(screen.getByText('加入草稿'))

    await waitFor(() => expect(onApply).toHaveBeenCalled())
    expect(generateWbsTemplatePreview).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      surface: 'task_list',
      templateId: 'template-1',
      templateIds: ['template-1'],
      duplicatePolicy: 'skip',
      generationDepth: 'item_work',
    }))
    expect(onApply.mock.calls[0][1]).toEqual(expect.objectContaining({
      duplicatePolicy: 'overwrite',
      generationDepth: 'item_work',
    }))
  })

  it('uses the recommended nested node and awaits selected-task drilldown commit', async () => {
    const nestedTemplate: WbsTemplateCatalogItem = {
      ...catalogTemplates[0],
      nodes: [{
        ...catalogTemplates[0].nodes![0],
        id: 'division-1',
        categoryType: 'division',
        children: [{
          ...catalogTemplates[0].nodes![0],
          id: 'item-work-1',
          name: '主体结构施工',
          categoryType: 'item_work',
          children: [],
        }],
      }],
    }
    vi.mocked(listWbsTemplateCatalog).mockResolvedValue({
      builtIn: {
        templateId: nestedTemplate.id,
        templateCode: 'demo',
        templateName: nestedTemplate.name,
        sourceStandard: 'GB demo',
        sourceVersion: '2026',
        divisionCount: 1,
        nodeCount: 2,
        evidenceSummary: nestedTemplate.evidenceSummary!,
      },
      templates: [nestedTemplate],
    })
    vi.mocked(generateWbsTemplatePreview).mockResolvedValue({
      generationBatchId: 'batch-drilldown',
      templateId: nestedTemplate.id,
      generationDepth: 'process',
      rowLimit: 80,
      rows: makePreviewRows(2),
      previewRows: makePreviewRows(2),
      scopeCombos: [],
      operations: [],
      writeMode: 'preview_only',
    })
    const applyDeferred: { resolve: () => void } = { resolve: () => undefined }
    const applyPromise = new Promise<void>((resolve) => { applyDeferred.resolve = resolve })
    const onApply = vi.fn(() => applyPromise)
    const onCancel = vi.fn()

    render(
      <TemplateInlineExpand
        projectId="project-1"
        surface="task_list"
        defaultScope={{ building_object_id: 'building-1' }}
        attachUnderRowId="parent-task-1"
        drilldownPreset={{
          templateId: nestedTemplate.id,
          selectedNodeIds: ['item-work-1'],
          generationDepth: 'process',
          includeActivitySteps: false,
          rowLimit: 80,
        }}
        applyLabel="保存下钻计划"
        onApply={onApply}
        onCancel={onCancel}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('template-browser-node-item-work-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('生成预览'))
    await waitFor(() => expect(screen.getByTestId('template-generation-preview')).toBeInTheDocument())
    expect(generateWbsTemplatePreview).toHaveBeenCalledWith(expect.objectContaining({
      attachUnderRowId: 'parent-task-1',
      templateId: nestedTemplate.id,
      selectedNodeIds: ['item-work-1'],
      generationDepth: 'process',
      includeActivitySteps: false,
    }))

    fireEvent.click(screen.getByText('保存下钻计划'))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    expect(onCancel).not.toHaveBeenCalled()
    applyDeferred.resolve()
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
  })

  it('uses a parent-bound rhythm recommendation even when it is not a WBS catalog template', async () => {
    vi.mocked(listWbsTemplateCatalog).mockResolvedValue({
      builtIn: {
        templateId: catalogTemplates[0].id,
        templateCode: 'demo',
        templateName: catalogTemplates[0].name,
        sourceStandard: 'GB demo',
        sourceVersion: '2026',
        divisionCount: 1,
        nodeCount: 1,
        evidenceSummary: catalogTemplates[0].evidenceSummary!,
      },
      templates: catalogTemplates,
    })
    vi.mocked(generateWbsTemplatePreview).mockResolvedValue({
      generationBatchId: 'batch-t2-drilldown',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      generationDepth: 'process',
      rowLimit: 80,
      rows: makePreviewRows(24),
      previewRows: makePreviewRows(24),
      scopeCombos: [],
      operations: [],
      writeMode: 'preview_only',
    })

    render(
      <TemplateInlineExpand
        projectId="project-1"
        surface="task_list"
        defaultScope={{ building_object_id: 'building-1' }}
        attachUnderRowId="parent-task-1"
        drilldownPreset={{
          templateId: 't2-residential-standard-floor-structure-rhythm-v1',
          templateName: '住宅标准层主体结构节奏（T2）',
          selectedNodeIds: ['t2-residential-standard-floor-structure-rhythm-v1:floor-cycles'],
          selectedNodeNames: ['按标准层施工循环展开'],
          generationDepth: 'process',
          includeActivitySteps: false,
          rowLimit: 80,
        }}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getAllByText('住宅标准层主体结构节奏（T2）').length).toBeGreaterThan(0))
    expect(screen.getByText('按标准层施工循环展开')).toBeInTheDocument()
    fireEvent.click(screen.getByText('生成预览'))
    await waitFor(() => expect(generateWbsTemplatePreview).toHaveBeenCalledWith(expect.objectContaining({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      selectedNodeIds: ['t2-residential-standard-floor-structure-rhythm-v1:floor-cycles'],
      generationDepth: 'process',
    })))
  })

  it('blocks apply when a selected-task drilldown preview exceeds 80 schedule rows', () => {
    render(
      <TemplateGenerationPreview
        rows={makePreviewRows(81)}
        selectedRowIds={new Set(makePreviewRows(81).map((row) => row.clientRowId))}
        duplicatePolicy="skip"
        onDuplicatePolicyChange={vi.fn()}
        onToggleRow={vi.fn()}
        onApply={vi.fn()}
        applyLabel="保存下钻计划"
        maxRows={80}
        rowLimitBehavior="hard_limit"
      />,
    )

    expect(screen.getByText('保存下钻计划').closest('button')).toBeDisabled()
  })

  it('renders task-list inline template previews with the starting-line construction organization use case', async () => {
    vi.mocked(listWbsTemplateCatalog).mockResolvedValue({
      builtIn: {
        templateId: 'template-1',
        templateCode: 'demo',
        templateName: '住宅主体结构模板',
        sourceStandard: 'GB demo',
        sourceVersion: '2026',
        divisionCount: 1,
        nodeCount: 2,
        evidenceSummary: catalogTemplates[0].evidenceSummary!,
      },
      templates: catalogTemplates,
    })
    const previewRows = makePreviewRows(1)
    previewRows[0] = {
      ...previewRows[0],
      values: {
        ...previewRows[0].values,
        standard_task_metadata: {
          projectOrganization: {
            scenarioSelection: {
              source: 'construction_organization_scenario_selector',
              recommendedScenarioIds: ['pile_before_excavation'],
              recommendedPlanOption: {
                optionId: 'option-default',
                selectedScenarioIds: ['pile_before_excavation'],
                confidence: 'medium',
              },
              scenarioRecommendations: {
                startingLineOnboarding: {
                  useCase: 'starting_line_onboarding',
                  selectedScenarioIds: ['shared_basement_first_then_tower'],
                  actionability: 'not_actionable_after_current_phase',
                  currentSubstage: 'main_structure',
                },
              },
            },
          },
        },
      },
    }
    vi.mocked(generateWbsTemplatePreview).mockResolvedValue({
      generationBatchId: 'batch-1',
      templateId: 'template-1',
      generationDepth: 'item_work',
      rows: previewRows,
      previewRows,
      scopeCombos: [],
      operations: [],
      writeMode: 'preview_only',
    })

    render(
      <TemplateInlineExpand
        projectId="project-1"
        surface="task_list"
        defaultScope={{ building_object_id: 'building-1' }}
        scopeLabel="楼栋: 1#楼"
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByText('钢筋工程')).toBeTruthy())
    fireEvent.click(screen.getByText('生成预览'))

    await waitFor(() => expect(screen.getByText(/整体地下室先行/)).toBeInTheDocument())
    expect(screen.queryByText(/先桩后挖/)).toBeNull()
    expect(screen.getByText(/起跑线接入：仅作证据，当前阶段不可倒写/)).toBeInTheDocument()
  })
})
