import fs from "fs"
import path from "path"

const DEFAULT_WORKSPACE_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "..")
const REGISTRY_RELATIVE_PATH = path.join("server", "src", "registry", "system-domain-registry.json")
const ROUTE_METHOD_PATTERN = /\brouter\.(get|post|put|patch|delete|use)\s*\(\s*(['"`])([^'"`]+)\2/g
const APP_ROUTE_PATTERN = /\bapp\.(use|get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g
const APP_USE_ROUTER_PATTERN = /\bapp\.use\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g
const ROUTE_IMPORT_PATTERN = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+['"]\.\/routes\/([^'"]+)\.js['"]\s*$/gm
const RELATIVE_IMPORT_PATTERN = /\bimport\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g
const METRIC_KEY_PATTERN = /\bmetricKey\s*:\s*(['"`])([^'"`]+)\1/g
const SUPPORTED_REGISTRY_KINDS = new Set(["route", "service", "job", "metric", "migration"])
const GENERATED_FROM = [
  "server/src/index.ts",
  "server/src/services/*.ts",
  "server/src/jobs/*.ts",
  "server/src/services/metricRegistryService.ts",
  "server/migrations/*.sql",
]
const ARCHITECTURE_UNITS = new Set([
  "主执行环：建模",
  "主执行环：计划编制",
  "主执行环：执行事实",
  "主执行环：描述分析",
  "主执行环：行动闭环",
  "学习治理环",
  "预测桥",
  "横切履约",
  "验收事实子通道",
  "底座：组织权限",
  "底座：平台运行观测",
])
const RUNTIME_SCOPES = new Set([
  "business_core",
  "governance",
  "platform_foundation",
  "commercial_foundation",
])

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function normalizeRouteRoot(routeRoot) {
  if (!routeRoot) return routeRoot
  const withoutTrailingSlash = routeRoot.length > 1 ? routeRoot.replace(/\/+$/, "") : routeRoot
  return withoutTrailingSlash === "/api" ? "/api" : withoutTrailingSlash
}

function firstApiSegment(routeRoot) {
  const normalized = normalizeRouteRoot(routeRoot)
  if (!normalized?.startsWith("/api/")) return ""
  return normalized.slice("/api/".length).split("/")[0]
}

function normalizeModuleId(moduleId) {
  return moduleId
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.ts$/, "")
    .replace(/\.js$/, "")
}

function lineFor(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function lineTextFor(source, index) {
  const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1
  const lineEnd = source.indexOf("\n", index)
  return source.slice(lineStart, lineEnd >= 0 ? lineEnd : source.length)
}

function extractMountedRouterIdentifier(source, match) {
  const line = lineTextFor(source, match.index)
  const lineStart = source.lastIndexOf("\n", Math.max(0, match.index - 1)) + 1
  const tail = line.slice((match.index - lineStart) + match[0].length)
  const normalizedTail = tail.replace(/\/\/.*$/, "").trim()
  if (!normalizedTail.startsWith(",")) return null
  if (!/^,\s*[A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*\s*\)?\s*;?\s*$/.test(normalizedTail)) return null
  const identifiers = [...normalizedTail.matchAll(/[A-Za-z_$][\w$]*/g)].map((item) => item[0])
  return identifiers.at(-1) ?? null
}

function resolveWorkspaceRoot(root) {
  const absoluteRoot = path.resolve(root)
  if (fs.existsSync(path.join(absoluteRoot, "server", "src", "index.ts"))) return absoluteRoot
  if (fs.existsSync(path.join(absoluteRoot, "src", "index.ts"))) return path.resolve(absoluteRoot, "..")
  return absoluteRoot
}

function walkTsFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (["dist", "node_modules", "__tests__", "tmp"].includes(entry.name)) continue
      files.push(...walkTsFiles(full))
      continue
    }
    if (!entry.isFile()) continue
    if (!full.endsWith(".ts")) continue
    if (full.endsWith(".test.ts") || full.endsWith(".spec.ts")) continue
    files.push(full)
  }
  return files.sort()
}

function walkSqlFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkSqlFiles(full))
      continue
    }
    if (entry.isFile() && full.endsWith(".sql")) files.push(full)
  }
  return files.sort()
}

