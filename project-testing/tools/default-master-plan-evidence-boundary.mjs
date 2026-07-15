import { realProductionOutcomeQualityBlockers } from './default-master-plan-real-outcome-evidence.mjs'

export const STAGING_CONTROLLED_REPLAY_BLOCKER = 'staging_controlled_replay_not_production_ready'
export const REAL_PRODUCTION_OUTCOME_REQUIRED_BLOCKER = 'real_production_or_live_outcome_evidence_required'
export const NON_PRODUCTION_ENVIRONMENT_BLOCKER = 'staging_or_non_production_environment_not_production_ready'

const PRODUCTION_READY_ENVIRONMENTS = new Set(['production', 'live'])
const ENVIRONMENT_KEYS = new Set([
  'environment',
  'targetenvironment',
  'target_environment',
  'runtimeenvironment',
  'runtime_environment',
  'releaseenvironment',
  'release_environment',
])
const REAL_OUTCOME_KEYS = new Set([
  'realproductionoutcomeevidence',
  'real_production_outcome_evidence',
  'realliveoutcomeevidence',
  'real_live_outcome_evidence',
  'productionoutcomeevidence',
  'production_outcome_evidence',
  'liveoutcomeevidence',
  'live_outcome_evidence',
])
const CONTROLLED_REPLAY_STRING_MARKERS = [
  'staging controlled replay',
  'staging controlled db/api',
  'not a production user acceptance result',
  'not real production project completion evidence',
  'default_master_plan_staging_runtime_writer',
  'default master-plan staging',
  'default-master-plan staging',
  'default_master_plan_staging_rollback_drill',
  'staging_writer_replays',
  'default-master-plan-staging-network',
  'staging-runtime',
]
const CONTROLLED_REPLAY_CONTRACT_KEYS = new Set([
  'rejectedmarkers',
  'rejected_markers',
  'rejectedsamplemarkers',
  'rejected_sample_markers',
])

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function markerRecord(path, marker, value) {
  return {
    path,
    marker,
    value: String(value ?? '').slice(0, 240),
  }
}

function normalizedKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeEnvironment(value) {
  return String(value ?? '').trim().toLowerCase()
}

function looksLikeEvidenceRef(value) {
  const text = String(value ?? '').trim()
  return Boolean(text) && (
    text.includes('#sha256=')
    || text.endsWith('.json')
    || text.endsWith('.md')
    || text.startsWith('project-testing/')
  )
}

function readRealOutcomeEnvironment(record) {
  return normalizeEnvironment(
    record.environment
      ?? record.targetEnvironment
      ?? record.target_environment
      ?? record.runtimeEnvironment
      ?? record.runtime_environment
      ?? record.releaseEnvironment
      ?? record.release_environment,
  )
}

function isValidRealOutcomeEvidence(record) {
  const blockers = realProductionOutcomeQualityBlockers(record)
  const evidenceRef = record.evidenceRef
    ?? record.evidence_ref
    ?? record.sourceEvidenceRef
    ?? record.source_evidence_ref
    ?? record.ref
  return blockers.length === 0 && looksLikeEvidenceRef(evidenceRef)
}

function collectEvidenceMarkers(value, options = {}) {
  const maxMarkers = Number.isFinite(Number(options.maxMarkers)) ? Number(options.maxMarkers) : 25
  const nonProductionEnvironmentMarkers = []
  const realOutcomeMarkers = []
  const seen = new WeakSet()

  function visit(current, currentPath, currentKey = '') {
    if (nonProductionEnvironmentMarkers.length >= maxMarkers && realOutcomeMarkers.length >= maxMarkers) return
    if (current === null || current === undefined) return

    if (typeof current !== 'object') {
      if (ENVIRONMENT_KEYS.has(normalizedKey(currentKey))) {
        const environment = normalizeEnvironment(current)
        if (environment && !PRODUCTION_READY_ENVIRONMENTS.has(environment)) {
          nonProductionEnvironmentMarkers.push(markerRecord(currentPath, 'nonProductionEnvironment', current))
        }
      }
      return
    }

    if (seen.has(current)) return
    seen.add(current)

    if (REAL_OUTCOME_KEYS.has(normalizedKey(currentKey))) {
      const record = readObject(current)
      if (isValidRealOutcomeEvidence(record)) {
        realOutcomeMarkers.push(markerRecord(currentPath, 'realProductionOutcomeEvidence', record.evidenceRef ?? record.evidence_ref ?? record.sourceEvidenceRef ?? record.ref))
      }
    }

    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        visit(current[index], `${currentPath}[${index}]`, currentKey)
        if (nonProductionEnvironmentMarkers.length >= maxMarkers && realOutcomeMarkers.length >= maxMarkers) return
      }
      return
    }

    const object = readObject(current)
    for (const [key, entryValue] of Object.entries(object)) {
      visit(entryValue, `${currentPath}.${key}`, key)
      if (nonProductionEnvironmentMarkers.length >= maxMarkers && realOutcomeMarkers.length >= maxMarkers) return
    }
  }

  visit(value, options.path || 'root')
  return {
    nonProductionEnvironmentMarkers,
    realOutcomeMarkers,
  }
}

