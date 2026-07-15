import {
  getT2DivisionRhythmTemplate,
  type T2RhythmScheduleCandidatePackage,
} from './t2DivisionRhythmTemplateRegistryService.js'
import type { T2RhythmProductionCapacityEvidence } from './t2RhythmProductionCapacityEvidenceService.js'

export type TemplateAssemblyCpmEdge = {
  edgeId: string
  predecessorWindowCode?: string | null
  successorWindowCode?: string | null
  relation: 'FS' | 'SS' | 'FF'
  lagDays: number
  mandatory: boolean
}

export type TemplateAssemblyCompatibilityInput = {
  candidateId: string
  t2RhythmScheduleCandidatePackage?: T2RhythmScheduleCandidatePackage | null
  templateFamilyRequirements?: TemplateAssemblyTemplateFamilyRequirement[]
  constructionOrganization?: {
    scenarioId?: string | null
    assumptions?: string[]
  } | null
  cpmNetwork?: {
    edges?: TemplateAssemblyCpmEdge[]
  } | null
  productionCapacity?: {
    availableParallelWorkfaces?: number | null
    availableCrewStreams?: number | null
    calendarBasis?: 'working_day' | 'calendar_day' | string | null
  } | null
  productionCapacityEvidence?: T2RhythmProductionCapacityEvidence | null
  priorityAdjudication?: {
    selectedTemplateId?: string | null
    selectedBy?: string | null
    priorityRank?: string[]
  } | null
}

export type TemplateAssemblyTemplateFamilyRequirement = {
  family: string
  templateId?: string | null
  compatibilityReceipt?: {
    status?: string | null
    compatibilityStatus?: string | null
    conflictCodes?: string[]
    manualReviewReasons?: string[]
  } | null
}

export type TemplateAssemblyConflict = {
  conflictCode:
    | 't2_candidate_conflict'
    | 'template_family_compatibility_receipt_missing'
    | 'template_family_compatibility_receipt_conflict'
    | 'construction_organization_t2_assumption_conflict'
    | 'production_capacity_evidence_missing'
    | 'production_parallel_workface_insufficient'
    | 'production_crew_stream_insufficient'
    | 'production_calendar_basis_mismatch'
    | 'cpm_edge_unknown_window'
    | 'cpm_edge_invalid_endpoint'
    | 'cpm_topology_cycle'
  source:
    | 't2_division_rhythm_schedule_candidate_package'
    | 'template_family'
    | 'construction_organization'
    | 'production_capacity'
    | 'cpm_network'
  detail: string
  edgeId?: string
  templateId?: string
}

export type TemplateAssemblyCompatibilityResult = {
  candidateId: string
  status: 'compatible_candidate' | 'candidate_conflict'
  canEnterAutomaticSelection: boolean
  canWriteTaskDependencies: boolean
  canWritePlanDates: boolean
  priorityOverrideBlocked: boolean
  conflicts: TemplateAssemblyConflict[]
  templateAssemblyCompatibilityReceipt: TemplateAssemblyCompatibilityReceipt
  explanation: {
    checkedSources: string[]
    t2TemplateIds: string[]
    cpmEdgeCount: number
    constructionOrganizationAssumptions: string[]
    productionCapacityChecked: boolean
    productionCapacityEvidenceStatus: T2RhythmProductionCapacityEvidence['status'] | null
    productionCapacityMissingEvidenceCodes: string[]
  }
}