function readIndex(serverRoot) {
  const indexPath = path.join(serverRoot, "src", "index.ts")
  if (!fs.existsSync(indexPath)) throw new Error("[system-registry-guard] Missing server/src/index.ts under " + serverRoot)
  return { indexPath, source: fs.readFileSync(indexPath, "utf8") }
}

function collectRouteImports(serverRoot, indexSource) {
  const imports = new Map()
  for (const match of indexSource.matchAll(ROUTE_IMPORT_PATTERN)) {
    const identifier = match[1]
    const modulePath = match[2]
    const routeFilePath = path.join(serverRoot, "src", "routes", modulePath + ".ts")
    imports.set(identifier, { identifier, modulePath, routeFilePath })
  }
  return imports
}

function collectAbsoluteRouterRoutes(routeImport) {
  if (!fs.existsSync(routeImport.routeFilePath)) return []
  const source = fs.readFileSync(routeImport.routeFilePath, "utf8")
  const routes = []
  for (const match of source.matchAll(ROUTE_METHOD_PATTERN)) {
    const routePath = match[3]
    if (!routePath.startsWith("/api")) continue
    routes.push({
      kind: "route",
      id: normalizeModuleId(routeImport.modulePath),
      routeRoot: normalizeRouteRoot(routePath),
      sourceFile: routeImport.routeFilePath,
      line: lineFor(source, match.index),
    })
  }
  return routes
}

function collectRoutes(serverRoot) {
  const { indexPath, source } = readIndex(serverRoot)
  const routeImports = collectRouteImports(serverRoot, source)
  const registrations = []

  for (const match of source.matchAll(APP_ROUTE_PATTERN)) {
    const routePath = match[3]
    const routerIdentifier = extractMountedRouterIdentifier(source, match) ?? ""
    if (!routePath.startsWith("/api")) continue
    const importedRoute = routerIdentifier ? routeImports.get(routerIdentifier) : undefined
    if (!importedRoute && match[1] === "use") continue
    registrations.push({
      kind: "route",
      id: importedRoute ? normalizeModuleId(importedRoute.modulePath) : firstApiSegment(routePath),
      routeRoot: normalizeRouteRoot(routePath),
      sourceFile: indexPath,
      line: lineFor(source, match.index),
    })
  }

  for (const match of source.matchAll(APP_USE_ROUTER_PATTERN)) {
    const routerIdentifier = match[1]
    if (!routeImports.has(routerIdentifier)) continue
    registrations.push(...collectAbsoluteRouterRoutes(routeImports.get(routerIdentifier)))
  }

  return collapseCodeEntries(registrations)
}

function collectSourceEntries(serverRoot, kind, dirName) {
  const baseDir = path.join(serverRoot, "src", dirName)
  return walkTsFiles(baseDir).map((filePath) => ({
    kind,
    id: normalizeModuleId(filePath),
    sourceFile: filePath,
  }))
}

function collectMetricEntries(serverRoot) {
  const sourceFile = path.join(serverRoot, "src", "services", "metricRegistryService.ts")
  if (!fs.existsSync(sourceFile)) return []
  const source = fs.readFileSync(sourceFile, "utf8")
  return [...source.matchAll(METRIC_KEY_PATTERN)].map((match) => ({
    kind: "metric",
    id: match[2],
    sourceFile,
    line: lineFor(source, match.index),
  }))
}

function collectMigrationEntries(serverRoot) {
  return walkSqlFiles(path.join(serverRoot, "migrations")).map((sourceFile) => ({
    kind: "migration",
    id: path.basename(sourceFile, ".sql"),
    sourceFile,
  }))
}

