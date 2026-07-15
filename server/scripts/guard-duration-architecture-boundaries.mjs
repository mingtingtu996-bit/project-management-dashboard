import fs from "fs"
import path from "path"

const DEFAULT_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? path.resolve(process.cwd(), "server")
  : process.cwd()

const COMPUTE_LAYER_FILES = new Set([
  "durationContextService.ts",
  "durationContextFactorSynthesisService.ts",
  "durationInputAssemblerService.ts",
  "durationSuggestionService.ts",
  "taskDurationForecastService.ts",
  "projectCriticalPathService.ts",
  "projectRemainingDurationForecastService.ts",
  "scheduleAccelerationService.ts",
])

const RUNTIME_PUBLISHED_ASSET_CONSUMER_FILES = new Set([
  "durationContextService.ts",
  "durationSuggestionService.ts",
  "taskDurationForecastService.ts",
  "durationContextProjectBaselineCalibrationFactorService.ts",
  "durationContextPmRecoveryCompensationFactorService.ts",
  "projectProductivityCompensationService.ts",
])

const FORBIDDEN_RUNTIME_RAW_SAMPLE_IDENTIFIERS = [
  "buildProjectProgressVelocityLearning",
  "loadProjectBaselineCalibrationDurationExperienceSamples",
  "loadPmRecoveryEligibilityDurationExperienceSamples",
  "loadProgressVelocityProjectDurationExperienceSamples",
  "loadProgressVelocityCompanyDurationExperienceSamples",
]

const TIER_REQUIRED_CANDIDATE_FILES = new Set([
  "constructionOrganizationScenarioGovernanceService.ts",
  "standardWorkDurationSeedReplayCandidateBridgeService.ts",
  "t2RhythmReplayLearningCandidateService.ts",
  "t2RhythmTaskWindowAnnotationCandidateEventService.ts",
])

const EXPERIENCE_TIER_ALLOWED_ASSET_TYPES = new Map([
  ["T1", new Set(["process_duration", "dependency_order", "task_lag_rule"])],
  ["T2", new Set(["t2_division_rhythm_template", "division_overlap_model", "subdivision_handover_gate"])],
  ["T3", new Set(["project_efficiency_model", "construction_organization_profile", "s_curve_state_model"])],
])

const TIER_REQUIRED_CANDIDATE_FILE_CONTRACTS = new Map([
  ["constructionOrganizationScenarioGovernanceService.ts", {
    experienceTier: "T3",
    experienceAssetType: "construction_organization_profile",
  }],
  ["standardWorkDurationSeedReplayCandidateBridgeService.ts", {
    experienceTier: "T1",
    experienceAssetType: "process_duration",
  }],
  ["t2RhythmReplayLearningCandidateService.ts", {
    experienceTier: "T2",
    experienceAssetType: "t2_division_rhythm_template",
  }],
  ["t2RhythmTaskWindowAnnotationCandidateEventService.ts", {
    experienceTier: "T2",
    experienceAssetType: "t2_division_rhythm_template",
  }],
])

const WBS_RUNTIME_CONSUMER_FILES = new Set([
  "wbsTemplateGenerationService.ts",
])

const DURATION_INPUT_ASSEMBLER_ENGINE_CONTRACTS = new Map([
  ["durationSuggestionService.ts", {
    engine: "E1",
    requiredMarkers: ["assembleDurationInput", "durationInputAssembly"],
    message: "E1 duration suggestions must preserve the DurationInputAssembler evidence boundary.",
  }],
  ["taskDurationForecastService.ts", {
    engine: "E2",
    requiredMarkers: ["assembleDurationInput", "durationInputAssembly"],
    message: "E2 task remaining forecasts must preserve the DurationInputAssembler evidence boundary.",
  }],
  ["projectCriticalPathService.ts", {
    engine: "E3",
    requiredMarkers: ["assembleDurationInput", "durationInputAssembly"],
    message: "E3 critical-path CPM must preserve the DurationInputAssembler evidence boundary.",
  }],
  ["projectRemainingDurationForecastService.ts", {
    engine: "E4",
    requiredMarkers: ["durationInputAssembly", "project_remaining_duration_forecast_e4_row_evidence"],
    message: "E4 project remaining forecasts must promote E2/E3 DurationInputAssembler evidence.",
  }],
  ["scheduleAccelerationRuntimeService.ts", {
    engine: "E5",
    requiredMarkers: ["assembleDurationInput", "durationInputAssembly"],
    message: "E5 schedule acceleration runtime must preserve the DurationInputAssembler evidence boundary.",
  }],
])

