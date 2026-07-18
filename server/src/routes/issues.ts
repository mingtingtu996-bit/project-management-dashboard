// Issues API route
// 10.1 base model and route skeleton; no upgrade-chain resolution logic yet.
import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam, issueSchema, issueUpdateSchema, riskIssueClosureOutcomeSchema } from '../middleware/validation.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { query as rawQuery } from '../database.js'
import {
  executeSQL,
  executeSQLOne,
  getIssues,
  getIssue,
  supabase,
} from '../services/dbService.js'
import { isActiveIssue } from '../utils/issueStatus.js'
import {
  confirmIssuePendingManualCloseInMainChain,
  closeIssueByRetentionInMainChain,
  createIssueInMainChain,
  deleteIssueInMainChain,
  keepIssueProcessingInMainChain,
  syncIssueNotificationInMainChain,
  updateIssueInMainChain,
} from '../services/issueWriteChainService.js'
import { isProtectedIssue } from '../services/upgradeChainService.js'
import { assertTransition } from '../services/statusDictionaryService.js'
import { getProjectCompanyId, getVisibleProjectIds } from '../auth/access.js'
import {
  buildAndPersistBusinessCompletionSampleHealthReport,
  buildRiskIssueCloseoutCompletionSamples,
} from '../services/businessCompletionSampleHealthAdapterService.js'
import type { ApiResponse } from '../types/index.js'
import type { Issue } from '../types/db.js'

const router = Router()
const ISSUE_SUMMARY_CACHE_TTL_MS = 15_000
const issueSummaryCache = new Map<string, { expiresAt: number; payload: ApiResponse }>()

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

