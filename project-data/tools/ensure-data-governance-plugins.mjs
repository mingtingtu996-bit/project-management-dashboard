#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')
const mcpServerDir = resolve(repoRoot, 'project-data', 'plugins', 'mcp-servers')
const nodeModulesDir = resolve(mcpServerDir, 'node_modules')
const binDir = resolve(nodeModulesDir, '.bin')

const requiredNpmPlugins = [
  {
    packageName: '@supabase/mcp-server-supabase',
    version: '0.8.2',
    commandName: 'mcp-server-supabase',
    envKeys: ['SUPABASE_ACCESS_TOKEN', 'WORKBUDDY_SUPABASE_PROJECT_REF'],
  },
  {
    packageName: '@toolbox-sdk/server',
    version: '1.6.0',
    commandName: 'toolbox',
    envKeys: ['WORKBUDDY_PG_HOST', 'WORKBUDDY_PG_DATABASE', 'WORKBUDDY_PG_USER', 'WORKBUDDY_PG_PASSWORD'],
  },
]

const requiredPythonTools = [
  {
    packageName: 'datacontract-cli',
    version: '1.0.9',
    moduleName: 'datacontract',
  },
  {
    packageName: 'soda-core-postgres',
    version: '3.5.6',
    moduleName: 'soda',
  },
]

function packageJsonPath(packageName) {
  return resolve(nodeModulesDir, ...packageName.split('/'), 'package.json')
}

function readPackageVersion(packageName) {
  const target = packageJsonPath(packageName)
  if (!existsSync(target)) return null
  try {
    return JSON.parse(readFileSync(target, 'utf8')).version ?? null
  } catch {
    return null
  }
}

function commandPath(commandName) {
  const extension = process.platform === 'win32' ? '.cmd' : ''
  return resolve(binDir, `${commandName}${extension}`)
}

function npmStatus() {
  return requiredNpmPlugins.map((plugin) => {
    const installedVersion = readPackageVersion(plugin.packageName)
    const command = commandPath(plugin.commandName)
    return {
      packageName: plugin.packageName,
      requiredVersion: plugin.version,
      installedVersion,
      packageReady: installedVersion === plugin.version,
      command,
      commandReady: existsSync(command),
      envKeys: plugin.envKeys,
      envReady: plugin.envKeys.every((key) => Boolean(process.env[key])),
    }
  })
}

function pythonToolStatus() {
  return requiredPythonTools.map((tool) => {
    const result = spawnSync('python', ['-m', 'pip', 'show', tool.packageName], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    const output = result.stdout || ''
    const versionMatch = output.match(/^Version:\s*(.+)$/m)
    const installedVersion = versionMatch?.[1]?.trim() ?? null
    return {
      packageName: tool.packageName,
      requiredVersion: tool.version,
      installedVersion,
      packageReady: installedVersion === tool.version,
      installCommand: 'python -m pip install -r project-data/plugins/python-tools/requirements.txt',
    }
  })
}

async function ensureInstalled() {
  await mkdir(mcpServerDir, { recursive: true })
  const before = npmStatus()
  const needsInstall = before.some((plugin) => !plugin.packageReady || !plugin.commandReady)

  if (needsInstall) {
    execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      [
        'install',
        '--prefix',
        mcpServerDir,
        '--save-exact',
        ...requiredNpmPlugins.map((plugin) => `${plugin.packageName}@${plugin.version}`),
      ],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    )
  }

  return {
    mcpServerDir,
    installedOrRefreshed: needsInstall,
    npmPlugins: npmStatus(),
    pythonTools: pythonToolStatus(),
    note: 'Secrets and database connection strings are checked only from the current environment; they are not written to repository files.',
    mutationBoundary: 'plugin_install_only_no_db_connection_no_db_mutation_no_runtime_write',
  }
}

console.log(JSON.stringify(await ensureInstalled(), null, 2))
