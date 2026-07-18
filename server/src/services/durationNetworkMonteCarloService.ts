import {
  calculateCriticalPathDurationNetwork,
  type CriticalPathDurationNetworkDependency,
} from './projectCriticalPathService.js'

export interface DurationNetworkProbabilityTask {
  id: string
  p20Days: number | null
  p50Days: number | null
  p80Days: number | null
  releaseOffsetDays?: number | null
}

export interface DurationNetworkProbabilityInput {
  seed: string
  tasks: readonly DurationNetworkProbabilityTask[]
  dependencies: readonly CriticalPathDurationNetworkDependency[]
  simulationCount?: number
  scenarioCorrelation?: number
}

export interface DurationNetworkProbabilityResult {
  probabilityBasis: 'monte_carlo' | 'pert_analytic'
  simulationCount: number
  scenarioCorrelation: number
  taskCount: number
  dependencyCount: number
  p20DurationDays: number | null
  p50DurationDays: number | null
  p80DurationDays: number | null
  inputHash: string
  fallbackReasons: string[]
}

const DEFAULT_SIMULATION_COUNT = 1000
const DEFAULT_SCENARIO_CORRELATION = 0.35
const LOG_NORMAL_Z80 = 0.8416212335729143
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_ENTRIES = 128

const cache = new Map<string, { expiresAt: number; result: DurationNetworkProbabilityResult }>()

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeSimulationCount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? Math.round(clamp(parsed, 100, 5000))
    : DEFAULT_SIMULATION_COUNT
}

