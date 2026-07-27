import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}))

const { generateWbsTemplatePreview } = await import('../wbsTemplateGenerationApi')

function collectObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectObjectKeys)
  }
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    key,
    ...collectObjectKeys(child),
  ])
}

describe('wbsTemplateGenerationApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiPost.mockResolvedValue({
      generationBatchId: 'batch-1',
      templateId: 'template-1',
      generationDepth: 'item_work',
      rows: [],
      previewRows: [],
      scopeCombos: [],
      operations: [],
      writeMode: 'preview_only',
    })
  })

  it('strips legacy scope-object fields before requesting template preview generation', async () => {
    await generateWbsTemplatePreview({
      projectId: 'project-1',
      surface: 'task_list',
      templateId: 'template-1',
      scope: {
        building_object_id: 'building-1',
        physical_zone_object_id: 'physical-zone-1',
        zone_object_id: 'legacy-zone-1',
        scope_dimensions: [{ type: 'zone', value: 'A区' }],
        nestedLegacy: {
          professional_object_id: 'legacy-professional-1',
          project_scope_dimensions: [{ type: 'professional', value: '机电' }],
          legacy_object_type: 'zone',
        },
      },
      operations: [{
        type: 'template_generate',
        scope: {
          phase_object_id: 'phase-1',
          zone_object_id: 'legacy-operation-zone',
        },
      }],
      phaseOperations: [{
        type: 'template_generate',
        scope: {
          building_object_id: 'building-2',
          legacy_object_type: 'professional',
        },
      }],
      zone_object_id: 'legacy-root-zone',
    } as any)

    const postedPayload = mocks.apiPost.mock.calls[0]?.[1]
    const postedKeys = collectObjectKeys(postedPayload)

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/wbs-templates/generate-preview',
      expect.objectContaining({
        projectId: 'project-1',
        duplicatePolicy: 'skip',
        scope: expect.objectContaining({
          building_object_id: 'building-1',
          physical_zone_object_id: 'physical-zone-1',
        }),
      }),
    )
    expect(postedKeys).not.toContain('zone_object_id')
    expect(postedKeys).not.toContain('professional_object_id')
    expect(postedKeys).not.toContain('scope_dimensions')
    expect(postedKeys).not.toContain('project_scope_dimensions')
    expect(postedKeys).not.toContain('legacy_object_type')
  })

  it('fails closed when target feasibility duration metadata is malformed', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      generationBatchId: 'batch-typed-duration',
      templateId: 'template-1',
      generationDepth: 'item_work',
      rows: [],
      previewRows: [],
      scopeCombos: [],
      operations: [],
      writeMode: 'preview_only',
      targetFeasibility: {
        mode: 'compression_preview',
        targetEndDate: '2026-07-20',
        naturalEndDate: '2026-07-25',
        overshootDays: 999,
        overshoot: {
          value: 5,
          unit: 'calendar_day',
          calendarRef: null,
          calendarVersion: 'ISO-8601',
          timezone: 'Asia/Shanghai',
          asOf: '2026-07-20',
          availability: 'available',
        },
        recoverableDays: 999,
        recoverable: {
          value: 3,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2026-07-20',
          availability: 'available',
        },
        unrecoverableDays: 999,
        unrecoverable: null,
        verdict: 'compressible',
        strategies: [],
      },
    })

    const preview = await generateWbsTemplatePreview({
      projectId: 'project-1',
      surface: 'task_list',
      templateId: 'template-1',
    })

    expect(preview.targetFeasibility?.overshoot).toBeNull()
    expect(preview.targetFeasibility?.recoverable).toEqual(expect.objectContaining({
      value: 3,
      unit: 'construction_production_day',
      availability: 'available',
    }))
  })
})