function collapseCodeEntries(entries) {
  const grouped = new Map()
  for (const entry of entries) {
    const key = registryKey(entry)
    const group = grouped.get(key) ?? []
    group.push(entry)
    grouped.set(key, group)
  }

  return [...grouped.entries()].map(([, group]) => {
    const locations = group
      .map((entry) => ({
        routeRoot: entry.routeRoot,
        sourceFile: entry.sourceFile,
        line: entry.line,
      }))
      .sort((a, b) => (
        String(a.routeRoot ?? "").localeCompare(String(b.routeRoot ?? ""))
        || String(a.sourceFile ?? "").localeCompare(String(b.sourceFile ?? ""))
        || Number(a.line ?? 0) - Number(b.line ?? 0)
      ))
    const first = group[0]
    const routeRoots = [...new Set(locations.map((item) => item.routeRoot).filter(Boolean))].sort()
    return {
      ...first,
      ...(routeRoots.length ? { routeRoot: routeRoots[0], routeRoots } : {}),
      sourceFile: locations[0]?.sourceFile ?? first.sourceFile,
      line: locations[0]?.line ?? first.line,
      sourceLocations: locations,
    }
  }).sort((a, b) => registryKey(a).localeCompare(registryKey(b)))
}

function collectCodeRegistry(workspaceRoot) {
  const serverRoot = path.join(workspaceRoot, "server")
  const routes = collectRoutes(serverRoot)
  const services = collectSourceEntries(serverRoot, "service", "services")
  const jobs = collectSourceEntries(serverRoot, "job", "jobs")
  const metrics = collectMetricEntries(serverRoot)
  const migrations = collectMigrationEntries(serverRoot)
  return collapseCodeEntries([...routes, ...services, ...jobs, ...metrics, ...migrations])
}

function unitAndScopeForRoute(entry) {
  const id = entry.id
  const routeRoot = entry.routeRoot ?? ""
  if (/^auth|members|invitations|workspace|transfer-owner/.test(id)) {
    return ["底座：组织权限", "platform_foundation"]
  }
  if (/^(jobs|health|livez|readyz|status-dictionary|client-errors|performance-reports)$/.test(id)) {
    return ["底座：平台运行观测", "platform_foundation"]
  }
  if (/algorithm-seeds|governance|duration-context-governance|duration-accuracy/.test(id) || routeRoot.includes("/api/admin/")) {
    return ["学习治理环", "governance"]
  }
  if (/duration-suggestions|critical-paths|schedule-acceleration|project-climate/.test(id)) {
    return ["预测桥", "business_core"]
  }
  if (/project-materials|construction-drawings|drawing|certificate|pre-milestone|pre-milestones/.test(id)) {
    return ["横切履约", "business_core"]
  }
  if (/^acceptance/.test(id)) {
    return ["验收事实子通道", "business_core"]
  }
  if (/dashboard|reports|analytics|metrics|health-score|data-quality|risk-statistics|progress-deviation/.test(id)) {
    return ["主执行环：描述分析", "business_core"]
  }
  if (/risks|issues|warnings|reminders|notifications|weekly-digest|change-logs|deletion-retention/.test(id)) {
    return ["主执行环：行动闭环", "business_core"]
  }
  if (/tasks|task-|participant-units|milestone|responsibility/.test(id)) {
    return ["主执行环：执行事实", "business_core"]
  }
  if (/wbs|planning|baseline|monthly-plan/.test(id)) {
    return ["主执行环：计划编制", "business_core"]
  }
  return ["主执行环：建模", "business_core"]
}

