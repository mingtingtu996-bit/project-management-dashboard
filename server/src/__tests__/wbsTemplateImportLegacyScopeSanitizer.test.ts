import express from 'express'
import request from 'supertest'
import * as XLSX from '@e965/xlsx'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  uuidCounter: 0,
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  supabaseInserts: [] as any[],
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    mocks.uuidCounter += 1
    return `template-uuid-${mocks.uuidCounter}`
  }),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: vi.fn(async () => ({ companyId: 'company-1', role: 'company_admin' })),
  getProjectCompanyId: vi.fn(async () => 'company-1'),
  getProjectPermissionLevel: vi.fn(async () => 'editor'),
  getVisibleProjectIds: vi.fn(async () => ['project-1']),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: {
    from: vi.fn((tableName: string) => {
      if (tableName === 'tasks' || tableName === 'milestones') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

      if (tableName === 'wbs_templates') {
        return {
          insert: vi.fn(async (payload: any) => {
            mocks.supabaseInserts.push(payload)
            return { error: null }
          }),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: mocks.supabaseInserts.at(-1) ?? null,
                error: null,
              })),
            })),
          })),
        }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
      }
    }),
  },
}))

vi.mock('../services/validationService.js', () => ({
  ValidationService: {
    validateWbsTemplate: vi.fn(() => ({ valid: true, errors: [] })),
  },
}))

vi.mock('../services/planningBootstrap.js', () => ({
  PlanningBootstrapService: class {
    buildContext() {
      return { guide: [] }
    }
  },
}))

vi.mock('../services/wbsTemplatePresets.js', () => ({
  buildSuggestedWbsTemplate: vi.fn(() => []),
}))

vi.mock('../services/wbsTemplateGenerationService.js', () => ({
  CHINA_GB55032_TEMPLATE_ID: 'template-1',
  CHINA_GB55032_TEMPLATE_CODE: 'code-1',
  CHINA_GB55032_TEMPLATE_NAME: '模板',
  CHINA_GB55032_TEMPLATE_SOURCE_STANDARD: 'GB',
  CHINA_GB55032_TEMPLATE_SOURCE_VERSION: '2026',
  buildTemplateGenerateCreateOperations: vi.fn(() => []),
  generateWbsTemplatePhaseChainRows: vi.fn(),
  generateWbsTemplateRows: vi.fn(),
  getWbsTemplateCatalogItem: vi.fn(),
  listWbsTemplateCatalog: vi.fn(),
  loadWbsTemplateNodes: vi.fn(),
  validateChinaGb50300Seed: vi.fn(() => ({ ok: true, issues: [] })),
}))

const { default: wbsTemplatesRouter } = await import('../routes/wbs-templates.js')

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

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/planning/wbs-templates', wbsTemplatesRouter)
  return app
}

function pollutedNodes() {
  return [{
    title: '主体结构',
    level: 1,
    duration: 3,
    parent_id: null,
    sort_order: 1,
    zone_object_id: 'legacy-zone-1',
    scope_dimensions: [{ type: 'zone', value: 'A区' }],
    metadata: {
      professional_object_id: 'legacy-professional-1',
      project_scope_dimensions: [{ type: 'professional', value: '机电' }],
    },
    children: [{
      title: '钢筋工程',
      legacy_object_type: 'zone',
    }],
  }]
}

function workbookBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function suspiciousZipBuffer(uncompressedSize: number): Buffer {
  const filename = Buffer.from('xl/worksheets/sheet1.xml')
  const payload = Buffer.from('x')
  const localHeader = Buffer.alloc(30)
  localHeader.writeUInt32LE(0x04034b50, 0)
  localHeader.writeUInt16LE(20, 4)
  localHeader.writeUInt16LE(0, 6)
  localHeader.writeUInt16LE(0, 8)
  localHeader.writeUInt32LE(0, 10)
  localHeader.writeUInt32LE(0, 14)
  localHeader.writeUInt32LE(payload.length, 18)
  localHeader.writeUInt32LE(uncompressedSize, 22)
  localHeader.writeUInt16LE(filename.length, 26)
  localHeader.writeUInt16LE(0, 28)

  const localRecord = Buffer.concat([localHeader, filename, payload])
  const centralDirectoryOffset = localRecord.length
  const centralHeader = Buffer.alloc(46)
  centralHeader.writeUInt32LE(0x02014b50, 0)
  centralHeader.writeUInt16LE(20, 4)
  centralHeader.writeUInt16LE(20, 6)
  centralHeader.writeUInt16LE(0, 8)
  centralHeader.writeUInt16LE(0, 10)
  centralHeader.writeUInt32LE(0, 12)
  centralHeader.writeUInt32LE(0, 16)
  centralHeader.writeUInt32LE(payload.length, 20)
  centralHeader.writeUInt32LE(uncompressedSize, 24)
  centralHeader.writeUInt16LE(filename.length, 28)
  centralHeader.writeUInt16LE(0, 30)
  centralHeader.writeUInt16LE(0, 32)
  centralHeader.writeUInt16LE(0, 34)
  centralHeader.writeUInt16LE(0, 36)
  centralHeader.writeUInt32LE(0, 38)
  centralHeader.writeUInt32LE(0, 42)
  const centralRecord = Buffer.concat([centralHeader, filename])

  const endOfCentralDirectory = Buffer.alloc(22)
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(0, 4)
  endOfCentralDirectory.writeUInt16LE(0, 6)
  endOfCentralDirectory.writeUInt16LE(1, 8)
  endOfCentralDirectory.writeUInt16LE(1, 10)
  endOfCentralDirectory.writeUInt32LE(centralRecord.length, 12)
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16)
  endOfCentralDirectory.writeUInt16LE(0, 20)

  return Buffer.concat([localRecord, centralRecord, endOfCentralDirectory])
}

function makeTemplateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'template-1',
    company_id: 'company-1',
    project_id: 'project-1',
    template_name: '模板',
    template_type: '住宅',
    description: '',
    wbs_nodes: [],
    is_default: false,
    deleted_at: null,
    ...overrides,
  }
}

function assertNoLegacyScopeKeys(value: unknown) {
  const keys = collectObjectKeys(value)

  expect(keys).not.toContain('zone_object_id')
  expect(keys).not.toContain('professional_object_id')
  expect(keys).not.toContain('scope_dimensions')
  expect(keys).not.toContain('project_scope_dimensions')
  expect(keys).not.toContain('legacy_object_type')
}

function flattenNodeNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(flattenNodeNames)
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  return [
    String(record.name ?? record.title ?? ''),
    ...flattenNodeNames(record.children),
  ].filter(Boolean)
}

function assertNoPrototypePollutionKeys(value: unknown) {
  const keys = collectObjectKeys(value)
  const names = flattenNodeNames(value)
  const forbidden = [
    '__proto__',
    'constructor',
    'prototype',
    '__defineGetter__',
    '__defineSetter__',
    'constructor.prototype.polluted',
  ]

  for (const token of forbidden) {
    expect(keys).not.toContain(token)
    expect(names).not.toContain(token)
  }
}

