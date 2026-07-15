import fs from "fs"
import path from "path"

const DEFAULT_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? path.resolve(process.cwd(), "server")
  : process.cwd()
const PUBLIC_MARK = "route-auth-public-approved"
const ROUTE_PATTERN = /\brouter\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g
const AUTH_PATTERN = /\b(?:authenticate|requireProjectMember|requireProjectEditor|requireProjectOwner|requireCurrentCompanyAdmin|requireCanonicalPlanningTemplateApi|validateIdParam|authLimiter|verifyToken|extractTokenFromRequest|getAuthUserById)\b/
const GLOBAL_AUTH_PATTERN = /router\.use\s*\(\s*authenticate\s*\)/

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
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

function lineFor(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function hasPublicMarkBefore(lines, lineIndex) {
  let inspected = 0
  for (let i = lineIndex - 1; i >= 0 && i >= lineIndex - 3; i--) {
    const trimmed = lines[i]?.trim() ?? ""
    if (!trimmed) continue
    inspected += 1
    if (trimmed.includes(PUBLIC_MARK)) return true
    if (!trimmed.startsWith("//")) return false
    if (inspected >= 3) return false
  }
  return false
}

function findCallEnd(source, openParenIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let i = openParenIndex; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char
      continue
    }
    if (char === "(") depth += 1
    if (char === ")") {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return source.length
}

function scanRouteFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8")
  const lines = source.split(/\r?\n/)
  const hasGlobalAuth = GLOBAL_AUTH_PATTERN.test(source)
  const violations = []

  for (const match of source.matchAll(ROUTE_PATTERN)) {
    const method = match[1]
    const routePath = match[3]
    const line = lineFor(source, match.index)
    if (hasGlobalAuth) continue
    if (hasPublicMarkBefore(lines, line - 1)) continue
    const openParenIndex = source.indexOf("(", match.index)
    const end = findCallEnd(source, openParenIndex)
    const callSource = source.slice(match.index, end + 1)
    if (AUTH_PATTERN.test(callSource)) continue
    violations.push({ filePath, line, method, routePath })
  }

  return violations
}

export function evaluateRouteAuthGuard(root = DEFAULT_ROOT) {
  const serverRoot = fs.existsSync(path.join(root, "src")) ? root : path.join(root, "server")
  const routesDir = path.join(serverRoot, "src", "routes")
  const files = walk(routesDir)
  if (files.length === 0) throw new Error("[route-auth-guard] No route files found under " + routesDir)
  const violations = files.flatMap(scanRouteFile)
  return { files, violations }
}

export function formatRouteAuthGuardFailure(violations, cwd = process.cwd()) {
  const lines = ["[route-auth-guard] Unclassified server routes found:"]
  for (const violation of violations) {
    lines.push("- " + path.relative(cwd, violation.filePath) + ":" + violation.line + " " + violation.method.toUpperCase() + " " + violation.routePath)
  }
  lines.push("Add route/project/company auth middleware, router.use(authenticate), or a nearby // " + PUBLIC_MARK + ": reason comment for intentionally public routes.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateRouteAuthGuard(DEFAULT_ROOT)
  if (result.violations.length) {
    console.error(formatRouteAuthGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[route-auth-guard] OK: scanned " + result.files.length + " route files.")
}
