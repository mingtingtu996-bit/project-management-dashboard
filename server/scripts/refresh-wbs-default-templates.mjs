import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

import dotenv from 'dotenv'
import pg from 'pg'
import ts from 'typescript'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = join(__dirname, '..')

dotenv.config({ path: join(workspaceRoot, '.env') })

const { Client } = pg

const BUILT_IN_TEMPLATE_NAMES = [
  '住宅标准WBS模板',
  '商业综合体WBS模板',
  '工业厂房WBS模板',
  '市政道路WBS模板',
  '高层住宅（地库+塔楼）WBS模板',
  '商业办公综合体（塔楼+裙房）WBS模板',
  '钢结构厂房/仓储WBS模板',
  '公共建筑（学校/医院）WBS模板',
  '学校公共建筑WBS模板',
  '医院公共建筑WBS模板',
]

async function loadBuiltInTemplatePresets() {
  const sourcePath = join(workspaceRoot, 'src', 'services', 'wbsTemplatePresets.ts')
  const sourceCode = readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(sourceCode, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText

  const tempDir = mkdtempSync(join(tmpdir(), 'wbs-presets-'))
  const modulePath = join(tempDir, 'wbsTemplatePresets.mjs')
  writeFileSync(modulePath, transpiled, 'utf8')

  try {
    const module = await import(pathToFileURL(modulePath).href)
    return module.getBuiltInWbsTemplatePresets()
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function getConnectionConfig() {
  if (process.env.DB_CONNECTION_STRING) {
    return {
      connectionString: process.env.DB_CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const dbPassword = process.env.DB_PASSWORD

  if (!supabaseUrl || !dbPassword) {
    throw new Error('Missing SUPABASE_URL or DB_PASSWORD in server/.env')
  }

  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
  if (!match) {
    throw new Error(`Cannot derive project id from SUPABASE_URL: ${supabaseUrl}`)
  }

  return {
    host: `db.${match[1]}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
  }
}

async function main() {
  const client = new Client(getConnectionConfig())
  const files = [join(workspaceRoot, 'migrations', '079_allow_public_wbs_template_type.sql')]
  const presets = await loadBuiltInTemplatePresets()

  await client.connect()

  try {
    for (const file of files) {
      const sql = readFileSync(file, 'utf8')
      await client.query(sql)
      console.log(`Applied ${file}`)
    }

    await client.query(
      `
        DELETE FROM wbs_templates
        WHERE created_by IS NULL
          AND template_name = ANY($1::text[])
      `,
      [BUILT_IN_TEMPLATE_NAMES],
    )

    for (const preset of presets) {
      await client.query(
        `
          INSERT INTO wbs_templates (
            template_name,
            template_type,
            description,
            wbs_nodes,
            is_default,
            created_by
          )
          VALUES ($1, $2, $3, $4::jsonb, TRUE, NULL)
        `,
        [
          preset.templateName,
          preset.templateType,
          preset.description,
          JSON.stringify(preset.nodes),
        ],
      )
    }

    const { rows } = await client.query(
      `
        SELECT template_name, template_type, is_default, created_by
        FROM wbs_templates
        WHERE template_name = ANY($1::text[])
        ORDER BY template_type, template_name
      `,
      [BUILT_IN_TEMPLATE_NAMES],
    )

    console.log(JSON.stringify(rows, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
