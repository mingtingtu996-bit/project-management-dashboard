import fs from "fs"
import path from "path"

const DEFAULT_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? path.resolve(process.cwd(), "server")
  : process.cwd()

const GOVERNANCE_FILE_PATTERN = /(?:governance|duration-accuracy)\.ts$/
const JWT_ADMIN_FAST_PATH_PATTERN = /isCompanyAdminRole\s*\(\s*req\.user\?\.globalRole\s*\)/g

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

function scanFile(filePath) {
  if (!GOVERNANCE_FILE_PATTERN.test(path.basename(filePath))) return []
  const source = fs.readFileSync(filePath, "utf8")
  const violations = []
  for (const match of source.matchAll(JWT_ADMIN_FAST_PATH_PATTERN)) {
    violations.push({
      filePath,
      line: lineFor(source, match.index ?? 0),
      pattern: match[0],
    })
  }
  return violations
}

export function evaluateGovernanceAdminMembershipGuard(root = DEFAULT_ROOT) {
  const serverRoot = fs.existsSync(path.join(root, "src")) ? root : path.join(root, "server")
  const routesDir = path.join(serverRoot, "src", "routes")
  const files = walk(routesDir)
  if (files.length === 0) throw new Error("[governance-admin-membership-guard] No route files found under " + routesDir)
  const violations = files.flatMap(scanFile)
  return { files, violations }
}

export function formatGovernanceAdminMembershipGuardFailure(violations, cwd = process.cwd()) {
  const lines = ["[governance-admin-membership-guard] Governance routes must not trust JWT globalRole for company-admin authorization:"]
  for (const violation of violations) {
    lines.push("- " + path.relative(cwd, violation.filePath) + ":" + violation.line + " " + violation.pattern)
  }
  lines.push("Use getCurrentCompanyMembership(userId, requestCompanyId) and require membership.role === 'company_admin'.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateGovernanceAdminMembershipGuard(DEFAULT_ROOT)
  if (result.violations.length) {
    console.error(formatGovernanceAdminMembershipGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[governance-admin-membership-guard] OK: scanned " + result.files.length + " route files.")
}
