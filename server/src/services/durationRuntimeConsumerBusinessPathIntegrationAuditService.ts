import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface DurationRuntimeConsumerBusinessPathSourceFile {
  sourcePath: string
  sourceText: string
}

export type DurationRuntimeConsumerBusinessPathReadFile = (filePath: string) => Promise<string>

export interface LoadDurationRuntimeConsumerBusinessPathSourceFilesInput {
  repoRoot?: string
  readFileText?: DurationRuntimeConsumerBusinessPathReadFile
}

export interface DurationRuntimeConsumerBusinessPathIntegration {
  consumerKey: string
  sourcePath: string
  facadeFunctionName: string
  runtimeEntryRef: string
}

export interface DurationRuntimeConsumerObservedBusinessPathIntegration
  extends DurationRuntimeConsumerBusinessPathIntegration {
  evidence: 'facade_call_in_business_source'
}

export interface DurationRuntimeConsumerBusinessPathIntegrationCoverageInput {
  sourceFiles?: readonly DurationRuntimeConsumerBusinessPathSourceFile[]
}

export interface DurationRuntimeConsumerBusinessPathIntegrationCoverage {
  status:
    | 'runtime_consumer_business_path_integration_ready'
    | 'runtime_consumer_business_path_integration_not_ready'
  requiredIntegrations: DurationRuntimeConsumerBusinessPathIntegration[]
  observedIntegrations: DurationRuntimeConsumerObservedBusinessPathIntegration[]
  missingIntegrations: DurationRuntimeConsumerBusinessPathIntegration[]
}

const REQUIRED_BUSINESS_PATH_INTEGRATIONS: DurationRuntimeConsumerBusinessPathIntegration[] = [
  {
    consumerKey: 'durationSuggestionService',
    sourcePath: 'server/src/services/durationSuggestionService.ts',
    facadeFunctionName: 'recordDurationSuggestionConsumedArtifacts',
    runtimeEntryRef: 'durationSuggestionService:suggestDuration',
  },
  {
    consumerKey: 'taskDurationForecastService',
    sourcePath: 'server/src/services/taskDurationForecastService.ts',
    facadeFunctionName: 'recordTaskDurationForecastConsumedArtifacts',
    runtimeEntryRef: 'taskDurationForecastService:forecastTaskDuration',
  },
  {
    consumerKey: 'projectRemainingDurationForecastService',
    sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
    facadeFunctionName: 'recordProjectRemainingDurationForecastConsumedArtifacts',
    runtimeEntryRef: 'projectRemainingDurationForecastService:forecastRemainingDuration',
  },
  {
    consumerKey: 'wbsTemplateGenerationService',
    sourcePath: 'server/src/services/wbsTemplateGenerationService.ts',
    facadeFunctionName: 'recordWbsTemplateGenerationConsumedArtifacts',
    runtimeEntryRef: 'wbsTemplateGenerationService:generateTemplate',
  },
  {
    consumerKey: 'scheduleAccelerationService',
    sourcePath: 'server/src/services/scheduleAccelerationService.ts',
    facadeFunctionName: 'recordScheduleAccelerationConsumedArtifacts',
    runtimeEntryRef: 'scheduleAccelerationService:buildAccelerationPlan',
  },
  {
    consumerKey: 'scheduleAccelerationRuntimeService',
    sourcePath: 'server/src/services/scheduleAccelerationRuntimeService.ts',
    facadeFunctionName: 'recordScheduleAccelerationRuntimeConsumedArtifacts',
    runtimeEntryRef: 'scheduleAccelerationRuntimeService:applyRuntimeAcceleration',
  },
]

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

function normalizePath(value: string) {
  return value.replace(/\\/g, '/')
}

function sourcePathMatches(actualPath: string, expectedPath: string) {
  return normalizePath(actualPath).endsWith(normalizePath(expectedPath))
}

function hasFacadeCall(sourceText: string, facadeFunctionName: string) {
  return sourceText.includes(facadeFunctionName)
    && sourceText.includes('durationRuntimeConsumerObservationAdapterService')
}

export function listDurationRuntimeConsumerBusinessPathRequiredIntegrations():
  DurationRuntimeConsumerBusinessPathIntegration[] {
  return REQUIRED_BUSINESS_PATH_INTEGRATIONS.map((item) => ({ ...item }))
}

export async function loadDurationRuntimeConsumerBusinessPathSourceFiles(
  input: LoadDurationRuntimeConsumerBusinessPathSourceFilesInput = {},
): Promise<DurationRuntimeConsumerBusinessPathSourceFile[]> {
  const repoRoot = input.repoRoot ?? DEFAULT_REPO_ROOT
  const readFileText = input.readFileText ?? ((filePath: string) => readFile(filePath, 'utf8'))

  return Promise.all(REQUIRED_BUSINESS_PATH_INTEGRATIONS.map(async (required) => {
    const sourcePath = required.sourcePath
    const sourceText = await readFileText(resolve(repoRoot, sourcePath)).catch(() => '')
    return { sourcePath, sourceText }
  }))
}

export function evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage(
  input: DurationRuntimeConsumerBusinessPathIntegrationCoverageInput = {},
): DurationRuntimeConsumerBusinessPathIntegrationCoverage {
  const requiredIntegrations = listDurationRuntimeConsumerBusinessPathRequiredIntegrations()
  const observedIntegrations: DurationRuntimeConsumerObservedBusinessPathIntegration[] = []

  for (const required of requiredIntegrations) {
    const matchingSource = (input.sourceFiles ?? []).find((source) =>
      sourcePathMatches(source.sourcePath, required.sourcePath))
    if (!matchingSource) continue
    if (!hasFacadeCall(matchingSource.sourceText, required.facadeFunctionName)) continue
    observedIntegrations.push({
      ...required,
      evidence: 'facade_call_in_business_source',
    })
  }

  const observedConsumerKeys = new Set(observedIntegrations.map((item) => item.consumerKey))
  const missingIntegrations = requiredIntegrations.filter((required) =>
    !observedConsumerKeys.has(required.consumerKey))

  return {
    status: missingIntegrations.length === 0
      ? 'runtime_consumer_business_path_integration_ready'
      : 'runtime_consumer_business_path_integration_not_ready',
    requiredIntegrations,
    observedIntegrations,
    missingIntegrations,
  }
}
