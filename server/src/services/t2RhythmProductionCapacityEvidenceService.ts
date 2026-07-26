import {
  effectiveConstructionCalendarBasis,
  isAuthoritativeConstructionCalendar,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'

export type T2RhythmProductionCapacity = {
  availableParallelWorkfaces?: number
  availableCrewStreams?: number
  calendarBasis?: 'working_day' | 'calendar_day'
}

export type T2RhythmProductionCapacityEvidence = {
  source: 't2_rhythm_production_capacity_evidence'
  status: 'ready' | 'partial' | 'missing'
  productionCapacity: T2RhythmProductionCapacity
  evidenceRefs: string[]
  missingEvidenceCodes: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

export type T2RhythmProductionCapacityEvidenceInput = {
  resourceSidecar?: Record<string, unknown> | null
  constructionRhythmExpansion?: {
    workfaceCandidateCount?: number | null
    dominantRhythmUnits?: string[]
    candidates?: Array<{
      backendConsumable?: boolean
      workfaceCount?: number | null
      workfaceKeys?: string[]
    }>
  } | null
  constructionCalendar?: ConstructionCalendarContext | null
}

export type T2RhythmProductionCapacityCoverage = {
  source: 't2_rhythm_production_capacity_coverage'
  status: 'capacity_supported' | 'capacity_gap' | 'evidence_incomplete'
  canEnterC1913Phase1Selection: boolean
  requiredParallelWorkfaces: number
  availableParallelWorkfaces: number | null
  requiredCrewStreams: number
  availableCrewStreams: number | null
  calendarBasisRequired: 'working_day'
  calendarBasisAvailable: T2RhythmProductionCapacity['calendarBasis'] | null
  workfaceCoverageRatio: number | null
  crewStreamCoverageRatio: number | null
  peakConcurrentWindowCount: number
  peakConcurrentWindows: string[]
  blockingReasons: string[]
  evidenceRefs: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

export type T2RhythmProductionCapacityCoverageInput = {
  candidatePackage: T2RhythmScheduleCandidatePackage
  productionCapacityEvidence?: T2RhythmProductionCapacityEvidence | null
  productionCapacity?: T2RhythmProductionCapacity | null
}

function readPositiveInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function readResourceSidecarCrewStreams(sidecar?: Record<string, unknown> | null) {
  if (!sidecar) return null
  return readPositiveInteger(sidecar.availableCrewStreams)
    ?? readPositiveInteger(sidecar.available_crew_streams)
    ?? readPositiveInteger(sidecar.crewStreamCount)
    ?? readPositiveInteger(sidecar.crew_stream_count)
    ?? readPositiveInteger(sidecar.recommendedCrewStreams)
    ?? readPositiveInteger(sidecar.recommended_crew_streams)
}

function readResourceSidecarWorkfaces(sidecar?: Record<string, unknown> | null) {
  if (!sidecar) return null
  return readPositiveInteger(sidecar.availableParallelWorkfaces)
    ?? readPositiveInteger(sidecar.available_parallel_workfaces)
    ?? readPositiveInteger(sidecar.parallelWorkfaceCount)
    ?? readPositiveInteger(sidecar.parallel_workface_count)
}

function readExpansionWorkfaces(input: T2RhythmProductionCapacityEvidenceInput['constructionRhythmExpansion']) {
  if (!input) return null
  const backendCandidateWorkfaces = (input.candidates ?? [])
    .filter((candidate) => candidate.backendConsumable !== false)
    .flatMap((candidate) => {
      const keys = readStringArray(candidate.workfaceKeys)
      return keys.length > 0 ? keys : Array.from({ length: readPositiveInteger(candidate.workfaceCount) ?? 0 }, (_, index) => `candidate-${index + 1}`)
    })
  if (backendCandidateWorkfaces.length > 0) return unique(backendCandidateWorkfaces).length
  return readPositiveInteger(input.workfaceCandidateCount)
}

function readCalendarBasis(calendar?: ConstructionCalendarContext | null): T2RhythmProductionCapacity['calendarBasis'] | null {
  if (!calendar) return null
  return isAuthoritativeConstructionCalendar(calendar) ? 'working_day' : 'calendar_day'
}

function buildEvidenceRefs(input: T2RhythmProductionCapacityEvidenceInput) {
  const resourceRefs = readStringArray(input.resourceSidecar?.evidenceRefs ?? input.resourceSidecar?.evidence_refs)
  return unique([
    ...resourceRefs,
    input.constructionRhythmExpansion ? 'construction_rhythm_expansion:workfaces' : '',
    input.constructionCalendar
      ? `construction_calendar:${effectiveConstructionCalendarBasis(input.constructionCalendar)}`
      : '',
  ])
}

function statusFromMissing(missingEvidenceCodes: string[]) {
  if (missingEvidenceCodes.length === 0) return 'ready'
  return missingEvidenceCodes.length >= 3 ? 'missing' : 'partial'
}

function finitePositiveInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function safeRatio(available: number | null, required: number) {
  if (available == null || required <= 0) return null
  return Number((available / required).toFixed(4))
}

function buildPeakConcurrentWindows(candidatePackage: T2RhythmScheduleCandidatePackage) {
  const windows = candidatePackage.packageWindows.filter((window) => window.durationBearing)
  const days = new Set<number>()
  for (const window of windows) {
    for (let day = window.startDay; day <= window.endDay; day += 1) {
      days.add(day)
    }
  }

  let peakWindows: string[] = []
  for (const day of days) {
    const activeWindows = windows
      .filter((window) => window.startDay <= day && window.endDay >= day)
      .map((window) => window.windowCode)
      .sort((left, right) => left.localeCompare(right))
    if (activeWindows.length > peakWindows.length) {
      peakWindows = activeWindows
    }
  }
  return peakWindows
}

export function buildT2RhythmProductionCapacityEvidence(
  input: T2RhythmProductionCapacityEvidenceInput,
): T2RhythmProductionCapacityEvidence {
  const availableParallelWorkfaces = readResourceSidecarWorkfaces(input.resourceSidecar)
    ?? readExpansionWorkfaces(input.constructionRhythmExpansion)
  const availableCrewStreams = readResourceSidecarCrewStreams(input.resourceSidecar)
  const calendarBasis = readCalendarBasis(input.constructionCalendar)
  const missingEvidenceCodes = [
    availableParallelWorkfaces == null ? 'parallel_workface_capacity_missing' : '',
    availableCrewStreams == null ? 'crew_stream_capacity_missing' : '',
    calendarBasis == null ? 'calendar_basis_evidence_missing' : '',
  ].filter(Boolean)

  return {
    source: 't2_rhythm_production_capacity_evidence',
    status: statusFromMissing(missingEvidenceCodes),
    productionCapacity: {
      ...(availableParallelWorkfaces != null ? { availableParallelWorkfaces } : {}),
      ...(availableCrewStreams != null ? { availableCrewStreams } : {}),
      ...(calendarBasis ? { calendarBasis } : {}),
    },
    evidenceRefs: buildEvidenceRefs(input),
    missingEvidenceCodes,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  }
}

export function buildT2RhythmProductionCapacityCoverage(
  input: T2RhythmProductionCapacityCoverageInput,
): T2RhythmProductionCapacityCoverage {
  const capacity = input.productionCapacity
    ?? input.productionCapacityEvidence?.productionCapacity
    ?? null
  const availableParallelWorkfaces = finitePositiveInteger(capacity?.availableParallelWorkfaces)
  const availableCrewStreams = finitePositiveInteger(capacity?.availableCrewStreams)
  const calendarBasisAvailable = capacity?.calendarBasis ?? null
  const requiredFromTemplate = Math.max(0, ...input.candidatePackage.productionFeasibilitySummaries
    .map((summary) => summary.minimumParallelWorkfaces))
  const requiredCrewStreams = Math.max(0, ...input.candidatePackage.productionFeasibilitySummaries
    .map((summary) => summary.recommendedCrewStreams))
  const peakConcurrentWindows = buildPeakConcurrentWindows(input.candidatePackage)
  const requiredParallelWorkfaces = Math.max(requiredFromTemplate, peakConcurrentWindows.length)

  const blockingReasons = [
    !input.productionCapacityEvidence && !input.productionCapacity ? 'production_capacity_evidence_missing' : '',
    input.productionCapacityEvidence && input.productionCapacityEvidence.status !== 'ready'
      ? `production_capacity_evidence_${input.productionCapacityEvidence.status}`
      : '',
    availableParallelWorkfaces == null ? 'parallel_workface_capacity_missing' : '',
    availableCrewStreams == null ? 'crew_stream_capacity_missing' : '',
    calendarBasisAvailable == null ? 'calendar_basis_evidence_missing' : '',
    availableParallelWorkfaces != null && availableParallelWorkfaces < requiredParallelWorkfaces
      ? 'parallel_workface_capacity_below_t2_peak_demand'
      : '',
    availableCrewStreams != null && availableCrewStreams < requiredCrewStreams
      ? 'crew_stream_capacity_below_t2_requirement'
      : '',
    calendarBasisAvailable && calendarBasisAvailable !== 'working_day'
      ? 'calendar_basis_not_working_day'
      : '',
  ].filter(Boolean)
  const status = input.productionCapacityEvidence && input.productionCapacityEvidence.status !== 'ready'
    ? 'evidence_incomplete'
    : blockingReasons.some((reason) => reason.includes('missing') || reason.includes('evidence_'))
      ? 'evidence_incomplete'
      : blockingReasons.length === 0 ? 'capacity_supported' : 'capacity_gap'

  return {
    source: 't2_rhythm_production_capacity_coverage',
    status,
    canEnterC1913Phase1Selection: status === 'capacity_supported',
    requiredParallelWorkfaces,
    availableParallelWorkfaces,
    requiredCrewStreams,
    availableCrewStreams,
    calendarBasisRequired: 'working_day',
    calendarBasisAvailable,
    workfaceCoverageRatio: safeRatio(availableParallelWorkfaces, requiredParallelWorkfaces),
    crewStreamCoverageRatio: safeRatio(availableCrewStreams, requiredCrewStreams),
    peakConcurrentWindowCount: peakConcurrentWindows.length,
    peakConcurrentWindows,
    blockingReasons,
    evidenceRefs: input.productionCapacityEvidence?.evidenceRefs ?? [],
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  }
}
