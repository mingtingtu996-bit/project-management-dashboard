import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const RETIRED_OBJECT_TOKENS = [
  "/api/scope-dimensions",
  "/api/ai-duration",
  "/api/ai-schedule",
  "zone_object_id",
  "professional_object_id",
  "scope_dimensions",
  "project_scope_dimensions",
  "legacy_object_type",
  "ai_duration_estimates",
  "reference_duration",
  "ai_duration",
  "ai_adjusted_duration",
]

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".md"])
const SKIPPED_DIRS = new Set(["node_modules", "dist", "coverage", ".git", ".tmp", "tmp"])

const RUNTIME_SURFACE_PREFIXES = [
  "server/src/index.ts",
  "server/src/routes/",
  "server/src/services/",
  "server/src/middleware/",
  "server/src/auth/",
  "server/src/jobs/",
  "server/src/scripts/",
  "client/src/services/",
  "client/src/pages/",
  "client/src/hooks/",
  "client/src/lib/",
]

const CURRENT_CLEANUP_ALLOWLIST = new Set([
  "server/src/services/legacyScopeObjectSanitizer.ts",
  "server/src/services/taskDtoService.ts",
  "server/src/services/algorithmAssetGovernanceProtocolService.ts",
  "server/src/services/v14223CompletionAuditService.ts",
  "server/src/services/v14223RequirementCoverageAuditService.ts",
  "server/src/services/ordinaryBusinessDtoExposureMatrixService.ts",
  "server/src/scripts/check-v1420-legacy-closeout.ts",
  "client/src/services/wbsTemplateGenerationApi.ts",
  "server/scripts/guard-legacy-scope-runtime-surface.mjs",
  "server/scripts/guard-ai-naming.mjs",
  "server/scripts/audit-retired-object-references.mjs",
])

const SEMANTIC_SCOPE_DIMENSION_ALLOWLIST = new Set([
  "server/src/services/standardWorkDurationSeedReplayService.ts",
])

