const preMilestoneReadVersions = new Map<string, number>()

function normalizeProjectId(projectId: unknown) {
  return String(projectId ?? '').trim()
}

export function markPreMilestoneProjectChanged(projectId: unknown) {
  const normalizedProjectId = normalizeProjectId(projectId)
  if (!normalizedProjectId) return
  preMilestoneReadVersions.set(normalizedProjectId, Date.now())
}

export function getPreMilestoneProjectReadVersion(projectId: unknown) {
  const normalizedProjectId = normalizeProjectId(projectId)
  if (!normalizedProjectId) return 0
  return preMilestoneReadVersions.get(normalizedProjectId) ?? 0
}
