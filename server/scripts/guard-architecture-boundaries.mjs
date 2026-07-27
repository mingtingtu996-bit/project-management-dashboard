import fs from "fs"
import path from "path"

const DEFAULT_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? path.resolve(process.cwd(), "server")
  : process.cwd()

const BLOCKED_IMPORTER_ROLES = new Set(["services", "jobs", "auth", "middleware", "utils"])
const TARGET_ROUTE_ROLE = "routes"
const REGISTRY_RELATIVE_PATH = path.join("src", "registry", "system-domain-registry.json")
const DEFAULT_DISALLOWED_ARCHITECTURE_UNIT_IMPORTS = [
  {
    importerArchitectureUnit: "学习治理环",
    targetArchitectureUnit: "预测桥",
    reason: "learning_governance_must_not_depend_on_prediction_bridge_runtime_consumers",
  },
  {
    importerArchitectureUnit: "预测桥",
    importerKinds: ["service", "job"],
    targetRegistryKeys: [
      "service:taskWriteChainService",
      "service:planningTableCommitService",
      "service:monthlyPlanGenerationService",
      "service:warningService",
      "service:warningChainService",
      "service:issueWriteChainService",
    ],
    reason: "prediction_bridge_must_not_import_plan_or_action_closure_write_surfaces",
  },
  {
    importerArchitectureUnit: "横切履约",
    importerKinds: ["service", "job"],
    targetRegistryKeys: [
      "service:taskWriteChainService",
      "service:taskCodeTransactionService",
      "service:planningTableCommitService",
      "service:manualDurationCorrectionService",
    ],
    reason: "cross_cut_fulfillment_must_write_through_conditions_obstacles_links_or_governed_adapters",
  },
  {
    importerArchitectureUnit: "验收事实子通道",
    importerKinds: ["service", "job"],
    targetRegistryKeys: [
      "service:taskWriteChainService",
      "service:taskCodeTransactionService",
      "service:planningTableCommitService",
    ],
    allowedImportPairs: [
      "service:acceptanceTaskSyncService->service:taskWriteChainService",
    ],
    reason: "acceptance_fact_subchannel_must_not_bypass_acceptance_pass_governance_into_execution_fact_writers",
  },
]
const LEGACY_ARCHITECTURE_UNIT_IMPORT_DEBT = new Set([])

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (["dist", "node_modules", "__tests__", "tmp"].includes(entry.name)) continue
      files.push(...walk(full))
      continue
    }
    if (!entry.isFile()) continue
    if (!full.endsWith(".ts")) continue
    if (full.endsWith(".test.ts") || full.endsWith(".spec.ts")) continue
    files.push(full)
  }
  return files
}

function stripBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "")
}

