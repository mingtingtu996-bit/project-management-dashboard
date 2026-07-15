import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)))

export function resolveEvidencePath(path: string): string {
  if (isAbsolute(path)) return path

  const normalizedPath = path.replace(/\\/g, '/')
  const workspacePath = resolve(workspaceRoot, path)
  if (normalizedPath.startsWith('project-testing/') || normalizedPath.startsWith('artifacts/')) {
    return workspacePath
  }
  if (existsSync(path)) return resolve(path)
  return workspacePath
}

export function readJsonFile<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(resolveEvidencePath(path), 'utf8').replace(/^\uFEFF/, '')) as T
}

export function writeJsonFile(path: string, data: unknown): void {
  const outputPath = resolveEvidencePath(path)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}
