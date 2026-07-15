import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listDurationRuntimeConsumerObservationFacadeRegistrations,
} from './durationRuntimeConsumerObservationAdapterService.js'
import type {
  DurationRuntimeConsumerObservedAssetKey,
} from './durationRuntimeConsumerObservationIntegrationService.js'

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
  requiredAssetKeys?: DurationRuntimeConsumerObservedAssetKey[]
  missingAssetKeys?: DurationRuntimeConsumerObservedAssetKey[]
}

export interface DurationRuntimeConsumerObservedBusinessPathIntegration
  extends DurationRuntimeConsumerBusinessPathIntegration {
  evidence: 'facade_call_in_declared_runtime_entry_source'
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
    runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
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
    runtimeEntryRef: 'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
  },
  {
    consumerKey: 'wbsTemplateGenerationService',
    sourcePath: 'server/src/services/wbsTemplateGenerationService.ts',
    facadeFunctionName: 'recordWbsTemplateGenerationConsumedArtifacts',
    runtimeEntryRef: 'wbsTemplateGenerationService:generateWbsTemplateRows',
  },
  {
    consumerKey: 'scheduleAccelerationService',
    sourcePath: 'server/src/services/scheduleAccelerationService.ts',
    facadeFunctionName: 'recordScheduleAccelerationConsumedArtifacts',
    runtimeEntryRef: 'scheduleAccelerationService:evaluateRuntimeDelayRecoveryWithCriticalPath',
  },
  {
    consumerKey: 'scheduleAccelerationRuntimeService',
    sourcePath: 'server/src/services/scheduleAccelerationRuntimeService.ts',
    facadeFunctionName: 'recordScheduleAccelerationRuntimeConsumedArtifacts',
    runtimeEntryRef: 'scheduleAccelerationRuntimeService:evaluateRuntimeScheduleAcceleration',
  },
]

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

function normalizePath(value: string) {
  return value.replace(/\\/g, '/')
}

function sourcePathMatches(actualPath: string, expectedPath: string) {
  return normalizePath(actualPath).endsWith(normalizePath(expectedPath))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function runtimeEntryFunctionName(runtimeEntryRef: string) {
  return runtimeEntryRef.split(':')[1]?.trim() ?? ''
}

function stripCommentsAndStringLiterals(sourceText: string) {
  return sourceText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n\r]*/g, '')
    .replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, '')
}

function stripComments(sourceText: string) {
  return sourceText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n\r]*/g, '')
}

interface NamedNestedFunctionLikeRange {
  name: string
  start: number
  end: number
  sourceText: string
}