function lineFor(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function roleForFile(filePath, srcRoot) {
  const relative = path.relative(srcRoot, filePath).replace(/\\/g, "/")
  const firstSegment = relative.split("/")[0]
  if (relative === "index.ts") return "composition-root"
  return firstSegment || "unknown"
}

function normalizeModuleId(filePath) {
  return path.basename(filePath).replace(/\.ts$/, "").replace(/\.js$/, "")
}

function registryKindForRole(role) {
  if (role === "routes") return "route"
  if (role === "services") return "service"
  if (role === "jobs") return "job"
  return null
}

function registryKeyForFile(filePath, srcRoot) {
  const role = roleForFile(filePath, srcRoot)
  const kind = registryKindForRole(role)
  if (!kind) return null
  return kind + ":" + normalizeModuleId(filePath)
}

function readArchitectureRegistry(serverRoot) {
  const registryPath = path.join(serverRoot, REGISTRY_RELATIVE_PATH)
  if (!fs.existsSync(registryPath)) {
    return {
      registryPath,
      entriesByKey: new Map(),
      disallowedArchitectureUnitImports: DEFAULT_DISALLOWED_ARCHITECTURE_UNIT_IMPORTS,
    }
  }
  const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8").replace(/^\uFEFF/, ""))
  const entries = Array.isArray(parsed.entries) ? parsed.entries : []
  const entriesByKey = new Map()
  for (const entry of entries) {
    if (!entry.kind || !entry.id || !entry.architectureUnit) continue
    entriesByKey.set(entry.kind + ":" + entry.id, entry)
  }
  return {
    registryPath,
    entriesByKey,
    disallowedArchitectureUnitImports: [
      ...DEFAULT_DISALLOWED_ARCHITECTURE_UNIT_IMPORTS,
      ...readRegistryArchitectureBoundaryMatrixRules(parsed),
    ],
  }
}

function readRegistryArchitectureBoundaryMatrixRules(parsed) {
  const rawRules = parsed?.architectureBoundaryMatrix?.disallowedImports
  if (!Array.isArray(rawRules)) return []

  return rawRules
    .filter((rule) => (
      rule
      && (
        typeof rule.importerArchitectureUnit === "string"
        || typeof rule.importerRuntimeScope === "string"
      )
      && typeof rule.reason === "string"
      && (
        typeof rule.targetArchitectureUnit === "string"
        || typeof rule.targetRuntimeScope === "string"
        || (Array.isArray(rule.targetRegistryKeys) && rule.targetRegistryKeys.some((key) => typeof key === "string"))
      )
    ))
    .map((rule) => ({
      importerArchitectureUnit: rule.importerArchitectureUnit,
      importerRuntimeScope: typeof rule.importerRuntimeScope === "string" ? rule.importerRuntimeScope : undefined,
      importerKinds: Array.isArray(rule.importerKinds)
        ? rule.importerKinds.filter((kind) => typeof kind === "string")
        : undefined,
      targetArchitectureUnit: typeof rule.targetArchitectureUnit === "string" ? rule.targetArchitectureUnit : undefined,
      targetRuntimeScope: typeof rule.targetRuntimeScope === "string" ? rule.targetRuntimeScope : undefined,
      targetRegistryKeys: Array.isArray(rule.targetRegistryKeys)
        ? rule.targetRegistryKeys.filter((key) => typeof key === "string")
        : undefined,
      reason: rule.reason,
    }))
}

function resolveImportTarget(importerPath, importPath, srcRoot) {
  const normalizedImportPath = importPath.replace(/\.js$/, ".ts")
  const importerDir = path.dirname(importerPath)
  const base = importPath.startsWith("@/")
    ? path.resolve(srcRoot, normalizedImportPath.slice(2))
    : importPath.startsWith(".")
      ? path.resolve(importerDir, normalizedImportPath)
      : null

  if (!base) return null
  const candidates = [
    base,
    base + ".ts",
    path.join(base, "index.ts"),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? base
}

function extractImports(source) {
  const imports = []
  const cleaned = stripBlockComments(source)
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+(?:type\s+)?[^'"]+?\s+from\s+['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    for (const match of cleaned.matchAll(pattern)) {
      const fullLine = cleaned.slice(cleaned.lastIndexOf("\n", match.index) + 1, cleaned.indexOf("\n", match.index) < 0 ? cleaned.length : cleaned.indexOf("\n", match.index))
      if (fullLine.trim().startsWith("//")) continue
      imports.push({
        importPath: match[1],
        index: match.index,
      })
    }
  }
  return imports
}

function findDisallowedArchitectureUnitImport(importerEntry, targetEntry, rules = DEFAULT_DISALLOWED_ARCHITECTURE_UNIT_IMPORTS) {
  if (!importerEntry?.architectureUnit || !targetEntry?.architectureUnit) return null
  const importPair = importerEntry.kind + ":" + importerEntry.id + "->" + targetEntry.kind + ":" + targetEntry.id
  return rules.find((rule) => (
    !(rule.allowedImportPairs ?? []).includes(importPair)
    &&
    (
      rule.importerArchitectureUnit === importerEntry.architectureUnit
      || rule.importerRuntimeScope === importerEntry.runtimeScope
    )
    && (!(rule.importerKinds ?? []).length || rule.importerKinds.includes(importerEntry.kind))
    && (
      rule.targetArchitectureUnit === targetEntry.architectureUnit
      || rule.targetRuntimeScope === targetEntry.runtimeScope
      || (rule.targetRegistryKeys ?? []).includes(targetEntry.kind + ":" + targetEntry.id)
    )
  )) ?? null
}

function architectureImportDebtKey(importerRegistryKey, targetRegistryKey, importPath) {
  return importerRegistryKey + "|" + targetRegistryKey + "|" + importPath
}

export function evaluateArchitectureBoundaryGuard(root = DEFAULT_ROOT) {
  const serverRoot = fs.existsSync(path.join(root, "src")) ? root : path.join(root, "server")
  const srcRoot = path.join(serverRoot, "src")
  const files = walk(srcRoot)
  if (files.length === 0) {
    throw new Error("[architecture-boundary-guard] No server source files found under " + srcRoot)
  }

  const routeImportViolations = []
  const architectureUnitViolations = []
  const architectureUnitLegacyDebt = []
  const registry = readArchitectureRegistry(serverRoot)
  for (const filePath of files) {
    const importerRole = roleForFile(filePath, srcRoot)
    const importerRegistryKey = registryKeyForFile(filePath, srcRoot)
    const importerRegistryEntry = importerRegistryKey ? registry.entriesByKey.get(importerRegistryKey) : undefined
    const source = fs.readFileSync(filePath, "utf8")
    for (const item of extractImports(source)) {
      const resolvedTarget = resolveImportTarget(filePath, item.importPath, srcRoot)
      if (!resolvedTarget) continue
      const targetRole = roleForFile(resolvedTarget, srcRoot)
      if (targetRole === TARGET_ROUTE_ROLE && BLOCKED_IMPORTER_ROLES.has(importerRole)) {
        routeImportViolations.push({
          filePath,
          line: lineFor(source, item.index),
          importerRole,
          targetRole,
          importPath: item.importPath,
        })
      }

      const targetRegistryKey = registryKeyForFile(resolvedTarget, srcRoot)
      const targetRegistryEntry = targetRegistryKey ? registry.entriesByKey.get(targetRegistryKey) : undefined
      const disallowedArchitectureUnitImport = findDisallowedArchitectureUnitImport(
        importerRegistryEntry,
        targetRegistryEntry,
        registry.disallowedArchitectureUnitImports,
      )
      if (disallowedArchitectureUnitImport) {
        const architectureViolation = {
          reason: "disallowed_architecture_unit_import",
          filePath,
          line: lineFor(source, item.index),
          importPath: item.importPath,
          importerRegistryKey,
          targetRegistryKey,
          importerArchitectureUnit: importerRegistryEntry.architectureUnit,
          targetArchitectureUnit: targetRegistryEntry.architectureUnit,
          importerRuntimeScope: importerRegistryEntry.runtimeScope,
          targetRuntimeScope: targetRegistryEntry.runtimeScope,
          policyReason: disallowedArchitectureUnitImport.reason,
        }
        const debtKey = architectureImportDebtKey(importerRegistryKey, targetRegistryKey, item.importPath)
        if (LEGACY_ARCHITECTURE_UNIT_IMPORT_DEBT.has(debtKey)) {
          architectureUnitLegacyDebt.push({
            ...architectureViolation,
            reason: "legacy_architecture_unit_import_debt",
          })
        } else {
          architectureUnitViolations.push(architectureViolation)
        }
      }
    }
  }

  return {
    files,
    registryPath: registry.registryPath,
    routeImportViolations,
    architectureUnitViolations,
    architectureUnitLegacyDebt,
    violations: [
      ...routeImportViolations,
      ...architectureUnitViolations,
    ],
  }
}

export function formatArchitectureBoundaryGuardFailure(resultOrViolations, cwd = process.cwd()) {
  const routeImportViolations = Array.isArray(resultOrViolations)
    ? resultOrViolations
    : resultOrViolations.routeImportViolations ?? []
  const architectureUnitViolations = Array.isArray(resultOrViolations)
    ? []
    : resultOrViolations.architectureUnitViolations ?? []
  const architectureUnitLegacyDebt = Array.isArray(resultOrViolations)
    ? []
    : resultOrViolations.architectureUnitLegacyDebt ?? []
  const lines = ["[architecture-boundary-guard] Forbidden reverse imports into server/src/routes:"]
  for (const violation of routeImportViolations) {
    lines.push("- " + path.relative(cwd, violation.filePath) + ":" + violation.line + " (" + violation.importerRole + " -> " + violation.targetRole + ")")
    lines.push("  " + violation.importPath)
  }
  if (architectureUnitViolations.length) {
    lines.push("[architecture-boundary-guard] Disallowed v1.4.23.1 architecture unit imports:")
  }
  for (const violation of architectureUnitViolations) {
    const scopeText = violation.importerRuntimeScope && violation.targetRuntimeScope
      ? "; " + violation.importerRuntimeScope + " -> " + violation.targetRuntimeScope
      : ""
    lines.push("- " + path.relative(cwd, violation.filePath) + ":" + violation.line + " (" + violation.importerArchitectureUnit + " -> " + violation.targetArchitectureUnit + scopeText + ")")
    lines.push("  " + violation.importPath + " [" + violation.policyReason + "]")
  }
  if (architectureUnitLegacyDebt.length) {
    lines.push("[architecture-boundary-guard] Legacy architecture unit import debt explicitly registered: " + architectureUnitLegacyDebt.length)
  }
  lines.push("Move shared read-model/cache helpers to services, or add a narrow composition-root adapter. Routes must not be imported by services/jobs/middleware/utils.")
  lines.push("Learning governance may publish candidate/release evidence for prediction consumers, but it must not import prediction bridge runtime consumers directly.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateArchitectureBoundaryGuard(DEFAULT_ROOT)
  if (result.violations.length) {
    console.error(formatArchitectureBoundaryGuardFailure(result))
    process.exit(1)
  }
  console.log(
    "[architecture-boundary-guard] OK: scanned "
    + result.files.length
    + " server source files; legacy architecture-unit debt "
    + result.architectureUnitLegacyDebt.length
    + ".",
  )
}