describe('wbs template import legacy scope-object sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.uuidCounter = 0
    mocks.supabaseInserts = []
    mocks.executeSQL.mockResolvedValue([])
    mocks.executeSQLOne.mockResolvedValue(null)
  })

  it('loads template lists through fixed visible-scope SQL branches', async () => {
    const response = await request(buildApp())
      .get('/api/planning/wbs-templates?type=住宅')

    expect(response.status).toBe(200)
    const sqlText = mocks.executeSQL.mock.calls.map(([sql]) => String(sql)).join('\n')

    expect(mocks.executeSQL.mock.calls.length).toBeGreaterThan(1)
    expect(sqlText).not.toContain('WHERE 1=1')
    expect(sqlText).not.toContain(' OR ')
    expect(sqlText).not.toContain('COALESCE(')
    expect(sqlText).not.toContain('SELECT *')
  })

  it('exports selected templates without dynamic id-in SQL assembly', async () => {
    const response = await request(buildApp())
      .get('/api/planning/wbs-templates/export-json?ids=template-1')

    expect(response.status).toBe(200)
    const sqlText = mocks.executeSQL.mock.calls.map(([sql]) => String(sql)).join('\n')

    expect(mocks.executeSQL.mock.calls.length).toBeGreaterThan(1)
    expect(sqlText).not.toContain('id IN (?)')
    expect(sqlText).not.toContain(' OR ')
    expect(sqlText).not.toContain('COALESCE(')
    expect(sqlText).not.toContain('SELECT *')
  })

  it('strips legacy scope-object fields from create payloads before persistence', async () => {
    mocks.executeSQLOne.mockResolvedValue(makeTemplateRow())

    const response = await request(buildApp())
      .post('/api/planning/wbs-templates')
      .send({
        project_id: 'project-1',
        name: '旧对象污染模板',
        template_type: '住宅',
        template_data: pollutedNodes(),
      })

    expect(response.status).toBe(201)
    const insertParams = mocks.executeSQL.mock.calls[0]?.[1]
    const persistedNodes = JSON.parse(String(insertParams?.[6] ?? '[]'))

    expect(JSON.stringify(persistedNodes)).toContain('主体结构')
    assertNoLegacyScopeKeys(persistedNodes)
  })

  it('strips legacy scope-object fields from update payloads before persistence', async () => {
    mocks.executeSQLOne.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT project_id, company_id')) {
        return { project_id: 'project-1', company_id: 'company-1' }
      }
      return makeTemplateRow()
    })

    const response = await request(buildApp())
      .put('/api/planning/wbs-templates/template-1')
      .send({
        template_name: '更新模板',
        wbs_nodes: pollutedNodes(),
      })

    expect(response.status).toBe(200)
    const updateParams = mocks.executeSQL.mock.calls[0]?.[1] ?? []
    const persistedNodesJson = updateParams.find((value: unknown) =>
      typeof value === 'string' && value.includes('主体结构'),
    )
    const persistedNodes = JSON.parse(String(persistedNodesJson ?? '[]'))

    assertNoLegacyScopeKeys(persistedNodes)
  })

  it('strips legacy scope-object fields from cloned template nodes before persistence', async () => {
    mocks.executeSQLOne.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT project_id, company_id')) {
        return { project_id: 'project-1', company_id: 'company-1' }
      }
      if (sql.includes('deleted_at IS NULL')) {
        return makeTemplateRow({
          wbs_nodes: JSON.stringify(pollutedNodes()),
        })
      }
      return makeTemplateRow({ id: 'template-uuid-1' })
    })

    const response = await request(buildApp())
      .post('/api/planning/wbs-templates/template-1/clone')
      .send({
        project_id: 'project-1',
      })

    expect(response.status).toBe(201)
    const insertParams = mocks.executeSQL.mock.calls[0]?.[1]
    const persistedNodes = JSON.parse(String(insertParams?.[6] ?? '[]'))

    assertNoLegacyScopeKeys(persistedNodes)
  })

  it('strips legacy scope-object fields from JSON-imported template nodes before persistence', async () => {
    const response = await request(buildApp())
      .post('/api/planning/wbs-templates/import-json')
      .send({
        project_id: 'project-1',
        templates: [{
          name: '旧对象污染模板',
          template_type: '住宅',
          nodes: pollutedNodes(),
        }],
      })

    expect(response.status).toBe(201)
    const insertParams = mocks.executeSQL.mock.calls[0]?.[1]
    const persistedNodes = JSON.parse(String(insertParams?.[6] ?? '[]'))
    const persistedKeys = collectObjectKeys(persistedNodes)

    expect(JSON.stringify(persistedNodes)).toContain('主体结构')
    assertNoLegacyScopeKeys(persistedNodes)
    expect(persistedKeys).not.toContain('zone_object_id')
  })

  it('neutralizes spreadsheet formulas and html-like task names from Excel imports before persistence', async () => {
    mocks.executeSQLOne.mockResolvedValue(makeTemplateRow({
      id: 'template-uuid-1',
      wbs_nodes: [],
    }))
    const beforePolluted = ({} as Record<string, unknown>).polluted
    const file = workbookBuffer([
      ['title', 'days', 'level'],
      ['=HYPERLINK("http://evil.example","click")', 1, 1],
      ['@SUM(1,1)', 2, 1],
      ['<img src=x onerror=alert(1)>主体', 3, 1],
      ['__proto__', 4, 1],
    ])

    const response = await request(buildApp())
      .post('/api/planning/wbs-templates/import-excel?project_id=project-1')
      .field('project_id', 'project-1')
      .field('name', '恶意表格导入')
      .attach('file', file, 'malicious.xlsx')

    expect(response.status).toBe(201)
    const insertParams = mocks.executeSQL.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO wbs_templates'),
    )?.[1]
    const persistedNodes = JSON.parse(String(insertParams?.[6] ?? '[]')) as Array<{ name?: string }>
    const names = persistedNodes.map(node => String(node.name ?? ''))

    expect(names).toHaveLength(3)
    for (const name of names) {
      expect(name).not.toMatch(/^[=+\-@]/)
      expect(name).not.toContain('<')
      expect(name).not.toContain('>')
      expect(name.toLowerCase()).not.toContain('onerror')
    }
    expect(insertParams).toHaveLength(10)
    expect(insertParams?.[7]).toBe(true)
    expect(insertParams?.[8]).toEqual(expect.any(String))
    expect(insertParams?.[9]).toEqual(expect.any(String))
    assertNoPrototypePollutionKeys(persistedNodes)
    expect(({} as Record<string, unknown>).polluted).toBe(beforePolluted)
  })

  it('drops deep prototype pollution worksheet keys before WBS nodes are persisted', async () => {
    mocks.executeSQLOne.mockResolvedValue(makeTemplateRow({
      id: 'template-uuid-1',
      wbs_nodes: [],
    }))
    const beforePolluted = ({} as Record<string, unknown>).polluted
    const file = workbookBuffer([
      ['title', 'days', 'level'],
      ['主体结构', 1, 1],
      ['constructor', 1, 2],
      ['prototype', 1, 3],
      ['constructor.prototype.polluted', 1, 2],
      ['__defineGetter__', 1, 2],
      ['__proto__', 1, 2],
      ['安全节点', 1, 2],
    ])

    const response = await request(buildApp())
      .post('/api/planning/wbs-templates/import-excel?project_id=project-1')
      .field('project_id', 'project-1')
      .field('name', '原型污染深度样本')
      .attach('file', file, 'prototype-pollution.xlsx')

    expect(response.status).toBe(201)
    const insertParams = mocks.executeSQL.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO wbs_templates'),
    )?.[1]
    const persistedNodes = JSON.parse(String(insertParams?.[6] ?? '[]'))
    const names = flattenNodeNames(persistedNodes)

    expect(names).toContain('主体结构')
    expect(names).toContain('安全节点')
    assertNoPrototypePollutionKeys(persistedNodes)
    expect(({} as Record<string, unknown>).polluted).toBe(beforePolluted)
  })

  it('rejects suspicious xlsx archives before workbook parsing can inflate them', async () => {
    const response = await request(buildApp())
      .post('/api/planning/wbs-templates/import-excel?project_id=project-1')
      .field('project_id', 'project-1')
      .field('name', '压缩包风险')
      .attach('file', suspiciousZipBuffer(50 * 1024 * 1024), 'suspicious.xlsx')

    expect(response.status).toBe(413)
    expect(response.body.error.code).toBe('WBS_TEMPLATE_IMPORT_ARCHIVE_TOO_LARGE')
    expect(mocks.executeSQL).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO wbs_templates'),
      expect.anything(),
    )
  })
})
