import type {
  T2RhythmScheduleCandidateNetwork,
  T2RhythmScheduleCandidateNetworkEdge,
  T2RhythmScheduleCandidateNetworkNode,
} from './t2RhythmScheduleCandidateNetworkService.js'
import type {
  T2RhythmStandardLibraryL5ReleaseGate,
} from './t2RhythmStandardLibraryL5ReleaseGateService.js'

export type T2RhythmScheduleCandidateNetworkNodeEvaluation = {
  nodeId: string
  windowCode: string
  role: string
  earliestStartDay: number
  earliestFinishDay: number
  latestStartDay: number
  latestFinishDay: number
  totalFloatDays: number
  isCritical: boolean
}

export type T2RhythmScheduleCandidateNetworkPhase1Evaluation = {
  source: 't2_rhythm_schedule_candidate_network_phase1_evaluation'
  candidateId: string
  tier: 'T2'
  status: 'phase1_readonly_evaluation_ready' | 'candidate_conflict'
  canEnterC1913Phase1Selection: boolean
  networkSpanDays: number
  topologicalOrder: string[]
  criticalNodeIds: string[]
  criticalWindowCodes: string[]
  nodeEvaluations: T2RhythmScheduleCandidateNetworkNodeEvaluation[]
  selectionReceipts: T2RhythmScheduleCandidateNetwork['selectionReceipts']
  conflictSummary: T2RhythmScheduleCandidateNetwork['conflictSummary']
  templateAssemblyCompatibilityReceipt: T2RhythmScheduleCandidateNetwork['templateAssemblyCompatibilityReceipt']
  scheduleTrustEvidence: T2RhythmScheduleCandidateNetwork['scheduleTrustEvidence'] & {
    topologyEvaluated: boolean
    floatCalculated: boolean
    writesTaskDependencies: false
    writesPlanDates: false
  }
  standardLibraryReadiness: T2RhythmScheduleCandidateNetwork['standardLibraryReadiness']
  phase1PublicationGate: {
    status: 'blocked_pending_release_evidence' | 'canary_handoff_ready_not_published'
    canEnterCanary: boolean
    canPublishRuntimeExperience: false
    canMaterializeTaskDependencies: false
    canWritePlanDates: false
    canAutoPublishRuntimeExperience: false
    l5ReleaseGateStatus: T2RhythmStandardLibraryL5ReleaseGate['status'] | 'missing'
    releasePackage: T2RhythmStandardLibraryL5ReleaseGate['releasePackage'] | null
    releaseBlockers: string[]
  }
  mutationBoundary: T2RhythmScheduleCandidateNetwork['mutationBoundary']
}

export type T2RhythmScheduleCandidateNetworkPhase1EvaluationInput = {
  l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null
}

function byNodeId(nodes: T2RhythmScheduleCandidateNetworkNode[]) {
  return new Map(nodes.map((node) => [node.nodeId, node]))
}

function durationOf(node: T2RhythmScheduleCandidateNetworkNode) {
  return Math.max(1, Math.round(node.durationDays || 1))
}

function buildTopologicalOrder(
  nodes: T2RhythmScheduleCandidateNetworkNode[],
  edges: T2RhythmScheduleCandidateNetworkEdge[],
) {
  const indegree = new Map(nodes.map((node) => [node.nodeId, 0]))
  const outgoing = new Map<string, string[]>()
  for (const node of nodes) outgoing.set(node.nodeId, [])
  for (const edge of edges) {
    if (!indegree.has(edge.predecessorNodeId) || !indegree.has(edge.successorNodeId)) continue
    outgoing.set(edge.predecessorNodeId, [...(outgoing.get(edge.predecessorNodeId) ?? []), edge.successorNodeId])
    indegree.set(edge.successorNodeId, (indegree.get(edge.successorNodeId) ?? 0) + 1)
  }
  const ready = nodes
    .filter((node) => (indegree.get(node.nodeId) ?? 0) === 0)
    .map((node) => node.nodeId)
    .sort()
  const order: string[] = []
  while (ready.length > 0) {
    const nodeId = ready.shift()
    if (!nodeId) break
    order.push(nodeId)
    for (const next of outgoing.get(nodeId) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1
      indegree.set(next, nextDegree)
      if (nextDegree === 0) ready.push(next)
    }
    ready.sort()
  }
  return order
}

