import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const EXCLUDED_DIRS = new Set(["node_modules", "dist", "coverage", "tmp", "__tests__", "test", "tests"])
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"])

const PRODUCT_SURFACE_ROOTS = [
  "client/src",
  "server/src/routes",
]

const LEGACY_AI_DURATION_ROOTS = [
  "client/src",
  "server/src/index.ts",
  "server/src/routes",
  "server/src/services",
  "server/src/jobs",
  "server/src/scripts",
]

const PRODUCT_AI_LABEL_PATTERN = /\b(?:AI|GPT|LLM)\b|助手|generate-ai|ai-assistant|ai_helper/
const LEGACY_AI_DURATION_PATTERN = /\/api\/ai-duration|\/api\/ai-schedule|\bAIDuration(?:Estimate|Service)?\b|\baiDuration(?:Router|Service)?\b|\bAISchedule\b|\baiSchedule(?:Router)?\b|AI工期|AI\s+(?:duration|schedule)/i

function workspaceRoot() {
  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, "server", "src"))) return cwd
  if (fs.existsSync(path.join(cwd, "src")) && path.basename(cwd) === "server") return path.resolve(cwd, "..")
  return cwd
}

function toPosix(relativePath) {
  return relativePath.replace(/\\/g, "/")
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return []
  const stat = fs.statSync(rootDir)
  if (stat.isFile()) return SOURCE_EXTENSIONS.has(path.extname(rootDir)) ? [rootDir] : []

  const files = []
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx") || entry.name.endsWith(".spec.ts")) continue
    files.push(fullPath)
  }
  return files.sort()
}

function scanFiles(root, roots, pattern, kind) {
  const seen = new Set()
  const violations = []

  for (const relativeRoot of roots) {
    for (const filePath of walkFiles(path.join(root, relativeRoot))) {
      const relativePath = toPosix(path.relative(root, filePath))
      if (seen.has(relativePath)) continue
      seen.add(relativePath)

      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        if (!pattern.test(line)) continue
        violations.push({
          kind,
          file: relativePath,
          line: index + 1,
          text: line.trim(),
        })
      }
    }
  }

  return violations
}

export function evaluateAiNamingGuard(root = workspaceRoot()) {
  const productLabelViolations = scanFiles(
    root,
    PRODUCT_SURFACE_ROOTS,
    PRODUCT_AI_LABEL_PATTERN,
    "product-ai-label",
  )
  const legacyDurationViolations = scanFiles(
    root,
    LEGACY_AI_DURATION_ROOTS,
    LEGACY_AI_DURATION_PATTERN,
    "legacy-ai-duration-surface",
  )
  return [...productLabelViolations, ...legacyDurationViolations]
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const violations = evaluateAiNamingGuard()
  if (violations.length > 0) {
    console.error("[ai-naming-guard] Forbidden AI-facing product labels or legacy AI duration surfaces found:")
    for (const violation of violations) {
      console.error(`- ${violation.kind}: ${violation.file}:${violation.line} ${violation.text}`)
    }
    process.exit(1)
  }
  console.log("[ai-naming-guard] OK: no forbidden AI-facing product labels or legacy AI duration surfaces found.")
}
