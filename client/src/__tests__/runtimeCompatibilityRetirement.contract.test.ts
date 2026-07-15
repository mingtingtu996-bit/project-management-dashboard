import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const srcRoot = join(clientRoot, 'src')

function sourcePath(relativePath: string) {
  return join(clientRoot, relativePath)
}

function readSource(relativePath: string) {
  return readFileSync(sourcePath(relativePath), 'utf8')
}

function listRuntimeSources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const absolutePath = join(directory, name)
    if (statSync(absolutePath).isDirectory()) {
      if (name === '__tests__' || name === 'test') return []
      return listRuntimeSources(absolutePath)
    }
    if (!/\.(ts|tsx)$/.test(name) || /\.(test|spec)\.(ts|tsx)$/.test(name)) return []
    return [absolutePath]
  })
}

describe('runtime compatibility retirement', () => {
  it('removes the retired browser-local database and backup stack', () => {
    const retiredSources = [
      'src/lib/localDb.ts',
      'src/lib/backup.ts',
      'src/lib/auditLog.ts',
      'src/lib/dataExport.ts',
      'src/hooks/useAuditLog.ts',
      'src/lib/projectPersistence.ts',
      'src/lib/riskAlert.ts',
      'src/lib/types.ts',
    ]

    expect(retiredSources.filter((relativePath) => existsSync(sourcePath(relativePath)))).toEqual([])
  })

  it('keeps app bootstrap and project initialization authoritative to the API', () => {
    const app = readSource('src/App.tsx')
    const projectInit = readSource('src/hooks/useProjectInit.ts')

    for (const fragment of ['getCachedProjects', 'syncProjectCacheFromApi', 'startAutoBackup', 'userDb', 'generateDeviceId']) {
      expect(app, fragment).not.toContain(fragment)
    }
    expect(app).not.toContain('device_id')
    expect(readSource('src/lib/utils.ts')).not.toContain('generateDeviceId')
    expect(readSource('src/lib/apiClient.ts')).not.toContain('pm_projects')
    expect(readSource('src/lib/browserStorage.ts')).not.toMatch(/auto_backup_|pm_(?:projects|tasks|risks|milestones|audit_logs|sync_queue)|pending_sync_ops|storage_mode|device_id/)
    expect(readSource('src/components/project/wizard/WizardAutoSaveIndicator.tsx')).not.toMatch(/getLocalWizardDraftKey|safeStorageSet|state: 'local'/)
    for (const fragment of ['projectDb', 'cacheProject', "source: 'cache'", 'useTaskProgressFallback', 'buildFallbackTaskProgressSnapshots']) {
      expect(projectInit, fragment).not.toContain(fragment)
    }
  })

  it('uses title as the only task display-name field', () => {
    for (const relativePath of ['src/lib/supabase.ts', 'src/pages/GanttViewTypes.ts']) {
      const source = readSource(relativePath)
      const taskInterfaceStart = source.indexOf('export interface Task {')
      const taskInterfaceEnd = source.indexOf('\n}', taskInterfaceStart)
      expect(taskInterfaceStart, relativePath).toBeGreaterThanOrEqual(0)
      expect(source.slice(taskInterfaceStart, taskInterfaceEnd), relativePath).not.toMatch(/\n\s*name\?:/)
    }

    const violations = listRuntimeSources(srcRoot).flatMap((absolutePath) => {
      const source = readFileSync(absolutePath, 'utf8')
      return source.match(/\b(?:task|selectedTask|patchedTask|precedingTask|depTask|parentTask)\??\.name\b/g)?.map((match) => ({
        file: absolutePath.slice(srcRoot.length + 1),
        match,
      })) ?? []
    })

    expect(violations).toEqual([])
  })
})