function stableInput(input: DurationNetworkProbabilityInput) {
  return JSON.stringify({
    seed: input.seed,
    simulationCount: normalizeSimulationCount(input.simulationCount),
    scenarioCorrelation: clamp(Number(input.scenarioCorrelation ?? DEFAULT_SCENARIO_CORRELATION), 0, 0.8),
    tasks: [...input.tasks]
      .map((task) => ({
        id: task.id,
        p20Days: task.p20Days,
        p50Days: task.p50Days,
        p80Days: task.p80Days,
        releaseOffsetDays: task.releaseOffsetDays ?? 0,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    dependencies: [...input.dependencies]
      .map((dependency) => ({
        predecessorTaskId: dependency.predecessorTaskId,
        successorTaskId: dependency.successorTaskId,
        dependencyType: dependency.dependencyType ?? 'FS',
        lagDays: dependency.lagDays ?? 0,
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  })
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function normalSampler(random: () => number) {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const value = spare
      spare = null
      return value
    }
    const first = Math.max(Number.EPSILON, random())
    const second = random()
    const magnitude = Math.sqrt(-2 * Math.log(first))
    spare = magnitude * Math.sin(2 * Math.PI * second)
    return magnitude * Math.cos(2 * Math.PI * second)
  }
}

function distribution(task: DurationNetworkProbabilityTask) {
  const p20 = Number(task.p20Days)
  const p50 = Number(task.p50Days)
  const p80 = Number(task.p80Days)
  if (![p20, p50, p80].every((value) => Number.isFinite(value) && value > 0)) return null
  if (p20 > p50 || p50 > p80) return null
  const lowerSigma = p20 < p50 ? Math.log(p50 / p20) / LOG_NORMAL_Z80 : 0
  const upperSigma = p80 > p50 ? Math.log(p80 / p50) / LOG_NORMAL_Z80 : 0
  const sigma = clamp((lowerSigma + upperSigma) / 2, 0, 1.25)
  return {
    median: p50,
    sigma,
    minimum: Math.max(1, Math.floor(p20 * 0.5)),
    maximum: Math.max(1, Math.ceil(p80 * 3)),
  }
}

function percentile(sorted: number[], probability: number) {
  if (sorted.length === 0) return null
  const index = (sorted.length - 1) * probability
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower] ?? null
  const weight = index - lower
  return Math.round((sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight)
}

function fallback(
  input: DurationNetworkProbabilityInput,
  inputHash: string,
  reasons: string[],
): DurationNetworkProbabilityResult {
  return {
    probabilityBasis: 'pert_analytic',
    simulationCount: 0,
    scenarioCorrelation: clamp(Number(input.scenarioCorrelation ?? DEFAULT_SCENARIO_CORRELATION), 0, 0.8),
    taskCount: input.tasks.length,
    dependencyCount: input.dependencies.length,
    p20DurationDays: null,
    p50DurationDays: null,
    p80DurationDays: null,
    inputHash,
    fallbackReasons: [...new Set(reasons)],
  }
}

function readCached(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.result
}

function writeCache(key: string, result: DurationNetworkProbabilityResult) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result })
}

export function simulateDurationNetworkProbability(
  input: DurationNetworkProbabilityInput,
): DurationNetworkProbabilityResult {
  const serialized = stableInput(input)
  const inputHash = hashString(serialized)
  const cached = readCached(serialized)
  if (cached) return cached

  if (input.tasks.length < 2) {
    return fallback(input, inputHash, ['insufficient_network_task_count'])
  }
  const taskIds = new Set(input.tasks.map((task) => task.id))
  if (taskIds.size !== input.tasks.length || taskIds.has('')) {
    return fallback(input, inputHash, ['invalid_or_duplicate_task_id'])
  }
  if (input.dependencies.some((dependency) => (
    !taskIds.has(dependency.predecessorTaskId)
      || !taskIds.has(dependency.successorTaskId)
      || dependency.predecessorTaskId === dependency.successorTaskId
  ))) {
    return fallback(input, inputHash, ['dependency_endpoint_missing_or_self_referencing'])
  }
  const distributions = input.tasks.map((task) => ({ task, distribution: distribution(task) }))
  if (distributions.some((item) => item.distribution === null)) {
    return fallback(input, inputHash, ['incomplete_task_probability_distribution'])
  }
  if (input.dependencies.length === 0) {
    return fallback(input, inputHash, ['dependency_network_missing'])
  }

  const simulationCount = normalizeSimulationCount(input.simulationCount)
  const scenarioCorrelation = clamp(
    Number(input.scenarioCorrelation ?? DEFAULT_SCENARIO_CORRELATION),
    0,
    0.8,
  )
  const seedNumber = Number.parseInt(hashString(`${input.seed}:${inputHash}`), 16) >>> 0
  const normal = normalSampler(mulberry32(seedNumber))
  const scenarioWeight = Math.sqrt(scenarioCorrelation)
  const taskWeight = Math.sqrt(1 - scenarioCorrelation)
  const projectDurations: number[] = []

  try {
    for (let iteration = 0; iteration < simulationCount; iteration += 1) {
      const scenarioZ = normal()
      const tasks = distributions.map(({ task, distribution: fitted }) => {
        const value = fitted!
        const combinedZ = scenarioWeight * scenarioZ + taskWeight * normal()
        const sampled = value.sigma === 0
          ? value.median
          : Math.exp(Math.log(value.median) + value.sigma * combinedZ)
        return {
          id: task.id,
          durationDays: Math.round(clamp(sampled, value.minimum, value.maximum)),
          releaseOffsetDays: task.releaseOffsetDays ?? 0,
        }
      })
      projectDurations.push(calculateCriticalPathDurationNetwork({
        tasks,
        dependencies: input.dependencies,
      }).projectDurationDays)
    }
  } catch {
    return fallback(input, inputHash, ['network_cpm_failed'])
  }

  projectDurations.sort((left, right) => left - right)
  const result: DurationNetworkProbabilityResult = {
    probabilityBasis: 'monte_carlo',
    simulationCount,
    scenarioCorrelation,
    taskCount: input.tasks.length,
    dependencyCount: input.dependencies.length,
    p20DurationDays: percentile(projectDurations, 0.2),
    p50DurationDays: percentile(projectDurations, 0.5),
    p80DurationDays: percentile(projectDurations, 0.8),
    inputHash,
    fallbackReasons: [],
  }
  writeCache(serialized, result)
  return result
}