function successorStartConstraint(
  edge: T2RhythmScheduleCandidateNetworkEdge,
  predecessorStart: number,
  predecessorFinish: number,
  successor: T2RhythmScheduleCandidateNetworkNode,
) {
  const lag = Math.round(edge.lagDays || 0)
  if (edge.relation === 'SS') return predecessorStart + lag
  if (edge.relation === 'FF') return predecessorFinish + lag - durationOf(successor) + 1
  return predecessorFinish + lag + 1
}

function predecessorLatestFinishConstraint(
  edge: T2RhythmScheduleCandidateNetworkEdge,
  successorStart: number,
  successorFinish: number,
  predecessor: T2RhythmScheduleCandidateNetworkNode,
) {
  const lag = Math.round(edge.lagDays || 0)
  if (edge.relation === 'SS') return successorStart - lag + durationOf(predecessor) - 1
  if (edge.relation === 'FF') return successorFinish - lag
  return successorStart - lag - 1
}

function buildPhase1PublicationGate(
  network: T2RhythmScheduleCandidateNetwork,
  l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null,
): T2RhythmScheduleCandidateNetworkPhase1Evaluation['phase1PublicationGate'] {
  if (l5ReleaseGate?.status === 'l5_canary_handoff_ready') {
    return {
      status: 'canary_handoff_ready_not_published',
      canEnterCanary: true,
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      canWritePlanDates: false,
      canAutoPublishRuntimeExperience: false,
      l5ReleaseGateStatus: l5ReleaseGate.status,
      releasePackage: l5ReleaseGate.releasePackage,
      releaseBlockers: l5ReleaseGate.releaseBlockers,
    }
  }

  return {
    status: 'blocked_pending_release_evidence',
    canEnterCanary: false,
    canPublishRuntimeExperience: false,
    canMaterializeTaskDependencies: false,
    canWritePlanDates: false,
    canAutoPublishRuntimeExperience: false,
    l5ReleaseGateStatus: l5ReleaseGate?.status ?? 'missing',
    releasePackage: l5ReleaseGate?.releasePackage ?? null,
    releaseBlockers: l5ReleaseGate?.releaseBlockers ?? network.standardLibraryReadiness.releaseBlockers,
  }
}

