#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const requiredSupabaseEnv = ['SUPABASE_ACCESS_TOKEN', 'WORKBUDDY_SUPABASE_PROJECT_REF']
const requiredPostgresEnv = [
  'WORKBUDDY_PG_HOST',
  'WORKBUDDY_PG_PORT',
  'WORKBUDDY_PG_DATABASE',
  'WORKBUDDY_PG_USER',
  'WORKBUDDY_PG_PASSWORD',
]

const requiredPythonTools = [
  { packageName: 'datacontract-cli', requiredVersion: '1.0.9' },
  { packageName: 'soda-core-postgres', requiredVersion: '3.5.6' },
]

const localPythonToolVenv = `project-data/plugins/python-tools/.venv/${process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'}`

function pathOf(relativePath) {
  return resolve(repoRoot, relativePath)
}

function readText(relativePath) {
  return readFileSync(pathOf(relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath))
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'failed', message, ...details }, null, 2))
  process.exit(1)
}

function isUsableEnvValue(value) {
  if (!value) return false
  if (value === 'set-outside-repo') return false
  if (/^\$\{[^}]+\}$/.test(value)) return false
  return true
}

function assertNoSecrets(text, label) {
  const forbiddenPatterns = [
    /sbp_[A-Za-z0-9_=-]+/,
    /sb_secret_[A-Za-z0-9_=-]+/,
    /postgres(?:ql)?:\/\/[^"'\s]+/i,
    /service[_-]?role/i,
    /password\s*[:=]\s*(?!set-outside-repo|\$\{)[^"'\s]+/i,
  ]
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) fail(`${label} appears to contain a secret or live database URL`)
  }
}

function parseToolboxStatements(toolboxText) {
  const lines = toolboxText.split(/\r?\n/)
  const statements = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*statement:\s*\|\s*$/.test(lines[index])) continue
    const statementLines = []
    index += 1
    while (index < lines.length && /^\s{6,}\S?/.test(lines[index])) {
      statementLines.push(lines[index].replace(/^\s{6}/, ''))
      index += 1
    }
    index -= 1
    statements.push(statementLines.join('\n').trim())
  }
  return statements
}

function assertReadOnlySql(statement, label) {
  const normalized = statement.replace(/--.*$/gm, '').trim()
  if (!/^select\b/i.test(normalized)) fail(`${label} must start with SELECT`, { statement })
  const forbidden = /\b(insert|update|delete|merge|alter|drop|truncate|create|grant|revoke|call|execute|copy)\b/i
  if (forbidden.test(normalized)) fail(`${label} contains a forbidden mutation keyword`, { statement })
}

function npmPackageStatus(packageName, requiredVersion, commandName) {
  const packageJsonPath = pathOf(`project-data/plugins/mcp-servers/node_modules/${packageName}/package.json`)
  let installedVersion = null
  if (existsSync(packageJsonPath)) {
    try {
      installedVersion = JSON.parse(readFileSync(packageJsonPath, 'utf8')).version ?? null
    } catch {
      installedVersion = null
    }
  }
  const commandPath = pathOf(`project-data/plugins/mcp-servers/node_modules/.bin/${commandName}${process.platform === 'win32' ? '.cmd' : ''}`)
  return {
    packageName,
    requiredVersion,
    installedVersion,
    packageReady: installedVersion === requiredVersion,
    commandReady: existsSync(commandPath),
  }
}

function pythonExecutables() {
  return [
    process.env.WORKBUDDY_DATA_PYTHON || null,
    existsSync(pathOf(localPythonToolVenv)) ? pathOf(localPythonToolVenv) : null,
    'python',
  ].filter(Boolean)
}

function pythonSource(executable) {
  if (executable === pathOf(localPythonToolVenv)) return localPythonToolVenv
  if (executable === 'python') return 'python'
  return 'WORKBUDDY_DATA_PYTHON'
}