function unitAndScopeForService(entry) {
  const id = entry.id
  if (id === "commercialTransactionService") {
    return ["底座：组织权限", "commercial_foundation"]
  }
  if (/^(algorithm|durationContextPolicy|durationContext|.*PolicyReplay.*|.*Governance.*|.*Calibration.*|.*ShadowReplay.*|policy.*Release|v14Asset|standardWorkDurationSeed|regionalClimateRuleCandidate)/.test(id)) {
    return ["学习治理环", "governance"]
  }
  if (/^(durationSuggestion|durationInputAssembler|taskDurationForecast|projectCriticalPath|projectRemainingDurationForecast|scheduleAcceleration|durationAlgorithmAccuracy|projectClimate|weatherForecast|workCalendarForecast)/.test(id)) {
    return ["预测桥", "business_core"]
  }
  if (/^(material|drawing|certificate|preMilestone|templateWriteSurfaceLegacyScopeSanitizer)/.test(id)) {
    return ["横切履约", "business_core"]
  }
  if (/^acceptance/.test(id)) {
    return ["验收事实子通道", "business_core"]
  }
  if (/^(jobRuntime|migrationRunner|realtimeServer|readModelWarmup|requestBudget|supabaseService|dbService|schemaDrift|migrationSafety|statusDictionary|officialHoliday|deletionRetention|boundedStaleCache|httpsRuntimeBoundary|pdfRenderPool|runtimeCredentialBoundary|runtimeHealthService)/.test(id)) {
    return ["底座：平台运行观测", "platform_foundation"]
  }
  if (/^(auth|workspace|company|member|permission|session|jwt|role|invitationAcceptance)/.test(id)) {
    return ["底座：组织权限", "platform_foundation"]
  }
  if (/^(progressDeviation|projectHealth|responsibilityInsight|projectExecutionSummary|projectDailySnapshot|projectTrendAnalytics|metric|dataQuality|taskAttribution|notificationAnalytics)/.test(id)) {
    return ["主执行环：描述分析", "business_core"]
  }
  if (/^(risk|issue|warning|notification|reminder|todo|changeAudit)/.test(id)) {
    return ["主执行环：行动闭环", "business_core"]
  }
  if (/^(task|planningTable|planningSnapshot|baseline|monthlyPlan|wbs|constructionDependencyRule|constructionRhythm|executionGate|planSnapshot)/.test(id)) {
    return ["主执行环：计划编制", "business_core"]
  }
  if (/^(participant|projectScheduleState|manualDurationCorrection|statusDerivation|transactionInsert)/.test(id)) {
    return ["主执行环：执行事实", "business_core"]
  }
  return ["主执行环：建模", "business_core"]
}

function unitAndScopeForJob(entry) {
  const id = entry.id
  if (/algorithm|Policy|Calibration|Learning|Replay|Governance|AutoPublish|forecastResidualOverlay|standardWorkDurationSeed|warningImpactSignal/.test(id)) {
    return ["学习治理环", "governance"]
  }
  if (/Weather|Climate/.test(id)) {
    return ["预测桥", "business_core"]
  }
  if (/Retention|Holiday/.test(id)) {
    return ["底座：平台运行观测", "platform_foundation"]
  }
  if (/riskStatistics|criticalPath|responsibility|planningDraft|projectProductivity/.test(id)) {
    return ["主执行环：描述分析", "business_core"]
  }
  return ["主执行环：行动闭环", "business_core"]
}

function inferAssignment(entry) {
  if (entry.kind === "route") return unitAndScopeForRoute(entry)
  if (entry.kind === "service") return unitAndScopeForService(entry)
  if (entry.kind === "job") return unitAndScopeForJob(entry)
  if (entry.kind === "metric") return ["主执行环：描述分析", "business_core"]
  if (entry.kind === "migration") return ["底座：平台运行观测", "platform_foundation"]
  return ["主执行环：建模", "business_core"]
}

function buildGeneratedRegistryEntry(entry) {
  const [architectureUnit, runtimeScope] = inferAssignment(entry)
  const assignmentReason = entry.kind === "metric"
    ? "generated_from_metric_registry_service_business_truth_definition"
    : entry.kind === "migration"
      ? "generated_from_server_migration_inventory_platform_schema_change"
      : "generated_by_v14232a_heuristic_requires_review_for_low_confidence_edges"
  const templateEntry = {
    kind: entry.kind,
    id: entry.id,
    architectureUnit,
    runtimeScope,
    assignmentReason,
  }
  if (runtimeScope === "business_core") {
    templateEntry.production_readiness_source = "docs/plans/v1.4.23.1-A体系收口台账与验收门禁矩阵.md#C-13"
  }
  return templateEntry
}

