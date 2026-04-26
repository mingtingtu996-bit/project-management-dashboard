import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getReviewModeLabel, type ReviewMode } from '../services/drawingPackageService.js'

process.env.NODE_ENV = 'test'

type DrawingReviewRuleRow = {
  id: string
  project_id: string | null
  package_code: string | null
  discipline_type: string | null
  document_purpose: string | null
  default_review_mode: ReviewMode
  review_basis: string | null
  reviewer_id?: string | null
  is_active: boolean | number | null
  created_at: string
  updated_at: string
}

const state = vi.hoisted(() => {
  const rules: DrawingReviewRuleRow[] = []
  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    if (normalized.startsWith('select') && normalized.includes('from drawing_review_rules')) {
      if (normalized.includes('where id = ?')) {
        const id = String(params[0] ?? '').trim()
        return rules.filter((rule) => rule.id === id)
      }

      if (normalized.includes('where project_id = ?')) {
        const projectId = String(params[0] ?? '').trim()
        return rules
          .filter((rule) => rule.project_id === projectId)
          .sort((left, right) => left.created_at.localeCompare(right.created_at))
      }

      if (normalized.includes('where project_id is null')) {
        return rules
          .filter((rule) => rule.project_id == null)
          .sort((left, right) => left.created_at.localeCompare(right.created_at))
      }

      return [...rules].sort((left, right) => {
        const leftProjectRank = left.project_id == null ? 1 : 0
        const rightProjectRank = right.project_id == null ? 1 : 0
        if (leftProjectRank !== rightProjectRank) {
          return leftProjectRank - rightProjectRank
        }
        if (leftProjectRank === 0 && rightProjectRank === 0 && left.project_id !== right.project_id) {
          return String(left.project_id).localeCompare(String(right.project_id))
        }
        return left.created_at.localeCompare(right.created_at)
      })
    }

    if (normalized.startsWith('insert into drawing_review_rules')) {
      const [
        id,
        projectId,
        packageCode,
        disciplineType,
        documentPurpose,
        defaultReviewMode,
        reviewBasis,
        reviewerId,
        isActive,
        createdAt,
        updatedAt,
      ] = params as [
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        boolean | number | null,
        unknown,
        unknown,
      ]
      rules.push({
        id: String(id),
        project_id: projectId == null ? null : String(projectId),
        package_code: packageCode == null ? null : String(packageCode),
        discipline_type: disciplineType == null ? null : String(disciplineType),
        document_purpose: documentPurpose == null ? null : String(documentPurpose),
        default_review_mode: String(defaultReviewMode) as ReviewMode,
        review_basis: reviewBasis == null ? null : String(reviewBasis),
        reviewer_id: reviewerId == null ? null : String(reviewerId),
        is_active: isActive,
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return []
    }

    if (normalized.startsWith('update drawing_review_rules')) {
      const [
        packageCode,
        disciplineType,
        documentPurpose,
        defaultReviewMode,
        reviewBasis,
        reviewerId,
        isActive,
        updatedAt,
        id,
      ] = params as [
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        boolean | number | null,
        unknown,
        unknown,
      ]
      const row = rules.find((rule) => rule.id === String(id))
      if (row) {
        row.package_code = packageCode == null ? null : String(packageCode)
        row.discipline_type = disciplineType == null ? null : String(disciplineType)
        row.document_purpose = documentPurpose == null ? null : String(documentPurpose)
        row.default_review_mode = String(defaultReviewMode) as ReviewMode
        row.review_basis = reviewBasis == null ? null : String(reviewBasis)
        row.reviewer_id = reviewerId == null ? null : String(reviewerId)
        row.is_active = isActive
        row.updated_at = String(updatedAt)
      }
      return []
    }

    if (normalized.startsWith('delete from drawing_review_rules')) {
      const id = String(params[0] ?? '').trim()
      const index = rules.findIndex((rule) => rule.id === id)
      if (index >= 0) {
        rules.splice(index, 1)
      }
      return []
    }

    return []
  })

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const rows = await executeSQL(sql, params)
    return Array.isArray(rows) ? rows[0] ?? null : null
  })

  return {
    rules,
    executeSQL,
    executeSQLOne,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: (_req: any, _res: any, next: () => void) => next(),
  requireProjectEditor: (getProjectId: (req: any) => string | undefined | Promise<string | undefined>) => {
    return async (req: any, res: any, next: () => void) => {
      const projectId = await getProjectId(req)
      if (!projectId) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: '缺少项目ID' },
          timestamp: new Date().toISOString(),
        })
        return
      }

      req.user = {
        id: 'user-1',
        globalRole: 'regular',
      }
      next()
    }
  },
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
}))