const DIAGNOSTIC_FAST_TEMPLATE_ALLOWED_FILES = new Set([
  "server/src/services/wbsTemplateGenerationService.ts",
  "server/src/services/wbsTemplateGoldenBenchmarkReplayService.ts",
  "server/src/routes/projectWizard.ts",
])

const DIAGNOSTIC_FAST_TEMPLATE_SCAN_ROOTS = [
  "client/src",
  "server/src/routes",
  "server/src/services",
]

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"])
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "coverage", "tmp", "__tests__", "test", "tests"])

const LEGACY_DEBT = [
  {
    type: "closed_c1905_direct_seed_helper_debt",
    fileName: "durationContextService.ts",
    importPath: "../seeds/v1474SeasonalProductivitySeed.js",
    reason: "C-19.05 direct seed helper debt is closed; this import must not reappear.",
  },
  {
    type: "closed_c1905_direct_seed_helper_debt",
    fileName: "durationContextService.ts",
    importPath: "../seeds/durationContributionMode.js",
    reason: "C-19.05 direct seed helper debt is closed; this import must not reappear.",
  },
  {
    type: "closed_c1905_direct_seed_helper_debt",
    fileName: "durationContextService.ts",
    importPath: "../seeds/v1474ProcessConstraintSeed.js",
    reason: "C-19.05 direct seed helper debt is closed; this import must not reappear.",
  },
  {
    type: "closed_c1905_direct_seed_helper_debt",
    fileName: "durationContextService.ts",
    importPath: "../seeds/executionNature.js",
    reason: "C-19.05 direct seed helper debt is closed; this import must not reappear.",
  },
  {
    type: "closed_c1905_direct_seed_helper_debt",
    fileName: "durationContextService.ts",
    importPath: "../seeds/v1474ResourceClassSeed.js",
    reason: "C-19.05 direct seed helper debt is closed; this import must not reappear.",
  },
  {
    type: "closed_c1905_direct_seed_helper_debt",
    fileName: "durationContextService.ts",
    importPath: "../seeds/workEnvironment.js",
    reason: "C-19.05 direct seed helper debt is closed; this import must not reappear.",
  },
  {
    type: "closed_c1905_direct_seed_helper_debt",
    fileName: "scheduleAccelerationService.ts",
    importPath: "../seeds/scheduleAccelerationProfileSeed.js",
    reason: "C-19.05 direct seed helper debt is closed; this import must not reappear.",
  },
]

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function resolveWorkspaceRoot(root) {
  const absoluteRoot = path.resolve(root)
  if (fs.existsSync(path.join(absoluteRoot, "server", "src"))) return absoluteRoot
  if (fs.existsSync(path.join(absoluteRoot, "src"))) return path.resolve(absoluteRoot, "..")
  return absoluteRoot
}

function servicePath(workspaceRoot, fileName) {
  return path.join(workspaceRoot, "server", "src", "services", fileName)
}

function readServiceFile(workspaceRoot, fileName) {
  const filePath = servicePath(workspaceRoot, fileName)
  if (!fs.existsSync(filePath)) return null
  return {
    filePath,
    fileName,
    source: fs.readFileSync(filePath, "utf8"),
  }
}

function toPosix(relativePath) {
  return relativePath.replace(/\\/g, "/")
}

function walkSourceFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return []
  const stat = fs.statSync(rootDir)
  if (stat.isFile()) return SOURCE_EXTENSIONS.has(path.extname(rootDir)) ? [rootDir] : []

  const files = []
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(fullPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx") || entry.name.endsWith(".spec.ts")) continue
    files.push(fullPath)
  }
  return files.sort()
}

function stripBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "")
}

function stripLineComments(source) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const commentIndex = line.indexOf("//")
      return commentIndex === -1 ? line : line.slice(0, commentIndex)
    })
    .join("\n")
}

function stripComments(source) {
  return stripLineComments(stripBlockComments(source))
}