export type TemplateAssemblyCompatibilityReceipt = {
  candidateId: string
  selectedTemplateSet: {
    t2TemplateIds: string[]
    constructionOrganizationScenarioId: string | null
    cpmEdgeIds: string[]
  }
  priorityAdjudication: {
    selectedTemplateId: string | null
    selectedBy: string | null
    priorityRank: string[]
    assemblyFeasibilityRequired: true
    priorityOverrideBlocked: boolean
  }
  compatibilityStatus: TemplateAssemblyCompatibilityResult['status']
  priorityOverrideBlocked: boolean
  conflictCodes: TemplateAssemblyConflict['conflictCode'][]
  blockedTemplateIds: string[]
  manualReviewReasons: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeCode(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function buildWindowCodeSet(packageInput?: T2RhythmScheduleCandidatePackage | null) {
  return new Set((packageInput?.packageWindows ?? [])
    .map((window) => normalizeText(window.windowCode))
    .filter(Boolean))
}

function findCycle(nodes: Set<string>, edges: Array<{ from: string; to: string }>) {
  const graph = new Map<string, string[]>()
  for (const node of nodes) graph.set(node, [])
  for (const edge of edges) {
    graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge.to])
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true
    if (visited.has(node)) return false
    visiting.add(node)
    for (const next of graph.get(node) ?? []) {
      if (visit(next)) return true
    }
    visiting.delete(node)
    visited.add(node)
    return false
  }

  for (const node of nodes) {
    if (visit(node)) return true
  }
  return false
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildTemplateAssemblyCompatibilityReceipt(input: {
  sourceInput: TemplateAssemblyCompatibilityInput
  status: TemplateAssemblyCompatibilityResult['status']
  priorityOverrideBlocked: boolean
  conflicts: TemplateAssemblyConflict[]
}): TemplateAssemblyCompatibilityReceipt {
  const t2Package = input.sourceInput.t2RhythmScheduleCandidatePackage ?? null
  return {
    candidateId: input.sourceInput.candidateId,
    selectedTemplateSet: {
      t2TemplateIds: t2Package?.selectedTemplateIds ?? [],
      constructionOrganizationScenarioId: input.sourceInput.constructionOrganization?.scenarioId ?? null,
      cpmEdgeIds: (input.sourceInput.cpmNetwork?.edges ?? []).map((edge) => edge.edgeId).filter(Boolean),
    },
    priorityAdjudication: {
      selectedTemplateId: input.sourceInput.priorityAdjudication?.selectedTemplateId ?? null,
      selectedBy: input.sourceInput.priorityAdjudication?.selectedBy ?? null,
      priorityRank: input.sourceInput.priorityAdjudication?.priorityRank ?? [],
      assemblyFeasibilityRequired: true,
      priorityOverrideBlocked: input.priorityOverrideBlocked,
    },
    compatibilityStatus: input.status,
    priorityOverrideBlocked: input.priorityOverrideBlocked,
    conflictCodes: unique(input.conflicts.map((conflict) => conflict.conflictCode)) as TemplateAssemblyConflict['conflictCode'][],
    blockedTemplateIds: unique(input.conflicts.map((conflict) => conflict.templateId ?? '')),
    manualReviewReasons: input.conflicts.map((conflict) => conflict.detail).filter(Boolean),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  }
}

export function checkTemplateAssemblyCompatibility(
  input: TemplateAssemblyCompatibilityInput,
): TemplateAssemblyCompatibilityResult {
  const conflicts: TemplateAssemblyConflict[] = []
  const t2Package = input.t2RhythmScheduleCandidatePackage ?? null
  const templateFamilyRequirements = input.templateFamilyRequirements ?? []

  if (t2Package?.compatibility.status === 'candidate_conflict' || t2Package?.status === 'candidate_conflict') {
    const firstConflict = t2Package.compatibility.conflicts[0]
    conflicts.push({
      conflictCode: 't2_candidate_conflict',
      source: 't2_division_rhythm_schedule_candidate_package',
      templateId: firstConflict?.templateId ?? t2Package.selectedTemplateIds[0],
      detail: firstConflict?.detail ?? 'T2 rhythm candidate package is already marked as candidate_conflict.',
    })
  }

  for (const requirement of templateFamilyRequirements) {
    const family = normalizeText(requirement.family) || 'unknown_template_family'
    const templateId = normalizeText(requirement.templateId) || family
    const receipt = requirement.compatibilityReceipt ?? null
    if (!receipt) {
      conflicts.push({
        conflictCode: 'template_family_compatibility_receipt_missing',
        source: 'template_family',
        templateId,
        detail: `Template family ${family} template ${templateId} has no compatibility receipt and requires manual review before automatic selection.`,
      })
      continue
    }

    const receiptStatus = normalizeCode(receipt.compatibilityStatus ?? receipt.status)
    if (receiptStatus !== 'compatible_candidate' || (receipt.conflictCodes?.length ?? 0) > 0) {
      conflicts.push({
        conflictCode: 'template_family_compatibility_receipt_conflict',
        source: 'template_family',
        templateId,
        detail: receipt.manualReviewReasons?.[0]
          ?? `Template family ${family} template ${templateId} has compatibility status ${receiptStatus || 'unknown'} and cannot enter automatic selection.`,
      })
    }
  }

  const organizationAssumptions = new Set((input.constructionOrganization?.assumptions ?? [])
    .map(normalizeCode)
    .filter(Boolean))
  if (t2Package && organizationAssumptions.size > 0) {
    for (const templateId of t2Package.selectedTemplateIds) {
      const template = getT2DivisionRhythmTemplate(templateId)
      if (!template) continue
      const conflictingAssumption = template.compatibility.incompatibleAssumptions
        .find((assumption) => organizationAssumptions.has(normalizeCode(assumption)))
      if (!conflictingAssumption) continue
      conflicts.push({
        conflictCode: 'construction_organization_t2_assumption_conflict',
        source: 'construction_organization',
        templateId,
        detail: `Construction organization assumption ${conflictingAssumption} conflicts with T2 rhythm template ${template.templateName}.`,
      })
    }
  }

  const productionCapacityEvidence = input.productionCapacityEvidence ?? null
  const missingProductionCapacityEvidenceCodes: string[] = []
  const productionCapacity = input.productionCapacity ?? productionCapacityEvidence?.productionCapacity ?? null
  const t2RequiresProductionCapacityEvidence = Boolean(
    t2Package && t2Package.productionFeasibilitySummaries.length > 0,
  )
  if (t2RequiresProductionCapacityEvidence && !productionCapacity && !productionCapacityEvidence) {
    missingProductionCapacityEvidenceCodes.push('production_capacity_evidence_missing')
    for (const summary of t2Package!.productionFeasibilitySummaries) {
      conflicts.push({
        conflictCode: 'production_capacity_evidence_missing',
        source: 'production_capacity',
        templateId: summary.sourceTemplateId,
        detail: `T2 production capacity evidence is required before automatic selection for template ${summary.sourceTemplateId}.`,
      })
    }
  }
  if (productionCapacityEvidence && productionCapacityEvidence.status !== 'ready') {
    conflicts.push({
      conflictCode: 'production_capacity_evidence_missing',
      source: 'production_capacity',
      detail: `T2 production capacity evidence is ${productionCapacityEvidence.status}; missing evidence: ${productionCapacityEvidence.missingEvidenceCodes.join(', ') || 'unknown'}.`,
    })
  }

  if (t2Package && productionCapacity) {
    const availableParallelWorkfaces = finiteNumber(productionCapacity.availableParallelWorkfaces)
    const availableCrewStreams = finiteNumber(productionCapacity.availableCrewStreams)
    const calendarBasis = normalizeCode(productionCapacity.calendarBasis)

    for (const summary of t2Package.productionFeasibilitySummaries) {
      if (availableParallelWorkfaces != null && availableParallelWorkfaces < summary.minimumParallelWorkfaces) {
        conflicts.push({
          conflictCode: 'production_parallel_workface_insufficient',
          source: 'production_capacity',
          templateId: summary.sourceTemplateId,
          detail: `Available parallel workfaces ${availableParallelWorkfaces} cannot support T2 requirement ${summary.minimumParallelWorkfaces}.`,
        })
      }
      if (availableCrewStreams != null && availableCrewStreams < summary.recommendedCrewStreams) {
        conflicts.push({
          conflictCode: 'production_crew_stream_insufficient',
          source: 'production_capacity',
          templateId: summary.sourceTemplateId,
          detail: `Available crew streams ${availableCrewStreams} cannot support T2 requirement ${summary.recommendedCrewStreams}.`,
        })
      }
      if (calendarBasis && calendarBasis !== normalizeCode(summary.calendarBasis)) {
        conflicts.push({
          conflictCode: 'production_calendar_basis_mismatch',
          source: 'production_capacity',
          templateId: summary.sourceTemplateId,
          detail: `Production calendar basis ${productionCapacity.calendarBasis} does not match T2 requirement ${summary.calendarBasis}.`,
        })
      }
    }
  }

  const windowCodes = buildWindowCodeSet(t2Package)
  const topologyEdges: Array<{ from: string; to: string }> = []
  const cpmEdges = input.cpmNetwork?.edges ?? []
  for (const edge of cpmEdges) {
    const predecessor = normalizeText(edge.predecessorWindowCode)
    const successor = normalizeText(edge.successorWindowCode)
    if (!predecessor || !successor) {
      conflicts.push({
        conflictCode: 'cpm_edge_invalid_endpoint',
        source: 'cpm_network',
        edgeId: edge.edgeId,
        detail: 'CPM edge has an empty predecessor or successor window code.',
      })
      continue
    }
    if (windowCodes.size > 0 && (!windowCodes.has(predecessor) || !windowCodes.has(successor))) {
      conflicts.push({
        conflictCode: 'cpm_edge_unknown_window',
        source: 'cpm_network',
        edgeId: edge.edgeId,
        detail: 'CPM edge references a window code that is not present in the assembled T2 package.',
      })
      continue
    }
    topologyEdges.push({ from: predecessor, to: successor })
  }

  if (topologyEdges.length > 0 && findCycle(windowCodes, topologyEdges)) {
    conflicts.push({
      conflictCode: 'cpm_topology_cycle',
      source: 'cpm_network',
      detail: 'CPM rhythm edges form a cycle and cannot be evaluated by the candidate network.',
    })
  }

  const priorityOverrideBlocked = Boolean(
    input.priorityAdjudication?.selectedTemplateId
    && conflicts.length > 0,
  )
  const status = conflicts.length === 0 ? 'compatible_candidate' : 'candidate_conflict'
  const templateAssemblyCompatibilityReceipt = buildTemplateAssemblyCompatibilityReceipt({
    sourceInput: input,
    status,
    priorityOverrideBlocked,
    conflicts,
  })

  return {
    candidateId: input.candidateId,
    status,
    canEnterAutomaticSelection: conflicts.length === 0,
    canWriteTaskDependencies: false,
    canWritePlanDates: false,
    priorityOverrideBlocked,
    conflicts,
    templateAssemblyCompatibilityReceipt,
    explanation: {
      checkedSources: [
        ...(t2Package ? ['t2_division_rhythm_schedule_candidate_package'] : []),
        ...(templateFamilyRequirements.length > 0 ? ['template_family'] : []),
        ...(productionCapacity || productionCapacityEvidence || missingProductionCapacityEvidenceCodes.length > 0 ? ['production_capacity'] : []),
        ...(cpmEdges.length > 0 ? ['cpm_network'] : []),
      ],
      t2TemplateIds: t2Package?.selectedTemplateIds ?? [],
      cpmEdgeCount: cpmEdges.length,
      constructionOrganizationAssumptions: input.constructionOrganization?.assumptions ?? [],
      productionCapacityChecked: Boolean(productionCapacity || productionCapacityEvidence || missingProductionCapacityEvidenceCodes.length > 0),
      productionCapacityEvidenceStatus: productionCapacityEvidence?.status ?? null,
      productionCapacityMissingEvidenceCodes: unique([
        ...missingProductionCapacityEvidenceCodes,
        ...(productionCapacityEvidence?.missingEvidenceCodes ?? []),
      ]),
    },
  }
}
