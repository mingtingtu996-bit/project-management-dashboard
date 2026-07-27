import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

function readServerFile(...segments: string[]) {
  return readFileSync(serverFilePath(...segments), 'utf8')
}

function serverFilePath(...segments: string[]) {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return resolve(serverRoot, ...segments)
}

describe('P3 workflow main chain contracts', () => {
  it('keeps issue protection and pending_manual_close actions on the unified domain policy', () => {
    const policySource = readServerFile('src', 'domain', 'riskIssueWorkflowPolicy.ts')
    const issuesRouteSource = readServerFile('src', 'routes', 'issues.ts')
    const issueWriteChainSource = readServerFile('src', 'services', 'issueWriteChainService.ts')
    const taskWriteChainSource = readServerFile('src', 'services', 'taskWriteChainService.ts')
    const taskCodeTransactionSource = readServerFile('src', 'services', 'taskCodeTransactionService.ts')
    const preMilestonesRouteSource = readServerFile('src', 'routes', 'pre-milestones.ts')
    const risksRouteSource = readServerFile('src', 'routes', 'risks.ts')

    expect(policySource).toContain("'obstacle_escalated'")
    expect(policySource).toContain("'condition_expired'")
    expect(issuesRouteSource).toContain("router.post('/', requireProjectEditor(")
    expect(issuesRouteSource).toContain("router.put('/:id', validateIdParam, requireProjectEditor(")
    expect(issuesRouteSource).toContain("router.post('/:id/confirm-close'")
    expect(issuesRouteSource).toContain("router.post('/:id/keep-processing'")
    expect(issuesRouteSource).toContain('createIssueInMainChain')
    expect(issuesRouteSource).toContain('updateIssueInMainChain')
    expect(issuesRouteSource).toContain('confirmIssuePendingManualCloseInMainChain')
    expect(issuesRouteSource).toContain('keepIssueProcessingInMainChain')
    expect(issuesRouteSource).toContain('deleteIssueInMainChain')
    expect(issueWriteChainSource).toContain('export async function createIssueInMainChain')
    expect(issueWriteChainSource).toContain('export async function updateIssueInMainChain')
    expect(taskWriteChainSource).toContain('recordTaskProgressSnapshot')
    expect(taskCodeTransactionSource).not.toContain('recordTaskProgressSnapshot')
    expect(taskCodeTransactionSource).not.toContain('createTask as')
    expect(taskCodeTransactionSource).not.toContain('updateTask as')
    expect(taskCodeTransactionSource).not.toContain('reopenTask as')
    expect(preMilestonesRouteSource).toContain('createIssueInMainChain')
    expect(preMilestonesRouteSource).toContain('/:certificateId/escalate-issue')
    expect(preMilestonesRouteSource).toContain('requireProjectEditor((req) => readProjectId(req))')
    expect(preMilestonesRouteSource).toMatch(/router\.post\(\s*'\/'/)
    expect(risksRouteSource).toContain("router.post('/:id/confirm-close'")
    expect(risksRouteSource).toContain("router.post('/:id/keep-processing'")
  })

  it('routes obstacle escalation and source-release handling through upgradeChainService instead of legacy parallel chains', () => {
    const warningServiceSource = readServerFile('src', 'services', 'warningService.ts')
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const jobsSource = readServerFile('src', 'routes', 'jobs.ts')

    expect(warningServiceSource).toContain('ensureObstacleEscalatedIssue')
    expect(warningServiceSource).toContain('markObstacleEscalatedIssuePendingManualClose')
    expect(schedulerSource).not.toContain('autoAlertService')
    expect(jobsSource).not.toContain('autoAlertService')
    expect(jobsSource).not.toContain('notificationService')
    expect(jobsSource).not.toContain('riskDetector')
  })

  it('keeps delay request approval removed from the main workflow chain', () => {
    expect(existsSync(serverFilePath('src', 'routes', 'delay-requests.ts'))).toBe(false)
    expect(existsSync(serverFilePath('src', 'services', 'delayRequests.ts'))).toBe(false)
    expect(existsSync(serverFilePath('src', 'services', 'delayRequestNotificationService.ts'))).toBe(false)
  })
})
