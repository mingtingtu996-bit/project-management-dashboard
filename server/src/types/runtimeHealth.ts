export type ProjectHealthRefreshFailure = {
  projectId: string
  trigger: string
  attempts: number
  failedAt: string
  error: string
}

export type ProjectHealthRefreshQueueStatus = {
  healthy: boolean
  activeProjectId: string | null
  queuedProjectCount: number
  failedProjectCount: number
  lastFailure: ProjectHealthRefreshFailure | null
}
