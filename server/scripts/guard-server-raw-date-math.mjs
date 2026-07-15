import fs from "fs"
import path from "path"

const DEFAULT_SRC_DIR = fs.existsSync(path.resolve(process.cwd(), "src"))
  ? path.resolve(process.cwd(), "src")
  : path.resolve(process.cwd(), "server", "src")
const MARK = "server-raw-date-math-approved"

const RAW_DAY_MS_PATTERN = /(?:86400000|86_400_000|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|1000\s*\*\s*60\s*\*\s*60\s*\*\s*24|\bDAY_MS\b|\bDAY_IN_MS\b|\bMS_PER_DAY\b)/

const DEFAULT_ALLOWED_PATH_PATTERNS = [
  /(?:^|\/)scheduler\.ts$/,
  /(?:^|\/)auth\/(?:config|http)\.ts$/,
  /(?:^|\/)jobs\/[^/]+\.ts$/,
  /(?:^|\/)utils\/durationDays\.ts$/,
  /(?:^|\/)services\/constructionCalendar\.ts$/,
  /(?:^|\/)services\/highFidelitySyntheticStressService\.ts$/,
  /(?:^|\/)services\/riskIssueWarningRuleRegistry\.ts$/,
  /(?:^|\/)services\/todoTouchpointService\.ts$/,
  /(?:^|\/)services\/weatherForecastImpactService\.ts$/,
  /(?:^|\/)services\/deletionRetentionGovernanceService\.ts$/,
  /(?:^|\/)services\/projectClimateProfileService\.ts$/,
  /(?:^|\/)services\/taskDurationForecastService\.ts$/,
  /(?:^|\/)services\/workflowDomainPolicy\.ts$/,
]

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/")
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (["dist", "node_modules", "__tests__"].includes(entry.name)) continue
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

function isCommentOnly(trimmed) {
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")
}

function stripInlineComment(line) {
  const index = line.indexOf("//")
  return index >= 0 ? line.slice(0, index) : line
}

function hasApprovalMark(lines, index) {
  for (let i = index - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    return trimmed.includes(MARK)
  }
  return false
}

function isAllowedFile(file, srcDir) {
  const relative = normalizePath(path.relative(srcDir, file))
  return DEFAULT_ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(relative))
}

function scan(file, srcDir) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/)
  const issues = []
  let rawDateMathCount = 0
  let approvedCount = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || isCommentOnly(trimmed)) continue

    const code = stripInlineComment(trimmed)
    if (!RAW_DAY_MS_PATTERN.test(code)) continue

    rawDateMathCount++
    if (isAllowedFile(file, srcDir) || hasApprovalMark(lines, i)) {
      approvedCount++
      continue
    }

    issues.push({
      line: i + 1,
      code: trimmed,
      kind: "raw-day-ms",
      message: "unapproved raw millisecond day math in server business code",
    })
  }

  return { issues, rawDateMathCount, approvedCount }
}

export function evaluateServerRawDateMathGuard(srcDir = DEFAULT_SRC_DIR) {
  const files = walk(srcDir)
  if (files.length === 0) throw new Error("[server-raw-date-math-guard] No TypeScript files found under " + srcDir)

  let total = 0
  let allowed = 0
  const violations = []

  for (const file of files) {
    const result = scan(file, srcDir)
    total += result.rawDateMathCount
    allowed += result.approvedCount
    for (const issue of result.issues) violations.push({ filePath: file, ...issue })
  }

  return { files, total, allowed, violations }
}

export function formatServerRawDateMathGuardFailure(violations, cwd = process.cwd()) {
  const lines = ["[server-raw-date-math-guard] Unapproved raw millisecond day math found in server/src:"]
  for (const violation of violations) {
    lines.push("- " + path.relative(cwd, violation.filePath) + ":" + violation.line + " (" + violation.kind + ")")
    lines.push("  " + violation.code)
  }
  lines.push("Use ../utils/durationDays.js helpers, a domain registry helper, or add // eslint-disable-next-line -- " + MARK + " with a documented non-duration reason.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateServerRawDateMathGuard(DEFAULT_SRC_DIR)
  if (result.violations.length) {
    console.error(formatServerRawDateMathGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[server-raw-date-math-guard] OK: scanned " + result.files.length + " server files, " + result.allowed + "/" + result.total + " raw date sites approved.")
}

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}