async function validateIssueProjectReferences(projectId: string, payload: Record<string, unknown>) {
  const taskId = String(payload.task_id ?? '').trim()
  if (taskId) {
    const task = await executeSQLOne<{ project_id?: string | null }>('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [taskId])
    if (!task || String(task.project_id ?? '') !== projectId) {
      return {
        success: false,
        error: {
          code: 'TASK_PROJECT_MISMATCH',
          message: '问题关联的任务必须属于当前项目',
          details: { taskId, projectId },
        },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse
    }
  }

  const sourceType = normalizeIssueKey(payload.source_type as string | null)
  const sourceId = String(payload.source_id ?? '').trim()
  if (sourceId && (sourceType === 'risk_converted' || sourceType === 'risk_auto_escalated')) {
    const risk = await executeSQLOne<{ project_id?: string | null }>('SELECT project_id FROM risks WHERE id = ? LIMIT 1', [sourceId])
    if (!risk || String(risk.project_id ?? '') !== projectId) {
      return {
        success: false,
        error: {
          code: 'RISK_PROJECT_MISMATCH',
          message: '问题来源风险必须属于当前项目',
          details: { riskId: sourceId, projectId },
        },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse
    }
  }

  return null
}

function normalizeIssueStatus(value?: string | null) {
  return normalizeIssueKey(value).toLowerCase()
}

function getIssueSourceLabel(sourceType?: string | null, sourceEntityType?: string | null) {
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
      if (sourceEntityType === 'acceptance_plan') {
        return '验收逾期'
      }
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

async function getIssuesForSummary(projectId?: string): Promise<Issue[]> {
  if (process.env.NODE_ENV !== 'test') {
    try {
      const params: unknown[] = []
      const projectFilter = projectId ? ' WHERE project_id = $1' : ''
      if (projectId) params.push(projectId)
      const result = await rawQuery(
        'SELECT * FROM public.issues' + projectFilter + ' ORDER BY created_at DESC',
        params,
      )
      return (result.rows ?? []) as Issue[]
    } catch (error) {
      logger.warn('Direct issue summary read failed, falling back to Supabase REST', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return getIssues(projectId)
}

async function recordIssueCloseoutSampleHealthEvidence(input: {
  issue: Issue
  sourceRoute: string
}) {
  const projectId = normalizeIssueKey(input.issue.project_id)
  const issueId = normalizeIssueKey(input.issue.id)
  if (!projectId || !issueId) return

  try {
    const companyId = await getProjectCompanyId(projectId)
    if (!companyId) {
      logger.warn('[issues] skip issue closeout sample health evidence without company scope', {
        projectId,
        issueId,
      })
      return
    }

    const closedAt = normalizeIssueKey(input.issue.closed_at)
      || normalizeIssueKey(input.issue.updated_at)
      || new Date().toISOString()
    const issueCode = normalizeIssueKey(input.issue.title) || issueId
    const samples = buildRiskIssueCloseoutCompletionSamples([
      {
        companyId,
        projectId,
        issueId,
        issueCode,
        resolvedAt: closedAt,
        closedAt,
        startedAt: closedAt,
        updatedAt: normalizeIssueKey(input.issue.updated_at),
        qualitySignal: 'verified',
        metadata: {
          sourceRoute: input.sourceRoute,
          riskIssueId: issueId,
          issueTitle: normalizeIssueKey(input.issue.title),
          sourceType: normalizeIssueKey(input.issue.source_type),
          sourceId: normalizeIssueKey(input.issue.source_id),
          sourceEntityType: normalizeIssueKey(input.issue.source_entity_type),
          sourceEntityId: normalizeIssueKey(input.issue.source_entity_id),
          severity: normalizeIssueKey(input.issue.severity),
          status: normalizeIssueKey(input.issue.status),
          closedReason: normalizeIssueKey(input.issue.closed_reason),
          closedAt,
        },
      },
    ])

    await buildAndPersistBusinessCompletionSampleHealthReport({
      companyId,
      projectId,
      queryExec: executeSQL,
      samples,
    })
  } catch (error) {
    logger.warn('[issues] failed to record issue closeout sample health evidence', {
      projectId,
      issueId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

router.use(authenticate)

router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching issues', { projectId })

  let issues = await getIssuesForSummary(projectId)

  if (req.user?.id) {
    const visibleProjectIds = await getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
    if (visibleProjectIds) {
      const visibleProjectIdSet = new Set(visibleProjectIds)
      if (projectId && !visibleProjectIdSet.has(projectId)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: '您没有权限访问此项目问题' },
          timestamp: new Date().toISOString(),
        })
      }
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
  const cacheKey = String(projectId ?? 'all')
  const cached = issueSummaryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.payload)
  }

  let issues = await getIssuesForSummary(projectId)

  if (req.user?.id) {
    const visibleProjectIds = await getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
    if (visibleProjectIds) {
      const visibleProjectIdSet = new Set(visibleProjectIds)
      if (projectId && !visibleProjectIdSet.has(projectId)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: '您没有权限访问此项目问题' },
          timestamp: new Date().toISOString(),
        })
      }
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
      // eslint-disable-next-line -- route-level-aggregation-approved
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
      const entityType = String((issue as unknown as Record<string, unknown>).source_entity_type ?? '')
      const bucketKey = key === 'condition_expired' && entityType === 'acceptance_plan'
        ? 'acceptance_expired'
        : key
      map.set(bucketKey, (map.get(bucketKey) || 0) + 1)
      return map
    }, new Map<string, number>()),
  )
    .map(([key, count]) => ({
      key,
      label: key === 'acceptance_expired' ? '验收逾期' : getIssueSourceLabel(key),
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

  issueSummaryCache.set(cacheKey, {
    expiresAt: Date.now() + ISSUE_SUMMARY_CACHE_TTL_MS,
    payload: response,
  })
  res.json(response)
}))

router.get('/:id', validateIdParam, requireProjectMember(async (req) => {
  const issue = await getIssue(req.params.id)
  return issue?.project_id
}), asyncHandler(async (req, res) => {
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
  const projectId = String(req.body?.project_id ?? '').trim()
  const referenceError = await validateIssueProjectReferences(projectId, req.body ?? {})
  if (referenceError) return res.status(400).json(referenceError)

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

  const projectId = String(updates.project_id ?? existing.project_id ?? '').trim()
  if (updates.project_id !== undefined && projectId !== String(existing.project_id ?? '').trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'PROJECT_ID_IMMUTABLE', message: '问题所属项目不能通过更新接口变更' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  const referenceError = await validateIssueProjectReferences(projectId, updates)
  if (referenceError) return res.status(400).json(referenceError)

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
}), validate(riskIssueClosureOutcomeSchema), asyncHandler(async (req, res) => {
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

  const issue = await confirmIssuePendingManualCloseInMainChain(id, {
    resultCode: req.body.resultCode,
    resultSummary: req.body.resultSummary,
    effectiveness: req.body.effectiveness,
    evidenceRefs: req.body.evidenceRefs,
    causeAttributionId: req.body.causeAttributionId,
  }, String(req.user?.id ?? ''), version)
  if (!issue) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'ISSUE_NOT_FOUND', message: 'Issue not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  await recordIssueCloseoutSampleHealthEvidence({
    issue,
    sourceRoute: 'issues.confirm-close',
  })

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

  // v1.4.15: enforce retention — close instead of physical delete when protected
  const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
  const retention = await enforceRetentionOrBlock({
    entityType: 'issue',
    entityId: id,
    projectId: existing.project_id ?? null,
    userId: req.user?.id ?? null,
    userAction: 'delete',
  })
  if (retention.blocked) {
    return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({ success: false, error: buildRetentionBlockedApiError(retention.reason, retention.result), timestamp: new Date().toISOString() })
  }
  if (retention.result.resolvedAction === 'close') {
    await assertTransition('issue.lifecycle', String(existing.status ?? 'open'), 'closed')
    await closeIssueByRetentionInMainChain(id, existing.project_id, { actorId: req.user?.id ?? null })
  } else {
    await deleteIssueInMainChain(id)
  }

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
