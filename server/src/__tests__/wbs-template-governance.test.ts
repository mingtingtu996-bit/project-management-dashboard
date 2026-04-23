import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import supertest from 'supertest'

import { buildBaselineItemsFromTemplateNodes } from '../services/planningBootstrap.js'

const state = vi.hoisted(() => {
  const templateTree = [
    {
      title: 'Preparation',
      source_id: 'node-prep',
      reference_days: 12,
      children: [
        { title: 'Survey', source_id: 'node-survey', reference_days: 4 },
        { title: 'Drawings', source_id: 'node-drawings', reference_days: 15 },
      ],
    },
    {
      title: 'Structure',
      source_id: 'node-structure',
      reference_days: 30,
      children: [
        { title: 'Typical floor cycle', source_id: 'node-standard', reference_days: 24 },
      ],
    },
  ]

  return {
    template: {
      id: 'template-1',
      template_name: 'Sample WBS Template',
      template_data: JSON.parse(JSON.stringify(templateTree)),
      wbs_nodes: JSON.parse(JSON.stringify(templateTree)),
      reference_days: null as number | null,
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    baselineTemplate: JSON.parse(JSON.stringify(templateTree)),
    projects: [
      { id: 'project-1', name: 'Completed project A', status: 'completed' },
      { id: 'project-2', name: 'Completed project B', status: 'done' },
      { id: 'project-3', name: 'Active project', status: 'active' },
      { id: 'project-4', name: 'Completed but unmapped project', status: 'completed' },
    ],
    tasks: [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: 'Survey',
        baseline_item_id: 'baseline-survey-1',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-07T00:00:00.000Z',
      },
      {
        id: 'task-2',
        project_id: 'project-2',
        title: 'Survey',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-09T00:00:00.000Z',
      },
      {
        id: 'task-3',
        project_id: 'project-1',
        title: 'Drawings',
        baseline_item_id: 'baseline-drawings-1',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-22T00:00:00.000Z',
      },
      {
        id: 'task-4',
        project_id: 'project-2',
        title: 'Drawings',
        baseline_item_id: 'baseline-drawings-2',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-24T00:00:00.000Z',
      },
      {
        id: 'task-5',
        project_id: 'project-1',
        title: 'Typical floor cycle',
        baseline_item_id: 'baseline-standard-1',
        status: 'completed',
        actual_start_date: '2026-04-01T00:00:00.000Z',
        actual_end_date: '2026-04-21T00:00:00.000Z',
      },
      {
        id: 'task-6',
        project_id: 'project-2',
        title: 'Typical floor cycle',
        baseline_item_id: 'baseline-standard-2',
        status: 'completed',
        actual_start_date: '2026-04-01T00:00:00.000Z',
        actual_end_date: '2026-04-23T00:00:00.000Z',
      },
      {
        id: 'task-7',
        project_id: 'project-3',
        title: 'Typical floor cycle',
        status: 'in_progress',
        actual_start_date: null,
        actual_end_date: null,
      },
      {
        id: 'task-8',
        project_id: 'project-1',
        title: 'Survey',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-04-10T00:00:00.000Z',
      },
      {
        id: 'task-9',
        project_id: 'project-4',
        title: 'Free-form finished task',
        status: 'completed',
        actual_start_date: '2026-03-05T00:00:00.000Z',
        actual_end_date: '2026-03-12T00:00:00.000Z',
      },
    ] as Array<{
      id: string
      project_id: string
      title: string
      status: string
      actual_start_date: string | null
      actual_end_date: string | null
      baseline_item_id?: string
      task_source?: string | null
    }>,
    baselineItems: [
      { id: 'baseline-survey-1', source_task_id: 'node-survey' },
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
      { id: 'baseline-drawings-1', source_task_id: 'node-drawings' },
      { id: 'baseline-drawings-2', source_task_id: 'node-drawings' },
      { id: 'baseline-standard-1', source_task_id: 'node-standard' },
      { id: 'baseline-standard-2', source_task_id: 'node-standard' },
    ] as Array<{ id: string; source_task_id?: string | null }>,
  }
})