export function buildRegistryTemplate(root = DEFAULT_WORKSPACE_ROOT) {
  const workspaceRoot = resolveWorkspaceRoot(root)
  const entries = collectCodeRegistry(workspaceRoot)
    .map(buildGeneratedRegistryEntry)
    .sort((a, b) => registryKey(a).localeCompare(registryKey(b)))
  return {
    generatedFrom: GENERATED_FROM,
    architectureUnitSource: "docs/plans/v1.4.23.1体系收口台账与验收门禁矩阵.md#4.7.1",
    runtimeScopeNote: "runtimeScope is a coarse registry tag; architectureUnit remains the v1.4.23.1 §4.7.1 source of truth.",
    entries,
    deprecation_registry: [
      {
        deprecated_surface: "legacy scope dimensions route and objects",
        replacement_surface: "range-tree / engineering objects",
        forbidden_import_or_route_pattern: "(scope-dimensions|zone_object_id|professional_object_id|project_scope_dimensions)",
        deletion_migration_ref: "v1.4.23.1 C-03 / v1.4.23.2 7.3",
        scan_test_ref: "systemRegistryGuard",
      },
      {
        deprecated_surface: "legacy ai duration and schedule naming",
        replacement_surface: "duration governance / schedule forecast surfaces",
        forbidden_import_or_route_pattern: "(ai-duration|ai-schedule)",
        deletion_migration_ref: "v1.4.23.2 3.3 / 7.3",
        scan_test_ref: "systemRegistryGuard",
      },
    ],
  }
}

function readRegistry(workspaceRoot) {
  const registryPath = path.join(workspaceRoot, REGISTRY_RELATIVE_PATH)
  if (!fs.existsSync(registryPath)) {
    throw new Error("[system-registry-guard] Missing " + registryPath)
  }
  const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8").replace(/^\uFEFF/, ""))
  const entries = Array.isArray(parsed.entries) ? parsed.entries : []
  const deprecations = Array.isArray(parsed.deprecation_registry)
    ? parsed.deprecation_registry
    : Array.isArray(parsed.deprecations)
      ? parsed.deprecations.map(normalizeDeprecationEntry)
      : []
  return {
    registryPath,
    raw: parsed,
    generatedFrom: Array.isArray(parsed.generatedFrom) ? parsed.generatedFrom : [],
    entries,
    deprecations,
  }
}

function registryKey(entry) {
  return `${entry.kind}:${entry.id}`
}

function normalizeDeprecationEntry(entry) {
  return {
    deprecated_surface: entry.deprecated_surface ?? entry.deprecatedSurface,
    replacement_surface: entry.replacement_surface ?? entry.replacementSurface,
    forbidden_import_or_route_pattern: entry.forbidden_import_or_route_pattern ?? entry.forbiddenImportOrRoutePattern,
    deletion_migration_ref: entry.deletion_migration_ref ?? entry.deletionMigrationRef,
    scan_test_ref: entry.scan_test_ref ?? entry.scanTestRef,
  }
}

function validateRegistryEntries(entries) {
  const violations = []
  const entriesByKey = new Map()
  for (const entry of entries) {
    const key = registryKey(entry)
    const groupedEntries = entriesByKey.get(key) ?? []
    groupedEntries.push(entry)
    entriesByKey.set(key, groupedEntries)
  }
  for (const [key, groupedEntries] of entriesByKey) {
    if (groupedEntries.length > 1) {
      violations.push({ reason: "duplicate_registry_key", key, entries: groupedEntries })
    }
  }
  for (const entry of entries) {
    if (!SUPPORTED_REGISTRY_KINDS.has(entry.kind)) {
      violations.push({ reason: "invalid_kind", entry })
    }
    if (!entry.id) {
      violations.push({ reason: "missing_id", entry })
    }
    if (!ARCHITECTURE_UNITS.has(entry.architectureUnit)) {
      violations.push({ reason: "invalid_architecture_unit", entry })
    }
    if (!RUNTIME_SCOPES.has(entry.runtimeScope)) {
      violations.push({ reason: "invalid_runtime_scope", entry })
    }
    if (entry.runtimeScope === "business_core" && !entry.production_readiness_source) {
      violations.push({ reason: "missing_production_readiness_source", entry })
    }
  }
  return violations
}

