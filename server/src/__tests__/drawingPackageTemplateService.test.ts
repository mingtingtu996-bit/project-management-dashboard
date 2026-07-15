import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const executeSQL = vi.fn(async (_sql: string, _params: unknown[] = []) => [])
  const executeSQLOne = vi.fn(async (_sql: string, _params: unknown[] = []) => null)
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = []
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized === 'begin' || normalized === 'commit' || normalized === 'rollback') {
        return { rows: [], rowCount: 0 }
      }
      const insertMatch = normalized.match(/^insert into "([^"]+)"/)
      if (insertMatch) {
        const columnsMatch = sql.match(/\(([^)]+)\)\s+VALUES/i)
        const columns = columnsMatch?.[1]
          ?.split(',')
          .map((column) => column.trim().replace(/^"|"$/g, '')) ?? []
        const row = Object.fromEntries(columns.map((column, index) => [column, params[index] ?? null]))
        const table = insertMatch[1]
        inserted.push({ table, row })
        return { rows: [{ id: row.id ?? `${table}-${inserted.length}`, ...row }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    }),
    release: vi.fn(),
  }
  const getClient = vi.fn(async () => client)

  return {
    executeSQL,
    executeSQLOne,
    inserted,
    client,
    getClient,
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
}))

vi.mock('../database.js', () => ({
  getClient: state.getClient,
}))

function projectWithBusinessType(businessTypeCode: string, extraFacts: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    name: `${businessTypeCode} project`,
    metadata: {
      projectGenerationFacts: {
        businessTypeCode,
        projectFeatures: {
          businessTypeCode,
          locationFacts: { provinceCode: 'GD', cityCode: 'shenzhen' },
          ...extraFacts,
        },
      },
    },
  }
}

