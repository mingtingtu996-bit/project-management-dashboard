import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const LEGACY_SCOPE_RUNTIME_TOKENS = [
  "/api/scope-dimensions",
  "zone_object_id",
  "professional_object_id",
  "scope_dimensions",
  "project_scope_dimensions",
  "legacy_object_type",
]

export const RUNTIME_SURFACE_ROOTS = [
  "server/src/routes",
  "server/src/index.ts",
  "server/src/middleware",
  "server/src/auth",
  "server/src/jobs",
  "client/src/services",
  "client/src/pages",
  "client/src/hooks",
  "client/src/lib",
]

export const LEGACY_SCOPE_RUNTIME_ALLOWLIST = new Set([
  "server/src/services/legacyScopeObjectSanitizer.ts",
  "server/src/services/taskDtoService.ts",
  "client/src/services/wbsTemplateGenerationApi.ts",
])

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"])
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "tmp",
  "docs",
  "__tests__",
  "tests",
  "test",
])
const LEGACY_SCOPE_TOKEN_PATTERN = /(?<![A-Za-z0-9_])(zone_object_id|professional_object_id|scope_dimensions|project_scope_dimensions|legacy_object_type)(?![A-Za-z0-9_])/g
const LEGACY_SCOPE_ROUTE_PATTERN = /\/api\/scope-dimensions/g

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

function shouldSkipFileName(entryName) {
  return entryName.endsWith(".test.ts")
    || entryName.endsWith(".test.tsx")
    || entryName.endsWith(".spec.ts")
    || entryName.endsWith(".spec.tsx")
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return []
  const stat = fs.statSync(rootDir)
  if (stat.isFile()) {
    return SOURCE_EXTENSIONS.has(path.extname(rootDir)) ? [rootDir] : []
  }

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
    if (shouldSkipFileName(entry.name)) continue
    files.push(fullPath)
  }
  return files.sort()
}

function maskComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^\\])\/\/.*$/gm, (match, prefix) => `${prefix}${" ".repeat(match.length - prefix.length)}`)
}

function lineNumberForIndex(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

export function evaluateLegacyScopeRuntimeSurfaceGuard(root = workspaceRoot()) {
  const violations = []
  const scannedFiles = []

  for (const relativeRoot of RUNTIME_SURFACE_ROOTS) {
    const absoluteRoot = path.join(root, relativeRoot)
    for (const filePath of walkFiles(absoluteRoot)) {
      const relativePath = toPosix(path.relative(root, filePath))
      scannedFiles.push(relativePath)
      if (LEGACY_SCOPE_RUNTIME_ALLOWLIST.has(relativePath)) continue

      const source = fs.readFileSync(filePath, "utf8")
      const maskedSource = maskComments(source)
      const matches = [
        ...maskedSource.matchAll(LEGACY_SCOPE_ROUTE_PATTERN),
        ...maskedSource.matchAll(LEGACY_SCOPE_TOKEN_PATTERN),
      ]
      for (const match of matches) {
        const token = match[1] ?? match[0]
        const line = lineNumberForIndex(source, match.index ?? 0)
        const lineText = source.split(/\r?\n/)[line - 1] ?? ""
        violations.push({
          token,
          file: relativePath,
          line,
          text: lineText.trim(),
        })
      }
    }
  }

  return {
    scannedFiles: scannedFiles.sort(),
    violations,
  }
}

export function formatLegacyScopeRuntimeSurfaceGuardFailure(violations) {
  const lines = [
    "[legacy-scope-runtime-surface-guard] Forbidden legacy scope runtime surface found:",
  ]
  for (const violation of violations) {
    lines.push(`- ${violation.token}: ${violation.file}:${violation.line} ${violation.text}`)
  }
  lines.push("Use engineering-object runtime fields such as physical_zone_object_id / functional_area_object_id, or route legacy cleanup through the sanitizer allowlist surfaces.")
  return lines.join("\n")
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = evaluateLegacyScopeRuntimeSurfaceGuard()
  if (result.violations.length > 0) {
    console.error(formatLegacyScopeRuntimeSurfaceGuardFailure(result.violations))
    process.exit(1)
  }

  console.log(`[legacy-scope-runtime-surface-guard] OK: scanned ${result.scannedFiles.length} runtime source files.`)
}