const TOKEN_PATTERNS = RETIRED_OBJECT_TOKENS.map((token) => [
  token,
  token.startsWith("/")
    ? new RegExp(escapeRegExp(token), "g")
    : new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(token)}(?![A-Za-z0-9_])`, "g"),
])

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function workspaceRoot() {
  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, "server", "src")) && fs.existsSync(path.join(cwd, "client", "src"))) {
    return cwd
  }
  if (path.basename(cwd) === "server" && fs.existsSync(path.join(cwd, "src"))) {
    return path.resolve(cwd, "..")
  }
  return cwd
}

function toPosix(value) {
  return value.replace(/\\/g, "/")
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return []
  const stat = fs.statSync(rootDir)
  if (stat.isFile()) return SOURCE_EXTENSIONS.has(path.extname(rootDir)) ? [rootDir] : []

  const files = []
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRS.has(entry.name)) continue
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
    files.push(fullPath)
  }
  return files.sort()
}

function lineNumberForIndex(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function isTestPath(relativePath) {
  return relativePath.includes("/__tests__/")
    || /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(relativePath)
}

function isMigrationPath(relativePath) {
  return relativePath.startsWith("server/migrations/") && relativePath.endsWith(".sql")
}

function isDocPath(relativePath) {
  return relativePath.startsWith("docs/") || relativePath.endsWith(".md")
}

function isRuntimeSurfacePath(relativePath) {
  if (isTestPath(relativePath)) return false
  return RUNTIME_SURFACE_PREFIXES.some((prefix) => relativePath === prefix || relativePath.startsWith(prefix))
}

function isRuntimeRiskOccurrence(occurrence) {
  if (!isRuntimeSurfacePath(occurrence.file)) return false
  if (CURRENT_CLEANUP_ALLOWLIST.has(occurrence.file)) return false
  if (SEMANTIC_SCOPE_DIMENSION_ALLOWLIST.has(occurrence.file) && occurrence.token === "scope_dimensions") return false
  return true
}

function classifyOccurrence(occurrence) {
  if (isRuntimeRiskOccurrence(occurrence)) return "runtime_surface"
  if (CURRENT_CLEANUP_ALLOWLIST.has(occurrence.file)) return "guard_or_cleanup"
  if (SEMANTIC_SCOPE_DIMENSION_ALLOWLIST.has(occurrence.file)) return "semantic_context_reference"
  if (isTestPath(occurrence.file)) return "test_contract"
  if (isMigrationPath(occurrence.file)) return "migration_history_or_drop"
  if (isDocPath(occurrence.file)) return "documentation_or_archive"
  if (occurrence.file.startsWith("project-testing/tools/")) return "script_reference"
  if (occurrence.file.startsWith("server/scripts/") || occurrence.file.startsWith("scripts/")) return "script_reference"
  return "unclassified_reference"
}

function classifyRetiredObjectSummary(token, occurrences) {
  const bucketCounts = occurrences.reduce((acc, occurrence) => {
    acc[occurrence.bucket] = (acc[occurrence.bucket] ?? 0) + 1
    return acc
  }, {})
  const runtimeSurfaceCount = bucketCounts.runtime_surface ?? 0

  let disposition = "historical_evidence_only"
  let deletionReadiness = "physical_delete_candidate_after_migration_ledger_review"

  if (runtimeSurfaceCount > 0) {
    disposition = "runtime_surface_reintroduced"
    deletionReadiness = "blocked_runtime_surface_must_be_removed"
  } else if ((bucketCounts.guard_or_cleanup ?? 0) > 0) {
    disposition = "compatibility_guard_retained"
    deletionReadiness = "retain_guard_or_cleanup_shell"
  } else if ((bucketCounts.semantic_context_reference ?? 0) > 0) {
    disposition = "semantic_context_reference_retained"
    deletionReadiness = "retain_semantic_context_or_rename_before_delete"
  } else if ((bucketCounts.unclassified_reference ?? 0) > 0 || (bucketCounts.script_reference ?? 0) > 0) {
    disposition = "needs_manual_classification"
    deletionReadiness = "blocked_until_reference_is_classified"
  }

  return {
    token,
    occurrenceCount: occurrences.length,
    runtimeSurfaceCount,
    buckets: bucketCounts,
    disposition,
    deletionReadiness,
  }
}

function buildRetiredObjectSummaries(occurrences) {
  return RETIRED_OBJECT_TOKENS
    .map((token) => classifyRetiredObjectSummary(
      token,
      occurrences.filter((occurrence) => occurrence.token === token),
    ))
    .filter((summary) => summary.occurrenceCount > 0)
}

export function auditRetiredObjectReferences(root = workspaceRoot()) {
  const occurrences = []

  for (const filePath of walkFiles(root)) {
    const relativePath = toPosix(path.relative(root, filePath))
    const source = fs.readFileSync(filePath, "utf8")
    const lines = source.split(/\r?\n/)
    for (const [token, pattern] of TOKEN_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const line = lineNumberForIndex(source, match.index ?? 0)
        const occurrence = {
          token,
          file: relativePath,
          line,
          text: (lines[line - 1] ?? "").trim(),
        }
        occurrences.push({
          ...occurrence,
          bucket: classifyOccurrence(occurrence),
        })
      }
    }
  }

  const buckets = occurrences.reduce((acc, occurrence) => {
    acc[occurrence.bucket] = (acc[occurrence.bucket] ?? 0) + 1
    return acc
  }, {})
  const runtimeSurface = occurrences.filter((occurrence) => occurrence.bucket === "runtime_surface")
  const unclassifiedReferences = occurrences.filter((occurrence) => occurrence.bucket === "unclassified_reference")
  const objectSummaries = buildRetiredObjectSummaries(occurrences)

  return {
    status: runtimeSurface.length > 0 || unclassifiedReferences.length > 0 ? "fail" : "pass",
    scannedOccurrenceCount: occurrences.length,
    runtimeSurfaceCount: runtimeSurface.length,
    unclassifiedReferenceCount: unclassifiedReferences.length,
    buckets,
    objectSummaries,
    runtimeSurface,
    unclassifiedReferences,
    occurrences,
  }
}

export function formatRetiredObjectReferenceAuditFailure(result) {
  const lines = []
  if ((result.runtimeSurface ?? []).length > 0) {
    lines.push("[retired-object-reference-audit] Retired object references found on runtime surfaces:")
  }
  for (const item of result.runtimeSurface) {
    lines.push(`- ${item.token}: ${item.file}:${item.line} ${item.text}`)
  }
  if ((result.unclassifiedReferences ?? []).length > 0) {
    lines.push("[retired-object-reference-audit] Unclassified retired object references must be moved to cleanup guards, approved diagnostic scripts, semantic context references, tests, migrations, docs, or removed:")
    for (const item of result.unclassifiedReferences) {
      lines.push(`- ${item.token}: ${item.file}:${item.line} ${item.text}`)
    }
  }
  lines.push("Keep retired scope and AI-duration objects in cleanup guards, approved diagnostic scripts, semantic context references, tests, migrations, or docs only; do not reintroduce runtime routes, DTOs, or business readers.")
  return lines.join("\n")
}

export function formatRetiredObjectReferenceAuditSummary(result) {
  const lines = [
    `[retired-object-reference-audit] OK: ${result.scannedOccurrenceCount} retired-object references classified; runtime surface count ${result.runtimeSurfaceCount}.`,
    "[retired-object-reference-audit] Object disposition summary:",
  ]
  for (const summary of result.objectSummaries ?? []) {
    lines.push(
      `- ${summary.token}: ${summary.disposition}; deletionReadiness=${summary.deletionReadiness}; occurrences=${summary.occurrenceCount}; buckets=${JSON.stringify(summary.buckets)}`,
    )
  }
  return lines.join("\n")
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = auditRetiredObjectReferences()
  if (result.status !== "pass") {
    console.error(formatRetiredObjectReferenceAuditFailure(result))
    process.exit(1)
  }
  console.log(formatRetiredObjectReferenceAuditSummary(result))
}
