import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const generateWbsTemplateRows = vi.fn(async (_params: Record<string, unknown>) => ({
    generationBatchId: 'batch-route-fast-template',
    templateId: 'china-gb55032-2022',
    templateIds: ['china-gb55032-2022'],
    generationDepth: 'item_work',
    rows: [],
    scopeCombos: [],
    rowLimit: 200,
    rowLimitPolicy: 'single_batch',
    splitByPhaseApplied: false,
    generationBatches: [],
    suppressedCoreQualityCodes: [],
    governanceWarnings: [],
    scheduleTrustGate: { status: 'pass', reasonCodes: [] },
    phaseWindows: [],
  }))
  const generateWbsTemplatePhaseChainRows = vi.fn(async (_params: Record<string, unknown>) => ({
    generationBatchId: 'batch-route-fast-template-chain',
    templateId: 'china-gb55032-2022',
    templateIds: ['china-gb55032-2022'],
    generationDepth: 'item_work',
    rows: [],
    scopeCombos: [],
    rowLimit: 200,
    rowLimitPolicy: 'single_batch',
    splitByPhaseApplied: false,
    generationBatches: [],
    suppressedCoreQualityCodes: [],
    governanceWarnings: [],
    scheduleTrustGate: { status: 'pass', reasonCodes: [] },
    phaseWindows: [],
  }))

  return {
    generateWbsTemplateRows,
    generateWbsTemplatePhaseChainRows,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: vi.fn(async () => []),
  executeSQLOne: vi.fn(async () => null),
  supabase: {
    from: () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    }),
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'owner-1' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: vi.fn(async () => null),
  getProjectCompanyId: vi.fn(async () => null),
  getProjectPermissionLevel: vi.fn(async () => 'editor'),
  getVisibleProjectIds: vi.fn(async () => null),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => null),
}))

vi.mock('../services/wbsTemplateGenerationService.js', () => ({
  CHINA_GB55032_TEMPLATE_ID: 'china-gb55032-2022',
  CHINA_GB55032_TEMPLATE_CODE: 'GB55032',
  CHINA_GB55032_TEMPLATE_NAME: '建筑与市政工程施工质量控制通用规范',
  CHINA_GB55032_TEMPLATE_SOURCE_STANDARD: 'GB55032-2022',
  CHINA_GB55032_TEMPLATE_SOURCE_VERSION: '2022',
  buildTemplateGenerateCreateOperations: vi.fn(() => []),
  generateWbsTemplatePhaseChainRows: mocks.generateWbsTemplatePhaseChainRows,
  generateWbsTemplateRows: mocks.generateWbsTemplateRows,
  getWbsTemplateCatalogItem: vi.fn(async () => null),
  listWbsTemplateCatalog: vi.fn(async () => ({ templates: [] })),
  loadWbsTemplateNodes: vi.fn(async () => []),
  validateChinaGb50300Seed: vi.fn(() => ({ valid: true, issues: [] })),
}))

const { default: wbsTemplatesRouter } = await import('../routes/wbs-templates.js')

const app = express()
app.use(express.json())
app.use('/api/planning/wbs-templates', wbsTemplatesRouter)

describe('wbs template generate-preview route duration mode boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not expose the internal fast-template diagnostic mode on API previews', async () => {
    const response = await supertest(app)
      .post('/api/planning/wbs-templates/generate-preview')
      .send({
        projectId: 'project-1',
        templateId: 'china-gb55032-2022',
        selectedNodeIds: ['02-01-01'],
        plannedStartDate: '2026-07-01',
        detailLevel: 'planning_skeleton',
        generationDepth: 'managed_frontier',
        projectFacts: {
          projectTypeCode: 'residential',
          defaultPlanOutput: 'master_plan',
        },
        clientContext: {
          defaultPlanOutput: 'master_plan',
          planOutputLayer: 'master_plan',
          masterPlanProfile: {
            layer: 'master_plan',
            detailLevel: 'planning_skeleton',
            generationDepth: 'managed_frontier',
          },
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
    }))
    expect(mocks.generateWbsTemplateRows.mock.calls[0]?.[0]).not.toHaveProperty('diagnosticDurationSuggestionMode')
  })
})
