import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

function readServerFile(...segments: string[]) {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('P3 workflow main chain contracts', () => {
  it('keeps issue protection and pending_manual_close actions on the unified domain policy', () => {
    const policySource = readServerFile('src', 'services', 'workflowDomainPolicy.ts')
    const issuesRouteSource = readServerFile('src', 'routes', 'issues.ts')
    const issueWriteChainSource = readServerFile('src', 'services', 'issueWriteChainService.ts')
    const taskWriteChainSource = readServerFile('src', 'services', 'taskWriteChainService.ts')
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
    expect(taskWriteChainSource).toContain('skipSnapshotWrite: true')
    expect(taskWriteChainSource).toContain('recordTaskProgressSnapshot')
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

  it('keeps delay approval fallback isolated with a formal degraded error contract', () => {
    const delayRequestsSource = readServerFile('src', 'services', 'delayRequests.ts')

    expect(delayRequestsSource).toContain("const DELAY_APPROVED_EVENT = 'delay_approved'")
    expect(delayRequestsSource).toContain("const DELAY_APPROVAL_DEGRADED_MODE = 'fallback_blocked_non_transactional'")
    expect(delayRequestsSource).toContain('DELAY_REQUEST_ATOMIC_CHAIN_UNAVAILABLE')
    expect(delayRequestsSource).not.toContain('runDelayFallback(')
  })
})
