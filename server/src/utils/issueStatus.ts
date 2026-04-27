import { normalizeStatus } from './statusHelpers.js'

export type IssueStatusLike = {
  status?: string | null
}

export const RESOLVED_ISSUE_STATUSES = new Set(['resolved', 'closed', '已解决', '已关闭'])

export function isActiveIssue(issue: IssueStatusLike): boolean {
  return !RESOLVED_ISSUE_STATUSES.has(normalizeStatus(issue.status))
}
