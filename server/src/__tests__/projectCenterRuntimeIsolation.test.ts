import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { readWbsTemplateGenerationImplementationSource } from './helpers/wbsTemplateGenerationSource.js'

const workspaceRoot = resolve(__dirname, '..', '..', '..')
const PROJECT_CENTER_PATH = /project-(?:data|evidence|search|testing|ui)[\\/]/
const RUNTIME_EXTENSIONS = new Set(['.json', '.sh', '.ts', '.tsx', '.yaml', '.yml'])

function listRuntimeFiles(relativePath: string): string[] {
  const absolutePath = resolve(workspaceRoot, relativePath)
  if (!existsSync(absolutePath)) return []
  if (!statSync(absolutePath).isDirectory()) return [absolutePath]

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = `${relativePath}/${entry.name}`
    if (entry.isDirectory()) return listRuntimeFiles(child)
    return RUNTIME_EXTENSIONS.has(extname(entry.name)) ? [resolve(workspaceRoot, child)] : []
  })
}

describe('project center production runtime isolation', () => {
  it('keeps project centers out of product runtime sources and deployment configuration', () => {
    const files = [
      ...listRuntimeFiles('server/src/jobs'),
      ...listRuntimeFiles('server/src/routes'),
      ...listRuntimeFiles('server/src/seeds'),
      ...listRuntimeFiles('server/src/services'),
      ...listRuntimeFiles('client/src'),
      resolve(workspaceRoot, 'server/src/index.ts'),
      resolve(workspaceRoot, 'server/Dockerfile'),
      resolve(workspaceRoot, 'client/Dockerfile'),
      resolve(workspaceRoot, 'deploy/docker-compose.lighthouse.yml'),
      resolve(workspaceRoot, 'scripts/deploy-lighthouse-server.sh'),
      resolve(workspaceRoot, '.github/workflows/deploy.yml'),
    ]

    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return PROJECT_CENTER_PATH.test(source)
        ? [file.slice(workspaceRoot.length + 1).replaceAll('\\', '/')]
        : []
    })

    expect(violations).toEqual([])
  })

  it('keeps public-project shadow calibration outside API, worker and runtime registry surfaces', () => {
    const runtimePaths = [
      'server/src/jobs/publicProjectShadowCalibrationJob.ts',
      'server/src/services/publicProjectShadowCalibrationService.ts',
      'server/src/services/publicProjectShadowManifestService.ts',
    ]
    const jobsRoute = readFileSync(resolve(workspaceRoot, 'server/src/routes/jobs.ts'), 'utf8')
    const registry = readFileSync(resolve(workspaceRoot, 'server/src/registry/system-domain-registry.json'), 'utf8')

    expect(runtimePaths.filter((path) => existsSync(resolve(workspaceRoot, path)))).toEqual([])
    expect(jobsRoute).not.toContain('publicProjectShadowCalibrationJob')
    expect(registry).not.toContain('publicProjectShadowCalibrationJob')
    expect(registry).not.toContain('publicProjectShadowCalibrationService')
    expect(registry).not.toContain('publicProjectShadowManifestService')
  })

  it('uses stable external source identifiers instead of repository paths in runtime lineage', () => {
    const generationService = readWbsTemplateGenerationImplementationSource(resolve(workspaceRoot, 'server'))
    const buildingPatternSeed = readFileSync(
      resolve(workspaceRoot, 'server/src/seeds/v1474BuildingPatternSeed.ts'),
      'utf8',
    )

    expect(generationService).toContain('REAL_PLAN_SKELETON_SOURCE_IDS')
    expect(generationService).not.toContain('REAL_PLAN_SKELETON_EVIDENCE_REFS')
    expect(buildingPatternSeed).toContain('evidenceRef:')
    expect(buildingPatternSeed).not.toMatch(PROJECT_CENTER_PATH)
  })
})