export function evaluateT2RhythmScheduleCandidateNetwork(
  network: T2RhythmScheduleCandidateNetwork,
  input: T2RhythmScheduleCandidateNetworkPhase1EvaluationInput = {},
): T2RhythmScheduleCandidateNetworkPhase1Evaluation {
  const phase1PublicationGate = buildPhase1PublicationGate(network, input.l5ReleaseGate)
  const blocked = !network.canEnterC1913Phase1Selection || network.status !== 'schedulable_network_candidate'
  if (blocked) {
    return {
      source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
      candidateId: network.candidateId,
      tier: 'T2',
      status: 'candidate_conflict',
      canEnterC1913Phase1Selection: false,
      networkSpanDays: 0,
      topologicalOrder: [],
      criticalNodeIds: [],
      criticalWindowCodes: [],
      nodeEvaluations: [],
      selectionReceipts: network.selectionReceipts,
      conflictSummary: network.conflictSummary,
      templateAssemblyCompatibilityReceipt: network.templateAssemblyCompatibilityReceipt,
      scheduleTrustEvidence: {
        ...network.scheduleTrustEvidence,
        topologyEvaluated: false,
        floatCalculated: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      standardLibraryReadiness: network.standardLibraryReadiness,
      phase1PublicationGate,
      mutationBoundary: network.mutationBoundary,
    }
  }

  const nodeById = byNodeId(network.nodes)
  const order = buildTopologicalOrder(network.nodes, network.edges)
  const earliestStart = new Map<string, number>()
  const earliestFinish = new Map<string, number>()
  for (const nodeId of order) {
    const node = nodeById.get(nodeId)
    if (!node) continue
    const incoming = network.edges.filter((edge) => edge.successorNodeId === nodeId)
    const start = Math.max(1, Math.round(node.startDay || 1), ...incoming.map((edge) => {
      const predecessor = nodeById.get(edge.predecessorNodeId)
      if (!predecessor) return 1
      return successorStartConstraint(
        edge,
        earliestStart.get(edge.predecessorNodeId) ?? 1,
        earliestFinish.get(edge.predecessorNodeId) ?? durationOf(predecessor),
        node,
      )
    }))
    earliestStart.set(nodeId, start)
    earliestFinish.set(nodeId, start + durationOf(node) - 1)
  }

  const networkSpanDays = Math.max(0, ...network.nodes.map((node) => earliestFinish.get(node.nodeId) ?? 0))
  const latestFinish = new Map<string, number>()
  const latestStart = new Map<string, number>()
  for (const nodeId of [...order].reverse()) {
    const node = nodeById.get(nodeId)
    if (!node) continue
    const outgoing = network.edges.filter((edge) => edge.predecessorNodeId === nodeId)
    const finish = outgoing.length === 0
      ? networkSpanDays
      : Math.min(...outgoing.map((edge) => {
        const successor = nodeById.get(edge.successorNodeId)
        if (!successor) return networkSpanDays
        return predecessorLatestFinishConstraint(
          edge,
          latestStart.get(edge.successorNodeId) ?? Math.max(1, networkSpanDays - durationOf(successor) + 1),
          latestFinish.get(edge.successorNodeId) ?? networkSpanDays,
          node,
        )
      }))
    latestFinish.set(nodeId, finish)
    latestStart.set(nodeId, finish - durationOf(node) + 1)
  }

  const nodeEvaluations = order.map((nodeId) => {
    const node = nodeById.get(nodeId)
    if (!node) return null
    const totalFloatDays = Math.max(0, (latestStart.get(nodeId) ?? 1) - (earliestStart.get(nodeId) ?? 1))
    return {
      nodeId,
      windowCode: node.windowCode,
      role: node.role,
      earliestStartDay: earliestStart.get(nodeId) ?? 1,
      earliestFinishDay: earliestFinish.get(nodeId) ?? durationOf(node),
      latestStartDay: latestStart.get(nodeId) ?? 1,
      latestFinishDay: latestFinish.get(nodeId) ?? durationOf(node),
      totalFloatDays,
      isCritical: totalFloatDays === 0,
    }
  }).filter((value): value is T2RhythmScheduleCandidateNetworkNodeEvaluation => value != null)

  const criticalNodeIds = nodeEvaluations
    .filter((node) => node.isCritical)
    .map((node) => node.nodeId)
  const criticalWindowCodes = nodeEvaluations
    .filter((node) => node.isCritical)
    .map((node) => node.windowCode)

  return {
    source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
    candidateId: network.candidateId,
    tier: 'T2',
    status: 'phase1_readonly_evaluation_ready',
    canEnterC1913Phase1Selection: true,
    networkSpanDays,
    topologicalOrder: order,
    criticalNodeIds,
    criticalWindowCodes,
    nodeEvaluations,
    selectionReceipts: network.selectionReceipts,
    conflictSummary: network.conflictSummary,
    templateAssemblyCompatibilityReceipt: network.templateAssemblyCompatibilityReceipt,
    scheduleTrustEvidence: {
      ...network.scheduleTrustEvidence,
      topologyEvaluated: order.length === network.nodes.length,
      floatCalculated: nodeEvaluations.length === network.nodes.length,
      writesTaskDependencies: false,
      writesPlanDates: false,
    },
    standardLibraryReadiness: network.standardLibraryReadiness,
    phase1PublicationGate,
    mutationBoundary: network.mutationBoundary,
  }
}