function pythonToolStatus(tool) {
  let checkedWith = null
  let installedVersion = null
  for (const executable of pythonExecutables()) {
    const result = spawnSync(executable, ['-m', 'pip', 'show', tool.packageName], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    if (result.error) continue
    checkedWith = pythonSource(executable)
    const output = result.stdout || ''
    const versionMatch = output.match(/^Version:\s*(.+)$/m)
    installedVersion = versionMatch?.[1]?.trim() ?? null
    if (installedVersion === tool.requiredVersion) break
  }

  return {
    packageName: tool.packageName,
    requiredVersion: tool.requiredVersion,
    installedVersion,
    packageReady: installedVersion === tool.requiredVersion,
    checkedWith,
    installCommand: `${localPythonToolVenv} -m pip install -r project-data/plugins/python-tools/requirements.txt`,
  }
}

function main() {
  const mcpConfigPath = 'project-data/plugins/mcp-config/workbuddy-data.mcp.example.json'
  const toolboxPath = 'project-data/plugins/mcp-config/toolbox-postgres-readonly.tools.example.yaml'
  const envExamplePath = 'project-data/plugins/mcp-config/env.example'
  const requirementsPath = 'project-data/plugins/python-tools/requirements.txt'

  const mcpConfigText = readText(mcpConfigPath)
  const toolboxText = readText(toolboxPath)
  const envExampleText = readText(envExamplePath)
  const requirementsText = readText(requirementsPath)
  assertNoSecrets(mcpConfigText, mcpConfigPath)
  assertNoSecrets(toolboxText, toolboxPath)
  assertNoSecrets(envExampleText, envExamplePath)

  const mcpConfig = readJson(mcpConfigPath)
  const supabaseServer = mcpConfig.mcpServers?.['workbuddy-supabase-readonly']
  const toolboxServer = mcpConfig.mcpServers?.['workbuddy-toolbox-postgres-readonly']
  if (!supabaseServer) fail('Supabase read-only MCP server config is missing')
  if (!toolboxServer) fail('Toolbox read-only MCP server config is missing')
  if (!supabaseServer.args?.includes('--read-only')) fail('Supabase MCP server must include --read-only')
  if (!supabaseServer.args?.includes('--project-ref')) fail('Supabase MCP server must include --project-ref')

  const statements = parseToolboxStatements(toolboxText)
  if (statements.length === 0) fail('Toolbox config must contain at least one SQL statement')
  statements.forEach((statement, index) => assertReadOnlySql(statement, `Toolbox SQL statement ${index + 1}`))

  for (const tool of requiredPythonTools) {
    if (!requirementsText.includes(`${tool.packageName}==${tool.requiredVersion}`)) {
      fail(`Python tool requirement is not pinned: ${tool.packageName}`, { requiredVersion: tool.requiredVersion })
    }
  }

  const npmPlugins = [
    npmPackageStatus('@supabase/mcp-server-supabase', '0.8.2', 'mcp-server-supabase'),
    npmPackageStatus('@toolbox-sdk/server', '1.6.0', 'toolbox'),
  ]
  const pythonTools = requiredPythonTools.map(pythonToolStatus)
  const envReadiness = {
    supabase: Object.fromEntries(requiredSupabaseEnv.map((key) => [key, isUsableEnvValue(process.env[key])])),
    postgres: Object.fromEntries(requiredPostgresEnv.map((key) => [key, isUsableEnvValue(process.env[key])])),
  }

  const npmReady = npmPlugins.every((plugin) => plugin.packageReady && plugin.commandReady)
  const pythonReady = pythonTools.every((tool) => tool.packageReady)
  const envReady = [
    ...Object.values(envReadiness.supabase),
    ...Object.values(envReadiness.postgres),
  ].every(Boolean)

  console.log(JSON.stringify({
    status: 'passed',
    readyForReadonlyDbReview: npmReady && pythonReady && envReady,
    npmReady,
    pythonReady,
    envReady,
    envReadiness,
    npmPlugins,
    pythonTools,
    readOnlySqlStatements: statements.length,
    note: 'Missing environment variables or optional local Python tools do not fail this safety preflight; they only block actual read-only DB review.',
    mutationBoundary: 'read-only preflight only; no database connection or data mutation',
  }, null, 2))
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