function findMatchingBrace(sourceText: string, openBraceIndex: number) {
  let depth = 0
  for (let index = openBraceIndex; index < sourceText.length; index += 1) {
    const char = sourceText[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function collectNamedNestedFunctionLikeRanges(
  runtimeEntryBody: string,
  runtimeEntryRef: string,
) {
  const entryFunctionName = runtimeEntryFunctionName(runtimeEntryRef)
  const ranges: NamedNestedFunctionLikeRange[] = []
  const patterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b[^{]*\{/g,
  ]

  for (const pattern of patterns) {
    for (const match of runtimeEntryBody.matchAll(pattern)) {
      const name = match[1]?.trim()
      if (!name || name === entryFunctionName) continue
      const start = match.index ?? -1
      const openBraceIndex = runtimeEntryBody.indexOf('{', start + match[0].length - 1)
      const end = openBraceIndex >= 0 ? findMatchingBrace(runtimeEntryBody, openBraceIndex) : -1
      if (start < 0 || end < 0) continue
      ranges.push({
        name,
        start,
        end,
        sourceText: runtimeEntryBody.slice(start, end + 1),
      })
    }
  }

  return ranges.sort((left, right) => left.start - right.start)
}

function maskRanges(sourceText: string, ranges: readonly NamedNestedFunctionLikeRange[]) {
  const chars = sourceText.split('')
  for (const range of ranges) {
    for (let index = range.start; index <= range.end; index += 1) {
      chars[index] = ' '
    }
  }
  return chars.join('')
}

function findRuntimeEntryBody(sourceText: string, runtimeEntryRef: string) {
  const entryFunctionName = runtimeEntryFunctionName(runtimeEntryRef)
  if (!entryFunctionName) return ''

  const escapedFunctionName = escapeRegExp(entryFunctionName)
  const patterns = [
    new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${escapedFunctionName}\\b`),
    new RegExp(`\\b(?:export\\s+)?(?:const|let|var)\\s+${escapedFunctionName}\\s*=`),
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(sourceText)
    if (!match) continue
    const nextExportPattern = /\n\s*export\s+(?:async\s+)?(?:function|const|let|var)\s+[A-Za-z_$][\w$]*/g
    nextExportPattern.lastIndex = match.index + match[0].length
    const nextExportMatch = nextExportPattern.exec(sourceText)
    return sourceText.slice(match.index, nextExportMatch?.index ?? sourceText.length)
  }
  return ''
}

function hasFacadeCallInRuntimeEntry(
  sourceText: string,
  facadeFunctionName: string,
  runtimeEntryRef: string,
) {
  const callPattern = new RegExp(`\\b${escapeRegExp(facadeFunctionName)}\\s*\\(`)
  const executableSourceText = stripCommentsAndStringLiterals(sourceText)
  const runtimeEntryBody = findRuntimeEntryBody(executableSourceText, runtimeEntryRef)
  const nestedFunctionLikeRanges = collectNamedNestedFunctionLikeRanges(runtimeEntryBody, runtimeEntryRef)
  const runtimeEntryBodyWithoutNestedHelpers = maskRanges(runtimeEntryBody, nestedFunctionLikeRanges)
  const directFacadeCall = callPattern.test(runtimeEntryBodyWithoutNestedHelpers)
  const facadeCallThroughInvokedLocalHelper = nestedFunctionLikeRanges.some((range) => {
    if (!callPattern.test(range.sourceText)) return false
    const helperCallPattern = new RegExp(`\\b${escapeRegExp(range.name)}\\s*\\(`)
    return helperCallPattern.test(runtimeEntryBodyWithoutNestedHelpers)
  })
  return sourceText.includes(facadeFunctionName)
    && sourceText.includes('durationRuntimeConsumerObservationAdapterService')
    && (directFacadeCall || facadeCallThroughInvokedLocalHelper)
}

function assetKeysRequiredByConsumerKey() {
  return new Map(
    listDurationRuntimeConsumerObservationFacadeRegistrations()
      .map((registration) => [registration.consumerKey, [...registration.assetKeys]]),
  )
}

const SOURCE_ALIASES_BY_ASSET_KEY: Partial<Record<DurationRuntimeConsumerObservedAssetKey, string[]>> = {
  construction_organization_plan_network: ['CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY'],
}

function missingRequiredAssetKeysForSource(
  sourceText: string,
  requiredAssetKeys: readonly DurationRuntimeConsumerObservedAssetKey[],
) {
  const executableSourceText = stripComments(sourceText)
  return requiredAssetKeys.filter((assetKey) => {
    const aliases = SOURCE_ALIASES_BY_ASSET_KEY[assetKey] ?? []
    return ![assetKey, ...aliases].some((token) => executableSourceText.includes(token))
  })
}

function missingIntegrationForSource(
  required: DurationRuntimeConsumerBusinessPathIntegration,
  sourceFiles: readonly DurationRuntimeConsumerBusinessPathSourceFile[] | undefined,
) {
  const matchingSource = (sourceFiles ?? []).find((source) =>
    sourcePathMatches(source.sourcePath, required.sourcePath))
  const missingAssetKeys = matchingSource
    ? missingRequiredAssetKeysForSource(matchingSource.sourceText, required.requiredAssetKeys ?? [])
    : []
  return missingAssetKeys.length > 0
    ? { ...required, missingAssetKeys }
    : required
}

export function listDurationRuntimeConsumerBusinessPathRequiredIntegrations():
  DurationRuntimeConsumerBusinessPathIntegration[] {
  const requiredAssetKeysByConsumerKey = assetKeysRequiredByConsumerKey()
  return REQUIRED_BUSINESS_PATH_INTEGRATIONS.map((item) => ({
    ...item,
    requiredAssetKeys: [...(requiredAssetKeysByConsumerKey.get(item.consumerKey) ?? [])],
  }))
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
    const requiredAssetKeys = required.requiredAssetKeys ?? []
    const missingAssetKeys = missingRequiredAssetKeysForSource(matchingSource.sourceText, requiredAssetKeys)
    if (missingAssetKeys.length > 0) {
      continue
    }
    if (!hasFacadeCallInRuntimeEntry(
      matchingSource.sourceText,
      required.facadeFunctionName,
      required.runtimeEntryRef,
    )) continue
    observedIntegrations.push({
      ...required,
      evidence: 'facade_call_in_declared_runtime_entry_source',
    })
  }

  const observedConsumerKeys = new Set(observedIntegrations.map((item) => item.consumerKey))
  const missingIntegrations = requiredIntegrations.filter((required) =>
    !observedConsumerKeys.has(required.consumerKey))
    .map((required) => missingIntegrationForSource(required, input.sourceFiles))

  return {
    status: missingIntegrations.length === 0
      ? 'runtime_consumer_business_path_integration_ready'
      : 'runtime_consumer_business_path_integration_not_ready',
    requiredIntegrations,
    observedIntegrations,
    missingIntegrations,
  }
}
