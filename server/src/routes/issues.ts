// Issues API route
// 10.1 base model and route skeleton; no upgrade-chain resolution logic yet.
import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam, issueSchema, issueUpdateSchema } from '../middleware/validation.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import {
  getIssues,
  getIssue,
} from '../services/dbService.js'
import { isActiveIssue } from '../utils/issueStatus.js'
import {
  confirmIssuePendingManualCloseInMainChain,
  createIssueInMainChain,
  deleteIssueInMainChain,
  keepIssueProcessingInMainChain,
  syncIssueNotificationInMainChain,
  updateIssueInMainChain,
} from '../services/issueWriteChainService.js'
import { isProtectedIssue } from '../services/upgradeChainService.js'
import { getVisibleProjectIds } from '../auth/access.js'
import type { ApiResponse } from '../types/index.js'
import type { Issue } from '../types/db.js'

const router = Router()

function parseExpectedVersion(input: unknown) {
  if (input === undefined || input === null || input === '') return undefined
  const version = Number(input)
  return Number.isInteger(version) && version > 0 ? version : null
}

function normalizeIssueKey(value?: string | null) {
  return String(value ?? '').trim()
}

async function findDuplicateIssue(input: {
  project_id: string
  title: string
  source_type?: string | null
  source_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
}) {
  const projectId = normalizeIssueKey(input.project_id)
  const title = normalizeIssueKey(input.title).toLowerCase()
  const sourceType = normalizeIssueKey(input.source_type)

  const issues = await getIssues(input.project_id)
  return issues.find((issue) => {
    if (!isActiveIssue(issue)) return false
    return (
      normalizeIssueKey(issue.project_id) === projectId
      && normalizeIssueKey(issue.source_type) === sourceType
      && normalizeIssueKey(issue.title).toLowerCase() === title
    )
  }) ?? null
}

function buildUpgradeChainProtectedResponse(issue: Issue): ApiResponse {
  return {
    success: false,
    error: {
      code: 'UPGRADE_CHAIN_PROTECTED',
      message: 'This record is linked to an upgrade chain. Close it instead of deleting it.',
      details: {
        entity_type: 'issue',
        entity_id: issue.id,
        source_type: issue.source_type,
        source_id: issue.source_id ?? null,
        chain_id: issue.chain_id ?? null,
      },
    },
    timestamp: new Date().toISOString(),
  }
}

function normalizeIssueStatus(value?: string | null) {
  return normalizeIssueKey(value).toLowerCase()
}

function getIssueSourceLabel(sourceType?: string | null) {
  switch (normalizeIssueKey(sourceType)) {
    case 'manual':
      return '手动创建'
    case 'risk_converted':
      return '风险转问题'
    case 'risk_auto_escalated':
      return '风险自动升级'
    case 'obstacle_escalated':
      return '阻碍上卷'
    case 'condition_expired':
      return '条件过期'
    case 'source_deleted':
      return '来源已删除'
    default:
      return sourceType?.trim() || '未分类'
  }
}

function toIsoDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