function lineFor(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function extractSeedImports(source) {
  const imports = []
  const cleaned = stripComments(source)
  const pattern = /\bimport\s+(type\s+)?([^'"]+?\s+from\s+)?['"]([^'"]*\/seeds\/[^'"]+)['"]/g
  for (const match of cleaned.matchAll(pattern)) {
    const lineStart = cleaned.lastIndexOf("\n", match.index) + 1
    const lineEnd = cleaned.indexOf("\n", match.index)
    const fullLine = cleaned.slice(lineStart, lineEnd < 0 ? cleaned.length : lineEnd)
    if (fullLine.trim().startsWith("//")) continue
    const statement = match[0]
    imports.push({
      importPath: match[3],
      index: match.index,
      statement,
      isTypeOnly: Boolean(match[1]) || isTypeOnlyNamedImport(statement),
    })
  }
  return imports
}

function isTypeOnlyNamedImport(statement) {
  const match = statement.match(/\bimport\s*\{([\s\S]*?)\}\s*from\b/)
  if (!match) return false
  const specifiers = match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  return specifiers.length > 0 && specifiers.every((item) => item.startsWith("type "))
}

function extractRawDurationSampleReads(source) {
  const reads = []
  const cleaned = stripComments(source)
  const pattern = /from\(\s*['"]duration_experience_samples['"]\s*\)/g
  for (const match of cleaned.matchAll(pattern)) {
    reads.push({ index: match.index, expression: match[0] })
  }
  return reads
}

function extractRuntimeRawSampleBypasses(source) {
  const cleaned = stripComments(source)
  return FORBIDDEN_RUNTIME_RAW_SAMPLE_IDENTIFIERS.flatMap((identifier) => {
    const pattern = new RegExp(`\\b${identifier}\\b`, "g")
    return Array.from(cleaned.matchAll(pattern)).map((match) => ({
      index: match.index,
      identifier,
    }))
  })
}

function extractLiteralCandidatePropertyAssignments(source, propertyName) {
  const assignments = []
  const cleaned = stripComments(source)
  const pattern = new RegExp("\\b" + propertyName + "\\s*:\\s*['\"]([^'\"]+)['\"](?:\\s+as\\s+const)?\\s*,", "g")
  for (const match of cleaned.matchAll(pattern)) {
    assignments.push({
      value: match[1],
      index: match.index,
      expression: match[0],
    })
  }
  return assignments
}

function uniqueValues(assignments) {
  return Array.from(new Set(assignments.map((item) => item.value)))
}

function isLegacyDebt(fileName, violationType, source, importPath = null) {
  return LEGACY_DEBT.some((item) => (
    item.fileName === fileName
    && (
      (violationType === "forbidden_seed_import" && item.type === "closed_c1905_direct_seed_helper_debt")
      || (violationType === "forbidden_raw_duration_sample_read" && item.type === "legacy_l2_raw_duration_sample_read")
    )
    && (
      item.importPath
        ? item.importPath === importPath
        : item.pattern.test(source)
    )
  ))
}

function collectLegacyDebt(workspaceRoot) {
  const legacyDebt = []
  for (const item of LEGACY_DEBT) {
    const file = readServiceFile(workspaceRoot, item.fileName)
    if (!file) continue
    if (item.importPath && !file.source.includes(item.importPath)) continue
    if (item.pattern && !item.pattern.test(file.source)) continue
    legacyDebt.push({
      type: item.type,
      filePath: file.filePath,
      fileName: file.fileName,
      importPath: item.importPath ?? null,
      reason: item.reason,
    })
  }
  return legacyDebt
}

function collectDiagnosticFastTemplateSurfaceViolations(workspaceRoot) {
  const violations = []
  const scannedFiles = []
  const seen = new Set()

  for (const relativeRoot of DIAGNOSTIC_FAST_TEMPLATE_SCAN_ROOTS) {
    const rootDir = path.join(workspaceRoot, relativeRoot)
    for (const filePath of walkSourceFiles(rootDir)) {
      const relativePath = toPosix(path.relative(workspaceRoot, filePath))
      if (seen.has(relativePath)) continue
      seen.add(relativePath)
      scannedFiles.push(filePath)
      if (DIAGNOSTIC_FAST_TEMPLATE_ALLOWED_FILES.has(relativePath)) continue

      const source = fs.readFileSync(filePath, "utf8")
      const cleaned = stripBlockComments(source)
      const lines = cleaned.split(/\r?\n/)
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        if (!line.includes("durationSuggestionMode") && !line.includes("fast_template")) continue
        if (
          /\bdurationSuggestionMode\b/.test(line)
          || /['"]fast_template['"]/.test(line)
          || /\bfast_template\b/.test(line)
        ) {
          violations.push({
            type: "diagnostic_fast_template_product_surface",
            filePath,
            fileName: path.basename(filePath),
            line: index + 1,
            text: line.trim(),
            message: "fast_template is an internal diagnostic WBS estimate mode; product/API/client surfaces must not expose or select it.",
          })
        }
      }
    }
  }

  return { scannedFiles, violations }
}

function collectWbsRuntimeConsumerViolations(workspaceRoot) {
  const violations = []
  const scannedFiles = []

  for (const fileName of WBS_RUNTIME_CONSUMER_FILES) {
    const file = readServiceFile(workspaceRoot, fileName)
    if (!file) continue
    scannedFiles.push(file.filePath)

    for (const item of extractSeedImports(file.source)) {
      if (item.isTypeOnly) continue
      if (!item.importPath.endsWith("/standardWorkDurationSeed.js")) continue
      violations.push({
        type: "forbidden_wbs_standard_duration_seed_runtime_import",
        filePath: file.filePath,
        fileName,
        line: lineFor(file.source, item.index),
        importPath: item.importPath,
        message: "WBS runtime generation must resolve standard duration through algorithmSeedResolver, not import STANDARD_WORK_DURATION_SEED at runtime.",
      })
    }

    for (const item of extractRawDurationSampleReads(file.source)) {
      violations.push({
        type: "forbidden_wbs_raw_duration_sample_read",
        filePath: file.filePath,
        fileName,
        line: lineFor(file.source, item.index),
        expression: item.expression,
        message: "WBS runtime generation must consume governed duration read-models or observations, not read duration_experience_samples directly.",
      })
    }
  }

  return { scannedFiles, violations }
}

function collectDurationInputAssemblerEngineContractViolations(workspaceRoot) {
  const violations = []
  const scannedFiles = []

  for (const [fileName, contract] of DURATION_INPUT_ASSEMBLER_ENGINE_CONTRACTS.entries()) {
    const file = readServiceFile(workspaceRoot, fileName)
    if (!file) continue
    scannedFiles.push(file.filePath)

    const missingMarkers = contract.requiredMarkers.filter((marker) => !file.source.includes(marker))
    if (missingMarkers.length === 0) continue
    violations.push({
      type: "missing_duration_input_assembler_engine_contract",
      filePath: file.filePath,
      fileName,
      line: 1,
      engine: contract.engine,
      missingMarkers,
      message: contract.message,
    })
  }

  return { scannedFiles, violations }
}

export function evaluateDurationArchitectureBoundaryGuard(root = DEFAULT_ROOT) {
  const workspaceRoot = resolveWorkspaceRoot(root)
  const violations = []
  const scannedFiles = []

  for (const fileName of COMPUTE_LAYER_FILES) {
    const file = readServiceFile(workspaceRoot, fileName)
    if (!file) continue
    scannedFiles.push(file.filePath)

    for (const item of extractSeedImports(file.source)) {
      violations.push({
        type: "forbidden_seed_import",
        filePath: file.filePath,
        fileName,
        line: lineFor(file.source, item.index),
        importPath: item.importPath,
        message: "L2-L4 duration compute files must consume registry/read-model services, not seed constants directly.",
      })
    }

    for (const item of extractRawDurationSampleReads(file.source)) {
      violations.push({
        type: "forbidden_raw_duration_sample_read",
        filePath: file.filePath,
        fileName,
        line: lineFor(file.source, item.index),
        expression: item.expression,
        message: "L2-L4 duration compute files must not read duration_experience_samples directly.",
      })
    }
  }

  for (const fileName of RUNTIME_PUBLISHED_ASSET_CONSUMER_FILES) {
    const file = readServiceFile(workspaceRoot, fileName)
    if (!file) continue
    scannedFiles.push(file.filePath)

    for (const item of extractRuntimeRawSampleBypasses(file.source)) {
      violations.push({
        type: "forbidden_runtime_raw_sample_bypass",
        filePath: file.filePath,
        fileName,
        line: lineFor(file.source, item.index),
        identifier: item.identifier,
        message: "Runtime duration consumers must read governed published assets; raw-sample learning is restricted to learning and replay services.",
      })
    }
  }

  for (const fileName of TIER_REQUIRED_CANDIDATE_FILES) {
    const file = readServiceFile(workspaceRoot, fileName)
    if (!file) continue
    scannedFiles.push(file.filePath)
    const tierAssignments = extractLiteralCandidatePropertyAssignments(file.source, "experienceTier")
    const assetTypeAssignments = extractLiteralCandidatePropertyAssignments(file.source, "experienceAssetType")
    const observedTiers = uniqueValues(tierAssignments)
    const observedAssetTypes = uniqueValues(assetTypeAssignments)

    if (tierAssignments.length === 0) {
      violations.push({
        type: "missing_experience_tier_marker",
        filePath: file.filePath,
        fileName,
        line: 1,
        message: "Duration learning candidate producers must stamp experienceTier so C-19.01 can prevent T1/T2/T3 bucket mixing.",
      })
    }
    if (assetTypeAssignments.length === 0) {
      violations.push({
        type: "missing_experience_asset_type_marker",
        filePath: file.filePath,
        fileName,
        line: 1,
        message: "Duration learning candidate producers must stamp experienceAssetType so C-19.01 can apply the tier registry allowed-list.",
      })
    }

    if (observedTiers.length > 0 && observedAssetTypes.length > 0) {
      const invalidPairs = []
      for (const tier of observedTiers) {
        const allowedAssetTypes = EXPERIENCE_TIER_ALLOWED_ASSET_TYPES.get(tier)
        if (!allowedAssetTypes) {
          invalidPairs.push(`${tier}:unknown_tier`)
          continue
        }
        for (const assetType of observedAssetTypes) {
          if (!allowedAssetTypes.has(assetType)) invalidPairs.push(`${tier}:${assetType}`)
        }
      }
      if (invalidPairs.length > 0) {
        violations.push({
          type: "invalid_experience_tier_asset_type_pair",
          filePath: file.filePath,
          fileName,
          line: lineFor(file.source, assetTypeAssignments[0]?.index ?? tierAssignments[0]?.index ?? 0),
          observed: invalidPairs,
          message: "Duration learning candidate producers must use experienceAssetType values allowed by the C-19.01 experience tier registry.",
        })
      }
    }

    const expectedContract = TIER_REQUIRED_CANDIDATE_FILE_CONTRACTS.get(fileName)
    if (
      expectedContract
      && observedTiers.length > 0
      && observedAssetTypes.length > 0
      && (
        !observedTiers.includes(expectedContract.experienceTier)
        || !observedAssetTypes.includes(expectedContract.experienceAssetType)
      )
    ) {
      violations.push({
        type: "unexpected_experience_tier_candidate_contract",
        filePath: file.filePath,
        fileName,
        line: lineFor(file.source, tierAssignments[0]?.index ?? assetTypeAssignments[0]?.index ?? 0),
        expected: expectedContract,
        observed: {
          experienceTiers: observedTiers,
          experienceAssetTypes: observedAssetTypes,
        },
        message: "Duration learning candidate producer drifted from its registered tier/asset contract.",
      })
    }
  }

  const diagnosticSurface = collectDiagnosticFastTemplateSurfaceViolations(workspaceRoot)
  scannedFiles.push(...diagnosticSurface.scannedFiles)
  violations.push(...diagnosticSurface.violations)

  const wbsRuntimeConsumer = collectWbsRuntimeConsumerViolations(workspaceRoot)
  scannedFiles.push(...wbsRuntimeConsumer.scannedFiles)
  violations.push(...wbsRuntimeConsumer.violations)

  const assemblerEngineContracts = collectDurationInputAssemblerEngineContractViolations(workspaceRoot)
  scannedFiles.push(...assemblerEngineContracts.scannedFiles)
  violations.push(...assemblerEngineContracts.violations)

  return {
    workspaceRoot,
    scannedFiles: Array.from(new Set(scannedFiles)).sort(),
    legacyDebt: collectLegacyDebt(workspaceRoot),
    violations,
  }
}

export function formatDurationArchitectureBoundaryGuardFailure(result, cwd = process.cwd()) {
  const lines = ["[duration-architecture-boundary-guard] C-19.09 violations found:"]
  for (const violation of result.violations) {
    lines.push("- " + path.relative(cwd, violation.filePath) + ":" + violation.line + " " + violation.type)
    if (violation.importPath) lines.push("  import: " + violation.importPath)
    if (violation.expression) lines.push("  expression: " + violation.expression)
    if (violation.expected) lines.push("  expected: " + JSON.stringify(violation.expected))
    if (violation.observed) lines.push("  observed: " + JSON.stringify(violation.observed))
    if (violation.missingMarkers) lines.push("  missing markers: " + JSON.stringify(violation.missingMarkers))
    lines.push("  " + violation.message)
  }
  if (result.legacyDebt.length) {
    lines.push("[duration-architecture-boundary-guard] Closed C-19.05 direct seed helper debt reappeared:")
    for (const item of result.legacyDebt) {
      lines.push("- " + path.relative(cwd, item.filePath) + " " + item.type)
      if (item.importPath) lines.push("  import: " + item.importPath)
      lines.push("  " + item.reason)
    }
  }
  lines.push("C-19.05 direct seed helper debt is closed; direct seed/raw-sample coupling must stay behind resolver/read-model boundaries.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateDurationArchitectureBoundaryGuard(DEFAULT_ROOT)
  if (result.violations.length || result.legacyDebt.length) {
    console.error(formatDurationArchitectureBoundaryGuardFailure(result))
    process.exit(1)
  }
  console.log(
    "[duration-architecture-boundary-guard] OK: scanned "
    + result.scannedFiles.length
    + " duration boundary files; legacy debt "
    + result.legacyDebt.length
    + " explicitly tracked.",
  )
}