const { registerDrawingReviewRuleRoutes } = await import('../routes/drawing-review-rules.js')

function buildApp() {
  const app = express()
  app.use(express.json())

  const router = express.Router()
  registerDrawingReviewRuleRoutes(router)
  app.use('/api/construction-drawings', router)
  const topLevelRouter = express.Router()
  registerDrawingReviewRuleRoutes(topLevelRouter, '')
  app.use('/api/drawing-review-rules', topLevelRouter)

  return app
}

function seedRule(row: Omit<DrawingReviewRuleRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<DrawingReviewRuleRow, 'id' | 'created_at' | 'updated_at'>>) {
  state.rules.push({
    id: row.id ?? `seed-${state.rules.length + 1}`,
    project_id: row.project_id,
    package_code: row.package_code,
    discipline_type: row.discipline_type,
    document_purpose: row.document_purpose,
    default_review_mode: row.default_review_mode,
    review_basis: row.review_basis,
    reviewer_id: row.reviewer_id ?? null,
    is_active: row.is_active,
    created_at: row.created_at ?? `2026-04-2${state.rules.length + 1} 08:00:00`,
    updated_at: row.updated_at ?? `2026-04-2${state.rules.length + 1} 08:00:00`,
  })
}

describe('drawing review rules routes', () => {
  beforeEach(() => {
    state.rules.splice(0, state.rules.length)
    vi.clearAllMocks()
  })

  it('smoke-tests the client path for listing, CRUD, and evaluation', async () => {
    seedRule({
      id: 'global-rule',
      project_id: null,
      package_code: null,
      discipline_type: '消防',
      document_purpose: '送审报批',
      default_review_mode: 'mandatory',
      review_basis: '全局消防规则',
      reviewer_id: 'reviewer-global',
      is_active: 1,
      created_at: '2026-04-24 08:00:00',
      updated_at: '2026-04-24 08:00:00',
    })
    seedRule({
      id: 'project-rule',
      project_id: 'project-1',
      package_code: 'fire-review',
      discipline_type: '消防',
      document_purpose: '送审报批',
      default_review_mode: 'mandatory',
      review_basis: '项目级消防规则',
      reviewer_id: 'reviewer-1',
      is_active: 1,
      created_at: '2026-04-25 08:00:00',
      updated_at: '2026-04-25 08:00:00',
    })

    const request = supertest(buildApp())

    const listRes = await request.get('/api/construction-drawings/review-rules?projectId=project-1')
    expect(listRes.status).toBe(200)
    expect(listRes.body.success).toBe(true)
    expect(listRes.body.data.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          templateCode: expect.any(String),
          templateName: expect.any(String),
          defaultReviewModeLabel: getReviewModeLabel(listRes.body.data.templates[0].defaultReviewMode),
        }),
      ]),
    )
    expect(listRes.body.data.rules).toHaveLength(2)
    expect(listRes.body.data.rules[0]).toMatchObject({ id: 'project-rule', project_id: 'project-1' })
    expect(listRes.body.data.rules[1]).toMatchObject({ id: 'global-rule', project_id: null })

    const createRes = await request.post('/api/construction-drawings/review-rules').send({
      project_id: 'project-1',
      package_code: 'fire-review-2',
      discipline_type: '消防',
      document_purpose: '送审报批',
      default_review_mode: 'mandatory',
      review_basis: '消防专项包默认必审',
      reviewer_id: 'reviewer-1',
      is_active: true,
    })
    expect(createRes.status).toBe(201)
    expect(createRes.body.success).toBe(true)
    expect(createRes.body.data).toMatchObject({
      project_id: 'project-1',
      package_code: 'fire-review-2',
      discipline_type: '消防',
      document_purpose: '送审报批',
      default_review_mode: 'mandatory',
      review_basis: '消防专项包默认必审',
      reviewer_id: 'reviewer-1',
    })

    const createdId = String(createRes.body.data.id)

    const updateRes = await request.put(`/api/construction-drawings/review-rules/${createdId}`).send({
      review_basis: '项目级人工复核',
      default_review_mode: 'manual_confirm',
    })
    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data).toMatchObject({
      id: createdId,
      project_id: 'project-1',
      package_code: 'fire-review-2',
      default_review_mode: 'manual_confirm',
      review_basis: '项目级人工复核',
    })

    const evaluateRes = await request.post('/api/construction-drawings/review-rules/evaluate').send({
      disciplineType: '消防',
      documentPurpose: '送审报批',
      packageCode: 'fire-review',
      packageName: '消防专项包',
      defaultReviewMode: 'none',
      reviewBasis: '项目级覆盖规则',
    })
    expect(evaluateRes.status).toBe(200)
    expect(evaluateRes.body.data).toMatchObject({
      requiresReview: true,
      reviewMode: 'mandatory',
      reviewBasis: '消防专项包默认必审',
    })

    const deleteRes = await request.delete(`/api/construction-drawings/review-rules/${createdId}?projectId=project-1`)
    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.success).toBe(true)

    const finalListRes = await request.get('/api/construction-drawings/review-rules?projectId=project-1')
    expect(finalListRes.status).toBe(200)
    expect(finalListRes.body.data.rules).toHaveLength(2)
    expect(finalListRes.body.data.rules).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: createdId })]),
    )
  })

  it('also exposes the checklist-level /api/drawing-review-rules CRUD path', async () => {
    seedRule({
      id: 'project-rule',
      project_id: 'project-1',
      package_code: 'fire-review',
      discipline_type: '消防',
      document_purpose: '送审报批',
      default_review_mode: 'mandatory',
      review_basis: '项目级消防规则',
      reviewer_id: 'reviewer-1',
      is_active: 1,
      created_at: '2026-04-25 08:00:00',
      updated_at: '2026-04-25 08:00:00',
    })

    const request = supertest(buildApp())
    const listRes = await request.get('/api/drawing-review-rules?projectId=project-1')
    expect(listRes.status).toBe(200)
    expect(listRes.body.data.rules[0]).toMatchObject({
      id: 'project-rule',
      reviewer_id: 'reviewer-1',
    })

    const blockedRes = await request.post('/api/drawing-review-rules').send({
      project_id: 'project-1',
      default_review_mode: 'mandatory',
      review_basis: '缺少审图人',
    })
    expect(blockedRes.status).toBe(400)
    expect(blockedRes.body.error?.code).toBe('MISSING_REVIEWER_FOR_MANDATORY')
  })

  it('returns all review rules when projectId is omitted', async () => {
    seedRule({
      id: 'global-rule',
      project_id: null,
      package_code: null,
      discipline_type: '消防',
      document_purpose: '送审报批',
      default_review_mode: 'mandatory',
      review_basis: '全局消防规则',
      is_active: 1,
      created_at: '2026-04-24 08:00:00',
      updated_at: '2026-04-24 08:00:00',
    })
    seedRule({
      id: 'project-rule-a',
      project_id: 'project-1',
      package_code: 'fire-review',
      discipline_type: '消防',
      document_purpose: '送审报批',
      default_review_mode: 'mandatory',
      review_basis: '项目级消防规则 A',
      is_active: 1,
      created_at: '2026-04-25 08:00:00',
      updated_at: '2026-04-25 08:00:00',
    })
    seedRule({
      id: 'project-rule-b',
      project_id: 'project-2',
      package_code: 'archive-review',
      discipline_type: '竣工归档',
      document_purpose: '竣工归档',
      default_review_mode: 'manual_confirm',
      review_basis: '项目级归档规则',
      is_active: 1,
      created_at: '2026-04-26 08:00:00',
      updated_at: '2026-04-26 08:00:00',
    })

    const request = supertest(buildApp())
    const res = await request.get('/api/construction-drawings/review-rules')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.rules).toHaveLength(3)
    expect(res.body.data.rules[0]).toMatchObject({ id: 'project-rule-a' })
    expect(res.body.data.rules[1]).toMatchObject({ id: 'project-rule-b' })
    expect(res.body.data.rules[2]).toMatchObject({ id: 'global-rule' })
  })

  it('rejects invalid review mode values during evaluation', async () => {
    const request = supertest(buildApp())
    const res = await request.post('/api/construction-drawings/review-rules/evaluate').send({
      packageCode: 'fire-review',
      packageName: '消防专项包',
      defaultReviewMode: 'unsupported',
    })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error?.code).toBe('INVALID_REVIEW_MODE')
  })
})