function buildRegistryDiff(codeEntries, declaredEntries) {
  const declaredKeys = new Set(declaredEntries.map(registryKey))
  const codeKeys = new Set(codeEntries.map(registryKey))
  return {
    additions: codeEntries
      .filter((entry) => !declaredKeys.has(registryKey(entry)))
      .map(buildGeneratedRegistryEntry)
      .sort((a, b) => registryKey(a).localeCompare(registryKey(b))),
    removals: declaredEntries
      .filter((entry) => !codeKeys.has(registryKey(entry)))
      .sort((a, b) => registryKey(a).localeCompare(registryKey(b))),
  }
}

function reviewedOwnershipSignature(entry) {
  return JSON.stringify({
    architectureUnit: entry.architectureUnit,
    runtimeScope: entry.runtimeScope,
    production_readiness_source: entry.production_readiness_source ?? null,
    assignmentReason: entry.assignmentReason ?? null,
  })
}

function collapseReviewedRegistryEntries(entries) {
  const grouped = new Map()
  for (const entry of entries) {
    const key = registryKey(entry)
    const group = grouped.get(key) ?? []
    group.push(entry)
    grouped.set(key, group)
  }
  const collapsed = new Map()
  for (const [key, group] of grouped) {
    const signatures = new Set(group.map(reviewedOwnershipSignature))
    if (signatures.size > 1) {
      throw new Error(`[system-registry-guard] Conflicting reviewed ownership declarations for ${key}`)
    }
    collapsed.set(key, group[0])
  }
  return collapsed
}

export function buildReconciledSystemRegistry(root = DEFAULT_WORKSPACE_ROOT) {
  const workspaceRoot = resolveWorkspaceRoot(root)
  const declaredRegistry = readRegistry(workspaceRoot)
  const codeEntries = collectCodeRegistry(workspaceRoot)
  const reviewedEntries = collapseReviewedRegistryEntries(declaredRegistry.entries)
  const staleEntries = [...reviewedEntries.values()].filter((entry) => (
    !codeEntries.some((codeEntry) => registryKey(codeEntry) === registryKey(entry))
  ))
  if (staleEntries.length) {
    throw new Error(
      `[system-registry-guard] Refusing to reconcile ${staleEntries.length} stale declarations; deprecate or remove them explicitly first.`,
    )
  }
  const entries = codeEntries.map((entry) => (
    reviewedEntries.get(registryKey(entry)) ?? buildGeneratedRegistryEntry(entry)
  )).sort((a, b) => registryKey(a).localeCompare(registryKey(b)))
  return {
    ...declaredRegistry.raw,
    generatedFrom: GENERATED_FROM,
    entries,
  }
}

function validateDeprecationEntries(deprecations) {
  const violations = []
  for (const entry of deprecations) {
    if (!entry.deprecated_surface) violations.push({ reason: "missing_deprecated_surface", entry })
    if (!entry.replacement_surface) violations.push({ reason: "missing_replacement_surface", entry })
    if (!entry.forbidden_import_or_route_pattern) violations.push({ reason: "missing_forbidden_import_or_route_pattern", entry })
    if (!entry.deletion_migration_ref) violations.push({ reason: "missing_deletion_migration_ref", entry })
    if (!entry.scan_test_ref) violations.push({ reason: "missing_scan_test_ref", entry })
  }
  return violations
}

function buildUnknownViolations(codeEntries, declaredEntries) {
  const declaredKeys = new Set(declaredEntries.map(registryKey))
  return codeEntries
    .filter((entry) => !declaredKeys.has(registryKey(entry)))
    .map((entry) => ({
      reason: "unknown_registry_entry",
      kind: entry.kind,
      id: entry.id,
      routeRoot: entry.routeRoot,
      sourceFile: entry.sourceFile,
      line: entry.line,
    }))
    .sort((a, b) => registryKey(a).localeCompare(registryKey(b)))
}