describe('drawing package template service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    state.inserted.splice(0, state.inserted.length)
    state.client.query.mockClear()
    state.client.release.mockClear()
    state.getClient.mockResolvedValue(state.client)
    state.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.includes('from drawing_packages')) return []
      if (normalized.includes('from drawing_package_items')) return []
      return []
    })
    state.executeSQLOne.mockResolvedValue(projectWithBusinessType('general_civil'))
  })

  it('exports a package-level seed for the same eleven formal business types as acceptance timeline', async () => {
    const { DRAWING_PACKAGE_TEMPLATE_SEED, DRAWING_PACKAGE_TEMPLATE_SEED_VERSION } = await import(
      '../seeds/drawingPackageTemplateSeed.js'
    )

    expect(DRAWING_PACKAGE_TEMPLATE_SEED_VERSION).toBe('v1.4.22.6')
    expect(DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles.map((profile) => profile.businessTypeCode)).toEqual([
      'general_civil',
      'hotel',
      'hospital',
      'school',
      'industrial',
      'data_center',
      'transportation_hub',
      'sports_culture',
      'tod_upper_cover',
      'renovation',
      'modular_building',
    ])
    expect(DRAWING_PACKAGE_TEMPLATE_SEED.packagePool.every((pkg) => pkg.items.length > 0)).toBe(true)
  })

  it('builds a drawing package preview from projectGenerationFacts without writing drawing rows', async () => {
    const { buildDrawingPackageTemplatePreview } = await import('../services/drawingPackageTemplateService.js')
    state.executeSQLOne.mockResolvedValueOnce(projectWithBusinessType('data_center', {
      criticalPower: true,
      telecomConnection: true,
    }))

    const preview = await buildDrawingPackageTemplatePreview('project-1')
    const packageCodes = preview.packages.map((pkg) => pkg.packageCode)

    expect(preview.businessProfile).toMatchObject({
      businessTypeCode: 'data_center',
      source: 'project_generation_facts',
    })
    expect(preview.templateBoundary).toMatchObject({
      assetLevel: 'drawing_package',
      mainPageLogic: 'preserved',
    })
    expect(preview.summary.packageCreateCount).toBeGreaterThanOrEqual(10)
    expect(packageCodes).toEqual(expect.arrayContaining([
      'pkg-master-plan-construction',
      'pkg-architecture-construction',
      'pkg-structure-construction',
      'pkg-water-construction',
      'pkg-hvac-construction',
      'pkg-electrical-construction',
      'pkg-intelligent-construction',
      'pkg-fire-review',
      'pkg-data-center-critical-mep',
      'pkg-completion-archive',
    ]))
    expect(preview.packages.every((pkg) => pkg.items.length > 0)).toBe(true)
    expect(preview.packages.flatMap((pkg) => pkg.items).every((item) => item.itemName)).toBe(true)
    expect(preview.packages.every((pkg) => (
      pkg.deliverableRole
      && pkg.linkedConstructionStage
      && pkg.linkedAcceptancePurpose
    ))).toBe(true)
    expect(state.client.query).not.toHaveBeenCalled()
  })

  it('keeps experience replay candidates out of preview unless a qualified overlay is explicitly supplied', async () => {
    const { buildDrawingPackageTemplatePreview } = await import('../services/drawingPackageTemplateService.js')
    state.executeSQLOne.mockResolvedValue(projectWithBusinessType('industrial', {
      productionProcess: true,
      environmentalFacilities: true,
    }))

    const defaultPreview = await buildDrawingPackageTemplatePreview('project-1')
    expect(defaultPreview.packages.map((pkg) => pkg.packageCode)).not.toContain('pkg-clean-room-specialty')
    expect(defaultPreview.experienceOverlay?.additionalPackageCodes ?? []).toEqual([])

    const overlayPreview = await buildDrawingPackageTemplatePreview('project-1', {
      experienceOverlay: {
        overlayCode: 'drawing_package_experience_overlay',
        sourceReportCode: 'drawing_package_experience_replay',
        sourceSeedVersion: 'v1.4.22.6',
        additionalPackageCodes: ['pkg-clean-room-specialty'],
        runtimeConsumptionPolicy: 'qualified_experience_overlay_after_replay_gate',
        qualityGate: {
          status: 'passed',
          packageHitRate: 0.96,
          calibratedSampleCount: 2,
        },
      },
    })
    const cleanRoom = overlayPreview.packages.find((pkg) => pkg.packageCode === 'pkg-clean-room-specialty')

    expect(cleanRoom).toMatchObject({
      packageCode: 'pkg-clean-room-specialty',
      action: 'will_create',
      overlaySource: 'experience_replay_candidate',
    })
    expect(overlayPreview.experienceOverlay).toMatchObject({
      runtimeConsumptionPolicy: 'qualified_experience_overlay_after_replay_gate',
      additionalPackageCodes: ['pkg-clean-room-specialty'],
    })
  })

  it('skips existing package codes and applies only selected missing packages with existing package schema fields', async () => {
    const {
      DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
      buildDrawingPackageTemplatePreview,
      applyDrawingPackageTemplate,
    } = await import('../services/drawingPackageTemplateService.js')
    state.executeSQLOne.mockResolvedValue(projectWithBusinessType('industrial'))
    state.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.includes('from drawing_packages')) {
        return [{
          id: 'existing-structure',
          project_id: 'project-1',
          package_code: 'pkg-structure-construction',
          package_name: '结构施工图包',
          discipline_type: '结构',
          document_purpose: '施工执行',
          status: 'pending',
        }]
      }
      return []
    })

    const preview = await buildDrawingPackageTemplatePreview('project-1')
    const structure = preview.packages.find((pkg) => pkg.packageCode === 'pkg-structure-construction')
    const industrialProcess = preview.packages.find((pkg) => pkg.packageCode === 'pkg-industrial-process')

    expect(structure?.action).toBe('will_skip_existing')
    expect(industrialProcess?.action).toBe('will_create')

    const result = await applyDrawingPackageTemplate('project-1', {
      templateCode: preview.templateCode,
      seedVersion: DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
      selectedPackageCodes: preview.packages.filter((pkg) => pkg.action === 'will_create').map((pkg) => pkg.packageCode),
      duplicatePolicy: 'skip_existing',
    })

    expect(result.createdPackageIds.length).toBe(preview.summary.packageCreateCount)
    expect(result.skippedExisting).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'package', key: 'pkg-structure-construction' }),
    ]))

    const packageRows = state.inserted.filter((entry) => entry.table === 'drawing_packages').map((entry) => entry.row)
    const itemRows = state.inserted.filter((entry) => entry.table === 'drawing_package_items').map((entry) => entry.row)
    expect(packageRows.map((row) => row.package_code)).not.toContain('pkg-structure-construction')
    expect(packageRows.map((row) => row.package_code)).toContain('pkg-industrial-process')
    expect(itemRows.length).toBeGreaterThan(packageRows.length)
    expect(packageRows.every((row) => !('design_unit' in row) && !('review_unit' in row) && !('lead_unit' in row) && !('responsible_user_id' in row))).toBe(true)
  })
})
