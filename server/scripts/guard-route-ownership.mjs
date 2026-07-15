import fs from "fs"
import path from "path"

const DEFAULT_WORKSPACE_ROOT = fs.existsSync(path.resolve(process.cwd(), "server", "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "..")
const DOC_RELATIVE_PATH = path.join("docs", "plans", "v1.4.23.1体系收口台账与验收门禁矩阵.md")
const ROUTE_METHOD_PATTERN = /\brouter\.(get|post|put|patch|delete|use)\s*\(\s*(['"`])([^'"`]+)\2/g
const APP_ROUTE_PATTERN = /\bapp\.(use|get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g
const APP_USE_ROUTER_PATTERN = /\bapp\.use\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g
const ROUTE_IMPORT_PATTERN = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+['"]\.\/routes\/([^'"]+)\.js['"]\s*$/gm

function pathToFileUrl(filePath) {
  return new URL("file://" + path.resolve(filePath).replace(/\\/g, "/")).href
}

function normalizeRouteRoot(routeRoot) {
  if (!routeRoot) return routeRoot
  const withoutTrailingSlash = routeRoot.length > 1 ? routeRoot.replace(/\/+$/, "") : routeRoot
  return withoutTrailingSlash === "/api" ? "/api" : withoutTrailingSlash
}

function normalizeToken(token) {
  return token
    .trim()
    .replace(/\.js$/, "")
    .replace(/^\.\//, "")
    .toLowerCase()
}

function toKebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase()
}

function firstApiSegment(routeRoot) {
  const normalized = normalizeRouteRoot(routeRoot)
  if (!normalized?.startsWith("/api/")) return ""
  return normalized.slice("/api/".length).split("/")[0]
}

function moduleCandidates(moduleId, routeRoot) {
  const candidates = new Set()
  const normalizedModule = normalizeToken(moduleId)
  if (normalizedModule) {
    candidates.add(normalizedModule)
    candidates.add(toKebabCase(moduleId))
  }
  const apiSegment = firstApiSegment(routeRoot)
  if (apiSegment) candidates.add(normalizeToken(apiSegment))
  return [...candidates].filter(Boolean)
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
  const tail = line.slice((match.index - (source.lastIndexOf("\n", Math.max(0, match.index - 1)) + 1)) + match[0].length)
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

function readIndex(serverRoot) {
  const indexPath = path.join(serverRoot, "src", "index.ts")
  if (!fs.existsSync(indexPath)) throw new Error("[route-ownership-guard] Missing server/src/index.ts under " + serverRoot)
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
      routeRoot: normalizeRouteRoot(routePath),
      moduleId: routeImport.modulePath,
      registeredVia: routeImport.identifier,
      sourceFile: routeImport.routeFilePath,
      line: lineFor(source, match.index),
    })
  }
  return routes
}

function collectIndexRouteRoots(serverRoot) {
  const { indexPath, source } = readIndex(serverRoot)
  const routeImports = collectRouteImports(serverRoot, source)
  const registrations = []

  for (const match of source.matchAll(APP_ROUTE_PATTERN)) {
    const routePath = match[3]
    const routerIdentifier = extractMountedRouterIdentifier(source, match) ?? ""
    if (!routePath.startsWith("/api")) continue

    if (routerIdentifier && routeImports.has(routerIdentifier)) {
      const routeImport = routeImports.get(routerIdentifier)
      registrations.push({
        routeRoot: normalizeRouteRoot(routePath),
        moduleId: routeImport.modulePath,
        registeredVia: routerIdentifier,
        sourceFile: indexPath,
        line: lineFor(source, match.index),
      })
      continue
    }

    if (match[1] !== "use") {
      registrations.push({
        routeRoot: normalizeRouteRoot(routePath),
        moduleId: firstApiSegment(routePath) || routePath,
        registeredVia: "inline_app_" + match[1],
        sourceFile: indexPath,
        line: lineFor(source, match.index),
      })
    }
  }

  for (const match of source.matchAll(APP_USE_ROUTER_PATTERN)) {
    const routerIdentifier = match[1]
    if (!routeImports.has(routerIdentifier)) continue
    registrations.push(...collectAbsoluteRouterRoutes(routeImports.get(routerIdentifier)))
  }

  const seen = new Set()
  return registrations.filter((registration) => {
    const key = [
      registration.routeRoot,
      registration.moduleId,
      registration.registeredVia,
      registration.sourceFile,
      registration.line,
    ].join("|")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.routeRoot.localeCompare(b.routeRoot) || a.moduleId.localeCompare(b.moduleId))
}

function extractOwnershipSection(docSource) {
  const tableStart = docSource.indexOf("| 架构单元 | 节奏 / 治理姿态 |")
  const nextSection = tableStart >= 0 ? docSource.indexOf("### 4.7.2", tableStart) : -1
  if (tableStart < 0) {
    throw new Error("[route-ownership-guard] Could not locate v1.4.23.1 section 4.7.1 ownership matrix.")
  }
  return docSource.slice(tableStart, nextSection >= 0 ? nextSection : docSource.length)
}

function parseOwnershipTokens(docPath) {
  if (!fs.existsSync(docPath)) throw new Error("[route-ownership-guard] Missing " + docPath)
  const section = extractOwnershipSection(fs.readFileSync(docPath, "utf8"))
  const moduleTokens = new Set()
  const wildcardTokens = []
  const routeTokens = new Set()
  const duplicateApprovedRoots = new Set()

  for (const match of section.matchAll(/`([^`]+)`/g)) {
    const rawToken = match[1].trim()
    if (!rawToken || rawToken === "/api/*") continue
    if (rawToken.startsWith("/api/")) {
      routeTokens.add(normalizeRouteRoot(rawToken))
      continue
    }
    if (rawToken.includes("*")) {
      wildcardTokens.push(normalizeToken(rawToken).replace(/\*/g, ""))
      continue
    }
    if (rawToken.includes("/") && !rawToken.startsWith("planning/")) continue
    moduleTokens.add(normalizeToken(rawToken))
    moduleTokens.add(toKebabCase(rawToken))
  }

  for (const match of section.matchAll(/route-ownership-duplicate-approved:\s*`?([^`\s]+)`?/g)) {
    duplicateApprovedRoots.add(normalizeRouteRoot(match[1]))
  }

  return { moduleTokens, wildcardTokens, routeTokens, duplicateApprovedRoots }
}

function isOwned(registration, ownership) {
  const routeRoot = normalizeRouteRoot(registration.routeRoot)
  if (ownership.routeTokens.has(routeRoot)) return true
  const candidates = moduleCandidates(registration.moduleId, routeRoot)
  if (candidates.some((candidate) => ownership.moduleTokens.has(candidate))) return true
  return candidates.some((candidate) => ownership.wildcardTokens.some((prefix) => candidate.startsWith(prefix)))
}

export function evaluateRouteOwnershipGuard(root = DEFAULT_WORKSPACE_ROOT) {
  const workspaceRoot = resolveWorkspaceRoot(root)
  const serverRoot = path.join(workspaceRoot, "server")
  const docPath = path.join(workspaceRoot, DOC_RELATIVE_PATH)
  const registrations = collectIndexRouteRoots(serverRoot)
  const ownership = parseOwnershipTokens(docPath)
  const unownedViolations = registrations
    .filter((registration) => !isOwned(registration, ownership))
    .map((registration) => ({
      ...registration,
      reason: "unowned_route_root",
      candidates: moduleCandidates(registration.moduleId, registration.routeRoot),
    }))
  const registrationsByRoot = new Map()
  for (const registration of registrations) {
    const routeRoot = normalizeRouteRoot(registration.routeRoot)
    if (!registrationsByRoot.has(routeRoot)) registrationsByRoot.set(routeRoot, [])
    registrationsByRoot.get(routeRoot).push(registration)
  }
  const duplicateViolations = []
  for (const [routeRoot, sameRootRegistrations] of registrationsByRoot.entries()) {
    const modules = [...new Set(sameRootRegistrations.map((registration) => registration.moduleId))]
    if (modules.length <= 1) continue
    if (ownership.duplicateApprovedRoots.has(routeRoot)) continue
    duplicateViolations.push({
      routeRoot,
      reason: "duplicate_route_root_without_boundary_note",
      modules,
      registrations: sameRootRegistrations,
      candidates: modules.flatMap((moduleId) => moduleCandidates(moduleId, routeRoot)),
      registeredVia: sameRootRegistrations.map((registration) => registration.registeredVia).join(", "),
      moduleId: modules.join(", "),
      sourceFile: sameRootRegistrations[0].sourceFile,
      line: sameRootRegistrations[0].line,
    })
  }
  const violations = [...unownedViolations, ...duplicateViolations]

  return {
    docPath,
    registrations,
    routeRoots: [...new Set(registrations.map((registration) => registration.routeRoot))],
    violations,
  }
}

export function formatRouteOwnershipGuardFailure(violations, cwd = process.cwd()) {
  const lines = ["[route-ownership-guard] Unowned server API route roots found:"]
  for (const violation of violations) {
    lines.push(
      "- "
      + violation.routeRoot
      + " via "
      + violation.registeredVia
      + " (module "
      + violation.moduleId
      + ", candidates: "
      + violation.candidates.join(", ")
      + ") at "
      + path.relative(cwd, violation.sourceFile)
      + ":"
      + violation.line
    )
  }
  lines.push("Add the route module or exact /api route to v1.4.23.1 section 4.7.1 before registering it in server/src/index.ts.")
  return lines.join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateRouteOwnershipGuard(DEFAULT_WORKSPACE_ROOT)
  if (result.violations.length) {
    console.error(formatRouteOwnershipGuardFailure(result.violations))
    process.exit(1)
  }
  console.log("[route-ownership-guard] OK: scanned " + result.registrations.length + " index-registered API route roots.")
}