function buildStaleViolations(codeEntries, declaredEntries) {
  const codeKeys = new Set(codeEntries.map(registryKey))
  return declaredEntries
    .filter((entry) => !codeKeys.has(registryKey(entry)))
    .map((entry) => ({
      reason: "stale_registry_entry",
      kind: entry.kind,
      id: entry.id,
      architectureUnit: entry.architectureUnit,
      runtimeScope: entry.runtimeScope,
    }))
    .sort((a, b) => registryKey(a).localeCompare(registryKey(b)))
}

function resolveImportTarget(importerPath, importPath) {
  if (!importPath.startsWith(".")) return null
  const importerDir = path.dirname(importerPath)
  const base = path.resolve(importerDir, importPath.replace(/\.js$/, ".ts"))
  const candidates = [
    base,
    base + ".ts",
    path.join(base, "index.ts"),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? base
}

function collectRelativeImports(workspaceRoot) {
  const srcRoot = path.join(workspaceRoot, "server", "src")
  const files = walkTsFiles(srcRoot)
  const imports = []
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8")
    for (const match of source.matchAll(RELATIVE_IMPORT_PATTERN)) {
      const resolvedTarget = resolveImportTarget(filePath, match[1])
      imports.push({
        kind: "import",
        importPath: match[1],
        resolvedTarget,
        sourceFile: filePath,
        line: lineFor(source, match.index),
      })
    }
  }
  return imports
}

function buildDeprecationViolations(workspaceRoot, codeEntries, deprecations) {
  const imports = collectRelativeImports(workspaceRoot)
  const violations = []
  for (const deprecation of deprecations) {
    const patternText = deprecation.forbidden_import_or_route_pattern
    if (!patternText) continue
    const pattern = new RegExp(patternText)
    for (const entry of codeEntries) {
      const routeRoots = entry.routeRoots ?? [entry.routeRoot ?? ""]
      for (const routeRoot of routeRoots) {
        if (entry.kind === "route" && (pattern.test(entry.id) || pattern.test(routeRoot))) {
          const location = (entry.sourceLocations ?? []).find((item) => item.routeRoot === routeRoot)
          violations.push({
            reason: "deprecated_live_route",
            deprecatedSurface: deprecation.deprecated_surface,
            pattern: patternText,
            kind: "route",
            id: entry.id,
            routeRoot,
            sourceFile: location?.sourceFile ?? entry.sourceFile,
            line: location?.line ?? entry.line,
          })
        }
      }
    }
    for (const item of imports) {
      const target = item.resolvedTarget ? path.relative(workspaceRoot, item.resolvedTarget).replace(/\\/g, "/") : ""
      if (pattern.test(item.importPath) || pattern.test(target)) {
        violations.push({
          reason: "deprecated_live_import",
          deprecatedSurface: deprecation.deprecated_surface,
          pattern: patternText,
          kind: "import",
          importPath: item.importPath,
          resolvedTarget: target,
          sourceFile: item.sourceFile,
          line: item.line,
        })
      }
    }
  }
  return violations.sort((a, b) => `${a.deprecatedSurface}:${a.kind}:${a.id ?? a.importPath}`.localeCompare(`${b.deprecatedSurface}:${b.kind}:${b.id ?? b.importPath}`))
}

export function evaluateSystemRegistryGuard(root = DEFAULT_WORKSPACE_ROOT) {
  const workspaceRoot = resolveWorkspaceRoot(root)
  const declaredRegistry = readRegistry(workspaceRoot)
  const codeEntries = collectCodeRegistry(workspaceRoot)
  const registryValidationViolations = validateRegistryEntries(declaredRegistry.entries)
  const deprecationRegistryValidationViolations = validateDeprecationEntries(declaredRegistry.deprecations)
  const unknownViolations = buildUnknownViolations(codeEntries, declaredRegistry.entries)
  const staleViolations = buildStaleViolations(codeEntries, declaredRegistry.entries)
  const deprecationViolations = buildDeprecationViolations(workspaceRoot, codeEntries, declaredRegistry.deprecations)
  const registryDiff = buildRegistryDiff(codeEntries, declaredRegistry.entries)
  return {
    workspaceRoot,
    registryPath: declaredRegistry.registryPath,
    registry: {
      entries: codeEntries,
      declaredEntries: declaredRegistry.entries,
      deprecations: declaredRegistry.deprecations,
      generatedFrom: declaredRegistry.generatedFrom,
    },
    registryDiff,
    registryValidationViolations,
    deprecationRegistryValidationViolations,
    unknownViolations,
    staleViolations,
    deprecationViolations,
    violations: [
      ...registryValidationViolations,
      ...deprecationRegistryValidationViolations,
      ...unknownViolations,
      ...staleViolations,
      ...deprecationViolations,
    ],
  }
}