function uniqueMarkerList(markers) {
  const uniqueMarkers = []
  const seen = new Set()
  for (const marker of markers) {
    const key = `${marker.path}:${marker.marker}:${marker.value}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueMarkers.push(marker)
  }
  return uniqueMarkers
}

export function collectControlledReplayMarkers(value, options = {}) {
  const maxMarkers = Number.isFinite(Number(options.maxMarkers)) ? Number(options.maxMarkers) : 25
  const markers = []
  const seen = new WeakSet()

  function visit(current, currentPath, currentKey = '') {
    if (markers.length >= maxMarkers) return
    if (current === null || current === undefined) return
    if (CONTROLLED_REPLAY_CONTRACT_KEYS.has(normalizedKey(currentKey))) return

    if (typeof current === 'string') {
      const normalized = current.toLowerCase()
      const matchedMarker = CONTROLLED_REPLAY_STRING_MARKERS.find((marker) => normalized.includes(marker))
      if (matchedMarker) markers.push(markerRecord(currentPath, matchedMarker, current))
      return
    }

    if (typeof current !== 'object') return
    if (seen.has(current)) return
    seen.add(current)

    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        visit(current[index], `${currentPath}[${index}]`, currentKey)
        if (markers.length >= maxMarkers) return
      }
      return
    }

    const object = readObject(current)
    for (const [key, entryValue] of Object.entries(object)) {
      const nextPath = `${currentPath}.${key}`
      const normalizedKey = key.toLowerCase()
      if (
        (normalizedKey === 'stagingcontrolledreplay' || normalizedKey === 'staging_controlled_replay')
        && entryValue === true
      ) {
        markers.push(markerRecord(nextPath, 'stagingControlledReplay', entryValue))
        if (markers.length >= maxMarkers) return
      }
      visit(entryValue, nextPath, key)
      if (markers.length >= maxMarkers) return
    }
  }

  visit(value, options.path || 'root')
  return markers
}

export function buildProductionReadinessQualification(payloads) {
  const allMarkers = []
  const allNonProductionEnvironmentMarkers = []
  const allRealOutcomeMarkers = []
  for (const payload of payloads) {
    if (!payload) continue
    const label = typeof payload.label === 'string' && payload.label.trim()
      ? payload.label.trim()
      : 'payload'
    allMarkers.push(...collectControlledReplayMarkers(payload.value, { path: label }))
    const evidenceMarkers = collectEvidenceMarkers(payload.value, { path: label })
    allNonProductionEnvironmentMarkers.push(...evidenceMarkers.nonProductionEnvironmentMarkers)
    allRealOutcomeMarkers.push(...evidenceMarkers.realOutcomeMarkers)
  }

  const uniqueMarkers = uniqueMarkerList(allMarkers)
  const uniqueNonProductionEnvironmentMarkers = uniqueMarkerList(allNonProductionEnvironmentMarkers)
  const uniqueRealOutcomeMarkers = uniqueMarkerList(allRealOutcomeMarkers)

  const blockers = [
    uniqueMarkers.length > 0 ? STAGING_CONTROLLED_REPLAY_BLOCKER : null,
    uniqueNonProductionEnvironmentMarkers.length > 0 ? NON_PRODUCTION_ENVIRONMENT_BLOCKER : null,
    uniqueRealOutcomeMarkers.length === 0 ? REAL_PRODUCTION_OUTCOME_REQUIRED_BLOCKER : null,
  ].filter(Boolean)

  return {
    status: blockers.length > 0 ? 'production_evidence_blocked' : 'production_evidence_chain',
    productionReadyAllowed: blockers.length === 0,
    blockers,
    controlledReplayMarkerCount: uniqueMarkers.length,
    controlledReplayMarkers: uniqueMarkers,
    nonProductionEnvironmentMarkerCount: uniqueNonProductionEnvironmentMarkers.length,
    nonProductionEnvironmentMarkers: uniqueNonProductionEnvironmentMarkers,
    realOutcomeMarkerCount: uniqueRealOutcomeMarkers.length,
    realOutcomeMarkers: uniqueRealOutcomeMarkers,
  }
}
