import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const pathOf = (relativePath) => join(repoRoot, relativePath)
const readJson = async (relativePath) => JSON.parse(await readFile(pathOf(relativePath), 'utf8'))

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'failed', message, ...details }, null, 2))
  process.exit(1)
}

function assertExists(relativePath, label = relativePath) {
  if (!existsSync(pathOf(relativePath))) fail(`${label} is missing`, { path: relativePath })
}

async function main() {
  const requiredFiles = [
    'project-ui/README.md',
    'project-ui/skills/workbuddy-ui-implementation/SKILL.md',
    'project-ui/skills/workbuddy-component-state-catalog/SKILL.md',
    'project-ui/matrix/ui-implementation-matrix.json',
    'project-ui/plugins/ui-tool-inventory.json',
    'project-ui/index/source-map.json',
    'project-ui/index/moved-files.json',
    'project-ui/tools/run-ui-dashboard.mjs',
    'project-ui/tools/check-ui-center.mjs',
  ]
  for (const relativePath of requiredFiles) assertExists(relativePath)

  const matrix = await readJson('project-ui/matrix/ui-implementation-matrix.json')
  const sourceMap = await readJson('project-ui/index/source-map.json')
  const toolInventory = await readJson('project-ui/plugins/ui-tool-inventory.json')
  const moved = await readJson('project-ui/index/moved-files.json')
  const packageJson = await readJson('package.json')

  if (matrix.schemaVersion !== 'workbuddy-ui-implementation-matrix.v1') fail('Unexpected UI matrix schema version')
  if (sourceMap.schemaVersion !== 'workbuddy-ui-source-map.v1') fail('Unexpected source map schema version')
  if (toolInventory.schemaVersion !== 'workbuddy-ui-tool-inventory.v1') fail('Unexpected tool inventory schema version')
  if (moved.schemaVersion !== 'workbuddy-ui-moved-files.v1') fail('Unexpected moved-files schema version')

  const commandIds = new Set(matrix.commands.map((command) => command.id))
  const sourceIds = new Set(matrix.authoritativeSources.map((source) => source.id))
  const executionKinds = new Set(['safe', 'local', 'browser', 'external', 'delegated'])
  for (const command of matrix.commands) {
    if (!executionKinds.has(command.execution)) fail(`Command has unknown execution classification: ${command.id}`)
    if (command.successStatus && !['passed', 'review-pending'].includes(command.successStatus)) {
      fail(`Command has unknown success status: ${command.id}`)
    }
  }
  for (const profile of matrix.profiles) {
    for (const sourceId of profile.sourceIds) {
      if (!sourceIds.has(sourceId)) fail(`Profile references unknown source: ${sourceId}`, { profile: profile.id })
    }
    for (const commandId of profile.commandIds) {
      if (!commandIds.has(commandId)) fail(`Profile references unknown command: ${commandId}`, { profile: profile.id })
    }
  }

  for (const source of matrix.authoritativeSources) {
    if (source.movePolicy !== 'moved') assertExists(source.path, `authoritative source ${source.id}`)
  }

  for (const command of matrix.commands) {
    const npmRun = command.command.match(/^npm run ([^ ]+)/)
    if (!npmRun) continue
    const workspaceMatch = command.command.match(/--workspace[= ]([^ ]+)/)
    if (workspaceMatch) {
      const workspacePackage = await readJson(`${workspaceMatch[1]}/package.json`)
      if (!workspacePackage.scripts?.[npmRun[1]]) fail(`Registered workspace npm script is missing: ${npmRun[1]}`)
    } else if (!packageJson.scripts?.[npmRun[1]]) {
      fail(`Registered npm script is missing: ${npmRun[1]}`)
    }
  }

  const generatedMoveRoots = ['project-ui/artifacts/', 'project-ui/references/']
  for (const entry of moved.entries || []) {
    const generatedTarget = generatedMoveRoots.some((prefix) => entry.newPath.startsWith(prefix))
    if (!generatedTarget && (entry.status === 'moved' || entry.status === 'moved-with-junction')) {
      assertExists(entry.newPath, `moved target ${entry.id}`)
    }
  }

  console.log(JSON.stringify({
    status: 'passed',
    message: 'UI center check passed',
    profiles: matrix.profiles.length,
    commands: matrix.commands.length,
    sources: sourceMap.sources.length,
    movedEntries: moved.entries?.length || 0,
  }, null, 2))
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