export function formatSystemRegistryGuardFailure(result, cwd = process.cwd()) {
  const lines = ["[system-registry-guard] Registry violations found:"]
  for (const violation of result.registryValidationViolations) {
    if (violation.reason === "duplicate_registry_key") {
      lines.push("- duplicate registry key " + violation.key + " declared " + violation.entries.length + " times")
    } else {
      lines.push("- invalid registry entry: " + JSON.stringify(violation.entry) + " (" + violation.reason + ")")
    }
  }
  for (const violation of result.deprecationRegistryValidationViolations) {
    lines.push("- invalid deprecation registry entry: " + JSON.stringify(violation.entry) + " (" + violation.reason + ")")
  }
  for (const violation of result.unknownViolations) {
    lines.push("- unknown " + violation.kind + " " + violation.id + " at " + path.relative(cwd, violation.sourceFile ?? "") + (violation.line ? ":" + violation.line : ""))
  }
  for (const violation of result.staleViolations) {
    lines.push("- stale " + violation.kind + " " + violation.id + " declared in registry but not found in code")
  }
  for (const violation of result.deprecationViolations) {
    lines.push("- deprecated " + violation.kind + " consumer for " + violation.deprecatedSurface + " at " + path.relative(cwd, violation.sourceFile ?? "") + (violation.line ? ":" + violation.line : ""))
  }
  lines.push("Regenerate the code-derived inventory, assign each entry to v1.4.23.1 §4.7.1, or remove deprecated live consumers.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  if (process.argv.includes("--print-registry-template")) {
    console.log(JSON.stringify(buildRegistryTemplate(resolveWorkspaceRoot(DEFAULT_WORKSPACE_ROOT)), null, 2))
    process.exit(0)
  }
  if (process.argv.includes("--print-registry-diff")) {
    const result = evaluateSystemRegistryGuard(DEFAULT_WORKSPACE_ROOT)
    console.log(JSON.stringify(result.registryDiff, null, 2))
    process.exit(0)
  }
  if (process.argv.includes("--write-registry")) {
    const workspaceRoot = resolveWorkspaceRoot(DEFAULT_WORKSPACE_ROOT)
    const registryPath = path.join(workspaceRoot, REGISTRY_RELATIVE_PATH)
    const reconciled = buildReconciledSystemRegistry(workspaceRoot)
    fs.writeFileSync(registryPath, JSON.stringify(reconciled, null, 2) + "\n", "utf8")
    console.log("[system-registry-guard] Reconciled " + reconciled.entries.length + " unique registry entries at " + registryPath)
    process.exit(0)
  }
  const result = evaluateSystemRegistryGuard(DEFAULT_WORKSPACE_ROOT)
  if (result.violations.length) {
    console.error(formatSystemRegistryGuardFailure(result))
    process.exit(1)
  }
  console.log(
    "[system-registry-guard] OK: "
    + result.registry.entries.filter((entry) => entry.kind === "route").length
    + " routes, "
    + result.registry.entries.filter((entry) => entry.kind === "service").length
    + " services, "
    + result.registry.entries.filter((entry) => entry.kind === "job").length
    + " jobs, "
    + result.registry.entries.filter((entry) => entry.kind === "metric").length
    + " metrics, and "
    + result.registry.entries.filter((entry) => entry.kind === "migration").length
    + " migrations assigned.",
  )
}