const dbMock = vi.hoisted(() => ({
  executeSQL: vi.fn(async (query: string, params: any[] = []) => {
    if (query.includes('SELECT id, name, status FROM projects')) {
      return state.projects
    }

    if (query.includes('SELECT * FROM tasks')) {
      return state.tasks
    }

    if (query.includes('SELECT id, source_task_id FROM task_baseline_items')) {
      return state.baselineItems
    }

    if (query.includes('UPDATE wbs_templates')) {
      const [wbsNodesJson, templateDataJson, referenceDays] = params
      state.template.wbs_nodes = JSON.parse(String(wbsNodesJson))
      state.template.template_data = JSON.parse(String(templateDataJson))
      state.template.reference_days = referenceDays
      state.template.updated_at = String(params[3] ?? new Date().toISOString())
      return []
    }

    return []
  }),
  executeSQLOne: vi.fn(async (query: string, params: any[] = []) => {
    if (query.includes('SELECT * FROM wbs_templates WHERE id = ?')) {
      return params[0] === state.template.id ? state.template : null
    }

    return null
  }),
}))

vi.mock('../services/dbService.js', () => dbMock)
vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))
vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import wbsTemplateGovernanceRouter from '../routes/wbs-template-governance.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/wbs-template-governance', wbsTemplateGovernanceRouter)
  return app
}

