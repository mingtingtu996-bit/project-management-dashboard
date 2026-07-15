import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const defaultRoot = resolve(scriptDir, '..')
const SRC_DIR_SEGMENT = `${sep}src${sep}`
const SELECTOR_CALL = 'selectConstructionOrganizationScenario'
const HYDRATOR_CALL = 'buildConstructionOrganizationSelectorInputFromProjectFacts'

function isSourceFile(filePath) {
  return /\.(ts|tsx)$/.test(filePath)
}

function shouldSkip(filePath) {
  const normalized = filePath.split(/[\\/]+/).join('/')
  return (
    normalized.includes('/__tests__/')
    || normalized.endsWith('.test.ts')
    || normalized.endsWith('.test.tsx')
    || normalized.endsWith('/constructionOrganizationScenarioSelector.ts')
    || normalized.includes('/node_modules/')
    || normalized.includes('/dist/')
  )
}

function walkFiles(root, files = []) {
  if (!existsSync(root)) return files
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage', 'tmp'].includes(entry.name)) continue
      walkFiles(fullPath, files)
      continue
    }
    if (entry.isFile() && isSourceFile(fullPath) && !shouldSkip(fullPath)) {
      files.push(fullPath)
    }
  }
  return files
}

function lineNumberForIndex(source, index) {
  return source.slice(0, index).split(/\r?\n/).length
}

function hasHydrationNearCall(source, callIndex, callLine) {
  const directCallWindow = source.slice(callIndex, callIndex + 500)
  if (directCallWindow.includes(HYDRATOR_CALL)) return true

  const lines = source.split(/\r?\n/)
  const windowStart = Math.max(0, callLine - 26)
  const windowEnd = Math.min(lines.length, callLine + 3)
  const nearbySource = lines.slice(windowStart, windowEnd).join('\n')
  return nearbySource.includes(HYDRATOR_CALL)
}

function scanFile(filePath, root) {
  const source = readFileSync(filePath, 'utf8')
  const violations = []
  let index = source.indexOf(SELECTOR_CALL)
  while (index >= 0) {
    const before = source.slice(Math.max(0, index - 20), index)
    const after = source.slice(index + SELECTOR_CALL.length, index + SELECTOR_CALL.length + 20)
    const isDeclaration = before.includes('function ') || before.includes('export function ')
    const isCall = after.trimStart().startsWith('(')
    if (isCall && !isDeclaration) {
      const callLine = lineNumberForIndex(source, index)
      if (!hasHydrationNearCall(source, index, callLine)) {
        violations.push({
          kind: 'missing_project_fact_hydration',
          file: filePath,
          relativeFile: relative(root, filePath),
          callLine,
          selector: SELECTOR_CALL,
          requiredHydrator: HYDRATOR_CALL,
        })
      }
    }
    index = source.indexOf(SELECTOR_CALL, index + SELECTOR_CALL.length)
  }
  return violations
}

export function evaluateConstructionOrganizationSelectorHydrationGuard(root = defaultRoot) {
  const absoluteRoot = resolve(root)
  const srcRoot = absoluteRoot.includes(SRC_DIR_SEGMENT)
    ? absoluteRoot
    : join(absoluteRoot, 'src')
  const files = walkFiles(srcRoot)
  const violations = files.flatMap((filePath) => scanFile(filePath, absoluteRoot))
  return {
    files,
    totalCalls: files.reduce((count, filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return count + source.split(SELECTOR_CALL).length - 1
    }, 0),
    violations,
  }
}

export function formatConstructionOrganizationSelectorHydrationGuardFailure(violations, root = defaultRoot) {
  if (violations.length === 0) return 'construction organization selector hydration guard passed'
  return violations.map((violation) => {
    const file = violation.relativeFile ?? relative(resolve(root), violation.file)
    return `${file}:${violation.callLine} calls ${violation.selector} without ${violation.requiredHydrator}`
  }).join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? resolve(process.argv[2]) : defaultRoot
  const result = evaluateConstructionOrganizationSelectorHydrationGuard(root)
  if (result.violations.length > 0) {
    console.error(formatConstructionOrganizationSelectorHydrationGuardFailure(result.violations, root))
    process.exit(1)
  }
  console.log(`construction organization selector hydration guard passed: scanned ${result.files.length} files`)
}
