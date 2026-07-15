import fs from "fs"
import path from "path"

const DEFAULT_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "..")

const SOURCE_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".yml", ".yaml"])
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "coverage", "tmp", "__tests__", "test", "tests"])

const DEFAULT_SCAN_TARGETS = [
  "docs/plans/v1.4.23总集成与全链路验收体系执行方案.md",
  "docs/plans/v1.4.23.1体系收口台账与验收门禁矩阵.md",
  "docs/plans/v1.4.23.1-A体系收口台账与验收门禁矩阵.md",
  "docs/plans/v1.4.23.2后端商业化补强与AI可维护体系执行方案.md",
  "client/src",
  "server/src",
  "server/scripts",
  ".github/workflows",
  "package.json",
  "server/package.json",
  "client/package.json",
]

const CLAIM_PATTERN = /production-ready|production ready|整体\s*ready|商业化[^，。；\n|]*全绿|后端整体[^，。；\n|]*商业化产品可用/iu
const V14231_AUTHORITY_PATTERN = /v1\.4\.23\.1|v1\.4\.23\.1-A|v14231|C-13|4\.7\.05|v14231CapabilityStatusContract|capability status/iu
const STATUS_BOUNDARY_PATTERN = /needs-gating|not-ready|display-only|降级|解锁|判定|状态|边界|门禁|证据|当前|条件|按|仅|只|不得|不能|不可|不等于|禁止|未|非|仍需/iu
const TECHNICAL_REFERENCE_PATTERN = /guard[:_-]?production-ready-claims|production-ready\s+claims\s+guard|production-ready-claims-guard|production-ready\s+wording|productionReadyClaimsGuard|production_ready_guard|claims\.production_ready_guard/iu
const AUTHORITY_SOURCE_PATHS = new Set([
  "server/src/services/v14231CapabilityReadinessService.ts",
])

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function toPosix(relativePath) {
  return relativePath.replace(/\\/g, "/")
}

function walkFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return []
  const stat = fs.statSync(targetPath)
  if (stat.isFile()) return SOURCE_EXTENSIONS.has(path.extname(targetPath)) ? [targetPath] : []

  const files = []
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue
    const fullPath = path.join(targetPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
    files.push(fullPath)
  }
  return files
}

function collectScanFiles(root, scanTargets = DEFAULT_SCAN_TARGETS) {
  const files = []
  const seen = new Set()
  for (const target of scanTargets) {
    const fullPath = path.resolve(root, target)
    for (const filePath of walkFiles(fullPath)) {
      const key = path.resolve(filePath)
      if (seen.has(key)) continue
      seen.add(key)
      files.push(filePath)
    }
  }
  return files.sort()
}

function contextFor(lines, index) {
  return lines
    .slice(Math.max(0, index - 8), Math.min(lines.length, index + 9))
    .join("\n")
}

function hasAuthority(context, relativePath) {
  return V14231_AUTHORITY_PATTERN.test(context)
    || /docs\/plans\/v1\.4\.23\.1(?:-A)?/.test(relativePath)
}

function isClaimGuarded(context, relativePath) {
  return hasAuthority(context, relativePath) && STATUS_BOUNDARY_PATTERN.test(context)
}

function isTechnicalReference(line, relativePath) {
  return AUTHORITY_SOURCE_PATHS.has(relativePath) || TECHNICAL_REFERENCE_PATTERN.test(line)
}

function violationReason(context, relativePath) {
  const reasons = []
  if (!hasAuthority(context, relativePath)) {
    reasons.push("missing_v14231_c13_authority")
  }
  if (!STATUS_BOUNDARY_PATTERN.test(context)) {
    reasons.push("missing_status_or_degradation_boundary")
  }
  return reasons.join("+") || "unguarded_production_ready_claim"
}

export function evaluateProductionReadyClaimsGuard(root = DEFAULT_ROOT, options = {}) {
  const scanTargets = options.scanTargets ?? DEFAULT_SCAN_TARGETS
  const files = collectScanFiles(root, scanTargets)
  const violations = []
  let claimCount = 0

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8")
    const lines = source.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (!CLAIM_PATTERN.test(line)) return
      const context = contextFor(lines, index)
      const relativePath = toPosix(path.relative(root, filePath))
      if (isTechnicalReference(line, relativePath)) return
      claimCount += 1
      if (isClaimGuarded(context, relativePath)) return
      violations.push({
        filePath,
        relativePath,
        line: index + 1,
        claim: line.trim(),
        reason: violationReason(context, relativePath),
      })
    })
  }

  return {
    scannedFileCount: files.length,
    claimCount,
    violations,
  }
}

export function formatProductionReadyClaimsGuardFailure(violations, cwd = process.cwd()) {
  const lines = [
    "[production-ready-claims-guard] Unguarded production-ready claims found:",
  ]
  for (const violation of violations) {
    lines.push(`- ${path.relative(cwd, violation.filePath)}:${violation.line} (${violation.reason})`)
    lines.push(`  ${violation.claim}`)
  }
  lines.push("Reference v1.4.23.1-A / C-13 and include a needs-gating/not-ready/display-only degradation or unlock boundary, or remove the claim.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateProductionReadyClaimsGuard(DEFAULT_ROOT)
  if (result.violations.length) {
    console.error(formatProductionReadyClaimsGuardFailure(result.violations))
    process.exit(1)
  }
  console.log(`[production-ready-claims-guard] OK: scanned ${result.scannedFileCount} files and checked ${result.claimCount} guarded claims.`)
}