describe('wbs template governance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.template.template_data = JSON.parse(JSON.stringify(state.baselineTemplate))
    state.template.wbs_nodes = JSON.parse(JSON.stringify(state.baselineTemplate))
    state.template.reference_days = null
    state.template.updated_at = '2026-04-01T00:00:00.000Z'
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: 'Survey',
        baseline_item_id: 'baseline-survey-1',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-07T00:00:00.000Z',
      },
      {
        id: 'task-2',
        project_id: 'project-2',
        title: 'Survey',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-09T00:00:00.000Z',
      },
      {
        id: 'task-3',
        project_id: 'project-1',
        title: 'Drawings',
        baseline_item_id: 'baseline-drawings-1',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-22T00:00:00.000Z',
      },
      {
        id: 'task-4',
        project_id: 'project-2',
        title: 'Drawings',
        baseline_item_id: 'baseline-drawings-2',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-24T00:00:00.000Z',
      },
      {
        id: 'task-5',
        project_id: 'project-1',
        title: 'Typical floor cycle',
        baseline_item_id: 'baseline-standard-1',
        status: 'completed',
        actual_start_date: '2026-04-01T00:00:00.000Z',
        actual_end_date: '2026-04-21T00:00:00.000Z',
      },
      {
        id: 'task-6',
        project_id: 'project-2',
        title: 'Typical floor cycle',
        baseline_item_id: 'baseline-standard-2',
        status: 'completed',
        actual_start_date: '2026-04-01T00:00:00.000Z',
        actual_end_date: '2026-04-23T00:00:00.000Z',
      },
      {
        id: 'task-7',
        project_id: 'project-3',
        title: 'Typical floor cycle',
        status: 'in_progress',
        actual_start_date: null,
        actual_end_date: null,
      },
      {
        id: 'task-8',
        project_id: 'project-1',
        title: 'Survey',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-04-10T00:00:00.000Z',
      },
      {
        id: 'task-9',
        project_id: 'project-4',
        title: 'Free-form finished task',
        status: 'completed',
        actual_start_date: '2026-03-05T00:00:00.000Z',
        actual_end_date: '2026-03-12T00:00:00.000Z',
      },
    ]
    state.baselineItems = [
      { id: 'baseline-survey-1', source_task_id: 'node-survey' },
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
      { id: 'baseline-drawings-1', source_task_id: 'node-drawings' },
      { id: 'baseline-drawings-2', source_task_id: 'node-drawings' },
      { id: 'baseline-standard-1', source_task_id: 'node-standard' },
      { id: 'baseline-standard-2', source_task_id: 'node-standard' },
    ]
  })

  it('aggregates only structurally mapped samples into reference day suggestions', async () => {
    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.completed_project_count).toBe(2)
    expect(response.body.data.sample_task_count).toBe(6)
    expect(response.body.data.matched_ad_hoc_task_count).toBe(0)
    expect(response.body.data.node_count).toBe(5)

    const nodes = response.body.data.nodes
    expect(nodes.find((node: any) => node.path === '0:preparation')).toMatchObject({
      is_leaf: false,
      sample_count: 4,
      current_reference_days: 12,
      suggested_reference_days: 10,
    })
    expect(nodes.find((node: any) => node.path === '0:preparation/0:survey')).toMatchObject({
      is_leaf: true,
      sample_count: 2,
      mean_days: 7,
      median_days: 7,
      current_reference_days: 4,
      suggested_reference_days: 7,
    })
    expect(nodes.find((node: any) => node.path === '0:preparation/1:drawings')).toMatchObject({
      sample_count: 2,
      mean_days: 13,
      median_days: 13,
      current_reference_days: 15,
      suggested_reference_days: 13,
    })

    const inferenceRes = await supertest(app).get('/api/wbs-template-governance/template-1/reference-days')
    expect(inferenceRes.status).toBe(200)
    expect(inferenceRes.body.success).toBe(true)
    expect(inferenceRes.body.data.updated_count).toBe(3)
    expect(inferenceRes.body.data.feedback.nodes.find((node: any) => node.path === '1:structure')).toMatchObject({
      sample_count: 2,
      suggested_reference_days: 21,
    })
    expect(inferenceRes.body.data.nodes.some((node: any) => node.path === '0:preparation')).toBe(false)
    expect(inferenceRes.body.data.nodes.find((node: any) => node.path === '1:structure/0:typical floor cycle')).toMatchObject({
      is_leaf: true,
      suggested_reference_days: 21,
    })
  })

  it('confirms reference days and writes them back into template JSON', async () => {
    const app = buildApp()
    const response = await supertest(app)
      .post('/api/wbs-template-governance/template-1/reference-days/confirm')
      .send({ apply_all: true })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.updated_count).toBe(3)
    expect(response.body.data.reference_days).toBe(41)

    const template = state.template
    expect(template.reference_days).toBe(41)
    const root = template.template_data[0]
    expect(root.reference_days).toBe(12)
    expect(root.children[0].reference_days).toBe(7)
    expect(root.children[1].reference_days).toBe(13)
    expect(template.template_data[1].reference_days).toBe(30)
    expect(template.template_data[1].children[0].reference_days).toBe(21)

    const baselineItems = buildBaselineItemsFromTemplateNodes(template.template_data as any, {
      projectId: 'project-1',
      baselineVersionId: 'baseline-1',
      anchorDate: '2026-05-01',
    })

    expect(baselineItems).toHaveLength(5)
    expect(baselineItems[0]).toMatchObject({
      title: 'Preparation',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-20',
    })
    expect(baselineItems[1]).toMatchObject({
      title: 'Survey',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-07',
    })
    expect(baselineItems[2]).toMatchObject({
      title: 'Drawings',
      planned_start_date: '2026-05-08',
      planned_end_date: '2026-05-20',
    })
    expect(baselineItems[3]).toMatchObject({
      title: 'Structure',
      planned_start_date: '2026-05-21',
      planned_end_date: '2026-06-19',
    })
  })

  it('can confirm only selected paths', async () => {
    const app = buildApp()
    await supertest(app)
      .post('/api/wbs-template-governance/template-1/reference-days/confirm')
      .send({ apply_all: false, selected_paths: ['0:preparation/1:drawings'] })

    expect(state.template.template_data[0].reference_days).toBe(12)
    expect(state.template.template_data[0].children[0].reference_days).toBe(4)
    expect(state.template.template_data[0].children[1].reference_days).toBe(13)
  })

  it('rejects invalid selected_paths payloads before mutation', async () => {
    const app = buildApp()
    const beforeTemplate = JSON.stringify(state.template.template_data)

    const response = await supertest(app)
      .post('/api/wbs-template-governance/template-1/reference-days/confirm')
      .send({ apply_all: false, selected_paths: '0:preparation/1:drawings' })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(JSON.stringify(state.template.template_data)).toBe(beforeTemplate)
  })

  it('uses baseline mapping even when project task names are noisy', async () => {
    state.template.template_data = [
      {
        title: 'Preparation',
        source_id: 'node-prep',
        reference_days: 12,
        children: [
          { title: 'Survey', source_id: 'node-survey', reference_days: 4 },
          { title: 'Drawings', source_id: 'node-drawings', reference_days: 15 },
        ],
      },
    ]
    state.template.wbs_nodes = JSON.parse(JSON.stringify(state.template.template_data))
    state.tasks = [
      {
        id: 'task-survey-1',
        project_id: 'project-1',
        title: 'Field batch A',
        baseline_item_id: 'baseline-survey-1',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-06T00:00:00.000Z',
      },
      {
        id: 'task-survey-2',
        project_id: 'project-2',
        title: 'Onsite renamed survey execution',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'task-drawings-1',
        project_id: 'project-1',
        title: 'Design package round 1',
        baseline_item_id: 'baseline-drawings-1',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-20T00:00:00.000Z',
      },
      {
        id: 'task-drawings-2',
        project_id: 'project-2',
        title: 'Second issue package',
        baseline_item_id: 'baseline-drawings-2',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-24T00:00:00.000Z',
      },
    ]
    state.baselineItems = [
      { id: 'baseline-survey-1', source_task_id: 'node-survey' },
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
      { id: 'baseline-drawings-1', source_task_id: 'node-drawings' },
      { id: 'baseline-drawings-2', source_task_id: 'node-drawings' },
    ]

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.sample_task_count).toBe(4)
    expect(response.body.data.matched_ad_hoc_task_count).toBe(0)

    const nodes = response.body.data.nodes
    expect(nodes.find((node: any) => node.path === '0:preparation/0:survey')).toMatchObject({
      sample_count: 2,
      mean_days: 6,
      median_days: 6,
      suggested_reference_days: 6,
    })
    expect(nodes.find((node: any) => node.path === '0:preparation/1:drawings')).toMatchObject({
      sample_count: 2,
      mean_days: 12,
      median_days: 12,
      suggested_reference_days: 12,
    })
  })

  it('includes completed ad_hoc tasks when they map cleanly to a template node title', async () => {
    state.tasks = [
      {
        id: 'task-ad-hoc-survey',
        project_id: 'project-1',
        title: 'Survey',
        task_source: 'ad_hoc',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-06T00:00:00.000Z',
      },
      {
        id: 'task-structured-survey',
        project_id: 'project-2',
        title: 'Field batch',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-09T00:00:00.000Z',
      },
    ]
    state.baselineItems = [
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
    ]

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.sample_task_count).toBe(2)
    expect(response.body.data.matched_ad_hoc_task_count).toBe(1)
    expect(response.body.data.nodes.find((node: any) => node.path === '0:preparation/0:survey')).toMatchObject({
      sample_count: 2,
      suggested_reference_days: 7,
    })
  })

  it('includes completed ad_hoc tasks when the title loosely matches a unique template leaf', async () => {
    state.tasks = [
      {
        id: 'task-ad-hoc-survey-loose',
        project_id: 'project-1',
        title: 'Site survey temporary follow-up',
        task_source: 'ad_hoc',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-05T00:00:00.000Z',
      },
      {
        id: 'task-structured-survey',
        project_id: 'project-2',
        title: 'Field batch',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-09T00:00:00.000Z',
      },
    ]
    state.baselineItems = [
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
    ]

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.sample_task_count).toBe(2)
    expect(response.body.data.matched_ad_hoc_task_count).toBe(1)
    expect(response.body.data.nodes.find((node: any) => node.path === '0:preparation/0:survey')).toMatchObject({
      sample_count: 2,
      suggested_reference_days: 6,
    })
  })
})
