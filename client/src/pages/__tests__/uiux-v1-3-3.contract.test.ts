import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'

const repoRoot = (() => {
  const candidates = [process.cwd(), join(process.cwd(), 'client')]
  const root = candidates.find((candidate) => existsSync(join(candidate, 'src')))
  if (!root) throw new Error('Unable to locate client/src')
  return root
})()

function listSourceFiles() {
  const srcRoot = join(repoRoot, 'src')
  const result: string[] = []

  function walk(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue
      const entryPath = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
      } else if (entry.isFile() && /\.(tsx|ts|css)$/.test(entry.name)) {
        result.push(entryPath)
      }
    }
  }

  walk(srcRoot)
  return result
}

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

function collectViolations(pattern: RegExp, files = listSourceFiles()) {
  return files.flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    const matches = source.match(pattern)
    if (!matches) return []
    return [`${relative(repoRoot, filePath).replace(/\\/g, '/')}: ${matches.join(', ')}`]
  })
}

function normalizedRelative(filePath: string) {
  return relative(repoRoot, filePath).replace(/\\/g, '/')
}

const migratedDialogFiles = [
  'src/components/ChangePasswordDialog.tsx',
  'src/components/ConflictResolutionModal.tsx',
  'src/components/EditProfileDialog.tsx',
  'src/components/LoginDialog.tsx',
  'src/components/monitoring/FeedbackModal.tsx',
  'src/pages/PreMilestones/components/CertificateDetailDrawer.tsx',
  'src/pages/PreMilestones/components/ConditionsDialog.tsx',
  'src/pages/PreMilestones/components/MilestoneDialog.tsx',
  'src/pages/WBSTemplates/components/ApplyModal.tsx',
  'src/pages/WBSTemplates/components/CreateModal.tsx',
  'src/pages/WBSTemplates/components/EditModal.tsx',
  'src/pages/WBSTemplates/components/PreviewModal.tsx',
  'src/pages/planning/BaselinePage.tsx',
]

describe('v1.3.3 UI/UX source contract', () => {
  it('keeps legacy focus, disabled opacity, and scale interaction tokens out', () => {
    expect(collectViolations(/focus:(?:ring-|outline-none|border-|opacity)|disabled:opacity-(?:30|60)|hover:scale-/g)).toEqual([])
  })

  it('keeps the real overlap gate wired into npm scripts', () => {
    expect(read('../package.json')).toContain('"verify:uiux-overlap"')
    expect(read('../scripts/verify-uiux-overlap.mjs')).toContain('details:not([open])')
    expect(read('../scripts/verify-uiux-overlap.mjs')).toContain('data-overlap-ignore')
  })

  it('prevents the Gantt batch bar from covering content when nothing is selected', () => {
    const source = read('src/pages/GanttViewFilters.tsx')
    expect(source).toContain('if (selectedCount === 0)')
    expect(source).toContain('return null')
  })

  it('does not increase naked HEX debt and keeps legacy card classes out of business code', () => {
    const files = listSourceFiles()
    const hexDebt = collectViolations(
      /#[0-9A-Fa-f]{3,8}\b/g,
      files.filter((file) => !file.endsWith('chartPalette.ts') && normalizedRelative(file) !== 'src/index.css'),
    )
    const businessFiles = files.filter((file) => normalizedRelative(file) !== 'src/index.css')
    const legacyCardDebt = collectViolations(/card-unified|card-l1|card-l2|card-l3/g, businessFiles)
    const localMetricCardDebt = collectViolations(
      /function\s+MetricCard|const\s+MetricCard/g,
      businessFiles.filter((file) => normalizedRelative(file) !== 'src/components/ui/metric-card.tsx'),
    )

    expect(hexDebt).toEqual([])
    expect(legacyCardDebt).toEqual([])
    expect(localMetricCardDebt).toEqual([])
  })

  it('keeps migrated dialogs on the shared Radix dialog primitive', () => {
    const fixedOverlayPattern = /fixed\s+inset-(?:0|y-0)[^"`']*z-50|role="dialog"|aria-modal="true"/

    migratedDialogFiles.forEach((file) => {
      const source = read(file)
      expect(source, file).toContain('DialogContent')
      expect(source, file).not.toMatch(fixedOverlayPattern)
    })
  })
})
