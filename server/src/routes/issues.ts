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

function isActiveIssueStatus(status?: string | null) {
  const normalized = normalizeIssueKey(status).toLowerCase()
  return normalized !== 'closed'
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
    if (!isActiveIssueStatus(issue.status)) return false
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
