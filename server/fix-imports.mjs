// Fix .ts imports in TypeScript source files -> use .js for compilation
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const srcDir = join(process.cwd(), 'src')
const exts = ['.ts', '.tsx']

function getFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...getFiles(full))
    } else if (exts.includes(extname(full))) {
      files.push(full)
    }
  }
  return files
}

// Match: import ... from '...something.ts' or export ... from '...something.ts'
// Don't match: already .js, node_modules, or http://
function fixImports(content) {
  return content.replace(
    /((?:import|export)\s+(?:(?:type|typeof)\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)?(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s*(?:from\s+)?|await import\()['"]([^'"]*)\.ts['"]/g,
    (match, prefix, path) => {
      // Don't touch node_modules or http paths
      if (path.startsWith('node_modules') || path.startsWith('http')) return match
      return match.replace(/\.ts(['"])$/, '.js$1')
    }
  )
}

let fixed = 0
for (const file of getFiles(srcDir)) {
  const content = readFileSync(file, 'utf8')
  const newContent = fixImports(content)
  if (newContent !== content) {
    writeFileSync(file, newContent, 'utf8')
    console.log(`Fixed: ${file.replace(srcDir, '')}`)
    fixed++
  }
}

console.log(`\nTotal files fixed: ${fixed}`)