function createDateRange(startDateStr: string, endDateStr: string) {
  const dates: string[] = []
  const current = new Date(`${startDateStr}T00:00:00.000Z`)
  const end = new Date(`${endDateStr}T00:00:00.000Z`)

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

router.use(authenticate)

router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching issues', { projectId })

  let issues = await getIssues(projectId)

  if (!projectId && req.user?.id) {
    const visibleProjectIds = await getVisibleProjectIds(req.user.id, req.user.globalRole)
    if (visibleProjectIds) {
      const visibleProjectIdSet = new Set(visibleProjectIds)
      issues = issues.filter((issue) => visibleProjectIdSet.has(String(issue.project_id ?? '')))
    }
  }

  const response: ApiResponse<Issue[]> = {
    success: true,
    data: issues,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/summary', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching issue summary', { projectId })

  let issues = await getIssues(projectId)

  if (!projectId && req.user?.id) {
    const visibleProjectIds = await getVisibleProjectIds(req.user.id, req.user.globalRole)
    if (visibleProjectIds) {
      const visibleProjectIdSet = new Set(visibleProjectIds)
      issues = issues.filter((issue) => visibleProjectIdSet.has(String(issue.project_id ?? '')))
    }
  }

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 29)
  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]
  const dateKeys = createDateRange(startDateStr, endDateStr)

  const trendMap = new Map<string, {
    date: string
    newIssues: number
    resolvedIssues: number
    activeIssues: number
  }>()

  for (const date of dateKeys) {
    trendMap.set(date, {
      date,
      newIssues: 0,
      resolvedIssues: 0,
      activeIssues: 0,
    })
  }

  const activeIssueStatuses = new Set(['open', 'investigating', 'resolved'])
  let activeIssues = 0

  for (const issue of issues) {
    const createdDate = toIsoDate(issue.created_at)
    if (createdDate && trendMap.has(createdDate)) {
      const point = trendMap.get(createdDate)
      if (point) point.newIssues += 1
    }

    const updatedDate = toIsoDate(issue.updated_at)
    if (updatedDate && trendMap.has(updatedDate) && normalizeIssueStatus(issue.status) === 'closed') {
      const point = trendMap.get(updatedDate)
      if (point) point.resolvedIssues += 1
    }

    if (activeIssueStatuses.has(normalizeIssueStatus(issue.status))) {
      activeIssues += 1
    }
  }

  const runningTrend: Array<{ date: string; newIssues: number; resolvedIssues: number; activeIssues: number }> = []
  let runningActive = 0
  for (const date of dateKeys) {
    const point = trendMap.get(date)
    if (!point) continue
    runningActive += point.newIssues - point.resolvedIssues
    point.activeIssues = Math.max(0, runningActive)
    runningTrend.push(point)
  }

  // eslint-disable-next-line -- route-level-aggregation-approved
  const statusCounts = issues.reduce((counts, issue) => {
    const key = normalizeIssueStatus(issue.status) || 'open'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {} as Record<string, number>)

  // eslint-disable-next-line -- route-level-aggregation-approved
  const severityCounts = issues.reduce((counts, issue) => {
    const key = String(issue.severity || 'medium')
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {} as Record<string, number>)

  const sourceCounts = Array.from(
    // eslint-disable-next-line -- route-level-aggregation-approved
    issues.reduce((map, issue) => {
      const key = String(issue.source_type || 'manual')
      map.set(key, (map.get(key) || 0) + 1)
      return map
    }, new Map<string, number>()),
  )
    .map(([key, count]) => ({
      key,
      label: getIssueSourceLabel(key),
      count,
    }))
    .sort((left, right) => right.count - left.count)

  const recentIssues = [...issues]
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
    .slice(0, 8)

  const response: ApiResponse<{
    project_id?: string
    total_issues: number
    active_issues: number
    status_counts: Record<string, number>
    severity_counts: Record<string, number>
    source_counts: Array<{ key: string; label: string; count: number }>
    trend: Array<{ date: string; newIssues: number; resolvedIssues: number; activeIssues: number }>
    recent_issues: Issue[]
  }> = {
    success: true,
    data: {
      project_id: projectId,
      total_issues: issues.length,
      active_issues: activeIssues,
      status_counts: statusCounts,
      severity_counts: severityCounts,
      source_counts: sourceCounts,
      trend: runningTrend,
      recent_issues: recentIssues,
    },
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

router.get('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching issue', { id })

  const issue = await getIssue(id)
  if (!issue) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<Issue> = {
    success: true,
    data: issue,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/', requireProjectEditor((req) => req.body?.project_id), validate(issueSchema), asyncHandler(async (req, res) => {
  logger.info('Creating issue', req.body)

  const duplicate = await findDuplicateIssue(req.body)
  if (duplicate) {
    await syncIssueNotificationInMainChain(duplicate)
    const response: ApiResponse<Issue> = {
      success: true,
      data: duplicate,
      timestamp: new Date().toISOString(),
    }
    return res.status(200).json(response)
  }

  const issue = await createIssueInMainChain({
    ...req.body,
    version: 1,
  })

  const response: ApiResponse<Issue> = {
    success: true,
    data: issue,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

router.put('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const existing = await getIssue(req.params.id)
  return existing?.project_id
}), validate(issueUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { version, ...updates } = req.body
  logger.info('Updating issue', { id, updates })

  const existing = await getIssue(id)
  if (!existing) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const updated = await updateIssueInMainChain(id, updates, version)

  const response: ApiResponse<Issue> = {
    success: true,
    data: updated!,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/confirm-close', validateIdParam, requireProjectEditor(async (req) => {
  const existing = await getIssue(req.params.id)
  return existing?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }
  logger.info('Confirming issue pending manual close', { id, version })

  const issue = await confirmIssuePendingManualCloseInMainChain(id, version)
  if (!issue) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<Issue> = {
    success: true,
    data: issue,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/keep-processing', validateIdParam, requireProjectEditor(async (req) => {
  const existing = await getIssue(req.params.id)
  return existing?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }
  logger.info('Keeping issue in processing', { id, version })

  const issue = await keepIssueProcessingInMainChain(id, version)
  if (!issue) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<Issue> = {
    success: true,
    data: issue,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.delete('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const existing = await getIssue(req.params.id)
  return existing?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting issue', { id })

  const existing = await getIssue(id)
  if (!existing) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  if (isProtectedIssue(existing)) {
    return res.status(422).json(buildUpgradeChainProtectedResponse(existing))
  }

  await deleteIssueInMainChain(id)

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
